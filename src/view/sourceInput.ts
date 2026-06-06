import type { HudMapCommandId } from "./renderHud";

export type SourceKeyInput = {
  code: string;
  key?: string;
  ctrlKey?: boolean;
  altKey?: boolean;
};

export type MapPickerKeyResult<TMap> =
  | { handled: false; state: { open: boolean; query: string; maps: TMap[] }; selectedMap: null }
  | { handled: true; state: { open: boolean; query: string; maps: TMap[] }; selectedMap: TMap | null };

export type MatchOverlayCommand = HudMapCommandId | "next-campaign";
export type SourceSpeedKeyAction = "toggle-pause" | "slower-game" | "faster-game" | "default-game-speed";
export type SourceOverlayKeyAction = "dismiss-title" | "dismiss-briefing" | "replay-briefing";
export type SourcePreferenceKeyCommand = "toggle-messages" | "toggle-minimap-terrain" | "toggle-effects" | "toggle-music";

export function sourceIngameMapCommandForKey(input: SourceKeyInput): HudMapCommandId | null {
  if ((input.code === "KeyH" && (input.ctrlKey || input.altKey)) || input.code === "F1") {
    return "help-menu";
  }
  if (input.code === "F5") {
    return "game-options";
  }
  if (input.code === "F6") {
    return "speed-options";
  }
  if (input.code === "F7") {
    return "sound-options";
  }
  if (input.code === "F8") {
    return "preferences";
  }
  if (input.code === "F9") {
    return "diplomacy";
  }
  if (input.code === "KeyB" && (input.ctrlKey || input.altKey)) {
    return "toggle-big-screen";
  }
  if ((input.code === "KeyM" && input.altKey) || input.code === "F10" || input.code === "Backspace") {
    return "main-menu";
  }
  if ((input.code === "KeyS" && input.altKey) || input.code === "F11") {
    return "save-menu";
  }
  if ((input.code === "KeyL" && input.altKey) || input.code === "F12") {
    return "load-menu";
  }
  if (input.code === "KeyR" && (input.ctrlKey || input.altKey)) {
    return "restart-map";
  }
  if (input.code === "KeyQ" && (input.ctrlKey || input.altKey)) {
    return "quit-to-menu";
  }
  if (input.code === "KeyX" && (input.ctrlKey || input.altKey)) {
    return "exit-game";
  }
  return null;
}

export function sourceTrackUnitKeyAction(input: SourceKeyInput): boolean {
  return input.code === "KeyT" && Boolean(input.ctrlKey || input.altKey);
}

export function sourceCenterSelectedKeyAction(input: SourceKeyInput): boolean {
  return input.code === "KeyC" && Boolean(input.ctrlKey || input.altKey);
}

export function sourcePreferenceKeyCommand(input: SourceKeyInput): SourcePreferenceKeyCommand | null {
  if (input.code === "KeyE" && input.ctrlKey) {
    return "toggle-messages";
  }
  if (input.code === "KeyM" && input.ctrlKey) {
    return "toggle-music";
  }
  if (input.code === "KeyS" && input.ctrlKey) {
    return "toggle-effects";
  }
  if (input.code === "Tab" && !input.altKey) {
    return "toggle-minimap-terrain";
  }
  return null;
}

export function applyMapPickerKey<TMap>(
  state: { open: boolean; query: string; maps: TMap[] },
  input: SourceKeyInput,
  findMatches: (maps: TMap[], query: string) => TMap[]
): MapPickerKeyResult<TMap> {
  if (!state.open) {
    return { handled: false, state, selectedMap: null };
  }
  if (input.code === "Escape") {
    return { handled: true, state: { ...state, open: false }, selectedMap: null };
  }
  if (input.code === "Backspace") {
    return { handled: true, state: { ...state, query: state.query.slice(0, -1) }, selectedMap: null };
  }
  if (input.code === "Enter") {
    return { handled: true, state, selectedMap: findMatches(state.maps, state.query)[0] ?? null };
  }
  if ((input.key?.length ?? 0) === 1 && state.query.length < 48) {
    return { handled: true, state: { ...state, query: `${state.query}${input.key}` }, selectedMap: null };
  }
  return { handled: true, state, selectedMap: null };
}

export function matchOverlayCommandForKey(input: SourceKeyInput, matchStatus: string, hasNextCampaignMap: boolean): MatchOverlayCommand | null {
  if (matchStatus === "playing") {
    return null;
  }
  if (input.code === "KeyR") {
    return "restart-map";
  }
  if (input.code === "KeyM") {
    return "choose-map";
  }
  if (matchStatus === "victory" && hasNextCampaignMap && (input.code === "Enter" || input.code === "Space" || input.code === "KeyN")) {
    return "next-campaign";
  }
  return null;
}

export function sourceSpeedKeyAction(input: SourceKeyInput): SourceSpeedKeyAction | null {
  if (input.code === "Space" || input.code === "Pause" || (input.code === "KeyP" && Boolean(input.ctrlKey || input.altKey))) {
    return "toggle-pause";
  }
  if (input.code === "Minus" || input.code === "NumpadSubtract" || input.code === "BracketLeft") {
    return "slower-game";
  }
  if (input.code === "Equal" || input.code === "NumpadAdd" || input.code === "BracketRight") {
    return "faster-game";
  }
  if (input.code === "NumpadMultiply") {
    return "default-game-speed";
  }
  return null;
}

export function sourceOverlayKeyAction(input: SourceKeyInput, state: { titleScreenOpen: boolean; briefingOpen: boolean }): SourceOverlayKeyAction | null {
  if (state.titleScreenOpen && (input.code === "Enter" || input.code === "Space" || input.code === "Escape")) {
    return "dismiss-title";
  }
  if (state.briefingOpen && (input.code === "Enter" || input.code === "Space" || input.code === "Escape")) {
    return "dismiss-briefing";
  }
  if (state.briefingOpen && input.code === "KeyN") {
    return "replay-briefing";
  }
  return null;
}
