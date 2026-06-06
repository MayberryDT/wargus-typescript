import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const passabilitySource = readFileSync("src/simulation/passability.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const renderWorldSource = readFileSync("src/view/renderWorld.ts", "utf8");
const tileTextureAtlasSource = readFileSync("src/view/tileTextureAtlas.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const summerSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/wargus/scripts/tilesets/wargus/summer.lua", "utf8");
const swampSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/wargus/scripts/tilesets/wargus/swamp.lua", "utf8");
const winterSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/wargus/scripts/tilesets/wargus/winter.lua", "utf8");
const wastelandSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/wargus/scripts/tilesets/wargus/wasteland.lua", "utf8");

const errors = [];
const tilesets = manifest.tilesets ?? [];

function expect(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function flagsFor(scriptSuffix, slot) {
  return tilesets.find((tileset) => tileset.script.endsWith(scriptSuffix))?.slots.find((entry) => entry.slot === slot)?.flags ?? [];
}

function tilesetFor(scriptSuffix) {
  return tilesets.find((tileset) => tileset.script.endsWith(scriptSuffix));
}

function hasColorCycleRange(scriptSuffix, start, end, label) {
  return tilesetFor(scriptSuffix)?.colorCycleRanges?.some((range) => range.start === start && range.end === end && range.label === label) ?? false;
}

expect(/"solid",\s*\{\s*"light-water",\s*"water"/.test(summerSource), "Source summer light-water slot was not found.");
expect(/"mixed",\s*\{\s*"light-water",\s*"light-coast",\s*"coast"/.test(summerSource), "Source summer coast slot was not found.");
expect(/"solid",\s*\{\s*"forest",\s*"land",\s*"forest",\s*"unpassable"/.test(summerSource), "Source summer forest slot was not found.");
expect(/"solid",\s*\{\s*"rocks",\s*"land",\s*"rock",\s*"unpassable"/.test(summerSource), "Source summer rock slot was not found.");
expect(/"solid",\s*\{\s*"human-closed-wall",\s*"land",\s*"human",\s*"wall",\s*"unpassable"/.test(summerSource), "Source summer wall slot was not found.");
expect(summerSource.includes("SetColorCycleAll(true)"), "Source summer color-cycle setting was not found.");
expect(summerSource.includes("AddColorCyclingRange(38, 47) -- water"), "Source summer water color-cycle range was not found.");
expect(summerSource.includes("AddColorCyclingRange(48, 56) -- water coast boundary"), "Source summer coast color-cycle range was not found.");
expect(swampSource.includes("AddColorCyclingRange(88, 95) -- building"), "Source swamp building color-cycle range was not found.");
expect(winterSource.includes("AddColorCyclingRange(205, 207) -- building"), "Source winter building color-cycle range was not found.");
expect(wastelandSource.includes("AddColorCyclingRange(64, 70) -- water coast boundary"), "Source wasteland coast color-cycle range was not found.");

expect(manifest.counts?.tilesets === tilesets.length, "Manifest counts.tilesets does not match tilesets length.");
expect(tilesets.length === 4, `Expected 4 Wargus tilesets, found ${tilesets.length}.`);
expect(tilesets.every((tileset) => tileset.colorCycleAll === true), "All Wargus tilesets should preserve SetColorCycleAll(true).");
expect(hasColorCycleRange("summer.lua", 38, 47, "water"), "Summer should preserve the source water color-cycle range.");
expect(hasColorCycleRange("summer.lua", 48, 56, "water coast boundary"), "Summer should preserve the source coast color-cycle range.");
expect(hasColorCycleRange("summer.lua", 240, 244, "icon"), "Summer should preserve the source icon color-cycle range.");
expect(hasColorCycleRange("swamp.lua", 5, 9, "water"), "Swamp should preserve the source water color-cycle range.");
expect(hasColorCycleRange("swamp.lua", 88, 95, "building"), "Swamp should preserve the source building color-cycle range.");
expect(hasColorCycleRange("winter.lua", 40, 47, "water"), "Winter should preserve the source water color-cycle range.");
expect(hasColorCycleRange("winter.lua", 205, 207, "building"), "Winter should preserve the source building color-cycle range.");
expect(hasColorCycleRange("wasteland.lua", 64, 70, "water coast boundary"), "Wasteland should preserve the source coast color-cycle range.");
expect(flagsFor("summer.lua", 0x010).includes("water"), "Summer 0x010 should be water.");
expect(flagsFor("summer.lua", 0x030).includes("no-building"), "Summer 0x030 should be no-building coast.");
expect(flagsFor("summer.lua", 0x200).includes("coast"), "Summer 0x200 should be source coast.");
expect(flagsFor("summer.lua", 0x070).includes("forest") && flagsFor("summer.lua", 0x070).includes("unpassable"), "Summer 0x070 should be unpassable forest.");
expect(flagsFor("summer.lua", 0x080).includes("rock") && flagsFor("summer.lua", 0x080).includes("unpassable"), "Summer 0x080 should be unpassable rock.");
expect(flagsFor("summer.lua", 0x090).includes("wall") && flagsFor("summer.lua", 0x090).includes("unpassable"), "Summer 0x090 should be unpassable wall.");

for (const [source, fragment] of [
  [indexSource, "function parseTilesetTerrain"],
  [indexSource, "colorCycleAll"],
  [indexSource, "colorCycleRanges"],
  [indexSource, "AddColorCyclingRange"],
  [indexSource, "tilesets: tilesets.length"],
  [indexSource, "tilesets,"],
  [typesSource, "tilesets?: WargusTilesetTerrain[]"],
  [typesSource, "export interface WargusTilesetTerrain"],
  [typesSource, "colorCycleAll: boolean"],
  [typesSource, "colorCycleRanges: WargusTilesetColorCycleRange[]"],
  [typesSource, "export interface WargusTilesetColorCycleRange"],
  [worldSource, "tilesetTerrain: WargusTilesetTerrain | null"],
  [worldSource, "function sourceTilesetForSetup"],
  [passabilitySource, "sourceTileFlags(world, tile)"],
  [passabilitySource, "sourceFlags.has(\"coast\")"],
  [passabilitySource, "isSourceHarvestableWoodTile"],
  [passabilitySource, "isSourceBuildableTerrainTile"],
  [passabilitySource, "isSourceWaterTile"],
  [ordersSource, "isSourceHarvestableWoodTile(world"],
  [ordersSource, "isSourceBuildableTerrainTile(world"],
  [ordersSource, "export function isSmartOrderObjectClick"],
  [hudSource, "function minimapTerrainColorForTile"],
  [hudSource, "sourceTilesetFlagsForTile(world, tile)"],
  [hudSource, "flags.includes(\"wall\")"],
  [hudSource, "sourceTilesetMinimapTint(tilesetName, \"wall\")"],
  [hudSource, "\"rock\" | \"wall\" | \"water\""],
  [hudSource, "world.tilesetTerrain?.slots.find((entry) => entry.slot === slot)?.flags ?? []"],
  [hudSource, "return tile & 0xfff0"],
  [renderWorldSource, "function colorForTile(world: WorldState, tile: number)"],
  [renderWorldSource, "sourceTilesetFlagsForTile(world, tile)"],
  [renderWorldSource, "flags.includes(\"wall\")"],
  [renderWorldSource, "sourceTilesetFallbackTint(tilesetName, \"wall\")"],
  [renderWorldSource, "\"rock\" | \"wall\" | \"water\""],
  [renderWorldSource, "world.tilesetTerrain?.slots.find((entry) => entry.slot === slot)?.flags ?? []"],
  [renderWorldSource, "world.tilesetTerrain?.name ?? \"none\""],
  [renderWorldSource, "function sourceColorCyclePhase"],
  [renderWorldSource, "let drewFallbackGraphics = false"],
  [renderWorldSource, "drawSourceColorCycleOverlay(overlayGraphics, world)"],
  [renderWorldSource, "if (drewFallbackGraphics)"],
  [renderWorldSource, "function drawSourceColorCycleOverlay(graphics: Graphics, world: WorldState): boolean"],
  [renderWorldSource, "let drewOverlay = false"],
  [renderWorldSource, "drewOverlay = true"],
  [renderWorldSource, "function drawSourcePassabilityOverlay(graphics: Graphics, world: WorldState): boolean"],
  [renderWorldSource, "function drawSourceMapGrid(graphics: Graphics, world: WorldState): boolean"],
  [renderWorldSource, "function sourceColorCycleRangeForFlags"],
  [renderWorldSource, "flags.includes(\"coast\") && !flags.includes(\"water\") ? ranges[1] ?? ranges[0] : ranges[0]"],
  [renderWorldSource, "world.tilesetTerrain?.colorCycleRanges"],
  [renderWorldSource, "sourceColorCyclePhase(world)"],
  [tileTextureAtlasSource, "const sourceIndex = sourceFrameForTileId(atlas.family, tileId, maxIndex)"],
  [tileTextureAtlasSource, "0x050: [356, 357, 356, 0, 358, 359, 360, 361, 362, 363, 358, 359, 358, 359, 358, 359]"],
  [tileTextureAtlasSource, "0x070: [125, 127, 128]"],
  [tileTextureAtlasSource, "0x700: [129, 110]"],
  [saveSource, "isSourceHarvestableWoodTile(world"]
]) {
  expect(source.includes(fragment), `Missing expected implementation fragment: ${fragment}`);
}

expect(!hudSource.includes("tile === 0 ? 0x2a6377"), "Minimap terrain rendering still uses the old hardcoded tile-id color chain.");
expect(!renderWorldSource.includes("if (tile <= 12)"), "World fallback terrain rendering still uses the old hardcoded tile-id range chain.");
expect(!renderWorldSource.includes("range.label.toLowerCase().includes(\"water\")"), "World color-cycle overlay should choose source ranges from terrain flags instead of label text.");
expect(!tileTextureAtlasSource.includes("const directIndex = Math.floor(Math.max(tileId, 0))"), "Tile atlas rendering still treats source tile IDs as direct atlas frame indices.");

if (errors.length > 0) {
  console.error(`Source tileset terrain verification errors: ${errors.length}`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Source tileset terrain verified (${tilesets.length} tilesets, ${tilesets.reduce((sum, tileset) => sum + tileset.slots.length, 0)} slot flags).`);
