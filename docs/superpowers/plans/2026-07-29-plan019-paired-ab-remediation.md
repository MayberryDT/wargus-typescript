# Plan 019 Paired A/B Performance Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Determine whether Plan 019 contains a repeatable row-3 regression or whether the worst-of-three p95 acceptance rule is unstable, then implement and verify the correct remediation.

**Architecture:** A coordinator-owned diagnostic runner holds the global capture lock and alternates fifteen exact pre-Plan019 and Plan019 row-3 trials in matched pairs. A pure analysis module classifies paired and pooled distributions; an independent review validates the checksummed packet before either the production-remediation or acceptance-remediation branch runs.

**Tech Stack:** Node.js ESM, Playwright with system Chrome, existing `BrowserExecutionController`, Vite, TypeScript runtime hooks, retained JSON artifacts, SHA-256 manifests.

## Global Constraints

- Host is exactly `halla`.
- Base commit is exactly `5b7d9cc81072c8aeda1ce1a9c22602569e1a691b`.
- Plan 019 commit is exactly `5935a17f456868051c2c16b2f0d8d2b4da56d115`.
- Coordinator harness commit is exactly `82571c31a942cc38857f612ec6736cca05a174ce`.
- Use fifteen alternating matched pairs: odd pairs `base→plan019`, even pairs `plan019→base`.
- Capture only row 3: `army-100`, `1280x720`, DPR `1`, 30 seconds.
- Hold `.artifacts/performance/.wargus-capture.lock` for the complete diagnostic.
- Run one Vite/Chrome pair at a time; clean exact owned PIDs and ports before the next arm.
- Use `/usr/bin/google-chrome` and reject software rendering, hidden pages, unfocused pages, non-advancing RAF, fingerprint drift, and manifest routes other than HTTP 200.
- Preserve every existing baseline, failed packet, manifest, report, branch, and evidence file.
- Diagnostic artifacts live under `.artifacts/diagnostics/plan019-paired-ab/` and are never release acceptance packets.
- No deployment.

---

### Task 1: Paired Analysis Contract

**Files:**
- Create: `scripts/lib/paired-performance-analysis.mjs`
- Create: `scripts/verify-plan019-paired-ab-contract.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: raw trial records with `statistics.frame.p95Ms` and `stopped.frameSamples`.
- Produces:
  - `buildAlternatingPairs(count): Array<{pair:number, order:["base","plan019"]|["plan019","base"]}>`
  - `relativeDeltaPercent(base, after): number`
  - `pooledP95(trials): number`
  - `classifyPairedDiagnostic({baseTrials, plan019Trials}): PairedDiagnosticVerdict`
  - `writeAndVerifyChecksumManifest(directory): {path:string, sha256:string}`

- [ ] **Step 1: Write the failing contract verifier**

Use literal fixtures:

```js
const base = Array.from({ length: 15 }, (_, index) => ({
  pair: index + 1,
  statistics: { frame: { p95Ms: 50 } },
  stopped: { frameSamples: [16.7, 33.3, 50, 50] }
}));
const noisyAfter = base.map((trial, index) => ({
  ...trial,
  statistics: { frame: { p95Ms: index === 7 ? 66.6 : 50 } },
  stopped: { frameSamples: index === 7 ? [16.7, 50, 66.6, 66.6] : [16.7, 33.3, 50, 50] }
}));
assert.equal(classifyPairedDiagnostic({
  baseTrials: base,
  plan019Trials: noisyAfter
}).realRegression, false);
```

Also prove:

- the schedule contains exactly 15 pairs and alternates order;
- `11/15` regressions plus median and pooled regression over 5% classify as real;
- `10/15` regressions do not;
- exactly 5% passes and greater than 5% fails;
- missing, duplicate, non-finite, mismatched, or non-15-pair inputs fail;
- a modified checksummed file fails verification.

- [ ] **Step 2: Run RED**

Run:

```bash
node scripts/verify-plan019-paired-ab-contract.mjs
```

Expected: failure because `scripts/lib/paired-performance-analysis.mjs` does not exist.

- [ ] **Step 3: Implement the pure analysis module**

Implement literal median, nearest-rank p95, paired-delta, 11-of-15, and checksum logic. The verdict shape is:

```js
{
  schemaVersion: 1,
  pairCount: 15,
  medianPairedFrameP95RegressionPercent,
  regressedPairCount,
  pooledBaseFrameP95Ms,
  pooledPlan019FrameP95Ms,
  pooledFrameP95RegressionPercent,
  conditions: {
    medianOverFivePercent,
    atLeastElevenPairsOverFivePercent,
    pooledOverFivePercent
  },
  realRegression
}
```

`realRegression` is true only when all three conditions are true.

- [ ] **Step 4: Run GREEN and mutation checks**

Run the verifier, then independently mutate each of the three conditions to
always true and confirm a corresponding fixture fails.

- [ ] **Step 5: Run focused repository gates**

```bash
node --check scripts/lib/paired-performance-analysis.mjs
node --check scripts/verify-plan019-paired-ab-contract.mjs
./node_modules/.bin/tsc --noEmit
git diff --check
```

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/lib/paired-performance-analysis.mjs \
  scripts/verify-plan019-paired-ab-contract.mjs
git commit -m "Add paired Plan 019 performance analysis"
```

Obtain an independent review before Task 2.

---

### Task 2: Fail-Closed Paired Capture Runner

**Files:**
- Create: `scripts/run-plan019-paired-ab-diagnostic.mjs`
- Modify: `scripts/verify-plan019-paired-ab-contract.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 analysis functions, `BrowserExecutionController`, exact commits, system Chrome, retained artifact root.
- Produces:
  - fifteen base trial JSON files;
  - fifteen Plan019 trial JSON files;
  - `environment.json`, `pairs.json`, `resources.json`, `lifecycle.json`;
  - `paired-diagnostic-summary.json`;
  - `sha256.json`.

- [ ] **Step 1: Add failing runner contract tests**

Extract runner helpers under `WARGUS_PAIRED_AB_CONTRACT_TEST=1` and test:

```js
assert.deepEqual(canonicalIdentity(), {
  baseCommit: "5b7d9cc81072c8aeda1ce1a9c22602569e1a691b",
  plan019Commit: "5935a17f456868051c2c16b2f0d8d2b4da56d115",
  profile: "army-100",
  viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
  durationMs: 30000,
  pairCount: 15
});
```

Prove wrong commits, dirty worktrees, extra/missing pairs, reused stamps, absent
retained storage, lock contention, non-200 manifest, renderer mismatch,
fingerprint mismatch, incomplete cleanup, and partial publication fail closed.

- [ ] **Step 2: Run RED**

```bash
node scripts/verify-plan019-paired-ab-contract.mjs
```

Expected: missing runner/helper failure.

- [ ] **Step 3: Implement preflight and lifecycle**

The runner must:

- require cwd at clean coordinator commit `82571c3`;
- create detached disposable worktrees for the two exact commits;
- use Task 1’s fixed alternating pair schedule;
- acquire the shared global lock before worktree/browser allocation;
- install SIGINT/SIGTERM cleanup for controllers, profiles, worktrees, and lock;
- preflight retained storage and create a fresh UTC-stamped diagnostic directory;
- capture host, browser, GPU, source, commit, and package-lock identity.

- [ ] **Step 4: Implement one-arm capture**

For each arm:

1. allocate unique ports with `BrowserExecutionController`;
2. start Vite from coordinator `node_modules` with cwd at the arm worktree;
3. verify `/wargus/manifest.json` returns 200;
4. start system Chrome with the reviewed AMD Vulkan flags;
5. open `?smoke=1&perfProfile=army-100`;
6. verify hardware renderer, focus, visibility, viewport, DPR, profile, tick-zero fingerprint, and advancing RAF;
7. reset/start `army-100` and capture exactly 30 seconds;
8. retain raw summary samples plus computed statistics;
9. collect resource metrics;
10. close the page/browser/server and require empty residual PID/port lists.

Allow one replacement for an invalid arm. Record both invalid attempts. A
second invalid attempt stops the full diagnostic.

- [ ] **Step 5: Implement atomic publication**

Publish `paired-diagnostic-summary.json` only after all 30 valid trials,
classification, resource records, lifecycle cleanup, worktree removal, and lock
release succeed. Then generate and verify `sha256.json`. Any finalization error
must prevent a READY diagnostic.

- [ ] **Step 6: Run GREEN without browser capture**

Run contract mode only:

```bash
node scripts/verify-plan019-paired-ab-contract.mjs
node --check scripts/run-plan019-paired-ab-diagnostic.mjs
./node_modules/.bin/tsc --noEmit
git diff --check
```

- [ ] **Step 7: Commit**

```bash
git add package.json scripts/run-plan019-paired-ab-diagnostic.mjs \
  scripts/verify-plan019-paired-ab-contract.mjs
git commit -m "Add fail-closed Plan 019 paired diagnostic"
```

Obtain an independent code review before Task 3.

---

### Task 3: Execute And Independently Audit The Diagnostic

**Files:**
- Create: `.superpowers/sdd/PLAN019-PAIRED-AB/task-3-report.md` (ignored)
- Create: retained diagnostic packet outside Git

**Interfaces:**
- Consumes: reviewed Task 2 runner.
- Produces: one complete checksummed 15-pair packet and an independently verified classification.

- [ ] **Step 1: Inventory Halla**

Record hostname, listeners, relevant processes, memory, swap, disk, load, Chrome
version, renderer groups, lock absence, clean worktrees, and exact commits.

- [ ] **Step 2: Run the diagnostic**

Run under nested `video` and `render` groups:

```bash
sg video -c 'sg render -c "npm run diagnose:plan019-paired-ab"'
```

Do not run another browser or performance capture concurrently.

- [ ] **Step 3: Recompute the packet**

Independently verify every manifest member, all 15 pairs, alternating order,
valid/replacement dispositions, exact fingerprints, renderer identity,
resources, lock release, worktree removal, and zero residual PIDs/ports.

- [ ] **Step 4: Recompute classification**

Recompute all paired deltas, median, count over 5%, pooled p95 values, and the
three-condition verdict without calling the production analysis module.

- [ ] **Step 5: Independent review**

A fresh reviewer must approve packet integrity, arithmetic, and classification.
Do not begin Task 4 before approval.

---

### Task 4A: Remediate A Confirmed Production Regression

Run only if Task 3 independently confirms `realRegression: true`.

**Files:**
- Modify only the Plan 019 production hot path identified by traces.
- Modify: `scripts/verify-terrain-metadata-cache.mjs`
- Modify: `plans/evidence/019.md`

- [ ] **Step 1: Capture representative CPU traces**

Capture matched base and Plan019 traces outside the verdict trials. Identify a
specific function or allocation responsible for the paired regression.

- [ ] **Step 2: Write a focused failing test**

The test must reproduce the identified excess work with literal expected
counts/timing-independent work metrics.

- [ ] **Step 3: Implement the smallest production correction**

Change only the identified Plan 019 hot path. Preserve terrain parity,
determinism, fallback behavior, and diagnostics meaning.

- [ ] **Step 4: Verify**

Run the focused verifier, typecheck, determinism, assets, build, relevant
browser smoke, paired diagnostic, and unchanged release acceptance packet.

- [ ] **Step 5: Commit and independently review**

Commit production/test/evidence separately from coordinator harness changes.

---

### Task 4B: Remediate Acceptance Instability

Run only if Task 3 independently confirms `realRegression: false`.

**Files:**
- Modify: `scripts/run-successor-performance-matrix.mjs`
- Modify: `scripts/verify-successor-capture-contract.mjs`
- Modify: `scripts/verify-performance-acceptance-contract.mjs`
- Modify: `plans/WAVE-2-RECOVERY-AMENDMENT.md`
- Modify: `plans/PERFORMANCE-ACCEPTANCE.md`

- [ ] **Step 1: Write failing acceptance fixtures**

Prove one noisy trial cannot fail an otherwise stable distribution, while a
consistent regression does fail:

```js
assert.equal(acceptSevenTrialRow({
  baselineP95: [50, 50, 50, 50, 50, 50, 50],
  afterP95: [50, 50, 50, 66.6, 50, 50, 50],
  pooledBaselineP95: 50,
  pooledAfterP95: 50
}).accepted, true);
```

Also prove median regression over 5%, pooled regression over 5%, any new budget
failure, missing trials, or invalid comparability fails.

- [ ] **Step 2: Implement seven-trial robust acceptance**

Require exactly seven valid trials per row. Replace worst-trial p95 regression
with both:

- median trial-p95 regression at most 5%;
- pooled frame-p95 regression at most 5%.

Keep no-new-budget-failures, absolute-budget reporting, replacement limits,
fingerprints, cleanup, locks, and checksums unchanged.

- [ ] **Step 3: Amend durable contracts**

Document why the worst-of-three rule was unstable, cite the paired packet, and
state the new exact seven-trial arithmetic. Preserve all historical packets.

- [x] **Step 4: Capture a fresh Plan 018 baseline**

Capture all seven rows with seven valid trials each under the amended reviewed
harness. The capture path is
`scripts/run-plan018-seven-trial-baseline.mjs`, invoked with:

```bash
npm run capture:plan018-seven-trial-baseline
```

It must create a disposable detached Halla worktree at exact target
`5b7d9cc81072c8aeda1ce1a9c22602569e1a691b`, verify the target assets and
build, run the fixed-tick verifier by its absolute reviewed path, and capture
all canonical rows in explicit baseline mode. Baseline readiness depends on
capture, qualification, comparability, fixed-tick, lifecycle, raw-evidence,
and checksum integrity even when an absolute budget fails. Independently
review this coordinator before running browser work, then independently verify
and accept the new packet before successors.

Completed with accepted packet stamp `20260730T075608266Z`, manifest SHA-256
`21c25b2cdab0948a704f125cd3c97b51f0d676ee798f5fc00431023f0babba06`,
and coordinator `136bdf81557c1a2feba7f2dd6472d1e5ba9c4b1e`. The capture
recorded 49/49 qualified trials, zero invalid attempts, zero replacements,
`ready: true`, `absoluteBudgetsPass: false`, complete cleanup, and an
independent audit with zero findings. The exact identity is pinned in the
schema-version 4 successor loader.

- [ ] **Step 5: Rerun Plans 019–021 serially**

Capture Plan 019 rows 3/5/7, Plan 020 row 6, and Plan 021 rows 3/4/6. Require
robust incremental acceptance and clean lifecycle for each.

- [ ] **Step 6: Commit and independently review**

Commit contract/harness changes separately from evidence/roadmap updates.

---

### Task 5: Resume Wave 2

**Files:**
- Modify: `plans/evidence/019.md`
- Modify: `plans/evidence/020.md`
- Modify: `plans/evidence/021.md`
- Modify: `plans/README.md`

- [ ] **Step 1: Close the selected remediation branch**

Record exact commits, commands, paired packet, manifest, classification,
acceptance packets, and independent reviews.

- [ ] **Step 2: Complete original Recovery Tasks 5–6**

Only after Plans 019–021 are accepted, integrate reviewed Wave 2 commits and run
the full combined incremental matrix.

- [ ] **Step 3: Continue Waves 3–5**

Resume the approved roadmap without changing deployment scope.
