import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const wc2Source = readFileSync(path.join(manifest.dataRoot, "scripts/wc2.lua"), "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const mushroomSetup = JSON.parse(readFileSync("public/wargus/maps/setups/173-_2_mushroom-panic.sms.json", "utf8"));

const errors = [];
for (const fragment of [
  "function ConvertUnitType(unittype, race)",
  "{\"unit-town-hall\", \"unit-great-hall\"}",
  "{\"unit-peasant\", \"unit-peon\"}",
  "{\"unit-farm\", \"unit-pig-farm\"}",
  "HumanEquivalent[t[i][2]] = t[i][1]",
  "OrcEquivalent[t[i][1]] = t[i][2]"
]) {
  if (!wc2Source.includes(fragment)) {
    errors.push(`Wargus wc2.lua conversion source missing fragment: ${fragment}`);
  }
}

const equivalents = manifest.engineSettings?.raceUnitEquivalents;
if (equivalents?.orc?.["unit-town-hall"] !== "unit-great-hall") {
  errors.push("Manifest does not preserve source human->orc town hall conversion.");
}
if (equivalents?.human?.["unit-great-hall"] !== "unit-town-hall") {
  errors.push("Manifest does not preserve source orc->human town hall conversion.");
}
if (equivalents?.orc?.["unit-peasant"] !== "unit-peon" || equivalents?.human?.["unit-peon"] !== "unit-peasant") {
  errors.push("Manifest does not preserve source worker race conversions.");
}

const raceByPlayer = new Map(mushroomSetup.players.map((player) => [player.player, player.race]));
for (const unit of mushroomSetup.units) {
  const race = raceByPlayer.get(unit.player);
  if (race === "orc" && ["unit-town-hall", "unit-farm", "unit-peasant"].includes(unit.typeId)) {
    errors.push(`Mushroom Panic orc player ${unit.player} still has unconverted human unit ${unit.typeId}.`);
  }
  if (race === "human" && ["unit-great-hall", "unit-pig-farm", "unit-peon"].includes(unit.typeId)) {
    errors.push(`Mushroom Panic human player ${unit.player} still has unconverted orc unit ${unit.typeId}.`);
  }
}

for (const [label, source, fragments] of [
  ["indexer", indexSource, ["function parseRaceUnitEquivalents", "function sourceConvertedUnitType", "sourceRaceUnitEquivalents", "unit.typeId = convertedTypeId"]],
  ["types", typesSource, ["raceUnitEquivalents: Partial<Record<\"human\" | \"orc\", Record<string, string>>>"]],
  ["world", worldSource, ["raceUnitEquivalents: {}"]]
]) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      errors.push(`${label} missing source race conversion fragment: ${fragment}`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source race unit conversion errors: ${errors.length}`);
  process.exit(1);
}

console.log("Source race unit conversion verified (wc2.lua ConvertUnitType table indexed and applied to map setup units).");
