import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import { publishChecksummedSummary, summaryPublicationOperations } from "./lib/checksummed-summary-publisher.mjs";

const source = readFileSync("scripts/run-successor-performance-matrix.mjs", "utf8");
const helpers = loadHelpers(source, [
  "commandPairReady", "withTimeout", "awaitCommandPair", "commandOutcomeRecord",
  "commandTrialDiagnostics", "canonicalRowsForPlan", "parseAssignedRows",
  "targetedVerifierPaths", "acceptedBaselineIdentity", "validateCaptureAttribution",
  "successorAcceptance"
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
