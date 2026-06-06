import { readFileSync } from "node:fs";

const source = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_defend.cpp", "utf8");
const commandSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/command.cpp", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const renderWorldSource = readFileSync("src/view/renderWorld.ts", "utf8");
const sourceUiSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");

const errors = [];

for (const fragment of [
  "void CommandDefend(CUnit &unit, CUnit &dest, EFlushMode flush)",
  "order = GetNextOrder(unit, flush)",
  "COrder::NewActionDefend",
  "order->Range = 1",
  "State_Defending",
  "AutoCast(unit) || AutoAttack(unit) || AutoRepair(unit)",
  "this->Range++",
  "this->State = State_Defending"
]) {
  if (!source.includes(fragment) && !commandSource.includes(fragment)) {
    errors.push(`Stratagus defend source missing expected fragment: ${fragment}`);
  }
}

for (const [label, text, fragments] of [
	  ["world defend order", worldSource, [
	    'kind: "defend"',
	    'kind: "follow" | "defend" | "repair" | "load-transport"',
	    'defendState: "moving" | "defending"',
    "defendRange: number"
  ]],
	  ["orders defend action", ordersSource, [
	    "export function issueDefendOrder",
	    "export function issueQueueDefendOrder",
	    "export function canIssueQueueDefendTarget",
	    'unit.moveQueue.push({ kind: "defend"',
	    "export function issueGroupQueueDefendTargetOrder",
	    'if (target.kind === "defend")',
	    "export function canIssueDefendTarget",
    "function stepDefendOrder",
    "stepPlayerAutoCast(world, unit)",
    "findNearestEnemyInAggroRange(world, unit)",
    "unit.order.defendRange += 1",
    'unit.order.defendState = "defending"',
    'unit.order.kind !== "defend"'
  ]],
  ["save-game defend order", saveSource, [
    "canIssueDefendTarget",
    "canIssueQueueDefendTarget,",
    'order.kind === "defend"',
	    "function hasInvalidLoadedDefendOrder",
	    'if (kind === "defend")',
	    'kind === "defend" && !canIssueQueueDefendTarget(world, unit, target)',
	    "defendRange: Math.max(1, Math.min(64, Math.floor(finiteNumberOr(record.defendRange, 1))))"
  ]],
  ["view defend order", renderWorldSource + sourceUiSource, [
    'unit.order?.kind === "defend"',
    "Defend ${orderTargetLabel"
  ]],
  ["package verify script", packageSource, [
    '"verify:source-defend-action"',
    "npm run verify:source-defend-action"
  ]]
]) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      errors.push(`${label} missing source defend fragment: ${fragment}`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source defend action verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source defend action verified (queued command, dedicated order, range widening, defending state, save/load, and view state).");
