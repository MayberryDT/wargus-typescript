import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const errors = [];

function error(message) {
  errors.push(message);
}

function sourceRescuedCircleRequirements(source) {
  const pattern = /IfRescuedNearUnit\(\s*"this"\s*,\s*"[^"]+"\s*,\s*(\d+)\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g;
  const clauses = [...source.matchAll(pattern)]
    .map((match) => ({ minimum: Number(match[1]), unitTypeId: match[2], circleTypeId: match[3], start: match.index ?? 0 }))
    .filter((clause) => clause.circleTypeId === "unit-circle-of-power" || clause.circleTypeId === "unit-pile-circle");
  const requirements = [];
  const consumed = new Set();
  for (let index = 0; index < clauses.length; index += 1) {
    if (consumed.has(index)) {
      continue;
    }
    const clause = clauses[index];
    const unitTypeIds = [clause.unitTypeId];
    for (let nextIndex = index + 1; nextIndex < clauses.length; nextIndex += 1) {
      const next = clauses[nextIndex];
      const between = source.slice(clause.start, next.start);
      if (clause.minimum === next.minimum && clause.circleTypeId === next.circleTypeId && /\bor\b/.test(between) && !/\band\b/.test(between)) {
        unitTypeIds.push(next.unitTypeId);
        consumed.add(nextIndex);
      }
    }
    requirements.push({
      unitTypeIds: [...new Set(unitTypeIds)].sort(),
      circleTypeId: clause.circleTypeId,
      minimum: clause.minimum
    });
  }
  return requirements;
}

function hasRequirement(requirements, expected) {
  return (requirements ?? []).some((requirement) => (
    requirement.circleTypeId === expected.circleTypeId
    && requirement.minimum === expected.minimum
    && JSON.stringify(requirement.unitTypeIds ?? []) === JSON.stringify(expected.unitTypeIds)
  ));
}

const sourcePaths = [
  "campaigns/human/level02h_c.sms",
  "campaigns/human/level10h_c.sms",
  "campaigns/human-exp/levelx01h_c.sms",
  "campaigns/human-exp/levelx03h_c.sms",
  "campaigns/human-exp/levelx06h_c.sms",
  "campaigns/orc/level02o_c.sms",
  "campaigns/orc-exp/levelx10o_c.sms"
];

const expectedBySetupPath = new Map();
let expectedRequirementCount = 0;
for (const sourcePath of sourcePaths) {
  const expected = sourceRescuedCircleRequirements(readFileSync(path.join(manifest.dataRoot, sourcePath), "utf8"));
  if (expected.length === 0) {
    error(`${sourcePath} should have source IfRescuedNearUnit circle requirements.`);
  }
  expectedRequirementCount += expected.length;
  expectedBySetupPath.set(sourcePath.replace(/_c\.sms$/, ".sms"), expected);
}

const mapsWithRequirements = manifest.maps.filter((map) => (map.rescuedCircleRequirements ?? []).length > 0);
const indexedRequirementCount = mapsWithRequirements.reduce((total, map) => total + map.rescuedCircleRequirements.length, 0);
if (mapsWithRequirements.length !== sourcePaths.length || indexedRequirementCount !== expectedRequirementCount) {
  error(`Expected ${sourcePaths.length} rescued-circle maps and ${expectedRequirementCount} requirements, found ${mapsWithRequirements.length} maps and ${indexedRequirementCount} requirements.`);
}

for (const [setupPath, expected] of expectedBySetupPath) {
  const map = manifest.maps.find((candidate) => candidate.setupPath?.replace(/\.gz$/i, "") === setupPath);
  if (!map) {
    error(`Manifest is missing campaign setup ${setupPath}.`);
    continue;
  }
  const setup = JSON.parse(readFileSync(path.join("public/wargus", map.setupJson), "utf8"));
  for (const requirement of expected) {
    if (!hasRequirement(map.rescuedCircleRequirements, requirement)) {
      error(`${map.path} is missing rescued-circle requirement ${JSON.stringify(requirement)}.`);
    }
    if (!hasRequirement(map.setup?.rescuedCircleRequirements, requirement)) {
      error(`${map.path} setup summary is missing rescued-circle requirement ${JSON.stringify(requirement)}.`);
    }
    if (!hasRequirement(setup.rescuedCircleRequirements, requirement)) {
      error(`${map.setupJson} setup data is missing rescued-circle requirement ${JSON.stringify(requirement)}.`);
    }
  }
}

const typeSource = readFileSync("src/wargus/types.ts", "utf8");
for (const fragment of [
  "rescuedCircleRequirements?: WargusRescuedCircleRequirement[]",
  "export interface WargusRescuedCircleRequirement",
  "unitTypeIds: string[]"
]) {
  if (!typeSource.includes(fragment)) {
    error(`Types are missing rescued-circle fragment: ${fragment}`);
  }
}

const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
for (const fragment of [
  "rescuedCircleRequirements: parseRescuedCircleRequirements(campaignSource)",
  "function parseRescuedCircleRequirements",
  "IfRescuedNearUnit"
]) {
  if (!indexSource.includes(fragment)) {
    error(`Indexer is missing rescued-circle fragment: ${fragment}`);
  }
}

const worldSource = readFileSync("src/simulation/world.ts", "utf8");
for (const fragment of [
  'rescuedCircleRequirements: WargusMapSetup["rescuedCircleRequirements"]',
  "rescuedCircleRequirements: setup?.rescuedCircleRequirements ?? map.rescuedCircleRequirements ?? []"
]) {
  if (!worldSource.includes(fragment)) {
    error(`World creation is missing rescued-circle fragment: ${fragment}`);
  }
}

const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
for (const fragment of [
  "world.rescuedCircleRequirements.length > 0",
  "function isRescuedCircleRequirementMet",
  "requirement.unitTypeIds.includes(unit.typeId)",
  "for (const requirement of world.rescuedCircleRequirements)"
]) {
  if (!ordersSource.includes(fragment)) {
    error(`Runtime is missing rescued-circle fragment: ${fragment}`);
  }
}

if (ordersSource.includes('objectiveText.includes("circle")') || ordersSource.includes('objectiveText.includes("all three")') || ordersSource.includes('objectiveText.includes("four ")')) {
  error("Rescued circle victory should use indexed source IfRescuedNearUnit requirements instead of objective text.");
}

const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
for (const fragment of [
  'rescuedCircleRequirements?: WorldState["rescuedCircleRequirements"]',
  "world.rescuedCircleRequirements = normalizeRescuedCircleRequirements",
  "function normalizeRescuedCircleRequirements"
]) {
  if (!saveSource.includes(fragment)) {
    error(`Save/load is missing rescued-circle fragment: ${fragment}`);
  }
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Source rescued-circle errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Source rescued-circle requirements verified (${expectedRequirementCount} requirements across ${sourcePaths.length} campaign maps).`);
