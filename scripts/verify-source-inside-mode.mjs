import { readFileSync } from "node:fs";

const sourceRoot = "/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src";
const sourceSettingsHeader = readFileSync(`${sourceRoot}/include/settings.h`, "utf8");
const sourceFov = readFileSync(`${sourceRoot}/map/fov.cpp`, "utf8");
const sourceAttack = readFileSync(`${sourceRoot}/action/action_attack.cpp`, "utf8");
const sourceMove = readFileSync(`${sourceRoot}/action/action_move.cpp`, "utf8");
const sourceStill = readFileSync(`${sourceRoot}/action/action_still.cpp`, "utf8");

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const packageSource = readFileSync("package.json", "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const menuSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const mapCommandsSource = readFileSync("src/view/mapCommands.ts", "utf8");
const engineSettingsVerifierSource = readFileSync("scripts/verify-source-engine-settings.mjs", "utf8");
const saveSchemaVerifierSource = readFileSync("scripts/verify-save-schema.mjs", "utf8");
const menuVerifierSource = readFileSync("scripts/verify-source-menu-buttons.mjs", "utf8");

const errors = [];

function expect(source, fragment, message) {
  if (!source.includes(fragment)) {
    errors.push(message ?? `Missing fragment: ${fragment}`);
  }
}

for (const [name, source, fragments] of [
  ["settings.h", sourceSettingsHeader, [
    "unsigned Inside:1",
    "Inside = 0",
    "Inside = (bitfield >> 1) & 0x1"
  ]],
  ["fov.cpp", sourceFov, [
    "if (GameSettings.Inside)",
    "OpaqueFields &= ~(MapFieldRocks)"
  ]],
  ["action_attack.cpp", sourceAttack, [
    "if (GameSettings.Inside)",
    "CheckObstaclesBetweenTiles(input.GetUnitPos()",
    "MapFieldRocks | MapFieldForest"
  ]],
  ["action_move.cpp", sourceMove, [
    "if (GameSettings.Inside)",
    "CheckObstaclesBetweenTiles(input.GetUnitPos()"
  ]],
  ["action_still.cpp", sourceStill, [
    "GameSettings.Inside && CheckObstaclesBetweenTiles",
    "MapFieldRocks | MapFieldForest"
  ]]
]) {
  for (const fragment of fragments) {
    expect(source, fragment, `Stratagus ${name} missing Inside fragment: ${fragment}`);
  }
}

for (const [name, source, fragments] of [
  ["types", typesSource, ["insideDefault: boolean"]],
  ["world", worldSource, [
    "insideDefault: false",
    "world.engineSettings.insideDefault && type === \"rock\""
  ]],
  ["orders", readFileSync("src/simulation/orders.ts", "utf8"), [
    "function isSourceInsideAttackLineClear",
    "!world.engineSettings.insideDefault",
    "function isSourceInsideAttackObstacleTile",
    "flags.includes(\"rock\") || flags.includes(\"forest\")",
    "isSourceInsideAttackLineClear(world, unit, target)",
    "isSourceInsideAttackLineClear(world, unit, { x: targetX, y: targetY })",
    "isInAutoAcquireAttackRange(world, unit, candidate, radius)"
  ]],
  ["indexer", indexSource, [
    "insideDefault: readPreferenceBool(\"Inside\", false)",
    "insideDefault: false",
    "engineSettings.insideDefault ||= parsedEngineSettings.insideDefault"
  ]],
  ["save", saveSource, [
    "| \"insideDefault\"",
    "insideDefault: world.engineSettings.insideDefault",
    "world.engineSettings.insideDefault = booleanOr"
  ]],
  ["menu", menuSource, [
    "Inside mode:",
    "toggle-inside-mode"
  ]],
  ["map commands", mapCommandsSource, [
    "toggle-inside-mode",
    "insideDefault = !context.world.engineSettings.insideDefault"
  ]],
  ["engine settings verifier", engineSettingsVerifierSource, [
    "insideDefault: readPreferenceBool(\"Inside\", false)"
  ]],
  ["save schema verifier", saveSchemaVerifierSource, [
    "insideDefault: world.engineSettings.insideDefault"
  ]],
  ["menu verifier", menuVerifierSource, [
    "toggle-inside-mode",
    "insideDefault = !context.world.engineSettings.insideDefault"
  ]],
  ["package", packageSource, ["verify:source-inside-mode"]]
]) {
  for (const fragment of fragments) {
    expect(source, fragment, `${name} missing Inside browser fragment: ${fragment}`);
  }
}

if (manifest.engineSettings?.insideDefault !== false) {
  errors.push(`Expected Wargus Inside default to parse as false, got ${manifest.engineSettings?.insideDefault}`);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source Inside verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source Inside verified (synced setting and FOV rock opacity behavior).");
