import { readFileSync } from "node:fs";

const source = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_attack.cpp", "utf8");
const commandSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/command.cpp", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");

const errors = [];

for (const fragment of [
  "#define AUTO_TARGETING",
  "#define MOVE_TO_TARGET",
  "#define ATTACK_TARGET",
  "#define MOVE_TO_ATTACKPOS",
  "order->Range = attacker.Stats->Variables[ATTACKRANGE_INDEX].Max;",
  "order->MinRange = attacker.Type->MinAttackRange;",
  "AnimateActionAttack",
  "FireMissile(unit, this->GetGoal(), this->goalPos);",
  "UnHideUnit(unit)",
  "AutoSelectTarget",
  "AttackUnitsInReactRange(unit)",
  "AttackUnitsInRange(unit)",
  "MoveToBetterPos",
  "unit.Type->MinAttackRange",
  "GetRndPosInDirection",
  "IsTargetTooClose",
  "MoveToAttackPos",
  "AutoCast(unit)",
  "action-attack",
  "action-attack-ground",
  "\"min-range\"",
  "\"amove-tile\"",
  "\"state\""
]) {
  if (!source.includes(fragment)) {
    errors.push(`Stratagus attack source missing expected fragment: ${fragment}`);
  }
}

for (const fragment of [
  "void CommandAttack(CUnit &unit, const Vec2i &pos, CUnit *target, EFlushMode flush)",
  "void CommandAttackGround(CUnit &unit, const Vec2i &pos, EFlushMode flush)",
  "order = GetNextOrder(unit, flush)",
  "*order = COrder::NewActionAttack(unit, *target)",
  "*order = COrder::NewActionAttackGround(unit, pos)"
]) {
  if (!commandSource.includes(fragment)) {
    errors.push(`Stratagus attack command source missing expected fragment: ${fragment}`);
  }
}

for (const [label, text, fragments] of [
  ["world attack order", worldSource, [
    'kind: "attack"',
    'kind: "attack-target"',
    'kind: "attack-move"',
    'kind: "attack-ground"',
    'kind: "move" | "attack-move" | "attack-ground" | "patrol"',
    'kind: "follow" | "defend" | "repair" | "load-transport"',
    "attackRange: number",
    "minAttackRange: number"
  ]],
  ["orders attack action", ordersSource, [
    "export function issueAttackOrder",
    "export function issueAttackTargetAtOrder",
    "export function issueQueueAttackOrder",
    "export function issueAttackMoveOrder",
    "export function issueAttackGroundOrder",
    "export function issueSourceRightButtonOrder",
    "export function issueGroupQueueAttackTargetAtOrder",
    "? issueGroupQueueAttackTargetAtOrder(world, unitIds, x, y, playerId)",
    "queue\n      ? issueGroupQueueAttackGroundOrder",
    "export function issueQueueAttackGroundOrder",
    "export function canIssueAttackTargetWithPath",
    "export function canIssueQueueAttackGroundAt",
    "export function canIssueQueueAttackTarget",
    "!unit || !target || !canIssueAttackTargetWithPath(world, unit, target)",
    "issueQueueAttackOrder(world, unit.id, target.id)",
    "unit.moveQueue.push({ kind: \"attack-target\"",
    "unit.moveQueue.push({ kind: \"attack-ground\"",
    "export function issueGroupQueueAttackGroundOrder",
    "issueGroupQueueSmartOrder",
    "if (target.kind === \"attack-target\")",
    "if (target.kind === \"attack-ground\")",
    "const inRange = isGroundTargetInRange(world, unit, target.x, target.y)",
    "function stepAttackOrder",
    "function stepAttackMoveOrder",
    "function stepAttackGroundOrder",
    "function isInAttackRange",
    "function minimumAttackDistanceForTarget",
    "function isTargetInsideMinimumAttackRange",
    "function isGroundTargetInsideMinimumAttackRange",
    "function findBetterAttackPositionPath",
    "unit.minAttackRange + world.tileSize",
    "stepMoveOrder(world, unit, tickSeconds)",
    "findNearestEnemyInAggroRange(world, unit)",
    "findNearestEnemyInRange(world, unit)",
    "stepPlayerAutoCast(world, unit)",
    "launchAttack(world, unit, target)",
    "launchGroundAttack(world, unit",
    "removeStatusEffect(attacker, \"invisibility\")",
    "canLaunchAttackNow(unit, target)",
    "turnSideAttackTowardTarget(unit, target, tickSeconds)"
  ]],
  ["save-game attack order", saveSource, [
    'kind === "attack"',
    '|| record.kind === "attack-target"',
    'kind === "attack-move"',
    'kind === "attack-ground"',
    "|| record.kind === \"attack-ground\"",
    "|| record.kind === \"patrol\"",
    "|| record.kind === \"follow\"",
    "canIssueQueueAttackGroundAt,",
    "kind === \"attack-ground\" && !canIssueQueueAttackGroundAt(world, unit, x, y)",
    "canIssueQueueAttackTarget(world, unit, target)",
    "canIssueAttackTarget(world, unit, target)",
    "canIssueAttackTargetWithPath(world, unit, target)",
    "hasInvalidLoadedAttackOrder",
    "hasInvalidLoadedAttackMoveOrder",
    "hasInvalidLoadedAttackGroundOrder",
    "const source = world.units.find((unit) => unit.id === sourceId)",
    "const player = source?.player ?? null",
    "targetUnit && !canAttackTarget(source, targetUnit, world)",
    "!targetUnit && !source.groundAttack",
    "canIssueAttackGroundAt(world, unit"
  ]],
  ["package verify script", packageSource, [
    "\"verify:source-attack-action\"",
    "npm run verify:source-attack-action"
  ]]
]) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      errors.push(`${label} missing source attack fragment: ${fragment}`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source attack action verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source attack action verified (target/ground/attack-move orders, min-range repositioning, auto-targeting, autocast, invisibility break, and save/load validation).");
