# Plan 012: Make Group Movement And Path Recovery Reliable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Executor instructions**: Follow every step and verification gate. Stop on any STOP condition; do not broaden the pathfinding rewrite. Update `plans/README.md` when complete unless a coordinator owns it.
>
> **Drift check (run first)**: `git diff --stat 6af2eeb..HEAD -- src/simulation/pathfinding.ts src/simulation/passability.ts src/simulation/orders.ts src/main.ts scripts/verify-source-pathfinding.mjs scripts/verify-source-formation-movement.mjs scripts/verify-browser-fixed-demo-input.mjs plans/evidence/012.md plans/012-make-movement-orders-reliable.md plans/README.md`
> If the cited pathfinding, formation, or movement-order shapes changed, STOP and reconcile before editing.

**Goal:** Restore source-like move persistence: wait through temporary unit
congestion, expand the acceptable goal around an unreachable click, recover
orders after stack repair, and preserve small-group relative formation offsets.

**Architecture:** Treat currently moving occupants as costly A* crossings and
stationary occupants as planning blockers, while live movement still forbids
overlap. Distinguish a terrain-reachable route hidden by temporary occupancy
from a statically unreachable goal, expand the latter to the minimum reachable
goal range without a fixed 12-tile cap, replan after stack recovery, and commit
one source-relative path per unit.

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
- After: temporary occupancy never erases intent, unreachable clicks expand to
  the nearest reachable source-style range, and small groups preserve their
  relative offsets through open ground and chokes.
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
and diagnostic callers do not change. Add path-planning-specific occupancy and
cost helpers over one private policy-aware implementation:

```ts
type PassabilityBlockers = "all" | "path-planning" | "none";

export function unitFootprintPathPlanningCost(
  world: WorldState,
  centerTileX: number,
  centerTileY: number,
  unit: WorldUnit,
  movement?: MovementKind
): number; // Infinity for stationary occupancy, 5 for moving occupancy, 1 clear
```

Because the TypeScript world has no Stratagus `Moving` flag, define the port
equivalent narrowly as a live solid unit with a path-bearing order and a
remaining waypoint. Document this approximation beside the helper. It must not
use unit-type `speed > 0` as a proxy for current motion.

```ts
export interface PlannedMoveOrder {
  targetX: number;
  targetY: number;
  path: PathPoint[];
  status: "ready" | "temporarily-blocked";
}

function planMoveOrder(world: WorldState, unit: WorldUnit, x: number, y: number): PlannedMoveOrder | null;
function commitMoveOrder(unit: WorldUnit, planned: PlannedMoveOrder, clearQueue: boolean): void;
```

`findPath` keeps its public signature for existing callers. An internal search
result distinguishes `ready`, `temporarily-blocked`, and statically
`unreachable`. For an unreachable exact goal, choose the reachable tile with
the smallest range from the original click, then normal A* cost/tie-breaking;
the maximum range is derived from map dimensions rather than a constant.

## Design decision and rollback

- **Rejected:** make all move-capable unit types non-blocking during planning;
  original Stratagus distinguishes current motion, not `speed > 0`.
- **Rejected:** fixed 12-tile candidate rings and 1.25-tile reservation spacing;
  neither is an original Wargus rule.
- **Chosen:** reproduce the visible source contract with cost 5 for currently
  moving occupancy, blocking stationary occupancy, live no-overlap, persistent
  retries for temporary blockage, minimum-range goal expansion, and preserved
  source-relative offsets for groups under 12.
- **Rollback trigger:** a unit paths through a speed-zero building/wall, update time exceeds the shared 20ms budget, or M02 oscillates without progress after the front unit clears. Revert the current checkpoint; do not add random sidesteps.

## Scope

**In scope**:

- `src/simulation/pathfinding.ts`
- `src/simulation/passability.ts`
- `src/simulation/orders.ts`
- `src/main.ts` only for a smoke-mode, data-only M02–M04 scenario setup/result hook
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
| 012-A — route semantics | 2–3 | Path planning distinguishes stationary/currently-moving occupancy from terrain impossibility and expands to the minimum reachable goal range. | M02 setup retains intent while blocked; M03 reaches a non-isolated substitute; pathfinding verifier and 20ms update budget pass. |
| 012-B — order commitment | 4–5 | Move-family orders recover after blockage/stack displacement and each unit commits one precomputed route. | No live empty-path order; M02 completes after clearance; diff is limited to order planning/commit seams. |
| 012-C — group settlement | 6–8 | Small-group right-click preserves source-relative formation offsets and the crowded-base play session has no lost orders or visible hitch. | M04 plus M01 replay pass; five source/assigned/final tiles and timing sample are recorded. |

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

### Task 2: Model source-like stationary and moving occupancy

- [ ] Preserve the existing public boolean signatures, but route them through
  one private helper accepting `"all"`, `"path-planning"`, or `"none"`
  (`false -> "all"`, `true -> "none"`).
- [ ] Add a documented port-equivalent `isActivelyMovingOccupant`: a live solid
  unit whose current path-bearing order has a remaining waypoint. Do not use
  the unit type's speed as current-motion state.
- [ ] Add `unitFootprintPathPlanningCost`: clear footprint `1`, footprint
  occupied only by actively moving units `5`, any stationary solid occupancy
  `Infinity`.
- [ ] Hidden builders, resource-contained workers, dead units, and `nonSolid`
  units remain ignored exactly as today.
- [ ] Use the returned cost in A* `g`, including deterministic handling when
  multiple occupants overlap a footprint after stack repair.
- [ ] Keep `"all"` in the live movement step so planned crossings never allow
  two solid units to occupy one tile.
- [ ] Keep `"none"` only for existing diagnostics and the terrain-only probe
  that diagnoses temporary occupancy.

**Verify**: `./node_modules/.bin/tsc --noEmit` -> exit 0.

**Verify**: `npm run verify:source-pathfinding` -> exits 0 after its expected fragments are updated to the explicit policy.

### Task 3: Distinguish temporary blockage and expand unreachable goal range

- [ ] Replace `findNearestPassableTarget`; do not choose the first locally
  passable ring tile before checking reachability.
- [ ] Search the exact requested goal with path-planning occupancy first.
- [ ] If that fails, probe the exact goal with unit occupancy ignored. When the
  terrain-only probe succeeds, return `temporarily-blocked`; the move order must
  stay live and retry rather than silently choosing the mover's own side of a
  friendly choke.
- [ ] When the exact goal is statically blocked or terrain-unreachable, consider
  footprint-valid goal tiles by increasing Chebyshev range around the original
  click. Choose the smallest range that contains a reachable result, then use
  normal A* cost and existing deterministic node ordering within that range.
- [ ] Derive the maximum useful range from map dimensions. Do not restore a
  fixed radius 12 cap.
- [ ] Preserve diagonal corner guards, footprint rules, heuristic focus on the
  original click, and path simplification.
- [ ] Return statically `unreachable` only when no reachable goal exists in the
  map-derived range.

**Verify**: `rg -n 'findNearestPassableTarget' src/simulation/pathfinding.ts` -> no matches.

**Verify**: `npm run verify:source-pathfinding` -> exits 0.

### Task 4: Wait and preserve orders during congestion and stack recovery

- [ ] In `stepMoveOrder`, when the next waypoint is occupied or replanning
  returns `temporarily-blocked`, retain the current order and retry on the
  existing deterministic cadence. Do not add a finite abandonment counter.
- [ ] Continue clearing an order only when the map-derived goal-range search is
  statically unreachable.
- [ ] In `resolveStackedMovableUnit`, after relocation call `sourceOrderTargetPath(world, unit)` for orders that contain a path, then set `pathIndex` consistently.
- [ ] If replanning after stack recovery produces no statically reachable path, use the existing `stopUnusablePathOrder` behavior rather than leaving an empty-path live order.

**Verify**: `rg -n 'unit.order.path = \[\];' src/simulation/orders.ts` -> the stack-recovery branch no longer clears the path without a following replan/stop decision.

### Task 5: Commit one precomputed path per unit

- [ ] Add `planMoveOrder` and `commitMoveOrder` beside `canIssueMoveAt`/`issueMoveOrder`.
- [ ] Update `issueGroupSmartOrder` and `issueGroupMoveOrder` to plan once per unit and commit that exact result.
- [ ] Keep `canSelectedIssueMoveAt` for hover/cursor eligibility, but do not repeat `canIssueMoveAt` inside `issueMoveOrder` after the group already has a `PlannedMoveOrder`.
- [ ] Preserve public `issueMoveOrder(world, unitId, x, y)` by making it plan once and commit once for direct callers.

**Verify**: code review of `issueGroupMoveOrder` shows one `findPath`-producing call per unit, not a can/issue/can chain.

### Task 6: Preserve original small-group formation offsets

- [ ] For empty-ground right-click with fewer than 12 selected units, compute
  the integer source-tile center of the selected group.
- [ ] Give each unit `clickedTile + (unitSourceTile - sourceCenter)`, then clamp
  only to map bounds before normal per-unit planning.
- [ ] Preserve the existing size/selection gate. Do not add spacing rescale,
  passability pre-resolution, or a destination reservation set.
- [ ] Keep explicit command-card Move behavior unchanged if it intentionally
  sends the identical target to every selected unit.

**Verify**: update `scripts/verify-source-formation-movement.mjs` to require
integer source-relative offsets for the under-12 right-click path and to reject
the previous `0.92` rescale, without requiring a new spacing multiplier.

### Task 7: Add browser-level movement scenarios

- [ ] Add one smoke-mode-only `runMechanicsScenario` hook in `src/main.ts` for
  deterministic M02–M04 fixture setup and data-only results. It must call the
  real simulation/order functions and have no effect outside `?smoke=1`.
- [ ] Extend `scripts/verify-browser-fixed-demo-input.mjs` with three actual simulation scenarios using existing smoke hooks or narrowly scoped new fixture hooks:
  1. Two friendly units in a one-tile choke: the rear unit retains its move order while blocked and completes it after the front unit moves.
  2. A blocked clicked tile whose first ring candidate is isolated: the unit reaches a different valid ring tile.
  3. A five-unit open-ground formation: issued destinations preserve all five
     source-relative tile offsets and every unit eventually reaches its slot.
- [ ] Include a stack-recovery assertion: a displaced unit either resumes its order or cleanly becomes idle; it never keeps a live order with an empty path.

**Verify**: `npm run verify:browser-fixed-demo-input` -> exits 0 and reports all movement reliability scenarios.

### Task 8: Perform the playable acceptance session

- [ ] Start `npm run dev -- --port 5173 --strictPort`.
- [ ] In the in-app Browser, build a Barracks and enough Footmen to move a group through a base exit, around buildings, and into a crowded destination.

Expected observable behavior:

- No selected unit silently drops the order at the choke.
- Clicking a building/occupied tile sends the group to reachable nearby tiles.
- Small groups preserve their relative shape rather than collapsing to one
  target; at chokes they wait and resume without repeatedly stacking/jumping.
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
- [ ] A blocked or globally unreachable click expands to the minimum reachable
  goal range without a fixed 12-tile cap.
- [ ] Stack recovery never leaves a live empty-path order.
- [ ] Under-12 empty-ground right-click preserves integer source-relative
  formation offsets; no invented spacing/reservation rule is added.
- [ ] Group command issuance does not recompute the same path through nested can/issue calls.
- [ ] The focused browser movement scenarios and manual crowded-base play session pass.
- [ ] M01–M04 evidence is recorded and plan 012 has a READY review decision.

## STOP conditions

- Plan 011 is not complete or its M01 replay is not READY.
- Path-planning occupancy allows live movement to overlap or treats every
  `speed > 0` unit as currently moving.
- Goal-range expansion requires replacing the entire existing node ordering or
  heuristic system.
- Formation fidelity requires a spacing multiplier or reservation state rather
  than source-relative offsets.
- Fixing congestion requires allowing two solid units to share a tile during ordinary movement.
- Save schema must change even though order shapes remain the same.
- Any focused verification fails twice after a reasonable correction.

## Maintenance notes

Reviewers should stress narrow chokes, large footprints, mixed land/fly
selections, and map edges. The TypeScript port approximates Stratagus `Moving`
from an active remaining path; keep that approximation explicit. Future
flow-field or cooperative-pathfinding work must preserve the distinction
between statically impossible terrain, stationary occupancy, and currently
moving occupancy.
