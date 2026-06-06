import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const resultsSource = readFileSync(path.join(manifest.dataRoot, "scripts/menus/results.lua"), "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const errors = [];

function expect(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

for (const fragment of [
  'SetPlayerData(GetThisPlayer(), "Score", GetPlayerData(GetThisPlayer(), "Score") + 500)',
  'GetPlayerData(playerNumbers[j], "TotalUnits")',
  'GetPlayerData(playerNumbers[j], "TotalBuildings")',
  'GetPlayerData(playerNumbers[j], "TotalKills")',
  'GetPlayerData(playerNumbers[j], "TotalRazings")',
  '_("Units:")',
  '_("Buildings:")',
  '_("Gold:")',
  '_("Lumber:")',
  '_("Oil:")',
  '_("Kills:")',
  '_("Razings:")',
  '_("Score:")'
]) {
  expect(resultsSource.includes(fragment), `Source results menu missing fragment: ${fragment}`);
}

for (const fragment of [
  "sourceResultScoreForPlayer(world, player)",
  "sourceResultScoreHeader(world)",
  "stats.totalUnits",
  "stats.totalBuildings",
  "stats.unitsKilled",
  "stats.buildingsRazed"
]) {
  expect(hudSource.includes(fragment), `Browser results overlay missing source result fragment: ${fragment}`);
}

for (const fragment of [
  "world.matchState.status === \"victory\" && player.id === world.visibilityPlayer ? 500 : 0",
  "export function sourceResultScoreHeader(world: WorldState): string",
  "sourceResultResourceHeader(world, \"gold\", 5)",
  "sourceResultResourceHeader(world, \"wood\", 5)",
  "sourceResultResourceHeader(world, \"oil\", 4)",
  "return resourceUiLabel(world, resource).slice(0, width).padStart(width, \" \")",
  "stats.pointsKilled",
  "stats.pointsLost"
]) {
  expect(sourceUiHelpersSource.includes(fragment), `Source UI result helpers missing source result fragment: ${fragment}`);
}

for (const fragment of [
  "totalUnits: number",
  "totalBuildings: number",
  "initializePlayerTotalStats(world)",
  "export function recordPlayerUnitCreated",
  "isRuntimeSourceBuildingUnit(unit)",
  "player.stats.totalBuildings += 1",
  "player.stats.totalUnits += 1"
]) {
  expect(worldSource.includes(fragment), `World result stat tracking missing fragment: ${fragment}`);
}

for (const fragment of [
  "recordPlayerUnitCreated(world, trainedUnit)",
  "recordPlayerUnitCreated(world, building)",
  "recordPlayerUnitCreated(world, platform)",
  "recordPlayerUnitCreated(world, skeleton)",
  "recordPlayerUnitCreated(world, eye)",
  "function isSourceResultBuilding",
  "return isBuildingLike(unit);",
  "isSourceResultBuilding(target)",
  "isSourceResultBuilding(unit)"
]) {
  expect(ordersSource.includes(fragment), `Runtime result stat tracking missing fragment: ${fragment}`);
}

const captureOwnershipBody = ordersSource.match(/function applySourceCaptureOwnership[\s\S]*?\n}\n/)?.[0] ?? "";
expect(!captureOwnershipBody.includes('target.kind === "building"'), "Source capture result stats should use source Building semantics instead of browser-local kind text.");
const recordCreatedBody = worldSource.match(/export function recordPlayerUnitCreated[\s\S]*?\n}\n/)?.[0] ?? "";
expect(!recordCreatedBody.includes('unit.kind === "building"'), "Created-unit result totals should use source Building semantics instead of browser-local kind text.");
const recordDeathBody = ordersSource.match(/function recordUnitDeath[\s\S]*?function createEmptyStats/)?.[0] ?? "";
expect(!recordDeathBody.includes('unit.kind === "building"'), "Death result stats should use source Building semantics instead of browser-local kind text.");

for (const fragment of [
  "totalUnits: nonNegativeIntegerOr(record.totalUnits, defaults.totalUnits)",
  "totalBuildings: nonNegativeIntegerOr(record.totalBuildings, defaults.totalBuildings)"
]) {
  expect(saveSource.includes(fragment), `Save result stat persistence missing fragment: ${fragment}`);
}

const tableRowMatch = hudSource.match(/label\.padEnd\(10, " "\),([\s\S]*?)String\(sourceResultScoreForPlayer\(world, player\)\)\.padStart\(5, " "\)/);
const tableRowBody = tableRowMatch?.[1] ?? "";
expect(hudSource.includes("sourcePlayerDisplayName(player)"), "Browser results table should display source player names when available.");
const expectedOrder = [
  "stats.totalUnits",
  "stats.totalBuildings",
  "stats.goldMined",
  "stats.woodHarvested",
  "stats.oilHarvested",
  "stats.unitsKilled",
  "stats.buildingsRazed"
];
let lastIndex = -1;
for (const fragment of expectedOrder) {
  const index = tableRowBody.indexOf(fragment);
  expect(index > lastIndex, `Browser results table maps source stat ${fragment} out of order.`);
  lastIndex = index;
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source results score verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source results scoring verified (victory bonus and source result categories).");
