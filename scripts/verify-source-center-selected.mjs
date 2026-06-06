import { readFileSync } from "node:fs";
import path from "node:path";

const sourceRoot = "/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src";
const interfaceSource = readFileSync(path.join(sourceRoot, "ui/interface.cpp"), "utf8");
const inputSource = readFileSync("src/view/sourceInput.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const errors = [];

for (const fragment of [
  "static void UiCenterOnSelected()",
  "if (Selected.empty())",
  "pos += unit->GetMapPixelPosCenter();",
  "pos /= Selected.size();",
  "UI.SelectedViewport->Center(pos);",
  "case 'c': // ALT+C, CTRL+C C center on units",
  "UiCenterOnSelected();"
]) {
  if (!interfaceSource.includes(fragment)) {
    errors.push(`Stratagus interface source missing center-selected fragment: ${fragment}`);
  }
}

for (const fragment of [
  "export function sourceCenterSelectedKeyAction",
  "input.code === \"KeyC\"",
  "input.ctrlKey || input.altKey"
]) {
  if (!inputSource.includes(fragment)) {
    errors.push(`Browser source input missing center-selected key fragment: ${fragment}`);
  }
}

for (const fragment of [
  "sourceCenterSelectedKeyAction(event)",
  "centerCameraOnSelectedUnits(world)",
  "function centerCameraOnSelectedUnits",
  "selectedUnits.reduce",
  "centerCameraOnWorldPoint(loadedWorld, center.x / selectedUnits.length, center.y / selectedUnits.length)"
]) {
  if (!mainSource.includes(fragment)) {
    errors.push(`Browser runtime missing center-selected fragment: ${fragment}`);
  }
}

if (!JSON.stringify(packageJson.scripts).includes("verify:source-center-selected")) {
  errors.push("package.json verify scripts missing verify:source-center-selected.");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Source center-selected viewport behavior verified (Ctrl/Alt+C centers selected units).");
