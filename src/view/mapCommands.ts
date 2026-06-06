import { addPlayerResource, nextGameSpeed, previousGameSpeed, sourceGameSpeedFromMultiplier } from "../simulation/orders";
import type { WorldState } from "../simulation/world";
import { mapsForPicker } from "../wargus/manifest";
import type { WargusEngineSettings, WargusManifest, WargusMap } from "../wargus/types";
import type { HudMapCommandId, HudMenuOverlayId } from "./renderHud";
import { nextSourceViewportMode, sourcePlayerDisplayName, type SourceDiplomacyDraft, type SourceDiplomacyDraftRow } from "./sourceUiHelpers";
import {
  advanceSaveSlot,
  exportSaveToFile,
  importSaveFromFile,
  loadCurrentAutosave,
  loadCurrentSaveSlot,
  saveCurrentGame,
  type SaveCommandContext,
  type SaveCommandState
} from "./saveCommands";

export interface MapCommandState {
  paused: boolean;
  gameSpeed: number;
  mapPicker: { open: boolean; query: string; maps: WargusMap[] };
  menuOverlay: HudMenuOverlayId | null;
  diplomacyDraft: SourceDiplomacyDraft | null;
  preferencesDraft: WargusEngineSettings | null;
}

export interface MapCommandContext {
  manifest: WargusManifest;
  activeMap: WargusMap;
  world: WorldState | null;
  saveCommandState: SaveCommandState;
  saveCommandContext: () => SaveCommandContext;
  state: MapCommandState;
  addHudMessage: (text: string, lifetimeMs?: number) => void;
  saveCurrentAutosave: () => void;
  syncAudioSettings: () => void;
  loadPlayableMap: (map: WargusMap) => Promise<void>;
}

export async function executeMapCommandForRuntime(command: HudMapCommandId, context: MapCommandContext): Promise<void> {
  if (command === "save-game") {
    saveCurrentGame(context.saveCommandState, context.saveCommandContext());
    context.state.menuOverlay = "save-menu";
    return;
  }
  if (command === "load-game") {
    await loadCurrentSaveSlot(context.saveCommandState, context.saveCommandContext());
    return;
  }
  if (command === "next-save-slot") {
    advanceSaveSlot(context.saveCommandState, context.saveCommandContext());
    if (context.state.menuOverlay === "save-menu" || context.state.menuOverlay === "load-menu") {
      context.state.menuOverlay = context.state.menuOverlay;
    }
    return;
  }
  if (command === "export-save") {
    exportSaveToFile(context.saveCommandState, context.saveCommandContext());
    context.state.menuOverlay = "save-menu";
    return;
  }
  if (command === "import-save") {
    await importSaveFromFile(context.saveCommandState, context.saveCommandContext());
    context.state.menuOverlay = "load-menu";
    return;
  }
  if (command === "load-autosave") {
    await loadCurrentAutosave(context.saveCommandContext());
    return;
  }
  if (command === "toggle-pause") {
    context.state.paused = !context.state.paused;
    context.state.menuOverlay = null;
    return;
  }
  if (command === "surrender") {
    if (context.world?.matchState.status === "playing") {
      context.world.matchState = { status: "draw", winner: null, endedTick: context.world.tick };
      context.state.paused = false;
      context.state.menuOverlay = null;
      context.addHudMessage("You have withdrawn from the battle.");
    }
    return;
  }
  if (command === "slower-game") {
    context.state.gameSpeed = previousGameSpeed(context.state.gameSpeed, context.world);
    if (context.world) {
      context.world.engineSettings.sourceGameSpeedDefault = sourceGameSpeedFromMultiplier(context.world, context.state.gameSpeed);
    }
    return;
  }
  if (command === "faster-game") {
    context.state.gameSpeed = nextGameSpeed(context.state.gameSpeed, context.world);
    if (context.world) {
      context.world.engineSettings.sourceGameSpeedDefault = sourceGameSpeedFromMultiplier(context.world, context.state.gameSpeed);
    }
    return;
  }
  if (command === "easier-ai" || command === "harder-ai") {
    if (context.world) {
      context.world.engineSettings.lastDifficultyDefault = steppedSourceDifficulty(context.world.engineSettings.lastDifficultyDefault, command === "harder-ai" ? 1 : -1);
      context.state.menuOverlay = "speed-options";
    }
    return;
  }
  if (command === "speed-options-ok" || command === "speed-options-cancel") {
    context.state.menuOverlay = "game-options";
    return;
  }
  if (command === "preferences-ok") {
    context.state.preferencesDraft = null;
    context.state.menuOverlay = "game-options";
    return;
  }
  if (command === "preferences-cancel") {
    if (context.world && context.state.preferencesDraft) {
      Object.assign(context.world.engineSettings, cloneEngineSettings(context.state.preferencesDraft));
      context.syncAudioSettings();
    }
    context.state.preferencesDraft = null;
    context.state.menuOverlay = "game-options";
    return;
  }
  if (command === "toggle-messages") {
    if (context.world) {
      context.world.engineSettings.showMessagesDefault = !context.world.engineSettings.showMessagesDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-command-keys") {
    if (context.world) {
      context.world.engineSettings.showCommandKeyDefault = !context.world.engineSettings.showCommandKeyDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-button-popups") {
    if (context.world) {
      context.world.engineSettings.showButtonPopupsDefault = !context.world.engineSettings.showButtonPopupsDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-status-line-tooltips") {
    if (context.world) {
      context.world.engineSettings.noStatusLineTooltipsDefault = !context.world.engineSettings.noStatusLineTooltipsDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-map-grid") {
    if (context.world) {
      context.world.engineSettings.mapGridDefault = !context.world.engineSettings.mapGridDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-show-orders") {
    if (context.world) {
      context.world.engineSettings.showOrdersDefault = !context.world.engineSettings.showOrdersDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-show-damage") {
    if (context.world) {
      context.world.engineSettings.showDamageDefault = !context.world.engineSettings.showDamageDefault;
      if (context.world.engineSettings.showDamageDefault && !context.world.engineSettings.damageMissileId) {
        context.world.engineSettings.damageMissileId = sourceDamageMissileIdForRuntime(context.world);
      }
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-show-sight-range") {
    if (context.world) {
      context.world.engineSettings.showSightRangeDefault = !context.world.engineSettings.showSightRangeDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-show-attack-range") {
    if (context.world) {
      context.world.engineSettings.showAttackRangeDefault = !context.world.engineSettings.showAttackRangeDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-show-reaction-range") {
    if (context.world) {
      context.world.engineSettings.showReactionRangeDefault = !context.world.engineSettings.showReactionRangeDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-single-player-walls") {
    if (context.world) {
      toggleDebugFlag(context.world, "single-player-walls");
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-highlight-passability") {
    if (context.world) {
      context.world.engineSettings.highlightPassabilityDefault = !context.world.engineSettings.highlightPassabilityDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-minimap-terrain") {
    if (context.world) {
      context.world.engineSettings.minimapWithTerrainDefault = !context.world.engineSettings.minimapWithTerrainDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-mine-notifications") {
    if (context.world) {
      context.world.engineSettings.mineNotificationsDefault = !context.world.engineSettings.mineNotificationsDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-show-tips") {
    if (context.world) {
      context.world.engineSettings.showTipsDefault = !context.world.engineSettings.showTipsDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "next-title-tip") {
    if (context.world) {
      context.world.engineSettings.showTipsDefault = true;
      context.world.engineSettings.tipNumberDefault = nextSourceTitleTipNumber(context.world.engineSettings.tipNumberDefault, context.manifest.titleTips?.length ?? 0);
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-keyboard-scrolling") {
    if (context.world) {
      context.world.engineSettings.enableKeyboardScrollingDefault = !context.world.engineSettings.enableKeyboardScrollingDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-mouse-scrolling") {
    if (context.world) {
      context.world.engineSettings.enableMouseScrollingDefault = !context.world.engineSettings.enableMouseScrollingDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "cycle-group-keys") {
    if (context.world) {
      context.world.engineSettings.groupKeysDefault = nextSourceGroupKeys(context.world.engineSettings.groupKeysDefault);
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "key-scroll-speed-down" || command === "key-scroll-speed-up") {
    if (context.world) {
      context.world.engineSettings.keyScrollSpeedDefault = steppedSourceScrollSpeed(context.world.engineSettings.keyScrollSpeedDefault, command === "key-scroll-speed-up" ? 1 : -1, 0, 30);
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "mouse-scroll-speed-down" || command === "mouse-scroll-speed-up") {
    if (context.world) {
      context.world.engineSettings.mouseScrollSpeedDefault = steppedSourceScrollSpeed(context.world.engineSettings.mouseScrollSpeedDefault, command === "mouse-scroll-speed-up" ? 1 : -1, 0, 10);
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "mouse-pressed-scroll-speed-down" || command === "mouse-pressed-scroll-speed-up") {
    if (context.world) {
      context.world.engineSettings.mouseScrollSpeedPressedDefault = steppedSourceScrollSpeed(context.world.engineSettings.mouseScrollSpeedPressedDefault, command === "mouse-pressed-scroll-speed-up" ? 1 : -1, 0, 30);
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "mouse-control-scroll-speed-down" || command === "mouse-control-scroll-speed-up") {
    if (context.world) {
      context.world.engineSettings.mouseScrollSpeedControlDefault = steppedSourceScrollSpeed(context.world.engineSettings.mouseScrollSpeedControlDefault, command === "mouse-control-scroll-speed-up" ? 1 : -1, 0, 60);
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "fast-forward-cycle-down" || command === "fast-forward-cycle-up") {
    if (context.world) {
      context.world.engineSettings.fastForwardCycleDefault = steppedSourceFastForwardCycle(context.world.engineSettings.fastForwardCycleDefault, command === "fast-forward-cycle-up" ? 30 : -30);
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "frame-skip-down" || command === "frame-skip-up") {
    if (context.world) {
      context.world.engineSettings.frameSkipDefault = steppedSourceFrameSkip(context.world.engineSettings.frameSkipDefault, command === "frame-skip-up" ? 1 : -1);
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-formation-movement") {
    if (context.world) {
      context.world.engineSettings.formationMovementDefault = !context.world.engineSettings.formationMovementDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-big-screen") {
    if (context.world) {
      context.world.engineSettings.bigScreenDefault = !context.world.engineSettings.bigScreenDefault;
      context.addHudMessage(context.world.engineSettings.bigScreenDefault ? "Big map enabled" : "Big map disabled", 1800);
      context.state.menuOverlay = context.world.engineSettings.bigScreenDefault ? null : "preferences";
    }
    return;
  }
  if (command === "toggle-keep-ratio") {
    if (context.world) {
      context.world.engineSettings.keepRatioDefault = !context.world.engineSettings.keepRatioDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "edit-player-name") {
    if (context.world) {
      const visiblePlayerId = context.world.visibilityPlayer;
      const currentName = context.world.engineSettings.playerNameDefault ?? mapCommandPlayerDisplayName(context.world.players.find((player) => player.id === visiblePlayerId) ?? { id: visiblePlayerId });
      const nextName = sourcePromptPlayerName(currentName);
      if (nextName) {
        context.world.engineSettings.playerNameDefault = nextName;
        for (const player of context.world.players) {
          if (player.playerType === "person") {
            player.name = nextName;
          }
        }
      }
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-fullscreen") {
    if (context.world) {
      const nextFullscreen = !context.world.engineSettings.videoFullScreenDefault;
      context.world.engineSettings.videoFullScreenDefault = nextFullscreen;
      context.state.menuOverlay = "preferences";
      try {
        if (nextFullscreen && !document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        } else if (!nextFullscreen && document.fullscreenElement) {
          await document.exitFullscreen();
        }
      } catch {
        context.world.engineSettings.videoFullScreenDefault = Boolean(document.fullscreenElement);
        context.addHudMessage("Fullscreen is unavailable in this browser context.", 1800);
      }
    }
    return;
  }
  if (command === "video-size-down" || command === "video-size-up") {
    if (context.world) {
      const nextSize = nextSourceVideoSize(context.world.engineSettings.videoWidthDefault, context.world.engineSettings.videoHeightDefault, command === "video-size-up" ? 1 : -1);
      context.world.engineSettings.videoWidthDefault = nextSize.width;
      context.world.engineSettings.videoHeightDefault = nextSize.height;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-grab-mouse") {
    if (context.world) {
      context.world.engineSettings.grabMouseDefault = !context.world.engineSettings.grabMouseDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-hardware-cursor") {
    if (context.world) {
      context.world.engineSettings.hardwareCursorDefault = !context.world.engineSettings.hardwareCursorDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-icon-shift") {
    if (context.world) {
      context.world.engineSettings.iconsShiftDefault = !context.world.engineSettings.iconsShiftDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-ally-deposits") {
    if (context.world) {
      context.world.engineSettings.allyDepositsAllowedDefault = !context.world.engineSettings.allyDepositsAllowedDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-ai-dependencies") {
    if (context.world) {
      context.world.engineSettings.aiChecksDependenciesDefault = !context.world.engineSettings.aiChecksDependenciesDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-ai-explores") {
    if (context.world) {
      context.world.engineSettings.aiExploresDefault = !context.world.engineSettings.aiExploresDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-inside-mode") {
    if (context.world) {
      context.world.engineSettings.insideDefault = !context.world.engineSettings.insideDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-grayscale-icons") {
    if (context.world) {
      context.world.engineSettings.grayscaleIconsDefault = !context.world.engineSettings.grayscaleIconsDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-video-shader") {
    if (context.world) {
      context.world.engineSettings.videoShaderDefault = nextVideoShader(context.world.engineSettings.videoShaderDefault);
      context.state.menuOverlay = "preferences";
      context.syncAudioSettings();
    }
    return;
  }
  if (command === "cycle-viewport-mode") {
    if (context.world) {
      context.world.engineSettings.viewportModeDefault = nextSourceViewportMode(context.world.engineSettings.viewportModeDefault);
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-right-button-action") {
    if (context.world) {
      context.world.engineSettings.rightButtonAction = context.world.engineSettings.rightButtonAction === "attack" ? "move" : "attack";
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-deselect-in-mine") {
    if (context.world) {
      context.world.engineSettings.deselectInMineDefault = !context.world.engineSettings.deselectInMineDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-simplified-auto-targeting") {
    if (context.world) {
      context.world.engineSettings.simplifiedAutoTargetingDefault = !context.world.engineSettings.simplifiedAutoTargetingDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-fancy-buildings") {
    if (context.world) {
      context.world.engineSettings.useFancyBuildingsDefault = !context.world.engineSettings.useFancyBuildingsDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-enhanced-effects") {
    if (context.world) {
      context.world.engineSettings.enhancedEffectsDefault = !context.world.engineSettings.enhancedEffectsDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-pause-on-leave") {
    if (context.world) {
      context.world.engineSettings.pauseOnLeaveDefault = !context.world.engineSettings.pauseOnLeaveDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-leave-stop-scrolling") {
    if (context.world) {
      context.world.engineSettings.leaveStopScrollingDefault = !context.world.engineSettings.leaveStopScrollingDefault;
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-training-queue") {
    if (context.world) {
      context.world.engineSettings.trainingQueue = !context.world.engineSettings.trainingQueue;
      if (!context.world.engineSettings.trainingQueue) {
        refundQueuedTrainingOverflow(context.world);
      }
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "cycle-selection-style") {
    if (context.world) {
      context.world.engineSettings.selectionStyleDefault = nextSelectionStyle(context.world.engineSettings.selectionStyleDefault);
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "double-click-delay-down" || command === "double-click-delay-up") {
    if (context.world) {
      context.world.engineSettings.doubleClickDelayMsDefault = steppedSourceDelay(context.world.engineSettings.doubleClickDelayMsDefault, command === "double-click-delay-up" ? 50 : -50, 120, 1000);
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "hold-click-delay-down" || command === "hold-click-delay-up") {
    if (context.world) {
      context.world.engineSettings.holdClickDelayMsDefault = steppedSourceDelay(context.world.engineSettings.holdClickDelayMsDefault, command === "hold-click-delay-up" ? 100 : -100, 0, 3000);
      context.state.menuOverlay = "preferences";
    }
    return;
  }
  if (command === "toggle-effects") {
    if (context.world) {
      context.world.engineSettings.effectsEnabledDefault = !context.world.engineSettings.effectsEnabledDefault;
      context.state.menuOverlay = "sound-options";
      context.syncAudioSettings();
    }
    return;
  }
  if (command === "toggle-music") {
    if (context.world) {
      context.world.engineSettings.musicEnabledDefault = !context.world.engineSettings.musicEnabledDefault;
      context.state.menuOverlay = "sound-options";
      context.syncAudioSettings();
    }
    return;
  }
  if (command === "toggle-stereo") {
    if (context.world) {
      context.world.engineSettings.stereoSoundDefault = !context.world.engineSettings.stereoSoundDefault;
      context.state.menuOverlay = "sound-options";
      context.syncAudioSettings();
    }
    return;
  }
  if (command === "sound-options-ok" || command === "sound-options-cancel") {
    context.state.menuOverlay = "game-options";
    return;
  }
  if (command === "effects-volume-down" || command === "effects-volume-up") {
    if (context.world) {
      context.world.engineSettings.effectsVolumeDefault = steppedSourceVolume(context.world.engineSettings.effectsVolumeDefault, command === "effects-volume-up" ? 16 : -16);
      context.state.menuOverlay = "sound-options";
      context.syncAudioSettings();
    }
    return;
  }
  if (command === "music-volume-down" || command === "music-volume-up") {
    if (context.world) {
      context.world.engineSettings.musicVolumeDefault = steppedSourceVolume(context.world.engineSettings.musicVolumeDefault, command === "music-volume-up" ? 16 : -16);
      context.state.menuOverlay = "sound-options";
      context.syncAudioSettings();
    }
    return;
  }
  if (command.startsWith("diplomacy-ally-") || command.startsWith("diplomacy-enemy-") || command.startsWith("diplomacy-vision-")) {
    updateDiplomacyDraft(context, command);
    return;
  }
  if (command === "diplomacy-ok") {
    if (context.world && context.state.diplomacyDraft) {
      applyDiplomacyDraft(context.world, context.world.visibilityPlayer, context.state.diplomacyDraft);
      context.addHudMessage("Diplomacy updated.");
    }
    context.state.diplomacyDraft = null;
    context.state.paused = false;
    context.state.menuOverlay = null;
    return;
  }
  if (command === "diplomacy-cancel") {
    context.state.diplomacyDraft = null;
    context.state.paused = false;
    context.state.menuOverlay = null;
    return;
  }
  if (command === "main-menu") {
    openSourceMenuOverlay(context, command);
    return;
  }
  if (command === "help-menu") {
    openSourceMenuOverlay(context, command);
    return;
  }
  if (command === "keystroke-help") {
    openSourceMenuOverlay(context, command);
    return;
  }
  if (command === "tips") {
    openSourceMenuOverlay(context, command);
    return;
  }
  if (command === "objectives") {
    openSourceMenuOverlay(context, command);
    return;
  }
  if (command === "game-options") {
    openSourceMenuOverlay(context, command);
    return;
  }
  if (command === "speed-options") {
    openSourceMenuOverlay(context, command);
    return;
  }
  if (command === "sound-options") {
    openSourceMenuOverlay(context, command);
    return;
  }
  if (command === "save-menu") {
    openSourceMenuOverlay(context, command);
    return;
  }
  if (command === "load-menu") {
    openSourceMenuOverlay(context, command);
    return;
  }
  if (command === "preferences") {
    if (context.world) {
      context.state.preferencesDraft = cloneEngineSettings(context.world.engineSettings);
    }
    openSourceMenuOverlay(context, command);
    return;
  }
  if (command === "diplomacy") {
    if (context.world) {
      context.state.diplomacyDraft = createDiplomacyDraft(context.world, context.world.visibilityPlayer);
    }
    openSourceMenuOverlay(context, command);
    return;
  }
  if (command === "end-scenario") {
    openSourceMenuOverlay(context, command);
    return;
  }
  if (command === "restart-confirm") {
    openSourceMenuOverlay(context, command);
    return;
  }
  if (command === "surrender-confirm") {
    openSourceMenuOverlay(context, command);
    return;
  }
  if (command === "quit-to-menu") {
    openSourceMenuOverlay(context, command);
    return;
  }
  if (command === "exit-game") {
    context.state.paused = true;
    context.saveCurrentAutosave();
    context.state.menuOverlay = command;
    return;
  }
  if (command === "choose-map") {
    context.state.menuOverlay = null;
    openMapPicker(context);
    return;
  }

  const maps = context.manifest.maps.filter((map) => map.setupJson);
  const currentIndex = Math.max(0, maps.findIndex((map) => map.path === context.activeMap.path));
  const nextIndex = command === "restart-map"
    ? currentIndex
    : command === "next-map"
      ? (currentIndex + 1) % maps.length
      : (currentIndex - 1 + maps.length) % maps.length;
  const nextMap = maps[nextIndex];
  if (nextMap) {
    await context.loadPlayableMap(nextMap);
  }
}

function openSourceMenuOverlay(context: MapCommandContext, menuOverlay: HudMenuOverlayId): void {
  context.state.paused = true;
  if (menuOverlay !== "preferences") {
    context.state.preferencesDraft = null;
  }
  if (menuOverlay !== "diplomacy") {
    context.state.diplomacyDraft = null;
  }
  context.state.menuOverlay = menuOverlay;
}

function cloneEngineSettings(settings: WargusEngineSettings): WargusEngineSettings {
  return JSON.parse(JSON.stringify(settings)) as WargusEngineSettings;
}

function openMapPicker(context: MapCommandContext): void {
  context.state.mapPicker.maps = mapsForPicker(context.manifest);
  context.state.mapPicker.query = "";
  context.state.mapPicker.open = true;
}

function steppedSourceVolume(volume: number, delta: number): number {
  return Math.max(0, Math.min(255, Math.round(volume + delta)));
}

function steppedSourceDelay(value: number, delta: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value + delta)));
}

function steppedSourceScrollSpeed(value: number, delta: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value + delta)));
}

function steppedSourceFastForwardCycle(value: number, delta: number): number {
  return Math.max(0, Math.min(480, Math.round(value + delta)));
}

function steppedSourceFrameSkip(value: number, delta: number): number {
  return Math.max(0, Math.min(15, Math.round(value + delta)));
}

function steppedSourceDifficulty(value: number, delta: number): number {
  return Math.max(1, Math.min(5, Math.floor(value) + delta));
}

function nextSourceTitleTipNumber(value: number, tipCount: number): number {
  const count = Math.max(1, Math.floor(tipCount));
  const current = Math.max(1, Math.floor(value || 1));
  return current % count + 1;
}

function nextSourceGroupKeys(groupKeys: string): string {
  return groupKeys === "1234567890`" ? "0123456789`" : "1234567890`";
}

function sourcePromptPlayerName(currentName: string): string | null {
  const value = typeof window === "undefined" ? null : window.prompt("Player name", currentName);
  if (value === null) {
    return null;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized.slice(0, 24) : null;
}

function sourceDamageMissileIdForRuntime(world: WorldState): string | null {
  const sourceId = world.engineSettings.sourceDamageMissileId;
  if (sourceId && world.missileDefinitions.some((missile) => missile.id === sourceId)) {
    return sourceId;
  }
  return null;
}

function refundQueuedTrainingOverflow(world: WorldState): void {
  for (const producer of world.units) {
    if (producer.productionQueue.length <= 1) {
      continue;
    }
    const player = world.players.find((candidate) => candidate.id === producer.player);
    if (player) {
      for (const order of producer.productionQueue.slice(1)) {
        const definition = world.unitDefinitions.find((candidate) => candidate.id === order.unitTypeId);
        if (definition) {
          refundSourceCosts(world, player, definition.costs);
        }
      }
    }
    producer.productionQueue = producer.productionQueue.slice(0, 1);
  }
}

function refundSourceCosts(world: WorldState, player: WorldState["players"][number], costs: string[]): void {
  for (let index = 0; index < costs.length - 1; index += 2) {
    const resource = costs[index];
    if (resource === "time") {
      continue;
    }
    const amount = Number(costs[index + 1]);
    if (Number.isFinite(amount)) {
      addPlayerResource(world, player, resource, amount);
    }
  }
}

function nextSelectionStyle(style: string): string {
  if (style === "corners") {
    return "ellipse";
  }
  if (style === "ellipse") {
    return "circle";
  }
  return "corners";
}

function nextVideoShader(shader: string): string {
  const normalized = shader.trim().toLowerCase();
  if (normalized === "none" || normalized.length === 0) {
    return "linear";
  }
  if (normalized === "linear") {
    return "crt";
  }
  return "none";
}

function nextSourceVideoSize(width: number, height: number, step: number): { width: number; height: number } {
  const sizes = [
    { width: 640, height: 480 },
    { width: 800, height: 600 },
    { width: 1024, height: 768 },
    { width: 1280, height: 960 }
  ];
  const current = sizes.findIndex((size) => size.width === Math.round(width) && size.height === Math.round(height));
  const index = current >= 0 ? current : 0;
  return sizes[(index + step + sizes.length) % sizes.length] ?? sizes[0];
}

function setDiplomacyState(world: WorldState, player: number, otherPlayer: number, state: "allied" | "enemy" | "neutral"): void {
  const existing = world.diplomacy.find((rule) => rule.player === player && rule.otherPlayer === otherPlayer);
  if (existing) {
    existing.state = state;
    return;
  }
  world.diplomacy.push({ player, otherPlayer, state });
}

function sharedVisionEnabled(world: WorldState, player: number, otherPlayer: number): boolean {
  return world.sharedVision.find((rule) => rule.player === player && rule.otherPlayer === otherPlayer)?.enabled === true;
}

function diplomacyState(world: WorldState, player: number, otherPlayer: number): "allied" | "enemy" | "neutral" {
  return world.diplomacy.find((rule) => rule.player === player && rule.otherPlayer === otherPlayer)?.state ?? "enemy";
}

function toggleDebugFlag(world: WorldState, flag: string): void {
  const flags = new Set(world.engineSettings.debugFlagsDefault);
  if (flags.has(flag)) {
    flags.delete(flag);
  } else {
    flags.add(flag);
  }
  world.engineSettings.debugFlagsDefault = [...flags].sort();
}

function mapCommandPlayerDisplayName(player: { id: number; name?: string | null }): string {
  return sourcePlayerDisplayName(player);
}

function createDiplomacyDraft(world: WorldState, player: number): SourceDiplomacyDraft {
  return {
    rows: world.players
      .filter((candidate) => candidate.id !== player && candidate.id !== 15 && candidate.playerType !== "nobody")
      .map((candidate): SourceDiplomacyDraftRow => {
        const state = diplomacyState(world, player, candidate.id);
        return {
          player: candidate.id,
          name: mapCommandPlayerDisplayName(candidate),
          playerType: candidate.playerType,
          race: candidate.race,
          allied: state === "allied",
          enemy: state === "enemy",
          sharedVision: sharedVisionEnabled(world, player, candidate.id),
          locked: candidate.playerType === "computer" && diplomacyState(world, candidate.id, player) !== "allied"
        };
      })
  };
}

function updateDiplomacyDraft(context: MapCommandContext, command: HudMapCommandId): void {
  if (!context.world) {
    return;
  }
  const draft = context.state.diplomacyDraft ?? createDiplomacyDraft(context.world, context.world.visibilityPlayer);
  context.state.diplomacyDraft = draft;
  const alliedMatch = /^diplomacy-ally-(\d+)$/.exec(command);
  const enemyMatch = /^diplomacy-enemy-(\d+)$/.exec(command);
  const visionMatch = /^diplomacy-vision-(\d+)$/.exec(command);
  const player = Number((alliedMatch ?? enemyMatch ?? visionMatch)?.[1]);
  const row = draft.rows.find((candidate) => candidate.player === player);
  if (!row || row.locked) {
    context.state.menuOverlay = "diplomacy";
    return;
  }
  if (alliedMatch) {
    row.allied = !row.allied;
    if (row.allied && row.enemy) {
      row.enemy = false;
    }
  } else if (enemyMatch) {
    row.enemy = !row.enemy;
    if (row.enemy && row.allied) {
      row.allied = false;
    }
  } else if (visionMatch) {
    row.sharedVision = !row.sharedVision;
  }
  context.state.menuOverlay = "diplomacy";
}

function applyDiplomacyDraft(world: WorldState, player: number, draft: SourceDiplomacyDraft): void {
  for (const row of draft.rows) {
    if (row.locked) {
      continue;
    }
    const nextState = row.allied ? "allied" : row.enemy ? "enemy" : "neutral";
    setDiplomacyState(world, player, row.player, nextState);
    setSharedVisionState(world, player, row.player, row.sharedVision);
  }
}

function setSharedVisionState(world: WorldState, player: number, otherPlayer: number, enabled: boolean): void {
  const existing = world.sharedVision.find((rule) => rule.player === player && rule.otherPlayer === otherPlayer);
  if (existing) {
    existing.enabled = enabled;
    return;
  }
  world.sharedVision.push({ player, otherPlayer, enabled });
}
