import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const dataRoot = manifest.dataRoot;
const humanUiSource = readFileSync(path.join(dataRoot, "scripts/human/ui_pandora.lua"), "utf8");
const orcUiSource = readFileSync(path.join(dataRoot, "scripts/orc/ui_pandora.lua"), "utf8");
const humanGlueSource = readFileSync(path.join(dataRoot, "scripts/human/ui.lua"), "utf8");
const orcGlueSource = readFileSync(path.join(dataRoot, "scripts/orc/ui.lua"), "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");

const errors = [];
const expected = {
  human: { normal: "white", reverse: "yellow" },
  orc: { normal: "yellow", reverse: "white" }
};

for (const [name, source, fragments] of [
  ["human source UI", humanUiSource, ['UI.NormalFontColor = "white"', 'UI.ReverseFontColor = "yellow"']],
  ["orc source UI", orcUiSource, ['UI.NormalFontColor = "yellow"', 'UI.ReverseFontColor = "white"']],
  ["human glue UI", humanGlueSource, ["SetDefaultTextColors(UI.NormalFontColor, UI.ReverseFontColor)"]],
  ["orc glue UI", orcGlueSource, ["SetDefaultTextColors(UI.NormalFontColor, UI.ReverseFontColor)"]]
]) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      errors.push(`${name} missing fragment: ${fragment}`);
    }
  }
}

if (JSON.stringify(manifest.engineSettings.uiFontColors) !== JSON.stringify(expected)) {
  errors.push(`Manifest uiFontColors is ${JSON.stringify(manifest.engineSettings.uiFontColors)}, expected ${JSON.stringify(expected)}`);
}

for (const [name, source, fragments] of [
  ["indexer", indexSource, [
    "function parseUiFontColors(source)",
    "UI\\.NormalFontColor",
    "UI\\.ReverseFontColor",
    "uiFontColors: parseUiFontColors(uncommented)",
    "uiFontColors: {}",
    "engineSettings.uiFontColors[race] = parsedEngineSettings.uiFontColors"
  ]],
  ["types", typesSource, [
    "uiFontColors: Partial<Record<\"human\" | \"orc\", WargusUiFontColors>>",
    "export interface WargusUiFontColors"
  ]],
  ["world defaults", worldSource, [
    "uiFontColors:",
    "human: { normal: \"white\", reverse: \"yellow\" }",
    "orc: { normal: \"yellow\", reverse: \"white\" }"
  ]],
  ["HUD render", hudSource, [
    "const normalTextColor = sourceUiTextColor(manifest, world, \"normal\", \"#f0df9a\")",
    "const reverseTextColor = sourceUiTextColor(manifest, world, \"reverse\", \"#f0df9a\")",
    "color: colorNumberFromCss(normalTextColor, 0xf0df9a)",
    "color: command.disabled ? 0x8a8370 : colorNumberFromCss(reverseTextColor, 0xf0df9a)",
    "fill: command.disabled ? \"#8a8370\" : reverseTextColor"
  ]],
  ["source UI helpers", sourceUiHelpersSource, [
    "export function sourceUiTextColor(manifest: WargusManifest, world: WorldState, kind: \"normal\" | \"reverse\", fallback: string): string",
    "world.engineSettings.uiFontColors[race]?.[kind]",
    "export function sourceNamedTextColor(manifest: WargusManifest, name: string | null): string | null",
    "manifest.fontColors ?? []"
  ]]
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
  console.error(`Source UI font color verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source UI font colors verified (human/orc normal and reverse colors indexed and used by HUD commands).");
