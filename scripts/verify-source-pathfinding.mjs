import { readFileSync } from "node:fs";

const sourcePathfinder = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/pathfinder/pathfinder.cpp", "utf8");
const sourceAstar = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/pathfinder/astar.cpp", "utf8");
const sourceMove = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_move.cpp", "utf8");
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
  "type PassabilityBlockers = \"all\" | \"path-planning\" | \"none\"",
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
  "blockers === \"all\" || occupants.some((occupant) => !isActivelyMovingOccupant(occupant))",
  "return 5",
  "function blockingOccupantsAt",
  "unit.hitPoints <= 0 || isUnitHiddenInConstruction(unit) || isUnitInsideResourceSource(unit) || unit.nonSolid",
  "function unitFootprintContainsTile",
  "function isActivelyMovingOccupant",
  "unit.order && \"path\" in unit.order && unit.order.pathIndex < unit.order.path.length"
]);

expectIncludes("browser pathfinding", pathfindingSource, [
  "unitFootprintPathPlanningCost",
  "export function findPath",
  "return result.status === \"ready\" ? result.path : []",
  "export function findPathResult",
  "status: \"ready\" | \"temporarily-blocked\" | \"unreachable\"",
  "const sourceDirections = [",
  "{ x: 0, y: -1 }",
  "{ x: 1, y: -1 }",
  "{ x: -1, y: -1 }",
  "searchPath(world, unit, start, exactGoals, target, \"path-planning\")",
  "searchPath(world, unit, start, exactGoals, target, \"none\")",
  "return { status: \"temporarily-blocked\", path: terrainPath, goalRange: 0 }",
  "const maxGoalRange = Math.max(world.map.width, world.map.height) - 1",
  "reachableGoalKeysAtRange(world, unit, target, goalRange)",
  "return { status: \"unreachable\", path: [], goalRange: null }",
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
  "function reachableGoalKeysAtRange",
  "isUnitFootprintPassable(world, x, y, unit, movement, true)",
  "return simplifyPath(reversed.reverse())"
]);

const movingOccupantHelper = passabilitySource.match(/function isActivelyMovingOccupant[\s\S]*?\n}/)?.[0] ?? "";
if (movingOccupantHelper.includes(".speed")) {
  errors.push("browser passability must not use unit speed as current-motion state");
}
if (pathfindingSource.includes("findNearestPassableTarget") || pathfindingSource.includes("radius <= 12")) {
  errors.push("browser pathfinding must not keep the first-local-candidate or fixed-radius-12 goal search");
}

expectIncludes("orders path use", ordersSource, [
  "import { findPath, findPathResult } from \"./pathfinding\"",
  "const path = findPathResult(world, unit, clampedX, clampedY).path",
  "findPathResult(world, unit, clampedX, clampedY).status !== \"unreachable\"",
  "unit.order.path = findPath(world, unit, unit.order.targetX, unit.order.targetY)",
  "if (!isTilePassable(world, waypointTile.x, waypointTile.y, movementKindForUnit(unit), unit.id))",
  "const path = findPath(world, unit, target.x, target.y)"
]);

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
