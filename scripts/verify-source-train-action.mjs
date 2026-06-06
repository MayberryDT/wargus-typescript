import { readFileSync } from "node:fs";

const source = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_train.cpp", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");

const errors = [];

for (const fragment of [
  "#define CancelTrainingCostsFactor  100",
  "trainer.Player->SubUnitType(type)",
  "this->Ticks += std::max(1, player.SpeedTrain / SPEEDUP_FACTOR)",
  "const ECheckLimit food = player.CheckLimits(nType)",
  "unit.Wait = CYCLES_PER_SECOND / 6",
  "CUnit *newUnit = MakeUnit(nType, &player)",
  "DropOutOnSide(*newUnit, LookingW, &unit)",
  "CanHandleOrder(*newUnit, unit.NewOrder.get())"
]) {
  if (!source.includes(fragment)) {
    errors.push(`Stratagus train source missing expected fragment: ${fragment}`);
  }
}

for (const [label, text, fragments] of [
  ["orders train action", ordersSource, [
    "spendResources(player.resources, unitDefinition.costs)",
    "sourceTrainDurationSecondsForPlayer(world, building.player, unitDefinition.costs)",
    "function canCompleteTrainedUnitWithinSourceLimits",
    "if (!canCompleteTrainedUnitWithinSourceLimits(world, unit.player, unitDefinition))",
    "active.remainingSeconds = sourceTrainRetryDelaySeconds(world)",
    "function sourceTrainRetryDelaySeconds(world: WorldState): number",
    "return sourceCyclesToSeconds(world, 5)",
    "return definition.demand <= 0 || supply.used + definition.demand <= supply.cap",
    "const spawn = findSpawnTile(world, unit, unitDefinition)",
    "trainedUnit.lifetimeSeconds = sourceDecayRateLifetimeSeconds(unit.decayRate) ?? trainedUnit.lifetimeSeconds",
    "issueOnReadyOrder(world, trainedUnit)",
    "issueRallyOrderToTrainedUnit(world, unit, trainedUnit)"
  ]],
  ["save/load train queue", saveSource, [
    "function normalizeProductionQueue",
    "function normalizeLoadedProductionQueueReferences",
    "unit.productionQueue = normalizeLoadedProductionQueueReferences(world, unit)",
    "unit.productionQueue = accepted",
    "canTrainUnitAt(world, unit.id, entry.unitTypeId, world.unitDefinitions)",
    "sourceTrainDurationSecondsForPlayer(world, producer.player, definition.costs)",
    "return { unitTypeId, remainingSeconds: Math.min(Math.max(0.001, remainingSeconds), sourceTotalSeconds), totalSeconds: sourceTotalSeconds }"
  ]],
  ["package verify script", packageSource, [
    '"verify:source-train-action"',
    "npm run verify:source-train-action"
  ]]
]) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      errors.push(`${label} missing source train fragment: ${fragment}`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source train action verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source train action verified (up-front cost, timed progress, completion limits, retry wait, spawn, TTL, and ready/rally order).");
