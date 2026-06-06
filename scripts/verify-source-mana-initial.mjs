import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const indexerSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const readmeSource = readFileSync("README.md", "utf8");

const manaUnits = (manifest.units ?? []).filter((unit) => unit.manaEnabled || (unit.manaMax ?? 0) > 0 || (unit.canCastSpells ?? []).length > 0);
const sourceInitialUnits = manaUnits.filter((unit) => (unit.manaInitial ?? 0) > 0 && unit.manaInitial !== unit.manaMax);
const errors = [];

if (sourceInitialUnits.length === 0) {
  errors.push("Wargus manifest has no units with source Mana.Value lower than Mana.Max.");
}
for (const unit of sourceInitialUnits) {
  if (unit.manaMax !== 255 || unit.manaInitial !== 84 || unit.manaIncrease !== 1) {
    errors.push(`${unit.id} has unexpected source mana tuple max=${unit.manaMax} initial=${unit.manaInitial} increase=${unit.manaIncrease}.`);
  }
}

const requiredIndexerFragments = [
  "function parseManaConfig(body, defaults = {})",
  "const initial = Number(manaBody.match(/Value",
  "manaInitial: mana.initial",
  "manaInitial: next.manaInitial !== 0 ? next.manaInitial : existing.manaInitial"
];
for (const fragment of requiredIndexerFragments) {
  if (!indexerSource.includes(fragment)) {
    errors.push(`Indexer missing Mana.Initial fragment: ${fragment}`);
  }
}

const requiredWorldFragments = [
  "function initialManaForUnit",
  "mana: initialManaForUnit(unit, maxMana)",
  "return Math.max(0, Math.min(maxMana, unit.manaInitial ?? maxMana))"
];
for (const fragment of requiredWorldFragments) {
  if (!worldSource.includes(fragment)) {
    errors.push(`World creation missing Mana.Initial fragment: ${fragment}`);
  }
}

const requiredOrdersFragments = [
  "unit.mana = Math.max(0, Math.min(unit.maxMana, definition.manaInitial ?? unit.maxMana))",
  "unit.manaIncrease = Math.max(0, definition.manaIncrease ?? 0)"
];
for (const fragment of requiredOrdersFragments) {
  if (!ordersSource.includes(fragment)) {
    errors.push(`Transform runtime missing Mana.Initial fragment: ${fragment}`);
  }
}

const requiredSaveFragments = [
  "function initialManaForUnitDefinition",
  "unit.mana ?? initialManaForUnitDefinition(definition, unit.maxMana)",
  "return Math.max(0, Math.min(maxMana, unit.manaInitial ?? maxMana))",
  "unit.manaIncrease = Math.max(0, definition.manaIncrease ?? 0)"
];
for (const fragment of requiredSaveFragments) {
  if (!saveSource.includes(fragment)) {
    errors.push(`Save/load missing Mana.Initial fragment: ${fragment}`);
  }
}

if (saveSource.includes("unit.mana = Math.min(unit.maxMana, unit.mana ?? unit.maxMana)")) {
  errors.push("Save/load still defaults missing caster mana to full max mana instead of source Mana.Value.");
}

if (!readmeSource.includes("Mana.Value") && !readmeSource.includes("initial value")) {
  errors.push("README does not document source initial mana preservation.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source Mana.Initial verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log(`Source Mana.Initial verified (${sourceInitialUnits.length} units start at ${sourceInitialUnits[0]?.manaInitial}/${sourceInitialUnits[0]?.manaMax} mana).`);
