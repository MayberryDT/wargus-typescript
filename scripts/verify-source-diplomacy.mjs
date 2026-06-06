import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const mapCommandsSource = readFileSync("src/view/mapCommands.ts", "utf8");
const renderHudSource = readFileSync("src/view/renderHud.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const diplomacyMenuSource = readFileSync(path.join(manifest.dataRoot, "scripts/menus/diplomacy.lua"), "utf8");
const errors = [];

function error(message) {
  errors.push(message);
}

function campaignScriptPath(setupPath) {
  if (!setupPath?.startsWith("campaigns/")) return null;
  const candidate = setupPath.replace(/\.gz$/, "").replace(/\.sms$/i, "_c.sms");
  return existsSync(path.join(manifest.dataRoot, candidate)) ? candidate : null;
}

function sourceDiplomacy(source) {
  return [...source.matchAll(/SetDiplomacy\(\s*(\d+)\s*,\s*"([^"]+)"\s*,\s*(\d+)\s*\)/g)]
    .map((match) => ({ player: Number(match[1]), state: match[2], otherPlayer: Number(match[3]) }));
}

function hasRule(rules, expected) {
  return (rules ?? []).some((rule) => rule.player === expected.player && rule.state === expected.state && rule.otherPlayer === expected.otherPlayer);
}

let mapsWithDiplomacy = 0;
let checkedRules = 0;

for (const map of manifest.maps ?? []) {
  const scriptPath = campaignScriptPath(map.setupPath);
  if (!scriptPath) continue;
  const expected = sourceDiplomacy(readFileSync(path.join(manifest.dataRoot, scriptPath), "utf8"));
  if (expected.length === 0) continue;
  mapsWithDiplomacy += 1;
  checkedRules += expected.length;
  const setup = map.setupJson ? JSON.parse(readFileSync(path.join("public/wargus", map.setupJson), "utf8")) : null;
  for (const rule of expected) {
    if (!hasRule(map.diplomacy, rule)) error(`${map.path} is missing source diplomacy rule ${JSON.stringify(rule)}.`);
    if (!hasRule(map.setup?.diplomacy, rule)) error(`${map.path} setup summary is missing source diplomacy rule ${JSON.stringify(rule)}.`);
    if (!hasRule(setup?.diplomacy, rule)) error(`${map.setupJson} setup data is missing source diplomacy rule ${JSON.stringify(rule)}.`);
  }
}

if (mapsWithDiplomacy !== 1 || checkedRules !== 4) {
  error(`Expected Human VIII SetDiplomacy coverage only, got maps=${mapsWithDiplomacy}, rules=${checkedRules}.`);
}

for (const fragment of [
  "export interface WargusDiplomacyRule",
  "diplomacy?: WargusDiplomacyRule[]",
  'state: "allied" | "enemy" | "neutral";'
]) {
  if (!typesSource.includes(fragment)) error(`Types are missing diplomacy fragment: ${fragment}`);
}

for (const fragment of [
  "function parseDiplomacyRules",
  "diplomacy: parseDiplomacyRules(campaignSource)",
  "SetDiplomacy"
]) {
  if (!indexSource.includes(fragment)) error(`Indexer is missing diplomacy fragment: ${fragment}`);
}

for (const fragment of [
  "diplomacy: WargusMapSetup[\"diplomacy\"]",
  "diplomacy: setup?.diplomacy ?? map.diplomacy ?? []"
]) {
  if (!worldSource.includes(fragment)) error(`World creation is missing diplomacy fragment: ${fragment}`);
}

for (const fragment of [
  "function arePlayersEnemies",
  "function arePlayersAllied",
  "function sourceDiplomacyState",
  "canAttackTarget(attacker: WorldUnit, target: WorldUnit, world?: WorldState)",
  "function isInAttackRange(unit: WorldUnit, target: WorldUnit, world?: WorldState)",
  "return isInAttackRange(unit, candidate, world)",
  "if (isInAttackRange(unit, target, world))",
  "arePlayersEnemies(world, caster.player, unit.player)",
  "arePlayersAllied(world, unit.player, caster.player)"
]) {
  if (!ordersSource.includes(fragment)) error(`Runtime is missing diplomacy fragment: ${fragment}`);
}

for (const fragment of [
  "function RunDiplomacyMenu()",
  "ThisPlayer:IsAllied(Players[i])",
  "ThisPlayer:IsEnemy(Players[i])",
  "ThisPlayer:HasSharedVisionWith(Players[i])",
  "SetDiplomacy(ThisPlayer.Index, \"allied\", i)",
  "SetDiplomacy(ThisPlayer.Index, \"enemy\", i)",
  "SetDiplomacy(ThisPlayer.Index, \"neutral\", i)",
  "SetSharedVision(ThisPlayer.Index, true, i)",
  "SetSharedVision(ThisPlayer.Index, false, i)",
  "Players[i].Type == PlayerComputer"
]) {
  if (!diplomacyMenuSource.includes(fragment)) error(`Source diplomacy menu no longer has expected fragment: ${fragment}`);
}

for (const fragment of [
  "diplomacy?: WorldState[\"diplomacy\"]",
  "diplomacy: world.diplomacy",
  "function normalizeDiplomacyRules",
  "world.diplomacy = normalizeDiplomacyRules",
  "const byPair = new Map<string, WorldState[\"diplomacy\"][number]>();",
  "byPair.set(`${player}:${otherPlayer}`, { player, state: record.state, otherPlayer });",
  "return [...byPair.values()].sort((left, right) => left.player - right.player || left.otherPlayer - right.otherPlayer);"
]) {
  if (!saveSource.includes(fragment)) error(`Save/load is missing diplomacy fragment: ${fragment}`);
}

for (const fragment of [
  "type SourceDiplomacyDraft",
  "diplomacyDraft: SourceDiplomacyDraft | null",
  "sourceMenuOverlayLines(menu, world, manifest, paused, gameSpeed, activeSaveSlot, activeSaveSummary, autosaveSummary, diplomacyDraft)",
  "sourceMenuOverlayButtons(menu, world, diplomacyDraft)",
  "button.disabled"
]) {
  if (!renderHudSource.includes(fragment)) error(`Diplomacy HUD overlay is missing staged dialog fragment: ${fragment}`);
}

for (const fragment of [
  "export interface SourceDiplomacyDraft",
  "export interface SourceDiplomacyDraftRow",
  "Player                  Allied  Enemy  Shared Vision",
  "`diplomacy-ally-${row.player}`",
  "`diplomacy-enemy-${row.player}`",
  "`diplomacy-vision-${row.player}`",
  "{ label: \"OK\", command: \"diplomacy-ok\" }",
  "{ label: \"Cancel\", command: \"diplomacy-cancel\" }",
  "player.playerType === \"computer\" && sourceDiplomacyState(world, player.id, world.visibilityPlayer) !== \"allied\""
]) {
  if (!sourceUiHelpersSource.includes(fragment)) error(`Source UI diplomacy dialog is missing staged-menu fragment: ${fragment}`);
}

for (const fragment of [
  "diplomacyDraft: SourceDiplomacyDraft | null",
  "command.startsWith(\"diplomacy-ally-\") || command.startsWith(\"diplomacy-enemy-\") || command.startsWith(\"diplomacy-vision-\")",
  "command === \"diplomacy-ok\"",
  "command === \"diplomacy-cancel\"",
  "context.state.diplomacyDraft = createDiplomacyDraft(context.world, context.world.visibilityPlayer)",
  "function createDiplomacyDraft",
  "function updateDiplomacyDraft",
  "if (row.allied && row.enemy)",
  "function applyDiplomacyDraft",
  "setDiplomacyState(world, player, row.player, nextState)",
  "setSharedVisionState(world, player, row.player, row.sharedVision)",
  "candidate.playerType === \"computer\" && diplomacyState(world, candidate.id, player) !== \"allied\""
]) {
  if (!mapCommandsSource.includes(fragment)) error(`Map command diplomacy runtime is missing staged dialog fragment: ${fragment}`);
}

if (errors.length > 0) {
  for (const message of errors) console.error(message);
  console.error(`Source diplomacy errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Source diplomacy verified (${checkedRules} rules across ${mapsWithDiplomacy} campaign map).`);
