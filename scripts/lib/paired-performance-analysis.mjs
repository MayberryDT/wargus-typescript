import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

const REQUIRED_PAIR_COUNT = 15;
const REGRESSION_THRESHOLD_PERCENT = 5;
const REQUIRED_REGRESSED_PAIR_COUNT = 11;
const MANIFEST_NAME = "sha256.json";

export function buildAlternatingPairs(count) {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("Pair count must be a positive integer.");
  }

  return Array.from({ length: count }, (_, index) => ({
    pair: index + 1,
    order: index % 2 === 0
      ? ["base", "plan019"]
      : ["plan019", "base"]
  }));
}

export function relativeDeltaPercent(base, after) {
  if (!Number.isFinite(base) || base <= 0) {
    throw new Error("Relative-delta base must be a positive finite number.");
  }
  if (!Number.isFinite(after) || after < 0) {
    throw new Error("Relative-delta after value must be a non-negative finite number.");
  }
  return (after - base) / base * 100;
}

export function pooledP95(trials) {
  if (!Array.isArray(trials) || trials.length === 0) {
    throw new Error("Pooled p95 requires at least one trial.");
  }

  const samples = [];
  for (const [index, trial] of trials.entries()) {
    validateTrial(trial, `trials[${index}]`);
    samples.push(...trial.stopped.frameSamples);
  }
  return nearestRank(samples, 0.95);
}

export function classifyPairedDiagnostic({ baseTrials, plan019Trials } = {}) {
  validatePairedTrials("baseTrials", baseTrials);
  validatePairedTrials("plan019Trials", plan019Trials);

  const pairedObservations = baseTrials.map((baseTrial, index) => {
    const plan019Trial = plan019Trials[index];
    if (baseTrial.pair !== plan019Trial.pair) {
      throw new Error(`Pair mismatch at index ${index}: base ${baseTrial.pair}, Plan 019 ${plan019Trial.pair}.`);
    }
    const baseFrameP95Ms = baseTrial.statistics.frame.p95Ms;
    const plan019FrameP95Ms = plan019Trial.statistics.frame.p95Ms;
    return {
      pair: baseTrial.pair,
      baseFrameP95Ms,
      plan019FrameP95Ms,
      deltaPercent: relativeDeltaPercent(baseFrameP95Ms, plan019FrameP95Ms)
    };
  });

  const medianPairedObservation = [...pairedObservations]
    .sort((left, right) => left.deltaPercent - right.deltaPercent || left.pair - right.pair)
    .at(Math.floor(pairedObservations.length / 2));
  const medianPairedFrameP95RegressionPercent = medianPairedObservation.deltaPercent;
  const regressedPairCount = pairedObservations.filter((observation) =>
    exceedsRegressionThreshold(observation.baseFrameP95Ms, observation.plan019FrameP95Ms)
  ).length;
  const pooledBaseFrameP95Ms = pooledP95(baseTrials);
  const pooledPlan019FrameP95Ms = pooledP95(plan019Trials);
  const pooledFrameP95RegressionPercent = relativeDeltaPercent(
    pooledBaseFrameP95Ms,
    pooledPlan019FrameP95Ms
  );
  const conditions = {
    medianOverFivePercent:
      exceedsRegressionThreshold(
        medianPairedObservation.baseFrameP95Ms,
        medianPairedObservation.plan019FrameP95Ms
      ),
    atLeastElevenPairsOverFivePercent:
      regressedPairCount >= REQUIRED_REGRESSED_PAIR_COUNT,
    pooledOverFivePercent:
      exceedsRegressionThreshold(pooledBaseFrameP95Ms, pooledPlan019FrameP95Ms)
  };

  return {
    schemaVersion: 1,
    pairCount: REQUIRED_PAIR_COUNT,
    medianPairedFrameP95RegressionPercent,
    regressedPairCount,
    pooledBaseFrameP95Ms,
    pooledPlan019FrameP95Ms,
    pooledFrameP95RegressionPercent,
    conditions,
    realRegression:
      conditions.medianOverFivePercent
      && conditions.atLeastElevenPairsOverFivePercent
      && conditions.pooledOverFivePercent
  };
}

export function writeAndVerifyChecksumManifest(directory) {
  if (!statSync(directory).isDirectory()) {
    throw new Error(`Checksum target is not a directory: ${directory}`);
  }

  const manifestPath = path.join(directory, MANIFEST_NAME);
  const artifactNames = listArtifactNames(directory);

  if (!existsSync(manifestPath)) {
    const manifest = artifactNames.map((name) => ({
      name,
      sha256: sha256(readArtifact(directory, name))
    }));
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  }

  const manifest = parseManifest(manifestPath);
  const manifestNames = manifest.map(({ name }) => name);
  if (JSON.stringify(manifestNames) !== JSON.stringify(artifactNames)) {
    throw new Error("Checksum manifest does not cover the exact artifact set.");
  }

  for (const record of manifest) {
    const actual = sha256(readArtifact(directory, record.name));
    if (actual !== record.sha256) {
      throw new Error(`Checksum hash mismatch for ${record.name}.`);
    }
  }

  return {
    path: manifestPath,
    sha256: sha256(readFileSync(manifestPath))
  };
}

function validatePairedTrials(label, trials) {
  if (!Array.isArray(trials) || trials.length !== REQUIRED_PAIR_COUNT) {
    throw new Error(`${label} must contain exactly ${REQUIRED_PAIR_COUNT} trials.`);
  }

  for (const [index, trial] of trials.entries()) {
    validateTrial(trial, `${label}[${index}]`);
    const expectedPair = index + 1;
    if (trial.pair !== expectedPair) {
      throw new Error(`${label}[${index}] must be pair ${expectedPair}; received ${trial.pair}.`);
    }
  }
}

function validateTrial(trial, label) {
  if (!trial || typeof trial !== "object") {
    throw new Error(`${label} must be a trial object.`);
  }
  if (!Number.isInteger(trial.pair) || trial.pair <= 0) {
    throw new Error(`${label}.pair must be a positive integer.`);
  }

  const p95Ms = trial.statistics?.frame?.p95Ms;
  if (!Number.isFinite(p95Ms) || p95Ms < 0) {
    throw new Error(`${label}.statistics.frame.p95Ms must be a non-negative finite number.`);
  }

  const samples = trial.stopped?.frameSamples;
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error(`${label}.stopped.frameSamples must be a non-empty array.`);
  }
  if (samples.some((sample) => !Number.isFinite(sample) || sample < 0)) {
    throw new Error(`${label}.stopped.frameSamples must contain only non-negative finite numbers.`);
  }
}

function exceedsRegressionThreshold(base, after) {
  const scaledAfter = after * 100;
  const scaledThreshold = base * (100 + REGRESSION_THRESHOLD_PERCENT);
  const tolerance = Number.EPSILON
    * Math.max(1, Math.abs(scaledAfter), Math.abs(scaledThreshold))
    * 8;
  return scaledAfter - scaledThreshold > tolerance;
}

function nearestRank(values, percentile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * percentile) - 1];
}

function listArtifactNames(root) {
  const names = [];

  function walk(relativeDirectory) {
    const absoluteDirectory = path.join(root, relativeDirectory);
    const entries = readdirSync(absoluteDirectory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const relativeName = path.join(relativeDirectory, entry.name);
      if (relativeDirectory === "" && entry.name === MANIFEST_NAME) continue;
      if (entry.isSymbolicLink()) {
        throw new Error(`Checksum artifacts may not be symbolic links: ${relativeName}`);
      }
      if (entry.isDirectory()) {
        walk(relativeName);
      } else if (entry.isFile()) {
        names.push(relativeName.split(path.sep).join("/"));
      } else {
        throw new Error(`Unsupported checksum artifact type: ${relativeName}`);
      }
    }
  }

  walk("");
  return names.sort();
}

function parseManifest(manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Checksum manifest is invalid JSON: ${error.message}`);
  }
  if (!Array.isArray(manifest)) {
    throw new Error("Checksum manifest must be an array.");
  }

  const names = new Set();
  for (const [index, record] of manifest.entries()) {
    if (!record || typeof record !== "object" || typeof record.name !== "string") {
      throw new Error(`Checksum manifest record ${index} is invalid.`);
    }
    if (names.has(record.name)) {
      throw new Error(`Checksum manifest contains duplicate artifact ${record.name}.`);
    }
    names.add(record.name);
    if (!/^[a-f0-9]{64}$/.test(record.sha256)) {
      throw new Error(`Checksum manifest hash for ${record.name} is invalid.`);
    }
  }
  return manifest;
}

function readArtifact(directory, name) {
  return readFileSync(path.join(directory, ...name.split("/")));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
