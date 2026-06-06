import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const slots = manifest.engineSettings?.resourceUiSlots ?? [];
const required = ["gold", "wood", "oil", "food", "score", "workers"];
const failures = [];

for (const key of required) {
  const slot = slots.find((candidate) => candidate.key === key);
  if (!slot) {
    failures.push(`Missing indexed source resource UI slot: ${key}`);
    continue;
  }
  if (slot.hidden) {
    failures.push(`Source resource UI slot should be visible: ${key}`);
  }
  if (slot.frameWidth !== 14 || slot.frameHeight !== 14) {
    failures.push(`Source resource UI slot ${key} should preserve 14x14 CGraphic dimensions.`);
  }
  const assetPath = path.join("public/wargus/graphics", slot.graphic);
  if (!existsSync(assetPath)) {
    failures.push(`Missing browser resource UI asset for ${key}: ${assetPath}`);
  }
}

const gold = slots.find((slot) => slot.key === "gold");
const wood = slots.find((slot) => slot.key === "wood");
const oil = slots.find((slot) => slot.key === "oil");
const food = slots.find((slot) => slot.key === "food");
const score = slots.find((slot) => slot.key === "score");
const workers = slots.find((slot) => slot.key === "workers");
if (gold?.graphic !== "ui/gold,wood,oil,mana.png" || gold.frame !== 0) {
  failures.push("Gold UI slot should use source ui/gold,wood,oil,mana.png frame 0.");
}
if (wood?.graphic !== "ui/gold,wood,oil,mana.png" || wood.frame !== 1) {
  failures.push("Wood UI slot should use source ui/gold,wood,oil,mana.png frame 1.");
}
if (oil?.graphic !== "ui/gold,wood,oil,mana.png" || oil.frame !== 2) {
  failures.push("Oil UI slot should use source ui/gold,wood,oil,mana.png frame 2.");
}
if (food?.graphic !== "ui/food.png" || food.frame !== 0) {
  failures.push("Food UI slot should use source ui/food.png frame 0.");
}
if (score?.graphic !== "ui/score.png" || score.frame !== 0) {
  failures.push("Score UI slot should use source ui/score.png frame 0.");
}
if (workers?.graphic !== "ui/workers.png" || workers.frame !== 0) {
  failures.push("Workers UI slot should use source ui/workers.png frame 0.");
}

const loader = readFileSync("src/view/resourceUiAtlas.ts", "utf8");
if (!loader.includes("/wargus/graphics/${graphic}") || !loader.includes("new Rectangle(safeFrame * slot.frameWidth")) {
  failures.push("resourceUiAtlas must load and crop source resource UI graphics by manifest slot metadata.");
}

const hud = readFileSync("src/view/renderHud.ts", "utf8");
if (!hud.includes("getResourceUiTexture") || !hud.includes("world.engineSettings.resourceUiSlots") || !hud.includes("sourceTexture ??")) {
  failures.push("renderHud must consume source resource UI slots before falling back to browser icon stand-ins.");
}
for (const fragment of [
  "drawResourceStrip(hudLayer, frame, left + 18, 50, sideWidth - 36, manifest, world, visiblePlayer, supply, iconAtlas, resourceUiAtlas, wargusBitmapFontAtlas, onFreeWorkerPick)",
  "function drawResourceStrip",
  "onFreeWorkerPick: () => void",
  "[\"gold\", \"wood\", \"oil\", \"food\", \"score\", \"workers\"].includes(slot.key)",
  "sourceResourceCounterValue(world, player, supply, slot)",
  "sourceResultScoreForPlayer(world, player)",
  "sourceFreeWorkerCount(world",
  "addHudText(layer, bitmapFonts",
  "fontId: \"game\"",
  "sourceTextColorNumber(manifest, race, \"normal\", 0xf0df9a)",
  "resource.key === \"workers\" && Number(resource.value) > 0",
  "hitArea.eventMode = \"static\"",
  "hitArea.cursor = \"pointer\"",
  "hitArea.on(\"pointertap\", onFreeWorkerPick)"
]) {
  if (!hud.includes(fragment)) {
    failures.push(`renderHud missing source bitmap resource text fragment: ${fragment}`);
  }
}

const main = readFileSync("src/main.ts", "utf8");
for (const fragment of [
  "onFreeWorkerPick: () => {",
  "selectNextIdleWorker(world);",
  "findNextIdleWorker(loadedWorld, selectedUnitIds)",
  "centerCameraOnWorldPoint(loadedWorld, nextWorker.x, nextWorker.y)"
]) {
  if (!main.includes(fragment)) {
    failures.push(`main missing source free-worker click fragment: ${fragment}`);
  }
}

const sourceRoot = "/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src";
const mouseSource = readFileSync(path.join(sourceRoot, "ui/mouse.cpp"), "utf8");
const interfaceSource = readFileSync(path.join(sourceRoot, "ui/interface.cpp"), "utf8");
const mainScreenSource = readFileSync(path.join(sourceRoot, "ui/mainscr.cpp"), "utf8");
for (const fragment of [
  "UI.Resources[FreeWorkersCount].TextX != -1",
  "ButtonUnderCursor = ButtonUnderFreeWorkers",
  "UiFindIdleWorker();"
]) {
  if (!mouseSource.includes(fragment)) {
    failures.push(`Stratagus mouse source missing free-worker button fragment: ${fragment}`);
  }
}
for (const fragment of [
  "void UiFindIdleWorker()",
  "const auto &freeWorkers = ThisPlayer->GetFreeWorkers();",
  "SelectSingleUnit(*unit);",
  "UI.SelectedViewport->Center(unit->GetMapPixelPosCenter())"
]) {
  if (!interfaceSource.includes(fragment)) {
    failures.push(`Stratagus interface source missing idle-worker selection fragment: ${fragment}`);
  }
}
for (const fragment of [
  "UI.Resources[FreeWorkersCount].G->DrawFrameClip",
  "ThisPlayer->GetFreeWorkers().size()"
]) {
  if (!mainScreenSource.includes(fragment)) {
    failures.push(`Stratagus main screen source missing free-worker resource draw fragment: ${fragment}`);
  }
}

const helpers = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const indexer = readFileSync("scripts/index-wargus-data.mjs", "utf8");
for (const fragment of [
  "function parseResourceUiSlots(source, videoSize = sourceVideoSize())",
  "readResourceUiNumber(source, slotId, \"IconX\", 0, videoSize)",
  "function evaluateSourceNumberExpression(expression, fallback, videoSize = sourceVideoSize())",
  ".replace(/Video\\.Width/g, String(videoSize.width))",
  ".replace(/Video\\.Height/g, String(videoSize.height))",
  "resourceUiSlots: parseResourceUiSlots(uncommented, videoSize)"
]) {
  if (!indexer.includes(fragment)) {
    failures.push(`indexer missing source video-sized resource UI fragment: ${fragment}`);
  }
}
for (const fragment of [
  "export function sourceFreeWorkerCount",
  "const count = sourceFreeWorkerCount(world);",
  "[\"gold\", \"wood\", \"oil\", \"food\", \"score\", \"workers\"].includes(slot.key)"
]) {
  if (!helpers.includes(fragment)) {
    failures.push(`sourceUiHelpers missing source resource/worker fragment: ${fragment}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Verified ${required.length} source resource UI slots and browser assets.`);
