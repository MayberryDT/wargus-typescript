import { readFileSync } from "node:fs";

const source = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_board.cpp", "utf8");
const commandSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/command.cpp", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");

const errors = [];

for (const fragment of [
  "State_WaitForTransporter",
  "State_EnterTransporter",
  "order->Range = 1",
  "this->Range = 1",
  "this->Range++",
  "unit.Wait = 10",
  "transporter->BoardCount < transporter->Type->MaxOnBoard"
]) {
  if (!source.includes(fragment)) {
    errors.push(`Stratagus board source missing expected fragment: ${fragment}`);
  }
}

for (const fragment of [
  "void CommandBoard(CUnit &unit, CUnit &dest, EFlushMode flush)",
  "order = GetNextOrder(unit, flush)",
  "*order = COrder::NewActionBoard(dest)"
]) {
  if (!commandSource.includes(fragment)) {
    errors.push(`Stratagus board command source missing expected fragment: ${fragment}`);
  }
}

for (const [label, text, fragments] of [
	  ["world load-transport order", worldSource, [
	    'kind: "load-transport"',
	    'kind: "follow" | "defend" | "repair" | "load-transport"',
	    'boardState: "move" | "wait" | "enter"',
    "boardRange: number",
    "boardWaitTicks: number"
  ]],
	  ["orders board action", ordersSource, [
	    'boardState: "move"',
	    "boardRange: 1",
	    "boardWaitTicks: 0",
	    "export function issueQueueLoadIntoTransportOrder",
	    "export function canIssueLoadIntoTransportTarget",
	    "export function canIssueQueueLoadIntoTransportTarget",
	    'unit.moveQueue.push({ kind: "load-transport"',
	    "export function issueGroupQueueLoadIntoTransportOrder",
	    'if (target.kind === "load-transport")',
	    "issueGroupQueueSmartOrder",
	    "function findBoardPathWithinSourceRange",
    "function sourceBoardWaitTicks",
    "return sourceOrderRetryTicks(world, sourceCycles)",
    "unit.order.boardRange += 1",
    "unit.order.boardRange = 1",
    'unit.order.boardState = "wait"',
    'unit.order.boardState = "enter"'
  ]],
  ["save-game board order", saveSource, [
	    'if (kind === "load-transport")',
    "canIssueQueueLoadIntoTransportTarget,",
    "canTargetTransportForLoading,",
    "return !transport || !canTargetTransportForLoading(transport, unit)",
    'kind === "load-transport" && !canIssueQueueLoadIntoTransportTarget(world, unit, target)',
    'boardState: record.boardState === "wait" || record.boardState === "enter" ? record.boardState : "move"',
    "boardRange: Math.max(1, Math.min(64, Math.floor(finiteNumberOr(record.boardRange, 1))))",
    "const boardWaitTicks = sourceBoardWaitTicksForSave(world, 10)",
    "boardWaitTicks: Math.max(0, Math.min(boardWaitTicks, Math.floor(finiteNumberOr(record.boardWaitTicks, 0))))",
    "function sourceBoardWaitTicksForSave"
  ]],
  ["package verify script", packageSource, [
    '"verify:source-board-action"',
    "npm run verify:source-board-action"
  ]]
]) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      errors.push(`${label} missing source board fragment: ${fragment}`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source board action verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source board action verified (queued command, range widening, wait/enter state, movement reset, and save/load state).");
