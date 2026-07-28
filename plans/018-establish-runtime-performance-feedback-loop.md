# Plan 018: Establish A Reproducible Runtime Performance Feedback Loop

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before continuing. Stop
> on any STOP condition; do not tune gameplay or optimize runtime code in this
> plan. Update `plans/README.md` when complete unless a coordinator owns it.
>
> **Drift check (run first)**:
> `git diff --stat 8ac0006..HEAD -- src/main.ts src/simulation/orders.ts src/performance scripts/verify-playtest-telemetry.mjs scripts/verify-performance-metrics.mjs package.json plans/018-establish-runtime-performance-feedback-loop.md plans/evidence/018.md plans/README.md`
> If the ticker, scheduler, telemetry, or smoke-hook excerpts below changed,
> STOP and reconcile this plan before editing.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf, tests, dx
- **Planned at**: commit `8ac0006`, 2026-07-27

## Why this matters

The game is reported to become unplayable as units, buildings, and commands
accumulate, but the current feedback loop keeps only last values and
exponential averages. Those values can hide isolated 50–500 ms stalls, time
dropped by the simulation backlog cap, and slow input acknowledgement. This
plan creates the measurement contract every later optimization must beat.

## Current state

- `src/main.ts` owns the Pixi ticker, update/render timing, smoke hooks, and
  local-storage playtest log.
- `src/simulation/orders.ts` owns the fixed-step scheduler.
- `scripts/verify-playtest-telemetry.mjs` only checks that source strings exist.
- `plans/MECHANICS-ACCEPTANCE.md` has average update/render limits but no tail
  latency or input budget.

```ts
// src/main.ts:258
const renderPerformance = {
  averageFrameMs: null as number | null,
  averageUpdateMs: null as number | null,
  averageRenderMs: null as number | null,
  ...
};

// src/main.ts:4053
renderPerformance.averageFrameMs =
  smoothedTiming(renderPerformance.averageFrameMs, elapsedMs);

// src/simulation/orders.ts:5463
const acceptedDeltaSeconds = Math.min(
  deltaSeconds,
  Math.max(0, maximumBacklogSeconds - world.accumulator)
);
```

The deterministic rule remains absolute: diagnostics may use
`performance.now()`, but timing values must never enter `WorldState`, saves, AI
decisions, order selection, or deterministic hashes.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install, only if `node_modules` is absent | `npm ci` | exit 0 |
| Typecheck | `./node_modules/.bin/tsc --noEmit` | exit 0 |
| Metrics verifier | `npm run verify:performance-metrics` | exits 0 and reports percentile/threshold cases |
| Telemetry verifier | `npm run verify:playtest-telemetry` | exits 0 |
| Scheduler | `npm run verify:simulation-scheduler` | exits 0 |
| Determinism | `npm run verify:runtime-determinism` | exits 0 |
| Asset gate | `npm run verify:wargus-assets` | exits 0 |

If installation requires network access, request approval; do not substitute a
different package manager or version.

## Scope

**In scope**:

- `src/performance/runtimePerformance.ts` (create)
- `src/performance/performanceProfiles.ts` (create)
- `src/main.ts`
- `src/simulation/orders.ts`, only to return scheduler diagnostics
- `scripts/verify-performance-metrics.mjs` (create)
- `scripts/verify-playtest-telemetry.mjs`
- `package.json`
- `plans/evidence/018.md` (create during execution)
- `plans/README.md`

**Out of scope**:

- Optimizing rendering, pathfinding, visibility, AI, or HUD behavior
- Changing simulation budgets, tick rate, game speed, unit counts, or balance
- Serializing performance data in save games
- Standalone Playwright, shell-launched Chrome, Computer Use, or an external
  browser-control server

## Git workflow

- Suggested branch: `codex/018-performance-feedback-loop`
- Commit logical checkpoints separately: metrics core, scheduler/input
  instrumentation, then deterministic profiles.
- Use short imperative messages such as `Add runtime performance budgets`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Establish the baseline

Run typecheck, telemetry, scheduler, determinism, and asset commands from the
table. The current checkout observed by the advisor had no `node_modules`; that
is an environment fact, not permission to skip the baseline.

**Verify**: all five baseline commands exit 0. STOP on a red baseline.

### Step 2: Add bounded raw measurements and pure summaries

Create `src/performance/runtimePerformance.ts` with:

- fixed-capacity ring buffers, never unbounded arrays;
- raw frame interval, update CPU, render-preparation CPU, smoke CPU, long-task,
  and input-to-command/next-render samples;
- counts for frames over 16.7, 33.3, and 50 ms;
- p50, p95, p99, maximum, mean, sample count, and effective FPS;
- one explicit reset/start/stop/snapshot lifecycle;
- no dependency on `WorldState`.

Use nearest-rank percentiles over a copied/sorted snapshot. Keep collection
allocation outside the normal frame path except when a summary is requested.

**Verify**: `npm run verify:performance-metrics` covers empty, singleton,
ordered, reverse-ordered, percentile-boundary, ring-wrap, and threshold cases.

### Step 3: Expose scheduler work and lost-time diagnostics

Change `simulateWorld` to return a diagnostic result without changing its state
transition order:

```ts
type SimulationTurnResult = {
  acceptedDeltaSeconds: number;
  droppedDeltaSeconds: number;
  processedSteps: number;
  remainingBacklogSeconds: number;
  turnMilliseconds: number;
  maxStepMilliseconds: number;
};
```

Existing callers may ignore the return value. Measure individual steps only
when performance capture is active; otherwise avoid adding a clock call per
tick. Record the result from the production ticker in the performance ring.

**Verify**: `npm run verify:simulation-scheduler` still proves identical tick
counts/save state and now also asserts accepted+dropped delta and backlog.

### Step 4: Measure input acknowledgement and frame response

At the existing world pointer and HUD command dispatch seams in `src/main.ts`,
record:

1. input handler entry;
2. order/command return;
3. the next completed ticker render-preparation callback.

Keep two distinct metrics: synchronous input-to-command and
input-to-next-render-callback. Name the latter honestly; do not call it GPU
presentation latency. Install a bounded `PerformanceObserver` for `longtask`
when supported and report unsupported status otherwise.

**Verify**: the metrics verifier exercises pairing, missing-next-frame,
overlapping inputs, and bounded retention.

### Step 5: Add deterministic load profiles

Create smoke-only profiles in `performanceProfiles.ts`:

- `idle-25`: 25 live units, no commands;
- `army-100`: 100 live units plus representative buildings;
- `army-200`: 200 live units plus representative buildings;
- `command-18`: source maximum-sized selection issuing a distant formation
  move and then attack-move;
- `combat-100`: two 50-unit forces with projectiles/effects.

Profiles must use fixed IDs, positions, owners, and commands. They may be
loaded only when `?smoke=1&perfProfile=<id>` is present and must never alter the
normal demo. Expose:

- `window.__WARGUS_TS_PERF_START__(profileId)`
- `window.__WARGUS_TS_PERF_STOP__()`
- `window.__WARGUS_TS_PERF_SUMMARY__()`
- `window.__WARGUS_TS_PERF_RESET__()`

Each summary includes profile, viewport, world tick, entity/effect counts,
scheduler diagnostics, frame/update/render/input distributions, long tasks,
heap when supported, and display-object create/destroy counters.

**Verify**: `npm run verify:performance-metrics` proves profile definitions are
deterministic and reject unknown IDs.

### Step 6: Run the bounded in-app Browser matrix

Follow `AGENTS.md`: use the Codex in-app Browser with the `iab` backend. Inspect
Halla listeners first, choose an unused port, record the exact server PID, and
clean up only that PID. Do not run any tab longer than 30 seconds.

For each profile at 1280×720:

1. load a fresh profile;
2. warm up 5 seconds;
3. reset metrics;
4. capture 15 seconds;
5. export the summary and close the tab.

Repeat `command-18` at 1024×768. Record raw JSON artifact paths and a compact
summary in `plans/evidence/018.md`; do not commit generated JSON.

Freeze these roadmap exit budgets:

- `army-100`: p95 frame ≤33.3 ms, p99 ≤50 ms, frames >50 ms ≤1%;
- `command-18`: input-to-command p95 ≤50 ms and input-to-next-render p95
  ≤100 ms;
- no profile: scheduler dropped time or backlog older than 250 ms during the
  measured window;
- heap after warmup must not grow by more than 15% across equal consecutive
  15-second windows.

Plan 018 establishes honest baselines; it is DONE when measurements are
captured even if budgets fail. Later plans are not DONE until their assigned
profiles meet the frozen budgets.

### Step 7: Close out

Run all commands in the table, `git diff --check`, and the determinism source
scan. Create `plans/evidence/018.md` with profile summaries, artifact paths,
environment, and READY/NOT READY for use as a measurement harness.

## Test plan

- Pure metric edge cases and ring-buffer bounds in
  `scripts/verify-performance-metrics.mjs`.
- Scheduler result parity in `scripts/verify-simulation-scheduler.mjs`.
- Existing telemetry hook/export checks strengthened to require distributions,
  scheduler data, and performance profile hooks.
- Two repeated `idle-25` runs must have identical simulation tick/entity state;
  timings may differ.
- In-app profiles exercise idle, density, commands, and combat.

## Done criteria

- [ ] Performance samples expose p50/p95/p99/max, missed-frame thresholds,
  effective FPS, long tasks, scheduler backlog/dropped time, and input latency.
- [ ] All buffers are bounded and resettable.
- [ ] Five deterministic profiles are smoke-only.
- [ ] `npm run verify:performance-metrics`,
  `verify:simulation-scheduler`, `verify:playtest-telemetry`,
  `verify:runtime-determinism`, and `verify:wargus-assets` pass.
- [ ] The bounded profile matrix is recorded in `plans/evidence/018.md`.
- [ ] No gameplay or optimization change is mixed into the diff.
- [ ] `plans/README.md` marks 018 DONE.

## STOP conditions

- Instrumentation changes deterministic world/save output.
- Accurate collection requires manual Pixi rendering or a second render per
  frame.
- A profile is reachable without `?smoke=1`.
- A live browser segment would exceed 30 seconds.
- The required in-app Browser is unavailable; report rather than falling back.
- Any baseline or focused verifier fails twice.

## Maintenance notes

Every performance PR should attach before/after summaries from the same
profile, viewport, build mode, and Halla environment. Reviewers should reject
optimizations supported only by averages. If Pixi later exposes reliable GPU
timings, add them as a separate optional phase without relabeling the current
next-render-callback metric.
