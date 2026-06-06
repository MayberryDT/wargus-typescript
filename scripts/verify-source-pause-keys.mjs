import { readFileSync } from "node:fs";
import path from "node:path";

const sourceRoot = "/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src";
const interfaceSource = readFileSync(path.join(sourceRoot, "ui/interface.cpp"), "utf8");
const inputSource = readFileSync("src/view/sourceInput.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const errors = [];

for (const fragment of [
  "case 'p': // CTRL+P, ALT+P Toggle pause",
  "KeyModifiers & (ModifierAlt | ModifierControl)",
  "case SDLK_PAUSE:",
  "UiTogglePause();"
]) {
  if (!interfaceSource.includes(fragment)) {
    errors.push(`Stratagus interface source missing pause-key fragment: ${fragment}`);
  }
}

for (const fragment of [
  "export function sourceSpeedKeyAction",
  "input.code === \"Space\"",
  "input.code === \"Pause\"",
  "input.code === \"KeyP\" && Boolean(input.ctrlKey || input.altKey)",
  "return \"toggle-pause\""
]) {
  if (!inputSource.includes(fragment)) {
    errors.push(`Browser source input missing pause-key fragment: ${fragment}`);
  }
}

for (const fragment of [
  "sourceSpeedKeyAction(event)",
  "if (action === \"toggle-pause\")",
  "paused = !paused"
]) {
  if (!mainSource.includes(fragment)) {
    errors.push(`Browser runtime missing pause-key fragment: ${fragment}`);
  }
}

if (!JSON.stringify(packageJson.scripts).includes("verify:source-pause-keys")) {
  errors.push("package.json verify scripts missing verify:source-pause-keys.");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Source pause keys verified (Space, Ctrl/Alt+P, and Pause toggle game pause).");
