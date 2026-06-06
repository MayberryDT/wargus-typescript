import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const sourceRoot = "/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src";
const interfaceSource = readFileSync(path.join(sourceRoot, "ui/interface.cpp"), "utf8");
const inputSource = readFileSync("src/view/sourceInput.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const errors = [];

for (const fragment of [
  "void UiTrackUnit()",
  "UI.SelectedViewport->Unit = nullptr",
  "UI.SelectedViewport->Unit == Selected[0]",
  "UI.SelectedViewport->Unit = Selected[0]",
  "case 't': // ALT+T, CTRL+T Track unit",
  "UiTrackUnit();"
]) {
  if (!interfaceSource.includes(fragment)) {
    errors.push(`Stratagus interface source missing track-unit fragment: ${fragment}`);
  }
}

for (const fragment of [
  "export function sourceTrackUnitKeyAction",
  "input.code === \"KeyT\"",
  "input.ctrlKey || input.altKey"
]) {
  if (!inputSource.includes(fragment)) {
    errors.push(`Browser source input missing track-unit key fragment: ${fragment}`);
  }
}

for (const fragment of [
  "let trackedViewportUnitId: string | null = null",
  "sourceTrackUnitKeyAction(event)",
  "toggleTrackedViewportUnit(world)",
  "updateTrackedViewportUnit(loadedWorld)",
  "trackedViewportUnitId = trackedViewportUnitId === selected.id ? null : selected.id",
  "const tracked = loadedWorld.units.find((unit) => unit.id === trackedViewportUnitId && unit.hitPoints > 0)",
  "centerCameraOnWorldPoint(loadedWorld, tracked.x, tracked.y)",
  "trackedViewportUnitId = null"
]) {
  if (!mainSource.includes(fragment)) {
    errors.push(`Browser runtime missing track-unit fragment: ${fragment}`);
  }
}

if (!JSON.stringify(packageJson.scripts).includes("verify:source-track-unit")) {
  errors.push("package.json verify scripts missing verify:source-track-unit.");
}

if (!manifest.engineSettings?.gameName) {
  errors.push("Manifest missing source engine settings; track-unit verifier should run against indexed Wargus data.");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Source track-unit viewport behavior verified (Ctrl/Alt+T toggles selected-unit camera tracking).");
