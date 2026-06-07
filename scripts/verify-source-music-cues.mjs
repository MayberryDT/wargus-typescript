import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const audioSource = readFileSync("src/audio/audioEngine.ts", "utf8");
const audioCueSource = readFileSync("src/audio/audioCues.ts", "utf8");
const typeSource = readFileSync("src/wargus/types.ts", "utf8");
const errors = [];
const customBackgroundMusic = "warcraft-2-ost-human-1-128-ytshorts.savetube.me.mp3";

function expect(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

expect(manifest.counts?.musicCues === manifest.musicCues?.length, "Manifest counts.musicCues does not match musicCues length.");

for (const [race, files] of [
  ["human", ["Human Battle 1.mid", "Human Battle 2.mid", "Human Battle 3.mid", "Human Battle 4.mid", "Human Battle 5.mid"]],
  ["orc", ["Orc Battle 1.mid", "Orc Battle 2.mid", "Orc Battle 3.mid", "Orc Battle 4.mid", "Orc Battle 5.mid"]]
]) {
  const cue = manifest.musicCues?.find((candidate) => candidate.kind === "battle" && candidate.race === race);
  expect(Boolean(cue), `Missing source battle music cue for ${race}.`);
  expect(JSON.stringify(cue?.files ?? []) === JSON.stringify(files.map((file) => `music/${file}`)), `Battle music cue mismatch for ${race}.`);
}

for (const [kind, race, file] of [
  ["briefing", "human", "music/Human Briefing.mid"],
  ["briefing", "orc", "music/Orc Briefing.mid"],
  ["victory", "human", "music/Human Victory.mid"],
  ["victory", "orc", "music/Orc Victory.mid"],
  ["defeat", "human", "music/Human Defeat.mid"],
  ["defeat", "orc", "music/Orc Defeat.mid"]
]) {
  const cue = manifest.musicCues?.find((candidate) => candidate.kind === kind && candidate.race === race);
  expect(cue?.files?.[0] === file, `Missing ${race} ${kind} music cue ${file}.`);
}

for (const cue of manifest.musicCues ?? []) {
  for (const file of cue.files ?? []) {
    expect(existsSync(path.join("public/wargus", file)), `Missing source music cue asset: ${file}`);
  }
}

expect(existsSync(path.join("public/wargus/music", customBackgroundMusic)), `Missing custom background music MP3: ${customBackgroundMusic}`);
expect(audioCueSource.includes(`CUSTOM_BACKGROUND_MUSIC_FILE = "${customBackgroundMusic}"`), "Custom background music constant should point at the requested MP3.");
expect(audioCueSource.includes("audioEngine.playMusicFile(CUSTOM_BACKGROUND_MUSIC_FILE)"), "Gameplay music should start the custom MP3 directly.");

for (const fragment of [
  "musicCues?: WargusMusicCue[]",
  "export interface WargusMusicCue"
]) {
  expect(typeSource.includes(fragment), `Music cue type missing fragment: ${fragment}`);
}

for (const fragment of [
  "parseMusicCues(scriptSources)",
  "parseWargusPlaylist",
  "parseRaceResultMusic",
  "parseRaceBriefingMusic",
  "allFilesSet.has(file)"
]) {
  expect(indexSource.includes(fragment), `Indexer music cue handling missing fragment: ${fragment}`);
}

for (const fragment of [
  "sourceMusicCue(\"battle\", race)",
  "sourceMusicCue(status, race)",
  "sourceMusicCue(\"briefing\", race)",
  "this.manifest.musicCues",
  "musicAudioSourceForFile",
  "isNativeBrowserMusicFile(file)",
  "function isNativeBrowserMusicFile",
  "playDecodedMusicLoop",
  "musicBufferSource",
  "extractedMusicFile",
  "extractedMusicCandidates",
  "BROKEN_MPQ_MUSIC_SIDECARS",
  "return [];",
  "[\".ogg\", \".mp3\", \".wav\"]"
]) {
  expect(audioSource.includes(fragment), `Audio engine source music cue handling missing fragment: ${fragment}`);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source music cue verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source music cues verified (battle playlists plus briefing/victory/defeat music with broken MPQ music sidecars blocked).");
