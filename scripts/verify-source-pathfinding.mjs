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
  "export function isTilePassable",
  "export function isUnitFootprintPassable",
  "const width = Math.max(1, Math.floor(unit.tileWidth))",
  "const height = Math.max(1, Math.floor(unit.tileHeight))",
  "const left = centerTileX - Math.floor(width / 2)",
  "const top = centerTileY - Math.floor(height / 2)",
  "for (let y = top; y < top + height; y += 1)",
  "for (let x = left; x < left + width; x += 1)",
  "isTilePassable(world, x, y, movement, unit.id, ignoreBlockers)",
  "function unitFootprintContainsTile"
]);

expectIncludes("browser pathfinding", pathfindingSource, [
  "import { isUnitFootprintPassable, movementKindForUnit, tileToWorldCenter, worldToTile }",
  "export function findPath",
  "const sourceDirections = [",
  "{ x: 0, y: -1 }",
  "{ x: 1, y: -1 }",
  "{ x: -1, y: -1 }",
  "const movement = movementKindForUnit(unit)",
  "findNearestPassableTarget(world, worldToTile(world, targetX, targetY), unit, movement)",
  "g: 1",
  "startCostToGoal = startDistance << 3",
  "const parent = current.parent ? records.get(current.parent) : null",
  "if (parent && nx === parent.x && ny === parent.y)",
  "isUnitFootprintPassable(world, nx, ny, unit, movement)",
  "isUnitFootprintPassable(world, current.x + direction.x, current.y, unit, movement)",
  "isUnitFootprintPassable(world, current.x, current.y + direction.y, unit, movement)",
  "const g = current.g + 1",
  "const costToGoal = distanceToGoal << 3",
  "sourceAStarNodeComesBefore",
  "function sourceAStarManhattanDistance",
  "function findNearestPassableTarget",
  "isUnitFootprintPassable(world, target.x, target.y, unit, movement)",
  "Math.abs(x - target.x) !== radius && Math.abs(y - target.y) !== radius",
  "return simplifyPath(reversed.reverse())"
]);

expectIncludes("orders path use", ordersSource, [
  "import { findPath } from \"./pathfinding\"",
  "const path = findPath(world, unit, clampedX, clampedY)",
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
