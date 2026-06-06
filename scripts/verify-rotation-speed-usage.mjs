import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");

const rotationUnits = (manifest.units ?? []).filter((unit) => (unit.rotationSpeed ?? 0) > 0);
const errors = [];

if (rotationUnits.length === 0) {
  errors.push("Wargus manifest has no units with RotationSpeed; verifier cannot prove rotation-speed coverage.");
}
if (!worldSource.includes("rotationSpeed: Math.max(0, unit.rotationSpeed ?? 0)")) {
  errors.push("World creation does not preserve source unit RotationSpeed.");
}
if (!ordersSource.includes("unit.rotationSpeed * tickSeconds")) {
  errors.push("Simulation facing updates do not use source unit RotationSpeed.");
}
if (!ordersSource.includes("updateUnitFacing(unit, dx, dy, tickSeconds)")) {
  errors.push("Movement does not pass tick timing into source rotation-speed facing updates.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Rotation-speed usage errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Rotation speed usage verified (${rotationUnits.length} source units checked).`);
