import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = process.cwd();
const output = mkdtempSync(join(tmpdir(), "wargus-pathfinding-budget-"));

try {
  const compiler = spawnSync(process.execPath, [
    resolve(root, "node_modules/typescript/bin/tsc"),
    "--ignoreConfig",
    "src/simulation/orders.ts",
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
    throw new Error(`pathfinding budget compile failed:\n${compiler.stdout}${compiler.stderr}`);
  }
  copyFileSync(resolve(root, "src/wargus/scoutProvenance.mjs"), join(output, "wargus/scoutProvenance.mjs"));

  const runnerPath = join(output, "run-pathfinding-budget.cjs");
  writeFileSync(runnerPath, `
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = process.argv[2];
const output = process.argv[3];
const pathfinding = require(join(output, "simulation/pathfinding.js"));
const pathRequests = require(join(output, "simulation/pathRequests.js"));
const worldModule = require(join(output, "simulation/world.js"));
const orders = require(join(output, "simulation/orders.js"));

assert.equal(pathRequests.PATH_NODE_EXPANSIONS_PER_TICK, 512);
assert.equal(pathRequests.PATH_NODE_EXPANSIONS_PER_QUANTUM, 16);

const mapPath = "campaigns/human-exp/levelx12h.smp.gz";
const manifest = JSON.parse(readFileSync(join(root, "public/wargus/manifest.json"), "utf8"));
const map = manifest.maps.find((candidate) => candidate.path === mapPath);
if (!map?.setupJson) throw new Error("X12 setup missing");
const setup = JSON.parse(readFileSync(join(root, "public/wargus", map.setupJson), "utf8"));

pathfinding.resetPathfindingDiagnostics();
pathRequests.resetPathRequestDiagnostics();
const world = worldModule.createInitialWorld(
  map, manifest.units, setup, manifest.upgrades, manifest.missiles, manifest.spells,
  manifest.allowRules, manifest.dependencies, manifest.buttons, manifest.engineSettings,
  manifest.aiDefinitions, manifest.unitDatabase, manifest.tilesets, manifest.animations
);

const movable = world.units.filter((unit) => unit.hitPoints > 0 && unit.speed > 0 && !unit.construction).slice(0, 24);
assert.ok(movable.length >= 8, "need enough movable units for group move budget test");
for (const unit of movable) {
  orders.issueMoveOrder(world, unit.id, unit.x + world.tileSize * 8, unit.y + world.tileSize * 8);
}
assert.equal(pathRequests.pendingPathRequestCount(world), movable.length, "each move issues one pending request");

const before = pathfinding.snapshotPathfindingDiagnostics();
const tickSeconds = 1 / worldModule.sourceDefaultGameSpeed(world);
const started = performance.now();
orders.simulateWorld(world, tickSeconds, {
  now: () => performance.now(),
  maxMilliseconds: 10_000,
  maxSteps: 1,
  maxBacklogSeconds: orders.SIMULATION_MAX_BACKLOG_SECONDS
});
const elapsed = performance.now() - started;
const after = pathfinding.snapshotPathfindingDiagnostics();
const requestDiag = pathRequests.snapshotPathRequestDiagnostics();
const expansions = requestDiag["plan024.pathRequests.expansionsPerTick"].at(-1) ?? 0;
assert.ok(expansions <= pathRequests.PATH_NODE_EXPANSIONS_PER_TICK, "scheduler must respect expansion budget");
assert.ok(elapsed < 2_500, "single budgeted tick must stay under 2.5s, got " + elapsed);
// Path request diagnostics should show enqueued work for the group command.
assert.ok(requestDiag["plan024.pathRequests.enqueued"] >= movable.length, "group move must enqueue path requests");

// Determinism: two fresh worlds with the same command stream produce the same pending counts after N ticks.
function runStream(ticks) {
  pathfinding.resetPathfindingDiagnostics();
  pathRequests.resetPathRequestDiagnostics();
  const local = worldModule.createInitialWorld(
    map, manifest.units, setup, manifest.upgrades, manifest.missiles, manifest.spells,
    manifest.allowRules, manifest.dependencies, manifest.buttons, manifest.engineSettings,
    manifest.aiDefinitions, manifest.unitDatabase, manifest.tilesets, manifest.animations
  );
  const units = local.units.filter((unit) => unit.hitPoints > 0 && unit.speed > 0 && !unit.construction).slice(0, 12);
  for (const unit of units) {
    orders.issueMoveOrder(local, unit.id, unit.x + world.tileSize * 6, unit.y);
  }
  for (let i = 0; i < ticks; i += 1) {
    orders.simulateWorld(local, tickSeconds, {
      now: () => performance.now(),
      maxMilliseconds: 10_000,
      maxSteps: 1,
      maxBacklogSeconds: orders.SIMULATION_MAX_BACKLOG_SECONDS
    });
  }
  return {
    pending: pathRequests.pendingPathRequestCount(local),
    completed: pathRequests.snapshotPathRequestDiagnostics()["plan024.pathRequests.completed"],
    tick: local.tick
  };
}
const a = runStream(8);
const b = runStream(8);
assert.deepEqual(a, b, "deterministic path request drain");

// X12 first tick remains bounded with low synchronous search pressure relative to the original 304-call burst.
pathfinding.resetPathfindingDiagnostics();
pathRequests.resetPathRequestDiagnostics();
const x12 = worldModule.createInitialWorld(
  map, manifest.units, setup, manifest.upgrades, manifest.missiles, manifest.spells,
  manifest.allowRules, manifest.dependencies, manifest.buttons, manifest.engineSettings,
  manifest.aiDefinitions, manifest.unitDatabase, manifest.tilesets, manifest.animations
);
const x12Started = performance.now();
orders.simulateWorld(x12, tickSeconds, {
  now: () => performance.now(),
  maxMilliseconds: 10_000,
  maxSteps: 1,
  maxBacklogSeconds: orders.SIMULATION_MAX_BACKLOG_SECONDS
});
const x12Elapsed = performance.now() - x12Started;
const x12Path = pathfinding.snapshotPathfindingDiagnostics();
assert.ok(x12Elapsed < 2_500, "X12 first tick must remain under 2.5s");
assert.ok(
  x12Path.synchronousFindPathResultCalls < 80,
  "X12 first tick must not reintroduce the 304-search auto-attack burst, got " + x12Path.synchronousFindPathResultCalls
);
assert.ok(
  x12Path.expansionAttempts < 500_000,
  "X12 first tick expansion attempts must stay far below the pre-fix 2.1M baseline, got " + x12Path.expansionAttempts
);

// Coverage: 30 AI ticks on X12 must not reintroduce multi-hundred sync findPathResult storms.
pathfinding.resetPathfindingDiagnostics();
pathRequests.resetPathRequestDiagnostics();
const coverageWorld = worldModule.createInitialWorld(
  map, manifest.units, setup, manifest.upgrades, manifest.missiles, manifest.spells,
  manifest.allowRules, manifest.dependencies, manifest.buttons, manifest.engineSettings,
  manifest.aiDefinitions, manifest.unitDatabase, manifest.tilesets, manifest.animations
);
for (let i = 0; i < 30; i += 1) {
  orders.simulateWorld(coverageWorld, tickSeconds, {
    now: () => performance.now(),
    maxMilliseconds: 10_000,
    maxSteps: 1,
    maxBacklogSeconds: orders.SIMULATION_MAX_BACKLOG_SECONDS
  });
}
const thirtyTickSync = pathfinding.snapshotPathfindingDiagnostics();
assert.ok(
  thirtyTickSync.synchronousFindPathResultCalls < 80,
  "30 AI ticks must stay under 80 sync findPathResult calls, got " + thirtyTickSync.synchronousFindPathResultCalls
);
assert.ok(
  thirtyTickSync.synchronousFindPathCalls < 120,
  "30 AI ticks must stay under 120 sync findPath calls, got " + thirtyTickSync.synchronousFindPathCalls
);

console.log(JSON.stringify({

  ok: true,
  groupMoveElapsedMs: elapsed,
  expansionsLastTick: expansions,
  x12ElapsedMs: x12Elapsed,
  x12SyncFindPathResultCalls: x12Path.synchronousFindPathResultCalls,
  x12ExpansionAttempts: x12Path.expansionAttempts,
  determinism: a,
  thirtyTickSync
}, null, 2));
`, "utf8");

  const run = spawnSync(process.execPath, [runnerPath, root, output], {
    cwd: root,
    encoding: "utf8",
    timeout: 60_000
  });
  if (run.status !== 0) {
    throw new Error(`pathfinding budget verifier failed:\n${run.stdout}\n${run.stderr}`);
  }
  console.log(run.stdout.trim());
} finally {
  rmSync(output, { recursive: true, force: true });
}
