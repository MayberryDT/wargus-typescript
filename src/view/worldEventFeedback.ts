import { selectionAfterWorldEvent } from "../simulation/orders";
import type { WorldState } from "../simulation/world";
import { isLocalPlayerEvent } from "../simulation/worldSelectors";
import type { WargusManifest } from "../wargus/types";
import { addAlertPingForUnit, addHudMessage, type HudMessageState } from "./hudMessages";
import { findGameSoundId, resourceName, unitTypeName, upgradeName } from "./sourceUiHelpers";

type SourceUnitSoundEvent = "selected" | "acknowledge" | "ready" | "dead" | "help" | "attack" | "work-complete";

export interface WorldEventFeedbackHandlers {
  playSound: (soundId: string, pan?: number) => void;
  playUnitSound: (unit: { typeId: string }, event: SourceUnitSoundEvent, pan?: number) => void;
  soundPanForWorldPosition?: (position: { x: number; y: number }) => number;
}

export function drainWorldEventsWithFeedback(
  world: WorldState,
  manifest: WargusManifest | null,
  hudMessages: HudMessageState,
  selectedUnitIds: string[],
  handlers: WorldEventFeedbackHandlers
): string[] {
  if (world.events.length === 0) {
    return selectedUnitIds;
  }
  let nextSelectedUnitIds = selectedUnitIds;
  for (const event of world.events) {
    if (event.kind === "unit-ready") {
      if (isLocalPlayerEvent(world, event.player)) {
        handlers.playUnitSound({ typeId: event.typeId }, "ready", sourceWorldEventPan(world, event, handlers));
        addHudMessage(hudMessages, world, `${unitTypeName(manifest, event.typeId)} ready`);
      }
    } else if (event.kind === "construction-complete") {
      if (isLocalPlayerEvent(world, event.player)) {
        const player = world.players.find((candidate) => candidate.id === event.player);
        const pan = sourceWorldEventPan(world, event, handlers);
        if (event.builderTypeId && sourceUnitHasSound(manifest, event.builderTypeId, "work-complete")) {
          handlers.playUnitSound({ typeId: event.builderTypeId }, "work-complete", pan);
        } else {
          handlers.playSound(findGameSoundId(manifest, "work-complete", player?.race), pan);
        }
        addHudMessage(hudMessages, world, `${unitTypeName(manifest, event.typeId)} complete`);
      }
    } else if (event.kind === "research-complete") {
      if (isLocalPlayerEvent(world, event.player)) {
        const player = world.players.find((candidate) => candidate.id === event.player);
        handlers.playSound(findGameSoundId(manifest, "research-complete", player?.race), sourceWorldEventPan(world, event, handlers));
        addHudMessage(hudMessages, world, `${upgradeName(manifest, event.upgradeId)} complete`);
      }
    } else if (event.kind === "unit-dead") {
      if (isLocalPlayerEvent(world, event.player)) {
        handlers.playUnitSound({ typeId: event.typeId }, "dead", sourceWorldEventPan(world, event, handlers));
      }
    } else if (event.kind === "unit-help") {
      if (isLocalPlayerEvent(world, event.player)) {
        handlers.playUnitSound({ typeId: event.typeId }, "help", sourceWorldEventPan(world, event, handlers));
        addAlertPingForUnit(hudMessages, world, event.unitId);
        addHudMessage(hudMessages, world, `${unitTypeName(manifest, event.typeId)} under attack`);
      }
    } else if (event.kind === "unit-entered-resource" || event.kind === "unit-loaded" || event.kind === "units-unloaded") {
      nextSelectedUnitIds = selectionAfterWorldEvent(world, nextSelectedUnitIds, event);
    } else if (event.kind === "resource-depleted") {
      if (isLocalPlayerEvent(world, event.player)) {
        addHudMessage(hudMessages, world, `${resourceName(world, event.resource)} depleted`);
      }
    } else if (event.kind === "sound") {
      if (isLocalPlayerEvent(world, event.player)) {
        const player = world.players.find((candidate) => candidate.id === event.player);
        const pan = typeof event.x === "number" && typeof event.y === "number"
          ? handlers.soundPanForWorldPosition?.({ x: event.x, y: event.y })
          : undefined;
        handlers.playSound(findGameSoundId(manifest, event.soundId, player?.race), pan);
      }
    }
  }
  world.events.length = 0;
  return nextSelectedUnitIds;
}

function sourceWorldEventPan(
  world: WorldState,
  event: { unitId?: string; x?: number; y?: number },
  handlers: WorldEventFeedbackHandlers
): number | undefined {
  if (typeof event.x === "number" && typeof event.y === "number") {
    return handlers.soundPanForWorldPosition?.({ x: event.x, y: event.y });
  }
  const unit = event.unitId ? world.units.find((candidate) => candidate.id === event.unitId) : null;
  return unit ? handlers.soundPanForWorldPosition?.({ x: unit.x, y: unit.y }) : undefined;
}

function sourceUnitHasSound(manifest: WargusManifest | null, typeId: string, event: SourceUnitSoundEvent): boolean {
  const unit = manifest?.units.find((candidate) => candidate.id === typeId);
  return Boolean(unit?.sounds[event] || Object.values(unit?.soundsByTileset ?? {}).some((sounds) => sounds[event]));
}
