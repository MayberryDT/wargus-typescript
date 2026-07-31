import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = process.cwd();
const output = mkdtempSync(join(tmpdir(), "wargus-visibility-fog-"));

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
    throw new Error(`visibility fog compile failed:\n${compiler.stdout}${compiler.stderr}`);
  }
  copyFileSync(resolve(root, "src/wargus/scoutProvenance.mjs"), join(output, "wargus/scoutProvenance.mjs"));

  const runnerPath = join(output, "run-visibility-fog.cjs");
  writeFileSync(runnerPath, `
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const root = process.argv[2];
const output = process.argv[3];
const worldModule = require(join(output, "simulation/world.js"));
const orders = require(join(output, "simulation/orders.js"));
const visibilityCache = require(join(output, "simulation/visibilityCache.js"));
const mapPath = "campaigns/human/level05h.smp.gz";
const manifest = JSON.parse(readFileSync(join(root, "public/wargus/manifest.json"), "utf8"));
const map = manifest.maps.find((candidate) => candidate.path === mapPath) ?? manifest.maps[0];
const setup = JSON.parse(readFileSync(join(root, "public/wargus", map.setupJson), "utf8"));
const world = worldModule.createInitialWorld(
  map, manifest.units, setup, manifest.upgrades, manifest.missiles, manifest.spells,
  manifest.allowRules, manifest.dependencies, manifest.buttons, manifest.engineSettings,
  manifest.aiDefinitions, manifest.unitDatabase, manifest.tilesets, manifest.animations
);
const tickSeconds = 1 / worldModule.sourceDefaultGameSpeed(world);
function step(n) {
  for (let i = 0; i < n; i += 1) {
    orders.simulateWorld(world, tickSeconds, {
      now: () => 0,
      maxMilliseconds: 60_000,
      maxSteps: 1,
      maxBacklogSeconds: orders.SIMULATION_MAX_BACKLOG_SECONDS
    });
  }
}
// Freeze AI/auto orders so the world can become stationary: stop all units.
for (const unit of world.units) {
  if (unit.hitPoints > 0) {
    orders.issueStopOrder(world, unit.id);
  }
}
// Disable AI thinking for a pure stationary FOV sample when possible.
for (const state of world.aiStates) {
  state.enabled = false;
}
step(2);
const afterWarm = visibilityCache.snapshotVisibilityDiagnostics(world);
assert.ok(afterWarm["plan025.visibility.fullRebuilds"] >= 1, "warm path must rebuild at least once");
const visibleBefore = Buffer.from(world.visibleTiles);
const exploredBefore = Buffer.from(world.exploredTiles);
const rebuildsBefore = afterWarm["plan025.visibility.fullRebuilds"];
const skipsBefore = afterWarm["plan025.visibility.skippedRebuilds"];
step(8);
const afterIdle = visibilityCache.snapshotVisibilityDiagnostics(world);
assert.ok(
  afterIdle["plan025.visibility.skippedRebuilds"] > skipsBefore,
  "stationary ticks must skip local FOV rebuilds"
);
assert.equal(
  afterIdle["plan025.visibility.fullRebuilds"],
  rebuildsBefore,
  "stationary ticks must not force additional full rebuilds"
);
assert.ok(world.visibleTiles.every((value, index) => value === visibleBefore[index]), "skip must preserve visible tiles");
assert.ok(world.exploredTiles.every((value, index) => value === exploredBefore[index]), "skip must preserve explored tiles");

// Moving a unit must force a rebuild and change the signature path.
const mover = world.units.find((unit) => unit.player === world.visibilityPlayer && unit.speed > 0 && unit.hitPoints > 0 && !unit.construction);
assert.ok(mover, "need a movable local unit");
orders.issueMoveOrder(world, mover.id, mover.x + world.tileSize * 4, mover.y);
// Drain a few ticks so path resolves and unit moves across a tile boundary if possible.
step(20);
const afterMove = visibilityCache.snapshotVisibilityDiagnostics(world);
assert.ok(
  afterMove["plan025.visibility.fullRebuilds"] + (afterMove["plan025.visibility.incrementalRebuilds"] || 0)
    > rebuildsBefore,
  "unit movement must invalidate and rebuild visibility"
);
// After movement settles, idle ticks should skip again.
step(12);
const afterSettle = visibilityCache.snapshotVisibilityDiagnostics(world);
assert.ok(
  afterSettle["plan025.visibility.skippedRebuilds"] > afterIdle["plan025.visibility.skippedRebuilds"],
  "post-move idle ticks should resume FOV skips"
);

console.log(JSON.stringify({
  ok: true,
  warm: afterWarm,
  idle: afterIdle,
  afterMove: afterMove,
  afterSettle: afterSettle
}, null, 2));
`, "utf8");

  const run = spawnSync(process.execPath, [runnerPath, root, output], { cwd: root, encoding: "utf8", timeout: 120_000 });
  if (run.status !== 0) {
    throw new Error(`visibility fog verifier failed:\\n${run.stdout}\\n${run.stderr}`);
  }
  console.log(run.stdout.trim());
} finally {
  rmSync(output, { recursive: true, force: true });
}
