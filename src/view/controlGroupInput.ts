import { applyControlGroupInput, type ControlGroups, type ControlGroupInput } from "../simulation/orders";
import type { WorldState, WorldUnit } from "../simulation/world";
import { clampCameraToWorld, type Camera, type CameraViewport } from "./camera";

export interface ControlGroupRecallState {
  lastRecall: { group: number; at: number } | null;
}

export interface ControlGroupKeyResult {
  handled: boolean;
  selectedUnitIds: string[];
  recalledUnit: WorldUnit | null;
}

const CONTROL_GROUP_RECALL_WINDOW_MS = 450;

export function createControlGroupRecallState(): ControlGroupRecallState {
  return { lastRecall: null };
}

export function clearControlGroupRecallState(state: ControlGroupRecallState): void {
  state.lastRecall = null;
}

export function applyControlGroupKey(
  state: ControlGroupRecallState,
  world: WorldState,
  controlGroups: ControlGroups,
  selectedUnitIds: string[],
  input: ControlGroupInput,
  camera: Camera,
  viewport: CameraViewport,
  now: number
): ControlGroupKeyResult {
  const result = applyControlGroupInput(world, controlGroups, selectedUnitIds, input);
  if (!result.handled || result.group === null) {
    return { handled: false, selectedUnitIds, recalledUnit: null };
  }
  if (input.ctrlKey || input.metaKey || input.shiftKey) {
    clearControlGroupRecallState(state);
    return { handled: true, selectedUnitIds, recalledUnit: null };
  }
  const recalledUnit = result.recalledUnitId ? world.units.find((candidate) => candidate.id === result.recalledUnitId) ?? null : null;
  if (recalledUnit && state.lastRecall?.group === result.group && now - state.lastRecall.at <= CONTROL_GROUP_RECALL_WINDOW_MS) {
    camera.x = recalledUnit.x - viewport.width / (2 * camera.zoom);
    camera.y = recalledUnit.y - viewport.height / (2 * camera.zoom);
    clampCameraToWorld(camera, world, viewport);
  }
  if (recalledUnit) {
    state.lastRecall = { group: result.group, at: now };
  }
  return { handled: true, selectedUnitIds: result.selectedUnitIds, recalledUnit };
}
