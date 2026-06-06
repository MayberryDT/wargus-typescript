import { statSync, readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const dataRoot = manifest.dataRoot;
const sourceUi = readFileSync(path.join(dataRoot, "scripts/ui.lua"), "utf8");
const renderWorldSource = readFileSync("src/view/renderWorld.ts", "utf8");
const renderHudSource = readFileSync("src/view/renderHud.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const worldViewAssetSource = readFileSync("src/view/worldViewAssets.ts", "utf8");
const syncSource = readFileSync("scripts/sync-wargus-assets.mjs", "utf8");
const atlasSource = readFileSync("src/view/statusDecorationAtlas.ts", "utf8");

const errors = [];
const decorationAsset = "ui/bloodlust,haste,slow,invisible,shield.png";
const healthAsset = "ui/health2.png";
const manaAsset = "ui/mana2.png";
const decorations = new Map((manifest.decorations ?? []).map((decoration) => [decoration.index, decoration]));

for (const fragment of [
  `DefineSprites({Name = "sprite-health", File = "${healthAsset}"`,
  `DefineSprites({Name = "sprite-mana", File = "${manaAsset}"`,
  `DefineSprites({Name = "sprite-spell", File = "${decorationAsset}"`,
  "DefineDecorations({Index = \"HitPoints\"",
  "DefineDecorations({Index = \"Mana\"",
  "DefineDecorations({Index = \"Transport\"",
  "DefineDecorations({Index = \"Research\"",
  "DefineDecorations({Index = \"Training\"",
  "DefineDecorations({Index = \"UpgradeTo\"",
  "DefineDecorations({Index = \"CarryResource\"",
  "DefineDecorations({Index = \"Bloodlust\"",
  "DefineDecorations({Index = \"Haste\"",
  "DefineDecorations({Index = \"Slow\"",
  "DefineDecorations({Index = \"Invisible\"",
  "DefineDecorations({Index = \"UnholyArmor\""
]) {
  if (!sourceUi.includes(fragment)) {
    errors.push(`Missing source UI decoration fragment: ${fragment}`);
  }
}

for (const asset of [decorationAsset, healthAsset, manaAsset]) {
  try {
    statSync(path.join("public/wargus/graphics", asset));
  } catch {
    errors.push(`Missing browser UI decoration asset public/wargus/graphics/${asset}`);
  }
}

for (const [index, expected] of [
  ["HitPoints", { method: "sprite", sprite: "sprite-health", offsetPercent: [50, 100], hideNeutral: true, showOpponent: true, showWhenNull: false }],
  ["Mana", { method: "sprite", sprite: "sprite-mana", offsetPercent: [50, 100], hideNeutral: true, showOpponent: false, showWhenNull: false }],
  ["Transport", { method: "sprite", sprite: "sprite-mana", offsetPercent: [50, 100], hideNeutral: true, showOpponent: false, showWhenNull: false }],
  ["Research", { method: "sprite", sprite: "sprite-mana", offsetPercent: [50, 100], hideNeutral: true, showOpponent: false, showWhenNull: false }],
  ["Training", { method: "sprite", sprite: "sprite-mana", offsetPercent: [50, 100], hideNeutral: true, showOpponent: false, showWhenNull: false }],
  ["UpgradeTo", { method: "sprite", sprite: "sprite-mana", offsetPercent: [50, 100], hideNeutral: true, showOpponent: false, showWhenNull: false }],
  ["GiveResource", { method: "sprite", sprite: "sprite-mana", offsetPercent: [50, 100], hideNeutral: false, showWhenNull: false, showWhenMax: true }],
  ["CarryResource", { method: "sprite", sprite: "sprite-mana", offsetPercent: [50, 100], hideNeutral: false, showWhenNull: false }],
  ["Bloodlust", { method: "static-sprite", sprite: "sprite-spell", offset: [0, 0], frame: 0, showOpponent: true }],
  ["Haste", { method: "static-sprite", sprite: "sprite-spell", offset: [16, 0], frame: 1, showOpponent: true }],
  ["Slow", { method: "static-sprite", sprite: "sprite-spell", offset: [16, 0], frame: 2, showOpponent: true }],
  ["Invisible", { method: "static-sprite", sprite: "sprite-spell", offset: [32, 0], frame: 3, showOpponent: true }],
  ["UnholyArmor", { method: "static-sprite", sprite: "sprite-spell", offset: [48, 0], frame: 4, showOpponent: true }]
]) {
  const decoration = decorations.get(index);
  if (!decoration) {
    errors.push(`Manifest missing source decoration ${index}`);
    continue;
  }
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(decoration[key]) !== JSON.stringify(value)) {
      errors.push(`Decoration ${index}.${key} is ${JSON.stringify(decoration[key])}, expected ${JSON.stringify(value)}`);
    }
  }
}

for (const [name, source, fragments] of [
  ["status atlas", atlasSource, [decorationAsset, healthAsset, manaAsset, "frameWidth: 16", "getStatusDecorationTexture", "getStatusBarTexture", "frameWidth = 31", "frameHeight = 4"]],
  ["asset sync", syncSource, [decorationAsset, healthAsset, manaAsset]],
  ["asset preload", worldViewAssetSource, ["loadStatusDecorationAtlas", "statusDecorationAtlas", "loadCompleteWorldViewAssets"]],
  ["main atlas wiring", mainSource, ["statusDecorationAtlas, tileAtlas", "statusDecorationAtlas,"]],
  ["indexer", readFileSync("scripts/index-wargus-data.mjs", "utf8"), ["function parseDecorations(source, sourcePath)", "showWhenNull: readLuaBoolField(body, \"ShowWhenNull\", false)", "const decorations = parseDecorations", "decorations: decorations.length", "decorations,"]],
  ["types", readFileSync("src/wargus/types.ts", "utf8"), ["decorations: number", "decorations?: WargusDecoration[]", "export interface WargusDecoration", "showWhenNull: boolean"]],
  ["world render", renderWorldSource, ["drawSourceVariableDecorations", "sourceVariableDecorationBars", "pushBar(\"training\", \"Training\"", "pushBar(\"research\", \"Research\"", "pushBar(\"construction\", \"UpgradeTo\"", "pushBar(\"transport\", \"Transport\"", "pushBar(\"carry-resource\", \"CarryResource\"", "decoration.method !== \"sprite\"", "sourceDecorationValueVisible", "value === 0 && !decoration.showWhenNull", "value === max && !decoration.showWhenMax", "decoration.method === \"static-sprite\"", "getStatusBarTexture(atlas, \"health\"", "getStatusBarTexture(atlas, \"mana\"", "statusDecorationAtlas?.health", "statusDecorationAtlas?.mana", "drawSourceStatusDecorations(layer, unit, isOwned", "sourceStatusDecorations(unit, isOwned", "sourceDecorationPosition", "sourceDecorationVisible", "getStatusDecorationTexture(atlas, decoration.frame", "function hasActiveStatusEffect", "effect.kind === kind && effect.remainingSeconds > 0", "hasActiveStatusEffect(unit, \"bloodlust\")", "hasActiveStatusEffect(unit, \"invisibility\")"]],
  ["hud render", renderHudSource, ["statusDecorationAtlas: StatusDecorationAtlas | null", "drawSourceHudBar", "getStatusBarTexture(atlas, kind, ratio)", "row.label === \"HP\" ? \"health\" : row.label === \"MP\" ? \"mana\" : null", "statusDecorationAtlas, wargusBitmapFontAtlas, onSelectedUnitPick", "drawProductionQueuePanel(hudLayer, frame", "drawCargoPanel(hudLayer, frame"]]
]) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      errors.push(`${name} missing fragment: ${fragment}`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source UI decoration verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source UI decorations verified (health, mana, and status sprite strips synced, loaded, and rendered).");
