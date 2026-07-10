import type { WorldState, WorldUnit } from "./world";
import { hasPathPlanningOccupancy, isUnitFootprintPassable, movementKindForUnit, tileToWorldCenter, unitFootprintPathPlanningCost, worldToTile } from "./passability";

export interface PathPoint {
  x: number;
  y: number;
}

export interface PathSearchResult {
  status: "ready" | "temporarily-blocked" | "unreachable";
  path: PathPoint[];
}

type SearchBlockers = "all" | "path-planning" | "none";

interface NodeRecord {
  x: number;
  y: number;
  g: number;
  h: number;
  distanceToGoal: number;
  f: number;
  parent: string | null;
  sequence: number;
}

interface ReachableSearchResult {
  exactPath: PathPoint[] | null;
  nearestPath: PathPoint[] | null;
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
  const start = worldToTile(world, unit.x, unit.y);
  const target = worldToTile(world, targetX, targetY);
  const targetTerrainPassable = Number.isFinite(footprintSearchCost(world, unit, target.x, target.y, "none"));
  const targetLegacyPassable = Number.isFinite(footprintSearchCost(world, unit, target.x, target.y, "all"));
  const search = searchReachable(world, unit, start, target, "all", true);
  if (search.exactPath) {
    return search.exactPath;
  }
  if (
    targetTerrainPassable
    && targetLegacyPassable
    && hasPathPlanningOccupancy(world, unit)
    && searchExactPath(world, unit, start, target, "none")
  ) {
    return [];
  }
  return search.nearestPath ?? [];
}

export function findPathResult(world: WorldState, unit: WorldUnit, targetX: number, targetY: number): PathSearchResult {
  const start = worldToTile(world, unit.x, unit.y);
  const target = worldToTile(world, targetX, targetY);
  const targetTerrainPassable = Number.isFinite(footprintSearchCost(world, unit, target.x, target.y, "none"));
  const targetPlanningPassable = Number.isFinite(footprintSearchCost(world, unit, target.x, target.y, "path-planning"));
  const search = searchReachable(world, unit, start, target, "path-planning", true);
  if (search.exactPath) {
    return { status: "ready", path: search.exactPath };
  }
  if (
    targetTerrainPassable
    && targetPlanningPassable
    && hasPathPlanningOccupancy(world, unit)
  ) {
    const terrainPath = searchExactPath(world, unit, start, target, "none");
    if (terrainPath) {
      return { status: "temporarily-blocked", path: terrainPath };
    }
  }
  return search.nearestPath
    ? { status: "ready", path: search.nearestPath }
    : { status: "unreachable", path: [] };
}

function searchExactPath(
  world: WorldState,
  unit: WorldUnit,
  start: { x: number; y: number },
  target: { x: number; y: number },
  blockers: SearchBlockers
): PathPoint[] | null {
  return searchReachable(world, unit, start, target, blockers, false).exactPath;
}

function searchReachable(
  world: WorldState,
  unit: WorldUnit,
  start: { x: number; y: number },
  target: { x: number; y: number },
  blockers: SearchBlockers,
  trackNearest: boolean
): ReachableSearchResult {
  const startKey = key(start.x, start.y);
  const targetKey = key(target.x, target.y);
  const openByKey = new Map<string, NodeRecord>();
  const openHeap: NodeRecord[] = [];
  const closed = new Set<string>();
  const records = new Map<string, NodeRecord>();
  let nextSequence = 1;
  let nearest: NodeRecord | null = null;
  let nearestRange = Number.POSITIVE_INFINITY;
  const startDistance = sourceAStarManhattanDistance(start.x, start.y, target.x, target.y);
  const startCostToGoal = startDistance << 3;
  const startNode: NodeRecord = { x: start.x, y: start.y, g: 1, h: startCostToGoal, distanceToGoal: startDistance, f: 1 + startCostToGoal, parent: null, sequence: 0 };
  openByKey.set(startKey, startNode);
  pushOpenNode(openHeap, startNode);

  while (openHeap.length > 0) {
    const current = popOpenNode(openHeap);
    const currentKey = key(current.x, current.y);
    if (openByKey.get(currentKey) !== current || closed.has(currentKey)) {
      continue;
    }
    openByKey.delete(currentKey);
    closed.add(currentKey);
    records.set(currentKey, current);
    if (currentKey === targetKey) {
      return { exactPath: reconstruct(world, current, records), nearestPath: null };
    }
    if (trackNearest) {
      const range = sourceGoalRange(current.x, current.y, target.x, target.y);
      if (
        !nearest
        || range < nearestRange
        || (range === nearestRange && nearestGoalNodeComesBefore(current, nearest))
      ) {
        nearest = current;
        nearestRange = range;
      }
    }

    const parent = current.parent ? records.get(current.parent) : null;
    for (const direction of sourceDirections) {
      const nx = current.x + direction.x;
      const ny = current.y + direction.y;
      const nextKey = key(nx, ny);
      if (parent && nx === parent.x && ny === parent.y) {
        continue;
      }
      if (closed.has(nextKey)) {
        continue;
      }
      const moveCost = footprintSearchCost(world, unit, nx, ny, blockers);
      if (!Number.isFinite(moveCost)) {
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
      const distanceToGoal = sourceAStarManhattanDistance(nx, ny, target.x, target.y);
      const costToGoal = distanceToGoal << 3;
      const existing = openByKey.get(nextKey);
      if (existing && g >= existing.g) {
        continue;
      }
      const node: NodeRecord = {
        x: nx,
        y: ny,
        g,
        h: costToGoal,
        distanceToGoal,
        f: g + costToGoal,
        parent: currentKey,
        sequence: existing?.sequence ?? nextSequence++
      };
      openByKey.set(nextKey, node);
      pushOpenNode(openHeap, node);
    }
  }

  return {
    exactPath: null,
    nearestPath: nearest ? reconstruct(world, nearest, records) : null
  };
}

function footprintSearchCost(
  world: WorldState,
  unit: WorldUnit,
  tileX: number,
  tileY: number,
  blockers: SearchBlockers
): number {
  const movement = movementKindForUnit(unit);
  if (blockers === "none") {
    return isUnitFootprintPassable(world, tileX, tileY, unit, movement, true) ? 1 : Number.POSITIVE_INFINITY;
  }
  if (blockers === "all") {
    return isUnitFootprintPassable(world, tileX, tileY, unit, movement) ? 1 : Number.POSITIVE_INFINITY;
  }
  return unitFootprintPathPlanningCost(world, tileX, tileY, unit, movement);
}

function sourceGoalRange(x: number, y: number, targetX: number, targetY: number): number {
  return Math.max(Math.abs(x - targetX), Math.abs(y - targetY));
}

function nearestGoalNodeComesBefore(left: NodeRecord, right: NodeRecord): boolean {
  return openNodeComesBefore(left, right);
}

function pushOpenNode(heap: NodeRecord[], node: NodeRecord): void {
  heap.push(node);
  let index = heap.length - 1;
  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    if (!openNodeComesBefore(heap[index], heap[parentIndex])) {
      break;
    }
    [heap[parentIndex], heap[index]] = [heap[index], heap[parentIndex]];
    index = parentIndex;
  }
}

function popOpenNode(heap: NodeRecord[]): NodeRecord {
  const best = heap[0];
  const last = heap.pop();
  if (!best || !last) {
    throw new Error("Pathfinding open set unexpectedly empty");
  }
  if (heap.length === 0) {
    return best;
  }
  heap[0] = last;
  let index = 0;
  while (true) {
    const leftIndex = index * 2 + 1;
    const rightIndex = leftIndex + 1;
    let nextIndex = index;
    if (leftIndex < heap.length && openNodeComesBefore(heap[leftIndex], heap[nextIndex])) {
      nextIndex = leftIndex;
    }
    if (rightIndex < heap.length && openNodeComesBefore(heap[rightIndex], heap[nextIndex])) {
      nextIndex = rightIndex;
    }
    if (nextIndex === index) {
      break;
    }
    [heap[index], heap[nextIndex]] = [heap[nextIndex], heap[index]];
    index = nextIndex;
  }
  return best;
}

function openNodeComesBefore(left: NodeRecord, right: NodeRecord): boolean {
  return sourceAStarNodeComesBefore(left, right)
    || (!sourceAStarNodeComesBefore(right, left) && left.sequence < right.sequence);
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
