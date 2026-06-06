import { readFileSync } from "node:fs";

const stratagusBotPanel = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/ui/botpanel.cpp", "utf8");
const stratagusMouse = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/ui/mouse.cpp", "utf8");
const stratagusUnit = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/include/unit.h", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const helpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const mapCommandsSource = readFileSync("src/view/mapCommands.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const errors = [];
function expect(condition, message) {
  if (!condition) errors.push(message);
}

for (const fragment of [
  "bool NoStatusLineTooltips = false",
  "Don't show messages on status line"
]) {
  expect(stratagusUnit.includes(fragment), `Stratagus preference default missing fragment: ${fragment}`);
}

for (const [name, source] of [["bottom panel", stratagusBotPanel], ["pie menu", stratagusMouse]]) {
  for (const fragment of [
    "if (!Preference.NoStatusLineTooltips)",
    "UpdateStatusLineForButton(buttons[i])",
    "DrawPopup(buttons[i]"
  ]) {
    expect(source.includes(fragment), `Stratagus ${name} status tooltip source missing fragment: ${fragment}`);
  }
}

for (const [name, source, fragments] of [
  ["types", typesSource, ["noStatusLineTooltipsDefault: boolean"]],
  ["world defaults", worldSource, ["noStatusLineTooltipsDefault: false"]],
  ["indexer", indexSource, [
    "noStatusLineTooltipsDefault: readPreferenceAssignmentBool(\"NoStatusLineTooltips\", false)",
    "if (/Preference\\.NoStatusLineTooltips\\s*=/.test(source)) engineSettings.noStatusLineTooltipsDefault = parsedEngineSettings.noStatusLineTooltipsDefault"
  ]],
  ["save schema", saveSource, [
    "| \"noStatusLineTooltipsDefault\"",
    "noStatusLineTooltipsDefault: world.engineSettings.noStatusLineTooltipsDefault",
    "world.engineSettings.noStatusLineTooltipsDefault = booleanOr(record.noStatusLineTooltipsDefault, world.engineSettings.noStatusLineTooltipsDefault)"
  ]],
  ["HUD render", hudSource, [
    "!world.engineSettings.noStatusLineTooltipsDefault",
    "drawSourceCommandStatusLine(layer, graphics, app, sideWidth, manifest, world, hoveredCommand, bitmapFonts)",
    "function drawSourceCommandStatusLine",
    "sourceCommandStatusLineText(manifest, command)",
    "sourceStatusLineLayout(app.screen, sideWidth, world.engineSettings.statusLine)",
    "if (showButtonPopups)",
    "drawSourceCommandPopup(layer, graphics"
  ]],
  ["preferences menu", helpersSource, [
    "export function sourceCommandStatusLineText(manifest: WargusManifest, command: SourcePopupCommand): string",
    "sourceHintText(button?.hint ?? command.label)",
    "function sourceStatusLineCostText",
    "function sourceCostListText",
    "function sourceStructuredCostText",
    "Status hints: ${world.engineSettings.noStatusLineTooltipsDefault ? \"hidden\" : \"shown\"}",
    "{ label: \"Status Hints\", command: \"toggle-status-line-tooltips\" }"
  ]],
  ["map commands", mapCommandsSource, [
    "command === \"toggle-status-line-tooltips\"",
    "context.world.engineSettings.noStatusLineTooltipsDefault = !context.world.engineSettings.noStatusLineTooltipsDefault"
  ]]
]) {
  for (const fragment of fragments) {
    expect(source.includes(fragment), `${name} missing status-line tooltip fragment: ${fragment}`);
  }
}

expect(JSON.stringify(packageJson.scripts).includes("verify:source-status-line-tooltips"), "package.json verify scripts missing verify:source-status-line-tooltips.");
expect(!hudSource.includes("function sourceStatusLineCostText"), "HUD should delegate source status-line cost text to sourceUiHelpers.");
expect(!hudSource.includes("function sourceCostListText"), "HUD should not own source status-line cost-list formatting.");

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  console.error(`Source status-line tooltip verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source status-line tooltips verified (NoStatusLineTooltips gates status hints without suppressing command popups).");
