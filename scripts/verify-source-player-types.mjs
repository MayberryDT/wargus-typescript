import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
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

function mapScriptPath(mapPath) {
  return mapPath && existsSync(path.join(manifest.dataRoot, mapPath)) ? mapPath : null;
}

function sourcePlayerTypes(source) {
  const match = source.match(/DefinePlayerTypes\(([^)]*)\)/);
  return match
    ? [...match[1].matchAll(/"([^"]+)"/g)].map((typeMatch, index) => ({ player: index, playerType: typeMatch[1] }))
    : [];
}

function playerTypesFromSourceFile(sourcePath) {
  return sourcePath ? sourcePlayerTypes(readFileSync(path.join(manifest.dataRoot, sourcePath), "utf8")) : [];
}

function hasRule(rules, expected) {
  return (rules ?? []).some((rule) => rule.player === expected.player && rule.playerType === expected.playerType);
}

let mapsWithTypes = 0;
let checkedTypes = 0;
let humanEightPersonPlayer = null;
let nethergardePlayerOne = null;
let randomMapTypes = null;
let tournamentForestTypes = null;

for (const map of manifest.maps ?? []) {
  if (map.path === "campaigns/human-exp/levelx02h.smp.gz") {
    const setup = map.setupJson ? JSON.parse(readFileSync(path.join("public/wargus", map.setupJson), "utf8")) : null;
    nethergardePlayerOne = (setup?.players ?? []).find((player) => player.player === 1);
    if (nethergardePlayerOne?.race !== "human" || nethergardePlayerOne?.ai !== "wc2-passive") {
      error("Nethergarde should preserve player 1 as the source human passive campaign side.");
    }
  }
  const expected = [
    ...playerTypesFromSourceFile(mapScriptPath(map.path)),
    ...playerTypesFromSourceFile(campaignScriptPath(map.setupPath))
  ];
  if (expected.length === 0) {
    continue;
  }
  mapsWithTypes += 1;
  checkedTypes += expected.length;
  const setup = map.setupJson ? JSON.parse(readFileSync(path.join("public/wargus", map.setupJson), "utf8")) : null;
  for (const rule of expected) {
    if (!hasRule(map.playerTypes, rule)) {
      error(`${map.path} is missing source player type ${JSON.stringify(rule)}.`);
    }
    if (!hasRule(map.setup?.playerTypes, rule)) {
      error(`${map.path} setup summary is missing source player type ${JSON.stringify(rule)}.`);
    }
    if (!hasRule(setup?.playerTypes, rule)) {
      error(`${map.setupJson} setup data is missing source player type ${JSON.stringify(rule)}.`);
    }
    const setupPlayer = (setup?.players ?? []).find((player) => player.player === rule.player);
    if (setupPlayer && setupPlayer.playerType !== rule.playerType) {
      error(`${map.setupJson} player ${rule.player} has playerType=${setupPlayer.playerType}, expected ${rule.playerType}.`);
    }
    if (map.path === "campaigns/human/level08h.smp.gz" && rule.playerType === "person") {
      humanEightPersonPlayer = rule.player;
    }
  }
  if (map.path === "maps/randommap.smp") {
    randomMapTypes = expected;
  }
  if (map.path === "maps/king/(4)tournament-forest.smp") {
    tournamentForestTypes = expected;
  }
}

if (mapsWithTypes < 8 || checkedTypes < 60) {
  error(`Expected campaign and presented-map DefinePlayerTypes coverage, got maps=${mapsWithTypes}, types=${checkedTypes}.`);
}
if (humanEightPersonPlayer !== 6) {
  error(`Expected Human VIII source person player to be 6, got ${String(humanEightPersonPlayer)}.`);
}
if (!nethergardePlayerOne) {
  error("Expected to inspect Nethergarde campaign player data.");
}
if (!hasRule(randomMapTypes, { player: 0, playerType: "person" }) || !hasRule(randomMapTypes, { player: 1, playerType: "computer" }) || !hasRule(randomMapTypes, { player: 2, playerType: "computer" })) {
  error("Random map should preserve presented source player types person/computer/computer.");
}
if (!hasRule(tournamentForestTypes, { player: 4, playerType: "nobody" }) || !hasRule(tournamentForestTypes, { player: 5, playerType: "rescue-active" })) {
  error("Tournament Forest should preserve presented nobody and rescue-active player slots.");
}

for (const fragment of [
  "export interface WargusPlayerTypeRule",
  "playerTypes?: WargusPlayerTypeRule[]",
  "playerType: string | null;"
]) {
  if (!typesSource.includes(fragment)) {
    error(`Types are missing source player-type fragment: ${fragment}`);
  }
}

for (const fragment of [
  "function parsePlayerTypes",
  "playerTypes: parsePlayerTypes(source)",
  "function mergePlayerTypes",
  "playerTypes: parsePlayerTypes(campaignSource)",
  "map.playerTypes = mergePlayerTypes(map.playerTypes, campaign.playerTypes)",
  "playerType: playerTypes.get(player) ?? null"
]) {
  if (!indexSource.includes(fragment)) {
    error(`Indexer is missing source player-type fragment: ${fragment}`);
  }
}

for (const fragment of [
  "playerType: string | null;",
  "playerType: player.playerType",
  "const playablePlayerId = playablePlayerIdForPlayers(players, setup, sourceAiDefinitions)",
  "function playablePlayerIdForPlayers",
  "player.playerType === \"person\"",
  "sourceCampaignPassivePlayerId(players, setup, aiDefinitions)",
  "function sourceCampaignPassivePlayerId",
  "function sourceCampaignRace",
  "sourceAiNameIsPassive(player.ai, aiDefinitions)",
  "function sourceAiDefinitionIsPassive",
  'definition.script === "AiPassive"',
  'definition.source === "scripts/ai/passive.lua"',
  "path?.startsWith(\"campaigns/human\")",
  "path?.startsWith(\"campaigns/orc\")",
  "entry.player.id !== playablePlayerId",
  "entry.player.playerType !== \"person\"",
  "entry.player.playerType !== \"nobody\"",
  "visibilityPlayer: playablePlayerId",
  "requiredSurvivalUnitIdsForObjectives(objectives, units, playablePlayerId)"
]) {
  if (!worldSource.includes(fragment)) {
    error(`World creation is missing source player-type fragment: ${fragment}`);
  }
}

if (worldSource.includes('aiName?.toLowerCase().includes("passive")') || worldSource.includes('normalized.includes("passive")')) {
  error("World player/AI passive detection should use indexed source AI definitions instead of scanning AI name text.");
}

for (const fragment of [
  "playerType: normalizeNullableString(record.playerType",
  "fallback?.playerType ?? null",
  "world.visibilityPlayer = normalizeVisibilityPlayer(save.world.visibilityPlayer, world)",
  "player.playerType !== \"person\" && player.playerType !== \"nobody\"",
  "sourceAiDefinitionForName(world.aiDefinitions, aiName)",
  "!sourceAiDefinitionIsPassive(definition)"
]) {
  if (!saveSource.includes(fragment)) {
    error(`Save/load is missing source player-type fragment: ${fragment}`);
  }
}

if (saveSource.includes('normalized.includes("passive")') || saveSource.includes('toLowerCase().includes("passive")') || saveSource.includes("function isActiveAiName")) {
  error("Save/load AI activity restoration should use indexed source AI definitions instead of scanning AI name text.");
}

if (saveSource.indexOf("world.visibilityPlayer = normalizeVisibilityPlayer(save.world.visibilityPlayer, world)") > saveSource.indexOf("world.aiStates = normalizeAiStates(save.world.aiStates, world, savedTick)")) {
  error("Save/load must restore visibilityPlayer before normalizing AI states.");
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Source player type errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Source player types verified (${checkedTypes} player types across ${mapsWithTypes} maps).`);
