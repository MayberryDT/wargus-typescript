import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { tmpdir } from "node:os";

const root = process.cwd();
const output = mkdtempSync(join(tmpdir(), "wargus-simulation-scheduler-"));

try {
  const compiler = spawnSync(process.execPath, [
    resolve(root, "node_modules/typescript/bin/tsc"),
    "--ignoreConfig",
    "src/simulation/orders.ts",
    "src/wargus/demoScenario.ts",
    "src/wargus/saveGame.ts",
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
  const saveGame = require(join(output, "wargus/saveGame.js"));
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
    maxBacklogSeconds: maximumBacklogSeconds
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
  orders.simulateWorld(world, fast16LongFrameSeconds, turnBudget);
  const turnElapsedMs = performance.now() - turnStartedAt;
  const processedTicks = world.tick - tickBefore;
  const backlogTicks = Math.floor((world.accumulator + Number.EPSILON) / tickSeconds);
  await uiWork;
  const uiLatencyMs = uiRanAt - queuedAt;

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

  const mainSource = readFileSync(resolve(root, "src/main.ts"), "utf8");
  assert.match(mainSource,
    /if \(!paused && !briefingOpen\) \{\s+if \(!titleScreenOpen\) \{\s+simulateWorld\(world, deltaSeconds \* sourceRuntimeGameSpeedMultiplier\(world, gameSpeed\), SIMULATION_TURN_BUDGET\);/,
    "The production RAF seam must retain Pause/briefing guards and use the bounded scheduler.");
  assert.match(mainSource, /now: \(\) => performance\.now\(\)/,
    "The production scheduler must use the existing monotonic performance clock.");

  console.log(`Simulation scheduler verified (Fast16 requested=${expectedRequestedTicks} ticks, processed=${processedTicks}, backlog=${backlogTicks}, catch-up=${catchupTurns} turns, default=${normalWorld.tick - normalTickBefore} ticks, deterministic=${deterministicTicks} ticks, turn=${turnElapsedMs.toFixed(3)}ms, UI=${uiLatencyMs.toFixed(3)}ms).`);
} finally {
  rmSync(output, { recursive: true, force: true });
}
