# Plan 025: Make Visibility And Fog Dirty-Driven

> **Executor instructions:** Execute this Wave 4 plan in an isolated Halla
> worktree only after Plans 022 and 023 pass every Wave 3 exit gate and both
> acceptance commits integrate. Follow
> [the Halla execution policy](HALLA-EXECUTION-POLICY.md) and
> [the performance acceptance contract](PERFORMANCE-ACCEPTANCE.md) unchanged.
> Preserve published visibility/exploration grids, local fixed-tick visibility,
> the existing AI exploration cadence, fog pixels, and view independence. All
> contribution and fog caches are transient and not serialized. Add no save
> fields. Stop on every STOP condition.
>
> **Drift check:** Run every command and inventory in `Current state` first.
> STOP on an unexplained accepted-base, excerpt, ownership, or dependency drift.

## Status

- **Status:** TODO
- **Wave:** 4 — High-risk scheduling
- **Priority:** P1
- **Effort:** L
- **Risk:** HIGH — gameplay-visible line of sight and retained fog lifecycle
- **Depends on:** accepted and integrated Plans 018, 019, 022, and 023
- **Wave entry gate:** accepted and integrated Plans 022 and 023
- **Category:** performance, simulation, rendering
- **Original planning base:** `8ac0006`, 2026-07-27
- **Roadmap rewrite base:** `0993cdd55818aa015c42e3e71e18d4b57ab016ea`
  (`git rev-parse HEAD` printed the same SHA)

Plans 022 and 023 must both finish and integrate before any Wave 4 executor
starts. After Wave 3 integration, the coordinator must compare the integrated
tree with the concrete rewrite base. If any cited visibility, terrain,
occupancy, renderer, retained-object, verifier, or performance seam changed,
the coordinator must amend this plan with the new accepted concrete SHA,
refreshed excerpts, source inventory, and cache/disposal handoffs before Plan
025 begins. Never use a symbolic commit token. If the refresh is absent when a
cited seam differs, STOP.

Plan 025 and Plan 024 may execute concurrently only while their implementation
ownership remains disjoint. Plan 025 owns visibility/fog caches and adds no
save fields; Plan 024 owns path requests, orders, A*, and save-schema surfaces.
If an implementation needs a file or authoritative state owned by both plans,
serialize Wave 4 instead of resolving the overlap inside either branch.

## Why this matters

`updateVisibility` clears and rebuilds the local visible grid every fixed tick,
then periodically walks all sources again for AI exploration. Fog rendering
hashes the padded visible viewport and destroys/recreates the entire fog
subtree whenever that hash changes. Most ticks move only a subset of sight
sources and dirty a small region, so the current work and display-object churn
scale far beyond the changed state.

This plan keeps the same published grids and rules while maintaining derived
per-source contributions. It exposes deterministic tile revisions to a
separate renderer-owned, bounded fog chunk cache. Simulation correctness never
depends on a renderer, and renderer correctness never mutates simulation.

## Current state

At the concrete rewrite base, the authoritative published state is held on the
world:

```ts
// src/simulation/world.ts:788-793
visibilityPlayer: number;
exploredTilesByPlayer: Uint8Array[];
exploredTiles: Uint8Array;
visibleTiles: Uint8Array;
lastSeenBuildings: WorldLastSeenBuilding[];
visibilityReveals: WorldVisibilityReveal[];
```

The current local and AI update cadence is explicit:

```ts
// src/simulation/orders.ts:5497-5507
while (world.accumulator >= tickSeconds) {
  // ...
  stepWorld(world, tickSeconds, suppressMatchResolution);
  updateVisibility(world);
  world.tick += 1;
}

// src/simulation/world.ts:1760-1769
world.visibleTiles.fill(0);
markExploredTilesForPlayer(world, world.visibilityPlayer, world.exploredTiles, world.visibleTiles);
for (const state of world.aiStates) {
  if (!state.enabled || world.tick < state.nextExplorationUpdateTick) continue;
  markExploredTilesForPlayer(world, state.player, buffer);
  state.nextExplorationUpdateTick = world.tick + world.tickRate;
}
```

Unit sources are visited in authoritative `world.units` order, then
`world.spellEffects` holy-vision sources and `world.visibilityReveals` are
visited in their authoritative array order. Local `visibleTiles` is consumed by
targeting and selection before rendering. AI exploration is monotonic and is
refreshed only when `nextExplorationUpdateTick` is due.

The current fog renderer hashes a padded viewport and rebuilds the whole layer:

```ts
// src/view/renderWorld.ts:2022-2028, 2095-2110
const key = fogRenderKey(world, fogAtlas, bounds, fogAlphas, fastFog);
if (fogRenderKeys.get(layer) === key) return;
fogRenderKeys.set(layer, key);
destroyLayerChildren(layer);
applySourceFogBlur(layer, world, fastFog);

function fogVisibilityHash(world: WorldState, bounds: MapTileRenderBounds): number {
  // scans visible/explored state for the padded viewport
}
```

The fog edge lookup reads immediate neighbors and the current black-fog visible
suppression radius. Invalidation must expand changed tiles by
`sourceBlackFogVisibleSuppressionRadius + 1`; guessing a smaller border is
prohibited.

Run before editing:

```bash
test "$(hostname)" = halla
git merge-base --is-ancestor 0993cdd55818aa015c42e3e71e18d4b57ab016ea HEAD
git diff --stat 0993cdd55818aa015c42e3e71e18d4b57ab016ea..HEAD -- \
  src/simulation/world.ts src/simulation/visibilityCache.ts \
  src/simulation/terrainMetadata.ts src/simulation/occupancyIndex.ts \
  src/view/renderWorld.ts src/view/fogChunkCache.ts \
  src/view/worldRenderCache.ts src/performance/displayObjectPerformance.ts \
  src/main.ts src/wargus/saveGame.ts \
  scripts/verify-visibility-fog-incremental.mjs \
  scripts/verify-world-render-cache.mjs scripts/verify-occupancy-index.mjs \
  scripts/verify-source-fov-fog.mjs plans/evidence/018.md \
  plans/evidence/019.md plans/evidence/022.md plans/evidence/023.md \
  plans/evidence/025.md plans/022-retain-world-display-objects.md \
  plans/023-add-deterministic-spatial-occupancy-index.md \
  plans/025-make-visibility-and-fog-dirty-driven.md
rg -n "updateVisibility|markExploredTilesForPlayer|sourceFieldOfViewFootprintForUnit|isSourceFieldOfViewTileVisible|visibilityReveals|nextExplorationUpdateTick|updateLastSeenBuildings" \
  src/simulation/world.ts src/simulation/orders.ts src/wargus/saveGame.ts
rg -n "drawFog|fogRenderKey|fogVisibilityHash|sourceFogTextureFramesForTile|sourceBlackFogVisibleSuppressionRadius|destroyLayerChildren|createTracked|destroyTracked|sourceViewportPaneRenderers" \
  src/view/renderWorld.ts src/view/worldRenderCache.ts \
  src/performance/displayObjectPerformance.ts src/main.ts
```

Expected: the rewrite base is an ancestor; both Wave 3 acceptance commits are
integrated; later changes are accepted Wave 3 work or explained coordinator
integration; Plan 019 terrain opacity, Plan 022 per-view retained lifecycle,
and Plan 023 authoritative unit order/mutation behavior remain intact; every
visibility source/global rule and every fog owner/disposal seam is inventoried;
and `saveGame.ts` has no Plan 025 field. If any seam differs without the
required coordinator refresh, STOP.

## Commands you will need

| Purpose | Command | Expected result |
|---|---|---|
| Host/worktree | `test "$(hostname)" = halla && git status --short --branch` | Halla, assigned isolated branch, understood status |
| Typecheck | `./node_modules/.bin/tsc --noEmit` | exit 0 |
| New visibility/fog verifier (created in Step 1) | `node scripts/verify-visibility-fog-incremental.mjs` | source contributions, revisions, bounds, full parity, memory, chunks, disposal, rollback, and timing cases pass |
| Terrain parity | `node scripts/verify-terrain-metadata-cache.mjs` | accepted Plan 019 raw opacity and terrain semantics remain exact |
| Render cache | `node scripts/verify-world-render-cache.mjs` | accepted Plan 022 retained-object ownership and counters remain exact |
| Occupancy parity | `node scripts/verify-occupancy-index.mjs` | accepted Plan 023 order/mutation behavior remains exact |
| Source FOV/fog | `npm run verify:source-fov-fog` | line of sight, explored/visible grids, fog edges, and source behavior remain exact |
| Save schema | `npm run verify:save-schema` | schema and existing visibility/exploration fields are unchanged; no cache/revision/chunk field exists |
| Determinism | `npm run verify:runtime-determinism` | fixed-tick grids, targeting, AI exploration, state hash, and save output repeat exactly |
| Browser map loads | `npm run verify:browser-map-loads` | load/world replacement rebuild and disposal pass |
| Browser playable | `npm run verify:browser-playable-session` | current targeting, exploration, and fog pass |
| Native viewport | `npm run verify:browser-native-viewport` | active/split-view fog ownership, pan, resize, closure, and pixels pass |
| Asset gate | `npm run verify:wargus-assets` | exit 0 |
| Build | `npm run build` | exit 0 |
| Performance | accepted Plan 018 `army-100`, `army-200`, and `combat-100` rows at 1280×720 | three valid trials per row; direct visibility/fog evidence recorded; `incrementalReady` passes |

Before implementation, run only the pre-existing typecheck, upstream parity,
source-FOV/fog, save, determinism, asset, build, and direct-timing gates. The
explicitly new incremental verifier does not exist at the Wave 4 base; a
missing script is not a red baseline. Create it in Step 1, record a meaningful
failing assertion against the accepted full-grid behavior, then make that same
assertion green. Performance captures run serially under the shared contracts
and never overlap Plan 024 or another executor's capture.

## Scope

**Plan 025 owns:**

- `src/simulation/visibilityCache.ts` (new), including transient source
  contributions, signatures, revisions, dirty bounds, parity, bounds,
  invalidation, rebuild, diagnostics, and reference fallback;
- `src/simulation/world.ts`, only visibility/FOV maintenance and the existing
  `updateVisibility`/`markExploredTilesForPlayer` implementation slice;
- `src/view/fogChunkCache.ts` (new), including per-view chunk ownership,
  invalidation, bounds, eviction, disposal, diagnostics, and pure reconcile
  decisions;
- `src/view/renderWorld.ts`, only fog hashing/rebuild replacement and fog chunk
  rendering/consumption;
- `scripts/verify-visibility-fog-incremental.mjs` (new); and
- `plans/evidence/025.md`.

**Out of scope:**

- changing sight radius, footprint/FOV geometry, opacity classification,
  alliances/shared vision, revelation, exploration monotonicity, fog alpha,
  edge masks, blur, source ordering, targeting rules, AI scheduling, balance,
  simulation tick rate, or minimap rendering;
- adding, removing, renaming, or reinterpreting any save field; contribution
  counts, source records, dirty tiles/bounds, revisions, tile revisions, fog
  chunks, LRU state, and diagnostics are not serialized;
- path requests, A*, orders/retries, `src/simulation/pathRequests.ts`,
  `src/simulation/pathfinding.ts`, `src/simulation/orders.ts`,
  `src/wargus/saveGame.ts`, or `scripts/verify-save-schema.mjs`; Plan 024 owns
  those implementation surfaces and this plan reads the save gate only;
- Plan 022's unit/last-seen/corpse/projectile/spell-effect cache or its object
  pools; fog roots/chunks are separate Plan 025-owned records;
- independently editing `src/main.ts`, Plan 018's shared performance schema,
  `package.json`, `plans/README.md`, an existing shared verifier, or another
  plan's evidence; and
- weakening a budget, trial count, renderer/fingerprint qualification,
  determinism comparison, visual oracle, memory bound, or evidence rule.

The Wave coordinator owns shared `src/main.ts`, Plan 018 performance-schema,
`package.json`, and `plans/README.md` integration. Plan 025 defines namespaced
diagnostics, renderer disposal hooks, and package-script names; the coordinator
wires shared lifecycle/capture/package/index changes after both isolated Wave 4
branches are accepted.

## Git workflow

- Branch from the accepted, coordinator-refreshed Wave 4 start into an
  isolated `plan-025` worktree.
- Commit the transient simulation cache and full-grid parity before enabling
  incremental reads. Commit renderer fog chunks separately so simulation and
  renderer rollback remain independent.
- Do not merge Plan 024, edit path/order/save files, absorb Plan 022 object
  kinds, resolve shared main/performance/package/index conflicts, push, deploy,
  or open a PR unless instructed.

## Shared interfaces and ownership

- Accepted Plan 018 supplies the normalized matrix, profile-definition hash,
  initial entity/effect fingerprint, environment, raw baseline directory,
  checksums, worst-trial results, and existing tracked display-object totals.
  Shared budgets, scope, validity, and aggregation remain unchanged.
- Accepted Plan 019 supplies raw terrain opacity metadata. This plan consumes
  it through the accepted FOV path and does not redefine opacity or tile-126
  behavior.
- Accepted Plan 022 supplies independent per-view renderer ownership,
  tracked-constructor/destructor use, and world/view disposal conventions.
  Plan 025 follows that lifecycle model for fog but does not enter
  `worldRenderCache` or its five retained entity kinds.
- Accepted Plan 023 supplies authoritative `world.units` order and complete
  mutation coverage. Source discovery reads that ordered array and current
  object state; it does not import the occupancy cache or add mutation calls.
- Plan 024 owns path request/A*/order/save state. Plan 025 never reads pending
  paths to decide visibility and adds no save fields.
- Existing terrain, render-cache, occupancy, source-FOV, save, browser,
  determinism, asset, and build verifiers are read-only gates. Shared
  integration belongs to the coordinator.

The Plan 025 branch emits two plan-local diagnostic namespaces. The
coordinator-owned Plan 018 extension may expose them without changing existing
summary fields:

- `plan025.visibility`: `updates`, `updateDurationMs`, `sourcesVisited`,
  `sourcesChanged`, `contributionTilesAdded`, `contributionTilesRemoved`,
  `dirtyTiles`, `dirtyBoundsArea`, `fullRebuilds`, `fullRebuildDurationMs`,
  `parityChecks`, `parityFailures`, `entryHighWater`, `overflowFallbacks`,
  `underflowDetections`, `underflowRebuilds`, and `persistentCorruptions`;
- `plan025.fog`: `decisionDurationMs`, `chunkBuildDurationMs`,
  `chunksCreated`, `chunksReused`, `chunksRebuilt`, `chunksDetached`,
  `chunksEvicted`, `chunksDestroyed`, `activeHighWater`, `dormantHighWater`,
  `fullViewportHashScans`, and `disposals`.

Duration samples are bounded and use nearest-rank summaries. Diagnostics and
timers remain outside `WorldState`, saves, hashes, visibility decisions, and
render output. Shared capture wiring is coordinator-owned and namespaced; the
focused verifier/evidence collector may read plan-local snapshots.

## State ownership contract

The layers are distinct and one-way:

| Layer | Owner | State | Persistence |
|---|---|---|---|
| Published gameplay result | `WorldState` | `visibleTiles`, `exploredTilesByPlayer`, `exploredTiles`, `lastSeenBuildings` | existing save behavior unchanged |
| Authoritative sources/rules | `WorldState` | ordered units, holy-vision effects, reveals, players, alliances/shared vision, terrain, engine settings | existing save behavior unchanged |
| Derived simulation cache | `visibilityCache.ts` | contribution counts, per-source records/signatures, tile revisions, dirty indices/bounds, cache revision | transient `WeakMap`; not serialized |
| Derived renderer cache | `fogChunkCache.ts` | per-view Pixi chunk roots, built revisions/config signatures, active/dormant LRU | renderer-owned; not serialized |

Published buffers remain the only values gameplay, targeting, selection, AI,
and rendering read. Contribution counts never become an alternate visibility
API. Renderer code consumes published buffers plus read-only transient revision
metadata; it never exposes or mutates contribution records.

No derived visibility/fog save fields may be added. Existing saved
`exploredTilesByPlayer`, `exploredTiles`, `visibleTiles`, last-seen buildings,
and authoritative reveal/effect/unit/rule fields remain unchanged. On load,
the existing normalizer restores authoritative world state; before the loaded
world advances or renders, perform a deterministic full rebuild from that
state, publish exact grids, seed the transient simulation cache, and create fog
chunks lazily. The old world's simulation and renderer caches are unreachable
and disposed. Save text and schema remain byte-identical for the same
authoritative state.

## Simulation contribution contract

Store one `VisibilityContributionCache` per `WorldState` in a `WeakMap`. Build
the current deterministic source list in this exact order:

1. eligible units in authoritative `world.units` order, keyed by object
   identity so duplicate IDs remain distinct;
2. eligible holy-vision effects in `world.spellEffects` order, keyed by object
   identity; and
3. active `visibilityReveals` in array order, keyed by object identity.

The diagnostic label includes kind, stable ID when available, and authoritative
rank, but ID alone never owns a record. A unit signature includes every input
to current eligibility and `sourceFieldOfViewFootprintForUnit`: player/vision
relationship, hit points, position, footprint, sight range, elevation, and any
revelation rule. Effect/reveal signatures include kind, player, position,
radius, activity/lifetime eligibility, and vision relationship. The global
signature includes world/map identity and dimensions, tile size,
`visibilityPlayer`, fog enable/mode, ordered shared-vision/alliance/revelation
state, accepted Plan 019 opacity inputs and terrain version, and every engine
setting read by FOV. A changed global signature requires full rebuild.

Each source record owns a sorted unique `Uint32Array` of contributed tile
indices. Records are bounded per-source by the clipped FOV envelope and never
exceed `map.width * map.height`. Local contribution counts use one
`Uint32Array(tileCount)`; overflow is an invariant failure. Across all sources,
hard-cap stored contributed indices at 8,388,608 (32 MiB of index payload) per
world. The count buffer, tile-revision buffer, dirty scratch bitmap, and sorted
dirty output are each bounded by `tileCount`. If the aggregate cap or a count
overflows, publish the exact full-rebuild result for that tick, record
`overflowFallbacks`, discard incremental records, and stay in reference mode
until a later explicit rebuild fits. Any overflow in an assigned acceptance
profile is a STOP, not an accepted fallback.

Each sorted source record contributes at most once to each tile, so subtraction
must decrement exactly one. Before every decrement, read the `Uint32` count and
require it to be at least one. If it is zero, do not subtract and do not allow
unsigned wrap. Abort the incremental transaction before publishing any partial
grid/revision result, increment `underflowDetections`, and immediately run
`rebuildVisibilityReference` from current authoritative sources. Compare the
full result with a freshly rebuilt contribution cache, replace all
counts/records atomically, derive dirty tiles against the last published grid,
publish that exact reference result, and increment `underflowRebuilds`.

The first recovered underflow forces reference mode until the next explicit
world/load rebuild. An immediate rebuild mismatch, or any second underflow in
the same `WorldState` lifetime after a clean rebuild, increments
`persistentCorruptions`, locks that world in reference mode, and is a STOP for
Plan 025 acceptance. There is no saturating decrement, silent zero, wrapped
`0xffffffff`, partial publication, or accepted repeated fallback.

On each local fixed-tick update:

1. discover sources and compare signatures in authoritative order;
2. validate then subtract removed/changed old records in prior
   authoritative-rank order, using the underflow recovery contract above;
3. compute and add changed/new records in current authoritative order;
4. collect every touched tile, sort ascending, and compare final contribution
   positivity with the prior published bit; do not dirty a tile for an
   intermediate zero while overlapping sources are being replaced;
5. set `visibleTiles[index]` from final count, set exploration monotonically
   under current rules, and publish only exact changed bits; and
6. update last-seen buildings at the same point in the fixed tick as today.

Local-player visibility still updates on every required simulation tick.
There is no cadence reduction, wall-clock debounce, renderer-triggered update,
or stale targeting window. Terrain opacity/global topology changes, fog-mode
changes, world identity/replacement, load, explicit invalidation, revision
wrap, source-record corruption, and parity failure force a deterministic full
rebuild before any published result is consumed.

AI exploration cadence stays independent from local rendering and local
visibility maintenance. For each enabled AI, update only when the existing
`world.tick >= state.nextExplorationUpdateTick` condition is true, visit sources
in the same authoritative order, update its existing explored buffer
monotonically, and set the next tick exactly as today. Do not update AI grids
on camera movement/render, do not make them local-tick work, and do not lower
or raise their frequency without a separately approved semantic plan.

## Dirty revision and full-parity contract

The transient cache owns a JavaScript `number` constrained to the unsigned
32-bit integer range `1..0xffffffff`, matching its
`Uint32Array(tileCount)` of last-changed tile revisions; zero is reserved for
an unstamped tile. A construction/full rebuild sets the cache revision to one
and stamps every tile. The cache also owns sorted unique `dirtyTileIndices` and
either `null` or exact inclusive dirty bounds `{ minX, minY, maxX, maxY }`.

When final visible/explored bits change and the current revision is below
`0xffffffff`, increment once for that simulation update, stamp changed tiles,
and derive bounds from those tiles. An unchanged tick retains its revision,
including at `0xffffffff`, and publishes an empty list/null bounds. If a changed
update begins at `0xffffffff`, perform a deterministic full rebuild instead,
reset to one, stamp every tile, and force every renderer chunk stale. Revision
zero or a value above `0xffffffff` is never published.

Keep the current complete-grid algorithm as `rebuildVisibilityReference`.
Development/test full parity runs after every scripted update; deterministic
production sampling may use update count only, never runtime randomness. The
oracle starts from identical authoritative inputs and compares every local
visible bit, every due AI explored bit, local exploration monotonicity,
last-seen building identity/order/state, dirty-tile final transitions, and
targeting outcomes. A mismatch publishes the reference result for the current
tick, invalidates the contribution cache, increments `parityFailures`, and
requires a clean full rebuild before the next incremental update. Plan 025
cannot close with a parity failure or unexplained reference fallback.

## Bounded fog chunk contract

Freeze these renderer constants in `fogChunkCache.ts`:

```ts
export const FOG_CHUNK_TILES = 16;
export const FOG_DORMANT_CHUNKS_PER_VIEW = 64;
```

Each primary or secondary viewport owns an independent cache keyed by exact
view owner and `WorldState` identity. A record key is `chunkX,chunkY`; its root
container and every tracked graphics/sprite child belong only to that view.
Mutable Pixi objects are never shared across views or with Plan 022 records.
All construction/destruction uses accepted Plan 018 tracked wrappers. Textures
remain atlas-owned and are never destroyed by the cache.

The active set is exactly the in-map chunks intersecting the viewport plus one
chunk guard band. Thus active records are bounded by that clipped rectangle and
never exceed total map chunks. Detached chunks enter a deterministic 64-entry
per-view LRU; overflow destroys the oldest record immediately. Total records
per view are bounded by active required chunks plus 64. A chunk root may be
retained, but rebuilding destroys/recreates only that root's children and
updates its exact built revision/config signature.

For each chunk, inspect tile revisions only in its clipped tile rectangle
expanded by the exact fog dependency radius
`sourceBlackFogVisibleSuppressionRadius + 1`. Rebuild when any dependency tile
revision is newer than the record, or when the world/player/fog-mode/atlas/
alpha/blur/bilinear/tile-size/map signature changes. A one-tile state change
therefore dirties only chunks whose expanded dependency rectangles contain
that tile. Remove `fogVisibilityHash`; after integration,
`fullViewportHashScans` must remain zero.

Render the same tiles, edge masks, alphas, source textures, unknown fill, and
blur result as the immediate renderer. Apply blur at the persistent view-level
fog layer so chunk boundaries cannot produce filter seams. Camera movement
attaches/reuses required chunks and detaches others; it never recomputes
simulation visibility. Viewport resize, player/view change, fog mode/settings,
atlas change, map/world replacement, restart, view closure, renderer teardown,
and fatal render reset have explicit deterministic reconcile or disposal.

World replacement, map load/restart, renderer teardown, removed split view,
and fatal reset synchronously destroy every active and dormant chunk for that
exact owner and clear filters/references. Fog disable disposes all chunks and
hides the layer; re-enable lazily builds current required chunks. Stable views
never retain a chunk beyond the hard bounds or display a record whose world,
player, config signature, or dependency revision is stale.

## Steps

### Step 0: Prove the Wave 4 gate and freeze direct baselines

Confirm Plans 022 and 023 passed all focused, shared-budget, browser,
determinism, durability, and review exit gates and integrated. Verify technical
Plans 018/019/022/023 and their accepted artifacts/checksums/fingerprints,
terrain opacity parity, retained-object lifecycle/counters, and authoritative
unit ordering/mutation inventory. Run refreshed drift checks and all
pre-existing non-browser baseline commands. Do not invoke
`verify-visibility-fog-incremental.mjs` until Step 1 has created a meaningful
red fixture.

Regenerate the complete visibility inventory: units, holy vision, reveal
effects, source spawn/removal/death, movement/tile crossing, footprint/range/
elevation/status/owner change, shared vision/alliance/revelation, transport/
resource containment, terrain opacity/version, fog mode/settings, player/view
change, map/world replacement, and load. Assign each row a signature field,
incremental update or full-rebuild reason, cadence, and focused case. Inventory
every primary/split-view fog creation, pan/resize, invalidation, detach,
eviction, world replacement, view closure, and teardown seam.

Before editing, capture identical-boundary direct baselines: visibility/FOV
duration, sources and tiles visited, full rebuilds, local/AI cadence, fog hash
duration, fog subtree build duration, object create/destroy totals, viewport
tiles visited, frame/heap results, and grid/screenshot fingerprints. Normalize
simulation work per processed step and fog work per rendered frame.

**Verify:** strict barrier, technical handoffs, concrete drift, source and
renderer inventories, checksums/fingerprints, direct baselines, host policy,
published grids, cadence, pixels, saves, and baseline gates are green.

### Step 1: Add transient contribution state and the full-grid oracle

Create `scripts/verify-visibility-fog-incremental.mjs` first. Its initial
incremental-work/revision assertion must fail against the accepted full-grid
implementation for the intended behavioral reason, not because a file/import
is missing; preserve that red output before adding the transient cache and
making the same assertion green.

Create `visibilityCache.ts` with source discovery/signatures, bounded sorted
records, `Uint32Array` counts, revision metadata, invalidation, diagnostics,
and `rebuildVisibilityReference`. Initially run incremental calculation only as
a shadow and publish the existing reference result.

Exercise overlapping units, duplicate IDs, holy vision, reveals, shared
vision, revelation, map edges, footprints, elevation, terrain opacity, source
removal, and record corruption. Inject a zero count before removing a recorded
source and assert no decrement/wrap or partial publication occurs, the exact
reference grid and a clean contribution cache replace the transaction, and
reference mode is selected. After an explicit clean rebuild, inject a second
underflow and assert `persistentCorruptions`, permanent reference mode, and
acceptance STOP. Compare exact grids/revisions after each operation.

Exercise revision `0xfffffffe` to `0xffffffff`, an unchanged tick retained at
`0xffffffff`, and the next changed update's full reset to one with every tile
stamped and every fog chunk stale. Reject zero and out-of-range revisions.

**Verify:** shadow output equals the reference byte-for-byte; records respect
per-source/aggregate bounds; first underflow recovers atomically without
`0xffffffff`; repeated/persistent corruption is explicit and cannot be
accepted; source identity/order is deterministic; no cache/revision/diagnostic
enters `WorldState`, save output, or hashes.

### Step 2: Publish incremental local visibility every fixed tick

Enable incremental local contributions and final-state dirtying. Preserve the
existing update call after every `stepWorld`, exploration alias, monotonicity,
last-seen update timing, target visibility, and event order. Use full rebuild
for every global/invariant reason listed above.

Run fixtures where overlapping sources enter/leave in opposite orders, move
across several tiles in one step, change footprint/range/elevation/owner, enter
transport/resource containment, die, spawn, reveal/expire, and mutate opacity.
Dirty only final published transitions, with sorted indices and exact bounds.

**Verify:** every local fixed tick publishes the same grids/targeting as the
reference; unchanged ticks perform zero FOV source recomputations; dirty
revisions/bounds are exact; full rebuild/fallback reasons are explicit.

### Step 3: Preserve AI exploration cadence and load/rebuild

Keep AI exploration behind its current `nextExplorationUpdateTick` gate and
current `world.tick + world.tickRate` schedule. Compare each due update to the
reference and prove no local render/camera activity changes AI buffers or next
ticks.

Load saves with local/AI exploration, shared vision, holy vision, reveals,
last-seen buildings, and fog disabled/enabled. Discard all old transient state,
perform one deterministic full rebuild from authoritative loaded state before
render/advance, seed the new cache, and leave serialized JSON unchanged.

**Verify:** due/not-due AI updates, next tick, explored grids, local alias,
targeting, and last-seen state are exact; load/world replacement has one new
independent cache; save schema/text has no derived field.

### Step 4: Add independent bounded fog chunk caches

Create the pure chunk reconcile layer, per-view ownership, 16-tile keys,
dependency rectangles, 64-entry dormant LRU, config signatures, tracked
construction/destruction, and complete disposal. First compare its decisions
and pixels while the immediate renderer remains available as the reference.

Migrate primary and split-view fog rendering. Retain chunk roots, rebuild only
dirty children, apply view-level blur, and remove full-viewport visibility
hashing. Cover one-tile changes at chunk corners/edges, the full dependency
radius, pan away/back, resize, world/player/mode/atlas changes, view count
changes, disposal, LRU overflow, and independent views.

**Verify:** screenshot hash is exact when byte stability exists; otherwise
before/after images and existing pixel statistics match without invented
tolerance. Dirty rebuilding is minimal, bounds hold, no stale chunk renders,
and `fullViewportHashScans` is zero.

### Step 5: Prove independent rollback and integrated lifecycle

Add an explicit simulation reference-mode switch that discards contribution
records and runs `rebuildVisibilityReference` each required tick while still
emitting exact diff revisions for the chunk renderer. Add a renderer reference
switch that disposes chunks and restores the previous padded hash/full-subtree
fog renderer while continuing to consume correct published grids. These
switches exist for rollback/tests, not as accepted steady-state fallbacks.

The coordinator wires world replacement, map restart, renderer teardown, and
split-view closure disposal plus namespaced shared capture. Verify Plan 022
objects and counters remain independent from fog records.

**Verify:** simulation rollback works with either renderer; renderer rollback
works with either simulation mode; both together reproduce the accepted
legacy output; no rollback changes saves or Plan 022 ownership.

### Step 6: Revalidate and measure

Run every command in the table. Capture three independent valid trials per
assigned row using the exact accepted Plan 018 environment, viewport, warmup,
duration, fingerprints, statistics, and worst-trial rule. Do not pool samples.

Record per trial: visibility update and full-rebuild distributions; source and
tile visits; contribution add/remove counts; dirty tiles/bounds/revisions;
entry/byte high-water, overflow fallback, underflow detection/rebuild, and
persistent-corruption counts; fog decision/build duration;
chunk create/reuse/rebuild/detach/evict/destroy and active/dormant high-water;
full viewport hash scans; tracked object totals; frame/heap/long-task,
scheduler, and resource results.

For `army-200`, worst-trial incremental visibility p95 must be lower than the
legacy full-rebuild p95 and total visibility maintenance milliseconds per
processed simulation step must not increase. Worst-trial fog decision plus
chunk-build milliseconds per rendered frame must be lower than legacy fog hash
plus subtree-build milliseconds per frame. An unchanged stationary segment
must recompute zero source FOVs and rebuild/create/destroy zero fog chunks after
warm-up. Require `incrementalReady`; a greater-than-5% worsening of
worst-trial frame p95 is a regression.

**Verify:** direct simulation and renderer work improves rather than moving
between phases, parity/cadence/memory/lifecycle gates pass, the `incrementalReady` verdict passes,
and evidence is durable and checksum-verified.

## Test plan

- Full-grid byte parity across terrain/opacity, map edges, footprints, sight
  radii, elevation, fog modes, shared vision, alliances, and revelation.
- Ordered unit/effect/reveal discovery, duplicate IDs by object identity, and
  deterministic changed/removed processing.
- Overlapping-source counts where removing one source leaves visibility set.
- Spawn/removal/death, movement, range/footprint/elevation/owner, transport/
  resource containment, holy-vision/reveal lifetime, opacity, and world change.
- Sorted unique per-source indices, clipped FOV bound, 8,388,608 aggregate cap,
  count overflow, exact reference fallback, and zero accepted-profile overflow.
- Zero-before-decrement detection, no Uint32 wrap/partial publish, exact
  full-rebuild replacement, first-recovery reference mode, and second-underflow
  persistent-corruption STOP.
- Local every-fixed-tick visibility/targeting and independent existing AI
  exploration cadence with due/not-due next-tick assertions.
- Dirty final transitions, inclusive bounds, tile revisions, unchanged tick at
  `0xffffffff`, `0xfffffffe` increment, changed-at-maximum full reset to one,
  zero/out-of-range rejection, and full invalidation.
- Save/load/world replacement full rebuild from authoritative state with no new
  serialized contribution/revision/fog fields and unreachable old caches.
- 16×16 chunks, exact dependency radius, edge/corner propagation, view-level
  blur, config invalidation, and pixel/screenshot parity.
- Independent primary/split views, camera pan/reuse, resize, player/mode/atlas
  change, map load, view closure, teardown, fatal reset, and fog disable.
- Active required bound, 64 dormant LRU cap, deterministic eviction, complete
  tracked destruction, and zero stale/leaked records.
- Independent simulation and renderer rollback in all four combinations.
- Direct visibility/fog timing, tracked counters, heap, determinism, browser,
  asset, build, and unchanged shared-budget gates.

## Performance acceptance

This plan uses the `incremental` acceptance mode. The accepted Plan 018 rows
and any plan-local direct-work baseline are the before evidence; capture three
independent valid after trials per assigned row under the shared lifecycle,
nearest-rank statistics, and worst-trial rule. Never discard a valid budget,
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
.artifacts/performance/025/<commit>/<UTC-stamp>/
```

Include accepted Plan 018/019/022/023 artifact/checksum references,
environment, profile-definition and initial entity/effect fingerprints, one
JSON per trial, normalized summaries, exact source/global/fog lifecycle
inventories, legacy and incremental direct timing, golden grids and visual
references, dirty revisions/bounds, contribution and memory high-water,
meaningful red and final green incremental-verifier outputs, raw underflow
fixture counts/indices, unsigned-32-bit boundary/reset/no-wrap assertions,
rebuilt grid/cache fingerprints, first-recovery and repeated-corruption
outcomes, chunk actions/bounds/disposal, Plan 018 tracked counters,
parity/cadence/load/rollback results, controller/resource records,
invalid/replacement records, and SHA-256
checksums. Independently recompute new checksums and verify every baseline.

Commit only concise normalized results to the single evidence file
`plans/evidence/025.md`; do not create `plans/evidence/025/`, and do not rely
on `/tmp` as durable evidence.

## Done criteria

- [ ] Strict Wave 4 barrier is open: Plans 022 and 023 passed all exit gates
  and integrated; Plans 018/019/022/023 technical handoffs verify.
- [ ] Published visible/explored/last-seen results and targeting match the full
  rebuild grid parity oracle on every accepted scenario.
- [ ] Simulation contributions use bounded per-source sorted records and the
  aggregate memory cap with zero accepted-profile overflow/fallback/parity
  failure; decrement validates before mutation, never wraps, and no repeated or
  persistent underflow is accepted.
- [ ] Local visibility updates every required fixed tick; the existing AI
  exploration cadence remains exact and independent from local rendering.
- [ ] Dirty tile indices, bounds, and revisions represent only final published
  changes and rebuild deterministically on load/world/global invalidation.
- [ ] Revision is exactly unsigned-32-bit `1..0xffffffff`; unchanged-at-maximum
  retains the value, the next changed update rebuilds at one and stamps every
  tile, and zero/out-of-range publication is rejected.
- [ ] The new focused verifier has meaningful behavior-level red evidence and
  a final green result; missing-file/import failure is not accepted.
- [ ] Bounded fog chunks are independent per view, invalidate by exact
  dependency radius, preserve pixels/blur, and dispose on every lifecycle seam.
- [ ] Contribution/revision/chunk/cache/diagnostic state is not serialized; no
  save field or save text/schema change exists.
- [ ] Simulation rollback and renderer rollback are independent and each
  preserves correct output without removing accepted Plan 022 work.
- [ ] Terrain, render-cache, occupancy, FOV/fog, save, browser, determinism,
  asset, build, memory, and focused gates pass.
- [ ] Direct visibility and fog timing improves, work is not shifted, and every
  `incrementalReady` passes with durable checksum-verified evidence.
- [ ] The branch contains only Plan 025-owned files; coordinator
  main/performance-schema/package/README integration is separate.

## STOP conditions

- Either Wave 3 plan has not passed every exit gate and integrated, or any
  technical dependency, artifact, checksum, fingerprint, terrain/FOV/grid/
  pixel oracle, retained lifecycle, occupancy order, or direct baseline fails.
- A cited seam differs after Wave 3 integration without the required
  coordinator refresh to a concrete accepted SHA.
- A visibility source/global rule or renderer lifecycle mutation lacks a
  signature, invalidation/rebuild reason, owner, cadence, or focused fixture.
- Incremental output, targeting, exploration monotonicity, last-seen order, or
  fog pixels differs from the complete reference grid/immediate renderer.
- Local visibility becomes less frequent than each required fixed tick, AI
  exploration cadence changes, or rendering/camera activity drives simulation.
- A per-source/aggregate/chunk bound is exceeded in an accepted profile,
  revision/identity validation fails, stale fog renders, or parity/fallback is
  unexplained.
- A contribution decrement observes zero and still mutates/publishes, wraps to
  `0xffffffff`, fails to rebuild exact authoritative grids/cache immediately,
  or any second/persistent underflow occurs after a clean rebuild.
- Any contribution, revision, dirty, fog chunk, LRU, or diagnostic field enters
  `WorldState`, save JSON/schema, command/replay state, or canonical hashes.
- Correctness requires Plan 024 path/order/save files, changing Plan 019/022/
  023 semantics, sharing mutable Pixi objects, or an unassigned shared file.
- Simulation and renderer cannot roll back independently, or rollback removes
  accepted Plan 022 retention/counters.
- An owned edit reaches `src/main.ts`, performance schema, `package.json`,
  `plans/README.md`, an existing shared verifier, or another plan's evidence
  before coordinator integration.
- Any focused, upstream, type, save, browser, determinism, asset, or build gate
  fails twice.
- Halla/browser qualification fails, captures overlap, replacement exhausts,
  a new budget-failure key appears, frame p95 regresses over 5%, direct timing does not
  improve, or durable single-file evidence/checksums cannot be verified.

## Rollback

Simulation rollback is independent: a detected underflow aborts the current
incremental transaction before publication and immediately switches to
`rebuildVisibilityReference`; repeated/persistent corruption locks that world
there for its lifetime. Manual rollback likewise switches publication back to
`rebuildVisibilityReference` on every required local/AI cadence and discards
the transient contribution cache while continuing to emit exact changed-tile
revisions by diffing the correct published grids. The fog chunk renderer may
remain active. Do not change saves, FOV rules, cadence, or accepted terrain/
occupancy work.

Renderer rollback is independent: dispose every Plan 025 fog chunk and restore
the prior padded `fogVisibilityHash` plus whole-subtree renderer while
continuing to consume correct published grids from either simulation mode.
Plan 022's retained world objects remain untouched. If both slices fail, use
both reference paths. Revert only unaccepted Plan 025 and coordinator
integration commits, preserve failed/invalid evidence and accepted Plans
018–023, stop exact owned processes, and remove only exclusive artifacts.

## Maintenance notes

Every new visibility source or global rule requires an exact signature field,
ordered identity, bounded contribution fixture, invalidation/full-rebuild
reason, cadence proof, dirty transition, save exclusion, and parity case. Every
new fog dependency or view lifecycle requires an exact dependency radius,
chunk invalidation/disposal case, pixel oracle, bound, and renderer rollback.
Keep published grids authoritative, validate every decrement before mutation,
never accept repeated underflow, keep caches transient and local/AI cadence
separate, preserve Plan 022 ownership, and keep both rollback paths executable.
