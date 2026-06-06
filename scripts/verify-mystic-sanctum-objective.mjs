import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const sourcePath = `${manifest.dataRoot}/campaigns/human-exp/levelx09h_c.sms`;
const source = readFileSync(sourcePath, "utf8");
const errors = [];

function error(message) {
  errors.push(message);
}

const map = (manifest.maps ?? []).find((entry) => entry.path === "campaigns/human-exp/levelx09h.smp.gz");
if (!map?.objectives?.some((objective) => /mystic sanctum/i.test(objective))) {
  error("Human expansion mission IX objective metadata no longer names Ner'zhul's Mystic Sanctum.");
}

if (!source.includes('GetPlayerData(4, "UnitTypesCount", "unit-runestone") == 0')) {
  error("Source trigger no longer maps Ner'zhul's Mystic Sanctum to unit-runestone destruction.");
}

if (!source.includes('GetPlayerData(5, "UnitTypesCount", "unit-fortress") == 0')) {
  error("Source trigger no longer pairs the Mystic Sanctum objective with Shadowmoon Fortress destruction.");
}

if (!ordersSource.includes('objectiveText.includes("mystic sanctum")')) {
  error("Browser destruction objective parser is missing explicit Mystic Sanctum handling.");
}

if (!ordersSource.includes('sourceNamedObjectiveTypeGroup(world, ["unit-runestone"], /runestone|mystic sanctum/i)')) {
  error("Mystic Sanctum destruction does not resolve to the source runestone target group.");
}

if (ordersSource.includes('objectiveText.includes("mage tower") || objectiveText.includes("mystic sanctum")')) {
  error("Mystic Sanctum is still coupled to Mage Tower destruction.");
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Mystic Sanctum objective errors: ${errors.length}`);
  process.exit(1);
}

console.log("Mystic Sanctum objective verified (Human expansion IX targets source runestone destruction).");
