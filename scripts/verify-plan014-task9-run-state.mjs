import assert from "node:assert/strict";
import path from "node:path";
import {
  TASK9_LEDGER_SCHEMA_VERSION,
  TASK9_RUNNER_CONTRACT_VERSION,
  TASK9_STORAGE_HANDOFF_CONTRACT_VERSION,
  assertCompatibleTask9Ledger,
  createTask9RunIdentity,
  resolveTask9RunDirectory
} from "./lib/plan014-task9-run-state.mjs";

const artifactRoot = "/evidence/plan014-task9";
const runId = "reviewed-b3947cd-run-001";
const sourceCommit = "b3947cdca6895cf0bdfc0bf3c899c13e9e70b533";
const runDirectory = resolveTask9RunDirectory(artifactRoot, runId);
const runIdentity = createTask9RunIdentity({ sourceCommit, runId });
const storageStatePath = path.join(runDirectory, "storage-state-segment-0001.json");
const compatibleLedger = {
  schemaVersion: TASK9_LEDGER_SCHEMA_VERSION,
  runIdentity,
  seed: "ai-staged-pressure",
  viewport: { width: 1280, height: 720 },
  saveSlot: 1,
  acceptedSegment: 1,
  acceptedCheckpoint: { runId, storageStatePath },
  attempts: [{ id: 1, runId, status: "accepted" }]
};

assert.equal(runDirectory, "/evidence/plan014-task9/runs/reviewed-b3947cd-run-001", "a run ID must map deterministically beneath the external artifact root");
assert.deepEqual(runIdentity, {
  sourceCommit,
  runnerContractVersion: TASK9_RUNNER_CONTRACT_VERSION,
  storageHandoffContractVersion: TASK9_STORAGE_HANDOFF_CONTRACT_VERSION,
  runId
}, "fresh-run identity must carry every immutable compatibility field");
assert.doesNotThrow(
  () => assertCompatibleTask9Ledger(compatibleLedger, { runIdentity, runDirectory, storageStateExists: (candidate) => candidate === storageStatePath }),
  "an exact identity and same-run artifact may resume"
);

assert.throws(
  () => assertCompatibleTask9Ledger({ ...compatibleLedger, schemaVersion: 3 }, { runIdentity, runDirectory, storageStateExists: () => true }),
  /ledger schema mismatch/,
  "a pre-fix schema-3 ledger must be non-resumable"
);
assert.throws(
  () => assertCompatibleTask9Ledger({ ...compatibleLedger, runIdentity: { ...runIdentity, sourceCommit: "e3de1b485b4c07490f4b4c3f640acbf6d2bfdb1c" } }, { runIdentity, runDirectory, storageStateExists: () => true }),
  /source commit mismatch/,
  "evidence from another commit must be non-resumable"
);
assert.throws(
  () => assertCompatibleTask9Ledger({ ...compatibleLedger, runIdentity: { ...runIdentity, runnerContractVersion: TASK9_RUNNER_CONTRACT_VERSION - 1 } }, { runIdentity, runDirectory, storageStateExists: () => true }),
  /runner contract mismatch/,
  "evidence from another runner contract must be non-resumable"
);
assert.throws(
  () => assertCompatibleTask9Ledger({ ...compatibleLedger, runIdentity: { ...runIdentity, storageHandoffContractVersion: TASK9_STORAGE_HANDOFF_CONTRACT_VERSION - 1 } }, { runIdentity, runDirectory, storageStateExists: () => true }),
  /storage handoff contract mismatch/,
  "evidence from another storage contract must be non-resumable"
);
assert.throws(
  () => assertCompatibleTask9Ledger({ ...compatibleLedger, runIdentity: { ...runIdentity, runId: "another-run" } }, { runIdentity, runDirectory, storageStateExists: () => true }),
  /run id mismatch/,
  "evidence from another explicit run must be non-resumable"
);
assert.throws(
  () => assertCompatibleTask9Ledger({ ...compatibleLedger, acceptedCheckpoint: { ...compatibleLedger.acceptedCheckpoint, runId: "another-run" } }, { runIdentity, runDirectory, storageStateExists: () => true }),
  /checkpoint run id mismatch/,
  "a checkpoint cannot be mixed into another run ledger"
);
assert.throws(
  () => assertCompatibleTask9Ledger({ ...compatibleLedger, acceptedCheckpoint: { ...compatibleLedger.acceptedCheckpoint, storageStatePath: "/evidence/plan014-task9/runs/another-run/storage-state-segment-0001.json" } }, { runIdentity, runDirectory, storageStateExists: () => true }),
  /artifact path belongs to another run/,
  "a storage artifact cannot be mixed across run directories"
);
assert.throws(
  () => assertCompatibleTask9Ledger(compatibleLedger, { runIdentity, runDirectory, storageStateExists: () => false }),
  /storage state is missing/,
  "a compatible ledger cannot resume without its exact storage artifact"
);
assert.throws(() => resolveTask9RunDirectory(artifactRoot, "../escape"), /invalid Task 9 run id/, "run IDs cannot escape the artifact root");
assert.throws(() => resolveTask9RunDirectory(artifactRoot, ""), /invalid Task 9 run id/, "fresh runs require an explicit non-empty run ID");

console.log("Plan 014 Task 9 run-state contract verified: fresh runs and compatible resumes cannot mix ledger or storage evidence.");
