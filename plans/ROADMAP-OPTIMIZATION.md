# Gameplay Roadmap Optimization Rubric

This rubric was frozen before revising plans 011–017. The user supplied the
starting score: **60/100**. Scores may rise only when the roadmap gains
substantive execution value; added prose or formatting alone earns no points.

The score grades pre-implementation plan quality and executability. It is not
an implementation-completion or acceptance-evidence score.

## Weighted rubric

| Criterion | Weight | Low quality | Medium quality | High quality |
|---|---:|---|---|---|
| Player-visible outcomes | 20 | Tasks describe code changes without saying what feels different in play. | Most plans name an observable result, but cross-plan end states or failure behavior are vague. | Every plan has a before/after player contract, named failure feedback, and an end-to-end playable exit gate. |
| Causal and mechanical correctness | 18 | Fixes are guessed from symptoms or duplicate game rules in UI/test code. | Root causes and invariants are mostly identified, with some speculative implementation choices. | Each fix states the violated invariant, source evidence, viable alternatives considered, and why the chosen seam is safest. |
| Execution specificity and landability | 16 | Large tasks, unclear interfaces, or no independent landing points. | Exact files and steps exist, but some plans are too broad or cannot be reviewed incrementally. | Work is split into reversible reviewer-sized checkpoints with exact interfaces, diff limits, artifacts, and exit gates. |
| Sequencing and integration control | 12 | A list with no dependency or shared-file coordination. | Dependencies exist, but parallel lanes, shared hotspots, and handoffs are incomplete. | Critical path, safe parallel work, shared-file serialization, integration gates, and handoff artifacts are explicit. |
| Risk, rollback, and observability | 12 | Generic STOP conditions only. | Specific risks exist, but rollback triggers or runtime evidence are incomplete. | Each risky change has preconditions, measured signals, rollback/fallback behavior, determinism/performance budgets, and no silent failure mode. |
| Product and design alignment | 10 | Reintroduces objectives/tests as the goal or violates the opening premise. | Preserves most constraints but leaves tuning philosophy implicit. | Explicitly preserves one Peasant, no Hall, high resources, gameplay-first acceptance, and clear non-goals in every affected decision. |
| Playable validation quality | 8 | Typecheck/static checks stand in for playability. | Manual sessions exist but lack shared seeds, baselines, or reproducible evidence. | A cross-plan scenario matrix defines seeds, setup, actions, observable evidence, budgets, and regression replay after each slice. |
| Handoff and maintenance value | 4 | Executor must infer ownership or follow-up. | Plans have maintenance notes and status rows. | Each plan produces a compact evidence packet, review decision, residual-risk note, and clean next-plan handoff. |

## Scoring rules

- Score each criterion independently, then sum the weighted points.
- Acceptance margin is **+2** points.
- Re-anchor on this rubric after every two rewrite rounds.
- Maximum eight rounds; stop after three rounds without an accepted +2 gain.
- If hill-climbing stalls below 90, compare three structural alternatives and
  keep one only if it beats the best plan by at least two points.
- The roadmap is not acceptable until it scores **more than 90**.

## Round 0 — supplied baseline

| Criterion | Score | Why the current roadmap loses points |
|---|---:|---|
| Player-visible outcomes | 12/20 | Plans include manual sessions, but there is no single before/after contract or regression replay across slices. |
| Causal and mechanical correctness | 10/18 | Root causes are strong, but several fixes prematurely prescribe one implementation without comparing safer seams. |
| Execution specificity and landability | 9/16 | Files and steps are exact, but plans 012, 014, and 016 are too large for one clean review/rollback unit. |
| Sequencing and integration control | 9/12 | Dependencies are present, but shared `orders.ts`/`world.ts` work is not serialized through explicit integration gates. |
| Risk, rollback, and observability | 6/12 | STOP conditions exist, but rollback triggers, evidence packets, and performance/determinism checks are inconsistent. |
| Product and design alignment | 8/10 | The right premises are preserved, but the high-resource and pacing philosophy is not traced through every acceptance gate. |
| Playable validation quality | 4/8 | Browser sessions exist per plan, but seeds, saved evidence, and a shared scenario matrix are missing. |
| Handoff and maintenance value | 2/4 | Status and maintenance notes exist, but executors do not produce a standard review artifact for the next plan. |
| **Total** | **60/100** | User-specified starting anchor. |

## Optimization history

This section is updated after each accepted rewrite round. A round must name the
score-limiting critique and the substantive roadmap change that addressed it.

| Round | Score | Accepted change |
|---:|---:|---|
| 0 | 60 | Baseline supplied by the user; no optimization credit. |
| 1 | 74 | Added one shared M01–M13 playable scenario matrix, reproducible evidence packets, explicit budgets, and regression replay instead of treating each plan as an isolated checklist. |
| 2 | 86 | Corrected the AI/tech dependency, serialized shared hotspots, added integration gates and rollback behavior, and traced every audited mechanic to one owner/scenario. |
| 3 | 92 | Split the three broad plans into independently reversible landing checkpoints and replaced predetermined 1.5x pacing with a frozen three-candidate, 18-run bakeoff. |

Every accepted round exceeded the +2 acceptance margin. The score was
re-anchored from the frozen rubric rather than calculated as “previous score
plus prose.”

## Round 1 re-anchor — 74/100

**Limiting critique:** a capable executor could implement the local steps but
still be unable to prove that the game became more playable, or that a later
plan did not undo an earlier mechanic.

**Substantive rewrite:** added `plans/MECHANICS-ACCEPTANCE.md` with M01–M13,
fixed setups/actions/observables, deterministic reproduction rules,
performance budgets, upstream replay assignments, and a standard evidence
packet under `plans/evidence/`.

| Criterion | Score | Re-anchor rationale |
|---|---:|---|
| Player-visible outcomes | 16/20 | Each finding now has an observable scenario and roadmap exit gate; some large plans remain hard to review incrementally. |
| Causal and mechanical correctness | 11/18 | Findings are traced, but chosen implementation seams still lack explicit alternatives and rollback proofs. |
| Execution specificity and landability | 10/16 | Evidence and exact checks improve execution, but plans 012/014/016 are still oversized landing units. |
| Sequencing and integration control | 10/12 | Replay order is explicit; shared-file ownership and one dependency are still incomplete. |
| Risk, rollback, and observability | 8/12 | Measured signals and budgets exist; plan-specific rollback triggers are inconsistent. |
| Product and design alignment | 9/10 | One Peasant/no Hall/high resources and gameplay-first acceptance are explicit. |
| Playable validation quality | 7/8 | Shared deterministic scenarios replace ad hoc play notes; final tuning still assumes one numeric answer. |
| Handoff and maintenance value | 3/4 | Every plan creates a READY/NOT READY packet, but cross-plan integration ownership is not yet explicit. |
| **Total** | **74/100** | **Accepted: +14.** |

## Round 2 re-anchor — 86/100

**Limiting critique:** the roadmap could deadlock or produce misleading AI
results because plan 014 requested a siege producer before plan 015 made that
producer legal. Central files also had no single-owner merge order.

**Substantive rewrite:** added `plans/EXECUTION-GATES.md`; made 015 a real
dependency of 014; defined the critical path and safe 012/015 concurrency;
serialized `orders.ts`, `world.ts`, `saveGame.ts`, `main.ts`, scenario setup,
and shared verifiers; added chosen/rejected design seams and plan-specific
rollback triggers; added audit-finding traceability.

| Criterion | Score | Re-anchor rationale |
|---|---:|---|
| Player-visible outcomes | 17/20 | Contracts, failure feedback, and integrated exit are present; broad changes still obscure intermediate player value. |
| Causal and mechanical correctness | 15/18 | Each plan names alternatives and the violated seam; a few target interfaces remain hypotheses to confirm at execution drift checks. |
| Execution specificity and landability | 13/16 | Exact ownership, gates, and rollback improve landability; three plans are still too large for one review unit. |
| Sequencing and integration control | 12/12 | Critical path, legal concurrency, shared hotspots, handoffs, and final integration are explicit. |
| Risk, rollback, and observability | 10/12 | Global and plan rollback signals are concrete; pacing selection and intermediate rollback granularity remain weak. |
| Product and design alignment | 9/10 | Premises/non-goals are preserved; the 1.5x pacing recommendation is still asserted rather than earned. |
| Playable validation quality | 7/8 | All mechanics have reproducible play evidence, but pacing lacks comparison against challengers. |
| Handoff and maintenance value | 3/4 | Evidence packets and integration summary exist; broad plans still cannot hand off at stable internal checkpoints. |
| **Total** | **86/100** | **Accepted: +12.** |

## Round 3 final re-anchor — 92/100

**Limiting critique:** plans 012, 014, and 016 could still accumulate multiple
behavior changes before review, and plan 017 could rationalize a preferred
speed after the fact.

**Substantive rewrite:** defined three landing checkpoints for movement, three
for AI, and four for legibility, each with an allowed result, focused scenario,
budget, READY handoff, and checkpoint-only rollback. Plan 017 now evaluates
three coherent visible pace/distance configurations over 18 runs, uses a
frozen milestone score with hard gates and a lower-speed tie-break, and stops
without changing gameplay if no candidate reaches 80.

| Criterion | Score | Final rationale |
|---|---:|---|
| Player-visible outcomes | 18/20 | Every plan has before/after behavior, named failure feedback, scenarios, and an integrated playable exit. Two points remain because timings cannot be observed until execution. |
| Causal and mechanical correctness | 16/18 | Root causes, invariants, alternatives, and seams are explicit. Two points remain for drift-sensitive interface assumptions that executors must confirm. |
| Execution specificity and landability | 14/16 | Broad plans now land/revert in reviewer-sized checkpoints. Two points remain because central `orders.ts` work is inherently coupled. |
| Sequencing and integration control | 12/12 | Dependencies, safe concurrency, hotspot ownership, readiness gates, and final integration are complete. |
| Risk, rollback, and observability | 10/12 | Each plan has measured signals and rollback; two points remain because rollback effectiveness is not yet demonstrated by implementation. |
| Product and design alignment | 10/10 | One Peasant, no Hall, high resources, no objectives, no hidden speed, and gameplay-first acceptance govern every relevant decision. |
| Playable validation quality | 8/8 | Fixed scenarios, actions, observable evidence, two opening styles, multiple seeds, budgets, and upstream replay are defined. |
| Handoff and maintenance value | 4/4 | READY packets, checkpoint boundaries, integrated SHA table, residual risks, and next-plan ownership are mandatory. |
| **Total** | **92/100** | **Accepted: +6; required >90 gate cleared.** |

## Final score boundary

The missing eight points are deliberately not awarded in advance:

- the measured play timings and contact distributions do not exist until the
  plans execute;
- the target interface names in deep simulation code may need narrow drift
  reconciliation;
- checkpoint rollback and central-file integration have been designed but not
  exercised.

The optimization therefore stops at **92/100**, not 100. This document grades
the executability of the roadmap; it does not claim that any gameplay fix is
already implemented or proven.

## 2026-07-28 full-roadmap rewrite score history

The historical Plans 011–017 optimization remains **92/100**. The 2026-07-28
full-roadmap rewrite preserves that score as a pre-implementation plan-quality
record; it does not reinterpret the score as proof that original exhaustive
acceptance ran.

The separate full-roadmap score is recorded below with its own frozen rubric
and repository-backed review record; it does not replace the historical score.

## Task 8 full-roadmap optimizer — frozen 100-point rubric

This is a separate plan-quality audit for the Plans 001–027 wave rewrite. It
does not rescore the historical gameplay-only rubric above and does not claim
that any future plan has executed. The rubric was frozen before the Task 8
correction rounds:

| Criterion | Weight |
|---|---:|
| Repository grounding and drift control | 15 |
| Measurable goal and done criteria | 12 |
| Dependency and wave correctness | 18 |
| Verification and evidence quality | 18 |
| Shared browser/resource/protocol consistency | 15 |
| Risk and rollback | 10 |
| Parallel executability and file ownership | 8 |
| Maintenance and handoff | 4 |
| **Total** | **100** |

Each criterion is scored independently. A proposed round is accepted only for
a gain of at least two points. The optimizer may run at most eight rounds and
stops after three consecutive non-improving rounds. The roadmap is acceptable
only above 90. Scores below grade plan executability, not implementation or
acceptance completion.

### Pass 0 — repository candidate: 87/100

| Criterion | Score | Limiting evidence |
|---|---:|---|
| Repository grounding and drift control | 13/15 | Every active plan had a concrete ancestor base, but Plan 018 did not satisfy the normalized active-section contract. |
| Measurable goal and done criteria | 11/12 | Goals and gates were measurable, but the rewrite had no explicit post-closeout user-approval boundary. |
| Dependency and wave correctness | 18/18 | Wave barriers and narrower API dependencies were consistent and acyclic. |
| Verification and evidence quality | 13/18 | Deferred findings left wrapper-only lifecycle evidence, ambiguous new-verifier baselines, and an underspecified revision boundary. |
| Shared browser/resource/protocol consistency | 13/15 | Shared policies were authoritative, but Plan 027 did not pass its available runtime-port override explicitly. |
| Risk and rollback | 8/10 | STOP/rollback rules were strong, but the final rewrite-to-execution stop was implicit. |
| Parallel executability and file ownership | 7/8 | Waves 2–4 were disjoint, but Plans 026/027 both claimed browser-verifier edits and Plan 026 simultaneously scoped and delegated its package entry. |
| Maintenance and handoff | 4/4 | Evidence files, coordinator handoffs, refresh rules, and status ownership were explicit. |
| **Total** | **87/100** | Below the required threshold. |

**Critique:** a capable executor could still misread a new verifier as a
pre-existing baseline, accept wrapper-name presence as lifecycle proof, or
cross the overlapping Wave 0 browser/shared-file boundary differently from the
coordinator.

### Pass 1 — contract correction: 95/100

Accepted substantive changes:

- normalized Plan 018 to the complete active-plan template and classified its
  stopped acceptance state as `BLOCKED`;
- froze Wave 0 ownership: Plan 026 owns every browser controller/verifier
  migration and the ignored retained-artifact deliverable; Plan 027 owns exactly
  two scripts, with browser revalidation only after Plan 026 integration;
- made Plan 026's branch-local direct verifier and coordinator-only `.gitignore`,
  `package.json`, and roadmap integration unambiguous;
- required Plan 027 runtime smoke to pass and record an explicit inspected
  requested-candidate port through the integrated controller;
- added negative added-line/final-source evidence against direct Pixi
  construction/destruction in Plan 022 and explicit linked-worktree checks in
  Plans 022/023;
- separated pre-existing baselines from meaningful behavior-level RED/GREEN
  creation gates for every new verifier in Plans 019–025; and
- froze Plan 025's revision range and exact maximum/reset behavior.

| Criterion | Score | Re-anchor rationale |
|---|---:|---|
| Repository grounding and drift control | 14/15 | Exact active sections and concrete drift checks pass; future integrated bases must still be refreshed at execution. |
| Measurable goal and done criteria | 11/12 | Every plan has measurable gates, but the rewrite-to-execution authority boundary remains implicit. |
| Dependency and wave correctness | 18/18 | No barrier/API edge changed; DAG and wave order remain exact. |
| Verification and evidence quality | 16/18 | Negative lifecycle scans, meaningful new-verifier RED/GREEN sequencing, ignored retained-artifact preflight, and revision boundary tests close the proof gaps; future results remain unexecuted. |
| Shared browser/resource/protocol consistency | 15/15 | Browser, port, PID, resource, capture, renderer, and evidence rules now point to one shared protocol without a local exception. |
| Risk and rollback | 9/10 | Plan-local rollback is precise; final rewrite authority still needs an explicit STOP. |
| Parallel executability and file ownership | 8/8 | Exclusive slices and coordinator-only shared integration are now consistent. |
| Maintenance and handoff | 4/4 | Evidence and refresh handoffs remain complete. |
| **Total** | **95/100** | **Accepted: +8.** |

This is a full frozen-rubric re-anchor, not “87 plus edits.”

### Pass 2 — approval boundary: 97/100

**Accepted substantive change:** `plans/README.md` now states that the rewrite
is `READY FOR USER REVIEW`, not execution authority, and requires explicit user
approval before Wave 0, browser/runtime capture, host/tooling mutation,
preview, deployment, or any later plan.

| Criterion | Score | Re-anchor rationale |
|---|---:|---|
| Repository grounding and drift control | 14/15 | Current repository state is grounded; future integration drift cannot be prepaid. |
| Measurable goal and done criteria | 12/12 | Rewrite readiness and the next authorized state are now explicit and testable. |
| Dependency and wave correctness | 18/18 | Wave order, barriers, and technical edges remain exact. |
| Verification and evidence quality | 16/18 | Planned proof is strong; future implementation evidence does not yet exist. |
| Shared browser/resource/protocol consistency | 15/15 | One protocol governs shared execution. |
| Risk and rollback | 10/10 | Plan-local rollback and the roadmap-level approval STOP are explicit. |
| Parallel executability and file ownership | 8/8 | Parallel slices and shared-file serialization are frozen. |
| Maintenance and handoff | 4/4 | Coordinator, executor, reviewer, and user handoffs are explicit. |
| **Total** | **97/100** | **Accepted: +2.** |

This second-pass table is the required two-round rubric re-anchor.

### Pass 3 — no accepted gain: 97/100

The pass considered duplicating shared artifact and controller rules into each
active plan. That would add prose while increasing future drift risk; the
existing authoritative references plus plan-specific deltas are more
executable. No change was accepted.

| Criterion | Score |
|---|---:|
| Repository grounding and drift control | 14/15 |
| Measurable goal and done criteria | 12/12 |
| Dependency and wave correctness | 18/18 |
| Verification and evidence quality | 16/18 |
| Shared browser/resource/protocol consistency | 15/15 |
| Risk and rollback | 10/10 |
| Parallel executability and file ownership | 8/8 |
| Maintenance and handoff | 4/4 |
| **Total** | **97/100 — no gain (1/3).** |

### Pass 4 — no accepted gain and re-anchor: 97/100

The pass considered freezing post-integration acceptance SHAs now. Those SHAs
do not exist; inventing them would weaken repository grounding. The existing
coordinator refresh/STOP rules are the correct executable contract. No change
was accepted.

| Criterion | Score |
|---|---:|
| Repository grounding and drift control | 14/15 |
| Measurable goal and done criteria | 12/12 |
| Dependency and wave correctness | 18/18 |
| Verification and evidence quality | 16/18 |
| Shared browser/resource/protocol consistency | 15/15 |
| Risk and rollback | 10/10 |
| Parallel executability and file ownership | 8/8 |
| Maintenance and handoff | 4/4 |
| **Total** | **97/100 — no gain (2/3).** |

This is a fresh frozen-rubric re-anchor after two more passes.

### Pass 5 — no accepted gain; optimizer stop: 97/100

The pass considered awarding the remaining points for future drift refreshes,
acceptance artifacts, and exercised rollback. Those facts can exist only after
approved plan execution and therefore cannot improve this pre-execution
roadmap. No change was accepted.

| Criterion | Score |
|---|---:|
| Repository grounding and drift control | 14/15 |
| Measurable goal and done criteria | 12/12 |
| Dependency and wave correctness | 18/18 |
| Verification and evidence quality | 16/18 |
| Shared browser/resource/protocol consistency | 15/15 |
| Risk and rollback | 10/10 |
| Parallel executability and file ownership | 8/8 |
| Maintenance and handoff | 4/4 |
| **Total** | **97/100 — no gain (3/3).** |

Trajectory: **87 → 95 → 97 → 97 → 97 → 97**. The optimizer stops after
three consecutive non-improving passes, within the eight-round maximum. The
roadmap clears the required greater-than-90 quality threshold.

Independent review then challenged evidence behind already-scored criteria. The
final candidate incorporates its corrections: truthful Plan 018 status and
GBrain context, complete active headings, Wave 0 ownership/closeout ordering,
meaningful RED/GREEN creation for Plans 019–023, rendered table integrity,
complete rewrite inventory, and the Wave 0 ignored retained-artifact gate. A
fresh frozen-rubric re-anchor remains **97/100**: these fixes make the claimed
criterion evidence true but do not award points for unexecuted future results,
so they do not add a post-plateau optimizer round or alter the trajectory.

The missing three points are deliberately withheld: one repository-grounding
point requires future integrated-base drift refreshes, and two verification
points require actual implementation/capture evidence. The score authorizes
no execution; the roadmap remains `READY FOR USER REVIEW` pending explicit
user approval.
