import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { tmpdir } from "node:os";

const root = process.cwd();
const output = mkdtempSync(join(tmpdir(), "wargus-simulation-scheduler-"));
const fast16Only = process.argv.includes("--fast16-only");

try {
  const compiler = spawnSync(process.execPath, [
    resolve(root, "node_modules/typescript/bin/tsc"),
    "--ignoreConfig",
    "src/simulation/orders.ts",
    "src/wargus/demoScenario.ts",
    "src/wargus/saveGame.ts",
    "src/performance/performanceProfiles.ts",
    "src/performance/runtimePerformance.ts",
    "src/view/hudCommandExecution.ts",
    "--outDir", output,
    "--target", "ES2022",
    "--module", "CommonJS",
    "--moduleResolution", "Node",
    "--skipLibCheck",
    "--esModuleInterop",
    "--resolveJsonModule",
    "--verbatimModuleSyntax", "false",
    "--ignoreDeprecations", "6.0",
    "--noEmitOnError", "true"
  ], { cwd: root, encoding: "utf8" });
  if (compiler.status !== 0) {
    throw new Error(`Scheduler fixture compile failed:\n${compiler.stdout}${compiler.stderr}`);
  }
  copyFileSync(resolve(root, "src/wargus/scoutProvenance.mjs"), join(output, "wargus/scoutProvenance.mjs"));

  const require = createRequire(import.meta.url);
  const manifest = JSON.parse(readFileSync(resolve(root, "public/wargus/manifest.json"), "utf8"));
  const map = manifest.maps.find((candidate) => candidate.path === "maps/ladder/Garden of war BNE.pud.smp.gz");
  if (!map?.setupJson) throw new Error("Garden of War setup is missing from the manifest.");
  const setup = JSON.parse(readFileSync(resolve(root, "public/wargus", map.setupJson), "utf8"));
  Object.defineProperty(globalThis, "location", { configurable: true, value: { search: "?smoke=1&demoSeed=ai-staged-pressure" } });

  const demo = require(join(output, "wargus/demoScenario.js"));
  const worldModule = require(join(output, "simulation/world.js"));
  const orders = require(join(output, "simulation/orders.js"));
  const profiles = require(join(output, "performance/performanceProfiles.js"));
  const runtimePerformance = require(join(output, "performance/runtimePerformance.js"));
  const hudCommands = require(join(output, "view/hudCommandExecution.js"));
  const pathfinding = require(join(output, "simulation/pathfinding.js"));
  const saveGame = require(join(output, "wargus/saveGame.js"));
  const originalFindPath = pathfinding.findPath;
  const findPathObservations = [];
  pathfinding.findPath = (searchWorld, unit, targetX, targetY) => {
    const path = originalFindPath(searchWorld, unit, targetX, targetY);
    findPathObservations.push({ unitId: unit.id, targetX, targetY, path });
    return path;
  };
  const demoSetup = demo.applyFixedBrowserDemoSetup(map, setup);
  const world = worldModule.createInitialWorld(
    map,
    manifest.units,
    demoSetup,
    manifest.upgrades,
    manifest.missiles,
    manifest.spells,
    manifest.allowRules,
    manifest.dependencies,
    manifest.buttons,
    manifest.engineSettings,
    manifest.aiDefinitions,
    manifest.unitDatabase,
    manifest.tilesets,
    manifest.animations
  );
  demo.applyFixedBrowserDemoWorldPresentation(map, world);
  const pristineSave = saveGame.exportSavedGame(world, { x: 0, y: 0, zoom: 1 });

  const unitDefinition = world.unitDefinitions.find((candidate) => candidate.id === "unit-grunt");
  if (!unitDefinition) throw new Error("Scheduler fixture is missing the Orc Grunt definition.");
  for (let index = world.units.length; index < 56; index += 1) {
    world.units.push(worldModule.createWorldUnit({
      unit: unitDefinition,
      id: `__scheduler-progressed-${index}`,
      player: 1,
      tileX: 8 + (index % 16),
      tileY: 8 + (Math.floor(index / 16) % 8),
      tileset: null
    }));
  }

  world.engineSettings.lastDifficultyDefault = 3;
  world.engineSettings.sourceGameSpeedDefault = 75;
  world.engineSettings.fastForwardCycleDefault = 480;
  const tickSeconds = 1 / world.tickRate;
  const fast16LongFrameSeconds = 0.35 * 16;
  const expectedRequestedTicks = Math.floor(fast16LongFrameSeconds / tickSeconds);
  const maximumSteps = 8;
  const maximumBacklogSeconds = 0.5;
  const maximumBacklogTicks = Math.floor(maximumBacklogSeconds / tickSeconds);
  const maximumTurnMilliseconds = 8;
  const clockAdvanceMilliseconds = 2;
  const maximumClockSteps = Math.ceil(maximumTurnMilliseconds / clockAdvanceMilliseconds);
  let clockMs = 0;
  const turnBudget = {
    now: () => {
      const current = clockMs;
      clockMs += clockAdvanceMilliseconds;
      return current;
    },
    maxMilliseconds: maximumTurnMilliseconds,
    maxSteps: maximumSteps,
    maxBacklogSeconds: maximumBacklogSeconds,
    diagnosticNow: () => performance.now(),
    captureStepTiming: () => true
  };

  let uiRanAt = null;
  const queuedAt = performance.now();
  const uiWork = new Promise((resolveUi) => {
    setImmediate(() => {
      uiRanAt = performance.now();
      resolveUi();
    });
  });
  const tickBefore = world.tick;
  const turnStartedAt = performance.now();
  const fastTurnResult = orders.simulateWorld(world, fast16LongFrameSeconds, turnBudget);
  const turnElapsedMs = performance.now() - turnStartedAt;
  const processedTicks = world.tick - tickBefore;
  const backlogTicks = Math.floor((world.accumulator + Number.EPSILON) / tickSeconds);
  await uiWork;
  const uiLatencyMs = uiRanAt - queuedAt;

  const scheduledBuilder = world.units.find((unit) => unit.id === "unit-peon-17");
  assert.deepEqual({ id: scheduledBuilder?.id, order: scheduledBuilder?.order }, {
    id: "unit-peon-17",
    order: {
      kind: "build",
      phase: "to-site",
      buildingTypeId: "unit-great-hall",
      tileX: 11,
      tileY: 12,
      targetId: null,
      targetX: 416,
      targetY: 448,
      buildCycle: 0,
      path: [
        { x: 432, y: 176 },
        { x: 400, y: 176 },
        { x: 368, y: 144 },
        { x: 208, y: 144 },
        { x: 176, y: 176 },
        { x: 144, y: 176 },
        { x: 144, y: 208 },
        { x: 112, y: 240 },
        { x: 112, y: 400 },
        { x: 176, y: 464 },
        { x: 176, y: 496 },
        { x: 240, y: 496 },
        { x: 272, y: 528 },
        { x: 496, y: 528 },
        { x: 496, y: 400 }
      ],
      pathIndex: 1
    }
  }, "Fast16 AI construction must preserve the exact builder, placement, target, and ordered path.");
  const acceptedApproachSearches = findPathObservations.filter((observation) => (
    observation.unitId === "unit-peon-17"
    && observation.targetX === 496
    && observation.targetY === 400
  ));
  assert.equal(acceptedApproachSearches.length, 1,
    "Fast16 AI construction must compute its accepted interaction path once and reuse it through build-order commit and stepping.");
  assert.deepEqual(acceptedApproachSearches[0]?.path, scheduledBuilder.order.path,
    "The single accepted interaction search must supply the exact committed build path.");

  assert.ok(Math.abs(fastTurnResult.acceptedDeltaSeconds + fastTurnResult.droppedDeltaSeconds - fast16LongFrameSeconds) <= Number.EPSILON,
    "Scheduler diagnostics must account for accepted and dropped delta exactly.");
  assert.equal(fastTurnResult.processedSteps, processedTicks, "Scheduler diagnostics must report the exact processed-step count.");
  assert.ok(Math.abs(fastTurnResult.remainingBacklogSeconds - world.accumulator) <= Number.EPSILON,
    "Scheduler diagnostics must report the exact remaining backlog.");
  assert.ok(fastTurnResult.turnMilliseconds >= fastTurnResult.maxStepMilliseconds && fastTurnResult.maxStepMilliseconds >= 0,
    "Scheduler timing diagnostics must bound the slowest captured step.");

  assert.ok(processedTicks > 0 && processedTicks <= maximumSteps,
    `Fast16 must process at most ${maximumSteps} ticks in one animation turn; processed ${processedTicks}/${expectedRequestedTicks}.`);
  assert.ok(backlogTicks > 0,
    `Fast16 must carry owed ticks into the next animation turn; backlog=${backlogTicks}.`);
  assert.ok(processedTicks <= maximumClockSteps,
    `Fast16 must stop at the existing-clock budget; processed=${processedTicks}, clock-limit=${maximumClockSteps}.`);
  assert.ok(processedTicks + backlogTicks <= maximumBacklogTicks,
    `Fast16 backlog must stay within ${maximumBacklogTicks} ticks; accepted=${processedTicks + backlogTicks}.`);
  assert.ok(world.elapsed <= maximumBacklogSeconds + Number.EPSILON,
    `Dropped overload time must not advance simulation elapsed beyond the bounded backlog; elapsed=${world.elapsed}.`);
  assert.ok(turnElapsedMs <= 50,
    `Fast16 simulation turn must return within the UI-yield bound; elapsed=${turnElapsedMs.toFixed(3)}ms.`);
  assert.ok(uiLatencyMs <= 75,
    `Queued UI/Pause work must run promptly after the bounded turn; latency=${uiLatencyMs.toFixed(3)}ms.`);

  if (fast16Only) {
    console.log(`Fast16 scheduler verified (requested=${expectedRequestedTicks} ticks, processed=${processedTicks}, backlog=${backlogTicks}, turn=${turnElapsedMs.toFixed(3)}ms, UI=${uiLatencyMs.toFixed(3)}ms).`);
  } else {
    const backlogSave = saveGame.exportSavedGame(world, { x: 0, y: 0, zoom: 1 });
    const loadedBacklog = saveGame.loadSavedGameJson(manifest, backlogSave)?.world;
    assert.ok(loadedBacklog, "Budgeted simulation backlog save must load.");
    assert.ok(Math.abs(loadedBacklog.accumulator - world.accumulator) <= Number.EPSILON,
      `Save/load must preserve the exact owed-tick backlog; ${world.accumulator} became ${loadedBacklog.accumulator}.`);

    const pausedTick = loadedBacklog.tick;
    const pausedAccumulator = loadedBacklog.accumulator;
    await new Promise((resolvePause) => setImmediate(resolvePause));
    assert.equal(loadedBacklog.tick, pausedTick, "Queued Pause work must interrupt before another simulation turn.");
    assert.equal(loadedBacklog.accumulator, pausedAccumulator, "Pause must preserve owed ticks for a later Run turn.");
    orders.simulateWorld(loadedBacklog, 0, turnBudget);
    assert.ok(loadedBacklog.tick > pausedTick && loadedBacklog.accumulator < pausedAccumulator,
      "Run after Pause must resume the preserved backlog in order.");

    const acceptedTicks = processedTicks + backlogTicks;
    let catchupTurns = 0;
    while (world.accumulator + Number.EPSILON >= tickSeconds && catchupTurns < 10) {
      orders.simulateWorld(world, 0, turnBudget);
      catchupTurns += 1;
    }
    assert.equal(world.tick - tickBefore, acceptedTicks,
      "Catch-up turns must process every accepted tick exactly once.");
    assert.ok(world.accumulator < tickSeconds,
      `Catch-up must drain the bounded backlog; accumulator=${world.accumulator}.`);

    const loadPristineWorld = () => {
      const loaded = saveGame.loadSavedGameJson(manifest, pristineSave)?.world;
      assert.ok(loaded, "Pristine scheduler fixture save must load.");
      return loaded;
    };
    const steadyBudget = {
      now: () => 0,
      maxMilliseconds: 8,
      maxSteps: maximumSteps,
      maxBacklogSeconds: maximumBacklogSeconds
    };
    const normalWorld = loadPristineWorld();
    const normalTickBefore = normalWorld.tick;
    for (let frameIndex = 0; frameIndex < 60; frameIndex += 1) {
      orders.simulateWorld(normalWorld, 1 / 60, steadyBudget);
    }
    assert.equal(normalWorld.tick - normalTickBefore, 30,
      "Default 1x cadence must remain exactly 30 simulation ticks across 60 animation turns.");

    const referenceWorld = loadPristineWorld();
    const slicedWorld = loadPristineWorld();
    const deterministicTicks = 12;
    const deterministicDelta = deterministicTicks * tickSeconds;
    orders.simulateWorld(referenceWorld, deterministicDelta);
    const deterministicBudget = { ...steadyBudget, maxSteps: 4 };
    orders.simulateWorld(slicedWorld, deterministicDelta, deterministicBudget);
    while (slicedWorld.accumulator + Number.EPSILON >= tickSeconds) {
      orders.simulateWorld(slicedWorld, 0, deterministicBudget);
    }
    assert.equal(slicedWorld.tick, referenceWorld.tick,
      "Budgeted and unbudgeted schedules must reach the same exact tick count.");
    assert.deepEqual(
      JSON.parse(saveGame.exportSavedGame(slicedWorld, { x: 0, y: 0, zoom: 1 })).world,
      JSON.parse(saveGame.exportSavedGame(referenceWorld, { x: 0, y: 0, zoom: 1 })).world,
      "Equal ordered tick sequences must produce identical simulation state."
    );

    const diagnosticsOffWorld = loadPristineWorld();
    const diagnosticsOnWorld = loadPristineWorld();
    let offBudgetClock = 0;
    let onBudgetClock = 0;
    let diagnosticClock = 1000;
    const diagnosticParityDelta = 8 * tickSeconds;
    const diagnosticsOffResult = orders.simulateWorld(diagnosticsOffWorld, diagnosticParityDelta, {
      now: () => { const value = offBudgetClock; offBudgetClock += 2; return value; },
      maxMilliseconds: 8,
      maxSteps: 8,
      maxBacklogSeconds: maximumBacklogSeconds
    });
    const diagnosticsOnResult = orders.simulateWorld(diagnosticsOnWorld, diagnosticParityDelta, {
      now: () => { const value = onBudgetClock; onBudgetClock += 2; return value; },
      maxMilliseconds: 8,
      maxSteps: 8,
      maxBacklogSeconds: maximumBacklogSeconds,
      diagnosticNow: () => { const value = diagnosticClock; diagnosticClock += 100; return value; },
      captureStepTiming: () => true
    });
    assert.equal(diagnosticsOnWorld.tick, diagnosticsOffWorld.tick,
      "Diagnostic clock magnitude must not affect budget slicing or processed ticks.");
    assert.equal(diagnosticsOnResult.processedSteps, diagnosticsOffResult.processedSteps,
      "Enabling per-step diagnostics must preserve the scheduler work count.");
    assert.deepEqual(
      JSON.parse(saveGame.exportSavedGame(diagnosticsOnWorld, { x: 0, y: 0, zoom: 1 })).world,
      JSON.parse(saveGame.exportSavedGame(diagnosticsOffWorld, { x: 0, y: 0, zoom: 1 })).world,
      "Capture on and off must produce identical deterministic state."
    );
    assert.equal(diagnosticsOffResult.turnMilliseconds, 0,
      "Capture-off turns must not invoke the optional diagnostic clock.");
    assert.ok(diagnosticsOnResult.turnMilliseconds > 0 && diagnosticsOnResult.maxStepMilliseconds > 0,
      "Capture-on turns must expose diagnostic timing from the separate clock.");

    const endedWorld = loadPristineWorld();
    endedWorld.matchState = { status: "draw", winner: null, endedTick: endedWorld.tick };
    const endedTick = endedWorld.tick;
    const endedResult = orders.simulateWorld(endedWorld, tickSeconds, {
      ...steadyBudget,
      diagnosticNow: () => { throw new Error("Non-playing worlds must not read diagnostic clocks."); },
      captureStepTiming: () => true
    });
    assert.deepEqual(endedResult, {
      acceptedDeltaSeconds: 0,
      droppedDeltaSeconds: tickSeconds,
      processedSteps: 0,
      remainingBacklogSeconds: endedWorld.accumulator,
      turnMilliseconds: 0,
      maxStepMilliseconds: 0
    }, "Non-playing worlds must return an explicit zero-work result.");
    assert.equal(endedWorld.tick, endedTick, "Non-playing diagnostics must not mutate world state.");

    const idleProfileWorld = loadPristineWorld();
    const idleProfileUnit = idleProfileWorld.unitDefinitions.find((candidate) => candidate.id === "unit-footman");
    assert.ok(idleProfileUnit, "Idle performance profile fixture requires the Footman definition.");
    idleProfileWorld.units = Array.from({ length: 25 }, (_, index) => worldModule.createWorldUnit({
      unit: idleProfileUnit,
      id: `__idle-profile-${index}`,
      player: idleProfileWorld.visibilityPlayer,
      tileX: 6 + index % 20,
      tileY: 6 + Math.floor(index / 20),
      tileset: null
    }));
    idleProfileWorld.corpses = [];
    idleProfileWorld.projectiles = [];
    idleProfileWorld.pendingAttacks = [];
    idleProfileWorld.spellEffects = [];
    idleProfileWorld.events = [];
    idleProfileWorld.aiStates = [];
    idleProfileWorld.victoryRequirements = [];
    idleProfileWorld.victoryRequirementGroups = [];
    idleProfileWorld.defeatRequirements = [];
    idleProfileWorld.timedVictoryTriggers = [];
    idleProfileWorld.locationBuildRequirements = [];
    idleProfileWorld.circleOfPowerRequirements = [];
    idleProfileWorld.rescuedCircleRequirements = [];
    idleProfileWorld.requiredSurvivalUnitIds = [];
    idleProfileWorld.pendingTimedVictory = null;
    idleProfileWorld.matchState = { status: "playing", winner: null, endedTick: null };
    idleProfileWorld.tick = 0;
    idleProfileWorld.elapsed = 0;
    idleProfileWorld.accumulator = 0;
    const idleProfileCaptureSeconds = 15;
    const idleProfileTickSeconds = 1 / orders.sourceDefaultGameSpeed(idleProfileWorld);
    const idleProfileExpectedTicks = Math.round(idleProfileCaptureSeconds / idleProfileTickSeconds);
    for (let frameIndex = 0; frameIndex < idleProfileExpectedTicks; frameIndex += 1) {
      orders.simulateWorld(idleProfileWorld, idleProfileTickSeconds, {
        ...steadyBudget,
        suppressMatchResolution: () => true
      });
    }
    assert.equal(idleProfileWorld.matchState.status, "playing",
      "The smoke-only idle-25 profile must not resolve a match before its bounded 15-second capture finishes.");
    assert.equal(idleProfileWorld.tick, idleProfileExpectedTicks,
      "The smoke-only idle-25 profile must continue executing real simulation ticks throughout its bounded 15-second capture.");

    const commandProfile = profiles.getPerformanceProfile("command-18");
    const commandProfileWorld = loadPristineWorld();
    const commandProfileUnit = commandProfileWorld.unitDefinitions.find((candidate) => candidate.id === "unit-footman");
    assert.ok(commandProfileUnit, "Command performance profile fixture requires the Footman definition.");
    commandProfileWorld.units = Array.from({ length: 18 }, (_, index) => worldModule.createWorldUnit({
      unit: commandProfileUnit,
      id: `__perf-command-18-local-${String(index).padStart(3, "0")}`,
      player: commandProfileWorld.visibilityPlayer,
      tileX: 6 + index % 18,
      tileY: 6,
      tileset: null
    }));
    const commandProfileSelection = commandProfileWorld.units.map((unit) => unit.id);
    const fixedDemoSelection = demo.fixedBrowserDemoInitialSelection(commandProfileWorld);
    const selectedAfterLoad = profiles.selectionForLoadedPerformanceProfile(commandProfile.id, commandProfileSelection, fixedDemoSelection);
    assert.deepEqual(selectedAfterLoad, commandProfileSelection,
      "The command-18 selection must survive fixed-demo initial selection during smoke-profile loading.");
    assert.deepEqual(profiles.selectionForLoadedPerformanceProfile(null, commandProfileSelection, ["unit-peasant"]), ["unit-peasant"],
      "Fixed-demo initial selection must remain unchanged when no performance profile is active.");
    const commandCollector = new runtimePerformance.RuntimePerformanceCollector(16);
    commandCollector.start(commandProfile.id);
    let commandNow = 0;
    const issueHudInput = (command, input = {}) => {
      const token = commandCollector.beginInput(commandNow);
      commandNow += 1;
      const result = hudCommands.executeHudCommandForSelection(commandProfileWorld, manifest, command, selectedAfterLoad, 0, null, input);
      commandCollector.finishInput(token, commandNow);
      commandNow += 1;
      return result;
    };
    const issuePointerInput = (pendingCommand, x, y, queue) => {
      const token = commandCollector.beginInput(commandNow);
      commandNow += 1;
      const issued = orders.issuePendingWorldCommandAt(commandProfileWorld, selectedAfterLoad, pendingCommand, x, y, queue);
      commandCollector.finishInput(token, commandNow);
      commandNow += 1;
      return issued;
    };
    const move = issueHudInput("move");
    assert.equal(move.pendingWorldCommand, "move", "The command-18 selection must enter the real move targeting seam.");
    assert.equal(issuePointerInput(move.pendingWorldCommand, commandProfileWorld.tileSize * 24, commandProfileWorld.tileSize * 24, false), true,
      "The command-18 selection must issue the real move command.");
    const attackMove = issueHudInput("attack-move", { shiftKey: true });
    assert.equal(attackMove.pendingWorldCommand, "attack-move", "The command-18 selection must enter the real attack-move targeting seam.");
    assert.equal(issuePointerInput(attackMove.pendingWorldCommand, commandProfileWorld.tileSize * 8, commandProfileWorld.tileSize * 24, true), true,
      "The command-18 selection must issue the real queued attack-move command.");
    assert.equal(commandCollector.snapshot().inputToCommand.sampleCount, 4,
      "The command-18 action must record nonzero input samples for both HUD and pointer command seams.");

    const mainSource = readFileSync(resolve(root, "src/main.ts"), "utf8");
    assert.match(mainSource,
      /if \(!paused && !briefingOpen\) \{\s+if \(!titleScreenOpen\) \{\s+const simulationResult = simulateWorld\(world, deltaSeconds \* sourceRuntimeGameSpeedMultiplier\(world, gameSpeed\), SIMULATION_TURN_BUDGET\);/,
      "The production RAF seam must retain Pause/briefing guards and use the bounded scheduler.");
    assert.match(mainSource, /now: \(\) => performance\.now\(\)/,
      "The production scheduler must use the existing monotonic performance clock.");
    assert.match(mainSource, /diagnosticNow: \(\) => performance\.now\(\)/,
      "Performance diagnostics must use a clock separate from budget slicing.");
    assert.match(mainSource, /runtimePerformanceCollector\.recordScheduler\(simulationResult\)/,
      "The production ticker must record scheduler diagnostics.");

    console.log(`Simulation scheduler verified (Fast16 requested=${expectedRequestedTicks} ticks, processed=${processedTicks}, backlog=${backlogTicks}, catch-up=${catchupTurns} turns, default=${normalWorld.tick - normalTickBefore} ticks, deterministic=${deterministicTicks} ticks, turn=${turnElapsedMs.toFixed(3)}ms, UI=${uiLatencyMs.toFixed(3)}ms).`);
  }
} finally {
  rmSync(output, { recursive: true, force: true });
}
