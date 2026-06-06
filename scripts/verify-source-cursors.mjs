import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const sourceRoot = manifest.dataRoot;
const sourceUi = readFileSync(path.join(sourceRoot, "scripts/ui.lua"), "utf8");
const humanUi = readFileSync(path.join(sourceRoot, "scripts/human/ui_tales.lua"), "utf8");
const orcUi = readFileSync(path.join(sourceRoot, "scripts/orc/ui_pandora.lua"), "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const cursorSource = readFileSync("src/view/sourceCursor.ts", "utf8");
const syncSource = readFileSync("scripts/sync-wargus-assets.mjs", "utf8");
const typeSource = readFileSync("src/wargus/types.ts", "utf8");
const sourceMouse = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus/src/ui/mouse.cpp", "utf8");

const cursorAssets = [
  "ui/human/cursors/human_gauntlet.png",
  "ui/human/cursors/green_eagle.png",
  "ui/human/cursors/yellow_eagle.png",
  "ui/human/cursors/red_eagle.png",
  "ui/human/cursors/human_dont_click_here.png",
  "ui/orc/cursors/orcish_claw.png",
  "ui/orc/cursors/green_crosshairs.png",
  "ui/orc/cursors/yellow_crosshairs.png",
  "ui/orc/cursors/red_crosshairs.png",
  "ui/orc/cursors/orcish_dont_click_here.png",
  "ui/cursors/small_green_cross.png",
  "ui/cursors/cross.png",
  "ui/cursors/arrow_N.png",
  "ui/cursors/arrow_NE.png",
  "ui/cursors/arrow_E.png",
  "ui/cursors/arrow_SE.png",
  "ui/cursors/arrow_S.png",
  "ui/cursors/arrow_SW.png",
  "ui/cursors/arrow_W.png",
  "ui/cursors/arrow_NW.png"
];

const errors = [];
for (const fragment of [
  'Name = "cursor-cross"',
  'File = "ui/cursors/small_green_cross.png"',
  'Name = "cursor-scroll"',
  'File = "ui/cursors/cross.png"',
  'Name = "cursor-arrow-n"',
  'File = "ui/cursors/arrow_N.png"',
  'Name = "cursor-arrow-se"',
  'File = "ui/cursors/arrow_SE.png"'
]) {
  if (!sourceUi.includes(fragment)) {
    errors.push(`Source ui.lua missing cursor fragment: ${fragment}`);
  }
}

for (const fragment of [
  "GameCursor = UI.Cross.Cursor;",
  "CursorState = CursorStates::Rectangle;"
]) {
  if (!sourceMouse.includes(fragment)) {
    errors.push(`Stratagus rectangle-selection cursor source missing fragment: ${fragment}`);
  }
}

for (const [race, source, fragments] of [
  ["human", humanUi, [
    'Name = "cursor-point"',
    'File = "ui/human/cursors/human_gauntlet.png"',
    'Name = "cursor-green-hair"',
    'File = "ui/human/cursors/green_eagle.png"',
    'Name = "cursor-red-hair"',
    'File = "ui/human/cursors/red_eagle.png"'
  ]],
  ["orc", orcUi, [
    'Name = "cursor-point"',
    'File = "ui/orc/cursors/orcish_claw.png"',
    'Name = "cursor-green-hair"',
    'File = "ui/orc/cursors/green_crosshairs.png"',
    'Name = "cursor-red-hair"',
    'File = "ui/orc/cursors/red_crosshairs.png"'
  ]]
]) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      errors.push(`${race} source UI missing cursor fragment: ${fragment}`);
    }
  }
}

for (const asset of cursorAssets) {
  if (!syncSource.includes(asset)) {
    errors.push(`Asset sync missing cursor asset: ${asset}`);
  }
  if (!existsSync(path.join("public/wargus/graphics", asset))) {
    errors.push(`Missing synced cursor asset: public/wargus/graphics/${asset}`);
  }
}

if (manifest.counts?.cursors !== manifest.cursors?.length) {
  errors.push("Manifest cursor count does not match indexed cursor definitions.");
}

for (const [race, expected] of [
  ["human", {
    "cursor-blocked": ["ui/human/cursors/human_dont_click_here.png", 3, 2, 28, 32],
    "cursor-point": ["ui/human/cursors/human_gauntlet.png", 3, 2, 28, 32],
    "cursor-green-hair": ["ui/human/cursors/green_eagle.png", 15, 15, 32, 32],
    "cursor-yellow-hair": ["ui/human/cursors/yellow_eagle.png", 15, 15, 32, 32],
    "cursor-red-hair": ["ui/human/cursors/red_eagle.png", 15, 15, 32, 32]
  }],
  ["orc", {
    "cursor-blocked": ["ui/orc/cursors/orcish_dont_click_here.png", 3, 2, 26, 32],
    "cursor-point": ["ui/orc/cursors/orcish_claw.png", 3, 2, 26, 32],
    "cursor-green-hair": ["ui/orc/cursors/green_crosshairs.png", 15, 15, 32, 32],
    "cursor-yellow-hair": ["ui/orc/cursors/yellow_crosshairs.png", 15, 15, 32, 32],
    "cursor-red-hair": ["ui/orc/cursors/red_crosshairs.png", 15, 15, 32, 32]
  }]
]) {
  for (const [name, [file, hotX, hotY, width, height]] of Object.entries(expected)) {
    const cursor = manifest.cursors?.find((candidate) => candidate.race === race && candidate.name === name);
    if (!cursor) {
      errors.push(`Missing indexed source cursor: ${race} ${name}`);
      continue;
    }
    if (cursor.file !== file || cursor.hotSpot?.[0] !== hotX || cursor.hotSpot?.[1] !== hotY || cursor.size?.[0] !== width || cursor.size?.[1] !== height) {
      errors.push(`Indexed cursor metadata mismatch for ${race} ${name}.`);
    }
  }
}

const scrollCursor = manifest.cursors?.find((candidate) => candidate.race === "any" && candidate.name === "cursor-scroll" && candidate.file === "ui/cursors/cross.png");
if (!scrollCursor || scrollCursor.hotSpot?.[0] !== 15 || scrollCursor.hotSpot?.[1] !== 15 || scrollCursor.size?.[0] !== 32 || scrollCursor.size?.[1] !== 32) {
  errors.push("Missing indexed source cursor-scroll metadata from ui.lua.");
}

const crossCursor = manifest.cursors?.find((candidate) => candidate.race === "any" && candidate.name === "cursor-cross" && candidate.file === "ui/cursors/small_green_cross.png");
if (!crossCursor || crossCursor.hotSpot?.[0] !== 8 || crossCursor.hotSpot?.[1] !== 8 || crossCursor.size?.[0] !== 18 || crossCursor.size?.[1] !== 18) {
  errors.push("Missing indexed source cursor-cross metadata from ui.lua.");
}

for (const [name, file, hotX, hotY] of [
  ["cursor-arrow-n", "ui/cursors/arrow_N.png", 12, 2],
  ["cursor-arrow-ne", "ui/cursors/arrow_NE.png", 20, 2],
  ["cursor-arrow-e", "ui/cursors/arrow_E.png", 22, 10],
  ["cursor-arrow-se", "ui/cursors/arrow_SE.png", 20, 18],
  ["cursor-arrow-s", "ui/cursors/arrow_S.png", 12, 22],
  ["cursor-arrow-sw", "ui/cursors/arrow_SW.png", 2, 18],
  ["cursor-arrow-w", "ui/cursors/arrow_W.png", 4, 10],
  ["cursor-arrow-nw", "ui/cursors/arrow_NW.png", 2, 2]
]) {
  const cursor = manifest.cursors?.find((candidate) => candidate.race === "any" && candidate.name === name);
  if (!cursor || cursor.file !== file || cursor.hotSpot?.[0] !== hotX || cursor.hotSpot?.[1] !== hotY || cursor.size?.[0] !== 32 || cursor.size?.[1] !== 24) {
    errors.push(`Missing indexed source directional scroll cursor metadata: ${name}.`);
  }
}

for (const fragment of [
  "cursors?: WargusCursorDefinition[]",
  "export interface WargusCursorDefinition"
]) {
  if (!typeSource.includes(fragment)) {
    errors.push(`Cursor manifest type missing fragment: ${fragment}`);
  }
}

for (const fragment of [
  "updateSourceCursor()",
  "app.canvas.style.cursor = sourceCursorCssForWorldState({",
  "renderSourceSoftwareCursor()",
  "const cursorLayer = new Container()",
  "sourceCursorFileForState(renderState.cursor)",
  "Sprite.from(`/wargus/graphics/${file}`)",
  "edgeScrollActive: sourceEdgeScrollCursorActive()",
  "edgeScrollX: cameraInput.edgeX",
  "edgeScrollY: cameraInput.edgeY",
  "selectionDragActive: selectionDrag !== null",
  "function sourceEdgeScrollCursorActive(): boolean",
  "return cameraInput.edgeX !== 0 || cameraInput.edgeY !== 0;"
]) {
  if (!mainSource.includes(fragment)) {
    errors.push(`Runtime cursor handling missing fragment: ${fragment}`);
  }
}

for (const fragment of [
  "sourceCursorCssUrl(renderState.cursor, renderState.state, renderState.race)",
  "sourceCursorFileForState",
  "sourceCursorFileForState(cursor)",
  "return \"cursor-blocked\"",
  "sourceCursorDefinitionForState",
  "cursors?.find",
  "cursor.hotSpot[0]",
  "sourceCursorStateForPendingCommand",
  "command === \"move\" ? \"blocked\" : \"red\"",
  "sourceCursorCssForWorldState",
  "sourceCursorRenderStateForWorldState",
  "input.world?.engineSettings.hardwareCursorDefault === false",
  "edgeScrollActive?: boolean",
  "edgeScrollX?: number",
  "edgeScrollY?: number",
  "selectionDragActive?: boolean",
  "return \"cursor-scroll\"",
  "return \"cursor-cross\"",
  "return `cursor-${state}`",
  "if (!pendingWorldCommand && selectionDragActive)",
  "if (!pendingWorldCommand && edgeScrollActive)",
  "sourceCursorStateForEdgeScroll(edgeScrollX, edgeScrollY)",
  "export function sourceCursorStateForEdgeScroll(edgeX: number, edgeY: number): SourceCursorState",
  "return `arrow-${vertical}${horizontal}` as SourceCursorState",
  "pendingCommandIsValidAtPointer",
  "canSelectedIssuePendingWorldCommandAt"
]) {
  if (!cursorSource.includes(fragment)) {
    errors.push(`Runtime cursor handling missing fragment: ${fragment}`);
  }
}

if (!ordersSource.includes("export function canSelectedIssuePendingWorldCommandAt")) {
  errors.push("Runtime cursor handling missing simulation pending-command validity helper.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source cursor verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source cursors verified (Wargus cursor art synced and applied to browser command states).");
