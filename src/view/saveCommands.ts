import type { WorldState } from "../simulation/world";
import type { WargusManifest } from "../wargus/types";
import { exportSavedGame, importSavedGameJson, loadAutosave, loadSavedGame, saveAutosave, saveGame, type LoadedSavedGame, type SourceViewportCameraSaveState } from "../wargus/saveGame";
import { downloadJsonFile, pickJsonFileText, saveFilenameForSlot } from "./saveFileTransfer";

export interface SaveCommandState {
  activeSaveSlot: number;
}

export interface SaveCommandContext {
  world: WorldState | null;
  manifest: WargusManifest | null;
  camera: { x: number; y: number; zoom: number };
  sourceViewportState?: SourceViewportCameraSaveState;
  controlGroups: Record<number, string[]>;
  showStatus: (message: string, durationMs: number) => void;
  applyLoadedGame: (loaded: LoadedSavedGame) => Promise<void>;
}

export function createSaveCommandState(initialSlot = 1): SaveCommandState {
  return { activeSaveSlot: normalizeSaveSlot(initialSlot) };
}

export function saveCurrentAutosave(context: Pick<SaveCommandContext, "world" | "camera" | "controlGroups" | "sourceViewportState">): void {
  if (context.world) {
    saveAutosave(context.world, context.camera, context.controlGroups, context.sourceViewportState);
  }
}

export function saveCurrentGame(state: SaveCommandState, context: SaveCommandContext): void {
  if (!context.world) {
    return;
  }
  const summary = saveGame(context.world, context.camera, context.controlGroups, state.activeSaveSlot, context.sourceViewportState);
  context.showStatus(summary.persisted === false ? "Browser storage unavailable" : `Saved slot ${summary.slot}: ${summary.mapPath}`, 1200);
}

export async function loadCurrentSaveSlot(state: SaveCommandState, context: SaveCommandContext): Promise<void> {
  if (!context.manifest) {
    return;
  }
  const loaded = loadSavedGame(context.manifest, state.activeSaveSlot);
  if (!loaded) {
    context.showStatus(`No compatible saved game in slot ${state.activeSaveSlot}`, 1200);
    return;
  }
  await context.applyLoadedGame(loaded);
}

export function advanceSaveSlot(state: SaveCommandState, context: Pick<SaveCommandContext, "showStatus">): void {
  state.activeSaveSlot = state.activeSaveSlot % 3 + 1;
  context.showStatus(`Save slot ${state.activeSaveSlot}`, 900);
}

export function exportSaveToFile(state: SaveCommandState, context: SaveCommandContext): void {
  if (!context.world) {
    return;
  }
  const json = exportSavedGame(context.world, context.camera, context.controlGroups, context.sourceViewportState);
  downloadJsonFile(json, saveFilenameForSlot(state.activeSaveSlot, context.world.map.path));
  context.showStatus(`Exported slot ${state.activeSaveSlot}`, 1200);
}

export async function importSaveFromFile(state: SaveCommandState, context: SaveCommandContext): Promise<void> {
  const json = await pickJsonFileText();
  if (!json || !context.manifest) {
    return;
  }
  try {
    const summary = importSavedGameJson(json, state.activeSaveSlot);
    if (!summary) {
      throw new Error("Invalid save file");
    }
    context.showStatus(`Imported slot ${state.activeSaveSlot}: ${summary.mapPath}`, 1200);
    const loaded = loadSavedGame(context.manifest, state.activeSaveSlot);
    if (loaded) {
      await context.applyLoadedGame(loaded);
    }
  } catch (error) {
    context.showStatus(error instanceof Error ? error.message : "Unable to import save", 1600);
  }
}

export async function loadCurrentAutosave(context: SaveCommandContext): Promise<void> {
  if (!context.manifest) {
    return;
  }
  const loaded = loadAutosave(context.manifest);
  if (!loaded) {
    context.showStatus("No compatible autosave", 1200);
    return;
  }
  await context.applyLoadedGame(loaded);
}

function normalizeSaveSlot(slot: number): number {
  const normalized = Math.floor(slot);
  return normalized >= 1 && normalized <= 3 ? normalized : 1;
}
