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
const sourceUiSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const buttonsSource = readFileSync("src/wargus/buttons.ts", "utf8");

const errors = [];
const expectedSlots = [
  { slot: 0, x: 9, y: 4 },
  { slot: 1, x: 65, y: 4 },
  { slot: 2, x: 121, y: 4 },
  { slot: 3, x: 9, y: 51 },
  { slot: 4, x: 65, y: 51 },
  { slot: 5, x: 121, y: 51 },
  { slot: 6, x: 9, y: 98 },
  { slot: 7, x: 65, y: 98 },
  { slot: 8, x: 121, y: 98 }
];
const expectedPanel = { x: 0, y: 336, slots: expectedSlots };
const deathAndDecayButton = manifest.buttons.find((button) => button.action === "cast-spell" && button.value === "spell-death-and-decay");
if (deathAndDecayButton?.hint !== "~!DEATH AND DECAY") {
  errors.push(`Expected Death and Decay source button hint, found ${JSON.stringify(deathAndDecayButton?.hint)}.`);
}
const flyingMachineButton = manifest.buttons.find((button) => button.action === "train-unit" && button.value === "unit-balloon");
if (flyingMachineButton?.hint !== "BUILD GNOMISH ~!FLYING MACHINE") {
  errors.push(`Expected Flying Machine source train hint, found ${JSON.stringify(flyingMachineButton?.hint)}.`);
}
const templeButton = manifest.buttons.find((button) => button.action === "build" && button.value === "unit-temple-of-the-damned");
if (templeButton?.hint !== "BUILD ~!TEMPLE OF THE DAMNED") {
  errors.push(`Expected Temple of the Damned source build hint, found ${JSON.stringify(templeButton?.hint)}.`);
}
const guardTowerButton = manifest.buttons.find((button) => button.action === "upgrade-to" && button.value === "unit-human-guard-tower");
if (guardTowerButton?.hint !== "UPGRADE TO ~!GUARD TOWER") {
  errors.push(`Expected Guard Tower source upgrade hint, found ${JSON.stringify(guardTowerButton?.hint)}.`);
}

for (const [name, source] of [["human UI", humanUiSource], ["orc UI", orcUiSource]]) {
  for (const fragment of [
    "UI.ButtonPanel.Buttons:clear()",
    "function AddButtonPanelButton(x, y)",
    "UI.ButtonPanel.X = 0",
    "UI.ButtonPanel.Y = 336",
    "AddButtonPanelButton(9, 340)",
    "AddButtonPanelButton(65, 340)",
    "AddButtonPanelButton(121, 434)"
  ]) {
    if (!source.includes(fragment)) {
      errors.push(`${name} missing button-panel fragment: ${fragment}`);
    }
  }
}

if (JSON.stringify(manifest.engineSettings.buttonPanel) !== JSON.stringify(expectedPanel)) {
  errors.push(`Manifest buttonPanel is ${JSON.stringify(manifest.engineSettings.buttonPanel)}, expected ${JSON.stringify(expectedPanel)}`);
}

for (const [name, source, fragments] of [
  ["indexer", indexSource, [
    "function parseUiButtonPanel(source)",
    "AddButtonPanelButton\\(",
    "UI\\.ButtonPanel\\.X",
    "UI\\.ButtonPanel\\.Y",
    "buttonPanel: parseUiButtonPanel(uncommented)",
    "buttonPanel: null",
    "engineSettings.buttonPanel ??= parsedEngineSettings.buttonPanel"
  ]],
  ["types", typesSource, [
    "buttonPanel: WargusButtonPanelLayout | null",
    "export interface WargusButtonPanelLayout",
    "export interface WargusButtonPanelSlot"
  ]],
  ["world defaults", worldSource, [
    "buttonPanel:",
    "{ slot: 0, x: 9, y: 4 }",
    "{ slot: 8, x: 121, y: 98 }"
  ]],
  ["HUD render", hudSource, [
    "unitTypeName,",
    "upgradeName",
    "from \"./sourceUiHelpers\"",
    "function sourceButtonPanelLayout(world: WorldState, panelX: number, panelY: number, panelWidth: number)",
    "world.engineSettings.buttonPanel?.slots",
    "const sourceLayout = sourceButtonPanelLayout(world, x, y, width)",
    "const sourceSlot = sourceLayout.slots[slot]",
    "buttonSize = sourceLayout.buttonSize",
    "label: sourceTrainButtonLabel(world, button)",
    "label: sourceUnitButtonLabel(world, button)",
    "label: sourceButtonLabel(button) ?? upgradeName(manifest, button.value)",
    "label: sourceSpellButtonLabel(world, button)"
  ]],
  ["source button helpers", buttonsSource, [
    "export function sourceFullButtonLabel(button: WargusButton | null | undefined): string | null",
    "export function sourceButtonLabel(button: WargusButton | null | undefined): string | null",
    "return cleaned || null"
  ]],
  ["source UI helpers", sourceUiSource, [
    "export function spellName(world: WorldState | null, spellId: string): string",
    "world?.spellDefinitions.find((spell) => spell.id === spellId)?.showName?.trim()",
    "return sourceLabel || titleCaseId(spellId, \"spell-\") || \"Spell\"",
    "export function spellLabelForSourceSpell(world: WorldState, spellId: string): string",
    "return spellName(world, spellId)",
    "export function sourceTrainButtonLabel(world: WorldState, button: WargusButton & { value: string }): string",
    "return sourceUnitButtonLabel(world, button)",
    "export function sourceUnitButtonLabel(world: WorldState, button: WargusButton & { value: string }): string",
    "return sourceFullButtonLabel(button) ?? unitLabelForSourceTrain(world, button.value)",
    "world.unitDefinitions.find((unit) => unit.id === unitTypeId)?.name ?? \"Train\"",
    "export function sourceSpellButtonLabel(world: WorldState, button: WargusButton & { value: string }): string",
    "return sourceFullButtonLabel(button) ?? spellLabelForSourceSpell(world, button.value)"
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
  console.error(`Source button panel layout verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source button panel layout verified (9 Wargus command slots indexed and rendered).");
