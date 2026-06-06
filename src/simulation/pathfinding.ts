import type { WorldState, WorldUnit } from "./world";
import { isUnitFootprintPassable, movementKindForUnit, tileToWorldCenter, worldToTile } from "./passability";

export interface PathPoint {
  x: number;
  y: number;
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
  const movement = movementKindForUnit(unit);
  const start = worldToTile(world, unit.x, unit.y);
  const target = findNearestPassableTarget(world, worldToTile(world, targetX, targetY), unit, movement);
  if (!target) {
    return [];
  }

  const startKey = key(start.x, start.y);
  const targetKey = key(target.x, target.y);
  const open = new Map<string, NodeRecord>();
  const closed = new Set<string>();
  const records = new Map<string, NodeRecord>();
  const startDistance = sourceAStarManhattanDistance(start.x, start.y, target.x, target.y);
  const startCostToGoal = startDistance << 3;
  open.set(startKey, { x: start.x, y: start.y, g: 1, h: startCostToGoal, distanceToGoal: startDistance, f: 1 + startCostToGoal, parent: null });

  while (open.size > 0) {
    const current = getBest(open);
    const currentKey = key(current.x, current.y);
    if (currentKey === targetKey) {
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
      if (closed.has(nextKey) || !isUnitFootprintPassable(world, nx, ny, unit, movement)) {
        continue;
      }
      if (direction.x !== 0 && direction.y !== 0) {
        const canCutCorner =
          isUnitFootprintPassable(world, current.x + direction.x, current.y, unit, movement) &&
          isUnitFootprintPassable(world, current.x, current.y + direction.y, unit, movement);
        if (!canCutCorner) {
          continue;
        }
      }

      const g = current.g + 1;
      const distanceToGoal = sourceAStarManhattanDistance(nx, ny, target.x, target.y);
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

  return [];
}

function findNearestPassableTarget(
  world: WorldState,
  target: { x: number; y: number },
  unit: WorldUnit,
  movement: ReturnType<typeof movementKindForUnit>
): { x: number; y: number } | null {
  if (isUnitFootprintPassable(world, target.x, target.y, unit, movement)) {
    return target;
  }
  for (let radius = 1; radius <= 12; radius += 1) {
    for (let y = target.y - radius; y <= target.y + radius; y += 1) {
      for (let x = target.x - radius; x <= target.x + radius; x += 1) {
        if (Math.abs(x - target.x) !== radius && Math.abs(y - target.y) !== radius) {
          continue;
        }
        if (isUnitFootprintPassable(world, x, y, unit, movement)) {
          return { x, y };
        }
      }
    }
  }
  return null;
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
