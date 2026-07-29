import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(resolve(root, file), "utf8");
const performanceContract = read("plans/PERFORMANCE-ACCEPTANCE.md");
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
assert.match(performanceContract, /frame p95 regression.*5%/i);
assert.match(performanceContract, /targeted work-reduction proof/i);
assert.match(performanceContract, /Wave 5.*every absolute shared budget/i);
assert.match(performanceContract, /afterWorstTrialBudgetFailureKeys ⊆ acceptedPlan018WorstTrialBudgetFailureKeys/);
assert.match(performanceContract, /incrementalReady =\n  captureComplete\n  && validityAndComparabilityPass\n  && fixedTickPass\n  && noNewBudgetFailuresPass\n  && frameP95RegressionPass\n  && targetedWorkReductionProofPass\n  && cleanupAndIntegrityPass/);
assert.match(performanceContract, /absoluteReleaseReady =\n  incrementalReady\n  && everyAbsoluteSharedBudgetPass/);

for (const [file, plan] of detailedPlans) {
  assert.match(plan, /incrementalReady =\n  captureComplete\n  && validityAndComparabilityPass\n  && fixedTickPass\n  && noNewBudgetFailuresPass\n  && frameP95RegressionPass\n  && targetedWorkReductionProofPass\n  && cleanupAndIntegrityPass/, `${file} must use the incremental algorithm verbatim.`);
  assert.doesNotMatch(plan, /(?:every\s+(?:assigned|applicable|unchanged|shared)\s+budget(?:s)?\s+must\s+pass|shared budgets pass|assigned shared budget passes)/i, `${file} retains stale absolute-budget closure language.`);
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
