import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const wc2Source = readFileSync(path.join(manifest.dataRoot, "scripts/wc2.lua"), "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const sourceUiSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");

const errors = [];
for (const fragment of [
  "DefineRaceNames(",
  '"name", "human"',
  '"display", _("Human")',
  '"name", "orc"',
  '"display", _("Orc")',
  '"name", "neutral"',
  '"display", _("Neutral")'
]) {
  if (!wc2Source.includes(fragment)) {
    errors.push(`Wargus race-name source missing fragment: ${fragment}`);
  }
}

const raceNames = manifest.engineSettings?.raceNames ?? [];
for (const [name, display, visible] of [["human", "Human", true], ["orc", "Orc", true], ["neutral", "Neutral", false]]) {
  const race = raceNames.find((entry) => entry.name === name);
  if (!race || race.display !== display || race.visible !== visible) {
    errors.push(`Manifest race ${name} expected ${display}/${visible}, found ${JSON.stringify(race)}.`);
  }
}

for (const [label, source, fragments] of [
  ["indexer", indexSource, ["function parseRaceNames", "raceNames: sourceRaceNames"]],
  ["types", typesSource, ["export interface WargusRaceName", "raceNames: WargusRaceName[]"]],
  ["world", worldSource, ["raceNames: [", "display: \"Human\"", "display: \"Orc\"", "display: \"Neutral\""]],
  ["source UI", sourceUiSource, ["export function sourceRaceDisplayName", "world.engineSettings.raceNames.find", "sourceRaceDisplayName(world, player.race)"]]
]) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      errors.push(`${label} missing race-name fragment: ${fragment}`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source race-name errors: ${errors.length}`);
  process.exit(1);
}

console.log("Source race names verified (DefineRaceNames indexed and used for browser race display).");
