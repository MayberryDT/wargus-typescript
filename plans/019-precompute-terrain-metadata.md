# Plan 019: Precompute Terrain Metadata Used By Pathfinding And Visibility

> **Executor instructions**: Execute each step and gate in order. Stop on any
> STOP condition. Do not add occupancy indexing or change path selection.
>
> **Drift check (run first)**:
> `git diff --stat 8ac0006..HEAD -- src/simulation/passability.ts src/simulation/world.ts src/simulation/terrainMetadata.ts scripts/verify-source-pathfinding.mjs scripts/verify-source-fov-fog.mjs scripts/verify-terrain-metadata-cache.mjs package.json plans/019-precompute-terrain-metadata.md plans/evidence/019.md plans/README.md`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/018-establish-runtime-performance-feedback-loop.md
- **Category**: perf
- **Planned at**: commit `8ac0006`, 2026-07-27

## Why this matters

A* and line-of-sight repeatedly search the same tileset slot array and allocate
new `Set` objects for immutable flags. Large path searches multiply that work
thousands of times and create avoidable GC pauses. A shared immutable bitmask
index removes this cost without changing movement or visibility semantics.

## Current state

```ts
// src/simulation/passability.ts:193
const flags = world.tilesetTerrain?.slots
  .find((entry) => entry.slot === slot)?.flags;
return flags ? new Set(flags) : null;

// src/simulation/world.ts:2029
const flags = world.tilesetTerrain?.slots
  .find((entry) => entry.slot === tileSlot(...))?.flags ?? [];
```

`tile === 126` is a special removed-tree tile treated as land. Preserve it.
Terrain mutation increments `world.terrainVersion`; source slot definitions
themselves are immutable for a loaded world.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `./node_modules/.bin/tsc --noEmit` | exit 0 |
| New parity verifier | `npm run verify:terrain-metadata-cache` | exits 0 |
| Pathfinding | `npm run verify:source-pathfinding` | exits 0 |
| Fog/FOV | `npm run verify:source-fov-fog` | exits 0 |
| Determinism | `npm run verify:runtime-determinism` | exits 0 |
| Performance profiles | Plan 018 `army-100` and `command-18` | no regression; attach summaries |

## Scope

**In scope**:

- `src/simulation/terrainMetadata.ts` (create)
- `src/simulation/passability.ts`
- `src/simulation/world.ts`, only terrain-opacity/forest flag consumers
- `scripts/verify-terrain-metadata-cache.mjs` (create)
- `scripts/verify-source-pathfinding.mjs`
- `scripts/verify-source-fov-fog.mjs`
- `package.json`
- `plans/evidence/019.md` and `plans/README.md`

**Out of scope**:

- Dynamic unit occupancy
- A* ordering, retry cadence, FOV geometry, or fog rendering
- `WorldState` or save-schema fields
- Changing tile IDs or asset data

## Git workflow

- Suggested branch: `codex/019-terrain-metadata-cache`
- Commit cache/parity tests before caller migration.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Baseline and profile

Run every command except the new verifier, then capture Plan 018 `army-100`
and `command-18`.

**Verify**: checks are green and baseline summaries are recorded.

### Step 2: Add the shared immutable index

Create `terrainMetadata.ts` with numeric bit constants for the exact source
flags consumed by passability/FOV. Build one `Map<number, number>` from
`tilesetTerrain.slots` and cache it in a `WeakMap` keyed by the tileset object.
Expose allocation-free helpers for:

- tile ID to slot;
- tile/slot mask lookup;
- mask membership;
- removed-tree tile normalization.

Do not return arrays or `Set` instances in hot helpers. Unknown tilesets/slots
must retain current fallback behavior.

**Verify**: the new verifier compares masks with every manifest tileset slot
and confirms repeat lookups reuse the same cache.

### Step 3: Migrate passability

Replace `sourceTileFlags` calls in terrain passability/harvest checks with
mask membership. Preserve land/naval/fly, coast, unpassable, forest, rock,
wall, no-building, and removed-tree decisions exactly.

**Verify**: `npm run verify:source-pathfinding` and
`npm run verify:terrain-metadata-cache` pass.

### Step 4: Migrate visibility opacity and forest classification

Use the same helper in `world.ts` where slots are linearly searched for forest
and opacity flags. Do not change FOV traversal or cadence.

**Verify**: `npm run verify:source-fov-fog` and the parity verifier pass.

### Step 5: Measure and close out

Run typecheck, determinism, all focused verifiers, and the same two Plan 018
profiles. Record before/after CPU distributions and heap/long-task counts in
`plans/evidence/019.md`.

## Test plan

- Every source tileset slot and every flag used by callers.
- Unknown slot and missing tileset fallbacks.
- Removed-tree tile 126.
- Summer/swamp/wasteland/winter representative passability and opacity.
- Cache identity and zero new `Set` creation in migrated hot helpers.

## Done criteria

- [ ] Hot terrain lookups do not use `.slots.find` or `new Set`.
- [ ] Passability and FOV results match the pre-change implementation.
- [ ] No save schema or deterministic result changes.
- [ ] Focused tests, typecheck, and determinism pass.
- [ ] Plan 018 profiles show no regression and evidence is recorded.
- [ ] Only in-scope files changed; README row is DONE.

## STOP conditions

- Source flags can mutate after world creation.
- Preserving behavior requires changing fallback tile classification.
- FOV imports create a runtime circular dependency.
- Any parity case differs and cannot be explained as an existing bug.
- Performance profiles regress p95 by more than 5%.

## Maintenance notes

Add new source terrain flags to the bitmask module and its exhaustive parity
fixture. Do not reintroduce collection-returning helpers on pathfinding or FOV
hot paths.
