import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = process.cwd();
const output = mkdtempSync(join(tmpdir(), "wargus-unit-index-"));

function unit(id, label, hitPoints = 30) {
  return { id, label, hitPoints };
}

function world(units, tick = 0) {
  return { units, tick };
}

try {
  const compiler = spawnSync(process.execPath, [
    resolve(root, "node_modules/typescript/bin/tsc"),
    "--ignoreConfig",
    "src/simulation/worldSelectors.ts",
    "src/simulation/orders.ts",
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
  if (compiler.status !== 0) {
    throw new Error(`Unit-index fixture compile failed:\n${compiler.stdout}${compiler.stderr}`);
  }

  const require = createRequire(import.meta.url);
  const selectors = require(join(output, "simulation/worldSelectors.js"));
  const orders = require(join(output, "simulation/orders.js"));
  const {
    assertWorldUnitIndexIntegrity,
    findWorldUnitById,
    invalidateWorldUnitIndex,
    readWorldUnitIndexDiagnostics,
    resetWorldUnitIndexDiagnostics
  } = selectors;

  const productionSourceInventory = spawnSync("rg", [
    "--pcre2",
    "-n",
    String.raw`\.id\s*(?:\+\+|--|(?<![=!<>])=(?!=))|\[['"]id['"]\]\s*(?:\+\+|--|(?<![=!<>])=(?!=))|Object\.assign\([^\n]*(?:unit|candidate|target)[^\n]*\bid\b|Reflect\.set\([^\n]*(?:unit|candidate|target)[^\n]*['"]id['"]`,
    "src",
    "--glob",
    "*.ts"
  ], { cwd: root, encoding: "utf8" });
  assert.ok(
    productionSourceInventory.status === 0 || productionSourceInventory.status === 1,
    `Production unit-ID mutation inventory failed:\n${productionSourceInventory.stdout}${productionSourceInventory.stderr}`
  );
  assert.equal(productionSourceInventory.stdout, "",
    "Production runtime must never assign or mutate an existing WorldUnit.id.");

  resetWorldUnitIndexDiagnostics();
  const stableTickUnit = unit("stable-tick", "stable tick");
  const stableTickWorld = world([stableTickUnit]);
  assert.equal(findWorldUnitById(stableTickWorld, "stable-tick"), stableTickUnit,
    "The stable-tick fixture must build the exact-ID index once.");
  for (let tick = 1; tick <= 600; tick += 1) {
    stableTickWorld.tick = tick;
    assert.equal(findWorldUnitById(stableTickWorld, "stable-tick"), stableTickUnit,
      "Tick-only progress must preserve exact-ID lookup behavior.");
  }
  const stableTickDiagnostics = readWorldUnitIndexDiagnostics();
  assert.equal(stableTickDiagnostics["plan020.unitIdIndex.rebuilds"], 1,
    "Advancing 600 ticks without mutating world.units must reuse one transient index rebuild.");

  resetWorldUnitIndexDiagnostics();
  const first = unit("duplicate", "first");
  const second = unit("second", "second");
  const stableWorld = world([first, second]);
  const serializedStableWorld = JSON.stringify(stableWorld);
  assert.equal(findWorldUnitById(stableWorld, "duplicate"), first,
    "Exact-ID lookup must return the matching authoritative array entry.");
  assert.equal(findWorldUnitById(stableWorld, "duplicate"), first,
    "Stable repeated lookup must preserve the matching object identity.");
  assert.equal(findWorldUnitById(stableWorld, "missing"), undefined,
    "Missing exact IDs must preserve legacy undefined behavior.");
  assert.equal(JSON.stringify(stableWorld), serializedStableWorld,
    "Lookup cache and diagnostics must remain absent from serialized world state.");
  assert.deepEqual(readWorldUnitIndexDiagnostics(), {
    "plan020.unitIdIndex.lookups": 3,
    "plan020.unitIdIndex.rebuilds": 1,
    "plan020.unitIdIndex.invalidations": 0,
    "plan020.unitIdIndex.duplicateIds": 0
  }, "Stable repeated lookups must reuse one transient index rebuild.");

  stableWorld.tick += 1;
  assert.equal(findWorldUnitById(stableWorld, "second"), second,
    "A world tick change must preserve exact-ID lookup behavior.");
  assert.equal(readWorldUnitIndexDiagnostics()["plan020.unitIdIndex.rebuilds"], 1,
    "A world tick change without a unit-array mutation must reuse the transient index.");

  const pushed = unit("pushed", "pushed");
  stableWorld.units.push(pushed);
  assert.equal(findWorldUnitById(stableWorld, "pushed"), pushed,
    "A same-tick push must become visible through length-based rebuilding.");
  assert.equal(readWorldUnitIndexDiagnostics()["plan020.unitIdIndex.rebuilds"], 2,
    "A same-tick length change must rebuild the transient index.");

  stableWorld.units = stableWorld.units.filter((candidate) => candidate !== second);
  assert.equal(findWorldUnitById(stableWorld, "second"), undefined,
    "A filter replacement must remove stale exact-ID entries.");
  assert.equal(readWorldUnitIndexDiagnostics()["plan020.unitIdIndex.rebuilds"], 3,
    "An array-reference change must rebuild the transient index.");

  const originalUnits = stableWorld.units;
  const temporary = unit("temporary", "temporary");
  stableWorld.units = [first, temporary];
  assert.equal(findWorldUnitById(stableWorld, "temporary"), temporary,
    "A temporary same-length array replacement must be indexed.");
  stableWorld.units = originalUnits;
  assert.equal(findWorldUnitById(stableWorld, "pushed"), pushed,
    "Restoring the authoritative array reference must restore its exact-ID entries.");
  assert.equal(readWorldUnitIndexDiagnostics()["plan020.unitIdIndex.rebuilds"], 5,
    "Temporary replacement and restoration must each rebuild by reference.");

  const replacement = unit("replacement", "replacement");
  stableWorld.units[0] = replacement;
  invalidateWorldUnitIndex(stableWorld);
  assert.equal(findWorldUnitById(stableWorld, "replacement"), replacement,
    "Explicit invalidation must expose same-reference, same-length replacement.");
  assert.equal(findWorldUnitById(stableWorld, "duplicate"), undefined,
    "Explicit invalidation must remove stale entries after indexed replacement.");
  assert.equal(readWorldUnitIndexDiagnostics()["plan020.unitIdIndex.invalidations"], 1,
    "Explicit invalidation must increment its namespaced diagnostic.");
  assert.equal(readWorldUnitIndexDiagnostics()["plan020.unitIdIndex.rebuilds"], 6,
    "Explicit invalidation must cause exactly one subsequent rebuild.");

  const sharedUnits = [unit("shared", "shared")];
  const independentA = world(sharedUnits, 8);
  const independentB = world(sharedUnits, 8);
  assert.equal(findWorldUnitById(independentA, "shared"), sharedUnits[0]);
  assert.equal(findWorldUnitById(independentB, "shared"), sharedUnits[0]);
  assert.equal(readWorldUnitIndexDiagnostics()["plan020.unitIdIndex.rebuilds"], 8,
    "Distinct WorldState identities must own independent caches even when their arrays are shared.");

  const loadedWorld = structuredClone(independentA);
  assert.equal(findWorldUnitById(loadedWorld, "shared")?.id, "shared",
    "A load-created WorldState identity must build an independent cache.");
  assert.equal(readWorldUnitIndexDiagnostics()["plan020.unitIdIndex.rebuilds"], 9,
    "A load-created WorldState identity must not reuse the source world's cache.");

  const dead = unit("dead", "dead", 0);
  const deadWorld = world([dead], 3);
  assert.equal(findWorldUnitById(deadWorld, "dead"), dead,
    "Exact-ID lookup must retain dead units while they remain in the authoritative array.");
  const lifecycleDiagnostics = readWorldUnitIndexDiagnostics();
  assert.deepEqual(lifecycleDiagnostics, {
    "plan020.unitIdIndex.lookups": 14,
    "plan020.unitIdIndex.rebuilds": 10,
    "plan020.unitIdIndex.invalidations": 1,
    "plan020.unitIdIndex.duplicateIds": 0
  }, "Lifecycle diagnostics must count lookups, rebuild causes, and explicit invalidation exactly.");

  resetWorldUnitIndexDiagnostics();
  const duplicateFirst = unit("same-id", "first duplicate");
  const duplicateLast = unit("same-id", "last duplicate");
  const duplicateWorld = world([duplicateFirst, duplicateLast], 5);
  assert.equal(findWorldUnitById(duplicateWorld, "same-id"), duplicateFirst,
    "Production lookup must preserve legacy first-match behavior for duplicate IDs.");
  assert.throws(
    () => assertWorldUnitIndexIntegrity(duplicateWorld),
    /Duplicate world unit IDs: same-id/,
    "Development verification must surface duplicate IDs as a contract failure."
  );
  const duplicateDiagnostics = readWorldUnitIndexDiagnostics();
  assert.deepEqual(duplicateDiagnostics, {
    "plan020.unitIdIndex.lookups": 1,
    "plan020.unitIdIndex.rebuilds": 1,
    "plan020.unitIdIndex.invalidations": 0,
    "plan020.unitIdIndex.duplicateIds": 1
  }, "Duplicate diagnostics must record the duplicate while preserving first-match lookup.");

  resetWorldUnitIndexDiagnostics();
  const resetDiagnostics = readWorldUnitIndexDiagnostics();
  assert.deepEqual(resetDiagnostics, {
    "plan020.unitIdIndex.lookups": 0,
    "plan020.unitIdIndex.rebuilds": 0,
    "plan020.unitIdIndex.invalidations": 0,
    "plan020.unitIdIndex.duplicateIds": 0
  }, "Plan-local diagnostics must reset without entering world state.");

  const commandUnit = { ...unit("command-unit", "command unit"), player: 1, typeId: "unit-footman" };
  const commandWorld = { ...world([commandUnit], 9), buttonDefinitions: [] };
  assert.equal(orders.selectionHasSpecialHotkeyMeaning(commandWorld, ["command-unit"], "KeyS", 1), false);
  assert.equal(orders.selectionHasSpecialHotkeyMeaning(commandWorld, ["command-unit"], "KeyS", 1), false);
  const commandDiagnostics = readWorldUnitIndexDiagnostics();
  assert.deepEqual(commandDiagnostics, {
    "plan020.unitIdIndex.lookups": 2,
    "plan020.unitIdIndex.rebuilds": 1,
    "plan020.unitIdIndex.invalidations": 0,
    "plan020.unitIdIndex.duplicateIds": 0
  }, "Repeated command-path exact-ID resolution must use the transient index through the private hot wrapper.");

  const ordersSource = readFileSync(resolve(root, "src/simulation/orders.ts"), "utf8");
  const fixtureBoundary = ordersSource.indexOf("export function runPlan014AiScoutEligibilityFixture");
  assert.ok(fixtureBoundary > 0, "Runtime mutation inventory requires the known Plan 014 fixture boundary.");
  const runtimeSource = ordersSource.slice(0, fixtureBoundary);
  const assignments = [...runtimeSource.matchAll(/world\.units\s*=/g)];
  const pushes = [...runtimeSource.matchAll(/world\.units\.push\s*\(/g)];
  const undetectableMutations = [...runtimeSource.matchAll(
    /world\.units\.(?:splice|pop|shift|unshift|sort|reverse|copyWithin|fill)\s*\(|world\.units\[[^\]]+\]\s*=/g
  )];
  assert.equal(assignments.length, 11,
    "Runtime inventory must retain seven filter replacements plus four temporary array swaps/restores.");
  assert.equal(pushes.length, 11,
    "Runtime inventory must retain eleven authoritative-array pushes.");
  assert.deepEqual(undetectableMutations, [],
    "Every same-reference, same-length runtime mutation requires an owned explicit invalidation case.");

  console.log(JSON.stringify({
    diagnostics: {
      stableTicks: stableTickDiagnostics,
      lifecycle: lifecycleDiagnostics,
      duplicate: duplicateDiagnostics,
      reset: resetDiagnostics,
      commandPath: commandDiagnostics
    },
    mutationInventory: {
      assignments: assignments.length,
      pushes: pushes.length,
      sameReferenceSameLength: undetectableMutations.length,
      total: assignments.length + pushes.length
    }
  }));
  console.log("Unit ID index verified (600 stable ticks, immutable IDs, first-match parity, lifecycle rebuilds, explicit invalidation, independent worlds, load identity, dead units, duplicates, diagnostics, and 22 runtime mutations).");
} finally {
  rmSync(output, { recursive: true, force: true });
}
