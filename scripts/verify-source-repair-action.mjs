import { readFileSync } from "node:fs";

const source = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_repair.cpp", "utf8");
const commandSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/command.cpp", "utf8");
const unitSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/unit/unit.cpp", "utf8");
const wargusData = readFileSync("public/wargus/manifest.json", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");

const errors = [];

for (const fragment of [
  "\\\"repaircycle\\\", %d",
  "\\\"state\\\", %d",
  "input.SetMaxRange(ReparableTarget != nullptr ? unit.Type->RepairRange : 0)",
  "goal.CurrentAction() == UnitAction::Built",
  "order.ProgressHp(goal, 100 * this->RepairCycle)",
  "ResourcesMultiBuildersMultiplier && SubRepairCosts(unit, player, goal)",
  "goal.Type->RepairHP",
  "AnimateActionRepair(unit)",
  "this->RepairCycle++",
  "dist > unit.Type->RepairRange"
]) {
  if (!source.includes(fragment)) {
    errors.push(`Stratagus repair source missing expected fragment: ${fragment}`);
  }
}

if (!unitSource.includes("int ResourcesMultiBuildersMultiplier = 0")) {
  errors.push("Stratagus source no longer defaults ResourcesMultiBuildersMultiplier to 0.");
}
if (wargusData.includes("ResourcesMultiBuildersMultiplier")) {
  errors.push("Wargus data now overrides ResourcesMultiBuildersMultiplier; browser construction repair costs need re-indexing.");
}

for (const fragment of [
  "void CommandRepair(CUnit &unit, const Vec2i &pos, CUnit *dest, EFlushMode flush)",
  "order = GetNextOrder(unit, flush)",
  "*order = COrder::NewActionRepair(unit, *dest)"
]) {
  if (!commandSource.includes(fragment)) {
    errors.push(`Stratagus repair command source missing expected fragment: ${fragment}`);
  }
}

for (const [label, text, fragments] of [
  ["world repair queue", worldSource, [
    'kind: "follow" | "defend" | "repair" | "load-transport"'
  ]],
  ["orders repair action", ordersSource, [
    'kind: "repair"',
    "repairCycle: 0",
    "queue\n      ? issueGroupQueueRepairOrder",
    "export function issueQueueRepairOrder",
    "export function canIssueRepairTarget",
    "export function canIssueQueueRepairTarget",
    'unit.moveQueue.push({ kind: "repair"',
    "export function issueGroupQueueRepairOrder",
    'if (target.kind === "repair")',
    "issueGroupQueueSmartOrder",
    "canRepairTarget(worker, target, world)",
    "unit.order.repairCycle = 0",
    "function stepRepairOrder",
    "if (!isInRepairRange(unit, target))",
    "updateUnitFacing(unit, target.x - unit.x, target.y - unit.y)",
    "unit.order.repairCycle += sourceElapsedCycles(world, tickSeconds)",
    "const repairCycleTicks = sourceRepairCycleTicks(world, unit)",
    "target.construction || target.hitPoints < target.maxHitPoints",
    "const repairCosts = target.construction ? sourceConstructionRepairCosts(target) : repairCostsForTarget(target)",
    "progressConstruction(world, target, sourceCyclesToSeconds(world, repairCycleTicks), unit)",
    "target.hitPoints = Math.min(target.maxHitPoints, target.hitPoints + repairHp)",
    "function sourceElapsedCycles(world: WorldState, tickSeconds: number): number",
    "return Math.max(0, tickSeconds * sourceDefaultGameSpeed(world))",
    "function sourceRepairCycleTicks(world: WorldState, unit: WorldUnit): number",
    "animation?.actions.Repair ?? []",
    "return Math.max(1, ticks || sourceOrderRetryTicks(world, 30))",
    "function sourceConstructionRepairCosts(target: WorldUnit): string[]",
    "const SOURCE_RESOURCES_MULTI_BUILDERS_MULTIPLIER = 0"
  ]],
  ["save-game repair queue", saveSource, [
    '|| record.kind === "repair"',
    'kind === "follow" || kind === "defend" || kind === "repair" || kind === "load-transport"',
    "const repairCycleTicks = sourceRepairCycleTicksForSave(world, unit)",
    "Math.max(0, Math.min(repairCycleTicks, finiteNumberOr(record.repairCycle, finiteNumberOr(record.repairBank, 0))))",
    "function sourceRepairCycleTicksForSave",
    "return Math.max(1, ticks || sourceOrderRetryTicksForSave(world, 30))",
    "canIssueRepairTarget(world, unit, target)",
    "return !target || !canIssueRepairTarget(world, unit, target)",
    "canIssueQueueRepairTarget,",
    'kind === "repair" && !canIssueQueueRepairTarget(world, unit, target)'
  ]],
  ["package verify script", packageSource, [
    '"verify:source-repair-action"',
    "npm run verify:source-repair-action"
  ]]
]) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      errors.push(`${label} missing source repair fragment: ${fragment}`);
    }
  }
}

if (ordersSource.includes("unit.order.repairCycle += Math.max(0, tickSeconds * world.tickRate)")) {
  errors.push("Repair cycle accumulation should use sourceElapsedCycles instead of inline browser tick-rate math.");
}
if (ordersSource.includes("tickSeconds * world.tickRate")) {
  errors.push("Repair cycle source elapsed conversion should use sourceDefaultGameSpeed instead of raw browser tick-rate math.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source repair action verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source repair action verified (queued command, repaircycle/state source, repair range, animation cadence, construction progress, and construction repair cost multiplier).");
