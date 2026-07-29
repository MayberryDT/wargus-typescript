import {
  isCircleVisibleToPlayer,
  isInvisibleUtilityUnit,
  isUnitHiddenInConstruction,
  isUnitInsideResourceSource,
  isUnitVisibleToPlayer,
  type WorldState
} from "../simulation/world";
import type { WargusAnimation, WargusManifest } from "../wargus/types";

export interface WorldViewport {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

type RenderCounts = {
  units: number;
  corpses: number;
  projectiles: number;
  spellEffects: number;
};

export interface PreparedRenderStrata<T> {
  below40: readonly T[];
  atLeast40: readonly T[];
}

export interface WorldRenderSnapshot {
  units: readonly WorldState["units"][number][];
  corpses: PreparedRenderStrata<WorldState["corpses"][number]>;
  projectiles: PreparedRenderStrata<WorldState["projectiles"][number]>;
  spellEffects: PreparedRenderStrata<WorldState["spellEffects"][number]>;
  animationById: ReadonlyMap<string, WargusAnimation>;
  unitById: ReadonlyMap<string, WorldState["units"][number]>;
  researchByBuildingId: ReadonlyMap<string, WorldState["activeResearch"][number]>;
  pendingAttackBySourceId: ReadonlyMap<string, WorldState["pendingAttacks"][number]>;
}

export interface Plan021RenderPreparationDiagnostics {
  plan021: {
    renderPreparation: {
      sourceCounts: RenderCounts;
      retainedCounts: RenderCounts;
      sortCounts: RenderCounts;
      sortedItems: RenderCounts;
      snapshotCount: number;
    };
  };
}

const zeroCounts = (): RenderCounts => ({
  units: 0,
  corpses: 0,
  projectiles: 0,
  spellEffects: 0
});

let diagnostics = {
  sourceCounts: zeroCounts(),
  retainedCounts: zeroCounts(),
  sortCounts: zeroCounts(),
  sortedItems: zeroCounts(),
  snapshotCount: 0
};

const animationIndexes = new WeakMap<WargusManifest, ReadonlyMap<string, WargusAnimation>>();

export function resetPlan021RenderPreparationDiagnostics(): void {
  diagnostics = {
    sourceCounts: zeroCounts(),
    retainedCounts: zeroCounts(),
    sortCounts: zeroCounts(),
    sortedItems: zeroCounts(),
    snapshotCount: 0
  };
}

export function getPlan021RenderPreparationDiagnostics(): Plan021RenderPreparationDiagnostics {
  return {
    plan021: {
      renderPreparation: {
        sourceCounts: { ...diagnostics.sourceCounts },
        retainedCounts: { ...diagnostics.retainedCounts },
        sortCounts: { ...diagnostics.sortCounts },
        sortedItems: { ...diagnostics.sortedItems },
        snapshotCount: diagnostics.snapshotCount
      }
    }
  };
}

export function prepareWorldRenderSnapshot(
  world: WorldState,
  manifest: WargusManifest,
  viewport: WorldViewport
): WorldRenderSnapshot {
  const animationById = animationIndexForManifest(manifest);
  const unitById = firstBy(world.units, (unit) => unit.id);
  const researchByBuildingId = firstBy(world.activeResearch, (research) => research.buildingId);
  const pendingAttackBySourceId = firstBy(world.pendingAttacks, (attack) => attack.sourceId);

  diagnostics.snapshotCount += 1;
  diagnostics.sourceCounts.units += world.units.length;
  diagnostics.sourceCounts.corpses += world.corpses.length;
  diagnostics.sourceCounts.projectiles += world.projectiles.length;
  diagnostics.sourceCounts.spellEffects += world.spellEffects.length;

  const units = world.units
    .filter((unit) => (
      !isUnitHiddenInConstruction(unit)
      && !isInvisibleUtilityUnit(unit)
      && !isUnitInsideResourceSource(unit)
      && isUnitVisibleToPlayer(world, unit, world.visibilityPlayer)
      && circleIntersectsViewport(unit.x, unit.y, Math.max(unit.radius + 96, unit.frameWidth, unit.frameHeight), viewport)
    ))
    .sort(compareUnitDrawOrder);
  const corpses = world.corpses
    .filter((corpse) => (
      isCorpseVisibleToPlayer(world, corpse, world.visibilityPlayer)
      && circleIntersectsViewport(corpse.x, corpse.y, corpse.radius + 64, viewport)
    ))
    .sort(compareCorpseDrawOrder);
  const projectiles = world.projectiles
    .filter((projectile) => {
      const position = projectileDrawPosition(projectile);
      const radius = projectileVisibilityRadius(projectile, manifest);
      return isCircleVisibleToPlayer(world, position.x, position.y, radius, world.visibilityPlayer)
        && circleIntersectsViewport(position.x, position.y, radius, viewport);
    })
    .sort(compareProjectileDrawOrder);
  const spellEffects = world.spellEffects
    .filter((effect) => (
      isCircleVisibleToPlayer(world, effect.x, effect.y, effect.radius, world.visibilityPlayer)
      && circleIntersectsViewport(effect.x, effect.y, effect.radius + 24, viewport)
    ))
    .sort(compareSpellEffectDrawOrder);

  diagnostics.retainedCounts.units += units.length;
  diagnostics.retainedCounts.corpses += corpses.length;
  diagnostics.retainedCounts.projectiles += projectiles.length;
  diagnostics.retainedCounts.spellEffects += spellEffects.length;
  diagnostics.sortCounts.units += 1;
  diagnostics.sortCounts.corpses += 1;
  diagnostics.sortCounts.projectiles += 1;
  diagnostics.sortCounts.spellEffects += 1;
  diagnostics.sortedItems.units += units.length;
  diagnostics.sortedItems.corpses += corpses.length;
  diagnostics.sortedItems.projectiles += projectiles.length;
  diagnostics.sortedItems.spellEffects += spellEffects.length;

  return {
    units,
    corpses: partitionAtDrawLevel40(corpses),
    projectiles: partitionAtDrawLevel40(projectiles),
    spellEffects: partitionAtDrawLevel40(spellEffects),
    animationById,
    unitById,
    researchByBuildingId,
    pendingAttackBySourceId
  };
}

function animationIndexForManifest(manifest: WargusManifest): ReadonlyMap<string, WargusAnimation> {
  const cached = animationIndexes.get(manifest);
  if (cached) {
    return cached;
  }
  const index = firstBy(manifest.animations, (animation) => animation.id);
  animationIndexes.set(manifest, index);
  return index;
}

function firstBy<T>(values: readonly T[], keyFor: (value: T) => string): ReadonlyMap<string, T> {
  const index = new Map<string, T>();
  for (const value of values) {
    const key = keyFor(value);
    if (!index.has(key)) {
      index.set(key, value);
    }
  }
  return index;
}

function partitionAtDrawLevel40<T extends { drawLevel: number }>(values: readonly T[]): PreparedRenderStrata<T> {
  const split = values.findIndex((value) => value.drawLevel >= 40);
  if (split < 0) {
    return { below40: values, atLeast40: [] };
  }
  return {
    below40: values.slice(0, split),
    atLeast40: values.slice(split)
  };
}

function compareUnitDrawOrder(left: WorldState["units"][number], right: WorldState["units"][number]): number {
  return left.drawLevel - right.drawLevel
    || (left.y + left.radius) - (right.y + right.radius)
    || left.id.localeCompare(right.id);
}

function compareCorpseDrawOrder(left: WorldState["corpses"][number], right: WorldState["corpses"][number]): number {
  return left.drawLevel - right.drawLevel
    || (left.y + left.radius) - (right.y + right.radius)
    || left.id.localeCompare(right.id);
}

function compareProjectileDrawOrder(left: WorldState["projectiles"][number], right: WorldState["projectiles"][number]): number {
  return left.drawLevel - right.drawLevel;
}

function compareSpellEffectDrawOrder(left: WorldState["spellEffects"][number], right: WorldState["spellEffects"][number]): number {
  return left.drawLevel - right.drawLevel
    || left.y - right.y
    || left.id.localeCompare(right.id);
}

function isCorpseVisibleToPlayer(
  world: WorldState,
  corpse: WorldState["corpses"][number],
  playerId: number
): boolean {
  return isCircleVisibleToPlayer(world, corpse.x, corpse.y, corpse.radius, playerId)
    || (corpse.visibleUnderFog && isCorpseExploredByPlayer(world, corpse, playerId));
}

function isCorpseExploredByPlayer(
  world: WorldState,
  corpse: WorldState["corpses"][number],
  playerId: number
): boolean {
  if (playerId !== world.visibilityPlayer) {
    return isCircleVisibleToPlayer(world, corpse.x, corpse.y, corpse.radius, playerId);
  }
  const clampedRadius = Math.max(0, corpse.radius);
  const left = Math.floor((corpse.x - clampedRadius) / world.tileSize);
  const right = Math.floor((corpse.x + clampedRadius) / world.tileSize);
  const top = Math.floor((corpse.y - clampedRadius) / world.tileSize);
  const bottom = Math.floor((corpse.y + clampedRadius) / world.tileSize);
  for (let tileY = top; tileY <= bottom; tileY += 1) {
    for (let tileX = left; tileX <= right; tileX += 1) {
      if (
        tileX >= 0
        && tileY >= 0
        && tileX < world.map.width
        && tileY < world.map.height
        && world.exploredTiles[tileY * world.map.width + tileX] === 1
      ) {
        return true;
      }
    }
  }
  return false;
}

function projectileDrawPosition(projectile: WorldState["projectiles"][number]): { x: number; y: number } {
  if (projectile.className !== "missile-class-parabolic") {
    return { x: projectile.x, y: projectile.y };
  }
  const totalDistance = Math.max(1, Math.hypot(projectile.targetX - projectile.originX, projectile.targetY - projectile.originY));
  const remainingDistance = Math.hypot(projectile.targetX - projectile.x, projectile.targetY - projectile.y);
  const progress = Math.max(0, Math.min(1, 1 - remainingDistance / totalDistance));
  const arcHeight = Math.min(72, Math.max(24, totalDistance * 0.18));
  return { x: projectile.x, y: projectile.y - Math.sin(progress * Math.PI) * arcHeight };
}

function projectileVisibilityRadius(
  projectile: WorldState["projectiles"][number],
  manifest: WargusManifest
): number {
  const missile = projectile.missileId
    ? manifest.missiles.find((candidate) => candidate.id === projectile.missileId)
    : undefined;
  if (missile?.file && missile.size) {
    return Math.ceil(Math.max(...missile.size) * 0.5);
  }
  if (projectile.kind === "siege" || projectile.kind === "torpedo") {
    return 28;
  }
  if (projectile.kind === "cannon") {
    return 18;
  }
  return 22;
}

function circleIntersectsViewport(x: number, y: number, radius: number, viewport: WorldViewport): boolean {
  return x + radius >= viewport.left
    && x - radius <= viewport.right
    && y + radius >= viewport.top
    && y - radius <= viewport.bottom;
}
