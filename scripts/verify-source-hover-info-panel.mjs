import { readFileSync } from "node:fs";

const stratagusMainScreen = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus/src/ui/mainscr.cpp", "utf8");
const stratagusMouse = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus/src/ui/mouse.cpp", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const errors = [];
function expect(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

for (const fragment of [
  "UnitUnderCursor && Selected.empty()",
  "!UnitUnderCursor->Type->BoolFlag[ISNOTSELECTABLE_INDEX].value",
  "UnitUnderCursor->IsVisible(*ThisPlayer)",
  "InfoPanel_draw_single_selection(UnitUnderCursor)"
]) {
  expect(stratagusMainScreen.includes(fragment), `Stratagus info-panel hover source missing fragment: ${fragment}`);
}

for (const fragment of [
  "UnitUnderCursor = UnitOnScreen",
  "UnitUnderCursor != nullptr && !UnitUnderCursor->IsVisibleAsGoal",
  "UnitUnderCursor = nullptr"
]) {
  expect(stratagusMouse.includes(fragment), `Stratagus unit-under-cursor source missing fragment: ${fragment}`);
}

for (const fragment of [
  "const hoveredUnit = sourceUnitUnderCursor(world, pointerWorldPosition)",
  "hoveredUnitId: hoveredUnit?.id ?? null",
  "function sourceUnitUnderCursor",
  "isUnitVisibleToPlayer(loadedWorld, unit, loadedWorld.visibilityPlayer)",
  "sourceUnitContainsWorldPoint(loadedWorld, unit, point.x, point.y)",
  "function sourceUnitContainsWorldPoint",
  "unitFootprintHalfSize(unit, loadedWorld.tileSize)"
]) {
  expect(mainSource.includes(fragment), `Browser runtime missing hover info-panel fragment: ${fragment}`);
}

for (const fragment of [
  "hoveredUnitId: string | null",
  "const hoveredUnit = selectedUnits.length === 0 && hoveredUnitId",
  "const selected = selectedUnits[0] ?? hoveredUnit ?? null",
  "const selectedFromHover = selectedUnits.length === 0 && selected !== null",
  "under cursor",
  "selectedUnits.length <= 1 && selectedIsOwned && !selectedFromHover ? selected : null",
  "drawCommandPanel(hudLayer, frame, app, sideWidth, left + 18, app.screen.height - 350, sideWidth - 36, manifest, world, selectedUnits"
]) {
  expect(hudSource.includes(fragment), `Browser HUD missing hover info-panel fragment: ${fragment}`);
}

expect(!hudSource.includes("availableCommands(manifest, world, selected ? [selected]"), "Hover info-panel unit should not become the command selection.");
expect(JSON.stringify(packageJson.scripts).includes("verify:source-hover-info-panel"), "package.json verify scripts missing verify:source-hover-info-panel.");

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source hover info-panel verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source hover info-panel verified (UnitUnderCursor preview when no selected units, without command selection).");
