# Plan 021: Cull Before Sorting And Build Prepared Render Snapshots

> **Executor instructions:** Execute this Wave 2 plan in an isolated Halla
> worktree only after Plan 018 is accepted and integrated. Follow
> [the Halla execution policy](HALLA-EXECUTION-POLICY.md) and
> [the performance acceptance contract](PERFORMANCE-ACCEPTANCE.md) unchanged.
> This plan is render preparation only. Preserve Plan 018 display-object
> create/destroy instrumentation and do not consume Plan 020's simulation
> index. Stop on every STOP condition.
>
> **Drift check:** Run every command and inventory in `Current state` first.
> STOP on an unexplained accepted-base, excerpt, ownership, or dependency drift.

## Status

- **Status:** DONE-VERIFIED — INCREMENTAL
- **Acceptance authority:** `WAVE-2-RECOVERY-AMENDMENT Tasks 1–6`
- **Evidence:** [021](evidence/021.md)
- **Wave:** 2 — Independent hot paths
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM — visual ordering and viewport parity
- **Depends on:** accepted and integrated Plan 018 only
- **Category:** performance, rendering
- **Original planning base:** `8ac0006`, 2026-07-27
- **Roadmap rewrite base:** `d4ad3868d5d0df9f1fa20e83cbc9f19a90b94aed`
  (`git rev-parse --short HEAD` printed `d4ad386`)

Plan 020 is not a dependency. Plan 021 must build its own render-only,
per-viewport `unitById` map and must not import, expose, or consume Plan 020's
simulation index. Plan 018's documentation rewrite is also not the entry gate:
the Wave 1 coordinator must accept and integrate Plan 018, then refresh the
concrete drift SHA and excerpts below if a cited seam changed. Never substitute
a symbolic commit token. Until the accepted Plan 018 commit and baseline
handoff are concrete and present, STOP.

## Why this matters

`renderWorld` currently copies and sorts complete entity arrays before culling,
and corpse/projectile/effect arrays repeat that work for two draw strata.
Visible-unit rendering also repeats manifest, research, pending-attack, and unit
ID scans. A pure snapshot prepared independently for each viewport can cull
before sort and share render-only indexes without altering simulation or Pixi
object lifecycle.

## Current state

At the concrete rewrite base, the post-Plan-018 renderer has these exact seams:

```ts
// src/view/renderWorld.ts:534-543
const visibleUnits = [...world.units]
  .sort(compareUnitDrawOrder)
  .filter((unit) => (
    !isUnitHiddenInConstruction(unit)
    && !isInvisibleUtilityUnit(unit)
    && !isUnitInsideResourceSource(unit)
    && isUnitVisibleToPlayer(world, unit, world.visibilityPlayer)
    && circleIntersectsViewport(unit.x, unit.y, Math.max(unit.radius + 96, unit.frameWidth, unit.frameHeight), viewport)
  ));

// src/view/renderWorld.ts:76-84
drawCorpses(unitLayer, world, manifest, unitAtlases, viewport, { maxDrawLevel: 39 });
drawLastSeenBuildings(unitLayer, world, manifest, unitAtlases, viewport, { maxDrawLevel: 39 });
drawProjectiles(unitLayer, world, viewport, missileAtlases, { maxDrawLevel: 39 });
drawSpellEffects(unitLayer, world, viewport, missileAtlases, { maxDrawLevel: 39 });
drawUnits(unitLayer, world, manifest, selectedUnitIds, controlGroups, sourceShowOrdersVisible, unitAtlases, missileAtlases, statusDecorationAtlas, viewport);
drawLastSeenBuildings(unitLayer, world, manifest, unitAtlases, viewport, { minDrawLevel: 40 });
drawCorpses(unitLayer, world, manifest, unitAtlases, viewport, { minDrawLevel: 40 });
drawProjectiles(unitLayer, world, viewport, missileAtlases, { minDrawLevel: 40 });
drawSpellEffects(unitLayer, world, viewport, missileAtlases, { minDrawLevel: 40 });

// repeated render-only scans
manifest.animations.find((candidate) => candidate.id === unit.animation);
world.pendingAttacks.find((attack) => attack.sourceId === unit.id);
world.activeResearch.some((research) => research.buildingId === unit.id);
world.units.find((candidate) => candidate.id === unit.teleportDestinationId);
```

Each legacy `.find(...)` returns the earliest matching source-array entry.
`pendingAttacks` is appended in multiple launch paths and has no documented
unique-`sourceId` invariant, so prepared indexes must define collision behavior
rather than relying on uniqueness or default last-write-wins map construction.

Plan 018 routes scene-object allocation/destruction in this file through
`createTrackedContainer`, `createTrackedGraphics`, `createTrackedSprite`,
`createTrackedText`, and `destroyTrackedDisplayObject`. Its counters report
`trackedCreated`, `trackedDestroyed`, and `windowLiveDelta` with scope
`instrumented-pixi-scene-objects-textures-excluded`. Those calls, counter
meaning, and scope must remain unchanged.

Run before editing:

```bash
test "$(hostname)" = halla
git merge-base --is-ancestor d4ad3868d5d0df9f1fa20e83cbc9f19a90b94aed HEAD
git diff --stat d4ad3868d5d0df9f1fa20e83cbc9f19a90b94aed..HEAD -- \
  src/view/renderWorld.ts src/view/renderPreparation.ts \
  src/performance/displayObjectPerformance.ts \
  scripts/verify-render-preparation.mjs \
  plans/021-build-culled-render-snapshots.md plans/evidence/021.md
rg -n "compareUnitDrawOrder|drawCorpses|drawProjectiles|drawSpellEffects|circleIntersectsViewport|manifest\.animations\.find|pendingAttacks\.(find|some)|activeResearch\.(find|some)|world\.units\.find|createTracked|destroyTracked" \
  src/view/renderWorld.ts src/performance/displayObjectPerformance.ts
```

Expected: the rewrite base is an ancestor; later changes are the accepted Plan
018 integration or explained coordinator integration; the sort/cull, repeated
lookup, and tracked display-object seams are reconciled. If accepted Plan 018
changes a cited seam, the Wave 1 coordinator must amend this plan with its
accepted concrete SHA and refreshed exact excerpts before Plan 021 begins.

## Commands you will need

| Purpose | Command | Expected result |
|---|---|---|
| Host/worktree | `test "$(hostname)" = halla && git status --short --branch` | Halla, assigned isolated branch, understood status |
| Typecheck | `./node_modules/.bin/tsc --noEmit` | exit 0 |
| New preparation-parity verifier (created in Step 1) | `node scripts/verify-render-preparation.mjs` | IDs, order, strata, viewports, indexes, counters, and diagnostics pass |
| Runtime smoke | `npm run verify:browser-runtime-smoke` | exit 0 under the Halla policy |
| Native viewport | `npm run verify:browser-native-viewport` | single/split viewport behavior passes |
| Determinism | `npm run verify:runtime-determinism` | fixed-tick simulation/save output unchanged |
| Asset gate | `npm run verify:wargus-assets` | exit 0 |
| Build | `npm run build` | exit 0 |
| Performance | accepted Plan 018 `army-100`, `army-200`, and `combat-100` rows at 1280×720 | exactly seven valid trials per row; `incrementalReady` passes |

Before implementation, run only the pre-existing typecheck, determinism, asset,
and build gates. The new preparation verifier does not exist at the Wave 2
base; a missing script/import is not red evidence. Create it in Step 1, record a
meaningful failing assertion against accepted immediate rendering, then make
that same assertion green. Browser gates run after implementation; performance
captures run serially and never overlap another plan's capture.

## Scope

**Plan 021 owns:**

- `src/view/renderPreparation.ts` (new);
- `src/view/renderWorld.ts`, render preparation and prepared-list/index
  consumption only;
- `scripts/verify-render-preparation.mjs` (new); and
- `plans/evidence/021.md`.

**Out of scope:**

- simulation, gameplay, `world.ts`, `orders.ts`, `passability.ts`, Plan 020's
  index, saves, deterministic state, or entity-array mutation;
- Pixi object retention, pooling, lifecycle redesign, terrain/fog/minimap/HUD
  caching, visibility semantics, draw comparator changes, or cross-viewport
  snapshot reuse;
- changes to `src/performance/displayObjectPerformance.ts`, existing browser
  verifiers, Plan 018 metric/counter schemas, or another plan's evidence; and
- weakening any budget, fingerprint, renderer, validity, pixel, or
  determinism requirement.

The Wave coordinator owns `package.json` integration and `plans/README.md`
integration. The Plan 021 branch must not edit either file.

## Git workflow

- Branch from the accepted Wave 2 start into an isolated `plan-021` worktree.
- Commit pure preparation/parity work before renderer consumption.
- Do not merge Plan 020, import its selector, resolve shared package/index
  conflicts, push, deploy, or open a PR unless instructed.

## Shared interfaces and ownership

- The accepted Plan 018 handoff supplies the normalized matrix, initial
  profile-definition hash, initial entity/effect fingerprint, environment
  identity, raw baseline directory, checksums, worst-trial row results, and
  tracked display-object counter baseline. They are read-only inputs.
- `HALLA-EXECUTION-POLICY.md` governs Halla/browser execution, process
  ownership, serial captures, and durable artifacts.
- `PERFORMANCE-ACCEPTANCE.md` governs renderer/viewport qualification, trials,
  fingerprints, statistics, replacement limits, and budgets.
- Plan 021 exclusively owns render-only prepared snapshots and
  `renderWorld.ts`. Plan 019 owns terrain metadata and passability/FOV consumer
  seams. Plan 020 owns simulation ID lookup and `orders.ts`; none of its APIs
  are consumed here.
- Existing runtime-smoke/native-viewport verifiers are read-only gates.
  Shared-verifier integration belongs to the coordinator.

## Steps

### Step 0: Prove the entry gate and freeze the baseline

Confirm Plan 018 is `DONE-VERIFIED`, its acceptance commit is integrated, and
the durable `army-100`, `army-200`, and `combat-100` baseline artifacts and
checksums resolve on Halla. Record environment identity, profile-definition
hash, initial entity/effect fingerprint, per-trial/worst-trial results, visual
reference artifacts, and `trackedCreated`/`trackedDestroyed`/
`windowLiveDelta` values. Run drift and all pre-existing non-browser baseline
gates. Record `scripts/verify-render-preparation.mjs` as absent and not run; if
it already exists without an accepted plan refresh, STOP.

**Verify:** dependency, ancestry, drift, checksums, fingerprints, display-object
scope, host policy, and pre-existing baseline gates are green. Plan 020 is neither integrated
nor required for this entry gate.

### Step 1: Build a pure per-viewport snapshot

Create a loadable preparation API shell and
`scripts/verify-render-preparation.mjs` first. A cull-before-sort, sort-count, or
repeated-key first-match fixture must execute and fail against the immediate
legacy path for the intended behavior-level reason; `MODULE_NOT_FOUND`, an
import error, or a missing file is not acceptable RED evidence. Preserve that
output, then implement until the same fixture and the full verifier are green.

Create `prepareWorldRenderSnapshot(world, manifest, viewport)` that does not
mutate source arrays or world state. For each invocation:

1. build or reuse an immutable `animationById` cache keyed only by manifest
   identity;
2. build fresh render-only `unitById`, `researchByBuildingId`, and
   `pendingAttackBySourceId` indexes from the authoritative arrays;
3. iterate units, corpses, projectiles, and spell effects once per viewport,
   applying the exact current hidden/fog/visibility/viewport rules before sort;
4. preserve existing stable draw comparators and array-order tie behavior; and
5. partition each already sorted corpse/projectile/effect list at draw level
   40 into `below40` and `atLeast40`, without a second source copy or sort.

Every index that replaces a legacy `.find(...)` scan must preserve its
first-match result. Build `animationById`, `unitById`,
`researchByBuildingId`, and `pendingAttackBySourceId` in source-array order
with first-write-wins insertion (`if (!index.has(key)) index.set(key, value)`).
Do not use a map constructor or unconditional `set` that lets a later duplicate
overwrite the first. A boolean membership structure replacing `.some(...)` may
deduplicate keys only when no selected record or ordering is observable.

Each source viewport gets an independent snapshot, including the active
viewport. Do not retain dynamic snapshot data across frames or viewports. Do
not import `worldSelectors` or consume Plan 020's index.

Add resettable plan-local diagnostics with these exact namespaces:

- `plan021.renderPreparation.sourceCounts`
- `plan021.renderPreparation.retainedCounts`
- `plan021.renderPreparation.sortCounts`
- `plan021.renderPreparation.sortedItems`
- `plan021.renderPreparation.snapshotCount`

Diagnostics remain outside world/save/deterministic state and the Plan 018
summary schema. Focused verification/evidence may read them; shared capture
wiring is coordinator-owned.

**Verify:** a reference implementation of the current algorithm matches exact
IDs, order, strata, first-match lookup selections, chosen animation/action/frame,
and rendered results across every focused fixture. Mostly-offscreen fixtures
prove culling occurs before sorting, while repeated-key fixtures prove later map
entries never replace the record legacy `.find(...)` would select.

### Step 2: Consume one prepared snapshot per viewport

Prepare one snapshot before the draw sequence for each viewport and pass its
lists/maps into draw functions. Remove only the superseded internal copies,
sorts, and repeated exact-key scans. Preserve draw call order, comparator
functions, visual interpolation, visibility predicates, sprite/graphics
creation, and all tracked create/destroy wrappers.

The snapshot contains data only. It must not retain Pixi objects, create a
second/manual render, change destruction timing, or change the Plan 018
display-object scope/counter calculations.

**Verify:** preparation parity, runtime smoke, native viewport, and a focused
counter assertion pass. The source diff contains no Plan 020 import and no
untracked Pixi constructor/destructor replacement.

### Step 3: Prove visual and viewport parity

Compare deterministic screenshot hashes when byte stability is available and
otherwise store before/after images and pixel statistics. Do not invent a
tolerance: any unexplained visual difference or existing-verifier failure is a
STOP. Cover empty, all-visible, mostly-offscreen, fogged, hidden construction,
invisible utility, resource-contained units, equal-Y and equal-draw-order
units, draw levels 39/40, viewport edges, and split viewports.

**Verify:** exact entity draw IDs/order/strata match the reference algorithm,
each viewport snapshot is independent, and visual/pixel parity passes without a
new or relaxed tolerance.

### Step 4: Revalidate and measure

Run every command in the table. Capture exactly seven independent valid trials for each
assigned row with the exact accepted Plan 018 environment, specification,
viewport, warmup, duration, fingerprints, and statistics. Preserve every trial
raw-frame sample. Record source/retained/sorted counts, render-preparation
distributions, pixel evidence, and the unchanged Plan 018 display-object
counters. Require `incrementalReady`: both the median of seven per-trial frame
p95 values and the nearest-rank p95 pooled from all raw after-frame samples must
be no greater than 5% above their accepted-baseline counterparts at 0.1 ms
decision precision.

**Verify:** all gates and the `incrementalReady` verdict pass, counter semantics are unchanged, and
evidence is durable and checksum-verified.

## Test plan

- A recorded meaningful RED followed by GREEN for the new verifier; load/import
  failure does not qualify.
- Exact current ordering parity for units, corpses, projectiles, effects, and
  both draw strata, including stable equal-key ties.
- Cull-before-sort proof for hidden, fogged, off-viewport, and edge candidates.
- Draw-level 39/40 partition without repeated source copy/sort.
- Static manifest cache identity and fresh per-frame/per-viewport dynamic maps.
- Independent active and split-view snapshots with no cross-viewport reuse.
- Render-only `unitById`; no import or behavior dependency on Plan 020.
- Repeated pending attacks with the same `sourceId` but different targets and
  `remainingSeconds`: `pendingAttackBySourceId` selects the first record and
  produces the same attack animation cursor/frame as legacy `.find`.
- Repeated unit IDs with distinct position, visibility, and animation-relevant
  data: `unitById` selects the first unit and produces the same teleport line,
  chosen animation, frame, and rendered result as the legacy unit scan.
- Repeated animation IDs and research building IDs select the first source
  record, including the same animation/action/frame and research render result.
- Screenshot or pixel parity under the same renderer/viewport.
- Plan 018 tracked creation/destruction/live-delta values and instrumentation
  scope remain comparable and all constructors/destructors remain tracked.
- Namespaced diagnostics reset and count only Plan 021 preparation.

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
.artifacts/performance/021/<commit>/<UTC-stamp>/
```

Include accepted Plan 018 baseline directory/checksum references, environment
comparison, profile-definition and initial entity/effect fingerprints, one
JSON per trial, normalized summaries, source/retained/sort diagnostics,
render-preparation distributions, before/after visual artifacts and pixel
results, display-object counter comparison, determinism/focused-test results, the
focused verifier's meaningful RED/GREEN output, controller/resource records, invalid/replacement records, and SHA-256
checksums. Independently recompute new checksums and verify baseline references.
Commit only concise normalized results to `plans/evidence/021.md`; `/tmp` is
not durable evidence.

## Done criteria

- [ ] Accepted Plan 018 integration and durable assigned baselines are
  verified; Plan 020 is not an entry dependency.
- [ ] The new verifier has a recorded behavior-level RED and GREEN; no missing
  file/import result is counted as RED.
- [ ] Hidden/fogged/off-viewport candidates are culled before sorting.
- [ ] Each entity list is sorted once per viewport and partitions preserve
  exact draw order and level-39/40 behavior.
- [ ] Every viewport uses an independent render-only prepared snapshot.
- [ ] Every prepared index that replaces `.find(...)` is first-write-wins and
  repeated-key fixtures prove selected-record and downstream render parity.
- [ ] No simulation index, save state, gameplay behavior, visibility rule,
  comparator, Pixi lifecycle, or cross-viewport cache coupling exists.
- [ ] Visual/pixel parity and Plan 018 display-object counter semantics pass.
- [ ] Typecheck, preparation, runtime smoke, native viewport, determinism,
  assets, and build pass.
- [ ] the `incrementalReady` verdict is satisfied with durable,
  checksum-verified evidence.
- [ ] The branch contains only Plan 021-owned files; coordinator integration is
  pending or complete separately.

## STOP conditions

- Plan 018 is not accepted/integrated, or its baselines,
  checksums/fingerprints, visual reference, counter values, and environment
  cannot be verified.
- Drift, excerpts, comparator, visibility, or instrumentation seams differ
  without a concrete coordinator refresh.
- A prepared map selects a later duplicate than the corresponding legacy
  `.find(...)`, or repeated keys change the selected animation/action/frame,
  teleport line, research result, or any other rendered output.
- Correct preparation requires Plan 020, simulation/save changes, visibility or
  comparator changes, cross-viewport reuse, retained Pixi objects, or a second
  render.
- Exact ID/order/strata parity, visual/pixel parity, independent viewport
  snapshots, or tracked display-object counter semantics cannot be preserved.
- An owned edit reaches `orders.ts`, `world.ts`, `passability.ts`,
  `displayObjectPerformance.ts`, an existing shared verifier, `package.json`,
  or `plans/README.md`.
- The new verifier cannot produce a meaningful behavior-level RED before GREEN.
- Any focused, type, browser, determinism, asset, or build gate fails twice.
- Halla/browser qualification fails, another capture is active, a trial
  exhausts its replacement, a new budget-failure key appears, or frame p95 regresses
  by more than 5%.
- Durable evidence or checksums cannot be produced and verified.

## Rollback

Revert only the unaccepted Plan 021 preparation and renderer-consumption
commits. Restore prepared immediate rendering: the legacy per-draw copies,
sorts, culls, exact-key scans, and draw sequence, while keeping Plan 018's
tracked create/destroy wrappers and counter semantics intact. Preserve
failed/invalid evidence, accepted Plan 018, and other Wave 2 work. Stop only
exact owned processes; remove only an artifact directory proven exclusive to
the rolled-back attempt.

## Maintenance notes

New render-only exact-key lookups belong in the per-viewport snapshot. Every
selected-record index must remain source-ordered and first-write-wins unless a
focused invariant proves keys unique and the plan is amended. Static manifest
indexes may be identity-cached; dynamic world indexes may not cross frames or
viewports. Keep simulation selectors, Pixi lifecycle, and persistent state
outside this module.
