import { applySourceCheat } from "../simulation/orders";
import type { WorldState } from "../simulation/world";

export interface SourceCheatInputState {
  input: string | null;
  sourceSpeedCheat: boolean;
}

export interface SourceCheatInputResult {
  handled: boolean;
  state: SourceCheatInputState;
  message: string | null;
  messageLifetimeMs?: number;
  musicFile: string | null;
}

export function createSourceCheatInputState(): SourceCheatInputState {
  return {
    input: null,
    sourceSpeedCheat: false
  };
}

export function resetSourceCheatInputState(state: SourceCheatInputState): void {
  state.input = null;
  state.sourceSpeedCheat = false;
}

export function applySourceCheatKey(world: WorldState, state: SourceCheatInputState, event: KeyboardEvent): SourceCheatInputResult {
  const result = (handled: boolean, message: string | null = null, messageLifetimeMs?: number, musicFile: string | null = null): SourceCheatInputResult => ({
    handled,
    state,
    message,
    messageLifetimeMs,
    musicFile
  });
  if (state.input === null) {
    if (event.code !== "Enter") {
      return result(false);
    }
    state.input = "";
    return result(true, "Cheat:", 2400);
  }
  if (event.code === "Escape") {
    state.input = null;
    return result(true, "Cheat canceled", 1800);
  }
  if (event.code === "Enter") {
    const submitted = state.input.trim().toLowerCase();
    state.input = null;
    const cheat = applySourceCheat(world, submitted, state.sourceSpeedCheat);
    if (!cheat.handled) {
      return result(true, "Unknown cheat", 2200);
    }
    if (typeof cheat.sourceSpeedCheat === "boolean") {
      state.sourceSpeedCheat = cheat.sourceSpeedCheat;
    }
    return result(true, cheat.message ?? null, undefined, cheat.musicFile ?? null);
  }
  if (event.code === "Backspace") {
    state.input = state.input.slice(0, -1);
    return result(true, `Cheat: ${state.input}`, 2400);
  }
  if (event.key.length === 1 && state.input.length < 64) {
    state.input += event.key.toLowerCase();
    return result(true, `Cheat: ${state.input}`, 2400);
  }
  return result(true);
}
