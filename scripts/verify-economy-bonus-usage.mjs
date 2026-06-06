import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const renderSource = readFileSync("src/view/renderWorld.ts", "utf8");

const centers = (manifest.units ?? []).filter((unit) => unit.center);
const woodImprovers = (manifest.units ?? []).filter((unit) => unit.woodImprove);
const oilImprovers = (manifest.units ?? []).filter((unit) => unit.oilImprove);
const productionImprovers = (manifest.units ?? []).filter((unit) => Object.keys(unit.improveProduction ?? {}).length > 0);
const storageBuildings = (manifest.units ?? []).filter((unit) => (unit.storesResources ?? []).length > 0);
const peasant = (manifest.units ?? []).find((unit) => unit.id === "unit-peasant");
const peon = (manifest.units ?? []).find((unit) => unit.id === "unit-peon");
const humanTanker = (manifest.units ?? []).find((unit) => unit.id === "unit-human-oil-tanker");
const orcTanker = (manifest.units ?? []).find((unit) => unit.id === "unit-orc-oil-tanker");
const errors = [];

if (centers.length === 0) errors.push("Wargus manifest has no Center units.");
if (woodImprovers.length === 0) errors.push("Wargus manifest has no WoodImprove units.");
if (oilImprovers.length === 0) errors.push("Wargus manifest has no OilImprove units.");
if (productionImprovers.length === 0) errors.push("Wargus manifest has no ImproveProduction units.");
if (storageBuildings.length === 0) errors.push("Wargus manifest has no resource storage buildings.");
if (peasant?.resourceCapacity?.gold !== 100 || peasant?.resourceCapacity?.wood !== 100) errors.push("Human peasant resource capacities were not indexed from CanGatherResources.");
if (peon?.resourceCapacity?.gold !== 100 || peon?.resourceCapacity?.wood !== 100) errors.push("Orc peon resource capacities were not indexed from CanGatherResources.");
if (humanTanker?.resourceCapacity?.oil !== 100 || orcTanker?.resourceCapacity?.oil !== 100) errors.push("Oil tanker resource capacities were not indexed from CanGatherResources.");
if (peasant?.resourceStep?.wood !== 2 || peon?.resourceStep?.wood !== 2) errors.push("Worker lumber resource-step entries were not indexed from CanGatherResources.");
if (peasant?.waitAtResource?.gold !== 150 || peasant?.waitAtResource?.wood !== 24 || peon?.waitAtResource?.gold !== 150 || peon?.waitAtResource?.wood !== 24) errors.push("Worker wait-at-resource entries were not indexed from CanGatherResources.");
if (peasant?.waitAtDepot?.gold !== 150 || peasant?.waitAtDepot?.wood !== 150 || peon?.waitAtDepot?.gold !== 150 || peon?.waitAtDepot?.wood !== 150) errors.push("Worker wait-at-depot entries were not indexed from CanGatherResources.");
if (humanTanker?.waitAtResource?.oil !== 100 || humanTanker?.waitAtDepot?.oil !== 100 || orcTanker?.waitAtResource?.oil !== 100 || orcTanker?.waitAtDepot?.oil !== 100) errors.push("Oil tanker wait entries were not indexed from CanGatherResources.");

const requiredWorldFragments = [
  "woodImprove: unit.woodImprove ?? false",
  "oilImprove: unit.oilImprove ?? false",
  "center: unit.center ?? false",
  "storesResources: [...(unit.storesResources ?? [])]",
  "improveProduction: normalizeImproveProduction(unit.improveProduction)",
  "resourceCapacity: normalizeResourceCapacity(unit.resourceCapacity)",
  "resourceStep: normalizePositiveResourceMap(unit.resourceStep)",
  "waitAtResource: normalizePositiveResourceMap(unit.waitAtResource)",
  "waitAtDepot: normalizePositiveResourceMap(unit.waitAtDepot)",
  "export function normalizePositiveResourceMap",
  "export function normalizeResourceCapacity",
  "export function resourceCapacityForUnit",
  "export function resourceStepForUnit",
  "export function resourceWaitAtResourceCyclesForUnit",
  "export function resourceWaitAtDepotCyclesForUnit",
  "export function normalizeImproveProduction"
];
for (const fragment of requiredWorldFragments) {
  if (!worldSource.includes(fragment)) {
    errors.push(`World creation missing economy metadata fragment: ${fragment}`);
  }
}

const requiredOrderFragments = [
  "function resourceDeliveryAmount",
  "sourceDefaultIncomePercent(world, resource)",
  "completedProductionBonusPercent(world, unit.player, resource)",
  "Math.floor(carried * Math.max(defaultIncome, defaultIncome + bonusPercent) / 100)",
  "function sourceDefaultIncomePercent",
  "world.engineSettings.defaultResourceNames.indexOf(resource)",
  "world.engineSettings.defaultIncomes[resourceIndex]",
  "function completedProductionBonusPercent",
  "unit.player === playerId && !unit.construction && unit.hitPoints > 0",
  "Math.max(best, unit.improveProduction[resource] ?? 0)",
  "canStoreResource(candidate, \"oil\")",
  "canDropOffResourceAt(world, unit, candidate, unit.carriedResource)",
  "resourceCapacityForUnit(unit, unit.order.resource)",
  "resourceStepForUnit(unit, unit.order.resource)",
  "sourceResourceGatherStepSeconds(world, unit, unit.order.resource)",
  "sourceResourceReturnStepSeconds(world, unit, unit.order.resource)",
  "updateUnitFacing(unit, targetX - unit.x, targetY - unit.y)",
  "findNearestWoodTileNear(world, unit.order.tileX, unit.order.tileY, 10)",
  "function findNearestWoodTileNear(world: WorldState, centerX: number, centerY: number, maxRadius: number)",
  "unit.resourcesHeld = Math.min(capacity, unit.resourcesHeld + gathered)",
  "harvestWoodStep(world, unit.order.tileX, unit.order.tileY, step)",
  "clearDepletedWoodTile(world, unit.order.tileX, unit.order.tileY)",
  "forestResourceForTile(world, tileX, tileY)"
];
for (const fragment of requiredOrderFragments) {
  if (!ordersSource.includes(fragment)) {
    errors.push(`Simulation missing economy runtime fragment: ${fragment}`);
  }
}
const deliveryIndex = ordersSource.indexOf("addPlayerResource(world, player, unit.order.resource, delivered)");
const depotWaitIndex = ordersSource.indexOf("unit.order.returnSeconds = sourceResourceReturnStepSeconds(world, unit, unit.order.resource)", deliveryIndex);
const clearHeldIndex = ordersSource.indexOf("unit.resourcesHeld = 0", deliveryIndex);
if (deliveryIndex === -1 || depotWaitIndex === -1 || clearHeldIndex === -1 || !(deliveryIndex < clearHeldIndex && clearHeldIndex < depotWaitIndex)) {
  errors.push("Simulation should credit delivered resources and clear carried goods immediately on depot arrival before applying the source WaitAtDepot delay.");
}
if (ordersSource.includes("restoreCarriedResourceToSource") || ordersSource.includes("source.resourcesHeld += unit.resourcesHeld")) {
  errors.push("Dead workers should lose carried resources like Stratagus DropResource instead of refunding them to mines or oil sources.");
}
if (!ordersSource.includes("function dropCarriedResourcesOnDeath(unit: WorldUnit): void") || !ordersSource.includes("unit.resourcesHeld = 0;\n  unit.carriedResource = null;")) {
  errors.push("Dead workers should explicitly drop carried resources before death cleanup removes them.");
}
const platformRestoreIndex = ordersSource.indexOf("restoreOilPatchForRemovedPlatform(world, unit)");
const dropCarriedIndex = ordersSource.indexOf("dropCarriedResourcesOnDeath(unit)", platformRestoreIndex);
const deathRecordIndex = ordersSource.indexOf("recordUnitDeath(world, unit)", dropCarriedIndex);
if (platformRestoreIndex === -1 || dropCarriedIndex === -1 || deathRecordIndex === -1 || !(platformRestoreIndex < dropCarriedIndex && dropCarriedIndex < deathRecordIndex)) {
  errors.push("Death cleanup should restore oil-platform patch resources before dropping carried worker goods, then record death stats.");
}
if (!ordersSource.includes("dropCarriedResourcesOnDeath(cargoUnit);\n        recordUnitDeath(world, cargoUnit")) {
  errors.push("Cargo units killed with a transport should also drop carried resources before death stats are recorded.");
}

const requiredSaveFragments = [
  "unit.woodImprove = definition.woodImprove ?? false",
  "unit.oilImprove = definition.oilImprove ?? false",
  "unit.center = definition.center ?? false",
  "unit.storesResources = [...(definition.storesResources ?? [])]",
  "unit.resourceCapacity = normalizeResourceCapacity(definition.resourceCapacity)",
  "unit.resourceStep = normalizePositiveResourceMap(definition.resourceStep)",
  "unit.waitAtResource = normalizePositiveResourceMap(definition.waitAtResource)",
  "unit.waitAtDepot = normalizePositiveResourceMap(definition.waitAtDepot)",
  "unit.improveProduction = normalizeImproveProduction(definition.improveProduction)",
  "unit.resourceCapacity = normalizeSourceResourceCapacity(unit.resourceCapacity, world)",
  "unit.resourceStep = normalizeSourcePositiveResourceMap(unit.resourceStep, world)",
  "unit.waitAtResource = normalizeSourcePositiveResourceMap(unit.waitAtResource, world)",
  "unit.waitAtDepot = normalizeSourcePositiveResourceMap(unit.waitAtDepot, world)",
  "unit.improveProduction = normalizeSourceImproveProduction(unit.improveProduction, world)",
  "unit.resourcesHeld = rawResourcesHeld == null",
  "unit.carriedResource = normalizeCarriedResource(unit.carriedResource, unit.resourcesHeld)"
];
for (const fragment of requiredSaveFragments) {
  if (!saveSource.includes(fragment)) {
    errors.push(`Save/load normalization missing economy fragment: ${fragment}`);
  }
}

if (!hudSource.includes("economyRoleLine(selected)") || !sourceUiHelpersSource.includes("unit.center") || !sourceUiHelpersSource.includes("unit.woodImprove") || !sourceUiHelpersSource.includes("unit.oilImprove")) {
  errors.push("HUD does not surface source economy role metadata.");
}
if (!renderSource.includes("drawEconomyRoleMarker") || !renderSource.includes("unit.center") || !renderSource.includes("unit.woodImprove") || !renderSource.includes("unit.oilImprove")) {
  errors.push("World renderer does not surface source economy role metadata.");
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  console.error(`Economy bonus verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log(`Economy bonus usage verified (${centers.length} centers, ${woodImprovers.length} wood improvers, ${oilImprovers.length} oil improvers, ${productionImprovers.length} production improvers, ${storageBuildings.length} storage buildings).`);
