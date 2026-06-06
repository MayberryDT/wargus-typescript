import { readFileSync } from "node:fs";
import path from "node:path";

const sourceRoot = "/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src";
const interfaceSource = readFileSync(path.join(sourceRoot, "ui/interface.cpp"), "utf8");
const inputSource = readFileSync("src/view/sourceInput.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const errors = [];

for (const fragment of [
  "case SDLK_EQUALS: // plus is shift-equals.",
  "case SDLK_KP_PLUS:",
  "UiIncreaseGameSpeed();",
  "case SDLK_MINUS: // - Slower",
  "case SDLK_KP_MINUS:",
  "UiDecreaseGameSpeed();",
  "case SDLK_KP_MULTIPLY:",
  "UiSetDefaultGameSpeed();",
  "CyclesPerSecond = CYCLES_PER_SECOND;"
]) {
  if (!interfaceSource.includes(fragment)) {
    errors.push(`Stratagus interface source missing speed-key fragment: ${fragment}`);
  }
}

for (const fragment of [
  "export type SourceSpeedKeyAction = \"toggle-pause\" | \"slower-game\" | \"faster-game\" | \"default-game-speed\"",
  "input.code === \"Minus\" || input.code === \"NumpadSubtract\" || input.code === \"BracketLeft\"",
  "input.code === \"Equal\" || input.code === \"NumpadAdd\" || input.code === \"BracketRight\"",
  "input.code === \"NumpadMultiply\"",
  "return \"default-game-speed\""
]) {
  if (!inputSource.includes(fragment)) {
    errors.push(`Browser source input missing speed-key fragment: ${fragment}`);
  }
}

for (const fragment of [
  "if (action === \"slower-game\")",
  "previousGameSpeed(gameSpeed, world)",
  "if (action === \"faster-game\")",
  "nextGameSpeed(gameSpeed, world)",
  "if (action === \"default-game-speed\")",
  "world.engineSettings.sourceGameSpeedDefault = sourceDefaultGameSpeed(world)",
  "gameSpeed = sourceGameSpeedMultiplier(world)"
]) {
  if (!mainSource.includes(fragment)) {
    errors.push(`Browser runtime missing speed-key fragment: ${fragment}`);
  }
}

if (mainSource.includes("world.engineSettings.sourceGameSpeedDefault = Math.max(1, world.tickRate || 30)")) {
  errors.push("Default speed reset should use sourceDefaultGameSpeed instead of inline browser tick-rate fallback math.");
}

if (!JSON.stringify(packageJson.scripts).includes("verify:source-speed-keys")) {
  errors.push("package.json verify scripts missing verify:source-speed-keys.");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Source speed keys verified (= / keypad + faster, - / keypad - slower, keypad * default).");
