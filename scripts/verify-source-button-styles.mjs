import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const dataRoot = manifest.dataRoot;
const widgetsSource = readFileSync(path.join(dataRoot, "scripts/widgets.lua"), "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const worldViewAssetSource = readFileSync("src/view/worldViewAssets.ts", "utf8");

const errors = [];
const styles = manifest.engineSettings?.buttonStyles ?? {};
const expectedIds = ["main", "main-orc", "network", "network-orc", "gm-half", "gm-full", "folder", "icon"];

for (const id of expectedIds) {
  if (!widgetsSource.includes(`DefineButtonStyle("${id}"`)) {
    errors.push(`widgets.lua missing DefineButtonStyle("${id}")`);
  }
  if (!styles[id]) {
    errors.push(`Manifest missing buttonStyles.${id}`);
  }
}

for (const file of ["ui/buttons_1.png", "ui/buttons_2.png"]) {
  if (!existsSync(`public/wargus/graphics/${file}`)) {
    errors.push(`Synced browser button style sheet is missing: public/wargus/graphics/${file}`);
  }
}

const expectedMain = {
  race: "human",
  size: [128, 20],
  font: "game",
  textNormalColor: "yellow",
  textReverseColor: "white",
  textAlign: "Center",
  textPos: [64, 4],
  defaultFile: "ui/buttons_1.png",
  defaultSize: [300, 144],
  defaultFrame: 4,
  clickedFile: "ui/buttons_1.png",
  clickedSize: [300, 144],
  clickedFrame: 5
};
const expectedNetworkOrc = {
  race: "orc",
  size: [80, 20],
  font: "game",
  textNormalColor: "yellow",
  textReverseColor: "white",
  textAlign: "Center",
  textPos: [40, 4],
  defaultFile: "ui/buttons_2.png",
  defaultSize: [300, 144],
  defaultFrame: 7,
  clickedFile: "ui/buttons_2.png",
  clickedSize: [300, 144],
  clickedFrame: 8
};

for (const [id, expected] of [["main", expectedMain], ["network-orc", expectedNetworkOrc]]) {
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(styles[id]?.[key]) !== JSON.stringify(value)) {
      errors.push(`buttonStyles.${id}.${key}: expected ${JSON.stringify(value)}, found ${JSON.stringify(styles[id]?.[key])}`);
    }
  }
}

for (const [name, source, fragments] of [
  ["indexer", indexSource, [
    "function parseButtonStyles(source)",
    "function sourceButtonStyleRace(file)",
    "race: sourceButtonStyleRace(defaultFile ?? clickedFile)",
    "DefineButtonStyle(",
    "buttonStyles: parseButtonStyles(uncommented)",
    "copyBrowserAsset(\"graphics\", file)",
    "buttonStyles: {}",
    "engineSettings.buttonStyles = { ...engineSettings.buttonStyles, ...parsedEngineSettings.buttonStyles }"
  ]],
  ["types", typesSource, [
    "buttonStyles: Record<string, WargusButtonStyle>",
    "export interface WargusButtonStyle",
    'race: "human" | "orc" | null',
    "textNormalColor: string | null",
    "defaultSize: [number, number] | null",
    "defaultFrame: number | null"
  ]],
  ["world defaults", worldSource, [
    "buttonStyles: {}"
  ]],
  ["HUD render", hudSource, [
    "world.engineSettings.buttonStyles[button.style]",
    "getSourceButtonStyleTexture(sourceButtonStyleAtlas, style, \"default\")",
    "sourceMenuButtonWidth(button, style, slot)",
    "sourceMenuButtonHeight(button, style, slot)",
    "sourceMenuButtonPalette(manifest, button.style, style)",
    "sourceMenuTextX(width, style)"
  ]],
  ["source UI helpers", sourceUiHelpersSource, [
    "export function sourceMenuButtonGroup",
    "export function sourceMenuButtonWidth",
    "export function sourceMenuButtonHeight",
    "export type SourceMenuButtonSlot",
    "function sourceMenuButtonFallbackWidth(slot: SourceMenuButtonSlot)",
    "function sourceMenuButtonFallbackHeight(slot: SourceMenuButtonSlot)",
    "export function sourceMenuButtonFontSize",
    "export function sourceMenuTextAnchor",
    "export function sourceMenuTextX",
    "export function sourceMenuTextY",
    "export function sourceMenuButtonPalette",
    'sourceStyle?.race === "orc"',
    "sourceNamedTextColor(manifest, sourceStyle?.textNormalColor ?? null)"
  ]],
  ["button style atlas", readFileSync("src/view/sourceButtonStyleAtlas.ts", "utf8"), [
    "export interface SourceButtonStyleAtlas",
    "loadSourceButtonStyleAtlas",
    "getSourceButtonStyleTexture",
    "new Rectangle(0, y",
    "`/wargus/graphics/${file}`"
  ]],
  ["asset preload", worldViewAssetSource, [
    "loadSourceButtonStyleAtlas",
    "loadSourceButtonStyleAtlas(world.engineSettings.buttonStyles)"
  ]],
  ["main", mainSource, [
    "let sourceButtonStyleAtlas: SourceButtonStyleAtlas | null = null",
    "sourceButtonStyleAtlas,"
  ]]
]) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      errors.push(`${name} missing fragment: ${fragment}`);
    }
  }
}

if (sourceUiHelpersSource.includes('style.includes("orc")')) {
  errors.push("Source menu button palette should use indexed button style race metadata instead of scanning style id text.");
}

if (sourceUiHelpersSource.includes('button.style.includes("network")')) {
  errors.push("Source menu button sizing should use source menu button slot context instead of scanning style id text.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log("Source button styles verified (DefineButtonStyle records indexed and menu buttons use source style metrics).");
