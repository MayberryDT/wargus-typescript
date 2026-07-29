# Wargus Roadmap Rewrite Evidence — 2026-07-28

## Disposition

This packet covers a documentation-only rewrite of Plans 001–027. It records
no product, verifier, package, asset, host, browser, capture, preview, or
deployment execution. Independent roadmap review is complete, and the
documentation-only roadmap is **READY FOR USER REVIEW — EXECUTION NOT
AUTHORIZED**. Explicit user approval is still required before Wave 0 or any
product, tooling, host, browser, capture, preview, or deployment action.

## Repository identity and commit range

| Field | Verified value |
|---|---|
| Host | `halla` |
| Worktree | `/home/halla/workspaces/t3/Wargus-TypeScript/.worktrees/plan-018` |
| Branch | `perf/plan-018-v2` |
| Approved design commit | `216871f` |
| Rewrite implementation range through Tasks 1–7 | `2e4b6fb` through `666164d6f67b4c0909d15195ebff865e605a232d`, inclusive |
| Full rewrite range after Task 8 | `2e4b6fb^..HEAD` on this branch |

The final closeout commit contains this packet and therefore cannot embed its
own content-addressed SHA. Resolve the exact upper endpoint with
`git log -1 --format=%H -- plans/evidence/ROADMAP-REWRITE-2026-07-28.md`; the
required Task 8 report and user handoff record that resolved SHA.

| Task | Commits | Result |
|---:|---|---|
| 1 | `2e4b6fb`, `60feab9`, `4c94af0` | Shared Halla and performance contracts |
| 2 | `8f91e25`, `2e84359` | Wave 0 plans and complete roadmap index |
| 3 | `6084bad`, `6049a98` | Honest historical status and waiver reconciliation |
| 4 | `520f9e9`, `d4ad386` | Plan 018 canonical closeout contract |
| 5 | `2b15cbe`, `d61125e` | Independent Wave 2 plans |
| 6 | `434d6c3`, `0993cdd` | Structural Wave 3 plans |
| 7 | `849f247`, `666164d` | Deterministic high-risk Wave 4 plans |
| 8 | commit containing this packet | Verification, optimizer, review, and approval stop |

GBrain was queried first. The initial search returned no exact roadmap page,
but independent review located the directly relevant historical blocker at
`sessions/2026/07/wargus-plan-018-browser-capture-blocker`. It records Plan
018's partial capture, approved headless fallback, invalid-artifact facts,
explicit STOP, and downstream dependency block. The approved rewrite supersedes
only its old arbitrary-duration and identical wall-clock ending-tick protocol
conclusions; its NOT-READY and invalid-evidence facts remain authoritative.
The approved design, governing implementation plan, repository history, plan
files, and SDD progress ledger provide the remaining closeout evidence.

## Files created and modified

| Change | Files |
|---|---|
| Approved design created before the implementation range | `docs/superpowers/specs/2026-07-28-wargus-roadmap-waves-design.md` at `216871f` |
| Created in the implementation range | `docs/superpowers/plans/2026-07-28-wargus-roadmap-rewrite.md`, `plans/HALLA-EXECUTION-POLICY.md`, `plans/PERFORMANCE-ACCEPTANCE.md`, `plans/HISTORICAL-PLAN-AUDIT.md`, Plans 026/027, and this evidence packet |
| Modified shared roadmap | `plans/README.md`, `plans/ROADMAP-OPTIMIZATION.md`, `plans/EXECUTION-GATES.md`, `plans/MECHANICS-ACCEPTANCE.md` |
| Modified historical plans | Plans 001–017, preserving implementation history while correcting current status/ownership references |
| Modified active plans | Plans 018–025, plus Task 8 contract corrections across Plans 018–027 |
| Modified historical evidence | `plans/evidence/014.md` through `plans/evidence/017.md`; append-only execution history was preserved |
| Modified active evidence | `plans/evidence/018.md`; historical diagnostics remain append-only while its current blocked status and superseding contract are explicit |

`git diff 216871f..HEAD -- src scripts .gitignore package.json public netlify.toml`
and the equivalent Task 8 working-tree check both returned no paths. The rewrite
contains no product, tooling, or ignore-rule implementation change; the future
`/.artifacts/` rule is an explicit coordinator-owned Wave 0 deliverable.

## Audit findings mapped to rewritten contracts

| Audit finding | Rewritten authority |
|---|---|
| Halla execution rules were duplicated, stale, or workstation-specific. | `plans/HALLA-EXECUTION-POLICY.md` centralizes host thresholds, isolated worktrees, inspected unique ports, exact-owned PID cleanup, serial captures, renderer qualification, and a Wave 0 gate that must establish the ignored retained artifact root before capture. |
| Performance capture did not have one statistical/evidence protocol. | `plans/PERFORMANCE-ACCEPTANCE.md` freezes profiles/viewports, 21 valid trials, nearest-rank per-trial statistics, worst-trial acceptance, heap formula, determinism, validity, replacement, and checksum rules. |
| Historical checkboxes could overstate verification or erase accepted waivers. | `plans/HISTORICAL-PLAN-AUDIT.md`, Plans 001–017, evidence 014–018, and the README status vocabulary distinguish `DONE-HISTORICAL`, `DONE-VERIFIED`, and `ACCEPTED-WAIVER` without inventing dates or rerunning history. |
| Two current verification gates and browser/process foundations needed repair before measurement. | Plan 026 owns every browser/controller migration and retained-artifact preflight; Plan 027 owns exactly two verifier-script repairs. Their branch checkpoints may overlap, but Plan 027 browser revalidation/closeout follows Plan 026 integration. |
| Plan 018 implementation existed but its representative hardware matrix and canonical determinism proof did not. | Plan 018 is `BLOCKED` on Wave 0, has the complete active-plan section contract, and may become `IN PROGRESS` only after entry opens; seven rows/three trials plus fixed-tick proof control closeout. |
| Plans 019–021 had drifted seams and a false Plan 021→020 dependency. | Wave 2 gives Plans 019/020/021 independent terrain, transient ID-index, and render-preparation slices after accepted Plan 018; Plan 021 consumes no Plan 020 API. |
| Plans 022/023 needed explicit integration barriers, cache/index ownership, timing, and lifecycle proof. | Wave 3 has a strict all-Wave-2 barrier, then independent retained-renderer and ordered-occupancy work, including negative direct-Pixi lifecycle evidence. |
| Pathfinding and visibility/fog proposals were underspecified high-risk changes. | Plans 024/025 freeze deterministic resumable scheduling/save restoration and transient contribution/fog-cache behavior, with disjoint ownership, bounds, parity, rollback, and direct timing. |
| Shared-file collisions and execution authority were ambiguous. | README wave tables, each plan's ownership section, coordinator-only shared integration, and the roadmap rewrite approval gate freeze concurrency and require explicit user approval. |

## Deferred findings and ruling adjudication

| Ledger item | Final adjudication |
|---|---|
| Plan 027 relied on a generic port preflight and overlapped Plan 026 browser ownership. | Corrected: Plan 027 edits exactly two scripts. After accepted/integrated Plan 026, the coordinator passes a recorded unused `PLAN027_RUNTIME_PORT` through the controller-validated `WARGUS_BROWSER_RUNTIME_PORT` interface and records all allocations/cleanup; no fixed modern-HUD port or browser-script edit remains. |
| Plan 026 both scoped and delegated its package entry. | Corrected: the isolated checkpoint runs the verifier directly and records proposed `.gitignore`/package fragments; after independent checkpoint approval, only the coordinator integrates them, then integrated verification/evidence must pass before Plan 026 acceptance and README closeout. |
| Human ruling on Plan 018 failed budgets. | Preserved: complete valid hardware-qualified evidence may close Plan 018 even when its baseline reports a failed budget; missing/invalid evidence blocks it; Plans 019–025 must pass every assigned budget. |
| Task 4 report said `package.json` lacked `scripts.verify`. | Adjudicated as a report-only factual error. Current `package.json` has `scripts.verify`; the roadmap never relies on the mistaken sentence, and broad verification remained outside Task 4 scope. Historical task reports were not rewritten. |
| Plan 022 wrapper search did not prove no direct Pixi lifecycle calls. | Corrected with a negative added-line diff, final-source scan in the focused verifier, evidence output, test, done, and STOP coverage. |
| Plans 022/023 did not prove an isolated worktree path. | Corrected: both host commands require Halla, a path below `/home/halla/workspaces/`, and a linked-worktree `.git` file. |
| Plan 025 mixed safe-integer and Uint32 revisions. | Corrected: revision is exactly `1..0xffffffff`, zero is reserved, unchanged-at-maximum retains the value, and the next changed update rebuilds/stamps at one. Boundary and rejection cases are mandatory. |
| Plans 019–025 treated one or more new verifiers as existing baselines. | Corrected in every active optimization plan: pre-edit gates name only pre-existing checks; each new verifier is created in its owning step with meaningful behavior-level RED followed by GREEN. Missing files/imports do not count as RED evidence. |
| The documented `.artifacts` path was neither ignored nor durable across disposable worktree removal. | Corrected as a future Wave 0 deliverable without changing `.gitignore` in Task 8: after Plan 026's implementation checkpoint is approved, the coordinator integrates the exact `/.artifacts/` rule, then integrated verification proves the retained checkout/root, ignore, realpath, writability, survival, checksums, and preservation owner before Plan 026 acceptance or any capture. |

## Final waves and dependencies

| Wave | Plans | Parallel rule | Exit gate |
|---|---|---|---|
| 0 — Foundation repair | 026, 027 | Plan 026 and Plan 027's two-script checkpoints may run in parallel; approve 026 checkpoint, integrate its shared entries, then run 026 final verification and 027 browser revalidation/closeout; captures remain serial | Controller/artifact gate and Plan 026 accepted, Plan 027 focused/browser evidence accepted, both integrated |
| 1 — Measurement foundation | 018 | Single closeout after Wave 0 | Fixed-tick determinism plus complete hardware-qualified matrix accepted, whether baseline budgets pass or fail |
| 2 — Independent hot paths | 019, 020, 021 | Parallel isolated worktrees after Plan 018 | All focused parity, direct timing, shared budgets, browser/determinism, review, and evidence gates accepted |
| 3 — Structural optimization | 022, 023 | Strict all-Wave-2 start barrier, then parallel isolated slices | Both focused/lifecycle/parity/budget/evidence gates accepted and integrated |
| 4 — High-risk scheduling | 024, 025 | Strict all-Wave-3 start barrier; parallel only while ownership stays disjoint; captures serial | X12, save/determinism, visibility/fog, direct timing, shared budgets, review, and evidence pass |
| 5 — Release | Combined result | Serial integrated verification/review/preview/deployment after roadmap approval and all predecessor gates | Full gate and preview smoke pass; prior user authorization then permits final production deploy and production smoke, never an early deploy |

Wave barriers are intentionally stronger than API edges. The active technical
DAG is: 026 and Plan 027's two-script implementation may start in parallel;
026 → Plan 027 browser revalidation/closeout; accepted 026+027 → 018 →
019/020/021; 022 consumes 018/021; 023 consumes 018/019/020; 024 consumes
018/019/020/023; 025 consumes 018/019/022/023. The graph is acyclic and README records these exact narrower dependencies.

## Shared-file ownership

| Surface | Exclusive owner/integration rule |
|---|---|
| `.gitignore`, `package.json`, `plans/README.md` | Coordinator integration: after Plan 026 checkpoint approval, `.gitignore` receives `/.artifacts/` and `package.json` receives the focused script before integrated verification; README closes only accepted plans |
| `src/main.ts`, performance summary schema | Plan 018 base; later namespaced additions integrated by the coordinator |
| `src/performance/*` | Plan 018 base; later plans expose only plan-namespaced diagnostics |
| `src/simulation/passability.ts` | Plan 019 terrain-only slice, then Plan 023 occupancy-only consumers after Wave 2 integration |
| `src/simulation/orders.ts` | Plan 020 ID invalidation, then Plan 023 occupancy mutations, then Plan 024 path requests in wave order; shared integration is coordinator-owned |
| `src/simulation/world.ts` | Plan 019 terrain metadata first; Plan 025 visibility-only slice after the Wave 3 barrier |
| `src/view/renderWorld.ts` | Plan 021 preparation, then Plan 022 retained objects, then Plan 025 fog-only slice in wave order |
| `src/wargus/saveGame.ts` | Plan 024 additive path-request state; Plan 025 may add no derived visibility/fog state |
| Browser verifier execution | Plan 026 exclusively owns controller/ports/PIDs and every browser verifier migration; Plan 027 changes only its two named scripts, then the coordinator revalidates read-only browser contracts after Plan 026 integration |
| Raw artifact root | Plan 026 defines and proves the explicit ignored retained root; coordinator integrates the ignore rule; all later plans consume it read-only |
| Per-plan evidence | Each plan owns only `plans/evidence/<id>.md`; the coordinator owns status/index integration |

## Status classification

| Status | Plans | Count |
|---|---|---:|
| `DONE-HISTORICAL` | 001–010 | 10 |
| `DONE-VERIFIED` | 011, 012, 013, 015 | 4 |
| `ACCEPTED-WAIVER` | 014, 016, 017 | 3 |
| `BLOCKED` | 018 | 1 |
| `TODO` | 019–027 | 9 |
| **Total** | 001–027 | **27** |

No future plan is marked complete. Plan 018 evidence remains explicit that the
matrix is not accepted; TODO status and optimizer readiness grant no execution
authority.

## Verification record

| Check | Result |
|---|---|
| Host/branch/base | `halla`; `perf/plan-018-v2`; Task 8 began clean at `666164d6f67b4c0909d15195ebff865e605a232d` |
| Unresolved-marker scan | `unresolved marker scan verified` |
| Concrete SHA scan, Plans 018–027 | `active plan concrete SHA scan verified` |
| Exact active-section Node check | `active plan section contract verified` |
| README IDs | `27 roadmap rows verified` |
| Status and DAG check | `DONE-HISTORICAL=10`, `DONE-VERIFIED=4`, `ACCEPTED-WAIVER=3`, `BLOCKED=1`, `TODO=9`; active dependency DAG verified |
| Drift ancestry | `6049a986`, `d4ad386`, `d61125e`, `0993cdd`, and `4c94af0` are ancestors of the candidate |
| Product/tooling scope | committed rewrite and Task 8 diffs under `src`, `scripts`, `.gitignore`, `package.json`, `public`, and `netlify.toml`: none |
| Old active resource rules | no `30-second`, `30 seconds`, `one low-priority project process`, or `Do not use parallel agents` match in Plans 018–027 |
| Shared safety terms | hardware renderer rejects `SwiftShader`/`llvmpipe`; exact owned PIDs and serial performance captures are present |
| Diff integrity | `git diff --check` passes |

These are documentation verifications only. No product build, asset gate,
browser verifier, performance matrix, host mutation, or deployment was run for
Task 8 because the governing plan explicitly forbids executing future work.

## Plan Optimizer result

The frozen 100-point score trajectory is:

```text
87 → 95 → 97 → 97 → 97 → 97
```

Pass 1 accepted eight points for normalized Plan 018 structure and all deferred
contract corrections. Pass 2 accepted two points for the explicit post-rewrite
user-approval STOP. Passes 3–5 independently re-anchored at 97 and accepted no
prose-only or future-evidence credit. The optimizer stopped after three
consecutive non-improving passes, within the eight-round maximum. The final
**97/100** exceeds the required greater-than-90 threshold. Full per-criterion
tables and critiques are in `plans/ROADMAP-OPTIMIZATION.md`.

## Independent roadmap review

Independent review completed with the following documentation-only verdicts:

| Reviewer | Axis verdict | Prior-blocker disposition |
|---|---|---|
| Standards reviewer `/root/task8_final_standards_review` | **READY** | All seven prior blockers are resolved and no new blocker was found. The absent/unignored `.artifacts/` root is not a documentation-review blocker: Plan 026 freezes creation of the ignore rule, retained root, survival proof, and pre-capture STOP. It remains a red future Plan 026/capture gate. |
| Architecture reviewer `/root/task8_final_architecture_review` | All architecture/evidence axes passed: spec completeness, historical-status honesty, dependency DAG, wave concurrency, shared ownership, Plan 018 statistics/heap, Plan 024 save/resumable search, Plan 025 transient-cache ownership, docs-only scope, and evidence truthfulness. | The wave barriers, explicit ownership, coordinator integration points, and acceptance/evidence gates are architecture strengths. Its only blocker was the contradiction in which the README and optimizer said `READY` while this packet said review pending. This readiness-text correction resolves that contradiction. |

The review verdict does not authorize execution. The future Plan 026
artifact-ignore/retained-root setup, all integration SHAs, Plan 018 evidence,
and the Plan 024/025 implementation risks remain governed by their stated
future gates.

## Unresolved non-blocking risks

- Future integrated acceptance SHAs do not exist. Every downstream plan must
  refresh its concrete base/excerpts/inventories or STOP when its wave opens.
- Plan 018 still lacks the accepted fixed-tick proof and 21 valid
  hardware-qualified trials. Its current `BLOCKED` state is intentional until
  explicit roadmap approval and accepted Wave 0 open the entry gate.
- Plan 026 may require an approved host-administrator group change, fresh
  login, coordinator `.gitignore` edit, and retained artifact-root setup; the
  roadmap rewrite performs none of those future actions.
- Plan 027 requires a readable configured original-source root; after Plan 026
  integration its coordinator-run browser revalidation also requires a
  controller-inspected unused runtime candidate and successful owned cleanup.
- Plans 024/025 remain high-risk future implementation even though their
  deterministic state, bounds, rollback, and evidence decisions are frozen.
- Actual implementation evidence and exercised rollback account for the three
  optimizer points deliberately not awarded in advance.

## Readiness verdict

**READY FOR USER REVIEW — EXECUTION NOT AUTHORIZED**

Explicit user approval is still required before Wave 0, Plan 026, Plan 027,
any product/tooling/host/browser/capture/preview/deployment action, or any
later wave.
