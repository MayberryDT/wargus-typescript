import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { preflightArtifactRoot } from "./lib/browser-execution-controller.mjs";

const root = process.cwd();
const fixedTickOffset = parseFixedTickOffset(process.env.WARGUS_PERF_FIXED_TICK_OFFSET ?? "600");
const planId = process.env.WARGUS_PERF_PLAN?.trim();
if (!/^\d{3}$/.test(planId ?? "")) throw new Error("WARGUS_PERF_PLAN must be a three-digit plan ID.");
const captureSha = process.env.WARGUS_CAPTURE_SHA?.trim();
if (!captureSha) throw new Error("WARGUS_CAPTURE_SHA is required for fixed-tick proof attribution.");
assertCleanCaptureAttribution(captureSha);
let output = null;
const command = [`WARGUS_PERF_PLAN=${planId}`, `WARGUS_CAPTURE_SHA=${captureSha}`, `WARGUS_PERF_FIXED_TICK_OFFSET=${fixedTickOffset}`, "node", "scripts/verify-successor-fixed-tick.mjs"];
const comparedFields = [
  "canonicalStateHash",
  "entity/effect counts and IDs",
  "positions",
  "hit points",
  "owners",
  "orders",
  "command targets",
  "scheduler requested/processed tick counts",
  "canonical save serialization"
];
const applyPerformanceProfileSource = extractNamedFunction(
  readFileSync(resolve(root, "src/main.ts"), "utf8"),
  "applyPerformanceProfile"
);

try {
  output = mkdtempSync(join(tmpdir(), "wargus-fixed-tick-proof-"));
  compileProjectModules();
  copyFileSync(resolve(root, "src/wargus/scoutProvenance.mjs"), join(output, "wargus/scoutProvenance.mjs"));
  Object.defineProperty(globalThis, "location", { configurable: true, value: { search: "?smoke=1&demoSeed=ai-staged-pressure" } });

  const require = createRequire(import.meta.url);
  const modules = {
    demo: require(join(output, "wargus/demoScenario.js")),
    orders: require(join(output, "simulation/orders.js")),
    profiles: require(join(output, "performance/performanceProfiles.js")),
    saveGame: require(join(output, "wargus/saveGame.js")),
    world: require(join(output, "simulation/world.js"))
  };
  const fixture = loadFixture(modules);
  const profiles = modules.profiles.performanceProfileDefinitions();
  const profileResults = profiles.map((profile) => proveProfile(profile, fixture, modules));
  const equal = profileResults.every((profile) => profile.equal);
  const result = {
    command: command.join(" "),
    commit: captureSha,
    fixedTickOffset,
    profiles: profileResults,
    comparedFields,
    equalityVerdict: equal ? "pass" : "fail",
    initialProfileSetup: {
      source: "src/main.ts applyPerformanceProfile mirrored against the fixed browser demo fixture and cross-checked by browser fingerprint",
      sourceHash: sha256(applyPerformanceProfileSource),
      mapPath: fixture.map.path,
      demoSeed: "ai-staged-pressure"
    }
  };
  writeArtifactIfRequested(result);
  console.log(JSON.stringify({
    command: result.command,
    commit: result.commit,
    fixedTickOffset: result.fixedTickOffset,
    equalityVerdict: result.equalityVerdict,
    profiles: result.profiles.map((profile) => ({ id: profile.id, equal: profile.equal, hashes: profile.runs.map((run) => ({ canonicalStateHash: run.canonicalStateHash, initialFingerprintHash: run.initialFingerprint.hash, finalFingerprintHash: run.finalFingerprint.hash, saveSerializationHash: run.saveSerializationHash })) }))
  }, null, 2));
  if (!equal) process.exitCode = 1;
} finally {
  if (output) rmSync(output, { recursive: true, force: true });
}

function compileProjectModules() {
  const compiler = spawnSync(process.execPath, [
    resolve(root, "node_modules/typescript/bin/tsc"),
    "--ignoreConfig",
    "src/simulation/orders.ts",
    "src/wargus/demoScenario.ts",
    "src/wargus/saveGame.ts",
    "src/performance/performanceProfiles.ts",
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
  if (compiler.status !== 0) throw new Error(`Fixed-tick proof compile failed:\n${compiler.stdout}${compiler.stderr}`);
}

function loadFixture(modules) {
  const manifest = JSON.parse(readFileSync(resolve(root, "public/wargus/manifest.json"), "utf8"));
  const map = manifest.maps.find((candidate) => candidate.path === "maps/ladder/Garden of war BNE.pud.smp.gz");
  if (!map?.setupJson) throw new Error("Garden of War setup is missing from the manifest.");
  const setup = JSON.parse(readFileSync(resolve(root, "public/wargus", map.setupJson), "utf8"));
  const demoSetup = modules.demo.applyFixedBrowserDemoSetup(map, setup);
  const world = modules.world.createInitialWorld(
    map, manifest.units, demoSetup, manifest.upgrades, manifest.missiles, manifest.spells,
    manifest.allowRules, manifest.dependencies, manifest.buttons, manifest.engineSettings,
    manifest.aiDefinitions, manifest.unitDatabase, manifest.tilesets, manifest.animations
  );
  modules.demo.applyFixedBrowserDemoWorldPresentation(map, world);
  return { manifest, map, pristineSave: modules.saveGame.exportSavedGame(world, { x: 0, y: 0, zoom: 1 }) };
}

function proveProfile(profile, fixture, modules) {
  const first = runProfile(profile, fixture, modules);
  const second = runProfile(profile, fixture, modules);
  const equal = canonicalJson(first.comparison) === canonicalJson(second.comparison);
  return {
    id: profile.id,
    definitionHash: sha256(canonicalJson(profile)),
    fixedTickOffset,
    comparedFields,
    runs: [first.result, second.result],
    equal
  };
}

function runProfile(profile, fixture, modules) {
  const loaded = modules.saveGame.loadSavedGameJson(fixture.manifest, fixture.pristineSave);
  if (!loaded?.world) throw new Error(`Could not reload pristine world for ${profile.id}.`);
  const world = loaded.world;
  applyPerformanceProfile(world, fixture.map, profile, modules);
  const initialFingerprint = fingerprint(world);
  const browserComparableInitialFingerprint = browserComparableFingerprint(world);
  const tickSeconds = 1 / modules.orders.sourceDefaultGameSpeed(world);
  let requestedTicks = 0;
  let processedTicks = 0;
  for (let index = 0; index < fixedTickOffset; index += 1) {
    const turn = modules.orders.simulateWorld(world, tickSeconds, { now: () => 0, maxMilliseconds: Number.POSITIVE_INFINITY, maxSteps: Number.POSITIVE_INFINITY, maxBacklogSeconds: Number.POSITIVE_INFINITY, suppressMatchResolution: () => true });
    requestedTicks += 1;
    processedTicks += turn.processedSteps;
  }
  const save = canonicalSave(modules.saveGame.exportSavedGame(world, { x: 0, y: 0, zoom: 1 }));
  const state = canonicalState(world);
  const result = {
    initialFingerprint,
    browserComparableInitialFingerprint,
    canonicalStateHash: sha256(canonicalJson(save.world)),
    finalFingerprint: fingerprint(world),
    scheduler: { requestedTicks, processedTicks, worldTick: world.tick, accumulator: world.accumulator },
    saveSerializationHash: sha256(canonicalJson(save))
  };
  return { result, comparison: { state, scheduler: result.scheduler, save } };
}

// Mirrors src/main.ts applyPerformanceProfile without importing browser/Pixi-bound main.ts.
function applyPerformanceProfile(world, map, profile, modules) {
  const localPlayerId = world.visibilityPlayer;
  const enemyPlayerId = world.players.find((player) => player.id !== localPlayerId)?.id ?? localPlayerId;
  const localDefinition = world.unitDefinitions.find((unit) => unit.id === "unit-footman")
    ?? world.unitDefinitions.find((unit) => !unit.building && unit.canAttack);
  const enemyDefinition = world.unitDefinitions.find((unit) => unit.id === "unit-grunt") ?? localDefinition;
  if (!localDefinition || !enemyDefinition) throw new Error(`Performance profile combat definitions are unavailable for ${profile.id}.`);

  for (const field of ["units", "corpses", "projectiles", "pendingAttacks", "spellEffects", "events", "aiStates", "activeResearch", "queuedResearch", "victoryRequirements", "victoryRequirementGroups", "defeatRequirements", "timedVictoryTriggers", "locationBuildRequirements", "circleOfPowerRequirements", "rescuedCircleRequirements", "requiredSurvivalUnitIds"]) world[field] = [];
  world.pendingTimedVictory = null;
  world.matchState = { status: "playing", winner: null, endedTick: null };
  world.elapsed = 0;
  world.tick = 0;
  world.accumulator = 0;
  world.briefingText = null;
  world.briefingVoiceFiles = [];
  world.nextUnitSerial = 1;
  for (const player of world.players) player.ai = null;

  const makeUnit = (index, player, enemy) => {
    const column = index % 20;
    const row = Math.floor(index / 20);
    const tileX = enemy ? Math.max(2, world.map.width - 8 - column * 2) : Math.min(world.map.width - 3, 6 + column * 2);
    const tileY = Math.min(world.map.height - 3, 6 + row * 2);
    return modules.world.createWorldUnit({
      unit: enemy ? enemyDefinition : localDefinition,
      id: `__perf-${profile.id}-${enemy ? "enemy" : "local"}-${String(index).padStart(3, "0")}`,
      player, tileX, tileY, tileset: map.setup?.tileset ?? null
    });
  };
  const localUnits = Array.from({ length: profile.playerUnitCounts[0] }, (_, index) => makeUnit(index, localPlayerId, false));
  const enemyUnits = Array.from({ length: profile.playerUnitCounts[1] }, (_, index) => makeUnit(index, enemyPlayerId, true));
  world.units.push(...localUnits, ...enemyUnits);
  profile.buildingTypeIds.forEach((typeId, index) => {
    const definition = world.unitDefinitions.find((unit) => unit.id === typeId);
    if (!definition) throw new Error(`Performance profile building is unavailable: ${typeId}`);
    world.units.push(modules.world.createWorldUnit({
      unit: definition, id: `__perf-${profile.id}-building-${String(index).padStart(2, "0")}`,
      player: localPlayerId, tileX: 4 + index * 4, tileY: Math.max(2, world.map.height - 10), tileset: map.setup?.tileset ?? null
    }));
  });

  const distantX = Math.max(world.tileSize * 4, (world.map.width - 8) * world.tileSize);
  const distantY = Math.max(world.tileSize * 4, (world.map.height - 8) * world.tileSize);
  if (profile.id === "command-18") {
    const ids = localUnits.map((unit) => unit.id);
    modules.orders.issueGroupMoveOrder(world, ids, distantX, distantY, localPlayerId);
    modules.orders.issueGroupQueueAttackMoveOrder(world, ids, world.tileSize * 8, distantY, localPlayerId);
  }
  if (profile.id === "combat-100") {
    localUnits.forEach((unit, index) => modules.orders.issueAttackOrder(world, unit.id, enemyUnits[index % enemyUnits.length].id));
    for (let index = 0; index < profile.projectileCount; index += 1) {
      const sourceUnit = localUnits[index % localUnits.length];
      const targetUnit = enemyUnits[index % enemyUnits.length];
      world.projectiles.push({ id: `__perf-combat-projectile-${String(index).padStart(2, "0")}`, sourceId: sourceUnit.id, targetId: targetUnit.id, sourceTypeId: sourceUnit.typeId, player: localPlayerId, x: sourceUnit.x, y: sourceUnit.y, originX: sourceUnit.x, originY: sourceUnit.y, targetX: targetUnit.x, targetY: targetUnit.y, speed: 0, damage: 0, missileId: null, className: null, impactSoundId: null, impactMissileId: null, splashFactor: 0, range: 0, canHitOwner: false, friendlyFire: false, canTargetLand: true, canTargetSea: false, canTargetAir: false, bouncesRemaining: 0, hitUnitIds: [], drawLevel: 0, kind: "melee", age: 0, delaySeconds: 0, ttlSeconds: 60 });
    }
    for (let index = 0; index < profile.effectCount; index += 1) {
      const anchor = localUnits[index % localUnits.length];
      world.spellEffects.push({ id: `__perf-combat-effect-${String(index).padStart(2, "0")}`, kind: "flame-shield", player: localPlayerId, x: anchor.x, y: anchor.y, radius: world.tileSize, age: 0, duration: 60, sourceTypeId: anchor.typeId, sourceUnitId: anchor.id, missileId: null, spellId: null, drawLevel: 0 });
    }
  }
  modules.world.updateVisibility(world);
}

function canonicalState(world) {
  return {
    tick: world.tick,
    elapsed: world.elapsed,
    accumulator: world.accumulator,
    matchState: world.matchState,
    units: world.units.map(unitRecord).sort(byId),
    corpses: world.corpses.map(effectRecord).sort(byId),
    projectiles: world.projectiles.map(effectRecord).sort(byId),
    pendingAttacks: [...world.pendingAttacks].map(effectRecord).sort(byId),
    spellEffects: world.spellEffects.map(effectRecord).sort(byId),
    players: world.players.map((player) => ({ id: player.id, resources: player.resources, stats: player.stats, ai: player.ai })).sort((left, right) => left.id - right.id)
  };
}

function fingerprint(world) {
  const state = canonicalState(world);
  return {
    counts: { entities: state.units.length, corpses: state.corpses.length, projectiles: state.projectiles.length, pendingAttacks: state.pendingAttacks.length, effects: state.spellEffects.length },
    entities: state.units,
    effects: [...state.corpses, ...state.projectiles, ...state.pendingAttacks, ...state.spellEffects].sort(byId),
    hash: sha256(canonicalJson({ entities: state.units, effects: [...state.corpses, ...state.projectiles, ...state.pendingAttacks, ...state.spellEffects].sort(byId) }))
  };
}

function browserComparableFingerprint(world) {
  const units = world.units.map((unit) => ({
    id: unit.id,
    typeId: unit.typeId,
    player: unit.player,
    x: unit.x,
    y: unit.y,
    hitPoints: unit.hitPoints
  })).sort(byId);
  const record = {
    entityCounts: {
      units: world.units.length,
      mobileUnits: world.units.filter((unit) => unit.kind !== "building").length,
      buildings: world.units.filter((unit) => unit.kind === "building").length,
      corpses: world.corpses.length,
      projectiles: world.projectiles.length,
      spellEffects: world.spellEffects.length
    },
    units,
    projectileIds: world.projectiles.map((effect) => effect.id).sort(),
    effectIds: world.spellEffects.map((effect) => effect.id).sort()
  };
  return { ...record, hash: sha256(canonicalJson(record)) };
}

function extractNamedFunction(source, name) {
  const start = source.indexOf("function " + name + "(");
  const end = source.indexOf("\nfunction runPerformanceProfileAction", start);
  if (start < 0 || end < 0) throw new Error("Could not extract src/main.ts " + name + " source.");
  return source.slice(start, end).trim();
}

function unitRecord(unit) {
  return { id: unit.id, typeId: unit.typeId, player: unit.player, x: unit.x, y: unit.y, hitPoints: unit.hitPoints, maxHitPoints: unit.maxHitPoints, order: unit.order, queuedOrders: unit.queuedOrders, targetId: unit.targetId ?? null, targetX: unit.targetX ?? null, targetY: unit.targetY ?? null };
}

function effectRecord(effect) {
  return { id: effect.id, kind: effect.kind ?? null, player: effect.player ?? null, sourceId: effect.sourceId ?? effect.sourceUnitId ?? null, targetId: effect.targetId ?? null, x: effect.x ?? null, y: effect.y ?? null, targetX: effect.targetX ?? null, targetY: effect.targetY ?? null, age: effect.age ?? null, duration: effect.duration ?? null, ttlSeconds: effect.ttlSeconds ?? null };
}

function canonicalSave(serialized) {
  const save = JSON.parse(serialized);
  delete save.savedAt;
  return save;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function byId(left, right) {
  return String(left.id).localeCompare(String(right.id));
}

function validateCaptureAttribution(expectedCaptureSha, head, status) {
  if (expectedCaptureSha !== head) throw new Error(`WARGUS_CAPTURE_SHA ${expectedCaptureSha} does not equal checked-out commit ${head}.`);
  if (status !== "") throw new Error("Fixed-tick proof requires a clean worktree including tracked and untracked files; git status was: " + status);
}

function assertCleanCaptureAttribution(expectedCaptureSha) {
  validateCaptureAttribution(
    expectedCaptureSha,
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", timeout: 5000 }).trim(),
    execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: root, encoding: "utf8", timeout: 5000 }).trim()
  );
}

function parseFixedTickOffset(value) {
  if (!/^\d+$/.test(value) || Number(value) < 1) throw new Error(`WARGUS_PERF_FIXED_TICK_OFFSET must be a positive integer; got ${value}.`);
  return Number(value);
}

function writeArtifactIfRequested(result) {
  const artifactDirectory = process.env.WARGUS_PERF_ARTIFACT_DIR;
  if (!artifactDirectory) return;
  const artifactRoot = process.env.WARGUS_ARTIFACT_ROOT;
  const captureSha = process.env.WARGUS_CAPTURE_SHA;
  if (!artifactRoot || !captureSha) {
    throw new Error("WARGUS_ARTIFACT_ROOT and WARGUS_CAPTURE_SHA are required when writing the fixed-tick proof.");
  }
  if (result.commit !== captureSha) {
    throw new Error(`WARGUS_CAPTURE_SHA ${captureSha} does not equal checked-out commit ${result.commit}.`);
  }
  const preflight = preflightArtifactRoot({
    artifactWorkspace: process.env.WARGUS_ARTIFACT_WORKSPACE,
    artifactRoot,
    disposableWorktree: root,
    preservationOwner: process.env.WARGUS_ARTIFACT_PRESERVATION_OWNER
  });
  const expectedParent = resolve(preflight.artifactRoot, "performance", planId, captureSha);
  const resolvedDirectory = resolve(artifactDirectory);
  const child = relative(expectedParent, resolvedDirectory);
  if (!child || isAbsolute(child) || child === ".." || child.startsWith(".." + sep) || child.includes(sep)) {
    throw new Error("WARGUS_PERF_ARTIFACT_DIR must be one stamp directory below " + expectedParent + "; got " + resolvedDirectory + ".");
  }
  if (result.equalityVerdict !== "pass") throw new Error("Refusing to persist a failed fixed-tick proof.");
  if (existsSync(artifactDirectory)) {
    const existing = readdirSync(artifactDirectory);
    if (existing.length > 0) throw new Error("Fixed-tick proof requires a fresh empty artifact stamp; found " + existing.join(", "));
  } else {
    mkdirSync(artifactDirectory, { recursive: true });
  }
  const path = join(artifactDirectory, "fixed-tick-proof.json");
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.error(`Wrote fixed-tick proof artifact: ${path}`);
}
