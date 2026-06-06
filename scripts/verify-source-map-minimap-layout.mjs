import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const dataRoot = manifest.dataRoot;
const humanUiSource = readFileSync(path.join(dataRoot, "scripts/human/ui_pandora.lua"), "utf8");
const orcUiSource = readFileSync(path.join(dataRoot, "scripts/orc/ui_pandora.lua"), "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const cameraSource = readFileSync("src/view/camera.ts", "utf8");
const renderWorldSource = readFileSync("src/view/renderWorld.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");

const errors = [];
const expectedMapArea = { x: 176, y: 16, rightMargin: 17, bottomMargin: 17, baseWidth: 640, baseHeight: 480 };
const expectedMinimap = { x: 24, y: 26, width: 128, height: 128 };

for (const [name, source] of [["human UI", humanUiSource], ["orc UI", orcUiSource]]) {
  for (const fragment of [
    "UI.MapArea.X = 176",
    "UI.MapArea.Y = 16",
    "UI.MapArea.EndX = Video.Width - 16 - 1",
    "UI.MapArea.EndY = Video.Height - 16 - 1",
    "UI.Minimap.X = 24",
    "UI.Minimap.Y = 24 + 2",
    "UI.Minimap.W = 128",
    "UI.Minimap.H = 128"
  ]) {
    if (!source.includes(fragment)) {
      errors.push(`${name} missing map/minimap fragment: ${fragment}`);
    }
  }
}

if (JSON.stringify(manifest.engineSettings.mapArea) !== JSON.stringify(expectedMapArea)) {
  errors.push(`Manifest mapArea is ${JSON.stringify(manifest.engineSettings.mapArea)}, expected ${JSON.stringify(expectedMapArea)}`);
}
if (JSON.stringify(manifest.engineSettings.minimap) !== JSON.stringify(expectedMinimap)) {
  errors.push(`Manifest minimap is ${JSON.stringify(manifest.engineSettings.minimap)}, expected ${JSON.stringify(expectedMinimap)}`);
}

for (const [name, source, fragments] of [
  ["indexer", indexSource, [
    "const videoSize = sourceVideoSize(videoWidthDefault, videoHeightDefault)",
    "function parseUiMapArea(source, videoSize = sourceVideoSize())",
    "function parseUiMinimap(source, videoSize = sourceVideoSize())",
    "baseWidth: videoSize.width",
    "baseHeight: videoSize.height",
    "mapArea: parseUiMapArea(uncommented, videoSize)",
    "minimap: parseUiMinimap(uncommented, videoSize)",
    "engineSettings.mapArea ??= parsedEngineSettings.mapArea",
    "engineSettings.minimap ??= parsedEngineSettings.minimap"
  ]],
  ["types", typesSource, [
    "mapArea: WargusMapAreaLayout | null",
    "minimap: WargusMinimapLayout | null",
    "export interface WargusMapAreaLayout",
    "export interface WargusMinimapLayout"
  ]],
  ["world defaults", worldSource, [
    "mapArea:",
    "rightMargin: 17",
    "minimap:",
    "width: 128"
  ]],
  ["HUD render", hudSource, [
    "sourceMinimapLayout(world, left, sideWidth, app.screen.height)",
    "sourceMapViewportSize(world, app.screen.width, app.screen.height, sideWidth)",
    "drawMinimap(hudLayer, frame, minimapLayout.x",
    "graphics.fill({ color: minimapColorForPlayer(world, building.player), alpha: 0.58 })",
    "const color = minimapTerrainColorForTile(world, tile)",
    "function minimapTerrainColorForTile",
    "function minimapColorForPlayer",
    "return sourcePlayerColor(world, playerId)"
  ]],
  ["source UI helpers", sourceUiHelpersSource, [
    "export function sourceMapAreaRect",
    "export function sourceMinimapLayout",
    "export function sourceMapViewportSize",
    "export function sourcePlayerColor",
    "export function rgbToHex",
    "export function fogByteToAlpha",
    "sourcePlayableViewportSize({ width: screenWidth, height: screenHeight }, world)",
    "world.engineSettings.minimap",
    "world.engineSettings.playerColors",
    "world.engineSettings.playerColorIndex?.count"
  ]],
  ["camera", cameraSource, [
    "export function playableCameraViewport(screen: ScreenSize, world: WorldState | null = null): CameraViewport",
    "export function currentPlayableWorldBounds(camera: Camera, screen: ScreenSize, world: WorldState | null = null)",
    "export function sourcePlayableViewportSize(screen: ScreenSize, world: WorldState | null): CameraViewport",
    "world?.engineSettings.mapArea",
    "screen.width - source.x * scaleX - source.rightMargin * scaleX",
    "screen.height - source.y * scaleY - source.bottomMargin * scaleY"
  ]],
  ["world render", renderWorldSource, [
    "import type { Camera } from \"./camera\"",
    "sourceMapAreaRect",
    "const worldLayerMasks = new WeakMap<Container, Graphics>()",
    "worldLayer.position.set(activeSourceViewportRect.x - camera.x * camera.zoom, activeSourceViewportRect.y - camera.y * camera.zoom)",
    "applySourceMapAreaMask(app, worldLayer, activeSourceViewportRect)",
    "worldLayer.mask = mask",
    "sourcePlayerColor(world, unit.player, 0, [214, 208, 163])",
    "fogByteToAlpha(world.engineSettings.fogOfWarOpacityLevels",
    "const viewport = worldViewportForRect(camera, activeSourceViewportRect)"
  ]],
  ["main camera wiring", mainSource, [
    "return playableCameraViewportBase(app.screen, world)",
    "return currentPlayableWorldBoundsBase(camera, app.screen, world)",
    "sourceMapAreaLocalScreenPoint",
    "zoomCameraAtScreenPointBase(camera, point.x, point.y, deltaZoom)",
    "updateCameraEdgeScroll(cameraInput, point.x, point.y"
  ]]
]) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      errors.push(`${name} missing fragment: ${fragment}`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source map/minimap layout verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source map/minimap layout verified (Pandora UI map area and minimap geometry indexed and rendered).");
