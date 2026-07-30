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
    statistics: { frame: { p95Ms: 67.3051 } },
    stopped: { frameSamples: [67.3051, 67.3051, 67.3051, 67.3051] }
  }))
});
assert.deepEqual(scaleAwareJustOverFivePercent.conditions, {
  medianOverFivePercent: true,
  atLeastElevenPairsOverFivePercent: true,
  pooledOverFivePercent: true
}, "A genuine regression above the scale-aware ULP tolerance must fail every strict threshold.");
assert.equal(scaleAwareJustOverFivePercent.realRegression, true);

for (let baseTenths = 1; baseTenths <= 10_000; baseTenths += 1) {
  const baseValue = baseTenths / 10;
  const exactFivePercentValue = baseTenths * 105 / 1_000;
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
    `Exact +5% decimal sweep case ${baseValue} -> ${exactFivePercentValue} must pass.`
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
