import type { WorldState } from "../simulation/world";
import type { HudMessage } from "./renderHud";
import type { AlertPingOverlay } from "./renderOverlays";

export interface HudMessageState {
  messages: HudMessage[];
  alertPings: AlertPingOverlay[];
}

export function createHudMessageState(): HudMessageState {
  return {
    messages: [],
    alertPings: []
  };
}

export function addHudMessage(state: HudMessageState, world: WorldState | null, text: string, lifetimeMs = 5200, now = performance.now()): void {
  const trimmed = text.trim();
  if (!trimmed || world?.engineSettings.showMessagesDefault === false) {
    return;
  }
  const duplicate = state.messages.find((message) => message.text === trimmed && message.expiresAt > now);
  if (duplicate) {
    duplicate.createdAt = now;
    duplicate.expiresAt = now + lifetimeMs;
  } else {
    state.messages.push({ text: trimmed, createdAt: now, expiresAt: now + lifetimeMs });
  }
  state.messages = state.messages.filter((message) => message.expiresAt > now).slice(-8);
}

export function addAlertPingForUnit(state: HudMessageState, world: WorldState, unitId: string, now = performance.now()): void {
  const unit = world.units.find((candidate) => candidate.id === unitId);
  if (!unit || unit.player !== world.visibilityPlayer) {
    return;
  }
  const existing = state.alertPings.find((ping) => Math.hypot(ping.x - unit.x, ping.y - unit.y) <= world.tileSize * 3);
  if (existing) {
    existing.x = unit.x;
    existing.y = unit.y;
    existing.createdAt = now;
    existing.expiresAt = now + 3600;
    return;
  }
  state.alertPings.push({ x: unit.x, y: unit.y, createdAt: now, expiresAt: now + 3600 });
}

export function pruneHudMessageState(state: HudMessageState, now = performance.now()): void {
  state.alertPings = state.alertPings.filter((ping) => ping.expiresAt > now).slice(-6);
  state.messages = state.messages.filter((message) => message.expiresAt > now).slice(-8);
}

export function clearHudMessageState(state: HudMessageState): void {
  state.messages = [];
  state.alertPings = [];
}
