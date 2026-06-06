import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const soundIds = new Set((manifest.sounds ?? []).map((sound) => sound.id));
const checks = [];
const treeChopping = (manifest.sounds ?? []).find((sound) => sound.id === "tree-chopping");

function add(kind, owner, soundId) {
  if (soundId) {
    checks.push({ kind, owner, soundId });
  }
}

for (const unit of manifest.units ?? []) {
  for (const [event, soundId] of Object.entries(unit.sounds ?? {})) {
    add("unit sound", `${unit.id}.${event}`, soundId);
  }
  for (const [tileset, sounds] of Object.entries(unit.soundsByTileset ?? {})) {
    for (const [event, soundId] of Object.entries(sounds ?? {})) {
      add("unit tileset sound", `${unit.id}.${tileset}.${event}`, soundId);
    }
  }
}

for (const gameSound of manifest.gameSounds ?? []) {
  add("game sound", `${gameSound.event}.${gameSound.race}`, gameSound.soundId);
}

for (const missile of manifest.missiles ?? []) {
  add("missile fired sound", missile.id, missile.firedSound);
  add("missile impact sound", missile.id, missile.impactSound);
}

for (const spell of manifest.spells ?? []) {
  add("spell cast sound", spell.id, spell.soundWhenCast);
}

const normalizerSource = readFileSync("src/wargus/manifest.ts", "utf8");
for (const block of normalizerSource.matchAll(/\bsounds:\s*\{([^}]*)\}/gms)) {
  for (const match of block[1].matchAll(/:\s*"([^"]+)"/g)) {
    add("normalizer sound", "src/wargus/manifest.ts", match[1]);
  }
}

const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
for (const functionName of ["soundForProjectileLaunch", "soundForMeleeAttack", "soundForSpellEffect"]) {
  const body = ordersSource.match(new RegExp(`function ${functionName}\\\\([^)]*\\\\)[^{]*\\\\{([\\\\s\\\\S]*?)\\\\n\\\\}`))?.[1] ?? "";
  for (const match of body.matchAll(/return\s+"([^"]+)"/g)) {
    add("runtime sound fallback", functionName, match[1]);
  }
}

const audioSource = readFileSync("src/audio/audioEngine.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const eventFeedbackSource = readFileSync("src/view/worldEventFeedback.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
for (const fragment of [
  "manifest.engineSettings?.effectsVolumeDefault",
  "manifest.engineSettings?.musicVolumeDefault",
  "sourceVolumeToGain",
  "Math.max(0, Math.min(1, Math.max(0, Math.min(1, volume / 255)) * scale))",
  "context.createStereoPanner",
  "smokeState()",
  "contextState: this.context?.state ?? null",
  "sourceSoundRangeGain(sound, pan)",
  "function sourceSoundRangeGain",
  'type SourceUnitSoundEvent = "selected" | "acknowledge" | "ready" | "dead" | "help" | "attack" | "work-complete"',
  "private sourceUnitSoundId(unitDefinition: WargusUnit | undefined, event: SourceUnitSoundEvent): string | undefined",
  "const sourceEvent = event === \"attack\" ? [\"attack\", \"acknowledge\"] : [event]",
  "unitDefinition?.soundsByTileset?.[this.tileset]?.[candidate]",
  "await this.playSound(event === \"selected\" ? this.sourceSelectedSoundMember(soundId) : soundId, pan)",
  "event: SourceUnitSoundEvent",
  "private sourceSelectedSoundMember(soundId: string): string",
  "return sound?.members?.[0] ?? soundId",
  "function normalizeTilesetName",
  "replace(/^wargus\\//, \"\")",
  "const sourceEvents = event === \"attack\" ? [\"attack\", \"acknowledge\"] : [event]",
  "unit?.soundsByTileset?.[normalizedTileset]?.[sourceEvent] ?? unit?.sounds[sourceEvent]",
  "this.manifest.musicCues"
]) {
  if (!audioSource.includes(fragment)) {
    console.error(`Audio engine is missing source sound fragment: ${fragment}`);
    process.exit(1);
  }
}

for (const [source, fragment, name] of [
  [indexSource, "function parseSoundRanges(source)", "indexer"],
  [indexSource, "SetSoundRange\\(\\s*\"([^\"]+)\"\\s*,\\s*(-?\\d+)\\s*\\)", "indexer"],
  [indexSource, "soundsById.set(soundId, { ...existing, range });", "indexer"],
  [typesSource, "range?: number;", "types"],
]) {
  if (!source.includes(fragment)) {
    console.error(`${name} is missing source sound range fragment: ${fragment}`);
    process.exit(1);
  }
}

if (treeChopping?.range !== 32) {
  console.error(`tree-chopping SetSoundRange should be preserved as 32, found ${JSON.stringify(treeChopping?.range)}.`);
  process.exit(1);
}
if (!soundIds.has("capture (human)")) {
  console.error("Source human capture sound id should be indexed.");
  process.exit(1);
}
if (!soundIds.has("capture (orc)")) {
  console.error("Source orc capture sound id should be indexed.");
  process.exit(1);
}
if (manifest.units.find((unit) => unit.id === "unit-human-oil-tanker")?.sounds?.["work-complete"] !== "basic human voices research complete") {
  console.error("Source unit-human-oil-tanker work-complete sound should be indexed.");
  process.exit(1);
}

if (getCritterTilesetSound("scripts/tilesets/wargus/winter.lua", "selected") !== "seal-selected") {
  console.error("Audio tileset normalization should resolve wargus/winter critter selected sound to seal-selected.");
  process.exit(1);
}
if (getCritterTilesetSound("scripts/tilesets/wargus/swamp.lua", "selected") !== "warthog-selected") {
  console.error("Audio tileset normalization should resolve wargus/swamp critter selected sound to warthog-selected.");
  process.exit(1);
}
if (getCritterTilesetSound("scripts/tilesets/wargus/wasteland.lua", "selected") !== "pig-selected") {
  console.error("Audio tileset normalization should resolve wargus/wasteland critter selected sound to pig-selected.");
  process.exit(1);
}

for (const [name, source, fragments] of [
  ["world event type", worldSource, [
    '{ kind: "sound"; soundId: string; player: number; x?: number; y?: number }'
  ]],
  ["orders sound events", ordersSource, [
    "function emitSoundEvent(world: WorldState, soundId: string, player: number, x?: number, y?: number): void",
    "? { kind: \"sound\", soundId, player, x: x as number, y: y as number }",
    "emitSoundEvent(world, launchSound, attacker.player, launchPoint.x, launchPoint.y)",
    "emitSoundEvent(world, projectile.impactSoundId, projectile.player, projectile.targetX, projectile.targetY)",
    "emitSoundEvent(world, sourceCaptureSoundId(world, attacker.player), attacker.player, target.x, target.y)",
    "function sourceCaptureSoundId(world: WorldState, playerId: number): string",
    "race === \"orc\" ? \"capture (orc)\" : \"capture (human)\"",
    "emitSoundEvent(world, soundId, player, x, y)",
    "emitSourceMissileImpactSound(world, effect.missileId, effect.player, impacts[0]?.x ?? effect.x, impacts[0]?.y ?? effect.y)"
  ]],
  ["event feedback", eventFeedbackSource, [
    "playSound: (soundId: string, pan?: number) => void",
    "soundPanForWorldPosition?: (position: { x: number; y: number }) => number",
    "handlers.soundPanForWorldPosition?.({ x: event.x, y: event.y })",
    "handlers.playSound(findGameSoundId(manifest, event.soundId, player?.race), pan)"
  ]],
  ["main audio bridge", mainSource, [
    "playSound: (soundId, pan = 0)",
    "audioEngine?.playSound(soundId, pan)",
    "audioEngine?.smokeState()",
    "soundPanForWorldPosition: (position)",
    "return sourceStereoPanForUnit(position)"
  ]]
]) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      console.error(`${name} is missing source stereo sound fragment: ${fragment}`);
      process.exit(1);
    }
  }
}

const missing = checks.filter((check) => !soundIds.has(check.soundId));

if (missing.length > 0) {
  for (const check of missing) {
    console.error(`${check.kind} ${check.owner}: missing ${check.soundId}`);
  }
  console.error(`Sound reference errors: ${missing.length}`);
  process.exit(1);
}

console.log(`Sound references verified (${checks.length} references checked).`);

function getCritterTilesetSound(tileset, event) {
  const normalizedTileset = tileset.replace(/^scripts\/tilesets\//, "").replace(/^wargus\//, "").replace(/\.lua$/, "");
  const critter = manifest.units.find((unit) => unit.id === "unit-critter");
  return critter?.soundsByTileset?.[normalizedTileset]?.[event] ?? critter?.sounds?.[event] ?? null;
}
