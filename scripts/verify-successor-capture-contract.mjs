import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const source = readFileSync("scripts/run-successor-performance-matrix.mjs", "utf8");
const helpers = loadHelpers(source, [
  "commandPairReady", "withTimeout", "awaitCommandPair", "commandOutcomeRecord",
  "commandTrialDiagnostics", "canonicalRowsForPlan", "parseAssignedRows",
  "targetedVerifierPaths", "acceptedBaselineIdentity", "validateCaptureAttribution",
  "successorAcceptance", "withManifestIntegrity", "finalizeChecksummedSummary"
]);

assert.equal(helpers.commandPairReady({
  inputToCommandDelta: 2,
  inputToNextRenderDelta: 1,
  rafTimestamp: 101,
  previousRaf: 100
}), false, "One next-render sample must not complete a real command pair.");
assert.equal(helpers.commandPairReady({
  inputToCommandDelta: 1,
  inputToNextRenderDelta: 2,
  rafTimestamp: 101,
  previousRaf: 100
}), false, "Two render samples without two command samples must not complete a pair.");
assert.equal(helpers.commandPairReady({
  inputToCommandDelta: 2,
  inputToNextRenderDelta: 2,
  rafTimestamp: 100,
  previousRaf: 100
}), false, "Paired samples require an advancing RAF timestamp.");
assert.equal(helpers.commandPairReady({
  inputToCommandDelta: 2,
  inputToNextRenderDelta: 2,
  rafTimestamp: 101,
  previousRaf: 100
}), true, "Two command and render samples with advancing RAF must complete a pair.");

const stalledStartedAt = Date.now();
const stalledRaf = await helpers.awaitCommandPair({
  before: { inputToCommandSamples: [], inputToNextRenderSamples: [] },
  previousRaf: 100,
  readRaf: () => new Promise(() => {}),
  readSummary: async () => ({ inputToCommandSamples: [], inputToNextRenderSamples: [] }),
  deadlineMs: 40,
  rafTimeoutMs: 10,
  intervalMs: 1
});
assert.equal(stalledRaf.ready, false, "A stalled browser RAF must deterministically produce an invalid pair result.");
assert.match(String(stalledRaf.error?.message), /RAF|timed out|deadline/i);
assert.ok(Date.now() - stalledStartedAt < 500, "The Node-side RAF bound must not inherit the browser watchdog duration.");

let fakeNow = 0;
let changingRaf = 100;
const missingSamples = await helpers.awaitCommandPair({
  before: { inputToCommandSamples: [], inputToNextRenderSamples: [] },
  previousRaf: 100,
  readRaf: async () => ({ timestamp: ++changingRaf }),
  readSummary: async () => ({ inputToCommandSamples: [1, 2], inputToNextRenderSamples: [1] }),
  nowMs: () => fakeNow,
  delay: async (milliseconds) => { fakeNow += milliseconds; },
  deadlineMs: 10,
  rafTimeoutMs: 5,
  intervalMs: 2
});
assert.equal(missingSamples.ready, false, "Ever-changing RAF progress must not extend the absolute command deadline.");
assert.equal(missingSamples.after.inputToNextRenderSamples.length, 1, "Deadline evidence must retain the last incomplete sample counts.");

const paired = await helpers.awaitCommandPair({
  before: { inputToCommandSamples: [], inputToNextRenderSamples: [] },
  previousRaf: 100,
  readRaf: async () => ({ timestamp: 101 }),
  readSummary: async () => ({ inputToCommandSamples: [1, 2], inputToNextRenderSamples: [1, 2] }),
  deadlineMs: 40,
  rafTimeoutMs: 10,
  intervalMs: 1
});
assert.equal(paired.ready, true, "Two paired samples and advancing RAF must finish inside the absolute deadline.");

const incompleteOutcome = helpers.commandOutcomeRecord({
  actualIssueOffsetMs: 250.5,
  before: { inputToCommandSamples: [1], inputToNextRenderSamples: [1] },
  after: { inputToCommandSamples: [1, 2, 3], inputToNextRenderSamples: [1, 2] },
  rafTimestamp: 101,
  previousRaf: 100
});
assert.equal(incompleteOutcome.actualIssueOffsetMs, 250.5, "A timed-out command must retain its actual issue timestamp.");
assert.equal(incompleteOutcome.inputToCommandDelta, 2, "A timed-out command must retain its command-sample delta.");
assert.equal(incompleteOutcome.inputToNextRenderDelta, 1, "A timed-out command must retain its render-sample delta.");
assert.equal(incompleteOutcome.success, false, "An incomplete pair must remain an unsuccessful retained outcome.");

const outcomes = [
  { success: true, scheduledIssueOffsetMs: 250, actualIssueOffsetMs: 251, inputToCommandDelta: 2, inputToNextRenderDelta: 2 },
  { success: false, scheduledIssueOffsetMs: 250, actualIssueOffsetMs: 252, inputToCommandDelta: 2, inputToNextRenderDelta: 1 }
];
const diagnostics = helpers.commandTrialDiagnostics(outcomes, {
  inputToCommandSamples: [1, 2, 3, 4],
  inputToNextRenderSamples: [1, 2, 3]
});
assert.deepEqual(
  Object.keys(diagnostics).sort(),
  ["outcomeCount", "successfulOutcomeCount", "inputToCommandSampleCount", "inputToNextRenderSampleCount", "scheduleInvalid", "outcomes"].sort(),
  "Invalid command diagnostics must retain every required count and outcome field."
);
assert.equal(diagnostics.outcomeCount, 2);
assert.equal(diagnostics.successfulOutcomeCount, 1);
assert.equal(diagnostics.inputToCommandSampleCount, 4);
assert.equal(diagnostics.inputToNextRenderSampleCount, 3);
assert.equal(diagnostics.scheduleInvalid, false);
assert.equal(JSON.stringify(diagnostics.outcomes), JSON.stringify(outcomes), "Per-outcome sample deltas must be retained unchanged.");

const expectedRows = {
  "019": [3, 5, 7], "020": [6], "021": [3, 4, 6], "022": [3, 4, 6],
  "023": [3, 4, 5, 6, 7], "024": [4, 5, 6], "025": [3, 4, 6]
};
for (const [planId, rows] of Object.entries(expectedRows)) {
  assert.equal(JSON.stringify(helpers.canonicalRowsForPlan(planId)), JSON.stringify(rows), `Plan ${planId} must use its exact canonical rows.`);
  assert.equal(JSON.stringify(helpers.parseAssignedRows(planId, rows.join(","))), JSON.stringify(rows));
}
assert.throws(() => helpers.parseAssignedRows("019", "3,5"), /exact canonical rows/i);
assert.throws(() => helpers.parseAssignedRows("020", "6,7"), /exact canonical rows/i);

assert.equal(JSON.stringify(helpers.targetedVerifierPaths("019")), JSON.stringify(["scripts/verify-terrain-metadata-cache.mjs"]));
assert.equal(JSON.stringify(helpers.targetedVerifierPaths("024")), JSON.stringify(["scripts/verify-pathfinding-budget.mjs", "scripts/verify-x12-first-tick.mjs"]), "Plan 024 must retain both new verifier results.");

const pinnedBaseline = helpers.acceptedBaselineIdentity("/retained/.artifacts", {});
assert.equal(pinnedBaseline.captureSha, "033629474959122749f6acb013ed6c2a0c0d2556");
assert.equal(pinnedBaseline.stamp, "20260729T051148Z");
assert.equal(pinnedBaseline.manifestSha256, "657dec5af935823fc27beaf16034b78813b4090244f22146effefc430040bed1");
assert.equal(pinnedBaseline.directory, "/retained/.artifacts/performance/018/033629474959122749f6acb013ed6c2a0c0d2556/20260729T051148Z");
assert.throws(() => helpers.acceptedBaselineIdentity("/retained/.artifacts", { WARGUS_BASELINE_CAPTURE_SHA: "wrong" }), /accepted Plan 018 capture/i);
assert.throws(() => helpers.acceptedBaselineIdentity("/retained/.artifacts", { WARGUS_BASELINE_MATRIX_DIR: "/wrong/stamp" }), /accepted Plan 018 directory/i);
assert.throws(() => helpers.acceptedBaselineIdentity("/retained/.artifacts", { WARGUS_BASELINE_MANIFEST_SHA256: "wrong" }), /accepted Plan 018 manifest/i);
assert.throws(() => helpers.acceptedBaselineIdentity("/retained/.artifacts", { WARGUS_BASELINE_CAPTURE_SHA: "" }), /accepted Plan 018 capture/i);
assert.throws(() => helpers.acceptedBaselineIdentity("/retained/.artifacts", { WARGUS_BASELINE_MATRIX_DIR: "" }), /accepted Plan 018 directory/i);
assert.throws(() => helpers.acceptedBaselineIdentity("/retained/.artifacts", { WARGUS_BASELINE_MANIFEST_SHA256: "" }), /accepted Plan 018 manifest/i);
assert.throws(() => helpers.acceptedBaselineIdentity("/retained/.artifacts", { WARGUS_BASELINE_MATRIX_DIR: pinnedBaseline.directory + "/../20260729T051148Z" }), /accepted Plan 018 directory/i);

assert.doesNotThrow(() => helpers.validateCaptureAttribution("abc", "abc", ""));
assert.throws(() => helpers.validateCaptureAttribution("abc", "def", ""), /capture SHA/i);
assert.throws(() => helpers.validateCaptureAttribution("abc", "abc", "?? scratch.txt"), /clean worktree/i);

const inheritedFailure = helpers.successorAcceptance({
  mode: "incremental",
  baselineFailureKeys: ["frameP95"],
  afterFailureKeys: ["frameP95"],
  baselineWorstFrameP95Ms: 100,
  afterWorstFrameP95Ms: 105,
  prerequisitePass: true,
  targetedWorkReductionProofPass: true
});
assert.equal(inheritedFailure.noNewBudgetFailuresPass, true, "An inherited baseline failure must pass the no-new-failures gate.");
assert.equal(inheritedFailure.frameP95RegressionPass, true, "Exactly 5% frame-p95 regression must pass.");
assert.equal(inheritedFailure.absoluteBudgetsPass, false, "An inherited absolute failure must remain truthfully failed.");
assert.equal(inheritedFailure.incrementalAccepted, true, "An inherited baseline failure may pass incremental acceptance.");
assert.equal(inheritedFailure.absoluteReleaseAccepted, false, "Absolute release must reject any remaining budget failure.");
assert.equal(inheritedFailure.accepted, true, "Selected incremental mode must use the incremental verdict.");

const afterOnlyFailure = helpers.successorAcceptance({
  mode: "incremental",
  baselineFailureKeys: ["frameP95"],
  afterFailureKeys: ["frameP95", "heap"],
  baselineWorstFrameP95Ms: 100,
  afterWorstFrameP95Ms: 100,
  prerequisitePass: true,
  targetedWorkReductionProofPass: true
});
assert.equal(afterOnlyFailure.noNewBudgetFailuresPass, false, "An after-only budget key must fail incremental acceptance.");
assert.equal(afterOnlyFailure.incrementalAccepted, false, "A new budget failure must reject the incremental verdict.");
assert.equal(afterOnlyFailure.accepted, false, "Selected incremental mode must reject a new budget failure.");

const regression = helpers.successorAcceptance({
  mode: "incremental",
  baselineFailureKeys: [],
  afterFailureKeys: [],
  baselineWorstFrameP95Ms: 100,
  afterWorstFrameP95Ms: 105.01,
  prerequisitePass: true,
  targetedWorkReductionProofPass: true
});
assert.equal(regression.frameP95RegressionPass, false, "A greater-than-5% frame-p95 regression must fail.");
assert.equal(regression.incrementalAccepted, false, "A greater-than-5% frame-p95 regression must reject incremental acceptance.");

const missingTargetedProof = helpers.successorAcceptance({
  mode: "incremental",
  baselineFailureKeys: [],
  afterFailureKeys: [],
  baselineWorstFrameP95Ms: 100,
  afterWorstFrameP95Ms: 100,
  prerequisitePass: true,
  targetedWorkReductionProofPass: false
});
assert.equal(missingTargetedProof.incrementalAccepted, false, "Incremental acceptance must require the targeted work-reduction proof.");
assert.equal(missingTargetedProof.accepted, false, "The selected verdict must fail when the targeted work-reduction proof is absent.");

const absoluteWithFailure = helpers.successorAcceptance({
  mode: "absolute-release",
  baselineFailureKeys: ["frameP95"],
  afterFailureKeys: ["frameP95"],
  baselineWorstFrameP95Ms: 100,
  afterWorstFrameP95Ms: 100,
  prerequisitePass: true,
  targetedWorkReductionProofPass: true
});
assert.equal(absoluteWithFailure.incrementalAccepted, true, "Inherited failures may still pass the incremental verdict.");
assert.equal(absoluteWithFailure.absoluteReleaseAccepted, false, "Absolute mode additionally requires an empty after-failure set.");
assert.equal(absoluteWithFailure.accepted, false, "Selected absolute-release mode must use the absolute verdict.");

const absoluteClean = helpers.successorAcceptance({
  mode: "absolute-release",
  baselineFailureKeys: ["frameP95"],
  afterFailureKeys: [],
  baselineWorstFrameP95Ms: 100,
  afterWorstFrameP95Ms: 100,
  prerequisitePass: true,
  targetedWorkReductionProofPass: true
});
assert.deepEqual(
  Object.keys(absoluteClean).sort(),
  ["absoluteBudgetsPass", "absoluteReleaseAccepted", "accepted", "frameP95RegressionPass", "incrementalAccepted", "mode", "noNewBudgetFailuresPass"].sort(),
  "Schema-v3 acceptance must expose both verdicts and their component gates."
);
assert.equal(absoluteClean.absoluteReleaseAccepted, true, "Absolute release must pass when incremental gates and all absolute budgets pass.");
assert.equal(absoluteClean.accepted, true, "Selected absolute-release mode must accept the clean verdict.");

const summaryBeforeManifest = { ready: true, acceptance: { incrementalAccepted: true, absoluteReleaseAccepted: true, accepted: true }, lifecycle: {} };
const summaryWrites = [];
const manifestFailures = [];
let manifestWriteCount = 0;
const failedFinalization = helpers.finalizeChecksummedSummary(summaryBeforeManifest, {
  writeSummary: (summary) => summaryWrites.push(summary),
  writeManifest: () => { manifestWriteCount += 1; if (manifestWriteCount === 1) throw new Error("injected checksum write failure"); },
  writeFailure: (failure) => manifestFailures.push(failure)
});
assert.equal(failedFinalization.summary.ready, false, "Checksum failure must downgrade authoritative readiness.");
assert.equal(failedFinalization.summary.acceptance.accepted, false, "Checksum failure must downgrade the selected verdict.");
assert.equal(failedFinalization.summary.lifecycle.checksumManifestPass, false);
assert.equal(summaryWrites.at(-1).ready, false, "The last retained summary must be the downgraded summary.");
assert.equal(manifestFailures.length, 1, "Checksum failure evidence must be retained where writable.");
assert.equal(manifestWriteCount, 2, "Finalization must retry a manifest over the downgraded summary.");

const retainedDowngrade = helpers.finalizeChecksummedSummary(summaryBeforeManifest, {
  writeSummary: (summary) => summaryWrites.push(summary),
  writeManifest: (() => { let count = 0; return () => { count += 1; if (count === 1) throw new Error("injected manifest failure"); }; })(),
  writeFailure: () => { throw new Error("injected failure-record write failure"); }
});
assert.equal(retainedDowngrade.summary.ready, false, "Failure-record errors must not prevent the summary downgrade.");
assert.equal(retainedDowngrade.retentionErrors[0].step, "checksum-failure-record");

let downgradeWriteCount = 0;
assert.throws(() => helpers.finalizeChecksummedSummary(summaryBeforeManifest, {
  writeSummary: () => { downgradeWriteCount += 1; if (downgradeWriteCount === 2) throw new Error("injected downgrade write failure"); },
  writeManifest: () => { throw new Error("injected manifest failure"); },
  writeFailure: () => {}
}), /authoritative summary downgrade/i, "A failed downgrade write must escape to the outer finalization path.");

assert.throws(() => helpers.successorAcceptance({
  mode: "wrong",
  baselineFailureKeys: [],
  afterFailureKeys: [],
  baselineWorstFrameP95Ms: 100,
  afterWorstFrameP95Ms: 100,
  prerequisitePass: true,
  targetedWorkReductionProofPass: true
}), /incremental|absolute-release/i, "Unknown acceptance modes must fail closed.");

console.log("Successor capture contract verified (paired real input and schema-v3 verdicts).");

function loadHelpers(moduleSource, names) {
  const declarations = names.map((name) => extractFunction(moduleSource, name)).join("\n");
  const assignments = names.map((name) => `this.${name} = ${name};`).join("\n");
  const context = { COMMAND_OFFSET_TOLERANCE_MS: 250, path, process, setTimeout, clearTimeout };
  vm.runInNewContext(`${declarations}\n${assignments}`, context, { filename: "successor-capture-helpers.mjs" });
  return context;
}

function extractFunction(moduleSource, name) {
  const marker = `function ${name}(`;
  const functionStart = moduleSource.indexOf(marker);
  const asyncMarker = `async ${marker}`;
  const asyncStart = moduleSource.indexOf(asyncMarker);
  const start = asyncStart >= 0 && asyncStart + 6 === functionStart ? asyncStart : functionStart;
  assert.notEqual(start, -1, `Missing production helper ${name}.`);
  const openingParen = moduleSource.indexOf("(", start);
  let parameterDepth = 0;
  let closingParen = -1;
  for (let index = openingParen; index < moduleSource.length; index += 1) {
    if (moduleSource[index] === "(") parameterDepth += 1;
    if (moduleSource[index] === ")") parameterDepth -= 1;
    if (parameterDepth === 0) { closingParen = index; break; }
  }
  assert.notEqual(closingParen, -1, `Unterminated parameter list for ${name}.`);
  const openingBrace = moduleSource.indexOf("{", closingParen);
  assert.notEqual(openingBrace, -1, `Missing function body for ${name}.`);
  let depth = 0;
  for (let index = openingBrace; index < moduleSource.length; index += 1) {
    if (moduleSource[index] === "{") depth += 1;
    if (moduleSource[index] === "}") depth -= 1;
    if (depth === 0) return moduleSource.slice(start, index + 1);
  }
  assert.fail(`Unterminated function body for ${name}.`);
}
