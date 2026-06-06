import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const resultsSource = readFileSync(path.join(manifest.dataRoot, "scripts/menus/results.lua"), "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typeSource = readFileSync("src/wargus/types.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const errors = [];

function expect(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

for (const fragment of [
  "local humanRanks = {",
  "local orcRanks = {",
  '280000, _("Designer")',
  "if results_score > ranksTable[i*2 - 1] then",
  'currentRank = _("Cheater!")'
]) {
  expect(resultsSource.includes(fragment), `Source results menu missing rank fragment: ${fragment}`);
}

expect(manifest.counts?.resultRanks === manifest.resultRanks?.length, "Manifest counts.resultRanks does not match resultRanks length.");
expect(manifest.resultRanks?.length === 38, `Expected 38 source result ranks, found ${manifest.resultRanks?.length ?? 0}.`);

for (const [race, threshold, name] of [
  ["human", 0, "Servant"],
  ["human", 8000, "Footman"],
  ["human", 280000, "Designer"],
  ["orc", 0, "Slave"],
  ["orc", 8000, "Grunt"],
  ["orc", 205000, "War Chief"],
  ["orc", 280000, "Designer"]
]) {
  expect(
    manifest.resultRanks?.some((rank) => rank.race === race && rank.threshold === threshold && rank.name === name),
    `Missing ${race} source result rank ${name} at ${threshold}.`
  );
}

for (const fragment of [
  "resultRanks?: WargusResultRank[]",
  "export interface WargusResultRank",
  "threshold: number"
]) {
  expect(typeSource.includes(fragment), `Result rank type missing fragment: ${fragment}`);
}

for (const fragment of [
  "parseResultRanks",
  "scripts/menus/results.lua",
  "resultRanks: resultRanks.length",
  "resultRanks,"
]) {
  expect(indexSource.includes(fragment), `Indexer result rank handling missing fragment: ${fragment}`);
}

for (const fragment of [
  "Rank ${sourceResultRankForPlayer(manifest, world, localPlayer)}"
]) {
  expect(hudSource.includes(fragment), `Browser results rank handling missing fragment: ${fragment}`);
}

for (const fragment of [
  "export function sourceResultRankForPlayer",
  "manifest.resultRanks",
  "score > rank.threshold"
]) {
  expect(sourceUiHelpersSource.includes(fragment), `Source UI result rank handling missing fragment: ${fragment}`);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source result rank verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source result ranks verified (human/orc rank tables and browser overlay display).");
