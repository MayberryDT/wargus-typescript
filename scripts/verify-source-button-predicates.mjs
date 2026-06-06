import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const humanButtons = readFileSync(path.join(manifest.dataRoot, "scripts/human/buttons.lua"), "utf8");
const orcButtons = readFileSync(path.join(manifest.dataRoot, "scripts/orc/buttons.lua"), "utf8");
const stratagusScriptUi = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus/src/ui/script_ui.cpp", "utf8");
const stratagusButtonChecks = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus/src/ui/button_checks.cpp", "utf8");
const stratagusBotPanel = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus/src/ui/botpanel.cpp", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const sourceUiHelperSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const mapCommandsSource = readFileSync("src/view/mapCommands.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const errors = [];
function expect(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

const networkWallButtons = manifest.buttons.filter((button) => button.action === "build" && button.allowed === "check-network" && button.value?.includes("wall"));
const debugWallButtons = manifest.buttons.filter((button) => button.action === "build" && button.allowed === "check-debug" && button.allowArg.includes("single-player-walls") && button.value?.includes("wall"));
const indexedAllowedPredicates = [...new Set(manifest.buttons.map((button) => button.allowed).filter(Boolean))].sort();
const expectedAllowedCounts = new Map([
  ["check-debug", 2],
  ["check-network", 2],
  ["check-no-research", 2],
  ["check-single-research", 48],
  ["check-true", 5],
  ["check-units-or", 2],
  ["check-upgrade", 36],
  ["check-upgrade-to", 4]
]);

expect(/Allowed\s*=\s*"check-network"/.test(humanButtons), "Human source buttons should contain check-network wall button.");
expect(/Allowed\s*=\s*"check-debug"\s*,\s*AllowArg\s*=\s*\{"single-player-walls"\}/.test(humanButtons), "Human source buttons should contain single-player-walls debug wall button.");
expect(/Allowed\s*=\s*"check-network"/.test(orcButtons), "Orc source buttons should contain check-network wall button.");
expect(/Allowed\s*=\s*"check-debug"\s*,\s*AllowArg\s*=\s*\{"single-player-walls"\}/.test(orcButtons), "Orc source buttons should contain single-player-walls debug wall button.");
expect(networkWallButtons.length === 2, `Expected 2 indexed network wall buttons, found ${networkWallButtons.length}.`);
expect(debugWallButtons.length === 2, `Expected 2 indexed debug wall buttons, found ${debugWallButtons.length}.`);
expect(indexedAllowedPredicates.join(",") === [...expectedAllowedCounts.keys()].sort().join(","), `Manifest indexed unexpected source Allowed predicates: ${indexedAllowedPredicates.join(", ")}.`);
for (const [allowed, count] of expectedAllowedCounts) {
  const actual = manifest.buttons.filter((button) => button.allowed === allowed).length;
  expect(actual === count, `Expected ${count} indexed ${allowed} buttons, found ${actual}.`);
  expect(humanButtons.includes(`Allowed = "${allowed}"`) || orcButtons.includes(`Allowed = "${allowed}"`), `Wargus source buttons should contain ${allowed}.`);
}
expect(manifest.engineSettings?.networkGameDefault === false, "Browser source engine default should be non-network.");
expect(Array.isArray(manifest.engineSettings?.debugFlagsDefault) && manifest.engineSettings.debugFlagsDefault.length === 0, "Browser source engine debug flags should default empty.");

for (const [source, fragment] of [
  [stratagusScriptUi, "ba.Allowed = ButtonCheckTrue"],
  [stratagusScriptUi, "ba.Allowed = ButtonCheckUpgrade"],
  [stratagusScriptUi, "ba.Allowed = ButtonCheckUnitsOr"],
  [stratagusScriptUi, "ba.Allowed = ButtonCheckNetwork"],
  [stratagusScriptUi, "ba.Allowed = ButtonCheckNoResearch"],
  [stratagusScriptUi, "ba.Allowed = ButtonCheckUpgradeTo"],
  [stratagusScriptUi, "ba.Allowed = ButtonCheckSingleResearch"],
  [stratagusScriptUi, "ba.Allowed = ButtonCheckDebug"],
  [stratagusButtonChecks, "bool ButtonCheckTrue"],
  [stratagusButtonChecks, "bool ButtonCheckUpgrade"],
  [stratagusButtonChecks, "bool ButtonCheckUnitsOr"],
  [stratagusButtonChecks, "bool ButtonCheckNetwork"],
  [stratagusButtonChecks, "bool ButtonCheckNoResearch"],
  [stratagusButtonChecks, "action != UnitAction::UpgradeTo && action != UnitAction::Research"],
  [stratagusButtonChecks, "bool ButtonCheckUpgradeTo"],
  [stratagusButtonChecks, "unit.CurrentAction() != UnitAction::Still"],
  [stratagusButtonChecks, "bool ButtonCheckSingleResearch"],
  [stratagusButtonChecks, "bool ButtonCheckDebug"],
  [stratagusBotPanel, "buttonaction.Allowed(unit, buttonaction)"],
  [stratagusBotPanel, "IsButtonAllowed(unit, buttonaction)"],
  [stratagusBotPanel, "buttonaction.AlwaysShow"]
]) {
  expect(source.includes(fragment), `Stratagus source missing button predicate fragment: ${fragment}`);
}

for (const [source, fragment] of [
  [typesSource, "networkGameDefault: boolean"],
  [typesSource, "debugFlagsDefault: string[]"],
  [worldSource, "networkGameDefault: false"],
  [worldSource, "debugFlagsDefault: []"],
  [indexSource, "networkGameDefault: false"],
  [indexSource, "debugFlagsDefault: uncommented.match(/IsDebugEnabled"],
  [indexSource, "allowed: readLuaStringField(body, \"Allowed\")"],
  [indexSource, "allowArg: readLuaStringArrayField(body, \"AllowArg\")"],
  [ordersSource, "export function sourceButtonAllowedForSimulation"],
  [ordersSource, "function sourceButtonAllowedForUnit"],
  [ordersSource, "button.allowed === \"check-network\""],
  [ordersSource, "world.engineSettings.networkGameDefault"],
  [ordersSource, "button.allowed === \"check-debug\""],
  [ordersSource, "world.engineSettings.debugFlagsDefault.includes(flag)"],
  [ordersSource, "button.allowed === \"check-true\""],
  [ordersSource, "button.allowed === \"check-single-research\""],
  [ordersSource, "button.allowed === \"check-no-research\""],
  [ordersSource, "!isBuildingResearching(world, unit.id) && !unitHasSourceUpgradeToQueued(world, unit)"],
  [ordersSource, "button.allowed === \"check-upgrade\""],
  [ordersSource, "button.allowed === \"check-upgrade-to\""],
  [ordersSource, "!isBuildingResearching(world, unit.id) && unit.productionQueue.length === 0"],
  [ordersSource, "button.allowed === \"check-units-or\""],
  [ordersSource, "function unitHasSourceUpgradeToQueued"],
  [ordersSource, "return unit.productionQueue.some((order) => isProducerTransformationFor(world, unit, order.unitTypeId));"],
  [ordersSource, "if (!sourceButtonAllowedForUnit(world, button, unit))"],
  [ordersSource, "function sourceValueButtonForUnit"],
  [ordersSource, "sourceButtonAllowedForUnit(world, button, unit)"],
  [hudSource, "toggle-single-player-walls"],
  [sourceUiHelperSource, "sourceDebugFlagEnabled(world, \"single-player-walls\")"],
  [sourceUiHelperSource, "export function sourceDebugFlagEnabled"],
  [mapCommandsSource, "toggleDebugFlag(context.world, \"single-player-walls\")"],
  [mapCommandsSource, "function toggleDebugFlag"],
  [saveSource, "debugFlagsDefault: world.engineSettings.debugFlagsDefault"],
  [saveSource, "world.engineSettings.debugFlagsDefault = sourceDebugFlagsOr"],
  [saveSource, "const SOURCE_DEBUG_FLAGS = new Set([\"single-player-walls\"])"],
  [saveSource, "function sourceDebugFlagsOr"],
  [JSON.stringify(packageJson.scripts), "verify:source-button-predicates"]
]) {
  expect(source.includes(fragment), `Missing source button predicate fragment: ${fragment}`);
}

if (errors.length > 0) {
  console.error(`Source button predicate verification errors: ${errors.length}`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Source button predicates verified (${indexedAllowedPredicates.length} Allowed predicates, ${networkWallButtons.length} network wall buttons, ${debugWallButtons.length} debug wall buttons).`);
