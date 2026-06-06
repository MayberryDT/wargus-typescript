import { readFileSync } from "node:fs";

const source = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_upgradeto.cpp", "utf8");
const commandSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus/src/action/command.cpp", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const renderSource = readFileSync("src/view/renderWorld.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const hudCommandExecutionSource = readFileSync("src/view/hudCommandExecution.ts", "utf8");
const sourceUiSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");
const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));

const errors = [];

function expectIncludes(label, text, fragments) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      errors.push(`${label} missing upgrade-to fragment: ${fragment}`);
    }
  }
}

expectIncludes("Stratagus action_upgradeto.cpp", source, [
  "#define CancelUpgradeCostsFactor   100",
  "COrder::NewActionUpgradeTo",
  "unit.Player->SubUnitType(type);",
  "TransformUnitIntoType(CUnit &unit, const CUnitType &newtype)",
  "unit.Type->FieldFlags == newtype.FieldFlags",
  "unit.Type->MovementMask == newtype.MovementMask",
  "UnitTypeCanBeAt(newtype, pos)",
  "player.Demand += newtype.Stats[player.Index].Variables[DEMAND_INDEX].Value - oldtype.Stats[player.Index].Variables[DEMAND_INDEX].Value;",
  "player.Supply += newtype.Stats[player.Index].Variables[SUPPLY_INDEX].Value - oldtype.Stats[player.Index].Variables[SUPPLY_INDEX].Value;",
  "TransformUnitIntoType(unit, *this->Type);",
  "action-upgrade-to",
  "\"ticks\"",
  "AnimateActionUpgradeTo(unit)",
  "UnitShowAnimation(unit, !animations.Upgrade.empty() ? &animations.Upgrade : &animations.Still);",
  "this->Ticks += std::max(1, player.SpeedUpgrade / SPEEDUP_FACTOR);",
  "unit.Wait = CYCLES_PER_SECOND / 6;",
  "TransformUnitIntoType(unit, newtype) == 0",
  "player.AddCosts(newstats.Costs);",
  "player.AddCostsFactor(this->Type->Stats[player.Index].Costs, CancelUpgradeCostsFactor);",
  "unit.Variable[UPGRADINGTO_INDEX].Value = this->Ticks;"
]);

expectIncludes("Stratagus upgrade-to command queue", commandSource, [
  "void CommandUpgradeTo(CUnit &unit, CUnitType &type, EFlushMode flush, bool instant)",
  "auto *order = GetNextOrder(unit, flush);",
  "*order = COrder::NewActionUpgradeTo(unit, type, instant);"
]);

const upgradeButtons = (manifest.buttons ?? []).filter((button) => button.action === "upgrade-to");
if (upgradeButtons.length < 8) {
  errors.push(`Manifest should preserve source upgrade-to buttons; found ${upgradeButtons.length}.`);
}

expectIncludes("browser upgrade timing", worldSource, [
  "sourceUpgradeDurationSeconds",
  "sourceUpgradeDurationSecondsForPlayer",
  "export function getPlayerSupply"
]);

expectIncludes("browser upgrade issuing", ordersSource, [
  "export function issueUpgradeTownCenterOrder",
  "export function issueUpgradeTowerOrder",
  "sourceUpgradeTargetForBuilding(world, building)",
  "function canSourceUpgradeToType(world: WorldState, building: WorldUnit, upgradeTypeId: string): boolean",
  "button.action === \"upgrade-to\"",
  "export function isProducerTransformationFor(world: WorldState, building: WorldUnit, unitTypeId: string): boolean",
  "const totalSeconds = isProducerTransformationFor(world, building, unitDefinition.id)",
  "sourceUpgradeDurationSecondsForPlayer(world, building.player, unitDefinition.costs)",
  "spendResources(player.resources, unitDefinition.costs)",
  "building.productionQueue.push({ unitTypeId, remainingSeconds: totalSeconds, totalSeconds });",
  "function canQueueUpgradeToAt(world: WorldState, building: WorldUnit, unitTypeId: string, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean",
  "function issueQueueUpgradeToOrder(world: WorldState, buildingId: string, unitTypeId: string, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean",
  "issueSourceUpgradeHudCommand(world: WorldState, unitIds: string[], unitTypeId: string, unitDefinitions: WargusUnit[] = world.unitDefinitions, playerId = world.visibilityPlayer, queue = false)",
  "sourceValueButtonForUnit(world, unit, \"upgrade-to\", unitTypeId)",
  "if (canTrainUnitAt(world, unit.id, unitTypeId, unitDefinitions))",
  "return issueQueueUpgradeToOrder(world, unit.id, unitTypeId, unitDefinitions);",
  "if (isProducerTransformationFor(world, building, unitTypeId) && building.productionQueue.length > 0)",
  "const transformedUsed = supply.used + supply.queued - building.demand + unitDefinition.demand;",
  "const transformedCap = supply.cap - (building.construction ? 0 : building.supply) + unitDefinition.supply;",
  "return transformedUsed <= transformedCap;"
]);

expectIncludes("upgrade-to HUD execution", hudCommandExecutionSource, [
  "issueSourceUpgradeHudCommand(world, selectedUnitIds, command.slice(\"source-upgrade:\".length), manifest.units, world.visibilityPlayer, input.shiftKey === true)"
]);

expectIncludes("browser upgrade completion", ordersSource, [
  "function stepProductionOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void",
  "unitDefinition && isProducerTransformationFor(world, unit, unitDefinition.id)",
  "const previousHitPointRatio = unit.maxHitPoints > 0 ? unit.hitPoints / unit.maxHitPoints : 1;",
  "if (transformUnitType(world, unit, unitDefinition.id))",
  "unit.hitPoints = Math.max(1, Math.min(unit.maxHitPoints, Math.round(unit.maxHitPoints * previousHitPointRatio)));",
  "world.events.push({ kind: \"unit-ready\", unitId: unit.id, typeId: unit.typeId, player: unit.player, x: unit.x, y: unit.y });",
  "refundFailedSourceUpgradeTo(world, unit, unitDefinition);",
  "function refundFailedSourceUpgradeTo(world: WorldState, unit: WorldUnit, unitDefinition: WargusUnit): void",
  "refundCosts(world, player, unitDefinition.costs, 1)",
  "function transformUnitType(world: WorldState, unit: WorldUnit, toTypeId: string): boolean",
  "canTransformUnitTypeAtSourcePosition(world, unit, definition)",
  "normalizeTransformedCombatOrders(world, unit)",
  "order.kind !== \"attack-target\"",
  "order.kind !== \"attack-move\"",
  "order.kind !== \"attack-ground\"",
  "order.kind !== \"patrol\""
]);

expectIncludes("save/load upgrade-to state", saveSource, [
  "function normalizeProductionQueue",
  "function normalizeLoadedProductionQueueReferences",
  "unit.productionQueue = normalizeLoadedProductionQueueReferences(world, unit)",
  "unit.productionQueue = accepted",
  "isProducerTransformationFor(world, producer, definition.id)",
  "sourceUpgradeDurationSecondsForPlayer(world, producer.player, definition.costs)",
  "if (sourceTotalSeconds <= 0)",
  "return { unitTypeId, remainingSeconds: Math.min(Math.max(0.001, remainingSeconds), sourceTotalSeconds), totalSeconds: sourceTotalSeconds }"
]);

expectIncludes("upgrade-to rendering", renderSource, [
  "unit.productionQueue[0] && hasAction(\"Upgrade\") && isSourceUpgradeProduction(world, unit)",
  "button.action === \"upgrade-to\"",
  "unit.productionQueue[0] && hasAction(\"Train\")"
]);

expectIncludes("upgrade-to HUD", hudSource, [
  "selected.productionQueue.slice(0, visibleProductionSlots)"
]);

expectIncludes("upgrade-to source UI helpers", sourceUiSource, [
  "isProducerTransformationFor(world, unit, order.unitTypeId)",
  "isProducerTransformationFor(_world, unit, order.unitTypeId)"
]);

expectIncludes("package verify script", packageSource, [
  "\"verify:source-upgrade-to-action\"",
  "npm run verify:source-upgrade-to-action"
]);

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source upgrade-to action verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source upgrade-to action verified (source transform/cancel/failure refunds, upgrade timing, delta supply checks, source buttons, rendering, and save/load state).");
