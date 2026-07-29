import { accessSync, constants, readFileSync } from "node:fs";
import path from "node:path";

const sourceRoot = process.env.WARGUS_ORIGINAL_SOURCE_ROOT;
if (!sourceRoot?.trim()) {
  console.error("WARGUS_ORIGINAL_SOURCE_ROOT must name a readable Stratagus source root.");
  process.exit(1);
}
const sourceFiles = {
  pathfinder: path.join(sourceRoot, "src/pathfinder/pathfinder.cpp"),
  astar: path.join(sourceRoot, "src/pathfinder/astar.cpp"),
  move: path.join(sourceRoot, "src/action/action_move.cpp")
};
for (const sourceFile of Object.values(sourceFiles)) {
  try {
    accessSync(sourceFile, constants.R_OK);
  } catch {
    console.error("WARGUS_ORIGINAL_SOURCE_ROOT requires a readable source file: " + sourceFile);
    process.exit(1);
  }
}
const sourcePathfinder = readFileSync(sourceFiles.pathfinder, "utf8");
const sourceAstar = readFileSync(sourceFiles.astar, "utf8");
const sourceMove = readFileSync(sourceFiles.move, "utf8");
const pathfindingSource = readFileSync("src/simulation/pathfinding.ts", "utf8");
const passabilitySource = readFileSync("src/simulation/passability.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");

const errors = [];

function expectIncludes(label, source, fragments) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      errors.push(`${label} missing source pathfinding fragment: ${fragment}`);
    }
  }
}

expectIncludes("Stratagus pathfinder.cpp", sourcePathfinder, [
  "void InitPathfinder()",
  "AStarFindPath(srcTilePos, goalPos, w, h",
  "srcTW, srcTH",
  "dst.Type->TileWidth, dst.Type->TileHeight",
  "src.Type->TileWidth, src.Type->TileHeight",
  "PathFinderInput::GetUnitSize",
  "unit->Type->TileWidth",
  "unit->Type->TileHeight",
  "PathFinderInput::SetGoal",
  "Large units may have a goal that goes outside the map",
  "Map.Info.MapWidth - unit->Type->TileWidth",
  "AStarFindPath(input.GetUnitPos()",
  "input.GetGoalSize().x, input.GetGoalSize().y",
  "input.GetUnitSize().x, input.GetUnitSize().y",
  "PathFinderOutput::MAX_PATH_LENGTH"
]);

expectIncludes("Stratagus astar.cpp", sourceAstar, [
  "AStarCosts",
  "baseCost << 3",
  "const int Heading2X[9] = {  0, +1, +1, +1, 0, -1, -1, -1, 0 }",
  "const int Heading2Y[9] = { -1, -1, 0, +1, +1, +1, 0, -1, 0 }",
  "AStarMatrix[eo].SetCostFromStart(1)",
  "if (endPos.x == px && endPos.y == py)",
  "new_cost++;",
  "AStarFixedUnitCrossingCost",
  "AStarMovingUnitCrossingCost",
  "AStarMaxSearchIterations",
  "AStarUnknownTerrainCost",
  "const CUnitTypeFinder unit_finder(unit.Type->MoveType)",
  "int AStarFindPath",
  "int tilesizex",
  "int tilesizey",
  "goal.x + tilesizex > AStarMapWidth",
  "const Vec2i tileSize(tilesizex, tilesizey)",
  "const Vec2i extratilesize(tilesizex - 1, tilesizey - 1)",
  "CostMoveTo(eo, unit)"
]);

expectIncludes("Stratagus action_move.cpp", sourceMove, [
  "COrder_Move::UpdatePathFinderData",
  "input.SetGoal(this->goalPos, tileSize)",
  "DoActionMove",
  "PF_UNREACHABLE"
]);

expectIncludes("browser passability", passabilitySource, [
  "type PassabilityBlockers = \"all\" | \"path-planning\" | \"static\" | \"none\"",
  "export function isTilePassable",
  "export function isUnitFootprintPassable",
  "ignoreBlockers ? \"none\" : \"all\"",
  "function tilePassabilityCost",
  "const width = Math.max(1, Math.floor(unit.tileWidth))",
  "const height = Math.max(1, Math.floor(unit.tileHeight))",
  "const left = centerTileX - Math.floor(width / 2)",
  "const top = centerTileY - Math.floor(height / 2)",
  "for (let y = top; y < top + height; y += 1)",
  "for (let x = left; x < left + width; x += 1)",
  "export function unitFootprintPathPlanningCost",
  "export function unitFootprintStaticPlanningCost",
  "export function hasPathPlanningOccupancy",
  "export function hasMobilePathPlanningOccupancy",
  "function blockerCrossingCost",
  "blockers === \"path-planning\" && !isActivelyMovingOccupant(unit)",
  "blockers === \"static\" && isPermanentlyStationaryOccupant(unit)",
  "return crossesMovingOccupant ? 5 : 1",
  "function isRelevantSolidOccupant",
  "movementKindForUnit(unit) === movement",
  "function unitFootprintContainsTile",
  "function isActivelyMovingOccupant",
  "unit.order && \"path\" in unit.order && unit.order.pathIndex < unit.order.path.length",
  "function isPermanentlyStationaryOccupant"
]);

expectIncludes("browser pathfinding", pathfindingSource, [
  "unitFootprintPathPlanningCost",
  "export function findPath",
  "searchReachable(world, unit, start, target, \"all\", true)",
  "targetLegacyPassable",
  "return search.nearestPath ?? []",
  "export function findPathResult",
  "status: \"ready\" | \"temporarily-blocked\" | \"unreachable\"",
  "const sourceDirections = [",
  "{ x: 0, y: -1 }",
  "{ x: 1, y: -1 }",
  "{ x: -1, y: -1 }",
  "searchReachable(world, unit, start, target, \"path-planning\", true)",
  "hasMobilePathPlanningOccupancy(world, unit)",
  "searchReachable(world, unit, start, target, \"static\", true, \"path-planning\")",
  "planningRange > staticRange",
  "{ status: \"temporarily-blocked\", path: staticPath }",
  "goalBlockers: SearchBlockers = blockers",
  "const validGoal = Number.isFinite(footprintSearchCost",
  "{ status: \"unreachable\", path: [] }",
  "function searchReachable",
  "const openHeap: NodeRecord[] = []",
  "pushOpenNode(openHeap, startNode)",
  "const current = popOpenNode(openHeap)",
  "const range = sourceGoalRange(current.x, current.y, target.x, target.y)",
  "function sourceGoalRange",
  "function nearestGoalNodeComesBefore",
  "return openNodeComesBefore(left, right)",
  "g: 1",
  "startCostToGoal = startDistance << 3",
  "const parent = current.parent ? records.get(current.parent) : null",
  "if (parent && nx === parent.x && ny === parent.y)",
  "const moveCost = footprintSearchCost(world, unit, nx, ny, blockers)",
  "footprintSearchCost(world, unit, current.x + direction.x, current.y, blockers)",
  "footprintSearchCost(world, unit, current.x, current.y + direction.y, blockers)",
  "const g = current.g + moveCost",
  "const costToGoal = distanceToGoal << 3",
  "sourceAStarNodeComesBefore",
  "function sourceAStarManhattanDistance",
  "function footprintSearchCost",
  "isUnitFootprintPassable(world, tileX, tileY, unit, movement, true)",
  "isUnitFootprintPassable(world, tileX, tileY, unit, movement)",
  "unitFootprintStaticPlanningCost(world, tileX, tileY, unit, movement)",
  "return simplifyPath(reversed.reverse())"
]);

const movingOccupantHelper = passabilitySource.match(/function isActivelyMovingOccupant[\s\S]*?\n}/)?.[0] ?? "";
if (movingOccupantHelper.includes(".speed")) {
  errors.push("browser passability must not use unit speed as current-motion state");
}
if (
  pathfindingSource.includes("findNearestPassableTarget")
  || pathfindingSource.includes("radius <= 12")
  || pathfindingSource.includes("reachableGoalKeysAtRange")
  || pathfindingSource.includes("for (let goalRange")
) {
  errors.push("browser pathfinding must use one bounded reachability traversal rather than first-local, fixed-radius, or per-ring searches");
}
const pathSearchResult = pathfindingSource.match(/export interface PathSearchResult[\s\S]*?\n}/)?.[0] ?? "";
if (pathSearchResult.includes("goalRange")) {
  errors.push("PathSearchResult must not expose unused goalRange metadata");
}

expectIncludes("orders path use", ordersSource, [
  "import { findPath, findPathResult } from \"./pathfinding\"",
  "interface PlannedMoveOrder",
  "function planMoveOrder",
  "function commitMoveOrder",
  "sourceOrderRetryTicks(world, 10)",
  "unit.order.path = findPath(world, unit, unit.order.targetX, unit.order.targetY)",
  "const movement = movementKindForUnit(unit)",
  "isUnitFootprintPassable(world, waypointTile.x, waypointTile.y, unit, movement, false)",
  "isUnitFootprintPassable(world, nextTile.x, nextTile.y, unit, movement, false)",
  "const path = findPath(world, unit, target.x, target.y)"
]);

const planMoveOrderBody = ordersSource.match(/function planMoveOrder[\s\S]*?\n}\n\nfunction commitMoveOrder/)?.[0] ?? "";
const commitMoveOrderBody = ordersSource.match(/function commitMoveOrder[\s\S]*?\n}\n\nexport function issueMoveOrder/)?.[0] ?? "";
const issueMoveOrderBody = ordersSource.match(/export function issueMoveOrder[\s\S]*?\n}\n\nexport function canIssueMoveAt/)?.[0] ?? "";
const canIssueMoveAtBody = ordersSource.match(/export function canIssueMoveAt[\s\S]*?\n}\n\nexport function canIssueQueueMoveAt/)?.[0] ?? "";
const groupSmartMoveBody = ordersSource.match(/export function issueGroupSmartOrder[\s\S]*?\n}\n\nexport function issueGroupQueueSmartOrder/)?.[0] ?? "";
const groupMoveBody = ordersSource.match(/export function issueGroupMoveOrder[\s\S]*?\n}\n\nexport function issueGroupQueueMoveOrder/)?.[0] ?? "";
const stackRecoveryBody = ordersSource.match(/function resolveStackedMovableUnit[\s\S]*?\n}\n\nfunction nearestPassableAdjacentTile/)?.[0] ?? "";

if ((planMoveOrderBody.match(/findPathResult\(/g) ?? []).length !== 1) {
  errors.push("planMoveOrder must calculate exactly one ordinary Move route");
}
if (commitMoveOrderBody.includes("findPath") || commitMoveOrderBody.includes("planMoveOrder")) {
  errors.push("commitMoveOrder must commit the supplied route without planning or revalidation");
}
for (const [label, body] of [
  ["issueMoveOrder", issueMoveOrderBody],
  ["issueGroupSmartOrder", groupSmartMoveBody],
  ["issueGroupMoveOrder", groupMoveBody]
]) {
  if (
    (body.match(/planMoveOrder\(/g) ?? []).length !== 1
    || (body.match(/commitMoveOrder\(/g) ?? []).length !== 1
  ) {
    errors.push(`${label} must plan once and commit that exact ordinary Move result`);
  }
}
for (const [label, body] of [
  ["issueGroupSmartOrder", groupSmartMoveBody],
  ["issueGroupMoveOrder", groupMoveBody]
]) {
  if (body.includes("canIssueMoveAt") || body.includes("issueMoveOrder(")) {
    errors.push(`${label} must not repeat ordinary Move planning through can/issue wrappers`);
  }
}
if (!canIssueMoveAtBody.includes("planMoveOrder") || canIssueMoveAtBody.includes("findPathResult(")) {
  errors.push("canIssueMoveAt must use the standalone ordinary Move planner");
}
if (
  !stackRecoveryBody.includes("planMoveOrder(world, unit")
  || !stackRecoveryBody.includes("sourceOrderTargetPath(world, unit)")
  || !stackRecoveryBody.includes("stopUnusablePathOrder(world, unit)")
) {
  errors.push("stack recovery must replan ordinary Move separately, preserve source target paths for other orders, and stop unusable paths");
}

const liveMoveStep = ordersSource.match(/function stepMoveOrder[\s\S]*?\n}\n\nfunction isUsableReplacementPath/)?.[0] ?? "";
if ((liveMoveStep.match(/isUnitFootprintPassable\(/g) ?? []).length !== 2 || liveMoveStep.includes("isTilePassable(")) {
  errors.push("stepMoveOrder must use whole-unit footprint passability at both live movement gates");
}

expectIncludes("save path normalization", saveSource, [
  "function hasValidLoadedPathToPoint",
  "function normalizePath",
  "function clampPathIndex",
  "unit.moveQueue = normalizeMoveQueue(world, unit.moveQueue, unit)"
]);

expectIncludes("package verify script", packageSource, [
  "\"verify:source-pathfinding\"",
  "npm run verify:source-pathfinding"
]);

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source pathfinding verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source pathfinding verified (A* source unit/goal tile sizes, browser footprint passability, diagonal corner guards, order/save wiring).");
