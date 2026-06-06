import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const sourcePath = `${manifest.dataRoot}/campaigns/human/level12h_c.sms`;
const source = readFileSync(sourcePath, "utf8");
const errors = [];

function error(message) {
  errors.push(message);
}

const map = (manifest.maps ?? []).find((entry) => entry.path === "campaigns/human/level12h.smp.gz");
if (!map?.objectives?.some((objective) => /oil derricks/i.test(objective))) {
  error("Human mission XII objective metadata no longer names Oil Derricks.");
}

for (const unitTypeId of ["unit-orc-transport", "unit-orc-refinery", "unit-orc-shipyard"]) {
  const hasSourceRequirement = (map?.victoryRequirementGroups ?? []).some((group) => group.clauses.some((clause) => (
    clause.kind === "unit-destroyed"
    && clause.player === 0
    && clause.unitTypeId === unitTypeId
  )));
  if (!hasSourceRequirement) {
    error(`Human mission XII manifest is missing source destruction victory requirement for player 0 ${unitTypeId}.`);
  }
}

for (const snippet of [
  'GetPlayerData(0, "UnitTypesCount", "unit-orc-transport") == 0',
  'GetPlayerData(0, "UnitTypesCount", "unit-orc-refinery") == 0',
  'GetPlayerData(0, "UnitTypesCount", "unit-orc-shipyard") == 0'
]) {
  if (!source.includes(snippet)) {
    error(`Source Crestfall trigger no longer contains expected target: ${snippet}`);
  }
}

if (!ordersSource.includes('objectiveText.includes("oil derrick")')) {
  error("Browser destruction objective parser is missing explicit oil derrick handling.");
}

if (!ordersSource.includes('groups.push(sourceDestructionTypeGroup(world, ["unit-human-refinery", "unit-orc-refinery"], isOilRefineryDefinition));')) {
  error("Oil derrick destruction does not resolve to source refinery targets.");
}

if (ordersSource.includes('objectiveText.includes("oil platform") || objectiveText.includes("oil derrick")')) {
  error("Oil derrick destruction is still coupled to oil-platform targets.");
}

if (ordersSource.includes('objectiveText.includes("shipyard")')) {
  error("Shipyard destruction objectives should come from indexed source victory requirements, not objective text.");
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Crestfall objective errors: ${errors.length}`);
  process.exit(1);
}

console.log("Crestfall objective verified (Oil Derricks map to source refinery destruction).");
