# Performance Acceptance

## Measurement matrix

Capture the following seven matrix rows:

| Row | Profile | Viewport |
|---:|---|---|
| 1 | idle-25 | 1280×720 |
| 2 | idle-25 | 1280×720 |
| 3 | army-100 | 1280×720 |
| 4 | army-200 | 1280×720 |
| 5 | command-18 | 1280×720 |
| 6 | combat-100 | 1280×720 |
| 7 | command-18 | 1024×768 |

Run exactly seven independent valid trials per row. Each trial uses a fresh profile
page and deterministic profile; browser cache may be prewarmed outside the
measurement window, but runtime world state may not be reused.

## Trial lifecycle

1. Load the fresh profile and wait for `loadingVisible === false`.
2. Qualify the hardware renderer, focused and visible document, advancing RAF,
   profile identity, viewport, and initial entity/effect fingerprint.
3. Run a 5-second warmup.
4. Reset and start metrics at `t0`.
5. Save CPU/input summary and heap window 1 at `t15`.
6. Save heap window 2 and stop at `t30`.
7. Export the raw trial artifact, resource-monitor summary, and checksum.
8. Close the page and verify owned-process and port cleanup when the browser
   session ends.

Frame-budget evidence requires a hardware renderer; SwiftShader, llvmpipe, and
other software renderers are invalid. The document must be visible and focused
with an advancing RAF.

## Command profile

Validate the synthetic command hook in a disposable preflight page, then close
it. Synthetic samples are not included in the real-input percentile.

Each measured `command-18` trial uses ten real alternating move/attack-move
pairs, issued during the first 10 measured seconds at fixed wall-clock offsets.
It requires at least 20 successful command outcomes, at least 40 samples for
the input-handler-to-command latency distribution, and at least 40 samples for
the input-handler-to-next-render-callback latency distribution. Record command
kind, issue offset, success, queue modifier, command latency, and
next-render-callback latency for every outcome.

## Statistics and budgets

For each trial, calculate p50, p95, p99, mean, maximum, threshold counts, and
sample count with nearest-rank percentiles. Report each trial separately and
aggregate each matrix row's absolute budgets by its worst trial-level budget
result. Do not pool samples across trials for absolute budgets. The incremental
frame-p95 regression gate has the explicit pooled calculation below.

| Metric | Profiles | Budget |
|---|---|---:|
| Frame p95 | every profile | ≤33.3 ms |
| Frame p99 | every profile | ≤50 ms |
| Frames over 50 ms | every profile | ≤1% |
| Scheduler dropped delta | every profile | 0 |
| Maximum scheduler backlog | every profile | ≤0.25 s |
| Heap growth from t15 to t30 | every profile | ≤15% |
| Input-to-command p95 | command-18 | ≤50 ms |
| Input-to-next-render-callback p95 | command-18 | ≤100 ms |

Heap growth is:

```text
((usedHeapAtT30 - usedHeapAtT15) / max(usedHeapAtT15, 1)) * 100
```

Do not force garbage collection. Record heap API support and endpoint values;
unsupported heap APIs leave the heap gate unqualified. Plan 018 may finish
with failed baseline budgets; later work uses the acceptance modes below.

## Acceptance modes

The accepted Plan 018 matrix is the baseline. For each row, record the set of
failed absolute budget keys from its worst valid trial as
`acceptedPlan018WorstTrialBudgetFailureKeys`. An incremental capture passes
the no new budget-failure key check only when:

```text
afterWorstTrialBudgetFailureKeys ⊆ acceptedPlan018WorstTrialBudgetFailureKeys
```

Command rows retain the Plan 018-passing input latency budgets: input-to-command
p95 is at most 50 ms and input-to-next-render-callback p95 is at most 100 ms.

The incremental verdict is:

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

`captureComplete` requires exactly seven valid trials for every assigned row
and durable
evidence. `validityAndComparabilityPass` requires the shared renderer,
environment, profile, viewport, fingerprint, trial, and replacement rules.
`fixedTickPass` preserves the shared determinism comparison.
`frameP95RegressionPass` requires both the median-trial and pooled-frame gates
below to pass.
`targetedWorkReductionProofPass` requires targeted work-reduction proof: the
plan's direct timing and work-reduction evidence; it cannot be replaced by
a count-only claim. `cleanupAndIntegrityPass` requires checksums, retained raw
artifacts, and exact owned-process/port cleanup.

### Robust frame-p95 regression arithmetic

For each row, keep all seven trial-level frame p95 values and every raw frame
sample. Calculate:

```text
baselineMedianTrialFrameP95 = nearest-rank p50 of the seven baseline trial p95 values
afterMedianTrialFrameP95 = nearest-rank p50 of the seven successor trial p95 values
baselinePooledFrameP95 = nearest-rank p95 of all raw frame samples from the seven baseline trials
afterPooledFrameP95 = nearest-rank p95 of all raw frame samples from the seven successor trials

medianTrialFrameP95RegressionPercent =
  ((afterMedianTrialFrameP95 - baselineMedianTrialFrameP95)
    / baselineMedianTrialFrameP95) * 100

pooledFrameP95RegressionPercent =
  ((afterPooledFrameP95 - baselinePooledFrameP95)
    / baselinePooledFrameP95) * 100
```

Both regressions must be no greater than 5%. Report the raw values and raw
percentages unchanged. For the pass/fail decision only, round each compared
p95 value to the captured timestamp's 0.1 ms decision precision, then compare
`after * 100 <= baseline * 105` with the reviewed scale-aware floating-point
tolerance. Exactly 5% passes; the smallest meaningful 0.1 ms step above the
boundary fails. Missing or extra trials, missing raw samples, non-finite data,
invalid comparability, incomplete lifecycle, or checksum failure fails closed.

New matrix summaries use schema-version 4. Schema-version 4 removes the
worst-frame-p95 comparison fields and records the median-trial and pooled-frame
values, raw regression percentages, and both component verdicts. A
schema-version 3 baseline cannot be used by the schema-version 4 successor
runner.

This amendment is evidence-driven by the retained paired diagnostic at
`.artifacts/diagnostics/plan019-paired-ab/20260730T062702Z/`, whose
`sha256.json` SHA-256 is
`6bc0def2ac32baa619b718e5e3f9eb504c3c29f10e5051bbbb06cfd43549d962`.
Its independently reviewed classification was `realRegression: false`:
median paired frame-p95 regression `0%`, `2/15` pairs over 5%, baseline and
Plan 019 pooled frame p95 both `66.60000000000582 ms`, and pooled regression
`0%`. All three real-regression conditions were false. This establishes that
the isolated worst-of-three result was not a repeatable Plan 019 slowdown and
justifies replacing that unstable comparison without changing any absolute
budget.

Preserve every historical baseline, failed successor packet, paired diagnostic
packet, manifest, and report. Do not relabel schema-version 3 packets as
schema-version 4 evidence.

### Plan 018 seven-trial baseline capture

The reviewed capture candidate is
`scripts/run-plan018-seven-trial-baseline.mjs`, exposed as
`npm run capture:plan018-seven-trial-baseline`. It requires a clean reviewed
coordinator checkout on Halla and creates a disposable detached worktree at
exact Plan 018 target `5b7d9cc81072c8aeda1ce1a9c22602569e1a691b`. The
coordinator verifies the target asset pack and build, records a fixed-tick
proof using the absolute reviewed verifier path, and invokes the reviewed
matrix harness for all seven canonical rows with exactly seven valid trials
per row.

The baseline schema-version 4 readiness verdict is independent of absolute
budget success. It requires complete qualified capture, internal environment
and fingerprint comparability, fixed-tick proof, exact lifecycle cleanup, lock
release, finalization, retained raw samples, and checksummed publication.
Absolute failures are still recorded row by row. Baseline mode does not load
an accepted predecessor baseline and does not require a successor targeted
work-reduction proof. The packet is not an accepted baseline until independent
review approves it and its exact manifest identity is pinned; existing
three-trial and failed packets remain immutable.

The absolute-release verdict is:

```text
absoluteReleaseReady =
  incrementalReady
  && everyAbsoluteSharedBudgetPass
```

Plans 019–025 and combined Waves 2–4 use `incremental`. Wave 5 uses
`absolute-release`: Wave 5 requires every absolute shared budget to pass.

## Determinism

The fixed-tick non-browser determinism verifier runs each deterministic profile
twice for an exact fixed simulation-tick offset and compares canonical state hash, entity/effect
counts and IDs, positions, hit points, owners, orders, command targets,
scheduler-requested tick count, and save serialization where applicable.
Browser repeats must match the initial profile-definition hash and initial
entity/effect fingerprint.

## Invalid trials and evidence

Discard a trial only for renderer or viewport mismatch; hidden or unfocused
document; non-advancing RAF; runtime load/profile failure; browser crash;
resource safety abort; or a missing required input outcome or sample pairing.
Never discard a valid trial for a failed performance budget. Allow at most one
replacement per matrix-row trial slot; an invalid replacement cannot be
replaced again. Preserve both invalid and replacement metadata in evidence.

Store durable raw artifacts outside Git at:

```text
.artifacts/performance/<plan>/<commit>/<UTC-stamp>/
```

This is the logical path backed by the ignored retained workspace root defined
in `HALLA-EXECUTION-POLICY.md`. It is a Wave 0 deliverable, not a current
repository fact: no trial may start until the committed `/.artifacts/` ignore
rule, explicit `WARGUS_ARTIFACT_ROOT`, `git check-ignore` probe, writable-root
check, and outside-disposable-worktree realpath check all pass.

Every capture directory contains one JSON file per trial, a normalized matrix
summary, SHA-256 checksums, a resource-monitor summary, controller version or
commit, and invalid/discarded trial records. Its auditable environment metadata
records the browser executable and version, viewport, renderer string, GPU
device and driver, document focus and visibility, RAF advancement, commit and
build mode, artifact workspace/root realpaths and preservation owner, and host
load, memory, swap, and storage pre/post state.

Before/after comparisons use the same host, browser, hardware renderer,
viewport, build mode, profile definition, warmup, duration, and aggregation
rule.

Commit concise normalized results to `plans/evidence/NNN.md`; raw files remain
uncommitted and evidence must not depend only on `/tmp` paths.
