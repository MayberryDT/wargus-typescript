import type { WargusTilesetTerrain } from "../wargus/types";

export const TERRAIN_FLAG_BITS = {
  land: 1 << 0,
  water: 1 << 1,
  coast: 1 << 2,
  unpassable: 1 << 3,
  forest: 1 << 4,
  rock: 1 << 5,
  wall: 1 << 6,
  "no-building": 1 << 7
} as const;

export type TerrainFlagName = keyof typeof TERRAIN_FLAG_BITS;

export interface TerrainMetadataDiagnostics {
  "plan019.terrainMetadata.cacheBuilds": number;
  "plan019.terrainMetadata.cacheHits": number;
  "plan019.terrainMetadata.slotLookups": number;
}

const diagnostics: TerrainMetadataDiagnostics = {
  "plan019.terrainMetadata.cacheBuilds": 0,
  "plan019.terrainMetadata.cacheHits": 0,
  "plan019.terrainMetadata.slotLookups": 0
};

const terrainMetadataCaches = new WeakMap<WargusTilesetTerrain, ReadonlyMap<number, number>>();

export function rawTerrainMaskForSlot(tileset: WargusTilesetTerrain | null | undefined, slot: number): number | null {
  if (!tileset) {
    return null;
  }
  const cached = terrainMetadataCaches.get(tileset);
  let metadata: ReadonlyMap<number, number>;
  if (cached) {
    diagnostics["plan019.terrainMetadata.cacheHits"] += 1;
    metadata = cached;
  } else {
    const built = new Map<number, number>();
    for (const entry of tileset.slots) {
      if (!built.has(entry.slot)) {
        built.set(entry.slot, terrainMaskForFlags(entry.flags));
      }
    }
    terrainMetadataCaches.set(tileset, built);
    diagnostics["plan019.terrainMetadata.cacheBuilds"] += 1;
    metadata = built;
  }
  diagnostics["plan019.terrainMetadata.slotLookups"] += 1;
  return metadata.get(slot) ?? null;
}

export function rawTerrainMaskForTile(tileset: WargusTilesetTerrain | null | undefined, tile: number): number | null {
  return rawTerrainMaskForSlot(tileset, rawTerrainSlotForTile(tile));
}

export function passabilityTerrainMaskForTile(tileset: WargusTilesetTerrain | null | undefined, tile: number): number | null {
  if (tile === 126) {
    return TERRAIN_FLAG_BITS.land;
  }
  return rawTerrainMaskForSlot(tileset, passabilityTerrainSlotForTile(tile));
}

export function terrainMaskHasFlag(mask: number, flag: string): boolean {
  const bit = TERRAIN_FLAG_BITS[flag as TerrainFlagName];
  return bit !== undefined && (mask & bit) !== 0;
}

export function readTerrainMetadataDiagnostics(): Readonly<TerrainMetadataDiagnostics> {
  return { ...diagnostics };
}

export function resetTerrainMetadataDiagnostics(): void {
  diagnostics["plan019.terrainMetadata.cacheBuilds"] = 0;
  diagnostics["plan019.terrainMetadata.cacheHits"] = 0;
  diagnostics["plan019.terrainMetadata.slotLookups"] = 0;
}

function terrainMaskForFlags(flags: readonly string[]): number {
  let mask = 0;
  for (const flag of flags) {
    const bit = TERRAIN_FLAG_BITS[flag as TerrainFlagName];
    if (bit !== undefined) {
      mask |= bit;
    }
  }
  return mask;
}

function passabilityTerrainSlotForTile(tile: number): number {
  return Math.floor(Math.max(0, tile) / 0x10) * 0x10;
}

function rawTerrainSlotForTile(tile: number): number {
  return tile & 0xfff0;
}
