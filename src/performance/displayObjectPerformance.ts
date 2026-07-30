import { Container, Graphics, Sprite, Text, type CanvasTextOptions, type DestroyOptions } from "pixi.js";

export type WorldRenderPerformanceKind = "unit" | "lastSeenBuilding" | "corpse" | "projectile" | "spellEffect";

type WorldRenderCachePerformanceState = { active: number; dormant: number; pooled: number };

type WorldRenderCachePerformanceCounter = WorldRenderCachePerformanceState & {
  trackedCreated: number;
  reused: number;
  trackedDestroyed: number;
  activeHighWater: number;
  dormantHighWater: number;
  pooledHighWater: number;
};

export type DisplayObjectPerformanceSnapshot = {
  scope: "instrumented-pixi-scene-objects-textures-excluded";
  captureActive: boolean;
  trackedCreated: number;
  trackedDestroyed: number;
  windowLiveDelta: number;
  plan022: {
    worldRenderCache: Record<WorldRenderPerformanceKind, WorldRenderCachePerformanceCounter & { windowLiveDelta: number }>;
  };
};

let captureActive = false;
let created = 0;
let destroyed = 0;
const worldRenderKinds: WorldRenderPerformanceKind[] = ["unit", "lastSeenBuilding", "corpse", "projectile", "spellEffect"];
const worldRenderCacheCounters = createWorldRenderCacheCounters();
const worldRenderCacheOwnerIds = new WeakMap<object, number>();
const worldRenderCacheOwnerStates = new Map<number, Record<WorldRenderPerformanceKind, WorldRenderCachePerformanceState>>();
let nextWorldRenderCacheOwnerId = 1;

function createWorldRenderCacheStates(): Record<WorldRenderPerformanceKind, WorldRenderCachePerformanceState> {
  return Object.fromEntries(worldRenderKinds.map((kind) => [kind, { active: 0, dormant: 0, pooled: 0 }])) as Record<WorldRenderPerformanceKind, WorldRenderCachePerformanceState>;
}

function createWorldRenderCacheCounters(): Record<WorldRenderPerformanceKind, WorldRenderCachePerformanceCounter> {
  return Object.fromEntries(worldRenderKinds.map((kind) => [kind, {
    trackedCreated: 0, reused: 0, trackedDestroyed: 0, active: 0, dormant: 0, pooled: 0,
    activeHighWater: 0, dormantHighWater: 0, pooledHighWater: 0
  }])) as Record<WorldRenderPerformanceKind, WorldRenderCachePerformanceCounter>;
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

function worldRenderCacheOwnerState(owner: object): Record<WorldRenderPerformanceKind, WorldRenderCachePerformanceState> {
  let ownerId = worldRenderCacheOwnerIds.get(owner);
  if (ownerId === undefined) {
    ownerId = nextWorldRenderCacheOwnerId++;
    worldRenderCacheOwnerIds.set(owner, ownerId);
    worldRenderCacheOwnerStates.set(ownerId, createWorldRenderCacheStates());
  }
  return worldRenderCacheOwnerStates.get(ownerId)!;
}

function aggregateWorldRenderCacheState(kind: WorldRenderPerformanceKind): WorldRenderCachePerformanceState {
  const aggregate = { active: 0, dormant: 0, pooled: 0 };
  for (const owner of worldRenderCacheOwnerStates.values()) {
    aggregate.active += owner[kind].active;
    aggregate.dormant += owner[kind].dormant;
    aggregate.pooled += owner[kind].pooled;
  }
  return aggregate;
}

function refreshWorldRenderCacheState(kind: WorldRenderPerformanceKind): void {
  const state = aggregateWorldRenderCacheState(kind);
  const counter = worldRenderCacheCounters[kind];
  counter.active = state.active;
  counter.dormant = state.dormant;
  counter.pooled = state.pooled;
  if (captureActive) {
    counter.activeHighWater = Math.max(counter.activeHighWater, state.active);
    counter.dormantHighWater = Math.max(counter.dormantHighWater, state.dormant);
    counter.pooledHighWater = Math.max(counter.pooledHighWater, state.pooled);
  }
}

export function recordWorldRenderCachePerformance(
  owner: object,
  kind: WorldRenderPerformanceKind,
  actions: readonly { type: string }[],
  state: WorldRenderCachePerformanceState
): void {
  worldRenderCacheOwnerState(owner)[kind] = { ...state };
  if (captureActive) worldRenderCacheCounters[kind].reused += actions.filter((action) => action.type === "reuse" || action.type === "reattach").length;
  refreshWorldRenderCacheState(kind);
}

export function clearWorldRenderCachePerformanceOwner(owner: object): void {
  const ownerId = worldRenderCacheOwnerIds.get(owner);
  if (ownerId === undefined) return;
  worldRenderCacheOwnerStates.delete(ownerId);
  worldRenderCacheOwnerIds.delete(owner);
  for (const kind of worldRenderKinds) refreshWorldRenderCacheState(kind);
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
    const state = aggregateWorldRenderCacheState(kind);
    Object.assign(worldRenderCacheCounters[kind], {
      trackedCreated: 0, reused: 0, trackedDestroyed: 0, ...state,
      activeHighWater: state.active, dormantHighWater: state.dormant, pooledHighWater: state.pooled
    });
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
