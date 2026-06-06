import { Application, BlurFilter, Container, Graphics, Sprite, Text } from "pixi.js";
import { isTilePassable } from "../simulation/passability";
import { sourceControlGroupNumberForUnit, sourceDeclaredReactionRangeForUnit } from "../simulation/orders";
import { isCircleVisibleToPlayer, isInvisibleUtilityUnit, isRuntimeSourceBuildingUnit, isUnitFootprintVisibleToPlayer, isUnitHiddenInConstruction, isUnitInsideResourceSource, isUnitVisibleToPlayer, isWorldTileSourceKnown, sourceDefaultGameSpeed, unitFootprintHalfSize, type WorldState } from "../simulation/world";
import { sourceButtonAppliesTo } from "../wargus/buttons";
import { isFixedBrowserDemoMap } from "../wargus/demoScenario";
import type { WargusAnimation, WargusDecoration, WargusManifest } from "../wargus/types";
import type { Camera } from "./camera";
import { getFrameTexture, type UnitTextureAtlas } from "./unitTextureAtlas";
import { getFogTexture, type FogTextureAtlas } from "./fogTextureAtlas";
import { getTileTexture, type TileTextureAtlas } from "./tileTextureAtlas";
import { getMissileFrameTexture, type MissileTextureAtlas } from "./missileTextureAtlas";
import { sourceCorpseAgeTicks } from "./sourceCorpseRendering";
import { sourceMissileVisualRole } from "./sourceMissileVisuals";
import { sourceSelectedOrderRenderState } from "./sourceSelectedOrders";
import { getStatusBarTexture, getStatusDecorationTexture, type StatusDecorationAtlas } from "./statusDecorationAtlas";
import { fogByteToAlpha, sourceCompletedBarColor, sourceCompletedBarShadow, sourceMapAreaRect, sourcePlayerColor, sourceViewportModeRects } from "./sourceUiHelpers";

const mapRenderKeys = new WeakMap<Container, string>();
const fogRenderKeys = new WeakMap<Container, string>();
const selectionHitAreaKeys = new WeakMap<Container, string>();
const worldLayerMasks = new WeakMap<Container, Graphics>();
const sourceViewportPaneRenderers = new WeakMap<Container, SourceViewportPaneRenderer[]>();
const tileAtlasIds = new WeakMap<TileTextureAtlas, number>();
const sourceFogBlurFilters = new WeakMap<Container, BlurFilter>();
let nextTileAtlasId = 1;
const sourceTiledFogTable = [0, 11, 10, 2, 13, 6, 14, 3, 12, 15, 4, 1, 8, 9, 7, 0] as const;

interface WorldViewport {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface RenderWorldArgs {
  world: WorldState;
  manifest: WargusManifest;
  camera: Camera;
  app: Application;
  worldLayer: Container;
  mapLayer: Container;
  unitLayer: Container;
  fogLayer: Container;
  selectionLayer: Container;
  selectedUnitIds: string[];
  controlGroups?: Record<number, string[]>;
  sourceShowOrdersVisible?: boolean;
  unitAtlases: Map<string, UnitTextureAtlas>;
  missileAtlases: Map<string, MissileTextureAtlas>;
  statusDecorationAtlas: StatusDecorationAtlas | null;
  tileAtlas: TileTextureAtlas | null;
  fogAtlas: FogTextureAtlas | null;
  sourceViewportCameras?: readonly Camera[];
  activeSourceViewportIndex?: number;
  renderDeltaSeconds?: number;
}

export function renderWorld(args: RenderWorldArgs): void {
  const { world, manifest, camera, app, worldLayer, mapLayer, unitLayer, fogLayer, selectionLayer, selectedUnitIds, controlGroups = {}, sourceShowOrdersVisible = false, unitAtlases, missileAtlases, statusDecorationAtlas, tileAtlas, fogAtlas, sourceViewportCameras = [], activeSourceViewportIndex = 0, renderDeltaSeconds = 1 / 60 } = args;
  updateUnitVisualStates(world, renderDeltaSeconds);
  const mapArea = sourceMapAreaRect(world, app.screen.width, app.screen.height);
  const sourceViewportRects = sourceViewportModeRects(world, app.screen.width, app.screen.height);
  const activeSourceViewportRect = sourceViewportRects[activeSourceViewportIndex] ?? sourceViewportRects[0] ?? mapArea;
  worldLayer.scale.set(camera.zoom);
  worldLayer.position.set(activeSourceViewportRect.x - camera.x * camera.zoom, activeSourceViewportRect.y - camera.y * camera.zoom);
  applySourceMapAreaMask(app, worldLayer, activeSourceViewportRect);
  const viewport = worldViewportForRect(camera, activeSourceViewportRect);

  drawMap(mapLayer, world, tileAtlas, viewport);
  unitLayer.removeChildren();
  drawCorpses(unitLayer, world, manifest, unitAtlases, viewport, { maxDrawLevel: 39 });
  drawLastSeenBuildings(unitLayer, world, manifest, unitAtlases, viewport, { maxDrawLevel: 39 });
  drawProjectiles(unitLayer, world, viewport, missileAtlases, { maxDrawLevel: 39 });
  drawSpellEffects(unitLayer, world, viewport, missileAtlases, { maxDrawLevel: 39 });
  drawUnits(unitLayer, world, manifest, selectedUnitIds, controlGroups, sourceShowOrdersVisible, unitAtlases, missileAtlases, statusDecorationAtlas, viewport);
  drawLastSeenBuildings(unitLayer, world, manifest, unitAtlases, viewport, { minDrawLevel: 40 });
  drawCorpses(unitLayer, world, manifest, unitAtlases, viewport, { minDrawLevel: 40 });
  drawProjectiles(unitLayer, world, viewport, missileAtlases, { minDrawLevel: 40 });
  drawSpellEffects(unitLayer, world, viewport, missileAtlases, { minDrawLevel: 40 });
  drawFog(fogLayer, world, viewport, fogAtlas);
  drawSelectionHitArea(selectionLayer, world);
  renderSourceViewportPaneWorlds({ ...args, sourceViewportCameras, activeSourceViewportIndex, sourceViewportRects });
}

type UnitVisualState = {
  x: number;
  y: number;
};

const unitVisualStates = new WeakMap<WorldState, Map<string, UnitVisualState>>();

export function visualWorldPointForUnit(world: WorldState | null, unit: WorldState["units"][number] | null): { x: number; y: number } | null {
  if (!world || !unit) {
    return null;
  }
  const visual = unitVisualStates.get(world)?.get(unit.id);
  return visual ? { x: visual.x, y: visual.y } : { x: unit.x, y: unit.y };
}

function updateUnitVisualStates(world: WorldState, renderDeltaSeconds: number): void {
  const states = ensureUnitVisualStates(world);
  const liveUnitIds = new Set<string>();
  const deltaSeconds = Math.max(1 / 120, Math.min(0.25, renderDeltaSeconds));
  for (const unit of world.units) {
    liveUnitIds.add(unit.id);
    const existing = states.get(unit.id);
    if (!existing || shouldSnapUnitVisual(world, unit, existing)) {
      states.set(unit.id, { x: unit.x, y: unit.y });
      continue;
    }
    const dx = unit.x - existing.x;
    const dy = unit.y - existing.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.01) {
      existing.x = unit.x;
      existing.y = unit.y;
      continue;
    }
    const maxStep = sourceVisualCatchupPixels(unit, deltaSeconds);
    const step = Math.min(distance, maxStep);
    existing.x += (dx / distance) * step;
    existing.y += (dy / distance) * step;
  }
  for (const unitId of states.keys()) {
    if (!liveUnitIds.has(unitId)) {
      states.delete(unitId);
    }
  }
}

function ensureUnitVisualStates(world: WorldState): Map<string, UnitVisualState> {
  let states = unitVisualStates.get(world);
  if (!states) {
    states = new Map();
    unitVisualStates.set(world, states);
  }
  return states;
}

function shouldSnapUnitVisual(world: WorldState, unit: WorldState["units"][number], visual: UnitVisualState): boolean {
  if (!Number.isFinite(visual.x) || !Number.isFinite(visual.y) || unit.hitPoints <= 0 || unit.speed <= 0 || isRuntimeSourceBuildingUnit(unit)) {
    return true;
  }
  const distance = Math.hypot(unit.x - visual.x, unit.y - visual.y);
  return distance > Math.max(world.tileSize * 6, unit.radius * 10);
}

function sourceVisualCatchupPixels(unit: WorldState["units"][number], deltaSeconds: number): number {
  const sourceSpeed = Math.max(48, unit.speed || unit.baseSpeed || 0);
  return Math.max(0.75, Math.min(28, sourceSpeed * deltaSeconds * 1.6));
}

function visualUnitForRender(unit: WorldState["units"][number], world: WorldState): WorldState["units"][number] {
  const visual = visualWorldPointForUnit(world, unit);
  if (!visual || (Math.abs(visual.x - unit.x) < 0.01 && Math.abs(visual.y - unit.y) < 0.01)) {
    return unit;
  }
  return { ...unit, x: visual.x, y: visual.y };
}

interface SourceViewportPaneRenderer {
  root: Container;
  mapLayer: Container;
  unitLayer: Container;
  fogLayer: Container;
  mask: Graphics;
}

function renderSourceViewportPaneWorlds(args: RenderWorldArgs & { sourceViewportCameras: readonly Camera[]; activeSourceViewportIndex: number; sourceViewportRects: ReturnType<typeof sourceViewportModeRects> }): void {
  const { world, manifest, app, worldLayer, selectedUnitIds, unitAtlases, missileAtlases, statusDecorationAtlas, tileAtlas, fogAtlas, sourceViewportCameras, activeSourceViewportIndex, sourceViewportRects: rects } = args;
  const renderers = ensureSourceViewportPaneRenderers(app, worldLayer, Math.max(0, rects.length - 1));
  let rendererIndex = 0;
  for (let index = 0; index < rects.length; index += 1) {
    if (index === activeSourceViewportIndex) {
      continue;
    }
    const rect = rects[index];
    const renderer = renderers[rendererIndex];
    rendererIndex += 1;
    if (!rect || !renderer) {
      continue;
    }
    const viewCamera = sourceViewportCameras[index] ?? args.camera;
    renderer.root.visible = true;
    renderer.root.scale.set(viewCamera.zoom);
    renderer.root.position.set(rect.x - viewCamera.x * viewCamera.zoom, rect.y - viewCamera.y * viewCamera.zoom);
    renderer.mask.clear();
    renderer.mask.rect(rect.x, rect.y, rect.width, rect.height);
    renderer.mask.fill({ color: 0xffffff, alpha: 1 });
    renderer.root.mask = renderer.mask;
    const viewport = worldViewportForRect(viewCamera, rect);
    drawMap(renderer.mapLayer, world, tileAtlas, viewport);
    renderer.unitLayer.removeChildren();
    drawCorpses(renderer.unitLayer, world, manifest, unitAtlases, viewport, { maxDrawLevel: 39 });
    drawLastSeenBuildings(renderer.unitLayer, world, manifest, unitAtlases, viewport, { maxDrawLevel: 39 });
    drawProjectiles(renderer.unitLayer, world, viewport, missileAtlases, { maxDrawLevel: 39 });
    drawSpellEffects(renderer.unitLayer, world, viewport, missileAtlases, { maxDrawLevel: 39 });
    drawUnits(renderer.unitLayer, world, manifest, selectedUnitIds, args.controlGroups ?? {}, args.sourceShowOrdersVisible === true, unitAtlases, missileAtlases, statusDecorationAtlas, viewport);
    drawLastSeenBuildings(renderer.unitLayer, world, manifest, unitAtlases, viewport, { minDrawLevel: 40 });
    drawCorpses(renderer.unitLayer, world, manifest, unitAtlases, viewport, { minDrawLevel: 40 });
    drawProjectiles(renderer.unitLayer, world, viewport, missileAtlases, { minDrawLevel: 40 });
    drawSpellEffects(renderer.unitLayer, world, viewport, missileAtlases, { minDrawLevel: 40 });
    drawFog(renderer.fogLayer, world, viewport, fogAtlas);
  }
  for (; rendererIndex < renderers.length; rendererIndex += 1) {
    renderers[rendererIndex].root.visible = false;
  }
}

function ensureSourceViewportPaneRenderers(app: Application, worldLayer: Container, count: number): SourceViewportPaneRenderer[] {
  let renderers = sourceViewportPaneRenderers.get(worldLayer);
  if (!renderers) {
    renderers = [];
    sourceViewportPaneRenderers.set(worldLayer, renderers);
  }
  while (renderers.length < count) {
    const root = new Container();
    const mapLayer = new Container();
    const unitLayer = new Container();
    const fogLayer = new Container();
    const mask = new Graphics();
    root.addChild(mapLayer, unitLayer, fogLayer);
    app.stage.addChildAt(root, Math.min(app.stage.children.length, app.stage.getChildIndex(worldLayer) + 1 + renderers.length));
    app.stage.addChildAt(mask, Math.min(app.stage.children.length, app.stage.getChildIndex(root)));
    renderers.push({ root, mapLayer, unitLayer, fogLayer, mask });
  }
  return renderers;
}

function applySourceMapAreaMask(app: Application, worldLayer: Container, mapArea: { x: number; y: number; width: number; height: number }): void {
  let mask = worldLayerMasks.get(worldLayer);
  if (!mask) {
    mask = new Graphics();
    worldLayerMasks.set(worldLayer, mask);
  }
  if (mask.parent !== app.stage) {
    app.stage.addChildAt(mask, 0);
  }
  mask.clear();
  mask.rect(mapArea.x, mapArea.y, mapArea.width, mapArea.height);
  mask.fill({ color: 0xffffff, alpha: 1 });
  worldLayer.mask = mask;
}

function worldViewportForRect(camera: Camera, rect: { width: number; height: number }): WorldViewport {
  const padding = 192 / camera.zoom;
  return {
    left: camera.x - padding,
    top: camera.y - padding,
    right: camera.x + rect.width / camera.zoom + padding,
    bottom: camera.y + rect.height / camera.zoom + padding
  };
}

function drawMap(layer: Container, world: WorldState, tileAtlas: TileTextureAtlas | null, viewport: WorldViewport): void {
  const bounds = mapTileRenderBounds(world, viewport);
  const key = mapRenderKey(world, tileAtlas, bounds);
  if (!shouldCacheMapLayer() && layer.isCachedAsTexture) {
    layer.cacheAsTexture(false);
  }
  if (mapRenderKeys.get(layer) === key) {
    return;
  }
  mapRenderKeys.set(layer, key);
  if (layer.isCachedAsTexture) {
    layer.cacheAsTexture(false);
  }
  destroyLayerChildren(layer);
  const baseGraphics = new Graphics();
  const overlayGraphics = new Graphics();
  const useTileSprites = tileAtlas;
  layer.addChild(baseGraphics);
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const tile = world.tiles[y * world.map.width + x] ?? 1;
      baseGraphics.rect(x * world.tileSize, y * world.tileSize, world.tileSize, world.tileSize);
      baseGraphics.fill(colorForTile(world, tile));
      const tileTexture = useTileSprites ? getTileTexture(tileAtlas, tile) : null;
      if (tileTexture) {
        const sprite = new Sprite(tileTexture);
        sprite.position.set(x * world.tileSize, y * world.tileSize);
        layer.addChild(sprite);
        continue;
      }
    }
  }

  const drewOverlayGraphics = [
    drawSourceColorCycleOverlay(overlayGraphics, world),
    drawSourcePassabilityOverlay(overlayGraphics, world),
    drawSourceMapGrid(overlayGraphics, world)
  ].some(Boolean);
  if (drewOverlayGraphics) {
    layer.addChild(overlayGraphics);
  }
  if (shouldCacheMapLayer()) {
    layer.cacheAsTexture({ resolution: 1, antialias: false, scaleMode: "nearest" });
  }
}

interface MapTileRenderBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function mapRenderKey(world: WorldState, tileAtlas: TileTextureAtlas | null, bounds: MapTileRenderBounds): string {
  const atlasId = tileAtlas ? idForTileAtlas(tileAtlas) : 0;
  return `${world.map.path}:${world.map.width}x${world.map.height}:${bounds.minX},${bounds.minY},${bounds.maxX},${bounds.maxY}:${world.terrainVersion}:${world.tilesetTerrain?.name ?? "none"}:${atlasId}:${world.engineSettings.mapGridDefault ? 1 : 0}:${world.engineSettings.highlightPassabilityDefault ? 1 : 0}:${sourceColorCyclePhase(world)}`;
}

function mapTileRenderBounds(world: WorldState, viewport: WorldViewport): MapTileRenderBounds {
  if (!shouldRenderViewportBoundedMap(world)) {
    return {
      minX: 0,
      minY: 0,
      maxX: Math.max(0, world.map.width - 1),
      maxY: Math.max(0, world.map.height - 1)
    };
  }
  const paddingTiles = 6;
  const chunkTiles = 4;
  const visibleMinX = Math.floor(viewport.left / world.tileSize);
  const visibleMinY = Math.floor(viewport.top / world.tileSize);
  const visibleMaxX = Math.ceil(viewport.right / world.tileSize);
  const visibleMaxY = Math.ceil(viewport.bottom / world.tileSize);
  return {
    minX: Math.max(0, Math.floor((visibleMinX - paddingTiles) / chunkTiles) * chunkTiles),
    minY: Math.max(0, Math.floor((visibleMinY - paddingTiles) / chunkTiles) * chunkTiles),
    maxX: Math.min(world.map.width - 1, Math.ceil((visibleMaxX + paddingTiles) / chunkTiles) * chunkTiles + chunkTiles - 1),
    maxY: Math.min(world.map.height - 1, Math.ceil((visibleMaxY + paddingTiles) / chunkTiles) * chunkTiles + chunkTiles - 1)
  };
}

function sourceColorCyclePhase(world: WorldState): number {
  if (isFixedBrowserDemoMap(world.map)) {
    return 0;
  }
  const ranges = world.tilesetTerrain?.colorCycleRanges ?? [];
  if (world.tilesetTerrain?.colorCycleAll !== true || ranges.length === 0) {
    return 0;
  }
  const longestRange = ranges.reduce((longest, range) => Math.max(longest, Math.abs(range.end - range.start) + 1), 1);
  return Math.floor(world.tick / 8) % Math.max(1, longestRange);
}

function drawSourceColorCycleOverlay(graphics: Graphics, world: WorldState): boolean {
  if (isFixedBrowserDemoMap(world.map)) {
    return false;
  }
  const ranges = world.tilesetTerrain?.colorCycleRanges ?? [];
  if (world.tilesetTerrain?.colorCycleAll !== true || ranges.length === 0) {
    return false;
  }
  let drewOverlay = false;
  const phase = sourceColorCyclePhase(world);
  for (let y = 0; y < world.map.height; y += 1) {
    for (let x = 0; x < world.map.width; x += 1) {
      const tile = world.tiles[y * world.map.width + x] ?? 1;
      const flags = sourceTilesetFlagsForTile(world, tile);
      if (!flags.includes("water") && !flags.includes("coast")) {
        continue;
      }
      const range = sourceColorCycleRangeForFlags(ranges, flags);
      const rangeLength = Math.max(1, Math.abs((range.end ?? 0) - (range.start ?? 0)) + 1);
      const pulse = (phase % rangeLength) / rangeLength;
      const alpha = 0.05 + pulse * 0.05;
      graphics.rect(x * world.tileSize, y * world.tileSize, world.tileSize, world.tileSize);
      graphics.fill({ color: flags.includes("water") ? 0x77c7d9 : 0xd6c37a, alpha: flags.includes("water") ? alpha : alpha * 0.55 });
      drewOverlay = true;
    }
  }
  return drewOverlay;
}

function sourceColorCycleRangeForFlags<T>(ranges: T[], flags: string[]): T {
  return flags.includes("coast") && !flags.includes("water") ? ranges[1] ?? ranges[0] : ranges[0];
}

function drawSourcePassabilityOverlay(graphics: Graphics, world: WorldState): boolean {
  if (!world.engineSettings.highlightPassabilityDefault) {
    return false;
  }
  for (let y = 0; y < world.map.height; y += 1) {
    for (let x = 0; x < world.map.width; x += 1) {
      const land = isTilePassable(world, x, y, "land", undefined, true);
      const naval = isTilePassable(world, x, y, "naval", undefined, true);
      const color = land ? 0x2ea44f : naval ? 0x3f7fdb : 0xd64f45;
      graphics.rect(x * world.tileSize, y * world.tileSize, world.tileSize, world.tileSize);
      graphics.fill({ color, alpha: land || naval ? 0.16 : 0.2 });
    }
  }
  return world.map.width > 0 && world.map.height > 0;
}

function drawSourceMapGrid(graphics: Graphics, world: WorldState): boolean {
  if (!world.engineSettings.mapGridDefault) {
    return false;
  }
  const width = world.map.width * world.tileSize;
  const height = world.map.height * world.tileSize;
  for (let x = 0; x <= width; x += world.tileSize) {
    graphics.moveTo(x, 0);
    graphics.lineTo(x, height);
  }
  for (let y = 0; y <= height; y += world.tileSize) {
    graphics.moveTo(0, y);
    graphics.lineTo(width, y);
  }
  graphics.stroke({ width: 1, color: 0x000000, alpha: 0.22 });
  return width > 0 || height > 0;
}

function idForTileAtlas(tileAtlas: TileTextureAtlas): number {
  const existing = tileAtlasIds.get(tileAtlas);
  if (existing) {
    return existing;
  }
  const id = nextTileAtlasId;
  nextTileAtlasId += 1;
  tileAtlasIds.set(tileAtlas, id);
  return id;
}

function shouldCacheMapLayer(): boolean {
  return false;
}

function shouldRenderViewportBoundedMap(world: WorldState): boolean {
  return isFixedBrowserDemoMap(world.map);
}

function destroyLayerChildren(layer: Container): void {
  const children = layer.removeChildren();
  children.forEach((child) => {
    child.destroy({ children: true });
  });
}

function colorForTile(world: WorldState, tile: number): number {
  const flags = sourceTilesetFlagsForTile(world, tile);
  const tilesetName = world.tilesetTerrain?.name ?? "";
  if (flags.includes("water")) {
    return sourceTilesetFallbackTint(tilesetName, "water");
  }
  if (flags.includes("forest")) {
    return sourceTilesetFallbackTint(tilesetName, "forest");
  }
  if (flags.includes("wall")) {
    return sourceTilesetFallbackTint(tilesetName, "wall");
  }
  if (flags.includes("rock")) {
    return sourceTilesetFallbackTint(tilesetName, "rock");
  }
  if (flags.includes("coast")) {
    return sourceTilesetFallbackTint(tilesetName, "coast");
  }
  return sourceTilesetFallbackTint(tilesetName, "land");
}

function sourceTilesetFlagsForTile(world: WorldState, tile: number): string[] {
  if (tile === 126) {
    return ["land"];
  }
  const slot = sourceTileSlot(tile);
  return world.tilesetTerrain?.slots.find((entry) => entry.slot === slot)?.flags ?? [];
}

function sourceTileSlot(tile: number): number {
  return tile & 0xfff0;
}

function sourceTilesetFallbackTint(tilesetName: string, terrain: "coast" | "forest" | "land" | "rock" | "wall" | "water"): number {
  const family = tilesetName.toLowerCase();
  if (family.includes("winter")) {
    return {
      coast: 0x9eadad,
      forest: 0x405d52,
      land: 0xbccbc2,
      rock: 0x747f7e,
      wall: 0x87908d,
      water: 0x436d82
    }[terrain];
  }
  if (family.includes("swamp")) {
    return {
      coast: 0x707a43,
      forest: 0x245338,
      land: 0x607139,
      rock: 0x5c6049,
      wall: 0x6b6a56,
      water: 0x285757
    }[terrain];
  }
  if (family.includes("wasteland")) {
    return {
      coast: 0x9a804d,
      forest: 0x4d5733,
      land: 0x947441,
      rock: 0x66574a,
      wall: 0x7b644d,
      water: 0x39566b
    }[terrain];
  }
  return {
    coast: 0xb99b43,
    forest: 0x245333,
    land: 0x547b39,
    rock: 0x7d713b,
    wall: 0x8d7e46,
    water: 0x335f74
  }[terrain];
}

function drawUnits(
  layer: Container,
  world: WorldState,
  manifest: WargusManifest,
  selectedUnitIds: string[],
  controlGroups: Record<number, string[]>,
  sourceShowOrdersVisible: boolean,
  unitAtlases: Map<string, UnitTextureAtlas>,
  missileAtlases: Map<string, MissileTextureAtlas>,
  statusDecorationAtlas: StatusDecorationAtlas | null,
  viewport: WorldViewport
): void {
  const visibleUnits = [...world.units]
    .sort(compareUnitDrawOrder)
    .filter((unit) => (
      !isUnitHiddenInConstruction(unit)
      && !isInvisibleUtilityUnit(unit)
      && !isUnitInsideResourceSource(unit)
      && isUnitVisibleToPlayer(world, unit, world.visibilityPlayer)
      && circleIntersectsViewport(unit.x, unit.y, Math.max(unit.radius + 96, unit.frameWidth, unit.frameHeight), viewport)
    ));
  if (visibleUnits.length === 0) {
    return;
  }
  const graphics = new Graphics();
  const selected = new Set(selectedUnitIds);
  const sourceSelectedOrdersVisible = world.engineSettings.showOrdersDefault && sourceShowOrdersVisible;
  for (const stateUnit of visibleUnits) {
    const unit = visualUnitForRender(stateUnit, world);
    const isOwned = unit.player === world.visibilityPlayer;
    const color = sourcePlayerColor(world, unit.player, 0, [214, 208, 163]);
    const constructionFrame = constructionFrameForUnit(unit, manifest);
    const atlas = constructionFrame?.file === "construction"
      ? unitAtlases.get(unit.constructionTypeId ?? "") ?? unitAtlases.get(unit.typeId)
      : unitAtlases.get(unit.typeId);
    drawUnitShadow(graphics, unit);
    if (atlas) {
      const frameNumber = constructionFrame?.file === "construction"
        ? constructionFrame.frame
        : constructionFrame?.file === "main"
          ? constructionFrame.frame
          : unit.givesResource
            ? 0
          : getAnimatedFrameNumber(unit, manifest, world, atlas.numDirections);
      const texture = getFrameTexture(atlas, frameNumber);
      const sprite = new Sprite(texture);
      const direction = spriteDirectionForFacing(unit.facing ?? 4, atlas.numDirections);
      const fixedDemo = isFixedBrowserDemoMap(world.map);
      const building = isRuntimeSourceBuildingUnit(unit);
      sprite.anchor.set(0.5, building ? 0.74 : 0.72);
      sprite.position.set(unit.x, unit.y + (building && fixedDemo ? 4 : 10));
      const mirror = constructionFrame ? false : direction.mirror || sourceFancyBuildingMirror(world, unit);
      const scale = fixedDemo && building ? 0.94 : fixedDemo ? 0.82 : 0.72;
      sprite.scale.set(mirror ? -scale : scale, scale);
      sprite.alpha = hasHiddenUnitEffect(unit) ? (isOwned ? 0.68 : 0.48) : 1;
      layer.addChild(sprite);
    } else {
      graphics.circle(unit.x, unit.y, unit.radius);
      graphics.fill(color);
      graphics.circle(unit.x, unit.y, unit.radius);
      graphics.stroke({ width: 2, color: 0x1a1410, alpha: 0.8 });
    }

    if (unit.elevated) {
      graphics.ellipse(unit.x, unit.y + Math.max(6, unit.radius * 0.45), unit.radius + 8, Math.max(7, unit.radius * 0.28));
      graphics.stroke({ width: 2, color: 0xf0df9a, alpha: unit.player === world.visibilityPlayer ? 0.42 : 0.24 });
    }

    if (unit.woodImprove || unit.oilImprove || unit.center) {
      drawEconomyRoleMarker(graphics, unit, unit.player === world.visibilityPlayer);
    }

    drawCarriedResourceMarker(graphics, unit);

    drawBurningBuilding(layer, world, manifest, unit, missileAtlases);

    if (unit.teleporter) {
      const destination = unit.teleportDestinationId ? world.units.find((candidate) => candidate.id === unit.teleportDestinationId) : undefined;
      if (destination && isUnitVisibleToPlayer(world, destination, world.visibilityPlayer)) {
        graphics.moveTo(unit.x, unit.y);
        graphics.lineTo(destination.x, destination.y);
        graphics.stroke({ width: 2, color: 0xa78de8, alpha: unit.player === world.visibilityPlayer ? 0.34 : 0.18 });
      }
      graphics.circle(unit.x, unit.y, unit.radius + 16);
      graphics.stroke({ width: 2, color: 0xa78de8, alpha: unit.player === world.visibilityPlayer ? 0.58 : 0.32 });
    }

    if (selected.has(unit.id)) {
      drawSourceSelectionMarker(graphics, world, unit);
      drawSourceControlGroupNumber(layer, world, unit, controlGroups, sourceSelectedOrdersVisible);
      if (selected.size === 1) {
        drawSourceSelectedRangeMarkers(graphics, world, unit);
      }
    }

    if (hasActiveStatusEffect(unit, "slow")) {
      graphics.circle(unit.x, unit.y, unit.radius + 8);
      graphics.stroke({ width: 2, color: 0x77b6d8, alpha: 0.8 });
    }

    if (hasActiveStatusEffect(unit, "haste")) {
      graphics.circle(unit.x, unit.y, unit.radius + 11);
      graphics.stroke({ width: 2, color: 0xf0df9a, alpha: 0.8 });
    }

    if (hasActiveStatusEffect(unit, "bloodlust")) {
      graphics.circle(unit.x, unit.y, unit.radius + 13);
      graphics.stroke({ width: 3, color: 0xd95d45, alpha: 0.88 });
    }

    if (hasHiddenUnitEffect(unit)) {
      graphics.circle(unit.x, unit.y, unit.radius + 14);
      graphics.stroke({ width: 2, color: 0x9fd6ff, alpha: unit.player === world.visibilityPlayer ? 0.65 : 0.32 });
    }

    if (hasActiveStatusEffect(unit, "unholy-armor")) {
      graphics.circle(unit.x, unit.y, unit.radius + 17);
      graphics.stroke({ width: 2, color: 0x9a6be8, alpha: 0.85 });
    }

    if (hasActiveStatusEffect(unit, "flame-shield")) {
      graphics.circle(unit.x, unit.y, unit.radius + 20);
      graphics.stroke({ width: 3, color: 0xff7b3d, alpha: 0.9 });
    }

    drawSourceStatusDecorations(layer, unit, isOwned, statusDecorationAtlas, manifest.decorations ?? []);
    const selectedOrder = sourceSelectedOrderRenderState(world, unit, selected, sourceSelectedOrdersVisible);

    if (selectedOrder.order?.kind === "move") {
      graphics.moveTo(unit.x, unit.y);
      for (let index = selectedOrder.order.pathIndex; index < selectedOrder.order.path.length; index += 1) {
        const point = selectedOrder.order.path[index];
        graphics.lineTo(point.x, point.y);
      }
      for (const point of unit.moveQueue ?? []) {
        graphics.lineTo(point.x, point.y);
      }
      graphics.stroke({ width: 1, color: 0xd6c36f, alpha: 0.55 });
      graphics.circle(selectedOrder.order.targetX, selectedOrder.order.targetY, 5);
      graphics.stroke({ width: 2, color: 0xd6c36f, alpha: 0.8 });
      for (const point of unit.moveQueue ?? []) {
        graphics.circle(point.x, point.y, 4);
        graphics.stroke({ width: 1, color: 0xd6c36f, alpha: 0.5 });
      }
    }

    if (selectedOrder.order?.kind === "attack") {
      graphics.moveTo(unit.x, unit.y);
      if (selectedOrder.order.path.length > 0) {
        for (let index = selectedOrder.order.pathIndex; index < selectedOrder.order.path.length; index += 1) {
          const point = selectedOrder.order.path[index];
          graphics.lineTo(point.x, point.y);
        }
      } else {
        graphics.lineTo(selectedOrder.order.targetX, selectedOrder.order.targetY);
      }
      graphics.stroke({ width: 1, color: 0xd95d45, alpha: 0.65 });
      graphics.circle(selectedOrder.order.targetX, selectedOrder.order.targetY, 7);
      graphics.stroke({ width: 2, color: 0xd95d45, alpha: 0.9 });
    }

    if (selectedOrder.order?.kind === "attack-move") {
      graphics.moveTo(unit.x, unit.y);
      for (let index = selectedOrder.order.pathIndex; index < selectedOrder.order.path.length; index += 1) {
        const point = selectedOrder.order.path[index];
        graphics.lineTo(point.x, point.y);
      }
      for (const point of unit.moveQueue ?? []) {
        graphics.lineTo(point.x, point.y);
      }
      graphics.stroke({ width: 1, color: 0xe08743, alpha: 0.65 });
      graphics.circle(selectedOrder.order.targetX, selectedOrder.order.targetY, 7);
      graphics.stroke({ width: 2, color: 0xe08743, alpha: 0.9 });
      graphics.moveTo(selectedOrder.order.targetX - 5, selectedOrder.order.targetY);
      graphics.lineTo(selectedOrder.order.targetX + 5, selectedOrder.order.targetY);
      graphics.moveTo(selectedOrder.order.targetX, selectedOrder.order.targetY - 5);
      graphics.lineTo(selectedOrder.order.targetX, selectedOrder.order.targetY + 5);
      graphics.stroke({ width: 2, color: 0xe08743, alpha: 0.9 });
      for (const point of unit.moveQueue ?? []) {
        graphics.circle(point.x, point.y, 4);
        graphics.stroke({ width: 1, color: point.kind === "attack-move" ? 0xe08743 : 0xd6c36f, alpha: 0.55 });
      }
    }

    if (selectedOrder.order?.kind === "patrol") {
      graphics.moveTo(unit.x, unit.y);
      for (let index = selectedOrder.order.pathIndex; index < selectedOrder.order.path.length; index += 1) {
        const point = selectedOrder.order.path[index];
        graphics.lineTo(point.x, point.y);
      }
      graphics.stroke({ width: 1, color: 0x6dc4a5, alpha: 0.68 });
      graphics.circle(selectedOrder.order.anchorX, selectedOrder.order.anchorY, 5);
      graphics.stroke({ width: 2, color: 0x6dc4a5, alpha: 0.78 });
      graphics.circle(selectedOrder.order.patrolX, selectedOrder.order.patrolY, 7);
      graphics.stroke({ width: 2, color: 0x6dc4a5, alpha: 0.95 });
    }

    if (selectedOrder.order?.kind === "hold") {
      graphics.circle(selectedOrder.order.anchorX, selectedOrder.order.anchorY, unit.radius + 9);
      graphics.stroke({ width: 2, color: 0x9bd36f, alpha: 0.85 });
      graphics.moveTo(selectedOrder.order.anchorX - 7, selectedOrder.order.anchorY - 7);
      graphics.lineTo(selectedOrder.order.anchorX + 7, selectedOrder.order.anchorY + 7);
      graphics.moveTo(selectedOrder.order.anchorX + 7, selectedOrder.order.anchorY - 7);
      graphics.lineTo(selectedOrder.order.anchorX - 7, selectedOrder.order.anchorY + 7);
      graphics.stroke({ width: 2, color: 0x9bd36f, alpha: 0.85 });
    }

    if (selectedOrder.order?.kind === "repair") {
      graphics.moveTo(unit.x, unit.y);
      for (let index = selectedOrder.order.pathIndex; index < selectedOrder.order.path.length; index += 1) {
        const point = selectedOrder.order.path[index];
        graphics.lineTo(point.x, point.y);
      }
      graphics.stroke({ width: 1, color: 0x77b6d8, alpha: 0.68 });
      graphics.rect(selectedOrder.order.targetX - 7, selectedOrder.order.targetY - 7, 14, 14);
      graphics.stroke({ width: 2, color: 0x77b6d8, alpha: 0.9 });
    }

    if (selectedOrder.order?.kind === "load-transport") {
      graphics.moveTo(unit.x, unit.y);
      for (let index = selectedOrder.order.pathIndex; index < selectedOrder.order.path.length; index += 1) {
        const point = selectedOrder.order.path[index];
        graphics.lineTo(point.x, point.y);
      }
      graphics.stroke({ width: 1, color: 0x9fd6ff, alpha: 0.7 });
      graphics.circle(selectedOrder.order.targetX, selectedOrder.order.targetY, 8);
      graphics.stroke({ width: 2, color: 0x9fd6ff, alpha: 0.95 });
    }

    if (selectedOrder.order?.kind === "follow") {
      graphics.moveTo(unit.x, unit.y);
      for (let index = selectedOrder.order.pathIndex; index < selectedOrder.order.path.length; index += 1) {
        const point = selectedOrder.order.path[index];
        graphics.lineTo(point.x, point.y);
      }
      graphics.stroke({ width: 1, color: 0xb8d87a, alpha: 0.68 });
      graphics.circle(selectedOrder.order.targetX, selectedOrder.order.targetY, 8);
      graphics.stroke({ width: 2, color: 0xb8d87a, alpha: 0.9 });
      graphics.moveTo(selectedOrder.order.targetX - 7, selectedOrder.order.targetY);
      graphics.lineTo(selectedOrder.order.targetX + 7, selectedOrder.order.targetY);
      graphics.moveTo(selectedOrder.order.targetX, selectedOrder.order.targetY - 7);
      graphics.lineTo(selectedOrder.order.targetX, selectedOrder.order.targetY + 7);
      graphics.stroke({ width: 2, color: 0xb8d87a, alpha: 0.9 });
    }

    if (selectedOrder.order?.kind === "defend") {
      graphics.moveTo(unit.x, unit.y);
      for (let index = selectedOrder.order.pathIndex; index < selectedOrder.order.path.length; index += 1) {
        const point = selectedOrder.order.path[index];
        graphics.lineTo(point.x, point.y);
      }
      graphics.stroke({ width: 1, color: 0xf0b35a, alpha: 0.68 });
      graphics.circle(selectedOrder.order.targetX, selectedOrder.order.targetY, 8);
      graphics.stroke({ width: 2, color: 0xf0b35a, alpha: 0.9 });
    }

    if (selectedOrder.order?.kind === "unload-transport") {
      graphics.moveTo(unit.x, unit.y);
      for (let index = selectedOrder.order.pathIndex; index < selectedOrder.order.path.length; index += 1) {
        const point = selectedOrder.order.path[index];
        graphics.lineTo(point.x, point.y);
      }
      graphics.stroke({ width: 1, color: 0x9fd6ff, alpha: 0.7 });
      graphics.circle(selectedOrder.order.targetX, selectedOrder.order.targetY, 8);
      graphics.stroke({ width: 2, color: 0x9fd6ff, alpha: 0.95 });
      graphics.moveTo(selectedOrder.order.targetX - 8, selectedOrder.order.targetY - 3);
      graphics.lineTo(selectedOrder.order.targetX, selectedOrder.order.targetY + 7);
      graphics.lineTo(selectedOrder.order.targetX + 8, selectedOrder.order.targetY - 3);
      graphics.stroke({ width: 2, color: 0x9fd6ff, alpha: 0.95 });
    }

    if (selectedOrder.order?.kind === "harvest") {
      const harvestColor = selectedOrder.order.resource === "wood" ? 0x5fb96b : 0xe0b447;
      graphics.moveTo(unit.x, unit.y);
      for (let index = selectedOrder.order.pathIndex; index < selectedOrder.order.path.length; index += 1) {
        const point = selectedOrder.order.path[index];
        graphics.lineTo(point.x, point.y);
      }
      graphics.stroke({ width: 1, color: harvestColor, alpha: 0.65 });
      graphics.circle(selectedOrder.order.targetX, selectedOrder.order.targetY, 5);
      graphics.stroke({ width: 2, color: harvestColor, alpha: 0.85 });
    }

    if (selectedOrder.order?.kind === "build") {
      graphics.moveTo(unit.x, unit.y);
      for (let index = selectedOrder.order.pathIndex; index < selectedOrder.order.path.length; index += 1) {
        const point = selectedOrder.order.path[index];
        graphics.lineTo(point.x, point.y);
      }
      graphics.stroke({ width: 1, color: 0x77b6d8, alpha: 0.65 });
      graphics.rect(selectedOrder.order.targetX - 8, selectedOrder.order.targetY - 8, 16, 16);
      graphics.stroke({ width: 2, color: 0x77b6d8, alpha: 0.9 });
    }

    if (selectedOrder.order?.kind === "build-oil-platform") {
      graphics.moveTo(unit.x, unit.y);
      for (let index = selectedOrder.order.pathIndex; index < selectedOrder.order.path.length; index += 1) {
        const point = selectedOrder.order.path[index];
        graphics.lineTo(point.x, point.y);
      }
      graphics.stroke({ width: 1, color: 0x77b6d8, alpha: 0.65 });
      graphics.circle(selectedOrder.order.targetX, selectedOrder.order.targetY, 10);
      graphics.stroke({ width: 2, color: 0x77b6d8, alpha: 0.9 });
      graphics.rect(selectedOrder.order.targetX - 7, selectedOrder.order.targetY - 7, 14, 14);
      graphics.stroke({ width: 2, color: 0x77b6d8, alpha: 0.9 });
    }

    if (selectedOrder.rallyPoint) {
      graphics.moveTo(unit.x, unit.y);
      graphics.lineTo(selectedOrder.rallyPoint.x, selectedOrder.rallyPoint.y);
      graphics.stroke({ width: 1, color: 0xf0df9a, alpha: selected.has(unit.id) ? 0.75 : 0.25 });
      graphics.circle(selectedOrder.rallyPoint.x, selectedOrder.rallyPoint.y, 6);
      graphics.stroke({ width: 2, color: 0xf0df9a, alpha: selected.has(unit.id) ? 0.95 : 0.35 });
      graphics.moveTo(selectedOrder.rallyPoint.x - 5, selectedOrder.rallyPoint.y);
      graphics.lineTo(selectedOrder.rallyPoint.x + 5, selectedOrder.rallyPoint.y);
      graphics.moveTo(selectedOrder.rallyPoint.x, selectedOrder.rallyPoint.y - 5);
      graphics.lineTo(selectedOrder.rallyPoint.x, selectedOrder.rallyPoint.y + 5);
      graphics.stroke({ width: 2, color: 0xf0df9a, alpha: selected.has(unit.id) ? 0.95 : 0.35 });
    }

    const activeResearch = isOwned ? world.activeResearch.find((research) => research.buildingId === unit.id) : undefined;
    const sourceDecorationBars = sourceVariableDecorationBars(unit, isOwned, activeResearch, manifest.decorations ?? []);
    drawSourceVariableDecorations(layer, unit, isOwned, sourceDecorationBars, statusDecorationAtlas, manifest.decorations ?? []);
    const completedBarColor = sourceCompletedBarColor(world);
    const completedBarShadow = sourceCompletedBarShadow(world);

    if (!statusDecorationAtlas?.mana && isOwned && unit.productionQueue[0]) {
      const active = unit.productionQueue[0];
      const progress = 1 - active.remainingSeconds / active.totalSeconds;
      drawSourceCompletionBar(graphics, unit.x - unit.radius, unit.y + unit.radius + 5, unit.radius * 2, 4, progress, completedBarColor, completedBarShadow);
    }

    if (!statusDecorationAtlas?.mana && activeResearch) {
      const progress = 1 - activeResearch.remainingSeconds / activeResearch.totalSeconds;
      drawSourceCompletionBar(graphics, unit.x - unit.radius, unit.y + unit.radius + 11, unit.radius * 2, 4, progress, completedBarColor, completedBarShadow);
    }

    if (!statusDecorationAtlas?.mana && isOwned && unit.construction) {
      const progress = 1 - unit.construction.remainingSeconds / unit.construction.totalSeconds;
      const yOffset = activeResearch ? 17 : 11;
      drawSourceCompletionBar(graphics, unit.x - unit.radius, unit.y + unit.radius + yOffset, unit.radius * 2, 4, progress, completedBarColor, completedBarShadow);
    }

    if (!statusDecorationAtlas?.health) {
      const healthWidth = unit.radius * 2;
      const healthRatio = unit.hitPoints / unit.maxHitPoints;
      graphics.rect(unit.x - unit.radius, unit.y - unit.radius - 9, healthWidth, 4);
      graphics.fill(0x211915);
      graphics.rect(unit.x - unit.radius, unit.y - unit.radius - 9, healthWidth * healthRatio, 4);
      graphics.fill(0x4fb85a);
    }
  }
  layer.addChild(graphics);
}

function drawSourceControlGroupNumber(layer: Container, world: WorldState, unit: WorldState["units"][number], controlGroups: Record<number, string[]>, sourceSelectedOrdersVisible: boolean): void {
  if (!sourceSelectedOrdersVisible || unit.player !== world.visibilityPlayer) {
    return;
  }
  const groupId = sourceControlGroupNumberForUnit(unit.id, controlGroups);
  if (groupId === null) {
    return;
  }
  const text = new Text({
    text: String(groupId),
    style: {
      fill: "#ffffff",
      fontFamily: "system-ui, sans-serif",
      fontSize: 14,
      fontWeight: "700",
      stroke: { color: "#111111", width: 3 }
    }
  });
  text.anchor.set(1, 1);
  text.position.set(unit.x + unit.boxWidth / 2 - 2, unit.y + unit.boxHeight / 2 - 2);
  text.resolution = 1;
  layer.addChild(text);
}

function drawSourceSelectionMarker(graphics: Graphics, world: WorldState, unit: WorldState["units"][number]): void {
  const style = world.engineSettings.selectionStyleDefault || "corners";
  const color = sourceSelectionMarkerColor(world, unit);
  if (style === "corners") {
    const { halfWidth, halfHeight } = unitFootprintHalfSize(unit, world.tileSize);
    const left = unit.x - halfWidth - 3;
    const right = unit.x + halfWidth + 3;
    const top = unit.y - halfHeight - 3;
    const bottom = unit.y + halfHeight + 3;
    const length = Math.max(7, Math.min(16, Math.min(right - left, bottom - top) * 0.28));
    graphics.moveTo(left, top + length);
    graphics.lineTo(left, top);
    graphics.lineTo(left + length, top);
    graphics.moveTo(right - length, top);
    graphics.lineTo(right, top);
    graphics.lineTo(right, top + length);
    graphics.moveTo(right, bottom - length);
    graphics.lineTo(right, bottom);
    graphics.lineTo(right - length, bottom);
    graphics.moveTo(left + length, bottom);
    graphics.lineTo(left, bottom);
    graphics.lineTo(left, bottom - length);
    graphics.stroke({ width: 3, color, alpha: 1 });
    return;
  }
  if (style === "ellipse") {
    graphics.ellipse(unit.x, unit.y + Math.max(6, unit.radius * 0.35), unit.radius + 9, Math.max(7, unit.radius * 0.32));
    graphics.stroke({ width: 3, color, alpha: 1 });
    return;
  }
  graphics.circle(unit.x, unit.y, unit.radius + 5);
  graphics.stroke({ width: 3, color, alpha: 1 });
}

function sourceSelectionMarkerColor(world: WorldState, unit: WorldState["units"][number]): number {
  const normalColor = 0xf2df83;
  if (!world.engineSettings.selectionRectangleIndicatesDamageDefault || unit.player !== world.visibilityPlayer || unit.maxHitPoints <= 0) {
    return normalColor;
  }
  const fraction = Math.max(0, Math.min(1, unit.hitPoints / unit.maxHitPoints));
  return interpolateSourceColor(0xfc0000, 0x00fc00, fraction);
}

function interpolateSourceColor(color1: number, color2: number, fraction: number): number {
  const r1 = (color1 >> 16) & 0xff;
  const g1 = (color1 >> 8) & 0xff;
  const b1 = color1 & 0xff;
  const r2 = (color2 >> 16) & 0xff;
  const g2 = (color2 >> 8) & 0xff;
  const b2 = color2 & 0xff;
  const lerp = (left: number, right: number) => Math.floor(left + (right - left) * fraction);
  return (lerp(r1, r2) << 16) | (lerp(g1, g2) << 8) | lerp(b1, b2);
}

function drawSourceSelectedRangeMarkers(graphics: Graphics, world: WorldState, unit: WorldState["units"][number]): void {
  const sourceRangeRadiusOffset = ((unit.tileWidth - 1) * world.tileSize) / 2;
  if (world.engineSettings.showSightRangeDefault && unit.sightRangeTiles > 0) {
    drawSourceRangeMarker(graphics, unit.x, unit.y, unit.sightRangeTiles * world.tileSize + sourceRangeRadiusOffset, 0x77b6d8, 0.28);
  }
  if (unit.canAttack && world.engineSettings.showAttackRangeDefault && unit.attackRange > 0) {
    drawSourceRangeMarker(graphics, unit.x, unit.y, unit.attackRange + sourceRangeRadiusOffset, 0xd95d45, 0.32);
  }
  if (unit.canAttack && world.engineSettings.showReactionRangeDefault) {
    const reactionRange = sourceDeclaredReactionRangeForUnit(world, unit);
    if (reactionRange > 0) {
      drawSourceRangeMarker(graphics, unit.x, unit.y, reactionRange + sourceRangeRadiusOffset, 0xf0df9a, 0.28);
    }
  }
}

function drawSourceRangeMarker(graphics: Graphics, x: number, y: number, radius: number, color: number, alpha: number): void {
  graphics.circle(x, y, radius);
  graphics.stroke({ width: 2, color, alpha });
}

function drawSourceVariableDecorations(layer: Container, unit: WorldState["units"][number], isOwned: boolean, bars: SourceVariableDecorationBar[], atlas: StatusDecorationAtlas | null, decorations: WargusDecoration[]): number {
  if (!atlas?.health) {
    return 0;
  }
  const healthDecoration = sourceDecorationForIndex(decorations, "HitPoints");
  const healthRatio = unit.maxHitPoints > 0 ? unit.hitPoints / unit.maxHitPoints : 0;
  const healthTexture = getStatusBarTexture(atlas, "health", healthRatio);
  if (healthDecoration && healthTexture && sourceDecorationValueVisible(healthDecoration, unit.hitPoints, unit.maxHitPoints, unit, isOwned)) {
    const health = new Sprite(healthTexture);
    health.anchor.set(0.5, 1);
    const position = sourceDecorationPosition(unit, healthDecoration, sourceDecorationSpriteOffset("sprite-health"));
    health.position.set(position.x, position.y);
    layer.addChild(health);
  }
  let extraBars = 0;
  if (atlas.mana) {
    bars.forEach((bar, index) => {
      const manaTexture = getStatusBarTexture(atlas, "mana", bar.ratio);
      if (!manaTexture) {
        return;
      }
      const mana = new Sprite(manaTexture);
      mana.anchor.set(0.5, 1);
      const position = sourceDecorationPosition(unit, bar.decoration, sourceDecorationSpriteOffset("sprite-mana"));
      mana.position.set(position.x, position.y + index * 5);
      layer.addChild(mana);
      extraBars += 1;
    });
  }
  return extraBars * 5;
}

interface SourceVariableDecorationBar {
  kind: "mana" | "training" | "research" | "construction" | "transport" | "carry-resource";
  ratio: number;
  decoration: WargusDecoration;
}

function sourceVariableDecorationBars(unit: WorldState["units"][number], isOwned: boolean, activeResearch: WorldState["activeResearch"][number] | undefined, decorations: WargusDecoration[]): SourceVariableDecorationBar[] {
  const bars: SourceVariableDecorationBar[] = [];
  const pushBar = (kind: SourceVariableDecorationBar["kind"], index: string, ratio: number) => {
    const decoration = sourceDecorationForIndex(decorations, index);
    if (
      !decoration
      || decoration.method !== "sprite"
      || !sourceDecorationValueVisible(decoration, ratio, 1, unit, isOwned)
    ) {
      return;
    }
    bars.push({ kind, ratio, decoration });
  };
  if (unit.maxMana > 0) {
    pushBar("mana", "Mana", unit.mana / unit.maxMana);
  }
  const activeProduction = unit.productionQueue[0];
  if (activeProduction) {
    pushBar("training", "Training", 1 - activeProduction.remainingSeconds / activeProduction.totalSeconds);
  }
  if (activeResearch) {
    pushBar("research", "Research", 1 - activeResearch.remainingSeconds / activeResearch.totalSeconds);
  }
  if (unit.construction) {
    pushBar("construction", "UpgradeTo", 1 - unit.construction.remainingSeconds / unit.construction.totalSeconds);
  }
  if (unit.cargoCapacity > 0) {
    pushBar("transport", "Transport", unit.cargo.length / unit.cargoCapacity);
  }
  if (unit.resourcesHeld > 0) {
    pushBar("carry-resource", "CarryResource", 1);
  }
  return bars.map((bar) => ({ ...bar, ratio: Math.max(0, Math.min(1, bar.ratio)) }));
}

function drawSourceCompletionBar(graphics: Graphics, x: number, y: number, width: number, height: number, ratio: number, color: number, shadow: boolean): void {
  if (shadow) {
    graphics.rect(x + 1, y + 1, width, height);
    graphics.fill(0x211915);
  }
  graphics.rect(x, y, width, height);
  graphics.fill(0x0d0a07);
  graphics.rect(x, y, width * Math.max(0, Math.min(1, ratio)), height);
  graphics.fill(color);
}

function drawSourceStatusDecorations(layer: Container, unit: WorldState["units"][number], isOwned: boolean, atlas: StatusDecorationAtlas | null, decorations: WargusDecoration[]): void {
  if (!atlas) {
    return;
  }
  const entries = sourceStatusDecorations(unit, isOwned, decorations);
  entries.forEach((decoration, index) => {
    const sprite = new Sprite(getStatusDecorationTexture(atlas, decoration.frame ?? index));
    sprite.anchor.set(0.5, 1);
    const position = sourceDecorationPosition(unit, decoration, sourceDecorationSpriteOffset(decoration.sprite));
    sprite.position.set(position.x - 8, position.y - unit.radius - 12);
    sprite.alpha = hasHiddenUnitEffect(unit) ? 0.76 : 0.96;
    layer.addChild(sprite);
  });
}

function sourceStatusDecorations(unit: WorldState["units"][number], isOwned: boolean, decorations: WargusDecoration[]): WargusDecoration[] {
  const entries = [
    hasActiveStatusEffect(unit, "bloodlust") ? sourceDecorationForIndex(decorations, "Bloodlust") : null,
    hasActiveStatusEffect(unit, "haste") ? sourceDecorationForIndex(decorations, "Haste") : null,
    hasActiveStatusEffect(unit, "slow") ? sourceDecorationForIndex(decorations, "Slow") : null,
    hasHiddenUnitEffect(unit) ? sourceDecorationForIndex(decorations, "Invisible") : null,
    hasActiveStatusEffect(unit, "unholy-armor") ? sourceDecorationForIndex(decorations, "UnholyArmor") : null
  ];
  return entries.filter((decoration): decoration is WargusDecoration => Boolean(
    decoration
    && decoration.method === "static-sprite"
    && sourceDecorationVisible(decoration, unit, isOwned)
  ));
}

function sourceDecorationForIndex(decorations: WargusDecoration[], index: string): WargusDecoration | null {
  return decorations.find((decoration) => decoration.index === index) ?? null;
}

function sourceDecorationVisible(decoration: WargusDecoration, unit: WorldState["units"][number], isOwned: boolean): boolean {
  if (!isOwned && !decoration.showOpponent) {
    return false;
  }
  if (unit.neutral && decoration.hideNeutral) {
    return false;
  }
  return true;
}

function sourceDecorationValueVisible(decoration: WargusDecoration, value: number, max: number, unit: WorldState["units"][number], isOwned: boolean): boolean {
  if (max === 0 || !sourceDecorationVisible(decoration, unit, isOwned)) {
    return false;
  }
  if (value === 0 && !decoration.showWhenNull) {
    return false;
  }
  if (value === max && !decoration.showWhenMax) {
    return false;
  }
  return true;
}

function sourceDecorationPosition(unit: WorldState["units"][number], decoration: WargusDecoration, spriteOffset: [number, number]): { x: number; y: number } {
  const percent = decoration.offsetPercent ?? [50, 100];
  const offset = decoration.offset ?? [0, 0];
  const x = unit.x - unit.radius + unit.radius * 2 * (percent[0] / 100) + offset[0] + spriteOffset[0];
  const y = unit.y - unit.radius + unit.radius * 2 * (percent[1] / 100) + offset[1] + spriteOffset[1];
  return { x: decoration.centerX ? unit.x + offset[0] + spriteOffset[0] : x, y };
}

function sourceDecorationSpriteOffset(sprite: string | null): [number, number] {
  if (sprite === "sprite-health") return [0, -4];
  if (sprite === "sprite-mana") return [0, -1];
  if (sprite === "sprite-spell") return [1, 1];
  return [0, 0];
}

function drawBurningBuilding(layer: Container, world: WorldState, manifest: WargusManifest, unit: WorldState["units"][number], missileAtlases: Map<string, MissileTextureAtlas>): void {
  if (!isRuntimeSourceBuildingUnit(unit) || unit.construction || unit.hitPoints <= 0 || unit.maxHitPoints <= 1) {
    return;
  }
  const stage = burningStageForUnit(manifest, unit);
  if (!stage?.missile) {
    return;
  }
  const atlas = missileAtlases.get(stage.missile);
  if (!atlas) {
    return;
  }
  const texture = getMissileFrameTexture(atlas, burningBuildingMissileFrame(world, atlas));
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5, 0.82);
  sprite.position.set(unit.x + burningOffsetX(unit), unit.y - Math.max(4, unit.boxHeight * 0.25));
  const scale = Math.max(0.72, Math.min(1.35, Math.max(unit.boxWidth, unit.boxHeight) / 96));
  sprite.scale.set(scale);
  layer.addChild(sprite);
}

function burningBuildingMissileFrame(world: WorldState, atlas: MissileTextureAtlas): number {
  if (atlas.frameCount <= 1) {
    return 0;
  }
  return Math.floor(world.tick / sourceMissileSleepTicks(atlas)) % atlas.framesPerDirection;
}

function burningStageForUnit(manifest: WargusManifest, unit: WorldState["units"][number]): WargusManifest["burningBuildings"][number] | null {
  const healthPercent = Math.max(0, Math.min(100, Math.floor((100 * unit.hitPoints) / unit.maxHitPoints)));
  let active: WargusManifest["burningBuildings"][number] | null = null;
  for (const stage of [...(manifest.burningBuildings ?? [])].sort((a, b) => a.percent - b.percent)) {
    if (healthPercent >= stage.percent) {
      active = stage;
    }
  }
  return active;
}

function burningOffsetX(unit: WorldState["units"][number]): number {
  if (unit.tileWidth >= 3) {
    return -Math.min(24, unit.boxWidth * 0.18);
  }
  return 0;
}

function drawUnitShadow(graphics: Graphics, unit: WorldState["units"][number]): void {
  if (unit.shadow === null || unit.shadow === undefined) {
    return;
  }
  const scale = Math.max(0, unit.shadow);
  const width = scale === 0 ? Math.max(10, unit.radius * 0.75) : Math.max(18, unit.radius * (0.95 + scale * 0.2));
  const height = scale === 0 ? Math.max(5, unit.radius * 0.26) : Math.max(7, unit.radius * (0.22 + scale * 0.05));
  const yOffset = unit.kind === "fly" ? Math.max(18, unit.radius * 0.7) : Math.max(5, unit.radius * 0.2);
  graphics.ellipse(unit.x, unit.y + yOffset, width, height);
  graphics.fill({ color: 0x14100d, alpha: 0.32 });
}

function drawEconomyRoleMarker(graphics: Graphics, unit: WorldState["units"][number], isOwned: boolean): void {
  const markers: number[] = [];
  if (unit.center) {
    markers.push(0xf0df9a);
  }
  if (unit.woodImprove) {
    markers.push(0x4fb85a);
  }
  if (unit.oilImprove) {
    markers.push(0x2d8bb8);
  }
  const startX = unit.x - (markers.length - 1) * 5;
  markers.forEach((color, index) => {
    graphics.circle(startX + index * 10, unit.y + unit.radius + 10, 3);
    graphics.fill({ color, alpha: isOwned ? 0.78 : 0.36 });
  });
}

function drawCarriedResourceMarker(graphics: Graphics, unit: WorldState["units"][number]): void {
  if (!unit.carriedResource || unit.resourcesHeld <= 0) {
    return;
  }
  const x = unit.x + Math.max(5, unit.radius * 0.34);
  const y = unit.y - Math.max(16, unit.radius * 0.58);
  if (unit.carriedResource === "gold") {
    graphics.circle(x, y, 5);
    graphics.fill({ color: 0xf1c54f, alpha: 0.95 });
    graphics.circle(x - 4, y + 3, 4);
    graphics.fill({ color: 0xb98228, alpha: 0.95 });
    graphics.circle(x + 4, y + 4, 3);
    graphics.fill({ color: 0xffdf73, alpha: 0.95 });
    graphics.circle(x, y, 6);
    graphics.stroke({ width: 1, color: 0x24180a, alpha: 0.72 });
    return;
  }
  if (unit.carriedResource === "wood") {
    for (let index = 0; index < 3; index += 1) {
      const logY = y + index * 3;
      graphics.roundRect(x - 8, logY - 2, 16, 4, 2);
      graphics.fill({ color: index === 1 ? 0x9b6232 : 0x72401f, alpha: 0.96 });
      graphics.roundRect(x - 8, logY - 2, 16, 4, 2);
      graphics.stroke({ width: 1, color: 0x2c1609, alpha: 0.72 });
    }
  }
}

function hasHiddenUnitEffect(unit: WorldState["units"][number]): boolean {
  return unit.permanentCloak || hasActiveStatusEffect(unit, "invisibility");
}

function hasActiveStatusEffect(unit: WorldState["units"][number], kind: WorldState["units"][number]["statusEffects"][number]["kind"]): boolean {
  return unit.statusEffects?.some((effect) => effect.kind === kind && effect.remainingSeconds > 0) === true;
}

function compareUnitDrawOrder(left: WorldState["units"][number], right: WorldState["units"][number]): number {
  return left.drawLevel - right.drawLevel
    || (left.y + left.radius) - (right.y + right.radius)
    || left.id.localeCompare(right.id);
}

function constructionFrameForUnit(unit: WorldState["units"][number], manifest: WargusManifest): { file: string; frame: number } | null {
  if (!unit.construction || !unit.constructionTypeId) {
    return null;
  }
  const definition = manifest.constructions?.find((candidate) => candidate.id === unit.constructionTypeId);
  if (!definition?.stages.length) {
    return null;
  }
  const progress = 1 - unit.construction.remainingSeconds / Math.max(unit.construction.totalSeconds, 0.001);
  const percent = Math.max(0, Math.min(100, progress * 100));
  return [...definition.stages]
    .sort((a, b) => b.percent - a.percent)
    .find((stage) => percent >= stage.percent)
    ?? definition.stages[0];
}

function drawLastSeenBuildings(layer: Container, world: WorldState, manifest: WargusManifest, unitAtlases: Map<string, UnitTextureAtlas>, viewport: WorldViewport, strata: { minDrawLevel?: number; maxDrawLevel?: number } = {}): void {
  if (world.lastSeenBuildings.length === 0) {
    return;
  }
  const graphics = new Graphics();
  let drewFallbackGraphics = false;
  for (const building of [...world.lastSeenBuildings].sort(compareLastSeenBuildingDrawOrder)) {
    if (building.drawLevel < (strata.minDrawLevel ?? 0) || building.drawLevel > (strata.maxDrawLevel ?? Number.POSITIVE_INFINITY)) {
      continue;
    }
    if (isLastSeenBuildingVisible(world, building) || !circleIntersectsViewport(building.x, building.y, Math.max(building.radius + 96, building.frameWidth, building.frameHeight), viewport)) {
      continue;
    }
    const atlas = unitAtlases.get(building.typeId);
    if (atlas) {
      const frameNumber = getLastSeenBuildingFrameNumber(building, manifest, atlas.numDirections);
      const texture = getFrameTexture(atlas, frameNumber);
      const sprite = new Sprite(texture);
      const direction = spriteDirectionForFacing(building.facing ?? 4, atlas.numDirections);
      sprite.anchor.set(0.5, 0.72);
      sprite.position.set(building.x, building.y + 10);
      const mirror = direction.mirror || sourceLastSeenFancyBuildingMirror(world, building.typeId, building.unitId);
      sprite.scale.set(mirror ? -0.72 : 0.72, 0.72);
      sprite.alpha = 0.42;
      layer.addChild(sprite);
      continue;
    }
    drewFallbackGraphics = true;
    graphics.circle(building.x, building.y, building.radius);
    graphics.fill({ color: 0x6f3a32, alpha: 0.38 });
    graphics.circle(building.x, building.y, building.radius);
    graphics.stroke({ width: 2, color: 0x1a1410, alpha: 0.45 });
  }
  if (drewFallbackGraphics) {
    layer.addChild(graphics);
  }
}

function isLastSeenBuildingVisible(world: WorldState, building: WorldState["lastSeenBuildings"][number]): boolean {
  const definition = world.unitDefinitions.find((unit) => unit.id === building.typeId);
  return isUnitFootprintVisibleToPlayer(world, {
    x: building.x,
    y: building.y,
    radius: building.radius,
    tileWidth: definition?.tileSize?.[0] ?? Math.max(1, Math.ceil((building.radius * 2) / world.tileSize)),
    tileHeight: definition?.tileSize?.[1] ?? Math.max(1, Math.ceil((building.radius * 2) / world.tileSize))
  }, world.visibilityPlayer);
}

function compareLastSeenBuildingDrawOrder(left: WorldState["lastSeenBuildings"][number], right: WorldState["lastSeenBuildings"][number]): number {
  return left.drawLevel - right.drawLevel
    || (left.y + left.radius) - (right.y + right.radius)
    || left.unitId.localeCompare(right.unitId);
}

function sourceFancyBuildingMirror(world: WorldState, unit: WorldState["units"][number]): boolean {
  return world.engineSettings.useFancyBuildingsDefault === true
    && isRuntimeSourceBuildingUnit(unit)
    && sourceStableMirrorHash(`${unit.typeId}:${unit.id}`) % 2 === 0;
}

function sourceLastSeenFancyBuildingMirror(world: WorldState, typeId: string, id: string): boolean {
  return world.engineSettings.useFancyBuildingsDefault === true
    && sourceStableMirrorHash(`${typeId}:${id}`) % 2 === 0;
}

function sourceStableMirrorHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function drawCorpses(layer: Container, world: WorldState, manifest: WargusManifest, unitAtlases: Map<string, UnitTextureAtlas>, viewport: WorldViewport, strata: { minDrawLevel?: number; maxDrawLevel?: number } = {}): void {
  if (!world.corpses || world.corpses.length === 0) {
    return;
  }
  const graphics = new Graphics();
  let drewFallbackGraphics = false;
  for (const corpse of [...world.corpses].sort(compareCorpseDrawOrder)) {
    if (corpse.drawLevel < (strata.minDrawLevel ?? 0) || corpse.drawLevel > (strata.maxDrawLevel ?? Number.POSITIVE_INFINITY)) {
      continue;
    }
    if (!isCorpseVisibleToPlayer(world, corpse, world.visibilityPlayer) || !circleIntersectsViewport(corpse.x, corpse.y, corpse.radius + 64, viewport)) {
      continue;
    }
    const progress = Math.min(1, corpse.age / Math.max(0.01, corpse.duration));
    const atlas = unitAtlases.get(corpse.typeId);
    const frameNumber = getCorpseFrameNumber(corpse, manifest, world, atlas?.numDirections ?? 0);
    const texture = atlas && frameNumber !== null ? getFrameTexture(atlas, frameNumber) : null;
    if (atlas && texture) {
      const direction = spriteDirectionForFacing(corpse.facing ?? 4, atlas.numDirections);
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.72);
      sprite.position.set(corpse.x, corpse.y + 10);
      sprite.scale.set(direction.mirror ? -0.72 : 0.72, 0.72);
      sprite.alpha = Math.max(0.18, 0.82 - progress * 0.52);
      layer.addChild(sprite);
      continue;
    }
    drewFallbackGraphics = true;
    const alpha = Math.max(0.12, 0.55 - progress * 0.38);
    graphics.ellipse(corpse.x, corpse.y + corpse.radius * 0.25, corpse.radius * 0.85, corpse.radius * 0.38);
    graphics.fill({ color: 0x4f3024, alpha });
    graphics.ellipse(corpse.x - corpse.radius * 0.2, corpse.y, corpse.radius * 0.38, corpse.radius * 0.22);
    graphics.fill({ color: 0x6e4a34, alpha: alpha * 0.8 });
  }
  if (drewFallbackGraphics) {
    layer.addChild(graphics);
  }
}

function isCorpseVisibleToPlayer(world: WorldState, corpse: WorldState["corpses"][number], playerId: number): boolean {
  return isCircleVisibleToPlayer(world, corpse.x, corpse.y, corpse.radius, playerId)
    || (corpse.visibleUnderFog && isCorpseExploredByPlayer(world, corpse, playerId));
}

function isCorpseExploredByPlayer(world: WorldState, corpse: WorldState["corpses"][number], playerId: number): boolean {
  if (playerId !== world.visibilityPlayer) {
    return isCircleVisibleToPlayer(world, corpse.x, corpse.y, corpse.radius, playerId);
  }
  const clampedRadius = Math.max(0, corpse.radius);
  const left = Math.floor((corpse.x - clampedRadius) / world.tileSize);
  const right = Math.floor((corpse.x + clampedRadius) / world.tileSize);
  const top = Math.floor((corpse.y - clampedRadius) / world.tileSize);
  const bottom = Math.floor((corpse.y + clampedRadius) / world.tileSize);
  for (let tileY = top; tileY <= bottom; tileY += 1) {
    for (let tileX = left; tileX <= right; tileX += 1) {
      if (tileX >= 0 && tileY >= 0 && tileX < world.map.width && tileY < world.map.height && world.exploredTiles[tileY * world.map.width + tileX] === 1) {
        return true;
      }
    }
  }
  return false;
}

function compareCorpseDrawOrder(left: WorldState["corpses"][number], right: WorldState["corpses"][number]): number {
  return left.drawLevel - right.drawLevel
    || (left.y + left.radius) - (right.y + right.radius)
    || left.id.localeCompare(right.id);
}

function getLastSeenBuildingFrameNumber(building: WorldState["lastSeenBuildings"][number], manifest: WargusManifest, numDirections: number): number {
  if (!building.animation) {
    return 0;
  }
  const animation = manifest.animations.find((candidate) => candidate.id === building.animation);
  const frames = animation?.actions.Still ?? animation?.actions.Move ?? animation?.actions.Attack;
  return (frames?.[0]?.frame ?? 0) + spriteDirectionForFacing(building.facing ?? 4, numDirections).offset;
}

function drawProjectiles(layer: Container, world: WorldState, viewport: WorldViewport, missileAtlases: Map<string, MissileTextureAtlas>, strata: { minDrawLevel?: number; maxDrawLevel?: number } = {}): void {
  if (world.projectiles.length === 0) {
    return;
  }
  const graphics = new Graphics();
  let drewFallbackGraphics = false;
  const projectiles = [...world.projectiles].sort((a, b) => a.drawLevel - b.drawLevel);
  for (const projectile of projectiles) {
    if (projectile.drawLevel < (strata.minDrawLevel ?? 0) || projectile.drawLevel > (strata.maxDrawLevel ?? Number.POSITIVE_INFINITY)) {
      continue;
    }
    const atlas = projectile.missileId ? missileAtlases.get(projectile.missileId) : undefined;
    const drawPosition = projectileDrawPosition(projectile);
    const visibilityRadius = projectileVisibilityRadius(projectile, atlas);
    if (!isCircleVisibleToPlayer(world, drawPosition.x, drawPosition.y, visibilityRadius, world.visibilityPlayer)) {
      continue;
    }
    if (!circleIntersectsViewport(drawPosition.x, drawPosition.y, visibilityRadius, viewport)) {
      continue;
    }
    const dx = projectile.targetX - projectile.x;
    const dy = projectile.targetY - projectile.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / distance;
    const ny = dy / distance;
    if (isDamageHitProjectile(projectile)) {
      drawDamageHitProjectile(layer, projectile, drawPosition);
      continue;
    }
    if (atlas) {
      const texture = getMissileFrameTexture(atlas, missileFrameNumber(world, projectile, atlas));
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(drawPosition.x, drawPosition.y);
      sprite.rotation = atlas.numDirections > 1 ? 0 : Math.atan2(dy, dx);
      sprite.scale.set(missileSpriteScale());
      layer.addChild(sprite);
      continue;
    }
    if (projectile.kind === "axe") {
      drewFallbackGraphics = true;
      const spin = world.elapsed * 18 + projectile.age * 20;
      const size = 5 + Math.sin(spin) * 1.5;
      graphics.circle(drawPosition.x, drawPosition.y, Math.max(3, size));
      graphics.stroke({ width: 2, color: 0xd8d3bd, alpha: 0.95 });
      graphics.moveTo(drawPosition.x - ny * 6, drawPosition.y + nx * 6);
      graphics.lineTo(drawPosition.x + ny * 6, drawPosition.y - nx * 6);
      graphics.stroke({ width: 2, color: 0x8b7346, alpha: 0.95 });
      continue;
    }
    if (projectile.kind === "cannon") {
      drewFallbackGraphics = true;
      graphics.circle(drawPosition.x, drawPosition.y, 5);
      graphics.fill(0x1b1712);
      graphics.circle(drawPosition.x - nx * 5, drawPosition.y - ny * 5, 7);
      graphics.fill({ color: 0xd95d45, alpha: 0.22 });
      continue;
    }
    if (projectile.kind === "siege") {
      drewFallbackGraphics = true;
      const rockColor = siegeProjectileFallbackColor(world, projectile);
      graphics.moveTo(drawPosition.x - nx * 14, drawPosition.y - ny * 14);
      graphics.lineTo(drawPosition.x + nx * 10, drawPosition.y + ny * 10);
      graphics.stroke({ width: 4, color: rockColor, alpha: 0.95 });
      graphics.circle(drawPosition.x, drawPosition.y, 5);
      graphics.fill(rockColor);
      continue;
    }
    if (projectile.kind === "torpedo") {
      drewFallbackGraphics = true;
      graphics.moveTo(drawPosition.x - nx * 16, drawPosition.y - ny * 16);
      graphics.lineTo(drawPosition.x + nx * 8, drawPosition.y + ny * 8);
      graphics.stroke({ width: 3, color: 0x9fc6d5, alpha: 0.92 });
      graphics.circle(drawPosition.x, drawPosition.y, 4);
      graphics.fill(0x3d5f6a);
      continue;
    }
    if (isLightningLikeProjectile(world, projectile)) {
      drewFallbackGraphics = true;
      graphics.moveTo(drawPosition.x - nx * 18, drawPosition.y - ny * 18);
      graphics.lineTo(drawPosition.x - nx * 8 + ny * 4, drawPosition.y - ny * 8 - nx * 4);
      graphics.lineTo(drawPosition.x, drawPosition.y);
      graphics.stroke({ width: 3, color: 0x8fd5ff, alpha: 0.95 });
      continue;
    }
    if (isFireLikeProjectile(world, projectile)) {
      drewFallbackGraphics = true;
      const griffonLike = sourceMissileVisualRole(world, projectile) === "hammer";
      graphics.circle(drawPosition.x, drawPosition.y, griffonLike ? 5 : 7);
      graphics.fill({ color: griffonLike ? 0xd8d3bd : 0xf07d28, alpha: 0.95 });
      graphics.circle(drawPosition.x - nx * 6, drawPosition.y - ny * 6, 9);
      graphics.fill({ color: 0xd95d45, alpha: 0.24 });
      continue;
    }

    drewFallbackGraphics = true;
    const tailX = drawPosition.x - nx * 18;
    const tailY = drawPosition.y - ny * 18;
    graphics.moveTo(tailX, tailY);
    graphics.lineTo(drawPosition.x, drawPosition.y);
    graphics.stroke({ width: 2, color: sourcePlayerColor(world, projectile.player, 0, [214, 208, 163]), alpha: 0.95 });
    graphics.moveTo(drawPosition.x, drawPosition.y);
    graphics.lineTo(drawPosition.x - nx * 6 + ny * 3, drawPosition.y - ny * 6 - nx * 3);
    graphics.moveTo(drawPosition.x, drawPosition.y);
    graphics.lineTo(drawPosition.x - nx * 6 - ny * 3, drawPosition.y - ny * 6 + nx * 3);
    graphics.stroke({ width: 1, color: 0xd8d3bd, alpha: 0.9 });
  }
  if (drewFallbackGraphics) {
    layer.addChild(graphics);
  }
}

function isDamageHitProjectile(projectile: WorldState["projectiles"][number]): boolean {
  return projectile.className === "missile-class-hit" && typeof projectile.displayDamage === "number";
}

function drawDamageHitProjectile(layer: Container, projectile: WorldState["projectiles"][number], position: { x: number; y: number }): void {
  const text = new Text({
    text: String(projectile.displayDamage ?? -projectile.damage),
    style: {
      fontFamily: "monospace",
      fontSize: 12,
      fill: 0xf8e48a,
      stroke: { color: 0x2a160c, width: 2 }
    }
  });
  text.anchor.set(0.5);
  text.position.set(position.x, position.y);
  layer.addChild(text);
}

function projectileDrawPosition(projectile: WorldState["projectiles"][number]): { x: number; y: number } {
  if (!isParabolicProjectile(projectile)) {
    return { x: projectile.x, y: projectile.y };
  }
  const totalDistance = Math.max(1, Math.hypot(projectile.targetX - projectile.originX, projectile.targetY - projectile.originY));
  const remainingDistance = Math.hypot(projectile.targetX - projectile.x, projectile.targetY - projectile.y);
  const progress = Math.max(0, Math.min(1, 1 - remainingDistance / totalDistance));
  const arcHeight = Math.min(72, Math.max(24, totalDistance * 0.18));
  return { x: projectile.x, y: projectile.y - Math.sin(progress * Math.PI) * arcHeight };
}

function isParabolicProjectile(projectile: WorldState["projectiles"][number]): boolean {
  return projectile.className === "missile-class-parabolic";
}

function siegeProjectileFallbackColor(world: WorldState, projectile: WorldState["projectiles"][number]): number {
  return sourceMissileVisualRole(world, projectile) === "stone" ? 0x5f554b : 0xc8b98f;
}

function isLightningLikeProjectile(world: WorldState, projectile: WorldState["projectiles"][number]): boolean {
  return sourceMissileVisualRole(world, projectile) === "lightning";
}

function isFireLikeProjectile(world: WorldState, projectile: WorldState["projectiles"][number]): boolean {
  const role = sourceMissileVisualRole(world, projectile);
  return role === "flame" || role === "hammer";
}

function missileFrameNumber(world: WorldState, projectile: WorldState["projectiles"][number], atlas: MissileTextureAtlas): number {
  if (atlas.frameCount <= 1) {
    return 0;
  }
  const frameRate = missileFrameRate(world, atlas);
  const animationFrame = Math.floor(projectile.age * frameRate) % atlas.framesPerDirection;
  return missileDirectionFrameOffset(projectile, atlas) + animationFrame;
}

function missileFrameRate(world: WorldState, atlas: MissileTextureAtlas): number {
  return Math.max(1, sourceDefaultGameSpeed(world) / sourceMissileSleepTicks(atlas));
}

function sourceMissileSleepTicks(atlas: Pick<MissileTextureAtlas, "sleep">): number {
  return Math.max(1, atlas.sleep);
}

function missileDirectionFrameOffset(projectile: WorldState["projectiles"][number], atlas: MissileTextureAtlas): number {
  if (atlas.numDirections <= 1) {
    return 0;
  }
  const angle = Math.atan2(projectile.targetY - projectile.y, projectile.targetX - projectile.x);
  const direction = ((Math.round(angle / ((Math.PI * 2) / atlas.numDirections)) % atlas.numDirections) + atlas.numDirections) % atlas.numDirections;
  return Math.min(atlas.frameCount - atlas.framesPerDirection, direction * atlas.framesPerDirection);
}

function missileSpriteScale(): number {
  return 1;
}

function projectileVisibilityRadius(projectile: WorldState["projectiles"][number], atlas: MissileTextureAtlas | undefined): number {
  if (atlas) {
    return Math.ceil(Math.max(atlas.frameWidth, atlas.frameHeight) * missileSpriteScale() * 0.5);
  }
  if (projectile.kind === "siege" || projectile.kind === "torpedo") {
    return 28;
  }
  if (projectile.kind === "cannon") {
    return 18;
  }
  return 22;
}

function drawSpellEffects(layer: Container, world: WorldState, viewport: WorldViewport, missileAtlases: Map<string, MissileTextureAtlas>, strata: { minDrawLevel?: number; maxDrawLevel?: number } = {}): void {
  if (!world.spellEffects || world.spellEffects.length === 0) {
    return;
  }
  const graphics = new Graphics();
  let drewFallbackGraphics = false;
  const enhancedEffects = world.engineSettings.enhancedEffectsDefault !== false;
  const effects = [...world.spellEffects].sort(compareSpellEffectDrawOrder);
  for (const effect of effects) {
    if (effect.drawLevel < (strata.minDrawLevel ?? 0) || effect.drawLevel > (strata.maxDrawLevel ?? Number.POSITIVE_INFINITY)) {
      continue;
    }
    if (!isCircleVisibleToPlayer(world, effect.x, effect.y, effect.radius, world.visibilityPlayer)) {
      continue;
    }
    if (!circleIntersectsViewport(effect.x, effect.y, effect.radius + 24, viewport)) {
      continue;
    }
    const progress = Math.min(1, effect.age / Math.max(0.01, effect.duration));
    const persistent = effect.kind === "blizzard" || effect.kind === "death-and-decay";
    const alpha = persistent ? Math.max(0.28, 0.72 - progress * 0.35) : Math.max(0, 1 - progress);
    const pulse = effect.radius * (0.55 + progress * 0.65);
    const color = spellColor(effect.kind);
    const atlas = effect.missileId ? missileAtlases.get(effect.missileId) : undefined;
    if (atlas) {
      if (persistent) {
        drawAreaSpellMissiles(layer, world, effect, atlas, alpha);
        continue;
      }
      const texture = getMissileFrameTexture(atlas, spellEffectMissileFrame(world, effect, atlas));
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(effect.x, effect.y);
      sprite.alpha = Math.max(0.05, alpha);
      sprite.scale.set(spellEffectSpriteScale(effect, atlas));
      layer.addChild(sprite);
      continue;
    }
    drewFallbackGraphics = true;
    graphics.circle(effect.x, effect.y, pulse);
    graphics.stroke({ width: 3, color, alpha: alpha * 0.9 });
    graphics.circle(effect.x, effect.y, Math.max(6, effect.radius * 0.2));
    graphics.fill({ color, alpha: alpha * 0.16 });
    if (!enhancedEffects) {
      continue;
    }
    if (effect.kind === "fireball" || effect.kind === "flame-shield") {
      graphics.circle(effect.x, effect.y, effect.radius * 0.35 * (1 + progress));
      graphics.fill({ color: 0xf0df9a, alpha: alpha * 0.22 });
    }
    if (effect.kind === "explosion") {
      const shock = effect.radius * (0.32 + progress * 0.9);
      graphics.circle(effect.x, effect.y, shock);
      graphics.stroke({ width: Math.max(2, 7 - progress * 4), color: 0xf6c15a, alpha: alpha * 0.8 });
      graphics.circle(effect.x, effect.y, Math.max(8, effect.radius * 0.22));
      graphics.fill({ color: 0xff7b3d, alpha: alpha * 0.35 });
      graphics.circle(effect.x, effect.y, Math.max(5, effect.radius * 0.11));
      graphics.fill({ color: 0xffefb0, alpha: alpha * 0.5 });
    }
    if (effect.kind === "blizzard" || effect.kind === "death-and-decay") {
      const tick = Math.floor(effect.age * 12);
      for (let index = 0; index < 8; index += 1) {
        const angle = (index * 2.399 + tick * 0.27) % (Math.PI * 2);
        const ring = effect.radius * (0.18 + ((index * 37 + tick * 11) % 73) / 100);
        const x = effect.x + Math.cos(angle) * ring;
        const y = effect.y + Math.sin(angle) * ring;
        if (effect.kind === "blizzard") {
          graphics.moveTo(x - 4, y - 12);
          graphics.lineTo(x + 4, y + 10);
          graphics.stroke({ width: 2, color, alpha: alpha * 0.75 });
        } else {
          graphics.circle(x, y, 5 + (index % 3) * 2);
          graphics.fill({ color, alpha: alpha * 0.18 });
        }
      }
    }
    if (effect.kind === "death-coil") {
      graphics.moveTo(effect.x - effect.radius * 0.35, effect.y);
      graphics.lineTo(effect.x + effect.radius * 0.35, effect.y);
      graphics.moveTo(effect.x, effect.y - effect.radius * 0.35);
      graphics.lineTo(effect.x, effect.y + effect.radius * 0.35);
      graphics.stroke({ width: 2, color, alpha: alpha * 0.75 });
    }
  }
  if (drewFallbackGraphics) {
    layer.addChild(graphics);
  }
}

function compareSpellEffectDrawOrder(left: WorldState["spellEffects"][number], right: WorldState["spellEffects"][number]): number {
  return left.drawLevel - right.drawLevel
    || left.y - right.y
    || left.id.localeCompare(right.id);
}

function drawAreaSpellMissiles(layer: Container, world: WorldState, effect: WorldState["spellEffects"][number], atlas: MissileTextureAtlas, alpha: number): void {
  const sourceArea = sourceAreaBombardmentForEffect(world, effect);
  const impacts = sourceAreaBombardmentVisualImpacts(world, effect, sourceArea);
  const frameTick = Math.floor(effect.age * missileFrameRate(world, atlas));
  for (const impact of impacts) {
    const texture = getMissileFrameTexture(atlas, (frameTick + impact.index) % Math.max(1, atlas.framesPerDirection));
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.position.set(impact.x, impact.y);
    sprite.alpha = Math.max(0.08, alpha * (0.55 + ((impact.seed * 7) % 40) / 100));
    const size = effect.kind === "blizzard" ? 34 : 40;
    sprite.scale.set(Math.max(0.55, Math.min(1.15, size / Math.max(atlas.frameWidth, atlas.frameHeight))));
    layer.addChild(sprite);
  }
}

function sourceAreaBombardmentForEffect(world: WorldState, effect: WorldState["spellEffects"][number]): WorldState["spellDefinitions"][number]["areaBombardments"][number] | null {
  const spellId = effect.spellId ?? (effect.kind === "blizzard" ? "spell-blizzard" : effect.kind === "death-and-decay" ? "spell-death-and-decay" : null);
  return spellId ? world.spellDefinitions.find((spell) => spell.id === spellId)?.areaBombardments[0] ?? null : null;
}

function sourceAreaBombardmentVisualImpacts(
  world: WorldState,
  effect: WorldState["spellEffects"][number],
  sourceArea: WorldState["spellDefinitions"][number]["areaBombardments"][number] | null
): Array<{ x: number; y: number; index: number; seed: number }> {
  const fields = Math.max(1, Math.floor(sourceArea?.fields ?? Math.max(1, Math.round((effect.radius * 2) / world.tileSize))));
  const shards = Math.max(1, Math.floor(sourceArea?.shards ?? Math.max(5, Math.min(14, Math.round(effect.radius / 10)))));
  const fieldSize = fields * world.tileSize;
  const startOffsetX = sourceArea?.startOffsetX ?? -fieldSize / 2;
  const startOffsetY = sourceArea?.startOffsetY ?? -fieldSize / 2;
  const pulseTick = sourceAreaBombardmentVisualPulseTick(world, effect);
  const impacts: Array<{ x: number; y: number; index: number; seed: number }> = [];
  for (let index = 0; index < shards; index += 1) {
    const xHash = Math.abs(sourceStableVisualHash(`${effect.id}:${pulseTick}:${index}:x`));
    const yHash = Math.abs(sourceStableVisualHash(`${effect.id}:${pulseTick}:${index}:y`));
    impacts.push({
      x: effect.x + startOffsetX + (xHash % Math.max(1, fieldSize)),
      y: effect.y + startOffsetY + (yHash % Math.max(1, fieldSize)),
      index,
      seed: index * 37 + pulseTick * 5
    });
  }
  return impacts;
}

function sourceAreaBombardmentVisualPulseTick(world: WorldState, effect: WorldState["spellEffects"][number]): number {
  const missile = effect.missileId ? world.missileDefinitions.find((candidate) => candidate.id === effect.missileId) : null;
  const pulseTicks = missile && missile.blizzardSpeed > 0 ? missile.blizzardSpeed : 10;
  return Math.floor(world.tick / Math.max(1, pulseTicks)) * Math.max(1, pulseTicks);
}

function sourceStableVisualHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return hash;
}

function spellEffectMissileFrame(world: WorldState, effect: WorldState["spellEffects"][number], atlas: MissileTextureAtlas): number {
  if (atlas.frameCount <= 1) {
    return 0;
  }
  const frameRate = missileFrameRate(world, atlas);
  return Math.min(atlas.framesPerDirection - 1, Math.floor(effect.age * frameRate));
}

function spellEffectSpriteScale(effect: WorldState["spellEffects"][number], atlas: MissileTextureAtlas): number {
  return Math.max(0.6, Math.min(1.35, (effect.radius * 2) / Math.max(atlas.frameWidth, atlas.frameHeight)));
}

function spellColor(kind: WorldState["spellEffects"][number]["kind"]): number {
  if (kind === "heal") {
    return 0x83e68b;
  }
  if (kind === "fireball") {
    return 0xd95d45;
  }
  if (kind === "explosion") {
    return 0xf08a36;
  }
  if (kind === "flame-shield") {
    return 0xff7b3d;
  }
  if (kind === "blizzard") {
    return 0xb8e7ff;
  }
  if (kind === "polymorph") {
    return 0xf1b6ff;
  }
  if (kind === "exorcism" || kind === "holy-vision" || kind === "click-missile") {
    return 0xf6ef9b;
  }
  if (kind === "raise-dead") {
    return 0x8dd17e;
  }
  if (kind === "invisibility") {
    return 0x9fd6ff;
  }
  if (kind === "unholy-armor") {
    return 0x9a6be8;
  }
  if (kind === "runes") {
    return 0xff7b3d;
  }
  if (kind === "summon") {
    return 0xf0df9a;
  }
  if (kind === "death-coil") {
    return 0x8f65d8;
  }
  if (kind === "death-and-decay") {
    return 0x5a3f8f;
  }
  if (kind === "whirlwind") {
    return 0xd8d3bd;
  }
  if (kind === "slow") {
    return 0x77b6d8;
  }
  if (kind === "bloodlust") {
    return 0xd93434;
  }
  return 0xf0df9a;
}

function getAnimatedFrameNumber(unit: WorldState["units"][number], manifest: WargusManifest, world: WorldState, numDirections: number): number {
  if (!unit.animation) {
    return 0;
  }
  const animation = manifest.animations.find((candidate) => candidate.id === unit.animation);
  const action = animationActionForUnit(unit, world, animation);
  const frames = animation?.actions[action] ?? animation?.actions.Move ?? animation?.actions.Still ?? animation?.actions.Attack;
  if (!frames || frames.length === 0) {
    return 0;
  }

  const totalWait = frames.reduce((sum, frame) => sum + Math.max(frame.wait, 1), 0);
  let cursor = animationFrameCursorForUnitAction(unit, world, action, frames, totalWait);
  for (const frame of frames) {
    cursor -= Math.max(frame.wait, 1);
    if (cursor <= 0) {
      return frame.frame + spriteDirectionForFacing(unit.facing ?? 4, numDirections).offset;
    }
  }
  return frames[0].frame + spriteDirectionForFacing(unit.facing ?? 4, numDirections).offset;
}

function animationFrameCursorForUnitAction(unit: WorldState["units"][number], world: WorldState, action: string, frames: NonNullable<WargusAnimation["actions"][string]>, totalWait: number): number {
  if (action !== "Attack") {
    return world.tick % totalWait;
  }
  const pendingAttack = world.pendingAttacks.find((attack) => attack.sourceId === unit.id);
  if (pendingAttack) {
    const launchDelayCycles = sourceAttackAnimationLaunchDelayCyclesForRender(frames);
    const remainingCycles = Math.max(0, Math.floor(pendingAttack.remainingSeconds * sourceDefaultGameSpeed(world)));
    return Math.max(0, Math.min(totalWait - 1, launchDelayCycles - remainingCycles));
  }
  if (unit.attackCooldown > 0) {
    const remainingCycles = Math.max(0, Math.floor(unit.attackCooldown * sourceDefaultGameSpeed(world)));
    return Math.max(0, Math.min(totalWait - 1, totalWait - remainingCycles));
  }
  return world.tick % totalWait;
}

function sourceAttackAnimationLaunchDelayCyclesForRender(frames: NonNullable<WargusAnimation["actions"][string]>): number {
  let cycles = 0;
  let sawActiveFrame = false;
  for (const frame of frames) {
    const wait = Math.max(1, Math.floor(frame.wait || 1));
    if (frame.frame === 0 && sawActiveFrame) {
      break;
    }
    cycles += wait;
    if (frame.frame !== 0) {
      sawActiveFrame = true;
    }
  }
  return sawActiveFrame ? cycles : 0;
}

function getCorpseFrameNumber(corpse: WorldState["corpses"][number], manifest: WargusManifest, world: WorldState, numDirections: number): number | null {
  if (!corpse.animation) {
    return null;
  }
  const animation = manifest.animations.find((candidate) => candidate.id === corpse.animation);
  const frames = animation?.actions.Death;
  if (!frames || frames.length === 0) {
    return null;
  }
  const deathTicks = sourceCorpseAgeTicks(world, corpse);
  let cursor = deathTicks;
  for (const frame of frames) {
    cursor -= Math.max(frame.wait, 1);
    if (cursor <= 0) {
      return frame.frame + spriteDirectionForFacing(corpse.facing ?? 4, numDirections).offset;
    }
  }
  return frames[frames.length - 1].frame + spriteDirectionForFacing(corpse.facing ?? 4, numDirections).offset;
}

function animationActionForUnit(unit: WorldState["units"][number], world: WorldState, animation: WargusAnimation | undefined): string {
  const hasAction = (action: string) => Boolean(animation?.actions[action]?.length);
  if (world.activeResearch.some((research) => research.buildingId === unit.id) && hasAction("Research")) {
    return "Research";
  }
  if (unit.productionQueue[0] && hasAction("Upgrade") && isSourceUpgradeProduction(world, unit)) {
    return "Upgrade";
  }
  if (unit.productionQueue[0] && hasAction("Train")) {
    return "Train";
  }
  if (unit.construction && hasAction("Upgrade")) {
    return "Upgrade";
  }
  if (unit.spellCooldown > 0 && hasAction("SpellCast")) {
    return "SpellCast";
  }
  if (unit.order?.kind === "harvest" && unit.order.phase === "gathering" && unit.order.resource === "wood" && hasAction("Harvest_wood")) {
    return "Harvest_wood";
  }
  if (unit.order?.kind === "repair" && hasAction("Repair")) {
    return "Repair";
  }
  if (world.pendingAttacks.some((attack) => attack.sourceId === unit.id) && hasAction("Attack")) {
    return "Attack";
  }
  if (unit.attackCooldown > 0.55 && hasAction("Attack")) {
    return "Attack";
  }
  if ((unit.order?.kind === "move" || unit.order?.kind === "attack" || unit.order?.kind === "attack-move" || unit.order?.kind === "attack-ground" || unit.order?.kind === "patrol" || unit.order?.kind === "harvest" || unit.order?.kind === "build" || unit.order?.kind === "build-oil-platform" || unit.order?.kind === "load-transport" || unit.order?.kind === "follow" || unit.order?.kind === "defend" || unit.order?.kind === "unload-transport") && unit.order.path.length > 0 && hasAction("Move")) {
    return "Move";
  }
  return "Still";
}

function isSourceUpgradeProduction(world: WorldState, unit: WorldState["units"][number]): boolean {
  const active = unit.productionQueue[0];
  return Boolean(active && world.buttonDefinitions.some((button) => (
    button.action === "upgrade-to"
    && button.value === active.unitTypeId
    && sourceButtonAppliesTo(button, unit.typeId)
  )));
}

function spriteDirectionForFacing(facing: number, numDirections = 0): { offset: number; mirror: boolean } {
  if (numDirections <= 1) {
    return { offset: 0, mirror: false };
  }
  switch (((Math.round(facing) % 8) + 8) % 8) {
    case 0:
      return { offset: 2, mirror: false };
    case 1:
      return { offset: 3, mirror: false };
    case 2:
      return { offset: 4, mirror: false };
    case 3:
      return { offset: 3, mirror: true };
    case 4:
      return { offset: 2, mirror: true };
    case 5:
      return { offset: 1, mirror: true };
    case 6:
      return { offset: 0, mirror: false };
    case 7:
      return { offset: 1, mirror: false };
    default:
      return { offset: 0, mirror: false };
  }
}

function drawFog(layer: Container, world: WorldState, viewport: WorldViewport, fogAtlas: FogTextureAtlas | null): void {
  if (!world.engineSettings.fogOfWarEnabled) {
    if (fogRenderKeys.get(layer) !== "disabled") {
      layer.removeChildren();
      layer.filters = [];
      fogRenderKeys.set(layer, "disabled");
    }
    layer.visible = false;
    return;
  }
  layer.visible = true;
  fogRenderKeys.set(layer, "enabled");
  layer.removeChildren();
  const knownFogGraphics = new Graphics();
  const unknownFogGraphics = new Graphics();
  let drewKnownFallbackGraphics = false;
  let drewUnknownFogGraphics = false;
  const fogAlphas = sourceFogOpacityAlphas(world);
  const minX = Math.max(0, Math.floor(viewport.left / world.tileSize));
  const minY = Math.max(0, Math.floor(viewport.top / world.tileSize));
  const maxX = Math.min(world.map.width - 1, Math.ceil(viewport.right / world.tileSize));
  const maxY = Math.min(world.map.height - 1, Math.ceil(viewport.bottom / world.tileSize));
  const fastFog = world.engineSettings.fogOfWarType === null || world.engineSettings.fogOfWarType === "fast";
  applySourceFogBlur(layer, world, fastFog);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const index = y * world.map.width + x;
      const sourceFogTiles = sourceFogTextureFramesForTile(world, x, y);
      const sourceKnown = isWorldTileSourceKnown(world, x, y);
      if (world.visibleTiles[index] !== 1) {
        if (sourceKnown) {
          drewKnownFallbackGraphics = true;
          drawSolidFogTile(knownFogGraphics, x, y, world.tileSize, sourceFogTileAlpha(world, x, y, fogAlphas, fastFog));
        } else {
          drewUnknownFogGraphics = true;
          drawOpaqueUnknownFogTile(unknownFogGraphics, x, y, world.tileSize);
        }
      }
      if (sourceKnown && fogAtlas && sourceFogTiles.fogTile && sourceFogTiles.fogTile !== sourceFogTiles.blackFogTile) {
        drawSourceFogTile(layer, knownFogGraphics, fogAtlas, sourceFogTiles.fogTile, x, y, world.tileSize, fogAlphas[0]);
      }
      if (sourceKnown && fogAtlas && sourceFogTiles.blackFogTile) {
        drawSourceFogTile(layer, knownFogGraphics, fogAtlas, sourceFogTiles.blackFogTile, x, y, world.tileSize, fogAlphas[2]);
      }
    }
  }
  if (drewKnownFallbackGraphics) {
    layer.addChild(knownFogGraphics);
  }
  if (drewUnknownFogGraphics) {
    layer.addChild(unknownFogGraphics);
  }
}

function applySourceFogBlur(layer: Container, world: WorldState, fastFog: boolean): void {
  if (fastFog) {
    layer.filters = [];
    return;
  }
  const radius = sourceFogBlurRadius(world, fastFog);
  const quality = sourceFogBlurIterations(world);
  if (radius <= 0 || quality <= 0) {
    layer.filters = [];
    return;
  }
  let filter = sourceFogBlurFilters.get(layer);
  if (!filter) {
    filter = new BlurFilter({ strength: radius, quality });
    sourceFogBlurFilters.set(layer, filter);
  }
  filter.strength = radius;
  filter.quality = quality;
  layer.filters = [filter];
}

function sourceFogBlurRadius(world: WorldState, fastFog: boolean): number {
  const blur = world.engineSettings.fogOfWarBlur;
  const radius = fastFog || !world.engineSettings.fogOfWarBilinear ? blur.simpleRadius : blur.bilinearRadius;
  return Number.isFinite(radius) && radius > 0 ? radius : 0;
}

function sourceFogBlurIterations(world: WorldState): number {
  const iterations = Math.round(world.engineSettings.fogOfWarBlur.iterations);
  return Number.isFinite(iterations) ? Math.max(1, Math.min(255, iterations)) : 3;
}

function drawSolidFogTile(graphics: Graphics, x: number, y: number, tileSize: number, alpha: number): void {
  graphics.rect(x * tileSize, y * tileSize, tileSize, tileSize);
  graphics.fill({ color: 0x000000, alpha });
}

function drawOpaqueUnknownFogTile(graphics: Graphics, x: number, y: number, tileSize: number): void {
  graphics.rect(x * tileSize - 0.5, y * tileSize - 0.5, tileSize + 1, tileSize + 1);
  graphics.fill({ color: 0x000000, alpha: 1 });
}

function drawSourceFogTile(
  layer: Container,
  graphics: Graphics,
  fogAtlas: FogTextureAtlas | null,
  frameIndex: number,
  x: number,
  y: number,
  tileSize: number,
  alpha: number
): void {
  const texture = fogAtlas ? getFogTexture(fogAtlas, frameIndex) : null;
  if (texture) {
    const sprite = new Sprite(texture);
    sprite.position.set(x * tileSize, y * tileSize);
    sprite.width = tileSize;
    sprite.height = tileSize;
    sprite.alpha = alpha;
    layer.addChild(sprite);
    return;
  }
  graphics.rect(x * tileSize, y * tileSize, tileSize, tileSize);
  graphics.fill({ color: 0x000000, alpha });
}

function sourceFogTextureFramesForTile(world: WorldState, x: number, y: number): { fogTile: number; blackFogTile: number } {
  let fogTileIndex = 0;
  let blackFogTileIndex = 0;
  const visit = (tx: number, ty: number, mask: number): void => {
    if (tx < 0 || ty < 0 || tx >= world.map.width || ty >= world.map.height) {
      return;
    }
    const index = ty * world.map.width + tx;
    if (!isWorldTileSourceKnown(world, tx, ty)) {
      blackFogTileIndex |= mask;
      fogTileIndex |= mask;
      return;
    }
    if (world.visibleTiles[index] !== 1) {
      fogTileIndex |= mask;
    }
  };

  visit(x - 1, y - 1, 2);
  visit(x, y - 1, 3);
  visit(x + 1, y - 1, 1);
  visit(x - 1, y, 10);
  visit(x + 1, y, 5);
  visit(x - 1, y + 1, 8);
  visit(x, y + 1, 12);
  visit(x + 1, y + 1, 4);

  return {
    fogTile: sourceTiledFogTable[fogTileIndex] ?? 0,
    blackFogTile: sourceTiledFogTable[blackFogTileIndex] ?? 0
  };
}

function sourceFogOpacityAlphas(world: WorldState): [number, number, number] {
  return [
    fogByteToAlpha(world.engineSettings.fogOfWarOpacityLevels[0] ?? 0x7f),
    fogByteToAlpha(world.engineSettings.fogOfWarOpacityLevels[1] ?? 0xbe),
    fogByteToAlpha(world.engineSettings.fogOfWarOpacityLevels[2] ?? 0xfe)
  ];
}

function sourceFogTileAlpha(world: WorldState, x: number, y: number, fogAlphas: [number, number, number], fastFog: boolean): number {
  const knownFogAlpha = sourceFogKnownAlpha(world, fogAlphas);
  if (!isWorldTileSourceKnown(world, x, y)) {
    return fogAlphas[2];
  }
  if (!fastFog && world.engineSettings.fogOfWarBilinear && exploredTileTouchesVisibleTile(world, x, y)) {
    return knownFogAlpha;
  }
  return fastFog && exploredTileTouchesVisibleTile(world, x, y) ? knownFogAlpha : fogAlphas[0];
}

function sourceFogKnownAlpha(world: WorldState, fogAlphas: [number, number, number]): number {
  sourceFogEasingSteps(world);
  return fogAlphas[1];
}

function sourceFogEasingSteps(world: WorldState): number {
  const steps = Math.round(world.engineSettings.fogOfWarEasingSteps);
  return Number.isFinite(steps) ? Math.max(1, Math.min(255, steps)) : 8;
}

function exploredTileTouchesVisibleTile(world: WorldState, x: number, y: number): boolean {
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      if (ox === 0 && oy === 0) {
        continue;
      }
      const tx = x + ox;
      const ty = y + oy;
      if (tx < 0 || ty < 0 || tx >= world.map.width || ty >= world.map.height) {
        continue;
      }
      if (world.visibleTiles[ty * world.map.width + tx] === 1) {
        return true;
      }
    }
  }
  return false;
}

function circleIntersectsViewport(x: number, y: number, radius: number, viewport: WorldViewport): boolean {
  return x + radius >= viewport.left
    && x - radius <= viewport.right
    && y + radius >= viewport.top
    && y - radius <= viewport.bottom;
}

function drawSelectionHitArea(layer: Container, world: WorldState): void {
  const key = `${world.map.width}x${world.map.height}:${world.tileSize}`;
  if (selectionHitAreaKeys.get(layer) === key) {
    return;
  }
  selectionHitAreaKeys.set(layer, key);
  layer.removeChildren();
  const graphics = new Graphics();
  graphics.rect(0, 0, world.map.width * world.tileSize, world.map.height * world.tileSize);
  graphics.fill({ color: 0x000000, alpha: 0.001 });
  layer.addChild(graphics);
}
