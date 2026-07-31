import { advanceResumablePathSearch, createResumablePathSearch, type PathPoint, type ResumablePathSearch } from "./pathfinding";
import { findWorldUnitById } from "./worldSelectors";
import type { WorldState } from "./world";

export const PATH_NODE_EXPANSIONS_PER_TICK = 512;
export const PATH_NODE_EXPANSIONS_PER_QUANTUM = 16;
export const PATH_RETRY_PHASE_COUNT = 8;
export const PATH_MAX_ACTIVE_SNAPSHOTS = 8;
export const PATH_SNAPSHOT_MAX_BYTES = 8_388_608;
export const PATH_MAX_SNAPSHOT_WAIT_CYCLES = 64;
export const PATH_MAX_SNAPSHOT_RESTARTS = 8;

export type ScheduledPointPathKind = "move" | "attack-move";

type PendingPathRequest = {
  sequence: number;
  unitId: string;
  kind: ScheduledPointPathKind | "attack";
  candidates: PathPoint[];
  candidateIndex: number;
  targetId: string | null;
  autoReturn: { x: number; y: number } | null;
  search: ResumablePathSearch | null;
  temporarilyBlockedPath: PathPoint[] | null;
  enqueuedTick: number;
  firstServiceTick: number | null;
};

type SchedulerState = { nextSequence: number; cursor: number; requests: PendingPathRequest[] };

const states = new WeakMap<WorldState, SchedulerState>();
const diagnostics = {
  enqueued: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
  superseded: 0,
  nodeExpansions: 0,
  cyclesStarted: 0,
  firstServiceDelayTicks: [] as number[],
  expansionsPerTick: [] as number[]
};

function stateFor(world: WorldState): SchedulerState {
  let state = states.get(world);
  if (!state) {
    state = { nextSequence: 1, cursor: 0, requests: [] };
    states.set(world, state);
  }
  return state;
}

function enqueue(
  world: WorldState,
  request: Omit<PendingPathRequest, "sequence" | "search" | "temporarilyBlockedPath" | "enqueuedTick" | "firstServiceTick">
): number {
  const state = stateFor(world);
  const previousIndex = state.requests.findIndex((candidate) => candidate.unitId === request.unitId);
  if (previousIndex >= 0) {
    state.requests.splice(previousIndex, 1);
    if (previousIndex < state.cursor) {
      state.cursor -= 1;
    }
    diagnostics.cancelled += 1;
    diagnostics.superseded += 1;
  }
  const sequence = state.nextSequence++;
  state.requests.push({
    ...request,
    sequence,
    search: null,
    temporarilyBlockedPath: null,
    enqueuedTick: world.tick,
    firstServiceTick: null
  });
  diagnostics.enqueued += 1;
  return sequence;
}

export function enqueuePointPathRequest(
  world: WorldState,
  unitId: string,
  targetX: number,
  targetY: number,
  kind: ScheduledPointPathKind
): number {
  return enqueue(world, {
    unitId,
    kind,
    candidates: [{ x: targetX, y: targetY }],
    candidateIndex: 0,
    targetId: null,
    autoReturn: null
  });
}

export function enqueueAttackPathRequest(
  world: WorldState,
  unitId: string,
  targetId: string,
  candidates: PathPoint[],
  autoReturn: { x: number; y: number } | null = null
): number {
  return enqueue(world, {
    unitId,
    kind: "attack",
    candidates: candidates.map((point) => ({ ...point })),
    candidateIndex: 0,
    targetId,
    autoReturn: autoReturn ? { ...autoReturn } : null
  });
}

export function cancelPathRequestsForUnit(world: WorldState, unitId: string): void {
  const state = stateFor(world);
  const before = state.requests.length;
  state.requests = state.requests.filter((request) => request.unitId !== unitId);
  diagnostics.cancelled += before - state.requests.length;
  state.cursor = state.requests.length === 0 ? 0 : Math.min(state.cursor, state.requests.length - 1);
}

export function hasPendingPathRequest(world: WorldState, unitId: string): boolean {
  return stateFor(world).requests.some((request) => request.unitId === unitId);
}

function finishRequest(world: WorldState, state: SchedulerState, request: PendingPathRequest, path: PathPoint[] | null): void {
  const unit = findWorldUnitById(world, request.unitId);
  const target = request.targetId ? findWorldUnitById(world, request.targetId) : null;
  state.requests.splice(state.cursor, 1);
  if (!unit || unit.hitPoints <= 0 || !path || path.length === 0 || (request.kind === "attack" && (!target || target.hitPoints <= 0))) {
    diagnostics.failed += 1;
    return;
  }
  if (request.kind === "move") {
    unit.order = {
      kind: "move",
      targetX: path[path.length - 1].x,
      targetY: path[path.length - 1].y,
      path,
      pathIndex: path.length > 1 ? 1 : 0
    };
  } else if (request.kind === "attack-move") {
    // Preserve in-progress attack-move if present, otherwise create one.
    if (unit.order?.kind === "attack-move") {
      unit.order.path = path;
      unit.order.pathIndex = path.length > 1 ? 1 : 0;
    } else {
      unit.order = {
        kind: "attack-move",
        targetId: null,
        targetX: path[path.length - 1].x,
        targetY: path[path.length - 1].y,
        path,
        pathIndex: path.length > 1 ? 1 : 0
      };
    }
  } else if (target) {
    if (unit.order?.kind === "attack-move") {
      unit.order.targetId = target.id;
      unit.order.path = path;
      unit.order.pathIndex = path.length > 1 ? 1 : 0;
    } else {
      const existingAutoReturn =
        unit.order?.kind === "attack" && unit.order.targetId === target.id
          ? unit.order.autoReturn
          : request.autoReturn;
      unit.order = {
        kind: "attack",
        targetId: target.id,
        targetX: target.x,
        targetY: target.y,
        autoReturn: existingAutoReturn ?? request.autoReturn,
        path,
        pathIndex: path.length > 1 ? 1 : 0
      };
    }
  }
  diagnostics.completed += 1;
}

export function stepPathRequests(world: WorldState): void {
  const state = stateFor(world);
  if (state.requests.length === 0) {
    diagnostics.expansionsPerTick.push(0);
    return;
  }
  diagnostics.cyclesStarted += 1;
  let budget = PATH_NODE_EXPANSIONS_PER_TICK;
  let membersServed = 0;
  const cycleSize = Math.min(state.requests.length, PATH_NODE_EXPANSIONS_PER_TICK / PATH_NODE_EXPANSIONS_PER_QUANTUM);
  while (budget > 0 && state.requests.length > 0 && membersServed < cycleSize) {
    if (state.cursor >= state.requests.length) {
      state.cursor = 0;
    }
    const request = state.requests[state.cursor];
    const unit = findWorldUnitById(world, request.unitId);
    const target = request.targetId ? findWorldUnitById(world, request.targetId) : null;
    if (
      !unit
      || unit.hitPoints <= 0
      || (request.kind === "attack" && (!target || target.hitPoints <= 0))
      || request.candidates.length === 0
    ) {
      state.requests.splice(state.cursor, 1);
      diagnostics.cancelled += 1;
      continue;
    }
    if (request.firstServiceTick === null) {
      request.firstServiceTick = world.tick;
      diagnostics.firstServiceDelayTicks.push(world.tick - request.enqueuedTick);
    }
    const candidate = request.candidates[request.candidateIndex];
    request.search ??= createResumablePathSearch(world, unit, candidate.x, candidate.y);
    const advanced = advanceResumablePathSearch(request.search, Math.min(PATH_NODE_EXPANSIONS_PER_QUANTUM, budget));
    diagnostics.nodeExpansions += advanced.expansions;
    budget -= advanced.expansions;
    membersServed += 1;
    if (!advanced.done) {
      state.cursor = (state.cursor + 1) % state.requests.length;
      continue;
    }
    const result = advanced.result;
    const endpoint = result?.path.at(-1);
    const exactCandidate = Boolean(endpoint && endpoint.x === candidate.x && endpoint.y === candidate.y);
    if (result?.status === "ready" && exactCandidate) {
      finishRequest(world, state, request, result.path);
      continue;
    }
    if (result?.status === "temporarily-blocked" && exactCandidate && !request.temporarilyBlockedPath) {
      request.temporarilyBlockedPath = result.path;
    }
    request.candidateIndex += 1;
    request.search = null;
    if (request.candidateIndex >= request.candidates.length) {
      finishRequest(world, state, request, request.temporarilyBlockedPath);
      continue;
    }
    state.cursor = (state.cursor + 1) % state.requests.length;
  }
  diagnostics.expansionsPerTick.push(PATH_NODE_EXPANSIONS_PER_TICK - budget);
  if (diagnostics.expansionsPerTick.length > 2048) {
    diagnostics.expansionsPerTick.splice(0, diagnostics.expansionsPerTick.length - 2048);
  }
  if (diagnostics.firstServiceDelayTicks.length > 2048) {
    diagnostics.firstServiceDelayTicks.splice(0, diagnostics.firstServiceDelayTicks.length - 2048);
  }
}

export function pendingPathRequestCount(world: WorldState): number {
  return stateFor(world).requests.length;
}

export function resetPathRequestDiagnostics(): void {
  diagnostics.enqueued = 0;
  diagnostics.completed = 0;
  diagnostics.failed = 0;
  diagnostics.cancelled = 0;
  diagnostics.superseded = 0;
  diagnostics.nodeExpansions = 0;
  diagnostics.cyclesStarted = 0;
  diagnostics.firstServiceDelayTicks.length = 0;
  diagnostics.expansionsPerTick.length = 0;
}

export function snapshotPathRequestDiagnostics() {
  return {
    "plan024.pathRequests.enqueued": diagnostics.enqueued,
    "plan024.pathRequests.completed": diagnostics.completed,
    "plan024.pathRequests.failed": diagnostics.failed,
    "plan024.pathRequests.cancelled": diagnostics.cancelled,
    "plan024.pathRequests.superseded": diagnostics.superseded,
    "plan024.pathRequests.nodeExpansions": diagnostics.nodeExpansions,
    "plan024.pathRequests.expansionsPerTick": [...diagnostics.expansionsPerTick],
    "plan024.pathRequests.queueDepth": 0,
    "plan024.pathRequests.cyclesStarted": diagnostics.cyclesStarted,
    "plan024.pathRequests.firstServiceDelayTicks": [...diagnostics.firstServiceDelayTicks],
    "plan024.pathRequests.synchronousFallbackSearches": 0
  };
}

export function pathRequestHash32Bytes(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash = Math.imul((hash ^ byte) >>> 0, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function pathRequestHash32(text: string): number {
  return pathRequestHash32Bytes(new TextEncoder().encode(text));
}
