export interface MidiNote {
  startSeconds: number;
  durationSeconds: number;
  note: number;
  velocity: number;
  channel: number;
}

export interface MidiSong {
  notes: MidiNote[];
  durationSeconds: number;
}

interface ActiveNote {
  oscillator: OscillatorNode;
  gain: GainNode;
}

interface RawMidiNote {
  startTick: number;
  endTick: number;
  note: number;
  velocity: number;
  channel: number;
}

interface TempoEvent {
  tick: number;
  microsecondsPerQuarter: number;
}

export class MidiPlayer {
  private song: MidiSong | null = null;
  private sourceFile: string | null = null;
  private readonly active: ActiveNote[] = [];
  private startedAt = 0;
  private stopTimer: number | null = null;

  constructor(private readonly context: AudioContext, private readonly output: AudioNode) {}

  async play(file: string): Promise<boolean> {
    if (this.sourceFile !== file || !this.song) {
      try {
        this.song = await loadMidiSong(file);
      } catch {
        this.song = null;
      }
      this.sourceFile = file;
    }
    if (!this.song || this.song.notes.length === 0) {
      return false;
    }
    this.stop();
    this.startedAt = this.context.currentTime + 0.08;
    for (const note of this.song.notes) {
      this.scheduleNote(note);
    }
    this.stopTimer = window.setTimeout(() => {
      void this.play(file);
    }, Math.max(1000, this.song.durationSeconds * 1000 + 500));
    return true;
  }

  stop(): void {
    if (this.stopTimer !== null) {
      window.clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    for (const note of this.active.splice(0)) {
      try {
        note.gain.gain.cancelScheduledValues(this.context.currentTime);
        note.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.02);
        note.oscillator.stop(this.context.currentTime + 0.08);
      } catch {
        // The oscillator may already have naturally stopped.
      }
    }
  }

  private scheduleNote(note: MidiNote): void {
    if (note.channel === 9) {
      return;
    }
    const start = this.startedAt + note.startSeconds;
    const duration = Math.max(0.05, note.durationSeconds);
    const end = start + duration;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const level = Math.min(0.028, 0.004 + (note.velocity / 127) * 0.016);
    oscillator.type = waveForChannel(note.channel);
    oscillator.frequency.value = frequencyForMidiNote(note.note);
    filter.type = "lowpass";
    filter.frequency.value = 1200;
    filter.Q.value = 0.4;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + 0.045);
    gain.gain.setTargetAtTime(level * 0.72, start + 0.08, 0.18);
    gain.gain.setValueAtTime(level * 0.72, Math.max(start + 0.08, end - 0.12));
    gain.gain.linearRampToValueAtTime(0, end);
    oscillator.connect(gain);
    gain.connect(filter);
    filter.connect(this.output);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
    const activeNote = { oscillator, gain };
    this.active.push(activeNote);
    oscillator.onended = () => {
      const index = this.active.indexOf(activeNote);
      if (index >= 0) {
        this.active.splice(index, 1);
      }
    };
  }
}

export async function loadMidiSong(file: string): Promise<MidiSong | null> {
  const response = await fetch(`/wargus/music/${encodeURIComponent(file)}`);
  if (!response.ok) {
    return null;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return parseMidi(bytes);
}

function parseMidi(bytes: Uint8Array): MidiSong | null {
  const reader = new MidiReader(bytes);
  if (reader.readText(4) !== "MThd") {
    return null;
  }
  const headerLength = reader.readUint32();
  reader.readUint16();
  const trackCount = reader.readUint16();
  const division = reader.readUint16();
  reader.skip(Math.max(0, headerLength - 6));
  if ((division & 0x8000) !== 0) {
    return null;
  }
  const ticksPerQuarter = division;
  const rawNotes: RawMidiNote[] = [];
  const tempos: TempoEvent[] = [{ tick: 0, microsecondsPerQuarter: 500000 }];
  for (let index = 0; index < trackCount && reader.remaining > 8; index += 1) {
    if (reader.readText(4) !== "MTrk") {
      return null;
    }
    const trackLength = reader.readUint32();
    parseTrack(reader.slice(trackLength), rawNotes, tempos);
  }
  tempos.sort((a, b) => a.tick - b.tick);
  const notes = rawNotes
    .filter((note) => note.endTick > note.startTick)
    .map((note) => ({
      startSeconds: tickToSeconds(note.startTick, tempos, ticksPerQuarter),
      durationSeconds: tickToSeconds(note.endTick, tempos, ticksPerQuarter) - tickToSeconds(note.startTick, tempos, ticksPerQuarter),
      note: note.note,
      velocity: note.velocity,
      channel: note.channel
    }))
    .sort((a, b) => a.startSeconds - b.startSeconds);
  const durationSeconds = notes.reduce((max, note) => Math.max(max, note.startSeconds + note.durationSeconds), 0);
  return { notes, durationSeconds };
}

function parseTrack(reader: MidiReader, notes: RawMidiNote[], tempos: TempoEvent[]): void {
  let tick = 0;
  let runningStatus = 0;
  const activeNotes = new Map<string, RawMidiNote[]>();
  while (reader.remaining > 0) {
    tick += reader.readVariableLength();
    let status = reader.readUint8();
    if (status < 0x80) {
      reader.rewind(1);
      status = runningStatus;
    } else {
      runningStatus = status;
    }
    if (status === 0xff) {
      const type = reader.readUint8();
      const length = reader.readVariableLength();
      if (type === 0x51 && length === 3) {
        tempos.push({ tick, microsecondsPerQuarter: (reader.readUint8() << 16) | (reader.readUint8() << 8) | reader.readUint8() });
      } else {
        reader.skip(length);
      }
      continue;
    }
    if (status === 0xf0 || status === 0xf7) {
      reader.skip(reader.readVariableLength());
      continue;
    }
    const command = status & 0xf0;
    const channel = status & 0x0f;
    const data1 = reader.readUint8();
    const needsSecondByte = command !== 0xc0 && command !== 0xd0;
    const data2 = needsSecondByte ? reader.readUint8() : 0;
    if (command === 0x90 && data2 > 0) {
      const key = `${channel}:${data1}`;
      const stack = activeNotes.get(key) ?? [];
      stack.push({ startTick: tick, endTick: tick, note: data1, velocity: data2, channel });
      activeNotes.set(key, stack);
    } else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
      const key = `${channel}:${data1}`;
      const stack = activeNotes.get(key);
      const note = stack?.shift();
      if (note) {
        note.endTick = tick;
        notes.push(note);
      }
      if (stack && stack.length === 0) {
        activeNotes.delete(key);
      }
    }
  }
}

function tickToSeconds(tick: number, tempos: TempoEvent[], ticksPerQuarter: number): number {
  let seconds = 0;
  let previousTick = 0;
  let tempo = tempos[0]?.microsecondsPerQuarter ?? 500000;
  for (const event of tempos) {
    if (event.tick > tick) {
      break;
    }
    seconds += ((event.tick - previousTick) * tempo) / ticksPerQuarter / 1000000;
    previousTick = event.tick;
    tempo = event.microsecondsPerQuarter;
  }
  return seconds + ((tick - previousTick) * tempo) / ticksPerQuarter / 1000000;
}

export function frequencyForMidiNote(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

function waveForChannel(channel: number): OscillatorType {
  return channel % 4 === 0 ? "triangle" : "sine";
}

class MidiReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  readText(length: number): string {
    const text = String.fromCharCode(...this.bytes.slice(this.offset, this.offset + length));
    this.offset += length;
    return text;
  }

  readUint8(): number {
    return this.bytes[this.offset++] ?? 0;
  }

  readUint16(): number {
    return (this.readUint8() << 8) | this.readUint8();
  }

  readUint32(): number {
    return (this.readUint8() << 24) | (this.readUint8() << 16) | (this.readUint8() << 8) | this.readUint8();
  }

  readVariableLength(): number {
    let value = 0;
    for (let index = 0; index < 4; index += 1) {
      const byte = this.readUint8();
      value = (value << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) {
        break;
      }
    }
    return value;
  }

  rewind(length: number): void {
    this.offset = Math.max(0, this.offset - length);
  }

  skip(length: number): void {
    this.offset = Math.min(this.bytes.length, this.offset + length);
  }

  slice(length: number): MidiReader {
    const end = Math.min(this.bytes.length, this.offset + length);
    const slice = this.bytes.slice(this.offset, end);
    this.offset = end;
    return new MidiReader(slice);
  }
}
