# Plan 024: Budget and Stagger Pathfinding

**Priority:** P1
**Effort:** L
**Risk:** High
**Depends on:** 018, 019, 020, 023
**Planned against:** `8ac0006` on 2026-07-27

## Problem

Path requests run synchronously and can arrive in bursts. Group attack-move handling around `src/simulation/orders.ts` lines 1734–1870 performs path validation and then order issuance can compute the route again. Attack, attack-move, and harvest retries around lines 5989, 10051, 10471, and 10593 can align many units on the same tick. A* in `src/simulation/pathfinding.ts` lines 104–203 evaluates footprint passability for every expanded neighbor.

Even after terrain and occupancy queries become cheaper, a command involving many units can still monopolize a fixed step and delay input-to-render response.

## Goal

Eliminate duplicate route searches and process path requests under a deterministic per-tick work budget so command bursts remain responsive without changing eventual order semantics.

## Non-goals

- Making pathfinding asynchronous through wall-clock races or Web Workers.
- Changing the map grid, allowed movement, path cost, A* tie-breaking, or command acknowledgment semantics.
- Hiding overload by slowing simulation, dropping commands, or lowering render frequency.
- A broad order-system rewrite.

## Preconditions and Drift Checks

1. Confirm Halla, checkout isolation, branch, and HEAD.
2. Read Plans 018, 019, 020, and 023 completely. Verify terrain, ID, and occupancy hot-path checks pass.
3. Inventory every initial path, validation path, retry, replan, group command, harvest return, attack-position, and de-stacking request.
4. Capture Plan 018 `command-18`, `army-200`, and `combat-100` profiles with request counts, duplicate searches, nodes expanded, search duration, retry reason, scheduler backlog, and input latency.
5. Confirm Plan 012's invariant: a live movement order must not masquerade as valid with an empty path.

**STOP:** If one ordinary A* search still exceeds the fixed-step budget after Plans 019 and 023, design a resumable deterministic A* state machine before adding a request-count budget. A count budget alone cannot bound a single oversized search.

## Design

Introduce a deterministic path-request scheduler owned by the simulation:

- Commands create explicit pending path requests with monotonically assigned deterministic sequence numbers.
- Requests are ordered by command sequence, request kind priority, and stable unit ID. No wall clock, promise completion, random jitter, or collection insertion accident decides execution order.
- Process at most four initial/replan searches per fixed tick initially. Freeze this as the first measured limit; change it only with recorded Plan 018 evidence and an update to this plan.
- A command is acknowledged immediately, but the unit remains in an explicit `pending-path` state until a route succeeds or fails. It must not be represented as an active movement order with an empty path.
- If pending state survives a save boundary, serialize the minimum authoritative request fields and sequence. Derived A* frontier/cache state may be rebuilt deterministically unless resumable search is required.

Reduce work before scheduling it:

- Refactor validation-plus-issue code to compute a route once and commit that result.
- Share group-command destination analysis.
- Replace repeated candidate-destination A* calls with one deterministic multi-goal search where semantics are equivalent.
- Stagger automatic retries by a stable phase derived from unit ID and retry kind. Never use `Math.random()`, `Date.now()`, or `crypto.getRandomValues()`.
- Coalesce only requests that are semantically superseded for the same unit; record the reason.

## Implementation Steps

### Checkpoint A — Count and remove duplicate searches

1. Add structured path-request diagnostics to Plan 018 telemetry.
2. Route path validation and issuance through a plan/commit result so one accepted route is reused.
3. Identify multi-candidate target searches and implement deterministic multi-goal A* only where goal equivalence is proven by tests.
4. Add tests asserting the same path and order result with fewer searches.

**Verify:**

- Group move and attack-move issue no duplicate search for the same unit/request.
- Existing path and order fixtures retain exact destinations and tie-breaking.
- `command-18` records the expected request count before scheduler work begins.

### Checkpoint B — Add deterministic pending requests and budget

1. Add the scheduler and explicit request/result types.
2. Add `pending-path` command/order state without violating Plan 012's empty-path rule.
3. Process requests in stable sequence with the frozen four-search-per-tick initial budget.
4. Serialize authoritative pending requests if they can cross save/load; restore deterministic sequence state.
5. Define cancellation and supersession for unit death, removal, new command, transport, world replacement, and invalid destinations.

**Verify:**

- A mass command acknowledges in the issuing tick and drains path work over deterministic later ticks.
- Identical command streams produce identical request order, routes, hashes, and save/load results.
- Scheduler backlog is visible in Plan 018 telemetry and never silently discarded.

### Checkpoint C — Stagger replans and retries

1. Route attack, attack-move, harvest, collision, and other inventoried retries through the scheduler.
2. Assign deterministic retry phases from stable unit ID and retry kind.
3. Add bounded retry/backoff rules that preserve existing failure outcomes.
4. If the precondition STOP was triggered, implement resumable A* with a deterministic node-expansion budget and serialized/rebuildable pending semantics.
5. Add `scripts/verify-pathfinding-budget.mjs` and package wiring for budget, ordering, save/load, cancellation, and determinism checks.

**Verify:**

- A blocked crowd does not synchronize all replans on one tick.
- Retry work remains bounded and eventually runs; no unit starves behind continuous new requests.
- Cancellation removes stale requests without changing unrelated ordering.

## Tests

- Exact route/tie-break parity for existing fixtures.
- Group validation/commit tests proving one search per accepted request.
- Multi-goal parity tests against the former candidate ordering.
- Stable queue-order and retry-phase tests.
- Pending request cancel, supersede, fail, succeed, death, transport, and world-replacement tests.
- Save/load during a partially drained request queue.
- Deterministic replay/hash tests across repeated runs.
- Starvation tests with a continuous mix of initial and retry requests.

## Performance Acceptance

Using Plan 018's exact profiles:

- `command-18` synchronous input-to-command p95 is at most 50 ms and input-to-next-render p95 is at most 100 ms.
- `army-200` and `combat-100` meet the frozen frame, scheduler-backlog, and heap budgets.
- No fixed tick begins more than four non-resumable searches under the initial policy.
- If resumable A* is required, each tick obeys its recorded deterministic node-expansion budget.
- Duplicate path searches for validation plus issue are zero.
- The request queue drains without starvation, and backlog age is reported.

Report before/after request counts, duplicate count, nodes expanded, search time percentiles, queue depth/age, cancellations, retries, simulation step percentiles, and input latency.

## Verification Commands

```bash
./node_modules/.bin/tsc --noEmit
npm run verify:wargus-assets
npm run build
npm run verify
npm run verify:pathfinding-budget
npm run verify:browser-playable-session
npm run verify:browser-demo-session
```

Use the Codex in-app Browser with the `iab` backend for the interactive profiles.

## Completion Criteria

- Duplicate route computations are removed from inventoried command paths.
- Initial and retry work follows an explicit deterministic budget and fair ordering.
- Pending path semantics are visible, save-safe when necessary, and never represented as an empty live path.
- Determinism, save/load, route parity, browser, and performance checks pass.
- Evidence in `plans/evidence/024/` proves the input and scheduler budgets without reducing game fidelity.

## Rollback

Retain the duplicate-search removals and diagnostics even if scheduling must be rolled back. Disable scheduler consumers by request kind, restoring the verified synchronous path for that kind; never deserialize pending requests into empty active paths or silently drop queued commands.
