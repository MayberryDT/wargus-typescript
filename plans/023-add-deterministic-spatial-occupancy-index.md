# Plan 023: Add A Deterministic Spatial Occupancy Index

> **Executor instructions:** Execute this Wave 3 plan in an isolated Halla
> worktree only after Plans 019, 020, and 021 pass their Wave 2 exit gates and
> integrate. Plan 023's technical dependencies remain Plans 018, 019, and 020;
> Plan 021 is a coordinator wave barrier, not an API dependency. Follow
> [the Halla execution policy](HALLA-EXECUTION-POLICY.md) and
> [the performance acceptance contract](PERFORMANCE-ACCEPTANCE.md) unchanged.
> Preserve `world.units` as the authoritative ordered collection and preserve
> every first-match, iteration, passability, placement, collision, and path
> tie-breaking result. Stop on every STOP condition.
>
> **Drift check:** Run every command and inventory in `Current state` first.
> STOP on an unexplained accepted-base, excerpt, ownership, or dependency drift.

## Status

- **Status:** READY — WAVE 3 ENTRY VERIFIED
- **Wave:** 3 — Structural optimization
- **Priority:** P1
- **Effort:** L
- **Risk:** HIGH — simulation mutation coverage and deterministic ordering
- **Depends on:** accepted and integrated Plans 018, 019, and 020
- **Wave entry gate:** accepted and integrated Plans 019, 020, and 021
- **Category:** performance, simulation
- **Original planning base:** `8ac0006`, 2026-07-27
- **Roadmap rewrite base:** `d61125e4f8d42b9e7a4dfa544e1c5e52768c69ae`
  (`git rev-parse HEAD` printed the same SHA)
- **Wave 3 concrete runtime base:** `6c5e0faa861e1ba7a931c913e561fb837c2afb01`

Plans 019/020 are Plan 023 technical implementation dependencies; Plan 021 is
a coordinator wave barrier only. Accepted Wave 2 integration at
`6c5e0faa861e1ba7a931c913e561fb837c2afb01` contains all three accepted plans
and the combined schema-v4 gate. This refresh pins that concrete runtime base
and the live query/mutation seams below; later closeout commits are
documentation-only. Any unexplained code drift from this SHA is a STOP.

## Why this matters

Tile passability, footprint planning, overlap/placement checks, and stacked-unit
recovery repeatedly scan all of `world.units` to discover a small local
candidate set. A transient ordered occupancy index can bound candidate visits
by covered tiles while leaving authoritative unit state and every semantic
predicate unchanged.

## Current state

At accepted concrete runtime base
`6c5e0faa861e1ba7a931c913e561fb837c2afb01`, occupancy blocking still iterates
the authoritative array and returns on the first blocking unit:

```ts
// src/simulation/passability.ts:125-143
function blockerCrossingCost(world: WorldState, tileX: number, tileY: number, movement: MovementKind, movingUnitId: string | undefined, blockers: Exclude<PassabilityBlockers, "none">): number {
  let crossesMovingOccupant = false;
  for (const unit of world.units) {
    if (
      !isRelevantSolidOccupant(unit, movingUnitId, movement)
      || !unitFootprintContainsTile(world, unit, tileX, tileY)
    ) {
      continue;
    }
    if (
      blockers === "all"
      || (blockers === "path-planning" && !isActivelyMovingOccupant(unit))
      || (blockers === "static" && isPermanentlyStationaryOccupant(unit))
    ) {
      return Number.POSITIVE_INFINITY;
    }
    crossesMovingOccupant = true;
  }
  return crossesMovingOccupant ? 5 : 1;
}
```

Stack recovery still uses authoritative-array `.find(...)` first-match semantics:

```ts
// src/simulation/orders.ts:10822-10837
const unitTile = worldToTile(world, unit.x, unit.y);
const blocker = world.units.find((candidate) => {
  if (
    candidate.id === unit.id
    || candidate.hitPoints <= 0
    || candidate.construction
    || candidate.kind === "fly"
    || candidate.nonSolid
    || isUnitHiddenInConstruction(candidate)
    || isUnitInsideResourceSource(candidate)
  ) {
    return false;
  }
  const candidateTile = worldToTile(world, candidate.x, candidate.y);
  return candidateTile.x === unitTile.x && candidateTile.y === unitTile.y;
});
```

The accepted production mutation inventory before fixture exports begins is:

| Occupancy mutation family | Accepted-base seams |
|---|---|
| Membership/order | `world.units` filters/pushes at `orders.ts:3876`, `4070`, `4968`, `4984`, `5232-5233`, `5436`, `9603`, `9720`, `13700`, `14052`, `14407`, `14605`, `14702`, `15009`, `16222`, `16264`, `16476`; temporary array replace/restore at `18655/18659` and `18687/18694` |
| Position/teleport/movement | unload `4060-4061`; builder release/snap `5061-5062`, `9384-9385`; anchor snap `5851-5852`; teleport `6291-6292`, `14588-14589`, `14633-14634`; path movement `10747-10748`, `10779-10780`; stack escape `10845-10846`; death-revealer placement `16470-16471` |
| Footprint-shape transform | unit conversion writes `tileWidth`/`tileHeight` at `15707-15708` |
| Predicate-only blocking state | `kind` at `15679`; `nonSolid` at `13695` and `15750`; hit points, construction, hidden-in-construction, order/path activity, speed, and resource containment mutate at runtime seams and are read live by existing predicates without changing bucket membership |
| Coordinator-owned global-world profiles/fixtures | `main.ts` mutates `world.units` at `738`, `785`, `791`, `913`, `1209`, `1247`, `1302`, `1364`, `1427`, `1478`, `1528`, `1578`, `1646`, `1698`, `1764`, `2063`, `2086`, `2119`, `3216`, and `3317`. The coordinator owns immediate occupancy invalidation after every mutation and proves the first later query rebuilds. |

Accepted Plan 020 keeps its first-write-wins transient ID index in
`worldSelectors.ts`; Plan 023 must not merge that index with occupancy buckets.
Projectile/effect coordinates are not unit occupancy. Cargo-unit coordinates
while absent from `world.units` are not indexed. This inventory is the frozen
Plan 023 entry seam.

Run before editing:

```bash
test "$(hostname)" = halla
git merge-base --is-ancestor 6c5e0faa861e1ba7a931c913e561fb837c2afb01 HEAD
git diff --stat 6c5e0faa861e1ba7a931c913e561fb837c2afb01..HEAD -- \
  src/main.ts src/simulation/passability.ts src/simulation/orders.ts \
  src/simulation/worldSelectors.ts src/simulation/occupancyIndex.ts \
  scripts/verify-terrain-metadata-cache.mjs scripts/verify-unit-index.mjs \
  scripts/verify-occupancy-index.mjs plans/evidence/019.md \
  plans/evidence/020.md plans/evidence/023.md \
  plans/023-add-deterministic-spatial-occupancy-index.md
rg -n "blockerCrossingCost|hasPathPlanningOccupancy|hasMobilePathPlanningOccupancy|resolveStackedMovableUnit|world\.units\.(find|filter|some)|for \(const .* of world\.units\)" \
  src/simulation/passability.ts src/simulation/orders.ts
rg -n "world\.units\s*=|world\.units\.(push|splice|pop|shift|unshift|sort|reverse|copyWithin|fill)|\.x\s*(\+|-|\*|/)?=|\.y\s*(\+|-|\*|/)?=|\.tileWidth\s*=|\.tileHeight\s*=|\.kind\s*=|\.nonSolid\s*=" \
  src/simulation/orders.ts
rg -n "clearBrowserSmokeFixtures|world\.units\s*=|world\.units\.push" src/main.ts
```

Expected: the accepted Wave 2 runtime base is an ancestor; later changes are
documentation-only closeout commits. Plan 019 terrain-only passability and Plan
020 transient ID lookup/invalidation remain intact; every production occupancy
query/mutation and accepted-base global-world `main.ts` profile/fixture mutation is classified.
Any later code drift in a cited seam requires another coordinator refresh before
Plan 023 implementation resumes.

## Commands you will need

| Purpose | Command | Expected result |
|---|---|---|
| Host/worktree | `test "$(hostname)" = halla && case "$(pwd -P)" in /home/halla/workspaces/*) ;; *) exit 1 ;; esac && test -f "$(git rev-parse --show-toplevel)/.git" && git status --short --branch` | Halla, linked isolated worktree path, assigned branch, understood status |
| Typecheck | `./node_modules/.bin/tsc --noEmit` | exit 0 |
| New occupancy-parity verifier (created in Step 1) | `node scripts/verify-occupancy-index.mjs` | order, first-match, query, mutation, coordinator-fixture invalidation/rebuild, timing, diagnostics, save/load, and fallback cases pass |
| Terrain parity | `node scripts/verify-terrain-metadata-cache.mjs` | accepted Plan 019 terrain/passability semantics remain exact |
| Unit-ID parity | `node scripts/verify-unit-index.mjs` | accepted Plan 020 first-match lookup/invalidation semantics remain exact |
| Pathfinding | `npm run verify:source-pathfinding` | path results and tie-breaking unchanged |
| Save schema | `npm run verify:save-schema` | exact save schema unchanged |
| Runtime determinism | `npm run verify:runtime-determinism` | fixed-tick state/order/hash/save output unchanged |
| Browser playable | `npm run verify:browser-playable-session` | movement, placement, transport, and combat pass |
| Browser demo | `npm run verify:browser-demo-session` | deterministic demo behavior passes |
| Browser fixture parity | `npm run verify:browser-runtime-smoke` | all accepted global-world performance-profile and smoke-fixture mutations invalidate; first-query rebuilds preserve ordered outcomes |
| Asset gate | `npm run verify:wargus-assets` | exit 0 |
| Build | `npm run build` | exit 0 |
| Performance | accepted Plan 018 `army-100`, `army-200`, `command-18` at both viewports, and `combat-100` rows | exactly seven valid trials per row; direct query and maintenance timing recorded; maintenance-inclusive cost does not regress; `incrementalReady` passes |

Before implementation, run only the pre-existing typecheck, accepted terrain
and unit-ID parity, pathfinding, save, determinism, asset, build, and direct
legacy timing gates. The new occupancy verifier does not exist at the Wave 3
base; a missing script/import is not red evidence. Create it in Step 1, record a
meaningful failing assertion against accepted full-scan behavior, then make that
same assertion green. Browser gates run after implementation; captures run
serially and never overlap another executor's capture.

## Scope

**Plan 023 owns:**

- `src/simulation/occupancyIndex.ts` (new), including ordered buckets,
  membership snapshots, invalidation/rebuild, queries, diagnostics, and parity
  oracle;
- `src/simulation/passability.ts`, occupancy-candidate consumption only,
  leaving accepted Plan 019 terrain metadata and all blocker predicates intact;
- `src/simulation/orders.ts`, only inventoried spatial query migrations and
  occupancy register/unregister/transition/invalidation calls, leaving accepted
  Plan 020 ID lookup and invalidation intact;
- `scripts/verify-occupancy-index.mjs` (new); and
- `plans/evidence/023.md`.

**Out of scope:**

- replacing, reordering, or serializing `world.units`; changing identity,
  movement, collision, blocking, placement, stacking, A* ordering, target
  selection, or save behavior;
- Plan 019 terrain cache/flags and Plan 020 unit-ID index/lookup semantics;
- renderer, Pixi, UI, visibility/fog, path request cadence/budgeting, or Plan
  024 scheduling;
- adding occupancy fields to `WorldState`, save data, canonical hashes,
  replays, commands, or renderer APIs;
- independently editing `src/main.ts`, a shared performance schema,
  `package.json`, `plans/README.md`, or an existing shared verifier; and
- weakening a budget, validity rule, fingerprint, trial count, determinism,
  first-match assertion, or evidence requirement.

The Wave coordinator owns shared `main`, performance-schema, package-script,
and roadmap integration. In particular, it owns `invalidateWorldOccupancyIndex(world)` calls immediately
after every accepted-base global-world `main.ts` mutation at `738`, `785`,
`791`, `913`, `1209`, `1247`, `1302`, `1364`, `1427`, `1478`, `1528`, `1578`,
`1646`, `1698`, `1764`, `2063`, `2086`, `2119`, `3216`, and `3317`.
The Plan 023 branch must not edit `src/main.ts`; it supplies the invalidation API
and focused rebuild/parity contract. Plan 023 emits plan-local namespaced
diagnostics from its owned module; shared capture export is coordinator work.

## Git workflow

- Branch from the accepted Wave 3 start into an isolated `plan-023` worktree.
- Commit read-only construction/query parity before mutation maintenance, then
  commit query migrations only after full mutation coverage is green.
- Do not merge Plan 022, edit renderer/cache files, absorb Plan 024 scheduling,
  resolve shared package/index conflicts, push, deploy, or open a PR unless
  instructed.

## Shared interfaces and ownership

- The accepted Plan 018 handoff supplies the normalized matrix,
  profile-definition hash, initial entity/effect fingerprint, environment
  identity, raw baseline directory, checksums, and worst-trial row results.
  These artifacts and all shared budgets are read-only.
- The accepted Plan 019 handoff supplies terrain metadata and terrain-only
  passability behavior. Plan 023 may replace only unit candidate enumeration;
  it may not alter terrain classification or fallback semantics.
- The accepted Plan 020 handoff supplies first-match stable-ID lookup,
  `world.units` mutation inventory, and unit-index invalidation. Plan 023 adds
  occupancy lifecycle calls at accepted `orders.ts` mutation owners without
  changing Plan 020's API, invalidation timing, or duplicate-ID behavior.
- Coordinator-owned `src/main.ts` keeps global-world performance profiles and
  browser fixtures. The coordinator owns occupancy invalidation immediately
  after every accepted-base array replacement/push and runs their parity gates; the Plan 023 branch only exports
  and tests the invalidation/rebuild contract.
- `HALLA-EXECUTION-POLICY.md` governs host/browser execution, exact-owned
  process cleanup, serial captures, and durable artifacts.
- `PERFORMANCE-ACCEPTANCE.md` governs trial qualification, fingerprints,
  determinism, statistics, invalid/replacement rules, and budgets.
- Plan 023 exclusively owns simulation occupancy/passability/order mutation
  surfaces. Plan 022 exclusively owns renderer files and caches. Neither plan
  imports the other's APIs or evidence.
- Existing terrain, ID-index, pathfinding, save, determinism, and browser
  verifiers are read-only gates. Shared integration belongs to the coordinator.

## Deterministic index contract

`world.units` remains the sole authoritative ordered collection. The index is a
transient `WeakMap<WorldState, OccupancyCache>` and stores candidate membership
only; every caller applies existing live predicates in existing order. The
index is never serialized, hashed, cloned into a save, or exposed to rendering.

Each covered map tile owns an ordered array of unit object references. A unit
is indexed over the exact tile rectangle derived from current `x`, `y`,
`tileWidth`, and `tileHeight`, including non-solid, dead, hidden, constructing,
and resource-contained units. Keeping predicate-only states in the bucket means
changes to hit points, construction, hidden/resource state, `kind`, `nonSolid`,
speed, or order/path activity require no structural update and are observed
live by legacy predicates.

Bucket order and merged footprint-query order must equal current object order
in `world.units`; never rely on incidental `Map`/`Set` insertion order or
mutation timing. Assign/rebuild authoritative order ranks from `world.units`,
insert transitioned units by rank, merge multi-tile results in rank order, and
deduplicate by object identity. Duplicate unit IDs do not collapse records.
Every query returns the exact reference sequence that filtering the
authoritative array would have produced.

Lifecycle ownership is exact:

| Operation | Owner and timing |
|---|---|
| Build/rebuild | `ensureWorldOccupancyIndex(world)` before a query; rebuild on first use, world identity, explicit invalidation, array reference/order mismatch, or membership validation failure |
| Register | owning `world.units.push`/append seam calls `registerWorldOccupant` immediately after the authoritative append |
| Unregister | owning filter/removal seam calls `unregisterWorldOccupant` for each removed object before replacing the authoritative array |
| Transition | owning mutation snapshots old covered tiles, performs the complete atomic position/footprint change, then calls `transitionWorldOccupant` before any later occupancy query |
| Batch/temporary replacement | owning seam calls `invalidateWorldOccupancyIndex`; first query rebuilds from that temporary array, and restoration invalidates again |
| Coordinator-owned global-world profiles/fixtures | after each accepted-base `main.ts` mutation at `738`, `785`, `791`, `913`, `1209`, `1247`, `1302`, `1364`, `1427`, `1478`, `1528`, `1578`, `1646`, `1698`, `1764`, `2063`, `2086`, `2119`, `3216`, and `3317`, the coordinator calls `invalidateWorldOccupancyIndex(world)`; the Plan 023 branch never edits `main.ts`, and the first later query rebuilds |
| Load/world replacement | no cache transfer; new `WorldState` builds independently on first query |
| Unknown or failed validation | mark invalid and use authoritative full scan for that query; rebuild before the next indexed query |

The fallback is correctness, not acceptance: every unexpected invalidation or
fallback increments diagnostics, development parity must explain it, and an
unowned production mutation is a STOP.

Add resettable plan-local diagnostics with these exact namespaces:

- `plan023.occupancy.queries`
- `plan023.occupancy.candidatesVisited`
- `plan023.occupancy.queryDurationMs`
- `plan023.occupancy.registers`
- `plan023.occupancy.registerDurationMs`
- `plan023.occupancy.unregisters`
- `plan023.occupancy.unregisterDurationMs`
- `plan023.occupancy.transitions`
- `plan023.occupancy.transitionDurationMs`
- `plan023.occupancy.invalidations`
- `plan023.occupancy.invalidationDurationMs`
- `plan023.occupancy.rebuilds`
- `plan023.occupancy.rebuildDurationMs`
- `plan023.occupancy.maintenanceTotalMs`
- `plan023.occupancy.fullScanFallbacks`
- `plan023.occupancy.parityFailures`

Each duration namespace retains bounded samples for nearest-rank summaries;
`maintenanceTotalMs` is the resettable, non-overlapping wall-time sum of
register, unregister, transition, invalidation, and rebuild work during the
capture. Nested helper work is attributed once to its outer operation; it is not
re-summed from diagnostic sub-operation samples. Timers and
diagnostics remain outside `WorldState`, saves, gameplay decisions, and Plan
018's shared summary schema. Focused verification/evidence may read them; any
shared capture wiring is coordinator-owned and namespaced.

## Steps

### Step 0: Prove the entry gate and freeze the baseline

Confirm Plans 019, 020, and 021 all passed their Wave 2 exit gates and their
acceptance commits are integrated. Confirm the technical dependencies—accepted
Plans 018, 019, and 020—and their durable assigned artifacts/checksums resolve
on Halla. Record the accepted environment, profile-definition hash, initial
entity/effect fingerprint, per-trial/worst-trial results, Plan 019 terrain
parity, Plan 020 first-match/index behavior, and exact integrated `orders.ts`
and global-world `main.ts` profile/fixture mutation inventories.

Before migrating query consumers, capture direct legacy full-scan occupancy-
query duration with the exact timer boundaries that the indexed path will use.
Record query count, p50/p95/p99/mean/max/total, processed simulation steps,
candidate visits, and zero index-maintenance cost for every assigned profile.
Run refreshed drift checks and all pre-existing non-browser baseline commands.
Record `scripts/verify-occupancy-index.mjs` as absent and not run; if it already
exists without an accepted plan refresh, STOP.

**Verify:** the all-Wave-2 barrier, technical dependencies, ancestry,
inventories, checksums/fingerprints, timing baseline, host policy, upstream
parity, save schema, determinism, and baseline gates are green.

### Step 1: Build a read-only ordered occupancy index

Create a loadable full-scan occupancy API shell and
`scripts/verify-occupancy-index.mjs` first. A local-candidate-scaling, stable
reuse, maintenance-diagnostic, or rebuild fixture must execute and fail against
the full-scan shell for the intended behavior-level reason; `MODULE_NOT_FOUND`,
an import error, or a missing file is not acceptable RED evidence. Preserve
that output, then implement until the same fixture and full verifier are green.

Implement construction from authoritative `world.units`, exact covered-tile
calculation, deterministic tile/footprint candidate queries, object-identity
deduplication, identity/revision validation, and forced rebuild. Return ordered
candidate references only; do not embed blocking, visibility, placement,
movement-layer, or gameplay decisions in the index.

Create a reference oracle that runs the legacy full-array filter with the exact
caller predicate and compares object reference, ID, order, first match, final
boolean/cost, and chosen downstream result. Full parity mode runs every query;
development sampling uses a deterministic query-count schedule, never runtime
randomness.

**Verify:** empty/edge/multi-tile/overlap/duplicate-ID/mixed-state fixtures and
repeated rebuilds produce exact authoritative sequences. Index construction
does not mutate the array or enter save/canonical state.

### Step 2: Freeze and route the complete mutation lifecycle

Regenerate the full production inventory after Plans 019/020 integrate.
Classify every statement as membership/order, position/footprint, or
predicate-only. Route membership through register/unregister, position and
footprint writes through one post-atomic-change transition, and temporary or
batch replacements through invalidation/rebuild. Preserve statement order,
events, Plan 020 invalidation, and intermediate query behavior.

Explicitly cover spawn/training/summon/revealer/raise-dead, removal/death/cancel/
capture, building/oil-platform replacement, transport load/unload, normal
movement/waypoint snap, stack escape, teleport/portal, builder hide/release,
unit conversion, temporary build probes, world replacement, and save load.
Predicate-only mutations remain live-read fixtures and must not reindex.

The coordinator adds `invalidateWorldOccupancyIndex(world)` immediately after
every accepted-base global-world `main.ts` mutation: profile clear/population at
`738`, `785`, `791`; fixture clearing at `913`; and fixture pushes at `1209`,
`1247`, `1302`, `1364`, `1427`, `1478`, `1528`, `1578`, `1646`, `1698`, `1764`,
`2063`, `2086`, `2119`, `3216`, and `3317`. The Plan 023 branch must
not edit `main.ts`. The first later occupancy query rebuilds from the exact
global-world array; browser/profile parity proves ordered candidates, first match,
and final results are unchanged for every accepted performance profile and smoke fixture.

**Verify:** a deterministic scenario hits every owned inventory row; former
tiles clear, new tiles contain the unit in authoritative order, and no duplicate
object membership exists. Each coordinator mutation invalidates once; the first later query after each
synchronous mutation sequence rebuilds once, and parity passes. Any uncovered production
or accepted-base global-world profile/fixture mutation is a STOP.

### Step 3: Migrate occupancy read paths with exact semantic parity

Migrate `blockerCrossingCost` first, replacing only full-array candidate
enumeration. Preserve `isRelevantSolidOccupant`, footprint containment,
blocker modes, moving-unit exclusion, active/stationary classification, early
return, and cost values. Then migrate same-tile stack recovery and only the
placement/collision/overlap/spatial searches named by the accepted inventory.

For legacy `.find`, use the first passing indexed candidate. For
`for`/`.filter`/`.some`, preserve authoritative order, early exit, stable ties,
and downstream sort behavior. Do not migrate global target selection or a
query whose local bound cannot include every legacy candidate. Pathfinding may
consume indexed footprint candidates but A* neighbor/tie order stays unchanged.

**Verify:** the oracle compares ordered references and final outcomes at every
migrated boundary. Reversed mutation timing and duplicate-ID fixtures still
select the same object as authoritative iteration.

### Step 4: Prove rebuild, save/load, and determinism behavior

Invalidate and safely fall back when identity, membership, order rank, or
covered-tile validation fails. Development/test full parity makes stale or
duplicate membership fatal. Production may use authoritative full scan for the
current query, then rebuild once; it never returns a partially trusted bucket.

Review save serialization/deserialization only after accepted Plans 019/020
integrate. Add no save serialization. Prove a loaded world builds an independent
cache, the old cache is unreachable, and no cache/diagnostic/revision enters
saves, replay hashes, commands, or canonical state.

**Verify:** save text/schema and fixed-tick state/order/hash are exact; forced
corruption chooses full-scan result, increments fallback once, rebuilds, and
resumes parity.

### Step 5: Revalidate behavior and measure

Run every command in the table. Capture exactly seven independent valid trials per
assigned row using the exact accepted Plan 018 environment, profile, viewport,
warmup, duration, fingerprints, and per-trial statistics. Preserve every trial
raw-frame sample. Record candidate counts and direct occupancy-query duration
from identical legacy/indexed timer boundaries. Record register, unregister,
transition, invalidation, rebuild, fallback, maintenance total, and processed
simulation-step counts with no overlapping timers. Report both direct-query and
each maintenance-operation distribution with nearest-rank
p50/p95/p99/mean/max/total. Normalize combined work as
`(query total ms + maintenance total ms) / processed simulation steps`, using
the same processed-step field for before and after. Require `incrementalReady`:
no new shared budget-failure key may appear, and both the median-of-seven trial
frame-p95 and pooled raw-frame-p95 regression components must be no greater than
5% at 0.1 ms decision precision.

For `army-200`, worst-trial indexed query p95 must be lower than the legacy
full-scan p95, candidate visits must fall, and worst-trial maintenance-inclusive
per-step cost must not exceed the legacy query-only per-step cost. A candidate
reduction with flat/worse direct timing or shifted maintenance cost fails.

**Verify:** upstream and fixture parity, pathfinding, save, browser, and
determinism gates pass; direct timing improves, combined cost does not regress,
no unexplained fallback/parity failure occurs, the `incrementalReady` verdict passes, and evidence
is durable and checksum-verified.

## Test plan

- A recorded meaningful RED followed by GREEN for the new verifier; load/import
  failure does not qualify.
- Exact ordered tile/footprint candidates across edges, overlaps, duplicate IDs.
- First-match, early exits, filter order, stable ties, blocker cost, exclusion,
  and stack-recovery selection.
- Every accepted-base membership/order and position/footprint mutation,
  including temporary replacement/restoration.
- Coordinator-owned global-world profile/fixture mutations at `main.ts:738`,
  `785`, `791`, `913`, `1209`, `1247`, `1302`, `1364`, `1427`, `1478`, `1528`,
  `1578`, `1646`, `1698`, `1764`, `2063`, `2086`, `2119`, `3216`, and `3317`:
  immediate invalidation, one first-query rebuild, exact
  candidate/order/first-match parity, and no Plan 023 branch edit to `main.ts`.
- Live predicate-only hit point, construction, hidden/resource, `kind`,
  `nonSolid`, speed, and path changes without stale decisions/reindexing.
- Multi-tile move/teleport/convert clears former tiles and registers new once.
- Plan 020 invalidation remains independent; duplicate IDs stay distinct.
- Invalid revision/order/membership full-scans, records fallback, rebuilds once.
- Save/load/world isolation and exact save/hash exclusion.
- Deterministic full/sampled oracle; zero unexplained `parityFailures`.
- Legacy and indexed query-duration distributions, every maintenance/update
  duration, summed maintenance cost, and maintenance-inclusive per-step cost.
- Namespaced diagnostic reset/count behavior and local-candidate scaling.

## Performance acceptance

This plan uses the `incremental` acceptance mode. The accepted Plan 018 rows
and any plan-local direct-work baseline are the before evidence; capture exactly seven
independent valid after trials per assigned row under the shared lifecycle,
nearest-rank statistics, raw-frame retention, median-of-seven trial p95, and
pooled raw-frame p95 rules. Never discard a valid budget,
parity, timing, visual, or lifecycle failure.

```text
incrementalReady =
  captureComplete
  && validityAndComparabilityPass
  && fixedTickPass
  && noNewBudgetFailuresPass
  && frameP95RegressionPass
  && targetedWorkReductionProofPass
  && cleanupAndIntegrityPass
```

`noNewBudgetFailuresPass` uses the accepted Plan 018 row union in
`PERFORMANCE-ACCEPTANCE.md`; an accepted baseline failure may remain, but a new
budget-failure key blocks this plan. `frameP95RegressionPass` rejects a frame
p95 regression greater than 5%. `targetedWorkReductionProofPass` requires this
plan's named direct timing, maintenance/work-shift, and plan-local diagnostic
evidence; work counts alone do not suffice.

STOP performance acceptance on invalid-trial exhaustion, environment or
fingerprint drift, a new budget-failure key, a frame p95 regression greater
than 5%, missing targeted work-reduction proof, or incomplete durable evidence.
The existing functional, parity, save, visual, cadence, lifecycle, and
plan-specific targeted-proof gates remain independent requirements. The plan
may close when `incrementalReady` and those independent requirements pass.

## Evidence contract

Store raw artifacts outside Git at:

```text
.artifacts/performance/023/<commit>/<UTC-stamp>/
```

Include accepted Plan 018/019/020 artifact/checksum references, environment,
profile-definition and initial entity/effect fingerprints, one JSON per trial,
normalized summaries, exact `orders.ts` and coordinator-owned `main.ts` mutation
inventories, fixture invalidation/rebuild parity, ordered/first-match parity,
save/load and determinism, the focused verifier's meaningful RED/GREEN output,
candidate counts, direct query-time distributions, per-operation maintenance-time distributions and total maintenance time,
maintenance-inclusive cost per processed simulation step, controller/resource
records, invalid/replacement records, and SHA-256 checksums. Independently
recompute new checksums and verify every baseline reference.

Commit only concise normalized results to the single evidence file
`plans/evidence/023.md`; do not create `plans/evidence/023/`, and do not rely
on `/tmp` as durable evidence.

## Done criteria

- [ ] The strict Wave 3 barrier is open: Plans 019, 020, and 021 passed their
  exit gates and are integrated; technical Plans 018/019/020 handoffs verify.
- [ ] The new verifier has a recorded behavior-level RED and GREEN; no missing
  file/import result is counted as RED.
- [ ] `world.units` remains authoritative and candidates match exact reference
  order and first-match behavior.
- [ ] Complete mutation inventory has a register, unregister, transition,
  invalidation/rebuild, or live-predicate owner.
- [ ] Coordinator integration invalidates after every accepted-base global-world
  `main.ts` profile/fixture mutation, and the first later query rebuilds with exact parity.
- [ ] Passability, stack recovery, and migrated queries preserve predicates,
  early exits, costs, iteration order, ties, and outcomes.
- [ ] Save/load review proves no serialization and independent loaded cache.
- [ ] Full/sampled parity, fallback, mutation, terrain, unit-ID, pathfinding,
  save, fixture, browser, determinism, asset, and build gates pass.
- [ ] Direct occupancy-query p95 improves and maintenance-inclusive total cost
  does not exceed the legacy full-scan baseline; candidate work also falls.
- [ ] Diagnostics show bounded local work with zero unexplained fallback/parity.
- [ ] the `incrementalReady` verdict is satisfied with durable,
  checksum-verified evidence in `plans/evidence/023.md`.
- [ ] The branch contains only Plan 023-owned files; coordinator
  `main`/performance-schema/package/README integration is separate.

## STOP conditions

- Any Wave 2 plan has not passed its exit gate and integrated, or Plans
  018/019/020 baselines, checksums, fingerprints, terrain parity, ID-index
  semantics, and mutation handoff fail.
- Drift, passability/stack excerpts, the `orders.ts` inventory, or the accepted-base
  global-world `main.ts` profile/fixture seams differ without coordinator refresh.
- A membership/order/position/footprint mutation has no exact owner or permits
  same-tick stale membership.
- A coordinator-owned fixture filter/push lacks immediate occupancy
  invalidation, its first later query does not rebuild, or fixture parity fails.
- Bucket results differ from authoritative object order, duplicate IDs collapse,
  or first-match/early-exit behavior changes.
- Correctness requires terrain/ID-index/array/path/placement/gameplay,
  `WorldState`, save, or renderer changes.
- Index enters save/hash/replay/command state, deterministic sampling needs
  randomness, or a loaded world reuses another cache.
- Production uses a partially trusted bucket, has unexplained fallback,
  rebuilds per stable query, or reports parity failure.
- Direct occupancy-query timing is missing, maintenance/update timing is
  incomplete, query p95 does not improve, or maintenance-inclusive cost shifts
  rather than reduces the measured work.
- An owned edit reaches renderer/cache, `main`, performance schema,
  `package.json`, `plans/README.md`, or shared verifier before integration.
- The new verifier cannot produce a meaningful behavior-level RED before GREEN.
- Any occupancy, upstream, type, pathfinding, save, fixture, browser,
  determinism, asset, or build gate fails twice.
- Halla/browser qualification fails, capture overlaps, replacement exhausts,
  a new budget-failure key appears, including command latency, or frame p95 regresses over 5%.
- Durable single-file evidence or checksums cannot be verified.

## Rollback

Rollback query consumers in reverse migration order to authoritative full scans
with exact predicates, iteration, exits, and sorting. Roll back occupancy calls
only with the slice that no longer consumes them; never remove Plan 020
invalidation or Plan 019 terrain metadata. If mutation coverage is incomplete,
disable all indexed reads, use full scans, and revert unaccepted Plan 023
commits. Never leave a partial index active or silently accept recurring
fallback. Preserve failed/invalid evidence and upstream work. Stop only exact
owned processes; remove only exclusive artifacts.

## Maintenance notes

Every new `world.units` membership/order mutation or unit position/footprint
write requires an inventory row, exact lifecycle call, transition fixture, and
parity proof. Every new global-world profile/fixture mutation in coordinator-owned
`src/main.ts` requires an immediate coordinator-owned invalidation plus fixture
parity before the next occupancy query. Predicate-only state stays live-read
unless amended. Keep authoritative order, first-match behavior, save exclusion,
deterministic validation, timing visibility, and full-scan rollback executable.
