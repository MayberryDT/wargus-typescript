import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const humanUnitsSource = readFileSync(path.join(manifest.dataRoot, "scripts/human/units.lua"), "utf8");
const orcUnitsSource = readFileSync(path.join(manifest.dataRoot, "scripts/orc/units.lua"), "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const renderWorldSource = readFileSync("src/view/renderWorld.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const errors = [];

function expect(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function unit(id) {
  return manifest.units?.find((candidate) => candidate.id === id);
}

for (const [sourceName, source, fragments] of [
  ["human units", humanUnitsSource, [
    "DrawLevel = 19",
    "Priority = 55",
    "Level = 2",
    "Priority = 35, AnnoyComputerFactor = 45",
    "Points = 1200",
    "DefineUnitType(\"unit-human-wall\"",
    "Construction = \"construction-wall\""
  ]],
  ["orc units", orcUnitsSource, [
    "DrawLevel = 20",
    "Priority = 55",
    "Level = 2",
    "Priority = 35, AnnoyComputerFactor = 45",
    "Points = 1200",
    "DefineUnitType(\"unit-orc-wall\"",
    "Construction = \"construction-wall\""
  ]]
]) {
  for (const fragment of fragments) {
    expect(source.includes(fragment), `${sourceName} source missing combat metadata fragment: ${fragment}`);
  }
}

for (const [id, expected] of [
  ["unit-peasant", { drawLevel: 19, priority: 50, points: 30, annoyComputerFactor: 0, level: 0 }],
  ["unit-archer", { drawLevel: 40, priority: 55, points: 60, annoyComputerFactor: 0, level: 0 }],
  ["unit-ranger", { drawLevel: 40, priority: 57, points: 70, annoyComputerFactor: 0, level: 2 }],
  ["unit-paladin", { drawLevel: 40, priority: 65, points: 110, annoyComputerFactor: 0, level: 2 }],
  ["unit-town-hall", { drawLevel: 20, priority: 35, points: 200, annoyComputerFactor: 45, level: 0 }],
  ["unit-battleship", { drawLevel: 40, priority: 63, points: 300, annoyComputerFactor: 25, level: 0 }],
  ["unit-daemon", { drawLevel: 60, priority: 63, points: 100, annoyComputerFactor: 0, level: 0 }],
  ["unit-gold-mine", { drawLevel: 40, priority: 0, points: 0, annoyComputerFactor: 0, level: 0 }],
  ["unit-human-wall", { drawLevel: 39, priority: 0, points: 1, annoyComputerFactor: 45, level: 0 }],
  ["unit-orc-wall", { drawLevel: 39, priority: 0, points: 1, annoyComputerFactor: 45, level: 0 }]
]) {
  const actual = unit(id);
  expect(Boolean(actual), `${id} missing from manifest.`);
  for (const [field, value] of Object.entries(expected)) {
    expect(actual?.[field] === value, `${id} should preserve source ${field}=${value}, found ${actual?.[field] ?? "missing"}.`);
  }
}

for (const [name, source, fragments] of [
  ["indexer", indexSource, [
    "const level = Number(body.match(/(?:^|[\\n,{]\\s*)Level\\s*=\\s*(-?\\d+)/m)?.[1] ?? 0)",
    "const drawLevel = Number(body.match(/DrawLevel\\s*=\\s*(-?\\d+)/)?.[1] ?? 0)",
    "const priority = Number(body.match(/Priority\\s*=\\s*(-?\\d+)/)?.[1] ?? 0)",
    "const points = Number(body.match(/(?:^|[\\n,{]\\s*)Points\\s*=\\s*(-?\\d+)/m)?.[1] ?? 0)",
    "const annoyComputerFactor = Number(body.match(/AnnoyComputerFactor\\s*=\\s*(-?\\d+)/)?.[1] ?? 0)",
    "drawLevel: next.drawLevel !== 0 ? next.drawLevel : existing.drawLevel",
    "priority: next.priority !== 0 ? next.priority : existing.priority",
    "points: next.points !== 0 ? next.points : existing.points",
    "annoyComputerFactor: next.annoyComputerFactor !== 0 ? next.annoyComputerFactor : existing.annoyComputerFactor"
  ]],
  ["types", typesSource, [
    "level?: number;",
    "drawLevel?: number;",
    "priority?: number;",
    "points?: number;",
    "annoyComputerFactor?: number;"
  ]],
  ["world", worldSource, [
    "level: number;",
    "drawLevel: number;",
    "priority: number;",
    "points: number;",
    "annoyComputerFactor: number;",
    '"level" | "builderOutside"',
    '"hitPoints" | "burnPercent" | "burnDamageRate" | "drawLevel" | "priority" | "points" | "annoyComputerFactor"',
    "drawLevel: Math.max(0, unit.drawLevel ?? 0)",
    "priority: Math.max(0, unit.priority ?? 0)",
    "points: Math.max(0, unit.points ?? 0)",
    "annoyComputerFactor: Math.max(0, unit.annoyComputerFactor ?? 0)",
    "level: Math.max(0, unit.level ?? 0)",
    "pointsKilled: 0",
    "pointsLost: 0"
  ]],
  ["orders", ordersSource, [
    "const computerAnnoyance = isComputerAttacker(attacker) ? target.annoyComputerFactor : 0",
    "const sourcePriorityCost = -target.priority - computerAnnoyance",
    "const hpPercent = target.maxHitPoints > 0 ? (100 * target.hitPoints) / target.maxHitPoints : 100",
    "const inRangeCost = isInAttackRange(attacker, target) ? -64 + distance / 32 : distance / 8",
    "const counterAttackCost = canAttackTarget(target, attacker) ? -32 : 0",
    "return sourcePriorityCost * 10 + hpPercent + inRangeCost + counterAttackCost + fallbackRoleCost",
    "return target.points",
    "return target.priority",
    'modifier.stat === "Level"',
    "unit.level = Math.max(0, unit.level + modifier.value)",
    "unit.drawLevel = Math.max(0, definition.drawLevel ?? 0)",
    "unit.priority = Math.max(0, definition.priority ?? 0)",
    "unit.points = Math.max(0, definition.points ?? 0)",
    "unit.annoyComputerFactor = Math.max(0, definition.annoyComputerFactor ?? 0)",
    "owner.stats.pointsLost += unit.points",
    "killer.stats.pointsKilled += unit.points",
    "function canAutoAcquireSourceTarget",
    "return !isSourceWallUnit(target) || sourceTileDistanceBetweenUnits(attacker, target) <= 1",
    "function isSourceWallUnit",
    "return isBuildingLike(unit)",
    "unit.constructionTypeId === \"construction-wall\"",
    "candidate) => canAttackTarget(unit, candidate, world) && isUnitVisibleToPlayer(world, candidate, unit.player) && canAutoAcquireSourceTarget(unit, candidate)",
    "&& canAutoAcquireSourceTarget(attacker, unit)"
  ]],
  ["renderer", renderWorldSource, [
    "function compareUnitDrawOrder",
    "return left.drawLevel - right.drawLevel",
    "const projectiles = [...world.projectiles].sort((a, b) => a.drawLevel - b.drawLevel)"
  ]],
  ["result helpers", sourceUiHelpersSource, [
    "stats.pointsKilled",
    "stats.pointsLost",
    "sourceResultScoreForPlayer"
  ]],
  ["save", saveSource, [
    "unit.level = Math.max(0, definition.level ?? 0)",
    "unit.drawLevel = Math.max(0, definition.drawLevel ?? 0)",
    "unit.priority = Math.max(0, definition.priority ?? 0)",
    "unit.points = Math.max(0, definition.points ?? 0)",
    "unit.annoyComputerFactor = Math.max(0, definition.annoyComputerFactor ?? 0)",
    "unit.drawLevel = Math.max(0, Math.floor(finiteNumberOr(unit.drawLevel, 0)))",
    "unit.priority = Math.max(0, Math.floor(finiteNumberOr(unit.priority, 0)))",
    "unit.points = Math.max(0, Math.floor(finiteNumberOr(unit.points, 0)))",
    "unit.annoyComputerFactor = Math.max(0, Math.floor(finiteNumberOr(unit.annoyComputerFactor, 0)))"
  ]]
]) {
  for (const fragment of fragments) {
    expect(source.includes(fragment), `${name} missing source combat metadata fragment: ${fragment}`);
  }
}

const sourceWallBody = ordersSource.match(/function isSourceWallUnit[\s\S]*?\n}\n/)?.[0] ?? "";
if (sourceWallBody.includes('unit.kind === "building"')) {
  errors.push("Wall auto-targeting should use source Building semantics instead of browser-local kind text.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source unit combat metadata verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source unit combat metadata verified (priority, points, annoyance, draw level, level, and wall auto-targeting).");
