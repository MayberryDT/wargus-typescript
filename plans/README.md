# Wargus Roadmap Index

This is the authoritative status and wave index for Plans 001–027. Plan IDs are
stable references; waves govern execution order. Plans 001–017 are completed
historical entries, not current execution work. Their detailed classification,
recorded commits, evidence, revalidation dates, drift, successors, and waiver
boundaries are authoritative in
[the historical plan audit](HISTORICAL-PLAN-AUDIT.md).

## Roadmap rewrite approval gate

The optimized roadmap closeout is documentation only. Its readiness verdict is
`READY FOR USER REVIEW`, not authorization to start Wave 0. After the rewrite
commit, STOP: do not execute Plan 026, Plan 027, any later roadmap plan, a
browser/runtime capture, host or tooling mutation, preview, or deployment until
the user explicitly approves this roadmap for execution.

`TODO` and `BLOCKED` below describe truthful plan state; neither status
grants execution authority. Once approval is recorded, Wave 0 remains the first
allowed work and every detailed entry/STOP condition still applies. The prior
user authorization for final production deployment remains in force only after
Plans 018–027, X12, combined verification/review, and preview smoke are complete;
it does not authorize Wave 0, an early preview, or an early deployment.

## Status vocabulary

- `TODO`: planned but not started; an unopened approval, dependency, or wave gate
  is expected and does not by itself change this status.
- `IN PROGRESS`: eligible implementation or acceptance work is active.
- `BLOCKED`: work has started or landed, but an explicit STOP or exceptional
  condition prevents its next required step.
- `DONE-VERIFIED`: implementation and required acceptance evidence passed.
- `DONE-HISTORICAL`: implementation landed, but the plan predates current
  evidence conventions or has current successor drift.
- `ACCEPTED-WAIVER`: the user accepted the product state while named original
  acceptance work remained waived.
- `SUPERSEDED`: a successor plan owns the remaining or corrected contract.
- `REJECTED`: the approach must not be integrated.

## Wave order

| Wave | Plans |
|---|---|
| 0 — Foundation repair | 026, 027 |
| 1 — Measurement foundation | 018 |
| 2 — Independent hot paths | 019, 020, 021 |
| 3 — Structural optimization | 022, 023 |
| 4 — High-risk scheduling | 024, 025 |
| 5 — Release | combined verification, review, preview, production |

The Plan 026 branch and Plan 027's two implementation checkpoints may execute
in parallel in isolated worktrees under the frozen Wave 0 ownership below.
Plan 027 browser/historical revalidation and closeout run only after Plan 026 is
accepted and coordinator-integrated. Performance captures are serial. A later
wave starts only after every predecessor exit gate is accepted and integrated.

| Wave 0 owner | Exclusive implementation slice | Verification and integration boundary |
|---|---|---|
| 026 | shared browser execution controller; every browser verifier server/debug-port/cleanup migration; controller verifier and generic browser resource/artifact helpers | owns all browser lifecycle, allocation, and cleanup behavior plus evidence 026 |
| 027 | exactly `scripts/verify-source-resource-ui.mjs` and the two named assertions in `scripts/verify-fixed-demo-polish.mjs` | owns branch-local red/green proof and evidence 027; source-pathfinding and all browser verifiers are read-only gates |
| Wave coordinator | no plan-local implementation | after Plan 026 checkpoint approval, integrates `.gitignore`/`package.json`, runs Plan 026 final verification, records acceptance, then runs Plan 027 browser/historical revalidation; alone closes `plans/README.md` rows |

Wave 2 begins only after Plan 018 is accepted and integrated, not after its
documentation rewrite alone. Plans 019, 020, and 021 then execute independently;
Plan 021 does not depend on Plan 020 and does not consume its simulation index.
Parallel ownership is frozen as follows:

| Plan | Exclusive implementation slice | Exclusive focused verifier/evidence |
|---|---|---|
| 019 | terrain metadata plus terrain-only consumers in `passability.ts` and `world.ts` | `verify-terrain-metadata-cache`, evidence 019 |
| 020 | transient simulation unit-ID lookup and invalidation in `worldSelectors.ts` and `orders.ts` | `verify-unit-index`, evidence 020 |
| 021 | render-only prepared snapshots and their consumption in `renderWorld.ts` | `verify-render-preparation`, evidence 021 |

The Wave coordinator owns shared `package.json`, `plans/README.md`, and any
cross-plan verifier integration.

Wave 3 has a strict coordinator start barrier: Plans 019, 020, and 021 must all
pass their Wave 2 exit gates and integrate, then the coordinator must run the
Wave 2 post-integration gate from `HALLA-EXECUTION-POLICY.md` against the exact
combined SHA and commit `plans/evidence/WAVE-2-INTEGRATION.md` with a combined
`READY` verdict before either Wave 3 executor starts. Individual exit packets
and integration without that coordinator-owned packet do not open Wave 3.
After that barrier opens, the technical dependency edges remain narrower: Plan
022 consumes accepted Plan 021 and owns renderer-only retained objects and
per-view caches; Plan 023 consumes accepted Plans 019 and 020 and owns
deterministic simulation occupancy plus its passability/order mutation seams.
Plan 022 and Plan 023 then execute independently in isolated worktrees:

| Plan | Exclusive implementation slice | Exclusive focused verifier/evidence |
|---|---|---|
| 022 | renderer-only object retention, per-view cache lifecycle, and renderer call-site counter tags | `verify-world-render-cache`, evidence 022 |
| 023 | simulation occupancy index, occupancy-only `passability.ts` consumers, and occupancy mutation calls in `orders.ts` | `verify-occupancy-index`, evidence 023 |

The Wave coordinator owns shared `src/main.ts`, performance-schema,
`package.json`, and `plans/README.md` integration. Plan-local diagnostics and
counter extensions must use the plan namespaces frozen in the detailed plans.

Wave 4 has a strict coordinator start barrier: Plans 022 and 023 must both pass
every Wave 3 exit gate and integrate, then the coordinator must run the Wave 3
post-integration gate against the exact combined SHA and commit
`plans/evidence/WAVE-3-INTEGRATION.md` with a combined `READY` verdict before
either Wave 4 executor starts. Individual exit packets and integration without
that coordinator-owned packet do not open Wave 4. Plan 024 then consumes
accepted Plans 018, 019, 020, and 023; Plan 022 is a wave barrier rather than
its API dependency. Plan 025 consumes accepted Plans 018, 019, 022, and 023.
After the Wave 3 combined packet is `READY`, the coordinator compares the
integrated seams with concrete drift base
`0993cdd55818aa015c42e3e71e18d4b57ab016ea` and refreshes either detailed plan
with a new concrete accepted SHA, excerpts, and inventories if a cited seam
changed.

Plans 024 and 025 may execute concurrently in isolated worktrees only while
this ownership remains disjoint; otherwise the coordinator serializes Wave 4:

| Plan | Exclusive implementation slice | Exclusive focused verifier/evidence |
|---|---|---|
| 024 | `pathRequests.ts`, resumable `pathfinding.ts`, path request/order seams in `orders.ts`, additive pending-request fields/normalization in `saveGame.ts`, and its save-schema assertions | `verify-pathfinding-budget`, `verify-x12-first-tick`, evidence 024 |
| 025 | transient `visibilityCache.ts`, visibility maintenance in `world.ts`, renderer-only `fogChunkCache.ts`, and fog-only `renderWorld.ts` consumption; no save fields | `verify-visibility-fog-incremental`, evidence 025 |

The Wave coordinator owns shared `src/main.ts`, performance-schema,
`package.json`, and `plans/README.md` integration. Plan-local diagnostics use
the namespaces frozen in the detailed plans. Performance captures stay serial
even when implementation and focused checks run in parallel.

Wave 5 has a strict coordinator start barrier: Plans 024 and 025 must pass
every Wave 4 exit gate and integrate, then the coordinator must run the Wave 4
post-integration gate against the exact combined SHA and commit
`plans/evidence/WAVE-4-INTEGRATION.md` with a combined `READY` verdict. Combined
release verification, review, preview, and production work may not start from
individual exit packets or integration alone.

## Plan status and dependencies

| Plan | Title | Wave | Priority | Dependencies | Status | Implementation / acceptance commit | Evidence | Last revalidated | Successor |
|---|---|---|---|---|---|---|---|---|---|
| 001 | Add repository agent guidance | Historical | P1 | — | DONE-HISTORICAL | `6af2eeb` | pre-evidence; [audit](HISTORICAL-PLAN-AUDIT.md) | not recorded | — |
| 002 | Restore runtime determinism verification | Historical | P1 | — | DONE-HISTORICAL | `6af2eeb` | [018 determinism revalidation](evidence/018.md); [audit](HISTORICAL-PLAN-AUDIT.md) | 2026-07-27 | — |
| 003 | Upgrade Vite out of the vulnerable range | Historical | P1 | — | DONE-HISTORICAL | `6af2eeb` | pre-evidence; [audit](HISTORICAL-PLAN-AUDIT.md) | not recorded | Plan 027 revalidation |
| 004 | Harden map setup JSON loading against SPA fallback HTML | Historical | P1 | — | DONE-HISTORICAL | `6af2eeb` | pre-evidence; [audit](HISTORICAL-PLAN-AUDIT.md) | not recorded | — |
| 005 | Stabilize stale fixed-demo verifier contracts | Historical | P2 | 002 | DONE-HISTORICAL | `6af2eeb` | pre-evidence; [audit](HISTORICAL-PLAN-AUDIT.md) | not recorded | Plan 027 |
| 006 | Extract a low-risk orders.ts pilot slice | Historical | P3 | 002, 005 | DONE-HISTORICAL | `6af2eeb` | pre-evidence; [audit](HISTORICAL-PLAN-AUDIT.md) | not recorded | Plan 027 revalidation |
| 007 | Fix browser runtime smoke process cleanup | Historical | P1 | — | DONE-HISTORICAL | `6af2eeb` | pre-evidence; [audit](HISTORICAL-PLAN-AUDIT.md) | not recorded | Plans 026 and 027 |
| 008 | Include omitted verifiers in the full verify gate | Historical | P1 | — | DONE-HISTORICAL | `6af2eeb` | pre-evidence; [audit](HISTORICAL-PLAN-AUDIT.md) | not recorded | Plan 027 |
| 009 | Extract a browser verifier harness pilot | Historical | P2 | 007 | DONE-HISTORICAL | `6af2eeb` | pre-evidence; [audit](HISTORICAL-PLAN-AUDIT.md) | not recorded | Plans 026 and 027 |
| 010 | Convert fixed-demo speed verifier to a layout contract | Historical | P2 | 008 | DONE-HISTORICAL | `6af2eeb` | pre-evidence; [audit](HISTORICAL-PLAN-AUDIT.md) | not recorded | Plan 027 revalidation |
| 011 | Restore the original two-phase construction lifecycle | Historical | P1 | — | DONE-VERIFIED | `a93ef25` / `71de976` | [011](evidence/011.md) | 2026-07-10 | — |
| 012 | Make group movement and path recovery reliable | Historical | P1 | 011 | DONE-VERIFIED | `d1c1214` / `b3fd496` | [012](evidence/012.md) | 2026-07-10 | — |
| 013 | Make combat commitments and automatic response consistent | Historical | P1 | 012, 015 | DONE-VERIFIED | `4bcd6c9` / `e4f5bda` | [013](evidence/013.md) | 2026-07-23 | — |
| 014 | Make the AI execute its script at human-scale timing | Historical | P1 | 011, 012, 013, 015 | ACCEPTED-WAIVER | user acceptance `f8a1c77` | [014](evidence/014.md) | 2026-07-24 | — |
| 015 | Complete and extend the fixed-demo advanced tech paths | Historical | P2 | 011, 012 | DONE-VERIFIED | `e6be507`, `c43a28c`, `7eb9230`, `66f0ed8` / `5f9a444` | [015](evidence/015.md) | 2026-07-23 | — |
| 016 | Make commands, queues, supply, and input state legible | Historical | P2 | 014, 015 | ACCEPTED-WAIVER | `65bfd1a` / user acceptance `8655330` | [016](evidence/016.md) | 2026-07-24 | — |
| 017 | Tune the one-Peasant demo for faster, consistent contact | Historical | P2 | 011–016 | ACCEPTED-WAIVER | `a17bfa7` / user acceptance `8655330` | [017](evidence/017.md) | 2026-07-24 | — |
| 018 | Establish a reproducible runtime performance feedback loop | 1 — Measurement foundation | P1 | Wave 0 exit | BLOCKED | implementation `fc41c95`–`e80215e`; acceptance blocked on Wave 0 | [018](evidence/018.md) | 2026-07-28 | — |
| 019 | Precompute terrain metadata used by pathfinding and visibility | 2 — Independent hot paths | P1 | 018 | TODO | — | — | — | — |
| 020 | Replace hot linear unit lookups with a transient ID index | 2 — Independent hot paths | P1 | 018 | TODO | — | — | — | — |
| 021 | Cull before sorting and build prepared render snapshots | 2 — Independent hot paths | P1 | 018 | TODO | — | — | — | — |
| 022 | Retain world display objects | 3 — Structural optimization | P1 | 018, 021 | TODO | — | — | — | — |
| 023 | Add a deterministic spatial occupancy index | 3 — Structural optimization | P1 | 018, 019, 020 | TODO | — | — | — | — |
| 024 | Budget and stagger pathfinding | 4 — High-risk scheduling | P1 | 018, 019, 020, 023 | TODO | — | — | — | — |
| 025 | Make visibility and fog dirty-driven | 4 — High-risk scheduling | P1 | 018, 019, 022, 023 | TODO | — | — | — | — |
| 026 | Standardize Halla browser execution | 0 — Foundation repair | P0 | — | DONE-VERIFIED | implementation `eb0cb0e`–`02051ad`; integration `d99a24a`; acceptance `9bbcc00` | [026](evidence/026.md) | 2026-07-28 | — |
| 027 | Repair drifted verification gates | 0 — Foundation repair | P0 | 026 (closeout/revalidation only) | TODO | — | — | — | — |

## Governing contracts

- [Halla execution policy](HALLA-EXECUTION-POLICY.md) governs unfinished-plan
  host preflight, exact-owned process cleanup, browser qualification, resource
  safety, serial capture, and artifact storage.
- [Performance acceptance](PERFORMANCE-ACCEPTANCE.md) governs the measurement
  matrix, validity, statistics, budgets, and durable evidence for Plan 018 and
  later performance work.
- [Historical plan audit](HISTORICAL-PLAN-AUDIT.md) authoritatively records
  Plans 001–017 implementation/acceptance commits, evidence, revalidation,
  drift, successors, and passed-versus-waived boundaries without fabricating
  dates or retroactively turning waivers into verified work.
