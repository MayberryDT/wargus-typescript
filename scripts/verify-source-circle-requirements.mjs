import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const errors = [];

function error(message) {
  errors.push(message);
}

function sourceCircleRequirements(source) {
  return [...source.matchAll(/IfNearUnit\(\s*"this"\s*,\s*"[^"]+"\s*,\s*(\d+)\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g)]
    .map((match) => ({
      unitTypeId: match[2],
      circleTypeId: match[3],
      minimum: Number(match[1])
    }))
    .filter((requirement) => requirement.circleTypeId === "unit-circle-of-power" || requirement.circleTypeId === "unit-pile-circle");
}

function hasRequirement(requirements, expected) {
  return (requirements ?? []).some((requirement) => (
    requirement.unitTypeId === expected.unitTypeId
    && requirement.circleTypeId === expected.circleTypeId
    && requirement.minimum === expected.minimum
  ));
}

const expectedBySetupPath = new Map();
for (const sourcePath of ["campaigns/human/level09h_c.sms", "campaigns/orc/level06o_c.sms"]) {
  const expected = sourceCircleRequirements(readFileSync(path.join(manifest.dataRoot, sourcePath), "utf8"));
  if (expected.length !== 1) {
    error(`${sourcePath} should have exactly one source IfNearUnit circle requirement, found ${expected.length}.`);
  }
  expectedBySetupPath.set(sourcePath.replace(/_c\.sms$/, ".sms"), expected);
}

const mapsWithRequirements = manifest.maps.filter((map) => (map.circleOfPowerRequirements ?? []).length > 0);
if (mapsWithRequirements.length !== 2) {
  error(`Expected exactly two source IfNearUnit circle maps, found ${mapsWithRequirements.length}.`);
}

for (const [setupPath, expected] of expectedBySetupPath) {
  const map = manifest.maps.find((candidate) => candidate.setupPath?.replace(/\.gz$/i, "") === setupPath);
  if (!map) {
    error(`Manifest is missing campaign setup ${setupPath}.`);
    continue;
  }
  const setup = JSON.parse(readFileSync(path.join("public/wargus", map.setupJson), "utf8"));
  for (const requirement of expected) {
    if (!hasRequirement(map.circleOfPowerRequirements, requirement)) {
      error(`${map.path} is missing source circle requirement ${JSON.stringify(requirement)}.`);
    }
    if (!hasRequirement(map.setup?.circleOfPowerRequirements, requirement)) {
      error(`${map.path} setup summary is missing source circle requirement ${JSON.stringify(requirement)}.`);
    }
    if (!hasRequirement(setup.circleOfPowerRequirements, requirement)) {
      error(`${map.setupJson} setup data is missing source circle requirement ${JSON.stringify(requirement)}.`);
    }
  }
}

const typeSource = readFileSync("src/wargus/types.ts", "utf8");
for (const fragment of [
  "circleOfPowerRequirements?: WargusCircleOfPowerRequirement[]",
  "export interface WargusCircleOfPowerRequirement",
  "circleTypeId: string"
]) {
  if (!typeSource.includes(fragment)) {
    error(`Types are missing source circle fragment: ${fragment}`);
  }
}

const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
for (const fragment of [
  "circleOfPowerRequirements: parseCircleOfPowerRequirements(campaignSource)",
  "function parseCircleOfPowerRequirements",
  "IfNearUnit"
]) {
  if (!indexSource.includes(fragment)) {
    error(`Indexer is missing source circle fragment: ${fragment}`);
  }
}

const worldSource = readFileSync("src/simulation/world.ts", "utf8");
for (const fragment of [
  'circleOfPowerRequirements: WargusMapSetup["circleOfPowerRequirements"]',
  "circleOfPowerRequirements: setup?.circleOfPowerRequirements ?? map.circleOfPowerRequirements ?? []"
]) {
  if (!worldSource.includes(fragment)) {
    error(`World creation is missing source circle fragment: ${fragment}`);
  }
}

const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
for (const fragment of [
  "world.circleOfPowerRequirements.length > 0",
  "function isCircleOfPowerRequirementMet",
  "unit.typeId === requirement.unitTypeId",
  "unit.typeId === requirement.circleTypeId"
]) {
  if (!ordersSource.includes(fragment)) {
    error(`Runtime is missing source circle fragment: ${fragment}`);
  }
}

if (ordersSource.includes('objectiveText.includes("circle")') || ordersSource.includes('objectiveText.includes("all three")') || ordersSource.includes('objectiveText.includes("four ")')) {
  error("Circle of Power victory should use indexed source IfNearUnit requirements instead of objective text.");
}

const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
for (const fragment of [
  'circleOfPowerRequirements?: WorldState["circleOfPowerRequirements"]',
  "world.circleOfPowerRequirements = normalizeCircleOfPowerRequirements",
  "function normalizeCircleOfPowerRequirements"
]) {
  if (!saveSource.includes(fragment)) {
    error(`Save/load is missing source circle fragment: ${fragment}`);
  }
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Source circle requirement errors: ${errors.length}`);
  process.exit(1);
}

console.log("Source circle requirements verified (Lightbringer and Cho'gall IfNearUnit triggers indexed).");
