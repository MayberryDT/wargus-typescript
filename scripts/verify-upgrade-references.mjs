import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const unitIds = new Set((manifest.units ?? []).map((unit) => unit.id));
const validStats = new Set([
  "PiercingDamage",
  "BasicDamage",
  "Armor",
  "AttackRange",
  "SightRange",
  "Level",
  "regeneration-rate",
  "regeneration-frequency"
]);
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const errors = [];
let references = 0;
let levelModifiers = 0;

function checkUnit(kind, upgradeId, unitId) {
  references += 1;
  if (!unitIds.has(unitId)) {
    errors.push(`${kind} ${upgradeId}: unknown unit ${unitId}`);
  }
}

for (const upgrade of manifest.upgrades ?? []) {
  for (const unitId of upgrade.appliesTo ?? []) {
    checkUnit("upgrade applies-to", upgrade.id, unitId);
  }
  for (const conversion of upgrade.conversions ?? []) {
    checkUnit("upgrade convert-from", upgrade.id, conversion.fromTypeId);
    checkUnit("upgrade convert-to", upgrade.id, conversion.toTypeId);
  }
  for (const modifier of upgrade.modifiers ?? []) {
    references += 1;
    if (modifier.stat === "Level") {
      levelModifiers += 1;
    }
    if (!validStats.has(modifier.stat)) {
      errors.push(`upgrade modifier ${upgrade.id}: unknown stat ${modifier.stat}`);
    }
    if (typeof modifier.value !== "number" || !Number.isFinite(modifier.value)) {
      errors.push(`upgrade modifier ${upgrade.id}: invalid value for ${modifier.stat}`);
    }
  }
}

if (levelModifiers < 30) {
  errors.push(`Expected broad source Level upgrade modifier coverage, found ${levelModifiers}.`);
}

for (const [kind, source, fragments] of [
  ["indexer", indexSource, ['"Level"', "upgrade.modifiers.push({ stat: key, value: Number(rawValue) })"]],
  ["runtime", ordersSource, [
    'modifier.stat === "Level"',
    "unit.level = Math.max(0, unit.level + modifier.value)",
    "function sourceFallbackUpgradeFamilyMatches",
    "function sourceUpgradeFallbackText",
    "upgradeHasSourceTargetMetadata(world, upgradeId)",
    "button.action === \"research\" && button.value === upgradeId",
    "`${button.hint ?? \"\"} ${button.icon ?? \"\"} ${button.forUnit.join(\" \")}`",
    "SOURCE_BLACKSMITH_UPGRADE_FALLBACK_TOKENS",
    "SOURCE_LUMBER_MILL_UPGRADE_FALLBACK_TOKENS",
    "SOURCE_MELEE_WEAPON_UPGRADE_FALLBACK_TOKENS",
    "SOURCE_SHIELD_UPGRADE_FALLBACK_TOKENS",
    "SOURCE_SIEGE_UPGRADE_FALLBACK_TOKENS"
  ]],
  ["types", typesSource, ['\"Level\" | \"regeneration-rate\"']]
]) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      errors.push(`Upgrade ${kind} is missing source Level fragment: ${fragment}`);
    }
  }
}

for (const fragment of [
  'upgradeId.includes("sword")',
  'upgradeId.includes("shield")',
  'upgradeId.includes("battle-axe")',
  'upgradeId.includes("ballista")',
  'upgradeId.includes("catapult")',
  'upgradeId.includes("arrow")',
  'upgradeId.includes("ranger")',
  'upgradeId.includes("longbow")',
  'upgradeId.includes("throwing-axe")',
  'upgradeId.includes("berserker")',
  'upgradeId.includes("light-axes")'
]) {
  if (ordersSource.includes(fragment)) {
    errors.push(`Upgrade runtime should route fallback family classification through sourceUpgradeFallbackText instead of inline id token checks: ${fragment}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Upgrade reference errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Upgrade references verified (${references} modifier/conversion references checked).`);
