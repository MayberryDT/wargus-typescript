import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const databaseSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/wargus/scripts/database.lua", "utf8");

const errors = [];
const entries = manifest.unitDatabase ?? [];

function expect(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function hasEntry(race, unitTypeId, producerTypeId, category, unitClass, rank, costs) {
  return entries.some((entry) => (
    entry.race === race
    && entry.unitTypeId === unitTypeId
    && entry.producerTypeId === producerTypeId
    && entry.category === category
    && entry.class === unitClass
    && entry.rank === rank
    && entry.castCosts?.gold === costs.gold
    && entry.castCosts?.wood === costs.wood
    && entry.castCosts?.oil === costs.oil
  ));
}

expect(/UnitDatabaseSetup\(race,\s*AiSoldier\(race\),\s*AiBarracks\(race\),\s*"ground",\s*"melee",\s*"standard"\)/.test(databaseSource), "Source UnitDatabase soldier setup was not found.");
expect(/UnitDatabaseSetup\("human",\s*"unit-footman",\s*"For the Motherland",\s*2500,\s*0,\s*0\)/.test(databaseSource), "Source UnitDatabase footman cost setup was not found.");
expect(entries.length === 30, `Expected 30 UnitDatabase entries, found ${entries.length}.`);
expect(manifest.counts?.unitDatabase === entries.length, "Manifest counts.unitDatabase does not match unitDatabase length.");
expect(hasEntry("human", "unit-footman", "unit-human-barracks", "ground", "melee", "standard", { gold: 2500, wood: 0, oil: 0 }), "Missing source human footman UnitDatabase entry.");
expect(hasEntry("orc", "unit-grunt", "unit-orc-barracks", "ground", "melee", "standard", { gold: 2500, wood: 0, oil: 0 }), "Missing source orc grunt UnitDatabase entry.");
expect(hasEntry("human", "unit-mage", "unit-mage-tower", "ground", "ranged", "attacker", { gold: 2500, wood: 2500, oil: 5000 }), "Missing source human mage UnitDatabase entry.");
expect(hasEntry("orc", "unit-dragon", "unit-dragon-roost", "air", "ranged", "attacker", { gold: 2500, wood: 5000, oil: 5000 }), "Missing source orc dragon UnitDatabase entry.");

for (const [source, fragment] of [
  [indexSource, "function parseSourceUnitDatabase"],
  [indexSource, "parseAiUnitHelpers"],
  [indexSource, "UnitDatabaseSetup("],
  [indexSource, "unitDatabase: unitDatabase.length"],
  [indexSource, "unitDatabase,"],
  [typesSource, "unitDatabase?: WargusUnitDatabaseEntry[]"],
  [typesSource, "export interface WargusUnitDatabaseEntry"],
  [worldSource, "unitDatabase: WargusUnitDatabaseEntry[]"],
  [worldSource, "sourceUnitDatabase: WargusUnitDatabaseEntry[] = []"],
  [worldSource, "unitDatabase: sourceUnitDatabase"],
  [ordersSource, "function sourceUnitDatabaseTrainScore"],
  [ordersSource, "world.unitDatabase.find"],
  [ordersSource, "candidate.producerTypeId === building.typeId"],
  [ordersSource, "entry.castCosts.gold + entry.castCosts.wood + entry.castCosts.oil"]
]) {
  expect(source.includes(fragment), `Missing expected implementation fragment: ${fragment}`);
}

if (errors.length > 0) {
  console.error(`Source UnitDatabase verification errors: ${errors.length}`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Source UnitDatabase verified (${entries.length} role/cost records indexed and consumed by AI training).`);
