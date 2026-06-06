import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const dataRoot = manifest.dataRoot;
const humanUiSource = readFileSync(path.join(dataRoot, "scripts/human/ui_pandora.lua"), "utf8");
const orcUiSource = readFileSync(path.join(dataRoot, "scripts/orc/ui_pandora.lua"), "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");

const errors = [];
const sourceFragment = "UI.ButtonPanel.AutoCastBorderColorRGB = CColor(0, 0, 252)";
const expectedColor = [0, 0, 252];

for (const [name, source] of [["human UI", humanUiSource], ["orc UI", orcUiSource]]) {
  if (!source.includes(sourceFragment)) {
    errors.push(`${name} missing source autocast border color fragment: ${sourceFragment}`);
  }
}

if (JSON.stringify(manifest.engineSettings.autoCastBorderColorRgb) !== JSON.stringify(expectedColor)) {
  errors.push(`Manifest autoCastBorderColorRgb is ${JSON.stringify(manifest.engineSettings.autoCastBorderColorRgb)}, expected ${JSON.stringify(expectedColor)}`);
}

const autocastSpell = manifest.spells.find((spell) => spell.autocast?.length > 0 && manifest.buttons.some((button) => button.action === "cast-spell" && button.value === spell.id));
if (!autocastSpell) {
  errors.push("Manifest has no cast-spell command backed by source autocast metadata.");
}

for (const [name, source, fragments] of [
  ["indexer", indexSource, [
    "autoCastBorderColorRgb: parseUiColor(uncommented, \"ButtonPanel.AutoCastBorderColorRGB\")",
    "autoCastBorderColorRgb: null",
    "engineSettings.autoCastBorderColorRgb ??= parsedEngineSettings.autoCastBorderColorRgb"
  ]],
  ["types", typesSource, [
    "autoCastBorderColorRgb: [number, number, number] | null"
  ]],
  ["world defaults", worldSource, [
    "autoCastBorderColorRgb: [0, 0, 252]"
  ]],
  ["HUD render", hudSource, [
    "const sourceSelectedBorder = sourceSelectedCommandBorderColor(command, selectedUnits)",
    "const sourceAutoCastBorder = sourceAutoCastBorderColor(command, world, selectedUnits)",
    "graphics.stroke({ width: sourceSelectedBorder || sourceAutoCastBorder ? 2 : 1, color: sourceCommandBorderColor(command, world, selectedUnits)"
  ]],
  ["source UI helpers", sourceUiHelpersSource, [
    "canToggleAutoCastSpell",
    "isAutoCastSpellEnabled",
    "export function sourceCommandBorderColor(command: SourcePopupCommand, world: WorldState, selectedUnits: WorldUnit[]): number",
    "export function sourceSelectedCommandBorderColor(command: SourcePopupCommand, selectedUnits: WorldUnit[]): number | null",
    "return sourceSelectedCommandBorderColor(command, selectedUnits) ?? sourceAutoCastBorderColor(command, world, selectedUnits)",
    "return 0x00fc00",
    "function sourceCommandSelectedForUnit(command: SourcePopupCommand, unit: WorldUnit): boolean",
    "unit.order?.kind === \"repair\"",
    "export function sourceAutoCastBorderColor(command: SourcePopupCommand, world: WorldState, selectedUnits: WorldUnit[]): number | null",
    "world.engineSettings.autoCastBorderColorRgb",
    "spell.autocast.length === 0",
    "canToggleAutoCastSpell(world, unit, spellId) && isAutoCastSpellEnabled(unit, spellId)"
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
  console.error(`Source autocast border verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log(`Source autocast border verified (${autocastSpell.id} and ${JSON.stringify(expectedColor)} border color).`);
