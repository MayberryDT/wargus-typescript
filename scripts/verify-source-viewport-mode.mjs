import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const sourceUi = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const renderHud = readFileSync("src/view/renderHud.ts", "utf8");
const renderOverlays = readFileSync("src/view/renderOverlays.ts", "utf8");
const renderWorld = readFileSync("src/view/renderWorld.ts", "utf8");
const mapCommands = readFileSync("src/view/mapCommands.ts", "utf8");
const main = readFileSync("src/main.ts", "utf8");
const saveGame = readFileSync("src/wargus/saveGame.ts", "utf8");
const readme = readFileSync("README.md", "utf8");
const stratagusUi = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus/src/ui/ui.cpp", "utf8");
const stratagusHeader = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus/src/include/ui.h", "utf8");

const errors = [];
function expect(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

expect(manifest.engineSettings?.viewportModeDefault === 0, `Manifest should preserve Wargus ViewportMode=0, found ${manifest.engineSettings?.viewportModeDefault}.`);

for (const fragment of [
  "VIEWPORT_SINGLE = 0",
  "VIEWPORT_SPLIT_HORIZ",
  "VIEWPORT_SPLIT_HORIZ3",
  "VIEWPORT_SPLIT_VERT",
  "VIEWPORT_QUAD"
]) {
  expect(stratagusHeader.includes(fragment), `Stratagus viewport enum missing fragment: ${fragment}`);
}

for (const fragment of [
  "static void SetViewportModeSplitHoriz()",
  "static void SetViewportModeSplitHoriz3()",
  "static void SetViewportModeSplitVert()",
  "static void SetViewportModeQuad()",
  "void CycleViewportMode(int step)"
]) {
  expect(stratagusUi.includes(fragment), `Stratagus viewport implementation missing fragment: ${fragment}`);
}

for (const fragment of [
  "export function sourceViewportModeRects",
  "export function sourceViewportWorldRects",
  "export function sourceWorldPointForViewportScreenPoint",
  "export function sourceViewportScreenPoint",
  "export interface SourceViewportScreenPoint",
  "export function sourceScreenPointIsInViewport",
  "export function sourceScreenPointForViewportWorldPoint",
  "export function sourceViewportModeLabel",
  "export function nextSourceViewportMode",
  "case 1:",
  "case 2:",
  "case 3:",
  "case 4:",
  "return (sourceViewportModeNumber(mode) + step + 5) % 5",
  "world.engineSettings.viewportModeDefault",
  "findIndex((rect) => screenX >= rect.x && screenY >= rect.y",
  "worldPoint:",
  "viewport.x + (worldX - camera.x) * camera.zoom",
  "Viewport: ${sourceViewportModeLabel(world.engineSettings.viewportModeDefault)}",
  "{ label: \"Viewport\", command: \"cycle-viewport-mode\" }"
]) {
  expect(sourceUi.includes(fragment), `sourceUiHelpers missing viewport-mode fragment: ${fragment}`);
}

for (const fragment of [
  "sourceViewportModeRects",
  "sourceViewportWorldRects",
  "drawSourceViewportModeOverlay(frame, world, app.screen.width, app.screen.height, activeSourceViewportIndex)",
  "function drawSourceViewportModeOverlay",
  "activeSourceViewportIndex: number",
  "sourceViewportCameras: readonly Camera[]",
  "index === activeIndex ? 3 : 2",
  "sourceViewportWorldRects(world, camera, screenWidth, screenHeight, sourceViewportCameras)",
  "const viewCamera = sourceViewportCameras[index] ?? camera",
  "if (rects.length <= 1)",
  "graphics.stroke({ width: index === activeIndex ? 3 : 2",
  "\"cycle-viewport-mode\""
]) {
  expect(renderHud.includes(fragment), `renderHud missing viewport-mode fragment: ${fragment}`);
}

for (const fragment of [
  "sourceViewportModeRects",
  "sourceViewportPaneRenderers",
  "interface SourceViewportPaneRenderer",
  "const sourceViewportRects = sourceViewportModeRects(world, app.screen.width, app.screen.height)",
  "const activeSourceViewportRect = sourceViewportRects[activeSourceViewportIndex]",
  "applySourceMapAreaMask(app, worldLayer, activeSourceViewportRect)",
  "worldLayer.position.set(activeSourceViewportRect.x - camera.x * camera.zoom, activeSourceViewportRect.y - camera.y * camera.zoom)",
  "const viewport = worldViewportForRect(camera, activeSourceViewportRect)",
  "function renderSourceViewportPaneWorlds",
  "sourceViewportRects: ReturnType<typeof sourceViewportModeRects>",
  "function ensureSourceViewportPaneRenderers",
  "sourceViewportCameras?: readonly Camera[]",
  "activeSourceViewportIndex?: number",
  "if (index === activeSourceViewportIndex)",
  "renderer.root.position.set(rect.x - viewCamera.x * viewCamera.zoom, rect.y - viewCamera.y * viewCamera.zoom)",
  "renderer.mask.rect(rect.x, rect.y, rect.width, rect.height)",
  "drawMap(renderer.mapLayer, world, tileAtlas, viewport)",
  "drawFog(renderer.fogLayer, world, viewport, fogAtlas)",
  "function worldViewportForRect"
]) {
  expect(renderWorld.includes(fragment), `renderWorld missing source viewport pane fragment: ${fragment}`);
}

for (const fragment of [
  "sourceScreenPointForViewportWorldPoint",
  "screenWidth: number",
  "screenHeight: number",
  "screenPointForWorld(world, camera, screenWidth, screenHeight",
  "activeSourceViewportIndex: number",
  "sourceScreenPointForViewportWorldPoint(world, camera, screenWidth, screenHeight, x, y, activeSourceViewportIndex)",
  "renderSelectionDragOverlay({ layer: overlayLayer, camera, world, screenWidth: app.screen.width, screenHeight: app.screen.height, activeSourceViewportIndex }",
  "renderBuildPlacementOverlay({ layer: overlayLayer, camera, world, screenWidth: app.screen.width, screenHeight: app.screen.height, activeSourceViewportIndex",
  "renderPendingCommandOverlay({ layer: overlayLayer, camera, world, screenWidth: app.screen.width, screenHeight: app.screen.height, activeSourceViewportIndex",
  "renderAlertPingOverlays({ layer: overlayLayer, camera, world, screenWidth: app.screen.width, screenHeight: app.screen.height, activeSourceViewportIndex }"
]) {
  expect(renderOverlays.includes(fragment) || main.includes(fragment), `viewport overlay projection missing fragment: ${fragment}`);
}

expect(!renderOverlays.includes("x: (x - camera.x) * camera.zoom"), "renderOverlays should not use raw global camera projection.");

for (const fragment of [
  "sourceViewportScreenPoint",
  "function worldPointForScreenPosition",
  "function viewportPointForScreenPosition",
  "const probe = sourceViewportScreenPoint(world, camera, app.screen.width, app.screen.height, screenX, screenY)",
  "const viewCamera = sourceViewportCameras[probe.index] ?? camera",
  "const sourceViewportCameras",
  "sourceViewportCameras,",
  "activateSourceViewport(point.index)",
  "activateSourceViewport(viewportPoint.index)",
  "function activateSourceViewport",
  "function resetSourceViewportCameras",
  "function persistActiveSourceViewportCamera",
  "function restoreActiveSourceViewportCamera",
  "function restoreLoadedSourceViewportCameras",
  "sourceViewportCameras[activeSourceViewportIndex]",
  "sourceViewportState:",
  "sourceViewportCameras, activeSourceViewportIndex",
  "resetSourceViewportCameras();",
  "worldPointForScreenPosition(pointerScreenPosition.x, pointerScreenPosition.y)",
  "sourceScreenPointIsInPlayableViewport(event.clientX, event.clientY)",
  "function sourceScreenPointIsInPlayableViewport",
  "sourceScreenPointIsInViewport(world, app.screen.width, app.screen.height, screenX, screenY)",
  "handleWorldPointerDown(world, point.worldPoint.x, point.worldPoint.y",
  "pointerWorldPosition = pointerScreenPosition ? worldPointForScreenPosition"
]) {
  expect(main.includes(fragment), `main missing viewport pointer fragment: ${fragment}`);
}

expect(
  /import\s*\{[^}]*\bnextSourceViewportMode\b[^}]*\}\s*from\s*"\.\/sourceUiHelpers"/s.test(mapCommands),
  "mapCommands missing viewport-mode import for nextSourceViewportMode from sourceUiHelpers"
);

for (const fragment of [
  "if (command === \"cycle-viewport-mode\")",
  "viewportModeDefault = nextSourceViewportMode(context.world.engineSettings.viewportModeDefault)"
]) {
  expect(mapCommands.includes(fragment), `mapCommands missing viewport-mode fragment: ${fragment}`);
}

for (const fragment of [
  "| \"viewportModeDefault\"",
  "viewportModeDefault: world.engineSettings.viewportModeDefault",
  "activeSourceViewportIndex: normalizeSourceViewportIndex(save.activeSourceViewportIndex, sourceViewportCameras.length)",
  "sourceViewportCameras?: Array<{ x: number; y: number; zoom: number }>",
  "world.engineSettings.viewportModeDefault = sourceViewportModeOr",
  "function sourceViewportModeOr"
]) {
  expect(saveGame.includes(fragment), `saveGame missing viewport-mode persistence fragment: ${fragment}`);
}

expect(readme.includes("ViewportMode") && readme.includes("source viewport split geometry"), "README should document browser source ViewportMode support.");

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source viewport mode verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source viewport mode verified (Stratagus enum/cycling semantics, browser overlay, Preferences, and save/load).");
