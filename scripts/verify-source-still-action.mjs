import { readFileSync } from "node:fs";

const source = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_still.cpp", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");

const errors = [];

for (const fragment of [
  "SUB_STILL_STANDBY",
  "SUB_STILL_ATTACK",
  "this->Sleep = CYCLES_PER_SECOND / 2",
  "AutoCast(unit) || (unit.IsAggressive() && AutoAttack(unit))",
  "|| AutoRepair(unit)",
  "|| MoveRandomly(unit)",
  "this->AutoAttackStand(unit)",
  "UnitShowAnimation(unit, &unit.Type->Animations->Still)"
]) {
  if (!source.includes(fragment)) {
    errors.push(`Stratagus still source missing expected fragment: ${fragment}`);
  }
}

for (const [label, text, fragments] of [
  ["world still state", worldSource, [
    "nextAutoActionTick: number",
    "nextAutoActionTick: 0",
    "nextRandomMoveTick: 0"
  ]],
  ["orders still action", ordersSource, [
    "unit.order === null && canRunSourceStillAutomaticActions(world, unit)",
    "stepAutoRepair(world, unit)",
    "stepPlayerAutoCast(world, unit)",
    "stepDefensiveAutoAttack(world, unit)",
    "stepRandomMovement(world, unit)",
    "unit.nextAutoActionTick = world.tick + sourceStillAutoActionSleepTicks(world)",
    "function canRunSourceStillAutomaticActions(world: WorldState, unit: WorldUnit): boolean",
    "unit.nextAutoActionTick = Math.max(0, Math.floor(unit.nextAutoActionTick ?? 0))",
    "function sourceStillAutoActionSleepTicks(world: WorldState): number",
    "return sourceOrderRetryTicks(world, 15)",
    "function sourceOrderRetryTicks(world: WorldState, sourceCycles: number): number",
    "return Math.max(1, Math.round(sourceCycles * (sourceDefaultGameSpeed(world) / 30)))",
    "world.tick % sourceOrderRetryTicks(world, 15)",
    "world.tick % sourceOrderRetryTicks(world, 20)",
    "world.tick % sourceOrderRetryTicks(world, 30)",
    "unit.nextAutoActionTick = Math.max(0, unit.nextAutoActionTick ?? 0)"
  ]],
  ["save still state", saveSource, [
    "unit.nextAutoActionTick = Math.max(0, Math.floor(finiteNumberOr(unit.nextAutoActionTick, 0)))",
    "unit.nextAutoActionTick = Math.max(0, unit.nextAutoActionTick ?? 0)"
  ]],
  ["package verify script", packageSource, [
    '"verify:source-still-action"',
    "npm run verify:source-still-action"
  ]]
]) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      errors.push(`${label} missing source still fragment: ${fragment}`);
    }
  }
}

if (/world\.tick % (15|20|30) === 0/.test(ordersSource)) {
  errors.push("Order retry cadence should scale source cycles through sourceOrderRetryTicks instead of hardcoded 15/20/30 modulo checks.");
}

if (ordersSource.includes("sourceCycles * (world.tickRate / 30)") || saveSource.includes("sourceCycles * (world.tickRate / 30)")) {
  errors.push("Order source-cycle scaling should use sourceDefaultGameSpeed instead of raw browser tick-rate math.");
}

if (ordersSource.includes("Math.floor(world.tickRate / 2)")) {
  errors.push("Still automatic-action sleep should use sourceOrderRetryTicks instead of raw half-second browser timing.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source still action verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source still action verified (standby/attack states, half-second automatic-action sleep, auto repair/cast/attack/random sequencing, and save/load state).");
