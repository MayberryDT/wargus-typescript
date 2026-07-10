import type { WorldState, WorldUnit } from "./world";
import { isUnitFootprintPassable, movementKindForUnit, tileToWorldCenter, unitFootprintPathPlanningCost, worldToTile } from "./passability";

export interface PathPoint {
  x: number;
  y: number;
}

export interface PathSearchResult {
  status: "ready" | "temporarily-blocked" | "unreachable";
  path: PathPoint[];
  goalRange: number | null;
}

interface NodeRecord {
  x: number;
  y: number;
  g: number;
  h: number;
  distanceToGoal: number;
  f: number;
  parent: string | null;
}

const sourceDirections = [
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 }
];

export function findPath(world: WorldState, unit: WorldUnit, targetX: number, targetY: number): PathPoint[] {
  const result = findPathResult(world, unit, targetX, targetY);
  return result.status === "ready" ? result.path : [];
}

export function findPathResult(world: WorldState, unit: WorldUnit, targetX: number, targetY: number): PathSearchResult {
  const start = worldToTile(world, unit.x, unit.y);
  const target = worldToTile(world, targetX, targetY);
  const movement = movementKindForUnit(unit);
  if (isUnitFootprintPassable(world, target.x, target.y, unit, movement, true)) {
    const exactGoals = new Set([key(target.x, target.y)]);
    const exactPath = searchPath(world, unit, start, exactGoals, target, "path-planning");
    if (exactPath) {
      return { status: "ready", path: exactPath, goalRange: 0 };
    }
    const terrainPath = searchPath(world, unit, start, exactGoals, target, "none");
    if (terrainPath) {
      return { status: "temporarily-blocked", path: terrainPath, goalRange: 0 };
    }
  }

  const maxGoalRange = Math.max(world.map.width, world.map.height) - 1;
  for (let goalRange = 1; goalRange <= maxGoalRange; goalRange += 1) {
    const goals = reachableGoalKeysAtRange(world, unit, target, goalRange);
    if (goals.size === 0) {
      continue;
    }
    const path = searchPath(world, unit, start, goals, target, "path-planning");
    if (path) {
      return { status: "ready", path, goalRange };
    }
  }
  return { status: "unreachable", path: [], goalRange: null };
}

function searchPath(
  world: WorldState,
  unit: WorldUnit,
  start: { x: number; y: number },
  goalKeys: Set<string>,
  heuristicTarget: { x: number; y: number },
  blockers: "path-planning" | "none"
): PathPoint[] | null {
  if (goalKeys.size === 0) {
    return null;
  }

  const startKey = key(start.x, start.y);
  const open = new Map<string, NodeRecord>();
  const closed = new Set<string>();
  const records = new Map<string, NodeRecord>();
  const startDistance = sourceAStarManhattanDistance(start.x, start.y, heuristicTarget.x, heuristicTarget.y);
  const startCostToGoal = startDistance << 3;
  open.set(startKey, { x: start.x, y: start.y, g: 1, h: startCostToGoal, distanceToGoal: startDistance, f: 1 + startCostToGoal, parent: null });

  while (open.size > 0) {
    const current = getBest(open);
    const currentKey = key(current.x, current.y);
    if (goalKeys.has(currentKey)) {
      records.set(currentKey, current);
      return reconstruct(world, current, records);
    }

    open.delete(currentKey);
    closed.add(currentKey);
    records.set(currentKey, current);

    const parent = current.parent ? records.get(current.parent) : null;
    for (const direction of sourceDirections) {
      const nx = current.x + direction.x;
      const ny = current.y + direction.y;
      const nextKey = key(nx, ny);
      if (parent && nx === parent.x && ny === parent.y) {
        continue;
      }
      const moveCost = footprintSearchCost(world, unit, nx, ny, blockers);
      if (closed.has(nextKey) || !Number.isFinite(moveCost)) {
        continue;
      }
      if (direction.x !== 0 && direction.y !== 0) {
        const canCutCorner =
          Number.isFinite(footprintSearchCost(world, unit, current.x + direction.x, current.y, blockers)) &&
          Number.isFinite(footprintSearchCost(world, unit, current.x, current.y + direction.y, blockers));
        if (!canCutCorner) {
          continue;
        }
      }

      const g = current.g + moveCost;
      const distanceToGoal = sourceAStarManhattanDistance(nx, ny, heuristicTarget.x, heuristicTarget.y);
      const costToGoal = distanceToGoal << 3;
      const existing = open.get(nextKey);
      if (existing && g >= existing.g) {
        continue;
      }
      open.set(nextKey, {
        x: nx,
        y: ny,
        g,
        h: costToGoal,
        distanceToGoal,
        f: g + costToGoal,
        parent: currentKey
      });
    }
  }

  return null;
}

function footprintSearchCost(
  world: WorldState,
  unit: WorldUnit,
  tileX: number,
  tileY: number,
  blockers: "path-planning" | "none"
): number {
  const movement = movementKindForUnit(unit);
  if (blockers === "none") {
    return isUnitFootprintPassable(world, tileX, tileY, unit, movement, true) ? 1 : Number.POSITIVE_INFINITY;
  }
  return unitFootprintPathPlanningCost(world, tileX, tileY, unit, movement);
}

function reachableGoalKeysAtRange(world: WorldState, unit: WorldUnit, target: { x: number; y: number }, goalRange: number): Set<string> {
  const movement = movementKindForUnit(unit);
  const goals = new Set<string>();
  for (let y = target.y - goalRange; y <= target.y + goalRange; y += 1) {
    for (let x = target.x - goalRange; x <= target.x + goalRange; x += 1) {
      if (Math.abs(x - target.x) !== goalRange && Math.abs(y - target.y) !== goalRange) {
        continue;
      }
      if (isUnitFootprintPassable(world, x, y, unit, movement, true)) {
        goals.add(key(x, y));
      }
    }
  }
  return goals;
}

function getBest(open: Map<string, NodeRecord>): NodeRecord {
  let best: NodeRecord | null = null;
  for (const node of open.values()) {
    if (!best || sourceAStarNodeComesBefore(node, best)) {
      best = node;
    }
  }
  if (!best) {
    throw new Error("Pathfinding open set unexpectedly empty");
  }
  return best;
}

function reconstruct(world: WorldState, end: NodeRecord, records: Map<string, NodeRecord>): PathPoint[] {
  const reversed: PathPoint[] = [];
  let current: NodeRecord | undefined = end;
  while (current) {
    reversed.push(tileToWorldCenter(world, current.x, current.y));
    current = current.parent ? records.get(current.parent) : undefined;
  }
  return simplifyPath(reversed.reverse());
}

function simplifyPath(path: PathPoint[]): PathPoint[] {
  if (path.length <= 2) {
    return path;
  }
  const simplified = [path[0]];
  let lastDx = Math.sign(path[1].x - path[0].x);
  let lastDy = Math.sign(path[1].y - path[0].y);
  for (let index = 1; index < path.length - 1; index += 1) {
    const dx = Math.sign(path[index + 1].x - path[index].x);
    const dy = Math.sign(path[index + 1].y - path[index].y);
    if (dx !== lastDx || dy !== lastDy) {
      simplified.push(path[index]);
      lastDx = dx;
      lastDy = dy;
    }
  }
  simplified.push(path[path.length - 1]);
  return simplified;
}

function sourceAStarNodeComesBefore(left: NodeRecord, right: NodeRecord): boolean {
  return left.f < right.f
    || (left.f === right.f
      && (left.h < right.h
        || (left.h === right.h && left.distanceToGoal < right.distanceToGoal)));
}

function sourceAStarManhattanDistance(x: number, y: number, tx: number, ty: number): number {
  return Math.abs(tx - x) + Math.abs(ty - y);
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}
