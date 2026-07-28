# Wargus Roadmap Waves Redesign

**Date:** 2026-07-28
**Status:** Approved design direction; specification pending user review
**Scope:** Roadmap governance and plan documents only. Product implementation
does not begin until the rewritten roadmap is independently reviewed and
approved.

## Context

The repository contains 25 numbered plans, but `plans/README.md` stops at Plan
018. The performance handoff preserved a wave model for Plans 019–025, while
the active roadmap index and shared execution contracts lost that model.

The roadmap audit scored the current state at approximately 59/100:

| Plan group | Audit score | Disposition |
|---|---:|---|
| 001–010 | 56/100 | Freeze implementation history; correct metadata and current successor links |
| 011–017 | 63/100 | Preserve implemented gameplay; distinguish verified completion from user waivers |
| 018–025 | 59/100 | Rewrite execution, measurement, ownership, and wave contracts |

The prior 92/100 gameplay-roadmap score measured pre-implementation plan
quality. It did not grade later evidence integrity, current repository drift,
or Halla execution suitability, so it does not conflict with this audit.

Two present-day verification gates are red:

- `verify:source-resource-ui` assumes a workstation-only `/home/tyler/...`
  original-source path;
- `verify:fixed-demo-polish` asserts two stale source fragments.

Plan 018 implementation is isolated on `perf/plan-018-v2` and its non-browser
gates are green. Its browser evidence is not ready because the old capture
contract combined an impossible heap-window/tab-duration rule with a
software-rendered fallback.

## Goals

1. Make waves and dependencies the authoritative execution order.
2. Preserve completed implementation history without overstating waived proof.
3. Establish one Halla-native browser, process, resource, and evidence policy.
4. Make Plan 018 a statistically defined measurement contract for every later
   optimization.
5. Rewrite Plans 019–025 against the accepted Plan 018 integration seam.
6. Make parallel implementation safe through explicit source-file ownership.
7. Keep benchmark capture serial so measurements remain comparable.
8. Resolve the deferred X12 first-tick pathfinding burst through Plan 024.
9. Finish with independent review, preview verification, production deployment,
   and production smoke testing.

## Non-goals

- Reopening accepted gameplay behavior from Plans 001–017.
- Treating a user waiver as if the original exhaustive gate ran.
- Weakening frame, scheduler, input, heap, determinism, or gameplay budgets.
- Reducing profile workloads, simulation frequency, game speed, or visual
  fidelity to make a benchmark pass.
- Running multiple performance captures simultaneously.
- Stopping or reconfiguring unrelated Halla processes.
- Deploying before the final release wave.

## Roadmap Status Model

Plan identifiers are stable references, not execution order. The roadmap uses
these statuses:

- `TODO`: approved but not started.
- `IN PROGRESS`: implementation or acceptance work is active.
- `BLOCKED`: an explicit entry or STOP condition prevents progress.
- `DONE-VERIFIED`: the implementation and required acceptance evidence passed.
- `DONE-HISTORICAL`: implementation landed, but the historical plan predates
  current evidence conventions or has current successor drift.
- `ACCEPTED-WAIVER`: the user accepted the product state while named original
  acceptance work remained waived.
- `SUPERSEDED`: a successor plan owns the remaining or corrected contract.
- `REJECTED`: the approach must not be integrated.

Every roadmap row records:

- wave;
- dependencies;
- status;
- implementation or acceptance commit;
- evidence path;
- last revalidation date;
- successor or supersession link when applicable.

## Historical Plan Treatment

Plans 001–017 remain historical implementation records. Their product code is
not rewritten during roadmap repair.

### Plans 001–010

Classify as `DONE-HISTORICAL`. Add completion and revalidation metadata, retain
their original instructions, and link current drift to successor plans.
Historical fixed ports, workstation paths, process-group cleanup, and browser
backend assumptions do not govern future work.

### Plans 011–013 and 015

Classify as `DONE-VERIFIED` after reconciling completion metadata with their
existing READY evidence. Do not retroactively fabricate task execution.
Unchecked historical boxes may remain when accompanied by an authoritative
status note explaining that evidence, not checkbox state, is the closeout
record.

Plan 015's active summary must identify the final READY decision and clearly
mark later appended `PENDING` text as superseded historical execution log.

### Plans 014, 016, and 017

Classify as `ACCEPTED-WAIVER`.

- Preserve the user-approved product state.
- Change checklist claims for waived work to `WAIVED` or `NOT RUN`.
- Do not describe Candidate B as an 18-run bakeoff winner.
- Revalidate only if a future claim requires original exhaustive Gate C or
  M-scenario compliance.

## New Shared Documents

### Halla execution policy

Create one shared Halla execution contract covering:

- host, branch, worktree, listener, and process preflight;
- unique ports;
- exact-PID and owned-process-tree cleanup;
- hardware-renderer qualification;
- resource safety thresholds;
- parallel implementation versus serial benchmark rules;
- artifact storage;
- failure cleanup and residual-state checks.

The old gameplay `EXECUTION-GATES.md` resource limits become explicitly
historical. Its gameplay correctness, checkpoint, ownership, and rollback
rules remain useful.

### Performance acceptance contract

Create one canonical performance protocol referenced by Plans 018–025. It
defines profiles, viewports, trials, samples, percentiles, heap calculations,
budgets, environment qualification, artifacts, discard rules, and integration
comparisons.

### Historical status audit

Create one concise audit record for Plans 001–017. This prevents every
historical plan from accumulating repeated explanatory prose while retaining
verified-versus-waived traceability.

## Halla Resource And Process Policy

Halla currently has:

- 8 logical CPUs;
- 14 GiB RAM, with approximately 11 GiB available at audit time;
- 15 GiB swap;
- 329 GiB free workspace storage;
- AMD Lucienne graphics using `amdgpu`;
- `/dev/dri/card1` owned by `video`;
- `/dev/dri/renderD128` owned by `render`.

The `halla` user is not currently a member of `video` or `render`. Plan 026
adds those memberships and verifies them in a fresh process or login session.

CPU and GPU utilization are unrestricted. Memory use may be aggressive, but
owned work stops safely when:

- available RAM falls below 2 GiB;
- used swap exceeds 8 GiB;
- free workspace disk falls below 20 GiB.

A task may start only when:

- available RAM is at least 4 GiB;
- free workspace disk is at least 20 GiB;
- the required port is unoccupied;
- no conflicting project benchmark is active.

These are host-stability guards, not benchmark budgets. High CPU load, high GPU
utilization, or a long valid capture is not a failure.

Only exact owned PIDs and discovered descendants may be stopped. Broad
`pkill`, `killall`, process-group cleanup that can reach unrelated work, and
port-owner termination are prohibited.

## Browser Policy

The in-app Browser remains the first option for interactive browser work. The
user has explicitly approved headless Chromium when the in-app runtime cannot
provide continuously advancing RAF or the required capture hooks.

Performance evidence must record:

- browser executable and version;
- viewport;
- renderer string;
- GPU device and driver;
- document focus, visibility, and RAF advancement;
- commit and build mode;
- host load, memory, swap, and storage pre/post state.

Frame-budget qualification requires hardware rendering. Reject renderer
strings containing `SwiftShader`, `llvmpipe`, or another software renderer.
Software rendering may diagnose harness behavior, but it cannot qualify frame
budgets or serve as a later plan's accepted comparison baseline.

Browser readiness has a 120-second no-progress watchdog. There is no arbitrary
tab-duration ceiling. Once measurement begins, the row ends through the
protocol's explicit stop lifecycle.

## Canonical Plan 018 Measurement Protocol

### Profiles and viewports

Capture:

- `idle-25`, twice at 1280×720;
- `army-100` at 1280×720;
- `army-200` at 1280×720;
- `command-18` at 1280×720;
- `combat-100` at 1280×720;
- `command-18` at 1024×768.

Run three independent valid trials for every matrix row. A trial gets a fresh
page and deterministic profile. Browser cache may be prewarmed outside the
measurement window, but runtime world state may not be reused.

### Trial lifecycle

1. Load the fresh profile and wait for `loadingVisible === false`.
2. Verify hardware renderer, focused/visible document, advancing RAF, profile
   identity, viewport, and initial entity/effect fingerprint.
3. Warm up for 5 seconds.
4. Reset and start metrics at `t0`.
5. Save CPU/input summary and heap window 1 at `t15`.
6. Save heap window 2 and stop at `t30`.
7. Export the raw trial artifact, resource-monitor summary, and checksum.
8. Close the page and verify owned-process and port cleanup when the browser
   session ends.

### Command profile

Validate the synthetic command hook in a disposable preflight page, then close
that page. Synthetic samples are not included in the real-input percentile.

Each measured `command-18` trial uses real keyboard and mouse input:

- ten alternating move/attack-move pairs;
- commands issued during the first 10 measured seconds at fixed wall-clock
  offsets;
- at least 20 successful command outcomes;
- at least 40 input-handler-to-command samples;
- at least 40 input-handler-to-next-render samples.

The artifact records individual command kind, issue offset, success, queue
modifier, command latency, and next-render-callback latency.

### Statistics and budgets

For each trial, calculate p50, p95, p99, mean, maximum, threshold counts, and
sample count using the existing nearest-rank contract.

The trial-level budget contract is:

- every profile: frame p95 ≤33.3 ms;
- every profile: frame p99 ≤50 ms;
- every profile: frames over 50 ms ≤1%;
- every profile: scheduler dropped delta = 0;
- every profile: maximum scheduler backlog ≤0.25 seconds;
- every profile: heap growth ≤15%;
- `command-18`: input-to-command p95 ≤50 ms;
- `command-18`: input-to-next-render-callback p95 ≤100 ms.

Heap growth is:

```text
((usedHeapAtT30 - usedHeapAtT15) / max(usedHeapAtT15, 1)) * 100
```

Do not force garbage collection. Record heap API support and endpoint values.
An unsupported heap API leaves the heap gate unqualified and prevents plans
that require heap acceptance from completing.

For a matrix row, report every trial and the worst trial-level budget result.
Do not pool samples across trials to hide a slow trial. Plan 018 may complete
with failed baseline budgets because it establishes the measurement contract.
Plans 019–025 must satisfy their assigned budgets.

### Retry and discard rules

Discard a trial only for:

- renderer or viewport mismatch;
- hidden/unfocused document;
- non-advancing RAF;
- runtime load/profile failure;
- browser crash;
- resource safety abort;
- missing required input outcome or sample pairing.

Never discard a valid trial because it fails a performance budget. Allow one
replacement for an invalid trial and preserve both invalid and replacement
metadata in evidence.

## Determinism Contract

Wall-clock performance trials do not need identical ending ticks. Ending tick,
dropped time, and backlog are measured outcomes.

The non-browser verifier runs each deterministic profile twice for an exact
fixed simulation-tick offset and compares:

- canonical state hash;
- entity/effect counts and IDs;
- positions, hit points, owners, orders, and command targets;
- scheduler-requested tick count;
- save serialization where applicable.

Browser trial repeats must match the initial profile-definition hash and
initial entity/effect fingerprint. This proves equivalent starting state
without treating renderer cadence as simulation determinism.

## Evidence And Artifact Contract

Raw artifacts live outside Git but inside a durable ignored workspace path:

```text
.artifacts/performance/<plan>/<commit>/<UTC-stamp>/
```

Every capture directory contains:

- one JSON file per trial;
- a normalized matrix summary;
- SHA-256 checksums;
- browser/environment metadata;
- resource-monitor summary;
- controller version or commit;
- invalid/discarded trial records.

Commit concise normalized results to `plans/evidence/NNN.md`. Evidence must not
depend only on `/tmp` paths. Generated raw files remain uncommitted.

Before/after comparisons use the same host, browser, hardware renderer,
viewport, build mode, profile definition, warmup, duration, and aggregation
rule.

## Plan-Specific Rewrite

### Plan 018

- Expand declared scope to include every actual instrumentation surface.
- Preserve existing commits and tests rather than restarting.
- Replace the old browser contract with this specification.
- Add fixed-tick profile determinism and statistically defined command trials.
- Complete the hardware matrix and update evidence honestly.

### Plan 019

- Refresh against the accepted Plan 018 integration commit.
- Keep terrain metadata semantically isolated from occupancy.
- Use shared Wave 2 baselines and evidence rules.
- Add explicit rollback and coordinator-owned shared-file rules.

### Plan 020

- Refresh all `orders.ts` anchors after Plan 018.
- Specify unit-index mutation and invalidation ownership.
- Preserve authoritative array iteration and save exclusion.
- Add rollback and shared wave integration rules.

### Plan 021

- Remove the unsupported dependency on Plan 020.
- Refresh the renderer seam for Plan 018 display-object instrumentation.
- Preserve tracked create/destroy counters through preparation parity.
- Run in parallel with Plans 019 and 020.

### Plan 022

- Normalize to the full executor template.
- Extend Plan 018's existing display-object counters rather than adding a
  competing telemetry system.
- Specify per-kind cache ownership, bounds, disposal, and rollback.
- Standardize evidence at `plans/evidence/022.md`.

### Plan 023

- Normalize scope, drift, STOP, evidence, and rollback sections.
- Assign every occupancy-relevant mutation seam.
- Keep authoritative state and ordered iteration explicit.
- Serialize its ownership after Plans 019 and 020.

### Plan 024

- Replace the four-whole-search count with deterministic node-expansion work
  budgeting and resumable A* from the start.
- Make pending path requests mandatory, save-safe authoritative state with
  backward-compatible normalization and deterministic sequence restoration.
- Define cancellation, supersession, retry fairness, and starvation bounds.
- Make X12 a required acceptance scenario.
- Keep the rejected `2fa96ce` endpoint-changing approach prohibited.

### Plan 025

- Put authoritative visibility contribution state in explicit simulation-owned
  transient runtime storage with deterministic rebuild on load/world change;
  do not serialize derived contribution caches.
- Specify bounded per-source tile records and renderer chunk caches.
- Separate simulation visibility correctness from renderer fog retention.
- Keep full-rebuild parity as the oracle and rollback path.
- Standardize evidence at `plans/evidence/025.md`.

### Plan 026 — Halla browser and process foundation

Add a successor plan covering:

- `render`/`video` access and fresh-process verification;
- hardware Chrome preflight;
- dynamic inspected ports;
- exact-PID cleanup;
- removal of unsafe process-group cleanup;
- shared resource monitor;
- durable performance artifact directories;
- current browser-plugin versus repository-gate policy.

### Plan 027 — Verification drift repair

Add a focused successor plan covering:

- configurable or vendored original-source roots on Halla;
- `verify:source-resource-ui` portability;
- behavior-based replacement for the two stale
  `verify:fixed-demo-polish` fragments;
- revalidation of the affected historical contracts.

## Wave Model

| Wave | Plans | Parallel rule | Exit gate |
|---|---|---|---|
| 0 — Foundation repair | 026, 027 | Parallel isolated worktrees | Current drifted gates green; hardware Chrome and safe process controller qualified |
| 1 — Measurement foundation | 018 | Single integration branch | Complete reviewed three-trial matrix; measurement harness READY |
| 2 — Independent hot paths | 019, 020, 021 | Three parallel worktrees | Each branch reviewed; combined integration matrix shows no correctness regression |
| 3 — Structural optimization | 022, 023 | Two parallel worktrees | Renderer and simulation parity green; combined budgets/evidence reviewed |
| 4 — High-risk scheduling | 024, 025 | Parallel only under rewritten ownership boundaries | X12 resolved; save/determinism/visibility/fog and full performance matrix pass |
| 5 — Release | Combined roadmap | Serial integration/review/deploy | Full gates, preview smoke, production deploy, production smoke |

Implementation work may run concurrently within a wave. Performance capture is
serialized by the coordinator because simultaneous captures invalidate
comparability.

## Shared-File Ownership

| Hotspot | Serialized ownership |
|---|---|
| `src/simulation/orders.ts` | 018 → 020 → 023 → 024 |
| `src/simulation/passability.ts` | 019 → 023 |
| `src/simulation/world.ts` | 019 → 023 → 025 |
| `src/view/renderWorld.ts` | 018 → 021 → 022 → 025 |
| `src/view/worldRenderCache.ts` | 022 → 025 |
| `src/wargus/saveGame.ts` and normalizers | 023 lifecycle review → 024; Plan 025 may not add derived caches |
| `src/main.ts` and performance summary schema | 018 base; later namespaced extensions integrated by coordinator |
| `src/performance/*` | 018 base; later plan-specific diagnostics are namespaced |
| `package.json` | Wave coordinator |
| `plans/README.md` | Wave coordinator |
| `plans/evidence/NNN.md` | Individual plan owner |

Parallel plans may propose `package.json` script fragments in their reports,
but the wave coordinator applies shared-manifest and roadmap-index changes
after implementation review.

## Wave Execution And Integration

1. Every plan starts from the wave's accepted integration commit.
2. Each implementation uses an isolated worktree and plan-specific branch.
3. Each plan receives independent scope/spec review.
4. Focused tests run in the plan worktree.
5. Benchmark captures run serially against that exact branch and the shared
   wave-start baseline.
6. The coordinator integrates approved branches one at a time.
7. After all wave branches integrate, run the combined focused gates and full
   Plan 018 matrix.
8. A later wave starts only after the combined wave evidence is READY.

Rollback removes only the unaccepted plan or checkpoint. It never resets
unrelated user work or accepted sibling plans.

## Release Wave

After Plans 018–027 and X12 acceptance are complete:

1. Run focused gates, full typecheck, determinism, Wargus asset verification,
   production build, full verification, and browser/playable matrices.
2. Independently review the combined diff and evidence.
3. Deploy a preview build to the existing linked site.
4. Smoke-test the preview, including `/wargus/manifest.json`.
5. Deploy production to the existing linked Netlify site.
6. Smoke-test production through the approved browser path before reporting
   completion.

The prior user authorization for the final production deployment remains in
force. It does not authorize an early deployment.

## Roadmap Rewrite Acceptance

The documentation-only rewrite is ready for execution planning when:

- every numbered plan appears in the wave/status index;
- historical verified and waived outcomes are unambiguous;
- Plans 018–027 use or reference current shared execution contracts;
- all dependencies and shared hotspots match the wave table;
- every active plan has explicit entry, STOP, rollback, evidence, and exit
  gates;
- the Plan Optimizer score exceeds 90/100 and plateaus;
- an independent reviewer finds no blocking contradiction;
- the user approves the rewritten plan set.
