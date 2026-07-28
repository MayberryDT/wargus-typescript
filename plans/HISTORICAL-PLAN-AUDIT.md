# Historical Plan Audit

This is the authoritative reconciliation of Plans 001–017. Their retained
executor steps and append-only evidence describe work that already happened;
they are not current work orders. Classifications use the vocabulary in
`plans/README.md`.

The audit records only repository-backed commits and dates. `not recorded`
means the historical record does not support a more precise claim.

## Plan record

| Plan | Current classification | Implementation / acceptance commit | Evidence path | Last revalidated | Known current drift | Successor | Original exhaustive acceptance |
|---|---|---|---|---|---|---|---|
| 001 | `DONE-HISTORICAL` | `6af2eeb` | no dedicated packet (pre-evidence convention) | not recorded | Repository guidance has since expanded; no product behavior is reopened. | — | historical |
| 002 | `DONE-HISTORICAL` | `6af2eeb` | `plans/evidence/018.md` revalidates only the determinism gate | 2026-07-27 | No current determinism drift is recorded. | — | historical |
| 003 | `DONE-HISTORICAL` | `6af2eeb` | no dedicated packet (pre-evidence convention) | not recorded | Current full-gate revalidation is pending the infrastructure repair below. | Plan 027 revalidation | historical |
| 004 | `DONE-HISTORICAL` | `6af2eeb` | no dedicated packet (pre-evidence convention) | not recorded | none recorded | — | historical |
| 005 | `DONE-HISTORICAL` | `6af2eeb` | no dedicated packet (pre-evidence convention) | not recorded | `verify:fixed-demo-polish` has two stale source-fragment assertions; this is successor-owned verifier drift, not a retroactive product failure. | Plan 027 | historical |
| 006 | `DONE-HISTORICAL` | `6af2eeb` | no dedicated packet (pre-evidence convention) | not recorded | The still-relevant extraction/pathfinding seam awaits focused successor revalidation. | Plan 027 revalidation | historical |
| 007 | `DONE-HISTORICAL` | `6af2eeb` | no dedicated packet (pre-evidence convention) | not recorded | Historical process cleanup predates the current Halla execution contract. | Plans 026 and 027 | historical |
| 008 | `DONE-HISTORICAL` | `6af2eeb` | no dedicated packet (pre-evidence convention) | not recorded | The package-wide gate is currently red for the two Plan 027 infrastructure failures below. | Plan 027 | historical |
| 009 | `DONE-HISTORICAL` | `6af2eeb` | no dedicated packet (pre-evidence convention) | not recorded | The browser harness predates current Halla browser qualification and process policy. | Plans 026 and 027 | historical |
| 010 | `DONE-HISTORICAL` | `6af2eeb` | no dedicated packet (pre-evidence convention) | not recorded | The live layout contract awaits focused successor revalidation; no product regression is recorded. | Plan 027 revalidation | historical |
| 011 | `DONE-VERIFIED` | implementation `a93ef25`; acceptance `71de976` | `plans/evidence/011.md` | 2026-07-10 | none recorded | — | passed |
| 012 | `DONE-VERIFIED` | implementation `d1c1214`; acceptance `b3fd496` | `plans/evidence/012.md` | 2026-07-10 | none recorded | — | passed |
| 013 | `DONE-VERIFIED` | implementation `4bcd6c9`; acceptance `e4f5bda` | `plans/evidence/013.md` | 2026-07-23 | none recorded | — | passed |
| 014 | `ACCEPTED-WAIVER` | user acceptance `f8a1c77` | `plans/evidence/014.md` | 2026-07-24 | New M07 replay, exhaustive M08 1/4/16-wave proof, full M09 difficulty sweep, Gate A/Task 9 segmentation, and separate independent READY review were waived. | — | explicitly waived |
| 015 | `DONE-VERIFIED` | implementation `e6be507`, `c43a28c`, `7eb9230`, `66f0ed8`; acceptance `5f9a444` | `plans/evidence/015.md` | 2026-07-23 | Final READY supersedes the later appended historical `PENDING` checkpoint text. | — | passed |
| 016 | `ACCEPTED-WAIVER` | implementation `65bfd1a`; user acceptance `8655330` | `plans/evidence/016.md` | 2026-07-24 | Exhaustive M01/M04/M10–M12 replay, forced completion-supply/no-egress fixtures, index-2 cancellation, second viewport, exact pointer-pan delta, and named browser/source gates were waived or unavailable as recorded. | — | explicitly waived |
| 017 | `ACCEPTED-WAIVER` | implementation `a17bfa7`; user acceptance `8655330` | `plans/evidence/017.md` | 2026-07-24 | The 18-run bakeoff/score, nine-seed repeat matrix, pressure-first/second session, exact first-unit/contact windows, full M01–M13 replay, and independent reviewer were waived. Candidate B was user accepted, not measured as the 18-run winner. | — | explicitly waived |

## Current red gates

At the Plan 027 baseline, two infrastructure gates are red:

- `verify:source-resource-ui` reads a workstation-only `/home/tyler/...`
  Stratagus path.
- `verify:fixed-demo-polish` requires exactly two stale implementation
  spellings: the old movement-passability call and loading-layer constructor.

Plan 027 owns both repairs and the affected focused revalidation for Plans 003,
005, 006, 007, 009, and 010. These red gates do not retroactively change the
historical classifications or reopen accepted product behavior.

## Historical shared-file ownership correction

Repository history shows several 011–017 handoffs omitted from the original
shared-file table. `plans/EXECUTION-GATES.md` now records:

- Plan 011 before Plans 013/014/016 for `src/simulation/world.ts` and
  `src/wargus/saveGame.ts`;
- Plan 014 before Plan 016 for `src/view/renderHud.ts`;
- Plans 012/016/017 for `scripts/verify-browser-fixed-demo-input.mjs`;
- Plans 014/017 for `scripts/verify-browser-runtime-smoke.mjs`; and
- Plans 011/013/014 for `scripts/verify-save-schema.mjs`.

This correction documents historical serialization only. Future unfinished work
uses `plans/HALLA-EXECUTION-POLICY.md` and the ownership boundaries in its own
plan.
