import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const errors = [];

function error(message) {
  errors.push(message);
}

const prisonerMap = (manifest.maps ?? []).find((map) => map.path === "campaigns/human/level10h.smp.gz");
if (!prisonerMap?.setupJson) {
  error("Missing browser setup for Human campaign mission X. The Prisoners.");
} else {
  const setup = JSON.parse(readFileSync(`public/wargus/${prisonerMap.setupJson}`, "utf8"));
  const peasantCount = (setup.units ?? []).filter((unit) => unit.typeId === "unit-peasant").length;
  const footmanCount = (setup.units ?? []).filter((unit) => unit.typeId === "unit-footman").length;
  if (!prisonerMap.objectives?.some((objective) => /alterac traitors/i.test(objective))) {
    error("The Prisoners objective metadata no longer mentions Alterac traitors.");
  }
  if (peasantCount < 4) {
    error(`Expected at least four peasant traitor candidates in The Prisoners setup, found ${peasantCount}.`);
  }
  if (footmanCount >= peasantCount) {
    error(`The Prisoners setup does not support treating Alterac traitors as footmen (${footmanCount} footmen vs ${peasantCount} peasants).`);
  }
}

if (!ordersSource.includes('groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-peasant", "unit-attack-peasant"], /peasant|minuteman|attack peasant/i')) {
  error("Capture objective target groups do not resolve Alterac traitors through source peasant/minuteman names with peasant/attack-peasant fallbacks.");
}

if (!ordersSource.includes('types.push(...sourceNamedObjectiveTypeGroup(world, ["unit-peasant", "unit-attack-peasant"], /peasant|minuteman|attack peasant/i')) {
  error("Circle objective target types do not resolve Alterac traitors through source peasant/minuteman names with peasant/attack-peasant fallbacks.");
}

if (ordersSource.includes('objectiveText.includes("alterac traitors")) {\n    types.push("unit-footman")')) {
  error("Alterac traitor circle target still maps to unit-footman.");
}
if (ordersSource.includes('types.push("unit-peasant", "unit-attack-peasant");')) {
  error("Alterac traitor circle target should use source name resolution instead of pushing peasant ids directly.");
}
if (ordersSource.includes('groups.push(["unit-peasant", "unit-attack-peasant"]);')) {
  error("Alterac traitor capture target should use source name resolution instead of pushing peasant ids directly.");
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Alterac traitor objective errors: ${errors.length}`);
  process.exit(1);
}

console.log("Alterac traitor objective targets verified (The Prisoners maps traitors to peasant/attack-peasant units).");
