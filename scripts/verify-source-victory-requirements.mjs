import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const sourceRaceSource = readFileSync("src/wargus/sourceRace.ts", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const errors = [];

function error(message) {
  errors.push(message);
}

function campaignScriptPath(setupPath) {
  if (!setupPath?.startsWith("campaigns/")) {
    return null;
  }
  const plainSetupPath = setupPath.replace(/\.gz$/, "");
  const candidate = plainSetupPath.replace(/\.sms$/, "_c.sms");
  return existsSync(path.join(manifest.dataRoot, candidate)) ? candidate : null;
}

function victoryTriggerBodies(source) {
  return [...source.matchAll(/AddTrigger\(\s*function\(\) return ([\s\S]*?) end,\s*function\(\) return ActionVictory\(\) end\)/g)]
    .map((match) => match[1]);
}

function firstVictoryTriggerBody(source) {
  return victoryTriggerBodies(source)[0] ?? null;
}

function sourceDestroyedRequirements(source) {
  const trigger = firstVictoryTriggerBody(source);
  if (!trigger) {
    return [];
  }
  return [...trigger.matchAll(/GetPlayerData\((\d+),\s*"UnitTypesCount",\s*"([^"]+)"\)\s*==\s*0/g)]
    .map((match) => ({ kind: "unit-destroyed", player: Number(match[1]), unitTypeId: match[2] }));
}

function sourcePlayerDefeatedRequirements(source) {
  const trigger = firstVictoryTriggerBody(source);
  if (!trigger) {
    return [];
  }
  return [...trigger.matchAll(/GetPlayerData\((\d+),\s*"TotalNumUnits"\)\s*==\s*0/g)]
    .map((match) => ({ kind: "player-defeated", player: Number(match[1]) }));
}

function sourceOpponentDefeatedRequirements(source) {
  const trigger = firstVictoryTriggerBody(source);
  return trigger && /GetNumOpponents\(\s*GetThisPlayer\(\)\s*\)\s*==\s*0/.test(trigger)
    ? [{ kind: "opponents-defeated" }]
    : [];
}

function sourceExactUnitCountRequirements(source) {
  const trigger = firstVictoryTriggerBody(source);
  if (!trigger) {
    return [];
  }
  return [...trigger.matchAll(/GetPlayerData\(GetThisPlayer\(\),\s*"UnitTypesCount",\s*"([^"]+)"\)\s*==\s*(\d+)/g)]
    .map((match) => ({ kind: "unit-count-exact", unitTypeId: match[1], count: Number(match[2]) }));
}

function sourceVictoryRequirementGroups(source) {
  return victoryTriggerBodies(source)
    .map((trigger) => ({
      clauses: [
        ...[...trigger.matchAll(/GetPlayerData\(GetThisPlayer\(\),\s*"UnitTypesCount",\s*"([^"]+)"\)\s*>=\s*(\d+)/g)]
          .map((match) => ({ kind: "unit-count", unitTypeId: match[1], minimum: Number(match[2]) })),
        ...[...trigger.matchAll(/GetPlayerData\(GetThisPlayer\(\),\s*"UnitTypesCount",\s*"([^"]+)"\)\s*==\s*(\d+)/g)]
          .map((match) => ({ kind: "unit-count-exact", unitTypeId: match[1], count: Number(match[2]) })),
        ...[...trigger.matchAll(/GetPlayerData\((\d+),\s*"UnitTypesCount",\s*"([^"]+)"\)\s*==\s*0/g)]
          .map((match) => ({ kind: "unit-destroyed", player: Number(match[1]), unitTypeId: match[2] })),
        ...[...trigger.matchAll(/GetPlayerData\((\d+),\s*"TotalNumUnits"\)\s*==\s*0/g)]
          .map((match) => ({ kind: "player-defeated", player: Number(match[1]) })),
        ...(/GetNumOpponents\(\s*GetThisPlayer\(\)\s*\)\s*==\s*0/.test(trigger) ? [{ kind: "opponents-defeated" }] : [])
      ]
    }))
    .filter((group) => group.clauses.length > 0);
}

function hasRequirement(list, requirement) {
  return list.some((candidate) => (
    candidate.kind === requirement.kind
      && (requirement.kind !== "unit-count" || (candidate.unitTypeId === requirement.unitTypeId && candidate.minimum === requirement.minimum))
      && (requirement.kind !== "unit-count-exact" || (candidate.unitTypeId === requirement.unitTypeId && candidate.count === requirement.count))
      && (requirement.kind !== "unit-destroyed" || (candidate.player === requirement.player && candidate.unitTypeId === requirement.unitTypeId))
      && (requirement.kind !== "player-defeated" || candidate.player === requirement.player)
  ));
}

function groupsMatch(actualGroups, expectedGroups) {
  if ((actualGroups ?? []).length !== expectedGroups.length) {
    return false;
  }
  return expectedGroups.every((group, groupIndex) => {
    const actualClauses = actualGroups[groupIndex]?.clauses ?? [];
    return actualClauses.length === group.clauses.length
      && group.clauses.every((requirement) => hasRequirement(actualClauses, requirement));
  });
}

const unitIds = new Set((manifest.units ?? []).map((unit) => unit.id));
const mapsWithDestroyedRequirements = [];
const mapsWithPlayerDefeatedRequirements = [];
const mapsWithOpponentDefeatedRequirements = [];
const mapsWithExactUnitCountRequirements = [];
const mapsWithGroupedRequirements = [];
const checkedRequirements = [];
const checkedPlayerDefeatedRequirements = [];
const checkedOpponentDefeatedRequirements = [];
const checkedExactUnitCountRequirements = [];
const checkedGroupedRequirements = [];

for (const map of manifest.maps ?? []) {
  const scriptPath = campaignScriptPath(map.setupPath);
  if (!scriptPath) {
    continue;
  }
  const source = readFileSync(path.join(manifest.dataRoot, scriptPath), "utf8");
  const expected = sourceDestroyedRequirements(source);
  const expectedPlayerDefeated = sourcePlayerDefeatedRequirements(source);
  const expectedOpponentDefeated = sourceOpponentDefeatedRequirements(source);
  const expectedExactUnitCounts = sourceExactUnitCountRequirements(source);
  const expectedGroups = sourceVictoryRequirementGroups(source);
  if (expected.length > 0) {
    mapsWithDestroyedRequirements.push(map.path);
  }
  for (const requirement of expected) {
    checkedRequirements.push(`${map.path}:${requirement.player}:${requirement.unitTypeId}`);
    if (!unitIds.has(requirement.unitTypeId)) {
      error(`${map.path} source victory trigger references unknown unit ${requirement.unitTypeId}.`);
    }
    const foundOnMap = (map.victoryRequirements ?? []).some((candidate) => (
      candidate.kind === "unit-destroyed"
        && candidate.player === requirement.player
        && candidate.unitTypeId === requirement.unitTypeId
    ));
    if (!foundOnMap) {
      error(`${map.path} is missing source destruction requirement player ${requirement.player} ${requirement.unitTypeId}.`);
    }
    const foundOnSetup = (map.setup?.victoryRequirements ?? []).some((candidate) => (
      candidate.kind === "unit-destroyed"
        && candidate.player === requirement.player
        && candidate.unitTypeId === requirement.unitTypeId
    ));
    if (!foundOnSetup) {
      error(`${map.setupPath} setup summary is missing source destruction requirement player ${requirement.player} ${requirement.unitTypeId}.`);
    }
  }
  if (expectedExactUnitCounts.length > 0) {
    mapsWithExactUnitCountRequirements.push(map.path);
  }
  for (const requirement of expectedExactUnitCounts) {
    checkedExactUnitCountRequirements.push(`${map.path}:${requirement.unitTypeId}:${requirement.count}`);
    if (!unitIds.has(requirement.unitTypeId)) {
      error(`${map.path} source victory trigger references unknown exact-count unit ${requirement.unitTypeId}.`);
    }
    if (!hasRequirement(map.victoryRequirements ?? [], requirement)) {
      error(`${map.path} is missing source exact unit-count requirement ${requirement.unitTypeId} == ${requirement.count}.`);
    }
    if (!hasRequirement(map.setup?.victoryRequirements ?? [], requirement)) {
      error(`${map.setupPath} setup summary is missing source exact unit-count requirement ${requirement.unitTypeId} == ${requirement.count}.`);
    }
  }
  if (expectedPlayerDefeated.length > 0) {
    mapsWithPlayerDefeatedRequirements.push(map.path);
  }
  for (const requirement of expectedPlayerDefeated) {
    checkedPlayerDefeatedRequirements.push(`${map.path}:${requirement.player}`);
    const foundOnMap = (map.victoryRequirements ?? []).some((candidate) => (
      candidate.kind === "player-defeated"
        && candidate.player === requirement.player
    ));
    if (!foundOnMap) {
      error(`${map.path} is missing source player-defeated requirement player ${requirement.player}.`);
    }
    const foundOnSetup = (map.setup?.victoryRequirements ?? []).some((candidate) => (
      candidate.kind === "player-defeated"
        && candidate.player === requirement.player
    ));
    if (!foundOnSetup) {
      error(`${map.setupPath} setup summary is missing source player-defeated requirement player ${requirement.player}.`);
    }
  }
  if (expectedOpponentDefeated.length > 0) {
    mapsWithOpponentDefeatedRequirements.push(map.path);
  }
  for (const requirement of expectedOpponentDefeated) {
    checkedOpponentDefeatedRequirements.push(map.path);
    const foundOnMap = (map.victoryRequirements ?? []).some((candidate) => candidate.kind === requirement.kind);
    if (!foundOnMap) {
      error(`${map.path} is missing source opponent-defeated requirement.`);
    }
    const foundOnSetup = (map.setup?.victoryRequirements ?? []).some((candidate) => candidate.kind === requirement.kind);
    if (!foundOnSetup) {
      error(`${map.setupPath} setup summary is missing source opponent-defeated requirement.`);
    }
  }
  if (expectedGroups.length > 0) {
    mapsWithGroupedRequirements.push(map.path);
    checkedGroupedRequirements.push(...expectedGroups.map((group, groupIndex) => `${map.path}:${groupIndex}:${group.clauses.length}`));
    if (!groupsMatch(map.victoryRequirementGroups ?? [], expectedGroups)) {
      error(`${map.path} is missing source grouped ActionVictory clauses.`);
    }
    if (!groupsMatch(map.setup?.victoryRequirementGroups ?? [], expectedGroups)) {
      error(`${map.setupPath} setup summary is missing source grouped ActionVictory clauses.`);
    }
  }
}

if (checkedRequirements.length === 0) {
  error("Expected at least one indexed campaign source destruction victory requirement.");
}

if (!typesSource.includes('{ kind: "unit-destroyed"; unitTypeId: string; player: number }')) {
  error("WargusVictoryRequirement type does not include source destruction requirements.");
}

if (checkedExactUnitCountRequirements.length === 0) {
  error("Expected at least one indexed campaign source exact unit-count victory requirement.");
}

if (!typesSource.includes('{ kind: "unit-count-exact"; unitTypeId: string; count: number }')) {
  error("WargusVictoryRequirement type does not include source exact unit-count requirements.");
}

if (checkedPlayerDefeatedRequirements.length === 0) {
  error("Expected at least one indexed campaign source player-defeated victory requirement.");
}

if (!typesSource.includes('{ kind: "player-defeated"; player: number }')) {
  error("WargusVictoryRequirement type does not include source player-defeated requirements.");
}

if (checkedOpponentDefeatedRequirements.length === 0) {
  error("Expected at least one indexed campaign source opponent-defeated victory requirement.");
}

if (!typesSource.includes('{ kind: "opponents-defeated" }')) {
  error("WargusVictoryRequirement type does not include source opponent-defeated requirements.");
}

if (checkedGroupedRequirements.length === 0) {
  error("Expected at least one indexed campaign source victory requirement group.");
}

if (!typesSource.includes("export interface WargusVictoryRequirementGroup") || !typesSource.includes("victoryRequirementGroups?: WargusVictoryRequirementGroup[]")) {
  error("Wargus map/setup types do not include source victory requirement groups.");
}

if (!ordersSource.includes('requirement.kind === "unit-destroyed"') || !ordersSource.includes("unit.player === requirement.player")) {
  error("Runtime victory requirement checks do not consume source destruction requirements.");
}

if (!ordersSource.includes('requirement.kind === "unit-count-exact"') || !ordersSource.includes("count === requirement.count")) {
  error("Runtime victory requirement checks do not consume source exact unit-count requirements.");
}

if (!ordersSource.includes("world.victoryRequirementGroups.length > 0") || !ordersSource.includes("group.clauses.every")) {
  error("Runtime victory checks do not consume source grouped ActionVictory clauses.");
}

if (!ordersSource.includes('requirement.kind === "player-defeated"') || !ordersSource.includes("unit.player === requirement.player && unit.hitPoints > 0")) {
  error("Runtime victory requirement checks do not consume source player-defeated requirements.");
}

if (!ordersSource.includes('requirement.kind === "opponents-defeated"') || !ordersSource.includes("!enemyPlayersStillAlive(world)")) {
  error("Runtime victory requirement checks do not consume source opponent-defeated requirements.");
}

if (!ordersSource.includes("function hasSourceDestructionVictoryRequirements(world: WorldState): boolean") || !ordersSource.includes("if (hasSourceDestructionVictoryRequirements(world))")) {
  error("Runtime targeted destruction fallback should defer to indexed source destruction victory requirements.");
}

if (!ordersSource.includes("function hasSourceCaptureVictoryRequirements(world: WorldState): boolean") || !ordersSource.includes("if (hasSourceCaptureVictoryRequirements(world))")) {
  error("Runtime capture/recruit victory fallback should defer to indexed source ActionVictory groups when available.");
}

if (!ordersSource.includes("function hasSourceBuildVictoryRequirements(world: WorldState): boolean") || !ordersSource.includes("if (hasSourceBuildVictoryRequirements(world))")) {
  error("Runtime build-objective fallback should defer to indexed source unit-count/location-build requirements when available.");
}

if (!ordersSource.includes("function hasSourceEnemyEliminationVictoryRequirements(world: WorldState): boolean") || !ordersSource.includes("if (hasSourceEnemyEliminationVictoryRequirements(world))")) {
  error("Runtime enemy-elimination fallback should defer to indexed source player/opponent-defeated requirements when available.");
}

if (!ordersSource.includes("sourceRaceScoreForUnitDefinition(definition, world.unitDatabase, race)")) {
  error("Runtime objective race matching should route through the shared source-race helper.");
}

if (!sourceRaceSource.includes("sourceUnitDatabase.find((entry) => entry.unitTypeId === definition.id)?.race")) {
  error("Runtime objective race matching should prefer UnitDatabase race records before id-name fallbacks.");
}

if (!sourceRaceSource.includes("definition.source, definition.image, definition.icon")) {
  error("Runtime objective race matching should consult preserved source/image/icon paths before id-name fallbacks.");
}

if (!ordersSource.includes("sourceRaceScoreForUnitDefinition(definition, world.unitDatabase, race)") || !sourceRaceSource.includes("export function sourceRaceTextScore")) {
  error("Runtime objective race fallback should score preserved source definition text instead of browser ids alone.");
}

if (!ordersSource.includes("return sourceUnitDefinitionText(definition);") || !sourceRaceSource.includes("definition.id, definition.name, definition.source, definition.image, definition.icon")) {
  error("Runtime named objective matching should consult preserved source/image/icon paths in addition to id/name text.");
}

if (ordersSource.includes("function raceTypeScore(typeId: string")) {
  error("Runtime objective race matching should not classify race from type id alone.");
}

if (ordersSource.includes("const lower = typeId.toLowerCase()")) {
  error("Runtime objective race fallback should not score exact browser type ids directly.");
}

if (!hudSource.includes("...objectiveLines(manifest, world)") || !sourceUiHelpersSource.includes("unitTypeName(manifest, requirement.unitTypeId)")) {
  error("HUD objective progress lines do not use Wargus source unit names.");
}

if (!saveSource.includes('record.kind === "unit-destroyed"') || !saveSource.includes("isValidPlayerId(world, player, true)")) {
  error("Save/load normalization does not preserve source destruction requirements, including neutral player 15.");
}

if (!saveSource.includes('record.kind === "unit-count-exact"') || !saveSource.includes('{ kind: "unit-count-exact" as const, unitTypeId: record.unitTypeId, count }')) {
  error("Save/load normalization does not preserve source exact unit-count requirements.");
}

if (!saveSource.includes('victoryRequirementGroups?: WorldState["victoryRequirementGroups"]') || !saveSource.includes("function normalizeVictoryRequirementGroups") || !saveSource.includes("world.victoryRequirementGroups = normalizeVictoryRequirementGroups")) {
  error("Save/load normalization does not preserve source victory requirement groups.");
}

if (!saveSource.includes('record.kind === "player-defeated"') || !saveSource.includes('{ kind: "player-defeated" as const, player }')) {
  error("Save/load normalization does not preserve source player-defeated requirements.");
}

if (!saveSource.includes('record.kind === "opponents-defeated"') || !saveSource.includes('{ kind: "opponents-defeated" as const }')) {
  error("Save/load normalization does not preserve source opponent-defeated requirements.");
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Source victory requirement errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Source victory requirements verified (${checkedRequirements.length} destruction clauses across ${mapsWithDestroyedRequirements.length} campaign maps, ${checkedExactUnitCountRequirements.length} exact unit-count clauses across ${mapsWithExactUnitCountRequirements.length} campaign maps, ${checkedPlayerDefeatedRequirements.length} player-defeated clauses across ${mapsWithPlayerDefeatedRequirements.length} campaign maps, ${checkedOpponentDefeatedRequirements.length} opponent-defeated clauses across ${mapsWithOpponentDefeatedRequirements.length} campaign maps, ${checkedGroupedRequirements.length} grouped ActionVictory clauses across ${mapsWithGroupedRequirements.length} campaign maps).`);
