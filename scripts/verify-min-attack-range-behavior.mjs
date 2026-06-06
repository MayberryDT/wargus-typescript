import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const errors = [];

function error(message) {
  errors.push(message);
}

const minRangeUnits = (manifest.units ?? []).filter((unit) => Number(unit.minAttackRange ?? 0) > 0);
if (minRangeUnits.length < 6) {
  error(`Expected at least 6 source MinAttackRange units, found ${minRangeUnits.length}.`);
}

const minRangeIds = new Set(minRangeUnits.map((unit) => unit.id));
for (const required of ["unit-ballista", "unit-catapult", "unit-ballista-super", "unit-catapult-super", "unit-human-cannon-tower", "unit-orc-cannon-tower"]) {
  if (!minRangeIds.has(required)) {
    error(`Expected source MinAttackRange unit ${required}.`);
  }
}

for (const [name, source, fragments] of [
  ["world creation", worldSource, [
    "minAttackRange: Math.max(unit.minAttackRange ?? 0, 0) * 32",
    '"minAttackRange" | "maxAttackRange"'
  ]],
  ["runtime", ordersSource, [
    "function isInAttackRange",
    "function isInAutoAcquireAttackRange",
    "function minimumAttackDistanceForTarget",
    "function minimumAttackDistanceForPoint",
    "minimumAttackDistanceForTarget(unit, target)",
    "minimumAttackDistanceForPoint(unit)",
    "isInAutoAcquireAttackRange(world, unit, candidate, radius)",
    "unit.minAttackRange - target.radius",
    "unit.minAttackRange - 12"
  ]]
]) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      error(`${name} is missing MinAttackRange fragment: ${fragment}`);
    }
  }
}

const unitMinRangeBody = ordersSource.match(/function isTargetInsideMinimumAttackRange[\s\S]*?\n}/)?.[0] ?? "";
if (!unitMinRangeBody.includes("const minimumDistance = minimumAttackDistanceForTarget(unit, target)") || !unitMinRangeBody.includes("Math.hypot(target.x - unit.x, target.y - unit.y) < minimumDistance")) {
  error("Unit-target minimum attack range should route through minimumAttackDistanceForTarget once per check.");
}

const groundMinRangeBody = ordersSource.match(/function isGroundTargetInsideMinimumAttackRange[\s\S]*?\n}/)?.[0] ?? "";
if (!groundMinRangeBody.includes("const minimumDistance = minimumAttackDistanceForPoint(unit)") || !groundMinRangeBody.includes("Math.hypot(targetX - unit.x, targetY - unit.y) < minimumDistance")) {
  error("Ground-target minimum attack range should route through minimumAttackDistanceForPoint.");
}

const groundRangeBody = ordersSource.match(/function isGroundTargetInRange[\s\S]*?\n}/)?.[0] ?? "";
if (!groundRangeBody.includes("distance >= minimumAttackDistanceForPoint(unit)")) {
  error("Ground attack range should use the shared point-target minimum distance helper.");
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`MinAttackRange behavior errors: ${errors.length}`);
  process.exit(1);
}

console.log(`MinAttackRange behavior verified (${minRangeUnits.length} source minimum-range units checked).`);
