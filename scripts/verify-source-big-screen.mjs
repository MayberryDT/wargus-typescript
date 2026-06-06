import { readFileSync } from "node:fs";

const stratagusMainloop = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/stratagus/mainloop.cpp", "utf8");
const stratagusInterface = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/ui/interface.cpp", "utf8");
const stratagusMouse = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/ui/mouse.cpp", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const cameraSource = readFileSync("src/view/camera.ts", "utf8");
const helpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const inputSource = readFileSync("src/view/sourceInput.ts", "utf8");
const mapCommandsSource = readFileSync("src/view/mapCommands.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const errors = [];
function expect(condition, message) {
  if (!condition) errors.push(message);
}

for (const fragment of [
  "Preference.BigScreen && !BigMapMode",
  "!Preference.BigScreen && BigMapMode",
  "if (!BigMapMode)",
  "DrawMenuButtonArea()",
  "UI.Minimap.Draw()",
  "UI.InfoPanel.Draw()",
  "UI.ButtonPanel.Draw()"
]) {
  expect(stratagusMainloop.includes(fragment), `Stratagus main loop missing BigMapMode fragment: ${fragment}`);
}

for (const fragment of [
  "void UiToggleBigMap()",
  "UI.MapArea.X = 0",
  "UI.MapArea.Y = 0",
  "UI.MapArea.EndX = Video.Width - 1",
  "UI.MapArea.EndY = Video.Height - 1",
  "Big map enabled",
  "UI.MapArea.X = mapx",
  "UI.MapArea.EndY = mapey",
  "case 'b': // ALT+B, CTRL+B Toggle big map",
  "KeyModifiers & (ModifierAlt | ModifierControl)",
  "UiToggleBigMap();"
]) {
  expect(stratagusInterface.includes(fragment), `Stratagus interface missing BigMapMode fragment: ${fragment}`);
}

for (const fragment of [
  "BigMapMode is the mode which show only the map (without panel, minimap)",
  "if (BigMapMode)",
  "CursorOn = ECursorOn::Map",
  "HandleMouseScrollArea(screenPos)",
  "return"
]) {
  expect(stratagusMouse.includes(fragment), `Stratagus mouse handling missing BigMapMode fragment: ${fragment}`);
}

for (const [name, source, fragments] of [
  ["types", typesSource, ["bigScreenDefault: boolean"]],
  ["world defaults", worldSource, ["bigScreenDefault: false"]],
  ["indexer", indexSource, [
    "bigScreenDefault: readPreferenceAssignmentBool(\"BigScreen\", false)",
    "bigScreenDefault: false",
    "if (/Preference\\.BigScreen\\s*=/.test(source)) engineSettings.bigScreenDefault = parsedEngineSettings.bigScreenDefault"
  ]],
  ["save schema", saveSource, [
    "| \"bigScreenDefault\"",
    "bigScreenDefault: world.engineSettings.bigScreenDefault",
    "world.engineSettings.bigScreenDefault = booleanOr(record.bigScreenDefault, world.engineSettings.bigScreenDefault)"
  ]],
  ["camera", cameraSource, [
    "world?.engineSettings.bigScreenDefault",
    "width: screen.width",
    "height: screen.height"
  ]],
  ["source UI helpers", helpersSource, [
    "world.engineSettings.bigScreenDefault",
    "return { x: 0, y: 0, width: screenWidth, height: screenHeight }",
    "Big map: ${world.engineSettings.bigScreenDefault ? \"enabled\" : \"disabled\"}",
    "{ label: \"Big Map\", command: \"toggle-big-screen\" }"
  ]],
  ["HUD renderer", hudSource, [
    "\"toggle-big-screen\"",
    "world.engineSettings.bigScreenDefault && world.matchState.status === \"playing\"",
    "drawSourceMenuOverlay(app, hudLayer, manifest, world, menuOverlay",
    "drawMapPicker(app, hudLayer, manifest, mapPicker"
  ]],
  ["source input", inputSource, [
    "input.code === \"KeyB\" && (input.ctrlKey || input.altKey)",
    "return \"toggle-big-screen\""
  ]],
  ["map commands", mapCommandsSource, [
    "command === \"toggle-big-screen\"",
    "context.world.engineSettings.bigScreenDefault = !context.world.engineSettings.bigScreenDefault",
    "Big map enabled",
    "Big map disabled"
  ]]
]) {
  for (const fragment of fragments) {
    expect(source.includes(fragment), `${name} missing BigScreen fragment: ${fragment}`);
  }
}

expect(JSON.stringify(packageJson.scripts).includes("verify:source-big-screen"), "package.json verify scripts missing verify:source-big-screen.");

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  console.error(`Source BigScreen verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source BigScreen verified (Preference.BigScreen toggles full-map viewport and hides source HUD panels).");
