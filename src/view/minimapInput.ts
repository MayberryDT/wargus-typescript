import {
  issueGroupQueueMoveOrder,
  issueGroupSmartOrRallyOrder,
  issuePendingWorldCommandAt,
  shouldKeepPendingWorldCommandAfterIssue,
  type PendingWorldCommand
} from "../simulation/orders";
import type { WorldState, WorldUnit } from "../simulation/world";

export type MinimapInput = { button: number; shiftKey: boolean };

export type MinimapCommandResult =
  | { kind: "none"; pendingWorldCommand: PendingWorldCommand | null }
  | { kind: "center-camera"; tileX: number; tileY: number; pendingWorldCommand: PendingWorldCommand | null }
  | { kind: "click"; pendingWorldCommand: PendingWorldCommand | null }
  | { kind: "command-feedback"; issued: boolean; pendingWorldCommand: PendingWorldCommand | null; feedbackUnit: WorldUnit | null };

export function handleMinimapCommand(
  world: WorldState,
  tileX: number,
  tileY: number,
  input: MinimapInput,
  selectedUnitIds: string[],
  pendingWorldCommand: PendingWorldCommand | null
): MinimapCommandResult {
  const targetX = tileX * world.tileSize + world.tileSize / 2;
  const targetY = tileY * world.tileSize + world.tileSize / 2;
  if (pendingWorldCommand && input.button !== 2) {
    const issued = issuePendingWorldCommandAt(world, selectedUnitIds, pendingWorldCommand, targetX, targetY, input.shiftKey);
    return {
      kind: "command-feedback",
      issued,
      feedbackUnit: firstSelectedUnit(world, selectedUnitIds),
      pendingWorldCommand: shouldKeepPendingWorldCommandAfterIssue(world, pendingWorldCommand, issued) ? pendingWorldCommand : null
    };
  }
  if (input.button !== 2) {
    return { kind: "center-camera", tileX, tileY, pendingWorldCommand };
  }
  if (pendingWorldCommand) {
    return { kind: "click", pendingWorldCommand: null };
  }
  if (selectedUnitIds.length === 0) {
    return { kind: "none", pendingWorldCommand };
  }
  const issued = input.shiftKey
    ? issueGroupQueueMoveOrder(world, selectedUnitIds, targetX, targetY)
    : issueGroupSmartOrRallyOrder(world, selectedUnitIds, targetX, targetY);
  return { kind: "command-feedback", issued, pendingWorldCommand, feedbackUnit: firstSelectedUnit(world, selectedUnitIds) };
}

function firstSelectedUnit(world: WorldState, selectedUnitIds: string[]): WorldUnit | null {
  return selectedUnitIds.map((id) => world.units.find((candidate) => candidate.id === id)).find(Boolean) ?? null;
}
