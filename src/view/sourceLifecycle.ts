import type { WorldState } from "../simulation/world";
import { sourceMouseScrollingEnabled } from "./sourceUiHelpers";

export function sourcePauseOnLeaveEnabled(world: WorldState | null): boolean {
  return world?.engineSettings.pauseOnLeaveDefault !== false;
}

export function sourceLeaveStopScrollingEnabled(world: WorldState | null): boolean {
  return world?.engineSettings.leaveStopScrollingDefault !== false;
}

export function sourceMouseDragScrollEnabled(world: WorldState | null, button: number): boolean {
  return button === 1 && sourceMouseScrollingEnabled(world);
}
