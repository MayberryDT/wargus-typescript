import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const dataRoot = manifest.dataRoot;
const humanUiSource = readFileSync(path.join(dataRoot, "scripts/human/ui_pandora.lua"), "utf8");
const orcUiSource = readFileSync(path.join(dataRoot, "scripts/orc/ui_pandora.lua"), "utf8");
const endScenarioSource = readFileSync(path.join(dataRoot, "scripts/menus/endscenario.lua"), "utf8");
const gameMenuSource = readFileSync(path.join(dataRoot, "scripts/menus/game.lua"), "utf8");
const optionsMenuSource = readFileSync(path.join(dataRoot, "scripts/menus/options.lua"), "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const mapCommandSource = readFileSync("src/view/mapCommands.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const audioSource = readFileSync("src/audio/audioEngine.ts", "utf8");

const errors = [];
const expected = {
  human: {
    menu: { x: 24, y: 2, text: "Menu (F10)", style: "main", callback: "game-menu" },
    networkMenu: { x: 6, y: 2, text: "Menu", style: "network", callback: "game-menu" },
    networkDiplomacy: { x: 90, y: 2, text: "Diplomacy", style: "network", callback: "diplomacy-menu" }
  },
  orc: {
    menu: { x: 24, y: 2, text: "Menu (F10)", style: "main-orc", callback: "game-menu" },
    networkMenu: { x: 6, y: 2, text: "Menu", style: "network-orc", callback: "game-menu" },
    networkDiplomacy: { x: 90, y: 2, text: "Diplomacy", style: "network-orc", callback: "diplomacy-menu" }
  }
};

for (const [name, source, style] of [
  ["human UI", humanUiSource, "main"],
  ["orc UI", orcUiSource, "main-orc"]
]) {
  for (const fragment of [
    "UI.MenuButton.X = 24",
    "UI.MenuButton.Y = 2",
    "UI.MenuButton.Text = _(\"Menu (~<F10~>)\")",
    `UI.MenuButton.Style = FindButtonStyle("${style}")`,
    "UI.NetworkMenuButton.X = 6",
    "UI.NetworkDiplomacyButton.X = 90",
    "RunGameMenu()",
    "RunDiplomacyMenu()"
  ]) {
    if (!source.includes(fragment)) {
      errors.push(`${name} missing menu-button fragment: ${fragment}`);
    }
  }
}

for (const fragment of [
  "function RunGameMenu()",
  "menu:addLabel(_(\"Game Menu\"), 128, 11)",
  "menu:addHalfButton(_(\"Save (~<F11~>)\"), \"f11\"",
  "function() RunSaveMenu() end",
  "menu:addHalfButton(_(\"Load (~<F12~>)\"), \"f12\"",
  "function() RunGameLoadGameMenu() end",
  "menu:addFullButton(_(\"Options (~<F5~>)\"), \"f5\"",
  "menu:addFullButton(_(\"Help (~<F1~>)\"), \"f1\"",
  "menu:addFullButton(_(\"Scenario ~!Objectives\"), \"o\"",
  "menu:addFullButton(_(\"~!End Scenario\"), \"e\"",
  "menu:addFullButton(_(\"Return to Game (~<Esc~>)\"), \"escape\""
]) {
  if (!gameMenuSource.includes(fragment)) {
    errors.push(`Game Menu source missing fragment: ${fragment}`);
  }
}

for (const fragment of [
  "function RunSpeedsMenu()",
  "menu:addLabel(_(\"Speed Settings\"), 128, 8, Fonts[\"game\"])",
  "menu:addImageSlider(15, 75, 172, 18, 41, 60",
  "SetGameSpeed(gamespeed:getValue())",
  "SetMouseScrollSpeed(mousescrollspeed:getValue())",
  "SetKeyScrollSpeed(keyscrollspeed:getValue())",
  "menu:addHalfButton(\"~!OK\", \"o\", 16 + 12 + 106, 288 - 40",
  "menu:addHalfButton(_(\"Cancel (~<Esc~>)\"), \"escape\", 16, 288 - 40"
]) {
  if (!optionsMenuSource.includes(fragment)) {
    errors.push(`Options source missing speed-menu fragment: ${fragment}`);
  }
}

for (const fragment of [
  "function AddSoundOptions(menu, offx, offy, centerx, bottom)",
  "menu:addLabel(_(\"Sound Options\"), 128, 11, Fonts[\"game\"])",
  "Label(_(\"Effects Volume\"))",
  "Label(_(\"Music Volume\"))",
  "menu:addImageCheckBox(_(\"Stereo Sound\")",
  "menu:addHalfButton(\"~!OK\", \"o\"",
  "menu:addHalfButton(_(\"Cancel (~<Esc~>)\"), \"escape\"",
  "function RunGameSoundOptionsMenu()"
]) {
  if (!optionsMenuSource.includes(fragment)) {
    errors.push(`Options source missing sound-menu fragment: ${fragment}`);
  }
}

for (const fragment of [
  "function RunPreferencesMenu()",
  "menu:addLabel(_(\"Preferences\"), 352 / 2, 11, Fonts[\"large\"], true)",
  "local showHotkeys = menu:addImageCheckBox(_(\"Show Hotkeys\")",
  "local grabMouse = menu:addImageCheckBox(_(\"Grab Mouse\")",
  "wc2.preferences.ShowMessages = Preference.ShowMessages",
  "wc2.preferences.PauseOnLeave = Preference.PauseOnLeave",
  "wc2.preferences.SelectionStyle = selectionStyleList[selectionStyle:getSelected() + 1]",
  "wc2.preferences.ViewportMode = viewportMode:getSelected()",
  "SavePreferences()",
  "menu:addHalfButton(_(\"Cancel (~<Esc~>)\"), \"escape\", 40, 352 - 40"
]) {
  if (!optionsMenuSource.includes(fragment)) {
    errors.push(`Options source missing preferences-menu fragment: ${fragment}`);
  }
}

for (const fragment of [
  "function RunEndScenarioMenu()",
  "_(\"~!Restart Scenario\")",
  "_(\"~!Surrender\")",
  "_(\"~!Quit to Menu\")",
  "_(\"E~!xit Program\")",
  "function RunRestartConfirmMenu()",
  "function RunSurrenderConfirmMenu()",
  "ActionDraw();"
]) {
  if (!endScenarioSource.includes(fragment)) {
    errors.push(`End Scenario source missing fragment: ${fragment}`);
  }
}

if (JSON.stringify(manifest.engineSettings?.menuButtons) !== JSON.stringify(expected)) {
  errors.push(`Manifest menuButtons is ${JSON.stringify(manifest.engineSettings?.menuButtons)}, expected ${JSON.stringify(expected)}`);
}

for (const [name, source, fragments] of [
  ["indexer", indexSource, [
    "function parseUiMenuButtons(source)",
    "UI\\\\.${key}\\\\.X",
    "cleanSourceText(text)",
    "callback: parseUiMenuButtonCallback(source, key)",
    "function parseUiMenuButtonCallback",
    "RunGameMenu",
    "RunDiplomacyMenu",
    "menuButtons: parseUiMenuButtons(uncommented)",
    "menuButtons: {}",
    "engineSettings.menuButtons[race] = parsedEngineSettings.menuButtons"
  ]],
  ["types", typesSource, [
    "menuButtons: Partial<Record<\"human\" | \"orc\", WargusMenuButtonGroup>>",
    "export interface WargusMenuButtonLayout",
    "export interface WargusMenuButtonGroup",
    "callback: \"game-menu\" | \"editor-menu\" | \"diplomacy-menu\" | string | null"
  ]],
  ["world defaults", worldSource, [
    "menuButtons:",
    "style: \"main\"",
    "style: \"main-orc\"",
    "callback: \"game-menu\"",
    "callback: \"diplomacy-menu\"",
    "networkDiplomacy: { x: 90, y: 2, text: \"Diplomacy\""
  ]],
  ["HUD render", hudSource, [
    "drawSourceMenuButtons(hudLayer, frame, sourceButtonStyleAtlas, wargusBitmapFontAtlas, manifest, world, visiblePlayer?.race, onMapCommand)",
    "drawSourceMenuOverlay(app, hudLayer, manifest, world, menuOverlay",
    "export type HudMenuOverlayId",
    "function drawSourceMenuOverlay",
    "sourceMenuOverlayLines(menu, world, manifest, paused, gameSpeed, activeSaveSlot, activeSaveSummary, autosaveSummary, diplomacyDraft)",
    "`diplomacy-ally-${number}`",
    "`diplomacy-enemy-${number}`",
    "`diplomacy-vision-${number}`",
    "buttons.length > 3",
    "sourceMenuOverlayButtons(menu, world, diplomacyDraft)",
    "sourceMenuOverlayTitle(menu)",
    "button.command as HudMapCommandId",
    "function drawSourceMenuButtons",
    "sourceMenuButtonCommand(group.menu, \"main-menu\")",
    "function sourceMenuButtonCommand",
    "button.callback === \"game-menu\"",
    "button.callback === \"diplomacy-menu\"",
    "group.networkMenu",
    "group.networkDiplomacy",
    "sourceMenuButtonPalette(manifest, button.style, style)",
    "addHudText(layer, bitmapFonts",
    "fontId: style?.font ?? \"game\""
  ]],
  ["source UI helpers", sourceUiHelpersSource, [
    "export function sourceMenuButtonGroup",
    "world.engineSettings.menuButtons",
    "export function sourceMenuButtonPalette",
    "export function sourceMenuOverlayLines",
    "export function sourceMenuOverlayTitle",
    "export function sourceMenuOverlayButtons",
    "const SOURCE_KEYSTROKE_HELP",
    "case \"main-menu\"",
    "return \"Game Menu\"",
    "F11 opens Save Game. F12 opens Load Game.",
    "{ label: \"Save\", command: \"save-menu\" }",
    "{ label: \"Load\", command: \"load-menu\" }",
    "case \"keystroke-help\"",
    "case \"tips\"",
    "case \"save-menu\"",
    "case \"load-menu\"",
    "case \"end-scenario\"",
    "case \"restart-confirm\"",
    "case \"surrender-confirm\"",
    "if (menu === \"keystroke-help\")",
    "if (menu === \"tips\")",
    "if (menu === \"end-scenario\")",
    "if (menu === \"restart-confirm\")",
    "if (menu === \"surrender-confirm\")",
    "sourceTipsMenuLines(manifest, world)",
    "{ label: \"Keys\", command: \"keystroke-help\" }",
    "{ label: \"Tips\", command: \"tips\" }",
    "{ label: \"Next Tip\", command: \"next-title-tip\" }",
    "{ label: \"Show Tips\", command: \"toggle-show-tips\" }",
    "case \"objectives\"",
    "if (menu === \"objectives\")",
    "{ label: \"Objectives\", command: \"objectives\" }",
    "No mission objectives are defined for this map.",
    "{ label: \"Help\", command: \"help-menu\" }",
    "{ label: \"End\", command: \"end-scenario\" }",
    "{ label: \"Restart\", command: \"restart-confirm\" }",
    "{ label: \"Surrender\", command: \"surrender-confirm\" }",
    "{ label: \"Surrender\", command: \"surrender\" }",
    "{ label: \"Speed\", command: \"speed-options\" }",
    "{ label: \"Sound\", command: \"sound-options\" }",
    "{ label: \"Prefs\", command: \"preferences\" }",
    "{ label: \"Diplomacy\", command: \"diplomacy\" }",
    "{ label: \"Quit\", command: \"quit-to-menu\" }",
    "{ label: \"Exit\", command: \"exit-game\" }",
    "toggle-messages",
    "toggle-command-keys",
    "toggle-button-popups",
    "toggle-map-grid",
    "toggle-show-orders",
    "toggle-show-damage",
    "toggle-minimap-terrain",
    "toggle-mine-notifications",
    "toggle-keyboard-scrolling",
    "toggle-mouse-scrolling",
    "cycle-group-keys",
    "key-scroll-speed-down",
    "key-scroll-speed-up",
    "speed-options-ok",
    "speed-options-cancel",
    "preferences-ok",
    "preferences-cancel",
    "mouse-scroll-speed-down",
    "mouse-scroll-speed-up",
    "mouse-pressed-scroll-speed-down",
    "mouse-pressed-scroll-speed-up",
    "mouse-control-scroll-speed-down",
    "mouse-control-scroll-speed-up",
    "fast-forward-cycle-down",
    "fast-forward-cycle-up",
    "toggle-keep-ratio",
    "edit-player-name",
    "video-size-down",
    "video-size-up",
    "toggle-grab-mouse",
    "toggle-hardware-cursor",
    "toggle-icon-shift",
    "toggle-ally-deposits",
    "toggle-ai-dependencies",
    "toggle-ai-explores",
    "toggle-inside-mode",
    "toggle-deselect-in-mine",
    "toggle-simplified-auto-targeting",
    "toggle-fancy-buildings",
    "toggle-enhanced-effects",
    "toggle-pause-on-leave",
    "toggle-leave-stop-scrolling",
    "toggle-training-queue",
    "cycle-selection-style",
    "double-click-delay-down",
    "double-click-delay-up",
    "hold-click-delay-down",
    "hold-click-delay-up",
    "toggle-effects",
    "toggle-music",
    "toggle-stereo",
    "sound-options-ok",
    "sound-options-cancel",
    "effects-volume-down",
    "effects-volume-up",
    "music-volume-down",
    "music-volume-up",
    "export interface SourceDiplomacyDraft",
    "sourceDiplomacyRowsFromWorld(world)",
    "`diplomacy-ally-${row.player}`",
    "`diplomacy-enemy-${row.player}`",
    "`diplomacy-vision-${row.player}`",
    "{ label: \"OK\", command: \"diplomacy-ok\" }",
    "{ label: \"Cancel\", command: \"diplomacy-cancel\" }",
    "export function sourceSelectionStyleLabel",
    "export function sourceDiplomacyState",
    "export function sourceSharedVisionEnabled",
    "export function diplomacyStateLabel",
    "sourceGameSpeedLabel(gameSpeed, world)",
    "Saved GameSpeed:",
    "sourceShortTime(activeSaveSummary.savedAt)",
    "sourceSharedVisionEnabled(world, world.visibilityPlayer, player.id)"
  ]],
  ["map commands", mapCommandSource, [
    "menuOverlay: HudMenuOverlayId | null",
    "context.state.menuOverlay = command",
    "context.state.menuOverlay = null",
    "command === \"main-menu\"",
    "command === \"help-menu\"",
    "command === \"keystroke-help\"",
    "command === \"tips\"",
    "command === \"objectives\"",
    "command === \"diplomacy\"",
    "openSourceMenuOverlay(context, command)",
    "function openSourceMenuOverlay(context: MapCommandContext, menuOverlay: HudMenuOverlayId): void",
    "if (menuOverlay !== \"preferences\")",
    "context.state.preferencesDraft = null",
    "if (menuOverlay !== \"diplomacy\")",
    "context.state.diplomacyDraft = null",
    "command === \"end-scenario\"",
    "command === \"restart-confirm\"",
    "command === \"surrender-confirm\"",
    "command === \"surrender\"",
    "context.world.matchState = { status: \"draw\", winner: null, endedTick: context.world.tick }",
    "command === \"toggle-messages\"",
    "sourceGameSpeedFromMultiplier(context.world, context.state.gameSpeed)",
    "showMessagesDefault = !context.world.engineSettings.showMessagesDefault",
    "command === \"toggle-command-keys\"",
    "showCommandKeyDefault = !context.world.engineSettings.showCommandKeyDefault",
    "command === \"toggle-button-popups\"",
    "showButtonPopupsDefault = !context.world.engineSettings.showButtonPopupsDefault",
    "command === \"toggle-map-grid\"",
    "mapGridDefault = !context.world.engineSettings.mapGridDefault",
    "command === \"toggle-show-orders\"",
    "showOrdersDefault = !context.world.engineSettings.showOrdersDefault",
    "command === \"toggle-show-damage\"",
    "showDamageDefault = !context.world.engineSettings.showDamageDefault",
    "sourceDamageMissileIdForRuntime(context.world)",
    "function sourceDamageMissileIdForRuntime",
    "command === \"toggle-minimap-terrain\"",
    "minimapWithTerrainDefault = !context.world.engineSettings.minimapWithTerrainDefault",
    "command === \"toggle-mine-notifications\"",
    "mineNotificationsDefault = !context.world.engineSettings.mineNotificationsDefault",
    "command === \"toggle-keyboard-scrolling\"",
    "enableKeyboardScrollingDefault = !context.world.engineSettings.enableKeyboardScrollingDefault",
    "command === \"toggle-mouse-scrolling\"",
    "enableMouseScrollingDefault = !context.world.engineSettings.enableMouseScrollingDefault",
    "command === \"cycle-group-keys\"",
    "groupKeysDefault = nextSourceGroupKeys",
    "function nextSourceGroupKeys",
    "command === \"key-scroll-speed-down\" || command === \"key-scroll-speed-up\"",
    "keyScrollSpeedDefault = steppedSourceScrollSpeed",
    "command === \"speed-options-ok\" || command === \"speed-options-cancel\"",
    "context.state.menuOverlay = \"game-options\"",
    "command === \"preferences-ok\"",
    "context.state.preferencesDraft = null",
    "command === \"preferences-cancel\"",
    "Object.assign(context.world.engineSettings, cloneEngineSettings(context.state.preferencesDraft))",
    "context.syncAudioSettings()",
    "context.state.preferencesDraft = cloneEngineSettings(context.world.engineSettings)",
    "function cloneEngineSettings(settings: WargusEngineSettings): WargusEngineSettings",
    "command === \"mouse-scroll-speed-down\" || command === \"mouse-scroll-speed-up\"",
    "mouseScrollSpeedDefault = steppedSourceScrollSpeed",
    "command === \"mouse-pressed-scroll-speed-down\" || command === \"mouse-pressed-scroll-speed-up\"",
    "mouseScrollSpeedPressedDefault = steppedSourceScrollSpeed",
    "command === \"mouse-control-scroll-speed-down\" || command === \"mouse-control-scroll-speed-up\"",
    "mouseScrollSpeedControlDefault = steppedSourceScrollSpeed",
    "command === \"fast-forward-cycle-down\" || command === \"fast-forward-cycle-up\"",
    "fastForwardCycleDefault = steppedSourceFastForwardCycle",
    "command === \"toggle-keep-ratio\"",
    "keepRatioDefault = !context.world.engineSettings.keepRatioDefault",
    "command === \"edit-player-name\"",
    "playerNameDefault = nextName",
    "function sourcePromptPlayerName",
    "command === \"video-size-down\" || command === \"video-size-up\"",
    "videoWidthDefault = nextSize.width",
    "videoHeightDefault = nextSize.height",
    "function nextSourceVideoSize",
    "command === \"toggle-grab-mouse\"",
    "grabMouseDefault = !context.world.engineSettings.grabMouseDefault",
    "command === \"toggle-hardware-cursor\"",
    "hardwareCursorDefault = !context.world.engineSettings.hardwareCursorDefault",
    "command === \"toggle-icon-shift\"",
    "iconsShiftDefault = !context.world.engineSettings.iconsShiftDefault",
    "command === \"toggle-ally-deposits\"",
    "allyDepositsAllowedDefault = !context.world.engineSettings.allyDepositsAllowedDefault",
    "command === \"toggle-ai-dependencies\"",
    "aiChecksDependenciesDefault = !context.world.engineSettings.aiChecksDependenciesDefault",
    "command === \"toggle-ai-explores\"",
    "aiExploresDefault = !context.world.engineSettings.aiExploresDefault",
    "command === \"toggle-inside-mode\"",
    "insideDefault = !context.world.engineSettings.insideDefault",
    "command === \"toggle-deselect-in-mine\"",
    "deselectInMineDefault = !context.world.engineSettings.deselectInMineDefault",
    "command === \"toggle-simplified-auto-targeting\"",
    "simplifiedAutoTargetingDefault = !context.world.engineSettings.simplifiedAutoTargetingDefault",
    "command === \"toggle-fancy-buildings\"",
    "useFancyBuildingsDefault = !context.world.engineSettings.useFancyBuildingsDefault",
    "command === \"toggle-enhanced-effects\"",
    "enhancedEffectsDefault = !context.world.engineSettings.enhancedEffectsDefault",
    "command === \"toggle-pause-on-leave\"",
    "pauseOnLeaveDefault = !context.world.engineSettings.pauseOnLeaveDefault",
    "command === \"toggle-leave-stop-scrolling\"",
    "leaveStopScrollingDefault = !context.world.engineSettings.leaveStopScrollingDefault",
    "command === \"toggle-training-queue\"",
    "trainingQueue = !context.world.engineSettings.trainingQueue",
    "refundQueuedTrainingOverflow(context.world)",
    "function refundQueuedTrainingOverflow",
    "function refundSourceCosts",
    "command === \"cycle-selection-style\"",
    "selectionStyleDefault = nextSelectionStyle",
    "function nextSelectionStyle",
    "command === \"double-click-delay-down\" || command === \"double-click-delay-up\"",
    "doubleClickDelayMsDefault = steppedSourceDelay",
    "command === \"hold-click-delay-down\" || command === \"hold-click-delay-up\"",
    "holdClickDelayMsDefault = steppedSourceDelay",
    "function steppedSourceDelay",
    "command === \"toggle-effects\"",
    "effectsEnabledDefault = !context.world.engineSettings.effectsEnabledDefault",
    "command === \"toggle-music\"",
    "musicEnabledDefault = !context.world.engineSettings.musicEnabledDefault",
    "command === \"toggle-stereo\"",
    "stereoSoundDefault = !context.world.engineSettings.stereoSoundDefault",
    "command === \"sound-options-ok\" || command === \"sound-options-cancel\"",
    "context.state.menuOverlay = \"game-options\"",
    "command === \"effects-volume-down\" || command === \"effects-volume-up\"",
    "effectsVolumeDefault = steppedSourceVolume",
    "command === \"music-volume-down\" || command === \"music-volume-up\"",
    "musicVolumeDefault = steppedSourceVolume",
    "command.startsWith(\"diplomacy-ally-\") || command.startsWith(\"diplomacy-enemy-\") || command.startsWith(\"diplomacy-vision-\")",
    "updateDiplomacyDraft(context, command)",
    "context.state.menuOverlay = \"diplomacy\"",
    "function createDiplomacyDraft",
    "function updateDiplomacyDraft",
    "function applyDiplomacyDraft",
    "command === \"diplomacy-ok\"",
    "command === \"diplomacy-cancel\"",
    "setDiplomacyState(world, player, row.player, nextState)",
    "world.diplomacy.push({ player, otherPlayer, state })",
    "setSharedVisionState(world, player, row.player, row.sharedVision)",
    "world.sharedVision.push({ player, otherPlayer, enabled })",
    "function steppedSourceVolume",
    "Math.max(0, Math.min(255",
    "context.syncAudioSettings()"
  ]],
  ["main wiring", mainSource, [
    "let menuOverlay: HudMenuOverlayId | null = null",
    "let preferencesDraft: WargusEngineSettings | null = null",
    "menuOverlay",
    "if (menuOverlay && event.code === \"Escape\")",
    "void executeMapCommand(\"preferences-cancel\")",
    "set menuOverlay(nextMenuOverlay: HudMenuOverlayId | null)",
    "get preferencesDraft()",
    "set preferencesDraft(nextPreferencesDraft: WargusEngineSettings | null)",
    "syncAudioSettings: syncAudioSettingsFromWorld",
    "function syncAudioSettingsFromWorld",
    "audioEngine.setEffectsEnabled(world.engineSettings.effectsEnabledDefault)",
    "audioEngine.setMusicEnabled(world.engineSettings.musicEnabledDefault)",
    "audioEngine.setStereoSound(world.engineSettings.stereoSoundDefault)"
  ]],
  ["audio engine", audioSource, [
    "setEffectsEnabled(enabled: boolean)",
    "setMusicEnabled(enabled: boolean)",
    "setStereoSound(enabled: boolean)",
    "setEffectsVolume(sourceVolume: number)",
    "setMusicVolume(sourceVolume: number)",
    "this.stopMusic()"
  ]]
]) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      errors.push(`${name} missing fragment: ${fragment}`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log("Source menu buttons verified (Pandora menu/network button geometry indexed and rendered).");
