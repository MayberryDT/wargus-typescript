import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import { publishChecksummedSummary, summaryPublicationOperations } from "./lib/checksummed-summary-publisher.mjs";

const source = readFileSync("scripts/run-successor-performance-matrix.mjs", "utf8");
assert.match(source, /schemaVersion: 4/, "Seven-trial robust summaries must use schema version 4.");
assert.doesNotMatch(source, /afterWorstFrameP95Ms|baselineWorstFrameP95Ms|worstFrameP95Ms/,
  "Schema-v4 summaries and baseline loading must not retain worst-trial frame-p95 fields.");
assert.match(source, /summary\.schemaVersion !== 4/,
  "The baseline loader must reject pre-schema-v4 baseline packets.");
const measuredPairStarts = loadLiteral(source, "OFFSETS_MS");
assert.equal(JSON.stringify(measuredPairStarts), JSON.stringify([500, 1500, 2500, 3500, 4500, 5500, 6500, 7500, 8500, 9500]),
  "The runner must schedule ten uniform pair starts from 500 through 9500 ms.");
const helpers = loadHelpers(source, [
  "commandPairReady", "withTimeout", "awaitCommandPair", "realPair", "commandOutcomeRecord",
  "commandTrialDiagnostics", "canonicalRowsForPlan", "parseAssignedRows",
  "targetedVerifierPaths", "acceptedBaselineIdentity", "validateCaptureAttribution",
  "robustFrameP95Acceptance", "successorAcceptance", "errorRecord"
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

const acceptedLongRafTail = await helpers.awaitCommandPair({
  before: { inputToCommandSamples: [], inputToNextRenderSamples: [] },
  previousRaf: 100,
  readRaf: () => new Promise((resolve) => setTimeout(() => resolve({ timestamp: 101 }), 150)),
  readSummary: async () => ({ inputToCommandSamples: [1, 2], inputToNextRenderSamples: [1, 2] }),
  intervalMs: 1
});
assert.equal(acceptedLongRafTail.ready, true, "A valid 150 ms RAF tail inside the 1000 ms absolute deadline must complete.");
assert.equal(acceptedLongRafTail.after.inputToCommandSamples.length, 2);
assert.equal(acceptedLongRafTail.after.inputToNextRenderSamples.length, 2);

let stalledRafWatchdog = null;
const stalledRaf = await Promise.race([
  helpers.awaitCommandPair({
    before: { inputToCommandSamples: [], inputToNextRenderSamples: [] },
    previousRaf: 100,
    readRaf: () => new Promise(() => {}),
    readSummary: async () => ({ inputToCommandSamples: [], inputToNextRenderSamples: [] }),
    intervalMs: 1
  }),
  new Promise((_, reject) => {
    stalledRafWatchdog = setTimeout(() => reject(new Error("Stalled RAF exceeded the independent 2000 ms test watchdog.")), 2000);
  })
]).finally(() => { if (stalledRafWatchdog !== null) clearTimeout(stalledRafWatchdog); });
assert.equal(stalledRaf.ready, false, "A stalled browser RAF must deterministically produce an invalid pair result.");
const stalledRafTimeoutMatch = String(stalledRaf.error?.message).match(/^RAF timed out after ([0-9.]+) ms\.$/);
assert.notEqual(stalledRafTimeoutMatch, null, "A stalled browser RAF must retain explicit RAF-timeout classification.");
const stalledRafTimeoutMs = Number(stalledRafTimeoutMatch[1]);
assert.ok(stalledRafTimeoutMs > 0 && stalledRafTimeoutMs <= 1000, "A stalled browser RAF must remain bounded by the production 1000 ms command-pair deadline.");

let fakeNow = 0;
let changingRaf = 100;
const missingSamples = await helpers.awaitCommandPair({
  before: { inputToCommandSamples: [], inputToNextRenderSamples: [] },
  previousRaf: 100,
  readRaf: async () => ({ timestamp: ++changingRaf }),
  readSummary: async () => ({ inputToCommandSamples: [1, 2], inputToNextRenderSamples: [1] }),
  nowMs: () => fakeNow,
  delay: async (milliseconds) => { fakeNow += milliseconds; },
  deadlineMs: 1000,
  intervalMs: 250
});
assert.equal(missingSamples.ready, false, "Ever-changing RAF progress must not extend the absolute command deadline.");
assert.equal(missingSamples.after.inputToNextRenderSamples.length, 1, "Deadline evidence must retain the last incomplete sample counts.");

const paired = await helpers.awaitCommandPair({
  before: { inputToCommandSamples: [], inputToNextRenderSamples: [] },
  previousRaf: 100,
  readRaf: async () => ({ timestamp: 101 }),
  readSummary: async () => ({ inputToCommandSamples: [1, 2], inputToNextRenderSamples: [1, 2] }),
  deadlineMs: 40,
  intervalMs: 1
});
assert.equal(paired.ready, true, "Two paired samples and advancing RAF must finish inside the absolute deadline.");

const stalledSummary = await helpers.awaitCommandPair({
  before: { inputToCommandSamples: [], inputToNextRenderSamples: [] },
  previousRaf: 100,
  readRaf: async () => ({ timestamp: 101 }),
  readSummary: () => new Promise(() => {}),
  deadlineMs: 40,
  intervalMs: 1
});
assert.equal(stalledSummary.ready, false, "A stalled performance summary must deterministically produce an invalid pair result.");

const retainedRafFailure = retainedQualificationFailure(stalledRaf, { inputToCommandSamples: [], inputToNextRenderSamples: [] }, 100);
assert.equal(retainedRafFailure.pairingFailureKind, "raf-timeout", "RAF timeout evidence must be explicitly distinguished.");
assert.match(retainedRafFailure.cause.message, /^RAF timed out after [0-9.]+ ms\.$/);
assert.equal(JSON.stringify(retainedRafFailure.commandOutcome), JSON.stringify({
  actualIssueOffsetMs: 250, success: false, inputToCommandDelta: 0, inputToNextRenderDelta: 0,
  rawInputToCommandSliceMs: [], rawInputToNextRenderSliceMs: [], rafTimestamp: 100
}), "RAF timeout terminal outcome must retain every delta and raw slice across the VM boundary.");

const retainedSummaryFailure = retainedQualificationFailure(stalledSummary, { inputToCommandSamples: [], inputToNextRenderSamples: [] }, 100);
assert.equal(retainedSummaryFailure.pairingFailureKind, "summary-timeout", "Performance-summary timeout evidence must be explicitly distinguished.");
assert.match(retainedSummaryFailure.cause.message, /^performance summary timed out after [0-9.]+ ms\.$/);
assert.equal(retainedSummaryFailure.commandOutcome.success, false);
assert.equal(retainedSummaryFailure.commandOutcome.inputToCommandDelta, 0);
assert.equal(retainedSummaryFailure.commandOutcome.inputToNextRenderDelta, 0);

const retainedDeadlineFailure = retainedQualificationFailure(missingSamples, { inputToCommandSamples: [], inputToNextRenderSamples: [] }, 100);
assert.equal(retainedDeadlineFailure.pairingFailureKind, "absolute-deadline", "The 1000 ms absolute command deadline must be distinguished from per-operation timeouts.");
assert.equal(retainedDeadlineFailure.cause.message, "Real command pairing exceeded its absolute 1000 ms deadline.");
assert.equal(retainedDeadlineFailure.commandOutcome.success, false);
assert.equal(retainedDeadlineFailure.commandOutcome.inputToCommandDelta, 2);
assert.equal(retainedDeadlineFailure.commandOutcome.inputToNextRenderDelta, 1);

function retainedQualificationFailure(pair, before, previousRaf) {
  const error = new Error("Missing required real-input outcome or next-render sample pairing.", { cause: pair.error });
  error.name = "InvalidTrialError";
  error.commandOutcome = helpers.commandOutcomeRecord({ actualIssueOffsetMs: 250, before, after: pair.after, rafTimestamp: pair.rafTimestamp, previousRaf });
  return helpers.errorRecord(error);
}

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

const lateFirstPair = await exerciseRealPair({
  pairIndex: 0, pairOffsetMs: 500, moveIssueOffsetMs: 500.739034, movePairingCompletedAtMs: 767.378952
});
assert.equal(lateFirstPair.outcomes[0].scheduledIssueOffsetMs, 500);
assert.equal(lateFirstPair.outcomes[1].scheduledIssueOffsetMs, 750, "Attack-move must have its own pair-offset-plus-250 target.");
assert.equal(lateFirstPair.outcomes[1].actualIssueOffsetMs, 767.378952);
assert.equal(helpers.commandTrialDiagnostics(lateFirstPair.outcomes, {
  inputToCommandSamples: Array(40), inputToNextRenderSamples: Array(40)
}).scheduleInvalid, false, "The immutable attempt-1 500.739034/767.378952 ms evidence must be valid against 500/750 ms targets.");

const replacementFirstPair = await exerciseRealPair({
  pairIndex: 0, pairOffsetMs: 500, moveIssueOffsetMs: 515.549633, movePairingCompletedAtMs: 839.276768
});
assert.equal(helpers.commandTrialDiagnostics(replacementFirstPair.outcomes, {
  inputToCommandSamples: Array(40), inputToNextRenderSamples: Array(40)
}).scheduleInvalid, false, "The immutable replacement 515.549633/839.276768 ms evidence must be valid against 500/750 ms targets.");

const earlyCompletedPair = await exerciseRealPair({
  pairIndex: 1, pairOffsetMs: 1500, moveIssueOffsetMs: 1616.06, movePairingCompletedAtMs: 1702.10
});
assert.equal(earlyCompletedPair.outcomes[0].actualIssueOffsetMs, 1616.06);
assert.equal(earlyCompletedPair.outcomes[1].scheduledIssueOffsetMs, 1750);
assert.equal(earlyCompletedPair.outcomes[1].actualIssueOffsetMs, 1750, "Attack-move must wait until its own target when move pairing completes early.");

const allIssueTargets = [];
for (const pairOffsetMs of [500, 1500, 2500, 3500, 4500, 5500, 6500, 7500, 8500, 9500]) {
  const pair = await exerciseRealPair({
    pairIndex: allIssueTargets.length / 2, pairOffsetMs,
    moveIssueOffsetMs: pairOffsetMs, movePairingCompletedAtMs: pairOffsetMs + 250
  });
  allIssueTargets.push(...pair.outcomes.map((outcome) => outcome.scheduledIssueOffsetMs));
}
assert.equal(JSON.stringify(allIssueTargets), JSON.stringify([
  500, 750, 1500, 1750, 2500, 2750, 3500, 3750, 4500, 4750,
  5500, 5750, 6500, 6750, 7500, 7750, 8500, 8750, 9500, 9750
]), "The measured command profile must derive exactly 20 issue targets within its first 10 seconds.");

for (const [actualIssueOffsetMs, expectedInvalid] of [[9749.99, true], [9750, false], [10000, false], [10000.01, true]]) {
  const boundary = helpers.commandTrialDiagnostics([
    { success: true, scheduledIssueOffsetMs: 9750, actualIssueOffsetMs }
  ], { inputToCommandSamples: [], inputToNextRenderSamples: [] });
  assert.equal(boundary.scheduleInvalid, expectedInvalid, `One-sided target lateness classification failed for ${actualIssueOffsetMs} ms.`);
}
assert.equal(helpers.commandTrialDiagnostics([
  { success: true, scheduledIssueOffsetMs: 500, actualIssueOffsetMs: 700 },
  { success: true, scheduledIssueOffsetMs: 500, actualIssueOffsetMs: 650 }
], { inputToCommandSamples: [], inputToNextRenderSamples: [] }).scheduleInvalid, true, "Issue timestamps must remain ordered.");

const disposablePair = await exerciseRealPair({
  pairIndex: -1, pairOffsetMs: 0, moveIssueOffsetMs: 10, movePairingCompletedAtMs: 20, measurementT0: null
});
assert.equal(disposablePair.outcomes[1].actualIssueOffsetMs, 20, "Disposable qualification must issue immediately without measured scheduling waits.");

async function exerciseRealPair({ pairIndex, pairOffsetMs, moveIssueOffsetMs, movePairingCompletedAtMs, measurementT0 = 0 }) {
  let currentOffsetMs = moveIssueOffsetMs;
  let rafTimestamp = 100;
  helpers.measurementOffsetMs = () => currentOffsetMs;
  helpers.sleep = async (milliseconds) => { currentOffsetMs += milliseconds; };
  helpers.realCommand = async (_page, kind) => {
    const actualIssueOffsetMs = currentOffsetMs;
    if (kind === "move") currentOffsetMs = movePairingCompletedAtMs;
    rafTimestamp += 1;
    return {
      actualIssueOffsetMs, success: true, inputToCommandDelta: 2, inputToNextRenderDelta: 2,
      rawInputToCommandSliceMs: [1, 2], rawInputToNextRenderSliceMs: [1, 2], rafTimestamp
    };
  };
  return helpers.realPair({
    locator: () => ({ boundingBox: async () => ({ x: 0, y: 0, width: 100, height: 100 }) })
  }, pairIndex, pairOffsetMs, 100, measurementT0);
}

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

const stableSamples = () => Array(20).fill(50);
const noisySamples = [...Array(18).fill(50), 66.6, 66.6];
const oneNoisyTrial = helpers.robustFrameP95Acceptance({
  baselineTrials: Array.from({ length: 7 }, () => ({ frameP95Ms: 50, frameSamples: stableSamples() })),
  afterTrials: Array.from({ length: 7 }, (_, index) => ({
    frameP95Ms: index === 3 ? 66.6 : 50,
    frameSamples: index === 3 ? noisySamples : stableSamples()
  }))
});
assert.equal(oneNoisyTrial.medianTrialFrameP95RegressionPass, true,
  "One noisy trial among exactly seven must not move the median trial-p95 gate.");
assert.equal(oneNoisyTrial.pooledFrameP95RegressionPass, true,
  "One quantile-boundary trial among exactly seven must not move the pooled raw-frame p95 gate.");
assert.equal(oneNoisyTrial.frameP95RegressionPass, true,
  "One noisy trial must not fail an otherwise stable seven-trial row.");

const medianOnlyRegression = helpers.robustFrameP95Acceptance({
  baselineTrials: Array.from({ length: 7 }, (_, index) => ({
    frameP95Ms: 50,
    frameSamples: index < 4 ? [50, 50] : Array(100).fill(50)
  })),
  afterTrials: Array.from({ length: 7 }, (_, index) => ({
    frameP95Ms: index < 4 ? 55 : 50,
    frameSamples: index < 4 ? [50, 55] : Array(100).fill(50)
  }))
});
assert.equal(medianOnlyRegression.medianTrialFrameP95RegressionPass, false,
  "Median trial-p95 regression over 5% must fail even when pooled p95 is stable.");
assert.equal(medianOnlyRegression.pooledFrameP95RegressionPass, true);
assert.equal(medianOnlyRegression.frameP95RegressionPass, false);

const pooledOnlyRegression = helpers.robustFrameP95Acceptance({
  baselineTrials: Array.from({ length: 7 }, (_, index) => ({
    frameP95Ms: 50,
    frameSamples: index < 3 ? Array(100).fill(50) : [50]
  })),
  afterTrials: Array.from({ length: 7 }, (_, index) => ({
    frameP95Ms: index < 3 ? 55 : 50,
    frameSamples: index < 3 ? [...Array(94).fill(50), ...Array(6).fill(55)] : [50]
  }))
});
assert.equal(pooledOnlyRegression.medianTrialFrameP95RegressionPass, true);
assert.equal(pooledOnlyRegression.pooledFrameP95RegressionPass, false,
  "Pooled raw-frame p95 regression over 5% must fail even when median trial-p95 is stable.");
assert.equal(pooledOnlyRegression.frameP95RegressionPass, false);

const exactBoundary = helpers.robustFrameP95Acceptance({
  baselineTrials: Array.from({ length: 7 }, () => ({ frameP95Ms: 100, frameSamples: [100] })),
  afterTrials: Array.from({ length: 7 }, () => ({ frameP95Ms: 105, frameSamples: [105] }))
});
assert.equal(exactBoundary.medianTrialFrameP95RegressionPass, true, "Exactly 5% median regression must pass.");
assert.equal(exactBoundary.pooledFrameP95RegressionPass, true, "Exactly 5% pooled regression must pass.");
assert.equal(exactBoundary.frameP95RegressionPass, true);

for (const boundaryNoise of [-2e-12, 2e-12]) {
  const noisyBoundaryValue = 105 + boundaryNoise;
  const noisyBoundary = helpers.robustFrameP95Acceptance({
    baselineTrials: Array.from({ length: 7 }, () => ({ frameP95Ms: 100, frameSamples: [100] })),
    afterTrials: Array.from({ length: 7 }, () => ({ frameP95Ms: noisyBoundaryValue, frameSamples: [noisyBoundaryValue] }))
  });
  assert.equal(noisyBoundary.medianTrialFrameP95RegressionPass, true,
    `Stored-value noise ${boundaryNoise} ms below the 0.1 ms decision precision must not fail median acceptance.`);
  assert.equal(noisyBoundary.pooledFrameP95RegressionPass, true,
    `Stored-value noise ${boundaryNoise} ms below the 0.1 ms decision precision must not fail pooled acceptance.`);
}

const smallestMeaningfulRegression = helpers.robustFrameP95Acceptance({
  baselineTrials: Array.from({ length: 7 }, () => ({ frameP95Ms: 100, frameSamples: [100] })),
  afterTrials: Array.from({ length: 7 }, () => ({ frameP95Ms: 105.1, frameSamples: [105.1] }))
});
assert.equal(smallestMeaningfulRegression.medianTrialFrameP95RegressionPass, false,
  "The smallest meaningful 0.1 ms step above the +5% median boundary must fail.");
assert.equal(smallestMeaningfulRegression.pooledFrameP95RegressionPass, false,
  "The smallest meaningful 0.1 ms step above the +5% pooled boundary must fail.");

for (const trialCount of [6, 8]) {
  assert.throws(() => helpers.robustFrameP95Acceptance({
    baselineTrials: Array.from({ length: trialCount }, () => ({ frameP95Ms: 50, frameSamples: [50] })),
    afterTrials: Array.from({ length: 7 }, () => ({ frameP95Ms: 50, frameSamples: [50] }))
  }), /exactly seven/i, `${trialCount} baseline trials must fail closed.`);
  assert.throws(() => helpers.robustFrameP95Acceptance({
    baselineTrials: Array.from({ length: 7 }, () => ({ frameP95Ms: 50, frameSamples: [50] })),
    afterTrials: Array.from({ length: trialCount }, () => ({ frameP95Ms: 50, frameSamples: [50] }))
  }), /exactly seven/i, `${trialCount} successor trials must fail closed.`);
}
assert.throws(() => helpers.robustFrameP95Acceptance({
  baselineTrials: Array(7),
  afterTrials: Array.from({ length: 7 }, () => ({ frameP95Ms: 50, frameSamples: [50] }))
}), /dense.*seven/i, "A sparse seven-slot baseline array must fail closed.");
assert.throws(() => helpers.robustFrameP95Acceptance({
  baselineTrials: Array.from({ length: 7 }, () => ({ frameP95Ms: 50, frameSamples: [50] })),
  afterTrials: Array(7)
}), /dense.*seven/i, "A sparse seven-slot successor array must fail closed.");
assert.throws(() => helpers.robustFrameP95Acceptance({
  baselineTrials: Array.from({ length: 7 }, () => ({ frameP95Ms: 50, frameSamples: [50] })),
  afterTrials: Array.from({ length: 7 }, (_, index) => ({ frameP95Ms: index === 0 ? Number.NaN : 50, frameSamples: [50] }))
}), /finite/i, "Non-finite trial p95 values must fail closed.");
assert.throws(() => helpers.robustFrameP95Acceptance({
  baselineTrials: Array.from({ length: 7 }, () => ({ frameP95Ms: 50, frameSamples: [50] })),
  afterTrials: Array.from({ length: 7 }, (_, index) => ({ frameP95Ms: 50, frameSamples: index === 0 ? [] : [50] }))
}), /raw frame sample/i, "Missing raw frame samples must fail closed.");
assert.throws(() => helpers.robustFrameP95Acceptance({
  baselineTrials: Array.from({ length: 7 }, () => ({ frameP95Ms: Number.MAX_VALUE / 2, frameSamples: [Number.MAX_VALUE / 2] })),
  afterTrials: Array.from({ length: 7 }, () => ({ frameP95Ms: Number.MAX_VALUE, frameSamples: [Number.MAX_VALUE] }))
}), /finite.*decision arithmetic/i,
"Finite raw values that overflow rounded or scaled decision arithmetic must fail closed.");

const inheritedFailure = helpers.successorAcceptance({
  mode: "incremental",
  baselineFailureKeys: ["frameP95"],
  afterFailureKeys: ["frameP95"],
  medianTrialFrameP95RegressionPass: true,
  pooledFrameP95RegressionPass: true,
  prerequisitePass: true,
  targetedWorkReductionProofPass: true
});
assert.equal(inheritedFailure.noNewBudgetFailuresPass, true, "An inherited baseline failure must pass the no-new-failures gate.");
assert.equal(inheritedFailure.frameP95RegressionPass, true, "Both robust frame-p95 component gates must pass.");
assert.equal(inheritedFailure.absoluteBudgetsPass, false, "An inherited absolute failure must remain truthfully failed.");
assert.equal(inheritedFailure.incrementalAccepted, true, "An inherited baseline failure may pass incremental acceptance.");
assert.equal(inheritedFailure.absoluteReleaseAccepted, false, "Absolute release must reject any remaining budget failure.");
assert.equal(inheritedFailure.accepted, true, "Selected incremental mode must use the incremental verdict.");

const afterOnlyFailure = helpers.successorAcceptance({
  mode: "incremental",
  baselineFailureKeys: ["frameP95"],
  afterFailureKeys: ["frameP95", "heap"],
  medianTrialFrameP95RegressionPass: true,
  pooledFrameP95RegressionPass: true,
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
  medianTrialFrameP95RegressionPass: false,
  pooledFrameP95RegressionPass: true,
  prerequisitePass: true,
  targetedWorkReductionProofPass: true
});
assert.equal(regression.frameP95RegressionPass, false, "A failed median trial-p95 gate must fail robust acceptance.");
assert.equal(regression.incrementalAccepted, false, "A failed robust p95 component must reject incremental acceptance.");

const pooledRegression = helpers.successorAcceptance({
  mode: "incremental",
  baselineFailureKeys: [],
  afterFailureKeys: [],
  medianTrialFrameP95RegressionPass: true,
  pooledFrameP95RegressionPass: false,
  prerequisitePass: true,
  targetedWorkReductionProofPass: true,
  frameP95RegressionPass: true
});
assert.equal(pooledRegression.frameP95RegressionPass, false,
  "A caller-supplied combined pass must not bypass a failed pooled component gate.");
assert.equal(pooledRegression.incrementalAccepted, false);

for (const failedPrerequisite of ["comparability", "lifecycle", "checksum"]) {
  const invalid = helpers.successorAcceptance({
    mode: "incremental",
    baselineFailureKeys: [],
    afterFailureKeys: [],
    medianTrialFrameP95RegressionPass: true,
    pooledFrameP95RegressionPass: true,
    prerequisitePass: false,
    targetedWorkReductionProofPass: true
  });
  assert.equal(invalid.accepted, false, `Invalid ${failedPrerequisite} evidence must fail closed.`);
}

const missingTargetedProof = helpers.successorAcceptance({
  mode: "incremental",
  baselineFailureKeys: [],
  afterFailureKeys: [],
  medianTrialFrameP95RegressionPass: true,
  pooledFrameP95RegressionPass: true,
  prerequisitePass: true,
  targetedWorkReductionProofPass: false
});
assert.equal(missingTargetedProof.incrementalAccepted, false, "Incremental acceptance must require the targeted work-reduction proof.");
assert.equal(missingTargetedProof.accepted, false, "The selected verdict must fail when the targeted work-reduction proof is absent.");

const absoluteWithFailure = helpers.successorAcceptance({
  mode: "absolute-release",
  baselineFailureKeys: ["frameP95"],
  afterFailureKeys: ["frameP95"],
  medianTrialFrameP95RegressionPass: true,
  pooledFrameP95RegressionPass: true,
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
  medianTrialFrameP95RegressionPass: true,
  pooledFrameP95RegressionPass: true,
  prerequisitePass: true,
  targetedWorkReductionProofPass: true
});
assert.deepEqual(
  Object.keys(absoluteClean).sort(),
  ["absoluteBudgetsPass", "absoluteReleaseAccepted", "accepted", "frameP95RegressionPass", "incrementalAccepted", "medianTrialFrameP95RegressionPass", "mode", "noNewBudgetFailuresPass", "pooledFrameP95RegressionPass"].sort(),
  "Schema-v4 acceptance must expose both verdicts and their component gates."
);
assert.equal(absoluteClean.absoluteReleaseAccepted, true, "Absolute release must pass when incremental gates and all absolute budgets pass.");
assert.equal(absoluteClean.accepted, true, "Selected absolute-release mode must accept the clean verdict.");

const summaryBeforeManifest = { ready: true, acceptance: { incrementalAccepted: true, absoluteReleaseAccepted: true, accepted: true }, lifecycle: { finalizationPass: true } };
const publicationDirectories = [];

function publicationFixture(label) {
  const directory = mkdtempSync(path.join(tmpdir(), `wargus-summary-${label}-`));
  publicationDirectories.push(directory);
  writeFileSync(path.join(directory, "artifact.json"), "{\"retained\":true}\n", "utf8");
  return directory;
}

function retainedSummary(directory) {
  const file = path.join(directory, "matrix-summary.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

function assertNoReadySummary(directory, label) {
  const stored = retainedSummary(directory);
  assert.notEqual(stored?.ready, true, `${label} must not retain ready=true.`);
  assert.notEqual(stored?.acceptance?.accepted, true, `${label} must not retain accepted=true.`);
  assert.notEqual(stored?.lifecycle?.checksumManifestPass, true, `${label} must not retain checksumManifestPass=true.`);
}

function runPublicationFailure(label, mutateOperations, { staleTemp = false, failFailureWriter = false } = {}) {
  const directory = publicationFixture(label);
  if (staleTemp) writeFileSync(path.join(directory, ".wargus-summary-publish-stale.tmp"), "stale", "utf8");
  const operations = mutateOperations({ ...summaryPublicationOperations });
  const result = publishChecksummedSummary(directory, summaryBeforeManifest, {
    operations,
    writeFailure: (failures) => {
      if (failFailureWriter) throw new Error("injected failure-record writer failure");
      writeFileSync(path.join(directory, "finalization-errors.json"), `${JSON.stringify(failures, null, 2)}\n`, "utf8");
    }
  });
  assert.equal(result.published, false, `${label} must report failed publication.`);
  assertNoReadySummary(directory, label);
  return { directory, result };
}

const successfulDirectory = publicationFixture("success");
const successfulPublication = publishChecksummedSummary(successfulDirectory, summaryBeforeManifest);
assert.equal(successfulPublication.published, true);
assert.equal(retainedSummary(successfulDirectory).ready, true);
assert.deepEqual(readdirSync(successfulDirectory).sort(), ["artifact.json", "matrix-summary.json", "sha256.json"]);
const successfulManifest = JSON.parse(readFileSync(path.join(successfulDirectory, "sha256.json"), "utf8"));
assert.deepEqual(successfulManifest.map((record) => record.name), ["artifact.json", "matrix-summary.json"]);
for (const record of successfulManifest) {
  const actual = createHash("sha256").update(readFileSync(path.join(successfulDirectory, record.name))).digest("hex");
  assert.equal(record.sha256, actual, `Successful manifest hash must match ${record.name}.`);
}

runPublicationFailure("manifest-construction", (operations) => ({ ...operations, constructManifest: () => { throw new Error("injected manifest construction failure"); } }));
runPublicationFailure("manifest-write", (operations) => ({ ...operations, writeTemp: (request) => { if (request.phase === "manifest") throw new Error("injected manifest temp write failure"); return summaryPublicationOperations.writeTemp(request); } }));
runPublicationFailure("manifest-verification", (operations) => ({ ...operations, verifyManifest: () => { throw new Error("injected projected manifest verification failure"); } }));
const manifestRenameFailure = runPublicationFailure("manifest-rename", (operations) => ({ ...operations, renameTemp: (request) => { if (request.phase === "manifest") { summaryPublicationOperations.renameTemp(request); throw new Error("injected post-manifest-rename failure"); } return summaryPublicationOperations.renameTemp(request); } }));
assert.equal(existsSync(path.join(manifestRenameFailure.directory, "sha256.json")), true, "A post-rename failure may leave the manifest published, but the retained summary must remain non-ready.");
const readyRenameFailure = runPublicationFailure("ready-summary-rename", (operations) => ({ ...operations, renameTemp: (request) => { if (request.phase === "ready-summary") throw new Error("injected ready-summary rename failure"); return summaryPublicationOperations.renameTemp(request); } }));
assert.equal(existsSync(path.join(readyRenameFailure.directory, "sha256.json")), true, "Ready rename failure occurs after manifest publication.");
const invalidReadyManifest = JSON.parse(readFileSync(path.join(readyRenameFailure.directory, "sha256.json"), "utf8"));
const projectedSummaryHash = invalidReadyManifest.find((record) => record.name === "matrix-summary.json").sha256;
const retainedSummaryHash = createHash("sha256").update(readFileSync(path.join(readyRenameFailure.directory, "matrix-summary.json"))).digest("hex");
assert.notEqual(projectedSummaryHash, retainedSummaryHash, "A manifest published before a failed ready rename must be invalid against the retained non-ready summary.");
const failureWriterFailure = runPublicationFailure("failure-record-writer", (operations) => ({ ...operations, constructManifest: () => { throw new Error("injected manifest construction failure"); } }), { failFailureWriter: true });
assert.ok(failureWriterFailure.result.failures.some((failure) => failure.step === "checksummed-summary-failure-record"));
const cleanupFailure = runPublicationFailure("cleanup", (operations) => ({ ...operations, cleanupTemp: () => { throw new Error("injected owned-temp cleanup failure"); } }), { staleTemp: true });
assert.ok(cleanupFailure.result.failures.some((failure) => failure.step === "checksummed-summary-temp-cleanup"));
const fatalCombinedFailure = runPublicationFailure("fatal-combined", (operations) => ({ ...operations, cleanupTemp: () => { throw new Error("injected cleanup failure"); }, renameTemp: (request) => { if (request.phase === "ready-summary") throw new Error("injected ready-summary rename failure"); return summaryPublicationOperations.renameTemp(request); } }), { failFailureWriter: true });
assert.equal(existsSync(path.join(fatalCombinedFailure.directory, "sha256.json")), true, "The fatal combined probe must reach manifest publication.");
assertNoReadySummary(fatalCombinedFailure.directory, "fatal combined reviewer probe");
assert.ok(fatalCombinedFailure.result.failures.some((failure) => failure.step === "checksummed-summary-temp-cleanup"));
assert.ok(fatalCombinedFailure.result.failures.some((failure) => failure.step === "checksummed-summary-failure-record"));

for (const directory of publicationDirectories) rmSync(directory, { recursive: true, force: true });

assert.throws(() => helpers.successorAcceptance({
  mode: "wrong",
  baselineFailureKeys: [],
  afterFailureKeys: [],
  medianTrialFrameP95RegressionPass: true,
  pooledFrameP95RegressionPass: true,
  prerequisitePass: true,
  targetedWorkReductionProofPass: true
}), /incremental|absolute-release/i, "Unknown acceptance modes must fail closed.");

console.log("Successor capture contract verified (paired real input and schema-v4 robust verdicts).");

function loadHelpers(moduleSource, names) {
  const declarations = names.map((name) => extractFunction(moduleSource, name)).join("\n");
  const assignments = names.map((name) => `this.${name} = ${name};`).join("\n");
  const context = {
    COMMAND_OFFSET_TOLERANCE_MS: 250,
    ATTACK_COMMAND_OFFSET_MS: 250,
    COMMAND_PAIR_DEADLINE_MS: 1000,
    RAF_AWAIT_TIMEOUT_MS: 100,
    realCommand: null,
    measurementOffsetMs: null,
    sleep: null,
    InvalidTrialError: class InvalidTrialError extends Error {},
    path,
    process,
    setTimeout,
    clearTimeout
  };
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

function loadLiteral(moduleSource, name) {
  const match = moduleSource.match(new RegExp(`const ${name} = (\\[[^;]+\\]);`));
  assert.notEqual(match, null, `Could not locate literal ${name}.`);
  return vm.runInNewContext(match[1]);
}
