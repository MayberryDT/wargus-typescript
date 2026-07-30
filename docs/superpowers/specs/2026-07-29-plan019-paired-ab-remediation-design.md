# Plan 019 Paired A/B Performance Remediation Design

Date: 2026-07-29

## Status

Approved for execution by the user on 2026-07-29.

## Problem

The definitive Plan 019 incremental packet at exact implementation commit
`5935a17f456868051c2c16b2f0d8d2b4da56d115` completed all required trials but
failed because one of three row-3 frame-p95 values was `66.6 ms`. The other two
were `50.0 ms`; the accepted Plan 018 baseline worst was `50.1 ms`.

The slow trial does not show a corresponding broad slowdown:

- Plan 019 row-3 frame means were `23.999`, `25.277`, and `24.240 ms`.
- Baseline frame means were `25.203`, `25.332`, and `25.055 ms`.
- Plan 019 worst frame p99 was `333.3 ms`; baseline worst was `350.0 ms`.
- Update and render-preparation means were effectively unchanged.

The existing worst-of-three p95 rule is therefore unable to distinguish a real
Plan 019 regression from quantile-boundary variance. Changing production code
or the acceptance rule without a controlled paired experiment would be
speculative.

## Constraints

- Preserve every existing baseline, failed packet, manifest, and report.
- Freeze the reviewed successor harness at coordinator commit
  `82571c31a942cc38857f612ec6736cca05a174ce`.
- Compare exact pre-Plan019 commit
  `5b7d9cc81072c8aeda1ce1a9c22602569e1a691b` with exact Plan 019 commit
  `5935a17f456868051c2c16b2f0d8d2b4da56d115`.
- Do not weaken budgets, determinism checks, fingerprints, source attribution,
  lifecycle checks, or cleanup.
- Hold the global capture lock for the complete diagnostic.
- Run only one Vite/Chrome capture pair at a time on Halla.
- Use system Chrome, the qualified hardware Vulkan renderer, fixed row 3
  (`army-100`, `1280x720`, DPR 1), and exact owned-PID cleanup.
- Diagnostic captures are not release acceptance packets.

## Approaches Considered

### 1. Paired alternating A/B experiment — selected

Run fifteen matched base/Plan019 pairs, alternating order by pair (`A→B`,
`B→A`). Each arm uses a fresh browser context and process lifecycle. This
controls host drift and gives enough observations to distinguish a consistent
effect from one quantile-boundary outlier.

### 2. Optimize the terrain cache immediately — rejected

The current evidence does not identify a hot path regression. Blind
optimization risks changing correct parity behavior while leaving the unstable
gate untouched.

### 3. Replace worst-of-three immediately — rejected

The existing gate may be noisy, but changing it before measuring paired
behavior would make the change look result-driven. The paired experiment must
decide whether code or acceptance methodology is at fault.

## Diagnostic Architecture

Add a coordinator-owned paired diagnostic runner and contract verifier. The
runner creates detached disposable worktrees at the two exact commits and
records their clean identities. For each of fifteen pairs it:

1. chooses order from the fixed alternating sequence;
2. starts one exact Vite/system-Chrome pair for the selected arm;
3. verifies the manifest route, hardware renderer, profile fingerprint,
   viewport, focus, visibility, and advancing RAF;
4. captures one 30-second row-3 trial using the existing runtime hooks;
5. records raw frame, update, render-preparation, scheduler, heap, and host
   resource samples;
6. cleans every owned PID and port before starting the other arm.

The complete run holds the existing
`.artifacts/performance/.wargus-capture.lock`. It writes a retained,
checksummed diagnostic packet under a separate `diagnostics/plan019-paired-ab`
namespace so it cannot be mistaken for an acceptance packet.

## Analysis

For each pair, compute the relative Plan019-versus-base difference for:

- frame p50, p95, p99, mean, and maximum;
- counts over 50 and 100 ms;
- update p95 and mean;
- render-preparation p95 and mean;
- scheduler dropped time and maximum backlog.

Also compute pooled frame distributions for each arm.

Classify a real row-3 regression only when all three conditions hold:

1. median paired frame-p95 regression is greater than 5%;
2. at least 11 of 15 pairs regress by more than 5%;
3. pooled frame-p95 regression is greater than 5%.

This is a diagnostic classification, not a replacement release gate.

## Decision Branches

### Real regression

If all three conditions hold:

- collect matched Chrome CPU profiles/traces for representative slow base and
  Plan019 trials outside the verdict samples;
- locate the production hot path;
- add a focused failing performance/work-reduction test;
- implement the smallest Plan 019 production correction;
- independently review it;
- rerun the paired diagnostic and the unchanged release acceptance packet.

### Acceptance instability

If any condition does not hold:

- retain the diagnostic as proof that worst-of-three is unstable;
- amend the successor acceptance contract to use seven valid trials per row;
- require both median trial-p95 and pooled-p95 regression to be at most 5%;
- keep no-new-budget-failures, comparability, lifecycle, and absolute-budget
  reporting unchanged;
- capture a fresh paired Plan 018 baseline under the amended harness;
- independently review the amendment and baseline;
- rerun Plans 019–021 serially.

## Failure Handling

Any identity drift, invalid fingerprint, renderer mismatch, resource abort,
lock failure, checksum failure, or cleanup residual invalidates the diagnostic.
One replacement is allowed per arm within a pair. Exhaustion stops the
diagnostic and preserves the partial packet. No result may be inferred from an
incomplete packet.

## Verification

- A contract verifier proves exact commits, 15 alternating pairs, one active
  capture at a time, decision arithmetic, replacement limits, and fail-closed
  publication.
- The runner must pass syntax, type, determinism, asset, and focused Plan 019
  checks before browser execution.
- An independent reviewer recomputes the manifest, pair statistics,
  classification, lock lifecycle, and cleanup before either decision branch is
  implemented.
