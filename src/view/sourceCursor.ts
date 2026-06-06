import type { PendingWorldCommand } from "../simulation/orders";
import { canSelectedIssuePendingWorldCommandAt } from "../simulation/orders";
import type { WorldState } from "../simulation/world";
import type { WargusCursorDefinition } from "../wargus/types";

export type SourceCursorRace = "human" | "orc";
export type SourceCursorState = "point" | "green" | "yellow" | "red" | "blocked" | "cross" | "scroll" | "arrow-n" | "arrow-ne" | "arrow-e" | "arrow-se" | "arrow-s" | "arrow-sw" | "arrow-w" | "arrow-nw";

export function sourceCursorStateForPendingCommand(command: PendingWorldCommand | null, hasPointer: boolean, validAtPointer: boolean): SourceCursorState {
  if (!command) {
    return "point";
  }
  if (!hasPointer) {
    return "yellow";
  }
  if (validAtPointer) {
    return "green";
  }
  return command === "move" ? "blocked" : "red";
}

export function sourceCursorDefinitionForState(cursors: WargusCursorDefinition[] | null | undefined, race: SourceCursorRace, state: SourceCursorState): WargusCursorDefinition | null {
  const cursorName = sourceCursorNameForState(state);
  return cursors?.find((cursor) => cursor.race === race && cursor.name === cursorName)
    ?? cursors?.find((cursor) => cursor.race === "any" && cursor.name === cursorName)
    ?? null;
}

export function sourceCursorNameForState(state: SourceCursorState): string {
  if (state === "blocked") {
    return "cursor-blocked";
  }
  if (state === "scroll") {
    return "cursor-scroll";
  }
  if (state === "cross") {
    return "cursor-cross";
  }
  if (state.startsWith("arrow-")) {
    return `cursor-${state}`;
  }
  if (state === "point") {
    return "cursor-point";
  }
  if (state === "green") {
    return "cursor-green-hair";
  }
  if (state === "yellow") {
    return "cursor-yellow-hair";
  }
  return "cursor-red-hair";
}

export function sourceCursorFileForState(cursor: Pick<WargusCursorDefinition, "file">): string {
  return cursor.file;
}

export function sourceCursorCssUrl(cursor: WargusCursorDefinition | null, state: SourceCursorState, race: SourceCursorRace): string {
  void state;
  void race;
  if (!cursor) {
    return "auto";
  }
  const file = sourceCursorFileForState(cursor);
  return `url("/wargus/graphics/${file}") ${cursor.hotSpot[0]} ${cursor.hotSpot[1]}, auto`;
}

export function sourceCursorCssForWorldState(input: {
  cursors: WargusCursorDefinition[] | null | undefined;
  world: WorldState | null;
  pendingWorldCommand: PendingWorldCommand | null;
  pointerWorldPosition: { x: number; y: number } | null;
  selectedUnitIds: string[];
  race: string | null | undefined;
  edgeScrollActive?: boolean;
  edgeScrollX?: number;
  edgeScrollY?: number;
  selectionDragActive?: boolean;
}): string {
  if (input.world?.engineSettings.hardwareCursorDefault === false) {
    return "none";
  }
  const renderState = sourceCursorRenderStateForWorldState(input);
  return renderState ? sourceCursorCssUrl(renderState.cursor, renderState.state, renderState.race) : "auto";
}

export function sourceCursorRenderStateForWorldState(input: {
  cursors: WargusCursorDefinition[] | null | undefined;
  world: WorldState | null;
  pendingWorldCommand: PendingWorldCommand | null;
  pointerWorldPosition: { x: number; y: number } | null;
  selectedUnitIds: string[];
  race: string | null | undefined;
  edgeScrollActive?: boolean;
  edgeScrollX?: number;
  edgeScrollY?: number;
  selectionDragActive?: boolean;
}): { cursor: WargusCursorDefinition; state: SourceCursorState; race: SourceCursorRace } | null {
  const race = input.race === "orc" ? "orc" : "human";
  const state = sourceCursorStateForWorldState(
    input.world,
    input.pendingWorldCommand,
    input.pointerWorldPosition,
    input.selectedUnitIds,
    input.edgeScrollActive === true,
    input.edgeScrollX ?? 0,
    input.edgeScrollY ?? 0,
    input.selectionDragActive === true
  );
  const cursor = sourceCursorDefinitionForState(input.cursors, race, state);
  return cursor ? { cursor, state, race } : null;
}

export function sourceCursorStateForWorldState(
  world: WorldState | null,
  pendingWorldCommand: PendingWorldCommand | null,
  pointerWorldPosition: { x: number; y: number } | null,
  selectedUnitIds: string[],
  edgeScrollActive = false,
  edgeScrollX = 0,
  edgeScrollY = 0,
  selectionDragActive = false
): SourceCursorState {
  if (!pendingWorldCommand && selectionDragActive) {
    return "cross";
  }
  if (!pendingWorldCommand && edgeScrollActive) {
    return sourceCursorStateForEdgeScroll(edgeScrollX, edgeScrollY);
  }
  return sourceCursorStateForPendingCommand(
    pendingWorldCommand,
    Boolean(pointerWorldPosition),
    pendingCommandIsValidAtPointer(world, pendingWorldCommand, pointerWorldPosition, selectedUnitIds)
  );
}

export function sourceCursorStateForEdgeScroll(edgeX: number, edgeY: number): SourceCursorState {
  const horizontal = edgeX < 0 ? "w" : edgeX > 0 ? "e" : "";
  const vertical = edgeY < 0 ? "n" : edgeY > 0 ? "s" : "";
  if (vertical || horizontal) {
    return `arrow-${vertical}${horizontal}` as SourceCursorState;
  }
  return "scroll";
}

export function pendingCommandIsValidAtPointer(
  world: WorldState | null,
  command: PendingWorldCommand | null,
  pointerWorldPosition: { x: number; y: number } | null,
  selectedUnitIds: string[]
): boolean {
  if (!world || !pointerWorldPosition || !command || selectedUnitIds.length === 0) {
    return false;
  }
  return canSelectedIssuePendingWorldCommandAt(world, selectedUnitIds, command, pointerWorldPosition.x, pointerWorldPosition.y, world.visibilityPlayer);
}
