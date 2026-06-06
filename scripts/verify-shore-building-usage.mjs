import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const indexerSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");

const expectedShoreBuildings = [
  "unit-human-foundry",
  "unit-human-refinery",
  "unit-human-shipyard",
  "unit-orc-foundry",
  "unit-orc-refinery",
  "unit-orc-shipyard"
];
const actualShoreBuildings = (manifest.units ?? [])
  .filter((unit) => unit.shoreBuilding)
  .map((unit) => unit.id)
  .sort();
const errors = [];

if (actualShoreBuildings.join("|") !== expectedShoreBuildings.join("|")) {
  errors.push(`Expected source ShoreBuilding units ${expectedShoreBuildings.join(", ")}, found ${actualShoreBuildings.join(", ") || "none"}.`);
}

const requiredIndexerFragments = [
  "const shoreBuilding = /ShoreBuilding\\s*=\\s*true/.test(body)",
  "shoreBuilding: next.shoreBuilding || existing.shoreBuilding"
];
for (const fragment of requiredIndexerFragments) {
  if (!indexerSource.includes(fragment)) {
    errors.push(`Indexer missing ShoreBuilding fragment: ${fragment}`);
  }
}

if (!typesSource.includes("shoreBuilding?: boolean")) {
  errors.push("WargusUnit type does not expose shoreBuilding metadata.");
}

const requiredWorldFragments = [
  "shoreBuilding: boolean",
  "\"mainFacility\" | \"shoreBuilding\" | \"manaEnabled\"",
  "shoreBuilding: false",
  "shoreBuilding: unit.shoreBuilding ?? false"
];
for (const fragment of requiredWorldFragments) {
  if (!worldSource.includes(fragment)) {
    errors.push(`World creation missing ShoreBuilding fragment: ${fragment}`);
  }
}

const requiredOrderFragments = [
  "if (buildingDefinition.shoreBuilding)",
  "return canPlaceShoreBuilding(world, tileX, tileY, width, height, ignoredUnitId)",
  "unit.shoreBuilding = definition.shoreBuilding ?? false"
];
for (const fragment of requiredOrderFragments) {
  if (!ordersSource.includes(fragment)) {
    errors.push(`Simulation missing ShoreBuilding runtime fragment: ${fragment}`);
  }
}

const requiredSaveFragments = [
  "unit.shoreBuilding = definition.shoreBuilding ?? false",
  "unit.shoreBuilding = Boolean(unit.shoreBuilding)"
];
for (const fragment of requiredSaveFragments) {
  if (!saveSource.includes(fragment)) {
    errors.push(`Save/load normalization missing ShoreBuilding fragment: ${fragment}`);
  }
}

if (!hudSource.includes("sourceSpecialLine(selected)") || !sourceUiHelpersSource.includes("unit.shoreBuilding") || !sourceUiHelpersSource.includes('roles.push("shore")')) {
  errors.push("HUD source role line does not expose shore-building metadata.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`ShoreBuilding verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log(`ShoreBuilding usage verified (${actualShoreBuildings.length} source shore buildings: ${actualShoreBuildings.join(", ")}).`);
