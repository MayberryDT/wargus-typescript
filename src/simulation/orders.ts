import type { WargusAllowRule, WargusButton, WargusMissile, WargusSpell, WargusUnit, WargusUpgrade } from "../wargus/types";
import { sourceButtonAppliesTo, sourceButtonLabel } from "../wargus/buttons";
import { isExploreOnReadyValue } from "../wargus/sourceActions";
import { sourceRaceScoreForUnitDefinition, sourceUnitDefinitionText } from "../wargus/sourceRace";
import { boxDimensionsForUnit, createWorldUnit, defaultForestTileResources, getPlayerSupply, imageForTileset, isCircleVisibleToPlayer, isInvisibleUtilityUnit, isSourceBuildingDefinition, isSourceResourcePatchDefinition, isSourceResourceSiteDefinition, isUnitHiddenInConstruction, isUnitInsideResourceSource, isUnitVisibleToPlayer, maxSelectableForEngine, normalizeImproveProduction, normalizePositiveResourceMap, normalizeResourceCapacity, normalizeRgbColor, productionQueueLimitForEngine, recordPlayerUnitCreated, resourceCapacityForUnit, resourceStepForUnit, resourceWaitAtDepotCyclesForUnit, resourceWaitAtResourceCyclesForUnit, revealAreaToPlayer, sightRangeForUnit, sourceBuildDurationSecondsForPlayer, sourceDecayRateLifetimeSeconds, sourceDefaultGameSpeed, sourceResearchDurationSecondsForPlayer, sourceResourceHarvestDurationSecondsForPlayer, sourceResourceReturnDurationSecondsForPlayer, sourceTrainDurationSecondsForPlayer, sourceUpgradeDurationSecondsForPlayer, speedForUnit, unitFootprintHalfSize, updateVisibility, worldKindForUnitDefinition, type WorldAiState, type WorldEvent, type WorldProjectile, type WorldState, type WorldUnit } from "./world";
import { findPath } from "./pathfinding";
import { isSourceBuildableTerrainTile, isSourceHarvestableWoodTile, isSourceWaterTile, isTilePassable, movementKindForUnit, tileToWorldCenter, worldToTile } from "./passability";

export { sourceDefaultGameSpeed } from "./world";

const MISSILE_SPEED_TO_PIXELS_PER_SECOND = 16;
const FALLBACK_RAISED_SKELETON_LIFETIME_SECONDS = 40;

export type PendingWorldCommandName = "move" | "attack-move" | "attack-ground" | "patrol" | "follow" | "repair" | "harvest" | "unload-transport" | "build-oil-platform";
export type PendingWorldCommand = PendingWorldCommandName | { kind: "build"; buildingTypeId: string } | { kind: "spell"; command: TargetedSpellCommand };

export function compareSourceButtons(a: WargusButton, b: WargusButton): number {
  return a.level - b.level || a.pos - b.pos || (b.value ? 1 : 0) - (a.value ? 1 : 0);
}

export function sourceButtonAppliesToAnyType(button: WargusButton, typeIds: Iterable<string>): boolean {
  for (const typeId of typeIds) {
    if (sourceButtonAppliesTo(button, typeId)) {
      return true;
    }
  }
  return false;
}

export function sourceGroupButtonScopeForSelection(world: WorldState, units: WorldUnit[], playerId = world.visibilityPlayer): string | null {
  if (units.length <= 1 || new Set(units.map((unit) => unit.typeId)).size <= 1) {
    return null;
  }
  const race = world.players.find((player) => player.id === playerId)?.race === "orc" ? "orc" : "human";
  return `${race}-group`;
}

export function clampSelectionToSourceLimit(world: WorldState, unitIds: string[]): string[] {
  return unitIds.slice(0, maxSelectableForEngine(world.engineSettings));
}

export function isSelectionStillValid(world: WorldState, unitId: string, playerId = world.visibilityPlayer): boolean {
  const unit = world.units.find((candidate) => candidate.id === unitId);
  if (!unit || unit.hitPoints <= 0 || isUnitHiddenInConstruction(unit) || isInvisibleUtilityUnit(unit)) {
    return false;
  }
  return unit.player === playerId || isUnitVisibleToPlayer(world, unit, playerId);
}

export function findSelectableUnitAt(world: WorldState, x: number, y: number, playerId = world.visibilityPlayer): WorldUnit | null {
  const hits = world.units.filter((unit) => {
    if (unit.hitPoints <= 0 || isUnitHiddenInConstruction(unit) || isInvisibleUtilityUnit(unit) || isUnitInsideResourceSource(unit) || !isUnitVisibleToPlayer(world, unit, playerId)) {
      return false;
    }
    const { halfWidth, halfHeight } = unitFootprintHalfSize(unit, world.tileSize);
    return x >= unit.x - halfWidth && x <= unit.x + halfWidth && y >= unit.y - halfHeight && y <= unit.y + halfHeight;
  });
  hits.sort((a, b) => a.radius - b.radius);
  return hits[0] ?? null;
}

export function selectUnitsInRect(world: WorldState, startX: number, startY: number, endX: number, endY: number, playerId = world.visibilityPlayer): string[] {
  const left = Math.min(startX, endX);
  const right = Math.max(startX, endX);
  const top = Math.min(startY, endY);
  const bottom = Math.max(startY, endY);
  const playerUnits = world.units.filter((unit) => (
    unit.player === playerId
    && canReceiveMoveOrders(unit)
    && !isUnitHiddenInConstruction(unit)
    && !isUnitInsideResourceSource(unit)
    && isUnitVisibleToPlayer(world, unit, playerId)
    && unit.selectableByRectangle
    && unit.x >= left
    && unit.x <= right
    && unit.y >= top
    && unit.y <= bottom
  ));
  if (playerUnits.length > 0) {
    return clampSelectionToSourceLimit(world, playerUnits.map((unit) => unit.id));
  }
  const visibleUnits = world.units
    .filter((unit) => unit.hitPoints > 0
      && unit.selectableByRectangle
      && !isUnitHiddenInConstruction(unit)
      && !isUnitInsideResourceSource(unit)
      && isUnitVisibleToPlayer(world, unit, playerId)
      && unit.x >= left
      && unit.x <= right
      && unit.y >= top
      && unit.y <= bottom)
    .map((unit) => unit.id);
  return clampSelectionToSourceLimit(world, visibleUnits);
}

export function mergeSelection(world: WorldState, currentIds: string[], addedIds: string[]): string[] {
  return clampSelectionToSourceLimit(world, [...new Set([...currentIds, ...addedIds])]);
}

export function toggleSelection(world: WorldState, currentIds: string[], unitId: string | null): string[] {
  if (!unitId) {
    return currentIds;
  }
  return currentIds.includes(unitId)
    ? currentIds.filter((id) => id !== unitId)
    : sourceCanToggleUnitIntoSelection(world, currentIds, unitId)
      ? clampSelectionToSourceLimit(world, [...currentIds, unitId])
      : currentIds;
}

export function sourceCanToggleUnitIntoSelection(world: WorldState, currentIds: string[], unitId: string): boolean {
  const unit = world.units.find((candidate) => candidate.id === unitId);
  const firstSelected = currentIds
    .map((id) => world.units.find((candidate) => candidate.id === id))
    .find((candidate): candidate is WorldUnit => Boolean(candidate));
  if (!unit || !firstSelected) {
    return Boolean(unit);
  }
  if (isBuildingLike(firstSelected)) {
    return isBuildingLike(unit) && unit.typeId === firstSelected.typeId;
  }
  return !isBuildingLike(unit);
}

export type ControlGroups = Record<number, string[]>;
export interface ControlGroupInput extends Pick<KeyboardEvent, "code" | "key" | "ctrlKey" | "metaKey" | "shiftKey"> {
  altKey?: boolean;
}
export type ControlGroupInputResult = {
  handled: boolean;
  group: number | null;
  selectedUnitIds: string[];
  recalledUnitId: string | null;
};

export function applyControlGroupInput(world: WorldState, controlGroups: ControlGroups, selectedUnitIds: string[], input: ControlGroupInput): ControlGroupInputResult {
  const group = sourceControlGroupForInput(world, input);
  if (group === null) {
    return { handled: false, group: null, selectedUnitIds, recalledUnitId: null };
  }
  const assignableIds = selectedUnitIds
    .filter((id) => world.units.some((unit) => unit.id === id && unit.player === world.visibilityPlayer));
  if (input.ctrlKey || input.metaKey) {
    controlGroups[group] = clampSelectionToSourceLimit(world, assignableIds);
    return { handled: controlGroups[group].length > 0, group, selectedUnitIds, recalledUnitId: null };
  }
  if (input.shiftKey && assignableIds.length > 0) {
    controlGroups[group] = mergeSelection(world, controlGroups[group] ?? [], assignableIds)
      .filter((id) => world.units.some((unit) => unit.id === id && unit.player === world.visibilityPlayer));
    return { handled: controlGroups[group].length > 0, group, selectedUnitIds, recalledUnitId: null };
  }
  const liveIds = (controlGroups[group] ?? []).filter((id) => unitIdExistsIncludingCargo(world, id));
  controlGroups[group] = liveIds;
  if (liveIds.length === 0) {
    return { handled: false, group, selectedUnitIds, recalledUnitId: null };
  }
  const resolvedSelection = sourceControlGroupSelectionIds(world, liveIds, input.altKey);
  if (resolvedSelection.length === 0) {
    return { handled: false, group, selectedUnitIds, recalledUnitId: null };
  }
  return { handled: true, group, selectedUnitIds: resolvedSelection, recalledUnitId: resolvedSelection[0] ?? null };
}

export function sourceControlGroupForInput(world: WorldState, input: Pick<KeyboardEvent, "code" | "key">): number | null {
  const key = sourceControlGroupKeyForInput(input);
  if (!key) {
    return null;
  }
  const sourceKeys = world.engineSettings.groupKeysDefault || "0123456789";
  const group = sourceKeys.indexOf(key);
  return group >= 0 ? group : null;
}

export function sourceControlGroupKeyForInput(input: Pick<KeyboardEvent, "code" | "key">): string | null {
  const digitMatch = /^Digit([0-9])$/.exec(input.code);
  if (digitMatch) {
    return digitMatch[1];
  }
  if (input.code === "Backquote") {
    return "`";
  }
  return input.key.length === 1 ? input.key : null;
}

export function pruneControlGroups(world: WorldState, controlGroups: ControlGroups): void {
  for (const [group, ids] of Object.entries(controlGroups)) {
    const liveIds = ids.filter((id) => unitIdExistsIncludingCargo(world, id));
    if (liveIds.length > 0) {
      controlGroups[Number(group)] = liveIds;
    } else {
      delete controlGroups[Number(group)];
    }
  }
}

export function unitIdExistsIncludingCargo(world: WorldState, unitId: string): boolean {
  return world.units.some((unit) => unit.hitPoints > 0 && unitIdExistsInUnitOrCargo(unit, unitId));
}

export function unitIdExistsInUnitOrCargo(unit: WorldUnit, unitId: string): boolean {
  if (unit.hitPoints <= 0) {
    return false;
  }
  if (unit.id === unitId) {
    return true;
  }
  return unit.cargo.some((cargoUnit) => unitIdExistsInUnitOrCargo(cargoUnit, unitId));
}

export function resolveControlGroupSelection(world: WorldState, unitIds: string[]): string[] {
  const resolved: string[] = [];
  for (const unitId of unitIds) {
    const liveUnit = world.units.find((unit) => unit.id === unitId);
    if (liveUnit) {
      resolved.push(liveUnit.id);
      continue;
    }
    const carrier = world.units.find((unit) => unit.hitPoints > 0 && unit.cargo.some((cargoUnit) => unitIdExistsInUnitOrCargo(cargoUnit, unitId)));
    if (carrier) {
      resolved.push(carrier.id);
    }
  }
  return clampSelectionToSourceLimit(world, [...new Set(resolved)]);
}

export function isControlGroupTainted(world: WorldState, unitIds: string[]): boolean {
  return resolveControlGroupUnits(world, unitIds).some((unit) => unit.selectableByRectangle !== true);
}

export function sourceControlGroupSelectionIds(world: WorldState, unitIds: string[], selectAll = false): string[] {
  const resolvedUnits = resolveControlGroupUnits(world, unitIds);
  const selectableUnits = selectAll || !isControlGroupTainted(world, unitIds)
    ? resolvedUnits
    : resolvedUnits.filter((unit) => unit.selectableByRectangle === true);
  return clampSelectionToSourceLimit(world, [...new Set(selectableUnits.map((unit) => unit.id))]);
}

export function sourceControlGroupNumberForUnit(unitId: string, controlGroups: ControlGroups): number | null {
  const group = Object.entries(controlGroups)
    .map(([key, ids]) => ({ group: Number(key), ids }))
    .filter(({ group, ids }) => Number.isInteger(group) && group >= 0 && ids.includes(unitId))
    .sort((left, right) => left.group - right.group)[0]?.group;
  return typeof group === "number" ? group : null;
}

function resolveControlGroupUnits(world: WorldState, unitIds: string[]): WorldUnit[] {
  const resolved: WorldUnit[] = [];
  for (const unitId of unitIds) {
    const liveUnit = world.units.find((unit) => unit.id === unitId);
    if (liveUnit) {
      resolved.push(liveUnit);
      continue;
    }
    const carrier = world.units.find((unit) => unit.hitPoints > 0 && unit.cargo.some((cargoUnit) => unitIdExistsInUnitOrCargo(cargoUnit, unitId)));
    if (carrier) {
      resolved.push(carrier);
    }
  }
  return [...new Map(resolved.map((unit) => [unit.id, unit])).values()];
}

export function replaceControlGroups(world: WorldState | null, controlGroups: ControlGroups, nextGroups: ControlGroups): void {
  for (const group of Object.keys(controlGroups)) {
    delete controlGroups[Number(group)];
  }
  for (const [group, ids] of Object.entries(nextGroups)) {
    controlGroups[Number(group)] = world ? clampSelectionToSourceLimit(world, ids) : ids;
  }
}

export type SourceCheatResult = {
  handled: boolean;
  message?: string;
  sourceSpeedCheat?: boolean;
  musicFile?: string;
};

export function applySourceCheat(world: WorldState, cheat: string, sourceSpeedCheat = false): SourceCheatResult {
  const player = world.players.find((candidate) => candidate.id === world.visibilityPlayer);
  if (!player) {
    return { handled: false };
  }
  if (cheat === "glittering prizes") {
    addPlayerResource(world, player, "gold", 12000);
    addPlayerResource(world, player, "wood", 5000);
    addPlayerResource(world, player, "oil", 5000);
    return { handled: true, message: "!!! :)" };
  }
  if (cheat === "on screen") {
    world.engineSettings.fogOfWarEnabled = false;
    world.engineSettings.revealMapMode = "explored";
    world.exploredTiles.fill(1);
    world.visibleTiles.fill(1);
    return { handled: true, message: "enabled cheat" };
  }
  if (cheat === "showpath") {
    world.engineSettings.revealMapMode = "known";
    return { handled: true, message: "enabled cheat" };
  }
  if (cheat === "fow on") {
    world.engineSettings.fogOfWarEnabled = true;
    return { handled: true, message: "enabled cheat" };
  }
  if (cheat === "fow off") {
    world.engineSettings.fogOfWarEnabled = false;
    return { handled: true, message: "enabled cheat" };
  }
  if (cheat === "make it so") {
    const enabled = !sourceSpeedCheat;
    applySourceSpeedCheat(world, enabled);
    if (enabled) {
      for (const resource of ["gold", "wood", "oil"]) {
        addPlayerResource(world, player, resource, 32000);
      }
    }
    return { handled: true, message: enabled ? "SO!" : "NO SO!", sourceSpeedCheat: enabled };
  }
  if (cheat === "hatchet") {
    world.engineSettings.speedFactors.resourceHarvest.wood = 2600;
    for (const player of world.players) {
      player.speedFactors.resourceHarvest.wood = 2600;
    }
    return { handled: true, message: "Wow -- I got jigsaw!" };
  }
  if (cheat === "disco") {
    return { handled: true, message: "enabled cheat", musicFile: "music/I'm a Medieval Man.mid" };
  }
  if (cheat === "it is a good day to die") {
    const godModePlayers = new Set(world.godModePlayers ?? []);
    let message = "God Mode ON";
    if (godModePlayers.has(world.visibilityPlayer)) {
      godModePlayers.delete(world.visibilityPlayer);
      message = "God Mode OFF";
    } else {
      godModePlayers.add(world.visibilityPlayer);
    }
    world.godModePlayers = [...godModePlayers].sort((a, b) => a - b);
    return { handled: true, message };
  }
  if (cheat === "unite the clans" || cheat === "monkey sweats on a tuesday") {
    world.matchState = { status: "victory", winner: world.visibilityPlayer, endedTick: world.tick };
    return { handled: true, message: "enabled cheat" };
  }
  if (cheat === "you pitiful worm") {
    world.matchState = { status: "defeat", winner: null, endedTick: world.tick };
    return { handled: true, message: "enabled cheat" };
  }
  if (cheat === "fill mana") {
    for (const unit of world.units) {
      if (unit.manaEnabled) {
        unit.mana = unit.maxMana;
      }
    }
    return { handled: true, message: "enabled cheat" };
  }
  return { handled: false };
}

export function applySourceSpeedCheat(world: WorldState, enabled: boolean): void {
  const speed = enabled ? 1000 : 100;
  world.engineSettings.speedFactors.build = speed;
  world.engineSettings.speedFactors.train = speed;
  world.engineSettings.speedFactors.upgrade = speed;
  world.engineSettings.speedFactors.research = speed;
  for (const resource of ["gold", "wood", "oil"]) {
    world.engineSettings.speedFactors.resourceHarvest[resource] = speed;
    world.engineSettings.speedFactors.resourceReturn[resource] = speed;
  }
  for (const player of world.players) {
    player.speedFactors.build = speed;
    player.speedFactors.train = speed;
    player.speedFactors.upgrade = speed;
    player.speedFactors.research = speed;
    for (const resource of ["gold", "wood", "oil"]) {
      player.speedFactors.resourceHarvest[resource] = speed;
      player.speedFactors.resourceReturn[resource] = speed;
    }
  }
}

export function sourceDoubleClickDelayMs(world: WorldState): number {
  if (world.engineSettings.doubleClickDelayMsDefault <= 0) {
    return 0;
  }
  return Math.max(120, Math.min(1000, world.engineSettings.doubleClickDelayMsDefault || 300));
}

export function sourceGameSpeedLabel(speed: number, world: WorldState | null): string {
  const tickRate = sourceDefaultGameSpeedOrFallback(world);
  const fastForward = world ? sourceFastForwardMultiplier(world) : 1;
  const label = `${Math.round(speed * tickRate * fastForward)} source ticks/sec`;
  return fastForward > 1 ? `${label} (fast-forward x${formatSpeedMultiplier(fastForward)})` : label;
}

export function previousGameSpeed(speed: number, world: WorldState | null): number {
  const speeds = sourceGameSpeedMultipliers(world);
  return speeds[Math.max(0, speeds.findIndex((candidate) => candidate >= speed) - 1)] ?? speeds[0];
}

export function nextGameSpeed(speed: number, world: WorldState | null): number {
  const speeds = sourceGameSpeedMultipliers(world);
  const current = speeds.findIndex((candidate) => candidate > speed);
  return current === -1 ? speeds[speeds.length - 1] : speeds[current];
}

export function sourceGameSpeedMultiplier(world: WorldState): number {
  const sourceGameSpeed = Math.max(1, world.engineSettings.sourceGameSpeedDefault || sourceDefaultGameSpeed(world));
  return Math.max(0.25, Math.min(8, sourceGameSpeed / sourceDefaultGameSpeed(world)));
}

export function sourceGameSpeedFromMultiplier(world: WorldState, speed: number): number {
  const tickRate = sourceDefaultGameSpeed(world);
  const sourceSpeed = Math.round(speed * tickRate);
  return Math.max(15, Math.min(75, sourceSpeed));
}

function sourceDefaultGameSpeedOrFallback(world: WorldState | null): number {
  return world ? sourceDefaultGameSpeed(world) : 30;
}

export function sourceRuntimeGameSpeedMultiplier(world: WorldState, selectedSpeed: number): number {
  return Math.max(0.25, Math.min(16, selectedSpeed * sourceFastForwardMultiplier(world)));
}

export function sourceFastForwardMultiplier(world: WorldState): number {
  const cycle = Math.max(0, Math.floor(world.engineSettings.fastForwardCycleDefault || 0));
  if (cycle <= 0) {
    return 1;
  }
  const sourceGameSpeed = Math.max(1, world.engineSettings.sourceGameSpeedDefault || sourceDefaultGameSpeed(world));
  return Math.max(1, Math.min(16, cycle / sourceGameSpeed));
}

function formatSpeedMultiplier(multiplier: number): string {
  return Number.isInteger(multiplier) ? String(multiplier) : multiplier.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function sourceGameSpeedMultipliers(world: WorldState | null): number[] {
  const tickRate = sourceDefaultGameSpeedOrFallback(world);
  const sourceSpeeds = [];
  for (let sourceSpeed = 15; sourceSpeed <= 75; sourceSpeed += 5) {
    sourceSpeeds.push(Number((sourceSpeed / tickRate).toFixed(4)));
  }
  return sourceSpeeds;
}

export function findNextIdleWorker(world: WorldState, selectedUnitIds: string[], playerId = world.visibilityPlayer): WorldUnit | null {
  const idleWorkers = world.units
    .filter((unit) => isIdleWorkerForPlayer(world, unit, playerId))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (idleWorkers.length === 0) {
    return null;
  }
  const selectedIndex = idleWorkers.findIndex((unit) => selectedUnitIds.includes(unit.id));
  return idleWorkers[(selectedIndex + 1) % idleWorkers.length] ?? null;
}

export function isIdleWorkerForPlayer(world: WorldState, unit: WorldUnit, playerId = world.visibilityPlayer): boolean {
  return unit.player === playerId
    && unit.hitPoints > 0
    && !unit.construction
    && isGoldOrWoodWorkerUnit(unit)
    && !unit.order
    && unit.resourcesHeld <= 0;
}

export function isGoldOrWoodWorkerUnit(unit: Pick<WorldUnit, "gatherResources">): boolean {
  return unit.gatherResources.includes("gold") || unit.gatherResources.includes("wood");
}

export function issueBroadcastCommandByKey(world: WorldState, code: string, unitIds: string[], playerId = world.visibilityPlayer, queue = false): boolean | null {
  const sourceCancelHandled = issueSourceCancelByKey(world, code, unitIds);
  if (sourceCancelHandled !== null) {
    return sourceCancelHandled;
  }
  if (code === "Escape") {
    return issueSelectedUnits(world, unitIds, (unit) => issueCancelConstructionOrder(world, unit.id) || issueCancelProductionOrder(world, unit.id) || issueCancelResearchOrder(world, unit.id), { includeConstruction: true });
  }
  if (code === "KeyS" && !selectionHasSpecialHotkeyMeaning(world, unitIds, code, playerId) && unitIds.some((id) => {
    const unit = findUnit(world, id);
    return Boolean(unit && unit.player === playerId && canIssueStop(unit));
  })) {
    return issueSelectedUnits(world, unitIds, (unit) => canIssueStop(unit) && issueStopOrder(world, unit.id));
  }
  if (code === "KeyH" && !selectionHasSpecialHotkeyMeaning(world, unitIds, code, playerId) && unitIds.some((id) => {
    const unit = findUnit(world, id);
    return Boolean(unit && unit.player === playerId && canIssueHoldPosition(unit));
  })) {
    return issueSelectedUnits(world, unitIds, (unit) => canIssueHoldPosition(unit) && (queue ? issueQueueStandGroundOrder(world, unit.id) : issueHoldPositionOrder(world, unit.id)));
  }
  return null;
}

export function selectionHasSpecialHotkeyMeaning(world: WorldState, unitIds: string[], code: string, playerId = world.visibilityPlayer): boolean {
  const key = keyNameFromCode(code);
  if (!key) {
    return false;
  }
  return unitIds.some((id) => {
    const unit = findUnit(world, id);
    if (!unit || unit.player !== playerId) {
      return false;
    }
    return world.buttonDefinitions.some((button) => (
      button.key?.toUpperCase() === key
      && sourceButtonAppliesTo(button, unit.typeId)
      && button.action !== defaultBroadcastActionForKey(code)
      && sourceButtonAllowedForSimulation(world, button, unit.player)
    ));
  });
}

export function defaultBroadcastActionForKey(code: string): string | null {
  if (code === "KeyS") {
    return "stop";
  }
  if (code === "KeyH") {
    return "stand-ground";
  }
  return null;
}

export function selectionAfterWorldEvent(world: WorldState, selectedUnitIds: string[], event: WorldEvent, playerId = world.visibilityPlayer): string[] {
  if (event.kind === "unit-entered-resource") {
    return event.player === playerId && selectedUnitIds.includes(event.unitId)
      ? selectedUnitIds.filter((id) => id !== event.unitId)
      : selectedUnitIds;
  }
  if (event.kind === "unit-loaded") {
    return event.player === playerId && selectedUnitIds.includes(event.unitId)
      ? [event.transportId]
      : selectedUnitIds;
  }
  if (event.kind === "units-unloaded") {
    return event.player === playerId && selectedUnitIds.includes(event.transportId)
      ? event.unitIds.filter((id) => world.units.some((unit) => unit.id === id))
      : selectedUnitIds;
  }
  return selectedUnitIds;
}

export function selectVisibleUnitsOfType(world: WorldState, baseUnitId: string, bounds: { left: number; right: number; top: number; bottom: number }, fallbackUnitIds: string[], additive = false, playerId = world.visibilityPlayer): string[] {
  const base = world.units.find((unit) => unit.id === baseUnitId);
  if (!base
    || base.player !== playerId
    || base.hitPoints <= 0
    || isUnitHiddenInConstruction(base)
    || isInvisibleUtilityUnit(base)
    || isUnitInsideResourceSource(base)
    || !isUnitVisibleToPlayer(world, base, playerId)) {
    return fallbackUnitIds;
  }
  if (!base.selectableByRectangle) {
    return additive ? fallbackUnitIds : [base.id];
  }
  if (additive && (fallbackUnitIds.includes(base.id) || !sourceCanToggleUnitIntoSelection(world, fallbackUnitIds, base.id))) {
    return fallbackUnitIds;
  }
  const sameType = [base.id];
  for (const unit of world.units) {
    if (unit.id === base.id
      || unit.player !== playerId
      || unit.typeId !== base.typeId
      || unit.hitPoints <= 0
      || !unit.selectableByRectangle
      || isUnitHiddenInConstruction(unit)
      || isInvisibleUtilityUnit(unit)
      || isUnitInsideResourceSource(unit)
      || !isUnitVisibleToPlayer(world, unit, playerId)
      || unit.x < bounds.left
      || unit.x > bounds.right
      || unit.y < bounds.top
      || unit.y > bounds.bottom
      || !sourceCanToggleUnitIntoSelection(world, additive ? [...fallbackUnitIds, ...sameType] : sameType, unit.id)) {
      continue;
    }
    sameType.push(unit.id);
    if (sameType.length >= maxSelectableForEngine(world.engineSettings)) {
      break;
    }
  }
  return additive ? mergeSelection(world, fallbackUnitIds, sameType) : clampSelectionToSourceLimit(world, sameType);
}

export function issuePendingWorldCommandAt(world: WorldState, unitIds: string[], command: PendingWorldCommand, x: number, y: number, queue = false): boolean {
  if (unitIds.length === 0) {
    return false;
  }
  const issueWithClickFeedback = (issued: boolean): boolean => {
    if (issued) {
      addClickMissileEffect(world, x, y, commandFeedbackPlayer(world, unitIds));
    }
    return issued;
  };
  if (typeof command === "object") {
    if (command.kind === "build") {
      return issueWithClickFeedback(queue
        ? issueGroupQueueBuildAtOrder(world, unitIds, command.buildingTypeId, x, y)
        : issueGroupBuildAtOrder(world, unitIds, command.buildingTypeId, x, y));
    }
    return issueWithClickFeedback(queue
      ? issueGroupQueueTargetedSpellOrder(world, unitIds, command.command, x, y)
      : issueGroupTargetedSpellOrder(world, unitIds, command.command, x, y));
  }
  if (command === "move") {
    const rallyIssued = issueGroupRallyPointOrder(world, unitIds, x, y);
    if (rallyIssued) {
      return issueWithClickFeedback(true);
    }
    return issueWithClickFeedback(queue
      ? issueGroupQueueMoveOrder(world, unitIds, x, y)
      : issueGroupMoveOrder(world, unitIds, x, y));
  }
  if (command === "attack-move") {
    const rallyIssued = issueGroupRallyPointOrder(world, unitIds, x, y);
    if (rallyIssued) {
      return issueWithClickFeedback(true);
    }
    const targetIssued = !queue && issueGroupAttackTargetAtOrder(world, unitIds, x, y);
    if (targetIssued) {
      return issueWithClickFeedback(true);
    }
    return issueWithClickFeedback(queue
      ? issueGroupQueueAttackMoveOrder(world, unitIds, x, y)
      : issueGroupAttackMoveOrder(world, unitIds, x, y));
  }
  if (command === "attack-ground") {
    return issueWithClickFeedback(queue
      ? issueGroupQueueAttackGroundOrder(world, unitIds, x, y)
      : issueGroupAttackGroundOrder(world, unitIds, x, y));
  }
  if (command === "patrol") {
    return issueWithClickFeedback(queue
      ? issueGroupQueuePatrolOrder(world, unitIds, x, y)
      : issueGroupPatrolOrder(world, unitIds, x, y));
  }
  if (command === "follow") {
    return issueWithClickFeedback(queue
      ? issueGroupQueueFollowOrder(world, unitIds, x, y)
      : issueGroupFollowOrder(world, unitIds, x, y));
  }
  if (command === "repair") {
    return issueWithClickFeedback(queue
      ? issueGroupQueueRepairOrder(world, unitIds, x, y)
      : issueGroupRepairOrder(world, unitIds, x, y));
  }
  if (command === "harvest") {
    return issueWithClickFeedback(queue
      ? issueGroupQueueHarvestAtOrder(world, unitIds, x, y)
      : issueGroupHarvestAtOrder(world, unitIds, x, y));
  }
  if (command === "build-oil-platform") {
    return issueWithClickFeedback(queue
      ? issueGroupQueueBuildOilPlatformAtOrder(world, unitIds, x, y)
      : issueGroupBuildOilPlatformAtOrder(world, unitIds, x, y));
  }
  return issueWithClickFeedback(queue
    ? issueGroupQueueUnloadTransportOrder(world, unitIds, x, y)
    : issueGroupUnloadTransportOrder(world, unitIds, x, y));
}

function commandFeedbackPlayer(world: WorldState, unitIds: string[]): number {
  return unitIds
    .map((unitId) => findUnit(world, unitId)?.player)
    .find((player): player is number => typeof player === "number") ?? world.visibilityPlayer;
}

export function shouldKeepPendingWorldCommandAfterIssue(world: WorldState, command: PendingWorldCommand, issued: boolean): boolean {
  if (!issued) {
    return isPendingBuildCommand(command) || isPendingSpellCommand(command) || command === "build-oil-platform";
  }
  if (!isPendingSpellCommand(command)) {
    return false;
  }
  const spellId = targetedSpellIdForCommand(world, command.command);
  return Boolean(spellId && world.spellDefinitions.find((spell) => spell.id === spellId)?.repeatCast);
}

export function isPendingBuildCommand(command: PendingWorldCommand | null): command is { kind: "build"; buildingTypeId: string } {
  return typeof command === "object" && command?.kind === "build";
}

export function isPendingSpellCommand(command: PendingWorldCommand | null): command is { kind: "spell"; command: TargetedSpellCommand } {
  return typeof command === "object" && command?.kind === "spell";
}

export function canSelectedIssuePendingWorldCommandAt(world: WorldState, unitIds: string[], command: PendingWorldCommand | null, x: number, y: number, playerId = world.visibilityPlayer): boolean {
  if (!command || unitIds.length === 0) {
    return false;
  }
  if (isPendingBuildCommand(command)) {
    return canSelectedPlaceBuildingAtPoint(world, unitIds, command.buildingTypeId, x, y, world.unitDefinitions, playerId);
  }
  if (command === "build-oil-platform") {
    return canSelectedIssueBuildOilPlatformAt(world, unitIds, x, y, world.unitDefinitions, playerId);
  }
  if (command === "attack-ground") {
    return canSelectedIssueAttackGroundAt(world, unitIds, x, y, playerId);
  }
  if (command === "move") {
    return canSelectedIssueMoveAt(world, unitIds, x, y, playerId);
  }
  if (command === "attack-move") {
    return canSelectedIssueCombatMoveAt(world, unitIds, x, y, playerId);
  }
  if (command === "patrol") {
    return canSelectedIssuePatrolAt(world, unitIds, x, y, playerId);
  }
  if (command === "follow") {
    return canSelectedIssueFollowAt(world, unitIds, x, y, playerId);
  }
  if (isPendingSpellCommand(command)) {
    return canSelectedIssueTargetedSpellAt(world, unitIds, command.command, x, y, playerId);
  }
  if (command === "repair") {
    return canSelectedIssueRepairAt(world, unitIds, x, y, playerId);
  }
  if (command === "harvest") {
    return canSelectedIssueHarvestAt(world, unitIds, x, y, playerId);
  }
  if (command === "unload-transport") {
    return canSelectedIssueUnloadTransportAt(world, unitIds, x, y, playerId);
  }
  return false;
}

export function issueSmartOrder(world: WorldState, unitId: string, x: number, y: number): boolean {
  const issued = issueSmartOrderInternal(world, unitId, x, y);
  if (issued) {
    addClickMissileEffect(world, x, y, findUnit(world, unitId)?.player ?? world.visibilityPlayer);
  }
  return issued;
}

export function isSmartOrderObjectClick(world: WorldState, x: number, y: number, playerId = world.visibilityPlayer): boolean {
  if (findVisibleUnitAtForPlayer(world, x, y, playerId)) {
    return true;
  }
  const tile = worldToTile(world, x, y);
  const tileValue = world.tiles[tile.y * world.map.width + tile.x] ?? 0;
  return isSourceHarvestableWoodTile(world, tileValue);
}

function issueSmartOrderInternal(world: WorldState, unitId: string, x: number, y: number): boolean {
  const unit = findUnit(world, unitId);
  const sourceAction = unit?.rightMouseAction;
  if (sourceAction) {
    const sourceHandled = issueSourceRightMouseAction(world, unit, sourceAction, x, y);
    if (sourceHandled !== null) {
      return sourceHandled;
    }
  }
  if (world.engineSettings.simplifiedAutoTargetingDefault === false) {
    issueMoveOrder(world, unitId, x, y);
    return unit?.order?.kind === "move";
  }
  const dropoffTarget = unit ? findFriendlyDropoffAt(world, unit, x, y) : undefined;
  if (dropoffTarget) {
    return issueReturnGoodsToDropoffOrder(world, unitId, dropoffTarget.id);
  }
  const friendlyTarget = unit ? findFriendlyRepairTargetAt(world, unit, x, y) : undefined;
  if (friendlyTarget) {
    return issueRepairOrder(world, unitId, friendlyTarget.id);
  }
  const friendlyTransport = unit ? findFriendlyTransportAt(world, unit, x, y) : undefined;
  if (friendlyTransport) {
    return issueLoadIntoTransportOrder(world, unitId, friendlyTransport.id);
  }
  const friendlyFollowTarget = unit ? findFriendlyFollowTargetAt(world, unit, x, y) : undefined;
  if (friendlyFollowTarget) {
    return issueFollowOrder(world, unitId, friendlyFollowTarget.id);
  }
  const resource = unit ? findResourceAt(world, x, y, unit.player) : undefined;
  if (resource && unit && canSmartHarvestResource(unit, resource)) {
    if (isOilPatch(resource)) {
      return issueBuildOilPlatformOrder(world, unitId, resource.id, world.unitDefinitions);
    }
    if (isOilPlatform(resource)) {
      return issueHarvestOilOrder(world, unitId, resource.id);
    }
    return issueHarvestOrder(world, unitId, resource.id);
  }

  const tile = worldToTile(world, x, y);
  if (unit && canGatherResource(unit, "wood") && isSourceHarvestableWoodTile(world, world.tiles[tile.y * world.map.width + tile.x] ?? 0)) {
    return issueHarvestWoodOrder(world, unitId, tile.x, tile.y);
  }

  const visibleEnemy = findVisibleEnemyAt(world, unitId, x, y);
  const target = visibleEnemy && unit && canAttackTarget(unit, visibleEnemy, world) ? visibleEnemy : undefined;
  if (target) {
    return issueAttackOrder(world, unitId, target.id);
  }
  if (visibleEnemy) {
    return false;
  }
  issueMoveOrder(world, unitId, x, y);
  return true;
}

function issueSourceRightMouseAction(world: WorldState, unit: WorldUnit, action: string, x: number, y: number): boolean | null {
  if (action === "move" || action === "sail") {
    const target = findSourceRightMouseFollowTargetAt(world, unit, x, y);
    if (target) {
      return issueFollowOrder(world, unit.id, target.id);
    }
    issueMoveOrder(world, unit.id, x, y);
    return unit.order?.kind === "move";
  }
  if (action === "spell-cast") {
    return issueRightMouseSpellCastOrder(world, unit, x, y);
  }
  if (action === "harvest") {
    return issueRightMouseHarvestOrder(world, unit, x, y);
  }
  if (action === "attack") {
    return issueRightMouseAttackOrder(world, unit, x, y);
  }
  return null;
}

function issueRightMouseSpellCastOrder(world: WorldState, unit: WorldUnit, x: number, y: number): boolean {
  const demolishSpell = sourceDemolishSpellForUnit(world, unit);
  if (demolishSpell) {
    const target = findVisibleEnemyAt(world, unit.id, x, y);
    if (!target) {
      return false;
    }
    if (canDetonateAgainstTarget(world, unit, target, demolishSpell.id)) {
      return issueDetonateOrder(world, unit.id);
    }
    return canAttackTarget(unit, target, world) ? issueAttackOrder(world, unit.id, target.id) : false;
  }
  return false;
}

function issueRightMouseAttackOrder(world: WorldState, unit: WorldUnit, x: number, y: number): boolean {
  const target = findVisibleEnemyAt(world, unit.id, x, y);
  if (target) {
    return canAttackTarget(unit, target, world) ? issueAttackOrder(world, unit.id, target.id) : false;
  }
  const followTarget = findSourceRightMouseFollowTargetAt(world, unit, x, y);
  if (followTarget) {
    return issueFollowOrder(world, unit.id, followTarget.id);
  }
  issueMoveOrder(world, unit.id, x, y);
  return unit.order?.kind === "move";
}

function issueRightMouseHarvestOrder(world: WorldState, unit: WorldUnit, x: number, y: number): boolean {
  const resource = findResourceAt(world, x, y, unit.player);
  if (resource && canSmartHarvestResource(unit, resource)) {
    if (isOilPatch(resource)) {
      return issueBuildOilPlatformOrder(world, unit.id, resource.id, world.unitDefinitions);
    }
    if (isOilPlatform(resource)) {
      return issueHarvestOilOrder(world, unit.id, resource.id);
    }
    return issueHarvestOrder(world, unit.id, resource.id);
  }

  const tile = worldToTile(world, x, y);
  if (canGatherResource(unit, "wood") && isSourceHarvestableWoodTile(world, world.tiles[tile.y * world.map.width + tile.x] ?? 0)) {
    return issueHarvestWoodOrder(world, unit.id, tile.x, tile.y);
  }
  return false;
}

function findSourceRightMouseFollowTargetAt(world: WorldState, unit: WorldUnit, x: number, y: number): WorldUnit | undefined {
  if (!canReceiveMoveOrders(unit)) {
    return undefined;
  }
  return world.units
    .filter((candidate) => canTargetFollow(unit, candidate, world))
    .filter((candidate) => pointHitsUnitFootprint(world, candidate, x, y))
    .sort((a, b) => distanceSquared({ x, y }, a) - distanceSquared({ x, y }, b))[0];
}

function canDetonateAgainstTarget(world: WorldState, unit: WorldUnit, target: WorldUnit, spellId: string | null = sourceDemolishSpellIdForUnit(world, unit)): boolean {
  return target.kind !== "fly" && Math.hypot(target.x - unit.x, target.y - unit.y) <= demolitionBlastRadius(world, spellId) + target.radius;
}

function canSmartHarvestResource(unit: WorldUnit, resource: WorldUnit): boolean {
  if (isOilPatch(resource) || isOilPlatform(resource)) {
    return canGatherResource(unit, "oil") && (isOilPatch(resource) || resource.player === unit.player);
  }
  return canGatherResource(unit, "gold") && isGoldMine(resource);
}

function canIssueHarvestCommand(unit: WorldUnit): boolean {
  return canGatherResource(unit, "gold") || canGatherResource(unit, "wood") || canGatherResource(unit, "oil");
}

function canSetHarvestRallyPoint(world: WorldState, unit: WorldUnit): boolean {
  return canSetRallyPoint(world, unit) && sourceHarvestRallyGatherers(world, unit).length > 0;
}

function canIssueHarvestAt(world: WorldState, unit: WorldUnit, x: number, y: number): boolean {
  if (canIssueHarvestCommand(unit)) {
    const resource = findResourceAt(world, x, y, unit.player);
    if (resource && canSmartHarvestResource(unit, resource)) {
      if (isOilPatch(resource)) {
        return canIssueBuildOilPlatformAt(world, unit, resource, world.unitDefinitions);
      }
      return canIssueQueueHarvestTarget(world, unit, resource);
    }
    const woodTile = harvestWoodTileForPoint(world, unit, x, y);
    if (woodTile && canIssueQueueHarvestWoodAt(world, unit, woodTile.x, woodTile.y)) {
      return true;
    }
  }
  return harvestRallyTargetForPoint(world, unit, x, y) !== null;
}

function issueHarvestAtOrder(world: WorldState, unitId: string, x: number, y: number): boolean {
  const unit = findUnit(world, unitId);
  if (!unit) {
    return false;
  }
  if (canIssueHarvestCommand(unit)) {
    const resource = findResourceAt(world, x, y, unit.player);
    if (resource && canSmartHarvestResource(unit, resource)) {
      if (isOilPatch(resource)) {
        return issueBuildOilPlatformOrder(world, unit.id, resource.id, world.unitDefinitions);
      }
      if (isOilPlatform(resource)) {
        return issueHarvestOilOrder(world, unit.id, resource.id);
      }
      return issueHarvestOrder(world, unit.id, resource.id);
    }
    const woodTile = harvestWoodTileForPoint(world, unit, x, y);
    if (woodTile && issueHarvestWoodOrder(world, unit.id, woodTile.x, woodTile.y)) {
      return true;
    }
  }
  return issueHarvestRallyPoint(world, unit, x, y);
}

function issueQueueHarvestAtOrder(world: WorldState, unitId: string, x: number, y: number): boolean {
  const unit = findUnit(world, unitId);
  if (!unit) {
    return false;
  }
  if (canIssueHarvestCommand(unit)) {
    const resource = findResourceAt(world, x, y, unit.player);
    if (resource && canSmartHarvestResource(unit, resource)) {
      if (isOilPatch(resource)) {
        return issueQueueBuildOilPlatformAtOrder(world, unit.id, resource.x, resource.y, world.unitDefinitions);
      }
      return issueQueueHarvestOrder(world, unit.id, resource.id);
    }
    const woodTile = harvestWoodTileForPoint(world, unit, x, y);
    if (woodTile && issueQueueHarvestWoodOrder(world, unit.id, woodTile.x, woodTile.y)) {
      return true;
    }
  }
  return issueHarvestRallyPoint(world, unit, x, y);
}

export function issueGroupHarvestAtOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  let issued = false;
  for (const unit of selectedUnitsForPlayer(world, unitIds, playerId)) {
    issued = issueHarvestAtOrder(world, unit.id, x, y) || issued;
  }
  return issued;
}

export function issueGroupQueueHarvestAtOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  let issued = false;
  for (const unit of selectedUnitsForPlayer(world, unitIds, playerId)) {
    issued = issueQueueHarvestAtOrder(world, unit.id, x, y) || issued;
  }
  return issued;
}

function harvestWoodTileForPoint(world: WorldState, unit: WorldUnit, x: number, y: number): { x: number; y: number } | null {
  const tile = worldToTile(world, x, y);
  if (isReachableWoodTileForUnit(world, unit, tile.x, tile.y)) {
    return tile;
  }
  return findNearestReachableWoodTileNear(world, unit, tile.x, tile.y, 18) ?? findNearestReachableWoodTileForUnit(world, unit, 32);
}

function exactHarvestWoodTileForPoint(world: WorldState, x: number, y: number): { x: number; y: number } | null {
  const tile = worldToTile(world, x, y);
  return isSourceHarvestableWoodTile(world, world.tiles[tile.y * world.map.width + tile.x] ?? 0) ? tile : null;
}

function issueHarvestRallyPoint(world: WorldState, producer: WorldUnit, x: number, y: number): boolean {
  const target = harvestRallyTargetForPoint(world, producer, x, y);
  if (!target) {
    return false;
  }
  producer.rallyPoint = target;
  return true;
}

function harvestRallyTargetForPoint(world: WorldState, producer: WorldUnit, x: number, y: number): { x: number; y: number } | null {
  if (!canSetHarvestRallyPoint(world, producer)) {
    return null;
  }
  const gatherers = sourceHarvestRallyGatherers(world, producer);
  const resource = findResourceAt(world, x, y, producer.player);
  if (resource && !isOilPatch(resource) && gatherers.some((definition) => canDefinitionHarvestResourceAt(world, definition, resource, producer.player))) {
    return { x: resource.x, y: resource.y };
  }
  const woodTile = exactHarvestWoodTileForPoint(world, x, y);
  if (woodTile && gatherers.some((definition) => (definition.gatherResources ?? []).includes("wood"))) {
    return tileToWorldCenter(world, woodTile.x, woodTile.y);
  }
  return null;
}

function sourceHarvestRallyGatherers(world: WorldState, producer: WorldUnit): WargusUnit[] {
  return world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "train-unit" && Boolean(button.value) && sourceButtonAppliesTo(button, producer.typeId))
    .filter((button) => sourceButtonAllowedForUnit(world, button, producer))
    .map((button) => world.unitDefinitions.find((definition) => definition.id === button.value))
    .filter((definition): definition is WargusUnit => Boolean(definition
      && isUnitTypeAllowed(world, definition.id, producer.player)
      && (definition.gatherResources ?? []).length > 0));
}

function canDefinitionHarvestResourceAt(world: WorldState, definition: WargusUnit, resource: WorldUnit, playerId: number): boolean {
  if (!resource.givesResource || !(definition.gatherResources ?? []).includes(resource.givesResource)) {
    return false;
  }
  if (isGoldMine(resource)) {
    return true;
  }
  return isOilPlatform(resource) && resource.player === playerId && isVisibleResourceSource(world, resource, playerId);
}

export function issueMoveOrder(world: WorldState, unitId: string, x: number, y: number): void {
  const unit = findUnit(world, unitId);
  if (!unit || !canIssueMoveAt(world, unit, x, y)) {
    return;
  }

  const clampedX = Math.max(0, Math.min(world.map.width * world.tileSize, x));
  const clampedY = Math.max(0, Math.min(world.map.height * world.tileSize, y));
  const path = findPath(world, unit, clampedX, clampedY);
  unit.moveQueue = [];
  unit.order = {
    kind: "move",
    targetX: path[path.length - 1].x,
    targetY: path[path.length - 1].y,
    path,
    pathIndex: path.length > 1 ? 1 : 0
  };
}

export function canIssueMoveAt(world: WorldState, unit: WorldUnit, x: number, y: number): boolean {
  if (!canReceiveMoveOrders(unit)) {
    return false;
  }
  const clampedX = Math.max(0, Math.min(world.map.width * world.tileSize, x));
  const clampedY = Math.max(0, Math.min(world.map.height * world.tileSize, y));
  return findPath(world, unit, clampedX, clampedY).length > 0;
}

export function canIssueQueueMoveAt(world: WorldState, unit: WorldUnit, x: number, y: number): boolean {
  if (!canReceiveMoveOrders(unit)) {
    return false;
  }
  const clampedX = Math.max(0, Math.min(world.map.width * world.tileSize, x));
  const clampedY = Math.max(0, Math.min(world.map.height * world.tileSize, y));
  return canReachQueuedDestination(world, unit, clampedX, clampedY);
}

export function issueQueueMoveOrder(world: WorldState, unitId: string, x: number, y: number): boolean {
  const unit = findUnit(world, unitId);
  if (!unit || !canIssueQueueMoveAt(world, unit, x, y)) {
    return false;
  }
  const clampedX = Math.max(0, Math.min(world.map.width * world.tileSize, x));
  const clampedY = Math.max(0, Math.min(world.map.height * world.tileSize, y));
  unit.moveQueue.push({ kind: "move", x: clampedX, y: clampedY });
  if (!unit.order) {
    startNextQueuedMove(world, unit);
  }
  return true;
}

export function issueQueueAttackMoveOrder(world: WorldState, unitId: string, x: number, y: number): boolean {
  const unit = findUnit(world, unitId);
  if (!unit || !canIssueQueueCombatMoveAt(world, unit, x, y)) {
    return false;
  }
  const clampedX = Math.max(0, Math.min(world.map.width * world.tileSize, x));
  const clampedY = Math.max(0, Math.min(world.map.height * world.tileSize, y));
  unit.moveQueue.push({ kind: "attack-move", x: clampedX, y: clampedY });
  if (!unit.order) {
    startNextQueuedMove(world, unit);
  }
  return true;
}

export function issueQueuePatrolOrder(world: WorldState, unitId: string, x: number, y: number): boolean {
  const unit = findUnit(world, unitId);
  if (!unit || !canIssueQueuePatrolAt(world, unit, x, y)) {
    return false;
  }
  const clampedX = Math.max(0, Math.min(world.map.width * world.tileSize, x));
  const clampedY = Math.max(0, Math.min(world.map.height * world.tileSize, y));
  unit.moveQueue.push({ kind: "patrol", x: clampedX, y: clampedY });
  if (!unit.order) {
    startNextQueuedMove(world, unit);
  }
  return true;
}

export function issueQueueFollowOrder(world: WorldState, unitId: string, targetId: string): boolean {
  const unit = findUnit(world, unitId);
  const target = findUnit(world, targetId);
  if (!unit || !target || !canIssueQueueFollowTarget(world, unit, target)) {
    return false;
  }
  unit.moveQueue.push({ kind: "follow", targetId: target.id, x: target.x, y: target.y });
  if (!unit.order) {
    startNextQueuedMove(world, unit);
  }
  return true;
}

export function issueQueueDefendOrder(world: WorldState, unitId: string, targetId: string): boolean {
  const unit = findUnit(world, unitId);
  const target = findUnit(world, targetId);
  if (!unit || !target || !canIssueQueueDefendTarget(world, unit, target)) {
    return false;
  }
  unit.moveQueue.push({ kind: "defend", targetId: target.id, x: target.x, y: target.y });
  if (!unit.order) {
    startNextQueuedMove(world, unit);
  }
  return true;
}

export function issueQueueLoadIntoTransportOrder(world: WorldState, unitId: string, transportId: string): boolean {
  const unit = findUnit(world, unitId);
  const transport = findUnit(world, transportId);
  if (!unit || !transport || !canIssueQueueLoadIntoTransportTarget(world, unit, transport)) {
    return false;
  }
  unit.moveQueue.push({ kind: "load-transport", targetId: transport.id, x: transport.x, y: transport.y });
  if (!unit.order) {
    startNextQueuedMove(world, unit);
  }
  return true;
}

export function issueQueueRepairOrder(world: WorldState, unitId: string, targetId: string): boolean {
  const unit = findUnit(world, unitId);
  const target = findUnit(world, targetId);
  if (!unit || !target || !canIssueQueueRepairTarget(world, unit, target)) {
    return false;
  }
  unit.moveQueue.push({ kind: "repair", targetId: target.id, x: target.x, y: target.y });
  if (!unit.order) {
    startNextQueuedMove(world, unit);
  }
  return true;
}

export function issueQueueUnloadTransportAtOrder(world: WorldState, transportId: string, x: number, y: number): boolean {
  const transport = findUnit(world, transportId);
  if (!transport || !canIssueQueueUnloadTransportAt(world, transport, x, y)) {
    return false;
  }
  const clampedX = Math.max(0, Math.min(world.map.width * world.tileSize, x));
  const clampedY = Math.max(0, Math.min(world.map.height * world.tileSize, y));
  transport.moveQueue.push({ kind: "unload-transport", x: clampedX, y: clampedY, cargoUnitId: null });
  if (!transport.order) {
    startNextQueuedMove(world, transport);
  }
  return true;
}

export function issueUnloadCargoUnitOrder(world: WorldState, transportId: string, cargoUnitId: string, queue = false): boolean {
  const transport = findUnit(world, transportId);
  if (!transport || !canIssueUnloadCargoUnit(transport, cargoUnitId)) {
    return false;
  }
  const center = worldToTile(world, transport.x, transport.y);
  if (!queue && unloadTransportCargoNear(world, transport, center, cargoUnitId)) {
    return true;
  }
  const point = tileToWorldCenter(world, center.x, center.y);
  const target = { kind: "unload-transport" as const, x: point.x, y: point.y, cargoUnitId };
  if (queue) {
    transport.moveQueue.push(target);
    if (!transport.order) {
      startNextQueuedMove(world, transport);
    }
  } else {
    transport.moveQueue = [];
    transport.order = sourceUnloadOrderAtCurrentTile(world, transport, cargoUnitId);
  }
  return true;
}

export function issueQueueHarvestOrder(world: WorldState, unitId: string, targetId: string): boolean {
  const unit = findUnit(world, unitId);
  const target = findUnit(world, targetId);
  if (!unit || !target || !canIssueQueueHarvestTarget(world, unit, target)) {
    return false;
  }
  const resource = isOilPlatform(target) ? "oil" : "gold";
  unit.moveQueue.push({ kind: "harvest", resource, targetId: target.id, x: target.x, y: target.y });
  if (!unit.order) {
    startNextQueuedMove(world, unit);
  }
  return true;
}

export function issueQueueHarvestWoodOrder(world: WorldState, unitId: string, tileX: number, tileY: number): boolean {
  const unit = findUnit(world, unitId);
  if (!unit || !canIssueQueueHarvestWoodAt(world, unit, tileX, tileY)) {
    return false;
  }
  const target = tileToWorldCenter(world, tileX, tileY);
  unit.moveQueue.push({ kind: "harvest-wood", tileX, tileY, x: target.x, y: target.y });
  if (!unit.order) {
    startNextQueuedMove(world, unit);
  }
  return true;
}

export function issueQueueReturnGoodsOrder(world: WorldState, unitId: string, targetId: string | null = null): boolean {
  const unit = findUnit(world, unitId);
  if (!unit || !canIssueQueueReturnGoodsOrder(world, unit, targetId)) {
    return false;
  }
  const resource = unit.carriedResource;
  if (!isHarvestResource(resource)) {
    return false;
  }
  const dropoff = targetId ? findUnit(world, targetId) : findNearestDropoff(world, unit, resource);
  if (!dropoff) {
    return false;
  }
  const dropoffPoint = resourceDropoffTargetPoint(world, unit, dropoff);
  unit.moveQueue.push({ kind: "return-goods", resource, targetId: targetId ? dropoff.id : null, x: dropoffPoint.x, y: dropoffPoint.y });
  if (!unit.order) {
    startNextQueuedMove(world, unit);
  }
  return true;
}

export function canIssueQueueBuildAt(world: WorldState, builder: WorldUnit, buildingTypeId: string, x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean {
  return canPlaceBuildingAtPoint(world, builder, buildingTypeId, x, y, unitDefinitions);
}

export function issueQueueBuildAtOrder(world: WorldState, builderId: string, buildingTypeId: string, x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean {
  const builder = findUnit(world, builderId);
  if (!builder || !canIssueQueueBuildAt(world, builder, buildingTypeId, x, y, unitDefinitions)) {
    return false;
  }
  const clampedX = Math.max(0, Math.min(world.map.width * world.tileSize, x));
  const clampedY = Math.max(0, Math.min(world.map.height * world.tileSize, y));
  builder.moveQueue.push({ kind: "build", buildingTypeId, x: clampedX, y: clampedY });
  if (!builder.order) {
    startNextQueuedMove(world, builder);
  }
  return true;
}

export function issueSelectedQueueBuildAtOrder(world: WorldState, unitIds: string[], buildingTypeId: string, x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions, playerId = world.visibilityPlayer): boolean {
  const builder = findSelectedSourceBuilder(world, unitIds, playerId);
  return builder ? issueQueueBuildAtOrder(world, builder.id, buildingTypeId, x, y, unitDefinitions) : false;
}

export function issueGroupQueueBuildAtOrder(world: WorldState, unitIds: string[], buildingTypeId: string, x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions, playerId = world.visibilityPlayer): boolean {
  return issueSelectedQueueBuildAtOrder(world, unitIds, buildingTypeId, x, y, unitDefinitions, playerId);
}

export function issueQueueStandGroundOrder(world: WorldState, unitId: string): boolean {
  const unit = findUnit(world, unitId);
  if (!unit || !canIssueHoldPosition(unit)) {
    return false;
  }
  const origin = queuedPathOrigin(unit) ?? { x: unit.x, y: unit.y };
  unit.moveQueue.push({ kind: "stand-ground", x: origin.x, y: origin.y });
  if (!unit.order) {
    startNextQueuedMove(world, unit);
  }
  return true;
}

export function issueQueueExploreOrder(world: WorldState, unitId: string): boolean {
  const unit = findUnit(world, unitId);
  if (!unit || !canIssueExploreOrder(world, unit)) {
    return false;
  }
  const origin = queuedPathOrigin(unit) ?? { x: unit.x, y: unit.y };
  unit.moveQueue.push({ kind: "explore", x: origin.x, y: origin.y });
  if (!unit.order) {
    startNextQueuedMove(world, unit);
  }
  return true;
}

export function issueStopOrder(world: WorldState, unitId: string): boolean {
  const unit = findUnit(world, unitId);
  if (!unit || !canIssueStop(unit)) {
    return false;
  }
  unit.order = null;
  unit.moveQueue = [];
  return true;
}

export function canIssueStop(unit: WorldUnit): boolean {
  return canReceiveMoveOrders(unit);
}

export function issueAttackMoveOrder(world: WorldState, unitId: string, x: number, y: number): boolean {
  const unit = findUnit(world, unitId);
  if (!unit || !canIssueCombatMoveAt(world, unit, x, y)) {
    return false;
  }
  const clampedX = Math.max(0, Math.min(world.map.width * world.tileSize, x));
  const clampedY = Math.max(0, Math.min(world.map.height * world.tileSize, y));
  const path = findPath(world, unit, clampedX, clampedY);
  unit.moveQueue = [];
  unit.order = {
    kind: "attack-move",
    targetId: null,
    targetX: path.at(-1)?.x ?? clampedX,
    targetY: path.at(-1)?.y ?? clampedY,
    path,
    pathIndex: path.length > 1 ? 1 : 0
  };
  return true;
}

export function issueAttackGroundOrder(world: WorldState, unitId: string, x: number, y: number): boolean {
  const unit = findUnit(world, unitId);
  if (!unit || unit.construction || !canAttackGround(unit)) {
    return false;
  }
  const clampedX = Math.max(0, Math.min(world.map.width * world.tileSize, x));
  const clampedY = Math.max(0, Math.min(world.map.height * world.tileSize, y));
  if (!canReceiveMoveOrders(unit) && !isGroundTargetInRange(world, unit, clampedX, clampedY)) {
    return false;
  }
  const inRange = isGroundTargetInRange(world, unit, clampedX, clampedY);
  const path = inRange ? [] : findPath(world, unit, clampedX, clampedY);
  if (!inRange && path.length === 0) {
    return false;
  }
  unit.moveQueue = [];
  unit.order = {
    kind: "attack-ground",
    targetX: clampedX,
    targetY: clampedY,
    path,
    pathIndex: path.length > 1 ? 1 : 0
  };
  return true;
}

export function issueQueueAttackGroundOrder(world: WorldState, unitId: string, x: number, y: number): boolean {
  const unit = findUnit(world, unitId);
  if (!unit || !canIssueQueueAttackGroundAt(world, unit, x, y)) {
    return false;
  }
  const clampedX = Math.max(0, Math.min(world.map.width * world.tileSize, x));
  const clampedY = Math.max(0, Math.min(world.map.height * world.tileSize, y));
  unit.moveQueue.push({ kind: "attack-ground", x: clampedX, y: clampedY });
  if (!unit.order) {
    startNextQueuedMove(world, unit);
  }
  return true;
}

export function issueQueueAttackOrder(world: WorldState, unitId: string, targetId: string): boolean {
  const unit = findUnit(world, unitId);
  const target = findUnit(world, targetId);
  if (!unit || !target || !canIssueQueueAttackTarget(world, unit, target)) {
    return false;
  }
  unit.moveQueue.push({ kind: "attack-target", targetId: target.id, x: target.x, y: target.y });
  if (!unit.order) {
    startNextQueuedMove(world, unit);
  }
  return true;
}

export function canIssueAttackGroundAt(world: WorldState, unit: WorldUnit, x: number, y: number): boolean {
  if (unit.construction || !canAttackGround(unit)) {
    return false;
  }
  const clampedX = Math.max(0, Math.min(world.map.width * world.tileSize, x));
  const clampedY = Math.max(0, Math.min(world.map.height * world.tileSize, y));
  if (!canReceiveMoveOrders(unit)) {
    return isGroundTargetInRange(world, unit, clampedX, clampedY);
  }
  return isGroundTargetInRange(world, unit, clampedX, clampedY) || findPath(world, unit, clampedX, clampedY).length > 0;
}

export function canIssueQueueAttackGroundAt(world: WorldState, unit: WorldUnit, x: number, y: number): boolean {
  const origin = queuedPathOrigin(unit);
  const pathingUnit = origin ? { ...unit, x: origin.x, y: origin.y } : unit;
  return canIssueAttackGroundAt(world, pathingUnit, x, y);
}

export function canIssueQueueAttackTarget(world: WorldState, unit: WorldUnit, target: WorldUnit): boolean {
  if (!canIssueAttackTarget(world, unit, target)) {
    return false;
  }
  const origin = queuedPathOrigin(unit);
  const pathingUnit = origin ? { ...unit, x: origin.x, y: origin.y } : unit;
  return isInAttackRange(pathingUnit, target, world) || findPath(world, pathingUnit, target.x, target.y).length > 0;
}

export function canSelectedIssueAttackGroundAt(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  return unitIds
    .map((id) => findUnit(world, id))
    .some((unit): boolean => Boolean(unit
      && unit.player === playerId
      && canIssueAttackGroundAt(world, unit, x, y)));
}

export function issueHoldPositionOrder(world: WorldState, unitId: string, options: { clearQueue?: boolean } = {}): boolean {
  const unit = findUnit(world, unitId);
  if (!unit || !canIssueHoldPosition(unit)) {
    return false;
  }
  if (options.clearQueue !== false) {
    unit.moveQueue = [];
  }
  unit.order = {
    kind: "hold",
    targetId: null,
    anchorX: unit.x,
    anchorY: unit.y
  };
  return true;
}

export function issuePatrolOrder(world: WorldState, unitId: string, x: number, y: number): boolean {
  const unit = findUnit(world, unitId);
  if (!unit || !canIssuePatrolAt(world, unit, x, y)) {
    return false;
  }
  const clampedX = Math.max(0, Math.min(world.map.width * world.tileSize, x));
  const clampedY = Math.max(0, Math.min(world.map.height * world.tileSize, y));
  const path = findPath(world, unit, clampedX, clampedY);
  unit.moveQueue = [];
  unit.order = {
    kind: "patrol",
    targetId: null,
    anchorX: unit.x,
    anchorY: unit.y,
    targetX: path.at(-1)?.x ?? clampedX,
    targetY: path.at(-1)?.y ?? clampedY,
    patrolX: path.at(-1)?.x ?? clampedX,
    patrolY: path.at(-1)?.y ?? clampedY,
    returning: false,
    patrolRange: 0,
    patrolWaitingCycle: 0,
    path,
    pathIndex: path.length > 1 ? 1 : 0
  };
  return true;
}

export function canIssueHoldPosition(unit: WorldUnit): boolean {
  return canReceiveMoveOrders(unit) && unit.canAttack;
}

function canReceiveCombatMoveOrders(unit: WorldUnit): boolean {
  return canIssueHoldPosition(unit);
}

export function canIssueCombatMoveAt(world: WorldState, unit: WorldUnit, x: number, y: number): boolean {
  if (!canReceiveCombatMoveOrders(unit)) {
    return false;
  }
  const clampedX = Math.max(0, Math.min(world.map.width * world.tileSize, x));
  const clampedY = Math.max(0, Math.min(world.map.height * world.tileSize, y));
  return findPath(world, unit, clampedX, clampedY).length > 0;
}

export function canIssueQueueCombatMoveAt(world: WorldState, unit: WorldUnit, x: number, y: number): boolean {
  if (!canReceiveCombatMoveOrders(unit)) {
    return false;
  }
  const clampedX = Math.max(0, Math.min(world.map.width * world.tileSize, x));
  const clampedY = Math.max(0, Math.min(world.map.height * world.tileSize, y));
  return canReachQueuedDestination(world, unit, clampedX, clampedY);
}

export function canIssuePatrolAt(world: WorldState, unit: WorldUnit, x: number, y: number): boolean {
  if (!canReceiveMoveOrders(unit)) {
    return false;
  }
  const clampedX = Math.max(0, Math.min(world.map.width * world.tileSize, x));
  const clampedY = Math.max(0, Math.min(world.map.height * world.tileSize, y));
  return findPath(world, unit, clampedX, clampedY).length > 0;
}

export function canIssueQueuePatrolAt(world: WorldState, unit: WorldUnit, x: number, y: number): boolean {
  if (!canReceiveMoveOrders(unit)) {
    return false;
  }
  const clampedX = Math.max(0, Math.min(world.map.width * world.tileSize, x));
  const clampedY = Math.max(0, Math.min(world.map.height * world.tileSize, y));
  return canReachQueuedDestination(world, unit, clampedX, clampedY);
}

export function formationDestinations(world: WorldState, units: WorldUnit[], x: number, y: number): Map<string, { x: number; y: number }> {
  const destinations = new Map<string, { x: number; y: number }>();
  if (units.length === 0) {
    return destinations;
  }
  if (!sourceFormationMovementApplies(world, units)) {
    const destination = clampWorldPoint(world, x, y);
    for (const unit of units) {
      destinations.set(unit.id, destination);
    }
    return destinations;
  }
  const movementGroups = groupUnitsByMovementKind(units);
  if (movementGroups.length > 1) {
    const groupCenters = movementGroupDestinations(world, movementGroups, x, y);
    for (const group of movementGroups) {
      const groupDestination = groupCenters.get(movementKindForUnit(group[0])) ?? { x, y };
      for (const [unitId, destination] of formationDestinations(world, group, groupDestination.x, groupDestination.y)) {
        destinations.set(unitId, destination);
      }
    }
    return destinations;
  }
  if (units.length === 1) {
    destinations.set(units[0].id, clampWorldPoint(world, x, y));
    return destinations;
  }

  const center = averageUnitPosition(units);
  const travelX = x - center.x;
  const travelY = y - center.y;
  const travelDistance = Math.hypot(travelX, travelY);
  const forwardX = travelDistance > 0.01 ? travelX / travelDistance : 0;
  const forwardY = travelDistance > 0.01 ? travelY / travelDistance : -1;
  const sideX = -forwardY;
  const sideY = forwardX;
  const columns = Math.ceil(Math.sqrt(units.length));
  const rows = Math.ceil(units.length / columns);
  const spacing = world.tileSize * 0.92;
  const sortedUnits = [...units].sort((left, right) => {
    const leftSide = (left.x - center.x) * sideX + (left.y - center.y) * sideY;
    const rightSide = (right.x - center.x) * sideX + (right.y - center.y) * sideY;
    if (Math.abs(leftSide - rightSide) > 1) {
      return leftSide - rightSide;
    }
    const leftForward = (left.x - center.x) * forwardX + (left.y - center.y) * forwardY;
    const rightForward = (right.x - center.x) * forwardX + (right.y - center.y) * forwardY;
    return rightForward - leftForward;
  });

  sortedUnits.forEach((unit, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const sideOffset = (column - (columns - 1) / 2) * spacing;
    const forwardOffset = (row - (rows - 1) / 2) * spacing;
    destinations.set(unit.id, clampWorldPoint(
      world,
      x + sideX * sideOffset - forwardX * forwardOffset,
      y + sideY * sideOffset - forwardY * forwardOffset
    ));
  });
  return destinations;
}

function sourceFormationMovementApplies(world: WorldState, units: WorldUnit[]): boolean {
  if (!world.engineSettings.formationMovementDefault || units.length >= 12) {
    return false;
  }
  const magicBoxSize = 7 * world.tileSize;
  let minX = units[0]?.x ?? 0;
  let maxX = minX;
  let minY = units[0]?.y ?? 0;
  let maxY = minY;
  for (const unit of units.slice(1)) {
    minX = Math.min(minX, unit.x);
    maxX = Math.max(maxX, unit.x);
    if (maxX - minX > magicBoxSize) {
      return false;
    }
    minY = Math.min(minY, unit.y);
    maxY = Math.max(maxY, unit.y);
    if (maxY - minY > magicBoxSize) {
      return false;
    }
  }
  return true;
}

function groupUnitsByMovementKind(units: WorldUnit[]): WorldUnit[][] {
  const groups = new Map<ReturnType<typeof movementKindForUnit>, WorldUnit[]>();
  for (const unit of units) {
    const movement = movementKindForUnit(unit);
    groups.set(movement, [...(groups.get(movement) ?? []), unit]);
  }
  return [...groups.values()];
}

function movementGroupDestinations(world: WorldState, groups: WorldUnit[][], x: number, y: number): Map<ReturnType<typeof movementKindForUnit>, { x: number; y: number }> {
  const destinations = new Map<ReturnType<typeof movementKindForUnit>, { x: number; y: number }>();
  if (groups.length === 1) {
    destinations.set(movementKindForUnit(groups[0][0]), clampWorldPoint(world, x, y));
    return destinations;
  }

  const totalUnits = groups.reduce((sum, group) => sum + group.length, 0);
  const center = groups.reduce((sum, group) => {
    for (const unit of group) {
      sum.x += unit.x;
      sum.y += unit.y;
    }
    return sum;
  }, { x: 0, y: 0 });
  center.x /= Math.max(1, totalUnits);
  center.y /= Math.max(1, totalUnits);

  const travelX = x - center.x;
  const travelY = y - center.y;
  const travelDistance = Math.hypot(travelX, travelY);
  const sideX = travelDistance > 0.01 ? -travelY / travelDistance : 1;
  const sideY = travelDistance > 0.01 ? travelX / travelDistance : 0;
  const sortedGroups = [...groups].sort((left, right) => {
    const leftMovement = movementKindForUnit(left[0]);
    const rightMovement = movementKindForUnit(right[0]);
    const leftCenter = averageUnitPosition(left);
    const rightCenter = averageUnitPosition(right);
    const leftSide = (leftCenter.x - center.x) * sideX + (leftCenter.y - center.y) * sideY;
    const rightSide = (rightCenter.x - center.x) * sideX + (rightCenter.y - center.y) * sideY;
    if (Math.abs(leftSide - rightSide) > 1) {
      return leftSide - rightSide;
    }
    return movementSortRank(leftMovement) - movementSortRank(rightMovement);
  });
  const spacing = world.tileSize * 1.35;
  sortedGroups.forEach((group, index) => {
    const movement = movementKindForUnit(group[0]);
    const offset = (index - (sortedGroups.length - 1) / 2) * spacing;
    destinations.set(movement, clampWorldPoint(world, x + sideX * offset, y + sideY * offset));
  });
  return destinations;
}

function averageUnitPosition(units: WorldUnit[]): { x: number; y: number } {
  const sum = units.reduce((total, unit) => ({ x: total.x + unit.x, y: total.y + unit.y }), { x: 0, y: 0 });
  return {
    x: sum.x / Math.max(1, units.length),
    y: sum.y / Math.max(1, units.length)
  };
}

function movementSortRank(movement: ReturnType<typeof movementKindForUnit>): number {
  if (movement === "land") {
    return 0;
  }
  if (movement === "naval") {
    return 1;
  }
  return 2;
}

function clampWorldPoint(world: WorldState, x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(world.map.width * world.tileSize, x)),
    y: Math.max(0, Math.min(world.map.height * world.tileSize, y))
  };
}

function selectedUnitsForPlayer(world: WorldState, unitIds: string[], playerId = world.visibilityPlayer): WorldUnit[] {
  return unitIds
    .map((id) => findUnit(world, id))
    .filter((unit): unit is WorldUnit => Boolean(unit && unit.player === playerId && !isUnitHiddenInConstruction(unit)));
}

export function canSelectedIssueMoveAt(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  const movableUnits = selectedUnitsForPlayer(world, unitIds, playerId);
  const destinations = formationDestinations(world, movableUnits, x, y);
  return movableUnits.some((unit) => {
    const destination = destinations.get(unit.id) ?? { x, y };
    return canIssueMoveAt(world, unit, destination.x, destination.y);
  });
}

export function canSelectedIssueCombatMoveAt(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  const movableUnits = selectedUnitsForPlayer(world, unitIds, playerId);
  const destinations = formationDestinations(world, movableUnits, x, y);
  return movableUnits.some((unit) => {
    const destination = destinations.get(unit.id) ?? { x, y };
    return canIssueCombatMoveAt(world, unit, destination.x, destination.y);
  });
}

export function canSelectedIssuePatrolAt(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  const movableUnits = selectedUnitsForPlayer(world, unitIds, playerId);
  const destinations = formationDestinations(world, movableUnits, x, y);
  return movableUnits.some((unit) => {
    const destination = destinations.get(unit.id) ?? { x, y };
    return canIssuePatrolAt(world, unit, destination.x, destination.y);
  });
}

export function canSelectedIssueFollowAt(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  return unitIds
    .map((id) => findUnit(world, id))
    .some((unit): boolean => Boolean(unit
      && unit.player === playerId
      && canIssueFollowAt(world, unit, x, y)));
}

export function canSelectedIssueHarvestAt(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  return unitIds
    .map((id) => findUnit(world, id))
    .some((unit): boolean => Boolean(unit
      && unit.player === playerId
      && canIssueHarvestAt(world, unit, x, y)));
}

export function issueGroupSmartOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  const movableUnits = selectedUnitsForPlayer(world, unitIds, playerId);
  if (movableUnits.length === 0) {
    return false;
  }
  if (isSmartOrderObjectClick(world, x, y, playerId)) {
    let issued = false;
    for (const unit of movableUnits) {
      issued = issueSmartOrderInternal(world, unit.id, x, y) || issued;
    }
    if (issued) {
      addClickMissileEffect(world, x, y, commandFeedbackPlayer(world, unitIds));
    }
    return issued;
  }
  const destinations = formationDestinations(world, movableUnits, x, y);
  let issued = false;
  for (const unit of movableUnits) {
    const destination = destinations.get(unit.id) ?? { x, y };
    if (canIssueMoveAt(world, unit, destination.x, destination.y)) {
      issueMoveOrder(world, unit.id, destination.x, destination.y);
      issued = true;
    }
  }
  if (issued) {
    addClickMissileEffect(world, x, y, commandFeedbackPlayer(world, unitIds));
  }
  return issued;
}

export function issueGroupQueueSmartOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  const movableUnits = selectedUnitsForPlayer(world, unitIds, playerId);
  if (movableUnits.length === 0) {
    return false;
  }
  if (isSmartOrderObjectClick(world, x, y, playerId)) {
    let issued = false;
    for (const unit of movableUnits) {
      const dropoffTarget = findFriendlyDropoffAt(world, unit, x, y);
      if (dropoffTarget && issueQueueReturnGoodsOrder(world, unit.id, dropoffTarget.id)) {
        issued = true;
        continue;
      }
      const friendlyRepairTarget = findFriendlyRepairTargetAt(world, unit, x, y);
      if (friendlyRepairTarget && issueQueueRepairOrder(world, unit.id, friendlyRepairTarget.id)) {
        issued = true;
        continue;
      }
      const friendlyTransport = findFriendlyTransportAt(world, unit, x, y);
      if (friendlyTransport && issueQueueLoadIntoTransportOrder(world, unit.id, friendlyTransport.id)) {
        issued = true;
        continue;
      }
      const friendlyFollowTarget = findFriendlyFollowTargetAt(world, unit, x, y);
      if (friendlyFollowTarget && issueQueueFollowOrder(world, unit.id, friendlyFollowTarget.id)) {
        issued = true;
        continue;
      }
      const resource = findResourceAt(world, x, y, unit.player);
      if (resource && canSmartHarvestResource(unit, resource) && issueQueueHarvestOrder(world, unit.id, resource.id)) {
        issued = true;
        continue;
      }
      const tile = worldToTile(world, x, y);
      if (canIssueQueueHarvestWoodAt(world, unit, tile.x, tile.y) && issueQueueHarvestWoodOrder(world, unit.id, tile.x, tile.y)) {
        issued = true;
        continue;
      }
      const visibleEnemy = findVisibleEnemyAt(world, unit.id, x, y);
      if (visibleEnemy && issueQueueAttackOrder(world, unit.id, visibleEnemy.id)) {
        issued = true;
      }
    }
    if (issued) {
      addClickMissileEffect(world, x, y, commandFeedbackPlayer(world, unitIds));
    }
    return issued;
  }
  const destinations = formationDestinations(world, movableUnits, x, y);
  let issued = false;
  for (const unit of movableUnits) {
    const destination = destinations.get(unit.id) ?? { x, y };
    issued = (canIssueQueueMoveAt(world, unit, destination.x, destination.y) && issueQueueMoveOrder(world, unit.id, destination.x, destination.y)) || issued;
  }
  if (issued) {
    addClickMissileEffect(world, x, y, commandFeedbackPlayer(world, unitIds));
  }
  return issued;
}

export function issueGroupMoveOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  const movableUnits = selectedUnitsForPlayer(world, unitIds, playerId);
  if (movableUnits.length === 0) {
    return false;
  }
  const destinations = formationDestinations(world, movableUnits, x, y);
  let issued = false;
  movableUnits.forEach((unit) => {
    const destination = destinations.get(unit.id) ?? { x, y };
    if (canIssueMoveAt(world, unit, destination.x, destination.y)) {
      issueMoveOrder(world, unit.id, destination.x, destination.y);
      issued = true;
    }
  });
  return issued;
}

export function issueGroupQueueMoveOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  const movableUnits = selectedUnitsForPlayer(world, unitIds, playerId);
  if (movableUnits.length === 0) {
    return false;
  }
  const destinations = formationDestinations(world, movableUnits, x, y);
  let issued = false;
  movableUnits.forEach((unit) => {
    const destination = destinations.get(unit.id) ?? { x, y };
    issued = (canIssueQueueMoveAt(world, unit, destination.x, destination.y) && issueQueueMoveOrder(world, unit.id, destination.x, destination.y)) || issued;
  });
  return issued;
}

export function issueGroupSmartOrRallyOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  const selectedUnits = selectedUnitsForPlayer(world, unitIds, playerId);
  const producers = selectedUnits.filter((unit) => canSetRallyPoint(world, unit));
  const others = selectedUnits.filter((unit) => !canSetRallyPoint(world, unit));
  if (producers.length > 0 && others.length === 0) {
    const issued = issueGroupRallyPointOrder(world, unitIds, x, y, playerId);
    if (issued) {
      addClickMissileEffect(world, x, y, commandFeedbackPlayer(world, unitIds));
    }
    return issued;
  }
  return issueGroupSmartOrder(world, unitIds, x, y, playerId);
}

function issueGroupRallyPointOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  const selectedUnits = selectedUnitsForPlayer(world, unitIds, playerId);
  const producers = selectedUnits.filter((unit) => canSetRallyPoint(world, unit));
  const others = selectedUnits.filter((unit) => !canSetRallyPoint(world, unit));
  if (producers.length === 0 || others.length > 0) {
    return false;
  }
  for (const producer of producers) {
    issueRallyPointOrder(world, producer.id, x, y);
  }
  return true;
}

export function issueSourceRightButtonOrder(world: WorldState, unitIds: string[], x: number, y: number, queue = false, playerId = world.visibilityPlayer): boolean {
  if (world.engineSettings.rightButtonAction !== "attack") {
    return queue
      ? issueGroupQueueSmartOrder(world, unitIds, x, y, playerId)
      : issueGroupSmartOrRallyOrder(world, unitIds, x, y, playerId);
  }
  const targetIssued = queue
    ? issueGroupQueueAttackTargetAtOrder(world, unitIds, x, y, playerId)
    : issueGroupAttackTargetAtOrder(world, unitIds, x, y, playerId);
  if (targetIssued) {
    return true;
  }
  return queue
    ? issueGroupQueueAttackMoveOrder(world, unitIds, x, y, playerId)
    : issueGroupAttackMoveOrder(world, unitIds, x, y, playerId);
}

export function issueGroupAttackMoveOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  const movableUnits = selectedUnitsForPlayer(world, unitIds, playerId);
  if (movableUnits.length === 0) {
    return false;
  }
  const destinations = formationDestinations(world, movableUnits, x, y);
  let issued = false;
  movableUnits.forEach((unit) => {
    const destination = destinations.get(unit.id) ?? { x, y };
    issued = (canIssueCombatMoveAt(world, unit, destination.x, destination.y) && issueAttackMoveOrder(world, unit.id, destination.x, destination.y)) || issued;
  });
  return issued;
}

export function issueGroupQueueAttackMoveOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  const movableUnits = selectedUnitsForPlayer(world, unitIds, playerId);
  if (movableUnits.length === 0) {
    return false;
  }
  const destinations = formationDestinations(world, movableUnits, x, y);
  let issued = false;
  movableUnits.forEach((unit) => {
    const destination = destinations.get(unit.id) ?? { x, y };
    issued = (canIssueQueueCombatMoveAt(world, unit, destination.x, destination.y) && issueQueueAttackMoveOrder(world, unit.id, destination.x, destination.y)) || issued;
  });
  return issued;
}

export function issueGroupPatrolOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  const movableUnits = selectedUnitsForPlayer(world, unitIds, playerId);
  if (movableUnits.length === 0) {
    return false;
  }
  const destinations = formationDestinations(world, movableUnits, x, y);
  let issued = false;
  movableUnits.forEach((unit) => {
    const destination = destinations.get(unit.id) ?? { x, y };
    issued = (canIssuePatrolAt(world, unit, destination.x, destination.y) && issuePatrolOrder(world, unit.id, destination.x, destination.y)) || issued;
  });
  return issued;
}

export function issueGroupQueuePatrolOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  const movableUnits = selectedUnitsForPlayer(world, unitIds, playerId);
  if (movableUnits.length === 0) {
    return false;
  }
  const destinations = formationDestinations(world, movableUnits, x, y);
  let issued = false;
  movableUnits.forEach((unit) => {
    const destination = destinations.get(unit.id) ?? { x, y };
    issued = (canIssueQueuePatrolAt(world, unit, destination.x, destination.y) && issueQueuePatrolOrder(world, unit.id, destination.x, destination.y)) || issued;
  });
  return issued;
}

export function issueGroupAttackGroundOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  const artillery = selectedUnitsForPlayer(world, unitIds, playerId);
  if (artillery.length === 0) {
    return false;
  }
  let issued = false;
  artillery.forEach((unit) => {
    issued = (canIssueAttackGroundAt(world, unit, x, y) && issueAttackGroundOrder(world, unit.id, x, y)) || issued;
  });
  return issued;
}

export function issueGroupQueueAttackGroundOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  const artillery = selectedUnitsForPlayer(world, unitIds, playerId);
  if (artillery.length === 0) {
    return false;
  }
  let issued = false;
  artillery.forEach((unit) => {
    issued = (canIssueQueueAttackGroundAt(world, unit, x, y) && issueQueueAttackGroundOrder(world, unit.id, x, y)) || issued;
  });
  return issued;
}

export function issueGroupAttackTargetAtOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  let issued = false;
  for (const unit of selectedUnitsForPlayer(world, unitIds, playerId)) {
    if (canIssueAttackTargetAt(world, unit, x, y)) {
      issued = issueAttackTargetAtOrder(world, unit.id, x, y) || issued;
    }
  }
  return issued;
}

export function issueGroupQueueAttackTargetAtOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  let issued = false;
  for (const unit of selectedUnitsForPlayer(world, unitIds, playerId)) {
    const target = findVisibleEnemyAt(world, unit.id, x, y);
    if (target && canIssueQueueAttackTarget(world, unit, target)) {
      issued = issueQueueAttackOrder(world, unit.id, target.id) || issued;
    }
  }
  return issued;
}

export function issueGroupFollowOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  let issued = false;
  for (const unit of selectedUnitsForPlayer(world, unitIds, playerId)) {
    if (canIssueFollowAt(world, unit, x, y)) {
      issued = issueFollowAtOrder(world, unit.id, x, y) || issued;
    }
  }
  return issued;
}

export function issueGroupQueueFollowOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  let issued = false;
  for (const unit of selectedUnitsForPlayer(world, unitIds, playerId)) {
    const target = findFriendlyFollowTargetAt(world, unit, x, y);
    if (target && canIssueQueueFollowTarget(world, unit, target)) {
      issued = issueQueueFollowOrder(world, unit.id, target.id) || issued;
    }
  }
  return issued;
}

export function issueGroupQueueDefendTargetOrder(world: WorldState, unitIds: string[], targetId: string, playerId = world.visibilityPlayer): boolean {
  const target = findUnit(world, targetId);
  if (!target) {
    return false;
  }
  let issued = false;
  for (const unit of selectedUnitsForPlayer(world, unitIds, playerId)) {
    if (canIssueQueueDefendTarget(world, unit, target)) {
      issued = issueQueueDefendOrder(world, unit.id, target.id) || issued;
    }
  }
  return issued;
}

export function issueGroupQueueLoadIntoTransportOrder(world: WorldState, unitIds: string[], transportId: string, playerId = world.visibilityPlayer): boolean {
  const transport = findUnit(world, transportId);
  if (!transport) {
    return false;
  }
  let issued = false;
  for (const unit of selectedUnitsForPlayer(world, unitIds, playerId)) {
    if (canIssueQueueLoadIntoTransportTarget(world, unit, transport)) {
      issued = issueQueueLoadIntoTransportOrder(world, unit.id, transport.id) || issued;
    }
  }
  return issued;
}

export function issueGroupRepairOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  const workers = selectedUnitsForPlayer(world, unitIds, playerId)
    .filter((unit) => canIssueRepairAt(world, unit, x, y));
  let issued = false;
  for (const worker of workers) {
    issued = issueRepairAtOrder(world, worker.id, x, y) || issued;
  }
  return issued;
}

export function issueGroupQueueRepairOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  const workers = selectedUnitsForPlayer(world, unitIds, playerId);
  let issued = false;
  for (const worker of workers) {
    const target = findFriendlyRepairTargetAt(world, worker, x, y);
    if (target && canIssueQueueRepairTarget(world, worker, target)) {
      issued = issueQueueRepairOrder(world, worker.id, target.id) || issued;
    }
  }
  return issued;
}

export function issueRepairOrder(world: WorldState, unitId: string, targetId: string): boolean {
  const unit = findUnit(world, unitId);
  const target = findUnit(world, targetId);
  if (!unit || !target || !canIssueRepairTarget(world, unit, target)) {
    return false;
  }
  const path = findPath(world, unit, target.x, target.y);
  if (target.construction) {
    if (target.construction.builderInside) {
      return false;
    }
    const previousBuilder = target.construction.builderId ? findUnit(world, target.construction.builderId) : undefined;
    if (previousBuilder && previousBuilder.id !== unit.id && previousBuilder.order?.kind === "build" && previousBuilder.order.targetId === target.id) {
      previousBuilder.order = null;
    }
    target.construction.builderId = unit.id;
    unit.order = {
      kind: "build",
      targetId,
      targetX: target.x,
      targetY: target.y,
      buildCycle: 0,
      path,
      pathIndex: path.length > 1 ? 1 : 0
    };
    return true;
  }
  unit.order = {
    kind: "repair",
    targetId,
    targetX: target.x,
    targetY: target.y,
    repairCycle: 0,
    path,
    pathIndex: path.length > 1 ? 1 : 0
  };
  return true;
}

export function issueRepairAtOrder(world: WorldState, unitId: string, x: number, y: number): boolean {
  const unit = findUnit(world, unitId);
  const target = unit ? findFriendlyRepairTargetAt(world, unit, x, y) : undefined;
  return target ? issueRepairOrder(world, unitId, target.id) : false;
}

export function canIssueRepairAt(world: WorldState, worker: WorldUnit, x: number, y: number): boolean {
  return Boolean(findFriendlyRepairTargetAt(world, worker, x, y));
}

export function canIssueRepairTarget(world: WorldState, worker: WorldUnit, target: WorldUnit): boolean {
  return canRepairTarget(worker, target, world)
    && (isInRepairRange(worker, target) || findPath(world, worker, target.x, target.y).length > 0);
}

export function canIssueQueueRepairTarget(world: WorldState, worker: WorldUnit, target: WorldUnit): boolean {
  if (!canRepairTarget(worker, target, world)) {
    return false;
  }
  const origin = queuedPathOrigin(worker);
  const pathingWorker = origin ? { ...worker, x: origin.x, y: origin.y } : worker;
  return isInRepairRange(pathingWorker, target) || findPath(world, pathingWorker, target.x, target.y).length > 0;
}

export function canSelectedIssueRepairAt(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  return unitIds
    .map((id) => findUnit(world, id))
    .some((unit): boolean => Boolean(unit
      && unit.player === playerId
      && canIssueRepairAt(world, unit, x, y)));
}

export function issueLoadIntoTransportOrder(world: WorldState, unitId: string, transportId: string): boolean {
  const unit = findUnit(world, unitId);
  const transport = findUnit(world, transportId);
  if (!unit || !transport || !canIssueLoadIntoTransportTarget(world, unit, transport)) {
    return false;
  }
  const path = findPath(world, unit, transport.x, transport.y);
  unit.moveQueue = [];
  unit.order = {
    kind: "load-transport",
    targetId: transport.id,
    boardState: "move",
    boardRange: 1,
    boardWaitTicks: 0,
    targetX: transport.x,
    targetY: transport.y,
    path,
    pathIndex: path.length > 1 ? 1 : 0
  };
  return true;
}

export function canIssueLoadIntoTransportTarget(world: WorldState, unit: WorldUnit, transport: WorldUnit): boolean {
  return canTargetTransportForLoading(transport, unit)
    && (canLoadIntoTransport(transport, unit) || findPath(world, unit, transport.x, transport.y).length > 0);
}

export function canIssueQueueLoadIntoTransportTarget(world: WorldState, unit: WorldUnit, transport: WorldUnit): boolean {
  if (!canTargetTransportForLoading(transport, unit)) {
    return false;
  }
  const origin = queuedPathOrigin(unit);
  const pathingUnit = origin ? { ...unit, x: origin.x, y: origin.y } : unit;
  return canLoadIntoTransport(transport, pathingUnit) || findPath(world, pathingUnit, transport.x, transport.y).length > 0;
}

export function issueFollowOrder(world: WorldState, unitId: string, targetId: string): boolean {
  const unit = findUnit(world, unitId);
  const target = findUnit(world, targetId);
  if (!unit || !target || !canIssueFollowTarget(world, unit, target)) {
    return false;
  }
  const path = findPath(world, unit, target.x, target.y);
  unit.moveQueue = [];
  unit.order = {
    kind: "follow",
    targetId: target.id,
    attackTargetId: null,
    followRange: 1,
    targetX: target.x,
    targetY: target.y,
    path,
    pathIndex: path.length > 1 ? 1 : 0
  };
  return true;
}

export function issueFollowAtOrder(world: WorldState, unitId: string, x: number, y: number): boolean {
  const unit = findUnit(world, unitId);
  const target = unit ? findFriendlyFollowTargetAt(world, unit, x, y) : undefined;
  return target ? issueFollowOrder(world, unitId, target.id) : false;
}

export function issueQueueFollowAtOrder(world: WorldState, unitId: string, x: number, y: number): boolean {
  const unit = findUnit(world, unitId);
  const target = unit ? findFriendlyFollowTargetAt(world, unit, x, y) : undefined;
  return target ? issueQueueFollowOrder(world, unitId, target.id) : false;
}

export function issueDefendOrder(world: WorldState, unitId: string, targetId: string): boolean {
  const unit = findUnit(world, unitId);
  const target = findUnit(world, targetId);
  if (!unit || !target || !canIssueDefendTarget(world, unit, target)) {
    return false;
  }
  const path = canReceiveMoveOrders(unit) ? findFollowPathWithinSourceRange(world, unit, target, 1) : [];
  unit.moveQueue = [];
  unit.order = {
    kind: "defend",
    targetId: target.id,
    defendState: "moving",
    defendRange: 1,
    targetX: target.x,
    targetY: target.y,
    path,
    pathIndex: path.length > 1 ? 1 : 0
  };
  return true;
}

export function canIssueDefendTarget(world: WorldState, unit: WorldUnit, target: WorldUnit): boolean {
  return unit.id !== target.id
    && unit.player === target.player
    && unit.hitPoints > 0
    && target.hitPoints > 0
    && !unit.construction
    && !isUnitHiddenInConstruction(target)
    && isUnitVisibleToPlayer(world, target, unit.player)
    && (canReceiveMoveOrders(unit) || unit.canAttack || unit.autoRepairRange > 0 || unit.canCastSpells.length > 0);
}

export function canIssueFollowTarget(world: WorldState, unit: WorldUnit, target: WorldUnit): boolean {
  return canTargetFollow(unit, target, world)
    && (isInFollowRange(unit, target) || findPath(world, unit, target.x, target.y).length > 0);
}

export function canIssueQueueFollowTarget(world: WorldState, unit: WorldUnit, target: WorldUnit): boolean {
  if (!canTargetFollow(unit, target, world)) {
    return false;
  }
  const origin = queuedPathOrigin(unit);
  const pathingUnit = origin ? { ...unit, x: origin.x, y: origin.y } : unit;
  return isInFollowRange(pathingUnit, target) || findPath(world, pathingUnit, target.x, target.y).length > 0;
}

export function canIssueQueueDefendTarget(world: WorldState, unit: WorldUnit, target: WorldUnit): boolean {
  if (!canIssueDefendTarget(world, unit, target)) {
    return false;
  }
  if (!canReceiveMoveOrders(unit)) {
    return true;
  }
  const origin = queuedPathOrigin(unit);
  const pathingUnit = origin ? { ...unit, x: origin.x, y: origin.y } : unit;
  return isInFollowRange(pathingUnit, target) || findFollowPathWithinSourceRange(world, pathingUnit, target, 1).length > 0;
}

export function canIssueFollowAt(world: WorldState, unit: WorldUnit, x: number, y: number): boolean {
  const target = findFriendlyFollowTargetAt(world, unit, x, y);
  return Boolean(target && canIssueFollowTarget(world, unit, target));
}

export function issueRallyPointOrder(world: WorldState, producerId: string, x: number, y: number): boolean {
  const producer = findUnit(world, producerId);
  if (!producer || !canSetRallyPoint(world, producer)) {
    return false;
  }
  producer.rallyPoint = {
    x: Math.max(0, Math.min(world.map.width * world.tileSize, x)),
    y: Math.max(0, Math.min(world.map.height * world.tileSize, y))
  };
  return true;
}

export function issueHarvestOrder(world: WorldState, unitId: string, targetId: string): boolean {
  const unit = findUnit(world, unitId);
  const target = findUnit(world, targetId);
  const dropoff = unit ? findNearestDropoff(world, unit, "gold") : undefined;
  if (!unit || !target || !dropoff || !canGatherResource(unit, "gold") || !isGoldMine(target) || !isVisibleResourceSource(world, target, unit.player)) {
    return false;
  }

  const path = findPath(world, unit, target.x, target.y);
  if (path.length === 0 && !isInResourceRangePoint(unit, target.x, target.y, target.radius)) {
    return false;
  }
  const dropoffPoint = resourceDropoffTargetPoint(world, unit, dropoff);
  unit.moveQueue = [];
  unit.order = {
    kind: "harvest",
    targetId,
    resource: "gold",
      phase: "to-resource",
      targetX: target.x,
      targetY: target.y,
      tileX: null,
      tileY: null,
      dropoffId: dropoff.id,
      dropoffX: dropoffPoint.x,
      dropoffY: dropoffPoint.y,
    gatherSeconds: 0,
    returnSeconds: 0,
    path,
    pathIndex: path.length > 1 ? 1 : 0
  };
  return true;
}

export function canIssueQueueHarvestTarget(world: WorldState, unit: WorldUnit, target: WorldUnit): boolean {
  const resource: "gold" | "oil" | null = isGoldMine(target) ? "gold" : isOilPlatform(target) ? "oil" : null;
  if (!resource || !canGatherResource(unit, resource) || !isVisibleResourceSource(world, target, unit.player)) {
    return false;
  }
  if (resource === "oil" && target.player !== unit.player) {
    return false;
  }
  const dropoff = resource === "oil" ? findNearestOilDropoff(world, unit) : findNearestDropoff(world, unit, "gold");
  if (!dropoff) {
    return false;
  }
  const origin = queuedPathOrigin(unit);
  const pathingUnit = origin ? { ...unit, x: origin.x, y: origin.y } : unit;
  return isInResourceRangePoint(pathingUnit, target.x, target.y, target.radius) || findPath(world, pathingUnit, target.x, target.y).length > 0;
}

export function issueHarvestWoodOrder(world: WorldState, unitId: string, tileX: number, tileY: number): boolean {
  const unit = findUnit(world, unitId);
  const dropoff = unit ? findNearestDropoff(world, unit, "wood") : undefined;
  if (!unit || !dropoff || !canGatherResource(unit, "wood")) {
    return false;
  }
  const resolvedTile = resolveReachableWoodTileForUnit(world, unit, tileX, tileY);
  if (!resolvedTile) {
    return false;
  }
  tileX = resolvedTile.x;
  tileY = resolvedTile.y;
  const target = tileToWorldCenter(world, tileX, tileY);
  const path = findPath(world, unit, target.x, target.y);
  if (path.length === 0 && Math.hypot(target.x - unit.x, target.y - unit.y) > world.tileSize + unit.radius) {
    return false;
  }
  const dropoffPoint = resourceDropoffTargetPoint(world, unit, dropoff);
  unit.moveQueue = [];
  unit.order = {
    kind: "harvest",
    targetId: null,
    resource: "wood",
    phase: "to-resource",
    targetX: target.x,
    targetY: target.y,
    tileX,
    tileY,
    dropoffId: dropoff.id,
    dropoffX: dropoffPoint.x,
    dropoffY: dropoffPoint.y,
    gatherSeconds: 0,
    returnSeconds: 0,
    path,
    pathIndex: path.length > 1 ? 1 : 0
  };
  return true;
}

export function canIssueQueueHarvestWoodAt(world: WorldState, unit: WorldUnit, tileX: number, tileY: number): boolean {
  const tile = world.tiles[tileY * world.map.width + tileX] ?? 0;
  if (!canGatherResource(unit, "wood") || !isSourceHarvestableWoodTile(world, tile) || !findNearestDropoff(world, unit, "wood")) {
    return false;
  }
  const target = tileToWorldCenter(world, tileX, tileY);
  const origin = queuedPathOrigin(unit);
  const pathingUnit = origin ? { ...unit, x: origin.x, y: origin.y } : unit;
  return Math.hypot(target.x - pathingUnit.x, target.y - pathingUnit.y) <= world.tileSize + unit.radius
    || findPath(world, pathingUnit, target.x, target.y).length > 0;
}

export function canIssueQueueReturnGoodsOrder(world: WorldState, unit: WorldUnit, targetId: string | null = null): boolean {
  if (unit.resourcesHeld <= 0 || !isHarvestResource(unit.carriedResource)) {
    return false;
  }
  const dropoff = targetId ? findUnit(world, targetId) : findNearestDropoff(world, unit, unit.carriedResource);
  if (!dropoff || !canDropOffResourceAt(world, unit, dropoff, unit.carriedResource)) {
    return false;
  }
  const origin = queuedPathOrigin(unit);
  const pathingUnit = origin ? { ...unit, x: origin.x, y: origin.y } : unit;
  const dropoffPoint = resourceDropoffTargetPoint(world, pathingUnit, dropoff);
  return findPath(world, pathingUnit, dropoffPoint.x, dropoffPoint.y).length > 0
    || isInResourceDropoffRange(world, pathingUnit, dropoff);
}

export function issueHarvestOilOrder(world: WorldState, unitId: string, targetId: string): boolean {
  const unit = findUnit(world, unitId);
  const target = findUnit(world, targetId);
  const dropoff = unit ? findNearestOilDropoff(world, unit) : undefined;
  if (!unit || !target || !dropoff || !canGatherResource(unit, "oil") || !isOilPlatform(target) || target.player !== unit.player || !isVisibleResourceSource(world, target, unit.player)) {
    return false;
  }

  const path = findPath(world, unit, target.x, target.y);
  if (path.length === 0 && !isInResourceRangePoint(unit, target.x, target.y, target.radius)) {
    return false;
  }
  const dropoffPoint = resourceDropoffTargetPoint(world, unit, dropoff);
  unit.moveQueue = [];
  unit.order = {
    kind: "harvest",
    targetId,
    resource: "oil",
    phase: "to-resource",
    targetX: target.x,
    targetY: target.y,
    tileX: null,
    tileY: null,
    dropoffId: dropoff.id,
    dropoffX: dropoffPoint.x,
    dropoffY: dropoffPoint.y,
    gatherSeconds: 0,
    returnSeconds: 0,
    path,
    pathIndex: path.length > 1 ? 1 : 0
  };
  return true;
}

export function issueReturnGoodsOrder(world: WorldState, unitId: string): boolean {
  const unit = findUnit(world, unitId);
  if (!unit || unit.resourcesHeld <= 0 || !isHarvestResource(unit.carriedResource)) {
    return false;
  }
  const resource = unit.carriedResource;
  const dropoff = findNearestDropoff(world, unit, resource);
  if (!dropoff) {
    return false;
  }
  const dropoffPoint = resourceDropoffTargetPoint(world, unit, dropoff);
  const path = findPath(world, unit, dropoffPoint.x, dropoffPoint.y);
  if (path.length === 0 && !isInResourceDropoffRange(world, unit, dropoff)) {
    return false;
  }
  unit.moveQueue = [];
  unit.order = {
    kind: "harvest",
    targetId: null,
    resource,
    phase: "to-dropoff",
    targetX: dropoffPoint.x,
    targetY: dropoffPoint.y,
    tileX: null,
    tileY: null,
    dropoffId: dropoff.id,
    dropoffX: dropoffPoint.x,
    dropoffY: dropoffPoint.y,
    gatherSeconds: 0,
    returnSeconds: 0,
    path,
    pathIndex: path.length > 1 ? 1 : 0
  };
  return true;
}

export function issueAutoHarvestOrder(world: WorldState, unitId: string): boolean {
  const unit = findUnit(world, unitId);
  if (!unit) {
    return false;
  }
  if (canIssueReturnGoodsOrder(world, unit)) {
    return issueReturnGoodsOrder(world, unitId);
  }
  if (canGatherResource(unit, "oil")) {
    const platform = findNearestOwnedOilPlatform(world, unit);
    if (platform && issueHarvestOilOrder(world, unitId, platform.id)) {
      return true;
    }
  }
  if (canGatherResource(unit, "gold")) {
    const mine = findNearestGoldMine(world, unit);
    if (mine && issueHarvestOrder(world, unitId, mine.id)) {
      return true;
    }
  }
  if (canGatherResource(unit, "wood")) {
    const woodTile = findNearestWoodTile(world, unit);
    if (woodTile && issueHarvestWoodOrder(world, unitId, woodTile.x, woodTile.y)) {
      return true;
    }
  }
  return false;
}

export function canIssueAutoHarvestOrder(world: WorldState, unit: WorldUnit): boolean {
  if (canIssueReturnGoodsOrder(world, unit)) {
    return true;
  }
  return (canGatherResource(unit, "oil") && Boolean(findNearestOwnedOilPlatform(world, unit)))
    || (canGatherResource(unit, "gold") && Boolean(findNearestGoldMine(world, unit)))
    || (canGatherResource(unit, "wood") && Boolean(findNearestWoodTile(world, unit)));
}

export function canIssueReturnGoodsOrder(world: WorldState, unit: WorldUnit): boolean {
  if (unit.resourcesHeld <= 0 || !isHarvestResource(unit.carriedResource)) {
    return false;
  }
  const dropoff = findNearestDropoff(world, unit, unit.carriedResource);
  if (!dropoff) {
    return false;
  }
  const dropoffPoint = resourceDropoffTargetPoint(world, unit, dropoff);
  const path = findPath(world, unit, dropoffPoint.x, dropoffPoint.y);
  return path.length > 0 || isInResourceDropoffRange(world, unit, dropoff);
}

function issueReturnGoodsToDropoffOrder(world: WorldState, unitId: string, dropoffId: string): boolean {
  const unit = findUnit(world, unitId);
  const dropoff = findUnit(world, dropoffId);
  if (!unit || !dropoff || unit.resourcesHeld <= 0 || !isHarvestResource(unit.carriedResource) || !canDropOffResourceAt(world, unit, dropoff, unit.carriedResource)) {
    return false;
  }
  const dropoffPoint = resourceDropoffTargetPoint(world, unit, dropoff);
  const path = findPath(world, unit, dropoffPoint.x, dropoffPoint.y);
  if (path.length === 0 && !isInResourceDropoffRange(world, unit, dropoff)) {
    return false;
  }
  unit.moveQueue = [];
  unit.order = {
    kind: "harvest",
    targetId: null,
    resource: unit.carriedResource,
    phase: "to-dropoff",
    targetX: dropoffPoint.x,
    targetY: dropoffPoint.y,
    tileX: null,
    tileY: null,
    dropoffId: dropoff.id,
    dropoffX: dropoffPoint.x,
    dropoffY: dropoffPoint.y,
    gatherSeconds: 0,
    returnSeconds: 0,
    path,
    pathIndex: path.length > 1 ? 1 : 0
  };
  return true;
}

export function issueAttackOrder(world: WorldState, unitId: string, targetId: string): boolean {
  const unit = findUnit(world, unitId);
  const target = findUnit(world, targetId);
  if (!unit || !target || !canIssueAttackTargetWithPath(world, unit, target)) {
    return false;
  }
  const path = isInAttackRange(unit, target, world) ? [] : findPath(world, unit, target.x, target.y);
  unit.moveQueue = [];
  unit.order = {
    kind: "attack",
    targetId,
    targetX: target.x,
    targetY: target.y,
    path,
    pathIndex: path.length > 1 ? 1 : 0
  };
  return true;
}

export function issueAttackTargetAtOrder(world: WorldState, unitId: string, x: number, y: number): boolean {
  const target = findVisibleEnemyAt(world, unitId, x, y);
  return target ? issueAttackOrder(world, unitId, target.id) : false;
}

export function canIssueAttackTarget(world: WorldState, unit: WorldUnit, target: WorldUnit): boolean {
  return arePlayersEnemies(world, unit.player, target.player)
    && canAttackTarget(unit, target, world)
    && isUnitVisibleToPlayer(world, target, unit.player);
}

export function canIssueAttackTargetWithPath(world: WorldState, unit: WorldUnit, target: WorldUnit): boolean {
  return canIssueAttackTarget(world, unit, target)
    && (isInAttackRange(unit, target, world) || findPath(world, unit, target.x, target.y).length > 0);
}

export function canIssueAttackTargetAt(world: WorldState, unit: WorldUnit, x: number, y: number): boolean {
  const target = findVisibleEnemyNearPointForUnit(world, unit, x, y);
  return Boolean(target && canIssueAttackTarget(world, unit, target));
}

export function issueTrainWorkerOrder(world: WorldState, buildingId: string, unitDefinitions: WargusUnit[]): boolean {
  const building = findUnit(world, buildingId);
  if (!building || building.construction) {
    return false;
  }
  const sourceTrained = issueSourceTrainByRole(world, building, isGoldOrWoodWorkerDefinition);
  if (sourceTrained !== null) {
    return sourceTrained;
  }
  if (!isTownCenter(building)) {
    return false;
  }

  const race = world.players.find((player) => player.id === building.player)?.race;
  const sourceWorkerTypeId = fallbackWorkerUnitTypeForPlayer(world, building.player, race);
  const unitTypeId = sourceWorkerTypeId ?? (race === "human" ? "unit-peasant" : "unit-peon");
  return issueTrainUnitOrder(world, buildingId, unitTypeId, unitDefinitions);
}

export function issueUpgradeTownCenterOrder(world: WorldState, buildingId: string, unitDefinitions: WargusUnit[]): boolean {
  const building = findUnit(world, buildingId);
  if (!building || !isTownCenter(building) || building.construction || building.productionQueue.length > 0) {
    return false;
  }
  const upgradeTypeId = sourceUpgradeTargetForBuilding(world, building) ?? (hasSourceUpgradeButtonsForBuilding(world, building) ? null : nextTownCenterTypeId(building.typeId));
  if (!upgradeTypeId) {
    return false;
  }
  if (!canSourceUpgradeToType(world, building, upgradeTypeId)) {
    return false;
  }
  return issueTrainUnitOrder(world, buildingId, upgradeTypeId, unitDefinitions);
}

export function issueUpgradeTowerOrder(world: WorldState, buildingId: string, role: "guard" | "cannon", unitDefinitions: WargusUnit[]): boolean {
  const building = findUnit(world, buildingId);
  if (!building || building.construction || building.productionQueue.length > 0) {
    return false;
  }
  const sourceUpgradeTypeId = sourceUpgradeTargetForBuilding(world, building, role);
  if (!sourceUpgradeTypeId || !canSourceUpgradeToType(world, building, sourceUpgradeTypeId)) {
    return false;
  }
  return issueTrainUnitOrder(world, buildingId, sourceUpgradeTypeId, unitDefinitions);
}

export function issueTrainBarracksUnitOrder(world: WorldState, buildingId: string, role: "melee" | "ranged", unitDefinitions: WargusUnit[]): boolean {
  const building = findUnit(world, buildingId);
  if (!building || building.construction) {
    return false;
  }
  const matchesRole = (definition: WargusUnit) => (
    isOrdinaryBarracksCombatDefinition(definition)
    && (role === "ranged" ? isRangedLandCombatDefinition(definition) : isMeleeLandCombatDefinition(definition))
    && !isSourceConversionTarget(world, definition.id)
  );
  const sourceTrained = issueSourceTrainByRole(world, building, matchesRole);
  if (sourceTrained !== null) {
    return sourceTrained;
  }
  if (!isBarracks(world, building)) {
    return false;
  }
  const race = world.players.find((player) => player.id === building.player)?.race;
  const sourceRoleUnitTypeId = firstTrainableUnitTypeByRole(world, building, unitDefinitions, matchesRole);
  const unitTypeId = sourceRoleUnitTypeId ?? (role === "ranged"
    ? race === "human" ? "unit-archer" : "unit-axethrower"
    : race === "human" ? "unit-footman" : "unit-grunt");
  return issueTrainUnitOrder(world, buildingId, unitTypeId, unitDefinitions);
}

export function issueTrainAdvancedUnitOrder(world: WorldState, buildingId: string, unitDefinitions: WargusUnit[]): boolean {
  const building = findUnit(world, buildingId);
  if (!building || building.construction) {
    return false;
  }
  const sourceTrained = issueSourceTrainByRole(world, building, isAdvancedMeleeCombatDefinition);
  if (sourceTrained !== null) {
    return sourceTrained;
  }
  if (!isAdvancedMeleeProducer(world, building)) {
    return false;
  }
  const race = world.players.find((player) => player.id === building.player)?.race;
  const sourceRoleUnitTypeId = firstTrainableUnitTypeByRole(world, building, unitDefinitions, isAdvancedMeleeCombatDefinition);
  const unitTypeId = sourceRoleUnitTypeId ?? (race === "human" ? "unit-knight" : "unit-ogre");
  return issueTrainUnitOrder(world, buildingId, unitTypeId, unitDefinitions);
}

export function issueTrainNavalUnitOrder(world: WorldState, buildingId: string, role: "tanker" | "destroyer" | "warship" | "transport" | "submarine", unitDefinitions: WargusUnit[]): boolean {
  const building = findUnit(world, buildingId);
  if (!building || building.construction) {
    return false;
  }
  const sourceTrained = issueSourceTrainByRole(world, building, (definition) => isNavalRoleDefinition(definition, role));
  if (sourceTrained !== null) {
    return sourceTrained;
  }
  if (!isShipyard(world, building)) {
    return false;
  }
  const race = world.players.find((player) => player.id === building.player)?.race;
  const sourceRoleUnitTypeId = firstTrainableUnitTypeByRole(world, building, unitDefinitions, (definition) => isNavalRoleDefinition(definition, role));
  const unitTypeId = sourceRoleUnitTypeId ?? navalUnitForRole(role, race);
  return issueTrainUnitOrder(world, buildingId, unitTypeId, unitDefinitions);
}

export function issueTrainCasterOrder(world: WorldState, buildingId: string, unitDefinitions: WargusUnit[]): boolean {
  const building = findUnit(world, buildingId);
  if (!building || building.construction) {
    return false;
  }
  const sourceTrained = issueSourceTrainByRole(world, building, isCasterDefinition);
  if (sourceTrained !== null) {
    return sourceTrained;
  }
  if (!isCasterProducer(world, building)) {
    return false;
  }
  const race = world.players.find((player) => player.id === building.player)?.race;
  const sourceRoleUnitTypeId = firstTrainableUnitTypeByRole(world, building, unitDefinitions, isCasterDefinition);
  const unitTypeId = sourceRoleUnitTypeId ?? (race === "human" ? "unit-mage" : "unit-death-knight");
  return issueTrainUnitOrder(world, buildingId, unitTypeId, unitDefinitions);
}

export function issueTrainAirUnitOrder(world: WorldState, buildingId: string, unitDefinitions: WargusUnit[]): boolean {
  const building = findUnit(world, buildingId);
  if (!building || building.construction) {
    return false;
  }
  const sourceTrained = issueSourceTrainByRole(world, building, isAirCombatDefinition);
  if (sourceTrained !== null) {
    return sourceTrained;
  }
  if (!isAirProducer(world, building)) {
    return false;
  }
  const race = world.players.find((player) => player.id === building.player)?.race;
  const sourceRoleUnitTypeId = firstTrainableUnitTypeByRole(world, building, unitDefinitions, isAirCombatDefinition);
  const unitTypeId = sourceRoleUnitTypeId ?? (race === "human" ? "unit-gryphon-rider" : "unit-dragon");
  return issueTrainUnitOrder(world, buildingId, unitTypeId, unitDefinitions);
}

export function isScoutAirDefinition(definition: WargusUnit): boolean {
  return Boolean(definition.airUnit || definition.type === "fly") && !definition.canAttack && isExploreOnReadyValue(definition.onReady);
}

export function issueTrainDemolitionOrder(world: WorldState, buildingId: string, unitDefinitions: WargusUnit[]): boolean {
  const building = findUnit(world, buildingId);
  if (!building || building.construction) {
    return false;
  }
  const sourceTrained = issueSourceTrainByRole(world, building, isDemolitionUnitDefinition);
  if (sourceTrained !== null) {
    return sourceTrained;
  }
  if (!isDemolitionProducer(world, building)) {
    return false;
  }
  const race = world.players.find((player) => player.id === building.player)?.race;
  const sourceRoleUnitTypeId = firstTrainableUnitTypeByRole(world, building, unitDefinitions, isDemolitionUnitDefinition);
  const unitTypeId = sourceRoleUnitTypeId ?? (race === "human" ? "unit-dwarves" : "unit-goblin-sappers");
  return issueTrainUnitOrder(world, buildingId, unitTypeId, unitDefinitions);
}

export function issueTrainScoutAirOrder(world: WorldState, buildingId: string, unitDefinitions: WargusUnit[]): boolean {
  const building = findUnit(world, buildingId);
  if (!building || building.construction) {
    return false;
  }
  const sourceTrained = issueSourceTrainByRole(world, building, isScoutAirDefinition);
  if (sourceTrained !== null) {
    return sourceTrained;
  }
  if (!isDemolitionProducer(world, building)) {
    return false;
  }
  const race = world.players.find((player) => player.id === building.player)?.race;
  const sourceRoleUnitTypeId = firstTrainableUnitTypeByRole(world, building, unitDefinitions, isScoutAirDefinition);
  const unitTypeId = sourceRoleUnitTypeId ?? (race === "human" ? "unit-balloon" : "unit-zeppelin");
  return issueTrainUnitOrder(world, buildingId, unitTypeId, unitDefinitions);
}

export function issueTrainSiegeUnitOrder(world: WorldState, buildingId: string, unitDefinitions: WargusUnit[]): boolean {
  const building = findUnit(world, buildingId);
  if (!building || building.construction) {
    return false;
  }
  const sourceTrained = issueSourceTrainByRole(world, building, isSiegeDefinition);
  if (sourceTrained !== null) {
    return sourceTrained;
  }
  if (!isDemolitionProducer(world, building)) {
    return false;
  }
  const race = world.players.find((player) => player.id === building.player)?.race;
  const sourceRoleUnitTypeId = firstTrainableUnitTypeByRole(world, building, unitDefinitions, isSiegeDefinition);
  const unitTypeId = sourceRoleUnitTypeId ?? (race === "human" ? "unit-ballista" : "unit-catapult");
  return issueTrainUnitOrder(world, buildingId, unitTypeId, unitDefinitions);
}

export function issueDetonateOrder(world: WorldState, unitId: string): boolean {
  const unit = findUnit(world, unitId);
  if (!unit || !canIssueDetonateOrder(world, unit) || unit.hitPoints <= 0) {
    return false;
  }
  detonateDemolitionUnit(world, unit, sourceDemolishSpellIdForUnit(world, unit));
  return true;
}

export function canIssueDetonateOrder(world: WorldState, unit: WorldUnit): boolean {
  return Boolean(sourceDemolishSpellForUnit(world, unit) || unit.volatile);
}

export function registerUnitClick(world: WorldState, unitId: string, clickAtMs = 0, isOnlySelected = false): boolean {
  const unit = findUnit(world, unitId);
  if (!unit || unit.hitPoints <= 0 || unit.clicksToExplode <= 0) {
    return false;
  }
  unit.lastExplodeClickAtMs = clickAtMs;
  unit.explodeClickCount = isOnlySelected
    ? Math.min(unit.clicksToExplode, unit.explodeClickCount + 1)
    : 1;
  if (unit.explodeClickCount < unit.clicksToExplode) {
    return false;
  }
  detonateClickExplosiveUnit(world, unit);
  return true;
}

export function issueHealOrder(world: WorldState, casterId: string): boolean {
  const caster = findUnit(world, casterId);
  if (!caster || !canUnitCastSpellId(caster, "spell-healing") || !hasSpellResearch(world, caster.player, "spell-healing", "upgrade-healing")) {
    return false;
  }
  if (!canCastSpell(world, caster, "spell-healing", "upgrade-healing", 6)) {
    return false;
  }
  const range = spellAiRangeTiles(world, "spell-healing", 6);
  const target = world.units
    .filter((unit) => arePlayersAllied(world, caster.player, unit.player) && unit.player !== 15 && canHealTarget(unit))
    .filter((unit) => unitMatchesSourceCastConditions(world, "spell-healing", unit, caster))
    .filter((unit) => Math.hypot(unit.x - caster.x, unit.y - caster.y) <= range * world.tileSize)
    .sort((a, b) => (a.hitPoints / a.maxHitPoints) - (b.hitPoints / b.maxHitPoints))[0];
  return castHealAt(world, caster, target);
}

function issueSourceAdjustVitalsOrder(world: WorldState, casterId: string, spellId: string): boolean {
  const caster = findUnit(world, casterId);
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  if (!caster || !spell || !canUnitCastSpellId(caster, spellId) || !canCastSpell(world, caster, spellId, spell.dependUpgrade, spell.manaCost)) {
    return false;
  }
  const range = spellAiRangeTiles(world, spellId, typeof spell.range === "number" ? spell.range : 6);
  const amount = spellHitPointAdjust(world, spellId, 0);
  const target = (amount >= 0 ? findNearestFriendlySpellTarget : findNearestEnemyInSpellRange)(
    world,
    caster,
    range,
    (unit) => spellTargetMatchesSource(world, spellId, caster, unit, (candidate) => candidate.hitPoints > 0 && (amount >= 0 ? candidate.hitPoints < candidate.maxHitPoints : true)),
    sourceSpellAiPriority(world, spellId)
  );
  return target ? castSourceAdjustVitalsAt(world, caster, spellId, target.x, target.y) : false;
}

export function issueExorcismOrder(world: WorldState, casterId: string): boolean {
  const caster = findUnit(world, casterId);
  if (!caster || !canUnitCastSpellId(caster, "spell-exorcism") || !hasSpellResearch(world, caster.player, "spell-exorcism", "upgrade-exorcism") || !canCastSpell(world, caster, "spell-exorcism", "upgrade-exorcism", 4)) {
    return false;
  }
  const target = findNearestEnemyInSpellRange(world, caster, spellAiRangeTiles(world, "spell-exorcism", 10), (unit) => spellTargetMatchesSource(world, "spell-exorcism", caster, unit, canExorcismTarget), sourceSpellAiPriority(world, "spell-exorcism"));
  return castExorcismAt(world, caster, target);
}

export function issueHolyVisionOrder(world: WorldState, casterId: string): boolean {
  const caster = findUnit(world, casterId);
  if (!caster || !canUnitCastSpellId(caster, "spell-holy-vision") || !hasSpellResearch(world, caster.player, "spell-holy-vision", "upgrade-holy-vision")) {
    return false;
  }
  const { x, y } = sourceHolyVisionAutocastPoint(world, caster);
  return castHolyVisionAt(world, caster, x, y);
}

function sourceHolyVisionAutocastPoint(world: WorldState, caster: WorldUnit): { x: number; y: number } {
  const callback = sourcePositionAutocastCallback(world, "spell-holy-vision");
  if (callback && callback !== "SpellHolyVision") {
    return { x: caster.x, y: caster.y };
  }
  const maxTileX = Math.max(1, world.map.width - 1);
  const maxTileY = Math.max(1, world.map.height - 1);
  const hash = Math.abs(deterministicHash(`${world.tick}:${caster.id}:spell-holy-vision`));
  return {
    x: (1 + (hash % maxTileX)) * world.tileSize + world.tileSize / 2,
    y: (1 + (Math.floor(hash / maxTileX) % maxTileY)) * world.tileSize + world.tileSize / 2
  };
}

function sourcePositionAutocastCallback(world: WorldState, spellId: string): string | null {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  return spell?.aiCastPositionCallback ?? spell?.autocastPositionCallback ?? null;
}

function sourcePositionAutocastTarget(
  world: WorldState,
  caster: WorldUnit,
  spellId: string,
  fallbackRange: number,
  predicate: (unit: WorldUnit) => boolean = () => true
): WorldUnit | undefined {
  const callback = sourcePositionAutocastCallback(world, spellId);
  return findNearestEnemyInSpellRange(
    world,
    caster,
    spellAiRangeTiles(world, spellId, fallbackRange),
    (unit) => predicate(unit) && (callback !== "SpellBlizzard" || unitMatchesSourceCastConditions(world, spellId, unit, caster)),
    sourceSpellAiPriority(world, spellId)
  );
}

export function issueFireballOrder(world: WorldState, casterId: string): boolean {
  const spellId = "spell-fireball";
  const caster = findUnit(world, casterId);
  if (!caster || !canUnitCastSpellId(caster, spellId) || !hasSpellResearch(world, caster.player, spellId, "upgrade-fireball")) {
    return false;
  }
  const target = sourcePositionAutocastTarget(world, caster, spellId, 8);
  if (!target) {
    return false;
  }
  return castFireballAt(world, caster, target.x, target.y);
}

export function issueFlameShieldOrder(world: WorldState, casterId: string): boolean {
  const spellId = "spell-flame-shield";
  const caster = findUnit(world, casterId);
  if (!caster || !canUnitCastSpellId(caster, spellId) || !hasSpellResearch(world, caster.player, spellId, "upgrade-flame-shield")) {
    return false;
  }
  const target = findNearestFriendlySpellTarget(world, caster, spellAiRangeTiles(world, spellId, 6), (unit) => canFlameShieldTarget(unit) && unitMatchesSourceCastConditions(world, spellId, unit, caster), sourceSpellAiPriority(world, spellId));
  return castFlameShieldAt(world, caster, target);
}

export function issueBlizzardOrder(world: WorldState, casterId: string): boolean {
  const spellId = "spell-blizzard";
  const caster = findUnit(world, casterId);
  if (!caster || !canUnitCastSpellId(caster, spellId) || !hasSpellResearch(world, caster.player, spellId, "upgrade-blizzard")) {
    return false;
  }
  const target = sourcePositionAutocastTarget(world, caster, spellId, 12);
  if (!target) {
    return false;
  }
  return castBlizzardAt(world, caster, target.x, target.y);
}

export function issuePolymorphOrder(world: WorldState, casterId: string): boolean {
  const caster = findUnit(world, casterId);
  if (!caster || !canUnitCastSpellId(caster, "spell-polymorph") || !hasSpellResearch(world, caster.player, "spell-polymorph", "upgrade-polymorph")) {
    return false;
  }
  const target = findNearestEnemyInSpellRange(world, caster, spellAiRangeTiles(world, "spell-polymorph", 10), (unit) => canPolymorphTarget(unit) && unitMatchesSourceCastConditions(world, "spell-polymorph", unit, caster), sourceSpellAiPriority(world, "spell-polymorph"));
  return castPolymorphAt(world, caster, target);
}

export function issueSlowOrder(world: WorldState, casterId: string): boolean {
  const caster = findUnit(world, casterId);
  if (!caster || !canUnitCastSpellId(caster, "spell-slow") || !hasSpellResearch(world, caster.player, "spell-slow", "upgrade-slow")) {
    return false;
  }
  const target = findNearestEnemyInSpellRange(world, caster, spellAiRangeTiles(world, "spell-slow", 10), (unit) => canSlowTarget(unit) && unitMatchesSourceCastConditions(world, "spell-slow", unit, caster), sourceSpellAiPriority(world, "spell-slow"));
  return castSlowAt(world, caster, target);
}

export function issueInvisibilityOrder(world: WorldState, casterId: string): boolean {
  const caster = findUnit(world, casterId);
  if (!caster || !canUnitCastSpellId(caster, "spell-invisibility") || !hasSpellResearch(world, caster.player, "spell-invisibility", "upgrade-invisibility")) {
    return false;
  }
  const target = findNearestFriendlySpellTarget(world, caster, spellAiRangeTiles(world, "spell-invisibility", 6), (unit) => canInvisibilityTarget(unit) && unitMatchesSourceCastConditions(world, "spell-invisibility", unit, caster), sourceSpellAiPriority(world, "spell-invisibility"));
  return castInvisibilityAt(world, caster, target);
}

export function issueDeathCoilOrder(world: WorldState, casterId: string): boolean {
  const caster = findUnit(world, casterId);
  if (!caster || !canUnitCastSpellId(caster, "spell-death-coil") || !hasSpellResearch(world, caster.player, "spell-death-coil", "upgrade-death-coil")) {
    return false;
  }
  const target = sourceDeathCoilAutocastTarget(world, caster);
  return castDeathCoilAt(world, caster, target);
}

export function issueDeathAndDecayOrder(world: WorldState, casterId: string): boolean {
  const spellId = "spell-death-and-decay";
  const caster = findUnit(world, casterId);
  if (!caster || !canUnitCastSpellId(caster, spellId) || !hasSpellResearch(world, caster.player, spellId, "upgrade-death-and-decay")) {
    return false;
  }
  const target = sourcePositionAutocastTarget(world, caster, spellId, 12);
  if (!target) {
    return false;
  }
  return castDeathAndDecayAt(world, caster, target.x, target.y);
}

export function issueWhirlwindOrder(world: WorldState, casterId: string): boolean {
  const spellId = "spell-whirlwind";
  const caster = findUnit(world, casterId);
  if (!caster || !canUnitCastSpellId(caster, spellId) || !hasSpellResearch(world, caster.player, spellId, "upgrade-whirlwind")) {
    return false;
  }
  const target = sourcePositionAutocastTarget(world, caster, spellId, 12, (unit) => canWhirlwindTarget(caster, unit, world));
  if (!target) {
    return false;
  }
  return castWhirlwindAt(world, caster, target.x, target.y);
}

export function issueRaiseDeadOrder(world: WorldState, casterId: string): boolean {
  const spellId = "spell-raise-dead";
  const caster = findUnit(world, casterId);
  if (!caster || !canUnitCastSpellId(caster, spellId) || !hasSpellResearch(world, caster.player, spellId, "upgrade-raise-dead")) {
    return false;
  }
  const corpse = sourceRaiseDeadAutocastCorpse(world, caster, spellId);
  if (!corpse) {
    return false;
  }
  return castRaiseDeadAt(world, caster, corpse.x, corpse.y);
}

export function issueUnholyArmorOrder(world: WorldState, casterId: string): boolean {
  const caster = findUnit(world, casterId);
  if (!caster || !canUnitCastSpellId(caster, "spell-unholy-armor") || !hasSpellResearch(world, caster.player, "spell-unholy-armor", "upgrade-unholy-armor")) {
    return false;
  }
  const target = findNearestFriendlySpellTarget(world, caster, spellAiRangeTiles(world, "spell-unholy-armor", 6), (unit) => canUnholyArmorTarget(unit) && unitMatchesSourceCastConditions(world, "spell-unholy-armor", unit, caster), sourceSpellAiPriority(world, "spell-unholy-armor"));
  return castUnholyArmorAt(world, caster, target);
}

export function issueHasteOrder(world: WorldState, casterId: string): boolean {
  const caster = findUnit(world, casterId);
  if (!caster || !canUnitCastSpellId(caster, "spell-haste") || !hasSpellResearch(world, caster.player, "spell-haste", "upgrade-haste")) {
    return false;
  }
  const range = spellAiRangeTiles(world, "spell-haste", 6);
  const target = world.units
    .filter((unit) => unit.player === caster.player && canHasteTarget(unit) && unitMatchesSourceCastConditions(world, "spell-haste", unit, caster))
    .filter((unit) => Math.hypot(unit.x - caster.x, unit.y - caster.y) <= range * world.tileSize)
    .sort((a, b) => compareSourceSpellTargets(world, caster, a, b, sourceSpellAiPriority(world, "spell-haste")))[0];
  return castHasteAt(world, caster, target);
}

export function issueBloodlustOrder(world: WorldState, casterId: string): boolean {
  const caster = findUnit(world, casterId);
  if (!caster || !canUnitCastSpellId(caster, "spell-bloodlust") || !hasSpellResearch(world, caster.player, "spell-bloodlust", "upgrade-bloodlust")) {
    return false;
  }
  const range = spellAiRangeTiles(world, "spell-bloodlust", 6);
  const target = world.units
    .filter((unit) => unit.player === caster.player && canBloodlustTarget(unit) && unitMatchesSourceCastConditions(world, "spell-bloodlust", unit, caster))
    .filter((unit) => Math.hypot(unit.x - caster.x, unit.y - caster.y) <= range * world.tileSize)
    .sort((a, b) => compareSourceSpellTargets(world, caster, a, b, sourceSpellAiPriority(world, "spell-bloodlust")))[0];
  return castBloodlustAt(world, caster, target);
}

export function issueRunesOrder(world: WorldState, casterId: string): boolean {
  const caster = findUnit(world, casterId);
  if (!caster || !canUnitCastSpellId(caster, "spell-runes") || !hasSpellResearch(world, caster.player, "spell-runes", "upgrade-runes")) {
    return false;
  }
  const target = findNearestEnemyInSpellRange(world, caster, spellAiRangeTiles(world, "spell-runes", 10), undefined, sourceSpellAiPriority(world, "spell-runes")) ?? caster;
  return castRunesAt(world, caster, target.x, target.y, "spell-runes");
}

export function issueEyeOfKilroggOrder(world: WorldState, casterId: string): boolean {
  const caster = findUnit(world, casterId);
  if (!caster || !canUnitCastSpellId(caster, "spell-eye-of-vision") || !hasSpellResearch(world, caster.player, "spell-eye-of-vision", "upgrade-eye-of-kilrogg")) {
    return false;
  }
  return castEyeOfKilroggAt(world, caster, caster.x, caster.y, "spell-eye-of-vision", "upgrade-eye-of-kilrogg");
}

export type TargetedSpellCommand =
  | "cast-heal"
  | "cast-exorcism"
  | "cast-holy-vision"
  | "cast-fireball"
  | "cast-flame-shield"
  | "cast-blizzard"
  | "cast-polymorph"
  | "cast-invisibility"
  | "cast-slow"
  | "cast-death-coil"
  | "cast-death-and-decay"
  | "cast-whirlwind"
  | "cast-raise-dead"
  | "cast-unholy-armor"
  | "cast-haste"
  | "cast-bloodlust"
  | "cast-bloodlust-double-head"
  | "cast-runes"
  | "cast-runes-double-head"
  | "cast-eye-of-kilrogg"
  | "cast-eye-of-kilrogg-double-head"
  | `source-adjust-variable:${string}`
  | `source-area-adjust-vitals:${string}`
  | `source-area-bombardment:${string}`
  | `source-adjust-vitals:${string}`
  | `source-capture:${string}`
  | `source-polymorph:${string}`
  | `source-spawn-missile:${string}`
  | `source-spawn-portal:${string}`
  | `source-teleport:${string}`
  | `source-summon:${string}`;

type SourceTargetedSpellCommand = `source-adjust-variable:${string}` | `source-area-adjust-vitals:${string}` | `source-area-bombardment:${string}` | `source-adjust-vitals:${string}` | `source-capture:${string}` | `source-polymorph:${string}` | `source-spawn-missile:${string}` | `source-spawn-portal:${string}` | `source-teleport:${string}` | `source-summon:${string}`;
type BuiltInTargetedSpellCommand = Exclude<TargetedSpellCommand, SourceTargetedSpellCommand>;

const TARGETED_SPELL_REQUIREMENTS: Record<BuiltInTargetedSpellCommand, { spellId: string; upgradeId: string | null; mana: number; range: number }> = {
  "cast-heal": { spellId: "spell-healing", upgradeId: "upgrade-healing", mana: 6, range: 6 },
  "cast-exorcism": { spellId: "spell-exorcism", upgradeId: "upgrade-exorcism", mana: 4, range: 10 },
  "cast-holy-vision": { spellId: "spell-holy-vision", upgradeId: "upgrade-holy-vision", mana: 70, range: Infinity },
  "cast-fireball": { spellId: "spell-fireball", upgradeId: "upgrade-fireball", mana: 100, range: 8 },
  "cast-flame-shield": { spellId: "spell-flame-shield", upgradeId: "upgrade-flame-shield", mana: 50, range: 6 },
  "cast-blizzard": { spellId: "spell-blizzard", upgradeId: "upgrade-blizzard", mana: 25, range: 12 },
  "cast-polymorph": { spellId: "spell-polymorph", upgradeId: "upgrade-polymorph", mana: 200, range: 10 },
  "cast-invisibility": { spellId: "spell-invisibility", upgradeId: "upgrade-invisibility", mana: 200, range: 6 },
  "cast-slow": { spellId: "spell-slow", upgradeId: "upgrade-slow", mana: 50, range: 10 },
  "cast-death-coil": { spellId: "spell-death-coil", upgradeId: "upgrade-death-coil", mana: 100, range: 10 },
  "cast-death-and-decay": { spellId: "spell-death-and-decay", upgradeId: "upgrade-death-and-decay", mana: 25, range: 12 },
  "cast-whirlwind": { spellId: "spell-whirlwind", upgradeId: "upgrade-whirlwind", mana: 100, range: 12 },
  "cast-raise-dead": { spellId: "spell-raise-dead", upgradeId: "upgrade-raise-dead", mana: 50, range: 6 },
  "cast-unholy-armor": { spellId: "spell-unholy-armor", upgradeId: "upgrade-unholy-armor", mana: 100, range: 6 },
  "cast-haste": { spellId: "spell-haste", upgradeId: "upgrade-haste", mana: 50, range: 6 },
  "cast-bloodlust": { spellId: "spell-bloodlust", upgradeId: "upgrade-bloodlust", mana: 50, range: 6 },
  "cast-bloodlust-double-head": { spellId: "spell-bloodlust-double-head", upgradeId: null, mana: 50, range: 6 },
  "cast-runes": { spellId: "spell-runes", upgradeId: "upgrade-runes", mana: 200, range: 10 },
  "cast-runes-double-head": { spellId: "spell-runes-double-head", upgradeId: null, mana: 200, range: 10 },
  "cast-eye-of-kilrogg": { spellId: "spell-eye-of-vision", upgradeId: "upgrade-eye-of-kilrogg", mana: 70, range: 6 },
  "cast-eye-of-kilrogg-double-head": { spellId: "spell-eye-of-vision-double-head", upgradeId: null, mana: 70, range: 6 }
};

const FALLBACK_TARGETED_SPELL_COMMAND_BY_SPELL: Partial<Record<string, BuiltInTargetedSpellCommand>> = {
  "spell-healing": "cast-heal",
  "spell-exorcism": "cast-exorcism",
  "spell-holy-vision": "cast-holy-vision",
  "spell-fireball": "cast-fireball",
  "spell-flame-shield": "cast-flame-shield",
  "spell-blizzard": "cast-blizzard",
  "spell-polymorph": "cast-polymorph",
  "spell-invisibility": "cast-invisibility",
  "spell-slow": "cast-slow",
  "spell-death-coil": "cast-death-coil",
  "spell-death-and-decay": "cast-death-and-decay",
  "spell-whirlwind": "cast-whirlwind",
  "spell-raise-dead": "cast-raise-dead",
  "spell-unholy-armor": "cast-unholy-armor",
  "spell-haste": "cast-haste",
  "spell-bloodlust": "cast-bloodlust",
  "spell-bloodlust-double-head": "cast-bloodlust-double-head",
  "spell-runes": "cast-runes",
  "spell-runes-double-head": "cast-runes-double-head",
  "spell-eye-of-vision": "cast-eye-of-kilrogg",
  "spell-eye-of-vision-double-head": "cast-eye-of-kilrogg-double-head"
};

function isSourceSummonCommand(command: TargetedSpellCommand): command is `source-summon:${string}` {
  return command.startsWith("source-summon:");
}

function isSourceAdjustVitalsCommand(command: TargetedSpellCommand): command is `source-adjust-vitals:${string}` {
  return command.startsWith("source-adjust-vitals:");
}

function isSourceAdjustVariableCommand(command: TargetedSpellCommand): command is `source-adjust-variable:${string}` {
  return command.startsWith("source-adjust-variable:");
}

function isSourceAreaAdjustVitalsCommand(command: TargetedSpellCommand): command is `source-area-adjust-vitals:${string}` {
  return command.startsWith("source-area-adjust-vitals:");
}

function isSourceAreaBombardmentCommand(command: TargetedSpellCommand): command is `source-area-bombardment:${string}` {
  return command.startsWith("source-area-bombardment:");
}

function isSourceCaptureCommand(command: TargetedSpellCommand): command is `source-capture:${string}` {
  return command.startsWith("source-capture:");
}

function isSourcePolymorphCommand(command: TargetedSpellCommand): command is `source-polymorph:${string}` {
  return command.startsWith("source-polymorph:");
}

function isSourceSpawnMissileCommand(command: TargetedSpellCommand): command is `source-spawn-missile:${string}` {
  return command.startsWith("source-spawn-missile:");
}

function isSourceSpawnPortalCommand(command: TargetedSpellCommand): command is `source-spawn-portal:${string}` {
  return command.startsWith("source-spawn-portal:");
}

function isSourceTeleportCommand(command: TargetedSpellCommand): command is `source-teleport:${string}` {
  return command.startsWith("source-teleport:");
}

function sourceSummonSpellId(command: `source-summon:${string}`): string {
  return command.slice("source-summon:".length);
}

function sourceAdjustVitalsSpellId(command: `source-adjust-vitals:${string}`): string {
  return command.slice("source-adjust-vitals:".length);
}

function sourceAdjustVariableSpellId(command: `source-adjust-variable:${string}`): string {
  return command.slice("source-adjust-variable:".length);
}

function sourceAreaAdjustVitalsSpellId(command: `source-area-adjust-vitals:${string}`): string {
  return command.slice("source-area-adjust-vitals:".length);
}

function sourceAreaBombardmentSpellId(command: `source-area-bombardment:${string}`): string {
  return command.slice("source-area-bombardment:".length);
}

function sourceCaptureSpellId(command: `source-capture:${string}`): string {
  return command.slice("source-capture:".length);
}

function sourcePolymorphSpellId(command: `source-polymorph:${string}`): string {
  return command.slice("source-polymorph:".length);
}

function sourceSpawnMissileSpellId(command: `source-spawn-missile:${string}`): string {
  return command.slice("source-spawn-missile:".length);
}

function sourceSpawnPortalSpellId(command: `source-spawn-portal:${string}`): string {
  return command.slice("source-spawn-portal:".length);
}

function sourceTeleportSpellId(command: `source-teleport:${string}`): string {
  return command.slice("source-teleport:".length);
}

function targetedSpellRequirement(world: WorldState, command: TargetedSpellCommand): { spellId: string; upgradeId: string | null; mana: number; range: number } | null {
  if (isSourceSummonCommand(command)) {
    const spellId = sourceSummonSpellId(command);
    const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
    if (!spell || spell.summons.length === 0) {
      return null;
    }
    const range = typeof spell.range === "number" ? spell.range : 6;
    return { spellId, upgradeId: spell.dependUpgrade, mana: spell.manaCost, range };
  }
  if (isSourceAdjustVitalsCommand(command)) {
    const spellId = sourceAdjustVitalsSpellId(command);
    const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
    if (!spell || !spell.adjustVitals.some((adjustment) => adjustment.variable === "hit-points")) {
      return null;
    }
    const range = typeof spell.range === "number" ? spell.range : 6;
    return { spellId, upgradeId: spell.dependUpgrade, mana: spell.manaCost, range };
  }
  if (isSourceAdjustVariableCommand(command)) {
    const spellId = sourceAdjustVariableSpellId(command);
    const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
    if (!spell || !spell.variableAdjustments.some((adjustment) => sourceStatusKindForVariable(adjustment.variable))) {
      return null;
    }
    const range = typeof spell.range === "number" ? spell.range : 6;
    return { spellId, upgradeId: spell.dependUpgrade, mana: spell.manaCost, range };
  }
  if (isSourceAreaAdjustVitalsCommand(command)) {
    const spellId = sourceAreaAdjustVitalsSpellId(command);
    const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
    if (!spell || spell.areaAdjustVitals.length === 0) {
      return null;
    }
    const range = typeof spell.range === "number" ? spell.range : 6;
    return { spellId, upgradeId: spell.dependUpgrade, mana: sourceAreaAdjustVitalsConsumesMana(world, spellId) ? spell.manaCost : 0, range };
  }
  if (isSourceAreaBombardmentCommand(command)) {
    const spellId = sourceAreaBombardmentSpellId(command);
    const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
    if (!spell || spell.areaBombardments.length === 0) {
      return null;
    }
    const range = typeof spell.range === "number" ? spell.range : 6;
    return { spellId, upgradeId: spell.dependUpgrade, mana: spell.manaCost, range };
  }
  if (isSourceCaptureCommand(command)) {
    const spellId = sourceCaptureSpellId(command);
    const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
    if (!spell || spell.captures.length === 0) {
      return null;
    }
    const range = typeof spell.range === "number" ? spell.range : 6;
    return { spellId, upgradeId: spell.dependUpgrade, mana: sourceCaptureConsumesMana(world, spellId) ? spell.manaCost : 0, range };
  }
  if (isSourcePolymorphCommand(command)) {
    const spellId = sourcePolymorphSpellId(command);
    const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
    if (!spell || spell.polymorphs.length === 0) {
      return null;
    }
    const range = typeof spell.range === "number" ? spell.range : 6;
    return { spellId, upgradeId: spell.dependUpgrade, mana: spell.manaCost, range };
  }
  if (isSourceSpawnMissileCommand(command)) {
    const spellId = sourceSpawnMissileSpellId(command);
    const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
    if (!spell || !sourceSpawnMissileAction(world, spellId)) {
      return null;
    }
    const range = typeof spell.range === "number" ? spell.range : 6;
    return { spellId, upgradeId: spell.dependUpgrade, mana: spell.manaCost, range };
  }
  if (isSourceSpawnPortalCommand(command)) {
    const spellId = sourceSpawnPortalSpellId(command);
    const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
    if (!spell || spell.spawnPortals.length === 0) {
      return null;
    }
    const range = typeof spell.range === "number" ? spell.range : 6;
    return { spellId, upgradeId: spell.dependUpgrade, mana: spell.manaCost, range };
  }
  if (isSourceTeleportCommand(command)) {
    const spellId = sourceTeleportSpellId(command);
    const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
    if (!spell || !spell.actionTypes.includes("teleport")) {
      return null;
    }
    const range = typeof spell.range === "number" ? spell.range : Infinity;
    return { spellId, upgradeId: spell.dependUpgrade, mana: spell.manaCost, range };
  }
  return TARGETED_SPELL_REQUIREMENTS[command];
}

export function targetedSpellIdForCommand(world: WorldState, command: TargetedSpellCommand): string | null {
  return targetedSpellRequirement(world, command)?.spellId ?? null;
}

export function canCastTargetedSpellCommand(world: WorldState, caster: WorldUnit, command: TargetedSpellCommand): boolean {
  const requirement = targetedSpellRequirement(world, command);
  if (!requirement) {
    return false;
  }
  return caster.hitPoints > 0
    && !caster.construction
    && canUnitCastSpellId(caster, requirement.spellId)
    && hasSpellResearch(world, caster.player, requirement.spellId, requirement.upgradeId)
    && caster.mana >= spellManaCost(world, requirement.spellId, requirement.mana)
    && caster.spellCooldown <= 0;
}

export function selectedCanCastTargetedSpell(world: WorldState, unitIds: string[], command: TargetedSpellCommand, playerId = world.visibilityPlayer): boolean {
  return unitIds
    .map((id) => findUnit(world, id))
    .some((unit) => unit?.player === playerId && canCastTargetedSpellCommand(world, unit, command));
}

export function isTargetedSpellCommand(command: string): command is TargetedSpellCommand {
  return command === "cast-heal"
    || command === "cast-exorcism"
    || command === "cast-holy-vision"
    || command === "cast-fireball"
    || command === "cast-flame-shield"
    || command === "cast-blizzard"
    || command === "cast-polymorph"
    || command === "cast-invisibility"
    || command === "cast-slow"
    || command === "cast-death-coil"
    || command === "cast-death-and-decay"
    || command === "cast-whirlwind"
    || command === "cast-raise-dead"
    || command === "cast-unholy-armor"
    || command === "cast-haste"
    || command === "cast-bloodlust"
    || command === "cast-bloodlust-double-head"
    || command === "cast-runes"
    || command === "cast-runes-double-head"
    || command === "cast-eye-of-kilrogg"
    || command === "cast-eye-of-kilrogg-double-head"
    || command.startsWith("source-adjust-variable:")
    || command.startsWith("source-area-adjust-vitals:")
    || command.startsWith("source-area-bombardment:")
    || command.startsWith("source-adjust-vitals:")
    || command.startsWith("source-capture:")
    || command.startsWith("source-polymorph:")
    || command.startsWith("source-spawn-missile:")
    || command.startsWith("source-spawn-portal:")
    || command.startsWith("source-teleport:")
    || command.startsWith("source-summon:");
}

function sourceSpellDefinitionForCommand(world: Pick<WorldState, "spellDefinitions">, spellId: string) {
  return world.spellDefinitions.find((spell) => spell.id === spellId);
}

export function sourceFallbackSpellCommandForSpellId(spellId: string): TargetedSpellCommand | null {
  return FALLBACK_TARGETED_SPELL_COMMAND_BY_SPELL[spellId] ?? null;
}

export function sourceSpellCommandForSpellId(world: Pick<WorldState, "spellDefinitions">, spellId: string): TargetedSpellCommand | null {
  const command = sourceFallbackSpellCommandForSpellId(spellId);
  const spell = sourceSpellDefinitionForCommand(world, spellId);
  if (spell?.actionTypes.includes("area-bombardment") && spell.areaBombardments.length > 0) {
    return `source-area-bombardment:${spellId}`;
  }
  if (spell?.actionTypes.includes("polymorph") && spell.polymorphs.length > 0) {
    return `source-polymorph:${spellId}`;
  }
  if (command) {
    return command;
  }
  if (spell?.actionTypes.includes("summon") && spell.summons.length > 0) {
    return `source-summon:${spellId}`;
  }
  if (spell?.actionTypes.includes("adjust-vitals") && spell.adjustVitals.some((adjustment) => adjustment.variable === "hit-points")) {
    return `source-adjust-vitals:${spellId}`;
  }
  if (spell?.actionTypes.includes("adjust-variable") && spell.variableAdjustments.some((adjustment) => sourceStatusKindForVariable(adjustment.variable))) {
    return `source-adjust-variable:${spellId}`;
  }
  if (spell?.actionTypes.includes("area-adjust-vitals") && spell.areaAdjustVitals.length > 0) {
    return `source-area-adjust-vitals:${spellId}`;
  }
  if (spell?.actionTypes.includes("capture") && spell.captures.length > 0) {
    return `source-capture:${spellId}`;
  }
  if (spell?.actionTypes.includes("spawn-missile") && sourceSpawnMissileAction(world, spellId)) {
    return `source-spawn-missile:${spellId}`;
  }
  if (spell?.actionTypes.includes("spawn-portal") && spell.spawnPortals.length > 0) {
    return `source-spawn-portal:${spellId}`;
  }
  if (spell?.actionTypes.includes("teleport")) {
    return `source-teleport:${spellId}`;
  }
  return null;
}

export function sourceInstantSpellCommandForSpellId(world: Pick<WorldState, "spellDefinitions">, spellId: string): "detonate" | null {
  const spell = sourceSpellDefinitionForCommand(world, spellId);
  return spell?.actionTypes.includes("demolish") && spell.demolishes.length > 0 ? "detonate" : null;
}

export function sourceSpellTargetForHudCommand(world: WorldState, selectedUnits: WorldUnit[], command: TargetedSpellCommand): string | null {
  const sourceButton = world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "cast-spell" && Boolean(button.value))
    .filter((button) => selectedUnits.some((unit) => sourceButtonAppliesTo(button, unit.typeId) && sourceButtonAllowedForSimulation(world, button, unit.player)))
    .filter((button) => sourceSpellCommandForSpellId(world, button.value) === command)
    .filter((button) => selectedUnits.some((unit) => canUnitCastSpellId(unit, button.value) && canCastTargetedSpellCommand(world, unit, command)))
    .sort(compareSourceButtons)[0];
  return sourceButton?.value ?? null;
}

export function canToggleAutoCastSpell(world: WorldState, unit: WorldUnit, spellId: string): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  return Boolean(spell
    && spell.autocast.length > 0
    && unit.hitPoints > 0
    && !unit.construction
    && canUnitCastSpellId(unit, spellId)
    && hasSpellResearch(world, unit.player, spellId, spell.dependUpgrade));
}

export function isAutoCastSpellEnabled(unit: WorldUnit, spellId: string): boolean {
  return (unit.autoCastSpells ?? []).includes(spellId);
}

export function toggleAutoCastSpellForSelection(world: WorldState, unitIds: string[], spellId: string, playerId = world.visibilityPlayer): boolean {
  const units = selectedUnitsForPlayer(world, unitIds, playerId)
    .filter((unit) => canToggleAutoCastSpell(world, unit, spellId));
  if (units.length === 0) {
    return false;
  }
  const enable = units.some((unit) => !isAutoCastSpellEnabled(unit, spellId));
  for (const unit of units) {
    const current = new Set(unit.autoCastSpells ?? []);
    if (enable) {
      current.add(spellId);
    } else {
      current.delete(spellId);
    }
    unit.autoCastSpells = [...current].filter((id) => unit.canCastSpells.includes(id)).sort();
  }
  return true;
}

export function targetedSpellCommandForKey(world: WorldState, code: string, unitIds: string[], playerId = world.visibilityPlayer): TargetedSpellCommand | null {
  const sourceCommand = sourceTargetedSpellCommandForKey(world, code, unitIds, playerId);
  if (sourceCommand) {
    return sourceCommand;
  }
  const readyCasters = unitIds
    .map((id) => findUnit(world, id))
    .filter((unit): unit is WorldUnit => unit !== undefined && unit.player === playerId && !unit.construction)
    .filter((unit) => unit.maxMana > 0);
  if (readyCasters.some((unit) => canCastTargetedSpellCommand(world, unit, "cast-heal") || canCastTargetedSpellCommand(world, unit, "cast-exorcism") || canCastTargetedSpellCommand(world, unit, "cast-holy-vision"))) {
    if (code === "KeyH") {
      return readyCasters.some((unit) => canCastTargetedSpellCommand(world, unit, "cast-heal")) ? "cast-heal" : null;
    }
    if (code === "KeyE") {
      return readyCasters.some((unit) => canCastTargetedSpellCommand(world, unit, "cast-exorcism")) ? "cast-exorcism" : null;
    }
    if (code === "KeyV") {
      return readyCasters.some((unit) => canCastTargetedSpellCommand(world, unit, "cast-holy-vision")) ? "cast-holy-vision" : null;
    }
  }
  if (readyCasters.some((unit) => canCastTargetedSpellCommand(world, unit, "cast-fireball") || canCastTargetedSpellCommand(world, unit, "cast-flame-shield") || canCastTargetedSpellCommand(world, unit, "cast-blizzard") || canCastTargetedSpellCommand(world, unit, "cast-polymorph") || canCastTargetedSpellCommand(world, unit, "cast-invisibility") || canCastTargetedSpellCommand(world, unit, "cast-slow"))) {
    if (code === "KeyF") {
      return readyCasters.some((unit) => canCastTargetedSpellCommand(world, unit, "cast-fireball")) ? "cast-fireball" : null;
    }
    if (code === "KeyB") {
      return readyCasters.some((unit) => canCastTargetedSpellCommand(world, unit, "cast-blizzard")) ? "cast-blizzard" : null;
    }
    if (code === "KeyL") {
      return readyCasters.some((unit) => canCastTargetedSpellCommand(world, unit, "cast-flame-shield")) ? "cast-flame-shield" : null;
    }
    if (code === "KeyP") {
      return readyCasters.some((unit) => canCastTargetedSpellCommand(world, unit, "cast-polymorph")) ? "cast-polymorph" : null;
    }
    if (code === "KeyI") {
      return readyCasters.some((unit) => canCastTargetedSpellCommand(world, unit, "cast-invisibility")) ? "cast-invisibility" : null;
    }
    if (code === "KeyS") {
      return readyCasters.some((unit) => canCastTargetedSpellCommand(world, unit, "cast-slow")) ? "cast-slow" : null;
    }
  }
  if (readyCasters.some((unit) => canCastTargetedSpellCommand(world, unit, "cast-death-coil") || canCastTargetedSpellCommand(world, unit, "cast-death-and-decay") || canCastTargetedSpellCommand(world, unit, "cast-whirlwind") || canCastTargetedSpellCommand(world, unit, "cast-raise-dead") || canCastTargetedSpellCommand(world, unit, "cast-unholy-armor"))) {
    if (code === "KeyD") {
      return readyCasters.some((unit) => canCastTargetedSpellCommand(world, unit, "cast-death-coil")) ? "cast-death-coil" : null;
    }
    if (code === "KeyW") {
      return readyCasters.some((unit) => canCastTargetedSpellCommand(world, unit, "cast-death-and-decay")) ? "cast-death-and-decay" : null;
    }
    if (code === "KeyR") {
      return readyCasters.some((unit) => canCastTargetedSpellCommand(world, unit, "cast-whirlwind")) ? "cast-whirlwind" : null;
    }
    if (code === "KeyG") {
      return readyCasters.some((unit) => canCastTargetedSpellCommand(world, unit, "cast-raise-dead")) ? "cast-raise-dead" : null;
    }
    if (code === "KeyU") {
      return readyCasters.some((unit) => canCastTargetedSpellCommand(world, unit, "cast-unholy-armor")) ? "cast-unholy-armor" : null;
    }
  }
  if (readyCasters.some((unit) => canCastTargetedSpellCommand(world, unit, "cast-haste") || canCastTargetedSpellCommand(world, unit, "cast-bloodlust") || canCastTargetedSpellCommand(world, unit, "cast-runes") || canCastTargetedSpellCommand(world, unit, "cast-eye-of-kilrogg"))) {
    if (code === "KeyH") {
      return readyCasters.some((unit) => canCastTargetedSpellCommand(world, unit, "cast-haste")) ? "cast-haste" : null;
    }
    if (code === "KeyB") {
      return readyCasters.some((unit) => canCastTargetedSpellCommand(world, unit, "cast-bloodlust")) ? "cast-bloodlust" : null;
    }
    if (code === "KeyR") {
      return readyCasters.some((unit) => canCastTargetedSpellCommand(world, unit, "cast-runes")) ? "cast-runes" : null;
    }
    if (code === "KeyE") {
      return readyCasters.some((unit) => canCastTargetedSpellCommand(world, unit, "cast-eye-of-kilrogg")) ? "cast-eye-of-kilrogg" : null;
    }
  }
  return null;
}

function sourceTargetedSpellCommandForKey(world: WorldState, code: string, unitIds: string[], playerId = world.visibilityPlayer): TargetedSpellCommand | null {
  const key = keyNameFromCode(code);
  if (!key) {
    return null;
  }
  const readyCasters = unitIds
    .map((id) => findUnit(world, id))
    .filter((unit): unit is WorldUnit => unit !== undefined && unit.player === playerId && !unit.construction)
    .filter((unit) => unit.maxMana > 0);
  for (const caster of readyCasters) {
    const sourceButton = world.buttonDefinitions
      .filter((button) => button.action === "cast-spell" && button.key?.toUpperCase() === key && sourceButtonAppliesTo(button, caster.typeId))
      .filter((button) => sourceButtonAllowedForSimulation(world, button, caster.player))
      .filter((button) => sourceButtonVisibleForHud(world, button, caster.player))
      .sort(compareSourceButtons)[0];
    if (sourceButton?.value && sourceInstantSpellCommandForSpellId(world, sourceButton.value)) {
      continue;
    }
    const command = sourceButton?.value ? sourceSpellCommandForSpellId(world, sourceButton.value) : null;
    if (command && canCastTargetedSpellCommand(world, caster, command)) {
      return command;
    }
  }
  return null;
}

export function issueTargetedSpellOrder(world: WorldState, casterId: string, command: TargetedSpellCommand, x: number, y: number): boolean {
  return issueTargetedSpellOrderInternal(world, casterId, command, x, y, true);
}

function issueTargetedSpellOrderInternal(world: WorldState, casterId: string, command: TargetedSpellCommand, x: number, y: number, queueIfOutOfRange: boolean): boolean {
  const caster = findUnit(world, casterId);
  if (!caster) {
    return false;
  }
  const requirement = targetedSpellRequirement(world, command);
  if (!requirement) {
    return false;
  }
  const rangeTiles = targetedSpellRangeTiles(world, requirement);
  if (!isPointInSpellRange(world, caster, x, y, rangeTiles)) {
    return queueIfOutOfRange && issueSpellCastMoveOrder(world, caster, command, requirement.spellId, rangeTiles, x, y);
  }
  return executeTargetedSpellNow(world, caster, command, requirement, x, y);
}

function executeTargetedSpellNow(world: WorldState, caster: WorldUnit, command: TargetedSpellCommand, requirement: { spellId: string; upgradeId: string | null; mana: number; range: number }, x: number, y: number): boolean {
  if (isSourceSummonCommand(command)) {
    return castSourceSummonAt(world, caster, sourceSummonSpellId(command), x, y);
  }
  if (isSourceAdjustVitalsCommand(command)) {
    return castSourceAdjustVitalsAt(world, caster, sourceAdjustVitalsSpellId(command), x, y);
  }
  if (isSourceAdjustVariableCommand(command)) {
    return castSourceAdjustVariableAt(world, caster, sourceAdjustVariableSpellId(command), x, y);
  }
  if (isSourceAreaAdjustVitalsCommand(command)) {
    return castSourceAreaAdjustVitalsAt(world, caster, sourceAreaAdjustVitalsSpellId(command), x, y);
  }
  if (isSourceAreaBombardmentCommand(command)) {
    return castSourceAreaBombardmentAt(world, caster, sourceAreaBombardmentSpellId(command), x, y);
  }
  if (isSourceCaptureCommand(command)) {
    return castSourceCaptureAt(world, caster, sourceCaptureSpellId(command), x, y);
  }
  if (isSourcePolymorphCommand(command)) {
    return castSourcePolymorphAt(world, caster, sourcePolymorphSpellId(command), x, y);
  }
  if (isSourceSpawnMissileCommand(command)) {
    return castSourceSpawnMissileAt(world, caster, sourceSpawnMissileSpellId(command), x, y);
  }
  if (isSourceSpawnPortalCommand(command)) {
    return castSourceSpawnPortalAt(world, caster, sourceSpawnPortalSpellId(command), x, y);
  }
  if (isSourceTeleportCommand(command)) {
    return castSourceTeleportAt(world, caster, sourceTeleportSpellId(command), x, y);
  }

  if (command === "cast-heal") {
    return castHealAt(world, caster, findSpellFriendlyNearPoint(world, caster, x, y, targetedSpellRangeTiles(world, requirement), (unit) => spellTargetMatchesSource(world, requirement.spellId, caster, unit, canHealTarget)));
  }
  if (command === "cast-exorcism") {
    return castExorcismAt(world, caster, findSpellEnemyNearPoint(world, caster, x, y, targetedSpellRangeTiles(world, requirement), (unit) => spellTargetMatchesSource(world, requirement.spellId, caster, unit, canExorcismTarget)));
  }
  if (command === "cast-holy-vision") {
    return castHolyVisionAt(world, caster, x, y);
  }
  if (command === "cast-fireball") {
    return castFireballAt(world, caster, x, y);
  }
  if (command === "cast-flame-shield") {
    return castFlameShieldAt(world, caster, findSpellFriendlyNearPoint(world, caster, x, y, targetedSpellRangeTiles(world, requirement), (unit) => spellTargetMatchesSource(world, requirement.spellId, caster, unit, canFlameShieldTarget)));
  }
  if (command === "cast-blizzard") {
    return castBlizzardAt(world, caster, x, y);
  }
  if (command === "cast-polymorph") {
    return castPolymorphAt(world, caster, findSpellEnemyNearPoint(world, caster, x, y, targetedSpellRangeTiles(world, requirement), (unit) => spellTargetMatchesSource(world, requirement.spellId, caster, unit, canPolymorphTarget)));
  }
  if (command === "cast-invisibility") {
    return castInvisibilityAt(world, caster, findSpellFriendlyNearPoint(world, caster, x, y, targetedSpellRangeTiles(world, requirement), (unit) => spellTargetMatchesSource(world, requirement.spellId, caster, unit, canInvisibilityTarget)));
  }
  if (command === "cast-slow") {
    return castSlowAt(world, caster, findSpellEnemyNearPoint(world, caster, x, y, targetedSpellRangeTiles(world, requirement), (unit) => spellTargetMatchesSource(world, requirement.spellId, caster, unit, canSlowTarget)));
  }
  if (command === "cast-death-coil") {
    return castDeathCoilAt(world, caster, findSpellEnemyNearPoint(world, caster, x, y, targetedSpellRangeTiles(world, requirement), (unit) => spellTargetMatchesSource(world, requirement.spellId, caster, unit, canDeathCoilTarget)));
  }
  if (command === "cast-death-and-decay") {
    return castDeathAndDecayAt(world, caster, x, y);
  }
  if (command === "cast-whirlwind") {
    return castWhirlwindAt(world, caster, x, y);
  }
  if (command === "cast-raise-dead") {
    return castRaiseDeadAt(world, caster, x, y);
  }
  if (command === "cast-unholy-armor") {
    return castUnholyArmorAt(world, caster, findSpellFriendlyNearPoint(world, caster, x, y, targetedSpellRangeTiles(world, requirement), (unit) => spellTargetMatchesSource(world, requirement.spellId, caster, unit, canUnholyArmorTarget)));
  }
  if (command === "cast-haste") {
    return castHasteAt(world, caster, findSpellFriendlyNearPoint(world, caster, x, y, targetedSpellRangeTiles(world, requirement), (unit) => spellTargetMatchesSource(world, requirement.spellId, caster, unit, canHasteTarget)));
  }
  if (command === "cast-bloodlust" || command === "cast-bloodlust-double-head") {
    return castBloodlustAt(world, caster, findSpellFriendlyNearPoint(world, caster, x, y, targetedSpellRangeTiles(world, requirement), (unit) => spellTargetMatchesSource(world, requirement.spellId, caster, unit, canBloodlustTarget)), requirement.spellId, requirement.upgradeId);
  }
  if (command === "cast-runes" || command === "cast-runes-double-head") {
    return castRunesAt(world, caster, x, y, requirement.spellId, requirement.upgradeId);
  }
  if (command === "cast-eye-of-kilrogg" || command === "cast-eye-of-kilrogg-double-head") {
    return castEyeOfKilroggAt(world, caster, x, y, requirement.spellId, requirement.upgradeId);
  }
  return false;
}

function issueSpellCastMoveOrder(world: WorldState, caster: WorldUnit, command: TargetedSpellCommand, spellId: string, rangeTiles: number, x: number, y: number): boolean {
  if (!canCastTargetedSpellCommand(world, caster, command) || !Number.isFinite(rangeTiles) || !canReceiveMoveOrders(caster)) {
    return false;
  }
  const path = findSpellCastPathWithinSourceRange(world, caster, x, y, rangeTiles);
  if (path.length === 0) {
    return false;
  }
  caster.moveQueue = [];
  caster.order = {
    kind: "spell-cast",
    command,
    spellId,
    spellRange: rangeTiles,
    targetX: x,
    targetY: y,
    spellState: "move",
    path,
    pathIndex: path.length > 1 ? 1 : 0
  };
  return true;
}

export function canIssueTargetedSpellAt(world: WorldState, caster: WorldUnit, command: TargetedSpellCommand, x: number, y: number): boolean {
  const requirement = targetedSpellRequirement(world, command);
  if (!requirement) {
    return false;
  }
  if (!isPointInSpellRange(world, caster, x, y, targetedSpellRangeTiles(world, requirement))) {
    return canCastTargetedSpellCommand(world, caster, command)
      && canReceiveMoveOrders(caster)
      && findSpellCastPathWithinSourceRange(world, caster, x, y, targetedSpellRangeTiles(world, requirement)).length > 0;
  }
  if (isSourceSummonCommand(command)) {
    return canIssueSourceSummonAt(world, caster, sourceSummonSpellId(command), x, y);
  }
  if (isSourceAdjustVitalsCommand(command)) {
    return canIssueSourceAdjustVitalsAt(world, caster, sourceAdjustVitalsSpellId(command), x, y);
  }
  if (isSourceAdjustVariableCommand(command)) {
    return canIssueSourceAdjustVariableAt(world, caster, sourceAdjustVariableSpellId(command), x, y);
  }
  if (isSourceAreaAdjustVitalsCommand(command)) {
    return canIssueSourceAreaAdjustVitalsAt(world, caster, sourceAreaAdjustVitalsSpellId(command), x, y);
  }
  if (isSourceAreaBombardmentCommand(command)) {
    return canIssueSourceAreaBombardmentAt(world, caster, sourceAreaBombardmentSpellId(command), x, y);
  }
  if (isSourceCaptureCommand(command)) {
    return canIssueSourceCaptureAt(world, caster, sourceCaptureSpellId(command), x, y);
  }
  if (isSourcePolymorphCommand(command)) {
    return canIssueSourcePolymorphAt(world, caster, sourcePolymorphSpellId(command), x, y);
  }
  if (isSourceSpawnMissileCommand(command)) {
    return canIssueSourceSpawnMissileAt(world, caster, sourceSpawnMissileSpellId(command), x, y);
  }
  if (isSourceSpawnPortalCommand(command)) {
    return canIssueSourceSpawnPortalAt(world, caster, sourceSpawnPortalSpellId(command), x, y);
  }
  if (isSourceTeleportCommand(command)) {
    return canIssueSourceTeleportAt(world, caster, sourceTeleportSpellId(command), x, y);
  }
  if (command === "cast-heal") {
    return canCastSpell(world, caster, requirement.spellId, requirement.upgradeId, requirement.mana)
      && Boolean(findSpellFriendlyNearPoint(world, caster, x, y, spellRangeTiles(world, requirement.spellId, requirement.range), (unit) => spellTargetMatchesSource(world, requirement.spellId, caster, unit, canHealTarget)));
  }
  if (command === "cast-exorcism") {
    return canCastSpell(world, caster, requirement.spellId, requirement.upgradeId, requirement.mana)
      && Boolean(findSpellEnemyNearPoint(world, caster, x, y, spellRangeTiles(world, requirement.spellId, requirement.range), (unit) => spellTargetMatchesSource(world, requirement.spellId, caster, unit, canExorcismTarget)));
  }
  if (command === "cast-holy-vision") {
    return canCastSpell(world, caster, requirement.spellId, requirement.upgradeId, requirement.mana)
      && isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, requirement.spellId, requirement.range));
  }
  if (command === "cast-fireball") {
    return canCastSpell(world, caster, requirement.spellId, requirement.upgradeId, requirement.mana)
      && isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, requirement.spellId, requirement.range));
  }
  if (command === "cast-flame-shield") {
    return canCastSpell(world, caster, requirement.spellId, requirement.upgradeId, requirement.mana)
      && Boolean(findSpellFriendlyNearPoint(world, caster, x, y, spellRangeTiles(world, requirement.spellId, requirement.range), (unit) => spellTargetMatchesSource(world, requirement.spellId, caster, unit, canFlameShieldTarget)));
  }
  if (command === "cast-blizzard") {
    return canCastSpell(world, caster, requirement.spellId, requirement.upgradeId, requirement.mana)
      && isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, requirement.spellId, requirement.range));
  }
  if (command === "cast-polymorph") {
    return canCastSpell(world, caster, requirement.spellId, requirement.upgradeId, requirement.mana)
      && Boolean(findSpellEnemyNearPoint(world, caster, x, y, spellRangeTiles(world, requirement.spellId, requirement.range), (unit) => spellTargetMatchesSource(world, requirement.spellId, caster, unit, canPolymorphTarget)));
  }
  if (command === "cast-invisibility") {
    return canCastSpell(world, caster, requirement.spellId, requirement.upgradeId, requirement.mana)
      && Boolean(findSpellFriendlyNearPoint(world, caster, x, y, spellRangeTiles(world, requirement.spellId, requirement.range), (unit) => spellTargetMatchesSource(world, requirement.spellId, caster, unit, canInvisibilityTarget)));
  }
  if (command === "cast-slow") {
    return canCastSpell(world, caster, requirement.spellId, requirement.upgradeId, requirement.mana)
      && Boolean(findSpellEnemyNearPoint(world, caster, x, y, spellRangeTiles(world, requirement.spellId, requirement.range), (unit) => spellTargetMatchesSource(world, requirement.spellId, caster, unit, canSlowTarget)));
  }
  if (command === "cast-death-coil") {
    return canCastSpell(world, caster, requirement.spellId, requirement.upgradeId, requirement.mana)
      && Boolean(findSpellEnemyNearPoint(world, caster, x, y, spellRangeTiles(world, requirement.spellId, requirement.range), (unit) => spellTargetMatchesSource(world, requirement.spellId, caster, unit, canDeathCoilTarget)));
  }
  if (command === "cast-death-and-decay") {
    return canCastSpell(world, caster, requirement.spellId, requirement.upgradeId, requirement.mana)
      && isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, requirement.spellId, requirement.range));
  }
  if (command === "cast-whirlwind") {
    return canCastSpell(world, caster, requirement.spellId, requirement.upgradeId, requirement.mana)
      && isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, requirement.spellId, requirement.range))
      && Boolean(findSpellEnemyNearPoint(world, caster, x, y, spellRangeTiles(world, requirement.spellId, requirement.range), (unit) => spellTargetMatchesSource(world, requirement.spellId, caster, unit, (candidate) => canWhirlwindTarget(caster, candidate))));
  }
  if (command === "cast-raise-dead") {
    const rangeTiles = spellRangeTiles(world, requirement.spellId, requirement.range);
    const corpse = findRaiseDeadCorpseNearPoint(world, caster, x, y, rangeTiles);
    const skeletonDefinition = raisedSkeletonDefinition(world);
    return canCastSpell(world, caster, requirement.spellId, requirement.upgradeId, requirement.mana)
      && Boolean(skeletonDefinition && corpse && (findSpellSpawnTileNear(world, corpse.x, corpse.y, skeletonDefinition) ?? findSpellSpawnTile(world, caster, skeletonDefinition)));
  }
  if (command === "cast-unholy-armor") {
    return canCastSpell(world, caster, requirement.spellId, requirement.upgradeId, requirement.mana)
      && Boolean(findSpellFriendlyNearPoint(world, caster, x, y, spellRangeTiles(world, requirement.spellId, requirement.range), (unit) => spellTargetMatchesSource(world, requirement.spellId, caster, unit, canUnholyArmorTarget)));
  }
  if (command === "cast-haste") {
    return canCastSpell(world, caster, requirement.spellId, requirement.upgradeId, requirement.mana)
      && Boolean(findSpellFriendlyNearPoint(world, caster, x, y, spellRangeTiles(world, requirement.spellId, requirement.range), (unit) => spellTargetMatchesSource(world, requirement.spellId, caster, unit, canHasteTarget)));
  }
  if (command === "cast-bloodlust" || command === "cast-bloodlust-double-head") {
    return canCastSpell(world, caster, requirement.spellId, requirement.upgradeId, requirement.mana)
      && Boolean(findSpellFriendlyNearPoint(world, caster, x, y, spellRangeTiles(world, requirement.spellId, requirement.range), (unit) => spellTargetMatchesSource(world, requirement.spellId, caster, unit, canBloodlustTarget)));
  }
  if (command === "cast-runes" || command === "cast-runes-double-head") {
    return canCastSpell(world, caster, requirement.spellId, requirement.upgradeId, requirement.mana)
      && isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, requirement.spellId, requirement.range));
  }
  if (command === "cast-eye-of-kilrogg" || command === "cast-eye-of-kilrogg-double-head") {
    const eyeDefinition = eyeOfKilroggDefinition(world, requirement.spellId);
    if (!canCastSpell(world, caster, requirement.spellId, requirement.upgradeId, requirement.mana) || !eyeDefinition || !isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, requirement.spellId, requirement.range))) {
      return false;
    }
    return Boolean(findSpellSpawnTileNear(world, x, y, eyeDefinition));
  }
  return false;
}

export function canSelectedIssueTargetedSpellAt(world: WorldState, unitIds: string[], command: TargetedSpellCommand, x: number, y: number, playerId = world.visibilityPlayer): boolean {
  return unitIds
    .map((id) => findUnit(world, id))
    .some((unit): boolean => Boolean(unit
      && unit.player === playerId
      && !unit.construction
      && canIssueTargetedSpellAt(world, unit, command, x, y)));
}

export function issueGroupTargetedSpellOrder(world: WorldState, unitIds: string[], command: TargetedSpellCommand, x: number, y: number, playerId = world.visibilityPlayer): boolean {
  const casters = selectedUnitsForPlayer(world, unitIds, playerId)
    .filter((unit) => !unit.construction);
  return casters
    .filter((unit) => canIssueTargetedSpellAt(world, unit, command, x, y))
    .some((caster) => issueTargetedSpellOrder(world, caster.id, command, x, y));
}

export function issueQueueTargetedSpellOrder(world: WorldState, casterId: string, command: TargetedSpellCommand, x: number, y: number): boolean {
  const caster = findUnit(world, casterId);
  const requirement = targetedSpellRequirement(world, command);
  if (!caster || !requirement || !canIssueQueueTargetedSpellAt(world, caster, command, x, y)) {
    return false;
  }
  const rangeTiles = targetedSpellRangeTiles(world, requirement);
  caster.moveQueue.push({ kind: "spell-cast", command, spellId: requirement.spellId, spellRange: rangeTiles, x, y });
  if (!caster.order) {
    startNextQueuedMove(world, caster);
  }
  return true;
}

export function canIssueQueueTargetedSpellAt(world: WorldState, caster: WorldUnit, command: TargetedSpellCommand, x: number, y: number): boolean {
  const requirement = targetedSpellRequirement(world, command);
  if (!requirement || !canCastTargetedSpellCommand(world, caster, command)) {
    return false;
  }
  const rangeTiles = targetedSpellRangeTiles(world, requirement);
  const origin = queuedPathOrigin(caster);
  const pathingCaster = origin ? { ...caster, x: origin.x, y: origin.y } : caster;
  if (!isPointInSpellRange(world, pathingCaster, x, y, rangeTiles)) {
    return canReceiveMoveOrders(caster)
      && findSpellCastPathWithinSourceRange(world, pathingCaster, x, y, rangeTiles).length > 0;
  }
  return canIssueTargetedSpellAt(world, pathingCaster, command, x, y);
}

export function issueGroupQueueTargetedSpellOrder(world: WorldState, unitIds: string[], command: TargetedSpellCommand, x: number, y: number, playerId = world.visibilityPlayer): boolean {
  const casters = selectedUnitsForPlayer(world, unitIds, playerId)
    .filter((unit) => !unit.construction);
  return casters
    .filter((unit) => canIssueQueueTargetedSpellAt(world, unit, command, x, y))
    .some((caster) => issueQueueTargetedSpellOrder(world, caster.id, command, x, y));
}

export function issueLoadTransportOrder(world: WorldState, transportId: string): boolean {
  const transport = findUnit(world, transportId);
  if (!transport || !canIssueLoadTransport(transport)) {
    return false;
  }
  const remaining = transport.cargoCapacity - transport.cargo.length;
  const candidates = world.units
    .filter((unit) => canLoadIntoTransport(transport, unit))
    .sort((a, b) => distanceSquared(transport, a) - distanceSquared(transport, b))
    .slice(0, remaining);
  if (candidates.length === 0) {
    return false;
  }
  const loadedIds = new Set(candidates.map((unit) => unit.id));
  for (const unit of candidates) {
    unit.order = null;
    unit.moveQueue = [];
    transport.cargo.push(unit);
    world.events.push({ kind: "unit-loaded", unitId: unit.id, transportId: transport.id, player: unit.player });
  }
  world.units = world.units.filter((unit) => !loadedIds.has(unit.id));
  clearReferencesToUnavailableUnits(world, loadedIds);
  emitSoundEvent(world, "transport-docking", transport.player, transport.x, transport.y);
  return true;
}

export function canIssueLoadTransport(transport: WorldUnit): boolean {
  return isTransport(transport) && transport.cargo.length < transport.cargoCapacity;
}

export function issueUnloadTransportOrder(world: WorldState, transportId: string): boolean {
  const transport = findUnit(world, transportId);
  if (!transport || !canIssueUnloadTransport(transport)) {
    return false;
  }
  if (unloadTransportCargoNear(world, transport, worldToTile(world, transport.x, transport.y))) {
    return true;
  }
  transport.moveQueue = [];
  transport.order = sourceUnloadOrderAtCurrentTile(world, transport);
  return true;
}

export function issueUnloadTransportAtOrder(world: WorldState, transportId: string, x: number, y: number): boolean {
  const transport = findUnit(world, transportId);
  if (!transport || !canIssueUnloadTransport(transport)) {
    return false;
  }
  const clampedX = Math.max(0, Math.min(world.map.width * world.tileSize, x));
  const clampedY = Math.max(0, Math.min(world.map.height * world.tileSize, y));
  const dropZone = closestFreeDropZone(world, transport, worldToTile(world, clampedX, clampedY), SOURCE_UNLOAD_DROPZONE_MAX_RANGE);
  if (!dropZone) {
    return false;
  }
  const dropZonePoint = tileToWorldCenter(world, dropZone.x, dropZone.y);
  const path = findPath(world, transport, dropZonePoint.x, dropZonePoint.y);
  if (path.length === 0) {
    return false;
  }
  const finalWaypoint = path[path.length - 1];
  if (Math.hypot(transport.x - finalWaypoint.x, transport.y - finalWaypoint.y) <= world.tileSize * 1.25) {
    return unloadTransportCargoNear(world, transport, dropZone);
  }
  transport.moveQueue = [];
  transport.order = {
    kind: "unload-transport",
    unloadCargoUnitId: null,
    unloadState: "move",
    unloadRetries: 0,
    targetX: dropZonePoint.x,
    targetY: dropZonePoint.y,
    path,
    pathIndex: path.length > 1 ? 1 : 0
  };
  return true;
}

export function canIssueUnloadTransportAt(world: WorldState, transport: WorldUnit, x: number, y: number): boolean {
  if (!canIssueUnloadTransport(transport)) {
    return false;
  }
  const clampedX = Math.max(0, Math.min(world.map.width * world.tileSize, x));
  const clampedY = Math.max(0, Math.min(world.map.height * world.tileSize, y));
  const dropZone = closestFreeDropZone(world, transport, worldToTile(world, clampedX, clampedY), SOURCE_UNLOAD_DROPZONE_MAX_RANGE);
  if (!dropZone) {
    return false;
  }
  const dropZonePoint = tileToWorldCenter(world, dropZone.x, dropZone.y);
  return findPath(world, transport, dropZonePoint.x, dropZonePoint.y).length > 0;
}

export function canIssueQueueUnloadTransportAt(world: WorldState, transport: WorldUnit, x: number, y: number): boolean {
  if (!canIssueUnloadTransport(transport)) {
    return false;
  }
  const clampedX = Math.max(0, Math.min(world.map.width * world.tileSize, x));
  const clampedY = Math.max(0, Math.min(world.map.height * world.tileSize, y));
  const dropZone = closestFreeDropZone(world, transport, worldToTile(world, clampedX, clampedY), SOURCE_UNLOAD_DROPZONE_MAX_RANGE);
  if (!dropZone) {
    return false;
  }
  const dropZonePoint = tileToWorldCenter(world, dropZone.x, dropZone.y);
  const origin = queuedPathOrigin(transport);
  const pathingTransport = origin ? { ...transport, x: origin.x, y: origin.y } : transport;
  return findPath(world, pathingTransport, dropZonePoint.x, dropZonePoint.y).length > 0;
}

export function canSelectedIssueUnloadTransportAt(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  return unitIds
    .map((id) => findUnit(world, id))
    .some((unit): boolean => Boolean(unit
      && unit.player === playerId
      && !unit.construction
      && canIssueUnloadTransportAt(world, unit, x, y)));
}

export function issueGroupUnloadTransportOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  const transports = selectedUnitsForPlayer(world, unitIds, playerId);
  if (transports.length === 0) {
    return false;
  }
  const destinations = formationDestinations(world, transports, x, y);
  let issued = false;
  transports.forEach((transport) => {
    const destination = destinations.get(transport.id) ?? { x, y };
    issued = (canIssueUnloadTransportAt(world, transport, destination.x, destination.y) && issueUnloadTransportAtOrder(world, transport.id, destination.x, destination.y)) || issued;
  });
  return issued;
}

export function issueGroupQueueUnloadTransportOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean {
  const transports = selectedUnitsForPlayer(world, unitIds, playerId);
  if (transports.length === 0) {
    return false;
  }
  const destinations = formationDestinations(world, transports, x, y);
  let issued = false;
  transports.forEach((transport) => {
    const destination = destinations.get(transport.id) ?? { x, y };
    issued = (canIssueQueueUnloadTransportAt(world, transport, destination.x, destination.y) && issueQueueUnloadTransportAtOrder(world, transport.id, destination.x, destination.y)) || issued;
  });
  return issued;
}

export function canIssueUnloadTransport(transport: WorldUnit): boolean {
  return isTransport(transport) && transport.cargo.length > 0;
}

export function canIssueUnloadCargoUnit(transport: WorldUnit, cargoUnitId: string): boolean {
  return canIssueUnloadTransport(transport) && transport.cargo.some((unit) => unit.id === cargoUnitId);
}

function unloadableCargoUnits(transport: WorldUnit, cargoUnitId: string | null = null): WorldUnit[] {
  return cargoUnitId ? transport.cargo.filter((unit) => unit.id === cargoUnitId) : transport.cargo;
}

function hasUnloadSpaceForAnyCargoNear(world: WorldState, transport: WorldUnit, center: { x: number; y: number }, cargoUnitId: string | null = null): boolean {
  return unloadableCargoUnits(transport, cargoUnitId).some((unit) => Boolean(findUnloadTileNear(world, center, unit, [], SOURCE_UNLOAD_UNIT_MAX_RANGE)));
}

function closestFreeDropZone(world: WorldState, transport: WorldUnit, start: { x: number; y: number }, maxRange: number, cargoUnitId: string | null = null): { x: number; y: number } | null {
  if (unloadableCargoUnits(transport, cargoUnitId).length === 0) {
    return null;
  }
  for (let radius = 0; radius <= maxRange; radius += 1) {
    for (let y = start.y - radius; y <= start.y + radius; y += 1) {
      for (let x = start.x - radius; x <= start.x + radius; x += 1) {
        const onRing = radius === 0 || x === start.x - radius || x === start.x + radius || y === start.y - radius || y === start.y + radius;
        if (!onRing || x < 0 || y < 0 || x >= world.map.width || y >= world.map.height) {
          continue;
        }
        if (isTilePassable(world, x, y, movementKindForUnit(transport), transport.id) && hasUnloadSpaceForAnyCargoNear(world, transport, { x, y }, cargoUnitId)) {
          return { x, y };
        }
      }
    }
  }
  return null;
}

function sourceUnloadOrderAtCurrentTile(world: WorldState, transport: WorldUnit, cargoUnitId: string | null = null): WorldUnit["order"] {
  const center = worldToTile(world, transport.x, transport.y);
  const point = tileToWorldCenter(world, center.x, center.y);
  return {
    kind: "unload-transport",
    unloadCargoUnitId: cargoUnitId,
    unloadState: "find-dropzone",
    unloadRetries: 0,
    targetX: point.x,
    targetY: point.y,
    path: [],
    pathIndex: 0
  };
}

function unloadTransportCargoNear(world: WorldState, transport: WorldUnit, center: { x: number; y: number }, cargoUnitId: string | null = null): boolean {
  const unloaded: WorldUnit[] = [];
  const remaining: WorldUnit[] = [];
  for (const unit of transport.cargo) {
    if (cargoUnitId && unit.id !== cargoUnitId) {
      remaining.push(unit);
      continue;
    }
    const tile = findUnloadTileNear(world, center, unit, unloaded, SOURCE_UNLOAD_UNIT_MAX_RANGE);
    if (!tile) {
      remaining.push(unit);
      continue;
    }
    unit.x = tile.x * world.tileSize + world.tileSize / 2;
    unit.y = tile.y * world.tileSize + world.tileSize / 2;
    unit.order = null;
    unit.moveQueue = [];
    unloaded.push(unit);
  }
  if (unloaded.length === 0) {
    return false;
  }
  transport.cargo = remaining;
  world.units.push(...unloaded);
  transport.order = null;
  world.events.push({ kind: "units-unloaded", unitIds: unloaded.map((unit) => unit.id), transportId: transport.id, player: transport.player });
  emitSoundEvent(world, "transport-docking", transport.player, transport.x, transport.y);
  return true;
}

export function canTrainUnitAt(world: WorldState, buildingId: string, unitTypeId: string, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean {
  const building = findUnit(world, buildingId);
  const player = building ? world.players.find((candidate) => candidate.id === building.player) : undefined;
  const unitDefinition = unitDefinitions.find((unit) => unit.id === unitTypeId);
  if (!building || !player || !isUsableProductionBuilding(building) || isBuildingResearching(world, buildingId) || building.productionQueue.length >= productionQueueLimitForEngine(world.engineSettings) || !unitDefinition || !canProduceUnitType(world, building, unitTypeId) || !isUnitTypeAllowed(world, unitTypeId, player.id) || !hasTrainGatePrerequisites(world, player.id, unitTypeId) || !canAfford(player.resources, unitDefinition.costs)) {
    return false;
  }
  if (isProducerTransformationFor(world, building, unitTypeId) && building.productionQueue.length > 0) {
    return false;
  }
  if (!isProducerTransformationFor(world, building, unitTypeId) && !canCreateUnitWithinSourceLimits(world, building.player, unitDefinition)) {
    return false;
  }
  const supply = getPlayerSupply(world, player.id);
  if (isProducerTransformationFor(world, building, unitTypeId)) {
    const transformedUsed = supply.used + supply.queued - building.demand + unitDefinition.demand;
    const transformedCap = supply.cap - (building.construction ? 0 : building.supply) + unitDefinition.supply;
    return transformedUsed <= transformedCap;
  }
  if (unitDefinition.demand > 0 && supply.used + supply.queued + unitDefinition.demand > supply.cap) {
    return false;
  }
  return true;
}

export function issueTrainUnitOrder(world: WorldState, buildingId: string, unitTypeId: string, unitDefinitions: WargusUnit[]): boolean {
  const building = findUnit(world, buildingId);
  const player = building ? world.players.find((candidate) => candidate.id === building.player) : undefined;
  const unitDefinition = unitDefinitions.find((unit) => unit.id === unitTypeId);
  if (!building || !player || !unitDefinition || !canTrainUnitAt(world, buildingId, unitTypeId, unitDefinitions)) {
    return false;
  }
  spendResources(player.resources, unitDefinition.costs);
  const totalSeconds = isProducerTransformationFor(world, building, unitDefinition.id)
    ? sourceUpgradeDurationSecondsForPlayer(world, building.player, unitDefinition.costs)
    : sourceTrainDurationSecondsForPlayer(world, building.player, unitDefinition.costs);
  building.productionQueue.push({ unitTypeId, remainingSeconds: totalSeconds, totalSeconds });
  return true;
}

function canQueueUpgradeToAt(world: WorldState, building: WorldUnit, unitTypeId: string, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean {
  const player = world.players.find((candidate) => candidate.id === building.player);
  const unitDefinition = unitDefinitions.find((unit) => unit.id === unitTypeId);
  if (!player || !unitDefinition || !isUsableProductionBuilding(building) || isBuildingResearching(world, building.id) || building.productionQueue.length >= productionQueueLimitForEngine(world.engineSettings)) {
    return false;
  }
  if (!isProducerTransformationFor(world, building, unitTypeId) || !canProduceUnitType(world, building, unitTypeId) || !isUnitTypeAllowed(world, unitTypeId, player.id) || !hasTrainGatePrerequisites(world, player.id, unitTypeId) || !canAfford(player.resources, unitDefinition.costs)) {
    return false;
  }
  const supply = getPlayerSupply(world, player.id);
  const transformedUsed = supply.used + supply.queued - building.demand + unitDefinition.demand;
  const transformedCap = supply.cap - (building.construction ? 0 : building.supply) + unitDefinition.supply;
  return transformedUsed <= transformedCap;
}

function issueQueueUpgradeToOrder(world: WorldState, buildingId: string, unitTypeId: string, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean {
  const building = findUnit(world, buildingId);
  const player = building ? world.players.find((candidate) => candidate.id === building.player) : undefined;
  const unitDefinition = unitDefinitions.find((unit) => unit.id === unitTypeId);
  if (!building || !player || !unitDefinition || !canQueueUpgradeToAt(world, building, unitTypeId, unitDefinitions)) {
    return false;
  }
  spendResources(player.resources, unitDefinition.costs);
  const totalSeconds = sourceUpgradeDurationSecondsForPlayer(world, building.player, unitDefinition.costs);
  building.productionQueue.push({ unitTypeId, remainingSeconds: totalSeconds, totalSeconds });
  return true;
}

export function issueBuildOrder(world: WorldState, builderId: string, buildingTypeId: string, unitDefinitions: WargusUnit[]): boolean {
  const builder = findUnit(world, builderId);
  const player = builder ? world.players.find((candidate) => candidate.id === builder.player) : undefined;
  const buildingDefinition = unitDefinitions.find((unit) => unit.id === buildingTypeId);
  if (!builder || !player || !buildingDefinition || !canStartBuildingPlacement(world, builder, buildingDefinition)) {
    return false;
  }

  const placement = findBuildPlacement(world, builder, buildingDefinition);
  if (!placement) {
    return false;
  }

  return placeBuilding(world, builder, player, buildingDefinition, placement.x, placement.y);
}

export function issueBuildAtOrder(world: WorldState, builderId: string, buildingTypeId: string, x: number, y: number, unitDefinitions: WargusUnit[]): boolean {
  const builder = findUnit(world, builderId);
  const player = builder ? world.players.find((candidate) => candidate.id === builder.player) : undefined;
  const buildingDefinition = unitDefinitions.find((unit) => unit.id === buildingTypeId);
  if (!builder || !player || !buildingDefinition || !canStartBuildingPlacement(world, builder, buildingDefinition)) {
    return false;
  }

  const width = Math.max(1, buildingDefinition.tileSize[0]);
  const height = Math.max(1, buildingDefinition.tileSize[1]);
  const tileX = Math.floor(x / world.tileSize - width / 2);
  const tileY = Math.floor(y / world.tileSize - height / 2);
  if (!canPlaceReachableBuilding(world, builder, buildingDefinition, tileX, tileY)) {
    return false;
  }

  return placeBuilding(world, builder, player, buildingDefinition, tileX, tileY);
}

function startQueuedBuildAtOrder(world: WorldState, builder: WorldUnit, buildingTypeId: string, x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean {
  const player = world.players.find((candidate) => candidate.id === builder.player);
  const buildingDefinition = unitDefinitions.find((unit) => unit.id === buildingTypeId);
  if (!player || !buildingDefinition || !canStartBuildingPlacement(world, builder, buildingDefinition)) {
    return false;
  }

  const width = Math.max(1, buildingDefinition.tileSize[0]);
  const height = Math.max(1, buildingDefinition.tileSize[1]);
  const tileX = Math.floor(x / world.tileSize - width / 2);
  const tileY = Math.floor(y / world.tileSize - height / 2);
  if (!canPlaceReachableBuilding(world, builder, buildingDefinition, tileX, tileY)) {
    return false;
  }

  return placeBuilding(world, builder, player, buildingDefinition, tileX, tileY, { clearQueue: false });
}

export function issueSelectedBuildAtOrder(world: WorldState, unitIds: string[], buildingTypeId: string, x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions, playerId = world.visibilityPlayer): boolean {
  const builder = findSelectedSourceBuilder(world, unitIds, playerId);
  return builder ? issueBuildAtOrder(world, builder.id, buildingTypeId, x, y, unitDefinitions) : false;
}

export function issueGroupBuildAtOrder(world: WorldState, unitIds: string[], buildingTypeId: string, x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions, playerId = world.visibilityPlayer): boolean {
  return issueSelectedBuildAtOrder(world, unitIds, buildingTypeId, x, y, unitDefinitions, playerId);
}

export function canSelectedPlaceBuildingAtPoint(world: WorldState, unitIds: string[], buildingTypeId: string, x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions, playerId = world.visibilityPlayer): boolean {
  const builder = findSelectedSourceBuilder(world, unitIds, playerId);
  return Boolean(builder && canPlaceBuildingAtPoint(world, builder, buildingTypeId, x, y, unitDefinitions));
}

export function buildingTypeForSourceBuildCommand(world: WorldState, buildingTypeId: string, unitIds: string[], playerId = world.visibilityPlayer): string | null {
  const builder = findSelectedSourceBuilder(world, unitIds, playerId);
  return builder && canStartSourceBuildPlacementByType(world, builder, buildingTypeId) ? buildingTypeId : null;
}

export function pendingBuildCommandForSourceBuildType(world: WorldState, buildingTypeId: string, unitIds: string[], playerId = world.visibilityPlayer): PendingWorldCommand | null {
  const sourceBuildingTypeId = buildingTypeForSourceBuildCommand(world, buildingTypeId, unitIds, playerId);
  if (!sourceBuildingTypeId) {
    return null;
  }
  if (isOilPlatformBuildingType(world, sourceBuildingTypeId)) {
    return canEnterPendingWorldCommand(world, unitIds, "build-oil-platform", playerId) ? "build-oil-platform" : null;
  }
  return { kind: "build", buildingTypeId: sourceBuildingTypeId };
}

export function buildingTypeForWorkerHotkey(world: WorldState, code: string, unitIds: string[], page: number, playerId = world.visibilityPlayer): string | null {
  const worker = findSelectedSourceBuilder(world, unitIds, playerId);
  if (!worker) {
    return null;
  }
  const sourceBuildingTypeId = sourceBuildTypeForKey(world, worker, code, page);
  if (sourceBuildingTypeId) {
    return sourceBuildingTypeId;
  }
  const sourceRoleBuildingTypeId = sourceBuildTypeForPageKeyRole(world, worker, code, page);
  if (sourceRoleBuildingTypeId) {
    return sourceRoleBuildingTypeId;
  }
  const race = world.players.find((player) => player.id === worker.player)?.race;
  const human = race === "human";
  const basicBuildingsByKey: Record<string, string> = {
    KeyF: human ? "unit-farm" : "unit-pig-farm",
    KeyB: human ? "unit-human-barracks" : "unit-orc-barracks",
    KeyH: human ? "unit-town-hall" : "unit-great-hall",
    KeyL: human ? "unit-elven-lumber-mill" : "unit-troll-lumber-mill",
    KeyS: human ? "unit-human-blacksmith" : "unit-orc-blacksmith",
    KeyT: human ? "unit-human-watch-tower" : "unit-orc-watch-tower",
    KeyW: human ? "unit-human-wall" : "unit-orc-wall"
  };
  const advancedBuildingsByKey: Record<string, string> = {
    KeyS: human ? "unit-human-shipyard" : "unit-orc-shipyard",
    KeyF: human ? "unit-human-foundry" : "unit-orc-foundry",
    KeyR: human ? "unit-human-refinery" : "unit-orc-refinery",
    KeyI: "unit-inventor",
    KeyA: human ? "unit-stables" : "unit-alchemist",
    KeyO: "unit-ogre-mound",
    KeyM: "unit-mage-tower",
    KeyT: "unit-temple-of-the-damned",
    KeyC: "unit-church",
    KeyL: "unit-altar-of-storms",
    KeyG: "unit-gryphon-aviary",
    KeyD: "unit-dragon-roost"
  };
  const buildingByKey = page === 2 ? advancedBuildingsByKey : page === 1 ? basicBuildingsByKey : {};
  const buildingTypeId = buildingByKey[code] ?? null;
  return buildingTypeId && canStartBuildingPlacementByType(world, worker, buildingTypeId) ? buildingTypeId : null;
}

export function sourceBuildTypeForKey(world: WorldState, unit: WorldUnit, code: string, page?: number): string | null {
  const key = keyNameFromCode(code);
  if (!key) {
    return null;
  }
  const sourceButtons = world.buttonDefinitions
    .filter((button) => button.action === "build" && button.key?.toUpperCase() === key && sourceButtonAppliesTo(button, unit.typeId))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, unit.player))
    .filter((button) => sourceBuildButtonMatchesPage(world, button, unit.player, page))
    .sort(compareSourceButtons);
  for (const button of sourceButtons) {
    if (button.value && canStartSourceBuildPlacementByType(world, unit, button.value)) {
      return button.value;
    }
  }
  return null;
}

function sourceBuildTypeForPageKeyRole(world: WorldState, unit: WorldUnit, code: string, page: number): string | null {
  const matchesBuilding = sourceBuildMatcherForPageKey(world, unit, code, page);
  return matchesBuilding ? sourceBuildTypeForRole(world, unit, matchesBuilding) : null;
}

function sourceBuildMatcherForPageKey(world: WorldState, unit: WorldUnit, code: string, page: number): ((definition: WargusUnit) => boolean) | null {
  if (page === 1) {
    if (code === "KeyF") return isSupplyProviderDefinition;
    if (code === "KeyB") return (definition) => sourceBuildDefinitionProducesMatching(world, definition.id, isOrdinaryBarracksCombatDefinition, unit.player);
    if (code === "KeyH") return (definition) => isBaseTownCenterDefinition(world, definition, unit.player);
    if (code === "KeyL") return (definition) => sourceBuildDefinitionResearchesMatching(world, definition.id, (upgradeId) => isLumberMillUpgradeId(world, upgradeId), unit.player);
    if (code === "KeyS") return (definition) => sourceBuildDefinitionResearchesMatching(world, definition.id, (upgradeId) => isBlacksmithUpgradeId(world, upgradeId), unit.player);
    if (code === "KeyT") return (definition) => sourceBuildDefinitionUpgradesToMatching(world, definition.id, isDefensiveBuildingDefinition, unit.player);
    if (code === "KeyW") return isWallDefinition;
    return null;
  }
  if (page !== 2) {
    return null;
  }
  const human = world.players.find((player) => player.id === unit.player)?.race !== "orc";
  if (code === "KeyS") return (definition) => sourceBuildDefinitionProducesMatching(world, definition.id, isNavalCombatOrUtilityDefinition, unit.player);
  if (code === "KeyF") return (definition) => sourceBuildDefinitionResearchesMatching(world, definition.id, (upgradeId) => isShipUpgradeId(world, upgradeId), unit.player);
  if (code === "KeyR") return isOilRefineryDefinition;
  if ((human && code === "KeyI") || (!human && code === "KeyA")) return (definition) => sourceBuildDefinitionProducesMatching(world, definition.id, isDemolitionLabDefinition, unit.player);
  if ((human && code === "KeyA") || (!human && code === "KeyO")) return (definition) => sourceBuildDefinitionProducesMatching(world, definition.id, isAdvancedMeleeCombatDefinition, unit.player);
  if ((human && code === "KeyM") || (!human && code === "KeyT")) return (definition) => sourceBuildDefinitionProducesMatching(world, definition.id, isCasterDefinition, unit.player);
  if ((human && code === "KeyC") || (!human && code === "KeyL")) return (definition) => sourceBuildDefinitionResearchesMatching(world, definition.id, (upgradeId) => isHolyResearchUpgradeId(world, upgradeId), unit.player);
  if ((human && code === "KeyG") || (!human && code === "KeyD")) return (definition) => sourceBuildDefinitionProducesMatching(world, definition.id, isAirCombatDefinition, unit.player);
  return null;
}

function sourceBuildTypeForRole(world: WorldState, unit: WorldUnit, matchesBuilding: (definition: WargusUnit) => boolean): string | null {
  return sourceBuildCandidatesForBuilder(world, unit)
    .filter((entry) => matchesBuilding(entry.definition))
    .sort(compareSourceBuildCandidates)[0]?.definition.id ?? null;
}

export function issueBuildOrderBySourceRole(world: WorldState, unit: WorldUnit, matchesBuilding: (definition: WargusUnit) => boolean, fallbackBuildingTypeId: string, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean {
  const sourceBuildingTypeId = sourceBuildTypeForRole(world, unit, matchesBuilding);
  if (sourceBuildingTypeId) {
    return issueBuildOrder(world, unit.id, sourceBuildingTypeId, unitDefinitions);
  }
  return hasSourceBuildButtonsForUnit(world, unit) ? false : issueBuildOrder(world, unit.id, fallbackBuildingTypeId, unitDefinitions);
}

function sourceBuildButtonMatchesPage(world: WorldState, button: WargusButton, playerId: number, page?: number): boolean {
  if (page === undefined) {
    return true;
  }
  if (page === 0) {
    return button.level === 0 && buildButtonPage(world, button.value, playerId) === null;
  }
  if (button.level > 0) {
    return button.level === page;
  }
  return buildButtonPage(world, button.value, playerId) === page;
}

function buildButtonPage(world: WorldState, buildingTypeId: string | null, playerId = world.visibilityPlayer): number | null {
  if (!buildingTypeId) {
    return null;
  }
  const definition = world.unitDefinitions.find((unit) => unit.id === buildingTypeId);
  if (!definition) {
    return null;
  }
  if (isBasicBuildPageDefinition(world, definition, playerId)) {
    return 1;
  }
  if (isAdvancedBuildPageDefinition(world, definition, playerId)) {
    return 2;
  }
  return null;
}

function isBasicBuildPageDefinition(world: WorldState, definition: WargusUnit, playerId = world.visibilityPlayer): boolean {
  return (definition.mainFacility && townCenterTier(world, definition.id, playerId) === 1)
    || isSupplyProviderDefinition(definition)
    || isWallDefinition(definition)
    || sourceBuildDefinitionProducesMatching(world, definition.id, isOrdinaryBarracksCombatDefinition, playerId)
    || sourceBuildDefinitionResearchesMatching(world, definition.id, (upgradeId) => isLumberMillUpgradeId(world, upgradeId), playerId)
    || sourceBuildDefinitionResearchesMatching(world, definition.id, (upgradeId) => isBlacksmithUpgradeId(world, upgradeId), playerId)
    || sourceBuildDefinitionUpgradesToMatching(world, definition.id, isDefensiveBuildingDefinition, playerId);
}

function isAdvancedBuildPageDefinition(world: WorldState, definition: WargusUnit, playerId = world.visibilityPlayer): boolean {
  return sourceBuildDefinitionProducesMatching(world, definition.id, isNavalCombatOrUtilityDefinition, playerId)
    || sourceBuildDefinitionResearchesMatching(world, definition.id, (upgradeId) => isShipUpgradeId(world, upgradeId), playerId)
    || isOilRefineryDefinition(definition)
    || sourceBuildDefinitionProducesMatching(world, definition.id, isDemolitionLabDefinition, playerId)
    || sourceBuildDefinitionProducesMatching(world, definition.id, isAdvancedMeleeCombatDefinition, playerId)
    || sourceBuildDefinitionProducesMatching(world, definition.id, isCasterDefinition, playerId)
    || sourceBuildDefinitionResearchesMatching(world, definition.id, (upgradeId) => isHolyResearchUpgradeId(world, upgradeId), playerId)
    || sourceBuildDefinitionProducesMatching(world, definition.id, isAirCombatDefinition, playerId);
}

export function sourceBuildTypeForHudCommand(world: WorldState, command: string, unitIds: string[], playerId = world.visibilityPlayer): string | null {
  const worker = findSelectedSourceBuilder(world, unitIds, playerId);
  if (!worker) {
    return null;
  }
  const matchesBuilding = sourceBuildMatcherForHudCommand(world, command, worker.player);
  if (!matchesBuilding) {
    return null;
  }
  const sourceButton = world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "build" && typeof button.value === "string")
    .filter((button) => sourceButtonAppliesTo(button, worker.typeId))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, worker.player))
    .filter((button) => canStartSourceBuildPlacementByType(world, worker, button.value))
    .filter((button) => {
      const building = world.unitDefinitions.find((definition) => definition.id === button.value);
      return Boolean(building && matchesBuilding(building));
    })
    .sort(compareSourceButtons)[0];
  return sourceButton?.value ?? null;
}

export function sourceBuildMatcherForHudCommand(world: WorldState, command: string, playerId: number): ((definition: WargusUnit) => boolean) | null {
  switch (command) {
    case "build-farm":
      return isSupplyProviderDefinition;
    case "build-barracks":
      return (definition) => sourceBuildDefinitionProducesMatching(world, definition.id, isOrdinaryBarracksCombatDefinition, playerId);
    case "build-lumber-mill":
      return (definition) => sourceBuildDefinitionResearchesMatching(world, definition.id, (upgradeId) => isLumberMillUpgradeId(world, upgradeId), playerId);
    case "build-blacksmith":
      return (definition) => sourceBuildDefinitionResearchesMatching(world, definition.id, (upgradeId) => isBlacksmithUpgradeId(world, upgradeId), playerId);
    case "build-wall":
      return isWallDefinition;
    case "build-guard-tower":
      return (definition) => sourceBuildDefinitionUpgradesToMatching(world, definition.id, isDefensiveBuildingDefinition, playerId);
    case "build-shipyard":
      return (definition) => sourceBuildDefinitionProducesMatching(world, definition.id, isNavalCombatOrUtilityDefinition, playerId);
    case "build-foundry":
      return (definition) => sourceBuildDefinitionResearchesMatching(world, definition.id, (upgradeId) => isShipUpgradeId(world, upgradeId), playerId);
    case "build-refinery":
      return isOilRefineryDefinition;
    case "build-oil-platform":
      return (definition) => isOilPlatformDefinition(definition, world.unitDefinitions);
    case "build-siege-lab":
      return (definition) => sourceBuildDefinitionProducesMatching(world, definition.id, isDemolitionLabDefinition, playerId);
    case "build-advanced":
      return (definition) => sourceBuildDefinitionProducesMatching(world, definition.id, isAdvancedMeleeCombatDefinition, playerId);
    case "build-caster-building":
      return (definition) => sourceBuildDefinitionProducesMatching(world, definition.id, isCasterDefinition, playerId);
    case "build-holy-building":
      return (definition) => sourceBuildDefinitionResearchesMatching(world, definition.id, (upgradeId) => isHolyResearchUpgradeId(world, upgradeId), playerId);
    case "build-air-building":
      return (definition) => sourceBuildDefinitionProducesMatching(world, definition.id, isAirCombatDefinition, playerId);
    default:
      return null;
  }
}

export function sourceTrainMatcherForHudCommand(world: WorldState, command: string): ((definition: WargusUnit) => boolean) | null {
  switch (command) {
    case "train-melee":
      return (definition) => isOrdinaryBarracksCombatDefinition(definition) && isMeleeLandCombatDefinition(definition) && !isSourceConversionTarget(world, definition.id);
    case "train-ranged":
      return (definition) => isOrdinaryBarracksCombatDefinition(definition) && isRangedLandCombatDefinition(definition) && !isSourceConversionTarget(world, definition.id);
    case "train-ranged-veteran":
      return (definition) => isOrdinaryBarracksCombatDefinition(definition) && isRangedLandCombatDefinition(definition) && isSourceConversionTarget(world, definition.id);
    case "train-cavalry-veteran":
      return (definition) => isAdvancedMeleeCombatDefinition(definition) && isSourceConversionTarget(world, definition.id);
    case "train-cavalry":
      return (definition) => isAdvancedMeleeCombatDefinition(definition) && !isSourceConversionTarget(world, definition.id);
    case "train-tanker":
      return (definition) => isNavalRoleDefinition(definition, "tanker");
    case "train-destroyer":
      return (definition) => isNavalRoleDefinition(definition, "destroyer");
    case "train-warship":
      return (definition) => isNavalRoleDefinition(definition, "warship");
    case "train-transport":
      return (definition) => isNavalRoleDefinition(definition, "transport");
    case "train-submarine":
      return (definition) => isNavalRoleDefinition(definition, "submarine");
    case "train-caster":
      return isCasterDefinition;
    case "train-air":
      return isAirCombatDefinition;
    case "train-demolition":
      return isDemolitionUnitDefinition;
    case "train-siege":
      return isSiegeDefinition;
    case "train-scout-air":
      return isScoutAirDefinition;
    default:
      return null;
  }
}

export function sourceResearchMatcherForHudCommand(world: WorldState, command: string): ((upgradeId: string) => boolean) | null {
  switch (command) {
    case "research-melee":
      return (upgradeId) => isMeleeWeaponResearchUpgrade(world, upgradeId);
    case "research-armor":
      return (upgradeId) => isShieldResearchUpgrade(world, upgradeId);
    case "research-ranged":
      return (upgradeId) => isLumberMillUpgradeId(world, upgradeId);
    case "research-siege":
      return (upgradeId) => isSiegeResearchUpgrade(world, upgradeId);
    case "research-paladin":
      return (upgradeId) => isHolyTransformationResearchUpgradeId(world, upgradeId);
    case "research-healing":
      return (upgradeId) => spellResearchUpgradeMatches(world, upgradeId, "spell-healing", "upgrade-healing");
    case "research-exorcism":
      return (upgradeId) => spellResearchUpgradeMatches(world, upgradeId, "spell-exorcism", "upgrade-exorcism");
    case "research-holy-vision":
      return (upgradeId) => spellResearchUpgradeMatches(world, upgradeId, "spell-holy-vision", "upgrade-holy-vision");
    case "research-flame-shield":
      return (upgradeId) => spellResearchUpgradeMatches(world, upgradeId, "spell-flame-shield", "upgrade-flame-shield");
    case "research-blizzard":
      return (upgradeId) => spellResearchUpgradeMatches(world, upgradeId, "spell-blizzard", "upgrade-blizzard");
    case "research-polymorph":
      return (upgradeId) => spellResearchUpgradeMatches(world, upgradeId, "spell-polymorph", "upgrade-polymorph");
    case "research-invisibility":
      return (upgradeId) => spellResearchUpgradeMatches(world, upgradeId, "spell-invisibility", "upgrade-invisibility");
    case "research-slow":
      return (upgradeId) => spellResearchUpgradeMatches(world, upgradeId, "spell-slow", "upgrade-slow");
    case "research-death-coil":
      return (upgradeId) => spellResearchUpgradeMatches(world, upgradeId, "spell-death-coil", "upgrade-death-coil");
    case "research-death-magic":
      return (upgradeId) => spellResearchUpgradeMatches(world, upgradeId, "spell-death-and-decay", "upgrade-death-and-decay");
    case "research-whirlwind":
      return (upgradeId) => spellResearchUpgradeMatches(world, upgradeId, "spell-whirlwind", "upgrade-whirlwind");
    case "research-raise-dead":
      return (upgradeId) => spellResearchUpgradeMatches(world, upgradeId, "spell-raise-dead", "upgrade-raise-dead");
    case "research-unholy-armor":
      return (upgradeId) => spellResearchUpgradeMatches(world, upgradeId, "spell-unholy-armor", "upgrade-unholy-armor");
    case "research-haste":
      return (upgradeId) => spellResearchUpgradeMatches(world, upgradeId, "spell-haste", "upgrade-haste");
    case "research-bloodlust":
      return (upgradeId) => spellResearchUpgradeMatches(world, upgradeId, "spell-bloodlust", "upgrade-bloodlust");
    case "research-runes":
      return (upgradeId) => spellResearchUpgradeMatches(world, upgradeId, "spell-runes", "upgrade-runes");
    case "research-eye-of-kilrogg":
      return (upgradeId) => spellResearchUpgradeMatches(world, upgradeId, "spell-eye-of-vision", "upgrade-eye-of-kilrogg");
    case "research-ship-cannon":
      return (upgradeId) => isShipCannonResearchUpgradeId(world, upgradeId);
    case "research-ship-armor":
      return (upgradeId) => isShipArmorResearchUpgradeId(world, upgradeId);
    default:
      return null;
  }
}

export function sourceTowerUpgradeTargetForTypes(world: WorldState, typeIds: Iterable<string>, playerId: number, role: "guard" | "cannon"): string | null {
  const sourceButton = world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "upgrade-to" && Boolean(button.value))
    .filter((button) => sourceButtonAppliesToAnyType(button, typeIds))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, playerId))
    .filter((button) => sourceUpgradeButtonMatchesRole(world, button, role))
    .sort(compareSourceButtons)[0];
  return sourceButton?.value ?? null;
}

export function sourceTownUpgradeTargetForTypes(world: WorldState, typeIds: Iterable<string>, playerId: number): string | null {
  const sourceButton = world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "upgrade-to" && Boolean(button.value))
    .filter((button) => sourceButtonAppliesToAnyType(button, typeIds))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, playerId))
    .filter((button) => world.unitDefinitions.some((unit) => unit.id === button.value && unit.mainFacility))
    .sort(compareSourceButtons)[0];
  return sourceButton?.value ?? null;
}

export function hasSourceUpgradeButtonsForTypes(world: WorldState, typeIds: Iterable<string>, playerId: number): boolean {
  return world.buttonDefinitions.some((button) => (
    button.action === "upgrade-to"
    && sourceButtonAppliesToAnyType(button, typeIds)
    && sourceButtonAllowedForSimulation(world, button, playerId)
  ));
}

export function sourceWorkerTrainTargetForTypes(world: WorldState, typeIds: Iterable<string>, playerId: number): string | null {
  const sourceButton = world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "train-unit" && Boolean(button.value))
    .filter((button) => sourceButtonAppliesToAnyType(button, typeIds))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, playerId))
    .filter((button) => world.unitDefinitions.some((definition) => definition.id === button.value && isGoldOrWoodWorkerDefinition(definition)))
    .sort(compareSourceButtons)[0];
  return sourceButton?.value ?? null;
}

export function sourceTrainTargetForTypes(world: WorldState, typeIds: Iterable<string>, playerId: number, unitTypeId: string): string | null {
  const sourceButton = world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "train-unit" && button.value === unitTypeId)
    .filter((button) => sourceButtonAppliesToAnyType(button, typeIds))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, playerId))
    .sort(compareSourceButtons)[0];
  return sourceButton?.value ?? null;
}

export function hasSourceTrainButtonsForTypes(world: WorldState, typeIds: Iterable<string>, playerId: number): boolean {
  return world.buttonDefinitions.some((button) => (
    button.action === "train-unit"
    && sourceButtonAppliesToAnyType(button, typeIds)
    && sourceButtonAllowedForSimulation(world, button, playerId)
  ));
}

export function sourceTrainTargetForHudCommand(world: WorldState, typeIds: Iterable<string>, playerId: number, command: string): string | null {
  const matchesUnit = sourceTrainMatcherForHudCommand(world, command);
  if (!matchesUnit) {
    return null;
  }
  const sourceButton = world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "train-unit" && Boolean(button.value))
    .filter((button) => sourceButtonAppliesToAnyType(button, typeIds))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, playerId))
    .filter((button) => world.unitDefinitions.some((definition) => definition.id === button.value && matchesUnit(definition)))
    .sort(compareSourceButtons)[0];
  return sourceButton?.value ?? null;
}

export function sourceFallbackTrainTargetForHudCommand(world: WorldState, selectedUnits: WorldUnit[], command: string): string | null {
  const matchesUnit = sourceTrainMatcherForHudCommand(world, command);
  if (!matchesUnit) {
    return null;
  }
  return selectedUnits
    .flatMap((unit) => world.unitDefinitions
      .filter((definition) => matchesUnit(definition) && canTrainUnitAt(world, unit.id, definition.id))
      .map((definition) => definition.id))
    .sort((left, right) => left.localeCompare(right))[0] ?? null;
}

export function sourceBuildTargetForHudCommand(world: WorldState, typeIds: Iterable<string>, playerId: number, command: string): string | null {
  const matchesBuilding = sourceBuildMatcherForHudCommand(world, command, playerId);
  if (!matchesBuilding) {
    return null;
  }
  const sourceButton = world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "build" && Boolean(button.value))
    .filter((button) => sourceButtonAppliesToAnyType(button, typeIds))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, playerId))
    .filter((button) => {
      const definition = world.unitDefinitions.find((unit) => unit.id === button.value);
      return Boolean(definition && matchesBuilding(definition));
    })
    .sort(compareSourceButtons)[0];
  return sourceButton?.value ?? null;
}

export function hasSourceBuildButtonsForTypes(world: WorldState, typeIds: Iterable<string>, playerId: number): boolean {
  return world.buttonDefinitions.some((button) => (
    button.action === "build"
    && sourceButtonAppliesToAnyType(button, typeIds)
    && sourceButtonAllowedForSimulation(world, button, playerId)
  ));
}

export function sourceResearchTargetForHudCommand(world: WorldState, typeIds: Iterable<string>, playerId: number, command: string): string | null {
  const matchesUpgrade = sourceResearchMatcherForHudCommand(world, command);
  if (!matchesUpgrade) {
    return null;
  }
  const sourceButton = world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "research" && Boolean(button.value))
    .filter((button) => sourceButtonAppliesToAnyType(button, typeIds))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, playerId))
    .filter((button) => matchesUpgrade(button.value))
    .sort(compareSourceButtons)[0];
  return sourceButton?.value ?? null;
}

export function hasSourceResearchButtonsForTypes(world: WorldState, typeIds: Iterable<string>, playerId: number): boolean {
  return world.buttonDefinitions.some((button) => (
    button.action === "research"
    && sourceButtonAppliesToAnyType(button, typeIds)
    && sourceButtonAllowedForSimulation(world, button, playerId)
  ));
}

export function sourceFallbackResearchTargetForHudCommand(world: WorldState, selectedUnits: WorldUnit[], command: string): string | null {
  const matchesUpgrade = sourceResearchMatcherForHudCommand(world, command);
  if (!matchesUpgrade) {
    return null;
  }
  const sourceButton = world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "research" && Boolean(button.value))
    .filter((button) => selectedUnits.some((unit) => sourceButtonAppliesTo(button, unit.typeId) && sourceButtonAllowedForSimulation(world, button, unit.player)))
    .filter((button) => matchesUpgrade(button.value))
    .filter((button) => selectedUnits.some((unit) => canResearchUpgradeAt(world, unit.id, button.value)))
    .sort(compareSourceButtons)[0];
  if (sourceButton) {
    return sourceButton.value;
  }
  return selectedUnits
    .flatMap((unit) => world.upgradeDefinitions
      .filter((upgrade) => matchesUpgrade(upgrade.id) && canResearchUpgradeAt(world, unit.id, upgrade.id))
      .map((upgrade) => upgrade.id))
    .sort((left, right) => left.localeCompare(right))[0] ?? null;
}

export function sourceTrainIconForHudCommand(world: WorldState, typeIds: Iterable<string>, playerId: number, command: string): string | null {
  const sourceTarget = sourceTrainTargetForHudCommand(world, typeIds, playerId, command);
  return sourceTarget ? world.unitDefinitions.find((unit) => unit.id === sourceTarget)?.icon ?? null : null;
}

export function sourceFallbackTrainIconForHudCommand(world: WorldState, selectedUnits: WorldUnit[], command: string): string | null {
  const sourceTarget = sourceFallbackTrainTargetForHudCommand(world, selectedUnits, command);
  return sourceTarget ? world.unitDefinitions.find((unit) => unit.id === sourceTarget)?.icon ?? null : null;
}

export function sourceBuildIconForHudCommand(world: WorldState, typeIds: Iterable<string>, playerId: number, command: string): string | null {
  const sourceTarget = sourceBuildTargetForHudCommand(world, typeIds, playerId, command);
  return sourceTarget ? world.unitDefinitions.find((unit) => unit.id === sourceTarget)?.icon ?? null : null;
}

export function sourceResearchIconForHudCommand(world: WorldState, typeIds: Iterable<string>, playerId: number, command: string): string | null {
  const sourceTarget = sourceResearchTargetForHudCommand(world, typeIds, playerId, command);
  return sourceTarget ? world.upgradeDefinitions.find((upgrade) => upgrade.id === sourceTarget)?.icon ?? null : null;
}

export function sourceFallbackResearchIconForHudCommand(world: WorldState, selectedUnits: WorldUnit[], command: string): string | null {
  const sourceTarget = sourceFallbackResearchTargetForHudCommand(world, selectedUnits, command);
  return sourceTarget ? world.upgradeDefinitions.find((upgrade) => upgrade.id === sourceTarget)?.icon ?? null : null;
}

export function sourceActionForHudCommand(world: WorldState, command: string, playerId: number, typeIds: Iterable<string>, selectedUnits: WorldUnit[] = []): { action: string; value?: string } | null {
  if (command.startsWith("source-spell:")) {
    return { action: "cast-spell", value: command.slice("source-spell:".length) };
  }
  if (command.startsWith("source-upgrade:")) {
    return { action: "upgrade-to", value: command.slice("source-upgrade:".length) };
  }
  if (isTargetedSpellCommand(command)) {
    const sourceSpellTarget = sourceSpellTargetForHudCommand(world, selectedUnits, command);
    const fallbackSpellTarget = targetedSpellIdForCommand(world, command);
    return sourceSpellTarget || fallbackSpellTarget ? { action: "cast-spell", value: sourceSpellTarget ?? fallbackSpellTarget ?? undefined } : null;
  }
  const typeIdSet = new Set(typeIds);
  const race = world.players.find((player) => player.id === playerId)?.race ?? "human";
  const human = race === "human";
  const raceValue = (humanValue: string, orcValue: string): string => human ? humanValue : orcValue;
  const townUpgrade = (): string | null => {
    const sourceTarget = sourceTownUpgradeTargetForTypes(world, typeIdSet, playerId);
    if (sourceTarget) return sourceTarget;
    if (hasSourceUpgradeButtonsForTypes(world, typeIdSet, playerId)) return null;
    const selectedTownTier = [...typeIdSet].reduce((highestTier, typeId) => Math.max(highestTier, townCenterTier(world, typeId, playerId)), 0);
    return selectedTownTier >= 2 ? raceValue("unit-castle", "unit-fortress") : raceValue("unit-keep", "unit-stronghold");
  };
  const trainTarget = (commandId: string, fallback: string): string | null => (
    sourceTrainTargetForHudCommand(world, typeIdSet, playerId, commandId)
    ?? sourceFallbackTrainTargetForHudCommand(world, selectedUnits, commandId)
    ?? (hasSourceTrainButtonsForTypes(world, typeIdSet, playerId) ? null : fallback)
  );
  const exactTrainTarget = (unitTypeId: string): string | null => (
    sourceTrainTargetForTypes(world, typeIdSet, playerId, unitTypeId)
    ?? (hasSourceTrainButtonsForTypes(world, typeIdSet, playerId) ? null : unitTypeId)
  );
  const trainAction = (target: string | null): { action: string; value: string } | null => target ? { action: "train-unit", value: target } : null;
  const buildTarget = (commandId: string, fallback: string): string | null => (
    sourceBuildTargetForHudCommand(world, typeIdSet, playerId, commandId)
    ?? (hasSourceBuildButtonsForTypes(world, typeIdSet, playerId) ? null : fallback)
  );
  const buildAction = (target: string | null): { action: string; value: string } | null => target ? { action: "build", value: target } : null;
  const researchTarget = (commandId: string, fallback: string): string | null => (
    sourceResearchTargetForHudCommand(world, typeIdSet, playerId, commandId)
    ?? sourceFallbackResearchTargetForHudCommand(world, selectedUnits, commandId)
    ?? (hasSourceResearchButtonsForTypes(world, typeIdSet, playerId) ? null : fallback)
  );
  const researchAction = (target: string | null): { action: string; value: string } | null => target ? { action: "research", value: target } : null;
  const directAction = sourceActionForDirectHudCommand(command);
  if (directAction) {
    return { action: directAction };
  }

  switch (command) {
    case "build-basic-page":
      return { action: "button", value: "1" };
    case "build-advanced-page":
      return { action: "button", value: "2" };
    case "build-page-cancel":
      return { action: "button", value: "0" };
    case "move":
      return { action: "move" };
    case "attack-move":
      return { action: "attack" };
    case "attack-ground":
      return { action: "attack-ground" };
    case "patrol":
      return { action: "patrol" };
    case "repair":
      return { action: "repair" };
    case "unload-transport":
      return { action: "unload" };
    case "train-worker":
      return trainAction(sourceWorkerTrainTargetForTypes(world, typeIdSet, playerId) ?? (hasSourceTrainButtonsForTypes(world, typeIdSet, playerId) ? null : raceValue("unit-peasant", "unit-peon")));
    case "upgrade-town-center":
      {
        const target = townUpgrade();
        return target ? { action: "upgrade-to", value: target } : null;
      }
    case "upgrade-guard-tower":
    case "upgrade-cannon-tower": {
      const towerUpgradeTarget = sourceTowerUpgradeTargetForTypes(world, typeIdSet, playerId, command === "upgrade-guard-tower" ? "guard" : "cannon");
      return towerUpgradeTarget ? { action: "upgrade-to", value: towerUpgradeTarget } : null;
    }
    case "train-minuteman":
      return trainAction(exactTrainTarget("unit-attack-peasant"));
    case "train-melee":
      return trainAction(trainTarget(command, raceValue("unit-footman", "unit-grunt")));
    case "train-ranged":
      return trainAction(trainTarget(command, raceValue("unit-archer", "unit-axethrower")));
    case "train-ranged-veteran":
      return trainAction(trainTarget(command, raceValue("unit-ranger", "unit-berserker")));
    case "train-cavalry-veteran":
      return trainAction(trainTarget(command, raceValue("unit-paladin", "unit-ogre-mage")));
    case "train-critter":
      return trainAction(exactTrainTarget("unit-critter"));
    case "train-cavalry":
      return trainAction(trainTarget(command, raceValue("unit-knight", "unit-ogre")));
    case "train-tanker":
      return trainAction(trainTarget(command, raceValue("unit-human-oil-tanker", "unit-orc-oil-tanker")));
    case "train-destroyer":
      return trainAction(trainTarget(command, raceValue("unit-human-destroyer", "unit-orc-destroyer")));
    case "train-warship":
      return trainAction(trainTarget(command, raceValue("unit-battleship", "unit-ogre-juggernaught")));
    case "train-transport":
      return trainAction(trainTarget(command, raceValue("unit-human-transport", "unit-orc-transport")));
    case "train-submarine":
      return trainAction(trainTarget(command, raceValue("unit-human-submarine", "unit-orc-submarine")));
    case "train-caster":
      return trainAction(trainTarget(command, raceValue("unit-mage", "unit-death-knight")));
    case "train-air":
      return trainAction(trainTarget(command, raceValue("unit-gryphon-rider", "unit-dragon")));
    case "train-demolition":
      return trainAction(trainTarget(command, raceValue("unit-dwarves", "unit-goblin-sappers")));
    case "train-siege":
      return trainAction(trainTarget(command, raceValue("unit-ballista", "unit-catapult")));
    case "train-scout-air":
      return trainAction(trainTarget(command, raceValue("unit-balloon", "unit-zeppelin")));
    case "build-farm":
      return buildAction(buildTarget(command, raceValue("unit-farm", "unit-pig-farm")));
    case "build-barracks":
      return buildAction(buildTarget(command, raceValue("unit-human-barracks", "unit-orc-barracks")));
    case "build-lumber-mill":
      return buildAction(buildTarget(command, raceValue("unit-elven-lumber-mill", "unit-troll-lumber-mill")));
    case "build-blacksmith":
      return buildAction(buildTarget(command, raceValue("unit-human-blacksmith", "unit-orc-blacksmith")));
    case "build-wall":
      return buildAction(buildTarget(command, raceValue("unit-human-wall", "unit-orc-wall")));
    case "build-advanced":
      return buildAction(buildTarget(command, raceValue("unit-stables", "unit-ogre-mound")));
    case "build-guard-tower":
      return buildAction(buildTarget(command, raceValue("unit-human-watch-tower", "unit-orc-watch-tower")));
    case "build-cannon-tower":
      return buildAction(buildTarget(command, raceValue("unit-human-cannon-tower", "unit-orc-cannon-tower")));
    case "build-shipyard":
      return buildAction(buildTarget(command, raceValue("unit-human-shipyard", "unit-orc-shipyard")));
    case "build-foundry":
      return buildAction(buildTarget(command, raceValue("unit-human-foundry", "unit-orc-foundry")));
    case "build-refinery":
      return buildAction(buildTarget(command, raceValue("unit-human-refinery", "unit-orc-refinery")));
    case "build-oil-platform":
      return buildAction(buildTarget(command, raceValue("unit-human-oil-platform", "unit-orc-oil-platform")));
    case "build-caster-building":
      return buildAction(buildTarget(command, raceValue("unit-mage-tower", "unit-temple-of-the-damned")));
    case "build-holy-building":
      return buildAction(buildTarget(command, raceValue("unit-church", "unit-altar-of-storms")));
    case "build-air-building":
      return buildAction(buildTarget(command, raceValue("unit-gryphon-aviary", "unit-dragon-roost")));
    case "build-siege-lab":
      return buildAction(buildTarget(command, raceValue("unit-inventor", "unit-alchemist")));
    case "research-melee":
      return researchAction(researchTarget(command, raceValue("upgrade-sword1", "upgrade-battle-axe1")));
    case "research-armor":
      return researchAction(researchTarget(command, raceValue("upgrade-human-shield1", "upgrade-orc-shield1")));
    case "research-ranged":
      return researchAction(researchTarget(command, raceValue("upgrade-arrow1", "upgrade-throwing-axe1")));
    case "research-siege":
      return researchAction(researchTarget(command, raceValue("upgrade-ballista1", "upgrade-catapult1")));
    case "research-paladin":
      return researchAction(researchTarget(command, raceValue("upgrade-paladin", "upgrade-ogre-mage")));
    case "research-healing":
      return researchAction(researchTarget(command, "upgrade-healing"));
    case "research-exorcism":
      return researchAction(researchTarget(command, "upgrade-exorcism"));
    case "research-holy-vision":
      return researchAction(researchTarget(command, "upgrade-holy-vision"));
    case "research-flame-shield":
      return researchAction(researchTarget(command, "upgrade-flame-shield"));
    case "research-blizzard":
      return researchAction(researchTarget(command, "upgrade-blizzard"));
    case "research-polymorph":
      return researchAction(researchTarget(command, "upgrade-polymorph"));
    case "research-invisibility":
      return researchAction(researchTarget(command, "upgrade-invisibility"));
    case "research-slow":
      return researchAction(researchTarget(command, "upgrade-slow"));
    case "research-death-coil":
      return researchAction(researchTarget(command, "upgrade-death-coil"));
    case "research-death-magic":
      return researchAction(researchTarget(command, "upgrade-death-and-decay"));
    case "research-whirlwind":
      return researchAction(researchTarget(command, "upgrade-whirlwind"));
    case "research-raise-dead":
      return researchAction(researchTarget(command, "upgrade-raise-dead"));
    case "research-unholy-armor":
      return researchAction(researchTarget(command, "upgrade-unholy-armor"));
    case "research-haste":
      return researchAction(researchTarget(command, "upgrade-haste"));
    case "research-bloodlust":
      return researchAction(researchTarget(command, "upgrade-bloodlust"));
    case "research-runes":
      return researchAction(researchTarget(command, "upgrade-runes"));
    case "research-eye-of-kilrogg":
      return researchAction(researchTarget(command, "upgrade-eye-of-kilrogg"));
    case "research-ship-cannon":
      return researchAction(researchTarget(command, raceValue("upgrade-human-ship-cannon1", "upgrade-orc-ship-cannon1")));
    case "research-ship-armor":
      return researchAction(researchTarget(command, raceValue("upgrade-human-ship-armor1", "upgrade-orc-ship-armor1")));
    default:
      return null;
  }
}

export function buildingTypeForHudCommand(world: WorldState, command: string, unitIds: string[], playerId = world.visibilityPlayer): string | null {
  const worker = findSelectedSourceBuilder(world, unitIds, playerId);
  if (!worker) {
    return null;
  }
  const race = world.players.find((player) => player.id === worker.player)?.race;
  const human = race === "human";
  const buildingByCommand: Record<string, string | undefined> = {
    "build-farm": human ? "unit-farm" : "unit-pig-farm",
    "build-barracks": human ? "unit-human-barracks" : "unit-orc-barracks",
    "build-lumber-mill": human ? "unit-elven-lumber-mill" : "unit-troll-lumber-mill",
    "build-blacksmith": human ? "unit-human-blacksmith" : "unit-orc-blacksmith",
    "build-wall": human ? "unit-human-wall" : "unit-orc-wall",
    "build-advanced": human ? "unit-stables" : "unit-ogre-mound",
    "build-guard-tower": human ? "unit-human-watch-tower" : "unit-orc-watch-tower",
    "build-shipyard": human ? "unit-human-shipyard" : "unit-orc-shipyard",
    "build-foundry": human ? "unit-human-foundry" : "unit-orc-foundry",
    "build-refinery": human ? "unit-human-refinery" : "unit-orc-refinery",
    "build-caster-building": human ? "unit-mage-tower" : "unit-temple-of-the-damned",
    "build-holy-building": human ? "unit-church" : "unit-altar-of-storms",
    "build-air-building": human ? "unit-gryphon-aviary" : "unit-dragon-roost",
    "build-siege-lab": human ? "unit-inventor" : "unit-alchemist"
  };
  const buildingTypeId = buildingByCommand[command] ?? null;
  return buildingTypeId && canStartBuildingPlacementByType(world, worker, buildingTypeId) ? buildingTypeId : null;
}

function placeBuilding(world: WorldState, builder: WorldUnit, player: WorldState["players"][number], buildingDefinition: WargusUnit, tileX: number, tileY: number, options: { clearQueue?: boolean } = {}): boolean {
  spendResources(player.resources, buildingDefinition.costs);
  const totalSeconds = sourceBuildDurationSecondsForPlayer(world, builder.player, buildingDefinition.costs);
  const replacedUnits = sourceReplaceOnBuildTargets(world, buildingDefinition, tileX, tileY);
  const replacedResourcesHeld = replacedUnits.length > 0 ? Math.max(0, Math.floor(replacedUnits[0]?.resourcesHeld ?? 0)) : 0;
  if (replacedUnits.length > 0) {
    const replacedUnitIds = new Set(replacedUnits.map((unit) => unit.id));
    world.units = world.units.filter((unit) => !replacedUnitIds.has(unit.id));
    clearReferencesToUnavailableUnits(world, replacedUnitIds);
  }
  const building = createWorldUnit({
    unit: buildingDefinition,
    id: `${buildingDefinition.id}-${world.nextUnitSerial}`,
    player: builder.player,
    tileX,
    tileY,
    resourcesHeld: replacedResourcesHeld,
    tileset: world.map.setup?.tileset ?? null
  });
  world.nextUnitSerial += 1;
  building.hitPoints = Math.max(1, Math.floor(building.maxHitPoints * 0.1));
  const builderInside = !buildingDefinition.builderOutside;
  building.construction = { builderId: builder.id, builderInside, remainingSeconds: totalSeconds, totalSeconds };
  world.units.push(building);
  recordPlayerUnitCreated(world, building);

  const path = findPath(world, builder, building.x, building.y);
  if (path.length === 0 && !isInTouchRange(builder, building)) {
    world.units = world.units.filter((unit) => unit.id !== building.id);
    if (replacedUnits.length > 0) {
      world.units.push(...replacedUnits);
    }
    if (isBuildingLike(building)) {
      player.stats.totalBuildings = Math.max(0, player.stats.totalBuildings - 1);
    } else {
      player.stats.totalUnits = Math.max(0, player.stats.totalUnits - 1);
    }
    refundCosts(world, player, buildingDefinition.costs, 1);
    return false;
  }
  emitSoundEvent(world, "placement-success", builder.player, building.x, building.y);
  emitSoundEvent(world, "building-construction", builder.player, building.x, building.y);

  if (options.clearQueue !== false) {
    builder.moveQueue = [];
  }
  builder.order = {
    kind: "build",
    targetId: building.id,
    targetX: building.x,
    targetY: building.y,
    buildCycle: 0,
    path,
    pathIndex: path.length > 1 ? 1 : 0
  };
  return true;
}

export function issueBuildOilPlatformOrder(world: WorldState, builderId: string, oilPatchId: string, unitDefinitions: WargusUnit[]): boolean {
  const builder = findUnit(world, builderId);
  const oilPatch = findUnit(world, oilPatchId);
  const player = builder ? world.players.find((candidate) => candidate.id === builder.player) : undefined;
  const platformDefinition = builder && player ? oilPlatformDefinitionForBuilder(world, builder, player, unitDefinitions) : undefined;
  if (!builder || !oilPatch || !player || !platformDefinition || !canIssueBuildOilPlatformAt(world, builder, oilPatch, unitDefinitions)) {
    return false;
  }
  if (!isInTouchRange(builder, oilPatch)) {
    const path = findPath(world, builder, oilPatch.x, oilPatch.y);
    builder.moveQueue = [];
    builder.order = {
      kind: "build-oil-platform",
      targetId: oilPatch.id,
      targetX: oilPatch.x,
      targetY: oilPatch.y,
      path,
      pathIndex: path.length > 1 ? 1 : 0
    };
    return true;
  }
  return startOilPlatformConstruction(world, builder, oilPatch, player, platformDefinition);
}

function startQueuedBuildOilPlatformOrder(world: WorldState, builder: WorldUnit, oilPatchId: string, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean {
  const oilPatch = findUnit(world, oilPatchId);
  const player = world.players.find((candidate) => candidate.id === builder.player);
  const platformDefinition = player ? oilPlatformDefinitionForBuilder(world, builder, player, unitDefinitions) : undefined;
  if (!oilPatch || !player || !platformDefinition || !canIssueBuildOilPlatformAt(world, builder, oilPatch, unitDefinitions)) {
    return false;
  }
  if (!isInTouchRange(builder, oilPatch)) {
    const path = findPath(world, builder, oilPatch.x, oilPatch.y);
    if (path.length === 0) {
      return false;
    }
    builder.order = {
      kind: "build-oil-platform",
      targetId: oilPatch.id,
      targetX: oilPatch.x,
      targetY: oilPatch.y,
      path,
      pathIndex: path.length > 1 ? 1 : 0,
      preserveQueue: true
    };
    return true;
  }
  return startOilPlatformConstruction(world, builder, oilPatch, player, platformDefinition, { clearQueue: false });
}

function releaseBuilderFromConstruction(world: WorldState, builder: WorldUnit, building: WorldUnit): void {
  builder.hiddenInConstructionId = null;
  builder.order = null;
  builder.moveQueue = [];
  const position = nearestBuilderReleasePosition(world, builder, building);
  builder.x = position.x;
  builder.y = position.y;
}

function issueSourceConstructionCompleteBuilderOrder(world: WorldState, builder: WorldUnit, building: WorldUnit): void {
  if (builder.hitPoints <= 0 || building.hitPoints <= 0 || builder.player !== building.player) {
    return;
  }
  if (isHarvestResource(building.givesResource) && canGatherResource(builder, building.givesResource)) {
    if (building.givesResource === "gold" && issueHarvestOrder(world, builder.id, building.id)) {
      return;
    }
    if (building.givesResource === "oil" && issueHarvestOilOrder(world, builder.id, building.id)) {
      return;
    }
  }
  if (builder.resourcesHeld > 0 && isHarvestResource(builder.carriedResource) && canStoreResource(building, builder.carriedResource)) {
    issueReturnGoodsToDropoffOrder(world, builder.id, building.id);
  }
}

function nearestBuilderReleasePosition(world: WorldState, builder: WorldUnit, building: WorldUnit): { x: number; y: number } {
  const center = worldToTile(world, building.x, building.y);
  const left = center.x - Math.floor(building.tileWidth / 2);
  const top = center.y - Math.floor(building.tileHeight / 2);
  const candidates: Array<{ tileX: number; tileY: number }> = [];
  for (let y = top - 1; y <= top + building.tileHeight; y += 1) {
    for (let x = left - 1; x <= left + building.tileWidth; x += 1) {
      if (x < left || y < top || x >= left + building.tileWidth || y >= top + building.tileHeight) {
        candidates.push({ tileX: x, tileY: y });
      }
    }
  }
  candidates.sort((a, b) => Math.hypot(a.tileX - center.x, a.tileY - center.y) - Math.hypot(b.tileX - center.x, b.tileY - center.y));
  const movement = movementKindForUnit(builder);
  const open = candidates.find((candidate) => isTilePassable(world, candidate.tileX, candidate.tileY, movement, builder.id));
  const tile = open ?? { tileX: Math.max(0, Math.min(world.map.width - 1, left - 1)), tileY: Math.max(0, Math.min(world.map.height - 1, top)) };
  return tileToWorldCenter(world, tile.tileX, tile.tileY);
}

export function issueBuildOilPlatformAtOrder(world: WorldState, builderId: string, x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean {
  const builder = findUnit(world, builderId);
  const oilPatch = builder ? findVisibleOilPatchAtForPlayer(world, x, y, builder.player) : undefined;
  return oilPatch ? issueBuildOilPlatformOrder(world, builderId, oilPatch.id, unitDefinitions) : false;
}

export function issueBuildNearestOilPlatformOrder(world: WorldState, builderId: string, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean {
  const builder = findUnit(world, builderId);
  const oilPatch = builder ? findNearestBuildableOilPatch(world, builder, unitDefinitions) : undefined;
  return oilPatch ? issueBuildOilPlatformOrder(world, builderId, oilPatch.id, unitDefinitions) : false;
}

export function canIssueBuildOilPlatformAt(world: WorldState, builder: WorldUnit, oilPatch: WorldUnit, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean {
  return canStartOilPlatformPlacement(world, builder, unitDefinitions)
    && isOilPatch(oilPatch)
    && oilPatch.hitPoints > 0
    && oilPatch.resourcesHeld > 0
    && (isInTouchRange(builder, oilPatch) || findPath(world, builder, oilPatch.x, oilPatch.y).length > 0);
}

export function canIssueBuildOilPlatformAtPoint(world: WorldState, builder: WorldUnit, x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean {
  const oilPatch = findVisibleOilPatchAtForPlayer(world, x, y, builder.player);
  return Boolean(oilPatch && canIssueBuildOilPlatformAt(world, builder, oilPatch, unitDefinitions));
}

export function canSelectedIssueBuildOilPlatformAt(world: WorldState, unitIds: string[], x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions, playerId = world.visibilityPlayer): boolean {
  return unitIds
    .map((id) => findUnit(world, id))
    .some((unit): boolean => Boolean(unit
      && unit.player === playerId
      && canIssueBuildOilPlatformAtPoint(world, unit, x, y, unitDefinitions)));
}

export function issueGroupBuildOilPlatformAtOrder(world: WorldState, unitIds: string[], x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions, playerId = world.visibilityPlayer): boolean {
  const tankers = selectedUnitsForPlayer(world, unitIds, playerId)
    .filter((unit) => canIssueBuildOilPlatformAtPoint(world, unit, x, y, unitDefinitions));
  let issued = false;
  for (const tanker of tankers) {
    issued = issueBuildOilPlatformAtOrder(world, tanker.id, x, y, unitDefinitions) || issued;
  }
  return issued;
}

export function canIssueQueueBuildOilPlatformAt(world: WorldState, builder: WorldUnit, x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean {
  return canIssueBuildOilPlatformAtPoint(world, builder, x, y, unitDefinitions);
}

export function issueQueueBuildOilPlatformAtOrder(world: WorldState, builderId: string, x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean {
  const builder = findUnit(world, builderId);
  const oilPatch = builder ? findVisibleOilPatchAtForPlayer(world, x, y, builder.player) : undefined;
  if (!builder || !oilPatch || !canIssueBuildOilPlatformAt(world, builder, oilPatch, unitDefinitions)) {
    return false;
  }
  builder.moveQueue.push({ kind: "build-oil-platform", targetId: oilPatch.id, x: oilPatch.x, y: oilPatch.y });
  if (!builder.order) {
    startNextQueuedMove(world, builder);
  }
  return true;
}

export function issueGroupQueueBuildOilPlatformAtOrder(world: WorldState, unitIds: string[], x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions, playerId = world.visibilityPlayer): boolean {
  const tankers = selectedUnitsForPlayer(world, unitIds, playerId)
    .filter((unit) => canIssueQueueBuildOilPlatformAt(world, unit, x, y, unitDefinitions));
  let issued = false;
  for (const tanker of tankers) {
    issued = issueQueueBuildOilPlatformAtOrder(world, tanker.id, x, y, unitDefinitions) || issued;
  }
  return issued;
}

export function canStartOilPlatformPlacement(world: WorldState, builder: WorldUnit, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean {
  const player = world.players.find((candidate) => candidate.id === builder.player);
  const platformDefinition = player ? oilPlatformDefinitionForBuilder(world, builder, player, unitDefinitions) : undefined;
  return Boolean(
    player
    && platformDefinition
    && isUsableSourceBuildActor(builder)
    && canGatherResource(builder, "oil")
    && isUnitTypeAllowed(world, platformDefinition.id, builder.player)
    && canSourceBuildType(world, builder, platformDefinition.id)
    && hasBuildGatePrerequisites(world, player.id, platformDefinition.id)
    && canCreateUnitWithinSourceLimits(world, builder.player, platformDefinition)
    && canAfford(player.resources, platformDefinition.costs)
  );
}

function oilPlatformDefinitionForBuilder(world: WorldState, builder: WorldUnit, player: WorldState["players"][number], unitDefinitions: WargusUnit[] = world.unitDefinitions): WargusUnit | undefined {
  const sourceBuildButtons = world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "build" && Boolean(button.value) && sourceButtonAppliesTo(button, builder.typeId))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, builder.player));
  const sourcePlatform = sourceBuildButtons
    .map((button) => unitDefinitions.find((definition) => definition.id === button.value))
    .find((definition): definition is WargusUnit => Boolean(definition && isOilPlatformDefinition(definition, unitDefinitions)));
  if (sourcePlatform || sourceBuildButtons.length > 0) {
    return sourcePlatform;
  }
  return unitDefinitions.find((unit) => unit.id === (player.race === "human" ? "unit-human-oil-platform" : "unit-orc-oil-platform"));
}

function isOilPlatformDefinition(definition: WargusUnit, unitDefinitions: WargusUnit[] = []): boolean {
  const ontopRule = buildingOntopRule(definition);
  const patchDefinition = ontopRule ? unitDefinitions.find((candidate) => candidate.id === ontopRule.typeId) : undefined;
  return definition.givesResource === "oil" && Boolean(definition.replaceOnBuild && patchDefinition && isSourceResourcePatchDefinition(patchDefinition, "oil"));
}

export function isOilPlatformBuildingType(world: WorldState, buildingTypeId: string): boolean {
  const definition = world.unitDefinitions.find((unit) => unit.id === buildingTypeId);
  return Boolean(definition && isOilPlatformDefinition(definition, world.unitDefinitions));
}

function startOilPlatformConstruction(world: WorldState, builder: WorldUnit, oilPatch: WorldUnit, player: WorldState["players"][number], platformDefinition: WargusUnit, options: { clearQueue?: boolean } = {}): boolean {
  const ontopRule = buildingOntopRule(platformDefinition);
  if (!platformDefinition.replaceOnBuild || !ontopRule || oilPatch.typeId !== ontopRule.typeId) {
    return false;
  }
  spendResources(player.resources, platformDefinition.costs);
  const totalSeconds = sourceBuildDurationSecondsForPlayer(world, builder.player, platformDefinition.costs);
  const tile = worldToTile(world, oilPatch.x, oilPatch.y);
  const platform = createWorldUnit({
    unit: platformDefinition,
    id: `${platformDefinition.id}-${world.nextUnitSerial}`,
    player: builder.player,
    tileX: Math.max(0, tile.x - Math.floor(platformDefinition.tileSize[0] / 2)),
    tileY: Math.max(0, tile.y - Math.floor(platformDefinition.tileSize[1] / 2)),
    resourcesHeld: oilPatch.resourcesHeld,
    tileset: world.map.setup?.tileset ?? null
  });
  world.nextUnitSerial += 1;
  platform.hitPoints = Math.max(1, Math.floor(platform.maxHitPoints * 0.1));
  platform.construction = { builderId: builder.id, builderInside: false, remainingSeconds: totalSeconds, totalSeconds };
  world.units = world.units.filter((unit) => unit.id !== oilPatch.id);
  world.units.push(platform);
  recordPlayerUnitCreated(world, platform);
  clearReferencesToUnavailableUnits(world, new Set([oilPatch.id]));
  emitSoundEvent(world, "placement-success", builder.player, platform.x, platform.y);
  emitSoundEvent(world, "building-construction", builder.player, platform.x, platform.y);

  const path = findPath(world, builder, platform.x, platform.y);
  if (options.clearQueue !== false) {
    builder.moveQueue = [];
  }
  builder.order = {
    kind: "build",
    targetId: platform.id,
    targetX: platform.x,
    targetY: platform.y,
    buildCycle: 0,
    path,
    pathIndex: path.length > 1 ? 1 : 0
  };
  return true;
}

export function canResearchUpgradeAt(world: WorldState, buildingId: string, upgradeId: string, upgrades: WargusUpgrade[] = world.upgradeDefinitions): boolean {
  const building = findUnit(world, buildingId);
  const player = building ? world.players.find((candidate) => candidate.id === building.player) : undefined;
  const upgrade = upgrades.find((candidate) => candidate.id === upgradeId);
  if (!building || !player || !upgrade || !canResearchUpgradeCommon(world, building, player.id, upgradeId) || building.productionQueue.length > 0) {
    return false;
  }
  return canAfford(player.resources, upgradeCostPairs(upgrade));
}

function canAiResearchUpgradeAt(world: WorldState, building: WorldUnit, upgradeId: string, upgrades: WargusUpgrade[] = world.upgradeDefinitions): boolean {
  const player = world.players.find((candidate) => candidate.id === building.player);
  const upgrade = upgrades.find((candidate) => candidate.id === upgradeId);
  if (!player || !upgrade || building.productionQueue.length > 0) {
    return false;
  }
  if (world.engineSettings.aiChecksDependenciesDefault) {
    return canResearchUpgradeAt(world, building.id, upgradeId, upgrades);
  }
  if (!canResearchUpgradeCommon(world, building, player.id, upgradeId, { checkDependencies: false })) {
    return false;
  }
  return canAfford(player.resources, upgradeCostPairs(upgrade));
}

export function canQueueResearchUpgradeAt(world: WorldState, building: WorldUnit, upgradeId: string, upgrades: WargusUpgrade[] = world.upgradeDefinitions): boolean {
  const player = world.players.find((candidate) => candidate.id === building.player);
  const upgrade = upgrades.find((candidate) => candidate.id === upgradeId);
  if (!player || !upgrade || !canResearchUpgradeCommon(world, building, player.id, upgradeId)) {
    return false;
  }
  if (world.queuedResearch.some((research) => research.buildingId === building.id)) {
    return false;
  }
  return canAfford(player.resources, upgradeCostPairs(upgrade));
}

function canResearchUpgradeCommon(world: WorldState, building: WorldUnit, playerId: number, upgradeId: string, options: { checkDependencies?: boolean } = {}): boolean {
  if (!isUsableProductionBuilding(building) || !canResearchAt(world, building, upgradeId) || isBuildingResearching(world, building.id)) {
    return false;
  }
  const sameUpgradeQueued = world.queuedResearch.some((research) => research.player === playerId && research.upgradeId === upgradeId);
  if (sameUpgradeQueued && !sourceResearchAllowsSharedProgress(world, building, upgradeId)) {
    return false;
  }
  const sameUpgradeActive = world.activeResearch.some((research) => research.player === playerId && research.upgradeId === upgradeId);
  if ((world.researchedUpgrades[playerId] ?? []).includes(upgradeId) || (sameUpgradeActive && !sourceResearchAllowsSharedProgress(world, building, upgradeId))) {
    return false;
  }
  if (options.checkDependencies !== false && !hasResearchGatePrerequisites(world, playerId, upgradeId)) {
    return false;
  }
  if (!isResearchUpgradeAllowed(world, upgradeId, playerId)) {
    return false;
  }
  return true;
}

function isBuildingResearching(world: WorldState, buildingId: string): boolean {
  return world.activeResearch.some((research) => research.buildingId === buildingId);
}

export function sourceResearchAllowsSharedProgress(world: WorldState, building: WorldUnit, upgradeId: string): boolean {
  const buttons = world.buttonDefinitions.filter((button) => button.action === "research" && button.value === upgradeId && sourceButtonAppliesTo(button, building.typeId));
  if (buttons.length === 0) {
    return false;
  }
  return buttons.some((button) => button.allowed === "check-research" && sourceButtonEnabledForEngine(world, button));
}

function isResearchUpgradeAllowed(world: WorldState, upgradeId: string, playerId?: number): boolean {
  if (!isSourceAllowRuleEnabled(world, upgradeId, playerId)) {
    return false;
  }
  if (world.allowedUpgradeTypes.length > 0 && !world.allowedUpgradeTypes.includes(upgradeId)) {
    return false;
  }
  const upgrade = worldUpgrade(world, upgradeId);
  return (upgrade?.conversions ?? []).every((conversion) => isUnitTypeAllowed(world, conversion.toTypeId, playerId));
}

function isUsableProductionBuilding(unit: WorldUnit): boolean {
  return unit.hitPoints > 0 && !unit.construction;
}

function isUsableBuilder(unit: WorldUnit): boolean {
  return unit.hitPoints > 0 && !isUnitHiddenInConstruction(unit) && isWorker(unit) && !unit.construction && unit.speed > 0;
}

function isUsableSourceBuildActor(unit: WorldUnit): boolean {
  return unit.hitPoints > 0 && !isUnitHiddenInConstruction(unit) && !unit.construction && unit.speed > 0;
}

export function issueResearchOrder(world: WorldState, buildingId: string, upgradeId: string, upgrades: WargusUpgrade[]): boolean {
  const building = findUnit(world, buildingId);
  const player = building ? world.players.find((candidate) => candidate.id === building.player) : undefined;
  const upgrade = upgrades.find((candidate) => candidate.id === upgradeId);
  if (!building || !player || !upgrade || !canResearchUpgradeAt(world, buildingId, upgradeId, upgrades)) {
    return false;
  }
  if (!canAfford(player.resources, upgradeCostPairs(upgrade))) {
    return false;
  }
  spendResources(player.resources, upgradeCostPairs(upgrade));
  const totalSeconds = sourceResearchDurationSecondsForPlayer(world, building.player, upgrade.costs.time);
  world.activeResearch.push({ buildingId, player: player.id, upgradeId, remainingSeconds: totalSeconds, totalSeconds });
  return true;
}

export function issueQueueResearchOrder(world: WorldState, buildingId: string, upgradeId: string, upgrades: WargusUpgrade[] = world.upgradeDefinitions): boolean {
  const building = findUnit(world, buildingId);
  const player = building ? world.players.find((candidate) => candidate.id === building.player) : undefined;
  const upgrade = upgrades.find((candidate) => candidate.id === upgradeId);
  if (!building || !player || !upgrade || !canQueueResearchUpgradeAt(world, building, upgradeId, upgrades)) {
    return false;
  }
  spendResources(player.resources, upgradeCostPairs(upgrade));
  const totalSeconds = sourceResearchDurationSecondsForPlayer(world, building.player, upgrade.costs.time);
  world.queuedResearch.push({ buildingId, player: player.id, upgradeId, totalSeconds });
  return true;
}

export function issueCancelProductionOrder(world: WorldState, buildingId: string, queueIndex = 0): boolean {
  const building = findUnit(world, buildingId);
  const slot = Math.max(0, Math.floor(queueIndex));
  const active = building?.productionQueue[slot];
  const player = building ? world.players.find((candidate) => candidate.id === building.player) : undefined;
  const unitDefinition = active ? world.unitDefinitions.find((unit) => unit.id === active.unitTypeId) : undefined;
  if (!building || !active || !player || !unitDefinition) {
    return false;
  }
  refundCosts(world, player, unitDefinition.costs, 1);
  building.productionQueue.splice(slot, 1);
  return true;
}

export function issueCancelResearchOrder(world: WorldState, buildingId: string): boolean {
  const index = world.activeResearch.findIndex((research) => research.buildingId === buildingId);
  const queuedIndex = world.queuedResearch.findIndex((research) => research.buildingId === buildingId);
  if (index < 0 && queuedIndex < 0) {
    return false;
  }
  const research = index >= 0 ? world.activeResearch[index] : world.queuedResearch[queuedIndex];
  const player = world.players.find((candidate) => candidate.id === research.player);
  const upgrade = world.upgradeDefinitions.find((candidate) => candidate.id === research.upgradeId);
  if (!player || !upgrade) {
    return false;
  }
  refundCosts(world, player, upgradeCostPairs(upgrade), 1);
  if (index >= 0) {
    world.activeResearch.splice(index, 1);
  } else {
    world.queuedResearch.splice(queuedIndex, 1);
  }
  return true;
}

export function issueCancelConstructionOrder(world: WorldState, buildingId: string): boolean {
  const building = findUnit(world, buildingId);
  const player = building ? world.players.find((candidate) => candidate.id === building.player) : undefined;
  const definition = building ? world.unitDefinitions.find((unit) => unit.id === building.typeId) : undefined;
  if (!building || !building.construction || !player || !definition) {
    return false;
  }
  refundCosts(world, player, definition.costs, 0.75);
  const builder = findUnit(world, building.construction.builderId);
  if (builder && building.construction.builderInside) {
    releaseBuilderFromConstruction(world, builder, building);
  }
  if (builder?.order?.kind === "build" && builder.order.targetId === building.id) {
    builder.order = null;
  }
  restoreOilPatchForRemovedPlatform(world, building);
  world.units = world.units.filter((unit) => unit.id !== building.id);
  clearReferencesToDeadUnits(world, new Set([building.id]));
  return true;
}

function refundFailedSourceUpgradeTo(world: WorldState, unit: WorldUnit, unitDefinition: WargusUnit): void {
  const player = world.players.find((candidate) => candidate.id === unit.player);
  if (player) {
    refundCosts(world, player, unitDefinition.costs, 1);
  }
}

export function simulateWorld(world: WorldState, deltaSeconds: number): void {
  if (world.matchState.status !== "playing") {
    return;
  }
  world.elapsed += deltaSeconds;
  world.accumulator += deltaSeconds;

  const tickSeconds = sourceFrameSeconds(world);
  while (world.accumulator >= tickSeconds) {
    stepWorld(world, tickSeconds);
    updateVisibility(world);
    world.tick += 1;
    world.accumulator -= tickSeconds;
  }
}

function sourceFrameSeconds(world: WorldState): number {
  return 1 / sourceDefaultGameSpeed(world);
}

function stepWorld(world: WorldState, tickSeconds: number): void {
  stepVisibilityReveals(world);
  stepSourceRevelationTimers(world);
  stepForestRegrowth(world);
  stepPendingAttacks(world, tickSeconds);
  stepProjectiles(world, tickSeconds);
  stepSpellEffects(world, tickSeconds);
  stepCorpses(world, tickSeconds);
  stepResearch(world, tickSeconds);
  stepInsideConstructionStates(world, tickSeconds);
  stepAiPlayers(world);
  const expiredUnitIds = new Set<string>();
  for (const unit of world.units) {
    stepProductionOrder(world, unit, tickSeconds);
    if (unit.hitPoints <= 0) {
      continue;
    }
    if (isUnitHiddenInConstruction(unit)) {
      continue;
    }
    if (unit.lifetimeSeconds !== undefined) {
      unit.lifetimeSeconds -= tickSeconds;
      if (unit.lifetimeSeconds <= 0) {
        unit.hitPoints = 0;
        expiredUnitIds.add(unit.id);
        continue;
      }
    }
    unit.attackCooldown = Math.max(0, unit.attackCooldown - tickSeconds);
    unit.spellCooldown = Math.max(0, (unit.spellCooldown ?? 0) - tickSeconds);
    stepStatusEffects(unit, tickSeconds);
    stepFlameShield(world, unit);
    stepPassiveRegeneration(unit, tickSeconds);
    stepBurnDamage(world, unit, tickSeconds);
    unit.maxMana ??= maxManaForUnit(unit);
    unit.manaIncrease ??= 0;
    unit.mana ??= unit.maxMana;
    if (unit.maxMana > 0 && unit.manaIncrease > 0) {
      unit.mana = Math.min(unit.maxMana, unit.mana + tickSeconds * unit.manaIncrease);
    }
    stepLoadedCargoState(unit, tickSeconds, expiredUnitIds);
    if (unit.order === null && canRunSourceStillAutomaticActions(world, unit)) {
      stepAutoRepair(world, unit);
      if (unit.order === null) {
        stepPlayerAutoCast(world, unit);
      }
      if (unit.order === null) {
        stepDefensiveAutoAttack(world, unit);
      }
      if (unit.order === null) {
        stepRandomMovement(world, unit);
      }
      unit.nextAutoActionTick = world.tick + sourceStillAutoActionSleepTicks(world);
    }
    if (unit.order?.kind === "attack") {
      stepAttackOrder(world, unit, tickSeconds);
      continue;
    }
    if (unit.order?.kind === "attack-move") {
      stepAttackMoveOrder(world, unit, tickSeconds);
      continue;
    }
    if (unit.order?.kind === "attack-ground") {
      stepAttackGroundOrder(world, unit, tickSeconds);
      continue;
    }
    if (unit.order?.kind === "spell-cast") {
      stepSpellCastOrder(world, unit, tickSeconds);
      continue;
    }
    if (unit.order?.kind === "explore") {
      stepExploreOrder(world, unit, tickSeconds);
      continue;
    }
    if (unit.order?.kind === "patrol") {
      stepPatrolOrder(world, unit, tickSeconds);
      continue;
    }
    if (unit.order?.kind === "hold") {
      stepHoldPositionOrder(world, unit);
      continue;
    }
    if (unit.order?.kind === "harvest") {
      stepHarvestOrder(world, unit, tickSeconds);
      continue;
    }
    if (unit.order?.kind === "build") {
      stepBuildOrder(world, unit, tickSeconds);
      continue;
    }
    if (unit.order?.kind === "build-oil-platform") {
      stepBuildOilPlatformOrder(world, unit, tickSeconds);
      continue;
    }
    if (unit.order?.kind === "repair") {
      stepRepairOrder(world, unit, tickSeconds);
      continue;
    }
    if (unit.order?.kind === "load-transport") {
      stepLoadTransportOrder(world, unit, tickSeconds);
      continue;
    }
    if (unit.order?.kind === "follow") {
      stepFollowOrder(world, unit, tickSeconds);
      continue;
    }
    if (unit.order?.kind === "defend") {
      stepDefendOrder(world, unit, tickSeconds);
      continue;
    }
    if (unit.order?.kind === "unload-transport") {
      stepUnloadTransportAtOrder(world, unit, tickSeconds);
      continue;
    }
    if (unit.order?.kind !== "move") {
      continue;
    }
    stepMoveOrder(world, unit, tickSeconds);
  }
  if (expiredUnitIds.size > 0) {
    clearReferencesToDeadUnits(world, expiredUnitIds);
  }
  stepObjectiveCapture(world);
  removeDeadUnits(world, expiredUnitIds);
  updateMatchState(world);
}

function stepVisibilityReveals(world: WorldState): void {
  world.visibilityReveals = (world.visibilityReveals ?? [])
    .map((reveal) => ({ ...reveal, remainingTicks: reveal.remainingTicks - 1 }))
    .filter((reveal) => reveal.remainingTicks > 0);
}

function stepSourceRevelationTimers(world: WorldState): void {
  world.revelationTimers = (world.revelationTimers ?? [])
    .map((timer) => ({ ...timer, remainingTicks: timer.remainingTicks - 1 }))
    .filter((timer) => timer.remainingTicks >= 0);
}

function stepForestRegrowth(world: WorldState): void {
  if ((world.forestRegrowth ?? []).length === 0) {
    return;
  }
  const remaining: WorldState["forestRegrowth"] = [];
  for (const entry of world.forestRegrowth) {
    const nextTicks = entry.remainingTicks - 1;
    if (nextTicks > 0) {
      remaining.push({ ...entry, remainingTicks: nextTicks });
      continue;
    }
    const index = entry.y * world.map.width + entry.x;
    if (world.tiles[index] === 80) {
      if (isForestRegrowthTileOccupied(world, entry.x, entry.y)) {
        remaining.push({ ...entry, remainingTicks: sourceDurationSecondsToTicks(world, 1) });
        continue;
      }
      world.tiles[index] = entry.tile;
      restoreForestResource(world, entry.x, entry.y);
      world.terrainVersion += 1;
    }
  }
  world.forestRegrowth = remaining;
}

function stepLoadedCargoState(carrier: WorldUnit, tickSeconds: number, expiredUnitIds: Set<string>): void {
  if (!carrier.cargo?.length) {
    return;
  }
  const activeCargo: WorldUnit[] = [];
  for (const cargoUnit of carrier.cargo) {
    cargoUnit.order = null;
    cargoUnit.moveQueue = [];
    cargoUnit.x = carrier.x;
    cargoUnit.y = carrier.y;
    if (cargoUnit.lifetimeSeconds !== undefined) {
      cargoUnit.lifetimeSeconds -= tickSeconds;
      if (cargoUnit.lifetimeSeconds <= 0) {
        cargoUnit.hitPoints = 0;
        expiredUnitIds.add(cargoUnit.id);
        continue;
      }
    }
    cargoUnit.attackCooldown = Math.max(0, cargoUnit.attackCooldown - tickSeconds);
    cargoUnit.spellCooldown = Math.max(0, (cargoUnit.spellCooldown ?? 0) - tickSeconds);
    stepStatusEffects(cargoUnit, tickSeconds);
    stepPassiveRegeneration(cargoUnit, tickSeconds);
    cargoUnit.maxMana ??= maxManaForUnit(cargoUnit);
    cargoUnit.manaIncrease ??= 0;
    cargoUnit.mana ??= cargoUnit.maxMana;
    if (cargoUnit.maxMana > 0 && cargoUnit.manaIncrease > 0) {
      cargoUnit.mana = Math.min(cargoUnit.maxMana, cargoUnit.mana + tickSeconds * cargoUnit.manaIncrease);
    }
    activeCargo.push(cargoUnit);
  }
  carrier.cargo = activeCargo;
}

function stepFlameShield(world: WorldState, unit: WorldUnit): void {
  const spellId = "spell-flame-shield";
  const missileId = sourceFlameShieldMissileId(world, spellId);
  if (world.tick % sourceFlameShieldDamagePulseTicks(world, spellId) !== 0 || !activeStatusEffect(unit, "flame-shield") || unit.hitPoints <= 0) {
    return;
  }
  const radius = sourceSpellEffectRadius(world, spellId, 52);
  const pulseDamage = spellMissileDamageTotal(world, spellId, missileId, 8);
  for (const target of world.units) {
    if (target.id === unit.id || target.player === 15 || target.hitPoints <= 0) {
      continue;
    }
    if (Math.hypot(target.x - unit.x, target.y - unit.y) > radius + target.radius) {
      continue;
    }
    applyDamage(world, target, pulseDamage, unit.player, unit.typeId, unit.id);
  }
  if (world.tick % sourceFlameShieldDamagePulseTicks(world, spellId) === 0) {
    addSpellEffect(world, "flame-shield", unit.player, unit.x, unit.y, sourceSpellVisualRadius(world, spellId, radius), sourceSpellAnimationDuration(world, spellId, 0.55), unit.typeId, sourceSpellCastSound(world, spellId), missileId, spellId, unit.id);
  }
}

function sourceFlameShieldDamagePulseTicks(world: WorldState, spellId = "spell-flame-shield"): number {
  const missile = missileDefinitionForId(world, sourceFlameShieldMissileId(world, spellId));
  const sourceCycles = Math.max(1, Math.floor((missile?.sleep ?? 1) * 8));
  return sourceOrderRetryTicks(world, sourceCycles);
}

function stepObjectiveCapture(world: WorldState): void {
  const hasCaptureObjective = world.objectives.some((objective) => /capture|recapture|secure|recruit|rescue|free|alterac traitors/i.test(objective));
  if (!hasCaptureObjective) {
    return;
  }
  const capturable = world.units.filter((unit) => unit.hitPoints > 0 && isCapturableBySourceRules(world, unit, hasCaptureObjective));
  if (capturable.length === 0) {
    return;
  }
  const friendlyUnits = world.units.filter((unit) => (
    unit.player === world.visibilityPlayer
    && unit.hitPoints > 0
    && unit.kind === "land"
    && unit.speed > 0
    && unit.tileWidth <= 1
    && unit.tileHeight <= 1
  ));
  for (const target of capturable) {
    if (target.player === world.visibilityPlayer || !friendlyUnits.some((unit) => canCaptureObjectiveTarget(world, unit, target))) {
      continue;
    }
    target.player = world.visibilityPlayer;
    target.order = null;
    target.moveQueue = [];
    target.attackCooldown = 0;
    emitSoundEvent(world, "rescue", world.visibilityPlayer);
  }
}

function isCapturableBySourceRules(world: WorldState, unit: WorldUnit, hasCaptureObjective: boolean): boolean {
  return hasCaptureObjective && isObjectiveCapturable(world, unit);
}

function canCaptureObjectiveTarget(world: WorldState, unit: WorldUnit, target: WorldUnit): boolean {
  const captureRadius = Math.max(96, target.radius + unit.radius + 48);
  if (Math.hypot(unit.x - target.x, unit.y - target.y) > captureRadius) {
    return false;
  }
  return !world.units.some((guard) => (
    guard.player !== world.visibilityPlayer
    && guard.player !== 15
    && guard.hitPoints > 0
    && guard.id !== target.id
    && Math.hypot(guard.x - target.x, guard.y - target.y) <= Math.max(128, target.radius + guard.radius + 64)
  ));
}

function isObjectiveCapturable(world: WorldState, unit: WorldUnit): boolean {
  const objectiveText = world.objectives.join(" ").toLowerCase();
  const targetTypes = new Set(captureTargetGroupsForObjectives(world).flat());
  for (const requirement of world.rescuedCircleRequirements) {
    for (const typeId of requirement.unitTypeIds) {
      targetTypes.add(typeId);
    }
  }
  for (const typeId of circleObjectiveUnitTypes(world, objectiveText) ?? []) {
    targetTypes.add(typeId);
  }
  return targetTypes.has(unit.typeId);
}

function canRunSourceStillAutomaticActions(world: WorldState, unit: WorldUnit): boolean {
  unit.nextAutoActionTick = Math.max(0, Math.floor(unit.nextAutoActionTick ?? 0));
  return world.tick >= unit.nextAutoActionTick;
}

function sourceStillAutoActionSleepTicks(world: WorldState): number {
  return sourceOrderRetryTicks(world, 15);
}

function sourceOrderRetryTicks(world: WorldState, sourceCycles: number): number {
  return Math.max(1, Math.round(sourceCycles * (sourceDefaultGameSpeed(world) / 30)));
}

function sourceSideAttackFacingSeconds(world: WorldState): number {
  return sourceCyclesToSeconds(world, 1);
}

function stepCorpses(world: WorldState, tickSeconds: number): void {
  world.corpses ??= [];
  const activeCorpses = [];
  for (const corpse of world.corpses) {
    corpse.age += tickSeconds;
    if (corpse.age < corpse.duration) {
      activeCorpses.push(corpse);
    }
  }
  world.corpses = activeCorpses;
}

function stepHoldPositionOrder(world: WorldState, unit: WorldUnit): void {
  if (unit.order?.kind !== "hold") {
    return;
  }
  unit.x = unit.order.anchorX;
  unit.y = unit.order.anchorY;
  let target = unit.order.targetId ? findUnit(world, unit.order.targetId) : undefined;
  if (!canContinueAttackingTarget(world, unit, target) || !isInAttackRange(unit, target, world)) {
    target = findNearestEnemyInRange(world, unit);
    unit.order.targetId = target?.id ?? null;
  }
  if (target && target.hitPoints > 0 && isInAttackRange(unit, target, world)) {
    if (unit.attackCooldown <= 0 && canLaunchAttackNow(unit, target)) {
      launchAttack(world, unit, target);
      unit.attackCooldown = attackCooldownForUnit(world, unit);
    } else {
      turnSideAttackTowardTarget(unit, target, sourceSideAttackFacingSeconds(world));
    }
  }
}

function stepPatrolOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {
  if (unit.order?.kind !== "patrol") {
    return;
  }
  let target = unit.order.targetId ? findUnit(world, unit.order.targetId) : undefined;
  if (!canContinueAttackingTarget(world, unit, target)) {
    target = findNearestEnemyInAggroRange(world, unit);
    unit.order.targetId = target?.id ?? null;
  }

  if (target && target.hitPoints > 0) {
    if (isInAttackRange(unit, target, world)) {
      if (unit.attackCooldown <= 0 && canLaunchAttackNow(unit, target)) {
        launchAttack(world, unit, target);
        unit.attackCooldown = attackCooldownForUnit(world, unit);
      } else {
        turnSideAttackTowardTarget(unit, target, tickSeconds);
      }
      return;
    }
    if (world.tick % sourceOrderRetryTicks(world, 15) === 0) {
      unit.order.path = findPath(world, unit, target.x, target.y);
      unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
    }
    stepMoveOrder(world, unit, tickSeconds);
    return;
  }

  if (Math.hypot(unit.x - unit.order.targetX, unit.y - unit.order.targetY) <= Math.max(3, unit.speed * tickSeconds * 1.5)) {
    swapPatrolEndpoint(unit);
    unit.order.patrolRange = 0;
    unit.order.patrolWaitingCycle = 1;
    unit.order.path = findPatrolPathWithinSourceRange(world, unit, unit.order.targetX, unit.order.targetY, unit.order.patrolRange);
    unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
  }

  if (unit.order.path.length === 0 || world.tick % sourceOrderRetryTicks(world, 30) === 0) {
    unit.order.path = findPatrolPathWithinSourceRange(world, unit, unit.order.targetX, unit.order.targetY, unit.order.patrolRange);
    if (unit.order.path.length === 0) {
      unit.order.patrolWaitingCycle += 1;
      unit.order.patrolRange += 1;
      unit.order.path = findPatrolPathWithinSourceRange(world, unit, unit.order.targetX, unit.order.targetY, unit.order.patrolRange);
      if (unit.order.patrolWaitingCycle >= 5 && unit.order.path.length === 0) {
        unit.order.patrolWaitingCycle = 0;
        unit.order.patrolRange = 0;
        swapPatrolEndpoint(unit);
        unit.order.path = findPatrolPathWithinSourceRange(world, unit, unit.order.targetX, unit.order.targetY, unit.order.patrolRange);
      }
    } else {
      unit.order.patrolWaitingCycle = 0;
    }
    unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
  }
  stepMoveOrder(world, unit, tickSeconds);
}

function stepExploreOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {
  if (unit.order?.kind !== "explore") {
    return;
  }
  const order = unit.order;
  if (Math.hypot(unit.x - order.targetX, unit.y - order.targetY) <= Math.max(3, unit.speed * tickSeconds * 1.5)) {
    order.exploreRange = 0;
    order.exploreWaitingCycle = 1;
    retargetExploreOrder(world, unit);
  }

  if (unit.order?.kind !== "explore") {
    return;
  }
  if (unit.order.path.length === 0 || world.tick % sourceOrderRetryTicks(world, 30) === 0) {
    unit.order.path = findExplorationPathWithinSourceRange(world, unit, unit.order.targetX, unit.order.targetY, unit.order.exploreRange);
    if (unit.order.path.length === 0) {
      unit.order.exploreWaitingCycle += 1;
      unit.order.exploreRange += 1;
      unit.order.path = findExplorationPathWithinSourceRange(world, unit, unit.order.targetX, unit.order.targetY, unit.order.exploreRange);
      if (unit.order.exploreWaitingCycle >= 5 && unit.order.path.length === 0) {
        unit.order.exploreWaitingCycle = 0;
        unit.order.exploreRange = 0;
        retargetExploreOrder(world, unit);
      }
    } else {
      unit.order.exploreWaitingCycle = 0;
    }
    unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
  }

  stepMoveOrder(world, unit, tickSeconds);
  if (unit.order?.kind !== "explore") {
    return;
  }
  if (canRunSourceStillAutomaticActions(world, unit)) {
    stepAutoRepair(world, unit);
    if (unit.order?.kind === "explore") {
      stepPlayerAutoCast(world, unit);
    }
    if (unit.order?.kind === "explore") {
      stepDefensiveAutoAttack(world, unit);
    }
  }
}

function swapPatrolEndpoint(unit: WorldUnit): void {
  if (unit.order?.kind !== "patrol") {
    return;
  }
  unit.order.returning = !unit.order.returning;
  unit.order.targetX = unit.order.returning ? unit.order.anchorX : unit.order.patrolX;
  unit.order.targetY = unit.order.returning ? unit.order.anchorY : unit.order.patrolY;
}

function findPatrolPathWithinSourceRange(world: WorldState, unit: WorldUnit, targetX: number, targetY: number, rangeTiles: number): Array<{ x: number; y: number }> {
  const movement = movementKindForUnit(unit);
  const targetTile = worldToTile(world, targetX, targetY);
  const candidates: Array<{ x: number; y: number; distance: number }> = [];
  const radius = Math.max(0, Math.floor(rangeTiles));
  for (let y = targetTile.y - radius; y <= targetTile.y + radius; y += 1) {
    for (let x = targetTile.x - radius; x <= targetTile.x + radius; x += 1) {
      const tileDistance = Math.max(Math.abs(x - targetTile.x), Math.abs(y - targetTile.y));
      if (tileDistance > radius || !isTilePassable(world, x, y, movement, unit.id)) {
        continue;
      }
      candidates.push({ x, y, distance: tileDistance });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || Math.hypot(unit.x - tileToWorldCenter(world, a.x, a.y).x, unit.y - tileToWorldCenter(world, a.x, a.y).y) - Math.hypot(unit.x - tileToWorldCenter(world, b.x, b.y).x, unit.y - tileToWorldCenter(world, b.x, b.y).y));
  for (const candidate of candidates) {
    const point = tileToWorldCenter(world, candidate.x, candidate.y);
    const path = findPath(world, unit, point.x, point.y);
    if (path.length > 0) {
      return path;
    }
  }
  return findPath(world, unit, targetX, targetY);
}

function stepAttackMoveOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {
  if (unit.order?.kind !== "attack-move") {
    return;
  }
  let target = unit.order.targetId ? findUnit(world, unit.order.targetId) : undefined;
  if (!canContinueAttackingTarget(world, unit, target)) {
    target = findNearestEnemyInAggroRange(world, unit);
    unit.order.targetId = target?.id ?? null;
  }

  if (target && target.hitPoints > 0) {
    if (isInAttackRange(unit, target, world)) {
      if (unit.attackCooldown <= 0 && canLaunchAttackNow(unit, target)) {
        launchAttack(world, unit, target);
        unit.attackCooldown = attackCooldownForUnit(world, unit);
      } else {
        turnSideAttackTowardTarget(unit, target, tickSeconds);
      }
      return;
    }
    if (world.tick % sourceOrderRetryTicks(world, 15) === 0) {
      unit.order.path = findPath(world, unit, target.x, target.y);
      unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
    }
    stepMoveOrder(world, unit, tickSeconds);
    return;
  }

  if (unit.order.path.length === 0 || world.tick % sourceOrderRetryTicks(world, 30) === 0) {
    unit.order.path = findPath(world, unit, unit.order.targetX, unit.order.targetY);
    unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
  }
  stepMoveOrder(world, unit, tickSeconds);
}

function stepAttackGroundOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {
  if (unit.order?.kind !== "attack-ground") {
    return;
  }
  if (!canAttackGround(unit)) {
    unit.order = null;
    return;
  }
  if (isGroundTargetInsideMinimumAttackRange(unit, unit.order.targetX, unit.order.targetY) && canReceiveMoveOrders(unit)) {
    const path = findBetterAttackPositionPath(world, unit, unit.order.targetX, unit.order.targetY);
    if (path.length > 0) {
      unit.order.path = path;
      unit.order.pathIndex = path.length > 1 ? 1 : 0;
      stepMoveOrder(world, unit, tickSeconds);
    }
    return;
  }
  if (isGroundTargetInRange(world, unit, unit.order.targetX, unit.order.targetY)) {
    unit.order.path = [];
    unit.order.pathIndex = 0;
    if (unit.attackCooldown <= 0) {
      launchGroundAttack(world, unit, unit.order.targetX, unit.order.targetY);
      unit.attackCooldown = attackCooldownForUnit(world, unit);
    }
    return;
  }
  if (unit.order.path.length === 0 || world.tick % sourceOrderRetryTicks(world, 15) === 0) {
    unit.order.path = findPath(world, unit, unit.order.targetX, unit.order.targetY);
    unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
  }
  if (unit.order.path.length > 0) {
    stepMoveOrder(world, unit, tickSeconds);
  }
}

function stepSpellCastOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {
  if (unit.order?.kind !== "spell-cast") {
    return;
  }
  const command = unit.order.command;
  if (!isTargetedSpellCommand(command) || !canCastTargetedSpellCommand(world, unit, command)) {
    unit.order = null;
    return;
  }
  if (isPointInSpellRange(world, unit, unit.order.targetX, unit.order.targetY, unit.order.spellRange)) {
    const order = unit.order;
    unit.order.spellState = "cast";
    unit.order.path = [];
    unit.order.pathIndex = 0;
    updateUnitFacing(unit, order.targetX - unit.x, order.targetY - unit.y, tickSeconds);
    issueTargetedSpellOrderInternal(world, unit.id, command, order.targetX, order.targetY, false);
    if (unit.order?.kind === "spell-cast") {
      unit.order = null;
    }
    return;
  }
  unit.order.spellState = "move";
  if (unit.order.path.length === 0 || world.tick % sourceOrderRetryTicks(world, 15) === 0) {
    unit.order.path = findSpellCastPathWithinSourceRange(world, unit, unit.order.targetX, unit.order.targetY, unit.order.spellRange);
    unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
  }
  if (unit.order.path.length === 0) {
    unit.order = null;
    return;
  }
  stepMoveOrder(world, unit, tickSeconds);
}

function stepFollowOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {
  if (unit.order?.kind !== "follow") {
    return;
  }
  const followTarget = findUnit(world, unit.order.targetId);
  if (!followTarget || !canTargetFollow(unit, followTarget, world)) {
    unit.order = null;
    return;
  }

  if (unit.canAttack) {
    let attackTarget = unit.order.attackTargetId ? findUnit(world, unit.order.attackTargetId) : undefined;
    if (!canContinueAttackingTarget(world, unit, attackTarget)) {
      attackTarget = findNearestEnemyInAggroRange(world, unit);
      unit.order.attackTargetId = attackTarget?.id ?? null;
    }
    if (attackTarget && attackTarget.hitPoints > 0) {
      if (isInAttackRange(unit, attackTarget, world)) {
        if (unit.attackCooldown <= 0 && canLaunchAttackNow(unit, attackTarget)) {
          launchAttack(world, unit, attackTarget);
          unit.attackCooldown = attackCooldownForUnit(world, unit);
        } else {
          turnSideAttackTowardTarget(unit, attackTarget, tickSeconds);
        }
        return;
      }
      if (world.tick % sourceOrderRetryTicks(world, 15) === 0) {
        unit.order.path = findPath(world, unit, attackTarget.x, attackTarget.y);
        unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
      }
      stepMoveOrder(world, unit, tickSeconds);
      return;
    }
  }

  unit.order.targetX = followTarget.x;
  unit.order.targetY = followTarget.y;
  if (isInFollowRange(unit, followTarget)) {
    if (!canReceiveMoveOrders(followTarget)) {
      unit.order = null;
      return;
    }
    if (tryTeleportThroughFollowTarget(world, unit, followTarget)) {
      return;
    }
    unit.order.followRange = 1;
    unit.order.path = [];
    unit.order.pathIndex = 0;
    updateUnitFacing(unit, followTarget.x - unit.x, followTarget.y - unit.y);
    return;
  }
  if (unit.order.path.length === 0 || world.tick % sourceOrderRetryTicks(world, 15) === 0) {
    unit.order.path = findFollowPathWithinSourceRange(world, unit, followTarget, unit.order.followRange);
    if (unit.order.path.length === 0) {
      unit.order.followRange += 1;
      unit.order.path = findFollowPathWithinSourceRange(world, unit, followTarget, unit.order.followRange);
    }
    unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
  }
  stepMoveOrder(world, unit, tickSeconds);
}

function stepDefendOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {
  if (unit.order?.kind !== "defend") {
    return;
  }
  const defendTarget = findUnit(world, unit.order.targetId);
  if (!defendTarget || !canIssueDefendTarget(world, unit, defendTarget)) {
    unit.order = null;
    return;
  }

  stepPlayerAutoCast(world, unit);
  if (unit.order?.kind !== "defend") {
    return;
  }

  const attackTarget = findNearestEnemyInAggroRange(world, unit);
  if (attackTarget) {
    if (isInAttackRange(unit, attackTarget, world)) {
      if (unit.attackCooldown <= 0 && canLaunchAttackNow(unit, attackTarget)) {
        launchAttack(world, unit, attackTarget);
        unit.attackCooldown = attackCooldownForUnit(world, unit);
      } else {
        turnSideAttackTowardTarget(unit, attackTarget, tickSeconds);
      }
      return;
    }
    if (canReceiveMoveOrders(unit)) {
      unit.order.path = findPath(world, unit, attackTarget.x, attackTarget.y);
      unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
      stepMoveOrder(world, unit, tickSeconds);
      return;
    }
  }

  unit.order.targetX = defendTarget.x;
  unit.order.targetY = defendTarget.y;
  if (isInFollowRange(unit, defendTarget)) {
    unit.order.defendState = "defending";
    unit.order.defendRange = 1;
    unit.order.path = [];
    unit.order.pathIndex = 0;
    updateUnitFacing(unit, defendTarget.x - unit.x, defendTarget.y - unit.y);
    return;
  }
  if (!canReceiveMoveOrders(unit)) {
    return;
  }
  if (unit.order.path.length === 0 || world.tick % sourceOrderRetryTicks(world, 15) === 0) {
    unit.order.path = findFollowPathWithinSourceRange(world, unit, defendTarget, unit.order.defendRange);
    if (unit.order.path.length === 0) {
      unit.order.defendRange += 1;
      unit.order.path = findFollowPathWithinSourceRange(world, unit, defendTarget, unit.order.defendRange);
    }
    unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
  }
  stepMoveOrder(world, unit, tickSeconds);
}

function findFollowPathWithinSourceRange(world: WorldState, unit: WorldUnit, target: WorldUnit, rangeTiles: number): Array<{ x: number; y: number }> {
  const movement = movementKindForUnit(unit);
  const targetTile = worldToTile(world, target.x, target.y);
  const candidates: Array<{ x: number; y: number; distance: number }> = [];
  const radius = Math.max(0, Math.floor(rangeTiles));
  for (let y = targetTile.y - radius; y <= targetTile.y + radius; y += 1) {
    for (let x = targetTile.x - radius; x <= targetTile.x + radius; x += 1) {
      const tileDistance = Math.max(Math.abs(x - targetTile.x), Math.abs(y - targetTile.y));
      if (tileDistance > radius || !isTilePassable(world, x, y, movement, unit.id)) {
        continue;
      }
      candidates.push({ x, y, distance: tileDistance });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || Math.hypot(unit.x - tileToWorldCenter(world, a.x, a.y).x, unit.y - tileToWorldCenter(world, a.x, a.y).y) - Math.hypot(unit.x - tileToWorldCenter(world, b.x, b.y).x, unit.y - tileToWorldCenter(world, b.x, b.y).y));
  for (const candidate of candidates) {
    const point = tileToWorldCenter(world, candidate.x, candidate.y);
    const path = findPath(world, unit, point.x, point.y);
    if (path.length > 0) {
      return path;
    }
  }
  return findPath(world, unit, target.x, target.y);
}

function tryTeleportThroughFollowTarget(world: WorldState, unit: WorldUnit, teleporter: WorldUnit): boolean {
  if (!isReadySourceTeleporter(teleporter) || !teleporter.teleportDestinationId) {
    return false;
  }
  const destination = findUnit(world, teleporter.teleportDestinationId);
  if (!destination || destination.hitPoints <= 0) {
    return false;
  }
  if (Math.hypot(unit.x - teleporter.x, unit.y - teleporter.y) > unit.radius + teleporter.radius + world.tileSize) {
    return false;
  }
  const destinationTile = worldToTile(world, destination.x, destination.y);
  const exitTile = findUnloadTileNear(world, destinationTile, unit, []);
  if (!exitTile) {
    if (unit.order?.kind === "follow") {
      unit.order.path = [];
      unit.order.pathIndex = 0;
    }
    return true;
  }
  const exit = tileToWorldCenter(world, exitTile.x, exitTile.y);
  unit.x = exit.x;
  unit.y = exit.y;
  unit.order = null;
  unit.moveQueue = [];
  updateUnitFacing(unit, destination.x - unit.x, destination.y - unit.y);
  world.events.push({ kind: "unit-teleported", unitId: unit.id, teleporterId: teleporter.id, destinationId: destination.id, player: unit.player, x: unit.x, y: unit.y });
  return true;
}

function stepSpellEffects(world: WorldState, tickSeconds: number): void {
  const activeEffects = [];
  for (const effect of world.spellEffects ?? []) {
    effect.age += tickSeconds;
    if (effect.kind === "runes") {
      triggerRuneField(world, effect);
    } else if (effect.kind === "blizzard" || effect.kind === "death-and-decay") {
      tickAreaDamageSpell(world, effect);
    } else if (effect.kind === "whirlwind") {
      tickWhirlwindSpell(world, effect);
    }
    if (effect.age < effect.duration) {
      activeEffects.push(effect);
    }
  }
  world.spellEffects = activeEffects;
}

function stepStatusEffects(unit: WorldUnit, tickSeconds: number): void {
  unit.baseSpeed ??= unit.speed;
  unit.statusEffects ??= [];
  const activeEffects = [];
  for (const effect of unit.statusEffects) {
    effect.remainingSeconds -= tickSeconds;
    if (effect.remainingSeconds > 0) {
      activeEffects.push(effect);
    }
  }
  unit.statusEffects = activeEffects;
  const speedMultiplier = unit.statusEffects.reduce((multiplier, effect) => multiplier * effect.speedMultiplier, 1);
  unit.speed = unit.baseSpeed <= 0 ? 0 : Math.max(1, unit.baseSpeed * speedMultiplier);
}

function stepPassiveRegeneration(unit: WorldUnit, tickSeconds: number): void {
  unit.regenerationRate ??= 0;
  unit.regenerationFrequency ??= 0;
  unit.regenerationAccumulator ??= 0;
  if (unit.regenerationRate <= 0 || unit.regenerationFrequency <= 0 || unit.hitPoints <= 0 || unit.hitPoints >= unit.maxHitPoints) {
    return;
  }
  if (unit.construction) {
    return;
  }
  unit.regenerationAccumulator += tickSeconds;
  while (unit.regenerationAccumulator >= unit.regenerationFrequency && unit.hitPoints < unit.maxHitPoints) {
    unit.hitPoints = Math.min(unit.maxHitPoints, unit.hitPoints + unit.regenerationRate);
    unit.regenerationAccumulator -= unit.regenerationFrequency;
  }
}

function stepBurnDamage(world: WorldState, unit: WorldUnit, tickSeconds: number): void {
  unit.burnPercent ??= 0;
  unit.burnDamageRate ??= 0;
  unit.burnAccumulator ??= 0;
  if (unit.burnPercent <= 0 || unit.burnDamageRate <= 0 || unit.hitPoints <= 0 || unit.maxHitPoints <= 0 || unit.construction) {
    unit.burnAccumulator = 0;
    return;
  }
  const hpPercent = Math.floor((100 * unit.hitPoints) / unit.maxHitPoints);
  if (hpPercent > unit.burnPercent) {
    unit.burnAccumulator = 0;
    return;
  }
  unit.burnAccumulator += tickSeconds;
  while (unit.burnAccumulator >= 1 && unit.hitPoints > 0) {
    applyDamage(world, unit, unit.burnDamageRate);
    unit.burnAccumulator -= 1;
  }
}

function stepResearch(world: WorldState, tickSeconds: number): void {
  promoteQueuedResearchOrders(world);
  const active: typeof world.activeResearch = [];
  const researchByUpgrade = new Map<string, { entries: typeof world.activeResearch; elapsedSeconds: number }>();
  for (const research of world.activeResearch) {
    const building = findUnit(world, research.buildingId);
    if (!building || building.player !== research.player || building.hitPoints <= 0 || building.construction || building.productionQueue.length > 0) {
      continue;
    }
    const upgrade = world.upgradeDefinitions.find((candidate) => candidate.id === research.upgradeId);
    if (!upgrade || (world.researchedUpgrades[research.player] ?? []).includes(research.upgradeId)) {
      continue;
    }
    const key = `${research.player}:${research.upgradeId}`;
    if (!researchByUpgrade.has(key)) {
      researchByUpgrade.set(key, { entries: [], elapsedSeconds: 0 });
    }
    const group = researchByUpgrade.get(key);
    group?.entries.push(research);
    group!.elapsedSeconds += tickSeconds;
  }
  for (const group of researchByUpgrade.values()) {
    const [first] = group.entries;
    const completingEntry = group.entries.at(-1);
    const completingBuilding = completingEntry ? findUnit(world, completingEntry.buildingId) : undefined;
    const remainingSeconds = Math.min(...group.entries.map((research) => research.remainingSeconds)) - group.elapsedSeconds;
    if (remainingSeconds > 0) {
      for (const research of group.entries) {
        research.remainingSeconds = remainingSeconds;
        active.push(research);
      }
      continue;
    }
    world.researchedUpgrades[first.player] = [...(world.researchedUpgrades[first.player] ?? []), first.upgradeId];
    applyCompletedUpgrade(world, first.player, first.upgradeId);
    world.events.push({
      kind: "research-complete",
      upgradeId: first.upgradeId,
      player: first.player,
      buildingId: completingBuilding?.id ?? first.buildingId,
      x: completingBuilding?.x,
      y: completingBuilding?.y
    });
  }
  world.activeResearch = active;
}

function promoteQueuedResearchOrders(world: WorldState): void {
  const waiting: typeof world.queuedResearch = [];
  for (const research of world.queuedResearch) {
    const building = findUnit(world, research.buildingId);
    if (!building || building.player !== research.player || building.hitPoints <= 0 || building.construction) {
      continue;
    }
    if (building.productionQueue.length > 0 || isBuildingResearching(world, building.id)) {
      waiting.push(research);
      continue;
    }
    const upgrade = world.upgradeDefinitions.find((candidate) => candidate.id === research.upgradeId);
    if (!upgrade || (world.researchedUpgrades[research.player] ?? []).includes(research.upgradeId) || !canResearchAt(world, building, research.upgradeId) || !hasResearchGatePrerequisites(world, research.player, research.upgradeId) || !isResearchUpgradeAllowed(world, research.upgradeId, research.player)) {
      continue;
    }
    const sameUpgradeActive = world.activeResearch.some((active) => active.player === research.player && active.upgradeId === research.upgradeId);
    if (sameUpgradeActive && !sourceResearchAllowsSharedProgress(world, building, research.upgradeId)) {
      waiting.push(research);
      continue;
    }
    const totalSeconds = sourceResearchDurationSecondsForPlayer(world, research.player, upgrade.costs.time);
    world.activeResearch.push({ buildingId: research.buildingId, player: research.player, upgradeId: research.upgradeId, remainingSeconds: totalSeconds, totalSeconds });
  }
  world.queuedResearch = waiting;
}

function stepInsideConstructionStates(world: WorldState, tickSeconds: number): void {
  for (const building of world.units) {
    if (!building.construction?.builderInside || building.hitPoints <= 0) {
      continue;
    }
    const builder = findUnit(world, building.construction.builderId);
    if (!builder || builder.hitPoints <= 0 || builder.hiddenInConstructionId !== building.id) {
      continue;
    }
    progressConstruction(world, building, tickSeconds, builder);
  }
}

function stepAiPlayers(world: WorldState): void {
  for (const state of world.aiStates) {
    if (!state.enabled || world.tick < state.nextThinkTick) {
      continue;
    }
    const player = world.players.find((candidate) => candidate.id === state.player);
    if (!player) {
      state.enabled = false;
      continue;
    }
    applySourceAiDifficultyBonuses(world, player);
    advanceSourceAiScript(world, player.id, state);
    runLandAttackAi(world, player.id, state);
    state.nextThinkTick = world.tick + sourceAiSleepCycles(world, 30);
  }
}

type SourceAiUnitRole = "worker" | "soldier" | "shooter" | "elite-shooter" | "cavalry" | "cavalry-mage" | "catapult" | "mage" | "flyer";
type SourceAiBuildRole = "town-center" | "town-center-tier2" | "town-center-tier3" | "supply" | "barracks" | "lumber-mill" | "blacksmith" | "tower" | "guard-tower" | "cannon-tower" | "advanced-melee" | "holy" | "caster" | "air";
type SourceAiRole = SourceAiUnitRole | SourceAiBuildRole;
type SourceAiInstruction =
  | { kind: "sleep"; cycles: number }
  | { kind: "need"; role: SourceAiBuildRole }
  | { kind: "set"; role: SourceAiRole; count: number }
  | { kind: "wait"; role: SourceAiRole }
  | { kind: "force"; id: number; attack: boolean; targets: Array<{ role: SourceAiUnitRole; count: number }> }
  | { kind: "force-role"; id: number; role: string }
  | { kind: "wait-force"; id: number }
  | { kind: "attack-force"; id: number }
  | { kind: "upgrade-to"; role: SourceAiBuildRole }
  | { kind: "research"; id: string };

const SOURCE_AI_LAND_ATTACK_SCRIPT: SourceAiInstruction[] = [
  { kind: "sleep", cycles: 120 },
  { kind: "need", role: "town-center" },
  { kind: "set", role: "worker", count: 1 },
  { kind: "wait", role: "town-center" },
  { kind: "wait", role: "worker" },
  { kind: "set", role: "worker", count: 4 },
  { kind: "need", role: "barracks" },
  { kind: "set", role: "worker", count: 8 },
  { kind: "wait", role: "barracks" },
  { kind: "set", role: "blacksmith", count: 1 },
  { kind: "force", id: 1, attack: true, targets: [{ role: "soldier", count: 1 }] },
  { kind: "wait-force", id: 1 },
  { kind: "attack-force", id: 1 },
  { kind: "force", id: 1, attack: true, targets: [{ role: "soldier", count: 4 }] },
  { kind: "wait-force", id: 1 },
  { kind: "set", role: "worker", count: 12 },
  { kind: "attack-force", id: 1 },
  { kind: "set", role: "barracks", count: 2 },
  { kind: "force", id: 1, attack: true, targets: [{ role: "soldier", count: 16 }] },
  { kind: "force", id: 0, attack: false, targets: [{ role: "soldier", count: 4 }] },
  { kind: "set", role: "worker", count: 20 },
  { kind: "wait-force", id: 1 },
  { kind: "attack-force", id: 1 },
  { kind: "upgrade-to", role: "town-center-tier2" },
  { kind: "wait", role: "town-center-tier2" },
  { kind: "set", role: "worker", count: 25 },
  { kind: "need", role: "advanced-melee" },
  { kind: "force", id: 0, attack: false, targets: [{ role: "cavalry", count: 2 }] },
  { kind: "need", role: "lumber-mill" },
  { kind: "wait", role: "lumber-mill" },
  { kind: "upgrade-to", role: "town-center-tier3" },
  { kind: "set", role: "worker", count: 30 },
  { kind: "wait", role: "town-center-tier3" },
  { kind: "need", role: "holy" },
  { kind: "need", role: "caster" },
  { kind: "force", id: 4, attack: true, targets: [{ role: "cavalry-mage", count: 10 }] },
  { kind: "force", id: 5, attack: true, targets: [{ role: "cavalry-mage", count: 8 }, { role: "mage", count: 4 }] },
  { kind: "force", id: 6, attack: true, targets: [{ role: "cavalry-mage", count: 6 }] },
  { kind: "force", id: 7, attack: true, targets: [{ role: "cavalry-mage", count: 4 }] },
  { kind: "force", id: 8, attack: true, targets: [{ role: "cavalry-mage", count: 3 }, { role: "catapult", count: 1 }] },
  { kind: "set", role: "worker", count: 35 },
  { kind: "wait-force", id: 4 },
  { kind: "attack-force", id: 4 },
  { kind: "wait-force", id: 5 },
  { kind: "attack-force", id: 5 },
  { kind: "wait-force", id: 6 },
  { kind: "attack-force", id: 6 },
  { kind: "wait-force", id: 7 },
  { kind: "attack-force", id: 7 },
  { kind: "wait-force", id: 8 },
  { kind: "attack-force", id: 8 }
];

const SOURCE_AI_AIR_ATTACK_SCRIPT: SourceAiInstruction[] = [
  { kind: "sleep", cycles: 120 },
  { kind: "need", role: "town-center" },
  { kind: "set", role: "worker", count: 1 },
  { kind: "wait", role: "town-center" },
  { kind: "wait", role: "worker" },
  { kind: "set", role: "worker", count: 9 },
  { kind: "need", role: "lumber-mill" },
  { kind: "need", role: "barracks" },
  { kind: "wait", role: "barracks" },
  { kind: "force", id: 0, attack: false, targets: [{ role: "soldier", count: 2 }] },
  { kind: "force-role", id: 0, role: "defend" },
  { kind: "wait-force", id: 0 },
  { kind: "need", role: "blacksmith" },
  { kind: "upgrade-to", role: "town-center-tier2" },
  { kind: "set", role: "worker", count: 15 },
  { kind: "force", id: 0, attack: false, targets: [{ role: "soldier", count: 2 }, { role: "shooter", count: 3 }] },
  { kind: "wait", role: "town-center-tier2" },
  { kind: "need", role: "advanced-melee" },
  { kind: "need", role: "tower" },
  { kind: "upgrade-to", role: "guard-tower" },
  { kind: "upgrade-to", role: "town-center-tier3" },
  { kind: "wait", role: "town-center-tier3" },
  { kind: "need", role: "air" },
  { kind: "force", id: 2, attack: true, targets: [{ role: "flyer", count: 1 }] },
  { kind: "wait-force", id: 2 },
  { kind: "attack-force", id: 2 },
  { kind: "sleep", cycles: 500 },
  { kind: "need", role: "town-center" },
  { kind: "need", role: "tower" },
  { kind: "upgrade-to", role: "guard-tower" },
  { kind: "need", role: "air" },
  { kind: "force", id: 2, attack: true, targets: [{ role: "flyer", count: 2 }] },
  { kind: "wait-force", id: 2 },
  { kind: "set", role: "worker", count: 20 },
  { kind: "force", id: 1, attack: true, targets: [{ role: "flyer", count: 2 }] },
  { kind: "attack-force", id: 2 },
  { kind: "wait-force", id: 1 },
  { kind: "attack-force", id: 1 }
];

function advanceSourceAiScript(world: WorldState, playerId: number, state: WorldAiState): void {
  const script = sourceAiScriptForState(state);
  if (!script || world.tick < state.sourceScriptSleepUntilTick) {
    return;
  }
  for (let steps = 0; steps < 8; steps += 1) {
    if (state.sourceScriptIndex >= script.length) {
      state.sourceScriptIndex = Math.max(0, script.length - 8);
    }
    const instruction = script[state.sourceScriptIndex];
    if (!instruction || !applySourceAiInstruction(world, playerId, state, instruction)) {
      return;
    }
    state.sourceScriptIndex += 1;
  }
}

function sourceAiScriptForState(state: WorldAiState): SourceAiInstruction[] | null {
  if (state.sourceScriptId === "wc2-air-attack" || state.strategy === "air") {
    return SOURCE_AI_AIR_ATTACK_SCRIPT;
  }
  if (state.sourceScriptId === "wc2-land-attack" || state.strategy === "land") {
    return SOURCE_AI_LAND_ATTACK_SCRIPT;
  }
  return null;
}

function applySourceAiInstruction(world: WorldState, playerId: number, state: WorldAiState, instruction: SourceAiInstruction): boolean {
  const race = world.players.find((player) => player.id === playerId)?.race;
  switch (instruction.kind) {
    case "sleep":
      state.sourceScriptSleepUntilTick = world.tick + sourceAiSleepCycles(world, instruction.cycles);
      return true;
    case "need":
    case "upgrade-to":
      addSourceAiBuildNeed(state, instruction.role);
      return sourceAiRoleCount(world, playerId, instruction.role) > 0 || issueSourceAiNeedNow(world, playerId, instruction.role, race);
    case "set":
      applySourceAiSet(world, playerId, state, instruction.role, instruction.count);
      return true;
    case "wait":
      return sourceAiRoleCount(world, playerId, instruction.role) > 0;
    case "force":
      setSourceAiForce(world, playerId, state, instruction.id, instruction.attack, instruction.targets);
      return true;
    case "force-role":
      state.sourceScriptForceRoles = [...state.sourceScriptForceRoles.filter((entry) => entry.id !== instruction.id), { id: instruction.id, role: instruction.role }];
      return true;
    case "wait-force":
      return sourceAiForceReady(world, playerId, state, instruction.id);
    case "attack-force":
      selectSourceAiAttackForce(state, instruction.id);
      state.nextAttackTick = Math.min(state.nextAttackTick, world.tick);
      return true;
    case "research":
      if (!state.researchOrder.includes(instruction.id)) {
        state.researchOrder = [...state.researchOrder, instruction.id];
      }
      return true;
    default:
      return true;
  }
}

function addSourceAiBuildNeed(state: WorldAiState, role: SourceAiBuildRole): void {
  const targetRole = role === "guard-tower" || role === "cannon-tower" ? "tower" : role;
  if (!state.buildOrder.includes(targetRole)) {
    state.buildOrder = [...state.buildOrder, targetRole];
  }
}

function issueSourceAiNeedNow(world: WorldState, playerId: number, role: SourceAiBuildRole, race: string | null | undefined): boolean {
  const builder = world.units.find((unit) => unit.player === playerId && isUsableBuilder(unit) && !unit.order);
  if (!builder) {
    return false;
  }
  return issueAiBuildBySourceRole(world, builder, playerId, role === "guard-tower" || role === "cannon-tower" ? "tower" : role, race);
}

function applySourceAiSet(world: WorldState, playerId: number, state: WorldAiState, role: SourceAiRole, count: number): void {
  if (role === "worker") {
    state.workerTarget = Math.max(state.workerTarget ?? 1, count);
    return;
  }
  if (isSourceAiBuildRole(role)) {
    for (let index = sourceAiRoleDesiredBuildCount(state, role); index < count; index += 1) {
      addSourceAiBuildNeed(state, role);
    }
    return;
  }
  setSourceAiForce(world, playerId, state, 1, true, [{ role, count }]);
}

function setSourceAiForce(world: WorldState, playerId: number, state: WorldAiState, id: number, attack: boolean, targets: Array<{ role: SourceAiUnitRole; count: number }>): void {
  const mappedTargets = targets.map((target) => ({
    role: target.role,
    count: Math.max(0, Math.floor(target.count)),
    unitTypeId: sourceAiUnitTypeForRole(world, playerId, target.role)
  }));
  state.sourceScriptForces = [
    ...state.sourceScriptForces.filter((force) => force.id !== id),
    { id, attack, targets: mappedTargets }
  ];
  if (attack) {
    state.attackForceIds = [...state.attackForceIds.filter((forceId) => forceId !== id), id];
    state.attackWaveUnitTargets = [...state.attackWaveUnitTargets, mappedTargets.filter((target): target is { role: SourceAiUnitRole; count: number; unitTypeId: string } => Boolean(target.unitTypeId)).map((target) => ({ unitTypeId: target.unitTypeId, count: target.count }))];
    state.attackUnitTargets = mappedTargets.filter((target): target is { role: SourceAiUnitRole; count: number; unitTypeId: string } => Boolean(target.unitTypeId)).map((target) => ({ unitTypeId: target.unitTypeId, count: target.count }));
    state.attackForceSize = Math.max(1, mappedTargets.reduce((sum, target) => sum + target.count, 0));
  } else {
    state.defendForceSize = Math.max(state.defendForceSize ?? 0, mappedTargets.reduce((sum, target) => sum + target.count, 0));
  }
}

function selectSourceAiAttackForce(state: WorldAiState, id: number): void {
  const force = state.sourceScriptForces.find((candidate) => candidate.id === id);
  if (!force) {
    return;
  }
  const targets = force.targets
    .filter((target): target is { role: string; count: number; unitTypeId: string } => Boolean(target.unitTypeId))
    .map((target) => ({ unitTypeId: target.unitTypeId, count: target.count }));
  state.attackForceIds = [id];
  state.attackUnitTargets = targets;
  state.attackWaveUnitTargets = targets.length > 0 ? [targets] : [];
  state.attackForceSize = Math.max(1, force.targets.reduce((sum, target) => sum + target.count, 0));
}

function sourceAiForceReady(world: WorldState, playerId: number, state: WorldAiState, id: number): boolean {
  const force = state.sourceScriptForces.find((candidate) => candidate.id === id);
  if (!force) {
    return true;
  }
  return force.targets.every((target) => {
    if (target.count <= 0 || !target.unitTypeId) {
      return true;
    }
    return isSourceAiUnitRole(target.role)
      && countSourceAiCombatRole(world, playerId, target.role, target.unitTypeId) >= sourceAiDifficultyForceCount(world, target.count);
  });
}

function sourceAiRoleDesiredBuildCount(state: WorldAiState, role: SourceAiBuildRole): number {
  return state.buildOrder.filter((candidate) => candidate === role).length;
}

function isSourceAiBuildRole(role: SourceAiRole): role is SourceAiBuildRole {
  return role === "town-center" || role === "town-center-tier2" || role === "town-center-tier3" || role === "supply" || role === "barracks" || role === "lumber-mill" || role === "blacksmith" || role === "tower" || role === "guard-tower" || role === "cannon-tower" || role === "advanced-melee" || role === "holy" || role === "caster" || role === "air";
}

function isSourceAiUnitRole(role: string): role is SourceAiUnitRole {
  return role === "worker" || role === "soldier" || role === "shooter" || role === "elite-shooter" || role === "cavalry" || role === "cavalry-mage" || role === "catapult" || role === "mage" || role === "flyer";
}

function sourceAiRoleCount(world: WorldState, playerId: number, role: SourceAiRole): number {
  if (role === "worker") {
    return world.units.filter((unit) => unit.player === playerId && unit.hitPoints > 0 && isWorker(unit)).length;
  }
  if (!isSourceAiBuildRole(role)) {
    const unitTypeId = sourceAiUnitTypeForRole(world, playerId, role);
    return unitTypeId ? countSourceAiCombatRole(world, playerId, role, unitTypeId) : 0;
  }
  const buildings = world.units.filter((unit) => unit.player === playerId && isSourceAiBuilding(unit) && unit.hitPoints > 0);
  return sourceAiBuildRoleCount(world, buildings, role, playerId);
}

function countSourceAiCombatRole(world: WorldState, playerId: number, role: SourceAiUnitRole, unitTypeId: string): number {
  return world.units.filter((unit) => {
    if (unit.player !== playerId || unit.hitPoints <= 0 || unit.construction || isWorker(unit)) {
      return false;
    }
    if (unit.typeId === unitTypeId) {
      return true;
    }
    const definition = world.unitDefinitions.find((candidate) => candidate.id === unit.typeId);
    return Boolean(definition && sourceAiUnitDefinitionMatchesRole(definition, role));
  }).length;
}

function sourceAiUnitTypeForRole(world: WorldState, playerId: number, role: SourceAiUnitRole): string | null {
  const race = world.players.find((player) => player.id === playerId)?.race === "orc" ? "orc" : "human";
  const preferred = sourceAiPreferredUnitTypeForRole(race, role);
  if (world.unitDefinitions.some((definition) => definition.id === preferred)) {
    return preferred;
  }
  return world.unitDefinitions.find((definition) => sourceAiUnitDefinitionMatchesRole(definition, role))?.id ?? null;
}

function sourceAiPreferredUnitTypeForRole(race: "human" | "orc", role: SourceAiUnitRole): string {
  if (role === "worker") {
    return race === "human" ? "unit-peasant" : "unit-peon";
  }
  if (role === "soldier") {
    return race === "human" ? "unit-footman" : "unit-grunt";
  }
  if (role === "shooter" || role === "elite-shooter") {
    return race === "human" ? "unit-archer" : "unit-axethrower";
  }
  if (role === "cavalry") {
    return race === "human" ? "unit-knight" : "unit-ogre";
  }
  if (role === "cavalry-mage") {
    return race === "human" ? "unit-paladin" : "unit-ogre-mage";
  }
  if (role === "catapult") {
    return race === "human" ? "unit-ballista" : "unit-catapult";
  }
  if (role === "mage") {
    return race === "human" ? "unit-mage" : "unit-death-knight";
  }
  return race === "human" ? "unit-gryphon-rider" : "unit-dragon";
}

function sourceAiUnitDefinitionMatchesRole(definition: WargusUnit, role: SourceAiUnitRole): boolean {
  if (role === "worker") {
    return (definition.gatherResources ?? []).length > 0 || definition.canHarvest === true;
  }
  if (role === "flyer") {
    return Boolean((definition.airUnit || definition.type === "fly") && definition.canAttack);
  }
  if (role === "mage") {
    return Boolean(definition.manaEnabled || (definition.manaMax ?? 0) > 0);
  }
  if (role === "catapult") {
    return Boolean(definition.groundAttack && Math.max(0, definition.minAttackRange ?? 0) > 0);
  }
  if (role === "shooter" || role === "elite-shooter") {
    return Boolean(definition.groundAttack && Math.max(0, definition.basicDamage ?? 0) > 0 && Math.max(0, definition.piercingDamage ?? 0) > 0 && Math.max(0, definition.minAttackRange ?? 0) === 0);
  }
  if (role === "cavalry" || role === "cavalry-mage") {
    return Boolean(definition.canAttack && (definition.speed ?? 0) >= 10 && !definition.airUnit && definition.type !== "fly");
  }
  return Boolean(definition.canAttack && !definition.airUnit && definition.type !== "fly");
}

function sourceAiSleepCycles(world: WorldState, cycles: number): number {
  const difficulty = Math.floor(world.engineSettings.lastDifficultyDefault);
  if (difficulty === 1) {
    return Math.max(1, Math.floor(5 * cycles));
  }
  if (difficulty === 2) {
    return Math.max(1, Math.floor(1.25 * cycles));
  }
  if (difficulty === 3) {
    return Math.max(1, Math.floor(cycles));
  }
  if (difficulty === 4) {
    return Math.max(1, Math.floor(cycles / 2));
  }
  if (difficulty === 5) {
    return Math.max(1, Math.floor(cycles / 3));
  }
  return Math.max(1, Math.floor(cycles));
}

function applySourceAiDifficultyBonuses(world: WorldState, player: WorldState["players"][number]): void {
  if (player.playerType === "person" || player.playerType === "nobody") {
    return;
  }
  const difficulty = Math.floor(world.engineSettings.lastDifficultyDefault);
  if (difficulty === 4) {
    applySourceAiResourceBonus(world, player, 50, 35, 25);
    setSourceAiSpeedFactors(player, 120);
  } else if (difficulty === 5) {
    applySourceAiResourceBonus(world, player, 100, 75, 50);
    setSourceAiSpeedFactors(player, 150);
  } else if (difficulty === 1) {
    setSourceAiSpeedFactors(player, 75);
  }
}

function applySourceAiResourceBonus(world: WorldState, player: WorldState["players"][number], gold: number, wood: number, oil: number): void {
  addPlayerResource(world, player, "gold", gold);
  addPlayerResource(world, player, "wood", wood);
  addPlayerResource(world, player, "oil", oil);
}

function setSourceAiSpeedFactors(player: WorldState["players"][number], speed: number): void {
  player.speedFactors.build = speed;
  player.speedFactors.train = speed;
  player.speedFactors.upgrade = speed;
  player.speedFactors.research = speed;
  for (const resource of ["gold", "wood", "oil"]) {
    player.speedFactors.resourceHarvest[resource] = speed;
    player.speedFactors.resourceReturn[resource] = speed;
  }
}

function runLandAttackAi(world: WorldState, playerId: number, state: { nextAttackTick: number; strategy?: "land" | "sea" | "air"; attackForceSize?: number; attackForceIds?: number[]; forceSizes?: number[]; attackWaveSizes?: number[]; attackWaveUnitTargets?: Array<Array<{ unitTypeId: string; count: number }>>; nextAttackWaveIndex?: number; defendForceSize?: number; attackDelayTicks?: number; attackUnitTargets?: Array<{ unitTypeId: string; count: number }>; buildOrder?: string[]; buildDepots?: boolean; preferredAttackUnitTypes?: string[]; workerTarget?: number; tankerTarget?: number; transportTarget?: number; collectWeights?: { gold: number; wood: number; oil: number } | null; researchOrder?: string[] }): void {
  const units = world.units.filter((unit) => unit.player === playerId && unit.hitPoints > 0 && !isUnitHiddenInConstruction(unit));
  const workers = units.filter(isWorker);
  const completedUnits = units.filter((unit) => !unit.construction);
  const halls = completedUnits.filter(isTownCenter);
  const barracks = completedUnits.filter((unit) => isBarracks(world, unit));
  const blacksmiths = completedUnits.filter((unit) => isBlacksmith(world, unit));
  const lumberMills = completedUnits.filter((unit) => isLumberMill(world, unit));
  const advancedProducers = completedUnits.filter((unit) => isAdvancedMeleeProducer(world, unit));
  const holyProducers = completedUnits.filter((unit) => isHolyResearchProducer(world, unit));
  const casterProducers = completedUnits.filter((unit) => isCasterProducer(world, unit));
  const airProducers = completedUnits.filter((unit) => isAirProducer(world, unit));
  const demolitionProducers = completedUnits.filter((unit) => isDemolitionProducer(world, unit));
  const shipyards = completedUnits.filter((unit) => isShipyard(world, unit));
  const foundries = completedUnits.filter((unit) => isFoundry(world, unit));
  const refineries = completedUnits.filter(isOilRefinery);
  const tankers = units.filter(isOilTanker);
  const transports = completedUnits.filter(isTransport);
  const scoutFlyers = completedUnits.filter(isScoutFlyer);
  const navalArmy = completedUnits.filter((unit) => unit.canAttack && unit.kind === "naval");
  const army = completedUnits.filter((unit) => unit.canAttack && !isWorker(unit) && canReceiveMoveOrders(unit));
  const casters = completedUnits.filter((unit) => unit.manaEnabled && unit.canCastSpells.length > 0);
  const race = world.players.find((player) => player.id === playerId)?.race;
  const attackForceId = currentAiAttackForceId(state);
  const attackUnitTargets = sourceAiDifficultyUnitTargets(world, currentAiAttackUnitTargets(state, attackForceId));

  if (halls.length === 0 && workers.length > 0) {
    const builder = workers.find((worker) => !worker.order) ?? workers[0];
    issueAiBuildBySourceRole(world, builder, playerId, "town-center", race);
  }

  issueSourceAiBuildNeeds(world, playerId, state.buildOrder ?? [], race, state.buildDepots ?? true);

  for (const worker of workers) {
    if (worker.order) {
      continue;
    }
    if (worker.resourcesHeld > 0) {
      issueReturnGoodsOrder(world, worker.id);
      continue;
    }
    const repairTarget = findNearestAiRepairTarget(world, worker);
    if (repairTarget && issueRepairOrder(world, worker.id, repairTarget.id)) {
      continue;
    }
    const preferredResource = preferredAiWorkerResource(world, worker, state.collectWeights ?? null);
    if (preferredResource !== "wood") {
      const goldMine = findNearestGoldMine(world, worker);
      if (goldMine && (preferredResource === "gold" || deterministicChance(world, `${worker.id}:gold`, 0.7))) {
        issueHarvestOrder(world, worker.id, goldMine.id);
        continue;
      }
    }
    if (preferredResource !== "gold") {
      const woodTile = findNearestWoodTile(world, worker);
      if (woodTile) {
        issueHarvestWoodOrder(world, worker.id, woodTile.x, woodTile.y);
      }
    }
  }

  const workerTarget = Math.max(1, Math.floor(state.workerTarget ?? 7));
  for (const hall of halls) {
    if (workers.length + hall.productionQueue.length < workerTarget) {
      issueTrainWorkerOrder(world, hall.id, world.unitDefinitions);
    }
  }

  const supply = getPlayerSupply(world, playerId);
  if (supply.cap - supply.used - supply.queued <= 2) {
    const builder = workers.find((worker) => !worker.order);
    if (builder) {
      issueAiBuildBySourceRole(world, builder, playerId, "supply", race);
    }
  }

  if (barracks.length === 0 && workers.length > 0) {
    const builder = workers.find((worker) => !worker.order) ?? workers[0];
    issueAiBuildBySourceRole(world, builder, playerId, "barracks", race);
  }

  if (barracks.length > 0 && lumberMills.length === 0 && army.length >= 2 && workers.length > 0) {
    const builder = workers.find((worker) => !worker.order) ?? workers[0];
    issueAiBuildBySourceRole(world, builder, playerId, "lumber-mill", race);
  }

  if (barracks.length > 0 && blacksmiths.length === 0 && army.length >= 3 && workers.length > 0) {
    const builder = workers.find((worker) => !worker.order) ?? workers[0];
    issueAiBuildBySourceRole(world, builder, playerId, "blacksmith", race);
  }

  if (barracks.length > 0 && advancedProducers.length === 0 && army.length >= (state.strategy === "air" ? 2 : 4) && workers.length > 0) {
    const builder = workers.find((worker) => !worker.order) ?? workers[0];
    if (!hasTownCenterTier(world, playerId, 2)) {
      const hall = halls.find((candidate) => canAiUpgradeTownCenter(world, candidate));
      if (hall) {
        issueUpgradeTownCenterOrder(world, hall.id, world.unitDefinitions);
      }
    } else {
      issueAiBuildBySourceRole(world, builder, playerId, "advanced-melee", race);
    }
  }

  if (advancedProducers.length > 0 && !hasTownCenterTier(world, playerId, 3) && army.length >= (state.strategy === "air" ? 3 : 6)) {
    const hall = halls.find((candidate) => canAiUpgradeTownCenter(world, candidate));
    if (hall) {
      issueUpgradeTownCenterOrder(world, hall.id, world.unitDefinitions);
    }
  }

  if (hasTownCenterTier(world, playerId, 2) && holyProducers.length === 0 && army.length >= 5 && workers.length > 0) {
    const builder = workers.find((worker) => !worker.order) ?? workers[0];
    issueAiBuildBySourceRole(world, builder, playerId, "holy", race);
  }

  if (hasTownCenterTier(world, playerId, 2) && casterProducers.length === 0 && army.length >= 5 && workers.length > 0) {
    const builder = workers.find((worker) => !worker.order) ?? workers[0];
    issueAiBuildBySourceRole(world, builder, playerId, "caster", race);
  }

  if (hasOilOnMap(world) && shipyards.length === 0 && hasTownCenterTier(world, playerId, 2) && army.length >= (state.strategy === "sea" ? 2 : 5) && workers.length > 0) {
    const builder = workers.find((worker) => !worker.order) ?? workers[0];
    issueAiBuildBySourceRole(world, builder, playerId, "shipyard", race);
  }

  if (shipyards.length > 0 && foundries.length === 0 && army.length >= (state.strategy === "sea" ? 2 : 7) && workers.length > 0) {
    const builder = workers.find((worker) => !worker.order) ?? workers[0];
    issueAiBuildBySourceRole(world, builder, playerId, "foundry", race);
  }

  if ((state.buildDepots ?? true) && shipyards.length > 0 && refineries.length === 0 && tankers.length > 0 && workers.length > 0) {
    const builder = workers.find((worker) => !worker.order) ?? workers[0];
    issueAiBuildBySourceRole(world, builder, playerId, "refinery", race);
  }

  if (hasTownCenterTier(world, playerId, 3) && airProducers.length === 0 && army.length >= (state.strategy === "air" ? 3 : 7) && workers.length > 0) {
    const builder = workers.find((worker) => !worker.order) ?? workers[0];
    issueAiBuildBySourceRole(world, builder, playerId, "air", race);
  }

  if (hasTownCenterTier(world, playerId, 3) && demolitionProducers.length === 0 && army.length >= 6 && workers.length > 0) {
    const builder = workers.find((worker) => !worker.order) ?? workers[0];
    issueAiBuildBySourceRole(world, builder, playerId, "demolition", race);
  }

  for (const building of blacksmiths) {
    if (building.construction) {
      continue;
    }
    issueNextAiResearchByRole(world, building, (upgradeId) => isBlacksmithUpgradeId(world, upgradeId), state.researchOrder);
  }

  for (const building of lumberMills) {
    if (building.construction) {
      continue;
    }
    issueNextAiResearchByRole(world, building, (upgradeId) => isLumberMillUpgradeId(world, upgradeId), state.researchOrder);
  }

  for (const building of barracks) {
    if (building.productionQueue.length > 0) {
      continue;
    }
    const role = army.length % 3 === 2 ? "ranged" : "melee";
    issueAiSourceTrainOrder(world, building, (definition) => sourceAttackUnitTrainScore(world, playerId, definition, attackUnitTargets) || aiBarracksTrainScore(definition, role))
      || issueTrainBarracksUnitOrder(world, building.id, role, world.unitDefinitions);
  }

  for (const building of advancedProducers) {
    if (building.productionQueue.length === 0 && army.length >= 4) {
      issueAiSourceTrainOrder(world, building, (definition) => sourceAttackUnitTrainScore(world, playerId, definition, attackUnitTargets) || 1)
        || issueTrainAdvancedUnitOrder(world, building.id, world.unitDefinitions);
    }
  }

  for (const building of holyProducers) {
    if (!building.construction) {
      issueNextAiResearchByRole(world, building, (upgradeId) => isHolyResearchUpgradeId(world, upgradeId), state.researchOrder);
    }
  }

  for (const building of casterProducers) {
    if (!building.construction) {
      issueNextAiResearchByRole(world, building, (upgradeId) => isCasterResearchUpgradeId(world, upgradeId), state.researchOrder);
      if (building.productionQueue.length === 0 && casters.length < 3) {
        issueAiSourceTrainOrder(world, building, (definition) => sourceAttackUnitTrainScore(world, playerId, definition, attackUnitTargets) || 1)
          || issueTrainCasterOrder(world, building.id, world.unitDefinitions);
      }
    }
  }

  for (const tanker of tankers) {
    if (tanker.order) {
      continue;
    }
    if (tanker.resourcesHeld > 0) {
      issueReturnGoodsOrder(world, tanker.id);
      continue;
    }
    const platform = findNearestOwnedOilPlatform(world, tanker);
    if (platform) {
      issueHarvestOilOrder(world, tanker.id, platform.id);
      continue;
    }
    const patch = findNearestOilPatch(world, tanker);
    if (patch) {
      issueBuildOilPlatformOrder(world, tanker.id, patch.id, world.unitDefinitions);
    }
  }

  for (const shipyard of shipyards) {
    if (shipyard.construction || shipyard.productionQueue.length > 0) {
      continue;
    }
    const tankerTarget = Math.max(0, Math.floor(state.tankerTarget ?? 1));
    const transportTarget = Math.max(0, Math.floor(state.transportTarget ?? 0));
    if (tankers.length < tankerTarget && findNearestOilPatch(world, shipyard)) {
      issueAiSourceTrainOrder(world, shipyard, (definition) => isOilTankerDefinition(definition) ? 100 : 0)
        || issueTrainNavalUnitOrder(world, shipyard.id, "tanker", world.unitDefinitions);
    } else if (transports.length < transportTarget) {
      issueAiSourceTrainOrder(world, shipyard, (definition) => isNavalRoleDefinition(definition, "transport") ? 100 : 0)
        || issueTrainNavalUnitOrder(world, shipyard.id, "transport", world.unitDefinitions);
    } else if (army.length >= (state.strategy === "sea" ? 2 : 6)) {
      const desiredRole = navalArmy.length % (state.strategy === "sea" ? 3 : 4) === 2 ? "warship" : "destroyer";
      const issued = issueAiSourceTrainOrder(world, shipyard, (definition) => sourceAttackUnitTrainScore(world, playerId, definition, attackUnitTargets) || aiNavalTrainScore(definition, desiredRole))
        || issueTrainNavalUnitOrder(world, shipyard.id, desiredRole, world.unitDefinitions);
      if (!issued && desiredRole === "warship") {
        issueAiSourceTrainOrder(world, shipyard, (definition) => definition.canAttack && definition.seaUnit ? 50 : 0)
          || issueTrainNavalUnitOrder(world, shipyard.id, race === "human" ? "submarine" : "destroyer", world.unitDefinitions);
      }
    }
  }

  for (const foundry of foundries) {
    if (!foundry.construction) {
      issueNextAiResearchByRole(world, foundry, (upgradeId) => isShipUpgradeId(world, upgradeId), state.researchOrder);
    }
  }

  for (const building of airProducers) {
    if (!building.construction && building.productionQueue.length === 0 && army.length >= (state.strategy === "air" ? 3 : 6)) {
      issueAiSourceTrainOrder(world, building, (definition) => sourceAttackUnitTrainScore(world, playerId, definition, attackUnitTargets) || 1)
        || issueTrainAirUnitOrder(world, building.id, world.unitDefinitions);
    }
  }

  for (const building of demolitionProducers) {
    if (building.construction || building.productionQueue.length > 0 || army.length < 6) {
      continue;
    }
    const count = demolitionProductionCount(world, completedUnits);
    const sourceScore = (definition: WargusUnit): number => sourceAttackUnitTrainScore(world, playerId, definition, attackUnitTargets);
    if (count % 5 === 4) {
      issueAiSourceTrainOrder(world, building, (definition) => sourceScore(definition) || (definition.airUnit && !definition.canAttack ? 100 : 0))
        || issueTrainScoutAirOrder(world, building.id, world.unitDefinitions);
    } else if (count % 3 === 2) {
      issueAiSourceTrainOrder(world, building, (definition) => sourceScore(definition) || (definition.volatile || definition.clicksToExplode ? 100 : 0))
        || issueTrainDemolitionOrder(world, building.id, world.unitDefinitions);
    } else {
      issueAiSourceTrainOrder(world, building, (definition) => sourceScore(definition) || (definition.groundAttack || Math.max(0, definition.minAttackRange ?? 0) > 0 ? 100 : 0))
        || issueTrainSiegeUnitOrder(world, building.id, world.unitDefinitions);
    }
  }

  sendAiScoutFlyers(world, playerId, scoutFlyers);

  castAiCombatSpell(world, playerId, casters);

  const attackForceSize = currentAiAttackForceSize(world, state);
  const attackCandidates = armyForAiStrategy(army, state.strategy ?? "land");
  const home = world.players.find((player) => player.id === playerId);
  const attackArmy = preferredAiAttackArmy(
    aiAttackArmyAfterDefenders(attackCandidates, sourceAiDifficultyDefendForceSize(world, state.defendForceSize ?? 0), home),
    state.preferredAttackUnitTypes ?? [],
    attackForceSize,
    attackUnitTargets
  );
  if (world.tick >= state.nextAttackTick && attackArmy.length >= attackForceSize) {
    let issuedAttack = false;
    for (const unit of attackArmy) {
      if (!unit.order || unit.order.kind !== "attack") {
        const target = findPrimaryEnemyTargetForUnit(world, playerId, unit);
        if (target) {
          issueAttackOrder(world, unit.id, target.id);
          issuedAttack = true;
        } else if (!unit.order || unit.order.kind !== "attack-move") {
          const scoutTarget = findAiPressurePointForUnit(world, playerId, unit);
          if (scoutTarget && issueAttackMoveOrder(world, unit.id, scoutTarget.x, scoutTarget.y)) {
            issuedAttack = true;
          }
        }
      }
    }
    if (issuedAttack) {
      state.nextAttackWaveIndex = Math.max(0, Math.floor(state.nextAttackWaveIndex ?? 0)) + 1;
      const attackDelayCycles = Math.max(30, Math.floor(state.attackDelayTicks ?? 35 * 30));
      state.nextAttackTick = world.tick + sourceOrderRetryTicks(world, attackDelayCycles);
    }
  }
}

function currentAiAttackForceSize(world: WorldState, state: { attackForceSize?: number; forceSizes?: number[]; attackWaveSizes?: number[]; nextAttackWaveIndex?: number }): number {
  const waveSizes = (state.attackWaveSizes ?? [])
    .map((size) => Math.max(3, Math.floor(size)))
    .filter((size) => Number.isFinite(size));
  if (waveSizes.length > 0) {
    const waveIndex = Math.max(0, Math.floor(state.nextAttackWaveIndex ?? 0)) % waveSizes.length;
    return sourceAiDifficultyForceCount(world, waveSizes[waveIndex]);
  }
  const forceSizes = (state.forceSizes ?? [])
    .map((size) => Math.max(3, Math.floor(size)))
    .filter((size) => Number.isFinite(size));
  if (forceSizes.length > 0) {
    const forceIndex = Math.max(0, Math.floor(state.nextAttackWaveIndex ?? 0)) % forceSizes.length;
    return sourceAiDifficultyForceCount(world, forceSizes[forceIndex]);
  }
  return sourceAiDifficultyForceCount(world, Math.max(3, Math.floor(state.attackForceSize ?? 3)));
}

function currentAiAttackForceId(state: { attackForceIds?: number[]; nextAttackWaveIndex?: number }): number | null {
  const attackForceIds = (state.attackForceIds ?? [])
    .map((id) => Math.max(0, Math.floor(id)))
    .filter((id) => Number.isFinite(id));
  if (attackForceIds.length === 0) {
    return null;
  }
  const waveIndex = Math.max(0, Math.floor(state.nextAttackWaveIndex ?? 0)) % attackForceIds.length;
  return attackForceIds[waveIndex] ?? null;
}

function currentAiAttackUnitTargets(state: { attackUnitTargets?: Array<{ unitTypeId: string; count: number }>; attackForceIds?: number[]; attackWaveUnitTargets?: Array<Array<{ unitTypeId: string; count: number }>>; nextAttackWaveIndex?: number }, attackForceId: number | null = currentAiAttackForceId(state)): Array<{ unitTypeId: string; count: number }> {
  const waveTargets = state.attackWaveUnitTargets ?? [];
  if (waveTargets.length === 0) {
    return state.attackUnitTargets ?? [];
  }
  const attackForceIds = state.attackForceIds ?? [];
  const sourceForceIndex = attackForceId !== null && attackForceIds.length === waveTargets.length
    ? attackForceIds.findIndex((id, index) => index >= Math.max(0, Math.floor(state.nextAttackWaveIndex ?? 0)) && id === attackForceId)
    : -1;
  const waveIndex = sourceForceIndex >= 0
    ? sourceForceIndex
    : Math.max(0, Math.floor(state.nextAttackWaveIndex ?? 0)) % waveTargets.length;
  return waveTargets[waveIndex] ?? state.attackUnitTargets ?? [];
}

function sourceAiDifficultyUnitTargets(world: WorldState, targets: Array<{ unitTypeId: string; count: number }>): Array<{ unitTypeId: string; count: number }> {
  return targets.map((target) => ({
    unitTypeId: target.unitTypeId,
    count: sourceAiDifficultyForceCount(world, target.count, isSourceAiTransporterType(world, target.unitTypeId))
  }));
}

function sourceAiDifficultyForceCount(world: WorldState, count: number, transporter = false): number {
  const difficulty = Math.floor(world.engineSettings.lastDifficultyDefault);
  if (difficulty === -1) {
    return Math.max(1, Math.floor(count));
  }
  const add = transporter ? Math.min(0, difficulty - 3) : difficulty - 3;
  return Math.max(1, Math.floor(count) + add);
}

function sourceAiDifficultyDefendForceSize(world: WorldState, count: number): number {
  if (count <= 0) {
    return 0;
  }
  return sourceAiDifficultyForceCount(world, count);
}

function isSourceAiTransporterType(world: WorldState, unitTypeId: string): boolean {
  const definition = world.unitDefinitions.find((unit) => unit.id === unitTypeId);
  return Boolean(definition && (definition.canTransport || (definition.maxOnBoard ?? 0) > 0));
}

function aiAttackArmyAfterDefenders(army: WorldUnit[], defendForceSize: number, home: { startX: number; startY: number } | undefined): WorldUnit[] {
  const reserveSize = Math.max(0, Math.floor(defendForceSize));
  if (reserveSize <= 0 || army.length <= reserveSize || !home) {
    return army;
  }
  return army
    .slice()
    .sort((left, right) => distanceSquaredToHome(right, home) - distanceSquaredToHome(left, home))
    .slice(0, Math.max(0, army.length - reserveSize));
}

function preferredAiWorkerResource(world: WorldState, worker: WorldUnit, weights: { gold: number; wood: number; oil: number } | null): "gold" | "wood" {
  if (!weights || weights.gold + weights.wood <= 0) {
    return "gold";
  }
  if (weights.gold <= 0) {
    return "wood";
  }
  if (weights.wood <= 0) {
    return "gold";
  }
  const total = weights.gold + weights.wood;
  return deterministicChance(world, `${worker.id}:collect:${weights.gold}:${weights.wood}:${weights.oil}`, weights.gold / total) ? "gold" : "wood";
}

function distanceSquaredToHome(unit: WorldUnit, home: { startX: number; startY: number }): number {
  const dx = unit.x - home.startX;
  const dy = unit.y - home.startY;
  return dx * dx + dy * dy;
}

function sourceAttackUnitTrainScore(world: WorldState, playerId: number, definition: WargusUnit, targets: Array<{ unitTypeId: string; count: number }>): number {
  const target = targets.find((candidate) => candidate.unitTypeId === definition.id);
  if (!target) {
    return 0;
  }
  const ownedOrQueued = countPlayerUnitsAndQueued(world, playerId, definition.id);
  const shortage = Math.max(0, target.count - ownedOrQueued);
  return shortage > 0 ? 200 + shortage * 10 : 1;
}

function countPlayerUnitsAndQueued(world: WorldState, playerId: number, unitTypeId: string): number {
  return world.units
    .filter((unit) => unit.player === playerId && unit.hitPoints > 0)
    .reduce((count, unit) => (
      count
      + (unit.typeId === unitTypeId ? 1 : 0)
      + unit.productionQueue.filter((order) => order.unitTypeId === unitTypeId).length
    ), 0);
}

function issueSourceAiBuildNeeds(world: WorldState, playerId: number, buildOrder: string[], race: string | null | undefined, buildDepots: boolean): void {
  if (buildOrder.length === 0) {
    return;
  }
  const desiredByRole = new Map<string, number>();
  for (const role of buildOrder) {
    desiredByRole.set(role, (desiredByRole.get(role) ?? 0) + 1);
  }
  const buildings = world.units.filter((unit) => unit.player === playerId && isSourceAiBuilding(unit) && unit.hitPoints > 0);
  const builders = world.units.filter((unit) => unit.player === playerId && isUsableBuilder(unit) && !unit.order);
  for (const [role, desired] of desiredByRole) {
    if (!buildDepots && isSourceAiDepotRole(role)) {
      continue;
    }
    if (sourceAiBuildRoleCount(world, buildings, role, playerId) >= desired) {
      continue;
    }
    if (issueSourceAiUpgradeNeed(world, playerId, role)) {
      return;
    }
    const builder = builders.find((candidate) => !candidate.order);
    if (!builder) {
      return;
    }
    if (issueAiBuildBySourceRole(world, builder, playerId, role, race)) {
      return;
    }
  }
}

function isSourceAiDepotRole(role: string): boolean {
  return role === "refinery";
}

function issueSourceAiUpgradeNeed(world: WorldState, playerId: number, role: string): boolean {
  const buildings = world.units.filter((unit) => unit.player === playerId && isSourceAiBuilding(unit) && unit.hitPoints > 0 && !unit.construction);
  if (role === "town-center-tier2" || role === "town-center-tier3") {
    const targetTier = role === "town-center-tier3" ? 3 : 2;
    const hall = buildings
      .filter(isTownCenter)
      .filter((candidate) => townCenterTier(world, candidate.typeId, playerId) < targetTier)
      .sort((left, right) => townCenterTier(world, right.typeId, playerId) - townCenterTier(world, left.typeId, playerId))[0];
    return hall ? issueUpgradeTownCenterOrder(world, hall.id, world.unitDefinitions) : false;
  }
  if (role === "guard-tower" || role === "cannon-tower") {
    const tower = buildings.find((candidate) => isWatchTower(world, candidate));
    return tower ? issueUpgradeTowerOrder(world, tower.id, role === "cannon-tower" ? "cannon" : "guard", world.unitDefinitions) : false;
  }
  return false;
}

function sourceAiBuildRoleCount(world: WorldState, buildings: WorldUnit[], role: string, playerId: number): number {
  return buildings.filter((unit) => {
    const definition = world.unitDefinitions.find((candidate) => candidate.id === unit.typeId);
    return Boolean(definition && sourceAiBuildDefinitionMatchesRole(world, definition, role, playerId));
  }).length;
}

function isSourceAiBuilding(unit: WorldUnit): boolean {
  return isBuildingLike(unit);
}

function sourceAiBuildNeedForRole(world: WorldState, playerId: number, role: string, race: string | null | undefined): { matches: (definition: WargusUnit) => boolean; fallback: string } | null {
  const normalizedRace = race === "orc" ? "orc" : "human";
  const human = normalizedRace === "human";
  const matches = (definition: WargusUnit): boolean => sourceAiBuildDefinitionMatchesRole(world, definition, role, playerId);
  switch (role) {
    case "town-center":
      return { matches, fallback: human ? "unit-town-hall" : "unit-great-hall" };
    case "town-center-tier2":
      return { matches, fallback: human ? "unit-keep" : "unit-stronghold" };
    case "town-center-tier3":
      return { matches, fallback: human ? "unit-castle" : "unit-fortress" };
    case "supply":
      return { matches, fallback: human ? "unit-farm" : "unit-pig-farm" };
    case "barracks":
      return { matches, fallback: human ? "unit-human-barracks" : "unit-orc-barracks" };
    case "lumber-mill":
      return { matches, fallback: human ? "unit-elven-lumber-mill" : "unit-troll-lumber-mill" };
    case "blacksmith":
      return { matches, fallback: human ? "unit-human-blacksmith" : "unit-orc-blacksmith" };
    case "tower":
      return { matches, fallback: human ? "unit-human-watch-tower" : "unit-orc-watch-tower" };
    case "advanced-melee":
      return { matches, fallback: human ? "unit-stables" : "unit-ogre-mound" };
    case "holy":
      return { matches, fallback: human ? "unit-church" : "unit-altar-of-storms" };
    case "caster":
      return { matches, fallback: human ? "unit-mage-tower" : "unit-temple-of-the-damned" };
    case "air":
      return { matches, fallback: human ? "unit-gryphon-aviary" : "unit-dragon-roost" };
    case "demolition":
      return { matches, fallback: human ? "unit-inventor" : "unit-alchemist" };
    case "shipyard":
      return { matches, fallback: human ? "unit-human-shipyard" : "unit-orc-shipyard" };
    case "foundry":
      return { matches, fallback: human ? "unit-human-foundry" : "unit-orc-foundry" };
    case "refinery":
      return { matches, fallback: human ? "unit-human-refinery" : "unit-orc-refinery" };
    case "oil-platform":
      return { matches, fallback: human ? "unit-human-oil-platform" : "unit-orc-oil-platform" };
    default:
      return null;
  }
}

function issueAiBuildBySourceRole(world: WorldState, builder: WorldUnit, playerId: number, role: string, race: string | null | undefined): boolean {
  const need = sourceAiBuildNeedForRole(world, playerId, role, race);
  return Boolean(need && issueAiBuildByRole(world, builder, need.matches, need.fallback));
}

function sourceAiBuildDefinitionMatchesRole(world: WorldState, definition: WargusUnit, role: string, playerId: number): boolean {
  switch (role) {
    case "town-center":
      return isBaseTownCenterDefinition(world, definition, playerId);
    case "town-center-tier2":
      return definition.mainFacility === true && townCenterTier(world, definition.id, playerId) >= 2;
    case "town-center-tier3":
      return definition.mainFacility === true && townCenterTier(world, definition.id, playerId) >= 3;
    case "supply":
      return isSupplyProviderDefinition(definition);
    case "barracks":
      return sourceBuildDefinitionProducesMatching(world, definition.id, isOrdinaryBarracksCombatDefinition, playerId);
    case "lumber-mill":
      return sourceBuildDefinitionResearchesMatching(world, definition.id, (upgradeId) => isLumberMillUpgradeId(world, upgradeId), playerId);
    case "blacksmith":
      return sourceBuildDefinitionResearchesMatching(world, definition.id, (upgradeId) => isBlacksmithUpgradeId(world, upgradeId), playerId);
    case "tower":
      return definition.building === true
        && definition.canAttack !== true
        && sourceBuildDefinitionUpgradesToMatching(world, definition.id, isDefensiveBuildingDefinition, playerId);
    case "guard-tower":
      return definition.building === true && definition.canAttack === true && sourceTowerRoleForDefinition(world, definition) !== "cannon";
    case "cannon-tower":
      return definition.building === true && definition.canAttack === true && sourceTowerRoleForDefinition(world, definition) === "cannon";
    case "advanced-melee":
      return sourceBuildDefinitionProducesMatching(world, definition.id, isAdvancedMeleeCombatDefinition, playerId);
    case "holy":
      return sourceBuildDefinitionResearchesMatching(world, definition.id, (upgradeId) => isHolyResearchUpgradeId(world, upgradeId), playerId);
    case "caster":
      return sourceBuildDefinitionProducesMatching(world, definition.id, isCasterDefinition, playerId);
    case "air":
      return sourceBuildDefinitionProducesMatching(world, definition.id, isAirCombatDefinition, playerId);
    case "demolition":
      return sourceBuildDefinitionProducesMatching(world, definition.id, isDemolitionLabDefinition, playerId);
    case "shipyard":
      return sourceBuildDefinitionProducesMatching(world, definition.id, isNavalCombatOrUtilityDefinition, playerId);
    case "foundry":
      return sourceBuildDefinitionResearchesMatching(world, definition.id, isShipUpgradeId, playerId);
    case "refinery":
      return isOilRefineryDefinition(definition);
    case "oil-platform":
      return isOilPlatformDefinition(definition, world.unitDefinitions);
    default:
      return false;
  }
}

function issueAiSourceTrainOrder(world: WorldState, building: WorldUnit, score: (definition: WargusUnit, button: WargusButton) => number = () => 1): boolean {
  const candidates = sourceTrainCandidatesForBuilding(world, building)
    .map((entry) => {
      const baseScore = score(entry.definition, entry.button);
      return {
        ...entry,
        score: baseScore > 0 ? baseScore + sourceUnitDatabaseTrainScore(world, building, entry.definition) : 0
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.button.level - right.button.level || left.button.pos - right.button.pos || left.definition.id.localeCompare(right.definition.id));
  for (const candidate of candidates) {
    if (issueTrainUnitOrder(world, building.id, candidate.definition.id, world.unitDefinitions)) {
      return true;
    }
  }
  return false;
}

function sourceUnitDatabaseTrainScore(world: WorldState, building: WorldUnit, definition: WargusUnit): number {
  const race = world.players.find((player) => player.id === building.player)?.race;
  const entry = world.unitDatabase.find((candidate) => (
    candidate.unitTypeId === definition.id
    && candidate.producerTypeId === building.typeId
    && (!race || candidate.race === race)
  ));
  if (!entry) {
    return 0;
  }
  const categoryScore = entry.category === "air" ? 18 : entry.category === "ground" ? 12 : 6;
  const classScore = entry.class === "worker" ? 30 : entry.class === "ranged" ? 24 : entry.class === "melee" ? 18 : 10;
  const rankScore = entry.rank === "hero" ? 50 : entry.rank === "elite" ? 36 : entry.rank === "attacker" ? 30 : entry.rank === "standard" ? 20 : entry.rank === "defender" ? 14 : 8;
  const costScore = Math.min(30, Math.floor((entry.castCosts.gold + entry.castCosts.wood + entry.castCosts.oil) / 1000));
  return categoryScore + classScore + rankScore + costScore;
}

function issueSourceTrainByRole(world: WorldState, building: WorldUnit, matchesRole: (definition: WargusUnit) => boolean): boolean | null {
  const candidates = sourceTrainCandidatesForBuilding(world, building).filter((entry) => matchesRole(entry.definition));
  if (candidates.length === 0) {
    return world.buttonDefinitions.some((button) => (
      button.action === "train-unit"
      && sourceButtonAppliesTo(button, building.typeId)
      && sourceButtonAllowedForSimulation(world, button, building.player)
    )) ? false : null;
  }
  const candidate = candidates.sort((left, right) => left.button.level - right.button.level || left.button.pos - right.button.pos || left.definition.id.localeCompare(right.definition.id))[0];
  return issueTrainUnitOrder(world, building.id, candidate.definition.id, world.unitDefinitions);
}

function firstTrainableUnitTypeByRole(world: WorldState, building: WorldUnit, unitDefinitions: WargusUnit[], matchesRole: (definition: WargusUnit) => boolean): string | null {
  return unitDefinitions.find((definition) => matchesRole(definition) && canProduceUnitType(world, building, definition.id))?.id ?? null;
}

function fallbackWorkerUnitTypeForPlayer(world: WorldState, playerId: number, race: string | null | undefined): string | null {
  const normalizedRace = race === "orc" ? "orc" : race === "human" ? "human" : null;
  const resources = world.players.find((player) => player.id === playerId)?.resources ?? {};
  const candidates = world.unitDefinitions
    .filter(isGoldOrWoodWorkerDefinition)
    .filter((definition) => isUnitTypeAllowed(world, definition.id, playerId))
    .sort((left, right) => (
      workerRaceScore(world, right, normalizedRace) - workerRaceScore(world, left, normalizedRace)
      || (left.costs.includes("gold") ? 0 : 1) - (right.costs.includes("gold") ? 0 : 1)
      || left.id.localeCompare(right.id)
    ));
  return candidates.find((definition) => canAfford(resources, definition.costs))?.id ?? candidates[0]?.id ?? null;
}

function workerRaceScore(world: WorldState, definition: WargusUnit, race: "human" | "orc" | null): number {
  if (!race) {
    return 1;
  }
  return sourceRaceScoreForUnitDefinition(definition, world.unitDatabase, race);
}

function sourceTrainCandidatesForBuilding(world: WorldState, building: WorldUnit): Array<{ button: WargusButton; definition: WargusUnit }> {
  return world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "train-unit" && Boolean(button.value) && sourceButtonAppliesTo(button, building.typeId))
    .filter((button) => sourceButtonAllowedForUnit(world, button, building))
    .map((button) => ({ button, definition: world.unitDefinitions.find((definition) => definition.id === button.value) }))
    .filter((entry): entry is { button: WargusButton & { value: string }; definition: WargusUnit } => Boolean(entry.definition))
    .filter((entry) => canTrainUnitAt(world, building.id, entry.definition.id, world.unitDefinitions));
}

function hasSourceTrainButtonsForUnit(world: WorldState, unit: WorldUnit): boolean {
  return world.buttonDefinitions.some((button) => (
    button.action === "train-unit"
    && sourceButtonAppliesTo(button, unit.typeId)
    && sourceButtonAllowedForSimulation(world, button, unit.player)
  ));
}

function issueAiBuildByRole(world: WorldState, builder: WorldUnit, matchesBuilding: (definition: WargusUnit) => boolean, fallbackBuildingTypeId: string): boolean {
  const sourceCandidate = sourceBuildCandidatesForBuilder(world, builder)
    .filter((entry) => matchesBuilding(entry.definition))
    .sort(compareSourceBuildCandidates)[0];
  if (sourceCandidate && issueBuildOrder(world, builder.id, sourceCandidate.definition.id, world.unitDefinitions)) {
    return true;
  }
  if (hasSourceBuildButtonsForUnit(world, builder)) {
    return false;
  }
  return issueBuildOrder(world, builder.id, fallbackBuildingTypeId, world.unitDefinitions);
}

function sourceBuildCandidatesForBuilder(world: WorldState, builder: WorldUnit): Array<{ button: WargusButton; definition: WargusUnit }> {
  return world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "build" && Boolean(button.value) && sourceButtonAppliesTo(button, builder.typeId))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, builder.player))
    .map((button) => ({ button, definition: world.unitDefinitions.find((definition) => definition.id === button.value) }))
    .filter((entry): entry is { button: WargusButton & { value: string }; definition: WargusUnit } => Boolean(entry.definition))
    .filter((entry) => canStartBuildingPlacement(world, builder, entry.definition));
}

function compareSourceBuildCandidates(left: { button: WargusButton; definition: WargusUnit }, right: { button: WargusButton; definition: WargusUnit }): number {
  return compareSourceButtons(left.button, right.button) || left.definition.id.localeCompare(right.definition.id);
}

function hasSourceBuildButtonsForUnit(world: WorldState, unit: WorldUnit): boolean {
  return world.buttonDefinitions.some((button) => (
    button.action === "build"
    && sourceButtonAppliesTo(button, unit.typeId)
    && sourceButtonAllowedForSimulation(world, button, unit.player)
  ));
}

export function sourceBuildingProducesMatching(world: WorldState, buildingTypeId: string, matchesUnit: (definition: WargusUnit) => boolean, playerId = world.visibilityPlayer): boolean {
  return world.buttonDefinitions.some((button) => (
    button.action === "train-unit"
    && typeof button.value === "string"
    && sourceButtonAppliesTo(button, buildingTypeId)
    && sourceButtonAllowedForSimulation(world, button, playerId)
    && Boolean(world.unitDefinitions.find((definition) => definition.id === button.value && matchesUnit(definition)))
  ));
}

export function sourceBuildingResearchesMatching(world: WorldState, buildingTypeId: string, matchesUpgrade: (upgradeId: string) => boolean, playerId = world.visibilityPlayer): boolean {
  return world.buttonDefinitions.some((button) => (
    button.action === "research"
    && typeof button.value === "string"
    && sourceButtonAppliesTo(button, buildingTypeId)
    && sourceButtonAllowedForSimulation(world, button, playerId)
    && matchesUpgrade(button.value)
  ));
}

export function sourceBuildingUpgradesToMatching(world: WorldState, buildingTypeId: string, matchesDefinition: (definition: WargusUnit) => boolean, playerId = world.visibilityPlayer): boolean {
  return world.buttonDefinitions.some((button) => (
    button.action === "upgrade-to"
    && typeof button.value === "string"
    && sourceButtonAppliesTo(button, buildingTypeId)
    && sourceButtonAllowedForSimulation(world, button, playerId)
    && Boolean(world.unitDefinitions.find((definition) => definition.id === button.value && matchesDefinition(definition)))
  ));
}

export function sourceBuildValuesProduceMatching(world: WorldState, sourceBuildValues: Iterable<string>, matchesUnit: (definition: WargusUnit) => boolean, playerId = world.visibilityPlayer): boolean {
  for (const buildingTypeId of sourceBuildValues) {
    if (sourceBuildingProducesMatching(world, buildingTypeId, matchesUnit, playerId)) {
      return true;
    }
  }
  return false;
}

export function sourceBuildValuesResearchMatching(world: WorldState, sourceBuildValues: Iterable<string>, matchesUpgrade: (upgradeId: string) => boolean, playerId = world.visibilityPlayer): boolean {
  for (const buildingTypeId of sourceBuildValues) {
    if (sourceBuildingResearchesMatching(world, buildingTypeId, matchesUpgrade, playerId)) {
      return true;
    }
  }
  return false;
}

export function sourceBuildValuesDefinitionMatching(world: WorldState, sourceBuildValues: Iterable<string>, matchesDefinition: (definition: WargusUnit) => boolean): boolean {
  for (const buildingTypeId of sourceBuildValues) {
    const definition = world.unitDefinitions.find((candidate) => candidate.id === buildingTypeId);
    if (definition && matchesDefinition(definition)) {
      return true;
    }
  }
  return false;
}

export function sourceBuildValuesUpgradeToMatching(world: WorldState, sourceBuildValues: Iterable<string>, matchesDefinition: (definition: WargusUnit) => boolean, playerId = world.visibilityPlayer): boolean {
  for (const buildingTypeId of sourceBuildValues) {
    if (sourceBuildingUpgradesToMatching(world, buildingTypeId, matchesDefinition, playerId)) {
      return true;
    }
  }
  return false;
}

export function selectedCanResearchMatchingSource(world: WorldState, selectedUnits: WorldUnit[], matchesUpgrade: (upgradeId: string) => boolean): boolean {
  return selectedUnits.some((unit) => world.buttonDefinitions.some((button) => (
    button.action === "research"
    && typeof button.value === "string"
    && sourceButtonAppliesTo(button, unit.typeId)
    && sourceButtonAllowedForSimulation(world, button, unit.player)
    && matchesUpgrade(button.value)
    && canResearchUpgradeAt(world, unit.id, button.value)
  )));
}

export function selectedCanResearchSpellSource(world: WorldState, selectedUnits: WorldUnit[], spellId: string, fallbackUpgradeId: string): boolean {
  return selectedCanResearchMatchingSource(world, selectedUnits, (upgradeId) => spellResearchUpgradeMatches(world, upgradeId, spellId, fallbackUpgradeId));
}

export function selectedCanResearchAny(world: WorldState, selectedUnits: WorldUnit[], upgradeIds: Iterable<string>): boolean {
  for (const upgradeId of upgradeIds) {
    if (selectedUnits.some((unit) => canResearchUpgradeAt(world, unit.id, upgradeId))) {
      return true;
    }
  }
  return false;
}

export function selectedCanTrainAny(world: WorldState, selectedUnits: WorldUnit[], unitTypeIds: Iterable<string>): boolean {
  for (const unitTypeId of unitTypeIds) {
    if (selectedUnits.some((unit) => canTrainUnitAt(world, unit.id, unitTypeId))) {
      return true;
    }
  }
  return false;
}

export function selectedCanTrainMatching(world: WorldState, selectedUnits: WorldUnit[], matchesUnit: (definition: WargusUnit) => boolean): boolean {
  return selectedUnits.some((unit) => world.unitDefinitions.some((definition) => matchesUnit(definition) && canTrainUnitAt(world, unit.id, definition.id)));
}

export function selectedCanBuildAny(world: WorldState, selectedUnits: WorldUnit[], buildingTypeIds: Iterable<string>): boolean {
  for (const buildingTypeId of buildingTypeIds) {
    if (selectedUnits.some((unit) => canStartBuildingPlacementByType(world, unit, buildingTypeId))) {
      return true;
    }
  }
  return false;
}

export function canUseHudBuilderCommands(unit: WorldUnit): boolean {
  return unit.hitPoints > 0
    && !unit.construction
    && isGoldOrWoodWorkerUnit(unit);
}

export function hasAnySourceResearchValue(values: Iterable<string>, upgradeIds: Iterable<string>): boolean {
  const valueSet = values instanceof Set ? values : new Set(values);
  for (const upgradeId of upgradeIds) {
    if (valueSet.has(upgradeId)) {
      return true;
    }
  }
  return false;
}

export function hasSourceResearchValueMatching(world: WorldState, values: Iterable<string>, matchesUpgrade: (world: WorldState, upgradeId: string) => boolean): boolean {
  for (const upgradeId of values) {
    if (matchesUpgrade(world, upgradeId)) {
      return true;
    }
  }
  return false;
}

export function hasSourceTrainValueMatching(world: WorldState, values: Iterable<string>, matchesUnit: (definition: WargusUnit) => boolean): boolean {
  const valueSet = values instanceof Set ? values : new Set(values);
  return world.unitDefinitions.some((definition) => valueSet.has(definition.id) && matchesUnit(definition));
}

export function hasSourceSpellResearchValue(world: WorldState, values: Iterable<string>, spellId: string, fallbackUpgradeId: string): boolean {
  for (const upgradeId of values) {
    if (spellResearchUpgradeMatches(world, upgradeId, spellId, fallbackUpgradeId)) {
      return true;
    }
  }
  return false;
}

export function isBlacksmithResearchUpgrade(world: WorldState, upgradeId: string): boolean {
  return isMeleeWeaponResearchUpgrade(world, upgradeId)
    || isShieldResearchUpgrade(world, upgradeId)
    || isSiegeResearchUpgrade(world, upgradeId)
    || [
      "upgrade-sword1",
      "upgrade-sword2",
      "upgrade-battle-axe1",
      "upgrade-battle-axe2",
      "upgrade-human-shield1",
      "upgrade-human-shield2",
      "upgrade-orc-shield1",
      "upgrade-orc-shield2",
      "upgrade-ballista1",
      "upgrade-ballista2",
      "upgrade-catapult1",
      "upgrade-catapult2"
    ].includes(upgradeId);
}

export function isNavalResearchUpgrade(upgradeId: string): boolean;
export function isNavalResearchUpgrade(world: WorldState, upgradeId: string): boolean;
export function isNavalResearchUpgrade(worldOrUpgradeId: WorldState | string, maybeUpgradeId?: string): boolean {
  return isShipCannonResearchUpgradeId(worldOrUpgradeId as WorldState, maybeUpgradeId as string)
    || isShipArmorResearchUpgradeId(worldOrUpgradeId as WorldState, maybeUpgradeId as string);
}

function sourceBuildDefinitionProducesMatching(world: WorldState, buildingTypeId: string, matchesUnit: (definition: WargusUnit) => boolean, playerId = world.visibilityPlayer): boolean {
  return sourceBuildingProducesMatching(world, buildingTypeId, matchesUnit, playerId);
}

function sourceBuildDefinitionResearchesMatching(world: WorldState, buildingTypeId: string, matchesUpgrade: (upgradeId: string) => boolean, playerId = world.visibilityPlayer): boolean {
  return sourceBuildingResearchesMatching(world, buildingTypeId, matchesUpgrade, playerId);
}

function sourceBuildDefinitionUpgradesToMatching(world: WorldState, buildingTypeId: string, matchesDefinition: (definition: WargusUnit) => boolean, playerId = world.visibilityPlayer): boolean {
  return sourceBuildingUpgradesToMatching(world, buildingTypeId, matchesDefinition, playerId);
}

export function isSupplyProviderDefinition(definition: WargusUnit): boolean {
  return definition.supply > 0 && (definition.demand ?? 0) <= 0;
}

export function isBaseTownCenterDefinition(world: WorldState, definition: WargusUnit, playerId = world.visibilityPlayer): boolean {
  return Boolean(definition.mainFacility) && townCenterTier(world, definition.id, playerId) === 1;
}

export function isOilRefineryDefinition(definition: WargusUnit): boolean {
  return (definition.storesResources ?? []).includes("oil") && (definition.improveProduction?.oil ?? 0) > 0;
}

export function isWallDefinition(definition: WargusUnit): boolean {
  return Boolean(definition.building)
    && definition.tileSize[0] === 1
    && definition.tileSize[1] === 1
    && definition.constructionTypeId === "construction-wall"
    && !definition.canAttack
    && definition.supply <= 0
    && definition.demand <= 0
    && !definition.mainFacility
    && (definition.storesResources ?? []).length === 0;
}

export function isDefensiveBuildingDefinition(definition: WargusUnit): boolean {
  return Boolean(definition.building) && definition.canAttack;
}

export function isCasterDefinition(definition: WargusUnit): boolean {
  return Boolean(definition.manaEnabled || (definition.manaMax ?? 0) > 0 || (definition.canCastSpells?.length ?? 0) > 0);
}

export function isAirCombatDefinition(definition: WargusUnit): boolean {
  return Boolean(definition.airUnit || definition.type === "fly") && definition.canAttack;
}

export function isDemolitionLabDefinition(definition: WargusUnit): boolean {
  return isDemolitionUnitDefinition(definition)
    || isSiegeDefinition(definition)
    || isScoutAirDefinition(definition);
}

export function isDemolitionUnitDefinition(definition: WargusUnit): boolean {
  return definition.volatile === true
    || (definition.clicksToExplode ?? 0) > 0
    || (definition.canCastSpells ?? []).includes("spell-suicide-bomber");
}

export function isSiegeDefinition(definition: WargusUnit): boolean {
  return Boolean(definition.landUnit || definition.type === "land")
    && definition.canAttack
    && Math.max(0, definition.maxAttackRange ?? 0) >= 4
    && costValue(definition.costs, "wood") > 0;
}

export function isNavalCombatOrUtilityDefinition(definition: WargusUnit): boolean {
  return isNavalRoleDefinition(definition, "tanker")
    || isNavalRoleDefinition(definition, "destroyer")
    || isNavalRoleDefinition(definition, "warship")
    || isNavalRoleDefinition(definition, "transport")
    || isNavalRoleDefinition(definition, "submarine");
}

function canGatherDefinitionResource(definition: WargusUnit, resource: "gold" | "wood" | "oil"): boolean {
  return (definition.gatherResources ?? []).includes(resource);
}

export function isMeleeLandCombatDefinition(definition: WargusUnit): boolean {
  return definition.canAttack && Boolean(definition.landUnit || definition.type === "land") && !definition.groundAttack && Math.max(0, definition.maxAttackRange ?? 0) <= 1;
}

export function isRangedLandCombatDefinition(definition: WargusUnit): boolean {
  return definition.canAttack && Boolean(definition.landUnit || definition.type === "land") && !definition.groundAttack && Math.max(0, definition.maxAttackRange ?? 0) > 1;
}

export function isOrdinaryBarracksCombatDefinition(definition: WargusUnit): boolean {
  return (isMeleeLandCombatDefinition(definition) || isRangedLandCombatDefinition(definition))
    && !definition.manaEnabled
    && (definition.manaMax ?? 0) <= 0
    && definition.volatile !== true
    && !(definition.gatherResources ?? []).some((resource) => resource === "gold" || resource === "wood" || resource === "oil")
    && !isDemolitionUnitDefinition(definition);
}

export function isAdvancedMeleeCombatDefinition(definition: WargusUnit): boolean {
  return isMeleeLandCombatDefinition(definition)
    && costValue(definition.costs, "wood") > 0
    && !(definition.gatherResources ?? []).some((resource) => resource === "gold" || resource === "wood" || resource === "oil")
    && definition.volatile !== true;
}

export function isNavalRoleDefinition(definition: WargusUnit, role: "tanker" | "destroyer" | "warship" | "transport" | "submarine"): boolean {
  const naval = Boolean(definition.seaUnit || definition.type === "naval");
  if (!naval) {
    return false;
  }
  if (role === "tanker") {
    return canGatherDefinitionResource(definition, "oil");
  }
  if (role === "transport") {
    return (definition.maxOnBoard ?? 0) > 0 || (definition.canTransport ?? []).length > 0;
  }
  if (role === "submarine") {
    return definition.permanentCloak === true;
  }
  if (role === "warship") {
    return definition.canAttack && definition.sideAttack === true;
  }
  return definition.canAttack && !definition.sideAttack && definition.permanentCloak !== true && !canGatherDefinitionResource(definition, "oil");
}

function aiBarracksTrainScore(definition: WargusUnit, role: "melee" | "ranged"): number {
  const range = Math.max(0, definition.maxAttackRange ?? 0);
  if (role === "ranged") {
    return range > 1 && !definition.groundAttack ? 100 + range : 0;
  }
  return definition.canAttack && !definition.groundAttack && range <= 1 ? 100 + Math.max(0, definition.hitPoints ?? 0) / 10 : 0;
}

function aiNavalTrainScore(definition: WargusUnit, role: "tanker" | "destroyer" | "warship" | "submarine"): number {
  if (role === "tanker") {
    return isOilTankerDefinition(definition) ? 100 : 0;
  }
  if (!definition.canAttack || !definition.seaUnit) {
    return 0;
  }
  if (role === "submarine") {
    return definition.permanentCloak ? 100 : 0;
  }
  const range = Math.max(0, definition.maxAttackRange ?? 0);
  const cost = costValue(definition.costs, "gold") + costValue(definition.costs, "wood") + costValue(definition.costs, "oil");
  if (role === "warship") {
    return 100 + cost / 100 + range;
  }
  return definition.permanentCloak ? 0 : 100 + range;
}

function isOilTankerDefinition(definition: WargusUnit): boolean {
  return canGatherDefinitionResource(definition, "oil");
}

export function isGoldOrWoodWorkerDefinition(definition: WargusUnit): boolean {
  return canGatherDefinitionResource(definition, "gold") || canGatherDefinitionResource(definition, "wood");
}

export function sourceButtonAllowedForSimulation(world: WorldState, button: WargusButton, playerId: number): boolean {
  if (!sourceButtonEnabledForEngine(world, button)) {
    return false;
  }
  if (!button.allowed || button.allowed === "check-true") {
    return true;
  }
  if (button.allowed === "check-single-research") {
    return Boolean(button.value && !isSourceResearchStarted(world, playerId, button.value));
  }
  if (button.allowed === "check-no-research") {
    return button.allowArg.every((upgradeId) => !isSourceResearchStarted(world, playerId, upgradeId));
  }
  if (button.allowed === "check-upgrade") {
    return button.allowArg.every((upgradeId) => hasResearched(world, playerId, upgradeId));
  }
  if (button.allowed === "check-upgrade-to") {
    return Boolean(button.value && isUnitTypeAllowed(world, button.value, playerId));
  }
  if (button.allowed === "check-units-or") {
    return button.allowArg.some((typeId) => hasCompletedUnitType(world, playerId, typeId));
  }
  if (button.allowed === "check-network") {
    return world.engineSettings.networkGameDefault;
  }
  if (button.allowed === "check-debug") {
    return button.allowArg.length > 0
      ? button.allowArg.every((flag) => world.engineSettings.debugFlagsDefault.includes(flag))
      : world.engineSettings.debugFlagsDefault.length > 0;
  }
  return true;
}

function sourceButtonAllowedForUnit(world: WorldState, button: WargusButton, unit: WorldUnit): boolean {
  if (!sourceButtonAllowedForSimulation(world, button, unit.player)) {
    return false;
  }
  if (button.allowed === "check-no-research") {
    return !isBuildingResearching(world, unit.id) && !unitHasSourceUpgradeToQueued(world, unit);
  }
  if (button.allowed === "check-upgrade-to") {
    return !isBuildingResearching(world, unit.id) && unit.productionQueue.length === 0;
  }
  return true;
}

function unitHasSourceUpgradeToQueued(world: WorldState, unit: WorldUnit): boolean {
  return unit.productionQueue.some((order) => isProducerTransformationFor(world, unit, order.unitTypeId));
}

function sourceButtonEnabledForEngine(world: WorldState, button: WargusButton): boolean {
  return button.extensionCondition === undefined
    || button.extensionCondition === null
    || button.extensionCondition === world.engineSettings.extensionsEnabled;
}

export function canIssueSourceActionButton(world: WorldState, button: WargusButton, unit: WorldUnit, extraScopes: string[] = []): boolean {
  if (!sourceButtonAppliesTo(button, unit.typeId, extraScopes)) {
    return false;
  }
  const action = button.action;
  if (action === "move") return canReceiveMoveOrders(unit) || canSetRallyPoint(world, unit);
  if (action === "stop") return canIssueStop(unit) || canSetRallyPoint(world, unit);
  if (action === "attack") return canIssueHoldPosition(unit) || canSetRallyPoint(world, unit);
  if (action === "stand-ground") return canIssueHoldPosition(unit);
  if (action === "patrol") return canReceiveMoveOrders(unit);
  if (action === "attack-ground") return canAttackGround(unit);
  if (action === "repair") return canRepairUnit(unit);
  if (action === "explore") return canIssueExploreOrder(world, unit);
  if (action === "harvest") return canIssueHarvestCommand(unit) || canSetHarvestRallyPoint(world, unit);
  if (action === "return-goods") return canIssueReturnGoodsOrder(world, unit);
  if (action === "unload") return canIssueUnloadTransport(unit);
  return false;
}

export function sourceButtonHasExecutableContext(world: WorldState, button: WargusButton, unit: WorldUnit, extraScopes: string[] = []): boolean {
  if (!sourceButtonAllowedForUnit(world, button, unit)) {
    return false;
  }
  if (button.action === "train-unit") {
    return typeof button.value === "string" && canTrainUnitAt(world, unit.id, button.value);
  }
  if (button.action === "research") {
    return typeof button.value === "string" && canResearchUpgradeAt(world, unit.id, button.value);
  }
  if (button.action === "build") {
    return typeof button.value === "string" && canStartSourceBuildPlacementByType(world, unit, button.value);
  }
  if (button.action === "upgrade-to") {
    return typeof button.value === "string" && canTrainUnitAt(world, unit.id, button.value);
  }
  if (button.action === "cast-spell") {
    return typeof button.value === "string" && canCastSourceButtonSpell(world, unit, button.value);
  }
  if (button.action === "button") {
    return (button.value === "0" || button.value === "1" || button.value === "2") && canUseHudBuilderCommands(unit);
  }
  if (SOURCE_CANCEL_ACTIONS.has(button.action)) {
    return sourceCancelButtonMatchesUnit(world, button, unit);
  }
  return Boolean(sourceHudCommandForAction(button.action) && canIssueSourceActionButton(world, button, unit, extraScopes));
}

function canCastSourceButtonSpell(world: WorldState, caster: WorldUnit, spellId: string): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  const manaCost = spellManaCost(world, spellId, spell?.manaCost ?? 0);
  return caster.hitPoints > 0
    && !caster.construction
    && canUnitCastSpellId(caster, spellId)
    && hasSpellResearch(world, caster.player, spellId, spell?.dependUpgrade ?? null)
    && caster.mana >= manaCost
    && caster.spellCooldown <= 0;
}

export function sourceCommandHintButton(world: WorldState, unit: WorldUnit): WargusButton | null {
  const candidates = world.buttonDefinitions
    .filter((button) => button.key && sourceButtonAppliesTo(button, unit.typeId))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, unit.player))
    .filter((button) => sourceButtonHasExecutableContext(world, button, unit))
    .sort(compareSourceButtons);
  const sourceCardButton = candidates.find((button) => sourceButtonIsCommandCardHint(button));
  return sourceCardButton ?? candidates[0] ?? null;
}

function sourceButtonIsCommandCardHint(button: WargusButton): boolean {
  return button.action === "train-unit"
    || button.action === "research"
    || button.action === "build"
    || button.action === "upgrade-to"
    || button.action === "cast-spell"
    || button.action === "button";
}

export function sourceCommandHint(world: WorldState, unit: WorldUnit): string | null {
  const button = sourceCommandHintButton(world, unit);
  if (button?.key) {
    const label = sourceButtonLabel(button) ?? sourceButtonHintActionLabel(button);
    if (label) {
      return `${button.key.toUpperCase()} ${label}`;
    }
  }
  return sourceFallbackCommandHint(world, unit);
}

function sourceFallbackCommandHint(world: WorldState, unit: WorldUnit): string | null {
  const typeId = unit.typeId;
  if (unit.mainFacility && townCenterTier(world, typeId, unit.player) === 1) {
    return "T trains worker";
  }
  if (selectedCanTrainMatching(world, [unit], isOrdinaryBarracksCombatDefinition)) {
    return "M trains melee, R trains ranged";
  }
  if (canUseHudBuilderCommands(unit)) {
    return "F builds farm, B builds barracks";
  }
  return null;
}

export function sourceButtonHintActionLabel(button: WargusButton): string | null {
  if (button.action === "train-unit") return "train";
  if (button.action === "research") return "research";
  if (button.action === "build") return "build";
  if (button.action === "upgrade-to") return "upgrade";
  if (button.action === "cast-spell") return "cast";
  if (button.action === "button") return "open";
  return sourceHudCommandForAction(button.action)?.replaceAll("-", " ") ?? null;
}

function isSourceResearchStarted(world: WorldState, playerId: number, upgradeId: string): boolean {
  return hasResearched(world, playerId, upgradeId)
    || world.activeResearch.some((research) => research.player === playerId && research.upgradeId === upgradeId)
    || world.queuedResearch.some((research) => research.player === playerId && research.upgradeId === upgradeId);
}

function sendAiScoutFlyers(world: WorldState, playerId: number, scouts: WorldUnit[]): void {
  if (!world.engineSettings.aiExploresDefault) {
    return;
  }
  for (const scout of scouts) {
    if (scout.order && scout.order.kind !== "move") {
      continue;
    }
    const nearDestination = scout.order?.kind === "move"
      && Math.hypot(scout.x - scout.order.targetX, scout.y - scout.order.targetY) <= world.tileSize * 2;
    if (scout.order && !nearDestination) {
      continue;
    }
    const target = findAiPressurePointForUnit(world, playerId, scout) ?? fallbackAiScoutPoint(world, playerId, scout);
    if (target) {
      issueMoveOrder(world, scout.id, target.x, target.y);
    }
  }
}

function fallbackAiScoutPoint(world: WorldState, playerId: number, scout: WorldUnit): { x: number; y: number } | null {
  const columns = Math.max(1, world.map.width - 2);
  const rows = Math.max(1, world.map.height - 2);
  const hash = Math.abs(deterministicHash(`${playerId}:${scout.id}:${Math.floor(world.tick / sourceOrderRetryTicks(world, 600))}`));
  return {
    x: (1 + (hash % columns)) * world.tileSize + world.tileSize / 2,
    y: (1 + (Math.floor(hash / columns) % rows)) * world.tileSize + world.tileSize / 2
  };
}

function demolitionProductionCount(world: WorldState, units: WorldUnit[]): number {
  return units.filter((unit) => isSiegeEngine(world, unit) || canIssueDetonateOrder(world, unit) || isScoutFlyer(unit)).length;
}

function castAiCombatSpell(world: WorldState, playerId: number, casters: WorldUnit[]): void {
  for (const caster of casters) {
    if (caster.spellCooldown > 0 || caster.mana < 6) {
      continue;
    }
    if (issueSourceAiCombatSpell(world, caster)) {
      continue;
    }
    if (sourceCasterCanCastAny(caster, ["spell-blizzard", "spell-polymorph", "spell-slow", "spell-invisibility", "spell-fireball", "spell-flame-shield"])) {
      if (hasResearched(world, playerId, "upgrade-blizzard") && issueBlizzardOrder(world, caster.id)) {
        continue;
      }
      if (hasResearched(world, playerId, "upgrade-polymorph") && issuePolymorphOrder(world, caster.id)) {
        continue;
      }
      if (hasResearched(world, playerId, "upgrade-slow")) {
        if (issueSlowOrder(world, caster.id)) {
          continue;
        }
      }
      if (hasResearched(world, playerId, "upgrade-invisibility") && issueInvisibilityOrder(world, caster.id)) {
        continue;
      }
      if (hasResearched(world, playerId, "upgrade-fireball") && issueFireballOrder(world, caster.id)) {
        continue;
      }
      if (hasResearched(world, playerId, "upgrade-flame-shield")) {
        issueFlameShieldOrder(world, caster.id);
      }
    } else if (sourceCasterCanCastAny(caster, ["spell-death-and-decay", "spell-whirlwind", "spell-death-coil", "spell-raise-dead", "spell-unholy-armor"])) {
      if (hasResearched(world, playerId, "upgrade-death-and-decay") && issueDeathAndDecayOrder(world, caster.id)) {
        continue;
      }
      if (hasResearched(world, playerId, "upgrade-whirlwind") && issueWhirlwindOrder(world, caster.id)) {
        continue;
      }
      if (hasResearched(world, playerId, "upgrade-death-coil")) {
        if (issueDeathCoilOrder(world, caster.id)) {
          continue;
        }
      }
      if (hasResearched(world, playerId, "upgrade-raise-dead") && issueRaiseDeadOrder(world, caster.id)) {
        continue;
      }
      if (hasResearched(world, playerId, "upgrade-unholy-armor")) {
        issueUnholyArmorOrder(world, caster.id);
      }
    } else if (sourceCasterCanCastAny(caster, ["spell-healing", "spell-exorcism", "spell-holy-vision"])) {
      if (hasResearched(world, playerId, "upgrade-healing") && issueHealOrder(world, caster.id)) {
        continue;
      }
      if (hasResearched(world, playerId, "upgrade-exorcism") && issueExorcismOrder(world, caster.id)) {
        continue;
      }
      if (hasResearched(world, playerId, "upgrade-holy-vision")) {
        issueHolyVisionOrder(world, caster.id);
      }
    } else if (sourceCasterCanCastAny(caster, ["spell-bloodlust", "spell-haste", "spell-runes", "spell-eye-of-vision"])) {
      if (hasResearched(world, playerId, "upgrade-bloodlust") && issueBloodlustOrder(world, caster.id)) {
        continue;
      }
      if (hasResearched(world, playerId, "upgrade-haste")) {
        if (issueHasteOrder(world, caster.id)) {
          continue;
        }
      }
      if (hasResearched(world, playerId, "upgrade-runes") && issueRunesOrder(world, caster.id)) {
        continue;
      }
      if (hasResearched(world, playerId, "upgrade-eye-of-kilrogg")) {
        issueEyeOfKilroggOrder(world, caster.id);
      }
    }
  }
}

function sourceCasterCanCastAny(caster: WorldUnit, spellIds: string[]): boolean {
  return spellIds.some((spellId) => canUnitCastSpellId(caster, spellId));
}

type AiSpellIssuer = (world: WorldState, casterId: string) => boolean;

const SOURCE_AI_SPELL_ISSUERS: Partial<Record<string, AiSpellIssuer>> = {
  "spell-aid": (world, casterId) => issueSourceAdjustVitalsOrder(world, casterId, "spell-aid"),
  "spell-blizzard": issueBlizzardOrder,
  "spell-bloodlust": issueBloodlustOrder,
  "spell-bloodlust-double-head": issueBloodlustDoubleHeadOrder,
  "spell-death-and-decay": issueDeathAndDecayOrder,
  "spell-death-coil": issueDeathCoilOrder,
  "spell-exorcism": issueExorcismOrder,
  "spell-fireball": issueFireballOrder,
  "spell-flame-shield": issueFlameShieldOrder,
  "spell-haste": issueHasteOrder,
  "spell-healing": issueHealOrder,
  "spell-holy-vision": issueHolyVisionOrder,
  "spell-invisibility": issueInvisibilityOrder,
  "spell-polymorph": issuePolymorphOrder,
  "spell-raise-dead": issueRaiseDeadOrder,
  "spell-runes": issueRunesOrder,
  "spell-runes-double-head": issueRunesDoubleHeadOrder,
  "spell-slow": issueSlowOrder,
  "spell-unholy-armor": issueUnholyArmorOrder,
  "spell-whirlwind": issueWhirlwindOrder,
  "spell-eye-of-vision": issueEyeOfKilroggOrder,
  "spell-eye-of-vision-double-head": issueEyeOfVisionDoubleHeadOrder
};

function issueBloodlustDoubleHeadOrder(world: WorldState, casterId: string): boolean {
  const caster = findUnit(world, casterId);
  if (!caster) {
    return false;
  }
  const spellId = "spell-bloodlust-double-head";
  const range = spellAiRangeTiles(world, spellId, 6);
  const target = world.units
    .filter((unit) => unit.player === caster.player && canBloodlustTarget(unit) && unitMatchesSourceCastConditions(world, spellId, unit, caster))
    .filter((unit) => Math.hypot(unit.x - caster.x, unit.y - caster.y) <= range * world.tileSize)
    .sort((a, b) => compareSourceSpellTargets(world, caster, a, b, sourceSpellAiPriority(world, spellId)))[0];
  return castBloodlustAt(world, caster, target, spellId, null);
}

function issueRunesDoubleHeadOrder(world: WorldState, casterId: string): boolean {
  const caster = findUnit(world, casterId);
  if (!caster) {
    return false;
  }
  const spellId = "spell-runes-double-head";
  const target = findNearestEnemyInSpellRange(world, caster, spellAiRangeTiles(world, spellId, 10), undefined, sourceSpellAiPriority(world, spellId)) ?? caster;
  return castRunesAt(world, caster, target.x, target.y, spellId, null);
}

function issueEyeOfVisionDoubleHeadOrder(world: WorldState, casterId: string): boolean {
  const caster = findUnit(world, casterId);
  if (!caster) {
    return false;
  }
  return castEyeOfKilroggAt(world, caster, caster.x, caster.y, "spell-eye-of-vision-double-head", null);
}

function issueSourceAiCombatSpell(world: WorldState, caster: WorldUnit): boolean {
  for (const spell of sourceAiCombatSpellsForCaster(world, caster)) {
    const issue = SOURCE_AI_SPELL_ISSUERS[spell.id];
    if (issue?.(world, caster.id)) {
      return true;
    }
  }
  return false;
}

function stepPlayerAutoCast(world: WorldState, caster: WorldUnit): void {
  if (caster.player !== world.visibilityPlayer || caster.spellCooldown > 0 || caster.mana <= 0 || (caster.autoCastSpells ?? []).length === 0) {
    return;
  }
  for (const spell of sourceAiCombatSpellsForCaster(world, caster, new Set(caster.autoCastSpells), "autocast")) {
    const issue = SOURCE_AI_SPELL_ISSUERS[spell.id];
    if (issue?.(world, caster.id)) {
      return;
    }
  }
}

function sourceAiCombatSpellsForCaster(world: WorldState, caster: WorldUnit, enabledSpellIds: Set<string> | null = null, mode: "ai-cast" | "autocast" = "ai-cast"): WargusSpell[] {
  if (world.spellDefinitions.length === 0 || caster.canCastSpells.length === 0) {
    return [];
  }
  const byId = new Map(world.spellDefinitions.map((spell) => [spell.id, spell]));
  return caster.canCastSpells
    .map((spellId) => byId.get(spellId))
    .filter((spell): spell is WargusSpell => Boolean(spell))
    .filter((spell) => enabledSpellIds === null || enabledSpellIds.has(spell.id))
    .filter((spell) => sourceSpellHasAiCombatUse(spell, mode))
    .filter((spell) => Boolean(SOURCE_AI_SPELL_ISSUERS[spell.id]))
    .filter((spell) => hasSpellResearch(world, caster.player, spell.id, null))
    .filter((spell) => caster.mana >= spellManaCost(world, spell.id, spell.manaCost))
    .filter((spell) => sourceCasterAiSpellConditionsMatch(world, spell, caster, mode))
    .sort((a, b) => sourceAiSpellPriority(b) - sourceAiSpellPriority(a));
}

function sourceSpellRuntimeTokens(spell: WargusSpell, mode: "ai-cast" | "autocast"): string[] {
  return mode === "ai-cast" && spell.aiCast.length > 0 ? spell.aiCast : spell.autocast;
}

function sourceCasterAiSpellConditionsMatch(world: WorldState, spell: WargusSpell, caster: WorldUnit, mode: "ai-cast" | "autocast"): boolean {
  const aiTokens = sourceSpellRuntimeTokens(spell, mode);
  if (!sourceCasterCombatConditionMatches(world, spell, caster, aiTokens, mode)) {
    return false;
  }
  if (!sourceCasterCorpseConditionMatches(world, spell, caster, aiTokens, mode)) {
    return false;
  }
  if (!aiTokens.includes("self")) {
    return true;
  }
  const minManaPercent = mode === "ai-cast" && spell.aiCast.length > 0 ? spell.aiCastManaMinPercent : spell.autocastManaMinPercent;
  const maxManaPercent = mode === "ai-cast" && spell.aiCast.length > 0 ? spell.aiCastManaMaxPercent : spell.autocastManaMaxPercent;
  return sourceCastConditionTokensMatch(world, caster, aiTokens, caster)
    && sourceManaPercentMatches(caster, minManaPercent, maxManaPercent);
}

function sourceCasterCombatConditionMatches(world: WorldState, spell: WargusSpell, caster: WorldUnit, tokens: string[], mode: "ai-cast" | "autocast"): boolean {
  const combatIndex = tokens.indexOf("combat");
  if (combatIndex < 0) {
    return true;
  }
  const conditionMode = tokens[combatIndex + 1];
  if (conditionMode !== "only" && conditionMode !== "false") {
    return true;
  }
  const fallbackRange = typeof spell.range === "number" ? spell.range : 12;
  const rangeTiles = mode === "ai-cast" && spell.aiCast.length > 0 ? spellAiRangeTiles(world, spell.id, fallbackRange) : spellAutocastRangeTiles(world, spell.id, fallbackRange);
  const inCombat = world.units.some((unit) => arePlayersEnemies(world, caster.player, unit.player)
    && unit.hitPoints > 0
    && isUnitVisibleToPlayer(world, unit, caster.player)
    && Math.hypot(unit.x - caster.x, unit.y - caster.y) <= rangeTiles * world.tileSize + unit.radius
    && (canAttackTarget(caster, unit, world) || canAttackTarget(unit, caster, world)));
  return conditionMode === "only" ? inCombat : !inCombat;
}

function sourceCasterCorpseConditionMatches(world: WorldState, spell: WargusSpell, caster: WorldUnit, tokens: string[], mode: "ai-cast" | "autocast"): boolean {
  const corpseIndex = tokens.indexOf("corpse");
  if (corpseIndex < 0) {
    return true;
  }
  const conditionMode = tokens[corpseIndex + 1];
  if (conditionMode !== "only" && conditionMode !== "false") {
    return true;
  }
  const fallbackRange = typeof spell.range === "number" ? spell.range : 6;
  const rangeTiles = mode === "ai-cast" && spell.aiCast.length > 0 ? spellAiRangeTiles(world, spell.id, fallbackRange) : spellAutocastRangeTiles(world, spell.id, fallbackRange);
  const hasVisibleCorpse = (world.corpses ?? []).some((corpse) =>
    isCorpseInRaiseDeadRange(world, caster, corpse, rangeTiles)
    && isCircleVisibleToPlayer(world, corpse.x, corpse.y, corpse.radius, caster.player)
  );
  return conditionMode === "only" ? hasVisibleCorpse : !hasVisibleCorpse;
}

function sourceSpellHasAiCombatUse(spell: WargusSpell, mode: "ai-cast" | "autocast"): boolean {
  const tokens = sourceSpellRuntimeTokens(spell, mode);
  return tokens.includes("combat")
    || tokens.includes("attacker")
    || tokens.includes("alliance")
    || tokens.includes("self")
    || tokens.includes("HitPoints")
    || tokens.includes("Mana")
    || tokens.includes("opponent")
    || tokens.includes("corpse")
    || spell.target === "position";
}

function sourceAiSpellPriority(spell: WargusSpell): number {
  const id = spell.id;
  if (id === "spell-blizzard" || id === "spell-death-and-decay") {
    return 100;
  }
  if (id === "spell-polymorph" || id === "spell-whirlwind") {
    return 90;
  }
  if (id === "spell-bloodlust" || id === "spell-bloodlust-double-head" || id === "spell-death-coil" || id === "spell-healing") {
    return 80;
  }
  if (id === "spell-slow" || id === "spell-haste" || id === "spell-exorcism") {
    return 70;
  }
  if (id === "spell-invisibility" || id === "spell-raise-dead" || id === "spell-unholy-armor") {
    return 60;
  }
  if (id === "spell-runes" || id === "spell-runes-double-head" || id === "spell-fireball") {
    return 50;
  }
  if (id === "spell-eye-of-vision" || id === "spell-eye-of-vision-double-head") {
    return 40;
  }
  return 10;
}

function issueNextAiResearch(world: WorldState, building: WorldUnit, upgradeIds: string[], matchesSourceUpgrade: (upgradeId: string) => boolean = () => true, preferredUpgradeIds: string[] = []): boolean {
  for (const upgradeId of preferredUpgradeIds.filter(matchesSourceUpgrade)) {
    if (issueAiResearchOrder(world, building, upgradeId, world.upgradeDefinitions)) {
      return true;
    }
  }
  for (const upgradeId of sourceResearchOrderForBuilding(world, building, matchesSourceUpgrade)) {
    if (issueAiResearchOrder(world, building, upgradeId, world.upgradeDefinitions)) {
      return true;
    }
  }
  for (const upgradeId of upgradeIds) {
    if (issueAiResearchOrder(world, building, upgradeId, world.upgradeDefinitions)) {
      return true;
    }
  }
  return false;
}

function issueAiResearchOrder(world: WorldState, building: WorldUnit, upgradeId: string, upgrades: WargusUpgrade[]): boolean {
  const player = world.players.find((candidate) => candidate.id === building.player);
  const upgrade = upgrades.find((candidate) => candidate.id === upgradeId);
  if (!player || !upgrade || !canAiResearchUpgradeAt(world, building, upgradeId, upgrades)) {
    return false;
  }
  spendResources(player.resources, upgradeCostPairs(upgrade));
  const totalSeconds = sourceResearchDurationSecondsForPlayer(world, building.player, upgrade.costs.time);
  world.activeResearch.push({ buildingId: building.id, player: player.id, upgradeId, remainingSeconds: totalSeconds, totalSeconds });
  return true;
}

function issueNextAiResearchByRole(world: WorldState, building: WorldUnit, matchesUpgrade: (upgradeId: string) => boolean, preferredUpgradeIds: string[] = []): boolean {
  return issueNextAiResearch(world, building, fallbackResearchUpgradeIdsForBuilding(world, building).filter(matchesUpgrade), matchesUpgrade, preferredUpgradeIds);
}

function sourceResearchOrderForBuilding(world: WorldState, building: WorldUnit, matchesUpgrade: (upgradeId: string) => boolean): string[] {
  const seen = new Set<string>();
  return world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => (
      button.action === "research"
      && Boolean(button.value)
      && sourceButtonAppliesTo(button, building.typeId)
      && sourceButtonAllowedForSimulation(world, button, building.player)
    ))
    .filter((button) => matchesUpgrade(button.value))
    .sort((left, right) => left.level - right.level || left.pos - right.pos || left.value.localeCompare(right.value))
    .map((button) => button.value)
    .filter((upgradeId) => {
      if (seen.has(upgradeId)) {
        return false;
      }
      seen.add(upgradeId);
      return true;
    });
}

function findNearestAiRepairTarget(world: WorldState, worker: WorldUnit): WorldUnit | undefined {
  return world.units
    .filter((candidate) => canRepairTarget(worker, candidate, world))
    .sort((a, b) => (
      repairPriority(world, a) - repairPriority(world, b)
      || damageRatio(b) - damageRatio(a)
      || distanceSquared(worker, a) - distanceSquared(worker, b)
    ))[0];
}

function stepAutoRepair(world: WorldState, worker: WorldUnit): void {
  if (!worker.autoRepair || worker.order !== null || worker.autoRepairRange <= 0 || worker.construction || worker.hitPoints <= 0 || !isWorker(worker)) {
    return;
  }
  const target = findNearestAutoRepairTarget(world, worker);
  if (target) {
    issueRepairOrder(world, worker.id, target.id);
  }
}

export function canToggleAutoRepair(unit: WorldUnit): boolean {
  return unit.hitPoints > 0 && !unit.construction && unit.autoRepairRange > 0 && isWorker(unit);
}

export function setAutoRepairForSelection(world: WorldState, unitIds: string[], enabled: boolean, playerId = world.visibilityPlayer): boolean {
  let changed = false;
  for (const unitId of unitIds) {
    const unit = findUnit(world, unitId);
    if (!unit || unit.player !== playerId || !canToggleAutoRepair(unit)) {
      continue;
    }
    if (unit.autoRepair !== enabled) {
      unit.autoRepair = enabled;
      changed = true;
    }
  }
  return changed;
}

export function toggleAutoRepairForSelection(world: WorldState, unitIds: string[], playerId = world.visibilityPlayer): boolean {
  const units = unitIds
    .map((id) => findUnit(world, id))
    .filter((unit): unit is WorldUnit => Boolean(unit && unit.player === playerId && canToggleAutoRepair(unit)));
  if (units.length === 0) {
    return false;
  }
  const enabled = units.some((unit) => !unit.autoRepair);
  for (const unit of units) {
    unit.autoRepair = enabled;
  }
  return true;
}

function findNearestAutoRepairTarget(world: WorldState, worker: WorldUnit): WorldUnit | undefined {
  const centerX = Math.floor(worker.x / world.tileSize);
  const centerY = Math.floor(worker.y / world.tileSize);
  const rangeTiles = Math.max(0, Math.floor(worker.autoRepairRange / world.tileSize));
  return sourceAutoRepairRectScanTarget(world, worker, centerX - rangeTiles, centerY - rangeTiles, centerX + rangeTiles, centerY + rangeTiles);
}

function sourceAutoRepairRectScanTarget(world: WorldState, worker: WorldUnit, minX: number, minY: number, maxX: number, maxY: number): WorldUnit | undefined {
  const candidates = world.units.filter((candidate) => (
    canRepairTarget(worker, candidate, world)
    && sourceAutoRepairRectContains(world, candidate, minX, minY, maxX, maxY)
  ));
  for (let y = Math.max(0, minY); y <= Math.min(world.map.height - 1, maxY); y += 1) {
    for (let x = Math.max(0, minX); x <= Math.min(world.map.width - 1, maxX); x += 1) {
      const target = candidates.find((candidate) => sourceUnitOccupiesTile(world, candidate, x, y));
      if (target) {
        return target;
      }
    }
  }
  return undefined;
}

function sourceAutoRepairRectContains(world: WorldState, unit: WorldUnit, minX: number, minY: number, maxX: number, maxY: number): boolean {
  const { halfWidth, halfHeight } = unitFootprintHalfSize(unit, world.tileSize);
  const left = Math.floor((unit.x - halfWidth) / world.tileSize);
  const right = Math.floor((unit.x + halfWidth - 1) / world.tileSize);
  const top = Math.floor((unit.y - halfHeight) / world.tileSize);
  const bottom = Math.floor((unit.y + halfHeight - 1) / world.tileSize);
  return right >= minX && left <= maxX && bottom >= minY && top <= maxY;
}

function sourceUnitOccupiesTile(world: WorldState, unit: WorldUnit, tileX: number, tileY: number): boolean {
  const center = tileToWorldCenter(world, tileX, tileY);
  const { halfWidth, halfHeight } = unitFootprintHalfSize(unit, world.tileSize);
  return center.x >= unit.x - halfWidth && center.x <= unit.x + halfWidth && center.y >= unit.y - halfHeight && center.y <= unit.y + halfHeight;
}

function repairPriority(world: WorldState, unit: WorldUnit): number {
  if (isTownCenter(unit) || isBarracks(world, unit) || isShipyard(world, unit)) {
    return 0;
  }
  if (isBuildingLike(unit)) {
    return 1;
  }
  return 2;
}

function damageRatio(unit: WorldUnit): number {
  return unit.maxHitPoints > 0 ? 1 - unit.hitPoints / unit.maxHitPoints : 0;
}

function armyForAiStrategy(army: WorldUnit[], strategy: "land" | "sea" | "air"): WorldUnit[] {
  if (strategy === "air") {
    const flyers = army.filter((unit) => unit.kind === "fly");
    return flyers.length >= 3 ? flyers : army;
  }
  if (strategy === "sea") {
    const naval = army.filter((unit) => unit.kind === "naval");
    return naval.length >= 3 ? naval : army;
  }
  return army.filter((unit) => unit.kind !== "naval" || army.filter((candidate) => candidate.kind !== "naval").length < 3);
}

function preferredAiAttackArmy(army: WorldUnit[], preferredTypeIds: string[], attackForceSize: number, targetCounts: Array<{ unitTypeId: string; count: number }> = []): WorldUnit[] {
  const waveSize = Math.max(1, Math.floor(attackForceSize));
  if (targetCounts.length > 0) {
    const selected: WorldUnit[] = [];
    const selectedIds = new Set<string>();
    for (const target of targetCounts) {
      const matching = army.filter((unit) => unit.typeId === target.unitTypeId && !selectedIds.has(unit.id));
      for (const unit of matching.slice(0, target.count)) {
        selected.push(unit);
        selectedIds.add(unit.id);
      }
    }
    if (selected.length >= waveSize) {
      return selected.slice(0, waveSize);
    }
    const filled = [...selected, ...army.filter((unit) => !selectedIds.has(unit.id))];
    if (filled.length >= waveSize) {
      return filled.slice(0, waveSize);
    }
  }
  if (preferredTypeIds.length === 0) {
    return army.slice(0, waveSize);
  }
  const preferred = army
    .filter((unit) => preferredTypeIds.includes(unit.typeId))
    .sort((left, right) => preferredTypeIds.indexOf(left.typeId) - preferredTypeIds.indexOf(right.typeId));
  if (preferred.length >= waveSize) {
    return preferred.slice(0, waveSize);
  }
  const preferredIds = new Set(preferred.map((unit) => unit.id));
  return [...preferred, ...army.filter((unit) => !preferredIds.has(unit.id))].slice(0, waveSize);
}

function findPrimaryEnemyTargetForUnit(world: WorldState, playerId: number, attacker: WorldUnit): WorldUnit | undefined {
  const enemies = world.units.filter((unit) => (
    arePlayersEnemies(world, playerId, unit.player)
    && unit.hitPoints > 0
    && isUnitVisibleToPlayer(world, unit, playerId)
    && canAutoAcquireSourceTarget(attacker, unit)
  ));
  if (enemies.length === 0) {
    return undefined;
  }
  const preferred = enemies
    .filter((enemy) => isBuildingLike(enemy) || enemy.kind === attacker.kind || enemy.kind === "naval")
    .sort((a, b) => targetPriorityFor(attacker, a) - targetPriorityFor(attacker, b) || distanceSquared(attacker, a) - distanceSquared(attacker, b));
  const fallback = enemies.sort((a, b) => targetPriorityFor(attacker, a) - targetPriorityFor(attacker, b) || distanceSquared(attacker, a) - distanceSquared(attacker, b));
  return [...preferred, ...fallback].find((enemy, index, list) => (
    list.findIndex((candidate) => candidate.id === enemy.id) === index
    && canReachAttackTarget(world, attacker, enemy)
  ));
}

function targetPriorityFor(attacker: WorldUnit, target: WorldUnit): number {
  const computerAnnoyance = isComputerAttacker(attacker) ? target.annoyComputerFactor : 0;
  const sourcePriorityCost = -target.priority - computerAnnoyance;
  const hpPercent = target.maxHitPoints > 0 ? (100 * target.hitPoints) / target.maxHitPoints : 100;
  const distance = Math.max(0, Math.hypot(target.x - attacker.x, target.y - attacker.y) - target.radius);
  const inRangeCost = isInAttackRange(attacker, target) ? -64 + distance / 32 : distance / 8;
  const counterAttackCost = canAttackTarget(target, attacker) ? -32 : 0;
  const fallbackRoleCost = target.priority > 0
    ? 0
    : target.canAttack && target.kind === attacker.kind
      ? 0
      : isBuildingLike(target)
        ? 12
        : target.canAttack
          ? 24
          : 36;
  return sourcePriorityCost * 10 + hpPercent + inRangeCost + counterAttackCost + fallbackRoleCost;
}

function isComputerAttacker(attacker: WorldUnit): boolean {
  return attacker.player !== 0 && attacker.player !== 15;
}

function canReachAttackTarget(world: WorldState, attacker: WorldUnit, target: WorldUnit): boolean {
  if (!canAutoAcquireSourceTarget(attacker, target)) {
    return false;
  }
  if (isInAttackRange(attacker, target, world) || attacker.kind === "fly") {
    return true;
  }
  return findPath(world, attacker, target.x, target.y).length > 0;
}

function canAutoAcquireSourceTarget(attacker: WorldUnit, target: WorldUnit): boolean {
  return !isSourceWallUnit(target) || sourceTileDistanceBetweenUnits(attacker, target) <= 1;
}

function isSourceWallUnit(unit: WorldUnit): boolean {
  return isBuildingLike(unit)
    && unit.tileWidth === 1
    && unit.tileHeight === 1
    && unit.constructionTypeId === "construction-wall"
    && !unit.canAttack
    && unit.supply <= 0
    && unit.demand <= 0
    && !unit.mainFacility
    && unit.storesResources.length === 0;
}

function sourceTileDistanceBetweenUnits(left: WorldUnit, right: WorldUnit): number {
  return Math.max(0, Math.ceil((Math.hypot(left.x - right.x, left.y - right.y) - left.radius - right.radius) / 32));
}

function findAiPressurePointForUnit(world: WorldState, playerId: number, unit: WorldUnit): { x: number; y: number } | null {
  const enemyStarts = world.players
    .filter((player) => arePlayersEnemies(world, playerId, player.id))
    .map((player) => ({ x: player.startX, y: player.startY }));
  const knownEnemyBuildings = world.units
    .filter((candidate) => arePlayersEnemies(world, playerId, candidate.player)
      && candidate.hitPoints > 0
      && isBuildingLike(candidate)
      && isUnitVisibleToPlayer(world, candidate, playerId))
    .map((candidate) => ({ x: candidate.x, y: candidate.y }));
  const candidates = [...enemyStarts, ...knownEnemyBuildings]
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((a, b) => distanceSquared(unit, a) - distanceSquared(unit, b));
  return candidates.find((point) => unit.kind === "fly" || findPath(world, unit, point.x, point.y).length > 0) ?? null;
}

function stepBuildOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {
  if (unit.order?.kind !== "build") {
    return;
  }
  const building = findUnit(world, unit.order.targetId);
  if (!building || !building.construction || building.player !== unit.player || (building.construction.builderId && building.construction.builderId !== unit.id)) {
    unit.order = null;
    return;
  }
  building.construction.builderId = unit.id;
  if (!isInTouchRange(unit, building)) {
    if (unit.order.path.length === 0 || world.tick % sourceOrderRetryTicks(world, 30) === 0) {
      unit.order.path = findPath(world, unit, building.x, building.y);
      unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
    }
    stepMoveOrder(world, unit, tickSeconds);
    return;
  }

  if (building.construction.builderInside) {
    hideBuilderInsideConstruction(unit, building);
    unit.order = null;
    return;
  }

  updateUnitFacing(unit, building.x - unit.x, building.y - unit.y);
  unit.order.buildCycle += sourceElapsedCycles(world, tickSeconds);
  const buildCycleTicks = sourceBuildCycleTicks(world, unit);
  while (unit.order?.kind === "build" && unit.order.buildCycle >= buildCycleTicks && building.construction) {
    progressConstruction(world, building, sourceCyclesToSeconds(world, buildCycleTicks), unit);
    if (unit.order?.kind === "build") {
      unit.order.buildCycle -= buildCycleTicks;
    }
  }
}

function hideBuilderInsideConstruction(builder: WorldUnit, building: WorldUnit): void {
  builder.hiddenInConstructionId = building.id;
  builder.x = building.x;
  builder.y = building.y;
}

function progressConstruction(world: WorldState, building: WorldUnit, tickSeconds: number, builder: WorldUnit): void {
  if (!building.construction) {
    return;
  }
  building.construction.remainingSeconds -= tickSeconds;
  const progress = 1 - building.construction.remainingSeconds / building.construction.totalSeconds;
  building.hitPoints = Math.max(1, Math.floor(building.maxHitPoints * Math.min(1, Math.max(0.1, progress))));
  if (building.construction.remainingSeconds > 0) {
    return;
  }
  const builderTypeId = builder.typeId;
  const builderInside = building.construction.builderInside === true;
  building.hitPoints = building.maxHitPoints;
  building.construction = null;
  if (builderInside) {
    releaseBuilderFromConstruction(world, builder, building);
  } else if (builder.order?.kind === "build" && builder.order.targetId === building.id) {
    builder.order = null;
  }
  issueSourceConstructionCompleteBuilderOrder(world, builder, building);
  world.events.push({ kind: "construction-complete", unitId: building.id, typeId: building.typeId, player: building.player, builderTypeId, x: building.x, y: building.y });
}

function stepBuildOilPlatformOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {
  if (unit.order?.kind !== "build-oil-platform") {
    return;
  }
  const oilPatch = findUnit(world, unit.order.targetId);
  const player = world.players.find((candidate) => candidate.id === unit.player);
  const platformDefinition = player ? oilPlatformDefinitionForBuilder(world, unit, player, world.unitDefinitions) : undefined;
  if (!oilPatch || !player || !platformDefinition || !canGatherResource(unit, "oil") || !isOilPatch(oilPatch) || oilPatch.resourcesHeld <= 0 || !isUnitTypeAllowed(world, platformDefinition.id, unit.player)) {
    unit.order = null;
    return;
  }
  unit.order.targetX = oilPatch.x;
  unit.order.targetY = oilPatch.y;
  if (!isInTouchRange(unit, oilPatch)) {
    if (unit.order.path.length === 0 || world.tick % sourceOrderRetryTicks(world, 30) === 0) {
      unit.order.path = findPath(world, unit, oilPatch.x, oilPatch.y);
      unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
    }
    stepMoveOrder(world, unit, tickSeconds);
    return;
  }
  if (!canAfford(player.resources, platformDefinition.costs)) {
    unit.order = null;
    return;
  }
  startOilPlatformConstruction(world, unit, oilPatch, player, platformDefinition, { clearQueue: unit.order.preserveQueue !== true });
}

function stepRepairOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {
  if (unit.order?.kind !== "repair") {
    return;
  }
  const target = findUnit(world, unit.order.targetId);
  const player = world.players.find((candidate) => candidate.id === unit.player);
  if (!target || !player || !canRepairTarget(unit, target, world)) {
    unit.order = null;
    return;
  }
  unit.order.targetX = target.x;
  unit.order.targetY = target.y;
  if (!isInRepairRange(unit, target)) {
    unit.order.repairCycle = 0;
    if (unit.order.path.length === 0 || world.tick % sourceOrderRetryTicks(world, 20) === 0) {
      unit.order.path = findPath(world, unit, target.x, target.y);
      unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
    }
    stepMoveOrder(world, unit, tickSeconds);
    return;
  }
  updateUnitFacing(unit, target.x - unit.x, target.y - unit.y);

  const repairHp = repairHpForTarget(target);
  unit.order.repairCycle += sourceElapsedCycles(world, tickSeconds);
  const repairCycleTicks = sourceRepairCycleTicks(world, unit);
  while (unit.order.repairCycle >= repairCycleTicks && (target.construction || target.hitPoints < target.maxHitPoints)) {
    const repairCosts = target.construction ? sourceConstructionRepairCosts(target) : repairCostsForTarget(target);
    if (!canAfford(player.resources, repairCosts)) {
      unit.order = null;
      return;
    }
    spendResources(player.resources, repairCosts);
    if (target.construction) {
      progressConstruction(world, target, sourceCyclesToSeconds(world, repairCycleTicks), unit);
      unit.order.repairCycle -= repairCycleTicks;
      if (!target.construction) {
        unit.order = null;
        return;
      }
      continue;
    }
    target.hitPoints = Math.min(target.maxHitPoints, target.hitPoints + repairHp);
    unit.order.repairCycle -= repairCycleTicks;
  }
  if (target.hitPoints >= target.maxHitPoints) {
    unit.order = null;
  }
}

function sourceRepairCycleTicks(world: WorldState, unit: WorldUnit): number {
  const animation = world.animationDefinitions.find((definition) => definition.id === unit.animation);
  const frames = animation?.actions.Repair ?? [];
  const ticks = frames.reduce((total, frame) => total + Math.max(0, Math.floor(frame.wait)), 0);
  return Math.max(1, ticks || sourceOrderRetryTicks(world, 30));
}

function sourceElapsedCycles(world: WorldState, tickSeconds: number): number {
  return Math.max(0, tickSeconds * sourceDefaultGameSpeed(world));
}

function sourceBuildCycleTicks(world: WorldState, unit: WorldUnit): number {
  const animation = world.animationDefinitions.find((definition) => definition.id === unit.animation);
  const frames = (animation?.actions.Build?.length ? animation.actions.Build : animation?.actions.Repair) ?? [];
  const ticks = frames.reduce((total, frame) => total + Math.max(0, Math.floor(frame.wait)), 0);
  return Math.max(1, ticks || sourceOrderRetryTicks(world, 30));
}

function repairHpForTarget(target: WorldUnit): number {
  return Math.max(1, Math.floor(target.repairHp || 5));
}

function repairCostsForTarget(target: WorldUnit): string[] {
  return target.repairCosts;
}

function sourceConstructionRepairCosts(target: WorldUnit): string[] {
  return SOURCE_RESOURCES_MULTI_BUILDERS_MULTIPLIER > 0 ? target.repairCosts : [];
}

const SOURCE_RESOURCES_MULTI_BUILDERS_MULTIPLIER = 0;

function stepLoadTransportOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {
  if (unit.order?.kind !== "load-transport") {
    return;
  }
  const transport = findUnit(world, unit.order.targetId);
  if (!transport || !canTargetTransportForLoading(transport, unit)) {
    unit.order.boardState = "wait";
    unit.order.boardWaitTicks = Math.max(unit.order.boardWaitTicks, sourceBoardWaitTicks(world, 6));
    return;
  }
  unit.order.targetX = transport.x;
  unit.order.targetY = transport.y;

  if (unit.order.boardState === "wait") {
    unit.order.boardWaitTicks = Math.max(0, unit.order.boardWaitTicks - 1);
    if (unit.order.boardWaitTicks > 0) {
      return;
    }
    if (canLoadIntoTransport(transport, unit)) {
      unit.order.boardState = "enter";
    } else {
      unit.order.boardState = "move";
      unit.order.boardRange = 1;
      unit.order.path = [];
      unit.order.pathIndex = 0;
      unit.order.boardWaitTicks = sourceBoardWaitTicks(world, 10);
      return;
    }
  }

  if (unit.order.boardState === "move" && !canLoadIntoTransport(transport, unit)) {
    const beforeTile = worldToTile(world, unit.x, unit.y);
    if (unit.order.path.length === 0 || world.tick % sourceOrderRetryTicks(world, 20) === 0) {
      unit.order.path = findBoardPathWithinSourceRange(world, unit, transport, unit.order.boardRange);
      if (unit.order.path.length === 0) {
        unit.order.boardRange += 1;
        unit.order.path = findBoardPathWithinSourceRange(world, unit, transport, unit.order.boardRange);
      }
      unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
    }
    stepMoveOrder(world, unit, tickSeconds);
    const afterTile = worldToTile(world, unit.x, unit.y);
    if (beforeTile.x !== afterTile.x || beforeTile.y !== afterTile.y) {
      unit.order.boardRange = 1;
    }
    if (canLoadIntoTransport(transport, unit)) {
      unit.order.boardState = "enter";
    } else if (unit.order.path.length === 0 && unit.order.boardRange > 1) {
      unit.order.boardState = "wait";
      unit.order.boardWaitTicks = sourceBoardWaitTicks(world, 10);
    }
    return;
  }

  unit.order.boardState = "enter";
  unit.order = null;
  unit.moveQueue = [];
  transport.cargo.push(unit);
  world.units = world.units.filter((candidate) => candidate.id !== unit.id);
  clearReferencesToUnavailableUnits(world, new Set([unit.id]));
  world.events.push({ kind: "unit-loaded", unitId: unit.id, transportId: transport.id, player: unit.player });
  emitSoundEvent(world, "transport-docking", transport.player, transport.x, transport.y);
}

function sourceBoardWaitTicks(world: WorldState, sourceCycles: number): number {
  return sourceOrderRetryTicks(world, sourceCycles);
}

function findBoardPathWithinSourceRange(world: WorldState, unit: WorldUnit, transport: WorldUnit, rangeTiles: number): Array<{ x: number; y: number }> {
  return findFollowPathWithinSourceRange(world, unit, transport, rangeTiles);
}

function stepUnloadTransportAtOrder(world: WorldState, transport: WorldUnit, tickSeconds: number): void {
  if (transport.order?.kind !== "unload-transport") {
    return;
  }
  if (!isTransport(transport) || transport.cargo.length === 0) {
    transport.order = null;
    return;
  }
  if (transport.order.unloadRetries >= SOURCE_UNLOAD_MAX_RETRIES) {
    transport.order = null;
    return;
  }

  if (transport.order.unloadState === "find-dropzone") {
    const dropZone = closestFreeDropZone(world, transport, worldToTile(world, transport.order.targetX, transport.order.targetY), SOURCE_UNLOAD_DROPZONE_MAX_RANGE, transport.order.unloadCargoUnitId);
    if (!dropZone) {
      transport.order.unloadRetries = SOURCE_UNLOAD_MAX_RETRIES;
      return;
    }
    const dropZonePoint = tileToWorldCenter(world, dropZone.x, dropZone.y);
    transport.order.targetX = dropZonePoint.x;
    transport.order.targetY = dropZonePoint.y;
    transport.order.unloadRetries = 0;
    transport.order.unloadState = "move";
    transport.order.path = findPath(world, transport, transport.order.targetX, transport.order.targetY);
    transport.order.pathIndex = transport.order.path.length > 1 ? 1 : 0;
  }

  if (transport.order.unloadState === "move" && (transport.order.path.length === 0 || world.tick % sourceOrderRetryTicks(world, 30) === 0)) {
    transport.order.path = findPath(world, transport, transport.order.targetX, transport.order.targetY);
    transport.order.pathIndex = transport.order.path.length > 1 ? 1 : 0;
  }
  const finalWaypoint = transport.order.path[transport.order.path.length - 1];
  if (transport.order.unloadState === "move" && !finalWaypoint) {
    transport.order.unloadRetries += 1;
    transport.order.unloadState = "find-dropzone";
    return;
  }
  if (transport.order.unloadState === "move" && Math.hypot(transport.x - finalWaypoint.x, transport.y - finalWaypoint.y) > Math.max(4, transport.speed * tickSeconds * 1.5)) {
    stepMoveOrder(world, transport, tickSeconds);
    return;
  }

  transport.order.unloadState = "unload";
  if (!unloadTransportCargoNear(world, transport, worldToTile(world, transport.order.targetX, transport.order.targetY), transport.order.unloadCargoUnitId)) {
    transport.order.unloadRetries += 1;
    transport.order.unloadState = "find-dropzone";
  }
}

function stepProductionOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {
  if (unit.hitPoints <= 0 || unit.construction) {
    return;
  }
  const active = unit.productionQueue[0];
  if (!active) {
    return;
  }
  active.remainingSeconds -= tickSeconds;
  if (active.remainingSeconds > 0) {
    return;
  }

  const unitDefinition = world.unitDefinitions.find((candidate) => candidate.id === active.unitTypeId);
  if (unitDefinition && isProducerTransformationFor(world, unit, unitDefinition.id)) {
    const previousHitPointRatio = unit.maxHitPoints > 0 ? unit.hitPoints / unit.maxHitPoints : 1;
    if (transformUnitType(world, unit, unitDefinition.id)) {
      unit.hitPoints = Math.max(1, Math.min(unit.maxHitPoints, Math.round(unit.maxHitPoints * previousHitPointRatio)));
      world.events.push({ kind: "unit-ready", unitId: unit.id, typeId: unit.typeId, player: unit.player, x: unit.x, y: unit.y });
    } else {
      refundFailedSourceUpgradeTo(world, unit, unitDefinition);
    }
    unit.productionQueue.shift();
    return;
  }
  if (!unitDefinition) {
    unit.productionQueue.shift();
    return;
  }

  if (!canCompleteTrainedUnitWithinSourceLimits(world, unit.player, unitDefinition)) {
    active.remainingSeconds = sourceTrainRetryDelaySeconds(world);
    return;
  }

  const spawn = findSpawnTile(world, unit, unitDefinition);
  if (spawn) {
    const trainedUnit = createWorldUnit({
      unit: unitDefinition,
      id: `${unitDefinition.id}-${world.nextUnitSerial}`,
      player: unit.player,
      tileX: spawn.x,
      tileY: spawn.y,
      tileset: world.map.setup?.tileset ?? null
    });
    trainedUnit.lifetimeSeconds = sourceDecayRateLifetimeSeconds(unit.decayRate) ?? trainedUnit.lifetimeSeconds;
    applyResearchedUpgradesToUnit(world, trainedUnit);
    world.units.push(trainedUnit);
    recordPlayerUnitCreated(world, trainedUnit);
    issueOnReadyOrder(world, trainedUnit);
    if (!trainedUnit.order) {
      issueRallyOrderToTrainedUnit(world, unit, trainedUnit);
    }
    world.events.push({ kind: "unit-ready", unitId: trainedUnit.id, typeId: trainedUnit.typeId, player: trainedUnit.player, x: trainedUnit.x, y: trainedUnit.y });
    world.nextUnitSerial += 1;
  } else {
    active.remainingSeconds = sourceTrainRetryDelaySeconds(world);
    return;
  }
  unit.productionQueue.shift();
}

function sourceTrainRetryDelaySeconds(world: WorldState): number {
  return sourceCyclesToSeconds(world, 5);
}

function canCompleteTrainedUnitWithinSourceLimits(world: WorldState, playerId: number, definition: Pick<WargusUnit, "building" | "demand">): boolean {
  if (!canCreateUnitWithinSourceLimits(world, playerId, definition)) {
    return false;
  }
  const supply = getPlayerSupply(world, playerId);
  return definition.demand <= 0 || supply.used + definition.demand <= supply.cap;
}

function issueOnReadyOrder(world: WorldState, unit: WorldUnit): void {
  if (unit.order || !isExploreOnReadyValue(unit.onReady) || !canReceiveMoveOrders(unit)) {
    return;
  }
  const player = world.players.find((candidate) => candidate.id === unit.player);
  if (player?.playerType !== "person" && !world.engineSettings.aiExploresDefault) {
    return;
  }
  issueExploreOrder(world, unit.id);
}

export function canIssueExploreOrder(world: WorldState, unit: WorldUnit): boolean {
  return canReceiveMoveOrders(unit) && (isExploreOnReadyValue(unit.onReady) || hasSourceExploreButton(world, unit));
}

function hasSourceExploreButton(world: WorldState, unit: WorldUnit): boolean {
  return world.buttonDefinitions.some((button) => button.action === "explore" && sourceButtonAppliesTo(button, unit.typeId) && sourceButtonAllowedForSimulation(world, button, unit.player));
}

export function issueExploreOrder(world: WorldState, unitId: string, options: { clearQueue?: boolean } = {}): boolean {
  const unit = findUnit(world, unitId);
  if (!unit || !canIssueExploreOrder(world, unit)) {
    return false;
  }
  const explorationPath = findExplorationPath(world, unit);
  if (!explorationPath) {
    return false;
  }
  const { target, path } = explorationPath;
  if (options.clearQueue !== false) {
    unit.moveQueue = [];
  }
  unit.order = {
    kind: "explore",
    targetX: path.at(-1)?.x ?? target.x,
    targetY: path.at(-1)?.y ?? target.y,
    exploreRange: 0,
    exploreWaitingCycle: 0,
    path,
    pathIndex: path.length > 1 ? 1 : 0
  };
  return true;
}

function findExplorationPath(world: WorldState, unit: WorldUnit): { target: { x: number; y: number }; path: Array<{ x: number; y: number }> } | null {
  const candidates = findExplorationCandidates(world, unit);
  for (const target of candidates) {
    const path = findPath(world, unit, target.x, target.y);
    if (path.length > 0) {
      return { target, path };
    }
  }
  return null;
}

function findExplorationPathWithinSourceRange(world: WorldState, unit: WorldUnit, targetX: number, targetY: number, range: number): Array<{ x: number; y: number }> {
  const directPath = findPath(world, unit, targetX, targetY);
  if (directPath.length > 0 || range <= 0) {
    return directPath;
  }
  const targetTile = worldToTile(world, targetX, targetY);
  for (let radius = 1; radius <= range; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
          continue;
        }
        const x = targetTile.x + dx;
        const y = targetTile.y + dy;
        if (!isTilePassable(world, x, y, movementKindForUnit(unit), unit.id)) {
          continue;
        }
        const path = findPath(world, unit, x * world.tileSize + world.tileSize / 2, y * world.tileSize + world.tileSize / 2);
        if (path.length > 0) {
          return path;
        }
      }
    }
  }
  return [];
}

function retargetExploreOrder(world: WorldState, unit: WorldUnit): void {
  if (unit.order?.kind !== "explore") {
    return;
  }
  const explorationPath = findExplorationPath(world, unit);
  if (!explorationPath) {
    unit.order.path = [];
    unit.order.pathIndex = 0;
    return;
  }
  unit.order.targetX = explorationPath.path.at(-1)?.x ?? explorationPath.target.x;
  unit.order.targetY = explorationPath.path.at(-1)?.y ?? explorationPath.target.y;
  unit.order.path = explorationPath.path;
  unit.order.pathIndex = explorationPath.path.length > 1 ? 1 : 0;
}

function findExplorationCandidates(world: WorldState, unit: WorldUnit): Array<{ x: number; y: number }> {
  const seed = Math.abs(deterministicHash(`${unit.player}:${unit.id}:${world.tick}`));
  const unexplored = findUnexploredExplorationCandidates(world, unit, seed);
  if (unexplored.length > 0) {
    return unexplored;
  }
  const candidates: Array<{ x: number; y: number; explored: boolean; score: number }> = [];
  const stride = Math.max(4, Math.floor(Math.min(world.map.width, world.map.height) / 10));
  for (let y = 1; y < world.map.height - 1; y += stride) {
    for (let x = 1; x < world.map.width - 1; x += stride) {
      const index = y * world.map.width + x;
      const explored = world.exploredTiles[index] !== 0;
      const worldX = x * world.tileSize + world.tileSize / 2;
      const worldY = y * world.tileSize + world.tileSize / 2;
      const distance = Math.hypot(worldX - unit.x, worldY - unit.y);
      const jitter = Math.abs(deterministicHash(`${seed}:${x}:${y}`)) % 97;
      candidates.push({ x: worldX, y: worldY, explored, score: (explored ? 5000 : 0) + distance + jitter });
    }
  }
  return candidates
    .sort((left, right) => left.score - right.score)
    .map(({ x, y }) => ({ x, y }));
}

function findUnexploredExplorationCandidates(world: WorldState, unit: WorldUnit, seed: number): Array<{ x: number; y: number }> {
  const candidates: Array<{ x: number; y: number; score: number }> = [];
  for (let y = 1; y < world.map.height - 1; y += 1) {
    for (let x = 1; x < world.map.width - 1; x += 1) {
      if (world.exploredTiles[y * world.map.width + x] !== 0) {
        continue;
      }
      const worldX = x * world.tileSize + world.tileSize / 2;
      const worldY = y * world.tileSize + world.tileSize / 2;
      const distance = Math.hypot(worldX - unit.x, worldY - unit.y);
      const jitter = Math.abs(deterministicHash(`${seed}:unexplored:${x}:${y}`)) % 97;
      const score = distance + jitter;
      candidates.push({ x: worldX, y: worldY, score });
    }
  }
  return candidates
    .sort((left, right) => left.score - right.score)
    .map(({ x, y }) => ({ x, y }));
}

function issueRallyOrderToTrainedUnit(world: WorldState, producer: WorldUnit, trainedUnit: WorldUnit): void {
  if (!producer.rallyPoint || !canReceiveMoveOrders(trainedUnit)) {
    return;
  }
  if (issueSourceRallyResourceOrder(world, trainedUnit, producer.rallyPoint.x, producer.rallyPoint.y)) {
    return;
  }
  const enemy = findVisibleEnemyNearPointForUnit(world, trainedUnit, producer.rallyPoint.x, producer.rallyPoint.y);
  if (enemy && trainedUnit.canAttack) {
    const path = isInAttackRange(trainedUnit, enemy, world) ? [] : findPath(world, trainedUnit, enemy.x, enemy.y);
    if (path.length === 0 && !isInAttackRange(trainedUnit, enemy, world)) {
      return;
    }
    trainedUnit.order = {
      kind: "attack",
      targetId: enemy.id,
      targetX: enemy.x,
      targetY: enemy.y,
      path,
      pathIndex: path.length > 1 ? 1 : 0
    };
    return;
  }
  const path = findPath(world, trainedUnit, producer.rallyPoint.x, producer.rallyPoint.y);
  if (path.length > 0) {
    trainedUnit.order = {
      kind: "move",
      targetX: path.at(-1)?.x ?? producer.rallyPoint.x,
      targetY: path.at(-1)?.y ?? producer.rallyPoint.y,
      path,
      pathIndex: path.length > 1 ? 1 : 0
    };
  }
}

function issueSourceRallyResourceOrder(world: WorldState, trainedUnit: WorldUnit, x: number, y: number): boolean {
  const resource = findResourceAt(world, x, y, trainedUnit.player);
  if (resource && canSmartHarvestResource(trainedUnit, resource)) {
    if (isOilPatch(resource)) {
      return issueBuildOilPlatformOrder(world, trainedUnit.id, resource.id, world.unitDefinitions);
    }
    if (isOilPlatform(resource)) {
      return issueHarvestOilOrder(world, trainedUnit.id, resource.id);
    }
    return issueHarvestOrder(world, trainedUnit.id, resource.id);
  }
  const tile = worldToTile(world, x, y);
  return canGatherResource(trainedUnit, "wood")
    && isSourceHarvestableWoodTile(world, world.tiles[tile.y * world.map.width + tile.x] ?? 0)
    && issueHarvestWoodOrder(world, trainedUnit.id, tile.x, tile.y);
}

function stepAttackOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {
  if (unit.order?.kind !== "attack") {
    return;
  }
  const target = findUnit(world, unit.order.targetId);
  if (!canContinueAttackingTarget(world, unit, target)) {
    unit.order = null;
    return;
  }

  unit.order.targetX = target.x;
  unit.order.targetY = target.y;
  if (isTargetInsideMinimumAttackRange(unit, target) && canReceiveMoveOrders(unit)) {
    const path = findBetterAttackPositionPath(world, unit, target.x, target.y);
    if (path.length > 0) {
      unit.order.path = path;
      unit.order.pathIndex = path.length > 1 ? 1 : 0;
      stepMoveOrder(world, unit, tickSeconds);
    }
    return;
  }
  if (isInAttackRange(unit, target, world)) {
    unit.order.path = [];
    unit.order.pathIndex = 0;
    if (unit.attackCooldown <= 0 && canLaunchAttackNow(unit, target)) {
      launchAttack(world, unit, target);
      unit.attackCooldown = attackCooldownForUnit(world, unit);
    } else {
      turnSideAttackTowardTarget(unit, target, tickSeconds);
    }
    return;
  }

  if (unit.order.path.length === 0 || world.tick % sourceOrderRetryTicks(world, 15) === 0) {
    unit.order.path = findPath(world, unit, target.x, target.y);
    unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
  }
  if (unit.order.path.length > 0) {
    stepMoveOrder(world, unit, tickSeconds);
  }
}

function stepDefensiveAutoAttack(world: WorldState, unit: WorldUnit): void {
  if (!canAutoGuard(unit) || unit.construction || unit.attackCooldown > 0) {
    return;
  }
  const target = isDefensiveBuilding(unit) ? findNearestEnemyInRange(world, unit) : findNearestEnemyInAggroRange(world, unit);
  if (!target) {
    return;
  }
  if (isInAttackRange(unit, target, world)) {
    if (canLaunchAttackNow(unit, target)) {
      launchAttack(world, unit, target);
      unit.attackCooldown = attackCooldownForUnit(world, unit);
    } else {
      turnSideAttackTowardTarget(unit, target, sourceSideAttackFacingSeconds(world));
    }
  }
}

function attackCooldownForUnit(world: WorldState, unit: WorldUnit): number {
  const bloodlust = activeStatusEffect(unit, "bloodlust");
  const base = baseAttackCooldownForUnit(world, unit);
  return bloodlust ? Math.max(0.45, base * 0.65) : base;
}

function baseAttackCooldownForUnit(world: WorldState, unit: WorldUnit): number {
  if (canIssueDetonateOrder(world, unit)) {
    return 0.2;
  }
  const sourceAnimationCooldown = sourceAttackAnimationCooldownForUnit(world, unit);
  if (sourceAnimationCooldown !== null) {
    return sourceAnimationCooldown;
  }
  if (isSiegeEngine(world, unit)) {
    return 2.35;
  }
  const projectileKind = projectileKindForUnit(world, unit);
  if (isDefensiveBuilding(unit) && projectileKind === "cannon") {
    return 1.8;
  }
  if (projectileKind === "torpedo") {
    return 1.65;
  }
  if (unit.groundAttack && projectileKind === "cannon") {
    return 2.1;
  }
  if (unit.kind === "naval" && projectileKind === "cannon") {
    return 1.45;
  }
  if (unit.airUnit && projectileKind === "arrow") {
    return 1.35;
  }
  if (unit.kind === "land" && (projectileKind === "arrow" || projectileKind === "axe")) {
    return 1.25;
  }
  if (isWorker(unit)) {
    return 1.35;
  }
  return 1.05;
}

function sourceAttackAnimationCooldownForUnit(world: WorldState, unit: WorldUnit): number | null {
  if (!unit.animation) {
    return null;
  }
  const animation = world.animationDefinitions.find((candidate) => candidate.id === unit.animation);
  const attackFrames = animation?.actions.Attack;
  if (!attackFrames || attackFrames.length === 0) {
    return null;
  }
  const cycles = attackFrames.reduce((sum, frame) => sum + Math.max(1, Math.floor(frame.wait || 1)), 0);
  return Math.max(sourceCyclesToSeconds(world, 1), sourceCyclesToSeconds(world, cycles));
}

function sourceAttackAnimationLaunchDelayForUnit(world: WorldState, unit: WorldUnit): number {
  if (!unit.animation) {
    return 0;
  }
  const animation = world.animationDefinitions.find((candidate) => candidate.id === unit.animation);
  const attackFrames = animation?.actions.Attack;
  if (!attackFrames || attackFrames.length === 0) {
    return 0;
  }
  let cycles = 0;
  let sawActiveFrame = false;
  for (const frame of attackFrames) {
    const wait = Math.max(1, Math.floor(frame.wait || 1));
    if (frame.frame === 0 && sawActiveFrame) {
      break;
    }
    cycles += wait;
    if (frame.frame !== 0) {
      sawActiveFrame = true;
    }
  }
  if (!sawActiveFrame || cycles <= 0) {
    return 0;
  }
  return Math.max(sourceCyclesToSeconds(world, 1), sourceCyclesToSeconds(world, cycles));
}

function stepPendingAttacks(world: WorldState, tickSeconds: number): void {
  if ((world.pendingAttacks ?? []).length === 0) {
    world.pendingAttacks = [];
    return;
  }
  const remaining: WorldState["pendingAttacks"] = [];
  for (const pendingAttack of world.pendingAttacks) {
    const nextRemaining = pendingAttack.remainingSeconds - tickSeconds;
    if (nextRemaining > 0) {
      remaining.push({ ...pendingAttack, remainingSeconds: nextRemaining });
      continue;
    }
    const attacker = findUnit(world, pendingAttack.sourceId);
    const target = findUnit(world, pendingAttack.targetId);
    if (!attacker || attacker.hitPoints <= 0 || isUnitHiddenInConstruction(attacker)) {
      continue;
    }
    if (target && target.hitPoints > 0 && canAttackTarget(attacker, target, world)) {
      launchAttackNow(world, attacker, target);
      continue;
    }
    if (attacker.groundAttack) {
      launchGroundAttackNow(world, attacker, pendingAttack.targetX, pendingAttack.targetY);
    }
  }
  world.pendingAttacks = remaining;
}

function stepProjectiles(world: WorldState, tickSeconds: number): void {
  const liveProjectiles: WorldProjectile[] = [];
  for (const projectile of world.projectiles) {
    const delaySeconds = Math.max(0, projectile.delaySeconds ?? 0);
    const consumedDelaySeconds = Math.min(delaySeconds, tickSeconds);
    projectile.delaySeconds = delaySeconds - consumedDelaySeconds;
    const activeTickSeconds = tickSeconds - consumedDelaySeconds;
    if (activeTickSeconds <= 0) {
      liveProjectiles.push(projectile);
      continue;
    }
    projectile.age += activeTickSeconds;
    const target = projectile.targetId ? findUnit(world, projectile.targetId) : undefined;
    const canTrackTarget = canProjectileTrackTarget(world, projectile, target);
    if (canTrackTarget) {
      projectile.targetX = target.x;
      projectile.targetY = target.y - Math.min(16, target.radius);
    }

    const dx = projectile.targetX - projectile.x;
    const dy = projectile.targetY - projectile.y;
    const distance = Math.hypot(dx, dy);
    const step = projectile.speed * activeTickSeconds;
    if (distance <= Math.max(step, 4)) {
      if (canTrackTarget) {
        if (projectile.kind === "siege" || projectile.kind === "cannon") {
          damageSiegeImpact(world, projectile, target);
        } else {
          applyProjectileDirectImpact(world, projectile, target);
          damageProjectileSplash(world, projectile, target.id);
          if (projectile.impactSoundId) {
            emitSoundEvent(world, projectile.impactSoundId, projectile.player, projectile.targetX, projectile.targetY);
          }
          spawnProjectileImpactEffect(world, projectile);
          if (continueSourceBouncingProjectile(world, projectile, target.id)) {
            liveProjectiles.push(projectile);
          }
        }
      } else if (projectile.kind === "siege" || projectile.kind === "cannon") {
        damageGroundImpact(world, projectile);
      } else if (isSourcePointToPointBounceProjectile(projectile)) {
        damageGroundImpact(world, projectile);
        if (continueSourceBouncingProjectile(world, projectile, null)) {
          liveProjectiles.push(projectile);
        }
      }
      continue;
    }
    projectile.x += (dx / distance) * step;
    projectile.y += (dy / distance) * step;
    const ttlSeconds = projectile.ttlSeconds ?? 5;
    if (projectile.age < ttlSeconds) {
      liveProjectiles.push(projectile);
    }
  }
  world.projectiles = liveProjectiles;
}

function canProjectileTrackTarget(world: WorldState, projectile: WorldProjectile, target: WorldUnit | undefined): target is WorldUnit {
  const source = findUnit(world, projectile.sourceId);
  if (source) {
    return Boolean(target && canAttackTarget(source, target, world) && isUnitVisibleToPlayer(world, target, projectile.player));
  }
  return Boolean(
    target
    && target.hitPoints > 0
    && projectileCanHitUnitBySourceOwnership(world, projectile, target)
    && target.player !== 15
    && projectileCanStillHitKind(projectile, target)
    && isUnitVisibleToPlayer(world, target, projectile.player)
  );
}

function projectileCanStillHitKind(projectile: WorldProjectile, target: WorldUnit): boolean {
  if (projectile.canTargetLand || projectile.canTargetSea || projectile.canTargetAir) {
    if (target.kind === "fly") {
      return projectile.canTargetAir;
    }
    if (target.kind === "naval") {
      return projectile.canTargetSea;
    }
    return projectile.canTargetLand;
  }
  if (projectile.kind === "torpedo") {
    return target.kind === "naval";
  }
  if (target.kind === "fly") {
    return projectile.canTargetAir || projectile.kind === "arrow" || projectile.kind === "axe";
  }
  if (target.kind === "naval") {
    return projectile.canTargetSea || projectile.kind === "siege" || projectile.kind === "cannon";
  }
  return projectile.canTargetLand;
}

function continueSourceBouncingProjectile(world: WorldState, projectile: WorldProjectile, hitUnitId: string | null): boolean {
  return isSourcePointToPointBounceProjectile(projectile)
    ? continueLinearBouncingProjectile(world, projectile, hitUnitId)
    : retargetBouncingProjectile(world, projectile, hitUnitId);
}

function isSourcePointToPointBounceProjectile(projectile: Pick<WorldProjectile, "className" | "bouncesRemaining">): boolean {
  return projectile.bouncesRemaining > 0 && projectile.className === "missile-class-point-to-point-bounce";
}

function continueLinearBouncingProjectile(world: WorldState, projectile: WorldProjectile, hitUnitId: string | null): boolean {
  if (projectile.bouncesRemaining <= 0) {
    return false;
  }
  if (hitUnitId) {
    projectile.hitUnitIds = Array.from(new Set([...projectile.hitUnitIds, hitUnitId]));
  }
  const dx = projectile.targetX - projectile.originX;
  const dy = projectile.targetY - projectile.originY;
  const distance = Math.hypot(dx, dy);
  if (distance <= 0.5) {
    return false;
  }
  const bounceDistance = sourcePointToPointBounceDistance(world);
  projectile.bouncesRemaining -= 1;
  projectile.targetId = null;
  projectile.x = projectile.targetX;
  projectile.y = projectile.targetY;
  projectile.originX = projectile.x;
  projectile.originY = projectile.y;
  projectile.targetX = projectile.x + (dx / distance) * bounceDistance;
  projectile.targetY = projectile.y + (dy / distance) * bounceDistance;
  projectile.age = 0;
  projectile.delaySeconds = 0;
  return true;
}

function sourcePointToPointBounceDistance(world: WorldState): number {
  return ((world.tileSize + world.tileSize) * 3) / 4;
}

function retargetBouncingProjectile(world: WorldState, projectile: WorldProjectile, hitUnitId: string | null): boolean {
  if (projectile.bouncesRemaining <= 0) {
    return false;
  }
  if (hitUnitId) {
    projectile.hitUnitIds = Array.from(new Set([...projectile.hitUnitIds, hitUnitId]));
  }
  const nextTarget = findBounceProjectileTarget(world, projectile);
  if (!nextTarget) {
    return false;
  }
  projectile.bouncesRemaining -= 1;
  projectile.targetId = nextTarget.id;
  projectile.x = projectile.targetX;
  projectile.y = projectile.targetY;
  projectile.originX = projectile.x;
  projectile.originY = projectile.y;
  projectile.targetX = nextTarget.x;
  projectile.targetY = nextTarget.y - Math.min(16, nextTarget.radius);
  projectile.age = 0;
  projectile.delaySeconds = 0;
  return true;
}

function findBounceProjectileTarget(world: WorldState, projectile: WorldProjectile): WorldUnit | undefined {
  const range = Math.max(world.tileSize, projectile.range * world.tileSize);
  let closest: WorldUnit | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const unit of world.units) {
    if (projectile.hitUnitIds.includes(unit.id) || !projectileCanBounceToTarget(world, projectile, unit)) {
      continue;
    }
    const distance = Math.hypot(unit.x - projectile.x, unit.y - projectile.y);
    if (distance <= range + unit.radius && distance < closestDistance) {
      closest = unit;
      closestDistance = distance;
    }
  }
  return closest;
}

function projectileCanBounceToTarget(world: WorldState, projectile: WorldProjectile, target: WorldUnit): boolean {
  const source = findUnit(world, projectile.sourceId);
  if (source) {
    return canAttackTarget(source, target, world)
      && projectileCanStillHitKind(projectile, target)
      && isUnitVisibleToPlayer(world, target, projectile.player);
  }
  return target.hitPoints > 0
    && projectileCanHitUnitBySourceOwnership(world, projectile, target)
    && projectileCanStillHitKind(projectile, target)
    && isUnitVisibleToPlayer(world, target, projectile.player);
}

function stepHarvestOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {
  if (unit.order?.kind !== "harvest") {
    return;
  }

  const target = unit.order.targetId ? findUnit(world, unit.order.targetId) : undefined;
  const player = world.players.find((candidate) => candidate.id === unit.player);
  if (!player) {
    unit.order = null;
    return;
  }
  if (hasInvalidHarvestOrderState(world, unit)) {
    if (unit.resourcesHeld > 0) {
      if (unit.carriedResource !== unit.order.resource) {
        unit.order = null;
        return;
      }
      const dropoff = findNearestDropoff(world, unit, unit.order.resource);
      if (dropoff) {
        const dropoffPoint = resourceDropoffTargetPoint(world, unit, dropoff);
        unit.order.phase = "to-dropoff";
        unit.order.dropoffId = dropoff.id;
        unit.order.dropoffX = dropoffPoint.x;
        unit.order.dropoffY = dropoffPoint.y;
        unit.order.targetX = dropoffPoint.x;
        unit.order.targetY = dropoffPoint.y;
        unit.order.path = findPath(world, unit, dropoffPoint.x, dropoffPoint.y);
        unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
        return;
      }
      unit.order = null;
      return;
    }
    retargetHarvestAfterDelivery(world, unit, unit.order.resource);
    return;
  }
  const targetX = target?.x ?? unit.order.targetX;
  const targetY = target?.y ?? unit.order.targetY;

  if (unit.order.phase === "to-resource") {
    if (isInResourceRange(world, unit)) {
      updateUnitFacing(unit, targetX - unit.x, targetY - unit.y);
      unit.order.phase = "gathering";
      unit.order.gatherSeconds = sourceResourceGatherStepSeconds(world, unit, unit.order.resource);
      unit.order.returnSeconds = 0;
      unit.order.path = [];
      unit.order.pathIndex = 0;
      if ((unit.order.resource === "gold" || unit.order.resource === "oil") && world.engineSettings.deselectInMineDefault) {
        world.events.push({ kind: "unit-entered-resource", unitId: unit.id, typeId: unit.typeId, player: unit.player, resource: unit.order.resource });
      }
      return;
    }
    if (unit.order.path.length === 0 || world.tick % sourceOrderRetryTicks(world, 30) === 0) {
      unit.order.path = findPath(world, unit, targetX, targetY);
      unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
      if (unit.order.resource === "wood" && unit.order.tileX !== null && unit.order.tileY !== null && !isReachableWoodTileForUnit(world, unit, unit.order.tileX, unit.order.tileY)) {
        const woodTile = resolveReachableWoodTileForUnit(world, unit, unit.order.tileX, unit.order.tileY);
        if (!woodTile || !issueHarvestWoodOrder(world, unit.id, woodTile.x, woodTile.y)) {
          unit.order = null;
        }
        return;
      }
    }
    stepMoveOrder(world, unit, tickSeconds);
    return;
  }

  if (unit.order.phase === "gathering") {
    unit.order.gatherSeconds -= tickSeconds;
    if (unit.order.gatherSeconds > 0) {
      return;
    }
    const capacity = resourceCapacityForUnit(unit, unit.order.resource);
    const step = Math.min(resourceStepForUnit(unit, unit.order.resource), Math.max(0, capacity - unit.resourcesHeld));
    const gathered = unit.order.resource === "wood" ? harvestWoodStep(world, unit.order.tileX, unit.order.tileY, step) : Math.min(step, target?.resourcesHeld ?? 0);
    if (gathered <= 0) {
      unit.order = null;
      return;
    }
    if (target) {
      const beforeResources = target.resourcesHeld;
      target.resourcesHeld -= gathered;
      if (beforeResources > 0 && target.resourcesHeld <= 0 && (unit.order.resource === "gold" || unit.order.resource === "oil") && world.engineSettings.mineNotificationsDefault) {
        world.events.push({ kind: "resource-depleted", unitId: target.id, typeId: target.typeId, player: unit.player, resource: unit.order.resource });
      }
    }
    if (unit.order.resource === "wood") {
      emitSoundEvent(world, "tree-chopping", unit.player, unit.x, unit.y);
    }
    unit.resourcesHeld = Math.min(capacity, unit.resourcesHeld + gathered);
    unit.carriedResource = unit.order.resource;
    if (unit.resourcesHeld < capacity && (unit.order.resource !== "wood" ? (target?.resourcesHeld ?? 1) > 0 : hasWoodRemaining(world, unit.order.tileX, unit.order.tileY))) {
      unit.order.gatherSeconds = sourceResourceGatherStepSeconds(world, unit, unit.order.resource);
      return;
    }
    if (unit.order.resource === "wood") {
      clearDepletedWoodTile(world, unit.order.tileX, unit.order.tileY);
    }
    const dropoff = sourceResourceOrderDropoff(world, unit);
    const dropoffPoint = dropoff ? resourceDropoffTargetPoint(world, unit, dropoff) : { x: unit.order.dropoffX, y: unit.order.dropoffY };
    unit.order.phase = "to-dropoff";
    unit.order.dropoffX = dropoffPoint.x;
    unit.order.dropoffY = dropoffPoint.y;
    unit.order.targetX = dropoffPoint.x;
    unit.order.targetY = dropoffPoint.y;
    unit.order.path = findPath(world, unit, dropoffPoint.x, dropoffPoint.y);
    unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
    return;
  }

  const latestDropoff = sourceResourceOrderDropoff(world, unit);
  if (!latestDropoff) {
    unit.order = null;
    return;
  }
  if (unit.order.dropoffId !== latestDropoff.id) {
    unit.order.dropoffId = latestDropoff.id;
  }
  const latestDropoffPoint = resourceDropoffTargetPoint(world, unit, latestDropoff);
  if (Math.hypot(unit.order.dropoffX - latestDropoffPoint.x, unit.order.dropoffY - latestDropoffPoint.y) > world.tileSize / 2) {
    unit.order.dropoffX = latestDropoffPoint.x;
    unit.order.dropoffY = latestDropoffPoint.y;
    unit.order.targetX = latestDropoffPoint.x;
    unit.order.targetY = latestDropoffPoint.y;
    unit.order.path = findPath(world, unit, latestDropoffPoint.x, latestDropoffPoint.y);
    unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
  }

  if (isInResourceDropoffRange(world, unit, latestDropoff)) {
    if (unit.resourcesHeld > 0) {
      updateUnitFacing(unit, latestDropoff.x - unit.x, latestDropoff.y - unit.y);
      const delivered = resourceDeliveryAmount(world, unit, unit.order.resource, unit.resourcesHeld);
      addPlayerResource(world, player, unit.order.resource, delivered);
      player.stats ??= createEmptyStats();
      if (unit.order.resource === "gold") {
        player.stats.goldMined += delivered;
      } else if (unit.order.resource === "wood") {
        player.stats.woodHarvested += delivered;
      } else if (unit.order.resource === "oil") {
        player.stats.oilHarvested += delivered;
      }
      unit.resourcesHeld = 0;
      unit.carriedResource = null;
      unit.order.returnSeconds = sourceResourceReturnStepSeconds(world, unit, unit.order.resource);
      unit.order.path = [];
      unit.order.pathIndex = 0;
    }
    unit.order.returnSeconds -= tickSeconds;
    if (unit.order.returnSeconds > 0) {
      return;
    }
    unit.order.returnSeconds = 0;
    if ((target?.resourcesHeld ?? 1) <= 0 || !hasHarvestableTarget(world, unit)) {
      retargetHarvestAfterDelivery(world, unit, unit.order.resource);
      return;
    }
    unit.order.phase = "to-resource";
    unit.order.targetX = targetX;
    unit.order.targetY = targetY;
    unit.order.path = findPath(world, unit, targetX, targetY);
    unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
    return;
  }

  if (unit.order.path.length === 0 || world.tick % sourceOrderRetryTicks(world, 30) === 0) {
    unit.order.path = findPath(world, unit, unit.order.dropoffX, unit.order.dropoffY);
    unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
  }
  stepMoveOrder(world, unit, tickSeconds);
}

function sourceResourceOrderDropoff(world: WorldState, unit: WorldUnit): WorldUnit | undefined {
  if (unit.order?.kind !== "harvest") {
    return undefined;
  }
  const rememberedDropoff = unit.order.dropoffId ? findUnit(world, unit.order.dropoffId) : undefined;
  if (rememberedDropoff && canDropOffResourceAt(world, unit, rememberedDropoff, unit.order.resource)) {
    return rememberedDropoff;
  }
  return findNearestDropoff(world, unit, unit.order.resource);
}

function retargetHarvestAfterDelivery(world: WorldState, unit: WorldUnit, resource: "gold" | "wood" | "oil"): void {
  if (resource === "gold") {
    const mine = findNearestGoldMine(world, unit);
    if (!mine || !issueHarvestOrder(world, unit.id, mine.id)) {
      unit.order = null;
    }
    return;
  }
  if (resource === "wood") {
    const woodTile = unit.order?.kind === "harvest"
      && unit.order.tileX !== null
      && unit.order.tileY !== null
      ? findNearestWoodTileNear(world, unit.order.tileX, unit.order.tileY, 10) ?? findNearestWoodTile(world, unit)
      : findNearestWoodTile(world, unit);
    if (!woodTile || !issueHarvestWoodOrder(world, unit.id, woodTile.x, woodTile.y)) {
      unit.order = null;
    }
    return;
  }
  const platform = findNearestOwnedOilPlatform(world, unit);
  if (!platform || !issueHarvestOilOrder(world, unit.id, platform.id)) {
    unit.order = null;
  }
}

function hasInvalidHarvestOrderState(world: WorldState, unit: WorldUnit): boolean {
  if (unit.order?.kind !== "harvest") {
    return false;
  }
  if (unit.order.phase === "to-dropoff") {
    return unit.resourcesHeld <= 0 || unit.carriedResource !== unit.order.resource;
  }
  if (unit.order.resource === "wood") {
    return unit.order.targetId !== null || unit.order.tileX === null || unit.order.tileY === null || !isSourceHarvestableWoodTile(world, world.tiles[unit.order.tileY * world.map.width + unit.order.tileX] ?? 0);
  }
  if (!unit.order.targetId) {
    return true;
  }
  const target = findUnit(world, unit.order.targetId);
  if (!target || !isLiveResourceSource(target)) {
    return true;
  }
  return unit.order.resource === "gold" ? !isResourceSource(target, "gold") : !isResourceSource(target, "oil") || target.player !== unit.player;
}

function stepMoveOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {
  if (!unit.order || (unit.order.kind !== "move" && unit.order.kind !== "attack" && unit.order.kind !== "attack-move" && unit.order.kind !== "attack-ground" && unit.order.kind !== "spell-cast" && unit.order.kind !== "explore" && unit.order.kind !== "patrol" && unit.order.kind !== "harvest" && unit.order.kind !== "build" && unit.order.kind !== "build-oil-platform" && unit.order.kind !== "repair" && unit.order.kind !== "load-transport" && unit.order.kind !== "follow" && unit.order.kind !== "defend" && unit.order.kind !== "unload-transport")) {
    return;
  }
  if (unit.order.path.length === 0) {
    return;
  }
  const waypoint = unit.order.path[unit.order.pathIndex] ?? unit.order.path[unit.order.path.length - 1];
  const waypointTile = worldToTile(world, waypoint.x, waypoint.y);
  if (!isTilePassable(world, waypointTile.x, waypointTile.y, movementKindForUnit(unit), unit.id)) {
    const path = findPath(world, unit, unit.order.targetX, unit.order.targetY);
    unit.order.path = path;
    unit.order.pathIndex = path.length > 1 ? 1 : 0;
    if (!isUsableReplacementPath(world, unit, path)) {
      stopUnusablePathOrder(world, unit);
      return;
    }
  }
  const nextWaypoint = unit.order.path[unit.order.pathIndex] ?? unit.order.path[unit.order.path.length - 1];
  const dx = nextWaypoint.x - unit.x;
  const dy = nextWaypoint.y - unit.y;
  const distance = Math.hypot(dx, dy);
  updateUnitFacing(unit, dx, dy, tickSeconds);
  if (distance <= Math.max(2, unit.speed * tickSeconds)) {
    unit.x = nextWaypoint.x;
    unit.y = nextWaypoint.y;
    if (unit.order.pathIndex >= unit.order.path.length - 1) {
      if (unit.order.kind === "move" || unit.order.kind === "attack-move") {
        unit.order = null;
        if (unit.moveQueue.length > 0) {
          startNextQueuedMove(world, unit);
        }
      }
    } else {
      unit.order.pathIndex += 1;
    }
    return;
  }

  const step = unit.speed * tickSeconds;
  const nextX = unit.x + (dx / distance) * step;
  const nextY = unit.y + (dy / distance) * step;
  const nextTile = worldToTile(world, nextX, nextY);
  if (!isTilePassable(world, nextTile.x, nextTile.y, movementKindForUnit(unit), unit.id)) {
    const path = findPath(world, unit, unit.order.targetX, unit.order.targetY);
    unit.order.path = path;
    unit.order.pathIndex = path.length > 1 ? 1 : 0;
    if (!isUsableReplacementPath(world, unit, path)) {
      stopUnusablePathOrder(world, unit);
    }
    return;
  }
  unit.x = nextX;
  unit.y = nextY;
}

function isUsableReplacementPath(world: WorldState, unit: WorldUnit, path: Array<{ x: number; y: number }>): boolean {
  if (path.length === 0) {
    return false;
  }
  const next = path[path.length > 1 ? 1 : 0];
  if (!next) {
    return false;
  }
  return Math.hypot(next.x - unit.x, next.y - unit.y) > Math.max(1, world.tileSize / 8);
}

function stopUnusablePathOrder(world: WorldState, unit: WorldUnit): void {
  if (!unit.order || !("path" in unit.order)) {
    return;
  }
  unit.order.path = [];
  unit.order.pathIndex = 0;
  if (unit.order.kind === "move" || unit.order.kind === "attack-move" || unit.order.kind === "explore" || unit.order.kind === "patrol") {
    unit.order = null;
    startNextQueuedMove(world, unit);
  }
}

function stepRandomMovement(world: WorldState, unit: WorldUnit): void {
  if (unit.randomMovementProbability <= 0 || unit.speed <= 0 || unit.construction || unit.cargo.length > 0 || unit.player !== 15) {
    return;
  }
  if (world.tick < unit.nextRandomMoveTick) {
    return;
  }
  unit.nextRandomMoveTick = world.tick + sourceRandomMovementCooldownTicks(world);
  if (!sourceRandomMovementChance(world, unit)) {
    return;
  }
  const hash = Math.abs(deterministicHash(`${unit.id}:${world.tick}:wander`));
  const distance = Math.max(0, Math.floor(unit.randomMovementDistance));
  const span = distance * 2 + 1;
  const offsetTilesX = span > 0 ? hash % span - distance : 0;
  const offsetTilesY = span > 0 ? Math.floor(hash / span) % span - distance : 0;
  const targetX = Math.max(world.tileSize / 2, Math.min(world.map.width * world.tileSize - world.tileSize / 2, unit.x + offsetTilesX * world.tileSize));
  const targetY = Math.max(world.tileSize / 2, Math.min(world.map.height * world.tileSize - world.tileSize / 2, unit.y + offsetTilesY * world.tileSize));
  const path = findPath(world, unit, targetX, targetY);
  if (path.length === 0) {
    return;
  }
  unit.order = {
    kind: "move",
    targetX,
    targetY,
    path,
    pathIndex: path.length > 1 ? 1 : 0
  };
}

function sourceRandomMovementCooldownTicks(world: WorldState): number {
  return sourceOrderRetryTicks(world, 60);
}

function sourceRandomMovementChance(world: WorldState, unit: WorldUnit): boolean {
  const probability = Math.max(0, Math.floor(unit.randomMovementProbability));
  if (probability <= 0) {
    return false;
  }
  const bucket = Math.abs(deterministicHash(`${unit.id}:random-move:${Math.floor(world.tick / sourceOrderRetryTicks(world, 30))}`)) % 100;
  return bucket <= probability;
}

function deterministicChance(world: WorldState, seed: string, probability: number): boolean {
  const bucket = Math.abs(deterministicHash(`${seed}:${Math.floor(world.tick / sourceOrderRetryTicks(world, 30))}`)) % 1000;
  return bucket < Math.max(0, Math.min(1, probability)) * 1000;
}

function deterministicHash(key: string): number {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  }
  return hash;
}

function startNextQueuedMove(world: WorldState, unit: WorldUnit): void {
  while (unit.moveQueue.length > 0) {
    const target = unit.moveQueue.shift();
    if (!target) {
      return;
    }
    if (target.kind === "stand-ground") {
      if (issueHoldPositionOrder(world, unit.id, { clearQueue: false })) {
        return;
      }
      continue;
    }
    if (target.kind === "explore") {
      if (issueExploreOrder(world, unit.id, { clearQueue: false })) {
        return;
      }
      continue;
    }
    if (target.kind === "follow") {
      const followTarget = findUnit(world, target.targetId);
      if (!followTarget || !canIssueFollowTarget(world, unit, followTarget)) {
        continue;
      }
      const path = findPath(world, unit, followTarget.x, followTarget.y);
      unit.order = {
        kind: "follow",
        targetId: followTarget.id,
        attackTargetId: null,
        followRange: 1,
        targetX: followTarget.x,
        targetY: followTarget.y,
        path,
        pathIndex: path.length > 1 ? 1 : 0
      };
      return;
    }
    if (target.kind === "defend") {
      const defendTarget = findUnit(world, target.targetId);
      if (!defendTarget || !canIssueDefendTarget(world, unit, defendTarget)) {
        continue;
      }
      const path = canReceiveMoveOrders(unit) ? findFollowPathWithinSourceRange(world, unit, defendTarget, 1) : [];
      unit.order = {
        kind: "defend",
        targetId: defendTarget.id,
        defendState: "moving",
        defendRange: 1,
        targetX: defendTarget.x,
        targetY: defendTarget.y,
        path,
        pathIndex: path.length > 1 ? 1 : 0
      };
      return;
    }
    if (target.kind === "load-transport") {
      const transport = findUnit(world, target.targetId);
      if (!transport || !canTargetTransportForLoading(transport, unit)) {
        continue;
      }
      const path = findPath(world, unit, transport.x, transport.y);
      if (path.length === 0 && !canLoadIntoTransport(transport, unit)) {
        continue;
      }
      unit.order = {
        kind: "load-transport",
        targetId: transport.id,
        boardState: "move",
        boardRange: 1,
        boardWaitTicks: 0,
        targetX: transport.x,
        targetY: transport.y,
        path,
        pathIndex: path.length > 1 ? 1 : 0
      };
      return;
    }
    if (target.kind === "repair") {
      const repairTarget = findUnit(world, target.targetId);
      if (!repairTarget || !canRepairTarget(unit, repairTarget, world)) {
        continue;
      }
      const path = findPath(world, unit, repairTarget.x, repairTarget.y);
      if (path.length === 0 && !isInRepairRange(unit, repairTarget)) {
        continue;
      }
      if (repairTarget.construction) {
        if (repairTarget.construction.builderInside) {
          continue;
        }
        const previousBuilder = repairTarget.construction.builderId ? findUnit(world, repairTarget.construction.builderId) : undefined;
        if (previousBuilder && previousBuilder.id !== unit.id && previousBuilder.order?.kind === "build" && previousBuilder.order.targetId === repairTarget.id) {
          previousBuilder.order = null;
        }
        repairTarget.construction.builderId = unit.id;
        unit.order = {
          kind: "build",
          targetId: repairTarget.id,
          targetX: repairTarget.x,
          targetY: repairTarget.y,
          buildCycle: 0,
          path,
          pathIndex: path.length > 1 ? 1 : 0
        };
        return;
      }
      unit.order = {
        kind: "repair",
        targetId: repairTarget.id,
        targetX: repairTarget.x,
        targetY: repairTarget.y,
        repairCycle: 0,
        path,
        pathIndex: path.length > 1 ? 1 : 0
      };
      return;
    }
    if (target.kind === "harvest") {
      const resourceTarget = findUnit(world, target.targetId);
      const resource = resourceTarget && isGoldMine(resourceTarget) ? "gold" : resourceTarget && isOilPlatform(resourceTarget) ? "oil" : null;
      if (!resourceTarget || resource !== target.resource || !canIssueQueueHarvestTarget(world, unit, resourceTarget)) {
        continue;
      }
      const dropoff = resource === "oil" ? findNearestOilDropoff(world, unit) : findNearestDropoff(world, unit, "gold");
      if (!dropoff) {
        continue;
      }
      const path = findPath(world, unit, resourceTarget.x, resourceTarget.y);
      if (path.length === 0 && !isInResourceRangePoint(unit, resourceTarget.x, resourceTarget.y, resourceTarget.radius)) {
        continue;
      }
      const dropoffPoint = resourceDropoffTargetPoint(world, unit, dropoff);
      unit.order = {
        kind: "harvest",
        targetId: resourceTarget.id,
        resource,
        phase: "to-resource",
        targetX: resourceTarget.x,
        targetY: resourceTarget.y,
        tileX: null,
        tileY: null,
        dropoffId: dropoff.id,
        dropoffX: dropoffPoint.x,
        dropoffY: dropoffPoint.y,
        gatherSeconds: 0,
        returnSeconds: 0,
        path,
        pathIndex: path.length > 1 ? 1 : 0
      };
      return;
    }
    if (target.kind === "harvest-wood") {
      if (!canIssueQueueHarvestWoodAt(world, unit, target.tileX, target.tileY)) {
        continue;
      }
      const dropoff = findNearestDropoff(world, unit, "wood");
      if (!dropoff) {
        continue;
      }
      const woodTarget = tileToWorldCenter(world, target.tileX, target.tileY);
      const path = findPath(world, unit, woodTarget.x, woodTarget.y);
      if (path.length === 0 && Math.hypot(woodTarget.x - unit.x, woodTarget.y - unit.y) > world.tileSize + unit.radius) {
        continue;
      }
      const dropoffPoint = resourceDropoffTargetPoint(world, unit, dropoff);
      unit.order = {
        kind: "harvest",
        targetId: null,
        resource: "wood",
        phase: "to-resource",
        targetX: woodTarget.x,
        targetY: woodTarget.y,
        tileX: target.tileX,
        tileY: target.tileY,
        dropoffId: dropoff.id,
        dropoffX: dropoffPoint.x,
        dropoffY: dropoffPoint.y,
        gatherSeconds: 0,
        returnSeconds: 0,
        path,
        pathIndex: path.length > 1 ? 1 : 0
      };
      return;
    }
    if (target.kind === "return-goods") {
      if (unit.resourcesHeld <= 0 || unit.carriedResource !== target.resource) {
        continue;
      }
      const dropoff = target.targetId ? findUnit(world, target.targetId) : findNearestDropoff(world, unit, target.resource);
      if (!dropoff || !canDropOffResourceAt(world, unit, dropoff, target.resource)) {
        continue;
      }
      const dropoffPoint = resourceDropoffTargetPoint(world, unit, dropoff);
      const path = findPath(world, unit, dropoffPoint.x, dropoffPoint.y);
      if (path.length === 0 && !isInResourceDropoffRange(world, unit, dropoff)) {
        continue;
      }
      unit.order = {
        kind: "harvest",
        targetId: null,
        resource: target.resource,
        phase: "to-dropoff",
        targetX: dropoffPoint.x,
        targetY: dropoffPoint.y,
        tileX: null,
        tileY: null,
        dropoffId: dropoff.id,
        dropoffX: dropoffPoint.x,
        dropoffY: dropoffPoint.y,
        gatherSeconds: 0,
        returnSeconds: 0,
        path,
        pathIndex: path.length > 1 ? 1 : 0
      };
      return;
    }
    if (target.kind === "attack-target") {
      const attackTarget = findUnit(world, target.targetId);
      if (!attackTarget || !canIssueAttackTarget(world, unit, attackTarget)) {
        continue;
      }
      const inRange = isInAttackRange(unit, attackTarget, world);
      const path = inRange ? [] : findPath(world, unit, attackTarget.x, attackTarget.y);
      if (!inRange && path.length === 0) {
        continue;
      }
      unit.order = {
        kind: "attack",
        targetId: attackTarget.id,
        targetX: attackTarget.x,
        targetY: attackTarget.y,
        path,
        pathIndex: path.length > 1 ? 1 : 0
      };
      return;
    }
    if (target.kind === "spell-cast") {
      const command = target.command;
      if (!isTargetedSpellCommand(command) || targetedSpellIdForCommand(world, command) !== target.spellId || !canCastTargetedSpellCommand(world, unit, command)) {
        continue;
      }
      if (isPointInSpellRange(world, unit, target.x, target.y, target.spellRange)) {
        issueTargetedSpellOrderInternal(world, unit.id, command, target.x, target.y, false);
        return;
      }
      if (!canReceiveMoveOrders(unit)) {
        continue;
      }
      const path = findSpellCastPathWithinSourceRange(world, unit, target.x, target.y, target.spellRange);
      if (path.length === 0) {
        continue;
      }
      unit.order = {
        kind: "spell-cast",
        command,
        spellId: target.spellId,
        spellRange: target.spellRange,
        targetX: target.x,
        targetY: target.y,
        spellState: "move",
        path,
        pathIndex: path.length > 1 ? 1 : 0
      };
      return;
    }
    if (target.kind === "build") {
      if (startQueuedBuildAtOrder(world, unit, target.buildingTypeId, target.x, target.y)) {
        return;
      }
      continue;
    }
    if (target.kind === "build-oil-platform") {
      if (startQueuedBuildOilPlatformOrder(world, unit, target.targetId)) {
        return;
      }
      continue;
    }
    if (target.kind === "attack-ground") {
      if (!canAttackGround(unit)) {
        continue;
      }
      const inRange = isGroundTargetInRange(world, unit, target.x, target.y);
      const path = inRange ? [] : findPath(world, unit, target.x, target.y);
      if (!inRange && path.length === 0) {
        continue;
      }
      unit.order = {
        kind: "attack-ground",
        targetX: target.x,
        targetY: target.y,
        path,
        pathIndex: path.length > 1 ? 1 : 0
      };
      return;
    }
    if (target.kind === "unload-transport") {
      if (!canIssueUnloadTransport(unit)) {
        continue;
      }
      const dropZone = closestFreeDropZone(world, unit, worldToTile(world, target.x, target.y), SOURCE_UNLOAD_DROPZONE_MAX_RANGE, target.cargoUnitId ?? null);
      if (!dropZone) {
        continue;
      }
      const dropZonePoint = tileToWorldCenter(world, dropZone.x, dropZone.y);
      const path = findPath(world, unit, dropZonePoint.x, dropZonePoint.y);
      if (path.length === 0) {
        continue;
      }
      const finalWaypoint = path[path.length - 1];
      if (Math.hypot(unit.x - finalWaypoint.x, unit.y - finalWaypoint.y) <= world.tileSize * 1.25) {
        if (unloadTransportCargoNear(world, unit, dropZone, target.cargoUnitId ?? null)) {
          continue;
        }
      }
      unit.order = {
        kind: "unload-transport",
        unloadCargoUnitId: target.cargoUnitId ?? null,
        unloadState: "move",
        unloadRetries: 0,
        targetX: dropZonePoint.x,
        targetY: dropZonePoint.y,
        path,
        pathIndex: path.length > 1 ? 1 : 0
      };
      return;
    }
    const path = findPath(world, unit, target.x, target.y);
    if (path.length === 0) {
      continue;
    }
    if (target.kind === "attack-move") {
      unit.order = {
        kind: "attack-move",
        targetId: null,
        targetX: path[path.length - 1].x,
        targetY: path[path.length - 1].y,
        path,
        pathIndex: path.length > 1 ? 1 : 0
      };
      return;
    }
    if (target.kind === "patrol") {
      unit.order = {
        kind: "patrol",
        targetId: null,
        anchorX: unit.x,
        anchorY: unit.y,
        targetX: path.at(-1)?.x ?? target.x,
        targetY: path.at(-1)?.y ?? target.y,
        patrolX: path.at(-1)?.x ?? target.x,
        patrolY: path.at(-1)?.y ?? target.y,
        returning: false,
        patrolRange: 0,
        patrolWaitingCycle: 0,
        path,
        pathIndex: path.length > 1 ? 1 : 0
      };
      return;
    }
    unit.order = {
      kind: "move",
      targetX: path[path.length - 1].x,
      targetY: path[path.length - 1].y,
      path,
      pathIndex: path.length > 1 ? 1 : 0
    };
    return;
  }
  unit.order = null;
}

function canReachQueuedDestination(world: WorldState, unit: WorldUnit, x: number, y: number): boolean {
  const origin = queuedPathOrigin(unit);
  const pathingUnit = origin ? { ...unit, x: origin.x, y: origin.y } : unit;
  return findPath(world, pathingUnit, x, y).length > 0;
}

function queuedPathOrigin(unit: WorldUnit): { x: number; y: number } | null {
  const lastQueued = unit.moveQueue.at(-1);
  if (lastQueued) {
    return { x: lastQueued.x, y: lastQueued.y };
  }
  if (unit.order && (unit.order.kind === "move" || unit.order.kind === "attack-move" || unit.order.kind === "patrol")) {
    return { x: unit.order.targetX, y: unit.order.targetY };
  }
  return null;
}

function findUnit(world: WorldState, unitId: string): WorldUnit | undefined {
  return world.units.find((unit) => unit.id === unitId);
}

export function canReceiveMoveOrders(unit: WorldUnit): boolean {
  return unit.hitPoints > 0 && !isUnitHiddenInConstruction(unit) && !unit.construction && (unit.kind === "land" || unit.kind === "naval" || unit.kind === "fly");
}

function findVisibleEnemyAt(world: WorldState, unitId: string, x: number, y: number): WorldUnit | undefined {
  const unit = findUnit(world, unitId);
  if (!unit) {
    return undefined;
  }
  return findVisibleEnemyNearPointForUnit(world, unit, x, y);
}

function findVisibleEnemyNearPointForUnit(world: WorldState, unit: WorldUnit, x: number, y: number): WorldUnit | undefined {
  return world.units
    .filter((candidate) => {
      if (candidate.id === unit.id || candidate.hitPoints <= 0 || !arePlayersEnemies(world, unit.player, candidate.player)) {
        return false;
      }
      if (!isUnitVisibleToPlayer(world, candidate, unit.player)) {
        return false;
      }
      return Math.hypot(candidate.x - x, candidate.y - y) <= Math.max(candidate.radius + 12, 24);
    })
    .sort((a, b) => distanceSquared({ x, y }, a) - distanceSquared({ x, y }, b))[0];
}

function findVisibleUnitAtForPlayer(world: WorldState, x: number, y: number, playerId: number): WorldUnit | undefined {
  return world.units
    .filter((candidate) => candidate.hitPoints > 0
      && !isInvisibleUtilityUnit(candidate)
      && !isUnitInsideResourceSource(candidate)
      && isUnitVisibleToPlayer(world, candidate, playerId)
      && pointHitsUnitFootprint(world, candidate, x, y))
    .sort((a, b) => a.radius - b.radius)[0];
}

function findResourceAt(world: WorldState, x: number, y: number, playerId: number): WorldUnit | undefined {
  return world.units.find((candidate) => (
    (isGoldMine(candidate) || isOilPatch(candidate) || isOilPlatform(candidate))
    && isVisibleResourceSource(world, candidate, playerId)
    && pointHitsUnitFootprint(world, candidate, x, y)
  ));
}

function findVisibleOilPatchAtForPlayer(world: WorldState, x: number, y: number, playerId: number): WorldUnit | undefined {
  return world.units
    .filter((candidate) => isOilPatch(candidate) && isVisibleResourceSource(world, candidate, playerId) && pointHitsUnitFootprint(world, candidate, x, y))
    .sort((a, b) => distanceSquared({ x, y }, a) - distanceSquared({ x, y }, b))[0];
}

export function findVisibleOilPatchAt(world: WorldState, x: number, y: number, playerId = world.visibilityPlayer): WorldUnit | undefined {
  return findVisibleOilPatchAtForPlayer(world, x, y, playerId);
}

function pointHitsUnitFootprint(world: WorldState, unit: WorldUnit, x: number, y: number): boolean {
  const { halfWidth, halfHeight } = unitFootprintHalfSize(unit, world.tileSize);
  return x >= unit.x - halfWidth && x <= unit.x + halfWidth && y >= unit.y - halfHeight && y <= unit.y + halfHeight;
}

function findFriendlyRepairTargetAt(world: WorldState, worker: WorldUnit, x: number, y: number): WorldUnit | undefined {
  if (!canRepairUnit(worker)) {
    return undefined;
  }
  return world.units
    .filter((candidate) => canRepairTarget(worker, candidate, world))
    .filter((candidate) => {
      const { halfWidth, halfHeight } = unitFootprintHalfSize(candidate, world.tileSize);
      return x >= candidate.x - halfWidth && x <= candidate.x + halfWidth && y >= candidate.y - halfHeight && y <= candidate.y + halfHeight;
    })
    .sort((a, b) => distanceSquared({ x, y }, a) - distanceSquared({ x, y }, b))[0];
}

function findFriendlyDropoffAt(world: WorldState, unit: WorldUnit, x: number, y: number): WorldUnit | undefined {
  if (unit.resourcesHeld <= 0 || !isHarvestResource(unit.carriedResource)) {
    return undefined;
  }
  return world.units
    .filter((candidate) => canDropOffResourceAt(world, unit, candidate, unit.carriedResource))
    .filter((candidate) => {
      const { halfWidth, halfHeight } = unitFootprintHalfSize(candidate, world.tileSize);
      return x >= candidate.x - halfWidth && x <= candidate.x + halfWidth && y >= candidate.y - halfHeight && y <= candidate.y + halfHeight;
    })
    .sort((a, b) => distanceSquared({ x, y }, a) - distanceSquared({ x, y }, b))[0];
}

function findFriendlyTransportAt(world: WorldState, unit: WorldUnit, x: number, y: number): WorldUnit | undefined {
  return world.units
    .filter((candidate) => canTargetTransportForLoading(candidate, unit))
    .filter((candidate) => {
      const { halfWidth, halfHeight } = unitFootprintHalfSize(candidate, world.tileSize);
      return x >= candidate.x - halfWidth && x <= candidate.x + halfWidth && y >= candidate.y - halfHeight && y <= candidate.y + halfHeight;
    })
    .sort((a, b) => distanceSquared({ x, y }, a) - distanceSquared({ x, y }, b))[0];
}

function findFriendlyFollowTargetAt(world: WorldState, unit: WorldUnit, x: number, y: number): WorldUnit | undefined {
  if (!canReceiveMoveOrders(unit)) {
    return undefined;
  }
  return world.units
    .filter((candidate) => canTargetFollow(unit, candidate, world))
    .filter((candidate) => pointHitsUnitFootprint(world, candidate, x, y))
    .sort((a, b) => distanceSquared({ x, y }, a) - distanceSquared({ x, y }, b))[0];
}

function findNearestGoldMine(world: WorldState, unit: WorldUnit): WorldUnit | undefined {
  return world.units
    .filter((candidate) => isResourceSource(candidate, "gold") && isVisibleResourceSource(world, candidate, unit.player))
    .sort((a, b) => distanceSquared(unit, a) - distanceSquared(unit, b))[0];
}

function hasOilOnMap(world: WorldState): boolean {
  return world.units.some((unit) => (isOilPatch(unit) || isResourceSource(unit, "oil")) && isLiveResourceSource(unit));
}

function findNearestOilPatch(world: WorldState, unit: WorldUnit): WorldUnit | undefined {
  return world.units
    .filter((candidate) => isOilPatch(candidate) && isVisibleResourceSource(world, candidate, unit.player))
    .sort((a, b) => distanceSquared(unit, a) - distanceSquared(unit, b))[0];
}

function findNearestBuildableOilPatch(world: WorldState, unit: WorldUnit, unitDefinitions: WargusUnit[] = world.unitDefinitions): WorldUnit | undefined {
  return world.units
    .filter((candidate) => isOilPatch(candidate) && isVisibleResourceSource(world, candidate, unit.player))
    .filter((candidate) => canIssueBuildOilPlatformAt(world, unit, candidate, unitDefinitions))
    .sort((a, b) => distanceSquared(unit, a) - distanceSquared(unit, b))[0];
}

function findNearestOwnedOilPlatform(world: WorldState, unit: WorldUnit): WorldUnit | undefined {
  return world.units
    .filter((candidate) => candidate.player === unit.player && isOilPlatform(candidate) && !candidate.construction && isVisibleResourceSource(world, candidate, unit.player))
    .sort((a, b) => distanceSquared(unit, a) - distanceSquared(unit, b))[0];
}

function findNearestDropoff(world: WorldState, unit: WorldUnit, resource: string): WorldUnit | undefined {
  if (resource === "oil") {
    return findNearestOilDropoff(world, unit);
  }
  const buildings = world.units
    .filter((candidate) => canUseResourceDeposit(world, unit, candidate) && candidate.hitPoints > 0 && !candidate.construction)
    .filter((candidate) => canStoreResource(candidate, resource));
  return nearestReachableDropoff(world, unit, buildings);
}

function canDropOffResourceAt(world: WorldState, unit: WorldUnit, dropoff: WorldUnit, resource: string | null): resource is "gold" | "wood" | "oil" {
  if (!isHarvestResource(resource) || !canUseResourceDeposit(world, unit, dropoff) || dropoff.hitPoints <= 0 || dropoff.construction) {
    return false;
  }
  return canStoreResource(dropoff, resource);
}

function canUseResourceDeposit(world: WorldState, unit: WorldUnit, dropoff: WorldUnit): boolean {
  return dropoff.player === unit.player
    || (world.engineSettings.allyDepositsAllowedDefault
      && arePlayersMutuallyAllied(world, unit.player, dropoff.player));
}

function isHarvestResource(resource: string | null): resource is "gold" | "wood" | "oil" {
  return resource === "gold" || resource === "wood" || resource === "oil";
}

function findNearestWoodTile(world: WorldState, unit: WorldUnit): { x: number; y: number } | null {
  const centerX = Math.floor(unit.x / world.tileSize);
  const centerY = Math.floor(unit.y / world.tileSize);
  return findNearestWoodTileNear(world, centerX, centerY, 18);
}

function findNearestReachableWoodTileForUnit(world: WorldState, unit: WorldUnit, maxRadius: number): { x: number; y: number } | null {
  const centerX = Math.floor(unit.x / world.tileSize);
  const centerY = Math.floor(unit.y / world.tileSize);
  return findNearestReachableWoodTileNear(world, unit, centerX, centerY, maxRadius);
}

function resolveReachableWoodTileForUnit(world: WorldState, unit: WorldUnit, tileX: number, tileY: number): { x: number; y: number } | null {
  if (isReachableWoodTileForUnit(world, unit, tileX, tileY)) {
    return { x: tileX, y: tileY };
  }
  return findNearestReachableWoodTileNear(world, unit, tileX, tileY, 18) ?? findNearestReachableWoodTileForUnit(world, unit, 32);
}

function findNearestReachableWoodTileNear(world: WorldState, unit: WorldUnit, centerX: number, centerY: number, maxRadius: number): { x: number; y: number } | null {
  for (let radius = 0; radius <= maxRadius; radius += 1) {
    let best: { x: number; y: number; score: number } | null = null;
    for (let y = centerY - radius; y <= centerY + radius; y += 1) {
      for (let x = centerX - radius; x <= centerX + radius; x += 1) {
        const onRing = radius === 0 || x === centerX - radius || x === centerX + radius || y === centerY - radius || y === centerY + radius;
        if (!onRing || x < 0 || y < 0 || x >= world.map.width || y >= world.map.height) {
          continue;
        }
        if (!isReachableWoodTileForUnit(world, unit, x, y)) {
          continue;
        }
        const score = (x - centerX) ** 2 + (y - centerY) ** 2 + Math.hypot(x * world.tileSize + world.tileSize / 2 - unit.x, y * world.tileSize + world.tileSize / 2 - unit.y) / world.tileSize;
        if (!best || score < best.score) {
          best = { x, y, score };
        }
      }
    }
    if (best) {
      return { x: best.x, y: best.y };
    }
  }
  return null;
}

function isReachableWoodTileForUnit(world: WorldState, unit: WorldUnit, tileX: number, tileY: number): boolean {
  if (!isSourceHarvestableWoodTile(world, world.tiles[tileY * world.map.width + tileX] ?? 0)) {
    return false;
  }
  const target = tileToWorldCenter(world, tileX, tileY);
  if (Math.hypot(target.x - unit.x, target.y - unit.y) <= world.tileSize + unit.radius) {
    return true;
  }
  const path = findPath(world, unit, target.x, target.y);
  const endpoint = path[path.length - 1];
  return Boolean(endpoint && Math.hypot(target.x - endpoint.x, target.y - endpoint.y) <= world.tileSize + unit.radius);
}

function findNearestWoodTileNear(world: WorldState, centerX: number, centerY: number, maxRadius: number): { x: number; y: number } | null {
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    let best: { x: number; y: number; score: number } | null = null;
    for (let y = centerY - radius; y <= centerY + radius; y += 1) {
      for (let x = centerX - radius; x <= centerX + radius; x += 1) {
        const onRing = x === centerX - radius || x === centerX + radius || y === centerY - radius || y === centerY + radius;
        if (!onRing || x < 0 || y < 0 || x >= world.map.width || y >= world.map.height) {
          continue;
        }
        if (!isSourceHarvestableWoodTile(world, world.tiles[y * world.map.width + x] ?? 0)) {
          continue;
        }
        const score = (x - centerX) ** 2 + (y - centerY) ** 2;
        if (!best || score < best.score) {
          best = { x, y, score };
        }
      }
    }
    if (best) {
      return { x: best.x, y: best.y };
    }
  }
  return null;
}

function distanceSquared(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function isWorker(unit: WorldUnit): boolean {
  return canGatherResource(unit, "gold") || canGatherResource(unit, "wood");
}

export function canRepairUnit(unit: WorldUnit): boolean {
  return unit.hitPoints > 0 && !isUnitHiddenInConstruction(unit) && !unit.construction && unit.repairRange > 0 && isWorker(unit);
}

export function canRepairTarget(worker: WorldUnit, target: WorldUnit, world?: WorldState): boolean {
  const canRepairPlayer = world
    ? worker.player === target.player || arePlayersAllied(world, worker.player, target.player)
    : worker.player === target.player;
  return canRepairUnit(worker)
    && canRepairPlayer
    && target.id !== worker.id
    && target.hitPoints > 0
    && target.hitPoints < target.maxHitPoints
    && target.repairHp > 0
    && (world ? isUnitVisibleToPlayer(world, target, worker.player) : true);
}

function isBuildingLike(unit: WorldUnit): boolean {
  return unit.speed === 0 || unit.tileWidth > 1 || unit.tileHeight > 1;
}

function isGoldMine(unit: WorldUnit): boolean {
  return isResourceSource(unit, "gold");
}

function isOilPatch(unit: WorldUnit): boolean {
  return isSourceResourcePatchDefinition(unit, "oil");
}

function isOilPlatform(unit: WorldUnit): boolean {
  return isSourceResourceSiteDefinition(unit) && isResourceSource(unit, "oil");
}

function canGatherResource(unit: WorldUnit, resource: string): boolean {
  return unit.gatherResources.includes(resource);
}

function canStoreResource(unit: WorldUnit, resource: string): boolean {
  return unit.storesResources.includes(resource);
}

function isResourceSource(unit: WorldUnit, resource: string): boolean {
  return unit.givesResource === resource;
}

function isLiveResourceSource(unit: WorldUnit): boolean {
  return unit.hitPoints > 0 && unit.resourcesHeld > 0;
}

function isVisibleResourceSource(world: WorldState, unit: WorldUnit, playerId: number): boolean {
  return isLiveResourceSource(unit) && isUnitVisibleToPlayer(world, unit, playerId);
}

function isOilRefinery(unit: WorldUnit): boolean {
  return canStoreResource(unit, "oil") && (unit.improveProduction.oil ?? 0) > 0;
}

function isFoundry(world: WorldState, unit: WorldUnit): boolean {
  return sourceResearchProducerHasUpgradeFamily(world, unit, (upgradeId) => isShipUpgradeId(world, upgradeId))
    ?? (unit.shoreBuilding && !canStoreResource(unit, "oil"));
}

function isOilTanker(unit: WorldUnit): boolean {
  return canGatherResource(unit, "oil");
}

function findNearestOilDropoff(world: WorldState, unit: WorldUnit): WorldUnit | undefined {
  const buildings = world.units
    .filter((candidate) => canUseResourceDeposit(world, unit, candidate) && candidate.hitPoints > 0 && !candidate.construction && canStoreResource(candidate, "oil"))
    .sort((a, b) => distanceSquared(unit, a) - distanceSquared(unit, b));
  return nearestReachableDropoff(world, unit, buildings);
}

function nearestReachableDropoff(world: WorldState, unit: WorldUnit, buildings: WorldUnit[]): WorldUnit | undefined {
  const sortedBuildings = [...buildings].sort((a, b) => distanceSquared(unit, a) - distanceSquared(unit, b));
  return sortedBuildings.find((building) => {
    if (isInResourceDropoffRange(world, unit, building)) {
      return true;
    }
    const point = resourceDropoffTargetPoint(world, unit, building);
    return findPath(world, unit, point.x, point.y).length > 0;
  });
}

function resourceDropoffTargetPoint(world: WorldState, unit: WorldUnit, dropoff: WorldUnit): { x: number; y: number } {
  const { halfWidth, halfHeight } = unitFootprintHalfSize(dropoff, world.tileSize);
  const minTileX = Math.floor((dropoff.x - halfWidth) / world.tileSize);
  const maxTileX = Math.floor((dropoff.x + halfWidth - 1) / world.tileSize);
  const minTileY = Math.floor((dropoff.y - halfHeight) / world.tileSize);
  const maxTileY = Math.floor((dropoff.y + halfHeight - 1) / world.tileSize);
  const candidates: Array<{ x: number; y: number; distance: number }> = [];
  for (let tileY = minTileY - 1; tileY <= maxTileY + 1; tileY += 1) {
    for (let tileX = minTileX - 1; tileX <= maxTileX + 1; tileX += 1) {
      const onPerimeter = tileX < minTileX || tileX > maxTileX || tileY < minTileY || tileY > maxTileY;
      if (!onPerimeter || tileX < 0 || tileY < 0 || tileX >= world.map.width || tileY >= world.map.height) {
        continue;
      }
      if (!isTilePassable(world, tileX, tileY, movementKindForUnit(unit), unit.id)) {
        continue;
      }
      const point = tileToWorldCenter(world, tileX, tileY);
      candidates.push({ ...point, distance: distanceSquared(unit, point) });
    }
  }
  candidates.sort((left, right) => left.distance - right.distance);
  for (const candidate of candidates) {
    if (findPath(world, unit, candidate.x, candidate.y).length > 0 || Math.hypot(candidate.x - unit.x, candidate.y - unit.y) <= world.tileSize) {
      return { x: candidate.x, y: candidate.y };
    }
  }
  return { x: dropoff.x, y: dropoff.y };
}

function isInResourceDropoffRange(world: WorldState, unit: WorldUnit, dropoff: WorldUnit): boolean {
  if (isInTouchRange(unit, dropoff)) {
    return true;
  }
  const { halfWidth, halfHeight } = unitFootprintHalfSize(dropoff, world.tileSize);
  const clampedX = Math.max(dropoff.x - halfWidth, Math.min(unit.x, dropoff.x + halfWidth));
  const clampedY = Math.max(dropoff.y - halfHeight, Math.min(unit.y, dropoff.y + halfHeight));
  return Math.hypot(unit.x - clampedX, unit.y - clampedY) <= unit.radius + world.tileSize * 0.55;
}

function resourceDeliveryAmount(world: WorldState, unit: WorldUnit, resource: "gold" | "wood" | "oil", carried: number): number {
  const defaultIncome = sourceDefaultIncomePercent(world, resource);
  const bonusPercent = completedProductionBonusPercent(world, unit.player, resource);
  return Math.floor(carried * Math.max(defaultIncome, defaultIncome + bonusPercent) / 100);
}

function sourceDefaultIncomePercent(world: WorldState, resource: "gold" | "wood" | "oil"): number {
  const resourceIndex = world.engineSettings.defaultResourceNames.indexOf(resource);
  const income = resourceIndex >= 0 ? world.engineSettings.defaultIncomes[resourceIndex] : undefined;
  return typeof income === "number" && Number.isFinite(income) ? Math.max(0, Math.floor(income)) : 100;
}

function completedProductionBonusPercent(world: WorldState, playerId: number, resource: "gold" | "wood" | "oil"): number {
  return world.units
    .filter((unit) => unit.player === playerId && !unit.construction && unit.hitPoints > 0)
    .reduce((best, unit) => Math.max(best, unit.improveProduction[resource] ?? 0), 0);
}

function isInTouchRange(unit: WorldUnit, target: WorldUnit): boolean {
  return Math.hypot(target.x - unit.x, target.y - unit.y) <= unit.radius + target.radius + 10;
}

function isInRepairRange(unit: WorldUnit, target: WorldUnit): boolean {
  return Math.hypot(target.x - unit.x, target.y - unit.y) <= unit.radius + target.radius + Math.max(10, unit.repairRange);
}

function isInFollowRange(unit: WorldUnit, target: WorldUnit): boolean {
  return Math.hypot(target.x - unit.x, target.y - unit.y) <= Math.max(64, unit.radius + target.radius + 36);
}

export function canTargetFollow(unit: WorldUnit, target: WorldUnit, world?: WorldState): boolean {
  const canFollowPlayer = world
    ? unit.player === target.player || target.player === 15 || arePlayersAllied(world, unit.player, target.player)
    : unit.player === target.player;
  return unit.id !== target.id
    && canFollowPlayer
    && unit.hitPoints > 0
    && target.hitPoints > 0
    && canReceiveMoveOrders(unit)
    && (canReceiveMoveOrders(target) || isReadySourceTeleporter(target));
}

function isReadySourceTeleporter(unit: WorldUnit): boolean {
  return unit.teleporter && !unit.construction && unit.hitPoints > 0;
}

function isInResourceRange(world: WorldState, unit: WorldUnit): boolean {
  if (unit.order?.kind !== "harvest") {
    return false;
  }
  if (unit.order.targetId) {
    const target = findUnit(world, unit.order.targetId);
    return target ? isInTouchRange(unit, target) : false;
  }
  return Math.hypot(unit.order.targetX - unit.x, unit.order.targetY - unit.y) <= world.tileSize + unit.radius;
}

function isInResourceRangePoint(unit: WorldUnit, x: number, y: number, radius: number): boolean {
  return Math.hypot(x - unit.x, y - unit.y) <= unit.radius + radius + 10;
}

function hasHarvestableTarget(world: WorldState, unit: WorldUnit): boolean {
  if (unit.order?.kind !== "harvest") {
    return false;
  }
  if (unit.order.targetId) {
    const target = findUnit(world, unit.order.targetId);
    return Boolean(target && isLiveResourceSource(target));
  }
  if (unit.order.tileX === null || unit.order.tileY === null) {
    return false;
  }
  return isSourceHarvestableWoodTile(world, world.tiles[unit.order.tileY * world.map.width + unit.order.tileX] ?? 0);
}

function harvestWoodStep(world: WorldState, tileX: number | null, tileY: number | null, amount: number): number {
  if (tileX === null || tileY === null) {
    return 0;
  }
  const index = tileY * world.map.width + tileX;
  if (!isSourceHarvestableWoodTile(world, world.tiles[index] ?? 0)) {
    return 0;
  }
  const resource = forestResourceForTile(world, tileX, tileY);
  if (!resource || resource.amount <= 0) {
    clearDepletedWoodTile(world, tileX, tileY);
    return 0;
  }
  const gathered = Math.min(Math.max(0, Math.floor(amount)), resource.amount);
  resource.amount -= gathered;
  if (resource.amount <= 0) {
    clearDepletedWoodTile(world, tileX, tileY);
  }
  return gathered;
}

function clearDepletedWoodTile(world: WorldState, tileX: number | null, tileY: number | null): boolean {
  if (tileX === null || tileY === null) {
    return false;
  }
  const index = tileY * world.map.width + tileX;
  const harvestedTile = world.tiles[index] ?? 0;
  if (!isSourceHarvestableWoodTile(world, harvestedTile)) {
    return false;
  }
  world.tiles[index] = SOURCE_REMOVED_TREE_TILE;
  fixSourceForestNeighbors(world, tileX, tileY);
  world.terrainVersion += 1;
  world.forestResources = (world.forestResources ?? []).filter((entry) => entry.x !== tileX || entry.y !== tileY);
  scheduleForestRegrowth(world, tileX, tileY, harvestedTile);
  return true;
}

const SOURCE_TOP_ONE_TREE_TILE = 121;
const SOURCE_MID_ONE_TREE_TILE = 122;
const SOURCE_BOT_ONE_TREE_TILE = 123;
const SOURCE_REMOVED_TREE_TILE = 126;
const SOURCE_SOLID_FOREST_TILE = 0x70;
const SOURCE_MIXED_FOREST_BASE_TILE = 0x700;
const SOURCE_WOOD_TABLE = [
  -1,
  SOURCE_MIXED_FOREST_BASE_TILE + 0x30,
  SOURCE_MIXED_FOREST_BASE_TILE + 0x70,
  SOURCE_MIXED_FOREST_BASE_TILE + 0xb0,
  SOURCE_MIXED_FOREST_BASE_TILE + 0x10,
  SOURCE_MIXED_FOREST_BASE_TILE + 0x50,
  SOURCE_MIXED_FOREST_BASE_TILE + 0x90,
  SOURCE_MIXED_FOREST_BASE_TILE + 0xd0,
  SOURCE_MIXED_FOREST_BASE_TILE + 0x00,
  SOURCE_MIXED_FOREST_BASE_TILE + 0x40,
  SOURCE_MIXED_FOREST_BASE_TILE + 0x80,
  SOURCE_MIXED_FOREST_BASE_TILE + 0xc0,
  SOURCE_MIXED_FOREST_BASE_TILE + 0x20,
  SOURCE_MIXED_FOREST_BASE_TILE + 0x60,
  SOURCE_MIXED_FOREST_BASE_TILE + 0xa0,
  SOURCE_SOLID_FOREST_TILE,
  -1,
  SOURCE_BOT_ONE_TREE_TILE,
  SOURCE_TOP_ONE_TREE_TILE,
  SOURCE_MID_ONE_TREE_TILE
] as const;

function fixSourceForestNeighbors(world: WorldState, tileX: number, tileY: number): void {
  const offsets = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1]
  ] as const;
  for (const [offsetX, offsetY] of offsets) {
    fixSourceForestTile(world, tileX + offsetX, tileY + offsetY);
  }
}

function fixSourceForestTile(world: WorldState, tileX: number, tileY: number): void {
  if (tileX < 0 || tileY < 0 || tileX >= world.map.width || tileY >= world.map.height) {
    return;
  }
  const index = tileY * world.map.width + tileX;
  if (!isSourceHarvestableWoodTile(world, world.tiles[index] ?? 0)) {
    return;
  }
  const tile = sourceTileByForestSurroundings(
    sourceForestLookupForNeighbor(world, tileX, tileY - 1),
    sourceForestLookupForNeighbor(world, tileX + 1, tileY),
    sourceForestLookupForNeighbor(world, tileX, tileY + 1),
    sourceForestLookupForNeighbor(world, tileX - 1, tileY)
  );
  if (tile !== -1) {
    world.tiles[index] = tile;
  }
}

function sourceTileByForestSurroundings(ttup: number, ttright: number, ttdown: number, ttleft: number): number {
  let tile = 0;
  tile += ((ttup & 0x01) !== 0 && (ttleft & 0x04) !== 0) ? 8 : 0;
  tile += ((ttup & 0x02) !== 0 && (ttright & 0x08) !== 0) ? 4 : 0;
  tile += ((ttright & 0x01) !== 0 && (ttdown & 0x04) !== 0) ? 2 : 0;
  tile += ((ttleft & 0x02) !== 0 && (ttdown & 0x08) !== 0) ? 1 : 0;

  if ((ttdown & 0x10) !== 0) {
    tile |= (ttleft & 0x06) !== 0 ? 1 : 0;
    tile |= (ttright & 0x09) !== 0 ? 2 : 0;
  }
  if ((ttup & 0x20) !== 0) {
    tile |= (ttleft & 0x06) !== 0 ? 8 : 0;
    tile |= (ttright & 0x09) !== 0 ? 4 : 0;
  }

  const tableTile = SOURCE_WOOD_TABLE[tile] ?? -1;
  if (tableTile !== -1) {
    return tableTile;
  }

  let oneTreeTile = 16;
  oneTreeTile += ((ttup & 0x01) !== 0 || (ttup & 0x02) !== 0) ? 1 : 0;
  oneTreeTile += ((ttdown & 0x04) !== 0 || (ttdown & 0x08) !== 0) ? 2 : 0;
  return SOURCE_WOOD_TABLE[oneTreeTile] ?? -1;
}

function sourceForestLookupForNeighbor(world: WorldState, tileX: number, tileY: number): number {
  if (tileX < 0 || tileY < 0 || tileX >= world.map.width || tileY >= world.map.height) {
    return 15;
  }
  return sourceForestMixedLookup(world.tiles[tileY * world.map.width + tileX] ?? 0);
}

function sourceForestMixedLookup(tile: number): number {
  if (tile === SOURCE_BOT_ONE_TREE_TILE) {
    return 12 + 16;
  }
  if (tile === SOURCE_TOP_ONE_TREE_TILE) {
    return 3 + 32;
  }
  if (tile === SOURCE_MID_ONE_TREE_TILE) {
    return 15 + 48;
  }
  if (tile === SOURCE_REMOVED_TREE_TILE) {
    return 0;
  }
  const slot = tile & 0xfff0;
  if (slot === SOURCE_SOLID_FOREST_TILE) {
    return 15;
  }
  if (slot >= SOURCE_MIXED_FOREST_BASE_TILE && slot < SOURCE_MIXED_FOREST_BASE_TILE + 0x100) {
    const check = Math.floor((slot - SOURCE_MIXED_FOREST_BASE_TILE) / 0x10);
    switch (check) {
      case 0: return 8;
      case 1: return 4;
      case 2: return 8 + 4;
      case 3: return 1;
      case 4: return 8 + 1;
      case 5: return 4 + 1;
      case 6: return 8 + 4 + 1;
      case 7: return 2;
      case 8: return 8 + 2;
      case 9: return 4 + 2;
      case 10: return 8 + 4 + 2;
      case 11: return 2 + 1;
      case 12: return 8 + 2 + 1;
      case 13: return 4 + 2 + 1;
      default: return 0;
    }
  }
  return 0;
}

function forestResourceForTile(world: WorldState, tileX: number, tileY: number): WorldState["forestResources"][number] | null {
  world.forestResources ??= [];
  let resource = world.forestResources.find((entry) => entry.x === tileX && entry.y === tileY) ?? null;
  if (!resource) {
    resource = { x: tileX, y: tileY, amount: defaultForestTileResources() };
    world.forestResources.push(resource);
  }
  return resource;
}

function hasWoodRemaining(world: WorldState, tileX: number | null, tileY: number | null): boolean {
  if (tileX === null || tileY === null) {
    return false;
  }
  return (world.forestResources ?? []).some((entry) => entry.x === tileX && entry.y === tileY && entry.amount > 0);
}

function restoreForestResource(world: WorldState, tileX: number, tileY: number): void {
  world.forestResources = (world.forestResources ?? []).filter((entry) => entry.x !== tileX || entry.y !== tileY);
  world.forestResources.push({ x: tileX, y: tileY, amount: defaultForestTileResources() });
}

function sourceResourceGatherStepSeconds(world: WorldState, unit: WorldUnit, resource: string): number {
  const cycles = resourceWaitAtResourceCyclesForUnit(unit, resource);
  return Math.max(sourceCyclesToSeconds(world, 1), sourceCyclesToSeconds(world, cycles)) * sourceResourceHarvestDurationSecondsForPlayer(world, unit.player, resource) / 0.75;
}

function sourceResourceReturnStepSeconds(world: WorldState, unit: WorldUnit, resource: string): number {
  const cycles = resourceWaitAtDepotCyclesForUnit(unit, resource);
  return Math.max(sourceCyclesToSeconds(world, 1), sourceCyclesToSeconds(world, cycles)) * sourceResourceReturnDurationSecondsForPlayer(world, unit.player, resource) / 0.25;
}

function scheduleForestRegrowth(world: WorldState, tileX: number, tileY: number, harvestedTile: number): void {
  const regenerationSeconds = Math.max(0, Math.floor(world.engineSettings.forestRegenerationSeconds || 0));
  if (regenerationSeconds <= 0) {
    return;
  }
  world.forestRegrowth = (world.forestRegrowth ?? []).filter((entry) => entry.x !== tileX || entry.y !== tileY);
  world.forestRegrowth.push({
    x: tileX,
    y: tileY,
    tile: harvestedTile,
    remainingTicks: sourceDurationSecondsToTicks(world, regenerationSeconds)
  });
}

function sourceDurationSecondsToTicks(world: WorldState, seconds: number): number {
  return Math.max(1, Math.round(Math.max(0, seconds) * sourceDefaultGameSpeed(world)));
}

function isForestRegrowthTileOccupied(world: WorldState, tileX: number, tileY: number): boolean {
  const left = tileX * world.tileSize;
  const right = left + world.tileSize;
  const top = tileY * world.tileSize;
  const bottom = top + world.tileSize;
  return world.units.some((unit) => {
    if (unit.hitPoints <= 0 || isInvisibleUtilityUnit(unit) || isUnitInsideResourceSource(unit)) {
      return false;
    }
    const { halfWidth, halfHeight } = unitFootprintHalfSize(unit, world.tileSize);
    return unit.x + halfWidth > left
      && unit.x - halfWidth < right
      && unit.y + halfHeight > top
      && unit.y - halfHeight < bottom;
  });
}

function isInAttackRange(unit: WorldUnit, target: WorldUnit, world?: WorldState): boolean {
  const distance = Math.hypot(target.x - unit.x, target.y - unit.y);
  return canAttackTarget(unit, target, world)
    && distance <= unit.attackRange + target.radius
    && distance >= minimumAttackDistanceForTarget(unit, target)
    && (!world || isSourceInsideAttackLineClear(world, unit, target));
}

function canContinueAttackingTarget(world: WorldState, attacker: WorldUnit, target: WorldUnit | undefined): target is WorldUnit {
  return Boolean(target && canAttackTarget(attacker, target, world) && isUnitVisibleToPlayer(world, target, attacker.player));
}

export function canAttackTarget(attacker: WorldUnit, target: WorldUnit, world?: WorldState): boolean {
  const hostile = world ? arePlayersEnemies(world, attacker.player, target.player) : attacker.player !== target.player && target.player !== 15;
  if (attacker.hitPoints <= 0 || isUnitHiddenInConstruction(attacker) || attacker.construction || !attacker.canAttack || target.hitPoints <= 0 || isUnitHiddenInConstruction(target) || !hostile) {
    return false;
  }
  if (target.kind === "fly") {
    return attacker.canTargetAir;
  }
  if (target.kind === "naval") {
    return attacker.canTargetSea;
  }
  return attacker.canTargetLand;
}

function arePlayersEnemies(world: WorldState, player: number, otherPlayer: number): boolean {
  if (player === otherPlayer || otherPlayer === 15) {
    return false;
  }
  const source = sourceDiplomacyState(world, player, otherPlayer);
  return source ? source === "enemy" : true;
}

function arePlayersAllied(world: WorldState, player: number, otherPlayer: number): boolean {
  if (player === otherPlayer) {
    return true;
  }
  return sourceDiplomacyState(world, player, otherPlayer) === "allied";
}

function arePlayersMutuallyAllied(world: WorldState, player: number, otherPlayer: number): boolean {
  return arePlayersAllied(world, player, otherPlayer) && arePlayersAllied(world, otherPlayer, player);
}

function sourceDiplomacyState(world: WorldState, player: number, otherPlayer: number): "allied" | "enemy" | "neutral" | null {
  return world.diplomacy.find((rule) => rule.player === player && rule.otherPlayer === otherPlayer)?.state ?? null;
}

function launchAttack(world: WorldState, attacker: WorldUnit, target: WorldUnit): void {
  const delaySeconds = sourceAttackAnimationLaunchDelayForUnit(world, attacker);
  if (delaySeconds <= sourceCyclesToSeconds(world, 1)) {
    launchAttackNow(world, attacker, target);
    return;
  }
  removeStatusEffect(attacker, "invisibility");
  if (!attacker.sideAttack) {
    updateUnitFacing(attacker, target.x - attacker.x, target.y - attacker.y);
  }
  world.pendingAttacks.push({
    id: `pending-attack-${world.tick}-${world.pendingAttacks.length}-${attacker.id}`,
    sourceId: attacker.id,
    targetId: target.id,
    player: attacker.player,
    targetX: target.x,
    targetY: target.y,
    remainingSeconds: delaySeconds
  });
}

function launchAttackNow(world: WorldState, attacker: WorldUnit, target: WorldUnit): void {
  const demolishSpellId = sourceDemolishSpellIdForUnit(world, attacker);
  if (demolishSpellId || attacker.volatile) {
    detonateDemolitionUnit(world, attacker, demolishSpellId);
    return;
  }
  removeStatusEffect(attacker, "invisibility");
  if (!attacker.sideAttack) {
    updateUnitFacing(attacker, target.x - attacker.x, target.y - attacker.y);
  }
  const damage = damageAgainst(world, attacker, target);
  const missileId = attacker.missile ?? null;
  const missileDefinition = missileDefinitionForId(world, missileId);
  const projectileKind = projectileKindForUnit(world, attacker);
  if (projectileKind === "melee") {
    applyDamage(world, target, damage, attacker.player, attacker.typeId, attacker.id);
    emitSoundEvent(world, soundForMeleeAttack(world, attacker), attacker.player, attacker.x, attacker.y);
    return;
  }
  const launchPoint = projectileLaunchPoint(attacker, target.x, target.y);
  const launchSound = missileDefinition?.firedSound ?? soundForRangedAttack(world, attacker) ?? soundForProjectileLaunch(projectileKind);
  if (launchSound) {
    emitSoundEvent(world, launchSound, attacker.player, launchPoint.x, launchPoint.y);
  }
  world.projectiles.push({
    id: `projectile-${world.tick}-${world.projectiles.length}-${attacker.id}`,
    sourceId: attacker.id,
    targetId: target.id,
    sourceTypeId: attacker.typeId,
    player: attacker.player,
    x: launchPoint.x,
    y: launchPoint.y,
    originX: launchPoint.x,
    originY: launchPoint.y,
    targetX: target.x,
    targetY: target.y - Math.min(16, target.radius),
    speed: projectileSpeedForMissile(missileDefinition?.speed ?? 0, projectileKind),
    damage,
    missileId,
    className: missileDefinition?.className ?? null,
    impactSoundId: missileDefinition?.impactSound ?? null,
    impactMissileId: missileDefinition?.impactMissile ?? null,
    splashFactor: missileDefinition?.splashFactor ?? 0,
    range: missileDefinition?.range ?? 0,
    canHitOwner: missileDefinition?.canHitOwner ?? false,
    friendlyFire: missileDefinition?.friendlyFire ?? false,
    canTargetLand: attacker.canTargetLand,
    canTargetSea: attacker.canTargetSea,
    canTargetAir: attacker.canTargetAir,
    bouncesRemaining: missileDefinition?.numBounces ?? 0,
    hitUnitIds: [],
    drawLevel: missileDefinition?.drawLevel ?? 0,
    kind: projectileKind,
    age: 0,
    delaySeconds: 0,
    ttlSeconds: null
  });
}

function projectileLaunchPoint(attacker: WorldUnit, targetX: number, targetY: number): { x: number; y: number } {
  const baseY = attacker.y - Math.min(20, attacker.radius);
  if (!attacker.sideAttack) {
    return { x: attacker.x, y: baseY };
  }
  const dx = targetX - attacker.x;
  const dy = targetY - attacker.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.5) {
    return { x: attacker.x, y: baseY };
  }
  const facingAngle = (attacker.facing % 8) * (Math.PI / 4);
  const forwardX = Math.cos(facingAngle);
  const forwardY = Math.sin(facingAngle);
  const leftX = -forwardY;
  const leftY = forwardX;
  const targetSide = Math.sign(leftX * dx + leftY * dy) || 1;
  const offset = Math.max(10, Math.min(24, attacker.radius * 0.75));
  return {
    x: attacker.x + leftX * targetSide * offset,
    y: baseY + leftY * targetSide * offset
  };
}

function canLaunchAttackNow(attacker: WorldUnit, target: WorldUnit): boolean {
  return !attacker.sideAttack || isTargetInSideAttackArc(attacker, target.x, target.y);
}

function turnSideAttackTowardTarget(attacker: WorldUnit, target: WorldUnit, tickSeconds?: number): void {
  if (!attacker.sideAttack) {
    return;
  }
  const dx = target.x - attacker.x;
  const dy = target.y - attacker.y;
  if (Math.hypot(dx, dy) < 0.5) {
    return;
  }
  const targetAngle = Math.atan2(dy, dx);
  const leftBroadside = angleToFacing(targetAngle - Math.PI / 2);
  const rightBroadside = angleToFacing(targetAngle + Math.PI / 2);
  const currentFacing = normalizedFacing(attacker.facing);
  const leftDelta = Math.abs(shortestFacingDelta(currentFacing, leftBroadside));
  const rightDelta = Math.abs(shortestFacingDelta(currentFacing, rightBroadside));
  updateUnitFacingToOctant(attacker, leftDelta <= rightDelta ? leftBroadside : rightBroadside, tickSeconds);
}

function isTargetInSideAttackArc(attacker: WorldUnit, targetX: number, targetY: number): boolean {
  const dx = targetX - attacker.x;
  const dy = targetY - attacker.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.5) {
    return true;
  }
  const facingAngle = normalizedFacing(attacker.facing) * (Math.PI / 4);
  const forwardX = Math.cos(facingAngle);
  const forwardY = Math.sin(facingAngle);
  const dot = Math.abs((forwardX * dx + forwardY * dy) / distance);
  return dot <= Math.SQRT1_2;
}

function updateUnitFacing(unit: WorldUnit, dx: number, dy: number, tickSeconds?: number): void {
  if (Math.hypot(dx, dy) < 0.5) {
    return;
  }
  const angle = Math.atan2(dy, dx);
  updateUnitFacingToOctant(unit, angleToFacing(angle), tickSeconds);
}

function updateUnitFacingToOctant(unit: WorldUnit, targetFacing: number, tickSeconds?: number): void {
  const rotationStep = tickSeconds && unit.rotationSpeed > 0 ? unit.rotationSpeed * tickSeconds : 0;
  if (rotationStep <= 0) {
    unit.facing = targetFacing;
    return;
  }
  const currentFacing = normalizedFacing(unit.facing);
  const delta = shortestFacingDelta(currentFacing, targetFacing);
  if (Math.abs(delta) <= rotationStep) {
    unit.facing = targetFacing;
    return;
  }
  unit.facing = (currentFacing + Math.sign(delta) * rotationStep + 8) % 8;
}

function angleToFacing(angle: number): number {
  return (Math.round(angle / (Math.PI / 4)) + 8) % 8;
}

function normalizedFacing(facing: number): number {
  return ((facing % 8) + 8) % 8;
}

function shortestFacingDelta(currentFacing: number, targetFacing: number): number {
  return ((((targetFacing - currentFacing) % 8) + 12) % 8) - 4;
}

function launchGroundAttack(world: WorldState, attacker: WorldUnit, targetX: number, targetY: number): void {
  const delaySeconds = sourceAttackAnimationLaunchDelayForUnit(world, attacker);
  if (delaySeconds <= sourceCyclesToSeconds(world, 1)) {
    launchGroundAttackNow(world, attacker, targetX, targetY);
    return;
  }
  removeStatusEffect(attacker, "invisibility");
  if (!attacker.sideAttack) {
    updateUnitFacing(attacker, targetX - attacker.x, targetY - attacker.y);
  }
  world.pendingAttacks.push({
    id: `pending-ground-attack-${world.tick}-${world.pendingAttacks.length}-${attacker.id}`,
    sourceId: attacker.id,
    targetId: "",
    player: attacker.player,
    targetX,
    targetY,
    remainingSeconds: delaySeconds
  });
}

function launchGroundAttackNow(world: WorldState, attacker: WorldUnit, targetX: number, targetY: number): void {
  const missileId = attacker.missile ?? null;
  const missileDefinition = missileDefinitionForId(world, missileId);
  const projectileKind = projectileKindForUnit(world, attacker);
  if (projectileKind !== "siege" && projectileKind !== "cannon") {
    return;
  }
  removeStatusEffect(attacker, "invisibility");
  if (!attacker.sideAttack) {
    updateUnitFacing(attacker, targetX - attacker.x, targetY - attacker.y);
  }
  const launchPoint = projectileLaunchPoint(attacker, targetX, targetY);
  const launchSound = missileDefinition?.firedSound ?? soundForRangedAttack(world, attacker) ?? soundForProjectileLaunch(projectileKind);
  if (launchSound) {
    emitSoundEvent(world, launchSound, attacker.player, launchPoint.x, launchPoint.y);
  }
  world.projectiles.push({
    id: `ground-projectile-${world.tick}-${world.projectiles.length}-${attacker.id}`,
    sourceId: attacker.id,
    targetId: null,
    sourceTypeId: attacker.typeId,
    player: attacker.player,
    x: launchPoint.x,
    y: launchPoint.y,
    originX: launchPoint.x,
    originY: launchPoint.y,
    targetX,
    targetY,
    speed: projectileSpeedForMissile(missileDefinition?.speed ?? 0, projectileKind),
    damage: damageAgainst(world, attacker, null),
    missileId,
    className: missileDefinition?.className ?? null,
    impactSoundId: missileDefinition?.impactSound ?? null,
    impactMissileId: missileDefinition?.impactMissile ?? null,
    splashFactor: missileDefinition?.splashFactor ?? 0,
    range: missileDefinition?.range ?? 0,
    canHitOwner: missileDefinition?.canHitOwner ?? false,
    friendlyFire: missileDefinition?.friendlyFire ?? false,
    canTargetLand: attacker.canTargetLand,
    canTargetSea: attacker.canTargetSea,
    canTargetAir: attacker.canTargetAir,
    bouncesRemaining: missileDefinition?.numBounces ?? 0,
    hitUnitIds: [],
    drawLevel: missileDefinition?.drawLevel ?? 0,
    kind: projectileKind,
    age: 0,
    delaySeconds: 0,
    ttlSeconds: null
  });
}

function detonateDemolitionUnit(world: WorldState, attacker: WorldUnit, spellId: string | null = sourceDemolishSpellIdForUnit(world, attacker)): void {
  removeStatusEffect(attacker, "invisibility");
  const blastRadius = demolitionBlastRadius(world, spellId);
  const blastDamage = demolitionBlastDamage(world, spellId);
  clearDemolishableTerrainInBlast(world, attacker.x, attacker.y, blastRadius);
  for (const unit of world.units) {
    if (unit.id === attacker.id || unit.hitPoints <= 0 || unit.kind === "fly") {
      continue;
    }
    const distance = Math.hypot(unit.x - attacker.x, unit.y - attacker.y);
    if (distance <= blastRadius) {
      applyDamage(world, unit, blastDamage, attacker.player, attacker.typeId, attacker.id);
    }
  }
  attacker.hitPoints = 0;
  addSpellEffect(
    world,
    "fireball",
    attacker.player,
    attacker.x,
    attacker.y,
    Math.max(blastRadius, sourceSpellVisualRadius(world, spellId ?? "spell-suicide-bomber", blastRadius)),
    sourceSpellAnimationDuration(world, spellId ?? "spell-suicide-bomber", 0.55),
    attacker.typeId,
    (spellId ? sourceSpellCastSound(world, spellId) : null) ?? sourceSpellCastSound(world, "spell-suicide-bomber") ?? "explosion",
    spellId ? sourceSpellMissileId(world, spellId) : sourceSpellMissileId(world, "spell-suicide-bomber"),
    spellId ?? "spell-suicide-bomber"
  );
}

function clearDemolishableTerrainInBlast(world: WorldState, x: number, y: number, radius: number): void {
  const centerTile = worldToTile(world, x, y);
  const tileRadius = Math.max(0, Math.ceil(radius / world.tileSize));
  let cleared = false;
  for (let tileY = Math.max(0, centerTile.y - tileRadius); tileY <= Math.min(world.map.height - 1, centerTile.y + tileRadius); tileY += 1) {
    for (let tileX = Math.max(0, centerTile.x - tileRadius); tileX <= Math.min(world.map.width - 1, centerTile.x + tileRadius); tileX += 1) {
      if (Math.hypot(tileX - centerTile.x, tileY - centerTile.y) > tileRadius) {
        continue;
      }
      cleared = clearDemolishableTerrainTile(world, tileX, tileY) || cleared;
    }
  }
  if (cleared) {
    world.terrainVersion += 1;
  }
}

function clearDemolishableTerrainTile(world: WorldState, tileX: number, tileY: number): boolean {
  const index = tileY * world.map.width + tileX;
  const tile = world.tiles[index] ?? 0;
  const flags = sourceTerrainFlagsForTile(world, tile);
  if (!flags.includes("forest") && !flags.includes("rock") && !flags.includes("wall")) {
    return false;
  }
  if (flags.includes("forest")) {
    world.tiles[index] = SOURCE_REMOVED_TREE_TILE;
  } else {
    world.tiles[index] = 80;
  }
  world.forestResources = (world.forestResources ?? []).filter((entry) => entry.x !== tileX || entry.y !== tileY);
  world.forestRegrowth = (world.forestRegrowth ?? []).filter((entry) => entry.x !== tileX || entry.y !== tileY);
  return true;
}

function sourceTerrainFlagsForTile(world: WorldState, tile: number): string[] {
  if (tile === SOURCE_REMOVED_TREE_TILE) {
    return ["land"];
  }
  const slot = tile & 0xfff0;
  return world.tilesetTerrain?.slots.find((entry) => entry.slot === slot)?.flags ?? [];
}

function demolitionBlastRadius(world: WorldState, spellId: string | null = null): number {
  const range = sourceDemolishAction(world, spellId)?.range;
  return typeof range === "number" && range > 0 ? range * world.tileSize : 80;
}

function demolitionBlastDamage(world: WorldState, spellId: string | null = null): number {
  const damage = sourceDemolishAction(world, spellId)?.damage;
  return typeof damage === "number" && damage > 0 ? damage : 200;
}

function sourceDemolishAction(world: WorldState, spellId: string | null = null): WargusSpell["demolishes"][number] | null {
  const spell = spellId
    ? world.spellDefinitions.find((candidate) => candidate.id === spellId)
    : world.spellDefinitions.find((candidate) => candidate.demolishes.length > 0);
  return spell?.demolishes[0] ?? null;
}

function sourceDemolishSpellForUnit(world: WorldState, unit: Pick<WorldUnit, "canCastSpells">): WargusSpell | null {
  return unit.canCastSpells
    .map((spellId) => world.spellDefinitions.find((spell) => spell.id === spellId && spell.demolishes.length > 0))
    .find((spell): spell is WargusSpell => Boolean(spell)) ?? null;
}

function sourceDemolishSpellIdForUnit(world: WorldState, unit: Pick<WorldUnit, "canCastSpells">): string | null {
  return sourceDemolishSpellForUnit(world, unit)?.id ?? null;
}

function detonateClickExplosiveUnit(world: WorldState, unit: WorldUnit): void {
  const missileId = unit.missile ?? unit.explosionType ?? "missile-explosion";
  const missile = missileDefinitionForId(world, missileId);
  const definition = world.unitDefinitions.find((candidate) => candidate.id === unit.typeId);
  const fallbackRadius = deathExplosionRadius(unit);
  unit.hitPoints = 0;
  world.spellEffects.push({
    id: `click-explosion-${world.tick}-${world.spellEffects.length}`,
    kind: "explosion",
    player: unit.player,
    x: unit.x,
    y: unit.y,
    radius: sourceMissileVisualRadius(missile, fallbackRadius),
    age: 0,
    duration: sourceMissileAnimationDuration(world, missile, 0.45),
    sourceTypeId: unit.typeId,
    missileId,
    drawLevel: missile?.drawLevel ?? 0
  });
  emitSoundEvent(world, missile?.firedSound ?? definition?.sounds.dead ?? "explosion", unit.player, unit.x, unit.y);
}

function damageSiegeImpact(world: WorldState, projectile: WorldProjectile, directTarget: WorldUnit): void {
  applyDamage(world, directTarget, projectileDamageAgainst(world, projectile, directTarget), projectile.player, projectile.sourceTypeId, projectile.sourceId);
  damageGroundImpact(world, projectile, directTarget.id);
}

function applyProjectileDirectImpact(world: WorldState, projectile: WorldProjectile, target: WorldUnit): void {
  const damage = projectile.className === "missile-class-death-coil"
    ? projectile.damage
    : projectileDamageAgainst(world, projectile, target);
  applyDamage(world, target, damage, projectile.player, projectile.sourceTypeId, projectile.sourceId);
  if (projectile.className === "missile-class-death-coil") {
    healProjectileSourceByDamageDealt(world, projectile, damage);
  }
}

function healProjectileSourceByDamageDealt(world: WorldState, projectile: WorldProjectile, damageDealt: number): void {
  if (damageDealt <= 0) {
    return;
  }
  const source = findUnit(world, projectile.sourceId);
  if (!source || source.hitPoints <= 0) {
    return;
  }
  source.hitPoints = Math.min(source.maxHitPoints, source.hitPoints + damageDealt);
}

function damageGroundImpact(world: WorldState, projectile: WorldProjectile, ignoredUnitId: string | null = null): void {
  damageProjectileSplash(world, projectile, ignoredUnitId);
  addSourceMissileImpactEffect(world, projectile.impactMissileId, projectile.player, projectile.targetX, projectile.targetY, splashRadiusForProjectile(projectile), null, projectile.sourceTypeId, projectile.sourceId);
  if (projectile.impactSoundId) {
    emitSoundEvent(world, projectile.impactSoundId, projectile.player, projectile.targetX, projectile.targetY);
  }
}

function damageProjectileSplash(world: WorldState, projectile: WorldProjectile, ignoredUnitId: string | null = null): void {
  if (projectile.range <= 0) {
    return;
  }
  for (const unit of world.units) {
    if (unit.id === ignoredUnitId || unit.player === 15 || unit.hitPoints <= 0 || unit.kind === "fly" || !projectileCanHitUnitBySourceOwnership(world, projectile, unit)) {
      continue;
    }
    const splashDivisor = sourceSplashDivisorForProjectileUnit(world, projectile, unit);
    if (splashDivisor !== null) {
      applyDamage(world, unit, sourceSplashDamageForProjectileUnit(world, projectile, unit, splashDivisor), projectile.player, projectile.sourceTypeId, projectile.sourceId);
    }
  }
}

function sourceSplashDamageForProjectileUnit(world: WorldState, projectile: WorldProjectile, unit: WorldUnit, splashDivisor: number): number {
  return Math.max(1, Math.floor(projectileDamageAgainst(world, projectile, unit) / splashDivisor));
}

function sourceSplashDivisorForProjectileUnit(world: WorldState, projectile: WorldProjectile, unit: WorldUnit): number | null {
  const impactTileX = Math.floor(projectile.targetX / world.tileSize);
  const impactTileY = Math.floor(projectile.targetY / world.tileSize);
  const maxTileDistance = Math.max(0, Math.floor(projectile.range) - 1);
  const tileDistance = mapTileDistanceToUnit(world, unit, impactTileX, impactTileY);
  if (tileDistance > maxTileDistance) {
    return null;
  }
  return tileDistance === 0 ? 1 : tileDistance * Math.max(1, Math.floor(projectile.splashFactor));
}

function mapTileDistanceToUnit(world: WorldState, unit: WorldUnit, tileX: number, tileY: number): number {
  const unitTileX = Math.floor(unit.x / world.tileSize);
  const unitTileY = Math.floor(unit.y / world.tileSize);
  const maxUnitTileX = unitTileX + Math.max(1, unit.tileWidth) - 1;
  const maxUnitTileY = unitTileY + Math.max(1, unit.tileHeight) - 1;
  const dx = tileX <= unitTileX ? unitTileX - tileX : Math.max(0, tileX - maxUnitTileX);
  const dy = tileY <= unitTileY ? unitTileY - tileY : Math.max(0, tileY - maxUnitTileY);
  return Math.floor(Math.hypot(dx, dy));
}

function projectileCanHitUnitBySourceOwnership(world: WorldState, projectile: WorldProjectile, unit: WorldUnit): boolean {
  if (arePlayersEnemies(world, projectile.player, unit.player)) {
    return true;
  }
  if (unit.id === projectile.sourceId) {
    return projectile.canHitOwner;
  }
  return projectile.friendlyFire;
}

function projectileDamageAgainst(world: WorldState, projectile: WorldProjectile, target: WorldUnit | null): number {
  const source = findUnit(world, projectile.sourceId);
  return source && source.hitPoints > 0
    ? damageAgainst(world, source, target)
    : projectile.damage;
}

function spawnProjectileImpactEffect(world: WorldState, projectile: WorldProjectile): void {
  if (!projectile.impactMissileId) {
    return;
  }
  const impactMissile = missileDefinitionForId(world, projectile.impactMissileId);
  const fallbackRadius = projectile.kind === "cannon" || projectile.kind === "siege" ? 42 : 30;
  world.spellEffects.push({
    id: `projectile-impact-${world.tick}-${world.spellEffects.length}`,
    kind: sourceMissileImpactEffectKind(world, impactMissile),
    player: projectile.player,
    x: projectile.targetX,
    y: projectile.targetY,
    radius: sourceMissileVisualRadius(impactMissile, fallbackRadius),
    age: 0,
    duration: sourceMissileAnimationDuration(world, impactMissile, 0.38),
    missileId: projectile.impactMissileId,
    drawLevel: impactMissile?.drawLevel ?? projectile.drawLevel
  });
}

function missileDefinitionForId(world: WorldState, missileId: string | null): WorldState["missileDefinitions"][number] | undefined {
  return missileId ? world.missileDefinitions.find((missile) => missile.id === missileId) : undefined;
}

function sourceMissileImpactEffectKind(world: Pick<WorldState, "missileDefinitions">, missile: WargusMissile | undefined): WorldState["spellEffects"][number]["kind"] {
  if (missile && world.missileDefinitions.some((definition) => definition.impactMissile === missile.id)) {
    return "explosion";
  }
  return "fireball";
}

export function projectileSpeedForMissile(sourceSpeed: number, kind: WorldProjectile["kind"]): number {
  if (sourceSpeed > 0) {
    return sourceSpeed * MISSILE_SPEED_TO_PIXELS_PER_SECOND;
  }
  if (kind === "siege") {
    return 240;
  }
  if (kind === "torpedo") {
    return 260;
  }
  if (kind === "axe") {
    return 280;
  }
  return 360;
}

function splashRadiusForProjectile(projectile: WorldProjectile): number {
  if (projectile.range > 0) {
    return Math.max(1, projectile.range) * 32;
  }
  if (projectile.splashFactor > 0) {
    return Math.max(32, Math.min(96, 24 + projectile.splashFactor * 8));
  }
  return 48;
}

export function canAttackGround(unit: WorldUnit): boolean {
  return unit.hitPoints > 0 && !unit.construction && unit.groundAttack;
}

function isGroundTargetInRange(world: WorldState, unit: WorldUnit, targetX: number, targetY: number): boolean {
  const distance = Math.hypot(targetX - unit.x, targetY - unit.y);
  return distance <= unit.attackRange + 12
    && distance >= minimumAttackDistanceForPoint(unit)
    && isSourceInsideAttackLineClear(world, unit, { x: targetX, y: targetY });
}

function isSourceInsideAttackLineClear(world: WorldState, unit: WorldUnit, target: Pick<WorldUnit, "x" | "y">): boolean {
  if (!world.engineSettings.insideDefault) {
    return true;
  }
  const start = worldToTile(world, unit.x, unit.y);
  const goal = worldToTile(world, target.x, target.y);
  let x = start.x;
  let y = start.y;
  const dx = Math.abs(goal.x - start.x);
  const dy = Math.abs(goal.y - start.y);
  const stepX = start.x < goal.x ? 1 : -1;
  const stepY = start.y < goal.y ? 1 : -1;
  let error = dx - dy;
  while (x !== goal.x || y !== goal.y) {
    const doubledError = error * 2;
    if (doubledError > -dy) {
      error -= dy;
      x += stepX;
    }
    if (doubledError < dx) {
      error += dx;
      y += stepY;
    }
    if (isSourceInsideAttackObstacleTile(world, x, y)) {
      return false;
    }
  }
  return true;
}

function isSourceInsideAttackObstacleTile(world: WorldState, tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= world.map.width || tileY >= world.map.height) {
    return false;
  }
  const tile = world.tiles[tileY * world.map.width + tileX] ?? 0;
  const slot = tile & 0xfff0;
  const flags = world.tilesetTerrain?.slots.find((entry) => entry.slot === slot)?.flags ?? [];
  return flags.includes("rock") || flags.includes("forest");
}

function isTargetInsideMinimumAttackRange(unit: WorldUnit, target: WorldUnit): boolean {
  const minimumDistance = minimumAttackDistanceForTarget(unit, target);
  return minimumDistance > 0 && Math.hypot(target.x - unit.x, target.y - unit.y) < minimumDistance;
}

function isGroundTargetInsideMinimumAttackRange(unit: WorldUnit, targetX: number, targetY: number): boolean {
  const minimumDistance = minimumAttackDistanceForPoint(unit);
  return minimumDistance > 0 && Math.hypot(targetX - unit.x, targetY - unit.y) < minimumDistance;
}

function findBetterAttackPositionPath(world: WorldState, unit: WorldUnit, targetX: number, targetY: number): Array<{ x: number; y: number }> {
  const dx = unit.x - targetX;
  const dy = unit.y - targetY;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.5) {
    return [];
  }
  const desiredDistance = Math.max(unit.minAttackRange + world.tileSize, world.tileSize);
  const baseX = targetX + (dx / distance) * desiredDistance;
  const baseY = targetY + (dy / distance) * desiredDistance;
  const baseTile = worldToTile(world, baseX, baseY);
  const movement = movementKindForUnit(unit);
  const candidates: Array<{ x: number; y: number; score: number }> = [];
  for (let radius = 0; radius <= 3; radius += 1) {
    for (let y = baseTile.y - radius; y <= baseTile.y + radius; y += 1) {
      for (let x = baseTile.x - radius; x <= baseTile.x + radius; x += 1) {
        if (Math.max(Math.abs(x - baseTile.x), Math.abs(y - baseTile.y)) !== radius || !isTilePassable(world, x, y, movement, unit.id)) {
          continue;
        }
        const point = tileToWorldCenter(world, x, y);
        const targetDistance = Math.hypot(point.x - targetX, point.y - targetY);
        if (targetDistance < Math.max(0, unit.minAttackRange - world.tileSize / 2) || targetDistance > unit.attackRange + world.tileSize) {
          continue;
        }
        candidates.push({ x, y, score: Math.abs(targetDistance - desiredDistance) + Math.hypot(point.x - unit.x, point.y - unit.y) / 8 });
      }
    }
    if (candidates.length > 0) {
      break;
    }
  }
  candidates.sort((left, right) => left.score - right.score);
  for (const candidate of candidates) {
    const point = tileToWorldCenter(world, candidate.x, candidate.y);
    const path = findPath(world, unit, point.x, point.y);
    if (path.length > 0) {
      return path;
    }
  }
  return [];
}

function findSpellCastPathWithinSourceRange(world: WorldState, caster: WorldUnit, targetX: number, targetY: number, rangeTiles: number): Array<{ x: number; y: number }> {
  const targetTile = worldToTile(world, targetX, targetY);
  const radius = Math.max(0, Math.floor(rangeTiles));
  const movement = movementKindForUnit(caster);
  const candidates: Array<{ x: number; y: number; distance: number }> = [];
  for (let y = targetTile.y - radius; y <= targetTile.y + radius; y += 1) {
    for (let x = targetTile.x - radius; x <= targetTile.x + radius; x += 1) {
      const point = tileToWorldCenter(world, x, y);
      const tileDistance = Math.hypot(point.x - targetX, point.y - targetY) / world.tileSize;
      if (tileDistance > radius || !isTilePassable(world, x, y, movement, caster.id)) {
        continue;
      }
      candidates.push({ x, y, distance: tileDistance });
    }
  }
  candidates.sort((left, right) => left.distance - right.distance || Math.hypot(caster.x - tileToWorldCenter(world, left.x, left.y).x, caster.y - tileToWorldCenter(world, left.x, left.y).y) - Math.hypot(caster.x - tileToWorldCenter(world, right.x, right.y).x, caster.y - tileToWorldCenter(world, right.x, right.y).y));
  for (const candidate of candidates) {
    const point = tileToWorldCenter(world, candidate.x, candidate.y);
    const path = findPath(world, caster, point.x, point.y);
    if (path.length > 0) {
      return path;
    }
  }
  return [];
}

function projectileKindForUnit(world: WorldState, unit: WorldUnit): WorldProjectile["kind"] {
  const sourceKind = projectileKindForMissileDefinition(missileDefinitionForId(world, unit.missile), unit);
  if (sourceKind) {
    return sourceKind;
  }
  return projectileKindForUnitTraits(unit);
}

function projectileKindForMissileDefinition(missile: WorldState["missileDefinitions"][number] | undefined, unit: WorldUnit): WorldProjectile["kind"] | null {
  if (!missile) {
    return null;
  }
  if (missile.numBounces > 0 || missile.className === "missile-class-point-to-point-bounce") {
    return "arrow";
  }
  if (missile.splashFactor > 0 || missile.range > 1) {
    return unit.kind === "naval" || isDefensiveBuilding(unit) ? "cannon" : "siege";
  }
  if (unit.kind === "naval" && missile.className === "missile-class-point-to-point" && missile.range === 1 && missile.splashFactor === 0 && Boolean(missile.impactMissile)) {
    return "torpedo";
  }
  if (missile.className === "missile-class-point-to-point" && missile.range === 0 && missile.splashFactor === 0 && !missile.impactMissile && missile.frames > 10) {
    return "axe";
  }
  if (missile.className === "missile-class-point-to-point" || missile.className === "missile-class-point-to-point-with-hit" || missile.className === "missile-class-death-coil") {
    return "arrow";
  }
  return null;
}

function projectileKindForUnitTraits(unit: WorldUnit): WorldProjectile["kind"] {
  if (!unit.missile || unit.missile === "missile-none" || unit.attackRange <= 48) {
    return "melee";
  }
  if (unit.kind === "naval" || isDefensiveBuilding(unit)) {
    return "cannon";
  }
  if (unit.groundAttack && (unit.minAttackRange > 0 || unit.attackRange >= 160)) {
    return "siege";
  }
  return "arrow";
}

function isSiegeEngine(world: WorldState, unit: WorldUnit): boolean {
  return unit.groundAttack && projectileKindForUnit(world, unit) === "siege";
}

function soundForProjectileLaunch(kind: WorldProjectile["kind"]): string | null {
  if (kind === "arrow") {
    return "bow throw";
  }
  if (kind === "axe") {
    return "axe throw";
  }
  if (kind === "siege") {
    return "catapult-ballista attack";
  }
  if (kind === "cannon" || kind === "torpedo") {
    return "explosion";
  }
  return null;
}

function soundForMeleeAttack(world: WorldState, unit: WorldUnit): string {
  return world.unitDefinitions.find((definition) => definition.id === unit.typeId)?.sounds.attack ?? "sword attack";
}

function soundForRangedAttack(world: WorldState, unit: WorldUnit): string | null {
  return world.unitDefinitions.find((definition) => definition.id === unit.typeId)?.sounds.attack ?? null;
}

function damageAgainst(world: WorldState, attacker: WorldUnit, target: WorldUnit | null): number {
  const bloodlust = activeStatusEffect(attacker, "bloodlust");
  const basicDamage = attacker.basicDamage * (bloodlust ? 2 : 1);
  const piercingDamage = attacker.piercingDamage * (bloodlust ? 2 : 1);
  const maxDamage = Math.max(basicDamage - (target?.armor ?? 0), 1) + piercingDamage;
  const randomRange = Math.floor((maxDamage + 2) / 2);
  const reduction = randomRange > 0
    ? Math.abs(deterministicHash(`${attacker.id}:${target?.id ?? "ground"}:${world.tick}:attack-damage`)) % randomRange
    : 0;
  return Math.max(0, maxDamage - reduction);
}

function applyDamage(world: WorldState, target: WorldUnit, amount: number, attackerPlayer: number | null = null, sourceTypeId: string | null = null, sourceUnitId: string | null = null): void {
  if (amount <= 0) {
    return;
  }
  if (target.indestructible) {
    return;
  }
  if ((world.godModePlayers ?? []).includes(target.player)) {
    return;
  }
  if (!canDamageObjectiveTarget(world, target, sourceTypeId)) {
    return;
  }
  if (hasStatusEffect(target, "unholy-armor")) {
    return;
  }
  if (attackerPlayer !== null && attackerPlayer !== target.player) {
    if ((world.godModePlayers ?? []).includes(attackerPlayer)) {
      amount = Math.max(amount, target.hitPoints);
    }
    target.lastDamagePlayer = attackerPlayer;
    target.lastDamageSourceUnitId = sourceUnitId;
    removeStatusEffect(target, "invisibility");
    revealSourceAttacker(world, target, attackerPlayer, sourceUnitId);
  }
  maybeEmitHelpEvent(world, target, attackerPlayer);
  target.hitPoints -= amount;
  applySourceBuildingCaptureOnDamage(world, target, amount, sourceUnitId);
  addDamageMissileEffect(world, target, amount, attackerPlayer, sourceTypeId);
}

function applySourceBuildingCaptureOnDamage(world: WorldState, target: WorldUnit, damage: number, sourceUnitId: string | null): void {
  if (!world.engineSettings.buildingCapture || damage <= 0 || target.hitPoints <= 0 || !isSourceBuildingCaptureTarget(target) || target.player === 15) {
    return;
  }
  const attacker = sourceUnitId ? findUnit(world, sourceUnitId) : null;
  if (!attacker || attacker.hitPoints <= 0 || attacker.repairRange <= 0 || !arePlayersEnemies(world, attacker.player, target.player)) {
    return;
  }
  if (target.hitPoints > damage * 3) {
    return;
  }
  target.player = attacker.player;
  target.order = null;
  target.moveQueue = [];
  target.attackCooldown = 0;
  target.lastDamagePlayer = null;
  target.lastDamageSourceUnitId = null;
  attacker.order = null;
  attacker.moveQueue = [];
  emitSoundEvent(world, sourceCaptureSoundId(world, attacker.player), attacker.player, target.x, target.y);
}

function isSourceBuildingCaptureTarget(target: WorldUnit): boolean {
  return isBuildingLike(target);
}

function addDamageMissileEffect(world: WorldState, target: WorldUnit, amount: number, attackerPlayer: number | null, sourceTypeId: string | null): void {
  const missileId = world.engineSettings.damageMissileId;
  if (!missileId || world.engineSettings.showDamageDefault === false) {
    return;
  }
  if (!isUnitVisibleToPlayer(world, target, world.visibilityPlayer)) {
    return;
  }
  const missile = missileDefinitionForId(world, missileId);
  const originX = target.x;
  const originY = target.y;
  const targetX = originX + 3;
  const targetY = originY - Math.max(1, missile?.range ?? 16);
  world.projectiles.push({
    id: `damage-missile-${world.tick}-${world.projectiles.length}-${target.id}`,
    sourceId: target.id,
    targetId: null,
    sourceTypeId: sourceTypeId ?? target.typeId,
    player: attackerPlayer ?? target.player,
    x: originX,
    y: originY,
    originX,
    originY,
    targetX,
    targetY,
    speed: projectileSpeedForMissile(missile?.speed ?? 1, "arrow"),
    damage: Math.max(1, amount),
    displayDamage: -Math.max(1, amount),
    missileId,
    className: missile?.className ?? null,
    impactSoundId: null,
    impactMissileId: null,
    splashFactor: 0,
    range: missile?.range ?? 0,
    canHitOwner: false,
    friendlyFire: false,
    canTargetLand: false,
    canTargetSea: false,
    canTargetAir: false,
    bouncesRemaining: 0,
    hitUnitIds: [],
    drawLevel: missile?.drawLevel ?? 150,
    kind: "arrow",
    age: 0,
    delaySeconds: 0,
    ttlSeconds: sourceMissileAnimationDuration(world, missile, 0.8)
  });
}

function sourceCaptureSoundId(world: WorldState, playerId: number): string {
  const race = world.players.find((player) => player.id === playerId)?.race;
  return race === "orc" ? "capture (orc)" : "capture (human)";
}

function revealSourceAttacker(world: WorldState, target: WorldUnit, attackerPlayer: number, sourceUnitId: string | null): void {
  if (!world.engineSettings.revealAttacker || target.player !== world.visibilityPlayer) {
    return;
  }
  const attacker = sourceUnitId ? findUnit(world, sourceUnitId) : findNearestDamagingUnit(world, attackerPlayer, target);
  if (!attacker || attacker.hitPoints <= 0) {
    return;
  }
  const radiusTiles = Math.max(2, Math.min(6, Math.ceil(attacker.sightRangeTiles / 2)));
  revealAreaToPlayer(world, target.player, attacker.x, attacker.y, radiusTiles, sourceOrderRetryTicks(world, 90));
}

function findNearestDamagingUnit(world: WorldState, player: number, target: WorldUnit): WorldUnit | undefined {
  return world.units
    .filter((unit) => unit.player === player && unit.hitPoints > 0)
    .sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))[0];
}

function canDamageObjectiveTarget(world: WorldState, target: WorldUnit, sourceTypeId: string | null): boolean {
  const portalTypes = sourceNamedObjectiveTypeGroup(world, ["unit-dark-portal"], /dark portal|great portal/i);
  if (!portalTypes.includes(target.typeId)) {
    return true;
  }
  if (!hasSourceKhadgarPortalDamageRule(world, portalTypes)) {
    return true;
  }
  const khadgarTypes = sourceNamedObjectiveTypeGroup(world, ["unit-white-mage"], /khadgar|white mage/i);
  return sourceTypeId !== null && khadgarTypes.includes(sourceTypeId);
}

function hasSourceKhadgarPortalDamageRule(world: WorldState, portalTypes: string[]): boolean {
  const sourceVictoryRequiresPortalDestruction = [...world.victoryRequirements, ...world.victoryRequirementGroups.flatMap((group) => group.clauses)]
    .some((requirement) => requirement.kind === "unit-destroyed" && requirement.player === 15 && portalTypes.includes(requirement.unitTypeId));
  if (!sourceVictoryRequiresPortalDestruction) {
    return false;
  }
  const khadgarTypes = sourceNamedObjectiveTypeGroup(world, ["unit-white-mage"], /khadgar|white mage/i);
  return world.defeatRequirements.some((requirement) => (
    requirement.kind === "unit-group-destroyed"
    && requirement.unitTypeId
    && khadgarTypes.includes(requirement.unitTypeId)
  ));
}

function maybeEmitHelpEvent(world: WorldState, target: WorldUnit, attackerPlayer: number | null): void {
  if (attackerPlayer === null || attackerPlayer === target.player || target.player !== world.visibilityPlayer || target.hitPoints <= 0) {
    return;
  }
  const lastTick = world.lastHelpTickByPlayer[target.player] ?? -Infinity;
  if (lastTick >= world.tick) {
    return;
  }
  const lastLocation = world.lastHelpLocationByPlayer[target.player] ?? null;
  const alertDistance = world.tileSize * 14;
  const longCooldownExpired = lastTick + sourceOrderRetryTicks(world, 3600) < world.tick;
  const farFromLastAlert = !lastLocation
    || Math.abs(target.x - lastLocation.x) > alertDistance
    || Math.abs(target.y - lastLocation.y) > alertDistance;
  if (lastLocation && !longCooldownExpired && !farFromLastAlert) {
    return;
  }
  world.lastHelpTickByPlayer[target.player] = world.tick + sourceOrderRetryTicks(world, 60);
  world.lastHelpLocationByPlayer[target.player] = { x: target.x, y: target.y };
  world.events.push({ kind: "unit-help", unitId: target.id, typeId: target.typeId, player: target.player, x: target.x, y: target.y });
}

function spendMana(caster: WorldUnit, cost: number): boolean {
  caster.maxMana ??= maxManaForUnit(caster);
  caster.mana ??= caster.maxMana;
  caster.spellCooldown ??= 0;
  if (caster.hitPoints <= 0 || caster.construction || caster.maxMana <= 0 || caster.mana < cost || caster.spellCooldown > 0) {
    return false;
  }
  caster.mana -= cost;
  return true;
}

function spendSpellMana(world: WorldState, caster: WorldUnit, spellId: string, fallback: number): boolean {
  return spendMana(caster, spellManaCost(world, spellId, fallback));
}

function canCastSpell(world: WorldState, caster: WorldUnit, spellId: string, upgradeId: string | null, manaCost: number): boolean {
  const sourceManaCost = spellManaCost(world, spellId, manaCost);
  return caster.hitPoints > 0
    && !caster.construction
    && canUnitCastSpellId(caster, spellId)
    && hasSpellResearch(world, caster.player, spellId, upgradeId)
    && caster.mana >= sourceManaCost
    && caster.spellCooldown <= 0;
}

function targetedSpellRangeTiles(world: WorldState, requirement: { spellId: string; range: number }): number {
  return spellRangeTiles(world, requirement.spellId, requirement.range);
}

function hasSpellResearch(world: WorldState, playerId: number, spellId: string, fallbackUpgradeId: string | null): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  const requiredUpgradeId = spell ? spell.dependUpgrade : fallbackUpgradeId;
  return !requiredUpgradeId || hasResearched(world, playerId, requiredUpgradeId);
}

function spellManaCost(world: WorldState, spellId: string, fallback: number): number {
  return world.spellDefinitions.find((spell) => spell.id === spellId)?.manaCost ?? fallback;
}

function spellRangeTiles(world: WorldState, spellId: string, fallback: number): number {
  const range = world.spellDefinitions.find((spell) => spell.id === spellId)?.range;
  if (range === "infinite") {
    return Math.max(world.map.width, world.map.height);
  }
  return typeof range === "number" ? range : fallback;
}

function spellAiRangeTiles(world: WorldState, spellId: string, fallback: number): number {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  return spell?.aiCastRange ?? spell?.autocastRange ?? spellRangeTiles(world, spellId, fallback);
}

function spellAutocastRangeTiles(world: WorldState, spellId: string, fallback: number): number {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  return spell?.autocastRange ?? spellRangeTiles(world, spellId, fallback);
}

function sourceHitPointPercentMatches(unit: WorldUnit, minPercent: number | null, maxPercent: number | null): boolean {
  if (minPercent === null && maxPercent === null) {
    return true;
  }
  const percent = unit.maxHitPoints > 0 ? (unit.hitPoints / unit.maxHitPoints) * 100 : 100;
  return (minPercent === null || percent >= minPercent)
    && (maxPercent === null || percent <= maxPercent);
}

function sourceManaPercentMatches(unit: WorldUnit, minPercent: number | null, maxPercent: number | null): boolean {
  if (minPercent === null && maxPercent === null) {
    return true;
  }
  const percent = unit.maxMana > 0 ? (unit.mana / unit.maxMana) * 100 : 0;
  return (minPercent === null || percent >= minPercent)
    && (maxPercent === null || percent <= maxPercent);
}

function unitMatchesSourceCastConditions(world: WorldState, spellId: string, unit: WorldUnit, caster?: Pick<WorldUnit, "id" | "player">): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  if (!spell) {
    return true;
  }
  if (!sourceCastConditionTokensMatch(world, unit, spell.conditions, caster, spell.conditionVariableRules)) {
    return false;
  }
  const targetTokens = spell.aiCast.length > 0 ? spell.aiCast : spell.autocast;
  if (targetTokens.length === 0) {
    return true;
  }
  const minManaPercent = spell.aiCast.length > 0 ? spell.aiCastManaMinPercent : spell.autocastManaMinPercent;
  const maxManaPercent = spell.aiCast.length > 0 ? spell.aiCastManaMaxPercent : spell.autocastManaMaxPercent;
  const minHitPointPercent = spell.aiCast.length > 0 ? spell.aiCastHitPointMinPercent : spell.autocastHitPointMinPercent;
  const maxHitPointPercent = spell.aiCast.length > 0 ? spell.aiCastHitPointMaxPercent : spell.autocastHitPointMaxPercent;
  const targetRules = spell.aiCast.length > 0 ? spell.aiCastVariableRules : spell.autocastVariableRules;
  return sourceCastConditionTokensMatch(world, unit, targetTokens, caster, targetRules)
    && sourceTargetAttackerConditionMatches(world, unit, targetTokens)
    && sourceHitPointPercentMatches(unit, minHitPointPercent, maxHitPointPercent)
    && sourceManaPercentMatches(unit, minManaPercent, maxManaPercent);
}

function unitMatchesSourceSpellConditions(world: WorldState, spellId: string, unit: WorldUnit, caster?: Pick<WorldUnit, "id" | "player">): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  return !spell || sourceCastConditionTokensMatch(world, unit, spell.conditions, caster, spell.conditionVariableRules);
}

function unitMatchesSourceSpellConditionsForPlayer(world: WorldState, spellId: string, player: number, unit: WorldUnit): boolean {
  return unitMatchesSourceSpellConditions(world, spellId, unit, { id: "", player });
}

function sourceCastConditionTokensMatch(world: WorldState, unit: WorldUnit, tokens: string[], caster?: Pick<WorldUnit, "id" | "player">, variableRules: WargusSpell["conditionVariableRules"] = []): boolean {
  if (tokens.length === 0) {
    return true;
  }
  const conditionIndex = tokens.indexOf("condition");
  const startIndex = conditionIndex >= 0 ? conditionIndex + 1 : 0;
  for (let index = startIndex; index < tokens.length; index += 1) {
    const variable = tokens[index];
    const mode = tokens[index + 1];
    if (mode !== "only" && mode !== "false") {
      if (!sourceBareConditionMatches(world, unit, variable, caster, variableRules)) {
        return false;
      }
      continue;
    }
    const matches = sourceCastConditionMatches(world, unit, variable, caster);
    if ((mode === "only" && !matches) || (mode === "false" && matches)) {
      return false;
    }
    index += 1;
  }
  return sourceVariableConditionRulesMatch(world, unit, caster, variableRules);
}

function sourceBareConditionMatches(world: WorldState, unit: WorldUnit, variable: string, caster?: Pick<WorldUnit, "id" | "player">, variableRules: WargusSpell["conditionVariableRules"] = []): boolean {
  if (sourceVariableRuleForCondition(variableRules, variable)) {
    return true;
  }
  if (variable === "HitPoints" || variable === "Mana") {
    return sourceCastConditionMatches(world, unit, variable, caster);
  }
  if (variable === "Haste") {
    return !hasStatusEffect(unit, "haste");
  }
  if (variable === "Slow") {
    return !hasStatusEffect(unit, "slow");
  }
  if (variable === "Bloodlust") {
    return !hasStatusEffect(unit, "bloodlust");
  }
  if (variable === "Invisible") {
    return !hasStatusEffect(unit, "invisibility");
  }
  if (variable === "UnholyArmor") {
    return !hasStatusEffect(unit, "unholy-armor");
  }
  return true;
}

function sourceVariableRuleForCondition(rules: WargusSpell["conditionVariableRules"], variable: string): WargusSpell["conditionVariableRules"][number] | undefined {
  return rules.find((rule) => rule.variable === variable);
}

function sourceCastConditionMatches(world: WorldState, unit: WorldUnit, variable: string, caster?: Pick<WorldUnit, "id" | "player">): boolean {
  if (variable === "Coward") {
    return unit.coward;
  }
  if (variable === "alliance") {
    return Boolean(caster && arePlayersAllied(world, unit.player, caster.player));
  }
  if (variable === "opponent") {
    return Boolean(caster && arePlayersEnemies(world, caster.player, unit.player));
  }
  if (variable === "attacker") {
    return unit.canAttack;
  }
  if (variable === "self") {
    return Boolean(caster && unit.id === caster.id);
  }
  if (variable === "Building") {
    return isBuildingLike(unit);
  }
  if (variable === "AirUnit") {
    return unit.airUnit || unit.kind === "fly";
  }
  if (variable === "LandUnit") {
    return unit.landUnit || unit.kind === "land";
  }
  if (variable === "organic") {
    return unit.organic;
  }
  if (variable === "isundead") {
    return isUndeadUnit(unit);
  }
  if (variable === "HitPoints") {
    return unit.hitPoints < unit.maxHitPoints;
  }
  if (variable === "Mana") {
    return unit.maxMana > 0 && unit.mana > 0;
  }
  return true;
}

function sourceVariableConditionRulesMatch(world: WorldState, unit: WorldUnit, caster: Pick<WorldUnit, "id" | "player"> | undefined, rules: WargusSpell["conditionVariableRules"]): boolean {
  for (const rule of rules) {
    const subject = rule.conditionApplyOnCaster && caster?.id ? findUnit(world, caster.id) ?? unit : unit;
    const value = sourceConditionVariableValue(world, subject, rule.variable);
    const max = sourceConditionVariableMax(subject, rule.variable);
    const enabled = sourceConditionVariableEnabled(subject, rule.variable);
    if (rule.enable && rule.enable !== "ignore") {
      if ((rule.enable === "only" && !enabled) || (rule.enable === "false" && enabled)) {
        return false;
      }
    }
    if (rule.exactValue !== null && value !== rule.exactValue) {
      return false;
    }
    if (rule.exceptValue !== null && value === rule.exceptValue) {
      return false;
    }
    if (rule.minValue !== null && rule.minValue >= value) {
      return false;
    }
    if (rule.maxValue !== null && rule.maxValue <= value) {
      return false;
    }
    if (rule.minMax !== null && rule.minMax >= max) {
      return false;
    }
    if (max > 0 && rule.minValuePercent !== null && rule.minValuePercent * max >= 100 * value) {
      return false;
    }
    if (max > 0 && rule.maxValuePercent !== null && rule.maxValuePercent * max <= 100 * value) {
      return false;
    }
  }
  return true;
}

function sourceConditionVariableValue(world: WorldState, unit: WorldUnit, variable: string): number {
  if (variable === "HitPoints") {
    return unit.hitPoints;
  }
  if (variable === "Mana") {
    return unit.mana;
  }
  const status = sourceStatusKindForVariable(variable);
  if (status) {
    return sourceStatusRemainingCycles(world, unit, status);
  }
  return sourceCastConditionMatches(world, unit, variable) ? 1 : 0;
}

function sourceStatusRemainingCycles(world: WorldState, unit: WorldUnit, status: WorldUnit["statusEffects"][number]["kind"]): number {
  return Math.max(0, Math.round(statusEffectRemainingSeconds(unit, status) * sourceDefaultGameSpeed(world)));
}

function sourceConditionVariableMax(unit: WorldUnit, variable: string): number {
  if (variable === "HitPoints") {
    return unit.maxHitPoints;
  }
  if (variable === "Mana") {
    return unit.maxMana;
  }
  const status = sourceStatusKindForVariable(variable);
  if (status) {
    return Math.max(0, Math.round(statusEffectTotalSeconds(unit, status) * 30));
  }
  return 1;
}

function sourceConditionVariableEnabled(unit: WorldUnit, variable: string): boolean {
  if (variable === "HitPoints") {
    return unit.maxHitPoints > 0;
  }
  if (variable === "Mana") {
    return unit.maxMana > 0;
  }
  const status = sourceStatusKindForVariable(variable);
  return status ? statusEffectRemainingSeconds(unit, status) > 0 : sourceConditionFlagEnabled(unit, variable);
}

function sourceConditionFlagEnabled(unit: WorldUnit, variable: string): boolean {
  if (variable === "Coward") {
    return unit.coward;
  }
  if (variable === "alliance" || variable === "opponent" || variable === "self") {
    return false;
  }
  if (variable === "attacker") {
    return unit.canAttack;
  }
  if (variable === "Building") {
    return isBuildingLike(unit);
  }
  if (variable === "AirUnit") {
    return unit.airUnit || unit.kind === "fly";
  }
  if (variable === "LandUnit") {
    return unit.landUnit || unit.kind === "land";
  }
  if (variable === "organic") {
    return unit.organic;
  }
  if (variable === "isundead") {
    return isUndeadUnit(unit);
  }
  return true;
}

function statusEffectRemainingSeconds(unit: WorldUnit, kind: WorldUnit["statusEffects"][number]["kind"]): number {
  return unit.statusEffects.find((effect) => effect.kind === kind && effect.remainingSeconds > 0)?.remainingSeconds ?? 0;
}

function statusEffectTotalSeconds(unit: WorldUnit, kind: WorldUnit["statusEffects"][number]["kind"]): number {
  return unit.statusEffects.find((effect) => effect.kind === kind && effect.remainingSeconds > 0)?.totalSeconds ?? 0;
}

function sourceTargetAttackerConditionMatches(world: WorldState, unit: WorldUnit, tokens: string[]): boolean {
  const attackerIndex = tokens.indexOf("attacker");
  if (attackerIndex < 0) {
    return true;
  }
  const mode = tokens[attackerIndex + 1];
  if (mode !== "only" && mode !== "false") {
    return true;
  }
  const attacking = sourceUnitIsAttackingNearGoal(world, unit);
  return mode === "only" ? attacking : !attacking;
}

function sourceUnitIsAttackingNearGoal(world: WorldState, unit: WorldUnit): boolean {
  const goal = sourceUnitAttackGoal(world, unit);
  if (!goal) {
    return false;
  }
  const reactionRange = Math.max(sourceReactionRangeForUnit(world, unit), world.tileSize);
  return Math.hypot(unit.x - goal.x, unit.y - goal.y) <= reactionRange + (goal.radius ?? 0);
}

function sourceUnitAttackGoal(world: WorldState, unit: WorldUnit): { x: number; y: number; radius?: number } | null {
  const order = unit.order;
  if (!order) {
    return null;
  }
  if (order.kind === "attack") {
    const target = findUnit(world, order.targetId);
    return target ? { x: target.x, y: target.y, radius: target.radius } : { x: order.targetX, y: order.targetY };
  }
  if (order.kind === "attack-ground") {
    return { x: order.targetX, y: order.targetY };
  }
  if (order.kind === "attack-move" || order.kind === "patrol" || order.kind === "hold") {
    const target = order.targetId ? findUnit(world, order.targetId) : null;
    return target ? { x: target.x, y: target.y, radius: target.radius } : null;
  }
  if (order.kind === "follow" && order.attackTargetId) {
    const target = findUnit(world, order.attackTargetId);
    return target ? { x: target.x, y: target.y, radius: target.radius } : null;
  }
  return null;
}

function spellHitPointAdjust(world: WorldState, spellId: string, fallback: number): number {
  return world.spellDefinitions
    .find((spell) => spell.id === spellId)
    ?.adjustVitals
    .find((adjustment) => adjustment.variable === "hit-points")
    ?.amount ?? fallback;
}

function spellCallbackVariableAdjustment(world: WorldState, spellId: string, variable: string, fallback: number): number {
  const values = world.spellDefinitions
    .find((spell) => spell.id === spellId)
    ?.callbackUnitVariables
    .filter((adjustment) => adjustment.variable === variable)
    .map((adjustment) => adjustment.value) ?? [];
  return values.length > 0 ? Math.max(...values) : fallback;
}

function spellMissileDamage(world: WorldState, spellId: string, missileId: string, fallback: number): number {
  return world.spellDefinitions
    .find((spell) => spell.id === spellId)
    ?.missileDamages
    .find((missile) => missile.missile === missileId)
    ?.damage ?? fallback;
}

function spellMissileDamageTotal(world: WorldState, spellId: string, missileId: string, fallback: number): number {
  const damages = world.spellDefinitions
    .find((spell) => spell.id === spellId)
    ?.missileDamages
    .filter((missile) => missile.missile === missileId)
    .map((missile) => missile.damage) ?? [];
  return damages.length > 0 ? damages.reduce((total, damage) => total + damage, 0) : fallback;
}

function spellPrimaryMissileDamage(world: WorldState, spellId: string, fallback: number): number {
  const missileId = sourceSpellMissileId(world, spellId);
  return missileId ? spellMissileDamage(world, spellId, missileId, fallback) : fallback;
}

function spellPrimaryMissileTtlSeconds(world: WorldState, spellId: string, fallback: number): number {
  const missileId = sourceSpellMissileId(world, spellId);
  return missileId ? spellMissileTtlSeconds(world, spellId, missileId, fallback) : fallback;
}

function spellMissileTtlSeconds(world: WorldState, spellId: string, missileId: string, fallback: number): number {
  const ttls = world.spellDefinitions
    .find((spell) => spell.id === spellId)
    ?.missileSpawns
    .filter((missile) => missile.missile === missileId && typeof missile.ttl === "number")
    .map((missile) => missile.ttl as number) ?? [];
  return ttls.length > 0 ? sourceCyclesToSeconds(world, Math.max(...ttls)) : fallback;
}

function spellMissileOffsets(world: WorldState, spellId: string, missileId: string): Array<{ x: number; y: number }> {
  return spellMissileEndOffsets(world, spellId, missileId);
}

function spellMissileEndOffsets(world: WorldState, spellId: string, missileId: string): Array<{ x: number; y: number }> {
  return world.spellDefinitions
    .find((spell) => spell.id === spellId)
    ?.missileSpawns
    .filter((missile) => missile.missile === missileId)
    .map((missile) => ({
      x: missile.endOffsetX ?? missile.startOffsetX ?? 0,
      y: missile.endOffsetY ?? missile.startOffsetY ?? 0
    })) ?? [];
}

function sourceAreaBombardment(world: WorldState, spellId: string): WargusSpell["areaBombardments"][number] | null {
  return world.spellDefinitions.find((spell) => spell.id === spellId)?.areaBombardments[0] ?? null;
}

function areaBombardmentRadius(world: WorldState, spellId: string, fallback: number): number {
  const sourceArea = sourceAreaBombardment(world, spellId);
  return sourceArea ? sourceAreaBombardmentRadius(world, sourceArea) : fallback;
}

function areaBombardmentDuration(world: WorldState, spellId: string, fallback: number): number {
  const shards = sourceAreaBombardment(world, spellId)?.shards;
  return typeof shards === "number" && shards > 0 ? sourceCyclesToSeconds(world, shards * areaBombardmentPulseTicks(world, spellId)) : fallback;
}

function areaBombardmentPulseTicks(world: WorldState, spellId: string): number {
  const missile = missileDefinitionForId(world, sourceSpellMissileId(world, spellId));
  return missile && missile.blizzardSpeed > 0 ? missile.blizzardSpeed : 10;
}

function sourceAreaBombardmentRadius(world: WorldState, sourceArea: WargusSpell["areaBombardments"][number]): number {
  const fields = Math.max(1, Math.floor(sourceArea.fields ?? 1));
  const fieldSize = fields * world.tileSize;
  const startOffsetX = sourceArea.startOffsetX ?? -fieldSize / 2;
  const startOffsetY = sourceArea.startOffsetY ?? -fieldSize / 2;
  const maxX = Math.max(Math.abs(startOffsetX), Math.abs(startOffsetX + fieldSize));
  const maxY = Math.max(Math.abs(startOffsetY), Math.abs(startOffsetY + fieldSize));
  return Math.max(world.tileSize, Math.hypot(maxX, maxY));
}

function holyVisionRevealRadius(world: WorldState): number {
  const revealerTypeId = sourceRevealerSummonUnitTypeId(world, "spell-holy-vision", "unit-revealer");
  const revealerDefinition = world.unitDefinitions.find((unit) => unit.id === revealerTypeId);
  return Math.max(1, revealerDefinition?.sightRange ?? 6) * world.tileSize;
}

function holyVisionRevealDuration(world: WorldState): number {
  const revealerTypeId = sourceRevealerSummonUnitTypeId(world, "spell-holy-vision", "unit-revealer");
  return spellSummonLifetimeSeconds(world, "spell-holy-vision", revealerTypeId, 8);
}

function createHolyVisionRevealer(world: WorldState, player: number, x: number, y: number): WorldUnit | null {
  const revealerTypeId = sourceRevealerSummonUnitTypeId(world, "spell-holy-vision", "unit-revealer");
  const revealerDefinition = world.unitDefinitions.find((unit) => unit.id === revealerTypeId);
  if (!revealerDefinition) {
    return null;
  }
  const tile = worldToTile(world, x, y);
  const revealer = createWorldUnit({
    unit: revealerDefinition,
    id: `${revealerTypeId}-${world.nextUnitSerial}`,
    player,
    tileX: tile.x,
    tileY: tile.y,
    tileset: world.map.setup?.tileset ?? null
  });
  revealer.lifetimeSeconds = spellSummonLifetimeSeconds(world, "spell-holy-vision", revealerDefinition.id, 8);
  revealer.nonSolid = true;
  revealer.selectableByRectangle = false;
  revealer.order = null;
  revealer.moveQueue = [];
  world.nextUnitSerial += 1;
  world.units.push(revealer);
  return revealer;
}

function sourceRevealerSummonUnitTypeId(world: WorldState, spellId: string, fallback: string): string {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  const revealerSummon = spell?.summons.find((summon) => {
    const definition = world.unitDefinitions.find((unit) => unit.id === summon.unitTypeId);
    return definition?.revealer === true || definition?.vanishes === true || definition?.nonSolid === true;
  });
  return revealerSummon?.unitTypeId ?? spell?.summons[0]?.unitTypeId ?? fallback;
}

function spellSummonLifetimeSeconds(world: WorldState, spellId: string, unitTypeId: string, fallback: number): number {
  const timeToLive = world.spellDefinitions
    .find((spell) => spell.id === spellId)
    ?.summons
    .find((summon) => summon.unitTypeId === unitTypeId)
    ?.timeToLive;
  return typeof timeToLive === "number" ? sourceCyclesToSeconds(world, timeToLive) : fallback;
}

function spellCallbackUnitLifetimeSeconds(world: WorldState, spellId: string, unitTypeId: string, fallback: number): number {
  const ttl = world.spellDefinitions
    .find((spell) => spell.id === spellId)
    ?.callbackUnitVariables
    .find((variable) => variable.unitTypeId === unitTypeId && variable.variable === "TTL")
    ?.value;
  return typeof ttl === "number" ? sourceCyclesToSeconds(world, ttl) : fallback;
}

function canUnitCastSpellId(caster: WorldUnit, spellId: string): boolean {
  return caster.canCastSpells.includes(spellId);
}

function maxManaForUnit(unit: Pick<WorldUnit, "canCastSpells" | "manaEnabled" | "maxMana">): number {
  if (unit.manaEnabled || unit.canCastSpells.length > 0) {
    return Math.max(0, unit.maxMana ?? 0);
  }
  return 0;
}

function maxManaForUnitDefinition(unit: Pick<WargusUnit, "canCastSpells" | "manaEnabled" | "manaMax">): number {
  if (unit.manaEnabled === true || (unit.canCastSpells ?? []).length > 0) {
    return Math.max(0, unit.manaMax ?? 0);
  }
  return 0;
}

function findNearestEnemyInSpellRange(world: WorldState, caster: WorldUnit, rangeTiles: number, predicate?: (unit: WorldUnit) => boolean, priority?: WargusSpell["aiCastPriority"]): WorldUnit | undefined {
  return world.units
    .filter((unit) => arePlayersEnemies(world, caster.player, unit.player) && unit.hitPoints > 0 && isUnitVisibleToPlayer(world, unit, caster.player))
    .filter((unit) => predicate ? predicate(unit) : true)
    .filter((unit) => Math.hypot(unit.x - caster.x, unit.y - caster.y) <= rangeTiles * world.tileSize + unit.radius)
    .sort((a, b) => compareSourceSpellTargets(world, caster, a, b, priority))[0];
}

function findNearestFriendlySpellTarget(world: WorldState, caster: WorldUnit, rangeTiles = 7, predicate?: (unit: WorldUnit) => boolean, priority?: WargusSpell["aiCastPriority"]): WorldUnit | undefined {
  return world.units
    .filter((unit) => arePlayersAllied(world, caster.player, unit.player) && unit.player !== 15 && unit.hitPoints > 0 && isUnitVisibleToPlayer(world, unit, caster.player))
    .filter((unit) => predicate ? predicate(unit) : true)
    .filter((unit) => Math.hypot(unit.x - caster.x, unit.y - caster.y) <= rangeTiles * world.tileSize + unit.radius)
    .sort((a, b) => compareSourceSpellTargets(world, caster, a, b, priority))[0];
}

function findSpellEnemyNearPoint(world: WorldState, caster: WorldUnit, x: number, y: number, rangeTiles: number, predicate?: (unit: WorldUnit) => boolean): WorldUnit | undefined {
  return world.units
    .filter((unit) => arePlayersEnemies(world, caster.player, unit.player) && unit.hitPoints > 0 && isUnitVisibleToPlayer(world, unit, caster.player))
    .filter((unit) => predicate ? predicate(unit) : true)
    .filter((unit) => Math.hypot(unit.x - caster.x, unit.y - caster.y) <= rangeTiles * world.tileSize + unit.radius)
    .filter((unit) => Math.hypot(unit.x - x, unit.y - y) <= Math.max(unit.radius + 18, 38))
    .sort((a, b) => distanceSquared({ x, y }, a) - distanceSquared({ x, y }, b))[0];
}

function findSpellFriendlyNearPoint(world: WorldState, caster: WorldUnit, x: number, y: number, rangeTiles: number, predicate?: (unit: WorldUnit) => boolean): WorldUnit | undefined {
  return world.units
    .filter((unit) => arePlayersAllied(world, caster.player, unit.player) && unit.player !== 15 && unit.hitPoints > 0 && isUnitVisibleToPlayer(world, unit, caster.player))
    .filter((unit) => predicate ? predicate(unit) : true)
    .filter((unit) => Math.hypot(unit.x - caster.x, unit.y - caster.y) <= rangeTiles * world.tileSize + unit.radius)
    .filter((unit) => Math.hypot(unit.x - x, unit.y - y) <= Math.max(unit.radius + 18, 38))
    .sort((a, b) => distanceSquared({ x, y }, a) - distanceSquared({ x, y }, b))[0];
}

function sourceSpellAiPriority(world: WorldState, spellId: string): WargusSpell["aiCastPriority"] {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  return spell?.aiCastPriority ?? spell?.autocastPriority ?? null;
}

function compareSourceSpellTargets(world: WorldState, caster: WorldUnit, left: WorldUnit, right: WorldUnit, priority: WargusSpell["aiCastPriority"] | undefined): number {
  if (priority) {
    const leftValue = sourceSpellPriorityValue(world, caster, left, priority.variable);
    const rightValue = sourceSpellPriorityValue(world, caster, right, priority.variable);
    const primary = priority.reverseSort ? rightValue - leftValue : leftValue - rightValue;
    if (primary !== 0) {
      return primary;
    }
  }
  return distanceSquared(caster, left) - distanceSquared(caster, right);
}

function sourceSpellPriorityValue(world: WorldState, caster: WorldUnit, target: WorldUnit, variable: string): number {
  if (variable === "Distance") {
    return Math.hypot(target.x - caster.x, target.y - caster.y) / world.tileSize;
  }
  if (variable === "HitPoints") {
    return target.hitPoints;
  }
  if (variable === "Points") {
    return target.points;
  }
  if (variable === "Priority") {
    return target.priority;
  }
  return 0;
}

function isPointInSpellRange(world: WorldState, caster: WorldUnit, x: number, y: number, rangeTiles: number): boolean {
  return isWorldPointInsideMap(world, x, y) && Math.hypot(x - caster.x, y - caster.y) <= rangeTiles * world.tileSize;
}

function isWorldPointInsideMap(world: WorldState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < world.map.width * world.tileSize && y < world.map.height * world.tileSize;
}

function refundMana(caster: WorldUnit, cost: number): void {
  caster.mana = Math.min(caster.maxMana, caster.mana + cost);
}

function refundSpellMana(world: WorldState, caster: WorldUnit, spellId: string, fallback: number): void {
  refundMana(caster, spellManaCost(world, spellId, fallback));
}

function spellTargetMatchesSource(world: WorldState, spellId: string, caster: WorldUnit, unit: WorldUnit, predicate: (unit: WorldUnit) => boolean): boolean {
  return predicate(unit)
    && unitMatchesSourceSpellConditions(world, spellId, unit, caster)
    && unitMatchesSourceSpellTargetConditions(world, spellId, unit);
}

function unitMatchesSourceSpellTargetConditions(world: WorldState, spellId: string, unit: WorldUnit): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  if (!spell) {
    return true;
  }
  return !sourceConditionTokensExcludeCoward(spell.autocast, spell.aiCast) || !unit.coward;
}

function sourceConditionTokensExcludeCoward(...tokenGroups: string[][]): boolean {
  return tokenGroups.some((tokens) => {
    const conditionIndex = tokens.indexOf("condition");
    const startIndex = conditionIndex >= 0 ? conditionIndex + 1 : 0;
    for (let index = startIndex; index < tokens.length - 1; index += 1) {
      if (tokens[index] === "Coward" && tokens[index + 1] === "false") {
        return true;
      }
    }
    return false;
  });
}

function finishSpellCast(world: WorldState, caster: WorldUnit, fallbackCooldownSeconds: number): boolean {
  removeStatusEffect(caster, "invisibility");
  caster.spellCooldown = spellCastCooldownForUnit(world, caster, fallbackCooldownSeconds);
  return true;
}

function spellCastCooldownForUnit(world: WorldState, caster: WorldUnit, fallbackCooldownSeconds: number): number {
  if (!caster.animation) {
    return fallbackCooldownSeconds;
  }
  const animation = world.animationDefinitions.find((candidate) => candidate.id === caster.animation);
  const spellCastFrames = animation?.actions.SpellCast;
  if (!spellCastFrames || spellCastFrames.length === 0) {
    return fallbackCooldownSeconds;
  }
  const cycles = spellCastFrames.reduce((sum, frame) => sum + Math.max(1, Math.floor(frame.wait || 1)), 0);
  return Math.max(sourceCyclesToSeconds(world, 1), sourceCyclesToSeconds(world, cycles));
}

function castHealAt(world: WorldState, caster: WorldUnit, target: WorldUnit | undefined): boolean {
  if (!canUnitCastSpellId(caster, "spell-healing") || !hasSpellResearch(world, caster.player, "spell-healing", "upgrade-healing") || !canCastSpell(world, caster, "spell-healing", "upgrade-healing", 6)) {
    return false;
  }
  if (!target || !spellTargetMatchesSource(world, "spell-healing", caster, target, canHealTarget)) {
    return false;
  }
  applySourceHitPointAdjustment(world, caster, target, "spell-healing", spellHitPointAdjust(world, "spell-healing", 30), 6);
  addSpellEffect(world, "heal", caster.player, target.x, target.y, sourceSpellVisualRadius(world, "spell-healing", 34), sourceSpellAnimationDuration(world, "spell-healing", 0.55), null, sourceSpellCastSound(world, "spell-healing"), sourceSpellMissileId(world, "spell-healing"), "spell-healing");
  return finishSpellCast(world, caster, 0.6);
}

function canHealTarget(unit: WorldUnit): boolean {
  return unit.organic
    && !isBuildingLike(unit)
    && unit.hitPoints > 0
    && unit.hitPoints < unit.maxHitPoints
    && !unit.coward
    && !isUndeadUnit(unit);
}

function canExorcismTarget(unit: WorldUnit): boolean {
  return isUndeadUnit(unit) && !isBuildingLike(unit);
}

function castExorcismAt(world: WorldState, caster: WorldUnit, target: WorldUnit | undefined): boolean {
  if (!canUnitCastSpellId(caster, "spell-exorcism") || !hasSpellResearch(world, caster.player, "spell-exorcism", "upgrade-exorcism") || !canCastSpell(world, caster, "spell-exorcism", "upgrade-exorcism", 4)) {
    return false;
  }
  if (!target || !spellTargetMatchesSource(world, "spell-exorcism", caster, target, canExorcismTarget)) {
    return false;
  }
  applySourceHitPointAdjustment(world, caster, target, "spell-exorcism", spellHitPointAdjust(world, "spell-exorcism", -55), 4);
  addSpellEffect(world, "exorcism", caster.player, target.x, target.y, sourceSpellVisualRadius(world, "spell-exorcism", 46), sourceSpellAnimationDuration(world, "spell-exorcism", 0.8), null, sourceSpellCastSound(world, "spell-exorcism"), sourceSpellMissileId(world, "spell-exorcism"), "spell-exorcism");
  return finishSpellCast(world, caster, 1.1);
}

function castHolyVisionAt(world: WorldState, caster: WorldUnit, x: number, y: number): boolean {
  if (!canUnitCastSpellId(caster, "spell-holy-vision") || !hasSpellResearch(world, caster.player, "spell-holy-vision", "upgrade-holy-vision") || !isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, "spell-holy-vision", Infinity)) || !spendSpellMana(world, caster, "spell-holy-vision", 70)) {
    return false;
  }
  createHolyVisionRevealer(world, caster.player, x, y);
  addSpellEffect(world, "holy-vision", caster.player, x, y, holyVisionRevealRadius(world), holyVisionRevealDuration(world), null, sourceSpellCastSound(world, "spell-holy-vision"), sourceSpellMissileId(world, "spell-holy-vision"), "spell-holy-vision");
  updateVisibility(world);
  return finishSpellCast(world, caster, 1.4);
}

function castFireballAt(world: WorldState, caster: WorldUnit, x: number, y: number): boolean {
  if (!canUnitCastSpellId(caster, "spell-fireball") || !hasSpellResearch(world, caster.player, "spell-fireball", "upgrade-fireball") || !isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, "spell-fireball", 8)) || !spendSpellMana(world, caster, "spell-fireball", 100)) {
    return false;
  }
  const target = findSpellEnemyNearPoint(world, caster, x, y, spellRangeTiles(world, "spell-fireball", 8));
  if (target) {
    applyFireballImpact(world, caster, target.x, target.y);
  }
  addSpellEffect(world, "fireball", caster.player, x, y, sourceSpellVisualRadius(world, "spell-fireball", 46), sourceSpellAnimationDuration(world, "spell-fireball", 0.65), null, sourceSpellCastSound(world, "spell-fireball"), sourceSpellMissileId(world, "spell-fireball"), "spell-fireball");
  return finishSpellCast(world, caster, 1.1);
}

function castFlameShieldAt(world: WorldState, caster: WorldUnit, target: WorldUnit | undefined): boolean {
  const spellId = "spell-flame-shield";
  if (!canUnitCastSpellId(caster, spellId) || !hasSpellResearch(world, caster.player, spellId, "upgrade-flame-shield") || !spendSpellMana(world, caster, spellId, 50)) {
    return false;
  }
  if (!target || !spellTargetMatchesSource(world, spellId, caster, target, canFlameShieldTarget)) {
    refundSpellMana(world, caster, spellId, 50);
    return false;
  }
  const missileId = sourceFlameShieldMissileId(world, spellId);
  addStatusEffect(target, "flame-shield", spellMissileTtlSeconds(world, spellId, missileId, sourceCyclesToSeconds(world, 628)), 1);
  addSpellEffect(world, "flame-shield", caster.player, target.x, target.y, sourceSpellVisualRadius(world, spellId, 56), sourceSpellAnimationDuration(world, spellId, 0.9), caster.typeId, sourceSpellCastSound(world, spellId), missileId, spellId, caster.id);
  return finishSpellCast(world, caster, 1.2);
}

function castBlizzardAt(world: WorldState, caster: WorldUnit, x: number, y: number): boolean {
  if (!canUnitCastSpellId(caster, "spell-blizzard") || !hasSpellResearch(world, caster.player, "spell-blizzard", "upgrade-blizzard") || !isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, "spell-blizzard", 12)) || !spendSpellMana(world, caster, "spell-blizzard", 25)) {
    return false;
  }
  addSpellEffect(world, "blizzard", caster.player, x, y, areaBombardmentRadius(world, "spell-blizzard", 86), areaBombardmentDuration(world, "spell-blizzard", 4.8), caster.typeId, sourceSpellCastSound(world, "spell-blizzard"), sourceSpellMissileId(world, "spell-blizzard"), "spell-blizzard", caster.id);
  return finishSpellCast(world, caster, 1.8);
}

function castPolymorphAt(world: WorldState, caster: WorldUnit, target: WorldUnit | undefined): boolean {
  if (!canUnitCastSpellId(caster, "spell-polymorph") || !hasSpellResearch(world, caster.player, "spell-polymorph", "upgrade-polymorph") || !spendSpellMana(world, caster, "spell-polymorph", 200)) {
    return false;
  }
  if (!target || !spellTargetMatchesSource(world, "spell-polymorph", caster, target, canPolymorphTarget) || !applyPolymorphTransform(world, "spell-polymorph", target)) {
    refundSpellMana(world, caster, "spell-polymorph", 200);
    return false;
  }
  addSpellEffect(world, "polymorph", caster.player, target.x, target.y, sourceSpellVisualRadius(world, "spell-polymorph", 42), sourceSpellAnimationDuration(world, "spell-polymorph", 0.9), null, sourceSpellCastSound(world, "spell-polymorph"), sourceSpellMissileId(world, "spell-polymorph"), "spell-polymorph");
  return finishSpellCast(world, caster, 1.4);
}

function castSlowAt(world: WorldState, caster: WorldUnit, target: WorldUnit | undefined): boolean {
  if (!canUnitCastSpellId(caster, "spell-slow") || !hasSpellResearch(world, caster.player, "spell-slow", "upgrade-slow") || !spendSpellMana(world, caster, "spell-slow", 50)) {
    return false;
  }
  if (!target || !spellTargetMatchesSource(world, "spell-slow", caster, target, canSlowTarget)) {
    refundSpellMana(world, caster, "spell-slow", 50);
    return false;
  }
  applySourceVariableStatusAdjustments(world, target, "spell-slow", { Slow: { fallbackCycles: 1000, speedMultiplier: 0.55 } });
  target.attackCooldown = Math.max(target.attackCooldown, 1);
  addSpellEffect(world, "slow", caster.player, target.x, target.y, sourceSpellVisualRadius(world, "spell-slow", 40), sourceSpellAnimationDuration(world, "spell-slow", 0.8), null, sourceSpellCastSound(world, "spell-slow"), sourceSpellMissileId(world, "spell-slow"), "spell-slow");
  return finishSpellCast(world, caster, 1);
}

function castInvisibilityAt(world: WorldState, caster: WorldUnit, target: WorldUnit | undefined): boolean {
  if (!canUnitCastSpellId(caster, "spell-invisibility") || !hasSpellResearch(world, caster.player, "spell-invisibility", "upgrade-invisibility") || !spendSpellMana(world, caster, "spell-invisibility", 200)) {
    return false;
  }
  if (!target || !spellTargetMatchesSource(world, "spell-invisibility", caster, target, canInvisibilityTarget)) {
    refundSpellMana(world, caster, "spell-invisibility", 200);
    return false;
  }
  applySourceVariableStatusAdjustments(world, target, "spell-invisibility", { Invisible: { fallbackCycles: 2000, speedMultiplier: 1 } });
  addSpellEffect(world, "invisibility", caster.player, target.x, target.y, sourceSpellVisualRadius(world, "spell-invisibility", 38), sourceSpellAnimationDuration(world, "spell-invisibility", 0.85), null, sourceSpellCastSound(world, "spell-invisibility"), sourceSpellMissileId(world, "spell-invisibility"), "spell-invisibility");
  if (target.id === caster.id) {
    caster.spellCooldown = spellCastCooldownForUnit(world, caster, 1.2);
    return true;
  }
  return finishSpellCast(world, caster, 1.2);
}

function castDeathCoilAt(world: WorldState, caster: WorldUnit, target: WorldUnit | undefined): boolean {
  if (!canUnitCastSpellId(caster, "spell-death-coil") || !hasSpellResearch(world, caster.player, "spell-death-coil", "upgrade-death-coil") || !spendSpellMana(world, caster, "spell-death-coil", 100)) {
    return false;
  }
  if (!target || !spellTargetMatchesSource(world, "spell-death-coil", caster, target, canDeathCoilTarget)) {
    refundSpellMana(world, caster, "spell-death-coil", 100);
    return false;
  }
  const impacts = applyDeathCoilAt(world, caster, target.x, target.y);
  if (impacts.length === 0) {
    refundSpellMana(world, caster, "spell-death-coil", 100);
    return false;
  }
  for (const [index, impact] of impacts.entries()) {
    addSpellEffect(world, "death-coil", caster.player, impact.x, impact.y, sourceSpellVisualRadius(world, "spell-death-coil", 42), sourceSpellAnimationDuration(world, "spell-death-coil", 0.75), null, index === 0 ? sourceSpellCastSound(world, "spell-death-coil") : null, sourceSpellMissileId(world, "spell-death-coil"), "spell-death-coil");
  }
  return finishSpellCast(world, caster, 1.2);
}

function castDeathAndDecayAt(world: WorldState, caster: WorldUnit, x: number, y: number): boolean {
  if (!canUnitCastSpellId(caster, "spell-death-and-decay") || !hasSpellResearch(world, caster.player, "spell-death-and-decay", "upgrade-death-and-decay") || !isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, "spell-death-and-decay", 12)) || !spendSpellMana(world, caster, "spell-death-and-decay", 25)) {
    return false;
  }
  addSpellEffect(world, "death-and-decay", caster.player, x, y, areaBombardmentRadius(world, "spell-death-and-decay", 78), areaBombardmentDuration(world, "spell-death-and-decay", 5.2), caster.typeId, sourceSpellCastSound(world, "spell-death-and-decay"), sourceSpellMissileId(world, "spell-death-and-decay"), "spell-death-and-decay", caster.id);
  return finishSpellCast(world, caster, 1.7);
}

function castWhirlwindAt(world: WorldState, caster: WorldUnit, x: number, y: number): boolean {
  if (!canUnitCastSpellId(caster, "spell-whirlwind") || !hasSpellResearch(world, caster.player, "spell-whirlwind", "upgrade-whirlwind") || !isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, "spell-whirlwind", 12)) || !spendSpellMana(world, caster, "spell-whirlwind", 100)) {
    return false;
  }
  const radius = sourceSpellEffectRadius(world, "spell-whirlwind", 72);
  addSpellEffect(world, "whirlwind", caster.player, x, y, radius, spellPrimaryMissileTtlSeconds(world, "spell-whirlwind", sourceCyclesToSeconds(world, 800)), caster.typeId, sourceSpellCastSound(world, "spell-whirlwind"), sourceSpellMissileId(world, "spell-whirlwind"), "spell-whirlwind", caster.id);
  return finishSpellCast(world, caster, 1.5);
}

function castRaiseDeadAt(world: WorldState, caster: WorldUnit, x: number, y: number): boolean {
  if (!canUnitCastSpellId(caster, "spell-raise-dead") || !hasSpellResearch(world, caster.player, "spell-raise-dead", "upgrade-raise-dead") || !spendSpellMana(world, caster, "spell-raise-dead", 50)) {
    return false;
  }
  const skeletonDefinition = raisedSkeletonDefinition(world);
  const corpse = findRaiseDeadCorpseNearPoint(world, caster, x, y, spellRangeTiles(world, "spell-raise-dead", 6));
  const spawn = skeletonDefinition && corpse ? findSpellSpawnTileNear(world, corpse.x, corpse.y, skeletonDefinition) ?? findSpellSpawnTile(world, caster, skeletonDefinition) : null;
  if (!skeletonDefinition || !corpse || !spawn) {
    refundSpellMana(world, caster, "spell-raise-dead", 50);
    return false;
  }
  world.corpses = (world.corpses ?? []).filter((candidate) => candidate.id !== corpse.id);
  const skeleton = createRaisedSkeleton(world, caster.player, skeletonDefinition, spawn.x, spawn.y, spellSummonLifetimeSeconds(world, "spell-raise-dead", skeletonDefinition.id, FALLBACK_RAISED_SKELETON_LIFETIME_SECONDS));
  world.units.push(skeleton);
  recordPlayerUnitCreated(world, skeleton);
  addSpellEffect(world, "raise-dead", caster.player, skeleton.x, skeleton.y, sourceSpellVisualRadius(world, "spell-raise-dead", 44), sourceSpellAnimationDuration(world, "spell-raise-dead", 0.9), null, sourceSpellCastSound(world, "spell-raise-dead"), sourceSpellMissileId(world, "spell-raise-dead"), "spell-raise-dead");
  return finishSpellCast(world, caster, 1.4);
}

function findSourceAdjustVitalsTarget(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): WorldUnit | undefined {
  const amount = spellHitPointAdjust(world, spellId, 0);
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  const rangeTiles = spellRangeTiles(world, spellId, typeof spell?.range === "number" ? spell.range : 6);
  if (amount > 0) {
    return findSpellFriendlyNearPoint(world, caster, x, y, rangeTiles, (unit) => spellTargetMatchesSource(world, spellId, caster, unit, (candidate) => candidate.hitPoints > 0 && candidate.hitPoints < candidate.maxHitPoints));
  }
  if (amount < 0) {
    return findSpellEnemyNearPoint(world, caster, x, y, rangeTiles, (unit) => spellTargetMatchesSource(world, spellId, caster, unit, (candidate) => candidate.hitPoints > 0));
  }
  return undefined;
}

function canIssueSourceAdjustVitalsAt(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  return Boolean(
    spell
    && spell.adjustVitals.some((adjustment) => adjustment.variable === "hit-points")
    && canCastSpell(world, caster, spellId, spell.dependUpgrade, spell.manaCost)
    && findSourceAdjustVitalsTarget(world, caster, spellId, x, y)
  );
}

function castSourceAdjustVitalsAt(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  const amount = spellHitPointAdjust(world, spellId, 0);
  if (!spell || amount === 0 || !canCastSpell(world, caster, spellId, spell.dependUpgrade, spell.manaCost)) {
    return false;
  }
  const target = findSourceAdjustVitalsTarget(world, caster, spellId, x, y);
  if (!target) {
    return false;
  }
  applySourceHitPointAdjustment(world, caster, target, spellId, amount, spell.manaCost);
  addSpellEffect(world, amount > 0 ? "heal" : "exorcism", caster.player, target.x, target.y, sourceSpellVisualRadius(world, spellId, amount > 0 ? 34 : 46), sourceSpellAnimationDuration(world, spellId, amount > 0 ? 0.55 : 0.8), null, sourceSpellCastSound(world, spellId), sourceSpellMissileId(world, spellId), spellId);
  return finishSpellCast(world, caster, 0.6);
}

function applySourceHitPointAdjustment(world: WorldState, caster: WorldUnit, target: WorldUnit, spellId: string, amount: number, fallbackManaCost: number): void {
  const castCount = sourceAdjustVitalsCastCount(world, caster, target, spellId, amount, fallbackManaCost);
  caster.mana = Math.max(0, caster.mana - spellManaCost(world, spellId, fallbackManaCost) * castCount);
  if (amount > 0) {
    target.hitPoints = Math.min(target.maxHitPoints, target.hitPoints + amount * castCount);
    return;
  }
  applyDamage(world, target, Math.abs(amount) * castCount, caster.player, caster.typeId);
}

function sourceAdjustVitalsCastCount(world: WorldState, caster: WorldUnit, target: WorldUnit, spellId: string, amount: number, fallbackManaCost: number): number {
  if (amount === 0) {
    return 0;
  }
  const manaCost = Math.max(0, Math.floor(spellManaCost(world, spellId, fallbackManaCost)));
  const hitPointDelta = amount > 0 ? target.maxHitPoints - target.hitPoints : target.hitPoints;
  const perCast = Math.max(1, Math.abs(amount));
  const desiredCasts = amount > 0
    ? Math.floor(Math.max(0, hitPointDelta) / perCast)
    : Math.ceil(Math.max(0, hitPointDelta) / perCast);
  const manaLimitedCasts = manaCost > 0 ? Math.floor(Math.max(0, caster.mana) / manaCost) : desiredCasts;
  return Math.max(1, Math.min(desiredCasts || 1, manaLimitedCasts || 1));
}

type SourceStatusAdjustment = {
  kind: WorldUnit["statusEffects"][number]["kind"];
  amount: number;
};

function sourceAdjustVariableStatusAdjustments(world: WorldState, spellId: string): SourceStatusAdjustment[] {
  return (world.spellDefinitions.find((candidate) => candidate.id === spellId)?.variableAdjustments ?? [])
    .map((adjustment) => {
      const kind = sourceStatusKindForVariable(adjustment.variable);
      return kind ? { kind, amount: adjustment.amount } : null;
    })
    .filter((adjustment): adjustment is SourceStatusAdjustment => adjustment !== null);
}

function sourceAdjustVariableStatusKinds(world: WorldState, spellId: string, positiveOnly = false): Array<WorldUnit["statusEffects"][number]["kind"]> {
  const kinds = sourceAdjustVariableStatusAdjustments(world, spellId)
    .filter((adjustment) => !positiveOnly || adjustment.amount > 0)
    .map((adjustment) => adjustment.kind);
  return Array.from(new Set(kinds));
}

function sourceAdjustVariableTargetPredicate(world: WorldState, spellId: string, caster: WorldUnit): (unit: WorldUnit) => boolean {
  const positiveStatusKinds = sourceAdjustVariableStatusKinds(world, spellId, true);
  const removalStatusKinds = sourceAdjustVariableStatusAdjustments(world, spellId)
    .filter((adjustment) => adjustment.amount <= 0)
    .map((adjustment) => adjustment.kind);
  const positiveStatusKindsWithSourceRules = positiveStatusKinds.filter((kind) => sourceStatusKindHasConditionRule(world, spellId, kind));
  return (unit) => {
    if (!canTargetMobileSpell(unit)) {
      return false;
    }
    return spellTargetMatchesSource(world, spellId, caster, unit, (candidate) => {
      if (positiveStatusKinds.length > 0) {
        return positiveStatusKinds.some((kind) => (
          positiveStatusKindsWithSourceRules.includes(kind) || !hasStatusEffect(candidate, kind)
        ));
      }
      return removalStatusKinds.some((kind) => hasStatusEffect(candidate, kind));
    });
  };
}

function sourceStatusKindHasConditionRule(world: WorldState, spellId: string, kind: WorldUnit["statusEffects"][number]["kind"]): boolean {
  const variable = sourceStatusVariableForKind(kind);
  return Boolean(variable && world.spellDefinitions.find((candidate) => candidate.id === spellId)?.conditionVariableRules?.some((rule) => rule.variable === variable));
}

function findSourceAdjustVariableTarget(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): WorldUnit | undefined {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  const rangeTiles = spellRangeTiles(world, spellId, typeof spell?.range === "number" ? spell.range : 6);
  const predicate = sourceAdjustVariableTargetPredicate(world, spellId, caster);
  if (sourceAdjustVariableStatusKinds(world, spellId, true).includes("slow")) {
    return findSpellEnemyNearPoint(world, caster, x, y, rangeTiles, predicate);
  }
  return findSpellFriendlyNearPoint(world, caster, x, y, rangeTiles, predicate);
}

function canIssueSourceAdjustVariableAt(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  return Boolean(
    spell
    && sourceAdjustVariableStatusAdjustments(world, spellId).length > 0
    && canCastSpell(world, caster, spellId, spell.dependUpgrade, spell.manaCost)
    && findSourceAdjustVariableTarget(world, caster, spellId, x, y)
  );
}

function castSourceAdjustVariableAt(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  if (!spell || sourceAdjustVariableStatusAdjustments(world, spellId).length === 0 || !canCastSpell(world, caster, spellId, spell.dependUpgrade, spell.manaCost)) {
    return false;
  }
  const target = findSourceAdjustVariableTarget(world, caster, spellId, x, y);
  if (!target || !spendSpellMana(world, caster, spellId, spell.manaCost)) {
    return false;
  }
  applySourceVariableStatusAdjustments(world, target, spellId, {});
  const effectKind = sourceAdjustVariableStatusKinds(world, spellId, true)[0] ?? sourceAdjustVariableStatusKinds(world, spellId)[0] ?? "spell";
  addSpellEffect(world, effectKind, caster.player, target.x, target.y, sourceSpellVisualRadius(world, spellId, 40), sourceSpellAnimationDuration(world, spellId, 0.8), null, sourceSpellCastSound(world, spellId), sourceSpellMissileId(world, spellId), spellId);
  return finishSpellCast(world, caster, 1);
}

function sourceAreaAdjustVitalsConsumesMana(world: WorldState, spellId: string): boolean {
  return world.spellDefinitions.find((candidate) => candidate.id === spellId)?.areaAdjustVitals.some((adjustment) => adjustment.useMana) ?? false;
}

function sourceAreaAdjustVitalsTargets(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): WorldUnit[] {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  const adjustments = spell?.areaAdjustVitals ?? [];
  if (!spell || adjustments.length === 0) {
    return [];
  }
  const rangeTiles = Math.max(0, Math.floor(adjustments[0]?.range ?? (typeof spell.range === "number" ? spell.range : 0)));
  const goalTileX = Math.floor(x / world.tileSize);
  const goalTileY = Math.floor(y / world.tileSize);
  const minX = (goalTileX - rangeTiles) * world.tileSize;
  const minY = (goalTileY - rangeTiles) * world.tileSize;
  const maxX = (goalTileX + caster.tileWidth + rangeTiles) * world.tileSize;
  const maxY = (goalTileY + caster.tileHeight + rangeTiles) * world.tileSize;
  return world.units
    .filter((unit) => unit.hitPoints > 0 && unit.x >= minX && unit.x <= maxX && unit.y >= minY && unit.y <= maxY)
    .filter((unit) => spellTargetMatchesSource(world, spellId, caster, unit, sourceAreaAdjustVitalsCanAffectTarget(world, spellId)));
}

function sourceAreaAdjustVitalsCanAffectTarget(world: WorldState, spellId: string): (unit: WorldUnit) => boolean {
  const adjustments = world.spellDefinitions.find((candidate) => candidate.id === spellId)?.areaAdjustVitals ?? [];
  return (unit) => adjustments.some((adjustment) => (
    ((adjustment.hitPoints ?? 0) < 0 && unit.hitPoints > 0)
    || ((adjustment.hitPoints ?? 0) > 0 && unit.hitPoints > 0 && unit.hitPoints < unit.maxHitPoints)
    || ((adjustment.manaPoints ?? 0) < 0 && unit.mana > 0)
    || ((adjustment.manaPoints ?? 0) > 0 && unit.maxMana > 0 && unit.mana < unit.maxMana)
  ));
}

function canIssueSourceAreaAdjustVitalsAt(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  return Boolean(
    spell
    && spell.areaAdjustVitals.length > 0
    && canCastSpell(world, caster, spellId, spell.dependUpgrade, sourceAreaAdjustVitalsConsumesMana(world, spellId) ? spell.manaCost : 0)
    && isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, spellId, typeof spell.range === "number" ? spell.range : 6))
    && sourceAreaAdjustVitalsTargets(world, caster, spellId, x, y).length > 0
  );
}

function castSourceAreaAdjustVitalsAt(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  if (!spell || spell.areaAdjustVitals.length === 0 || !canCastSpell(world, caster, spellId, spell.dependUpgrade, sourceAreaAdjustVitalsConsumesMana(world, spellId) ? spell.manaCost : 0) || !isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, spellId, typeof spell.range === "number" ? spell.range : 6))) {
    return false;
  }
  const consumesMana = sourceAreaAdjustVitalsConsumesMana(world, spellId);
  if (consumesMana && !spendSpellMana(world, caster, spellId, spell.manaCost)) {
    return false;
  }
  const targets = sourceAreaAdjustVitalsTargets(world, caster, spellId, x, y);
  if (targets.length === 0) {
    if (consumesMana) {
      refundSpellMana(world, caster, spellId, spell.manaCost);
    }
    return false;
  }
  for (const adjustment of spell.areaAdjustVitals) {
    for (const target of targets) {
      applySourceAreaVitalAdjustment(world, caster, target, adjustment);
    }
  }
  addSpellEffect(world, sourceAreaAdjustVitalsEffectKind(spell.areaAdjustVitals), caster.player, x, y, sourceSpellEffectRadius(world, spellId, 48), sourceSpellAnimationDuration(world, spellId, 0.8), caster.typeId, sourceSpellCastSound(world, spellId), sourceSpellMissileId(world, spellId), spellId, caster.id);
  return finishSpellCast(world, caster, 1);
}

function applySourceAreaVitalAdjustment(world: WorldState, caster: WorldUnit, target: WorldUnit, adjustment: WargusSpell["areaAdjustVitals"][number]): void {
  const hitPoints = adjustment.hitPoints ?? 0;
  const manaPoints = adjustment.manaPoints ?? 0;
  if (hitPoints < 0) {
    applyDamage(world, target, Math.abs(hitPoints), caster.player, caster.typeId, caster.id);
  } else if (hitPoints > 0) {
    target.hitPoints = Math.min(target.maxHitPoints, target.hitPoints + hitPoints);
  }
  if (manaPoints !== 0) {
    target.mana = Math.max(0, Math.min(target.maxMana, target.mana + manaPoints));
  }
}

function sourceAreaAdjustVitalsEffectKind(adjustments: WargusSpell["areaAdjustVitals"]): NonNullable<WorldState["spellEffects"]>[number]["kind"] {
  if (adjustments.some((adjustment) => (adjustment.hitPoints ?? 0) > 0 || (adjustment.manaPoints ?? 0) > 0)) {
    return "heal";
  }
  if (adjustments.some((adjustment) => (adjustment.hitPoints ?? 0) < 0)) {
    return "exorcism";
  }
  return "summon";
}

function canIssueSourceAreaBombardmentAt(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  return Boolean(
    spell
    && spell.areaBombardments.length > 0
    && canCastSpell(world, caster, spellId, spell.dependUpgrade, spell.manaCost)
    && isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, spellId, typeof spell.range === "number" ? spell.range : 6))
  );
}

function castSourceAreaBombardmentAt(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  const sourceArea = sourceAreaBombardment(world, spellId);
  if (!spell || !sourceArea || !canCastSpell(world, caster, spellId, spell.dependUpgrade, spell.manaCost) || !isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, spellId, typeof spell.range === "number" ? spell.range : 6)) || !spendSpellMana(world, caster, spellId, spell.manaCost)) {
    return false;
  }
  addSpellEffect(world, sourceAreaBombardmentEffectKind(spellId, sourceArea), caster.player, x, y, sourceAreaBombardmentRadius(world, sourceArea), areaBombardmentDuration(world, spellId, 4.8), caster.typeId, sourceSpellCastSound(world, spellId), sourceArea.missile, spellId, caster.id);
  return finishSpellCast(world, caster, 1.8);
}

function sourceAreaBombardmentEffectKind(spellId: string, sourceArea: WargusSpell["areaBombardments"][number]): Extract<NonNullable<WorldState["spellEffects"]>[number]["kind"], "blizzard" | "death-and-decay"> {
  void spellId;
  return typeof sourceArea.startOffsetX === "number" || typeof sourceArea.startOffsetY === "number" ? "blizzard" : "death-and-decay";
}

function sourceCaptureConsumesMana(world: WorldState, spellId: string): boolean {
  return !(world.spellDefinitions.find((candidate) => candidate.id === spellId)?.captures[0]?.sacrifice ?? false);
}

function sourceCaptureTarget(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): WorldUnit | undefined {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  const rangeTiles = spellRangeTiles(world, spellId, typeof spell?.range === "number" ? spell.range : 6);
  return findSpellEnemyNearPoint(world, caster, x, y, rangeTiles, (unit) => (
    unit.player !== caster.player
    && unit.hitPoints > 0
    && spellTargetMatchesSource(world, spellId, caster, unit, () => true)
  ));
}

function canIssueSourceCaptureAt(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  return Boolean(
    spell
    && spell.captures.length > 0
    && canCastSpell(world, caster, spellId, spell.dependUpgrade, sourceCaptureConsumesMana(world, spellId) ? spell.manaCost : 0)
    && sourceCaptureTarget(world, caster, spellId, x, y)
  );
}

function castSourceCaptureAt(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  const capture = spell?.captures[0];
  if (!spell || !capture || !canCastSpell(world, caster, spellId, spell.dependUpgrade, sourceCaptureConsumesMana(world, spellId) ? spell.manaCost : 0)) {
    return false;
  }
  const target = sourceCaptureTarget(world, caster, spellId, x, y);
  if (!target || target.player === caster.player) {
    return false;
  }
  const damage = Math.max(0, Math.floor(capture.damage ?? 0));
  const damagePercent = Math.max(0, Math.floor(capture.percent ?? 0));
  if (damagePercent > 0 && target.maxHitPoints > 0 && Math.floor((100 * target.hitPoints) / target.maxHitPoints) > damagePercent && target.hitPoints > damage) {
    if (damage > 0) {
      applyDamage(world, target, damage, caster.player, caster.typeId, caster.id);
    }
    if (capture.sacrifice) {
      removeSourceCaptureCaster(world, caster);
    } else {
      caster.spellCooldown = spellCastCooldownForUnit(world, caster, 1);
    }
    addSpellEffect(world, "exorcism", caster.player, target.x, target.y, sourceSpellVisualRadius(world, spellId, 42), sourceSpellAnimationDuration(world, spellId, 0.75), caster.typeId, sourceSpellCastSound(world, spellId), sourceSpellMissileId(world, spellId), spellId, caster.id);
    return true;
  }
  if (!capture.sacrifice && !spendSpellMana(world, caster, spellId, spell.manaCost)) {
    return false;
  }
  applySourceCaptureOwnership(world, caster, target, capture);
  addSpellEffect(world, "summon", caster.player, target.x, target.y, sourceSpellVisualRadius(world, spellId, 42), sourceSpellAnimationDuration(world, spellId, 0.75), caster.typeId, sourceSpellCastSound(world, spellId), sourceSpellMissileId(world, spellId), spellId, caster.id);
  if (capture.sacrifice) {
    removeSourceCaptureCaster(world, caster);
    return true;
  }
  return finishSpellCast(world, caster, 1);
}

function applySourceCaptureOwnership(world: WorldState, caster: WorldUnit, target: WorldUnit, capture: WargusSpell["captures"][number]): void {
  const previousPlayer = target.player;
  const wasEnemy = arePlayersEnemies(world, caster.player, previousPlayer);
  if (wasEnemy) {
    caster.kills = Math.max(0, Math.floor(caster.kills ?? 0)) + 1;
    caster.xp = Math.max(0, Math.floor(caster.xp ?? 0)) + Math.max(0, Math.floor(target.points));
    const player = world.players.find((candidate) => candidate.id === caster.player);
    if (player) {
      player.stats ??= createEmptyStats();
      player.stats.pointsKilled += target.points;
      if (isSourceResultBuilding(target)) {
        player.stats.buildingsRazed += 1;
      } else {
        player.stats.unitsKilled += 1;
      }
    }
  }
  target.player = caster.player;
  target.order = null;
  target.moveQueue = [];
  target.rallyPoint = null;
  target.productionQueue = [];
  target.autoCastSpells = target.autoCastSpells.filter((spellId) => canToggleAutoCastSpell(world, target, spellId));
  if (capture.joinToAiForce) {
    target.order = { kind: "follow", targetId: caster.id, attackTargetId: null, followRange: 1, targetX: caster.x, targetY: caster.y, path: [], pathIndex: 0 };
  }
}

function removeSourceCaptureCaster(world: WorldState, caster: WorldUnit): void {
  world.units = world.units.filter((unit) => unit.id !== caster.id);
  clearReferencesToUnavailableUnits(world, new Set([caster.id]));
}

function sourcePolymorphTarget(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): WorldUnit | undefined {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  if (!spell || spell.polymorphs.length === 0) {
    return undefined;
  }
  return findSpellEnemyNearPoint(world, caster, x, y, spellRangeTiles(world, spellId, typeof spell.range === "number" ? spell.range : 6), (unit) => (
    spellTargetMatchesSource(world, spellId, caster, unit, canPolymorphTarget)
  ));
}

function canIssueSourcePolymorphAt(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  return Boolean(
    spell
    && spell.polymorphs.length > 0
    && canCastSpell(world, caster, spellId, spell.dependUpgrade, spell.manaCost)
    && sourcePolymorphTarget(world, caster, spellId, x, y)
  );
}

function castSourcePolymorphAt(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  if (!spell || spell.polymorphs.length === 0 || !canCastSpell(world, caster, spellId, spell.dependUpgrade, spell.manaCost) || !spendSpellMana(world, caster, spellId, spell.manaCost)) {
    return false;
  }
  const target = sourcePolymorphTarget(world, caster, spellId, x, y);
  if (!target || !applyPolymorphTransform(world, spellId, target)) {
    refundSpellMana(world, caster, spellId, spell.manaCost);
    return false;
  }
  addSpellEffect(world, "polymorph", caster.player, target.x, target.y, sourceSpellVisualRadius(world, spellId, 42), sourceSpellAnimationDuration(world, spellId, 0.9), null, sourceSpellCastSound(world, spellId), sourceSpellMissileId(world, spellId), spellId);
  return finishSpellCast(world, caster, 1.4);
}

function sourceSpawnMissileAction(world: Pick<WorldState, "spellDefinitions">, spellId: string): WargusSpell["missileSpawns"][number] | null {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  const missileId = spell?.missileSpawns[0]?.missile ?? spell?.missileDamages[0]?.missile ?? spell?.missiles[0] ?? null;
  if (!spell || !missileId) {
    return null;
  }
  return spell.missileSpawns.find((candidate) => candidate.missile === missileId) ?? spell.missileDamages.find((candidate) => candidate.missile === missileId) ?? {
    missile: missileId,
    damage: null,
    delay: null,
    ttl: null,
    startBase: null,
    startOffsetX: null,
    startOffsetY: null,
    endBase: null,
    endOffsetX: null,
    endOffsetY: null
  };
}

function sourceSpawnMissileTarget(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): WorldUnit | undefined {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  const action = sourceSpawnMissileAction(world, spellId);
  if (!spell || !action || (action.damage ?? 0) <= 0) {
    return undefined;
  }
  return findSpellEnemyNearPoint(world, caster, x, y, spellRangeTiles(world, spellId, typeof spell.range === "number" ? spell.range : 6), (unit) => (
    unit.hitPoints > 0 && spellTargetMatchesSource(world, spellId, caster, unit, () => true)
  ));
}

function canIssueSourceSpawnMissileAt(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  return Boolean(
    spell
    && sourceSpawnMissileAction(world, spellId)
    && canCastSpell(world, caster, spellId, spell.dependUpgrade, spell.manaCost)
    && isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, spellId, typeof spell.range === "number" ? spell.range : 6))
  );
}

function castSourceSpawnMissileAt(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  const action = sourceSpawnMissileAction(world, spellId);
  if (!spell || !action || !canCastSpell(world, caster, spellId, spell.dependUpgrade, spell.manaCost) || !isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, spellId, typeof spell.range === "number" ? spell.range : 6)) || !spendSpellMana(world, caster, spellId, spell.manaCost)) {
    return false;
  }
  const target = sourceSpawnMissileTarget(world, caster, spellId, x, y);
  const missileDefinition = missileDefinitionForId(world, action.missile);
  const projectileKind = projectileKindForMissileDefinition(missileDefinition, caster) ?? "arrow";
  const fallbackTargetX = target?.x ?? x;
  const fallbackTargetY = target ? target.y - Math.min(16, target.radius) : y;
  const end = sourceSpawnMissileEndPoint(caster, action, fallbackTargetX, fallbackTargetY);
  const targetX = end.x;
  const targetY = end.y;
  const start = sourceSpawnMissileStartPoint(caster, action, fallbackTargetX, fallbackTargetY);
  removeStatusEffect(caster, "invisibility");
  updateUnitFacing(caster, targetX - caster.x, targetY - caster.y);
  world.projectiles.push({
    id: `spell-projectile-${world.tick}-${world.projectiles.length}-${caster.id}`,
    sourceId: caster.id,
    targetId: target?.id ?? null,
    sourceTypeId: caster.typeId,
    player: caster.player,
    x: start.x,
    y: start.y,
    originX: start.x,
    originY: start.y,
    targetX,
    targetY,
    speed: projectileSpeedForMissile(missileDefinition?.speed ?? 0, projectileKind),
    damage: action.damage ?? 0,
    missileId: action.missile,
    className: missileDefinition?.className ?? null,
    impactSoundId: missileDefinition?.impactSound ?? null,
    impactMissileId: missileDefinition?.impactMissile ?? null,
    splashFactor: missileDefinition?.splashFactor ?? 0,
    range: missileDefinition?.range ?? 0,
    canHitOwner: missileDefinition?.canHitOwner ?? false,
    friendlyFire: missileDefinition?.friendlyFire ?? false,
    canTargetLand: true,
    canTargetSea: true,
    canTargetAir: true,
    bouncesRemaining: missileDefinition?.numBounces ?? 0,
    hitUnitIds: [],
    drawLevel: missileDefinition?.drawLevel ?? 0,
    kind: projectileKind,
    age: 0,
    delaySeconds: sourceCyclesToSeconds(world, action.delay ?? 0),
    ttlSeconds: typeof action.ttl === "number" ? sourceCyclesToSeconds(world, action.ttl) : null
  });
  const sound = missileDefinition?.firedSound ?? sourceSpellCastSound(world, spellId);
  if (sound) {
    emitSoundEvent(world, sound, caster.player, start.x, start.y);
  }
  return finishSpellCast(world, caster, 1);
}

function sourceSpawnMissileStartPoint(caster: WorldUnit, action: WargusSpell["missileSpawns"][number], targetX: number, targetY: number): { x: number; y: number } {
  const base = action.startBase === "target" ? { x: targetX, y: targetY } : caster;
  return {
    x: base.x + (action.startOffsetX ?? 0),
    y: base.y + (action.startOffsetY ?? 0)
  };
}

function sourceSpawnMissileEndPoint(caster: WorldUnit, action: WargusSpell["missileSpawns"][number], targetX: number, targetY: number): { x: number; y: number } {
  const base = action.endBase === "caster" ? caster : { x: targetX, y: targetY };
  return {
    x: base.x + (action.endOffsetX ?? 0),
    y: base.y + (action.endOffsetY ?? 0)
  };
}

function canIssueSourceSpawnPortalAt(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  const portal = spell?.spawnPortals[0];
  const unitDefinition = portal ? world.unitDefinitions.find((unit) => unit.id === portal.unitTypeId) : undefined;
  return Boolean(
    spell
    && portal
    && unitDefinition
    && canCastSpell(world, caster, spellId, spell.dependUpgrade, spell.manaCost)
    && isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, spellId, typeof spell.range === "number" ? spell.range : 6))
    && findSpellSpawnTileNear(world, x, y, unitDefinition)
  );
}

function castSourceSpawnPortalAt(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  const portal = spell?.spawnPortals[0];
  const unitDefinition = portal ? world.unitDefinitions.find((unit) => unit.id === portal.unitTypeId) : undefined;
  if (!spell || !portal || !unitDefinition || !canCastSpell(world, caster, spellId, spell.dependUpgrade, spell.manaCost) || !isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, spellId, typeof spell.range === "number" ? spell.range : 6)) || !spendSpellMana(world, caster, spellId, spell.manaCost)) {
    return false;
  }
  const spawn = findSpellSpawnTileNear(world, x, y, unitDefinition);
  if (!spawn) {
    refundSpellMana(world, caster, spellId, spell.manaCost);
    return false;
  }
  const existingPortal = caster.sourceSpellGoalId ? findUnit(world, caster.sourceSpellGoalId) : undefined;
  const owner = portal.currentPlayer ? caster.player : 15;
  if (existingPortal && existingPortal.hitPoints > 0 && existingPortal.typeId === unitDefinition.id) {
    existingPortal.x = spawn.x * world.tileSize + (existingPortal.tileWidth * world.tileSize) / 2;
    existingPortal.y = spawn.y * world.tileSize + (existingPortal.tileHeight * world.tileSize) / 2;
    existingPortal.player = owner;
    existingPortal.lifetimeSeconds = sourceCyclesToSeconds(world, portal.timeToLive ?? 0);
    addSpellEffect(world, "summon", caster.player, existingPortal.x, existingPortal.y, sourceSpellVisualRadius(world, spellId, 42), sourceSpellAnimationDuration(world, spellId, 0.65), caster.typeId, sourceSpellCastSound(world, spellId), sourceSpellMissileId(world, spellId), spellId);
    return finishSpellCast(world, caster, 1);
  }
  const unit = createWorldUnit({
    unit: unitDefinition,
    id: `${unitDefinition.id}-${world.nextUnitSerial}`,
    player: owner,
    tileX: spawn.x,
    tileY: spawn.y,
    tileset: world.map.setup?.tileset ?? null
  });
  unit.lifetimeSeconds = sourceCyclesToSeconds(world, portal.timeToLive ?? 0);
  world.nextUnitSerial += 1;
  world.units.push(unit);
  caster.sourceSpellGoalId = unit.id;
  recordPlayerUnitCreated(world, unit);
  addSpellEffect(world, "summon", caster.player, unit.x, unit.y, sourceSpellVisualRadius(world, spellId, 42), sourceSpellAnimationDuration(world, spellId, 0.65), caster.typeId, sourceSpellCastSound(world, spellId), sourceSpellMissileId(world, spellId), spellId);
  return finishSpellCast(world, caster, 1);
}

function canIssueSourceTeleportAt(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  return Boolean(
    spell
    && spell.actionTypes.includes("teleport")
    && canCastSpell(world, caster, spellId, spell.dependUpgrade, spell.manaCost)
    && isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, spellId, typeof spell.range === "number" ? spell.range : Infinity))
    && findSourceTeleportTile(world, caster, x, y)
  );
}

function castSourceTeleportAt(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  if (!spell || !spell.actionTypes.includes("teleport") || !canCastSpell(world, caster, spellId, spell.dependUpgrade, spell.manaCost) || !spendSpellMana(world, caster, spellId, spell.manaCost)) {
    return false;
  }
  const tile = findSourceTeleportTile(world, caster, x, y);
  if (!tile) {
    refundSpellMana(world, caster, spellId, spell.manaCost);
    return false;
  }
  caster.x = tile.x * world.tileSize + (caster.tileWidth * world.tileSize) / 2;
  caster.y = tile.y * world.tileSize + (caster.tileHeight * world.tileSize) / 2;
  caster.order = null;
  caster.moveQueue = [];
  addSpellEffect(world, "summon", caster.player, caster.x, caster.y, sourceSpellVisualRadius(world, spellId, 42), sourceSpellAnimationDuration(world, spellId, 0.65), caster.typeId, sourceSpellCastSound(world, spellId), sourceSpellMissileId(world, spellId), spellId);
  return finishSpellCast(world, caster, 1);
}

function findSourceTeleportTile(world: WorldState, caster: WorldUnit, x: number, y: number): { x: number; y: number } | null {
  const centerTileX = Math.floor(x / world.tileSize);
  const centerTileY = Math.floor(y / world.tileSize);
  for (let radius = 0; radius <= 4; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
          continue;
        }
        const tileX = centerTileX + dx - Math.floor(caster.tileWidth / 2);
        const tileY = centerTileY + dy - Math.floor(caster.tileHeight / 2);
        if (isFootprintOpenForUnitSpawn(world, tileX, tileY, caster, caster.id)) {
          return { x: tileX, y: tileY };
        }
      }
    }
  }
  return null;
}

function canIssueSourceSummonAt(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  const summon = spell?.summons[0];
  const unitDefinition = summon ? world.unitDefinitions.find((unit) => unit.id === summon.unitTypeId) : undefined;
  const sourceTarget = summon && unitDefinition ? sourceSummonTarget(world, caster, summon, unitDefinition, spellId, x, y) : null;
  return Boolean(
    spell
    && summon
    && unitDefinition
    && canCastSpell(world, caster, spellId, spell.dependUpgrade, spell.manaCost)
    && isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, spellId, typeof spell.range === "number" ? spell.range : 6))
    && sourceTarget
  );
}

function castSourceSummonAt(world: WorldState, caster: WorldUnit, spellId: string, x: number, y: number): boolean {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  const summon = spell?.summons[0];
  const unitDefinition = summon ? world.unitDefinitions.find((unit) => unit.id === summon.unitTypeId) : undefined;
  if (!spell || !summon || !unitDefinition || !canCastSpell(world, caster, spellId, spell.dependUpgrade, spell.manaCost) || !isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, spellId, typeof spell.range === "number" ? spell.range : 6)) || !spendSpellMana(world, caster, spellId, spell.manaCost)) {
    return false;
  }
  const sourceTarget = sourceSummonTarget(world, caster, summon, unitDefinition, spellId, x, y);
  if (!sourceTarget) {
    refundSpellMana(world, caster, spellId, spell.manaCost);
    return false;
  }
  const { spawn, corpse } = sourceTarget;
  if (corpse) {
    world.corpses = (world.corpses ?? []).filter((candidate) => candidate.id !== corpse.id);
  }
  const unit = createWorldUnit({
    unit: unitDefinition,
    id: `${unitDefinition.id}-${world.nextUnitSerial}`,
    player: caster.player,
    tileX: spawn.x,
    tileY: spawn.y,
    tileset: world.map.setup?.tileset ?? null
  });
  unit.lifetimeSeconds = spellSummonLifetimeSeconds(world, spellId, unitDefinition.id, sourceCyclesToSeconds(world, summon.timeToLive ?? 99000));
  world.nextUnitSerial += 1;
  world.units.push(unit);
  recordPlayerUnitCreated(world, unit);
  addSpellEffect(world, "summon", caster.player, unit.x, unit.y, sourceSpellVisualRadius(world, spellId, 42), sourceSpellAnimationDuration(world, spellId, 0.65), caster.typeId, sourceSpellCastSound(world, spellId), sourceSpellMissileId(world, spellId), spellId);
  return finishSpellCast(world, caster, 1);
}

function sourceSummonTarget(
  world: WorldState,
  caster: WorldUnit,
  summon: NonNullable<WargusSpell["summons"]>[number],
  unitDefinition: WargusUnit,
  spellId: string,
  x: number,
  y: number
): { spawn: { x: number; y: number }; corpse: WorldState["corpses"][number] | null } | null {
  if (summon.requireCorpse) {
    const corpse = findSourceSummonCorpseNearPoint(world, caster, x, y, spellRangeTiles(world, spellId, 6));
    const spawn = corpse ? findSpellSpawnTileNear(world, corpse.x, corpse.y, unitDefinition) ?? findSpellSpawnTile(world, caster, unitDefinition) : null;
    return corpse && spawn ? { spawn, corpse } : null;
  }
  const spawn = findSpellSpawnTileNear(world, x, y, unitDefinition);
  return spawn ? { spawn, corpse: null } : null;
}

function createRaisedSkeleton(world: WorldState, player: number, skeletonDefinition: WargusUnit, tileX: number, tileY: number, lifetimeSeconds: number): WorldUnit {
  const skeleton = createWorldUnit({
    unit: skeletonDefinition,
    id: `${skeletonDefinition.id}-${world.nextUnitSerial}`,
    player,
    tileX,
    tileY,
    tileset: world.map.setup?.tileset ?? null
  });
  skeleton.lifetimeSeconds = lifetimeSeconds;
  world.nextUnitSerial += 1;
  return skeleton;
}

function raisedSkeletonDefinition(world: WorldState): WargusUnit | undefined {
  const skeleton = sourceSummonedUnitDefinition(world, "spell-raise-dead");
  const visualFallback = sourceSkeletonVisualFallbackDefinition(world);
  if (!skeleton && !visualFallback) {
    return undefined;
  }
  const base = skeleton ?? visualFallback;
  if (!base) {
    return undefined;
  }
  const complete = base.hitPoints > 1 && base.type === "land" && base.canAttack && base.tileSize[0] > 0 && base.tileSize[1] > 0;
  if (complete) {
    return base;
  }
  return {
    ...base,
    id: "unit-skeleton",
    name: "Skeleton",
    image: base.image ?? visualFallback?.image ?? null,
    icon: base.icon ?? visualFallback?.icon ?? null,
    animation: base.animation ?? visualFallback?.animation ?? null,
    type: "land",
    hitPoints: Math.max(base.hitPoints, 40),
    armor: Math.max(base.armor, 0),
    basicDamage: Math.max(base.basicDamage, 4),
    piercingDamage: Math.max(base.piercingDamage, 2),
    maxAttackRange: 1,
    supply: 0,
    demand: 0,
    canAttack: true,
    tileSize: [1, 1],
    costs: [],
    sounds: Object.keys(base.sounds ?? {}).length > 0 ? base.sounds : visualFallback?.sounds ?? {},
    source: base.source
  };
}

function sourceSkeletonVisualFallbackDefinition(world: WorldState): WargusUnit | undefined {
  return world.unitDefinitions
    .filter((definition) => (
      definition.hitPoints > 1
      && definition.type === "land"
      && definition.canAttack
      && definition.tileSize[0] > 0
      && definition.tileSize[1] > 0
      && Boolean(definition.image || definition.animation || definition.icon)
    ))
    .sort((left, right) => (
      sourceSkeletonVisualFallbackScore(right) - sourceSkeletonVisualFallbackScore(left)
      || left.id.localeCompare(right.id)
    ))[0];
}

function sourceSkeletonVisualFallbackScore(definition: WargusUnit): number {
  return (definition.isUndead ? 500 : 0)
    + (definition.organic ? 100 : 0)
    + (!definition.manaEnabled && (definition.manaMax ?? 0) <= 0 && (definition.canCastSpells?.length ?? 0) === 0 ? 120 : 0)
    + ((definition.costs ?? []).length === 0 ? 100 : 0)
    + (!definition.canTargetAir ? 90 : 0)
    + (definition.maxAttackRange <= 1 ? 80 : 0)
    + (definition.demand <= 1 ? 60 : 0)
    + Math.max(0, 80 - Math.abs(definition.hitPoints - 40))
    + Math.max(0, 40 - Math.abs(definition.basicDamage - 6))
    + Math.max(0, 40 - Math.abs(definition.piercingDamage - 3))
    + Math.max(0, 40 - Math.abs((definition.priority ?? 0) - 55));
}

function castUnholyArmorAt(world: WorldState, caster: WorldUnit, target: WorldUnit | undefined): boolean {
  if (!canUnitCastSpellId(caster, "spell-unholy-armor") || !hasSpellResearch(world, caster.player, "spell-unholy-armor", "upgrade-unholy-armor") || !spendSpellMana(world, caster, "spell-unholy-armor", 100)) {
    return false;
  }
  if (!target || !spellTargetMatchesSource(world, "spell-unholy-armor", caster, target, canUnholyArmorTarget)) {
    refundSpellMana(world, caster, "spell-unholy-armor", 100);
    return false;
  }
  applyUnholyArmor(world, target);
  addSpellEffect(world, "unholy-armor", caster.player, target.x, target.y, sourceSpellVisualRadius(world, "spell-unholy-armor", 42), sourceSpellAnimationDuration(world, "spell-unholy-armor", 0.9), null, sourceSpellCastSound(world, "spell-unholy-armor"), sourceSpellMissileId(world, "spell-unholy-armor"), "spell-unholy-armor");
  return finishSpellCast(world, caster, 1.4);
}

function castHasteAt(world: WorldState, caster: WorldUnit, target: WorldUnit | undefined): boolean {
  if (!canUnitCastSpellId(caster, "spell-haste") || !hasSpellResearch(world, caster.player, "spell-haste", "upgrade-haste") || !spendSpellMana(world, caster, "spell-haste", 50)) {
    return false;
  }
  if (!target || !spellTargetMatchesSource(world, "spell-haste", caster, target, canHasteTarget)) {
    refundSpellMana(world, caster, "spell-haste", 50);
    return false;
  }
  applySourceVariableStatusAdjustments(world, target, "spell-haste", { Haste: { fallbackCycles: 1000, speedMultiplier: 1.4 } });
  addSpellEffect(world, "haste", caster.player, target.x, target.y, sourceSpellVisualRadius(world, "spell-haste", 40), sourceSpellAnimationDuration(world, "spell-haste", 0.8), null, sourceSpellCastSound(world, "spell-haste"), sourceSpellMissileId(world, "spell-haste"), "spell-haste");
  return finishSpellCast(world, caster, 1);
}

function castBloodlustAt(world: WorldState, caster: WorldUnit, target: WorldUnit | undefined, spellId = "spell-bloodlust", fallbackUpgradeId: string | null = "upgrade-bloodlust"): boolean {
  if (!canUnitCastSpellId(caster, spellId) || !hasSpellResearch(world, caster.player, spellId, fallbackUpgradeId) || !spendSpellMana(world, caster, spellId, 50)) {
    return false;
  }
  if (!target || !spellTargetMatchesSource(world, spellId, caster, target, canBloodlustTarget)) {
    refundSpellMana(world, caster, spellId, 50);
    return false;
  }
  applySourceVariableStatusAdjustments(world, target, spellId, { Bloodlust: { fallbackCycles: 1000, speedMultiplier: 1, damageMultiplier: 1.85 } });
  addSpellEffect(world, "bloodlust", caster.player, target.x, target.y, sourceSpellVisualRadius(world, spellId, 44), sourceSpellAnimationDuration(world, spellId, 0.8), null, sourceSpellCastSound(world, spellId), sourceSpellMissileId(world, spellId), spellId);
  return finishSpellCast(world, caster, 1.1);
}

function canTargetMobileSpell(unit: WorldUnit): boolean {
  return unit.hitPoints > 0
    && unit.speed > 0
    && !unit.construction;
}

function canFlameShieldTarget(unit: WorldUnit): boolean {
  return canTargetMobileSpell(unit) && !unit.airUnit;
}

function canSlowTarget(unit: WorldUnit): boolean {
  return canTargetMobileSpell(unit) && !hasStatusEffect(unit, "slow");
}

function canInvisibilityTarget(unit: WorldUnit): boolean {
  return canTargetMobileSpell(unit);
}

function canUnholyArmorTarget(unit: WorldUnit): boolean {
  return canTargetMobileSpell(unit);
}

function canHasteTarget(unit: WorldUnit): boolean {
  return canTargetMobileSpell(unit) && !hasStatusEffect(unit, "haste");
}

function canBloodlustTarget(unit: WorldUnit): boolean {
  return canTargetMobileSpell(unit) && unit.organic && !hasStatusEffect(unit, "bloodlust");
}

function canDeathCoilTarget(unit: WorldUnit): boolean {
  return unit.organic && unit.hitPoints > 0;
}

function canWhirlwindTarget(caster: WorldUnit, unit: WorldUnit, world?: WorldState): boolean {
  return (world ? arePlayersEnemies(world, caster.player, unit.player) : unit.player !== caster.player && unit.player !== 15)
    && unit.hitPoints > 0
    && isBuildingLike(unit);
}

function applyUnholyArmor(world: WorldState, target: WorldUnit): void {
  if (target.indestructible) {
    return;
  }
  if (target.volatile) {
    applyDamage(world, target, 99999);
    return;
  }
  applyDamage(world, target, Math.max(1, Math.floor(target.hitPoints / 2)));
  if (target.hitPoints > 0) {
    addStatusEffect(target, "unholy-armor", sourceCyclesToSeconds(world, spellCallbackVariableAdjustment(world, "spell-unholy-armor", "UnholyArmor", 500)), 1);
  }
}

function sourceCyclesToSeconds(world: WorldState, cycles: number): number {
  return cycles / sourceDefaultGameSpeed(world);
}

function sourceDeathCoilAutocastTarget(world: WorldState, caster: WorldUnit): WorldUnit | undefined {
  const spellId = "spell-death-coil";
  const callback = sourcePositionAutocastCallback(world, spellId);
  if (callback && callback !== "SpellDeathCoil") {
    return findNearestEnemyInSpellRange(world, caster, spellAiRangeTiles(world, spellId, 10), (unit) => canDeathCoilTarget(unit) && unitMatchesSourceCastConditions(world, spellId, unit, caster), sourceSpellAiPriority(world, spellId));
  }
  const rangeTiles = spellAiRangeTiles(world, spellId, 10);
  return world.units
    .filter((unit) => arePlayersEnemies(world, caster.player, unit.player) && unit.hitPoints > 0 && isUnitVisibleToPlayer(world, unit, caster.player))
    .filter((unit) => canDeathCoilTarget(unit) && unitMatchesSourceCastConditions(world, spellId, unit, caster))
    .filter((unit) => Math.hypot(unit.x - caster.x, unit.y - caster.y) <= rangeTiles * world.tileSize + unit.radius)
    .sort((a, b) => b.hitPoints - a.hitPoints || compareSourceSpellTargets(world, caster, a, b, sourceSpellAiPriority(world, spellId)))[0];
}

function applyDeathCoilAt(world: WorldState, caster: WorldUnit, x: number, y: number): WorldUnit[] {
  let damageLeft = spellPrimaryMissileDamage(world, "spell-death-coil", 50);
  const targets = sourceDeathCoilTargetsAt(world, caster, x, y);
  const impacts: WorldUnit[] = [];
  for (let index = 0; index < targets.length && damageLeft > 0; index += 1) {
    const target = targets[index];
    const damage = index + 1 === targets.length ? damageLeft : Math.min(damageLeft, target.hitPoints);
    applyDamage(world, target, damage, caster.player, caster.typeId, caster.id);
    if (damage > 0 && caster.hitPoints > 0) {
      caster.hitPoints = Math.min(caster.maxHitPoints, caster.hitPoints + damage);
      impacts.push(target);
    }
    damageLeft -= damage;
  }
  return impacts;
}

function sourceDeathCoilTargetsAt(world: WorldState, caster: WorldUnit, x: number, y: number): WorldUnit[] {
  const goalTileX = Math.floor(x / world.tileSize);
  const goalTileY = Math.floor(y / world.tileSize);
  return world.units
    .filter((unit) => arePlayersEnemies(world, caster.player, unit.player) && unit.hitPoints > 0 && isUnitVisibleToPlayer(world, unit, caster.player))
    .filter((unit) => canDeathCoilTarget(unit) && unitMatchesSourceCastConditions(world, "spell-death-coil", unit, caster))
    .filter((unit) => Math.abs(Math.floor(unit.x / world.tileSize) - goalTileX) <= 2 && Math.abs(Math.floor(unit.y / world.tileSize) - goalTileY) <= 2)
    .sort((a, b) => distanceSquared(caster, a) - distanceSquared(caster, b) || a.id.localeCompare(b.id));
}

function castRunesAt(world: WorldState, caster: WorldUnit, x: number, y: number, spellId = "spell-runes", fallbackUpgradeId: string | null = "upgrade-runes"): boolean {
  if (!canUnitCastSpellId(caster, spellId) || !hasSpellResearch(world, caster.player, spellId, fallbackUpgradeId) || !isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, spellId, 10)) || !spendSpellMana(world, caster, spellId, 200)) {
    return false;
  }
  addRuneSpellEffects(world, caster, x, y, spellId);
  return finishSpellCast(world, caster, 1.5);
}

function addRuneSpellEffects(world: WorldState, caster: WorldUnit, x: number, y: number, spellId: string): void {
  const landMineMissileId = sourceLandMineMissileIdForSpell(world, spellId) ?? sourceSpellMissileId(world, spellId) ?? "missile-rune";
  const duration = spellMissileTtlSeconds(world, spellId, landMineMissileId, sourceCyclesToSeconds(world, 2000));
  const placements = spellMissileOffsets(world, spellId, landMineMissileId);
  const offsets = placements.length > 0 ? placements : [{ x: 0, y: 0 }];
  const radius = sourceSpellEffectRadius(world, spellId, offsets.length > 1 ? world.tileSize : 62);
  const sound = sourceSpellCastSound(world, spellId);
  offsets.forEach((offset, index) => {
    addSpellEffect(
      world,
      "runes",
      caster.player,
      x + offset.x,
      y + offset.y,
      radius,
      duration,
      caster.typeId,
      index === 0 ? sound : null,
      landMineMissileId,
      spellId,
      caster.id
    );
  });
}

function sourceLandMineMissileIdForSpell(world: WorldState, spellId: string): string | null {
  return sourceMissileIdForSpellByClass(world, spellId, "missile-class-land-mine");
}

function sourceFlameShieldMissileId(world: WorldState, spellId = "spell-flame-shield"): string {
  return sourceMissileIdForSpellByClass(world, spellId, "missile-class-flame-shield") ?? sourceSpellMissileId(world, spellId) ?? "missile-flame-shield";
}

function sourceMissileIdForSpellByClass(world: WorldState, spellId: string, className: string): string | null {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  const missileIds = [
    ...(spell?.missileSpawns.map((missile) => missile.missile) ?? []),
    ...(spell?.missileDamages.map((missile) => missile.missile) ?? []),
    ...(spell?.missiles ?? [])
  ];
  return missileIds.find((missileId) => missileDefinitionForId(world, missileId)?.className === className) ?? null;
}

function castEyeOfKilroggAt(world: WorldState, caster: WorldUnit, x: number, y: number, spellId = "spell-eye-of-vision", fallbackUpgradeId: string | null = "upgrade-eye-of-kilrogg"): boolean {
  if (!canUnitCastSpellId(caster, spellId) || !hasSpellResearch(world, caster.player, spellId, fallbackUpgradeId) || !isPointInSpellRange(world, caster, x, y, spellRangeTiles(world, spellId, 6)) || !spendSpellMana(world, caster, spellId, 70)) {
    return false;
  }
  const eyeDefinition = eyeOfKilroggDefinition(world, spellId);
  const spawn = eyeDefinition ? findSpellSpawnTileNear(world, x, y, eyeDefinition) : null;
  if (!eyeDefinition || !spawn) {
    refundSpellMana(world, caster, spellId, 70);
    return false;
  }
  const eye = createWorldUnit({ unit: eyeDefinition, id: `${eyeDefinition.id}-${world.nextUnitSerial}`, player: caster.player, tileX: spawn.x, tileY: spawn.y, tileset: world.map.setup?.tileset ?? null });
  eye.lifetimeSeconds = spellCallbackUnitLifetimeSeconds(world, spellId, eyeDefinition.id, 25);
  world.nextUnitSerial += 1;
  world.units.push(eye);
  recordPlayerUnitCreated(world, eye);
  if (isSelfTargetedEyeOfVision(world, caster, x, y)) {
    issueExploreOrder(world, eye.id);
  }
  addEyeOfVisionCastEffect(world, caster.player, eye.x, eye.y, spellId);
  return finishSpellCast(world, caster, 1.6);
}

function addEyeOfVisionCastEffect(world: WorldState, player: number, x: number, y: number, spellId: string): void {
  addSpellEffect(
    world,
    "holy-vision",
    player,
    x,
    y,
    sourceSpellVisualRadius(world, spellId, 48),
    sourceSpellAnimationDuration(world, spellId, 0.9),
    null,
    sourceSpellCastSound(world, spellId),
    sourceSpellMissileId(world, spellId),
    spellId
  );
}

function isSelfTargetedEyeOfVision(world: WorldState, caster: WorldUnit, x: number, y: number): boolean {
  return Math.floor(x / world.tileSize) === Math.floor(caster.x / world.tileSize)
    && Math.floor(y / world.tileSize) === Math.floor(caster.y / world.tileSize);
}

function sourceSummonedUnitDefinition(world: WorldState, spellId: string): WargusUnit | undefined {
  const unitTypeId = world.spellDefinitions.find((spell) => spell.id === spellId)?.summons[0]?.unitTypeId ?? null;
  return unitTypeId ? world.unitDefinitions.find((unit) => unit.id === unitTypeId) : undefined;
}

function eyeOfKilroggDefinition(world: WorldState, spellId: string): WargusUnit | undefined {
  const callbackUnitTypeId = world.spellDefinitions
    .find((spell) => spell.id === spellId)
    ?.callbackUnitVariables
    .find((variable) => variable.callback === "SpellEyeOfVision")
    ?.unitTypeId ?? null;
  return callbackUnitTypeId
    ? world.unitDefinitions.find((unit) => unit.id === callbackUnitTypeId)
    : sourceEyeOfKilroggFallbackDefinition(world);
}

function sourceEyeOfKilroggFallbackDefinition(world: WorldState): WargusUnit | undefined {
  return world.unitDefinitions
    .filter((definition) => (
      definition.type === "fly"
      && (definition.speed ?? 0) > 0
      && !definition.canAttack
      && !definition.building
      && Boolean(definition.image || definition.animation || definition.icon)
    ))
    .sort((left, right) => sourceEyeOfKilroggFallbackScore(right) - sourceEyeOfKilroggFallbackScore(left) || left.id.localeCompare(right.id))[0];
}

function sourceEyeOfKilroggFallbackScore(definition: WargusUnit): number {
  return (isExploreOnReadyValue(definition.onReady) ? 0 : 1000)
    + (definition.revealer ? 200 : 0)
    + (definition.visibleUnderFog ? 100 : 0)
    + Math.max(0, 100 - Math.min(100, definition.priority ?? 0))
    + Math.max(0, 100 - Math.min(100, definition.hitPoints ?? 0))
    + Math.min(50, Math.max(0, definition.sightRange ?? 0));
}

function canPolymorphTarget(unit: WorldUnit): boolean {
  return unit.organic && !isBuildingLike(unit);
}

function applyPolymorphTransform(world: WorldState, spellId: string, target: WorldUnit): boolean {
  const polymorph = world.spellDefinitions.find((spell) => spell.id === spellId)?.polymorphs[0] ?? null;
  const newForm = polymorph?.newForm ?? "unit-critter";
  if (!transformUnitType(world, target, newForm)) {
    return false;
  }
  if (polymorph?.playerNeutral ?? true) {
    neutralizePolymorphedUnit(target);
  }
  return true;
}

function neutralizePolymorphedUnit(unit: WorldUnit): void {
  unit.player = 15;
  unit.neutral = true;
  unit.neutralMinimapColor ??= [192, 192, 192];
  unit.order = null;
  unit.moveQueue = [];
  unit.productionQueue = [];
  unit.construction = null;
  unit.rallyPoint = null;
  unit.resourcesHeld = 0;
  unit.carriedResource = null;
  unit.lastDamagePlayer = null;
  unit.lastDamageSourceUnitId = null;
  unit.cargo = [];
  unit.attackCooldown = 0;
}

function isUndeadUnit(unit: WorldUnit): boolean {
  return unit.isUndead;
}

function findNearestEnemyInAggroRange(world: WorldState, unit: WorldUnit): WorldUnit | undefined {
  const radius = sourceReactionRangeForUnit(world, unit);
  return world.units
    .filter((candidate) => canAttackTarget(unit, candidate, world) && isUnitVisibleToPlayer(world, candidate, unit.player) && canAutoAcquireSourceTarget(unit, candidate))
    .filter((candidate) => isInAutoAcquireAttackRange(world, unit, candidate, radius))
    .sort((a, b) => compareAutoTargetCandidates(world, unit, a, b))[0];
}

function compareAutoTargetCandidates(world: WorldState, attacker: WorldUnit, left: WorldUnit, right: WorldUnit): number {
  const distanceOrder = distanceSquared(attacker, left) - distanceSquared(attacker, right);
  if (world.engineSettings.simplifiedAutoTargetingDefault === false) {
    return distanceOrder;
  }
  return sourceSimplifiedAutoTargetPriority(attacker, right) - sourceSimplifiedAutoTargetPriority(attacker, left) || distanceOrder;
}

function sourceSimplifiedAutoTargetPriority(attacker: WorldUnit, target: WorldUnit): number {
  let priority = 0;
  if (sourceUnitHasGoal(target, attacker.id) && isInAttackRange(target, attacker)) {
    priority |= 0x40000000;
  }
  if (canAttackTarget(target, attacker) || target.canCastSpells.length > 0) {
    priority |= 0x20000000;
  }
  priority |= Math.max(0, Math.min(255, Math.round(target.priority))) << 15;
  const pathLength = Math.max(0, Math.min(255, Math.round(Math.max(0, Math.hypot(target.x - attacker.x, target.y - attacker.y) - target.radius) / 32)));
  priority |= (255 - pathLength) << 7;
  const hpPercent = target.maxHitPoints > 0 ? Math.floor((100 * target.hitPoints) / target.maxHitPoints) : 100;
  priority |= Math.max(0, Math.min(100, 100 - hpPercent));
  return priority;
}

function sourceUnitHasGoal(unit: WorldUnit, goalUnitId: string): boolean {
  const order = unit.order;
  return Boolean(order && (
    ("targetId" in order && order.targetId === goalUnitId)
    || ("attackTargetId" in order && order.attackTargetId === goalUnitId)
  ));
}

function isInAutoAcquireAttackRange(world: WorldState, unit: WorldUnit, target: WorldUnit, radius: number): boolean {
  const distance = Math.hypot(target.x - unit.x, target.y - unit.y);
  return distance <= radius + target.radius
    && distance >= minimumAttackDistanceForTarget(unit, target)
    && isSourceInsideAttackLineClear(world, unit, target);
}

function minimumAttackDistanceForTarget(unit: WorldUnit, target: WorldUnit): number {
  return Math.max(0, unit.minAttackRange - target.radius);
}

function minimumAttackDistanceForPoint(unit: WorldUnit): number {
  return Math.max(0, unit.minAttackRange - 12);
}

export function sourceDeclaredReactionRangeForUnit(world: Pick<WorldState, "aiStates">, unit: Pick<WorldUnit, "player" | "computerReactionRange" | "personReactionRange">): number {
  return isComputerControlledPlayer(world, unit.player)
    ? unit.computerReactionRange
    : unit.personReactionRange;
}

function sourceReactionRangeForUnit(world: WorldState, unit: WorldUnit): number {
  const sourceRange = sourceDeclaredReactionRangeForUnit(world, unit);
  if (sourceRange > 0) {
    return sourceRange;
  }
  return Math.max(unit.attackRange + world.tileSize * 2, unit.sightRangeTiles * world.tileSize);
}

function isComputerControlledPlayer(world: Pick<WorldState, "aiStates">, playerId: number): boolean {
  return world.aiStates.some((state) => state.player === playerId && state.enabled);
}

function applySplashDamage(world: WorldState, caster: WorldUnit, x: number, y: number, radius: number, centerDamage: number, edgeDamage: number, predicate?: (unit: WorldUnit) => boolean): void {
  for (const unit of world.units) {
    if (unit.player === 15 || unit.hitPoints <= 0 || !isUnitVisibleToPlayer(world, unit, caster.player)) {
      continue;
    }
    if (predicate && !predicate(unit)) {
      continue;
    }
    const distance = Math.hypot(unit.x - x, unit.y - y);
    if (distance > radius + unit.radius) {
      continue;
    }
    const falloff = Math.max(0, 1 - distance / Math.max(1, radius));
    applyDamage(world, unit, Math.round(edgeDamage + (centerDamage - edgeDamage) * falloff), caster.player, caster.typeId);
  }
}

function applyFireballImpact(world: WorldState, caster: WorldUnit, x: number, y: number): void {
  const spellId = "spell-fireball";
  const missile = missileDefinitionForId(world, sourceSpellMissileId(world, spellId));
  const centerDamage = spellPrimaryMissileDamage(world, spellId, 20);
  const radius = sourceMissileSplashRadius(world, missile?.id ?? null, 0);
  const splashFactor = Math.max(1, missile?.splashFactor ?? 1);
  if (radius <= 0) {
    const target = findSpellEnemyNearPoint(world, caster, x, y, spellRangeTiles(world, spellId, 8), (unit) => unitMatchesSourceSpellConditionsForPlayer(world, spellId, caster.player, unit));
    if (target) {
      applyDamage(world, target, centerDamage, caster.player, caster.typeId);
    }
    return;
  }
  applySplashDamage(
    world,
    caster,
    x,
    y,
    radius,
    centerDamage,
    Math.max(1, Math.round(centerDamage / splashFactor)),
    (unit) => unitMatchesSourceSpellConditionsForPlayer(world, spellId, caster.player, unit)
  );
  addSourceMissileImpactEffect(world, missile?.impactMissile ?? null, caster.player, x, y, radius, spellId, caster.typeId, caster.id);
  if (missile?.impactSound) {
    emitSoundEvent(world, missile.impactSound, caster.player, x, y);
  }
}

function addSourceMissileImpactEffect(world: WorldState, impactMissileId: string | null | undefined, player: number, x: number, y: number, radius: number, spellId: string | null = null, sourceTypeId: string | null = null, sourceUnitId: string | null = null): boolean {
  if (!impactMissileId) {
    return false;
  }
  const impactMissile = missileDefinitionForId(world, impactMissileId);
  world.spellEffects.push({
    id: `missile-impact-${world.tick}-${world.spellEffects.length}`,
    kind: sourceMissileImpactEffectKind(world, impactMissile),
    player,
    x,
    y,
    radius: Math.max(radius, sourceMissileVisualRadius(impactMissile, radius)),
    age: 0,
    duration: sourceMissileAnimationDuration(world, impactMissile, 0.38),
    missileId: impactMissileId,
    spellId,
    sourceTypeId,
    sourceUnitId,
    drawLevel: impactMissile?.drawLevel ?? 0
  });
  return true;
}

function addClickMissileEffect(world: WorldState, x: number, y: number, player: number): void {
  const missileId = world.engineSettings.clickMissileId;
  if (!missileId) {
    return;
  }
  const missile = missileDefinitionForId(world, missileId);
  world.spellEffects.push({
    id: `click-missile-${world.tick}-${world.spellEffects.length}`,
    kind: "click-missile",
    player,
    x,
    y,
    radius: sourceMissileVisualRadius(missile, 24),
    age: 0,
    duration: sourceMissileAnimationDuration(world, missile, 0.35),
    sourceTypeId: null,
    missileId,
    spellId: null,
    drawLevel: missile?.drawLevel ?? 0
  });
}

function addSpellEffect(
  world: WorldState,
  kind: NonNullable<WorldState["spellEffects"]>[number]["kind"],
  player: number,
  x: number,
  y: number,
  radius: number,
  duration: number,
  sourceTypeId: string | null = null,
  soundIdOverride?: string | null,
  missileIdOverride?: string | null,
  spellId: string | null = null,
  sourceUnitId: string | null = null
): void {
  world.spellEffects ??= [];
  world.spellEffects.push({
    id: `spell-${world.tick}-${world.spellEffects.length}`,
    kind,
    player,
    x,
    y,
    radius,
    age: 0,
    duration,
    sourceTypeId,
    sourceUnitId,
    missileId: missileIdOverride ?? null,
    spellId,
    drawLevel: sourceSpellEffectDrawLevel(world, missileIdOverride ?? null, spellId)
  });
  const soundId = soundIdOverride === undefined ? soundForSpellEffect(kind) : soundIdOverride;
  if (soundId) {
    emitSoundEvent(world, soundId, player, x, y);
  }
}

function sourceSpellEffectDrawLevel(world: WorldState, missileId: string | null | undefined, spellId: string | null): number {
  const sourceMissileId = missileId ?? (spellId ? sourceSpellMissileId(world, spellId) : null);
  return missileDefinitionForId(world, sourceMissileId)?.drawLevel ?? 0;
}

function emitSoundEvent(world: WorldState, soundId: string, player: number, x?: number, y?: number): void {
  world.events.push(Number.isFinite(x) && Number.isFinite(y)
    ? { kind: "sound", soundId, player, x: x as number, y: y as number }
    : { kind: "sound", soundId, player });
}

function sourceSpellCastSound(world: WorldState, spellId: string): string | null {
  return world.spellDefinitions.find((spell) => spell.id === spellId)?.soundWhenCast ?? null;
}

function sourceSpellMissileId(world: WorldState, spellId: string): string | null {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  return spell?.missileSpawns[0]?.missile ?? spell?.missileDamages[0]?.missile ?? spell?.missiles[0] ?? null;
}

function soundForSpellEffect(kind: NonNullable<WorldState["spellEffects"]>[number]["kind"]): string | null {
  if (kind === "heal") {
    return "healing";
  }
  if (kind === "explosion") {
    return "explosion";
  }
  if (kind === "fireball") {
    return "fireball hit";
  }
  if (kind === "flame-shield") {
    return "flame shield";
  }
  if (kind === "death-and-decay") {
    return "death and decay";
  }
  if (kind === "death-coil") {
    return "death coil";
  }
  if (kind === "holy-vision") {
    return "holy vision";
  }
  if (kind === "unholy-armor") {
    return "unholy armor";
  }
  if (kind === "exorcism" || kind === "blizzard" || kind === "polymorph" || kind === "slow" || kind === "invisibility" || kind === "whirlwind" || kind === "haste" || kind === "bloodlust") {
    return kind;
  }
  return null;
}

function hasResearched(world: WorldState, playerId: number, upgradeId: string): boolean {
  return (world.researchedUpgrades[playerId] ?? []).includes(upgradeId) || isSourceUpgradePreResearched(world, upgradeId, playerId);
}

function isSourceUpgradePreResearched(world: WorldState, upgradeId: string, playerId?: number): boolean {
  return sourceAllowFlagForPlayer(sourceAllowRuleForId(world, upgradeId), playerId) === "R";
}

function hasResearchPrerequisites(world: WorldState, playerId: number, upgradeId: string): boolean {
  const requirements: Record<string, string[]> = {
    "upgrade-sword2": ["upgrade-sword1"],
    "upgrade-battle-axe2": ["upgrade-battle-axe1"],
    "upgrade-human-shield2": ["upgrade-human-shield1"],
    "upgrade-orc-shield2": ["upgrade-orc-shield1"],
    "upgrade-ballista2": ["upgrade-ballista1"],
    "upgrade-catapult2": ["upgrade-catapult1"],
    "upgrade-arrow2": ["upgrade-arrow1"],
    "upgrade-throwing-axe2": ["upgrade-throwing-axe1"],
    "upgrade-longbow": ["upgrade-ranger"],
    "upgrade-ranger-scouting": ["upgrade-ranger"],
    "upgrade-ranger-marksmanship": ["upgrade-ranger"],
    "upgrade-light-axes": ["upgrade-berserker"],
    "upgrade-berserker-scouting": ["upgrade-berserker"],
    "upgrade-berserker-regeneration": ["upgrade-berserker"],
    "upgrade-healing": ["upgrade-paladin"],
    "upgrade-exorcism": ["upgrade-paladin"],
    "upgrade-holy-vision": ["upgrade-paladin"],
    "upgrade-haste": ["upgrade-ogre-mage"],
    "upgrade-bloodlust": ["upgrade-ogre-mage"],
    "upgrade-runes": ["upgrade-ogre-mage"],
    "upgrade-eye-of-kilrogg": ["upgrade-ogre-mage"],
    "upgrade-human-ship-cannon2": ["upgrade-human-ship-cannon1"],
    "upgrade-orc-ship-cannon2": ["upgrade-orc-ship-cannon1"],
    "upgrade-human-ship-armor2": ["upgrade-human-ship-armor1"],
    "upgrade-orc-ship-armor2": ["upgrade-orc-ship-armor1"]
  };
  if (isShipUpgradeId(world, upgradeId) && !hasCompletedFoundry(world, playerId)) {
    return false;
  }
  const inferredRequirements = [
    ...sourceConversionResearchPrerequisites(world, upgradeId),
    ...sourceModifierResearchPrerequisites(world, upgradeId)
  ];
  const requiredUpgradeIds = new Set([...(requirements[upgradeId] ?? []), ...inferredRequirements]);
  return [...requiredUpgradeIds].every((requiredUpgradeId) => hasResearched(world, playerId, requiredUpgradeId));
}

function sourceConversionResearchPrerequisites(world: WorldState, upgradeId: string): string[] {
  const upgrade = worldUpgrade(world, upgradeId);
  if (!upgrade || (upgrade.conversions ?? []).length > 0) {
    return [];
  }
  const required = new Set<string>();
  for (const appliedTypeId of upgrade.appliesTo) {
    for (const conversionUpgrade of world.upgradeDefinitions) {
      if (conversionUpgrade.id === upgradeId) {
        continue;
      }
      if ((conversionUpgrade.conversions ?? []).some((conversion) => conversion.toTypeId === appliedTypeId)) {
        required.add(conversionUpgrade.id);
      }
    }
  }
  return [...required];
}

function sourceModifierResearchPrerequisites(world: WorldState, upgradeId: string): string[] {
  const upgrade = worldUpgrade(world, upgradeId);
  if (!upgrade || upgrade.modifiers.length === 0 || upgrade.appliesTo.length === 0 || upgrade.conversions.length > 0) {
    return [];
  }
  const signature = sourceModifierUpgradeSignature(upgrade);
  const sourceCost = sourceUpgradeCostRank(upgrade);
  const predecessors = world.upgradeDefinitions
    .filter((candidate) => candidate.id !== upgrade.id
      && candidate.modifiers.length > 0
      && candidate.conversions.length === 0
      && sourceModifierUpgradeSignature(candidate) === signature
      && sourceUpgradeCostRank(candidate) < sourceCost)
    .sort((left, right) => sourceUpgradeCostRank(right) - sourceUpgradeCostRank(left));
  return predecessors.length > 0 ? [predecessors[0].id] : [];
}

function sourceModifierUpgradeSignature(upgrade: WargusUpgrade): string {
  const appliesTo = [...upgrade.appliesTo].sort().join(",");
  const modifiers = upgrade.modifiers
    .map((modifier) => `${modifier.stat}:${modifier.value}`)
    .sort()
    .join(",");
  return `${appliesTo}|${modifiers}`;
}

function sourceUpgradeCostRank(upgrade: WargusUpgrade): number {
  return upgrade.costs.time + upgrade.costs.gold + upgrade.costs.wood + upgrade.costs.oil;
}

function hasResearchGatePrerequisites(world: WorldState, playerId: number, upgradeId: string): boolean {
  if (hasSourceDependencyRule(world, upgradeId)) {
    return hasSourceDependencies(world, playerId, upgradeId);
  }
  return hasResearchPrerequisites(world, playerId, upgradeId) && hasSourceDependencies(world, playerId, upgradeId);
}

function hasBuildGatePrerequisites(world: WorldState, playerId: number, buildingTypeId: string): boolean {
  if (hasSourceDependencyRule(world, buildingTypeId)) {
    return hasSourceDependencies(world, playerId, buildingTypeId);
  }
  return canBuildByTech(world, playerId, buildingTypeId) && hasSourceDependencies(world, playerId, buildingTypeId);
}

function hasTrainGatePrerequisites(world: WorldState, playerId: number, unitTypeId: string): boolean {
  if (hasSourceDependencyRule(world, unitTypeId)) {
    return hasSourceDependencies(world, playerId, unitTypeId);
  }
  return canTrainUnitByTech(world, playerId, unitTypeId) && hasSourceDependencies(world, playerId, unitTypeId);
}

function hasSourceDependencyRule(world: WorldState, id: string): boolean {
  return world.dependencyRules.some((candidate) => candidate.id === id);
}

function hasSourceDependencies(world: WorldState, playerId: number, id: string): boolean {
  const rule = world.dependencyRules.find((candidate) => candidate.id === id);
  if (!rule) {
    return true;
  }
  return rule.alternatives.some((alternative) => alternative.every((dependencyId) => hasSourceDependency(world, playerId, dependencyId)));
}

function hasSourceDependency(world: WorldState, playerId: number, dependencyId: string): boolean {
  if (dependencyId.startsWith("upgrade-")) {
    return hasResearched(world, playerId, dependencyId);
  }
  if (dependencyId.startsWith("unit-")) {
    return hasCompletedUnitType(world, playerId, dependencyId);
  }
  return true;
}

function addStatusEffect(unit: WorldUnit, kind: WorldUnit["statusEffects"][number]["kind"], durationSeconds: number, speedMultiplier: number, damageMultiplier?: number): void {
  unit.statusEffects ??= [];
  removeOpposingSourceStatusEffect(unit, kind);
  const existing = unit.statusEffects.find((effect) => effect.kind === kind);
  if (existing) {
    existing.remainingSeconds = Math.max(existing.remainingSeconds, durationSeconds);
    existing.totalSeconds = Math.max(existing.totalSeconds, durationSeconds);
    existing.speedMultiplier = strongestRuntimeStatusSpeedMultiplier(kind, existing.speedMultiplier, speedMultiplier);
    if ((damageMultiplier ?? 0) > (existing.damageMultiplier ?? 0)) {
      existing.damageMultiplier = damageMultiplier;
    }
    return;
  }
  unit.statusEffects.push({ kind, remainingSeconds: durationSeconds, totalSeconds: durationSeconds, speedMultiplier, damageMultiplier });
}

function applySourceVariableStatusAdjustments(world: WorldState, unit: WorldUnit, spellId: string, fallbackVariables: Partial<Record<string, { fallbackCycles: number; speedMultiplier: number; damageMultiplier?: number }>>): void {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  const sourceAdjustments = (spell?.variableAdjustments ?? [])
    .filter((adjustment) => sourceStatusKindForVariable(adjustment.variable));
  const adjustments = sourceAdjustments.length > 0
    ? sourceAdjustments
    : Object.entries(fallbackVariables).map(([variable, fallback]) => ({ variable, amount: fallback?.fallbackCycles ?? 0 }));
  for (const adjustment of adjustments) {
    const kind = sourceStatusKindForVariable(adjustment.variable);
    if (!kind) {
      continue;
    }
    if (adjustment.amount <= 0) {
      removeStatusEffect(unit, kind);
      continue;
    }
    const fallback = fallbackVariables[adjustment.variable];
    addStatusEffect(unit, kind, sourceCyclesToSeconds(world, adjustment.amount), fallback?.speedMultiplier ?? sourceStatusSpeedMultiplier(kind), fallback?.damageMultiplier);
  }
}

function sourceStatusKindForVariable(variable: string): WorldUnit["statusEffects"][number]["kind"] | null {
  if (variable === "Haste") return "haste";
  if (variable === "Slow") return "slow";
  if (variable === "Bloodlust") return "bloodlust";
  if (variable === "Invisible") return "invisibility";
  if (variable === "UnholyArmor") return "unholy-armor";
  return null;
}

function sourceStatusVariableForKind(kind: WorldUnit["statusEffects"][number]["kind"]): string | null {
  if (kind === "haste") return "Haste";
  if (kind === "slow") return "Slow";
  if (kind === "bloodlust") return "Bloodlust";
  if (kind === "invisibility") return "Invisible";
  if (kind === "unholy-armor") return "UnholyArmor";
  return null;
}

function sourceStatusSpeedMultiplier(kind: WorldUnit["statusEffects"][number]["kind"]): number {
  if (kind === "slow") return 0.55;
  if (kind === "haste") return 1.4;
  return 1;
}

function strongestRuntimeStatusSpeedMultiplier(kind: WorldUnit["statusEffects"][number]["kind"], left: number, right: number): number {
  return kind === "slow" ? Math.min(left, right) : Math.max(left, right);
}

function removeOpposingSourceStatusEffect(unit: WorldUnit, kind: WorldUnit["statusEffects"][number]["kind"]): void {
  if (kind === "haste") {
    removeStatusEffect(unit, "slow");
  } else if (kind === "slow") {
    removeStatusEffect(unit, "haste");
  }
}

function removeStatusEffect(unit: WorldUnit, kind: WorldUnit["statusEffects"][number]["kind"]): void {
  if (!unit.statusEffects?.length) {
    return;
  }
  unit.statusEffects = unit.statusEffects.filter((effect) => effect.kind !== kind);
}

function activeStatusEffect(unit: WorldUnit, kind: WorldUnit["statusEffects"][number]["kind"]): WorldUnit["statusEffects"][number] | undefined {
  return unit.statusEffects?.find((effect) => effect.kind === kind && effect.remainingSeconds > 0);
}

function hasStatusEffect(unit: WorldUnit, kind: WorldUnit["statusEffects"][number]["kind"]): boolean {
  return Boolean(activeStatusEffect(unit, kind));
}

function applyCompletedUpgrade(world: WorldState, playerId: number, upgradeId: string): void {
  const upgrade = worldUpgrade(world, upgradeId);
  if (!upgrade) {
    return;
  }
  const modifiedUnitIds = new Set<string>();
  for (const conversion of upgrade.conversions ?? []) {
    transformUnitsForUpgrade(world, playerId, conversion.fromTypeId, conversion.toTypeId, upgrade, modifiedUnitIds);
  }
  for (const unit of liveUnitsIncludingCargo(world)) {
    if (unit.player !== playerId || modifiedUnitIds.has(unit.id) || !upgrade.appliesTo.includes(unit.typeId)) {
      continue;
    }
    applyUpgradeModifiers(unit, upgrade);
    modifiedUnitIds.add(unit.id);
  }
}

export function applyResearchedUpgradesToUnit(world: WorldState, unit: WorldUnit): void {
  const originalTypeId = unit.typeId;
  for (const upgradeId of world.researchedUpgrades[unit.player] ?? []) {
    const upgrade = worldUpgrade(world, upgradeId);
    const conversion = upgrade?.conversions?.find((candidate) => candidate.fromTypeId === unit.typeId);
    if (upgrade && conversion) {
      transformUnitType(world, unit, conversion.toTypeId);
    }
    if (upgrade && upgradeAppliesAcrossTransform(upgrade, originalTypeId, unit.typeId)) {
      applyUpgradeModifiers(unit, upgrade);
    }
  }
}

function worldUpgrade(world: WorldState, upgradeId: string): WargusUpgrade | undefined {
  return world.upgradeDefinitions.find((upgrade) => upgrade.id === upgradeId);
}

function applyUpgradeModifiers(unit: WorldUnit, upgrade: WargusUpgrade): void {
  for (const modifier of upgrade.modifiers) {
    if (modifier.stat === "PiercingDamage") {
      unit.piercingDamage += modifier.value;
    } else if (modifier.stat === "BasicDamage") {
      unit.basicDamage += modifier.value;
    } else if (modifier.stat === "Armor") {
      unit.armor += modifier.value;
    } else if (modifier.stat === "AttackRange") {
      unit.attackRange += modifier.value * 32;
    } else if (modifier.stat === "SightRange") {
      unit.sightRangeTiles += modifier.value;
    } else if (modifier.stat === "Level") {
      unit.level = Math.max(0, unit.level + modifier.value);
    } else if (modifier.stat === "regeneration-rate") {
      unit.regenerationRate = Math.max(0, unit.regenerationRate + modifier.value);
    } else if (modifier.stat === "regeneration-frequency") {
      unit.regenerationFrequency = Math.max(0, modifier.value);
      unit.regenerationAccumulator = Math.min(unit.regenerationAccumulator ?? 0, unit.regenerationFrequency);
    }
  }
}

function transformUnitsForUpgrade(world: WorldState, playerId: number, fromTypeId: string, toTypeId: string, completedUpgrade?: WargusUpgrade, modifiedUnitIds: Set<string> = new Set()): void {
  for (const unit of liveUnitsIncludingCargo(world)) {
    if (unit.player === playerId && unit.typeId === fromTypeId) {
      if (transformUnitType(world, unit, toTypeId) && completedUpgrade && !modifiedUnitIds.has(unit.id) && upgradeAppliesAcrossTransform(completedUpgrade, fromTypeId, unit.typeId)) {
        applyUpgradeModifiers(unit, completedUpgrade);
        modifiedUnitIds.add(unit.id);
      }
    }
  }
}

function upgradeAppliesAcrossTransform(upgrade: WargusUpgrade, fromTypeId: string, toTypeId: string): boolean {
  return upgrade.appliesTo.includes(fromTypeId)
    || upgrade.appliesTo.includes(toTypeId)
    || (upgrade.conversions ?? []).some((conversion) => conversion.fromTypeId === fromTypeId || conversion.toTypeId === toTypeId);
}

function transformUnitType(world: WorldState, unit: WorldUnit, toTypeId: string): boolean {
  const definition = world.unitDefinitions.find((candidate) => candidate.id === toTypeId);
  if (!definition) {
    return false;
  }
  if (!canTransformUnitTypeAtSourcePosition(world, unit, definition)) {
    return false;
  }
  const hitPointRatio = unit.maxHitPoints > 0 ? unit.hitPoints / unit.maxHitPoints : 1;
  const tileWidth = Math.max(definition.tileSize?.[0] ?? 1, 1);
  const tileHeight = Math.max(definition.tileSize?.[1] ?? 1, 1);
  const kind = isBuildingDefinition(definition) ? "building" : worldKindForUnitDefinition(definition);
  const footprint = boxDimensionsForUnit(definition, kind);
  unit.typeId = definition.id;
  unit.name = definition.name;
  unit.kind = kind;
  unit.landUnit = definition.landUnit ?? false;
  unit.seaUnit = definition.seaUnit ?? false;
  unit.airUnit = definition.airUnit ?? false;
  unit.sideAttack = definition.sideAttack ?? false;
  unit.rotationSpeed = Math.max(0, definition.rotationSpeed ?? 0);
  unit.elevated = definition.elevated ?? false;
  unit.shadow = typeof definition.shadow === "number" ? Math.max(0, definition.shadow) : null;
  unit.woodImprove = definition.woodImprove ?? false;
  unit.oilImprove = definition.oilImprove ?? false;
  unit.center = definition.center ?? false;
  unit.level = Math.max(0, definition.level ?? 0);
  unit.builderOutside = definition.builderOutside ?? false;
  unit.teleporter = definition.teleporter ?? false;
  unit.numDirections = Math.max(0, definition.numDirections ?? 0);
  unit.onReady = definition.onReady ?? null;
  unit.image = imageForTileset(definition, world.map.setup?.tileset ?? null);
  unit.animation = definition.animation;
  unit.corpseTypeId = definition.corpseTypeId ?? null;
  unit.explosionType = definition.explosionType ?? null;
  unit.rightMouseAction = definition.rightMouseAction ?? null;
  unit.missile = definition.missile ?? null;
  unit.constructionTypeId = definition.constructionTypeId ?? null;
  unit.revealer = definition.revealer ?? false;
  unit.vanishes = definition.vanishes ?? false;
  unit.decayRate = Math.max(0, definition.decayRate ?? 0);
  unit.frameWidth = tileWidth === 1 ? 72 : tileWidth * 32;
  unit.frameHeight = tileHeight === 1 ? 72 : tileHeight * 32;
  unit.tileWidth = tileWidth;
  unit.tileHeight = tileHeight;
  unit.radius = footprint.radius;
  unit.boxWidth = footprint.boxWidth;
  unit.boxHeight = footprint.boxHeight;
  unit.maxHitPoints = Math.max(definition.hitPoints, 1);
  unit.hitPoints = Math.max(1, Math.min(unit.maxHitPoints, Math.round(unit.maxHitPoints * hitPointRatio)));
  unit.drawLevel = Math.max(0, definition.drawLevel ?? 0);
  unit.priority = Math.max(0, definition.priority ?? 0);
  unit.points = Math.max(0, definition.points ?? 0);
  unit.annoyComputerFactor = Math.max(0, definition.annoyComputerFactor ?? 0);
  unit.armor = definition.armor;
  unit.basicDamage = definition.basicDamage;
  unit.piercingDamage = definition.piercingDamage;
  unit.minAttackRange = Math.max(definition.minAttackRange ?? 0, 0) * 32;
  unit.attackRange = Math.max(definition.maxAttackRange, 0) * 32 + 12;
  unit.sightRangeTiles = sightRangeForUnit(definition, kind, tileWidth, tileHeight);
  unit.computerReactionRange = Math.max(0, definition.computerReactionRange ?? 0) * 32;
  unit.personReactionRange = Math.max(0, definition.personReactionRange ?? 0) * 32;
  unit.supply = definition.supply;
  unit.demand = definition.demand;
  unit.canAttack = definition.canAttack;
  unit.canTargetLand = definition.canTargetLand ?? false;
  unit.canTargetSea = definition.canTargetSea ?? false;
  unit.canTargetAir = definition.canTargetAir ?? false;
  unit.groundAttack = definition.groundAttack ?? false;
  unit.detectCloak = definition.detectCloak ?? false;
  unit.coward = definition.coward ?? false;
  unit.gatherResources = [...(definition.gatherResources ?? [])];
  unit.resourceCapacity = normalizeResourceCapacity(definition.resourceCapacity);
  unit.resourceStep = normalizePositiveResourceMap(definition.resourceStep);
  unit.waitAtResource = normalizePositiveResourceMap(definition.waitAtResource);
  unit.waitAtDepot = normalizePositiveResourceMap(definition.waitAtDepot);
  unit.canCastSpells = [...(definition.canCastSpells ?? [])];
  unit.autoCastSpells = (unit.autoCastSpells ?? []).filter((spellId) => unit.canCastSpells.includes(spellId));
  unit.storesResources = [...(definition.storesResources ?? [])];
  unit.givesResource = definition.givesResource ?? null;
  unit.canHarvest = definition.canHarvest ?? false;
  unit.mainFacility = definition.mainFacility ?? false;
  unit.shoreBuilding = definition.shoreBuilding ?? false;
  unit.manaEnabled = definition.manaEnabled ?? false;
  unit.selectableByRectangle = definition.selectableByRectangle ?? true;
  unit.indestructible = definition.indestructible ?? false;
  unit.nonSolid = definition.nonSolid ?? false;
  unit.visibleUnderFog = definition.visibleUnderFog ?? false;
  unit.permanentCloak = definition.permanentCloak ?? false;
  unit.organic = definition.organic ?? false;
  unit.isUndead = definition.isUndead ?? false;
  unit.hero = definition.hero ?? false;
  unit.volatile = definition.volatile ?? false;
  unit.randomMovementProbability = Math.max(0, definition.randomMovementProbability ?? 0);
  unit.randomMovementDistance = Math.max(0, definition.randomMovementDistance ?? 1);
  unit.clicksToExplode = Math.max(0, definition.clicksToExplode ?? 0);
  unit.burnPercent = Math.max(0, definition.burnPercent ?? 0);
  unit.burnDamageRate = Math.max(0, definition.burnDamageRate ?? 0);
  unit.burnAccumulator = Math.max(0, unit.burnAccumulator ?? 0);
  unit.explodeClickCount = Math.min(Math.max(0, unit.explodeClickCount ?? 0), unit.clicksToExplode);
  unit.nextAutoActionTick = Math.max(0, unit.nextAutoActionTick ?? 0);
  unit.nextRandomMoveTick = Math.max(0, unit.nextRandomMoveTick ?? 0);
  unit.neutral = definition.neutral ?? false;
  unit.neutralMinimapColor = normalizeRgbColor(definition.neutralMinimapColor);
  unit.canTransport = [...(definition.canTransport ?? [])];
  unit.autoRepairRange = Math.max(0, definition.autoRepairRange ?? 0) * 32;
  unit.repairRange = Math.max(0, definition.repairRange ?? 0) * 32;
  unit.repairHp = Math.max(0, definition.repairHp ?? 0);
  unit.repairCosts = [...(definition.repairCosts ?? [])];
  unit.improveProduction = normalizeImproveProduction(definition.improveProduction);
  unit.baseSpeed = speedForUnit(definition.id, kind, definition.speed, definition);
  unit.speed = unit.baseSpeed;
  unit.statusEffects = [];
  unit.regenerationRate = 0;
  unit.regenerationFrequency = 0;
  unit.regenerationAccumulator = 0;
  unit.maxMana = maxManaForUnitDefinition(definition);
  unit.mana = Math.max(0, Math.min(unit.maxMana, definition.manaInitial ?? unit.maxMana));
  unit.manaIncrease = Math.max(0, definition.manaIncrease ?? 0);
  unit.spellCooldown = 0;
  unit.cargoCapacity = Math.max(0, Math.floor(definition.maxOnBoard ?? 0));
  if (unit.cargo.length > unit.cargoCapacity) {
    const droppedCargo = unit.cargo.slice(unit.cargoCapacity);
    unit.cargo = unit.cargo.slice(0, unit.cargoCapacity);
    clearReferencesToUnavailableUnits(world, new Set(droppedCargo.map((cargoUnit) => cargoUnit.id)));
  }
  normalizeTransformedCombatOrders(world, unit);
  return true;
}

function canTransformUnitTypeAtSourcePosition(world: WorldState, unit: WorldUnit, definition: WargusUnit): boolean {
  const tileWidth = Math.max(definition.tileSize?.[0] ?? 1, 1);
  const tileHeight = Math.max(definition.tileSize?.[1] ?? 1, 1);
  const kind = isBuildingDefinition(definition) ? "building" : worldKindForUnitDefinition(definition);
  if (unit.kind === kind && unit.tileWidth === tileWidth && unit.tileHeight === tileHeight) {
    return true;
  }
  if (!isBuildingDefinition(definition)) {
    return true;
  }
  const currentTile = worldToTile(world, unit.x, unit.y);
  const currentLeft = currentTile.x - Math.floor(unit.tileWidth / 2);
  const currentTop = currentTile.y - Math.floor(unit.tileHeight / 2);
  const tileX = currentLeft + Math.floor(unit.tileWidth / 2) - Math.floor(tileWidth / 2);
  const tileY = currentTop + Math.floor(unit.tileHeight / 2) - Math.floor(tileHeight / 2);
  return canPlaceBuilding(world, definition, tileX, tileY, unit.id);
}

function normalizeTransformedCombatOrders(world: WorldState, unit: WorldUnit): void {
  unit.moveQueue = unit.moveQueue.filter((order) => (
    order.kind !== "attack-target"
    && order.kind !== "attack-move"
    && order.kind !== "attack-ground"
    && order.kind !== "patrol"
  ) || unit.canAttack);
  if (!unit.order) {
    return;
  }
  if (unit.order.kind === "attack-ground" && !canAttackGround(unit)) {
    unit.order = null;
    startNextQueuedMove(world, unit);
    return;
  }
  if (isSoftCombatTargetOrder(unit.order)) {
    if (!unit.canAttack) {
      unit.order.targetId = null;
      if (unit.order.kind === "hold") {
        unit.order = null;
        startNextQueuedMove(world, unit);
      }
      return;
    }
    const target = unit.order.targetId ? findUnit(world, unit.order.targetId) : undefined;
    if (target && !canAttackTarget(unit, target, world)) {
      unit.order.targetId = null;
    }
    return;
  }
  if (unit.order.kind === "attack") {
    const target = findUnit(world, unit.order.targetId);
    if (!target || !canAttackTarget(unit, target, world)) {
      unit.order = null;
      startNextQueuedMove(world, unit);
    }
  }
}

function isBuildingDefinition(definition: WargusUnit): boolean {
  return isSourceBuildingDefinition(definition);
}

function canResearchAt(world: WorldState, building: WorldUnit, upgradeId: string): boolean {
  const sourceResearchButtons = world.buttonDefinitions.filter((button) => button.action === "research" && button.value === upgradeId);
  if (sourceResearchButtons.length > 0) {
    return sourceResearchButtons.some((button) => sourceButtonAppliesTo(button, building.typeId) && sourceButtonAllowedForSimulation(world, button, building.player));
  }
  if (isBlacksmithUpgradeId(world, upgradeId) && sourceResearchProducerHasUpgradeFamily(world, building, (candidate) => isBlacksmithUpgradeId(world, candidate)) === true) {
    return true;
  }
  if (isLumberMillUpgradeId(world, upgradeId) && sourceResearchProducerHasUpgradeFamily(world, building, (candidate) => isLumberMillUpgradeId(world, candidate)) === true) {
    return true;
  }
  if (isShipUpgradeId(world, upgradeId) && sourceResearchProducerHasUpgradeFamily(world, building, (candidate) => isShipUpgradeId(world, candidate)) === true) {
    return true;
  }
  if (isHolyResearchUpgradeId(world, upgradeId) && sourceResearchProducerHasUpgradeFamily(world, building, (candidate) => isHolyResearchUpgradeId(world, candidate)) === true) {
    return true;
  }
  if (isCasterResearchUpgradeId(world, upgradeId) && sourceResearchProducerHasUpgradeFamily(world, building, (candidate) => isCasterResearchUpgradeId(world, candidate)) === true) {
    return true;
  }
  return fallbackResearchUpgradeIdsForBuilding(world, building).includes(upgradeId);
}

function fallbackResearchUpgradeIdsForBuilding(world: WorldState, building: WorldUnit): string[] {
  const race = world.players.find((player) => player.id === building.player)?.race === "orc" ? "orc" : "human";
  if (isBlacksmith(world, building)) {
    return race === "human"
      ? ["upgrade-sword1", "upgrade-sword2", "upgrade-human-shield1", "upgrade-human-shield2", "upgrade-ballista1", "upgrade-ballista2"]
      : ["upgrade-battle-axe1", "upgrade-battle-axe2", "upgrade-orc-shield1", "upgrade-orc-shield2", "upgrade-catapult1", "upgrade-catapult2"];
  }
  if (isLumberMill(world, building)) {
    return race === "human"
      ? ["upgrade-arrow1", "upgrade-arrow2", "upgrade-ranger", "upgrade-longbow", "upgrade-ranger-scouting", "upgrade-ranger-marksmanship"]
      : ["upgrade-throwing-axe1", "upgrade-throwing-axe2", "upgrade-berserker", "upgrade-light-axes", "upgrade-berserker-scouting", "upgrade-berserker-regeneration"];
  }
  if (isHolyResearchProducer(world, building)) {
    return race === "human"
      ? ["upgrade-paladin", "upgrade-healing", "upgrade-exorcism", "upgrade-holy-vision"]
      : ["upgrade-ogre-mage", "upgrade-haste", "upgrade-bloodlust", "upgrade-runes", "upgrade-eye-of-kilrogg"];
  }
  if (isFoundry(world, building)) {
    return race === "human"
      ? ["upgrade-human-ship-cannon1", "upgrade-human-ship-cannon2", "upgrade-human-ship-armor1", "upgrade-human-ship-armor2"]
      : ["upgrade-orc-ship-cannon1", "upgrade-orc-ship-cannon2", "upgrade-orc-ship-armor1", "upgrade-orc-ship-armor2"];
  }
  if (isCasterResearchProducer(world, building)) {
    return race === "human"
      ? ["upgrade-fireball", "upgrade-flame-shield", "upgrade-slow", "upgrade-blizzard", "upgrade-polymorph", "upgrade-invisibility"]
      : ["upgrade-death-coil", "upgrade-death-and-decay", "upgrade-whirlwind", "upgrade-raise-dead", "upgrade-unholy-armor"];
  }
  return [];
}

function findSpellSpawnTile(world: WorldState, caster: WorldUnit, unitDefinition: WargusUnit): { x: number; y: number } | null {
  const centerX = Math.floor(caster.x / world.tileSize);
  const centerY = Math.floor(caster.y / world.tileSize);
  const probe = createWorldUnit({ unit: unitDefinition, id: "spell-spawn-probe", player: caster.player, tileX: 0, tileY: 0 });
  for (let radius = 1; radius <= 4; radius += 1) {
    for (let y = centerY - radius; y <= centerY + radius; y += 1) {
      for (let x = centerX - radius; x <= centerX + radius; x += 1) {
        const onRing = x === centerX - radius || x === centerX + radius || y === centerY - radius || y === centerY + radius;
        if (!onRing || x < 0 || y < 0 || x >= world.map.width || y >= world.map.height) {
          continue;
        }
        if (isFootprintOpenForUnitSpawn(world, x, y, probe, probe.id)) {
          return { x, y };
        }
      }
    }
  }
  return null;
}

function triggerRuneField(world: WorldState, effect: NonNullable<WorldState["spellEffects"]>[number]): void {
  const spellId = effect.spellId ?? null;
  const impactTileX = Math.floor(effect.x / world.tileSize);
  const impactTileY = Math.floor(effect.y / world.tileSize);
  const triggered = world.units.some((unit) => sourceLandMineTriggerUnit(world, effect, unit, impactTileX, impactTileY));
  if (!triggered) {
    return;
  }
  for (const unit of world.units) {
    if (
      unit.player === 15
      || unit.hitPoints <= 0
      || unit.kind === "fly"
      || mapTileDistanceToUnit(world, unit, impactTileX, impactTileY) !== 0
      || !sourceMissileCanHitUnitByOwnership(world, effect.missileId ?? null, effect.player, unit, effect.sourceUnitId ?? null)
    ) {
      continue;
    }
    applyDamage(world, unit, runeFieldDamage(world, spellId), effect.player, effect.sourceTypeId ?? null, effect.sourceUnitId ?? null);
  }
  effect.age = effect.duration;
  const impactMissile = missileDefinitionForId(world, effect.missileId ?? null)?.impactMissile ?? null;
  addSourceMissileImpactEffect(world, impactMissile, effect.player, effect.x, effect.y, sourceMissileSplashRadius(world, effect.missileId ?? null, 58), spellId, effect.sourceTypeId ?? null, effect.sourceUnitId ?? null);
}

function sourceLandMineTriggerUnit(world: WorldState, effect: NonNullable<WorldState["spellEffects"]>[number], unit: WorldUnit, tileX: number, tileY: number): boolean {
  if (unit.hitPoints <= 0 || unit.kind === "fly" || mapTileDistanceToUnit(world, unit, tileX, tileY) !== 0) {
    return false;
  }
  const missile = missileDefinitionForId(world, effect.missileId ?? null);
  if (effect.sourceUnitId && unit.id === effect.sourceUnitId && missile?.canHitOwner !== true) {
    return false;
  }
  return true;
}

function runeFieldDamage(world: WorldState, spellId: string | null): number {
  return spellId ? spellMissileDamage(world, spellId, "missile-rune", 50) : 50;
}

function tickAreaDamageSpell(world: WorldState, effect: NonNullable<WorldState["spellEffects"]>[number]): void {
  const spellId = effect.spellId ?? (effect.kind === "blizzard" ? "spell-blizzard" : "spell-death-and-decay");
  if (world.tick % areaBombardmentPulseTicks(world, spellId) !== 0) {
    return;
  }
  const sourceArea = sourceAreaBombardment(world, spellId);
  const impacts = areaBombardmentShardImpacts(world, effect, sourceArea);
  emitSourceMissileImpactSound(world, effect.missileId, effect.player, impacts[0]?.x ?? effect.x, impacts[0]?.y ?? effect.y);
  const splashRadius = sourceMissileSplashRadius(world, effect.missileId, world.tileSize * 0.75);
  for (const impact of impacts) {
    const centerDamage = sourceMissileDamageRoll(world, effect.missileId, `${effect.id}:${world.tick}:${impact.index}`)
      ?? sourceArea?.damage
      ?? (effect.kind === "blizzard" ? 10 : 10);
    const edgeDamage = Math.max(1, Math.floor(centerDamage / 3));
    for (const unit of world.units) {
      if (unit.player === 15 || unit.hitPoints <= 0) {
        continue;
      }
      if (!isUnitVisibleToPlayer(world, unit, effect.player)) {
        continue;
      }
      if (!unitMatchesSourceSpellConditionsForPlayer(world, spellId, effect.player, unit)) {
        continue;
      }
      if (!sourceMissileCanHitUnitByOwnership(world, effect.missileId ?? null, effect.player, unit, effect.sourceUnitId ?? null)) {
        continue;
      }
      const distance = Math.hypot(unit.x - impact.x, unit.y - impact.y);
      if (distance > splashRadius + unit.radius) {
        continue;
      }
      const falloff = Math.max(0, 1 - distance / Math.max(1, splashRadius));
      applyDamage(world, unit, Math.round(edgeDamage + (centerDamage - edgeDamage) * falloff), effect.player, effect.sourceTypeId ?? null, effect.sourceUnitId ?? null);
    }
  }
}

function tickWhirlwindSpell(world: WorldState, effect: NonNullable<WorldState["spellEffects"]>[number]): void {
  const spellId = effect.spellId ?? "spell-whirlwind";
  if (world.tick % sourceWhirlwindDirectionTicks(world, effect.missileId ?? null) === 0) {
    const destination = sourceWhirlwindNextPoint(world, effect);
    effect.x = destination.x;
    effect.y = destination.y;
  }
  if (world.tick % sourceWhirlwindDamagePulseTicks(world) !== 0) {
    return;
  }
  const damage = spellPrimaryMissileDamage(world, spellId, 3);
  const splashRadius = sourceMissileSplashRadius(world, effect.missileId ?? null, world.tileSize * 2);
  for (const unit of world.units) {
    if (
      unit.player === 15
      || unit.hitPoints <= 0
      || !isUnitVisibleToPlayer(world, unit, effect.player)
      || !unitMatchesSourceSpellConditionsForPlayer(world, spellId, effect.player, unit)
      || !sourceMissileCanHitUnitByOwnership(world, effect.missileId ?? null, effect.player, unit, effect.sourceUnitId ?? null)
      || Math.hypot(unit.x - effect.x, unit.y - effect.y) > splashRadius + unit.radius
    ) {
      continue;
    }
    applyDamage(world, unit, damage, effect.player, effect.sourceTypeId ?? null, effect.sourceUnitId ?? null);
  }
}

function sourceWhirlwindDamagePulseTicks(world: WorldState): number {
  return sourceOrderRetryTicks(world, 3);
}

function sourceWhirlwindDirectionTicks(world: WorldState, missileId: string | null): number {
  const missile = missileDefinitionForId(world, missileId);
  const sourceCycles = Math.max(1, Math.floor((missile?.sleep ?? 1) * 100));
  return sourceOrderRetryTicks(world, sourceCycles);
}

function sourceWhirlwindNextPoint(world: WorldState, effect: NonNullable<WorldState["spellEffects"]>[number]): { x: number; y: number } {
  const hash = Math.abs(deterministicHash(`${effect.id}:${world.tick}:whirlwind-direction`));
  const offsetX = (hash % 5) - 2;
  const offsetY = (Math.floor(hash / 5) % 5) - 2;
  const tileX = Math.max(0, Math.min(world.map.width - 1, Math.floor(effect.x / world.tileSize) + offsetX));
  const tileY = Math.max(0, Math.min(world.map.height - 1, Math.floor(effect.y / world.tileSize) + offsetY));
  return tileToWorldCenter(world, tileX, tileY);
}

function areaBombardmentShardImpacts(
  world: WorldState,
  effect: NonNullable<WorldState["spellEffects"]>[number],
  sourceArea: WargusSpell["areaBombardments"][number] | null
): Array<{ x: number; y: number; index: number }> {
  const fields = Math.max(1, Math.floor(sourceArea?.fields ?? Math.max(1, Math.round((effect.radius * 2) / world.tileSize))));
  const shards = Math.max(1, Math.floor(sourceArea?.shards ?? 1));
  const fieldSize = fields * world.tileSize;
  const startOffsetX = sourceArea?.startOffsetX ?? -fieldSize / 2;
  const startOffsetY = sourceArea?.startOffsetY ?? -fieldSize / 2;
  const impacts: Array<{ x: number; y: number; index: number }> = [];
  for (let index = 0; index < shards; index += 1) {
    const xHash = Math.abs(deterministicHash(`${effect.id}:${world.tick}:${index}:x`));
    const yHash = Math.abs(deterministicHash(`${effect.id}:${world.tick}:${index}:y`));
    impacts.push({
      x: effect.x + startOffsetX + (xHash % Math.max(1, fieldSize)),
      y: effect.y + startOffsetY + (yHash % Math.max(1, fieldSize)),
      index
    });
  }
  return impacts;
}

function sourceMissileDamageRoll(world: WorldState, missileId: string | null | undefined, seed: string): number | null {
  const damage = missileDefinitionForId(world, missileId ?? null)?.damage;
  if (!damage) {
    return null;
  }
  const random = damage.random > 0 ? Math.abs(deterministicHash(`${seed}:${missileId}:damage`)) % damage.random : 0;
  return Math.max(0, damage.base + random);
}

function sourceMissileCanHitUnitByOwnership(world: WorldState, missileId: string | null | undefined, player: number, unit: WorldUnit, sourceUnitId: string | null = null): boolean {
  const missile = missileDefinitionForId(world, missileId ?? null);
  if (arePlayersEnemies(world, player, unit.player)) {
    return true;
  }
  if (sourceUnitId && unit.id === sourceUnitId) {
    return missile?.canHitOwner === true;
  }
  return missile?.friendlyFire === true;
}

function emitSourceMissileImpactSound(world: WorldState, missileId: string | null | undefined, player: number, x?: number, y?: number): void {
  const impactSound = missileDefinitionForId(world, missileId ?? null)?.impactSound;
  if (impactSound) {
    emitSoundEvent(world, impactSound, player, x, y);
  }
}

function sourceMissileSplashRadius(world: WorldState, missileId: string | null | undefined, fallback: number): number {
  const range = missileDefinitionForId(world, missileId ?? null)?.range;
  return typeof range === "number" && range > 0 ? range * world.tileSize : fallback;
}

function sourceMissileVisualRadius(missile: WorldState["missileDefinitions"][number] | undefined, fallback: number): number {
  const [width, height] = missile?.size ?? [0, 0];
  return width > 0 || height > 0 ? Math.max(width, height) / 2 : fallback;
}

function sourceSpellVisualRadius(world: WorldState, spellId: string, fallback: number): number {
  return sourceMissileVisualRadius(missileDefinitionForId(world, sourceSpellMissileId(world, spellId)), fallback);
}

function sourceSpellEffectRadius(world: WorldState, spellId: string, fallback: number): number {
  const missileId = sourceSpellMissileId(world, spellId);
  const missile = missileDefinitionForId(world, missileId);
  return Math.max(
    sourceMissileSplashRadius(world, missileId, fallback),
    sourceMissileVisualRadius(missile, fallback)
  );
}

function sourceMissileAnimationDuration(world: WorldState, missile: WorldState["missileDefinitions"][number] | undefined, fallback: number): number {
  if (!missile || missile.frames <= 0 || missile.sleep <= 0) {
    return fallback;
  }
  return sourceCyclesToSeconds(world, missile.frames * missile.sleep);
}

function sourceSpellAnimationDuration(world: WorldState, spellId: string, fallback: number): number {
  return sourceMissileAnimationDuration(world, missileDefinitionForId(world, sourceSpellMissileId(world, spellId)), fallback);
}

function sourceRaiseDeadAutocastCorpse(world: WorldState, caster: WorldUnit, spellId: string): WorldState["corpses"][number] | null {
  const callback = sourcePositionAutocastCallback(world, spellId);
  if (callback && callback !== "SpellBlizzard") {
    return null;
  }
  return findNearestRaiseDeadCorpse(world, caster, spellId);
}

function findNearestRaiseDeadCorpse(world: WorldState, caster: WorldUnit, spellId = "spell-raise-dead"): WorldState["corpses"][number] | null {
  world.corpses ??= [];
  const rangeTiles = spellAiRangeTiles(world, spellId, 6);
  return world.corpses
    .filter((corpse) => isCorpseInRaiseDeadRange(world, caster, corpse, rangeTiles))
    .filter((corpse) => isCircleVisibleToPlayer(world, corpse.x, corpse.y, corpse.radius, caster.player))
    .sort((a, b) => (a.x - caster.x) ** 2 + (a.y - caster.y) ** 2 - ((b.x - caster.x) ** 2 + (b.y - caster.y) ** 2))[0] ?? null;
}

function findRaiseDeadCorpseNearPoint(world: WorldState, caster: WorldUnit, x: number, y: number, rangeTiles: number): WorldState["corpses"][number] | null {
  return findSourceSummonCorpseNearPoint(world, caster, x, y, rangeTiles);
}

function findSourceSummonCorpseNearPoint(world: WorldState, caster: WorldUnit, x: number, y: number, rangeTiles: number): WorldState["corpses"][number] | null {
  world.corpses ??= [];
  return world.corpses
    .filter((corpse) => Math.hypot(corpse.x - x, corpse.y - y) <= Math.max(corpse.radius + 26, 48))
    .filter((corpse) => isCorpseInRaiseDeadRange(world, caster, corpse, rangeTiles))
    .filter((corpse) => isCircleVisibleToPlayer(world, corpse.x, corpse.y, corpse.radius, caster.player))
    .sort((a, b) => distanceSquared({ x, y }, a) - distanceSquared({ x, y }, b))[0] ?? null;
}

function isCorpseInRaiseDeadRange(world: WorldState, caster: WorldUnit, corpse: WorldState["corpses"][number], rangeTiles: number): boolean {
  return Math.hypot(corpse.x - caster.x, corpse.y - caster.y) <= rangeTiles * world.tileSize + corpse.radius;
}

function findSpellSpawnTileNear(world: WorldState, x: number, y: number, unitDefinition: WargusUnit): { x: number; y: number } | null {
  const centerTileX = Math.floor(x / world.tileSize);
  const centerTileY = Math.floor(y / world.tileSize);
  const width = Math.max(1, unitDefinition.tileSize[0]);
  const height = Math.max(1, unitDefinition.tileSize[1]);
  for (let radius = 0; radius <= 3; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
          continue;
        }
        const tileX = centerTileX + dx - Math.floor(width / 2);
        const tileY = centerTileY + dy - Math.floor(height / 2);
        if (canPlaceBuilding(world, unitDefinition, tileX, tileY)) {
          return { x: tileX, y: tileY };
        }
      }
    }
  }
  return null;
}

function upgradeCostPairs(upgrade: WargusUpgrade): string[] {
  return ["time", String(upgrade.costs.time), "gold", String(upgrade.costs.gold), "wood", String(upgrade.costs.wood), "oil", String(upgrade.costs.oil)];
}

function removeDeadUnits(world: WorldState, expiredUnitIds: Set<string> = new Set()): void {
  world.corpses ??= [];
  const deadUnitIds = new Set<string>(expiredUnitIds);
  for (const unit of world.units) {
    if (unit.hitPoints <= 0) {
      deadUnitIds.add(unit.id);
      if (expiredUnitIds.has(unit.id)) {
        for (const cargoUnit of unit.cargo ?? []) {
          deadUnitIds.add(cargoUnit.id);
        }
        continue;
      }
      restoreOilPatchForRemovedPlatform(world, unit);
      dropCarriedResourcesOnDeath(unit);
      if (unit.construction?.builderInside) {
        const builder = findUnit(world, unit.construction.builderId);
        if (builder?.hiddenInConstructionId === unit.id) {
          releaseBuilderFromConstruction(world, builder, unit);
        }
      }
      recordUnitDeath(world, unit);
      world.events.push({ kind: "unit-dead", unitId: unit.id, typeId: unit.typeId, player: unit.player, x: unit.x, y: unit.y });
      addDeathExplosionEffect(world, unit);
      addDeadVisionRevealer(world, unit);
      const corpse = createCorpseForUnit(world, unit);
      if (corpse) {
        world.corpses.push(corpse);
      }
      for (const cargoUnit of unit.cargo ?? []) {
        deadUnitIds.add(cargoUnit.id);
        dropCarriedResourcesOnDeath(cargoUnit);
        recordUnitDeath(world, cargoUnit, unit.lastDamagePlayer, unit.lastDamageSourceUnitId);
        world.events.push({ kind: "unit-dead", unitId: cargoUnit.id, typeId: cargoUnit.typeId, player: cargoUnit.player, x: cargoUnit.x, y: cargoUnit.y });
      }
    }
  }
  if (deadUnitIds.size > 0) {
    clearReferencesToDeadUnits(world, deadUnitIds);
  }
  world.units = world.units.filter((unit) => unit.hitPoints > 0);
  removeDeadCargoUnits(world, deadUnitIds);
}

function dropCarriedResourcesOnDeath(unit: WorldUnit): void {
  if (unit.resourcesHeld <= 0 || !isHarvestResource(unit.carriedResource)) {
    return;
  }
  unit.resourcesHeld = 0;
  unit.carriedResource = null;
}

function restoreOilPatchForRemovedPlatform(world: WorldState, platform: WorldUnit): void {
  const platformDefinition = world.unitDefinitions.find((unit) => unit.id === platform.typeId);
  const ontopRule = platformDefinition ? buildingOntopRule(platformDefinition) : null;
  if (!platformDefinition?.replaceOnDie || !ontopRule || platform.resourcesHeld <= 0) {
    return;
  }
  const patchDefinition = world.unitDefinitions.find((unit) => unit.id === ontopRule.typeId);
  if (!patchDefinition) {
    return;
  }
  const platformTile = worldToTile(world, platform.x, platform.y);
  const existingPatch = world.units.some((unit) => (
    unit.id !== platform.id
    && unit.typeId === patchDefinition.id
    && unit.hitPoints > 0
    && Math.hypot(unit.x - platform.x, unit.y - platform.y) <= world.tileSize
  ));
  if (existingPatch) {
    return;
  }
  const patch = createWorldUnit({
    unit: patchDefinition,
    id: `${patchDefinition.id}-${world.nextUnitSerial}`,
    player: 15,
    tileX: Math.max(0, platformTile.x - Math.floor(patchDefinition.tileSize[0] / 2)),
    tileY: Math.max(0, platformTile.y - Math.floor(patchDefinition.tileSize[1] / 2)),
    resourcesHeld: platform.resourcesHeld,
    tileset: world.map.setup?.tileset ?? null
  });
  world.nextUnitSerial += 1;
  world.units.push(patch);
}

function buildingOntopRule(unit: WargusUnit): Extract<NonNullable<WargusUnit["buildingRules"]>[number], { kind: "ontop" }> | null {
  return unit.buildingRules?.find((rule): rule is Extract<typeof rule, { kind: "ontop" }> => rule.kind === "ontop") ?? null;
}

function sourceReplaceOnBuildTargets(world: WorldState, buildingDefinition: WargusUnit, tileX: number, tileY: number): WorldUnit[] {
  const ontopRule = buildingOntopRule(buildingDefinition);
  if (!buildingDefinition.replaceOnBuild || !ontopRule?.replaceOnBuild) {
    return [];
  }
  const width = Math.max(1, buildingDefinition.tileSize[0]);
  const height = Math.max(1, buildingDefinition.tileSize[1]);
  return world.units.filter((unit) => (
    unit.hitPoints > 0
    && unit.typeId === ontopRule.typeId
    && footprintTileGap(world, tileX, tileY, width, height, unit) === 0
  ));
}

function removeDeadCargoUnits(world: WorldState, deadUnitIds: Set<string>): void {
  for (const unit of world.units) {
    if (!unit.cargo?.length) {
      continue;
    }
    unit.cargo = unit.cargo.filter((cargoUnit) => cargoUnit.hitPoints > 0 && !deadUnitIds.has(cargoUnit.id));
  }
}

function clearReferencesToDeadUnits(world: WorldState, deadUnitIds: Set<string>): void {
  world.activeResearch = world.activeResearch.filter((research) => !deadUnitIds.has(research.buildingId));
  world.queuedResearch = world.queuedResearch.filter((research) => !deadUnitIds.has(research.buildingId));
  clearReferencesToUnavailableUnits(world, deadUnitIds);
}

function clearReferencesToUnavailableUnits(world: WorldState, unavailableUnitIds: Set<string>): void {
  world.pendingAttacks = (world.pendingAttacks ?? []).filter((pendingAttack) => (
    !unavailableUnitIds.has(pendingAttack.sourceId)
    && (!pendingAttack.targetId || !unavailableUnitIds.has(pendingAttack.targetId))
  ));
  world.projectiles = world.projectiles.map((projectile) => (
    projectile.targetId && unavailableUnitIds.has(projectile.targetId)
      ? { ...projectile, targetId: null }
      : projectile
  ));
  for (const unit of world.units) {
    if (unit.hitPoints <= 0) {
      continue;
    }
      unit.moveQueue = unit.moveQueue?.filter((order) => (
        Number.isFinite(order.x)
        && Number.isFinite(order.y)
        && (!("targetId" in order) || order.targetId === null || !unavailableUnitIds.has(order.targetId))
      )) ?? [];
    unit.rallyPoint = normalizeRuntimeMapPoint(world, unit.rallyPoint);
    if (unit.construction?.builderId && unavailableUnitIds.has(unit.construction.builderId)) {
      unit.construction.builderId = "";
    }
    if (unit.order?.kind === "follow" && unit.order.attackTargetId && unavailableUnitIds.has(unit.order.attackTargetId)) {
      unit.order.attackTargetId = null;
    }
    if (!unit.order) {
      continue;
    }
    if (isSoftCombatTargetOrder(unit.order) && unit.order.targetId && unavailableUnitIds.has(unit.order.targetId)) {
      unit.order.targetId = null;
      continue;
    }
    if (orderHasHardUnavailableTargetReference(unit.order, unavailableUnitIds)) {
      unit.order = null;
      startNextQueuedMove(world, unit);
    }
  }
}

function isSoftCombatTargetOrder(order: WorldUnit["order"]): order is Extract<WorldUnit["order"], { kind: "attack-move" | "patrol" | "hold" }> {
  return order?.kind === "attack-move" || order?.kind === "patrol" || order?.kind === "hold";
}

function orderHasHardUnavailableTargetReference(order: WorldUnit["order"], unavailableUnitIds: Set<string>): boolean {
  if (!order) {
    return false;
  }
  if ("targetId" in order && typeof order.targetId === "string" && unavailableUnitIds.has(order.targetId)) {
    return true;
  }
  return order.kind === "harvest" && order.targetId !== null && unavailableUnitIds.has(order.targetId);
}

function normalizeRuntimeMapPoint(world: WorldState, point: { x: number; y: number } | null): { x: number; y: number } | null {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return null;
  }
  return {
    x: Math.max(0, Math.min(world.map.width * world.tileSize - 1, point.x)),
    y: Math.max(0, Math.min(world.map.height * world.tileSize - 1, point.y))
  };
}

function recordUnitDeath(world: WorldState, unit: WorldUnit, fallbackKiller: number | null = null, fallbackKillerUnitId: string | null = null): void {
  const owner = world.players.find((player) => player.id === unit.player);
  if (owner) {
    owner.stats ??= createEmptyStats();
    owner.stats.pointsLost += unit.points;
    if (isSourceResultBuilding(unit)) {
      owner.stats.buildingsLost += 1;
    } else if (unit.player !== 15) {
      owner.stats.unitsLost += 1;
    }
  }
  const killerPlayer = unit.lastDamagePlayer ?? fallbackKiller;
  if (killerPlayer === null || killerPlayer === unit.player || unit.player === 15) {
    return;
  }
  const killerUnitId = unit.lastDamageSourceUnitId ?? fallbackKillerUnitId;
  const killerUnit = killerUnitId ? findUnit(world, killerUnitId) : undefined;
  if (killerUnit && killerUnit.player === killerPlayer && killerUnit.hitPoints > 0) {
    killerUnit.kills = Math.max(0, Math.floor(killerUnit.kills ?? 0)) + 1;
    killerUnit.xp = Math.max(0, Math.floor(killerUnit.xp ?? 0)) + Math.max(0, Math.floor(unit.points));
  }
  const killer = world.players.find((player) => player.id === killerPlayer);
  if (!killer) {
    return;
  }
  killer.stats ??= createEmptyStats();
  killer.stats.pointsKilled += unit.points;
  if (isSourceResultBuilding(unit)) {
    killer.stats.buildingsRazed += 1;
  } else {
    killer.stats.unitsKilled += 1;
  }
}

function isSourceResultBuilding(unit: WorldUnit): boolean {
  return isBuildingLike(unit);
}

function createEmptyStats(): WorldState["players"][number]["stats"] {
  return {
    totalUnits: 0,
    totalBuildings: 0,
    unitsKilled: 0,
    buildingsRazed: 0,
    unitsLost: 0,
    buildingsLost: 0,
    pointsKilled: 0,
    pointsLost: 0,
    goldMined: 0,
    woodHarvested: 0,
    oilHarvested: 0
  };
}

function createCorpseForUnit(world: WorldState, unit: WorldUnit): WorldState["corpses"][number] | null {
  if (unit.vanishes) {
    return null;
  }
  const corpseDefinition = unit.corpseTypeId
    ? world.unitDefinitions.find((definition) => definition.id === unit.corpseTypeId)
    : null;
  const fallbackToUnitDeathAnimation = !corpseDefinition && shouldFallbackToUnitDeathAnimation(unit);
  if (!corpseDefinition && !fallbackToUnitDeathAnimation) {
    return null;
  }
  const tileWidth = Math.max(corpseDefinition?.tileSize?.[0] ?? unit.tileWidth, 1);
  const tileHeight = Math.max(corpseDefinition?.tileSize?.[1] ?? unit.tileHeight, 1);
  return {
    id: `corpse-${world.tick}-${world.corpses.length}`,
    typeId: corpseDefinition?.id ?? unit.typeId,
    player: unit.player,
    x: unit.x,
    y: unit.y,
    radius: Math.max(12, Math.max(tileWidth, tileHeight) * 16, unit.radius * 0.75),
    drawLevel: Math.max(0, corpseDefinition?.drawLevel ?? unit.drawLevel),
    visibleUnderFog: corpseDefinition?.visibleUnderFog ?? unit.visibleUnderFog,
    facing: unit.facing,
    animation: corpseDefinition?.animation ?? unit.animation,
    frameWidth: tileWidth === 1 ? 72 : tileWidth * 32,
    frameHeight: tileHeight === 1 ? 72 : tileHeight * 32,
    age: 0,
    duration: sourceDeathAnimationDurationSeconds(world, corpseDefinition?.animation ?? unit.animation)
  };
}

function addDeadVisionRevealer(world: WorldState, unit: WorldUnit): void {
  if (unit.vanishes || unit.sightRangeTiles <= 0) {
    return;
  }
  const revealerTypeId = `unit-dead-vision-${Math.max(1, unit.tileWidth)}-${Math.max(1, Math.floor(unit.sightRangeTiles))}`;
  const revealerDefinition = world.unitDefinitions.find((definition) => definition.id === revealerTypeId);
  if (!revealerDefinition) {
    return;
  }
  const tile = worldToTile(world, unit.x, unit.y);
  const revealer = createWorldUnit({
    unit: revealerDefinition,
    id: `${revealerTypeId}-${world.nextUnitSerial}`,
    player: unit.player,
    tileX: tile.x,
    tileY: tile.y,
    tileset: world.map.setup?.tileset ?? null
  });
  revealer.x = unit.x;
  revealer.y = unit.y;
  revealer.lifetimeSeconds = sourceCyclesToSeconds(world, 160);
  revealer.order = null;
  revealer.moveQueue = [];
  world.nextUnitSerial += 1;
  world.units.push(revealer);
}

function addDeathExplosionEffect(world: WorldState, unit: WorldUnit): void {
  if (!unit.explosionType) {
    return;
  }
  const explosionMissile = missileDefinitionForId(world, unit.explosionType);
  const fallbackRadius = deathExplosionRadius(unit);
  addSpellEffect(
    world,
    "explosion",
    unit.player,
    unit.x,
    unit.y,
    Math.max(fallbackRadius, sourceMissileVisualRadius(explosionMissile, fallbackRadius)),
    sourceMissileAnimationDuration(world, explosionMissile, 0.65),
    unit.typeId,
    null,
    unit.explosionType
  );
}

function deathExplosionRadius(unit: WorldUnit): number {
  return Math.max(42, Math.max(unit.tileWidth, unit.tileHeight) * 24, unit.radius * 1.35);
}

function shouldFallbackToUnitDeathAnimation(unit: WorldUnit): boolean {
  if (unit.player === 15 || isBuildingLike(unit) || unit.kind === "naval" || unit.kind === "fly") {
    return false;
  }
  if (unit.lifetimeSeconds !== undefined) {
    return false;
  }
  return unit.tileWidth <= 1 && unit.tileHeight <= 1;
}

function sourceDeathAnimationDurationSeconds(world: WorldState, animationId: string | null): number {
  const frames = world.animationDefinitions.find((animation) => animation.id === animationId)?.actions.Death;
  if (!frames || frames.length === 0) {
    return sourceCyclesToSeconds(world, 1);
  }
  const cycles = frames.reduce((total, frame) => total + Math.max(1, Math.floor(frame.wait || 1)), 0);
  return sourceCyclesToSeconds(world, cycles);
}

function updateMatchState(world: WorldState): void {
  if (world.matchState.status !== "playing" || world.tick < 30) {
    return;
  }
  if (hasFailedSourceDefeatRequirement(world) || hasFailedHeroSurvivalObjective(world)) {
    world.matchState = { status: "defeat", winner: null, endedTick: world.tick };
    return;
  }
  const requirements = effectiveVictoryRequirements(world);
  const sourceVictoryRequirementsMet = world.victoryRequirementGroups.length > 0
    ? world.victoryRequirementGroups.some((group) => group.clauses.every((requirement) => isVictoryRequirementMet(world, requirement)))
    : requirements.length > 0 && requirements.every((requirement) => isVictoryRequirementMet(world, requirement));
  if (sourceVictoryRequirementsMet && !hasUnmetTargetedDestructionObjective(world) && !hasUnmetEnemyEliminationObjective(world) && !hasUnmetLocationBuildObjective(world) && !hasUnmetCaptureObjective(world)) {
    world.matchState = { status: "victory", winner: world.visibilityPlayer, endedTick: world.tick };
    return;
  }
  if (isLocationBuildObjectiveMet(world)) {
    world.matchState = { status: "victory", winner: world.visibilityPlayer, endedTick: world.tick };
    return;
  }
  if (isTimedVictoryTriggerComplete(world)) {
    world.matchState = { status: "victory", winner: world.visibilityPlayer, endedTick: world.tick };
    return;
  }
  if (isCircleOfPowerObjectiveMet(world) && world.timedVictoryTriggers.length === 0) {
    world.matchState = { status: "victory", winner: world.visibilityPlayer, endedTick: world.tick };
    return;
  }
  if (isPortalReachObjectiveMet(world)) {
    world.matchState = { status: "victory", winner: world.visibilityPlayer, endedTick: world.tick };
    return;
  }
  if (isCaptureObjectiveMet(world)) {
    world.matchState = { status: "victory", winner: world.visibilityPlayer, endedTick: world.tick };
    return;
  }
  if (isTargetedDestructionObjectiveMet(world) && !hasUnmetPortalReachObjective(world) && !hasUnmetEnemyEliminationObjective(world) && !hasUnmetCaptureObjective(world)) {
    world.matchState = { status: "victory", winner: world.visibilityPlayer, endedTick: world.tick };
    return;
  }
  const alivePlayers = new Set(
    liveUnitsIncludingCargo(world)
      .filter((unit) => unit.player !== 15 && unit.hitPoints > 0)
      .map((unit) => unit.player)
  );
  const playerAlive = alivePlayers.has(world.visibilityPlayer);
  if (!playerAlive) {
    world.matchState = { status: "defeat", winner: [...alivePlayers][0] ?? null, endedTick: world.tick };
    return;
  }
  const enemiesAlive = [...alivePlayers].some((player) => player !== world.visibilityPlayer);
  if (!enemiesAlive && !hasUnmetCircleOfPowerObjective(world) && !hasUnmetPortalReachObjective(world) && !hasUnmetLocationBuildObjective(world) && !hasUnmetCaptureObjective(world)) {
    world.matchState = { status: "victory", winner: world.visibilityPlayer, endedTick: world.tick };
  }
}

function isVictoryRequirementMet(world: WorldState, requirement: WorldState["victoryRequirements"][number]): boolean {
  if (requirement.kind === "unit-count") {
    const count = liveUnitsIncludingCargo(world).filter((unit) => unit.player === world.visibilityPlayer && unit.typeId === requirement.unitTypeId && unit.hitPoints > 0).length;
    return count >= requirement.minimum;
  }
  if (requirement.kind === "unit-count-exact") {
    const count = liveUnitsIncludingCargo(world).filter((unit) => unit.player === world.visibilityPlayer && unit.typeId === requirement.unitTypeId && unit.hitPoints > 0).length;
    return count === requirement.count;
  }
  if (requirement.kind === "unit-destroyed") {
    return !liveUnitsIncludingCargo(world).some((unit) => unit.player === requirement.player && unit.typeId === requirement.unitTypeId && unit.hitPoints > 0);
  }
  if (requirement.kind === "player-defeated") {
    return !liveUnitsIncludingCargo(world).some((unit) => unit.player === requirement.player && unit.hitPoints > 0);
  }
  if (requirement.kind === "opponents-defeated") {
    return !enemyPlayersStillAlive(world);
  }
  return false;
}

function isTimedVictoryTriggerComplete(world: WorldState): boolean {
  const triggerIndex = world.timedVictoryTriggers.findIndex((trigger) => isTimedVictoryTriggerConditionMet(world, trigger));
  if (triggerIndex < 0) {
    return false;
  }
  const trigger = world.timedVictoryTriggers[triggerIndex];
  if (!world.pendingTimedVictory || world.pendingTimedVictory.triggerIndex !== triggerIndex) {
    world.pendingTimedVictory = {
      triggerIndex,
      remainingTicks: Math.max(0, trigger.delayTicks),
      soundPlayed: false
    };
  }
  if (!world.pendingTimedVictory.soundPlayed && trigger.soundId) {
    emitSoundEvent(world, trigger.soundId, world.visibilityPlayer);
    world.pendingTimedVictory.soundPlayed = true;
  }
  world.pendingTimedVictory.remainingTicks -= 1;
  return world.pendingTimedVictory.remainingTicks <= 0;
}

function isTimedVictoryTriggerConditionMet(world: WorldState, trigger: WorldState["timedVictoryTriggers"][number]): boolean {
  if (trigger.kind === "circle-of-power") {
    return isCircleOfPowerObjectiveMet(world);
  }
  return false;
}

function hasFailedSourceDefeatRequirement(world: WorldState): boolean {
  return world.defeatRequirements.some((requirement) => isDefeatRequirementMet(world, requirement));
}

function isDefeatRequirementMet(world: WorldState, requirement: WorldState["defeatRequirements"][number]): boolean {
  if (requirement.kind === "player-defeated") {
    const player = sourceRequirementPlayer(world, requirement.player);
    return !liveUnitsIncludingCargo(world).some((unit) => unit.player === player && unit.hitPoints > 0);
  }
  if (requirement.kind === "unit-group-destroyed") {
    const players = requirement.players.map((player) => sourceRequirementPlayer(world, player));
    return !liveUnitsIncludingCargo(world).some((unit) => players.includes(unit.player) && unit.typeId === requirement.unitTypeId && unit.hitPoints > 0);
  }
  if (requirement.kind === "unit-count-below") {
    const players = requirement.players.map((player) => sourceRequirementPlayer(world, player));
    const count = liveUnitsIncludingCargo(world).filter((unit) => players.includes(unit.player) && unit.typeId === requirement.unitTypeId && unit.hitPoints > 0).length;
    return count < requirement.threshold;
  }
  return false;
}

function sourceRequirementPlayer(world: WorldState, player: number | "self"): number {
  return player === "self" ? world.visibilityPlayer : player;
}

export function effectiveVictoryRequirements(world: WorldState): WorldState["victoryRequirements"] {
  const byKey = new Map<string, WorldState["victoryRequirements"][number]>();
  for (const requirement of [...world.victoryRequirements, ...inferObjectiveVictoryRequirements(world)]) {
    const key = requirement.kind === "unit-count"
      ? `${requirement.kind}:${requirement.unitTypeId}`
      : requirement.kind === "unit-count-exact"
        ? `${requirement.kind}:${requirement.unitTypeId}:${requirement.count}`
        : requirement.kind === "unit-destroyed"
          ? `${requirement.kind}:${requirement.player}:${requirement.unitTypeId}`
          : requirement.kind === "player-defeated"
            ? `${requirement.kind}:${requirement.player}`
            : requirement.kind;
    const existing = byKey.get(key);
    if (!existing || (existing.kind === "unit-count" && requirement.kind === "unit-count" && existing.minimum < requirement.minimum)) {
      byKey.set(key, requirement);
    }
  }
  return [...byKey.values()];
}

function inferObjectiveVictoryRequirements(world: WorldState): WorldState["victoryRequirements"] {
  if (hasSourceBuildVictoryRequirements(world)) {
    return [];
  }
  const requirements: WorldState["victoryRequirements"] = [];
  const player = world.players.find((candidate) => candidate.id === world.visibilityPlayer);
  const race = player?.race ?? "human";
  const playerId = player?.id ?? world.visibilityPlayer;
  const text = world.objectives.join(" ").toLowerCase();
  const shipyardType = sourceBuildObjectiveTypeId(world, playerId, race === "orc" ? "unit-orc-shipyard" : "unit-human-shipyard", (definition) => sourceBuildDefinitionProducesMatching(world, definition.id, isNavalCombatOrUtilityDefinition, playerId));
  const farmType = sourceBuildObjectiveTypeId(world, playerId, race === "orc" ? "unit-pig-farm" : "unit-farm", isSupplyProviderDefinition);
  const barracksType = sourceBuildObjectiveTypeId(world, playerId, race === "orc" ? "unit-orc-barracks" : "unit-human-barracks", (definition) => sourceBuildDefinitionProducesMatching(world, definition.id, isOrdinaryBarracksCombatDefinition, playerId));
  const oilPlatformType = sourceBuildObjectiveTypeId(world, playerId, race === "orc" ? "unit-orc-oil-platform" : "unit-human-oil-platform", (definition) => isOilPlatformDefinition(definition, world.unitDefinitions));
  const castleType = topTownCenterObjectiveTypeId(world, playerId, "human", "unit-castle");
  const fortressType = topTownCenterObjectiveTypeId(world, playerId, "orc", "unit-fortress");

  addBuildRequirement(requirements, text, "farm", farmType);
  addBuildRequirement(requirements, text, "farms", farmType);
  addBuildRequirement(requirements, text, "barracks", barracksType);
  addBuildRequirement(requirements, text, "shipyard", shipyardType);
  addBuildRequirement(requirements, text, "shipyards", shipyardType);
  addBuildRequirement(requirements, text, "oil platform", oilPlatformType);
  addBuildRequirement(requirements, text, "oil platforms", oilPlatformType);
  addBuildRequirement(requirements, text, "oil derrick", oilPlatformType);
  addBuildRequirement(requirements, text, "oil derricks", oilPlatformType);
  addBuildRequirement(requirements, text, "castle", castleType);
  addBuildRequirement(requirements, text, "fortress", fortressType);

  return requirements;
}

function hasSourceBuildVictoryRequirements(world: WorldState): boolean {
  if (world.locationBuildRequirements.length > 0) {
    return true;
  }
  return [...world.victoryRequirements, ...world.victoryRequirementGroups.flatMap((group) => group.clauses)].some((requirement) => (
    requirement.kind === "unit-count"
    || requirement.kind === "unit-count-exact"
  ));
}

function sourceBuildObjectiveTypeId(world: WorldState, playerId: number, fallbackTypeId: string, matchesBuilding: (definition: WargusUnit) => boolean): string {
  const builders = world.units.filter((unit) => unit.player === playerId && isUsableBuilder(unit));
  const sourceButtonTarget = builders
    .flatMap((builder) => world.buttonDefinitions
      .filter((button): button is WargusButton & { value: string } => button.action === "build" && typeof button.value === "string" && sourceButtonAppliesTo(button, builder.typeId))
      .filter((button) => sourceButtonAllowedForSimulation(world, button, builder.player)))
    .sort(compareSourceButtons)
    .map((button) => world.unitDefinitions.find((definition) => definition.id === button.value))
    .find((definition): definition is WargusUnit => Boolean(definition && matchesBuilding(definition) && isUnitTypeAllowed(world, definition.id, playerId)));
  return sourceButtonTarget?.id ?? fallbackTypeId;
}

function topTownCenterObjectiveTypeId(world: WorldState, playerId: number, race: "human" | "orc", fallbackTypeId: string): string {
  const sourceType = world.unitDefinitions
    .filter((definition) => definition.mainFacility && isUnitTypeAllowed(world, definition.id, playerId))
    .sort((a, b) => (
      raceTypeScore(world, b, race) - raceTypeScore(world, a, race)
      || townCenterTier(world, b.id, playerId) - townCenterTier(world, a.id, playerId)
    ))[0];
  return sourceType && townCenterTier(world, sourceType.id, playerId) >= 3 ? sourceType.id : fallbackTypeId;
}

function raceTypeScore(world: WorldState, definition: WargusUnit, race: "human" | "orc"): number {
  return sourceRaceScoreForUnitDefinition(definition, world.unitDatabase, race);
}

function addBuildRequirement(requirements: WorldState["victoryRequirements"], objectiveText: string, phrase: string, unitTypeId: string | null): void {
  if (!unitTypeId) {
    return;
  }
  const pattern = new RegExp(`(?:build|erect|and)\\s+(one|two|three|four|five|six|a|an)?\\s*${escapeRegExp(phrase)}\\b`, "i");
  const match = objectiveText.match(pattern);
  if (!match) {
    return;
  }
  requirements.push({ kind: "unit-count", unitTypeId, minimum: objectiveCountWordToNumber(match[1]) });
}

function objectiveCountWordToNumber(word: string | undefined): number {
  if (!word || word === "a" || word === "an" || word === "one") {
    return 1;
  }
  const counts: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6 };
  return counts[word] ?? 1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isCircleOfPowerObjectiveMet(world: WorldState): boolean {
  if (world.circleOfPowerRequirements.length > 0) {
    return world.circleOfPowerRequirements.every((requirement) => isCircleOfPowerRequirementMet(world, requirement));
  }
  if (world.rescuedCircleRequirements.length > 0) {
    return world.rescuedCircleRequirements.every((requirement) => isRescuedCircleRequirementMet(world, requirement));
  }
  return false;
}

function hasUnmetCircleOfPowerObjective(world: WorldState): boolean {
  return (world.circleOfPowerRequirements.length > 0 || world.rescuedCircleRequirements.length > 0) && !isCircleOfPowerObjectiveMet(world);
}

function isCircleOfPowerRequirementMet(world: WorldState, requirement: WorldState["circleOfPowerRequirements"][number]): boolean {
  const circles = world.units.filter((unit) => unit.typeId === requirement.circleTypeId && unit.hitPoints > 0);
  if (circles.length === 0) {
    return false;
  }
  const escorted = world.units.filter((unit) => (
    unit.player === world.visibilityPlayer
    && unit.typeId === requirement.unitTypeId
    && unit.hitPoints > 0
    && circles.some((circle) => Math.hypot(unit.x - circle.x, unit.y - circle.y) <= Math.max(112, circle.radius + unit.radius + 48))
  ));
  return escorted.length >= requirement.minimum;
}

function isRescuedCircleRequirementMet(world: WorldState, requirement: WorldState["rescuedCircleRequirements"][number]): boolean {
  const circles = world.units.filter((unit) => unit.typeId === requirement.circleTypeId && unit.hitPoints > 0);
  if (circles.length === 0) {
    return false;
  }
  const escorted = world.units.filter((unit) => (
    unit.player === world.visibilityPlayer
    && requirement.unitTypeIds.includes(unit.typeId)
    && unit.hitPoints > 0
    && circles.some((circle) => Math.hypot(unit.x - circle.x, unit.y - circle.y) <= Math.max(112, circle.radius + unit.radius + 48))
  ));
  return escorted.length >= requirement.minimum;
}

function isCaptureObjectiveMet(world: WorldState): boolean {
  if (hasSourceCaptureVictoryRequirements(world)) {
    return false;
  }
  const captureGroups = captureTargetGroupsForObjectives(world);
  if (captureGroups.length === 0 || hasUnmetTargetedDestructionObjective(world)) {
    return false;
  }
  if (requiresEnemyEliminationForCapture(world.objectives) && enemyPlayersStillAlive(world)) {
    return false;
  }
  return captureGroups.every((group) => isCaptureTargetGroupSecured(world, group));
}

function hasUnmetCaptureObjective(world: WorldState): boolean {
  if (hasSourceCaptureVictoryRequirements(world)) {
    return false;
  }
  return captureTargetGroupsForObjectives(world).some((group) => !isCaptureTargetGroupSecured(world, group));
}

function hasSourceCaptureVictoryRequirements(world: WorldState): boolean {
  return world.victoryRequirementGroups.length > 0
    && world.objectives.some((objective) => /capture|recapture|secure|recruit|rescue|free|alterac traitors/i.test(objective));
}

function captureTargetGroupsForObjectives(world: WorldState): string[][] {
  const groups: string[][] = [];
  for (const objective of world.objectives) {
    const objectiveText = objective.toLowerCase();
    if (!/(capture|recapture|secure|recruit|rescue|free|alterac traitors)/.test(objectiveText)) {
      continue;
    }
    if (objectiveText.includes("dragon roost") || objectiveText.includes("dragons")) {
      groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-dragon-roost"], /dragon roost|dragon/i, (definition) => definition.building === true));
    }
    if (objectiveText.includes("dark portal")) {
      groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-dark-portal"], /dark portal|great portal/i));
    }
    if (objectiveText.includes("runestone")) {
      groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-runestone"], /runestone/i));
    }
    if (objectiveText.includes("alterac traitors")) {
      groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-peasant", "unit-attack-peasant"], /peasant|minuteman|attack peasant/i, (definition) => definition.landUnit === true && definition.building !== true));
    }
    if (objectiveText.includes("orc transport")) {
      groups.push(sourceDestructionTypeGroup(world, ["unit-orc-transport"], (definition) => isNavalRoleDefinition(definition, "transport") && raceTypeScore(world, definition, "orc") > 0));
    } else if (objectiveText.includes("human transport")) {
      groups.push(sourceDestructionTypeGroup(world, ["unit-human-transport"], (definition) => isNavalRoleDefinition(definition, "transport") && raceTypeScore(world, definition, "human") > 0));
    } else if (objectiveText.includes("transport")) {
      groups.push(sourceDestructionTypeGroup(world, ["unit-human-transport", "unit-orc-transport"], (definition) => isNavalRoleDefinition(definition, "transport")));
    }
    if (objectiveText.includes("thunderlord")) {
      groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-fad-man"], /dentarg|fad man/i));
    }
    if (objectiveText.includes("shattered hand")) {
      groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-quick-blade"], /korgath|bladefist|quick blade/i));
    }
    if (objectiveText.includes("zuljin") || objectiveText.includes("zul'jin")) {
      groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-sharp-axe"], /zul'?jin|sharp axe/i));
    }
    if (objectiveText.includes("rescue the mage") || objectiveText.includes("free the mages")) {
      groups.push(sourceDestructionTypeGroup(world, ["unit-mage"], (definition) => isCasterDefinition(definition) && raceTypeScore(world, definition, "human") > 0));
    }
    if (objectiveText.includes("free the mages and peasants") || objectiveText.includes("free the peasants")) {
      groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-peasant"], /peasant/i, (definition) => definition.landUnit === true && definition.building !== true));
    }
  }
  return groups;
}

function isCaptureTargetGroupSecured(world: WorldState, group: string[]): boolean {
  const targets = liveUnitsIncludingCargo(world).filter((unit) => group.includes(unit.typeId) && unit.hitPoints > 0);
  return targets.length > 0 && targets.every((unit) => unit.player === world.visibilityPlayer);
}

function requiresEnemyEliminationForCapture(objectives: string[]): boolean {
  return objectives.some(isEnemyEliminationObjective);
}

function enemyPlayersStillAlive(world: WorldState): boolean {
  return liveUnitsIncludingCargo(world).some((unit) => arePlayersEnemies(world, world.visibilityPlayer, unit.player) && unit.hitPoints > 0);
}

function hasUnmetEnemyEliminationObjective(world: WorldState): boolean {
  if (hasSourceEnemyEliminationVictoryRequirements(world)) {
    return false;
  }
  return world.objectives.some(isEnemyEliminationObjective) && enemyPlayersStillAlive(world);
}

function hasSourceEnemyEliminationVictoryRequirements(world: WorldState): boolean {
  return [...world.victoryRequirements, ...world.victoryRequirementGroups.flatMap((group) => group.clauses)].some((requirement) => (
    requirement.kind === "player-defeated"
    || requirement.kind === "opponents-defeated"
  ));
}

function isEnemyEliminationObjective(objective: string): boolean {
  return /destroy all humans|destroy all enemy|destroy enemy forces|destroy all enemy forces|destroy everything|destroy stromgarde|quell the peasant uprising/i.test(objective);
}

function isPortalReachObjectiveMet(world: WorldState): boolean {
  if (hasSourcePortalReachVictoryRequirements(world)) {
    return false;
  }
  const objectiveText = world.objectives.join(" ").toLowerCase();
  if (!objectiveText.includes("must reach") || !objectiveText.includes("portal")) {
    return false;
  }
  if (hasUnmetTargetedDestructionObjective(world)) {
    return false;
  }
  const portalTypes = sourceNamedObjectiveTypeGroup(world, ["unit-dark-portal"], /dark portal|great portal/i);
  const portals = world.units.filter((unit) => portalTypes.includes(unit.typeId) && unit.hitPoints > 0);
  if (portals.length === 0) {
    return false;
  }
  const requiredIds = world.requiredSurvivalUnitIds.length > 0
    ? world.requiredSurvivalUnitIds
    : world.units.filter((unit) => unit.player === world.visibilityPlayer && isCircleObjectiveUnit(unit)).map((unit) => unit.id);
  return requiredIds.some((unitId) => {
    const live = findLiveUnitOrCargoCarrier(world, unitId);
    const unit = live?.carrier ?? live?.unit;
    return Boolean(unit && portals.some((portal) => Math.hypot(unit.x - portal.x, unit.y - portal.y) <= Math.max(144, portal.radius + unit.radius + 64)));
  });
}

function hasUnmetPortalReachObjective(world: WorldState): boolean {
  if (hasSourcePortalReachVictoryRequirements(world)) {
    return false;
  }
  const objectiveText = world.objectives.join(" ").toLowerCase();
  return objectiveText.includes("must reach") && objectiveText.includes("portal") && !isPortalReachObjectiveMet(world);
}

function hasSourcePortalReachVictoryRequirements(world: WorldState): boolean {
  return world.rescuedCircleRequirements.length > 0
    || world.circleOfPowerRequirements.length > 0
    || world.victoryRequirementGroups.length > 0
    || world.victoryRequirements.length > 0;
}

function isLocationBuildObjectiveMet(world: WorldState): boolean {
  if (world.locationBuildRequirements.length > 0) {
    return world.locationBuildRequirements.some((requirement) => requirement.clauses.every((clause) => {
      const player = sourceRequirementPlayer(world, clause.player);
      return countLiveUnitTypeInTileRect(world, player, clause.unitTypeId, clause.minX, clause.minY, clause.maxX, clause.maxY) >= clause.minimum;
    }));
  }
  const objectiveText = world.objectives.join(" ").toLowerCase();
  if (!objectiveText.includes("tyr's bay") && !objectiveText.includes("tyrs bay")) {
    return false;
  }
  const fortressTypes = sourceDestructionTypeGroup(world, ["unit-fortress"], (definition) => (
    definition.mainFacility === true
    && sourceTownCenterTier(world, definition.id, new Set()) >= 3
    && raceTypeScore(world, definition, "orc") > 0
  ));
  const shipyardTypes = sourceDestructionTypeGroup(world, ["unit-orc-shipyard"], (definition) => (
    sourceBuildDefinitionProducesMatching(world, definition.id, isNavalCombatOrUtilityDefinition)
    && raceTypeScore(world, definition, "orc") > 0
  ));
  return countLiveUnitTypesInTileRect(world, world.visibilityPlayer, fortressTypes, 52, 15, 72, 40) > 0
    && TYRS_BAY_SHIPYARD_RECTS.some((rect) => countLiveUnitTypesInTileRect(world, world.visibilityPlayer, shipyardTypes, rect.minX, rect.minY, rect.maxX, rect.maxY) > 0);
}

function hasUnmetLocationBuildObjective(world: WorldState): boolean {
  if (world.locationBuildRequirements.length > 0) {
    return !isLocationBuildObjectiveMet(world);
  }
  const objectiveText = world.objectives.join(" ").toLowerCase();
  return (objectiveText.includes("tyr's bay") || objectiveText.includes("tyrs bay")) && !isLocationBuildObjectiveMet(world);
}

const TYRS_BAY_SHIPYARD_RECTS = [
  { minX: 48, minY: 20, maxX: 69, maxY: 42 },
  { minX: 69, minY: 31, maxX: 74, maxY: 39 },
  { minX: 73, minY: 13, maxX: 76, maxY: 34 },
  { minX: 51, minY: 16, maxX: 58, maxY: 20 },
  { minX: 55, minY: 12, maxX: 75, maxY: 16 }
];

function countLiveUnitTypeInTileRect(world: WorldState, playerId: number, typeId: string, minX: number, minY: number, maxX: number, maxY: number): number {
  return countLiveUnitTypesInTileRect(world, playerId, [typeId], minX, minY, maxX, maxY);
}

function countLiveUnitTypesInTileRect(world: WorldState, playerId: number, typeIds: string[], minX: number, minY: number, maxX: number, maxY: number): number {
  const typeSet = new Set(typeIds);
  return liveUnitsIncludingCargo(world).filter((unit) => {
    if (unit.player !== playerId || !typeSet.has(unit.typeId) || unit.hitPoints <= 0) {
      return false;
    }
    const tileX = Math.floor(unit.x / world.tileSize);
    const tileY = Math.floor(unit.y / world.tileSize);
    return tileX >= minX && tileX <= maxX && tileY >= minY && tileY <= maxY;
  }).length;
}

function hasFailedHeroSurvivalObjective(world: WorldState): boolean {
  return world.requiredSurvivalUnitIds.some((unitId) => !findLiveUnitOrCargoCarrier(world, unitId));
}

function findLiveUnitOrCargoCarrier(world: WorldState, unitId: string): { unit: WorldUnit; carrier: WorldUnit | null } | null {
  for (const unit of world.units) {
    if (unit.id === unitId && unit.hitPoints > 0) {
      return { unit, carrier: null };
    }
    const cargo = findLiveCargoUnit(unit, unitId);
    if (cargo && unit.hitPoints > 0) {
      return { unit: cargo, carrier: unit };
    }
  }
  return null;
}

function findLiveCargoUnit(unit: WorldUnit, unitId: string): WorldUnit | null {
  for (const cargoUnit of unit.cargo ?? []) {
    if (cargoUnit.id === unitId && cargoUnit.hitPoints > 0) {
      return cargoUnit;
    }
    const nested = findLiveCargoUnit(cargoUnit, unitId);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function isTargetedDestructionObjectiveMet(world: WorldState): boolean {
  const targetGroups = destructionTargetGroupsForObjectives(world);
  return targetGroups.length > 0 && targetGroups.every((group) => isDestructionTargetGroupCleared(world, group));
}

function hasUnmetTargetedDestructionObjective(world: WorldState): boolean {
  return destructionTargetGroupsForObjectives(world).some((group) => !isDestructionTargetGroupCleared(world, group));
}

function isDestructionTargetGroupCleared(world: WorldState, group: string[]): boolean {
  return !liveUnitsIncludingCargo(world).some((unit) => (
    arePlayersEnemies(world, world.visibilityPlayer, unit.player)
    && unit.hitPoints > 0
    && group.includes(unit.typeId)
  ));
}

function liveUnitsIncludingCargo(world: WorldState): WorldUnit[] {
  const units: WorldUnit[] = [];
  const collect = (unit: WorldUnit): void => {
    if (unit.hitPoints <= 0) {
      return;
    }
    units.push(unit);
    for (const cargoUnit of unit.cargo ?? []) {
      collect(cargoUnit);
    }
  };
  for (const unit of world.units) {
    collect(unit);
  }
  return units;
}

function destructionTargetGroupsForObjectives(world: WorldState): string[][] {
  if (hasSourceDestructionVictoryRequirements(world)) {
    return [];
  }
  const groups: string[][] = [];
  for (const objective of world.objectives) {
    const objectiveText = objective.toLowerCase();
    if (!objectiveText.includes("destroy") && !objectiveText.includes("raze") && !objectiveText.includes("quell") && !objectiveText.includes("eradicate") && !objectiveText.includes("slay") && !objectiveText.includes("slaughter")) {
      continue;
    }
    if (objectiveText.includes("dark portal") || objectiveText.includes("great portal")) {
      groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-dark-portal"], /dark portal|great portal/i));
    }
    if (objectiveText.includes("daemon")) {
      groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-daemon"], /daemon/i));
    }
    if (objectiveText.includes("deathwing")) {
      groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-fire-breeze"], /deathwing|fire breeze/i));
    }
    if (objectiveText.includes("lair") || objectiveText.includes("dragon roost")) {
      groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-dragon-roost"], /dragon roost|dragon/i, (definition) => definition.building === true));
    }
    if (objectiveText.includes("oil refiner") || objectiveText.includes("refineries")) {
      groups.push(sourceDestructionTypeGroup(world, ["unit-human-refinery", "unit-orc-refinery"], isOilRefineryDefinition));
    }
    if (objectiveText.includes("oil derrick")) {
      groups.push(sourceDestructionTypeGroup(world, ["unit-human-refinery", "unit-orc-refinery"], isOilRefineryDefinition));
    } else if (objectiveText.includes("oil platform")) {
      groups.push(sourceDestructionTypeGroup(world, ["unit-human-oil-platform", "unit-orc-oil-platform"], (definition) => isOilPlatformDefinition(definition, world.unitDefinitions)));
    }
    if (objectiveText.includes("navy") || objectiveText.includes("enemy ships")) {
      groups.push(sourceDestructionTypeGroup(world, ["unit-human-destroyer", "unit-orc-destroyer", "unit-battleship", "unit-ogre-juggernaught", "unit-human-submarine", "unit-orc-submarine", "unit-human-transport", "unit-orc-transport"], isNavalCombatOrUtilityDefinition));
    }
    if (objectiveText.includes("transport")) {
      groups.push(sourceDestructionTypeGroup(world, ["unit-human-transport", "unit-orc-transport"], (definition) => isNavalRoleDefinition(definition, "transport")));
    }
    if (objectiveText.includes("mystic sanctum")) {
      groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-runestone"], /runestone|mystic sanctum/i));
    }
    if (objectiveText.includes("mage tower")) {
      groups.push(sourceDestructionTypeGroup(world, ["unit-mage-tower"], (definition) => sourceBuildDefinitionProducesMatching(world, definition.id, isCasterDefinition)));
    }
    if (objectiveText.includes("death knight")) {
      groups.push(sourceDestructionTypeGroup(world, ["unit-death-knight"], (definition) => isCasterDefinition(definition) && definition.isUndead === true));
    }
    if (objectiveText.includes("temple")) {
      groups.push(sourceNamedObjectiveTypeGroup(world, ["unit-temple-of-the-damned"], /temple of the damned|temple/i, (definition) => definition.building === true));
    }
    if (objectiveText.includes("castle")) {
      groups.push(sourceDestructionTypeGroup(world, ["unit-castle"], (definition) => definition.mainFacility === true && sourceTownCenterTier(world, definition.id, new Set()) >= 3 && raceTypeScore(world, definition, "human") > 0));
    }
    if (objectiveText.includes("fortress") || objectiveText.includes("stronghold")) {
      groups.push(sourceDestructionTypeGroup(world, ["unit-fortress", "unit-stronghold"], (definition) => definition.mainFacility === true && sourceTownCenterTier(world, definition.id, new Set()) >= (objectiveText.includes("stronghold") ? 2 : 3) && raceTypeScore(world, definition, "orc") > 0));
    }
    if (objectiveText.includes("settlement") || objectiveText.includes("base") || objectiveText.includes("defenders")) {
      groups.push(sourceDestructionTypeGroup(world, ["unit-town-hall", "unit-keep", "unit-castle", "unit-great-hall", "unit-stronghold", "unit-fortress"], (definition) => definition.mainFacility === true));
    }
  }
  return groups;
}

function hasSourceDestructionVictoryRequirements(world: WorldState): boolean {
  return [...world.victoryRequirements, ...world.victoryRequirementGroups.flatMap((group) => group.clauses)].some((requirement) => (
    requirement.kind === "unit-destroyed"
    || requirement.kind === "player-defeated"
    || requirement.kind === "opponents-defeated"
  ));
}

function sourceDestructionTypeGroup(world: WorldState, fallbackTypes: string[], matchesDefinition: (definition: WargusUnit) => boolean): string[] {
  const sourceTypes = world.unitDefinitions
    .filter((definition) => matchesDefinition(definition) && isUnitTypeAllowed(world, definition.id))
    .map((definition) => definition.id);
  return sourceTypes.length > 0 ? [...new Set(sourceTypes)] : fallbackTypes;
}

function sourceNamedObjectiveTypeGroup(world: WorldState, fallbackTypes: string[], pattern: RegExp, matchesDefinition: (definition: WargusUnit) => boolean = () => true): string[] {
  const sourceTypes = world.unitDefinitions
    .filter((definition) => isUnitTypeAllowed(world, definition.id))
    .filter(matchesDefinition)
    .filter((definition) => pattern.test(sourceObjectiveDefinitionText(definition)))
    .map((definition) => definition.id);
  return sourceTypes.length > 0 ? [...new Set(sourceTypes)] : fallbackTypes;
}

function sourceObjectiveDefinitionText(definition: WargusUnit): string {
  return sourceUnitDefinitionText(definition);
}

function circleObjectiveUnitTypes(world: WorldState, objectiveText: string): string[] | null {
  const types: string[] = [];
  if (objectiveText.includes("alterac traitors")) {
    types.push(...sourceNamedObjectiveTypeGroup(world, ["unit-peasant", "unit-attack-peasant"], /peasant|minuteman|attack peasant/i, (definition) => definition.landUnit === true && definition.building !== true));
  }
  if (objectiveText.includes("elven archer")) {
    types.push(...sourceNamedObjectiveTypeGroup(world, ["unit-archer"], /archer/i, (definition) => definition.landUnit === true && definition.canAttack === true && raceTypeScore(world, definition, "human") > 0));
  }
  if (objectiveText.includes("lightbringer")) {
    types.push(...sourceNamedObjectiveTypeGroup(world, ["unit-man-of-light"], /uther|lightbringer|man of light/i));
  }
  if (objectiveText.includes("zuljin") || objectiveText.includes("zul'jin")) {
    types.push(...sourceNamedObjectiveTypeGroup(world, ["unit-sharp-axe"], /zul'?jin|sharp axe/i));
  }
  if (objectiveText.includes("cho'gall") || objectiveText.includes("chogall")) {
    types.push(...sourceNamedObjectiveTypeGroup(world, ["unit-double-head"], /cho'?gall|double head/i));
  }
  if (objectiveText.includes("rescue the mage")) {
    types.push(...sourceDestructionTypeGroup(world, ["unit-mage"], (definition) => isCasterDefinition(definition) && raceTypeScore(world, definition, "human") > 0));
  }
  if (objectiveText.includes("turalyon")) {
    types.push(...sourceNamedObjectiveTypeGroup(world, ["unit-knight-rider"], /turalyon|knight rider/i));
  }
  if (objectiveText.includes("danath")) {
    types.push(...sourceNamedObjectiveTypeGroup(world, ["unit-arthor-literios"], /danath|arthor literios/i));
  }
  if (objectiveText.includes("heroes")) {
    types.push(...sourceHeroCircleObjectiveTypes(world));
  }
  return types.length > 0 ? [...new Set(types)] : null;
}

function sourceHeroCircleObjectiveTypes(world: WorldState): string[] {
  const aliases = [
    "alleria",
    "arthor literios",
    "beast cry",
    "cho'gall",
    "chogall",
    "danath",
    "double head",
    "evil knight",
    "female hero",
    "fire breeze",
    "flying angel",
    "grom",
    "gul'dan",
    "guldan",
    "hellscream",
    "ice bringer",
    "khadgar",
    "knight rider",
    "kurdan",
    "kurdran",
    "lightbringer",
    "lothar",
    "man of light",
    "quick blade",
    "sharp axe",
    "sky'ree",
    "teron",
    "turalyon",
    "uther",
    "white mage",
    "wise man",
    "zul'jin",
    "zuljin"
  ];
  const sourceTypes = world.unitDefinitions
    .filter((definition) => definition.hero === true || sourceDefinitionNameMatches(definition, aliases))
    .filter((definition) => isUnitTypeAllowed(world, definition.id))
    .map((definition) => definition.id);
  return sourceTypes.length > 0 ? [...new Set(sourceTypes)] : [];
}

function sourceDefinitionNameMatches(definition: WargusUnit, aliases: string[]): boolean {
  const haystack = `${definition.id} ${definition.name}`.toLowerCase();
  return aliases.some((alias) => haystack.includes(alias));
}

function isCircleObjectiveUnit(unit: WorldUnit, requiredTypes: string[] | null = null): boolean {
  if (requiredTypes) {
    return requiredTypes.includes(unit.typeId);
  }
  if (unit.kind !== "land" || unit.speed <= 0 || unit.tileWidth > 1 || unit.tileHeight > 1) {
    return false;
  }
  if (isWorker(unit)) {
    return false;
  }
  return true;
}

function findBuildPlacement(world: WorldState, builder: WorldUnit, buildingDefinition: WargusUnit): { x: number; y: number } | null {
  const builderTileX = Math.floor(builder.x / world.tileSize);
  const builderTileY = Math.floor(builder.y / world.tileSize);
  for (let radius = 2; radius <= 14; radius += 1) {
    for (let y = builderTileY - radius; y <= builderTileY + radius; y += 1) {
      for (let x = builderTileX - radius; x <= builderTileX + radius; x += 1) {
        const onRing = x === builderTileX - radius || x === builderTileX + radius || y === builderTileY - radius || y === builderTileY + radius;
        if (!onRing || !canPlaceReachableBuilding(world, builder, buildingDefinition, x, y)) {
          continue;
        }
        return { x, y };
      }
    }
  }
  return null;
}

export function canStartBuildingPlacement(world: WorldState, builder: WorldUnit, buildingDefinition: WargusUnit): boolean {
  const player = world.players.find((candidate) => candidate.id === builder.player);
  return Boolean(
    player
    && isUsableBuilder(builder)
    && isUnitTypeAllowed(world, buildingDefinition.id, builder.player)
    && canSourceBuildType(world, builder, buildingDefinition.id)
    && hasBuildGatePrerequisites(world, player.id, buildingDefinition.id)
    && canCreateUnitWithinSourceLimits(world, builder.player, buildingDefinition)
    && canAfford(player.resources, buildingDefinition.costs)
  );
}

export function canStartBuildingPlacementByType(world: WorldState, builder: WorldUnit, buildingTypeId: string, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean {
  const buildingDefinition = unitDefinitions.find((unit) => unit.id === buildingTypeId);
  return Boolean(buildingDefinition && canStartBuildingPlacement(world, builder, buildingDefinition));
}

export function canStartSourceBuildPlacementByType(world: WorldState, builder: WorldUnit, buildingTypeId: string, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean {
  const buildingDefinition = unitDefinitions.find((unit) => unit.id === buildingTypeId);
  if (!buildingDefinition) {
    return false;
  }
  if (isOilPlatformDefinition(buildingDefinition, unitDefinitions)) {
    return canStartOilPlatformPlacement(world, builder, unitDefinitions);
  }
  return canStartBuildingPlacement(world, builder, buildingDefinition);
}

export function sourceBuildEligibilityDebug(world: WorldState, builder: WorldUnit, buildingTypeId: string, unitDefinitions: WargusUnit[] = world.unitDefinitions): Record<string, boolean> {
  const player = world.players.find((candidate) => candidate.id === builder.player);
  const buildingDefinition = unitDefinitions.find((unit) => unit.id === buildingTypeId);
  return {
    hasPlayer: Boolean(player),
    hasDefinition: Boolean(buildingDefinition),
    usableBuilder: isUsableBuilder(builder),
    unitAllowed: Boolean(buildingDefinition && isUnitTypeAllowed(world, buildingDefinition.id, builder.player)),
    sourceBuildType: Boolean(buildingDefinition && canSourceBuildType(world, builder, buildingDefinition.id)),
    buildGatePrerequisites: Boolean(player && buildingDefinition && hasBuildGatePrerequisites(world, player.id, buildingDefinition.id)),
    sourceLimits: Boolean(buildingDefinition && canCreateUnitWithinSourceLimits(world, builder.player, buildingDefinition)),
    affordable: Boolean(player && buildingDefinition && canAfford(player.resources, buildingDefinition.costs))
  };
}

export function canPlaceBuildingAtPoint(world: WorldState, builder: WorldUnit, buildingTypeId: string, x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean {
  const buildingDefinition = unitDefinitions.find((unit) => unit.id === buildingTypeId);
  if (!buildingDefinition || !canStartBuildingPlacement(world, builder, buildingDefinition)) {
    return false;
  }
  const width = Math.max(1, buildingDefinition.tileSize[0]);
  const height = Math.max(1, buildingDefinition.tileSize[1]);
  const tileX = Math.floor(x / world.tileSize - width / 2);
  const tileY = Math.floor(y / world.tileSize - height / 2);
  return canPlaceReachableBuilding(world, builder, buildingDefinition, tileX, tileY);
}

export function canUseSourceBuildCommands(world: WorldState, builder: WorldUnit): boolean {
  if (!isUsableSourceBuildActor(builder)) {
    return false;
  }
  const sourceBuildButtons = world.buttonDefinitions
    .filter((button) => button.action === "build")
    .filter((button) => sourceButtonAppliesTo(button, builder.typeId))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, builder.player));
  return sourceBuildButtons.length > 0 || isWorker(builder);
}

function findSelectedSourceBuilder(world: WorldState, unitIds: string[], playerId: number): WorldUnit | undefined {
  return unitIds
    .map((id) => findUnit(world, id))
    .find((unit): unit is WorldUnit => Boolean(unit
      && unit.player === playerId
      && canUseSourceBuildCommands(world, unit)));
}

export function canEnterPendingWorldCommand(world: WorldState, unitIds: string[], command: string, playerId = world.visibilityPlayer): boolean {
  return unitIds.some((id) => {
    const unit = findUnit(world, id);
    if (!unit || unit.player !== playerId || unit.construction) {
      return false;
    }
    if (command === "move") {
      return canReceiveMoveOrders(unit) || canSetRallyPoint(world, unit);
    }
    if (command === "attack-ground") {
      return canAttackGround(unit);
    }
    if (command === "repair") {
      return canRepairUnit(unit);
    }
    if (command === "harvest") {
      return canIssueHarvestCommand(unit) || canSetHarvestRallyPoint(world, unit);
    }
    if (command === "unload-transport") {
      return canIssueUnloadTransport(unit);
    }
    if (command === "build-oil-platform") {
      return canStartOilPlatformPlacement(world, unit);
    }
    if (command === "follow") {
      return canReceiveMoveOrders(unit);
    }
    if (command === "patrol") {
      return canReceiveMoveOrders(unit);
    }
    return canIssueHoldPosition(unit) || (command === "attack-move" && canSetRallyPoint(world, unit));
  });
}

export function executeDirectHudCommand(world: WorldState, unitIds: string[], command: string, playerId = world.visibilityPlayer, queue = false): boolean | null {
  const sourceHandled = issueSourceDirectHudCommand(world, unitIds, command, playerId, queue);
  if (sourceHandled !== null) {
    return sourceHandled;
  }
  if (command === "cancel-queue") {
    return issueSelectedUnits(world, unitIds, (unit) => issueCancelConstructionOrder(world, unit.id) || issueCancelProductionOrder(world, unit.id) || issueCancelResearchOrder(world, unit.id), { includeConstruction: true, playerId });
  }
  if (command === "stop") {
    return issueSelectedUnits(world, unitIds, (unit) => issueStopOrder(world, unit.id), { playerId });
  }
  if (command === "hold-position") {
    return issueSelectedUnits(world, unitIds, (unit) => queue ? issueQueueStandGroundOrder(world, unit.id) : issueHoldPositionOrder(world, unit.id), { playerId });
  }
  if (command === "detonate") {
    return issueSelectedUnits(world, unitIds, (unit) => issueDetonateOrder(world, unit.id), { playerId });
  }
  if (command === "explore") {
    return issueSelectedUnits(world, unitIds, (unit) => queue ? issueQueueExploreOrder(world, unit.id) : issueExploreOrder(world, unit.id), { playerId });
  }
  if (command === "harvest") {
    return issueSelectedUnits(world, unitIds, (unit) => issueAutoHarvestOrder(world, unit.id), { playerId });
  }
  if (command === "return-goods") {
    return issueSelectedUnits(world, unitIds, (unit) => issueReturnGoodsOrder(world, unit.id), { playerId });
  }
  if (command === "load-transport") {
    return issueSelectedUnits(world, unitIds, (unit) => issueLoadTransportOrder(world, unit.id), { playerId });
  }
  return null;
}

function issueSourceDirectHudCommand(world: WorldState, unitIds: string[], command: string, playerId = world.visibilityPlayer, queue = false): boolean | null {
  const action = sourceActionForDirectHudCommand(command);
  if (!action) {
    return null;
  }
  const unitsWithSourceAction = new Set(unitIds
    .map((id) => findUnit(world, id))
    .filter((unit): unit is WorldUnit => Boolean(unit && unit.player === playerId && !unit.construction))
    .filter((unit) => world.buttonDefinitions.some((button) => (
      button.action === action
      && sourceButtonAppliesTo(button, unit.typeId)
      && sourceButtonAllowedForSimulation(world, button, unit.player)
      && canIssueSourceActionButton(world, button, unit)
    )))
    .map((unit) => unit.id));
  if (unitsWithSourceAction.size === 0) {
    return null;
  }
  return issueSelectedUnits(
    world,
    unitIds,
    (unit) => unitsWithSourceAction.has(unit.id) && issueSourceInstantAction(world, unit, action, queue),
    { playerId }
  );
}

export function sourceActionForDirectHudCommand(command: string): string | null {
  if (command === "stop") {
    return "stop";
  }
  if (command === "hold-position") {
    return "stand-ground";
  }
  if (command === "explore") {
    return "explore";
  }
  if (command === "return-goods") {
    return "return-goods";
  }
  return null;
}

export function sourceHudCommandForAction(action: string): string | null {
  if (action === "move") return "move";
  if (action === "stop") return "stop";
  if (action === "stand-ground") return "hold-position";
  if (action === "attack") return "attack-move";
  if (action === "attack-ground") return "attack-ground";
  if (action === "patrol") return "patrol";
  if (action === "repair") return "repair";
  if (action === "explore") return "explore";
  if (action === "harvest") return "harvest";
  if (action === "return-goods") return "return-goods";
  if (action === "unload") return "unload-transport";
  return null;
}

export function issueSelectedUnits(world: WorldState, unitIds: string[], issue: (unit: WorldUnit) => boolean, options: { includeConstruction?: boolean; playerId?: number } = {}): boolean {
  const playerId = options.playerId ?? world.visibilityPlayer;
  let handled = false;
  for (const unitId of unitIds) {
    const unit = findUnit(world, unitId);
    if (unit?.player === playerId && (options.includeConstruction || !unit.construction) && issue(unit)) {
      handled = true;
    }
  }
  return handled;
}

const SOURCE_CANCEL_ACTIONS = new Set(["cancel-build", "cancel-train-unit", "cancel-upgrade", "cancel"]);

export function sourceCancelButtonForSelection(world: WorldState, selectedUnits: WorldUnit[]): WargusButton | null {
  const selectedIds = new Set(selectedUnits.map((unit) => unit.id));
  const action = selectedUnits.some((unit) => unit.construction)
    ? "cancel-build"
    : world.activeResearch.some((research) => selectedIds.has(research.buildingId))
      ? "cancel-upgrade"
      : selectedUnits.some((unit) => unit.productionQueue.length > 0)
        ? "cancel-train-unit"
        : "cancel";
  const playerId = selectedUnits[0]?.player ?? world.visibilityPlayer;
  return world.buttonDefinitions
    .filter((button) => button.action === action || button.action === "cancel")
    .filter((button) => selectedUnits.some((unit) => sourceButtonAppliesTo(button, unit.typeId, [action])))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, playerId))
    .sort((a, b) => (a.action === action ? 0 : 1) - (b.action === action ? 0 : 1) || compareSourceButtons(a, b))[0] ?? null;
}

export function sourceActionButtonsForHud(world: WorldState, readyUnits: WorldUnit[], playerId: number): WargusButton[] {
  const groupScope = sourceGroupButtonScopeForSelection(world, readyUnits, playerId);
  if (groupScope) {
    return world.buttonDefinitions
      .filter((button) => sourceHudCommandForAction(button.action) !== null)
      .filter((button) => sourceButtonAppliesTo(button, groupScope))
      .filter((button) => sourceButtonVisibleForHud(world, button, playerId))
      .filter((button) => readyUnits.every((unit) => sourceButtonHasExecutableContext(world, button, unit, [groupScope])))
      .sort(compareSourceButtons);
  }
  return world.buttonDefinitions
    .filter((button) => sourceHudCommandForAction(button.action) !== null)
    .filter((button) => readyUnits.some((unit) => sourceButtonAppliesTo(button, unit.typeId)))
    .filter((button) => sourceButtonVisibleForHud(world, button, playerId))
    .sort(compareSourceButtons);
}

export function sourceTrainButtonsForHud(world: WorldState, _selectedUnits: WorldUnit[], readyUnits: WorldUnit[], playerId: number): Array<WargusButton & { value: string }> {
  return world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "train-unit" && Boolean(button.value))
    .filter((button) => readyUnits.some((unit) => sourceButtonAppliesTo(button, unit.typeId)))
    .filter((button) => sourceButtonVisibleForHud(world, button, playerId))
    .sort(compareSourceButtons);
}

export function sourceUpgradeButtonsForHud(world: WorldState, _selectedUnits: WorldUnit[], readyUnits: WorldUnit[], playerId: number): Array<WargusButton & { value: string }> {
  return world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "upgrade-to" && Boolean(button.value))
    .filter((button) => readyUnits.some((unit) => sourceButtonAppliesTo(button, unit.typeId)))
    .filter((button) => sourceButtonVisibleForHud(world, button, playerId))
    .sort(compareSourceButtons);
}

export function sourceResearchButtonsForHud(world: WorldState, _selectedUnits: WorldUnit[], readyUnits: WorldUnit[], playerId: number): Array<WargusButton & { value: string }> {
  return world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "research" && Boolean(button.value))
    .filter((button) => readyUnits.some((unit) => sourceButtonAppliesTo(button, unit.typeId)))
    .filter((button) => sourceButtonVisibleForHud(world, button, playerId))
    .sort(compareSourceButtons);
}

export function sourceSpellButtonsForHud(world: WorldState, readyUnits: WorldUnit[], playerId: number): Array<WargusButton & { value: string }> {
  return world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "cast-spell" && Boolean(button.value))
    .filter((button) => readyUnits.some((unit) => sourceButtonAppliesTo(button, unit.typeId)))
    .filter((button) => sourceButtonVisibleForHud(world, button, playerId))
    .sort(compareSourceButtons);
}

export function sourceBuildPageButtonForHud(world: WorldState, selectedUnits: WorldUnit[], playerId: number, pageValue: "0" | "1" | "2"): WargusButton | null {
  return world.buttonDefinitions
    .filter((button) => button.action === "button" && button.value === pageValue)
    .filter((button) => selectedUnits.some((unit) => sourceButtonAppliesTo(button, unit.typeId)))
    .filter((button) => sourceButtonVisibleForHud(world, button, playerId))
    .sort(compareSourceButtons)[0] ?? null;
}

export function sourceRootBuildButtonsForHud(world: WorldState, selectedUnits: WorldUnit[], playerId: number): Array<WargusButton & { value: string }> {
  return world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "build" && Boolean(button.value) && sourceBuildButtonMatchesPage(world, button, playerId, 0))
    .filter((button) => selectedUnits.some((unit) => sourceButtonAppliesTo(button, unit.typeId)))
    .filter((button) => sourceButtonVisibleForHud(world, button, playerId))
    .sort(compareSourceButtons);
}

export function sourceBuildButtonsForHud(world: WorldState, selectedUnits: WorldUnit[], page: 1 | 2, playerId: number): Array<WargusButton & { value: string }> {
  return world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "build" && Boolean(button.value) && button.level === page)
    .filter((button) => selectedUnits.some((unit) => sourceButtonAppliesTo(button, unit.typeId)))
    .filter((button) => sourceButtonVisibleForHud(world, button, playerId))
    .sort(compareSourceButtons);
}

export function sourceButtonVisibleForHud(world: WorldState, button: WargusButton, playerId: number): boolean {
  if (!sourceButtonAllowedForSimulation(world, button, playerId)) {
    return false;
  }
  if ((button.action === "build" || button.action === "train-unit" || button.action === "upgrade-to") && button.value) {
    return isUnitTypeAllowed(world, button.value, playerId);
  }
  if (button.action === "research" && button.value) {
    return isResearchUpgradeAllowed(world, button.value, playerId);
  }
  return true;
}

export function sourceButtonForHudCommand(world: WorldState, commandId: string, playerId: number, selectedUnits: WorldUnit[], readyUnits: WorldUnit[], typeIds: Iterable<string>): WargusButton | null {
  if (commandId === "cancel-queue") {
    return sourceCancelButtonForSelection(world, selectedUnits);
  }
  const source = sourceActionForHudCommand(world, commandId, playerId, typeIds, selectedUnits);
  if (!source) {
    return null;
  }
  const executableAction = sourceHudCommandForAction(source.action) !== null;
  return world.buttonDefinitions
    .filter((button) => button.action === source.action)
    .filter((button) => !source.value || button.value === source.value)
    .filter((button) => readyUnits.some((unit) => sourceButtonAppliesTo(button, unit.typeId)))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, playerId))
    .filter((button) => button.alwaysShow || !executableAction || readyUnits.some((unit) => canIssueSourceActionButton(world, button, unit)))
    .sort(compareSourceButtons)[0] ?? null;
}

export function issueSourceCancelByKey(world: WorldState, code: string, unitIds: string[], playerId = world.visibilityPlayer): boolean | null {
  const key = keyNameFromCode(code);
  if (!key) {
    return null;
  }
  const selectedUnits = unitIds
    .map((id) => findUnit(world, id))
    .filter((unit): unit is WorldUnit => Boolean(unit && unit.player === playerId));
  const sourceButtons = world.buttonDefinitions
    .filter((button) => SOURCE_CANCEL_ACTIONS.has(button.action) && button.key?.toUpperCase() === key)
    .filter((button) => sourceButtonAllowedForSimulation(world, button, playerId))
    .sort(compareSourceButtons);
  for (const button of sourceButtons) {
    const cancellableUnitIds = new Set(selectedUnits
      .filter((unit) => sourceCancelButtonMatchesUnit(world, button, unit))
      .map((unit) => unit.id));
    if (cancellableUnitIds.size === 0) {
      continue;
    }
    return issueSelectedUnits(
      world,
      unitIds,
      (unit) => cancellableUnitIds.has(unit.id) && issueSourceCancelAction(world, unit, button.action),
      { includeConstruction: true, playerId }
    );
  }
  return sourceButtons.length > 0 ? false : null;
}

function sourceCancelButtonMatchesUnit(world: WorldState, button: WargusButton, unit: WorldUnit): boolean {
  const expectedAction = sourceCancelActionForUnit(world, unit);
  if (!expectedAction) {
    return false;
  }
  if (button.action !== "cancel" && button.action !== expectedAction) {
    return false;
  }
  return sourceButtonAppliesTo(button, unit.typeId, [expectedAction]);
}

function sourceCancelActionForUnit(world: WorldState, unit: WorldUnit): string | null {
  if (unit.construction) {
    return "cancel-build";
  }
  if (unit.productionQueue.length > 0) {
    return "cancel-train-unit";
  }
  if (world.activeResearch.some((research) => research.buildingId === unit.id)) {
    return "cancel-upgrade";
  }
  return null;
}

function issueSourceCancelAction(world: WorldState, unit: WorldUnit, action: string): boolean {
  if (action === "cancel-build") {
    return issueCancelConstructionOrder(world, unit.id);
  }
  if (action === "cancel-train-unit") {
    return issueCancelProductionOrder(world, unit.id);
  }
  if (action === "cancel-upgrade") {
    return issueCancelResearchOrder(world, unit.id);
  }
  if (action === "cancel") {
    return issueCancelConstructionOrder(world, unit.id) || issueCancelProductionOrder(world, unit.id) || issueCancelResearchOrder(world, unit.id);
  }
  return false;
}

function issueSourceInstantAction(world: WorldState, unit: WorldUnit, action: string, queue = false): boolean {
  if (action === "stop") {
    if (canIssueStop(unit)) {
      return issueStopOrder(world, unit.id);
    }
    if (canSetRallyPoint(world, unit)) {
      unit.rallyPoint = null;
      return true;
    }
    return false;
  }
  if (action === "stand-ground") {
    return canIssueHoldPosition(unit) && (queue ? issueQueueStandGroundOrder(world, unit.id) : issueHoldPositionOrder(world, unit.id));
  }
  if (action === "explore") {
    return canIssueExploreOrder(world, unit) && (queue ? issueQueueExploreOrder(world, unit.id) : issueExploreOrder(world, unit.id));
  }
  if (action === "return-goods") {
    return canIssueReturnGoodsOrder(world, unit) && issueReturnGoodsOrder(world, unit.id);
  }
  return false;
}

export function issueSourceInstantSpellByKey(world: WorldState, unit: WorldUnit, code: string): boolean | null {
  const key = keyNameFromCode(code);
  if (!key) {
    return null;
  }
  const sourceButton = world.buttonDefinitions
    .filter((button) => button.action === "cast-spell" && button.key?.toUpperCase() === key && sourceButtonAppliesTo(button, unit.typeId))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, unit.player))
    .filter((button) => sourceButtonVisibleForHud(world, button, unit.player))
    .filter((button) => button.value && sourceInstantSpellCommandForSpellId(world, button.value) === "detonate")
    .sort(compareSourceButtons)[0];
  if (!sourceButton?.value) {
    return null;
  }
  return unit.canCastSpells.includes(sourceButton.value) ? issueDetonateOrder(world, unit.id) : false;
}

export function issueSourceInstantActionByKey(world: WorldState, unit: WorldUnit, code: string, queue = false): boolean | null {
  const key = keyNameFromCode(code);
  if (!key) {
    return null;
  }
  const sourceButton = world.buttonDefinitions
    .filter((button) => SOURCE_INSTANT_ACTIONS.has(button.action) && button.key?.toUpperCase() === key && sourceButtonAppliesTo(button, unit.typeId))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, unit.player))
    .filter((button) => sourceButtonVisibleForHud(world, button, unit.player))
    .sort(compareSourceButtons)[0];
  if (!sourceButton) {
    return null;
  }
  if (!canIssueSourceActionButton(world, sourceButton, unit)) {
    return false;
  }
  return issueSourceInstantAction(world, unit, sourceButton.action, queue);
}

const SOURCE_INSTANT_ACTIONS = new Set(["stop", "stand-ground", "explore", "return-goods"]);

export function issueFallbackTargetedSpellByKey(world: WorldState, unit: WorldUnit, code: string, queue = false): boolean | null {
  if (code === "KeyH") {
    if (canCastTargetedSpellCommand(world, unit, "cast-haste")) {
      return issueHasteOrder(world, unit.id);
    }
    if (canCastTargetedSpellCommand(world, unit, "cast-heal")) {
      return issueHealOrder(world, unit.id);
    }
    return queue ? issueQueueStandGroundOrder(world, unit.id) : issueHoldPositionOrder(world, unit.id);
  }
  if (code === "KeyE" && canCastTargetedSpellCommand(world, unit, "cast-exorcism")) {
    return issueExorcismOrder(world, unit.id);
  }
  if (code === "KeyV" && canCastTargetedSpellCommand(world, unit, "cast-holy-vision")) {
    return issueHolyVisionOrder(world, unit.id);
  }
  if (code === "KeyF" && canCastTargetedSpellCommand(world, unit, "cast-fireball")) {
    return issueFireballOrder(world, unit.id);
  }
  if (code === "KeyL" && canCastTargetedSpellCommand(world, unit, "cast-flame-shield")) {
    return issueFlameShieldOrder(world, unit.id);
  }
  if (code === "KeyB" && canCastTargetedSpellCommand(world, unit, "cast-blizzard")) {
    return issueBlizzardOrder(world, unit.id);
  }
  if (code === "KeyS" && canCastTargetedSpellCommand(world, unit, "cast-slow")) {
    return issueSlowOrder(world, unit.id);
  }
  if (code === "KeyI" && canCastTargetedSpellCommand(world, unit, "cast-invisibility")) {
    return issueInvisibilityOrder(world, unit.id);
  }
  if (code === "KeyD" && canCastTargetedSpellCommand(world, unit, "cast-death-coil")) {
    return issueDeathCoilOrder(world, unit.id);
  }
  if (code === "KeyW" && canCastTargetedSpellCommand(world, unit, "cast-death-and-decay")) {
    return issueDeathAndDecayOrder(world, unit.id);
  }
  if (code === "KeyR" && canCastTargetedSpellCommand(world, unit, "cast-whirlwind")) {
    return issueWhirlwindOrder(world, unit.id);
  }
  if (code === "KeyG" && canCastTargetedSpellCommand(world, unit, "cast-raise-dead")) {
    return issueRaiseDeadOrder(world, unit.id);
  }
  if (code === "KeyU" && canCastTargetedSpellCommand(world, unit, "cast-unholy-armor")) {
    return issueUnholyArmorOrder(world, unit.id);
  }
  if (code === "KeyB" && canCastTargetedSpellCommand(world, unit, "cast-bloodlust")) {
    return issueBloodlustOrder(world, unit.id);
  }
  if (code === "KeyR" && canCastTargetedSpellCommand(world, unit, "cast-runes")) {
    return issueRunesOrder(world, unit.id);
  }
  if (code === "KeyE" && canCastTargetedSpellCommand(world, unit, "cast-eye-of-kilrogg")) {
    return issueEyeOfKilroggOrder(world, unit.id);
  }
  return null;
}

export function issueFallbackUtilityCommandByKey(world: WorldState, unit: WorldUnit, code: string, unitDefinitions: WargusUnit[] = world.unitDefinitions, phase: "early" | "late" = "early", queue = false): boolean | null {
  if (phase === "early" && code === "KeyG" && canIssueReturnGoodsOrder(world, unit)) {
    return queue ? issueQueueReturnGoodsOrder(world, unit.id) : issueReturnGoodsOrder(world, unit.id);
  }
  if (phase === "early" && code === "KeyH" && canIssueAutoHarvestOrder(world, unit)) {
    return issueAutoHarvestOrder(world, unit.id);
  }
  if (phase === "early" && code === "KeyD" && canIssueDetonateOrder(world, unit)) {
    return issueDetonateOrder(world, unit.id);
  }
  if (phase === "early" && code === "KeyX" && canIssueExploreOrder(world, unit)) {
    return queue ? issueQueueExploreOrder(world, unit.id) : issueExploreOrder(world, unit.id);
  }
  if (phase === "late" && code === "KeyL" && canIssueLoadTransport(unit)) {
    return issueLoadTransportOrder(world, unit.id);
  }
  if (phase === "late" && code === "KeyU" && canIssueUnloadTransport(unit)) {
    return issueUnloadTransportOrder(world, unit.id);
  }
  if (phase === "late" && code === "KeyU" && !hasSourceBuildButtonsForUnit(world, unit) && canStartOilPlatformPlacement(world, unit, unitDefinitions)) {
    return issueBuildNearestOilPlatformOrder(world, unit.id, unitDefinitions);
  }
  return null;
}

export function issueFallbackTrainCommandByKey(world: WorldState, unit: WorldUnit, code: string, unitDefinitions: WargusUnit[] = world.unitDefinitions, phase: "early" | "mid" | "late" = "early"): boolean | null {
  const unitRace = world.players.find((player) => player.id === unit.player)?.race === "orc" ? "orc" : "human";
  if (phase === "early") {
    if (code === "KeyM" || code === (unitRace === "human" ? "KeyF" : "KeyG")) {
      const handled = issueTrainBarracksUnitByHotkeyRole(world, unit, "melee", unitRace, unitDefinitions);
      if (handled !== null) {
        return handled;
      }
    }
    if (code === "KeyR" || code === "KeyA") {
      const handled = issueTrainBarracksUnitByHotkeyRole(world, unit, "ranged", unitRace, unitDefinitions);
      if (handled !== null) {
        return handled;
      }
    }
    if (code === (unitRace === "human" ? "KeyR" : "KeyB")) {
      const handled = issueTrainBySourceRole(world, unit, (definition) => (
        isOrdinaryBarracksCombatDefinition(definition)
        && isRangedLandCombatDefinition(definition)
        && isSourceConversionTarget(world, definition.id)
      ), unitDefinitions);
      if (handled !== null) {
        return handled;
      }
    }
    if (code === (unitRace === "human" ? "KeyP" : "KeyO")) {
      const handled = issueTrainBySourceRole(world, unit, (definition) => (
        isAdvancedMeleeCombatDefinition(definition)
        && isSourceConversionTarget(world, definition.id)
      ), unitDefinitions);
      if (handled !== null) {
        return handled;
      }
    }
    if (code === "KeyN") {
      return issueTrainAdvancedUnitOrder(world, unit.id, unitDefinitions);
    }
    if (code === "KeyY" || code === "KeyO") {
      const handled = issueTrainNavalUnitByHotkeyRole(world, unit, "tanker", unitRace, unitDefinitions);
      if (handled !== null) {
        return handled;
      }
    }
    if (code === "KeyD") {
      const handled = issueTrainNavalUnitByHotkeyRole(world, unit, "destroyer", unitRace, unitDefinitions);
      if (handled !== null) {
        return handled;
      }
    }
    return null;
  }
  if (phase === "mid") {
    if (code === "KeyJ" || code === (unitRace === "human" ? "KeyB" : "KeyJ")) {
      const handled = issueTrainNavalUnitByHotkeyRole(world, unit, "warship", unitRace, unitDefinitions);
      if (handled !== null) {
        return handled;
      }
    }
    if (code === "KeyS" || code === (unitRace === "human" ? "KeyS" : "KeyG")) {
      const handled = issueTrainNavalUnitByHotkeyRole(world, unit, "submarine", unitRace, unitDefinitions);
      if (handled !== null) {
        return handled;
      }
    }
    return null;
  }
  if (code === "KeyT") {
    const handled = issueTrainNavalUnitByHotkeyRole(world, unit, "transport", unitRace, unitDefinitions);
    if (handled !== null) {
      return handled;
    }
  }
  if (code === "KeyA") {
    const handled = issueTrainBySourceRole(world, unit, isCasterDefinition, unitDefinitions);
    if (handled !== null) {
      return handled;
    }
    const fallbackTypeId = unitRace === "human" ? "unit-mage" : "unit-death-knight";
    if (canTrainUnitAt(world, unit.id, fallbackTypeId, unitDefinitions)) {
      return issueTrainCasterOrder(world, unit.id, unitDefinitions);
    }
  }
  if (code === "KeyI") {
    const handled = issueTrainBySourceRole(world, unit, isAirCombatDefinition, unitDefinitions);
    if (handled !== null) {
      return handled;
    }
    const fallbackTypeId = unitRace === "human" ? "unit-gryphon-rider" : "unit-dragon";
    if (canTrainUnitAt(world, unit.id, fallbackTypeId, unitDefinitions)) {
      return issueTrainAirUnitOrder(world, unit.id, unitDefinitions);
    }
  }
  if (code === "KeyE") {
    const handled = issueTrainBySourceRole(world, unit, isDemolitionUnitDefinition, unitDefinitions);
    if (handled !== null) {
      return handled;
    }
    const fallbackTypeId = unitRace === "human" ? "unit-dwarves" : "unit-goblin-sappers";
    if (canTrainUnitAt(world, unit.id, fallbackTypeId, unitDefinitions)) {
      return issueTrainDemolitionOrder(world, unit.id, unitDefinitions);
    }
  }
  if (code === "KeyZ") {
    const handled = issueTrainBySourceRole(world, unit, isScoutAirDefinition, unitDefinitions);
    if (handled !== null) {
      return handled;
    }
    const fallbackTypeId = unitRace === "human" ? "unit-balloon" : "unit-zeppelin";
    if (canTrainUnitAt(world, unit.id, fallbackTypeId, unitDefinitions)) {
      return issueTrainScoutAirOrder(world, unit.id, unitDefinitions);
    }
  }
  if (code === "KeyQ") {
    const handled = issueTrainBySourceRole(world, unit, isSiegeDefinition, unitDefinitions);
    if (handled !== null) {
      return handled;
    }
    const fallbackTypeId = unitRace === "human" ? "unit-ballista" : "unit-catapult";
    if (canTrainUnitAt(world, unit.id, fallbackTypeId, unitDefinitions)) {
      return issueTrainSiegeUnitOrder(world, unit.id, unitDefinitions);
    }
  }
  return null;
}

function issueTrainBarracksUnitByHotkeyRole(world: WorldState, unit: WorldUnit, role: "melee" | "ranged", race: "human" | "orc", unitDefinitions: WargusUnit[]): boolean | null {
  const matchesRole = (definition: WargusUnit) => (
    isOrdinaryBarracksCombatDefinition(definition)
    && (role === "ranged" ? isRangedLandCombatDefinition(definition) : isMeleeLandCombatDefinition(definition))
    && !isSourceConversionTarget(world, definition.id)
  );
  const handled = issueTrainBySourceRole(world, unit, matchesRole, unitDefinitions);
  if (handled !== null) {
    return handled;
  }
  const fallbackTypeId = role === "ranged"
    ? race === "human" ? "unit-archer" : "unit-axethrower"
    : race === "human" ? "unit-footman" : "unit-grunt";
  return canTrainUnitAt(world, unit.id, fallbackTypeId, unitDefinitions)
    ? issueTrainBarracksUnitOrder(world, unit.id, role, unitDefinitions)
    : null;
}

function issueTrainNavalUnitByHotkeyRole(world: WorldState, unit: WorldUnit, role: "tanker" | "destroyer" | "warship" | "transport" | "submarine", race: "human" | "orc", unitDefinitions: WargusUnit[]): boolean | null {
  const handled = issueTrainBySourceRole(world, unit, (definition) => isNavalRoleDefinition(definition, role), unitDefinitions);
  if (handled !== null) {
    return handled;
  }
  const fallbackTypeId = navalUnitForRole(role, race);
  return canTrainUnitAt(world, unit.id, fallbackTypeId, unitDefinitions)
    ? issueTrainNavalUnitOrder(world, unit.id, role, unitDefinitions)
    : null;
}

export function issueFallbackResearchCommandByKey(world: WorldState, unit: WorldUnit, code: string, upgrades: WargusUpgrade[] = world.upgradeDefinitions, queue = false): boolean | null {
  const unitRace = world.players.find((player) => player.id === unit.player)?.race === "orc" ? "orc" : "human";
  const unitId = unit.id;
  if (code === "KeyC") {
    const fallbackSequence = unitRace === "human" ? ["upgrade-human-ship-cannon1", "upgrade-human-ship-cannon2"] : ["upgrade-orc-ship-cannon1", "upgrade-orc-ship-cannon2"];
    const upgradeId = nextResearchUpgradeByRoleWithFallbacks(world, unit, (candidate) => isShipCannonResearchUpgradeId(world, candidate), fallbackSequence, queue);
    if (upgradeId) {
      return issueResearchOrderByQueueMode(world, unit, upgradeId, upgrades, queue);
    }
  }
  if (code === "KeyA") {
    const fallbackSequence = unitRace === "human" ? ["upgrade-human-ship-armor1", "upgrade-human-ship-armor2"] : ["upgrade-orc-ship-armor1", "upgrade-orc-ship-armor2"];
    const upgradeId = nextResearchUpgradeByRoleWithFallbacks(world, unit, (candidate) => isShipArmorResearchUpgradeId(world, candidate), fallbackSequence, queue);
    if (upgradeId) {
      return issueResearchOrderByQueueMode(world, unit, upgradeId, upgrades, queue);
    }
  }
  if (code === "KeyP") {
    const polymorphUpgradeId = nextSpellResearchUpgrade(world, unit, "spell-polymorph", "upgrade-polymorph", ["upgrade-polymorph"], queue);
    if (polymorphUpgradeId) {
      return issueResearchOrderByQueueMode(world, unit, polymorphUpgradeId, upgrades, queue);
    }
    if (canCastTargetedSpellCommand(world, unit, "cast-polymorph")) {
      return issuePolymorphOrder(world, unitId);
    }
    const fallbackSequence = unitRace === "human" ? ["upgrade-paladin"] : ["upgrade-ogre-mage"];
    const upgradeId = nextResearchUpgradeByRoleWithFallbacks(world, unit, (candidate) => isHolyTransformationResearchUpgradeId(world, candidate), fallbackSequence, queue);
    if (upgradeId) {
      return issueResearchOrderByQueueMode(world, unit, upgradeId, upgrades, queue);
    }
  }
  if (code === "KeyH") {
    const fallbackSequence = unitRace === "human" ? ["upgrade-healing"] : ["upgrade-haste"];
    const upgradeId = nextResearchUpgradeByRoleWithFallbacks(world, unit, (candidate) => isHolySupportResearchUpgradeId(world, candidate), fallbackSequence, queue);
    if (upgradeId) {
      return issueResearchOrderByQueueMode(world, unit, upgradeId, upgrades, queue);
    }
  }
  const spellResearchHandled = issueFallbackSpellResearchCommandByKey(world, unit, code, upgrades, queue);
  if (spellResearchHandled !== null) {
    return spellResearchHandled;
  }
  if (code === "KeyZ") {
    const fallbackSequence = unitRace === "human" ? ["upgrade-sword1", "upgrade-sword2"] : ["upgrade-battle-axe1", "upgrade-battle-axe2"];
    const upgradeId = nextResearchUpgradeByRoleWithFallbacks(world, unit, (candidate) => isBlacksmithWeaponUpgradeId(world, candidate), fallbackSequence, queue);
    return upgradeId ? issueResearchOrderByQueueMode(world, unit, upgradeId, upgrades, queue) : false;
  }
  if (code === "KeyX") {
    const fallbackSequence = unitRace === "human" ? ["upgrade-human-shield1", "upgrade-human-shield2"] : ["upgrade-orc-shield1", "upgrade-orc-shield2"];
    const upgradeId = nextResearchUpgradeByRoleWithFallbacks(world, unit, (candidate) => isBlacksmithArmorUpgradeId(world, candidate), fallbackSequence, queue);
    return upgradeId ? issueResearchOrderByQueueMode(world, unit, upgradeId, upgrades, queue) : false;
  }
  if (code === "KeyQ") {
    const fallbackSequence = unitRace === "human" ? ["upgrade-ballista1", "upgrade-ballista2"] : ["upgrade-catapult1", "upgrade-catapult2"];
    const upgradeId = nextResearchUpgradeByRoleWithFallbacks(world, unit, (candidate) => isBlacksmithSiegeUpgradeId(world, candidate), fallbackSequence, queue);
    return upgradeId ? issueResearchOrderByQueueMode(world, unit, upgradeId, upgrades, queue) : false;
  }
  if (code === "KeyC") {
    const fallbackSequence = unitRace === "human"
      ? ["upgrade-arrow1", "upgrade-arrow2", "upgrade-ranger", "upgrade-longbow", "upgrade-ranger-scouting", "upgrade-ranger-marksmanship"]
      : ["upgrade-throwing-axe1", "upgrade-throwing-axe2", "upgrade-berserker", "upgrade-light-axes", "upgrade-berserker-scouting", "upgrade-berserker-regeneration"];
    const upgradeId = nextResearchUpgradeByRoleWithFallbacks(world, unit, (candidate) => isLumberMillUpgradeId(world, candidate), fallbackSequence, queue);
    return upgradeId ? issueResearchOrderByQueueMode(world, unit, upgradeId, upgrades, queue) : false;
  }
  return null;
}

export function issueFallbackBuildCommandByKey(world: WorldState, unit: WorldUnit, code: string, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean | null {
  const unitRace = world.players.find((player) => player.id === unit.player)?.race === "orc" ? "orc" : "human";
  if (code === "KeyH" && canUseSourceBuildCommands(world, unit)) {
    const hallId = unitRace === "human" ? "unit-town-hall" : "unit-great-hall";
    return issueBuildOrderBySourceRole(world, unit, (definition) => isBaseTownCenterDefinition(world, definition, unit.player), hallId, unitDefinitions);
  }
  if (code === "KeyF") {
    const farmId = unitRace === "human" ? "unit-farm" : "unit-pig-farm";
    return issueBuildOrderBySourceRole(world, unit, isSupplyProviderDefinition, farmId, unitDefinitions);
  }
  if (code === "KeyB") {
    const barracksId = unitRace === "human" ? "unit-human-barracks" : "unit-orc-barracks";
    return issueBuildOrderBySourceRole(world, unit, (definition) => sourceBuildingProducesMatching(world, definition.id, isOrdinaryBarracksCombatDefinition, unit.player), barracksId, unitDefinitions);
  }
  if (code === "KeyL") {
    const millId = unitRace === "human" ? "unit-elven-lumber-mill" : "unit-troll-lumber-mill";
    return issueBuildOrderBySourceRole(world, unit, (definition) => sourceBuildingResearchesMatching(world, definition.id, (upgradeId) => isLumberMillUpgradeId(world, upgradeId), unit.player), millId, unitDefinitions);
  }
  if (code === "KeyK") {
    const blacksmithId = unitRace === "human" ? "unit-human-blacksmith" : "unit-orc-blacksmith";
    return issueBuildOrderBySourceRole(world, unit, (definition) => sourceBuildingResearchesMatching(world, definition.id, (upgradeId) => isBlacksmithUpgradeId(world, upgradeId), unit.player), blacksmithId, unitDefinitions);
  }
  if (isSourceAdvancedMeleeBuildHotkey(unitRace, code)) {
    const advancedBuildingId = unitRace === "human" ? "unit-stables" : "unit-ogre-mound";
    return issueBuildOrderBySourceRole(world, unit, (definition) => sourceBuildingProducesMatching(world, definition.id, isAdvancedMeleeCombatDefinition, unit.player), advancedBuildingId, unitDefinitions);
  }
  if (code === "KeyG") {
    const towerId = unitRace === "human" ? "unit-human-watch-tower" : "unit-orc-watch-tower";
    return issueBuildOrderBySourceRole(world, unit, (definition) => sourceBuildingUpgradesToMatching(world, definition.id, isDefensiveBuildingDefinition, unit.player), towerId, unitDefinitions);
  }
  if (code === "KeyW") {
    const wallId = unitRace === "human" ? "unit-human-wall" : "unit-orc-wall";
    return issueBuildOrderBySourceRole(world, unit, isWallDefinition, wallId, unitDefinitions);
  }
  if (code === "KeyY") {
    const shipyardId = unitRace === "human" ? "unit-human-shipyard" : "unit-orc-shipyard";
    return issueBuildOrderBySourceRole(world, unit, (definition) => sourceBuildingProducesMatching(world, definition.id, isNavalCombatOrUtilityDefinition, unit.player), shipyardId, unitDefinitions);
  }
  if (isSourceCasterBuildHotkey(unitRace, code)) {
    const casterBuildingId = unitRace === "human" ? "unit-mage-tower" : "unit-temple-of-the-damned";
    return issueBuildOrderBySourceRole(world, unit, (definition) => sourceBuildingProducesMatching(world, definition.id, isCasterDefinition, unit.player), casterBuildingId, unitDefinitions);
  }
  if (isSourceHolyBuildHotkey(unitRace, code) && canUseSourceBuildCommands(world, unit)) {
    const holyBuildingId = unitRace === "human" ? "unit-church" : "unit-altar-of-storms";
    return issueBuildOrderBySourceRole(world, unit, (definition) => sourceBuildingResearchesMatching(world, definition.id, (upgradeId) => isHolyResearchUpgradeId(world, upgradeId), unit.player), holyBuildingId, unitDefinitions);
  }
  if (isSourceAirBuildHotkey(unitRace, code)) {
    const airBuildingId = unitRace === "human" ? "unit-gryphon-aviary" : "unit-dragon-roost";
    return issueBuildOrderBySourceRole(world, unit, (definition) => sourceBuildingProducesMatching(world, definition.id, isAirCombatDefinition, unit.player), airBuildingId, unitDefinitions);
  }
  if (isSourceDemolitionLabBuildHotkey(unitRace, code)) {
    const labId = unitRace === "human" ? "unit-inventor" : "unit-alchemist";
    return issueBuildOrderBySourceRole(world, unit, (definition) => sourceBuildingProducesMatching(world, definition.id, isDemolitionLabDefinition, unit.player), labId, unitDefinitions);
  }
  return null;
}

function isSourceAdvancedMeleeBuildHotkey(race: "human" | "orc", code: string): boolean {
  return (race === "human" && code === "KeyA") || (race === "orc" && code === "KeyO");
}

function isSourceCasterBuildHotkey(race: "human" | "orc", code: string): boolean {
  return (race === "human" && code === "KeyM") || (race === "orc" && code === "KeyT");
}

function isSourceHolyBuildHotkey(race: "human" | "orc", code: string): boolean {
  return (race === "human" && code === "KeyC") || (race === "orc" && code === "KeyL");
}

function isSourceAirBuildHotkey(race: "human" | "orc", code: string): boolean {
  return (race === "human" && code === "KeyG") || (race === "orc" && code === "KeyD");
}

function isSourceDemolitionLabBuildHotkey(race: "human" | "orc", code: string): boolean {
  return (race === "human" && code === "KeyI") || (race === "orc" && code === "KeyA");
}

function issueFallbackSpellResearchCommandByKey(world: WorldState, unit: WorldUnit, code: string, upgrades: WargusUpgrade[], queue = false): boolean | null {
  const spellResearchCommands: Array<{ code: string; spellId: string; fallbackUpgradeId: string; fallbackSequence: string[] }> = [
    { code: "KeyB", spellId: "spell-bloodlust", fallbackUpgradeId: "upgrade-bloodlust", fallbackSequence: ["upgrade-bloodlust"] },
    { code: "KeyE", spellId: "spell-exorcism", fallbackUpgradeId: "upgrade-exorcism", fallbackSequence: ["upgrade-exorcism"] },
    { code: "KeyV", spellId: "spell-holy-vision", fallbackUpgradeId: "upgrade-holy-vision", fallbackSequence: ["upgrade-holy-vision"] },
    { code: "KeyL", spellId: "spell-flame-shield", fallbackUpgradeId: "upgrade-flame-shield", fallbackSequence: ["upgrade-flame-shield"] },
    { code: "KeyB", spellId: "spell-blizzard", fallbackUpgradeId: "upgrade-blizzard", fallbackSequence: ["upgrade-blizzard"] },
    { code: "KeyS", spellId: "spell-slow", fallbackUpgradeId: "upgrade-slow", fallbackSequence: ["upgrade-slow"] },
    { code: "KeyI", spellId: "spell-invisibility", fallbackUpgradeId: "upgrade-invisibility", fallbackSequence: ["upgrade-invisibility"] },
    { code: "KeyD", spellId: "spell-death-coil", fallbackUpgradeId: "upgrade-death-coil", fallbackSequence: ["upgrade-death-coil"] },
    { code: "KeyW", spellId: "spell-death-and-decay", fallbackUpgradeId: "upgrade-death-and-decay", fallbackSequence: ["upgrade-death-and-decay"] },
    { code: "KeyR", spellId: "spell-whirlwind", fallbackUpgradeId: "upgrade-whirlwind", fallbackSequence: ["upgrade-whirlwind"] },
    { code: "KeyG", spellId: "spell-raise-dead", fallbackUpgradeId: "upgrade-raise-dead", fallbackSequence: ["upgrade-raise-dead"] },
    { code: "KeyU", spellId: "spell-unholy-armor", fallbackUpgradeId: "upgrade-unholy-armor", fallbackSequence: ["upgrade-unholy-armor"] },
    { code: "KeyR", spellId: "spell-runes", fallbackUpgradeId: "upgrade-runes", fallbackSequence: ["upgrade-runes"] },
    { code: "KeyE", spellId: "spell-eye-of-vision", fallbackUpgradeId: "upgrade-eye-of-kilrogg", fallbackSequence: ["upgrade-eye-of-kilrogg"] }
  ];
  const command = spellResearchCommands.find((candidate) => (
    candidate.code === code
    && nextSpellResearchUpgrade(world, unit, candidate.spellId, candidate.fallbackUpgradeId, candidate.fallbackSequence, queue)
  ));
  if (!command) {
    return null;
  }
  const upgradeId = nextSpellResearchUpgrade(world, unit, command.spellId, command.fallbackUpgradeId, command.fallbackSequence, queue);
  return upgradeId ? issueResearchOrderByQueueMode(world, unit, upgradeId, upgrades, queue) : false;
}

export function isShipCannonResearchUpgradeId(upgradeId: string): boolean;
export function isShipCannonResearchUpgradeId(world: WorldState, upgradeId: string): boolean;
export function isShipCannonResearchUpgradeId(worldOrUpgradeId: WorldState | string, maybeUpgradeId?: string): boolean {
  const { world, upgradeId } = upgradeClassifierArgs(worldOrUpgradeId, maybeUpgradeId);
  return Boolean(world && upgradeModifiesMatchingUnits(world, upgradeId, (stat) => stat === "PiercingDamage" || stat === "BasicDamage", isNavalAttackUpgradeTargetDefinition))
    || ((!world || !upgradeHasSourceTargetMetadata(world, upgradeId))
      && ["upgrade-human-ship-cannon1", "upgrade-human-ship-cannon2", "upgrade-orc-ship-cannon1", "upgrade-orc-ship-cannon2"].includes(upgradeId));
}

export function isShipArmorResearchUpgradeId(upgradeId: string): boolean;
export function isShipArmorResearchUpgradeId(world: WorldState, upgradeId: string): boolean;
export function isShipArmorResearchUpgradeId(worldOrUpgradeId: WorldState | string, maybeUpgradeId?: string): boolean {
  const { world, upgradeId } = upgradeClassifierArgs(worldOrUpgradeId, maybeUpgradeId);
  return Boolean(world && upgradeModifiesMatchingUnits(world, upgradeId, (stat) => stat === "Armor", isNavalAttackUpgradeTargetDefinition))
    || ((!world || !upgradeHasSourceTargetMetadata(world, upgradeId))
      && ["upgrade-human-ship-armor1", "upgrade-human-ship-armor2", "upgrade-orc-ship-armor1", "upgrade-orc-ship-armor2"].includes(upgradeId));
}

export function isHolySupportResearchUpgradeId(world: WorldState, upgradeId: string): boolean {
  return sourceHolySupportSpellDependencyResearch(world, upgradeId)
    || (!upgradeHasSourceTargetMetadata(world, upgradeId) && (upgradeId === "upgrade-healing" || upgradeId === "upgrade-haste"));
}

export function sourceHolySupportSpellDependencyResearch(world: WorldState, upgradeId: string): boolean {
  return world.spellDefinitions
    .filter((spell) => spell.dependUpgrade === upgradeId)
    .filter(sourceSpellIsHolySupportResearch)
    .some((spell) => world.unitDefinitions.some((definition) => isAdvancedMeleeCasterDefinition(definition) && (definition.canCastSpells ?? []).includes(spell.id)));
}

function sourceSpellIsHolySupportResearch(spell: WargusSpell): boolean {
  return sourceSpellRestoresHitPoints(spell) || sourceSpellAppliesHaste(spell);
}

function sourceSpellRestoresHitPoints(spell: WargusSpell): boolean {
  return spell.actionTypes.includes("adjust-vitals")
    && spell.adjustVitals.some((adjustment) => adjustment.variable === "hit-points" && adjustment.amount > 0);
}

function sourceSpellAppliesHaste(spell: WargusSpell): boolean {
  return spell.actionTypes.includes("adjust-variable")
    && spell.variableAdjustments.some((adjustment) => adjustment.variable === "Haste" && adjustment.amount > 0);
}

export function isSourceConversionTarget(world: WorldState, unitTypeId: string): boolean {
  return world.upgradeDefinitions.some((upgrade) => (upgrade.conversions ?? []).some((conversion) => conversion.toTypeId === unitTypeId));
}

export function issueSourceResearchByKey(world: WorldState, unit: WorldUnit, code: string, upgrades: WargusUpgrade[] = world.upgradeDefinitions, queue = false): boolean | null {
  const key = keyNameFromCode(code);
  if (!key) {
    return null;
  }
  const sourceButtons = world.buttonDefinitions
    .filter((button) => button.action === "research" && button.key?.toUpperCase() === key && sourceButtonAppliesTo(button, unit.typeId))
    .filter((button) => sourceButtonVisibleForHud(world, button, unit.player))
    .sort(compareSourceButtons);
  if (sourceButtons.length === 0) {
    return null;
  }
  const upgradeId = sourceButtons
    .map((button) => button.value)
    .find((value): value is string => Boolean(value && canIssueResearchAt(world, unit, value, upgrades, queue)));
  return upgradeId ? issueResearchOrderByQueueMode(world, unit, upgradeId, upgrades, queue) : false;
}

export function nextResearchUpgradeByRoleWithFallbacks(world: WorldState, unit: WorldUnit, matchesUpgradeId: (upgradeId: string) => boolean, fallbackSequence: string[], queue = false): string | null {
  const sourceUpgradeId = world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "research" && typeof button.value === "string")
    .filter((button) => sourceButtonAppliesTo(button, unit.typeId))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, unit.player))
    .filter((button) => matchesUpgradeId(button.value) && canIssueResearchAt(world, unit, button.value, world.upgradeDefinitions, queue))
    .sort(compareSourceButtons)[0]?.value;
  if (sourceUpgradeId) {
    return sourceUpgradeId;
  }
  return hasSourceResearchButtonsForUnit(world, unit) ? null : fallbackSequence.find((upgradeId) => canIssueResearchAt(world, unit, upgradeId, world.upgradeDefinitions, queue)) ?? null;
}

function canIssueResearchAt(world: WorldState, unit: WorldUnit, upgradeId: string, upgrades: WargusUpgrade[], queue: boolean): boolean {
  return queue
    ? canQueueResearchUpgradeAt(world, unit, upgradeId, upgrades)
    : canResearchUpgradeAt(world, unit.id, upgradeId, upgrades);
}

function issueResearchOrderByQueueMode(world: WorldState, unit: WorldUnit, upgradeId: string, upgrades: WargusUpgrade[], queue: boolean): boolean {
  return queue
    ? issueQueueResearchOrder(world, unit.id, upgradeId, upgrades)
    : issueResearchOrder(world, unit.id, upgradeId, upgrades);
}

function hasSourceResearchButtonsForUnit(world: WorldState, unit: WorldUnit): boolean {
  return world.buttonDefinitions.some((button) => (
    button.action === "research"
    && sourceButtonAppliesTo(button, unit.typeId)
    && sourceButtonAllowedForSimulation(world, button, unit.player)
  ));
}

export function nextSpellResearchUpgrade(world: WorldState, unit: WorldUnit, spellId: string, fallbackUpgradeId: string, fallbackSequence: string[], queue = false): string | null {
  return nextResearchUpgradeByRoleWithFallbacks(world, unit, (upgradeId) => spellResearchUpgradeMatches(world, upgradeId, spellId, fallbackUpgradeId), fallbackSequence, queue);
}

export function sourceBuildingResearchesSpell(world: WorldState, buildingTypeId: string, spellId: string, fallbackUpgradeId: string, playerId = world.visibilityPlayer): boolean {
  return sourceBuildDefinitionResearchesMatching(world, buildingTypeId, (upgradeId) => spellResearchUpgradeMatches(world, upgradeId, spellId, fallbackUpgradeId), playerId);
}

export function spellResearchUpgradeMatches(world: WorldState, upgradeId: string, spellId: string, fallbackUpgradeId: string): boolean {
  return upgradeId === fallbackUpgradeId || world.spellDefinitions.some((spell) => spell.id === spellId && spell.dependUpgrade === upgradeId);
}

export function issueSourceTrainByKey(world: WorldState, unit: WorldUnit, code: string, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean | null {
  const key = keyNameFromCode(code);
  if (!key) {
    return null;
  }
  const sourceButtons = world.buttonDefinitions
    .filter((button) => button.action === "train-unit" && button.key?.toUpperCase() === key && sourceButtonAppliesTo(button, unit.typeId))
    .filter((button) => sourceButtonVisibleForHud(world, button, unit.player))
    .filter((button) => sourceButtonAllowedForUnit(world, button, unit))
    .sort(compareSourceButtons);
  if (sourceButtons.length === 0) {
    return null;
  }
  const unitTypeId = sourceButtons
    .map((button) => button.value)
    .find((value): value is string => Boolean(value && canTrainUnitAt(world, unit.id, value, unitDefinitions)));
  return unitTypeId ? issueTrainUnitOrder(world, unit.id, unitTypeId, unitDefinitions) : false;
}

export function issueTrainBySourceRole(world: WorldState, unit: WorldUnit, matchesUnit: (definition: WargusUnit) => boolean, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean | null {
  const sourceCandidate = sourceTrainCandidatesForBuilding(world, unit)
    .filter((entry) => matchesUnit(entry.definition))
    .sort((left, right) => left.button.level - right.button.level || left.button.pos - right.button.pos || left.definition.id.localeCompare(right.definition.id))[0];
  if (sourceCandidate) {
    return issueTrainUnitOrder(world, unit.id, sourceCandidate.definition.id, unitDefinitions);
  }
  if (hasSourceTrainButtonsForUnit(world, unit)) {
    return false;
  }
  const unitTypeId = world.unitDefinitions
    .filter((definition) => matchesUnit(definition) && canTrainUnitAt(world, unit.id, definition.id, unitDefinitions))
    .map((definition) => definition.id)
    .sort((left, right) => left.localeCompare(right))[0] ?? null;
  return unitTypeId ? issueTrainUnitOrder(world, unit.id, unitTypeId, unitDefinitions) : null;
}

export function issueFallbackFacilityCommandByKey(world: WorldState, unit: WorldUnit, code: string, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean | null {
  if (code === "KeyT" && unit.mainFacility) {
    return issueTrainWorkerOrder(world, unit.id, unitDefinitions);
  }
  if (code === "KeyU" && unit.mainFacility) {
    return issueUpgradeTownCenterOrder(world, unit.id, unitDefinitions);
  }
  if (code === "KeyG") {
    const handled = issueUpgradeTowerOrder(world, unit.id, "guard", unitDefinitions);
    if (handled || isWatchTower(world, unit)) {
      return handled;
    }
  }
  if (code === "KeyO") {
    const handled = issueUpgradeTowerOrder(world, unit.id, "cannon", unitDefinitions);
    if (handled || isWatchTower(world, unit)) {
      return handled;
    }
  }
  return null;
}

export function issueSourceUpgradeByKey(world: WorldState, unit: WorldUnit, code: string, unitDefinitions: WargusUnit[] = world.unitDefinitions, queue = false): boolean | null {
  const key = keyNameFromCode(code);
  if (!key) {
    return null;
  }
  const sourceButtons = world.buttonDefinitions
    .filter((button) => button.action === "upgrade-to" && button.key?.toUpperCase() === key && sourceButtonAppliesTo(button, unit.typeId))
    .filter((button) => sourceButtonVisibleForHud(world, button, unit.player))
    .filter((button) => sourceButtonAllowedForUnit(world, button, unit))
    .sort(compareSourceButtons);
  if (sourceButtons.length === 0) {
    return null;
  }
  const unitTypeId = sourceButtons
    .map((button) => button.value)
    .find((value): value is string => Boolean(value && (queue ? canQueueUpgradeToAt(world, unit, value, unitDefinitions) : canTrainUnitAt(world, unit.id, value, unitDefinitions))));
  return unitTypeId
    ? queue ? issueQueueUpgradeToOrder(world, unit.id, unitTypeId, unitDefinitions) : issueTrainUnitOrder(world, unit.id, unitTypeId, unitDefinitions)
    : false;
}

export function issueSourceTrainHudCommand(world: WorldState, unitIds: string[], unitTypeId: string, unitDefinitions: WargusUnit[] = world.unitDefinitions, playerId = world.visibilityPlayer): boolean {
  for (const unitId of unitIds) {
    const unit = findUnit(world, unitId);
    const sourceButton = unit?.player === playerId ? sourceValueButtonForUnit(world, unit, "train-unit", unitTypeId) : null;
    if (unit && sourceButton && canTrainUnitAt(world, unit.id, unitTypeId, unitDefinitions)) {
      return issueTrainUnitOrder(world, unit.id, unitTypeId, unitDefinitions);
    }
  }
  return false;
}

export function issueSourceUpgradeHudCommand(world: WorldState, unitIds: string[], unitTypeId: string, unitDefinitions: WargusUnit[] = world.unitDefinitions, playerId = world.visibilityPlayer, queue = false): boolean {
  for (const unitId of unitIds) {
    const unit = findUnit(world, unitId);
    const sourceButton = unit?.player === playerId ? sourceValueButtonForUnit(world, unit, "upgrade-to", unitTypeId) : null;
    if (!unit || !sourceButton) {
      continue;
    }
    if (queue) {
      if (canQueueUpgradeToAt(world, unit, unitTypeId, unitDefinitions)) {
        return issueQueueUpgradeToOrder(world, unit.id, unitTypeId, unitDefinitions);
      }
      continue;
    }
    if (canTrainUnitAt(world, unit.id, unitTypeId, unitDefinitions)) {
      return issueTrainUnitOrder(world, unit.id, unitTypeId, unitDefinitions);
    }
  }
  return false;
}

function sourceValueButtonForUnit(world: WorldState, unit: WorldUnit, action: string, value: string): WargusButton | null {
  return world.buttonDefinitions
    .filter((button) => button.action === action && button.value === value && sourceButtonAppliesTo(button, unit.typeId))
    .filter((button) => sourceButtonVisibleForHud(world, button, unit.player))
    .filter((button) => sourceButtonAllowedForUnit(world, button, unit))
    .sort(compareSourceButtons)[0] ?? null;
}

export function issueSourceResearchHudCommand(world: WorldState, unitIds: string[], upgradeId: string, upgrades: WargusUpgrade[] = world.upgradeDefinitions, playerId = world.visibilityPlayer, queue = false): boolean {
  for (const unitId of unitIds) {
    const unit = findUnit(world, unitId);
    if (unit?.player !== playerId) {
      continue;
    }
    if (queue) {
      if (canQueueResearchUpgradeAt(world, unit, upgradeId, upgrades)) {
        return issueQueueResearchOrder(world, unit.id, upgradeId, upgrades);
      }
      continue;
    }
    if (canResearchUpgradeAt(world, unit.id, upgradeId)) {
      return issueResearchOrder(world, unit.id, upgradeId, upgrades);
    }
  }
  return false;
}

export function sourcePendingWorldCommandForKey(world: WorldState, code: string, unitIds: string[], playerId = world.visibilityPlayer): PendingWorldCommandName | null {
  const key = keyNameFromCode(code);
  if (!key) {
    return null;
  }
  const readyUnits = unitIds
    .map((id) => findUnit(world, id))
    .filter((unit): unit is WorldUnit => Boolean(unit && unit.player === playerId && unit.hitPoints > 0 && !unit.construction));
  for (const unit of readyUnits) {
    const sourceButton = world.buttonDefinitions
      .filter((button) => SOURCE_PENDING_ACTIONS.has(button.action) && button.key?.toUpperCase() === key && sourceButtonAppliesTo(button, unit.typeId))
      .filter((button) => sourceButtonAllowedForSimulation(world, button, unit.player))
      .filter((button) => sourceButtonVisibleForHud(world, button, unit.player))
      .filter((button) => canIssueSourceActionButton(world, button, unit))
      .sort(compareSourceButtons)[0];
    const command = sourceButton ? pendingCommandForSourceAction(sourceButton.action) : null;
    if (command) {
      return command;
    }
  }
  return null;
}

const SOURCE_PENDING_ACTIONS = new Set(["move", "attack", "attack-ground", "patrol", "repair", "harvest", "unload"]);

function pendingCommandForSourceAction(action: string): PendingWorldCommandName | null {
  if (action === "move") {
    return "move";
  }
  if (action === "attack") {
    return "attack-move";
  }
  if (action === "attack-ground") {
    return "attack-ground";
  }
  if (action === "patrol") {
    return "patrol";
  }
  if (action === "repair") {
    return "repair";
  }
  if (action === "harvest") {
    return "harvest";
  }
  if (action === "unload") {
    return "unload-transport";
  }
  return null;
}

export function sourceBuildPageForKey(world: WorldState, code: string, unitIds: string[], playerId = world.visibilityPlayer): 0 | 1 | 2 | null {
  const key = keyNameFromCode(code);
  const worker = findSelectedSourceBuilder(world, unitIds, playerId);
  if (!key || !worker) {
    return null;
  }
  const sourceButton = world.buttonDefinitions
    .filter((button) => button.action === "button" && button.key?.toUpperCase() === key && sourceButtonAppliesTo(button, worker.typeId))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, worker.player))
    .sort(compareSourceButtons)[0];
  if (sourceButton?.value === "0" || sourceButton?.value === "1" || sourceButton?.value === "2") {
    return Number(sourceButton.value) as 0 | 1 | 2;
  }
  return null;
}

export function canOpenWorkerBuildPage(world: WorldState, unitIds: string[], page: 1 | 2, playerId = world.visibilityPlayer): boolean {
  const worker = findSelectedSourceBuilder(world, unitIds, playerId);
  if (!worker) {
    return false;
  }
  if (page === 1) {
    return true;
  }
  return townCenterTierForPlayer(world, worker.player) >= 2 || hasCompletedWoodImprover(world, worker.player);
}

export function keyNameFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }
  if (code === "Escape") {
    return "ESC";
  }
  return null;
}

export function townCenterTierForPlayer(world: WorldState, playerId: number): number {
  return world.units
    .filter((unit) => unit.player === playerId && !unit.construction && unit.hitPoints > 0 && unit.mainFacility)
    .reduce((tier, unit) => Math.max(tier, townCenterTier(world, unit.typeId, playerId)), 0);
}

function canCreateUnitWithinSourceLimits(world: WorldState, playerId: number, definition: Pick<WargusUnit, "building">): boolean {
  const counts = sourceUnitLimitCounts(world, playerId);
  const createsBuilding = definition.building === true;
  const unitLimit = Math.max(0, Math.floor(world.engineSettings.globalUnitLimit || 0));
  const buildingLimit = Math.max(0, Math.floor(world.engineSettings.globalBuildingLimit || 0));
  const totalLimit = Math.max(0, Math.floor(world.engineSettings.globalTotalUnitLimit || 0));
  if (!createsBuilding && unitLimit > 0 && counts.units + 1 > unitLimit) {
    return false;
  }
  if (createsBuilding && buildingLimit > 0 && counts.buildings + 1 > buildingLimit) {
    return false;
  }
  if (totalLimit > 0 && counts.total + 1 > totalLimit) {
    return false;
  }
  return true;
}

function sourceUnitLimitCounts(world: WorldState, playerId: number): { units: number; buildings: number; total: number } {
  const counts = { units: 0, buildings: 0, total: 0 };
  const visit = (unit: WorldUnit): void => {
    if (unit.hitPoints <= 0 || unit.player !== playerId || isInvisibleUtilityUnit(unit)) {
      return;
    }
    counts.total += 1;
    if (isBuildingLike(unit)) {
      counts.buildings += 1;
    } else {
      counts.units += 1;
    }
    for (const cargoUnit of unit.cargo ?? []) {
      visit(cargoUnit);
    }
  };
  for (const unit of world.units) {
    visit(unit);
  }
  const definitionsById = new Map(world.unitDefinitions.map((definition) => [definition.id, definition]));
  for (const producer of world.units) {
    if (producer.hitPoints <= 0 || producer.player !== playerId || producer.construction) {
      continue;
    }
    for (const order of producer.productionQueue) {
      const definition = definitionsById.get(order.unitTypeId);
      if (!definition || isProducerTransformationFor(world, producer, order.unitTypeId)) {
        continue;
      }
      counts.total += 1;
      if (definition.building) {
        counts.buildings += 1;
      } else {
        counts.units += 1;
      }
    }
  }
  return counts;
}

function canSourceBuildType(world: WorldState, builder: WorldUnit, buildingTypeId: string): boolean {
  const sourceBuildButtons = world.buttonDefinitions
    .filter((button) => button.action === "build")
    .filter((button) => sourceButtonAppliesTo(button, builder.typeId))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, builder.player));
  if (sourceBuildButtons.length === 0) {
    return true;
  }
  return sourceBuildButtons.some((button) => (
    button.value === buildingTypeId
  ));
}

function canSourceUpgradeToType(world: WorldState, building: WorldUnit, upgradeTypeId: string): boolean {
  const sourceUpgradeButtons = world.buttonDefinitions
    .filter((button) => button.action === "upgrade-to")
    .filter((button) => sourceButtonAppliesTo(button, building.typeId))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, building.player));
  if (sourceUpgradeButtons.length === 0) {
    return true;
  }
  return sourceUpgradeButtons.some((button) => (
    button.value === upgradeTypeId
  ));
}

function sourceUpgradeTargetForBuilding(world: WorldState, building: WorldUnit, role?: "guard" | "cannon"): string | null {
  const buttons = sourceUpgradeButtonsForBuilding(world, building);
  const matchedButtons = role ? buttons.filter((button) => sourceUpgradeButtonMatchesRole(world, button, role)) : buttons;
  return matchedButtons.sort(compareSourceButtons)[0]?.value ?? null;
}

function sourceUpgradeButtonsForBuilding(world: WorldState, building: WorldUnit): Array<WargusButton & { value: string }> {
  return world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "upgrade-to" && Boolean(button.value))
    .filter((button) => sourceButtonAppliesTo(button, building.typeId))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, building.player));
}

function hasSourceUpgradeButtonsForBuilding(world: WorldState, building: WorldUnit): boolean {
  return world.buttonDefinitions.some((button) => (
    button.action === "upgrade-to"
    && sourceButtonAppliesTo(button, building.typeId)
    && sourceButtonAllowedForSimulation(world, button, building.player)
  ));
}

export function sourceUpgradeButtonMatchesRole(world: WorldState, button: WargusButton, role: "guard" | "cannon"): boolean {
  const target = typeof button.value === "string" ? world.unitDefinitions.find((definition) => definition.id === button.value) : undefined;
  if (target?.building && target.canAttack) {
    const cannonTarget = isCannonTowerUpgradeDefinition(target);
    return role === "cannon" ? cannonTarget : !cannonTarget;
  }
  return false;
}

function sourceTowerRoleForDefinition(world: WorldState, definition: WargusUnit): "guard" | "cannon" | null {
  const hasSourceUpgradeButton = world.buttonDefinitions
    .filter((button) => button.action === "upgrade-to" && button.value === definition.id)
    .some((button) => typeof button.value === "string");
  if (!hasSourceUpgradeButton || !definition.building || !definition.canAttack) {
    return null;
  }
  return isCannonTowerUpgradeDefinition(definition) ? "cannon" : "guard";
}

export function isCannonTowerUpgradeDefinition(definition: WargusUnit): boolean {
  return definition.building === true
    && definition.canAttack === true
    && definition.canTargetAir !== true
    && (definition.minAttackRange ?? 0) > 0
    && definition.basicDamage >= 40
    && definition.maxAttackRange >= 6;
}

export function canPlaceBuilding(world: WorldState, buildingDefinition: WargusUnit, tileX: number, tileY: number, ignoredUnitId?: string): boolean {
  const width = Math.max(1, buildingDefinition.tileSize[0]);
  const height = Math.max(1, buildingDefinition.tileSize[1]);
  if (tileX < 0 || tileY < 0 || tileX + width > world.map.width || tileY + height > world.map.height) {
    return false;
  }
  if (!satisfiesBuildingRules(world, buildingDefinition, tileX, tileY, width, height)) {
    return false;
  }
  if (buildingDefinition.shoreBuilding) {
    return canPlaceShoreBuilding(world, tileX, tileY, width, height, ignoredUnitId);
  }
  const replaceOnBuildIgnoredUnitIds = new Set(sourceReplaceOnBuildTargets(world, buildingDefinition, tileX, tileY).map((unit) => unit.id));
  const probe = createWorldUnit({ unit: buildingDefinition, id: "build-probe", player: 0, tileX, tileY });
  const movement = movementKindForUnit(probe);
  const passabilityIgnoredUnitId = ignoredUnitId ?? (replaceOnBuildIgnoredUnitIds.size === 1 ? [...replaceOnBuildIgnoredUnitIds][0] : probe.id);
  for (let y = tileY; y < tileY + height; y += 1) {
    for (let x = tileX; x < tileX + width; x += 1) {
      if (!isTilePassable(world, x, y, movement, passabilityIgnoredUnitId)) {
        return false;
      }
      if (!isSourceBuildableTerrainTile(world, world.tiles[y * world.map.width + x] ?? 0)) {
        return false;
      }
      if (isOccupiedByAnyLiveUnit(world, x, y, ignoredUnitId, replaceOnBuildIgnoredUnitIds)) {
        return false;
      }
    }
  }
  return true;
}

export function canPlaceReachableBuilding(world: WorldState, builder: WorldUnit, buildingDefinition: WargusUnit, tileX: number, tileY: number): boolean {
  if (!canPlaceBuilding(world, buildingDefinition, tileX, tileY)) {
    return false;
  }
  const replacedUnits = sourceReplaceOnBuildTargets(world, buildingDefinition, tileX, tileY);
  if (replacedUnits.length > 0) {
    const replacedUnitIds = new Set(replacedUnits.map((unit) => unit.id));
    world.units = world.units.filter((unit) => !replacedUnitIds.has(unit.id));
  }
  const building = createWorldUnit({
    unit: buildingDefinition,
    id: "build-reach-probe",
    player: builder.player,
    tileX,
    tileY,
    tileset: world.map.setup?.tileset ?? null
  });
  building.hitPoints = Math.max(1, Math.floor(building.maxHitPoints * 0.1));
  building.construction = { builderId: builder.id, remainingSeconds: 1, totalSeconds: 1 };
  world.units.push(building);
  const reachable = findPath(world, builder, building.x, building.y).length > 0 || isInTouchRange(builder, building);
  world.units = world.units.filter((unit) => unit.id !== building.id);
  if (replacedUnits.length > 0) {
    world.units.push(...replacedUnits);
  }
  return reachable;
}

function canPlaceShoreBuilding(world: WorldState, tileX: number, tileY: number, width: number, height: number, ignoredUnitId?: string): boolean {
  let hasWater = false;
  let hasLand = false;
  for (let y = tileY; y < tileY + height; y += 1) {
    for (let x = tileX; x < tileX + width; x += 1) {
      const tile = world.tiles[y * world.map.width + x] ?? 0;
      if (isSourceWaterTile(world, tile)) {
        hasWater = true;
      } else if (isTilePassable(world, x, y, "land")) {
        hasLand = true;
      } else {
        return false;
      }
      if (isOccupiedByAnyLiveUnit(world, x, y, ignoredUnitId)) {
        return false;
      }
    }
  }
  return hasWater && hasLand;
}

function satisfiesBuildingRules(world: WorldState, buildingDefinition: WargusUnit, tileX: number, tileY: number, width: number, height: number): boolean {
  for (const rule of buildingDefinition.buildingRules ?? []) {
    if (rule.kind === "distance" && !satisfiesDistanceRule(world, tileX, tileY, width, height, rule)) {
      return false;
    }
    if (rule.kind === "ontop" && !satisfiesOntopRule(world, tileX, tileY, width, height, rule)) {
      return false;
    }
  }
  return true;
}

function satisfiesOntopRule(
  world: WorldState,
  tileX: number,
  tileY: number,
  width: number,
  height: number,
  rule: { typeId: string }
): boolean {
  return world.units.some((unit) => (
    unit.hitPoints > 0
    && unit.typeId === rule.typeId
    && footprintTileGap(world, tileX, tileY, width, height, unit) === 0
  ));
}

function satisfiesDistanceRule(
  world: WorldState,
  tileX: number,
  tileY: number,
  width: number,
  height: number,
  rule: { typeId: string; distance: number; distanceType: string }
): boolean {
  const minDistance = Math.max(0, Math.floor(rule.distance));
  for (const unit of world.units) {
    if (unit.hitPoints <= 0 || unit.typeId !== rule.typeId) {
      continue;
    }
    const gap = footprintTileGap(world, tileX, tileY, width, height, unit);
    if (rule.distanceType === ">" && gap <= minDistance) {
      return false;
    }
    if (rule.distanceType === "<" && gap < minDistance) {
      return true;
    }
    if (rule.distanceType === "=" && gap === minDistance) {
      return true;
    }
  }
  if (rule.distanceType === "<" || rule.distanceType === "=") {
    return false;
  }
  return true;
}

function footprintTileGap(world: WorldState, tileX: number, tileY: number, width: number, height: number, unit: WorldUnit): number {
  const unitTile = worldToTile(world, unit.x, unit.y);
  const left = unitTile.x - Math.floor(unit.tileWidth / 2);
  const top = unitTile.y - Math.floor(unit.tileHeight / 2);
  const right = left + unit.tileWidth - 1;
  const bottom = top + unit.tileHeight - 1;
  const horizontalGap = Math.max(left - (tileX + width - 1), tileX - right, 0);
  const verticalGap = Math.max(top - (tileY + height - 1), tileY - bottom, 0);
  return Math.max(horizontalGap, verticalGap);
}

function footprintContainsTile(world: WorldState, unit: WorldUnit, tileX: number, tileY: number): boolean {
  const unitTile = worldToTile(world, unit.x, unit.y);
  const left = unitTile.x - Math.floor(unit.tileWidth / 2);
  const top = unitTile.y - Math.floor(unit.tileHeight / 2);
  return tileX >= left && tileX < left + unit.tileWidth && tileY >= top && tileY < top + unit.tileHeight;
}

function isOccupiedByAnyLiveUnit(world: WorldState, tileX: number, tileY: number, ignoredUnitId?: string, ignoredUnitIds: Set<string> = new Set()): boolean {
  return world.units.some((unit) => unit.id !== ignoredUnitId && !ignoredUnitIds.has(unit.id) && unit.hitPoints > 0 && footprintContainsTile(world, unit, tileX, tileY));
}

function isFootprintOpenForUnitSpawn(world: WorldState, tileX: number, tileY: number, unit: WorldUnit, movingUnitId?: string): boolean {
  const movement = movementKindForUnit(unit);
  for (let y = tileY; y < tileY + unit.tileHeight; y += 1) {
    for (let x = tileX; x < tileX + unit.tileWidth; x += 1) {
      if (!isTilePassable(world, x, y, movement, movingUnitId) || isOccupiedByAnyLiveUnit(world, x, y)) {
        return false;
      }
    }
  }
  return true;
}

function findSpawnTile(world: WorldState, producer: WorldUnit, unitDefinition: WargusUnit): { x: number; y: number } | null {
  const producerLeft = Math.floor((producer.x - producer.radius) / world.tileSize);
  const producerRight = Math.ceil((producer.x + producer.radius) / world.tileSize);
  const producerTop = Math.floor((producer.y - producer.radius) / world.tileSize);
  const producerBottom = Math.ceil((producer.y + producer.radius) / world.tileSize);
  const probe = createWorldUnit({ unit: unitDefinition, id: "spawn-probe", player: producer.player, tileX: 0, tileY: 0 });

  for (let radius = 1; radius <= 8; radius += 1) {
    const candidates: Array<{ x: number; y: number }> = [];
    for (let y = producerTop - radius; y <= producerBottom + radius; y += 1) {
      for (let x = producerLeft - radius; x <= producerRight + radius; x += 1) {
        const onRing = x === producerLeft - radius || x === producerRight + radius || y === producerTop - radius || y === producerBottom + radius;
        if (!onRing || x < 0 || y < 0 || x >= world.map.width || y >= world.map.height) {
          continue;
        }
        if (isFootprintOpenForUnitSpawn(world, x, y, probe, probe.id)) {
          candidates.push({ x, y });
        }
      }
    }
    const spawn = pickSpawnTileForProducerRally(world, producer, candidates);
    if (spawn) {
      return spawn;
    }
  }
  return null;
}

function pickSpawnTileForProducerRally(world: WorldState, producer: WorldUnit, candidates: Array<{ x: number; y: number }>): { x: number; y: number } | null {
  if (candidates.length === 0) {
    return null;
  }
  const target = producer.rallyPoint ?? producer;
  return [...candidates].sort((a, b) => (
    distanceSquared(tileToWorldCenter(world, a.x, a.y), target)
    - distanceSquared(tileToWorldCenter(world, b.x, b.y), target)
  ))[0] ?? null;
}

function isTownCenter(unit: WorldUnit): boolean {
  return unit.mainFacility;
}

function canAiUpgradeTownCenter(world: WorldState, hall: WorldUnit): boolean {
  return hall.hitPoints > 0
    && !hall.construction
    && hall.productionQueue.length === 0
    && Boolean(sourceUpgradeTargetForBuilding(world, hall) ?? (hasSourceUpgradeButtonsForBuilding(world, hall) ? null : nextTownCenterTypeId(hall.typeId)));
}

function nextTownCenterTypeId(typeId: string): string | null {
  if (typeId === "unit-town-hall") {
    return "unit-keep";
  }
  if (typeId === "unit-keep") {
    return "unit-castle";
  }
  if (typeId === "unit-great-hall") {
    return "unit-stronghold";
  }
  if (typeId === "unit-stronghold") {
    return "unit-fortress";
  }
  return null;
}

function isTownCenterUpgradeFor(world: WorldState, unit: WorldUnit, upgradeTypeId: string): boolean {
  return !hasSourceUpgradeButtonsForBuilding(world, unit) && nextTownCenterTypeId(unit.typeId) === upgradeTypeId;
}

function isWatchTower(world: WorldState, unit: WorldUnit): boolean {
  const sourceUpgradeButtons = sourceUpgradeButtonsForBuilding(world, unit);
  return sourceUpgradeButtons.some((button) => {
    const target = world.unitDefinitions.find((definition) => definition.id === button.value);
    return Boolean(target?.building && target.canAttack);
  });
}

function isSourceUpgradeFor(world: WorldState, unit: WorldUnit, upgradeTypeId: string): boolean {
  return world.buttonDefinitions.some((button) => (
    button.action === "upgrade-to"
    && button.value === upgradeTypeId
    && sourceButtonAppliesTo(button, unit.typeId)
    && sourceButtonAllowedForSimulation(world, button, unit.player)
  ));
}

function hasTownCenterTier(world: WorldState, playerId: number, tier: 1 | 2 | 3): boolean {
  return world.units.some((unit) => (
    unit.player === playerId
    && !unit.construction
    && unit.hitPoints > 0
    && townCenterTier(world, unit.typeId, playerId) >= tier
  ));
}

export function townCenterTier(world: WorldState, typeId: string, playerId = world.visibilityPlayer): number {
  const sourceTier = sourceTownCenterTier(world, typeId, new Set(), playerId);
  if (sourceTier > 0) {
    return sourceTier;
  }
  if (typeId === "unit-castle" || typeId === "unit-fortress") {
    return 3;
  }
  if (typeId === "unit-keep" || typeId === "unit-stronghold") {
    return 2;
  }
  if (typeId === "unit-town-hall" || typeId === "unit-great-hall") {
    return 1;
  }
  return 0;
}

export function sourceTownCenterTier(world: WorldState, typeId: string, seen: Set<string>, playerId = world.visibilityPlayer): number {
  if (seen.has(typeId)) {
    return 0;
  }
  const definition = world.unitDefinitions.find((unit) => unit.id === typeId);
  if (!definition?.mainFacility) {
    return 0;
  }
  const previousTypes = world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "upgrade-to" && button.value === typeId)
    .filter((button) => sourceButtonAllowedForSimulation(world, button, playerId))
    .flatMap((button) => button.forUnit)
    .filter((previousTypeId) => world.unitDefinitions.some((unit) => unit.id === previousTypeId && unit.mainFacility));
  if (previousTypes.length === 0) {
    return 1;
  }
  const nextSeen = new Set(seen);
  nextSeen.add(typeId);
  return 1 + Math.max(...previousTypes.map((previousTypeId) => sourceTownCenterTier(world, previousTypeId, nextSeen, playerId)));
}

function canBuildByTech(world: WorldState, playerId: number, buildingTypeId: string): boolean {
  const definition = world.unitDefinitions.find((unit) => unit.id === buildingTypeId);
  if (!definition) {
    return true;
  }
  if (sourceBuildButtonLevelsForType(world, buildingTypeId, playerId).has(1)) {
    return true;
  }
  if (isNavalSupportBuildingDefinition(world, buildingTypeId, definition, playerId)) {
    return hasCompletedShipyard(world, playerId);
  }
  if (isKeepTierTechBuildingDefinition(world, buildingTypeId, playerId)) {
    return hasTownCenterTier(world, playerId, 2);
  }
  if (isCastleTierTechBuildingDefinition(world, buildingTypeId, playerId)) {
    return hasTownCenterTier(world, playerId, 3);
  }
  return true;
}

function sourceBuildButtonLevelsForType(world: WorldState, buildingTypeId: string, playerId: number): Set<number> {
  return new Set(world.buttonDefinitions
    .filter((button) => button.action === "build" && button.value === buildingTypeId)
    .filter((button) => sourceButtonAllowedForSimulation(world, button, playerId))
    .map((button) => button.level));
}

function isNavalSupportBuildingDefinition(world: WorldState, buildingTypeId: string, definition: WargusUnit, playerId: number): boolean {
  return isOilRefineryDefinition(definition)
    || sourceBuildDefinitionResearchesMatching(world, buildingTypeId, isShipUpgradeId, playerId);
}

function isKeepTierTechBuildingDefinition(world: WorldState, buildingTypeId: string, playerId: number): boolean {
  return sourceBuildDefinitionHasTrainButtonMatching(world, buildingTypeId, isAdvancedMeleeCombatDefinition, playerId)
    || sourceBuildDefinitionHasTrainButtonMatching(world, buildingTypeId, isCasterDefinition, playerId)
    || sourceBuildDefinitionHasResearchButtonMatching(world, buildingTypeId, (upgradeId) => isHolyResearchUpgradeId(world, upgradeId), playerId)
    || isStockAdvancedMeleeTechBuildingForPlayer(world, playerId, buildingTypeId);
}

function isCastleTierTechBuildingDefinition(world: WorldState, buildingTypeId: string, playerId: number): boolean {
  return sourceBuildDefinitionHasTrainButtonMatching(world, buildingTypeId, isAirCombatDefinition, playerId)
    || sourceBuildDefinitionHasTrainButtonMatching(world, buildingTypeId, isDemolitionLabDefinition, playerId);
}

function isStockAdvancedMeleeTechBuildingForPlayer(world: WorldState, playerId: number, buildingTypeId: string): boolean {
  const race = world.players.find((player) => player.id === playerId)?.race === "orc" ? "orc" : "human";
  return buildingTypeId === (race === "human" ? "unit-stables" : "unit-ogre-mound");
}

function canTrainUnitByTech(world: WorldState, playerId: number, unitTypeId: string): boolean {
  const definition = world.unitDefinitions.find((unit) => unit.id === unitTypeId);
  if (definition && isRangedLandCombatDefinition(definition)) {
    return hasCompletedWoodImprover(world, playerId);
  }
  if (definition && (isNavalRoleDefinition(definition, "warship") || isNavalRoleDefinition(definition, "submarine"))) {
    return hasCompletedFoundry(world, playerId);
  }
  return true;
}

function canProduceUnitType(world: WorldState, building: WorldUnit, unitTypeId: string): boolean {
  const sourceProductionGate = canSourceProduceType(world, building, unitTypeId);
  if (sourceProductionGate !== null) {
    return sourceProductionGate;
  }
  const definition = world.unitDefinitions.find((unit) => unit.id === unitTypeId);
  if (isTownCenter(building)) {
    return Boolean(definition && isGoldOrWoodWorkerDefinition(definition)) || isTownCenterUpgradeFor(world, building, unitTypeId);
  }
  if (isWatchTower(world, building)) {
    return isSourceUpgradeFor(world, building, unitTypeId);
  }
  if (hasAllowedSourceTrainButton(world, building)) {
    return false;
  }
  if (!definition) {
    return false;
  }
  if (isBarracks(world, building)) {
    return isOrdinaryBarracksCombatDefinition(definition);
  }
  if (isAdvancedMeleeProducer(world, building)) {
    return isAdvancedMeleeCombatDefinition(definition);
  }
  if (isShipyard(world, building)) {
    return isNavalCombatOrUtilityDefinition(definition);
  }
  if (isCasterProducer(world, building)) {
    return isCasterDefinition(definition);
  }
  if (isAirProducer(world, building)) {
    return isAirCombatDefinition(definition);
  }
  if (isDemolitionProducer(world, building)) {
    return isDemolitionLabDefinition(definition);
  }
  return false;
}

function sourceBuildDefinitionHasTrainButtonMatching(world: WorldState, buildingTypeId: string, matchesUnit: (definition: WargusUnit) => boolean, playerId = world.visibilityPlayer): boolean {
  return world.buttonDefinitions.some((button) => (
    button.action === "train-unit"
    && typeof button.value === "string"
    && sourceButtonAppliesTo(button, buildingTypeId)
    && sourceButtonAllowedForSimulation(world, button, playerId)
    && Boolean(world.unitDefinitions.find((definition) => definition.id === button.value && matchesUnit(definition)))
  ));
}

function sourceBuildDefinitionHasResearchButtonMatching(world: WorldState, buildingTypeId: string, matchesUpgrade: (upgradeId: string) => boolean, playerId = world.visibilityPlayer): boolean {
  return world.buttonDefinitions.some((button) => (
    button.action === "research"
    && typeof button.value === "string"
    && sourceButtonAppliesTo(button, buildingTypeId)
    && sourceButtonAllowedForSimulation(world, button, playerId)
    && matchesUpgrade(button.value)
  ));
}

function canSourceProduceType(world: WorldState, building: WorldUnit, unitTypeId: string): boolean | null {
  const sourceProductionButtons = world.buttonDefinitions
    .filter((button) => button.action === "train-unit" || button.action === "upgrade-to")
    .filter((button) => sourceButtonAppliesTo(button, building.typeId))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, building.player));
  if (sourceProductionButtons.length === 0) {
    return null;
  }
  return sourceProductionButtons.some((button) => (
    button.value === unitTypeId
  ));
}

export function isProducerTransformationFor(world: WorldState, building: WorldUnit, unitTypeId: string): boolean {
  return isSourceUpgradeFor(world, building, unitTypeId) || isTownCenterUpgradeFor(world, building, unitTypeId);
}

function hasCompletedUnitType(world: WorldState, playerId: number, unitTypeId: string): boolean {
  return world.units.some((unit) => unit.player === playerId && unit.typeId === unitTypeId && !unit.construction && unit.hitPoints > 0);
}

function hasCompletedWoodImprover(world: WorldState, playerId: number): boolean {
  return world.units.some((unit) => (
    unit.player === playerId
    && !unit.construction
    && unit.hitPoints > 0
    && isWoodImprover(world, unit)
  ));
}

function isWoodImprover(world: WorldState, unit: WorldUnit): boolean {
  return sourceResearchProducerHasUpgradeFamily(world, unit, (upgradeId) => isLumberMillUpgradeId(world, upgradeId))
    ?? (canStoreResource(unit, "wood") && (unit.improveProduction.wood ?? 0) > 0);
}

function hasCompletedFoundry(world: WorldState, playerId: number): boolean {
  return world.units.some((unit) => (
    unit.player === playerId
    && !unit.construction
    && unit.hitPoints > 0
    && isFoundry(world, unit)
  ));
}

function hasCompletedShipyard(world: WorldState, playerId: number): boolean {
  return world.units.some((unit) => (
    unit.player === playerId
    && !unit.construction
    && unit.hitPoints > 0
    && isShipyard(world, unit)
  ));
}

function isUnitTypeAllowed(world: WorldState, unitTypeId: string, playerId?: number): boolean {
  if (!isSourceAllowRuleEnabled(world, unitTypeId, playerId)) {
    return false;
  }
  if (world.allowedUnitTypes.length === 0) {
    return true;
  }
  return isUnitTypeOrSourceUpgradeVariantAllowed(world, unitTypeId, playerId, new Set());
}

function isSourceAllowRuleEnabled(world: WorldState, id: string, playerId?: number): boolean {
  if (world.allowRules.length === 0 && world.allowOverrides.length === 0) {
    return true;
  }
  const rule = sourceAllowRuleForId(world, id);
  if (!rule) {
    return true;
  }
  return sourceAllowFlagForPlayer(rule, playerId) !== "F";
}

function sourceAllowRuleForId(world: WorldState, id: string): WargusAllowRule | undefined {
  return [...world.allowOverrides].reverse().find((candidate) => candidate.id === id)
    ?? world.allowRules.find((candidate) => candidate.id === id);
}

function sourceAllowFlagForPlayer(rule: WargusAllowRule | undefined, playerId?: number): string | null {
  if (!rule) {
    return null;
  }
  if (typeof playerId === "number" && playerId >= 0 && playerId < rule.flags.length) {
    return rule.flags[playerId] ?? null;
  }
  return rule.flags[0] ?? null;
}

function isUnitTypeOrSourceUpgradeVariantAllowed(world: WorldState, unitTypeId: string, playerId: number | undefined, seen: Set<string>): boolean {
  if (world.allowedUnitTypes.includes(unitTypeId)) {
    return true;
  }
  if (seen.has(unitTypeId)) {
    return false;
  }
  const nextSeen = new Set(seen);
  nextSeen.add(unitTypeId);
  const sourceVariants = sourceUpgradeVariantsForUnitType(world, unitTypeId);
  for (const upgradedTypeId of sourceVariants) {
    if (isSourceAllowRuleEnabled(world, upgradedTypeId, playerId) && isUnitTypeOrSourceUpgradeVariantAllowed(world, upgradedTypeId, playerId, nextSeen)) {
      return true;
    }
  }
  if (sourceVariants.length > 0) {
    return false;
  }
  const fallbackUpgradedForm = fallbackUpgradedFormForBaseUnit(unitTypeId);
  return Boolean(fallbackUpgradedForm && isUnitTypeOrSourceUpgradeVariantAllowed(world, fallbackUpgradedForm, playerId, nextSeen));
}

function sourceUpgradeVariantsForUnitType(world: WorldState, unitTypeId: string): string[] {
  const variants = new Set<string>();
  for (const upgrade of world.upgradeDefinitions) {
    for (const conversion of upgrade.conversions ?? []) {
      if (conversion.fromTypeId === unitTypeId) {
        variants.add(conversion.toTypeId);
      }
    }
  }
  for (const button of world.buttonDefinitions) {
    if (button.action === "upgrade-to" && typeof button.value === "string" && sourceButtonAppliesTo(button, unitTypeId)) {
      variants.add(button.value);
    }
  }
  return [...variants];
}

function fallbackUpgradedFormForBaseUnit(unitTypeId: string): string | null {
  if (unitTypeId === "unit-archer") {
    return "unit-ranger";
  }
  if (unitTypeId === "unit-axethrower") {
    return "unit-berserker";
  }
  if (unitTypeId === "unit-knight") {
    return "unit-paladin";
  }
  if (unitTypeId === "unit-ogre") {
    return "unit-ogre-mage";
  }
  return null;
}

function isBarracks(world: WorldState, unit: WorldUnit): boolean {
  return sourceProducerHasTrainRole(world, unit, isOrdinaryBarracksCombatDefinition) === true;
}

function isBlacksmith(world: WorldState, unit: WorldUnit): boolean {
  return sourceResearchProducerHasUpgradeFamily(world, unit, (upgradeId) => isBlacksmithUpgradeId(world, upgradeId)) === true;
}

function isLumberMill(world: WorldState, unit: WorldUnit): boolean {
  return sourceResearchProducerHasUpgradeFamily(world, unit, (upgradeId) => isLumberMillUpgradeId(world, upgradeId)) === true;
}

function isHolyResearchProducer(world: WorldState, unit: WorldUnit): boolean {
  return sourceResearchProducerHasUpgradeFamily(world, unit, (upgradeId) => isHolyResearchUpgradeId(world, upgradeId)) === true;
}

function isCasterResearchProducer(world: WorldState, unit: WorldUnit): boolean {
  return sourceResearchProducerHasUpgradeFamily(world, unit, (upgradeId) => isCasterResearchUpgradeId(world, upgradeId)) === true;
}

function isAdvancedMeleeProducer(world: WorldState, unit: WorldUnit): boolean {
  return sourceProducerHasTrainRole(world, unit, isAdvancedMeleeCombatDefinition) === true;
}

function isShipyard(world: WorldState, unit: WorldUnit): boolean {
  return sourceProducerHasTrainRole(world, unit, isNavalCombatOrUtilityDefinition)
    ?? (canStoreResource(unit, "oil") && (unit.improveProduction.oil ?? 0) <= 0);
}

export function canSetRallyPoint(world: WorldState, unit: WorldUnit): boolean {
  if (unit.hitPoints <= 0 || unit.construction) {
    return false;
  }
  if (hasAllowedSourceTrainButton(world, unit)) {
    return true;
  }
  return isTownCenter(unit)
    || isBarracks(world, unit)
    || isAdvancedMeleeProducer(world, unit)
    || isShipyard(world, unit)
    || isCasterProducer(world, unit)
    || isAirProducer(world, unit)
    || isDemolitionProducer(world, unit);
}

function hasAllowedSourceTrainButton(world: WorldState, unit: WorldUnit): boolean {
  return world.buttonDefinitions.some((button) => (
    button.action === "train-unit"
    && sourceButtonAppliesTo(button, unit.typeId)
    && sourceButtonAllowedForSimulation(world, button, unit.player)
  ));
}

function isCasterProducer(world: WorldState, unit: WorldUnit): boolean {
  return sourceProducerHasTrainRole(world, unit, (definition) => Boolean(definition.manaEnabled || (definition.manaMax ?? 0) > 0)) === true;
}

function isAirProducer(world: WorldState, unit: WorldUnit): boolean {
  return sourceProducerHasTrainRole(world, unit, (definition) => Boolean(definition.airUnit || definition.type === "fly") && definition.canAttack) === true;
}

function isDemolitionProducer(world: WorldState, unit: WorldUnit): boolean {
  return sourceProducerHasTrainRole(world, unit, isDemolitionLabDefinition) === true;
}

function sourceProducerHasTrainRole(world: WorldState, unit: WorldUnit, matchesRole: (definition: WargusUnit) => boolean): boolean | null {
  const buttons = world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "train-unit" && Boolean(button.value) && sourceButtonAppliesTo(button, unit.typeId))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, unit.player));
  if (buttons.length === 0) {
    return null;
  }
  return buttons.some((button) => {
    const definition = world.unitDefinitions.find((candidate) => candidate.id === button.value);
    return Boolean(definition && matchesRole(definition));
  });
}

function sourceResearchProducerHasUpgradeFamily(world: WorldState, unit: WorldUnit, matchesUpgrade: (upgradeId: string) => boolean): boolean | null {
  const buttons = world.buttonDefinitions
    .filter((button): button is WargusButton & { value: string } => button.action === "research" && Boolean(button.value) && sourceButtonAppliesTo(button, unit.typeId))
    .filter((button) => sourceButtonAllowedForSimulation(world, button, unit.player));
  if (buttons.length === 0) {
    return null;
  }
  return buttons.some((button) => matchesUpgrade(button.value));
}

function isBlacksmithUpgradeId(world: WorldState, upgradeId: string): boolean {
  return isBlacksmithWeaponUpgradeId(world, upgradeId)
    || isBlacksmithArmorUpgradeId(world, upgradeId)
    || isBlacksmithSiegeUpgradeId(world, upgradeId)
    || sourceFallbackUpgradeFamilyMatches(world, upgradeId, SOURCE_BLACKSMITH_UPGRADE_FALLBACK_TOKENS);
}

function isBlacksmithWeaponUpgradeId(world: WorldState, upgradeId: string): boolean {
  return upgradeModifiesMatchingUnits(world, upgradeId, (stat) => stat === "PiercingDamage" || stat === "BasicDamage", isMeleeLandCombatDefinition);
}

function isBlacksmithArmorUpgradeId(world: WorldState, upgradeId: string): boolean {
  return upgradeModifiesMatchingUnits(world, upgradeId, (stat) => stat === "Armor", isMeleeLandCombatDefinition);
}

function isBlacksmithSiegeUpgradeId(world: WorldState, upgradeId: string): boolean {
  return upgradeModifiesMatchingUnits(world, upgradeId, (stat) => stat === "PiercingDamage" || stat === "BasicDamage", isSiegeDefinition);
}

function isLumberMillUpgradeId(world: WorldState, upgradeId: string): boolean {
  return isLumberMillSourceUpgradeId(world, upgradeId)
    || sourceFallbackUpgradeFamilyMatches(world, upgradeId, SOURCE_LUMBER_MILL_UPGRADE_FALLBACK_TOKENS);
}

function isLumberMillSourceUpgradeId(world: WorldState, upgradeId: string): boolean {
  const upgrade = world.upgradeDefinitions.find((candidate) => candidate.id === upgradeId);
  return Boolean(upgrade && (
    (upgrade.conversions ?? []).some((conversion) => {
      const target = world.unitDefinitions.find((unit) => unit.id === conversion.toTypeId);
      return Boolean(target && isOrdinaryBarracksCombatDefinition(target) && isRangedLandCombatDefinition(target));
    })
    || upgrade.appliesTo.some((unitTypeId) => {
      const target = world.unitDefinitions.find((unit) => unit.id === unitTypeId);
      return Boolean(target && isOrdinaryBarracksCombatDefinition(target) && isRangedLandCombatDefinition(target));
    })
  ));
}

function upgradeModifiesMatchingUnits(world: WorldState, upgradeId: string, matchesStat: (stat: WargusUpgrade["modifiers"][number]["stat"]) => boolean, matchesUnit: (definition: WargusUnit) => boolean): boolean {
  const upgrade = world.upgradeDefinitions.find((candidate) => candidate.id === upgradeId);
  return Boolean(upgrade
    && upgrade.modifiers.some((modifier) => matchesStat(modifier.stat))
    && upgrade.appliesTo.some((unitTypeId) => {
      const target = world.unitDefinitions.find((unit) => unit.id === unitTypeId);
      return Boolean(target && matchesUnit(target));
    }));
}

function upgradeHasSourceTargetMetadata(world: WorldState, upgradeId: string): boolean {
  const upgrade = worldUpgrade(world, upgradeId);
  return Boolean(upgrade && (
    upgrade.modifiers.length > 0
    || upgrade.appliesTo.length > 0
    || (upgrade.conversions ?? []).length > 0
  ));
}

const SOURCE_BLACKSMITH_UPGRADE_FALLBACK_TOKENS = ["sword", "shield", "battle-axe", "ballista", "catapult"] as const;
const SOURCE_LUMBER_MILL_UPGRADE_FALLBACK_TOKENS = ["arrow", "ranger", "longbow", "throwing-axe", "berserker", "light-axes"] as const;
const SOURCE_MELEE_WEAPON_UPGRADE_FALLBACK_TOKENS = ["sword", "battle-axe"] as const;
const SOURCE_SHIELD_UPGRADE_FALLBACK_TOKENS = ["shield"] as const;
const SOURCE_SIEGE_UPGRADE_FALLBACK_TOKENS = ["ballista", "catapult"] as const;

function sourceFallbackUpgradeFamilyMatches(world: WorldState, upgradeId: string, tokens: readonly string[]): boolean {
  if (upgradeHasSourceTargetMetadata(world, upgradeId)) {
    return false;
  }
  const text = sourceUpgradeFallbackText(world, upgradeId);
  return tokens.some((token) => text.includes(token));
}

function sourceUpgradeFallbackText(world: WorldState, upgradeId: string): string {
  const upgrade = worldUpgrade(world, upgradeId);
  const sourceButtons = world.buttonDefinitions
    .filter((button) => button.action === "research" && button.value === upgradeId)
    .map((button) => `${button.hint ?? ""} ${button.icon ?? ""} ${button.forUnit.join(" ")}`);
  return [upgradeId, upgrade?.source ?? "", ...sourceButtons].join(" ").toLowerCase();
}

export function isMeleeWeaponResearchUpgrade(world: WorldState, upgradeId: string): boolean {
  return upgradeModifiesMatchingUnits(world, upgradeId, (stat) => stat === "PiercingDamage" || stat === "BasicDamage", isMeleeLandCombatDefinition)
    || sourceFallbackUpgradeFamilyMatches(world, upgradeId, SOURCE_MELEE_WEAPON_UPGRADE_FALLBACK_TOKENS);
}

export function isShieldResearchUpgrade(world: WorldState, upgradeId: string): boolean {
  return upgradeModifiesMatchingUnits(world, upgradeId, (stat) => stat === "Armor", isMeleeLandCombatDefinition)
    || sourceFallbackUpgradeFamilyMatches(world, upgradeId, SOURCE_SHIELD_UPGRADE_FALLBACK_TOKENS);
}

export function isSiegeResearchUpgrade(world: WorldState, upgradeId: string): boolean {
  return upgradeModifiesMatchingUnits(world, upgradeId, (stat) => stat === "PiercingDamage" || stat === "BasicDamage", isSiegeDefinition)
    || sourceFallbackUpgradeFamilyMatches(world, upgradeId, SOURCE_SIEGE_UPGRADE_FALLBACK_TOKENS);
}

export function isLumberMillResearchUpgrade(world: WorldState, upgradeId: string): boolean {
  const upgrade = worldUpgrade(world, upgradeId);
  return Boolean(upgrade && (
    (upgrade.conversions ?? []).some((conversion) => {
      const target = world.unitDefinitions.find((unit) => unit.id === conversion.toTypeId);
      return Boolean(target && isOrdinaryBarracksCombatDefinition(target) && isRangedLandCombatDefinition(target));
    })
    || upgrade.appliesTo.some((unitTypeId) => {
      const target = world.unitDefinitions.find((unit) => unit.id === unitTypeId);
      return Boolean(target && isOrdinaryBarracksCombatDefinition(target) && isRangedLandCombatDefinition(target));
    })
  )) || sourceFallbackUpgradeFamilyMatches(world, upgradeId, SOURCE_LUMBER_MILL_UPGRADE_FALLBACK_TOKENS);
}

function upgradeClassifierArgs(worldOrUpgradeId: WorldState | string, maybeUpgradeId?: string): { world: WorldState | null; upgradeId: string } {
  return typeof worldOrUpgradeId === "string"
    ? { world: null, upgradeId: worldOrUpgradeId }
    : { world: worldOrUpgradeId, upgradeId: maybeUpgradeId ?? "" };
}

function isNavalAttackUpgradeTargetDefinition(definition: WargusUnit): boolean {
  return definition.seaUnit === true && definition.canAttack === true;
}

function isShipUpgradeId(upgradeId: string): boolean;
function isShipUpgradeId(world: WorldState, upgradeId: string): boolean;
function isShipUpgradeId(worldOrUpgradeId: WorldState | string, maybeUpgradeId?: string): boolean {
  return isShipCannonResearchUpgradeId(worldOrUpgradeId as WorldState, maybeUpgradeId as string)
    || isShipArmorResearchUpgradeId(worldOrUpgradeId as WorldState, maybeUpgradeId as string);
}

export function isHolyResearchUpgradeId(world: WorldState, upgradeId: string): boolean {
  return isHolyTransformationResearchUpgradeId(world, upgradeId)
    || sourceSpellDependencyResearchForRole(world, upgradeId, isAdvancedMeleeCasterDefinition)
    || (!upgradeHasSourceTargetMetadata(world, upgradeId) && [
      "upgrade-paladin",
      "upgrade-healing",
      "upgrade-exorcism",
      "upgrade-holy-vision",
      "upgrade-ogre-mage",
      "upgrade-haste",
      "upgrade-bloodlust",
      "upgrade-runes",
      "upgrade-eye-of-kilrogg"
    ].includes(upgradeId));
}

export function isHolyTransformationResearchUpgradeId(world: WorldState, upgradeId: string): boolean {
  const upgrade = worldUpgrade(world, upgradeId);
  return (upgrade?.conversions ?? []).some((conversion) => {
    const target = world.unitDefinitions.find((unit) => unit.id === conversion.toTypeId);
    return Boolean(target && isAdvancedMeleeCasterDefinition(target));
  }) || (!upgradeHasSourceTargetMetadata(world, upgradeId) && (upgradeId === "upgrade-paladin" || upgradeId === "upgrade-ogre-mage"));
}

export function isCasterResearchUpgradeId(world: WorldState, upgradeId: string): boolean {
  return sourceSpellDependencyResearchForRole(world, upgradeId, isDedicatedCasterDefinition)
    || (!upgradeHasSourceTargetMetadata(world, upgradeId) && [
      "upgrade-fireball",
      "upgrade-flame-shield",
      "upgrade-slow",
      "upgrade-blizzard",
      "upgrade-polymorph",
      "upgrade-invisibility",
      "upgrade-death-coil",
      "upgrade-death-and-decay",
      "upgrade-whirlwind",
      "upgrade-raise-dead",
      "upgrade-unholy-armor"
    ].includes(upgradeId));
}

export function sourceSpellDependencyResearchForRole(world: WorldState, upgradeId: string, matchesCaster: (definition: WargusUnit) => boolean): boolean {
  return world.spellDefinitions
    .filter((spell) => spell.dependUpgrade === upgradeId)
    .some((spell) => world.unitDefinitions.some((definition) => matchesCaster(definition) && (definition.canCastSpells ?? []).includes(spell.id)));
}

export function isAdvancedMeleeCasterDefinition(definition: WargusUnit): boolean {
  return isAdvancedMeleeCombatDefinition(definition) && isCasterDefinition(definition);
}

function isDedicatedCasterDefinition(definition: WargusUnit): boolean {
  return isCasterDefinition(definition) && !isAdvancedMeleeCombatDefinition(definition) && !isDemolitionUnitDefinition(definition);
}

function isScoutFlyer(unit: WorldUnit): boolean {
  return unit.kind === "fly" && !unit.canAttack && isExploreOnReadyValue(unit.onReady);
}

export function isTransport(unit: WorldUnit): boolean {
  return unit.cargoCapacity > 0 && unit.canTransport.length > 0;
}

function canLoadIntoTransport(transport: WorldUnit, unit: WorldUnit): boolean {
  return canTargetTransportForLoading(transport, unit)
    && Math.hypot(unit.x - transport.x, unit.y - transport.y) <= transport.radius + unit.radius + 64;
}

export function canTargetTransportForLoading(transport: WorldUnit, unit: WorldUnit): boolean {
  return unit.player === transport.player
    && unit.id !== transport.id
    && isTransport(transport)
    && transport.hitPoints > 0
    && !transport.construction
    && transport.cargo.length < transport.cargoCapacity
    && canTransportCarryUnit(transport, unit)
    && unit.hitPoints > 0
    && unit.speed > 0
    && !unit.construction
    && !isTransport(unit);
}

function canTransportCarryUnit(transport: WorldUnit, unit: WorldUnit): boolean {
  return transport.canTransport.some((rule) => {
    if (rule === "LandUnit") {
      return unit.kind === "land";
    }
    if (rule === "SeaUnit") {
      return unit.kind === "naval";
    }
    if (rule === "AirUnit") {
      return unit.kind === "fly";
    }
    return false;
  });
}

const SOURCE_UNLOAD_UNIT_MAX_RANGE = 1;
const SOURCE_UNLOAD_DROPZONE_MAX_RANGE = 20;
const SOURCE_UNLOAD_MAX_RETRIES = 20;
const SPAWN_EXIT_MAX_RANGE = 6;

function findUnloadTileNear(world: WorldState, center: { x: number; y: number }, unit: WorldUnit, reserved: WorldUnit[], maxRange = SPAWN_EXIT_MAX_RANGE): { x: number; y: number } | null {
  for (let radius = 0; radius <= maxRange; radius += 1) {
    for (let y = center.y - radius; y <= center.y + radius; y += 1) {
      for (let x = center.x - radius; x <= center.x + radius; x += 1) {
        const onRing = radius === 0 || x === center.x - radius || x === center.x + radius || y === center.y - radius || y === center.y + radius;
        if (!onRing || x < 0 || y < 0 || x >= world.map.width || y >= world.map.height) {
          continue;
        }
        if (reservedUnitsBlockSpawn(world, reserved, x, y, unit)) {
          continue;
        }
        if (isFootprintOpenForUnitSpawn(world, x, y, unit, unit.id)) {
          return { x, y };
        }
      }
    }
  }
  return null;
}

function reservedUnitsBlockSpawn(world: WorldState, reserved: WorldUnit[], tileX: number, tileY: number, unit: WorldUnit): boolean {
  for (let y = tileY; y < tileY + unit.tileHeight; y += 1) {
    for (let x = tileX; x < tileX + unit.tileWidth; x += 1) {
      if (reserved.some((candidate) => footprintContainsTile(world, candidate, x, y))) {
        return true;
      }
    }
  }
  return false;
}

function navalUnitForRole(role: "tanker" | "destroyer" | "warship" | "transport" | "submarine", race: string | null | undefined): string {
  if (role === "tanker") {
    return race === "human" ? "unit-human-oil-tanker" : "unit-orc-oil-tanker";
  }
  if (role === "destroyer") {
    return race === "human" ? "unit-human-destroyer" : "unit-orc-destroyer";
  }
  if (role === "transport") {
    return race === "human" ? "unit-human-transport" : "unit-orc-transport";
  }
  if (role === "submarine") {
    return race === "human" ? "unit-human-submarine" : "unit-orc-submarine";
  }
  return race === "human" ? "unit-battleship" : "unit-ogre-juggernaught";
}

function isDefensiveBuilding(unit: WorldUnit): boolean {
  return unit.canAttack && isBuildingLike(unit);
}

function canAutoGuard(unit: WorldUnit): boolean {
  return unit.hitPoints > 0 && unit.canAttack && (isDefensiveBuilding(unit) || (!unit.coward && unit.speed > 0 && canReceiveMoveOrders(unit)));
}

function findNearestEnemyInRange(world: WorldState, unit: WorldUnit): WorldUnit | undefined {
  return world.units
    .filter((candidate) => {
      if (candidate.player === unit.player || candidate.player === 15 || candidate.hitPoints <= 0) {
        return false;
      }
      if (!isUnitVisibleToPlayer(world, candidate, unit.player)) {
        return false;
      }
      if (!canAutoAcquireSourceTarget(unit, candidate)) {
        return false;
      }
      return isInAttackRange(unit, candidate, world);
    })
    .sort((a, b) => compareAutoTargetCandidates(world, unit, a, b))[0];
}

function canAfford(resources: Record<string, number>, costs: string[]): boolean {
  for (let index = 0; index < costs.length - 1; index += 2) {
    const resource = costs[index];
    if (resource === "time") {
      continue;
    }
    if ((resources[resource] ?? 0) < Number(costs[index + 1])) {
      return false;
    }
  }
  return true;
}

function spendResources(resources: Record<string, number>, costs: string[]): void {
  for (let index = 0; index < costs.length - 1; index += 2) {
    const resource = costs[index];
    if (resource === "time") {
      continue;
    }
    resources[resource] = (resources[resource] ?? 0) - Number(costs[index + 1]);
  }
}

function refundCosts(world: WorldState, player: WorldState["players"][number], costs: string[], fraction: number): void {
  for (let index = 0; index < costs.length - 1; index += 2) {
    const resource = costs[index];
    if (resource === "time") {
      continue;
    }
    addPlayerResource(world, player, resource, Math.floor(Number(costs[index + 1]) * fraction));
  }
}

export function addPlayerResource(world: Pick<WorldState, "engineSettings">, player: WorldState["players"][number], resource: string, amount: number): void {
  const current = Math.max(0, Math.floor(player.resources[resource] ?? 0));
  const next = current + Math.max(0, Math.floor(amount));
  const maxAmount = sourceDefaultResourceMaxAmount(world, resource);
  player.resources[resource] = maxAmount === null ? next : Math.min(maxAmount, next);
}

function sourceDefaultResourceMaxAmount(world: Pick<WorldState, "engineSettings">, resource: string): number | null {
  const resourceIndex = world.engineSettings.defaultResourceNames.indexOf(resource);
  const maxAmount = resourceIndex >= 0 ? world.engineSettings.defaultResourceMaxAmounts[resourceIndex] : undefined;
  if (typeof maxAmount !== "number" || !Number.isFinite(maxAmount) || maxAmount < 0) {
    return null;
  }
  return Math.floor(maxAmount);
}

function costValue(costs: string[], resource: string): number {
  const index = costs.indexOf(resource);
  return index >= 0 ? Number(costs[index + 1]) : 0;
}
