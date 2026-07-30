import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildAlternatingPairs,
  classifyPairedDiagnostic,
  pooledP95,
  relativeDeltaPercent,
  writeAndVerifyChecksumManifest
} from "./lib/paired-performance-analysis.mjs";

const baseTrials = Array.from({ length: 15 }, (_, index) => ({
  pair: index + 1,
  statistics: { frame: { p95Ms: 50 } },
  stopped: { frameSamples: [16.7, 33.3, 50, 50] }
}));

function withRegressions(count, {
  frameP95Ms = 60,
  frameSamples = [16.7, 50, 60, 60]
} = {}) {
  return baseTrials.map((trial, index) => ({
    ...trial,
    statistics: {
      frame: { p95Ms: index < count ? frameP95Ms : 50 }
    },
    stopped: {
      frameSamples: index < count ? [...frameSamples] : [...trial.stopped.frameSamples]
    }
  }));
}

const schedule = buildAlternatingPairs(15);
assert.equal(schedule.length, 15, "The paired diagnostic must contain exactly 15 pairs.");
assert.deepEqual(schedule.map(({ pair }) => pair), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
assert.deepEqual(
  schedule.map(({ order }) => order),
  Array.from({ length: 15 }, (_, index) => index % 2 === 0
    ? ["base", "plan019"]
    : ["plan019", "base"]),
  "Odd pairs must run base first and even pairs must run Plan 019 first."
);
assert.throws(() => buildAlternatingPairs(0), /positive integer/i);
assert.throws(() => buildAlternatingPairs(1.5), /positive integer/i);

assert.equal(relativeDeltaPercent(50, 52.5), 5);
assert.equal(relativeDeltaPercent(50, 53), 6);
assert.throws(() => relativeDeltaPercent(0, 1), /positive finite/i);
assert.throws(() => relativeDeltaPercent(50, Number.NaN), /finite/i);

assert.equal(pooledP95(baseTrials), 50);

const noisyAfter = baseTrials.map((trial, index) => ({
  ...trial,
  statistics: { frame: { p95Ms: index === 7 ? 66.6 : 50 } },
  stopped: {
    frameSamples: index === 7
      ? [16.7, 50, 66.6, 66.6]
      : [16.7, 33.3, 50, 50]
  }
}));
assert.equal(classifyPairedDiagnostic({
  baseTrials,
  plan019Trials: noisyAfter
}).realRegression, false, "One noisy trial must not classify as a real regression.");

const consistentRegression = classifyPairedDiagnostic({
  baseTrials,
  plan019Trials: withRegressions(11)
});
assert.deepEqual(consistentRegression, {
  schemaVersion: 1,
  pairCount: 15,
  medianPairedFrameP95RegressionPercent: 20,
  regressedPairCount: 11,
  pooledBaseFrameP95Ms: 50,
  pooledPlan019FrameP95Ms: 60,
  pooledFrameP95RegressionPercent: 20,
  conditions: {
    medianOverFivePercent: true,
    atLeastElevenPairsOverFivePercent: true,
    pooledOverFivePercent: true
  },
  realRegression: true
});

const tenRegressions = classifyPairedDiagnostic({
  baseTrials,
  plan019Trials: withRegressions(10)
});
assert.equal(tenRegressions.conditions.medianOverFivePercent, true);
assert.equal(tenRegressions.conditions.atLeastElevenPairsOverFivePercent, false);
assert.equal(tenRegressions.conditions.pooledOverFivePercent, true);
assert.equal(tenRegressions.realRegression, false, "Ten regressed pairs must not satisfy the 11-of-15 condition.");

const pooledStable = classifyPairedDiagnostic({
  baseTrials,
  plan019Trials: withRegressions(11, { frameSamples: [16.7, 33.3, 50, 50] })
});
assert.equal(pooledStable.conditions.medianOverFivePercent, true);
assert.equal(pooledStable.conditions.atLeastElevenPairsOverFivePercent, true);
assert.equal(pooledStable.conditions.pooledOverFivePercent, false);
assert.equal(pooledStable.realRegression, false, "Stable pooled p95 must prevent a real-regression verdict.");

const medianStable = classifyPairedDiagnostic({
  baseTrials,
  plan019Trials: withRegressions(7, { frameSamples: [60, 60, 60, 60] })
});
assert.equal(medianStable.conditions.medianOverFivePercent, false);
assert.equal(medianStable.conditions.pooledOverFivePercent, true);
assert.equal(medianStable.realRegression, false, "A stable paired median must prevent a real-regression verdict.");

const exactlyFivePercent = classifyPairedDiagnostic({
  baseTrials,
  plan019Trials: withRegressions(15, {
    frameP95Ms: 52.5,
    frameSamples: [16.7, 33.3, 52.5, 52.5]
  })
});
assert.deepEqual(exactlyFivePercent.conditions, {
  medianOverFivePercent: false,
  atLeastElevenPairsOverFivePercent: false,
  pooledOverFivePercent: false
}, "Exactly 5% must pass every strict regression threshold.");
assert.equal(exactlyFivePercent.realRegression, false);

const greaterThanFivePercent = classifyPairedDiagnostic({
  baseTrials,
  plan019Trials: withRegressions(15, {
    frameP95Ms: 53,
    frameSamples: [16.7, 33.3, 53, 53]
  })
});
assert.deepEqual(greaterThanFivePercent.conditions, {
  medianOverFivePercent: true,
  atLeastElevenPairsOverFivePercent: true,
  pooledOverFivePercent: true
});
assert.equal(greaterThanFivePercent.realRegression, true);

const decimalBaseTrials = baseTrials.map((trial) => ({
  ...trial,
  statistics: { frame: { p95Ms: 16.7 } },
  stopped: { frameSamples: [16.7, 16.7, 16.7, 16.7] }
}));
const decimalExactFivePercent = classifyPairedDiagnostic({
  baseTrials: decimalBaseTrials,
  plan019Trials: decimalBaseTrials.map((trial) => ({
    ...trial,
    statistics: { frame: { p95Ms: 17.535 } },
    stopped: { frameSamples: [17.535, 17.535, 17.535, 17.535] }
  }))
});
assert.deepEqual(decimalExactFivePercent.conditions, {
  medianOverFivePercent: false,
  atLeastElevenPairsOverFivePercent: false,
  pooledOverFivePercent: false
}, "Mathematical +5% with a non-binary decimal base must pass every strict threshold.");
assert.equal(decimalExactFivePercent.realRegression, false);

const scaleAwareBaseTrials = baseTrials.map((trial) => ({
  ...trial,
  statistics: { frame: { p95Ms: 64.1 } },
  stopped: { frameSamples: [64.1, 64.1, 64.1, 64.1] }
}));
const scaleAwareExactFivePercent = classifyPairedDiagnostic({
  baseTrials: scaleAwareBaseTrials,
  plan019Trials: scaleAwareBaseTrials.map((trial) => ({
    ...trial,
    statistics: { frame: { p95Ms: 67.305 } },
    stopped: { frameSamples: [67.305, 67.305, 67.305, 67.305] }
  }))
});
assert.deepEqual(scaleAwareExactFivePercent.conditions, {
  medianOverFivePercent: false,
  atLeastElevenPairsOverFivePercent: false,
  pooledOverFivePercent: false
}, "Scale-sensitive mathematical +5% must pass every strict threshold.");
assert.equal(scaleAwareExactFivePercent.realRegression, false);

const scaleAwareJustOverFivePercent = classifyPairedDiagnostic({
  baseTrials: scaleAwareBaseTrials,
  plan019Trials: scaleAwareBaseTrials.map((trial) => ({
    ...trial,
    statistics: { frame: { p95Ms: 67.4 } },
    stopped: { frameSamples: [67.4, 67.4, 67.4, 67.4] }
  }))
});
assert.deepEqual(scaleAwareJustOverFivePercent.conditions, {
  medianOverFivePercent: true,
  atLeastElevenPairsOverFivePercent: true,
  pooledOverFivePercent: true
}, "The smallest meaningful 0.1ms regression step above the boundary must fail every strict threshold.");
assert.equal(scaleAwareJustOverFivePercent.realRegression, true);

const positiveBoundaryNoise = 52.5000000000015;
const positiveBoundaryNoiseResult = classifyPairedDiagnostic({
  baseTrials,
  plan019Trials: withRegressions(15, {
    frameP95Ms: positiveBoundaryNoise,
    frameSamples: [16.7, 33.3, positiveBoundaryNoise, positiveBoundaryNoise]
  })
});
assert.deepEqual(positiveBoundaryNoiseResult.conditions, {
  medianOverFivePercent: false,
  atLeastElevenPairsOverFivePercent: false,
  pooledOverFivePercent: false
}, "Positive timestamp noise below the 0.1ms decision precision must not fail the +5% boundary.");
assert.ok(
  positiveBoundaryNoiseResult.medianPairedFrameP95RegressionPercent > 5,
  "The reported paired delta must retain its raw noisy value."
);
assert.equal(
  positiveBoundaryNoiseResult.pooledPlan019FrameP95Ms,
  positiveBoundaryNoise,
  "The reported pooled p95 must retain its raw noisy value."
);

const negativeBoundaryNoise = 52.499999999998;
const negativeBoundaryNoiseResult = classifyPairedDiagnostic({
  baseTrials,
  plan019Trials: withRegressions(15, {
    frameP95Ms: negativeBoundaryNoise,
    frameSamples: [16.7, 33.3, negativeBoundaryNoise, negativeBoundaryNoise]
  })
});
assert.deepEqual(negativeBoundaryNoiseResult.conditions, {
  medianOverFivePercent: false,
  atLeastElevenPairsOverFivePercent: false,
  pooledOverFivePercent: false
}, "Negative timestamp noise below the 0.1ms decision precision must not fail the +5% boundary.");
assert.equal(negativeBoundaryNoiseResult.pooledPlan019FrameP95Ms, negativeBoundaryNoise);

for (let baseTenths = 20; baseTenths <= 10_000; baseTenths += 20) {
  const baseValue = baseTenths / 10;
  const exactFivePercentValue = baseTenths * 21 / 200;
  const sweepBaseTrials = baseTrials.map((trial) => ({
    ...trial,
    statistics: { frame: { p95Ms: baseValue } },
    stopped: { frameSamples: [baseValue, baseValue, baseValue, baseValue] }
  }));
  const sweepResult = classifyPairedDiagnostic({
    baseTrials: sweepBaseTrials,
    plan019Trials: sweepBaseTrials.map((trial) => ({
      ...trial,
      statistics: { frame: { p95Ms: exactFivePercentValue } },
      stopped: {
        frameSamples: [
          exactFivePercentValue,
          exactFivePercentValue,
          exactFivePercentValue,
          exactFivePercentValue
        ]
      }
    }))
  });
  assert.equal(
    Object.values(sweepResult.conditions).some(Boolean),
    false,
    `Exact +5% 0.1ms-lattice sweep case ${baseValue} -> ${exactFivePercentValue} must pass.`
  );
}

const invalidInputs = [
  {
    label: "missing pair",
    baseTrials: baseTrials.slice(0, 14),
    plan019Trials: noisyAfter.slice(0, 14)
  },
  {
    label: "duplicate pair",
    baseTrials: baseTrials.map((trial, index) => index === 14 ? { ...trial, pair: 14 } : trial),
    plan019Trials: noisyAfter
  },
  {
    label: "non-finite p95",
    baseTrials,
    plan019Trials: noisyAfter.map((trial, index) => index === 0
      ? { ...trial, statistics: { frame: { p95Ms: Number.NaN } } }
      : trial)
  },
  {
    label: "non-finite frame sample",
    baseTrials: baseTrials.map((trial, index) => index === 0
      ? { ...trial, stopped: { frameSamples: [16.7, Number.POSITIVE_INFINITY] } }
      : trial),
    plan019Trials: noisyAfter
  },
  {
    label: "mismatched pair order",
    baseTrials,
    plan019Trials: [noisyAfter[1], noisyAfter[0], ...noisyAfter.slice(2)]
  },
  {
    label: "missing statistics",
    baseTrials,
    plan019Trials: noisyAfter.map((trial, index) => index === 0
      ? { pair: trial.pair, stopped: trial.stopped }
      : trial)
  }
];

for (const fixture of invalidInputs) {
  assert.throws(
    () => classifyPairedDiagnostic(fixture),
    Error,
    `${fixture.label} input must fail closed.`
  );
}

const checksumDirectory = mkdtempSync(path.join(tmpdir(), "wargus-plan019-paired-analysis-"));
try {
  writeFileSync(path.join(checksumDirectory, "base.json"), "{\"arm\":\"base\"}\n");
  writeFileSync(path.join(checksumDirectory, "plan019.json"), "{\"arm\":\"plan019\"}\n");

  const firstManifest = writeAndVerifyChecksumManifest(checksumDirectory);
  assert.equal(firstManifest.path, path.join(checksumDirectory, "sha256.json"));
  assert.match(firstManifest.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    JSON.parse(readFileSync(firstManifest.path, "utf8")).map(({ name }) => name),
    ["base.json", "plan019.json"]
  );
  assert.deepEqual(writeAndVerifyChecksumManifest(checksumDirectory), firstManifest);

  writeFileSync(path.join(checksumDirectory, "base.json"), "{\"arm\":\"tampered\"}\n");
  assert.throws(
    () => writeAndVerifyChecksumManifest(checksumDirectory),
    /checksum|hash/i,
    "A modified checksummed file must fail verification."
  );
} finally {
  rmSync(checksumDirectory, { recursive: true, force: true });
}

console.log("Plan 019 paired A/B analysis contract verified.");

const { existsSync, mkdirSync } = await import("node:fs");
process.env.WARGUS_PAIRED_AB_CONTRACT_TEST = "1";
const {
  acquireDiagnosticLock,
  assertCoordinatorIdentity,
  assertManifestResponse,
  assertRetainedStorage,
  assertTrialPacketComplete,
  canonicalIdentity,
  createDiagnosticDirectory,
  publishAtomicDiagnostic,
  releaseDiagnosticLock,
  validateArmWorktree,
  validateCleanup,
  validateQualification
} = await import("./run-plan019-paired-ab-diagnostic.mjs");

const identity = canonicalIdentity();
assert.deepEqual(identity, {
  baseCommit: "5b7d9cc81072c8aeda1ce1a9c22602569e1a691b",
  plan019Commit: "5935a17f456868051c2c16b2f0d8d2b4da56d115",
  coordinatorHarnessCommit: "82571c31a942cc38857f612ec6736cca05a174ce",
  profile: "army-100",
  viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
  durationMs: 30000,
  pairCount: 15
});

const coordinatorFixture = {
  hostname: "halla",
  cwd: "/home/halla/workspaces/t3/Wargus-TypeScript/.worktrees/plan-018",
  status: "",
  harnessAncestorPresent: true,
  harnessMatchesPinnedCommit: true
};
assert.deepEqual(assertCoordinatorIdentity(coordinatorFixture), {
  ...coordinatorFixture,
  clean: true
});
assert.throws(
  () => assertCoordinatorIdentity({ ...coordinatorFixture, status: "?? untracked" }),
  /clean coordinator/i,
  "A dirty coordinator must fail before capture allocation."
);
assert.throws(
  () => assertCoordinatorIdentity({ ...coordinatorFixture, harnessMatchesPinnedCommit: false }),
  /82571c31a942cc38857f612ec6736cca05a174ce/i,
  "A modified pinned successor harness must fail attribution."
);

assert.deepEqual(
  validateArmWorktree({
    arm: "base",
    expectedCommit: identity.baseCommit,
    head: identity.baseCommit,
    status: ""
  }),
  { arm: "base", commit: identity.baseCommit, clean: true }
);
assert.throws(
  () => validateArmWorktree({
    arm: "base",
    expectedCommit: identity.baseCommit,
    head: identity.plan019Commit,
    status: ""
  }),
  /exact base commit/i,
  "A wrong arm commit must fail attribution."
);
assert.throws(
  () => validateArmWorktree({
    arm: "plan019",
    expectedCommit: identity.plan019Commit,
    head: identity.plan019Commit,
    status: " M src/main.ts"
  }),
  /clean plan019 worktree/i,
  "A dirty disposable arm must fail attribution."
);

const validTrials = buildAlternatingPairs(15).flatMap(({ pair, order }) =>
  order.map((arm, orderIndex) => ({
    pair,
    arm,
    orderIndex,
    stamp: `pair-${String(pair).padStart(2, "0")}-${arm}`,
    valid: true,
    replacement: 0
  }))
);
assert.equal(assertTrialPacketComplete(validTrials).length, 30);
assert.throws(
  () => assertTrialPacketComplete(validTrials.slice(0, -1)),
  /exactly 30 valid arms/i,
  "A missing arm must prevent READY publication."
);
assert.throws(
  () => assertTrialPacketComplete([...validTrials, { ...validTrials[0], stamp: "extra" }]),
  /exactly 30 valid arms/i,
  "An extra arm must prevent READY publication."
);
assert.throws(
  () => assertTrialPacketComplete(validTrials.map((trial, index) =>
    index === 1 ? { ...trial, stamp: validTrials[0].stamp } : trial
  )),
  /unique stamp/i,
  "Reused arm stamps must fail closed."
);
assert.throws(
  () => assertTrialPacketComplete(validTrials.map((trial, index) =>
    index === 0 ? { ...trial, replacement: 2 } : trial
  )),
  /at most one replacement/i,
  "A second replacement for one arm must fail closed."
);

const retainedWorkspace = mkdtempSync(path.join(tmpdir(), "wargus-plan019-paired-retained-"));
try {
  const retainedRoot = path.join(retainedWorkspace, ".artifacts");
  mkdirSync(retainedRoot);
  assert.deepEqual(assertRetainedStorage({
    artifactWorkspace: retainedWorkspace,
    artifactRoot: retainedRoot,
    preservationOwner: "contract-test",
    disposableWorktree: process.cwd(),
    requireFreeBytes: 0,
    verifyIgnored: false
  }), {
    artifactWorkspace: retainedWorkspace,
    artifactRoot: retainedRoot,
    preservationOwner: "contract-test"
  });
  assert.throws(
    () => assertRetainedStorage({
      artifactWorkspace: retainedWorkspace,
      artifactRoot: path.join(retainedWorkspace, "absent"),
      preservationOwner: "contract-test",
      disposableWorktree: process.cwd(),
      requireFreeBytes: 0,
      verifyIgnored: false
    }),
    /retained artifact root/i,
    "Absent retained storage must fail before a diagnostic directory is created."
  );

  const firstLock = acquireDiagnosticLock({ artifactRoot: retainedRoot, token: "first" });
  try {
    assert.throws(
      () => acquireDiagnosticLock({ artifactRoot: retainedRoot, token: "second" }),
      /another performance capture/i,
      "Global lock contention must fail closed."
    );
  } finally {
    releaseDiagnosticLock(firstLock);
  }
  assert.equal(existsSync(path.join(retainedRoot, "performance", ".wargus-capture.lock")), false);

  const diagnosticStamp = "20260729T235959Z";
  const diagnosticDirectory = createDiagnosticDirectory(retainedRoot, diagnosticStamp);
  assert.equal(diagnosticDirectory, path.join(retainedRoot, "diagnostics", "plan019-paired-ab", diagnosticStamp));
  assert.throws(
    () => createDiagnosticDirectory(retainedRoot, diagnosticStamp),
    /may not be reused/i,
    "A reused diagnostic stamp must fail before publication."
  );
} finally {
  rmSync(retainedWorkspace, { recursive: true, force: true });
}

assert.deepEqual(assertManifestResponse({ status: 200 }), { status: 200 });
assert.throws(
  () => assertManifestResponse({ status: 204 }),
  /HTTP 200/i,
  "A non-200 manifest route must invalidate an arm."
);

const qualification = {
  webgl2: true,
  renderer: "ANGLE (AMD, AMD Radeon RX 7900 XTX, Vulkan)",
  vendor: "Google Inc. (AMD)",
  focused: true,
  visibility: "visible",
  rafTimestamps: [100, 116.7, 133.4],
  browserViewport: { width: 1280, height: 720, devicePixelRatio: 1 },
  pixiViewport: { width: 1280, height: 720, resolution: 1 },
  profile: "army-100",
  worldTick: 0,
  fingerprintHash: "fingerprint-1"
};
assert.deepEqual(validateQualification(qualification, {
  expectedRenderer: qualification.renderer,
  expectedFingerprintHash: "fingerprint-1"
}), qualification);
assert.throws(
  () => validateQualification({ ...qualification, renderer: "ANGLE (SwiftShader)" }, {
    expectedRenderer: qualification.renderer,
    expectedFingerprintHash: "fingerprint-1"
  }),
  /renderer/i,
  "A software or changed renderer must fail qualification."
);
assert.throws(
  () => validateQualification({ ...qualification, fingerprintHash: "fingerprint-2" }, {
    expectedRenderer: qualification.renderer,
    expectedFingerprintHash: "fingerprint-1"
  }),
  /fingerprint/i,
  "Fingerprint drift must fail qualification."
);

assert.deepEqual(validateCleanup({ residualPids: [], openPorts: [] }), {
  residualPids: [],
  openPorts: []
});
assert.throws(
  () => validateCleanup({ residualPids: [123], openPorts: [] }),
  /cleanup incomplete/i,
  "Residual owned PIDs must prevent publication."
);
assert.throws(
  () => validateCleanup({ residualPids: [], openPorts: [55000] }),
  /cleanup incomplete/i,
  "Residual owned ports must prevent publication."
);

const publicationDirectory = mkdtempSync(path.join(tmpdir(), "wargus-plan019-paired-publish-"));
try {
  for (const name of ["environment.json", "pairs.json", "resources.json", "lifecycle.json"]) {
    writeFileSync(path.join(publicationDirectory, name), "{}\n");
  }
  const summary = {
    schemaVersion: 1,
    ready: true,
    captureComplete: true,
    validTrialCount: 30,
    classification: { realRegression: false },
    pairs: Array.from({ length: 15 }, (_, index) => ({ pair: index + 1 })),
    lifecycle: {
      cleanupPass: true,
      worktreesRemoved: true,
      lockReleased: true,
      finalizationPass: true
    }
  };
  assert.throws(
    () => publishAtomicDiagnostic(publicationDirectory, {
      ...summary,
      lifecycle: { ...summary.lifecycle, lockReleased: false }
    }),
    /released lock/i,
    "Publication before global lock release must fail closed."
  );
  const failedPublication = publishAtomicDiagnostic(publicationDirectory, summary, {
    beforeReadyRename: () => {
      throw new Error("injected ready publication failure");
    }
  });
  assert.equal(failedPublication.published, false);
  assert.equal(
    JSON.parse(readFileSync(path.join(publicationDirectory, "paired-diagnostic-summary.json"), "utf8")).ready,
    false,
    "A partial publication must leave only a non-READY summary."
  );
  assert.equal(
    existsSync(path.join(publicationDirectory, "sha256.json")),
    true,
    "A failed final rename may retain its projected manifest, but it must not make the diagnostic READY."
  );
} finally {
  rmSync(publicationDirectory, { recursive: true, force: true });
}
