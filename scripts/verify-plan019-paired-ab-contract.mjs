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

const { existsSync, mkdirSync, renameSync, unlinkSync } = await import("node:fs");
process.env.WARGUS_PAIRED_AB_CONTRACT_TEST = "1";
const {
  acquireDiagnosticLock,
  assertCoordinatorIdentity,
  assertManifestResponse,
  assertRetainedStorage,
  assertTrialPacketComplete,
  buildPairArmReference,
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
  renderer: "ANGLE (AMD, Vulkan 1.4.318 (AMD Radeon Graphics (RADV RENOIR) (0x0000164C)), radv)",
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

assert.deepEqual(validateCleanup({ residualPids: [], openPorts: [], profileResiduals: [] }), {
  residualPids: [],
  openPorts: [],
  profileResiduals: []
});
assert.throws(
  () => validateCleanup({ residualPids: [123], openPorts: [], profileResiduals: [] }),
  /cleanup incomplete/i,
  "Residual owned PIDs must prevent publication."
);
assert.throws(
  () => validateCleanup({ residualPids: [], openPorts: [55000], profileResiduals: [] }),
  /cleanup incomplete/i,
  "Residual owned ports must prevent publication."
);

const publicationDirectory = mkdtempSync(path.join(tmpdir(), "wargus-plan019-paired-publish-"));
try {
  const summary = writePublicationFixture(publicationDirectory);
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

const {
  advanceRafTimestamp,
  allocateArmWorktreeRecords,
  buildSupportingPairedMetrics,
  cleanupArmWorktreeRecords,
  cleanupTrackedController,
  createOwnedBrowserProfile,
  removeOwnedBrowserProfile,
  finalizeCapturedArmTrial,
  validateCapturedArmTrial,
  validatePublicationPacket
} = await import("./run-plan019-paired-ab-diagnostic.mjs");

const defaultStampRoot = mkdtempSync(path.join(tmpdir(), "wargus-plan019-default-stamp-"));
try {
  const defaultStampedDirectory = createDiagnosticDirectory(defaultStampRoot);
  assert.match(path.basename(defaultStampedDirectory), /^\d{8}T\d{6}Z$/, "Default diagnostic stamps must use UTC basic seconds.");
} finally {
  rmSync(defaultStampRoot, { recursive: true, force: true });
}

const realAmdVulkanRenderer = "ANGLE (AMD, Vulkan 1.4.318 (AMD Radeon Graphics (RADV RENOIR) (0x0000164C)), radv)";
assert.equal(validateQualification({ ...qualification, renderer: realAmdVulkanRenderer }, {
  expectedRenderer: realAmdVulkanRenderer,
  expectedFingerprintHash: "fingerprint-1"
}).renderer, realAmdVulkanRenderer);
for (const rejectedRenderer of [
  "ANGLE (Intel, Vulkan 1.3.0 (Intel UHD Graphics), intel)",
  "ANGLE (NVIDIA, Vulkan 1.3.0 (NVIDIA RTX 4090), nvidia)",
  "ANGLE (AMD, AMD Radeon Graphics, OpenGL 4.6)"
]) {
  assert.throws(
    () => validateQualification({ ...qualification, renderer: rejectedRenderer }, {
      expectedRenderer: rejectedRenderer,
      expectedFingerprintHash: "fingerprint-1"
    }),
    /AMD Radeon Vulkan/i,
    `Renderer ${rejectedRenderer} must not satisfy the AMD Vulkan contract.`
  );
}

const allocationRegistry = [];
const allocationEvents = [];
const allocationRoot = "/tmp/wargus-plan019-injected-worktrees";
assert.throws(
  () => allocateArmWorktreeRecords({
    root: allocationRoot,
    definitions: [
      { arm: "base", commit: identity.baseCommit },
      { arm: "plan019", commit: identity.plan019Commit }
    ],
    registry: allocationRegistry,
    operations: {
      createRoot: () => allocationEvents.push("create-root"),
      add: (record) => {
        allocationEvents.push(`add:${record.arm}`);
        if (record.arm === "plan019") throw new Error("injected add failure after allocation");
      },
      validate: (record) => allocationEvents.push(`validate:${record.arm}`),
      remove: (record) => {
        allocationEvents.push(`remove:${record.arm}`);
        if (record.arm === "plan019") throw new Error("injected first cleanup failure");
      },
      removeRoot: () => allocationEvents.push("remove-root")
    }
  }),
  /allocation.*cleanup/i,
  "Partial worktree allocation plus cleanup failure must propagate."
);
assert.deepEqual(allocationRegistry.map(({ arm }) => arm), ["base", "plan019"], "Every attempted worktree must remain durably tracked after allocation failure.");
assert.ok(allocationEvents.includes("remove:base"), "Allocation rollback must attempt every exact known worktree.");
assert.ok(allocationEvents.includes("remove:plan019"), "Allocation rollback must include the partially added worktree.");
cleanupArmWorktreeRecords({
  root: allocationRoot,
  records: allocationRegistry,
  operations: {
    remove: (record) => allocationEvents.push(`retry-remove:${record.arm}`),
    removeRoot: () => allocationEvents.push("retry-remove-root")
  }
});
assert.ok(allocationEvents.includes("retry-remove:plan019"), "Outer cleanup must be able to retry every exact retained worktree record.");

const profileRoot = mkdtempSync(path.join(tmpdir(), "wargus-plan019-profiles-"));
try {
  const firstProfile = createOwnedBrowserProfile({ root: profileRoot, pair: 1, arm: "base", replacement: 0 });
  const secondProfile = createOwnedBrowserProfile({ root: profileRoot, pair: 1, arm: "plan019", replacement: 0 });
  assert.notEqual(firstProfile, secondProfile, "Every arm must own a unique browser profile path.");
  assert.throws(
    () => validateCleanup({ residualPids: [], openPorts: [], profileResiduals: [firstProfile] }),
    /profile/i,
    "An owned Chrome profile residual must fail lifecycle cleanup."
  );
  removeOwnedBrowserProfile({ profilePath: firstProfile, root: profileRoot });
  removeOwnedBrowserProfile({ profilePath: secondProfile, root: profileRoot });
  assert.equal(existsSync(firstProfile), false);
  assert.equal(existsSync(secondProfile), false);
} finally {
  rmSync(profileRoot, { recursive: true, force: true });
}

const trackedControllers = new Set();
let controllerCleanupAttempts = 0;
const trackedController = {
  cleanup: async () => {
    controllerCleanupAttempts += 1;
    if (controllerCleanupAttempts === 1) return { residualPids: [123], openPorts: [], profileResiduals: [] };
    return { residualPids: [], openPorts: [], profileResiduals: [] };
  }
};
const trackedRecord = { controller: trackedController, scope: "contract-retry" };
trackedControllers.add(trackedRecord);
await assert.rejects(
  () => cleanupTrackedController(trackedRecord, trackedControllers),
  /cleanup incomplete/i,
  "A failed controller cleanup must remain retryable."
);
assert.equal(trackedControllers.has(trackedRecord), true, "Failed cleanup must not delete the tracked controller.");
await cleanupTrackedController(trackedRecord, trackedControllers);
assert.equal(trackedControllers.has(trackedRecord), false, "Only verified clean controller state may be untracked.");
assert.equal(controllerCleanupAttempts, 2);

assert.equal(advanceRafTimestamp(100, 116.7), 116.7);
assert.throws(() => advanceRafTimestamp(116.7, 116.7), /advancing RAF/i, "Repeated positive RAF timestamps must invalidate capture.");
assert.throws(() => advanceRafTimestamp(116.7, 100), /advancing RAF/i, "Decreasing RAF timestamps must invalidate capture.");

const supportingBase = Array.from({ length: 15 }, (_, index) => supportingTrial(index + 1, 50, 10));
const supportingAfter = Array.from({ length: 15 }, (_, index) => supportingTrial(index + 1, 55, 12));
const supporting = buildSupportingPairedMetrics({ baseTrials: supportingBase, plan019Trials: supportingAfter });
assert.equal(supporting.length, 15);
assert.deepEqual(supporting[0], {
  pair: 1,
  frame: {
    p50Ms: { base: 25, plan019: 27.5, delta: 2.5, relativeDeltaPercent: 10 },
    p95Ms: { base: 50, plan019: 55, delta: 5, relativeDeltaPercent: 10 },
    p99Ms: { base: 75, plan019: 82.5, delta: 7.5, relativeDeltaPercent: 10 },
    meanMs: { base: 30, plan019: 33, delta: 3, relativeDeltaPercent: 10 },
    maxMs: { base: 100, plan019: 110, delta: 10, relativeDeltaPercent: 10 },
    over50Count: { base: 10, plan019: 12, delta: 2, relativeDeltaPercent: 20 },
    over100Count: { base: 2, plan019: 3, delta: 1, relativeDeltaPercent: 50 }
  },
  update: {
    p95Ms: { base: 5, plan019: 5.5, delta: 0.5, relativeDeltaPercent: 10 },
    meanMs: { base: 2, plan019: 2.2, delta: 0.2, relativeDeltaPercent: 10 }
  },
  renderPreparation: {
    p95Ms: { base: 3, plan019: 3.3, delta: 0.3, relativeDeltaPercent: 10 },
    meanMs: { base: 1, plan019: 1.1, delta: 0.1, relativeDeltaPercent: 10 }
  },
  scheduler: {
    droppedDeltaSeconds: { base: 0, plan019: 0, delta: 0, relativeDeltaPercent: null },
    maxBacklogSeconds: { base: 0.1, plan019: 0.11, delta: 0.01, relativeDeltaPercent: 10 }
  }
});

assert.deepEqual(buildPairArmReference({ arm: "plan019", file: "pair-01-plan019.json", replacement: 0, stamp: "pair-01-plan019-attempt-1", valid: true }, 1), {
  arm: "plan019", orderIndex: 1, file: "pair-01-plan019.json", replacement: 0, stamp: "pair-01-plan019-attempt-1", valid: true
});

const packetDirectory = mkdtempSync(path.join(tmpdir(), "wargus-plan019-packet-valid-"));
try {
  const packetSummary = writePublicationFixture(packetDirectory);
  assert.equal(validatePublicationPacket(packetDirectory, packetSummary).trialFiles.length, 30);

  for (const [label, mutate, pattern] of [
    ["schema", (value) => { value.schemaVersion = 2; }, /schemaVersion/i],
    ["schedule", (value) => { value.schedule[0].order.reverse(); }, /canonical.*schedule/i],
    ["missing projection", (value) => { delete value.currentValidTrials; }, /currentValidTrials/i],
    ["extra projection", (value) => { value.currentValidTrials.push({ ...value.currentValidTrials[0], pair: 99 }); }, /currentValidTrials/i],
    ["mismatched projection", (value) => { value.currentValidTrials[0].file = "wrong.json"; }, /currentValidTrials/i]
  ]) {
    const projectionDirectory = mkdtempSync(path.join(tmpdir(), `wargus-plan019-projection-${label.replaceAll(" ", "-")}-`));
    try {
      const projectionSummary = writePublicationFixture(projectionDirectory);
      const pairsPath = path.join(projectionDirectory, "pairs.json");
      const pairsValue = JSON.parse(readFileSync(pairsPath, "utf8"));
      mutate(pairsValue);
      writeFileSync(pairsPath, `${JSON.stringify(pairsValue, null, 2)}
`);
      assert.throws(() => validatePublicationPacket(projectionDirectory, projectionSummary), pattern, `${label} pairs projection must fail closed.`);
    } finally { rmSync(projectionDirectory, { recursive: true, force: true }); }
  }

  const missingDirectory = mkdtempSync(path.join(tmpdir(), "wargus-plan019-packet-missing-"));
  try {
    const missingSummary = writePublicationFixture(missingDirectory);
    unlinkSync(path.join(missingDirectory, missingSummary.pairs[0].arms[0].file));
    assert.throws(() => validatePublicationPacket(missingDirectory, missingSummary), /missing.*raw trial/i);
  } finally { rmSync(missingDirectory, { recursive: true, force: true }); }

  const extraDirectory = mkdtempSync(path.join(tmpdir(), "wargus-plan019-packet-extra-"));
  try {
    const extraSummary = writePublicationFixture(extraDirectory);
    writeFileSync(path.join(extraDirectory, "pair-99-base.json"), "{}\n");
    assert.throws(() => validatePublicationPacket(extraDirectory, extraSummary), /extra.*raw trial/i);
  } finally { rmSync(extraDirectory, { recursive: true, force: true }); }

  const mismatchDirectory = mkdtempSync(path.join(tmpdir(), "wargus-plan019-packet-mismatch-"));
  try {
    const mismatchSummary = writePublicationFixture(mismatchDirectory);
    const firstFile = mismatchSummary.pairs[0].arms[0].file;
    const mismatched = JSON.parse(readFileSync(path.join(mismatchDirectory, firstFile), "utf8"));
    mismatched.arm = "plan019";
    writeFileSync(path.join(mismatchDirectory, firstFile), `${JSON.stringify(mismatched)}\n`);
    assert.throws(() => validatePublicationPacket(mismatchDirectory, mismatchSummary), /raw trial.*mismatch/i);
  } finally { rmSync(mismatchDirectory, { recursive: true, force: true }); }

  const noRawDirectory = mkdtempSync(path.join(tmpdir(), "wargus-plan019-packet-zero-"));
  try {
    const noRawSummary = writePublicationFixture(noRawDirectory, { writeTrials: false });
    assert.throws(() => validatePublicationPacket(noRawDirectory, noRawSummary), /missing.*raw trial/i);
  } finally { rmSync(noRawDirectory, { recursive: true, force: true }); }

  const legacyPostRenameDirectory = mkdtempSync(path.join(tmpdir(), "wargus-plan019-post-rename-"));
  try {
    const legacySummary = writePublicationFixture(legacyPostRenameDirectory);
    const result = publishAtomicDiagnostic(legacyPostRenameDirectory, legacySummary, {
      readyRename: (from, to) => {
        renameSync(from, to);
        throw new Error("injected legacy post-rename fsync failure");
      }
    });
    assert.equal(result.published, false);
    assert.equal(JSON.parse(readFileSync(path.join(legacyPostRenameDirectory, "paired-diagnostic-summary.json"), "utf8")).ready, false, "An injected legacy post-rename failure must be durably downgraded.");
  } finally { rmSync(legacyPostRenameDirectory, { recursive: true, force: true }); }

  const finalVerifyDirectory = mkdtempSync(path.join(tmpdir(), "wargus-plan019-final-verify-"));
  try {
    const finalVerifySummary = writePublicationFixture(finalVerifyDirectory);
    const result = publishAtomicDiagnostic(finalVerifyDirectory, finalVerifySummary, {
      verifyFinalManifest: () => { throw new Error("injected final verification failure"); }
    });
    assert.equal(result.published, false);
    assert.equal(JSON.parse(readFileSync(path.join(finalVerifyDirectory, "paired-diagnostic-summary.json"), "utf8")).ready, false, "Final verification failure must never persist READY.");
  } finally { rmSync(finalVerifyDirectory, { recursive: true, force: true }); }
} finally {
  rmSync(packetDirectory, { recursive: true, force: true });
}

function supportingTrial(pair, frameP95Ms, over50Count) {
  const scale = frameP95Ms / 50;
  return {
    pair,
    statistics: {
      frame: { p50Ms: 25 * scale, p95Ms: frameP95Ms, p99Ms: 75 * scale, meanMs: 30 * scale, maxMs: 100 * scale, thresholdCounts: { over50Ms: over50Count, over100Ms: frameP95Ms === 50 ? 2 : 3 } },
      update: { p95Ms: 5 * scale, meanMs: 2 * scale },
      renderPreparation: { p95Ms: 3 * scale, meanMs: 1 * scale }
    },
    stopped: { frameSamples: [25 * scale, frameP95Ms, frameP95Ms, frameP95Ms], scheduler: { droppedDeltaSeconds: 0, maxBacklogSeconds: 0.1 * scale } }
  };
}

function writePublicationFixture(directory, { writeTrials = true } = {}) {
  const pairs = buildAlternatingPairs(15).map(({ pair, order }) => ({
    pair,
    order,
    arms: order.map((arm, orderIndex) => ({
      ...buildPairArmReference({
        arm,
        file: `pair-${String(pair).padStart(2, "0")}-${arm}.json`,
        replacement: 0,
        stamp: `pair-${String(pair).padStart(2, "0")}-${arm}-attempt-1`,
        valid: true
      }, orderIndex)
    }))
  }));
  for (const name of ["environment.json", "resources.json", "lifecycle.json"]) writeFileSync(path.join(directory, name), "{}\n");
  const currentValidTrials = pairs.flatMap((pair) => pair.arms.map(({ arm, orderIndex, replacement, stamp, file }) => ({ pair: pair.pair, arm, orderIndex, replacement, stamp, file })));
  writeFileSync(path.join(directory, "pairs.json"), `${JSON.stringify({ schemaVersion: 1, schedule: buildAlternatingPairs(15), completed: pairs, currentValidTrials, invalid: [] }, null, 2)}\n`);
  if (writeTrials) for (const pair of pairs) for (const arm of pair.arms) {
    writeFileSync(path.join(directory, arm.file), `${JSON.stringify({ pair: pair.pair, arm: arm.arm, orderIndex: arm.orderIndex, stamp: arm.stamp, replacement: arm.replacement, valid: true })}\n`);
  }
  return {
    schemaVersion: 1,
    ready: true,
    captureComplete: true,
    validTrialCount: 30,
    classification: { realRegression: false },
    supportingPairedMetrics: Array.from({ length: 15 }, (_, index) => ({ pair: index + 1 })),
    pairs,
    lifecycle: { cleanupPass: true, profilesRemoved: true, worktreesRemoved: true, lockReleased: true, finalizationPass: true }
  };
}


const validCapturedArm = capturedArmFixture();
assert.deepEqual(validateCapturedArmTrial(validCapturedArm), validCapturedArm);
assert.deepEqual(finalizeCapturedArmTrial(validCapturedArm), validCapturedArm);
for (const [label, mutate, pattern] of [
  ["missing 15-second snapshot", (trial) => { trial.t15 = null; }, /15-second/i],
  ["missing 30-second snapshot", (trial) => { trial.stopped = null; }, /30-second/i],
  ["empty frame samples", (trial) => { trial.stopped.frameSamples = []; }, /frameSamples/i],
  ["nonfinite update samples", (trial) => { trial.stopped.updateSamples[0] = Number.NaN; }, /finite.*updateSamples/i],
  ["empty render samples", (trial) => { trial.stopped.renderPreparationSamples = []; }, /renderPreparationSamples/i],
  ["nonfinite statistics", (trial) => { trial.statistics.frame.p95Ms = Number.NaN; }, /statistics.*raw samples/i],
  ["invalid scheduler dropped", (trial) => { trial.stopped.scheduler.droppedDeltaSeconds = -1; trial.statistics.scheduler.droppedDeltaSeconds = -1; }, /scheduler/i],
  ["invalid scheduler backlog", (trial) => { trial.stopped.scheduler.maxBacklogSeconds = Number.POSITIVE_INFINITY; trial.statistics.scheduler.maxBacklogSeconds = Number.POSITIVE_INFINITY; }, /scheduler/i]
]) {
  const invalid = structuredClone(validCapturedArm);
  mutate(invalid);
  assert.throws(() => finalizeCapturedArmTrial(invalid), pattern, `${label} must be rejected before a trial can be returned valid.`);
}

for (const metric of ["frame", "update", "renderPreparation"]) {
  const wrongSampleCount = structuredClone(validCapturedArm);
  wrongSampleCount.statistics[metric].sampleCount += 1;
  assert.throws(() => finalizeCapturedArmTrial(wrongSampleCount), /statistics/i, `${metric}.sampleCount must match raw stopped samples.`);
  for (const field of ["p50Ms", "p95Ms", "p99Ms", "meanMs", "maxMs"]) {
    const finiteButWrong = structuredClone(validCapturedArm);
    finiteButWrong.statistics[metric][field] += 1;
    assert.throws(
      () => finalizeCapturedArmTrial(finiteButWrong),
      /statistics.*raw samples/i,
      `${metric}.${field} must be recomputed from raw stopped samples.`
    );
  }
  for (const threshold of ["over50Ms", "over100Ms"]) {
    const finiteButWrong = structuredClone(validCapturedArm);
    finiteButWrong.statistics[metric].thresholdCounts[threshold] = finiteButWrong.statistics[metric].thresholdCounts[threshold] === 0 ? 1 : 0;
    assert.throws(
      () => finalizeCapturedArmTrial(finiteButWrong),
      /statistics.*raw samples/i,
      `${metric}.${threshold} must be recomputed from raw stopped samples.`
    );
  }
}

function capturedArmFixture() {
  const scheduler = { droppedDeltaSeconds: 0, maxBacklogSeconds: 0.1 };
  const snapshot = (worldTick) => ({
    profile: "army-100",
    worldTick,
    heap: { supported: true, usedJsHeapSize: worldTick },
    scheduler: { ...scheduler },
    frameSamples: [50, 100, 150],
    updateSamples: [1, 2, 3],
    renderPreparationSamples: [0.25, 0.5, 0.75]
  });
  return {
    pair: 1,
    arm: "base",
    orderIndex: 0,
    replacement: 0,
    stamp: "pair-01-base-attempt-1",
    valid: true,
    profile: "army-100",
    durationMs: 30000,
    actualDurationMs: 30001,
    started: { profile: "army-100" },
    t15: snapshot(450),
    stopped: snapshot(900),
    statistics: {
      frame: { sampleCount: 3, p50Ms: 100, p95Ms: 150, p99Ms: 150, meanMs: 100, maxMs: 150, thresholdCounts: { over50Ms: 2, over100Ms: 1 } },
      update: { sampleCount: 3, p50Ms: 2, p95Ms: 3, p99Ms: 3, meanMs: 2, maxMs: 3, thresholdCounts: { over50Ms: 0, over100Ms: 0 } },
      renderPreparation: { sampleCount: 3, p50Ms: 0.5, p95Ms: 0.75, p99Ms: 0.75, meanMs: 0.5, maxMs: 0.75, thresholdCounts: { over50Ms: 0, over100Ms: 0 } },
      scheduler: { ...scheduler }
    }
  };
}
