import { readFileSync } from "node:fs";

const source = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_patrol.cpp", "utf8");
const commandSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/command.cpp", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");

const errors = [];

for (const fragment of [
  "this->WaitingCycle = 1",
  "this->Range++",
  "this->Range = 0",
  "std::swap(this->WayPoint, this->goalPos)",
  "if (this->WaitingCycle == 5)"
]) {
  if (!source.includes(fragment)) {
    errors.push(`Stratagus patrol source missing expected fragment: ${fragment}`);
  }
}

for (const fragment of [
  "void CommandPatrolUnit(CUnit &unit, const Vec2i &pos, EFlushMode flush)",
  "auto *prevOrder = &unit.Orders.back()",
  "Vec2i prevGoalPos = (*prevOrder)->GetGoalPos()",
  "order = GetNextOrder(unit, flush)",
  "*order = COrder::NewActionPatrol(startPos, pos)"
]) {
  if (!commandSource.includes(fragment)) {
    errors.push(`Stratagus patrol command source missing expected fragment: ${fragment}`);
  }
}

for (const [label, text, fragments] of [
  ["world patrol order", worldSource, [
    "patrolRange: number",
    "patrolWaitingCycle: number",
    "kind: \"move\" | \"attack-move\" | \"attack-ground\" | \"patrol\""
  ]],
  ["orders patrol action", ordersSource, [
    "patrolRange: 0",
    "patrolWaitingCycle: 0",
    "function findPatrolPathWithinSourceRange",
    "function swapPatrolEndpoint",
    "unit.order.patrolRange += 1",
    "unit.order.patrolRange = 0",
    "unit.order.patrolWaitingCycle += 1",
    "unit.order.patrolWaitingCycle >= 5",
    "queue\n      ? issueGroupQueuePatrolOrder",
    "export function issueQueuePatrolOrder",
    "unit.moveQueue.push({ kind: \"patrol\"",
    "export function issueGroupQueuePatrolOrder",
    "if (target.kind === \"patrol\")",
    "anchorX: unit.x",
    "unit.order.kind === \"move\" || unit.order.kind === \"attack-move\" || unit.order.kind === \"patrol\""
  ]],
  ["save-game patrol order", saveSource, [
    "patrolRange: Math.max(0, Math.min(64, Math.floor(finiteNumberOr(record.patrolRange, 0))))",
    "patrolWaitingCycle: Math.max(0, Math.min(5, Math.floor(finiteNumberOr(record.patrolWaitingCycle, 0))))",
	    "|| record.kind === \"attack-ground\"",
	    "|| record.kind === \"patrol\"",
	    "|| record.kind === \"follow\"",
	    "canIssueQueuePatrolAt,",
	    "kind === \"patrol\" && !canIssueQueuePatrolAt(world, unit, x, y)"
  ]],
  ["package verify script", packageSource, [
    "\"verify:source-patrol-action\"",
    "npm run verify:source-patrol-action"
  ]]
]) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      errors.push(`${label} missing source patrol fragment: ${fragment}`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source patrol action verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source patrol action verified (range widening, wait-cycle swap, reset, and save/load state).");
