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
    "const magicBoxSize = 7",
    "if (maxX - minX > magicBoxSize)",
    "if (maxY - minY > magicBoxSize)",
    "function sourceRightClickDestinations",
    "const sourceTiles = units.map",
    "Math.floor(sourceTiles.reduce",
    "clickedTile.x + sourceTile.x - center.x",
    "clickedTile.y + sourceTile.y - center.y",
    "Math.min(world.map.width - 1",
    "Math.min(world.map.height - 1",
    "sourceTileToPlannerPoint(world, unit, assignedTile)",
    "issueSourceRightButtonOrder",
    "issueGroupSmartOrderWithDestinations",
    "issueGroupAttackMoveOrderWithDestinations",
    "const planned = planMoveOrder(world, unit, destination.x, destination.y)",
    "commitMoveOrder(unit, planned, true)"
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

for (const forbidden of [
  "0.92",
  "const spacing = world.tileSize * 1.35",
  "groupUnitsByMovementKind",
  "movementGroupDestinations",
  "movementSortRank",
  "destinationReservations"
]) {
  expect(!ordersSource.includes(forbidden), `orders should not retain invented formation fragment: ${forbidden}`);
}

const explicitMoveStart = ordersSource.indexOf("export function issueGroupMoveOrder");
const explicitQueueMoveStart = ordersSource.indexOf("export function issueGroupQueueMoveOrder");
const smartOrRallyStart = ordersSource.indexOf("export function issueGroupSmartOrRallyOrder");
expect(explicitMoveStart >= 0 && explicitQueueMoveStart > explicitMoveStart, "orders missing explicit group Move functions.");
expect(
  explicitMoveStart >= 0
    && explicitQueueMoveStart > explicitMoveStart
    && !ordersSource.slice(explicitMoveStart, explicitQueueMoveStart).includes("sourceRightClickDestinations"),
  "explicit command-card Move must not use right-click formation destinations."
);
expect(
  explicitQueueMoveStart >= 0
    && smartOrRallyStart > explicitQueueMoveStart
    && !ordersSource.slice(explicitQueueMoveStart, smartOrRallyStart).includes("sourceRightClickDestinations"),
  "queued command-card Move must not use right-click formation destinations."
);

expect(JSON.stringify(packageJson.scripts).includes("verify:source-formation-movement"), "package.json verify scripts missing verify:source-formation-movement.");

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  console.error(`Source formation movement verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source formation movement verified (compact empty-ground right-click preserves integer source-tile offsets; explicit Move keeps one target).");
