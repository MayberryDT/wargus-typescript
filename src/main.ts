import { Application, Container, Graphics, Sprite, Text } from "pixi.js";
import "./styles.css";
import type { WargusEngineSettings, WargusManifest, WargusMap, WargusMapSetup } from "./wargus/types";
import { chooseInitialMap, filteredMapPickerMatches as findMapPickerMatches, loadWargusManifest, nextCampaignMapFor } from "./wargus/manifest";
import { loadMapSetup } from "./wargus/mapSetup";
import { applyFixedBrowserDemoWorldPresentation, FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID, fixedBrowserDemoInitialSelection, isFixedBrowserDemoMap } from "./wargus/demoScenario";
import { createFixedDemoMissionRuntimeState, fixedDemoMissionSummary, resetFixedDemoMissionRuntimeState, updateFixedDemoMission, type FixedDemoMissionSummary } from "./wargus/demoMission";
import { exportSavedGame, getAutosaveSummary, getSavedGameSummary, importSavedGameJson, loadSavedGame, type LoadedSavedGame } from "./wargus/saveGame";
import { createInitialWorld, createWorldUnit, getPlayerSupply, isInvisibleUtilityUnit, isUnitHiddenInConstruction, isUnitInsideResourceSource, isUnitVisibleToPlayer, unitFootprintHalfSize, updateVisibility, type WorldState, type WorldUnit } from "./simulation/world";
import { canAttackTarget, canIssueTargetedSpellAt, canStartBuildingPlacementByType, canTrainUnitAt, clampSelectionToSourceLimit, findNextIdleWorker, findSelectableUnitAt, isSelectionStillValid, issueAttackOrder, issueCancelProductionOrder, issueCancelResearchOrder, issueGroupTargetedSpellOrder, issueHarvestWoodOrder, issuePendingWorldCommandAt, issueResearchOrder, issueSourceRightButtonOrder, issueTrainUnitOrder, issueUnloadCargoUnitOrder, nextGameSpeed, previousGameSpeed, pruneControlGroups, replaceControlGroups, selectVisibleUnitsOfType, shouldKeepPendingWorldCommandAfterIssue, simulateWorld, sourceActionButtonsForHud, sourceBuildButtonsForHud, sourceBuildEligibilityDebug, sourceBuildPageButtonForHud, sourceButtonHasExecutableContext, sourceButtonVisibleForHud, sourceDefaultGameSpeed, sourceDoubleClickDelayMs, sourceGameSpeedFromMultiplier, sourceGameSpeedMultiplier, sourceGroupButtonScopeForSelection, sourceHudCommandForAction, sourceInstantSpellCommandForSpellId, sourceResearchButtonsForHud, sourceRootBuildButtonsForHud, sourceRuntimeGameSpeedMultiplier, sourceSpellButtonsForHud, sourceSpellCommandForSpellId, sourceTrainButtonsForHud, sourceUpgradeButtonsForHud, type PendingWorldCommand } from "./simulation/orders";
import { beginCameraDrag, centerCameraOnTile as centerCameraOnTileBase, centerCameraOnWorldPoint as centerCameraOnWorldPointBase, clampCameraToWorld, createCamera, createCameraInput, currentPlayableWorldBounds as currentPlayableWorldBoundsBase, dragCameraByPointer, endCameraDrag, playableCameraViewport as playableCameraViewportBase, resetCameraEdgeScroll, resetCameraInput, updateCamera, updateCameraEdgeScroll, zoomCameraAtScreenPoint as zoomCameraAtScreenPointBase, type CameraInput, type CameraViewport } from "./view/camera";
import { renderWorld, visualWorldPointForUnit } from "./view/renderWorld";
import { availableCommands, renderHud, type HudCommand, type HudCommandId, type HudMapCommandId, type HudMenuOverlayId } from "./view/renderHud";
import type { SourceDiplomacyDraft } from "./view/sourceUiHelpers";
import type { UnitTextureAtlas } from "./view/unitTextureAtlas";
import type { TileTextureAtlas } from "./view/tileTextureAtlas";
import type { FogTextureAtlas } from "./view/fogTextureAtlas";
import type { IconTextureAtlas } from "./view/iconTextureAtlas";
import type { MissileTextureAtlas } from "./view/missileTextureAtlas";
import type { StatusDecorationAtlas } from "./view/statusDecorationAtlas";
import type { SourcePanelAtlas } from "./view/sourcePanelAtlas";
import type { ResourceUiAtlas } from "./view/resourceUiAtlas";
import type { SourceButtonStyleAtlas } from "./view/sourceButtonStyleAtlas";
import type { WargusBitmapFontAtlas } from "./view/wargusBitmapFontAtlas";
import { sourceCursorCssForWorldState, sourceCursorFileForState, sourceCursorRenderStateForWorldState } from "./view/sourceCursor";
import { findGameSoundId as findSourceGameSoundId, sourceMapAreaRect, sourceMouseDragScrollScale, sourceMouseEdgeScrollScale, sourceMouseScrollingEnabled, sourceScreenPointIsInViewport, sourceScrollMargins, sourceStereoPanForUnit as sourceStereoPanForUnitBase, sourceViewportScreenPoint } from "./view/sourceUiHelpers";
import { applyMapPickerKey, matchOverlayCommandForKey, sourceCenterSelectedKeyAction, sourceIngameMapCommandForKey, sourceOverlayKeyAction, sourcePreferenceKeyCommand, sourceSpeedKeyAction, sourceTrackUnitKeyAction } from "./view/sourceInput";
import { localPlayerRace as localPlayerRaceForWorld } from "./simulation/worldSelectors";
import { AudioEngine } from "./audio/audioEngine";
import { createAudioCueState, ensureSourceMusicStarted, maybeStartMatchMusicCue, resetBriefingAudioCue, resetMatchMusicCue, startBriefingAudioCue } from "./audio/audioCues";
import { renderAlertPingOverlays, renderBuildPlacementOverlay, renderPendingCommandOverlay, renderSelectionDragOverlay, renderSourceMapNamePopup, type SourceMapNamePopupState } from "./view/renderOverlays";
import { addHudMessage as addHudMessageToState, clearHudMessageState, createHudMessageState, pruneHudMessageState } from "./view/hudMessages";
import { createCampaignProgressState, loadCampaignProgress, recordCampaignProgress, resetCampaignProgressSession } from "./wargus/campaignProgress";
import { sourceLeaveStopScrollingEnabled, sourceMouseDragScrollEnabled, sourcePauseOnLeaveEnabled } from "./view/sourceLifecycle";
import { clearSelectionClickState, completeSelectionDrag, createSelectionClickState, updateSelectionDrag, type SelectionDragState } from "./view/selectionInput";
import { createUnitAtlasLazyLoadState, ensureMissingUnitAtlases, resetUnitAtlasLazyLoadState } from "./view/unitAtlasLazyLoad";
import { createSaveCommandState, saveCurrentAutosave as saveAutosaveForContext, type SaveCommandContext } from "./view/saveCommands";
import { applyControlGroupKey, clearControlGroupRecallState, createControlGroupRecallState } from "./view/controlGroupInput";
import { executeHudCommandForSelection } from "./view/hudCommandExecution";
import { drainWorldEventsWithFeedback } from "./view/worldEventFeedback";
import { executeSelectionHotkey, type SelectionHotkeyResult } from "./view/selectionHotkeys";
import { applySourceCheatKey, createSourceCheatInputState, resetSourceCheatInputState } from "./view/sourceCheatInput";
import { executeMapCommandForRuntime } from "./view/mapCommands";
import { handleMinimapCommand } from "./view/minimapInput";
import { handleWorldPointerDown } from "./view/worldPointerInput";
import { loadCompleteWorldViewAssets, loadCoreWorldViewAssets } from "./view/worldViewAssets";
import { isSourceHarvestableWoodTile } from "./simulation/passability";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) {
  throw new Error("Missing #app root");
}

const app = new Application();
await app.init({
  background: "#050708",
  resizeTo: window,
  antialias: false,
  autoDensity: true,
  resolution: Math.min(window.devicePixelRatio, 2)
});

root.appendChild(app.canvas);

const worldLayer = new Container();
const hudLayer = new Container();
const cursorLayer = new Container();
const mapLayer = new Container();
const unitLayer = new Container();
const fogLayer = new Container();
const selectionLayer = new Container();
const overlayLayer = new Container();
worldLayer.addChild(mapLayer, unitLayer, fogLayer, selectionLayer);
app.stage.addChild(worldLayer, hudLayer, overlayLayer, cursorLayer);

const loading = new Text({
  text: "Index Wargus data with: npm run index:wargus",
  style: {
    fill: "#d8d3bd",
    fontFamily: "system-ui, sans-serif",
    fontSize: 18
  }
});
loading.x = 24;
loading.y = 24;
app.stage.addChild(loading);

let manifest: WargusManifest | null = null;
let activeMap: WargusMap | null = null;
let world: WorldState | null = null;
let selectedUnitIds: string[] = [];
const controlGroups: Record<number, string[]> = {};

let pendingWorldCommand: PendingWorldCommand | null = null;
let commandPage = 0;
let unitAtlases = new Map<string, UnitTextureAtlas>();
let missileAtlases = new Map<string, MissileTextureAtlas>();
const unitAtlasLazyLoadState = createUnitAtlasLazyLoadState();
let tileAtlas: TileTextureAtlas | null = null;
let fogAtlas: FogTextureAtlas | null = null;
let iconAtlas: IconTextureAtlas | null = null;
let statusDecorationAtlas: StatusDecorationAtlas | null = null;
let sourcePanelAtlas: SourcePanelAtlas | null = null;
let sourceButtonStyleAtlas: SourceButtonStyleAtlas | null = null;
let resourceUiAtlas: ResourceUiAtlas | null = null;
let wargusBitmapFontAtlas: WargusBitmapFontAtlas | null = null;
let audioEngine: AudioEngine | null = null;
let selectionDrag: SelectionDragState | null = null;
let pointerWorldPosition: { x: number; y: number } | null = null;
let pointerScreenPosition: { x: number; y: number } | null = null;
let cursorSprite: Sprite | null = null;
let cursorSpriteKey: string | null = null;
const selectionClickState = createSelectionClickState();
let lastSelectionPointerDown: { x: number; y: number; at: number } | null = null;
const controlGroupRecallState = createControlGroupRecallState();
const audioCueState = createAudioCueState();
const hudMessageState = createHudMessageState();
const fixedDemoMissionState = createFixedDemoMissionRuntimeState();
const saveCommandState = createSaveCommandState();
const sourceMapNamePopupState: SourceMapNamePopupState = { showNameDelayTick: 0, showNameTimeTick: 0 };
let paused = false;
let gameSpeed = 1;
let autosaveClock = 0;
let sourceShowOrdersUntilTick = 0;
let sourceShowOrdersShiftHeld = false;
let briefingOpen = false;
let titleScreenOpen = true;
let menuOverlay: HudMenuOverlayId | null = null;
let diplomacyDraft: SourceDiplomacyDraft | null = null;
let preferencesDraft: WargusEngineSettings | null = null;
let trackedViewportUnitId: string | null = null;
const sourceCheatInputState = createSourceCheatInputState();
const campaignProgressState = createCampaignProgressState();
const mapPickerState: { open: boolean; query: string; maps: WargusMap[] } = { open: false, query: "", maps: [] };

const MAX_FRAME_DELTA_SECONDS = 0.1;
const FIXED_DEMO_MAX_FRAME_DELTA_SECONDS = 0.35;
const FIXED_DEMO_HUD_REFRESH_SECONDS = 0.5;
const FIXED_DEMO_MOVEMENT_PACE_MULTIPLIER = 1.3;
const BROWSER_SMOKE_REFRESH_MS = 250;
const BROWSER_SMOKE_PAIR_REFRESH_MS = 2000;
const PLAYTEST_TELEMETRY_STORAGE_KEY = "wargus-ts-playtest-telemetry-v1";
const PLAYTEST_TELEMETRY_MAX_ENTRIES = 600;
const PLAYTEST_TELEMETRY_SAMPLE_MS = 1000;
const PLAYTEST_TELEMETRY_STORAGE_FLUSH_MS = 5000;
const PLAYTEST_TELEMETRY_JANK_THRESHOLDS_MS = {
  frame: 50,
  update: 20,
  render: 24,
  smoke: 12
} as const;
const camera = createCamera();
const cameraInput: CameraInput = createCameraInput();
let activeSourceViewportIndex = 0;
let sourceRenderedFrameCounter = 0;
let fixedDemoHudRefreshClock = 0;
let fixedDemoHudRenderKey = "";
let lastBrowserSmokePublishMs = 0;
const sourceViewportCameras: Array<{ x: number; y: number; zoom: number }> = [];
type BrowserSmokePairCache = {
  world: WorldState | null;
  atMs: number;
  harvestPair: ReturnType<typeof browserSmokeHarvestPair>;
  combatPair: ReturnType<typeof browserSmokeCombatPair>;
  firstSpellPair: ReturnType<typeof browserSmokeSpellPair>;
  firstTrainPair: ReturnType<typeof browserSmokeTrainPair>;
};
let browserSmokePairCache: BrowserSmokePairCache | null = null;
let browserSmokeScenarioSnapshot: BrowserSmokeScenarioSnapshot | null = null;
const renderPerformance = {
  averageFrameMs: null as number | null,
  averageUpdateMs: null as number | null,
  averageRenderMs: null as number | null,
  averageSmokeMs: null as number | null,
  lastFrameMs: null as number | null,
  lastUpdateMs: null as number | null,
  lastRenderMs: null as number | null,
  lastSmokeMs: null as number | null,
  hudRenderedLastFrame: false
};
type PlaytestTelemetryEntry = {
  kind: "sample" | "jank";
  atMs: number;
  wallTimeIso: string;
  activeMapPath: string | null;
  tick: number | null;
  unitCount: number;
  selectedUnitCount: number;
  camera: { x: number; y: number; zoom: number };
  gameSpeed: number;
  paused: boolean;
  titleScreenOpen: boolean;
  briefingOpen: boolean;
  performance: typeof renderPerformance;
  jankReasons: string[];
  displayObjects: {
    mapLayerChildren: number;
    unitLayerChildren: number;
    fogLayerChildren: number;
    hudLayerChildren: number;
    overlayLayerChildren: number;
  };
  fog: {
    visibleTiles: number;
    exploredTiles: number;
    unexploredTiles: number;
  };
  memory: {
    usedJsHeapSize: number | null;
    totalJsHeapSize: number | null;
    jsHeapSizeLimit: number | null;
  };
};
let playtestTelemetryLog: PlaytestTelemetryEntry[] = [];
let playtestTelemetryLoaded = false;
let lastPlaytestTelemetrySampleMs = 0;
let lastPlaytestTelemetryFlushMs = 0;
let lastPlaytestTelemetryJankMs = 0;

type CameraButton = "up" | "down" | "left" | "right" | "zoomIn" | "zoomOut";
type BrowserSmokeOrderTarget = { x: number; y: number };
type BrowserSmokeCommand = {
  id: string;
  key: string;
  label: string;
  disabled: boolean;
  icon: string | null;
  sourceAction: string | null;
  sourceValue: string | null;
  sourceLevel: number | null;
  sourcePos: number | null;
};
type BrowserSmokeSourceCommand = Pick<BrowserSmokeCommand, "id" | "key" | "icon" | "sourceAction" | "sourceValue" | "sourceLevel" | "sourcePos">;
type BrowserSmokeScenarioSnapshot = {
  allowedUnitTypes: string[];
  allowedUpgradeTypes: string[];
  researchedUpgrades: WorldState["researchedUpgrades"];
  playerResources: Array<{ id: number; resources: Record<string, number> }>;
};
type BrowserSmokeCommandResult = {
  commandPage: number;
  pendingWorldCommandKind: string | null;
  selectedUnitIds: string[];
  commandCard: BrowserSmokeCommand[];
  handled: boolean | null;
  feedback: "acknowledge" | "click" | "error" | null;
};
type BrowserSmokeState = {
  worldLoaded: boolean;
  activeMapPath: string | null;
  mapWidth: number | null;
  mapHeight: number | null;
  unitCount: number;
  playerCount: number;
  visibilityPlayer: number | null;
  camera: {
    x: number;
    y: number;
    zoom: number;
  };
  titleScreenOpen: boolean;
  briefingOpen: boolean;
  paused: boolean;
  gameSpeed: number;
  sourceGameSpeedDefault: number | null;
  commandPage: number;
  commandCard: BrowserSmokeCommand[];
  selectedUnitCount: number;
  selectedUnitIds: string[];
  selectedUnitTypes: string[];
  ownedUnitScreenPoints: Array<{ id: string; typeId: string; x: number; y: number; screenX: number; screenY: number }>;
  ownedUnitVisualScreenPoints: Array<{ id: string; typeId: string; x: number; y: number; screenX: number; screenY: number }>;
  firstOwnedMovableScreenPoint: BrowserSmokeOrderTarget | null;
  firstOwnedMovableWorldPoint: BrowserSmokeOrderTarget | null;
  firstOwnedHarvestWorkerWorldPoint: BrowserSmokeOrderTarget | null;
  firstHarvestTargetWorldPoint: BrowserSmokeOrderTarget | null;
  firstOwnedAttackerWorldPoint: BrowserSmokeOrderTarget | null;
  firstAttackTargetWorldPoint: BrowserSmokeOrderTarget | null;
  firstAttackTargetHitPoints: number | null;
  firstAttackTargetId: string | null;
  firstSpellCasterWorldPoint: BrowserSmokeOrderTarget | null;
  firstSpellTargetWorldPoint: BrowserSmokeOrderTarget | null;
  firstSpellCommand: string | null;
  firstSpellId: string | null;
  firstSpellCasterMana: number | null;
  spellEffectCount: number;
  firstTrainBuildingWorldPoint: BrowserSmokeOrderTarget | null;
  firstTrainUnitTypeId: string | null;
  firstTrainBuildingQueueLength: number | null;
  firstTrainBuildingQueueRemainingSeconds: number | null;
  firstSelectedWorldPoint: BrowserSmokeOrderTarget | null;
  firstSelectedVisualWorldPoint: BrowserSmokeOrderTarget | null;
  firstSelectedRallyPoint: BrowserSmokeOrderTarget | null;
  firstSelectedOrderKind: string | null;
  firstSelectedOrderTarget: BrowserSmokeOrderTarget | null;
  firstSelectedOrderResource: string | null;
  firstSelectedSpeed: number | null;
  firstSelectedBaseSpeed: number | null;
  firstSelectedAutoRepair: boolean | null;
  firstSelectedAutoCastSpells: string[] | null;
  fixedDemoMission: FixedDemoMissionSummary | null;
  fixedDemoMovementPaceMultiplier: number;
  aiStates: Array<{
    player: number;
    enabled: boolean;
    strategy: string;
    sourceScriptId: string | null;
    sourceScriptIndex: number;
    sourceScriptForces: number;
    attackForceSize: number;
    workerTarget: number;
    nextAttackTick: number;
  }>;
  performance: {
    averageFrameMs: number | null;
    averageUpdateMs: number | null;
    averageRenderMs: number | null;
    averageSmokeMs: number | null;
    lastFrameMs: number | null;
    lastUpdateMs: number | null;
    lastRenderMs: number | null;
    lastSmokeMs: number | null;
    hudRenderedLastFrame: boolean;
  };
  displayObjects: {
    mapLayerChildren: number;
    unitLayerChildren: number;
    hudLayerChildren: number;
    overlayLayerChildren: number;
  };
  playtestTelemetry: {
    entryCount: number;
    lastKind: PlaytestTelemetryEntry["kind"] | null;
    lastJankReasons: string[];
    exportHookInstalled: boolean;
  };
  firstSelectedMana: number | null;
  firstSelectedProductionQueueLength: number | null;
  firstSelectedProductionQueueRemainingSeconds: number | null;
  firstSelectedActiveResearchCount: number | null;
  firstSelectedResourcesHeld: number | null;
  firstSelectedCarriedResource: string | null;
  firstSelectedCargoCount: number | null;
  firstSelectedCargoCapacity: number | null;
  visibilityPlayerResources: Record<string, number> | null;
  audioContextCreated: boolean;
  audioContextState: AudioContextState | null;
  audioBufferedSounds: number;
  audioCurrentMusic: string | null;
  audioStereoSound: boolean | null;
  audioUnlocked: boolean;
  audioPlayAttempts: number;
  audioPlayStarts: number;
  audioPlayFailures: number;
  audioDecodeFailures: number;
  audioLastSoundId: string | null;
  audioLastSoundFile: string | null;
  audioLastError: string | null;
  audioHtmlPlayStarts: number;
  audioHtmlPlayFailures: number;
  pendingWorldCommandKind: string | null;
  tick: number | null;
  matchStatus: string | null;
};
type BrowserSmokeWorldSummary = {
  ok: boolean;
  activeMapPath: string | null;
  mapWidth: number | null;
  mapHeight: number | null;
  unitCount: number;
  playerCount: number;
  visibilityPlayer: number | null;
  saveRoundtripOk: boolean;
  saveRoundtripUnitCount: number;
  saveRoundtripPlayerCount: number;
  error?: string;
};
type BrowserSmokeActiveSaveSummary = BrowserSmokeWorldSummary & {
  tick: number | null;
};
type BrowserSmokePendingActionFixtureResult = {
  ok: boolean;
  error?: string;
  commandId?: string | null;
  target?: BrowserSmokeOrderTarget | null;
  expectedOrderKind?: string | null;
} & ReturnType<typeof browserSmokeCommandResult>;

declare global {
  interface Window {
    __WARGUS_TS_SMOKE_STATE__?: BrowserSmokeState;
    __WARGUS_TS_CENTER_FIRST_OWNED_MOVABLE__?: () => boolean;
    __WARGUS_TS_LOAD_MAP__?: (path: string) => Promise<boolean>;
    __WARGUS_TS_PUBLISH_SMOKE__?: () => void;
    __WARGUS_TS_SELECT_FIRST_UNIT_TYPE__?: (typeId: string) => boolean;
    __WARGUS_TS_SELECT_FIXTURE_UNIT_TYPE__?: (typeId: string) => ({ ok: boolean; error?: string } & ReturnType<typeof browserSmokeCommandResult>);
    __WARGUS_TS_SELECT_MIXED_FIXTURE_UNIT_TYPES__?: (typeIds: string[]) => ({ ok: boolean; error?: string } & ReturnType<typeof browserSmokeCommandResult>);
    __WARGUS_TS_SELECT_SOURCE_UPGRADE_FIXTURE__?: () => ({ ok: boolean; error?: string } & ReturnType<typeof browserSmokeCommandResult>);
    __WARGUS_TS_SELECT_CARRYING_WORKER_FIXTURE__?: () => ({ ok: boolean; error?: string } & ReturnType<typeof browserSmokeCommandResult>);
    __WARGUS_TS_SELECT_LOADED_TRANSPORT_FIXTURE__?: (typeId?: string) => ({ ok: boolean; error?: string } & ReturnType<typeof browserSmokeCommandResult>);
    __WARGUS_TS_SELECT_OIL_TANKER_FIXTURE__?: (typeId?: string, carrying?: boolean) => ({ ok: boolean; error?: string; target?: BrowserSmokeOrderTarget | null } & ReturnType<typeof browserSmokeCommandResult>);
    __WARGUS_TS_SELECT_OIL_TANKER_BUILD_FIXTURE__?: (typeId?: string) => ({ ok: boolean; error?: string; platformTypeId?: string | null; target?: BrowserSmokeOrderTarget | null } & ReturnType<typeof browserSmokeCommandResult>);
    __WARGUS_TS_SELECT_SOURCE_PENDING_ACTION_FIXTURE__?: (action: "move" | "attack" | "attack-ground" | "patrol" | "repair" | "harvest") => BrowserSmokePendingActionFixtureResult;
    __WARGUS_TS_SELECT_SOURCE_HARVEST_RALLY_FIXTURE__?: (producerTypeId: string) => BrowserSmokePendingActionFixtureResult;
    __WARGUS_TS_SELECT_SOURCE_TRAIN_FIXTURE__?: (producerTypeId: string, unitTypeId: string) => ({ ok: boolean; error?: string } & ReturnType<typeof browserSmokeCommandResult>);
    __WARGUS_TS_SELECT_SOURCE_CANCEL_FIXTURE__?: (kind: "train" | "research" | "construction") => ({ ok: boolean; error?: string } & ReturnType<typeof browserSmokeCommandResult>);
    __WARGUS_TS_SELECT_SOURCE_SPELL_FIXTURE__?: (casterTypeId: string, spellId: string) => ({ ok: boolean; error?: string; command?: string | null; instantCommand?: string | null; target?: BrowserSmokeOrderTarget | null } & ReturnType<typeof browserSmokeCommandResult>);
    __WARGUS_TS_SELECT_SOURCE_RESEARCH_FIXTURE__?: (typeId: string, upgradeId: string) => ({ ok: boolean; error?: string } & ReturnType<typeof browserSmokeCommandResult>);
    __WARGUS_TS_EXPECTED_SOURCE_COMMANDS__?: (page?: number) => BrowserSmokeSourceCommand[];
    __WARGUS_TS_EXECUTE_HUD_COMMAND__?: (command: string, input?: { ctrlKey?: boolean; shiftKey?: boolean }) => BrowserSmokeCommandResult;
    __WARGUS_TS_EXECUTE_SELECTION_HOTKEY__?: (code: string, input?: { shiftKey?: boolean }) => BrowserSmokeCommandResult;
    __WARGUS_TS_ISSUE_PENDING_WORLD_COMMAND_AT__?: (x: number, y: number, shiftKey?: boolean) => { issued: boolean; commandPage: number; pendingWorldCommandKind: string | null; selectedUnitIds: string[]; commandCard: BrowserSmokeCommand[] };
    __WARGUS_TS_DEBUG_SELECTED_BUILD__?: () => Array<{ unitId: string; typeId: string; buildingTypeId: string; canStart: boolean; gates: Record<string, boolean> }>;
    __WARGUS_TS_DEBUG_SELECTED_TRAIN__?: () => Array<{ unitId: string; typeId: string; unitTypeId: string; canTrain: boolean; executable: boolean; visible: boolean; queueLength: number; activeResearchCount: number; queuedResearchCount: number; resources: Record<string, number>; supply: { used: number; cap: number; queued: number }; demand: number }>;
    __WARGUS_TS_CREATE_WORLD_FOR_MAP__?: (path: string) => Promise<BrowserSmokeWorldSummary>;
    __WARGUS_TS_SAVE_ACTIVE_WORLD_ROUNDTRIP__?: () => BrowserSmokeActiveSaveSummary;
    __WARGUS_TS_ISSUE_FIRST_HARVEST__?: () => boolean;
    __WARGUS_TS_ISSUE_FIRST_GOLD_HARVEST__?: () => boolean;
    __WARGUS_TS_ISSUE_FIRST_WOOD_HARVEST__?: () => boolean;
    __WARGUS_TS_ISSUE_FIRST_ATTACK__?: () => boolean;
	    __WARGUS_TS_ISSUE_FIXED_DEMO_DEFENSE__?: () => { issued: boolean; attackerIds: string[]; targetIds: string[]; raidActive: boolean };
	    __WARGUS_TS_ISSUE_FIXED_DEMO_FINAL_ATTACK__?: () => { issued: boolean; attackerIds: string[]; targetId: string | null; targetHitPoints: number | null; matchStatus: string | null };
	    __WARGUS_TS_FIXED_DEMO_OBJECTIVE_TARGET__?: () => { id: string; typeId: string; player: number; hitPoints: number; x: number; y: number } | null;
	    __WARGUS_TS_ISSUE_FIRST_SPELL__?: () => boolean;
    __WARGUS_TS_ISSUE_FIRST_TRAIN__?: () => boolean;
    __WARGUS_TS_PLAY_AUDIO_FIXTURE__?: () => Promise<{ ok: boolean; beforeStarts: number; afterStarts: number; currentMusic: string | null; lastSoundFile: string | null; lastError: string | null }>;
    __WARGUS_TS_UNIT_HIT_POINTS__?: (unitId: string) => number | null;
    __WARGUS_TS_DEBUG_UNITS__?: () => Array<{ id: string; typeId: string; player: number; x: number; y: number; order: string | null }>;
    __WARGUS_TS_PLAYTEST_LOG__?: () => PlaytestTelemetryEntry[];
    __WARGUS_TS_EXPORT_PLAYTEST_LOG__?: () => string;
    __WARGUS_TS_CLEAR_PLAYTEST_LOG__?: () => number;
  }
}

const browserSmokeStateEnabled = new URLSearchParams(window.location.search).has("smoke");
installPlaytestTelemetryHooks();

function captureBrowserSmokeScenarioSnapshot(): void {
  if (!world || !browserSmokeStateEnabled) {
    return;
  }
  const researchedUpgrades: WorldState["researchedUpgrades"] = {};
  for (const [playerId, upgradeIds] of Object.entries(world.researchedUpgrades)) {
    researchedUpgrades[Number(playerId)] = [...upgradeIds];
  }
  browserSmokeScenarioSnapshot = {
    allowedUnitTypes: [...world.allowedUnitTypes],
    allowedUpgradeTypes: [...world.allowedUpgradeTypes],
    researchedUpgrades,
    playerResources: world.players.map((player) => ({
      id: player.id,
      resources: { ...player.resources }
    }))
  };
}

function restoreBrowserSmokeScenarioSnapshot(): void {
  if (!world || !browserSmokeScenarioSnapshot) {
    return;
  }
  world.allowedUnitTypes = [...browserSmokeScenarioSnapshot.allowedUnitTypes];
  world.allowedUpgradeTypes = [...browserSmokeScenarioSnapshot.allowedUpgradeTypes];
  const researchedUpgrades: WorldState["researchedUpgrades"] = {};
  for (const [playerId, upgradeIds] of Object.entries(browserSmokeScenarioSnapshot.researchedUpgrades)) {
    researchedUpgrades[Number(playerId)] = [...upgradeIds];
  }
  world.researchedUpgrades = researchedUpgrades;
  for (const player of world.players) {
    const snapshot = browserSmokeScenarioSnapshot.playerResources.find((candidate) => candidate.id === player.id);
    if (snapshot) {
      player.resources = { ...snapshot.resources };
    }
  }
}

function clearBrowserSmokeFixtures(): void {
  if (!world) {
    return;
  }
  world.units = world.units.filter((unit) => !unit.id.startsWith("__smoke-fixture-"));
  world.corpses = world.corpses.filter((corpse) => !corpse.id.startsWith("__smoke-fixture-"));
  world.activeResearch = world.activeResearch.filter((research) => !research.buildingId.startsWith("__smoke-fixture-"));
  world.queuedResearch = world.queuedResearch.filter((research) => !research.buildingId.startsWith("__smoke-fixture-"));
  restoreBrowserSmokeScenarioSnapshot();
}

function readyBrowserSmokeFixtureUnit(unit: WorldUnit): WorldUnit {
  if (unit.manaEnabled) {
    unit.mana = unit.maxMana;
  }
  if (world?.buttonDefinitions.some((button) => (
    (button.action === "train-unit" || button.action === "upgrade-to")
    && button.forUnit.includes(unit.typeId)
  ))) {
    unit.supply = Math.max(unit.supply, 200);
  }
  return unit;
}

const BROWSER_SMOKE_RESEARCH_PREREQUISITES: Record<string, string[]> = {
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

function browserSmokeResearchRequirements(upgradeId: string, seen: Set<string> = new Set()): { unitTypeIds: string[]; upgradeIds: string[] } {
  const unitTypeIds = new Set<string>();
  const upgradeIds = new Set<string>();
  if (!world || seen.has(upgradeId)) {
    return { unitTypeIds: [], upgradeIds: [] };
  }
  const nextSeen = new Set(seen);
  nextSeen.add(upgradeId);
  const addUpgrade = (requiredUpgradeId: string): void => {
    if (requiredUpgradeId === upgradeId) {
      return;
    }
    upgradeIds.add(requiredUpgradeId);
    const nested = browserSmokeResearchRequirements(requiredUpgradeId, nextSeen);
    for (const unitTypeId of nested.unitTypeIds) {
      unitTypeIds.add(unitTypeId);
    }
    for (const nestedUpgradeId of nested.upgradeIds) {
      upgradeIds.add(nestedUpgradeId);
    }
  };
  for (const requiredUpgradeId of BROWSER_SMOKE_RESEARCH_PREREQUISITES[upgradeId] ?? []) {
    addUpgrade(requiredUpgradeId);
  }
  for (const requiredUpgradeId of browserSmokeSourceConversionResearchPrerequisites(upgradeId)) {
    addUpgrade(requiredUpgradeId);
  }
  for (const requiredUpgradeId of browserSmokeSourceModifierResearchPrerequisites(upgradeId)) {
    addUpgrade(requiredUpgradeId);
  }
  const dependencyRule = world.dependencyRules.find((rule) => rule.id === upgradeId);
  const dependencyAlternative = dependencyRule?.alternatives.find((alternative) => alternative.length > 0) ?? [];
  for (const dependencyId of dependencyAlternative) {
    if (dependencyId.startsWith("unit-")) {
      unitTypeIds.add(dependencyId);
    } else if (dependencyId.startsWith("upgrade-")) {
      addUpgrade(dependencyId);
    }
  }
  return { unitTypeIds: [...unitTypeIds], upgradeIds: [...upgradeIds] };
}

function browserSmokeSourceConversionResearchPrerequisites(upgradeId: string): string[] {
  if (!world) {
    return [];
  }
  const upgrade = world.upgradeDefinitions.find((candidate) => candidate.id === upgradeId);
  if (!upgrade || (upgrade.conversions ?? []).length > 0) {
    return [];
  }
  const required = new Set<string>();
  for (const appliedTypeId of upgrade.appliesTo) {
    for (const conversionUpgrade of world.upgradeDefinitions) {
      if (conversionUpgrade.id !== upgradeId && (conversionUpgrade.conversions ?? []).some((conversion) => conversion.toTypeId === appliedTypeId)) {
        required.add(conversionUpgrade.id);
      }
    }
  }
  return [...required];
}

function browserSmokeSourceModifierResearchPrerequisites(upgradeId: string): string[] {
  if (!world) {
    return [];
  }
  const upgrade = world.upgradeDefinitions.find((candidate) => candidate.id === upgradeId);
  if (!upgrade || upgrade.modifiers.length === 0 || upgrade.appliesTo.length === 0 || upgrade.conversions.length > 0) {
    return [];
  }
  const signature = browserSmokeSourceModifierUpgradeSignature(upgrade);
  const cost = browserSmokeSourceUpgradeCostRank(upgrade);
  const predecessors = world.upgradeDefinitions
    .filter((candidate) => candidate.id !== upgrade.id
      && candidate.modifiers.length > 0
      && candidate.conversions.length === 0
      && browserSmokeSourceModifierUpgradeSignature(candidate) === signature
      && browserSmokeSourceUpgradeCostRank(candidate) < cost)
    .sort((left, right) => browserSmokeSourceUpgradeCostRank(right) - browserSmokeSourceUpgradeCostRank(left));
  return predecessors.length > 0 ? [predecessors[0].id] : [];
}

function browserSmokeSourceModifierUpgradeSignature(upgrade: WorldState["upgradeDefinitions"][number]): string {
  const appliesTo = [...upgrade.appliesTo].sort().join(",");
  const modifiers = upgrade.modifiers
    .map((modifier) => `${modifier.stat}:${modifier.value}`)
    .sort()
    .join(",");
  return `${appliesTo}|${modifiers}`;
}

function browserSmokeSourceUpgradeCostRank(upgrade: WorldState["upgradeDefinitions"][number]): number {
  return upgrade.costs.time + upgrade.costs.gold + upgrade.costs.wood + upgrade.costs.oil;
}

function browserSmokeResearchConversionTypeIds(upgradeIds: string[]): string[] {
  if (!world) {
    return [];
  }
  const conversionTypeIds = new Set<string>();
  for (const upgradeId of upgradeIds) {
    const upgrade = world.upgradeDefinitions.find((candidate) => candidate.id === upgradeId);
    for (const conversion of upgrade?.conversions ?? []) {
      conversionTypeIds.add(conversion.toTypeId);
    }
  }
  return [...conversionTypeIds];
}

function browserSmokeTrainRequirements(unitTypeId: string): { unitTypeIds: string[]; upgradeIds: string[] } {
  const unitTypeIds = new Set<string>();
  const upgradeIds = new Set<string>();
  if (!world) {
    return { unitTypeIds: [], upgradeIds: [] };
  }
  const dependencyRule = world.dependencyRules.find((rule) => rule.id === unitTypeId);
  const dependencyAlternative = dependencyRule?.alternatives.find((alternative) => alternative.length > 0) ?? [];
  const addUpgrade = (upgradeId: string): void => {
    upgradeIds.add(upgradeId);
    const nested = browserSmokeResearchRequirements(upgradeId);
    for (const nestedUnitTypeId of nested.unitTypeIds) {
      unitTypeIds.add(nestedUnitTypeId);
    }
    for (const nestedUpgradeId of nested.upgradeIds) {
      upgradeIds.add(nestedUpgradeId);
    }
  };
  for (const dependencyId of dependencyAlternative) {
    if (dependencyId.startsWith("unit-")) {
      unitTypeIds.add(dependencyId);
    } else if (dependencyId.startsWith("upgrade-")) {
      addUpgrade(dependencyId);
    }
  }
  return { unitTypeIds: [...unitTypeIds], upgradeIds: [...upgradeIds] };
}

if (browserSmokeStateEnabled) {
  window.__WARGUS_TS_CENTER_FIRST_OWNED_MOVABLE__ = () => {
    const unit = browserSmokeFirstOwnedMovableUnit();
    if (!world || !unit) {
      return false;
    }
    centerCameraOnWorldPoint(world, unit.x, unit.y);
    publishBrowserSmokeState(true);
    return true;
  };
  window.__WARGUS_TS_LOAD_MAP__ = async (path) => {
    const map = manifest?.maps.find((candidate) => candidate.path === path);
    if (!map) {
      return false;
    }
    await loadPlayableMap(map);
    publishBrowserSmokeState(true);
    return Boolean(world && activeMap?.path === path);
  };
  window.__WARGUS_TS_PUBLISH_SMOKE__ = () => {
    publishBrowserSmokeState(true);
  };
  window.__WARGUS_TS_SELECT_FIRST_UNIT_TYPE__ = (typeId) => {
    if (!world) {
      return false;
    }
    clearBrowserSmokeFixtures();
    const unit = world.units.find((candidate) => (
      candidate.player === world?.visibilityPlayer
      && candidate.typeId === typeId
      && candidate.hitPoints > 0
      && !isUnitHiddenInConstruction(candidate)
      && !isInvisibleUtilityUnit(candidate)
      && !isUnitInsideResourceSource(candidate)
    ));
    if (!unit) {
      return false;
    }
    selectedUnitIds = clampSelectionToSourceLimit(world, [unit.id]);
    pendingWorldCommand = null;
    commandPage = 0;
    centerCameraOnWorldPoint(world, unit.x, unit.y);
    publishBrowserSmokeState(true);
    return true;
  };
  window.__WARGUS_TS_SELECT_FIXTURE_UNIT_TYPE__ = (typeId) => {
    if (!world || !manifest) {
      return { ok: false, error: "missing world", ...browserSmokeCommandResult() };
    }
    const definition = world.unitDefinitions.find((unit) => unit.id === typeId);
    if (!definition) {
      return { ok: false, error: "missing unit definition", ...browserSmokeCommandResult() };
    }
    clearBrowserSmokeFixtures();
    const player = world.players.find((candidate) => candidate.id === world!.visibilityPlayer) ?? world.players[0];
    if (player) {
      player.resources.gold = Math.max(player.resources.gold ?? 0, 100000);
      player.resources.wood = Math.max(player.resources.wood ?? 0, 100000);
      player.resources.oil = Math.max(player.resources.oil ?? 0, 100000);
    }
    const tileX = Math.max(1, Math.min(world.map.width - Math.max(definition.tileSize?.[0] ?? 1, 1) - 1, Math.floor((player?.startX ?? 8 * 32) / 32) + 3));
    const tileY = Math.max(1, Math.min(world.map.height - Math.max(definition.tileSize?.[1] ?? 1, 1) - 1, Math.floor((player?.startY ?? 8 * 32) / 32) + 3));
    const unit = createWorldUnit({
      unit: definition,
      id: `__smoke-fixture-${definition.id}-${world.nextUnitSerial++}`,
      player: world.visibilityPlayer,
      tileX,
      tileY,
      tileset: activeMap?.setup?.tileset ?? null
    });
    readyBrowserSmokeFixtureUnit(unit);
    world.units.push(unit);
    updateVisibility(world);
    selectedUnitIds = clampSelectionToSourceLimit(world, [unit.id]);
    pendingWorldCommand = null;
    commandPage = 0;
    centerCameraOnWorldPoint(world, unit.x, unit.y);
    publishBrowserSmokeState(true);
    return { ok: true, ...browserSmokeCommandResult() };
  };
  window.__WARGUS_TS_SELECT_MIXED_FIXTURE_UNIT_TYPES__ = (typeIds) => {
    if (!world || !manifest) {
      return { ok: false, error: "missing world", ...browserSmokeCommandResult() };
    }
    if (!Array.isArray(typeIds) || typeIds.length < 2) {
      return { ok: false, error: "need at least two fixture unit types", ...browserSmokeCommandResult() };
    }
    const definitions = typeIds.map((typeId) => world?.unitDefinitions.find((unit) => unit.id === typeId) ?? null);
    const missing = typeIds.find((_, index) => !definitions[index]);
    if (missing) {
      return { ok: false, error: `missing unit definition ${missing}`, ...browserSmokeCommandResult() };
    }
    clearBrowserSmokeFixtures();
    const player = world.players.find((candidate) => candidate.id === world!.visibilityPlayer) ?? world.players[0];
    if (player) {
      player.resources.gold = Math.max(player.resources.gold ?? 0, 100000);
      player.resources.wood = Math.max(player.resources.wood ?? 0, 100000);
      player.resources.oil = Math.max(player.resources.oil ?? 0, 100000);
    }
    const baseTileX = Math.max(1, Math.min(world.map.width - 8, Math.floor((player?.startX ?? 8 * 32) / 32) + 3));
    const baseTileY = Math.max(1, Math.min(world.map.height - 8, Math.floor((player?.startY ?? 8 * 32) / 32) + 3));
    const units = definitions.map((definition, index) => readyBrowserSmokeFixtureUnit(createWorldUnit({
      unit: definition!,
      id: `__smoke-fixture-${definition!.id}-${world!.nextUnitSerial++}`,
      player: world!.visibilityPlayer,
      tileX: baseTileX + index,
      tileY: baseTileY + index,
      tileset: activeMap?.setup?.tileset ?? null
    })));
    world.units.push(...units);
    updateVisibility(world);
    selectedUnitIds = clampSelectionToSourceLimit(world, units.map((unit) => unit.id));
    pendingWorldCommand = null;
    commandPage = 0;
    centerCameraOnWorldPoint(world, units[0].x, units[0].y);
    publishBrowserSmokeState(true);
    return { ok: true, ...browserSmokeCommandResult() };
  };
  window.__WARGUS_TS_SELECT_SOURCE_PENDING_ACTION_FIXTURE__ = (action) => {
    if (!world || !manifest) {
      return { ok: false, error: "missing world", commandId: null, target: null, expectedOrderKind: null, ...browserSmokeCommandResult() };
    }
    const fixtureByAction = {
      move: { unitTypeId: "unit-footman", commandId: "move", expectedOrderKind: "move" },
      attack: { unitTypeId: "unit-footman", commandId: "attack-move", expectedOrderKind: "attack" },
      "attack-ground": { unitTypeId: "unit-ballista", commandId: "attack-ground", expectedOrderKind: "attack-ground" },
      patrol: { unitTypeId: "unit-footman", commandId: "patrol", expectedOrderKind: "patrol" },
      repair: { unitTypeId: "unit-peasant", commandId: "repair", expectedOrderKind: "repair" },
      harvest: { unitTypeId: "unit-peasant", commandId: "harvest", expectedOrderKind: "harvest" }
    } satisfies Record<string, { unitTypeId: string; commandId: string; expectedOrderKind: string }>;
    const fixture = fixtureByAction[action];
    if (!fixture) {
      return { ok: false, error: `unknown pending action fixture ${action}`, commandId: null, target: null, expectedOrderKind: null, ...browserSmokeCommandResult() };
    }
    const unitDefinition = world.unitDefinitions.find((unit) => unit.id === fixture.unitTypeId);
    const enemyDefinition = world.unitDefinitions.find((unit) => unit.id === "unit-grunt");
    const repairTargetDefinition = world.unitDefinitions.find((unit) => unit.id === "unit-farm");
    const goldMineDefinition = world.unitDefinitions.find((unit) => unit.id === "unit-gold-mine");
    const dropoffDefinition = world.unitDefinitions.find((unit) => unit.id === "unit-town-hall");
    if (!unitDefinition || !enemyDefinition || !repairTargetDefinition || !goldMineDefinition || !dropoffDefinition) {
      return { ok: false, error: `missing pending action fixture definitions for ${action}`, commandId: null, target: null, expectedOrderKind: null, ...browserSmokeCommandResult() };
    }
    clearBrowserSmokeFixtures();
    const player = world.players.find((candidate) => candidate.id === world!.visibilityPlayer) ?? world.players[0];
    if (player) {
      player.resources.gold = Math.max(player.resources.gold ?? 0, 100000);
      player.resources.wood = Math.max(player.resources.wood ?? 0, 100000);
      player.resources.oil = Math.max(player.resources.oil ?? 0, 100000);
    }
    world.allowedUnitTypes = [...new Set([...world.allowedUnitTypes, fixture.unitTypeId, enemyDefinition.id, repairTargetDefinition.id, goldMineDefinition.id, dropoffDefinition.id])];
    const baseTileX = Math.max(1, Math.min(world.map.width - 14, Math.floor((player?.startX ?? 8 * 32) / 32) + 3));
    const baseTileY = Math.max(1, Math.min(world.map.height - 10, Math.floor((player?.startY ?? 8 * 32) / 32) + 3));
    const createFixtureUnit = (definition: typeof unitDefinition, owner: number, dx: number, dy: number, hitPoints?: number): WorldUnit => {
      const unit = createWorldUnit({
        unit: definition,
        id: `__smoke-fixture-${definition.id}-${world!.nextUnitSerial++}`,
        player: owner,
        tileX: Math.max(1, Math.min(world!.map.width - Math.max(definition.tileSize?.[0] ?? 1, 1) - 1, baseTileX + dx)),
        tileY: Math.max(1, Math.min(world!.map.height - Math.max(definition.tileSize?.[1] ?? 1, 1) - 1, baseTileY + dy)),
        hitPoints,
        tileset: activeMap?.setup?.tileset ?? null
      });
      readyBrowserSmokeFixtureUnit(unit);
      return unit;
    };
    const selected = createFixtureUnit(unitDefinition, world.visibilityPlayer, 0, 0);
    const enemyPlayer = world.players.find((candidate) => candidate.id !== world!.visibilityPlayer)?.id ?? 1;
    const enemy = createFixtureUnit(enemyDefinition, enemyPlayer, 4, 0);
    const repairTarget = createFixtureUnit(repairTargetDefinition, world.visibilityPlayer, 3, 0, Math.max(1, Math.floor(repairTargetDefinition.hitPoints / 2)));
    const goldMine = createFixtureUnit(goldMineDefinition, 15, 6, 0);
    const dropoff = createFixtureUnit(dropoffDefinition, world.visibilityPlayer, 0, 4);
    world.units.push(selected, enemy, repairTarget, goldMine, dropoff);
    const target = action === "attack"
      ? { x: enemy.x, y: enemy.y }
      : action === "repair"
        ? { x: repairTarget.x, y: repairTarget.y }
        : action === "harvest"
          ? { x: goldMine.x, y: goldMine.y }
          : { x: selected.x + world.tileSize * 4, y: selected.y + world.tileSize * (action === "patrol" ? 2 : 0) };
    updateVisibility(world);
    selectedUnitIds = clampSelectionToSourceLimit(world, [selected.id]);
    pendingWorldCommand = null;
    commandPage = 0;
    centerCameraOnWorldPoint(world, selected.x, selected.y);
    publishBrowserSmokeState(true);
    const command = browserSmokeCommandCard().find((candidate) => candidate.id === fixture.commandId);
    if (!command || command.disabled || command.sourceAction !== action) {
      return { ok: false, error: `pending action fixture ${action} did not expose enabled ${fixture.commandId}`, commandId: fixture.commandId, target, expectedOrderKind: fixture.expectedOrderKind, ...browserSmokeCommandResult() };
    }
    return { ok: true, commandId: fixture.commandId, target, expectedOrderKind: fixture.expectedOrderKind, ...browserSmokeCommandResult() };
  };
  window.__WARGUS_TS_SELECT_SOURCE_HARVEST_RALLY_FIXTURE__ = (producerTypeId) => {
    if (!world || !manifest) {
      return { ok: false, error: "missing world", commandId: null, target: null, expectedOrderKind: null, ...browserSmokeCommandResult() };
    }
    const producerDefinition = world.unitDefinitions.find((unit) => unit.id === producerTypeId);
    const orc = producerTypeId.includes("orc") || producerTypeId === "unit-great-hall" || producerTypeId === "unit-stronghold" || producerTypeId === "unit-fortress";
    const isShipyard = producerTypeId.includes("shipyard");
    const gathererTypeId = isShipyard
      ? orc ? "unit-orc-oil-tanker" : "unit-human-oil-tanker"
      : orc ? "unit-peon" : "unit-peasant";
    const targetTypeId = isShipyard
      ? orc ? "unit-orc-oil-platform" : "unit-human-oil-platform"
      : "unit-gold-mine";
    const targetDefinition = world.unitDefinitions.find((unit) => unit.id === targetTypeId);
    const gathererDefinition = world.unitDefinitions.find((unit) => unit.id === gathererTypeId);
    if (!producerDefinition || !targetDefinition || !gathererDefinition) {
      return { ok: false, error: `missing harvest rally fixture definitions for ${producerTypeId}`, commandId: null, target: null, expectedOrderKind: null, ...browserSmokeCommandResult() };
    }
    clearBrowserSmokeFixtures();
    world.allowedUnitTypes = [...new Set([...world.allowedUnitTypes, producerDefinition.id, targetDefinition.id, gathererDefinition.id])];
    const player = world.players.find((candidate) => candidate.id === world!.visibilityPlayer) ?? world.players[0];
    if (player) {
      player.resources.gold = Math.max(player.resources.gold ?? 0, 100000);
      player.resources.wood = Math.max(player.resources.wood ?? 0, 100000);
      player.resources.oil = Math.max(player.resources.oil ?? 0, 100000);
    }
    const baseTileX = Math.max(1, Math.min(world.map.width - 12, Math.floor((player?.startX ?? 8 * 32) / 32) + 3));
    const baseTileY = Math.max(1, Math.min(world.map.height - 10, Math.floor((player?.startY ?? 8 * 32) / 32) + 3));
    const createFixtureUnit = (definition: typeof producerDefinition, owner: number, dx: number, dy: number): WorldUnit => {
      const unit = createWorldUnit({
        unit: definition,
        id: `__smoke-fixture-${definition.id}-${world!.nextUnitSerial++}`,
        player: owner,
        tileX: Math.max(1, Math.min(world!.map.width - Math.max(definition.tileSize?.[0] ?? 1, 1) - 1, baseTileX + dx)),
        tileY: Math.max(1, Math.min(world!.map.height - Math.max(definition.tileSize?.[1] ?? 1, 1) - 1, baseTileY + dy)),
        tileset: activeMap?.setup?.tileset ?? null
      });
      readyBrowserSmokeFixtureUnit(unit);
      return unit;
    };
    const producer = createFixtureUnit(producerDefinition, world.visibilityPlayer, 0, 0);
    const targetUnit = createFixtureUnit(targetDefinition, isShipyard ? world.visibilityPlayer : 15, 6, 0);
    targetUnit.resourcesHeld = Math.max(targetUnit.resourcesHeld, 5000);
    world.units.push(producer, targetUnit);
    updateVisibility(world);
    selectedUnitIds = clampSelectionToSourceLimit(world, [producer.id]);
    pendingWorldCommand = null;
    commandPage = 0;
    centerCameraOnWorldPoint(world, producer.x, producer.y);
    publishBrowserSmokeState(true);
    const target = { x: targetUnit.x, y: targetUnit.y };
    const command = browserSmokeCommandCard().find((candidate) => candidate.id === "harvest");
    if (!command || command.disabled || command.sourceAction !== "harvest") {
      return { ok: false, error: `harvest rally fixture ${producerTypeId} did not expose enabled harvest`, commandId: "harvest", target, expectedOrderKind: null, ...browserSmokeCommandResult() };
    }
    return { ok: true, commandId: "harvest", target, expectedOrderKind: null, ...browserSmokeCommandResult() };
  };
  window.__WARGUS_TS_SELECT_SOURCE_UPGRADE_FIXTURE__ = () => {
    if (!world || !manifest) {
      return { ok: false, error: "missing world", ...browserSmokeCommandResult() };
    }
    const townHallDefinition = world.unitDefinitions.find((unit) => unit.id === "unit-town-hall");
    const barracksDefinition = world.unitDefinitions.find((unit) => unit.id === "unit-human-barracks");
    if (!townHallDefinition || !barracksDefinition) {
      return { ok: false, error: "missing human upgrade fixture definitions", ...browserSmokeCommandResult() };
    }
    clearBrowserSmokeFixtures();
    world.allowedUnitTypes = [...new Set([...world.allowedUnitTypes, "unit-town-hall", "unit-keep", "unit-human-barracks", "unit-peasant"])];
    const player = world.players.find((candidate) => candidate.id === world!.visibilityPlayer) ?? world.players[0];
    if (player) {
      player.resources.gold = Math.max(player.resources.gold ?? 0, 100000);
      player.resources.wood = Math.max(player.resources.wood ?? 0, 100000);
      player.resources.oil = Math.max(player.resources.oil ?? 0, 100000);
    }
    const baseTileX = Math.max(1, Math.min(world.map.width - 8, Math.floor((player?.startX ?? 8 * 32) / 32) + 3));
    const baseTileY = Math.max(1, Math.min(world.map.height - 8, Math.floor((player?.startY ?? 8 * 32) / 32) + 3));
    const townHall = createWorldUnit({
      unit: townHallDefinition,
      id: `__smoke-fixture-${townHallDefinition.id}-${world.nextUnitSerial++}`,
      player: world.visibilityPlayer,
      tileX: baseTileX,
      tileY: baseTileY,
      tileset: activeMap?.setup?.tileset ?? null
    });
    const barracks = createWorldUnit({
      unit: barracksDefinition,
      id: `__smoke-fixture-${barracksDefinition.id}-${world.nextUnitSerial++}`,
      player: world.visibilityPlayer,
      tileX: Math.min(world.map.width - 4, baseTileX + 5),
      tileY: baseTileY,
      tileset: activeMap?.setup?.tileset ?? null
    });
    readyBrowserSmokeFixtureUnit(townHall);
    readyBrowserSmokeFixtureUnit(barracks);
    world.units.push(townHall, barracks);
    updateVisibility(world);
    selectedUnitIds = clampSelectionToSourceLimit(world, [townHall.id]);
    pendingWorldCommand = null;
    commandPage = 0;
    centerCameraOnWorldPoint(world, townHall.x, townHall.y);
    publishBrowserSmokeState(true);
    return { ok: true, ...browserSmokeCommandResult() };
  };
  window.__WARGUS_TS_SELECT_CARRYING_WORKER_FIXTURE__ = () => {
    if (!world || !manifest) {
      return { ok: false, error: "missing world", ...browserSmokeCommandResult() };
    }
    const townHallDefinition = world.unitDefinitions.find((unit) => unit.id === "unit-town-hall");
    const peasantDefinition = world.unitDefinitions.find((unit) => unit.id === "unit-peasant");
    if (!townHallDefinition || !peasantDefinition) {
      return { ok: false, error: "missing return-goods fixture definitions", ...browserSmokeCommandResult() };
    }
    clearBrowserSmokeFixtures();
    world.allowedUnitTypes = [...new Set([...world.allowedUnitTypes, "unit-town-hall", "unit-peasant"])];
    const player = world.players.find((candidate) => candidate.id === world!.visibilityPlayer) ?? world.players[0];
    if (player) {
      player.resources.gold = Math.max(player.resources.gold ?? 0, 100000);
      player.resources.wood = Math.max(player.resources.wood ?? 0, 100000);
      player.resources.oil = Math.max(player.resources.oil ?? 0, 100000);
    }
    const baseTileX = Math.max(1, Math.min(world.map.width - 8, Math.floor((player?.startX ?? 8 * 32) / 32) + 3));
    const baseTileY = Math.max(1, Math.min(world.map.height - 8, Math.floor((player?.startY ?? 8 * 32) / 32) + 3));
    const townHall = createWorldUnit({
      unit: townHallDefinition,
      id: `__smoke-fixture-${townHallDefinition.id}-${world.nextUnitSerial++}`,
      player: world.visibilityPlayer,
      tileX: baseTileX,
      tileY: baseTileY,
      tileset: activeMap?.setup?.tileset ?? null
    });
    const peasant = createWorldUnit({
      unit: peasantDefinition,
      id: `__smoke-fixture-${peasantDefinition.id}-${world.nextUnitSerial++}`,
      player: world.visibilityPlayer,
      tileX: Math.min(world.map.width - 2, baseTileX + 5),
      tileY: Math.min(world.map.height - 2, baseTileY + 2),
      tileset: activeMap?.setup?.tileset ?? null
    });
    peasant.resourcesHeld = 100;
    peasant.carriedResource = "gold";
    peasant.x = townHall.x + world.tileSize;
    peasant.y = townHall.y;
    readyBrowserSmokeFixtureUnit(townHall);
    readyBrowserSmokeFixtureUnit(peasant);
    world.units.push(townHall, peasant);
    updateVisibility(world);
    selectedUnitIds = clampSelectionToSourceLimit(world, [peasant.id]);
    pendingWorldCommand = null;
    commandPage = 0;
    centerCameraOnWorldPoint(world, peasant.x, peasant.y);
    publishBrowserSmokeState(true);
    return { ok: true, ...browserSmokeCommandResult() };
  };
  window.__WARGUS_TS_SELECT_LOADED_TRANSPORT_FIXTURE__ = (typeId = "unit-human-transport") => {
    if (!world || !manifest) {
      return { ok: false, error: "missing world", ...browserSmokeCommandResult() };
    }
    const transportDefinition = world.unitDefinitions.find((unit) => unit.id === typeId);
    const cargoTypeId = typeId.includes("orc") ? "unit-grunt" : "unit-footman";
    const cargoDefinition = world.unitDefinitions.find((unit) => unit.id === cargoTypeId);
    if (!transportDefinition || !cargoDefinition) {
      return { ok: false, error: "missing loaded transport fixture definitions", ...browserSmokeCommandResult() };
    }
    clearBrowserSmokeFixtures();
    world.allowedUnitTypes = [...new Set([...world.allowedUnitTypes, transportDefinition.id, cargoDefinition.id])];
    const player = world.players.find((candidate) => candidate.id === world!.visibilityPlayer) ?? world.players[0];
    if (player) {
      player.resources.gold = Math.max(player.resources.gold ?? 0, 100000);
      player.resources.wood = Math.max(player.resources.wood ?? 0, 100000);
      player.resources.oil = Math.max(player.resources.oil ?? 0, 100000);
    }
    const tileX = Math.max(1, Math.min(world.map.width - Math.max(transportDefinition.tileSize?.[0] ?? 1, 1) - 1, Math.floor((player?.startX ?? 8 * 32) / 32) + 3));
    const tileY = Math.max(1, Math.min(world.map.height - Math.max(transportDefinition.tileSize?.[1] ?? 1, 1) - 1, Math.floor((player?.startY ?? 8 * 32) / 32) + 3));
    const transport = createWorldUnit({
      unit: transportDefinition,
      id: `__smoke-fixture-${transportDefinition.id}-${world.nextUnitSerial++}`,
      player: world.visibilityPlayer,
      tileX,
      tileY,
      tileset: activeMap?.setup?.tileset ?? null
    });
    const cargo = createWorldUnit({
      unit: cargoDefinition,
      id: `__smoke-fixture-cargo-${cargoDefinition.id}-${world.nextUnitSerial++}`,
      player: world.visibilityPlayer,
      tileX,
      tileY,
      tileset: activeMap?.setup?.tileset ?? null
    });
    cargo.x = transport.x;
    cargo.y = transport.y;
    readyBrowserSmokeFixtureUnit(transport);
    readyBrowserSmokeFixtureUnit(cargo);
    transport.cargo.push(cargo);
    world.units.push(transport);
    updateVisibility(world);
    selectedUnitIds = clampSelectionToSourceLimit(world, [transport.id]);
    pendingWorldCommand = null;
    commandPage = 0;
    centerCameraOnWorldPoint(world, transport.x, transport.y);
    publishBrowserSmokeState(true);
    return { ok: true, ...browserSmokeCommandResult() };
  };
  window.__WARGUS_TS_SELECT_OIL_TANKER_FIXTURE__ = (typeId = "unit-human-oil-tanker", carrying = false) => {
    if (!world || !manifest) {
      return { ok: false, error: "missing world", ...browserSmokeCommandResult() };
    }
    const orc = typeId.includes("orc");
    const platformTypeId = orc ? "unit-orc-oil-platform" : "unit-human-oil-platform";
    const dropoffTypeId = orc ? "unit-orc-shipyard" : "unit-human-shipyard";
    const tankerDefinition = world.unitDefinitions.find((unit) => unit.id === typeId);
    const platformDefinition = world.unitDefinitions.find((unit) => unit.id === platformTypeId);
    const dropoffDefinition = world.unitDefinitions.find((unit) => unit.id === dropoffTypeId);
    if (!tankerDefinition || !platformDefinition || !dropoffDefinition) {
      return { ok: false, error: "missing oil tanker fixture definitions", ...browserSmokeCommandResult() };
    }
    clearBrowserSmokeFixtures();
    world.allowedUnitTypes = [...new Set([...world.allowedUnitTypes, tankerDefinition.id, platformDefinition.id, dropoffDefinition.id])];
    const player = world.players.find((candidate) => candidate.id === world!.visibilityPlayer) ?? world.players[0];
    if (player) {
      player.resources.gold = Math.max(player.resources.gold ?? 0, 100000);
      player.resources.wood = Math.max(player.resources.wood ?? 0, 100000);
      player.resources.oil = Math.max(player.resources.oil ?? 0, 100000);
    }
    const baseTileX = Math.max(1, Math.min(world.map.width - 10, Math.floor((player?.startX ?? 8 * 32) / 32) + 3));
    const baseTileY = Math.max(1, Math.min(world.map.height - 8, Math.floor((player?.startY ?? 8 * 32) / 32) + 3));
    const platform = createWorldUnit({
      unit: platformDefinition,
      id: `__smoke-fixture-${platformDefinition.id}-${world.nextUnitSerial++}`,
      player: world.visibilityPlayer,
      tileX: baseTileX,
      tileY: baseTileY,
      tileset: activeMap?.setup?.tileset ?? null
    });
    const dropoff = createWorldUnit({
      unit: dropoffDefinition,
      id: `__smoke-fixture-${dropoffDefinition.id}-${world.nextUnitSerial++}`,
      player: world.visibilityPlayer,
      tileX: Math.min(world.map.width - 4, baseTileX + 5),
      tileY: baseTileY,
      tileset: activeMap?.setup?.tileset ?? null
    });
    const tanker = createWorldUnit({
      unit: tankerDefinition,
      id: `__smoke-fixture-${tankerDefinition.id}-${world.nextUnitSerial++}`,
      player: world.visibilityPlayer,
      tileX: Math.min(world.map.width - 3, baseTileX + 3),
      tileY: baseTileY,
      tileset: activeMap?.setup?.tileset ?? null
    });
    tanker.x = platform.x + world.tileSize;
    tanker.y = platform.y;
    dropoff.x = tanker.x + world.tileSize;
    dropoff.y = tanker.y;
    platform.resourcesHeld = Math.max(platform.resourcesHeld, 5000);
    if (carrying) {
      tanker.resourcesHeld = 100;
      tanker.carriedResource = "oil";
    }
    readyBrowserSmokeFixtureUnit(platform);
    readyBrowserSmokeFixtureUnit(dropoff);
    readyBrowserSmokeFixtureUnit(tanker);
    world.units.push(platform, dropoff, tanker);
    updateVisibility(world);
    selectedUnitIds = clampSelectionToSourceLimit(world, [tanker.id]);
    pendingWorldCommand = null;
    commandPage = 0;
    centerCameraOnWorldPoint(world, tanker.x, tanker.y);
    publishBrowserSmokeState(true);
    return { ok: true, target: { x: platform.x, y: platform.y }, ...browserSmokeCommandResult() };
  };
  window.__WARGUS_TS_SELECT_OIL_TANKER_BUILD_FIXTURE__ = (typeId = "unit-human-oil-tanker") => {
    if (!world || !manifest) {
      return { ok: false, error: "missing world", platformTypeId: null, target: null, ...browserSmokeCommandResult() };
    }
    const orc = typeId.includes("orc");
    const platformTypeId = orc ? "unit-orc-oil-platform" : "unit-human-oil-platform";
    const tankerDefinition = world.unitDefinitions.find((unit) => unit.id === typeId);
    const platformDefinition = world.unitDefinitions.find((unit) => unit.id === platformTypeId);
    const patchDefinition = world.unitDefinitions.find((unit) => unit.id === "unit-oil-patch");
    if (!tankerDefinition || !platformDefinition || !patchDefinition) {
      return { ok: false, error: "missing oil tanker build fixture definitions", platformTypeId, target: null, ...browserSmokeCommandResult() };
    }
    clearBrowserSmokeFixtures();
    world.allowedUnitTypes = [...new Set([...world.allowedUnitTypes, tankerDefinition.id, platformDefinition.id, patchDefinition.id])];
    const player = world.players.find((candidate) => candidate.id === world!.visibilityPlayer) ?? world.players[0];
    if (player) {
      player.resources.gold = Math.max(player.resources.gold ?? 0, 100000);
      player.resources.wood = Math.max(player.resources.wood ?? 0, 100000);
      player.resources.oil = Math.max(player.resources.oil ?? 0, 100000);
    }
    const baseTileX = Math.max(1, Math.min(world.map.width - 12, Math.floor((player?.startX ?? 8 * 32) / 32) + 3));
    const baseTileY = Math.max(1, Math.min(world.map.height - 8, Math.floor((player?.startY ?? 8 * 32) / 32) + 3));
    const patch = createWorldUnit({
      unit: patchDefinition,
      id: `__smoke-fixture-${patchDefinition.id}-${world.nextUnitSerial++}`,
      player: 15,
      tileX: baseTileX,
      tileY: baseTileY,
      tileset: activeMap?.setup?.tileset ?? null
    });
    const tanker = createWorldUnit({
      unit: tankerDefinition,
      id: `__smoke-fixture-${tankerDefinition.id}-${world.nextUnitSerial++}`,
      player: world.visibilityPlayer,
      tileX: Math.min(world.map.width - 3, baseTileX + 5),
      tileY: baseTileY,
      tileset: activeMap?.setup?.tileset ?? null
    });
    patch.resourcesHeld = Math.max(patch.resourcesHeld, 5000);
    tanker.x = patch.x + world.tileSize * 2;
    tanker.y = patch.y;
    readyBrowserSmokeFixtureUnit(patch);
    readyBrowserSmokeFixtureUnit(tanker);
    world.units.push(patch, tanker);
    updateVisibility(world);
    selectedUnitIds = clampSelectionToSourceLimit(world, [tanker.id]);
    pendingWorldCommand = null;
    commandPage = 0;
    centerCameraOnWorldPoint(world, tanker.x, tanker.y);
    publishBrowserSmokeState(true);
    return { ok: true, platformTypeId, target: { x: patch.x, y: patch.y }, ...browserSmokeCommandResult() };
  };
  window.__WARGUS_TS_SELECT_SOURCE_TRAIN_FIXTURE__ = (producerTypeId, unitTypeId) => {
    if (!world || !manifest) {
      return { ok: false, error: "missing world", ...browserSmokeCommandResult() };
    }
    const producerDefinition = world.unitDefinitions.find((unit) => unit.id === producerTypeId);
    const unitDefinition = world.unitDefinitions.find((unit) => unit.id === unitTypeId);
    const button = world.buttonDefinitions.find((candidate) => (
      candidate.action === "train-unit"
      && candidate.value === unitTypeId
      && candidate.forUnit.includes(producerTypeId)
    ));
    if (!producerDefinition || !unitDefinition || !button) {
      return { ok: false, error: `missing train fixture definitions for ${producerTypeId} ${unitTypeId}`, ...browserSmokeCommandResult() };
    }
    clearBrowserSmokeFixtures();
    const requirements = browserSmokeTrainRequirements(unitTypeId);
    const conversionTypeIds = browserSmokeResearchConversionTypeIds(requirements.upgradeIds);
    world.allowedUnitTypes = [...new Set([...world.allowedUnitTypes, producerTypeId, unitTypeId, ...requirements.unitTypeIds, ...conversionTypeIds])];
    world.allowedUpgradeTypes = [...new Set([...world.allowedUpgradeTypes, ...requirements.upgradeIds])];
    world.researchedUpgrades[world.visibilityPlayer] = [...new Set([...(world.researchedUpgrades[world.visibilityPlayer] ?? []), ...requirements.upgradeIds])];
    const player = world.players.find((candidate) => candidate.id === world!.visibilityPlayer) ?? world.players[0];
    if (player) {
      player.resources.gold = Math.max(player.resources.gold ?? 0, 100000);
      player.resources.wood = Math.max(player.resources.wood ?? 0, 100000);
      player.resources.oil = Math.max(player.resources.oil ?? 0, 100000);
    }
    const baseTileX = Math.max(1, Math.min(world.map.width - 10, Math.floor((player?.startX ?? 8 * 32) / 32) + 3));
    const baseTileY = Math.max(1, Math.min(world.map.height - 8, Math.floor((player?.startY ?? 8 * 32) / 32) + 3));
    const createdUnits: WorldUnit[] = [];
    const producer = createWorldUnit({
      unit: producerDefinition,
      id: `__smoke-fixture-${producerDefinition.id}-${world.nextUnitSerial++}`,
      player: world.visibilityPlayer,
      tileX: baseTileX,
      tileY: baseTileY,
      tileset: activeMap?.setup?.tileset ?? null
    });
    readyBrowserSmokeFixtureUnit(producer);
    createdUnits.push(producer);
    for (const [index, dependencyTypeId] of requirements.unitTypeIds.filter((dependencyTypeId) => dependencyTypeId !== producerTypeId).entries()) {
      const dependencyDefinition = world.unitDefinitions.find((unit) => unit.id === dependencyTypeId);
      if (!dependencyDefinition) {
        return { ok: false, error: `missing train dependency unit ${dependencyTypeId}`, ...browserSmokeCommandResult() };
      }
      const width = Math.max(dependencyDefinition.tileSize?.[0] ?? 1, 1);
      const height = Math.max(dependencyDefinition.tileSize?.[1] ?? 1, 1);
      const dependency = createWorldUnit({
        unit: dependencyDefinition,
        id: `__smoke-fixture-dependency-${dependencyDefinition.id}-${world.nextUnitSerial++}`,
        player: world.visibilityPlayer,
        tileX: Math.max(1, Math.min(world.map.width - width - 1, baseTileX + 4 + index * 3)),
        tileY: Math.max(1, Math.min(world.map.height - height - 1, baseTileY)),
        tileset: activeMap?.setup?.tileset ?? null
      });
      readyBrowserSmokeFixtureUnit(dependency);
      createdUnits.push(dependency);
    }
    world.units.push(...createdUnits);
    updateVisibility(world);
    selectedUnitIds = clampSelectionToSourceLimit(world, [producer.id]);
    pendingWorldCommand = null;
    commandPage = 0;
    centerCameraOnWorldPoint(world, producer.x, producer.y);
    publishBrowserSmokeState(true);
    if (!canTrainUnitAt(world, producer.id, unitTypeId, world.unitDefinitions)) {
      return { ok: false, error: `train fixture ${producerTypeId} ${unitTypeId} is still blocked`, ...browserSmokeCommandResult() };
    }
    return { ok: true, ...browserSmokeCommandResult() };
  };
  window.__WARGUS_TS_SELECT_SOURCE_CANCEL_FIXTURE__ = (kind) => {
    if (!world || !manifest) {
      return { ok: false, error: "missing world", ...browserSmokeCommandResult() };
    }
    clearBrowserSmokeFixtures();
    const player = world.players.find((candidate) => candidate.id === world!.visibilityPlayer) ?? world.players[0];
    if (player) {
      player.resources.gold = Math.max(player.resources.gold ?? 0, 100000);
      player.resources.wood = Math.max(player.resources.wood ?? 0, 100000);
      player.resources.oil = Math.max(player.resources.oil ?? 0, 100000);
    }
    const baseTileX = Math.max(1, Math.min(world.map.width - 10, Math.floor((player?.startX ?? 8 * 32) / 32) + 3));
    const baseTileY = Math.max(1, Math.min(world.map.height - 8, Math.floor((player?.startY ?? 8 * 32) / 32) + 3));
    const selectFixtureUnit = (unit: WorldUnit): { ok: boolean; error?: string } & ReturnType<typeof browserSmokeCommandResult> => {
      updateVisibility(world as WorldState);
      selectedUnitIds = clampSelectionToSourceLimit(world as WorldState, [unit.id]);
      pendingWorldCommand = null;
      commandPage = 0;
      centerCameraOnWorldPoint(world as WorldState, unit.x, unit.y);
      publishBrowserSmokeState(true);
      return { ok: true, ...browserSmokeCommandResult() };
    };
    if (kind === "train") {
      const producerDefinition = world.unitDefinitions.find((unit) => unit.id === "unit-human-barracks");
      const unitDefinition = world.unitDefinitions.find((unit) => unit.id === "unit-footman");
      if (!producerDefinition || !unitDefinition) {
        return { ok: false, error: "missing cancel train fixture definitions", ...browserSmokeCommandResult() };
      }
      world.allowedUnitTypes = [...new Set([...world.allowedUnitTypes, producerDefinition.id, unitDefinition.id])];
      const producer = createWorldUnit({
        unit: producerDefinition,
        id: `__smoke-fixture-${producerDefinition.id}-${world.nextUnitSerial++}`,
        player: world.visibilityPlayer,
        tileX: baseTileX,
        tileY: baseTileY,
        tileset: activeMap?.setup?.tileset ?? null
      });
      readyBrowserSmokeFixtureUnit(producer);
      world.units.push(producer);
      if (!issueTrainUnitOrder(world, producer.id, unitDefinition.id, world.unitDefinitions)) {
        return { ok: false, error: "unable to start cancel train fixture production", ...browserSmokeCommandResult() };
      }
      return selectFixtureUnit(producer);
    }
    if (kind === "research") {
      const buildingDefinition = world.unitDefinitions.find((unit) => unit.id === "unit-mage-tower");
      const upgradeDefinition = world.upgradeDefinitions.find((upgrade) => upgrade.id === "upgrade-slow");
      if (!buildingDefinition || !upgradeDefinition) {
        return { ok: false, error: "missing cancel research fixture definitions", ...browserSmokeCommandResult() };
      }
      world.allowedUnitTypes = [...new Set([...world.allowedUnitTypes, buildingDefinition.id])];
      world.allowedUpgradeTypes = [...new Set([...world.allowedUpgradeTypes, upgradeDefinition.id])];
      const building = createWorldUnit({
        unit: buildingDefinition,
        id: `__smoke-fixture-${buildingDefinition.id}-${world.nextUnitSerial++}`,
        player: world.visibilityPlayer,
        tileX: baseTileX,
        tileY: baseTileY,
        tileset: activeMap?.setup?.tileset ?? null
      });
      readyBrowserSmokeFixtureUnit(building);
      world.units.push(building);
      if (!issueResearchOrder(world, building.id, upgradeDefinition.id, world.upgradeDefinitions)) {
        return { ok: false, error: "unable to start cancel research fixture", ...browserSmokeCommandResult() };
      }
      return selectFixtureUnit(building);
    }
    if (kind === "construction") {
      const builderDefinition = world.unitDefinitions.find((unit) => unit.id === "unit-peasant");
      const buildingDefinition = world.unitDefinitions.find((unit) => unit.id === "unit-farm");
      if (!builderDefinition || !buildingDefinition) {
        return { ok: false, error: "missing cancel construction fixture definitions", ...browserSmokeCommandResult() };
      }
      world.allowedUnitTypes = [...new Set([...world.allowedUnitTypes, builderDefinition.id, buildingDefinition.id])];
      const builder = createWorldUnit({
        unit: builderDefinition,
        id: `__smoke-fixture-${builderDefinition.id}-${world.nextUnitSerial++}`,
        player: world.visibilityPlayer,
        tileX: baseTileX,
        tileY: baseTileY,
        tileset: activeMap?.setup?.tileset ?? null
      });
      const building = createWorldUnit({
        unit: buildingDefinition,
        id: `__smoke-fixture-${buildingDefinition.id}-${world.nextUnitSerial++}`,
        player: world.visibilityPlayer,
        tileX: Math.min(world.map.width - 4, baseTileX + 3),
        tileY: baseTileY,
        hitPoints: Math.max(1, Math.floor(buildingDefinition.hitPoints / 3)),
        tileset: activeMap?.setup?.tileset ?? null
      });
      readyBrowserSmokeFixtureUnit(builder);
      readyBrowserSmokeFixtureUnit(building);
      building.construction = { builderId: builder.id, builderInside: false, remainingSeconds: 30, totalSeconds: 60 };
      world.units.push(builder, building);
      return selectFixtureUnit(building);
    }
    return { ok: false, error: `unknown cancel fixture ${kind}`, ...browserSmokeCommandResult() };
  };
  window.__WARGUS_TS_SELECT_SOURCE_SPELL_FIXTURE__ = (casterTypeId, spellId) => {
    if (!world || !manifest) {
      return { ok: false, error: "missing world", ...browserSmokeCommandResult(), command: null, instantCommand: null, target: null };
    }
    const casterDefinition = world.unitDefinitions.find((unit) => unit.id === casterTypeId);
    const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
    const button = world.buttonDefinitions.find((candidate) => (
      candidate.action === "cast-spell"
      && candidate.value === spellId
      && candidate.forUnit.includes(casterTypeId)
    ));
    if (!casterDefinition || !spell || !button) {
      return { ok: false, error: `missing spell fixture definitions for ${casterTypeId} ${spellId}`, ...browserSmokeCommandResult(), command: null, instantCommand: null, target: null };
    }
    clearBrowserSmokeFixtures();
    const player = world.players.find((candidate) => candidate.id === world!.visibilityPlayer) ?? world.players[0];
    if (player) {
      player.resources.gold = Math.max(player.resources.gold ?? 0, 100000);
      player.resources.wood = Math.max(player.resources.wood ?? 0, 100000);
      player.resources.oil = Math.max(player.resources.oil ?? 0, 100000);
    }
    const dependencyUpgradeIds = spell.dependUpgrade ? [spell.dependUpgrade] : [];
    const fixtureTypeIds = [
      casterTypeId,
      "unit-footman",
      "unit-grunt",
      "unit-skeleton",
      "unit-death-knight",
      "unit-farm",
      "unit-critter",
      "unit-eye-of-vision"
    ];
    world.allowedUnitTypes = [...new Set([...world.allowedUnitTypes, ...fixtureTypeIds])];
    world.allowedUpgradeTypes = [...new Set([...world.allowedUpgradeTypes, ...dependencyUpgradeIds])];
    world.researchedUpgrades[world.visibilityPlayer] = [...new Set([...(world.researchedUpgrades[world.visibilityPlayer] ?? []), ...dependencyUpgradeIds])];
    const baseTileX = Math.max(1, Math.min(world.map.width - 14, Math.floor((player?.startX ?? 8 * 32) / 32) + 3));
    const baseTileY = Math.max(1, Math.min(world.map.height - 10, Math.floor((player?.startY ?? 8 * 32) / 32) + 3));
    const createFixtureUnit = (typeId: string, owner: number, dx: number, dy: number, hitPoints?: number): WorldUnit | null => {
      const definition = world?.unitDefinitions.find((unit) => unit.id === typeId);
      if (!world || !definition) {
        return null;
      }
      const unit = createWorldUnit({
        unit: definition,
        id: `__smoke-fixture-${definition.id}-${world.nextUnitSerial++}`,
        player: owner,
        tileX: Math.max(1, Math.min(world.map.width - Math.max(definition.tileSize?.[0] ?? 1, 1) - 1, baseTileX + dx)),
        tileY: Math.max(1, Math.min(world.map.height - Math.max(definition.tileSize?.[1] ?? 1, 1) - 1, baseTileY + dy)),
        hitPoints,
        tileset: activeMap?.setup?.tileset ?? null
      });
      readyBrowserSmokeFixtureUnit(unit);
      return unit;
    };
    const enemyPlayer = world.players.find((candidate) => candidate.id !== world!.visibilityPlayer)?.id ?? 1;
    const caster = createFixtureUnit(casterTypeId, world.visibilityPlayer, 0, 0);
    if (!caster) {
      return { ok: false, error: `unable to create spell caster ${casterTypeId}`, ...browserSmokeCommandResult(), command: null, instantCommand: null, target: null };
    }
    caster.mana = Math.max(caster.maxMana, spell.manaCost, 255);
    caster.maxMana = Math.max(caster.maxMana, caster.mana);
    const friendly = createFixtureUnit("unit-footman", world.visibilityPlayer, 2, 0, 30);
    const enemy = createFixtureUnit("unit-grunt", enemyPlayer, 4, 0);
    const enemyUndead = createFixtureUnit("unit-skeleton", enemyPlayer, 5, 1);
    const friendlyUndead = createFixtureUnit("unit-death-knight", world.visibilityPlayer, 2, 2, 30);
    const enemyBuilding = createFixtureUnit("unit-farm", enemyPlayer, 6, 0);
    const createdUnits = [caster, friendly, enemy, enemyUndead, friendlyUndead, enemyBuilding].filter((unit): unit is WorldUnit => Boolean(unit));
    world.units.push(...createdUnits);
    world.corpses.push({
      id: `__smoke-fixture-corpse-${world.tick}-${world.corpses.length}`,
      typeId: "unit-grunt",
      player: enemyPlayer,
      x: caster.x + world.tileSize * 2,
      y: caster.y + world.tileSize * 2,
      radius: 18,
      drawLevel: 0,
      visibleUnderFog: true,
      facing: 4,
      animation: null,
      frameWidth: 72,
      frameHeight: 72,
      age: 0,
      duration: 120
    });
    updateVisibility(world);
    selectedUnitIds = clampSelectionToSourceLimit(world, [caster.id]);
    pendingWorldCommand = null;
    commandPage = 0;
    centerCameraOnWorldPoint(world, caster.x, caster.y);
    publishBrowserSmokeState(true);
    const command = sourceSpellCommandForSpellId(world, spellId);
    const instantCommand = sourceInstantSpellCommandForSpellId(world, spellId);
    if (command) {
      const targetCandidates = [
        ...createdUnits.map((unit) => ({ x: unit.x, y: unit.y })),
        ...world.corpses.filter((corpse) => corpse.id.startsWith("__smoke-fixture-")).map((corpse) => ({ x: corpse.x, y: corpse.y })),
        { x: caster.x + world.tileSize * 2, y: caster.y },
        { x: caster.x + world.tileSize * 3, y: caster.y + world.tileSize },
        { x: caster.x, y: caster.y }
      ];
      const target = targetCandidates.find((candidate) => canIssueTargetedSpellAt(world as WorldState, caster, command, candidate.x, candidate.y)) ?? null;
      if (!target) {
        return { ok: false, error: `no valid spell target for ${casterTypeId} ${spellId} ${command}`, command, instantCommand, target: null, ...browserSmokeCommandResult() };
      }
      return { ok: true, command, instantCommand, target, ...browserSmokeCommandResult() };
    }
    if (instantCommand) {
      return { ok: true, command: null, instantCommand, target: null, ...browserSmokeCommandResult() };
    }
    return { ok: false, error: `spell ${spellId} has no browser command mapping`, command: null, instantCommand: null, target: null, ...browserSmokeCommandResult() };
  };
  window.__WARGUS_TS_SELECT_SOURCE_RESEARCH_FIXTURE__ = (typeId, upgradeId) => {
    if (!world || !manifest) {
      return { ok: false, error: "missing world", ...browserSmokeCommandResult() };
    }
    const definition = world.unitDefinitions.find((unit) => unit.id === typeId);
    const upgrade = world.upgradeDefinitions.find((candidate) => candidate.id === upgradeId);
    const button = world.buttonDefinitions.find((candidate) => (
      candidate.action === "research"
      && candidate.value === upgradeId
      && candidate.forUnit.includes(typeId)
    ));
    if (!definition || !upgrade || !button) {
      return { ok: false, error: `missing research fixture definitions for ${typeId} ${upgradeId}`, ...browserSmokeCommandResult() };
    }
    clearBrowserSmokeFixtures();
    const requirements = browserSmokeResearchRequirements(upgradeId);
    const conversionTypeIds = browserSmokeResearchConversionTypeIds([upgradeId, ...requirements.upgradeIds]);
    world.allowedUnitTypes = [...new Set([...world.allowedUnitTypes, typeId, ...requirements.unitTypeIds, ...conversionTypeIds])];
    world.allowedUpgradeTypes = [...new Set([...world.allowedUpgradeTypes, upgradeId, ...requirements.upgradeIds])];
    world.researchedUpgrades[world.visibilityPlayer] = [...new Set([...(world.researchedUpgrades[world.visibilityPlayer] ?? []), ...requirements.upgradeIds])];
    const player = world.players.find((candidate) => candidate.id === world!.visibilityPlayer) ?? world.players[0];
    if (player) {
      player.resources.gold = Math.max(player.resources.gold ?? 0, 100000);
      player.resources.wood = Math.max(player.resources.wood ?? 0, 100000);
      player.resources.oil = Math.max(player.resources.oil ?? 0, 100000);
    }
    const baseTileX = Math.max(1, Math.min(world.map.width - 10, Math.floor((player?.startX ?? 8 * 32) / 32) + 3));
    const baseTileY = Math.max(1, Math.min(world.map.height - 8, Math.floor((player?.startY ?? 8 * 32) / 32) + 3));
    const createdUnits: WorldUnit[] = [];
    const building = createWorldUnit({
      unit: definition,
      id: `__smoke-fixture-${definition.id}-${world.nextUnitSerial++}`,
      player: world.visibilityPlayer,
      tileX: baseTileX,
      tileY: baseTileY,
      tileset: activeMap?.setup?.tileset ?? null
    });
    readyBrowserSmokeFixtureUnit(building);
    createdUnits.push(building);
    for (const [index, dependencyTypeId] of requirements.unitTypeIds.filter((dependencyTypeId) => dependencyTypeId !== typeId).entries()) {
      const dependencyDefinition = world.unitDefinitions.find((unit) => unit.id === dependencyTypeId);
      if (!dependencyDefinition) {
        return { ok: false, error: `missing research dependency unit ${dependencyTypeId}`, ...browserSmokeCommandResult() };
      }
      const width = Math.max(dependencyDefinition.tileSize?.[0] ?? 1, 1);
      const height = Math.max(dependencyDefinition.tileSize?.[1] ?? 1, 1);
      const dependency = createWorldUnit({
        unit: dependencyDefinition,
        id: `__smoke-fixture-dependency-${dependencyDefinition.id}-${world.nextUnitSerial++}`,
        player: world.visibilityPlayer,
        tileX: Math.max(1, Math.min(world.map.width - width - 1, baseTileX + 4 + index * 3)),
        tileY: Math.max(1, Math.min(world.map.height - height - 1, baseTileY)),
        tileset: activeMap?.setup?.tileset ?? null
      });
      readyBrowserSmokeFixtureUnit(dependency);
      createdUnits.push(dependency);
    }
    world.units.push(...createdUnits);
    updateVisibility(world);
    selectedUnitIds = clampSelectionToSourceLimit(world, [building.id]);
    pendingWorldCommand = null;
    commandPage = 0;
    centerCameraOnWorldPoint(world, building.x, building.y);
    publishBrowserSmokeState(true);
    return { ok: true, ...browserSmokeCommandResult() };
  };
  window.__WARGUS_TS_EXPECTED_SOURCE_COMMANDS__ = (page) => browserSmokeExpectedSourceCommands(page);
  window.__WARGUS_TS_EXECUTE_HUD_COMMAND__ = (command, input = {}) => {
    const result = executeHudCommand(command as HudCommandId, input);
    publishBrowserSmokeState(true);
    return browserSmokeCommandResult(result);
  };
  window.__WARGUS_TS_EXECUTE_SELECTION_HOTKEY__ = (code, input = {}) => {
    if (!world || !manifest || selectedUnitIds.length === 0) {
      publishBrowserSmokeState(true);
      return browserSmokeCommandResult(null);
    }
    const result = executeSelectionHotkey(world, manifest, code, selectedUnitIds, commandPage, pendingWorldCommand, input);
    if (result.handled) {
      commandPage = result.commandPage;
      pendingWorldCommand = result.pendingWorldCommand;
      playSelectionHotkeyFeedback(result);
    }
    publishBrowserSmokeState(true);
    return browserSmokeCommandResult(result);
  };
  window.__WARGUS_TS_ISSUE_PENDING_WORLD_COMMAND_AT__ = (x, y, shiftKey = false) => {
    let issued = false;
    if (world && pendingWorldCommand && selectedUnitIds.length > 0) {
      issued = issuePendingWorldCommandAt(world, selectedUnitIds, pendingWorldCommand, x, y, shiftKey);
      if (!shouldKeepPendingWorldCommandAfterIssue(world, pendingWorldCommand, issued)) {
        pendingWorldCommand = null;
      }
      if (issued) {
        resumeFixedDemoAfterIssuedCommand(true);
        showSourceOrdersForCommand();
      }
    }
    publishBrowserSmokeState(true);
    return { issued, ...browserSmokeCommandResult() };
  };
  window.__WARGUS_TS_DEBUG_SELECTED_BUILD__ = () => {
    if (!world) {
      return [];
    }
    const selectedUnits = selectedUnitIds
      .map((id) => world?.units.find((unit) => unit.id === id) ?? null)
      .filter((unit): unit is WorldUnit => Boolean(unit));
    return browserSmokeCommandCard()
      .filter((command) => command.sourceAction === "build" && command.sourceValue)
      .flatMap((command) => selectedUnits.map((unit) => ({
        unitId: unit.id,
        typeId: unit.typeId,
        buildingTypeId: command.sourceValue ?? "",
        canStart: canStartBuildingPlacementByType(world as WorldState, unit, command.sourceValue ?? ""),
        gates: sourceBuildEligibilityDebug(world as WorldState, unit, command.sourceValue ?? "")
      })));
  };
  window.__WARGUS_TS_DEBUG_SELECTED_TRAIN__ = () => {
    if (!world) {
      return [];
    }
    const selectedUnits = selectedUnitIds
      .map((id) => world?.units.find((unit) => unit.id === id) ?? null)
      .filter((unit): unit is WorldUnit => Boolean(unit));
    return selectedUnits.flatMap((unit) => {
      const player = world!.players.find((candidate) => candidate.id === unit.player);
      const supply = getPlayerSupply(world!, unit.player);
      return world!.buttonDefinitions
        .filter((button) => button.action === "train-unit" && typeof button.value === "string" && button.forUnit.includes(unit.typeId))
        .map((button) => {
          const definition = world!.unitDefinitions.find((candidate) => candidate.id === button.value);
          return {
            unitId: unit.id,
            typeId: unit.typeId,
            unitTypeId: button.value!,
            canTrain: canTrainUnitAt(world!, unit.id, button.value!, world!.unitDefinitions),
            executable: sourceButtonHasExecutableContext(world!, button, unit),
            visible: sourceButtonVisibleForHud(world!, button, unit.player),
            queueLength: unit.productionQueue.length,
            activeResearchCount: world!.activeResearch.filter((research) => research.buildingId === unit.id).length,
            queuedResearchCount: world!.queuedResearch.filter((research) => research.buildingId === unit.id).length,
            resources: { ...(player?.resources ?? {}) },
            supply,
            demand: definition?.demand ?? 0
          };
        });
    });
  };
  window.__WARGUS_TS_CREATE_WORLD_FOR_MAP__ = async (path) => {
    const map = manifest?.maps.find((candidate) => candidate.path === path);
    if (!manifest || !map) {
      return { ok: false, activeMapPath: null, mapWidth: null, mapHeight: null, unitCount: 0, playerCount: 0, visibilityPlayer: null, saveRoundtripOk: false, saveRoundtripUnitCount: 0, saveRoundtripPlayerCount: 0, error: "missing map" };
    }
    try {
      const setup = await loadMapSetup(map);
      const resolvedMap = setup ? manifest.maps.find((candidate) => candidate.path === setup.presentationPath) ?? map : map;
      const createdWorld = createInitialWorld(resolvedMap, manifest.units, setup, manifest.upgrades, manifest.missiles, manifest.spells, manifest.allowRules, manifest.dependencies, manifest.buttons, manifest.engineSettings, manifest.aiDefinitions, manifest.unitDatabase, manifest.tilesets, manifest.animations);
      const saveJson = exportSavedGame(createdWorld, { x: 0, y: 0, zoom: 1 }, {}, { activeSourceViewportIndex: 0, sourceViewportCameras: [{ x: 0, y: 0, zoom: 1 }] });
      const saveSlot = 99;
      const imported = importSavedGameJson(saveJson, saveSlot);
      const loaded = imported ? loadSavedGame(manifest, saveSlot) : null;
      const saveRoundtripOk = Boolean(
        loaded
        && loaded.map.path === resolvedMap.path
        && loaded.world.map.path === resolvedMap.path
        && loaded.world.map.width === createdWorld.map.width
        && loaded.world.map.height === createdWorld.map.height
        && loaded.world.units.length === createdWorld.units.length
        && loaded.world.players.length === createdWorld.players.length
        && loaded.world.visibilityPlayer === createdWorld.visibilityPlayer
      );
      return {
        ok: true,
        activeMapPath: resolvedMap.path,
        mapWidth: createdWorld.map.width,
        mapHeight: createdWorld.map.height,
        unitCount: createdWorld.units.length,
        playerCount: createdWorld.players.length,
        visibilityPlayer: createdWorld.visibilityPlayer,
        saveRoundtripOk,
        saveRoundtripUnitCount: loaded?.world.units.length ?? 0,
        saveRoundtripPlayerCount: loaded?.world.players.length ?? 0
      };
    } catch (error) {
      return { ok: false, activeMapPath: null, mapWidth: null, mapHeight: null, unitCount: 0, playerCount: 0, visibilityPlayer: null, saveRoundtripOk: false, saveRoundtripUnitCount: 0, saveRoundtripPlayerCount: 0, error: error instanceof Error ? error.message : "unknown error" };
    }
  };
  window.__WARGUS_TS_SAVE_ACTIVE_WORLD_ROUNDTRIP__ = () => {
    if (!manifest || !world || !activeMap) {
      return { ok: false, activeMapPath: activeMap?.path ?? null, mapWidth: world?.map.width ?? null, mapHeight: world?.map.height ?? null, unitCount: world?.units.length ?? 0, playerCount: world?.players.length ?? 0, visibilityPlayer: world?.visibilityPlayer ?? null, saveRoundtripOk: false, saveRoundtripUnitCount: 0, saveRoundtripPlayerCount: 0, tick: world?.tick ?? null, error: "missing active world" };
    }
    try {
      const saveJson = exportSavedGame(world, camera, controlGroups, { activeSourceViewportIndex, sourceViewportCameras });
      const saveSlot = 98;
      const imported = importSavedGameJson(saveJson, saveSlot);
      const loaded = imported ? loadSavedGame(manifest, saveSlot) : null;
      const saveRoundtripOk = Boolean(
        loaded
        && loaded.map.path === activeMap.path
        && loaded.world.map.path === world.map.path
        && loaded.world.map.width === world.map.width
        && loaded.world.map.height === world.map.height
        && loaded.world.units.length === world.units.length
        && loaded.world.players.length === world.players.length
        && loaded.world.visibilityPlayer === world.visibilityPlayer
        && loaded.world.tick === world.tick
      );
      return {
        ok: true,
        activeMapPath: activeMap.path,
        mapWidth: world.map.width,
        mapHeight: world.map.height,
        unitCount: world.units.length,
        playerCount: world.players.length,
        visibilityPlayer: world.visibilityPlayer,
        saveRoundtripOk,
        saveRoundtripUnitCount: loaded?.world.units.length ?? 0,
        saveRoundtripPlayerCount: loaded?.world.players.length ?? 0,
        tick: world.tick
      };
    } catch (error) {
      return { ok: false, activeMapPath: activeMap.path, mapWidth: world.map.width, mapHeight: world.map.height, unitCount: world.units.length, playerCount: world.players.length, visibilityPlayer: world.visibilityPlayer, saveRoundtripOk: false, saveRoundtripUnitCount: 0, saveRoundtripPlayerCount: 0, tick: world.tick, error: error instanceof Error ? error.message : "unknown error" };
    }
  };
  window.__WARGUS_TS_ISSUE_FIRST_HARVEST__ = () => {
    const pair = browserSmokeHarvestPair();
    if (!world || !pair) {
      return false;
    }
    selectedUnitIds = [pair.worker.id];
    centerCameraOnWorldPoint(world, pair.worker.x, pair.worker.y);
    const issued = issueSourceRightButtonOrder(world, [pair.worker.id], pair.target.x, pair.target.y, false, world.visibilityPlayer);
    publishBrowserSmokeState(true);
    return issued;
  };
  window.__WARGUS_TS_ISSUE_FIRST_WOOD_HARVEST__ = () => {
    const pair = browserSmokeWoodHarvestPair();
    if (!world || !pair) {
      return false;
    }
    selectedUnitIds = [pair.worker.id];
    centerCameraOnWorldPoint(world, pair.worker.x, pair.worker.y);
    const issued = issueHarvestWoodOrder(world, pair.worker.id, pair.tileX, pair.tileY);
    publishBrowserSmokeState(true);
    return issued;
  };
  window.__WARGUS_TS_ISSUE_FIRST_GOLD_HARVEST__ = () => {
    const pair = browserSmokeHarvestPair();
    if (!world || !pair) {
      return false;
    }
    selectedUnitIds = [pair.worker.id];
    centerCameraOnWorldPoint(world, pair.worker.x, pair.worker.y);
    const issued = issueSourceRightButtonOrder(world, [pair.worker.id], pair.target.x, pair.target.y, false, world.visibilityPlayer);
    publishBrowserSmokeState(true);
    return issued;
  };
  window.__WARGUS_TS_ISSUE_FIRST_ATTACK__ = () => {
    const pair = browserSmokeCombatPair();
    if (!world || !pair) {
      return false;
    }
    selectedUnitIds = [pair.attacker.id];
    centerCameraOnWorldPoint(world, pair.attacker.x, pair.attacker.y);
    const issued = issueAttackOrder(world, pair.attacker.id, pair.target.id);
    publishBrowserSmokeState(true);
    return issued;
  };
  window.__WARGUS_TS_PLAY_AUDIO_FIXTURE__ = async () => {
    const before = audioEngine?.smokeState().htmlPlayStarts ?? 0;
    await audioEngine?.unlock();
    await ensureMusicStarted();
    await audioEngine?.playSound("click");
    await audioEngine?.playSound("farm-selected");
    await audioEngine?.playUnitSound({ typeId: "unit-footman" }, "selected");
    await audioEngine?.playSound("sword attack");
    await audioEngine?.playSound("bow throw");
    await audioEngine?.playSound("tree-chopping");
    await ensureMusicStarted();
    const after = audioEngine?.smokeState();
    publishBrowserSmokeState(true);
    return {
      ok: Boolean(after && after.htmlPlayStarts >= before + 6 && after.currentMusic),
      beforeStarts: before,
      afterStarts: after?.htmlPlayStarts ?? before,
      currentMusic: after?.currentMusic ?? null,
      lastSoundFile: after?.lastSoundFile ?? null,
      lastError: after?.lastError ?? null
    };
  };
  window.__WARGUS_TS_ISSUE_FIXED_DEMO_DEFENSE__ = () => {
    if (!world || !isFixedBrowserDemoMap(activeMap)) {
      return { issued: false, attackerIds: [], targetIds: [], raidActive: false };
    }
    const targets = browserSmokeFixedDemoRaidTargets();
	    const attackers = browserSmokeFixedDemoDefenders(targets);
	    selectedUnitIds = clampSelectionToSourceLimit(world, attackers.map((attacker) => attacker.id));
	    if (targets[0]) {
	      centerCameraOnWorldPoint(world, targets[0].x, targets[0].y);
	    }
	    let issued = false;
	    const attackerIds: string[] = [];
	    for (const attacker of attackers) {
	      const target = targets
	        .filter((candidate) => canAttackTarget(attacker, candidate, world!))
	        .sort((left, right) => Math.hypot(left.x - attacker.x, left.y - attacker.y) - Math.hypot(right.x - attacker.x, right.y - attacker.y))[0];
	      if (target && issueAttackOrder(world, attacker.id, target.id)) {
	        issued = true;
	        attackerIds.push(attacker.id);
	      }
	    }
	    publishBrowserSmokeState(true);
	    return {
	      issued,
	      attackerIds,
	      targetIds: targets.map((target) => target.id),
	      raidActive: browserSmokeFixedDemoRaidTargets().length > 0
	    };
	  };
	  window.__WARGUS_TS_ISSUE_FIXED_DEMO_FINAL_ATTACK__ = () => {
	    const target = browserSmokeFixedDemoObjectiveTarget();
	    if (!world || !target) {
	      return { issued: false, attackerIds: [], targetId: target?.id ?? null, targetHitPoints: target?.hitPoints ?? null, matchStatus: world?.matchState.status ?? null };
	    }
	    const attackers = browserSmokeFixedDemoAttackers(target);
	    selectedUnitIds = clampSelectionToSourceLimit(world, attackers.map((attacker) => attacker.id));
	    centerCameraOnWorldPoint(world, target.x, target.y);
	    paused = false;
	    const attackerIds = attackers
	      .filter((attacker) => issueAttackOrder(world!, attacker.id, target.id))
	      .map((attacker) => attacker.id);
	    publishBrowserSmokeState(true);
	    return {
	      issued: attackerIds.length > 0,
	      attackerIds,
	      targetId: target.id,
	      targetHitPoints: target.hitPoints,
	      matchStatus: world.matchState.status
	    };
	  };
	  window.__WARGUS_TS_FIXED_DEMO_OBJECTIVE_TARGET__ = () => {
	    const target = browserSmokeFixedDemoObjectiveTarget();
	    return target ? { id: target.id, typeId: target.typeId, player: target.player, hitPoints: target.hitPoints, x: target.x, y: target.y } : null;
	  };
	  window.__WARGUS_TS_ISSUE_FIRST_SPELL__ = () => {
    const pair = browserSmokeSpellPair();
    if (!world || !pair) {
      return false;
    }
    selectedUnitIds = [pair.caster.id];
    centerCameraOnWorldPoint(world, pair.caster.x, pair.caster.y);
    const issued = issueGroupTargetedSpellOrder(world, [pair.caster.id], pair.command, pair.target.x, pair.target.y);
	    publishBrowserSmokeState(true);
    return issued;
  };
  window.__WARGUS_TS_ISSUE_FIRST_TRAIN__ = () => {
    const pair = browserSmokeTrainPair();
    if (!world || !pair) {
      return false;
    }
    selectedUnitIds = [pair.building.id];
    centerCameraOnWorldPoint(world, pair.building.x, pair.building.y);
    const issued = issueTrainUnitOrder(world, pair.building.id, pair.unitTypeId, world.unitDefinitions);
    publishBrowserSmokeState(true);
    return issued;
  };
  window.__WARGUS_TS_UNIT_HIT_POINTS__ = (unitId) => world?.units.find((unit) => unit.id === unitId)?.hitPoints ?? null;
  window.__WARGUS_TS_DEBUG_UNITS__ = () => (world?.units ?? []).map((unit) => ({
    id: unit.id,
    typeId: unit.typeId,
    player: unit.player,
    x: unit.x,
    y: unit.y,
    order: unit.order?.kind ?? null
  }));
}

const keyBindings: Record<string, CameraButton> = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  Equal: "zoomIn",
  Minus: "zoomOut"
};

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

window.addEventListener("keydown", (event) => {
  if (isEditableKeyboardTarget(event.target)) {
    return;
  }
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
    sourceShowOrdersShiftHeld = true;
  }
  unlockAudioForInput();
  const overlayAction = sourceOverlayKeyAction(event, { titleScreenOpen, briefingOpen });
  if (overlayAction === "dismiss-title") {
    event.preventDefault();
    dismissTitleScreen();
    return;
  }
  if (overlayAction === "dismiss-briefing") {
    event.preventDefault();
    dismissBriefing();
    return;
  }
  if (overlayAction === "replay-briefing") {
    event.preventDefault();
    replayBriefingAudio();
    return;
  }
  if (handleSourceCheatKey(event)) {
    return;
  }
  if (handleMatchOverlayKey(event)) {
    return;
  }
  if (world && event.code === "Period") {
    event.preventDefault();
    selectNextIdleWorker(world);
    return;
  }
  if (sourceTrackUnitKeyAction(event)) {
    event.preventDefault();
    toggleTrackedViewportUnit(world);
    return;
  }
  if (sourceCenterSelectedKeyAction(event)) {
    event.preventDefault();
    centerCameraOnSelectedUnits(world);
    return;
  }
  if (handleSourcePreferenceKey(event)) {
    return;
  }
  if (handleMapPickerKey(event)) {
    return;
  }
  if (menuOverlay && event.code === "Escape") {
    event.preventDefault();
    if (menuOverlay === "preferences") {
      void executeMapCommand("preferences-cancel");
      return;
    }
    menuOverlay = null;
    diplomacyDraft = null;
    preferencesDraft = null;
    return;
  }
  if (handleSourceIngameCommandKey(event)) {
    return;
  }
  if (handleSpeedKey(event)) {
    return;
  }
  if (pendingWorldCommand && event.code === "Escape") {
    event.preventDefault();
    pendingWorldCommand = null;
    return;
  }
  if (commandPage !== 0 && event.code === "Escape") {
    event.preventDefault();
    commandPage = 0;
    playGameSound("click");
    return;
  }

  if (world && handleControlGroupKey(event)) {
    event.preventDefault();
    return;
  }

  if (world && manifest && selectedUnitIds.length > 0) {
    const result = executeSelectionHotkey(world, manifest, event.code, selectedUnitIds, commandPage, pendingWorldCommand, { shiftKey: event.shiftKey });
    if (result.handled) {
      event.preventDefault();
      commandPage = result.commandPage;
      pendingWorldCommand = result.pendingWorldCommand;
      playSelectionHotkeyFeedback(result);
      return;
    }
  }

  const binding = keyBindings[event.code];
  if (binding) {
    event.preventDefault();
    cameraInput[binding] = true;
  }
});

window.addEventListener("keyup", (event) => {
  if (isEditableKeyboardTarget(event.target)) {
    return;
  }
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
    sourceShowOrdersShiftHeld = false;
  }
  const binding = keyBindings[event.code];
  if (binding) {
    event.preventDefault();
    cameraInput[binding] = false;
  }
});

app.canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  if (!sourceScreenPointIsInPlayableViewport(event.clientX, event.clientY)) {
    return;
  }
  zoomCameraAtScreenPoint(event.clientX, event.clientY, event.deltaY > 0 ? -0.08 : 0.08);
  clampCameraToWorld(camera, world, playableCameraViewport());
  persistActiveSourceViewportCamera();
}, { passive: false });

app.canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

app.canvas.addEventListener("dblclick", (event) => {
  if (!world || titleScreenOpen || pendingWorldCommand) {
    return;
  }
  updatePointerScreenPosition(event.clientX, event.clientY);
  const point = viewportPointForScreenPosition(event.clientX, event.clientY);
  if (!point) {
    return;
  }
  selectSameTypeUnitsAt(world, point.worldPoint.x, point.worldPoint.y, event.shiftKey);
});

app.canvas.addEventListener("pointerdown", (event) => {
  unlockAudioForInput();
  if (titleScreenOpen) {
    return;
  }
  updatePointerScreenPosition(event.clientX, event.clientY);
  maybeGrabSourceMouse();
  if (!sourceMouseDragScrollEnabled(world, event.button) || !sourceScreenPointIsInPlayableViewport(event.clientX, event.clientY)) {
    return;
  }
  beginCameraDrag(cameraInput, event.clientX, event.clientY);
});

window.addEventListener("pointerup", () => {
  endCameraDrag(cameraInput);
});

window.addEventListener("pointermove", (event) => {
  updatePointerScreenPosition(event.clientX, event.clientY);
  updateEdgeScroll(event.clientX, event.clientY, event.buttons, event.ctrlKey);
  if (dragCameraByPointer(camera, cameraInput, event.clientX, event.clientY, sourceMouseDragScrollScale(world, event.ctrlKey))) {
    persistActiveSourceViewportCamera();
  }
});

window.addEventListener("pointerleave", () => {
  pointerScreenPosition = null;
  applySourceLeaveStopScrolling();
});

window.addEventListener("pointercancel", () => {
  pointerScreenPosition = null;
  resetTransientInput();
});

window.addEventListener("resize", () => {
  syncResponsiveViewport();
});

window.addEventListener("blur", () => {
  resetTransientInput();
  applyPauseOnLeave();
});

selectionLayer.eventMode = "static";
selectionLayer.on("pointerdown", (event) => {
  unlockAudioForInput();
  if (!world || titleScreenOpen) {
    return;
  }
  const nativeEvent = event.nativeEvent;
  if (nativeEvent instanceof PointerEvent) {
    updatePointerScreenPosition(nativeEvent.clientX, nativeEvent.clientY);
    maybeGrabSourceMouse();
  }
  const point = pointerScreenPosition ? viewportPointForScreenPosition(pointerScreenPosition.x, pointerScreenPosition.y) : null;
  if (!point) {
    return;
  }
  activateSourceViewport(point.index);
  const button = nativeEvent instanceof PointerEvent ? nativeEvent.button : 0;
  const pointerDownDoubleClick = sourcePointerDownDoubleClick(world, button, point.worldPoint.x, point.worldPoint.y);
  if (pointerDownDoubleClick && button === 0 && !pendingWorldCommand) {
    if (selectSameTypeUnitsAt(world, point.worldPoint.x, point.worldPoint.y, nativeEvent instanceof PointerEvent && nativeEvent.shiftKey)) {
      return;
    }
  }
  const result = handleWorldPointerDown(world, point.worldPoint.x, point.worldPoint.y, {
    button,
    shiftKey: nativeEvent instanceof PointerEvent && nativeEvent.shiftKey,
    ctrlKey: nativeEvent instanceof PointerEvent && nativeEvent.ctrlKey,
    doubleClick: pointerDownDoubleClick || event.detail >= 2
  }, selectedUnitIds, pendingWorldCommand);
  pointerWorldPosition = result.pointerWorldPosition;
  pendingWorldCommand = result.pendingWorldCommand;
  if (result.kind === "click") {
    playGameSound("click");
    return;
  }
  if (result.kind === "command-feedback") {
    resumeFixedDemoAfterIssuedCommand(result.issued);
    playWorldCommandFeedback(result.feedbackUnit, result.issued);
    return;
  }
  if (result.kind === "selection-drag") {
    selectionDrag = result.selectionDrag;
    return;
  }
});

function selectSameTypeUnitsAt(loadedWorld: WorldState, x: number, y: number, additive: boolean): boolean {
  const unit = findSelectableUnitAt(loadedWorld, x, y);
  if (!unit || unit.player !== loadedWorld.visibilityPlayer) {
    return false;
  }
  selectedUnitIds = selectVisibleUnitsOfType(
    loadedWorld,
    unit.id,
    currentPlayableWorldBounds(),
    selectedUnitIds,
    additive
  );
  commandPage = 0;
  clearSelectionClickState(selectionClickState);
  void audioEngine?.playUnitSound(unit, "selected", sourceStereoPanForUnit(unit));
  publishBrowserSmokeState(true);
  return true;
}

function sourcePointerDownDoubleClick(loadedWorld: WorldState, button: number, x: number, y: number): boolean {
  if (button !== 0) {
    lastSelectionPointerDown = null;
    return false;
  }
  const now = performance.now();
  const previous = lastSelectionPointerDown;
  lastSelectionPointerDown = { x, y, at: now };
  if (!previous || now - previous.at > sourceDoubleClickDelayMs(loadedWorld)) {
    return false;
  }
  return Math.hypot(x - previous.x, y - previous.y) <= Math.max(10, loadedWorld.tileSize * 0.5);
}

function playWorldCommandFeedback(unit: WorldUnit | null, issued: boolean): void {
  if (!unit) {
    return;
  }
  if (issued) {
    showSourceOrdersForCommand();
    void audioEngine?.playUnitSound(unit, sourceCommandFeedbackUnitSoundEvent(unit), sourceStereoPanForUnit(unit));
  } else {
    playPlacementErrorSound(unit);
  }
}

function sourceCommandFeedbackUnitSoundEvent(unit: WorldUnit): "acknowledge" | "attack" {
  const orderKind = unit.order?.kind;
  return orderKind === "attack" || orderKind === "attack-move" || orderKind === "attack-ground" || orderKind === "patrol"
    ? "attack"
    : "acknowledge";
}

selectionLayer.on("pointermove", (event) => {
  const nativeEvent = event.nativeEvent;
  if (nativeEvent instanceof PointerEvent) {
    updatePointerScreenPosition(nativeEvent.clientX, nativeEvent.clientY);
  }
  pointerWorldPosition = pointerScreenPosition ? worldPointForScreenPosition(pointerScreenPosition.x, pointerScreenPosition.y) : null;
  if (!pointerWorldPosition) {
    return;
  }
  updateSelectionDrag(selectionDrag, pointerWorldPosition.x, pointerWorldPosition.y);
});

window.addEventListener("pointerup", () => {
  if (!world || !selectionDrag) {
    selectionDrag = null;
    return;
  }
  const drag = selectionDrag;
  selectionDrag = null;
  const result = completeSelectionDrag(world, drag, selectedUnitIds, selectionClickState, currentPlayableWorldBounds());
  if (!result) {
    return;
  }
  selectedUnitIds = result.selectedUnitIds;
  commandPage = result.commandPage;
  if (result.voiceUnit) {
    if (result.playAnnoyed) {
      void audioEngine?.playUnitAnnoyedSound(result.voiceUnit, sourceStereoPanForUnit(result.voiceUnit));
    } else {
      void audioEngine?.playUnitSound(result.voiceUnit, "selected", sourceStereoPanForUnit(result.voiceUnit));
    }
  }
});

try {
  manifest = await loadWargusManifest();
  audioEngine = new AudioEngine(manifest);
  activeMap = chooseInitialMap(manifest);
  const setup = await loadMapSetup(activeMap);
  world = createInitialWorld(activeMap, manifest.units, setup, manifest.upgrades, manifest.missiles, manifest.spells, manifest.allowRules, manifest.dependencies, manifest.buttons, manifest.engineSettings, manifest.aiDefinitions, manifest.unitDatabase, manifest.tilesets, manifest.animations);
  applyFixedBrowserDemoWorldPresentation(activeMap, world);
  captureBrowserSmokeScenarioSnapshot();
  applyFixedDemoMovementPace(world);
  gameSpeed = sourceGameSpeedMultiplier(world);
  paused = sourceSetupPaused(setup);
  audioEngine.setTileset(setup?.tileset);
  syncAudioSettingsFromWorld();
  resetWorldTransientState();
  titleScreenOpen = !isFixedBrowserDemoMap(activeMap);
  briefingOpen = Boolean(world.briefingText);
  resetBriefingAudioCue(audioCueState);
  startBriefingAudio(world);
  resetUnitAtlasTracking();
  focusInitialCameraOnPlayableStart(world);
  selectedUnitIds = isFixedBrowserDemoMap(activeMap) ? fixedBrowserDemoInitialSelection(world) : selectedUnitIds;
  applyCompleteWorldViewAssets(await loadCompleteWorldViewAssets(manifest, world, setup));
  loading.visible = false;
} catch (error) {
  loading.text = error instanceof Error ? error.message : "Unable to load Wargus manifest";
}

const frame = new Graphics();
hudLayer.addChild(frame);

app.ticker.add((ticker) => {
  const maxFrameDeltaSeconds = isFixedBrowserDemoMap(activeMap) ? FIXED_DEMO_MAX_FRAME_DELTA_SECONDS : MAX_FRAME_DELTA_SECONDS;
  const elapsedMs = Number.isFinite(ticker.elapsedMS) ? ticker.elapsedMS : ticker.deltaMS;
  const deltaSeconds = Math.min(maxFrameDeltaSeconds, elapsedMs / 1000);
  recordFrameTiming(elapsedMs);
  updateCamera(camera, cameraInput, deltaSeconds, world, playableCameraViewport());
  persistActiveSourceViewportCamera();

  if (world && manifest && activeMap) {
    const loadedWorld = world;
    const updateStartedAt = performance.now();
    if (!paused && !briefingOpen) {
      if (!titleScreenOpen) {
        simulateWorld(world, deltaSeconds * sourceRuntimeGameSpeedMultiplier(world, gameSpeed));
          autosaveClock += deltaSeconds;
      }
    }
    applyFixedDemoMovementPace(world);
    updateFixedDemoMission(world, fixedDemoMissionState, { briefingOpen, titleScreenOpen, addHudMessage });
    const autosaveIntervalSeconds = sourceAutosaveIntervalSeconds(world);
    if (autosaveIntervalSeconds > 0 && autosaveClock >= autosaveIntervalSeconds) {
      autosaveClock = 0;
      saveAutosaveForContext(saveCommandContext());
    }
    drainWorldEvents(world);
    maybeStartMatchMusicCue(audioCueState, audioEngine, world);
    recordCampaignProgress(campaignProgressState, activeMap, world);
    ensureMissingUnitAtlases(unitAtlasLazyLoadState, world, unitAtlases, manifest?.units ?? null);
    pruneHudMessageState(hudMessageState);
    selectedUnitIds = selectedUnitIds.filter((id) => isSelectionStillValid(loadedWorld, id));
    if (selectedUnitIds.length === 0) {
      commandPage = 0;
    }
    updateTrackedViewportUnit(loadedWorld);
    pruneControlGroups(world, controlGroups);
    updateSourceCursor();
    recordUpdateTiming(performance.now() - updateStartedAt);
    if (!sourceShouldRenderFrame(world)) {
      publishBrowserSmokeState();
      recordPlaytestTelemetry(performance.now());
      return;
    }
    const sourceShowOrdersVisible = sourceShowOrdersShiftHeld || sourceShowOrdersUntilTick >= world.tick;
    const renderStartedAt = performance.now();
    renderWorld({ world, manifest, camera, app, worldLayer, mapLayer, unitLayer, fogLayer, selectionLayer, selectedUnitIds, controlGroups, sourceShowOrdersVisible, unitAtlases, missileAtlases, statusDecorationAtlas, tileAtlas, fogAtlas, sourceViewportCameras, activeSourceViewportIndex, renderDeltaSeconds: deltaSeconds });
    const hoveredUnit = sourceUnitUnderCursor(world, pointerWorldPosition);
    const shouldRenderHud = shouldRenderHudFrame(world, deltaSeconds, hoveredUnit?.id ?? null);
    if (shouldRenderHud) {
      renderMainHud(loadedWorld, hoveredUnit);
    }
    overlayLayer.removeChildren();
    renderSelectionDragOverlay({ layer: overlayLayer, camera, world, screenWidth: app.screen.width, screenHeight: app.screen.height, activeSourceViewportIndex }, selectionDrag);
    renderBuildPlacementOverlay({ layer: overlayLayer, camera, world, screenWidth: app.screen.width, screenHeight: app.screen.height, activeSourceViewportIndex, manifest, pointerWorldPosition, selectedUnitIds, pendingWorldCommand });
    renderPendingCommandOverlay({ layer: overlayLayer, camera, world, screenWidth: app.screen.width, screenHeight: app.screen.height, activeSourceViewportIndex, pointerWorldPosition, selectedUnitIds, pendingWorldCommand });
    renderAlertPingOverlays({ layer: overlayLayer, camera, world, screenWidth: app.screen.width, screenHeight: app.screen.height, activeSourceViewportIndex }, world, hudMessageState.alertPings);
    renderSourceMapNamePopup({ layer: overlayLayer, camera, world, screenWidth: app.screen.width, screenHeight: app.screen.height, activeSourceViewportIndex, manifest, pointerScreenPosition, pointerWorldPosition, hoveredUnit, popupState: sourceMapNamePopupState });
    renderSourceSoftwareCursor();
    recordRenderTiming(performance.now() - renderStartedAt, shouldRenderHud);
  }
  publishBrowserSmokeState();
  recordPlaytestTelemetry(performance.now());
});

function sourceShouldRenderFrame(loadedWorld: WorldState): boolean {
  sourceRenderedFrameCounter = (sourceRenderedFrameCounter + 1) >>> 0;
  const frameSkip = Math.max(0, Math.round(loadedWorld.engineSettings.frameSkipDefault));
  return frameSkip === 0 || (sourceRenderedFrameCounter & frameSkip) === 0;
}

function renderMainHud(loadedWorld: WorldState, hoveredUnit: WorldUnit | null): void {
  if (!manifest || !activeMap) {
    return;
  }
  renderHud({
    app,
    hudLayer,
    frame,
    manifest,
    activeMap,
    world: loadedWorld,
    camera,
    sourceViewportCameras,
    selectedUnitIds,
    hoveredUnitId: hoveredUnit?.id ?? null,
    hudMessages: hudMessageState.messages,
    alertPings: hudMessageState.alertPings,
    controlGroups,
    activeSaveSlot: saveCommandState.activeSaveSlot,
    activeSaveSummary: getSavedGameSummary(saveCommandState.activeSaveSlot),
    autosaveSummary: getAutosaveSummary(),
    paused,
    gameSpeed,
    briefingOpen,
    titleScreenOpen,
    nextCampaignMap: nextCampaignMapFor(activeMap, manifest),
    iconAtlas,
    statusDecorationAtlas,
    sourcePanelAtlas,
    sourceButtonStyleAtlas,
    resourceUiAtlas,
    wargusBitmapFontAtlas,
    commandPage,
    onDismissBriefing: dismissBriefing,
    onDismissTitleScreen: dismissTitleScreen,
    onReplayBriefing: replayBriefingAudio,
    onNextCampaignMission: () => {
      void loadNextCampaignMission();
    },
    onCommand: (command, input) => executeHudCommand(command, input),
    onMapCommand: (command) => {
      titleScreenOpen = false;
      void executeMapCommand(command);
    },
    onSelectedUnitPick: (unitId, additive) => {
      selectedUnitIds = additive && selectedUnitIds.length > 1
        ? selectedUnitIds.filter((id) => id !== unitId)
        : world ? clampSelectionToSourceLimit(world, [unitId]) : [unitId];
      commandPage = 0;
      fixedDemoHudRenderKey = "";
      const unit = world?.units.find((candidate) => candidate.id === unitId);
      if (unit) {
        void audioEngine?.playUnitSound(unit, "selected", sourceStereoPanForUnit(unit));
      }
    },
    onFreeWorkerPick: () => {
      if (world) {
        selectNextIdleWorker(world);
        fixedDemoHudRenderKey = "";
      }
    },
    onProductionQueuePick: (buildingId, item) => {
      const building = world?.units.find((candidate) => candidate.id === buildingId) ?? null;
      const handled = Boolean(world && (item.kind === "production"
        ? issueCancelProductionOrder(world, buildingId, item.index)
        : issueCancelResearchOrder(world, buildingId)));
      if (handled) {
        fixedDemoHudRenderKey = "";
        playGameSound("click");
      } else {
        playPlacementErrorSound(building);
      }
    },
    onCargoUnitPick: (transportId, cargoUnitId, queue) => {
      const transport = world?.units.find((candidate) => candidate.id === transportId) ?? null;
      if (world && issueUnloadCargoUnitOrder(world, transportId, cargoUnitId, queue)) {
        fixedDemoHudRenderKey = "";
        playGameSound("click");
      } else {
        playPlacementErrorSound(transport);
      }
    },
    mapPicker: mapPickerState,
    completedCampaignMissions: loadCampaignProgress(),
    onMapPick: (map) => {
      void selectMapFromPicker(map);
    },
    onMinimapPoint: (tileX, tileY, input) => handleMinimapPoint(loadedWorld, tileX, tileY, input),
    menuOverlay,
    diplomacyDraft,
    activeSourceViewportIndex
  });
}

function shouldRenderHudFrame(loadedWorld: WorldState, deltaSeconds: number, hoveredUnitId: string | null): boolean {
  if (!isFixedBrowserDemoMap(activeMap)) {
    return true;
  }
  fixedDemoHudRefreshClock += deltaSeconds;
  const nextKey = fixedDemoHudStateKey(loadedWorld, hoveredUnitId);
  if (nextKey !== fixedDemoHudRenderKey) {
    fixedDemoHudRenderKey = nextKey;
    fixedDemoHudRefreshClock = 0;
    return true;
  }
  if (fixedDemoCameraScrolling()) {
    return false;
  }
  if (fixedDemoHudRefreshClock >= FIXED_DEMO_HUD_REFRESH_SECONDS) {
    fixedDemoHudRefreshClock = 0;
    return true;
  }
  return false;
}

function fixedDemoHudStateKey(loadedWorld: WorldState, hoveredUnitId: string | null): string {
  const visiblePlayer = loadedWorld.players.find((player) => player.id === loadedWorld.visibilityPlayer);
  const resources = visiblePlayer ? `${visiblePlayer.resources.gold}:${visiblePlayer.resources.wood}:${visiblePlayer.resources.oil}` : "";
  const selected = selectedUnitIds
    .map((id) => loadedWorld.units.find((unit) => unit.id === id))
    .filter((unit): unit is WorldUnit => Boolean(unit))
    .map((unit) => `${unit.id}:${Math.round(unit.hitPoints)}:${unit.order?.kind ?? "idle"}:${unit.productionQueue.length}:${Math.round(unit.productionQueue[0]?.remainingSeconds ?? 0)}`)
    .join("|");
  const mission = fixedDemoMissionSummary(loadedWorld, briefingOpen);
  return [
    app.screen.width,
    app.screen.height,
    resources,
    selected,
    hoveredUnitId ?? "",
    commandPage,
    paused ? 1 : 0,
    gameSpeed.toFixed(2),
    hudMessageState.messages.map((message) => message.text).join("^"),
    pendingWorldCommand ? browserSmokePendingCommandKind(pendingWorldCommand) : "",
    mission ? `${mission.stage}:${mission.objective}:${mission.raidLaunched ? 1 : 0}:${mission.enemyHallHitPoints ?? 0}` : "",
    loadedWorld.objectives.join("|"),
    menuOverlay ?? "",
    briefingOpen ? 1 : 0,
    titleScreenOpen ? 1 : 0
  ].join(";");
}

type FixedDemoPacedUnit = WorldUnit & {
  __fixedDemoPaceBaseSpeed?: number;
  __fixedDemoPaceMultiplier?: number;
};

function applyFixedDemoMovementPace(loadedWorld: WorldState): void {
  if (!isFixedBrowserDemoMap(activeMap)) {
    return;
  }
  for (const rawUnit of loadedWorld.units) {
    if (rawUnit.hitPoints <= 0 || rawUnit.baseSpeed <= 0 || rawUnit.speed <= 0 || rawUnit.construction) {
      continue;
    }
    const unit = rawUnit as FixedDemoPacedUnit;
    if (unit.__fixedDemoPaceMultiplier === FIXED_DEMO_MOVEMENT_PACE_MULTIPLIER) {
      continue;
    }
    const sourceBaseSpeed = unit.__fixedDemoPaceBaseSpeed ?? unit.baseSpeed;
    unit.__fixedDemoPaceBaseSpeed = sourceBaseSpeed;
    unit.__fixedDemoPaceMultiplier = FIXED_DEMO_MOVEMENT_PACE_MULTIPLIER;
    unit.baseSpeed = sourceBaseSpeed * FIXED_DEMO_MOVEMENT_PACE_MULTIPLIER;
    const statusMultiplier = unit.statusEffects.reduce((multiplier, effect) => multiplier * effect.speedMultiplier, 1);
    unit.speed = Math.max(1, unit.baseSpeed * statusMultiplier);
  }
}

function recordFrameTiming(elapsedMs: number): void {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return;
  }
  renderPerformance.lastFrameMs = elapsedMs;
  renderPerformance.averageFrameMs = smoothedTiming(renderPerformance.averageFrameMs, elapsedMs);
}

function recordUpdateTiming(updateMs: number): void {
  if (!Number.isFinite(updateMs) || updateMs < 0) {
    return;
  }
  renderPerformance.lastUpdateMs = updateMs;
  renderPerformance.averageUpdateMs = smoothedTiming(renderPerformance.averageUpdateMs, updateMs);
}

function recordRenderTiming(renderMs: number, hudRendered: boolean): void {
  if (Number.isFinite(renderMs) && renderMs >= 0) {
    renderPerformance.lastRenderMs = renderMs;
    renderPerformance.averageRenderMs = smoothedTiming(renderPerformance.averageRenderMs, renderMs);
  }
  renderPerformance.hudRenderedLastFrame = hudRendered;
}

function recordSmokeTiming(smokeMs: number): void {
  if (!Number.isFinite(smokeMs) || smokeMs < 0) {
    return;
  }
  renderPerformance.lastSmokeMs = smokeMs;
  renderPerformance.averageSmokeMs = smoothedTiming(renderPerformance.averageSmokeMs, smokeMs);
}

function installPlaytestTelemetryHooks(): void {
  window.__WARGUS_TS_PLAYTEST_LOG__ = () => {
    ensurePlaytestTelemetryLoaded();
    return playtestTelemetryLog.map((entry) => ({ ...entry }));
  };
  window.__WARGUS_TS_EXPORT_PLAYTEST_LOG__ = () => {
    ensurePlaytestTelemetryLoaded();
    return JSON.stringify(playtestTelemetryLog, null, 2);
  };
  window.__WARGUS_TS_CLEAR_PLAYTEST_LOG__ = () => {
    ensurePlaytestTelemetryLoaded();
    const cleared = playtestTelemetryLog.length;
    playtestTelemetryLog = [];
    persistPlaytestTelemetry(true);
    return cleared;
  };
}

function ensurePlaytestTelemetryLoaded(): void {
  if (playtestTelemetryLoaded) {
    return;
  }
  playtestTelemetryLoaded = true;
  try {
    const raw = window.localStorage.getItem(PLAYTEST_TELEMETRY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    playtestTelemetryLog = Array.isArray(parsed) ? parsed.slice(-PLAYTEST_TELEMETRY_MAX_ENTRIES) as PlaytestTelemetryEntry[] : [];
  } catch {
    playtestTelemetryLog = [];
  }
}

function recordPlaytestTelemetry(now: number): void {
  ensurePlaytestTelemetryLoaded();
  const jankReasons = playtestTelemetryJankReasons();
  const shouldSample = lastPlaytestTelemetrySampleMs <= 0 || now - lastPlaytestTelemetrySampleMs >= PLAYTEST_TELEMETRY_SAMPLE_MS;
  const shouldRecordJank = jankReasons.length > 0 && now - lastPlaytestTelemetryJankMs >= 500;
  if (!shouldSample && !shouldRecordJank) {
    return;
  }
  if (shouldSample) {
    lastPlaytestTelemetrySampleMs = now;
  }
  if (shouldRecordJank) {
    lastPlaytestTelemetryJankMs = now;
  }
  playtestTelemetryLog.push(createPlaytestTelemetryEntry(now, shouldRecordJank ? "jank" : "sample", jankReasons));
  if (playtestTelemetryLog.length > PLAYTEST_TELEMETRY_MAX_ENTRIES) {
    playtestTelemetryLog = playtestTelemetryLog.slice(-PLAYTEST_TELEMETRY_MAX_ENTRIES);
  }
  persistPlaytestTelemetry(shouldRecordJank || now - lastPlaytestTelemetryFlushMs >= PLAYTEST_TELEMETRY_STORAGE_FLUSH_MS);
}

function playtestTelemetryJankReasons(): string[] {
  const reasons: string[] = [];
  if ((renderPerformance.lastFrameMs ?? 0) >= PLAYTEST_TELEMETRY_JANK_THRESHOLDS_MS.frame) {
    reasons.push(`frame:${Math.round(renderPerformance.lastFrameMs ?? 0)}ms`);
  }
  if ((renderPerformance.lastUpdateMs ?? 0) >= PLAYTEST_TELEMETRY_JANK_THRESHOLDS_MS.update) {
    reasons.push(`update:${Math.round(renderPerformance.lastUpdateMs ?? 0)}ms`);
  }
  if ((renderPerformance.lastRenderMs ?? 0) >= PLAYTEST_TELEMETRY_JANK_THRESHOLDS_MS.render) {
    reasons.push(`render:${Math.round(renderPerformance.lastRenderMs ?? 0)}ms`);
  }
  if ((renderPerformance.lastSmokeMs ?? 0) >= PLAYTEST_TELEMETRY_JANK_THRESHOLDS_MS.smoke) {
    reasons.push(`smoke:${Math.round(renderPerformance.lastSmokeMs ?? 0)}ms`);
  }
  return reasons;
}

function createPlaytestTelemetryEntry(now: number, kind: PlaytestTelemetryEntry["kind"], jankReasons: string[]): PlaytestTelemetryEntry {
  const fog = playtestTelemetryFogCounts();
  const memory = (performance as Performance & {
    memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number; jsHeapSizeLimit?: number };
  }).memory;
  return {
    kind,
    atMs: Math.round(now),
    wallTimeIso: new Date().toISOString(),
    activeMapPath: activeMap?.path ?? null,
    tick: world?.tick ?? null,
    unitCount: world?.units.length ?? 0,
    selectedUnitCount: selectedUnitIds.length,
    camera: { x: Math.round(camera.x), y: Math.round(camera.y), zoom: camera.zoom },
    gameSpeed,
    paused,
    titleScreenOpen,
    briefingOpen,
    performance: { ...renderPerformance },
    jankReasons,
    displayObjects: {
      mapLayerChildren: mapLayer.children.length,
      unitLayerChildren: unitLayer.children.length,
      fogLayerChildren: fogLayer.children.length,
      hudLayerChildren: hudLayer.children.length,
      overlayLayerChildren: overlayLayer.children.length
    },
    fog,
    memory: {
      usedJsHeapSize: memory?.usedJSHeapSize ?? null,
      totalJsHeapSize: memory?.totalJSHeapSize ?? null,
      jsHeapSizeLimit: memory?.jsHeapSizeLimit ?? null
    }
  };
}

function playtestTelemetryFogCounts(): PlaytestTelemetryEntry["fog"] {
  if (!world) {
    return { visibleTiles: 0, exploredTiles: 0, unexploredTiles: 0 };
  }
  let visibleTiles = 0;
  let exploredTiles = 0;
  let unexploredTiles = 0;
  for (let index = 0; index < world.visibleTiles.length; index += 1) {
    if (world.visibleTiles[index] === 1) {
      visibleTiles += 1;
    }
    if (world.exploredTiles[index] === 1) {
      exploredTiles += 1;
    } else {
      unexploredTiles += 1;
    }
  }
  return { visibleTiles, exploredTiles, unexploredTiles };
}

function persistPlaytestTelemetry(force = false): void {
  if (!force) {
    return;
  }
  lastPlaytestTelemetryFlushMs = performance.now();
  try {
    window.localStorage.setItem(PLAYTEST_TELEMETRY_STORAGE_KEY, JSON.stringify(playtestTelemetryLog));
  } catch {
    // Telemetry should never interrupt the demo.
  }
}

function fixedDemoCameraScrolling(): boolean {
  return Boolean(cameraInput.up || cameraInput.down || cameraInput.left || cameraInput.right || cameraInput.edgeX || cameraInput.edgeY || cameraInput.dragging);
}

function smoothedTiming(previous: number | null, next: number): number {
  return previous === null ? next : previous * 0.9 + next * 0.1;
}

async function loadPlayableMap(map: WargusMap): Promise<void> {
  if (!manifest) {
    return;
  }
  loading.visible = true;
  loading.text = `Loading ${map.title === "(unnamed)" ? map.path : map.title}`;
  try {
    const setup = await loadMapSetup(map);
    activeMap = setup ? manifest.maps.find((candidate) => candidate.path === setup.presentationPath) ?? map : map;
    world = createInitialWorld(activeMap, manifest.units, setup, manifest.upgrades, manifest.missiles, manifest.spells, manifest.allowRules, manifest.dependencies, manifest.buttons, manifest.engineSettings, manifest.aiDefinitions, manifest.unitDatabase, manifest.tilesets, manifest.animations);
    applyFixedBrowserDemoWorldPresentation(activeMap, world);
    captureBrowserSmokeScenarioSnapshot();
    applyFixedDemoMovementPace(world);
    gameSpeed = sourceGameSpeedMultiplier(world);
    paused = sourceSetupPaused(setup);
    audioEngine?.setTileset(setup?.tileset);
    audioEngine?.stopMusic();
    syncAudioSettingsFromWorld();
    resetWorldTransientState();
    briefingOpen = Boolean(world.briefingText);
    resetBriefingAudioCue(audioCueState);
    resetCampaignProgressSession(campaignProgressState);
    startBriefingAudio(world);
    resetMatchMusicCue(audioCueState);
    resetUnitAtlasTracking();
    applyCoreWorldViewAssets(await loadCoreWorldViewAssets(manifest, world, setup));
    selectedUnitIds = isFixedBrowserDemoMap(activeMap) ? fixedBrowserDemoInitialSelection(world) : [];
    focusInitialCameraOnPlayableStart(world);
    resetSourceViewportCameras();
    loading.visible = false;
  } catch (error) {
    loading.text = error instanceof Error ? error.message : "Unable to load selected map";
  }
}

function drainWorldEvents(loadedWorld: WorldState): void {
  selectedUnitIds = drainWorldEventsWithFeedback(loadedWorld, manifest, hudMessageState, selectedUnitIds, {
    playSound: (soundId, pan = 0) => {
      void audioEngine?.playSound(soundId, pan);
    },
    playUnitSound: (unit, event, pan = 0) => {
      void audioEngine?.playUnitSound(unit, event, pan);
    },
    soundPanForWorldPosition: (position) => {
      return sourceStereoPanForUnit(position);
    }
  });
}

function addHudMessage(text: string, lifetimeMs = 5200): void {
  addHudMessageToState(hudMessageState, world, text, lifetimeMs);
}

function publishBrowserSmokeState(force = false): void {
  if (!browserSmokeStateEnabled) {
    return;
  }
  const now = performance.now();
  const refreshMs = fixedDemoCameraScrolling() ? 1000 : BROWSER_SMOKE_REFRESH_MS;
  if (!force && lastBrowserSmokePublishMs > 0 && now - lastBrowserSmokePublishMs < refreshMs) {
    return;
  }
  lastBrowserSmokePublishMs = now;
  const smokeStartedAt = performance.now();
  const lightweightSmoke = titleScreenOpen || briefingOpen;
  const firstSelectedUnit = world
    ? selectedUnitIds
      .map((id) => world?.units.find((unit) => unit.id === id) ?? null)
      .find((unit): unit is WorldUnit => Boolean(unit)) ?? null
    : null;
  const { harvestPair, combatPair, firstSpellPair, firstTrainPair } = lightweightSmoke
    ? { harvestPair: null, combatPair: null, firstSpellPair: null, firstTrainPair: null }
    : browserSmokePairs(now);
  const audioState = audioEngine?.smokeState();
  ensurePlaytestTelemetryLoaded();
  const lastTelemetryEntry = playtestTelemetryLog[playtestTelemetryLog.length - 1] ?? null;
  window.__WARGUS_TS_SMOKE_STATE__ = {
    worldLoaded: Boolean(world),
    activeMapPath: activeMap?.path ?? null,
    mapWidth: world?.map.width ?? null,
    mapHeight: world?.map.height ?? null,
    unitCount: world?.units.length ?? 0,
    playerCount: world?.players.length ?? 0,
    visibilityPlayer: world?.visibilityPlayer ?? null,
    camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
    titleScreenOpen,
    briefingOpen,
    paused,
    gameSpeed,
    sourceGameSpeedDefault: world?.engineSettings.sourceGameSpeedDefault ?? null,
    aiStates: world?.aiStates.map((state) => ({
      player: state.player,
      enabled: state.enabled,
      strategy: state.strategy,
      sourceScriptId: state.sourceScriptId,
      sourceScriptIndex: state.sourceScriptIndex,
      sourceScriptForces: state.sourceScriptForces.length,
      attackForceSize: state.attackForceSize,
      workerTarget: state.workerTarget,
      nextAttackTick: state.nextAttackTick
    })) ?? [],
    commandPage,
    commandCard: lightweightSmoke ? [] : browserSmokeCommandCard(),
    selectedUnitCount: selectedUnitIds.length,
    selectedUnitIds: [...selectedUnitIds],
    selectedUnitTypes: selectedUnitIds
      .map((id) => world?.units.find((unit) => unit.id === id)?.typeId)
      .filter((typeId): typeId is string => Boolean(typeId)),
    ownedUnitScreenPoints: lightweightSmoke ? [] : browserSmokeOwnedUnitScreenPoints(),
    ownedUnitVisualScreenPoints: lightweightSmoke ? [] : browserSmokeOwnedUnitScreenPoints(true),
    firstOwnedMovableScreenPoint: lightweightSmoke ? null : browserSmokeFirstOwnedMovableScreenPoint(),
    firstOwnedMovableWorldPoint: lightweightSmoke ? null : browserSmokeWorldPoint(browserSmokeFirstOwnedMovableUnit()),
    firstOwnedHarvestWorkerWorldPoint: browserSmokeWorldPoint(harvestPair?.worker ?? null),
    firstHarvestTargetWorldPoint: browserSmokeWorldPoint(harvestPair?.target ?? null),
    firstOwnedAttackerWorldPoint: browserSmokeWorldPoint(combatPair?.attacker ?? null),
    firstAttackTargetWorldPoint: browserSmokeWorldPoint(combatPair?.target ?? null),
    firstAttackTargetHitPoints: combatPair?.target.hitPoints ?? null,
    firstAttackTargetId: combatPair?.target.id ?? null,
    firstSpellCasterWorldPoint: browserSmokeWorldPoint(firstSpellPair?.caster ?? null),
    firstSpellTargetWorldPoint: firstSpellPair ? { x: firstSpellPair.target.x, y: firstSpellPair.target.y } : null,
    firstSpellCommand: firstSpellPair?.command ?? null,
    firstSpellId: firstSpellPair?.spellId ?? null,
    firstSpellCasterMana: firstSpellPair?.caster.mana ?? null,
    spellEffectCount: world?.spellEffects.length ?? 0,
    firstTrainBuildingWorldPoint: browserSmokeWorldPoint(firstTrainPair?.building ?? null),
    firstTrainUnitTypeId: firstTrainPair?.unitTypeId ?? null,
    firstTrainBuildingQueueLength: firstTrainPair?.building.productionQueue.length ?? null,
    firstTrainBuildingQueueRemainingSeconds: firstTrainPair?.building.productionQueue[0]?.remainingSeconds ?? null,
    firstSelectedWorldPoint: browserSmokeWorldPoint(firstSelectedUnit),
    firstSelectedVisualWorldPoint: browserSmokeVisualWorldPoint(firstSelectedUnit),
    firstSelectedRallyPoint: firstSelectedUnit?.rallyPoint ? { ...firstSelectedUnit.rallyPoint } : null,
    firstSelectedOrderKind: firstSelectedUnit?.order?.kind ?? null,
    firstSelectedOrderTarget: browserSmokeOrderTarget(firstSelectedUnit?.order),
    firstSelectedOrderResource: browserSmokeOrderResource(firstSelectedUnit?.order),
    firstSelectedSpeed: firstSelectedUnit?.speed ?? null,
    firstSelectedBaseSpeed: firstSelectedUnit?.baseSpeed ?? null,
    firstSelectedAutoRepair: firstSelectedUnit?.autoRepair ?? null,
    firstSelectedAutoCastSpells: firstSelectedUnit ? [...(firstSelectedUnit.autoCastSpells ?? [])] : null,
    fixedDemoMission: fixedDemoMissionSummary(world, briefingOpen),
    fixedDemoMovementPaceMultiplier: isFixedBrowserDemoMap(activeMap) ? FIXED_DEMO_MOVEMENT_PACE_MULTIPLIER : 1,
    performance: { ...renderPerformance },
    displayObjects: {
      mapLayerChildren: mapLayer.children.length,
      unitLayerChildren: unitLayer.children.length,
      hudLayerChildren: hudLayer.children.length,
      overlayLayerChildren: overlayLayer.children.length
    },
    playtestTelemetry: {
      entryCount: playtestTelemetryLog.length,
      lastKind: lastTelemetryEntry?.kind ?? null,
      lastJankReasons: lastTelemetryEntry?.jankReasons ?? [],
      exportHookInstalled: typeof window.__WARGUS_TS_EXPORT_PLAYTEST_LOG__ === "function"
    },
    firstSelectedMana: firstSelectedUnit?.mana ?? null,
    firstSelectedProductionQueueLength: firstSelectedUnit?.productionQueue.length ?? null,
    firstSelectedProductionQueueRemainingSeconds: firstSelectedUnit?.productionQueue[0]?.remainingSeconds ?? null,
    firstSelectedActiveResearchCount: firstSelectedUnit ? world?.activeResearch.filter((research) => research.buildingId === firstSelectedUnit.id).length ?? null : null,
    firstSelectedResourcesHeld: firstSelectedUnit?.resourcesHeld ?? null,
    firstSelectedCarriedResource: firstSelectedUnit?.carriedResource ?? null,
    firstSelectedCargoCount: firstSelectedUnit?.cargo.length ?? null,
    firstSelectedCargoCapacity: firstSelectedUnit?.cargoCapacity ?? null,
    visibilityPlayerResources: world?.players.find((player) => player.id === world?.visibilityPlayer)?.resources ?? null,
    audioContextCreated: audioState?.contextCreated ?? false,
    audioContextState: audioState?.contextState ?? null,
    audioBufferedSounds: audioState?.bufferedSounds ?? 0,
    audioCurrentMusic: audioState?.currentMusic ?? null,
    audioStereoSound: audioState?.stereoSound ?? null,
    audioUnlocked: audioState?.unlocked ?? false,
    audioPlayAttempts: audioState?.playAttempts ?? 0,
    audioPlayStarts: audioState?.playStarts ?? 0,
    audioPlayFailures: audioState?.playFailures ?? 0,
    audioDecodeFailures: audioState?.decodeFailures ?? 0,
    audioLastSoundId: audioState?.lastSoundId ?? null,
    audioLastSoundFile: audioState?.lastSoundFile ?? null,
    audioLastError: audioState?.lastError ?? null,
    audioHtmlPlayStarts: audioState?.htmlPlayStarts ?? 0,
    audioHtmlPlayFailures: audioState?.htmlPlayFailures ?? 0,
    pendingWorldCommandKind: browserSmokePendingCommandKind(pendingWorldCommand),
    tick: world?.tick ?? null,
    matchStatus: world?.matchState.status ?? null
  };
  recordSmokeTiming(performance.now() - smokeStartedAt);
}

function browserSmokePairs(now: number): Omit<BrowserSmokePairCache, "world" | "atMs"> {
  if (browserSmokePairCache && browserSmokePairCache.world === world && now - browserSmokePairCache.atMs < BROWSER_SMOKE_PAIR_REFRESH_MS) {
    return browserSmokePairCache;
  }
  browserSmokePairCache = {
    world,
    atMs: now,
    harvestPair: browserSmokeHarvestPair(),
    combatPair: browserSmokeCombatPair(),
    firstSpellPair: browserSmokeSpellPair(),
    firstTrainPair: browserSmokeTrainPair()
  };
  return browserSmokePairCache;
}

function browserSmokeCommandResult(result: ReturnType<typeof executeHudCommandForSelection> | SelectionHotkeyResult | null = null): BrowserSmokeCommandResult {
  return {
    commandPage,
    pendingWorldCommandKind: browserSmokePendingCommandKind(pendingWorldCommand),
    selectedUnitIds: [...selectedUnitIds],
    commandCard: browserSmokeCommandCard(),
    handled: result?.handled ?? null,
    feedback: result?.feedback ?? null
  };
}

function browserSmokeCommandCard(): BrowserSmokeCommand[] {
  if (!world || !manifest) {
    return [];
  }
  const selectedUnits = selectedUnitIds
    .map((id) => world?.units.find((unit) => unit.id === id) ?? null)
    .filter((unit): unit is WorldUnit => Boolean(unit));
  return availableCommands(manifest, world, selectedUnits, commandPage).map((command) => browserSmokeCommand(command));
}

function browserSmokeCommand(command: HudCommand): BrowserSmokeCommand {
  return {
    id: command.id,
    key: command.key,
    label: command.label,
    disabled: command.disabled === true,
    icon: command.icon ?? null,
    sourceAction: command.sourceButton?.action ?? null,
    sourceValue: command.sourceButton?.value ?? null,
    sourceLevel: command.sourceButton?.level ?? null,
    sourcePos: command.sourceButton?.pos ?? null
  };
}

function browserSmokeExpectedSourceCommands(page = commandPage): BrowserSmokeSourceCommand[] {
  if (!world || !manifest) {
    return [];
  }
  const selectedUnits = selectedUnitIds
    .map((id) => world?.units.find((unit) => unit.id === id) ?? null)
    .filter((unit): unit is WorldUnit => Boolean(unit));
  const readyUnits = selectedUnits.filter((unit) => unit.hitPoints > 0 && !unit.construction);
  const selectedPlayer = selectedUnits[0]?.player ?? world.visibilityPlayer;
  const commands: BrowserSmokeSourceCommand[] = [];
  const seen = new Set<string>();
  const add = (id: string | null, button: { action: string; value?: string | null; level?: number | null; pos?: number | null; key?: string | null; icon?: string | null } | null | undefined): void => {
    if (!id || !button || seen.has(id)) {
      return;
    }
    seen.add(id);
    commands.push({
      id,
      key: button.key?.toUpperCase() ?? "",
      icon: button.icon ?? null,
      sourceAction: button.action,
      sourceValue: button.value ?? null,
      sourceLevel: button.level ?? null,
      sourcePos: button.pos ?? null
    });
  };

  if (sourceGroupButtonScopeForSelection(world, readyUnits, selectedPlayer)) {
    for (const button of sourceActionButtonsForHud(world, readyUnits, selectedPlayer)) {
      add(sourceHudCommandForAction(button.action), button);
    }
    return commands;
  }

  if (page === 1 || page === 2) {
    for (const button of sourceBuildButtonsForHud(world, selectedUnits, page, selectedPlayer)) {
      add(`source-build:${button.value}`, button);
    }
    add("build-page-cancel", sourceBuildPageButtonForHud(world, selectedUnits, selectedPlayer, "0"));
    return commands;
  }

  for (const button of sourceActionButtonsForHud(world, readyUnits, selectedPlayer)) {
    add(sourceHudCommandForAction(button.action), button);
  }
  for (const button of sourceRootBuildButtonsForHud(world, selectedUnits, selectedPlayer)) {
    add(`source-build:${button.value}`, button);
  }
  for (const button of sourceTrainButtonsForHud(world, selectedUnits, readyUnits, selectedPlayer)) {
    add(`source-train:${button.value}`, button);
  }
  for (const button of sourceUpgradeButtonsForHud(world, selectedUnits, readyUnits, selectedPlayer)) {
    add(`source-upgrade:${button.value}`, button);
  }
  for (const button of sourceResearchButtonsForHud(world, selectedUnits, readyUnits, selectedPlayer)) {
    add(`source-research:${button.value}`, button);
  }
  for (const button of sourceSpellButtonsForHud(world, readyUnits, selectedPlayer)) {
    if (sourceSpellCommandForSpellId(world, button.value) || sourceInstantSpellCommandForSpellId(world, button.value)) {
      add(`source-spell:${button.value}`, button);
    }
  }
  add("build-basic-page", sourceBuildPageButtonForHud(world, selectedUnits, selectedPlayer, "1"));
  add("build-advanced-page", sourceBuildPageButtonForHud(world, selectedUnits, selectedPlayer, "2"));
  return commands;
}

function browserSmokeWorldPoint(unit: WorldUnit | null): BrowserSmokeOrderTarget | null {
  return unit ? { x: unit.x, y: unit.y } : null;
}

function browserSmokeVisualWorldPoint(unit: WorldUnit | null): BrowserSmokeOrderTarget | null {
  return world && unit ? visualWorldPointForUnit(world, unit) : null;
}

function browserSmokeHarvestPair(): { worker: WorldUnit; target: WorldUnit } | null {
  if (!world) {
    return null;
  }
  const workers = world.units
    .filter((unit) => unit.player === world?.visibilityPlayer && unit.hitPoints > 0 && unit.speed > 0 && !unit.construction && unit.gatherResources.length > 0)
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const worker of workers) {
    const target = world.units
      .filter((unit) => unit.hitPoints > 0 && unit.resourcesHeld > 0 && unit.givesResource && worker.gatherResources.includes(unit.givesResource))
      .sort((left, right) => Math.hypot(left.x - worker.x, left.y - worker.y) - Math.hypot(right.x - worker.x, right.y - worker.y))[0];
    if (target) {
      return { worker, target };
    }
  }
  return null;
}

function browserSmokeWoodHarvestPair(): { worker: WorldUnit; tileX: number; tileY: number } | null {
  if (!world) {
    return null;
  }
  const workers = world.units
    .filter((unit) => unit.player === world?.visibilityPlayer && unit.hitPoints > 0 && unit.speed > 0 && !unit.construction && unit.gatherResources.includes("wood"))
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const worker of workers) {
    const centerX = Math.floor(worker.x / world.tileSize);
    const centerY = Math.floor(worker.y / world.tileSize);
    const woodTile = browserSmokeNearestWoodTile(centerX, centerY);
    if (woodTile) {
      return { worker, tileX: woodTile.x, tileY: woodTile.y };
    }
  }
  return null;
}

function browserSmokeNearestWoodTile(centerX: number, centerY: number): { x: number; y: number } | null {
  if (!world) {
    return null;
  }
  for (let radius = 1; radius <= 18; radius += 1) {
    for (let y = centerY - radius; y <= centerY + radius; y += 1) {
      for (let x = centerX - radius; x <= centerX + radius; x += 1) {
        const onRing = x === centerX - radius || x === centerX + radius || y === centerY - radius || y === centerY + radius;
        if (!onRing || x < 0 || y < 0 || x >= world.map.width || y >= world.map.height) {
          continue;
        }
        if (isSourceHarvestableWoodTile(world, world.tiles[y * world.map.width + x] ?? 0)) {
          return { x, y };
        }
      }
    }
  }
  return null;
}

function browserSmokeCombatPair(): { attacker: WorldUnit; target: WorldUnit } | null {
  if (!world) {
    return null;
  }
  const attackers = world.units
    .filter((unit) => unit.player === world?.visibilityPlayer && unit.hitPoints > 0 && unit.canAttack && !unit.construction)
    .sort((left, right) => left.id.localeCompare(right.id));
  let best: { attacker: WorldUnit; target: WorldUnit; score: number } | null = null;
  for (const attacker of attackers) {
    for (const target of world.units) {
      if (!isUnitVisibleToPlayer(world, target, attacker.player) || !canAttackTarget(attacker, target, world)) {
        continue;
      }
      const distance = Math.hypot(target.x - attacker.x, target.y - attacker.y);
      const score = distance - Math.max(0, attacker.attackRange);
      if (!best || score < best.score) {
        best = { attacker, target, score };
      }
    }
  }
  return best ? { attacker: best.attacker, target: best.target } : null;
}

function browserSmokeFixedDemoObjectiveTarget(): WorldUnit | null {
  if (!world || !isFixedBrowserDemoMap(activeMap)) {
    return null;
  }
  return world.units.find((unit) => (
    unit.player !== world?.visibilityPlayer
    && (unit.typeId === "unit-great-hall" || unit.typeId === "unit-stronghold" || unit.typeId === "unit-fortress" || unit.typeId === "unit-town-hall" || unit.typeId === "unit-keep" || unit.typeId === "unit-castle")
    && unit.hitPoints > 0
  )) ?? null;
}

function browserSmokeFixedDemoRaidTargets(): WorldUnit[] {
  if (!world || !isFixedBrowserDemoMap(activeMap)) {
    return [];
  }
  return world.units
    .filter((unit) => (
      unit.player === FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID
      && unit.hitPoints > 0
      && (unit.typeId === "unit-grunt" || unit.typeId === "unit-axethrower")
      && unit.x >= 92 * 32
    ))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function browserSmokeFixedDemoDefenders(targets: WorldUnit[]): WorldUnit[] {
  if (!world) {
    return [];
  }
  return world.units
    .filter((unit) => (
      unit.player === world?.visibilityPlayer
      && unit.hitPoints > 0
      && unit.canAttack
      && !unit.construction
      && targets.some((target) => canAttackTarget(unit, target, world!))
    ))
    .sort((left, right) => sourceFixedDemoAttackerScore(right) - sourceFixedDemoAttackerScore(left) || left.id.localeCompare(right.id));
}

function browserSmokeFixedDemoAttackers(target: WorldUnit): WorldUnit[] {
  if (!world || !isFixedBrowserDemoMap(activeMap)) {
    return [];
  }
  return world.units
    .filter((unit) => (
      unit.player === world?.visibilityPlayer
      && unit.hitPoints > 0
      && unit.canAttack
      && !unit.construction
      && canAttackTarget(unit, target, world)
    ))
    .sort((left, right) => sourceFixedDemoAttackerScore(right) - sourceFixedDemoAttackerScore(left) || left.id.localeCompare(right.id));
}

function sourceFixedDemoAttackerScore(unit: WorldUnit): number {
  return unit.basicDamage + unit.piercingDamage + unit.attackRange * 2 + unit.hitPoints / 100;
}

function browserSmokeSpellPair(): { caster: WorldUnit; command: NonNullable<ReturnType<typeof sourceSpellCommandForSpellId>>; spellId: string; target: BrowserSmokeOrderTarget } | null {
  if (!world) {
    return null;
  }
  const casters = world.units
    .filter((unit) => unit.player === world?.visibilityPlayer && unit.hitPoints > 0 && !unit.construction && unit.canCastSpells.length > 0)
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const caster of casters) {
    for (const spellId of caster.canCastSpells) {
      const command = sourceSpellCommandForSpellId(world, spellId);
      if (!command) {
        continue;
      }
      for (const target of browserSmokeSpellTargets(caster)) {
        if (canIssueTargetedSpellAt(world, caster, command, target.x, target.y)) {
          return { caster, command, spellId, target };
        }
      }
    }
  }
  return null;
}

function browserSmokeSpellTargets(caster: WorldUnit): BrowserSmokeOrderTarget[] {
  if (!world) {
    return [];
  }
  const visibleUnits = world.units
    .filter((unit) => unit.hitPoints > 0 && isUnitVisibleToPlayer(world!, unit, caster.player))
    .sort((left, right) => Math.hypot(left.x - caster.x, left.y - caster.y) - Math.hypot(right.x - caster.x, right.y - caster.y));
  return [
    ...visibleUnits.map((unit) => ({ x: unit.x, y: unit.y })),
    { x: caster.x, y: caster.y },
    { x: Math.min(world.map.width * 32 - 16, caster.x + 96), y: caster.y },
    { x: caster.x, y: Math.min(world.map.height * 32 - 16, caster.y + 96) }
  ];
}

function browserSmokeTrainPair(): { building: WorldUnit; unitTypeId: string } | null {
  if (!world) {
    return null;
  }
  const buildings = world.units
    .filter((unit) => unit.player === world?.visibilityPlayer && unit.hitPoints > 0 && !unit.construction)
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const building of buildings) {
    const unitTypeId = world.unitDefinitions
      .filter((definition) => canTrainUnitAt(world!, building.id, definition.id, world!.unitDefinitions))
      .sort((left, right) => sourceTrainCostScore(left) - sourceTrainCostScore(right) || left.id.localeCompare(right.id))[0]?.id ?? null;
    if (unitTypeId) {
      return { building, unitTypeId };
    }
  }
  return null;
}

function sourceTrainCostScore(definition: { costs: unknown }): number {
  if (Array.isArray(definition.costs)) {
    return definition.costs.reduce((sum, value) => sum + (typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0), 0);
  }
  if (definition.costs && typeof definition.costs === "object") {
    return Object.values(definition.costs).reduce((sum, value) => sum + (typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0), 0);
  }
  return 0;
}

function browserSmokeFirstOwnedMovableScreenPoint(): BrowserSmokeOrderTarget | null {
  const point = browserSmokeOwnedUnitScreenPoints().find((unit) => browserSmokeOwnedMovableUnits().some((candidate) => candidate.id === unit.id));
  return point ? { x: point.screenX, y: point.screenY } : null;
}

function browserSmokeOwnedUnitScreenPoints(visual = false): Array<{ id: string; typeId: string; x: number; y: number; screenX: number; screenY: number }> {
  if (!world) {
    return [];
  }
  const rect = sourceMapAreaRect(world, app.screen.width, app.screen.height);
  return world.units
    .filter((unit) => unit.player === world?.visibilityPlayer && unit.hitPoints > 0 && !unit.construction)
    .map((unit) => {
      const point = visual ? visualWorldPointForUnit(world, unit) ?? unit : unit;
      return {
        id: unit.id,
        typeId: unit.typeId,
        x: point.x,
        y: point.y,
        screenX: rect.x + (point.x - camera.x) * camera.zoom,
        screenY: rect.y + (point.y - camera.y) * camera.zoom
      };
    })
    .filter((point) => point.screenX >= rect.x && point.screenX <= rect.x + rect.width && point.screenY >= rect.y && point.screenY <= rect.y + rect.height)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function browserSmokeFirstOwnedMovableUnit(): WorldUnit | null {
  return browserSmokeOwnedMovableUnits()[0] ?? null;
}

function browserSmokeOwnedMovableUnits(): WorldUnit[] {
  if (!world) {
    return [];
  }
  return world.units.filter((unit) => (
    unit.player === world?.visibilityPlayer
    && unit.hitPoints > 0
    && unit.speed > 0
    && !unit.construction
  ));
}

function browserSmokeOrderTarget(order: WorldUnit["order"] | null | undefined): BrowserSmokeOrderTarget | null {
  if (!order) {
    return null;
  }
  const record = order as Record<string, unknown>;
  if (typeof record.targetX === "number" && typeof record.targetY === "number") {
    return { x: record.targetX, y: record.targetY };
  }
  if (typeof record.patrolX === "number" && typeof record.patrolY === "number") {
    return { x: record.patrolX, y: record.patrolY };
  }
  return null;
}

function browserSmokeOrderResource(order: WorldUnit["order"] | null | undefined): string | null {
  if (!order) {
    return null;
  }
  const record = order as Record<string, unknown>;
  return typeof record.resource === "string" ? record.resource : null;
}

function browserSmokePendingCommandKind(command: PendingWorldCommand | null): string | null {
  if (!command) {
    return null;
  }
  return typeof command === "string" ? command : command.kind;
}

function handleSourceCheatKey(event: KeyboardEvent): boolean {
  if (!world || briefingOpen || titleScreenOpen || mapPickerState.open || world.matchState.status !== "playing") {
    return false;
  }
  const result = applySourceCheatKey(world, sourceCheatInputState, event);
  if (!result.handled) {
    return false;
  }
  event.preventDefault();
  if (result.musicFile) {
    void audioEngine?.playMusicFile(result.musicFile);
  }
  if (result.message) {
    addHudMessage(result.message, result.messageLifetimeMs);
  }
  return true;
}

function findGameSoundId(event: string, race: string | null | undefined): string {
  return findSourceGameSoundId(manifest, event, race);
}

function playGameSound(event: string, race: string | null | undefined = localPlayerRace()): void {
  void audioEngine?.playSound(findGameSoundId(event, race));
}

function localPlayerRace(): string | null | undefined {
  return localPlayerRaceForWorld(world);
}

async function ensureMusicStarted(): Promise<void> {
  await ensureSourceMusicStarted(audioEngine, manifest, world, { titleScreenOpen, briefingOpen });
}

function unlockAudioForInput(): void {
  void audioEngine?.unlock();
  void ensureMusicStarted();
}

function centerCameraOnTile(loadedWorld: WorldState, tileX: number, tileY: number): void {
  centerCameraOnTileBase(camera, loadedWorld, tileX, tileY, playableCameraViewport());
  persistActiveSourceViewportCamera();
}

function centerCameraOnWorldPoint(loadedWorld: WorldState, x: number, y: number): void {
  centerCameraOnWorldPointBase(camera, loadedWorld, x, y, playableCameraViewport());
  persistActiveSourceViewportCamera();
}

function focusInitialCameraOnPlayableStart(loadedWorld: WorldState): void {
  const player = loadedWorld.players.find((candidate) => candidate.id === loadedWorld.visibilityPlayer);
  if (!player) {
    clampCameraToWorld(camera, loadedWorld, playableCameraViewport());
    persistActiveSourceViewportCamera();
    return;
  }
  centerCameraOnWorldPoint(loadedWorld, player.startX, player.startY);
}

function handleMinimapPoint(loadedWorld: WorldState, tileX: number, tileY: number, input: { button: number; shiftKey: boolean }): void {
  const result = handleMinimapCommand(loadedWorld, tileX, tileY, input, selectedUnitIds, pendingWorldCommand);
  pendingWorldCommand = result.pendingWorldCommand;
  if (result.kind === "center-camera") {
    centerCameraOnTile(loadedWorld, tileX, tileY);
    return;
  }
  if (result.kind === "click") {
    playGameSound("click");
    return;
  }
  if (result.kind === "command-feedback") {
    resumeFixedDemoAfterIssuedCommand(result.issued);
    playWorldCommandFeedback(result.feedbackUnit, result.issued);
  }
}

function zoomCameraAtScreenPoint(screenX: number, screenY: number, deltaZoom: number): void {
  const point = sourceMapAreaLocalScreenPoint(screenX, screenY);
  zoomCameraAtScreenPointBase(camera, point.x, point.y, deltaZoom);
  persistActiveSourceViewportCamera();
}

function playableCameraViewport(): CameraViewport {
  return playableCameraViewportBase(app.screen, world);
}

function syncResponsiveViewport(): void {
  clampCameraToWorld(camera, world, playableCameraViewport());
  if (!pointerScreenPosition) {
    return;
  }
  pointerWorldPosition = worldPointForScreenPosition(pointerScreenPosition.x, pointerScreenPosition.y);
  const viewportPoint = viewportPointForScreenPosition(pointerScreenPosition.x, pointerScreenPosition.y);
  if (viewportPoint) {
    activateSourceViewport(viewportPoint.index);
  }
  const point = sourceMapAreaLocalScreenPoint(pointerScreenPosition.x, pointerScreenPosition.y);
  updateCameraEdgeScroll(cameraInput, point.x, point.y, playableCameraViewport(), sourceScrollMargins(world), sourceMouseScrollingEnabled(world));
}

function worldPointForScreenPosition(screenX: number, screenY: number): { x: number; y: number } | null {
  return viewportPointForScreenPosition(screenX, screenY)?.worldPoint ?? null;
}

function viewportPointForScreenPosition(screenX: number, screenY: number): { index: number; worldPoint: { x: number; y: number } } | null {
  if (!world) {
    return null;
  }
  const probe = sourceViewportScreenPoint(world, camera, app.screen.width, app.screen.height, screenX, screenY);
  if (!probe) {
    return null;
  }
  const viewCamera = sourceViewportCameras[probe.index] ?? camera;
  return sourceViewportScreenPoint(world, viewCamera, app.screen.width, app.screen.height, screenX, screenY);
}

function activateSourceViewport(index: number): void {
  if (!world || index === activeSourceViewportIndex) {
    return;
  }
  persistActiveSourceViewportCamera();
  activeSourceViewportIndex = Math.max(0, index);
  restoreActiveSourceViewportCamera();
}

function resetSourceViewportCameras(): void {
  activeSourceViewportIndex = 0;
  sourceViewportCameras.length = 0;
  persistActiveSourceViewportCamera();
}

function persistActiveSourceViewportCamera(): void {
  if (!world) {
    return;
  }
  sourceViewportCameras[activeSourceViewportIndex] = { x: camera.x, y: camera.y, zoom: camera.zoom };
}

function restoreActiveSourceViewportCamera(): void {
  if (!world) {
    return;
  }
  const saved = sourceViewportCameras[activeSourceViewportIndex] ?? sourceViewportCameras[0] ?? { x: camera.x, y: camera.y, zoom: camera.zoom };
  camera.x = saved.x;
  camera.y = saved.y;
  camera.zoom = saved.zoom;
  clampCameraToWorld(camera, world, playableCameraViewport());
  persistActiveSourceViewportCamera();
  pointerWorldPosition = pointerScreenPosition ? worldPointForScreenPosition(pointerScreenPosition.x, pointerScreenPosition.y) : null;
}

function restoreLoadedSourceViewportCameras(loaded: LoadedSavedGame): void {
  activeSourceViewportIndex = Math.max(0, loaded.activeSourceViewportIndex);
  sourceViewportCameras.length = 0;
  sourceViewportCameras.push(...loaded.sourceViewportCameras);
  restoreActiveSourceViewportCamera();
}

function sourceStereoPanForUnit(unit: Pick<WorldUnit, "x">): number {
  return sourceStereoPanForUnitBase(unit, camera, playableCameraViewport());
}

function playPlacementErrorSound(position: Pick<WorldUnit, "x"> | null = pointerWorldPosition): void {
  const pan = position ? sourceStereoPanForUnitBase(position, camera, playableCameraViewport()) : 0;
  void audioEngine?.playSound(findGameSoundId("placement-error", localPlayerRace()), pan);
}

function updateEdgeScroll(clientX: number, clientY: number, buttons = 0, controlPressed = false): void {
  if (!sourceScreenPointIsInPlayableViewport(clientX, clientY)) {
    resetCameraEdgeScroll(cameraInput);
    return;
  }
  const point = sourceMapAreaLocalScreenPoint(clientX, clientY);
  updateCameraEdgeScroll(cameraInput, point.x, point.y, playableCameraViewport(), sourceScrollMargins(world), sourceMouseScrollingEnabled(world), sourceMouseEdgeScrollScale(world, buttons, controlPressed));
}

function sourceScreenPointIsInPlayableViewport(screenX: number, screenY: number): boolean {
  return world
    ? sourceScreenPointIsInViewport(world, app.screen.width, app.screen.height, screenX, screenY)
    : true;
}

function sourceMapAreaLocalScreenPoint(screenX: number, screenY: number): { x: number; y: number } {
  if (!world) {
    return { x: screenX, y: screenY };
  }
  const point = sourceViewportScreenPoint(world, camera, app.screen.width, app.screen.height, screenX, screenY);
  const mapArea = point?.rect ?? sourceMapAreaRect(world, app.screen.width, app.screen.height);
  return {
    x: screenX - mapArea.x,
    y: screenY - mapArea.y
  };
}

function applySourceLeaveStopScrolling(): void {
  if (!sourceLeaveStopScrollingEnabled(world)) {
    return;
  }
  resetCameraEdgeScroll(cameraInput);
}

function resetUnitAtlasTracking(): void {
  resetUnitAtlasLazyLoadState(unitAtlasLazyLoadState);
}

function applyCoreWorldViewAssets(assets: {
  tileAtlas: TileTextureAtlas | null;
  fogAtlas: FogTextureAtlas | null;
  iconAtlas: IconTextureAtlas | null;
  unitAtlases: Map<string, UnitTextureAtlas>;
  missileAtlases: Map<string, MissileTextureAtlas>;
  wargusBitmapFontAtlas: WargusBitmapFontAtlas | null;
}): void {
  tileAtlas = assets.tileAtlas;
  fogAtlas = assets.fogAtlas;
  iconAtlas = assets.iconAtlas;
  unitAtlases = assets.unitAtlases;
  missileAtlases = assets.missileAtlases;
  wargusBitmapFontAtlas = assets.wargusBitmapFontAtlas;
}

function applyCompleteWorldViewAssets(assets: Parameters<typeof applyCoreWorldViewAssets>[0] & {
  statusDecorationAtlas: StatusDecorationAtlas | null;
  sourcePanelAtlas: SourcePanelAtlas | null;
  sourceButtonStyleAtlas: SourceButtonStyleAtlas | null;
  resourceUiAtlas: ResourceUiAtlas | null;
}): void {
  applyCoreWorldViewAssets(assets);
  statusDecorationAtlas = assets.statusDecorationAtlas;
  sourcePanelAtlas = assets.sourcePanelAtlas;
  sourceButtonStyleAtlas = assets.sourceButtonStyleAtlas;
  resourceUiAtlas = assets.resourceUiAtlas;
}

function handleControlGroupKey(event: KeyboardEvent): boolean {
  if (!world) {
    return false;
  }
  const loadedWorld = world;
  const result = applyControlGroupKey(controlGroupRecallState, loadedWorld, controlGroups, selectedUnitIds, event, camera, playableCameraViewport(), performance.now());
  if (!result.handled) {
    return false;
  }
  selectedUnitIds = result.selectedUnitIds;
  if (result.recalledUnit) {
    void audioEngine?.playUnitSound(result.recalledUnit, "selected", sourceStereoPanForUnit(result.recalledUnit));
  }
  return true;
}

function executeHudCommand(command: HudCommandId, input: { ctrlKey?: boolean; shiftKey?: boolean } = {}): ReturnType<typeof executeHudCommandForSelection> | null {
  if (!world || !manifest || selectedUnitIds.length === 0) {
    return null;
  }
  const result = executeHudCommandForSelection(world, manifest, command, selectedUnitIds, commandPage, pendingWorldCommand, input);
  commandPage = result.commandPage;
  pendingWorldCommand = result.pendingWorldCommand;
  if (result.feedback === "click") {
    playGameSound("click");
  } else if (result.feedback === "acknowledge" && result.feedbackUnit) {
    resumeFixedDemoAfterIssuedCommand(true);
    showSourceOrdersForCommand();
    void audioEngine?.playUnitSound(result.feedbackUnit, "acknowledge", sourceStereoPanForUnit(result.feedbackUnit));
  } else if (result.feedback === "error") {
    playPlacementErrorSound(result.feedbackUnit ?? null);
  }
  return result;
}

function playSelectionHotkeyFeedback(result: SelectionHotkeyResult): void {
  if (result.feedback === "click") {
    playGameSound("click");
  } else if (result.feedback === "acknowledge" && result.feedbackUnit) {
    resumeFixedDemoAfterIssuedCommand(true);
    showSourceOrdersForCommand();
    void audioEngine?.playUnitSound(result.feedbackUnit, "acknowledge", sourceStereoPanForUnit(result.feedbackUnit));
  } else if (result.feedback === "error") {
    playPlacementErrorSound(result.feedbackUnit ?? null);
  }
}

function resumeFixedDemoAfterIssuedCommand(issued: boolean): void {
  if (issued && paused && isFixedBrowserDemoMap(activeMap) && !titleScreenOpen && !briefingOpen) {
    paused = false;
  }
}

async function executeMapCommand(command: HudMapCommandId): Promise<void> {
  if (!manifest || !activeMap) {
    return;
  }
  const mapCommandState = {
    get paused() {
      return paused;
    },
    set paused(nextPaused: boolean) {
      paused = nextPaused;
    },
    get gameSpeed() {
      return gameSpeed;
    },
    set gameSpeed(nextGameSpeedValue: number) {
      gameSpeed = nextGameSpeedValue;
    },
    mapPicker: mapPickerState,
    get menuOverlay() {
      return menuOverlay;
    },
    set menuOverlay(nextMenuOverlay: HudMenuOverlayId | null) {
      menuOverlay = nextMenuOverlay;
    },
    get diplomacyDraft() {
      return diplomacyDraft;
    },
    set diplomacyDraft(nextDiplomacyDraft: SourceDiplomacyDraft | null) {
      diplomacyDraft = nextDiplomacyDraft;
    },
    get preferencesDraft() {
      return preferencesDraft;
    },
    set preferencesDraft(nextPreferencesDraft: WargusEngineSettings | null) {
      preferencesDraft = nextPreferencesDraft;
    }
  };
  await executeMapCommandForRuntime(command, {
    manifest,
    activeMap,
    world,
    saveCommandState,
    saveCommandContext,
    state: mapCommandState,
    addHudMessage,
    saveCurrentAutosave,
    syncAudioSettings: syncAudioSettingsFromWorld,
    loadPlayableMap
  });
}

function syncAudioSettingsFromWorld(): void {
  syncRuntimePresentationSettingsFromWorld();
  if (!world || !audioEngine) {
    return;
  }
  audioEngine.setEffectsEnabled(world.engineSettings.effectsEnabledDefault);
  audioEngine.setEffectsVolume(world.engineSettings.effectsVolumeDefault);
  audioEngine.setMusicEnabled(world.engineSettings.musicEnabledDefault);
  audioEngine.setMusicVolume(world.engineSettings.musicVolumeDefault);
  audioEngine.setStereoSound(world.engineSettings.stereoSoundDefault);
  if (world.engineSettings.musicEnabledDefault) {
    void ensureMusicStarted();
  }
}

function syncRuntimePresentationSettingsFromWorld(): void {
  applySourceVideoShader(world?.engineSettings.videoShaderDefault ?? manifest?.engineSettings?.videoShaderDefault ?? "none");
}

function applySourceVideoShader(shader: string): void {
  const normalized = sourceVideoShaderName(shader);
  app.canvas.dataset.wargusVideoShader = normalized;
  app.canvas.style.imageRendering = normalized === "linear" ? "auto" : "pixelated";
  app.canvas.style.filter = normalized === "crt" ? "contrast(1.08) saturate(1.12) brightness(0.95)" : "";
}

function sourceVideoShaderName(shader: string): "none" | "linear" | "crt" {
  const normalized = shader.trim().toLowerCase();
  if (normalized.includes("linear")) {
    return "linear";
  }
  if (normalized.includes("crt")) {
    return "crt";
  }
  return "none";
}

window.addEventListener("beforeunload", () => {
  saveCurrentAutosave();
});

window.addEventListener("pagehide", () => {
  saveCurrentAutosave();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    resetTransientInput();
    applyPauseOnLeave();
    saveCurrentAutosave();
  }
});

function applyPauseOnLeave(): void {
  if (sourcePauseOnLeaveEnabled(world)) {
    paused = true;
  }
}

function saveCurrentAutosave(): void {
  saveAutosaveForContext(saveCommandContext());
}

function sourceAutosaveIntervalSeconds(loadedWorld: WorldState): number {
  return Math.max(0, Math.floor(loadedWorld.engineSettings.autosaveMinutesDefault)) * 60;
}

function resetTransientInput(): void {
  resetCameraInput(cameraInput);
  selectionDrag = null;
  pointerScreenPosition = null;
  sourceShowOrdersShiftHeld = false;
  sourceMapNamePopupState.showNameDelayTick = 0;
  sourceMapNamePopupState.showNameTimeTick = 0;
}

function showSourceOrdersForCommand(): void {
  if (!world) {
    return;
  }
  sourceShowOrdersUntilTick = world.tick + sourceShowOrdersDurationTicks(world);
}

function sourceShowOrdersDurationTicks(loadedWorld: WorldState): number {
  return sourceDefaultGameSpeed(loadedWorld);
}

function showLoadingStatus(message: string, durationMs: number): void {
  loading.visible = true;
  loading.text = message;
  window.setTimeout(() => {
    loading.visible = false;
  }, durationMs);
}

function saveCommandContext(): SaveCommandContext {
  persistActiveSourceViewportCamera();
  return {
    world,
    manifest,
    camera,
    sourceViewportState: {
      activeSourceViewportIndex,
      sourceViewportCameras: [...sourceViewportCameras]
    },
    controlGroups,
    showStatus: showLoadingStatus,
    applyLoadedGame
  };
}

async function applyLoadedGame(loaded: LoadedSavedGame): Promise<void> {
  world = loaded.world;
  gameSpeed = sourceGameSpeedMultiplier(world);
  resetWorldTransientState();
  briefingOpen = false;
  resetBriefingAudioCue(audioCueState);
  audioEngine?.stopBriefingSounds();
  resetMatchMusicCue(audioCueState);
  activeMap = loaded.map;
  audioEngine?.setTileset(activeMap.setup?.tileset);
  syncAudioSettingsFromWorld();
  resetUnitAtlasTracking();
  if (manifest) {
    applyCompleteWorldViewAssets(await loadCompleteWorldViewAssets(manifest, world, activeMap.setup ? { tileset: activeMap.setup.tileset } : null));
  }
  selectedUnitIds = [];
  replaceControlGroups(world, controlGroups, loaded.controlGroups);
  camera.x = loaded.camera.x;
  camera.y = loaded.camera.y;
  camera.zoom = loaded.camera.zoom;
  clampCameraToWorld(camera, world, playableCameraViewport());
  restoreLoadedSourceViewportCameras(loaded);
}

function resetWorldTransientState(): void {
  selectedUnitIds = [];
  pendingWorldCommand = null;
  menuOverlay = null;
  diplomacyDraft = null;
  preferencesDraft = null;
  trackedViewportUnitId = null;
  selectionDrag = null;
  lastSelectionPointerDown = null;
  pointerWorldPosition = null;
  fixedDemoHudRefreshClock = 0;
  fixedDemoHudRenderKey = "";
  resetFixedDemoMissionRuntimeState(fixedDemoMissionState);
  renderPerformance.averageFrameMs = null;
  renderPerformance.averageUpdateMs = null;
  renderPerformance.averageRenderMs = null;
  renderPerformance.averageSmokeMs = null;
  renderPerformance.lastFrameMs = null;
  renderPerformance.lastUpdateMs = null;
  renderPerformance.lastRenderMs = null;
  renderPerformance.lastSmokeMs = null;
  renderPerformance.hudRenderedLastFrame = false;
  lastBrowserSmokePublishMs = 0;
  browserSmokePairCache = null;
  clearSelectionClickState(selectionClickState);
  clearControlGroupRecallState(controlGroupRecallState);
  resetSourceCheatInputState(sourceCheatInputState);
  clearHudMessageState(hudMessageState);
  resetTransientInput();
}

function sourceSetupPaused(setup: WargusMapSetup | null): boolean {
  return setup?.state?.gamePaused === true;
}

function startBriefingAudio(loadedWorld: WorldState): void {
  startBriefingAudioCue(audioCueState, audioEngine, loadedWorld, briefingOpen);
}

function replayBriefingAudio(): void {
  if (!world || !briefingOpen) {
    return;
  }
  resetBriefingAudioCue(audioCueState);
  startBriefingAudio(world);
}

function dismissBriefing(): void {
  briefingOpen = false;
  fixedDemoHudRenderKey = "";
  audioEngine?.stopBriefingSounds();
  void ensureMusicStarted();
  window.setTimeout(() => {
    void ensureMusicStarted();
  }, 160);
}

function dismissTitleScreen(): void {
  titleScreenOpen = false;
  audioEngine?.stopMusic();
  void ensureMusicStarted();
}

function handleSpeedKey(event: KeyboardEvent): boolean {
  const action = sourceSpeedKeyAction(event);
  if (!action) {
    return false;
  }
  if (action === "toggle-pause") {
    paused = !paused;
    event.preventDefault();
    return true;
  }
  if (action === "slower-game") {
    gameSpeed = previousGameSpeed(gameSpeed, world);
    if (world) {
      world.engineSettings.sourceGameSpeedDefault = sourceGameSpeedFromMultiplier(world, gameSpeed);
    }
    return true;
  }
  if (action === "faster-game") {
    gameSpeed = nextGameSpeed(gameSpeed, world);
    if (world) {
      world.engineSettings.sourceGameSpeedDefault = sourceGameSpeedFromMultiplier(world, gameSpeed);
    }
    return true;
  }
  if (action === "default-game-speed") {
    if (world) {
      world.engineSettings.sourceGameSpeedDefault = sourceDefaultGameSpeed(world);
      gameSpeed = sourceGameSpeedMultiplier(world);
    } else {
      gameSpeed = 1;
    }
    return true;
  }
  return true;
}

function handleSourceIngameCommandKey(event: KeyboardEvent): boolean {
  if (!world || !manifest || !activeMap) {
    return false;
  }
  const command = sourceIngameMapCommandForKey(event);
  if (!command) {
    return false;
  }
  event.preventDefault();
  if (command === "choose-map" || command === "restart-map") {
    paused = true;
  }
  void executeMapCommand(command);
  return true;
}

function handleSourcePreferenceKey(event: KeyboardEvent): boolean {
  if (!world || !manifest || !activeMap) {
    return false;
  }
  const command = sourcePreferenceKeyCommand(event);
  if (!command) {
    return false;
  }
  event.preventDefault();
  void executeMapCommand(command);
  return true;
}

function handleMapPickerKey(event: KeyboardEvent): boolean {
  const result = applyMapPickerKey(mapPickerState, event, findMapPickerMatches);
  if (!result.handled) {
    return false;
  }
  event.preventDefault();
  mapPickerState.open = result.state.open;
  mapPickerState.query = result.state.query;
  mapPickerState.maps = result.state.maps;
  if (result.selectedMap) {
    void selectMapFromPicker(result.selectedMap);
  }
  return true;
}

function handleMatchOverlayKey(event: KeyboardEvent): boolean {
  if (!world || world.matchState.status === "playing") {
    return false;
  }
  const command = matchOverlayCommandForKey(event, world.matchState.status, Boolean(activeMap && manifest && nextCampaignMapFor(activeMap, manifest)));
  if (!command) {
    return false;
  }
  event.preventDefault();
  if (command === "next-campaign") {
    void loadNextCampaignMission();
  } else {
    void executeMapCommand(command);
  }
  return true;
}

function selectNextIdleWorker(loadedWorld: WorldState): void {
  const nextWorker = findNextIdleWorker(loadedWorld, selectedUnitIds);
  if (!nextWorker) {
    playGameSound("click");
    return;
  }
  selectedUnitIds = [nextWorker.id];
  centerCameraOnWorldPoint(loadedWorld, nextWorker.x, nextWorker.y);
  void audioEngine?.playUnitSound(nextWorker, "selected", sourceStereoPanForUnit(nextWorker));
}

function centerCameraOnSelectedUnits(loadedWorld: WorldState | null): void {
  const selectedUnits = loadedWorld
    ? selectedUnitIds.map((id) => loadedWorld.units.find((unit) => unit.id === id)).filter((unit): unit is WorldUnit => Boolean(unit && unit.hitPoints > 0))
    : [];
  if (!loadedWorld || selectedUnits.length === 0) {
    playGameSound("click");
    return;
  }
  const center = selectedUnits.reduce((sum, unit) => ({ x: sum.x + unit.x, y: sum.y + unit.y }), { x: 0, y: 0 });
  centerCameraOnWorldPoint(loadedWorld, center.x / selectedUnits.length, center.y / selectedUnits.length);
  playGameSound("click");
}

function toggleTrackedViewportUnit(loadedWorld: WorldState | null): void {
  const selected = loadedWorld
    ? selectedUnitIds.map((id) => loadedWorld.units.find((unit) => unit.id === id)).find((unit): unit is WorldUnit => Boolean(unit && unit.hitPoints > 0)) ?? null
    : null;
  if (!selected) {
    trackedViewportUnitId = null;
    playGameSound("click");
    return;
  }
  trackedViewportUnitId = trackedViewportUnitId === selected.id ? null : selected.id;
  playGameSound("click");
}

function updateTrackedViewportUnit(loadedWorld: WorldState): void {
  if (!trackedViewportUnitId) {
    return;
  }
  const tracked = loadedWorld.units.find((unit) => unit.id === trackedViewportUnitId && unit.hitPoints > 0);
  if (!tracked) {
    trackedViewportUnitId = null;
    return;
  }
  centerCameraOnWorldPoint(loadedWorld, tracked.x, tracked.y);
}

async function loadNextCampaignMission(): Promise<void> {
  if (!activeMap || !manifest) {
    return;
  }
  const nextMap = nextCampaignMapFor(activeMap, manifest);
  if (nextMap) {
    await loadPlayableMap(nextMap);
  }
}

async function selectMapFromPicker(map: WargusMap): Promise<void> {
  mapPickerState.open = false;
  mapPickerState.query = "";
  await loadPlayableMap(map);
}

function currentPlayableWorldBounds(): { left: number; right: number; top: number; bottom: number } {
  return currentPlayableWorldBoundsBase(camera, app.screen, world);
}

function updateSourceCursor(): void {
  if (isFixedBrowserDemoMap(activeMap)) {
    app.canvas.style.cursor = browserDemoCursor();
    return;
  }
  app.canvas.style.cursor = sourceCursorCssForWorldState({
    cursors: manifest?.cursors,
    world,
    pendingWorldCommand,
    pointerWorldPosition,
    selectedUnitIds,
    race: localPlayerRace(),
    edgeScrollActive: sourceEdgeScrollCursorActive(),
    edgeScrollX: cameraInput.edgeX,
    edgeScrollY: cameraInput.edgeY,
    selectionDragActive: selectionDrag !== null
  });
}

function browserDemoCursor(): string {
  if (pendingWorldCommand || selectionDrag) {
    return "crosshair";
  }
  if (sourceEdgeScrollCursorActive()) {
    return "move";
  }
  return "default";
}

function updatePointerScreenPosition(clientX: number, clientY: number): void {
  const bounds = app.canvas.getBoundingClientRect();
  pointerScreenPosition = {
    x: clientX - bounds.left,
    y: clientY - bounds.top
  };
  resetSourceMapNamePopupTimer();
}

function resetSourceMapNamePopupTimer(): void {
  if (!world || world.engineSettings.showNameDelayTicksDefault <= 0) {
    sourceMapNamePopupState.showNameDelayTick = 0;
    sourceMapNamePopupState.showNameTimeTick = 0;
    return;
  }
  sourceMapNamePopupState.showNameDelayTick = world.tick + world.engineSettings.showNameDelayTicksDefault;
  sourceMapNamePopupState.showNameTimeTick = sourceMapNamePopupState.showNameDelayTick + Math.max(0, world.engineSettings.showNameTimeTicksDefault);
}

function maybeGrabSourceMouse(): void {
  if (!world?.engineSettings.grabMouseDefault || document.pointerLockElement === app.canvas || !app.canvas.requestPointerLock) {
    return;
  }
  app.canvas.requestPointerLock();
}

function renderSourceSoftwareCursor(): void {
  cursorLayer.removeChildren();
  if (isFixedBrowserDemoMap(activeMap)) {
    cursorSprite = null;
    cursorSpriteKey = null;
    return;
  }
  if (world?.engineSettings.hardwareCursorDefault !== false || !pointerScreenPosition) {
    cursorSprite = null;
    cursorSpriteKey = null;
    return;
  }
  const renderState = sourceCursorRenderStateForWorldState({
    cursors: manifest?.cursors,
    world,
    pendingWorldCommand,
    pointerWorldPosition,
    selectedUnitIds,
    race: localPlayerRace(),
    edgeScrollActive: sourceEdgeScrollCursorActive(),
    edgeScrollX: cameraInput.edgeX,
    edgeScrollY: cameraInput.edgeY,
    selectionDragActive: selectionDrag !== null
  });
  if (!renderState) {
    cursorSprite = null;
    cursorSpriteKey = null;
    return;
  }
  const file = sourceCursorFileForState(renderState.cursor);
  const key = `${file}:${renderState.cursor.hotSpot.join(",")}`;
  if (!cursorSprite || cursorSpriteKey !== key) {
    cursorSprite = Sprite.from(`/wargus/graphics/${file}`);
    cursorSpriteKey = key;
  }
  cursorSprite.position.set(pointerScreenPosition.x - renderState.cursor.hotSpot[0], pointerScreenPosition.y - renderState.cursor.hotSpot[1]);
  cursorLayer.addChild(cursorSprite);
}

function sourceEdgeScrollCursorActive(): boolean {
  return cameraInput.edgeX !== 0 || cameraInput.edgeY !== 0;
}

function sourceUnitUnderCursor(loadedWorld: WorldState | null, point: { x: number; y: number } | null): WorldUnit | null {
  if (!loadedWorld || !point) {
    return null;
  }
  const visibleUnits = [...loadedWorld.units]
    .filter((unit) => (
      unit.hitPoints > 0
      && !isUnitHiddenInConstruction(unit)
      && !isInvisibleUtilityUnit(unit)
      && !isUnitInsideResourceSource(unit)
      && isUnitVisibleToPlayer(loadedWorld, unit, loadedWorld.visibilityPlayer)
      && sourceUnitContainsWorldPoint(loadedWorld, unit, point.x, point.y)
    ))
    .sort((left, right) => (right.drawLevel ?? 0) - (left.drawLevel ?? 0) || right.y - left.y);
  return visibleUnits[0] ?? null;
}

function sourceUnitContainsWorldPoint(loadedWorld: WorldState, unit: WorldUnit, x: number, y: number): boolean {
  const { halfWidth, halfHeight } = unitFootprintHalfSize(unit, loadedWorld.tileSize);
  const left = unit.x - halfWidth;
  const right = unit.x + halfWidth;
  const top = unit.y - halfHeight;
  const bottom = unit.y + halfHeight;
  return x >= left && x <= right && y >= top && y <= bottom;
}
