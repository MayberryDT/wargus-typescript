# Wargus Roadmap Index

This is the authoritative status and wave index for Plans 001–027. Plan IDs are
stable references; waves govern execution order. Plans 001–017 are completed
historical entries, not current execution work. Their detailed classification,
recorded commits, evidence, revalidation dates, and successors will be
authoritatively reconciled in [the historical plan audit](HISTORICAL-PLAN-AUDIT.md).
Until then, unknown historical completion/revalidation dates are `not recorded`.

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

Implementation may be parallel within a wave only under the approved ownership
rules. Performance captures are serial. A later wave starts only after its
predecessor's exit gate is accepted.

## Plan status and dependencies

| Plan | Title | Wave | Priority | Dependencies | Status | Implementation / acceptance commit | Evidence | Last revalidated | Successor |
|---|---|---|---|---|---|---|---|---|---|
| 001 | Add repository agent guidance | Historical | P1 | — | DONE-HISTORICAL | not recorded | not recorded | not recorded | Historical audit |
| 002 | Restore runtime determinism verification | Historical | P1 | — | DONE-HISTORICAL | not recorded | not recorded | not recorded | Historical audit |
| 003 | Upgrade Vite out of the vulnerable range | Historical | P1 | — | DONE-HISTORICAL | not recorded | not recorded | not recorded | Plan 027 revalidation; historical audit |
| 004 | Harden map setup JSON loading against SPA fallback HTML | Historical | P1 | — | DONE-HISTORICAL | not recorded | not recorded | not recorded | Historical audit |
| 005 | Stabilize stale fixed-demo verifier contracts | Historical | P2 | 002 | DONE-HISTORICAL | not recorded | not recorded | not recorded | Plan 027; historical audit |
| 006 | Extract a low-risk orders.ts pilot slice | Historical | P3 | 002, 005 | DONE-HISTORICAL | not recorded | not recorded | not recorded | Plan 027 revalidation; historical audit |
| 007 | Fix browser runtime smoke process cleanup | Historical | P1 | — | DONE-HISTORICAL | not recorded | not recorded | not recorded | Plan 026 and Plan 027; historical audit |
| 008 | Include omitted verifiers in the full verify gate | Historical | P1 | — | DONE-HISTORICAL | not recorded | not recorded | not recorded | Historical audit |
| 009 | Extract a browser verifier harness pilot | Historical | P2 | 007 | DONE-HISTORICAL | not recorded | not recorded | not recorded | Plan 026 and Plan 027; historical audit |
| 010 | Convert fixed-demo speed verifier to a layout contract | Historical | P2 | 008 | DONE-HISTORICAL | not recorded | not recorded | not recorded | Plan 027 revalidation; historical audit |
| 011 | Restore the original two-phase construction lifecycle | Historical | P1 | — | DONE-VERIFIED | not recorded | [011](evidence/011.md) | not recorded | Historical audit |
| 012 | Make group movement and path recovery reliable | Historical | P1 | 011 | DONE-VERIFIED | not recorded | [012](evidence/012.md) | not recorded | Historical audit |
| 013 | Make combat commitments and automatic response consistent | Historical | P1 | 012, 015 | DONE-VERIFIED | not recorded | [013](evidence/013.md) | not recorded | Historical audit |
| 014 | Make the AI execute its script at human-scale timing | Historical | P1 | 011, 012, 013, 015 | ACCEPTED-WAIVER | not recorded | [014](evidence/014.md) | not recorded | Historical audit |
| 015 | Complete and extend the fixed-demo advanced tech paths | Historical | P2 | 011, 012 | DONE-VERIFIED | not recorded | [015](evidence/015.md) | not recorded | Historical audit |
| 016 | Make commands, queues, supply, and input state legible | Historical | P2 | 014, 015 | ACCEPTED-WAIVER | not recorded | [016](evidence/016.md) | not recorded | Historical audit |
| 017 | Tune the one-Peasant demo for faster, consistent contact | Historical | P2 | 011–016 | ACCEPTED-WAIVER | not recorded | [017](evidence/017.md) | not recorded | Historical audit |
| 018 | Establish a reproducible runtime performance feedback loop | 1 — Measurement foundation | P1 | Wave 0 exit | IN PROGRESS | not recorded | [018](evidence/018.md) | not recorded | — |
| 019 | Precompute terrain metadata used by pathfinding and visibility | 2 — Independent hot paths | P1 | 018 | TODO | — | — | — | — |
| 020 | Replace hot linear unit lookups with a transient ID index | 2 — Independent hot paths | P1 | 018 | TODO | — | — | — | — |
| 021 | Cull before sorting and build one indexed render snapshot | 2 — Independent hot paths | P1 | 018 | TODO | — | — | — | — |
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
- The future [historical plan audit](HISTORICAL-PLAN-AUDIT.md) will replace the
  provisional `not recorded` historical metadata with recorded evidence only;
  it must not fabricate dates or retroactively turn waivers into verified work.
