import { readFileSync } from "node:fs";

const stratagusMouse = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/ui/mouse.cpp", "utf8");
const stratagusUnit = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/include/unit.h", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const helpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const mapCommandsSource = readFileSync("src/view/mapCommands.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const errors = [];
function expect(condition, message) {
  if (!condition) errors.push(message);
}

for (const fragment of [
  "bool FormationMovement = true",
  "If true, player controlled units stay in formation"
]) {
  expect(stratagusUnit.includes(fragment), `Stratagus formation preference missing fragment: ${fragment}`);
}

for (const fragment of [
  "dest == nullptr && sz < 12 && Preference.FormationMovement",
  "const short magicBoxSize = 7",
  "if (max.x - min.x > magicBoxSize)",
  "if (!tooBig)",
  "targetPosForUnit = pos + (unitTilePos - center)",
  "DoRightButton_ForSelectedUnit(*unit, dest, targetPosForUnit, acknowledged)"
]) {
  expect(stratagusMouse.includes(fragment), `Stratagus formation movement source missing fragment: ${fragment}`);
}

for (const [name, source, fragments] of [
  ["types", typesSource, ["formationMovementDefault: boolean"]],
  ["world defaults", worldSource, ["formationMovementDefault: true"]],
  ["indexer", indexSource, [
    "formationMovementDefault: readPreferenceAssignmentBool(\"FormationMovement\", true)",
    "formationMovementDefault: true",
    "if (/Preference\\.FormationMovement\\s*=/.test(source)) engineSettings.formationMovementDefault = parsedEngineSettings.formationMovementDefault"
  ]],
  ["save schema", saveSource, [
    "| \"formationMovementDefault\"",
    "formationMovementDefault: world.engineSettings.formationMovementDefault",
    "world.engineSettings.formationMovementDefault = booleanOr(record.formationMovementDefault, world.engineSettings.formationMovementDefault)"
  ]],
  ["orders", ordersSource, [
    "function sourceFormationMovementApplies(world: WorldState, units: WorldUnit[]): boolean",
    "!world.engineSettings.formationMovementDefault || units.length >= 12",
    "const magicBoxSize = 7 * world.tileSize",
    "if (maxX - minX > magicBoxSize)",
    "if (maxY - minY > magicBoxSize)",
    "if (!sourceFormationMovementApplies(world, units))",
    "destinations.set(unit.id, destination)"
  ]],
  ["HUD command type", hudSource, ["\"toggle-formation-movement\""]],
  ["preferences menu", helpersSource, [
    "Formation move: ${world.engineSettings.formationMovementDefault ? \"enabled\" : \"disabled\"}",
    "{ label: \"Formation\", command: \"toggle-formation-movement\" }"
  ]],
  ["map commands", mapCommandsSource, [
    "command === \"toggle-formation-movement\"",
    "context.world.engineSettings.formationMovementDefault = !context.world.engineSettings.formationMovementDefault"
  ]]
]) {
  for (const fragment of fragments) {
    expect(source.includes(fragment), `${name} missing formation movement fragment: ${fragment}`);
  }
}

expect(JSON.stringify(packageJson.scripts).includes("verify:source-formation-movement"), "package.json verify scripts missing verify:source-formation-movement.");

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  console.error(`Source formation movement verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source formation movement verified (Preference.FormationMovement gates compact group formation destinations).");
