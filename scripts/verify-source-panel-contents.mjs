import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const dataRoot = manifest.dataRoot;
const source = readFileSync(path.join(dataRoot, "scripts/ui.lua"), "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");

const errors = [];
const panels = new Map((manifest.panelContents ?? []).map((panel) => [panel.ident, panel]));

for (const fragment of [
  "DefinePanelContents(",
  'Ident = "panel-general-contents"',
  'Ident = "panel-building-contents"',
  'Ident = "panel-center-contents"',
  'Ident = "panel-resimrove-contents"',
  'Ident = "panel-all-unit-contents"',
  'Ident = "panel-attack-unit-contents"',
  'Variable1 = "Xp", Variable2 = "Kill", Format = _("XP:~<%d~> Kills:~|~<%d~>")',
  'Condition = {ShowOpponent = false, GiveResource = "only", Build = "false"}',
  'ActiveUnitVar("GiveResource", "Value")',
  'More = {"LifeBar", {Variable = "HitPoints", Height = 7, Width = 50}}',
  'More = {"CompleteBar", {Variable = "Build", Width = 152, Height = 14, Border = false}}',
  'More = {"CompleteBar", {Variable = "Training", Width = 152, Height = 14, Border = false}}',
  'More = {"CompleteBar", {Color = "light-blue", Variable = "Mana", Height = 14, Width = 60, Border = true}}'
]) {
  if (!source.includes(fragment)) {
    errors.push(`scripts/ui.lua missing panel-content fragment: ${fragment}`);
  }
}

for (const ident of [
  "panel-general-contents",
  "panel-building-contents",
  "panel-center-contents",
  "panel-resimrove-contents",
  "panel-all-unit-contents",
  "panel-attack-unit-contents"
]) {
  if (!panels.has(ident)) {
    errors.push(`Manifest missing panelContents entry: ${ident}`);
  }
}

expectItem("panel-general-contents", { kind: "LifeBar", x: 8, y: 51, variable: "HitPoints", width: 50, height: 7 });
expectItem("panel-general-contents", { kind: "FormattedText2", x: 35, y: 61, variable: "HitPoints" });
expectItem("panel-general-contents", { kind: "Text", x: 88, y: 86, condition: { GiveResource: "only", Build: "false", ShowOpponent: false } });
expectItem("panel-general-contents", { kind: "CompleteBar", x: 12, y: 153, variable: "Build", width: 152, height: 14 });
expectItem("panel-all-unit-contents", { kind: "Text", x: 100, y: 86, labelIncludes: "Damage" });
expectItem("panel-all-unit-contents", { kind: "Text", x: 100, y: 71, variable: "Armor" });
expectItem("panel-all-unit-contents", { kind: "Text", x: 100, y: 118, variable: "SightRange" });
expectItem("panel-all-unit-contents", { kind: "Text", x: 100, y: 102, variable: "AttackRange" });
expectItem("panel-all-unit-contents", { kind: "CompleteBar", x: 12, y: 153, variable: "Training", width: 152, height: 14 });
expectItem("panel-all-unit-contents", { kind: "CompleteBar", x: 12, y: 153, variable: "Research", width: 152, height: 14 });
expectItem("panel-all-unit-contents", { kind: "CompleteBar", x: 12, y: 153, variable: "UpgradeTo", width: 152, height: 14 });
expectItem("panel-attack-unit-contents", { kind: "FormattedText", x: 154, y: 41, variable: "Level" });
expectItem("panel-attack-unit-contents", { kind: "FormattedText2", x: 154, y: 56, variable1: "Xp", variable2: "Kill", labelIncludes: "XP:%d Kills:" });
expectItem("panel-attack-unit-contents", { kind: "Text", x: 100, y: 133, variable: "Speed" });
expectItem("panel-attack-unit-contents", { kind: "CompleteBar", x: 103, y: 148, variable: "Mana", width: 60, height: 14 });

for (const [name, code, fragments] of [
  ["indexer", indexSource, [
    "function parsePanelContents(source, sourcePath)",
    "parseTopLevelLuaTables",
    "parsePanelContentItem",
    "const panelContents = parsePanelContents",
    "panelContents: panelContents.length",
    "panelContents,"
  ]],
  ["types", typesSource, [
    "panelContents: number",
    "panelContents?: WargusPanelContents[]",
    "export interface WargusPanelContents",
    "export interface WargusPanelContentItem"
  ]],
  ["HUD render", hudSource, [
    "sourcePanelBarItems(manifest, world, selected)",
    "drawSourcePanelSelectedBars(layer, graphics, panelLeft, manifest, world, selected, statusDecorationAtlas)",
    "const barX = panelLeft + bar.panelX + bar.x",
    "const barY = bar.panelY + bar.y",
    "bar.variable === \"HitPoints\"",
    "bar.variable === \"Mana\"",
    "drawSourceCompletionBar(graphics, barX, barY, bar.width, bar.height, ratio, completedBarColor, completedBarShadow)",
    "sourcePanelContentLines(manifest, world, selected)",
    "const selectedUsesSourcePanel = Boolean(selected && (selectedIsOwned || selected.givesResource || selected.player !== 15))",
    "...(selectedUsesSourcePanel && selected ? sourcePanelContentLines(manifest, world, selected) : [])",
    "drawSelectedUnitBars(hudLayer, frame, left + sideWidth - 78, 132, 58, left, manifest, world, selected, selectedIsOwned, statusDecorationAtlas, wargusBitmapFontAtlas)",
    "drawMultiSelectionPanel(hudLayer, frame, left + 18, 180, sideWidth - 36, manifest, world, selectedUnits, iconAtlas, statusDecorationAtlas, wargusBitmapFontAtlas, onSelectedUnitPick)",
    "drawProductionQueuePanel(hudLayer, frame, left + 18, 180, sideWidth - 36, manifest, world, selectedUnits.length <= 1 && selectedIsOwned && !selectedFromHover ? selected : null, iconAtlas, statusDecorationAtlas, wargusBitmapFontAtlas, onProductionQueuePick)",
    "drawCargoPanel(hudLayer, frame, left + 18, 180, sideWidth - 36, manifest, world, selectedUnits.length <= 1 && selectedIsOwned && !selectedFromHover ? selected : null, iconAtlas, statusDecorationAtlas, wargusBitmapFontAtlas, onCargoUnitPick)",
    "fontId: world.engineSettings.infoPanel?.maxSelectedText?.font ?? \"game\"",
    "sourceTextColorNumber(manifest, selectedRace, \"normal\", 0xf0df9a)"
  ]],
  ["source UI helpers", sourceUiHelpersSource, [
    "export function sourcePanelContentLines",
    "export function sourcePanelBarItems",
    "export interface SourcePanelBarItem",
    "function sourcePanelBarRatio",
    "panelX: panel.x",
    "panelY: panel.y",
    "variable === \"Build\" || variable === \"Training\" || variable === \"Research\" || variable === \"UpgradeTo\"",
    "export function sourceSelectedStatPanels",
    "export function sourcePanelContentLine",
    "export function sourcePanelItemApplies",
    "function sourcePanelConditionsApply",
    "isRuntimeSourceBuildingUnit",
    "function sourcePanelUnitIsBuilding",
    "return isRuntimeSourceBuildingUnit(unit);",
    "function sourcePanelLabelText",
    '"panel-building-contents"',
    '"panel-center-contents"',
    '"panel-resimrove-contents"',
    'variable === "HitPoints"',
    "Math.max(0, Math.ceil(unit.hitPoints))",
    'item.variable1 === "Xp" && item.variable2 === "Kill"',
    "`XP:${Math.max(0, Math.floor(unit.xp))} Kills:${Math.max(0, Math.floor(unit.kills))}`",
    "function sourcePanelDamageLine",
    "item.conditions.BasicDamage === \"only\" || item.conditions.PiercingDamage === \"only\"",
    "function sourcePanelVariableLine",
    "sourcePanelVariableLine(variable, world, unit)",
    'variable === "Armor"',
    'variable === "SightRange"',
    'variable === "AttackRange"',
    'variable === "Speed"',
    'variable === "Mana"',
    'variable === "CarryResource"',
    'item.conditions.GiveResource === "only"',
    "return selectedResourceLine(unit, world)",
    "function sourcePanelSupplyLine",
    "function sourcePanelSupplyFallbackLine",
    "item.x === 100 && item.y === 71",
    "item.x === 100 && item.y === 86",
    "item.x === 100 && item.y === 102",
    "sourcePanelProgressFallbackLine(sourceLabel, manifest, world, unit, item.conditions)",
    "function sourcePanelActiveResearch",
    "function sourcePanelActiveTraining",
    "function sourcePanelActiveUpgradeTo",
    "function sourcePanelActiveProgress",
    "function sourcePanelProgressLine",
    "function sourcePanelProgressFallbackLine",
    "conditions.Research === \"only\"",
    "conditions.UpgradeTo === \"only\"",
    "function sourcePanelIsCompletePercentItem",
    "item.conditions.Build === \"only\" || item.conditions.Training === \"only\" || item.conditions.Research === \"only\" || item.conditions.UpgradeTo === \"only\"",
    "conditions.Center",
    "conditions.GiveResource",
    "conditions.ShowOpponent === false && isOpponent",
    "conditions.Research",
    "conditions.Training",
    "conditions.UpgradeTo",
    "conditions.WoodImprove",
    "conditions.OilImprove",
    "export function sourceDamageLine"
  ]],
  ["world", worldSource, [
    "lastDamageSourceUnitId: string | null",
    "kills: number",
    "xp: number",
    "lastDamageSourceUnitId: null",
    "kills: 0",
    "xp: 0"
  ]],
  ["orders", ordersSource, [
    "target.lastDamageSourceUnitId = sourceUnitId",
    "killerUnit.kills = Math.max(0, Math.floor(killerUnit.kills ?? 0)) + 1",
    "killerUnit.xp = Math.max(0, Math.floor(killerUnit.xp ?? 0)) + Math.max(0, Math.floor(unit.points))"
  ]],
  ["save", saveSource, [
    "unit.lastDamageSourceUnitId = typeof unit.lastDamageSourceUnitId === \"string\"",
    "if (unit.lastDamageSourceUnitId && !liveTopLevelUnitIds.has(unit.lastDamageSourceUnitId))",
    "unit.lastDamageSourceUnitId = null",
    "unit.kills = Math.max(0, Math.floor(finiteNumberOr(unit.kills, 0)))",
    "unit.xp = Math.max(0, Math.floor(finiteNumberOr(unit.xp, 0)))"
  ]]
]) {
  for (const fragment of fragments) {
    if (!code.includes(fragment)) {
      errors.push(`${name} missing fragment: ${fragment}`);
    }
  }
}

const panelBuildingHelper = sourceUiHelpersSource.match(/function sourcePanelUnitIsBuilding[\s\S]*?\n}\n/)?.[0] ?? "";
if (panelBuildingHelper.includes('unit.kind === "building"')) {
  errors.push("Source panel Building conditions should use source Building semantics instead of browser-local kind text.");
}

for (const fragment of [
  "function sourceSelectedStatPanels",
  "function sourcePanelContentLine",
  "function sourcePanelItemApplies",
  "function sourceDamageLine",
  "productionStatusLine(manifest",
  "activeResearchLine(manifest",
  "`Carrying ${selected.resourcesHeld} ${resourceNameLabel(world, selected.carriedResource)}`"
]) {
  if (hudSource.includes(fragment)) {
    errors.push(`HUD should delegate source panel-content interpretation to sourceUiHelpers instead of owning: ${fragment}`);
  }
}

function expectItem(panelIdent, expected) {
  const panel = panels.get(panelIdent);
  const item = panel?.items.find((candidate) => (
    candidate.kind === expected.kind
    && candidate.x === expected.x
    && candidate.y === expected.y
    && (expected.variable === undefined || candidate.variable === expected.variable)
    && (expected.variable1 === undefined || candidate.variable1 === expected.variable1)
    && (expected.variable2 === undefined || candidate.variable2 === expected.variable2)
    && (expected.width === undefined || candidate.width === expected.width)
    && (expected.height === undefined || candidate.height === expected.height)
    && (expected.labelIncludes === undefined || candidate.label?.includes(expected.labelIncludes))
    && (expected.condition === undefined || Object.entries(expected.condition).every(([key, value]) => candidate.conditions?.[key] === value))
  ));
  if (!item) {
    errors.push(`${panelIdent} missing item ${JSON.stringify(expected)}; indexed ${JSON.stringify(panel?.items ?? [])}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source panel-content verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source panel contents verified (Wargus DefinePanelContents indexed and selected stats rendered from source metadata).");
