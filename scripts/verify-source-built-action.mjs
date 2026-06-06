import { readFileSync } from "node:fs";

const source = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_built.cpp", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");

const errors = [];

for (const fragment of [
  "#define CancelBuildingCostsFactor  75",
  "unit.Variable[HP_INDEX].Value = 1",
  "unit.Type->BoolFlag[BUILDEROUTSIDE_INDEX].value == false",
  "DropOutOnSide(*worker, LookingW, &unit)",
  "CommandResource(*worker, unit, EFlushMode::Off)",
  "CommandReturnGoods(*worker, &unit, EFlushMode::Off)",
  "type.GivesResource && type.StartingResources != 0",
  "AiWorkComplete(worker, unit)",
  "unit.Type->OnReady"
]) {
  if (!source.includes(fragment)) {
    errors.push(`Stratagus built source missing expected fragment: ${fragment}`);
  }
}

for (const [label, text, fragments] of [
  ["orders built action", ordersSource, [
    "building.hitPoints = Math.max(1, Math.floor(building.maxHitPoints * 0.1))",
    "const builderInside = !buildingDefinition.builderOutside",
    "building.construction = { builderId: builder.id, builderInside, remainingSeconds: totalSeconds, totalSeconds }",
    "function releaseBuilderFromConstruction",
    "function issueSourceConstructionCompleteBuilderOrder",
    "isHarvestResource(building.givesResource) && canGatherResource(builder, building.givesResource)",
    'building.givesResource === "gold" && issueHarvestOrder(world, builder.id, building.id)',
    'building.givesResource === "oil" && issueHarvestOilOrder(world, builder.id, building.id)',
    "builder.resourcesHeld > 0 && isHarvestResource(builder.carriedResource) && canStoreResource(building, builder.carriedResource)",
    "issueReturnGoodsToDropoffOrder(world, builder.id, building.id)",
    "issueSourceConstructionCompleteBuilderOrder(world, builder, building)",
    'kind: "construction-complete", unitId: building.id'
  ]],
  ["package verify script", packageSource, [
    '"verify:source-built-action"',
    "npm run verify:source-built-action"
  ]]
]) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      errors.push(`${label} missing source built fragment: ${fragment}`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source built action verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source built action verified (cancel factor, inside/outside builder, completion release, harvest/return follow-ups, and ready event).");
