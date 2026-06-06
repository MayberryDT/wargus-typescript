import { issueCommandKey } from "../simulation/commandKeys";
import {
  buildingTypeForWorkerHotkey,
  canEnterPendingWorldCommand,
  canIssueReturnGoodsOrder,
  canOpenWorkerBuildPage,
  hasSourceBuildButtonsForTypes,
  issueQueueReturnGoodsOrder,
  issueReturnGoodsOrder,
  issueSelectedUnits,
  pendingBuildCommandForSourceBuildType,
  sourceBuildPageForKey,
  sourcePendingWorldCommandForKey,
  targetedSpellCommandForKey,
  type PendingWorldCommand
} from "../simulation/orders";
import type { WorldState, WorldUnit } from "../simulation/world";
import type { WargusManifest } from "../wargus/types";

export interface SelectionHotkeyResult {
  handled: boolean;
  commandPage: number;
  pendingWorldCommand: PendingWorldCommand | null;
  feedback: "acknowledge" | "click" | "error" | null;
  feedbackUnit: WorldUnit | null;
}

export function executeSelectionHotkey(
  world: WorldState,
  manifest: WargusManifest,
  code: string,
  selectedUnitIds: string[],
  commandPage: number,
  pendingWorldCommand: PendingWorldCommand | null,
  input: { shiftKey?: boolean } = {}
): SelectionHotkeyResult {
  const result: SelectionHotkeyResult = {
    handled: false,
    commandPage,
    pendingWorldCommand,
    feedback: null,
    feedbackUnit: null
  };
  if (selectedUnitIds.length === 0) {
    return result;
  }
  const click = (next: Partial<SelectionHotkeyResult> = {}): SelectionHotkeyResult => ({
    ...result,
    ...next,
    handled: true,
    feedback: "click"
  });
  const acknowledge = (handled: boolean): SelectionHotkeyResult => ({
    ...result,
    handled: true,
    feedback: handled ? "acknowledge" : "error",
    feedbackUnit: handled ? firstSelectedUnit(world, selectedUnitIds) : null
  });

  if (code === "Escape" && commandPage !== 0) {
    return click({ commandPage: 0, pendingWorldCommand: null });
  }

  const buildingTypeId = buildingTypeForWorkerHotkey(world, code, selectedUnitIds, commandPage);
  if (buildingTypeId) {
    const sourceBuildCommand = pendingBuildCommandForSourceBuildType(world, buildingTypeId, selectedUnitIds);
    return sourceBuildCommand
      ? click({ pendingWorldCommand: sourceBuildCommand, commandPage: 0 })
      : click({ pendingWorldCommand: { kind: "build", buildingTypeId }, commandPage: 0 });
  }
  const sourceBuildPage = sourceBuildPageForKey(world, code, selectedUnitIds);
  if (sourceBuildPage !== null) {
    return click({ commandPage: sourceBuildPage });
  }
  if (code === "KeyB" && canOpenWorkerBuildPage(world, selectedUnitIds, 1)) {
    return click({ commandPage: 1 });
  }
  if (code === "KeyV" && canOpenWorkerBuildPage(world, selectedUnitIds, 2)) {
    return click({ commandPage: 2 });
  }
  if (code === "KeyU" && canEnterPendingWorldCommand(world, selectedUnitIds, "unload-transport")) {
    return click({ pendingWorldCommand: "unload-transport" });
  }
  if (code === "KeyU" && !selectionHasSourceBuildButtons(world, selectedUnitIds) && canEnterPendingWorldCommand(world, selectedUnitIds, "build-oil-platform")) {
    return click({ pendingWorldCommand: "build-oil-platform" });
  }
  if (code === "KeyG" && selectedUnitIds.some((id) => {
    const unit = world.units.find((candidate) => candidate.id === id);
    return Boolean(unit && unit.player === world.visibilityPlayer && canIssueReturnGoodsOrder(world, unit));
  })) {
    return acknowledge(issueSelectedUnits(world, selectedUnitIds, (unit) => (
      input.shiftKey === true
        ? issueQueueReturnGoodsOrder(world, unit.id)
        : issueReturnGoodsOrder(world, unit.id)
    )));
  }

  const spellCommand = targetedSpellCommandForKey(world, code, selectedUnitIds);
  if (spellCommand) {
    return click({ pendingWorldCommand: { kind: "spell", command: spellCommand } });
  }

  const sourcePendingCommand = sourcePendingWorldCommandForKey(world, code, selectedUnitIds);
  if (sourcePendingCommand && canEnterPendingWorldCommand(world, selectedUnitIds, sourcePendingCommand)) {
    return click({ pendingWorldCommand: sourcePendingCommand });
  }

  if (issueCommandKey(code, world, manifest, selectedUnitIds, { shiftKey: input.shiftKey === true })) {
    return acknowledge(true);
  }

  if (code === "KeyA" && canEnterPendingWorldCommand(world, selectedUnitIds, "attack-move")) {
    return click({ pendingWorldCommand: "attack-move", feedback: null });
  }
  if (code === "KeyP" && canEnterPendingWorldCommand(world, selectedUnitIds, "patrol")) {
    return click({ pendingWorldCommand: "patrol", feedback: null });
  }
  if (code === "KeyF" && canEnterPendingWorldCommand(world, selectedUnitIds, "follow")) {
    return click({ pendingWorldCommand: "follow", feedback: null });
  }
  if (code === "KeyG" && canEnterPendingWorldCommand(world, selectedUnitIds, "attack-ground")) {
    return click({ pendingWorldCommand: "attack-ground", feedback: null });
  }
  if (code === "KeyR" && canEnterPendingWorldCommand(world, selectedUnitIds, "repair")) {
    return click({ pendingWorldCommand: "repair", feedback: null });
  }
  return result;
}

function firstSelectedUnit(world: WorldState, selectedUnitIds: string[]): WorldUnit | null {
  return selectedUnitIds.map((id) => world.units.find((candidate) => candidate.id === id)).find(Boolean) ?? null;
}

function selectionHasSourceBuildButtons(world: WorldState, selectedUnitIds: string[]): boolean {
  const selectedTypeIds = selectedUnitIds
    .map((id) => world.units.find((candidate) => candidate.id === id))
    .filter((unit): unit is WorldUnit => Boolean(unit && unit.player === world.visibilityPlayer && unit.hitPoints > 0 && !unit.construction))
    .map((unit) => unit.typeId);
  return hasSourceBuildButtonsForTypes(world, selectedTypeIds, world.visibilityPlayer);
}
