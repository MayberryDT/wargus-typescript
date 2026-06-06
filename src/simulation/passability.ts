import { isUnitHiddenInConstruction, isUnitInsideResourceSource, type WorldState, type WorldUnit } from "./world";

export type MovementKind = "land" | "naval" | "fly";

export function movementKindForUnit(unit: WorldUnit): MovementKind {
  if (unit.kind === "fly") {
    return "fly";
  }
  if (unit.kind === "naval") {
    return "naval";
  }
  return "land";
}

export function isTilePassable(world: WorldState, x: number, y: number, movement: MovementKind, movingUnitId?: string, ignoreBlockers = false): boolean {
  if (x < 0 || y < 0 || x >= world.map.width || y >= world.map.height) {
    return false;
  }
  if (movement === "fly") {
    return true;
  }

  const tile = world.tiles[y * world.map.width + x] ?? 0;
  const sourceFlags = sourceTileFlags(world, tile);
  if (sourceFlags) {
    if (movement === "naval") {
      return (
        (sourceFlags.has("water") || sourceFlags.has("coast"))
        && !sourceFlags.has("land")
        && !sourceFlags.has("unpassable")
        && (ignoreBlockers || !isOccupiedByBlocker(world, x, y, movingUnitId))
      );
    }
    return sourceFlags.has("land") && !sourceFlags.has("unpassable") && !sourceFlags.has("forest") && !sourceFlags.has("rock") && !sourceFlags.has("wall") && (ignoreBlockers || !isOccupiedByBlocker(world, x, y, movingUnitId));
  }
  if (movement === "naval") {
    return isWaterTile(tile) && (ignoreBlockers || !isOccupiedByBlocker(world, x, y, movingUnitId));
  }
  if (!isLandTile(tile)) {
    return false;
  }
  return ignoreBlockers || !isOccupiedByBlocker(world, x, y, movingUnitId);
}

export function isUnitFootprintPassable(world: WorldState, centerTileX: number, centerTileY: number, unit: Pick<WorldUnit, "id" | "tileWidth" | "tileHeight" | "kind">, movement: MovementKind = movementKindForUnit(unit as WorldUnit), ignoreBlockers = false): boolean {
  const width = Math.max(1, Math.floor(unit.tileWidth));
  const height = Math.max(1, Math.floor(unit.tileHeight));
  const left = centerTileX - Math.floor(width / 2);
  const top = centerTileY - Math.floor(height / 2);
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      if (!isTilePassable(world, x, y, movement, unit.id, ignoreBlockers)) {
        return false;
      }
    }
  }
  return true;
}

export function worldToTile(world: WorldState, x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(world.map.width - 1, Math.floor(x / world.tileSize))),
    y: Math.max(0, Math.min(world.map.height - 1, Math.floor(y / world.tileSize)))
  };
}

export function tileToWorldCenter(world: WorldState, x: number, y: number): { x: number; y: number } {
  return {
    x: x * world.tileSize + world.tileSize / 2,
    y: y * world.tileSize + world.tileSize / 2
  };
}

export function isHarvestableWoodTile(tile: number): boolean {
  if (isSourceRemovedTreeTile(tile)) {
    return false;
  }
  const slot = tileSlot(tile);
  return slot === 0x070 || (slot >= 0x700 && slot <= 0x7df);
}

export function isSourceHarvestableWoodTile(world: WorldState, tile: number): boolean {
  if (isSourceRemovedTreeTile(tile)) {
    return false;
  }
  return sourceTileFlags(world, tile)?.has("forest") ?? isHarvestableWoodTile(tile);
}

function isOccupiedByBlocker(world: WorldState, tileX: number, tileY: number, movingUnitId?: string): boolean {
  return world.units.some((unit) => {
    if (unit.id === movingUnitId || unit.hitPoints <= 0 || isUnitHiddenInConstruction(unit) || isUnitInsideResourceSource(unit) || unit.nonSolid) {
      return false;
    }
    return unitFootprintContainsTile(world, unit, tileX, tileY);
  });
}

function unitFootprintContainsTile(world: WorldState, unit: WorldUnit, tileX: number, tileY: number): boolean {
  const unitTile = worldToTile(world, unit.x, unit.y);
  const left = unitTile.x - Math.floor(unit.tileWidth / 2);
  const top = unitTile.y - Math.floor(unit.tileHeight / 2);
  return tileX >= left && tileX < left + unit.tileWidth && tileY >= top && tileY < top + unit.tileHeight;
}

export function isWaterTile(tile: number): boolean {
  const slot = tileSlot(tile);
  return slot === 0x010 || slot === 0x020 || (slot >= 0x100 && slot <= 0x2ff);
}

export function isSourceWaterTile(world: WorldState, tile: number): boolean {
  const flags = sourceTileFlags(world, tile);
  return flags ? (flags.has("water") || flags.has("coast")) && !flags.has("land") : isWaterTile(tile);
}

export function isLandTile(tile: number): boolean {
  return !isWaterTile(tile) && !isUnpassableLandTile(tile);
}

export function isBuildableTerrainTile(tile: number): boolean {
  return isLandTile(tile) && !isNoBuildingTile(tile);
}

export function isSourceBuildableTerrainTile(world: WorldState, tile: number): boolean {
  const flags = sourceTileFlags(world, tile);
  return flags ? flags.has("land") && !flags.has("no-building") && !flags.has("unpassable") && !flags.has("forest") && !flags.has("rock") && !flags.has("wall") : isBuildableTerrainTile(tile);
}

function sourceTileFlags(world: WorldState, tile: number): Set<string> | null {
  if (isSourceRemovedTreeTile(tile)) {
    return new Set(["land"]);
  }
  const slot = tileSlot(tile);
  const flags = world.tilesetTerrain?.slots.find((entry) => entry.slot === slot)?.flags;
  return flags ? new Set(flags) : null;
}

function isSourceRemovedTreeTile(tile: number): boolean {
  return tile === 126;
}

function isUnpassableLandTile(tile: number): boolean {
  const slot = tileSlot(tile);
  return isHarvestableWoodTile(tile)
    || slot === 0x080
    || (slot >= 0x090 && slot <= 0x0cf)
    || (slot >= 0x400 && slot <= 0x4ff)
    || (slot >= 0x800 && slot <= 0x9df)
    || slot === 0x1010
    || slot === 0x1020;
}

function isNoBuildingTile(tile: number): boolean {
  const slot = tileSlot(tile);
  return (slot >= 0x030 && slot <= 0x040)
    || (slot >= 0x200 && slot <= 0x3ff)
    || (slot >= 0x500 && slot <= 0x5ff)
    || (slot >= 0x1100 && slot <= 0x1fdf)
    || (slot >= 0x2100 && slot <= 0x21df);
}

function tileSlot(tile: number): number {
  return Math.floor(Math.max(0, tile) / 0x10) * 0x10;
}
