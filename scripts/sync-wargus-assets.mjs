import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const manifestPath = path.resolve("public/wargus/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const dataRoot = manifest.dataRoot;
const graphicsOutRoot = path.resolve("public/wargus/graphics");
const soundsOutRoot = path.resolve("public/wargus/sounds");
const musicOutRoot = path.resolve("public/wargus/music");

const soundFallbacks = new Map([
  ["neutral/units/skeleton/dead.wav", "human/basic_voices/dead.wav"]
]);
const graphicsFallbacks = new Map([
  ["ui/workers.png", "contrib/workers.png"]
]);

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

const graphics = new Set();
for (const unit of manifest.units) {
  if (unit.image) {
    graphics.add(unit.image);
  }
  for (const image of Object.values(unit.seasonalImages ?? {})) {
    if (image) {
      graphics.add(image);
    }
  }
}
for (const missile of manifest.missiles ?? []) {
  if (missile.file) {
    graphics.add(missile.file);
  }
}
for (const construction of manifest.constructions ?? []) {
  if (construction.image) {
    graphics.add(construction.image);
  }
  for (const image of Object.values(construction.seasonalImages ?? {})) {
    if (image) {
      graphics.add(image);
    }
  }
}
for (const screen of manifest.titleScreens ?? []) {
  if (screen.image && !screen.image.endsWith(".ogv")) {
    graphics.add(screen.image);
  }
}
for (const screen of manifest.resultScreens ?? []) {
  if (screen.image) {
    graphics.add(screen.image);
  }
}
for (const slot of manifest.engineSettings?.resourceUiSlots ?? []) {
  if (slot.graphic) {
    graphics.add(slot.graphic);
  }
}

for (const panel of [
  "tilesets/summer/terrain/summer.png",
  "tilesets/swamp/terrain/swamp.png",
  "tilesets/wasteland/terrain/wasteland.png",
  "tilesets/winter/terrain/winter.png",
  "ui/human/panel_1.png",
  "ui/human/panel_2.png",
  "ui/human/infopanel.png",
  "ui/orc/panel_1.png",
  "ui/orc/panel_2.png",
  "ui/orc/infopanel.png",
  "ui/human/cursors/human_gauntlet.png",
  "ui/human/cursors/green_eagle.png",
  "ui/human/cursors/yellow_eagle.png",
  "ui/human/cursors/red_eagle.png",
  "ui/human/cursors/human_dont_click_here.png",
  "ui/orc/cursors/orcish_claw.png",
  "ui/orc/cursors/green_crosshairs.png",
  "ui/orc/cursors/yellow_crosshairs.png",
  "ui/orc/cursors/red_crosshairs.png",
  "ui/orc/cursors/orcish_dont_click_here.png",
  "ui/cursors/small_green_cross.png",
  "ui/cursors/cross.png",
  "ui/cursors/arrow_N.png",
  "ui/cursors/arrow_NE.png",
  "ui/cursors/arrow_E.png",
  "ui/cursors/arrow_SE.png",
  "ui/cursors/arrow_S.png",
  "ui/cursors/arrow_SW.png",
  "ui/cursors/arrow_W.png",
  "ui/cursors/arrow_NW.png",
  "ui/bloodlust,haste,slow,invisible,shield.png",
  "ui/health2.png",
  "ui/mana2.png"
]) {
  graphics.add(panel);
}

let copied = 0;
let missing = 0;
for (const relative of [...graphics].sort()) {
  const fallback = graphicsFallbacks.get(relative);
  const source = await exists(path.join(dataRoot, "graphics", relative))
    ? path.join(dataRoot, "graphics", relative)
    : fallback && await exists(path.join(dataRoot, fallback))
      ? path.join(dataRoot, fallback)
      : path.join(dataRoot, "graphics", relative);
  const target = path.join(graphicsOutRoot, relative);
  if (!(await exists(source))) {
    missing += 1;
    console.warn(`Missing graphics asset: ${relative}`);
    continue;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  copied += 1;
}

console.log(`Copied ${copied} Wargus graphics assets into public/wargus/graphics`);
if (missing > 0) {
  console.log(`Skipped ${missing} missing graphics assets`);
}

const sounds = new Set();
for (const sound of manifest.sounds ?? []) {
  for (const file of sound.files) {
    if (file.endsWith(".wav") || file.endsWith(".ogg") || file.endsWith(".mid")) {
      sounds.add(file);
    }
  }
}
for (const map of manifest.maps ?? []) {
  for (const file of map.briefingVoiceFiles ?? []) {
    if (file.endsWith(".wav") || file.endsWith(".ogg")) {
      sounds.add(file);
    }
  }
}

let copiedSounds = 0;
let missingSounds = 0;
for (const relative of [...sounds].sort()) {
  const fallback = soundFallbacks.get(relative);
  const source = await exists(path.join(dataRoot, "sounds", relative))
    ? path.join(dataRoot, "sounds", relative)
    : fallback && await exists(path.join(dataRoot, "sounds", fallback))
      ? path.join(dataRoot, "sounds", fallback)
    : path.join(dataRoot, relative);
  const target = path.join(soundsOutRoot, relative);
  if (!(await exists(source))) {
    missingSounds += 1;
    console.warn(`Missing sound asset: ${relative}`);
    continue;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  copiedSounds += 1;
}

console.log(`Copied ${copiedSounds} Wargus sound assets into public/wargus/sounds`);
if (missingSounds > 0) {
  console.log(`Skipped ${missingSounds} missing sound assets`);
}

const music = new Set();
for (const file of manifest.assetRoots?.music ?? []) {
  if (file.startsWith("music/") && file.endsWith(".mid")) {
    music.add(file.slice("music/".length));
  }
}

let copiedMusic = 0;
let missingMusic = 0;
for (const relative of [...music].sort()) {
  const source = path.join(dataRoot, "music", relative);
  const target = path.join(musicOutRoot, relative);
  if (!(await exists(source))) {
    missingMusic += 1;
    console.warn(`Missing music asset: ${relative}`);
    continue;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  copiedMusic += 1;
}

console.log(`Copied ${copiedMusic} Wargus music assets into public/wargus/music`);
if (missingMusic > 0) {
  console.log(`Skipped ${missingMusic} missing music assets`);
}
