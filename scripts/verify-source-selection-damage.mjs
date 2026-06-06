import { readFileSync } from "node:fs";

const stratagusUnitDraw = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/unit/unit_draw.cpp", "utf8");
const stratagusUnitHeader = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/include/unit.h", "utf8");
const stratagusColor = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/video/color.cpp", "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const renderWorldSource = readFileSync("src/view/renderWorld.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const errors = [];
function expect(source, fragment, message) {
  if (!source.includes(fragment)) {
    errors.push(message);
  }
}

for (const fragment of [
  "bool SelectionRectangleIndicatesDamage = false",
  "IntColor color2 = 0"
]) {
  expect(stratagusUnitHeader + stratagusUnitDraw, fragment, `Stratagus selection-damage source missing fragment: ${fragment}`);
}

for (const fragment of [
  "color = ColorGreen",
  "color2 = ColorRed",
  "Preference.SelectionRectangleIndicatesDamage",
  "float fraction = (float)unit.Variable[HP_INDEX].Value / unit.Variable[HP_INDEX].Max",
  "color = InterpolateColor(color2, color, fraction)"
]) {
  expect(stratagusUnitDraw, fragment, `Stratagus unit draw source missing selection-damage fragment: ${fragment}`);
}

expect(stratagusColor, "return (int) lerp(r1, r2, fraction) << 16", "Stratagus color interpolation source missing integer lerp fragment.");

for (const [source, label, fragments] of [
  [indexSource, "indexer", [
    "selectionRectangleIndicatesDamageDefault: readPreferenceAssignmentBool(\"SelectionRectangleIndicatesDamage\", false)",
    "selectionRectangleIndicatesDamageDefault: false",
    "engineSettings.selectionRectangleIndicatesDamageDefault = parsedEngineSettings.selectionRectangleIndicatesDamageDefault"
  ]],
  [typesSource, "types", [
    "selectionRectangleIndicatesDamageDefault: boolean"
  ]],
  [worldSource, "world defaults", [
    "selectionRectangleIndicatesDamageDefault: false"
  ]],
  [saveSource, "save/load", [
    "selectionRectangleIndicatesDamageDefault: world.engineSettings.selectionRectangleIndicatesDamageDefault",
    "world.engineSettings.selectionRectangleIndicatesDamageDefault = booleanOr"
  ]],
  [renderWorldSource, "renderer", [
    "const color = sourceSelectionMarkerColor(world, unit)",
    "function sourceSelectionMarkerColor",
    "world.engineSettings.selectionRectangleIndicatesDamageDefault",
    "unit.hitPoints / unit.maxHitPoints",
    "return interpolateSourceColor(0xfc0000, 0x00fc00, fraction)",
    "function interpolateSourceColor",
    "Math.floor(left + (right - left) * fraction)"
  ]]
]) {
  for (const fragment of fragments) {
    expect(source, fragment, `${label} missing browser selection-damage fragment: ${fragment}`);
  }
}

if (!JSON.stringify(packageJson.scripts).includes("verify:source-selection-damage")) {
  errors.push("package.json verify scripts missing verify:source-selection-damage.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source selection-damage verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source selection-damage marker verified (SelectionRectangleIndicatesDamage preference and HP-based red-to-green interpolation).");
