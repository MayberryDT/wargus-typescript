import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(resolve(root, file), "utf8");
const performanceContract = read("plans/PERFORMANCE-ACCEPTANCE.md");
const wave2Recovery = read("plans/WAVE-2-RECOVERY-AMENDMENT.md");
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
assert.match(wave2Recovery, /baseline capture path.*must be.*independently reviewed/is);
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
