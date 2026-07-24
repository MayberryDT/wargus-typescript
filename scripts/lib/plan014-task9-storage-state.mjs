import { createHash } from "node:crypto";

export function rebaseCheckpointStorageState(storageState, { targetOrigin, expectedSourceOrigin, saveSlotKey, expectedRawSha256 }) {
  if (storageState?.origins?.length !== 1) {
    throw new Error(`Checkpoint storageState must contain exactly one captured origin; found ${storageState?.origins?.length ?? 0}.`);
  }
  const normalizedSourceOrigin = new URL(expectedSourceOrigin).origin;
  if (storageState.origins[0].origin !== normalizedSourceOrigin) {
    throw new Error(`Checkpoint storageState has unexpected origin ${storageState.origins[0].origin}; expected ${normalizedSourceOrigin}.`);
  }

  const matches = [];
  for (const [originIndex, originState] of (storageState?.origins ?? []).entries()) {
    for (const entry of originState.localStorage ?? []) {
      if (entry.name === saveSlotKey) matches.push({ originIndex, entry });
    }
  }
  if (matches.length !== 1) {
    throw new Error(`Checkpoint storageState must contain exactly one captured save slot ${saveSlotKey}; found ${matches.length}.`);
  }

  const [{ originIndex, entry }] = matches;
  const rawSlot = entry.value;
  const actualRawSha256 = createHash("sha256").update(rawSlot).digest("hex");
  if (actualRawSha256 !== expectedRawSha256) {
    throw new Error(`Checkpoint storageState save-slot identity mismatch: expected ${expectedRawSha256}, found ${actualRawSha256}.`);
  }

  const rebased = structuredClone(storageState);
  rebased.origins[originIndex].origin = new URL(targetOrigin).origin;
  return { storageState: rebased, rawSlot };
}
