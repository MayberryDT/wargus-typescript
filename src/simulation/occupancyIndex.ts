import type { WorldState, WorldUnit } from "./world";

export type WorldOccupantSnapshot = { x: number; y: number; tileWidth: number; tileHeight: number; tileKeys: number[] };
type OccupancyCache = {
  unitsReference: WorldUnit[];
  expectedLength: number;
  valid: boolean;
  fallbackOnce: boolean;
  buckets: Map<number, WorldUnit[]>;
  ranks: Map<WorldUnit, number>;
  snapshots: Map<WorldUnit, WorldOccupantSnapshot>;
};
type DurationKey = "query" | "register" | "unregister" | "transition" | "invalidation" | "rebuild";
type DurationSamples = { values: number[]; next: number };

const caches = new WeakMap<WorldState, OccupancyCache>();
const makeDurationSamples = (): DurationSamples => ({ values: [], next: 0 });
const durationSamples: Record<DurationKey, DurationSamples> = {
  query: makeDurationSamples(), register: makeDurationSamples(), unregister: makeDurationSamples(),
  transition: makeDurationSamples(), invalidation: makeDurationSamples(), rebuild: makeDurationSamples()
};
const counts = {
  queries: 0, candidatesVisited: 0, registers: 0, unregisters: 0, transitions: 0,
  invalidations: 0, rebuilds: 0, maintenanceTotalMs: 0, fullScanFallbacks: 0, parityFailures: 0
};
let parityMode: "off" | "sampled" | "full" = "sampled";
const now = (): number => globalThis.performance?.now() ?? 0;

function recordDuration(key: DurationKey, startedAt: number, maintenance: boolean): void {
  const elapsed = Math.max(0, now() - startedAt);
  const samples = durationSamples[key];
  if (samples.values.length < 2048) samples.values.push(elapsed);
  else {
    samples.values[samples.next] = elapsed;
    samples.next = (samples.next + 1) % samples.values.length;
  }
  if (maintenance) counts.maintenanceTotalMs += elapsed;
}

function summarize(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const rank = (percentile: number): number | null => sorted.length === 0 ? null : sorted[Math.ceil(sorted.length * percentile) - 1];
  const totalMs = sorted.reduce((sum, value) => sum + value, 0);
  return {
    sampleCount: sorted.length, p50Ms: rank(0.5), p95Ms: rank(0.95), p99Ms: rank(0.99),
    meanMs: sorted.length === 0 ? null : totalMs / sorted.length, maxMs: sorted.at(-1) ?? null, totalMs
  };
}

export function resetWorldOccupancyDiagnostics(): void {
  Object.assign(counts, {
    queries: 0, candidatesVisited: 0, registers: 0, unregisters: 0, transitions: 0,
    invalidations: 0, rebuilds: 0, maintenanceTotalMs: 0, fullScanFallbacks: 0, parityFailures: 0
  });
  for (const samples of Object.values(durationSamples)) {
    samples.values.length = 0;
    samples.next = 0;
  }
}

export function setWorldOccupancyParityMode(mode: "off" | "sampled" | "full"): void {
  parityMode = mode;
}

export function snapshotWorldOccupancyDiagnostics() {
  return {
    "plan023.occupancy.queries": counts.queries,
    "plan023.occupancy.candidatesVisited": counts.candidatesVisited,
    "plan023.occupancy.queryDurationMs": summarize(durationSamples.query.values),
    "plan023.occupancy.registers": counts.registers,
    "plan023.occupancy.registerDurationMs": summarize(durationSamples.register.values),
    "plan023.occupancy.unregisters": counts.unregisters,
    "plan023.occupancy.unregisterDurationMs": summarize(durationSamples.unregister.values),
    "plan023.occupancy.transitions": counts.transitions,
    "plan023.occupancy.transitionDurationMs": summarize(durationSamples.transition.values),
    "plan023.occupancy.invalidations": counts.invalidations,
    "plan023.occupancy.invalidationDurationMs": summarize(durationSamples.invalidation.values),
    "plan023.occupancy.rebuilds": counts.rebuilds,
    "plan023.occupancy.rebuildDurationMs": summarize(durationSamples.rebuild.values),
    "plan023.occupancy.maintenanceTotalMs": counts.maintenanceTotalMs,
    "plan023.occupancy.fullScanFallbacks": counts.fullScanFallbacks,
    "plan023.occupancy.parityFailures": counts.parityFailures
  };
}

function coveredTileKeys(world: WorldState, unit: Pick<WorldUnit, "x" | "y" | "tileWidth" | "tileHeight">): number[] {
  const centerX = Math.max(0, Math.min(world.map.width - 1, Math.floor(unit.x / world.tileSize)));
  const centerY = Math.max(0, Math.min(world.map.height - 1, Math.floor(unit.y / world.tileSize)));
  const width = Math.max(1, Math.floor(unit.tileWidth));
  const height = Math.max(1, Math.floor(unit.tileHeight));
  const left = centerX - Math.floor(width / 2);
  const top = centerY - Math.floor(height / 2);
  const keys: number[] = [];
  for (let y = top; y < top + height; y += 1) {
    if (y < 0 || y >= world.map.height) continue;
    for (let x = left; x < left + width; x += 1) if (x >= 0 && x < world.map.width) keys.push(y * world.map.width + x);
  }
  return keys;
}

export function snapshotWorldOccupant(world: WorldState, unit: WorldUnit): WorldOccupantSnapshot {
  return { x: unit.x, y: unit.y, tileWidth: unit.tileWidth, tileHeight: unit.tileHeight, tileKeys: coveredTileKeys(world, unit) };
}

function insertByRank(cache: OccupancyCache, key: number, unit: WorldUnit): void {
  const bucket = cache.buckets.get(key) ?? [];
  const rank = cache.ranks.get(unit);
  if (rank === undefined) throw new Error("Cannot index an occupant without authoritative rank");
  let index = bucket.length;
  while (index > 0 && (cache.ranks.get(bucket[index - 1]) ?? Number.POSITIVE_INFINITY) > rank) index -= 1;
  bucket.splice(index, 0, unit);
  cache.buckets.set(key, bucket);
}

function removeFromBuckets(cache: OccupancyCache, unit: WorldUnit, keys: readonly number[]): void {
  for (const key of keys) {
    const bucket = cache.buckets.get(key);
    if (!bucket) continue;
    const index = bucket.indexOf(unit);
    if (index >= 0) bucket.splice(index, 1);
    if (bucket.length === 0) cache.buckets.delete(key);
  }
}

function buildWorldOccupancyIndex(world: WorldState): OccupancyCache {
  const startedAt = now();
  const cache: OccupancyCache = {
    unitsReference: world.units, expectedLength: world.units.length, valid: true, fallbackOnce: false,
    buckets: new Map(), ranks: new Map(), snapshots: new Map()
  };
  world.units.forEach((unit, rank) => {
    cache.ranks.set(unit, rank);
    const snapshot = snapshotWorldOccupant(world, unit);
    cache.snapshots.set(unit, snapshot);
    for (const key of snapshot.tileKeys) insertByRank(cache, key, unit);
  });
  caches.set(world, cache);
  counts.rebuilds += 1;
  recordDuration("rebuild", startedAt, true);
  return cache;
}

export function ensureWorldOccupancyIndex(world: WorldState): void {
  const cache = caches.get(world);
  if (!cache || !cache.valid || cache.unitsReference !== world.units || cache.expectedLength !== world.units.length) buildWorldOccupancyIndex(world);
}

export function queryWorldOccupantsAtTileFullScan(world: WorldState, tileX: number, tileY: number): WorldUnit[] {
  const key = tileY * world.map.width + tileX;
  return world.units.filter((unit) => coveredTileKeys(world, unit).includes(key));
}

function cacheMatchesAuthoritativeWorld(cache: OccupancyCache, world: WorldState): boolean {
  if (cache.unitsReference !== world.units || cache.expectedLength !== world.units.length) return false;
  for (let rank = 0; rank < world.units.length; rank += 1) {
    const unit = world.units[rank];
    const snapshot = cache.snapshots.get(unit);
    if (cache.ranks.get(unit) !== rank || !snapshot
      || snapshot.x !== unit.x || snapshot.y !== unit.y
      || snapshot.tileWidth !== unit.tileWidth || snapshot.tileHeight !== unit.tileHeight) return false;
  }
  return true;
}

function queryCache(world: WorldState, validateAuthoritativeState: boolean): OccupancyCache | null {
  const existing = caches.get(world);
  const validatesExisting = Boolean(existing?.valid && validateAuthoritativeState);
  if (validatesExisting) counts.candidatesVisited += world.units.length;
  const validationFailed = validatesExisting && existing ? !cacheMatchesAuthoritativeWorld(existing, world) : false;
  if (existing?.fallbackOnce || validationFailed) {
    if (existing) {
      existing.fallbackOnce = false;
      existing.valid = false;
    }
    counts.fullScanFallbacks += 1;
    return null;
  }
  ensureWorldOccupancyIndex(world);
  return caches.get(world) ?? null;
}

export function queryWorldOccupantsAtTile(world: WorldState, tileX: number, tileY: number): WorldUnit[] {
  counts.queries += 1;
  let startedAt = now();
  const rebuildsBefore = counts.rebuilds;
  const validateAuthoritativeState = parityMode === "full" || (parityMode === "sampled" && (counts.queries === 1 || counts.queries % 257 === 0));
  const cache = queryCache(world, validateAuthoritativeState);
  if (counts.rebuilds !== rebuildsBefore) startedAt = now();
  const result = cache ? [...(cache.buckets.get(tileY * world.map.width + tileX) ?? [])] : queryWorldOccupantsAtTileFullScan(world, tileX, tileY);
  counts.candidatesVisited += cache ? result.length : world.units.length;
  recordDuration("query", startedAt, false);
  if (!cache || parityMode === "off" || (parityMode === "sampled" && counts.queries !== 1 && counts.queries % 257 !== 0)) return result;
  const authoritative = queryWorldOccupantsAtTileFullScan(world, tileX, tileY);
  if (result.length === authoritative.length && result.every((unit, index) => unit === authoritative[index])) return result;
  counts.parityFailures += 1;
  counts.fullScanFallbacks += 1;
  cache.valid = false;
  return authoritative;
}

export function queryWorldOccupantsInFootprintFullScan(world: WorldState, left: number, top: number, width: number, height: number): WorldUnit[] {
  const keys = new Set<number>();
  for (let y = Math.max(0, top); y < Math.min(world.map.height, top + height); y += 1) {
    for (let x = Math.max(0, left); x < Math.min(world.map.width, left + width); x += 1) keys.add(y * world.map.width + x);
  }
  return world.units.filter((unit) => coveredTileKeys(world, unit).some((key) => keys.has(key)));
}

export function queryWorldOccupantsInFootprint(world: WorldState, left: number, top: number, width: number, height: number): WorldUnit[] {
  counts.queries += 1;
  let startedAt = now();
  const rebuildsBefore = counts.rebuilds;
  const validateAuthoritativeState = parityMode === "full" || (parityMode === "sampled" && (counts.queries === 1 || counts.queries % 257 === 0));
  const cache = queryCache(world, validateAuthoritativeState);
  if (counts.rebuilds !== rebuildsBefore) startedAt = now();
  if (!cache) {
    const result = queryWorldOccupantsInFootprintFullScan(world, left, top, width, height);
    counts.candidatesVisited += world.units.length;
    recordDuration("query", startedAt, false);
    return result;
  }
  const seen = new Set<WorldUnit>();
  let candidateVisits = 0;
  for (let y = Math.max(0, top); y < Math.min(world.map.height, top + height); y += 1) {
    for (let x = Math.max(0, left); x < Math.min(world.map.width, left + width); x += 1) {
      for (const unit of cache.buckets.get(y * world.map.width + x) ?? []) {
        candidateVisits += 1;
        seen.add(unit);
      }
    }
  }
  const result = [...seen].sort((leftUnit, rightUnit) => (cache.ranks.get(leftUnit) ?? 0) - (cache.ranks.get(rightUnit) ?? 0));
  counts.candidatesVisited += candidateVisits;
  recordDuration("query", startedAt, false);
  if (parityMode === "off" || (parityMode === "sampled" && counts.queries !== 1 && counts.queries % 257 !== 0)) return result;
  const authoritative = queryWorldOccupantsInFootprintFullScan(world, left, top, width, height);
  if (result.length === authoritative.length && result.every((unit, index) => unit === authoritative[index])) return result;
  counts.parityFailures += 1;
  counts.fullScanFallbacks += 1;
  cache.valid = false;
  return authoritative;
}

export function registerWorldOccupant(world: WorldState, unit: WorldUnit): void {
  const startedAt = now();
  counts.registers += 1;
  const cache = caches.get(world);
  if (cache?.valid && cache.unitsReference === world.units && !cache.ranks.has(unit)) {
    const rank = world.units.indexOf(unit);
    if (rank !== world.units.length - 1) cache.valid = false;
    else {
      cache.ranks.set(unit, rank);
      const snapshot = snapshotWorldOccupant(world, unit);
      cache.snapshots.set(unit, snapshot);
      for (const key of snapshot.tileKeys) insertByRank(cache, key, unit);
      cache.expectedLength = world.units.length;
    }
  }
  recordDuration("register", startedAt, true);
}

export function unregisterWorldOccupant(world: WorldState, unit: WorldUnit): void {
  const startedAt = now();
  counts.unregisters += 1;
  const cache = caches.get(world);
  if (cache?.valid) {
    const snapshot = cache.snapshots.get(unit);
    if (snapshot) removeFromBuckets(cache, unit, snapshot.tileKeys);
    cache.snapshots.delete(unit);
    cache.ranks.delete(unit);
    cache.valid = false;
  }
  recordDuration("unregister", startedAt, true);
}

export function transitionWorldOccupant(world: WorldState, unit: WorldUnit, previous: WorldOccupantSnapshot): void {
  const startedAt = now();
  counts.transitions += 1;
  const cache = caches.get(world);
  if (cache?.valid && cache.ranks.has(unit)) {
    const next = snapshotWorldOccupant(world, unit);
    cache.snapshots.set(unit, next);
    const membershipChanged = previous.tileKeys.length !== next.tileKeys.length
      || previous.tileKeys.some((key, index) => key !== next.tileKeys[index]);
    if (membershipChanged) {
      removeFromBuckets(cache, unit, previous.tileKeys);
      for (const key of next.tileKeys) insertByRank(cache, key, unit);
    }
  }
  recordDuration("transition", startedAt, true);
}

export function invalidateWorldOccupancyIndex(world: WorldState): void {
  const startedAt = now();
  counts.invalidations += 1;
  const cache = caches.get(world);
  if (cache) cache.valid = false;
  recordDuration("invalidation", startedAt, true);
}

export function verifyWorldOccupancyParity(world: WorldState, tileX: number, tileY: number): boolean {
  const indexed = queryWorldOccupantsAtTile(world, tileX, tileY);
  const legacy = queryWorldOccupantsAtTileFullScan(world, tileX, tileY);
  const equal = indexed.length === legacy.length && indexed.every((unit, index) => unit === legacy[index]);
  if (!equal) counts.parityFailures += 1;
  return equal;
}

export function forceWorldOccupancyFallbackForTest(world: WorldState): void {
  ensureWorldOccupancyIndex(world);
  const cache = caches.get(world);
  if (cache) cache.fallbackOnce = true;
}
