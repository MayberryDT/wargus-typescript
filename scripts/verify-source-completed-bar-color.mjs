import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const dataRoot = manifest.dataRoot;
const humanUiSource = readFileSync(path.join(dataRoot, "scripts/human/ui_pandora.lua"), "utf8");
const orcUiSource = readFileSync(path.join(dataRoot, "scripts/orc/ui_pandora.lua"), "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const renderHudSource = readFileSync("src/view/renderHud.ts", "utf8");
const renderWorldSource = readFileSync("src/view/renderWorld.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");

const errors = [];
const sourceFragment = "UI.CompletedBarColorRGB = CColor(48, 100, 4)";
const shadowFragment = "UI.CompletedBarShadow = false";
const expectedColor = [48, 100, 4];

for (const [name, source] of [["human UI", humanUiSource], ["orc UI", orcUiSource]]) {
  if (!source.includes(sourceFragment)) {
    errors.push(`${name} missing source completed bar color fragment: ${sourceFragment}`);
  }
  if (!source.includes(shadowFragment)) {
    errors.push(`${name} missing source completed bar shadow fragment: ${shadowFragment}`);
  }
}

if (JSON.stringify(manifest.engineSettings.completedBarColorRgb) !== JSON.stringify(expectedColor)) {
  errors.push(`Manifest completedBarColorRgb is ${JSON.stringify(manifest.engineSettings.completedBarColorRgb)}, expected ${JSON.stringify(expectedColor)}`);
}

if (manifest.engineSettings.completedBarShadow !== false) {
  errors.push(`Manifest completedBarShadow is ${JSON.stringify(manifest.engineSettings.completedBarShadow)}, expected false`);
}

for (const [name, source, fragments] of [
  ["indexer", indexSource, [
    "function parseUiColor(source, name)",
    "function parseUiBool(source, name)",
    "UI\\\\.${name}\\\\s*=\\\\s*CColor",
    "completedBarColorRgb: parseUiColor(uncommented, \"CompletedBarColorRGB\")",
    "completedBarShadow: parseUiBool(uncommented, \"CompletedBarShadow\")",
    "completedBarColorRgb: null",
    "completedBarShadow: null",
    "engineSettings.completedBarColorRgb ??= parsedEngineSettings.completedBarColorRgb",
    "engineSettings.completedBarShadow ??= parsedEngineSettings.completedBarShadow"
  ]],
  ["types", typesSource, [
    "completedBarColorRgb: [number, number, number] | null",
    "completedBarShadow: boolean | null"
  ]],
  ["HUD render", renderHudSource, [
    "function drawSourceCompletionBar",
    "const completedBarColor = sourceCompletedBarColor(world)",
    "const completedBarShadow = sourceCompletedBarShadow(world)",
    "color: completedBarColor",
    "item.active && completedBarShadow",
    "row.label === \"MP\" ? \"mana\" : null"
  ]],
  ["world render", renderWorldSource, [
    "function drawSourceCompletionBar",
    "sourceCompletedBarColor",
    "sourceCompletedBarShadow",
    "from \"./sourceUiHelpers\"",
    "const completedBarColor = sourceCompletedBarColor(world)",
    "const completedBarShadow = sourceCompletedBarShadow(world)",
    "drawSourceCompletionBar(graphics"
  ]],
  ["source UI helpers", sourceUiHelpersSource, [
    "export function sourceCompletedBarColor(world: WorldState): number",
    "export function sourceCompletedBarShadow(world: WorldState): boolean",
    "world.engineSettings.completedBarColorRgb",
    "world.engineSettings.completedBarShadow === true"
  ]]
]) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      errors.push(`${name} missing fragment: ${fragment}`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source completed bar color verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source completed bar verified (Wargus UI color and shadow flag indexed and used for browser completion bars).");
