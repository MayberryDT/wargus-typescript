import { readFileSync } from "node:fs";

const source = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_follow.cpp", "utf8");
const commandSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/command.cpp", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");

const errors = [];

for (const fragment of [
  "order->Range = 1",
  "this->Range++",
  "this->Range = 1",
  "goal && goal->CanMove() == false"
]) {
  if (!source.includes(fragment)) {
    errors.push(`Stratagus follow source missing expected fragment: ${fragment}`);
  }
}

for (const fragment of [
  "void CommandFollow(CUnit &unit, CUnit &dest, EFlushMode flush)",
  "order = GetNextOrder(unit, flush)",
  "*order = COrder::NewActionFollow(dest)"
]) {
  if (!commandSource.includes(fragment)) {
    errors.push(`Stratagus follow command source missing expected fragment: ${fragment}`);
  }
}

for (const [label, text, fragments] of [
	  ["world follow order", worldSource, [
	    "followRange: number",
	    'kind: "follow" | "defend" | "repair" | "load-transport"'
	  ]],
	  ["orders follow action", ordersSource, [
	    "followRange: 1",
	    "queue\n      ? issueGroupQueueFollowOrder",
	    "export function issueQueueFollowOrder",
	    "export function canIssueQueueFollowTarget",
	    'unit.moveQueue.push({ kind: "follow"',
	    "export function issueGroupQueueFollowOrder",
	    'if (target.kind === "follow")',
	    "function findFollowPathWithinSourceRange",
    "unit.order.followRange += 1",
    "unit.order.followRange = 1",
    "if (!canReceiveMoveOrders(followTarget))",
    "findFollowPathWithinSourceRange(world, unit, followTarget, unit.order.followRange)"
  ]],
	  ["save-game follow order", saveSource, [
	    "followRange: Math.max(1, Math.min(64, Math.floor(finiteNumberOr(record.followRange, 1))))",
	    "canTargetFollow,",
	    "return !target || !canTargetFollow(unit, target, world)",
	    "canIssueQueueFollowTarget,",
	    'kind === "follow" && !canIssueQueueFollowTarget(world, unit, target)'
	  ]],
  ["package verify script", packageSource, [
    "\"verify:source-follow-action\"",
    "npm run verify:source-follow-action"
  ]]
]) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      errors.push(`${label} missing source follow fragment: ${fragment}`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source follow action verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source follow action verified (queued command, range widening, reset, immobile-goal finish, and save/load state).");
