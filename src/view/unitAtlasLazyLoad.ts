import type { WorldState } from "../simulation/world";
import { liveUnitsIncludingCargo, unitDefinitionFromWorldUnit } from "../simulation/worldSelectors";
import type { WargusUnit } from "../wargus/types";
import { loadUnitTextureAtlasForDefinition, type UnitTextureAtlas } from "./unitTextureAtlas";

export interface UnitAtlasLazyLoadState {
  generation: number;
  pendingUnitAtlasLoads: Set<string>;
  failedUnitAtlasLoads: Set<string>;
}

export function createUnitAtlasLazyLoadState(): UnitAtlasLazyLoadState {
  return {
    generation: 0,
    pendingUnitAtlasLoads: new Set(),
    failedUnitAtlasLoads: new Set()
  };
}

export function resetUnitAtlasLazyLoadState(state: UnitAtlasLazyLoadState): void {
  state.generation += 1;
  state.pendingUnitAtlasLoads.clear();
  state.failedUnitAtlasLoads.clear();
}

export function ensureMissingUnitAtlases(
  state: UnitAtlasLazyLoadState,
  loadedWorld: WorldState,
  unitAtlases: Map<string, UnitTextureAtlas>,
  manifestUnitDefinitions: WargusUnit[] | null
): void {
  const definitions = manifestUnitDefinitions ?? loadedWorld.unitDefinitions;
  for (const unit of liveUnitsIncludingCargo(loadedWorld)) {
    if (unitAtlases.has(unit.typeId) || state.pendingUnitAtlasLoads.has(unit.typeId) || state.failedUnitAtlasLoads.has(unit.typeId)) {
      continue;
    }
    const definition = definitions.find((candidate) => candidate.id === unit.typeId);
    if (!definition?.image) {
      state.failedUnitAtlasLoads.add(unit.typeId);
      continue;
    }
    state.pendingUnitAtlasLoads.add(unit.typeId);
    const generation = state.generation;
    void loadUnitTextureAtlasForDefinition(definition ?? unitDefinitionFromWorldUnit(unit), definitions, loadedWorld.map.setup?.tileset ?? null).then((atlas) => {
      if (generation !== state.generation) {
        return;
      }
      state.pendingUnitAtlasLoads.delete(unit.typeId);
      if (atlas) {
        unitAtlases.set(unit.typeId, atlas);
      } else {
        state.failedUnitAtlasLoads.add(unit.typeId);
      }
    }).catch(() => {
      if (generation !== state.generation) {
        return;
      }
      state.pendingUnitAtlasLoads.delete(unit.typeId);
      state.failedUnitAtlasLoads.add(unit.typeId);
    });
  }
}
