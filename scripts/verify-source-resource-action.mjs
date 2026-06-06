import { readFileSync } from "node:fs";

const source = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_resource.cpp", "utf8");
const commandSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/command.cpp", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const selectionHotkeySource = readFileSync("src/view/selectionHotkeys.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");

const errors = [];

function expectIncludes(label, text, fragments) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      errors.push(`${label} missing resource-action fragment: ${fragment}`);
    }
  }
}

expectIncludes("Stratagus action_resource.cpp", source, [
  "SUB_START_RESOURCE",
  "SUB_MOVE_TO_RESOURCE",
  "SUB_START_GATHERING",
  "SUB_GATHER_RESOURCE",
  "SUB_STOP_GATHERING",
  "SUB_MOVE_TO_DEPOT",
  "SUB_UNREACHABLE_DEPOT",
  "SUB_RETURN_RESOURCE",
  "COrder::NewActionReturnGoods",
  "order->Depot = depot;",
  "UnitGotoGoal(unit, depot, SUB_MOVE_TO_DEPOT)",
  "\"res-depot\"",
  "\"done-harvesting\"",
  "\"timetoharvest\"",
  "AnimateActionHarvest(unit)",
  "unit.ResourcesHeld += addload;",
  "source->ResourcesHeld -= addload;",
  "FindDeposit(unit, 1000, unit.CurrentResource)",
  "COrder_Resource::MoveToDepot",
  "bool COrder_Resource::WaitInDepot(CUnit &unit)",
  "unit.Wait = resinfo.WaitAtDepot;",
  "player.ChangeResource(rindex, (unit.ResourcesHeld * player.Incomes[rindex]) / 100, true);",
  "unit.Wait /= std::max(1, unit.Player->SpeedResourcesReturn[resinfo.ResourceId] / SPEEDUP_FACTOR);"
]);

expectIncludes("Stratagus resource command source", commandSource, [
  "void CommandResourceLoc(CUnit &unit, const Vec2i &pos, EFlushMode flush)",
  "void CommandResource(CUnit &unit, CUnit &dest, EFlushMode flush)",
  "void CommandReturnGoods(CUnit &unit, CUnit *depot, EFlushMode flush)",
  "order = GetNextOrder(unit, flush)",
  "*order = COrder::NewActionResource(unit, pos)",
  "*order = COrder::NewActionResource(unit, dest)",
  "*order = COrder::NewActionReturnGoods(unit, depot)"
]);

expectIncludes("browser resource order state", worldSource, [
  "kind: \"harvest\";",
  "kind: \"harvest-wood\";",
  "kind: \"return-goods\";",
  "resource: \"gold\" | \"oil\";",
  "resource: \"gold\" | \"wood\" | \"oil\";",
  "phase: \"to-resource\" | \"gathering\" | \"to-dropoff\";",
  "dropoffId: string | null;",
  "dropoffX: number;",
  "dropoffY: number;",
  "gatherSeconds: number;",
  "returnSeconds: number;",
  "resourceWaitAtResourceCyclesForUnit",
  "resourceWaitAtDepotCyclesForUnit",
  "sourceResourceHarvestDurationSeconds",
  "sourceResourceReturnDurationSeconds"
]);

expectIncludes("browser resource simulation", ordersSource, [
  "isSourceResourcePatchDefinition,",
  "isSourceResourceSiteDefinition,",
  "export function issueHarvestOrder",
  "export function issueHarvestWoodOrder",
  "export function issueHarvestOilOrder",
  "export function issueGroupHarvestAtOrder",
  "export function issueGroupQueueHarvestAtOrder",
  "export function canSelectedIssueHarvestAt",
  "function canSetHarvestRallyPoint",
  "function issueHarvestRallyPoint",
  "function harvestRallyTargetForPoint",
  "function sourceHarvestRallyGatherers",
  "export function issueQueueHarvestOrder",
  "export function issueQueueHarvestWoodOrder",
  "export function issueQueueReturnGoodsOrder",
  "export function canIssueQueueHarvestTarget",
  "export function canIssueQueueHarvestWoodAt",
  "export function canIssueQueueReturnGoodsOrder",
  "unit.moveQueue.push({ kind: \"harvest\"",
  "unit.moveQueue.push({ kind: \"harvest-wood\"",
  "unit.moveQueue.push({ kind: \"return-goods\"",
  "if (target.kind === \"harvest\")",
  "if (target.kind === \"harvest-wood\")",
  "if (target.kind === \"return-goods\")",
  "issueGroupQueueSmartOrder",
  "const SOURCE_PENDING_ACTIONS = new Set([\"move\", \"attack\", \"attack-ground\", \"patrol\", \"repair\", \"harvest\", \"unload\"])",
  "export function issueReturnGoodsOrder",
  "function issueReturnGoodsToDropoffOrder",
  "dropoffId: dropoff.id",
  "function stepHarvestOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void",
  "unit.order.phase = \"gathering\";",
  "unit.order.gatherSeconds = sourceResourceGatherStepSeconds(world, unit, unit.order.resource);",
  "const step = Math.min(resourceStepForUnit(unit, unit.order.resource), Math.max(0, capacity - unit.resourcesHeld));",
  "target.resourcesHeld -= gathered;",
  "unit.resourcesHeld = Math.min(capacity, unit.resourcesHeld + gathered);",
  "unit.order.phase = \"to-dropoff\";",
  "unit.order.targetX = unit.order.dropoffX;",
  "const latestDropoff = sourceResourceOrderDropoff(world, unit);",
  "function sourceResourceOrderDropoff(world: WorldState, unit: WorldUnit): WorldUnit | undefined",
  "const rememberedDropoff = unit.order.dropoffId ? findUnit(world, unit.order.dropoffId) : undefined;",
  "canDropOffResourceAt(world, unit, rememberedDropoff, unit.order.resource)",
  "return findNearestDropoff(world, unit, unit.order.resource);",
  "unit.order.dropoffId = latestDropoff.id;",
  "addPlayerResource(world, player, unit.order.resource, delivered);",
  "unit.order.returnSeconds = sourceResourceReturnStepSeconds(world, unit, unit.order.resource);",
  "retargetHarvestAfterDelivery(world, unit, unit.order.resource);",
  "function harvestWoodStep",
  "function clearDepletedWoodTile",
  "function sourceResourceGatherStepSeconds",
  "function sourceResourceReturnStepSeconds",
  "function sourceCyclesToSeconds(world: WorldState, cycles: number): number",
  "return cycles / sourceDefaultGameSpeed(world);",
  "Math.max(sourceCyclesToSeconds(world, 1), sourceCyclesToSeconds(world, cycles)) * sourceResourceHarvestDurationSecondsForPlayer",
  "Math.max(sourceCyclesToSeconds(world, 1), sourceCyclesToSeconds(world, cycles)) * sourceResourceReturnDurationSecondsForPlayer",
  "return isSourceResourcePatchDefinition(unit, \"oil\");",
  "return isSourceResourceSiteDefinition(unit) && isResourceSource(unit, \"oil\");"
]);

expectIncludes("selection resource hotkeys", selectionHotkeySource, [
  "issueQueueReturnGoodsOrder,",
  "input.shiftKey === true",
  "? issueQueueReturnGoodsOrder(world, unit.id)",
  ": issueReturnGoodsOrder(world, unit.id)"
]);

expectIncludes("save/load resource order", saveSource, [
  "if (kind === \"harvest\")",
  "|| record.kind === \"harvest\"",
  "|| record.kind === \"harvest-wood\"",
  "|| record.kind === \"return-goods\"",
  "canIssueQueueHarvestTarget(world, unit, target)",
  "canIssueQueueHarvestWoodAt(world, unit, tileX, tileY)",
  "canIssueQueueReturnGoodsOrder(world, unit, targetId)",
  "const requestedTargetId = typeof record.targetId === \"string\" ? record.targetId : null",
  "const targetId = requestedTargetId && hasValidLoadedResourceDropoff(world, unit, requestedTargetId, resource ?? \"gold\") ? requestedTargetId : null",
  "targetId: typeof record.targetId === \"string\" ? record.targetId : null",
  "dropoffId: typeof record.dropoffId === \"string\" ? record.dropoffId : null",
  "...normalizeDropoffPoint(world, record.dropoffX, record.dropoffY, unit)",
  "gatherSeconds: Math.max(0, Math.min(sourceGatherSeconds, finiteNumberOr(record.gatherSeconds, 0)))",
  "returnSeconds: Math.max(0, Math.min(sourceReturnSeconds, finiteNumberOr(record.returnSeconds, 0)))",
  "function sourceResourceGatherStepSecondsForSave",
  "function sourceResourceReturnStepSecondsForSave",
  "function sourceCyclesToSeconds(world: WorldState, cycles: number): number",
  "return cycles / sourceDefaultGameSpeed(world);",
  "Math.max(sourceCyclesToSeconds(world, 1), sourceCyclesToSeconds(world, cycles)) * sourceResourceHarvestDurationSecondsForPlayer",
  "Math.max(sourceCyclesToSeconds(world, 1), sourceCyclesToSeconds(world, cycles)) * sourceResourceReturnDurationSecondsForPlayer",
  "function hasInvalidLoadedHarvestOrder",
  "hasLoadedHarvestPathToResource(world, unit, order, target)",
  "hasLoadedHarvestPathToWood(world, unit, order)",
  "hasLoadedHarvestPathToDropoff(world, unit, order)",
  "function isInLoadedResourceRange",
  "if (order.dropoffId && !hasValidLoadedResourceDropoff(world, unit, order.dropoffId, order.resource))",
  "order.dropoffId = null",
  "function hasValidLoadedResourceDropoff",
  "dropoff.storesResources.includes(resource)",
  "function canLoadedUnitUseResourceDeposit",
  "|| !hasLoadedHarvestPathToDropoff(world, unit, order)",
  "function canRestoreHarvestResourceForUnit"
]);

expectIncludes("package verify script", packageSource, [
  "\"verify:source-resource-action\"",
  "npm run verify:source-resource-action"
]);

if (ordersSource.includes("Math.max(1 / world.tickRate, cycles / world.tickRate) * sourceResource") || saveSource.includes("Math.max(1 / world.tickRate, cycles / world.tickRate) * sourceResource")) {
  errors.push("Resource gather/return waits should use sourceCyclesToSeconds instead of raw browser tick-rate math.");
}
if (ordersSource.includes("return cycles / world.tickRate;") || saveSource.includes("return cycles / world.tickRate;")) {
  errors.push("Source cycle-to-seconds conversion should use sourceDefaultGameSpeed instead of raw browser tick-rate math.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source resource action verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source resource action verified (harvest/return substates, source wait timing, remembered depot identity, resource transfer, wood depletion, and save/load state).");
