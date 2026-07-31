import type { WorldState, WorldUnit } from "./world";
import { hasMobilePathPlanningOccupancy, hasPathPlanningOccupancy, isUnitFootprintPassable, movementKindForUnit, tileToWorldCenter, unitFootprintPathPlanningCost, unitFootprintStaticPlanningCost, worldToTile } from "./passability";

export interface PathPoint {
  x: number;
  y: number;
}

export interface PathSearchResult {
  status: "ready" | "temporarily-blocked" | "unreachable";
  path: PathPoint[];
}

type SearchBlockers = "all" | "path-planning" | "static" | "none";

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

const pathfindingDiagnostics = { synchronousFindPathCalls: 0, synchronousFindPathResultCalls: 0, expansionAttempts: 0 };

export function resetPathfindingDiagnostics(): void {
  pathfindingDiagnostics.synchronousFindPathCalls = 0;
  pathfindingDiagnostics.synchronousFindPathResultCalls = 0;
  pathfindingDiagnostics.expansionAttempts = 0;
}

export function snapshotPathfindingDiagnostics() { return { ...pathfindingDiagnostics }; }

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

export interface ResumablePathSearch {
  world: WorldState;
  unit: WorldUnit;
  start: { x: number; y: number };
  target: { x: number; y: number };
  stage: "path-planning" | "static" | "done";
  active: ReachableSearchState;
  primary: ReachableSearchResult | null;
  result: PathSearchResult | null;
}

export function createResumablePathSearch(world: WorldState, unit: WorldUnit, targetX: number, targetY: number): ResumablePathSearch {
  const start = worldToTile(world, unit.x, unit.y);
  const target = worldToTile(world, targetX, targetY);
  return {
    world, unit, start, target, stage: "path-planning",
    active: createReachableSearch(world, unit, start, target, "path-planning", true),
    primary: null, result: null
  };
}

export function advanceResumablePathSearch(search: ResumablePathSearch, expansionBudget: number): { done: boolean; result: PathSearchResult | null; expansions: number } {
  let remaining = Math.max(0, Math.floor(expansionBudget));
  let expansions = 0;
  while (search.stage !== "done" && remaining > 0) {
    const advanced = advanceReachableSearch(search.active, remaining);
    expansions += advanced.expansions;
    remaining -= advanced.expansions;
    if (!advanced.done || !advanced.result) break;
    if (search.stage === "path-planning") {
      search.primary = advanced.result;
      if (advanced.result.exactPath) {
        search.result = { status: "ready", path: advanced.result.exactPath };
        search.stage = "done";
        break;
      }
      if (!hasMobilePathPlanningOccupancy(search.world, search.unit)) {
        search.result = advanced.result.nearestPath ? { status: "ready", path: advanced.result.nearestPath } : { status: "unreachable", path: [] };
        search.stage = "done";
        break;
      }
      search.stage = "static";
      search.active = createReachableSearch(search.world, search.unit, search.start, search.target, "static", true, "path-planning");
      continue;
    }
    const staticPath = advanced.result.exactPath ?? advanced.result.nearestPath;
    const planningPath = search.primary?.nearestPath ?? null;
    if (!staticPath) search.result = { status: "unreachable", path: [] };
    else if (!planningPath) search.result = { status: "temporarily-blocked", path: staticPath };
    else {
      const staticEndpoint = worldToTile(search.world, staticPath[staticPath.length - 1].x, staticPath[staticPath.length - 1].y);
      const planningEndpoint = worldToTile(search.world, planningPath[planningPath.length - 1].x, planningPath[planningPath.length - 1].y);
      const staticRange = sourceGoalRange(staticEndpoint.x, staticEndpoint.y, search.target.x, search.target.y);
      const planningRange = sourceGoalRange(planningEndpoint.x, planningEndpoint.y, search.target.x, search.target.y);
      search.result = planningRange > staticRange ? { status: "temporarily-blocked", path: staticPath } : { status: "ready", path: planningPath };
    }
    search.stage = "done";
  }
  return { done: search.stage === "done", result: search.result, expansions };
}

export function findPath(world: WorldState, unit: WorldUnit, targetX: number, targetY: number): PathPoint[] {
  pathfindingDiagnostics.synchronousFindPathCalls += 1;
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
  pathfindingDiagnostics.synchronousFindPathResultCalls += 1;
  const start = worldToTile(world, unit.x, unit.y);
  const target = worldToTile(world, targetX, targetY);
  const search = searchReachable(world, unit, start, target, "path-planning", true);
  if (search.exactPath) {
    return { status: "ready", path: search.exactPath };
  }
  if (!hasMobilePathPlanningOccupancy(world, unit)) {
    return search.nearestPath
      ? { status: "ready", path: search.nearestPath }
      : { status: "unreachable", path: [] };
  }

  const staticSearch = searchReachable(world, unit, start, target, "static", true, "path-planning");
  const staticPath = staticSearch.exactPath ?? staticSearch.nearestPath;
  if (!staticPath) {
    return { status: "unreachable", path: [] };
  }
  const planningPath = search.nearestPath;
  if (!planningPath) {
    return { status: "temporarily-blocked", path: staticPath };
  }
  const staticEndpoint = worldToTile(world, staticPath[staticPath.length - 1].x, staticPath[staticPath.length - 1].y);
  const planningEndpoint = worldToTile(world, planningPath[planningPath.length - 1].x, planningPath[planningPath.length - 1].y);
  const staticRange = sourceGoalRange(staticEndpoint.x, staticEndpoint.y, target.x, target.y);
  const planningRange = sourceGoalRange(planningEndpoint.x, planningEndpoint.y, target.x, target.y);
  return planningRange > staticRange
    ? { status: "temporarily-blocked", path: staticPath }
    : { status: "ready", path: planningPath };
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

interface ReachableSearchState {
  world: WorldState;
  unit: WorldUnit;
  target: { x: number; y: number };
  targetKey: string;
  blockers: SearchBlockers;
  goalBlockers: SearchBlockers;
  trackNearest: boolean;
  openByKey: Map<string, NodeRecord>;
  openHeap: NodeRecord[];
  closed: Set<string>;
  records: Map<string, NodeRecord>;
  nextSequence: number;
  nearest: NodeRecord | null;
  nearestRange: number;
  result: ReachableSearchResult | null;
}

function createReachableSearch(
  world: WorldState,
  unit: WorldUnit,
  start: { x: number; y: number },
  target: { x: number; y: number },
  blockers: SearchBlockers,
  trackNearest: boolean,
  goalBlockers: SearchBlockers = blockers
): ReachableSearchState {
  const startKey = key(start.x, start.y);
  const startDistance = sourceAStarManhattanDistance(start.x, start.y, target.x, target.y);
  const startCostToGoal = startDistance << 3;
  const startNode: NodeRecord = { x: start.x, y: start.y, g: 1, h: startCostToGoal, distanceToGoal: startDistance, f: 1 + startCostToGoal, parent: null, sequence: 0 };
  const openByKey = new Map<string, NodeRecord>([[startKey, startNode]]);
  const openHeap = [startNode];
  return {
    world, unit, target, targetKey: key(target.x, target.y), blockers, goalBlockers, trackNearest,
    openByKey, openHeap, closed: new Set(), records: new Map(), nextSequence: 1,
    nearest: null, nearestRange: Number.POSITIVE_INFINITY, result: null
  };
}

function finishReachableSearch(search: ReachableSearchState): ReachableSearchResult {
  return search.result ??= {
    exactPath: null,
    nearestPath: search.nearest ? reconstruct(search.world, search.nearest, search.records) : null
  };
}

function advanceReachableSearch(search: ReachableSearchState, expansionBudget: number): { done: boolean; result: ReachableSearchResult | null; expansions: number } {
  if (search.result) return { done: true, result: search.result, expansions: 0 };
  const budget = Math.max(0, Math.floor(expansionBudget));
  let expansions = 0;
  while (search.openHeap.length > 0 && expansions < budget) {
    const current = popOpenNode(search.openHeap);
    expansions += 1;
    pathfindingDiagnostics.expansionAttempts += 1;
    const currentKey = key(current.x, current.y);
    if (search.openByKey.get(currentKey) !== current || search.closed.has(currentKey)) continue;
    search.openByKey.delete(currentKey);
    search.closed.add(currentKey);
    search.records.set(currentKey, current);
    const validGoal = Number.isFinite(footprintSearchCost(search.world, search.unit, current.x, current.y, search.goalBlockers));
    if (currentKey === search.targetKey && validGoal) {
      search.result = { exactPath: reconstruct(search.world, current, search.records), nearestPath: null };
      return { done: true, result: search.result, expansions };
    }
    if (search.trackNearest && validGoal) {
      const range = sourceGoalRange(current.x, current.y, search.target.x, search.target.y);
      if (!search.nearest || range < search.nearestRange || (range === search.nearestRange && nearestGoalNodeComesBefore(current, search.nearest))) {
        search.nearest = current;
        search.nearestRange = range;
      }
    }
    const parent = current.parent ? search.records.get(current.parent) : null;
    for (const direction of sourceDirections) {
      const nx = current.x + direction.x;
      const ny = current.y + direction.y;
      const nextKey = key(nx, ny);
      if ((parent && nx === parent.x && ny === parent.y) || search.closed.has(nextKey)) continue;
      const moveCost = footprintSearchCost(search.world, search.unit, nx, ny, search.blockers);
      if (!Number.isFinite(moveCost)) continue;
      if (direction.x !== 0 && direction.y !== 0) {
        const canCutCorner = Number.isFinite(footprintSearchCost(search.world, search.unit, current.x + direction.x, current.y, search.blockers))
          && Number.isFinite(footprintSearchCost(search.world, search.unit, current.x, current.y + direction.y, search.blockers));
        if (!canCutCorner) continue;
      }
      const g = current.g + moveCost;
      const distanceToGoal = sourceAStarManhattanDistance(nx, ny, search.target.x, search.target.y);
      const costToGoal = distanceToGoal << 3;
      const existing = search.openByKey.get(nextKey);
      if (existing && g >= existing.g) continue;
      const node: NodeRecord = {
        x: nx, y: ny, g, h: costToGoal, distanceToGoal, f: g + costToGoal,
        parent: currentKey, sequence: existing?.sequence ?? search.nextSequence++
      };
      search.openByKey.set(nextKey, node);
      pushOpenNode(search.openHeap, node);
    }
  }
  if (search.openHeap.length === 0) return { done: true, result: finishReachableSearch(search), expansions };
  return { done: false, result: null, expansions };
}

function searchReachable(
  world: WorldState,
  unit: WorldUnit,
  start: { x: number; y: number },
  target: { x: number; y: number },
  blockers: SearchBlockers,
  trackNearest: boolean,
  goalBlockers: SearchBlockers = blockers
): ReachableSearchResult {
  const search = createReachableSearch(world, unit, start, target, blockers, trackNearest, goalBlockers);
  while (true) {
    const advanced = advanceReachableSearch(search, Number.MAX_SAFE_INTEGER);
    if (advanced.done && advanced.result) return advanced.result;
  }
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
  if (blockers === "static") {
    return unitFootprintStaticPlanningCost(world, tileX, tileY, unit, movement);
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
