import type { WorldState } from "../simulation/world";
import type { WargusManifest } from "../wargus/types";
import { sourceTitleMusicFile } from "../view/sourceUiHelpers";
import type { AudioEngine } from "./audioEngine";

export const CUSTOM_BACKGROUND_MUSIC_FILE = "warcraft-2-ost-human-1-128-ytshorts.savetube.me.mp3";

export interface AudioCueState {
  lastBriefingAudioKey: string | null;
  lastMatchMusicStatus: WorldState["matchState"]["status"] | null;
}

export function createAudioCueState(): AudioCueState {
  return {
    lastBriefingAudioKey: null,
    lastMatchMusicStatus: null
  };
}

export function resetBriefingAudioCue(state: AudioCueState): void {
  state.lastBriefingAudioKey = null;
}

export function resetMatchMusicCue(state: AudioCueState): void {
  state.lastMatchMusicStatus = null;
}

export async function ensureSourceMusicStarted(
  audioEngine: AudioEngine | null,
  manifest: WargusManifest | null,
  world: WorldState | null,
  state: { titleScreenOpen: boolean; briefingOpen: boolean }
): Promise<void> {
  if (!audioEngine || !world) {
    return;
  }
  await audioEngine.unlock();
  if (state.titleScreenOpen) {
    await audioEngine.playMusicFile(sourceTitleMusicFile(manifest));
    return;
  }
  if (state.briefingOpen) {
    audioEngine.stopMusic();
    return;
  }
  await audioEngine.playMusicFile(CUSTOM_BACKGROUND_MUSIC_FILE);
}

export function startBriefingAudioCue(cueState: AudioCueState, audioEngine: AudioEngine | null, world: WorldState, briefingOpen: boolean): void {
  if (!briefingOpen || world.briefingVoiceFiles.length === 0) {
    return;
  }
  const key = world.briefingVoiceFiles.join("|");
  if (cueState.lastBriefingAudioKey === key) {
    return;
  }
  const playback = audioEngine?.playSoundFiles(world.briefingVoiceFiles);
  if (playback) {
    void playback.then(() => {
      cueState.lastBriefingAudioKey = key;
    });
  }
}

export function maybeStartMatchMusicCue(cueState: AudioCueState, audioEngine: AudioEngine | null, world: WorldState): void {
  const status = world.matchState.status;
  if (!audioEngine || status === "playing" || cueState.lastMatchMusicStatus === status) {
    return;
  }
  cueState.lastMatchMusicStatus = status;
  const player = world.players.find((candidate) => candidate.id === world.visibilityPlayer);
  void audioEngine.playSound("statsthump");
  void audioEngine.playMatchMusic(status, player?.race);
}
