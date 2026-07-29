# Plan 018: Establish A Reproducible Runtime Performance Feedback Loop

> **Executor instructions:** This is the Wave 1 closeout plan for implementation
> already present through `e80215e`. Follow it in order from an isolated Halla
> worktree. Run every verification and confirm its expected result. Do not tune
> gameplay, optimize runtime code, deploy, or execute a capture until Wave 0 is
> accepted. The [Halla execution policy](HALLA-EXECUTION-POLICY.md) and
> [performance acceptance contract](PERFORMANCE-ACCEPTANCE.md) are authoritative;
> this plan references rather than replaces them.
>
> **Drift check:** Run every command in `Current state` first. STOP on an
> unexplained path, commit, branch, or browser-verifier difference.

## Status

- **Status:** IN PROGRESS
- **Wave:** 1 — Measurement foundation
- **Priority:** P1
- **Effort:** M remaining acceptance work
- **Risk:** MEDIUM; instrumentation exists, but representative evidence does not
- **Depends on:** accepted Wave 0 exit for Plans 026 and 027
- **Category:** performance, tests, developer experience
- **Original planning base:** `8ac0006`, 2026-07-27
- **Implementation checkpoint:** `e80215e`
- **Roadmap rewrite base:** `6049a986b0e5b51459f29a24e3543c5e36b792a3`

Plan 018 is unfinished. It may not proceed to capture or become
`DONE-VERIFIED` until Wave 0 is complete and the fixed-tick determinism proof
plus the full hardware-qualified seven-row matrix, with three valid trials per
row, are accepted. Partial, software-rendered, single-trial, or `/tmp`-only
evidence cannot satisfy this gate.

## Why this matters

The runtime previously exposed last values and exponential averages that could
hide tail stalls, dropped scheduler time, and slow input acknowledgement.
Plan 018 establishes the stable measurement baseline that Plans 019–025 must
use. A valid baseline may fail a performance budget; truthfully recording that
failure is acceptable for Plan 018. Later optimization plans must pass their
assigned budgets under the same accepted contract.

## Current state

The Plan 018-owned implementation starts after `783d1a5` and ends at
`e80215e`. The later roadmap contracts were reconciled at rewrite base
`6049a986`. Run these checks before acceptance work:

```bash
test "$(hostname)" = halla
test "$(git branch --show-current)" = perf/plan-018-v2
git merge-base --is-ancestor e80215e HEAD
git diff --name-status 783d1a5..e80215e -- \
  package.json plans/README.md plans/evidence/018.md \
  scripts/verify-performance-metrics.mjs \
  scripts/verify-playtest-telemetry.mjs \
  scripts/verify-simulation-scheduler.mjs \
  src/main.ts src/performance src/simulation/orders.ts \
  src/view/renderHud.ts src/view/renderOverlays.ts src/view/renderWorld.ts
git diff --name-status e80215e..6049a986 -- \
  package.json scripts src
git diff --stat e80215e..HEAD -- \
  package.json scripts/verify-performance-metrics.mjs \
  scripts/verify-playtest-telemetry.mjs \
  scripts/verify-simulation-scheduler.mjs src/main.ts src/performance \
  src/simulation/orders.ts src/view/renderHud.ts src/view/renderOverlays.ts \
  src/view/renderWorld.ts
```

Expected:

- host and branch checks pass;
- `e80215e` is an ancestor;
- the implementation diff contains exactly the Plan 018-owned paths listed in
  the scope section below;
- `e80215e..6049a986` contains no runtime, package, or verifier change; and
- any later diff is understood and reconciled before evidence is captured.

The original-base drift also includes pre-existing browser verifier work
between `8ac0006` and `783d1a5`. Inspect it with:

```bash
git diff --name-status 8ac0006..e80215e -- \
  scripts/lib/browser-devtools-client.mjs \
  scripts/lib/browser-runtime-smoke-assertions.mjs \
  scripts/verify-browser-playable-session-contract.mjs \
  scripts/verify-browser-playable-session.mjs \
  scripts/verify-browser-runtime-smoke.mjs \
  scripts/verify-minimap-render-cache.mjs \
  scripts/verify-source-footprint-interactions.mjs
```

Those browser verifier surfaces are capture dependencies and drift surfaces,
not Plan 018-owned implementation. STOP if a result differs from these bases,
if a relevant change is unexplained, or if the expected branch has already
integrated other runtime work. Reconcile the plan before continuing.

### Existing implementation checkpoints

Do not reimplement these checkpoints:

| Commit | Accepted implementation fact |
|---|---|
| `fc41c95` | Added bounded runtime metric buffers, summaries, deterministic profile definitions, the focused metrics verifier, and its package script. |
| `a105efa` | Exposed scheduler accepted/dropped delta, step, backlog, and timing diagnostics with focused scheduler coverage. |
| `7ae81bc` | Connected smoke-only profiles, runtime hooks, input and render-preparation timing, long tasks, heap reporting, and display-object instrumentation across `main`, `renderWorld`, `renderHud`, and `renderOverlays`. |
| `3c0eeea` | Corrected tracked display-object churn accounting and verifier/evidence wording. |
| `9bcfe2f` | Preserved smoke profile execution through scheduler lifecycle handling. |
| `bbddb36` | Reconciled deterministic smoke profile building IDs with the manifest. |
| `6923c09` | Preserved the `command-18` selection and verified production HUD/pointer command seams. |
| `d9e1c63`, `34592b7`, `e80215e` | Recorded and then corrected the historical capture protocol, blocker, and partial diagnostic evidence. They did not produce accepted matrix evidence. |

Implementation checkpoints are complete only to the extent covered by the
green non-browser gates recorded in [Plan 018 evidence](evidence/018.md).
Representative capture, canonical determinism acceptance, and final integration
remain incomplete.

## Scope

Plan 018-owned commits `fc41c95..e80215e` changed exactly:

- `src/performance/runtimePerformance.ts`
- `src/performance/performanceProfiles.ts`
- `src/performance/displayObjectPerformance.ts`
- `src/main.ts`
- `src/simulation/orders.ts`
- `src/view/renderHud.ts`
- `src/view/renderOverlays.ts`
- `src/view/renderWorld.ts`
- `scripts/verify-performance-metrics.mjs`
- `scripts/verify-playtest-telemetry.mjs`
- `scripts/verify-simulation-scheduler.mjs`
- `package.json`
- `plans/evidence/018.md`
- `plans/README.md`

The renderer files are in scope because Plan 018 already routed Pixi scene
object creation/destruction through display-object instrumentation there. The
instrumentation labels its scope as instrumented Pixi scene objects and
excludes texture destruction. It is not permission to optimize or refactor
rendering.

### Boundaries

Out of scope for this closeout:

- gameplay, balance, tick-rate, scheduler-budget, pathfinding, visibility, AI,
  HUD, renderer, or display-object optimization;
- new save fields or timing data entering deterministic state;
- changing shared matrix rows, budgets, validity rules, browser qualification,
  process policy, statistics, or artifact layout locally;
- deployment or live-site debugging; and
- host, browser, controller, or runtime changes while executing this
  documentation rewrite.

If acceptance exposes a harness defect that requires code, STOP and amend the
scope before editing it.

## Git workflow

- Continue from the accepted Wave 0 integration in the assigned isolated
  `perf/plan-018-v2` worktree; re-run ancestry and drift before capture.
- The closeout may update Plan 018 evidence and coordinator-owned roadmap state
  only after acceptance. It may not rewrite the landed implementation
  checkpoints or absorb Plans 019–025.
- Keep raw artifacts uncommitted, do not push, deploy, or open a PR unless
  instructed, and never resolve a Plan 026/027 ownership issue in this branch.

## Shared interfaces and ownership

| Owner | Files and interfaces |
|---|---|
| Plan 018 | Owns the performance summary schema, deterministic profiles, runtime/display-object instrumentation, matrix evidence, and focused `verify-performance-metrics`, `verify-playtest-telemetry`, and `verify-simulation-scheduler` contracts listed above. It does not own browser process control or the Wave 0 gate repairs. |
| Plan 026 | Owns the shared browser execution controller, browser verifier server/debug-port/PID-cleanup migrations, hardware-renderer qualification, and generic resource-monitor/artifact helpers. It may expose generic records to Plan 018 but may not alter Plan 018 measurements or acceptance. |
| Plan 027 | Owns only its `verify-source-resource-ui` portability repair, the two named `verify-fixed-demo-polish` assertion repairs, and focused revalidation needed for those gates. It does not own the performance contract, controller, or Plan 018 instrumentation. |
| Wave coordinator | Owns integration edits to `plans/README.md`, `package.json`, and any shared verifier integration named in this plan that crosses the Plan 018/026/027 boundaries. Plan branches must not independently resolve a shared-file conflict by absorbing another plan's ownership. |

The browser verifier surfaces named in the drift section follow this map:
Plan 026 owns their browser-execution behavior, Plan 027 may only revalidate or
make its narrowly scoped gate repair, and cross-plan integration is
coordinator-owned.

## Commands you will need

Run after Wave 0 is accepted and before starting a browser:

| Purpose | Command | Expected result |
|---|---|---|
| Typecheck | `./node_modules/.bin/tsc --noEmit` | exit 0 |
| Metrics | `npm run verify:performance-metrics` | exit 0; percentile, threshold, ring, profile, input-pairing, and display-object cases pass |
| Telemetry | `npm run verify:playtest-telemetry` | exit 0 |
| Scheduler | `npm run verify:simulation-scheduler` | exit 0 |
| Determinism | `npm run verify:runtime-determinism` | exit 0 with the fixed-tick proof recorded below |
| Asset gate | `npm run verify:wargus-assets` | exit 0 |
| Build | `npm run build` | exit 0 |

If `node_modules` is absent, run `npm ci` with approval if network access is
required. Do not substitute a package manager or dependency version. STOP on
any red baseline; a second identical failure confirms the blocker but does not
authorize capture.

## Steps

### Step 0: Prove the Wave 0 entry dependency

Confirm Plans 026 and 027 are `DONE-VERIFIED` in `plans/README.md`, their
evidence is accepted, and the integrated Wave 0 commit is the base of this
worktree. Then run the drift checks above and the non-browser commands.

**Verify:** Wave 0 evidence, ancestry, drift, focused gates, assets, and build
are green. Until then, STOP with Plan 018 `BLOCKED`. After the roadmap is
explicitly approved and this entry dependency passes, change it to
`IN PROGRESS` for the acceptance work.

### Step 1: Produce fixed-tick determinism proof

Use the fixed-tick non-browser contract in
`PERFORMANCE-ACCEPTANCE.md#determinism`. Run every deterministic performance
profile twice for the same exact simulation-tick offset. Record equality of
the canonical state hash and all contract-required state, scheduler, and save
fields.

Browser trials must match the initial profile-definition hash and initial
entity/effect fingerprint. Browser runs are not required to end at identical
world ticks because their duration is wall-clock controlled.

**Verify:** committed evidence names the verifier command, commit, fixed tick
offset, profiles, compared fields, and pass result. Timing measurements do not
enter deterministic state.

### Step 2: Qualify Halla and the browser

Follow `HALLA-EXECUTION-POLICY.md` for host thresholds, listeners, unique port,
conflicting benchmark detection, exact PID ownership, resource recording,
browser choice, 120-second readiness watchdog, and cleanup. Performance
captures run serially.

Follow `PERFORMANCE-ACCEPTANCE.md` for browser executable/version, hardware
renderer, GPU device/driver, focus, visibility, RAF, viewport, profile, and
initial fingerprint qualification. A software renderer is invalid for
frame-budget evidence.

**Verify:** durable environment and resource-monitor records exist before the
first valid trial. No pre-existing process or listener is touched.

### Step 3: Run the canonical matrix

Run the seven rows defined in `PERFORMANCE-ACCEPTANCE.md#measurement-matrix`,
with three independent valid trials per row. Each trial uses a fresh profile
page and the authoritative lifecycle:

1. qualify load, renderer, document, RAF, profile, viewport, and fingerprint;
2. warm up for 5 seconds;
3. reset/start at `t0`;
4. save CPU/input summary and heap window 1 at `t15`;
5. save heap window 2 and stop at `t30`;
6. export raw trial, resource summary, and checksum; and
7. close the page and perform exact-owned cleanup when the session ends.

There is no arbitrary valid-tab duration ceiling. Readiness remains governed
by the shared no-progress watchdog and resource safety rules.

For each `command-18` row, first validate the synthetic command hook in a
disposable preflight page and close that page. Synthetic samples are excluded
from measured percentiles. Use ten real alternating move/attack-move pairs during the first 10 measured seconds at the fixed offsets in the shared contract. Each trial must record at least 20 successful command outcomes, at least 40 input-handler-to-command samples, and at least 40 input-handler-to-next-render-callback samples.

**Verify:** all 21 required valid trials exist. Apply the shared invalid and
single-replacement rules exactly; retain invalid and replacement metadata.

### Step 4: Calculate and review acceptance

Calculate per-trial nearest-rank p50, p95, p99, mean, maximum, threshold counts,
and sample counts. Report each trial separately. Apply the worst-trial rule per
matrix row and never pool trial samples.

Use the shared heap formula exactly:

```text
((usedHeapAtT30 - usedHeapAtT15) / max(usedHeapAtT15, 1)) * 100
```

Do not force garbage collection. An unsupported heap API leaves the heap gate
unqualified. Apply every budget and validity rule from
`PERFORMANCE-ACCEPTANCE.md`; do not create a local exception.

**Verify:** each row has a validity disposition and worst-trial budget result,
including honest failures. No row is accepted from historical diagnostic
artifacts.

### Step 5: Store durable evidence

Write raw evidence outside Git at the exact layout required by both shared
contracts:

```text
.artifacts/performance/018/<commit>/<UTC-stamp>/
```

Include one JSON file per trial, normalized matrix summary, SHA-256 checksums,
resource-monitor summary, controller version/commit, invalid/replacement
records, both the initial profile-definition hash and initial entity/effect
fingerprint, and the full environment metadata required by the acceptance
contract. Update `plans/evidence/018.md` with concise normalized results and
durable artifact/checksum references. `/tmp` may hold scratch data but may not
be the only evidence location.

**Verify:** independently recompute the checksums and confirm every evidence
link resolves on Halla.

### Step 6: Close out and hand off

Rerun all commands in the required-command table plus:

```bash
git diff --check
git diff --name-only
```

Review the diff for gameplay/runtime changes, unexplained drift, scope
mismatch, and evidence overclaiming. Plan 018 becomes `DONE-VERIFIED` only when
the fixed-tick proof and complete hardware-qualified matrix are accepted.
Update its `plans/README.md` row with the implementation and acceptance commit,
evidence, and revalidation date.

The accepted normalized matrix, initial profile-definition hash, initial
entity/effect fingerprint, environment identity, artifact directory, checksums,
and worst-trial row results are the unchanged baseline handoff for Plans
019–025. Those plans must use same-environment comparisons under the shared
contract; they may not reinterpret Plan 018 diagnostic files or invent a
competing measurement protocol.

## Test plan

- Run every command in the required-command table after the Wave 0 entry gate.
- Prove fixed-tick state, scheduler, and save equality for every deterministic
  profile at the same exact tick offset.
- Qualify Halla, the hardware renderer, focus, visibility, advancing RAF,
  viewport, profile definition, and initial entity/effect fingerprint.
- Run three independent valid trials for every canonical matrix row, including
  the real `command-18` outcomes and paired sample minima.
- Recompute per-trial nearest-rank statistics, worst-trial row dispositions,
  the canonical heap formula, and all artifact checksums independently.
- Exercise invalid-trial replacement and exact-owned cleanup without touching
  an unrelated process or listener.

## Performance acceptance

`PERFORMANCE-ACCEPTANCE.md` is authoritative for profile rows, qualification,
three-trial validity, nearest-rank statistics, worst-trial disposition, heap,
determinism, replacement limits, and checksums. A complete valid Plan 018
baseline may close while truthfully reporting failed budgets; missing, invalid,
or software-rendered evidence blocks it. Plans 019–025 inherit the same baseline
and must pass every budget assigned to them.

## Evidence contract

The durable evidence authority is `plans/evidence/018.md`, backed by raw
artifacts at `.artifacts/performance/018/<commit>/<UTC-stamp>/`. It must name
the accepted Wave 0 integration, capture commit, fixed-tick determinism result,
environment and hardware renderer, controller version, profile-definition
hash, initial entity/effect fingerprint, all 21 valid trials, invalid and
replacement dispositions, per-trial and worst-trial results, resource
records, and verified SHA-256 checksums. Missing, invalid, software-rendered,
single-trial, or scratch-only evidence blocks closeout even when a baseline
budget fails.

## Done criteria

- [x] Bounded, resettable runtime distributions and threshold counts exist.
- [x] Scheduler dropped time, backlog, and step diagnostics exist.
- [x] Smoke-only deterministic profiles and capture hooks exist.
- [x] Input-to-command and input-to-next-render-callback are distinct.
- [x] Display-object instrumentation covers the recorded renderer surfaces.
- [ ] Wave 0 is complete and accepted.
- [ ] Required non-browser gates, assets, and build pass at the capture commit.
- [ ] Fixed-tick determinism proof is accepted.
- [ ] The hardware renderer and environment are qualified.
- [ ] All seven matrix rows have three independent valid trials.
- [ ] Real command inputs satisfy every required outcome and sample count.
- [ ] Per-trial statistics and worst-trial row results are recorded.
- [ ] Heap growth uses the canonical `t15`/`t30` formula.
- [ ] Durable raw artifacts, resource summary, environment metadata, and
  SHA-256 checksums are verified.
- [ ] Normalized committed evidence is accepted without overclaiming failures.
- [ ] `plans/README.md` records the final acceptance commit and date.

## STOP conditions

STOP immediately when:

- Wave 0 is not accepted or its integrated commit is absent;
- a drift check is unexplained;
- a required non-browser gate or asset/build check is red;
- deterministic state or save output changes under instrumentation;
- accurate collection would require manual Pixi rendering or a second render;
- profile gating permits normal-demo access;
- Halla violates a start/stop threshold;
- renderer, focus, visibility, RAF, viewport, profile, fingerprint, required
  command outcome, or paired sample qualification fails;
- a trial slot exhausts its one replacement;
- required environment metadata, resource records, raw files, or checksums
  cannot be made durable; or
- another performance capture is active.

## Rollback

On capture failure, stop only the exact owned PIDs, verify owned ports and
descendants are gone, preserve invalid-trial metadata and any diagnostic raw
output, and leave Plan 018 `BLOCKED` until the failed condition is resolved.
Do not delete or relabel a failed trial. This closeout plan authorizes no runtime mutation, so a code-level fix
requires a reviewed amendment and a separate commit. If such an amendment is
later approved and breaks determinism or a required gate, revert only that
Plan 018-owned amendment to the last green checkpoint; never roll back
unrelated Wave 0 or user work.

## Maintenance notes

Keep the accepted matrix, metric names, profile fingerprints, fixed-tick proof,
and artifact layout stable for downstream comparisons. A future measurement or
instrumentation change requires an explicit reviewed amendment; it must not be
smuggled into an optimization wave or reinterpret failed historical trials.
