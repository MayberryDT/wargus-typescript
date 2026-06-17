import type { WorldState, WorldUnit } from "./world";

export function findNextIdleWorker(world: WorldState, selectedUnitIds: string[], playerId = world.visibilityPlayer): WorldUnit | null {
  const idleWorkers = world.units
    .filter((unit) => isIdleWorkerForPlayer(world, unit, playerId))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (idleWorkers.length === 0) {
    return null;
  }
  const selectedIndex = idleWorkers.findIndex((unit) => selectedUnitIds.includes(unit.id));
  return idleWorkers[(selectedIndex + 1) % idleWorkers.length] ?? null;
}

export function isIdleWorkerForPlayer(world: WorldState, unit: WorldUnit, playerId = world.visibilityPlayer): boolean {
  return unit.player === playerId
    && unit.hitPoints > 0
    && !unit.construction
    && isGoldOrWoodWorkerUnit(unit)
    && !unit.order
    && unit.resourcesHeld <= 0;
}

export function isGoldOrWoodWorkerUnit(unit: Pick<WorldUnit, "gatherResources">): boolean {
  return unit.gatherResources.includes("gold") || unit.gatherResources.includes("wood");
}
