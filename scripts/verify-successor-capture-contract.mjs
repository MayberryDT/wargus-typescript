import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync("scripts/run-successor-performance-matrix.mjs", "utf8");
const helpers = loadHelpers(source, ["commandPairReady", "commandOutcomeRecord", "commandTrialDiagnostics", "successorAcceptance"]);

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
  const context = { COMMAND_OFFSET_TOLERANCE_MS: 250 };
  vm.runInNewContext(`${declarations}\n${assignments}`, context, { filename: "successor-capture-helpers.mjs" });
  return context;
}

function extractFunction(moduleSource, name) {
  const marker = `function ${name}(`;
  const start = moduleSource.indexOf(marker);
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
