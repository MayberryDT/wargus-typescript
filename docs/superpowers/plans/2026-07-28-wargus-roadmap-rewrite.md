# Wargus Roadmap Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Wargus roadmap into an audited, Halla-native, wave-based execution system without changing product behavior.

**Architecture:** One shared Halla execution policy and one performance acceptance contract govern all active plans. Historical plans retain their implementation record with corrected completion semantics, while active Plans 018–027 use a normalized executor template, explicit wave dependencies, shared-file ownership, durable evidence, and machine-checkable documentation gates.

**Tech Stack:** Markdown plans and evidence, Git worktrees/branches, Bash and Node.js one-line verification commands, existing TypeScript/Vite repository conventions.

## Global Constraints

- Work only in the existing isolated `perf/plan-018-v2` worktree until the documentation rewrite is approved.
- This plan changes roadmap, plan, specification, and evidence documents only; do not change product source, tests, package scripts, assets, host groups, browser configuration, or deployment state.
- Plans 001–017 keep their implemented product behavior.
- Plans 014, 016, and 017 use `ACCEPTED-WAIVER`, never `DONE-VERIFIED`.
- Plan identifiers are stable references; waves and dependencies define execution order.
- CPU and GPU use on Halla is unrestricted during later execution, subject to the approved host-stability thresholds.
- Later performance captures are serial even when implementation work is parallel.
- Do not weaken performance, determinism, gameplay, save, or visual budgets.
- `plans/README.md` is coordinator-owned.
- Every task ends with `git diff --check`, a scoped diff review, and a focused commit.
- The rewrite is not ready for product execution until its Plan Optimizer score exceeds 90/100, plateaus, passes independent review, and receives user approval.

---

## File Structure

### New shared documents

- `plans/HALLA-EXECUTION-POLICY.md`
  - Host capacity, process ownership, browser qualification, resource safety,
    parallel implementation, serial capture, cleanup, and artifact storage.
- `plans/PERFORMANCE-ACCEPTANCE.md`
  - Profiles, viewports, trials, command samples, statistics, budgets,
    determinism, evidence, discard rules, and comparison rules.
- `plans/HISTORICAL-PLAN-AUDIT.md`
  - Verified, historical, waived, superseded, and revalidation status for Plans
    001–017.
- `plans/026-standardize-halla-browser-execution.md`
  - Executable successor plan for GPU access, dynamic ports, exact-PID cleanup,
    resource monitoring, and durable capture tooling.
- `plans/027-repair-drifted-verification-gates.md`
  - Executable successor plan for original-source portability and the two
    current stale verifier contracts.

### Existing shared documents

- `plans/README.md`
  - Authoritative 001–027 wave/status index and dependency summary.
- `plans/EXECUTION-GATES.md`
  - Preserve gameplay integration history; mark old resource limits historical
    and link the Halla policy.
- `plans/MECHANICS-ACCEPTANCE.md`
  - Clarify verified versus waived decisions and current browser/port policy.
- `plans/ROADMAP-OPTIMIZATION.md`
  - Preserve the historical gameplay score; add a separate current-roadmap
    rubric, rewrite rounds, scores, and plateau record.

### Historical plans and evidence

- `plans/001-*.md` through `plans/017-*.md`
  - Status/supersession metadata only; do not rewrite implemented behavior.
- `plans/evidence/014.md`, `plans/evidence/015.md`,
  `plans/evidence/016.md`, `plans/evidence/017.md`
  - Active-summary clarification only; preserve append-only history.

### Active plans

- `plans/018-establish-runtime-performance-feedback-loop.md`
- `plans/019-precompute-terrain-metadata.md`
- `plans/020-add-transient-unit-id-index.md`
- `plans/021-build-culled-render-snapshots.md`
- `plans/022-retain-world-display-objects.md`
- `plans/023-add-deterministic-spatial-occupancy-index.md`
- `plans/024-budget-and-stagger-pathfinding.md`
- `plans/025-make-visibility-and-fog-dirty-driven.md`
- `plans/evidence/018.md`

All active plans use the same section contract:

```markdown
> **Executor instructions**
> **Drift check**

## Status
## Why this matters
## Current state
## Commands you will need
## Scope
## Git workflow
## Shared interfaces and ownership
## Steps
## Test plan
## Performance acceptance
## Evidence contract
## Done criteria
## STOP conditions
## Rollback
## Maintenance notes
```

---

### Task 1: Add The Shared Halla And Performance Contracts

**Files:**
- Create: `plans/HALLA-EXECUTION-POLICY.md`
- Create: `plans/PERFORMANCE-ACCEPTANCE.md`
- Reference: `docs/superpowers/specs/2026-07-28-wargus-roadmap-waves-design.md`
- Reference: `AGENTS.md`

**Interfaces:**
- Consumes: approved host facts, resource thresholds, browser approval, and
  performance protocol from the design specification.
- Produces: canonical documents that Plans 018–027 reference verbatim.

- [ ] **Step 1: Verify the shared contracts do not already exist**

Run:

```bash
test ! -e plans/HALLA-EXECUTION-POLICY.md
test ! -e plans/PERFORMANCE-ACCEPTANCE.md
```

Expected: both commands exit 0.

- [ ] **Step 2: Write `plans/HALLA-EXECUTION-POLICY.md`**

Include these exact contracts:

```markdown
# Halla Execution Policy

## Scope
Applies to all unfinished Wargus plans and successor verification work on Halla.
Historical evidence retains the policy active when it was captured.

## Host stability
- Start only with at least 4 GiB MemAvailable and 20 GiB workspace disk free.
- Stop only owned work if MemAvailable falls below 2 GiB, swap used exceeds
  8 GiB, or workspace disk free falls below 20 GiB.
- CPU and GPU utilization are unrestricted.

## Process ownership
- Inspect listeners first and use unique unoccupied ports.
- Record exact root PIDs and descendants.
- Stop only exact owned PIDs.
- Never use broad pkill, killall, unrelated port-owner termination, or
  process-group cleanup that can reach unrelated work.

## Parallelism
- Implementation and focused non-benchmark checks may run concurrently in
  isolated worktrees when the wave ownership table permits.
- Performance captures run one at a time.
- Broad integration verification runs after all wave branches integrate.

## Browser qualification
- Prefer the in-app Browser when it provides continuously advancing RAF and
  the required hooks.
- Headless Chromium is explicitly approved as fallback.
- Frame-budget evidence requires a hardware renderer and rejects SwiftShader,
  llvmpipe, hidden documents, or non-advancing RAF.
- Readiness has a 120-second no-progress watchdog; valid captures have no
  arbitrary tab-duration ceiling.

## Artifact storage
.artifacts/performance/<plan>/<commit>/<UTC-stamp>/
```

Also require pre/post host metrics, exact cleanup verification, and explicit
residual-state reporting.

- [ ] **Step 3: Write `plans/PERFORMANCE-ACCEPTANCE.md`**

Include:

- all seven matrix rows;
- three independent valid trials per row;
- fresh profile page per trial;
- hardware renderer qualification;
- 5-second warmup;
- `t0`, `t15`, and `t30` lifecycle;
- ten real move/attack-move pairs for measured `command-18`;
- minimum 20 successful command outcomes and 40 samples for each latency
  distribution;
- nearest-rank percentiles;
- per-trial and worst-trial aggregation;
- exact heap formula from the design specification;
- no forced GC;
- fixed-tick non-browser determinism;
- valid discard reasons and one replacement limit;
- durable raw artifacts, normalized summaries, and SHA-256 checksums.

Freeze this budget table:

```markdown
| Metric | Profiles | Budget |
|---|---|---:|
| Frame p95 | every profile | ≤33.3 ms |
| Frame p99 | every profile | ≤50 ms |
| Frames over 50 ms | every profile | ≤1% |
| Scheduler dropped delta | every profile | 0 |
| Maximum scheduler backlog | every profile | ≤0.25 s |
| Heap growth from t15 to t30 | every profile | ≤15% |
| Input-to-command p95 | command-18 | ≤50 ms |
| Input-to-next-render-callback p95 | command-18 | ≤100 ms |
```

State that Plan 018 may finish with failed baseline budgets, while later plans
must pass their assigned budgets.

- [ ] **Step 4: Verify the contracts contain every frozen requirement**

Run:

```bash
rg -n "4 GiB|2 GiB|8 GiB|20 GiB|exact owned PIDs|Headless Chromium|120-second|no arbitrary tab-duration" plans/HALLA-EXECUTION-POLICY.md
rg -n "three independent|5-second|t15|t30|ten real|40 samples|nearest-rank|SHA-256|33\\.3|≤50 ms|≤15%" plans/PERFORMANCE-ACCEPTANCE.md
git diff --check
```

Expected: every pattern is present and the diff check exits 0.

- [ ] **Step 5: Review and commit**

Review:

```bash
git diff -- plans/HALLA-EXECUTION-POLICY.md plans/PERFORMANCE-ACCEPTANCE.md
```

Commit:

```bash
git add plans/HALLA-EXECUTION-POLICY.md plans/PERFORMANCE-ACCEPTANCE.md
git commit -m "Define Halla performance execution contracts"
```

---

### Task 2: Add The Foundation Repair Plans And Complete The Roadmap Index

**Files:**
- Create: `plans/026-standardize-halla-browser-execution.md`
- Create: `plans/027-repair-drifted-verification-gates.md`
- Modify: `plans/README.md`
- Reference: `plans/HALLA-EXECUTION-POLICY.md`
- Reference: `plans/PERFORMANCE-ACCEPTANCE.md`

**Interfaces:**
- Consumes: Task 1 shared contracts.
- Produces: Wave 0 executable plans and authoritative 001–027 index.

- [ ] **Step 1: Prove the current index is incomplete**

Run:

```bash
node -e 'const fs=require("fs");const s=fs.readFileSync("plans/README.md","utf8");for(let n=1;n<=27;n++){const id=String(n).padStart(3,"0");if(!s.includes("| "+id+" |"))throw new Error("missing roadmap row "+id)}'
```

Expected: FAIL with `missing roadmap row 019`.

- [ ] **Step 2: Write Plan 026**

Use the normalized active-plan section contract. Freeze:

- Wave 0, priority P0, dependencies none;
- exact host/group preflight;
- add `halla` to `render` and `video`;
- verify fresh-process read access to `/dev/dri/card1` and
  `/dev/dri/renderD128`;
- hardware Chrome renderer preflight;
- inventory every current fixed browser/debug port;
- replace fixed ports with inspected unique ports;
- replace process-group cleanup with exact owned-PID cleanup;
- add resource monitoring and durable artifact directories;
- preserve AGENTS in-app-first and user-approved headless fallback semantics;
- focused tests for occupied-port refusal, descendant cleanup, unrelated-process
  survival, software-renderer rejection, and safety abort;
- no product behavior or performance optimization.

Its DONE gate requires hardware renderer qualification and safe cleanup proof.

- [ ] **Step 3: Write Plan 027**

Use the normalized active-plan section contract. Freeze:

- Wave 0, priority P0, dependencies none;
- reproduce `verify:source-resource-ui` ENOENT for the `/home/tyler/...` path;
- define one configurable Halla original-source root with a checked preflight;
- do not silently skip original-source assertions;
- reproduce the two `verify:fixed-demo-polish` stale assertions;
- replace only those stale source fragments with behavior/module-contract checks;
- revalidate Plans 003, 005, 006, 007, 009, and 010 where their current
  contracts are affected;
- no gameplay or UI changes.

Its DONE gate requires both previously red commands to pass.

- [ ] **Step 4: Rewrite the README index and status semantics**

Add:

- the complete status vocabulary from the specification;
- columns for wave, implementation/acceptance commit, evidence, last
  revalidated, and successor;
- rows 019–027;
- explicit statement that IDs are stable references and waves govern order;
- wave table:

```markdown
| Wave | Plans |
|---|---|
| 0 — Foundation repair | 026, 027 |
| 1 — Measurement foundation | 018 |
| 2 — Independent hot paths | 019, 020, 021 |
| 3 — Structural optimization | 022, 023 |
| 4 — High-risk scheduling | 024, 025 |
| 5 — Release | combined verification, review, preview, production |
```

Do not guess unknown historical completion dates. Mark them `not recorded` and
link the historical audit that Task 3 creates.

- [ ] **Step 5: Verify all plan rows and Wave 0 links**

Run:

```bash
node -e 'const fs=require("fs");const s=fs.readFileSync("plans/README.md","utf8");for(let n=1;n<=27;n++){const id=String(n).padStart(3,"0");if(!s.includes("| "+id+" |"))throw new Error("missing roadmap row "+id)};for(const f of ["plans/026-standardize-halla-browser-execution.md","plans/027-repair-drifted-verification-gates.md"])if(!fs.existsSync(f))throw new Error("missing "+f);console.log("27 roadmap rows and Wave 0 plans verified")'
rg -n "DONE-HISTORICAL|DONE-VERIFIED|ACCEPTED-WAIVER|waves govern" plans/README.md
git diff --check
```

Expected: Node prints the success line; every status pattern is present.

- [ ] **Step 6: Review and commit**

```bash
git diff -- plans/README.md plans/026-standardize-halla-browser-execution.md plans/027-repair-drifted-verification-gates.md
git add plans/README.md plans/026-standardize-halla-browser-execution.md plans/027-repair-drifted-verification-gates.md
git commit -m "Restore roadmap waves and foundation repairs"
```

---

### Task 3: Reconcile Historical Plan Status Without Rewriting Product History

**Files:**
- Create: `plans/HISTORICAL-PLAN-AUDIT.md`
- Modify: `plans/001-*.md` through `plans/017-*.md`, status blocks only
- Modify: `plans/EXECUTION-GATES.md`
- Modify: `plans/MECHANICS-ACCEPTANCE.md`
- Modify: `plans/ROADMAP-OPTIMIZATION.md`
- Modify: `plans/evidence/014.md`
- Modify: `plans/evidence/015.md`
- Modify: `plans/evidence/016.md`
- Modify: `plans/evidence/017.md`
- Modify: `plans/README.md`

**Interfaces:**
- Consumes: Task 2 status vocabulary and roadmap index.
- Produces: authoritative verified-versus-waived history and supersession
  boundaries for future executors.

- [ ] **Step 1: Write the historical audit**

Create a 001–017 table with:

- current classification;
- implementation/acceptance commit when recorded;
- evidence path;
- last revalidation;
- known current drift;
- successor;
- whether original exhaustive acceptance passed, was historical, or was
  explicitly waived.

Use:

- 001–010: `DONE-HISTORICAL`;
- 011–013 and 015: `DONE-VERIFIED`;
- 014, 016, and 017: `ACCEPTED-WAIVER`.

Record the two current red gates as Plan 027 ownership, not as retroactive
product failure.

- [ ] **Step 2: Add concise status notices to Plans 001–017**

Do not rewrite original steps. Add a notice immediately after each title:

```markdown
> **Historical status:** This plan has already been executed. Its original
> executor instructions are retained as history and are not a current work
> order. See `plans/HISTORICAL-PLAN-AUDIT.md`.
```

For Plans 014, 016, and 017, explicitly say the final decision is
`ACCEPTED-WAIVER`, name the waived gates, and replace only misleading completion
marks for those gates with `WAIVED` or `NOT RUN`.

- [ ] **Step 3: Reconcile shared gameplay governance**

In `plans/EXECUTION-GATES.md`:

- mark the 30-second/one-process section as the historical 011–017 capture
  policy;
- state it does not govern unfinished plans;
- link `plans/HALLA-EXECUTION-POLICY.md`;
- preserve gameplay critical path, shared-file correctness, checkpoints,
  acceptance, and rollback history;
- correct missing historical shared-file ownership noted in the audit.

In `plans/MECHANICS-ACCEPTANCE.md`:

- distinguish `DONE-VERIFIED` from `ACCEPTED-WAIVER`;
- replace fixed port 5173 with inspected unique port wording for future replay;
- preserve the M01–M13 definitions.

In `plans/ROADMAP-OPTIMIZATION.md`:

- preserve the historical 92/100 score;
- state explicitly that it graded pre-implementation plan quality;
- add a new heading for the 2026-07-28 full-roadmap rewrite score history.

- [ ] **Step 4: Clarify active evidence summaries**

- Plan 014: keep the waiver at the top and do not claim original M07–M09 proof.
- Plan 015: state that final READY supersedes later appended historical
  `PENDING` text.
- Plans 016/017: state which replay/bakeoff gates were waived.
- Plan 017: state Candidate B is user accepted, not a measured 18-run winner.

Do not delete append-only historical evidence.

- [ ] **Step 5: Verify classifications and preserve scenario definitions**

Run:

```bash
rg -n "DONE-HISTORICAL" plans/HISTORICAL-PLAN-AUDIT.md plans/README.md
rg -n "DONE-VERIFIED" plans/HISTORICAL-PLAN-AUDIT.md plans/README.md
rg -n "ACCEPTED-WAIVER" plans/HISTORICAL-PLAN-AUDIT.md plans/README.md plans/014-*.md plans/016-*.md plans/017-*.md
rg -n "Candidate B.*user|not.*18-run" plans/017-*.md plans/evidence/017.md
for id in $(seq -w 1 13); do rg -q "M${id}" plans/MECHANICS-ACCEPTANCE.md || exit 1; done
git diff --check
```

Expected: all classifications occur; M01–M13 remain present; diff check passes.

- [ ] **Step 6: Review scope and commit**

Confirm no product or test file changed:

```bash
git diff --name-only | rg -v '^(plans/|docs/)' && exit 1 || true
git diff -- plans/HISTORICAL-PLAN-AUDIT.md plans/README.md plans/EXECUTION-GATES.md plans/MECHANICS-ACCEPTANCE.md plans/ROADMAP-OPTIMIZATION.md plans/0*.md plans/evidence/0*.md
```

Commit:

```bash
git add \
  plans/HISTORICAL-PLAN-AUDIT.md \
  plans/README.md \
  plans/EXECUTION-GATES.md \
  plans/MECHANICS-ACCEPTANCE.md \
  plans/ROADMAP-OPTIMIZATION.md \
  plans/001-*.md plans/002-*.md plans/003-*.md plans/004-*.md \
  plans/005-*.md plans/006-*.md plans/007-*.md plans/008-*.md \
  plans/009-*.md plans/010-*.md plans/011-*.md plans/012-*.md \
  plans/013-*.md plans/014-*.md plans/015-*.md plans/016-*.md \
  plans/017-*.md \
  plans/evidence/014.md plans/evidence/015.md \
  plans/evidence/016.md plans/evidence/017.md
git commit -m "Reconcile historical roadmap decisions"
```

---

### Task 4: Rewrite Plan 018 Around The Canonical Measurement Contract

**Files:**
- Modify: `plans/018-establish-runtime-performance-feedback-loop.md`
- Modify: `plans/evidence/018.md`
- Modify: `plans/README.md`
- Reference: `plans/HALLA-EXECUTION-POLICY.md`
- Reference: `plans/PERFORMANCE-ACCEPTANCE.md`

**Interfaces:**
- Consumes: shared execution/performance contracts and existing Plan 018
  commits through `e80215e`.
- Produces: executable Wave 1 closeout plan that later waves use unchanged.

- [ ] **Step 1: Prove stale Plan 018 rules remain**

Run:

```bash
rg -n "30 seconds|30-second|required in-app Browser is unavailable|Standalone Playwright" plans/018-establish-runtime-performance-feedback-loop.md
```

Expected: stale constraints are found.

- [ ] **Step 2: Reconcile Plan 018 status, base, and actual scope**

Rewrite the plan against the current isolated implementation branch:

- identify existing implementation commits rather than prescribing duplicate
  work;
- list `src/view/renderHud.ts`, `src/view/renderOverlays.ts`,
  `src/view/renderWorld.ts`, display-object instrumentation, browser verifier
  surfaces, and every actual changed scope;
- mark implementation checkpoints complete only when evidence exists;
- leave hardware matrix and final integration incomplete;
- require Wave 0 as an entry dependency;
- replace the old browser section with references to both shared contracts.

- [ ] **Step 3: Replace determinism and command sampling rules**

Require:

- fixed-tick state/hash equality in non-browser verification;
- identical browser initial fingerprints, not identical wall-clock ending ticks;
- disposable synthetic command preflight;
- real-input measured trials with the frozen sample counts;
- three valid trials per row and worst-trial reporting.

- [ ] **Step 4: Replace the evidence blocker with an amendment record**

Keep the previous failed attempts as historical diagnostics. Add:

- `Superseded blocker` heading;
- explicit user authorization date;
- new protocol links;
- pending Wave 0 hardware qualification;
- pending canonical three-trial matrix;
- no accepted row or budget verdict until rerun.

Do not relabel old `/tmp` files as accepted evidence.

- [ ] **Step 5: Verify no stale capture rule remains**

Run:

```bash
! rg -n "Do not run any tab longer than 30 seconds|A live browser segment would exceed 30 seconds|The required in-app Browser is unavailable; report rather than falling back" plans/018-establish-runtime-performance-feedback-loop.md
rg -n "HALLA-EXECUTION-POLICY|PERFORMANCE-ACCEPTANCE|three valid|fixed-tick|initial fingerprint|Wave 0" plans/018-establish-runtime-performance-feedback-loop.md
rg -n "Superseded blocker|pending canonical|no accepted" plans/evidence/018.md
git diff --check
```

Expected: stale rules are absent and new contracts are present.

- [ ] **Step 6: Review and commit**

```bash
git diff -- plans/018-establish-runtime-performance-feedback-loop.md plans/evidence/018.md plans/README.md
git add plans/018-establish-runtime-performance-feedback-loop.md plans/evidence/018.md plans/README.md
git commit -m "Rewrite Plan 018 for Halla measurement"
```

---

### Task 5: Rewrite Wave 2 Plans 019–021

**Files:**
- Modify: `plans/019-precompute-terrain-metadata.md`
- Modify: `plans/020-add-transient-unit-id-index.md`
- Modify: `plans/021-build-culled-render-snapshots.md`
- Modify: `plans/README.md`

**Interfaces:**
- Consumes: accepted Plan 018 contract and Wave 2 ownership boundaries.
- Produces: three safely parallel executable plans.

- [ ] **Step 1: Normalize all three plans**

For each plan:

- add `Wave: 2`;
- run `git rev-parse --short HEAD` and record its exact printed value as the
  rewrite drift base;
- require the Wave 1 coordinator to refresh that concrete SHA after Plan 018
  integration if the cited source seams change;
- use the normalized active-plan section contract;
- reference both shared policies;
- add rollback and durable evidence sections;
- assign `package.json` and `plans/README.md` to the coordinator.

Do not write a symbolic commit token into an executable plan.

- [ ] **Step 2: Reconcile Plan 019**

Preserve terrain flag parity, removed-tree tile 126, immutable cache, and
passability/FOV semantics. Add:

- exact post-018 drift excerpts;
- Wave 2 shared baseline artifact references;
- namespaced terrain diagnostics;
- rollback to legacy slot lookup;
- no occupancy or path-selection changes.

- [ ] **Step 3: Reconcile Plan 020**

Preserve authoritative `world.units` order and save exclusion. Add:

- exact post-018 `orders.ts` mutation inventory;
- explicit owner for same-tick/same-length invalidation;
- duplicate-ID behavior;
- namespaced lookup/rebuild diagnostics;
- rollback to authoritative array lookup.

- [ ] **Step 4: Reconcile Plan 021 and remove the false dependency**

Set dependencies to Plan 018 only. Preserve:

- render-only scope;
- cull-before-sort and exact draw-order parity;
- Plan 018 tracked create/destroy counters;
- independent viewport snapshots;
- visual/pixel parity;
- rollback to prepared immediate rendering.

Do not consume Plan 020's simulation index unless a real shared API is added to
the design and dependency.

- [ ] **Step 5: Verify Wave 2 independence**

Run:

```bash
rg -n "Wave.*2|HALLA-EXECUTION-POLICY|PERFORMANCE-ACCEPTANCE|## Rollback" plans/019-*.md plans/020-*.md plans/021-*.md
! rg -n "Depends on.*020" plans/021-build-culled-render-snapshots.md
rg -n "coordinator.*package.json|coordinator.*plans/README.md" plans/019-*.md plans/020-*.md plans/021-*.md
git diff --check
```

Expected: every shared contract is present and Plan 021 does not depend on 020.

- [ ] **Step 6: Review and commit**

```bash
git diff -- plans/019-precompute-terrain-metadata.md plans/020-add-transient-unit-id-index.md plans/021-build-culled-render-snapshots.md plans/README.md
git add plans/019-precompute-terrain-metadata.md plans/020-add-transient-unit-id-index.md plans/021-build-culled-render-snapshots.md plans/README.md
git commit -m "Rewrite independent performance wave"
```

---

### Task 6: Rewrite Wave 3 Plans 022–023

**Files:**
- Modify: `plans/022-retain-world-display-objects.md`
- Modify: `plans/023-add-deterministic-spatial-occupancy-index.md`
- Modify: `plans/README.md`

**Interfaces:**
- Consumes: Plans 019–021 interfaces and the Plan 018 diagnostic schema.
- Produces: independent renderer-retention and simulation-occupancy plans.

- [ ] **Step 1: Normalize both plans**

Add full status, drift, commands, scope, git workflow, shared ownership,
evidence, STOP, rollback, and maintenance sections. Set:

- Plan 022 dependencies: 018 and 021;
- Plan 023 dependencies: 018, 019, and 020;
- Wave: 3;
- evidence paths: `plans/evidence/022.md` and `plans/evidence/023.md`.

- [ ] **Step 2: Reconcile Plan 022 with existing instrumentation**

Require Plan 022 to extend, not duplicate:

- `src/performance/displayObjectPerformance.ts`;
- Plan 018 create/destroy counters;
- tracked constructors in render surfaces.

Freeze:

- per-view cache ownership;
- per-kind active/dormant/pool bounds;
- explicit world/view disposal;
- stable ID and draw-order parity;
- zero steady-state creations for unchanged visible entities;
- rollback per entity kind.

- [ ] **Step 3: Reconcile Plan 023 mutation ownership**

Freeze:

- authoritative `world.units`;
- deterministic ordered buckets;
- exact register/unregister/transition seams;
- full mutation inventory;
- rebuild/invalidation fallback;
- development parity oracle;
- no save serialization;
- serialization after Plan 019/020 ownership;
- rollback to authoritative full scan.

- [ ] **Step 4: Verify Wave 3 separation**

Run:

```bash
rg -n "Wave.*3|plans/evidence/022.md|## STOP conditions|## Rollback" plans/022-retain-world-display-objects.md
rg -n "Wave.*3|plans/evidence/023.md|authoritative.*world.units|## STOP conditions|## Rollback" plans/023-add-deterministic-spatial-occupancy-index.md
rg -n "displayObjectPerformance|existing.*counter|extend" plans/022-retain-world-display-objects.md
git diff --check
```

Expected: both plans use the normalized contract and separate ownership.

- [ ] **Step 5: Review and commit**

```bash
git diff -- plans/022-retain-world-display-objects.md plans/023-add-deterministic-spatial-occupancy-index.md plans/README.md
git add plans/022-retain-world-display-objects.md plans/023-add-deterministic-spatial-occupancy-index.md plans/README.md
git commit -m "Rewrite structural performance wave"
```

---

### Task 7: Redesign Wave 4 Plans 024–025

**Files:**
- Modify: `plans/024-budget-and-stagger-pathfinding.md`
- Modify: `plans/025-make-visibility-and-fog-dirty-driven.md`
- Modify: `plans/README.md`

**Interfaces:**
- Consumes: Plan 023 mutation/index ownership, Plan 022 render-cache ownership,
  Plan 018 metrics, and Plan 019 terrain metadata.
- Produces: two high-risk plans that may run in parallel without sharing
  authoritative state or save fields.

- [ ] **Step 1: Normalize both plans and freeze Wave 4 boundaries**

Set:

- Plan 024 dependencies: 018, 019, 020, 023;
- Plan 025 dependencies: 018, 019, 022, 023;
- Wave: 4;
- coordinator-owned performance schema/package/index changes;
- separate code ownership so 024 owns path requests/save schema and 025 owns
  visibility/fog caches without new save fields.

- [ ] **Step 2: Redesign Plan 024 around deterministic work**

Replace the four-whole-search budget with:

- deterministic node-expansion budget per simulation tick;
- resumable A* state;
- stable request sequence and priority;
- mandatory authoritative pending-request representation;
- backward-compatible save normalization;
- exact sequence restoration;
- cancellation/supersession for death, new command, transport, world
  replacement, and invalid targets;
- deterministic retry phasing;
- starvation bound and queue age telemetry;
- X12 as an acceptance scenario;
- explicit prohibition on rejected commit `2fa96ce` semantics.

No executor may choose later whether pending requests are saved; the plan must
specify that they are.

- [ ] **Step 3: Clarify Plan 025 ownership and bounds**

Separate:

- authoritative visible/explored results;
- simulation-owned derived contribution caches;
- renderer-owned fog chunk caches.

Require:

- derived caches are not serialized;
- deterministic full rebuild on load/world change;
- bounded per-source contributed-tile records;
- bounded fog chunks and eviction/disposal;
- local-player visibility updates every required simulation tick;
- existing AI exploration cadence preserved unless separately justified;
- full-rebuild grid parity oracle;
- simulation rollback independent from renderer rollback.

- [ ] **Step 4: Verify high-risk decisions are no longer optional**

Run:

```bash
rg -n "node-expansion|resumable|mandatory.*pending|backward-compatible|sequence restoration|X12|2fa96ce" plans/024-budget-and-stagger-pathfinding.md
! rg -n "if pending|if they can cross|four.*searches per" plans/024-budget-and-stagger-pathfinding.md
rg -n "not serialized|full rebuild|bounded per-source|bounded fog|AI exploration cadence|independent.*rollback" plans/025-make-visibility-and-fog-dirty-driven.md
git diff --check
```

Expected: mandatory decisions are present and conditional save semantics are
absent.

- [ ] **Step 5: Review and commit**

```bash
git diff -- plans/024-budget-and-stagger-pathfinding.md plans/025-make-visibility-and-fog-dirty-driven.md plans/README.md
git add plans/024-budget-and-stagger-pathfinding.md plans/025-make-visibility-and-fog-dirty-driven.md plans/README.md
git commit -m "Redesign high-risk performance wave"
```

---

### Task 8: Verify, Optimize, And Review The Rewritten Roadmap

**Files:**
- Modify: `plans/README.md`
- Modify: `plans/ROADMAP-OPTIMIZATION.md`
- Create: `plans/evidence/ROADMAP-REWRITE-2026-07-28.md`

**Interfaces:**
- Consumes: Tasks 1–7 complete plan set.
- Produces: self-consistent, scored, independently reviewed roadmap ready for
  user approval and later wave execution.

- [ ] **Step 1: Verify every active plan has a concrete drift base**

Inspect the recorded commit and drift command in each active plan. Every executable
plan must contain a concrete hexadecimal SHA captured during its rewrite.

Run:

```bash
node -e 'const fs=require("fs");const terms=["T"+"BD","PLACE"+"HOLDER","FIX"+"ME","implement "+"later","fill "+"in"];for(const file of fs.readdirSync("plans").filter(x=>x.endsWith(".md"))){const text=fs.readFileSync("plans/"+file,"utf8");for(const term of terms)if(text.includes(term))throw new Error(file+" contains unresolved marker "+term)}'
for file in plans/018-*.md plans/019-*.md plans/020-*.md plans/021-*.md plans/022-*.md plans/023-*.md plans/024-*.md plans/025-*.md plans/026-*.md plans/027-*.md; do
  rg -q "[0-9a-f]{7,40}" "$file" || { echo "$file has no concrete SHA"; exit 1; }
done
```

Expected: no unresolved marker is found and every active plan has a concrete SHA.

- [ ] **Step 2: Verify the dependency graph and required sections**

Run this exact Node check:

```bash
node -e '
const fs=require("fs"),path=require("path");
const files=fs.readdirSync("plans").filter(x=>/^(018|019|020|021|022|023|024|025|026|027)-.*\.md$/.test(x));
if(files.length!==10)throw new Error("expected 10 active plan files, got "+files.length);
const required=["## Status","## Scope","## Shared interfaces and ownership","## Steps","## Test plan","## Evidence contract","## Done criteria","## STOP conditions","## Rollback"];
for(const file of files){const text=fs.readFileSync(path.join("plans",file),"utf8");for(const heading of required)if(!text.includes(heading))throw new Error(file+" missing "+heading)}
console.log("active plan section contract verified");
'
```

Then verify all 27 README rows:

```bash
node -e 'const fs=require("fs");const s=fs.readFileSync("plans/README.md","utf8");for(let n=1;n<=27;n++){const id=String(n).padStart(3,"0");if(!s.includes("| "+id+" |"))throw new Error("missing "+id)};console.log("27 roadmap rows verified")'
```

Expected: both success lines print.

- [ ] **Step 3: Run the Plan Optimizer loop**

Use the frozen 100-point rubric from the approved design:

- repo grounding/drift 15;
- measurable goal/done 12;
- dependency/wave correctness 18;
- verification/evidence 18;
- shared browser/resource/protocol consistency 15;
- risk/rollback 10;
- parallel executability/file ownership 8;
- maintenance/handoff 4.

Record each separate score pass in `plans/ROADMAP-OPTIMIZATION.md`. Critique and
rewrite only substantive weaknesses. Accept a round only for a gain of at
least 2 points. Stop after three non-improving rounds or eight total rounds.
The final score must exceed 90.

- [ ] **Step 4: Write the rewrite evidence packet**

Create `plans/evidence/ROADMAP-REWRITE-2026-07-28.md` containing:

- branch and commit range;
- files created/modified;
- audit findings mapped to rewritten files/sections;
- final wave/dependency table;
- shared-file ownership table;
- status classification table;
- verification command outputs;
- Plan Optimizer trajectory and final score;
- unresolved risks;
- explicit `READY FOR USER REVIEW` or `NOT READY`.

- [ ] **Step 5: Run final documentation verification**

Run:

```bash
git diff --check
git status --short
rg -n "30-second|30 seconds|one low-priority project process|Do not use parallel agents" plans/018-*.md plans/019-*.md plans/020-*.md plans/021-*.md plans/022-*.md plans/023-*.md plans/024-*.md plans/025-*.md plans/026-*.md plans/027-*.md && exit 1 || true
rg -n "SwiftShader|llvmpipe|exact owned PIDs|performance captures run one at a time" plans/HALLA-EXECUTION-POLICY.md plans/PERFORMANCE-ACCEPTANCE.md
```

Expected: diff check passes; active plans contain no old resource prohibition;
the new safety terms are present.

- [ ] **Step 6: Request independent roadmap review**

The reviewer must check:

- spec coverage;
- historical status honesty;
- dependency DAG;
- wave concurrency;
- shared-file ownership;
- Plan 018 statistics and heap contract;
- Plan 024 save/resumable-search decisions;
- Plan 025 transient-state/cache ownership;
- absence of product implementation changes;
- evidence truthfulness.

Address every blocking finding before continuing.

- [ ] **Step 7: Commit the optimized rewrite**

```bash
git add \
  plans/HALLA-EXECUTION-POLICY.md \
  plans/PERFORMANCE-ACCEPTANCE.md \
  plans/HISTORICAL-PLAN-AUDIT.md \
  plans/EXECUTION-GATES.md \
  plans/MECHANICS-ACCEPTANCE.md \
  plans/ROADMAP-OPTIMIZATION.md \
  plans/README.md \
  plans/001-*.md plans/002-*.md plans/003-*.md plans/004-*.md \
  plans/005-*.md plans/006-*.md plans/007-*.md plans/008-*.md \
  plans/009-*.md plans/010-*.md plans/011-*.md plans/012-*.md \
  plans/013-*.md plans/014-*.md plans/015-*.md plans/016-*.md \
  plans/017-*.md plans/018-*.md plans/019-*.md plans/020-*.md \
  plans/021-*.md plans/022-*.md plans/023-*.md plans/024-*.md \
  plans/025-*.md plans/026-*.md plans/027-*.md \
  plans/evidence/014.md plans/evidence/015.md \
  plans/evidence/016.md plans/evidence/017.md \
  plans/evidence/018.md \
  plans/evidence/ROADMAP-REWRITE-2026-07-28.md
git commit -m "Finalize wave-based Wargus roadmap"
```

- [ ] **Step 8: Stop for user approval**

Report:

- final score and trajectory;
- exact commit range;
- final waves;
- independent review verdict;
- unresolved non-blocking risks.

Do not execute Plan 026 or any product/tooling change until the user approves
the rewritten roadmap.
