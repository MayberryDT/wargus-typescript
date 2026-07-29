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

Run three independent valid trials per row. Each trial uses a fresh profile
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
aggregate each matrix row by its worst trial-level budget result; do not pool
samples across trials.

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

`captureComplete` requires every assigned row's three valid trials and durable
evidence. `validityAndComparabilityPass` requires the shared renderer,
environment, profile, viewport, fingerprint, trial, and replacement rules.
`fixedTickPass` preserves the shared determinism comparison.
`frameP95RegressionPass` allows no frame p95 regression greater than 5% versus
the accepted worst-trial baseline.
`targetedWorkReductionProofPass` requires targeted work-reduction proof: the
plan's direct timing and work-reduction evidence; it cannot be replaced by
a count-only claim. `cleanupAndIntegrityPass` requires checksums, retained raw
artifacts, and exact owned-process/port cleanup.

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
