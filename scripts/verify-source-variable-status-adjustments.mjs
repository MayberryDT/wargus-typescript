import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const sourceSpells = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/wargus/scripts/spells.lua", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const readme = readFileSync("README.md", "utf8");
const errors = [];

function error(message) {
  errors.push(message);
}

function spell(id) {
  return manifest.spells.find((candidate) => candidate.id === id);
}

const expectedAdjustments = new Map([
  ["spell-haste:Haste", 1000],
  ["spell-haste:Slow", 0],
  ["spell-slow:Slow", 1000],
  ["spell-slow:Haste", 0],
  ["spell-bloodlust:Bloodlust", 1000],
  ["spell-bloodlust-double-head:Bloodlust", 1000],
  ["spell-invisibility:Invisible", 2000]
]);

for (const [key, amount] of expectedAdjustments) {
  const [spellId, variable] = key.split(":");
  const actual = spell(spellId)?.variableAdjustments?.find((adjustment) => adjustment.variable === variable)?.amount;
  if (actual !== amount) {
    error(`Expected ${spellId} ${variable} adjustment ${amount}, found ${String(actual)}.`);
  }
}

const unholyArmorCallbackValues = spell("spell-unholy-armor")?.callbackUnitVariables
  ?.filter((variable) => variable.callback === "SpellUnholyArmor" && variable.variable === "UnholyArmor")
  .map((variable) => variable.value) ?? [];
if (!unholyArmorCallbackValues.includes(500) || !unholyArmorCallbackValues.includes(1)) {
  error(`Expected spell-unholy-armor callback UnholyArmor values 500 and 1, found ${JSON.stringify(unholyArmorCallbackValues)}.`);
}

const runtimeSnippets = [
  "function applySourceVariableStatusAdjustments",
  "function applyUnholyArmor",
  "applyDamage(world, target, Math.max(1, Math.floor(target.hitPoints / 2)))",
  "applyDamage(world, target, 99999)",
  "if (target.hitPoints > 0)",
  "function activeStatusEffect",
  "activeStatusEffect(unit, \"bloodlust\")",
  "activeStatusEffect(attacker, \"bloodlust\")",
  "return Boolean(activeStatusEffect(unit, kind))",
  "hasStatusEffect(target, \"unholy-armor\")",
  "spellCallbackVariableAdjustment(world, \"spell-unholy-armor\", \"UnholyArmor\", 500)",
  "sourceAdjustments.length > 0",
  "adjustment.amount <= 0",
  "removeStatusEffect(unit, kind)",
  "sourceStatusKindForVariable",
  "variable === \"Haste\"",
  "variable === \"Slow\"",
  "variable === \"Bloodlust\"",
  "variable === \"Invisible\"",
  "variable === \"UnholyArmor\"",
  "function sourceStatusRemainingCycles(world: WorldState, unit: WorldUnit, status: WorldUnit[\"statusEffects\"][number][\"kind\"]): number",
  "return Math.max(0, Math.round(statusEffectRemainingSeconds(unit, status) * sourceDefaultGameSpeed(world)))",
  "return sourceStatusRemainingCycles(world, unit, status)",
  "function sourceConditionFlagEnabled(unit: WorldUnit, variable: string): boolean",
  "return status ? statusEffectRemainingSeconds(unit, status) > 0 : sourceConditionFlagEnabled(unit, variable)",
  "applySourceVariableStatusAdjustments(world, target, \"spell-slow\"",
  "applySourceVariableStatusAdjustments(world, target, \"spell-haste\"",
  "applySourceVariableStatusAdjustments(world, target, spellId, { Bloodlust",
  "applySourceVariableStatusAdjustments(world, target, \"spell-invisibility\""
];

for (const snippet of [
  "DamageUnit(-1, target, math.max(1, math.floor(GetUnitVariable(target, \"HitPoints\", \"Value\") / 2)))",
  "SetUnitVariable(target, \"UnholyArmor\", 500, \"Max\")",
  "SetUnitVariable(target, \"UnholyArmor\", 500, \"Value\")",
  "SetUnitVariable(target, \"UnholyArmor\", 1, \"Enable\")"
]) {
  if (!sourceSpells.includes(snippet)) {
    error(`Source spells.lua is missing Unholy Armor fragment: ${snippet}`);
  }
}

for (const snippet of runtimeSnippets) {
  if (!ordersSource.includes(snippet)) {
    error(`Runtime is missing source variable status snippet: ${snippet}`);
  }
}

for (const snippet of [
  "function isHiddenUnit",
  "effect.kind === \"invisibility\" && effect.remainingSeconds > 0"
]) {
  if (!worldSource.includes(snippet)) {
    error(`World visibility is missing active source invisibility snippet: ${snippet}`);
  }
}

if (!readme.includes("Status spell application now consumes source `adjust-variable` payloads")) {
  error("README is missing the source variable status adjustment note.");
}

if (ordersSource.includes("statusEffectRemainingSeconds(unit, status) * world.tickRate")) {
  error("Source variable status remaining cycles should use sourceDefaultGameSpeed instead of raw browser tick-rate math.");
}
if (ordersSource.includes("sourceConditionVariableValue({ tickRate: 30 } as WorldState, unit, variable)")) {
  error("Source variable enable checks should use a world-free condition flag helper instead of synthetic WorldState casts.");
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Source variable status adjustment errors: ${errors.length}`);
  process.exit(1);
}

console.log("Source variable status adjustments verified (Haste, Slow, Bloodlust, double-head Bloodlust, Invisibility, and Unholy Armor damage).");
