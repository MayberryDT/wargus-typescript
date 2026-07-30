import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(resolve(root, file), "utf8");
const performanceContract = read("plans/PERFORMANCE-ACCEPTANCE.md");
const wave2Recovery = read("plans/WAVE-2-RECOVERY-AMENDMENT.md");
const pairedRemediationPlan = read("docs/superpowers/plans/2026-07-29-plan019-paired-ab-remediation.md");
const plan018Evidence = read("plans/evidence/018.md");
const hallaPolicy = read("plans/HALLA-EXECUTION-POLICY.md");
const roadmap = read("plans/README.md");
const detailedPlans = [
  "plans/019-precompute-terrain-metadata.md",
  "plans/020-add-transient-unit-id-index.md",
  "plans/021-build-culled-render-snapshots.md",
  "plans/022-retain-world-display-objects.md",
  "plans/023-add-deterministic-spatial-occupancy-index.md",
  "plans/024-budget-and-stagger-pathfinding.md",
  "plans/025-make-visibility-and-fog-dirty-driven.md"
].map((file) => [file, read(file)]);

const requiredModes = ["incremental", "absolute-release"];
assert.ok(
  requiredModes.every((mode) => performanceContract.includes(mode)),
  "missing incremental/absolute split"
);
assert.match(performanceContract, /no new budget-failure key/i);
assert.match(performanceContract, /median.*frame p95.*5%/is);
assert.match(performanceContract, /pooled.*frame p95.*5%/is);
assert.match(performanceContract, /targeted work-reduction proof/i);
assert.match(performanceContract, /Wave 5.*every absolute shared budget/i);
assert.match(performanceContract, /afterWorstTrialBudgetFailureKeys ⊆ acceptedPlan018WorstTrialBudgetFailureKeys/);
assert.match(performanceContract, /incrementalReady =\n  captureComplete\n  && validityAndComparabilityPass\n  && fixedTickPass\n  && noNewBudgetFailuresPass\n  && frameP95RegressionPass\n  && targetedWorkReductionProofPass\n  && cleanupAndIntegrityPass/);
assert.match(performanceContract, /absoluteReleaseReady =\n  incrementalReady\n  && everyAbsoluteSharedBudgetPass/);
assert.match(performanceContract, /exactly seven independent valid trials per row/i);
assert.match(performanceContract, /median.*seven.*trial.*p95/is);
assert.match(performanceContract, /nearest-rank p95 of all raw frame samples/i);
assert.match(performanceContract, /both.*no greater than 5%/i);
assert.match(performanceContract, /0\.1 ms decision precision/i);
assert.match(performanceContract, /schema-version 4/i);
assert.match(performanceContract, /20260730T062702Z/);
assert.match(performanceContract, /6bc0def2ac32baa619b718e5e3f9eb504c3c29f10e5051bbbb06cfd43549d962/);
assert.match(performanceContract, /realRegression.*false/i);
assert.match(performanceContract, /preserve.*historical.*packet/i);

assert.match(wave2Recovery, /Every measured row needs exactly seven independent valid trials/i);
assert.match(wave2Recovery, /median.*trial.*p95/i);
assert.match(wave2Recovery, /pooled.*raw-frame.*p95/i);
assert.match(wave2Recovery, /schema-version 4/i);
assert.match(wave2Recovery, /20260730T062702Z/);
assert.match(wave2Recovery, /6bc0def2ac32baa619b718e5e3f9eb504c3c29f10e5051bbbb06cfd43549d962/);
assert.match(wave2Recovery, /run-plan018-seven-trial-baseline\.mjs/);
assert.match(wave2Recovery, /WARGUS_BASELINE_CAPTURE=1/);
assert.match(performanceContract, /run-plan018-seven-trial-baseline\.mjs/);
assert.match(pairedRemediationPlan, /capture:plan018-seven-trial-baseline/);
assert.match(pairedRemediationPlan, /5b7d9cc81072c8aeda1ce1a9c22602569e1a691b/);
for (const [label, document] of [["performance contract", performanceContract], ["Wave 2 recovery", wave2Recovery], ["Plan 018 evidence", plan018Evidence]]) {
  assert.match(document, /20260730T075608266Z/, `${label} must pin the accepted schema-v4 stamp.`);
  assert.match(document, /21c25b2cdab0948a704f125cd3c97b51f0d676ee798f5fc00431023f0babba06/, `${label} must pin the accepted schema-v4 manifest.`);
}
assert.match(plan018Evidence, /49\/49/);
assert.match(plan018Evidence, /zero invalid/i);
assert.match(plan018Evidence, /zero replacements/i);
assert.match(plan018Evidence, /absoluteBudgetsPass.*false/i);
assert.match(plan018Evidence, /audit.*zero findings/is);
assert.match(pairedRemediationPlan, /\[x\].*Step 4: Capture a fresh Plan 018 baseline/i);
assert.match(pairedRemediationPlan, /run-wave2-successor-capture\.mjs/);
for (const [planId, targetSha] of [
  ["019", "5935a17f456868051c2c16b2f0d8d2b4da56d115"],
  ["020", "9bab6b0e3f7d260148cc1c0f5c1c231098046e19"],
  ["021", "c4238c6ae0aaa093785b52f6f71e9569395bf08e"]
]) {
  assert.match(pairedRemediationPlan, new RegExp(targetSha));
  assert.match(pairedRemediationPlan, new RegExp(`WARGUS_PERF_PLAN=${planId} WARGUS_PERF_ACCEPTANCE_MODE=incremental npm run capture:wave2-successor`));
}
assert.match(roadmap, /20260730T075608266Z/);
assert.doesNotMatch(wave2Recovery, /Every measured row still needs three independent valid trials/i);

for (const [file, plan] of detailedPlans) {
  assert.match(plan, /incrementalReady =\n  captureComplete\n  && validityAndComparabilityPass\n  && fixedTickPass\n  && noNewBudgetFailuresPass\n  && frameP95RegressionPass\n  && targetedWorkReductionProofPass\n  && cleanupAndIntegrityPass/, `${file} must use the incremental algorithm verbatim.`);
  assert.doesNotMatch(plan, /(?:every\s+(?:assigned|applicable|unchanged|shared)\s+budget(?:s)?\s+must\s+pass|shared budgets pass|assigned shared budget passes|assigned budgets pass|a budget fails)/i, `${file} retains stale absolute-budget closure language.`);
}

assert.match(hallaPolicy, /Wave 2.*incremental/i);
assert.match(hallaPolicy, /Wave 3.*incremental/i);
assert.match(hallaPolicy, /Wave 4.*incremental/i);
assert.match(hallaPolicy, /Wave 5.*absolute-release/i);
assert.match(roadmap, /Wave 2.*incremental/i);
assert.match(roadmap, /Wave 3.*incremental/i);
assert.match(roadmap, /Wave 4.*incremental/i);
assert.match(roadmap, /Wave 5.*absolute-release/i);

console.log("Performance acceptance contract verified (incremental and absolute-release modes).");
