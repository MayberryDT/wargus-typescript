import { readFileSync } from "node:fs";

const sourceRoot = "/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src";
const sourceUnitHeader = readFileSync(`${sourceRoot}/include/unit.h`, "utf8");
const sourceInterfaceHeader = readFileSync(`${sourceRoot}/include/interface.h`, "utf8");
const sourceIcons = readFileSync(`${sourceRoot}/ui/icons.cpp`, "utf8");
const sourceBotPanel = readFileSync(`${sourceRoot}/ui/botpanel.cpp`, "utf8");
const sourceScriptUi = readFileSync(`${sourceRoot}/ui/script_ui.cpp`, "utf8");
const sourceMouse = readFileSync(`${sourceRoot}/ui/mouse.cpp`, "utf8");

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const packageSource = readFileSync("package.json", "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const sourceUiHelperSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const mapCommandsSource = readFileSync("src/view/mapCommands.ts", "utf8");
const iconReferenceSource = readFileSync("scripts/verify-icon-references.mjs", "utf8");
const engineSettingsVerifierSource = readFileSync("scripts/verify-source-engine-settings.mjs", "utf8");
const saveSchemaVerifierSource = readFileSync("scripts/verify-save-schema.mjs", "utf8");

const errors = [];

for (const [sourceName, sourceText, fragment] of [
  ["unit.h", sourceUnitHeader, "bool GrayscaleIcons = false"],
  ["interface.h", sourceInterfaceHeader, "bool AlwaysShow = false"],
  ["icons.cpp", sourceIcons, "if (Preference.GrayscaleIcons)"],
  ["icons.cpp", sourceIcons, "GScale = G->Clone(true)"],
  ["icons.cpp", sourceIcons, "void CIcon::DrawGrayscaleIcon"],
  ["botpanel.cpp", sourceBotPanel, "buttonaction.AlwaysShow"],
  ["botpanel.cpp", sourceBotPanel, "DrawGrayscaleIcon(pos)"],
  ["script_ui.cpp", sourceScriptUi, "value == \"AlwaysShow\""],
  ["script_ui.cpp", sourceScriptUi, "ba.AlwaysShow = LuaToBoolean"],
  ["mouse.cpp", sourceMouse, "DrawGrayscaleIcon(pos)"]
]) {
  if (!sourceText.includes(fragment)) {
    errors.push(`Stratagus ${sourceName} missing expected grayscale/AlwaysShow fragment: ${fragment}`);
  }
}

for (const [sourceName, sourceText, fragment] of [
  ["types", typesSource, "alwaysShow: boolean"],
  ["types", typesSource, "grayscaleIconsDefault: boolean"],
  ["world", worldSource, "grayscaleIconsDefault: false"],
  ["indexer", indexSource, "alwaysShow: readLuaBoolField(body, \"AlwaysShow\", false)"],
  ["indexer", indexSource, "grayscaleIconsDefault: readPreferenceBool(\"GrayscaleIcons\", false)"],
  ["indexer", indexSource, "grayscaleIconsDefault: false"],
  ["save", saveSource, "| \"grayscaleIconsDefault\""],
  ["save", saveSource, "grayscaleIconsDefault: world.engineSettings.grayscaleIconsDefault"],
  ["save", saveSource, "world.engineSettings.grayscaleIconsDefault = booleanOr"],
  ["orders", ordersSource, "button.alwaysShow || readyUnits.some((unit) => canIssueSourceActionButton"],
  ["orders", ordersSource, "button.alwaysShow || selectedUnits.some((unit) => canTrainUnitAt"],
  ["orders", ordersSource, "button.alwaysShow || selectedUnits.some((unit) => canResearchUpgradeAt"],
  ["orders", ordersSource, "button.alwaysShow || selectedUnits.some((unit) => canStartBuildingPlacementByType"],
  ["orders", ordersSource, "button.alwaysShow || !executableAction"],
  ["orders", ordersSource, "export function sourceButtonHasExecutableContext"],
  ["hud", hudSource, "disabled?: boolean"],
  ["hud", hudSource, "function sourceCommandDisabled"],
  ["hud", hudSource, "button?.alwaysShow"],
  ["hud", hudSource, "world.engineSettings.grayscaleIconsDefault && command.disabled"],
  ["hud", hudSource, "icon.tint = 0x9a9a9a"],
  ["hud", hudSource, "if (!command.disabled)"],
  ["hud", hudSource, "disabled: sourceCommandDisabled"],
  ["hud", hudSource, "disabled: !instantAvailable"],
  ["hud", hudSource, "disabled: !targetedAvailable"],
  ["sourceUiHelpers", sourceUiHelperSource, "Grayscale icons:"],
  ["sourceUiHelpers", sourceUiHelperSource, "toggle-grayscale-icons"],
  ["mapCommands", mapCommandsSource, "toggle-grayscale-icons"],
  ["mapCommands", mapCommandsSource, "grayscaleIconsDefault = !context.world.engineSettings.grayscaleIconsDefault"],
  ["icon verifier", iconReferenceSource, "toggle-grayscale-icons"],
  ["engine settings verifier", engineSettingsVerifierSource, "grayscaleIconsDefault: readPreferenceBool(\"GrayscaleIcons\", false)"],
  ["save schema verifier", saveSchemaVerifierSource, "grayscaleIconsDefault: world.engineSettings.grayscaleIconsDefault"],
  ["package", packageSource, "verify:source-grayscale-icons"]
]) {
  if (!sourceText.includes(fragment)) {
    errors.push(`${sourceName} missing expected grayscale/AlwaysShow fragment: ${fragment}`);
  }
}

const buttonsMissingAlwaysShow = (manifest.buttons ?? []).filter((button) => typeof button.alwaysShow !== "boolean");
if (buttonsMissingAlwaysShow.length > 0) {
  errors.push(`Indexed Wargus manifest has ${buttonsMissingAlwaysShow.length} buttons without boolean alwaysShow fields.`);
}

if (manifest.engineSettings?.grayscaleIconsDefault !== false) {
  errors.push(`Expected Wargus GrayscaleIcons default to parse as false, got ${manifest.engineSettings?.grayscaleIconsDefault}`);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source grayscale icon parity errors: ${errors.length}`);
  process.exit(1);
}

const alwaysShowButtons = (manifest.buttons ?? []).filter((button) => button.alwaysShow === true).length;
console.log(`Source grayscale icons verified (${alwaysShowButtons} AlwaysShow buttons enabled, ${manifest.buttons?.length ?? 0} buttons carrying the field).`);
