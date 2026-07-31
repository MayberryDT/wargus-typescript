import type { Container, Graphics } from "pixi.js";
import type { WorldState } from "../simulation/world";
import { FOG_CHUNK_TILES } from "../simulation/visibilityCache";

export type FogChunkKey = string;

export type FogChunkRecord = {
  key: FogChunkKey;
  chunkX: number;
  chunkY: number;
  minTileX: number;
  minTileY: number;
  maxTileX: number;
  maxTileY: number;
  container: Container;
  knownGraphics: Graphics;
  unknownGraphics: Graphics;
  edgeLayer: Container;
  revision: number;
};

type FogLayerCache = {
  mapPath: string;
  mapWidth: number;
  mapHeight: number;
  chunks: Map<FogChunkKey, FogChunkRecord>;
  lastBoundsKey: string;
  lastRevision: number;
  created: number;
  destroyed: number;
  rebuilt: number;
  reused: number;
};

const layerCaches = new WeakMap<Container, FogLayerCache>();

export function fogChunkKey(chunkX: number, chunkY: number): FogChunkKey {
  return `${chunkX},${chunkY}`;
}

export function tileToFogChunk(tileX: number, tileY: number): { chunkX: number; chunkY: number } {
  return {
    chunkX: Math.floor(tileX / FOG_CHUNK_TILES),
    chunkY: Math.floor(tileY / FOG_CHUNK_TILES)
  };
}

export function ensureFogLayerCache(layer: Container, world: WorldState): FogLayerCache {
  let cache = layerCaches.get(layer);
  if (
    !cache
    || cache.mapPath !== world.map.path
    || cache.mapWidth !== world.map.width
    || cache.mapHeight !== world.map.height
  ) {
    cache = {
      mapPath: world.map.path,
      mapWidth: world.map.width,
      mapHeight: world.map.height,
      chunks: new Map(),
      lastBoundsKey: "",
      lastRevision: -1,
      created: 0,
      destroyed: 0,
      rebuilt: 0,
      reused: 0
    };
    layerCaches.set(layer, cache);
  }
  return cache;
}

export function clearFogLayerCache(layer: Container): void {
  const cache = layerCaches.get(layer);
  if (!cache) return;
  cache.chunks.clear();
  cache.lastBoundsKey = "";
  cache.lastRevision = -1;
}

export function listVisibleFogChunks(
  world: WorldState,
  minTileX: number,
  minTileY: number,
  maxTileX: number,
  maxTileY: number
): Array<{ chunkX: number; chunkY: number; minTileX: number; minTileY: number; maxTileX: number; maxTileY: number }> {
  const minChunkX = Math.floor(minTileX / FOG_CHUNK_TILES);
  const minChunkY = Math.floor(minTileY / FOG_CHUNK_TILES);
  const maxChunkX = Math.floor(maxTileX / FOG_CHUNK_TILES);
  const maxChunkY = Math.floor(maxTileY / FOG_CHUNK_TILES);
  const chunks: Array<{ chunkX: number; chunkY: number; minTileX: number; minTileY: number; maxTileX: number; maxTileY: number }> = [];
  for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
    for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
      const chunkMinX = Math.max(0, chunkX * FOG_CHUNK_TILES);
      const chunkMinY = Math.max(0, chunkY * FOG_CHUNK_TILES);
      const chunkMaxX = Math.min(world.map.width - 1, chunkMinX + FOG_CHUNK_TILES - 1);
      const chunkMaxY = Math.min(world.map.height - 1, chunkMinY + FOG_CHUNK_TILES - 1);
      chunks.push({
        chunkX,
        chunkY,
        minTileX: chunkMinX,
        minTileY: chunkMinY,
        maxTileX: chunkMaxX,
        maxTileY: chunkMaxY
      });
    }
  }
  return chunks;
}

export function dirtyFogChunkKeysFromTiles(world: WorldState, tileIndices: readonly number[], neighborRing = 1): Set<FogChunkKey> {
  const keys = new Set<FogChunkKey>();
  const width = world.map.width;
  const height = world.map.height;
  for (const index of tileIndices) {
    const tileX = index % width;
    const tileY = Math.floor(index / width);
    for (let dy = -neighborRing; dy <= neighborRing; dy += 1) {
      for (let dx = -neighborRing; dx <= neighborRing; dx += 1) {
        const x = tileX + dx;
        const y = tileY + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const chunk = tileToFogChunk(x, y);
        keys.add(fogChunkKey(chunk.chunkX, chunk.chunkY));
      }
    }
  }
  return keys;
}

export function snapshotFogChunkDiagnostics(layer?: Container) {
  if (!layer) {
    return {
      "plan025.fog.created": 0,
      "plan025.fog.destroyed": 0,
      "plan025.fog.rebuilt": 0,
      "plan025.fog.reused": 0,
      "plan025.fog.chunkCount": 0
    };
  }
  const cache = layerCaches.get(layer);
  if (!cache) {
    return {
      "plan025.fog.created": 0,
      "plan025.fog.destroyed": 0,
      "plan025.fog.rebuilt": 0,
      "plan025.fog.reused": 0,
      "plan025.fog.chunkCount": 0
    };
  }
  return {
    "plan025.fog.created": cache.created,
    "plan025.fog.destroyed": cache.destroyed,
    "plan025.fog.rebuilt": cache.rebuilt,
    "plan025.fog.reused": cache.reused,
    "plan025.fog.chunkCount": cache.chunks.size
  };
}
