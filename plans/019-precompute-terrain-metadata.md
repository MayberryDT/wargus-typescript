# Plan 019: Precompute Terrain Metadata Used By Pathfinding And Visibility

> **Executor instructions:** Execute this Wave 2 plan in an isolated Halla
> worktree only after Plan 018 is accepted and integrated. Follow
> [the Halla execution policy](HALLA-EXECUTION-POLICY.md) and
> [the performance acceptance contract](PERFORMANCE-ACCEPTANCE.md) without
> weakening either. Preserve terrain, passability, path-selection, and FOV
> semantics exactly. Stop on every STOP condition.
>
> **Drift check:** Run every command and inventory in `Current state` first.
> STOP on an unexplained accepted-base, excerpt, ownership, or dependency drift.

## Status

- **Status:** TODO
- **Wave:** 2 — Independent hot paths
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM — shared terrain semantics
- **Depends on:** accepted and integrated Plan 018
- **Category:** performance, simulation
- **Original planning base:** `8ac0006`, 2026-07-27
- **Roadmap rewrite base:** `d4ad3868d5d0df9f1fa20e83cbc9f19a90b94aed`
  (`git rev-parse --short HEAD` printed `d4ad386`)

Plan 018's documentation rewrite is not the dependency. The Wave 1 coordinator
must first accept and integrate Plan 018, then refresh the concrete drift SHA
and excerpts below if that integration changed a cited source seam. Do not
replace the SHA with a symbolic token. Until the accepted Plan 018 commit and
baseline handoff are concrete and present, STOP.

## Why this matters

Pathfinding, harvest/build checks, forest initialization, and line-of-sight
repeatedly search immutable tileset slots and allocate short-lived flag
collections. A shared immutable numeric metadata cache removes that work
without changing which tiles are land, buildable, harvestable, or opaque.

## Current state

At the concrete rewrite base, the post-Plan-018 implementation has these exact
seams:

```ts
// src/simulation/passability.ts:193-199
function sourceTileFlags(world: WorldState, tile: number): Set<string> | null {
  if (isSourceRemovedTreeTile(tile)) {
    return new Set(["land"]);
  }
  const slot = tileSlot(tile);
  const flags = world.tilesetTerrain?.slots.find((entry) => entry.slot === slot)?.flags;
  return flags ? new Set(flags) : null;
}

// src/simulation/passability.ts:202-204
function isSourceRemovedTreeTile(tile: number): boolean {
  return tile === 126;
}

// src/simulation/world.ts:1253-1256
const flags = world.tilesetTerrain?.slots.find((entry) => entry.slot === tileSlot(tile))?.flags;
if (flags) {
  return flags.includes("forest");
}

// src/simulation/world.ts:2029-2030
const flags = world.tilesetTerrain?.slots.find((entry) => entry.slot === tileSlot(world.tiles[tileY * world.map.width + tileX] ?? 0))?.flags ?? [];
return world.engineSettings.opaqueTerrainTypes.some((type) => {
```

These paths are intentionally different: only `sourceTileFlags` applies the
tile-126 land-only override. Forest initialization and opacity/FOV query raw
slot metadata for tile `126`, just as they do for every other tile.

Run before editing:

```bash
test "$(hostname)" = halla
git merge-base --is-ancestor d4ad3868d5d0df9f1fa20e83cbc9f19a90b94aed HEAD
git diff --stat d4ad3868d5d0df9f1fa20e83cbc9f19a90b94aed..HEAD -- \
  src/simulation/passability.ts src/simulation/world.ts \
  src/simulation/terrainMetadata.ts \
  scripts/verify-terrain-metadata-cache.mjs \
  plans/019-precompute-terrain-metadata.md plans/evidence/019.md
rg -n "tilesetTerrain|sourceTileFlags|isSourceRemovedTreeTile|isSourceForestTile|isSourceOpaqueTerrainTile" \
  src/simulation/passability.ts src/simulation/world.ts
```

Expected: the rewrite base is an ancestor; all changes since it are the
accepted Plan 018 integration or explained coordinator integration; and the
listed excerpts still describe the live consumers. If accepted Plan 018
changed any cited seam, the Wave 1 coordinator must amend this plan with that
accepted concrete SHA and new exact excerpts before Plan 019 begins.

## Commands you will need

| Purpose | Command | Expected result |
|---|---|---|
| Host/worktree | `test "$(hostname)" = halla && git status --short --branch` | Halla, assigned isolated branch, understood status |
| Typecheck | `./node_modules/.bin/tsc --noEmit` | exit 0 |
| New terrain-parity verifier (created in Step 1) | `node scripts/verify-terrain-metadata-cache.mjs` | every slot/flag, fallback, cache, and diagnostic case passes |
| Pathfinding | `npm run verify:source-pathfinding` | exit 0 |
| Fog/FOV | `npm run verify:source-fov-fog` | exit 0 |
| Determinism | `npm run verify:runtime-determinism` | fixed-tick state and save comparison passes |
| Asset gate | `npm run verify:wargus-assets` | exit 0 |
| Build | `npm run build` | exit 0 |
| Performance | accepted Plan 018 rows `army-100` at 1280×720 and `command-18` at both viewports | three valid trials per row; every assigned budget passes |

Before implementation, run only the pre-existing typecheck, pathfinding,
fog/FOV, determinism, asset, and build gates. The new terrain verifier does not
exist at the Wave 2 base; a missing script/import is not red evidence. Create it
in Step 1, record a meaningful failing assertion against accepted legacy
behavior, then make that same assertion green. Run performance captures
serially; do not start a browser or capture alongside another executor.

## Scope

**Plan 019 owns:**

- `src/simulation/terrainMetadata.ts` (new);
- `src/simulation/passability.ts`, terrain-flag lookup only;
- `src/simulation/world.ts`, only `isSourceForestTile` and
  `isSourceOpaqueTerrainTile`;
- `scripts/verify-terrain-metadata-cache.mjs` (new); and
- `plans/evidence/019.md`.

**Out of scope:**

- unit occupancy, spatial indexes, path ordering, retries, cadence, or target
  selection;
- FOV geometry, fog rendering, terrain mutation, `terrainVersion`, save data,
  `WorldState`, tileset assets, or tile IDs;
- edits to `orders.ts`, `renderWorld.ts`, existing shared verifiers, Plan 018
  metric schemas, or another plan's evidence; and
- weakening a performance budget, validity rule, trial count, fingerprint, or
  determinism comparison.

The Wave coordinator owns `package.json` integration and `plans/README.md`
integration. The Plan 019 branch must not edit either file.

## Git workflow

- Branch from the accepted Wave 2 start into an isolated `plan-019` worktree.
- Keep metadata/parity work separate from consumer migration.
- Do not absorb another Wave 2 branch, resolve shared package/index conflicts,
  push, deploy, or open a PR unless instructed.

## Shared interfaces and ownership

- The accepted Plan 018 handoff supplies the normalized matrix, initial
  profile-definition hash, initial entity/effect fingerprint, environment
  identity, raw baseline directory, checksums, and worst-trial row results.
  Those artifacts are read-only inputs to Plan 019.
- `HALLA-EXECUTION-POLICY.md` governs Halla thresholds, unique ports,
  exact-owned process cleanup, serial captures, and artifact storage.
- `PERFORMANCE-ACCEPTANCE.md` governs trials, renderer qualification,
  determinism, statistics, invalid/replacement rules, and budgets.
- Plan 019 exclusively owns the terrain metadata/passability semantic slice
  listed above. Plan 020 owns `orders.ts` and its transient simulation unit-ID
  index. Plan 021 owns `renderWorld.ts` and render-only prepared snapshots.
- Existing `verify:source-pathfinding` and `verify:source-fov-fog` are
  read-only gates here. Any required shared-verifier edit belongs to the
  coordinator after the Wave 2 branches integrate.

## Steps

### Step 0: Prove the entry gate and freeze the baseline

Confirm Plan 018 is `DONE-VERIFIED`, its acceptance commit is integrated, and
its durable matrix and checksums resolve on Halla. Record the accepted
`army-100` and both `command-18` baseline row artifacts, environment identity,
profile-definition hash, initial entity/effect fingerprint, per-trial results,
and worst-trial results. Run the drift checks and all pre-existing non-browser
baseline commands. Record `scripts/verify-terrain-metadata-cache.mjs` as absent
and not run; if it already exists without an accepted plan refresh, STOP.

**Verify:** dependency, ancestry, drift, checksums, fingerprints, host policy,
and pre-existing baseline gates are green. STOP rather than using historical Plan 018
diagnostic or `/tmp`-only evidence.

### Step 1: Add an immutable terrain metadata cache

Create a loadable terrain-metadata API shell and
`scripts/verify-terrain-metadata-cache.mjs` first. At least one cache-reuse,
allocation, or raw-versus-normalized tile-126 fixture must execute and fail for
the intended legacy/no-cache reason; `MODULE_NOT_FOUND`, an import error, or a
missing file is not acceptable RED evidence. Preserve that output, then
implement until the same fixture and the full focused verifier are green.

Create numeric bits for exactly the flags consumed by the named passability,
forest, and opacity callers. Build one `Map<number, number>` per immutable
tileset object and retain it in a `WeakMap` keyed by that tileset identity.
Expose two distinct allocation-free lookup paths over that immutable map:

- a raw slot/tile mask lookup that returns the source slot flags exactly; and
- a passability-normalized tile lookup that returns the legacy land-only mask
  for removed-tree tile `126` before consulting its source slot.

Do not expose mutable arrays, `Set` objects, or the internal map. The raw lookup
must not call, alias, or inherit the removed-tree normalization. Preserve
missing-tileset and unknown-slot fallback behavior independently for both paths.

Add resettable plan-local diagnostics with these exact namespaces:

- `plan019.terrainMetadata.cacheBuilds`
- `plan019.terrainMetadata.cacheHits`
- `plan019.terrainMetadata.slotLookups`

Diagnostics must stay outside `WorldState`, saves, gameplay decisions, and the
Plan 018 summary schema. The focused verifier and evidence collector may read
them; cross-plan capture wiring, if required, is coordinator-owned.

**Verify:** the focused verifier exhaustively compares every manifest tileset
slot and consumed flag to the legacy lookup, proves cache reuse and
immutability, checks namespaced counters, and covers missing and unknown data.

### Step 2: Migrate passability semantics

Replace `sourceTileFlags` allocation/search work with the
passability-normalized mask lookup. Preserve land, naval, fly, coast,
unpassable, forest, rock, wall, no-building, harvest, and buildability
decisions exactly. Preserve removed-tree tile `126` as the legacy land-only
override in this path only. Do not alter occupancy checks, ignored-unit
handling, footprint checks, A* ordering, or path selection.

**Verify:** terrain parity and pathfinding gates pass, including exhaustive
legacy-versus-cache results and an explicit tile-126 passability fixture that
expects the land-only override.

### Step 3: Migrate forest initialization and opacity

Use only the raw slot/tile mask lookup in `isSourceForestTile` and
`isSourceOpaqueTerrainTile`; neither consumer may pass through removed-tree
normalization. Preserve legacy fallbacks, the `insideDefault && type === "rock"`
exception, `opaqueTerrainTypes` ordering, FOV traversal, and update cadence.

**Verify:** terrain parity and fog/FOV gates pass with summer, swamp,
wasteland, winter, unknown-slot, forest, rock, and opacity fixtures. Dedicated
tile-126 forest and opacity/FOV fixtures must read its raw source slot flags and
match their respective legacy consumers, not the passability land-only mask.

### Step 4: Revalidate behavior and measure

Run every command in the table. Capture three independent valid trials for
all assigned rows using the exact accepted Plan 018 environment, profile
specification, warmup, duration, viewports, fingerprints, statistics, and
worst-trial aggregation. Compare against the accepted baseline without pooling
samples. Every assigned shared budget must pass; a greater-than-5% worsening
of worst-trial frame p95 also counts as a regression even if the budget passes.

**Verify:** deterministic state/save parity is exact, path/FOV results are
unchanged, all assigned budgets pass, and evidence records CPU, frame, heap,
long-task, scheduler, input, and terrain-diagnostic results where applicable.

## Test plan

- A recorded meaningful RED followed by GREEN for the new verifier; load/import
  failure does not qualify.
- Every manifest tileset slot and every caller-consumed source flag.
- Missing tileset, unknown slot, and legacy fallback classifications.
- Three explicit removed-tree tile `126` fixtures: passability receives the
  legacy land-only override; forest initialization receives raw slot metadata;
  and opacity/FOV receives raw slot metadata.
- A focused guard proves the raw and passability-normalized helpers cannot
  silently alias or conflate tile-126 behavior.
- Land/naval/fly, coast, unpassable, forest, rock, wall, no-building, harvest,
  buildability, and opacity parity.
- Representative summer, swamp, wasteland, and winter terrain.
- Immutable cache identity and no per-lookup `Set`, array, or map allocation.
- No unit occupancy, A* ordering, path-selection, FOV geometry, or save change.
- Namespaced diagnostics reset and count only Plan 019 work.

## Performance acceptance

The assigned rows use the accepted Plan 018 artifacts as the before baseline
and the shared matrix lifecycle unchanged. Each row requires three independent
valid after trials; apply nearest-rank per-trial statistics and the worst-trial
row rule. Never discard a valid budget failure. Plan 019 cannot close while an
assigned budget fails, a fingerprint differs, the environment is not
comparable, or evidence is incomplete. No local exception may weaken a shared
budget or qualification rule.

## Evidence contract

Store raw artifacts outside Git at:

```text
.artifacts/performance/019/<commit>/<UTC-stamp>/
```

Include the accepted Plan 018 baseline directory and checksum references,
environment comparison, profile-definition and initial entity/effect
fingerprints, one JSON per trial, normalized row summary, diagnostics,
determinism/focused-test results, the focused verifier's meaningful RED/GREEN
output, controller identity, resource-monitor and invalid/replacement records,
and SHA-256 checksums. Independently recompute the
new checksums and verify baseline references resolve. Commit only the concise
normalized result to `plans/evidence/019.md`; it must not rely on `/tmp`.

## Done criteria

- [ ] Accepted Plan 018 integration and durable baseline handoff are verified.
- [ ] The new verifier has a recorded behavior-level RED and GREEN; no missing
  file/import result is counted as RED.
- [ ] Hot terrain lookups no longer use `.slots.find` or allocate `Set`
  instances.
- [ ] Removed-tree tile `126` uses the legacy land-only override for
  passability and raw source slot flags for forest initialization and
  opacity/FOV; focused fixtures prove all three results independently.
- [ ] Every other terrain flag, fallback, pathfinding, passability,
  harvest/build, forest, and FOV result matches legacy behavior.
- [ ] No occupancy, path-selection, save-schema, deterministic-state, or
  renderer change exists.
- [ ] Namespaced diagnostics and focused tests pass.
- [ ] Typecheck, determinism, assets, build, pathfinding, and fog/FOV pass.
- [ ] Every assigned performance row passes the shared budgets with durable,
  checksum-verified evidence.
- [ ] The branch contains only Plan 019-owned files; coordinator integration is
  pending or complete separately.

## STOP conditions

- Plan 018 is not accepted/integrated, its concrete baseline cannot be
  resolved, or its checksums/fingerprints are missing.
- The concrete drift check or excerpt differs without a coordinator refresh.
- Source tileset flags can mutate after cache construction.
- A proposed shared helper would normalize tile `126` for forest or opacity,
  or otherwise make raw metadata consumers inherit passability-only
  normalization.
- Preserving behavior requires changing tile/fallback classification,
  occupancy, path ordering/selection, FOV geometry/cadence, `WorldState`, or
  save data.
- A runtime import cycle appears or an owned edit reaches `orders.ts`,
  `renderWorld.ts`, a shared verifier, `package.json`, or `plans/README.md`.
- The new verifier cannot produce a meaningful behavior-level RED before GREEN.
- Any parity, focused, type, determinism, asset, or build gate fails twice.
- Halla or browser qualification fails, another capture is active, a trial
  exhausts its replacement, an assigned budget fails, or frame p95 regresses
  by more than 5%.
- Durable evidence or checksums cannot be produced and verified.

## Rollback

Revert only the unaccepted Plan 019 metadata and caller-migration commits.
Restore the three owned consumers to the legacy slot lookup and `Set`/array
membership path. Preserve failed/invalid evidence and never reset accepted Plan
018 or another Wave 2 branch. Remove only exact owned processes and only a raw
artifact directory proven to belong exclusively to the rolled-back attempt.

## Maintenance notes

New terrain flags must be added to the bit definitions and exhaustive parity
fixture together. Keep the cache immutable and plan-local. Do not make terrain
metadata a unit-occupancy index or allow collection-returning helpers back into
the hot passability/FOV path. Keep raw slot metadata and passability-normalized
metadata as distinct named APIs; a new normalization may enter a raw consumer
only through an explicit behavior change and updated parity contract.
