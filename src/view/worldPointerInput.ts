import {
  issuePendingWorldCommandAt,
  issueSourceRightButtonOrder,
  shouldKeepPendingWorldCommandAfterIssue,
  type PendingWorldCommand
} from "../simulation/orders";
import type { WorldState, WorldUnit } from "../simulation/world";
import { createSelectionDrag, type SelectionDragState } from "./selectionInput";

export interface WorldPointerInput {
  button: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  doubleClick: boolean;
}

export type WorldPointerDownResult =
  | { kind: "none"; pointerWorldPosition: { x: number; y: number }; pendingWorldCommand: PendingWorldCommand | null; selectionDrag: null; feedbackUnit: null; issued: null }
  | { kind: "click"; pointerWorldPosition: { x: number; y: number }; pendingWorldCommand: PendingWorldCommand | null; selectionDrag: null; feedbackUnit: null; issued: null }
  | { kind: "command-feedback"; pointerWorldPosition: { x: number; y: number }; pendingWorldCommand: PendingWorldCommand | null; selectionDrag: null; feedbackUnit: WorldUnit | null; issued: boolean }
  | { kind: "selection-drag"; pointerWorldPosition: { x: number; y: number }; pendingWorldCommand: PendingWorldCommand | null; selectionDrag: SelectionDragState; feedbackUnit: null; issued: null };

export function handleWorldPointerDown(
  world: WorldState,
  x: number,
  y: number,
  input: WorldPointerInput,
  selectedUnitIds: string[],
  pendingWorldCommand: PendingWorldCommand | null
): WorldPointerDownResult {
  const pointerWorldPosition = { x, y };
  if (input.button === 2) {
    if (pendingWorldCommand) {
      return { kind: "click", pointerWorldPosition, pendingWorldCommand: null, selectionDrag: null, feedbackUnit: null, issued: null };
    }
    if (selectedUnitIds.length > 0) {
      const issued = issueSourceRightButtonOrder(world, selectedUnitIds, x, y, input.shiftKey);
      return { kind: "command-feedback", pointerWorldPosition, pendingWorldCommand, selectionDrag: null, feedbackUnit: firstSelectedUnit(world, selectedUnitIds), issued };
    }
    return { kind: "none", pointerWorldPosition, pendingWorldCommand, selectionDrag: null, feedbackUnit: null, issued: null };
  }
  if (input.button !== 0) {
    return { kind: "none", pointerWorldPosition, pendingWorldCommand, selectionDrag: null, feedbackUnit: null, issued: null };
  }
  if (pendingWorldCommand && selectedUnitIds.length > 0) {
    const issued = issuePendingWorldCommandAt(world, selectedUnitIds, pendingWorldCommand, x, y, input.shiftKey);
    return {
      kind: "command-feedback",
      pointerWorldPosition,
      pendingWorldCommand: shouldKeepPendingWorldCommandAfterIssue(world, pendingWorldCommand, issued) ? pendingWorldCommand : null,
      selectionDrag: null,
      feedbackUnit: firstSelectedUnit(world, selectedUnitIds),
      issued
    };
  }
  return {
    kind: "selection-drag",
    pointerWorldPosition,
    pendingWorldCommand,
    selectionDrag: createSelectionDrag(x, y, input.shiftKey, input.ctrlKey || input.doubleClick),
    feedbackUnit: null,
    issued: null
  };
}

function firstSelectedUnit(world: WorldState, selectedUnitIds: string[]): WorldUnit | null {
  return selectedUnitIds.map((id) => world.units.find((candidate) => candidate.id === id)).find(Boolean) ?? null;
}
