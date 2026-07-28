# Plan 021: Cull Before Sorting And Build One Indexed Render Snapshot

> **Executor instructions**: This is render preparation only. Do not retain
> Pixi display objects yet; plan 022 owns that lifecycle change.
>
> **Drift check (run first)**:
> `git diff --stat 8ac0006..HEAD -- src/view/renderWorld.ts src/view/renderPreparation.ts scripts/verify-render-preparation.mjs scripts/verify-browser-runtime-smoke.mjs package.json plans/021-build-culled-render-snapshots.md plans/evidence/021.md plans/README.md`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/018-establish-runtime-performance-feedback-loop.md, plans/020-add-transient-unit-id-index.md
- **Category**: perf
- **Planned at**: commit `8ac0006`, 2026-07-27

## Why this matters

The renderer currently copies and sorts the complete world before culling.
Corpses, projectiles, and spell effects are each copied/sorted twice for two
draw strata, and visible units repeatedly scan research, attack, animation,
and unit arrays. One prepared snapshot limits work to visible candidates and
builds shared indexes once per rendered viewport.

## Current state

```ts
// src/view/renderWorld.ts:534
const visibleUnits = [...world.units]
  .sort(compareUnitDrawOrder)
  .filter((unit) => ...circleIntersectsViewport(...));

// src/view/renderWorld.ts:75-83
drawCorpses(... { maxDrawLevel: 39 });
...
drawCorpses(... { minDrawLevel: 40 });
```

Animation rendering also calls `manifest.animations.find`,
`world.pendingAttacks.find/some`, and `world.activeResearch.some` per unit.
Preserve current draw-level and Y-order comparison exactly.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `./node_modules/.bin/tsc --noEmit` | exit 0 |
| Preparation parity | `npm run verify:render-preparation` | exits 0 |
| Runtime smoke | `npm run verify:browser-runtime-smoke` | exits 0 |
| Native viewport | `npm run verify:browser-native-viewport` | exits 0 |
| Determinism | `npm run verify:runtime-determinism` | exits 0 |
| Profiles | Plan 018 `army-100`, `army-200`, `combat-100` | no regression |

## Scope

**In scope**:

- `src/view/renderPreparation.ts` (create)
- `src/view/renderWorld.ts`
- `scripts/verify-render-preparation.mjs` (create)
- `scripts/verify-browser-runtime-smoke.mjs`, summary assertions only
- `package.json`
- `plans/evidence/021.md` and `plans/README.md`

**Out of scope**:

- Pixi object retention/pooling
- HUD, minimap, fog, terrain chunks, or simulation
- Changing visibility rules or draw comparators
- Cross-viewport cache reuse that can mix different camera visibility

## Git workflow

- Suggested branch: `codex/021-render-snapshot`
- Commit pure preparation/parity tests before integrating the renderer.

## Steps

### Step 1: Baseline

Run all existing checks and capture three profiles. Save screenshot hashes or
pixel statistics from the runtime smoke for parity.

### Step 2: Create a pure render snapshot

Create `renderPreparation.ts` with a `prepareWorldRenderSnapshot` function
that, for one world/viewport:

1. builds static `animationById` once per manifest identity;
2. builds `unitById`, `researchByBuildingId`, and
   `pendingAttackBySourceId` once per rendered frame;
3. iterates each entity array once, culls hidden/fogged/off-viewport entries
   before sorting, and sorts only retained entries;
4. partitions the sorted corpse/projectile/effect lists into `below40` and
   `atLeast40` without a second copy/sort.

Do not mutate source arrays. Preserve stable comparator tie-breaking.

**Verify**: parity verifier compares IDs/order/strata against a local copy of
the current algorithm across empty, all-visible, mostly-offscreen, fogged,
equal-Y, and draw-level-boundary fixtures.

### Step 3: Consume the snapshot

Build one snapshot in `renderWorld` per viewport and pass prepared lists/maps
to draw functions. Remove internal copies, sorts, and repeated global
definition/reference scans. Keep drawing output unchanged.

**Verify**: preparation parity, runtime smoke, and native viewport pass.

### Step 4: Measure

Capture the same profiles and record:

- source versus retained entity counts;
- sort counts and items sorted;
- render-preparation p50/p95/p99;
- screenshot/pixel parity.

Write `plans/evidence/021.md`, then run typecheck and determinism.

## Test plan

- Exact ordering parity for all dynamic entity types.
- Off-viewport culling before sort.
- Draw level 39/40 partition.
- Hidden construction, invisible utility, fog, and viewport edges.
- Static manifest index reuse and per-frame dynamic index replacement.
- Split viewport produces independent snapshots.

## Done criteria

- [ ] Complete world arrays are no longer sorted before culling.
- [ ] Effects/corpses/projectiles are sorted once per viewport.
- [ ] Animation/research/attack/unit lookup indexes are prepared once.
- [ ] Visual smoke and viewport tests pass unchanged.
- [ ] Profiles show no regression and evidence is recorded.
- [ ] Only in-scope files changed; README row is DONE.

## STOP conditions

- The parity verifier exposes undocumented array-order dependence.
- Culling requires changing visibility semantics.
- A snapshot is reused across viewports with different bounds.
- Visual smoke changes cannot be attributed to a pre-existing nondeterministic
  capture.

## Maintenance notes

New render-time global lookups belong in the prepared snapshot. Keep static
manifest indexes separate from per-frame world indexes, and never use these
derived maps to drive simulation.
