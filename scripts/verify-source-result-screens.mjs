import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const resultsSource = readFileSync(path.join(manifest.dataRoot, "scripts/menus/results.lua"), "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const syncSource = readFileSync("scripts/sync-wargus-assets.mjs", "utf8");
const typeSource = readFileSync("src/wargus/types.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const audioCueSource = readFileSync("src/audio/audioCues.ts", "utf8");
const audioEngineSource = readFileSync("src/audio/audioEngine.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const errors = [];

function expect(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

for (const fragment of [
  'local hvictory = "ui/human/victory.png"',
  'local hdefeat =  "ui/human/defeat.png"',
  'local ovictory = "ui/orc/victory.png"',
  'local odefeat =  "ui/orc/defeat.png"',
  "background = hvictory",
  "background = hdefeat",
  "background = ovictory",
  "background = odefeat",
  'PlaySound("statsthump", true)',
  'PlaySound("highclick", true)'
]) {
  expect(resultsSource.includes(fragment), `Source results menu missing background fragment: ${fragment}`);
}

expect(manifest.counts?.resultScreens === manifest.resultScreens?.length, "Manifest counts.resultScreens does not match resultScreens length.");
expect(manifest.resultScreens?.length === 6, `Expected 6 source result screen entries, found ${manifest.resultScreens?.length ?? 0}.`);

for (const [status, race, image] of [
  ["victory", "human", "ui/human/victory.png"],
  ["defeat", "human", "ui/human/defeat.png"],
  ["draw", "human", "ui/human/defeat.png"],
  ["victory", "orc", "ui/orc/victory.png"],
  ["defeat", "orc", "ui/orc/defeat.png"],
  ["draw", "orc", "ui/orc/defeat.png"]
]) {
  expect(
    manifest.resultScreens?.some((screen) => screen.status === status && screen.race === race && screen.image === image),
    `Missing source result screen ${race} ${status}: ${image}.`
  );
  expect(existsSync(path.join("public/wargus/graphics", image)), `Missing synced result screen asset: public/wargus/graphics/${image}`);
}
for (const [soundId, file] of [
  ["statsthump", "ui/statsthump.wav"],
  ["highclick", "ui/highclick.wav"]
]) {
  const sound = manifest.sounds?.find((candidate) => candidate.id === soundId);
  expect(sound?.files?.includes(file), `Missing source result sound ${soundId}: ${file}.`);
  expect(existsSync(path.join("public/wargus/sounds", file)), `Missing synced result sound asset: public/wargus/sounds/${file}`);
}

for (const fragment of [
  "resultScreens?: WargusResultScreen[]",
  "export interface WargusResultScreen",
  "resultScreens: number"
]) {
  expect(typeSource.includes(fragment), `Result screen type missing fragment: ${fragment}`);
}

for (const fragment of [
  "parseResultScreens",
  "scripts/menus/results.lua",
  "resultScreens: resultScreens.length",
  "resultScreens,"
]) {
  expect(indexSource.includes(fragment), `Indexer result screen handling missing fragment: ${fragment}`);
}

for (const fragment of [
  "manifest.resultScreens",
  "graphics.add(screen.image)"
]) {
  expect(syncSource.includes(fragment), `Asset sync result screen handling missing fragment: ${fragment}`);
}

for (const fragment of [
  "sourceResultScreen(manifest, world.matchState.status, localRace)",
  "world.matchState.status === \"draw\" ? \"Draw\"",
  "Sprite.from(`/wargus/graphics/${sourceScreen.image}`)",
  "overlay.fill({ color: 0x050708, alpha: sourceScreen ? 0.34 : 0.55 })",
  "drawMatchOverlay(app, hudLayer, manifest, world, nextCampaignMap, wargusBitmapFontAtlas",
  "bitmapFonts: WargusBitmapFontAtlas | null",
  "fontId: \"large\"",
  "fontId: \"game\"",
  "drawBriefingButton(layer, button.x, buttonY, 156, 34, button.label, manifest, localRace, bitmapFonts, button.onTap)"
]) {
  expect(hudSource.includes(fragment), `Browser result screen rendering missing fragment: ${fragment}`);
}

for (const fragment of [
  "export function sourceResultScreen",
  "manifest.resultScreens",
  "screen.status === status && screen.race === race"
]) {
  expect(sourceUiHelpersSource.includes(fragment), `Source result screen helper missing fragment: ${fragment}`);
}

for (const fragment of [
  'status: "victory" | "defeat" | "draw"',
]) {
  expect(worldSource.includes(fragment), `World match state missing draw fragment: ${fragment}`);
}

for (const fragment of [
  'record.status !== "victory" && record.status !== "defeat" && record.status !== "draw"'
]) {
  expect(saveSource.includes(fragment), `Save/load match state missing draw fragment: ${fragment}`);
}

for (const fragment of [
  'void audioEngine.playSound("statsthump")',
  "void audioEngine.playMatchMusic(status, player?.race)"
]) {
  expect(audioCueSource.includes(fragment), `Browser result sound handling missing fragment: ${fragment}`);
}

for (const fragment of [
  'status: "victory" | "defeat" | "draw"',
  'if (status === "draw")',
  "return null;"
]) {
  expect(audioEngineSource.includes(fragment), `Browser result music draw handling missing fragment: ${fragment}`);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source result screen verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source result screens verified (race-specific victory/defeat/draw art indexed, synced, and rendered).");
