import {
  findSelectableUnitAt,
  mergeSelection,
  registerUnitClick,
  selectUnitsInRect,
  selectVisibleUnitsOfType,
  sourceDoubleClickDelayMs,
  toggleSelection
} from "../simulation/orders";
import type { WorldState, WorldUnit } from "../simulation/world";

export interface SelectionDragState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
  sameType: boolean;
  active: boolean;
}

export interface SelectionClickState {
  lastUnitClick: { typeId: string; at: number } | null;
  selectionVoiceClick: { unitId: string; count: number; at: number } | null;
}

export interface SelectionDragResult {
  selectedUnitIds: string[];
  commandPage: number;
  clickState: SelectionClickState;
  voiceUnit: WorldUnit | null;
  playAnnoyed: boolean;
}

export function createSelectionClickState(): SelectionClickState {
  return {
    lastUnitClick: null,
    selectionVoiceClick: null
  };
}

export function createSelectionDrag(x: number, y: number, additive: boolean, sameType: boolean): SelectionDragState {
  return {
    startX: x,
    startY: y,
    currentX: x,
    currentY: y,
    additive,
    sameType,
    active: true
  };
}

export function updateSelectionDrag(drag: SelectionDragState | null, x: number, y: number): void {
  if (!drag) {
    return;
  }
  drag.currentX = x;
  drag.currentY = y;
}

export function clearSelectionClickState(state: SelectionClickState): void {
  state.lastUnitClick = null;
  state.selectionVoiceClick = null;
}

export function completeSelectionDrag(
  world: WorldState,
  drag: SelectionDragState,
  selectedUnitIds: string[],
  clickState: SelectionClickState,
  playableBounds: { left: number; right: number; top: number; bottom: number },
  now = performance.now()
): SelectionDragResult | null {
  const moved = Math.hypot(drag.currentX - drag.startX, drag.currentY - drag.startY);
  if (moved >= 10) {
    const ids = selectUnitsInRect(world, drag.startX, drag.startY, drag.currentX, drag.currentY);
    clearSelectionClickState(clickState);
    return {
      selectedUnitIds: drag.additive ? mergeSelection(world, selectedUnitIds, ids) : ids,
      commandPage: 0,
      clickState,
      voiceUnit: null,
      playAnnoyed: false
    };
  }

  const unit = findSelectableUnitAt(world, drag.currentX, drag.currentY);
  if (unit?.clicksToExplode && registerUnitClick(world, unit.id, now, selectedUnitIds.length === 1 && selectedUnitIds[0] === unit.id)) {
    clearSelectionClickState(clickState);
    return {
      selectedUnitIds: selectedUnitIds.filter((id) => id !== unit.id),
      commandPage: 0,
      clickState,
      voiceUnit: null,
      playAnnoyed: false
    };
  }

  if (unit && unit.player === world.visibilityPlayer) {
    const count = clickState.selectionVoiceClick?.unitId === unit.id && now - clickState.selectionVoiceClick.at <= 1800
      ? clickState.selectionVoiceClick.count + 1
      : 1;
    clickState.selectionVoiceClick = { unitId: unit.id, count, at: now };
  } else {
    clickState.selectionVoiceClick = null;
  }

  let nextSelectedUnitIds: string[];
  if (unit && unit.player === world.visibilityPlayer && (drag.sameType || (clickState.lastUnitClick?.typeId === unit.typeId && now - clickState.lastUnitClick.at <= sourceDoubleClickDelayMs(world)))) {
    nextSelectedUnitIds = selectVisibleUnitsOfType(world, unit.id, playableBounds, selectedUnitIds, drag.additive);
    clickState.lastUnitClick = null;
  } else {
    nextSelectedUnitIds = drag.additive ? toggleSelection(world, selectedUnitIds, unit?.id ?? null) : unit ? [unit.id] : [];
    clickState.lastUnitClick = unit ? { typeId: unit.typeId, at: now } : null;
  }

  const voiceUnit = nextSelectedUnitIds
    .map((id) => world.units.find((candidate) => candidate.id === id))
    .find((candidate): candidate is WorldUnit => Boolean(candidate)) ?? null;
  return {
    selectedUnitIds: nextSelectedUnitIds,
    commandPage: 0,
    clickState,
    voiceUnit,
    playAnnoyed: Boolean(voiceUnit && clickState.selectionVoiceClick?.unitId === voiceUnit.id && clickState.selectionVoiceClick.count >= 4)
  };
}
