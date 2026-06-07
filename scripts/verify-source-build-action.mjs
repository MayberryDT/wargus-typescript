import { readFileSync } from "node:fs";

const source = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_build.cpp", "utf8");
const commandSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus/src/action/command.cpp", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");
const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));

const errors = [];
const unitsById = new Map((manifest.units ?? []).map((unit) => [unit.id, unit]));

for (const fragment of [
  "void CommandBuildBuilding(CUnit &unit, const Vec2i &pos, CUnitType &what, EFlushMode flush)",
  "order = GetNextOrder(unit, flush);",
  "*order = COrder::NewActionBuild(unit, pos, what);"
]) {
  if (!commandSource.includes(fragment)) {
    errors.push(`Stratagus build command source missing expected fragment: ${fragment}`);
  }
}

for (const fragment of [
  "State_MoveToLocationMax = 10",
  "State_NearOfLocation = 11",
  "State_StartBuilding_Failed = 20",
  "State_BuildFromInside = 21",
  "State_BuildFromOutside = 22",
  "order->Range = builder.Type->RepairRange",
  "order->Range = 1",
  "input.SetMinRange(this->Type->BoolFlag[BUILDEROUTSIDE_INDEX].value && input.GetUnit()->CanMove() ? 1 : 0)",
  "input.SetMaxRange(this->Range)",
  "unit.Wait = CYCLES_PER_SECOND / 4",
  "You cannot reach building place",
  "CheckLimit(unit, type)",
  "CanBuildUnitType(&unit, type, pos, 1)",
  "unit.Wait = 10",
  "unit.Player->SubUnitType(type)",
  "MakeUnit(const_cast<CUnitType &>(type), unit.Player)",
  "ReplaceOnBuild",
  "build->Constructed = 1",
  "build->CurrentSightRange = 0",
  "COrder::NewActionBuilt(unit, *build)",
  "type.BoolFlag[BUILDEROUTSIDE_INDEX].value",
    "UnitShowAnimation(unit, &unit.Type->Animations->Still)",
    "build->ResourcesHeld = ontop.ResourcesHeld",
    "this->State = State_BuildFromInside",
  "this->State = State_BuildFromOutside",
  "AnimateActionBuild(unit)",
  "animations->Build",
  "animations->Repair",
  "targetOrder.ProgressHp(goal, 100)",
  "action-build",
  "\"range\"",
  "\"tile\"",
  "\"building\"",
  "\"type\"",
  "\"state\""
]) {
  if (!source.includes(fragment)) {
    errors.push(`Stratagus build source missing expected fragment: ${fragment}`);
  }
}

for (const [label, text, fragments] of [
  ["world build order", worldSource, [
    'kind: "build"',
    "buildCycle: number",
    "builderInside?: boolean",
    "buildingTypeId: string"
  ]],
  ["orders build action", ordersSource, [
    "export function issueBuildOrder",
    "export function issueBuildAtOrder",
    "export function issueQueueBuildAtOrder",
    "export function issueGroupQueueBuildAtOrder",
    "export function issueQueueBuildOilPlatformAtOrder",
    "export function issueGroupQueueBuildOilPlatformAtOrder",
    "? issueGroupQueueBuildAtOrder(world, unitIds, command.buildingTypeId, x, y)",
    "? issueGroupQueueBuildOilPlatformAtOrder(world, unitIds, x, y)",
    "function placeBuilding",
    "options: { clearQueue?: boolean } = {}",
    "spendResources(player.resources, buildingDefinition.costs)",
    "const totalSeconds = sourceBuildDurationSecondsForPlayer(world, builder.player, buildingDefinition.costs)",
    "const builderInside = !buildingDefinition.builderOutside",
    "building.construction = { builderId: builder.id, builderInside, remainingSeconds: totalSeconds, totalSeconds }",
    "builder.moveQueue.push({ kind: \"build\", buildingTypeId, x: clampedX, y: clampedY })",
    "function startQueuedBuildAtOrder",
    "placeBuilding(world, builder, player, buildingDefinition, tileX, tileY, { clearQueue: false })",
    "function startQueuedBuildOilPlatformOrder",
    "preserveQueue: true",
    "startOilPlatformConstruction(world, builder, oilPatch, player, platformDefinition, { clearQueue: false })",
    "startOilPlatformConstruction(world, unit, oilPatch, player, platformDefinition, { clearQueue: unit.order.preserveQueue !== true })",
    "if (target.kind === \"build\")",
    "if (target.kind === \"build-oil-platform\")",
    "builder.hiddenInConstructionId = building.id",
    "builder.order = {\n    kind: \"build\"",
    "buildCycle: 0",
    "function stepBuildOrder",
    "if (!isInTouchRange(unit, building))",
    "updateUnitFacing(unit, building.x - unit.x, building.y - unit.y)",
    "unit.order.buildCycle += sourceElapsedCycles(world, tickSeconds)",
    "const buildCycleTicks = sourceBuildCycleTicks(world, unit)",
    "progressConstruction(world, building, sourceCyclesToSeconds(world, buildCycleTicks), unit)",
    "function sourceElapsedCycles(world: WorldState, tickSeconds: number): number",
    "return Math.max(0, tickSeconds * sourceDefaultGameSpeed(world))",
    "function sourceBuildCycleTicks(world: WorldState, unit: WorldUnit): number",
    "animation?.actions.Build?.length ? animation.actions.Build : animation?.actions.Repair",
    "return Math.max(1, ticks || sourceOrderRetryTicks(world, 30))",
    "function progressConstruction",
    "function releaseBuilderFromConstruction",
    "function issueCancelConstructionOrder",
    "refundCosts(world, player, definition.costs, 0.75)",
    "restoreOilPatchForRemovedPlatform(world, building)"
  ]],
  ["source replace-on-build metadata", indexSource, [
    "const replaceOnBuild = buildingRules.some((rule) => rule.kind === \"ontop\" && rule.replaceOnBuild === true)",
    "const replaceOnDie = buildingRules.some((rule) => rule.kind === \"ontop\" && rule.replaceOnDie === true)",
    "replaceOnBuild,",
    "replaceOnDie,"
  ]],
  ["source replace-on-build types", typesSource, [
    "replaceOnBuild?: boolean",
    "replaceOnDie?: boolean"
  ]],
  ["save-game build order", saveSource, [
    'kind === "build"',
    "canIssueQueueBuildAt",
    "canIssueQueueBuildOilPlatformAt,",
    "canIssueQueueBuildOilPlatformAt(world, unit, oilPatch.x, oilPatch.y, world.unitDefinitions)",
    "record.kind === \"build-oil-platform\"",
    "preserveQueue",
    "record.kind === \"build\"",
    "buildingTypeId",
    "hasInvalidLoadedBuildOrder",
    "const buildCycleTicks = sourceBuildCycleTicksForSave(world, unit)",
    "buildCycle: Math.max(0, Math.min(buildCycleTicks, finiteNumberOr(record.buildCycle, finiteNumberOr(record.buildBank, 0))))",
    "function sourceBuildCycleTicksForSave",
    "return Math.max(1, ticks || sourceOrderRetryTicksForSave(world, 30))"
  ]],
  ["save-game construction state", saveSource, [
    "function normalizeConstructionState",
    "sourceBuildDurationSecondsForPlayer(world, playerId, definition.costs)",
    "if (sourceTotalSeconds <= 0)",
    "remainingSeconds: Math.min(remainingSeconds, sourceTotalSeconds)",
    "totalSeconds: sourceTotalSeconds"
  ]],
  ["package verify script", packageSource, [
    "\"verify:source-build-action\"",
    "npm run verify:source-build-action"
  ]]
]) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      errors.push(`${label} missing source build fragment: ${fragment}`);
    }
  }
}

for (const unitId of ["unit-human-oil-platform", "unit-orc-oil-platform"]) {
  const unit = unitsById.get(unitId);
  if (!unit) {
    errors.push(`Wargus manifest missing ${unitId}.`);
    continue;
  }
if (unit.replaceOnBuild !== true || unit.replaceOnDie !== true) {
    errors.push(`${unitId} should preserve source ReplaceOnBuild and ReplaceOnDie metadata.`);
  }
}

const caanooTownHall = unitsById.get("unit-caanoo-townhall");
const caanooOntopRule = caanooTownHall?.buildingRules?.find((rule) => rule.kind === "ontop");
if (caanooTownHall?.replaceOnBuild !== true || caanooOntopRule?.typeId !== "unit-buildpoint-townhall" || caanooOntopRule?.replaceOnBuild !== true) {
  errors.push(`unit-caanoo-townhall should preserve source ReplaceOnBuild over unit-buildpoint-townhall, found ${JSON.stringify({ replaceOnBuild: caanooTownHall?.replaceOnBuild, rule: caanooOntopRule })}.`);
}

for (const fragment of [
  "const replacedUnits = sourceReplaceOnBuildTargets(world, buildingDefinition, tileX, tileY)",
  "const replacedResourcesHeld = replacedUnits.length > 0 ? Math.max(0, Math.floor(replacedUnits[0]?.resourcesHeld ?? 0)) : 0",
  "resourcesHeld: replacedResourcesHeld",
  "clearReferencesToUnavailableUnits(world, replacedUnitIds)",
  "world.units.push(...replacedUnits)",
  "const replaceOnBuildIgnoredUnitIds = new Set(sourceReplaceOnBuildTargets(world, buildingDefinition, tileX, tileY).map((unit) => unit.id))",
  "const ignoredUnitIds = new Set(replaceOnBuildIgnoredUnitIds)",
  "ignoredUnitIds.add(ignoredUnitId)",
  "const ignorePassabilityBlockers = ignoredUnitIds.size > 1",
  "isTilePassable(world, x, y, movement, passabilityIgnoredUnitId, ignorePassabilityBlockers)",
  "isOccupiedByAnyLiveUnit(world, x, y, undefined, ignoredUnitIds)",
  "canPlaceBuilding(world, buildingDefinition, tileX, tileY, builder.id)",
  "function sourceReplaceOnBuildTargets(world: WorldState, buildingDefinition: WargusUnit, tileX: number, tileY: number): WorldUnit[]",
  "!buildingDefinition.replaceOnBuild || !ontopRule?.replaceOnBuild",
  "&& unit.typeId === ontopRule.typeId",
  "&& footprintTileGap(world, tileX, tileY, width, height, unit) === 0"
]) {
  if (!ordersSource.includes(fragment)) {
    errors.push(`Generic ReplaceOnBuild runtime missing fragment: ${fragment}`);
  }
}

if (ordersSource.includes("unit.order.buildCycle += Math.max(0, tickSeconds * world.tickRate)")) {
  errors.push("Build cycle accumulation should use sourceElapsedCycles instead of inline browser tick-rate math.");
}
if (ordersSource.includes("tickSeconds * world.tickRate")) {
  errors.push("Build cycle source elapsed conversion should use sourceDefaultGameSpeed instead of raw browser tick-rate math.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source build action verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source build action verified (source states, placement/start, inside/outside builder handling, build animation cadence, cancellation, and save/load state).");
