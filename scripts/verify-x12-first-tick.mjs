import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = process.cwd();
const output = mkdtempSync(join(tmpdir(), "wargus-x12-first-tick-"));
const mapPath = "campaigns/human-exp/levelx12h.smp.gz";
const maximumFirstTickMilliseconds = 2_500;

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
    throw new Error(`X12 first-tick fixture compile failed:\n${compiler.stdout}${compiler.stderr}`);
  }
  copyFileSync(resolve(root, "src/wargus/scoutProvenance.mjs"), join(output, "wargus/scoutProvenance.mjs"));

  const runnerPath = join(output, "run-x12-first-tick.cjs");
  writeFileSync(runnerPath, `
const { performance } = require("node:perf_hooks");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = process.argv[2];
const output = process.argv[3];
const mapPath = process.argv[4];
const manifest = JSON.parse(readFileSync(join(root, "public/wargus/manifest.json"), "utf8"));
const map = manifest.maps.find((candidate) => candidate.path === mapPath);
if (!map?.setupJson) throw new Error("X12 setup is missing from the manifest.");
const setup = JSON.parse(readFileSync(join(root, "public/wargus", map.setupJson), "utf8"));
const worldModule = require(join(output, "simulation/world.js"));
const orders = require(join(output, "simulation/orders.js"));
const pathfinding = require(join(output, "simulation/pathfinding.js"));
pathfinding.resetPathfindingDiagnostics();
const world = worldModule.createInitialWorld(
  map,
  manifest.units,
  setup,
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
process.stdout.write(JSON.stringify({ phase: "world-ready", units: world.units.length, tick: world.tick }) + "\\n");
const tickBefore = world.tick;
const startedAt = performance.now();
orders.simulateWorld(world, 1 / worldModule.sourceDefaultGameSpeed(world), {
  now: () => performance.now(),
  maxMilliseconds: 8,
  maxSteps: 8,
  maxBacklogSeconds: orders.SIMULATION_MAX_BACKLOG_SECONDS
});
process.stdout.write(JSON.stringify({
  phase: "first-tick-complete",
  elapsedMilliseconds: performance.now() - startedAt,
  tickBefore,
  tickAfter: world.tick,
  pathfinding: pathfinding.snapshotPathfindingDiagnostics()
}) + "\\n");
`, "utf8");

  const firstTick = spawnSync(process.execPath, [runnerPath, root, output, mapPath], {
    cwd: root,
    encoding: "utf8",
    timeout: maximumFirstTickMilliseconds
  });
  const outputText = `${firstTick.stdout ?? ""}${firstTick.stderr ?? ""}`;
  assert.match(outputText, /"phase":"world-ready"/, "X12 fixture must create the production world before testing its first tick.");
  if (firstTick.error?.code === "ETIMEDOUT") {
    throw new Error(`X12 first active simulation step exceeded ${maximumFirstTickMilliseconds}ms.\n${outputText}`);
  }
  if (firstTick.status !== 0) {
    throw new Error(`X12 first active simulation step failed with status ${firstTick.status}.\n${outputText}`);
  }
  const completionLine = firstTick.stdout
    .split("\n")
    .find((line) => line.includes('\"phase\":\"first-tick-complete\"'));
  assert.ok(completionLine, "X12 first active simulation step did not report completion.");
  const completion = JSON.parse(completionLine);
  assert.equal(completion.tickAfter, completion.tickBefore + 1, "X12 first active simulation step must advance exactly one tick.");

  console.log(`X12 first active simulation step verified (${completion.elapsedMilliseconds.toFixed(3)}ms, tick ${completion.tickBefore}->${completion.tickAfter}).`);
} finally {
  rmSync(output, { recursive: true, force: true });
}
