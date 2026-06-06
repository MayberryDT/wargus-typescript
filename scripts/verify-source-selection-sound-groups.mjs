import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const sounds = new Map((manifest.sounds ?? []).map((sound) => [sound.id, sound]));
const groupedSelections = [];
const failures = [];

for (const unit of manifest.units ?? []) {
  const selected = unit.sounds?.selected;
  const annoyed = unit.sounds?.annoyed;
  const group = selected ? sounds.get(selected) : null;
  if (!group?.members?.length) {
    continue;
  }
  groupedSelections.push({ unit, group, annoyed });
  const first = sounds.get(group.members[0]);
  if (!first) {
    failures.push(`${unit.id} selected group ${group.id} points at missing first member ${group.members[0]}`);
  }
  const firstFiles = new Set(first?.files ?? []);
  const selectedOnly = (group.files ?? []).filter((file) => firstFiles.has(file));
  const annoyedFiles = (annoyed ? sounds.get(annoyed)?.files : []) ?? [];
  if (selectedOnly.length === 0) {
    failures.push(`${unit.id} selected group ${group.id} has no playable first-member selected files.`);
  }
  if (annoyed && annoyedFiles.length > 0 && selectedOnly.some((file) => annoyedFiles.includes(file))) {
    failures.push(`${unit.id} selected first member overlaps annoyed sound files.`);
  }
}

if (groupedSelections.length === 0) {
  failures.push("Expected Wargus MakeSoundGroup selected voice groups in the manifest.");
}

const audioSource = readFileSync("src/audio/audioEngine.ts", "utf8");
for (const fragment of [
  "await this.playSound(event === \"selected\" ? this.sourceSelectedSoundMember(soundId) : soundId, pan)",
  "private sourceSelectedSoundMember(soundId: string): string",
  "return sound?.members?.[0] ?? soundId",
  "async playUnitAnnoyedSound"
]) {
  if (!audioSource.includes(fragment)) {
    failures.push(`Audio engine missing source selection sound-group fragment: ${fragment}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Source selection sound groups verified (${groupedSelections.length} grouped unit selection sounds split from annoyed playback).`);
