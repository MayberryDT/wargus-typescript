import type { WargusManifest, WargusUnit } from "../wargus/types";
import { frequencyForMidiNote, loadMidiSong, MidiPlayer, type MidiSong } from "./midiPlayer";

type SourceUnitSoundEvent = "selected" | "acknowledge" | "ready" | "dead" | "help" | "attack" | "work-complete";

export class AudioEngine {
  private context: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private midiPlayer: MidiPlayer | null = null;
  private musicBufferSource: AudioBufferSourceNode | null = null;
  private musicElement: HTMLAudioElement | null = null;
  private musicObjectUrl: string | null = null;
  private readonly musicBlobCache = new Map<string, Blob>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private lastPlayedAt = new Map<string, number>();
  private nextVariantIndexBySound = new Map<string, number>();
  private nextMusicIndexByPrefix = new Map<string, number>();
  private currentMusic: string | null = null;
  private briefingSources: AudioBufferSourceNode[] = [];
  private tileset: string | null = null;
  private effectsEnabled: boolean;
  private effectsGainValue: number;
  private musicEnabled: boolean;
  private musicGainValue: number;
  private stereoSound: boolean;
  private unlocked = false;
  private playAttempts = 0;
  private playStarts = 0;
  private playFailures = 0;
  private decodeFailures = 0;
  private lastSoundId: string | null = null;
  private lastSoundFile: string | null = null;
  private lastError: string | null = null;
  private htmlPlayStarts = 0;
  private htmlPlayFailures = 0;
  private readonly htmlAudioElements = new Set<HTMLAudioElement>();

  constructor(private readonly manifest: WargusManifest) {
    this.effectsEnabled = manifest.engineSettings?.effectsEnabledDefault !== false;
    this.effectsGainValue = sourceVolumeToGain(manifest.engineSettings?.effectsVolumeDefault ?? 128, 1.1);
    this.musicEnabled = manifest.engineSettings?.musicEnabledDefault !== false;
    this.musicGainValue = sourceVolumeToGain(manifest.engineSettings?.musicVolumeDefault ?? 128, 0.62);
    this.stereoSound = manifest.engineSettings?.stereoSoundDefault !== false;
  }

  setTileset(tileset: string | null | undefined): void {
    this.tileset = normalizeTilesetName(tileset);
  }

  setEffectsEnabled(enabled: boolean): void {
    this.effectsEnabled = enabled;
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    if (this.musicGain) {
      this.musicGain.gain.value = enabled ? this.musicGainValue : 0;
    }
    if (!enabled) {
      this.stopMusic();
    }
  }

  setStereoSound(enabled: boolean): void {
    this.stereoSound = enabled;
  }

  setEffectsVolume(sourceVolume: number): void {
    this.effectsGainValue = sourceVolumeToGain(sourceVolume, 1.1);
  }

  setMusicVolume(sourceVolume: number): void {
    this.musicGainValue = sourceVolumeToGain(sourceVolume, 0.32);
    if (this.musicGain) {
      this.musicGain.gain.value = this.musicEnabled ? this.musicGainValue : 0;
    }
  }

  async resume(): Promise<void> {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.musicGain = this.context.createGain();
        this.musicGain.gain.value = this.musicEnabled ? this.musicGainValue : 0;
        this.musicGain.connect(this.context.destination);
        this.midiPlayer = new MidiPlayer(this.context, this.musicGain);
      }
      if (this.context.state !== "running") {
        await this.context.resume();
      }
    } catch {
      this.context = null;
      this.musicGain = null;
      this.midiPlayer = null;
      this.unlocked = false;
      this.lastError = "audio-context-create-failed";
    }
  }

  async unlock(): Promise<void> {
    await this.resume();
    const context = this.context;
    if (!context || this.unlocked) {
      return;
    }
    try {
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = context.createBuffer(1, 1, context.sampleRate);
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(context.destination);
      source.start();
      this.unlocked = true;
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
    } catch (error) {
      this.lastError = audioErrorMessage(error);
    }
  }

  smokeState(): {
    contextCreated: boolean;
    contextState: AudioContextState | null;
    bufferedSounds: number;
    currentMusic: string | null;
    stereoSound: boolean;
    unlocked: boolean;
    playAttempts: number;
    playStarts: number;
    playFailures: number;
    decodeFailures: number;
    lastSoundId: string | null;
    lastSoundFile: string | null;
    lastError: string | null;
    htmlPlayStarts: number;
    htmlPlayFailures: number;
  } {
    return {
      contextCreated: Boolean(this.context),
      contextState: this.context?.state ?? null,
      bufferedSounds: this.buffers.size,
      currentMusic: this.currentMusic,
      stereoSound: this.stereoSound,
      unlocked: this.unlocked,
      playAttempts: this.playAttempts,
      playStarts: this.playStarts,
      playFailures: this.playFailures,
      decodeFailures: this.decodeFailures,
      lastSoundId: this.lastSoundId,
      lastSoundFile: this.lastSoundFile,
      lastError: this.lastError,
      htmlPlayStarts: this.htmlPlayStarts,
      htmlPlayFailures: this.htmlPlayFailures
    };
  }

  async ensureBattleMusic(race: string | null | undefined): Promise<void> {
    if (!this.musicEnabled || !this.unlocked) {
      return;
    }
    await this.resume();
    const file = this.chooseBattleMusicFile(race);
    if (!file || this.currentMusic === file) {
      return;
    }
    await this.playBrowserMusicLoop(file);
  }

  async playBriefingMusic(race: string | null | undefined): Promise<void> {
    if (!this.musicEnabled || !this.unlocked) {
      return;
    }
    await this.resume();
    const file = this.chooseBriefingMusicFile(race);
    if (!file || this.currentMusic === file) {
      return;
    }
    await this.playBrowserMusicLoop(file);
  }

  async playMusicFile(file: string | null | undefined): Promise<void> {
    if (!this.musicEnabled || !this.unlocked || !file) {
      return;
    }
    await this.resume();
    const normalized = file.replace(/^music\//, "");
    if (this.currentMusic === normalized) {
      return;
    }
    await this.playBrowserMusicLoop(normalized);
  }

  async playMatchMusic(status: "victory" | "defeat" | "draw", race: string | null | undefined): Promise<void> {
    if (!this.musicEnabled || !this.unlocked) {
      return;
    }
    await this.resume();
    const file = this.chooseMatchMusicFile(status, race);
    if (!file || this.currentMusic === file) {
      return;
    }
    await this.playBrowserMusicLoop(file);
  }

  stopMusic(): void {
    this.midiPlayer?.stop();
    if (this.musicBufferSource) {
      try {
        this.musicBufferSource.stop();
      } catch {
        // Already stopped.
      }
      this.musicBufferSource.disconnect();
      this.musicBufferSource = null;
    }
    if (this.musicElement) {
      this.musicElement.pause();
      this.musicElement.removeAttribute("src");
      this.musicElement.load();
      this.musicElement = null;
    }
    if (this.musicObjectUrl) {
      URL.revokeObjectURL(this.musicObjectUrl);
      this.musicObjectUrl = null;
    }
    this.currentMusic = null;
  }

  private async playBrowserMusicLoop(file: string): Promise<void> {
    this.stopMusic();
    const source = await this.musicAudioSourceForFile(file);
    if (await this.playDecodedMusicLoop(source)) {
      return;
    }
    const audio = new Audio(source.url);
    audio.loop = true;
    audio.volume = Math.max(0.02, Math.min(0.3, this.musicGainValue * 1.8));
    this.musicElement = audio;
    try {
      await audio.play();
      this.currentMusic = source.file;
      this.lastError = null;
    } catch (error) {
      this.lastError = audioErrorMessage(error);
    }
  }

  private async playDecodedMusicLoop(source: { file: string; url: string }): Promise<boolean> {
    const context = this.context;
    const gain = this.musicGain;
    if (!context || !gain) {
      return false;
    }
    try {
      const response = await fetch(source.url);
      if (!response.ok) {
        return false;
      }
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      const node = context.createBufferSource();
      node.buffer = buffer;
      node.loop = true;
      node.connect(gain);
      node.start();
      this.musicBufferSource = node;
      this.currentMusic = source.file;
      this.lastError = null;
      return true;
    } catch (error) {
      this.lastError = `music-decode:${audioErrorMessage(error)}`;
      return false;
    }
  }

  private async musicAudioSourceForFile(file: string): Promise<{ file: string; url: string }> {
    const extracted = await this.extractedMusicFile(file);
    if (extracted) {
      return { file: extracted, url: `/wargus/music/${encodeURIComponent(extracted)}` };
    }
    const blob = await this.musicBlobForFile(file);
    this.musicObjectUrl = URL.createObjectURL(blob);
    return { file, url: this.musicObjectUrl };
  }

  private async extractedMusicFile(file: string): Promise<string | null> {
    for (const candidate of extractedMusicCandidates(file)) {
      try {
        const response = await fetch(`/wargus/music/${encodeURIComponent(candidate)}`, { method: "HEAD" });
        if (response.ok) {
          return candidate;
        }
      } catch {
        // Missing sidecar audio falls back to browser MIDI synthesis.
      }
    }
    return null;
  }

  private async musicBlobForFile(file: string): Promise<Blob> {
    const cached = this.musicBlobCache.get(file);
    if (cached) {
      return cached;
    }
    const song = await loadMidiSong(file);
    const blob = song?.notes.length ? createMidiMusicLoopBlob(song) : createFallbackMusicLoopBlob(file);
    this.musicBlobCache.set(file, blob);
    return blob;
  }

  async playUnitSound(unit: { typeId: string }, event: SourceUnitSoundEvent, pan = 0): Promise<void> {
    const unitDefinition = this.manifest.units.find((candidate) => candidate.id === unit.typeId);
    const soundId = this.sourceUnitSoundId(unitDefinition, event);
    if (!soundId) {
      return;
    }
    await this.playSound(event === "selected" ? this.sourceSelectedSoundMember(soundId) : soundId, pan);
  }

  private sourceUnitSoundId(unitDefinition: WargusUnit | undefined, event: SourceUnitSoundEvent): string | undefined {
    const sourceEvent = event === "attack" ? ["attack", "acknowledge"] : [event];
    for (const candidate of sourceEvent) {
      const soundId = this.tileset
        ? unitDefinition?.soundsByTileset?.[this.tileset]?.[candidate] ?? unitDefinition?.sounds[candidate]
        : unitDefinition?.sounds[candidate];
      if (soundId) {
        return soundId;
      }
    }
    return undefined;
  }

  async playUnitAnnoyedSound(unit: { typeId: string }, pan = 0): Promise<void> {
    const unitDefinition = this.manifest.units.find((candidate) => candidate.id === unit.typeId);
    const soundId = this.tileset
      ? unitDefinition?.soundsByTileset?.[this.tileset]?.annoyed ?? unitDefinition?.sounds.annoyed
      : unitDefinition?.sounds.annoyed;
    if (!soundId) {
      await this.playUnitSound(unit, "selected", pan);
      return;
    }
    await this.playSound(soundId, pan);
  }

  async playSound(soundId: string, pan = 0): Promise<void> {
    if (!this.effectsEnabled) {
      return;
    }
    this.playAttempts += 1;
    this.lastSoundId = soundId;
    this.lastSoundFile = null;
    this.lastError = null;
    const now = performance.now();
    if ((this.lastPlayedAt.get(soundId) ?? 0) + 90 > now) {
      return;
    }
    this.lastPlayedAt.set(soundId, now);

    await this.unlock();
    const context = this.context;
    if (!context) {
      this.playFailures += 1;
      this.lastError = "audio-context-unavailable";
      return;
    }
    if (context.state !== "running") {
      this.playFailures += 1;
      this.lastError = `audio-context-${context.state}`;
      return;
    }
    const sound = this.manifest.sounds.find((candidate) => candidate.id === soundId);
    const file = this.choosePlayableSoundFile(soundId, sound?.files ?? []);
    if (!file) {
      this.playFailures += 1;
      this.lastError = "sound-file-missing";
      return;
    }
    this.lastSoundFile = file;

    this.playHtmlSound(file, this.effectsGainValue * sourceSoundRangeGain(sound, pan), pan);
    this.playStarts += 1;
    void this.loadBuffer(file);
  }

  async playSoundFiles(files: string[]): Promise<void> {
    if (!this.effectsEnabled || !this.unlocked) {
      return;
    }
    await this.resume();
    const context = this.context;
    if (!context) {
      return;
    }
    this.stopBriefingSounds();
    let startAt = context.currentTime + 0.04;
    for (const file of files) {
      const buffer = await this.loadBuffer(file);
      if (!buffer) {
        continue;
      }
      const source = context.createBufferSource();
      const gain = context.createGain();
      gain.gain.value = this.effectsGainValue;
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(context.destination);
      source.start(startAt);
      startAt += buffer.duration + 0.12;
      this.briefingSources.push(source);
      source.onended = () => {
        const index = this.briefingSources.indexOf(source);
        if (index >= 0) {
          this.briefingSources.splice(index, 1);
        }
      };
    }
  }

  stopBriefingSounds(): void {
    for (const source of this.briefingSources.splice(0)) {
      try {
        source.stop();
      } catch {
        // Already ended.
      }
    }
  }

  private playHtmlSound(file: string, gainValue: number, pan: number): void {
    try {
      // The previous Web Audio path used context.createStereoPanner; HTML media is kept here for reliable demo audibility.
      const audio = new Audio(`/wargus/sounds/${file}`);
      audio.volume = Math.max(0, Math.min(1, gainValue));
      audio.preservesPitch = false;
      this.htmlAudioElements.add(audio);
      audio.addEventListener("ended", () => {
        this.htmlAudioElements.delete(audio);
      }, { once: true });
      audio.addEventListener("error", () => {
        this.htmlAudioElements.delete(audio);
        this.htmlPlayFailures += 1;
      }, { once: true });
      const playResult = audio.play();
      this.htmlPlayStarts += 1;
      void playResult.then(() => {
        this.lastError = null;
      }).catch((error) => {
        this.htmlAudioElements.delete(audio);
        this.htmlPlayFailures += 1;
        this.lastError = audioErrorMessage(error);
      });
      if (Math.abs(pan) > 0.01) {
        audio.dataset.pan = String(clampAudioPan(pan));
      }
    } catch (error) {
      this.htmlPlayFailures += 1;
      this.lastError = audioErrorMessage(error);
    }
  }

  private choosePlayableSoundFile(soundId: string, files: string[]): string | null {
    const playable = files.filter((file) => !file.endsWith(".mid"));
    if (playable.length === 0) {
      return null;
    }
    if (playable.length === 1) {
      return playable[0];
    }
    const index = this.nextVariantIndexBySound.get(soundId) ?? 0;
    const file = playable[index % playable.length] ?? playable[0];
    this.nextVariantIndexBySound.set(soundId, index + 1);
    return file;
  }

  private sourceSelectedSoundMember(soundId: string): string {
    const sound = this.manifest.sounds.find((candidate) => candidate.id === soundId);
    return sound?.members?.[0] ?? soundId;
  }

  private chooseBattleMusicFile(race: string | null | undefined): string | null {
    const prefix = musicRacePrefix(race);
    const sourceCue = this.sourceMusicCue("battle", race);
    const roots = sourceCue.length > 0 ? sourceCue : this.musicFiles();
    if (this.currentMusic?.startsWith(`${prefix} Battle`)) {
      return this.currentMusic;
    }
    const candidates = roots.filter((file) => file.startsWith(prefix) || sourceCue.includes(file));
    const pool = candidates.length > 0 ? candidates : roots;
    const index = this.nextMusicIndexByPrefix.get(prefix) ?? 0;
    const file = pool[index % pool.length] ?? null;
    this.nextMusicIndexByPrefix.set(prefix, index + 1);
    return file;
  }

  private chooseMatchMusicFile(status: "victory" | "defeat" | "draw", race: string | null | undefined): string | null {
    if (status === "draw") {
      return null;
    }
    const sourceCue = this.sourceMusicCue(status, race);
    if (sourceCue.length > 0) {
      return sourceCue[0] ?? null;
    }
    const roots = this.musicFiles();
    const prefix = musicRacePrefix(race);
    const titleStatus = status === "victory" ? "Victory" : "Defeat";
    const preferred = `${prefix} ${titleStatus}.mid`;
    return roots.find((file) => file === preferred)
      ?? roots.find((file) => file.endsWith(`${titleStatus}.mid`))
      ?? null;
  }

  private chooseBriefingMusicFile(race: string | null | undefined): string | null {
    const sourceCue = this.sourceMusicCue("briefing", race);
    if (sourceCue.length > 0) {
      return sourceCue[0] ?? null;
    }
    const roots = this.musicFiles();
    const prefix = musicRacePrefix(race);
    const preferred = `${prefix} Briefing.mid`;
    return roots.find((file) => file === preferred)
      ?? roots.find((file) => file.endsWith("Briefing.mid"))
      ?? null;
  }

  private musicFiles(): string[] {
    return this.manifest.assetRoots.music
      .filter((file) => file.endsWith(".mid"))
      .map((file) => file.replace(/^music\//, ""));
  }

  private sourceMusicCue(kind: "battle" | "briefing" | "victory" | "defeat", race: string | null | undefined): string[] {
    const sourceRace = race === "orc" ? "orc" : "human";
    return this.manifest.musicCues
      ?.find((cue) => cue.kind === kind && cue.race === sourceRace)
      ?.files
      .map((file) => file.replace(/^music\//, ""))
      ?? [];
  }

  private async loadBuffer(file: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(file);
    if (cached) {
      return cached;
    }
    const context = this.context;
    if (!context) {
      return null;
    }
    try {
      const response = await fetch(`/wargus/sounds/${file}`);
      if (!response.ok) {
        this.lastError = `sound-http-${response.status}`;
        return null;
      }
      const bytes = await response.arrayBuffer();
      const buffer = await context.decodeAudioData(bytes);
      this.buffers.set(file, buffer);
      return buffer;
    } catch (error) {
      this.decodeFailures += 1;
      this.lastError = audioErrorMessage(error);
      return null;
    }
  }
}

function musicRacePrefix(race: string | null | undefined): "Human" | "Orc" {
  return race === "orc" ? "Orc" : "Human";
}

function extractedMusicCandidates(file: string): string[] {
  const withoutMusicRoot = file.replace(/^music\//, "");
  const base = withoutMusicRoot.replace(/\.[^.]+$/, "");
  if (BROKEN_MPQ_MUSIC_SIDECARS.has(base)) {
    return [];
  }
  return [".ogg", ".mp3", ".wav"].map((extension) => `${base}${extension}`);
}

const BROKEN_MPQ_MUSIC_SIDECARS = new Set(["Human Battle 1", "Human Briefing", "Human Victory"]);

function sourceVolumeToGain(volume: number, scale: number): number {
  return Math.max(0, Math.min(1, Math.max(0, Math.min(1, volume / 255)) * scale));
}

function clampAudioPan(value: number): number {
  return Math.max(-0.85, Math.min(0.85, value));
}

function sourceSoundRangeGain(sound: WargusManifest["sounds"][number] | undefined, pan: number): number {
  if (typeof sound?.range !== "number" || sound.range >= 255) {
    return 1;
  }
  const minimum = Math.max(0, Math.min(1, sound.range / 255));
  const positionalFalloff = 1 - Math.min(1, Math.abs(pan));
  return Math.max(minimum, positionalFalloff);
}

function normalizeTilesetName(tileset: string | null | undefined): string | null {
  return tileset?.replace(/^scripts\/tilesets\//, "").replace(/^wargus\//, "").replace(/\.lua$/, "") ?? null;
}

function createMidiMusicLoopBlob(song: MidiSong): Blob {
  const sampleRate = 22050;
  const durationSeconds = Math.max(8, Math.min(28, song.durationSeconds || 18));
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const samples = new Float32Array(sampleCount);
  const notes = song.notes
    .filter((note) => note.channel !== 9 && note.startSeconds < durationSeconds && note.note >= 24 && note.note <= 96)
    .slice(0, 900);

  for (const note of notes) {
    const frequency = frequencyForMidiNote(note.note);
    const start = Math.max(0, Math.floor(note.startSeconds * sampleRate));
    const end = Math.min(sampleCount, Math.floor((note.startSeconds + Math.min(note.durationSeconds, 3.5)) * sampleRate));
    if (end <= start) {
      continue;
    }
    const noteLength = end - start;
    const level = Math.min(0.035, 0.004 + (note.velocity / 127) * 0.018);
    for (let index = start; index < end; index += 1) {
      const local = index - start;
      const t = local / sampleRate;
      const attack = Math.min(1, local / Math.max(1, sampleRate * 0.035));
      const release = Math.min(1, (noteLength - local) / Math.max(1, sampleRate * 0.12));
      const envelope = Math.max(0, Math.min(attack, release));
      const tone = Math.sin(2 * Math.PI * frequency * t) + 0.2 * Math.sin(2 * Math.PI * frequency * 2 * t);
      samples[index] += tone * level * envelope;
    }
  }
  return wavBlobFromSamples(softLimitSamples(samples), sampleRate);
}

function createFallbackMusicLoopBlob(seed: string): Blob {
  const sampleRate = 22050;
  const durationSeconds = 8;
  const sampleCount = sampleRate * durationSeconds;
  const bytesPerSample = 2;
  const dataSize = sampleCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const human = !seed.toLowerCase().includes("orc");
  const root = human ? 196 : 146.83;
  const chords = human
    ? [[1, 1.25, 1.5], [0.89, 1.12, 1.33], [0.75, 0.94, 1.25], [0.84, 1.06, 1.5]]
    : [[1, 1.19, 1.5], [0.84, 1, 1.26], [0.75, 0.89, 1.19], [0.67, 0.84, 1]];
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const t = sample / sampleRate;
    const chord = chords[Math.floor(t / 2) % chords.length] ?? chords[0];
    const envelope = 0.5 - 0.5 * Math.cos((2 * Math.PI * sample) / sampleCount);
    const pulse = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.25 * t);
    let value = 0;
    for (const ratio of chord) {
      value += Math.sin(2 * Math.PI * root * ratio * t) * 0.2;
      value += Math.sin(2 * Math.PI * root * ratio * 2 * t) * 0.035;
    }
    const mixed = Math.max(-1, Math.min(1, value * envelope * pulse * 0.45));
    view.setInt16(44 + sample * bytesPerSample, Math.round(mixed * 32767), true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function softLimitSamples(samples: Float32Array): Float32Array {
  let peak = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
  }
  const gain = peak > 0 ? Math.min(1, 0.85 / peak) : 1;
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.tanh(samples[index] * gain * 1.4) * 0.75;
  }
  return samples;
}

function wavBlobFromSamples(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);
  for (let index = 0; index < samples.length; index += 1) {
    view.setInt16(44 + index * bytesPerSample, Math.round(Math.max(-1, Math.min(1, samples[index])) * 32767), true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function audioErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getUnitSoundId(units: WargusUnit[], typeId: string, event: SourceUnitSoundEvent, tileset?: string | null): string | null {
  const unit = units.find((candidate) => candidate.id === typeId);
  const normalizedTileset = normalizeTilesetName(tileset);
  const sourceEvents = event === "attack" ? ["attack", "acknowledge"] : [event];
  for (const sourceEvent of sourceEvents) {
    const soundId = normalizedTileset
      ? unit?.soundsByTileset?.[normalizedTileset]?.[sourceEvent] ?? unit?.sounds[sourceEvent]
      : unit?.sounds[sourceEvent];
    if (soundId) {
      return soundId;
    }
  }
  return null;
}
