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
  if (!setupPath?.startsWith("campaigns/")) return null;
  const candidate = setupPath.replace(/\.gz$/, "").replace(/\.sms$/i, "_c.sms");
  return existsSync(path.join(manifest.dataRoot, candidate)) ? candidate : null;
}

function sourceSharedVision(source) {
  return [...source.matchAll(/SetSharedVision\(\s*(\d+)\s*,\s*(true|false)\s*,\s*(\d+)\s*\)/g)]
    .map((match) => ({ player: Number(match[1]), enabled: match[2] === "true", otherPlayer: Number(match[3]) }));
}

function teamSharedVision(setup) {
  const teams = setup?.teams ?? [];
  const rules = [];
  for (const left of teams) {
    for (const right of teams) {
      if (left.player === right.player || left.team <= 0 || right.team <= 0) continue;
      rules.push({ player: left.player, enabled: left.team === right.team, otherPlayer: right.player });
    }
  }
  return rules;
}

function hasRule(rules, expected) {
  return (rules ?? []).some((rule) => rule.player === expected.player && rule.enabled === expected.enabled && rule.otherPlayer === expected.otherPlayer);
}

let explicitRules = 0;
let teamRules = 0;
let mapsWithRules = 0;

for (const map of manifest.maps ?? []) {
  const setup = map.setupJson ? JSON.parse(readFileSync(path.join("public/wargus", map.setupJson), "utf8")) : null;
  const expected = [];
  const scriptPath = campaignScriptPath(map.setupPath);
  if (scriptPath) {
    expected.push(...sourceSharedVision(readFileSync(path.join(manifest.dataRoot, scriptPath), "utf8")));
  }
  expected.push(...teamSharedVision(setup));
  if (expected.length === 0) continue;
  mapsWithRules += 1;
  explicitRules += scriptPath ? sourceSharedVision(readFileSync(path.join(manifest.dataRoot, scriptPath), "utf8")).length : 0;
  teamRules += teamSharedVision(setup).length;
  for (const rule of expected) {
    if (!hasRule(map.sharedVision, rule)) error(`${map.path} is missing shared-vision rule ${JSON.stringify(rule)}.`);
    if (!hasRule(map.setup?.sharedVision, rule)) error(`${map.path} setup summary is missing shared-vision rule ${JSON.stringify(rule)}.`);
    if (!hasRule(setup?.sharedVision, rule)) error(`${map.setupJson} setup data is missing shared-vision rule ${JSON.stringify(rule)}.`);
  }
}

if (mapsWithRules < 1 || teamRules < 1) {
  error(`Expected source team shared-vision coverage, got maps=${mapsWithRules}, teamRules=${teamRules}.`);
}

for (const fragment of [
  "export interface WargusSharedVisionRule",
  "sharedVision?: WargusSharedVisionRule[]",
  "sharedVision: WargusSharedVisionRule[]"
]) {
  if (!typesSource.includes(fragment)) error(`Types are missing shared-vision fragment: ${fragment}`);
}

for (const fragment of [
  "function parseSharedVisionRules",
  "sharedVision: parseSharedVisionRules(campaignSource)",
  "function sharedVisionRulesFromTeams",
  "const sharedVision = []",
  "SetSharedVision\\(\\s*([A-Za-z_][A-Za-z0-9_]*|-?\\d+)",
  "mapSetupPlayerReferenceToNumber(match[1], playerSymbols)",
  "sharedVision: mergeSharedVisionRules(presentation.sharedVision ?? [], sharedVisionRulesFromTeams(mergeMapTeams(presentation.teams ?? [], teams)), sharedVision)"
]) {
  if (!indexSource.includes(fragment)) error(`Indexer is missing shared-vision fragment: ${fragment}`);
}

for (const fragment of [
  "sharedVision: WargusMapSetup[\"sharedVision\"]",
  "sharedVision: setup?.sharedVision ?? map.sharedVision ?? []",
  "function doesPlayerShareVisionWith",
  "doesPlayerShareVisionWith(world, world.visibilityPlayer, unit.player)",
  "doesPlayerShareVisionWith(world, playerId, effect.player)"
]) {
  if (!worldSource.includes(fragment)) error(`World visibility is missing shared-vision fragment: ${fragment}`);
}

for (const fragment of [
  "sharedVision?: WorldState[\"sharedVision\"]",
  "sharedVision: world.sharedVision",
  "function normalizeSharedVisionRules",
  "world.sharedVision = normalizeSharedVisionRules",
  "const byPair = new Map<string, WorldState[\"sharedVision\"][number]>();",
  "byPair.set(`${player}:${otherPlayer}`, { player, enabled: Boolean(record.enabled), otherPlayer });",
  "return [...byPair.values()].sort((left, right) => left.player - right.player || left.otherPlayer - right.otherPlayer);"
]) {
  if (!saveSource.includes(fragment)) error(`Save/load is missing shared-vision fragment: ${fragment}`);
}

if (errors.length > 0) {
  for (const message of errors) console.error(message);
  console.error(`Source shared-vision errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Source shared vision verified (${explicitRules} explicit rules, ${teamRules} team-derived rules across ${mapsWithRules} maps).`);
