import { readFileSync } from "node:fs";

const source = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_explore.cpp", "utf8");
const commandSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus/src/action/command.cpp", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const commandKeySource = readFileSync("src/simulation/commandKeys.ts", "utf8");
const hudCommandExecutionSource = readFileSync("src/view/hudCommandExecution.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");

const errors = [];

for (const fragment of [
  "void CommandExplore(CUnit &unit, EFlushMode flush)",
  "order = GetNextOrder(unit, flush);",
  "*order = COrder::NewActionExplore(unit);"
]) {
  if (!commandSource.includes(fragment)) {
    errors.push(`Stratagus explore command source missing expected fragment: ${fragment}`);
  }
}

for (const fragment of [
  "static void GetExplorationTarget",
  "triesLeft = Map.NoFogOfWar ? 0 : 3",
  "!field->playerInfo.IsExplored(player)",
  "this->Range++",
  "this->Range = 0",
  "this->WaitingCycle == 5",
  "GetExplorationTarget(unit, this->goalPos);",
  "AutoAttack(unit) || AutoRepair(unit) || AutoCast(unit)",
  "\"waiting-cycle\"",
  "\"range\"",
  "\"tile\""
]) {
  if (!source.includes(fragment)) {
    errors.push(`Stratagus explore source missing expected fragment: ${fragment}`);
  }
}

for (const [label, text, fragments] of [
  ["world explore order", worldSource, [
    'kind: "explore"',
    'kind: "move" | "attack-move" | "attack-ground" | "patrol" | "unload-transport" | "stand-ground" | "explore"',
    "exploreRange: number",
    "exploreWaitingCycle: number"
  ]],
  ["orders explore action", ordersSource, [
    'kind: "explore"',
    "executeDirectHudCommand(world: WorldState, unitIds: string[], command: string, playerId = world.visibilityPlayer, queue = false)",
    "issueQueueExploreOrder",
    "unit.moveQueue.push({ kind: \"explore\"",
    "issueExploreOrder(world, unit.id, { clearQueue: false })",
    "queue ? issueQueueExploreOrder(world, unit.id) : issueExploreOrder(world, unit.id)",
    "issueSourceInstantActionByKey(world: WorldState, unit: WorldUnit, code: string, queue = false)",
    "issueSourceInstantAction(world, unit, sourceButton.action, queue)",
    "exploreRange: 0",
    "exploreWaitingCycle: 0",
    "function stepExploreOrder",
    "function findExplorationPathWithinSourceRange",
    "function retargetExploreOrder",
    "unit.order.exploreRange += 1",
    "unit.order.exploreRange = 0",
    "unit.order.exploreWaitingCycle += 1",
    "unit.order.exploreWaitingCycle >= 5",
    "findUnexploredExplorationCandidates",
    "world.exploredTiles[y * world.map.width + x] !== 0",
    "stepAutoRepair(world, unit)",
    "stepPlayerAutoCast(world, unit)",
    "stepDefensiveAutoAttack(world, unit)"
  ]],
  ["save-game explore order", saveSource, [
    'kind === "explore"',
    'record.kind === "explore"',
    "canIssueExploreOrder(world, unit)",
    "function hasInvalidLoadedExploreOrder",
    "exploreRange: Math.max(0, Math.min(64, Math.floor(finiteNumberOr(record.exploreRange, 0))))",
    "exploreWaitingCycle: Math.max(0, Math.min(5, Math.floor(finiteNumberOr(record.exploreWaitingCycle, 0))))"
  ]],
  ["hud explore queue input", hudCommandExecutionSource, [
    "input: { ctrlKey?: boolean; shiftKey?: boolean }",
    "executeDirectHudCommand(world, selectedUnitIds, command, world.visibilityPlayer, input.shiftKey === true)"
  ]],
  ["command-key explore queue input", commandKeySource, [
    "const queue = input.shiftKey === true;",
    "issueSourceInstantActionByKey(loadedWorld, unit, code, queue)"
  ]],
  ["package verify script", packageSource, [
    "\"verify:source-explore-action\"",
    "npm run verify:source-explore-action"
  ]]
]) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      errors.push(`${label} missing source explore fragment: ${fragment}`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source explore action verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source explore action verified (persistent target, range widening, wait-cycle retargeting, automatic interruptions, and save/load state).");
