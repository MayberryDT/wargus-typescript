import type { WargusUnit } from "../wargus/types";
import type { WorldState, WorldUnit } from "./world";

export type WorldUnitIndexDiagnostics = {
  "plan020.unitIdIndex.lookups": number;
  "plan020.unitIdIndex.rebuilds": number;
  "plan020.unitIdIndex.invalidations": number;
  "plan020.unitIdIndex.duplicateIds": number;
};

type WorldUnitIndexCache = {
  tick: number;
  units: WorldUnit[];
  unitCount: number;
  generation: number;
  unitsById: Map<string, WorldUnit>;
  duplicateIds: string[];
};

const worldUnitIndexDiagnostics: WorldUnitIndexDiagnostics = {
  "plan020.unitIdIndex.lookups": 0,
  "plan020.unitIdIndex.rebuilds": 0,
  "plan020.unitIdIndex.invalidations": 0,
  "plan020.unitIdIndex.duplicateIds": 0
};

const worldUnitIndexCaches = new WeakMap<WorldState, WorldUnitIndexCache>();
const worldUnitIndexGenerations = new WeakMap<WorldState, number>();

export function findWorldUnitById(world: WorldState, unitId: string): WorldUnit | undefined {
  worldUnitIndexDiagnostics["plan020.unitIdIndex.lookups"] += 1;
  return worldUnitIndexFor(world).unitsById.get(unitId);
}

export function invalidateWorldUnitIndex(world: WorldState): void {
  worldUnitIndexGenerations.set(world, worldUnitIndexGeneration(world) + 1);
  worldUnitIndexDiagnostics["plan020.unitIdIndex.invalidations"] += 1;
}

export function assertWorldUnitIndexIntegrity(world: WorldState): void {
  const duplicateIds = worldUnitIndexFor(world).duplicateIds;
  if (duplicateIds.length > 0) {
    throw new Error(`Duplicate world unit IDs: ${duplicateIds.join(", ")}`);
  }
}

export function readWorldUnitIndexDiagnostics(): WorldUnitIndexDiagnostics {
  return { ...worldUnitIndexDiagnostics };
}

export function resetWorldUnitIndexDiagnostics(): void {
  worldUnitIndexDiagnostics["plan020.unitIdIndex.lookups"] = 0;
  worldUnitIndexDiagnostics["plan020.unitIdIndex.rebuilds"] = 0;
  worldUnitIndexDiagnostics["plan020.unitIdIndex.invalidations"] = 0;
  worldUnitIndexDiagnostics["plan020.unitIdIndex.duplicateIds"] = 0;
}

function worldUnitIndexFor(world: WorldState): WorldUnitIndexCache {
  const generation = worldUnitIndexGeneration(world);
  const existing = worldUnitIndexCaches.get(world);
  if (
    existing
    && existing.tick === world.tick
    && existing.units === world.units
    && existing.unitCount === world.units.length
    && existing.generation === generation
  ) {
    return existing;
  }

  const unitsById = new Map<string, WorldUnit>();
  const duplicateIds: string[] = [];
  const seenDuplicateIds = new Set<string>();
  for (const unit of world.units) {
    if (!unitsById.has(unit.id)) {
      unitsById.set(unit.id, unit);
    } else if (!seenDuplicateIds.has(unit.id)) {
      seenDuplicateIds.add(unit.id);
      duplicateIds.push(unit.id);
    }
  }
  const cache = {
    tick: world.tick,
    units: world.units,
    unitCount: world.units.length,
    generation,
    unitsById,
    duplicateIds
  };
  worldUnitIndexCaches.set(world, cache);
  worldUnitIndexDiagnostics["plan020.unitIdIndex.rebuilds"] += 1;
  worldUnitIndexDiagnostics["plan020.unitIdIndex.duplicateIds"] += duplicateIds.length;
  return cache;
}

function worldUnitIndexGeneration(world: WorldState): number {
  return worldUnitIndexGenerations.get(world) ?? 0;
}

export function liveUnitsIncludingCargo(world: WorldState): WorldUnit[] {
  const units: WorldUnit[] = [];
  const collect = (unit: WorldUnit): void => {
    if (unit.hitPoints <= 0) {
      return;
    }
    units.push(unit);
    for (const cargo of unit.cargo ?? []) {
      collect(cargo);
    }
  };
  for (const unit of world.units) {
    collect(unit);
  }
  return units;
}

export function unitDefinitionFromWorldUnit(unit: WorldUnit): WargusUnit {
  return {
    id: unit.typeId,
    name: unit.name,
    image: unit.image,
    icon: null,
    animation: unit.animation,
    type: unit.kind,
    tileSize: [Math.max(1, Math.round(unit.frameWidth / 32)), Math.max(1, Math.round(unit.frameHeight / 32))],
    hitPoints: unit.maxHitPoints,
    armor: unit.armor,
    basicDamage: unit.basicDamage,
    piercingDamage: unit.piercingDamage,
    maxAttackRange: unit.attackRange,
    supply: unit.supply,
    demand: unit.demand,
    canAttack: unit.canAttack,
    costs: [],
    sounds: {},
    source: "runtime"
  };
}

export function localPlayerRace(world: WorldState | null): string | null | undefined {
  return world?.players.find((candidate) => candidate.id === world.visibilityPlayer)?.race;
}

export function selectedCommandRace(world: WorldState, selectedUnitIds: string[]): "human" | "orc" {
  const playerId = selectedUnitIds
    .map((id) => world.units.find((candidate) => candidate.id === id))
    .find((unit) => unit?.player === world.visibilityPlayer)?.player ?? world.visibilityPlayer;
  return world.players.find((player) => player.id === playerId)?.race === "orc" ? "orc" : "human";
}

export function isLocalPlayerEvent(world: WorldState, player: number): boolean {
  return player === world.visibilityPlayer;
}
