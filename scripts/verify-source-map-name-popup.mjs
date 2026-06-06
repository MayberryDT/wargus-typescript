import { readFileSync } from "node:fs";

const stratagusMapDraw = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/map/map_draw.cpp", "utf8");
const stratagusMouse = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/ui/mouse.cpp", "utf8");
const stratagusUnit = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/include/unit.h", "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const overlaySource = readFileSync("src/view/renderOverlays.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const errors = [];
function expect(source, fragment, message) {
  if (!source.includes(fragment)) {
    errors.push(message);
  }
}

for (const fragment of [
  "int ShowNameDelay = 0",
  "int ShowNameTime = 0"
]) {
  expect(stratagusUnit, fragment, `Stratagus preference source missing name-popup fragment: ${fragment}`);
}

for (const fragment of [
  "static void ShowUnitName",
  "Unrevealed terrain",
  "Preference.ShowNameDelay && (ShowNameDelay < GameCycle) && (GameCycle < ShowNameTime)",
  "UnitUnderCursor",
  "Video.MapRGB(TheScreen->format, 0, 0, 252)",
  "Video.MapRGB(TheScreen->format, 0, 176, 0)",
  "Video.MapRGB(TheScreen->format, 252, 0, 0)",
  "Video.MapRGB(TheScreen->format, 176, 176, 176)"
]) {
  expect(stratagusMapDraw, fragment, `Stratagus map draw source missing name-popup fragment: ${fragment}`);
}

for (const fragment of [
  "ShowNameDelay = GameCycle + Preference.ShowNameDelay",
  "ShowNameTime = GameCycle + Preference.ShowNameDelay + Preference.ShowNameTime"
]) {
  expect(stratagusMouse, fragment, `Stratagus mouse source missing name-popup timer fragment: ${fragment}`);
}

for (const [source, label, fragments] of [
  [indexSource, "indexer", [
    "showNameDelayTicksDefault: readPreferenceAssignmentNumber(\"ShowNameDelay\", 0)",
    "showNameTimeTicksDefault: readPreferenceAssignmentNumber(\"ShowNameTime\", 0)",
    "showNameDelayTicksDefault: 0",
    "showNameTimeTicksDefault: 0"
  ]],
  [typesSource, "types", [
    "showNameDelayTicksDefault: number",
    "showNameTimeTicksDefault: number"
  ]],
  [worldSource, "world defaults", [
    "showNameDelayTicksDefault: 0",
    "showNameTimeTicksDefault: 0"
  ]],
  [saveSource, "save/load", [
    "showNameDelayTicksDefault: world.engineSettings.showNameDelayTicksDefault",
    "world.engineSettings.showNameDelayTicksDefault = nonNegativeIntegerOr",
    "showNameTimeTicksDefault: world.engineSettings.showNameTimeTicksDefault",
    "world.engineSettings.showNameTimeTicksDefault = nonNegativeIntegerOr"
  ]],
  [mainSource, "main runtime", [
    "const sourceMapNamePopupState: SourceMapNamePopupState",
    "resetSourceMapNamePopupTimer()",
    "showNameDelayTick = world.tick + world.engineSettings.showNameDelayTicksDefault",
    "showNameTimeTick = sourceMapNamePopupState.showNameDelayTick + Math.max(0, world.engineSettings.showNameTimeTicksDefault)",
    "renderSourceMapNamePopup({"
  ]],
  [overlaySource, "overlay renderer", [
    "export function renderSourceMapNamePopup",
    "world.engineSettings.showNameDelayTicksDefault <= 0",
    "popupState.showNameDelayTick < world.tick && world.tick < popupState.showNameTimeTick",
    "Unrevealed terrain",
    "unitTypeName(manifest, hoveredUnit.typeId)",
    "sourceNamePopupUnitBackground",
    "return 0x0000fc",
    "return 0x00b000",
    "return 0xfc0000",
    "return 0xb0b0b0"
  ]]
]) {
  for (const fragment of fragments) {
    expect(source, fragment, `${label} missing source map-name popup fragment: ${fragment}`);
  }
}

if (!JSON.stringify(packageJson.scripts).includes("verify:source-map-name-popup")) {
  errors.push("package.json verify scripts missing verify:source-map-name-popup.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source map-name popup verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source map-name popup verified (ShowNameDelay/ShowNameTime preferences, delayed unit labels, and unrevealed-terrain popup).");
