import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const sourceCommands = readFileSync(path.join(manifest.dataRoot, "scripts/commands.lua"), "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const sourceInputSource = readFileSync("src/view/sourceInput.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const errors = [];

const sourceFragments = [
  "RunGameMenu()",
  "RunHelpMenu()",
  "RunGameOptionsMenu()",
  "RunSpeedsMenu()",
  "RunGameSoundOptionsMenu()",
  "RunPreferencesMenu()",
  "RunDiplomacyMenu()",
  "RunSaveMenu()",
  "RunGameLoadGameMenu()",
  "RunQuitToMenuConfirmMenu()",
  "RunExitConfirmMenu()",
  "RunRestartConfirmMenu()",
  "key == \"f1\"",
  "key == \"f5\"",
  "key == \"f6\"",
  "key == \"f7\"",
  "key == \"f8\"",
  "key == \"f9\"",
  "key == \"f10\"",
  "key == \"f11\"",
  "key == \"f12\"",
  "key == \"m\" and alt",
  "key == \"s\" and alt",
  "key == \"l\" and alt",
  "key == \"q\" and (ctrl or alt)",
  "key == \"x\" and (ctrl or alt)",
  "key == \"r\" and (ctrl or alt)"
];

const runtimeFragments = [
  "function handleSourceIngameCommandKey",
  "handleSourceIngameCommandKey(event)",
  "sourceIngameMapCommandForKey(event)",
  "paused = true",
  "saveCurrentAutosave()",
  "void executeMapCommand(command)",
  "verify:source-command-keys"
];

const inputFragments = [
  "export function sourceIngameMapCommandForKey",
  "event.code === \"F1\"",
  "event.code === \"F5\"",
  "event.code === \"F6\"",
  "event.code === \"F7\"",
  "event.code === \"F8\"",
  "event.code === \"F9\"",
  "event.code === \"F10\"",
  "event.code === \"Backspace\"",
  "event.code === \"KeyM\" && event.altKey",
  "event.code === \"F11\"",
  "event.code === \"KeyS\" && event.altKey",
  "event.code === \"F12\"",
  "event.code === \"KeyL\" && event.altKey",
  "event.code === \"KeyR\" && (event.ctrlKey || event.altKey)",
  "event.code === \"KeyQ\" && (event.ctrlKey || event.altKey)",
  "event.code === \"KeyX\" && (event.ctrlKey || event.altKey)",
  "return \"help-menu\"",
  "return \"game-options\"",
  "return \"speed-options\"",
  "return \"sound-options\"",
  "return \"preferences\"",
  "return \"diplomacy\"",
  "return \"main-menu\"",
  "return \"choose-map\"",
  "return \"save-menu\"",
  "return \"load-menu\"",
  "return \"restart-map\"",
  "return \"quit-to-menu\"",
  "return \"exit-game\""
];

const hudFragments = [
  "drawMapPanel(hudLayer, frame, left + 18, app.screen.height - 442, sideWidth - 36, activeMap, manifest, activeSaveSlot, activeSaveSummary, autosaveSummary, paused, gameSpeed, wargusBitmapFontAtlas, onMapCommand)",
  "function drawMapPanel(",
  "bitmapFonts: WargusBitmapFontAtlas | null",
  "fontId: \"game\"",
  "sourceTextColorNumber(manifest, \"human\", \"normal\", 0xf0df9a)",
  "drawMapPicker(app, hudLayer, manifest, mapPicker, completedCampaignMissions, wargusBitmapFontAtlas, onMapPick)",
  "function drawMapPicker(app: Application, layer: Container, manifest: WargusManifest",
  "fontId: \"large\""
];

for (const fragment of sourceFragments) {
  if (!sourceCommands.includes(fragment)) {
    errors.push(`Source commands.lua missing expected fragment: ${fragment}`);
  }
}

const packageScripts = JSON.stringify(packageJson.scripts);
for (const fragment of runtimeFragments) {
  const source = fragment === "verify:source-command-keys" ? packageScripts : mainSource;
  if (!source.includes(fragment)) {
    errors.push(`Browser source command key wiring missing fragment: ${fragment}`);
  }
}

for (const fragment of inputFragments) {
  if (!sourceInputSource.includes(fragment.replaceAll("event.", "input."))) {
    errors.push(`Browser source command input helper missing fragment: ${fragment}`);
  }
}

for (const fragment of hudFragments) {
  if (!hudSource.includes(fragment)) {
    errors.push(`Browser source command/menu HUD missing bitmap font fragment: ${fragment}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  console.error(`Source command key verifier failed: ${errors.length}`);
  process.exit(1);
}

console.log("Source in-game command keys verified (F1, F5-F12, Backspace, and Ctrl/Alt menu/save/load/restart/quit/exit bindings).");
