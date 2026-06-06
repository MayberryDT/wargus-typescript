import type { WorldState } from "./world";
import type { WargusManifest } from "../wargus/types";
import {
  canReceiveMoveOrders,
  isOilPlatformBuildingType,
  issueBroadcastCommandByKey,
  issueBuildNearestOilPlatformOrder,
  issueBuildOrder,
  issueFallbackBuildCommandByKey,
  issueFallbackFacilityCommandByKey,
  issueFallbackResearchCommandByKey,
  issueFallbackTargetedSpellByKey,
  issueFallbackTrainCommandByKey,
  issueFallbackUtilityCommandByKey,
  issueSourceInstantActionByKey,
  issueSourceInstantSpellByKey,
  issueSourceResearchByKey,
  issueSourceTrainByKey,
  issueSourceUpgradeByKey,
  issueStopOrder,
  selectionHasSpecialHotkeyMeaning,
  sourceBuildTypeForKey
} from "./orders";

export function issueCommandKey(code: string, loadedWorld: WorldState, loadedManifest: WargusManifest, unitIds: string[], input: { shiftKey?: boolean } = {}): boolean {
  const queue = input.shiftKey === true;
  const broadcastHandled = issueBroadcastCommandByKey(loadedWorld, code, unitIds, loadedWorld.visibilityPlayer, queue);
  if (broadcastHandled !== null) {
    return broadcastHandled;
  }
  for (const unitId of unitIds) {
    if (issueSingleUnitCommandKey(code, loadedWorld, loadedManifest, unitId, queue)) {
      return true;
    }
  }
  return false;
}

function issueSingleUnitCommandKey(code: string, loadedWorld: WorldState, loadedManifest: WargusManifest, unitId: string, queue = false): boolean {
  const unit = loadedWorld.units.find((candidate) => candidate.id === unitId);
  if (!unit) {
    return false;
  }
  if (unit.player !== loadedWorld.visibilityPlayer) {
    return false;
  }
  if (unit.hitPoints <= 0) {
    return false;
  }
  if (unit.construction && code !== "Escape") {
    return false;
  }
  const sourceTrainHandled = issueSourceTrainByKey(loadedWorld, unit, code, loadedManifest.units);
  if (sourceTrainHandled !== null) {
    return sourceTrainHandled;
  }
  const sourceUpgradeHandled = issueSourceUpgradeByKey(loadedWorld, unit, code, loadedManifest.units, queue);
  if (sourceUpgradeHandled !== null) {
    return sourceUpgradeHandled;
  }
  const fallbackFacilityHandled = issueFallbackFacilityCommandByKey(loadedWorld, unit, code, loadedManifest.units);
  if (fallbackFacilityHandled !== null) {
    return fallbackFacilityHandled;
  }
  if (code === "KeyS" && !selectionHasSpecialHotkeyMeaning(loadedWorld, [unitId], code) && canReceiveMoveOrders(unit)) {
    return issueStopOrder(loadedWorld, unitId);
  }
  const sourceResearchHandled = issueSourceResearchByKey(loadedWorld, unit, code, loadedManifest.upgrades, queue);
  if (sourceResearchHandled !== null) {
    return sourceResearchHandled;
  }
  const earlyFallbackTrainHandled = issueFallbackTrainCommandByKey(loadedWorld, unit, code, loadedManifest.units);
  if (earlyFallbackTrainHandled !== null) {
    return earlyFallbackTrainHandled;
  }
  const sourceInstantSpellHandled = issueSourceInstantSpellByKey(loadedWorld, unit, code);
  if (sourceInstantSpellHandled !== null) {
    return sourceInstantSpellHandled;
  }
  const sourceInstantActionHandled = issueSourceInstantActionByKey(loadedWorld, unit, code, queue);
  if (sourceInstantActionHandled !== null) {
    return sourceInstantActionHandled;
  }
  const fallbackUtilityHandled = issueFallbackUtilityCommandByKey(loadedWorld, unit, code, loadedManifest.units, "early", queue);
  if (fallbackUtilityHandled !== null) {
    return fallbackUtilityHandled;
  }
  const midFallbackTrainHandled = issueFallbackTrainCommandByKey(loadedWorld, unit, code, loadedManifest.units, "mid");
  if (midFallbackTrainHandled !== null) {
    return midFallbackTrainHandled;
  }
  const fallbackResearchHandled = issueFallbackResearchCommandByKey(loadedWorld, unit, code, loadedManifest.upgrades, queue);
  if (fallbackResearchHandled !== null) {
    return fallbackResearchHandled;
  }
  const lateFallbackTrainHandled = issueFallbackTrainCommandByKey(loadedWorld, unit, code, loadedManifest.units, "late");
  if (lateFallbackTrainHandled !== null) {
    return lateFallbackTrainHandled;
  }
  const fallbackSpellHandled = issueFallbackTargetedSpellByKey(loadedWorld, unit, code, queue);
  if (fallbackSpellHandled !== null) {
    return fallbackSpellHandled;
  }
  const lateFallbackUtilityHandled = issueFallbackUtilityCommandByKey(loadedWorld, unit, code, loadedManifest.units, "late", queue);
  if (lateFallbackUtilityHandled !== null) {
    return lateFallbackUtilityHandled;
  }
  const sourceBuildType = sourceBuildTypeForKey(loadedWorld, unit, code);
  if (sourceBuildType) {
    return isOilPlatformBuildingType(loadedWorld, sourceBuildType)
      ? issueBuildNearestOilPlatformOrder(loadedWorld, unitId, loadedManifest.units)
      : issueBuildOrder(loadedWorld, unitId, sourceBuildType, loadedManifest.units);
  }
  const fallbackBuildHandled = issueFallbackBuildCommandByKey(loadedWorld, unit, code, loadedManifest.units);
  if (fallbackBuildHandled !== null) {
    return fallbackBuildHandled;
  }
  return false;
}
