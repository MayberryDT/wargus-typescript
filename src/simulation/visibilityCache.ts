import type { WorldState, WorldUnit } from "./world";

type VisibilityDiagnostics = {
  fullRebuilds: number;
  skippedRebuilds: number;
  sourcesVisited: number;
  lastSkip: boolean;
  visibilityRevision: number;
};

type CachedVisibilityState = {
  localSignature: string;
  terrainVersion: number;
  fogOfWarEnabled: boolean;
  fieldOfViewType: string;
  opaqueTerrainKey: string;
  revealMapMode: string;
  sharedVisionKey: string;
  revelationKey: string;
  visibilityPlayer: number;
  mapPath: string;
  mapWidth: number;
  mapHeight: number;
  visibilityRevision: number;
  diagnostics: VisibilityDiagnostics;
};

const caches = new WeakMap<WorldState, CachedVisibilityState>();

function diagnosticsTemplate(): VisibilityDiagnostics {
  return {
    fullRebuilds: 0,
    skippedRebuilds: 0,
    sourcesVisited: 0,
    lastSkip: false,
    visibilityRevision: 0
  };
}

function ensureCache(world: WorldState): CachedVisibilityState {
  let cache = caches.get(world);
  if (!cache) {
    cache = {
      localSignature: "",
      terrainVersion: -1,
      fogOfWarEnabled: false,
      fieldOfViewType: "",
      opaqueTerrainKey: "",
      revealMapMode: "",
      sharedVisionKey: "",
      revelationKey: "",
      visibilityPlayer: -1,
      mapPath: "",
      mapWidth: 0,
      mapHeight: 0,
      visibilityRevision: 0,
      diagnostics: diagnosticsTemplate()
    };
    caches.set(world, cache);
  }
  return cache;
}

function doesPlayerShareVisionWith(world: WorldState, playerId: number, sourcePlayerId: number): boolean {
  if (playerId === sourcePlayerId) return true;
  const source = world.sharedVision.find((rule) => rule.player === playerId && rule.otherPlayer === sourcePlayerId);
  return source?.enabled === true;
}

function isRuntimeSourceBuildingUnit(unit: Pick<WorldUnit, "kind" | "speed" | "tileWidth" | "tileHeight">): boolean {
  return unit.kind === "building" || unit.speed === 0 || unit.tileWidth > 1 || unit.tileHeight > 1;
}

function isPlayerRevealedToPlayer(world: WorldState, playerId: number, sourcePlayerId: number): boolean {
  if (playerId === sourcePlayerId || sourcePlayerId === 15 || world.engineSettings.revelationType === "no-revelation") {
    return false;
  }
  return (world.revealedPlayers ?? []).includes(sourcePlayerId);
}

function unitProvidesRevelationVision(world: WorldState, playerId: number, unit: WorldUnit): boolean {
  if (!isPlayerRevealedToPlayer(world, playerId, unit.player)) return false;
  return world.engineSettings.revelationType !== "buildings-only" || isRuntimeSourceBuildingUnit(unit);
}

function visionSourceEligible(world: WorldState, playerId: number, unit: WorldUnit): boolean {
  if (unit.hitPoints <= 0) return false;
  return doesPlayerShareVisionWith(world, playerId, unit.player) || unitProvidesRevelationVision(world, playerId, unit);
}

function tileKey(world: WorldState, unit: WorldUnit): string {
  const tileX = Math.floor(unit.x / world.tileSize);
  const tileY = Math.floor(unit.y / world.tileSize);
  return `${unit.id}:${unit.player}:${tileX}:${tileY}:${unit.tileWidth}:${unit.tileHeight}:${unit.sightRangeTiles}:${unit.elevated ? 1 : 0}`;
}

export function computeLocalVisionSignature(world: WorldState, playerId: number): { signature: string; sourceCount: number } {
  const parts: string[] = [];
  let sourceCount = 0;
  for (const unit of world.units) {
    if (!visionSourceEligible(world, playerId, unit)) continue;
    parts.push(`u:${tileKey(world, unit)}`);
    sourceCount += 1;
  }
  for (const effect of world.spellEffects ?? []) {
    if (effect.kind !== "holy-vision" || !doesPlayerShareVisionWith(world, playerId, effect.player)) continue;
    parts.push(`h:${effect.player}:${Math.floor(effect.x)}:${Math.floor(effect.y)}:${Math.ceil(effect.radius / world.tileSize)}`);
    sourceCount += 1;
  }
  for (const reveal of world.visibilityReveals ?? []) {
    if (reveal.remainingTicks <= 0 || !doesPlayerShareVisionWith(world, playerId, reveal.player)) continue;
    parts.push(`r:${reveal.player}:${Math.floor(reveal.x)}:${Math.floor(reveal.y)}:${reveal.radiusTiles}:${reveal.remainingTicks}`);
    sourceCount += 1;
  }
  return { signature: parts.join("|"), sourceCount };
}

function sharedVisionKey(world: WorldState): string {
  return (world.sharedVision ?? [])
    .map((rule) => `${rule.player}>${rule.otherPlayer}:${rule.enabled ? 1 : 0}`)
    .sort()
    .join(",");
}

function revelationKey(world: WorldState): string {
  const revealed = (world.revealedPlayers ?? []).join(",");
  const timers = (world.revelationTimers ?? [])
    .map((timer) => `${timer.player}:${timer.remainingTicks}`)
    .join(",");
  return `${world.engineSettings.revelationType}|${revealed}|${timers}`;
}

export function canSkipLocalVisibilityRebuild(world: WorldState): boolean {
  if (!world.engineSettings.fogOfWarEnabled) return false;
  const cache = ensureCache(world);
  if (
    cache.mapPath !== world.map.path
    || cache.mapWidth !== world.map.width
    || cache.mapHeight !== world.map.height
    || cache.visibilityPlayer !== world.visibilityPlayer
    || cache.terrainVersion !== world.terrainVersion
    || cache.fogOfWarEnabled !== world.engineSettings.fogOfWarEnabled
    || cache.fieldOfViewType !== (world.engineSettings.fieldOfViewType ?? "")
    || cache.opaqueTerrainKey !== world.engineSettings.opaqueTerrainTypes.join(",")
    || cache.revealMapMode !== world.engineSettings.revealMapMode
    || cache.sharedVisionKey !== sharedVisionKey(world)
    || cache.revelationKey !== revelationKey(world)
  ) {
    return false;
  }
  const { signature } = computeLocalVisionSignature(world, world.visibilityPlayer);
  return signature === cache.localSignature && cache.localSignature !== "";
}

export function noteVisibilitySkip(world: WorldState): void {
  const cache = ensureCache(world);
  cache.diagnostics.skippedRebuilds += 1;
  cache.diagnostics.sourcesVisited = 0;
  cache.diagnostics.lastSkip = true;
}

export function noteVisibilityFullRebuild(world: WorldState, sourcesVisited: number): void {
  const cache = ensureCache(world);
  const { signature } = computeLocalVisionSignature(world, world.visibilityPlayer);
  cache.localSignature = signature;
  cache.terrainVersion = world.terrainVersion;
  cache.fogOfWarEnabled = world.engineSettings.fogOfWarEnabled;
  cache.fieldOfViewType = world.engineSettings.fieldOfViewType ?? "";
  cache.opaqueTerrainKey = world.engineSettings.opaqueTerrainTypes.join(",");
  cache.revealMapMode = world.engineSettings.revealMapMode;
  cache.sharedVisionKey = sharedVisionKey(world);
  cache.revelationKey = revelationKey(world);
  cache.visibilityPlayer = world.visibilityPlayer;
  cache.mapPath = world.map.path;
  cache.mapWidth = world.map.width;
  cache.mapHeight = world.map.height;
  cache.visibilityRevision = (cache.visibilityRevision + 1) >>> 0 || 1;
  cache.diagnostics.fullRebuilds += 1;
  cache.diagnostics.sourcesVisited = sourcesVisited;
  cache.diagnostics.lastSkip = false;
  cache.diagnostics.visibilityRevision = cache.visibilityRevision;
}

export function getVisibilityRevision(world: WorldState): number {
  return ensureCache(world).visibilityRevision;
}

export function resetVisibilityDiagnostics(): void {
  // no global process-wide store; diagnostics live per world WeakMap
}

export function snapshotVisibilityDiagnostics(world?: WorldState) {
  if (!world) {
    return {
      "plan025.visibility.fullRebuilds": 0,
      "plan025.visibility.skippedRebuilds": 0,
      "plan025.visibility.sourcesVisited": 0,
      "plan025.visibility.lastSkip": false,
      "plan025.visibility.revision": 0
    };
  }
  const diagnostics = ensureCache(world).diagnostics;
  return {
    "plan025.visibility.fullRebuilds": diagnostics.fullRebuilds,
    "plan025.visibility.skippedRebuilds": diagnostics.skippedRebuilds,
    "plan025.visibility.sourcesVisited": diagnostics.sourcesVisited,
    "plan025.visibility.lastSkip": diagnostics.lastSkip,
    "plan025.visibility.revision": diagnostics.visibilityRevision
  };
}
