import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const validIds = new Set([
  ...(manifest.units ?? []).map((unit) => unit.id),
  ...(manifest.upgrades ?? []).map((upgrade) => upgrade.id)
]);
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

function sourceAllowOverrides(source) {
  return [...source.matchAll(/DefineAllow\(\s*"([^"]+)"\s*,\s*"([AFR]+)"\s*\)/g)]
    .map((match) => ({ id: match[1], flags: match[2] }));
}

function sameRules(left, right) {
  return left.length === right.length && left.every((rule, index) => (
    rule.id === right[index].id && rule.flags === right[index].flags
  ));
}

let mapsWithOverrides = 0;
let overrideReferences = 0;
let forbiddenReferences = 0;
let preResearchedReferences = 0;

for (const map of manifest.maps ?? []) {
  const scriptPath = campaignScriptPath(map.setupPath);
  if (!scriptPath) {
    continue;
  }
  const source = readFileSync(path.join(manifest.dataRoot, scriptPath), "utf8");
  const expected = sourceAllowOverrides(source);
  if (expected.length === 0) {
    continue;
  }
  mapsWithOverrides += 1;
  overrideReferences += expected.length;
  forbiddenReferences += expected.filter((rule) => rule.flags.startsWith("F")).length;
  preResearchedReferences += expected.filter((rule) => rule.flags.startsWith("R")).length;
  const setup = map.setupJson ? JSON.parse(readFileSync(path.join("public/wargus", map.setupJson), "utf8")) : null;
  for (const rule of expected) {
    if (!validIds.has(rule.id)) {
      error(`${scriptPath} source allow override references unknown id ${rule.id}.`);
    }
  }
  if (!sameRules(map.allowOverrides ?? [], expected)) {
    error(`${map.path} allowOverrides differ from source campaign DefineAllow overrides.`);
  }
  if (!sameRules(map.setup?.allowOverrides ?? [], expected)) {
    error(`${map.path} setup summary allowOverrides differ from source campaign DefineAllow overrides.`);
  }
  if (!sameRules(setup?.allowOverrides ?? [], expected)) {
    error(`${map.setupJson} setup data allowOverrides differ from source campaign DefineAllow overrides.`);
  }
}

if (mapsWithOverrides !== 14 || overrideReferences !== 74 || forbiddenReferences !== 19 || preResearchedReferences !== 47) {
  error(`Expected 74 campaign allow overrides across 14 maps with 19 forbids and 47 pre-research rules, found ${overrideReferences}/${mapsWithOverrides}/${forbiddenReferences}/${preResearchedReferences}.`);
}

const dragonMap = manifest.maps.find((map) => map.setupPath === "campaigns/orc-exp/levelx04o.sms.gz");
if (!dragonMap?.allowOverrides?.some((rule) => rule.id === "unit-dragon" && rule.flags.startsWith("F"))) {
  error("Orc expansion IV is missing the source unit-dragon forbidden override.");
}

const spellMap = manifest.maps.find((map) => map.setupPath === "campaigns/orc-exp/levelx12o.sms.gz");
if (!spellMap?.allowOverrides?.some((rule) => rule.id === "upgrade-death-and-decay" && rule.flags.startsWith("R"))) {
  error("Orc expansion XII is missing the source upgrade-death-and-decay pre-researched override.");
}

for (const fragment of [
  "allowOverrides?: WargusAllowRule[]",
  "allowOverrides: WargusAllowRule[]"
]) {
  if (!typesSource.includes(fragment)) {
    error(`Types are missing source allow-override fragment: ${fragment}`);
  }
}

for (const fragment of [
  "allowOverrides: parseCampaignAllowOverrides(campaignSource)",
  "function parseCampaignAllowOverrides",
  "allowOverrides: presentation.allowOverrides ?? []"
]) {
  if (!indexSource.includes(fragment)) {
    error(`Indexer is missing source allow-override fragment: ${fragment}`);
  }
}

for (const fragment of [
  "allowOverrides: setup?.allowOverrides ?? map.allowOverrides ?? []",
  "allowOverrides: WargusAllowRule[]"
]) {
  if (!worldSource.includes(fragment)) {
    error(`World creation is missing source allow-override fragment: ${fragment}`);
  }
}

for (const fragment of [
  "function sourceAllowRuleForId",
  "function sourceAllowFlagForPlayer",
  "sourceAllowFlagForPlayer(rule, playerId) !== \"F\"",
  "sourceAllowFlagForPlayer(sourceAllowRuleForId(world, upgradeId), playerId) === \"R\"",
  "isUnitTypeAllowed(world, unitTypeId, player.id)",
  "world.allowOverrides",
  "sourceAllowRuleForId(world, id)"
]) {
  if (!ordersSource.includes(fragment)) {
    error(`Runtime allow handling is missing source allow-override fragment: ${fragment}`);
  }
}

for (const fragment of [
  "allowOverrides?: WorldState[\"allowOverrides\"]",
  "allowOverrides: world.allowOverrides",
  "world.allowOverrides = normalizeAllowRules(save.world.allowOverrides, map.allowOverrides ?? [], world)",
  "function normalizeAllowRules"
]) {
  if (!saveSource.includes(fragment)) {
    error(`Save/load is missing source allow-override fragment: ${fragment}`);
  }
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Source allow-override errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Source allow overrides verified (${overrideReferences} overrides across ${mapsWithOverrides} campaign maps, ${forbiddenReferences} forbids, ${preResearchedReferences} pre-research rules).`);
