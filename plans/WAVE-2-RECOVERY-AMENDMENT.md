# Wave 2 Recovery Amendment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover Plans 019–021 from their truthful performance STOP results,
accept incremental optimizations without pretending the Plan 018 baseline
already meets final budgets, and reopen Wave 3 only after exact combined-SHA
verification.

**Architecture:** Preserve the Plan 018 matrix, validity, determinism,
environment, raw metrics, and absolute budgets. Split acceptance into an
incremental gate for Plans 019–025 and Waves 2–4, plus an absolute release gate
for Wave 5. Track the capture harness in Git, correct its real-input pairing,
remediate Plan 020's actual frame regression, finish Plan 021's coordinator
gates, then recapture and integrate Wave 2 serially.

**Tech Stack:** TypeScript 6, Node.js ESM verifier scripts, Vite, PixiJS,
Playwright controlling system Google Chrome through the approved Halla
video/render groups, Git worktrees, SHA-256 retained artifacts.

## Global Constraints

- Run implementation, verification, browser, and capture work only on `halla`
  in isolated worktrees under `/home/halla/workspaces/`.
- Preserve Plan 018's accepted capture
  `033629474959122749f6acb013ed6c2a0c0d2556/20260729T051148Z` and accepted
  manifest SHA-256
  `657dec5af935823fc27beaf16034b78813b4090244f22146effefc430040bed1`
  as read-only baseline inputs.
- Do not relabel the failed 2026-07-29 Plan 019–021 packets as accepted and do
  not delete them.
- Run browser/performance captures serially. Use unique ports, exact PID
  ownership, the global exclusive capture lock, and clean only owned PIDs.
- Every measured row still needs three independent valid trials, exact
  environment/profile/fingerprint comparability, exact 600-tick deterministic
  proof, and worst-trial nearest-rank aggregation.
- Incremental acceptance requires: no new budget-failure key relative to the
  accepted Plan 018 row, worst frame-p95 regression no greater than 5%, and a
  focused deterministic proof that the plan removes its named hot work.
- A baseline-failing absolute budget may remain failed during Plans 019–025 and
  Waves 2–4; record it without calling it passed.
- Wave 5 release acceptance still requires every absolute shared budget to
  pass. No threshold changes.
- A budget that passed in the Plan 018 baseline may not newly fail in an
  individual or combined incremental packet.
- Preserve runtime determinism, source parity, save schemas, renderer identity,
  visual parity, and Plan 018 display-object counter semantics.
- Do not deploy until Plans 019–025, combined Wave 4 verification, independent
  review, and preview smoke are accepted and the existing deployment
  authorization boundary is reached.

---

### Task 1: Amend The Performance And Roadmap Contracts

**Files:**
- Modify: `plans/PERFORMANCE-ACCEPTANCE.md`
- Modify: `plans/HALLA-EXECUTION-POLICY.md`
- Modify: `plans/README.md`
- Modify: `plans/019-precompute-terrain-metadata.md`
- Modify: `plans/020-add-transient-unit-id-index.md`
- Modify: `plans/021-build-culled-render-snapshots.md`
- Modify: `plans/022-retain-world-display-objects.md`
- Modify: `plans/023-add-deterministic-spatial-occupancy-index.md`
- Modify: `plans/024-budget-and-stagger-pathfinding.md`
- Modify: `plans/025-make-visibility-and-fog-dirty-driven.md`
- Create: `scripts/verify-performance-acceptance-contract.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: accepted Plan 018 rows and their per-row budget-failure unions.
- Produces: `incremental` and `absolute-release` acceptance modes used by every
  later capture and post-integration gate.

- [ ] **Step 1: Add a failing source-contract verifier**

Create `scripts/verify-performance-acceptance-contract.mjs`. It must read the
shared contracts and Plans 019–025 and initially fail until all of these exact
rules are present:

```js
const requiredModes = ["incremental", "absolute-release"];
assert.match(performanceContract, /no new budget-failure key/i);
assert.match(performanceContract, /frame p95 regression.*5%/i);
assert.match(performanceContract, /targeted work-reduction proof/i);
assert.match(performanceContract, /Wave 5.*every absolute shared budget/i);
```

It must also reject stale detailed-plan statements that say every assigned
absolute budget must pass before Plans 019–025 can close.

- [ ] **Step 2: Run the verifier and retain the meaningful RED**

Run:

```bash
node scripts/verify-performance-acceptance-contract.mjs
```

Expected: assertion failure naming the missing incremental/absolute split, not
a missing file or import error.

- [ ] **Step 3: Write the amended shared contract**

Add two explicit verdict algorithms to `plans/PERFORMANCE-ACCEPTANCE.md`:

```text
incrementalReady =
  captureComplete
  && validityAndComparabilityPass
  && fixedTickPass
  && noNewBudgetFailuresPass
  && frameP95RegressionPass
  && targetedWorkReductionProofPass
  && cleanupAndIntegrityPass

absoluteReleaseReady =
  incrementalReady
  && everyAbsoluteSharedBudgetPass
```

Define `noNewBudgetFailuresPass` per row as:

```text
afterWorstTrialBudgetFailureKeys ⊆ acceptedPlan018WorstTrialBudgetFailureKeys
```

Command rows must retain the Plan 018-passing input latency budgets. Plans
019–025 and combined Waves 2–4 use `incremental`; Wave 5 uses
`absolute-release`.

- [ ] **Step 4: Refresh detailed plans and wave barriers**

Replace the stale absolute-budget STOP/done language in Plans 019–025 with the
incremental algorithm verbatim. Keep invalid-trial exhaustion, environment
drift, new budget failures, greater-than-5% p95 regression, missing targeted
proof, and incomplete evidence as STOP conditions. Update the Halla combined
gate and roadmap wave text to name the acceptance mode for each wave.

Change Plans 019–021 from `BLOCKED` to `IN PROGRESS — RECOVERY AUTHORIZED`;
retain links to the failed evidence and name this amendment as the authority.

- [ ] **Step 5: Make the contract verifier green**

Run:

```bash
node scripts/verify-performance-acceptance-contract.mjs
git diff --check
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add plans package.json scripts/verify-performance-acceptance-contract.mjs
git commit -m "Authorize incremental performance acceptance"
```

---

### Task 2: Track And Correct The Successor Capture Harness

**Files:**
- Create: `scripts/run-successor-performance-matrix.mjs`
- Create: `scripts/verify-successor-fixed-tick.mjs`
- Create: `scripts/verify-successor-capture-contract.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `WARGUS_PERF_ACCEPTANCE_MODE=incremental|absolute-release`,
  accepted Plan 018 directory/manifest identity, assigned canonical rows.
- Produces: schema-version 3 matrix summaries with both incremental and
  absolute verdicts, plus exact invalid-attempt diagnostics.

- [ ] **Step 1: Copy the independently approved harnesses into tracked scripts**

Start from the retained reviewed sources whose hashes are:

```text
matrix f5f1aaff834f92981c106b0fd1db30f18bcc072e4ba1437b435fbcf300f24e3c
fixed  1d8b825fb535fd0a4467551f0cd42c2ec87e8b27b8b8c87a46007c2cc27b538e
```

Adjust only relative imports and the explicit changes in this task.

- [ ] **Step 2: Add a failing command-pair and verdict verifier**

`verify-successor-capture-contract.mjs` must extract/test the relevant pure
helpers and fail until:

```js
pairReady =
  inputToCommandDelta >= 2
  && inputToNextRenderDelta >= 2
  && rafTimestamp > previousRaf;

noNewBudgetFailures =
  afterFailureKeys.every((key) => baselineFailureKeys.includes(key));
```

It must prove that one render sample is insufficient, two paired samples pass,
an after-only budget key fails incremental acceptance, an inherited baseline
failure does not, `>5%` p95 regression fails, and absolute mode additionally
requires an empty after-failure set.

- [ ] **Step 3: Correct real input pairing**

Change `realCommand` readiness from “any next-render sample appeared” to the
exact `pairReady` predicate above. Preserve the actual issue timestamp taken
immediately before keyboard input and the 250 ms schedule tolerance.

When a command trial is invalid, retain counts and per-outcome deltas in the
invalid record:

```js
{
  outcomeCount,
  successfulOutcomeCount,
  inputToCommandSampleCount,
  inputToNextRenderSampleCount,
  scheduleInvalid,
  outcomes
}
```

- [ ] **Step 4: Implement schema-version 3 incremental verdicts**

Load each accepted baseline trial's failure union and emit:

```js
acceptance: {
  mode,
  noNewBudgetFailuresPass,
  frameP95RegressionPass,
  absoluteBudgetsPass,
  incrementalAccepted,
  absoluteReleaseAccepted,
  accepted
}
```

`accepted` must select the verdict named by
`WARGUS_PERF_ACCEPTANCE_MODE`. The harness must still exit nonzero when the
selected verdict is false.

- [ ] **Step 5: Run non-browser and negative checks**

Run:

```bash
node scripts/verify-successor-capture-contract.mjs
node --check scripts/run-successor-performance-matrix.mjs
node --check scripts/verify-successor-fixed-tick.mjs
WARGUS_PERF_PLAN=019 WARGUS_MATRIX_ROWS=3,5,7 \
  WARGUS_PERF_ACCEPTANCE_MODE=incremental \
  WARGUS_MATRIX_GUARD_CHECK=1 \
  node scripts/run-successor-performance-matrix.mjs
```

Expected: all pass; wrong mode, wrong baseline manifest, wrong fixed-tick
offset, and non-fresh artifact stamp checks fail closed without launching a
browser.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/run-successor-performance-matrix.mjs \
  scripts/verify-successor-fixed-tick.mjs \
  scripts/verify-successor-capture-contract.mjs
git commit -m "Track incremental performance capture harness"
```

---

### Task 3: Remove Plan 020 Per-Tick Index Rebuilds

**Files:**
- Modify in `wave2/plan-020`: `src/simulation/worldSelectors.ts`
- Modify in `wave2/plan-020`: `scripts/verify-unit-index.mjs`
- Modify in `wave2/plan-020`: `plans/evidence/020.md`

**Interfaces:**
- Consumes: authoritative `world.units` identity/length and explicit
  `invalidateWorldUnitIndex(world)`.
- Produces: one reusable first-write-wins ID index until array
  identity/length/generation changes.

- [ ] **Step 1: Add a failing stable-tick-reuse fixture**

After the first index build, advance `world.tick` through 600 values and perform
at least one exact-ID lookup per tick without mutating `world.units`.

Expected before remediation:

```js
assert.equal(diagnostics["plan020.unitIdIndex.rebuilds"], 1);
// Actual before fix: 601
```

Also inventory unit-ID assignments and fail if production runtime mutates an
existing `WorldUnit.id`.

- [ ] **Step 2: Remove tick from the cache validity key**

Remove `tick` from `WorldUnitIndexCache` and from the reuse predicate. Keep
world identity, `world.units` reference, length, generation, first-write-wins,
duplicate reporting, and explicit invalidation unchanged.

- [ ] **Step 3: Re-run focused and behavioral gates**

Run:

```bash
node scripts/verify-unit-index.mjs
./node_modules/.bin/tsc --noEmit
npm run verify:save-schema
npm run verify:source-attack-action
npm run verify:runtime-determinism
npm run verify:browser-combat-session
npm run verify:wargus-assets
npm run build
git diff --check
```

Expected: all pass; the 600-tick fixture reports one rebuild.

- [ ] **Step 4: Commit**

```bash
git add src/simulation/worldSelectors.ts scripts/verify-unit-index.mjs \
  plans/evidence/020.md
git commit -m "Reuse unit ID index across stable ticks"
```

---

### Task 4: Complete Plan 021 Coordinator Gates

**Files:**
- Modify on coordinator integration branch:
  `scripts/verify-wargus-assets.mjs`
- Modify: `package.json`
- Create: `scripts/verify-render-visual-parity.mjs`
- Modify on `wave2/plan-021`: `plans/evidence/021.md`

**Interfaces:**
- Consumes: Plan 021 prepared snapshot API and accepted Plan 018 renderer/counter
  scope.
- Produces: exact shared source assertion, deterministic before/after visual
  comparison, and coordinator-ready Plan 021 gate packet.

- [ ] **Step 1: Replace the stale asset assertion**

Require the actual prepared-frame call and reject the removed immediate-render
call. The verifier must fail on a fixture containing only the legacy call and
pass on the real Plan 021 source.

- [ ] **Step 2: Add deterministic visual parity capture**

Use the shared browser controller and system Chrome. Capture the same fixed
profile/tick/viewport from the accepted base and Plan 021 implementation.
Run the comparison from a disposable verification worktree that contains the
reviewed Plan 021 commits plus the coordinator-owned verifier change; do not
merge that staging branch into the coordinator branch before Plan 021
acceptance.
Store both PNGs and a JSON comparison containing dimensions, SHA-256 values,
changed-pixel count, maximum channel delta, and an exact-equality verdict.
Do not add a tolerance; any unexplained changed pixel fails.

- [ ] **Step 3: Run exact Plan 021 gates**

Run serially:

```bash
node scripts/verify-render-preparation.mjs
node scripts/verify-render-visual-parity.mjs
./node_modules/.bin/tsc --noEmit
npm run verify:runtime-determinism
npm run verify:wargus-assets
npm run build
npm run verify:browser-runtime-smoke
npm run verify:browser-native-viewport
git diff --check
```

Expected: all pass with exact visual parity and unchanged Plan 018 tracked
display-object call-site counts.

- [ ] **Step 4: Commit**

Commit the coordinator verifier/package changes separately from the Plan 021
evidence update.

---

### Task 5: Recapture And Close Plans 019–021

**Files:**
- Modify: `plans/evidence/019.md`
- Modify: `plans/evidence/020.md`
- Modify: `plans/evidence/021.md`
- Modify: `plans/README.md`

**Interfaces:**
- Consumes: tracked schema-version 3 harness, reviewed plan branches, accepted
  Plan 018 baseline.
- Produces: one fresh checksum-verified incremental packet per plan.

- [ ] **Step 1: Independently review the tracked harness**

Require an independent reviewer to approve baseline anchoring, pair readiness,
invalid/replacement handling, incremental/absolute verdicts, cleanup, locking,
freshness, and checksums before browser execution.

- [ ] **Step 2: Capture Plan 019 serially**

Run exact 600-tick proof and rows `3,5,7` at the Plan 019 implementation SHA
with `WARGUS_PERF_ACCEPTANCE_MODE=incremental`. Do not reuse either failed
stamp. Stop on a new exhausted replacement, new budget failure, p95 regression
over 5%, drift, or cleanup failure.

- [ ] **Step 3: Capture remediated Plan 020 serially**

Run row `6` at the new implementation SHA. It must have no new budget failure,
no more than 5% frame-p95 regression, and the focused 600-tick one-rebuild
proof.

- [ ] **Step 4: Capture Plan 021 serially**

Run one fresh rows `3,4,6` packet at the reviewed implementation SHA with the
schema-version 3 harness and `WARGUS_PERF_ACCEPTANCE_MODE=incremental`. Preserve
the old immutable packet as failed historical evidence; never alter its
manifest.

- [ ] **Step 5: Verify and commit evidence**

Independently recompute every manifest, confirm zero residual PIDs/ports and a
released lock, update concise evidence and roadmap rows, and obtain independent
plan reviews.

---

### Task 6: Integrate Wave 2 And Open Wave 3

**Files:**
- Modify: `package.json`
- Modify: `plans/README.md`
- Create: `plans/evidence/WAVE-2-INTEGRATION.md`
- Refresh only drifted excerpts in Plans 022–025.

**Interfaces:**
- Consumes: accepted Plan 019–021 branches and coordinator harness/verifier
  commits.
- Produces: exact combined SHA and `incremental` full seven-row `READY` packet.

- [ ] **Step 1: Integrate reviewed branches**

Integrate only accepted implementation/evidence commits. Resolve shared
`package.json` and verifier ownership on the coordinator branch. Confirm the
combined diff contains no rejected diagnostic packet or ignored harness source.

- [ ] **Step 2: Run the Wave 2 combined non-browser/browser gate**

Run every Wave 2 focused verifier, typecheck, source parity, save schema,
determinism, asset, build, runtime smoke, combat, native viewport, and visual
parity gate on the exact combined SHA.

- [ ] **Step 3: Run the full incremental matrix**

Capture all seven rows, three valid trials each, with
`WARGUS_PERF_ACCEPTANCE_MODE=incremental`. Require no new budget failures,
no row over 5% p95 regression, exact comparability, and clean lifecycle.

- [ ] **Step 4: Commit the integration packet**

`plans/evidence/WAVE-2-INTEGRATION.md` must name the combined SHA, commands,
results, artifact path, manifest hash, individual evidence inputs, remaining
absolute budget failures, and verdict. Only `READY` opens Wave 3.

- [ ] **Step 5: Resume the approved roadmap**

Refresh Plan 022/023 drift bases against the combined SHA, then execute Waves
3–5 under their existing ownership tables and the amended acceptance modes.

