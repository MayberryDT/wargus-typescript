# Plan 012: Make Group Movement And Path Recovery Reliable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Executor instructions**: Follow every step and verification gate. Stop on any STOP condition; do not broaden the pathfinding rewrite. Update `plans/README.md` when complete unless a coordinator owns it.
>
> **Drift check (run first)**: `git diff --stat 6af2eeb..HEAD -- src/simulation/pathfinding.ts src/simulation/passability.ts src/simulation/orders.ts scripts/verify-source-pathfinding.mjs scripts/verify-source-formation-movement.mjs scripts/verify-browser-fixed-demo-input.mjs plans/evidence/012.md plans/012-make-movement-orders-reliable.md plans/README.md`
> If the cited pathfinding, formation, or movement-order shapes changed, STOP and reconcile before editing.

**Goal:** Ensure a valid move command remains active through temporary unit congestion, chooses a reachable nearby destination when the clicked tile is blocked, preserves orders after stack recovery, and assigns distinct formation destinations.

**Architecture:** Separate static path-planning blockers from momentary mobile occupancy. Search all acceptable blocked-click destinations in one A* run, replan after stack recovery, reserve formation tiles, and commit one precomputed path per unit.

**Tech Stack:** TypeScript 6 simulation, deterministic A* pathfinding, PixiJS 8 runtime, repo-native browser/CDP verifier scripts.

## Global constraints

- Read `plans/MECHANICS-ACCEPTANCE.md` and `plans/EXECUTION-GATES.md` fully before editing; both are mandatory contracts.
- Preserve deterministic tie-breaking; do not introduce random sidesteps.
- Preserve terrain, forest, rock, wall, land/naval/fly, large-footprint, and diagonal-corner rules.
- Do not add crowd pushing, unit phasing, or collision damage.
- Do not redesign attack acquisition; plan 013 owns combat response.
- Playability in crowded base exits and chokes is the primary acceptance criterion.

---

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/011-protect-construction-lifecycle.md
- **Category**: bug, perf
- **Planned at**: commit `6af2eeb`, 2026-07-10

## Player-visible contract and evidence

- Assigned scenarios: M02–M04; replay M01.
- Before: formations lose members at chokes, blocked clicks can reject reachable destinations, and stack recovery can leave a permanent empty-path order.
- After: the whole selected group retains intent through congestion and settles on distinct reachable tiles.
- Required handoff: `plans/evidence/012.md`, with path/order timelines and update-time measurements.

## Current state

- `src/simulation/pathfinding.ts:30-35` calls `findNearestPassableTarget` before A*.
- `src/simulation/pathfinding.ts:101-118` returns the first passable ring tile without knowing whether it is reachable.
- `src/simulation/passability.ts:89-95` treats every solid live unit as an equal blocker.
- `src/simulation/orders.ts:9769-9837` replans on a blocked waypoint and clears move-family orders when the replacement path is unusable.
- `src/simulation/orders.ts:9841-9873` relocates a stacked unit and clears its path without clearing or replanning its order.
- `src/simulation/orders.ts:1527-1549` uses `0.92 * tileSize` formation spacing, while reconstructed A* points snap to tile centers.
- `canSelectedIssueMoveAt`, `issueGroupMoveOrder`, `canIssueMoveAt`, and `issueMoveOrder` can calculate the same route three times for one click.

## Interfaces

Introduce these focused concepts; names may differ only if all callers and verifiers are updated consistently:

Keep the existing public `isTilePassable(..., ignoreBlockers?: boolean)` and
`isUnitFootprintPassable(..., ignoreBlockers?: boolean)` signatures so render
and diagnostic callers do not change. Add path-planning-specific wrappers over
one private policy-aware implementation:

```ts
type PassabilityBlockers = "all" | "static-only" | "none";

export function isUnitFootprintPathPlanningPassable(
  world: WorldState,
  centerTileX: number,
  centerTileY: number,
  unit: WorldUnit,
  movement?: MovementKind
): boolean;
```

```ts
export interface PlannedMoveOrder {
  targetX: number;
  targetY: number;
  path: PathPoint[];
}

function planMoveOrder(world: WorldState, unit: WorldUnit, x: number, y: number): PlannedMoveOrder | null;
function commitMoveOrder(unit: WorldUnit, planned: PlannedMoveOrder, clearQueue: boolean): void;
```

`findPath` keeps its public signature. Internally it builds acceptable goal tiles and runs one A* search whose completion condition is membership in that goal set.

## Design decision and rollback

- **Rejected:** make all units non-solid during planning and movement; it fixes congestion by allowing illegal overlap.
- **Rejected:** assign arbitrary extra crossing costs without a cost-calibration model; that can still report no route or create unstable detours.
- **Chosen:** ignore only mobile occupancy during planning, enforce all occupancy during movement, and preserve/retry the order. This separates temporary congestion from static impossibility.
- **Rollback trigger:** a unit paths through a speed-zero building/wall, update time exceeds the shared 20ms budget, or M02 oscillates without progress after the front unit clears. Revert the current checkpoint; do not add random sidesteps.

## Scope

**In scope**:

- `src/simulation/pathfinding.ts`
- `src/simulation/passability.ts`
- `src/simulation/orders.ts`
- `scripts/verify-source-pathfinding.mjs`
- `scripts/verify-source-formation-movement.mjs`
- `scripts/verify-browser-fixed-demo-input.mjs`
- `plans/evidence/012.md` (create during execution)
- `plans/README.md`

**Out of scope**:

- Combat damage, projectile visibility, and reaction behavior
- AI strategy or build order
- A new physics/crowd simulation
- Save-schema changes unless a movement-order type changes (it should not)
- Naval balance, terrain data, or map asset changes

## Git workflow

- Suggested branch: `codex/012-movement-reliability`
- Land the checkpoints below as separate reviewable commits. Do not begin a
  checkpoint until the preceding checkpoint is READY in `plans/evidence/012.md`.
- Do not push or open a PR unless instructed.

## Landing checkpoints

| Checkpoint | Tasks | Allowed result | Acceptance before continuing |
|---|---|---|---|
| 012-A — route semantics | 2–3 | Path planning distinguishes static impossibility from mobile congestion and selects a reachable substitute goal. | M02 setup retains intent while blocked; M03 reaches a non-isolated substitute; pathfinding verifier and 20ms update budget pass. |
| 012-B — order commitment | 4–5 | Move-family orders recover after blockage/stack displacement and each unit commits one precomputed route. | No live empty-path order; M02 completes after clearance; diff is limited to order planning/commit seams. |
| 012-C — group settlement | 6–8 | Formation endpoints are unique and the crowded-base play session has no lost orders or visible hitch. | M04 plus M01 replay pass; five assigned/final tiles and timing sample are recorded. |

If a checkpoint fails twice, revert only that checkpoint and keep the last READY
commit. Do not compensate in a later checkpoint.

## Steps

### Task 1: Establish a green movement baseline

- [ ] Confirm plan 011 is `DONE` in `plans/README.md` and `plans/evidence/011.md` says READY.
- [ ] Run `./node_modules/.bin/tsc --noEmit`.
- [ ] Run `npm run verify:source-pathfinding`.
- [ ] Run `npm run verify:source-formation-movement`.
- [ ] Run `npm run verify:browser-fixed-demo-input`.

Expected: all exit 0. STOP on a pre-existing red baseline.

### Task 2: Separate static and mobile blockers

- [ ] Preserve the existing public boolean signatures, but route them through one private helper that accepts the explicit blocker policy above (`false -> "all"`, `true -> "none"`).
- [ ] Add `isUnitFootprintPathPlanningPassable`, which calls the same private helper with `"static-only"`.
- [ ] Define static blockers as solid live units that cannot move (`speed <= 0`) or are under construction. Hidden builders, resource-contained workers, dead units, and `nonSolid` units remain ignored exactly as today.
- [ ] Use `isUnitFootprintPathPlanningPassable` from A* expansion and goal-candidate checks.
- [ ] Keep `"all"` in the live movement step so two units never occupy a tile merely because a path planned through it.
- [ ] Keep `"none"` only for existing diagnostics that intentionally ignore all unit occupancy.

Target classifier:

```ts
function unitBlocksPathPlanning(unit: WorldUnit): boolean {
  return unit.construction !== null || unit.speed <= 0;
}
```

If `construction` is optional rather than nullable in live code, use `Boolean(unit.construction)`.

**Verify**: `./node_modules/.bin/tsc --noEmit` -> exit 0.

**Verify**: `npm run verify:source-pathfinding` -> exits 0 after its expected fragments are updated to the explicit policy.

### Task 3: Search all acceptable blocked-click goals in one A* run

- [ ] Replace `findNearestPassableTarget` with `findPassableTargetCandidates`.
- [ ] Return the requested tile when statically passable; otherwise collect statically passable ring tiles for radii 1 through 12 in deterministic ring traversal order.
- [ ] Build a `Set` of candidate keys. Continue using the originally requested tile for the heuristic, but finish when the current node key belongs to the goal set.
- [ ] Preserve existing node ordering, diagonal corner guards, footprint checks, and path simplification.
- [ ] Return `[]` only when A* exhausts the reachable search space without reaching any candidate.

Target loop shape:

```ts
const goals = findPassableTargetCandidates(world, requestedTarget, unit, movement);
const goalKeys = new Set(goals.map((goal) => key(goal.x, goal.y)));
// ...normal A*...
if (goalKeys.has(currentKey)) {
  records.set(currentKey, current);
  return reconstruct(world, current, records);
}
```

**Verify**: `rg -n 'findNearestPassableTarget' src/simulation/pathfinding.ts` -> no matches.

**Verify**: `npm run verify:source-pathfinding` -> exits 0.

### Task 4: Preserve orders during congestion and stack recovery

- [ ] In `stepMoveOrder`, when a live mobile unit blocks the next waypoint, retain the current order and retry; do not call `stopUnusablePathOrder` merely because a momentary blocker occupies the route.
- [ ] Continue clearing an order when no statically reachable route exists.
- [ ] In `resolveStackedMovableUnit`, after relocation call `sourceOrderTargetPath(world, unit)` for orders that contain a path, then set `pathIndex` consistently.
- [ ] If replanning after stack recovery produces no statically reachable path, use the existing `stopUnusablePathOrder` behavior rather than leaving an empty-path live order.

**Verify**: `rg -n 'unit.order.path = \[\];' src/simulation/orders.ts` -> the stack-recovery branch no longer clears the path without a following replan/stop decision.

### Task 5: Commit one precomputed path per unit

- [ ] Add `planMoveOrder` and `commitMoveOrder` beside `canIssueMoveAt`/`issueMoveOrder`.
- [ ] Update `issueGroupSmartOrder` and `issueGroupMoveOrder` to plan once per unit and commit that exact result.
- [ ] Keep `canSelectedIssueMoveAt` for hover/cursor eligibility, but do not repeat `canIssueMoveAt` inside `issueMoveOrder` after the group already has a `PlannedMoveOrder`.
- [ ] Preserve public `issueMoveOrder(world, unitId, x, y)` by making it plan once and commit once for direct callers.

**Verify**: code review of `issueGroupMoveOrder` shows one `findPath`-producing call per unit, not a can/issue/can chain.

### Task 6: Make formation endpoints distinct

- [ ] Increase formation spacing to at least `1.25 * world.tileSize`.
- [ ] Resolve each proposed slot to a tile coordinate before command issuance.
- [ ] Keep a deterministic `reservedTiles` set per movement group. If a slot is already reserved or statically blocked, search adjacent rings for the nearest unreserved statically passable tile.
- [ ] Return the chosen tile center as the unit's destination.
- [ ] Preserve existing movement-kind grouping and the `< 12 units` source formation preference gate.

Target helper contract:

```ts
function reserveFormationDestination(
  world: WorldState,
  unit: WorldUnit,
  proposed: { x: number; y: number },
  reservedTiles: Set<string>
): { x: number; y: number };
```

**Verify**: update `scripts/verify-source-formation-movement.mjs` to require spacing `>= 1.25` and deterministic unique tile reservation without locking exact formatting.

### Task 7: Add browser-level movement scenarios

- [ ] Extend `scripts/verify-browser-fixed-demo-input.mjs` with three actual simulation scenarios using existing smoke hooks or narrowly scoped new fixture hooks:
  1. Two friendly units in a one-tile choke: the rear unit retains its move order while blocked and completes it after the front unit moves.
  2. A blocked clicked tile whose first ring candidate is isolated: the unit reaches a different valid ring tile.
  3. A five-unit formation: all issued final destination tiles are distinct and every unit eventually stops within one tile of its assigned slot.
- [ ] Include a stack-recovery assertion: a displaced unit either resumes its order or cleanly becomes idle; it never keeps a live order with an empty path.

**Verify**: `npm run verify:browser-fixed-demo-input` -> exits 0 and reports all movement reliability scenarios.

### Task 8: Perform the playable acceptance session

- [ ] Start `npm run dev -- --port 5173 --strictPort`.
- [ ] In the in-app Browser, build a Barracks and enough Footmen to move a group through a base exit, around buildings, and into a crowded destination.

Expected observable behavior:

- No selected unit silently drops the order at the choke.
- Clicking a building/occupied tile sends the group to reachable nearby tiles.
- Units settle into distinct positions rather than repeatedly stacking and jumping.
- Repeated group move clicks do not create a visible frame hitch at the demo selection cap.

### Task 9: Close out

- [ ] Run `./node_modules/.bin/tsc --noEmit`.
- [ ] Run `npm run verify:source-pathfinding`.
- [ ] Run `npm run verify:source-formation-movement`.
- [ ] Run `npm run verify:browser-fixed-demo-input`.
- [ ] Run `npm run verify:browser-playable-session`.
- [ ] Replay M01 and record M02–M04 in `plans/evidence/012.md`; obtain a READY review decision.
- [ ] Run `git diff --check` and confirm only in-scope files changed.
- [ ] Update plan 012 to `DONE` in `plans/README.md`.

## Done criteria

- [ ] Temporary mobile congestion never permanently cancels a valid move-family order.
- [ ] A blocked click reaches one of the reachable nearby candidate tiles when one exists.
- [ ] Stack recovery never leaves a live empty-path order.
- [ ] Formation destinations are unique at tile resolution.
- [ ] Group command issuance does not recompute the same path through nested can/issue calls.
- [ ] The focused browser movement scenarios and manual crowded-base play session pass.
- [ ] M01–M04 evidence is recorded and plan 012 has a READY review decision.

## STOP conditions

- Plan 011 is not complete or its M01 replay is not READY.
- Static/mobile blocker separation allows units to path through buildings, walls, forests, rocks, or coast restrictions.
- The acceptable-goal A* change requires replacing the entire existing node ordering or heuristic system.
- Unique formation assignment requires global reservation state outside one command issuance.
- Fixing congestion requires allowing two solid units to share a tile during ordinary movement.
- Save schema must change even though order shapes remain the same.
- Any focused verification fails twice after a reasonable correction.

## Maintenance notes

Reviewers should stress narrow chokes, large footprints, mixed land/fly selections, and map edges. Future flow-field or cooperative-pathfinding work should replace this incrementally; it must preserve the distinction between a statically impossible route and a temporarily occupied one.
