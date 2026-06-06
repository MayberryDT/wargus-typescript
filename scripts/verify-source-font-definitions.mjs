import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const source = readFileSync(path.join(manifest.dataRoot, "scripts/fonts.lua"), "utf8");
const configSource = readFileSync(path.join(manifest.dataRoot, "scripts/wc2-config.lua"), "utf8");
const indexerSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typeSource = readFileSync("src/wargus/types.ts", "utf8");
const assetsVerifierSource = readFileSync("scripts/verify-wargus-assets.mjs", "utf8");
const bitmapFontAtlasSource = readFileSync("src/view/wargusBitmapFontAtlas.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const worldViewAssetSource = readFileSync("src/view/worldViewAssets.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const errors = [];

function expect(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

for (const fragment of [
  'CFont:New("large", CGraphic:New("ui/fonts/large.png", 17, 17))',
  'CFont:New("small", CGraphic:New("ui/fonts/small.png", 7, 6))',
  'CFont:New("game", CGraphic:New("ui/fonts/game.png", wargus.game_font_width, 14))',
  'CFont:New("small-title", CGraphic:New("ui/fonts/small_episode_titles.png", 32, 35))',
  'CFont:New("large-title", CGraphic:New("ui/fonts/large_episode_titles.png", 52, 50))'
]) {
  expect(source.includes(fragment), `Source fonts.lua is missing expected fragment: ${fragment}`);
}
expect(configSource.includes("wargus.game_font_width = 13"), "Source wc2-config.lua game font width is no longer the expected generated value.");

const expected = new Map([
  ["game", ["ui/fonts/game.png", 13, 14]],
  ["large", ["ui/fonts/large.png", 17, 17]],
  ["large-title", ["ui/fonts/large_episode_titles.png", 52, 50]],
  ["small", ["ui/fonts/small.png", 7, 6]],
  ["small-title", ["ui/fonts/small_episode_titles.png", 32, 35]]
]);
const expectedFontColors = new Map([
  ["yellow", [[252, 248, 240], [244, 224, 32], [208, 192, 28], [168, 140, 16], [92, 48, 0], [0, 0, 0], [108, 108, 108]]],
  ["white", [[0, 0, 0], [252, 248, 240], [252, 248, 240], [252, 248, 240], [108, 108, 108], [0, 0, 0], [0, 0, 0]]],
  ["full-red", [[0, 0, 0], [255, 0, 0], [255, 0, 0], [255, 0, 0], [255, 0, 0], [0, 0, 0], [0, 0, 0]]]
]);

const fonts = new Map((manifest.fonts ?? []).map((font) => [font.id, font]));
const fontColors = new Map((manifest.fontColors ?? []).map((palette) => [palette.id, palette]));
expect(manifest.counts?.fonts === expected.size, `Manifest font count should be ${expected.size}, got ${manifest.counts?.fonts}.`);
expect(fonts.size === expected.size, `Manifest should contain ${expected.size} font definitions, got ${fonts.size}.`);
expect(manifest.counts?.fontColors === 19, `Manifest font color count should be 19, got ${manifest.counts?.fontColors}.`);
expect(fontColors.size === 19, `Manifest should contain 19 font color palettes, got ${fontColors.size}.`);

for (const [id, [file, glyphWidth, glyphHeight]] of expected) {
  const font = fonts.get(id);
  expect(Boolean(font), `Manifest is missing font definition ${id}.`);
  if (!font) {
    continue;
  }
  expect(font.file === file, `Font ${id} file mismatch: expected ${file}, got ${font.file}.`);
  expect(font.glyphWidth === glyphWidth, `Font ${id} glyphWidth mismatch: expected ${glyphWidth}, got ${font.glyphWidth}.`);
  expect(font.glyphHeight === glyphHeight, `Font ${id} glyphHeight mismatch: expected ${glyphHeight}, got ${font.glyphHeight}.`);
  expect(font.source === "scripts/fonts.lua", `Font ${id} source mismatch: expected scripts/fonts.lua, got ${font.source}.`);
  expect(existsSync(`public/wargus/graphics/${file}`), `Font ${id} sheet was not copied to public/wargus/graphics/${file}.`);
}

for (const [id, colors] of expectedFontColors) {
  expect(source.includes(`DefineFontColor("${id}"`), `Source fonts.lua is missing DefineFontColor("${id}").`);
  const palette = fontColors.get(id);
  expect(Boolean(palette), `Manifest is missing font color palette ${id}.`);
  if (!palette) {
    continue;
  }
  expect(JSON.stringify(palette.colors) === JSON.stringify(colors), `Font color palette ${id} mismatch: expected ${JSON.stringify(colors)}, got ${JSON.stringify(palette.colors)}.`);
  expect(palette.source === "scripts/fonts.lua", `Font color palette ${id} source mismatch: expected scripts/fonts.lua, got ${palette.source}.`);
}

for (const fragment of [
  "function parseFontDefinitions",
  "function parseFontColorDefinitions",
  "parseSourceNumberConstants(scriptSources)",
  "CFont:New",
  "DefineFontColor",
  "copyBrowserAsset(\"graphics\", font.file)",
  "fonts: fontDefinitions.length",
  "fontColors: fontColorPalettes.length",
  "fonts: fontDefinitions",
  "fontColors: fontColorPalettes"
]) {
  expect(indexerSource.includes(fragment), `Indexer is missing font indexing fragment: ${fragment}`);
}

for (const fragment of [
  "export interface WargusFontDefinition",
  "export interface WargusFontColorPalette",
  "fonts?: WargusFontDefinition[]",
  "fontColors?: WargusFontColorPalette[]",
  "fontColors: number",
  "fonts: number"
]) {
  expect(typeSource.includes(fragment), `Types are missing font manifest fragment: ${fragment}`);
}

for (const fragment of [
  "for (const font of manifest.fonts ?? [])",
  "font sheet"
]) {
  expect(assetsVerifierSource.includes(fragment), `Asset verifier is missing font sheet check fragment: ${fragment}`);
}

for (const fragment of [
  "export async function loadWargusBitmapFontAtlas",
  "Assets.load<Texture>(`/wargus/graphics/${font.file}`)",
  "palettes: new Map((manifest.fontColors ?? []).map((palette) => [palette.id, palette]))",
  "export function createWargusBitmapText",
  "paletteId?: string | null",
  "bitmapFontColorFromPalette",
  "FIRST_GLYPH_CODE = 32",
  "new Rectangle(x, y, definition.glyphWidth, definition.glyphHeight)"
]) {
  expect(bitmapFontAtlasSource.includes(fragment), `Bitmap font atlas is missing runtime fragment: ${fragment}`);
}

for (const fragment of [
  "loadWargusBitmapFontAtlas(manifest)",
  "wargusBitmapFontAtlas"
]) {
  const source = fragment === "wargusBitmapFontAtlas" ? mainSource : worldViewAssetSource;
  expect(source.includes(fragment), `Runtime is missing font atlas load fragment: ${fragment}`);
}

for (const fragment of [
  "createWargusBitmapText",
  "function addHudText",
  "function createHudText",
  "messageUi?.font ?? world.engineSettings.statusLine?.font ?? \"game\"",
  "drawHudMessages(hudLayer, app, sideWidth, manifest, world, hudMessages, wargusBitmapFontAtlas)",
  "drawSourceMenuButtons(hudLayer, frame, sourceButtonStyleAtlas, wargusBitmapFontAtlas, manifest, world, visiblePlayer?.race, onMapCommand)",
  "drawCommandPanel(hudLayer, frame, app, sideWidth, left + 18, app.screen.height - 350, sideWidth - 36, manifest, world, selectedUnits, iconAtlas, wargusBitmapFontAtlas, commandPage, onCommand)",
  "fontId: style?.font ?? \"game\"",
  "fontId: \"small\"",
  "paletteId: sourceTextPaletteId"
]) {
  expect(hudSource.includes(fragment), `HUD render is missing source bitmap font fragment: ${fragment}`);
}

for (const fragment of [
  "export function sourceNamedTextColor(manifest: WargusManifest, name: string | null): string | null",
  "export function sourceTextPaletteId",
  "export function sourceTextColorCss",
  "export function sourceTextColorNumber",
  "export function sourceUiTextColor",
  "export function colorNumberFromCss",
  "manifest.fontColors ?? []",
  "sourceNamedTextColor(manifest, sourceStyle?.textNormalColor ?? null)"
]) {
  expect(sourceUiHelpersSource.includes(fragment), `Source UI helpers are missing source bitmap font fragment: ${fragment}`);
}

expect(Boolean(packageJson.scripts?.["verify:source-font-definitions"]), "package.json does not expose verify:source-font-definitions.");
expect(packageJson.scripts?.verify?.includes("verify:source-font-definitions"), "Full verify script does not include verify:source-font-definitions.");

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source font definition verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log(`Source font definitions verified (${fonts.size} fonts, ${fontColors.size} color palettes).`);
