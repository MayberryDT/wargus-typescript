import type { WargusUnit } from "../wargus/types";
import type { WorldState, WorldUnit } from "./world";

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
