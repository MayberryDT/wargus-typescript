# Plan 024: Budget And Stagger Pathfinding

> **Executor instructions:** Execute this Wave 4 plan in an isolated Halla
> worktree only after Plans 022 and 023 pass every Wave 3 exit gate and both
> acceptance commits integrate. Plan 024's technical dependencies remain Plans
> 018, 019, 020, and 023; Plan 022 is a coordinator wave barrier, not an API
> dependency. Follow [the Halla execution policy](HALLA-EXECUTION-POLICY.md)
> and [the performance acceptance contract](PERFORMANCE-ACCEPTANCE.md)
> unchanged. Implement resumable A* and the node-expansion budget from the
> first scheduler commit. Pending path requests and resumable progress are
> authoritative, mandatory save state. Stop on every STOP condition.

## Status

- **Status:** TODO
- **Wave:** 4 — High-risk scheduling
- **Priority:** P1
- **Effort:** L
- **Risk:** HIGH — authoritative deferred commands, save compatibility, and
  deterministic route ordering
- **Depends on:** accepted and integrated Plans 018, 019, 020, and 023
- **Wave entry gate:** accepted and integrated Plans 022 and 023
- **Category:** performance, simulation, persistence
- **Original planning base:** `8ac0006`, 2026-07-27
- **Roadmap rewrite base:** `0993cdd55818aa015c42e3e71e18d4b57ab016ea`
  (`git rev-parse HEAD` printed the same SHA)

Plans 022 and 023 must both finish and integrate before any Wave 4 executor
starts. After Wave 3 integration, the coordinator must compare the integrated
tree with the concrete rewrite base. If any cited pathfinding, order,
occupancy, save, normalizer, verifier, or performance seam changed, the
coordinator must amend this plan with the new accepted concrete SHA, refreshed
excerpts, inventories, and exact handoff names before Plan 024 begins. Never
replace a concrete SHA with a symbolic token. If the refresh is absent when a
cited seam differs, STOP.

Plan 024 and Plan 025 may execute concurrently only while the ownership tables
in both plans remain disjoint. Plan 024 owns path requests and save-schema
surfaces. It must not edit Plan 025's visibility/fog files. If implementation
reveals a shared file or shared runtime state not assigned to the coordinator,
serialize the plans; do not resolve the overlap in either isolated branch.

## Why this matters

Path requests are synchronous and can arrive in bursts. Group commands can
validate a route and then calculate it again, while attack, attack-move,
harvest, collision, and exploration retries can align on one simulation tick.
Even after accepted terrain and occupancy improvements, one whole A* search can
still expand most of a map and monopolize the fixed step. A whole-search count
cannot bound that work.

This plan makes path work an explicit deterministic simulation workload. Every
eligible request advances under one global node-expansion budget, retains its
A* state between ticks, survives save/load exactly, and commits through the
same ordered endpoint and order semantics as the synchronous implementation.

## Current state and drift checks

At the concrete rewrite base, `findPathResult` can run two complete searches
synchronously:

```ts
// src/simulation/pathfinding.ts:63-91
export function findPathResult(world: WorldState, unit: WorldUnit, targetX: number, targetY: number): PathSearchResult {
  const start = worldToTile(world, unit.x, unit.y);
  const target = worldToTile(world, targetX, targetY);
  const search = searchReachable(world, unit, start, target, "path-planning", true);
  // ...
  const staticSearch = searchReachable(world, unit, start, target, "static", true, "path-planning");
  // ...
}
```

The A* expansion and tie-break order is currently:

```ts
// src/simulation/pathfinding.ts:128-135, 153-195, 276-279, 311-315
while (openHeap.length > 0) {
  const current = popOpenNode(openHeap);
  // ...
  for (const direction of sourceDirections) {
    // north, north-east, east, south-east, south, south-west, west, north-west
  }
}

function openNodeComesBefore(left: NodeRecord, right: NodeRecord): boolean {
  return sourceAStarNodeComesBefore(left, right)
    || (!sourceAStarNodeComesBefore(right, left) && left.sequence < right.sequence);
}
```

`sourceAttackTargetPathResult` constructs candidate endpoints in authoritative
distance, `y`, `x` order and calls `findPathResult` on each candidate until the
first ready result, falling back to the first temporarily blocked result.
Rejected commit `2fa96ce` replaced that ordered endpoint loop with a
multi-goal search. That semantic change is prohibited: a nearest-any heuristic
can select a different endpoint from the first candidate accepted by the
current ordered loop. The commit remains rejected and must not be cherry-picked,
reimplemented, or used as a baseline. Its X12 fixture is useful only as an
acceptance scenario, not as approval of its endpoint behavior.

The save format remains `version: 1` and extends old saves with optional fields:

```ts
// src/wargus/saveGame.ts:104-165
interface SavedGame {
  version: 1;
  // ...
  world: {
    units: WorldState["units"];
    // optional additive fields are normalized on load
  };
}
```

Load creates a new world, normalizes each saved field, prunes invalid
references, restores valid orders, and rebuilds transient state. A live
movement order is valid only with a non-empty in-bounds path and valid
`pathIndex`; a deferred request must never be represented by an active order
with an empty path.

Run before editing:

```bash
test "$(hostname)" = halla
git merge-base --is-ancestor 0993cdd55818aa015c42e3e71e18d4b57ab016ea HEAD
git diff --stat 0993cdd55818aa015c42e3e71e18d4b57ab016ea..HEAD -- \
  src/simulation/pathfinding.ts src/simulation/pathRequests.ts \
  src/simulation/orders.ts src/simulation/passability.ts \
  src/simulation/occupancyIndex.ts src/simulation/worldSelectors.ts \
  src/wargus/saveGame.ts scripts/verify-save-schema.mjs \
  scripts/verify-pathfinding-budget.mjs scripts/verify-x12-first-tick.mjs \
  scripts/verify-occupancy-index.mjs plans/evidence/018.md \
  plans/evidence/019.md plans/evidence/020.md plans/evidence/023.md \
  plans/evidence/024.md plans/023-add-deterministic-spatial-occupancy-index.md \
  plans/024-budget-and-stagger-pathfinding.md
rg -n "findPath|findPathResult|sourceAttackTargetPathResult|sourceDirections|openNodeComesBefore|sequence" \
  src/simulation/pathfinding.ts src/simulation/orders.ts
rg -n "world\.units\s*=|world\.units\.(push|splice|pop|shift|unshift|sort|reverse|copyWithin|fill)|transitionWorldOccupant|registerWorldOccupant|unregisterWorldOccupant|invalidateWorldOccupancyIndex" \
  src/simulation/orders.ts src/simulation/occupancyIndex.ts
rg -n "interface SavedGame|version: 1|createSavedGame|loadSavedGameFromRaw|normalizeLoadedOrder|hasValidLoadedPathToPoint" \
  src/wargus/saveGame.ts scripts/verify-save-schema.mjs
```

Expected: the rewrite base is an ancestor; both Wave 3 acceptance commits are
integrated; later changes are accepted Wave 3 work or explained coordinator
integration; Plan 019 terrain, Plan 020 first-match ID lookup, and Plan 023
authoritative occupancy order remain intact; every path request/retry and
path-relevant mutation is inventoried; and save/load still follows additive
version-1 normalization. If any cited seam differs without the coordinator
refresh required above, STOP.

## Commands you will need

| Purpose | Command | Expected result |
|---|---|---|
| Host/worktree | `test "$(hostname)" = halla && git status --short --branch` | Halla, assigned isolated branch, understood status |
| Typecheck | `./node_modules/.bin/tsc --noEmit` | exit 0 |
| Path scheduler | `node scripts/verify-pathfinding-budget.mjs` | node budget, resume, order, fairness, cancellation, save/load, route, and diagnostic cases pass |
| X12 | `node scripts/verify-x12-first-tick.mjs` | production X12 world advances exactly one first tick under the expansion cap, then reaches the legacy outcome |
| Terrain parity | `node scripts/verify-terrain-metadata-cache.mjs` | accepted Plan 019 terrain semantics remain exact |
| Unit-ID parity | `node scripts/verify-unit-index.mjs` | accepted Plan 020 first-match semantics remain exact |
| Occupancy parity | `node scripts/verify-occupancy-index.mjs` | accepted Plan 023 order, mutation, fallback, and timing semantics remain exact |
| Source pathfinding | `npm run verify:source-pathfinding` | route, endpoint, status, and tie-breaking results remain exact |
| Save schema | `npm run verify:save-schema` | new version-1 fields, old-save defaults, malformed-input normalization, and live-path rules pass |
| Determinism | `npm run verify:runtime-determinism` | fixed-tick queue, sequence, frontier, route, state hash, and save output repeat exactly |
| Browser playable | `npm run verify:browser-playable-session` | commands, movement, save/load, and world replacement pass |
| Browser demo | `npm run verify:browser-demo-session` | deterministic demo behavior passes |
| Asset gate | `npm run verify:wargus-assets` | exit 0 |
| Build | `npm run build` | exit 0 |
| Performance | accepted `command-18`, `army-200`, and `combat-100` rows at 1280×720 plus X12 | three valid trials per matrix row; direct scheduler evidence recorded; every unchanged shared budget passes |

Run the focused and non-browser commands before implementation to freeze the
accepted baseline. Performance captures run serially under the shared
contracts and never overlap Plan 025 or another executor's capture.

## Scope

**Plan 024 owns:**

- `src/simulation/pathRequests.ts` (new), including authoritative request
  state, deterministic cycle scheduling, resumable-search serialization,
  cancellation, restoration, diagnostics, and read-only inspection;
- `src/simulation/pathfinding.ts`, only extraction of the existing A* into the
  resumable state machine and preservation of existing route/status semantics;
- `src/simulation/orders.ts`, only the accepted-base path request, issue,
  validation, retry, replan, and cancellation inventory;
- `src/wargus/saveGame.ts`, only additive version-1 path-request
  serialization and normalization;
- `scripts/verify-save-schema.mjs`, only the new path-request schema and
  backward-compatibility assertions;
- `scripts/verify-pathfinding-budget.mjs` and
  `scripts/verify-x12-first-tick.mjs` (new); and
- `plans/evidence/024.md`.

**Out of scope:**

- terrain metadata/classification, Plan 020 ID semantics, Plan 023 occupancy
  ordering/mutation behavior, movement costs, diagonal rules, goal range,
  endpoint candidate order, A* comparator fields, neighbor order, order
  acknowledgment, target selection, balance, or tick rate;
- the rejected `2fa96ce` multi-goal endpoint semantics or any optimization
  that changes the first acceptable endpoint from the existing ordered loop;
- visibility, exploration, fog, `src/simulation/visibilityCache.ts`,
  `src/view/fogChunkCache.ts`, `src/simulation/world.ts`, or
  `src/view/renderWorld.ts`; Plan 025 owns those surfaces and adds no save data;
- independently editing `src/main.ts`, Plan 018's shared performance schema,
  `package.json`, `plans/README.md`, or another plan's evidence; and
- weakening a shared budget, trial count, validity rule, fingerprint,
  determinism comparison, save assertion, route oracle, or evidence rule.

The Wave coordinator owns shared `src/main.ts`, Plan 018 performance-schema,
`package.json`, and `plans/README.md` integration. Plan 024 defines namespaced
diagnostics and package-script names; the coordinator wires shared capture and
package/index entries after both isolated branches are accepted.

## Git workflow

- Branch from the accepted, coordinator-refreshed Wave 4 start into an
  isolated `plan-024` worktree.
- Commit the resumable parity state machine before routing any caller. Commit
  the authoritative scheduler and save contract together because neither is
  safe alone. Migrate request families in independently revertible commits.
- Do not merge Plan 025, edit its simulation/renderer cache files, resolve
  shared main/performance/package/index conflicts, push, deploy, or open a PR
  unless instructed.

## Shared interfaces and ownership

- Accepted Plan 018 supplies the normalized matrix, profile-definition hash,
  initial entity/effect fingerprint, environment, raw artifact directory,
  checksums, and worst-trial results. Its budgets and aggregation remain
  unchanged.
- Accepted Plan 019 supplies allocation-free terrain metadata. Pathfinding
  consumes it through existing passability APIs and does not change terrain
  classification.
- Accepted Plan 020 supplies first-match stable-ID resolution. Cancellation
  and restoration use that accepted lookup without changing duplicate-ID
  behavior.
- Accepted Plan 023 supplies ordered occupancy candidates and exact
  register/unregister/transition/invalidation ownership. Every A* passability
  query preserves the authoritative `world.units` order, first-match behavior,
  and fallback semantics.
- Plan 025 owns transient simulation visibility contributions and renderer fog
  chunks. It does not import path request state, inspect pending intents, or
  add save fields. Plan 024 does not import visibility/fog caches.
- Existing terrain, ID, occupancy, source-pathfinding, browser, asset, and
  build verifiers are read-only gates except for the Plan 024-owned additions
  to `verify-save-schema`.

The Plan 024 branch emits plan-local diagnostics only. The coordinator-owned
Plan 018 extension uses the `plan024.pathRequests` namespace and preserves all
existing shared fields:

- `enqueued`, `completed`, `failed`, `cancelled`, and `superseded`;
- `nodeExpansions`, `expansionsPerTick`, and `searchDurationMs`;
- `queueDepth`, `oldestAgeTicks`, and `firstServiceDelayTicks`;
- `cyclesStarted`, `restarts`, `retryCount`, and `retryPhaseDelayTicks`;
- `duplicateSearches` and `synchronousFallbackSearches`; and
- `saveRestores`, `normalizerDrops`, and `frontierRestoreFailures`.

Duration and count samples are bounded and resettable. Timing, diagnostics,
and capture state remain outside saves and gameplay decisions. Shared capture
wiring is coordinator-owned and namespaced; the focused verifier and evidence
collector may read the plan-local snapshot directly.

## Deterministic scheduler contract

There is no whole-search count budget. Freeze these constants in
`pathRequests.ts`:

```ts
export const PATH_NODE_EXPANSIONS_PER_TICK = 512;
export const PATH_NODE_EXPANSIONS_PER_QUANTUM = 16;
export const PATH_RETRY_PHASE_COUNT = 8;
```

One budgeted expansion is one open-heap pop attempt, including a stale or
already-closed entry. A valid pop completes its goal check and the existing
eight-neighbor loop atomically before yielding. Search initialization and
final path reconstruction do not consume expansion units, but diagnostics
time them. No path call routed by this plan may fall back to an unbudgeted
synchronous search.

The scheduler forms deterministic service cycles. At cycle creation, snapshot
all eligible request sequences and sort them by:

1. fixed priority (`0` issued command, `1` active-order replan, `2` automatic
   retry);
2. request `sequence`;
3. stable `unitId`.

Each cycle member receives one 16-expansion quantum before that sequence may
enter the next cycle. Canceled members are skipped. A request enqueued or made
eligible during a cycle joins the next cycle. Unused work from an early
completion passes to the next member, but a fixed step never exceeds 512
expansions. Persist `cycle`, `cycleMembers`, and `cycleCursor` so save/load
restores the exact next service decision.

This is the starvation bound: a request eligible when a cycle forms receives
its next quantum within
`ceil(cycleMembers.length / (512 / 16))` processed simulation ticks. A request
that becomes eligible during a cycle receives service within
`ceil((remainingCycleMembers + nextCycleMembers) / 32)` ticks. The focused
verifier calculates that bound from the recorded queue and fails on any
violation. Continuous new commands cannot jump into the active cycle.

Automatic retries keep their existing base retry tick, then move only to the
first tick at or after it whose modulo-8 phase equals
`stableHash(unitId + ":" + requestKind) % 8`. Initial issued commands are
eligible immediately. `eligibleTick` is authoritative and serialized. No
randomness, wall clock, promise completion, collection insertion accident, or
renderer frame decides request order or retry phase.

## Resumable A* and authoritative order contract

Extract the current search into `createResumablePathSearch` and
`advanceResumablePathSearch`. The state retains the current blocker stage,
start and goal, open heap, `openByKey`, closed set, records, next node sequence,
nearest node/range, expansion count, and parent links. `findPath` and
`findPathResult` become thin synchronous compatibility wrappers used only by
unmigrated callers during staged implementation; they drive the same resumable
machine to completion and disappear from every migrated production request
path before acceptance.

The state machine preserves exactly:

- `sourceDirections` order: north, north-east, east, south-east, south,
  south-west, west, north-west;
- no immediate parent reversal, diagonal corner checks, blocker modes,
  passability costs, exact-goal checks, nearest-goal comparison, and
  path simplification;
- comparator order by `f`, `h`, distance-to-goal, then original node
  `sequence`; an improved open node retains its existing sequence;
- accepted Plan 023 authoritative occupancy candidate order and live
  predicates at every passability call; and
- `findPathResult`'s path-planning search, static fallback, status, and
  endpoint-range comparison.

For attack-target endpoints, keep the current candidate sort by distance,
`y`, then `x`. Resume one candidate's complete `findPathResult` state before
advancing to the next candidate. Return the first ready result or the first
temporarily blocked result exactly as today. Do not introduce a multi-goal
heuristic. Commit `2fa96ce` and its endpoint semantic change remain prohibited.

Each completion revalidates the selected path, target, unit eligibility, and
intent against current authoritative world state before commit. If a still
valid intent's route became invalid while suspended, restart the same request
with the same request sequence and increment `restarts`; do not enqueue it at
the tail. If the intent itself is invalid, cancel it by the exact rules below.
Repeated restarts that prevent the starvation bound or queue drain are an
acceptance failure, not permission to use a synchronous fallback.

## Mandatory request and save contract

Runtime request state lives in a dedicated `WeakMap<WorldState,
PathRequestSchedulerState>` owned by `pathRequests.ts`. Although it is not a
`WorldState` field, it is authoritative simulation state: the determinism
oracle, save writer, save loader, and canonical test snapshot must include it.
Every new save writes the state even when the queue is empty.
The mandatory pending-request representation is never optional for a new save or determinism snapshot.

The additive version-1 save field is exact:

```ts
interface SavedGame {
  version: 1;
  world: {
    // existing fields unchanged
    pathRequests?: SerializedPathRequestSchedulerState;
  };
}

interface SerializedPathRequestSchedulerState {
  nextSequence: number;
  cycle: number;
  cycleMembers: number[];
  cycleCursor: number;
  requests: SerializedPendingPathRequest[];
}

interface SerializedPendingPathRequest {
  sequence: number;
  unitId: string;
  priority: 0 | 1 | 2;
  enqueuedTick: number;
  eligibleTick: number;
  retryCount: number;
  intent: SerializedPathIntent;
  search: SerializedResumablePathSearch | null;
}
```

`SerializedPathIntent` is an explicit discriminated union for every inventoried
path-bearing intent: move, attack, attack-move, attack-ground, spell-cast,
explore, patrol, repair, load-transport, follow, defend, unload-transport,
harvest-to-resource, harvest-to-dropoff, build, build-oil-platform,
collision-recovery, and rally movement. Each variant stores the complete
non-path order payload needed to commit the current `WorldOrder`, including
target IDs/coordinates, phases, resource/build/spell metadata, and queued
command provenance. It contains no `path: []` placeholder.

`SerializedResumablePathSearch` preserves the exact runtime machine without
depending on JSON object identity: assign a numeric record ID to every node;
serialize node fields and parent record IDs, heap record-ID order,
`openByKey`/closed/record mappings, current stage, next node sequence,
nearest record/range, expansion count, start/goal, blocker modes, and ordered
attack candidate cursor. Load validates IDs and bounds, then rebuilds Maps,
Sets, heap references, and parent links without performing a simulation
expansion. A valid save therefore resumes at the exact next heap pop and exact
next service member.

Keep `version: 1`, storage keys, and existing fields unchanged. The optional
property exists only so legacy version-1 saves remain readable. New saves
always write it. backward-compatible normalization is fixed:

- missing `pathRequests` becomes
  `{ nextSequence: 1, cycle: 0, cycleMembers: [], cycleCursor: 0, requests: [] }`;
- accept only safe-integer positive request/node sequences, finite in-map
  coordinates, known intent discriminants, valid unit/target references,
  bounded ticks, legal priority, and internally consistent frontier IDs;
- keep the first valid serialized occurrence of a duplicate request sequence;
  for multiple requests targeting one unit, retain the greatest sequence and
  record lower sequences as normalized supersessions;
- sort normalized requests by sequence, filter cycle members to surviving
  eligible sequences without duplicates, and clamp the cursor to that list;
- restore `nextSequence` exactly when it is a safe integer greater than every
  retained sequence; otherwise set it to `max(retained sequence) + 1`, or `1`
  for an empty legacy queue; and
- discard an invalid individual request with a counted normalizer reason.
  Reject the whole save rather than silently alter behavior if a retained
  frontier cannot be rebuilt exactly or the next sequence would exceed
  `Number.MAX_SAFE_INTEGER`.

After normalizing units and references, restore the scheduler before
`restoreIdleOnReadyOrders` and before the loaded world can advance. A valid
pending intent owns that unit's deferred command; the unit has no fake live
movement order with an empty path. Save/load during every frontier stage must
produce byte-identical normalized path-request serialization, the same next
service sequence, completion tick, route, order, and canonical hash as an
uninterrupted control run from the save boundary.

## Cancellation and supersession contract

Cancellation is synchronous at the owning mutation/command seam and records
one stable reason:

| Event | Required action |
|---|---|
| New command for a unit | cancel every older pending intent for that unit as `superseded-new-command` before assigning the new sequence |
| Unit death or removal | cancel as `unit-gone` before/with accepted Plan 023 unregister |
| Unit enters cargo/resource containment | cancel as `unit-contained`; unloading never resurrects the canceled request |
| Transport/world handoff | cancel the transported unit; dispose the old world's scheduler on world replacement |
| Target unit death/removal/containment | cancel target-required intents as `target-gone`; point intents remain subject to in-map/passability validation |
| Target or build point becomes invalid | cancel as `invalid-target`; do not commit a nearest route for an intent whose existing rules reject that endpoint |
| Save load | restore only normalized requests; invalid entries use their normalizer reason and never become empty active orders |
| Explicit command cancel/stop | cancel as `explicit-cancel` before applying the replacement idle/hold behavior |

Coalescing is allowed only through the same-unit supersession rule above.
Never merge different units, target candidates, retry kinds, or command
sequences. A canceled sequence never re-enters a service cycle. Completion
commits exactly once; a stale frontier cannot overwrite a newer command.

## Steps

### Step 0: Prove the Wave 4 gate and freeze direct baselines

Confirm Plans 022 and 023 passed all focused, shared-budget, browser,
determinism, durability, and review exit gates and integrated. Verify technical
Plans 018/019/020/023 and their accepted artifacts/checksums/fingerprints.
Run refreshed drift checks and all non-browser baseline commands.

Regenerate the complete production path inventory: initial commands,
validation/commit pairs, queued commands, group movement, attack candidate
endpoints, every active-order replan, collision recovery, attack/attack-move/
harvest/build/repair/follow/defend/transport/explore/patrol/spell/rally retry,
death/removal, containment, target invalidation, and world replacement. Assign
each row one request intent, priority, commit function, cancel owner, retry
phase, and focused case.

Before editing, measure the synchronous implementation with identical timer
boundaries: request/search count, duplicate count, nodes expanded, per-search
p50/p95/p99/mean/max/total, total search milliseconds per processed simulation
step, fixed-step p50/p95/p99/max, input latency, X12 first-tick time, and the
current ordered route/order/hash result. Record accepted Plan 018 environment,
profile hash, initial entity/effect fingerprint, per-trial and worst-trial
results.

**Verify:** strict Wave 4 barrier, technical handoffs, concrete drift, complete
inventory, save baseline, direct timing, route/order fingerprints, X12
outcome, shared checksums, host policy, and baseline gates are green.

### Step 1: Build resumable A* with exact synchronous parity

Extract the state machine and serialization described above without routing a
production caller. Drive it to completion in the focused verifier and compare
with the current functions after every expansion count from zero through
completion. Cover exact/nearest/unreachable/temporarily-blocked searches,
moving/static occupancy, improved open nodes, stale heap entries, map edges,
multi-tile footprints, diagonal corners, duplicate IDs, and ordered attack
candidate endpoints.

Add a saved-frontier round trip at every stage. Restore Maps/Sets/heap/node
identity from record IDs and assert the next pop, final status, path points,
endpoint, node sequence, and serialized state are exact.

**Verify:** synchronous wrapper and interrupted/resumed results match exactly;
the accepted Plan 023 candidate oracle remains authoritative; rejected
multi-goal endpoint behavior has an explicit failing regression fixture.

### Step 2: Add the mandatory scheduler and persistence atomically

Implement the 512/16 deterministic service-cycle contract, mandatory request
state, cancellation table, plan-local diagnostics, save writer, normalizer,
and exact loader restoration in one checkpoint. New saves always include
`pathRequests`; legacy saves omit it and restore an empty queue with sequence
one. Add no timing or diagnostic field to the payload.

Before routing commands, use focused synthetic requests to prove active-cycle
membership, priority/sequence/unit ordering, mid-cycle enqueue behavior,
unused-quantum transfer, expansion cap, starvation bound, retry phasing,
cancellation, supersession, sequence exhaustion rejection, malformed payload
handling, and byte-stable save round trips.

**Verify:** no tick exceeds 512 expansion attempts, no request exceeds one
quantum per cycle, exact next-sequence/cursor/frontier restoration passes, and
no pending request is lost or represented as an empty active movement order.

### Step 3: Remove duplicate work and migrate issued commands

Route validation and commit through one stored path result so an accepted
route is never recomputed. Migrate player, AI, group, queued, rally, and other
inventoried initial command paths one family at a time. Command input is
acknowledged in its current tick; the authoritative request replaces the
previous path-bearing order until success/failure. Preserve selection order,
queued-command order, request sequence assignment order, endpoint candidate
order, and command feedback.

Do not use a multi-goal search to reduce attack candidate work. The only
allowed duplicate removal is reuse of the exact route/status already computed
for the same unit, intent, and endpoint.

**Verify:** mass commands enqueue in authoritative issuance order, input
returns without synchronous A*, each accepted result commits once, duplicate
validation/issue searches are zero, and route/order/feedback fixtures match.

### Step 4: Migrate replans/retries and cancellation owners

Route every accepted inventory retry/replan through priority 1 or 2 requests.
Apply the exact modulo-8 retry phase after the existing base retry tick. Add
cancel/supersede calls at unit death/removal, new command, transport/resource
containment, target loss, invalid point, stop/cancel, and world replacement.
Preserve Plan 020 ID lookup and Plan 023 occupancy lifecycle call order.

Run continuous mixed-priority queues, repeated block/unblock, target motion,
transport, death, world replacement, and save/load mid-cycle. A still-valid
route invalidated before commit restarts in place; invalid intent cancels.

**Verify:** every inventory row has one enqueue/commit/cancel owner; retry work
is phased; starvation bounds hold under continuous arrivals; stale results
cannot commit; and no synchronous fallback or unexplained restart occurs.

### Step 5: Prove X12, save/load, and deterministic behavior

Create the production X12 world from
`campaigns/human-exp/levelx12h.smp.gz`. Its first active simulation tick must
advance exactly one tick, execute at most 512 path expansion attempts, return
before the existing 2,500 ms watchdog, and leave excess work as visible pending
requests rather than synchronous searches. Continue deterministically until
the queue reaches the scenario checkpoint.

Compare the final X12 route endpoints, order kinds/targets, entity/effect
fingerprint, and canonical hash with the accepted synchronous baseline. The
result must preserve the ordered endpoint oracle; passing the watchdog alone
is insufficient.

Save and load at queue creation, middle of a quantum, between blocker stages,
between ordered attack candidates, immediately before completion, and after
cancellation. Compare uninterrupted and restored next service sequence,
completion tick, route, orders, hash, and save serialization.

**Verify:** X12 acceptance, version-1 backward compatibility, normalizer,
frontier restoration, sequence restoration, source pathfinding, occupancy,
save, and fixed-tick determinism all pass.

### Step 6: Revalidate and measure

Run every command in the table. Capture three independent valid trials for
`command-18`, `army-200`, and `combat-100` using the exact accepted Plan 018
environment, viewport, warmup, duration, fingerprints, statistics, and
worst-trial rule. Do not pool samples.

Record per trial: enqueue/completion/failure/cancellation counts; direct search
duration and node-expansion distributions; expansions per processed tick;
queue depth and oldest age; first-service and completion delay; retries,
phasing, restarts, duplicate searches, synchronous fallbacks; simulation-step
statistics; command latency; scheduler backlog; frame/heap/long-task results;
and X12 evidence.

For `army-200`, worst-trial path-work p95 per processed simulation tick must be
lower than the synchronous baseline and total path-search milliseconds per
processed step must not increase. Every after tick must stay at or below 512
expansions, duplicate and synchronous fallback counts must be zero, the
calculated starvation bound must hold, and the queue must drain in the bounded
scenario. Every unchanged shared budget must pass; a greater-than-5% worsening
of worst-trial frame p95 is a regression.

**Verify:** direct path work improves rather than moving into queue
maintenance, routes/orders/saves remain exact, shared budgets pass, and
evidence is durable and checksum-verified.

## Test plan

- Expansion-by-expansion exact parity for all current A* statuses and stages.
- Existing neighbor, comparator, node-sequence, nearest-node, path
  simplification, and accepted Plan 023 occupancy order.
- Ordered attack endpoint candidates and a regression proving `2fa96ce`
  multi-goal semantics remain rejected.
- 512 expansion attempts per tick, 16 per member per cycle, unused work,
  priority/sequence/unit ordering, and mid-cycle enqueue.
- Calculated starvation bounds under continuous issued, replan, and retry load.
- Deterministic modulo-8 retry phases from stable unit ID and request kind.
- Every initial request, validation/commit pair, replan, retry, and cancel owner
  in the refreshed inventory.
- New command, death/removal, transport/resource containment, target loss,
  invalid target, explicit stop, and world replacement cancellation.
- Legacy absent field, empty new queue, malformed entries, duplicate
  sequences, multiple same-unit requests, invalid references, sequence
  exhaustion, and exact next-sequence normalization.
- Heap/Map/Set/node identity reconstruction at every resumable search stage.
- Save/load mid-cycle exact next service, completion tick, route/order/hash,
  and byte-stable normalized save.
- X12 first active tick cap plus eventual route/order/hash acceptance.
- No active path-bearing order with an empty path; no silent request loss.
- Namespaced diagnostic reset/bounds and zero synchronous fallback.
- Source pathfinding, terrain, ID, occupancy, browser, asset, build,
  determinism, and unchanged shared-budget gates.

## Performance acceptance

The accepted Plan 018 assigned rows and the Step 0 synchronous direct timing
are the before baseline. Each matrix row needs three independent valid after
trials under the unchanged shared lifecycle, nearest-rank statistics, and
worst-trial rule. X12 uses the same accepted commit/environment and its focused
scenario contract; it does not replace a matrix row.

For `army-200`, worst-trial path-work p95 per processed simulation tick must
improve and total path-search milliseconds divided by processed simulation
steps must not exceed the synchronous baseline. The 512 expansion cap,
calculated starvation bound, queue drain, zero duplicate searches, and zero
synchronous fallbacks are independent gates. Candidate/work-count reduction
cannot substitute for direct timing. Never discard a valid budget, latency,
queue-age, route, save, or timing failure. Plan 024 cannot close while a shared
budget fails, command latency regresses, frame p95 regresses over 5%, routes or
fingerprints differ, the environment is incomparable, or evidence is
incomplete.

## Evidence contract

Store raw artifacts outside Git at:

```text
.artifacts/performance/024/<commit>/<UTC-stamp>/
```

Include accepted Plan 018/019/020/023 artifact and checksum references,
environment, profile-definition and initial entity/effect fingerprints, one
JSON per trial, normalized summaries, the exact request/cancellation inventory,
synchronous direct baseline, route/endpoint/order fingerprints, per-search and
per-tick node/time distributions, cycle/fairness/queue-age results,
save/normalizer/frontier/sequence fixtures, X12 raw result, terrain/ID/
occupancy/pathfinding parity, controller/resource records,
invalid/replacement records, and SHA-256 checksums. Independently recompute new
checksums and verify every referenced baseline.

Commit only concise normalized results to the single evidence file
`plans/evidence/024.md`; do not create `plans/evidence/024/`, and do not rely
on `/tmp` as durable evidence.

## Done criteria

- [ ] Strict Wave 4 barrier is open: Plans 022 and 023 passed all exit gates
  and integrated; technical Plans 018/019/020/023 handoffs verify.
- [ ] Every inventoried initial/replan/retry path uses the authoritative
  request scheduler and no migrated path uses synchronous fallback.
- [ ] Every tick obeys the 512 node-expansion-attempt budget from the first
  scheduler implementation; resumable A* preserves exact comparator,
  neighbor, blocker, route, and status semantics.
- [ ] Service cycles preserve priority/sequence/unit order and the calculated
  starvation bound under continuous arrivals.
- [ ] Ordered attack endpoint selection is exact; commit `2fa96ce` remains
  rejected and its semantic change is absent.
- [ ] New version-1 saves always contain pending request/cycle/frontier state;
  legacy saves default compatibly; normalizer and exact sequence/frontier
  restoration pass.
- [ ] Every death, new command, transport/containment, world replacement,
  target loss, invalid target, and explicit cancel has one exact owner.
- [ ] X12 advances its first tick under the cap/watchdog and reaches the
  accepted route/order/hash outcome.
- [ ] Terrain, ID, occupancy, source-pathfinding, save, normalizer, browser,
  determinism, asset, build, and focused gates pass.
- [ ] Direct path timing improves, work is not shifted into maintenance, and
  every assigned shared budget passes with durable checksum-verified evidence.
- [ ] The branch contains only Plan 024-owned files; coordinator
  main/performance-schema/package/README integration is separate.

## STOP conditions

- Either Wave 3 plan has not passed every exit gate and integrated, or any
  technical dependency, durable artifact, checksum, fingerprint, route oracle,
  terrain/ID/occupancy behavior, or direct baseline cannot be verified.
- A cited seam differs after Wave 3 integration without the required
  coordinator refresh to a concrete accepted SHA.
- The complete path/retry/cancellation inventory has an unowned row, or a
  request would require an active empty-path order.
- Any tick can exceed 512 expansion attempts, a migrated caller performs
  synchronous fallback, a request can starve beyond the calculated bound, or
  retries require randomness/wall clock.
- Resumption changes neighbor order, comparator/tie sequence, blocker mode,
  route/status, authoritative occupancy order, or first accepted endpoint.
- An implementation recreates rejected commit `2fa96ce` semantics, uses a
  multi-goal search for ordered attack candidates, or accepts X12 solely from
  elapsed time without route/order/hash parity.
- Pending state is optional in new saves, sequence/cycle/frontier state cannot
  restore exactly, a malformed request becomes an empty active order, or valid
  save/load differs from the uninterrupted control.
- Cancellation is delayed past death/removal/containment/new-command/world
  replacement, a stale result can commit, or coalescing crosses units/intents.
- Correctness requires Plan 025 visibility/fog files, changing Plan 019/020/023
  semantics, or an unassigned shared file/state.
- An owned edit reaches `src/main.ts`, performance schema, `package.json`,
  `plans/README.md`, or another plan's evidence before coordinator integration.
- Any focused, upstream, type, save, normalizer, browser, determinism, asset,
  or build gate fails twice.
- Halla/browser qualification fails, captures overlap, replacement exhausts,
  a shared budget/command latency fails, frame p95 regresses over 5%, direct
  path timing does not improve, or durable single-file evidence/checksums fail.

## Rollback

Stop new request creation for the failing request family, then allow its
already-authoritative requests to drain under the last green scheduler
checkpoint. Roll back migrated families in reverse order to the exact
synchronous wrapper only after their pending sequences are empty. Keep the
version-1 `pathRequests` reader/normalizer until no deployed or test save can
contain the additive field; never silently drop a pending intent or deserialize
it into an empty live order.

Rollback of the state machine restores the current `findPath`/
`findPathResult`, ordered attack endpoint loop, and Plan 023 passability
consumption together. Never retain a partially resumed search or
`2fa96ce`-style endpoint optimization. Preserve accepted Plans 018–023,
failed/invalid evidence, and compatibility fixtures. Revert only Plan
024-owned and coordinator integration commits. Stop exact owned processes and
remove only exclusive artifacts.

## Maintenance notes

Every new path-bearing command or retry needs an explicit intent variant,
priority, enqueue point, commit function, cancellation owner, save normalizer,
focused interruption fixture, and direct timing row. Changing the 512/16/8
constants, comparator, neighbor order, endpoint policy, retry phase, or save
payload is a semantic plan amendment, not tuning during execution. Keep
pending state mandatory, frontier restoration exact, Plan 023 order
authoritative, diagnostics plan-local, and the synchronous rollback executable.
