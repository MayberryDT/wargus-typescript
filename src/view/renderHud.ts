import { Application, Container, Graphics, Sprite, Text, type FederatedPointerEvent } from "pixi.js";
import { canAttackGround, canEnterPendingWorldCommand, canIssueAutoHarvestOrder, canIssueDetonateOrder, canUseHudBuilderCommands, canIssueExploreOrder, canIssueHoldPosition, canIssueLoadTransport, canIssueReturnGoodsOrder, canReceiveMoveOrders, isAdvancedMeleeCombatDefinition, isAirCombatDefinition, isCasterDefinition, isDefensiveBuildingDefinition, isDemolitionLabDefinition, isDemolitionUnitDefinition, hasAnySourceResearchValue, hasSourceBuildButtonsForTypes, hasSourceResearchButtonsForTypes, hasSourceResearchValueMatching, hasSourceSpellResearchValue, hasSourceTrainButtonsForTypes, hasSourceTrainValueMatching, isGoldOrWoodWorkerDefinition, isHolyResearchUpgradeId as isHolyResearchUpgrade, isHolySupportResearchUpgradeId as isHolySupportResearchUpgrade, isHolyTransformationResearchUpgradeId as isHolyTransformationResearchUpgrade, isBlacksmithResearchUpgrade, isLumberMillResearchUpgrade, isMeleeLandCombatDefinition, isMeleeWeaponResearchUpgrade, isNavalCombatOrUtilityDefinition, isNavalResearchUpgrade, isNavalRoleDefinition, isOilRefineryDefinition, isOrdinaryBarracksCombatDefinition, isRangedLandCombatDefinition, isScoutAirDefinition, isShieldResearchUpgrade, isShipArmorResearchUpgradeId as isShipArmorResearchUpgrade, isShipCannonResearchUpgradeId as isShipCannonResearchUpgrade, isSiegeDefinition, isSiegeResearchUpgrade, isSourceConversionTarget, isSupplyProviderDefinition, isTransport, isWallDefinition, selectedCanCastTargetedSpell, sourceActionButtonsForHud, sourceBuildButtonsForHud, sourceBuildIconForHudCommand, sourceBuildPageButtonForHud, sourceBuildValuesDefinitionMatching, sourceBuildValuesProduceMatching, sourceBuildValuesResearchMatching, sourceBuildValuesUpgradeToMatching, sourceButtonForHudCommand, sourceButtonHasExecutableContext, sourceButtonVisibleForHud, sourceCancelButtonForSelection, sourceFallbackResearchIconForHudCommand, sourceFallbackSpellCommandForSpellId, sourceFallbackTrainIconForHudCommand, sourceGroupButtonScopeForSelection, sourceHudCommandForAction, sourceInstantSpellCommandForSpellId, sourceResearchButtonsForHud, sourceResearchIconForHudCommand, sourceRootBuildButtonsForHud, selectedCanResearchMatchingSource, selectedCanResearchSpellSource, selectedCanResearchAny, selectedCanTrainAny, selectedCanTrainMatching, selectedCanBuildAny, sourceSpellButtonsForHud, sourceSpellCommandForSpellId, sourceTowerUpgradeTargetForTypes, sourceTownUpgradeTargetForTypes, sourceTrainButtonsForHud, sourceTrainIconForHudCommand, sourceTrainTargetForTypes, sourceUpgradeButtonsForHud, sourceWorkerTrainTargetForTypes, townCenterTierForPlayer, type TargetedSpellCommand } from "../simulation/orders";
import { getPlayerSupply, isInvisibleUtilityUnit, isUnitFootprintVisibleToPlayer, isUnitVisibleToPlayer, isWorldTileSourceKnown, type WorldState } from "../simulation/world";
import type { SavedGameSummary } from "../wargus/saveGame";
import type { WargusBriefingLayout, WargusButton, WargusManifest, WargusMap, WargusMenuButtonLayout } from "../wargus/types";
import { sourceButtonLabel } from "../wargus/buttons";
import type { Camera } from "./camera";
import { getIconTexture, type IconTextureAtlas } from "./iconTextureAtlas";
import { sourcePanelTexturesForRace, type SourcePanelAtlas, type SourcePanelTextures } from "./sourcePanelAtlas";
import { getStatusBarTexture, type StatusDecorationAtlas } from "./statusDecorationAtlas";
import { getResourceUiTexture, type ResourceUiAtlas } from "./resourceUiAtlas";
import { getSourceButtonStyleTexture, type SourceButtonStyleAtlas } from "./sourceButtonStyleAtlas";
import { cargoManifestLine, colorNumberFromCss, commandHint, controlGroupSummary, economyRoleLine, fogByteToAlpha, idleWorkerSummary, objectiveLines, ownerLine, queuedMoveLine, rgbToHex, selectedOrderLine, selectedRallyLine, selectedResourceLine, sourceAutoCastBorderColor, sourceCampaignLabelForMap, sourceCampaignMissionComplete, sourceCommandBorderColor, sourceCommandStatusLineText, sourceCompletedBarColor, sourceCompletedBarShadow, sourceFilteredPickerMaps, sourceFreeWorkerCount, sourceHudActionLabel, sourceInfoPanelLayout, sourceInfoPanelSlot, sourceMapViewportSize, sourceMenuButtonFontSize, sourceMenuButtonGroup, sourceMenuButtonHeight, sourceMenuButtonPalette, sourceMenuButtonWidth, sourceMenuOverlayButtons, sourceMenuOverlayLines, sourceMenuOverlayTitle, sourceMenuTextAnchor, sourceMenuTextX, sourceMenuTextY, sourceMessageLineHeight, sourceMessageScrollOffset, sourceMinimapLayout, sourcePanelBarItems, sourcePanelContentLines, sourcePlayerColor, sourcePlayerDisplayName, sourcePopupColor, sourcePopupLabel, sourcePopupLines, sourcePopupStatTicks, sourcePreferredHarvestActionLabel, sourceResultRankForPlayer, sourceResultScoreForPlayer, sourceResultScoreHeader, sourceResultScreen, sourceSaveTitle, sourceShortTime, sourceSpecialLine, sourceSpellButtonLabel, sourceStatusLineLayout, sourceTextColorCss, sourceTextColorNumber, sourceTextPaletteId, sourceTitleScreen, sourceTitleTip, sourceTrainButtonLabel, sourceUiTextColor, sourceUnitButtonLabel, sourceViewportModeRects, sourceViewportWorldRects, sourceSelectedCommandBorderColor, unitTypeName, upgradeName, type SourceDiplomacyDraft, type SourceMenuButtonSlot } from "./sourceUiHelpers";
import { createWargusBitmapText, type WargusBitmapFontAtlas } from "./wargusBitmapFontAtlas";
import { isFixedBrowserDemoMap } from "../wargus/demoScenario";
import { fixedDemoMissionSummary, type FixedDemoMissionSummary } from "../wargus/demoMission";

export type HudCommandId =
  | `source-train:${string}`
  | `source-upgrade:${string}`
  | `source-research:${string}`
  | `source-build:${string}`
  | `source-spell:${string}`
  | "cancel-queue"
  | "build-basic-page"
  | "build-advanced-page"
  | "build-page-cancel"
  | "move"
  | "stop"
  | "hold-position"
  | "attack-move"
  | "attack-ground"
  | "patrol"
  | "follow"
  | "repair"
  | "detonate"
  | "explore"
  | "harvest"
  | "return-goods"
  | "train-worker"
  | "upgrade-town-center"
  | "upgrade-guard-tower"
  | "upgrade-cannon-tower"
  | "train-minuteman"
  | "train-melee"
  | "train-ranged"
  | "train-ranged-veteran"
  | "train-cavalry-veteran"
  | "train-critter"
  | "build-farm"
  | "build-barracks"
  | "build-lumber-mill"
  | "build-blacksmith"
  | "build-wall"
  | "build-advanced"
  | "build-guard-tower"
  | "build-cannon-tower"
  | "build-shipyard"
  | "build-foundry"
  | "build-refinery"
  | "build-oil-platform"
  | "build-caster-building"
  | "build-holy-building"
  | "build-air-building"
  | "build-siege-lab"
  | "research-melee"
  | "research-armor"
  | "research-ranged"
  | "research-siege"
  | "research-paladin"
  | "research-healing"
  | "research-exorcism"
  | "research-holy-vision"
  | "research-flame-shield"
  | "research-blizzard"
  | "research-polymorph"
  | "research-invisibility"
  | "research-slow"
  | "research-death-coil"
  | "research-death-magic"
  | "research-whirlwind"
  | "research-raise-dead"
  | "research-unholy-armor"
  | "research-haste"
  | "research-bloodlust"
  | "research-runes"
  | "research-eye-of-kilrogg"
  | "train-cavalry"
  | "train-tanker"
  | "train-destroyer"
  | "train-warship"
  | "train-transport"
  | "train-submarine"
  | "research-ship-cannon"
  | "research-ship-armor"
  | "load-transport"
  | "unload-transport"
  | "train-caster"
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
  | "train-air"
  | "train-demolition"
  | "train-siege"
  | "train-scout-air";
export type HudMapCommandId = "previous-map" | "restart-map" | "next-map" | "choose-map" | "save-game" | "load-game" | "next-save-slot" | "export-save" | "import-save" | "load-autosave" | "toggle-pause" | "slower-game" | "faster-game" | "easier-ai" | "harder-ai" | "main-menu" | "help-menu" | "keystroke-help" | "tips" | "objectives" | "game-options" | "speed-options" | "speed-options-ok" | "speed-options-cancel" | "sound-options" | "sound-options-ok" | "sound-options-cancel" | "preferences" | "preferences-ok" | "preferences-cancel" | "save-menu" | "load-menu" | "diplomacy" | "end-scenario" | "restart-confirm" | "surrender-confirm" | "surrender" | "quit-to-menu" | "exit-game" | "toggle-messages" | "toggle-command-keys" | "toggle-button-popups" | "toggle-status-line-tooltips" | "toggle-map-grid" | "toggle-show-orders" | "toggle-show-damage" | "toggle-show-sight-range" | "toggle-show-attack-range" | "toggle-show-reaction-range" | "toggle-single-player-walls" | "toggle-highlight-passability" | "toggle-minimap-terrain" | "toggle-mine-notifications" | "toggle-show-tips" | "next-title-tip" | "toggle-keyboard-scrolling" | "toggle-mouse-scrolling" | "cycle-group-keys" | "key-scroll-speed-down" | "key-scroll-speed-up" | "mouse-scroll-speed-down" | "mouse-scroll-speed-up" | "mouse-pressed-scroll-speed-down" | "mouse-pressed-scroll-speed-up" | "mouse-control-scroll-speed-down" | "mouse-control-scroll-speed-up" | "fast-forward-cycle-down" | "fast-forward-cycle-up" | "frame-skip-down" | "frame-skip-up" | "toggle-formation-movement" | "toggle-big-screen" | "toggle-keep-ratio" | "toggle-ally-deposits" | "toggle-ai-dependencies" | "toggle-ai-explores" | "toggle-inside-mode" | "edit-player-name" | "toggle-fullscreen" | "video-size-down" | "video-size-up" | "toggle-grab-mouse" | "toggle-hardware-cursor" | "toggle-icon-shift" | "toggle-grayscale-icons" | "toggle-video-shader" | "cycle-viewport-mode" | "toggle-right-button-action" | "toggle-deselect-in-mine" | "toggle-simplified-auto-targeting" | "toggle-fancy-buildings" | "toggle-enhanced-effects" | "toggle-pause-on-leave" | "toggle-leave-stop-scrolling" | "toggle-training-queue" | "cycle-selection-style" | "double-click-delay-down" | "double-click-delay-up" | "hold-click-delay-down" | "hold-click-delay-up" | "toggle-effects" | "toggle-music" | "toggle-stereo" | "effects-volume-down" | "effects-volume-up" | "music-volume-down" | "music-volume-up" | "diplomacy-ok" | "diplomacy-cancel" | `diplomacy-ally-${number}` | `diplomacy-enemy-${number}` | `diplomacy-vision-${number}`;
export type HudMenuOverlayId = "main-menu" | "help-menu" | "keystroke-help" | "tips" | "objectives" | "game-options" | "speed-options" | "sound-options" | "preferences" | "save-menu" | "load-menu" | "diplomacy" | "end-scenario" | "restart-confirm" | "surrender-confirm" | "quit-to-menu" | "exit-game";

export interface HudMessage {
  text: string;
  createdAt: number;
  expiresAt: number;
}

interface RenderHudArgs {
  app: Application;
  hudLayer: Container;
  frame: Graphics;
  manifest: WargusManifest;
  activeMap: WargusMap;
  world: WorldState;
  camera: Camera;
  sourceViewportCameras: readonly Camera[];
  selectedUnitIds: string[];
  hoveredUnitId: string | null;
  hudMessages: HudMessage[];
  alertPings: Array<{ x: number; y: number; createdAt: number; expiresAt: number }>;
  controlGroups: Record<number, string[]>;
  activeSaveSlot: number;
  activeSaveSummary: SavedGameSummary | null;
  autosaveSummary: SavedGameSummary | null;
  paused: boolean;
  gameSpeed: number;
  briefingOpen: boolean;
  nextCampaignMap: WargusMap | null;
  iconAtlas: IconTextureAtlas | null;
  statusDecorationAtlas: StatusDecorationAtlas | null;
  sourcePanelAtlas: SourcePanelAtlas | null;
  sourceButtonStyleAtlas: SourceButtonStyleAtlas | null;
  resourceUiAtlas: ResourceUiAtlas | null;
  wargusBitmapFontAtlas: WargusBitmapFontAtlas | null;
  commandPage: number;
  onDismissBriefing: () => void;
  onReplayBriefing: () => void;
  onNextCampaignMission: () => void;
  onCommand: (command: HudCommandId, input?: { ctrlKey?: boolean }) => void;
  onMapCommand: (command: HudMapCommandId) => void;
  onSelectedUnitPick: (unitId: string, additive: boolean) => void;
  onFreeWorkerPick: () => void;
  onProductionQueuePick: (buildingId: string, item: { kind: "production"; index: number } | { kind: "research" }) => void;
  onCargoUnitPick: (transportId: string, cargoUnitId: string, queue: boolean) => void;
  mapPicker: { open: boolean; query: string; maps: WargusMap[] };
  completedCampaignMissions: string[];
  onMapPick: (map: WargusMap) => void;
  onMinimapPoint: (tileX: number, tileY: number, input: { button: number; shiftKey: boolean }) => void;
  titleScreenOpen: boolean;
  onDismissTitleScreen: () => void;
  menuOverlay: HudMenuOverlayId | null;
  diplomacyDraft: SourceDiplomacyDraft | null;
  activeSourceViewportIndex: number;
}

export function renderHud(args: RenderHudArgs): void {
  const { app, hudLayer, frame, manifest, activeMap, world, camera, sourceViewportCameras, selectedUnitIds, hoveredUnitId, hudMessages, alertPings, controlGroups, activeSaveSlot, activeSaveSummary, autosaveSummary, paused, gameSpeed, briefingOpen, nextCampaignMap, iconAtlas, statusDecorationAtlas, sourcePanelAtlas, sourceButtonStyleAtlas, resourceUiAtlas, wargusBitmapFontAtlas: loadedBitmapFontAtlas, commandPage, onDismissBriefing, onReplayBriefing, onNextCampaignMission, onCommand, onMapCommand, onSelectedUnitPick, onFreeWorkerPick, onProductionQueuePick, onCargoUnitPick, mapPicker, completedCampaignMissions, onMapPick, onMinimapPoint, titleScreenOpen, onDismissTitleScreen, menuOverlay, diplomacyDraft, activeSourceViewportIndex } = args;
  const fixedDemo = isFixedBrowserDemoMap(activeMap);
  const wargusBitmapFontAtlas = fixedDemo ? null : loadedBitmapFontAtlas;
  hudLayer.removeChildren();
  hudLayer.addChild(frame);
  frame.clear();

  const visiblePlayer = world.players.find((player) => player.id === world.visibilityPlayer) ?? world.players[0];
  const selectedUnits = selectedUnitIds
    .map((id) => world.units.find((unit) => unit.id === id))
    .filter((unit): unit is NonNullable<typeof unit> => Boolean(unit && unit.hitPoints > 0));
  const hoveredUnit = selectedUnits.length === 0 && hoveredUnitId ? world.units.find((unit) => unit.id === hoveredUnitId && unit.hitPoints > 0) ?? null : null;
  const selected = selectedUnits[0] ?? hoveredUnit ?? null;
  const selectedFromHover = selectedUnits.length === 0 && selected !== null;
  const selectedOwner = selected ? world.players.find((player) => player.id === selected.player) : null;
  const supply = visiblePlayer ? getPlayerSupply(world, visiblePlayer.id) : null;
  const selectedIsOwned = selected?.player === world.visibilityPlayer;

  if (fixedDemo) {
    drawFixedBrowserDemoHud({
      app,
      layer: hudLayer,
      graphics: frame,
      manifest,
      activeMap,
      world,
      camera,
      sourceViewportCameras,
      selectedUnits,
      selected,
      selectedFromHover,
      selectedIsOwned,
      visiblePlayer,
      supply,
      alertPings,
      hudMessages,
      paused,
      gameSpeed,
      briefingOpen,
      nextCampaignMap,
      iconAtlas,
      statusDecorationAtlas,
      commandPage,
      onCommand,
      onMapCommand,
      onSelectedUnitPick,
      onFreeWorkerPick,
      onProductionQueuePick,
      onMinimapPoint,
      onNextCampaignMission
    });
    drawBriefingOverlay(app, hudLayer, manifest, world, briefingOpen, wargusBitmapFontAtlas, onDismissBriefing, onReplayBriefing);
    drawSourceMenuOverlay(app, hudLayer, manifest, world, menuOverlay, paused, gameSpeed, activeSaveSlot, activeSaveSummary, autosaveSummary, diplomacyDraft, wargusBitmapFontAtlas, onMapCommand);
    drawMapPicker(app, hudLayer, manifest, mapPicker, completedCampaignMissions, wargusBitmapFontAtlas, onMapPick);
    return;
  }

  if (world.engineSettings.bigScreenDefault && world.matchState.status === "playing" && !briefingOpen && !titleScreenOpen) {
    drawHudMessages(hudLayer, app, 0, manifest, world, hudMessages, wargusBitmapFontAtlas);
    drawMatchOverlay(app, hudLayer, manifest, world, nextCampaignMap, wargusBitmapFontAtlas, onNextCampaignMission, () => onMapCommand("restart-map"), () => onMapCommand("choose-map"));
    drawSourceMenuOverlay(app, hudLayer, manifest, world, menuOverlay, paused, gameSpeed, activeSaveSlot, activeSaveSummary, autosaveSummary, diplomacyDraft, wargusBitmapFontAtlas, onMapCommand);
    drawMapPicker(app, hudLayer, manifest, mapPicker, completedCampaignMissions, wargusBitmapFontAtlas, onMapPick);
    return;
  }

  const sideWidth = Math.min(320, Math.max(248, app.screen.width * 0.24));
  const left = app.screen.width - sideWidth;
  const sourcePanels = sourcePanelTexturesForRace(sourcePanelAtlas, visiblePlayer?.race);
  frame.rect(left, 0, sideWidth, app.screen.height);
  frame.fill(0x16120d);
  drawSourceHudPanels(hudLayer, frame, sourcePanels, left, 0, sideWidth, app.screen.height);
  frame.rect(left, 0, sideWidth, app.screen.height);
  frame.stroke({ width: 2, color: 0x4b3f2a, alpha: 1 });

  const title = addHudText(hudLayer, wargusBitmapFontAtlas, {
    text: "Wargus TS",
    fontId: "large",
    color: sourceTextColorNumber(manifest, visiblePlayer?.race, "normal", 0xf0df9a),
    paletteId: sourceTextPaletteId(manifest, visiblePlayer?.race, "normal"),
    x: left + 18,
    y: 16,
    fallbackStyle: { fill: sourceTextColorCss(manifest, visiblePlayer?.race, "normal", "#f0df9a"), fontSize: 22, fontFamily: "system-ui, sans-serif", fontWeight: "700" }
  });
  title.scale.set(wargusBitmapFontAtlas ? 0.78 : 1);

  const selectedUsesSourcePanel = Boolean(selected && (selectedIsOwned || selected.givesResource || selected.player !== 15));
  const showNoSelectionStats = !fixedDemo && (selected !== null || world.engineSettings.showNoSelectionStatsDefault);
  const lines = [
    ...(showNoSelectionStats ? [
      activeMap.title,
      `${activeMap.width}x${activeMap.height} map, ${activeMap.players} players`,
      activeMap.setup ? `${activeMap.setup.unitCount} setup units, ${activeMap.setup.tileCount} real tiles` : "No setup file indexed",
      activeMap.setup?.tileset ? `Tileset ${activeMap.setup.tileset}` : "No tileset loaded",
      `${manifest.counts.units} unit definitions indexed`,
      `${manifest.counts.maps} map presentations indexed`,
      ...objectiveLines(manifest, world),
      idleWorkerSummary(world),
      controlGroupSummary(controlGroups, world),
      `Tick ${world.tick}`,
      ""
    ] : []),
    selectedUnits.length > 1 ? `${selectedUnits.length} units selected` : selectedFromHover ? selected.name : selected ? selected.name : "No unit selected",
    selectedFromHover ? `${unitTypeName(manifest, selected.typeId)} (${selected.kind}) under cursor` : selected ? `${unitTypeName(manifest, selected.typeId)} (${selected.kind})` : "Click or drag-select units",
    selected && !selectedIsOwned ? ownerLine(selected, selectedOwner) : "",
    selectedIsOwned && selected?.construction ? `Constructing ${Math.ceil(selected.construction.remainingSeconds)}s` : "",
    ...(selectedUsesSourcePanel && selected ? sourcePanelContentLines(manifest, world, selected) : []),
    selected ? selectedResourceLine(selected, world) : "",
    selectedIsOwned && selected ? economyRoleLine(selected) : "",
    selectedIsOwned && selected ? sourceSpecialLine(selected) : "",
    selectedIsOwned && selected?.statusEffects?.length ? `Effects ${selected.statusEffects.map((effect) => `${effect.kind} ${Math.ceil(effect.remainingSeconds)}s`).join(", ")}` : "",
    selectedIsOwned && selected && selected.cargoCapacity > 0 ? `Cargo ${selected.cargo.length}/${selected.cargoCapacity}` : "",
    selectedIsOwned && selected && selected.cargo.length > 0 ? cargoManifestLine(selected) : "",
    selectedIsOwned && selected ? selectedRallyLine(selected, world) : "",
    selectedIsOwned && selected ? queuedMoveLine(selected, world) : "",
    selectedIsOwned ? selectedOrderLine(selected, world, manifest) : selected ? commandHint(selected, world) : "Right-click commands after selecting"
  ].filter((line) => line !== "");

  const iconWidth = selected && iconAtlas ? 62 : 0;
  const body = addHudText(hudLayer, wargusBitmapFontAtlas, {
    text: lines.join("\n"),
    fontId: "game",
    color: 0xd8d3bd,
    x: left + 18,
    y: 86,
    maxWidth: sideWidth - 36 - iconWidth,
    lineHeight: 22,
    fallbackStyle: {
      fill: "#d8d3bd",
      fontSize: 14,
      fontFamily: "system-ui, sans-serif",
      lineHeight: 22,
      wordWrap: true,
      wordWrapWidth: sideWidth - 36 - iconWidth
    }
  });
  body.scale.set(wargusBitmapFontAtlas ? 0.68 : 1);
  drawResourceStrip(hudLayer, frame, left + 18, 50, sideWidth - 36, manifest, world, visiblePlayer, supply, iconAtlas, resourceUiAtlas, wargusBitmapFontAtlas, onFreeWorkerPick);
  drawSelectedUnitIcon(hudLayer, frame, left + 18, 180, sideWidth - 36, manifest, world, selected, iconAtlas);
  drawSelectedUnitBars(hudLayer, frame, left + sideWidth - 78, 132, 58, left, manifest, world, selected, selectedIsOwned, statusDecorationAtlas, wargusBitmapFontAtlas);
  drawMultiSelectionPanel(hudLayer, frame, left + 18, 180, sideWidth - 36, manifest, world, selectedUnits, iconAtlas, statusDecorationAtlas, wargusBitmapFontAtlas, onSelectedUnitPick);
  drawProductionQueuePanel(hudLayer, frame, left + 18, 180, sideWidth - 36, manifest, world, selectedUnits.length <= 1 && selectedIsOwned && !selectedFromHover ? selected : null, iconAtlas, statusDecorationAtlas, wargusBitmapFontAtlas, onProductionQueuePick);
  drawCargoPanel(hudLayer, frame, left + 18, 180, sideWidth - 36, manifest, world, selectedUnits.length <= 1 && selectedIsOwned && !selectedFromHover ? selected : null, iconAtlas, statusDecorationAtlas, wargusBitmapFontAtlas, onCargoUnitPick);

  drawMapPanel(hudLayer, frame, left + 18, app.screen.height - 442, sideWidth - 36, activeMap, manifest, activeSaveSlot, activeSaveSummary, autosaveSummary, paused, gameSpeed, wargusBitmapFontAtlas, onMapCommand);
  drawSourceMenuButtons(hudLayer, frame, sourceButtonStyleAtlas, wargusBitmapFontAtlas, manifest, world, visiblePlayer?.race, onMapCommand);
  drawCommandPanel(hudLayer, frame, app, sideWidth, left + 18, app.screen.height - 350, sideWidth - 36, manifest, world, selectedUnits, iconAtlas, wargusBitmapFontAtlas, commandPage, onCommand);
  const minimapLayout = sourceMinimapLayout(world, left, sideWidth, app.screen.height);
  const mapViewport = sourceMapViewportSize(world, app.screen.width, app.screen.height, sideWidth);
  drawMinimap(hudLayer, frame, minimapLayout.x, minimapLayout.y, minimapLayout.width, minimapLayout.height, world, camera, sourceViewportCameras, alertPings, app.screen.width, app.screen.height, mapViewport.width, mapViewport.height, onMinimapPoint);
  drawSourceViewportModeOverlay(frame, world, app.screen.width, app.screen.height, activeSourceViewportIndex);
  drawHudMessages(hudLayer, app, sideWidth, manifest, world, hudMessages, wargusBitmapFontAtlas);
  drawMatchOverlay(app, hudLayer, manifest, world, nextCampaignMap, wargusBitmapFontAtlas, onNextCampaignMission, () => onMapCommand("restart-map"), () => onMapCommand("choose-map"));
  drawBriefingOverlay(app, hudLayer, manifest, world, briefingOpen, wargusBitmapFontAtlas, onDismissBriefing, onReplayBriefing);
  drawSourceMenuOverlay(app, hudLayer, manifest, world, menuOverlay, paused, gameSpeed, activeSaveSlot, activeSaveSummary, autosaveSummary, diplomacyDraft, wargusBitmapFontAtlas, onMapCommand);
  drawMapPicker(app, hudLayer, manifest, mapPicker, completedCampaignMissions, wargusBitmapFontAtlas, onMapPick);
  drawSourceTitleScreen(app, hudLayer, manifest, world, titleScreenOpen, wargusBitmapFontAtlas, onDismissTitleScreen, () => onMapCommand("choose-map"));
}

function drawFixedBrowserDemoHud(args: {
  app: Application;
  layer: Container;
  graphics: Graphics;
  manifest: WargusManifest;
  activeMap: WargusMap;
  world: WorldState;
  camera: Camera;
  sourceViewportCameras: readonly Camera[];
  selectedUnits: WorldState["units"];
  selected: WorldState["units"][number] | null;
  selectedFromHover: boolean;
  selectedIsOwned: boolean;
  visiblePlayer: WorldState["players"][number] | undefined;
  supply: ReturnType<typeof getPlayerSupply> | null;
  alertPings: Array<{ x: number; y: number; createdAt: number; expiresAt: number }>;
  hudMessages: HudMessage[];
  paused: boolean;
  gameSpeed: number;
  briefingOpen: boolean;
  nextCampaignMap: WargusMap | null;
  iconAtlas: IconTextureAtlas | null;
  statusDecorationAtlas: StatusDecorationAtlas | null;
  commandPage: number;
  onCommand: (command: HudCommandId, input?: { ctrlKey?: boolean; shiftKey?: boolean }) => void;
  onMapCommand: (command: HudMapCommandId) => void;
  onSelectedUnitPick: (unitId: string, additive: boolean) => void;
  onFreeWorkerPick: () => void;
  onProductionQueuePick: (buildingId: string, item: { kind: "production"; index: number } | { kind: "research" }) => void;
  onMinimapPoint: (tileX: number, tileY: number, input: { button: number; shiftKey: boolean }) => void;
  onNextCampaignMission: () => void;
}): void {
  const { app, layer, graphics, manifest, activeMap, world, camera, sourceViewportCameras, selectedUnits, selected, selectedFromHover, selectedIsOwned, visiblePlayer, supply, alertPings, hudMessages, paused, gameSpeed, briefingOpen, nextCampaignMap, iconAtlas, statusDecorationAtlas, commandPage, onCommand, onMapCommand, onSelectedUnitPick, onFreeWorkerPick, onProductionQueuePick, onMinimapPoint, onNextCampaignMission } = args;
  const screenWidth = app.screen.width;
  const screenHeight = app.screen.height;
  const margin = 16;
  const topWidth = Math.min(760, Math.max(420, screenWidth - 240));
  drawFixedDemoTopBar(layer, graphics, margin, 12, topWidth, activeMap, world, visiblePlayer, supply, iconAtlas, briefingOpen, onFreeWorkerPick);

  const minimapSize = Math.min(172, Math.max(126, Math.min(screenWidth, screenHeight) * 0.22));
  const minimapX = screenWidth - minimapSize - margin;
  const minimapY = 16;
  drawFixedDemoPanel(graphics, minimapX - 8, minimapY - 8, minimapSize + 16, minimapSize + 82, 0.7);
  drawMinimap(layer, graphics, minimapX, minimapY, minimapSize, minimapSize, world, camera, sourceViewportCameras, alertPings, screenWidth, screenHeight, screenWidth, screenHeight, onMinimapPoint);
  drawFixedDemoMapButtons(layer, graphics, minimapX, minimapY + minimapSize + 10, minimapSize, paused, gameSpeed, onMapCommand);

  const commandWidth = Math.min(382, Math.max(292, screenWidth * 0.3));
  const commandHeight = 178;
  const commandX = screenWidth - commandWidth - margin;
  const commandY = screenHeight - commandHeight - margin;
  const selectedWidth = Math.min(370, Math.max(282, commandX - margin * 2));
  const selectedHeight = 178;
  drawFixedDemoSelectedPanel(layer, graphics, margin, screenHeight - selectedHeight - margin, selectedWidth, selectedHeight, manifest, world, selectedUnits, selected, selectedFromHover, selectedIsOwned, iconAtlas, statusDecorationAtlas, onSelectedUnitPick, onProductionQueuePick);
  drawFixedDemoCommandPanel(layer, graphics, commandX, commandY, commandWidth, commandHeight, manifest, world, selectedUnits, iconAtlas, commandPage, onCommand);

  drawHudMessages(layer, app, 0, manifest, world, hudMessages, null);
  drawMatchOverlay(app, layer, manifest, world, nextCampaignMap, null, onNextCampaignMission, () => onMapCommand("restart-map"), () => onMapCommand("choose-map"));
}

function drawFixedDemoPanel(graphics: Graphics, x: number, y: number, width: number, height: number, alpha = 0.74): void {
  graphics.roundRect(x, y, width, height, 6);
  graphics.fill({ color: 0x0b100c, alpha });
  graphics.roundRect(x, y, width, height, 6);
  graphics.stroke({ width: 1, color: 0xd8c77a, alpha: 0.62 });
}

function drawFixedDemoTopBar(layer: Container, graphics: Graphics, x: number, y: number, width: number, activeMap: WargusMap, world: WorldState, player: WorldState["players"][number] | undefined, supply: ReturnType<typeof getPlayerSupply> | null, iconAtlas: IconTextureAtlas | null, briefingOpen: boolean, onFreeWorkerPick: () => void): void {
  drawFixedDemoPanel(graphics, x, y, width, 102, 0.72);
  addFixedDemoText(layer, "Wargus TS Demo", x + 14, y + 9, 18, "#f0df9a", 800);
  addFixedDemoText(layer, activeMap.title, x + 14, y + 33, 12, "#d8d3bd", 650, width * 0.36);
  const mission = fixedDemoMissionSummary(world, briefingOpen);
  drawFixedDemoStageStrip(layer, graphics, x + 14, y + 57, Math.min(360, width * 0.5), mission);
  addFixedDemoText(layer, mission ? `Objective: ${mission.objective}` : "Objective: Build, train, attack.", x + 14, y + 80, 12, "#fff0a8", 750, width - 28);
  const resources: Array<{ key: string; label: string; value: string; icon: string | null; action?: () => void }> = [
    { key: "gold", label: "Gold", value: String(player?.resources.gold ?? 0), icon: "icon-gold-mine" },
    { key: "wood", label: "Lumber", value: String(player?.resources.wood ?? 0), icon: "icon-elven-lumber-mill" },
    { key: "food", label: "Food", value: supply ? `${supply.used + supply.queued}/${supply.cap}` : "0/0", icon: "icon-farm" },
    { key: "workers", label: "Idle", value: String(sourceFreeWorkerCount(world, player?.id ?? world.visibilityPlayer)), icon: "icon-peasant", action: onFreeWorkerPick }
  ];
  const startX = x + Math.max(210, width * 0.38);
  const cellWidth = Math.max(82, (width - (startX - x) - 12) / resources.length);
  resources.forEach((resource, index) => {
    const cellX = startX + index * cellWidth;
    const texture = iconAtlas ? getIconTexture(iconAtlas, resource.icon) : null;
    if (texture) {
      const icon = new Sprite(texture);
      icon.x = cellX;
      icon.y = y + 13;
      icon.width = 26;
      icon.height = 22;
      layer.addChild(icon);
    }
    addFixedDemoText(layer, resource.value, cellX + 31, y + 13, 15, "#fff0a8", 800);
    addFixedDemoText(layer, resource.label, cellX + 31, y + 33, 10, "#d2c9a8", 600);
    if (resource.action) {
      const hit = new Graphics();
      hit.rect(cellX - 4, y + 8, cellWidth - 4, 42);
      hit.fill({ color: 0xffffff, alpha: 0.001 });
      hit.eventMode = "static";
      hit.cursor = "pointer";
      hit.on("pointertap", resource.action);
      layer.addChild(hit);
    }
  });
}

function drawFixedDemoStageStrip(layer: Container, graphics: Graphics, x: number, y: number, width: number, mission: FixedDemoMissionSummary | null): void {
  const stages: Array<{ key: FixedDemoMissionSummary["stage"]; label: string }> = [
    { key: "economy", label: "Gather" },
    { key: "training", label: "Train" },
    { key: "raid", label: "Defend" },
    { key: "assault", label: "Assault" }
  ];
  const activeIndex = mission ? fixedDemoStageProgressIndex(mission.stage) : 0;
  const gap = 5;
  const stepWidth = Math.max(58, Math.floor((width - gap * (stages.length - 1)) / stages.length));
  stages.forEach((stage, index) => {
    const stepX = x + index * (stepWidth + gap);
    const complete = activeIndex > index || mission?.stage === "victory";
    const active = activeIndex === index && mission?.stage !== "victory" && mission?.stage !== "defeat";
    const fill = complete ? 0x244e31 : active ? 0x5f4b21 : 0x171916;
    const stroke = complete ? 0x8bd17b : active ? 0xf0df9a : 0x635b47;
    graphics.roundRect(stepX, y, stepWidth, 17, 4);
    graphics.fill({ color: fill, alpha: active ? 0.94 : 0.78 });
    graphics.roundRect(stepX, y, stepWidth, 17, 4);
    graphics.stroke({ width: 1, color: stroke, alpha: active ? 0.95 : 0.7 });
    addFixedDemoText(layer, `${complete ? "OK " : ""}${stage.label}`, stepX + stepWidth / 2, y + 3, 10, complete ? "#d8f0c8" : active ? "#fff0a8" : "#b6ad8f", 800, stepWidth - 8, 0.5);
  });
}

function fixedDemoStageProgressIndex(stage: FixedDemoMissionSummary["stage"]): number {
  if (stage === "briefing" || stage === "economy") {
    return 0;
  }
  if (stage === "training") {
    return 1;
  }
  if (stage === "raid") {
    return 2;
  }
  return 3;
}

function drawFixedDemoMapButtons(layer: Container, graphics: Graphics, x: number, y: number, width: number, paused: boolean, gameSpeed: number, onMapCommand: (command: HudMapCommandId) => void): void {
  const gap = 6;
  const buttonHeight = 24;
  const wideButtonWidth = Math.floor((width - gap) / 2);
  drawFixedDemoButton(layer, graphics, x, y, wideButtonWidth, buttonHeight, "Restart", false, () => onMapCommand("restart-map"));
  drawFixedDemoButton(layer, graphics, x + wideButtonWidth + gap, y, width - wideButtonWidth - gap, buttonHeight, paused ? "Run" : "Pause", false, () => onMapCommand("toggle-pause"));
  addFixedDemoText(layer, `Speed ${gameSpeed.toFixed(gameSpeed % 1 === 0 ? 0 : 1)}x`, x, y + 35, 11, paused ? "#ffb0a0" : "#a6f0a5", 700, width - 80);
  drawFixedDemoButton(layer, graphics, x + width - 68, y + 30, 30, buttonHeight, "+", false, () => onMapCommand("faster-game"));
  drawFixedDemoButton(layer, graphics, x + width - 32, y + 30, 32, buttonHeight, "-", false, () => onMapCommand("slower-game"));
}

function drawFixedDemoSelectedPanel(layer: Container, graphics: Graphics, x: number, y: number, width: number, height: number, manifest: WargusManifest, world: WorldState, selectedUnits: WorldState["units"], selected: WorldState["units"][number] | null, selectedFromHover: boolean, selectedIsOwned: boolean, iconAtlas: IconTextureAtlas | null, statusDecorationAtlas: StatusDecorationAtlas | null, onSelectedUnitPick: (unitId: string, additive: boolean) => void, onProductionQueuePick: (buildingId: string, item: { kind: "production"; index: number } | { kind: "research" }) => void): void {
  drawFixedDemoPanel(graphics, x, y, width, height, 0.72);
  const title = selectedUnits.length > 1 ? `${selectedUnits.length} units selected` : selectedFromHover && selected ? selected.name : selected ? selected.name : "No unit selected";
  addFixedDemoText(layer, title, x + 14, y + 10, 16, "#f0df9a", 800, width - 28);
  if (!selected) {
    addFixedDemoText(layer, "Drag-select units or click a building.", x + 14, y + 40, 13, "#d8d3bd", 600, width - 28);
    return;
  }

  const definition = manifest.units.find((unit) => unit.id === selected.typeId);
  const texture = iconAtlas ? getIconTexture(iconAtlas, definition?.icon) : null;
  const portraitX = x + 14;
  const portraitY = y + 38;
  const portraitWidth = 76;
  const portraitHeight = 68;
  drawFixedDemoPortraitFrame(layer, graphics, portraitX, portraitY, portraitWidth, portraitHeight, texture, selected.hitPoints <= 0);
  const detailsX = portraitX + portraitWidth + 14;
  const detailsWidth = Math.max(130, width - (detailsX - x) - 14);
  const type = unitTypeName(manifest, selected.typeId);
  const owner = selected.player === world.visibilityPlayer ? "Your unit" : selected.player === 15 ? "Neutral" : "Enemy";
  addFixedDemoText(layer, `${type}`, detailsX, y + 38, 14, selectedIsOwned ? "#fff0a8" : "#ffb8a8", 800, detailsWidth);
  addFixedDemoText(layer, owner, detailsX, y + 56, 11, "#d8d3bd", 650, detailsWidth);
  drawFixedDemoBar(graphics, detailsX, y + 75, detailsWidth, 11, selected.maxHitPoints > 0 ? selected.hitPoints / selected.maxHitPoints : 0, healthColor(selected.hitPoints, selected.maxHitPoints));
  addFixedDemoText(layer, `HP ${Math.ceil(selected.hitPoints)}/${selected.maxHitPoints}`, detailsX, y + 90, 11, "#e8e2c4", 700, detailsWidth * 0.5);
  if (selected.maxMana > 0) {
    drawFixedDemoBar(graphics, detailsX, y + 108, detailsWidth, 8, selected.mana / selected.maxMana, 0x4f8edb);
    addFixedDemoText(layer, `Mana ${Math.floor(selected.mana)}/${selected.maxMana}`, detailsX, y + 119, 10, "#b8d8ff", 650, detailsWidth);
  }
  const statY = selected.maxMana > 0 ? y + 135 : y + 108;
  drawFixedDemoSelectedStats(layer, selected, detailsX, statY, detailsWidth);

  const resourceLine = selectedResourceLine(selected, world);
  if (resourceLine) {
    addFixedDemoText(layer, resourceLine, portraitX, y + 113, 11, "#f0df9a", 700, portraitWidth + 8);
  }
  const orderLine = selectedOrderLine(selected, world, manifest);
  if (orderLine) {
    addFixedDemoText(layer, orderLine, x + 14, y + height - 23, 12, "#d8d3bd", 650, width - 28);
  }

  const activeProduction = selectedIsOwned ? selected.productionQueue[0] : null;
  if (activeProduction) {
    const label = unitTypeName(manifest, activeProduction.unitTypeId);
    const queueY = y + height - 42;
    addFixedDemoText(layer, `Training ${label}`, x + 14, queueY - 2, 12, "#fff0a8", 700, Math.max(92, width - 150));
    drawFixedDemoBar(graphics, x + Math.max(132, width * 0.42), queueY + 3, Math.max(80, width - Math.max(150, width * 0.42)), 8, 1 - activeProduction.remainingSeconds / activeProduction.totalSeconds, sourceCompletedBarColor(world));
    const hit = new Graphics();
    hit.rect(x + 10, queueY - 8, width - 20, 24);
    hit.fill({ color: 0xffffff, alpha: 0.001 });
    hit.eventMode = "static";
    hit.cursor = "pointer";
    hit.on("pointertap", () => onProductionQueuePick(selected.id, { kind: "production", index: 0 }));
    layer.addChild(hit);
  }

  if (selectedUnits.length > 1) {
    drawFixedDemoMultiSelectStrip(layer, graphics, x + 14, y + height - 50, Math.min(width - 28, 330), manifest, selected, selectedUnits, iconAtlas, onSelectedUnitPick);
  }
  void statusDecorationAtlas;
}

function drawFixedDemoPortraitFrame(layer: Container, graphics: Graphics, x: number, y: number, width: number, height: number, texture: ReturnType<typeof getIconTexture>, dimmed: boolean): void {
  graphics.rect(x - 4, y - 4, width + 8, height + 8);
  graphics.fill({ color: 0x070503, alpha: 0.96 });
  graphics.rect(x - 4, y - 4, width + 8, height + 8);
  graphics.stroke({ width: 2, color: 0xd8c77a, alpha: 0.75 });
  graphics.rect(x, y, width, height);
  graphics.fill({ color: 0x15120b, alpha: 1 });
  if (texture) {
    const icon = new Sprite(texture);
    icon.x = x + 8;
    icon.y = y + 6;
    icon.width = width - 16;
    icon.height = height - 14;
    icon.alpha = dimmed ? 0.45 : 1;
    layer.addChild(icon);
  }
}

function drawFixedDemoSelectedStats(layer: Container, selected: WorldState["units"][number], x: number, y: number, width: number): void {
  const damage = Math.max(0, selected.basicDamage + selected.piercingDamage);
  const armor = Math.max(0, selected.armor);
  const range = Math.max(0, selected.attackRange);
  const stats = [
    selected.canAttack ? `Damage ${damage}` : selected.gatherResources.length > 0 ? "Worker" : selected.kind === "building" || selected.mainFacility || selected.storesResources.length > 0 ? "Building" : "",
    armor > 0 ? `Armor ${armor}` : "",
    range > 0 ? `Range ${range}` : "",
    selected.resourcesHeld > 0 && selected.carriedResource ? `${selected.carriedResource} ${selected.resourcesHeld}` : ""
  ].filter(Boolean);
  addFixedDemoText(layer, stats.join("  "), x, y, 11, "#d8d3bd", 650, width);
}

function drawFixedDemoMultiSelectStrip(layer: Container, graphics: Graphics, x: number, y: number, width: number, manifest: WargusManifest, selected: WorldState["units"][number], selectedUnits: WorldState["units"], iconAtlas: IconTextureAtlas | null, onSelectedUnitPick: (unitId: string, additive: boolean) => void): void {
  const cell = 30;
  const gap = 6;
  const maxCells = Math.max(1, Math.floor(width / (cell + gap)));
  selectedUnits.slice(0, maxCells).forEach((unit, index) => {
      const cellX = x + index * (cell + gap);
      const cellY = y;
      graphics.rect(cellX, cellY, cell, cell);
      graphics.fill({ color: 0x1f281d, alpha: 0.9 });
      graphics.rect(cellX, cellY, cell, cell);
      graphics.stroke({ width: unit.id === selected.id ? 2 : 1, color: unit.id === selected.id ? 0xf0df9a : 0x8b8f6d, alpha: 0.9 });
      const unitIcon = iconAtlas ? getIconTexture(iconAtlas, manifest.units.find((candidate) => candidate.id === unit.typeId)?.icon) : null;
      if (unitIcon) {
        const icon = new Sprite(unitIcon);
        icon.x = cellX + 3;
        icon.y = cellY + 3;
        icon.width = cell - 6;
        icon.height = 20;
        layer.addChild(icon);
      }
      drawFixedDemoBar(graphics, cellX + 3, cellY + cell - 5, cell - 6, 3, unit.maxHitPoints > 0 ? unit.hitPoints / unit.maxHitPoints : 0, healthColor(unit.hitPoints, unit.maxHitPoints));
      const hit = new Graphics();
      hit.rect(cellX, cellY, cell, cell);
      hit.fill({ color: 0xffffff, alpha: 0.001 });
      hit.eventMode = "static";
      hit.cursor = "pointer";
      hit.on("pointertap", (event) => {
        const nativeEvent = event.nativeEvent;
        onSelectedUnitPick(unit.id, nativeEvent instanceof PointerEvent && nativeEvent.shiftKey);
      });
      layer.addChild(hit);
    });
  if (selectedUnits.length > maxCells) {
    addFixedDemoText(layer, `+${selectedUnits.length - maxCells}`, x + maxCells * (cell + gap), y + 8, 11, "#d8d3bd", 800);
  }
}

function drawFixedDemoCommandPanel(layer: Container, graphics: Graphics, x: number, y: number, width: number, height: number, manifest: WargusManifest, world: WorldState, selectedUnits: WorldState["units"], iconAtlas: IconTextureAtlas | null, commandPage: number, onCommand: (command: HudCommandId, input?: { ctrlKey?: boolean; shiftKey?: boolean }) => void): void {
  drawFixedDemoPanel(graphics, x, y, width, height, 0.74);
  addFixedDemoText(layer, "Commands", x + 14, y + 10, 16, "#f0df9a", 800);
  const commands = dedupeFixedDemoCommands(availableCommands(manifest, world, selectedUnits, commandPage)).slice(0, 9);
  if (commands.length === 0) {
    addFixedDemoText(layer, "Select a worker, soldier, or building.", x + 14, y + 42, 13, "#d8d3bd", 600, width - 28);
    return;
  }
  const columns = 3;
  const gap = 8;
  const buttonWidth = Math.floor((width - 28 - gap * (columns - 1)) / columns);
  const buttonHeight = 38;
  commands.forEach((command, index) => {
    const bx = x + 14 + (index % columns) * (buttonWidth + gap);
    const by = y + 40 + Math.floor(index / columns) * (buttonHeight + gap);
    drawFixedDemoCommandButton(layer, graphics, bx, by, buttonWidth, buttonHeight, command, iconAtlas, onCommand);
  });
}

function dedupeFixedDemoCommands(commands: HudCommand[]): HudCommand[] {
  const seen = new Set<string>();
  return commands.filter((command) => {
    const key = `${command.key}:${command.label}`.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function drawFixedDemoCommandButton(layer: Container, graphics: Graphics, x: number, y: number, width: number, height: number, command: HudCommand, iconAtlas: IconTextureAtlas | null, onCommand: (command: HudCommandId, input?: { ctrlKey?: boolean; shiftKey?: boolean }) => void): void {
  const disabled = command.disabled === true;
  drawFixedDemoButton(layer, graphics, x, y, width, height, "", disabled, (event) => {
    const nativeEvent = event.nativeEvent;
    onCommand(command.id, {
      ctrlKey: nativeEvent instanceof PointerEvent && nativeEvent.ctrlKey,
      shiftKey: nativeEvent instanceof PointerEvent && nativeEvent.shiftKey
    });
  });
  const texture = iconAtlas ? getIconTexture(iconAtlas, command.icon) : null;
  if (texture) {
    const icon = new Sprite(texture);
    icon.x = x + 6;
    icon.y = y + 6;
    icon.width = 28;
    icon.height = 24;
    icon.alpha = disabled ? 0.45 : 1;
    layer.addChild(icon);
  }
  const key = command.key ? `${command.key} ` : "";
  addFixedDemoText(layer, `${key}${command.label}`, x + (texture ? 39 : 8), y + 9, 12, disabled ? "#8f876d" : "#f6e8a8", 800, width - (texture ? 44 : 16));
}

function drawFixedDemoButton(layer: Container, graphics: Graphics, x: number, y: number, width: number, height: number, label: string, disabled: boolean, onTap: (event: FederatedPointerEvent) => void): void {
  graphics.roundRect(x, y, width, height, 5);
  graphics.fill({ color: disabled ? 0x20231d : 0x26341f, alpha: disabled ? 0.76 : 0.92 });
  graphics.roundRect(x, y, width, height, 5);
  graphics.stroke({ width: 1, color: disabled ? 0x5b5b4a : 0xe4d27c, alpha: disabled ? 0.48 : 0.78 });
  if (label) {
    addFixedDemoText(layer, label, x + width / 2, y + 6, 12, disabled ? "#8f876d" : "#f6e8a8", 800, width - 8, 0.5);
  }
  const hit = new Graphics();
  hit.rect(x, y, width, height);
  hit.fill({ color: 0xffffff, alpha: 0.001 });
  if (!disabled) {
    hit.eventMode = "static";
    hit.cursor = "pointer";
    hit.on("pointertap", onTap);
  }
  layer.addChild(hit);
}

function drawFixedDemoBar(graphics: Graphics, x: number, y: number, width: number, height: number, ratio: number, color: number): void {
  graphics.rect(x, y, width, height);
  graphics.fill({ color: 0x050604, alpha: 0.9 });
  graphics.rect(x, y, width, height);
  graphics.stroke({ width: 1, color: 0x151b13, alpha: 1 });
  graphics.rect(x + 1, y + 1, Math.max(0, Math.min(1, ratio)) * Math.max(0, width - 2), Math.max(0, height - 2));
  graphics.fill(color);
}

function addFixedDemoText(layer: Container, text: string, x: number, y: number, fontSize: number, fill: string, fontWeight: number, maxWidth?: number, anchorX = 0): Text {
  const display = new Text({
    text,
    style: {
      fill,
      fontFamily: "system-ui, sans-serif",
      fontSize,
      fontWeight: fontWeight >= 700 ? "bold" : "normal",
      lineHeight: Math.round(fontSize * 1.22),
      wordWrap: Boolean(maxWidth),
      wordWrapWidth: maxWidth
    }
  });
  display.anchor.set(anchorX, 0);
  display.x = x;
  display.y = y;
  display.resolution = 1.4;
  layer.addChild(display);
  return display;
}

function drawSourceMenuButtons(layer: Container, graphics: Graphics, sourceButtonStyleAtlas: SourceButtonStyleAtlas | null, bitmapFonts: WargusBitmapFontAtlas | null, manifest: WargusManifest, world: WorldState, race: string | null | undefined, onMapCommand: (command: HudMapCommandId) => void): void {
  const group = sourceMenuButtonGroup(world, race);
  if (!group?.menu) {
    return;
  }
  drawSourceMenuButton(layer, graphics, sourceButtonStyleAtlas, bitmapFonts, manifest, world, group.menu, "menu", sourceMenuButtonCommand(group.menu, "main-menu"), onMapCommand);
  if (world.engineSettings.networkGameDefault && group.networkMenu) {
    drawSourceMenuButton(layer, graphics, sourceButtonStyleAtlas, bitmapFonts, manifest, world, group.networkMenu, "networkMenu", sourceMenuButtonCommand(group.networkMenu, "main-menu"), onMapCommand);
  }
  if (world.engineSettings.networkGameDefault && group.networkDiplomacy) {
    drawSourceMenuButton(layer, graphics, sourceButtonStyleAtlas, bitmapFonts, manifest, world, group.networkDiplomacy, "networkDiplomacy", sourceMenuButtonCommand(group.networkDiplomacy, "diplomacy"), onMapCommand);
  }
}

function sourceMenuButtonCommand(button: WargusMenuButtonLayout, fallback: HudMapCommandId): HudMapCommandId {
  if (button.callback === "game-menu") {
    return "main-menu";
  }
  if (button.callback === "diplomacy-menu") {
    return "diplomacy";
  }
  return fallback;
}

function drawSourceMenuButton(layer: Container, graphics: Graphics, sourceButtonStyleAtlas: SourceButtonStyleAtlas | null, bitmapFonts: WargusBitmapFontAtlas | null, manifest: WargusManifest, world: WorldState, button: WargusMenuButtonLayout, slot: SourceMenuButtonSlot, command: HudMapCommandId, onMapCommand: (command: HudMapCommandId) => void): void {
  const style = world.engineSettings.buttonStyles[button.style] ?? null;
  const width = sourceMenuButtonWidth(button, style, slot);
  const height = sourceMenuButtonHeight(button, style, slot);
  const palette = sourceMenuButtonPalette(manifest, button.style, style);
  const sourceTexture = getSourceButtonStyleTexture(sourceButtonStyleAtlas, style, "default");
  graphics.rect(button.x, button.y, width, height);
  graphics.fill(palette.fill);
  if (sourceTexture) {
    const sprite = new Sprite(sourceTexture);
    sprite.x = button.x;
    sprite.y = button.y;
    sprite.width = width;
    sprite.height = height;
    layer.addChild(sprite);
  } else {
    graphics.rect(button.x, button.y, width, height);
    graphics.stroke({ width: 1, color: palette.stroke, alpha: 1 });
  }

  addHudText(layer, bitmapFonts, {
    text: button.text,
    fontId: style?.font ?? "game",
    color: colorNumberFromCss(palette.text, 0xf0df9a),
    x: button.x + sourceMenuTextX(width, style),
    y: button.y + sourceMenuTextY(style),
    anchorX: sourceMenuTextAnchor(style),
    fallbackStyle: {
      fill: palette.text,
      fontSize: sourceMenuButtonFontSize(style),
      fontFamily: "system-ui, sans-serif",
      fontWeight: "700"
    }
  });

  const hit = new Graphics();
  hit.rect(button.x, button.y, width, height);
  hit.fill({ color: 0xffffff, alpha: 0.001 });
  hit.eventMode = "static";
  hit.cursor = "pointer";
  hit.on("pointertap", () => onMapCommand(command));
  layer.addChild(hit);
}

function drawHudMessages(layer: Container, app: Application, sideWidth: number, manifest: WargusManifest, world: WorldState, messages: HudMessage[], bitmapFonts: WargusBitmapFontAtlas | null): void {
  if (!world.engineSettings.showMessagesDefault || messages.length === 0 || world.matchState.status !== "playing") {
    return;
  }
  const now = performance.now();
  const visible = messages
    .filter((message) => message.expiresAt > now)
    .slice(-5);
  if (visible.length === 0) {
    return;
  }
  const statusLine = sourceStatusLineLayout(app.screen, sideWidth, world.engineSettings.statusLine);
  const mapArea = world.engineSettings.mapArea;
  const x = Math.max(12, Math.floor((mapArea?.x ?? sideWidth) + 12));
  const y = Math.max(18, Math.floor((mapArea?.y ?? 0) + 14));
  const width = Math.max(220, Math.min(statusLine.width, app.screen.width - x - 18));
  const messageUi = world.engineSettings.messageUi;
  const lineHeight = sourceMessageLineHeight(statusLine.lineHeight, messageUi);
  const visibleRace = world.players.find((player) => player.id === world.visibilityPlayer)?.race === "orc" ? "orc" : "human";
  const messageColor = sourceTextColorNumber(manifest, visibleRace, "normal", 0xf0df9a);
  const messagePaletteId = sourceTextPaletteId(manifest, visibleRace, "normal");
  const messageCssColor = sourceTextColorCss(manifest, visibleRace, "normal", "#f0df9a");
  const panelHeight = visible.length * lineHeight + 10;

  const panel = new Graphics();
  panel.rect(x - 6, y - 4, width + 12, panelHeight);
  panel.fill({ color: 0x050403, alpha: 0.52 });
  layer.addChild(panel);

  visible.forEach((message, index) => {
    const life = Math.max(1, message.expiresAt - message.createdAt);
    const fade = Math.max(0.3, Math.min(1, (message.expiresAt - now) / Math.min(life, 900)));
    const text = bitmapFonts
      ? createWargusBitmapText(bitmapFonts, {
          text: message.text,
          fontId: messageUi?.font ?? world.engineSettings.statusLine?.font ?? "game",
          color: messageColor,
          paletteId: messagePaletteId,
          maxWidth: width,
          lineHeight
        })
      : new Text({
          text: message.text,
          style: {
            fill: messageCssColor,
            fontSize: 14,
            fontFamily: "system-ui, sans-serif",
            fontWeight: "700",
            wordWrap: true,
            wordWrapWidth: width
          }
        });
    if (!text) {
      return;
    }
    text.alpha = fade;
    text.x = x;
    text.y = y + index * lineHeight + sourceMessageScrollOffset(message, now, lineHeight, messageUi);
    layer.addChild(text);
  });
}

function drawSourceHudPanels(
  layer: Container,
  graphics: Graphics,
  panels: SourcePanelTextures | null,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  if (!panels) {
    return;
  }
  const info = new Sprite(panels.infoPanel);
  info.x = x;
  info.y = y;
  info.width = width;
  info.height = height;
  info.alpha = 0.72;
  layer.addChild(info);

  const top = new Sprite(panels.panel1);
  top.x = x;
  top.y = y;
  top.width = width;
  top.height = Math.min(height, Math.max(260, width * panels.panel1.height / panels.panel1.width));
  top.alpha = 0.82;
  layer.addChild(top);

  const bottom = new Sprite(panels.panel2);
  bottom.width = width;
  bottom.height = Math.min(height, Math.max(230, width * panels.panel2.height / panels.panel2.width));
  bottom.x = x;
  bottom.y = y + height - bottom.height;
  bottom.alpha = 0.82;
  layer.addChild(bottom);

  graphics.rect(x, y, width, height);
  graphics.fill({ color: 0x050403, alpha: 0.32 });
}

function drawSelectedUnitIcon(
  layer: Container,
  graphics: Graphics,
  x: number,
  y: number,
  width: number,
  manifest: WargusManifest,
  world: WorldState,
  selected: WorldState["units"][number] | null,
  iconAtlas: IconTextureAtlas | null
): void {
  if (!selected || !iconAtlas) {
    return;
  }
  const sourceSlot = sourceInfoPanelSlot(world.engineSettings.infoPanel, world.engineSettings.infoPanel?.singleSelected ?? null, x, y, width, 46);
  x = sourceSlot.x;
  y = sourceSlot.y;
  const iconSize = sourceSlot.size;
  const definition = manifest.units.find((unit) => unit.id === selected.typeId);
  const texture = getIconTexture(iconAtlas, definition?.icon);
  if (!texture) {
    return;
  }
  graphics.rect(x - 4, y - 4, iconSize + 8, iconSize + 4);
  graphics.fill(0x0d0a07);
  graphics.rect(x - 4, y - 4, iconSize + 8, iconSize + 4);
  graphics.stroke({ width: 1, color: 0x8b7346, alpha: 1 });
  const sprite = new Sprite(texture);
  sprite.x = x;
  sprite.y = y;
  sprite.width = iconSize;
  sprite.height = Math.round(iconSize * 38 / 46);
  layer.addChild(sprite);
}

function drawResourceStrip(
  layer: Container,
  graphics: Graphics,
  x: number,
  y: number,
  width: number,
  manifest: WargusManifest,
  world: WorldState,
  player: WorldState["players"][number] | undefined,
  supply: ReturnType<typeof getPlayerSupply> | null,
  iconAtlas: IconTextureAtlas | null,
  resourceUiAtlas: ResourceUiAtlas | null,
  bitmapFonts: WargusBitmapFontAtlas | null,
  onFreeWorkerPick: () => void
): void {
  graphics.rect(x, y, width, 28);
  graphics.fill(0x0d0a07);
  graphics.rect(x, y, width, 28);
  graphics.stroke({ width: 1, color: 0x4b3f2a, alpha: 1 });
  const human = player?.race !== "orc";
  const fallbackResources = [
    { key: "gold", icon: "icon-gold-mine", value: player?.resources.gold ?? 0 },
    { key: "wood", icon: human ? "icon-elven-lumber-mill" : "icon-troll-lumber-mill", value: player?.resources.wood ?? 0 },
    { key: "oil", icon: "icon-oil-patch", value: player?.resources.oil ?? 0 },
    { key: "food", icon: human ? "icon-farm" : "icon-pig-farm", value: supply ? `${supply.used + supply.queued}/${supply.cap}` : "0/0" }
  ];
  const sourceSlots = world.engineSettings.resourceUiSlots
    .filter((slot) => ["gold", "wood", "oil", "food", "score", "workers"].includes(slot.key) && !slot.hidden)
    .sort((a, b) => a.iconX - b.iconX || a.key.localeCompare(b.key));
  const resources = sourceSlots.length >= fallbackResources.length
    ? sourceSlots.map((slot) => ({
        key: slot.key,
        sourceSlot: slot,
        icon: fallbackResources.find((resource) => resource.key === slot.key)?.icon ?? null,
        value: sourceResourceCounterValue(world, player, supply, slot)
      }))
    : fallbackResources;
  const cellWidth = width / resources.length;
  resources.forEach((resource, index) => {
    const cellX = x + index * cellWidth;
    const sourceTexture = resourceUiAtlas && "sourceSlot" in resource ? getResourceUiTexture(resourceUiAtlas, resource.sourceSlot) : null;
    const texture = sourceTexture ?? (iconAtlas ? getIconTexture(iconAtlas, resource.icon) : null);
    if (texture) {
      const icon = new Sprite(texture);
      icon.x = cellX + 4;
      icon.y = y + 7;
      icon.width = sourceTexture ? 14 : 20;
      icon.height = sourceTexture ? 14 : 17;
      layer.addChild(icon);
    }
    const race = player?.race === "orc" ? "orc" : "human";
    addHudText(layer, bitmapFonts, {
      text: String(resource.value),
      fontId: "game",
      color: sourceTextColorNumber(manifest, race, "normal", 0xf0df9a),
      paletteId: sourceTextPaletteId(manifest, race, "normal"),
      x: cellX + 27,
      y: y + 6,
      fallbackStyle: { fill: sourceTextColorCss(manifest, race, "normal", "#f0df9a"), fontSize: 12, fontFamily: "system-ui, sans-serif", fontWeight: "700" }
    });
    if (resource.key === "workers" && Number(resource.value) > 0) {
      const hitArea = new Graphics();
      hitArea.rect(cellX, y, Math.max(24, cellWidth), 28);
      hitArea.fill({ color: 0x000000, alpha: 0.001 });
      hitArea.eventMode = "static";
      hitArea.cursor = "pointer";
      hitArea.on("pointertap", onFreeWorkerPick);
      layer.addChild(hitArea);
    }
  });
}

function resourceCounterValue(player: WorldState["players"][number] | undefined, resource: string): number {
  if (!player) {
    return 0;
  }
  return player.resources[resource as keyof typeof player.resources] ?? 0;
}

function sourceResourceCounterValue(
  world: WorldState,
  player: WorldState["players"][number] | undefined,
  supply: ReturnType<typeof getPlayerSupply> | null,
  slot: { key: string; resource: string }
): number | string {
  if (slot.key === "food" || slot.resource === "food") {
    return supply ? `${supply.used + supply.queued}/${supply.cap}` : "0/0";
  }
  if (slot.key === "score" || slot.resource === "score") {
    return player ? sourceResultScoreForPlayer(world, player) : 0;
  }
  if (slot.key === "workers" || slot.resource === "workers") {
    return sourceFreeWorkerCount(world, player?.id ?? world.visibilityPlayer);
  }
  return resourceCounterValue(player, slot.resource);
}

function drawSelectedUnitBars(
  layer: Container,
  graphics: Graphics,
  x: number,
  y: number,
  width: number,
  panelLeft: number,
  manifest: WargusManifest,
  world: WorldState,
  selected: WorldState["units"][number] | null,
  selectedIsOwned: boolean,
  statusDecorationAtlas: StatusDecorationAtlas | null,
  bitmapFonts: WargusBitmapFontAtlas | null
): void {
  if (!selected) {
    return;
  }
  if (drawSourcePanelSelectedBars(layer, graphics, panelLeft, manifest, world, selected, statusDecorationAtlas)) {
    return;
  }
  const completedBarColor = sourceCompletedBarColor(world);
  const completedBarShadow = sourceCompletedBarShadow(world);
  const selectedRace = world.players.find((player) => player.id === selected.player)?.race === "orc" ? "orc" : "human";
  const rows: Array<{ label: string; ratio: number; color: number; completed: boolean }> = [
    { label: "HP", ratio: selected.maxHitPoints > 0 ? selected.hitPoints / selected.maxHitPoints : 0, color: healthColor(selected.hitPoints, selected.maxHitPoints), completed: false }
  ];
  if (selectedIsOwned && selected.maxMana > 0) {
    rows.push({ label: "MP", ratio: selected.mana / selected.maxMana, color: 0x4f8edb, completed: false });
  }
  const activeProduction = selectedIsOwned ? selected.productionQueue[0] : undefined;
  if (activeProduction) {
    rows.push({ label: "Q", ratio: 1 - activeProduction.remainingSeconds / activeProduction.totalSeconds, color: completedBarColor, completed: true });
  }
  const activeResearch = selectedIsOwned ? world.activeResearch.find((research) => research.buildingId === selected.id) : undefined;
  if (activeResearch) {
    rows.push({ label: "R", ratio: 1 - activeResearch.remainingSeconds / activeResearch.totalSeconds, color: completedBarColor, completed: true });
  }
  if (selectedIsOwned && selected.construction) {
    rows.push({ label: "B", ratio: 1 - selected.construction.remainingSeconds / selected.construction.totalSeconds, color: completedBarColor, completed: true });
  }
  if (selectedIsOwned && selected.cargoCapacity > 0) {
    rows.push({ label: "C", ratio: selected.cargo.length / selected.cargoCapacity, color: 0x9fd6ff, completed: false });
  }

  rows.slice(0, 4).forEach((row, index) => {
    const rowY = y + index * 13;
    if (row.completed && completedBarShadow) {
      graphics.rect(x + 1, rowY + 1, width, 9);
      graphics.fill(0x211915);
    }
    graphics.rect(x, rowY, width, 9);
    graphics.fill(0x0d0a07);
    graphics.rect(x, rowY, width, 9);
    graphics.stroke({ width: 1, color: 0x4b3f2a, alpha: 0.9 });
    const sourceBarKind = row.label === "HP" ? "health" : row.label === "MP" ? "mana" : null;
    if (!sourceBarKind || !drawSourceHudBar(layer, statusDecorationAtlas, sourceBarKind, row.ratio, x + 1, rowY + 2, width - 2, 5)) {
      graphics.rect(x + 1, rowY + 1, Math.max(0, Math.min(1, row.ratio)) * (width - 2), 7);
      graphics.fill(row.color);
    }
    addHudText(layer, bitmapFonts, {
      text: row.label,
      fontId: "small",
      color: sourceTextColorNumber(manifest, selectedRace, "normal", 0xf0df9a),
      paletteId: sourceTextPaletteId(manifest, selectedRace, "normal"),
      x: x - 15,
      y: rowY,
      fallbackStyle: { fill: sourceTextColorCss(manifest, selectedRace, "normal", "#f0df9a"), fontSize: 8, fontFamily: "system-ui, sans-serif", fontWeight: "800" }
    });
  });
}

function drawSourcePanelSelectedBars(
  layer: Container,
  graphics: Graphics,
  panelLeft: number,
  manifest: WargusManifest,
  world: WorldState,
  selected: WorldState["units"][number],
  statusDecorationAtlas: StatusDecorationAtlas | null
): boolean {
  const bars = sourcePanelBarItems(manifest, world, selected);
  if (bars.length === 0) {
    return false;
  }
  const completedBarColor = sourceCompletedBarColor(world);
  const completedBarShadow = sourceCompletedBarShadow(world);
  for (const bar of bars) {
    const barX = panelLeft + bar.panelX + bar.x;
    const barY = bar.panelY + bar.y;
    const ratio = Math.max(0, Math.min(1, bar.ratio));
    if (bar.variable === "HitPoints") {
      graphics.rect(barX, barY, bar.width, bar.height);
      graphics.fill(0x0d0a07);
      if (!drawSourceHudBar(layer, statusDecorationAtlas, "health", ratio, barX, barY, bar.width, bar.height)) {
        graphics.rect(barX, barY, ratio * bar.width, bar.height);
        graphics.fill(healthColor(selected.hitPoints, selected.maxHitPoints));
      }
      continue;
    }
    if (bar.variable === "Mana") {
      graphics.rect(barX, barY, bar.width, bar.height);
      graphics.fill(0x0d0a07);
      if (!drawSourceHudBar(layer, statusDecorationAtlas, "mana", ratio, barX, barY, bar.width, bar.height)) {
        graphics.rect(barX, barY, ratio * bar.width, bar.height);
        graphics.fill(0x4f8edb);
      }
      continue;
    }
    drawSourceCompletionBar(graphics, barX, barY, bar.width, bar.height, ratio, completedBarColor, completedBarShadow);
  }
  return true;
}

function drawMultiSelectionPanel(
  layer: Container,
  graphics: Graphics,
  x: number,
  y: number,
  width: number,
  manifest: WargusManifest,
  world: WorldState,
  selectedUnits: WorldState["units"],
  iconAtlas: IconTextureAtlas | null,
  statusDecorationAtlas: StatusDecorationAtlas | null,
  bitmapFonts: WargusBitmapFontAtlas | null,
  onSelectedUnitPick: (unitId: string, additive: boolean) => void
): void {
  if (selectedUnits.length <= 1) {
    return;
  }
  const sourceLayout = sourceInfoPanelLayout(world.engineSettings.infoPanel, x, y, width);
  const sourceSlots = sourceLayout.selectedSlots;
  const visibleUnits = selectedUnits.slice(0, sourceSlots.length || 12);
  const columns = Math.max(3, Math.min(6, Math.floor(width / 38)));
  const cellSize = sourceLayout.buttonSize;
  const gap = 4;
  const rows = Math.ceil(visibleUnits.length / columns);
  const panelHeight = sourceSlots.length > 0 ? sourceLayout.height : rows * (cellSize + gap) + 18;
  graphics.rect(x, y, width, panelHeight);
  graphics.fill(0x0d0a07);
  graphics.rect(x, y, width, panelHeight);
  graphics.stroke({ width: 1, color: 0x4b3f2a, alpha: 1 });
  const visibleRace = world.players.find((player) => player.id === world.visibilityPlayer)?.race === "orc" ? "orc" : "human";
  addHudText(layer, bitmapFonts, {
    text: `${selectedUnits.length} selected`,
    fontId: world.engineSettings.infoPanel?.maxSelectedText?.font ?? "game",
    color: sourceTextColorNumber(manifest, visibleRace, "normal", 0xf0df9a),
    paletteId: sourceTextPaletteId(manifest, visibleRace, "normal"),
    x: x + 6,
    y: y + 3,
    fallbackStyle: { fill: sourceTextColorCss(manifest, visibleRace, "normal", "#f0df9a"), fontSize: 10, fontFamily: "system-ui, sans-serif", fontWeight: "800" }
  });
  visibleUnits.forEach((unit, index) => {
    const sourceSlot = sourceSlots[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cellX = sourceSlot ? sourceLayout.x + sourceSlot.x * sourceLayout.scale : x + 6 + column * (cellSize + gap);
    const cellY = sourceSlot ? sourceLayout.y + sourceSlot.y * sourceLayout.scale : y + 17 + row * (cellSize + gap);
    graphics.rect(cellX, cellY, cellSize, cellSize);
    graphics.fill(0x211910);
    graphics.rect(cellX, cellY, cellSize, cellSize);
    graphics.stroke({ width: 1, color: 0x8b7346, alpha: 0.88 });
    const definition = manifest.units.find((candidate) => candidate.id === unit.typeId);
    const texture = iconAtlas ? getIconTexture(iconAtlas, definition?.icon) : null;
    if (texture) {
      const icon = new Sprite(texture);
      icon.x = cellX + 3;
      icon.y = cellY + 3;
      icon.width = cellSize - 6;
      icon.height = 23;
      layer.addChild(icon);
    }
    const ratio = unit.maxHitPoints > 0 ? unit.hitPoints / unit.maxHitPoints : 0;
    graphics.rect(cellX + 3, cellY + cellSize - 6, cellSize - 6, 3);
    graphics.fill(0x0d0a07);
    if (!drawSourceHudBar(layer, statusDecorationAtlas, "health", ratio, cellX + 3, cellY + cellSize - 6, cellSize - 6, 3)) {
      graphics.rect(cellX + 3, cellY + cellSize - 6, Math.max(0, Math.min(1, ratio)) * (cellSize - 6), 3);
      graphics.fill(healthColor(unit.hitPoints, unit.maxHitPoints));
    }
    const hit = new Graphics();
    hit.rect(cellX, cellY, cellSize, cellSize);
    hit.fill({ color: 0xffffff, alpha: 0.001 });
    hit.eventMode = "static";
    hit.cursor = "pointer";
    hit.on("pointertap", (event) => {
      const nativeEvent = event.nativeEvent;
      onSelectedUnitPick(unit.id, nativeEvent instanceof PointerEvent && nativeEvent.shiftKey);
    });
    layer.addChild(hit);
  });
  if (selectedUnits.length > visibleUnits.length) {
    addHudText(layer, bitmapFonts, {
      text: `+${selectedUnits.length - visibleUnits.length}`,
      fontId: "game",
      color: 0xd8d3bd,
      x: x + width - 28,
      y: y + 3,
      fallbackStyle: { fill: "#d8d3bd", fontSize: 10, fontFamily: "system-ui, sans-serif", fontWeight: "800" }
    });
  }
}

function drawProductionQueuePanel(
  layer: Container,
  graphics: Graphics,
  x: number,
  y: number,
  width: number,
  manifest: WargusManifest,
  world: WorldState,
  selected: WorldState["units"][number] | null,
  iconAtlas: IconTextureAtlas | null,
  _statusDecorationAtlas: StatusDecorationAtlas | null,
  bitmapFonts: WargusBitmapFontAtlas | null,
  onProductionQueuePick: (buildingId: string, item: { kind: "production"; index: number } | { kind: "research" }) => void
): void {
  if (!selected) {
    return;
  }
  const research = world.activeResearch.find((candidate) => candidate.buildingId === selected.id) ?? null;
  if (selected.productionQueue.length === 0 && !research) {
    return;
  }
  const completedBarColor = sourceCompletedBarColor(world);
  const completedBarShadow = sourceCompletedBarShadow(world);

  const sourceLayout = sourceInfoPanelLayout(world.engineSettings.infoPanel, x, y, width);
  const sourceSlots = [
    ...sourceLayout.trainingSlots,
    ...(sourceLayout.researching ? [sourceLayout.researching] : [])
  ];
  const visibleProductionSlots = Math.max(1, sourceLayout.trainingSlots.length || 6);
  const cellSize = sourceLayout.buttonSize;
  const gap = 5;
  const items = [
    ...selected.productionQueue.slice(0, visibleProductionSlots).map((order, index) => {
      const unit = manifest.units.find((candidate) => candidate.id === order.unitTypeId);
      return {
        key: `train-${index}`,
        cancel: { kind: "production" as const, index },
        icon: unit?.icon ?? null,
        label: unit?.name ?? unitTypeName(manifest, order.unitTypeId),
        remainingSeconds: order.remainingSeconds,
        totalSeconds: order.totalSeconds,
        active: index === 0
      };
    }),
    ...(research
      ? [{
          key: "research",
          cancel: { kind: "research" as const },
          icon: manifest.upgrades.find((candidate) => candidate.id === research.upgradeId)?.icon ?? null,
          label: upgradeName(manifest, research.upgradeId),
          remainingSeconds: research.remainingSeconds,
          totalSeconds: research.totalSeconds,
          active: true
        }]
      : [])
  ];
  const columns = Math.max(3, Math.min(6, Math.floor((width - 12) / (cellSize + gap))));
  const rows = Math.ceil(items.length / columns);
  const panelHeight = sourceSlots.length > 0 ? sourceLayout.height : 24 + rows * (cellSize + 12);

  graphics.rect(x, y, width, panelHeight);
  graphics.fill(0x0d0a07);
  graphics.rect(x, y, width, panelHeight);
  graphics.stroke({ width: 1, color: 0x4b3f2a, alpha: 1 });

  const selectedRace = world.players.find((player) => player.id === selected.player)?.race === "orc" ? "orc" : "human";
  addHudText(layer, bitmapFonts, {
    text: "Queue",
    fontId: "game",
    color: sourceTextColorNumber(manifest, selectedRace, "normal", 0xf0df9a),
    paletteId: sourceTextPaletteId(manifest, selectedRace, "normal"),
    x: x + 6,
    y: y + 4,
    fallbackStyle: { fill: sourceTextColorCss(manifest, selectedRace, "normal", "#f0df9a"), fontSize: 10, fontFamily: "system-ui, sans-serif", fontWeight: "800" }
  });

  items.forEach((item, index) => {
    const sourceSlot = sourceSlots[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cellX = sourceSlot ? sourceLayout.x + sourceSlot.x * sourceLayout.scale : x + 6 + column * (cellSize + gap);
    const cellY = sourceSlot ? sourceLayout.y + sourceSlot.y * sourceLayout.scale : y + 20 + row * (cellSize + 12);
    graphics.rect(cellX, cellY, cellSize, cellSize);
    graphics.fill(item.active ? 0x2b2315 : 0x211910);
    graphics.rect(cellX, cellY, cellSize, cellSize);
    graphics.stroke({ width: 1, color: item.active ? 0xd6c36f : 0x8b7346, alpha: 0.9 });

    const texture = iconAtlas ? getIconTexture(iconAtlas, item.icon) : null;
    if (texture) {
      const icon = new Sprite(texture);
      icon.x = cellX + 3;
      icon.y = cellY + 3;
      icon.width = cellSize - 6;
      icon.height = 23;
      layer.addChild(icon);
    }

    const ratio = item.totalSeconds > 0 ? 1 - item.remainingSeconds / item.totalSeconds : 1;
    drawSourceCompletionBar(graphics, cellX + 3, cellY + cellSize - 6, cellSize - 6, 3, ratio, item.active ? completedBarColor : 0x8f876d, item.active && completedBarShadow);

    addHudText(layer, bitmapFonts, {
      text: item.remainingSeconds <= 0 ? "Ready" : `${Math.ceil(item.remainingSeconds)}s`,
      fontId: "small",
      color: sourceTextColorNumber(manifest, selectedRace, "normal", 0xf0df9a),
      paletteId: sourceTextPaletteId(manifest, selectedRace, "normal"),
      x: cellX + cellSize / 2,
      y: cellY + cellSize + 2,
      anchorX: 0.5,
      fallbackStyle: { fill: sourceTextColorCss(manifest, selectedRace, "normal", "#f0df9a"), fontSize: 8, fontFamily: "system-ui, sans-serif", fontWeight: "800", align: "center" }
    });
    const hit = new Graphics();
    hit.rect(cellX, cellY, cellSize, cellSize);
    hit.fill({ color: 0xffffff, alpha: 0.001 });
    hit.eventMode = "static";
    hit.cursor = "pointer";
    hit.on("pointertap", () => {
      onProductionQueuePick(selected.id, item.cancel);
    });
    layer.addChild(hit);
  });

  const activeItem = items.find((item) => item.active);
  if (activeItem) {
    addHudText(layer, bitmapFonts, {
      text: activeItem.label,
      fontId: "game",
      color: 0xd8d3bd,
      x: x + 46,
      y: y + 4,
      maxWidth: width - 58,
      lineHeight: 13,
      fallbackStyle: { fill: "#d8d3bd", fontSize: 10, fontFamily: "system-ui, sans-serif", wordWrap: true, wordWrapWidth: width - 58 }
    });
  }
}

function drawCargoPanel(
  layer: Container,
  graphics: Graphics,
  x: number,
  y: number,
  width: number,
  manifest: WargusManifest,
  world: WorldState,
  selected: WorldState["units"][number] | null,
  iconAtlas: IconTextureAtlas | null,
  statusDecorationAtlas: StatusDecorationAtlas | null,
  bitmapFonts: WargusBitmapFontAtlas | null,
  onCargoUnitPick: (transportId: string, cargoUnitId: string, queue: boolean) => void
): void {
  if (!selected || selected.cargo.length === 0) {
    return;
  }

  const sourceLayout = sourceInfoPanelLayout(world.engineSettings.infoPanel, x, y, width);
  const sourceSlots = sourceLayout.transportingSlots;
  const cellSize = sourceLayout.buttonSize;
  const gap = 5;
  const columns = Math.max(3, Math.min(6, Math.floor((width - 12) / (cellSize + gap))));
  const rows = Math.ceil(selected.cargo.length / columns);
  const panelHeight = sourceSlots.length > 0 ? Math.max(sourceLayout.height, 24 + rows * (cellSize + 6)) : 24 + rows * (cellSize + 6);

  graphics.rect(x, y, width, panelHeight);
  graphics.fill(0x0d0a07);
  graphics.rect(x, y, width, panelHeight);
  graphics.stroke({ width: 1, color: 0x4b3f2a, alpha: 1 });

  const selectedRace = world.players.find((player) => player.id === selected.player)?.race === "orc" ? "orc" : "human";
  addHudText(layer, bitmapFonts, {
    text: `Cargo ${selected.cargo.length}/${selected.cargoCapacity}`,
    fontId: "game",
    color: sourceTextColorNumber(manifest, selectedRace, "normal", 0xf0df9a),
    paletteId: sourceTextPaletteId(manifest, selectedRace, "normal"),
    x: x + 6,
    y: y + 4,
    fallbackStyle: { fill: sourceTextColorCss(manifest, selectedRace, "normal", "#f0df9a"), fontSize: 10, fontFamily: "system-ui, sans-serif", fontWeight: "800" }
  });

  selected.cargo.forEach((unit, index) => {
    const sourceSlot = sourceSlots[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cellX = sourceSlot ? sourceLayout.x + sourceSlot.x * sourceLayout.scale : x + 6 + column * (cellSize + gap);
    const cellY = sourceSlot ? sourceLayout.y + sourceSlot.y * sourceLayout.scale : y + 20 + row * (cellSize + 6);
    graphics.rect(cellX, cellY, cellSize, cellSize);
    graphics.fill(0x211910);
    graphics.rect(cellX, cellY, cellSize, cellSize);
    graphics.stroke({ width: 1, color: 0x8b7346, alpha: 0.9 });

    const definition = manifest.units.find((candidate) => candidate.id === unit.typeId);
    const texture = iconAtlas ? getIconTexture(iconAtlas, definition?.icon) : null;
    if (texture) {
      const icon = new Sprite(texture);
      icon.x = cellX + 3;
      icon.y = cellY + 3;
      icon.width = cellSize - 6;
      icon.height = 23;
      layer.addChild(icon);
    }

    const ratio = unit.maxHitPoints > 0 ? unit.hitPoints / unit.maxHitPoints : 0;
    graphics.rect(cellX + 3, cellY + cellSize - 6, cellSize - 6, 3);
    graphics.fill(0x0d0a07);
    if (!drawSourceHudBar(layer, statusDecorationAtlas, "health", ratio, cellX + 3, cellY + cellSize - 6, cellSize - 6, 3)) {
      graphics.rect(cellX + 3, cellY + cellSize - 6, Math.max(0, Math.min(1, ratio)) * (cellSize - 6), 3);
      graphics.fill(healthColor(unit.hitPoints, unit.maxHitPoints));
    }
    const hit = new Graphics();
    hit.rect(cellX, cellY, cellSize, cellSize);
    hit.fill({ color: 0xffffff, alpha: 0.001 });
    hit.eventMode = "static";
    hit.cursor = "pointer";
    hit.on("pointertap", (event) => {
      const nativeEvent = event.nativeEvent;
      onCargoUnitPick(selected.id, unit.id, nativeEvent instanceof PointerEvent && nativeEvent.shiftKey);
    });
    layer.addChild(hit);
  });
}

function drawSourceHudBar(
  layer: Container,
  atlas: StatusDecorationAtlas | null,
  kind: "health" | "mana",
  ratio: number,
  x: number,
  y: number,
  width: number,
  height: number
): boolean {
  if (!atlas) {
    return false;
  }
  const texture = getStatusBarTexture(atlas, kind, ratio);
  if (!texture) {
    return false;
  }
  const sprite = new Sprite(texture);
  sprite.x = x;
  sprite.y = y;
  sprite.width = width;
  sprite.height = height;
  layer.addChild(sprite);
  return true;
}

function drawSourceCompletionBar(graphics: Graphics, x: number, y: number, width: number, height: number, ratio: number, color: number, shadow: boolean): void {
  if (shadow) {
    graphics.rect(x + 1, y + 1, width, height);
    graphics.fill(0x211915);
  }
  graphics.rect(x, y, width, height);
  graphics.fill(0x0d0a07);
  graphics.rect(x, y, width * Math.max(0, Math.min(1, ratio)), height);
  graphics.fill(color);
}

interface HudTextOptions {
  text: string;
  fontId: string;
  color: number;
  paletteId?: string | null;
  paletteIndex?: number;
  x: number;
  y: number;
  anchorX?: number;
  maxWidth?: number;
  lineHeight?: number;
  fallbackStyle: Record<string, unknown>;
}

function addHudText(layer: Container, bitmapFonts: WargusBitmapFontAtlas | null, options: HudTextOptions): Container | Text {
  const text = createHudText(bitmapFonts, options);
  layer.addChild(text);
  return text;
}

function createHudText(bitmapFonts: WargusBitmapFontAtlas | null, options: HudTextOptions): Container | Text {
  if (bitmapFonts) {
    const bitmapText = createWargusBitmapText(bitmapFonts, {
      text: options.text,
      fontId: options.fontId,
      color: options.color,
      paletteId: options.paletteId,
      paletteIndex: options.paletteIndex,
      maxWidth: options.maxWidth,
      lineHeight: options.lineHeight
    });
    if (bitmapText) {
      bitmapText.x = options.x;
      bitmapText.y = options.y;
      bitmapText.pivot.x = bitmapText.width * (options.anchorX ?? 0);
      return bitmapText;
    }
  }
  const fallback = new Text({
    text: options.text,
    style: options.fallbackStyle
  });
  fallback.anchor.set(options.anchorX ?? 0, 0);
  fallback.x = options.x;
  fallback.y = options.y;
  return fallback;
}

function healthColor(hitPoints: number, maxHitPoints: number): number {
  const ratio = maxHitPoints > 0 ? hitPoints / maxHitPoints : 0;
  if (ratio < 0.3) {
    return 0xd95d45;
  }
  if (ratio < 0.6) {
    return 0xd6c36f;
  }
  return 0x4fb85a;
}

function drawMapPanel(
  layer: Container,
  graphics: Graphics,
  x: number,
  y: number,
  width: number,
  activeMap: WargusMap,
  manifest: WargusManifest,
  activeSaveSlot: number,
  activeSaveSummary: SavedGameSummary | null,
  autosaveSummary: SavedGameSummary | null,
  paused: boolean,
  gameSpeed: number,
  bitmapFonts: WargusBitmapFontAtlas | null,
  onMapCommand: (command: HudMapCommandId) => void
): void {
  graphics.rect(x, y, width, 86);
  graphics.fill(0x0d0a07);
  graphics.rect(x, y, width, 86);
  graphics.stroke({ width: 1, color: 0x4b3f2a, alpha: 1 });

  const setupMaps = manifest.maps.filter((map) => map.setupJson);
  const index = Math.max(0, setupMaps.findIndex((map) => map.path === activeMap.path));
  const label = addHudText(layer, bitmapFonts, {
    text: `${index + 1}/${setupMaps.length} ${activeMap.title === "(unnamed)" ? activeMap.path.split("/").at(-1) ?? activeMap.path : activeMap.title}`,
    fontId: "game",
    color: 0xd8d3bd,
    x: x + 8,
    y: y + 8,
    maxWidth: width - 16,
    fallbackStyle: { fill: "#d8d3bd", fontSize: 11, fontFamily: "system-ui, sans-serif", wordWrap: true, wordWrapWidth: width - 16 }
  });
  label.scale.set(bitmapFonts ? 0.64 : 1);

  const saveLabel = addHudText(layer, bitmapFonts, {
    text: activeSaveSummary ? `Slot ${activeSaveSlot}: ${sourceSaveTitle(activeSaveSummary)}` : `Slot ${activeSaveSlot}: empty`,
    fontId: "game",
    color: activeSaveSummary ? 0x8fdd9a : 0x8f876d,
    x: x + 8,
    y: y + 23,
    maxWidth: width - 16,
    fallbackStyle: { fill: activeSaveSummary ? "#8fdd9a" : "#8f876d", fontSize: 10, fontFamily: "system-ui, sans-serif", wordWrap: true, wordWrapWidth: width - 16 }
  });
  saveLabel.scale.set(bitmapFonts ? 0.58 : 1);

  const buttons: Array<{ id: HudMapCommandId; label: string }> = [
    { id: "previous-map", label: "<" },
    { id: "restart-map", label: "Restart" },
    { id: "next-map", label: ">" },
    { id: "choose-map", label: "Map" },
    { id: "next-save-slot", label: `Slot ${activeSaveSlot}` },
    { id: "save-game", label: "Save" },
    { id: "load-game", label: "Load" },
    { id: "export-save", label: "Ex" },
    { id: "import-save", label: "Im" },
    { id: "load-autosave", label: "Auto" },
    { id: "slower-game", label: "-" },
    { id: "toggle-pause", label: paused ? "Run" : "Pause" },
    { id: "faster-game", label: "+" }
  ];
  const buttonWidths = [22, 50, 22, 34, 48, 34, 34, 26, 26, 34, 22, 44, 22];
  let cursor = x + 8;
  for (let index = 0; index < buttons.length; index += 1) {
    const button = buttons[index];
    const buttonWidth = buttonWidths[index];
    if (index === 7) {
      cursor = x + 8;
    }
    const by = index < 7 ? y + 38 : y + 62;
    graphics.rect(cursor, by, buttonWidth, 20);
    graphics.fill(0x2a2118);
    graphics.rect(cursor, by, buttonWidth, 20);
    graphics.stroke({ width: 1, color: 0x8b7346, alpha: 1 });
    const text = addHudText(layer, bitmapFonts, {
      text: button.label,
      fontId: "game",
      color: sourceTextColorNumber(manifest, "human", "normal", 0xf0df9a),
      paletteId: sourceTextPaletteId(manifest, "human", "normal"),
      x: cursor + buttonWidth / 2,
      y: by + 5,
      anchorX: 0.5,
      fallbackStyle: { fill: sourceTextColorCss(manifest, "human", "normal", "#f0df9a"), fontSize: 11, fontFamily: "system-ui, sans-serif", fontWeight: "700" }
    });
    text.scale.set(bitmapFonts ? 0.58 : 1);
    const hit = new Graphics();
    hit.rect(cursor, by, buttonWidth, 20);
    hit.fill({ color: 0xffffff, alpha: 0.001 });
    hit.eventMode = "static";
    hit.cursor = "pointer";
    hit.on("pointertap", () => onMapCommand(button.id));
    layer.addChild(hit);
    cursor += buttonWidth + 5;
  }

  const speed = addHudText(layer, bitmapFonts, {
    text: autosaveSummary ? `Auto ${sourceShortTime(autosaveSummary.savedAt)}` : paused ? "Paused" : `Speed ${gameSpeed.toFixed(gameSpeed % 1 === 0 ? 0 : 1)}x`,
    fontId: "game",
    color: autosaveSummary ? 0xc9a95b : paused ? 0xd95d45 : 0x8fdd9a,
    x: x + width - 84,
    y: y + 23,
    fallbackStyle: { fill: autosaveSummary ? "#c9a95b" : paused ? "#d95d45" : "#8fdd9a", fontSize: 10, fontFamily: "system-ui, sans-serif", fontWeight: "700" }
  });
  speed.scale.set(bitmapFonts ? 0.58 : 1);
}

function drawSourceMenuOverlay(
  app: Application,
  layer: Container,
  manifest: WargusManifest,
  world: WorldState,
  menu: HudMenuOverlayId | null,
  paused: boolean,
  gameSpeed: number,
  activeSaveSlot: number,
  activeSaveSummary: SavedGameSummary | null,
  autosaveSummary: SavedGameSummary | null,
  diplomacyDraft: SourceDiplomacyDraft | null,
  bitmapFonts: WargusBitmapFontAtlas | null,
  onMapCommand: (command: HudMapCommandId) => void
): void {
  if (!menu || world.matchState.status !== "playing") {
    return;
  }
  const localPlayer = world.players.find((player) => player.id === world.visibilityPlayer);
  const race = localPlayer?.race === "orc" ? "orc" : "human";
  const overlay = new Graphics();
  overlay.rect(0, 0, app.screen.width, app.screen.height);
  overlay.fill({ color: 0x050708, alpha: 0.5 });
  layer.addChild(overlay);

  const width = Math.min(460, Math.max(300, app.screen.width - 40));
  const x = (app.screen.width - width) / 2;
  const panelHeight = 362;
  const y = Math.max(32, (app.screen.height - panelHeight) / 2);
  const panel = new Graphics();
  panel.rect(x, y, width, panelHeight);
  panel.fill(0x120d08);
  panel.rect(x + 4, y + 4, width - 8, panelHeight - 8);
  panel.stroke({ width: 2, color: 0x8b7346, alpha: 1 });
  layer.addChild(panel);

  const title = addHudText(layer, bitmapFonts, {
    text: sourceMenuOverlayTitle(menu),
    fontId: "large",
    color: sourceTextColorNumber(manifest, race, "normal", 0xf0df9a),
    paletteId: sourceTextPaletteId(manifest, race, "normal"),
    x: x + width / 2,
    y: y + 24,
    anchorX: 0.5,
    fallbackStyle: { fill: sourceTextColorCss(manifest, race, "normal", "#f0df9a"), fontSize: 24, fontFamily: "system-ui, sans-serif", fontWeight: "800" }
  });
  title.scale.set(bitmapFonts ? 0.9 : 1);

  const body = addHudText(layer, bitmapFonts, {
    text: sourceMenuOverlayLines(menu, world, manifest, paused, gameSpeed, activeSaveSlot, activeSaveSummary, autosaveSummary, diplomacyDraft).join("\n"),
    fontId: "game",
    color: 0xd8d3bd,
    x: x + 34,
    y: y + 74,
    maxWidth: width - 68,
    lineHeight: menu === "keystroke-help" ? 14 : 22,
    fallbackStyle: { fill: "#d8d3bd", fontSize: menu === "keystroke-help" ? 11 : 14, fontFamily: "system-ui, sans-serif", lineHeight: menu === "keystroke-help" ? 14 : 21, wordWrap: true, wordWrapWidth: width - 68 }
  });
  body.scale.set(bitmapFonts ? menu === "keystroke-help" ? 0.5 : 0.7 : 1);

  const buttons = sourceMenuOverlayButtons(menu, world, diplomacyDraft);
  const buttonWidth = Math.min(132, Math.max(92, (width - 92) / 3));
  const gap = 16;
  const columns = Math.min(3, Math.max(1, buttons.length));
  const totalWidth = columns * buttonWidth + Math.max(0, columns - 1) * gap;
  const startX = x + (width - totalWidth) / 2;
  const rowGap = buttons.length > 12 ? 34 : 40;
  const startY = y + (buttons.length > 12 ? 210 : buttons.length > 3 ? 236 : 256);
  for (let index = 0; index < buttons.length; index += 1) {
    const button = buttons[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    drawBriefingButton(layer, startX + column * (buttonWidth + gap), startY + row * rowGap, buttonWidth, 34, button.label, manifest, race, bitmapFonts, () => {
      if (!button.disabled) {
        onMapCommand(button.command as HudMapCommandId);
      }
    }, button.disabled);
  }
}

function drawMapPicker(app: Application, layer: Container, manifest: WargusManifest, picker: RenderHudArgs["mapPicker"], completedCampaignMissions: string[], bitmapFonts: WargusBitmapFontAtlas | null, onMapPick: (map: WargusMap) => void): void {
  if (!picker.open) {
    return;
  }
  const overlay = new Graphics();
  overlay.rect(0, 0, app.screen.width, app.screen.height);
  overlay.fill({ color: 0x050708, alpha: 0.72 });
  layer.addChild(overlay);

  const width = Math.min(680, app.screen.width - 48);
  const height = Math.min(520, app.screen.height - 48);
  const x = (app.screen.width - width) / 2;
  const y = (app.screen.height - height) / 2;
  overlay.rect(x, y, width, height);
  overlay.fill(0x16120d);
  overlay.rect(x, y, width, height);
  overlay.stroke({ width: 2, color: 0x8b7346, alpha: 1 });

  const title = addHudText(layer, bitmapFonts, {
    text: "Load Map",
    fontId: "large",
    color: sourceTextColorNumber(manifest, "human", "normal", 0xf0df9a),
    paletteId: sourceTextPaletteId(manifest, "human", "normal"),
    x: x + 18,
    y: y + 14,
    fallbackStyle: { fill: sourceTextColorCss(manifest, "human", "normal", "#f0df9a"), fontSize: 20, fontFamily: "system-ui, sans-serif", fontWeight: "700" }
  });
  title.scale.set(bitmapFonts ? 0.78 : 1);

  const query = addHudText(layer, bitmapFonts, {
    text: picker.query ? `Search: ${picker.query}` : "Search: type map name or number",
    fontId: "game",
    color: picker.query ? 0xd8d3bd : 0x8f876d,
    x: x + 18,
    y: y + 48,
    fallbackStyle: { fill: picker.query ? "#d8d3bd" : "#8f876d", fontSize: 14, fontFamily: "system-ui, sans-serif" }
  });
  query.scale.set(bitmapFonts ? 0.74 : 1);

  const matches = sourceFilteredPickerMaps(picker).slice(0, 10);
  matches.forEach((map, index) => {
    const rowY = y + 84 + index * 39;
    overlay.rect(x + 14, rowY, width - 28, 34);
    overlay.fill(index % 2 === 0 ? 0x211910 : 0x1a140e);
    overlay.rect(x + 14, rowY, width - 28, 34);
    overlay.stroke({ width: 1, color: 0x3f3324, alpha: 1 });
    const mapIndex = picker.maps.findIndex((candidate) => candidate.path === map.path) + 1;
    const titleText = map.title === "(unnamed)" ? map.path.split("/").at(-1) ?? map.path : map.title;
    const campaign = sourceCampaignLabelForMap(map);
    const completed = sourceCampaignMissionComplete(map, completedCampaignMissions);
    const text = addHudText(layer, bitmapFonts, {
      text: `${mapIndex}. ${completed ? "Done - " : ""}${campaign ? `${campaign} - ` : ""}${titleText}  ${map.width}x${map.height}, ${map.players}p`,
      fontId: "game",
      color: completed ? 0x8fdd9a : 0xd8d3bd,
      x: x + 24,
      y: rowY + 8,
      maxWidth: width - 48,
      fallbackStyle: { fill: completed ? "#8fdd9a" : "#d8d3bd", fontSize: 13, fontFamily: "system-ui, sans-serif", wordWrap: true, wordWrapWidth: width - 48 }
    });
    text.scale.set(bitmapFonts ? 0.7 : 1);
    const hit = new Graphics();
    hit.rect(x + 14, rowY, width - 28, 34);
    hit.fill({ color: 0xffffff, alpha: 0.001 });
    hit.eventMode = "static";
    hit.cursor = "pointer";
    hit.on("pointertap", () => onMapPick(map));
    layer.addChild(hit);
  });

  const foot = addHudText(layer, bitmapFonts, {
    text: "Campaign missions are listed first. Enter loads first match. Esc closes.",
    fontId: "game",
    color: 0x8f876d,
    x: x + 18,
    y: y + height - 30,
    fallbackStyle: { fill: "#8f876d", fontSize: 12, fontFamily: "system-ui, sans-serif" }
  });
  foot.scale.set(bitmapFonts ? 0.64 : 1);
}

export interface HudCommand {
  id: HudCommandId;
  key: string;
  label: string;
  icon?: string | null;
  sourceButton?: WargusButton | null;
  disabled?: boolean;
}

let hoveredHudCommandId: HudCommandId | null = null;

function drawCommandPanel(
  layer: Container,
  graphics: Graphics,
  app: Application,
  sideWidth: number,
  x: number,
  y: number,
  width: number,
  manifest: WargusManifest,
  world: WorldState,
  selectedUnits: WorldState["units"],
  iconAtlas: IconTextureAtlas | null,
  bitmapFonts: WargusBitmapFontAtlas | null,
  commandPage: number,
  onCommand: (command: HudCommandId, input?: { ctrlKey?: boolean; shiftKey?: boolean }) => void
): void {
  const commands = availableCommands(manifest, world, selectedUnits, commandPage);
  graphics.rect(x, y, width, 154);
  graphics.fill(0x0d0a07);
  graphics.rect(x, y, width, 154);
  graphics.stroke({ width: 1, color: 0x4b3f2a, alpha: 1 });
  const normalTextColor = sourceUiTextColor(manifest, world, "normal", "#f0df9a");
  const reverseTextColor = sourceUiTextColor(manifest, world, "reverse", "#f0df9a");

  addHudText(layer, bitmapFonts, {
    text: "Commands",
    fontId: "game",
    color: colorNumberFromCss(normalTextColor, 0xf0df9a),
    x: x + 8,
    y: y + 7,
    fallbackStyle: { fill: normalTextColor, fontSize: 12, fontFamily: "system-ui, sans-serif", fontWeight: "700" }
  });

  if (commands.length === 0) {
    addHudText(layer, bitmapFonts, {
      text: "Select a worker or production building",
      fontId: "game",
      color: 0x8f876d,
      x: x + 8,
      y: y + 34,
      maxWidth: width - 16,
      lineHeight: 14,
      fallbackStyle: { fill: "#8f876d", fontSize: 12, fontFamily: "system-ui, sans-serif", wordWrap: true, wordWrapWidth: width - 16 }
    });
    return;
  }

  const sourceLayout = sourceButtonPanelLayout(world, x, y, width);
  const buttonSize = sourceLayout.buttonSize;
  const showButtonPopups = world.engineSettings.showButtonPopupsDefault;
  const showCommandKey = world.engineSettings.showCommandKeyDefault;
  const occupiedSlots = new Set<number>();
  const buttonRects = new Map<HudCommandId, { x: number; y: number; width: number; height: number }>();
  commands.forEach((command, index) => {
    const slot = commandGridSlot(command, index, occupiedSlots);
    const sourceSlot = sourceLayout.slots[slot] ?? sourceLayout.slots[index] ?? { x: x + 8 + (slot % 3) * 50, y: y + 31 + Math.floor(slot / 3) * 50 };
    const bx = sourceSlot.x;
    const by = sourceSlot.y;
    buttonRects.set(command.id, { x: bx, y: by, width: buttonSize, height: buttonSize });
    graphics.rect(bx, by, buttonSize, buttonSize);
    graphics.fill(0x2a2118);
    graphics.rect(bx, by, buttonSize, buttonSize);
    const sourceSelectedBorder = sourceSelectedCommandBorderColor(command, selectedUnits);
    const sourceAutoCastBorder = sourceAutoCastBorderColor(command, world, selectedUnits);
    graphics.stroke({ width: sourceSelectedBorder || sourceAutoCastBorder ? 2 : 1, color: sourceCommandBorderColor(command, world, selectedUnits), alpha: 1 });

    const texture = iconAtlas ? getIconTexture(iconAtlas, command.icon) : null;
    if (texture) {
      const icon = new Sprite(texture);
      icon.x = bx + 3;
      icon.y = by + sourceIconShiftY(world);
      icon.width = buttonSize - 6;
      icon.height = 31;
      if (world.engineSettings.grayscaleIconsDefault && command.disabled) {
        icon.tint = 0x9a9a9a;
        icon.alpha = 0.56;
      }
      layer.addChild(icon);

      graphics.rect(bx + 2, by + 2, 15, 13);
      graphics.fill({ color: 0x050403, alpha: 0.72 });
    } else if (showCommandKey) {
      const hotkey = addHudText(layer, bitmapFonts, {
        text: command.key,
        fontId: "game",
        color: command.disabled ? 0x8a8370 : colorNumberFromCss(reverseTextColor, 0xf0df9a),
        x: bx + buttonSize / 2,
        y: by + 9,
        anchorX: 0.5,
        fallbackStyle: { fill: command.disabled ? "#8a8370" : reverseTextColor, fontSize: 18, fontFamily: "system-ui, sans-serif", fontWeight: "800", align: "center" }
      });
      hotkey.scale.set(bitmapFonts ? 1.15 : 1);
    }

    if (texture && showCommandKey) {
      const hotkey = addHudText(layer, bitmapFonts, {
        text: command.key,
        fontId: "small",
        color: command.disabled ? 0x8a8370 : colorNumberFromCss(reverseTextColor, 0xf0df9a),
        x: bx + 5,
        y: by + 2,
        fallbackStyle: { fill: command.disabled ? "#8a8370" : reverseTextColor, fontSize: 9, fontFamily: "system-ui, sans-serif", fontWeight: "800", align: "center" }
      });
      hotkey.scale.set(bitmapFonts ? 0.95 : 1);
    }

    const label = addHudText(layer, bitmapFonts, {
      text: command.label,
      fontId: "small",
      color: command.disabled ? 0x8a8370 : 0xd8d3bd,
      x: bx + buttonSize / 2,
      y: by + 28,
      anchorX: 0.5,
      maxWidth: buttonSize - 4,
      lineHeight: 7,
      fallbackStyle: { fill: command.disabled ? "#8a8370" : "#d8d3bd", fontSize: 8, fontFamily: "system-ui, sans-serif", align: "center", wordWrap: true, wordWrapWidth: buttonSize - 4 }
    });
    label.scale.set(bitmapFonts ? 0.9 : 1);

    const popupLabel = showButtonPopups ? sourcePopupLabel(command.sourceButton) : null;
    if (popupLabel) {
      const popup = addHudText(layer, bitmapFonts, {
        text: popupLabel,
        fontId: "small",
        color: 0x0d0a07,
        x: bx + buttonSize - 3,
        y: by + 2,
        anchorX: 1,
        fallbackStyle: { fill: "#0d0a07", fontSize: 6, fontFamily: "system-ui, sans-serif", fontWeight: "800", align: "center" }
      });
      popup.scale.set(bitmapFonts ? 0.75 : 1);
      graphics.roundRect(popup.x - popup.width - 3, popup.y, popup.width + 4, 8, 2);
      graphics.fill(sourcePopupColor(command.sourceButton));
    }

    const popupTicks = showButtonPopups ? sourcePopupStatTicks(command.sourceButton) : 0;
    if (popupTicks > 0) {
      for (let tick = 0; tick < popupTicks; tick += 1) {
        graphics.rect(bx + 4 + tick * 5, by + buttonSize - 5, 3, 2);
        graphics.fill(sourcePopupColor(command.sourceButton));
      }
    }

    const hit = new Graphics();
    hit.rect(bx, by, buttonSize, buttonSize);
    hit.fill({ color: 0xffffff, alpha: 0.001 });
    if (!command.disabled) {
      hit.eventMode = "static";
      hit.cursor = "pointer";
      hit.on("pointerover", () => {
        hoveredHudCommandId = command.id;
      });
      hit.on("pointerout", () => {
        if (hoveredHudCommandId === command.id) {
          hoveredHudCommandId = null;
        }
      });
      hit.on("pointertap", (event) => {
        const nativeEvent = event.nativeEvent;
        onCommand(command.id, {
          ctrlKey: nativeEvent instanceof PointerEvent && nativeEvent.ctrlKey,
          shiftKey: nativeEvent instanceof PointerEvent && nativeEvent.shiftKey
        });
      });
    }
    layer.addChild(hit);
  });
  if (showButtonPopups) {
    const hoveredCommand = hoveredHudCommandId ? commands.find((command) => command.id === hoveredHudCommandId) : undefined;
    const hoveredRect = hoveredCommand ? buttonRects.get(hoveredCommand.id) : undefined;
    if (hoveredCommand && hoveredRect) {
      drawSourceCommandPopup(layer, graphics, x, y, width, hoveredCommand, hoveredRect, bitmapFonts);
    }
  }
  if (!world.engineSettings.noStatusLineTooltipsDefault) {
    const hoveredCommand = hoveredHudCommandId ? commands.find((command) => command.id === hoveredHudCommandId) : undefined;
    if (hoveredCommand) {
      drawSourceCommandStatusLine(layer, graphics, app, sideWidth, manifest, world, hoveredCommand, bitmapFonts);
    }
  }
}

function drawSourceCommandStatusLine(layer: Container, graphics: Graphics, app: Application, sideWidth: number, manifest: WargusManifest, world: WorldState, command: HudCommand, bitmapFonts: WargusBitmapFontAtlas | null): void {
  const text = sourceCommandStatusLineText(manifest, command);
  if (!text) {
    return;
  }
  const layout = sourceStatusLineLayout(app.screen, sideWidth, world.engineSettings.statusLine);
  const visibleRace = world.players.find((player) => player.id === world.visibilityPlayer)?.race === "orc" ? "orc" : "human";
  graphics.rect(layout.x - 6, layout.y - 4, layout.width + 12, layout.lineHeight + 8);
  graphics.fill({ color: 0x050403, alpha: 0.78 });
  addHudText(layer, bitmapFonts, {
    text,
    fontId: world.engineSettings.statusLine?.font ?? "game",
    color: sourceTextColorNumber(manifest, visibleRace, "normal", 0xf0df9a),
    paletteId: sourceTextPaletteId(manifest, visibleRace, "normal"),
    x: layout.x,
    y: layout.y,
    maxWidth: layout.width,
    lineHeight: layout.lineHeight,
    fallbackStyle: {
      fill: sourceTextColorCss(manifest, visibleRace, "normal", "#f0df9a"),
      fontSize: 14,
      fontFamily: "system-ui, sans-serif",
      fontWeight: "700",
      wordWrap: true,
      wordWrapWidth: layout.width
    }
  });
}

function commandGridSlot(command: HudCommand, fallbackIndex: number, occupiedSlots: Set<number>): number {
  const sourcePos = command.sourceButton?.pos ?? 0;
  if (sourcePos >= 1 && sourcePos <= 9 && !occupiedSlots.has(sourcePos - 1)) {
    occupiedSlots.add(sourcePos - 1);
    return sourcePos - 1;
  }
  for (let slot = 0; slot < 9; slot += 1) {
    if (!occupiedSlots.has(slot)) {
      occupiedSlots.add(slot);
      return slot;
    }
  }
  return fallbackIndex;
}

function sourceIconShiftY(world: WorldState): number {
  return world.engineSettings.iconsShiftDefault ? 3 : 0;
}

function sourceButtonPanelLayout(world: WorldState, panelX: number, panelY: number, panelWidth: number): { buttonSize: number; slots: Array<{ x: number; y: number }> } {
  const sourceSlots = world.engineSettings.buttonPanel?.slots ?? [];
  if (sourceSlots.length >= 9) {
    const maxX = Math.max(...sourceSlots.map((slot) => slot.x));
    const scale = Math.min(1, Math.max(0.68, (panelWidth - 18) / Math.max(1, maxX + 51)));
    const buttonSize = Math.max(30, Math.round(42 * scale));
    const yOffset = Math.max(28, Math.min(31, 31 * scale));
    return {
      buttonSize,
      slots: sourceSlots
        .sort((a, b) => a.slot - b.slot)
        .map((slot) => ({ x: panelX + 8 + slot.x * scale, y: panelY + yOffset + slot.y * scale }))
    };
  }
  const buttonSize = 42;
  return {
    buttonSize,
    slots: Array.from({ length: 9 }, (_, slot) => ({ x: panelX + 8 + (slot % 3) * 50, y: panelY + 31 + Math.floor(slot / 3) * 50 }))
  };
}

function drawSourceCommandPopup(
  layer: Container,
  graphics: Graphics,
  panelX: number,
  panelY: number,
  panelWidth: number,
  command: HudCommand,
  buttonRect: { x: number; y: number; width: number; height: number },
  bitmapFonts: WargusBitmapFontAtlas | null
): void {
  const lines = sourcePopupLines(command);
  if (lines.length === 0) {
    return;
  }
  const maxWidth = Math.max(96, Math.min(174, panelWidth - 18));
  const popupWidth = Math.min(maxWidth, Math.max(104, panelWidth - 156));
  const popupX = Math.min(panelX + panelWidth - popupWidth - 8, Math.max(panelX + 8, buttonRect.x + buttonRect.width + 8));
  const popupY = Math.max(panelY + 31, Math.min(panelY + 124, buttonRect.y));
  const borderColor = sourcePopupColor(command.sourceButton);
  const body = createHudText(bitmapFonts, {
    text: lines.join("\n"),
    fontId: "small",
    color: 0xf0df9a,
    x: popupX + 6,
    y: popupY + 5,
    maxWidth: popupWidth - 12,
    lineHeight: 8,
    fallbackStyle: {
      fill: "#f0df9a",
      fontSize: 9,
      fontFamily: "system-ui, sans-serif",
      lineHeight: 12,
      wordWrap: true,
      wordWrapWidth: popupWidth - 12
    }
  });
  body.scale.set(bitmapFonts ? 0.9 : 1);
  const popupHeight = Math.min(88, Math.max(22, body.height + 10));
  graphics.roundRect(popupX, popupY, popupWidth, popupHeight, 3);
  graphics.fill({ color: command.sourceButton?.popupRace === "orc" ? 0x2a0906 : command.sourceButton?.popupRace === "human" ? 0x061733 : 0x171717, alpha: 0.94 });
  graphics.roundRect(popupX, popupY, popupWidth, popupHeight, 3);
  graphics.stroke({ width: 1, color: borderColor, alpha: 0.95 });
  layer.addChild(body);
}

export function availableCommands(manifest: WargusManifest, world: WorldState, selectedUnits: WorldState["units"], commandPage: number): HudCommand[] {
  selectedUnits = selectedUnits.filter((unit) => unit.player === world.visibilityPlayer);
  if (selectedUnits.length === 0) {
    return [];
  }
  const readyUnits = selectedUnits.filter((unit) => unit.hitPoints > 0 && !unit.construction);
  const selectedReadyUnitIds = readyUnits.map((unit) => unit.id);
  const typeIds = new Set(readyUnits.map((unit) => unit.typeId));
  const selectedPlayer = selectedUnits[0]?.player ?? world.visibilityPlayer;
  const selectedRace = world.players.find((player) => player.id === selectedPlayer)?.race === "orc" ? "orc" : "human";
  const townTier = townCenterTierForPlayer(world, selectedPlayer);
  const commands: HudCommand[] = [];
  const sourceGroupScope = sourceGroupButtonScopeForSelection(world, readyUnits, selectedPlayer);
  if (!sourceGroupScope && (commandPage === 1 || commandPage === 2) && readyUnits.some(canUseHudBuilderCommands)) {
    appendWorkerBuildCommands(commands, manifest, world, selectedUnits, townTier, commandPage, selectedPlayer);
    return commands
      .map((command, index) => ({ command: enrichCommandFromSource(manifest, world, command, selectedPlayer, selectedUnits, readyUnits, typeIds), index }))
      .sort((a, b) => compareHudCommands(a.command, b.command, a.index, b.index))
      .map((entry) => entry.command);
  }
  if (!sourceGroupScope && selectedUnits.some((unit) => (unit.productionQueue?.length ?? 0) > 0 || unit.construction || world.activeResearch.some((research) => research.buildingId === unit.id))) {
    const sourceCancelButton = sourceCancelButtonForSelection(world, selectedUnits);
    commands.push({
      id: "cancel-queue",
      key: sourceCancelButton?.key?.toUpperCase() ?? "Esc",
      label: sourceButtonLabel(sourceCancelButton) ?? "Cancel",
      icon: sourceCancelButton?.icon,
      sourceButton: sourceCancelButton
    });
  }
  const sourceActionCommands = appendSourceActionCommands(commands, manifest, world, readyUnits, selectedPlayer);
  if (sourceGroupScope) {
    return commands
      .map((command, index) => ({ command: enrichCommandFromSource(manifest, world, command, selectedPlayer, selectedUnits, readyUnits, typeIds), index }))
      .sort((a, b) => compareHudCommands(a.command, b.command, a.index, b.index))
      .map((entry) => entry.command);
  }
  const hasSourceActionCommands = sourceActionCommands.size > 0;
  if (readyUnits.some(canReceiveMoveOrders)) {
    if (!sourceActionCommands.has("move")) {
      commands.push({ id: "move", key: "M", label: "Move" });
    }
    if (!sourceActionCommands.has("stop")) {
      commands.push({ id: "stop", key: "S", label: "Stop" });
    }
    if (!hasSourceActionCommands) {
      commands.push({ id: "follow", key: "F", label: "Follow" });
    }
  }
  if (!sourceActionCommands.has("return-goods") && readyUnits.some((unit) => canIssueReturnGoodsOrder(world, unit))) {
    commands.push({ id: "return-goods", key: "G", label: "Return" });
  }
  if (!sourceActionCommands.has("harvest") && readyUnits.some((unit) => canIssueAutoHarvestOrder(world, unit))) {
    commands.push({ id: "harvest", key: "H", label: sourcePreferredHarvestActionLabel(world, readyUnits) });
  }
  if (readyUnits.some(canIssueHoldPosition)) {
    if (!sourceActionCommands.has("attack-move")) {
      commands.push({ id: "attack-move", key: "A", label: "Attack" });
    }
    if (!hasSourceActionCommands && !sourceActionCommands.has("hold-position")) {
      commands.push({ id: "hold-position", key: "H", label: "Hold" });
    }
    if (!hasSourceActionCommands && !sourceActionCommands.has("patrol")) {
      commands.push({ id: "patrol", key: "P", label: "Patrol" });
    }
  }
  if (!sourceActionCommands.has("attack-ground") && readyUnits.some(canAttackGround)) {
    commands.push({ id: "attack-ground", key: "G", label: "Ground" });
  }
  if (!sourceActionCommands.has("explore") && readyUnits.some((unit) => canIssueExploreOrder(world, unit))) {
    commands.push({ id: "explore", key: "X", label: "Explore" });
  }
  appendSourceRootBuildCommands(commands, manifest, world, selectedUnits, selectedPlayer);
  const sourceTrainValues = appendSourceTrainCommands(commands, manifest, world, selectedUnits, readyUnits, selectedPlayer);
  const sourceUpgradeValues = appendSourceUpgradeCommands(commands, manifest, world, selectedUnits, readyUnits, selectedPlayer);
  const sourceResearchValues = appendSourceResearchCommands(commands, manifest, world, selectedUnits, readyUnits, selectedPlayer);
  const sourceSpellCommands = appendSourceSpellCommands(commands, manifest, world, readyUnits, selectedPlayer);
  const allowStockTrainFallbacks = !hasSourceTrainButtonsForTypes(world, typeIds, selectedPlayer);
  const allowStockBuildFallbacks = !hasSourceBuildButtonsForTypes(world, typeIds, selectedPlayer);
  const allowStockResearchFallbacks = !hasSourceResearchButtonsForTypes(world, typeIds, selectedPlayer);
  if (readyUnits.some((unit) => canIssueDetonateOrder(world, unit)) && !sourceSpellCommands.has("detonate")) {
    commands.push({ id: "detonate", key: "D", label: "Detonate" });
  }
  if (readyUnits.some((unit) => unit.mainFacility)) {
    if (!hasSourceTrainValueMatching(world, sourceTrainValues, isGoldOrWoodWorkerDefinition) && (selectedCanTrainMatching(world, selectedUnits, isGoldOrWoodWorkerDefinition) || (allowStockTrainFallbacks && selectedCanTrainAny(world, selectedUnits, ["unit-peasant", "unit-peon"])))) {
      commands.push({ id: "train-worker", key: "T", label: "Worker" });
    }
    const sourceTownUpgradeTarget = sourceTownUpgradeTargetForTypes(world, typeIds, selectedPlayer);
    const townUpgradeTargets = sourceTownUpgradeTarget ? [sourceTownUpgradeTarget] : ["unit-keep", "unit-castle", "unit-stronghold", "unit-fortress"];
    if (sourceTownUpgradeTarget) {
      if (!hasAnySourceResearchValue(sourceUpgradeValues, townUpgradeTargets) && selectedCanTrainAny(world, selectedUnits, townUpgradeTargets)) {
        commands.push({ id: "upgrade-town-center", key: "U", label: "Upgrade" });
      }
    }
  }
  const sourceGuardTowerTarget = sourceTowerUpgradeTargetForTypes(world, typeIds, selectedPlayer, "guard");
  const sourceCannonTowerTarget = sourceTowerUpgradeTargetForTypes(world, typeIds, selectedPlayer, "cannon");
  if (sourceGuardTowerTarget || sourceCannonTowerTarget) {
    const guardTowerTargets = sourceGuardTowerTarget ? [sourceGuardTowerTarget] : ["unit-human-guard-tower", "unit-orc-guard-tower"];
    const cannonTowerTargets = sourceCannonTowerTarget ? [sourceCannonTowerTarget] : ["unit-human-cannon-tower", "unit-orc-cannon-tower"];
    if (!hasAnySourceResearchValue(sourceUpgradeValues, guardTowerTargets) && selectedCanTrainAny(world, selectedUnits, guardTowerTargets)) {
      commands.push({ id: "upgrade-guard-tower", key: "G", label: "Guard" });
    }
    if (!hasAnySourceResearchValue(sourceUpgradeValues, cannonTowerTargets) && selectedCanTrainAny(world, selectedUnits, cannonTowerTargets)) {
      commands.push({ id: "upgrade-cannon-tower", key: "O", label: "Cannon" });
    }
  }
  const hasSourceBarracksProducer = selectedUnits.some((unit) => selectedCanTrainMatching(world, [unit], isOrdinaryBarracksCombatDefinition));
  if (hasSourceBarracksProducer) {
    if (!sourceTrainValues.has("unit-attack-peasant") && allowStockTrainFallbacks && selectedCanTrainAny(world, selectedUnits, ["unit-attack-peasant"])) {
      commands.push({ id: "train-minuteman", key: "M", label: "Minute" });
    }
    if (!hasSourceTrainValueMatching(world, sourceTrainValues, (definition) => isOrdinaryBarracksCombatDefinition(definition) && isMeleeLandCombatDefinition(definition) && !isSourceConversionTarget(world, definition.id)) && allowStockTrainFallbacks && selectedCanTrainAny(world, selectedUnits, ["unit-footman", "unit-grunt"])) {
      commands.push({ id: "train-melee", key: "M", label: "Melee" });
    }
    if (!hasSourceTrainValueMatching(world, sourceTrainValues, (definition) => isOrdinaryBarracksCombatDefinition(definition) && isRangedLandCombatDefinition(definition) && !isSourceConversionTarget(world, definition.id)) && allowStockTrainFallbacks && selectedCanTrainAny(world, selectedUnits, ["unit-archer", "unit-axethrower"])) {
      commands.push({ id: "train-ranged", key: "R", label: "Ranged" });
    }
    if (!hasSourceTrainValueMatching(world, sourceTrainValues, (definition) => isOrdinaryBarracksCombatDefinition(definition) && isRangedLandCombatDefinition(definition) && isSourceConversionTarget(world, definition.id)) && allowStockTrainFallbacks && selectedCanTrainAny(world, selectedUnits, ["unit-ranger", "unit-berserker"])) {
      commands.push({ id: "train-ranged-veteran", key: selectedRace === "human" ? "R" : "B", label: selectedRace === "human" ? "Ranger" : "Berserk" });
    }
    if (!hasSourceTrainValueMatching(world, sourceTrainValues, (definition) => isAdvancedMeleeCombatDefinition(definition) && isSourceConversionTarget(world, definition.id)) && allowStockTrainFallbacks && selectedCanTrainAny(world, selectedUnits, ["unit-paladin", "unit-ogre-mage"])) {
      commands.push({ id: "train-cavalry-veteran", key: selectedRace === "human" ? "P" : "O", label: selectedRace === "human" ? "Paladin" : "OgreMg" });
    }
  }
  if (!sourceTrainValues.has("unit-critter") && allowStockTrainFallbacks && selectedCanTrainAny(world, selectedUnits, ["unit-critter"])) {
    commands.push({ id: "train-critter", key: "C", label: "Critter" });
  }
  const hasSourceAdvancedMeleeProducer = selectedUnits.some((unit) => selectedCanTrainMatching(world, [unit], isAdvancedMeleeCombatDefinition));
  if (hasSourceAdvancedMeleeProducer) {
    if (!hasSourceTrainValueMatching(world, sourceTrainValues, (definition) => isAdvancedMeleeCombatDefinition(definition) && !isSourceConversionTarget(world, definition.id)) && allowStockTrainFallbacks && selectedCanTrainAny(world, selectedUnits, ["unit-knight", "unit-ogre"])) {
      commands.push({ id: "train-cavalry", key: "N", label: selectedRace === "human" ? "Knight" : "Ogre" });
    }
  }
  const hasSourceNavalProducer = selectedUnits.some((unit) => selectedCanTrainMatching(world, [unit], isNavalCombatOrUtilityDefinition));
  if (hasSourceNavalProducer) {
    if (!hasSourceTrainValueMatching(world, sourceTrainValues, (definition) => isNavalRoleDefinition(definition, "tanker")) && (selectedCanTrainMatching(world, selectedUnits, (definition) => isNavalRoleDefinition(definition, "tanker")) || (allowStockTrainFallbacks && selectedCanTrainAny(world, selectedUnits, ["unit-human-oil-tanker", "unit-orc-oil-tanker"])))) {
      commands.push({ id: "train-tanker", key: "Y", label: "Tanker" });
    }
    if (!hasSourceTrainValueMatching(world, sourceTrainValues, (definition) => isNavalRoleDefinition(definition, "destroyer")) && (selectedCanTrainMatching(world, selectedUnits, (definition) => isNavalRoleDefinition(definition, "destroyer")) || (allowStockTrainFallbacks && selectedCanTrainAny(world, selectedUnits, ["unit-human-destroyer", "unit-orc-destroyer"])))) {
      commands.push({ id: "train-destroyer", key: "D", label: "Destroy" });
    }
    if (!hasSourceTrainValueMatching(world, sourceTrainValues, (definition) => isNavalRoleDefinition(definition, "warship")) && (selectedCanTrainMatching(world, selectedUnits, (definition) => isNavalRoleDefinition(definition, "warship")) || (allowStockTrainFallbacks && selectedCanTrainAny(world, selectedUnits, ["unit-battleship", "unit-ogre-juggernaught"])))) {
      commands.push({ id: "train-warship", key: "J", label: selectedRace === "human" ? "Battle" : "Jugger" });
    }
    if (!hasSourceTrainValueMatching(world, sourceTrainValues, (definition) => isNavalRoleDefinition(definition, "submarine")) && (selectedCanTrainMatching(world, selectedUnits, (definition) => isNavalRoleDefinition(definition, "submarine")) || (allowStockTrainFallbacks && selectedCanTrainAny(world, selectedUnits, ["unit-human-submarine", "unit-orc-submarine"])))) {
      commands.push({ id: "train-submarine", key: "S", label: selectedRace === "human" ? "Sub" : "Turtle" });
    }
    if (!hasSourceTrainValueMatching(world, sourceTrainValues, (definition) => isNavalRoleDefinition(definition, "transport")) && (selectedCanTrainMatching(world, selectedUnits, (definition) => isNavalRoleDefinition(definition, "transport")) || (allowStockTrainFallbacks && selectedCanTrainAny(world, selectedUnits, ["unit-human-transport", "unit-orc-transport"])))) {
      commands.push({ id: "train-transport", key: "P", label: "Transport" });
    }
  }
  const hasSourceFoundry = selectedCanResearchMatchingSource(world, selectedUnits, (upgradeId) => isNavalResearchUpgrade(world, upgradeId));
  const shipCannonFallbacks = selectedRace === "human" ? ["upgrade-human-ship-cannon1", "upgrade-human-ship-cannon2"] : ["upgrade-orc-ship-cannon1", "upgrade-orc-ship-cannon2"];
  const shipArmorFallbacks = selectedRace === "human" ? ["upgrade-human-ship-armor1", "upgrade-human-ship-armor2"] : ["upgrade-orc-ship-armor1", "upgrade-orc-ship-armor2"];
  if (hasSourceFoundry) {
    if (!hasAnySourceResearchValue(sourceResearchValues, ["upgrade-human-ship-cannon1", "upgrade-human-ship-cannon2", "upgrade-orc-ship-cannon1", "upgrade-orc-ship-cannon2"]) && (selectedCanResearchMatchingSource(world, selectedUnits, (upgradeId) => isShipCannonResearchUpgrade(world, upgradeId)) || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, shipCannonFallbacks)))) {
      commands.push({ id: "research-ship-cannon", key: "C", label: "Cannon" });
    }
    if (!hasAnySourceResearchValue(sourceResearchValues, ["upgrade-human-ship-armor1", "upgrade-human-ship-armor2", "upgrade-orc-ship-armor1", "upgrade-orc-ship-armor2"]) && (selectedCanResearchMatchingSource(world, selectedUnits, (upgradeId) => isShipArmorResearchUpgrade(world, upgradeId)) || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, shipArmorFallbacks)))) {
      commands.push({ id: "research-ship-armor", key: "A", label: "Armor" });
    }
  }
  const hasSourceCasterProducer = selectedUnits.some((unit) => selectedCanTrainMatching(world, [unit], isCasterDefinition));
  const casterResearchFallbacks = ["upgrade-flame-shield", "upgrade-blizzard", "upgrade-polymorph", "upgrade-invisibility", "upgrade-slow", "upgrade-death-coil", "upgrade-death-and-decay", "upgrade-whirlwind", "upgrade-raise-dead", "upgrade-unholy-armor"];
  if (hasSourceCasterProducer || (allowStockTrainFallbacks && selectedCanTrainAny(world, selectedUnits, ["unit-mage", "unit-death-knight"])) || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, casterResearchFallbacks))) {
    if (!hasSourceTrainValueMatching(world, sourceTrainValues, isCasterDefinition) && (selectedCanTrainMatching(world, selectedUnits, isCasterDefinition) || (allowStockTrainFallbacks && selectedCanTrainAny(world, selectedUnits, ["unit-mage", "unit-death-knight"])))) {
      commands.push({ id: "train-caster", key: "A", label: selectedRace === "human" ? "Mage" : "DeathK" });
    }
    if (!hasSourceSpellResearchValue(world, sourceResearchValues, "spell-flame-shield", "upgrade-flame-shield") && (selectedCanResearchSpellSource(world, selectedUnits, "spell-flame-shield", "upgrade-flame-shield") || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, ["upgrade-flame-shield"])))) {
      commands.push({ id: "research-flame-shield", key: "L", label: "Flame" });
    }
    if (!hasSourceSpellResearchValue(world, sourceResearchValues, "spell-blizzard", "upgrade-blizzard") && (selectedCanResearchSpellSource(world, selectedUnits, "spell-blizzard", "upgrade-blizzard") || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, ["upgrade-blizzard"])))) {
      commands.push({ id: "research-blizzard", key: "B", label: "Blizzard" });
    }
    if (!hasSourceSpellResearchValue(world, sourceResearchValues, "spell-polymorph", "upgrade-polymorph") && (selectedCanResearchSpellSource(world, selectedUnits, "spell-polymorph", "upgrade-polymorph") || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, ["upgrade-polymorph"])))) {
      commands.push({ id: "research-polymorph", key: "P", label: "Poly" });
    }
    if (!hasSourceSpellResearchValue(world, sourceResearchValues, "spell-invisibility", "upgrade-invisibility") && (selectedCanResearchSpellSource(world, selectedUnits, "spell-invisibility", "upgrade-invisibility") || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, ["upgrade-invisibility"])))) {
      commands.push({ id: "research-invisibility", key: "I", label: "Invis" });
    }
    if (!hasSourceSpellResearchValue(world, sourceResearchValues, "spell-slow", "upgrade-slow") && (selectedCanResearchSpellSource(world, selectedUnits, "spell-slow", "upgrade-slow") || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, ["upgrade-slow"])))) {
      commands.push({ id: "research-slow", key: "S", label: "Slow" });
    }
    if (!hasSourceSpellResearchValue(world, sourceResearchValues, "spell-death-coil", "upgrade-death-coil") && (selectedCanResearchSpellSource(world, selectedUnits, "spell-death-coil", "upgrade-death-coil") || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, ["upgrade-death-coil"])))) {
      commands.push({ id: "research-death-coil", key: "D", label: "Coil" });
    }
    if (!hasSourceSpellResearchValue(world, sourceResearchValues, "spell-death-and-decay", "upgrade-death-and-decay") && (selectedCanResearchSpellSource(world, selectedUnits, "spell-death-and-decay", "upgrade-death-and-decay") || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, ["upgrade-death-and-decay"])))) {
      commands.push({ id: "research-death-magic", key: "W", label: "Decay" });
    }
    if (!hasSourceSpellResearchValue(world, sourceResearchValues, "spell-whirlwind", "upgrade-whirlwind") && (selectedCanResearchSpellSource(world, selectedUnits, "spell-whirlwind", "upgrade-whirlwind") || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, ["upgrade-whirlwind"])))) {
      commands.push({ id: "research-whirlwind", key: "R", label: "Whirl" });
    }
    if (!hasSourceSpellResearchValue(world, sourceResearchValues, "spell-raise-dead", "upgrade-raise-dead") && (selectedCanResearchSpellSource(world, selectedUnits, "spell-raise-dead", "upgrade-raise-dead") || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, ["upgrade-raise-dead"])))) {
      commands.push({ id: "research-raise-dead", key: "G", label: "Raise" });
    }
    if (!hasSourceSpellResearchValue(world, sourceResearchValues, "spell-unholy-armor", "upgrade-unholy-armor") && (selectedCanResearchSpellSource(world, selectedUnits, "spell-unholy-armor", "upgrade-unholy-armor") || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, ["upgrade-unholy-armor"])))) {
      commands.push({ id: "research-unholy-armor", key: "U", label: "Armor" });
    }
  }
  const hasSourceHolyBuilding = selectedCanResearchMatchingSource(world, selectedUnits, (upgradeId) => isHolyResearchUpgrade(world, upgradeId));
  const holyResearchFallbacks = ["upgrade-paladin", "upgrade-ogre-mage", "upgrade-healing", "upgrade-haste", "upgrade-exorcism", "upgrade-holy-vision", "upgrade-bloodlust", "upgrade-runes", "upgrade-eye-of-kilrogg"];
  if (hasSourceHolyBuilding || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, holyResearchFallbacks))) {
    const transformationUpgrade = selectedRace === "human" ? "upgrade-paladin" : "upgrade-ogre-mage";
    if (!hasSourceResearchValueMatching(world, sourceResearchValues, isHolyTransformationResearchUpgrade) && (selectedCanResearchMatchingSource(world, selectedUnits, (upgradeId) => isHolyTransformationResearchUpgrade(world, upgradeId)) || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, [transformationUpgrade])))) {
      commands.push({ id: "research-paladin", key: "P", label: selectedRace === "human" ? "Paladin" : "OgreMg" });
    }
    const supportUpgrade = selectedRace === "human" ? "upgrade-healing" : "upgrade-haste";
    if (!hasAnySourceResearchValue(sourceResearchValues, ["upgrade-healing", "upgrade-haste"]) && (selectedCanResearchMatchingSource(world, selectedUnits, (upgradeId) => isHolySupportResearchUpgrade(world, upgradeId)) || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, [supportUpgrade])))) {
      commands.push({ id: selectedRace === "human" ? "research-healing" : "research-haste", key: "H", label: selectedRace === "human" ? "Healing" : "Haste" });
    }
    if (!hasSourceSpellResearchValue(world, sourceResearchValues, "spell-exorcism", "upgrade-exorcism") && (selectedCanResearchSpellSource(world, selectedUnits, "spell-exorcism", "upgrade-exorcism") || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, ["upgrade-exorcism"])))) {
      commands.push({ id: "research-exorcism", key: "E", label: "Exorc" });
    }
    if (!hasSourceSpellResearchValue(world, sourceResearchValues, "spell-holy-vision", "upgrade-holy-vision") && (selectedCanResearchSpellSource(world, selectedUnits, "spell-holy-vision", "upgrade-holy-vision") || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, ["upgrade-holy-vision"])))) {
      commands.push({ id: "research-holy-vision", key: "V", label: "Vision" });
    }
    if (!hasSourceSpellResearchValue(world, sourceResearchValues, "spell-bloodlust", "upgrade-bloodlust") && (selectedCanResearchSpellSource(world, selectedUnits, "spell-bloodlust", "upgrade-bloodlust") || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, ["upgrade-bloodlust"])))) {
      commands.push({ id: "research-bloodlust", key: "B", label: "Blood" });
    }
    if (!hasSourceSpellResearchValue(world, sourceResearchValues, "spell-runes", "upgrade-runes") && (selectedCanResearchSpellSource(world, selectedUnits, "spell-runes", "upgrade-runes") || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, ["upgrade-runes"])))) {
      commands.push({ id: "research-runes", key: "R", label: "Runes" });
    }
    if (!hasSourceSpellResearchValue(world, sourceResearchValues, "spell-eye-of-vision", "upgrade-eye-of-kilrogg") && (selectedCanResearchSpellSource(world, selectedUnits, "spell-eye-of-vision", "upgrade-eye-of-kilrogg") || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, ["upgrade-eye-of-kilrogg"])))) {
      commands.push({ id: "research-eye-of-kilrogg", key: "E", label: "Eye" });
    }
  }
  const hasSourceAirProducer = selectedUnits.some((unit) => selectedCanTrainMatching(world, [unit], isAirCombatDefinition));
  if (hasSourceAirProducer) {
    if (!hasSourceTrainValueMatching(world, sourceTrainValues, isAirCombatDefinition) && (selectedCanTrainMatching(world, selectedUnits, isAirCombatDefinition) || (allowStockTrainFallbacks && selectedCanTrainAny(world, selectedUnits, ["unit-gryphon-rider", "unit-dragon"])))) {
      commands.push({ id: "train-air", key: "I", label: selectedRace === "human" ? "Gryphon" : "Dragon" });
    }
  }
  const hasSourceDemolitionProducer = selectedUnits.some((unit) => selectedCanTrainMatching(world, [unit], isDemolitionLabDefinition));
  if (hasSourceDemolitionProducer) {
    if (!hasSourceTrainValueMatching(world, sourceTrainValues, isDemolitionUnitDefinition) && (selectedCanTrainMatching(world, selectedUnits, isDemolitionUnitDefinition) || (allowStockTrainFallbacks && selectedCanTrainAny(world, selectedUnits, ["unit-dwarves", "unit-goblin-sappers"])))) {
      commands.push({ id: "train-demolition", key: "E", label: selectedRace === "human" ? "Demo" : "Sappers" });
    }
    if (!hasSourceTrainValueMatching(world, sourceTrainValues, isSiegeDefinition) && (selectedCanTrainMatching(world, selectedUnits, isSiegeDefinition) || (allowStockTrainFallbacks && selectedCanTrainAny(world, selectedUnits, ["unit-ballista", "unit-catapult"])))) {
      commands.push({ id: "train-siege", key: "Q", label: selectedRace === "human" ? "Ballista" : "Catapult" });
    }
    if (!hasSourceTrainValueMatching(world, sourceTrainValues, isScoutAirDefinition) && (selectedCanTrainMatching(world, selectedUnits, isScoutAirDefinition) || (allowStockTrainFallbacks && selectedCanTrainAny(world, selectedUnits, ["unit-balloon", "unit-zeppelin"])))) {
      commands.push({ id: "train-scout-air", key: "Z", label: selectedRace === "human" ? "Flyer" : "Zeppelin" });
    }
  }
  if (!sourceSpellCommands.has("cast-heal") && canCastHudSpell(world, readyUnits, selectedPlayer, "cast-heal")) {
    commands.push({ id: "cast-heal", key: "H", label: "Heal" });
  }
  if (!sourceSpellCommands.has("cast-exorcism") && canCastHudSpell(world, readyUnits, selectedPlayer, "cast-exorcism")) {
    commands.push({ id: "cast-exorcism", key: "E", label: "Exorc" });
  }
  if (!sourceSpellCommands.has("cast-holy-vision") && canCastHudSpell(world, readyUnits, selectedPlayer, "cast-holy-vision")) {
    commands.push({ id: "cast-holy-vision", key: "V", label: "Vision" });
  }
  if (!sourceSpellCommands.has("cast-fireball") && canCastHudSpell(world, readyUnits, selectedPlayer, "cast-fireball")) {
    commands.push({ id: "cast-fireball", key: "F", label: "Fire" });
  }
  if (!sourceSpellCommands.has("cast-flame-shield") && canCastHudSpell(world, readyUnits, selectedPlayer, "cast-flame-shield")) {
    commands.push({ id: "cast-flame-shield", key: "L", label: "Flame" });
  }
  if (!sourceSpellCommands.has("cast-blizzard") && canCastHudSpell(world, readyUnits, selectedPlayer, "cast-blizzard")) {
    commands.push({ id: "cast-blizzard", key: "B", label: "Blizzard" });
  }
  if (!sourceSpellCommands.has("cast-polymorph") && canCastHudSpell(world, readyUnits, selectedPlayer, "cast-polymorph")) {
    commands.push({ id: "cast-polymorph", key: "P", label: "Poly" });
  }
  if (!sourceSpellCommands.has("cast-invisibility") && canCastHudSpell(world, readyUnits, selectedPlayer, "cast-invisibility")) {
    commands.push({ id: "cast-invisibility", key: "I", label: "Invis" });
  }
  if (!sourceSpellCommands.has("cast-slow") && canCastHudSpell(world, readyUnits, selectedPlayer, "cast-slow")) {
    commands.push({ id: "cast-slow", key: "S", label: "Slow" });
  }
  if (!sourceSpellCommands.has("cast-death-coil") && canCastHudSpell(world, readyUnits, selectedPlayer, "cast-death-coil")) {
    commands.push({ id: "cast-death-coil", key: "D", label: "Coil" });
  }
  if (!sourceSpellCommands.has("cast-death-and-decay") && canCastHudSpell(world, readyUnits, selectedPlayer, "cast-death-and-decay")) {
    commands.push({ id: "cast-death-and-decay", key: "W", label: "Decay" });
  }
  if (!sourceSpellCommands.has("cast-whirlwind") && canCastHudSpell(world, readyUnits, selectedPlayer, "cast-whirlwind")) {
    commands.push({ id: "cast-whirlwind", key: "R", label: "Whirl" });
  }
  if (!sourceSpellCommands.has("cast-raise-dead") && canCastHudSpell(world, readyUnits, selectedPlayer, "cast-raise-dead")) {
    commands.push({ id: "cast-raise-dead", key: "G", label: "Raise" });
  }
  if (!sourceSpellCommands.has("cast-unholy-armor") && canCastHudSpell(world, readyUnits, selectedPlayer, "cast-unholy-armor")) {
    commands.push({ id: "cast-unholy-armor", key: "U", label: "Armor" });
  }
  if (!sourceSpellCommands.has("cast-haste") && canCastHudSpell(world, readyUnits, selectedPlayer, "cast-haste")) {
    commands.push({ id: "cast-haste", key: "H", label: "Haste" });
  }
  if (!sourceSpellCommands.has("cast-bloodlust") && canCastHudSpell(world, readyUnits, selectedPlayer, "cast-bloodlust")) {
    commands.push({ id: "cast-bloodlust", key: "B", label: "Blood" });
  }
  if (!sourceSpellCommands.has("cast-runes") && canCastHudSpell(world, readyUnits, selectedPlayer, "cast-runes")) {
    commands.push({ id: "cast-runes", key: "R", label: "Runes" });
  }
  if (!sourceSpellCommands.has("cast-eye-of-kilrogg") && canCastHudSpell(world, readyUnits, selectedPlayer, "cast-eye-of-kilrogg")) {
    commands.push({ id: "cast-eye-of-kilrogg", key: "E", label: "Eye" });
  }
  if (allowStockBuildFallbacks && canEnterPendingWorldCommand(world, selectedReadyUnitIds, "build-oil-platform", selectedPlayer)) {
    commands.push({ id: "build-oil-platform", key: "U", label: "Platform" });
  }
  const selectedTransports = readyUnits.filter(isTransport);
  if (selectedTransports.length > 0) {
    if (!hasSourceActionCommands && selectedTransports.some(canIssueLoadTransport)) {
      commands.push({ id: "load-transport", key: "L", label: "Load" });
    }
    if (!sourceActionCommands.has("unload-transport") && canEnterPendingWorldCommand(world, selectedReadyUnitIds, "unload-transport", selectedPlayer)) {
      commands.push({ id: "unload-transport", key: "U", label: "Unload" });
    }
  }
  if (readyUnits.some(canUseHudBuilderCommands)) {
    if (!sourceActionCommands.has("repair")) {
      commands.push({ id: "repair", key: "R", label: "Repair" });
    }
    appendWorkerBuildCommands(commands, manifest, world, selectedUnits, townTier, commandPage, selectedPlayer);
  }
  const hasSourceBlacksmith = selectedCanResearchMatchingSource(world, selectedUnits, (upgradeId) => isBlacksmithResearchUpgrade(world, upgradeId));
  const meleeWeaponFallbacks = selectedRace === "human" ? ["upgrade-sword1", "upgrade-sword2"] : ["upgrade-battle-axe1", "upgrade-battle-axe2"];
  const shieldFallbacks = selectedRace === "human" ? ["upgrade-human-shield1", "upgrade-human-shield2"] : ["upgrade-orc-shield1", "upgrade-orc-shield2"];
  const siegeWeaponFallbacks = selectedRace === "human" ? ["upgrade-ballista1", "upgrade-ballista2"] : ["upgrade-catapult1", "upgrade-catapult2"];
  if (hasSourceBlacksmith) {
    if (!hasSourceResearchValueMatching(world, sourceResearchValues, isMeleeWeaponResearchUpgrade) && (selectedCanResearchMatchingSource(world, selectedUnits, (upgradeId) => isMeleeWeaponResearchUpgrade(world, upgradeId)) || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, meleeWeaponFallbacks)))) {
      commands.push({ id: "research-melee", key: "Z", label: "Weapon" });
    }
    if (!hasSourceResearchValueMatching(world, sourceResearchValues, isShieldResearchUpgrade) && (selectedCanResearchMatchingSource(world, selectedUnits, (upgradeId) => isShieldResearchUpgrade(world, upgradeId)) || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, shieldFallbacks)))) {
      commands.push({ id: "research-armor", key: "X", label: "Armor" });
    }
    if (!hasSourceResearchValueMatching(world, sourceResearchValues, isSiegeResearchUpgrade) && (selectedCanResearchMatchingSource(world, selectedUnits, (upgradeId) => isSiegeResearchUpgrade(world, upgradeId)) || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, siegeWeaponFallbacks)))) {
      commands.push({ id: "research-siege", key: "Q", label: "Siege" });
    }
  }
  const hasSourceLumberMill = selectedCanResearchMatchingSource(world, selectedUnits, (upgradeId) => isLumberMillResearchUpgrade(world, upgradeId));
  const lumberMillFallbacks = selectedRace === "human"
    ? ["upgrade-arrow1", "upgrade-arrow2", "upgrade-ranger", "upgrade-longbow", "upgrade-ranger-scouting", "upgrade-ranger-marksmanship"]
    : ["upgrade-throwing-axe1", "upgrade-throwing-axe2", "upgrade-berserker", "upgrade-light-axes", "upgrade-berserker-scouting", "upgrade-berserker-regeneration"];
  if (hasSourceLumberMill) {
    if (!hasSourceResearchValueMatching(world, sourceResearchValues, isLumberMillResearchUpgrade) && (selectedCanResearchMatchingSource(world, selectedUnits, (upgradeId) => isLumberMillResearchUpgrade(world, upgradeId)) || (allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, lumberMillFallbacks)))) {
      commands.push({ id: "research-ranged", key: "C", label: "Missile" });
    }
  }
  return commands
    .map((command, index) => ({ command: enrichCommandFromSource(manifest, world, command, selectedPlayer, selectedUnits, readyUnits, typeIds), index }))
    .sort((a, b) => compareHudCommands(a.command, b.command, a.index, b.index))
    .map((entry) => entry.command);
}

function compareHudCommands(a: HudCommand, b: HudCommand, aIndex: number, bIndex: number): number {
  const aSource = a.sourceButton;
  const bSource = b.sourceButton;
  if (aSource && bSource) {
    return aSource.level - bSource.level || aSource.pos - bSource.pos || aIndex - bIndex;
  }
  if (aSource) {
    return -1;
  }
  if (bSource) {
    return 1;
  }
  return aIndex - bIndex;
}

function appendSourceActionCommands(
  commands: HudCommand[],
  _manifest: WargusManifest,
  world: WorldState,
  readyUnits: WorldState["units"],
  playerId: number
): Set<HudCommandId> {
  const addedCommands = new Set<HudCommandId>();
  const sourceButtons = sourceActionButtonsForHud(world, readyUnits, playerId);
  for (const button of sourceButtons) {
    const commandId = sourceHudCommandForAction(button.action) as HudCommandId | null;
    if (!commandId || addedCommands.has(commandId)) {
      continue;
    }
    addedCommands.add(commandId);
    commands.push({
      id: commandId,
      key: button.key?.toUpperCase() ?? "",
      label: sourceButtonLabel(button) ?? sourceHudActionLabel(commandId),
      icon: button.icon,
      sourceButton: button,
      disabled: sourceCommandDisabled(world, button, readyUnits)
    });
  }
  return addedCommands;
}

function appendSourceTrainCommands(
  commands: HudCommand[],
  _manifest: WargusManifest,
  world: WorldState,
  selectedUnits: WorldState["units"],
  readyUnits: WorldState["units"],
  playerId: number
): Set<string> {
  const addedValues = new Set<string>();
  const sourceButtons = sourceTrainButtonsForHud(world, selectedUnits, readyUnits, playerId);
  for (const button of sourceButtons) {
    if (!button.value || addedValues.has(button.value)) {
      continue;
    }
    addedValues.add(button.value);
    commands.push({
      id: `source-train:${button.value}`,
      key: button.key?.toUpperCase() ?? "",
      label: sourceTrainButtonLabel(world, button),
      icon: button.icon,
      sourceButton: button,
      disabled: sourceCommandDisabled(world, button, selectedUnits)
    });
  }
  return addedValues;
}

function appendSourceUpgradeCommands(
  commands: HudCommand[],
  _manifest: WargusManifest,
  world: WorldState,
  selectedUnits: WorldState["units"],
  readyUnits: WorldState["units"],
  playerId: number
): Set<string> {
  const addedValues = new Set<string>();
  const sourceButtons = sourceUpgradeButtonsForHud(world, selectedUnits, readyUnits, playerId);
  for (const button of sourceButtons) {
    if (!button.value || addedValues.has(button.value)) {
      continue;
    }
    addedValues.add(button.value);
    commands.push({
      id: `source-upgrade:${button.value}`,
      key: button.key?.toUpperCase() ?? "",
      label: sourceUnitButtonLabel(world, button),
      icon: button.icon,
      sourceButton: button,
      disabled: sourceCommandDisabled(world, button, selectedUnits)
    });
  }
  return addedValues;
}

function appendSourceResearchCommands(
  commands: HudCommand[],
  manifest: WargusManifest,
  world: WorldState,
  selectedUnits: WorldState["units"],
  readyUnits: WorldState["units"],
  playerId: number
): Set<string> {
  const addedValues = new Set<string>();
  const sourceButtons = sourceResearchButtonsForHud(world, selectedUnits, readyUnits, playerId);
  for (const button of sourceButtons) {
    if (addedValues.has(button.value)) {
      continue;
    }
    addedValues.add(button.value);
    commands.push({
      id: `source-research:${button.value}`,
      key: button.key?.toUpperCase() ?? "",
      label: sourceButtonLabel(button) ?? upgradeName(manifest, button.value),
      icon: button.icon,
      sourceButton: button,
      disabled: sourceCommandDisabled(world, button, selectedUnits)
    });
  }
  return addedValues;
}

function appendSourceSpellCommands(
  commands: HudCommand[],
  _manifest: WargusManifest,
  world: WorldState,
  readyUnits: WorldState["units"],
  playerId: number
): Set<TargetedSpellCommand | "detonate"> {
  const addedCommands = new Set<TargetedSpellCommand | "detonate">();
  const addedValues = new Set<string>();
  const readyUnitIds = readyUnits.map((unit) => unit.id);
  const sourceButtons = sourceSpellButtonsForHud(world, readyUnits, playerId);
  for (const button of sourceButtons) {
    const command = sourceSpellCommandForSpellId(world, button.value);
    const instantCommand = sourceInstantSpellCommandForSpellId(world, button.value);
    if (addedValues.has(button.value)) {
      continue;
    }
    if (instantCommand) {
      const instantAvailable = readyUnits.some((unit) => unit.canCastSpells.includes(button.value));
      addedValues.add(button.value);
      addedCommands.add(instantCommand);
      commands.push({
        id: `source-spell:${button.value}`,
        key: button.key?.toUpperCase() ?? "",
        label: sourceSpellButtonLabel(world, button),
        icon: button.icon,
        sourceButton: button,
        disabled: !instantAvailable
      });
      continue;
    }
    if (!command) {
      continue;
    }
    const targetedAvailable = selectedCanCastTargetedSpell(world, readyUnitIds, command, playerId);
    addedValues.add(button.value);
    addedCommands.add(command);
    const fallbackCommand = sourceFallbackSpellCommandForSpellId(button.value);
    if (fallbackCommand) {
      addedCommands.add(fallbackCommand);
    }
    commands.push({
      id: `source-spell:${button.value}`,
      key: button.key?.toUpperCase() ?? "",
      label: sourceSpellButtonLabel(world, button),
      icon: button.icon,
      sourceButton: button,
      disabled: !targetedAvailable
    });
  }
  return addedCommands;
}

function appendWorkerBuildCommands(commands: HudCommand[], manifest: WargusManifest, world: WorldState, selectedUnits: WorldState["units"], townTier: number, commandPage: number, playerId: number): void {
  const typeIds = new Set(selectedUnits.map((unit) => unit.typeId));
  const allowStockBuildFallbacks = !hasSourceBuildButtonsForTypes(world, typeIds, playerId);
  if (commandPage === 1) {
    const sourceBuildValues = appendSourceBuildCommands(commands, manifest, world, selectedUnits, 1, playerId);
    if (!sourceBuildValuesDefinitionMatching(world, sourceBuildValues, isSupplyProviderDefinition) && allowStockBuildFallbacks && selectedCanBuildAny(world, selectedUnits, ["unit-farm", "unit-pig-farm"])) {
      commands.push({ id: "build-farm", key: "F", label: "Farm" });
    }
    if (!sourceBuildValuesProduceMatching(world, sourceBuildValues, isOrdinaryBarracksCombatDefinition, playerId) && allowStockBuildFallbacks && selectedCanBuildAny(world, selectedUnits, ["unit-human-barracks", "unit-orc-barracks"])) {
      commands.push({ id: "build-barracks", key: "B", label: "Barracks" });
    }
    if (!sourceBuildValuesResearchMatching(world, sourceBuildValues, (upgradeId) => isLumberMillResearchUpgrade(world, upgradeId), playerId) && allowStockBuildFallbacks && selectedCanBuildAny(world, selectedUnits, ["unit-elven-lumber-mill", "unit-troll-lumber-mill"])) {
      commands.push({ id: "build-lumber-mill", key: "L", label: "Mill" });
    }
    if (!sourceBuildValuesResearchMatching(world, sourceBuildValues, (upgradeId) => isBlacksmithResearchUpgrade(world, upgradeId), playerId) && allowStockBuildFallbacks && selectedCanBuildAny(world, selectedUnits, ["unit-human-blacksmith", "unit-orc-blacksmith"])) {
      commands.push({ id: "build-blacksmith", key: "S", label: "Smith" });
    }
    if (!sourceBuildValuesUpgradeToMatching(world, sourceBuildValues, isDefensiveBuildingDefinition, playerId) && allowStockBuildFallbacks && selectedCanBuildAny(world, selectedUnits, ["unit-human-watch-tower", "unit-orc-watch-tower"])) {
      commands.push({ id: "build-guard-tower", key: "T", label: "Tower" });
    }
    if (!sourceBuildValuesDefinitionMatching(world, sourceBuildValues, isWallDefinition) && allowStockBuildFallbacks && selectedCanBuildAny(world, selectedUnits, ["unit-human-wall", "unit-orc-wall"])) {
      commands.push({ id: "build-wall", key: "W", label: "Wall" });
    }
    appendSourceBuildPageButton(commands, manifest, world, selectedUnits, playerId, "0")
      || commands.push({ id: "build-page-cancel", key: "Esc", label: "Cancel" });
    return;
  }

  if (commandPage === 2) {
    const sourceBuildValues = appendSourceBuildCommands(commands, manifest, world, selectedUnits, 2, playerId);
    const human = world.players.find((player) => player.id === playerId)?.race !== "orc";
    if (!sourceBuildValuesProduceMatching(world, sourceBuildValues, isNavalCombatOrUtilityDefinition, playerId) && allowStockBuildFallbacks && selectedCanBuildAny(world, selectedUnits, ["unit-human-shipyard", "unit-orc-shipyard"])) {
      commands.push({ id: "build-shipyard", key: "S", label: "Shipyard" });
    }
    if (!sourceBuildValuesResearchMatching(world, sourceBuildValues, (upgradeId) => isNavalResearchUpgrade(world, upgradeId), playerId) && allowStockBuildFallbacks && selectedCanBuildAny(world, selectedUnits, ["unit-human-foundry", "unit-orc-foundry"])) {
      commands.push({ id: "build-foundry", key: "F", label: "Foundry" });
    }
    if (!sourceBuildValuesDefinitionMatching(world, sourceBuildValues, isOilRefineryDefinition) && allowStockBuildFallbacks && selectedCanBuildAny(world, selectedUnits, ["unit-human-refinery", "unit-orc-refinery"])) {
      commands.push({ id: "build-refinery", key: "R", label: "Refinery" });
    }
    if (!sourceBuildValuesProduceMatching(world, sourceBuildValues, isDemolitionLabDefinition, playerId) && allowStockBuildFallbacks && selectedCanBuildAny(world, selectedUnits, ["unit-inventor", "unit-alchemist"])) {
      commands.push({ id: "build-siege-lab", key: human ? "I" : "A", label: human ? "Inventor" : "Alchem" });
    }
    if (!sourceBuildValuesProduceMatching(world, sourceBuildValues, isAdvancedMeleeCombatDefinition, playerId) && allowStockBuildFallbacks && selectedCanBuildAny(world, selectedUnits, ["unit-stables", "unit-ogre-mound"])) {
      commands.push({ id: "build-advanced", key: human ? "A" : "O", label: human ? "Stables" : "Mound" });
    }
    if (!sourceBuildValuesProduceMatching(world, sourceBuildValues, isCasterDefinition, playerId) && allowStockBuildFallbacks && selectedCanBuildAny(world, selectedUnits, ["unit-mage-tower", "unit-temple-of-the-damned"])) {
      commands.push({ id: "build-caster-building", key: human ? "M" : "T", label: human ? "Mage Twr" : "Temple" });
    }
    if (!sourceBuildValuesResearchMatching(world, sourceBuildValues, (upgradeId) => isHolyResearchUpgrade(world, upgradeId), playerId) && allowStockBuildFallbacks && selectedCanBuildAny(world, selectedUnits, ["unit-church", "unit-altar-of-storms"])) {
      commands.push({ id: "build-holy-building", key: human ? "C" : "L", label: human ? "Church" : "Altar" });
    }
    if (!sourceBuildValuesProduceMatching(world, sourceBuildValues, isAirCombatDefinition, playerId) && allowStockBuildFallbacks && selectedCanBuildAny(world, selectedUnits, ["unit-gryphon-aviary", "unit-dragon-roost"])) {
      commands.push({ id: "build-air-building", key: human ? "G" : "D", label: human ? "Aviary" : "Roost" });
    }
    appendSourceBuildPageButton(commands, manifest, world, selectedUnits, playerId, "0")
      || commands.push({ id: "build-page-cancel", key: "Esc", label: "Cancel" });
    return;
  }

  const hasSourceBasicPage = appendSourceBuildPageButton(commands, manifest, world, selectedUnits, playerId, "1");
  const hasSourceAdvancedPage = appendSourceBuildPageButton(commands, manifest, world, selectedUnits, playerId, "2");
  if (!hasSourceBasicPage) {
    commands.push({ id: "build-basic-page", key: "B", label: "Build" });
  }
  if (!hasSourceAdvancedPage && townTier >= 2) {
    commands.push({ id: "build-advanced-page", key: "V", label: "Advanced" });
  }
}

function appendSourceBuildPageButton(commands: HudCommand[], _manifest: WargusManifest, world: WorldState, selectedUnits: WorldState["units"], playerId: number, pageValue: "0" | "1" | "2"): boolean {
  const sourceButton = sourceBuildPageButtonForHud(world, selectedUnits, playerId, pageValue);
  if (!sourceButton) {
    return false;
  }
  const commandId = pageValue === "0" ? "build-page-cancel" : pageValue === "1" ? "build-basic-page" : "build-advanced-page";
  commands.push({
    id: commandId,
    key: pageValue === "0" ? "Esc" : sourceButton.key?.toUpperCase() ?? "",
    label: sourceButtonLabel(sourceButton) ?? (pageValue === "0" ? "Cancel" : pageValue === "1" ? "Build" : "Advanced"),
    icon: sourceButton.icon,
    sourceButton,
    disabled: sourceCommandDisabled(world, sourceButton, selectedUnits)
  });
  return true;
}

function appendSourceBuildCommands(commands: HudCommand[], _manifest: WargusManifest, world: WorldState, selectedUnits: WorldState["units"], page: 1 | 2, playerId: number): Set<string> {
  const addedValues = new Set<string>();
  const sourceButtons = sourceBuildButtonsForHud(world, selectedUnits, page, playerId);
  for (const button of sourceButtons) {
    if (addedValues.has(button.value)) {
      continue;
    }
    addedValues.add(button.value);
    commands.push({
      id: `source-build:${button.value}`,
      key: button.key?.toUpperCase() ?? "",
      label: sourceUnitButtonLabel(world, button),
      icon: button.icon,
      sourceButton: button,
      disabled: sourceCommandDisabled(world, button, selectedUnits)
    });
  }
  return addedValues;
}

function appendSourceRootBuildCommands(commands: HudCommand[], _manifest: WargusManifest, world: WorldState, selectedUnits: WorldState["units"], playerId: number): Set<string> {
  const addedValues = new Set<string>();
  const sourceButtons = sourceRootBuildButtonsForHud(world, selectedUnits, playerId);
  for (const button of sourceButtons) {
    if (addedValues.has(button.value)) {
      continue;
    }
    addedValues.add(button.value);
    commands.push({
      id: `source-build:${button.value}`,
      key: button.key?.toUpperCase() ?? "",
      label: sourceUnitButtonLabel(world, button),
      icon: button.icon,
      sourceButton: button,
      disabled: sourceCommandDisabled(world, button, selectedUnits)
    });
  }
  return addedValues;
}

function enrichCommandFromSource(
  manifest: WargusManifest,
  world: WorldState,
  command: HudCommand,
  playerId: number,
  selectedUnits: WorldState["units"],
  readyUnits: WorldState["units"],
  typeIds: Set<string>
): HudCommand {
  const sourceButton = command.sourceButton ?? sourceButtonForCommand(manifest, world, command.id, playerId, selectedUnits, readyUnits, typeIds);
  return {
    ...command,
    key: sourceButton?.key ? sourceButton.key.toUpperCase() : command.key,
    label: sourceButtonLabel(sourceButton) ?? command.label,
    icon: sourceButton?.icon ?? iconForCommand(command.id, world, playerId, typeIds, selectedUnits),
    sourceButton,
    disabled: command.disabled ?? sourceCommandDisabled(world, sourceButton, selectedUnits)
  };
}

function sourceCommandDisabled(world: WorldState, button: WargusButton | null | undefined, selectedUnits: WorldState["units"]): boolean {
  if (!button) {
    return false;
  }
  const extraScopes = button.forUnit.filter((scope) => scope.endsWith("-group"));
  return !selectedUnits.some((unit) => (
    unit.player === world.visibilityPlayer
    && sourceButtonVisibleForHud(world, button, unit.player)
    && sourceButtonHasExecutableContext(world, button, unit, extraScopes)
  ));
}

function sourceButtonForCommand(
  _manifest: WargusManifest,
  world: WorldState,
  commandId: HudCommandId,
  playerId: number,
  selectedUnits: WorldState["units"],
  readyUnits: WorldState["units"],
  typeIds: Set<string>
): WargusButton | null {
  return sourceButtonForHudCommand(world, commandId, playerId, selectedUnits, readyUnits, typeIds);
}

function iconForCommand(commandId: HudCommandId, world: WorldState, playerId: number, typeIds: Set<string>, selectedUnits: WorldState["units"] = []): string | null {
  if (commandId.startsWith("source-train:")) {
    return world.unitDefinitions.find((unit) => unit.id === commandId.slice("source-train:".length))?.icon ?? null;
  }
  if (commandId.startsWith("source-upgrade:")) {
    return world.unitDefinitions.find((unit) => unit.id === commandId.slice("source-upgrade:".length))?.icon ?? null;
  }
  if (commandId.startsWith("source-research:")) {
    return world.upgradeDefinitions.find((upgrade) => upgrade.id === commandId.slice("source-research:".length))?.icon ?? null;
  }
  if (commandId.startsWith("source-build:")) {
    return world.unitDefinitions.find((unit) => unit.id === commandId.slice("source-build:".length))?.icon ?? null;
  }
  if (commandId.startsWith("source-spell:")) {
    return null;
  }
  const race = world.players.find((player) => player.id === playerId)?.race ?? "human";
  const human = race === "human";
  const unitIcon = (...unitTypeIds: string[]) => world.unitDefinitions.find((unit) => unitTypeIds.includes(unit.id))?.icon ?? null;
  const upgradeIcon = (...upgradeIds: string[]) => world.upgradeDefinitions.find((upgrade) => upgradeIds.includes(upgrade.id))?.icon ?? null;
  const raceIcon = (humanIcon: string, orcIcon: string) => human ? humanIcon : orcIcon;
  const raceUnitIcon = (humanUnit: string, orcUnit: string) => unitIcon(human ? humanUnit : orcUnit);
  const trainIcon = (command: string, fallback: string | null): string | null => (
    sourceTrainIconForHudCommand(world, typeIds, playerId, command)
    ?? sourceFallbackTrainIconForHudCommand(world, selectedUnits, command)
    ?? (hasSourceTrainButtonsForTypes(world, typeIds, playerId) ? null : fallback)
  );
  const exactTrainIcon = (unitTypeId: string): string | null => {
    const sourceTarget = sourceTrainTargetForTypes(world, typeIds, playerId, unitTypeId);
    return sourceTarget
      ? unitIcon(sourceTarget)
      : hasSourceTrainButtonsForTypes(world, typeIds, playerId) ? null : unitIcon(unitTypeId);
  };
  const buildIcon = (command: string, fallback: string | null): string | null => (
    sourceBuildIconForHudCommand(world, typeIds, playerId, command)
    ?? (hasSourceBuildButtonsForTypes(world, typeIds, playerId) ? null : fallback)
  );
  const researchIcon = (command: string, fallback: string | null): string | null => (
    sourceResearchIconForHudCommand(world, typeIds, playerId, command)
    ?? sourceFallbackResearchIconForHudCommand(world, selectedUnits, command)
    ?? (hasSourceResearchButtonsForTypes(world, typeIds, playerId) ? null : fallback)
  );

  switch (commandId) {
    case "cancel-queue":
      return "icon-cancel";
    case "build-basic-page":
      return "icon-build-basic";
    case "build-advanced-page":
      return "icon-build-advanced";
    case "build-page-cancel":
      return "icon-cancel";
    case "move":
      return raceIcon("icon-move-peasant", "icon-move-peon");
    case "stop":
      return raceIcon("icon-move-peasant", "icon-move-peon");
    case "hold-position":
      return raceIcon("icon-human-stand-ground", "icon-orc-stand-ground");
    case "attack-move":
      return raceIcon("icon-human-patrol-land", "icon-orc-patrol-land");
    case "attack-ground":
      return raceIcon("icon-human-attack-ground", "icon-orc-attack-ground");
    case "patrol":
      return raceIcon("icon-human-patrol-land", "icon-orc-patrol-land");
    case "follow":
      return raceIcon("icon-move-peasant", "icon-move-peon");
    case "repair":
      return "icon-repair";
    case "harvest":
      return "icon-harvest";
    case "detonate":
      return raceIcon("icon-human-demolish", "icon-orc-demolish");
    case "explore":
      return raceIcon("icon-human-patrol-naval", "icon-orc-patrol-naval");
    case "return-goods":
      return raceIcon("icon-return-goods-peasant", "icon-return-goods-peon");
    case "train-worker":
      {
        const sourceTarget = sourceWorkerTrainTargetForTypes(world, typeIds, playerId);
        return sourceTarget ? unitIcon(sourceTarget) : hasSourceTrainButtonsForTypes(world, typeIds, playerId) ? null : raceUnitIcon("unit-peasant", "unit-peon");
      }
    case "train-minuteman":
      return exactTrainIcon("unit-attack-peasant");
    case "upgrade-town-center":
      {
        const sourceTarget = sourceTownUpgradeTargetForTypes(world, typeIds, playerId);
        if (sourceTarget) {
          return unitIcon(sourceTarget);
        }
        const townTier = townCenterTierForPlayer(world, playerId);
        return townTier >= 2 ? raceUnitIcon("unit-castle", "unit-fortress") : raceUnitIcon("unit-keep", "unit-stronghold");
      }
    case "upgrade-guard-tower":
      {
        const sourceTarget = sourceTowerUpgradeTargetForTypes(world, typeIds, playerId, "guard");
        return sourceTarget ? unitIcon(sourceTarget) : raceUnitIcon("unit-human-guard-tower", "unit-orc-guard-tower");
      }
    case "upgrade-cannon-tower":
      {
        const sourceTarget = sourceTowerUpgradeTargetForTypes(world, typeIds, playerId, "cannon");
        return sourceTarget ? unitIcon(sourceTarget) : raceUnitIcon("unit-human-cannon-tower", "unit-orc-cannon-tower");
      }
    case "train-melee":
      return trainIcon(commandId, raceUnitIcon("unit-footman", "unit-grunt"));
    case "train-ranged":
      return trainIcon(commandId, raceUnitIcon("unit-archer", "unit-axethrower"));
    case "train-ranged-veteran":
      return trainIcon(commandId, raceUnitIcon("unit-ranger", "unit-berserker"));
    case "train-cavalry-veteran":
      return trainIcon(commandId, raceUnitIcon("unit-paladin", "unit-ogre-mage"));
    case "train-critter":
      return exactTrainIcon("unit-critter");
    case "build-farm":
      return buildIcon(commandId, raceUnitIcon("unit-farm", "unit-pig-farm"));
    case "build-barracks":
      return buildIcon(commandId, raceUnitIcon("unit-human-barracks", "unit-orc-barracks"));
    case "build-lumber-mill":
      return buildIcon(commandId, raceUnitIcon("unit-elven-lumber-mill", "unit-troll-lumber-mill"));
    case "build-blacksmith":
      return buildIcon(commandId, raceUnitIcon("unit-human-blacksmith", "unit-orc-blacksmith"));
    case "build-wall":
      return buildIcon(commandId, raceIcon("icon-human-wall", "icon-orc-wall"));
    case "build-advanced":
      return buildIcon(commandId, raceUnitIcon("unit-stables", "unit-ogre-mound"));
    case "build-guard-tower":
      return buildIcon(commandId, raceUnitIcon("unit-human-watch-tower", "unit-orc-watch-tower"));
    case "build-cannon-tower":
      return buildIcon(commandId, raceUnitIcon("unit-human-cannon-tower", "unit-orc-cannon-tower"));
    case "build-shipyard":
      return buildIcon(commandId, raceUnitIcon("unit-human-shipyard", "unit-orc-shipyard"));
    case "build-foundry":
      return buildIcon(commandId, raceUnitIcon("unit-human-foundry", "unit-orc-foundry"));
    case "build-refinery":
      return buildIcon(commandId, raceUnitIcon("unit-human-refinery", "unit-orc-refinery"));
    case "build-oil-platform":
      return buildIcon(commandId, raceUnitIcon("unit-human-oil-platform", "unit-orc-oil-platform"));
    case "build-caster-building":
      return buildIcon(commandId, raceUnitIcon("unit-mage-tower", "unit-temple-of-the-damned"));
    case "build-holy-building":
      return buildIcon(commandId, raceUnitIcon("unit-church", "unit-altar-of-storms"));
    case "build-air-building":
      return buildIcon(commandId, raceUnitIcon("unit-gryphon-aviary", "unit-dragon-roost"));
    case "build-siege-lab":
      return buildIcon(commandId, raceUnitIcon("unit-inventor", "unit-alchemist"));
    case "research-melee":
      return researchIcon(commandId, upgradeIcon(human ? "upgrade-sword1" : "upgrade-battle-axe1"));
    case "research-armor":
      return researchIcon(commandId, upgradeIcon(human ? "upgrade-human-shield1" : "upgrade-orc-shield1"));
    case "research-ranged":
      return researchIcon(commandId, upgradeIcon(human ? "upgrade-arrow1" : "upgrade-throwing-axe1"));
    case "research-siege":
      return researchIcon(commandId, upgradeIcon(human ? "upgrade-ballista1" : "upgrade-catapult1"));
    case "research-paladin":
      return researchIcon(commandId, upgradeIcon(human ? "upgrade-paladin" : "upgrade-ogre-mage"));
    case "research-healing":
    case "cast-heal":
      return commandId === "research-healing" ? researchIcon(commandId, upgradeIcon("upgrade-healing") ?? "icon-heal") : upgradeIcon("upgrade-healing") ?? "icon-heal";
    case "research-exorcism":
    case "cast-exorcism":
      return commandId === "research-exorcism" ? researchIcon(commandId, upgradeIcon("upgrade-exorcism") ?? "icon-exorcism") : upgradeIcon("upgrade-exorcism") ?? "icon-exorcism";
    case "research-holy-vision":
    case "cast-holy-vision":
      return commandId === "research-holy-vision" ? researchIcon(commandId, upgradeIcon("upgrade-holy-vision")) : upgradeIcon("upgrade-holy-vision");
    case "cast-fireball":
      return upgradeIcon("upgrade-fireball") ?? "icon-fireball";
    case "research-flame-shield":
    case "cast-flame-shield":
      return commandId === "research-flame-shield" ? researchIcon(commandId, upgradeIcon("upgrade-flame-shield")) : upgradeIcon("upgrade-flame-shield");
    case "research-blizzard":
    case "cast-blizzard":
      return commandId === "research-blizzard" ? researchIcon(commandId, upgradeIcon("upgrade-blizzard") ?? "icon-blizzard") : upgradeIcon("upgrade-blizzard") ?? "icon-blizzard";
    case "research-polymorph":
    case "cast-polymorph":
      return commandId === "research-polymorph" ? researchIcon(commandId, upgradeIcon("upgrade-polymorph")) : upgradeIcon("upgrade-polymorph");
    case "research-invisibility":
    case "cast-invisibility":
      return commandId === "research-invisibility" ? researchIcon(commandId, upgradeIcon("upgrade-invisibility")) : upgradeIcon("upgrade-invisibility");
    case "research-slow":
    case "cast-slow":
      return commandId === "research-slow" ? researchIcon(commandId, upgradeIcon("upgrade-slow") ?? "icon-slow") : upgradeIcon("upgrade-slow") ?? "icon-slow";
    case "research-death-coil":
    case "cast-death-coil":
      return commandId === "research-death-coil" ? researchIcon(commandId, upgradeIcon("upgrade-death-coil")) : upgradeIcon("upgrade-death-coil");
    case "research-death-magic":
    case "cast-death-and-decay":
      return commandId === "research-death-magic" ? researchIcon(commandId, upgradeIcon("upgrade-death-and-decay")) : upgradeIcon("upgrade-death-and-decay");
    case "research-whirlwind":
    case "cast-whirlwind":
      return commandId === "research-whirlwind" ? researchIcon(commandId, upgradeIcon("upgrade-whirlwind")) : upgradeIcon("upgrade-whirlwind");
    case "research-raise-dead":
    case "cast-raise-dead":
      return commandId === "research-raise-dead" ? researchIcon(commandId, upgradeIcon("upgrade-raise-dead")) : upgradeIcon("upgrade-raise-dead");
    case "research-unholy-armor":
    case "cast-unholy-armor":
      return commandId === "research-unholy-armor" ? researchIcon(commandId, upgradeIcon("upgrade-unholy-armor")) : upgradeIcon("upgrade-unholy-armor");
    case "research-haste":
    case "cast-haste":
      return commandId === "research-haste" ? researchIcon(commandId, upgradeIcon("upgrade-haste")) : upgradeIcon("upgrade-haste");
    case "research-bloodlust":
    case "cast-bloodlust":
      return commandId === "research-bloodlust" ? researchIcon(commandId, upgradeIcon("upgrade-bloodlust") ?? "icon-bloodlust") : upgradeIcon("upgrade-bloodlust") ?? "icon-bloodlust";
    case "research-runes":
    case "cast-runes":
      return commandId === "research-runes" ? researchIcon(commandId, upgradeIcon("upgrade-runes") ?? "icon-runes") : upgradeIcon("upgrade-runes") ?? "icon-runes";
    case "research-eye-of-kilrogg":
    case "cast-eye-of-kilrogg":
      return commandId === "research-eye-of-kilrogg" ? researchIcon(commandId, upgradeIcon("upgrade-eye-of-kilrogg") ?? unitIcon("unit-eye-of-vision") ?? unitIcon("unit-eye-of-kilrogg")) : upgradeIcon("upgrade-eye-of-kilrogg") ?? unitIcon("unit-eye-of-vision") ?? unitIcon("unit-eye-of-kilrogg");
    case "train-cavalry":
      return trainIcon(commandId, raceUnitIcon("unit-knight", "unit-ogre"));
    case "train-tanker":
      return trainIcon(commandId, raceUnitIcon("unit-human-oil-tanker", "unit-orc-oil-tanker"));
    case "train-destroyer":
      return trainIcon(commandId, raceUnitIcon("unit-human-destroyer", "unit-orc-destroyer"));
    case "train-warship":
      return trainIcon(commandId, raceUnitIcon("unit-battleship", "unit-ogre-juggernaught"));
    case "train-transport":
      return trainIcon(commandId, raceUnitIcon("unit-human-transport", "unit-orc-transport"));
    case "train-submarine":
      return trainIcon(commandId, raceUnitIcon("unit-human-submarine", "unit-orc-submarine"));
    case "research-ship-cannon":
      return researchIcon(commandId, upgradeIcon(human ? "upgrade-human-ship-cannon1" : "upgrade-orc-ship-cannon1"));
    case "research-ship-armor":
      return researchIcon(commandId, upgradeIcon(human ? "upgrade-human-ship-armor1" : "upgrade-orc-ship-armor1"));
    case "load-transport":
      return raceIcon("icon-human-transport", "icon-orc-transport");
    case "unload-transport":
      return raceIcon("icon-human-unload", "icon-orc-unload");
    case "train-caster":
      return trainIcon(commandId, raceUnitIcon("unit-mage", "unit-death-knight"));
    case "train-air":
      return trainIcon(commandId, raceUnitIcon("unit-gryphon-rider", "unit-dragon"));
    case "train-demolition":
      return trainIcon(commandId, raceUnitIcon("unit-dwarves", "unit-goblin-sappers"));
    case "train-siege":
      return trainIcon(commandId, raceUnitIcon("unit-ballista", "unit-catapult"));
    case "train-scout-air":
      return trainIcon(commandId, raceUnitIcon("unit-balloon", "unit-zeppelin"));
  }
  return null;
}

function canCastHudSpell(world: WorldState, readyUnits: WorldState["units"], playerId: number, command: TargetedSpellCommand): boolean {
  return selectedCanCastTargetedSpell(world, readyUnits.map((unit) => unit.id), command, playerId);
}

function drawMinimap(
  layer: Container,
  graphics: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  world: WorldState,
  camera: Camera,
  sourceViewportCameras: readonly Camera[],
  alertPings: Array<{ x: number; y: number; createdAt: number; expiresAt: number }>,
  screenWidth: number,
  screenHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  onMinimapPoint: (tileX: number, tileY: number, input: { button: number; shiftKey: boolean }) => void
): void {
  graphics.rect(x, y, width, height);
  graphics.fill(0x070604);
  const scale = Math.min(width / world.map.width, height / world.map.height);
  const ox = x + (width - world.map.width * scale) / 2;
  const oy = y + (height - world.map.height * scale) / 2;
  const mapPixelWidth = world.map.width * scale;
  const mapPixelHeight = world.map.height * scale;

  for (let row = 0; row < world.map.height; row += 1) {
    for (let col = 0; col < world.map.width; col += 1) {
      const tile = world.tiles[row * world.map.width + col] ?? 1;
      const index = row * world.map.width + col;
      if (world.engineSettings.minimapWithTerrainDefault) {
        const color = minimapTerrainColorForTile(world, tile);
        graphics.rect(ox + col * scale, oy + row * scale, Math.ceil(scale), Math.ceil(scale));
        graphics.fill(color);
      }
      if (world.engineSettings.fogOfWarEnabled && world.visibleTiles[index] === 0) {
        const alpha = sourceMinimapFogAlpha(world, col, row);
        graphics.rect(ox + col * scale, oy + row * scale, Math.ceil(scale), Math.ceil(scale));
        graphics.fill({ color: 0x000000, alpha });
      }
    }
  }

  for (const unit of world.units) {
    if (isInvisibleUtilityUnit(unit)) {
      continue;
    }
    if (!isUnitVisibleToPlayer(world, unit, world.visibilityPlayer)) {
      continue;
    }
    graphics.circle(ox + (unit.x / world.tileSize) * scale, oy + (unit.y / world.tileSize) * scale, 2);
    graphics.fill(minimapColorForUnit(world, unit));
  }

  for (const building of world.lastSeenBuildings) {
    if (isLastSeenBuildingVisibleOnMinimap(world, building)) {
      continue;
    }
    graphics.rect(
      ox + (building.x / world.tileSize) * scale - 1.5,
      oy + (building.y / world.tileSize) * scale - 1.5,
      3,
      3
    );
    graphics.fill({ color: minimapColorForPlayer(world, building.player), alpha: 0.58 });
  }

  const now = performance.now();
  for (const ping of alertPings) {
    const progress = Math.max(0, Math.min(1, (now - ping.createdAt) / Math.max(1, ping.expiresAt - ping.createdAt)));
    const px = ox + (ping.x / world.tileSize) * scale;
    const py = oy + (ping.y / world.tileSize) * scale;
    const radius = 4 + progress * 10;
    const alpha = 0.95 * (1 - progress);
    graphics.circle(px, py, radius);
    graphics.stroke({ width: 2, color: 0xd95d45, alpha });
    graphics.rect(px - radius, py - radius, radius * 2, radius * 2);
    graphics.stroke({ width: 1, color: 0xf0df9a, alpha: alpha * 0.7 });
  }

  const viewportWorldRects = sourceViewportWorldRects(world, camera, screenWidth, screenHeight, sourceViewportCameras);
  for (const [index, view] of viewportWorldRects.entries()) {
    const viewCamera = sourceViewportCameras[index] ?? camera;
    const viewX = ox + (view.x / world.tileSize) * scale;
    const viewY = oy + (view.y / world.tileSize) * scale;
    const viewWidth = Math.min(mapPixelWidth, (Math.min(view.width, viewportWidth / viewCamera.zoom) / world.tileSize) * scale);
    const viewHeight = Math.min(mapPixelHeight, (Math.min(view.height, viewportHeight / viewCamera.zoom) / world.tileSize) * scale);
    graphics.rect(viewX, viewY, viewWidth, viewHeight);
    graphics.stroke({ width: 1, color: 0xf0df9a, alpha: 0.95 });
  }

  const hit = new Graphics();
  hit.rect(ox, oy, mapPixelWidth, mapPixelHeight);
  hit.fill({ color: 0xffffff, alpha: 0.001 });
  hit.eventMode = "static";
  hit.cursor = "pointer";
  const jump = (globalX: number, globalY: number, input: { button: number; shiftKey: boolean }): void => {
    const tileX = Math.max(0, Math.min(world.map.width - 1, Math.floor((globalX - ox) / scale)));
    const tileY = Math.max(0, Math.min(world.map.height - 1, Math.floor((globalY - oy) / scale)));
    onMinimapPoint(tileX, tileY, input);
  };
  hit.on("pointerdown", (event) => {
    const nativeEvent = event.nativeEvent;
    jump(event.global.x, event.global.y, {
      button: nativeEvent instanceof PointerEvent ? nativeEvent.button : event.button,
      shiftKey: nativeEvent instanceof PointerEvent ? nativeEvent.shiftKey : false
    });
  });
  hit.on("pointermove", (event) => {
    if (event.buttons === 1) {
      const nativeEvent = event.nativeEvent;
      jump(event.global.x, event.global.y, {
        button: 0,
        shiftKey: nativeEvent instanceof PointerEvent ? nativeEvent.shiftKey : false
      });
    }
  });
  layer.addChild(hit);
}

function drawSourceViewportModeOverlay(graphics: Graphics, world: WorldState, screenWidth: number, screenHeight: number, activeIndex: number): void {
  const rects = sourceViewportModeRects(world, screenWidth, screenHeight);
  if (rects.length <= 1) {
    return;
  }
  for (const [index, rect] of rects.entries()) {
    graphics.rect(rect.x, rect.y, rect.width, rect.height);
    graphics.stroke({ width: index === activeIndex ? 3 : 2, color: index === activeIndex ? 0x78d26f : 0xf0df9a, alpha: index === activeIndex ? 0.64 : 0.42 });
  }
}

function sourceMinimapFogAlpha(world: WorldState, x: number, y: number): number {
  const fogLevels = world.engineSettings.minimapFogOfWarOpacityLevels;
  if (!isWorldTileSourceKnown(world, x, y)) {
    return fogByteToAlpha(fogLevels[2]);
  }
  return minimapTileTouchesVisibleTile(world, x, y) ? fogByteToAlpha(fogLevels[1]) : fogByteToAlpha(fogLevels[0]);
}

function minimapTileTouchesVisibleTile(world: WorldState, x: number, y: number): boolean {
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      if (ox === 0 && oy === 0) {
        continue;
      }
      const tx = x + ox;
      const ty = y + oy;
      if (tx < 0 || ty < 0 || tx >= world.map.width || ty >= world.map.height) {
        continue;
      }
      if (world.visibleTiles[ty * world.map.width + tx] === 1) {
        return true;
      }
    }
  }
  return false;
}

function minimapTerrainColorForTile(world: WorldState, tile: number): number {
  const flags = sourceTilesetFlagsForTile(world, tile);
  const tilesetName = world.tilesetTerrain?.name ?? "";
  if (flags.includes("water")) {
    return sourceTilesetMinimapTint(tilesetName, "water");
  }
  if (flags.includes("forest")) {
    return sourceTilesetMinimapTint(tilesetName, "forest");
  }
  if (flags.includes("wall")) {
    return sourceTilesetMinimapTint(tilesetName, "wall");
  }
  if (flags.includes("rock")) {
    return sourceTilesetMinimapTint(tilesetName, "rock");
  }
  if (flags.includes("coast")) {
    return sourceTilesetMinimapTint(tilesetName, "coast");
  }
  return sourceTilesetMinimapTint(tilesetName, "land");
}

function sourceTilesetFlagsForTile(world: WorldState, tile: number): string[] {
  if (tile === 126) {
    return ["land"];
  }
  const slot = sourceTileSlot(tile);
  return world.tilesetTerrain?.slots.find((entry) => entry.slot === slot)?.flags ?? [];
}

function sourceTileSlot(tile: number): number {
  return tile & 0xfff0;
}

function sourceTilesetMinimapTint(tilesetName: string, terrain: "coast" | "forest" | "land" | "rock" | "wall" | "water"): number {
  const family = tilesetName.toLowerCase();
  if (family.includes("winter")) {
    return {
      coast: 0x9aa7a7,
      forest: 0x36534a,
      land: 0xb7c4bc,
      rock: 0x6f7978,
      wall: 0x7f8986,
      water: 0x3f677a
    }[terrain];
  }
  if (family.includes("swamp")) {
    return {
      coast: 0x6b7440,
      forest: 0x214a32,
      land: 0x596a35,
      rock: 0x565a44,
      wall: 0x646350,
      water: 0x244f4f
    }[terrain];
  }
  if (family.includes("wasteland")) {
    return {
      coast: 0x927948,
      forest: 0x46502f,
      land: 0x8c6d3c,
      rock: 0x5f5145,
      wall: 0x735d48,
      water: 0x344f62
    }[terrain];
  }
  return {
    coast: 0xb99b43,
    forest: 0x255434,
    land: 0x5d7a3e,
    rock: 0x6a5e47,
    wall: 0x7c7040,
    water: 0x2a6377
  }[terrain];
}

function minimapColorForUnit(world: WorldState, unit: WorldState["units"][number]): number {
  if (unit.neutral || unit.player === 15) {
    return rgbToHex(unit.neutralMinimapColor ?? [192, 192, 192]);
  }
  return minimapColorForPlayer(world, unit.player);
}

function minimapColorForPlayer(world: WorldState, playerId: number): number {
  return sourcePlayerColor(world, playerId);
}

function isLastSeenBuildingVisibleOnMinimap(world: WorldState, building: WorldState["lastSeenBuildings"][number]): boolean {
  const definition = world.unitDefinitions.find((unit) => unit.id === building.typeId);
  return isUnitFootprintVisibleToPlayer(world, {
    x: building.x,
    y: building.y,
    radius: building.radius,
    tileWidth: definition?.tileSize?.[0] ?? Math.max(1, Math.ceil((building.radius * 2) / world.tileSize)),
    tileHeight: definition?.tileSize?.[1] ?? Math.max(1, Math.ceil((building.radius * 2) / world.tileSize))
  }, world.visibilityPlayer);
}

function drawMatchOverlay(
  app: Application,
  layer: Container,
  manifest: WargusManifest,
  world: WorldState,
  nextCampaignMap: WargusMap | null,
  bitmapFonts: WargusBitmapFontAtlas | null,
  onNextMission: () => void,
  onRestart: () => void,
  onChooseMap: () => void
): void {
  if (world.matchState.status === "playing") {
    return;
  }
  const localPlayer = world.players.find((player) => player.id === world.visibilityPlayer);
  const localRace = localPlayer?.race === "orc" ? "orc" : "human";
  const sourceScreen = sourceResultScreen(manifest, world.matchState.status, localRace);
  if (sourceScreen) {
    const sprite = Sprite.from(`/wargus/graphics/${sourceScreen.image}`);
    const scale = Math.max(app.screen.width / Math.max(sprite.texture.width, 1), app.screen.height / Math.max(sprite.texture.height, 1));
    sprite.scale.set(scale);
    sprite.x = (app.screen.width - sprite.texture.width * scale) / 2;
    sprite.y = (app.screen.height - sprite.texture.height * scale) / 2;
    layer.addChild(sprite);
  }
  const overlay = new Graphics();
  overlay.rect(0, 0, app.screen.width, app.screen.height);
  overlay.fill({ color: 0x050708, alpha: sourceScreen ? 0.34 : 0.55 });
  layer.addChild(overlay);

  const titleText = world.matchState.status === "victory" ? "Victory" : world.matchState.status === "draw" ? "Draw" : "Defeat";
  const titlePalette = world.matchState.status === "victory" ? "normal" : world.matchState.status === "draw" ? "normal" : "reverse";
  const titleColor = world.matchState.status === "victory" ? 0xf0df9a : world.matchState.status === "draw" ? 0xd8d3bd : 0xd95d45;
  const title = addHudText(layer, bitmapFonts, {
    text: titleText,
    fontId: "large",
    color: sourceTextColorNumber(manifest, localRace, titlePalette, titleColor),
    paletteId: sourceTextPaletteId(manifest, localRace, titlePalette),
    x: app.screen.width / 2,
    y: app.screen.height / 2 - 142,
    anchorX: 0.5,
    fallbackStyle: {
      fill: sourceTextColorCss(manifest, localRace, titlePalette, world.matchState.status === "victory" ? "#f0df9a" : world.matchState.status === "draw" ? "#d8d3bd" : "#d95d45"),
      fontSize: 56,
      fontFamily: "system-ui, sans-serif",
      fontWeight: "800"
    }
  });
  title.scale.set(bitmapFonts ? 1.25 : 1);

  const rows = world.players
    .filter((player) => player.id !== 15)
    .sort((a, b) => sourceResultScoreForPlayer(world, b) - sourceResultScoreForPlayer(world, a))
    .slice(0, 6);
  const scoreLines = [
    sourceResultScoreHeader(world),
    ...rows.map((player) => {
      const stats = player.stats;
      const label = `${sourcePlayerDisplayName(player)}${player.id === world.matchState.winner ? " *" : ""}`;
      return [
        label.padEnd(10, " "),
        String(stats.totalUnits).padStart(5, " "),
        String(stats.totalBuildings).padStart(5, " "),
        String(stats.goldMined).padStart(5, " "),
        String(stats.woodHarvested).padStart(5, " "),
        String(stats.oilHarvested).padStart(4, " "),
        String(stats.unitsKilled).padStart(5, " "),
        String(stats.buildingsRazed).padStart(5, " "),
        String(sourceResultScoreForPlayer(world, player)).padStart(5, " ")
      ].join(" ");
    })
  ];
  const scoreTable = addHudText(layer, bitmapFonts, {
    text: scoreLines.join("\n"),
    fontId: "game",
    color: 0xd8d3bd,
    x: app.screen.width / 2,
    y: app.screen.height / 2 - 66,
    anchorX: 0.5,
    lineHeight: 18,
    fallbackStyle: {
      fill: "#d8d3bd",
      fontSize: 14,
      fontFamily: "monospace",
      lineHeight: 21
    }
  });
  scoreTable.scale.set(bitmapFonts ? 0.72 : 1);

  const rankLine = localPlayer
    ? `Rank ${sourceResultRankForPlayer(manifest, world, localPlayer)}    Score ${sourceResultScoreForPlayer(world, localPlayer)}    Tick ${world.matchState.endedTick}`
    : `Ended at tick ${world.matchState.endedTick}`;
  const subtitle = addHudText(layer, bitmapFonts, {
    text: rankLine,
    fontId: "game",
    color: 0xd8d3bd,
    x: app.screen.width / 2,
    y: app.screen.height / 2 + 104,
    anchorX: 0.5,
    fallbackStyle: {
      fill: "#d8d3bd",
      fontSize: 16,
      fontFamily: "system-ui, sans-serif"
    }
  });
  subtitle.scale.set(bitmapFonts ? 0.82 : 1);

  const buttonY = app.screen.height / 2 + 134;
  const buttons: Array<{ label: string; x: number; onTap: () => void }> = [];
  if (world.matchState.status === "victory" && nextCampaignMap) {
    buttons.push({ label: "Next Mission", x: app.screen.width / 2 - 244, onTap: onNextMission });
  }
  buttons.push(
    { label: "Restart", x: app.screen.width / 2 - 78, onTap: onRestart },
    { label: "Map List", x: app.screen.width / 2 + 88, onTap: onChooseMap }
  );
  for (const button of buttons) {
    drawBriefingButton(layer, button.x, buttonY, 156, 34, button.label, manifest, localRace, bitmapFonts, button.onTap);
  }

  if (world.matchState.status === "victory" && nextCampaignMap) {
    const nextTitle = nextCampaignMap.title === "(unnamed)" ? nextCampaignMap.path : nextCampaignMap.title;
    const next = addHudText(layer, bitmapFonts, {
      text: nextTitle,
      fontId: "game",
      color: 0x8f876d,
      x: app.screen.width / 2 - 166,
      y: buttonY + 40,
      anchorX: 0.5,
      maxWidth: 320,
      fallbackStyle: { fill: "#8f876d", fontSize: 12, fontFamily: "system-ui, sans-serif", wordWrap: true, wordWrapWidth: 320, align: "center" }
    });
    next.scale.set(bitmapFonts ? 0.7 : 1);
  }
}

function drawBriefingOverlay(app: Application, layer: Container, manifest: WargusManifest, world: WorldState, open: boolean, bitmapFonts: WargusBitmapFontAtlas | null, onDismiss: () => void, onReplay: () => void): void {
  if (!open || !world.briefingText || world.matchState.status !== "playing") {
    return;
  }
  const overlay = new Graphics();
  overlay.rect(0, 0, app.screen.width, app.screen.height);
  overlay.fill({ color: 0x050708, alpha: 0.82 });
  layer.addChild(overlay);

  const frame = sourceBriefingFrame(app, world.engineSettings.briefingLayout);
  const { x, y, width, height, scale, layout } = frame;
  const panel = new Graphics();
  panel.rect(x, y, width, height);
  panel.fill(0x12100c);
  panel.rect(x, y, width, height);
  panel.stroke({ width: 2, color: 0x8b7346, alpha: 1 });
  layer.addChild(panel);

  const visibleRace = world.players.find((player) => player.id === world.visibilityPlayer)?.race === "orc" ? "orc" : "human";
  const title = addHudText(layer, bitmapFonts, {
    text: world.map.title === "(unnamed)" ? world.map.path : world.map.title,
    fontId: "large",
    color: sourceTextColorNumber(manifest, visibleRace, "normal", 0xf0df9a),
    paletteId: sourceTextPaletteId(manifest, visibleRace, "normal"),
    x: x + layout.titleX * scale,
    y: y + layout.titleY * scale,
    anchorX: 0.5,
    maxWidth: Math.max(180, 340 * scale),
    lineHeight: Math.max(17, Math.round(18 * scale)),
    fallbackStyle: { fill: sourceTextColorCss(manifest, visibleRace, "normal", "#f0df9a"), fontSize: Math.max(18, Math.round(26 * scale)), fontFamily: "system-ui, sans-serif", fontWeight: "800", wordWrap: true, wordWrapWidth: Math.max(180, 340 * scale), align: "center" }
  });
  title.scale.set(bitmapFonts ? Math.max(0.75, Math.min(1.2, scale)) : 1);

  const body = addHudText(layer, bitmapFonts, {
    text: world.briefingText,
    fontId: "large",
    color: 0xd8d3bd,
    x: x + layout.textX * scale,
    y: y + layout.textY * scale,
    maxWidth: Math.max(180, layout.textWidth * scale),
    lineHeight: Math.max(17, Math.round(20 * scale)),
    fallbackStyle: { fill: "#d8d3bd", fontSize: Math.max(12, Math.round(15 * scale)), fontFamily: "system-ui, sans-serif", lineHeight: Math.max(17, Math.round(22 * scale)), wordWrap: true, wordWrapWidth: Math.max(180, layout.textWidth * scale) }
  });
  body.scale.set(bitmapFonts ? Math.max(0.55, Math.min(0.9, scale * 0.78)) : 1);

  if (world.objectives.length > 0) {
    const objectivesTitle = addHudText(layer, bitmapFonts, {
      text: "Objectives:",
      fontId: "large",
      color: sourceTextColorNumber(manifest, visibleRace, "normal", 0xf0df9a),
      paletteId: sourceTextPaletteId(manifest, visibleRace, "normal"),
      x: x + layout.objectivesX * scale,
      y: y + layout.objectivesY * scale,
      fallbackStyle: { fill: sourceTextColorCss(manifest, visibleRace, "normal", "#f0df9a"), fontSize: Math.max(13, Math.round(17 * scale)), fontFamily: "system-ui, sans-serif", fontWeight: "700" }
    });
    objectivesTitle.scale.set(bitmapFonts ? Math.max(0.6, Math.min(0.9, scale * 0.72)) : 1);
    const objectivesText = addHudText(layer, bitmapFonts, {
      text: world.objectives.join("\n"),
      fontId: "large",
      color: 0xd8d3bd,
      x: x + layout.objectivesX * scale,
      y: y + (layout.objectivesY + 30) * scale,
      maxWidth: Math.max(180, layout.objectivesWidth * scale),
      lineHeight: Math.max(16, Math.round(20 * scale)),
      fallbackStyle: { fill: "#d8d3bd", fontSize: Math.max(12, Math.round(14 * scale)), fontFamily: "system-ui, sans-serif", lineHeight: Math.max(16, Math.round(20 * scale)), wordWrap: true, wordWrapWidth: Math.max(180, layout.objectivesWidth * scale) }
    });
    objectivesText.scale.set(bitmapFonts ? Math.max(0.5, Math.min(0.82, scale * 0.7)) : 1);
  }

  const buttonWidth = Math.max(104, Math.round(125 * scale));
  const buttonHeight = Math.max(30, Math.round(34 * scale));
  const bx = x + layout.continueButtonX * scale;
  const by = y + layout.continueButtonY * scale;
  drawBriefingButton(layer, bx, by, buttonWidth, buttonHeight, "Continue", manifest, visibleRace, bitmapFonts, onDismiss);
  if (world.briefingVoiceFiles.length > 0) {
    drawBriefingButton(layer, bx - layout.exitButtonOffsetX * scale, by, buttonWidth, buttonHeight, "Narration", manifest, visibleRace, bitmapFonts, onReplay);
  }
}

function sourceBriefingFrame(app: Application, layout: WargusBriefingLayout | null): { x: number; y: number; width: number; height: number; scale: number; layout: WargusBriefingLayout } {
  const sourceLayout = layout ?? {
    baseWidth: 640,
    baseHeight: 480,
    titleX: 205,
    titleY: 28,
    textX: 70,
    textY: 80,
    textWidth: 320,
    objectivesX: 70,
    objectivesY: 306,
    objectivesWidth: 250,
    continueButtonX: 455,
    continueButtonY: 440,
    exitButtonOffsetX: 133,
    characterXOffsetFromRight: 450,
    characterY: 10
  };
  const scale = Math.min((app.screen.width - 24) / sourceLayout.baseWidth, (app.screen.height - 24) / sourceLayout.baseHeight, 1.35);
  const width = sourceLayout.baseWidth * scale;
  const height = sourceLayout.baseHeight * scale;
  return {
    x: (app.screen.width - width) / 2,
    y: (app.screen.height - height) / 2,
    width,
    height,
    scale,
    layout: sourceLayout
  };
}

function drawBriefingButton(
  layer: Container,
  x: number,
  y: number,
  width: number,
  height: number,
  labelText: string,
  manifest: WargusManifest,
  race: "human" | "orc",
  bitmapFonts: WargusBitmapFontAtlas | null,
  onTap: () => void,
  disabled = false
): void {
  const button = new Graphics();
  button.rect(x, y, width, height);
  button.fill(disabled ? 0x15110c : 0x2a2118);
  button.rect(x, y, width, height);
  button.stroke({ width: 1, color: disabled ? 0x6e6045 : 0xf0df9a, alpha: disabled ? 0.72 : 1 });
  if (!disabled) {
    button.eventMode = "static";
    button.cursor = "pointer";
    button.on("pointertap", () => onTap());
  }
  layer.addChild(button);

  const label = addHudText(layer, bitmapFonts ?? null, {
    text: labelText,
    fontId: "game",
    color: disabled ? 0x8a8370 : sourceTextColorNumber(manifest, race ?? "human", "normal", 0xf0df9a),
    paletteId: disabled ? undefined : sourceTextPaletteId(manifest, race ?? "human", "normal"),
    x: x + width / 2,
    y: y + height / 2 - (bitmapFonts ? 6 : 0),
    anchorX: 0.5,
    fallbackStyle: { fill: disabled ? "#8a8370" : sourceTextColorCss(manifest, race ?? "human", "normal", "#f0df9a"), fontSize: 15, fontFamily: "system-ui, sans-serif", fontWeight: "800" }
  });
  label.scale.set(bitmapFonts ? 0.9 : 1);
}

function drawSourceTitleScreen(app: Application, layer: Container, manifest: WargusManifest, world: WorldState, open: boolean, bitmapFonts: WargusBitmapFontAtlas | null, onBegin: () => void, onChooseMap: () => void): void {
  if (!open) {
    return;
  }
  const background = new Graphics();
  background.rect(0, 0, app.screen.width, app.screen.height);
  background.fill(0x000000);
  layer.addChild(background);

  const sourceTitle = sourceTitleScreen(manifest);
  if (sourceTitle) {
    const sprite = Sprite.from(`/wargus/graphics/${sourceTitle.image}`);
    const keepRatio = world.engineSettings.keepRatioDefault !== false;
    const scale = sourceTitle.stretchMode === "stretch" && !keepRatio
      ? Math.max(app.screen.width / Math.max(sprite.texture.width, 1), app.screen.height / Math.max(sprite.texture.height, 1))
      : Math.min(app.screen.width / Math.max(sprite.texture.width, 1), app.screen.height / Math.max(sprite.texture.height, 1));
    sprite.scale.set(scale);
    sprite.x = (app.screen.width - sprite.texture.width * scale) / 2;
    sprite.y = (app.screen.height - sprite.texture.height * scale) / 2;
    layer.addChild(sprite);
  }

  const compactTitle = app.screen.width < 620;
  const shadeHeight = compactTitle ? 156 : 116;
  const shade = new Graphics();
  shade.rect(0, app.screen.height - shadeHeight, app.screen.width, shadeHeight);
  shade.fill({ color: 0x000000, alpha: 0.58 });
  layer.addChild(shade);

  const title = addHudText(layer, bitmapFonts, {
    text: "Wargus",
    fontId: "large",
    color: sourceTextColorNumber(manifest, "human", "normal", 0xf0df9a),
    paletteId: sourceTextPaletteId(manifest, "human", "normal"),
    x: 28,
    y: app.screen.height - (compactTitle ? 146 : 96),
    fallbackStyle: { fill: sourceTextColorCss(manifest, "human", "normal", "#f0df9a"), fontSize: 30, fontFamily: "system-ui, sans-serif", fontWeight: "800" }
  });
  title.scale.set(bitmapFonts ? 0.9 : 1);

  const tip = sourceTitleTip(manifest, world);
  if (tip) {
    const tipText = addHudText(layer, bitmapFonts, {
      text: tip,
      fontId: "game",
      color: 0xd9c27b,
      x: 28,
      y: app.screen.height - (compactTitle ? 110 : 54),
      maxWidth: compactTitle ? Math.max(180, app.screen.width - 56) : Math.min(620, Math.max(180, app.screen.width - 370)),
      lineHeight: 18,
      fallbackStyle: {
        fill: "#d9c27b",
        fontSize: 14,
        fontFamily: "system-ui, sans-serif",
        lineHeight: 18,
        wordWrap: true,
        wordWrapWidth: compactTitle ? Math.max(180, app.screen.width - 56) : Math.min(620, Math.max(180, app.screen.width - 370))
      }
    });
    tipText.scale.set(bitmapFonts ? 0.74 : 1);
  }

  const startWidth = 150;
  const mapWidth = 150;
  const buttonY = app.screen.height - 74;
  drawBriefingButton(layer, app.screen.width - startWidth - 28, buttonY, startWidth, 38, "Begin", manifest, "human", bitmapFonts, onBegin);
  drawBriefingButton(layer, app.screen.width - startWidth - mapWidth - 42, buttonY, mapWidth, 38, "Maps", manifest, "human", bitmapFonts, onChooseMap);
}
