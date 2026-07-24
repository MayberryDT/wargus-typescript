import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { rebaseCheckpointStorageState } from "./lib/plan014-task9-storage-state.mjs";

const saveSlotKey = "wargus-ts-save-slot-v1-1";
const sourceOrigin = "http://127.0.0.1:56201";
const targetOrigin = "http://127.0.0.1:56202";
const rawSlot = JSON.stringify({
  mapPath: "maps/ladder/Garden of war BNE.pud.smp.gz",
  world: { tick: 60, visibilityPlayer: 0 }
});
const rawSha256 = createHash("sha256").update(rawSlot).digest("hex");
const captured = {
  cookies: [],
  origins: [{
    origin: sourceOrigin,
    localStorage: [
      { name: saveSlotKey, value: rawSlot },
      { name: "unrelated", value: "preserved" }
    ]
  }]
};
const originalJson = JSON.stringify(captured);

const handoff = rebaseCheckpointStorageState(captured, {
  targetOrigin,
  expectedSourceOrigin: sourceOrigin,
  saveSlotKey,
  expectedRawSha256: rawSha256
});

assert.equal(JSON.stringify(captured), originalJson, "captured storageState must remain immutable");
assert.equal(handoff.rawSlot, rawSlot, "visible F11 slot payload must survive the JSON handoff byte-for-byte");
assert.equal(handoff.storageState.origins.length, 1, "handoff must preserve one source origin");
assert.equal(handoff.storageState.origins[0].origin, targetOrigin, "handoff must scope the slot to the next unique-port origin");
assert.deepEqual(handoff.storageState.origins[0].localStorage, captured.origins[0].localStorage, "handoff must preserve localStorage entries exactly");
assert.equal(createHash("sha256").update(handoff.rawSlot).digest("hex"), rawSha256, "handoff slot must retain the accepted exact-slot identity");

assert.throws(
  () => rebaseCheckpointStorageState({ cookies: [], origins: [] }, { targetOrigin, expectedSourceOrigin: sourceOrigin, saveSlotKey, expectedRawSha256: rawSha256 }),
  /exactly one captured origin/,
  "handoff must reject a missing captured origin"
);
assert.throws(
  () => rebaseCheckpointStorageState({
    ...captured,
    origins: [{ ...captured.origins[0], localStorage: [] }]
  }, { targetOrigin, expectedSourceOrigin: sourceOrigin, saveSlotKey, expectedRawSha256: rawSha256 }),
  /exactly one captured save slot/,
  "handoff must refuse to fabricate a missing F11 slot"
);
assert.throws(
  () => rebaseCheckpointStorageState(captured, { targetOrigin, expectedSourceOrigin: sourceOrigin, saveSlotKey, expectedRawSha256: "0".repeat(64) }),
  /identity mismatch/,
  "handoff must reject a slot that differs from the accepted checkpoint"
);
assert.throws(
  () => rebaseCheckpointStorageState({
    ...captured,
    origins: [...captured.origins, { origin: "https://unexpected.example", localStorage: [] }]
  }, { targetOrigin, expectedSourceOrigin: sourceOrigin, saveSlotKey, expectedRawSha256: rawSha256 }),
  /exactly one captured origin/,
  "handoff must reject additional captured origins"
);
assert.throws(
  () => rebaseCheckpointStorageState({
    ...captured,
    origins: [{ ...captured.origins[0], origin: "http://127.0.0.1:59999" }]
  }, { targetOrigin, expectedSourceOrigin: sourceOrigin, saveSlotKey, expectedRawSha256: rawSha256 }),
  /unexpected origin/,
  "handoff must reject a captured origin that does not match the accepted checkpoint port"
);

console.log("Plan 014 Task 9 storageState handoff contract verified: visible F11 slot survives exact-identity origin rebasing before visible F12.");
