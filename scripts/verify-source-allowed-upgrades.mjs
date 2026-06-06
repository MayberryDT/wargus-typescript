import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const upgradeIds = new Set((manifest.upgrades ?? []).map((upgrade) => upgrade.id));
const errors = [];

function error(message) {
  errors.push(message);
}

function campaignScriptPath(setupPath) {
  if (!setupPath?.startsWith("campaigns/")) {
    return null;
  }
  const plainSetupPath = setupPath.replace(/\.gz$/, "");
  const candidate = plainSetupPath.replace(/\.sms$/, "_c.sms");
  return existsSync(path.join(manifest.dataRoot, candidate)) ? candidate : null;
}

function sourceAllowedUpgradeTypes(source) {
  const allowed = new Set();
  for (const tableMatch of source.matchAll(/local\s+allowed[A-Za-z]+Units\s*=\s*\{([\s\S]*?)\}/g)) {
    for (const entry of tableMatch[1].matchAll(/"([^"]+)"/g)) {
      if (entry[1].startsWith("upgrade-")) {
        allowed.add(entry[1]);
      }
    }
  }
  return [...allowed].sort();
}

function sameStringSet(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

let mapsWithAllowedUpgrades = 0;
let allowedUpgradeReferences = 0;

for (const map of manifest.maps ?? []) {
  const scriptPath = campaignScriptPath(map.setupPath);
  if (!scriptPath) {
    continue;
  }
  const source = readFileSync(path.join(manifest.dataRoot, scriptPath), "utf8");
  const expected = sourceAllowedUpgradeTypes(source);
  if (expected.length === 0) {
    continue;
  }
  mapsWithAllowedUpgrades += 1;
  allowedUpgradeReferences += expected.length;
  const setup = map.setupJson ? JSON.parse(readFileSync(path.join("public/wargus", map.setupJson), "utf8")) : null;
  for (const upgradeId of expected) {
    if (!upgradeIds.has(upgradeId)) {
      error(`${scriptPath} source allowed upgrade ${upgradeId} is not indexed in the manifest.`);
    }
  }
  if (!sameStringSet(map.allowedUpgradeTypes ?? [], expected)) {
    error(`${map.path} allowedUpgradeTypes differ from source campaign table.`);
  }
  if (!sameStringSet(map.setup?.allowedUpgradeTypes ?? [], expected)) {
    error(`${map.path} setup summary allowedUpgradeTypes differ from source campaign table.`);
  }
  if (!sameStringSet(setup?.allowedUpgradeTypes ?? [], expected)) {
    error(`${map.setupJson} setup data allowedUpgradeTypes differ from source campaign table.`);
  }
}

if (mapsWithAllowedUpgrades !== 26 || allowedUpgradeReferences !== 794) {
  error(`Expected 794 source allowed-upgrade references across 26 campaign maps, found ${allowedUpgradeReferences} across ${mapsWithAllowedUpgrades}.`);
}

const human2 = manifest.maps.find((map) => map.setupPath === "campaigns/human/level02h.sms.gz");
if (!human2 || !sameStringSet(human2.allowedUpgradeTypes ?? [], ["upgrade-arrow1"])) {
  error(`Expected Human II to allow exactly upgrade-arrow1, found ${(human2?.allowedUpgradeTypes ?? []).join(",") || "none"}.`);
}

for (const fragment of [
  "allowedUpgradeTypes?: string[]",
  "allowedUpgradeTypes: string[]"
]) {
  if (!typesSource.includes(fragment)) {
    error(`Types are missing source allowed-upgrade fragment: ${fragment}`);
  }
}

for (const fragment of [
  "allowedUpgradeTypes: parseAllowedUpgradeTypes(campaignSource)",
  "function parseAllowedUpgradeTypes",
  'parseAllowedObjectTypes(source, "upgrade-")',
  "allowedUpgradeTypes: presentation.allowedUpgradeTypes ?? []"
]) {
  if (!indexSource.includes(fragment)) {
    error(`Indexer is missing source allowed-upgrade fragment: ${fragment}`);
  }
}

for (const fragment of [
  "allowedUpgradeTypes: setup?.allowedUpgradeTypes ?? map.allowedUpgradeTypes ?? []",
  "allowedUpgradeTypes: string[]"
]) {
  if (!worldSource.includes(fragment)) {
    error(`World creation is missing source allowed-upgrade fragment: ${fragment}`);
  }
}

for (const fragment of [
  "world.allowedUpgradeTypes.length > 0",
  "!world.allowedUpgradeTypes.includes(upgradeId)",
  "const sourceVariants = sourceUpgradeVariantsForUnitType(world, unitTypeId);",
  "for (const upgradedTypeId of sourceVariants)",
  "if (sourceVariants.length > 0) {\n    return false;\n  }"
]) {
  if (!ordersSource.includes(fragment)) {
    error(`Research validation is missing source allowed-upgrade fragment: ${fragment}`);
  }
}

for (const [fromTypeId, toTypeId] of [
  ["unit-archer", "unit-ranger"],
  ["unit-axethrower", "unit-berserker"],
  ["unit-knight", "unit-paladin"],
  ["unit-ogre", "unit-ogre-mage"]
]) {
  const hasSourceConversion = (manifest.upgrades ?? []).some((upgrade) => (
    upgrade.conversions ?? []
  ).some((conversion) => conversion.fromTypeId === fromTypeId && conversion.toTypeId === toTypeId));
  if (!hasSourceConversion) {
    error(`Expected source upgrade conversion ${fromTypeId} -> ${toTypeId} in manifest.`);
  }
}

for (const fragment of [
  "allowedUpgradeTypes?: WorldState[\"allowedUpgradeTypes\"]",
  "allowedUpgradeTypes: world.allowedUpgradeTypes",
  "world.allowedUpgradeTypes = normalizeStringArray(save.world.allowedUpgradeTypes, map.allowedUpgradeTypes ?? [])"
]) {
  if (!saveSource.includes(fragment)) {
    error(`Save/load is missing source allowed-upgrade fragment: ${fragment}`);
  }
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Source allowed-upgrade errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Source allowed upgrades verified (${allowedUpgradeReferences} upgrade references across ${mapsWithAllowedUpgrades} campaign maps).`);
