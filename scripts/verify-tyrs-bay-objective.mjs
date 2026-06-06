import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const sourceRaceSource = readFileSync("src/wargus/sourceRace.ts", "utf8");
const sourcePath = `${manifest.dataRoot}/campaigns/orc/level09o_c.sms`;
const source = readFileSync(sourcePath, "utf8");
const errors = [];

function error(message) {
  errors.push(message);
}

function findBalancedParenEnd(sourceText, openIndex) {
  let depth = 0;
  let inString = false;
  for (let index = openIndex; index < sourceText.length; index += 1) {
    const char = sourceText[index];
    const previous = sourceText[index - 1];
    if (char === '"' && previous !== "\\") {
      inString = !inString;
    }
    if (inString) {
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth === 0) {
      return index;
    }
  }
  return sourceText.length;
}

function victoryTriggerBodies(sourceText) {
  const bodies = [];
  let start = 0;
  while ((start = sourceText.indexOf("AddTrigger(", start)) !== -1) {
    const openIndex = sourceText.indexOf("(", start);
    const closeIndex = findBalancedParenEnd(sourceText, openIndex);
    const call = sourceText.slice(openIndex + 1, closeIndex);
    const match = call.match(/function\(\) return ([\s\S]*?) end\s*,\s*function\(\) return ActionVictory\(\) end/);
    if (match) {
      bodies.push(match[1]);
    }
    start = closeIndex + 1;
  }
  return bodies;
}

function sourceLocationBuildRequirements(sourceText) {
  return victoryTriggerBodies(sourceText)
    .map((body) => ({
      clauses: [...body.matchAll(/GetNumUnitsAt\(\s*(GetThisPlayer\(\)|\d+)\s*,\s*"([^"]+)"\s*,\s*\{\s*(-?\d+)\s*,\s*(-?\d+)\s*\}\s*,\s*\{\s*(-?\d+)\s*,\s*(-?\d+)\s*\}\s*\)\s*>\s*(\d+)/g)]
        .map((match) => ({
          player: match[1] === "GetThisPlayer()" ? "self" : Number(match[1]),
          unitTypeId: match[2],
          minX: Number(match[3]),
          minY: Number(match[4]),
          maxX: Number(match[5]),
          maxY: Number(match[6]),
          minimum: Number(match[7]) + 1
        }))
    }))
    .filter((requirement) => requirement.clauses.length > 0);
}

function sameClause(left, right) {
  return left.player === right.player
    && left.unitTypeId === right.unitTypeId
    && left.minX === right.minX
    && left.minY === right.minY
    && left.maxX === right.maxX
    && left.maxY === right.maxY
    && left.minimum === right.minimum;
}

function hasRequirement(requirements, expected) {
  return (requirements ?? []).some((requirement) => (
    requirement.clauses.length === expected.clauses.length
      && expected.clauses.every((clause) => requirement.clauses.some((candidate) => sameClause(candidate, clause)))
  ));
}

const map = (manifest.maps ?? []).find((entry) => entry.path === "campaigns/orc/level09o.smp.gz");
if (!map?.objectives?.some((objective) => /tyr's bay/i.test(objective))) {
  error("Orc mission IX objective metadata no longer names Tyr's Bay.");
}

const expected = sourceLocationBuildRequirements(source);
if (expected.length !== 5 || expected.some((requirement) => requirement.clauses.length !== 2)) {
  error(`Expected five source Tyr's Bay victory trigger groups with fortress+shipyard clauses, found ${expected.length}.`);
}

for (const requirement of expected) {
  if (!hasRequirement(map?.locationBuildRequirements, requirement)) {
    error(`Manifest map is missing source Tyr's Bay location requirement ${JSON.stringify(requirement)}.`);
  }
  if (!hasRequirement(map?.setup?.locationBuildRequirements, requirement)) {
    error(`Manifest setup summary is missing source Tyr's Bay location requirement ${JSON.stringify(requirement)}.`);
  }
}

if (map?.setupJson) {
  const setup = JSON.parse(readFileSync(`public/wargus/${map.setupJson}`, "utf8"));
  for (const requirement of expected) {
    if (!hasRequirement(setup.locationBuildRequirements, requirement)) {
      error(`Setup JSON is missing source Tyr's Bay location requirement ${JSON.stringify(requirement)}.`);
    }
  }
} else {
  error("Orc mission IX has no setup JSON path.");
}

for (const [name, fileSource, fragments] of [
  ["types", typesSource, ["locationBuildRequirements?: WargusLocationBuildRequirement[]", "export interface WargusLocationBuildClause"]],
  ["indexer", indexSource, ["locationBuildRequirements: parseLocationBuildRequirements(campaignSource)", "function parseLocationBuildRequirements", "parseTriggerBodies(source, \"ActionVictory\")"]],
  ["world", worldSource, ['locationBuildRequirements: WargusMapSetup["locationBuildRequirements"]', "locationBuildRequirements: setup?.locationBuildRequirements ?? map.locationBuildRequirements ?? []"]],
  ["runtime", ordersSource, [
    "world.locationBuildRequirements.length > 0",
    "countLiveUnitTypeInTileRect(world, player, clause.unitTypeId",
    "clause.minimum",
    'const fortressTypes = sourceDestructionTypeGroup(world, ["unit-fortress"], (definition) =>',
    "sourceTownCenterTier(world, definition.id, new Set()) >= 3",
    'raceTypeScore(world, definition, "orc") > 0',
    'const shipyardTypes = sourceDestructionTypeGroup(world, ["unit-orc-shipyard"], (definition) =>',
    "sourceBuildDefinitionProducesMatching(world, definition.id, isNavalCombatOrUtilityDefinition)",
    "countLiveUnitTypesInTileRect(world, world.visibilityPlayer, fortressTypes",
    "countLiveUnitTypesInTileRect(world, world.visibilityPlayer, shipyardTypes"
  ]],
  ["save/load", saveSource, ['locationBuildRequirements?: WorldState["locationBuildRequirements"]', "function normalizeLocationBuildRequirements", "world.locationBuildRequirements = normalizeLocationBuildRequirements"]]
]) {
  for (const fragment of fragments) {
    if (!fileSource.includes(fragment)) {
      error(`${name} is missing source location-build fragment: ${fragment}`);
    }
  }
}

if (ordersSource.includes('countLiveUnitTypeInTileRect(world, world.visibilityPlayer, "unit-fortress", 52, 15, 72, 40)')) {
  error("Tyr's Bay fallback still checks only the stock fortress type id.");
}

if (ordersSource.includes('countLiveUnitTypeInTileRect(world, world.visibilityPlayer, "unit-orc-shipyard"')) {
  error("Tyr's Bay fallback still checks only the stock orc shipyard type id.");
}

if (!ordersSource.includes("sourceRaceScoreForUnitDefinition(definition, world.unitDatabase, race)")) {
  error("Runtime objective race matching should route through the shared source-race helper.");
}

if (!sourceRaceSource.includes("sourceUnitDatabase.find((entry) => entry.unitTypeId === definition.id)?.race")) {
  error("Runtime objective race matching should prefer UnitDatabase race records.");
}

if (!sourceRaceSource.includes("definition.source, definition.image, definition.icon")) {
  error("Runtime objective race matching should consult preserved source/image/icon paths before id-name fallbacks.");
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Tyr's Bay objective errors: ${errors.length}`);
  process.exit(1);
}

console.log("Tyr's Bay objective verified (5 source GetNumUnitsAt trigger groups indexed and consumed by browser runtime).");
