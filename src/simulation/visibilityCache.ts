import type { WorldState, WorldUnit } from "./world";

export const FOG_CHUNK_TILES = 16;

type VisibilityDiagnostics = {
  fullRebuilds: number;
  skippedRebuilds: number;
  incrementalRebuilds: number;
  sourcesVisited: number;
  lastSkip: boolean;
  lastIncremental: boolean;
  visibilityRevision: number;
  dirtyTileCount: number;
};

type SourceRecord = {
  key: string;
  signature: string;
  tiles: number[];
};

type TileCollectors = {
  collectUnitTiles: (world: WorldState, unit: WorldUnit, out: number[]) => void;
  collectRevealTiles: (world: WorldState, x: number, y: number, radiusTiles: number, out: number[]) => void;
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
  contributionCounts: Uint16Array | null;
  sourceRecords: Map<string, SourceRecord>;
  dirtyTiles: number[];
  diagnostics: VisibilityDiagnostics;
};

const caches = new WeakMap<WorldState, CachedVisibilityState>();
const MAX_INCREMENTAL_SOURCE_CHANGES = 24;

function diagnosticsTemplate(): VisibilityDiagnostics {
  return {
    fullRebuilds: 0,
    skippedRebuilds: 0,
    incrementalRebuilds: 0,
    sourcesVisited: 0,
    lastSkip: false,
    lastIncremental: false,
    visibilityRevision: 0,
    dirtyTileCount: 0
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
      contributionCounts: null,
      sourceRecords: new Map(),
      dirtyTiles: [],
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

function unitSignature(world: WorldState, unit: WorldUnit): string {
  const tileX = Math.floor(unit.x / world.tileSize);
  const tileY = Math.floor(unit.y / world.tileSize);
  return `${unit.player}:${tileX}:${tileY}:${unit.tileWidth}:${unit.tileHeight}:${unit.sightRangeTiles}:${unit.elevated ? 1 : 0}`;
}

export function computeLocalVisionSignature(world: WorldState, playerId: number): { signature: string; sourceCount: number } {
  const parts: string[] = [];
  let sourceCount = 0;
  for (const unit of world.units) {
    if (!visionSourceEligible(world, playerId, unit)) continue;
    parts.push(`u:${unit.id}:${unitSignature(world, unit)}`);
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

function globalRulesMatch(cache: CachedVisibilityState, world: WorldState): boolean {
  return (
    cache.mapPath === world.map.path
    && cache.mapWidth === world.map.width
    && cache.mapHeight === world.map.height
    && cache.visibilityPlayer === world.visibilityPlayer
    && cache.terrainVersion === world.terrainVersion
    && cache.fogOfWarEnabled === world.engineSettings.fogOfWarEnabled
    && cache.fieldOfViewType === (world.engineSettings.fieldOfViewType ?? "")
    && cache.opaqueTerrainKey === world.engineSettings.opaqueTerrainTypes.join(",")
    && cache.revealMapMode === world.engineSettings.revealMapMode
    && cache.sharedVisionKey === sharedVisionKey(world)
    && cache.revelationKey === revelationKey(world)
  );
}

function storeGlobalKeys(cache: CachedVisibilityState, world: WorldState, signature: string): void {
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
}

function bumpRevision(cache: CachedVisibilityState): void {
  cache.visibilityRevision = (cache.visibilityRevision + 1) >>> 0 || 1;
  cache.diagnostics.visibilityRevision = cache.visibilityRevision;
}

function listCurrentSources(world: WorldState, playerId: number, collectors: TileCollectors): SourceRecord[] {
  const records: SourceRecord[] = [];
  for (const unit of world.units) {
    if (!visionSourceEligible(world, playerId, unit)) continue;
    const tiles: number[] = [];
    collectors.collectUnitTiles(world, unit, tiles);
    const signature = unitSignature(world, unit);
    records.push({ key: `u:${unit.id}`, signature, tiles });
  }
  for (const effect of world.spellEffects ?? []) {
    if (effect.kind !== "holy-vision" || !doesPlayerShareVisionWith(world, playerId, effect.player)) continue;
    const radiusTiles = Math.ceil(effect.radius / world.tileSize);
    const tiles: number[] = [];
    collectors.collectRevealTiles(world, effect.x, effect.y, radiusTiles, tiles);
    const signature = `${effect.player}:${Math.floor(effect.x)}:${Math.floor(effect.y)}:${radiusTiles}`;
    records.push({ key: `h:${effect.player}:${Math.floor(effect.x)}:${Math.floor(effect.y)}:${radiusTiles}`, signature, tiles });
  }
  for (const reveal of world.visibilityReveals ?? []) {
    if (reveal.remainingTicks <= 0 || !doesPlayerShareVisionWith(world, playerId, reveal.player)) continue;
    const tiles: number[] = [];
    collectors.collectRevealTiles(world, reveal.x, reveal.y, reveal.radiusTiles, tiles);
    const signature = `${reveal.player}:${Math.floor(reveal.x)}:${Math.floor(reveal.y)}:${reveal.radiusTiles}:${reveal.remainingTicks}`;
    records.push({
      key: `r:${reveal.player}:${Math.floor(reveal.x)}:${Math.floor(reveal.y)}:${reveal.radiusTiles}`,
      signature,
      tiles
    });
  }
  return records;
}

function subtractSource(cache: CachedVisibilityState, world: WorldState, record: SourceRecord, dirty: Set<number>): void {
  const counts = cache.contributionCounts;
  if (!counts) return;
  for (const index of record.tiles) {
    if (index < 0 || index >= counts.length) continue;
    const previous = counts[index];
    if (previous <= 0) continue;
    const next = previous - 1;
    counts[index] = next;
    if (previous > 0 && next === 0) {
      world.visibleTiles[index] = 0;
      dirty.add(index);
    }
  }
}

function addSource(cache: CachedVisibilityState, world: WorldState, record: SourceRecord, dirty: Set<number>): void {
  const counts = cache.contributionCounts;
  if (!counts) return;
  for (const index of record.tiles) {
    if (index < 0 || index >= counts.length) continue;
    const previous = counts[index];
    const next = previous + 1;
    counts[index] = next;
    if (previous === 0 && next > 0) {
      world.visibleTiles[index] = 1;
      dirty.add(index);
    }
    // Exploration is monotonic.
    if (world.exploredTiles[index] !== 1) {
      world.exploredTiles[index] = 1;
      dirty.add(index);
    }
  }
}

export function canSkipLocalVisibilityRebuild(world: WorldState): boolean {
  if (!world.engineSettings.fogOfWarEnabled) return false;
  const cache = ensureCache(world);
  if (!globalRulesMatch(cache, world)) return false;
  const { signature } = computeLocalVisionSignature(world, world.visibilityPlayer);
  return signature === cache.localSignature && cache.localSignature !== "";
}

export function noteVisibilitySkip(world: WorldState): void {
  const cache = ensureCache(world);
  cache.diagnostics.skippedRebuilds += 1;
  cache.diagnostics.sourcesVisited = 0;
  cache.diagnostics.lastSkip = true;
  cache.diagnostics.lastIncremental = false;
  cache.dirtyTiles = [];
  cache.diagnostics.dirtyTileCount = 0;
}

export function noteVisibilityFullRebuild(world: WorldState, sourcesVisited: number): void {
  const cache = ensureCache(world);
  const { signature } = computeLocalVisionSignature(world, world.visibilityPlayer);
  storeGlobalKeys(cache, world, signature);
  bumpRevision(cache);
  cache.diagnostics.fullRebuilds += 1;
  cache.diagnostics.sourcesVisited = sourcesVisited;
  cache.diagnostics.lastSkip = false;
  cache.diagnostics.lastIncremental = false;
  // Full grid dirty for fog consumers until reseed provides finer dirties.
  cache.dirtyTiles = [];
  cache.diagnostics.dirtyTileCount = world.map.width * world.map.height;
}

export function reseedLocalVisibilityContributions(world: WorldState, collectors: TileCollectors): void {
  const cache = ensureCache(world);
  const tileCount = world.map.width * world.map.height;
  const counts = new Uint16Array(tileCount);
  const records = listCurrentSources(world, world.visibilityPlayer, collectors);
  cache.sourceRecords = new Map();
  for (const record of records) {
    for (const index of record.tiles) {
      if (index >= 0 && index < tileCount) {
        counts[index] += 1;
      }
    }
    cache.sourceRecords.set(record.key, record);
  }
  cache.contributionCounts = counts;
  // Align visible tiles with contribution counts (authoritative rebuild already wrote them).
  for (let index = 0; index < tileCount; index += 1) {
    world.visibleTiles[index] = counts[index] > 0 ? 1 : 0;
    if (counts[index] > 0) {
      world.exploredTiles[index] = 1;
    }
  }
  cache.dirtyTiles = [];
  cache.diagnostics.dirtyTileCount = tileCount;
}

export function tryApplyIncrementalLocalVisibility(world: WorldState, collectors: TileCollectors): boolean {
  if (!world.engineSettings.fogOfWarEnabled) return false;
  const cache = ensureCache(world);
  if (!cache.contributionCounts || cache.sourceRecords.size === 0) return false;
  if (!globalRulesMatch(cache, world)) return false;
  const { signature, sourceCount } = computeLocalVisionSignature(world, world.visibilityPlayer);
  if (signature === cache.localSignature) return false;

  const nextRecords = listCurrentSources(world, world.visibilityPlayer, collectors);
  const nextMap = new Map(nextRecords.map((record) => [record.key, record]));
  const previousKeys = [...cache.sourceRecords.keys()];
  const nextKeys = [...nextMap.keys()];
  const removed: SourceRecord[] = [];
  const addedOrChanged: SourceRecord[] = [];
  for (const key of previousKeys) {
    const previous = cache.sourceRecords.get(key);
    const next = nextMap.get(key);
    if (!previous) continue;
    if (!next) {
      removed.push(previous);
    } else if (next.signature !== previous.signature) {
      removed.push(previous);
      addedOrChanged.push(next);
    }
  }
  for (const key of nextKeys) {
    if (!cache.sourceRecords.has(key)) {
      const next = nextMap.get(key);
      if (next) addedOrChanged.push(next);
    }
  }
  const changeCount = removed.length + addedOrChanged.length;
  if (changeCount === 0 || changeCount > MAX_INCREMENTAL_SOURCE_CHANGES) {
    return false;
  }

  const dirty = new Set<number>();
  let sourcesVisited = 0;
  for (const record of removed) {
    subtractSource(cache, world, record, dirty);
    cache.sourceRecords.delete(record.key);
    sourcesVisited += 1;
  }
  for (const record of addedOrChanged) {
    addSource(cache, world, record, dirty);
    cache.sourceRecords.set(record.key, record);
    sourcesVisited += 1;
  }

  // Guard against underflow / drift: any negative is impossible; zero-check visible parity sample.
  const counts = cache.contributionCounts;
  if (!counts) return false;
  for (let i = 0; i < Math.min(counts.length, 64); i += 1) {
    const index = (i * 9973) % counts.length;
    if (counts[index] > 0 && world.visibleTiles[index] !== 1) {
      return false;
    }
    if (counts[index] === 0 && world.visibleTiles[index] !== 0) {
      return false;
    }
  }

  storeGlobalKeys(cache, world, signature);
  bumpRevision(cache);
  cache.dirtyTiles = [...dirty].sort((a, b) => a - b);
  cache.diagnostics.incrementalRebuilds += 1;
  cache.diagnostics.sourcesVisited = sourcesVisited;
  cache.diagnostics.lastSkip = false;
  cache.diagnostics.lastIncremental = true;
  cache.diagnostics.dirtyTileCount = cache.dirtyTiles.length;
  // silence unused
  void sourceCount;
  return true;
}

export function getVisibilityRevision(world: WorldState): number {
  return ensureCache(world).visibilityRevision;
}

export function getVisibilityDirtyTiles(world: WorldState): readonly number[] {
  return ensureCache(world).dirtyTiles;
}

export function consumeVisibilityDirtyTiles(world: WorldState): number[] {
  const cache = ensureCache(world);
  const tiles = cache.dirtyTiles;
  cache.dirtyTiles = [];
  return tiles;
}

export function resetVisibilityDiagnostics(): void {
  // Per-world WeakMap diagnostics; no process-global store.
}

export function snapshotVisibilityDiagnostics(world?: WorldState) {
  if (!world) {
    return {
      "plan025.visibility.fullRebuilds": 0,
      "plan025.visibility.skippedRebuilds": 0,
      "plan025.visibility.incrementalRebuilds": 0,
      "plan025.visibility.sourcesVisited": 0,
      "plan025.visibility.lastSkip": false,
      "plan025.visibility.lastIncremental": false,
      "plan025.visibility.revision": 0,
      "plan025.visibility.dirtyTileCount": 0
    };
  }
  const diagnostics = ensureCache(world).diagnostics;
  return {
    "plan025.visibility.fullRebuilds": diagnostics.fullRebuilds,
    "plan025.visibility.skippedRebuilds": diagnostics.skippedRebuilds,
    "plan025.visibility.incrementalRebuilds": diagnostics.incrementalRebuilds,
    "plan025.visibility.sourcesVisited": diagnostics.sourcesVisited,
    "plan025.visibility.lastSkip": diagnostics.lastSkip,
    "plan025.visibility.lastIncremental": diagnostics.lastIncremental,
    "plan025.visibility.revision": diagnostics.visibilityRevision,
    "plan025.visibility.dirtyTileCount": diagnostics.dirtyTileCount
  };
}
