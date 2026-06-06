import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const stratagusSource = readFileSync(path.join(manifest.dataRoot, "scripts/stratagus.lua"), "utf8");
const helpSource = readFileSync(path.join(manifest.dataRoot, "scripts/menus/help.lua"), "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const syncSource = readFileSync("scripts/sync-wargus-assets.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const mapCommandsSource = readFileSync("src/view/mapCommands.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const sourceInputSource = readFileSync("src/view/sourceInput.ts", "utf8");
const audioSource = readFileSync("src/audio/audioEngine.ts", "utf8");
const audioCueSource = readFileSync("src/audio/audioCues.ts", "utf8");

const errors = [];
function error(message) {
  errors.push(message);
}

for (const fragment of [
  "SetTitleScreens(",
  'Image = "ui/title.png"',
  'Music = "music/Orc Briefing"'
]) {
  if (!stratagusSource.includes(fragment)) {
    error(`Source stratagus.lua missing title-screen fragment: ${fragment}`);
  }
}

for (const fragment of [
  "function parseTitleScreens",
  "function parseTitleTips",
  "titleScreens = parseTitleScreens",
  "titleTips = parseTitleTips",
  "titleScreens,"
]) {
  if (!indexSource.includes(fragment)) {
    error(`Indexer missing title-screen fragment: ${fragment}`);
  }
}

for (const fragment of [
  "titleScreens?: WargusTitleScreen[]",
  "titleTips?: WargusTitleTip[]",
  "export interface WargusTitleScreen",
  "export interface WargusTitleTip",
  "timeoutSeconds: number | null",
  "stretchMode: string | null"
]) {
  if (!typesSource.includes(fragment)) {
    error(`Types missing title-screen fragment: ${fragment}`);
  }
}

if (!syncSource.includes("manifest.titleScreens") || !syncSource.includes("!screen.image.endsWith(\".ogv\")")) {
  error("Asset sync does not copy non-video title-screen images.");
}

for (const fragment of [
  "drawSourceTitleScreen",
  "sourceTitleScreen(manifest)",
  "Sprite.from(`/wargus/graphics/${sourceTitle.image}`)",
  "drawSourceTitleScreen(app, hudLayer, manifest, world, titleScreenOpen, wargusBitmapFontAtlas, onDismissTitleScreen",
  "function drawSourceTitleScreen(app: Application, layer: Container, manifest: WargusManifest, world: WorldState, open: boolean, bitmapFonts: WargusBitmapFontAtlas | null",
  "fontId: \"large\"",
  "fontId: \"game\"",
  "drawBriefingButton(layer, app.screen.width - startWidth - 28, buttonY, startWidth, 38, \"Begin\", manifest, \"human\", bitmapFonts, onBegin)",
  "sourceTitleTip",
  "titleScreenOpen",
  "onDismissTitleScreen"
]) {
  if (!hudSource.includes(fragment)) {
    error(`HUD missing title-screen fragment: ${fragment}`);
  }
}

for (const fragment of [
  "export function sourceTitleScreen",
  "manifest?.titleScreens ?? []",
  "!screen.image.endsWith(\".ogv\")",
  "export function sourceTitleTip",
  "const settings = world?.engineSettings ?? manifest?.engineSettings",
  "settings?.showTipsDefault",
  "settings?.tipNumberDefault",
  "manifest?.titleTips ?? []"
]) {
  if (!sourceUiHelpersSource.includes(fragment)) {
    error(`Source UI helpers missing title-screen fragment: ${fragment}`);
  }
}

for (const fragment of [
  "let titleScreenOpen = true",
  "sourceOverlayKeyAction(event, { titleScreenOpen, briefingOpen })",
  "overlayAction === \"dismiss-title\"",
  "dismissTitleScreen",
  "ensureSourceMusicStarted(audioEngine, manifest, world, { titleScreenOpen, briefingOpen })",
  "!titleScreenOpen"
]) {
  if (!mainSource.includes(fragment)) {
    error(`Runtime missing title-screen fragment: ${fragment}`);
  }
}

for (const fragment of [
  "sourceTitleMusicFile",
  "audioEngine.playMusicFile(sourceTitleMusicFile(manifest))"
]) {
  if (!audioCueSource.includes(fragment)) {
    error(`Runtime missing title-screen audio cue fragment: ${fragment}`);
  }
}

for (const fragment of [
  "export function sourceOverlayKeyAction",
  "state.titleScreenOpen && (input.code === \"Enter\" || input.code === \"Space\" || input.code === \"Escape\")",
  "return \"dismiss-title\""
]) {
  if (!sourceInputSource.includes(fragment)) {
    error(`Source input missing title-screen fragment: ${fragment}`);
  }
}

for (const fragment of [
  'command === "toggle-show-tips"',
  "context.world.engineSettings.showTipsDefault = !context.world.engineSettings.showTipsDefault",
  'command === "next-title-tip"',
  "context.world.engineSettings.tipNumberDefault = nextSourceTitleTipNumber",
  "function nextSourceTitleTipNumber"
]) {
  if (!mapCommandsSource.includes(fragment)) {
    error(`Map commands missing title-tip preference fragment: ${fragment}`);
  }
}

for (const fragment of [
  '"toggle-show-tips"',
  '"next-title-tip"'
]) {
  if (!hudSource.includes(fragment)) {
    error(`HUD command type missing title-tip preference fragment: ${fragment}`);
  }
}

for (const fragment of [
  'Title tips: ${world.engineSettings.showTipsDefault',
  '{ label: "Tips", command: "toggle-show-tips" }',
  '{ label: "Next Tip", command: "next-title-tip" }'
]) {
  if (!sourceUiHelpersSource.includes(fragment)) {
    error(`Source UI helpers missing title-tip preference fragment: ${fragment}`);
  }
}

for (const fragment of [
  '| "showTipsDefault"',
  '| "tipNumberDefault"',
  "showTipsDefault: world.engineSettings.showTipsDefault",
  "tipNumberDefault: world.engineSettings.tipNumberDefault",
  "world.engineSettings.showTipsDefault = booleanOr(record.showTipsDefault",
  "world.engineSettings.tipNumberDefault = nonNegativeIntegerOr(record.tipNumberDefault"
]) {
  if (!saveSource.includes(fragment)) {
    error(`Save/load missing title-tip preference fragment: ${fragment}`);
  }
}

if (!audioSource.includes("async playMusicFile")) {
  error("Audio engine missing explicit source title music playback.");
}

for (const fragment of [
  "local tips = {",
  "RunTipsMenu",
  "The more workers you have collecting resources"
]) {
  if (!helpSource.includes(fragment)) {
    error(`Source help.lua missing title-tip fragment: ${fragment}`);
  }
}

const screens = manifest.titleScreens ?? [];
if (screens.length < 2) {
  error(`Expected multiple indexed title screens, found ${screens.length}.`);
}
if (!screens.some((screen) => screen.image === "ui/title.png" && screen.music === "music/Orc Briefing.mid" && screen.stretchMode === "keep-ratio")) {
  error("Manifest missing source main title screen with music and keep-ratio stretch mode.");
}
for (const screen of screens.filter((entry) => entry.image && !entry.image.endsWith(".ogv"))) {
  const asset = path.join("public/wargus/graphics", screen.image);
  if (!existsSync(asset)) {
    error(`Missing synced title-screen asset: ${asset}`);
  }
}

const tips = manifest.titleTips ?? [];
if (tips.length < 10) {
  error(`Expected indexed source title tips, found ${tips.length}.`);
}
if (!tips.some((tip) => tip.text.includes("The more workers you have collecting resources") && tip.source === "scripts/menus/help.lua")) {
  error("Manifest missing source startup economy tip from help.lua.");
}

if (errors.length > 0) {
  console.error(`Source title-screen verification failed (${errors.length} errors).`);
  for (const message of errors) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log(`Source title screens verified (${screens.length} screens, ${screens.filter((screen) => !screen.image.endsWith(".ogv")).length} browser image screens, ${tips.length} startup tips).`);
