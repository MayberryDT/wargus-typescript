import { readFileSync } from "node:fs";
import path from "node:path";

const sourceRoot = "/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src";
const interfaceSource = readFileSync(path.join(sourceRoot, "ui/interface.cpp"), "utf8");
const inputSource = readFileSync("src/view/sourceInput.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const mapCommandsSource = readFileSync("src/view/mapCommands.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const errors = [];

for (const fragment of [
  "case 'e': // CTRL+E Turn messages on / off",
  "ToggleShowMessages();",
  "case 'm': // CTRL+M Turn music on / off",
  "UiToggleMusic();",
  "case 's': // CTRL+S - Turn sound on / off",
  "UiToggleSound();",
  "case SDLK_TAB: // TAB toggles minimap.",
  "if (KeyModifiers & ModifierAlt)",
  "UiToggleTerrain();"
]) {
  if (!interfaceSource.includes(fragment)) {
    errors.push(`Stratagus interface source missing preference-key fragment: ${fragment}`);
  }
}

for (const fragment of [
  "export type SourcePreferenceKeyCommand = \"toggle-messages\" | \"toggle-minimap-terrain\" | \"toggle-effects\" | \"toggle-music\"",
  "export function sourcePreferenceKeyCommand",
  "input.code === \"KeyE\" && input.ctrlKey",
  "return \"toggle-messages\"",
  "input.code === \"KeyM\" && input.ctrlKey",
  "return \"toggle-music\"",
  "input.code === \"KeyS\" && input.ctrlKey",
  "return \"toggle-effects\"",
  "input.code === \"Tab\" && !input.altKey",
  "return \"toggle-minimap-terrain\""
]) {
  if (!inputSource.includes(fragment)) {
    errors.push(`Browser source input missing preference-key fragment: ${fragment}`);
  }
}

for (const fragment of [
  "sourcePreferenceKeyCommand(event)",
  "function handleSourcePreferenceKey",
  "void executeMapCommand(command)"
]) {
  if (!mainSource.includes(fragment)) {
    errors.push(`Browser runtime missing preference-key fragment: ${fragment}`);
  }
}

for (const fragment of [
  "command === \"toggle-messages\"",
  "showMessagesDefault = !context.world.engineSettings.showMessagesDefault",
  "command === \"toggle-minimap-terrain\"",
  "minimapWithTerrainDefault = !context.world.engineSettings.minimapWithTerrainDefault",
  "command === \"toggle-effects\"",
  "effectsEnabledDefault = !context.world.engineSettings.effectsEnabledDefault",
  "command === \"toggle-music\"",
  "musicEnabledDefault = !context.world.engineSettings.musicEnabledDefault",
  "context.syncAudioSettings()"
]) {
  if (!mapCommandsSource.includes(fragment)) {
    errors.push(`Browser map command missing preference-key target fragment: ${fragment}`);
  }
}

if (!JSON.stringify(packageJson.scripts).includes("verify:source-preference-keys")) {
  errors.push("package.json verify scripts missing verify:source-preference-keys.");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Source preference keys verified (Ctrl+E messages, Ctrl+M music, Ctrl+S sound, and Tab minimap terrain).");
