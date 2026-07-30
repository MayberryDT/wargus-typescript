import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = process.cwd();
const output = mkdtempSync(join(tmpdir(), "wargus-occupancy-index-"));

try {
  const compiler = spawnSync(process.execPath, [
    resolve(root, "node_modules/typescript/bin/tsc"),
    "--ignoreConfig",
    "src/simulation/occupancyIndex.ts",
    "--outDir", output,
    "--target", "ES2022",
    "--module", "CommonJS",
    "--moduleResolution", "Node",
    "--skipLibCheck",
    "--esModuleInterop",
    "--verbatimModuleSyntax", "false",
    "--ignoreDeprecations", "6.0",
    "--noEmitOnError", "true"
  ], { cwd: root, encoding: "utf8" });
  assert.equal(compiler.status, 0, `Occupancy-index fixture compile failed:\n${compiler.stdout}${compiler.stderr}`);

  const occupancy = createRequire(import.meta.url)(join(output, "simulation/occupancyIndex.js"));
  const makeUnit = (id, tileX, tileY, tileWidth = 1, tileHeight = 1) => ({
    id, x: tileX * 32 + 16, y: tileY * 32 + 16, tileWidth, tileHeight
  });
  const local = makeUnit("local", 4, 4);
  const units = [
    ...Array.from({ length: 1000 }, (_, index) => makeUnit(`far-${index}`, 20 + index % 30, 20 + Math.floor(index / 30))),
    local
  ];
  const world = { map: { width: 80, height: 80 }, tileSize: 32, units };

  occupancy.resetWorldOccupancyDiagnostics();
  assert.deepEqual(occupancy.queryWorldOccupantsAtTile(world, 4, 4), [local], "Tile query must preserve exact authoritative reference order.");
  const diagnostics = occupancy.snapshotWorldOccupancyDiagnostics();
  assert.equal(diagnostics["plan023.occupancy.queries"], 1);
  assert.ok(diagnostics["plan023.occupancy.candidatesVisited"] < 10,
    `One local tile query must not visit the full ${units.length}-unit array.`);
  const duplicateA = makeUnit("duplicate", 8, 8, 2, 2);
  const duplicateB = makeUnit("duplicate", 8, 8);
  const edge = makeUnit("edge", 0, 0, 3, 3);
  const lifecycleWorld = { map: { width: 16, height: 16 }, tileSize: 32, units: [duplicateA, edge, duplicateB] };
  assert.deepEqual(occupancy.queryWorldOccupantsAtTile(lifecycleWorld, 8, 8), [duplicateA, duplicateB], "Duplicate IDs must remain distinct in authoritative order.");
  assert.deepEqual(occupancy.queryWorldOccupantsInFootprint(lifecycleWorld, 7, 7, 2, 2), [duplicateA, duplicateB], "Footprint queries must deduplicate by identity and preserve rank order.");
  assert.deepEqual(occupancy.queryWorldOccupantsAtTile(lifecycleWorld, 0, 0), [edge], "Clipped edge footprints must remain queryable.");

  const beforeTransition = occupancy.snapshotWorldOccupant(lifecycleWorld, duplicateB);
  duplicateB.x = 10 * 32 + 16;
  duplicateB.y = 10 * 32 + 16;
  occupancy.transitionWorldOccupant(lifecycleWorld, duplicateB, beforeTransition);
  assert.deepEqual(occupancy.queryWorldOccupantsAtTile(lifecycleWorld, 8, 8), [duplicateA], "Transition must clear former membership.");
  assert.deepEqual(occupancy.queryWorldOccupantsAtTile(lifecycleWorld, 10, 10), [duplicateB], "Transition must publish new membership.");

  const appended = makeUnit("appended", 8, 8);
  lifecycleWorld.units.push(appended);
  occupancy.registerWorldOccupant(lifecycleWorld, appended);
  assert.deepEqual(occupancy.queryWorldOccupantsAtTile(lifecycleWorld, 8, 8), [duplicateA, appended], "Append registration must insert by authoritative rank.");

  occupancy.unregisterWorldOccupant(lifecycleWorld, duplicateA);
  lifecycleWorld.units = lifecycleWorld.units.filter((unit) => unit !== duplicateA);
  assert.deepEqual(occupancy.queryWorldOccupantsAtTile(lifecycleWorld, 8, 8), [appended], "Removal must rebuild from the replacement array.");

  lifecycleWorld.units = [edge, appended, duplicateB];
  occupancy.invalidateWorldOccupancyIndex(lifecycleWorld);
  assert.deepEqual(occupancy.queryWorldOccupantsAtTile(lifecycleWorld, 10, 10), [duplicateB], "Invalidation must rebuild on first later query.");
  occupancy.forceWorldOccupancyFallbackForTest(lifecycleWorld);
  assert.deepEqual(occupancy.queryWorldOccupantsAtTile(lifecycleWorld, 8, 8), [appended], "Corruption fallback must return the authoritative result.");
  assert.deepEqual(occupancy.queryWorldOccupantsAtTile(lifecycleWorld, 8, 8), [appended], "The next query must rebuild and resume indexed results.");
  assert.equal(occupancy.verifyWorldOccupancyParity(lifecycleWorld, 8, 8), true);

  const independent = { map: lifecycleWorld.map, tileSize: 32, units: [makeUnit("other", 8, 8)] };
  assert.equal(occupancy.queryWorldOccupantsAtTile(independent, 8, 8)[0], independent.units[0], "World identities must own independent caches.");
  assert.equal(occupancy.queryWorldOccupantsAtTile(lifecycleWorld, 8, 8)[0], appended, "Independent cache construction must not leak.");

  const finalDiagnostics = occupancy.snapshotWorldOccupancyDiagnostics();
  assert.equal(finalDiagnostics["plan023.occupancy.registers"], 1);
  assert.equal(finalDiagnostics["plan023.occupancy.unregisters"], 1);
  assert.equal(finalDiagnostics["plan023.occupancy.transitions"], 1);
  assert.equal(finalDiagnostics["plan023.occupancy.invalidations"], 1);
  assert.equal(finalDiagnostics["plan023.occupancy.fullScanFallbacks"], 1);
  assert.equal(finalDiagnostics["plan023.occupancy.parityFailures"], 0);
  assert.ok(finalDiagnostics["plan023.occupancy.rebuilds"] >= 4);
  for (const key of ["query", "register", "unregister", "transition", "invalidation", "rebuild"]) {
    assert.ok(finalDiagnostics[`plan023.occupancy.${key}DurationMs`].sampleCount > 0, `${key} duration must be recorded.`);
  }
  assert.ok(finalDiagnostics["plan023.occupancy.maintenanceTotalMs"] >= 0);
} finally {
  rmSync(output, { recursive: true, force: true });
}

console.log("Occupancy index verified.");
