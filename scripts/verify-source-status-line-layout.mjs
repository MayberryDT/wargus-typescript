import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const dataRoot = manifest.dataRoot;
const humanUiSource = readFileSync(path.join(dataRoot, "scripts/human/ui_pandora.lua"), "utf8");
const orcUiSource = readFileSync(path.join(dataRoot, "scripts/orc/ui_pandora.lua"), "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");

const errors = [];
const expectedStatusLine = {
  textX: 178,
  textYFromBottom: 14,
  widthLeft: 194,
  widthRightMargin: 16,
  font: "game"
};

for (const [name, source] of [["human UI", humanUiSource], ["orc UI", orcUiSource]]) {
  for (const fragment of [
    "UI.StatusLine.TextX = 2 + 176",
    "UI.StatusLine.TextY = Video.Height + 2 - 16",
    "UI.StatusLine.Width = Video.Width - 16 - 2 - 176",
    "UI.StatusLine.Font = Fonts[\"game\"]"
  ]) {
    if (!source.includes(fragment)) {
      errors.push(`${name} missing status-line fragment: ${fragment}`);
    }
  }
}

if (JSON.stringify(manifest.engineSettings.statusLine) !== JSON.stringify(expectedStatusLine)) {
  errors.push(`Manifest statusLine is ${JSON.stringify(manifest.engineSettings.statusLine)}, expected ${JSON.stringify(expectedStatusLine)}`);
}

for (const [name, source, fragments] of [
  ["indexer", indexSource, [
    "const videoSize = sourceVideoSize(videoWidthDefault, videoHeightDefault)",
    "function parseUiStatusLine(source, videoSize = sourceVideoSize())",
    "UI\\.StatusLine\\.TextX",
    "UI\\.StatusLine\\.TextY",
    "UI\\.StatusLine\\.Width",
    "UI\\.StatusLine\\.Font",
    "statusLine: parseUiStatusLine(uncommented, videoSize)",
    "statusLine: null",
    "engineSettings.statusLine ??= parsedEngineSettings.statusLine"
  ]],
  ["types", typesSource, [
    "statusLine: WargusStatusLineLayout | null",
    "export interface WargusStatusLineLayout",
    "textYFromBottom: number",
    "widthRightMargin: number"
  ]],
  ["world defaults", worldSource, [
    "statusLine:",
    "textX: 178",
    "textYFromBottom: 14",
    "widthLeft: 194",
    "font: \"game\""
  ]],
  ["HUD render", hudSource, [
    "sourceStatusLineLayout(app.screen, sideWidth, world.engineSettings.statusLine)"
  ]],
  ["source UI helpers", sourceUiHelpersSource, [
    "export function sourceStatusLineLayout(screen: { width: number; height: number }, sideWidth: number, layout: WargusStatusLineLayout | null)",
    "sourceLayout.textX * scale",
    "sourceLayout.textYFromBottom * scale",
    "sourceLayout.widthRightMargin * scale"
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
  console.error(`Source status-line layout verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source status-line layout verified (Pandora UI status geometry indexed and used by HUD messages).");
