# Wargus Roadmap Index

This is the authoritative status and wave index for Plans 001–027. Plan IDs are
stable references; waves govern execution order. Plans 001–017 are completed
historical entries, not current execution work. Their detailed classification,
recorded commits, evidence, revalidation dates, drift, successors, and waiver
boundaries are authoritative in
[the historical plan audit](HISTORICAL-PLAN-AUDIT.md).

## Status vocabulary

- `TODO`: approved but not started.
- `IN PROGRESS`: implementation or acceptance work is active.
- `BLOCKED`: an explicit entry or STOP condition prevents progress.
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

Plans 026/027 in Wave 0, Plans 019/020/021 in Wave 2, and Plans 022/023 in
Wave 3 execute in parallel in isolated worktrees. Plans 024/025 in Wave 4 may
execute in parallel only under their rewritten ownership boundary: Plan 024
owns path requests and save-schema changes; Plan 025 owns visibility/fog caches
and may not add save fields. If that boundary cannot be preserved, serialize
Wave 4. Performance captures are serial. A later wave starts only after its
predecessor's exit gate is accepted.

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
pass their Wave 2 exit gates and integrate before either Wave 3 executor starts.
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
| 018 | Establish a reproducible runtime performance feedback loop | 1 — Measurement foundation | P1 | Wave 0 exit | IN PROGRESS | implementation `fc41c95`–`e80215e`; acceptance pending | [018](evidence/018.md) | 2026-07-28 | — |
| 019 | Precompute terrain metadata used by pathfinding and visibility | 2 — Independent hot paths | P1 | 018 | TODO | — | — | — | — |
| 020 | Replace hot linear unit lookups with a transient ID index | 2 — Independent hot paths | P1 | 018 | TODO | — | — | — | — |
| 021 | Cull before sorting and build prepared render snapshots | 2 — Independent hot paths | P1 | 018 | TODO | — | — | — | — |
| 022 | Retain world display objects | 3 — Structural optimization | P1 | 018, 021 | TODO | — | — | — | — |
| 023 | Add a deterministic spatial occupancy index | 3 — Structural optimization | P1 | 018, 019, 020 | TODO | — | — | — | — |
| 024 | Budget and stagger pathfinding | 4 — High-risk scheduling | P1 | 018, 019, 020, 023 | TODO | — | — | — | — |
| 025 | Make visibility and fog dirty-driven | 4 — High-risk scheduling | P1 | 018, 019, 022, 023 | TODO | — | — | — | — |
| 026 | Standardize Halla browser execution | 0 — Foundation repair | P0 | — | TODO | — | — | — | — |
| 027 | Repair drifted verification gates | 0 — Foundation repair | P0 | — | TODO | — | — | — | — |

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
