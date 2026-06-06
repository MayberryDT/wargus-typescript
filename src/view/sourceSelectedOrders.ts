import type { WorldState, WorldUnit } from "../simulation/world";

export interface SourceSelectedOrderRenderState {
  order: WorldUnit["order"] | null;
  rallyPoint: WorldUnit["rallyPoint"];
}

export function sourceSelectedOrderRenderState(
  world: Pick<WorldState, "visibilityPlayer">,
  unit: WorldUnit,
  selectedUnitIds: ReadonlySet<string>,
  sourceSelectedOrdersVisible: boolean
): SourceSelectedOrderRenderState {
  if (!sourceSelectedOrdersVisible || unit.player !== world.visibilityPlayer || !selectedUnitIds.has(unit.id)) {
    return { order: null, rallyPoint: null };
  }
  return { order: unit.order ?? null, rallyPoint: unit.rallyPoint };
}
