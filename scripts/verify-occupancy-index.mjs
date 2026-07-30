import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = process.cwd();
const output = mkdtempSync(join(tmpdir(), "wargus-occupancy-index-"));

try {
  const compiler = spawnSync(process.execPath, [
    resolve(root, "node_modules/typescript/bin/tsc"),
    "--ignoreConfig",
    "src/simulation/occupancyIndex.ts",
    "src/simulation/passability.ts",
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
  const passability = createRequire(import.meta.url)(join(output, "simulation/passability.js"));
  occupancy.setWorldOccupancyParityMode("full");
  const makeUnit = (id, tileX, tileY, tileWidth = 1, tileHeight = 1) => ({
    id, x: tileX * 32 + 16, y: tileY * 32 + 16, tileWidth, tileHeight,
    hitPoints: 30, kind: "land", nonSolid: false, speed: 10, order: null, hiddenInConstructionId: null
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
  const movingBlocker = makeUnit("moving-blocker", 3, 3);
  movingBlocker.order = { kind: "move", path: [{ x: 3, y: 3 }, { x: 4, y: 3 }], pathIndex: 1 };
  const passabilityWorld = { map: { width: 8, height: 8 }, tileSize: 32, tiles: Array(64).fill(0), tilesetTerrain: null, units: [movingBlocker] };
  assert.equal(passability.isTilePassable(passabilityWorld, 3, 3, "land"), false,
    "Live solid occupants must block the migrated passability consumer.");
  assert.equal(passability.unitFootprintPathPlanningCost(passabilityWorld, 3, 3, makeUnit("walker", 2, 3)), 5,
    "An actively moving occupant must retain the legacy path-planning crossing cost.");
  movingBlocker.hitPoints = 0;
  assert.equal(passability.isTilePassable(passabilityWorld, 3, 3, "land"), true,
    "Predicate-only hit-point changes must be observed live without reindexing.");
  movingBlocker.hitPoints = 30;
  movingBlocker.hiddenInConstructionId = "foundation";
  assert.equal(passability.isTilePassable(passabilityWorld, 3, 3, "land"), true,
    "Predicate-only construction hiding must be observed live without reindexing.");
  movingBlocker.hiddenInConstructionId = null;
  movingBlocker.order = null;
  assert.equal(passability.unitFootprintPathPlanningCost(passabilityWorld, 3, 3, makeUnit("walker-2", 2, 3)), Number.POSITIVE_INFINITY,
    "Stationary occupancy must retain the legacy path-planning blocking result.");

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

  occupancy.setWorldOccupancyParityMode("full");
  const reorderA = makeUnit("reorder-a", 3, 3);
  const reorderB = makeUnit("reorder-b", 3, 3);
  const driftWorld = { map: { width: 16, height: 16 }, tileSize: 32, units: [reorderA, reorderB] };
  occupancy.resetWorldOccupancyDiagnostics();
  assert.deepEqual(occupancy.queryWorldOccupantsAtTile(driftWorld, 3, 3), [reorderA, reorderB]);
  driftWorld.units.reverse();
  assert.deepEqual(occupancy.queryWorldOccupantsAtTile(driftWorld, 3, 3), [reorderB, reorderA],
    "Same-reference order drift must use the authoritative full-scan result.");
  assert.equal(occupancy.snapshotWorldOccupancyDiagnostics()["plan023.occupancy.fullScanFallbacks"], 1);
  occupancy.queryWorldOccupantsAtTile(driftWorld, 3, 3);
  reorderA.x = 6 * 32 + 16;
  reorderA.y = 6 * 32 + 16;
  assert.deepEqual(occupancy.queryWorldOccupantsAtTile(driftWorld, 3, 3), [reorderB],
    "Unowned position drift must not return stale former-tile membership.");
  assert.equal(occupancy.snapshotWorldOccupancyDiagnostics()["plan023.occupancy.fullScanFallbacks"], 2);
  assert.deepEqual(occupancy.queryWorldOccupantsAtTile(driftWorld, 6, 6), [reorderA],
    "The query after a drift fallback must rebuild current membership.");

  occupancy.setWorldOccupancyParityMode("off");
  occupancy.resetWorldOccupancyDiagnostics();
  for (let index = 0; index < 2100; index += 1) occupancy.queryWorldOccupantsAtTile(driftWorld, 3, 3);
  assert.equal(occupancy.snapshotWorldOccupancyDiagnostics()["plan023.occupancy.queryDurationMs"].sampleCount, 2048,
    "Hot-path timing must remain bounded without shifting the sample array.");

  const ordersSource = readFileSync(resolve(root, "src/simulation/orders.ts"), "utf8");
  const passabilitySource = readFileSync(resolve(root, "src/simulation/passability.ts"), "utf8");
  const saveSource = readFileSync(resolve(root, "src/wargus/saveGame.ts"), "utf8");
  const mainSource = readFileSync(resolve(root, "src/main.ts"), "utf8");
  const fixtureBoundary = ordersSource.indexOf("export function runPlan014AiScoutEligibilityFixture");
  const runtimeOrdersSource = ordersSource.slice(0, fixtureBoundary);
  assert.equal(runtimeOrdersSource.split("appendWorldUnits(").length - 2, 11, "All eleven production append seams must route through registration.");
  assert.equal(runtimeOrdersSource.split("replaceWorldUnits(").length - 2, 11, "All eleven production replacements must route through unregister and invalidation.");
  assert.ok(runtimeOrdersSource.includes("for (const unit of units) {\n    world.units.push(unit);\n    registerWorldOccupant(world, unit);"),
    "Batch append must register each unit immediately after its authoritative append.");
  assert.ok(passabilitySource.includes("for (const unit of queryWorldOccupantsAtTile(world, tileX, tileY))"),
    "Passability blocker enumeration must use ordered tile candidates.");
  assert.ok(runtimeOrdersSource.includes("queryWorldOccupantsAtTile(world, unitTile.x, unitTile.y).find"),
    "Stack recovery must retain first-match semantics over ordered tile candidates.");
  assert.equal(/occupancy(?:Index|Cache|Diagnostics)/i.test(saveSource), false, "Transient occupancy state must not enter save serialization.");
  assert.equal(mainSource.split("invalidateWorldOccupancyIndex(world);").length - 1, 20,
    "Every coordinator-owned global-world mutation must invalidate occupancy immediately.");
  assert.ok(mainSource.includes("if (performanceSmokeEnabled) setWorldOccupancyParityMode(\"sampled\");"),
    "Performance/development capture must explicitly enable deterministic sampled parity.");
} finally {
  rmSync(output, { recursive: true, force: true });
}

console.log("Occupancy index verified.");
