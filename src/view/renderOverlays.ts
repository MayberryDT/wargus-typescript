import { Container, Graphics, Text } from "pixi.js";
import {
  canSelectedPlaceBuildingAtPoint,
  canSelectedIssuePendingWorldCommandAt,
  findVisibleOilPatchAt,
  isPendingBuildCommand,
  isPendingSpellCommand,
  type PendingWorldCommand
} from "../simulation/orders";
import type { WorldState, WorldUnit } from "../simulation/world";
import type { WargusManifest } from "../wargus/types";
import type { Camera } from "./camera";
import { pendingSpellPreviewRadius } from "./pendingCommandPreview";
import { sourceDiplomacyState, sourceMapAreaRect, sourceScreenPointForViewportWorldPoint, unitTypeName } from "./sourceUiHelpers";

export interface SelectionDragOverlay {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export interface AlertPingOverlay {
  x: number;
  y: number;
  createdAt: number;
  expiresAt: number;
}

interface OverlayContext {
  layer: Container;
  camera: Camera;
  world: WorldState | null;
  screenWidth: number;
  screenHeight: number;
  activeSourceViewportIndex: number;
}

interface PointerOverlayContext extends OverlayContext {
  pointerWorldPosition: { x: number; y: number } | null;
  selectedUnitIds: string[];
}

export interface SourceMapNamePopupState {
  showNameDelayTick: number;
  showNameTimeTick: number;
}

export function renderSelectionDragOverlay(context: OverlayContext, selectionDrag: SelectionDragOverlay | null): void {
  if (!selectionDrag) {
    return;
  }
  const { layer, camera, world, screenWidth, screenHeight, activeSourceViewportIndex } = context;
  if (!world) {
    return;
  }
  const start = screenPointForWorld(world, camera, screenWidth, screenHeight, selectionDrag.startX, selectionDrag.startY, activeSourceViewportIndex);
  const current = screenPointForWorld(world, camera, screenWidth, screenHeight, selectionDrag.currentX, selectionDrag.currentY, activeSourceViewportIndex);
  if (!start || !current) {
    return;
  }
  const left = Math.min(start.x, current.x);
  const top = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);
  if (width < 3 || height < 3) {
    return;
  }
  const dragBox = new Graphics();
  dragBox.rect(left, top, width, height);
  dragBox.fill({ color: 0xf2df83, alpha: 0.08 });
  dragBox.rect(left, top, width, height);
  dragBox.stroke({ width: 1, color: 0xf2df83, alpha: 0.95 });
  layer.addChild(dragBox);
}

export function renderBuildPlacementOverlay(context: PointerOverlayContext & { manifest: WargusManifest | null; pendingWorldCommand: PendingWorldCommand | null }): void {
  const { layer, camera, world, screenWidth, screenHeight, activeSourceViewportIndex, manifest, pointerWorldPosition, selectedUnitIds, pendingWorldCommand } = context;
  const command = pendingWorldCommand;
  if (!world || !manifest || !pointerWorldPosition || !isPendingBuildCommand(command)) {
    return;
  }
  const building = manifest.units.find((unit) => unit.id === command.buildingTypeId);
  if (!building) {
    return;
  }
  const width = Math.max(1, building.tileSize[0]);
  const height = Math.max(1, building.tileSize[1]);
  const tileX = Math.floor(pointerWorldPosition.x / world.tileSize - width / 2);
  const tileY = Math.floor(pointerWorldPosition.y / world.tileSize - height / 2);
  const valid = canSelectedPlaceBuildingAtPoint(world, selectedUnitIds, command.buildingTypeId, pointerWorldPosition.x, pointerWorldPosition.y, world.unitDefinitions, world.visibilityPlayer);
  const topLeft = screenPointForWorld(world, camera, screenWidth, screenHeight, tileX * world.tileSize, tileY * world.tileSize, activeSourceViewportIndex);
  if (!topLeft) {
    return;
  }
  const left = topLeft.x;
  const top = topLeft.y;
  const previewWidth = width * world.tileSize * camera.zoom;
  const previewHeight = height * world.tileSize * camera.zoom;
  const color = valid ? 0x78d26f : 0xd94e45;

  const preview = new Graphics();
  preview.rect(left, top, previewWidth, previewHeight);
  preview.fill({ color, alpha: 0.18 });
  preview.rect(left, top, previewWidth, previewHeight);
  preview.stroke({ width: 2, color, alpha: 0.95 });
  for (let x = 1; x < width; x += 1) {
    const gridX = left + x * world.tileSize * camera.zoom;
    preview.moveTo(gridX, top);
    preview.lineTo(gridX, top + previewHeight);
  }
  for (let y = 1; y < height; y += 1) {
    const gridY = top + y * world.tileSize * camera.zoom;
    preview.moveTo(left, gridY);
    preview.lineTo(left + previewWidth, gridY);
  }
  preview.stroke({ width: 1, color, alpha: 0.45 });
  layer.addChild(preview);
}

export function renderPendingCommandOverlay(context: PointerOverlayContext & { pendingWorldCommand: PendingWorldCommand | null }): void {
  const { layer, camera, world, screenWidth, screenHeight, activeSourceViewportIndex, pointerWorldPosition, selectedUnitIds, pendingWorldCommand } = context;
  const command = pendingWorldCommand;
  if (!world || !pointerWorldPosition || !command || isPendingBuildCommand(command)) {
    return;
  }
  const point = screenPointForWorld(world, camera, screenWidth, screenHeight, pointerWorldPosition.x, pointerWorldPosition.y, activeSourceViewportIndex);
  if (!point) {
    return;
  }
  const color = canSelectedIssuePendingWorldCommandAt(world, selectedUnitIds, command, pointerWorldPosition.x, pointerWorldPosition.y, world.visibilityPlayer) ? 0x78d26f : 0xd94e45;
  const preview = new Graphics();
  preview.circle(point.x, point.y, 13);
  preview.stroke({ width: 2, color, alpha: 0.92 });
  preview.moveTo(point.x - 18, point.y);
  preview.lineTo(point.x - 7, point.y);
  preview.moveTo(point.x + 7, point.y);
  preview.lineTo(point.x + 18, point.y);
  preview.moveTo(point.x, point.y - 18);
  preview.lineTo(point.x, point.y - 7);
  preview.moveTo(point.x, point.y + 7);
  preview.lineTo(point.x, point.y + 18);
  preview.stroke({ width: 2, color, alpha: 0.86 });

  if (command === "move") {
    preview.moveTo(point.x - 8, point.y);
    preview.lineTo(point.x + 8, point.y);
    preview.moveTo(point.x + 3, point.y - 5);
    preview.lineTo(point.x + 8, point.y);
    preview.lineTo(point.x + 3, point.y + 5);
    preview.stroke({ width: 2, color, alpha: 0.9 });
  } else if (command === "attack-move" || command === "attack-ground") {
    preview.moveTo(point.x - 8, point.y - 8);
    preview.lineTo(point.x + 8, point.y + 8);
    preview.moveTo(point.x + 8, point.y - 8);
    preview.lineTo(point.x - 8, point.y + 8);
    preview.stroke({ width: 2, color, alpha: 0.9 });
  } else if (command === "patrol") {
    preview.moveTo(point.x - 10, point.y + 8);
    preview.lineTo(point.x, point.y - 10);
    preview.lineTo(point.x + 10, point.y + 8);
    preview.stroke({ width: 2, color, alpha: 0.9 });
  } else if (command === "follow") {
    preview.moveTo(point.x - 9, point.y);
    preview.lineTo(point.x + 9, point.y);
    preview.moveTo(point.x, point.y - 9);
    preview.lineTo(point.x, point.y + 9);
    preview.stroke({ width: 2, color, alpha: 0.9 });
  } else if (command === "repair") {
    preview.rect(point.x - 9, point.y - 9, 18, 18);
    preview.stroke({ width: 2, color, alpha: 0.9 });
  } else if (command === "unload-transport") {
    preview.moveTo(point.x - 10, point.y - 3);
    preview.lineTo(point.x, point.y + 9);
    preview.lineTo(point.x + 10, point.y - 3);
    preview.stroke({ width: 2, color, alpha: 0.9 });
  } else if (command === "build-oil-platform") {
    const patch = findVisibleOilPatchAt(world, pointerWorldPosition.x, pointerWorldPosition.y);
    if (patch) {
      const patchPoint = screenPointForWorld(world, camera, screenWidth, screenHeight, patch.x, patch.y, activeSourceViewportIndex);
      if (!patchPoint) {
        return;
      }
      preview.circle(patchPoint.x, patchPoint.y, Math.max(18, patch.radius * camera.zoom));
      preview.stroke({ width: 3, color, alpha: 0.88 });
    }
    preview.circle(point.x, point.y, 23);
    preview.stroke({ width: 1, color, alpha: 0.52 });
  } else if (isPendingSpellCommand(command)) {
    preview.circle(point.x, point.y, Math.max(23, pendingSpellPreviewRadius(world, command.command, camera.zoom) * camera.zoom));
    preview.stroke({ width: 1, color, alpha: 0.52 });
  }
  layer.addChild(preview);
}

export function renderSourceMapNamePopup(context: OverlayContext & {
  manifest: WargusManifest | null;
  pointerScreenPosition: { x: number; y: number } | null;
  pointerWorldPosition: { x: number; y: number } | null;
  hoveredUnit: WorldUnit | null;
  popupState: SourceMapNamePopupState;
}): void {
  const { layer, world, manifest, pointerScreenPosition, pointerWorldPosition, hoveredUnit, popupState } = context;
  if (!world || !manifest || !pointerScreenPosition || !pointerWorldPosition || world.engineSettings.showNameDelayTicksDefault <= 0) {
    return;
  }
  if (!(popupState.showNameDelayTick < world.tick && world.tick < popupState.showNameTimeTick)) {
    return;
  }
  const tileX = Math.floor(pointerWorldPosition.x / world.tileSize);
  const tileY = Math.floor(pointerWorldPosition.y / world.tileSize);
  const tileIndex = tileY * world.map.width + tileX;
  const mapArea = sourceMapAreaRect(world, context.screenWidth, context.screenHeight);
  const insideMapArea = pointerScreenPosition.x >= mapArea.x
    && pointerScreenPosition.y >= mapArea.y
    && pointerScreenPosition.x < mapArea.x + mapArea.width
    && pointerScreenPosition.y < mapArea.y + mapArea.height;
  if (!insideMapArea || tileX < 0 || tileY < 0 || tileX >= world.map.width || tileY >= world.map.height) {
    return;
  }
  const visible = world.visibleTiles[tileIndex] === 1;
  const label = hoveredUnit && visible ? unitTypeName(manifest, hoveredUnit.typeId) : !visible ? "Unrevealed terrain" : null;
  if (!label) {
    return;
  }
  const backgroundColor = hoveredUnit && visible ? sourceNamePopupUnitBackground(world, hoveredUnit) : 0x0000fc;
  drawSourceNamePopup(layer, context, world, pointerScreenPosition, label, backgroundColor);
}

function drawSourceNamePopup(
  layer: Container,
  context: OverlayContext,
  world: WorldState,
  pointerScreenPosition: { x: number; y: number },
  label: string,
  backgroundColor: number
): void {
  const text = new Text({
    text: label,
    style: {
      fill: "#ffffff",
      fontFamily: "system-ui, sans-serif",
      fontSize: 11,
      stroke: { color: "#b00000", width: 1 }
    }
  });
  const width = Math.ceil(text.width) + 10;
  const height = Math.ceil(text.height) + 6;
  const mapArea = sourceMapAreaRect(world, context.screenWidth, context.screenHeight);
  const cursorWidth = 32;
  const cursorHeight = 32;
  const x = Math.min(pointerScreenPosition.x + cursorWidth, mapArea.x + mapArea.width - 1 - width);
  const y = Math.min(pointerScreenPosition.y + cursorHeight + 10, mapArea.y + mapArea.height - 1 - height);
  const box = new Graphics();
  box.rect(x, y, width, height);
  box.fill({ color: backgroundColor, alpha: 0.5 });
  box.rect(x, y, width, height);
  box.stroke({ width: 1, color: 0xffffff, alpha: 1 });
  text.anchor.set(0.5, 0);
  text.position.set(x + width / 2, y + 3);
  layer.addChild(box, text);
}

function sourceNamePopupUnitBackground(world: WorldState, unit: WorldUnit): number {
  if (unit.player === world.visibilityPlayer) {
    return 0x0000fc;
  }
  const relation = sourceDiplomacyState(world, world.visibilityPlayer, unit.player);
  if (relation === "allied") {
    return 0x00b000;
  }
  if (relation === "enemy") {
    return 0xfc0000;
  }
  return 0xb0b0b0;
}

export function renderAlertPingOverlays(context: OverlayContext, world: WorldState | null, alertPings: AlertPingOverlay[], now = performance.now()): void {
  if (!world || alertPings.length === 0) {
    return;
  }
  const { layer, camera, activeSourceViewportIndex } = context;
  for (const ping of alertPings) {
    const point = screenPointForWorld(world, camera, context.screenWidth, context.screenHeight, ping.x, ping.y, activeSourceViewportIndex);
    if (!point) {
      continue;
    }
    const progress = Math.max(0, Math.min(1, (now - ping.createdAt) / Math.max(1, ping.expiresAt - ping.createdAt)));
    const alpha = 0.95 * (1 - progress);
    const radius = (20 + Math.sin(progress * Math.PI * 8) * 5 + progress * 48) * camera.zoom;
    const alert = new Graphics();
    alert.circle(point.x, point.y, Math.max(14, radius));
    alert.stroke({ width: 3, color: 0xd95d45, alpha });
    alert.moveTo(point.x - 18, point.y);
    alert.lineTo(point.x + 18, point.y);
    alert.moveTo(point.x, point.y - 18);
    alert.lineTo(point.x, point.y + 18);
    alert.stroke({ width: 2, color: 0xf0df9a, alpha: alpha * 0.85 });
    layer.addChild(alert);
  }
}

function screenPointForWorld(
  world: WorldState,
  camera: Camera,
  screenWidth: number,
  screenHeight: number,
  x: number,
  y: number,
  activeSourceViewportIndex: number
): { x: number; y: number } | null {
  return sourceScreenPointForViewportWorldPoint(world, camera, screenWidth, screenHeight, x, y, activeSourceViewportIndex);
}
