# Plan 022: Retain World Display Objects

> **Executor instructions:** Execute this Wave 3 plan in an isolated Halla
> worktree only after Plans 018 and 021 are accepted and integrated. Follow
> [the Halla execution policy](HALLA-EXECUTION-POLICY.md) and
> [the performance acceptance contract](PERFORMANCE-ACCEPTANCE.md) unchanged.
> This plan owns renderer-only Pixi retention and cache lifecycle. Extend Plan
> 018's existing tracked create/destroy counters; do not add a competing
> display-object telemetry system. Stop on every STOP condition.
>
> **Drift check:** Run every command and inventory in `Current state` first.
> STOP on an unexplained accepted-base, excerpt, ownership, or dependency drift.

## Status

- **Status:** TODO
- **Wave:** 3 — Structural optimization
- **Priority:** P1
- **Effort:** L
- **Risk:** MEDIUM — retained Pixi lifecycle, visual ordering, and boundedness
- **Depends on:** accepted and integrated Plans 018 and 021
- **Category:** performance, rendering
- **Original planning base:** `8ac0006`, 2026-07-27
- **Roadmap rewrite base:** `d61125e4f8d42b9e7a4dfa544e1c5e52768c69ae`
  (`git rev-parse HEAD` printed the same SHA)

Plan 021's documentation rewrite is not the dependency. The Wave coordinator
must first accept and integrate Plan 021 on top of accepted Plan 018, then
replace the concrete drift SHA and refresh the excerpts, preparation API, and
tracked-constructor inventory below if an integrated seam changed. Never use a
symbolic commit token. Until that concrete refresh and the accepted Plan
018/021 handoffs are present, STOP.

## Why this matters

`renderWorld` currently destroys and recreates most world-layer Pixi objects on
every frame. Allocation, texture binding, scene-graph mutation, and collection
therefore scale with all visible entities even when their visual state is
unchanged. Plan 021 removes unnecessary preparation work; this plan consumes
that accepted prepared snapshot and retains renderer objects without changing
simulation state, visibility, view independence, or draw order.

## Current state

At the concrete rewrite base, Plan 018's existing tracker is the only
display-object lifecycle telemetry:

```ts
// src/performance/displayObjectPerformance.ts:3-9
export type DisplayObjectPerformanceSnapshot = {
  scope: "instrumented-pixi-scene-objects-textures-excluded";
  captureActive: boolean;
  trackedCreated: number;
  trackedDestroyed: number;
  windowLiveDelta: number;
};

// src/performance/displayObjectPerformance.ts:50-53
export function destroyTrackedDisplayObject(object: Container, options?: DestroyOptions): void {
  const destroysChildren = typeof options === "boolean" ? options : Boolean(options?.children);
  if (captureActive) destroyed += destroysChildren ? displayObjectTreeSize(object) : 1;
  object.destroy(options);
}
```

The renderer routes world allocation through `createTrackedContainer`,
`createTrackedGraphics`, `createTrackedSprite`, and `createTrackedText`, and
routes destruction through `destroyTrackedDisplayObject`. The primary and
secondary panes both destroy their unit-layer children before drawing:

```ts
// src/view/renderWorld.ts:74-80
drawMap(mapLayer, world, tileAtlas, viewport);
destroyLayerChildren(unitLayer);
drawCorpses(unitLayer, world, manifest, unitAtlases, viewport, { maxDrawLevel: 39 });
drawLastSeenBuildings(unitLayer, world, manifest, unitAtlases, viewport, { maxDrawLevel: 39 });
drawProjectiles(unitLayer, world, viewport, missileAtlases, { maxDrawLevel: 39 });
drawSpellEffects(unitLayer, world, viewport, missileAtlases, { maxDrawLevel: 39 });
drawUnits(unitLayer, world, manifest, selectedUnitIds, controlGroups, sourceShowOrdersVisible, unitAtlases, missileAtlases, statusDecorationAtlas, viewport);

// src/view/renderWorld.ts:196-203
const viewport = worldViewportForRect(viewCamera, rect);
drawMap(renderer.mapLayer, world, tileAtlas, viewport);
destroyLayerChildren(renderer.unitLayer);
drawCorpses(renderer.unitLayer, world, manifest, unitAtlases, viewport, { maxDrawLevel: 39 });
drawLastSeenBuildings(renderer.unitLayer, world, manifest, unitAtlases, viewport, { maxDrawLevel: 39 });
drawProjectiles(renderer.unitLayer, world, viewport, missileAtlases, { maxDrawLevel: 39 });
drawSpellEffects(renderer.unitLayer, world, viewport, missileAtlases, { maxDrawLevel: 39 });
drawUnits(renderer.unitLayer, world, manifest, selectedUnitIds, args.controlGroups ?? {}, args.sourceShowOrdersVisible === true, unitAtlases, missileAtlases, statusDecorationAtlas, viewport);
```

`WorldUnit`, `WorldCorpse`, `WorldProjectile`, and `WorldSpellEffect` have
stable `id` fields; last-seen buildings use `unitId`. Plan 021 must supply
independent, ordered, culled snapshots for the active and every secondary
viewport before this plan begins.

Run before editing:

```bash
test "$(hostname)" = halla
git merge-base --is-ancestor d61125e4f8d42b9e7a4dfa544e1c5e52768c69ae HEAD
git diff --stat d61125e4f8d42b9e7a4dfa544e1c5e52768c69ae..HEAD -- \
  src/view/renderWorld.ts src/view/renderPreparation.ts \
  src/view/worldRenderCache.ts \
  src/performance/displayObjectPerformance.ts src/main.ts \
  scripts/verify-world-render-cache.mjs \
  plans/021-build-culled-render-snapshots.md \
  plans/022-retain-world-display-objects.md plans/evidence/021.md \
  plans/evidence/022.md
rg -n "prepareWorldRenderSnapshot|destroyLayerChildren|createTracked|destroyTracked|trackedCreated|trackedDestroyed|windowLiveDelta|sourceViewportPaneRenderers" \
  src/view/renderWorld.ts src/view/renderPreparation.ts \
  src/performance/displayObjectPerformance.ts src/main.ts
! git diff -U0 d61125e4f8d42b9e7a4dfa544e1c5e52768c69ae..HEAD -- \
  src/view/renderWorld.ts src/view/worldRenderCache.ts | \
  rg '^\+.*(new (Container|Graphics|Sprite|Text|BitmapText)|\.destroy\()'
```

Expected: the rewrite base is an ancestor; later changes are accepted Plans
018/021 or explained coordinator integration; Plan 021 exposes one independent
ordered snapshot per viewport; and every world constructor/destructor remains
tracked by Plan 018. If accepted upstream work changes a cited seam, the Wave
coordinator must amend this plan with the accepted concrete SHA and refreshed
excerpts/inventory before Plan 022 begins.

## Commands you will need

| Purpose | Command | Expected result |
|---|---|---|
| Host/worktree | `test "$(hostname)" = halla && case "$(pwd -P)" in /home/halla/workspaces/*) ;; *) exit 1 ;; esac && test -f "$(git rev-parse --show-toplevel)/.git" && git status --short --branch` | Halla, linked isolated worktree path, assigned branch, understood status |
| Typecheck | `./node_modules/.bin/tsc --noEmit` | exit 0 |
| New cache-lifecycle verifier (created in Step 1) | `node scripts/verify-world-render-cache.mjs` | ownership, identity, reuse, ordering, bounds, invalidation, disposal, and tracked-counter cases pass |
| Direct Pixi lifecycle additions | `! git diff -U0 d61125e4f8d42b9e7a4dfa544e1c5e52768c69ae..HEAD -- src/view/renderWorld.ts src/view/worldRenderCache.ts \| rg '^\+.*(new (Container\|Graphics\|Sprite\|Text\|BitmapText)\|\.destroy\()'` | no Plan 022-added direct Pixi constructor or `.destroy()` call bypasses Plan 018 wrappers |
| Preparation parity | `node scripts/verify-render-preparation.mjs` | accepted Plan 021 IDs, order, strata, indexes, and view independence remain exact |
| Runtime smoke | `npm run verify:browser-runtime-smoke` | exit 0 under the Halla policy |
| Playable session | `npm run verify:browser-playable-session` | world replacement and gameplay rendering pass |
| Native viewport | `npm run verify:browser-native-viewport` | active/split viewport rendering and disposal pass |
| Determinism | `npm run verify:runtime-determinism` | fixed-tick simulation and save output unchanged |
| Asset gate | `npm run verify:wargus-assets` | exit 0 |
| Build | `npm run build` | exit 0 |
| Performance | accepted Plan 018 `army-100`, `army-200`, and `combat-100` rows at 1280×720 | three valid trials per row; `incrementalReady` passes |

Before implementation, run only the pre-existing typecheck, preparation,
direct-Pixi diff, determinism, asset, and build gates. The new render-cache
verifier does not exist at the Wave 3 base; a missing script/import is not red
evidence. Create it in Step 1, record a meaningful failing assertion against
accepted immediate rendering, then make that same assertion green. Browser
gates run after implementation; captures run serially and never overlap another
executor's capture.

## Scope

**Plan 022 owns:**

- `src/view/worldRenderCache.ts` (new), including renderer-only record,
  dormant-cache, pool, invalidation, and disposal lifecycle;
- `src/view/renderWorld.ts`, only consumption of accepted Plan 021 snapshots
  and retained world-object reconciliation;
- `scripts/verify-world-render-cache.mjs` (new); and
- `plans/evidence/022.md`.

**Out of scope:**

- `WorldState`, simulation, gameplay, saves, hashes, unit mutation, visibility
  rules, draw comparators, Plan 021 preparation semantics, or snapshot reuse
  across viewports;
- map, terrain, fog, minimap, HUD, cursor, selection-hit-area, or generic Pixi
  retention; Plan 025 owns visibility/fog dirtying;
- changing texture ownership/destruction, array-position identity, sharing
  mutable Pixi objects between views, or manual/second renders;
- independently editing `src/main.ts`,
  `src/performance/displayObjectPerformance.ts`, `package.json`,
  `plans/README.md`, or an existing shared verifier; and
- weakening a budget, trial count, fingerprint, renderer, visual, heap,
  determinism, or evidence requirement.

The Wave coordinator owns shared `main`, performance-schema, package-script,
and roadmap integration. Plan 022 defines the namespaced extension and
renderer call-site tags; the coordinator integrates them after the isolated
branch is accepted. The branch must not invent local create/destroy totals to
work around that boundary.

## Git workflow

- Branch from the accepted Wave 3 start into an isolated `plan-022` worktree.
- Commit cache/lifecycle parity before migrating entity kinds, then commit one
  entity-kind migration at a time.
- Do not merge Plan 023, edit simulation occupancy files, resolve shared
  `main`/performance-schema/package/index conflicts, push, deploy, or open a PR
  unless instructed.

## Shared interfaces and ownership

- The accepted Plan 018 handoff supplies the normalized matrix,
  profile-definition hash, initial entity/effect fingerprint, environment
  identity, raw baseline directory, checksums, worst-trial row results, and
  `trackedCreated`/`trackedDestroyed`/`windowLiveDelta` baseline. These are
  read-only inputs and their aggregate meaning and
  `instrumented-pixi-scene-objects-textures-excluded` scope do not change.
- The accepted Plan 021 handoff supplies one pure, ordered, culled prepared
  snapshot per viewport, exact stable IDs, draw strata, visual reference
  artifacts, and preparation parity. Plan 022 consumes but does not mutate,
  cache across viewports, or redefine that snapshot.
- `HALLA-EXECUTION-POLICY.md` governs Halla/browser execution, exact-owned
  process cleanup, serial captures, and durable artifacts.
- `PERFORMANCE-ACCEPTANCE.md` governs renderer/viewport qualification, trial
  lifecycle, fingerprints, statistics, invalid/replacement rules, and budgets.
- Plan 022 exclusively owns renderer objects and their caches. Plan 023 owns
  simulation occupancy/passability/order mutation surfaces and cannot import
  or inspect this cache.
- Existing preparation/browser/determinism verifiers are read-only gates.
  Shared integration belongs to the coordinator.

The coordinator-owned extension of the existing Plan 018 counter uses one
namespace, `plan022.worldRenderCache`, and the renderer kinds `unit`,
`lastSeenBuilding`, `corpse`, `projectile`, and `spellEffect`. It reports
per-kind created, reused, destroyed, active, dormant, and pooled values through
the existing capture/reset/snapshot lifecycle while preserving the aggregate
fields exactly. Cache state may be inspected by the focused verifier, but it
must not maintain competing create/destroy totals.

## Cache ownership and bounds

Each rendered viewport owns exactly one cache keyed by its view owner and
current `WorldState` identity. Mutable display objects are never shared. A
record owns its root container and every sprite, graphics, text, decoration,
bar, and marker child for one prepared entity.

| Kind | Stable key | Active bound | Dormant bound per view | Pool bound per view | Retirement rule |
|---|---|---:|---:|---:|---|
| Unit | `unit.id` | prepared visible-unit count | 256 LRU records | 0 | cull/hide detaches to dormant; removal/death destroys immediately |
| Last-seen building | `unitId` | prepared visible-last-seen count | 128 LRU records | 0 | disappearance destroys; cull detaches to dormant |
| Corpse | `corpse.id` | prepared visible-corpse count | 64 LRU records | 0 | expiry/removal destroys; cull detaches to dormant |
| Projectile | `projectile.id` | prepared visible-projectile count | 64 LRU records | 64 reset records | removal recycles only an exact reset-compatible shape, otherwise destroys |
| Spell effect | `effect.id` | prepared visible-effect count | 64 LRU records | 64 reset records | expiry/removal recycles only an exact reset-compatible shape, otherwise destroys |

Active records may never exceed the corresponding prepared list. Bounds are
hard caps: evict the oldest dormant record and destroy overflow; destroy pool
overflow immediately. A pool key includes the complete child shape and
atlas/texture ownership class. Pooling is disabled for a kind until its reset
contract proves every transform, anchor, scale, texture, tint, alpha,
visibility, mask/filter, graphics geometry/style, text, event, and parent
reference is reset. Pools never own textures.

World replacement, map load/restart, renderer teardown, view closure, and
fatal render reset synchronously detach and destroy every active, dormant, and
pooled record for that exact owner. Reducing viewport count disposes removed
view caches rather than merely hiding them. Invalidation never reaches another
view's objects.

## Steps

### Step 0: Prove the entry gate and freeze the baseline

Confirm Plans 018 and 021 are `DONE-VERIFIED`, their acceptance commits are
integrated, and durable assigned-row baselines, checksums, fingerprints,
visual references, preparation results, and tracked display-object values
resolve on Halla. Run the refreshed drift checks and all pre-existing
non-browser baseline commands. Record `scripts/verify-world-render-cache.mjs`
as absent and not run; if it already exists without an accepted plan refresh,
STOP. Inventory every tracked constructor/destructor in the accepted renderer.

The direct-lifecycle diff scan must return no matches; the wrapper-name
inventory alone is not evidence that bypass calls are absent. Preserve both
outputs in the baseline record.

**Verify:** dependency, ancestry, drift, preparation API, stable IDs,
checksums/fingerprints, display-object scope, visual reference, host policy,
and baseline gates are green.

### Step 1: Add a per-view cache and focused lifecycle oracle

Create a loadable renderer-cache decision shell and
`scripts/verify-world-render-cache.mjs` first. A stable-identity,
zero-steady-state-creation, bound, or disposal fixture must execute and fail
against accepted immediate rendering for the intended behavior-level reason;
`MODULE_NOT_FOUND`, an import error, or a missing file is not acceptable RED
evidence. Preserve that output, then implement until the same fixture and the
full verifier are green.

Create the renderer-local cache and a pure reconciliation decision layer.
Given a prior cache and Plan 021 prepared IDs/order, it returns create, reuse,
detach, reattach, retire, reorder, and destroy actions. Apply the ownership,
bounds, invalidation, and disposal table exactly. Use only Plan 018 tracked
constructors and `destroyTrackedDisplayObject`; direct Pixi construction and
direct `.destroy()` are forbidden.

The focused verifier must also scan the final Plan 022-owned renderer/cache
sources and fail on any direct Pixi constructor or direct `.destroy()` outside
the accepted Plan 018 wrapper module.

Add focused fixtures for independent worlds/views, stable identity, ID reuse
after world replacement, LRU eviction, pool reset/overflow, complete disposal,
and resettable counter capture. Define renderer call-site kind tags for the
coordinator-owned extension of Plan 018's existing counters.

**Verify:** action ordering and bounds are deterministic; disposal returns
active/dormant/pool counts to zero; Plan 018 aggregate creation/destruction
still equals tracked tree sizes; no second telemetry accumulator exists.

### Step 2: Retain units and preserve prepared order

Migrate unit records first. The entire unit visual—including sprite/fallback
geometry, shadow, health/mana/construction bars, selected/control-group/order
markers, ranges, status decorations/effects, carried resources, burning
effects, and teleport line—belongs to the unit record. Update every observable
property from current prepared/render input; a signature may skip work only
when fixtures prove it complete.

Attach roots in exact Plan 021 order. Reorder children without recreating them
and preserve stable equal-key order. A unit leaving the prepared list detaches
immediately; cull/hide may enter dormant, while actual removal/death destroys.
Re-entry reuses the same record while it remains dormant.

**Verify:** immediate-render reference output matches IDs, child order,
strata, selected states, animation/action/frame, transforms, and pixels across
stationary, moving, damaged, constructing, hidden, transported, dead, removed,
teleporting, equal-order, cull exit/re-entry, and split-view fixtures. After
warm-up, 300 unchanged frames create zero unit display objects in every view.

### Step 3: Retain the remaining prepared entity kinds

Migrate last-seen buildings, corpses, projectiles, and spell effects one kind
at a time. Preserve the Plan 021 below-40/unit/at-least-40 draw sequence and
existing interpolation, visibility, texture/frame, and fallback graphics.
Enable projectile/effect pooling only after the full reset fixture passes.

After each kind, run focused parity and record per-kind existing-counter
created/reused/destroyed evidence. Do not absorb map, fog, HUD, or overlays.

**Verify:** mixed combat preserves order and pixels; stable IDs keep object
identity; births/entrances create, exits detach or retire by the table, and
five minutes of deterministic churn never exceed a dormant or pool cap.

### Step 4: Integrate explicit disposal and existing-counter extensions

Expose exact renderer-owned disposal hooks for world replacement, restart,
renderer teardown, fatal render reset, and viewport closure. The Wave
coordinator wires shared `main` lifecycle calls and the namespaced per-kind
extension into Plan 018's existing capture/reset/snapshot path. Aggregate
fields/scope stay unchanged, and no normal-frame full-layer destruction
remains for migrated kinds.

**Verify:** every seam destroys only its exact owner; repeated load/restart and
viewport-count cycles return cache and live-delta values to zero; tracked
totals include all retained creations and final destruction.

### Step 5: Revalidate visual behavior and measure

Run every command in the table. Compare exact screenshot hashes when byte
stability is available and otherwise retain before/after images and existing
pixel statistics without inventing a tolerance. Capture three independent
valid trials per assigned row using the accepted Plan 018 environment,
profile, viewport, warmup, duration, fingerprints, per-trial statistics, and
worst-trial rule. Do not pool samples.

Require `incrementalReady`. A greater-than-5% worsening of worst-trial frame
p95 is also a regression. Zero steady-state creation for unchanged prepared
IDs is required after warm-up; creation may scale only with entrances, births,
record-shape changes that cannot be updated, and bounded-pool misses.

**Verify:** visual/preparation/determinism gates, bounds, and counter semantics
hold; `incrementalReady` passes; evidence is durable and checksum-verified.

## Test plan

- A recorded meaningful RED followed by GREEN for the new verifier; load/import
  failure does not qualify.
- Reconcile create/reuse/update/detach/reattach/retire/reorder/destroy actions.
- Exact Plan 021 IDs/order/strata/first-match preparation and view independence.
- One-, 300-, and many-frame unchanged identity/zero-creation fixtures.
- Unit signatures and every nested marker/bar/effect property.
- Stable-key reuse, duplicate-key STOP, and key reuse only after world disposal.
- Cull/hide/transport/death/removal/expiry distinctions for every kind.
- Hard bounds, deterministic LRU eviction, full pool reset, overflow destroy.
- Primary/split view closure, world replacement/restart/teardown disposal.
- Plan 018 aggregate and namespaced per-kind reset/snapshot parity; every Pixi
  constructor/destructor stays tracked and textures remain excluded.
- Static final-source and added-line checks rejecting direct Pixi construction
  or `.destroy()` in Plan 022-owned renderer/cache paths.
- Screenshot/pixel, browser, fixed-tick/save, heap, and performance parity.

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
.artifacts/performance/022/<commit>/<UTC-stamp>/
```

Include accepted Plan 018/021 artifact/checksum references, environment,
profile-definition and initial entity/effect fingerprints, one JSON per trial,
normalized summaries, preparation/visual parity, per-kind active/dormant/pool
high-water marks, eviction/reset/disposal, existing aggregate and namespaced
counter results, determinism/focused tests, the focused verifier's meaningful
RED/GREEN output, controller/resource records, invalid/replacement records, and SHA-256 checksums. Include the wrapper
inventory and negative direct-Pixi added-line/final-source scan outputs;
wrapper-name presence alone is insufficient. Independently recompute new
checksums and verify every baseline reference.

Commit only concise normalized results to the single evidence file
`plans/evidence/022.md`; do not create `plans/evidence/022/`, and do not rely
on `/tmp` as durable evidence.

## Done criteria

- [ ] Accepted Plans 018/021 and durable handoffs are integrated and verified.
- [ ] The new verifier has a recorded behavior-level RED and GREEN; no missing
  file/import result is counted as RED.
- [ ] Every viewport has an independent world-identity cache consuming one
  accepted Plan 021 snapshot.
- [ ] Stable IDs retain object identity and exact draw order/strata.
- [ ] Every kind follows frozen bounds/retirement and all disposal seams clear.
- [ ] Unchanged visible entities produce zero steady-state creation after warm-up.
- [ ] Plan 018's existing tracked create/destroy counters are extended with
  namespaced per-kind results; aggregate fields/scope remain unchanged and no
  competing telemetry exists.
- [ ] Preparation, visual/pixel, focused lifecycle, browser, determinism,
  assets, build, heap, and disposal parity pass.
- [ ] Added-line and final-source scans prove no direct Pixi constructor or
  `.destroy()` bypass exists in Plan 022-owned renderer/cache paths.
- [ ] the `incrementalReady` verdict is satisfied with durable,
  checksum-verified evidence in `plans/evidence/022.md`.
- [ ] The branch contains only Plan 022-owned files; coordinator
  `main`/performance-schema/package/README integration is separate.

## STOP conditions

- Plans 018/021 are not accepted/integrated, or baselines, checksums,
  fingerprints, preparation, visual references, and counters cannot be verified.
- Drift, excerpts, stable IDs, tracked wrappers, or preparation seams differ
  without a coordinator refresh.
- A kind lacks a stable key, duplicates within one prepared list, or needs
  array-position keys.
- Correctness requires preparation/simulation/save/visibility/comparator
  changes, shared Pixi objects, texture destruction, or a second render.
- Exact ID/order/strata, animation/frame, markers, or pixels cannot match.
- A reset property is missing, a bound is exceeded, disposal leaks, or an
  unchanged entity creates after warm-up.
- Aggregate counter meaning/scope changes, a constructor/destructor becomes
  untracked, or competing create/destroy counters appear.
- An owned edit reaches simulation, `main`, performance schema, `package.json`,
  `plans/README.md`, or a shared verifier before coordinator integration.
- The new verifier cannot produce a meaningful behavior-level RED before GREEN.
- Any focused, preparation, type, browser, determinism, asset, or build gate
  fails twice.
- Halla/browser qualification fails, another capture is active, a trial
  exhausts replacement, a new budget-failure key appears, or frame p95
  regresses over 5%.
- Durable single-file evidence or checksums cannot be verified.

## Rollback

Rollback per kind in reverse migration order: spell effects, projectiles,
corpses, last-seen buildings, units. Return only that unaccepted kind to Plan
021's prepared immediate renderer; keep accepted kinds, Plan 018 wrappers, and
Plan 021 preparation. Remove its counter tag only after it no longer retains
objects. If shared disposal/counter integration is unsafe, revert only that
integration commit and then unaccepted cache commits. A full rollback restores
Plan 021's tracked per-frame renderer. Preserve failed/invalid evidence and
other waves. Stop only exact owned processes; remove only exclusive artifacts.

## Maintenance notes

New retained kinds require a stable key, ownership/bounds row, complete reset
contract, preparation/pixel parity, existing-counter tag, disposal coverage,
and rollback boundary. Keep caches renderer-local and per-view. All Pixi
allocation/destruction continues through Plan 018's tracker.
