import { readFileSync } from "node:fs";

const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");

const errors = [];

function expect(fragment, message) {
  if (!ordersSource.includes(fragment)) {
    errors.push(message);
  }
}

function forbid(fragment, message) {
  if (ordersSource.includes(fragment)) {
    errors.push(message);
  }
}

for (const [fragment, message] of [
  ["function unitFootprintBounds", "Orders should derive rectangular unit footprint bounds for building/resource interactions."],
  ["function distanceToUnitFootprint", "Orders should measure distance to the target footprint edge instead of only the target center."],
  ["function isInUnitFootprintRange", "Orders should have a shared footprint range predicate."],
  ["function sourceUnitInteractionTargetPoint", "Orders should pick a passable perimeter point around occupied target footprints."],
  ["function sourceUnitInteractionPath", "Orders should path to footprint perimeter points."],
  ["function sourceAttackTargetPath", "Attack orders should use footprint-aware paths for structures."],
  ["function sourceOrderTargetPath", "Blocked movement recovery should rebuild footprint-aware order paths."],
  ["sourceOrderTargetPath(world, unit)", "stepMoveOrder should recover blocked paths through the order-aware path helper."],
  ["sourceUnitInteractionPath(world, builder, building, sourceTouchRange(world, builder))", "New building placement should path builders to a passable building edge."],
  ["sourceUnitInteractionPath(world, unit, building, sourceTouchRange(world, unit))", "Active build orders should retarget to a passable building edge."],
  ["sourceUnitInteractionPath(world, unit, oilPatch, sourceTouchRange(world, unit))", "Build-oil-platform orders should retarget to a passable patch edge."],
  ["sourceUnitInteractionPath(world, unit, target, sourceRepairRange(unit))", "Repair orders should retarget to a passable target edge."],
  ["sourceUnitInteractionPath(world, unit, target, sourceResourceSourceRange(world, unit))", "Harvest orders should retarget to a passable resource edge."],
  ["sourceUnitInteractionPath(world, unit, resourceTarget, sourceResourceSourceRange(world, unit))", "Queued harvest orders should start from a passable resource edge."],
  ["sourceAttackTargetPath(world, unit, target)", "Direct attack orders should use footprint-aware target paths."],
  ["sourceAttackTargetPath(world, unit, attackTarget)", "Queued attack target orders should use footprint-aware target paths."],
  ["distanceToUnitFootprint(world, target, unit.x, unit.y)", "Attack range should measure structure distance from the target footprint edge."],
  ["function sourceUnitInteractionTargetPoint(world: WorldState, unit: WorldUnit, target: WorldUnit, rangePixels: number): { x: number; y: number } | null", "Footprint target selection should return null instead of falling back to occupied centers."],
  ["isInTouchRange(builder, building, world)", "Build reachability should use world-aware footprint touch range."],
  ["isInRepairRange(unit, target, world)", "Repair range should use world-aware footprint range."]
]) {
  expect(fragment, message);
}

for (const [fragment, message] of [
  ["function isInResourceRangePoint", "Old center/radius resource range helper should not be used for mine/platform orders."],
  ["const path = findPath(world, builder, building.x, building.y);", "New building placement should not path to the occupied building center."],
  ["unit.order.path = findPath(world, unit, building.x, building.y);", "Active build orders should not retarget to the occupied building center."],
  ["const path = findPath(world, builder, oilPatch.x, oilPatch.y);", "Build-oil-platform orders should not path to the occupied patch center."],
  ["unit.order.path = findPath(world, unit, oilPatch.x, oilPatch.y);", "Active build-oil-platform orders should not retarget to the occupied patch center."],
  ["const path = findPath(world, unit, repairTarget.x, repairTarget.y);", "Queued repair orders should not path to the occupied repair target center."],
  ["const path = isInAttackRange(unit, target, world) ? [] : findPath(world, unit, target.x, target.y);", "Attack orders should not path to the occupied structure center."],
  ["const path = inRange ? [] : findPath(world, unit, attackTarget.x, attackTarget.y);", "Queued attack target orders should not path to the occupied structure center."],
  ["return { x: target.x, y: target.y };", "Footprint target selection should not fall back to occupied target centers."]
]) {
  forbid(fragment, message);
}

if (!packageSource.includes('"verify:source-footprint-interactions"')) {
  errors.push("package.json should expose verify:source-footprint-interactions.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source footprint interaction verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source footprint interactions verified (building/resource/repair/attack range and pathing use target footprints).");
