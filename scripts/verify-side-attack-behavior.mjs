import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const errors = [];

function error(message) {
  errors.push(message);
}

const sideAttackUnits = (manifest.units ?? []).filter((unit) => unit.sideAttack === true);
if (sideAttackUnits.length < 4) {
  error(`Expected at least 4 source SideAttack units, found ${sideAttackUnits.length}.`);
}

const sideAttackIds = new Set(sideAttackUnits.map((unit) => unit.id));
for (const required of ["unit-human-destroyer", "unit-orc-destroyer", "unit-battleship", "unit-ogre-juggernaught"]) {
  if (!sideAttackIds.has(required)) {
    error(`Expected source SideAttack unit ${required}.`);
  }
}

for (const [name, source, fragments] of [
  ["world creation", worldSource, [
    "sideAttack: unit.sideAttack ?? false",
    '"sideAttack" | "rotationSpeed"'
  ]],
  ["runtime", ordersSource, [
    "function canLaunchAttackNow",
    "function turnSideAttackTowardTarget",
    "function isTargetInSideAttackArc",
    "attacker.sideAttack",
    "return dot <= Math.SQRT1_2",
    "turnSideAttackTowardTarget(unit, target, tickSeconds)",
    "function sourceSideAttackFacingSeconds(world: WorldState): number",
    "turnSideAttackTowardTarget(unit, target, sourceSideAttackFacingSeconds(world))",
    "projectileLaunchPoint(attacker, target.x, target.y)"
  ]],
  ["save/load", saveSource, [
    "unit.sideAttack = definition.sideAttack ?? false",
    "unit.sideAttack = Boolean(unit.sideAttack)"
  ]]
]) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      error(`${name} is missing SideAttack fragment: ${fragment}`);
    }
  }
}

if (ordersSource.includes("turnSideAttackTowardTarget(unit, target, world.tickRate > 0 ? 1 / world.tickRate : undefined)")) {
  error("SideAttack hold/auto-attack rotation should use sourceCyclesToSeconds(world, 1) instead of raw browser tick-rate timing.");
}
if (ordersSource.includes("turnSideAttackTowardTarget(unit, target, world.tickRate > 0 ? sourceCyclesToSeconds(world, 1) : undefined)")) {
  error("SideAttack hold/auto-attack rotation should use sourceSideAttackFacingSeconds instead of browser tick-rate guards.");
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`SideAttack behavior errors: ${errors.length}`);
  process.exit(1);
}

console.log(`SideAttack behavior verified (${sideAttackUnits.length} source side-attack units checked).`);
