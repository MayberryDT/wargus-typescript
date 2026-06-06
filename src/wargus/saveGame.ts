import type { WargusEngineSettings, WargusManifest, WargusMap, WargusSpeedFactors, WargusSpell, WargusUnit } from "./types";
import { isExploreOnReadyValue } from "./sourceActions";
import { boxDimensionsForUnit, createInitialWorld, createPlayerStats, defaultForestTileResources, imageForTileset, initialForestResourcesForWorld, isSourceBuildingDefinition, isUnitVisibleToPlayer, normalizeImproveProduction, normalizePositiveResourceMap, normalizeResourceCapacity, normalizeRgbColor, productionQueueLimitForEngine, resourceWaitAtDepotCyclesForUnit, resourceWaitAtResourceCyclesForUnit, resourcesHeldForSourceUnit, sightRangeForUnit, sourceAiDefinitionForName, sourceAiDefinitionIsPassive, sourceBuildDurationSecondsForPlayer, sourceDecayRateLifetimeSeconds, sourceDefaultGameSpeed, sourceResearchDurationSecondsForPlayer, sourceResourceHarvestDurationSecondsForPlayer, sourceResourceReturnDurationSecondsForPlayer, sourceTrainDurationSecondsForPlayer, sourceUpgradeDurationSecondsForPlayer, speedForUnit, updateVisibility, worldKindForUnitDefinition, type WorldProjectile, type WorldState } from "../simulation/world";
import { applyResearchedUpgradesToUnit, canAttackTarget, canCastTargetedSpellCommand, canIssueAttackGroundAt, canIssueAttackTarget, canIssueAttackTargetWithPath, canIssueBuildOilPlatformAt, canIssueDefendTarget, canIssueExploreOrder, canIssueHoldPosition, canIssueQueueAttackGroundAt, canIssueQueueAttackTarget, canIssueQueueBuildAt, canIssueQueueBuildOilPlatformAt, canIssueQueueCombatMoveAt, canIssueQueuePatrolAt, canIssueQueueDefendTarget, canIssueQueueFollowTarget, canIssueQueueHarvestTarget, canIssueQueueHarvestWoodAt, canIssueQueueLoadIntoTransportTarget, canIssueQueueMoveAt, canIssueQueueRepairTarget, canIssueQueueReturnGoodsOrder, canIssueQueueTargetedSpellAt, canIssueQueueUnloadTransportAt, canIssueRepairTarget, canIssueUnloadTransportAt, canResearchUpgradeAt, canSetRallyPoint, canTargetFollow, canTargetTransportForLoading, canTrainUnitAt, isProducerTransformationFor, isTargetedSpellCommand, issueExploreOrder, projectileSpeedForMissile, sourceResearchAllowsSharedProgress, targetedSpellIdForCommand } from "../simulation/orders";
import { isSourceHarvestableWoodTile } from "../simulation/passability";

type MutableEngineSettingsSave = Pick<WargusEngineSettings,
  | "effectsEnabledDefault"
  | "effectsVolumeDefault"
  | "musicEnabledDefault"
  | "musicVolumeDefault"
  | "stereoSoundDefault"
  | "lastDifficultyDefault"
  | "sourceGameSpeedDefault"
  | "showMessagesDefault"
  | "showTipsDefault"
  | "tipNumberDefault"
  | "showCommandKeyDefault"
  | "showButtonPopupsDefault"
  | "mapGridDefault"
  | "showNameDelayTicksDefault"
  | "showNameTimeTicksDefault"
  | "showNoSelectionStatsDefault"
  | "noStatusLineTooltipsDefault"
  | "showOrdersDefault"
  | "showDamageDefault"
  | "showSightRangeDefault"
  | "showAttackRangeDefault"
  | "showReactionRangeDefault"
  | "autosaveMinutesDefault"
  | "debugFlagsDefault"
  | "damageMissileId"
  | "minimapWithTerrainDefault"
  | "mineNotificationsDefault"
  | "enableKeyboardScrollingDefault"
  | "enableMouseScrollingDefault"
  | "groupKeysDefault"
  | "fastForwardCycleDefault"
  | "frameSkipDefault"
  | "formationMovementDefault"
  | "bigScreenDefault"
  | "grayscaleIconsDefault"
  | "aiChecksDependenciesDefault"
  | "aiExploresDefault"
  | "insideDefault"
  | "revealMapMode"
  | "keyScrollSpeedDefault"
  | "mouseScrollSpeedDefault"
  | "mouseScrollSpeedPressedDefault"
  | "mouseScrollSpeedControlDefault"
  | "keepRatioDefault"
  | "playerNameDefault"
  | "videoFullScreenDefault"
  | "videoHeightDefault"
  | "videoShaderDefault"
  | "videoWidthDefault"
  | "viewportModeDefault"
  | "grabMouseDefault"
  | "hardwareCursorDefault"
  | "highlightPassabilityDefault"
  | "iconsShiftDefault"
  | "allyDepositsAllowedDefault"
  | "rightButtonAction"
  | "deselectInMineDefault"
  | "simplifiedAutoTargetingDefault"
  | "useFancyBuildingsDefault"
  | "enhancedEffectsDefault"
  | "pauseOnLeaveDefault"
  | "leaveStopScrollingDefault"
  | "trainingQueue"
  | "selectionStyleDefault"
  | "selectionRectangleIndicatesDamageDefault"
  | "doubleClickDelayMsDefault"
  | "holdClickDelayMsDefault"
>;

const LEGACY_SAVE_KEY = "wargus-ts-save-v1";
const SAVE_SLOT_PREFIX = "wargus-ts-save-slot-v1-";
const AUTOSAVE_KEY = "wargus-ts-autosave-v1";
const SOURCE_DEBUG_FLAGS = new Set(["single-player-walls"]);
const SOURCE_AI_BUILD_ROLES = new Set([
  "town-center",
  "town-center-tier2",
  "town-center-tier3",
  "supply",
  "barracks",
  "lumber-mill",
  "blacksmith",
  "tower",
  "guard-tower",
  "cannon-tower",
  "advanced-melee",
  "holy",
  "caster",
  "air",
  "demolition",
  "shipyard",
  "foundry",
  "refinery",
  "oil-platform"
]);

interface SavedGame {
  version: 1;
  savedAt: string;
  mapPath: string;
  camera: { x: number; y: number; zoom: number };
  activeSourceViewportIndex?: number;
  sourceViewportCameras?: Array<{ x: number; y: number; zoom: number }>;
  controlGroups?: Record<number, string[]>;
  world: {
    tileSize: number;
    tiles: number[];
    terrainVersion?: number;
    units: WorldState["units"];
    corpses?: WorldState["corpses"];
    projectiles: WorldState["projectiles"];
    pendingAttacks?: WorldState["pendingAttacks"];
    spellEffects: WorldState["spellEffects"];
    players: WorldState["players"];
    researchedUpgrades: WorldState["researchedUpgrades"];
    activeResearch: WorldState["activeResearch"];
    queuedResearch?: WorldState["queuedResearch"];
    aiStates: WorldState["aiStates"];
    visibilityPlayer: number;
    exploredTiles: number[];
    visibleTiles: number[];
    lastSeenBuildings?: WorldState["lastSeenBuildings"];
    visibilityReveals?: WorldState["visibilityReveals"];
    forestRegrowth?: WorldState["forestRegrowth"];
    forestResources?: WorldState["forestResources"];
    revelationKnownMainFacilityPlayers?: WorldState["revelationKnownMainFacilityPlayers"];
    revelationTimers?: WorldState["revelationTimers"];
    revealedPlayers?: WorldState["revealedPlayers"];
    godModePlayers?: WorldState["godModePlayers"];
    allowOverrides?: WorldState["allowOverrides"];
    objectives?: WorldState["objectives"];
    briefingText?: WorldState["briefingText"];
    briefingVoiceFiles?: WorldState["briefingVoiceFiles"];
    victoryRequirements?: WorldState["victoryRequirements"];
    victoryRequirementGroups?: WorldState["victoryRequirementGroups"];
    defeatRequirements?: WorldState["defeatRequirements"];
    timedVictoryTriggers?: WorldState["timedVictoryTriggers"];
    locationBuildRequirements?: WorldState["locationBuildRequirements"];
    pendingTimedVictory?: WorldState["pendingTimedVictory"];
    circleOfPowerRequirements?: WorldState["circleOfPowerRequirements"];
    rescuedCircleRequirements?: WorldState["rescuedCircleRequirements"];
    diplomacy?: WorldState["diplomacy"];
    sharedVision?: WorldState["sharedVision"];
    requiredSurvivalUnitIds?: WorldState["requiredSurvivalUnitIds"];
    allowedUnitTypes?: WorldState["allowedUnitTypes"];
    allowedUpgradeTypes?: WorldState["allowedUpgradeTypes"];
    matchState: WorldState["matchState"];
    lastHelpTickByPlayer?: WorldState["lastHelpTickByPlayer"];
    lastHelpLocationByPlayer?: WorldState["lastHelpLocationByPlayer"];
    nextUnitSerial: number;
    elapsed: number;
    tick: number;
    tickRate: number;
    accumulator: number;
    engineSettings?: MutableEngineSettingsSave;
  };
}

export interface SavedGameSummary {
  savedAt: string;
  mapPath: string;
  slot: number;
  persisted?: boolean;
}

export interface LoadedSavedGame {
  world: WorldState;
  map: WargusMap;
  camera: { x: number; y: number; zoom: number };
  activeSourceViewportIndex: number;
  sourceViewportCameras: Array<{ x: number; y: number; zoom: number }>;
  controlGroups: Record<number, string[]>;
}

export interface SourceViewportCameraSaveState {
  activeSourceViewportIndex: number;
  sourceViewportCameras: Array<{ x: number; y: number; zoom: number }>;
}

export function saveGame(world: WorldState, camera: { x: number; y: number; zoom: number }, controlGroups: Record<number, string[]> = {}, slot = 1, sourceViewportState?: SourceViewportCameraSaveState): SavedGameSummary {
  const save = createSavedGame(world, camera, controlGroups, sourceViewportState);
  const persisted = safeStorageSet(saveKeyForSlot(slot), JSON.stringify(save));
  return { savedAt: save.savedAt, mapPath: save.mapPath, slot, persisted };
}

export function saveAutosave(world: WorldState, camera: { x: number; y: number; zoom: number }, controlGroups: Record<number, string[]> = {}, sourceViewportState?: SourceViewportCameraSaveState): SavedGameSummary {
  const save = createSavedGame(world, camera, controlGroups, sourceViewportState);
  const persisted = safeStorageSet(AUTOSAVE_KEY, JSON.stringify(save));
  return { savedAt: save.savedAt, mapPath: save.mapPath, slot: 0, persisted };
}

export function exportSavedGame(world: WorldState, camera: { x: number; y: number; zoom: number }, controlGroups: Record<number, string[]> = {}, sourceViewportState?: SourceViewportCameraSaveState): string {
  return JSON.stringify(createSavedGame(world, camera, controlGroups, sourceViewportState), null, 2);
}

export function importSavedGameJson(json: string, slot = 1): SavedGameSummary | null {
  const save = parseSavedGame(json);
  if (!save) {
    return null;
  }
  if (!safeStorageSet(saveKeyForSlot(slot), JSON.stringify(save))) {
    return null;
  }
  return { savedAt: save.savedAt, mapPath: save.mapPath, slot };
}

function createSavedGame(world: WorldState, camera: { x: number; y: number; zoom: number }, controlGroups: Record<number, string[]>, sourceViewportState?: SourceViewportCameraSaveState): SavedGame {
  const sourceViewportCameras = normalizeSourceViewportCameraSave(sourceViewportState, camera);
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    mapPath: world.map.path,
    camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
    activeSourceViewportIndex: sourceViewportCameras.activeSourceViewportIndex,
    sourceViewportCameras: sourceViewportCameras.sourceViewportCameras,
    controlGroups,
    world: {
      tileSize: world.tileSize,
      tiles: world.tiles,
      terrainVersion: world.terrainVersion,
      units: world.units,
      corpses: world.corpses,
      projectiles: world.projectiles,
      pendingAttacks: world.pendingAttacks,
      spellEffects: world.spellEffects,
      players: world.players,
      researchedUpgrades: world.researchedUpgrades,
      activeResearch: world.activeResearch,
      queuedResearch: world.queuedResearch,
      aiStates: world.aiStates,
      visibilityPlayer: world.visibilityPlayer,
      exploredTiles: [...world.exploredTiles],
      visibleTiles: [...world.visibleTiles],
      lastSeenBuildings: world.lastSeenBuildings,
      visibilityReveals: world.visibilityReveals,
      forestRegrowth: world.forestRegrowth,
      forestResources: world.forestResources,
      revelationKnownMainFacilityPlayers: world.revelationKnownMainFacilityPlayers,
      revelationTimers: world.revelationTimers,
      revealedPlayers: world.revealedPlayers,
      godModePlayers: world.godModePlayers,
      allowOverrides: world.allowOverrides,
      objectives: world.objectives,
      briefingText: world.briefingText,
      briefingVoiceFiles: world.briefingVoiceFiles,
      victoryRequirements: world.victoryRequirements,
      victoryRequirementGroups: world.victoryRequirementGroups,
      defeatRequirements: world.defeatRequirements,
      timedVictoryTriggers: world.timedVictoryTriggers,
      locationBuildRequirements: world.locationBuildRequirements,
      pendingTimedVictory: world.pendingTimedVictory,
      circleOfPowerRequirements: world.circleOfPowerRequirements,
      rescuedCircleRequirements: world.rescuedCircleRequirements,
      diplomacy: world.diplomacy,
      sharedVision: world.sharedVision,
      requiredSurvivalUnitIds: world.requiredSurvivalUnitIds,
      allowedUnitTypes: world.allowedUnitTypes,
      allowedUpgradeTypes: world.allowedUpgradeTypes,
      matchState: world.matchState,
      lastHelpTickByPlayer: world.lastHelpTickByPlayer,
      lastHelpLocationByPlayer: world.lastHelpLocationByPlayer,
      nextUnitSerial: world.nextUnitSerial,
      elapsed: world.elapsed,
      tick: world.tick,
      tickRate: world.tickRate,
      accumulator: world.accumulator,
      engineSettings: mutableEngineSettingsForSave(world)
    }
  };
}

export function loadSavedGame(manifest: WargusManifest, slot = 1): LoadedSavedGame | null {
  const raw = safeStorageGet(saveKeyForSlot(slot)) ?? (slot === 1 ? safeStorageGet(LEGACY_SAVE_KEY) : null);
  return loadSavedGameFromRaw(manifest, raw);
}

export function loadAutosave(manifest: WargusManifest): LoadedSavedGame | null {
  return loadSavedGameFromRaw(manifest, safeStorageGet(AUTOSAVE_KEY));
}

function loadSavedGameFromRaw(manifest: WargusManifest, raw: string | null): LoadedSavedGame | null {
  if (!raw) {
    return null;
  }
  const save = parseSavedGame(raw);
  if (!save) {
    return null;
  }
  const map = manifest.maps.find((candidate) => candidate.path === save.mapPath);
  if (!map) {
    return null;
  }
  const world = createInitialWorld(map, manifest.units, null, manifest.upgrades, manifest.missiles, manifest.spells, manifest.allowRules, manifest.dependencies, manifest.buttons, manifest.engineSettings, manifest.aiDefinitions, manifest.unitDatabase, manifest.tilesets, manifest.animations);
  applyMutableEngineSettingsSave(world, save.world.engineSettings);
  world.tileSize = Math.max(8, Math.min(128, finiteNumberOr(save.world.tileSize, world.tileSize)));
  world.tiles = normalizeNumberArray(save.world.tiles, map.width * map.height, world.tiles);
  world.terrainVersion = Math.max(0, Math.floor(finiteNumberOr(save.world.terrainVersion, 0)));
  world.players = normalizePlayers(save.world.players, world);
  world.visibilityPlayer = normalizeVisibilityPlayer(save.world.visibilityPlayer, world);
  world.corpses = normalizeCorpses(world, save.world.corpses);
  world.researchedUpgrades = normalizeResearchedUpgrades(save.world.researchedUpgrades, world);
  const definitionsById = new Map(manifest.units.map((unit) => [unit.id, unit]));
  world.units = normalizeLoadedUnits(world, save.world.units, definitionsById);
  applyLoadedResearchStateToUnits(world);
  world.projectiles = normalizeProjectiles(world, save.world.projectiles);
  world.pendingAttacks = normalizePendingAttacks(world, save.world.pendingAttacks);
  world.spellEffects = normalizeSpellEffects(world, save.world.spellEffects);
  world.activeResearch = normalizeActiveResearch(save.world.activeResearch, world);
  world.queuedResearch = normalizeQueuedResearch(save.world.queuedResearch, world);
  const savedTick = Math.max(0, Math.floor(finiteNumberOr(save.world.tick, 0)));
  world.aiStates = normalizeAiStates(save.world.aiStates, world, savedTick);
  world.exploredTiles = Uint8Array.from(normalizeNumberArray(save.world.exploredTiles, map.width * map.height, [...world.exploredTiles]));
  world.visibleTiles = Uint8Array.from(normalizeNumberArray(save.world.visibleTiles, map.width * map.height, [...world.visibleTiles]));
  world.lastSeenBuildings = normalizeLastSeenBuildings(world, save.world.lastSeenBuildings);
  world.visibilityReveals = normalizeVisibilityReveals(world, save.world.visibilityReveals);
  world.forestRegrowth = normalizeForestRegrowth(world, save.world.forestRegrowth);
  world.forestResources = normalizeForestResources(world, save.world.forestResources);
  world.revelationKnownMainFacilityPlayers = normalizePlayerIdArray(save.world.revelationKnownMainFacilityPlayers, world.revelationKnownMainFacilityPlayers, world);
  world.revelationTimers = normalizeRevelationTimers(world, save.world.revelationTimers);
  world.revealedPlayers = normalizePlayerIdArray(save.world.revealedPlayers, world.revealedPlayers, world);
  world.godModePlayers = normalizePlayerIdArray(save.world.godModePlayers, world.godModePlayers, world);
  world.allowOverrides = normalizeAllowRules(save.world.allowOverrides, map.allowOverrides ?? [], world);
  world.objectives = normalizeStringArray(save.world.objectives, map.objectives ?? []);
  world.briefingText = typeof save.world.briefingText === "string" ? save.world.briefingText : map.briefingText ?? null;
  world.briefingVoiceFiles = normalizeStringArray(save.world.briefingVoiceFiles, map.briefingVoiceFiles ?? []);
  world.victoryRequirements = normalizeVictoryRequirements(save.world.victoryRequirements, map.victoryRequirements ?? [], world);
  world.victoryRequirementGroups = normalizeVictoryRequirementGroups(save.world.victoryRequirementGroups, map.victoryRequirementGroups ?? [], world);
  world.defeatRequirements = normalizeDefeatRequirements(save.world.defeatRequirements, map.defeatRequirements ?? [], world);
  world.timedVictoryTriggers = normalizeTimedVictoryTriggers(save.world.timedVictoryTriggers, map.timedVictoryTriggers ?? []);
  world.locationBuildRequirements = normalizeLocationBuildRequirements(save.world.locationBuildRequirements, map.locationBuildRequirements ?? []);
  world.pendingTimedVictory = normalizePendingTimedVictory(save.world.pendingTimedVictory, world.timedVictoryTriggers);
  world.circleOfPowerRequirements = normalizeCircleOfPowerRequirements(save.world.circleOfPowerRequirements, map.circleOfPowerRequirements ?? []);
  world.rescuedCircleRequirements = normalizeRescuedCircleRequirements(save.world.rescuedCircleRequirements, map.rescuedCircleRequirements ?? []);
  world.diplomacy = normalizeDiplomacyRules(save.world.diplomacy, map.diplomacy ?? [], world);
  world.sharedVision = normalizeSharedVisionRules(save.world.sharedVision, map.sharedVision ?? [], world);
  world.requiredSurvivalUnitIds = normalizeStringArray(save.world.requiredSurvivalUnitIds, world.requiredSurvivalUnitIds)
    .filter((unitId) => unitIdExistsIncludingCargo(world, unitId));
  world.allowedUnitTypes = normalizeStringArray(save.world.allowedUnitTypes, map.allowedUnitTypes ?? [])
    .filter((unitTypeId) => world.unitDefinitions.some((unit) => unit.id === unitTypeId));
  world.allowedUpgradeTypes = normalizeStringArray(save.world.allowedUpgradeTypes, map.allowedUpgradeTypes ?? [])
    .filter((upgradeId) => world.upgradeDefinitions.some((upgrade) => upgrade.id === upgradeId));
  world.matchState = normalizeMatchState(save.world.matchState, world);
  world.events = [];
  world.lastHelpTickByPlayer = normalizeTickRecord(save.world.lastHelpTickByPlayer, world);
  world.lastHelpLocationByPlayer = normalizeHelpLocationRecord(save.world.lastHelpLocationByPlayer, world);
  world.nextUnitSerial = Math.max(Math.floor(finiteNumberOr(save.world.nextUnitSerial, world.nextUnitSerial)), inferNextUnitSerial(world));
  world.elapsed = Math.max(0, finiteNumberOr(save.world.elapsed, 0));
  world.tick = savedTick;
  world.tickRate = Math.max(1, Math.min(120, finiteNumberOr(save.world.tickRate, 30)));
  world.accumulator = Math.max(0, Math.min(sourceFrameSecondsForSave(world), finiteNumberOr(save.world.accumulator, 0)));
  pruneInvalidLoadedReferences(world);
  restoreIdleOnReadyOrders(world);
  updateVisibility(world);
  const camera = normalizeCamera(save.camera);
  const sourceViewportCameras = normalizeSourceViewportCameras(save.sourceViewportCameras, camera);
  return { world, map, camera: camera, activeSourceViewportIndex: normalizeSourceViewportIndex(save.activeSourceViewportIndex, sourceViewportCameras.length), sourceViewportCameras, controlGroups: normalizeControlGroups(save.controlGroups ?? {}, world) };
}

export function getSavedGameSummary(slot = 1): SavedGameSummary | null {
  const raw = safeStorageGet(saveKeyForSlot(slot)) ?? (slot === 1 ? safeStorageGet(LEGACY_SAVE_KEY) : null);
  return getSavedGameSummaryFromRaw(raw, slot);
}

export function getAutosaveSummary(): SavedGameSummary | null {
  return getSavedGameSummaryFromRaw(safeStorageGet(AUTOSAVE_KEY), 0);
}

function getSavedGameSummaryFromRaw(raw: string | null, slot: number): SavedGameSummary | null {
  if (!raw) {
    return null;
  }
  const save = parseSavedGame(raw);
  if (!save) {
    return null;
  }
  return { savedAt: save.savedAt, mapPath: save.mapPath, slot };
}

export function getSavedGameSummaries(slotCount = 3): SavedGameSummary[] {
  const summaries: SavedGameSummary[] = [];
  for (let slot = 1; slot <= slotCount; slot += 1) {
    const summary = getSavedGameSummary(slot);
    if (summary) {
      summaries.push(summary);
    }
  }
  return summaries;
}

function saveKeyForSlot(slot: number): string {
  return `${SAVE_SLOT_PREFIX}${Math.max(1, Math.floor(slot))}`;
}

function safeStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function normalizeControlGroups(controlGroups: Record<number, string[]>, world: WorldState): Record<number, string[]> {
  const normalized: Record<number, string[]> = {};
  for (const [group, ids] of Object.entries(controlGroups)) {
    const groupNumber = Number(group);
    if (!Number.isInteger(groupNumber) || groupNumber < 0 || groupNumber > 9 || !Array.isArray(ids)) {
      continue;
    }
    const liveIds = ids.filter((id) => unitIdExistsForPlayerIncludingCargo(world, id, world.visibilityPlayer));
    if (liveIds.length > 0) {
      normalized[groupNumber] = [...new Set(liveIds)].slice(0, 12);
    }
  }
  return normalized;
}

function normalizeCamera(value: unknown): { x: number; y: number; zoom: number } {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    x: Math.max(0, finiteNumberOr(record.x, 0)),
    y: Math.max(0, finiteNumberOr(record.y, 0)),
    zoom: Math.max(0.5, Math.min(2.5, finiteNumberOr(record.zoom, 1)))
  };
}

function normalizeSourceViewportCameraSave(sourceViewportState: SourceViewportCameraSaveState | undefined, camera: { x: number; y: number; zoom: number }): SourceViewportCameraSaveState {
  const sourceViewportCameras = normalizeSourceViewportCameras(sourceViewportState?.sourceViewportCameras, camera);
  return {
    activeSourceViewportIndex: normalizeSourceViewportIndex(sourceViewportState?.activeSourceViewportIndex, sourceViewportCameras.length),
    sourceViewportCameras
  };
}

function normalizeSourceViewportCameras(value: unknown, fallbackCamera: { x: number; y: number; zoom: number }): Array<{ x: number; y: number; zoom: number }> {
  const cameras = Array.isArray(value)
    ? value
      .slice(0, 4)
      .map((entry) => normalizeCamera(entry))
    : [];
  if (cameras.length === 0) {
    cameras.push({ x: fallbackCamera.x, y: fallbackCamera.y, zoom: fallbackCamera.zoom });
  }
  return cameras;
}

function normalizeSourceViewportIndex(value: unknown, cameraCount: number): number {
  const maxIndex = Math.max(0, cameraCount - 1);
  return Math.max(0, Math.min(maxIndex, Math.floor(finiteNumberOr(value, 0))));
}

function mutableEngineSettingsForSave(world: WorldState): MutableEngineSettingsSave {
  return {
    effectsEnabledDefault: world.engineSettings.effectsEnabledDefault,
    effectsVolumeDefault: world.engineSettings.effectsVolumeDefault,
    musicEnabledDefault: world.engineSettings.musicEnabledDefault,
    musicVolumeDefault: world.engineSettings.musicVolumeDefault,
    stereoSoundDefault: world.engineSettings.stereoSoundDefault,
    lastDifficultyDefault: world.engineSettings.lastDifficultyDefault,
    sourceGameSpeedDefault: world.engineSettings.sourceGameSpeedDefault,
    showMessagesDefault: world.engineSettings.showMessagesDefault,
    showTipsDefault: world.engineSettings.showTipsDefault,
    tipNumberDefault: world.engineSettings.tipNumberDefault,
    showCommandKeyDefault: world.engineSettings.showCommandKeyDefault,
    showButtonPopupsDefault: world.engineSettings.showButtonPopupsDefault,
    mapGridDefault: world.engineSettings.mapGridDefault,
    showNameDelayTicksDefault: world.engineSettings.showNameDelayTicksDefault,
    showNameTimeTicksDefault: world.engineSettings.showNameTimeTicksDefault,
    showNoSelectionStatsDefault: world.engineSettings.showNoSelectionStatsDefault,
    noStatusLineTooltipsDefault: world.engineSettings.noStatusLineTooltipsDefault,
    showOrdersDefault: world.engineSettings.showOrdersDefault,
    showDamageDefault: world.engineSettings.showDamageDefault,
    showSightRangeDefault: world.engineSettings.showSightRangeDefault,
    showAttackRangeDefault: world.engineSettings.showAttackRangeDefault,
    showReactionRangeDefault: world.engineSettings.showReactionRangeDefault,
    autosaveMinutesDefault: world.engineSettings.autosaveMinutesDefault,
    debugFlagsDefault: world.engineSettings.debugFlagsDefault,
    damageMissileId: world.engineSettings.damageMissileId,
    minimapWithTerrainDefault: world.engineSettings.minimapWithTerrainDefault,
    mineNotificationsDefault: world.engineSettings.mineNotificationsDefault,
    enableKeyboardScrollingDefault: world.engineSettings.enableKeyboardScrollingDefault,
    enableMouseScrollingDefault: world.engineSettings.enableMouseScrollingDefault,
    groupKeysDefault: world.engineSettings.groupKeysDefault,
    fastForwardCycleDefault: world.engineSettings.fastForwardCycleDefault,
    frameSkipDefault: world.engineSettings.frameSkipDefault,
    formationMovementDefault: world.engineSettings.formationMovementDefault,
    bigScreenDefault: world.engineSettings.bigScreenDefault,
    grayscaleIconsDefault: world.engineSettings.grayscaleIconsDefault,
    aiChecksDependenciesDefault: world.engineSettings.aiChecksDependenciesDefault,
    aiExploresDefault: world.engineSettings.aiExploresDefault,
    insideDefault: world.engineSettings.insideDefault,
    revealMapMode: world.engineSettings.revealMapMode,
    allyDepositsAllowedDefault: world.engineSettings.allyDepositsAllowedDefault,
    keyScrollSpeedDefault: world.engineSettings.keyScrollSpeedDefault,
    mouseScrollSpeedDefault: world.engineSettings.mouseScrollSpeedDefault,
    mouseScrollSpeedPressedDefault: world.engineSettings.mouseScrollSpeedPressedDefault,
    mouseScrollSpeedControlDefault: world.engineSettings.mouseScrollSpeedControlDefault,
    keepRatioDefault: world.engineSettings.keepRatioDefault,
    playerNameDefault: world.engineSettings.playerNameDefault,
    videoFullScreenDefault: world.engineSettings.videoFullScreenDefault,
    videoHeightDefault: world.engineSettings.videoHeightDefault,
    videoShaderDefault: world.engineSettings.videoShaderDefault,
    videoWidthDefault: world.engineSettings.videoWidthDefault,
    viewportModeDefault: world.engineSettings.viewportModeDefault,
    grabMouseDefault: world.engineSettings.grabMouseDefault,
    hardwareCursorDefault: world.engineSettings.hardwareCursorDefault,
    highlightPassabilityDefault: world.engineSettings.highlightPassabilityDefault,
    iconsShiftDefault: world.engineSettings.iconsShiftDefault,
    rightButtonAction: world.engineSettings.rightButtonAction,
    deselectInMineDefault: world.engineSettings.deselectInMineDefault,
    simplifiedAutoTargetingDefault: world.engineSettings.simplifiedAutoTargetingDefault,
    useFancyBuildingsDefault: world.engineSettings.useFancyBuildingsDefault,
    enhancedEffectsDefault: world.engineSettings.enhancedEffectsDefault,
    pauseOnLeaveDefault: world.engineSettings.pauseOnLeaveDefault,
    leaveStopScrollingDefault: world.engineSettings.leaveStopScrollingDefault,
    trainingQueue: world.engineSettings.trainingQueue,
    selectionStyleDefault: world.engineSettings.selectionStyleDefault,
    selectionRectangleIndicatesDamageDefault: world.engineSettings.selectionRectangleIndicatesDamageDefault,
    doubleClickDelayMsDefault: world.engineSettings.doubleClickDelayMsDefault,
    holdClickDelayMsDefault: world.engineSettings.holdClickDelayMsDefault
  };
}

function applyMutableEngineSettingsSave(world: WorldState, value: unknown): void {
  const record = value && typeof value === "object" ? value as Partial<Record<keyof MutableEngineSettingsSave, unknown>> : {};
  world.engineSettings.effectsEnabledDefault = booleanOr(record.effectsEnabledDefault, world.engineSettings.effectsEnabledDefault);
  world.engineSettings.musicEnabledDefault = booleanOr(record.musicEnabledDefault, world.engineSettings.musicEnabledDefault);
  world.engineSettings.stereoSoundDefault = booleanOr(record.stereoSoundDefault, world.engineSettings.stereoSoundDefault);
  world.engineSettings.lastDifficultyDefault = sourceDifficultyOr(record.lastDifficultyDefault, world.engineSettings.lastDifficultyDefault);
  world.engineSettings.sourceGameSpeedDefault = sourceGameSpeedOr(record.sourceGameSpeedDefault, world.engineSettings.sourceGameSpeedDefault);
  world.engineSettings.showMessagesDefault = booleanOr(record.showMessagesDefault, world.engineSettings.showMessagesDefault);
  world.engineSettings.showTipsDefault = booleanOr(record.showTipsDefault, world.engineSettings.showTipsDefault);
  world.engineSettings.tipNumberDefault = nonNegativeIntegerOr(record.tipNumberDefault, world.engineSettings.tipNumberDefault);
  world.engineSettings.showCommandKeyDefault = booleanOr(record.showCommandKeyDefault, world.engineSettings.showCommandKeyDefault);
  world.engineSettings.showButtonPopupsDefault = booleanOr(record.showButtonPopupsDefault, world.engineSettings.showButtonPopupsDefault);
  world.engineSettings.mapGridDefault = booleanOr(record.mapGridDefault, world.engineSettings.mapGridDefault);
  world.engineSettings.showNameDelayTicksDefault = nonNegativeIntegerOr(record.showNameDelayTicksDefault, world.engineSettings.showNameDelayTicksDefault);
  world.engineSettings.showNameTimeTicksDefault = nonNegativeIntegerOr(record.showNameTimeTicksDefault, world.engineSettings.showNameTimeTicksDefault);
  world.engineSettings.showNoSelectionStatsDefault = booleanOr(record.showNoSelectionStatsDefault, world.engineSettings.showNoSelectionStatsDefault);
  world.engineSettings.noStatusLineTooltipsDefault = booleanOr(record.noStatusLineTooltipsDefault, world.engineSettings.noStatusLineTooltipsDefault);
  world.engineSettings.showOrdersDefault = booleanOr(record.showOrdersDefault, world.engineSettings.showOrdersDefault);
  world.engineSettings.showDamageDefault = booleanOr(record.showDamageDefault, world.engineSettings.showDamageDefault);
  world.engineSettings.showSightRangeDefault = booleanOr(record.showSightRangeDefault, world.engineSettings.showSightRangeDefault);
  world.engineSettings.showAttackRangeDefault = booleanOr(record.showAttackRangeDefault, world.engineSettings.showAttackRangeDefault);
  world.engineSettings.showReactionRangeDefault = booleanOr(record.showReactionRangeDefault, world.engineSettings.showReactionRangeDefault);
  world.engineSettings.autosaveMinutesDefault = nonNegativeIntegerOr(record.autosaveMinutesDefault, world.engineSettings.autosaveMinutesDefault);
  world.engineSettings.debugFlagsDefault = sourceDebugFlagsOr(record.debugFlagsDefault, world.engineSettings.debugFlagsDefault);
  world.engineSettings.damageMissileId = damageMissileIdOr(world, record.damageMissileId, world.engineSettings.damageMissileId);
  if (world.engineSettings.showDamageDefault && !world.engineSettings.damageMissileId) {
    world.engineSettings.damageMissileId = damageMissileIdOr(world, world.engineSettings.sourceDamageMissileId, null);
  }
  world.engineSettings.minimapWithTerrainDefault = booleanOr(record.minimapWithTerrainDefault, world.engineSettings.minimapWithTerrainDefault);
  world.engineSettings.mineNotificationsDefault = booleanOr(record.mineNotificationsDefault, world.engineSettings.mineNotificationsDefault);
  world.engineSettings.enableKeyboardScrollingDefault = booleanOr(record.enableKeyboardScrollingDefault, world.engineSettings.enableKeyboardScrollingDefault);
  world.engineSettings.enableMouseScrollingDefault = booleanOr(record.enableMouseScrollingDefault, world.engineSettings.enableMouseScrollingDefault);
  world.engineSettings.groupKeysDefault = sourceGroupKeysOr(record.groupKeysDefault, world.engineSettings.groupKeysDefault);
  world.engineSettings.fastForwardCycleDefault = sourceFastForwardCycleOr(record.fastForwardCycleDefault, world.engineSettings.fastForwardCycleDefault);
  world.engineSettings.frameSkipDefault = sourceFrameSkipOr(record.frameSkipDefault, world.engineSettings.frameSkipDefault);
  world.engineSettings.formationMovementDefault = booleanOr(record.formationMovementDefault, world.engineSettings.formationMovementDefault);
  world.engineSettings.bigScreenDefault = booleanOr(record.bigScreenDefault, world.engineSettings.bigScreenDefault);
  world.engineSettings.grayscaleIconsDefault = booleanOr(record.grayscaleIconsDefault, world.engineSettings.grayscaleIconsDefault);
  world.engineSettings.aiChecksDependenciesDefault = booleanOr(record.aiChecksDependenciesDefault, world.engineSettings.aiChecksDependenciesDefault);
  world.engineSettings.aiExploresDefault = booleanOr(record.aiExploresDefault, world.engineSettings.aiExploresDefault);
  world.engineSettings.insideDefault = booleanOr(record.insideDefault, world.engineSettings.insideDefault);
  world.engineSettings.revealMapMode = sourceRevealMapModeOr(record.revealMapMode, world.engineSettings.revealMapMode);
  world.engineSettings.allyDepositsAllowedDefault = booleanOr(record.allyDepositsAllowedDefault, world.engineSettings.allyDepositsAllowedDefault);
  world.engineSettings.keyScrollSpeedDefault = sourceScrollSpeedOr(record.keyScrollSpeedDefault, world.engineSettings.keyScrollSpeedDefault, 30);
  world.engineSettings.mouseScrollSpeedDefault = sourceScrollSpeedOr(record.mouseScrollSpeedDefault, world.engineSettings.mouseScrollSpeedDefault, 10);
  world.engineSettings.mouseScrollSpeedPressedDefault = sourceScrollSpeedOr(record.mouseScrollSpeedPressedDefault, world.engineSettings.mouseScrollSpeedPressedDefault, 30);
  world.engineSettings.mouseScrollSpeedControlDefault = sourceScrollSpeedOr(record.mouseScrollSpeedControlDefault, world.engineSettings.mouseScrollSpeedControlDefault, 60);
  world.engineSettings.keepRatioDefault = booleanOr(record.keepRatioDefault, world.engineSettings.keepRatioDefault);
  world.engineSettings.playerNameDefault = sourcePlayerNameOr(record.playerNameDefault, world.engineSettings.playerNameDefault);
  world.engineSettings.videoFullScreenDefault = booleanOr(record.videoFullScreenDefault, world.engineSettings.videoFullScreenDefault);
  world.engineSettings.videoHeightDefault = sourceVideoDimensionOr(record.videoHeightDefault, world.engineSettings.videoHeightDefault);
  world.engineSettings.videoShaderDefault = sourceVideoShaderOr(record.videoShaderDefault, world.engineSettings.videoShaderDefault);
  world.engineSettings.videoWidthDefault = sourceVideoDimensionOr(record.videoWidthDefault, world.engineSettings.videoWidthDefault);
  world.engineSettings.viewportModeDefault = sourceViewportModeOr(record.viewportModeDefault, world.engineSettings.viewportModeDefault);
  world.engineSettings.grabMouseDefault = booleanOr(record.grabMouseDefault, world.engineSettings.grabMouseDefault);
  world.engineSettings.hardwareCursorDefault = booleanOr(record.hardwareCursorDefault, world.engineSettings.hardwareCursorDefault);
  world.engineSettings.highlightPassabilityDefault = booleanOr(record.highlightPassabilityDefault, world.engineSettings.highlightPassabilityDefault);
  world.engineSettings.iconsShiftDefault = booleanOr(record.iconsShiftDefault, world.engineSettings.iconsShiftDefault);
  world.engineSettings.rightButtonAction = sourceRightButtonActionOr(record.rightButtonAction, world.engineSettings.rightButtonAction);
  world.engineSettings.deselectInMineDefault = booleanOr(record.deselectInMineDefault, world.engineSettings.deselectInMineDefault);
  world.engineSettings.simplifiedAutoTargetingDefault = booleanOr(record.simplifiedAutoTargetingDefault, world.engineSettings.simplifiedAutoTargetingDefault);
  world.engineSettings.useFancyBuildingsDefault = booleanOr(record.useFancyBuildingsDefault, world.engineSettings.useFancyBuildingsDefault);
  world.engineSettings.enhancedEffectsDefault = booleanOr(record.enhancedEffectsDefault, world.engineSettings.enhancedEffectsDefault);
  world.engineSettings.pauseOnLeaveDefault = booleanOr(record.pauseOnLeaveDefault, world.engineSettings.pauseOnLeaveDefault);
  world.engineSettings.leaveStopScrollingDefault = booleanOr(record.leaveStopScrollingDefault, world.engineSettings.leaveStopScrollingDefault);
  world.engineSettings.trainingQueue = booleanOr(record.trainingQueue, world.engineSettings.trainingQueue);
  world.engineSettings.selectionStyleDefault = selectionStyleOr(record.selectionStyleDefault, world.engineSettings.selectionStyleDefault);
  world.engineSettings.selectionRectangleIndicatesDamageDefault = booleanOr(record.selectionRectangleIndicatesDamageDefault, world.engineSettings.selectionRectangleIndicatesDamageDefault);
  world.engineSettings.doubleClickDelayMsDefault = sourceDelayMsOr(record.doubleClickDelayMsDefault, world.engineSettings.doubleClickDelayMsDefault, 120, 1000);
  world.engineSettings.holdClickDelayMsDefault = sourceDelayMsOr(record.holdClickDelayMsDefault, world.engineSettings.holdClickDelayMsDefault, 0, 3000);
  world.engineSettings.effectsVolumeDefault = sourceVolumeOr(record.effectsVolumeDefault, world.engineSettings.effectsVolumeDefault);
  world.engineSettings.musicVolumeDefault = sourceVolumeOr(record.musicVolumeDefault, world.engineSettings.musicVolumeDefault);
}

function normalizePlayers(value: unknown, world: WorldState): WorldState["players"] {
  const fallbackPlayers = world.players;
  const source = Array.isArray(value) && value.length > 0 ? value : fallbackPlayers;
  const fallbackById = new Map(fallbackPlayers.map((player) => [player.id, player]));
  const seen = new Set<number>();
  const players: WorldState["players"] = [];

  for (const entry of source) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const id = Math.floor(finiteNumberOr(record.id, -1));
    if (!Number.isInteger(id) || id < 0 || id > 15 || seen.has(id)) {
      continue;
    }
    const fallback = fallbackById.get(id);
    const startPoint = normalizeWorldPoint(
      world,
      finiteNumberOr(record.startX, fallback?.startX ?? 0),
      finiteNumberOr(record.startY, fallback?.startY ?? 0)
    );
    players.push({
      id,
      resources: normalizeResources(record.resources, fallback?.resources),
      speedFactors: normalizeSpeedFactors(record.speedFactors, fallback?.speedFactors ?? world.engineSettings.speedFactors),
      stats: normalizePlayerStats(record.stats),
      name: normalizeNullableString(record.name, fallback?.name ?? null),
      race: normalizeNullableString(record.race, fallback?.race ?? null),
      ai: normalizeNullableString(record.ai, fallback?.ai ?? null),
      playerType: normalizeNullableString(record.playerType, fallback?.playerType ?? null),
      startX: startPoint.x,
      startY: startPoint.y
    });
    seen.add(id);
  }

  if (!Array.isArray(value) || players.length === 0) {
    for (const fallback of fallbackPlayers) {
      if (!seen.has(fallback.id)) {
        players.push({
          ...fallback,
          resources: normalizeResources(fallback.resources),
          speedFactors: normalizeSpeedFactors(fallback.speedFactors, world.engineSettings.speedFactors),
          stats: normalizePlayerStats(fallback.stats)
        });
      }
    }
  }

  return players.length > 0 ? players.sort((left, right) => left.id - right.id) : fallbackPlayers;
}

function normalizeVisibilityPlayer(value: unknown, world: WorldState): number {
  const playerId = Math.floor(finiteNumberOr(value, world.visibilityPlayer));
  return world.players.some((player) => player.id === playerId) ? playerId : world.players[0]?.id ?? 0;
}

function normalizeMatchState(value: unknown, world: WorldState): WorldState["matchState"] {
  if (!value || typeof value !== "object") {
    return { status: "playing", winner: null, endedTick: null };
  }
  const record = value as Record<string, unknown>;
  if (record.status === "playing") {
    return { status: "playing", winner: null, endedTick: null };
  }
  if (record.status !== "victory" && record.status !== "defeat" && record.status !== "draw") {
    return { status: "playing", winner: null, endedTick: null };
  }
  const winner = finiteNullableNumber(record.winner);
  const normalizedWinner = winner !== null && world.players.some((player) => player.id === winner) ? winner : null;
  const endedTick = Math.max(0, Math.floor(finiteNumberOr(record.endedTick, world.tick)));
  return { status: record.status, winner: normalizedWinner, endedTick };
}

function normalizeTickRecord(value: unknown, world: WorldState): Record<number, number> {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const normalized: Record<number, number> = {};
  for (const [key, tick] of Object.entries(record)) {
    const player = Number(key);
    const valueTick = finiteNullableNumber(tick);
    if (Number.isInteger(player) && isValidPlayerId(world, player) && valueTick !== null) {
      normalized[player] = Math.max(0, Math.floor(valueTick));
    }
  }
  return normalized;
}

function normalizeHelpLocationRecord(value: unknown, world: WorldState): WorldState["lastHelpLocationByPlayer"] {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const normalized: WorldState["lastHelpLocationByPlayer"] = {};
  const maxX = world.map.width * world.tileSize;
  const maxY = world.map.height * world.tileSize;
  for (const [key, rawLocation] of Object.entries(record)) {
    const player = Number(key);
    const location = rawLocation && typeof rawLocation === "object" ? rawLocation as Record<string, unknown> : {};
    const x = finiteNullableNumber(location.x);
    const y = finiteNullableNumber(location.y);
    if (!Number.isInteger(player) || !isValidPlayerId(world, player) || x === null || y === null) {
      continue;
    }
    normalized[player] = {
      x: Math.max(0, Math.min(maxX, x)),
      y: Math.max(0, Math.min(maxY, y))
    };
  }
  return normalized;
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  const source = Array.isArray(value) ? value : fallback;
  return [...new Set(source.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0))];
}

function normalizeResourceNameArray(value: unknown, fallback: string[], world: WorldState): string[] {
  const resourceNames = sourceResourceNameSet(world);
  return normalizeStringArray(value, fallback).filter((resource) => resourceNames.has(resource));
}

function sourceResourceNameSet(world: WorldState): Set<string> {
  return new Set([
    ...world.engineSettings.defaultResourceNames,
    ...world.unitDefinitions.flatMap((unit) => [
      ...(unit.gatherResources ?? []),
      ...(unit.storesResources ?? []),
      ...(unit.repairCosts ?? []),
      ...(unit.givesResource ? [unit.givesResource] : []),
      ...Object.keys(unit.resourceCapacity ?? {}),
      ...Object.keys(unit.resourceStep ?? {}),
      ...Object.keys(unit.waitAtResource ?? {}),
      ...Object.keys(unit.waitAtDepot ?? {}),
      ...Object.keys(unit.improveProduction ?? {})
    ])
  ]);
}

function normalizeNullableResourceName(value: unknown, fallback: string | null, world: WorldState): string | null {
  const normalized = normalizeResourceNameArray(typeof value === "string" ? [value] : [], fallback ? [fallback] : [], world);
  return normalized[0] ?? null;
}

function normalizeSourcePositiveResourceMap(value: Record<string, number> | undefined, world: WorldState): Record<string, number> {
  return filterResourceMap(normalizePositiveResourceMap(value), world);
}

function normalizeSourceResourceCapacity(value: Record<string, number> | undefined, world: WorldState): Record<string, number> {
  return filterResourceMap(normalizeResourceCapacity(value), world);
}

function normalizeSourceImproveProduction(value: Record<string, number> | undefined, world: WorldState): Record<string, number> {
  return filterResourceMap(normalizeImproveProduction(value), world);
}

function filterResourceMap(value: Record<string, number>, world: WorldState): Record<string, number> {
  const resourceNames = sourceResourceNameSet(world);
  return Object.fromEntries(Object.entries(value).filter(([resource]) => resourceNames.has(resource)));
}

function normalizeNullableUnitTypeId(value: unknown, fallback: string | null, world: WorldState): string | null {
  const unitTypeIds = new Set(world.unitDefinitions.map((definition) => definition.id));
  return normalizeNullableFromSet(value, fallback, unitTypeIds);
}

function normalizeNullableMissileId(value: unknown, fallback: string | null, world: WorldState): string | null {
  const missileIds = new Set(world.missileDefinitions.map((definition) => definition.id));
  return normalizeNullableFromSet(value, fallback, missileIds);
}

function normalizeNullableConstructionTypeId(value: unknown, fallback: string | null, world: WorldState): string | null {
  const constructionTypeIds = new Set(world.unitDefinitions.flatMap((definition) => definition.constructionTypeId ? [definition.constructionTypeId] : []));
  return normalizeNullableFromSet(value, fallback, constructionTypeIds);
}

function normalizeNullableSourceUnitAction(value: unknown, fallback: string | null, world: WorldState): string | null {
  const sourceActions = new Set(world.unitDefinitions.flatMap((definition) => definition.onReady ? [definition.onReady] : []));
  return normalizeNullableFromSet(value, fallback, sourceActions);
}

function normalizeNullableRightMouseAction(value: unknown, fallback: string | null, world: WorldState): string | null {
  const rightMouseActions = new Set(world.unitDefinitions.flatMap((definition) => definition.rightMouseAction ? [definition.rightMouseAction] : []));
  return normalizeNullableFromSet(value, fallback, rightMouseActions);
}

function normalizeNullableFromSet(value: unknown, fallback: string | null, allowed: Set<string>): string | null {
  if (typeof value === "string" && allowed.has(value)) {
    return value;
  }
  return fallback && allowed.has(fallback) ? fallback : null;
}

function normalizeSpellIdArray(value: unknown, fallback: string[], world: WorldState): string[] {
  const spellIds = new Set(world.spellDefinitions.map((spell) => spell.id));
  return normalizeStringArray(value, fallback).filter((spellId) => spellIds.has(spellId));
}

function normalizeTransportRules(value: unknown, fallback: string[], world: WorldState): string[] {
  const transportRules = new Set(world.unitDefinitions.flatMap((unit) => unit.canTransport ?? []));
  return normalizeStringArray(value, fallback).filter((rule) => transportRules.has(rule));
}

function normalizeAutoCastSpells(value: unknown, canCastSpells: string[], world: WorldState): string[] {
  const castable = new Set(canCastSpells);
  return normalizeStringArray(value, [])
    .filter((spellId) => castable.has(spellId))
    .filter((spellId) => world.spellDefinitions.some((spell) => spell.id === spellId && spell.autocast.length > 0));
}

function normalizeNullableString(value: unknown, fallback: string | null): string | null {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeTeleportDestinationId(value: unknown, world: WorldState): string | null {
  const normalized = normalizeNullableString(value, null);
  if (!normalized) {
    return null;
  }
  const destination = world.units.find((unit) => unit.id === normalized);
  return destination && destination.hitPoints > 0 ? destination.id : null;
}

function normalizeAllowRules(value: unknown, fallback: WorldState["allowOverrides"], world: WorldState): WorldState["allowOverrides"] {
  const source = Array.isArray(value) ? value : fallback;
  const ids = new Set([...world.unitDefinitions.map((unit) => unit.id), ...world.upgradeDefinitions.map((upgrade) => upgrade.id)]);
  return source
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const id = normalizeNullableString(record.id, null);
      const flags = normalizeNullableString(record.flags, null);
      if (!id || !flags || !ids.has(id) || !/^[AFR]+$/.test(flags)) {
        return null;
      }
      return { id, flags };
    })
    .filter((entry): entry is WorldState["allowOverrides"][number] => entry !== null);
}

function normalizeResearchedUpgrades(value: unknown, world: WorldState): WorldState["researchedUpgrades"] {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const upgradeIds = new Set(world.upgradeDefinitions.map((upgrade) => upgrade.id));
  const playerIds = new Set(world.players.map((player) => player.id));
  const normalized: WorldState["researchedUpgrades"] = {};
  for (const [playerKey, upgrades] of Object.entries(record)) {
    const playerId = Number(playerKey);
    if (!Number.isInteger(playerId) || !playerIds.has(playerId) || !Array.isArray(upgrades)) {
      continue;
    }
    const validUpgrades = [...new Set(upgrades.filter((upgradeId): upgradeId is string => typeof upgradeId === "string" && upgradeIds.has(upgradeId)))];
    if (validUpgrades.length > 0) {
      normalized[playerId] = validUpgrades;
    }
  }
  return normalized;
}

function applyLoadedResearchStateToUnits(world: WorldState): void {
  for (const unit of loadedUnitsIncludingCargo(world)) {
    applyResearchedUpgradesToUnit(world, unit);
  }
}

function loadedUnitsIncludingCargo(world: WorldState): WorldState["units"] {
  const units: WorldState["units"] = [];
  const collect = (unit: WorldState["units"][number]): void => {
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

function normalizeVictoryRequirements(value: unknown, fallback: WorldState["victoryRequirements"], world: WorldState): WorldState["victoryRequirements"] {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      if (record.kind === "unit-count") {
        if (typeof record.unitTypeId !== "string" || !world.unitDefinitions.some((unit) => unit.id === record.unitTypeId)) {
          return null;
        }
        const minimum = Math.max(1, Math.floor(finiteNumberOr(record.minimum, 1)));
        return { kind: "unit-count" as const, unitTypeId: record.unitTypeId, minimum };
      }
      if (record.kind === "unit-count-exact") {
        if (typeof record.unitTypeId !== "string" || !world.unitDefinitions.some((unit) => unit.id === record.unitTypeId)) {
          return null;
        }
        const count = Math.max(0, Math.floor(finiteNumberOr(record.count, 0)));
        return { kind: "unit-count-exact" as const, unitTypeId: record.unitTypeId, count };
      }
      if (record.kind === "unit-destroyed") {
        if (typeof record.unitTypeId !== "string" || !world.unitDefinitions.some((unit) => unit.id === record.unitTypeId)) {
          return null;
        }
        const player = Math.floor(finiteNumberOr(record.player, -1));
        return isValidPlayerId(world, player, true)
          ? { kind: "unit-destroyed" as const, unitTypeId: record.unitTypeId, player }
          : null;
      }
      if (record.kind === "player-defeated") {
        const player = Math.floor(finiteNumberOr(record.player, -1));
        return isValidPlayerId(world, player, true)
          ? { kind: "player-defeated" as const, player }
          : null;
      }
      if (record.kind === "opponents-defeated") {
        return { kind: "opponents-defeated" as const };
      }
      return null;
    })
    .filter((entry): entry is WorldState["victoryRequirements"][number] => entry !== null);
}

function normalizeVictoryRequirementGroups(value: unknown, fallback: WorldState["victoryRequirementGroups"], world: WorldState): WorldState["victoryRequirementGroups"] {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const clauses = normalizeVictoryRequirements((entry as Record<string, unknown>).clauses, [], world);
      return clauses.length > 0 ? { clauses } : null;
    })
    .filter((entry): entry is WorldState["victoryRequirementGroups"][number] => entry !== null);
}

function normalizeDefeatRequirements(value: unknown, fallback: WorldState["defeatRequirements"], world: WorldState): WorldState["defeatRequirements"] {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      if (record.kind === "player-defeated") {
        const player = normalizeSourceRequirementPlayer(record.player, world);
        return player !== null ? { kind: "player-defeated" as const, player } : null;
      }
      if (record.kind === "unit-group-destroyed") {
        if (typeof record.unitTypeId !== "string" || !world.unitDefinitions.some((unit) => unit.id === record.unitTypeId)) {
          return null;
        }
        const players = normalizeSourceRequirementPlayers(record.players, world);
        return players.length > 0 ? { kind: "unit-group-destroyed" as const, unitTypeId: record.unitTypeId, players } : null;
      }
      if (record.kind === "unit-count-below") {
        if (typeof record.unitTypeId !== "string" || !world.unitDefinitions.some((unit) => unit.id === record.unitTypeId)) {
          return null;
        }
        const players = normalizeSourceRequirementPlayers(record.players, world);
        const threshold = Math.max(1, Math.floor(finiteNumberOr(record.threshold, 1)));
        return players.length > 0 ? { kind: "unit-count-below" as const, unitTypeId: record.unitTypeId, players, threshold } : null;
      }
      return null;
    })
    .filter((entry): entry is WorldState["defeatRequirements"][number] => entry !== null);
}

function normalizeTimedVictoryTriggers(value: unknown, fallback: WorldState["timedVictoryTriggers"]): WorldState["timedVictoryTriggers"] {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      if (record.kind !== "circle-of-power") {
        return null;
      }
      const delayTicks = Math.max(0, Math.floor(finiteNumberOr(record.delayTicks, 0)));
      const soundId = typeof record.soundId === "string" && record.soundId.trim().length > 0 ? record.soundId : null;
      return { kind: "circle-of-power" as const, delayTicks, soundId };
    })
    .filter((entry): entry is WorldState["timedVictoryTriggers"][number] => entry !== null);
}

function normalizeLocationBuildRequirements(value: unknown, fallback: WorldState["locationBuildRequirements"]): WorldState["locationBuildRequirements"] {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      if (!Array.isArray(record.clauses)) {
        return null;
      }
      const clauses = record.clauses
        .map((clause) => {
          if (!clause || typeof clause !== "object") {
            return null;
          }
          const clauseRecord = clause as Record<string, unknown>;
          const player = clauseRecord.player === "self" ? "self" : Math.floor(finiteNumberOr(clauseRecord.player, -1));
          if (player !== "self" && player < 0) {
            return null;
          }
          if (typeof clauseRecord.unitTypeId !== "string" || !clauseRecord.unitTypeId.startsWith("unit-")) {
            return null;
          }
          return {
            player,
            unitTypeId: clauseRecord.unitTypeId,
            minX: Math.floor(finiteNumberOr(clauseRecord.minX, 0)),
            minY: Math.floor(finiteNumberOr(clauseRecord.minY, 0)),
            maxX: Math.floor(finiteNumberOr(clauseRecord.maxX, 0)),
            maxY: Math.floor(finiteNumberOr(clauseRecord.maxY, 0)),
            minimum: Math.max(1, Math.floor(finiteNumberOr(clauseRecord.minimum, 1)))
          };
        })
        .filter((clause): clause is WorldState["locationBuildRequirements"][number]["clauses"][number] => clause !== null);
      return clauses.length > 0 ? { clauses } : null;
    })
    .filter((entry): entry is WorldState["locationBuildRequirements"][number] => entry !== null);
}

function normalizePendingTimedVictory(value: unknown, triggers: WorldState["timedVictoryTriggers"]): WorldState["pendingTimedVictory"] {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const triggerIndex = Math.floor(finiteNumberOr(record.triggerIndex, -1));
  if (triggerIndex < 0 || triggerIndex >= triggers.length) {
    return null;
  }
  const sourceDelayTicks = Math.max(0, Math.floor(triggers[triggerIndex]?.delayTicks ?? 0));
  return {
    triggerIndex,
    remainingTicks: Math.max(0, Math.min(sourceDelayTicks, Math.floor(finiteNumberOr(record.remainingTicks, sourceDelayTicks)))),
    soundPlayed: record.soundPlayed === true
  };
}

function normalizeCircleOfPowerRequirements(value: unknown, fallback: WorldState["circleOfPowerRequirements"]): WorldState["circleOfPowerRequirements"] {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      if (typeof record.unitTypeId !== "string" || typeof record.circleTypeId !== "string") {
        return null;
      }
      if (!record.unitTypeId.startsWith("unit-") || !record.circleTypeId.startsWith("unit-")) {
        return null;
      }
      return {
        unitTypeId: record.unitTypeId,
        circleTypeId: record.circleTypeId,
        minimum: Math.max(1, Math.floor(finiteNumberOr(record.minimum, 1)))
      };
    })
    .filter((entry): entry is WorldState["circleOfPowerRequirements"][number] => entry !== null);
}

function normalizeRescuedCircleRequirements(value: unknown, fallback: WorldState["rescuedCircleRequirements"]): WorldState["rescuedCircleRequirements"] {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      if (!Array.isArray(record.unitTypeIds) || typeof record.circleTypeId !== "string") {
        return null;
      }
      const unitTypeIds = [...new Set(record.unitTypeIds.filter((typeId): typeId is string => typeof typeId === "string" && typeId.startsWith("unit-")))].sort();
      if (unitTypeIds.length === 0 || !record.circleTypeId.startsWith("unit-")) {
        return null;
      }
      return {
        unitTypeIds,
        circleTypeId: record.circleTypeId,
        minimum: Math.max(1, Math.floor(finiteNumberOr(record.minimum, 1)))
      };
    })
    .filter((entry): entry is WorldState["rescuedCircleRequirements"][number] => entry !== null);
}

function normalizeDiplomacyRules(value: unknown, fallback: WorldState["diplomacy"], world: WorldState): WorldState["diplomacy"] {
  const source = Array.isArray(value) ? value : fallback;
  const byPair = new Map<string, WorldState["diplomacy"][number]>();
  for (const entry of source) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const player = Math.floor(finiteNumberOr(record.player, -1));
    const otherPlayer = Math.floor(finiteNumberOr(record.otherPlayer, -1));
    if (!isValidPlayerId(world, player, false) || !isValidPlayerId(world, otherPlayer, false)) {
      continue;
    }
    if (record.state !== "enemy" && record.state !== "allied" && record.state !== "neutral") {
      continue;
    }
    byPair.set(`${player}:${otherPlayer}`, { player, state: record.state, otherPlayer });
  }
  return [...byPair.values()].sort((left, right) => left.player - right.player || left.otherPlayer - right.otherPlayer);
}

function normalizeSharedVisionRules(value: unknown, fallback: WorldState["sharedVision"], world: WorldState): WorldState["sharedVision"] {
  const source = Array.isArray(value) ? value : fallback;
  const byPair = new Map<string, WorldState["sharedVision"][number]>();
  for (const entry of source) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const player = Math.floor(finiteNumberOr(record.player, -1));
    const otherPlayer = Math.floor(finiteNumberOr(record.otherPlayer, -1));
    if (!isValidPlayerId(world, player, false) || !isValidPlayerId(world, otherPlayer, false)) {
      continue;
    }
    byPair.set(`${player}:${otherPlayer}`, { player, enabled: Boolean(record.enabled), otherPlayer });
  }
  return [...byPair.values()].sort((left, right) => left.player - right.player || left.otherPlayer - right.otherPlayer);
}

function normalizeSourceRequirementPlayers(value: unknown, world: WorldState): Array<number | "self"> {
  return Array.isArray(value)
    ? value.map((entry) => normalizeSourceRequirementPlayer(entry, world)).filter((entry): entry is number | "self" => entry !== null)
    : [];
}

function normalizeSourceRequirementPlayer(value: unknown, world: WorldState): number | "self" | null {
  if (value === "self") {
    return "self";
  }
  const player = Math.floor(finiteNumberOr(value, -1));
  return isValidPlayerId(world, player, true) ? player : null;
}

function normalizeAiStates(value: unknown, world: WorldState, currentTick = world.tick): WorldState["aiStates"] {
  if (!Array.isArray(value)) {
    return world.aiStates;
  }
  const aiPlayerIds = new Set(world.players
    .filter((player) => player.id !== world.visibilityPlayer && player.id !== 15 && player.playerType !== "person" && player.playerType !== "nobody" && isSourceActiveAiName(player.ai, world))
    .map((player) => player.id));
  const seen = new Set<number>();
  const states: WorldState["aiStates"] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const player = Math.floor(finiteNumberOr(record.player, -1));
    if (!aiPlayerIds.has(player) || seen.has(player)) {
      continue;
    }
    const strategy = record.strategy === "sea" || record.strategy === "air" ? record.strategy : "land";
    const fallback = world.aiStates.find((state) => state.player === player);
    const sourceSecondTicks = sourceOrderRetryTicksForSave(world, 30);
    const attackDelayTicks = Math.max(30, Math.floor(finiteNumberOr(record.attackDelayTicks, fallback?.attackDelayTicks ?? 35 * 30)));
    const attackDelayRuntimeTicks = sourceOrderRetryTicksForSave(world, attackDelayTicks);
    const fallbackNextAttackTick = fallback?.nextAttackTick ?? currentTick + sourceOrderRetryTicksForSave(world, 20 * 30);
    const nextThinkTickCap = currentTick + sourceAiSleepCyclesForSave(world, 30);
    const nextAttackTickCap = Math.max(fallbackNextAttackTick, currentTick + Math.max(sourceSecondTicks, attackDelayRuntimeTicks));
    states.push({
      player,
      enabled: record.enabled !== false,
      strategy,
      sourceScriptId: typeof record.sourceScriptId === "string" ? record.sourceScriptId : fallback?.sourceScriptId ?? null,
      sourceScriptIndex: Math.max(0, Math.floor(finiteNumberOr(record.sourceScriptIndex, fallback?.sourceScriptIndex ?? 0))),
      sourceScriptSleepUntilTick: Math.max(0, Math.floor(finiteNumberOr(record.sourceScriptSleepUntilTick, fallback?.sourceScriptSleepUntilTick ?? 0))),
      sourceScriptForces: normalizeAiSourceScriptForces(record.sourceScriptForces, fallback?.sourceScriptForces ?? []),
      sourceScriptForceRoles: normalizeAiSourceScriptForceRoles(record.sourceScriptForceRoles, fallback?.sourceScriptForceRoles ?? []),
      attackForceSize: Math.max(3, Math.floor(finiteNumberOr(record.attackForceSize, fallback?.attackForceSize ?? 3))),
      attackForceIds: normalizeNonNegativeIntegerArray(record.attackForceIds, fallback?.attackForceIds ?? []),
      forceSizes: normalizePositiveIntegerArray(record.forceSizes, fallback?.forceSizes ?? [], 1),
      attackWaveSizes: normalizePositiveIntegerArray(record.attackWaveSizes, fallback?.attackWaveSizes ?? []),
      attackWaveUnitTargets: normalizeAiAttackWaveUnitTargets(record.attackWaveUnitTargets, fallback?.attackWaveUnitTargets ?? []),
      nextAttackWaveIndex: Math.max(0, Math.floor(finiteNumberOr(record.nextAttackWaveIndex, fallback?.nextAttackWaveIndex ?? 0))),
      defendForceSize: Math.max(0, Math.floor(finiteNumberOr(record.defendForceSize, fallback?.defendForceSize ?? 0))),
      attackDelayTicks,
      attackUnitTargets: normalizeAiAttackUnitTargets(record.attackUnitTargets, fallback?.attackUnitTargets ?? []),
      buildOrder: normalizeAiBuildOrder(record.buildOrder, fallback?.buildOrder ?? []),
      buildDepots: typeof record.buildDepots === "boolean" ? record.buildDepots : fallback?.buildDepots ?? true,
      preferredAttackUnitTypes: normalizeAiPreferredAttackUnitTypes(record.preferredAttackUnitTypes, fallback?.preferredAttackUnitTypes ?? [], world),
      workerTarget: Math.max(1, Math.floor(finiteNumberOr(record.workerTarget, fallback?.workerTarget ?? 7))),
      tankerTarget: Math.max(0, Math.floor(finiteNumberOr(record.tankerTarget, fallback?.tankerTarget ?? 1))),
      transportTarget: Math.max(0, Math.floor(finiteNumberOr(record.transportTarget, fallback?.transportTarget ?? 0))),
      collectWeights: normalizeAiCollectWeights(record.collectWeights, fallback?.collectWeights ?? null),
      researchOrder: normalizeAiResearchOrder(record.researchOrder, fallback?.researchOrder ?? [], world),
      nextThinkTick: Math.max(0, Math.min(nextThinkTickCap, Math.floor(finiteNumberOr(record.nextThinkTick, currentTick + 1)))),
      nextAttackTick: Math.max(0, Math.min(nextAttackTickCap, Math.floor(finiteNumberOr(record.nextAttackTick, fallbackNextAttackTick))))
    });
    seen.add(player);
  }
  const fallbackByPlayer = new Map(world.aiStates.map((state) => [state.player, state]));
  for (const playerId of aiPlayerIds) {
    if (!seen.has(playerId)) {
      const fallback = fallbackByPlayer.get(playerId);
      states.push(fallback ?? { player: playerId, enabled: true, strategy: "land", sourceScriptId: null, sourceScriptIndex: 0, sourceScriptSleepUntilTick: 0, sourceScriptForces: [], sourceScriptForceRoles: [], attackForceSize: 3, attackForceIds: [], forceSizes: [], attackWaveSizes: [], attackWaveUnitTargets: [], nextAttackWaveIndex: 0, defendForceSize: 0, attackDelayTicks: 35 * 30, attackUnitTargets: [], buildOrder: [], buildDepots: true, preferredAttackUnitTypes: [], workerTarget: 7, tankerTarget: 1, transportTarget: 0, collectWeights: null, researchOrder: [], nextThinkTick: world.tick + 1, nextAttackTick: world.tick + sourceOrderRetryTicksForSave(world, 20 * 30) });
    }
  }
  return states;
}

function normalizeAiSourceScriptForces(value: unknown, fallback: WorldState["aiStates"][number]["sourceScriptForces"]): WorldState["aiStates"][number]["sourceScriptForces"] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const targets = Array.isArray(record.targets)
        ? record.targets
          .map((target) => {
            if (!target || typeof target !== "object") {
              return null;
            }
            const targetRecord = target as Record<string, unknown>;
            const role = typeof targetRecord.role === "string" ? targetRecord.role : "";
            if (!role) {
              return null;
            }
            return {
              role,
              count: Math.max(0, Math.floor(finiteNumberOr(targetRecord.count, 0))),
              unitTypeId: typeof targetRecord.unitTypeId === "string" ? targetRecord.unitTypeId : null
            };
          })
          .filter((target): target is { role: string; count: number; unitTypeId: string | null } => Boolean(target))
        : [];
      return {
        id: Math.max(0, Math.floor(finiteNumberOr(record.id, 0))),
        attack: record.attack === true,
        targets
      };
    })
    .filter((entry): entry is WorldState["aiStates"][number]["sourceScriptForces"][number] => Boolean(entry));
}

function normalizeAiSourceScriptForceRoles(value: unknown, fallback: WorldState["aiStates"][number]["sourceScriptForceRoles"]): WorldState["aiStates"][number]["sourceScriptForceRoles"] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const role = typeof record.role === "string" ? record.role : "";
      if (!role) {
        return null;
      }
      return {
        id: Math.max(0, Math.floor(finiteNumberOr(record.id, 0))),
        role
      };
    })
    .filter((entry): entry is WorldState["aiStates"][number]["sourceScriptForceRoles"][number] => Boolean(entry));
}

function sourceAiSleepCyclesForSave(world: WorldState, cycles: number): number {
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

function sourceOrderRetryTicksForSave(world: WorldState, sourceCycles: number): number {
  return Math.max(1, Math.round(sourceCycles * (sourceDefaultGameSpeed(world) / 30)));
}

function sourceFrameSecondsForSave(world: WorldState): number {
  return 1 / sourceDefaultGameSpeed(world);
}

function normalizeNonNegativeIntegerArray(value: unknown, fallback: number[]): number[] {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .map((entry) => Math.max(0, Math.floor(finiteNumberOr(entry, -1))))
    .filter((entry) => entry >= 0);
}

function normalizePositiveIntegerArray(value: unknown, fallback: number[], minimum = 3): number[] {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .map((entry) => Math.max(minimum, Math.floor(finiteNumberOr(entry, 0))))
    .filter((entry) => entry >= minimum);
}

function normalizeAiAttackUnitTargets(value: unknown, fallback: Array<{ unitTypeId: string; count: number }>): Array<{ unitTypeId: string; count: number }> {
  const source = Array.isArray(value) ? value : fallback;
  const targets = new Map<string, number>();
  for (const entry of source) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.unitTypeId !== "string" || record.unitTypeId.length === 0) {
      continue;
    }
    const count = Math.max(1, Math.floor(finiteNumberOr(record.count, 1)));
    targets.set(record.unitTypeId, (targets.get(record.unitTypeId) ?? 0) + count);
  }
  return [...targets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([unitTypeId, count]) => ({ unitTypeId, count }));
}

function normalizeAiAttackWaveUnitTargets(value: unknown, fallback: Array<Array<{ unitTypeId: string; count: number }>>): Array<Array<{ unitTypeId: string; count: number }>> {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .map((entry) => normalizeAiAttackUnitTargets(entry, []))
    .filter((entry) => entry.length > 0);
}

function normalizeAiBuildOrder(value: unknown, fallback: string[]): string[] {
  const source = Array.isArray(value) ? value : fallback;
  return source.filter((entry): entry is string => typeof entry === "string" && SOURCE_AI_BUILD_ROLES.has(entry));
}

function normalizeAiPreferredAttackUnitTypes(value: unknown, fallback: string[], world: WorldState): string[] {
  const unitTypeIds = new Set(world.unitDefinitions.map((unit) => unit.id));
  return normalizeStringArray(value, fallback).filter((unitTypeId) => unitTypeIds.has(unitTypeId));
}

function normalizeAiResearchOrder(value: unknown, fallback: string[], world: WorldState): string[] {
  const upgradeIds = new Set(world.upgradeDefinitions.map((upgrade) => upgrade.id));
  return normalizeStringArray(value, fallback).filter((upgradeId) => upgradeIds.has(upgradeId));
}

function normalizeAiCollectWeights(value: unknown, fallback: { gold: number; wood: number; oil: number } | null): { gold: number; wood: number; oil: number } | null {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : fallback;
  if (!record) {
    return null;
  }
  return {
    gold: Math.max(0, Math.floor(finiteNumberOr(record.gold, fallback?.gold ?? 0))),
    wood: Math.max(0, Math.floor(finiteNumberOr(record.wood, fallback?.wood ?? 0))),
    oil: Math.max(0, Math.floor(finiteNumberOr(record.oil, fallback?.oil ?? 0)))
  };
}

function isSourceActiveAiName(aiName: string | null, world: WorldState): boolean {
  const definition = sourceAiDefinitionForName(world.aiDefinitions, aiName);
  return definition !== null && !sourceAiDefinitionIsPassive(definition);
}

function inferNextUnitSerial(world: WorldState): number {
  let next = world.units.length;
  const visit = (unit: WorldState["units"][number]): void => {
    const suffix = /-(\d+)$/.exec(unit.id)?.[1];
    if (suffix) {
      next = Math.max(next, Number(suffix) + 1);
    }
    for (const cargoUnit of unit.cargo ?? []) {
      visit(cargoUnit);
    }
  };
  for (const unit of world.units) {
    visit(unit);
  }
  return next;
}

function unitIdExistsForPlayerIncludingCargo(world: WorldState, unitId: string, playerId: number): boolean {
  return world.units.some((unit) => unitIdExistsForPlayer(unit, unitId, playerId));
}

function unitIdExistsIncludingCargo(world: WorldState, unitId: string): boolean {
  return world.units.some((unit) => unitIdExistsInUnit(unit, unitId));
}

function unitIdExistsForPlayer(unit: WorldState["units"][number], unitId: string, playerId: number): boolean {
  if (unit.id === unitId && unit.player === playerId) {
    return true;
  }
  return unit.cargo.some((cargoUnit) => unitIdExistsForPlayer(cargoUnit, unitId, playerId));
}

function unitIdExistsInUnit(unit: WorldState["units"][number], unitId: string): boolean {
  if (unit.id === unitId) {
    return true;
  }
  return unit.cargo.some((cargoUnit) => unitIdExistsInUnit(cargoUnit, unitId));
}

function parseSavedGame(raw: string): SavedGame | null {
  try {
    const save = JSON.parse(raw) as Partial<SavedGame>;
    if (save.version !== 1 || typeof save.mapPath !== "string" || !save.world || !save.camera) {
      return null;
    }
    return save as SavedGame;
  } catch {
    return null;
  }
}

function normalizeLoadedUnits(world: WorldState, value: unknown, definitionsById: Map<string, WargusManifest["units"][number]>): WorldState["units"] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const units: WorldState["units"] = [];
  for (const entry of value) {
    if (!isLoadableUnit(entry) || seen.has(entry.id) || !hasValidLoadedUnitPlayer(world, entry.player)) {
      continue;
    }
    seen.add(entry.id);
    normalizeLoadedUnit(world, entry, definitionsById, seen);
    if (entry.hitPoints > 0 && definitionsById.has(entry.typeId)) {
      units.push(entry);
    }
  }
  return units;
}

function isLoadableUnit(value: unknown): value is WorldState["units"][number] {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.id === "string"
    && record.id.trim().length > 0
    && typeof record.typeId === "string"
    && record.typeId.trim().length > 0;
}

function normalizeLoadedUnit(world: WorldState, unit: WorldState["units"][number], definitionsById: Map<string, WargusManifest["units"][number]>, seenUnitIds: Set<string>, allowCargo = true): void {
  const definition = definitionsById.get(unit.typeId);
  if (definition) {
    const building = isBuildingDefinition(definition);
    if (hasInvalidLoadedStaticData(unit)) {
      refreshLoadedUnitStaticData(unit, definition, building, world.map.setup?.tileset ?? null);
    } else {
      unit.name ||= definition.name;
      unit.image ??= imageForTileset(definition, world.map.setup?.tileset ?? null);
      unit.animation ??= definition.animation;
    }
    unit.kind = building ? "building" : worldKindForUnitDefinition(definition);
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
    unit.teleportDestinationId = normalizeTeleportDestinationId(unit.teleportDestinationId, world);
    unit.numDirections = Math.max(0, definition.numDirections ?? 0);
    unit.onReady = definition.onReady ?? null;
    const footprint = boxDimensionsForUnit(definition, unit.kind);
    unit.radius = footprint.radius;
    unit.boxWidth = footprint.boxWidth;
    unit.boxHeight = footprint.boxHeight;
    unit.corpseTypeId = definition.corpseTypeId ?? null;
    unit.explosionType = definition.explosionType ?? null;
    unit.rightMouseAction = definition.rightMouseAction ?? null;
    unit.missile = definition.missile ?? null;
    unit.constructionTypeId = definition.constructionTypeId ?? null;
    unit.revealer = definition.revealer ?? false;
    unit.vanishes = definition.vanishes ?? false;
    unit.decayRate = Math.max(0, definition.decayRate ?? 0);
    unit.drawLevel = Math.max(0, definition.drawLevel ?? 0);
    unit.priority = Math.max(0, definition.priority ?? 0);
    unit.points = Math.max(0, definition.points ?? 0);
    unit.annoyComputerFactor = Math.max(0, definition.annoyComputerFactor ?? 0);
    unit.armor = definition.armor;
    unit.basicDamage = definition.basicDamage;
    unit.piercingDamage = definition.piercingDamage;
    unit.minAttackRange = Math.max(definition.minAttackRange ?? 0, 0) * 32;
    unit.attackRange = Math.max(definition.maxAttackRange, 0) * 32 + 12;
    unit.baseSpeed = speedForUnit(definition.id, unit.kind, definition.speed, definition);
    unit.sightRangeTiles = sightRangeForUnit(definition, unit.kind, Math.max(definition.tileSize?.[0] ?? 1, 1), Math.max(definition.tileSize?.[1] ?? 1, 1));
    unit.computerReactionRange = Math.max(0, definition.computerReactionRange ?? 0) * 32;
    unit.personReactionRange = Math.max(0, definition.personReactionRange ?? 0) * 32;
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
    unit.autoCastSpells = normalizeAutoCastSpells(unit.autoCastSpells, unit.canCastSpells, world);
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
    unit.neutral = definition.neutral ?? false;
    unit.neutralMinimapColor = normalizeRgbColor(definition.neutralMinimapColor);
    unit.canTransport = [...(definition.canTransport ?? [])];
    unit.maxMana = maxManaForUnitDefinition(definition);
    unit.mana = Math.min(unit.maxMana, unit.mana ?? initialManaForUnitDefinition(definition, unit.maxMana));
    unit.manaIncrease = Math.max(0, definition.manaIncrease ?? 0);
    unit.autoRepair = Boolean(unit.autoRepair);
    unit.autoRepairRange = Math.max(0, definition.autoRepairRange ?? 0) * 32;
    unit.repairRange = Math.max(0, definition.repairRange ?? 0) * 32;
    unit.repairHp = Math.max(0, definition.repairHp ?? 0);
    unit.repairCosts = [...(definition.repairCosts ?? [])];
    unit.improveProduction = normalizeImproveProduction(definition.improveProduction);
    if (!unit.order && !unit.construction) {
      unit.speed = unit.baseSpeed;
    }
  }
  normalizeLoadedUnitScalars(world, unit);
  if (definition) {
    refreshLoadedUnitSourceCombatData(unit, definition);
  }
  unit.lastDamagePlayer = normalizeNullablePlayerId(world, unit.lastDamagePlayer);
  unit.lastDamageSourceUnitId = typeof unit.lastDamageSourceUnitId === "string" && unit.lastDamageSourceUnitId.length > 0 ? unit.lastDamageSourceUnitId : null;
  unit.kills = Math.max(0, Math.floor(finiteNumberOr(unit.kills, 0)));
  unit.xp = Math.max(0, Math.floor(finiteNumberOr(unit.xp, 0)));
  unit.statusEffects = normalizeStatusEffects(world, unit.statusEffects);
  unit.productionQueue = normalizeProductionQueue(world, unit, unit.productionQueue, definitionsById);
  unit.cargoCapacity = normalizeCargoCapacity(definition, unit.cargoCapacity);
  if (!allowCargo || unit.cargoCapacity <= 0) {
    unit.cargo = [];
  } else {
    unit.cargo = normalizeLoadedCargoUnits(world, unit, unit.cargo, definitionsById, seenUnitIds).slice(0, unit.cargoCapacity);
  }
  unit.lifetimeSeconds = normalizeUnitLifetimeSecondsForSave(world, unit, definition);
  unit.rallyPoint = normalizeLoadedRallyPoint(world, unit);
  unit.construction = definition ? normalizeConstructionState(world, unit.construction, definition, unit.player) : null;
  unit.order = normalizeLoadedOrder(world, unit.order, unit);
  unit.moveQueue = normalizeMoveQueue(world, unit.moveQueue, unit);
}

function normalizeLoadedCargoUnits(world: WorldState, carrier: WorldState["units"][number], value: unknown, definitionsById: Map<string, WargusManifest["units"][number]>, seenUnitIds: Set<string>): WorldState["units"] {
  if (!Array.isArray(value)) {
    return [];
  }
  const cargo: WorldState["units"] = [];
  for (const entry of value) {
    if (!isLoadableUnit(entry) || seenUnitIds.has(entry.id) || !definitionsById.has(entry.typeId) || !hasValidLoadedUnitPlayer(world, entry.player)) {
      continue;
    }
    seenUnitIds.add(entry.id);
    normalizeLoadedUnit(world, entry, definitionsById, seenUnitIds, false);
    if (entry.hitPoints > 0 && canLoadedCarrierTransportUnit(carrier, entry) && !entry.construction && definitionsById.has(entry.typeId)) {
      cargo.push(entry);
    } else {
      seenUnitIds.delete(entry.id);
    }
  }
  return cargo;
}

function canLoadedCarrierTransportUnit(carrier: WorldState["units"][number], unit: WorldState["units"][number]): boolean {
  return carrier.canTransport.some((rule) => {
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

function normalizeLoadedUnitScalars(world: WorldState, unit: WorldState["units"][number]): void {
  const position = normalizeWorldPoint(world, finiteNumberOr(unit.x, 0), finiteNumberOr(unit.y, 0));
  unit.player = Math.floor(finiteNumberOr(unit.player, 15));
  unit.x = position.x;
  unit.y = position.y;
  unit.facing = Math.max(0, Math.min(7, Math.floor(finiteNumberOr(unit.facing, 4))));
  unit.radius = Math.max(1, finiteNumberOr(unit.radius, 12));
  unit.boxWidth = Math.max(1, finiteNumberOr(unit.boxWidth, unit.radius * 2));
  unit.boxHeight = Math.max(1, finiteNumberOr(unit.boxHeight, unit.radius * 2));
  unit.tileWidth = Math.max(1, Math.floor(finiteNumberOr(unit.tileWidth, 1)));
  unit.tileHeight = Math.max(1, Math.floor(finiteNumberOr(unit.tileHeight, 1)));
  unit.frameWidth = Math.max(1, finiteNumberOr(unit.frameWidth, 72));
  unit.frameHeight = Math.max(1, finiteNumberOr(unit.frameHeight, 72));
  unit.corpseTypeId = normalizeNullableUnitTypeId(unit.corpseTypeId, null, world);
  unit.explosionType = normalizeNullableMissileId(unit.explosionType, null, world);
  unit.rightMouseAction = normalizeNullableRightMouseAction(unit.rightMouseAction, null, world);
  unit.missile = normalizeNullableMissileId(unit.missile, null, world);
  unit.constructionTypeId = normalizeNullableConstructionTypeId(unit.constructionTypeId, null, world);
  unit.hiddenInConstructionId = typeof unit.hiddenInConstructionId === "string" && unit.hiddenInConstructionId.length > 0 ? unit.hiddenInConstructionId : null;
  unit.revealer = Boolean(unit.revealer);
  unit.vanishes = Boolean(unit.vanishes);
  unit.decayRate = Math.max(0, finiteNumberOr(unit.decayRate, 0));
  unit.maxHitPoints = Math.max(1, Math.floor(finiteNumberOr(unit.maxHitPoints, 1)));
  unit.hitPoints = Math.max(0, Math.min(unit.maxHitPoints, Math.floor(finiteNumberOr(unit.hitPoints, unit.maxHitPoints))));
  unit.drawLevel = Math.max(0, Math.floor(finiteNumberOr(unit.drawLevel, 0)));
  unit.priority = Math.max(0, Math.floor(finiteNumberOr(unit.priority, 0)));
  unit.points = Math.max(0, Math.floor(finiteNumberOr(unit.points, 0)));
  unit.annoyComputerFactor = Math.max(0, Math.floor(finiteNumberOr(unit.annoyComputerFactor, 0)));
  unit.baseSpeed = Math.max(0, finiteNumberOr(unit.baseSpeed, 0));
  unit.speed = Math.max(0, finiteNumberOr(unit.speed, unit.baseSpeed));
  unit.armor = Math.max(0, Math.floor(finiteNumberOr(unit.armor, 0)));
  unit.basicDamage = Math.max(0, Math.floor(finiteNumberOr(unit.basicDamage, 0)));
  unit.piercingDamage = Math.max(0, Math.floor(finiteNumberOr(unit.piercingDamage, 0)));
  unit.minAttackRange = Math.max(0, finiteNumberOr(unit.minAttackRange, 0));
  unit.attackRange = Math.max(0, finiteNumberOr(unit.attackRange, 0));
  unit.sightRangeTiles = Math.max(1, Math.floor(finiteNumberOr(unit.sightRangeTiles, 1)));
  unit.computerReactionRange = Math.max(0, finiteNumberOr(unit.computerReactionRange, 0));
  unit.personReactionRange = Math.max(0, finiteNumberOr(unit.personReactionRange, 0));
  unit.autoRepair = Boolean(unit.autoRepair);
  unit.autoRepairRange = Math.max(0, finiteNumberOr(unit.autoRepairRange, 0));
  unit.repairRange = Math.max(0, finiteNumberOr(unit.repairRange, 0));
  unit.repairHp = Math.max(0, finiteNumberOr(unit.repairHp, 0));
  unit.repairCosts = normalizeResourceNameArray(unit.repairCosts, [], world);
  unit.improveProduction = normalizeSourceImproveProduction(unit.improveProduction, world);
  unit.permanentCloak = Boolean(unit.permanentCloak);
  unit.randomMovementProbability = Math.max(0, finiteNumberOr(unit.randomMovementProbability, 0));
  unit.randomMovementDistance = Math.max(0, Math.floor(finiteNumberOr(unit.randomMovementDistance, 1)));
  unit.clicksToExplode = Math.max(0, Math.floor(finiteNumberOr(unit.clicksToExplode, 0)));
  unit.burnPercent = Math.max(0, finiteNumberOr(unit.burnPercent, 0));
  unit.burnDamageRate = Math.max(0, finiteNumberOr(unit.burnDamageRate, 0));
  unit.burnAccumulator = Math.max(0, finiteNumberOr(unit.burnAccumulator, 0));
  unit.explodeClickCount = Math.min(unit.clicksToExplode, Math.max(0, Math.floor(finiteNumberOr(unit.explodeClickCount, 0))));
  unit.lastExplodeClickAtMs = Math.max(0, finiteNumberOr(unit.lastExplodeClickAtMs, 0));
  unit.nextAutoActionTick = Math.max(0, Math.floor(finiteNumberOr(unit.nextAutoActionTick, 0)));
  unit.nextRandomMoveTick = Math.max(0, Math.floor(finiteNumberOr(unit.nextRandomMoveTick, 0)));
  unit.neutral = Boolean(unit.neutral);
  unit.neutralMinimapColor = normalizeRgbColor(unit.neutralMinimapColor);
  unit.attackCooldown = Math.max(0, finiteNumberOr(unit.attackCooldown, 0));
  unit.maxMana = Math.max(0, finiteNumberOr(unit.maxMana, 0));
  unit.mana = Math.max(0, Math.min(unit.maxMana, finiteNumberOr(unit.mana, unit.maxMana)));
  unit.manaIncrease = Math.max(0, finiteNumberOr(unit.manaIncrease, 0));
  unit.spellCooldown = Math.max(0, finiteNumberOr(unit.spellCooldown, 0));
  unit.sourceSpellGoalId = typeof unit.sourceSpellGoalId === "string" && unit.sourceSpellGoalId.length > 0 ? unit.sourceSpellGoalId : null;
  unit.givesResource = normalizeNullableResourceName(unit.givesResource, null, world);
  const rawResourcesHeld = unit.resourcesHeld;
  unit.resourcesHeld = rawResourcesHeld == null
    ? resourcesHeldForSourceUnit(unit, null, world.engineSettings)
    : Math.max(0, Math.floor(finiteNumberOr(rawResourcesHeld, 0)));
  unit.carriedResource = normalizeCarriedResource(unit.carriedResource, unit.resourcesHeld);
  if (!unit.carriedResource && !unit.givesResource) {
    unit.resourcesHeld = 0;
  }
  unit.supply = Math.max(0, Math.floor(finiteNumberOr(unit.supply, 0)));
  unit.demand = Math.max(0, Math.floor(finiteNumberOr(unit.demand, 0)));
  unit.canAttack = Boolean(unit.canAttack);
  unit.canTargetLand = Boolean(unit.canTargetLand);
  unit.canTargetSea = Boolean(unit.canTargetSea);
  unit.canTargetAir = Boolean(unit.canTargetAir);
  unit.groundAttack = Boolean(unit.groundAttack);
  unit.landUnit = Boolean(unit.landUnit);
  unit.seaUnit = Boolean(unit.seaUnit);
  unit.airUnit = Boolean(unit.airUnit);
  unit.sideAttack = Boolean(unit.sideAttack);
  unit.rotationSpeed = Math.max(0, finiteNumberOr(unit.rotationSpeed, 0));
  unit.elevated = Boolean(unit.elevated);
  unit.shadow = finiteNullableNumber(unit.shadow);
  if (unit.shadow !== null) {
    unit.shadow = Math.max(0, unit.shadow);
  }
  unit.woodImprove = Boolean(unit.woodImprove);
  unit.oilImprove = Boolean(unit.oilImprove);
  unit.center = Boolean(unit.center);
  unit.level = Math.max(0, Math.floor(finiteNumberOr(unit.level, 0)));
  unit.builderOutside = Boolean(unit.builderOutside);
  unit.teleporter = Boolean(unit.teleporter);
  unit.teleportDestinationId = normalizeTeleportDestinationId(unit.teleportDestinationId, world);
  unit.numDirections = Math.max(0, Math.floor(finiteNumberOr(unit.numDirections, 0)));
  unit.onReady = normalizeNullableSourceUnitAction(unit.onReady, null, world);
  unit.detectCloak = Boolean(unit.detectCloak);
  unit.coward = Boolean(unit.coward);
  unit.gatherResources = normalizeResourceNameArray(unit.gatherResources, [], world);
  unit.resourceCapacity = normalizeSourceResourceCapacity(unit.resourceCapacity, world);
  unit.resourceStep = normalizeSourcePositiveResourceMap(unit.resourceStep, world);
  unit.waitAtResource = normalizeSourcePositiveResourceMap(unit.waitAtResource, world);
  unit.waitAtDepot = normalizeSourcePositiveResourceMap(unit.waitAtDepot, world);
  unit.canCastSpells = normalizeSpellIdArray(unit.canCastSpells, [], world);
  unit.autoCastSpells = normalizeAutoCastSpells(unit.autoCastSpells, unit.canCastSpells, world);
  unit.storesResources = normalizeResourceNameArray(unit.storesResources, [], world);
  unit.canHarvest = Boolean(unit.canHarvest);
  unit.mainFacility = Boolean(unit.mainFacility);
  unit.shoreBuilding = Boolean(unit.shoreBuilding);
  unit.manaEnabled = Boolean(unit.manaEnabled);
  unit.selectableByRectangle = unit.selectableByRectangle !== false;
  unit.indestructible = Boolean(unit.indestructible);
  unit.nonSolid = Boolean(unit.nonSolid);
  unit.visibleUnderFog = Boolean(unit.visibleUnderFog);
  unit.organic = Boolean(unit.organic);
  unit.isUndead = Boolean(unit.isUndead);
  unit.hero = Boolean(unit.hero);
  unit.volatile = Boolean(unit.volatile);
  unit.canTransport = normalizeTransportRules(unit.canTransport, [], world);
}

function refreshLoadedUnitSourceCombatData(unit: WorldState["units"][number], definition: WargusManifest["units"][number]): void {
  const tileWidth = Math.max(definition.tileSize?.[0] ?? unit.tileWidth ?? 1, 1);
  const tileHeight = Math.max(definition.tileSize?.[1] ?? unit.tileHeight ?? 1, 1);
  unit.level = Math.max(0, definition.level ?? 0);
  unit.armor = definition.armor;
  unit.basicDamage = definition.basicDamage;
  unit.piercingDamage = definition.piercingDamage;
  unit.minAttackRange = Math.max(definition.minAttackRange ?? 0, 0) * 32;
  unit.attackRange = Math.max(definition.maxAttackRange, 0) * 32 + 12;
  unit.sightRangeTiles = sightRangeForUnit(definition, unit.kind, tileWidth, tileHeight);
  unit.canAttack = definition.canAttack;
  unit.canTargetLand = definition.canTargetLand ?? false;
  unit.canTargetSea = definition.canTargetSea ?? false;
  unit.canTargetAir = definition.canTargetAir ?? false;
  unit.groundAttack = definition.groundAttack ?? false;
  unit.regenerationRate = 0;
  unit.regenerationFrequency = 0;
}

function hasValidLoadedUnitPlayer(world: WorldState, value: unknown): boolean {
  const player = Math.floor(finiteNumberOr(value, -1));
  return isValidPlayerId(world, player, true);
}

function normalizeCarriedResource(value: unknown, resourcesHeld: number): WorldState["units"][number]["carriedResource"] {
  if (resourcesHeld <= 0) {
    return null;
  }
  return value === "gold" || value === "wood" || value === "oil" ? value : null;
}

function normalizeNullablePlayerId(world: WorldState, value: unknown, allowNeutral = false): number | null {
  const player = finiteNullableNumber(value);
  if (player === null || !Number.isInteger(player) || !isValidPlayerId(world, player, allowNeutral)) {
    return null;
  }
  return player;
}

function isValidPlayerId(world: WorldState, player: number, allowNeutral = false): boolean {
  return (allowNeutral && player === 15) || world.players.some((candidate) => candidate.id === player);
}

function pruneInvalidLoadedReferences(world: WorldState): void {
  const liveTopLevelUnitIds = new Set(world.units.map((unit) => unit.id));
  world.activeResearch = world.activeResearch.filter((research) => liveTopLevelUnitIds.has(research.buildingId));
  world.queuedResearch = world.queuedResearch.filter((research) => liveTopLevelUnitIds.has(research.buildingId));
  world.pendingAttacks = world.pendingAttacks.filter((pendingAttack) => (
    liveTopLevelUnitIds.has(pendingAttack.sourceId)
    && (!pendingAttack.targetId || liveTopLevelUnitIds.has(pendingAttack.targetId))
  ));
  world.projectiles = world.projectiles.map((projectile) => (
    projectile.targetId && !hasValidLoadedProjectileTarget(world, projectile, liveTopLevelUnitIds)
      ? { ...projectile, targetId: null }
      : projectile
  ));
  for (const unit of world.units) {
    if (unit.lastDamageSourceUnitId && !liveTopLevelUnitIds.has(unit.lastDamageSourceUnitId)) {
      unit.lastDamageSourceUnitId = null;
    }
    if (unit.sourceSpellGoalId && !liveTopLevelUnitIds.has(unit.sourceSpellGoalId)) {
      unit.sourceSpellGoalId = null;
    }
    unit.moveQueue = normalizeMoveQueue(world, unit.moveQueue, unit);
    unit.rallyPoint = normalizeLoadedRallyPoint(world, unit);
    unit.productionQueue = normalizeLoadedProductionQueueReferences(world, unit);
    if (unit.construction?.builderId && !liveTopLevelUnitIds.has(unit.construction.builderId)) {
      unit.construction.builderId = "";
    }
    if (orderReferencesMissingUnit(unit.order, liveTopLevelUnitIds)) {
      unit.order = null;
      continue;
    }
    if (unit.order?.kind === "harvest" && hasInvalidLoadedHarvestOrder(world, unit)) {
      unit.order = null;
      continue;
    }
    if (unit.order?.kind === "build" && hasInvalidLoadedBuildOrder(world, unit)) {
      unit.order = null;
      continue;
    }
    if (unit.order?.kind === "build-oil-platform" && hasInvalidLoadedBuildOilPlatformOrder(world, unit)) {
      unit.order = null;
      continue;
    }
    if (unit.order?.kind === "attack" && hasInvalidLoadedAttackOrder(world, unit)) {
      unit.order = null;
      continue;
    }
    if (unit.order?.kind === "attack-ground" && hasInvalidLoadedAttackGroundOrder(world, unit)) {
      unit.order = null;
      continue;
    }
    if (unit.order?.kind === "spell-cast" && hasInvalidLoadedSpellCastOrder(world, unit)) {
      unit.order = null;
      continue;
    }
    if (unit.order?.kind === "explore" && hasInvalidLoadedExploreOrder(world, unit)) {
      unit.order = null;
      continue;
    }
    if (unit.order?.kind === "repair" && hasInvalidLoadedRepairOrder(world, unit)) {
      unit.order = null;
      continue;
    }
    if (unit.order?.kind === "load-transport" && hasInvalidLoadedLoadTransportOrder(world, unit)) {
      unit.order = null;
      continue;
    }
    if (unit.order?.kind === "unload-transport" && hasInvalidLoadedUnloadTransportOrder(world, unit)) {
      unit.order = null;
      continue;
    }
    if (unit.order?.kind === "follow" && hasInvalidLoadedFollowOrder(world, unit)) {
      unit.order = null;
      continue;
    }
    if (unit.order?.kind === "defend" && hasInvalidLoadedDefendOrder(world, unit)) {
      unit.order = null;
      continue;
    }
    if (unit.order?.kind === "move" && hasInvalidLoadedMoveOrder(world, unit)) {
      unit.order = null;
      continue;
    }
    if (unit.order?.kind === "attack-move" && hasInvalidLoadedAttackMoveOrder(world, unit, liveTopLevelUnitIds)) {
      unit.order = null;
      continue;
    }
    if (unit.order?.kind === "patrol" && hasInvalidLoadedPatrolOrder(world, unit, liveTopLevelUnitIds)) {
      unit.order = null;
      continue;
    }
    if (unit.order?.kind === "hold" && hasInvalidLoadedHoldOrder(world, unit, liveTopLevelUnitIds)) {
      unit.order = null;
      continue;
    }
    if (unit.order?.kind === "follow" && unit.order.attackTargetId && !liveTopLevelUnitIds.has(unit.order.attackTargetId)) {
      unit.order.attackTargetId = null;
    }
  }
  const liveConstructionIds = new Set(world.units.filter((unit) => unit.construction).map((unit) => unit.id));
  for (const unit of world.units) {
    if (unit.hiddenInConstructionId && !liveConstructionIds.has(unit.hiddenInConstructionId)) {
      unit.hiddenInConstructionId = null;
    }
  }
  for (const building of world.units) {
    if (!building.construction?.builderInside || !building.construction.builderId) {
      continue;
    }
    const builder = world.units.find((unit) => unit.id === building.construction?.builderId);
    if (builder && builder.hitPoints > 0) {
      builder.hiddenInConstructionId = building.id;
      builder.order = null;
      builder.moveQueue = [];
      builder.x = building.x;
      builder.y = building.y;
    }
  }
}

function normalizeLoadedProductionQueueReferences(world: WorldState, unit: WorldState["units"][number]): WorldState["units"][number]["productionQueue"] {
  const originalQueue = unit.productionQueue;
  const accepted: WorldState["units"][number]["productionQueue"] = [];
  for (const entry of originalQueue) {
    unit.productionQueue = accepted;
    if (canTrainUnitAt(world, unit.id, entry.unitTypeId, world.unitDefinitions)) {
      accepted.push(entry);
    }
  }
  unit.productionQueue = originalQueue;
  return accepted;
}

function hasValidLoadedProjectileTarget(world: WorldState, projectile: WorldState["projectiles"][number], liveTopLevelUnitIds: Set<string>): boolean {
  if (!projectile.targetId || !liveTopLevelUnitIds.has(projectile.targetId)) {
    return false;
  }
  const target = world.units.find((unit) => unit.id === projectile.targetId);
  if (!target || target.hitPoints <= 0 || !isUnitVisibleToPlayer(world, target, projectile.player)) {
    return false;
  }
  const source = world.units.find((unit) => unit.id === projectile.sourceId);
  if (source) {
    return canAttackTarget(source, target, world);
  }
  return target.player !== 15
    && loadedProjectileCanHitUnitBySourceOwnership(world, projectile, target)
    && loadedProjectileCanStillHitKind(projectile, target);
}

function loadedProjectileCanHitUnitBySourceOwnership(world: WorldState, projectile: WorldState["projectiles"][number], target: WorldState["units"][number]): boolean {
  const sourceEnemies = world.diplomacy.find((rule) => rule.player === projectile.player && rule.otherPlayer === target.player)?.state;
  if (sourceEnemies ? sourceEnemies === "enemy" : projectile.player !== target.player && target.player !== 15) {
    return true;
  }
  if (target.id === projectile.sourceId) {
    return projectile.canHitOwner;
  }
  return projectile.friendlyFire;
}

function loadedProjectileCanStillHitKind(projectile: WorldState["projectiles"][number], target: WorldState["units"][number]): boolean {
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

function restoreIdleOnReadyOrders(world: WorldState): void {
  for (const unit of world.units) {
    if (
      unit.hitPoints > 0
      && !unit.construction
      && !unit.order
      && unit.moveQueue.length === 0
      && isExploreOnReadyValue(unit.onReady)
    ) {
      issueExploreOrder(world, unit.id);
    }
  }
}

function orderReferencesMissingUnit(order: WorldState["units"][number]["order"], liveUnitIds: Set<string>): boolean {
  if (!order) {
    return false;
  }
  if (order.kind === "attack" || order.kind === "repair" || order.kind === "load-transport" || order.kind === "follow" || order.kind === "defend" || order.kind === "build" || order.kind === "build-oil-platform") {
    return !liveUnitIds.has(order.targetId);
  }
  return order.kind === "harvest" && order.targetId !== null && !liveUnitIds.has(order.targetId);
}

function hasInvalidLoadedBuildOrder(world: WorldState, unit: WorldState["units"][number]): boolean {
  const order = unit.order;
  if (order?.kind !== "build") {
    return false;
  }
  const target = world.units.find((candidate) => candidate.id === order.targetId);
  return !target
    || !target.construction
    || target.player !== unit.player
    || Boolean(target.construction.builderId && target.construction.builderId !== unit.id);
}

function hasInvalidLoadedBuildOilPlatformOrder(world: WorldState, unit: WorldState["units"][number]): boolean {
  const order = unit.order;
  if (order?.kind !== "build-oil-platform") {
    return false;
  }
  const oilPatch = world.units.find((candidate) => candidate.id === order.targetId);
  return !oilPatch || !canIssueBuildOilPlatformAt(world, unit, oilPatch, world.unitDefinitions);
}

function hasInvalidLoadedAttackOrder(world: WorldState, unit: WorldState["units"][number]): boolean {
  const order = unit.order;
  if (order?.kind !== "attack") {
    return false;
  }
  const target = world.units.find((candidate) => candidate.id === order.targetId);
  return !target || !canIssueAttackTargetWithPath(world, unit, target);
}

function hasInvalidLoadedAttackGroundOrder(world: WorldState, unit: WorldState["units"][number]): boolean {
  const order = unit.order;
  if (order?.kind !== "attack-ground") {
    return false;
  }
  return !canIssueAttackGroundAt(world, unit, order.targetX, order.targetY);
}

function hasInvalidLoadedSpellCastOrder(world: WorldState, unit: WorldState["units"][number]): boolean {
  const order = unit.order;
  if (order?.kind !== "spell-cast") {
    return false;
  }
  return !isTargetedSpellCommand(order.command)
    || targetedSpellIdForCommand(world, order.command) !== order.spellId
    || !canCastTargetedSpellCommand(world, unit, order.command)
    || !hasValidLoadedPathToPoint(world, order.targetX, order.targetY, order.path, order.pathIndex);
}

function hasInvalidLoadedRepairOrder(world: WorldState, unit: WorldState["units"][number]): boolean {
  const order = unit.order;
  if (order?.kind !== "repair") {
    return false;
  }
  const target = world.units.find((candidate) => candidate.id === order.targetId);
  return !target || !canIssueRepairTarget(world, unit, target);
}

function hasInvalidLoadedLoadTransportOrder(world: WorldState, unit: WorldState["units"][number]): boolean {
  const order = unit.order;
  if (order?.kind !== "load-transport") {
    return false;
  }
  const transport = world.units.find((candidate) => candidate.id === order.targetId);
  return !transport || !canTargetTransportForLoading(transport, unit);
}

function hasInvalidLoadedUnloadTransportOrder(world: WorldState, unit: WorldState["units"][number]): boolean {
  const order = unit.order;
  if (order?.kind !== "unload-transport") {
    return false;
  }
  if (order.unloadCargoUnitId && !unit.cargo.some((cargoUnit) => cargoUnit.id === order.unloadCargoUnitId)) {
    order.unloadCargoUnitId = null;
  }
  return !canIssueUnloadTransportAt(world, unit, order.targetX, order.targetY);
}

function hasInvalidLoadedFollowOrder(world: WorldState, unit: WorldState["units"][number]): boolean {
  const order = unit.order;
  if (order?.kind !== "follow") {
    return false;
  }
  const target = world.units.find((candidate) => candidate.id === order.targetId);
  return !target || !canTargetFollow(unit, target, world);
}

function hasInvalidLoadedDefendOrder(world: WorldState, unit: WorldState["units"][number]): boolean {
  const order = unit.order;
  if (order?.kind !== "defend") {
    return false;
  }
  const target = world.units.find((candidate) => candidate.id === order.targetId);
  return !target || !canIssueDefendTarget(world, unit, target);
}

function hasInvalidLoadedMoveOrder(world: WorldState, unit: WorldState["units"][number]): boolean {
  const order = unit.order;
  return order?.kind === "move" && (!canRestoreMovingOrderForUnit(unit) || !hasValidLoadedPathToPoint(world, order.targetX, order.targetY, order.path, order.pathIndex));
}

function hasInvalidLoadedExploreOrder(world: WorldState, unit: WorldState["units"][number]): boolean {
  const order = unit.order;
  return order?.kind === "explore" && (!canRestoreMovingOrderForUnit(unit) || !isLoadedMapPoint(world, order.targetX, order.targetY) || !hasValidLoadedPathToPoint(world, order.targetX, order.targetY, order.path, order.pathIndex));
}

function hasInvalidLoadedAttackMoveOrder(world: WorldState, unit: WorldState["units"][number], liveUnitIds: Set<string>): boolean {
  const order = unit.order;
  if (order?.kind !== "attack-move") {
    return false;
  }
  if (!canRestoreMovingOrderForUnit(unit) || !unit.canAttack || !hasValidLoadedPathToPoint(world, order.targetX, order.targetY, order.path, order.pathIndex)) {
    return true;
  }
  if (!order.targetId) {
    return false;
  }
  const target = liveUnitIds.has(order.targetId)
    ? world.units.find((candidate) => candidate.id === order.targetId)
    : undefined;
  if (!target || !canIssueAttackTarget(world, unit, target)) {
    order.targetId = null;
  }
  return false;
}

function hasInvalidLoadedPatrolOrder(world: WorldState, unit: WorldState["units"][number], liveUnitIds: Set<string>): boolean {
  const order = unit.order;
  if (order?.kind !== "patrol") {
    return false;
  }
  if (!canRestoreMovingOrderForUnit(unit)
    || !unit.canAttack
    || !isLoadedMapPoint(world, order.anchorX, order.anchorY)
    || !isLoadedMapPoint(world, order.patrolX, order.patrolY)
    || !hasValidLoadedPathToPoint(world, order.targetX, order.targetY, order.path, order.pathIndex)) {
    return true;
  }
  if (!order.targetId) {
    return false;
  }
  const target = liveUnitIds.has(order.targetId)
    ? world.units.find((candidate) => candidate.id === order.targetId)
    : undefined;
  if (!target || !canIssueAttackTarget(world, unit, target)) {
    order.targetId = null;
  }
  return false;
}

function hasInvalidLoadedHoldOrder(world: WorldState, unit: WorldState["units"][number], liveUnitIds: Set<string>): boolean {
  const order = unit.order;
  if (order?.kind !== "hold") {
    return false;
  }
  if (!unit.canAttack || !isLoadedMapPoint(world, order.anchorX, order.anchorY)) {
    return true;
  }
  if (!order.targetId) {
    return false;
  }
  const target = liveUnitIds.has(order.targetId)
    ? world.units.find((candidate) => candidate.id === order.targetId)
    : undefined;
  if (!target || !canIssueAttackTarget(world, unit, target)) {
    order.targetId = null;
  }
  return false;
}

function hasInvalidLoadedHarvestOrder(world: WorldState, unit: WorldState["units"][number]): boolean {
  const order = unit.order;
  if (order?.kind !== "harvest") {
    return false;
  }
  if (!canRestoreHarvestResourceForUnit(unit, order.resource)) {
    return true;
  }
  if (order.dropoffId && !hasValidLoadedResourceDropoff(world, unit, order.dropoffId, order.resource)) {
    order.dropoffId = null;
  }
  if (order.phase === "to-dropoff") {
    return unit.resourcesHeld <= 0
      || unit.carriedResource !== order.resource
      || !hasLoadedHarvestPathToDropoff(world, unit, order);
  }
  if (order.resource === "wood") {
    return order.targetId !== null
      || order.tileX === null
      || order.tileY === null
      || !isLoadedHarvestableWoodTile(world, order.tileX, order.tileY)
      || !hasLoadedHarvestPathToWood(world, unit, order);
  }
  if (!order.targetId) {
    return true;
  }
  const target = world.units.find((candidate) => candidate.id === order.targetId);
  if (!target || target.hitPoints <= 0 || target.resourcesHeld <= 0) {
    return true;
  }
  return !isLoadedHarvestableResourceSource(target, order.resource, unit.player)
    || !hasLoadedHarvestPathToResource(world, unit, order, target);
}

function hasLoadedHarvestPathToResource(world: WorldState, unit: WorldState["units"][number], order: Extract<NonNullable<WorldState["units"][number]["order"]>, { kind: "harvest" }>, target: WorldState["units"][number]): boolean {
  if (order.phase !== "to-resource") {
    return true;
  }
  return isInLoadedResourceRange(unit, target.x, target.y, target.radius)
    || hasValidLoadedPathToPoint(world, order.targetX, order.targetY, order.path, order.pathIndex);
}

function hasLoadedHarvestPathToWood(world: WorldState, unit: WorldState["units"][number], order: Extract<NonNullable<WorldState["units"][number]["order"]>, { kind: "harvest" }>): boolean {
  if (order.phase !== "to-resource" || order.tileX === null || order.tileY === null) {
    return true;
  }
  const target = { x: (order.tileX + 0.5) * world.tileSize, y: (order.tileY + 0.5) * world.tileSize };
  return Math.hypot(target.x - unit.x, target.y - unit.y) <= world.tileSize + unit.radius
    || hasValidLoadedPathToPoint(world, order.targetX, order.targetY, order.path, order.pathIndex);
}

function hasLoadedHarvestPathToDropoff(world: WorldState, unit: WorldState["units"][number], order: Extract<NonNullable<WorldState["units"][number]["order"]>, { kind: "harvest" }>): boolean {
  if (order.phase !== "to-dropoff") {
    return true;
  }
  const dropoff = order.dropoffId ? world.units.find((candidate) => candidate.id === order.dropoffId) : undefined;
  const dropoffX = dropoff?.x ?? order.dropoffX;
  const dropoffY = dropoff?.y ?? order.dropoffY;
  return Math.hypot(dropoffX - unit.x, dropoffY - unit.y) <= world.tileSize
    || hasValidLoadedPathToPoint(world, order.targetX, order.targetY, order.path, order.pathIndex);
}

function isInLoadedResourceRange(unit: WorldState["units"][number], targetX: number, targetY: number, radius: number): boolean {
  return Math.hypot(targetX - unit.x, targetY - unit.y) <= radius + unit.radius + 4;
}

function hasValidLoadedResourceDropoff(world: WorldState, unit: WorldState["units"][number], dropoffId: string, resource: "gold" | "wood" | "oil"): boolean {
  const dropoff = world.units.find((candidate) => candidate.id === dropoffId);
  return Boolean(dropoff
    && dropoff.hitPoints > 0
    && !dropoff.construction
    && canLoadedUnitUseResourceDeposit(world, unit, dropoff)
    && dropoff.storesResources.includes(resource));
}

function canLoadedUnitUseResourceDeposit(world: WorldState, unit: WorldState["units"][number], dropoff: WorldState["units"][number]): boolean {
  if (dropoff.player === unit.player) {
    return true;
  }
  if (!world.engineSettings.allyDepositsAllowedDefault) {
    return false;
  }
  return sourcePlayersMutuallyAllied(world, unit.player, dropoff.player);
}

function sourcePlayersMutuallyAllied(world: WorldState, player: number, otherPlayer: number): boolean {
  const first = world.diplomacy.find((rule) => rule.player === player && rule.otherPlayer === otherPlayer)?.state;
  const second = world.diplomacy.find((rule) => rule.player === otherPlayer && rule.otherPlayer === player)?.state;
  return (first ? first === "allied" : player === otherPlayer) && (second ? second === "allied" : player === otherPlayer);
}

function isLoadedHarvestableWoodTile(world: WorldState, tileX: number, tileY: number): boolean {
  if (!Number.isInteger(tileX) || !Number.isInteger(tileY) || tileX < 0 || tileY < 0 || tileX >= world.map.width || tileY >= world.map.height) {
    return false;
  }
  const tile = world.tiles[tileY * world.map.width + tileX] ?? 0;
  return isSourceHarvestableWoodTile(world, tile);
}

function isLoadedHarvestableResourceSource(unit: WorldState["units"][number], resource: "gold" | "oil", playerId: number): boolean {
  if (unit.givesResource !== resource || !unit.canHarvest) {
    return false;
  }
  return resource !== "oil" || unit.player === playerId;
}

function normalizeMapPoint(world: WorldState, point: { x: number; y: number } | null): { x: number; y: number } | null {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return null;
  }
  return {
    x: Math.max(0, Math.min(world.map.width * world.tileSize - 1, point.x)),
    y: Math.max(0, Math.min(world.map.height * world.tileSize - 1, point.y))
  };
}

function normalizeLoadedRallyPoint(world: WorldState, unit: WorldState["units"][number]): { x: number; y: number } | null {
  return canSetRallyPoint(world, unit) ? normalizeMapPoint(world, unit.rallyPoint) : null;
}

function canRestoreMovingOrderForUnit(unit: WorldState["units"][number]): boolean {
  return unit.hitPoints > 0 && !unit.construction && unit.speed > 0;
}

function hasValidLoadedPathToPoint(world: WorldState, targetX: number, targetY: number, path: { x: number; y: number }[], pathIndex: number): boolean {
  return isLoadedMapPoint(world, targetX, targetY)
    && Array.isArray(path)
    && path.length > 0
    && Number.isInteger(pathIndex)
    && pathIndex >= 0
    && pathIndex < path.length
    && path.every((point) => isLoadedMapPoint(world, point.x, point.y));
}

function isLoadedMapPoint(world: WorldState, x: number, y: number): boolean {
  return Number.isFinite(x)
    && Number.isFinite(y)
    && x >= 0
    && y >= 0
    && x < world.map.width * world.tileSize
    && y < world.map.height * world.tileSize;
}

function hasInvalidLoadedStaticData(unit: WorldState["units"][number]): boolean {
  return unit.maxHitPoints <= 1
    || unit.hitPoints <= 0
    || unit.tileWidth <= 0
    || unit.tileHeight <= 0
    || unit.boxWidth <= 0
    || unit.boxHeight <= 0
    || unit.frameWidth <= 0
    || unit.frameHeight <= 0
    || !unit.image
    || unit.kind === "unknown";
}

function refreshLoadedUnitStaticData(unit: WorldState["units"][number], definition: WargusManifest["units"][number], building: boolean, tileset: string | null): void {
  const hitPointRatio = unit.maxHitPoints > 1
    ? Math.max(0.01, unit.hitPoints / unit.maxHitPoints)
    : 1;
  const tileWidth = Math.max(definition.tileSize?.[0] ?? 1, 1);
  const tileHeight = Math.max(definition.tileSize?.[1] ?? 1, 1);
  const kind = building ? "building" : worldKindForUnitDefinition(definition);
  const footprint = boxDimensionsForUnit(definition, kind);
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
  unit.image = imageForTileset(definition, tileset);
  unit.animation = definition.animation;
  unit.corpseTypeId = definition.corpseTypeId ?? null;
  unit.explosionType = definition.explosionType ?? null;
  unit.rightMouseAction = definition.rightMouseAction ?? null;
  unit.missile = definition.missile ?? null;
  unit.constructionTypeId = definition.constructionTypeId ?? null;
  unit.revealer = definition.revealer ?? false;
  unit.vanishes = definition.vanishes ?? false;
  unit.decayRate = Math.max(0, definition.decayRate ?? 0);
  unit.priority = Math.max(0, definition.priority ?? 0);
  unit.points = Math.max(0, definition.points ?? 0);
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
  unit.armor = definition.armor;
  unit.annoyComputerFactor = Math.max(0, definition.annoyComputerFactor ?? 0);
  unit.basicDamage = definition.basicDamage;
  unit.piercingDamage = definition.piercingDamage;
  unit.minAttackRange = Math.max(definition.minAttackRange ?? 0, 0) * 32;
  unit.attackRange = Math.max(definition.maxAttackRange, 0) * 32 + 12;
  unit.sightRangeTiles = sightRangeForUnit(definition, kind, tileWidth, tileHeight);
  unit.computerReactionRange = Math.max(0, definition.computerReactionRange ?? 0) * 32;
  unit.personReactionRange = Math.max(0, definition.personReactionRange ?? 0) * 32;
  unit.baseSpeed = speedForUnit(definition.id, kind, definition.speed, definition);
  unit.speed = unit.baseSpeed;
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
  unit.autoCastSpells = normalizeStringArray(unit.autoCastSpells, []).filter((spellId) => unit.canCastSpells.includes(spellId));
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
  unit.explodeClickCount = Math.min(unit.explodeClickCount ?? 0, unit.clicksToExplode);
  unit.lastExplodeClickAtMs = Math.max(0, unit.lastExplodeClickAtMs ?? 0);
  unit.nextAutoActionTick = Math.max(0, unit.nextAutoActionTick ?? 0);
  unit.nextRandomMoveTick = Math.max(0, unit.nextRandomMoveTick ?? 0);
  unit.neutral = definition.neutral ?? false;
  unit.neutralMinimapColor = normalizeRgbColor(definition.neutralMinimapColor);
  unit.canTransport = [...(definition.canTransport ?? [])];
  unit.maxMana = maxManaForUnitDefinition(definition);
  unit.mana = Math.min(unit.maxMana, unit.mana ?? initialManaForUnitDefinition(definition, unit.maxMana));
  unit.manaIncrease = Math.max(0, definition.manaIncrease ?? 0);
  unit.autoRepair = Boolean(unit.autoRepair);
  unit.autoRepairRange = Math.max(0, definition.autoRepairRange ?? 0) * 32;
  unit.repairRange = Math.max(0, definition.repairRange ?? 0) * 32;
  unit.repairHp = Math.max(0, definition.repairHp ?? 0);
  unit.repairCosts = [...(definition.repairCosts ?? [])];
  unit.improveProduction = normalizeImproveProduction(definition.improveProduction);
}

function normalizeLifetimeSeconds(value: unknown): number | undefined {
  const seconds = finiteNullableNumber(value);
  return seconds !== null && seconds > 0 ? seconds : undefined;
}

function normalizeUnitLifetimeSecondsForSave(world: WorldState, unit: WorldState["units"][number], definition: WargusManifest["units"][number] | undefined): number | undefined {
  const savedLifetimeSeconds = normalizeLifetimeSeconds(unit.lifetimeSeconds);
  const sourceLifetimeSeconds = sourceUnitLifetimeSecondsForSave(world, unit.typeId, unit.decayRate);
  if (savedLifetimeSeconds !== undefined) {
    return sourceLifetimeSeconds !== undefined ? Math.min(savedLifetimeSeconds, sourceLifetimeSeconds) : savedLifetimeSeconds;
  }
  return definition ? sourceDecayRateLifetimeSeconds(unit.decayRate) : undefined;
}

function sourceUnitLifetimeSecondsForSave(world: WorldState, unitTypeId: string, decayRate: number): number | undefined {
  const sourceLifetimes = [
    sourceDecayRateLifetimeSeconds(decayRate),
    sourceDeadVisionLifetimeSecondsForSave(world, unitTypeId),
    ...world.spellDefinitions.flatMap((spell) => [
      ...spell.summons
        .filter((summon) => summon.unitTypeId === unitTypeId && typeof summon.timeToLive === "number" && summon.timeToLive > 0)
        .map((summon) => sourceCyclesToSeconds(world, summon.timeToLive as number)),
      ...spell.spawnPortals
        .filter((portal) => portal.unitTypeId === unitTypeId && typeof portal.timeToLive === "number" && portal.timeToLive > 0)
        .map((portal) => sourceCyclesToSeconds(world, portal.timeToLive as number)),
      ...spell.callbackUnitVariables
        .filter((variable) => variable.unitTypeId === unitTypeId && variable.variable === "TTL" && variable.value > 0)
        .map((variable) => sourceCyclesToSeconds(world, variable.value))
    ])
  ].filter((seconds): seconds is number => typeof seconds === "number" && seconds > 0);
  return sourceLifetimes.length > 0 ? Math.max(...sourceLifetimes) : undefined;
}

function sourceDeadVisionLifetimeSecondsForSave(world: WorldState, unitTypeId: string): number | undefined {
  return unitTypeId.startsWith("unit-dead-vision-") ? sourceCyclesToSeconds(world, 160) : undefined;
}

function maxManaForUnitDefinition(unit: Pick<WargusManifest["units"][number], "canCastSpells" | "manaEnabled" | "manaMax">): number {
  if (unit.manaEnabled === true || (unit.canCastSpells ?? []).length > 0) {
    return Math.max(0, unit.manaMax ?? 0);
  }
  return 0;
}

function initialManaForUnitDefinition(unit: Pick<WargusManifest["units"][number], "manaInitial">, maxMana: number): number {
  return Math.max(0, Math.min(maxMana, unit.manaInitial ?? maxMana));
}

function isBuildingDefinition(unit: WargusManifest["units"][number]): boolean {
  return isSourceBuildingDefinition(unit);
}

function normalizeProductionQueue(world: WorldState, producer: WorldState["units"][number], value: unknown, definitionsById: Map<string, WargusManifest["units"][number]>): WorldState["units"][number]["productionQueue"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const unitTypeId = typeof record.unitTypeId === "string" ? record.unitTypeId : "";
      const definition = definitionsById.get(unitTypeId);
      const remainingSeconds = finiteNullableNumber(record.remainingSeconds);
      const totalSeconds = finiteNullableNumber(record.totalSeconds);
      if (!definition || remainingSeconds === null || totalSeconds === null || remainingSeconds < 0 || totalSeconds <= 0) {
        return null;
      }
      const sourceTotalSeconds = isProducerTransformationFor(world, producer, definition.id)
        ? sourceUpgradeDurationSecondsForPlayer(world, producer.player, definition.costs)
        : sourceTrainDurationSecondsForPlayer(world, producer.player, definition.costs);
      if (sourceTotalSeconds <= 0) {
        return null;
      }
      return { unitTypeId, remainingSeconds: Math.min(Math.max(0.001, remainingSeconds), sourceTotalSeconds), totalSeconds: sourceTotalSeconds };
    })
    .filter((entry): entry is WorldState["units"][number]["productionQueue"][number] => entry !== null)
    .slice(0, productionQueueLimitForEngine(world.engineSettings));
}

function normalizeStatusEffects(world: WorldState, value: unknown): WorldState["units"][number]["statusEffects"] {
  type StatusEffect = WorldState["units"][number]["statusEffects"][number];
  const validKinds = new Set<StatusEffect["kind"]>(["slow", "haste", "bloodlust", "invisibility", "unholy-armor", "flame-shield"]);
  if (!Array.isArray(value)) {
    return [];
  }
  const byKind = new Map<StatusEffect["kind"], StatusEffect>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const kind = typeof record.kind === "string" && validKinds.has(record.kind as StatusEffect["kind"]) ? record.kind as StatusEffect["kind"] : null;
    const remainingSeconds = finiteNullableNumber(record.remainingSeconds);
    const totalSeconds = finiteNullableNumber(record.totalSeconds);
    if (!kind || remainingSeconds === null || totalSeconds === null || remainingSeconds <= 0 || totalSeconds <= 0) {
      continue;
    }
    const sourceTotalSeconds = sourceStatusEffectDurationSeconds(world, kind) ?? totalSeconds;
    if (sourceTotalSeconds <= 0) {
      continue;
    }
    const multipliers = sourceStatusEffectMultipliers(kind);
    const normalized: StatusEffect = {
      kind,
      remainingSeconds: Math.min(remainingSeconds, sourceTotalSeconds),
      totalSeconds: sourceTotalSeconds,
      speedMultiplier: multipliers.speedMultiplier,
      ...(multipliers.damageMultiplier !== undefined ? { damageMultiplier: multipliers.damageMultiplier } : {})
    };
    removeOpposingSourceStatusEffectForSave(byKind, kind);
    const existing = byKind.get(kind);
    if (!existing) {
      byKind.set(kind, normalized);
      continue;
    }
    existing.remainingSeconds = Math.max(existing.remainingSeconds, normalized.remainingSeconds);
    existing.totalSeconds = Math.max(existing.totalSeconds, normalized.totalSeconds);
    existing.speedMultiplier = strongestStatusSpeedMultiplier(kind, existing.speedMultiplier, normalized.speedMultiplier);
    if ((normalized.damageMultiplier ?? 0) > (existing.damageMultiplier ?? 0)) {
      existing.damageMultiplier = normalized.damageMultiplier;
    }
  }
  return [...byKind.values()];
}

function sourceStatusEffectMultipliers(kind: WorldState["units"][number]["statusEffects"][number]["kind"]): { speedMultiplier: number; damageMultiplier?: number } {
  if (kind === "slow") {
    return { speedMultiplier: 0.55 };
  }
  if (kind === "haste") {
    return { speedMultiplier: 1.4 };
  }
  if (kind === "bloodlust") {
    return { speedMultiplier: 1, damageMultiplier: 1.85 };
  }
  return { speedMultiplier: 1 };
}

function removeOpposingSourceStatusEffectForSave(
  byKind: Map<WorldState["units"][number]["statusEffects"][number]["kind"], WorldState["units"][number]["statusEffects"][number]>,
  kind: WorldState["units"][number]["statusEffects"][number]["kind"]
): void {
  if (kind === "haste") {
    byKind.delete("slow");
  } else if (kind === "slow") {
    byKind.delete("haste");
  }
}

function sourceStatusEffectDurationSeconds(world: WorldState, kind: WorldState["units"][number]["statusEffects"][number]["kind"]): number | null {
  if (kind === "flame-shield") {
    const spellId = "spell-flame-shield";
    return spellMissileTtlSeconds(world, spellId, sourceFlameShieldMissileIdForSave(world, spellId)) ?? sourceCyclesToSeconds(world, 628);
  }
  if (kind === "unholy-armor") {
    return sourceCyclesToSeconds(world, spellCallbackVariableAdjustment(world, "spell-unholy-armor", "UnholyArmor", 500));
  }
  const source = sourceStatusVariableForKind(kind);
  if (!source) {
    return null;
  }
  const sourceAmounts = world.spellDefinitions
    .flatMap((spell) => spell.variableAdjustments)
    .filter((adjustment) => adjustment.variable === source.variable && adjustment.amount > 0)
    .map((adjustment) => adjustment.amount);
  return sourceCyclesToSeconds(world, sourceAmounts.length > 0 ? Math.max(...sourceAmounts) : source.fallbackCycles);
}

function sourceStatusVariableForKind(kind: WorldState["units"][number]["statusEffects"][number]["kind"]): { variable: string; fallbackCycles: number } | null {
  const variableByKind: Partial<Record<WorldState["units"][number]["statusEffects"][number]["kind"], { variable: string; fallbackCycles: number }>> = {
    slow: { variable: "Slow", fallbackCycles: 1000 },
    haste: { variable: "Haste", fallbackCycles: 1000 },
    bloodlust: { variable: "Bloodlust", fallbackCycles: 1000 },
    invisibility: { variable: "Invisible", fallbackCycles: 2000 }
  };
  return variableByKind[kind] ?? null;
}

function spellCallbackVariableAdjustment(world: WorldState, spellId: string, variable: string, fallback: number): number {
  const values = world.spellDefinitions
    .find((spell) => spell.id === spellId)
    ?.callbackUnitVariables
    .filter((adjustment) => adjustment.variable === variable)
    .map((adjustment) => adjustment.value) ?? [];
  return values.length > 0 ? Math.max(...values) : fallback;
}

function spellMissileTtlSeconds(world: WorldState, spellId: string, missileId: string): number | null {
  const ttls = world.spellDefinitions
    .find((spell) => spell.id === spellId)
    ?.missileSpawns
    .filter((missile) => missile.missile === missileId && typeof missile.ttl === "number")
    .map((missile) => missile.ttl as number) ?? [];
  return ttls.length > 0 ? sourceCyclesToSeconds(world, Math.max(...ttls)) : null;
}

function sourceFlameShieldMissileIdForSave(world: WorldState, spellId = "spell-flame-shield"): string {
  return sourceMissileIdForSpellByClassForSave(world, spellId, "missile-class-flame-shield") ?? sourceSpellMissileIdForSave(world, spellId) ?? "missile-flame-shield";
}

function sourceMissileIdForSpellByClassForSave(world: WorldState, spellId: string, className: string): string | null {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  const missileIds = [
    ...(spell?.missileSpawns.map((missile) => missile.missile) ?? []),
    ...(spell?.missileDamages.map((missile) => missile.missile) ?? []),
    ...(spell?.missiles ?? [])
  ];
  return missileIds.find((missileId) => world.missileDefinitions.find((missile) => missile.id === missileId)?.className === className) ?? null;
}

function sourceCyclesToSeconds(world: WorldState, cycles: number): number {
  return cycles / sourceDefaultGameSpeed(world);
}

function strongestStatusSpeedMultiplier(kind: WorldState["units"][number]["statusEffects"][number]["kind"], left: number, right: number): number {
  return kind === "slow" ? Math.min(left, right) : Math.max(left, right);
}

function normalizeConstructionState(world: WorldState, value: unknown, definition: WargusManifest["units"][number], playerId: number): WorldState["units"][number]["construction"] {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const remainingSeconds = finiteNullableNumber(record.remainingSeconds);
  const totalSeconds = finiteNullableNumber(record.totalSeconds);
  if (remainingSeconds === null || totalSeconds === null || remainingSeconds <= 0 || totalSeconds <= 0) {
    return null;
  }
  const sourceTotalSeconds = sourceBuildDurationSecondsForPlayer(world, playerId, definition.costs);
  if (sourceTotalSeconds <= 0) {
    return null;
  }
  return {
    builderId: typeof record.builderId === "string" ? record.builderId : "",
    builderInside: Boolean(record.builderInside) || definition.builderOutside !== true,
    remainingSeconds: Math.min(remainingSeconds, sourceTotalSeconds),
    totalSeconds: sourceTotalSeconds
  };
}

function normalizeMoveQueue(world: WorldState, value: unknown, unit: WorldState["units"][number]): WorldState["units"][number]["moveQueue"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry): WorldState["units"][number]["moveQueue"][number] | null => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const x = finiteNullableNumber(record.x);
      const y = finiteNullableNumber(record.y);
      if (x === null || y === null || !isLoadedMapPoint(world, x, y)) {
        return null;
      }
      const kind = record.kind === "attack-move"
        || record.kind === "attack-target"
        || record.kind === "attack-ground"
        || record.kind === "patrol"
        || record.kind === "unload-transport"
        || record.kind === "follow"
        || record.kind === "defend"
        || record.kind === "repair"
        || record.kind === "load-transport"
        || record.kind === "harvest"
        || record.kind === "harvest-wood"
        || record.kind === "return-goods"
        || record.kind === "spell-cast"
        || record.kind === "build"
        || record.kind === "build-oil-platform"
        || record.kind === "stand-ground"
        || record.kind === "explore"
        ? record.kind
        : "move";
      if (kind === "attack-move" && !canIssueQueueCombatMoveAt(world, unit, x, y)) {
        return null;
      }
      if (kind === "patrol" && !canIssueQueuePatrolAt(world, unit, x, y)) {
        return null;
      }
      if (kind === "stand-ground" && !canIssueHoldPosition(unit)) {
        return null;
      }
      if (kind === "explore" && !canIssueExploreOrder(world, unit)) {
        return null;
      }
      if (kind === "attack-ground" && !canIssueQueueAttackGroundAt(world, unit, x, y)) {
        return null;
      }
      if (kind === "attack-target") {
        const targetId = typeof record.targetId === "string" ? record.targetId : "";
        const target = world.units.find((candidate) => candidate.id === targetId);
        if (!target || !canIssueQueueAttackTarget(world, unit, target)) {
          return null;
        }
        return {
          kind,
          targetId,
          x: target.x,
          y: target.y
        };
      }
      if (kind === "unload-transport") {
        if (!canIssueQueueUnloadTransportAt(world, unit, x, y)) {
          return null;
        }
        const cargoUnitId = typeof record.cargoUnitId === "string" && unit.cargo.some((cargoUnit) => cargoUnit.id === record.cargoUnitId)
          ? record.cargoUnitId
          : null;
        return { kind, x, y, cargoUnitId };
      }
      if (kind === "harvest") {
        const targetId = typeof record.targetId === "string" ? record.targetId : "";
        const target = world.units.find((candidate) => candidate.id === targetId);
        const resource = record.resource === "gold" || record.resource === "oil" ? record.resource : null;
        const targetResource = target?.givesResource === "gold" ? "gold" : target?.givesResource === "oil" && target.canHarvest ? "oil" : null;
        if (!target || !resource || resource !== targetResource || !canIssueQueueHarvestTarget(world, unit, target)) {
          return null;
        }
        return {
          kind,
          resource,
          targetId,
          x: target.x,
          y: target.y
        };
      }
      if (kind === "harvest-wood") {
        const tileX = Math.floor(finiteNumberOr(record.tileX, -1));
        const tileY = Math.floor(finiteNumberOr(record.tileY, -1));
        if (tileX < 0 || tileY < 0 || tileX >= world.map.width || tileY >= world.map.height || !canIssueQueueHarvestWoodAt(world, unit, tileX, tileY)) {
          return null;
        }
        return {
          kind,
          tileX,
          tileY,
          x: (tileX + 0.5) * world.tileSize,
          y: (tileY + 0.5) * world.tileSize
        };
      }
      if (kind === "return-goods") {
        const resource = record.resource === "gold" || record.resource === "wood" || record.resource === "oil" ? record.resource : null;
        const requestedTargetId = typeof record.targetId === "string" ? record.targetId : null;
        const targetId = requestedTargetId && hasValidLoadedResourceDropoff(world, unit, requestedTargetId, resource ?? "gold") ? requestedTargetId : null;
        const dropoff = targetId ? world.units.find((candidate) => candidate.id === targetId) : null;
        if (!resource || unit.carriedResource !== resource || unit.resourcesHeld <= 0 || !canIssueQueueReturnGoodsOrder(world, unit, targetId)) {
          return null;
        }
        return {
          kind,
          resource,
          targetId,
          x: dropoff?.x ?? x,
          y: dropoff?.y ?? y
        };
      }
      if (kind === "spell-cast") {
        const command = typeof record.command === "string" ? record.command : "";
        const spellId = typeof record.spellId === "string" ? record.spellId : "";
        if (!isTargetedSpellCommand(command) || targetedSpellIdForCommand(world, command) !== spellId || !canIssueQueueTargetedSpellAt(world, unit, command, x, y)) {
          return null;
        }
        return {
          kind,
          command,
          spellId,
          spellRange: Math.max(0, sourceSpellRangeTilesForSave(world, spellId, finiteNumberOr(record.spellRange, 0))),
          x,
          y
        };
      }
      if (kind === "build") {
        const buildingTypeId = typeof record.buildingTypeId === "string" ? record.buildingTypeId : "";
        if (!canIssueQueueBuildAt(world, unit, buildingTypeId, x, y)) {
          return null;
        }
        return {
          kind,
          buildingTypeId,
          x,
          y
        };
      }
      if (kind === "build-oil-platform") {
        const targetId = typeof record.targetId === "string" ? record.targetId : "";
        const oilPatch = world.units.find((candidate) => candidate.id === targetId);
        if (!oilPatch || !canIssueQueueBuildOilPlatformAt(world, unit, oilPatch.x, oilPatch.y, world.unitDefinitions)) {
          return null;
        }
        return {
          kind,
          targetId,
          x: oilPatch.x,
          y: oilPatch.y
        };
      }
      if (kind === "follow" || kind === "defend" || kind === "repair" || kind === "load-transport") {
        const targetId = typeof record.targetId === "string" ? record.targetId : "";
        const target = world.units.find((candidate) => candidate.id === targetId);
        if (!target) {
          return null;
        }
        if (kind === "follow" && !canIssueQueueFollowTarget(world, unit, target)) {
          return null;
        }
        if (kind === "defend" && !canIssueQueueDefendTarget(world, unit, target)) {
          return null;
        }
        if (kind === "repair" && !canIssueQueueRepairTarget(world, unit, target)) {
          return null;
        }
        if (kind === "load-transport" && !canIssueQueueLoadIntoTransportTarget(world, unit, target)) {
          return null;
        }
        return {
          kind,
          targetId,
          x: target.x,
          y: target.y
        };
      }
      if (kind === "move" && !canIssueQueueMoveAt(world, unit, x, y)) {
        return null;
      }
      return {
        kind,
        x,
        y
      };
    })
    .filter((entry): entry is WorldState["units"][number]["moveQueue"][number] => entry !== null);
}

function normalizeActiveResearch(value: unknown, world: WorldState): WorldState["activeResearch"] {
  if (!Array.isArray(value)) {
    return [];
  }
  const upgradeIds = new Set(world.upgradeDefinitions.map((upgrade) => upgrade.id));
  const seenBuildings = new Set<string>();
  const seenUpgrades = new Set<string>();
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const buildingId = typeof record.buildingId === "string" ? record.buildingId : "";
      const upgradeId = typeof record.upgradeId === "string" ? record.upgradeId : "";
      const building = world.units.find((unit) => unit.id === buildingId);
      const upgrade = world.upgradeDefinitions.find((candidate) => candidate.id === upgradeId);
      const player = finiteNullableNumber(record.player);
      const remainingSeconds = finiteNullableNumber(record.remainingSeconds);
      const totalSeconds = finiteNullableNumber(record.totalSeconds);
      if (!building || !upgrade || !upgradeIds.has(upgradeId) || player === null || remainingSeconds === null || totalSeconds === null || player !== building.player || building.hitPoints <= 0 || building.construction || building.productionQueue.length > 0 || remainingSeconds <= 0 || totalSeconds <= 0) {
        return null;
      }
      if ((world.researchedUpgrades[player] ?? []).includes(upgradeId)) {
        return null;
      }
      if (!canResearchUpgradeAt(world, buildingId, upgradeId, world.upgradeDefinitions)) {
        return null;
      }
      if (seenBuildings.has(buildingId) || (seenUpgrades.has(`${player}:${upgradeId}`) && !sourceResearchAllowsSharedProgress(world, building, upgradeId))) {
        return null;
      }
      seenBuildings.add(buildingId);
      seenUpgrades.add(`${player}:${upgradeId}`);
      const sourceTotalSeconds = sourceResearchDurationSecondsForPlayer(world, player, upgrade.costs.time);
      if (sourceTotalSeconds <= 0) {
        return null;
      }
      return {
        buildingId,
        player,
        upgradeId,
        remainingSeconds: Math.min(remainingSeconds, sourceTotalSeconds),
        totalSeconds: sourceTotalSeconds
      };
    })
    .filter((entry): entry is WorldState["activeResearch"][number] => entry !== null);
}

function normalizeQueuedResearch(value: unknown, world: WorldState): WorldState["queuedResearch"] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seenBuildings = new Set<string>();
  const seenUpgrades = new Set<string>();
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const buildingId = typeof record.buildingId === "string" ? record.buildingId : "";
      const upgradeId = typeof record.upgradeId === "string" ? record.upgradeId : "";
      const building = world.units.find((unit) => unit.id === buildingId);
      const upgrade = world.upgradeDefinitions.find((candidate) => candidate.id === upgradeId);
      const player = finiteNullableNumber(record.player);
      if (!building || !upgrade || player === null || player !== building.player || building.hitPoints <= 0 || building.construction) {
        return null;
      }
      if ((world.researchedUpgrades[player] ?? []).includes(upgradeId) || !sourceResearchAllowsSharedProgress(world, building, upgradeId) && seenUpgrades.has(`${player}:${upgradeId}`)) {
        return null;
      }
      const sameBuildingActive = world.activeResearch.some((research) => research.buildingId === buildingId);
      const sameUpgradeActive = world.activeResearch.some((research) => research.player === player && research.upgradeId === upgradeId);
      if (sameBuildingActive || sameUpgradeActive && !sourceResearchAllowsSharedProgress(world, building, upgradeId)) {
        return null;
      }
      if (!canResearchUpgradeAt(world, buildingId, upgradeId, world.upgradeDefinitions) && building.productionQueue.length === 0) {
        return null;
      }
      if (seenBuildings.has(buildingId)) {
        return null;
      }
      seenBuildings.add(buildingId);
      seenUpgrades.add(`${player}:${upgradeId}`);
      return {
        buildingId,
        player,
        upgradeId,
        totalSeconds: sourceResearchDurationSecondsForPlayer(world, player, upgrade.costs.time)
      };
    })
    .filter((entry): entry is WorldState["queuedResearch"][number] => entry !== null);
}

function normalizeCargoCapacity(definition: WargusManifest["units"][number] | undefined, value: unknown): number {
  const sourceCapacity = Math.max(0, Math.floor(definition?.maxOnBoard ?? 0));
  if (sourceCapacity > 0) {
    return Math.max(sourceCapacity, Math.floor(finiteNumberOr(value, sourceCapacity)));
  }
  return 0;
}

function normalizeCorpses(world: WorldState, value: unknown): WorldState["corpses"] {
  if (!Array.isArray(value)) {
    return [];
  }
  const playerIds = new Set(world.players.map((player) => player.id));
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id : "";
      const typeId = typeof record.typeId === "string" ? record.typeId : "";
      const player = finiteNullableNumber(record.player);
      const x = finiteNullableNumber(record.x);
      const y = finiteNullableNumber(record.y);
      const radius = finiteNullableNumber(record.radius);
      const age = finiteNullableNumber(record.age);
      const duration = finiteNullableNumber(record.duration);
      const definition = world.unitDefinitions.find((candidate) => candidate.id === typeId);
      if (!id || !definition || player === null || !playerIds.has(player) || x === null || y === null || radius === null || age === null || duration === null || radius <= 0 || age < 0 || duration <= 0 || age >= duration) {
        return null;
      }
      const animation = normalizeNullableAnimationId(record.animation, definition.animation ?? null, world);
      const sourceDuration = sourceDeathAnimationDurationSecondsForSave(world, animation);
      if (sourceDuration <= 0 || age >= sourceDuration) {
        return null;
      }
      const point = normalizeWorldPoint(world, x, y);
      const corpse: WorldState["corpses"][number] = {
        id,
        typeId: definition.id,
        player,
        x: point.x,
        y: point.y,
        radius,
        drawLevel: Math.max(0, Math.floor(finiteNumberOr(record.drawLevel, definition.drawLevel ?? 0))),
        visibleUnderFog: Boolean(record.visibleUnderFog ?? definition.visibleUnderFog ?? false),
        facing: finiteNumberOr(record.facing, 4),
        animation,
        frameWidth: finiteNumberOr(record.frameWidth, 72),
        frameHeight: finiteNumberOr(record.frameHeight, 72),
        age,
        duration: sourceDuration
      };
      return corpse;
    })
    .filter((entry): entry is WorldState["corpses"][number] => entry !== null);
}

function sourceDeathAnimationDurationSecondsForSave(world: WorldState, animationId: string | null): number {
  const frames = world.animationDefinitions.find((animation) => animation.id === animationId)?.actions.Death;
  if (!frames || frames.length === 0) {
    return sourceCyclesToSeconds(world, 1);
  }
  const cycles = frames.reduce((total, frame) => total + Math.max(1, Math.floor(frame.wait || 1)), 0);
  return sourceCyclesToSeconds(world, cycles);
}

function normalizeNullableAnimationId(value: unknown, fallback: string | null, world: WorldState): string | null {
  const animationIds = new Set(world.animationDefinitions.map((definition) => definition.id));
  return normalizeNullableFromSet(value, fallback, animationIds);
}

function normalizeProjectiles(world: WorldState, value: unknown): WorldState["projectiles"] {
  const validKinds = new Set<WorldProjectile["kind"]>(["arrow", "axe", "cannon", "siege", "torpedo", "melee"]);
  const validSourceTypes = new Set(world.unitDefinitions.map((unit) => unit.id));
  const liveTopLevelUnitIds = new Set(world.units.map((unit) => unit.id));
  const playerIds = new Set(world.players.map((player) => player.id));
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id : "";
      const sourceId = typeof record.sourceId === "string" ? record.sourceId : "";
      const sourceUnit = world.units.find((unit) => unit.id === sourceId && unit.player === finiteNullableNumber(record.player));
      const sourceTypeId = sourceUnit && validSourceTypes.has(sourceUnit.typeId)
        ? sourceUnit.typeId
        : typeof record.sourceTypeId === "string" && validSourceTypes.has(record.sourceTypeId)
          ? record.sourceTypeId
          : "";
      const kind = typeof record.kind === "string" && validKinds.has(record.kind as WorldProjectile["kind"]) ? record.kind as WorldProjectile["kind"] : null;
      const player = finiteNullableNumber(record.player);
      const x = finiteNullableNumber(record.x);
      const y = finiteNullableNumber(record.y);
      const targetX = finiteNullableNumber(record.targetX);
      const targetY = finiteNullableNumber(record.targetY);
      const damage = normalizeProjectileDamage(record.damage);
      const age = finiteNullableNumber(record.age);
      const missileId = typeof record.missileId === "string" && world.missileDefinitions.some((missile) => missile.id === record.missileId) ? record.missileId : null;
      const normalizedTtlSeconds = normalizeProjectileTtlSeconds(world, record.ttlSeconds, missileId);
      const maxProjectileAge = normalizedTtlSeconds ?? 5;
      const missileDefinition = missileId ? world.missileDefinitions.find((missile) => missile.id === missileId) : undefined;
      const speed = missileDefinition ? projectileSpeedForMissile(missileDefinition.speed, kind ?? "arrow") : finiteNullableNumber(record.speed);
      if (!id || !sourceId || !validSourceTypes.has(sourceTypeId) || !kind || player === null || !playerIds.has(player) || x === null || y === null || targetX === null || targetY === null || speed === null || damage === null || age === null || speed <= 0 || damage <= 0 || age < 0 || age >= maxProjectileAge) {
        return null;
      }
      const position = normalizeWorldPoint(world, x, y);
      const target = normalizeWorldPoint(world, targetX, targetY);
      const originX = finiteNullableNumber(record.originX);
      const originY = finiteNullableNumber(record.originY);
      const origin = normalizeWorldPoint(world, originX ?? position.x, originY ?? position.y);
      const sourceDefinition = world.unitDefinitions.find((unit) => unit.id === sourceTypeId);
      const projectile: WorldProjectile = {
        id,
        sourceId,
        targetId: typeof record.targetId === "string" ? record.targetId : null,
        sourceTypeId,
        player,
        x: position.x,
        y: position.y,
        originX: origin.x,
        originY: origin.y,
        targetX: target.x,
        targetY: target.y,
        speed,
        damage,
        missileId,
        className: missileDefinition?.className ?? null,
        impactSoundId: missileDefinition?.impactSound ?? null,
        impactMissileId: missileDefinition?.impactMissile ?? null,
        splashFactor: Math.max(0, missileDefinition?.splashFactor ?? finiteNumberOr(record.splashFactor, 0)),
        range: Math.max(0, missileDefinition?.range ?? finiteNumberOr(record.range, 0)),
        canHitOwner: missileDefinition?.canHitOwner ?? (typeof record.canHitOwner === "boolean" ? record.canHitOwner : false),
        friendlyFire: missileDefinition?.friendlyFire ?? (typeof record.friendlyFire === "boolean" ? record.friendlyFire : false),
        canTargetLand: sourceUnit?.canTargetLand ?? sourceDefinition?.canTargetLand ?? kind !== "torpedo",
        canTargetSea: sourceUnit?.canTargetSea ?? sourceDefinition?.canTargetSea ?? (kind === "siege" || kind === "cannon" || kind === "torpedo"),
        canTargetAir: sourceUnit?.canTargetAir ?? sourceDefinition?.canTargetAir ?? (kind === "arrow" || kind === "axe"),
        bouncesRemaining: normalizeProjectileBouncesRemaining(record.bouncesRemaining, missileDefinition?.numBounces),
        hitUnitIds: Array.isArray(record.hitUnitIds)
          ? [...new Set(record.hitUnitIds.filter((id): id is string => typeof id === "string" && liveTopLevelUnitIds.has(id)))]
          : [],
        drawLevel: Math.max(0, Math.floor(finiteNumberOr(record.drawLevel, missileDefinition?.drawLevel ?? 0))),
        kind,
        age,
        delaySeconds: normalizeProjectileDelaySeconds(world, record.delaySeconds, missileId),
        ttlSeconds: normalizedTtlSeconds
      };
      const displayDamage = normalizeProjectileDisplayDamage(projectile.className, damage);
      if (displayDamage !== null) {
        projectile.displayDamage = displayDamage;
      }
      return projectile;
    })
    .filter((entry): entry is WorldState["projectiles"][number] => entry !== null);
}

function normalizeProjectileTtlSeconds(world: WorldState, value: unknown, missileId: string | null): number | null {
  const sourceTtlSeconds = sourceProjectileTtlSecondsForSave(world, missileId);
  if (sourceTtlSeconds !== null) {
    return sourceTtlSeconds;
  }
  const ttlSeconds = finiteNullableNumber(value);
  if (ttlSeconds === null) {
    return null;
  }
  return Math.max(0.001, Math.min(30, ttlSeconds));
}

function sourceProjectileTtlSecondsForSave(world: WorldState, missileId: string | null): number | null {
  if (!missileId) {
    return null;
  }
  const sourceTtlCycles = world.spellDefinitions
    .flatMap((spell) => [...spell.missileSpawns, ...spell.missileDamages])
    .filter((action) => action.missile === missileId && typeof action.ttl === "number" && action.ttl > 0)
    .map((action) => action.ttl as number);
  return sourceTtlCycles.length > 0 ? sourceCyclesToSeconds(world, Math.max(...sourceTtlCycles)) : null;
}

function normalizeProjectileDelaySeconds(world: WorldState, value: unknown, missileId: string | null): number {
  const delaySeconds = Math.max(0, finiteNumberOr(value, 0));
  if (!missileId || delaySeconds <= 0) {
    return 0;
  }
  const sourceDelayCycles = world.spellDefinitions
    .flatMap((spell) => [...spell.missileSpawns, ...spell.missileDamages])
    .filter((action) => action.missile === missileId && typeof action.delay === "number" && action.delay > 0)
    .map((action) => action.delay as number);
  if (sourceDelayCycles.length === 0) {
    return 0;
  }
  return Math.min(delaySeconds, sourceCyclesToSeconds(world, Math.max(...sourceDelayCycles)));
}

function normalizeProjectileBouncesRemaining(value: unknown, sourceBounces: number | undefined): number {
  const fallback = sourceBounces ?? 0;
  const bouncesRemaining = Math.max(0, Math.floor(finiteNumberOr(value, fallback)));
  return sourceBounces === undefined ? bouncesRemaining : Math.min(Math.max(0, Math.floor(sourceBounces)), bouncesRemaining);
}

function normalizeProjectileDamage(value: unknown): number | null {
  const damage = finiteNullableNumber(value);
  return damage === null ? null : Math.max(1, Math.floor(damage));
}

function normalizeProjectileDisplayDamage(className: string | null, damage: number): number | null {
  return className === "missile-class-hit" ? -Math.max(1, Math.floor(damage)) : null;
}

function normalizePendingAttacks(world: WorldState, value: unknown): WorldState["pendingAttacks"] {
  const liveUnitIds = new Set(world.units.map((unit) => unit.id));
  const playerIds = new Set(world.players.map((player) => player.id));
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id : "";
      const sourceId = typeof record.sourceId === "string" ? record.sourceId : "";
      const targetId = typeof record.targetId === "string" ? record.targetId : "";
      const source = world.units.find((unit) => unit.id === sourceId);
      const player = source?.player ?? null;
      const targetX = finiteNullableNumber(record.targetX);
      const targetY = finiteNullableNumber(record.targetY);
      const remainingSeconds = finiteNullableNumber(record.remainingSeconds);
      if (!id || !source || !liveUnitIds.has(sourceId) || (targetId && !liveUnitIds.has(targetId)) || player === null || !playerIds.has(player) || targetX === null || targetY === null || remainingSeconds === null || remainingSeconds <= 0) {
        return null;
      }
      const targetUnit = targetId ? world.units.find((unit) => unit.id === targetId) : null;
      if (targetUnit && !canAttackTarget(source, targetUnit, world)) {
        return null;
      }
      if (!targetUnit && !source.groundAttack) {
        return null;
      }
      const target = normalizeWorldPoint(world, targetX, targetY);
      const sourceLaunchDelaySeconds = sourceAttackAnimationLaunchDelayForSave(world, source);
      if (sourceLaunchDelaySeconds <= sourceCyclesToSeconds(world, 1)) {
        return null;
      }
      return {
        id,
        sourceId,
        targetId,
        player,
        targetX: target.x,
        targetY: target.y,
        remainingSeconds: Math.min(sourceLaunchDelaySeconds, remainingSeconds)
      };
    })
    .filter((entry): entry is WorldState["pendingAttacks"][number] => entry !== null);
}

function normalizeSpellEffects(world: WorldState, value: unknown): WorldState["spellEffects"] {
  const validKinds = new Set<WorldState["spellEffects"][number]["kind"]>(["heal", "fireball", "flame-shield", "death-coil", "slow", "haste", "bloodlust", "death-and-decay", "blizzard", "whirlwind", "polymorph", "exorcism", "holy-vision", "raise-dead", "runes", "invisibility", "unholy-armor", "summon", "explosion", "click-missile"]);
  const validSourceTypes = new Set(world.unitDefinitions.map((unit) => unit.id));
  const playerIds = new Set(world.players.map((player) => player.id));
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id : "";
      const rawKind = typeof record.kind === "string" ? record.kind : "";
      const kind = validKinds.has(rawKind as WorldState["spellEffects"][number]["kind"])
        ? rawKind as WorldState["spellEffects"][number]["kind"]
        : null;
      const player = finiteNullableNumber(record.player);
      const x = finiteNullableNumber(record.x);
      const y = finiteNullableNumber(record.y);
      const radius = finiteNullableNumber(record.radius);
      const age = finiteNullableNumber(record.age);
      const duration = finiteNullableNumber(record.duration);
      const sourceOwnedEffect = kind !== null && sourceOwnedSpellEffectKind(kind);
      const sourceUnit = sourceOwnedEffect && typeof record.sourceUnitId === "string"
        ? world.units.find((unit) => unit.id === record.sourceUnitId && unit.player === player)
        : null;
      const sourceUnitId = sourceUnit?.id ?? null;
      const sourceTypeId = !sourceOwnedEffect
        ? null
        : sourceUnit && validSourceTypes.has(sourceUnit.typeId)
        ? sourceUnit.typeId
        : typeof record.sourceTypeId === "string" && validSourceTypes.has(record.sourceTypeId)
          ? record.sourceTypeId
          : null;
      if (!id || !kind || player === null || !playerIds.has(player) || x === null || y === null || radius === null || age === null || duration === null || radius <= 0 || age < 0 || duration <= 0) {
        return null;
      }
      const spellId = restoredSpellEffectSpellId(world, record.spellId, kind);
      const missileId = restoredSpellEffectMissileId(world, record.missileId, kind, spellId);
      const point = normalizeWorldPoint(world, x, y);
      const sourceRadius = sourceSpellEffectRadiusForSave(world, kind, spellId, missileId, radius);
      const sourceDuration = sourceSpellEffectDurationForSave(world, kind, spellId, missileId, duration);
      const drawLevel = sourceSpellEffectDrawLevelForSave(world, missileId, spellId, record.drawLevel);
      if (sourceDuration <= 0 || age >= sourceDuration) {
        return null;
      }
      const effect: WorldState["spellEffects"][number] = {
        id,
        kind,
        player,
        x: point.x,
        y: point.y,
        radius: sourceRadius,
        age,
        duration: sourceDuration,
        sourceTypeId,
        sourceUnitId,
        missileId,
        spellId,
        drawLevel
      };
      return effect;
    })
    .filter((entry): entry is WorldState["spellEffects"][number] => entry !== null);
}

function sourceSpellEffectDrawLevelForSave(world: WorldState, missileId: string | null, spellId: string | null, value: unknown): number {
  const sourceMissileId = missileId ?? (spellId ? sourceSpellMissileIdForSave(world, spellId) : null);
  const sourceDrawLevel = sourceMissileId
    ? world.missileDefinitions.find((missile) => missile.id === sourceMissileId)?.drawLevel
    : null;
  return Math.max(0, Math.floor(finiteNumberOr(sourceDrawLevel ?? value, 0)));
}

function sourceOwnedSpellEffectKind(kind: WorldState["spellEffects"][number]["kind"]): boolean {
  return kind === "blizzard" || kind === "death-and-decay" || kind === "whirlwind" || kind === "runes" || kind === "flame-shield" || kind === "fireball" || kind === "explosion" || kind === "death-coil";
}

function restoredSpellEffectMissileId(world: WorldState, value: unknown, kind: WorldState["spellEffects"][number]["kind"], spellId: string | null): string | null {
  if (kind === "click-missile") {
    const clickMissileId = world.engineSettings.clickMissileId;
    return clickMissileId && world.missileDefinitions.some((missile) => missile.id === clickMissileId) ? clickMissileId : null;
  }
  const sourceMissileId = spellId ? sourceSpellMissileIdForSave(world, spellId) : null;
  if (sourceMissileId && world.missileDefinitions.some((missile) => missile.id === sourceMissileId)) {
    return sourceMissileId;
  }
  return typeof value === "string" && world.missileDefinitions.some((missile) => missile.id === value) ? value : null;
}

function sourceSpellMissileIdForSave(world: WorldState, spellId: string): string | null {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  return spell?.missileSpawns[0]?.missile ?? spell?.missileDamages[0]?.missile ?? spell?.missiles[0] ?? null;
}

function restoredSpellEffectSpellId(world: WorldState, value: unknown, kind: WorldState["spellEffects"][number]["kind"]): string | null {
  const savedSpell = typeof value === "string" ? world.spellDefinitions.find((spell) => spell.id === value) : undefined;
  if (savedSpell && sourceSpellMatchesEffectKind(world, savedSpell, kind)) {
    return savedSpell.id;
  }
  const inferred = sourceSpellIdForEffectKind(world, kind) ?? spellIdForEffectKind(kind);
  return inferred && world.spellDefinitions.some((spell) => spell.id === inferred) ? inferred : null;
}

function sourceSpellIdForEffectKind(world: WorldState, kind: WorldState["spellEffects"][number]["kind"]): string | null {
  return world.spellDefinitions.find((spell) => sourceSpellMatchesEffectKind(world, spell, kind))?.id ?? null;
}

function sourceSpellMatchesEffectKind(world: WorldState, spell: WorldState["spellDefinitions"][number], kind: WorldState["spellEffects"][number]["kind"]): boolean {
  if (kind === "heal") {
    return spell.adjustVitals.some((adjustment) => adjustment.variable === "HitPoints" && adjustment.amount > 0);
  }
  if (kind === "exorcism") {
    return spell.adjustVitals.some((adjustment) => adjustment.variable === "HitPoints" && adjustment.amount < 0);
  }
  if (kind === "blizzard" || kind === "death-and-decay") {
    return spell.areaBombardments.length > 0 && sourceSpellEffectText(spell).includes(kind === "blizzard" ? "blizzard" : "death and decay");
  }
  if (kind === "polymorph") {
    return spell.polymorphs.length > 0;
  }
  if (kind === "holy-vision") {
    return Boolean(sourceRevealerSummonForSave(world, spell))
      || sourceSpellEffectText(spell).includes("holy vision");
  }
  if (kind === "raise-dead") {
    return spell.summons.some((summon) => summon.requireCorpse === true);
  }
  if (kind === "summon") {
    return spell.summons.length > 0;
  }
  if (kind === "unholy-armor") {
    return spell.callbackUnitVariables.some((adjustment) => adjustment.variable === "UnholyArmor" && adjustment.value > 0);
  }
  if (kind === "slow" || kind === "haste" || kind === "bloodlust" || kind === "invisibility") {
    const sourceVariable = sourceStatusVariableForKind(kind);
    return Boolean(sourceVariable && spell.variableAdjustments.some((adjustment) => adjustment.variable === sourceVariable.variable && adjustment.amount > 0));
  }
  if (kind === "fireball" || kind === "flame-shield" || kind === "death-coil" || kind === "whirlwind" || kind === "runes") {
    if (sourceMissileMetadataMatchesEffectKind(world, spell, kind)) {
      return true;
    }
    const text = sourceSpellEffectText(spell);
    if (kind === "fireball") {
      return text.includes("fireball");
    }
    if (kind === "flame-shield") {
      return text.includes("flame shield") || text.includes("flame-shield");
    }
    if (kind === "death-coil") {
      return text.includes("death coil") || text.includes("death-coil");
    }
    if (kind === "whirlwind") {
      return text.includes("whirlwind");
    }
    return text.includes("runes") || text.includes("rune");
  }
  return false;
}

function sourceMissileMetadataMatchesEffectKind(world: WorldState, spell: WargusSpell, kind: WorldState["spellEffects"][number]["kind"]): boolean {
  const classNames = sourceSpellMissileClassNames(world, spell);
  if (kind === "flame-shield") {
    return classNames.some((className) => className.includes("flame-shield"));
  }
  if (kind === "death-coil") {
    return classNames.some((className) => className.includes("death-coil"));
  }
  if (kind === "whirlwind") {
    return classNames.some((className) => className.includes("whirlwind"));
  }
  if (kind === "runes") {
    return classNames.some((className) => className.includes("land-mine"));
  }
  if (kind === "fireball") {
    return spell.missileSpawns.some((spawn) => spawn.damage !== null && spawn.damage > 0)
      && classNames.some((className) => className.includes("point-to-point-bounce"));
  }
  return false;
}

function sourceSpellMissileClassNames(world: WorldState, spell: Pick<WargusSpell, "missiles" | "missileSpawns" | "missileDamages">): string[] {
  const missileIds = new Set([
    ...spell.missiles,
    ...spell.missileSpawns.map((spawn) => spawn.missile),
    ...spell.missileDamages.map((damage) => damage.missile)
  ]);
  return [...missileIds]
    .map((missileId) => world.missileDefinitions.find((missile) => missile.id === missileId)?.className ?? "")
    .filter((className) => className.length > 0)
    .map((className) => className.toLowerCase());
}

function sourceSpellEffectText(spell: WorldState["spellDefinitions"][number]): string {
  return [
    spell.showName,
    spell.soundWhenCast,
    ...spell.missiles,
    ...spell.missileSpawns.map((spawn) => spawn.missile),
    ...spell.missileDamages.map((damage) => damage.missile)
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase()
    .replace(/[-_]+/g, " ");
}

function sourceSpellEffectRadiusForSave(world: WorldState, kind: WorldState["spellEffects"][number]["kind"], spellId: string | null, missileId: string | null, fallback: number): number {
  if (!spellId) {
    return fallback;
  }
  if (kind === "holy-vision") {
    return sourceHolyVisionRadiusForSave(world, spellId) ?? fallback;
  }
  if (kind === "blizzard" || kind === "death-and-decay") {
    const sourceArea = world.spellDefinitions.find((spell) => spell.id === spellId)?.areaBombardments[0];
    return sourceArea ? sourceAreaBombardmentRadiusForSave(world, sourceArea) : fallback;
  }
  return Math.max(
    sourceMissileSplashRadiusForSave(world, missileId, fallback),
    sourceMissileVisualRadiusForSave(world, missileId, fallback)
  );
}

function sourceAreaBombardmentRadiusForSave(world: WorldState, sourceArea: NonNullable<WorldState["spellDefinitions"][number]["areaBombardments"][number]>): number {
  const fields = Math.max(1, Math.floor(sourceArea.fields ?? 1));
  const fieldSize = fields * world.tileSize;
  const startOffsetX = sourceArea.startOffsetX ?? -fieldSize / 2;
  const startOffsetY = sourceArea.startOffsetY ?? -fieldSize / 2;
  const maxX = Math.max(Math.abs(startOffsetX), Math.abs(startOffsetX + fieldSize));
  const maxY = Math.max(Math.abs(startOffsetY), Math.abs(startOffsetY + fieldSize));
  return Math.max(world.tileSize, Math.hypot(maxX, maxY));
}

function sourceSpellEffectDurationForSave(world: WorldState, kind: WorldState["spellEffects"][number]["kind"], spellId: string | null, missileId: string | null, fallback: number): number {
  if (!spellId) {
    return fallback;
  }
  if (kind === "holy-vision") {
    return sourceHolyVisionDurationForSave(world, spellId) ?? fallback;
  }
  if (kind === "blizzard" || kind === "death-and-decay") {
    const shards = world.spellDefinitions.find((spell) => spell.id === spellId)?.areaBombardments[0]?.shards;
    const missile = world.missileDefinitions.find((candidate) => candidate.id === missileId);
    const pulseTicks = missile && missile.blizzardSpeed > 0 ? missile.blizzardSpeed : 10;
    return typeof shards === "number" && shards > 0 ? sourceCyclesToSeconds(world, shards * pulseTicks) : fallback;
  }
  return spellMissileTtlSeconds(world, spellId, missileId ?? "") ?? sourceMissileAnimationDurationForSave(world, missileId, fallback);
}

function sourceHolyVisionRadiusForSave(world: WorldState, spellId: string): number | null {
  const revealer = sourceRevealerSummonForSave(world, world.spellDefinitions.find((spell) => spell.id === spellId));
  return revealer ? Math.max(1, revealer.sightRange ?? 0) * world.tileSize : null;
}

function sourceHolyVisionDurationForSave(world: WorldState, spellId: string): number | null {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  const revealer = sourceRevealerSummonForSave(world, spell);
  if (!spell || !revealer) {
    return null;
  }
  const summonCycles = spell.summons
    .filter((summon) => summon.unitTypeId === revealer.id && typeof summon.timeToLive === "number")
    .map((summon) => summon.timeToLive as number);
  if (summonCycles.length > 0) {
    return sourceCyclesToSeconds(world, Math.max(...summonCycles));
  }
  const callbackCycles = spell.callbackUnitVariables
    .filter((adjustment) => adjustment.unitTypeId === revealer.id && adjustment.variable === "TTL" && adjustment.value > 0)
    .map((adjustment) => adjustment.value);
  return callbackCycles.length > 0 ? sourceCyclesToSeconds(world, Math.max(...callbackCycles)) : null;
}

function sourceRevealerSummonForSave(world: WorldState, spell: Pick<WargusSpell, "summons"> | null | undefined): WargusUnit | null {
  if (!spell) {
    return null;
  }
  for (const summon of spell.summons) {
    const definition = world.unitDefinitions.find((unit) => unit.id === summon.unitTypeId);
    if (definition && (definition.revealer === true || definition.vanishes === true || definition.nonSolid === true)) {
      return definition;
    }
  }
  return null;
}

function sourceMissileSplashRadiusForSave(world: WorldState, missileId: string | null, fallback: number): number {
  const range = world.missileDefinitions.find((missile) => missile.id === missileId)?.range;
  return typeof range === "number" && range > 0 ? range * world.tileSize : fallback;
}

function sourceMissileVisualRadiusForSave(world: WorldState, missileId: string | null, fallback: number): number {
  const [width, height] = world.missileDefinitions.find((missile) => missile.id === missileId)?.size ?? [0, 0];
  return width > 0 || height > 0 ? Math.max(width, height) / 2 : fallback;
}

function sourceMissileAnimationDurationForSave(world: WorldState, missileId: string | null, fallback: number): number {
  const missile = world.missileDefinitions.find((candidate) => candidate.id === missileId);
  if (!missile || missile.frames <= 0 || missile.sleep <= 0) {
    return fallback;
  }
  return sourceCyclesToSeconds(world, missile.frames * missile.sleep);
}

function spellIdForEffectKind(kind: WorldState["spellEffects"][number]["kind"]): string | null {
  const ids: Partial<Record<WorldState["spellEffects"][number]["kind"], string>> = {
    heal: "spell-healing",
    fireball: "spell-fireball",
    "flame-shield": "spell-flame-shield",
    "death-coil": "spell-death-coil",
    slow: "spell-slow",
    haste: "spell-haste",
    bloodlust: "spell-bloodlust",
    "death-and-decay": "spell-death-and-decay",
    blizzard: "spell-blizzard",
    whirlwind: "spell-whirlwind",
    polymorph: "spell-polymorph",
    exorcism: "spell-exorcism",
    "holy-vision": "spell-holy-vision",
    "raise-dead": "spell-raise-dead",
    runes: "spell-runes",
    invisibility: "spell-invisibility",
    "unholy-armor": "spell-unholy-armor"
  };
  return ids[kind] ?? null;
}

function normalizeLoadedOrder(world: WorldState, order: unknown, unit: WorldState["units"][number]): WorldState["units"][number]["order"] {
  if (!order || typeof order !== "object") {
    return null;
  }
  const record = order as Record<string, unknown>;
  const kind = typeof record.kind === "string" ? record.kind : "";
  if (!canRestoreOrderForUnit(unit, kind)) {
    return null;
  }
  const target = normalizeWorldPoint(world, finiteNumberOr(record.targetX, unit.x), finiteNumberOr(record.targetY, unit.y));
  const targetX = target.x;
  const targetY = target.y;
  const path = normalizePath(world, record.path);
  const pathIndex = clampPathIndex(record.pathIndex, path);
  if (kind === "move" || kind === "attack-ground") {
    return { kind, targetX, targetY, path, pathIndex };
  }
  if (kind === "spell-cast") {
    const command = typeof record.command === "string" ? record.command : "";
    const spellId = typeof record.spellId === "string" ? record.spellId : "";
    const spellRange = sourceSpellRangeTilesForSave(world, spellId, finiteNumberOr(record.spellRange, 0));
    return command && spellId ? {
      kind,
      command,
      spellId,
      spellRange: Math.max(0, spellRange),
      targetX,
      targetY,
      spellState: record.spellState === "cast" ? "cast" : "move",
      path,
      pathIndex
    } : null;
  }
  if (kind === "explore") {
    return {
      kind,
      targetX,
      targetY,
      exploreRange: Math.max(0, Math.min(64, Math.floor(finiteNumberOr(record.exploreRange, 0)))),
      exploreWaitingCycle: Math.max(0, Math.min(5, Math.floor(finiteNumberOr(record.exploreWaitingCycle, 0)))),
      path,
      pathIndex
    };
  }
  if (kind === "unload-transport") {
    return {
      kind,
      unloadCargoUnitId: typeof record.unloadCargoUnitId === "string" ? record.unloadCargoUnitId : null,
      unloadState: record.unloadState === "move" || record.unloadState === "unload" ? record.unloadState : "find-dropzone",
      unloadRetries: Math.max(0, Math.min(20, Math.floor(finiteNumberOr(record.unloadRetries, 0)))),
      targetX,
      targetY,
      path,
      pathIndex
    };
  }
  if (kind === "attack") {
    const targetId = typeof record.targetId === "string" ? record.targetId : "";
    return targetId ? { kind, targetId, targetX, targetY, path, pathIndex } : null;
  }
  if (kind === "attack-move") {
    return {
      kind,
      targetId: typeof record.targetId === "string" ? record.targetId : null,
      targetX,
      targetY,
      path,
      pathIndex
    };
  }
  if (kind === "follow") {
    const targetId = typeof record.targetId === "string" ? record.targetId : "";
    return targetId ? {
      kind,
      targetId,
      attackTargetId: typeof record.attackTargetId === "string" ? record.attackTargetId : null,
      followRange: Math.max(1, Math.min(64, Math.floor(finiteNumberOr(record.followRange, 1)))),
      targetX,
      targetY,
      path,
      pathIndex
    } : null;
  }
  if (kind === "defend") {
    const targetId = typeof record.targetId === "string" ? record.targetId : "";
    return targetId ? {
      kind,
      targetId,
      defendState: record.defendState === "defending" ? "defending" : "moving",
      defendRange: Math.max(1, Math.min(64, Math.floor(finiteNumberOr(record.defendRange, 1)))),
      targetX,
      targetY,
      path,
      pathIndex
    } : null;
  }
  if (kind === "patrol") {
    return {
      kind,
      targetId: typeof record.targetId === "string" ? record.targetId : null,
      ...normalizeAnchorPoint(world, record.anchorX, record.anchorY, unit),
      targetX,
      targetY,
      ...normalizePatrolPoint(world, record.patrolX, record.patrolY, targetX, targetY),
      returning: Boolean(record.returning),
      patrolRange: Math.max(0, Math.min(64, Math.floor(finiteNumberOr(record.patrolRange, 0)))),
      patrolWaitingCycle: Math.max(0, Math.min(5, Math.floor(finiteNumberOr(record.patrolWaitingCycle, 0)))),
      path,
      pathIndex
    };
  }
  if (kind === "hold") {
    return {
      kind,
      targetId: typeof record.targetId === "string" ? record.targetId : null,
      ...normalizeAnchorPoint(world, record.anchorX, record.anchorY, unit)
    };
  }
  if (kind === "repair") {
    const targetId = typeof record.targetId === "string" ? record.targetId : "";
    const repairCycleTicks = sourceRepairCycleTicksForSave(world, unit);
    const repairCycle = Math.max(0, Math.min(repairCycleTicks, finiteNumberOr(record.repairCycle, finiteNumberOr(record.repairBank, 0))));
    return targetId ? { kind, targetId, targetX, targetY, repairCycle, path, pathIndex } : null;
  }
  if (kind === "load-transport" || kind === "build" || kind === "build-oil-platform") {
    const targetId = typeof record.targetId === "string" ? record.targetId : "";
    if (!targetId) {
      return null;
    }
    if (kind === "load-transport") {
      const boardWaitTicks = sourceBoardWaitTicksForSave(world, 10);
      return {
        kind,
        targetId,
        boardState: record.boardState === "wait" || record.boardState === "enter" ? record.boardState : "move",
        boardRange: Math.max(1, Math.min(64, Math.floor(finiteNumberOr(record.boardRange, 1)))),
        boardWaitTicks: Math.max(0, Math.min(boardWaitTicks, Math.floor(finiteNumberOr(record.boardWaitTicks, 0)))),
        targetX,
        targetY,
        path,
        pathIndex
      };
    }
    if (kind === "build") {
      const buildCycleTicks = sourceBuildCycleTicksForSave(world, unit);
      return {
        kind,
        targetId,
        targetX,
        targetY,
        buildCycle: Math.max(0, Math.min(buildCycleTicks, finiteNumberOr(record.buildCycle, finiteNumberOr(record.buildBank, 0)))),
        path,
        pathIndex
      };
    }
    return { kind, targetId, targetX, targetY, path, pathIndex, preserveQueue: Boolean(record.preserveQueue) };
  }
  if (kind === "harvest") {
    const resource = record.resource === "gold" || record.resource === "wood" || record.resource === "oil" ? record.resource : null;
    const phase = record.phase === "to-resource" || record.phase === "gathering" || record.phase === "to-dropoff" ? record.phase : "to-resource";
    if (!resource || !canRestoreHarvestResourceForUnit(unit, resource)) {
      return null;
    }
    const sourceGatherSeconds = sourceResourceGatherStepSecondsForSave(world, unit, resource);
    const sourceReturnSeconds = sourceResourceReturnStepSecondsForSave(world, unit, resource);
    return {
      kind,
      targetId: typeof record.targetId === "string" ? record.targetId : null,
      resource,
      phase,
      targetX,
      targetY,
      tileX: finiteNullableNumber(record.tileX),
      tileY: finiteNullableNumber(record.tileY),
      dropoffId: typeof record.dropoffId === "string" ? record.dropoffId : null,
      ...normalizeDropoffPoint(world, record.dropoffX, record.dropoffY, unit),
      gatherSeconds: Math.max(0, Math.min(sourceGatherSeconds, finiteNumberOr(record.gatherSeconds, 0))),
      returnSeconds: Math.max(0, Math.min(sourceReturnSeconds, finiteNumberOr(record.returnSeconds, 0))),
      path,
      pathIndex
    };
  }
  return null;
}

function sourceSpellRangeTilesForSave(world: WorldState, spellId: string, fallback: number): number {
  const range = world.spellDefinitions.find((spell) => spell.id === spellId)?.range;
  if (range === "infinite") {
    return Math.max(world.map.width, world.map.height);
  }
  return typeof range === "number" ? range : fallback;
}

function sourceAttackAnimationLaunchDelayForSave(world: WorldState, unit: WorldState["units"][number]): number {
  if (!unit.animation) {
    return 0;
  }
  const animation = world.animationDefinitions.find((definition) => definition.id === unit.animation);
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

function sourceRepairCycleTicksForSave(world: WorldState, unit: WorldState["units"][number]): number {
  const animation = world.animationDefinitions.find((definition) => definition.id === unit.animation);
  const frames = animation?.actions.Repair ?? [];
  const ticks = frames.reduce((total, frame) => total + Math.max(0, Math.floor(frame.wait)), 0);
  return Math.max(1, ticks || sourceOrderRetryTicksForSave(world, 30));
}

function sourceBuildCycleTicksForSave(world: WorldState, unit: WorldState["units"][number]): number {
  const animation = world.animationDefinitions.find((definition) => definition.id === unit.animation);
  const frames = (animation?.actions.Build?.length ? animation.actions.Build : animation?.actions.Repair) ?? [];
  const ticks = frames.reduce((total, frame) => total + Math.max(0, Math.floor(frame.wait)), 0);
  return Math.max(1, ticks || sourceOrderRetryTicksForSave(world, 30));
}

function sourceBoardWaitTicksForSave(world: WorldState, sourceCycles: number): number {
  return sourceOrderRetryTicksForSave(world, sourceCycles);
}

function sourceResourceGatherStepSecondsForSave(world: WorldState, unit: WorldState["units"][number], resource: string): number {
  const cycles = resourceWaitAtResourceCyclesForUnit(unit, resource);
  return Math.max(sourceCyclesToSeconds(world, 1), sourceCyclesToSeconds(world, cycles)) * sourceResourceHarvestDurationSecondsForPlayer(world, unit.player, resource) / 0.75;
}

function sourceResourceReturnStepSecondsForSave(world: WorldState, unit: WorldState["units"][number], resource: string): number {
  const cycles = resourceWaitAtDepotCyclesForUnit(unit, resource);
  return Math.max(sourceCyclesToSeconds(world, 1), sourceCyclesToSeconds(world, cycles)) * sourceResourceReturnDurationSecondsForPlayer(world, unit.player, resource) / 0.25;
}

function canRestoreOrderForUnit(unit: WorldState["units"][number], kind: string): boolean {
  if (unit.hitPoints <= 0 || unit.construction) {
    return false;
  }
  if (kind === "move" || kind === "spell-cast" || kind === "explore" || kind === "load-transport" || kind === "follow" || kind === "defend") {
    return isRestoredMobileUnit(unit);
  }
  if (kind === "attack" || kind === "attack-move" || kind === "patrol" || kind === "hold") {
    return isRestoredMobileUnit(unit) && unit.canAttack;
  }
  if (kind === "attack-ground") {
    return unit.canAttack && unit.groundAttack;
  }
  if (kind === "repair" || kind === "build") {
    return isRestoredWorker(unit);
  }
  if (kind === "build-oil-platform") {
    return isRestoredOilTanker(unit);
  }
  if (kind === "unload-transport") {
    return unit.cargoCapacity > 0 && unit.canTransport.length > 0 && unit.cargo.length > 0;
  }
  if (kind === "harvest") {
    return isRestoredWorker(unit) || isRestoredOilTanker(unit);
  }
  return false;
}

function isRestoredMobileUnit(unit: WorldState["units"][number]): boolean {
  return unit.speed > 0 && (unit.kind === "land" || unit.kind === "naval" || unit.kind === "fly");
}

function isRestoredWorker(unit: WorldState["units"][number]): boolean {
  return unit.gatherResources.includes("gold") || unit.gatherResources.includes("wood");
}

function isRestoredOilTanker(unit: WorldState["units"][number]): boolean {
  return unit.gatherResources.includes("oil");
}

function canRestoreHarvestResourceForUnit(unit: WorldState["units"][number], resource: "gold" | "wood" | "oil"): boolean {
  return unit.gatherResources.includes(resource);
}

function normalizeWorldPoint(world: WorldState, x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(world.map.width * world.tileSize - 1, x)),
    y: Math.max(0, Math.min(world.map.height * world.tileSize - 1, y))
  };
}

function normalizeAnchorPoint(world: WorldState, x: unknown, y: unknown, unit: WorldState["units"][number]): { anchorX: number; anchorY: number } {
  const point = normalizeWorldPoint(world, finiteNumberOr(x, unit.x), finiteNumberOr(y, unit.y));
  return { anchorX: point.x, anchorY: point.y };
}

function normalizePatrolPoint(world: WorldState, x: unknown, y: unknown, targetX: number, targetY: number): { patrolX: number; patrolY: number } {
  const point = normalizeWorldPoint(world, finiteNumberOr(x, targetX), finiteNumberOr(y, targetY));
  return { patrolX: point.x, patrolY: point.y };
}

function normalizeDropoffPoint(world: WorldState, x: unknown, y: unknown, unit: WorldState["units"][number]): { dropoffX: number; dropoffY: number } {
  const point = normalizeWorldPoint(world, finiteNumberOr(x, unit.x), finiteNumberOr(y, unit.y));
  return { dropoffX: point.x, dropoffY: point.y };
}

function normalizePath(world: WorldState, value: unknown): { x: number; y: number }[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((point) => {
      if (!point || typeof point !== "object") {
        return null;
      }
      const record = point as Record<string, unknown>;
      const x = finiteNullableNumber(record.x);
      const y = finiteNullableNumber(record.y);
      return x === null || y === null || !isLoadedMapPoint(world, x, y) ? null : { x, y };
    })
    .filter((point): point is { x: number; y: number } => point !== null);
}

function clampPathIndex(value: unknown, path: { x: number; y: number }[]): number {
  if (path.length === 0) {
    return 0;
  }
  const index = Math.floor(finiteNumberOr(value, 0));
  return Math.max(0, Math.min(path.length - 1, index));
}

function finiteNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeNumberArray(value: unknown, expectedLength: number, fallback: number[]): number[] {
  if (!Array.isArray(value) || value.length !== expectedLength) {
    return fallback;
  }
  return value.map((entry) => typeof entry === "number" && Number.isFinite(entry) ? entry : 0);
}

function normalizeResources(value: unknown, fallback: Record<string, number> = {}): Record<string, number> {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    gold: Math.max(0, finiteNumberOr(record.gold, fallback.gold ?? 0)),
    wood: Math.max(0, finiteNumberOr(record.wood, fallback.wood ?? 0)),
    oil: Math.max(0, finiteNumberOr(record.oil, fallback.oil ?? 0))
  };
}

function normalizeSpeedFactors(value: unknown, fallback: WargusSpeedFactors): WargusSpeedFactors {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    build: positiveNumberOr(record.build, fallback.build),
    train: positiveNumberOr(record.train, fallback.train),
    upgrade: positiveNumberOr(record.upgrade, fallback.upgrade),
    research: positiveNumberOr(record.research, fallback.research),
    resourceHarvest: normalizeResourceSpeedFactors(record.resourceHarvest, fallback.resourceHarvest),
    resourceReturn: normalizeResourceSpeedFactors(record.resourceReturn, fallback.resourceReturn)
  };
}

function normalizeResourceSpeedFactors(value: unknown, fallback: Record<string, number>): Record<string, number> {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const resources = new Set([...Object.keys(fallback), ...Object.keys(record), "gold", "wood", "oil"]);
  const normalized: Record<string, number> = {};
  for (const resource of resources) {
    normalized[resource] = positiveNumberOr(record[resource], fallback[resource] ?? 1);
  }
  return normalized;
}

function positiveNumberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : Math.max(1, fallback || 1);
}

function normalizePlayerStats(value: unknown): ReturnType<typeof createPlayerStats> {
  const defaults = createPlayerStats();
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    totalUnits: nonNegativeIntegerOr(record.totalUnits, defaults.totalUnits),
    totalBuildings: nonNegativeIntegerOr(record.totalBuildings, defaults.totalBuildings),
    unitsKilled: nonNegativeIntegerOr(record.unitsKilled, defaults.unitsKilled),
    buildingsRazed: nonNegativeIntegerOr(record.buildingsRazed, defaults.buildingsRazed),
    unitsLost: nonNegativeIntegerOr(record.unitsLost, defaults.unitsLost),
    buildingsLost: nonNegativeIntegerOr(record.buildingsLost, defaults.buildingsLost),
    pointsKilled: nonNegativeIntegerOr(record.pointsKilled, defaults.pointsKilled),
    pointsLost: nonNegativeIntegerOr(record.pointsLost, defaults.pointsLost),
    goldMined: nonNegativeIntegerOr(record.goldMined, defaults.goldMined),
    woodHarvested: nonNegativeIntegerOr(record.woodHarvested, defaults.woodHarvested),
    oilHarvested: nonNegativeIntegerOr(record.oilHarvested, defaults.oilHarvested)
  };
}

function nonNegativeIntegerOr(value: unknown, fallback: number): number {
  return Math.max(0, Math.floor(finiteNumberOr(value, fallback)));
}

function normalizeLastSeenBuildings(world: WorldState, value: unknown): WorldState["lastSeenBuildings"] {
  if (!Array.isArray(value)) {
    return [];
  }
  const definitionsById = new Map(world.unitDefinitions.map((unit) => [unit.id, unit]));
  const playerIds = new Set(world.players.map((player) => player.id));
  const seen = new Set<string>();
  return value
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const unitId = typeof record.unitId === "string" ? record.unitId : "";
      const typeId = typeof record.typeId === "string" ? record.typeId : "";
      const definition = definitionsById.get(typeId);
      if (!unitId || seen.has(unitId) || !definition || !isBuildingDefinition(definition)) {
        return null;
      }
      const point = normalizeWorldPoint(world, finiteNumberOr(record.x, 0), finiteNumberOr(record.y, 0));
      const tileWidth = Math.max(definition.tileSize?.[0] ?? 1, 1);
      const tileHeight = Math.max(definition.tileSize?.[1] ?? 1, 1);
      const footprint = boxDimensionsForUnit(definition, "building");
      const player = Math.floor(finiteNumberOr(record.player, 15));
      seen.add(unitId);
      return {
        unitId,
        typeId,
        player: playerIds.has(player) ? player : 15,
        x: point.x,
        y: point.y,
        radius: footprint.radius,
        drawLevel: Math.max(0, Math.floor(finiteNumberOr(record.drawLevel, definition.drawLevel ?? 0))),
        facing: Math.max(0, Math.min(7, Math.floor(finiteNumberOr(record.facing, 4)))),
        animation: definition.animation,
        frameWidth: tileWidth === 1 ? 72 : tileWidth * 32,
        frameHeight: tileHeight === 1 ? 72 : tileHeight * 32,
        seenTick: Math.max(0, Math.floor(finiteNumberOr(record.seenTick, world.tick)))
      };
    })
    .filter((entry): entry is WorldState["lastSeenBuildings"][number] => entry !== null);
}

function normalizeVisibilityReveals(world: WorldState, value: unknown): WorldState["visibilityReveals"] {
  if (!Array.isArray(value)) {
    return [];
  }
  const playerIds = new Set(world.players.map((player) => player.id));
  return value
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const player = Math.floor(finiteNumberOr(record.player, world.visibilityPlayer));
      if (!playerIds.has(player)) {
        return null;
      }
      const point = normalizeWorldPoint(world, finiteNumberOr(record.x, 0), finiteNumberOr(record.y, 0));
      const radiusTiles = Math.max(1, Math.min(12, Math.floor(finiteNumberOr(record.radiusTiles, 1))));
      const sourceRevealTicks = sourceOrderRetryTicksForSave(world, 90);
      const remainingTicks = Math.max(1, Math.min(sourceRevealTicks, Math.floor(finiteNumberOr(record.remainingTicks, sourceRevealTicks))));
      return { player, x: point.x, y: point.y, radiusTiles, remainingTicks };
    })
    .filter((entry): entry is WorldState["visibilityReveals"][number] => entry !== null);
}

function normalizeRevelationTimers(world: WorldState, value: unknown): WorldState["revelationTimers"] {
  if (!Array.isArray(value)) {
    return [];
  }
  const playerIds = new Set(world.players.map((player) => player.id));
  return value
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const player = Math.floor(finiteNumberOr(record.player, -1));
      if (!playerIds.has(player)) {
        return null;
      }
      const sourceRevelationTicks = sourceDurationSecondsToTicksForSave(world, 30);
      return {
        player,
        remainingTicks: Math.max(0, Math.min(sourceRevelationTicks, Math.floor(finiteNumberOr(record.remainingTicks, sourceRevelationTicks))))
      };
    })
    .filter((entry): entry is WorldState["revelationTimers"][number] => entry !== null)
    .sort((left, right) => left.player - right.player);
}

function normalizeForestRegrowth(world: WorldState, value: unknown): WorldState["forestRegrowth"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const x = Math.floor(finiteNumberOr(record.x, -1));
      const y = Math.floor(finiteNumberOr(record.y, -1));
      if (x < 0 || y < 0 || x >= world.map.width || y >= world.map.height) {
        return null;
      }
      const tile = Math.max(0, Math.floor(finiteNumberOr(record.tile, 0)));
      const sourceRegrowthTicks = sourceForestRegrowthTicksForSave(world);
      const remainingTicks = Math.max(1, Math.min(sourceRegrowthTicks, Math.floor(finiteNumberOr(record.remainingTicks, sourceDurationSecondsToTicksForSave(world, 1)))));
      return { x, y, tile, remainingTicks };
    })
    .filter((entry): entry is WorldState["forestRegrowth"][number] => entry !== null);
}

function sourceForestRegrowthTicksForSave(world: WorldState): number {
  const regenerationSeconds = Math.max(1, Math.floor(world.engineSettings.forestRegenerationSeconds || 60 * 30));
  return sourceDurationSecondsToTicksForSave(world, regenerationSeconds);
}

function sourceDurationSecondsToTicksForSave(world: WorldState, seconds: number): number {
  return Math.max(1, Math.round(Math.max(0, seconds) * sourceDefaultGameSpeed(world)));
}

function normalizeForestResources(world: WorldState, value: unknown): WorldState["forestResources"] {
  if (!Array.isArray(value)) {
    return initialForestResourcesForWorld(world);
  }
  const resources = value
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const x = Math.floor(finiteNumberOr(record.x, -1));
      const y = Math.floor(finiteNumberOr(record.y, -1));
      if (x < 0 || y < 0 || x >= world.map.width || y >= world.map.height) {
        return null;
      }
      const tile = world.tiles[y * world.map.width + x] ?? 0;
      if (!isSourceHarvestableWoodTile(world, tile)) {
        return null;
      }
      const amount = Math.max(1, Math.min(defaultForestTileResources(), Math.floor(finiteNumberOr(record.amount, defaultForestTileResources()))));
      return { x, y, amount };
    })
    .filter((entry): entry is WorldState["forestResources"][number] => entry !== null);
  return resources.length > 0 ? resources : initialForestResourcesForWorld(world);
}

function normalizePlayerIdArray(value: unknown, fallback: number[], world: WorldState): number[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const playerIds = new Set(world.players.map((player) => player.id));
  return [...new Set(value
    .map((entry) => Math.floor(finiteNumberOr(entry, -1)))
    .filter((player) => player !== 15 && playerIds.has(player)))]
    .sort((a, b) => a - b);
}

function finiteNumberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function sourceDebugFlagsOr(value: unknown, fallback: string[]): string[] {
  const source = Array.isArray(value) ? value : fallback;
  return [...new Set(source.filter((entry): entry is string => typeof entry === "string" && SOURCE_DEBUG_FLAGS.has(entry)))].sort();
}

function selectionStyleOr(value: unknown, fallback: string): string {
  return value === "corners" || value === "ellipse" || value === "circle" ? value : fallback;
}

function sourceVideoShaderOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function sourceViewportModeOr(value: unknown, fallback: number): number {
  const mode = Math.floor(finiteNumberOr(value, fallback));
  return Math.max(0, Math.min(4, mode));
}

function sourceVideoDimensionOr(value: unknown, fallback: number): number {
  return Math.max(320, Math.min(3840, Math.floor(finiteNumberOr(value, fallback))));
}

function sourceGroupKeysOr(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const keys = [...value].filter((key, index, all) => key.trim().length > 0 && all.indexOf(key) === index).join("");
  return keys.length > 0 ? keys.slice(0, 12) : fallback;
}

function sourcePlayerNameOr(value: unknown, fallback: string | null): string | null {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized.slice(0, 24) : fallback;
}

function sourceRightButtonActionOr(value: unknown, fallback: WargusEngineSettings["rightButtonAction"]): WargusEngineSettings["rightButtonAction"] {
  return value === "move" || value === "attack" ? value : fallback;
}

function sourceRevealMapModeOr(value: unknown, fallback: WargusEngineSettings["revealMapMode"]): WargusEngineSettings["revealMapMode"] {
  return value === "hidden" || value === "known" || value === "explored" ? value : fallback;
}

function damageMissileIdOr(world: WorldState, value: unknown, fallback: string | null): string | null {
  if (typeof value !== "string") {
    return fallback && world.missileDefinitions.some((missile) => missile.id === fallback) ? fallback : null;
  }
  return world.missileDefinitions.some((missile) => missile.id === value) ? value : fallback;
}

function sourceVolumeOr(value: unknown, fallback: number): number {
  return Math.max(0, Math.min(255, Math.round(finiteNumberOr(value, fallback))));
}

function sourceScrollSpeedOr(value: unknown, fallback: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(finiteNumberOr(value, fallback))));
}

function sourceFastForwardCycleOr(value: unknown, fallback: number): number {
  return Math.max(0, Math.min(480, Math.round(finiteNumberOr(value, fallback))));
}

function sourceFrameSkipOr(value: unknown, fallback: number): number {
  return Math.max(0, Math.min(15, Math.round(finiteNumberOr(value, fallback))));
}

function sourceDifficultyOr(value: unknown, fallback: number): number {
  return Math.max(1, Math.min(5, Math.floor(finiteNumberOr(value, fallback))));
}

function sourceGameSpeedOr(value: unknown, fallback: number): number {
  return Math.max(15, Math.min(75, Math.round(finiteNumberOr(value, fallback))));
}

function sourceDelayMsOr(value: unknown, fallback: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(finiteNumberOr(value, fallback))));
}
