import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));

const checks = [];

function addCheck(kind, owner, path) {
  if (path) {
    checks.push({ kind, owner, path });
  }
}

for (const unit of manifest.units) {
  if (unit.image) {
    addCheck("unit image", unit.id, `public/wargus/graphics/${unit.image}`);
  }
  for (const [tileset, image] of Object.entries(unit.seasonalImages ?? {})) {
    addCheck("unit seasonal image", `${unit.id}:${tileset}`, `public/wargus/graphics/${image}`);
  }
}

for (const missile of manifest.missiles) {
  if (missile.file) {
    addCheck("missile image", missile.id, `public/wargus/graphics/${missile.file}`);
  }
}

for (const construction of manifest.constructions ?? []) {
  if (construction.image) {
    addCheck("construction image", construction.id, `public/wargus/graphics/${construction.image}`);
  }
  for (const [tileset, image] of Object.entries(construction.seasonalImages ?? {})) {
    addCheck("construction seasonal image", `${construction.id}:${tileset}`, `public/wargus/graphics/${image}`);
  }
}

for (const sound of manifest.sounds) {
  for (const file of sound.files ?? []) {
    addCheck("sound file", sound.id, `public/wargus/sounds/${file}`);
  }
}

for (const file of manifest.assetRoots?.music ?? []) {
  addCheck("music file", file, `public/wargus/${file}`);
}

for (const style of Object.values(manifest.engineSettings?.buttonStyles ?? {})) {
  addCheck("button style default sheet", style.id, style.defaultFile ? `public/wargus/graphics/${style.defaultFile}` : null);
  addCheck("button style clicked sheet", style.id, style.clickedFile ? `public/wargus/graphics/${style.clickedFile}` : null);
}

for (const font of manifest.fonts ?? []) {
  addCheck("font sheet", font.id, `public/wargus/graphics/${font.file}`);
}

for (const tileset of ["summer", "winter", "wasteland", "swamp"]) {
  addCheck("tileset icons", tileset, `public/wargus/graphics/tilesets/${tileset}/icons.png`);
}

const missing = checks.filter((check) => !existsSync(check.path));
const errors = missing.map((check) => `${check.kind} ${check.owner}: missing ${check.path}`);

const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const atlasSource = readFileSync("src/view/unitTextureAtlas.ts", "utf8");
const lazyAtlasSource = readFileSync("src/view/unitAtlasLazyLoad.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const renderSource = readFileSync("src/view/renderWorld.ts", "utf8");
for (const fragment of [
  "export function imageForTileset",
  "function sourceTilesetFamilyName",
  "replace(/^wargus\\//, \"\")",
  "image: imageForTileset(unit, tileset)",
  "textureDescriptorForUnitDefinition(unit, renderUnit, loadedWorld.map.setup?.tileset ?? null)",
  "textureDescriptorForConstruction(construction, loadedWorld.map.setup?.tileset ?? null)",
  "loadUnitTextureAtlasForDefinition(definition ?? unitDefinitionFromWorldUnit(unit), definitions, loadedWorld.map.setup?.tileset ?? null)",
  "unit.image = imageForTileset(definition, world.map.setup?.tileset ?? null)"
]) {
  const source = fragment.includes("textureDescriptor") ? atlasSource
    : fragment.includes("loadUnitTextureAtlasForDefinition") ? lazyAtlasSource
      : fragment.includes("unit.image =") ? ordersSource
        : worldSource;
  if (!source.includes(fragment)) {
    errors.push(`Seasonal image runtime support is missing fragment: ${fragment}`);
  }
}

for (const fragment of [
  "numDirections: Math.max(0, unit.numDirections",
  "getAnimatedFrameNumber(unit, manifest, world, atlas.numDirections)",
  "spriteDirectionForFacing(unit.facing ?? 4, atlas.numDirections)",
  "if (numDirections <= 1)"
]) {
  const source = fragment.startsWith("numDirections:") ? atlasSource : renderSource;
  if (!source.includes(fragment)) {
    errors.push(`Unit NumDirections runtime support is missing fragment: ${fragment}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Wargus asset reference errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Wargus browser assets verified (${checks.length} files checked).`);
