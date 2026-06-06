import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const errors = [];

function error(message) {
  errors.push(message);
}

function expectedDiplomacyFromTeams(teams) {
  const rules = [];
  for (const left of teams ?? []) {
    for (const right of teams ?? []) {
      if (left.player === right.player || left.team <= 0 || right.team <= 0) continue;
      rules.push({
        player: left.player,
        state: left.team === right.team ? "allied" : "enemy",
        otherPlayer: right.player
      });
    }
  }
  return rules;
}

function hasRule(rules, expected) {
  return (rules ?? []).some((rule) => rule.player === expected.player && rule.state === expected.state && rule.otherPlayer === expected.otherPlayer);
}

let mapsWithTeams = 0;
let checkedRules = 0;
let alliedRules = 0;
let enemyRules = 0;

for (const map of manifest.maps ?? []) {
  if ((map.teams ?? []).length === 0) continue;
  mapsWithTeams += 1;
  const setup = map.setupJson ? JSON.parse(readFileSync(path.join("public/wargus", map.setupJson), "utf8")) : null;
  for (const rule of expectedDiplomacyFromTeams(map.teams)) {
    checkedRules += 1;
    if (rule.state === "allied") alliedRules += 1;
    if (rule.state === "enemy") enemyRules += 1;
    if (!hasRule(map.diplomacy, rule)) error(`${map.path} is missing team diplomacy rule ${JSON.stringify(rule)}.`);
    if (!hasRule(map.setup?.diplomacy, rule)) error(`${map.path} setup summary is missing team diplomacy rule ${JSON.stringify(rule)}.`);
    if (!hasRule(setup?.diplomacy, rule)) error(`${map.setupJson} setup data is missing team diplomacy rule ${JSON.stringify(rule)}.`);
  }
}

if (mapsWithTeams !== 5 || checkedRules !== 84 || alliedRules < 1 || enemyRules < 1) {
  error(`Expected 5 team maps and 84 team diplomacy rules with allied/enemy coverage, got maps=${mapsWithTeams}, rules=${checkedRules}, allied=${alliedRules}, enemy=${enemyRules}.`);
}

for (const fragment of [
  "function diplomacyRulesFromTeams",
  "diplomacy: diplomacyRulesFromTeams(parseMapTeams(source))",
  "const diplomacy = []",
  "SetDiplomacy\\(\\s*([A-Za-z_][A-Za-z0-9_]*|-?\\d+)",
  "mapSetupPlayerReferenceToNumber(match[1], playerSymbols)",
  "diplomacy: mergeDiplomacyRules(presentation.diplomacy ?? [], diplomacyRulesFromTeams(mergeMapTeams(presentation.teams ?? [], teams)), diplomacy)",
  "map.diplomacy = mergeDiplomacyRules(campaign.diplomacy, diplomacyRulesFromTeams(map.teams ?? []))"
]) {
  if (!indexSource.includes(fragment)) error(`Indexer is missing team diplomacy fragment: ${fragment}`);
}

for (const fragment of [
  "function arePlayersEnemies",
  "function arePlayersAllied",
  "function sourceDiplomacyState",
  "return source ? source === \"enemy\" : true",
  "return sourceDiplomacyState(world, player, otherPlayer) === \"allied\""
]) {
  if (!ordersSource.includes(fragment)) error(`Runtime diplomacy is missing fragment: ${fragment}`);
}

for (const fragment of [
  "diplomacy: world.diplomacy",
  "world.diplomacy = normalizeDiplomacyRules",
  "function normalizeDiplomacyRules"
]) {
  if (!saveSource.includes(fragment)) error(`Save/load diplomacy is missing fragment: ${fragment}`);
}

if (errors.length > 0) {
  for (const message of errors) console.error(message);
  console.error(`Source team diplomacy errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Source team diplomacy verified (${checkedRules} rules across ${mapsWithTeams} team maps: ${alliedRules} allied, ${enemyRules} enemy).`);
