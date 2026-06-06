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
const expected = {
  x: 0,
  y: 160,
  width: 176,
  height: 176,
  singleSelected: { slot: 0, x: 9, y: 9 },
  selectedSlots: [
    { slot: 0, x: 9, y: 9 },
    { slot: 1, x: 65, y: 9 },
    { slot: 2, x: 121, y: 9 },
    { slot: 3, x: 9, y: 63 },
    { slot: 4, x: 65, y: 63 },
    { slot: 5, x: 121, y: 63 },
    { slot: 6, x: 9, y: 117 },
    { slot: 7, x: 65, y: 117 },
    { slot: 8, x: 121, y: 117 }
  ],
  maxSelectedText: { x: 10, y: 10, font: "game" },
  singleTraining: { slot: 0, x: 110, y: 81 },
  trainingSlots: [
    { slot: 0, x: 9, y: 59 },
    { slot: 1, x: 65, y: 59 },
    { slot: 2, x: 121, y: 59 },
    { slot: 3, x: 9, y: 106 },
    { slot: 4, x: 65, y: 106 },
    { slot: 5, x: 121, y: 106 }
  ],
  upgrading: { slot: 0, x: 110, y: 81 },
  researching: { slot: 0, x: 110, y: 81 },
  transportingSlots: [
    { slot: 0, x: 9, y: 227 },
    { slot: 1, x: 9, y: 274 },
    { slot: 2, x: 65, y: 227 },
    { slot: 3, x: 65, y: 274 },
    { slot: 4, x: 121, y: 227 },
    { slot: 5, x: 121, y: 274 }
  ]
};

for (const [name, source] of [["human UI", humanUiSource], ["orc UI", orcUiSource]]) {
  for (const fragment of [
    "UI.InfoPanel.X = 0",
    "UI.InfoPanel.Y = 160",
    "UI.InfoPanel.G = CGraphic:New",
    "UI.SingleSelectedButton = b",
    "UI.SelectedButtons:clear()",
    "AddSelectedButton(121, 160 + 117)",
    "UI.SingleTrainingButton = b",
    "AddTrainingButton(121, 266)",
    "UI.UpgradingButton = b",
    "UI.ResearchingButton = b",
    "AddTransportingButton(121, 434)"
  ]) {
    if (!source.includes(fragment)) {
      errors.push(`${name} missing info-panel fragment: ${fragment}`);
    }
  }
}

if (JSON.stringify(manifest.engineSettings.infoPanel) !== JSON.stringify(expected)) {
  errors.push(`Manifest infoPanel is ${JSON.stringify(manifest.engineSettings.infoPanel)}, expected ${JSON.stringify(expected)}`);
}

for (const [name, source, fragments] of [
  ["indexer", indexSource, [
    "function parseUiInfoPanel(source, videoSize = sourceVideoSize())",
    "parseUiAssignedButton",
    "parseUiPanelButtonCalls",
    "evalUiNumberExpression",
    "infoPanel: parseUiInfoPanel(uncommented, videoSize)",
    "engineSettings.infoPanel ??= parsedEngineSettings.infoPanel"
  ]],
  ["types", typesSource, [
    "infoPanel: WargusInfoPanelLayout | null",
    "export interface WargusInfoPanelLayout",
    "export interface WargusPanelButtonSlot",
    "transportingSlots: WargusPanelButtonSlot[]"
  ]],
  ["world defaults", worldSource, [
    "infoPanel:",
    "singleSelected: { slot: 0, x: 9, y: 9 }",
    "{ slot: 8, x: 121, y: 117 }",
    "{ slot: 5, x: 121, y: 274 }"
  ]],
  ["HUD render", hudSource, [
    "unitTypeName,",
    "upgradeName",
    "from \"./sourceUiHelpers\"",
    "world.engineSettings.infoPanel?.singleSelected",
    "sourceLayout.selectedSlots",
    "sourceLayout.trainingSlots",
    "sourceLayout.transportingSlots",
    "selected ? `${unitTypeName(manifest, selected.typeId)} (${selected.kind})`",
    "sourcePanelContentLines(manifest, world, selected)",
    "const selectedUsesSourcePanel = Boolean(selected && (selectedIsOwned || selected.givesResource || selected.player !== 15))",
    "label: unit?.name ?? unitTypeName(manifest, order.unitTypeId)",
    "label: upgradeName(manifest, research.upgradeId)",
    "selectedRallyLine(selected, world)",
    "selectedOrderLine(selected, world, manifest)",
    "commandHint(selected, world)"
  ]],
  ["source UI helpers", sourceUiHelpersSource, [
    "export function sourceInfoPanelLayout(layout: WargusInfoPanelLayout | null",
    "export function sourceInfoPanelSlot(layout: WargusInfoPanelLayout | null",
    "selectedSlots: sourceLayout.selectedSlots",
    "trainingSlots: sourceLayout.trainingSlots",
    "transportingSlots: sourceLayout.transportingSlots",
    "export function selectedOrderLine(selected: WorldUnit | null, world: WorldState, manifest: WargusManifest): string",
    "export function activeResearchLine(manifest: WargusManifest, world: WorldState, buildingId: string): string",
    "export function productionStatusLine(manifest: WargusManifest, order: WorldUnit[\"productionQueue\"][number]): string",
    "export function selectedRallyLine(unit: WorldUnit, world: WorldState): string",
    "return `Rally ${Math.round(unit.rallyPoint.x / world.tileSize)}, ${Math.round(unit.rallyPoint.y / world.tileSize)}`",
    "resourceNameLabel(world,",
    "export function commandHint(unit: WorldUnit, world?: WorldState): string",
    "function orderTargetLabel(world: WorldState, manifest: WargusManifest, targetId: string)",
    "world.units.find((unit) => unit.id === targetId)",
    "Research ${upgradeName(manifest, research.upgradeId)}",
    "const label = unitTypeName(manifest, order.unitTypeId)",
    "Attack ${orderTargetLabel(world, manifest, selected.order.targetId)}",
    "Repair ${orderTargetLabel(world, manifest, selected.order.targetId)}",
    "Board ${orderTargetLabel(world, manifest, selected.order.targetId)}",
    "Follow ${orderTargetLabel(world, manifest, selected.order.targetId)}",
    "Build ${orderTargetLabel(world, manifest, selected.order.targetId)}"
  ]]
]) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      errors.push(`${name} missing fragment: ${fragment}`);
    }
  }
}

for (const fragment of [
  "function selectedOrderLine",
  "function orderTargetLabel",
  "`Rally ${Math.round(selected.rallyPoint.x / world.tileSize)}, ${Math.round(selected.rallyPoint.y / world.tileSize)}`"
]) {
  if (hudSource.includes(fragment)) {
    errors.push(`HUD should delegate selected order text to sourceUiHelpers instead of owning: ${fragment}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source info-panel layout verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source info-panel layout verified (selected, training, research, and transport slots indexed and rendered).");
