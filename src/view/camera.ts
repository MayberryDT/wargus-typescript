import type { WorldState } from "../simulation/world";

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface CameraInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  zoomIn: boolean;
  zoomOut: boolean;
  edgeX: number;
  edgeY: number;
  edgeSpeedMultiplier: number;
  dragging: boolean;
  dragLastX: number;
  dragLastY: number;
}

export interface CameraViewport {
  width: number;
  height: number;
}

export interface ScreenSize {
  width: number;
  height: number;
}

export interface CameraScrollSettings {
  keyboardEnabled: boolean;
  mouseEnabled: boolean;
  keyScrollSpeed: number;
  mouseScrollSpeed: number;
}

export function createCamera(): Camera {
  return {
    x: 0,
    y: 0,
    zoom: 1.7
  };
}

export function createCameraInput(): CameraInput {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    zoomIn: false,
    zoomOut: false,
    edgeX: 0,
    edgeY: 0,
    edgeSpeedMultiplier: 1,
    dragging: false,
    dragLastX: 0,
    dragLastY: 0
  };
}

export function resetCameraInput(input: CameraInput): void {
  Object.assign(input, createCameraInput());
}

export function beginCameraDrag(input: CameraInput, x: number, y: number): void {
  input.dragging = true;
  input.edgeX = 0;
  input.edgeY = 0;
  input.dragLastX = x;
  input.dragLastY = y;
}

export function endCameraDrag(input: CameraInput): void {
  input.dragging = false;
}

export function dragCameraByPointer(camera: Camera, input: CameraInput, x: number, y: number, scale: number): boolean {
  if (!input.dragging) {
    return false;
  }
  camera.x -= (x - input.dragLastX) * scale / camera.zoom;
  camera.y -= (y - input.dragLastY) * scale / camera.zoom;
  input.dragLastX = x;
  input.dragLastY = y;
  return true;
}

export function resetCameraEdgeScroll(input: CameraInput): void {
  input.edgeX = 0;
  input.edgeY = 0;
  input.edgeSpeedMultiplier = 1;
}

export function updateCameraEdgeScroll(
  input: CameraInput,
  x: number,
  y: number,
  viewport: CameraViewport,
  margins: { top: number; right: number; bottom: number; left: number },
  enabled: boolean,
  speedMultiplier = 1
): void {
  const inPlayableArea = x >= 0 && x <= viewport.width && y >= 0 && y <= viewport.height;
  if (!enabled || !inPlayableArea || input.dragging) {
    resetCameraEdgeScroll(input);
    return;
  }
  input.edgeX = x <= margins.left ? -1 : x >= viewport.width - margins.right ? 1 : 0;
  input.edgeY = y <= margins.top ? -1 : y >= viewport.height - margins.bottom ? 1 : 0;
  input.edgeSpeedMultiplier = Math.max(0, speedMultiplier);
}

export function updateCamera(
  camera: Camera,
  input: CameraInput,
  deltaSeconds: number,
  world: WorldState | null,
  viewport?: CameraViewport,
  scrollSettings: CameraScrollSettings = sourceCameraScrollSettings(world)
): void {
  const keyboardMoveX = scrollSettings.keyboardEnabled ? (input.right ? 1 : 0) - (input.left ? 1 : 0) : 0;
  const keyboardMoveY = scrollSettings.keyboardEnabled ? (input.down ? 1 : 0) - (input.up ? 1 : 0) : 0;
  const mouseMoveX = scrollSettings.mouseEnabled ? input.edgeX : 0;
  const mouseMoveY = scrollSettings.mouseEnabled ? input.edgeY : 0;
  const keyboardLength = Math.hypot(keyboardMoveX, keyboardMoveY);
  if (keyboardLength > 0) {
    const scale = sourceKeyScrollPixelsPerSecond(scrollSettings.keyScrollSpeed) * deltaSeconds / camera.zoom / Math.max(1, keyboardLength);
    camera.x += keyboardMoveX * scale;
    camera.y += keyboardMoveY * scale;
  }
  const mouseLength = Math.hypot(mouseMoveX, mouseMoveY);
  if (mouseLength > 0) {
    const scale = sourceMouseScrollPixelsPerSecond(scrollSettings.mouseScrollSpeed * input.edgeSpeedMultiplier) * deltaSeconds / camera.zoom / Math.max(1, mouseLength);
    camera.x += mouseMoveX * scale;
    camera.y += mouseMoveY * scale;
  }
  if (input.zoomIn) camera.zoom += 0.9 * deltaSeconds;
  if (input.zoomOut) camera.zoom -= 0.9 * deltaSeconds;
  camera.zoom = Math.max(0.5, Math.min(2.5, camera.zoom));

  clampCameraToWorld(camera, world, viewport);
}

export function playableCameraViewport(screen: ScreenSize, world: WorldState | null = null): CameraViewport {
  return sourcePlayableViewportSize(screen, world);
}

export function currentPlayableWorldBounds(camera: Camera, screen: ScreenSize, world: WorldState | null = null): { left: number; right: number; top: number; bottom: number } {
  const viewport = sourcePlayableViewportSize(screen, world);
  return {
    left: camera.x,
    right: camera.x + viewport.width / camera.zoom,
    top: camera.y,
    bottom: camera.y + viewport.height / camera.zoom
  };
}

export function centerCameraOnTile(camera: Camera, world: WorldState, tileX: number, tileY: number, viewport: CameraViewport): void {
  const targetX = tileX * world.tileSize + world.tileSize / 2;
  const targetY = tileY * world.tileSize + world.tileSize / 2;
  centerCameraOnWorldPoint(camera, world, targetX, targetY, viewport);
}

export function centerCameraOnWorldPoint(camera: Camera, world: WorldState, x: number, y: number, viewport: CameraViewport): void {
  camera.x = x - viewport.width / (2 * camera.zoom);
  camera.y = y - viewport.height / (2 * camera.zoom);
  clampCameraToWorld(camera, world, viewport);
}

export function zoomCameraAtScreenPoint(camera: Camera, screenX: number, screenY: number, deltaZoom: number): void {
  const previousZoom = camera.zoom;
  const nextZoom = Math.max(0.5, Math.min(2.5, previousZoom + deltaZoom));
  if (nextZoom === previousZoom) {
    return;
  }
  const worldX = camera.x + screenX / previousZoom;
  const worldY = camera.y + screenY / previousZoom;
  camera.zoom = nextZoom;
  camera.x = worldX - screenX / nextZoom;
  camera.y = worldY - screenY / nextZoom;
}

export function sourceCameraScrollSettings(world: WorldState | null): CameraScrollSettings {
  return {
    keyboardEnabled: world?.engineSettings.enableKeyboardScrollingDefault !== false,
    mouseEnabled: world?.engineSettings.enableMouseScrollingDefault !== false,
    keyScrollSpeed: Math.max(0, world?.engineSettings.keyScrollSpeedDefault ?? 4),
    mouseScrollSpeed: Math.max(0, world?.engineSettings.mouseScrollSpeedDefault ?? 1)
  };
}

function sourceKeyScrollPixelsPerSecond(sourceSpeed: number): number {
  return Math.max(0, sourceSpeed) * 130;
}

function sourceMouseScrollPixelsPerSecond(sourceSpeed: number): number {
  return Math.max(0, sourceSpeed) * 520;
}

export function sourcePlayableViewportSize(screen: ScreenSize, world: WorldState | null): CameraViewport {
  if (world?.engineSettings.bigScreenDefault) {
    return {
      width: screen.width,
      height: screen.height
    };
  }
  const source = world?.engineSettings.mapArea ?? null;
  if (!source) {
    const sideWidth = sourceHudSideWidth(screen.width);
    return {
      width: Math.max(0, screen.width - sideWidth),
      height: screen.height
    };
  }
  const baseWidth = Math.max(1, world?.engineSettings.videoWidthDefault ?? source.baseWidth);
  const baseHeight = Math.max(1, world?.engineSettings.videoHeightDefault ?? source.baseHeight);
  const scaleX = screen.width / baseWidth;
  const scaleY = screen.height / baseHeight;
  return {
    width: Math.max(0, screen.width - source.x * scaleX - source.rightMargin * scaleX),
    height: Math.max(0, screen.height - source.y * scaleY - source.bottomMargin * scaleY)
  };
}

export function clampCameraToWorld(camera: Camera, world: WorldState | null, viewport?: CameraViewport): void {
  if (!world) {
    return;
  }
  const width = world.map.width * world.tileSize;
  const height = world.map.height * world.tileSize;
  const viewWidth = viewport?.width ?? 0;
  const viewHeight = viewport?.height ?? 0;
  const maxX = Math.max(0, width - viewWidth / camera.zoom);
  const maxY = Math.max(0, height - viewHeight / camera.zoom);
  camera.x = Math.max(0, Math.min(maxX, camera.x));
  camera.y = Math.max(0, Math.min(maxY, camera.y));
}

function sourceHudSideWidth(screenWidth: number): number {
  return Math.min(320, Math.max(248, screenWidth * 0.24));
}
