import { isUnitHiddenInConstruction, isUnitInsideResourceSource, type WorldState, type WorldUnit } from "./world";
import { passabilityTerrainMaskForTile, terrainMaskHasFlag } from "./terrainMetadata";

export type MovementKind = "land" | "naval" | "fly";
type PassabilityBlockers = "all" | "path-planning" | "static" | "none";

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
  return Number.isFinite(tilePassabilityCost(world, x, y, movement, movingUnitId, ignoreBlockers ? "none" : "all"));
}

function tilePassabilityCost(world: WorldState, x: number, y: number, movement: MovementKind, movingUnitId: string | undefined, blockers: PassabilityBlockers): number {
  if (x < 0 || y < 0 || x >= world.map.width || y >= world.map.height) {
    return Number.POSITIVE_INFINITY;
  }
  const tile = world.tiles[y * world.map.width + x] ?? 0;
  const sourceMask = passabilityTerrainMaskForTile(world.tilesetTerrain, tile);
  let terrainPassable: boolean;
  if (movement === "fly") {
    terrainPassable = true;
  } else if (sourceMask !== null) {
    if (movement === "naval") {
      terrainPassable = (
        (terrainMaskHasFlag(sourceMask, "water") || terrainMaskHasFlag(sourceMask, "coast"))
        && !terrainMaskHasFlag(sourceMask, "land")
        && !terrainMaskHasFlag(sourceMask, "unpassable")
      );
    } else {
      terrainPassable = terrainMaskHasFlag(sourceMask, "land") && !terrainMaskHasFlag(sourceMask, "unpassable") && !terrainMaskHasFlag(sourceMask, "forest") && !terrainMaskHasFlag(sourceMask, "rock") && !terrainMaskHasFlag(sourceMask, "wall");
    }
  } else {
    terrainPassable = movement === "naval" ? isWaterTile(tile) : isLandTile(tile);
  }
  if (!terrainPassable) {
    return Number.POSITIVE_INFINITY;
  }
  if (blockers === "none") {
    return 1;
  }
  return blockerCrossingCost(world, x, y, movement, movingUnitId, blockers);
}

export function isUnitFootprintPassable(world: WorldState, centerTileX: number, centerTileY: number, unit: Pick<WorldUnit, "id" | "tileWidth" | "tileHeight" | "kind">, movement: MovementKind = movementKindForUnit(unit as WorldUnit), ignoreBlockers = false): boolean {
  return Number.isFinite(unitFootprintPassabilityCost(world, centerTileX, centerTileY, unit, movement, ignoreBlockers ? "none" : "all"));
}

export function unitFootprintPathPlanningCost(world: WorldState, centerTileX: number, centerTileY: number, unit: WorldUnit, movement: MovementKind = movementKindForUnit(unit)): number {
  return unitFootprintPassabilityCost(world, centerTileX, centerTileY, unit, movement, "path-planning");
}

export function unitFootprintStaticPlanningCost(world: WorldState, centerTileX: number, centerTileY: number, unit: WorldUnit, movement: MovementKind = movementKindForUnit(unit)): number {
  return unitFootprintPassabilityCost(world, centerTileX, centerTileY, unit, movement, "static");
}

export function hasPathPlanningOccupancy(world: WorldState, movingUnit: WorldUnit): boolean {
  const movement = movementKindForUnit(movingUnit);
  return world.units.some((unit) => isRelevantSolidOccupant(unit, movingUnit.id, movement));
}

export function hasMobilePathPlanningOccupancy(world: WorldState, movingUnit: WorldUnit): boolean {
  const movement = movementKindForUnit(movingUnit);
  return world.units.some((unit) => (
    isRelevantSolidOccupant(unit, movingUnit.id, movement)
    && !isPermanentlyStationaryOccupant(unit)
  ));
}

function unitFootprintPassabilityCost(world: WorldState, centerTileX: number, centerTileY: number, unit: Pick<WorldUnit, "id" | "tileWidth" | "tileHeight" | "kind">, movement: MovementKind, blockers: PassabilityBlockers): number {
  const width = Math.max(1, Math.floor(unit.tileWidth));
  const height = Math.max(1, Math.floor(unit.tileHeight));
  const left = centerTileX - Math.floor(width / 2);
  const top = centerTileY - Math.floor(height / 2);
  let cost = 1;
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      const tileCost = tilePassabilityCost(world, x, y, movement, unit.id, blockers);
      if (!Number.isFinite(tileCost)) {
        return Number.POSITIVE_INFINITY;
      }
      cost = Math.max(cost, tileCost);
    }
  }
  return cost;
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
  const sourceMask = passabilityTerrainMaskForTile(world.tilesetTerrain, tile);
  return sourceMask !== null ? terrainMaskHasFlag(sourceMask, "forest") : isHarvestableWoodTile(tile);
}

function blockerCrossingCost(world: WorldState, tileX: number, tileY: number, movement: MovementKind, movingUnitId: string | undefined, blockers: Exclude<PassabilityBlockers, "none">): number {
  let crossesMovingOccupant = false;
  for (const unit of world.units) {
    if (
      !isRelevantSolidOccupant(unit, movingUnitId, movement)
      || !unitFootprintContainsTile(world, unit, tileX, tileY)
    ) {
      continue;
    }
    if (
      blockers === "all"
      || (blockers === "path-planning" && !isActivelyMovingOccupant(unit))
      || (blockers === "static" && isPermanentlyStationaryOccupant(unit))
    ) {
      return Number.POSITIVE_INFINITY;
    }
    crossesMovingOccupant = true;
  }
  return crossesMovingOccupant ? 5 : 1;
}

function isRelevantSolidOccupant(unit: WorldUnit, movingUnitId: string | undefined, movement: MovementKind): boolean {
  return unit.id !== movingUnitId
    && unit.hitPoints > 0
    && !isUnitHiddenInConstruction(unit)
    && !isUnitInsideResourceSource(unit)
    && !unit.nonSolid
    && movementKindForUnit(unit) === movement;
}

function isPermanentlyStationaryOccupant(unit: WorldUnit): boolean {
  return unit.kind === "building" || unit.speed <= 0;
}

// The TypeScript world has no Stratagus `Moving` flag. A live solid occupant is
// considered actively moving only while a path-bearing order has a waypoint left.
function isActivelyMovingOccupant(unit: WorldUnit): boolean {
  return Boolean(unit.order && "path" in unit.order && unit.order.pathIndex < unit.order.path.length);
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
  const sourceMask = passabilityTerrainMaskForTile(world.tilesetTerrain, tile);
  return sourceMask !== null
    ? (terrainMaskHasFlag(sourceMask, "water") || terrainMaskHasFlag(sourceMask, "coast")) && !terrainMaskHasFlag(sourceMask, "land")
    : isWaterTile(tile);
}

export function isLandTile(tile: number): boolean {
  return !isWaterTile(tile) && !isUnpassableLandTile(tile);
}

export function isBuildableTerrainTile(tile: number): boolean {
  return isLandTile(tile) && !isNoBuildingTile(tile);
}

export function isSourceBuildableTerrainTile(world: WorldState, tile: number): boolean {
  const sourceMask = passabilityTerrainMaskForTile(world.tilesetTerrain, tile);
  return sourceMask !== null
    ? terrainMaskHasFlag(sourceMask, "land") && !terrainMaskHasFlag(sourceMask, "no-building") && !terrainMaskHasFlag(sourceMask, "unpassable") && !terrainMaskHasFlag(sourceMask, "forest") && !terrainMaskHasFlag(sourceMask, "rock") && !terrainMaskHasFlag(sourceMask, "wall")
    : isBuildableTerrainTile(tile);
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
