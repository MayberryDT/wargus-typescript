# Plan 020: Replace Hot Linear Unit Lookups With A Transient ID Index

> **Executor instructions:** Execute this Wave 2 plan in an isolated Halla
> worktree only after Plan 018 is accepted and integrated. Follow
> [the Halla execution policy](HALLA-EXECUTION-POLICY.md) and
> [the performance acceptance contract](PERFORMANCE-ACCEPTANCE.md) unchanged.
> Preserve `world.units` as the authoritative ordered array and exclude the
> derived index from saves and renderer APIs. Stop on every STOP condition.
>
> **Drift check:** Run every command and inventory in `Current state` first.
> STOP on an unexplained accepted-base, excerpt, ownership, or dependency drift.

## Status

- **Status:** TODO
- **Wave:** 2 — Independent hot paths
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM — transient cache invalidation
- **Depends on:** accepted and integrated Plan 018
- **Category:** performance, simulation
- **Original planning base:** `8ac0006`, 2026-07-27
- **Roadmap rewrite base:** `d4ad3868d5d0df9f1fa20e83cbc9f19a90b94aed`
  (`git rev-parse --short HEAD` printed `d4ad386`)

Plan 018's documentation rewrite is not the dependency. The Wave 1 coordinator
must first accept and integrate Plan 018, then refresh the concrete drift SHA
and mutation inventory below if that integration changed a cited seam. Never
put a symbolic commit token into this executable plan. Until the accepted Plan
018 commit and baseline handoff are concrete and present, STOP.

## Why this matters

Combat, projectiles, pending attacks, commands, and order execution repeatedly
resolve stable unit IDs with full `world.units.find` scans. A transient
per-world index makes exact ID lookup constant-time while preserving array
order wherever iteration or first-match behavior is semantically significant.

## Current state

At the concrete rewrite base, the post-Plan-018 hot wrapper is:

```ts
// src/simulation/orders.ts:11338-11340
function findUnit(world: WorldState, unitId: string): WorldUnit | undefined {
  return world.units.find((unit) => unit.id === unitId);
}
```

The exact runtime `world.units` mutation inventory before the Plan 014 fixture
exports begin at line 19722 is:

| Rewrite-base line(s) | Mutation and semantic owner |
|---:|---|
| 3875 | transport load filters loaded units from the array |
| 4069 | transport unload pushes restored cargo units |
| 4967, 4983 | building placement filters replaced targets, then pushes the building |
| 5231–5232 | oil-platform placement filters the patch, then pushes the platform |
| 5435 | canceled construction filters the building |
| 9602 | transport boarding filters the loaded unit |
| 9719 | training completion pushes the trained unit |
| 13699 | revealer creation pushes the revealer |
| 14051 | raise-dead pushes the skeleton |
| 14406 | capture cleanup filters the caster |
| 14604, 14701 | portal/summon paths push summoned units |
| 15008 | eye-of-vision pushes the eye |
| 16221 | death cleanup filters dead units |
| 16263 | removed-platform restoration pushes the oil patch |
| 16475 | death revealer creation pushes the revealer |
| 18654, 18658 | reachable-building probe swaps in a derived array, then restores the original |
| 18686, 18693 | build-site approach probe swaps in a derived array, then restores the original |

There are 22 mutation statements: seven filter replacements, eleven pushes,
and four temporary array assignments/restores. At this base there is no
same-reference, same-length mutation such as indexed assignment, `splice`,
`sort`, `reverse`, `copyWithin`, or `fill`. Array-reference changes catch the
temporary same-length swaps; length changes catch pushes. Plan 020 owns the
explicit invalidation API and every invalidation call required for any
same-tick mutation whose array identity and length do not change.

Run before editing:

```bash
test "$(hostname)" = halla
git merge-base --is-ancestor d4ad3868d5d0df9f1fa20e83cbc9f19a90b94aed HEAD
git diff --stat d4ad3868d5d0df9f1fa20e83cbc9f19a90b94aed..HEAD -- \
  src/simulation/orders.ts src/simulation/worldSelectors.ts \
  scripts/verify-unit-index.mjs plans/020-add-transient-unit-id-index.md \
  plans/evidence/020.md
rg -n "world\.units\s*=|world\.units\.(push|splice|pop|shift|unshift|sort|reverse|copyWithin|fill)|world\.units\[[^]]+\]\s*=" \
  src/simulation/orders.ts
rg -n "function findUnit|world\.units\.find" src/simulation/orders.ts
```

Expected: the rewrite base is an ancestor; later changes are the accepted Plan
018 integration or explained coordinator integration; the hot wrapper and all
runtime mutations are reconciled; and fixture-only assignments are identified
separately. If accepted Plan 018 changes a cited seam, the Wave 1 coordinator
must amend this plan with the accepted concrete SHA and refreshed exact
inventory before Plan 020 begins.

## Commands you will need

| Purpose | Command | Expected result |
|---|---|---|
| Host/worktree | `test "$(hostname)" = halla && git status --short --branch` | Halla, assigned isolated branch, understood status |
| Typecheck | `./node_modules/.bin/tsc --noEmit` | exit 0 |
| New index-parity verifier (created in Step 1) | `node scripts/verify-unit-index.mjs` | lookup, lifecycle, mutation, duplicate, diagnostics, and independent-world cases pass |
| Save schema | `npm run verify:save-schema` | exact save schema unchanged |
| Combat | `npm run verify:source-attack-action` | exit 0 |
| Browser combat | `npm run verify:browser-combat-session` | exit 0 under the Halla policy |
| Determinism | `npm run verify:runtime-determinism` | fixed-tick state and save comparison passes |
| Asset gate | `npm run verify:wargus-assets` | exit 0 |
| Build | `npm run build` | exit 0 |
| Performance | accepted Plan 018 `combat-100` at 1280×720 | three valid trials; every assigned budget passes |

Before implementation, run only the pre-existing typecheck, save, combat,
determinism, asset, and build gates. The new unit-index verifier does not exist
at the Wave 2 base; a missing script/import is not red evidence. Create it in
Step 1, record a meaningful failing assertion against accepted legacy behavior,
then make that same assertion green. Performance captures are serial and must
not overlap another plan's capture.

## Scope

**Plan 020 owns:**

- `src/simulation/worldSelectors.ts`;
- `src/simulation/orders.ts`, only the exact ID wrapper, hot exact-ID callers,
  runtime unit-array mutation inventory, and required invalidation calls;
- `scripts/verify-unit-index.mjs` (new); and
- `plans/evidence/020.md`.

**Out of scope:**

- replacing or reordering `world.units`, changing iteration/tie-breaking, or
  migrating selection, proximity, spatial, occupancy, renderer, or UI scans;
- adding the index to `WorldState`, saves, deterministic state, or a public
  render contract;
- edits to `world.ts`, `passability.ts`, `renderWorld.ts`, existing save/combat
  verifiers, Plan 018 metric schemas, or another plan's evidence; and
- weakening performance budgets, validity, fingerprints, or determinism.

The Wave coordinator owns `package.json` integration and `plans/README.md`
integration. The Plan 020 branch must not edit either file.

## Git workflow

- Branch from the accepted Wave 2 start into an isolated `plan-020` worktree.
- Commit index/parity/invalidation coverage before hot caller migration.
- Do not absorb another Wave 2 branch, resolve shared package/index conflicts,
  push, deploy, or open a PR unless instructed.

## Shared interfaces and ownership

- The accepted Plan 018 handoff supplies the normalized matrix, initial
  profile-definition hash, initial entity/effect fingerprint, environment
  identity, raw baseline directory, checksums, and worst-trial row results.
  Plan 020 reads those artifacts without changing them.
- `HALLA-EXECUTION-POLICY.md` governs Halla/browser execution, process
  ownership, serial captures, and durable artifacts.
- `PERFORMANCE-ACCEPTANCE.md` governs renderer qualification, trials,
  determinism, statistics, replacement limits, and budgets.
- Plan 020 exclusively owns the transient simulation lookup and the
  `orders.ts` invalidation inventory. Plan 019 owns terrain metadata and its
  `world.ts`/`passability.ts` slice. Plan 021 owns render-only preparation in
  `renderWorld.ts` and must not consume this index.
- Existing save, attack, and browser-combat verifiers are read-only gates.
  Shared-verifier integration belongs to the coordinator.

## Steps

### Step 0: Prove the entry gate and freeze the baseline

Confirm Plan 018 is `DONE-VERIFIED`, its acceptance commit is integrated, and
the durable `combat-100` baseline artifact and checksums resolve on Halla.
Record its environment identity, profile-definition hash, initial entity/effect
fingerprint, per-trial results, and worst-trial result. Run the drift and
mutation inventory plus every pre-existing non-browser baseline gate. Record
`scripts/verify-unit-index.mjs` as absent and not run; if it already exists
without an accepted plan refresh, STOP.

**Verify:** dependency, ancestry, inventory, baseline checksums/fingerprints,
host policy, and pre-existing baseline gates are green. STOP rather than substituting a
historical diagnostic capture.

### Step 1: Add the transient first-match index

First add a loadable exact-ID API shell that preserves legacy `.find` behavior
and create `scripts/verify-unit-index.mjs`. A stable-reuse, invalidation, or
namespaced-diagnostic fixture must execute and fail because no transient index
behavior exists yet; `MODULE_NOT_FOUND`, an import error, or a missing file is
not acceptable RED evidence. Preserve that output, then implement until the
same fixture and the full verifier are green.

Add `findWorldUnitById(world, unitId)` backed by a
`WeakMap<WorldState, Cache>`. `world.units` remains authoritative. Rebuild when
the world tick, array reference, array length, or explicit invalidation
generation changes. Export `invalidateWorldUnitIndex(world)`; the mutation site
in `orders.ts` owns calling it immediately after any same-tick mutation that
preserves both reference and length. Re-audit the exact inventory before
landing; do not assume the rewrite-base result remains current.

On duplicate IDs, production lookup must return the first array entry exactly
like `.find`. Test/development verification must surface the duplicate as a
contract failure and record it in diagnostics; it must never silently change
first-match behavior or select the last duplicate.

Add resettable plan-local diagnostics with these exact namespaces:

- `plan020.unitIdIndex.lookups`
- `plan020.unitIdIndex.rebuilds`
- `plan020.unitIdIndex.invalidations`
- `plan020.unitIdIndex.duplicateIds`

Diagnostics remain outside `WorldState`, saves, rendering, gameplay decisions,
and the Plan 018 summary schema. The focused verifier/evidence collector may
read them; shared capture wiring is coordinator-owned.

**Verify:** the focused verifier covers first lookup, reuse, tick change,
push/length change, filter/reference change, temporary same-length array
replacement/restoration, explicit same-reference/same-length invalidation,
independent worlds, load-created world identity, dead units retained in the
array, and production/development duplicate behavior.

### Step 2: Migrate only hot exact-ID simulation lookups

Replace the private `findUnit` body with `findWorldUnitById` and keep the local
wrapper to constrain the diff. Migrate only additional direct
`world.units.find` calls proven to be exact stable-ID resolution. Leave ordered
searches, predicate selection, proximity, occupancy, and tie-breaking on the
array.

Re-run the mutation inventory. Add explicit invalidation only to a mutation
that defeats tick/reference/length detection; do not sprinkle invalidation on
all pushes or replacements.

**Verify:** index parity, typecheck, attack action, and exact mutation-inventory
tests pass. Diff review proves array iteration order and target selection are
unchanged.

### Step 3: Prove save exclusion and deterministic behavior

Run save-schema and fixed-tick determinism before and after index use. Prove no
cache field, diagnostic field, rebuild order, or duplicate record enters save
serialization or canonical deterministic state. Exercise projectile target
death, pending attacks, cargo load/unload, construction replacement/probes,
training, summons, death cleanup, and save/load world replacement.

**Verify:** state hashes, entity/effect IDs and order, commands, scheduler
fields, and save output match; `world.units` remains authoritative and ordered.

### Step 4: Revalidate combat and measure

Run every command in the table. Capture three independent valid `combat-100`
trials using the exact accepted Plan 018 environment, specification, viewport,
warmup, duration, fingerprints, statistics, and worst-trial rule. Do not pool
samples or use renderer snapshot data. Every applicable shared budget must
pass; a greater-than-5% worsening of worst-trial frame p95 also counts as a
regression even if the budget passes.

**Verify:** browser combat and all non-browser gates pass; lookup/rebuild/
invalidation/duplicate diagnostics are namespaced; all assigned budgets pass;
and evidence is durable and checksum-verified.

## Test plan

- A recorded meaningful RED followed by GREEN for the new verifier; load/import
  failure does not qualify.
- Stable cache reuse and rebuild on tick, array identity, and length changes.
- Every rewrite-base runtime mutation family and a refreshed exact inventory.
- Explicit same-tick/same-reference/same-length mutation invalidation owned by
  its `orders.ts` mutation site.
- Duplicate IDs: first array entry in production and a surfaced
  test/development contract failure.
- Pending attacks, projectile source/target death, cargo load/unload,
  construction replacement/probe restoration, training, summons, and cleanup.
- Save/load creates an independent cache; no index or diagnostic is serialized.
- Array-ordered target selection and deterministic combat remain unchanged.
- Namespaced diagnostics reset and count only Plan 020 work.

## Performance acceptance

The accepted Plan 018 `combat-100` artifact is the before baseline. Capture
three independent valid after trials and apply the shared per-trial,
nearest-rank, and worst-trial rules unchanged. Never discard a valid budget
failure. Plan 020 cannot close while any applicable shared budget fails, the
environment/fingerprints differ, or evidence is incomplete. No local rule may
weaken the shared acceptance contract.

## Evidence contract

Store raw artifacts outside Git at:

```text
.artifacts/performance/020/<commit>/<UTC-stamp>/
```

Include accepted Plan 018 baseline directory/checksum references, environment
comparison, profile-definition and initial entity/effect fingerprints, one
JSON per trial, normalized summary, lookup/rebuild/invalidation/duplicate
diagnostics, mutation inventory, save/determinism/focused-test results,
the focused verifier's meaningful RED/GREEN output, controller/resource records, invalid/replacement records, and SHA-256
checksums. Independently recompute new checksums and verify baseline references.
Commit only concise normalized results to `plans/evidence/020.md`; `/tmp` is
not durable evidence.

## Done criteria

- [ ] Accepted Plan 018 integration and durable `combat-100` baseline are
  verified.
- [ ] The new verifier has a recorded behavior-level RED and GREEN; no missing
  file/import result is counted as RED.
- [ ] Hot exact-ID simulation resolution uses the transient first-match index.
- [ ] The exact runtime mutation inventory is current and every undetectable
  mutation has mutation-site-owned explicit invalidation.
- [ ] `world.units` remains authoritative, ordered, and unchanged in saves.
- [ ] Duplicate-ID behavior preserves production `.find` semantics and is
  surfaced by test/development verification.
- [ ] No renderer, UI, terrain, occupancy, spatial, save-schema, or
  deterministic-state coupling exists.
- [ ] Typecheck, index, save, attack, browser combat, determinism, assets, and
  build pass.
- [ ] Every assigned performance budget passes with durable,
  checksum-verified evidence.
- [ ] The branch contains only Plan 020-owned files; coordinator integration is
  pending or complete separately.

## STOP conditions

- Plan 018 is not accepted/integrated, or its baseline,
  checksums/fingerprints, and environment cannot be verified.
- Drift, the hot wrapper, or the runtime mutation inventory differs without a
  concrete coordinator refresh.
- Unit IDs mutate after insertion, duplicates are valid required behavior
  beyond legacy first-match semantics, or correct invalidation requires cache
  state in saves or `WorldState`.
- Preserving correctness requires changing array order, target selection,
  renderer/UI consumers, terrain, occupancy, or another plan's files.
- The index rebuilds per lookup in stable state, an undetectable mutation lacks
  an explicit owner, or duplicate handling changes the returned entry.
- The new verifier cannot produce a meaningful behavior-level RED before GREEN.
- Any focused, type, save, combat, determinism, asset, or build gate fails
  twice.
- Halla/browser qualification fails, another capture is active, a trial
  exhausts its replacement, an assigned budget fails, or frame p95 regresses
  by more than 5%.
- Durable evidence or checksums cannot be produced and verified.

## Rollback

Revert only the unaccepted Plan 020 index, invalidation, diagnostic, and hot
caller commits. Restore the private wrapper to authoritative
`world.units.find` and remove only Plan 020 invalidation calls. Preserve array
order, saves, failed/invalid evidence, accepted Plan 018, and other Wave 2
work. Stop only exact owned processes; remove only an artifact directory proven
to belong exclusively to the rolled-back attempt.

## Maintenance notes

Every future same-tick mutation that preserves the `world.units` reference and
length must call `invalidateWorldUnitIndex` at its owning mutation site and add
a focused case. Keep predicate/tie-breaking iteration on the authoritative
array, and never expose this simulation cache to rendering or persistence.
