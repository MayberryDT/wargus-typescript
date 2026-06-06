import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");

const cowardUnits = (manifest.units ?? []).filter((unit) => unit.coward === true);
const cowardSpellConditions = (manifest.spells ?? []).filter((spell) => (
  JSON.stringify(spell).includes("\"Coward\"")
));
const errors = [];

if (cowardUnits.length === 0) {
  errors.push("Wargus manifest has no Coward units.");
}
if (cowardSpellConditions.length === 0) {
  errors.push("Wargus manifest has no spell conditions referencing Coward.");
}

const requiredWorldFragments = [
  "coward: unit.coward ?? false"
];
for (const fragment of requiredWorldFragments) {
  if (!worldSource.includes(fragment)) {
    errors.push(`World creation missing Coward metadata fragment: ${fragment}`);
  }
}

const requiredOrderFragments = [
  "unit.coward = definition.coward ?? false",
  "function canAutoGuard",
  "!unit.coward && unit.speed > 0 && canReceiveMoveOrders(unit)",
  "function sourceCastConditionMatches",
  "if (variable === \"Coward\")",
  "return unit.coward",
  "function unitMatchesSourceSpellTargetConditions",
  "function sourceConditionTokensExcludeCoward",
  "tokens[index] === \"Coward\" && tokens[index + 1] === \"false\"",
  "|| !unit.coward",
  "function canTargetMobileSpell"
];
for (const fragment of requiredOrderFragments) {
  if (!ordersSource.includes(fragment)) {
    errors.push(`Simulation missing Coward runtime fragment: ${fragment}`);
  }
}

const mobileSpellTargetMatch = ordersSource.match(/function canTargetMobileSpell\(unit: WorldUnit\): boolean \{[\s\S]*?\n\}/);
if (!mobileSpellTargetMatch) {
  errors.push("Simulation missing canTargetMobileSpell implementation.");
} else if (mobileSpellTargetMatch[0].includes("unit.coward")) {
  errors.push("canTargetMobileSpell should not blanket-ban Coward units; source spell target conditions should decide.");
}

const requiredSaveFragments = [
  "unit.coward = definition.coward ?? false",
  "unit.coward = Boolean(unit.coward)"
];
for (const fragment of requiredSaveFragments) {
  if (!saveSource.includes(fragment)) {
    errors.push(`Save/load normalization missing Coward fragment: ${fragment}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  console.error(`Coward behavior verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log(`Coward behavior verified (${cowardUnits.length} units, ${cowardSpellConditions.length} spells with Coward source conditions).`);
