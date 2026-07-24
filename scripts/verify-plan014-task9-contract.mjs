import { existsSync, readFileSync } from "node:fs";

const runnerPath = "scripts/verify-browser-plan014-task9.mjs";
const pureContractPath = "scripts/lib/plan014-task9-contract.mjs";
const productionScoutProvenancePath = "src/wargus/scoutProvenance.mjs";
const failures = [];

function requireFile(path, label) {
  if (!existsSync(path)) {
    failures.push(`${label} is missing: ${path}`);
    return "";
  }
  return readFileSync(path, "utf8");
}

function expectIncludes(label, source, fragments) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      failures.push(`${label} missing contract fragment: ${fragment}`);
    }
  }
}

function expectExcludes(label, source, fragments) {
  for (const fragment of fragments) {
    if (source.includes(fragment)) {
      failures.push(`${label} contains forbidden fragment: ${fragment}`);
    }
  }
}

function expectMatches(label, source, pattern) {
  if (!pattern.test(source)) failures.push(`${label}: expected semantic source relationship ${pattern}`);
}

function expectEqual(label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function expectThrows(label, action, expectedMessage) {
  try {
    action();
    failures.push(`${label}: expected an exception`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(expectedMessage)) failures.push(`${label}: unexpected exception ${message}`);
  }
}

function expectFunction(label, value) {
  if (typeof value !== "function") {
    failures.push(`${label}: expected a function`);
    return false;
  }
  return true;
}

function expectEveryCallHasMultipleArguments(label, source, functionName) {
  const calls = [...source.matchAll(new RegExp(`${functionName}\\(([^)]*)\\)`, "g"))];
  if (calls.length === 0) {
    failures.push(`${label}: found no ${functionName} calls`);
    return;
  }
  for (const call of calls) {
    if (!call[1].includes(",")) failures.push(`${label}: unbounded call ${call[0]}`);
  }
}

const runner = requireFile(runnerPath, "Plan 014 Task 9 runner");
const packageSource = requireFile("package.json", "package manifest");
const hudSource = requireFile("src/view/renderHud.ts", "HUD source");
const mainSource = requireFile("src/main.ts", "browser smoke source");
const ordersSource = requireFile("src/simulation/orders.ts", "AI evidence source");
const saveSource = requireFile("src/wargus/saveGame.ts", "save/load source");
let pureContract = null;
if (!existsSync(pureContractPath)) {
  failures.push(`Task 9 pure semantic contract is missing: ${pureContractPath}`);
} else {
  pureContract = await import(`../${pureContractPath}`);
}
let productionScoutProvenance = null;
if (!existsSync(productionScoutProvenancePath)) {
  failures.push(`production scout provenance normalizer is missing: ${productionScoutProvenancePath}`);
} else {
  productionScoutProvenance = await import(`../${productionScoutProvenancePath}`);
}

expectIncludes("package manifest", packageSource, [
  '"verify:browser-plan014-task9": "node scripts/verify-browser-plan014-task9.mjs"',
  '"verify:plan014-task9-contract": "node scripts/verify-plan014-task9-contract.mjs"'
]);

expectIncludes("Task 9 runner fixed scenario", runner, [
  'const DEMO_SEED = "ai-staged-pressure"',
  'const VIEWPORT = { width: 1280, height: 720 }',
  "const PAGE_LIMIT_MS = 25_000",
  "const SEGMENT_LIMIT_MS = 30_000",
  "WARGUS_PLAN014_TASK9_ARTIFACT_DIR",
  "WARGUS_PLAN014_TASK9_MAX_SEGMENTS",
  "assertArtifactDirectoryOutsideRepo",
  "--strictPort",
  '"preview"',
  "chromium.executablePath()",
  "process.env.CHROME_BIN",
  "chromium.launchServer",
  "browser.newContext",
  "storageState:",
  "context.storageState",
  "context.pages().length !== 1",
  "processTreePids",
  "stopExactPids",
  "isPortOpen",
  "port-clear"
]);

expectIncludes("Task 9 hard segment timing integration", runner, [
  "deriveSegmentTiming",
  "pageWorkDeadline",
  "boundedAwaitMs",
  "timing.cleanupStartAt",
  "timing.completionDeadline",
  "requestForcedCleanup",
  "including exact cleanup"
]);
expectIncludes("Task 9 bounded startup failure capture", runner, [
  "server.once(\"error\"",
  "serverSpawnError",
  "Vite preview failed to spawn"
]);
expectIncludes("Task 9 abortable readiness and bounded process discovery", runner, [
  "waitForHttp(url, timing.cleanupStartAt",
  "fetchBeforeDeadline(url, deadline, 400, \"preview readiness probe\")",
  "boundedExecFileSyncOptions",
  "timeout: execOptions.timeout",
  "maxBuffer: execOptions.maxBuffer",
  "killSignal: \"SIGKILL\"",
  "process-tree discovery failed",
  "runError ??="
]);
expectExcludes("Task 9 raw readiness fetch", runner, [
  "const response = await fetch(url);"
]);
expectEveryCallHasMultipleArguments("Task 9 process-tree deadline propagation", runner, "processTreePids");
expectMatches("explicit cleanup disarms watchdogs before final audit", runner, /catch \(error\) \{[\s\S]*?runError = error;[\s\S]*?\}\s*clearTimeout\(cleanupTimer\);\s*clearTimeout\(completionTimer\);[\s\S]*?const closePromises/);
expectIncludes("Task 9 truthful duration proof", runner, [
  "const durationRelation = attemptAudit.segmentWallMs < SEGMENT_LIMIT_MS ? \"<\" : \">=\"",
  "${attemptAudit.segmentWallMs}ms ${durationRelation} ${SEGMENT_LIMIT_MS}ms"
]);

if (pureContract) {
  const timing = pureContract.deriveSegmentTiming(1_000, {
    segmentLimitMs: 30_000,
    cleanupReserveMs: 5_000,
    returnMarginMs: 1_000
  });
  expectEqual("hard timing external deadline", timing.externalDeadline, 31_000);
  expectEqual("hard timing completion deadline", timing.completionDeadline, 30_000);
  expectEqual("hard timing forced cleanup start", timing.cleanupStartAt, 25_000);
  expectEqual("page work ends before cleanup", pureContract.pageWorkDeadline(2_000, 25_000, timing), 25_000);
  expectEqual("startup await is bounded by cleanup", pureContract.boundedAwaitMs(timing.cleanupStartAt, 20_000, 10_000), 5_000);
  expectThrows("startup await refuses exhausted budget", () => pureContract.boundedAwaitMs(timing.cleanupStartAt, timing.cleanupStartAt, 10_000), "deadline exhausted");
  if (expectFunction("bounded subprocess option builder", pureContract.boundedExecFileSyncOptions)) {
    const execOptions = pureContract.boundedExecFileSyncOptions(25_000, 24_000, { maximumMs: 750, maxBuffer: 1_048_576 });
    expectEqual("bounded subprocess timeout", execOptions.timeout, 750);
    expectEqual("bounded subprocess maxBuffer", execOptions.maxBuffer, 1_048_576);
    expectEqual("bounded subprocess kill signal", execOptions.killSignal, "SIGKILL");
    expectThrows("bounded subprocess refuses exhausted deadline", () => pureContract.boundedExecFileSyncOptions(25_000, 25_000, { maximumMs: 750, maxBuffer: 1_048_576 }), "deadline exhausted");
  }
}

expectIncludes("Task 9 scout provenance integration", runner, [
  "validateScoutDestinationProvenance",
  "acceptedScout",
  "revalidateLoadedScoutProvenance",
  "assertScoutProvenancePresentAtCheckpoint",
  "loadValidation",
  "post-F12 scout provenance revalidation"
]);
expectMatches("post-F12 scout revalidation precedes visible Run", runner, /assertLoadedCheckpoint\(state, checkpoint\.slotIdentity\);\s*revalidateLoadedScoutProvenance\(state, candidateLedger\);[\s\S]*?clickMapControl\(page, "toggle-pause", pageDeadline, "Run"\)/);
expectMatches("scout provenance must be present in the saved checkpoint", runner, /state = await pauseVisibly[\s\S]*?assertScoutProvenancePresentAtCheckpoint\(state, candidateLedger\);[\s\S]*?page\.keyboard\.press\("F11"\)/);

expectIncludes("AI scout assignment provenance", ordersSource, [
  "assignmentTick",
  "assignmentPlayer",
  "assignmentTargetTileIndex",
  "assignmentMapWidth",
  "assignmentMapHeight",
  "assignmentTileSize",
  "ownerBufferValueAtAssignment",
  "visibilityPlayerAtAssignment",
  "visibilityBufferValueAtAssignment",
  "selectedFromOwnerUnexploredAtAssignment"
]);

expectIncludes("scout provenance save/load", saveSource, [
  'import { normalizeScoutAssignmentProvenance } from "./scoutProvenance.mjs"',
  "...normalizeScoutAssignmentProvenance(record)"
]);

if (pureContract && expectFunction("scout provenance validator", pureContract.validateScoutDestinationProvenance)) {
  const scout = {
    unitId: "ai-scout-1",
    targetX: 336,
    targetY: 400,
    assignmentTick: 120,
    assignmentPlayer: 1,
    assignmentTargetTileX: 10,
    assignmentTargetTileY: 12,
    assignmentTargetTileIndex: 394,
    assignmentMapWidth: 32,
    assignmentMapHeight: 32,
    assignmentTileSize: 32,
    ownerBufferValueAtAssignment: 0,
    visibilityPlayerAtAssignment: 0,
    visibilityBufferValueAtAssignment: 1,
    selectedFromOwnerUnexploredAtAssignment: true
  };
  const acceptedScout = pureContract.validateScoutDestinationProvenance(scout, { expectedPlayer: 1, observationTick: 145 });
  expectEqual("scout provenance preserves exact target index", acceptedScout.assignmentTargetTileIndex, 394);
  expectThrows("scout provenance rejects another player's buffer", () => pureContract.validateScoutDestinationProvenance({ ...scout, assignmentPlayer: 0 }, { expectedPlayer: 1, observationTick: 145 }), "assignment player");
  expectThrows("scout provenance rejects explored owner tile", () => pureContract.validateScoutDestinationProvenance({ ...scout, ownerBufferValueAtAssignment: 1 }, { expectedPlayer: 1, observationTick: 145 }), "owner buffer byte");
  expectThrows("scout provenance rejects inconsistent tile membership", () => pureContract.validateScoutDestinationProvenance({ ...scout, assignmentTargetTileIndex: 395 }, { expectedPlayer: 1, observationTick: 145 }), "tile index");
  expectThrows("scout provenance rejects zero-width membership", () => pureContract.validateScoutDestinationProvenance({ ...scout, assignmentMapWidth: 0, assignmentTargetTileIndex: 10 }, { expectedPlayer: 1, observationTick: 145 }), "map width");
  expectThrows("scout provenance rejects mismatched live coordinates", () => pureContract.validateScoutDestinationProvenance({ ...scout, targetX: 9999, targetY: 7777 }, { expectedPlayer: 1, observationTick: 145 }), "target coordinates");
  expectThrows("scout provenance rejects tile X outside map", () => pureContract.validateScoutDestinationProvenance({ ...scout, assignmentTargetTileX: 32, assignmentTargetTileIndex: 416 }, { expectedPlayer: 1, observationTick: 145 }), "tile bounds");
  expectThrows("scout provenance rejects tile Y outside map", () => pureContract.validateScoutDestinationProvenance({ ...scout, assignmentTargetTileY: 32, assignmentTargetTileIndex: 1034 }, { expectedPlayer: 1, observationTick: 145 }), "tile bounds");
  if (productionScoutProvenance && expectFunction("production scout provenance normalizer", productionScoutProvenance.normalizeScoutAssignmentProvenance)) {
    const serialized = JSON.parse(JSON.stringify(scout));
    const restored = productionScoutProvenance.normalizeScoutAssignmentProvenance(serialized);
    const expectedRoundTrip = Object.fromEntries(Object.keys(restored).map((key) => [key, scout[key]]));
    expectEqual("production scout provenance save/restore round trip", JSON.stringify(restored), JSON.stringify(expectedRoundTrip));
  }
}

expectIncludes("Task 9 launch/contact causality integration", runner, [
  "const LEDGER_SCHEMA_VERSION = 3",
  "correlateNextPressureContact",
  "pressureContacts",
  "first 1-unit launch contact",
  "second 4-unit launch contact",
  "third 16-unit launch contact"
]);

expectIncludes("AI attacker contact evidence", ordersSource, [
  "attackerId: unit.id",
  "observedTick: world.tick",
  "visibilityPlayerContactOrders"
]);

if (pureContract && expectFunction("pressure contact correlator", pureContract.correlateNextPressureContact)) {
  const launches = [
    { ordinal: 1, launchedTick: 100, unitIds: ["wave-1"] },
    { ordinal: 2, launchedTick: 200, unitIds: ["wave-2a", "wave-2b", "wave-2c", "wave-2d"] },
    { ordinal: 3, launchedTick: 300, unitIds: Array.from({ length: 16 }, (_, index) => `wave-3-${index}`) }
  ];
  const firstContact = pureContract.correlateNextPressureContact({
    launches,
    acceptedContacts: [],
    candidateOrders: [
      { attackerId: "unrelated-worker", targetId: "player-hall", orderKind: "attack", observedTick: 150 },
      { attackerId: "wave-1", targetId: "player-hall", orderKind: "attack", observedTick: 150 }
    ],
    observationTick: 150
  });
  expectEqual("first pressure contact attacker", firstContact?.attackerId, "wave-1");
  const secondContact = pureContract.correlateNextPressureContact({
    launches,
    acceptedContacts: [firstContact],
    candidateOrders: [{ attackerId: "wave-2c", targetId: "player-footman", orderKind: "attack-move", observedTick: 225 }],
    observationTick: 225
  });
  expectEqual("second pressure contact launch ordinal", secondContact?.launchOrdinal, 2);
  expectEqual("same-tick contact cannot collapse pressure ordering", pureContract.correlateNextPressureContact({
    launches,
    acceptedContacts: [firstContact],
    candidateOrders: [{ attackerId: "wave-2a", targetId: "player-hall", orderKind: "attack", observedTick: 150 }],
    observationTick: 150
  }), null);
  expectEqual("unrelated attacker cannot satisfy next launch", pureContract.correlateNextPressureContact({
    launches,
    acceptedContacts: [firstContact, secondContact],
    candidateOrders: [{ attackerId: "unrelated-scout", targetId: "player-hall", orderKind: "attack", observedTick: 350 }],
    observationTick: 350
  }), null);
  expectThrows("pressure launches reject reused unit ids", () => pureContract.correlateNextPressureContact({
    launches: [launches[0], { ...launches[1], unitIds: ["wave-1", "wave-2b", "wave-2c", "wave-2d"] }],
    acceptedContacts: [firstContact],
    candidateOrders: [],
    observationTick: 225
  }), "reused launch unit id");
}

expectIncludes("Task 9 attempt cleanup audit integration", runner, [
  "SegmentAttemptError",
  "finalizeAttemptAudit",
  "ownedServerPids",
  "ownedBrowserPids",
  "terminationAttempts",
  "listenerClear",
  "cleanupStatus",
  "remainingPids",
  "selectedPort"
]);

expectMatches("failed attempt audit is atomically written", runner, /catch \(error\) \{[\s\S]*?const attemptAudit = [\s\S]*?finishAttempt\(ledger, attemptId, \{[\s\S]*?status: "failed"[\s\S]*?\.\.\.attemptAudit[\s\S]*?\}\);[\s\S]*?writeLedger\(ledger\);[\s\S]*?throw error;/);
expectMatches("accepted attempt stores the same cleanup audit", runner, /finishAttempt\(ledger, attemptId, \{[\s\S]*?status: "accepted"[\s\S]*?\.\.\.result\.attemptAudit[\s\S]*?\}\);/);

if (pureContract && expectFunction("attempt cleanup audit finalizer", pureContract.finalizeAttemptAudit)) {
  const completeAudit = pureContract.finalizeAttemptAudit({
    selectedPort: 55_101,
    serverPid: 700,
    browserPid: 800,
    ownedServerPids: [701, 700],
    ownedBrowserPids: [802, 800, 801],
    terminationAttempts: [
      { requestedPids: [701, 700], termSignaledPids: [701], killSignaledPids: [], stoppedPids: [700, 701], remainingPids: [] },
      { requestedPids: [802, 801, 800], termSignaledPids: [802, 801], killSignaledPids: [800], stoppedPids: [800, 801, 802], remainingPids: [] }
    ],
    listenerClear: { port: 55_101, clear: true, checkedAtMs: 29_100, error: null },
    cleanupForced: true,
    cleanupReasons: ["reserved cleanup deadline reached"],
    cleanupErrors: [],
    cleanupStartedAtMs: 24_000,
    cleanupFinishedAtMs: 29_100,
    segmentStartedAtMs: 0,
    segmentFinishedAtMs: 29_100
  });
  expectEqual("cleanup audit owns every PID", JSON.stringify(completeAudit.ownedPids), JSON.stringify([700, 701, 800, 801, 802]));
  expectEqual("cleanup audit proves every PID stopped", JSON.stringify(completeAudit.stoppedPids), JSON.stringify([700, 701, 800, 801, 802]));
  expectEqual("cleanup audit proves listener clear", completeAudit.listenerClear.clear, true);
  expectEqual("cleanup audit status complete", completeAudit.cleanupStatus, "complete");
  expectEqual("cleanup audit wall duration", completeAudit.segmentWallMs, 29_100);

  const startupFailureAudit = pureContract.finalizeAttemptAudit({
    selectedPort: 55_102,
    serverPid: 900,
    browserPid: null,
    ownedServerPids: [900],
    ownedBrowserPids: [],
    terminationAttempts: [{ requestedPids: [900], termSignaledPids: [900], killSignaledPids: [], stoppedPids: [900], remainingPids: [] }],
    listenerClear: { port: 55_102, clear: true, checkedAtMs: 500, error: null },
    cleanupForced: false,
    cleanupReasons: ["startup failure"],
    cleanupErrors: [],
    cleanupStartedAtMs: 400,
    cleanupFinishedAtMs: 500,
    segmentStartedAtMs: 0,
    segmentFinishedAtMs: 500
  });
  expectEqual("startup failure audit retains server root", startupFailureAudit.serverPid, 900);
  expectEqual("startup failure audit records absent browser root", startupFailureAudit.browserPid, null);
  expectEqual("startup failure audit retains selected port", startupFailureAudit.selectedPort, 55_102);

  const incompleteAudit = pureContract.finalizeAttemptAudit({
    selectedPort: 55_103,
    serverPid: 901,
    browserPid: null,
    ownedServerPids: [901],
    ownedBrowserPids: [],
    terminationAttempts: [{ requestedPids: [901], termSignaledPids: [901], killSignaledPids: [901], stoppedPids: [], remainingPids: [901] }],
    listenerClear: { port: 55_103, clear: false, checkedAtMs: 29_000, error: "still listening" },
    cleanupForced: true,
    cleanupReasons: ["completion deadline reached"],
    cleanupErrors: ["still listening"],
    cleanupStartedAtMs: 24_000,
    cleanupFinishedAtMs: 29_000,
    segmentStartedAtMs: 0,
    segmentFinishedAtMs: 29_000
  });
  expectEqual("incomplete cleanup remains auditable", incompleteAudit.cleanupStatus, "incomplete");
  expectEqual("incomplete cleanup retains remaining PID", JSON.stringify(incompleteAudit.remainingPids), JSON.stringify([901]));
  expectEqual("incomplete cleanup retains failed listener proof", incompleteAudit.listenerClear.clear, false);
}

expectIncludes("Task 9 visible input", runner, [
  'page.keyboard.press("F10")',
  'page.keyboard.press("F11")',
  'page.keyboard.press("F12")',
  "page.mouse.click",
  '"game-options"',
  '"speed-options"',
  '"easier-ai"',
  '"harder-ai"',
  '"speed-options-ok"',
  '"toggle-pause"',
  '"slower-game"',
  '"faster-game"',
  '"build-basic-page"',
  '"source-build:unit-town-hall"',
  '"source-build:unit-farm"',
  '"source-build:unit-human-barracks"',
  '"source-train:unit-footman"',
  "menuButtonControls",
  "mapButtonControls",
  "commandButtons",
  "ownedUnitScreenPoints"
]);

expectIncludes("Task 9 checkpoint protocol", runner, [
  "wargus-ts-save-slot-v1-1",
  "readSaveSlot",
  "slotIdentity",
  "assertSlotIdentity",
  "assertLoadedCheckpoint",
  "saveAcceptedCheckpoint",
  "acceptedCheckpoint",
  "acceptedSegment",
  "storageStatePath",
  "candidateLedger",
  "checkpointTick",
  "visibilityPlayerUnitRecords",
  "sourceGameSpeedDefault",
  "visibilityPlayerResources",
  "paused === true",
  "Interrupted before accepted F11 save"
]);

expectIncludes("Task 9 M08/M09 evidence", runner, [
  "const DIFFICULTY_SEQUENCE = [1, 2, 3, 4, 5, 3]",
  "const EXPECTED_DIFFICULTY_FACTORS = new Map",
  "const EXPECTED_LAUNCH_SIZES = [1, 4, 16]",
  "difficulty 2 produced 1/3/15",
  "source-neutral difficulty 3",
  "pendingBuildOrders",
  "constructions",
  "productionQueues",
  "scoutDestinations",
  "visibilityPlayerDamagedUnits",
  "visibilityPlayerContactOrders",
  "averageUpdateMs",
  "averageRenderMs",
  "unmetMilestone"
]);

expectExcludes("Task 9 runner hidden mutation surface", runner, [
  "__WARGUS_TS_EXECUTE_HUD_COMMAND__",
  "__WARGUS_TS_ISSUE_PENDING_WORLD_COMMAND_AT__",
  "__WARGUS_TS_LOAD_MAP__",
  "__WARGUS_TS_RUN_",
  "executeMapCommand(",
  "executeHudCommand(",
  "localStorage.setItem",
  "localStorage.removeItem",
  "localStorage.clear",
  "pkill",
  "killall",
  "lsof -t",
  "fuser -k"
]);

expectIncludes("HUD rendered menu debug", hudSource, [
  "menuOverlay: HudMenuOverlayId | null",
  "menuButtonControls: Array<HudRect & {",
  "const MAX_MENU_BUTTON_CONTROLS = 64",
  "debug.menuOverlay = menu",
  "debug.menuButtonControls.push({",
  "id: button.command as HudMapCommandId",
  "disabled: button.disabled === true"
]);

expectIncludes("browser smoke checkpoint identity", mainSource, [
  "aiDifficulty: number | null",
  "tickRate: number | null",
  "tileSize: number | null",
  "visibilityPlayerUnitRecords: BrowserSmokeUnitRecord[]",
  "browserSmokeVisibilityPlayerUnitRecords()",
  "aiDifficulty: world?.engineSettings.lastDifficultyDefault ?? null"
]);

expectIncludes("AI contact evidence", ordersSource, [
  "visibilityPlayerDamagedUnits",
  "visibilityPlayerContactOrders",
  ".slice(0, 64)"
]);

if (failures.length > 0) {
  console.error(`Plan 014 Task 9 static contract failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Plan 014 Task 9 static contract verified (visible input, segmented save/load, bounded evidence, exact cleanup, no hidden mutation hooks).");
