import type { SavedGameSummary } from "../wargus/saveGame";
import type { WargusButton, WargusButtonStyle, WargusInfoPanelLayout, WargusManifest, WargusMap, WargusMenuButtonGroup, WargusMenuButtonLayout, WargusMessageUiLayout, WargusPanelButtonSlot, WargusPanelContents, WargusStatusLineLayout } from "../wargus/types";
import { isRuntimeSourceBuildingUnit, type WorldState, type WorldUnit } from "../simulation/world";
import { canToggleAutoCastSpell, canToggleAutoRepair, canUseHudBuilderCommands, effectiveVictoryRequirements, isAutoCastSpellEnabled, isProducerTransformationFor, sourceCommandHint, sourceGameSpeedLabel } from "../simulation/orders";
import { sourceFullButtonLabel } from "../wargus/buttons";
import { sourcePlayableViewportSize, type Camera } from "./camera";

export interface SourcePopupCommand {
  id: string;
  label: string;
  sourceButton?: WargusButton | null;
}

export type SourceMenuOverlayId = "main-menu" | "help-menu" | "keystroke-help" | "tips" | "objectives" | "game-options" | "speed-options" | "sound-options" | "preferences" | "save-menu" | "load-menu" | "diplomacy" | "end-scenario" | "restart-confirm" | "surrender-confirm" | "quit-to-menu" | "exit-game";

export interface SourceSavedSummaryTime {
  savedAt: string;
  mapPath: string;
  slot: number;
  persisted?: boolean;
}

export interface SourceMapPickerState {
  query: string;
  maps: WargusMap[];
}

export interface SourceMenuOverlayButton {
  label: string;
  command: string;
  disabled?: boolean;
}

export interface SourceDiplomacyDraftRow {
  player: number;
  name: string;
  playerType: string | null;
  race: string | null;
  allied: boolean;
  enemy: boolean;
  sharedVision: boolean;
  locked: boolean;
}

export interface SourceDiplomacyDraft {
  rows: SourceDiplomacyDraftRow[];
}

const SOURCE_KEYSTROKE_HELP: Array<[string, string]> = [
  ["Alt-F", "toggle full screen"],
  ["Alt-G", "toggle grab mouse"],
  ["Ctrl-S", "mute sound"],
  ["Ctrl-M", "mute music"],
  ["+", "increase game speed"],
  ["-", "decrease game speed"],
  ["Ctrl-P", "pause game"],
  ["PAUSE", "pause game"],
  ["PRINT", "make screen shot"],
  ["Alt-H", "help menu"],
  ["Alt-R", "restart scenario"],
  ["Alt-Q", "quit to main menu"],
  ["Alt-X", "quit game"],
  ["Alt-B", "toggle expand map"],
  ["Alt-M", "game menu"],
  ["ENTER", "write a message"],
  ["SPACE", "goto last event"],
  ["TAB", "hide/unhide terrain"],
  ["Ctrl-T", "track unit"],
  ["Alt-I", "find idle peon"],
  ["Alt-C", "center on selected unit"],
  ["Alt-V", "next view port"],
  ["Ctrl-V", "previous view port"],
  ["^", "select nothing"],
  ["#", "select group"],
  ["##", "center on group"],
  ["Ctrl-#", "define group"],
  ["Shift-#", "add to group"],
  ["Alt-#", "add to alternate group"],
  ["F2-F4", "recall map position"],
  ["Shift F2-F4", "save map position"],
  ["F5", "game options"],
  ["F6", "speed options"],
  ["F7", "sound options"],
  ["F8", "preferences"],
  ["F9", "diplomacy"],
  ["F10", "game menu"],
  ["BACKSPACE", "game menu"],
  ["F11", "save game"],
  ["F12", "load game"]
];

export function visibleResourceUiSlots(world: WorldState) {
  return world.engineSettings.resourceUiSlots.filter((slot) => ["gold", "wood", "oil", "food", "score", "workers"].includes(slot.key) && !slot.hidden);
}

export function unitTypeName(manifest: WargusManifest | null, typeId: string): string {
  return manifest?.units.find((unit) => unit.id === typeId)?.name ?? typeId.replace(/^unit-/, "").replaceAll("-", " ");
}

export function upgradeName(manifest: WargusManifest | null, upgradeId: string): string {
  const sourceHint = manifest?.buttons.find((button) => button.action === "research" && button.value === upgradeId)?.hint;
  const sourceLabel = sourceHint ? cleanSourceButtonHint(sourceHint) : null;
  return sourceLabel || upgradeId.replace(/^upgrade-/, "").replaceAll("-", " ");
}

export function spellName(world: WorldState | null, spellId: string): string {
  const sourceLabel = world?.spellDefinitions.find((spell) => spell.id === spellId)?.showName?.trim();
  return sourceLabel || titleCaseId(spellId, "spell-") || "Spell";
}

export function resourceName(world: WorldState | null, resource: string): string {
  const resourceIndex = world ? world.engineSettings.defaultResourceNames.indexOf(resource) : -1;
  const sourceLabel = resourceIndex >= 0 ? world?.engineSettings.resourceUiLabels[resourceIndex] : null;
  const sourceName = resourceIndex >= 0 ? world?.engineSettings.defaultResourceNames[resourceIndex] : null;
  const label = sourceLabel?.trim().replace(/:$/, "") || sourceName || resource;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function resourceNameLabel(world: WorldState | null, resource: string | null): string {
  if (!resource) {
    return "Resource";
  }
  return resourceName(world, resource);
}

export function resourceUiLabel(world: WorldState, resource: string): string {
  const resourceIndex = world.engineSettings.defaultResourceNames.indexOf(resource);
  const sourceLabel = resourceIndex >= 0 ? world.engineSettings.resourceUiLabels[resourceIndex] : null;
  return sourceLabel?.trim().replace(/:$/, "") || resourceNameLabel(world, resource);
}

export function selectedResourceLine(unit: WorldUnit, world: WorldState): string {
  if (!unit.givesResource || unit.resourcesHeld <= 0) {
    return "";
  }
  return `${resourceUiLabel(world, unit.givesResource)} ${unit.resourcesHeld}`;
}

export function idleWorkerSummary(world: WorldState): string {
  const count = sourceFreeWorkerCount(world);
  return count > 0 ? `Idle workers ${count} (.)` : "";
}

export function sourceFreeWorkerCount(world: WorldState, playerId = world.visibilityPlayer): number {
  return world.units.filter((unit) => (
    unit.player === playerId
    && unit.hitPoints > 0
    && !unit.construction
    && canUseHudBuilderCommands(unit)
    && !unit.order
    && unit.resourcesHeld <= 0
  )).length;
}

export function sourcePreferredHarvestActionLabel(world: WorldState, units: WorldUnit[]): string {
  const resource = units
    .flatMap((unit) => unit.gatherResources)
    .find((candidate): candidate is "gold" | "wood" | "oil" => candidate === "gold" || candidate === "wood" || candidate === "oil");
  return sourceResourceActionLabel(world, resource ?? null, "Harvest");
}

export function sourceResourceActionLabel(world: WorldState, resource: string | null, fallback: string): string {
  if (!resource) {
    return fallback;
  }
  const resourceIndex = world.engineSettings.defaultResourceNames.indexOf(resource);
  const sourceAction = resourceIndex >= 0 ? world.engineSettings.defaultResourceActions[resourceIndex] : null;
  return sourceActionWord(sourceAction) ?? fallback;
}

export function sourceHudActionLabel(commandId: string): string {
  if (commandId === "move") return "Move";
  if (commandId === "hold-position") return "Hold";
  if (commandId === "attack-move") return "Attack";
  if (commandId === "attack-ground") return "Ground";
  if (commandId === "return-goods") return "Return";
  if (commandId === "unload-transport") return "Unload";
  return commandId
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function sourceActionWord(action: string | null | undefined): string | null {
  const cleaned = action?.trim();
  if (!cleaned || cleaned === "stop") {
    return null;
  }
  return cleaned
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function sourcePanelContentLines(manifest: WargusManifest, world: WorldState, unit: WorldUnit): string[] {
  const panels = sourceSelectedStatPanels(manifest.panelContents ?? [], world, unit);
  const items = panels
    .flatMap((panel) => panel.items)
    .filter((item) => item.kind === "Text" || item.kind === "FormattedText" || item.kind === "FormattedText2")
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const line = sourcePanelContentLine(item, manifest, world, unit);
    if (!line || seen.has(line)) {
      continue;
    }
    seen.add(line);
    lines.push(line);
  }
  return lines;
}

export interface SourcePanelBarItem {
  panelX: number;
  panelY: number;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "LifeBar" | "CompleteBar";
  variable: string;
  ratio: number;
}

export function sourcePanelBarItems(manifest: WargusManifest, world: WorldState, unit: WorldUnit): SourcePanelBarItem[] {
  const panels = sourceSelectedStatPanels(manifest.panelContents ?? [], world, unit);
  const bars: SourcePanelBarItem[] = [];
  for (const panel of panels) {
    for (const item of panel.items) {
      if ((item.kind !== "LifeBar" && item.kind !== "CompleteBar") || !sourcePanelItemApplies(item, world, unit)) {
        continue;
      }
      const width = item.width ?? 0;
      const height = item.height ?? 0;
      const variable = item.variable ?? "";
      const ratio = sourcePanelBarRatio(variable, item.conditions, world, unit);
      if (width <= 0 || height <= 0 || ratio === null) {
        continue;
      }
      bars.push({
        panelX: panel.x,
        panelY: panel.y,
        x: item.x,
        y: item.y,
        width,
        height,
        kind: item.kind,
        variable,
        ratio
      });
    }
  }
  return bars;
}

export function sourceSelectedStatPanels(panels: WargusPanelContents[], world: WorldState, unit: WorldUnit): WargusPanelContents[] {
  const general = panels.find((panel) => panel.ident === "panel-general-contents");
  const sourceSpecificIds = [
    "panel-building-contents",
    "panel-center-contents",
    "panel-resimrove-contents",
    unit.canAttack && !sourcePanelUnitIsBuilding(unit) ? "panel-attack-unit-contents" : "panel-all-unit-contents"
  ];
  const specific = sourceSpecificIds
    .map((ident) => panels.find((panel) => panel.ident === ident && sourcePanelConditionsApply(panel.conditions, world, unit)))
    .filter((panel): panel is WargusPanelContents => Boolean(panel));
  return [general, ...specific].filter((panel): panel is WargusPanelContents => Boolean(panel));
}

export function sourcePanelContentLine(item: WargusPanelContents["items"][number], manifest: WargusManifest, world: WorldState, unit: WorldUnit): string {
  if (!sourcePanelItemApplies(item, world, unit)) {
    return "";
  }
  const variable = item.variable ?? item.variable1 ?? item.variable2;
  const label = item.label ?? item.format ?? "";
  const sourceLabel = sourcePanelLabelText(label);
  if (item.conditions.GiveResource === "only") {
    return selectedResourceLine(unit, world);
  }
  const supplyLine = sourcePanelSupplyLine(item, unit);
  if (supplyLine) {
    return supplyLine;
  }
  const supplyFallbackLine = sourcePanelSupplyFallbackLine(sourceLabel, unit);
  if (supplyFallbackLine) {
    return supplyFallbackLine;
  }
  if (sourceLabel === "Production") {
    return "Production";
  }
  if (sourcePanelIsCompletePercentItem(item)) {
    const active = sourcePanelActiveProgress(world, unit, item.conditions);
    return active ? `% Complete ${Math.max(0, Math.min(100, Math.floor((1 - active.remainingSeconds / active.totalSeconds) * 100)))}` : "";
  }
  const progressLabel = sourcePanelProgressLine(manifest, world, unit, item.conditions);
  if (progressLabel) {
    return progressLabel;
  }
  const progressFallbackLine = sourcePanelProgressFallbackLine(sourceLabel, manifest, world, unit, item.conditions);
  if (progressFallbackLine) {
    return progressFallbackLine;
  }
  if (sourceLabel.startsWith("Gold") || sourceLabel.startsWith("Lumber") || sourceLabel.startsWith("Oil")) {
    return sourceLabel;
  }
  if (variable === "HitPoints") {
    return `HP ${Math.max(0, Math.ceil(unit.hitPoints))}/${unit.maxHitPoints}`;
  }
  if (variable === "Level") {
    return unit.level > 0 ? `Level ${unit.level}` : "";
  }
  if (item.variable1 === "Xp" && item.variable2 === "Kill") {
    return unit.xp > 0 || unit.kills > 0 ? `XP:${Math.max(0, Math.floor(unit.xp))} Kills:${Math.max(0, Math.floor(unit.kills))}` : "";
  }
  const damageLine = sourcePanelDamageLine(item, unit);
  if (damageLine) {
    return damageLine;
  }
  const variableLine = sourcePanelVariableLine(variable, world, unit);
  if (variableLine) {
    return variableLine;
  }
  if (label.includes("Damage")) {
    return sourceDamageLine(unit);
  }
  if (label.includes("Armor")) {
    return sourcePanelVariableLine("Armor", world, unit);
  }
  if (label.includes("Sight")) {
    return sourcePanelVariableLine("SightRange", world, unit);
  }
  if (label.includes("Range")) {
    return sourcePanelVariableLine("AttackRange", world, unit);
  }
  if (label.includes("Speed")) {
    return sourcePanelVariableLine("Speed", world, unit);
  }
  if (label.includes("Mana")) {
    return sourcePanelVariableLine("Mana", world, unit);
  }
  if (label.includes("Carry")) {
    return sourcePanelVariableLine("CarryResource", world, unit);
  }
  return "";
}

function sourcePanelVariableLine(variable: string | null | undefined, world: WorldState, unit: WorldUnit): string {
  if (variable === "Armor") {
    return unit.armor > 0 ? `Armor ${unit.armor}` : "";
  }
  if (variable === "SightRange") {
    return unit.sightRangeTiles > 0 ? `Sight ${unit.sightRangeTiles}` : "";
  }
  if (variable === "AttackRange") {
    return unit.attackRange > 0 ? `Range ${Math.max(1, Math.round((unit.attackRange - 12) / world.tileSize))}` : "";
  }
  if (variable === "Speed") {
    return unit.speed > 0 ? `Speed ${Math.round(unit.speed)}` : "";
  }
  if (variable === "Mana") {
    return unit.maxMana > 0 ? `Mana ${Math.floor(unit.mana)}/${unit.maxMana}` : "";
  }
  if (variable === "CarryResource") {
    return unit.resourcesHeld ? `Carry ${unit.resourcesHeld} ${resourceNameLabel(world, unit.carriedResource)}` : "";
  }
  return "";
}

function sourcePanelSupplyFallbackLine(sourceLabel: string, unit: WorldUnit): string {
  if (sourceLabel === "Usage") {
    return unit.supply > 0 || unit.demand > 0 ? "Usage" : "";
  }
  if (sourceLabel.startsWith("Supply")) {
    return unit.supply > 0 ? `Supply ${unit.supply}` : "";
  }
  if (sourceLabel.startsWith("Demand")) {
    return unit.demand > 0 ? `Demand ${unit.demand}` : "";
  }
  return "";
}

function sourcePanelDamageLine(item: WargusPanelContents["items"][number], unit: WorldUnit): string {
  return item.kind === "Text"
    && (item.conditions.BasicDamage === "only" || item.conditions.PiercingDamage === "only")
    ? sourceDamageLine(unit)
    : "";
}

function sourcePanelProgressLine(manifest: WargusManifest, world: WorldState, unit: WorldUnit, conditions: Record<string, string | boolean>): string {
  if (conditions.Research === "only") {
    const research = sourcePanelActiveResearch(world, unit);
    return research ? `Researching ${upgradeName(manifest, research.upgradeId)}` : "";
  }
  if (conditions.UpgradeTo === "only") {
    const order = sourcePanelActiveUpgradeTo(world, unit);
    return order ? `Upgrading ${unitTypeName(manifest, order.unitTypeId)}` : "";
  }
  return "";
}

function sourcePanelProgressFallbackLine(sourceLabel: string, manifest: WargusManifest, world: WorldState, unit: WorldUnit, conditions: Record<string, string | boolean>): string {
  if (sourceLabel.startsWith("Researching")) {
    const research = sourcePanelActiveResearch(world, unit);
    return research ? `Researching ${upgradeName(manifest, research.upgradeId)}` : "";
  }
  if (sourceLabel.startsWith("Upgrading")) {
    const order = sourcePanelActiveUpgradeTo(world, unit);
    return order ? `Upgrading ${unitTypeName(manifest, order.unitTypeId)}` : "";
  }
  if (sourceLabel.startsWith("% Complete")) {
    const active = sourcePanelActiveProgress(world, unit, conditions);
    return active ? `% Complete ${Math.max(0, Math.min(100, Math.floor((1 - active.remainingSeconds / active.totalSeconds) * 100)))}` : "";
  }
  return "";
}

function sourcePanelSupplyLine(item: WargusPanelContents["items"][number], unit: WorldUnit): string {
  if (item.kind !== "Text" || item.variable || item.variable1 || item.variable2 || (unit.supply <= 0 && unit.demand <= 0)) {
    return "";
  }
  if (item.x === 100 && item.y === 71) {
    return "Usage";
  }
  if (item.x === 100 && item.y === 86) {
    return unit.supply > 0 ? `Supply ${unit.supply}` : "";
  }
  if (item.x === 100 && item.y === 102) {
    return unit.demand > 0 ? `Demand ${unit.demand}` : "";
  }
  return "";
}

function sourcePanelIsCompletePercentItem(item: WargusPanelContents["items"][number]): boolean {
  const sourceLabel = sourcePanelLabelText(item.label ?? item.format ?? "");
  return item.kind === "Text"
    && !item.variable
    && sourceLabel === "% Complete"
    && (item.conditions.Build === "only" || item.conditions.Training === "only" || item.conditions.Research === "only" || item.conditions.UpgradeTo === "only");
}

export function sourcePanelItemApplies(item: WargusPanelContents["items"][number], world: WorldState, unit: WorldUnit): boolean {
  return sourcePanelConditionsApply(item.conditions, world, unit);
}

function sourcePanelConditionsApply(conditions: Record<string, string | boolean>, world: WorldState, unit: WorldUnit): boolean {
  const hasTraining = Boolean(sourcePanelActiveTraining(world, unit));
  const hasResearch = Boolean(sourcePanelActiveResearch(world, unit));
  const hasUpgradeTo = Boolean(sourcePanelActiveUpgradeTo(world, unit));
  const isOpponent = unit.player !== world.visibilityPlayer && unit.player !== 15;
  if (conditions.ShowOpponent === false && isOpponent) return false;
  if (conditions.Build === "false" && unit.construction) return false;
  if (conditions.Build === "only" && !unit.construction) return false;
  if (conditions.Building === "false" && sourcePanelUnitIsBuilding(unit)) return false;
  if (conditions.Building === "only" && !sourcePanelUnitIsBuilding(unit)) return false;
  if (conditions.Center === "false" && unit.center) return false;
  if (conditions.Center === "only" && !unit.center) return false;
  if (conditions.Supply === "only" && unit.supply <= 0) return false;
  if (conditions.WoodImprove === "only" && !unit.woodImprove) return false;
  if (conditions.OilImprove === "only" && !unit.oilImprove) return false;
  if (conditions.HideNeutral === true && unit.player === 15) return false;
  if (conditions.Armor === "only" && unit.armor <= 0) return false;
  if (conditions.Speed === "only" && unit.speed <= 0) return false;
  if (conditions.Mana === "only" && unit.maxMana <= 0) return false;
  if (conditions.CarryResource === "only" && unit.resourcesHeld <= 0) return false;
  if (conditions.GiveResource === "only" && (!unit.givesResource || unit.resourcesHeld <= 0)) return false;
  if (conditions.GiveResource === "false" && unit.givesResource && unit.resourcesHeld > 0) return false;
  if (conditions.AttackRange === "only" && unit.attackRange <= 0) return false;
  if (conditions.SightRange === "only" && unit.sightRangeTiles <= 0) return false;
  if (conditions.BasicDamage === "only" && unit.basicDamage <= 0) return false;
  if (conditions.PiercingDamage === "only" && unit.piercingDamage <= 0) return false;
  if (conditions.Research === "only" && !hasResearch) return false;
  if (conditions.Research === "false" && hasResearch) return false;
  if (conditions.Training === "only" && !hasTraining) return false;
  if (conditions.Training === "false" && hasTraining) return false;
  if (conditions.UpgradeTo === "only" && !hasUpgradeTo) return false;
  if (conditions.UpgradeTo === "false" && hasUpgradeTo) return false;
  return true;
}

function sourcePanelActiveResearch(world: WorldState, unit: WorldUnit): WorldState["activeResearch"][number] | null {
  return world.activeResearch.find((research) => research.buildingId === unit.id) ?? null;
}

function sourcePanelActiveTraining(_world: WorldState, unit: WorldUnit): WorldUnit["productionQueue"][number] | null {
  const order = unit.productionQueue[0] ?? null;
  return order && !isProducerTransformationFor(_world, unit, order.unitTypeId) ? order : null;
}

function sourcePanelActiveUpgradeTo(world: WorldState, unit: WorldUnit): WorldUnit["productionQueue"][number] | null {
  const order = unit.productionQueue[0] ?? null;
  return order && isProducerTransformationFor(world, unit, order.unitTypeId) ? order : null;
}

function sourcePanelActiveProgress(world: WorldState, unit: WorldUnit, conditions: Record<string, string | boolean>): { remainingSeconds: number; totalSeconds: number } | null {
  if (conditions.Research === "only") return sourcePanelActiveResearch(world, unit);
  if (conditions.UpgradeTo === "only") return sourcePanelActiveUpgradeTo(world, unit);
  if (conditions.Training === "only") return sourcePanelActiveTraining(world, unit);
  if (conditions.Build === "only") return unit.construction;
  return null;
}

function sourcePanelBarRatio(variable: string, conditions: Record<string, string | boolean>, world: WorldState, unit: WorldUnit): number | null {
  if (variable === "HitPoints") {
    return unit.maxHitPoints > 0 ? unit.hitPoints / unit.maxHitPoints : null;
  }
  if (variable === "Mana") {
    return unit.maxMana > 0 ? unit.mana / unit.maxMana : null;
  }
  if (variable === "Build" || variable === "Training" || variable === "Research" || variable === "UpgradeTo") {
    const active = sourcePanelActiveProgress(world, unit, conditions);
    return active && active.totalSeconds > 0 ? 1 - active.remainingSeconds / active.totalSeconds : null;
  }
  return null;
}

function sourcePanelLabelText(label: string): string {
  return label
    .replaceAll("~<", "")
    .replaceAll("~>", "")
    .replaceAll("~|", "")
    .replaceAll("|", "")
    .replace(/\s+/g, " ")
    .trim();
}

export function sourceDamageLine(unit: WorldUnit): string {
  if (unit.basicDamage <= 0 && unit.piercingDamage <= 0) {
    return "";
  }
  const minDamage = Math.floor(unit.piercingDamage / 2);
  const maxDamage = unit.piercingDamage + unit.basicDamage;
  return `Damage ${minDamage}-${maxDamage}`;
}

function sourcePanelUnitIsBuilding(unit: WorldUnit): boolean {
  return isRuntimeSourceBuildingUnit(unit);
}

export function selectedOrderLine(selected: WorldUnit | null, world: WorldState, manifest: WargusManifest): string {
  if (!selected) {
    return "Right-click commands after selecting";
  }
  if (selected.order?.kind === "move") {
    return `Move ${Math.round(selected.order.targetX / world.tileSize)}, ${Math.round(selected.order.targetY / world.tileSize)}`;
  }
  if (selected.order?.kind === "attack") {
    return `Attack ${orderTargetLabel(world, manifest, selected.order.targetId)}`;
  }
  if (selected.order?.kind === "hold") {
    return "Hold position";
  }
  if (selected.order?.kind === "attack-move") {
    return `Attack-move ${Math.round(selected.order.targetX / world.tileSize)}, ${Math.round(selected.order.targetY / world.tileSize)}`;
  }
  if (selected.order?.kind === "attack-ground") {
    return `Attack-ground ${Math.round(selected.order.targetX / world.tileSize)}, ${Math.round(selected.order.targetY / world.tileSize)}`;
  }
  if (selected.order?.kind === "patrol") {
    return `Patrol ${Math.round(selected.order.patrolX / world.tileSize)}, ${Math.round(selected.order.patrolY / world.tileSize)}`;
  }
  if (selected.order?.kind === "repair") {
    return `Repair ${orderTargetLabel(world, manifest, selected.order.targetId)}`;
  }
  if (selected.order?.kind === "load-transport") {
    return `Board ${orderTargetLabel(world, manifest, selected.order.targetId)}`;
  }
  if (selected.order?.kind === "follow") {
    return `Follow ${orderTargetLabel(world, manifest, selected.order.targetId)}`;
  }
  if (selected.order?.kind === "defend") {
    return `Defend ${orderTargetLabel(world, manifest, selected.order.targetId)}`;
  }
  if (selected.order?.kind === "unload-transport") {
    return `Unload ${Math.round(selected.order.targetX / world.tileSize)}, ${Math.round(selected.order.targetY / world.tileSize)}`;
  }
  if (selected.order?.kind === "harvest") {
    return `${sourceResourceActionLabel(world, selected.order.resource, "Harvest")} ${resourceNameLabel(world, selected.order.resource)} ${selected.order.phase}`;
  }
  if (selected.order?.kind === "build") {
    return `Build ${orderTargetLabel(world, manifest, selected.order.targetId)}`;
  }
  if (selected.order?.kind === "build-oil-platform") {
    return `Build platform ${Math.round(selected.order.targetX / world.tileSize)}, ${Math.round(selected.order.targetY / world.tileSize)}`;
  }
  return commandHint(selected, world);
}

export function objectiveLines(manifest: WargusManifest, world: WorldState): string[] {
  const objectives = world.objectives.slice(0, 3);
  if (objectives.length === 0) {
    return [];
  }
  const requirementLines = effectiveVictoryRequirements(world)
    .filter((requirement) => requirement.kind === "unit-count")
    .map((requirement) => {
      const count = countLiveUnitsOfTypeIncludingCargo(world, world.visibilityPlayer, requirement.unitTypeId);
      return `${unitTypeName(manifest, requirement.unitTypeId)}: ${Math.min(count, requirement.minimum)}/${requirement.minimum}`;
    });
  return [
    "Objectives:",
    ...objectives.map((objective) => `- ${objective}`),
    ...requirementLines
  ];
}

export function ownerLine(unit: WorldUnit, owner: WorldState["players"][number] | null | undefined): string {
  if (unit.player === 15) {
    return "Neutral";
  }
  const race = owner?.race ? ` ${owner.race}` : "";
  return `Enemy player ${unit.player}${race}`;
}

export function economyRoleLine(unit: WorldUnit): string {
  const roles: string[] = [];
  if (unit.center) {
    roles.push("center");
  }
  if (unit.woodImprove) {
    roles.push("wood");
  }
  if (unit.oilImprove) {
    roles.push("oil");
  }
  if (roles.length === 0) {
    return "";
  }
  return `Economy ${roles.join(", ")}`;
}

export function sourceSpecialLine(unit: WorldUnit): string {
  const roles: string[] = [];
  if (unit.level > 0) {
    roles.push(`level ${unit.level}`);
  }
  if (unit.builderOutside) {
    roles.push("outside-builder");
  }
  if (unit.shoreBuilding) {
    roles.push("shore");
  }
  if (unit.teleporter) {
    roles.push(unit.teleportDestinationId ? "teleporter linked" : "teleporter");
  }
  if (unit.numDirections > 0) {
    roles.push(`${unit.numDirections} dir`);
  }
  if (unit.onReady) {
    roles.push(unit.onReady);
  }
  return roles.length > 0 ? `Source ${roles.join(", ")}` : "";
}

export function controlGroupSummary(controlGroups: Record<number, string[]>, world: WorldState): string {
  const sourceKeys = world.engineSettings.groupKeysDefault || "0123456789";
  const entries = Object.entries(controlGroups)
    .map(([group, ids]) => {
      const liveCount = ids.filter((id) => unitIdExistsIncludingCargo(world, id)).length;
      const label = sourceKeys[Number(group)] ?? group;
      return liveCount > 0 ? `${label}:${liveCount}` : "";
    })
    .filter((entry) => entry !== "");
  return entries.length > 0 ? `Groups ${entries.join(" ")}` : "";
}

function countLiveUnitsOfTypeIncludingCargo(world: WorldState, playerId: number, typeId: string): number {
  let count = 0;
  const visit = (unit: WorldUnit): void => {
    if (unit.hitPoints <= 0) {
      return;
    }
    if (unit.player === playerId && unit.typeId === typeId) {
      count += 1;
    }
    for (const cargoUnit of unit.cargo ?? []) {
      visit(cargoUnit);
    }
  };
  for (const unit of world.units) {
    visit(unit);
  }
  return count;
}

function unitIdExistsIncludingCargo(world: WorldState, unitId: string): boolean {
  return world.units.some((unit) => unitIdExistsInUnitOrCargo(unit, unitId));
}

function unitIdExistsInUnitOrCargo(unit: WorldUnit, unitId: string): boolean {
  if (unit.hitPoints <= 0) {
    return false;
  }
  if (unit.id === unitId) {
    return true;
  }
  return unit.cargo?.some((cargoUnit) => unitIdExistsInUnitOrCargo(cargoUnit, unitId)) ?? false;
}

export function activeResearchLine(manifest: WargusManifest, world: WorldState, buildingId: string): string {
  const research = world.activeResearch.find((candidate) => candidate.buildingId === buildingId);
  return research ? `Research ${upgradeName(manifest, research.upgradeId)} ${Math.ceil(research.remainingSeconds)}s` : "";
}

export function productionStatusLine(manifest: WargusManifest, order: WorldUnit["productionQueue"][number]): string {
  const label = unitTypeName(manifest, order.unitTypeId);
  return order.remainingSeconds <= 0
    ? `Training ${label} ready`
    : `Training ${label} ${Math.ceil(order.remainingSeconds)}s`;
}

export function queuedMoveLine(unit: WorldUnit, world: WorldState): string {
  const queue = unit.moveQueue ?? [];
  if (queue.length === 0) {
    return "";
  }
  const attackMoves = queue.filter((order) => order.kind === "attack-move").length;
  const last = queue[queue.length - 1];
  const summary = attackMoves > 0 ? `${queue.length} queued, ${attackMoves} attack` : `${queue.length} queued`;
  return `Queue ${summary} to ${Math.round(last.x / world.tileSize)}, ${Math.round(last.y / world.tileSize)}`;
}

export function selectedRallyLine(unit: WorldUnit, world: WorldState): string {
  if (!unit.rallyPoint) {
    return "";
  }
  return `Rally ${Math.round(unit.rallyPoint.x / world.tileSize)}, ${Math.round(unit.rallyPoint.y / world.tileSize)}`;
}

export function cargoManifestLine(unit: WorldUnit): string {
  const counts = new Map<string, number>();
  for (const cargo of unit.cargo) {
    counts.set(cargo.name, (counts.get(cargo.name) ?? 0) + 1);
  }
  const manifest = [...counts.entries()]
    .map(([name, count]) => count > 1 ? `${count} ${name}` : name)
    .join(", ");
  return `Loaded ${manifest}`;
}

export function commandHint(unit: WorldUnit, world?: WorldState): string {
  return world ? sourceCommandHint(world, unit) ?? "Idle" : "Idle";
}

export function sourcePopupLines(command: SourcePopupCommand): string[] {
  const button = command.sourceButton;
  if (!button?.popupKind) {
    return [];
  }
  const lines = [
    button.popupHasHint ? sourceHintText(button.hint ?? command.label) : "",
    ...(button.popupHasDescription ? sourcePopupConditionalHints(button) : [])
  ].filter((line) => line.length > 0);
  return [...new Set(lines)].slice(0, 6);
}

export function sourcePopupConditionalHints(button: WargusButton): string[] {
  const conditionalHints = button.popupConditionalHints?.[button.action] ?? [];
  if (conditionalHints.length > 0) {
    return conditionalHints;
  }
  if ((button.popupActionHints?.length ?? 0) > 0 && !button.popupActionHints?.includes(button.action)) {
    return [];
  }
  return button.popupExtraHints ?? [];
}

export function sourceCommandStatusLineText(manifest: WargusManifest, command: SourcePopupCommand): string {
  const button = command.sourceButton;
  const hint = sourceHintText(button?.hint ?? command.label);
  const costs = button ? sourceStatusLineCostText(manifest, button) : "";
  return [hint, costs].filter((part) => part.length > 0).join(" ");
}

function sourceStatusLineCostText(manifest: WargusManifest, button: WargusButton): string {
  if (button.action === "train-unit" || button.action === "build" || button.action === "upgrade-to") {
    const unit = button.value ? manifest.units.find((candidate) => candidate.id === button.value) : null;
    return unit ? sourceCostListText(unit.costs) : "";
  }
  if (button.action === "research") {
    const upgrade = button.value ? manifest.upgrades.find((candidate) => candidate.id === button.value) : null;
    return upgrade ? sourceStructuredCostText(upgrade.costs) : "";
  }
  if (button.action === "cast-spell") {
    const spell = button.value ? manifest.spells.find((candidate) => candidate.id === button.value) : null;
    return spell && spell.manaCost > 0 ? `Mana ${spell.manaCost}` : "";
  }
  return "";
}

function sourceCostListText(costs: string[]): string {
  const parts: string[] = [];
  for (let index = 0; index + 1 < costs.length; index += 2) {
    const amount = Number(costs[index + 1]);
    if (Number.isFinite(amount) && amount > 0) {
      parts.push(`${sourceResourceCostLabel(costs[index])} ${amount}`);
    }
  }
  return parts.length > 0 ? `(${parts.join(", ")})` : "";
}

function sourceStructuredCostText(costs: { gold: number; wood: number; oil: number }): string {
  const parts = [
    costs.gold > 0 ? `Gold ${costs.gold}` : "",
    costs.wood > 0 ? `Wood ${costs.wood}` : "",
    costs.oil > 0 ? `Oil ${costs.oil}` : ""
  ].filter((part) => part.length > 0);
  return parts.length > 0 ? `(${parts.join(", ")})` : "";
}

function sourceResourceCostLabel(resource: string): string {
  return resource.length > 0 ? resource[0].toUpperCase() + resource.slice(1) : resource;
}

export function sourceHintText(text: string): string {
  return text
    .replaceAll("~!", "")
    .replaceAll("~<", "")
    .replaceAll("~>", "")
    .replace(/\s+/g, " ")
    .trim();
}

export function sourcePopupLabel(button: WargusButton | null | undefined): string | null {
  switch (button?.popupKind) {
    case "unit":
      return "Unit";
    case "building":
      return "Build";
    case "upgrade":
      return "Upg";
    case "commands":
      return "Cmd";
    default:
      return null;
  }
}

export function sourcePopupColor(button: WargusButton | null | undefined): number {
  if (button?.popupRace === "human") {
    if (button.popupKind === "unit") return 0x7fa6d8;
    if (button.popupKind === "building") return 0xd6a75a;
    if (button.popupKind === "upgrade") return 0xb58be0;
    return 0x8b7346;
  }
  if (button?.popupRace === "orc") {
    if (button.popupKind === "unit") return 0x9eb15c;
    if (button.popupKind === "building") return 0xc57955;
    if (button.popupKind === "upgrade") return 0xc09245;
    return 0x9f5c45;
  }
  if (button?.popupKind === "unit") return 0x7fa6d8;
  if (button?.popupKind === "building") return 0xd6a75a;
  if (button?.popupKind === "upgrade") return 0xb58be0;
  return 0x8b7346;
}

export function sourceCommandBorderColor(command: SourcePopupCommand, world: WorldState, selectedUnits: WorldUnit[]): number {
  return sourceSelectedCommandBorderColor(command, selectedUnits) ?? sourceAutoCastBorderColor(command, world, selectedUnits) ?? sourcePopupColor(command.sourceButton);
}

export function sourceSelectedCommandBorderColor(command: SourcePopupCommand, selectedUnits: WorldUnit[]): number | null {
  if (selectedUnits.length === 0) {
    return null;
  }
  if (!selectedUnits.every((unit) => sourceCommandSelectedForUnit(command, unit))) {
    return null;
  }
  return 0x00fc00;
}

export function sourceAutoCastBorderColor(command: SourcePopupCommand, world: WorldState, selectedUnits: WorldUnit[]): number | null {
  if (command.id === "repair" || command.sourceButton?.action === "repair") {
    if (selectedUnits.length === 0 || !selectedUnits.every((unit) => canToggleAutoRepair(unit) && unit.autoRepair)) {
      return null;
    }
    const color = world.engineSettings.autoCastBorderColorRgb;
    return color ? (color[0] << 16) + (color[1] << 8) + color[2] : 0x0000fc;
  }
  const spellId = command.sourceButton?.action === "cast-spell" ? command.sourceButton.value : command.id.startsWith("source-spell:") ? command.id.slice("source-spell:".length) : null;
  if (!spellId) {
    return null;
  }
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  if (!spell || spell.autocast.length === 0) {
    return null;
  }
  if (!selectedUnits.some((unit) => canToggleAutoCastSpell(world, unit, spellId) && isAutoCastSpellEnabled(unit, spellId))) {
    return null;
  }
  const color = world.engineSettings.autoCastBorderColorRgb;
  return color ? (color[0] << 16) + (color[1] << 8) + color[2] : 0x0000fc;
}

function sourceCommandSelectedForUnit(command: SourcePopupCommand, unit: WorldUnit): boolean {
  const action = command.sourceButton?.action ?? command.id;
  if (action === "move" || command.id === "move") {
    return unit.order?.kind === "move" || unit.order?.kind === "build" || unit.order?.kind === "follow" || unit.order?.kind === "defend";
  }
  if (action === "repair" || command.id === "repair") {
    return unit.order?.kind === "repair";
  }
  if (action === "stand-ground" || command.id === "hold-position") {
    return unit.order?.kind === "hold";
  }
  if (action === "patrol" || command.id === "patrol") {
    return unit.order?.kind === "patrol";
  }
  if (action === "attack" || command.id === "attack-move") {
    return unit.order?.kind === "attack-move" || unit.order?.kind === "attack";
  }
  if (action === "attack-ground" || command.id === "attack-ground") {
    return unit.order?.kind === "attack-ground";
  }
  if (action === "harvest" || action === "return-goods") {
    return unit.order?.kind === "harvest";
  }
  if (action === "unload" || command.id === "unload-transport") {
    return unit.order?.kind === "unload-transport";
  }
  return false;
}

export function sourcePopupStatTicks(button: WargusButton | null | undefined): number {
  if (!button?.popupKind) {
    return 0;
  }
  let ticks = button.popupShowsCosts ? 1 : 0;
  if ((button.popupVariables?.length ?? 0) > 0) {
    ticks += 1;
  }
  if (sourcePopupConditionalHints(button).length > 0) {
    ticks += 1;
  }
  return Math.min(3, ticks);
}

export function spellLabelForSourceSpell(world: WorldState, spellId: string): string {
  return spellName(world, spellId);
}

export function sourceSpellButtonLabel(world: WorldState, button: WargusButton & { value: string }): string {
  return sourceFullButtonLabel(button) ?? spellLabelForSourceSpell(world, button.value);
}

export function unitLabelForSourceTrain(world: WorldState, unitTypeId: string): string {
  return world.unitDefinitions.find((unit) => unit.id === unitTypeId)?.name ?? "Train";
}

export function sourceTrainButtonLabel(world: WorldState, button: WargusButton & { value: string }): string {
  return sourceUnitButtonLabel(world, button);
}

export function sourceUnitButtonLabel(world: WorldState, button: WargusButton & { value: string }): string {
  return sourceFullButtonLabel(button) ?? unitLabelForSourceTrain(world, button.value);
}

export function sourceUiTextColor(manifest: WargusManifest, world: WorldState, kind: "normal" | "reverse", fallback: string): string {
  const race = world.players.find((player) => player.id === world.visibilityPlayer)?.race === "orc" ? "orc" : "human";
  return sourceNamedTextColor(manifest, world.engineSettings.uiFontColors[race]?.[kind] ?? null) ?? fallback;
}

export function sourceNamedTextColor(manifest: WargusManifest, name: string | null): string | null {
  const palette = (manifest.fontColors ?? []).find((entry) => entry.id === name);
  const color = palette?.colors[1] ?? palette?.colors.find((entry) => entry.some((channel) => channel > 0));
  return color ? `#${color.map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0")).join("")}` : null;
}

export function colorNumberFromCss(color: string, fallback: number): number {
  const match = color.match(/^#([0-9a-f]{6})$/i);
  return match ? Number.parseInt(match[1], 16) : fallback;
}

export function sourceTextColorCss(manifest: WargusManifest, race: "human" | "orc" | string | null | undefined, kind: "normal" | "reverse", fallback: string): string {
  const key = race === "orc" ? "orc" : "human";
  return sourceNamedTextColor(manifest, manifest.engineSettings?.uiFontColors[key]?.[kind] ?? null) ?? fallback;
}

export function sourceTextPaletteId(manifest: WargusManifest, race: "human" | "orc" | string | null | undefined, kind: "normal" | "reverse"): string | null {
  const key = race === "orc" ? "orc" : "human";
  return manifest.engineSettings?.uiFontColors[key]?.[kind] ?? null;
}

export function sourceTextColorNumber(manifest: WargusManifest, race: "human" | "orc" | string | null | undefined, kind: "normal" | "reverse", fallback: number): number {
  return colorNumberFromCss(sourceTextColorCss(manifest, race, kind, `#${fallback.toString(16).padStart(6, "0")}`), fallback);
}

export function sourceMenuButtonGroup(world: WorldState, race: string | null | undefined): WargusMenuButtonGroup | null {
  const key = race === "orc" ? "orc" : "human";
  const group = world.engineSettings.menuButtons[key] ?? world.engineSettings.menuButtons.human ?? world.engineSettings.menuButtons.orc;
  return group ?? null;
}

export type SourceMenuButtonSlot = keyof WargusMenuButtonGroup;

export function sourceMenuButtonWidth(button: WargusMenuButtonLayout, style: WargusButtonStyle | null, slot: SourceMenuButtonSlot): number {
  return style?.size[0] && style.size[0] > 0 ? style.size[0] : Math.max(sourceMenuButtonFallbackWidth(slot), button.text.length * 7 + 18);
}

export function sourceMenuButtonHeight(_button: WargusMenuButtonLayout, style: WargusButtonStyle | null, slot: SourceMenuButtonSlot): number {
  return style?.size[1] && style.size[1] > 0 ? style.size[1] : sourceMenuButtonFallbackHeight(slot);
}

function sourceMenuButtonFallbackWidth(slot: SourceMenuButtonSlot): number {
  return slot === "menu" ? 88 : 76;
}

function sourceMenuButtonFallbackHeight(slot: SourceMenuButtonSlot): number {
  return slot === "menu" ? 22 : 20;
}

export function sourceMenuButtonFontSize(style: WargusButtonStyle | null): number {
  return style?.font === "large" ? 14 : 11;
}

export function sourceMenuTextAnchor(style: WargusButtonStyle | null): number {
  return style?.textAlign === "Left" ? 0 : style?.textAlign === "Right" ? 1 : 0.5;
}

export function sourceMenuTextX(width: number, style: WargusButtonStyle | null): number {
  return style?.textPos[0] && style.textPos[0] > 0 ? style.textPos[0] : width / 2;
}

export function sourceMenuTextY(style: WargusButtonStyle | null): number {
  return style?.textPos[1] ?? 4;
}

export function sourceMenuButtonPalette(manifest: WargusManifest, style: string, sourceStyle: WargusButtonStyle | null): { fill: number; stroke: number; text: string } {
  void style;
  const text = sourceNamedTextColor(manifest, sourceStyle?.textNormalColor ?? null) ?? "#f0df9a";
  if (sourceStyle?.race === "orc") {
    return { fill: 0x25150f, stroke: 0x9a5d31, text };
  }
  return { fill: 0x19212a, stroke: 0x8b7346, text };
}

export function sourceMessageLineHeight(statusLineHeight: number, messageUi: WargusMessageUiLayout | null): number {
  const scrollSpeed = Math.max(1, Math.floor(messageUi?.scrollSpeed ?? 5));
  return Math.max(statusLineHeight, 13 + scrollSpeed);
}

export function sourceMessageScrollOffset(message: Pick<{ createdAt: number }, "createdAt">, now: number, lineHeight: number, messageUi: WargusMessageUiLayout | null): number {
  const scrollSpeed = Math.max(0, messageUi?.scrollSpeed ?? 5);
  if (scrollSpeed <= 0) {
    return 0;
  }
  const ageSeconds = Math.max(0, (now - message.createdAt) / 1000);
  return Math.max(0, lineHeight - ageSeconds * scrollSpeed);
}

export function sourceStatusLineLayout(screen: { width: number; height: number }, sideWidth: number, layout: WargusStatusLineLayout | null): { x: number; y: number; width: number; lineHeight: number } {
  const sourceLayout = layout ?? {
    textX: 178,
    textYFromBottom: 14,
    widthLeft: 194,
    widthRightMargin: 16,
    font: "game"
  };
  const playableWidth = Math.max(220, screen.width - sideWidth);
  const scale = Math.max(0.75, Math.min(1.35, playableWidth / 640));
  const x = Math.max(12, Math.min(screen.width - sideWidth - 80, sourceLayout.textX * scale));
  const width = Math.max(180, screen.width - sideWidth - x - sourceLayout.widthRightMargin * scale);
  const y = Math.max(12, screen.height - sourceLayout.textYFromBottom * scale - 18);
  return {
    x,
    y,
    width,
    lineHeight: Math.max(16, Math.round(18 * scale))
  };
}

export function sourceInfoPanelLayout(layout: WargusInfoPanelLayout | null, x: number, y: number, width: number): {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  buttonSize: number;
  selectedSlots: WargusPanelButtonSlot[];
  trainingSlots: WargusPanelButtonSlot[];
  researching: WargusPanelButtonSlot | null;
  transportingSlots: WargusPanelButtonSlot[];
} {
  const sourceLayout = layout ?? {
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
    transportingSlots: [{ slot: 0, x: 9, y: 227 }]
  };
  const scale = Math.min(1, Math.max(0.66, width / Math.max(1, sourceLayout.width)));
  return {
    x,
    y,
    width,
    height: Math.max(78, sourceLayout.height * scale),
    scale,
    buttonSize: Math.max(30, Math.round(46 * scale)),
    selectedSlots: sourceLayout.selectedSlots,
    trainingSlots: sourceLayout.trainingSlots,
    researching: sourceLayout.researching,
    transportingSlots: sourceLayout.transportingSlots
  };
}

export function sourceInfoPanelSlot(layout: WargusInfoPanelLayout | null, slot: WargusPanelButtonSlot | null, x: number, y: number, width: number, fallbackSize: number): { x: number; y: number; size: number } {
  if (!layout || !slot) {
    return { x, y, size: fallbackSize };
  }
  const sourceLayout = sourceInfoPanelLayout(layout, x, y, width);
  return {
    x: sourceLayout.x + slot.x * sourceLayout.scale,
    y: sourceLayout.y + slot.y * sourceLayout.scale,
    size: sourceLayout.buttonSize
  };
}

export function sourceMinimapLayout(world: WorldState, panelLeft: number, panelWidth: number, screenHeight: number): { x: number; y: number; width: number; height: number } {
  const source = world.engineSettings.minimap;
  if (!source) {
    return { x: panelLeft + 18, y: screenHeight - 170, width: panelWidth - 36, height: 132 };
  }
  const scale = Math.min(1.35, Math.max(0.72, panelWidth / 176));
  return {
    x: panelLeft + source.x * scale,
    y: Math.min(screenHeight - source.height * scale - 12, source.y * scale),
    width: source.width * scale,
    height: source.height * scale
  };
}

export function sourceMapViewportSize(world: WorldState, screenWidth: number, screenHeight: number, sideWidth: number): { width: number; height: number } {
  return sourcePlayableViewportSize({ width: screenWidth, height: screenHeight }, world) ?? { width: Math.max(0, screenWidth - sideWidth), height: screenHeight };
}

export interface SourceViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SourceViewportScreenPoint {
  index: number;
  rect: SourceViewportRect;
  worldPoint: { x: number; y: number };
}

export function sourceViewportModeLabel(mode: number): string {
  switch (sourceViewportModeNumber(mode)) {
    case 1:
      return "split horizontal";
    case 2:
      return "split three";
    case 3:
      return "split vertical";
    case 4:
      return "quad";
    default:
      return "single";
  }
}

export function nextSourceViewportMode(mode: number, step = 1): number {
  return (sourceViewportModeNumber(mode) + step + 5) % 5;
}

export function sourceViewportModeRects(world: WorldState, screenWidth: number, screenHeight: number): SourceViewportRect[] {
  const mapArea = sourceMapAreaRect(world, screenWidth, screenHeight);
  const halfWidth = Math.floor(mapArea.width / 2);
  const halfHeight = Math.floor(mapArea.height / 2);
  switch (sourceViewportModeNumber(world.engineSettings.viewportModeDefault)) {
    case 1:
      return [
        { x: mapArea.x, y: mapArea.y, width: mapArea.width, height: halfHeight },
        { x: mapArea.x, y: mapArea.y + halfHeight, width: mapArea.width, height: mapArea.height - halfHeight }
      ];
    case 2:
      return [
        { x: mapArea.x, y: mapArea.y, width: mapArea.width, height: halfHeight },
        { x: mapArea.x, y: mapArea.y + halfHeight, width: halfWidth, height: mapArea.height - halfHeight },
        { x: mapArea.x + halfWidth, y: mapArea.y + halfHeight, width: mapArea.width - halfWidth, height: mapArea.height - halfHeight }
      ];
    case 3:
      return [
        { x: mapArea.x, y: mapArea.y, width: halfWidth, height: mapArea.height },
        { x: mapArea.x + halfWidth, y: mapArea.y, width: mapArea.width - halfWidth, height: mapArea.height }
      ];
    case 4:
      return [
        { x: mapArea.x, y: mapArea.y, width: halfWidth, height: halfHeight },
        { x: mapArea.x + halfWidth, y: mapArea.y, width: mapArea.width - halfWidth, height: halfHeight },
        { x: mapArea.x, y: mapArea.y + halfHeight, width: halfWidth, height: mapArea.height - halfHeight },
        { x: mapArea.x + halfWidth, y: mapArea.y + halfHeight, width: mapArea.width - halfWidth, height: mapArea.height - halfHeight }
      ];
    default:
      return [mapArea];
  }
}

export function sourceViewportWorldRects(world: WorldState, camera: Camera, screenWidth: number, screenHeight: number, viewportCameras: readonly Camera[] = []): SourceViewportRect[] {
  return sourceViewportModeRects(world, screenWidth, screenHeight).map((rect, index) => {
    const viewCamera = viewportCameras[index] ?? camera;
    return {
      x: viewCamera.x,
      y: viewCamera.y,
      width: rect.width / viewCamera.zoom,
      height: rect.height / viewCamera.zoom
    };
  });
}

export function sourceWorldPointForViewportScreenPoint(
  world: WorldState,
  camera: Camera,
  screenWidth: number,
  screenHeight: number,
  screenX: number,
  screenY: number
): { x: number; y: number } | null {
  return sourceViewportScreenPoint(world, camera, screenWidth, screenHeight, screenX, screenY)?.worldPoint ?? null;
}

export function sourceViewportScreenPoint(
  world: WorldState,
  camera: Camera,
  screenWidth: number,
  screenHeight: number,
  screenX: number,
  screenY: number
): SourceViewportScreenPoint | null {
  const viewports = sourceViewportModeRects(world, screenWidth, screenHeight);
  const index = viewports.findIndex((rect) => screenX >= rect.x && screenY >= rect.y && screenX < rect.x + rect.width && screenY < rect.y + rect.height);
  if (index < 0) {
    return null;
  }
  const rect = viewports[index];
  if (!rect) {
    return null;
  }
  return {
    index,
    rect,
    worldPoint: {
      x: camera.x + (screenX - rect.x) / camera.zoom,
      y: camera.y + (screenY - rect.y) / camera.zoom
    }
  };
}

export function sourceScreenPointIsInViewport(
  world: WorldState,
  screenWidth: number,
  screenHeight: number,
  screenX: number,
  screenY: number
): boolean {
  return sourceViewportScreenPoint(world, { x: 0, y: 0, zoom: 1 }, screenWidth, screenHeight, screenX, screenY) !== null;
}

export function sourceScreenPointForViewportWorldPoint(
  world: WorldState,
  camera: Camera,
  screenWidth: number,
  screenHeight: number,
  worldX: number,
  worldY: number,
  viewportIndex = 0
): { x: number; y: number } | null {
  const viewports = sourceViewportModeRects(world, screenWidth, screenHeight);
  const viewport = viewports[viewportIndex] ?? viewports[0];
  if (!viewport) {
    return null;
  }
  const screenX = viewport.x + (worldX - camera.x) * camera.zoom;
  const screenY = viewport.y + (worldY - camera.y) * camera.zoom;
  const visible = screenX >= viewport.x && screenY >= viewport.y && screenX < viewport.x + viewport.width && screenY < viewport.y + viewport.height;
  return visible ? { x: screenX, y: screenY } : null;
}

export function sourceMapAreaRect(world: WorldState, screenWidth: number, screenHeight: number): SourceViewportRect {
  if (world.engineSettings.bigScreenDefault) {
    return { x: 0, y: 0, width: screenWidth, height: screenHeight };
  }
  const source = world.engineSettings.mapArea;
  const size = sourcePlayableViewportSize({ width: screenWidth, height: screenHeight }, world);
  if (!source) {
    return { x: 0, y: 0, width: size.width, height: size.height };
  }
  const baseWidth = Math.max(1, world.engineSettings.videoWidthDefault || source.baseWidth);
  const baseHeight = Math.max(1, world.engineSettings.videoHeightDefault || source.baseHeight);
  return {
    x: source.x * (screenWidth / baseWidth),
    y: source.y * (screenHeight / baseHeight),
    width: size.width,
    height: size.height
  };
}

function sourceViewportModeNumber(mode: number): number {
  return Number.isFinite(mode) ? ((Math.floor(mode) % 5) + 5) % 5 : 0;
}

export function sourceCompletedBarColor(world: WorldState): number {
  const color = world.engineSettings.completedBarColorRgb;
  return color ? (color[0] << 16) + (color[1] << 8) + color[2] : 0x306404;
}

export function sourceCompletedBarShadow(world: WorldState): boolean {
  return world.engineSettings.completedBarShadow === true;
}

export function sourcePlayerColor(world: WorldState, playerId: number, shadeIndex = 0, fallback: [number, number, number] = [192, 192, 192]): number {
  const colors = world.engineSettings.playerColors;
  const color = colors[playerId % Math.max(1, colors.length)];
  const shadeCount = sourcePlayerColorShadeCount(world, color?.shades.length ?? 0);
  const shade = color?.shades[Math.max(0, Math.min(shadeIndex, shadeCount - 1))] ?? fallback;
  return rgbToHex(shade);
}

function sourcePlayerColorShadeCount(world: WorldState, availableShades: number): number {
  const sourceCount = world.engineSettings.playerColorIndex?.count;
  if (typeof sourceCount !== "number" || !Number.isFinite(sourceCount) || sourceCount <= 0) {
    return Math.max(1, availableShades);
  }
  return Math.max(1, Math.min(Math.floor(sourceCount), Math.max(1, availableShades)));
}

export function rgbToHex(color: [number, number, number]): number {
  return ((color[0] & 255) << 16) | ((color[1] & 255) << 8) | (color[2] & 255);
}

export function fogByteToAlpha(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value) / 255));
}

export function sourceMenuOverlayLines(
  menu: SourceMenuOverlayId,
  world: WorldState,
  manifest: WargusManifest | null,
  paused: boolean,
  gameSpeed: number,
  activeSaveSlot: number,
  activeSaveSummary: SourceSavedSummaryTime | null,
  autosaveSummary: SourceSavedSummaryTime | null,
  diplomacyDraft: SourceDiplomacyDraft | null = null
): string[] {
  if (menu === "main-menu") {
    return ["Battle paused.", "Choose a Wargus in-game menu action.", "F11 opens Save Game. F12 opens Load Game."];
  }
  if (menu === "help-menu") {
    return [
      sourceGameIdentityLine(world),
      world.engineSettings.gameCopyright ?? "",
      `License: ${world.engineSettings.gameLicense ?? "unknown"}  ${world.engineSettings.gameHomepage ?? ""}`.trim(),
      "Choose Keystroke Help for the source hotkey list or Tips for the Wargus gameplay tips.",
      "F10 or Alt+M opens the game menu. F11 saves. F12 loads. Space pauses."
    ].filter((line) => line.length > 0);
  }
  if (menu === "keystroke-help") {
    return sourceKeystrokeHelpLines();
  }
  if (menu === "tips") {
    return sourceTipsMenuLines(manifest, world);
  }
  if (menu === "objectives") {
    return world.objectives.length > 0
      ? world.objectives.map((objective, index) => `${index + 1}. ${objective}`)
      : ["No mission objectives are defined for this map."];
  }
  if (menu === "game-options") {
    return [`State: ${paused ? "Paused" : "Running"}`, `Save slot: ${activeSaveSlot}${activeSaveSummary ? ` (${sourceShortTime(activeSaveSummary.savedAt)})` : " (empty)"}`, autosaveSummary ? `Autosave: ${sourceShortTime(autosaveSummary.savedAt)}` : "Autosave: empty", `Autosave cadence: ${world.engineSettings.autosaveMinutesDefault > 0 ? `${Math.floor(world.engineSettings.autosaveMinutesDefault)} min` : "disabled"}`];
  }
  if (menu === "save-menu") {
    return [
      `Slot ${activeSaveSlot}: ${activeSaveSummary ? sourceSaveTitle(activeSaveSummary) : "empty"}`,
      "Use Slot to select a browser save slot.",
      "Save writes the current game to the selected slot.",
      "Export downloads a portable .json save file."
    ];
  }
  if (menu === "load-menu") {
    return [
      `Slot ${activeSaveSlot}: ${activeSaveSummary ? sourceSaveTitle(activeSaveSummary) : "empty"}`,
      autosaveSummary ? `Autosave: ${sourceSaveTitle(autosaveSummary)}` : "Autosave: empty",
      "Use Slot to select a browser save slot.",
      "Load starts the selected saved game.",
      "Import opens a portable .json save file."
    ];
  }
  if (menu === "speed-options") {
    return [`Current speed: ${sourceGameSpeedLabel(gameSpeed, world)}`, `Saved GameSpeed: ${Math.round(world.engineSettings.sourceGameSpeedDefault)} source ticks/sec`, `AI difficulty: ${sourceAiDifficultyLabel(world.engineSettings.lastDifficultyDefault)}`, "Source options range: 15..75 game cycles", "The browser simulation stays fixed-step while source speed and AI difficulty settings change."];
  }
  if (menu === "sound-options") {
    return [`Effects: ${world.engineSettings.effectsEnabledDefault ? "enabled" : "disabled"} at ${world.engineSettings.effectsVolumeDefault}`, `Music: ${world.engineSettings.musicEnabledDefault ? "enabled" : "disabled"} at ${world.engineSettings.musicVolumeDefault}`, `Stereo sound: ${world.engineSettings.stereoSoundDefault ? "enabled" : "disabled"}`];
  }
  if (menu === "preferences") {
    return [
      `Messages: ${world.engineSettings.showMessagesDefault ? "shown" : "hidden"}`,
      `Command keys: ${world.engineSettings.showCommandKeyDefault ? "shown" : "hidden"}`,
      `Button popups: ${world.engineSettings.showButtonPopupsDefault ? "shown" : "hidden"}`,
      `Status hints: ${world.engineSettings.noStatusLineTooltipsDefault ? "hidden" : "shown"}`,
      `Map grid: ${world.engineSettings.mapGridDefault ? "shown" : "hidden"}`,
      `Order paths: ${world.engineSettings.showOrdersDefault ? "shown" : "hidden"}`,
      `Damage pips: ${world.engineSettings.showDamageDefault ? "shown" : "hidden"}`,
      `Sight range: ${world.engineSettings.showSightRangeDefault ? "shown" : "hidden"}`,
      `Attack range: ${world.engineSettings.showAttackRangeDefault ? "shown" : "hidden"}`,
      `Reaction range: ${world.engineSettings.showReactionRangeDefault ? "shown" : "hidden"}`,
      `Single-player walls: ${sourceDebugFlagEnabled(world, "single-player-walls") ? "enabled" : "disabled"}`,
      `Passability: ${world.engineSettings.highlightPassabilityDefault ? "shown" : "hidden"}`,
      `Minimap terrain: ${world.engineSettings.minimapWithTerrainDefault ? "shown" : "hidden"}`,
      `Mine notices: ${world.engineSettings.mineNotificationsDefault ? "enabled" : "disabled"}`,
      `Title tips: ${world.engineSettings.showTipsDefault ? `shown (#${Math.max(1, Math.floor(world.engineSettings.tipNumberDefault || 1))})` : "hidden"}`,
      `Keyboard scroll: ${world.engineSettings.enableKeyboardScrollingDefault ? "enabled" : "disabled"}`,
      `Mouse scroll: ${world.engineSettings.enableMouseScrollingDefault ? "enabled" : "disabled"}`,
      `Group keys: ${world.engineSettings.groupKeysDefault}`,
      `Key scroll speed: ${Math.round(world.engineSettings.keyScrollSpeedDefault)}`,
      `Mouse edge speed: ${Math.round(world.engineSettings.mouseScrollSpeedDefault)}`,
      `Mouse pressed speed: ${Math.round(world.engineSettings.mouseScrollSpeedPressedDefault)}`,
      `Mouse control speed: ${Math.round(world.engineSettings.mouseScrollSpeedControlDefault)}`,
      `Fast-forward cycle: ${Math.round(world.engineSettings.fastForwardCycleDefault)}`,
      `Frame skip mask: ${Math.round(world.engineSettings.frameSkipDefault)}`,
      `Formation move: ${world.engineSettings.formationMovementDefault ? "enabled" : "disabled"}`,
      `Big map: ${world.engineSettings.bigScreenDefault ? "enabled" : "disabled"}`,
      `Keep ratio: ${world.engineSettings.keepRatioDefault ? "enabled" : "disabled"}`,
      `Ally depots: ${world.engineSettings.allyDepositsAllowedDefault ? "enabled" : "disabled"}`,
      `AI dependencies: ${world.engineSettings.aiChecksDependenciesDefault ? "checked" : "ignored"}`,
      `AI explores: ${world.engineSettings.aiExploresDefault ? "enabled" : "disabled"}`,
      `Inside mode: ${world.engineSettings.insideDefault ? "enabled" : "disabled"}`,
      `Player name: ${world.engineSettings.playerNameDefault ?? sourcePlayerDisplayName(world.players.find((player) => player.id === world.visibilityPlayer) ?? { id: world.visibilityPlayer })}`,
      `Fullscreen: ${world.engineSettings.videoFullScreenDefault ? "enabled" : "disabled"}`,
      `Video size: ${sourceVideoSizeLabel(world)}`,
      `Grab mouse: ${world.engineSettings.grabMouseDefault ? "enabled" : "disabled"}`,
      `Hardware cursor: ${world.engineSettings.hardwareCursorDefault ? "enabled" : "disabled"}`,
      `Icon shift: ${world.engineSettings.iconsShiftDefault ? "enabled" : "disabled"}`,
      `Grayscale icons: ${world.engineSettings.grayscaleIconsDefault ? "enabled" : "disabled"}`,
      `Video shader: ${sourceVideoShaderLabel(world.engineSettings.videoShaderDefault)}`,
      `Viewport: ${sourceViewportModeLabel(world.engineSettings.viewportModeDefault)}`,
      `Race: ${sourceRaceDisplayName(world, world.players.find((player) => player.id === world.visibilityPlayer)?.race)}`,
      `Right button: ${world.engineSettings.rightButtonAction === "attack" ? "attack-move" : "smart move"}`,
      `Deselect in mines: ${world.engineSettings.deselectInMineDefault ? "enabled" : "disabled"}`,
      `Simple targeting: ${world.engineSettings.simplifiedAutoTargetingDefault ? "enabled" : "disabled"}`,
      `Fancy buildings: ${world.engineSettings.useFancyBuildingsDefault ? "enabled" : "disabled"}`,
      `Enhanced effects: ${world.engineSettings.enhancedEffectsDefault ? "enabled" : "disabled"}`,
      `Pause on leave: ${world.engineSettings.pauseOnLeaveDefault ? "enabled" : "disabled"}`,
      `Stop scroll on leave: ${world.engineSettings.leaveStopScrollingDefault ? "enabled" : "disabled"}`,
      `Training queue: ${world.engineSettings.trainingQueue ? "enabled" : "disabled"}`,
      `Selection style: ${sourceSelectionStyleLabel(world.engineSettings.selectionStyleDefault)}`,
      `Double click: ${Math.round(world.engineSettings.doubleClickDelayMsDefault)}ms`,
      `Hold click: ${Math.round(world.engineSettings.holdClickDelayMsDefault)}ms`
    ];
  }
  if (menu === "diplomacy") {
    const rows = diplomacyDraft?.rows ?? sourceDiplomacyRowsFromWorld(world);
    return [
      "Player                  Allied  Enemy  Shared Vision",
      ...rows.map((row) => `${sourceDiplomacyRowName(row).padEnd(23, " ")} ${sourceCheckBoxLabel(row.allied, row.locked).padEnd(7, " ")} ${sourceCheckBoxLabel(row.enemy, row.locked).padEnd(6, " ")} ${sourceCheckBoxLabel(row.sharedVision, row.locked)}${row.locked ? " locked" : ""}`)
    ];
  }
  if (menu === "end-scenario") {
    return ["End the current scenario using the source Wargus in-game flow.", "Restart reloads this map. Surrender records a defeat result."];
  }
  if (menu === "restart-confirm") {
    return ["Are you sure you", "want to restart", "the scenario?"];
  }
  if (menu === "surrender-confirm") {
    return ["Are you sure you", "want to withdraw", "from the battle?"];
  }
  if (menu === "quit-to-menu") {
    return ["Are you sure you", "want to quit to", "the main menu?", "The current battle will stay autosaved."];
  }
  return ["Are you sure you", "want to exit", "the browser Wargus session?", "The current battle has been autosaved."];
}

function sourceKeystrokeHelpLines(): string[] {
  const rows: string[] = [];
  for (let index = 0; index < SOURCE_KEYSTROKE_HELP.length; index += 2) {
    const left = sourceKeystrokeHelpCell(SOURCE_KEYSTROKE_HELP[index]);
    const right = sourceKeystrokeHelpCell(SOURCE_KEYSTROKE_HELP[index + 1]);
    rows.push(right ? `${left}    ${right}` : left);
  }
  return rows;
}

function sourceKeystrokeHelpCell(entry: [string, string] | undefined): string {
  if (!entry) {
    return "";
  }
  return `${entry[0].padEnd(11, " ")} - ${entry[1]}`.padEnd(38, " ");
}

function sourceTipsMenuLines(manifest: WargusManifest | null, world: Pick<WorldState, "engineSettings">): string[] {
  const tips = manifest?.titleTips ?? [];
  if (tips.length === 0) {
    return ["No Wargus tips are defined."];
  }
  const sourceIndex = Math.floor(world.engineSettings.tipNumberDefault || 1);
  const index = sourceIndex > 0 ? (sourceIndex - 1) % tips.length : 0;
  const tip = tips[index]?.text ?? "";
  return [
    `Tip ${index + 1} of ${tips.length}`,
    tip,
    `Show tips at startup: ${world.engineSettings.showTipsDefault ? "enabled" : "disabled"}`
  ];
}

export function sourceMenuOverlayTitle(menu: SourceMenuOverlayId): string {
  switch (menu) {
    case "main-menu":
      return "Game Menu";
    case "help-menu":
      return "Help";
    case "keystroke-help":
      return "Keystroke Help";
    case "tips":
      return "Tips";
    case "objectives":
      return "Objectives";
    case "game-options":
      return "Game Options";
    case "speed-options":
      return "Game Speed";
    case "sound-options":
      return "Sound Options";
    case "preferences":
      return "Preferences";
    case "save-menu":
      return "Save Game";
    case "load-menu":
      return "Load Game";
    case "diplomacy":
      return "Diplomacy";
    case "end-scenario":
      return "End Scenario";
    case "restart-confirm":
      return "Restart Scenario";
    case "surrender-confirm":
      return "Surrender";
    case "quit-to-menu":
      return "Quit Battle";
    case "exit-game":
      return "Exit";
  }
}

export function sourceMenuOverlayButtons(menu: SourceMenuOverlayId, world: WorldState, diplomacyDraft: SourceDiplomacyDraft | null = null): SourceMenuOverlayButton[] {
  if (menu === "main-menu") {
    return [
      { label: "Save", command: "save-menu" },
      { label: "Load", command: "load-menu" },
      { label: "Options", command: "game-options" },
      { label: "Help", command: "help-menu" },
      { label: "Objectives", command: "objectives" },
      { label: "End", command: "end-scenario" },
      { label: "Map List", command: "choose-map" },
      { label: "Resume", command: "toggle-pause" }
    ];
  }
  if (menu === "help-menu") {
    return [
      { label: "Keys", command: "keystroke-help" },
      { label: "Tips", command: "tips" },
      { label: "Resume", command: "toggle-pause" }
    ];
  }
  if (menu === "keystroke-help") {
    return [
      { label: "Help", command: "help-menu" },
      { label: "Resume", command: "toggle-pause" }
    ];
  }
  if (menu === "tips") {
    return [
      { label: "Next Tip", command: "next-title-tip" },
      { label: "Show Tips", command: "toggle-show-tips" },
      { label: "Help", command: "help-menu" },
      { label: "Resume", command: "toggle-pause" }
    ];
  }
  if (menu === "objectives") {
    return [
      { label: "Options", command: "game-options" },
      { label: "Resume", command: "toggle-pause" }
    ];
  }
  if (menu === "speed-options") {
    return [
      { label: "Slower", command: "slower-game" },
      { label: "Faster", command: "faster-game" },
      { label: "Easier AI", command: "easier-ai" },
      { label: "Harder AI", command: "harder-ai" },
      { label: "OK", command: "speed-options-ok" },
      { label: "Cancel", command: "speed-options-cancel" }
    ];
  }
  if (menu === "game-options") {
    return [
      { label: "Save", command: "save-menu" },
      { label: "Load", command: "load-menu" },
      { label: "Objectives", command: "objectives" },
      { label: "Speed", command: "speed-options" },
      { label: "Sound", command: "sound-options" },
      { label: "Prefs", command: "preferences" },
      { label: "Diplomacy", command: "diplomacy" },
      { label: "End", command: "end-scenario" },
      { label: "Resume", command: "toggle-pause" }
    ];
  }
  if (menu === "save-menu") {
    return [
      { label: "Slot", command: "next-save-slot" },
      { label: "Save", command: "save-game" },
      { label: "Export", command: "export-save" },
      { label: "Options", command: "game-options" },
      { label: "Cancel", command: "game-options" }
    ];
  }
  if (menu === "load-menu") {
    return [
      { label: "Slot", command: "next-save-slot" },
      { label: "Load", command: "load-game" },
      { label: "Autosave", command: "load-autosave" },
      { label: "Import", command: "import-save" },
      { label: "Options", command: "game-options" },
      { label: "Cancel", command: "game-options" }
    ];
  }
  if (menu === "preferences") {
    return [
      { label: "Messages", command: "toggle-messages" },
      { label: "Hotkeys", command: "toggle-command-keys" },
      { label: "Popups", command: "toggle-button-popups" },
      { label: "Status Hints", command: "toggle-status-line-tooltips" },
      { label: "Grid", command: "toggle-map-grid" },
      { label: "Orders", command: "toggle-show-orders" },
      { label: "Damage", command: "toggle-show-damage" },
      { label: "Sight", command: "toggle-show-sight-range" },
      { label: "Attack", command: "toggle-show-attack-range" },
      { label: "Reaction", command: "toggle-show-reaction-range" },
      { label: "Walls", command: "toggle-single-player-walls" },
      { label: "Passable", command: "toggle-highlight-passability" },
      { label: "Terrain", command: "toggle-minimap-terrain" },
      { label: "Mines", command: "toggle-mine-notifications" },
      { label: "Tips", command: "toggle-show-tips" },
      { label: "Next Tip", command: "next-title-tip" },
      { label: "Key Scroll", command: "toggle-keyboard-scrolling" },
      { label: "Mouse Scroll", command: "toggle-mouse-scrolling" },
      { label: "Group Keys", command: "cycle-group-keys" },
      { label: "Key Spd -", command: "key-scroll-speed-down" },
      { label: "Key Spd +", command: "key-scroll-speed-up" },
      { label: "Edge Spd -", command: "mouse-scroll-speed-down" },
      { label: "Edge Spd +", command: "mouse-scroll-speed-up" },
      { label: "Press Spd -", command: "mouse-pressed-scroll-speed-down" },
      { label: "Press Spd +", command: "mouse-pressed-scroll-speed-up" },
      { label: "Ctrl Spd -", command: "mouse-control-scroll-speed-down" },
      { label: "Ctrl Spd +", command: "mouse-control-scroll-speed-up" },
      { label: "Fast -", command: "fast-forward-cycle-down" },
      { label: "Fast +", command: "fast-forward-cycle-up" },
      { label: "Frame -", command: "frame-skip-down" },
      { label: "Frame +", command: "frame-skip-up" },
      { label: "Formation", command: "toggle-formation-movement" },
      { label: "Big Map", command: "toggle-big-screen" },
      { label: "Keep Ratio", command: "toggle-keep-ratio" },
      { label: "Ally Depots", command: "toggle-ally-deposits" },
      { label: "AI Deps", command: "toggle-ai-dependencies" },
      { label: "AI Explore", command: "toggle-ai-explores" },
      { label: "Inside", command: "toggle-inside-mode" },
      { label: "Player Name", command: "edit-player-name" },
      { label: "Fullscreen", command: "toggle-fullscreen" },
      { label: "Video -", command: "video-size-down" },
      { label: "Video +", command: "video-size-up" },
      { label: "Grab Mouse", command: "toggle-grab-mouse" },
      { label: "HW Cursor", command: "toggle-hardware-cursor" },
      { label: "Icon Shift", command: "toggle-icon-shift" },
      { label: "Gray Icons", command: "toggle-grayscale-icons" },
      { label: "Shader", command: "toggle-video-shader" },
      { label: "Viewport", command: "cycle-viewport-mode" },
      { label: "Right Btn", command: "toggle-right-button-action" },
      { label: "Deselect", command: "toggle-deselect-in-mine" },
      { label: "Targeting", command: "toggle-simplified-auto-targeting" },
      { label: "Buildings", command: "toggle-fancy-buildings" },
      { label: "Visual FX", command: "toggle-enhanced-effects" },
      { label: "Leave Pause", command: "toggle-pause-on-leave" },
      { label: "Leave Stop", command: "toggle-leave-stop-scrolling" },
      { label: "Queue", command: "toggle-training-queue" },
      { label: "Selection", command: "cycle-selection-style" },
      { label: "Double -", command: "double-click-delay-down" },
      { label: "Double +", command: "double-click-delay-up" },
      { label: "Hold -", command: "hold-click-delay-down" },
      { label: "Hold +", command: "hold-click-delay-up" },
      { label: "OK", command: "preferences-ok" },
      { label: "Cancel", command: "preferences-cancel" }
    ];
  }
  if (menu === "sound-options") {
    return [
      { label: "Effects", command: "toggle-effects" },
      { label: "Music", command: "toggle-music" },
      { label: "Stereo", command: "toggle-stereo" },
      { label: "FX -", command: "effects-volume-down" },
      { label: "FX +", command: "effects-volume-up" },
      { label: "Music +", command: "music-volume-up" },
      { label: "Music -", command: "music-volume-down" },
      { label: "OK", command: "sound-options-ok" },
      { label: "Cancel", command: "sound-options-cancel" }
    ];
  }
  if (menu === "diplomacy") {
    const rows = diplomacyDraft?.rows ?? sourceDiplomacyRowsFromWorld(world);
    const playerButtons = rows
      .flatMap((row) => [
        {
          label: `${sourceDiplomacyShortName(row)} Ally`,
          command: `diplomacy-ally-${row.player}`,
          disabled: row.locked
        },
        {
          label: `${sourceDiplomacyShortName(row)} Enemy`,
          command: `diplomacy-enemy-${row.player}`,
          disabled: row.locked
        },
        {
          label: `${sourceDiplomacyShortName(row)} Vision`,
          command: `diplomacy-vision-${row.player}`,
          disabled: row.locked
        }
      ]);
    return playerButtons.length > 0
      ? [...playerButtons, { label: "OK", command: "diplomacy-ok" }, { label: "Cancel", command: "diplomacy-cancel" }]
      : [{ label: "Cancel", command: "diplomacy-cancel" }];
  }
  if (menu === "end-scenario") {
    return [
      { label: "Restart", command: "restart-confirm" },
      { label: "Surrender", command: "surrender-confirm" },
      { label: "Quit", command: "quit-to-menu" },
      { label: "Exit", command: "exit-game" },
      { label: "Resume", command: "toggle-pause" }
    ];
  }
  if (menu === "restart-confirm") {
    return [
      { label: "Restart", command: "restart-map" },
      { label: "Cancel", command: "end-scenario" }
    ];
  }
  if (menu === "surrender-confirm") {
    return [
      { label: "Surrender", command: "surrender" },
      { label: "Cancel", command: "end-scenario" }
    ];
  }
  if (menu === "quit-to-menu") {
    return [
      { label: "Map List", command: "choose-map" },
      { label: "Resume", command: "toggle-pause" }
    ];
  }
  return [{ label: "Resume", command: "toggle-pause" }];
}

export function sourceDiplomacyState(world: WorldState, player: number, otherPlayer: number): "allied" | "enemy" | "neutral" {
  return world.diplomacy.find((rule) => rule.player === player && rule.otherPlayer === otherPlayer)?.state ?? "enemy";
}

function sourceDiplomacyRowsFromWorld(world: WorldState): SourceDiplomacyDraftRow[] {
  return world.players
    .filter((player) => player.id !== world.visibilityPlayer && player.id !== 15 && player.playerType !== "nobody")
    .map((player) => {
      const state = sourceDiplomacyState(world, world.visibilityPlayer, player.id);
      return {
        player: player.id,
        name: sourcePlayerDisplayName(player),
        playerType: player.playerType,
        race: sourceRaceDisplayName(world, player.race),
        allied: state === "allied",
        enemy: state === "enemy",
        sharedVision: sourceSharedVisionEnabled(world, world.visibilityPlayer, player.id),
        locked: player.playerType === "computer" && sourceDiplomacyState(world, player.id, world.visibilityPlayer) !== "allied"
      };
    });
}

function sourceDiplomacyRowName(row: SourceDiplomacyDraftRow): string {
  return `${row.name} ${row.race ?? ""}`.trim();
}

function sourceDiplomacyShortName(row: SourceDiplomacyDraftRow): string {
  const name = row.name.replace(/\s*\(P\d+\)\s*$/, "");
  return name.length > 8 ? name.slice(0, 8) : name;
}

function sourceCheckBoxLabel(marked: boolean, locked: boolean): string {
  return locked ? marked ? "[x]" : "[ ]" : marked ? "[X]" : "[ ]";
}

export function sourcePlayerDisplayName(player: { id: number; name?: string | null }): string {
  const name = player.name?.trim();
  return name ? `${name} (P${player.id})` : `P${player.id}`;
}

export function sourceRaceDisplayName(world: Pick<WorldState, "engineSettings">, race: string | null | undefined): string {
  const normalizedRace = race?.trim();
  if (!normalizedRace) {
    return "Unknown";
  }
  return world.engineSettings.raceNames.find((entry) => entry.name === normalizedRace)?.display ?? normalizedRace;
}

export function sourceSharedVisionEnabled(world: WorldState, player: number, otherPlayer: number): boolean {
  return world.sharedVision.find((rule) => rule.player === player && rule.otherPlayer === otherPlayer)?.enabled === true;
}

export function diplomacyStateLabel(state: "allied" | "enemy" | "neutral"): string {
  return state[0].toUpperCase() + state.slice(1);
}

export function sourceGameIdentityLine(world: WorldState): string {
  const name = world.engineSettings.fullGameName ?? world.engineSettings.gameName ?? "Wargus";
  const version = world.engineSettings.gameVersion ? ` ${world.engineSettings.gameVersion}` : "";
  return `${name}${version}`;
}

export function sourceDebugFlagEnabled(world: WorldState, flag: string): boolean {
  return world.engineSettings.debugFlagsDefault.includes(flag);
}

export function sourceSelectionStyleLabel(style: string): string {
  return style === "ellipse" ? "Ellipse" : style === "circle" ? "Circle" : "Corners";
}

export function sourceVideoShaderLabel(shader: string): string {
  const normalized = shader.trim().toLowerCase();
  if (normalized === "none" || normalized.length === 0) {
    return "None";
  }
  if (normalized === "linear") {
    return "Linear";
  }
  if (normalized === "crt") {
    return "CRT";
  }
  return shader;
}

export function sourceVideoSizeLabel(world: Pick<WorldState, "engineSettings">): string {
  return `${Math.round(world.engineSettings.videoWidthDefault)}x${Math.round(world.engineSettings.videoHeightDefault)}`;
}

export function sourceAiDifficultyLabel(value: number): string {
  const difficulty = Math.floor(value);
  if (difficulty === -1) {
    return "Campaign script";
  }
  if (difficulty === 1) {
    return "Easy";
  }
  if (difficulty === 2) {
    return "Normal";
  }
  if (difficulty === 3) {
    return "Hard";
  }
  if (difficulty === 4) {
    return "Harder";
  }
  if (difficulty === 5) {
    return "Very Hard";
  }
  return `Level ${difficulty}`;
}

export function sourceShortTime(savedAt: string): string {
  const time = new Date(savedAt);
  return Number.isNaN(time.getTime()) ? "" : time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function sourceSaveTitle(summary: SavedGameSummary): string {
  const name = summary.mapPath.split("/").at(-1) ?? summary.mapPath;
  const time = new Date(summary.savedAt);
  return `${name} ${Number.isNaN(time.getTime()) ? "" : time.toLocaleString()}`.trim();
}

export function sourceCampaignMissionComplete(map: WargusMap, completedCampaignMissions: string[]): boolean {
  return Boolean(map.campaignTitle && map.campaignMissionIndex && completedCampaignMissions.includes(`${map.campaignTitle}:${map.campaignMissionIndex}`));
}

export function sourceFilteredPickerMaps(picker: SourceMapPickerState): WargusMap[] {
  const query = picker.query.trim().toLowerCase();
  if (!query) {
    return picker.maps;
  }
  const numeric = Number(query);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= picker.maps.length) {
    return [picker.maps[numeric - 1]].filter((map): map is WargusMap => Boolean(map));
  }
  return picker.maps.filter((map) => `${map.title} ${map.path}`.toLowerCase().includes(query));
}

export function sourceCampaignLabelForMap(map: WargusMap): string | null {
  if (!map.campaignTitle || !map.campaignMissionIndex) {
    return null;
  }
  return `${map.campaignTitle} ${map.campaignMissionIndex}`;
}

export function sourceResultScreen(manifest: WargusManifest, status: WorldState["matchState"]["status"], race: "human" | "orc"): NonNullable<WargusManifest["resultScreens"]>[number] | null {
  if (status === "playing") {
    return null;
  }
  return (manifest.resultScreens ?? []).find((screen) => screen.status === status && screen.race === race)
    ?? (manifest.resultScreens ?? []).find((screen) => screen.status === status)
    ?? null;
}

export function sourceResultScoreHeader(world: WorldState): string {
  return [
    "Player".padEnd(13, " "),
    "Units".padStart(5, " "),
    "Bldgs".padStart(5, " "),
    sourceResultResourceHeader(world, "gold", 5),
    sourceResultResourceHeader(world, "wood", 5),
    sourceResultResourceHeader(world, "oil", 4),
    "Kills".padStart(5, " "),
    "Razed".padStart(5, " "),
    "Score".padStart(5, " ")
  ].join(" ");
}

export function sourceResultResourceHeader(world: WorldState, resource: "gold" | "wood" | "oil", width: number): string {
  return resourceUiLabel(world, resource).slice(0, width).padStart(width, " ");
}

export function sourceResultScoreForPlayer(world: WorldState, player: WorldState["players"][number]): number {
  const stats = player.stats;
  const victoryBonus = world.matchState.status === "victory" && player.id === world.visibilityPlayer ? 500 : 0;
  return victoryBonus
    + stats.pointsKilled
    + Math.floor((stats.goldMined + stats.woodHarvested + stats.oilHarvested) / 20)
    - Math.floor(stats.pointsLost / 2);
}

export function sourceResultRankForPlayer(manifest: WargusManifest, world: WorldState, player: WorldState["players"][number]): string {
  const race = player.race === "orc" ? "orc" : "human";
  const ranks = (manifest.resultRanks ?? [])
    .filter((rank) => rank.race === race)
    .sort((a, b) => a.threshold - b.threshold);
  if (ranks.length === 0) {
    return "";
  }
  const score = sourceResultScoreForPlayer(world, player);
  let currentRank = ranks[0].name;
  for (const rank of ranks) {
    if (score > rank.threshold) {
      currentRank = rank.name;
    } else {
      break;
    }
  }
  return currentRank;
}

export function orderTargetLabel(world: WorldState, manifest: WargusManifest, targetId: string): string {
  const target = world.units.find((unit) => unit.id === targetId);
  return target?.name ?? (target ? unitTypeName(manifest, target.typeId) : targetId);
}

function cleanSourceButtonHint(hint: string): string {
  return hint
    .replace(/~!/g, "")
    .replace(/~<[^>]+~>/g, "")
    .replace(/~/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ");
}

function titleCaseId(id: string, prefix: string): string {
  return id
    .replace(new RegExp(`^${prefix}`), "")
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function findGameSoundId(manifest: WargusManifest | null, event: string, race: string | null | undefined): string {
  const raceSound = manifest?.gameSounds?.find((sound) => sound.event === event && sound.race === race)?.soundId;
  if (raceSound) {
    return raceSound;
  }
  return manifest?.gameSounds?.find((sound) => sound.event === event && sound.race === "any")?.soundId
    ?? manifest?.gameSounds?.find((sound) => sound.event === event && sound.race === "human")?.soundId
    ?? event;
}

export function sourceTitleMusicFile(manifest: WargusManifest | null): string | null {
  return [...(manifest?.titleScreens ?? [])].reverse().find((screen) => Boolean(screen.music))?.music ?? null;
}

export function sourceTitleScreen(manifest: WargusManifest | null): NonNullable<WargusManifest["titleScreens"]>[number] | null {
  return [...(manifest?.titleScreens ?? [])].reverse().find((screen) => Boolean(screen.image) && !screen.image.endsWith(".ogv")) ?? null;
}

export function sourceTitleTip(manifest: WargusManifest | null, world?: Pick<WorldState, "engineSettings"> | null): string | null {
  const settings = world?.engineSettings ?? manifest?.engineSettings;
  if (settings?.showTipsDefault === false) {
    return null;
  }
  const tips = manifest?.titleTips ?? [];
  if (tips.length === 0) {
    return null;
  }
  const sourceIndex = Math.floor(settings?.tipNumberDefault ?? 0);
  const index = sourceIndex > 0 ? (sourceIndex - 1) % tips.length : 0;
  return tips[index]?.text ?? null;
}

export function sourceStereoPanForUnit(unit: Pick<WorldUnit, "x">, camera: { x: number; zoom: number }, viewport: { width: number }): number {
  if (viewport.width <= 0) {
    return 0;
  }
  const screenX = (unit.x - camera.x) * camera.zoom;
  return Math.max(-0.85, Math.min(0.85, (screenX / viewport.width) * 2 - 1));
}

export function sourceMouseScrollingEnabled(world: WorldState | null): boolean {
  return world?.engineSettings.enableMouseScrollingDefault !== false;
}

export function sourceScrollMargins(world: WorldState | null): { top: number; right: number; bottom: number; left: number } {
  return world?.engineSettings.scrollMargins ?? { top: 15, right: 16, bottom: 16, left: 2 };
}

export function sourceMouseDragScrollScale(world: WorldState | null, controlPressed: boolean): number {
  if (!sourceMouseScrollingEnabled(world)) {
    return 0;
  }
  const sourceSpeed = controlPressed
    ? world?.engineSettings.mouseScrollSpeedControlDefault ?? 15
    : world?.engineSettings.mouseScrollSpeedPressedDefault ?? 4;
  return Math.max(0, sourceSpeed);
}

export function sourceMouseEdgeScrollScale(world: WorldState | null, buttons: number, controlPressed: boolean): number {
  if (!sourceMouseScrollingEnabled(world)) {
    return 0;
  }
  if (controlPressed) {
    return Math.max(0, world?.engineSettings.mouseScrollSpeedControlDefault ?? 15);
  }
  return buttons !== 0
    ? Math.max(0, world?.engineSettings.mouseScrollSpeedPressedDefault ?? 4)
    : 1;
}
