import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const errors = [];

function error(message) {
  errors.push(message);
}

const mixedBuildAndEnemyMissions = (manifest.maps ?? []).filter((map) => {
  const hasBuildRequirement = (map.victoryRequirements ?? []).some((requirement) => requirement.kind === "unit-count");
  const hasEnemyElimination = (map.objectives ?? []).some((objective) => /destroy all enemy|destroy enemy forces|quell the peasant uprising/i.test(objective));
  return hasBuildRequirement && hasEnemyElimination;
});

if (mixedBuildAndEnemyMissions.length === 0) {
  error("Expected at least one campaign mission with both build requirements and enemy-elimination objectives.");
}

if (!ordersSource.includes("function hasUnmetEnemyEliminationObjective")) {
  error("Missing hasUnmetEnemyEliminationObjective runtime guard.");
}

const requirementBranch = ordersSource.match(/requirements\.length > 0[\s\S]*?world\.matchState = \{ status: "victory"/)?.[0] ?? "";
if (!requirementBranch.includes("hasUnmetEnemyEliminationObjective(world)")) {
  error("Build/objective victory branch can win without checking enemy-elimination objectives.");
}

const targetedDestructionBranch = ordersSource.match(/isTargetedDestructionObjectiveMet\(world\)[\s\S]*?world\.matchState = \{ status: "victory"/)?.[0] ?? "";
if (!targetedDestructionBranch.includes("hasUnmetEnemyEliminationObjective(world)")) {
  error("Targeted destruction victory branch can win without checking enemy-elimination objectives.");
}

if (!ordersSource.includes("requiresEnemyEliminationForCapture(objectives: string[]): boolean") || !ordersSource.includes("return objectives.some(isEnemyEliminationObjective);")) {
  error("Capture victory checks do not share the enemy-elimination objective classifier.");
}

for (const fragment of [
  'groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-dark-portal"], /dark portal|great portal/i));',
  'groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-daemon"], /daemon/i));',
  'groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-fire-breeze"], /deathwing|fire breeze/i));',
  'groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-temple-of-the-damned"], /temple of the damned|temple/i, (definition) => definition.building === true));',
  'groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-peasant", "unit-attack-peasant"], /peasant|minuteman|attack peasant/i',
  'groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-fad-man"], /dentarg|fad man/i));',
  'groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-quick-blade"], /korgath|bladefist|quick blade/i));',
  'groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-sharp-axe"], /zul\'?jin|sharp axe/i));',
  'groups.push(sourceDestructionTypeGroup(world, ["unit-mage"], (definition) => isCasterDefinition(definition) && raceTypeScore(world, definition, "human") > 0));',
  'groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-peasant"], /peasant/i',
  'types.push(...sourceDestructionTypeGroup(world, ["unit-mage"], (definition) => isCasterDefinition(definition) && raceTypeScore(world, definition, "human") > 0));',
  'groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-dragon-roost"], /dragon roost|dragon/i, (definition) => definition.building === true));',
  'groups.push(sourceDestructionTypeGroup(world, ["unit-mage-tower"], (definition) => sourceBuildDefinitionProducesMatching(world, definition.id, isCasterDefinition)));',
  'groups.push(sourceDestructionTypeGroup(world, ["unit-death-knight"], (definition) => isCasterDefinition(definition) && definition.isUndead === true));'
]) {
  if (!ordersSource.includes(fragment)) {
    error(`Objective text parser is missing source-aware target fragment: ${fragment}`);
  }
}

if (ordersSource.includes('groups.push(["unit-dark-portal"]);')) {
  error("Targeted destruction objectives still use a hardcoded Dark Portal type group.");
}

for (const [typeId, label] of [
  ["unit-daemon", "Daemon"],
  ["unit-fire-breeze", "Deathwing"],
  ["unit-temple-of-the-damned", "Temple of the Damned"],
  ["unit-fad-man", "Thunderlord"],
  ["unit-quick-blade", "Shattered Hand"],
  ["unit-sharp-axe", "Zuljin"],
  ["unit-peasant", "Peasants"]
]) {
  if (ordersSource.includes(`groups.push(["${typeId}"]);`)) {
    error(`Targeted destruction objectives still use a hardcoded ${label} type group.`);
  }
}
if (ordersSource.includes('groups.push(["unit-peasant", "unit-attack-peasant"]);')) {
  error("Capture objectives still use a hardcoded Alterac traitor type group.");
}

if (!ordersSource.includes("function hasSourcePortalReachVictoryRequirements(world: WorldState): boolean") || !ordersSource.includes("if (hasSourcePortalReachVictoryRequirements(world))")) {
  error("Portal-reach victory fallback should defer to indexed source victory/rescue requirements when available.");
}

if (!ordersSource.includes('const khadgarTypes = sourceNamedObjectiveTypeGroup(world, ["unit-white-mage"], /khadgar|white mage/i);')) {
  error("Khadgar-only portal damage gate does not resolve Khadgar through source names.");
}

if (!ordersSource.includes("function hasSourceKhadgarPortalDamageRule(world: WorldState, portalTypes: string[]): boolean") || ordersSource.includes('objectiveText.includes("only khadgar can destroy the portal")')) {
  error("Khadgar-only portal damage gate should derive from source victory/defeat requirements instead of objective text.");
}

if (!ordersSource.includes("function circleObjectiveUnitTypes(world: WorldState, objectiveText: string): string[] | null")) {
  error("Circle of Power objective target parsing does not receive source world metadata.");
}

if (!ordersSource.includes("circleObjectiveUnitTypes(world, objectiveText)")) {
  error("Circle of Power objective checks are not using the source-aware target parser.");
}

for (const fragment of [
  'types.push(...sourceNamedObjectiveTypeGroup(world, ["unit-peasant", "unit-attack-peasant"], /peasant|minuteman|attack peasant/i',
  'types.push(...sourceNamedObjectiveTypeGroup(world, ["unit-archer"], /archer/i',
  'types.push(...sourceNamedObjectiveTypeGroup(world, ["unit-man-of-light"], /uther|lightbringer|man of light/i',
  'types.push(...sourceNamedObjectiveTypeGroup(world, ["unit-sharp-axe"], /zul\'?jin|sharp axe/i',
  'types.push(...sourceNamedObjectiveTypeGroup(world, ["unit-double-head"], /cho\'?gall|double head/i',
  'types.push(...sourceNamedObjectiveTypeGroup(world, ["unit-knight-rider"], /turalyon|knight rider/i',
  'types.push(...sourceNamedObjectiveTypeGroup(world, ["unit-arthor-literios"], /danath|arthor literios/i'
]) {
  if (!ordersSource.includes(fragment)) {
    error(`Circle objective unit matching should resolve named targets through source names: ${fragment}`);
  }
}

for (const fragment of [
  'types.push("unit-peasant", "unit-attack-peasant")',
  'types.push("unit-archer")',
  'types.push("unit-man-of-light")',
  'types.push("unit-sharp-axe")',
  'types.push("unit-double-head")',
  'types.push("unit-knight-rider")',
  'types.push("unit-arthor-literios")'
]) {
  if (ordersSource.includes(fragment)) {
    error(`Circle objective unit matching still pushes hardcoded target ids directly: ${fragment}`);
  }
}

if (!ordersSource.includes("world.circleOfPowerRequirements.length > 0") || !ordersSource.includes("world.rescuedCircleRequirements.length > 0")) {
  error("Circle of Power victory should be driven by indexed source trigger requirements.");
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Victory condition errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Victory conditions verified (${mixedBuildAndEnemyMissions.length} mixed build/enemy-elimination missions guarded).`);
