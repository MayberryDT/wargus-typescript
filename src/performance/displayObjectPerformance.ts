import { Container, Graphics, Sprite, Text, type CanvasTextOptions, type DestroyOptions } from "pixi.js";

export type WorldRenderPerformanceKind = "unit" | "lastSeenBuilding" | "corpse" | "projectile" | "spellEffect";

export type DisplayObjectPerformanceSnapshot = {
  scope: "instrumented-pixi-scene-objects-textures-excluded";
  captureActive: boolean;
  trackedCreated: number;
  trackedDestroyed: number;
  windowLiveDelta: number;
  plan022: {
    worldRenderCache: Record<WorldRenderPerformanceKind, { trackedCreated: number; trackedDestroyed: number; windowLiveDelta: number }>;
  };
};

let captureActive = false;
let created = 0;
let destroyed = 0;
const worldRenderKinds: WorldRenderPerformanceKind[] = ["unit", "lastSeenBuilding", "corpse", "projectile", "spellEffect"];
const worldRenderCacheCounters = createWorldRenderCacheCounters();

function createWorldRenderCacheCounters(): Record<WorldRenderPerformanceKind, { trackedCreated: number; trackedDestroyed: number }> {
  return {
    unit: { trackedCreated: 0, trackedDestroyed: 0 },
    lastSeenBuilding: { trackedCreated: 0, trackedDestroyed: 0 },
    corpse: { trackedCreated: 0, trackedDestroyed: 0 },
    projectile: { trackedCreated: 0, trackedDestroyed: 0 },
    spellEffect: { trackedCreated: 0, trackedDestroyed: 0 }
  };
}

function recordCreated(object: Container, kind?: WorldRenderPerformanceKind): void {
  if (!captureActive) return;
  const count = displayObjectTreeSize(object);
  created += count;
  if (kind) worldRenderCacheCounters[kind].trackedCreated += count;
}

function displayObjectTreeSize(object: Container): number {
  let count = 1;
  for (const child of object.children) count += displayObjectTreeSize(child);
  return count;
}

export function setDisplayObjectPerformanceCapture(active: boolean): void {
  captureActive = active;
}

export function recordTrackedCreation<T extends Container | null>(object: T, kind?: WorldRenderPerformanceKind): T {
  if (object) recordCreated(object, kind);
  return object;
}

export function createTrackedContainer(kind?: WorldRenderPerformanceKind): Container {
  return recordTrackedCreation(new Container(), kind);
}

export function createTrackedGraphics(options?: ConstructorParameters<typeof Graphics>[0], kind?: WorldRenderPerformanceKind): Graphics {
  return recordTrackedCreation(new Graphics(options), kind);
}

export function createTrackedSprite(options?: ConstructorParameters<typeof Sprite>[0], kind?: WorldRenderPerformanceKind): Sprite {
  return recordTrackedCreation(new Sprite(options), kind);
}

export function createTrackedText(options?: CanvasTextOptions, kind?: WorldRenderPerformanceKind): Text {
  return recordTrackedCreation(new Text(options), kind);
}

export function destroyTrackedDisplayObject(object: Container, options?: DestroyOptions, kind?: WorldRenderPerformanceKind): void {
  const destroysChildren = typeof options === "boolean" ? options : Boolean(options?.children);
  if (captureActive) {
    const count = destroysChildren ? displayObjectTreeSize(object) : 1;
    destroyed += count;
    if (kind) worldRenderCacheCounters[kind].trackedDestroyed += count;
  }
  object.destroy(options);
}

export function resetDisplayObjectPerformance(): void {
  created = 0;
  destroyed = 0;
  for (const kind of worldRenderKinds) {
    worldRenderCacheCounters[kind].trackedCreated = 0;
    worldRenderCacheCounters[kind].trackedDestroyed = 0;
  }
}

export function snapshotDisplayObjectPerformance(): DisplayObjectPerformanceSnapshot {
  return {
    scope: "instrumented-pixi-scene-objects-textures-excluded",
    captureActive,
    trackedCreated: created,
    trackedDestroyed: destroyed,
    windowLiveDelta: created - destroyed,
    plan022: {
      worldRenderCache: Object.fromEntries(worldRenderKinds.map((kind) => {
        const value = worldRenderCacheCounters[kind];
        return [kind, { ...value, windowLiveDelta: value.trackedCreated - value.trackedDestroyed }];
      })) as DisplayObjectPerformanceSnapshot["plan022"]["worldRenderCache"]
    }
  };
}
