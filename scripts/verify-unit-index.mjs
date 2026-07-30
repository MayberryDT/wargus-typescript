import assert from "node:assert/strict";
import ts from "typescript";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function createWorldUnitIdWriteProgram(extraRootNames) {
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
  assert.ok(configPath, "WorldUnit ID-write detection requires tsconfig.json.");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(config.error, undefined, "WorldUnit ID-write detection must read tsconfig.json.");
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  assert.deepEqual(parsed.errors, [], "WorldUnit ID-write detection must parse tsconfig.json.");
  return ts.createProgram({
    rootNames: [...new Set([...parsed.fileNames, ...extraRootNames])],
    options: { ...parsed.options, noEmit: true }
  });
}

function findWorldUnitIdWrites(program, sourceFiles) {
  const checker = program.getTypeChecker();
  const worldSource = program.getSourceFile(resolve(root, "src/simulation/world.ts"));
  assert.ok(worldSource, "WorldUnit ID-write detection requires src/simulation/world.ts.");
  const declaration = worldSource.statements.find((statement) => (
    ts.isInterfaceDeclaration(statement) && statement.name.text === "WorldUnit"
  ));
  assert.ok(declaration, "WorldUnit ID-write detection requires the WorldUnit interface.");
  const worldUnitType = checker.getTypeAtLocation(declaration.name);
  const writes = [];

  const unwrap = (node) => {
    let current = node;
    while (
      ts.isParenthesizedExpression(current)
      || ts.isNonNullExpression(current)
      || ts.isAsExpression(current)
      || ts.isTypeAssertionExpression(current)
      || ts.isSatisfiesExpression(current)
    ) {
      current = current.expression;
    }
    return current;
  };

  const typeContainsWorldUnit = (type, seen = new Set()) => {
    if (!type || seen.has(type.id) || (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never))) {
      return false;
    }
    seen.add(type.id);
    if (type.isUnionOrIntersection()) {
      return type.types.some((part) => typeContainsWorldUnit(part, seen));
    }
    if (checker.isTypeAssignableTo(type, worldUnitType)) {
      return true;
    }
    const constraint = checker.getBaseConstraintOfType(type);
    return Boolean(constraint && constraint !== type && typeContainsWorldUnit(constraint, seen));
  };

  const receiverIsWorldUnit = (expression) => typeContainsWorldUnit(checker.getTypeAtLocation(unwrap(expression)));

  const expressionCouldBeId = (expression) => {
    const candidate = unwrap(expression);
    if (ts.isStringLiteralLike(candidate)) {
      return candidate.text === "id";
    }
    if (ts.isNumericLiteral(candidate)) {
      return false;
    }
    const couldContainId = (type) => {
      if (type.isUnionOrIntersection()) {
        return type.types.some(couldContainId);
      }
      if (type.isStringLiteral()) {
        return type.value === "id";
      }
      return Boolean(type.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter));
    };
    return couldContainId(checker.getTypeAtLocation(candidate));
  };

  const accessIsWorldUnitId = (node) => {
    const target = unwrap(node);
    if (ts.isPropertyAccessExpression(target)) {
      return target.name.text === "id" && receiverIsWorldUnit(target.expression);
    }
    return ts.isElementAccessExpression(target)
      && Boolean(target.argumentExpression)
      && expressionCouldBeId(target.argumentExpression)
      && receiverIsWorldUnit(target.expression);
  };

  const assignmentTargetContainsWorldUnitId = (node) => {
    const target = unwrap(node);
    if (accessIsWorldUnitId(target)) {
      return true;
    }
    if (ts.isArrayLiteralExpression(target)) {
      return target.elements.some((element) => !ts.isOmittedExpression(element) && assignmentTargetContainsWorldUnitId(element));
    }
    if (ts.isObjectLiteralExpression(target)) {
      return target.properties.some((property) => {
        if (ts.isPropertyAssignment(property)) {
          return assignmentTargetContainsWorldUnitId(property.initializer);
        }
        if (ts.isSpreadAssignment(property)) {
          return assignmentTargetContainsWorldUnitId(property.expression);
        }
        return false;
      });
    }
    return false;
  };

  const callMatches = (node, namespace, method) => (
    ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === namespace
    && node.expression.name.text === method
  );

  const propertyNameCouldBeId = (name) => {
    if (!name) return true;
    if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text === "id";
    if (ts.isNumericLiteral(name)) return false;
    return ts.isComputedPropertyName(name) && expressionCouldBeId(name.expression);
  };

  const descriptorMapCouldWriteId = (expression) => {
    const descriptors = unwrap(expression);
    if (!ts.isObjectLiteralExpression(descriptors)) {
      return true;
    }
    return descriptors.properties.some((property) => (
      ts.isSpreadAssignment(property) || propertyNameCouldBeId(property.name)
    ));
  };

  const record = (node, kind) => {
    const sourceFile = node.getSourceFile();
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const lineText = sourceFile.text.split(/\r?\n/)[position.line] ?? "";
    const marker = lineText.match(/\/\/ (detector(?:-negative)?): ([a-z-]+)/)?.[2] ?? null;
    writes.push({ file: sourceFile.fileName, line: position.line + 1, column: position.character + 1, kind, marker });
  };

  const visit = (node) => {
    if (ts.isBinaryExpression(node) && ts.isAssignmentOperator(node.operatorToken.kind)
      && assignmentTargetContainsWorldUnitId(node.left)) {
      record(node, "assignment");
    } else if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
      && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)
      && assignmentTargetContainsWorldUnitId(node.operand)) {
      record(node, "update");
    } else if (ts.isDeleteExpression(node) && assignmentTargetContainsWorldUnitId(node.expression)) {
      record(node, "delete");
    } else if ((ts.isForInStatement(node) || ts.isForOfStatement(node))
      && !ts.isVariableDeclarationList(node.initializer)
      && assignmentTargetContainsWorldUnitId(node.initializer)) {
      record(node, ts.isForInStatement(node) ? "for-in" : "for-of");
    } else if (callMatches(node, "Object", "assign") && node.arguments[0]
      && receiverIsWorldUnit(node.arguments[0])) {
      record(node, "Object.assign");
    } else if (callMatches(node, "Reflect", "set") && node.arguments[0] && node.arguments[1]
      && receiverIsWorldUnit(node.arguments[0]) && expressionCouldBeId(node.arguments[1])) {
      record(node, "Reflect.set");
    } else if (callMatches(node, "Object", "defineProperty") && node.arguments[0] && node.arguments[1]
      && receiverIsWorldUnit(node.arguments[0]) && expressionCouldBeId(node.arguments[1])) {
      record(node, "Object.defineProperty");
    } else if (callMatches(node, "Object", "defineProperties") && node.arguments[0] && node.arguments[1]
      && receiverIsWorldUnit(node.arguments[0]) && descriptorMapCouldWriteId(node.arguments[1])) {
      record(node, "Object.defineProperties");
    }
    ts.forEachChild(node, visit);
  };

  for (const sourceFile of sourceFiles) {
    visit(sourceFile);
  }
  return writes;
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

  const detectorPositiveFixture = join(output, "world-unit-id-positive.ts");
  const detectorNegativeFixture = join(output, "world-unit-id-negative.ts");
  const worldUnitModule = JSON.stringify(resolve(root, "src/simulation/world"));
  writeFileSync(detectorPositiveFixture, `
import type { WorldState, WorldUnit } from ${worldUnitModule};
type UnitAlias = WorldUnit;
type Other = { id: string; label: string };
declare let direct: WorldUnit;
declare let alias: UnitAlias;
declare let worldState: WorldState;
declare let mixed: WorldUnit | Other;
declare let dynamicKey: keyof WorldUnit;
declare let values: string[];
declare function descriptors(): PropertyDescriptorMap;
direct.id = "direct"; // detector: direct-dot
direct["id"] += "-compound"; // detector: compound-bracket
const holder = alias;
holder.id = "alias"; // detector: alias-dot
worldState.units[0]!.id = "inferred"; // detector: inferred-element
mixed.id = "union"; // detector: union-dot
direct.id++; // detector: postfix-update
--direct["id"]; // detector: prefix-update
delete direct.id; // detector: delete-dot
[direct.id] = values; // detector: array-destructure
({ value: direct.id } = { value: "destructured" }); // detector: object-destructure
for (direct.id of values) {} // detector: for-of
for (direct.id in { key: "value" }) {} // detector: for-in
Object.assign(holder, { id: "assigned" }); // detector: object-assign
Reflect.set(holder, "id", "reflected"); // detector: reflect-literal
Reflect.set(holder, dynamicKey, "dynamic"); // detector: reflect-dynamic
Object.defineProperty(holder, "id", { value: "defined" }); // detector: define-property
Object.defineProperty(holder, dynamicKey, { value: "dynamic" }); // detector: define-property-dynamic
Object.defineProperties(holder, { id: { value: "defined" } }); // detector: define-properties
Object.defineProperties(holder, descriptors()); // detector: define-properties-dynamic
holder[dynamicKey] = "dynamic"; // detector: direct-dynamic
`, "utf8");
  writeFileSync(detectorNegativeFixture, `
type Unrelated = { id: string; value: number };
declare let record: Unrelated;
declare let unit: import(${worldUnitModule}).WorldUnit;
record.id = "unrelated"; // detector-negative: unrelated-dot
record["id"] += "-unrelated"; // detector-negative: unrelated-bracket
delete record.id; // detector-negative: unrelated-delete
Object.assign(record, { id: "unrelated" }); // detector-negative: unrelated-assign
Reflect.set(record, "id", "unrelated"); // detector-negative: unrelated-reflect
Object.defineProperty(record, "id", { value: "unrelated" }); // detector-negative: unrelated-define
Object.defineProperties(record, { id: { value: "unrelated" } }); // detector-negative: unrelated-defines
unit.hitPoints = 1; // detector-negative: other-dot
unit["hitPoints"] = 2; // detector-negative: other-bracket
Reflect.set(unit, "hitPoints", 3); // detector-negative: other-reflect
Object.defineProperty(unit, "hitPoints", { value: 4 }); // detector-negative: other-define
Object.defineProperties(unit, { hitPoints: { value: 5 } }); // detector-negative: other-defines
const readOnly = unit.id; // detector-negative: read-dot
const bracketReadOnly = unit["id"]; // detector-negative: read-bracket
const constructed = { id: "new", value: 1 }; // detector-negative: construction
void readOnly; void bracketReadOnly; void constructed;
`, "utf8");

  const detectorProgram = createWorldUnitIdWriteProgram([detectorPositiveFixture, detectorNegativeFixture]);
  const detectorFixtureWrites = findWorldUnitIdWrites(detectorProgram, [
    detectorProgram.getSourceFile(detectorPositiveFixture),
    detectorProgram.getSourceFile(detectorNegativeFixture)
  ].filter(Boolean));
  const detectedNegativeMarkers = detectorFixtureWrites
    .map((write) => write.marker).filter((marker) => marker?.startsWith("unrelated-") || marker?.startsWith("other-")
      || marker?.startsWith("read-") || marker === "construction").sort();
  assert.deepEqual(detectedNegativeMarkers, [],
    "WorldUnit ID-write detection must not flag writes to unrelated ID-bearing types or read-only access.");
  const detectedMarkers = detectorFixtureWrites.map((write) => write.marker).filter(Boolean).sort();
  const expectedMarkers = [
    "alias-dot", "array-destructure", "compound-bracket", "define-properties",
    "define-properties-dynamic", "define-property", "define-property-dynamic", "delete-dot",
    "direct-dot", "direct-dynamic", "for-in", "for-of", "inferred-element",
    "object-assign", "object-destructure", "postfix-update", "prefix-update",
    "reflect-dynamic", "reflect-literal", "union-dot"
  ].sort();
  assert.deepEqual(detectedMarkers, expectedMarkers,
    "WorldUnit ID-write detection must cover typed aliases and every supported write form without unrelated-ID false positives.");

  const productionRoot = `${resolve(root, "src")}/`;
  const productionSourceFiles = detectorProgram.getSourceFiles().filter((sourceFile) => (
    !sourceFile.isDeclarationFile && sourceFile.fileName.startsWith(productionRoot)
  ));
  const productionIdWrites = findWorldUnitIdWrites(detectorProgram, productionSourceFiles);
  assert.deepEqual(productionIdWrites, [],
    `Production runtime must never assign or mutate an existing WorldUnit.id:\n${JSON.stringify(productionIdWrites, null, 2)}`);

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
      unitIdWrites: productionIdWrites.length,
      total: assignments.length + pushes.length
    }
  }));
  console.log("Unit ID index verified (600 stable ticks, immutable IDs, first-match parity, lifecycle rebuilds, explicit invalidation, independent worlds, load identity, dead units, duplicates, diagnostics, and 22 runtime mutations).");
} finally {
  rmSync(output, { recursive: true, force: true });
}
