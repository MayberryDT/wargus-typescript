import { readFileSync } from "node:fs";

const sourceRoot = "/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src";
const sourceUnitHeader = readFileSync(`${sourceRoot}/include/unit.h`, "utf8");
const sourceSettingsHeader = readFileSync(`${sourceRoot}/include/settings.h`, "utf8");
const sourceResourceAction = readFileSync(`${sourceRoot}/action/action_resource.cpp`, "utf8");
const sourceUnitFind = readFileSync(`${sourceRoot}/unit/unit_find.cpp`, "utf8");

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const packageSource = readFileSync("package.json", "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
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
  ["unit.h", sourceUnitHeader, [
    "s.AllyDepositsAllowed = AllyDepositsAllowed",
    "bool AllyDepositsAllowed = false",
    "GameSettings.AllyDepositsAllowed = v"
  ]],
  ["settings.h", sourceSettingsHeader, [
    "unsigned AllyDepositsAllowed:1",
    "AllyDepositsAllowed = 0"
  ]],
  ["action_resource.cpp", sourceResourceAction, [
    "!GameSettings.AllyDepositsAllowed && depot->Player != harvester.Player"
  ]],
  ["unit_find.cpp", sourceUnitFind, [
    "if (GameSettings.AllyDepositsAllowed)",
    "Players[i].IsAllied(*unit.Player) && unit.Player->IsAllied(Players[i])",
    "table.insert("
  ]]
]) {
  for (const fragment of fragments) {
    expect(source, fragment, `Stratagus ${name} missing AllyDepositsAllowed fragment: ${fragment}`);
  }
}

for (const [name, source, fragments] of [
  ["types", typesSource, ["allyDepositsAllowedDefault: boolean"]],
  ["world", worldSource, ["allyDepositsAllowedDefault: false"]],
  ["indexer", indexSource, [
    "allyDepositsAllowedDefault: readPreferenceBool(\"AllyDepositsAllowed\", false)",
    "allyDepositsAllowedDefault: false",
    "engineSettings.allyDepositsAllowedDefault ||= parsedEngineSettings.allyDepositsAllowedDefault"
  ]],
  ["save", saveSource, [
    "| \"allyDepositsAllowedDefault\"",
    "allyDepositsAllowedDefault: world.engineSettings.allyDepositsAllowedDefault",
    "world.engineSettings.allyDepositsAllowedDefault = booleanOr"
  ]],
  ["orders", ordersSource, [
    "function canUseResourceDeposit(world: WorldState, unit: WorldUnit, dropoff: WorldUnit): boolean",
    "dropoff.player === unit.player",
    "world.engineSettings.allyDepositsAllowedDefault",
    "arePlayersMutuallyAllied(world, unit.player, dropoff.player)",
    "function arePlayersMutuallyAllied",
    "canUseResourceDeposit(world, unit, candidate) && candidate.hitPoints > 0 && !candidate.construction",
    "canDropOffResourceAt(world, unit, dropoff, unit.carriedResource)"
  ]],
  ["menu", menuSource, [
    "Ally depots:",
    "toggle-ally-deposits"
  ]],
  ["map commands", mapCommandsSource, [
    "toggle-ally-deposits",
    "allyDepositsAllowedDefault = !context.world.engineSettings.allyDepositsAllowedDefault"
  ]],
  ["engine settings verifier", engineSettingsVerifierSource, [
    "allyDepositsAllowedDefault: readPreferenceBool(\"AllyDepositsAllowed\", false)"
  ]],
  ["save schema verifier", saveSchemaVerifierSource, [
    "allyDepositsAllowedDefault: world.engineSettings.allyDepositsAllowedDefault"
  ]],
  ["menu verifier", menuVerifierSource, [
    "toggle-ally-deposits",
    "allyDepositsAllowedDefault = !context.world.engineSettings.allyDepositsAllowedDefault"
  ]],
  ["package", packageSource, ["verify:source-ally-deposits"]]
]) {
  for (const fragment of fragments) {
    expect(source, fragment, `${name} missing AllyDepositsAllowed browser fragment: ${fragment}`);
  }
}

if (manifest.engineSettings?.allyDepositsAllowedDefault !== false) {
  errors.push(`Expected Wargus AllyDepositsAllowed default to parse as false, got ${manifest.engineSettings?.allyDepositsAllowedDefault}`);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source ally deposit verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source AllyDepositsAllowed verified (mutual allied depots gated by source preference).");
