import { readFileSync } from "node:fs";

const source = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_spellcast.cpp", "utf8");
const commandSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/command.cpp", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const spellVerifier = readFileSync("scripts/verify-spell-references.mjs", "utf8");
const packageSource = readFileSync("package.json", "utf8");

const errors = [];

for (const fragment of [
  "COrder::NewActionSpellCast",
  "order->Range = spell.Range",
  "order->SetSpell(spell)",
  "action-spell-cast",
  "\"range\"",
  "\"tile\"",
  "\"state\"",
  "\"spell\"",
  "input.SetMinRange(0)",
  "input.SetMaxRange(this->Range)",
  "UnHideUnit(unit)",
  "unit.ReCast = SpellCast(unit, *this->Spell, goal, goalPos)",
  "AnimateActionSpellCast",
  "animations->SpellCast",
  "animations->Attack",
  "CheckForDeadGoal",
  "this->Range = 0",
  "SpellMoveToTarget",
  "unit.MapDistanceTo(*goal) <= this->Range",
  "unit.MapDistanceTo(this->goalPos) <= this->Range",
  "err == PF_UNREACHABLE || !unit.CanMove()",
  "CanCastSpell(unit, spell, order.GetGoal(), order.goalPos)",
  "this->State = 1",
  "this->State = 2",
  "unit.ReCast"
]) {
  if (!source.includes(fragment)) {
    errors.push(`Stratagus spellcast source missing expected fragment: ${fragment}`);
  }
}

for (const fragment of [
  "void CommandSpellCast(CUnit &unit, const Vec2i &pos, CUnit *dest, const SpellType &spell, EFlushMode flush, bool isAutocast)",
  "auto *order = GetNextOrder(unit, flush)",
  "*order = COrder::NewActionSpellCast(spell, pos, dest, true)"
]) {
  if (!commandSource.includes(fragment)) {
    errors.push(`Stratagus spellcast command source missing expected fragment: ${fragment}`);
  }
}

for (const [label, text, fragments] of [
  ["world spell-cast order", worldSource, [
    'kind: "spell-cast"',
    "command: string",
    "spellId: string",
    "spellRange: number",
    'spellState: "move" | "cast"'
  ]],
  ["orders spellcast action", ordersSource, [
    "function issueTargetedSpellOrderInternal",
    "queueIfOutOfRange",
    "issueGroupQueueTargetedSpellOrder",
    "export function issueQueueTargetedSpellOrder",
    "export function canIssueQueueTargetedSpellAt",
    "caster.moveQueue.push({ kind: \"spell-cast\"",
    "if (target.kind === \"spell-cast\")",
    "function executeTargetedSpellNow",
    "function issueSpellCastMoveOrder",
    'kind: "spell-cast"',
    "spellRange: rangeTiles",
    'spellState: "move"',
    "function stepSpellCastOrder",
    "canCastTargetedSpellCommand(world, unit, command)",
    "isPointInSpellRange(world, unit, unit.order.targetX, unit.order.targetY, unit.order.spellRange)",
    'unit.order.spellState = "cast"',
    "issueTargetedSpellOrderInternal(world, unit.id, command, order.targetX, order.targetY, false)",
    'unit.order.spellState = "move"',
    "function findSpellCastPathWithinSourceRange",
    "stepMoveOrder(world, unit, tickSeconds)",
    "unit.order.kind !== \"spell-cast\""
  ]],
  ["save-game spellcast order", saveSource, [
    "canCastTargetedSpellCommand,",
    "isTargetedSpellCommand,",
    'kind === "spell-cast"',
    "|| record.kind === \"spell-cast\"",
    "canIssueQueueTargetedSpellAt(world, unit, command, x, y)",
    "function hasInvalidLoadedSpellCastOrder",
    "targetedSpellIdForCommand(world, order.command) !== order.spellId",
    "spellRange: Math.max(0, sourceSpellRangeTilesForSave(world, spellId, finiteNumberOr(record.spellRange, 0)))",
    "const spellRange = sourceSpellRangeTilesForSave(world, spellId, finiteNumberOr(record.spellRange, 0))",
    "spellRange: Math.max(0, spellRange)",
    "function sourceSpellRangeTilesForSave",
    'spellState: record.spellState === "cast" ? "cast" : "move"'
  ]],
  ["spell effect verifier", spellVerifier, [
    "sourceSpellCommandForSpellId",
    "canSelectedIssueTargetedSpellAt",
    "function castSourceAreaBombardmentAt",
    "function castSourcePolymorphAt",
    "function castSourceAreaAdjustVitalsAt",
    "function castSourceCaptureAt",
    "function castSourceSpawnMissileAt",
    "sourceSpellVisualRadius(world, spellId, 48)",
    "function areaBombardmentShardImpacts"
  ]],
  ["orders spell effect runtime", ordersSource, [
    "function sourceSpellAnimationDuration",
    "function sourceSpellCastSound",
    "sourceSpellMissileId(world, spellId)"
  ]],
  ["package verify script", packageSource, [
    "\"verify:source-spellcast-action\"",
    "npm run verify:source-spellcast-action"
  ]]
]) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      errors.push(`${label} missing source spellcast fragment: ${fragment}`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source spellcast action verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source spellcast action verified (range order, move-to-target state, cast state, animation fallback, save/load, and source spell effects coverage).");
