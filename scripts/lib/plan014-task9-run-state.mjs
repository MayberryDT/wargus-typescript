import path from "node:path";

export const TASK9_LEDGER_SCHEMA_VERSION = 4;
export const TASK9_RUNNER_CONTRACT_VERSION = 1;
export const TASK9_STORAGE_HANDOFF_CONTRACT_VERSION = 1;

const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const STORAGE_STATE_PATTERN = /^storage-state-segment-\d{4}\.json$/;

export function resolveTask9RunDirectory(artifactRoot, runId) {
  if (!RUN_ID_PATTERN.test(runId)) throw new Error(`invalid Task 9 run id: ${runId || "<empty>"}`);
  return path.join(path.resolve(artifactRoot), "runs", runId);
}

export function createTask9RunIdentity({ sourceCommit, runId }) {
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw new Error(`invalid Task 9 source commit: ${sourceCommit}`);
  resolveTask9RunDirectory("/task9-artifact-root", runId);
  return Object.freeze({
    sourceCommit,
    runnerContractVersion: TASK9_RUNNER_CONTRACT_VERSION,
    storageHandoffContractVersion: TASK9_STORAGE_HANDOFF_CONTRACT_VERSION,
    runId
  });
}

export function assertCompatibleTask9Ledger(ledger, { runIdentity, runDirectory, storageStateExists }) {
  if (ledger?.schemaVersion !== TASK9_LEDGER_SCHEMA_VERSION) {
    throw new Error(`Task 9 ledger schema mismatch: expected ${TASK9_LEDGER_SCHEMA_VERSION}, found ${ledger?.schemaVersion ?? "missing"}.`);
  }
  if (ledger.runIdentity?.sourceCommit !== runIdentity.sourceCommit) {
    throw new Error(`Task 9 source commit mismatch: expected ${runIdentity.sourceCommit}, found ${ledger.runIdentity?.sourceCommit ?? "missing"}.`);
  }
  if (ledger.runIdentity?.runnerContractVersion !== runIdentity.runnerContractVersion) {
    throw new Error(`Task 9 runner contract mismatch: expected ${runIdentity.runnerContractVersion}, found ${ledger.runIdentity?.runnerContractVersion ?? "missing"}.`);
  }
  if (ledger.runIdentity?.storageHandoffContractVersion !== runIdentity.storageHandoffContractVersion) {
    throw new Error(`Task 9 storage handoff contract mismatch: expected ${runIdentity.storageHandoffContractVersion}, found ${ledger.runIdentity?.storageHandoffContractVersion ?? "missing"}.`);
  }
  if (ledger.runIdentity?.runId !== runIdentity.runId) {
    throw new Error(`Task 9 run id mismatch: expected ${runIdentity.runId}, found ${ledger.runIdentity?.runId ?? "missing"}.`);
  }
  for (const attempt of ledger.attempts ?? []) {
    if (attempt.runId !== runIdentity.runId) {
      throw new Error(`Task 9 attempt run id mismatch: expected ${runIdentity.runId}, found ${attempt.runId ?? "missing"}.`);
    }
  }

  const checkpoint = ledger.acceptedCheckpoint;
  if (!checkpoint) return ledger;
  if (checkpoint.runId !== runIdentity.runId) {
    throw new Error(`Task 9 checkpoint run id mismatch: expected ${runIdentity.runId}, found ${checkpoint.runId ?? "missing"}.`);
  }
  const resolvedRunDirectory = path.resolve(runDirectory);
  const resolvedStorageState = path.resolve(checkpoint.storageStatePath ?? "");
  if (path.dirname(resolvedStorageState) !== resolvedRunDirectory || !STORAGE_STATE_PATTERN.test(path.basename(resolvedStorageState))) {
    throw new Error(`Task 9 checkpoint artifact path belongs to another run: ${checkpoint.storageStatePath ?? "missing"}.`);
  }
  if (!storageStateExists(resolvedStorageState)) {
    throw new Error(`Task 9 checkpoint storage state is missing: ${resolvedStorageState}.`);
  }
  return ledger;
}
