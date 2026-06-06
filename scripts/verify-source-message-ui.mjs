import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const dataRoot = manifest.dataRoot;
const uiSource = readFileSync(path.join(dataRoot, "scripts/ui.lua"), "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");

const errors = [];
const expected = {
  font: "game",
  scrollSpeed: 5
};

for (const fragment of [
  "UI.MessageFont = Fonts[\"game\"]",
  "UI.MessageScrollSpeed = 5"
]) {
  if (!uiSource.includes(fragment)) {
    errors.push(`Source UI missing message fragment: ${fragment}`);
  }
}

if (JSON.stringify(manifest.engineSettings?.messageUi) !== JSON.stringify(expected)) {
  errors.push(`Manifest messageUi is ${JSON.stringify(manifest.engineSettings?.messageUi)}, expected ${JSON.stringify(expected)}`);
}

for (const [name, source, fragments] of [
  ["indexer", indexSource, [
    "function parseUiMessageLayout(source)",
    "UI\\.MessageFont",
    "UI\\.MessageScrollSpeed",
    "messageUi: parseUiMessageLayout(uncommented)",
    "messageUi: null",
    "engineSettings.messageUi ??= parsedEngineSettings.messageUi"
  ]],
  ["types", typesSource, [
    "messageUi: WargusMessageUiLayout | null",
    "export interface WargusMessageUiLayout",
    "scrollSpeed: number"
  ]],
  ["world defaults", worldSource, [
    "messageUi:",
    "font: \"game\"",
    "scrollSpeed: 5"
  ]],
  ["HUD render", hudSource, [
    "drawHudMessages(hudLayer, app, sideWidth, manifest, world, hudMessages, wargusBitmapFontAtlas)",
    "world.engineSettings.messageUi",
    "sourceMessageLineHeight(statusLine.lineHeight, messageUi)",
    "sourceMessageScrollOffset(message, now, lineHeight, messageUi)",
    "const visibleRace = world.players.find((player) => player.id === world.visibilityPlayer)?.race === \"orc\" ? \"orc\" : \"human\"",
    "const messageColor = sourceTextColorNumber(manifest, visibleRace, \"normal\", 0xf0df9a)",
    "const messagePaletteId = sourceTextPaletteId(manifest, visibleRace, \"normal\")",
    "const messageCssColor = sourceTextColorCss(manifest, visibleRace, \"normal\", \"#f0df9a\")",
    "paletteId: messagePaletteId",
    "fill: messageCssColor"
  ]],
  ["source UI helpers", sourceUiHelpersSource, [
    "export function sourceMessageLineHeight(statusLineHeight: number, messageUi: WargusMessageUiLayout | null)",
    "export function sourceMessageScrollOffset",
    "messageUi?.scrollSpeed"
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
  process.exit(1);
}

console.log("Source message UI settings are indexed and used by HUD messages.");
