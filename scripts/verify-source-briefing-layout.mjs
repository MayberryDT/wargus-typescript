import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const dataRoot = manifest.dataRoot;
const databaseSource = readFileSync(path.join(dataRoot, "scripts/database.lua"), "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const sourceInputSource = readFileSync("src/view/sourceInput.ts", "utf8");
const audioCuesSource = readFileSync("src/audio/audioCues.ts", "utf8");
const audioEngineSource = readFileSync("src/audio/audioEngine.ts", "utf8");

const errors = [];
const expectedLayout = {
  baseWidth: 640,
  baseHeight: 480,
  titleX: 205,
  titleY: 28,
  textX: 70,
  textY: 80,
  textWidth: 320,
  objectivesX: 70,
  objectivesY: 306,
  objectivesWidth: 250,
  continueButtonX: 455,
  continueButtonY: 440,
  exitButtonOffsetX: 133,
  characterXOffsetFromRight: 450,
  characterY: 10
};

for (const fragment of [
  "GameDefinition[\"Briefing\"][\"X\"] + (70 + 340) / 2 * GameDefinition[\"Briefing\"][\"Width\"] / 640",
  "GameDefinition[\"Briefing\"][\"Y\"] + 28 * GameDefinition[\"Briefing\"][\"Height\"] / 480",
  "GameDefinition[\"Briefing\"][\"X\"] + 70 * GameDefinition[\"Briefing\"][\"Width\"] / 640",
  "GameDefinition[\"Briefing\"][\"Y\"] + 80 * GameDefinition[\"Briefing\"][\"Height\"] / 480",
  "menu:addMultiLineLabel(screentext",
  "false, 320)",
  "_(\"Objectives:\")",
  "l:setLineWidth(250 * GameDefinition[\"Briefing\"][\"Width\"] / 640)",
  "GameDefinition[\"Briefing\"][\"Y\"] + 306 * GameDefinition[\"Briefing\"][\"Height\"] / 480",
  "455 * GameDefinition[\"Briefing\"][\"Width\"] / 640",
  "440 * GameDefinition[\"Briefing\"][\"Height\"] / 480",
  "- 133"
]) {
  if (!databaseSource.includes(fragment)) {
    errors.push(`database.lua missing briefing fragment: ${fragment}`);
  }
}

if (JSON.stringify(manifest.engineSettings.briefingLayout) !== JSON.stringify(expectedLayout)) {
  errors.push(`Manifest briefingLayout is ${JSON.stringify(manifest.engineSettings.briefingLayout)}, expected ${JSON.stringify(expectedLayout)}`);
}

for (const [name, source, fragments] of [
  ["indexer", indexSource, [
    "function parseBriefingLayout(source)",
    "baseWidth: 640",
    "baseHeight: 480",
    "titleX",
    "textWidth",
    "objectivesWidth",
    "continueButtonX",
    "exitButtonOffsetX",
    "briefingLayout: parseBriefingLayout(scriptSources.get(\"scripts/database.lua\") ?? \"\")"
  ]],
  ["types", typesSource, [
    "briefingLayout: WargusBriefingLayout | null",
    "export interface WargusBriefingLayout",
    "continueButtonX: number",
    "exitButtonOffsetX: number"
  ]],
  ["world defaults", worldSource, [
    "briefingLayout:",
    "titleX: 205",
    "objectivesY: 306",
    "continueButtonY: 440"
  ]],
  ["HUD render", hudSource, [
    "drawBriefingOverlay(app, hudLayer, manifest, world, briefingOpen, wargusBitmapFontAtlas, onDismissBriefing, onReplayBriefing)",
    "function drawBriefingOverlay(app: Application, layer: Container, manifest: WargusManifest, world: WorldState, open: boolean, bitmapFonts: WargusBitmapFontAtlas | null",
    "function sourceBriefingFrame(app: Application, layout: WargusBriefingLayout | null)",
    "world.engineSettings.briefingLayout",
    "layout.titleX * scale",
    "layout.textX * scale",
    "layout.objectivesY * scale",
    "layout.continueButtonX * scale",
    "layout.exitButtonOffsetX * scale",
    "fontId: \"large\"",
    "fontId: \"game\"",
    "drawBriefingButton(layer, bx, by, buttonWidth, buttonHeight, \"Continue\", manifest, visibleRace, bitmapFonts, onDismiss)",
    "sourceTextColorNumber(manifest, visibleRace, \"normal\", 0xf0df9a)"
  ]],
  ["runtime", mainSource, [
    "sourceOverlayKeyAction(event, { titleScreenOpen, briefingOpen })",
    "overlayAction === \"dismiss-briefing\"",
    "overlayAction === \"replay-briefing\"",
    "startBriefingAudioCue(audioCueState, audioEngine, loadedWorld, briefingOpen)",
    "audioEngine?.stopBriefingSounds()"
  ]],
  ["source input", sourceInputSource, [
    "state.briefingOpen && (input.code === \"Enter\" || input.code === \"Space\" || input.code === \"Escape\")",
    "return \"dismiss-briefing\"",
    "state.briefingOpen && input.code === \"KeyN\"",
    "return \"replay-briefing\""
  ]],
  ["audio cues", audioCuesSource, [
    "world.briefingVoiceFiles.length === 0",
    "world.briefingVoiceFiles.join(\"|\")",
    "audioEngine?.playSoundFiles(world.briefingVoiceFiles)"
  ]],
  ["audio engine", audioEngineSource, [
    "async playSoundFiles(files: string[]): Promise<void>",
    "this.stopBriefingSounds()",
    "startAt += buffer.duration + 0.12",
    "stopBriefingSounds(): void"
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
  console.error(`Source briefing layout verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source briefing layout verified (Wargus database.lua coordinates indexed, rendered, and narration playback guarded).");
