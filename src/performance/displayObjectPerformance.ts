import { Container, Graphics, Sprite, Text, type CanvasTextOptions, type DestroyOptions } from "pixi.js";

export type DisplayObjectPerformanceSnapshot = {
  scope: "instrumented-pixi-scene-objects-textures-excluded";
  captureActive: boolean;
  trackedCreated: number;
  trackedDestroyed: number;
  windowLiveDelta: number;
};

let captureActive = false;
let created = 0;
let destroyed = 0;

function recordCreated(): void {
  if (captureActive) created += 1;
}

function displayObjectTreeSize(object: Container): number {
  let count = 1;
  for (const child of object.children) count += displayObjectTreeSize(child);
  return count;
}

export function setDisplayObjectPerformanceCapture(active: boolean): void {
  captureActive = active;
}

export function recordTrackedCreation<T extends Container | null>(object: T): T {
  if (object) recordCreated();
  return object;
}

export function createTrackedContainer(): Container {
  return recordTrackedCreation(new Container());
}

export function createTrackedGraphics(options?: ConstructorParameters<typeof Graphics>[0]): Graphics {
  return recordTrackedCreation(new Graphics(options));
}

export function createTrackedSprite(options?: ConstructorParameters<typeof Sprite>[0]): Sprite {
  return recordTrackedCreation(new Sprite(options));
}

export function createTrackedText(options?: CanvasTextOptions): Text {
  return recordTrackedCreation(new Text(options));
}

export function destroyTrackedDisplayObject(object: Container, options?: DestroyOptions): void {
  const destroysChildren = typeof options === "boolean" ? options : Boolean(options?.children);
  if (captureActive) destroyed += destroysChildren ? displayObjectTreeSize(object) : 1;
  object.destroy(options);
}

export function resetDisplayObjectPerformance(): void {
  created = 0;
  destroyed = 0;
}

export function snapshotDisplayObjectPerformance(): DisplayObjectPerformanceSnapshot {
  return {
    scope: "instrumented-pixi-scene-objects-textures-excluded",
    captureActive,
    trackedCreated: created,
    trackedDestroyed: destroyed,
    windowLiveDelta: created - destroyed
  };
}
