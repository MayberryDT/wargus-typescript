import { issueCommandKey } from "../simulation/commandKeys";
import {
  buildingTypeForHudCommand,
  canEnterPendingWorldCommand,
  executeDirectHudCommand,
  isTargetedSpellCommand,
  issueDetonateOrder,
  issueSelectedUnits,
  pendingBuildCommandForSourceBuildType,
  selectedCanCastTargetedSpell,
  issueSourceResearchHudCommand,
  issueSourceTrainHudCommand,
  issueSourceUpgradeHudCommand,
  sourceBuildTypeForHudCommand,
  sourceInstantSpellCommandForSpellId,
  sourceSpellCommandForSpellId,
  toggleAutoCastSpellForSelection,
  toggleAutoRepairForSelection,
  type PendingWorldCommand
} from "../simulation/orders";
import type { WorldState, WorldUnit } from "../simulation/world";
import { selectedCommandRace } from "../simulation/worldSelectors";
import type { WargusManifest } from "../wargus/types";
import { hudCommandCode } from "./hudCommandKeys";
import type { HudCommandId } from "./renderHud";

export interface HudCommandExecutionResult {
  handled: boolean;
  commandPage: number;
  pendingWorldCommand: PendingWorldCommand | null;
  feedback: "acknowledge" | "click" | "error" | null;
  feedbackUnit: WorldUnit | null;
}

export function executeHudCommandForSelection(
  world: WorldState,
  manifest: WargusManifest,
  command: HudCommandId,
  selectedUnitIds: string[],
  commandPage: number,
  pendingWorldCommand: PendingWorldCommand | null,
  input: { ctrlKey?: boolean; shiftKey?: boolean } = {}
): HudCommandExecutionResult {
  const result: HudCommandExecutionResult = {
    handled: true,
    commandPage,
    pendingWorldCommand,
    feedback: null,
    feedbackUnit: null
  };
  const acknowledge = (handled: boolean): HudCommandExecutionResult => ({
    ...result,
    handled,
    feedback: handled ? "acknowledge" : "error",
    feedbackUnit: handled ? firstSelectedUnit(world, selectedUnitIds) : null
  });
  const click = (next: Partial<HudCommandExecutionResult> = {}): HudCommandExecutionResult => ({
    ...result,
    ...next,
    feedback: "click"
  });
  const error = (): HudCommandExecutionResult => ({
    ...result,
    feedback: "error"
  });

  if (command.startsWith("source-train:")) {
    return acknowledge(issueSourceTrainHudCommand(world, selectedUnitIds, command.slice("source-train:".length), manifest.units));
  }
  if (command.startsWith("source-upgrade:")) {
    return acknowledge(issueSourceUpgradeHudCommand(world, selectedUnitIds, command.slice("source-upgrade:".length), manifest.units, world.visibilityPlayer, input.shiftKey === true));
  }
  if (command.startsWith("source-research:")) {
    return acknowledge(issueSourceResearchHudCommand(world, selectedUnitIds, command.slice("source-research:".length), manifest.upgrades, world.visibilityPlayer, input.shiftKey === true));
  }
  if (command.startsWith("source-build:")) {
    const buildingTypeId = command.slice("source-build:".length);
    const sourceBuildCommand = pendingBuildCommandForSourceBuildType(world, buildingTypeId, selectedUnitIds);
    return sourceBuildCommand
      ? click({ pendingWorldCommand: sourceBuildCommand, commandPage: 0 })
      : error();
  }
  if (command.startsWith("source-spell:")) {
    const spellId = command.slice("source-spell:".length);
    if (input.ctrlKey) {
      return acknowledge(toggleAutoCastSpellForSelection(world, selectedUnitIds, spellId));
    }
    if (sourceInstantSpellCommandForSpellId(world, spellId) === "detonate") {
      return acknowledge(issueSelectedUnits(world, selectedUnitIds, (unit) => unit.canCastSpells.includes(spellId) && issueDetonateOrder(world, unit.id)));
    }
    const spellCommand = sourceSpellCommandForSpellId(world, spellId);
    return spellCommand && selectedCanCastTargetedSpell(world, selectedUnitIds, spellCommand)
      ? click({ pendingWorldCommand: { kind: "spell", command: spellCommand } })
      : error();
  }
  if (command === "build-basic-page") {
    return click({ commandPage: 1 });
  }
  if (command === "build-advanced-page") {
    return click({ commandPage: 2 });
  }
  if (command === "build-page-cancel") {
    return click({ commandPage: 0 });
  }
  if (command === "build-oil-platform" || command === "unload-transport") {
    return canEnterPendingWorldCommand(world, selectedUnitIds, command)
      ? click({ pendingWorldCommand: command })
      : error();
  }
  const sourceBuildingTypeId = sourceBuildTypeForHudCommand(world, command, selectedUnitIds);
  if (sourceBuildingTypeId) {
    return { ...result, pendingWorldCommand: { kind: "build", buildingTypeId: sourceBuildingTypeId }, commandPage: 0 };
  }
  const buildingTypeId = buildingTypeForHudCommand(world, command, selectedUnitIds);
  if (buildingTypeId) {
    return { ...result, pendingWorldCommand: { kind: "build", buildingTypeId }, commandPage: 0 };
  }
  if (isTargetedSpellCommand(command)) {
    return selectedCanCastTargetedSpell(world, selectedUnitIds, command)
      ? click({ pendingWorldCommand: { kind: "spell", command } })
      : error();
  }
  if (command === "repair" && input.ctrlKey) {
    return acknowledge(toggleAutoRepairForSelection(world, selectedUnitIds));
  }
  if (command === "harvest") {
    return canEnterPendingWorldCommand(world, selectedUnitIds, command)
      ? click({ pendingWorldCommand: command })
      : error();
  }
  const directHandled = executeDirectHudCommand(world, selectedUnitIds, command, world.visibilityPlayer, input.shiftKey === true);
  if (directHandled !== null) {
    return acknowledge(directHandled);
  }
  if (command === "move" || command === "attack-move" || command === "attack-ground" || command === "patrol" || command === "follow" || command === "repair") {
    return canEnterPendingWorldCommand(world, selectedUnitIds, command)
      ? click({ pendingWorldCommand: command })
      : error();
  }
  return acknowledge(issueCommandKey(hudCommandCode(command, selectedCommandRace(world, selectedUnitIds)), world, manifest, selectedUnitIds, { shiftKey: input.shiftKey === true }));
}

function firstSelectedUnit(world: WorldState, selectedUnitIds: string[]): WorldUnit | null {
  return selectedUnitIds.map((id) => world.units.find((candidate) => candidate.id === id)).find(Boolean) ?? null;
}
