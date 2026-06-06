import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const indexerSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const readmeSource = readFileSync("README.md", "utf8");
const errors = [];

const expectedCosts = new Map([
  ...sourceUpgradeCosts("scripts/human/upgrade.lua"),
  ...sourceUpgradeCosts("scripts/orc/upgrade.lua")
]);
const upgradesById = new Map((manifest.upgrades ?? []).map((upgrade) => [upgrade.id, upgrade]));

function sourceUpgradeCosts(sourcePath) {
  const source = readFileSync(path.join(manifest.dataRoot, sourcePath), "utf8");
  const tableMatch = source.match(/local\s+upgrades\s*=\s*\{([\s\S]*?)\n\}/);
  if (!tableMatch) {
    errors.push(`${sourcePath} has no local upgrades table.`);
    return [];
  }
  const rows = [];
  const entryPattern = /\{\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*\{([^}]+)\}\s*\}/g;
  let match;
  while ((match = entryPattern.exec(tableMatch[1]))) {
    const costs = match[3].split(",").map((part) => Number(part.trim())).filter((value) => Number.isFinite(value));
    rows.push([match[1], {
      time: costs[0] ?? 0,
      gold: costs[1] ?? 0,
      wood: costs[2] ?? 0,
      oil: costs[3] ?? 0
    }]);
  }
  return rows;
}

function costKey(costs) {
  return `${costs.time ?? 0}:${costs.gold ?? 0}:${costs.wood ?? 0}:${costs.oil ?? 0}`;
}

for (const [upgradeId, expected] of expectedCosts) {
  const actual = upgradesById.get(upgradeId)?.costs;
  if (!actual) {
    errors.push(`${upgradeId} from source upgrade table is missing from manifest.`);
    continue;
  }
  if (costKey(actual) !== costKey(expected)) {
    errors.push(`${upgradeId} costs ${costKey(actual)} do not match source ${costKey(expected)}.`);
  }
}

const sourceCostedSpellUpgrades = [
  "upgrade-healing",
  "upgrade-exorcism",
  "upgrade-flame-shield",
  "upgrade-slow",
  "upgrade-invisibility",
  "upgrade-polymorph",
  "upgrade-blizzard",
  "upgrade-bloodlust",
  "upgrade-raise-dead",
  "upgrade-death-coil",
  "upgrade-whirlwind",
  "upgrade-haste",
  "upgrade-unholy-armor",
  "upgrade-runes",
  "upgrade-death-and-decay"
];
for (const upgradeId of sourceCostedSpellUpgrades) {
  const upgrade = upgradesById.get(upgradeId);
  const total = upgrade ? (upgrade.costs.time + upgrade.costs.gold + upgrade.costs.wood + upgrade.costs.oil) : 0;
  if (total <= 0) {
    errors.push(`${upgradeId} should retain nonzero source spell-research costs.`);
  }
}

const requiredIndexerFragments = [
  "function mergeUpgradeDefinition",
  "upgradeCostTotal(existing.costs)",
  "costs: nextCostTotal > 0 || existingCostTotal === 0 ? next.costs : existing.costs",
  "source: upgradeCostTotal(upgrade.costs) > 0 || !existing?.source ? scriptFile : existing.source"
];
for (const fragment of requiredIndexerFragments) {
  if (!indexerSource.includes(fragment)) {
    errors.push(`Indexer missing upgrade-cost merge fragment: ${fragment}`);
  }
}

for (const fragment of [
  "canAfford(player.resources, upgradeCostPairs(upgrade))",
  "spendResources(player.resources, upgradeCostPairs(upgrade))",
  "const totalSeconds = sourceResearchDurationSecondsForPlayer(world, building.player, upgrade.costs.time)"
]) {
  if (!ordersSource.includes(fragment)) {
    errors.push(`Research runtime missing source upgrade-cost fragment: ${fragment}`);
  }
}

if (!saveSource.includes("const sourceTotalSeconds = sourceResearchDurationSecondsForPlayer(world, player, upgrade.costs.time)")) {
  errors.push("Save/load research normalization does not use source upgrade time costs.");
}

if (!readmeSource.includes("spell research costs")) {
  errors.push("README does not document source spell research costs.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source upgrade cost verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log(`Source upgrade costs verified (${expectedCosts.size} table upgrades, ${sourceCostedSpellUpgrades.length} nonzero spell research costs).`);
