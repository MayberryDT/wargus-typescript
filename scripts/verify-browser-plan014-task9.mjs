import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import path from "node:path";
import { boundedAwaitMs, boundedExecFileSyncOptions, correlateNextPressureContact, deriveSegmentTiming, finalizeAttemptAudit, pageWorkDeadline, validateScoutDestinationProvenance } from "./lib/plan014-task9-contract.mjs";
import { rebaseCheckpointStorageState } from "./lib/plan014-task9-storage-state.mjs";

const DEMO_SEED = "ai-staged-pressure";
const VIEWPORT = { width: 1280, height: 720 };
const PAGE_LIMIT_MS = 25_000;
const SEGMENT_LIMIT_MS = 30_000;
const SEGMENT_CLEANUP_RESERVE_MS = 5_000;
const SEGMENT_RETURN_MARGIN_MS = 1_000;
const SAVE_SLOT = 1;
const SAVE_SLOT_KEY = "wargus-ts-save-slot-v1-1";
const EXPECTED_MAP_PATH = "maps/ladder/Garden of war BNE.pud.smp.gz";
const DIFFICULTY_SEQUENCE = [1, 2, 3, 4, 5, 3];
const EXPECTED_DIFFICULTY_FACTORS = new Map([[1, 0.75], [2, 1], [3, 1], [4, 1.2], [5, 1.5]]);
const EXPECTED_LAUNCH_SIZES = [1, 4, 16];
const REQUIRED_DEFENDERS = 4;
const LEDGER_SCHEMA_VERSION = 3;
const MAX_ATTEMPTS = 512;
const SERVER_MODE = "preview";
const PORT_BASE = boundedInteger(process.env.WARGUS_PLAN014_TASK9_PORT_BASE, 55_100, 10_240, 64_000);
const MAX_SEGMENTS = boundedInteger(process.env.WARGUS_PLAN014_TASK9_MAX_SEGMENTS, 96, 1, 256);
const ARTIFACT_DIR = path.resolve(process.env.WARGUS_PLAN014_TASK9_ARTIFACT_DIR ?? path.resolve(process.cwd(), "..", "Wargus-TypeScript-artifacts", "plan014-task9"));
const LEDGER_PATH = path.join(ARTIFACT_DIR, "checkpoint-ledger.json");
const LOCK_PATH = path.join(ARTIFACT_DIR, "runner.lock");

let ledger = null;
let lockFd = null;

class SegmentAttemptError extends Error {
  constructor(message, attemptAudit, cause) {
    super(message, { cause });
    this.name = "SegmentAttemptError";
    this.attemptAudit = attemptAudit;
  }
}

try {
  assertArtifactDirectoryOutsideRepo(ARTIFACT_DIR);
  if (!existsSync(path.join(process.cwd(), "dist", "index.html"))) {
    throw new Error("Production-honest Task 9 requires an existing dist/index.html; run npm run build before the browser runner.");
  }
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  lockFd = acquireLock();
  ledger = loadLedger();
  const { chromium } = await import("playwright");

  for (let segment = 0; segment < MAX_SEGMENTS && !ledger.completed; segment += 1) {
    const target = unmetMilestone(ledger);
    if (!target) {
      ledger.completed = true;
      writeLedger(ledger);
      break;
    }
    const port = await allocatePort(ledger);
    const attemptId = beginAttempt(ledger, port, target);
    const candidateLedger = structuredClone(ledger);
    try {
      const result = await runSegment({ chromium, port, attemptId, candidateLedger, checkpoint: ledger.acceptedCheckpoint });
      ledger = result.candidateLedger;
      finishAttempt(ledger, attemptId, {
        status: "accepted",
        pageWallMs: result.pageWallMs,
        ...result.attemptAudit
      });
      ledger.completed = unmetMilestone(ledger) === null;
      writeLedger(ledger);
      printAcceptedSegment(ledger, target, result);
    } catch (error) {
      const attemptAudit = error instanceof SegmentAttemptError
        ? error.attemptAudit
        : await emergencyAttemptAudit(port, error);
      finishAttempt(ledger, attemptId, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        ...attemptAudit
      });
      writeLedger(ledger);
      throw error;
    }
  }

  const remaining = unmetMilestone(ledger);
  if (remaining) {
    throw new Error(`Maximum ${MAX_SEGMENTS} segments reached; unmet milestone: ${remaining}`);
  }
  printSummary(ledger, true);
} catch (error) {
  if (ledger) printSummary(ledger, false);
  console.error(`Plan 014 Task 9 runner stopped without PASS: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  releaseLock(lockFd);
}

function createLedger() {
  return {
    schemaVersion: LEDGER_SCHEMA_VERSION,
    seed: DEMO_SEED,
    viewport: VIEWPORT,
    saveSlot: SAVE_SLOT,
    serverMode: SERVER_MODE,
    attemptSequence: 0,
    acceptedSegment: 0,
    acceptedCheckpoint: null,
    completed: false,
    attempts: [],
    evidence: {
      opening: null,
      difficultySamples: [],
      speed: null,
      player: {
        structures: {
          hall: emptyStructureEvidence("unit-town-hall"),
          farm: emptyStructureEvidence("unit-farm"),
          barracks: emptyStructureEvidence("unit-human-barracks")
        },
        structureActions: [],
        defenderOrders: [],
        defenderCompletions: []
      },
      ai: {
        playerId: null,
        hall: { order: null, foundation: null, completion: null, maximumInFlight: 0, maximumFoundations: 0, maximumCompleted: 0, cancelled: false },
        barracksCompletions: [],
        buildDuration: null,
        trainDuration: null,
        exploration: null,
        launches: [],
        pressureContacts: [],
        performanceSamples: []
      }
    }
  };
}

function emptyStructureEvidence(typeId) {
  return { typeId, order: null, foundation: null, completion: null };
}

function loadLedger() {
  if (!existsSync(LEDGER_PATH)) return createLedger();
  const parsed = JSON.parse(readFileSync(LEDGER_PATH, "utf8"));
  if (parsed?.schemaVersion !== LEDGER_SCHEMA_VERSION || parsed.seed !== DEMO_SEED || parsed.saveSlot !== SAVE_SLOT || JSON.stringify(parsed.viewport) !== JSON.stringify(VIEWPORT)) {
    throw new Error(`Checkpoint ledger does not match fixed Task 9 identity: ${LEDGER_PATH}`);
  }
  if (parsed.acceptedCheckpoint && !existsSync(parsed.acceptedCheckpoint.storageStatePath)) {
    throw new Error(`Accepted checkpoint storage state is missing: ${parsed.acceptedCheckpoint.storageStatePath}`);
  }
  return parsed;
}

function writeLedger(nextLedger) {
  const temporary = `${LEDGER_PATH}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(nextLedger, null, 2)}\n`, "utf8");
  renameSync(temporary, LEDGER_PATH);
}

function beginAttempt(currentLedger, port, target) {
  currentLedger.attemptSequence += 1;
  const attempt = {
    id: currentLedger.attemptSequence,
    port,
    target,
    status: "started",
    acceptedSegmentBefore: currentLedger.acceptedSegment,
    startedAt: new Date().toISOString()
  };
  currentLedger.attempts.push(attempt);
  currentLedger.attempts = currentLedger.attempts.slice(-MAX_ATTEMPTS);
  writeLedger(currentLedger);
  return attempt.id;
}

function finishAttempt(currentLedger, attemptId, values) {
  const attempt = currentLedger.attempts.find((entry) => entry.id === attemptId);
  if (!attempt) return;
  Object.assign(attempt, values, { finishedAt: new Date().toISOString() });
}

async function allocatePort(currentLedger) {
  const used = new Set(currentLedger.attempts.map((attempt) => attempt.port));
  for (let offset = 1; offset <= MAX_ATTEMPTS; offset += 1) {
    const port = PORT_BASE + currentLedger.attemptSequence + offset;
    if (port > 65_000 || used.has(port)) continue;
    if (!(await isPortOpen(port))) return port;
  }
  throw new Error(`No unique clear Task 9 port remains above ${PORT_BASE}; attempts=${currentLedger.attemptSequence}`);
}

async function runSegment({ chromium, port, attemptId, candidateLedger, checkpoint }) {
  const segmentStartedAt = Date.now();
  const timing = deriveSegmentTiming(segmentStartedAt, {
    segmentLimitMs: SEGMENT_LIMIT_MS,
    cleanupReserveMs: SEGMENT_CLEANUP_RESERVE_MS,
    returnMarginMs: SEGMENT_RETURN_MARGIN_MS
  });
  const url = `http://127.0.0.1:${port}/?smoke=1&demoSeed=${encodeURIComponent(DEMO_SEED)}`;
  let server = null;
  let serverSpawnError = null;
  let browserServer = null;
  let browser = null;
  let context = null;
  let page = null;
  let serverPids = [];
  let browserPids = [];
  let pageWallMs = 0;
  let pageResult = null;
  let runError = null;
  let cleanupForced = false;
  let completionExpired = false;
  let cleanupStartedAtMs = null;
  let cleanupFinishedAtMs = null;
  const cleanupReasons = [];
  const cleanupErrors = [];
  const terminationAttempts = [];
  let forcedCleanupChain = Promise.resolve();
  const recordProcessTreeFailure = (error) => {
    const message = `process-tree discovery failed: ${error instanceof Error ? error.message : String(error)}`;
    cleanupErrors.push(message);
    runError ??= new Error(message);
  };
  const refreshOwnedPids = (deadline = timing.completionDeadline) => {
    try {
      const browserRootPid = browserServer?.process()?.pid;
      if (browserRootPid) browserPids = uniquePids([...browserPids, ...processTreePids(browserRootPid, deadline)]);
      const serverRootPid = server?.pid;
      if (serverRootPid) serverPids = uniquePids([...serverPids, ...processTreePids(serverRootPid, deadline)]);
    } catch (error) {
      recordProcessTreeFailure(error);
    }
  };
  const requestForcedCleanup = (reason) => {
    cleanupForced = true;
    cleanupStartedAtMs ??= Date.now();
    cleanupReasons.push(reason);
    refreshOwnedPids(timing.completionDeadline);
    if (browser) void browser.close().catch(() => { /* Exact PID cleanup follows. */ });
    const exactPids = uniquePids([...browserPids, ...serverPids]);
    forcedCleanupChain = forcedCleanupChain
      .then(async () => {
        const outcome = await stopExactPids(exactPids, timing.completionDeadline);
        terminationAttempts.push({ reason, ...outcome });
      })
      .catch((error) => cleanupErrors.push(`forced cleanup ${reason}: ${error instanceof Error ? error.message : String(error)}`));
    console.error(`Task 9 segment ${attemptId} forced exact cleanup began before the external cap: ${reason}; PIDs ${exactPids.join(",") || "none"}.`);
    return forcedCleanupChain;
  };
  const cleanupTimer = setTimeout(() => {
    void requestForcedCleanup("reserved cleanup deadline reached");
  }, Math.max(0, timing.cleanupStartAt - Date.now()));
  const completionTimer = setTimeout(() => {
    completionExpired = true;
    void requestForcedCleanup("completion deadline reached");
  }, Math.max(0, timing.completionDeadline - Date.now()));

  try {
    if (await isPortOpen(port)) throw new Error(`Segment ${attemptId} refused occupied port ${port}.`);
    server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
      cwd: process.cwd(),
      stdio: "ignore"
    });
    server.once("error", (error) => { serverSpawnError = error; });
    serverPids = [server.pid];
    console.log(`Task 9 segment ${attemptId} tracked server PID ${server.pid} on unique port ${port}.`);
    await waitForHttp(url, timing.cleanupStartAt, () => serverSpawnError ?? server.exitCode);
    refreshOwnedPids(timing.cleanupStartAt);
    if (runError) throw runError;
    const manifestResponse = await fetchBeforeDeadline(`http://127.0.0.1:${port}/wargus/manifest.json`, timing.cleanupStartAt, 2_000, "critical manifest fetch");
    if (!manifestResponse.ok) throw new Error(`Critical asset /wargus/manifest.json returned HTTP ${manifestResponse.status}.`);

    const browserExecutablePath = process.env.CHROME_BIN ?? chromium.executablePath();
    const launchTimeoutMs = boundedAwaitMs(timing.cleanupStartAt, Date.now(), 4_000);
    const launchPromise = chromium.launchServer({
      executablePath: browserExecutablePath,
      headless: true,
      timeout: launchTimeoutMs,
      args: ["--disable-background-networking", "--disable-extensions", "--disable-dev-shm-usage", "--no-proxy-server"]
    });
    void launchPromise.then((launchedServer) => {
      browserServer = launchedServer;
      refreshOwnedPids(timing.cleanupStartAt);
      if (cleanupForced) void requestForcedCleanup("browser launch settled after cleanup began");
    }).catch(() => { /* Playwright owns failed native-timeout teardown. */ });
    browserServer = await launchPromise;
    refreshOwnedPids(timing.cleanupStartAt);
    if (runError) throw runError;
    console.log(`Task 9 segment ${attemptId} tracked browser PID ${browserServer.process().pid}.`);
    browser = await withTimeout(chromium.connect(browserServer.wsEndpoint()), boundedAwaitMs(timing.cleanupStartAt, Date.now(), 3_000), "Playwright did not connect before forced cleanup.");
    let storageState;
    if (checkpoint) {
      const capturedStorageState = JSON.parse(readFileSync(checkpoint.storageStatePath, "utf8"));
      const handoff = rebaseCheckpointStorageState(capturedStorageState, {
        targetOrigin: new URL(url).origin,
        expectedSourceOrigin: `http://127.0.0.1:${checkpoint.port}`,
        saveSlotKey: SAVE_SLOT_KEY,
        expectedRawSha256: checkpoint.slotIdentity.rawSha256
      });
      assertSlotIdentity(handoff.rawSlot, checkpoint.slotIdentity, "checkpoint storageState handoff");
      storageState = handoff.storageState;
    }
    context = await withTimeout(browser.newContext({ viewport: VIEWPORT, storageState: storageState ?? undefined }), boundedAwaitMs(timing.cleanupStartAt, Date.now(), 3_000), "Browser context did not start before forced cleanup.");
    page = await withTimeout(context.newPage(), boundedAwaitMs(timing.cleanupStartAt, Date.now(), 3_000), "Browser page did not start before forced cleanup.");
    if (context.pages().length !== 1) throw new Error(`Segment ${attemptId} expected one page, found ${context.pages().length}.`);
    const pageStartedAt = Date.now();
    const pageDeadline = pageWorkDeadline(pageStartedAt, PAGE_LIMIT_MS, timing);
    pageResult = await withTimeout(
      runPageSegment({ page, context, url, port, attemptId, candidateLedger, checkpoint, pageDeadline }),
      boundedAwaitMs(pageDeadline, Date.now(), PAGE_LIMIT_MS),
      `Segment ${attemptId} exhausted its ${PAGE_LIMIT_MS}ms page cap or reserved outer-cleanup budget.`
    );
    pageWallMs = Date.now() - pageStartedAt;
    if (context.pages().length !== 1) throw new Error(`Segment ${attemptId} opened extra pages; found ${context.pages().length}.`);
  } catch (error) {
    runError = error;
  }

  clearTimeout(cleanupTimer);
  clearTimeout(completionTimer);
  cleanupStartedAtMs ??= Date.now();
  cleanupReasons.push(runError ? `segment failure: ${runError instanceof Error ? runError.message : String(runError)}` : "normal completion");
  refreshOwnedPids(timing.completionDeadline);
  const closePromises = [context?.close(), browser?.close(), browserServer?.close()].filter(Boolean);
  if (closePromises.length > 0 && Date.now() < timing.completionDeadline) {
    try {
      await withTimeout(Promise.allSettled(closePromises), boundedAwaitMs(timing.completionDeadline, Date.now(), 650), "Graceful close yielded to exact PID cleanup.");
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error.message : String(error));
    }
  }
  try {
    await forcedCleanupChain;
  } catch (error) {
    cleanupErrors.push(`forced cleanup join: ${error instanceof Error ? error.message : String(error)}`);
  }
  refreshOwnedPids(timing.completionDeadline);
  try {
    const outcome = await stopExactPids([...browserPids, ...serverPids], timing.completionDeadline);
    terminationAttempts.push({ reason: "final exact cleanup", ...outcome });
  } catch (error) {
    cleanupErrors.push(`final exact cleanup: ${error instanceof Error ? error.message : String(error)}`);
  }
  const listenerClear = await proveListenerClear(port, timing.completionDeadline);
  if (!listenerClear.clear && listenerClear.error) cleanupErrors.push(listenerClear.error);
  cleanupFinishedAtMs = Date.now();
  clearTimeout(cleanupTimer);
  clearTimeout(completionTimer);

  const attemptAudit = finalizeAttemptAudit({
    selectedPort: port,
    serverPid: server?.pid ?? null,
    browserPid: browserServer?.process()?.pid ?? null,
    ownedServerPids: serverPids,
    ownedBrowserPids: browserPids,
    terminationAttempts,
    listenerClear,
    cleanupForced,
    cleanupReasons,
    cleanupErrors,
    cleanupStartedAtMs,
    cleanupFinishedAtMs,
    segmentStartedAtMs: segmentStartedAt,
    segmentFinishedAtMs: cleanupFinishedAtMs
  });
  const durationRelation = attemptAudit.segmentWallMs < SEGMENT_LIMIT_MS ? "<" : ">=";
  console.log(`Task 9 segment ${attemptId} hard-duration proof: ${attemptAudit.segmentWallMs}ms ${durationRelation} ${SEGMENT_LIMIT_MS}ms; cleanup=${attemptAudit.cleanupStatus}; listener-clear=${attemptAudit.listenerClear.clear}; owned/stopped/remaining=${attemptAudit.ownedPids.length}/${attemptAudit.stoppedPids.length}/${attemptAudit.remainingPids.length}.`);

  const failureMessages = [];
  if (runError) failureMessages.push(runError instanceof Error ? runError.message : String(runError));
  if (!pageResult) failureMessages.push(`Segment ${attemptId} ended without an accepted F11 checkpoint.`);
  if (attemptAudit.cleanupStatus !== "complete") failureMessages.push(`Segment ${attemptId} cleanup audit is incomplete.`);
  if (completionExpired || cleanupFinishedAtMs > timing.completionDeadline || attemptAudit.segmentWallMs >= SEGMENT_LIMIT_MS) {
    failureMessages.push(`Segment ${attemptId} exceeded outer ${SEGMENT_LIMIT_MS}ms budget including exact cleanup; duration=${attemptAudit.segmentWallMs}ms.`);
  }
  if (failureMessages.length > 0) {
    throw new SegmentAttemptError(failureMessages.join(" "), attemptAudit, runError);
  }
  return {
    ...pageResult,
    pageWallMs,
    segmentWallMs: attemptAudit.segmentWallMs,
    attemptAudit
  };
}

async function runPageSegment({ page, context, url, port, attemptId, candidateLedger, checkpoint, pageDeadline }) {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: Math.min(10_000, remainingMs(pageDeadline)) });
  let state = await waitForSmoke(page, (smoke) => smoke?.worldLoaded === true && smoke.activeMapPath === EXPECTED_MAP_PATH, Math.min(8_000, remainingMs(pageDeadline)), "fixed demo world load");
  state = await dismissOpeningOverlays(page, state, pageDeadline);

  if (checkpoint) {
    const rawBeforeLoad = await readSaveSlot(page);
    assertSlotIdentity(rawBeforeLoad, checkpoint.slotIdentity, "storageState before visible F12 load");
    await page.keyboard.press("F12");
    await waitForMenu(page, "load-menu", pageDeadline);
    await clickMenuControl(page, "load-game", pageDeadline);
    state = await waitForSmoke(page, (smoke) => smoke?.tick === checkpoint.slotIdentity.tick && smoke?.activeMapPath === checkpoint.slotIdentity.mapPath && smoke?.paused === true, Math.min(8_000, remainingMs(pageDeadline)), "visible F12 restored checkpoint");
    assertLoadedCheckpoint(state, checkpoint.slotIdentity);
    revalidateLoadedScoutProvenance(state, candidateLedger);
    await clickMapControl(page, "toggle-pause", pageDeadline, "Run");
    state = await waitForSmoke(page, (smoke) => smoke?.paused === false && Number(smoke.tick) >= checkpoint.slotIdentity.tick, Math.min(2_000, remainingMs(pageDeadline)), "visible Run after load");
  } else {
    assertOpeningState(state);
    candidateLedger.evidence.opening = openingEvidence(state);
    if (state.paused === true) {
      await clickMapControl(page, "toggle-pause", pageDeadline, "Run");
      state = await waitForSmoke(page, (smoke) => smoke?.paused === false, Math.min(2_000, remainingMs(pageDeadline)), "initial visible Run");
    }
  }

  observeEvidence(candidateLedger, state);
  const target = unmetMilestone(candidateLedger);
  if (!target) throw new Error("Task 9 was already complete before this segment; refusing a redundant checkpoint.");
  const startTick = Number(state.tick);
  state = await executeSegmentAction(page, state, candidateLedger, target, pageDeadline);
  observeEvidence(candidateLedger, state);
  if (state.matchStatus !== "playing" && unmetMilestone(candidateLedger)) {
    throw new Error(`Match ended as ${state.matchStatus} before milestone ${unmetMilestone(candidateLedger)}.`);
  }

  state = await pauseVisibly(page, state, pageDeadline);
  if (state.paused !== true) throw new Error("Checkpoint rejected because paused === true was not observed before F11.");
  observeEvidence(candidateLedger, state);
  const checkpointTick = Number(state.tick);
  if (!Number.isInteger(checkpointTick) || checkpointTick < startTick) throw new Error(`Invalid checkpoint tick ${checkpointTick} after segment start ${startTick}.`);
  assertScoutProvenancePresentAtCheckpoint(state, candidateLedger);

  await page.keyboard.press("F11");
  await waitForMenu(page, "save-menu", pageDeadline);
  const oldRaw = await readSaveSlot(page);
  await clickMenuControl(page, "save-game", pageDeadline);
  const raw = await waitForSaveSlot(page, (save, text) => save?.world?.tick === checkpointTick && text !== oldRaw, Math.min(2_500, remainingMs(pageDeadline)), "visible F11 Save");
  const identity = slotIdentity(raw);
  assertSavedCheckpoint(state, identity);
  if (pageErrors.length > 0) throw new Error(`Interrupted before accepted F11 save due to page exceptions: ${pageErrors.join("; ")}`);

  candidateLedger.acceptedSegment += 1;
  const storageStatePath = path.join(ARTIFACT_DIR, `storage-state-segment-${String(candidateLedger.acceptedSegment).padStart(4, "0")}.json`);
  await saveAcceptedCheckpoint(context, storageStatePath);
  candidateLedger.acceptedCheckpoint = {
    acceptedSegment: candidateLedger.acceptedSegment,
    attemptId,
    port,
    target,
    startTick,
    checkpointTick,
    storageStatePath,
    slotIdentity: identity,
    acceptedAt: new Date().toISOString()
  };
  candidateLedger.completed = unmetMilestone(candidateLedger) === null;
  return { candidateLedger, checkpointTick, target };
}

async function saveAcceptedCheckpoint(context, storageStatePath) {
  await context.storageState({ path: storageStatePath });
  if (!existsSync(storageStatePath)) throw new Error(`Accepted storageState was not written: ${storageStatePath}`);
}

async function dismissOpeningOverlays(page, initialState, pageDeadline) {
  let state = initialState;
  if (state.titleScreenOpen === true) {
    await page.keyboard.press("Enter");
    state = await waitForSmoke(page, (smoke) => smoke?.titleScreenOpen === false, Math.min(3_000, remainingMs(pageDeadline)), "title dismissal");
  }
  if (state.briefingOpen === true) {
    await page.keyboard.press("Enter");
    state = await waitForSmoke(page, (smoke) => smoke?.briefingOpen === false, Math.min(3_000, remainingMs(pageDeadline)), "briefing dismissal");
  }
  return state;
}

function assertOpeningState(state) {
  const counts = state.ownedUnitCounts ?? {};
  const resources = state.visibilityPlayerResources ?? {};
  if (state.activeMapPath !== EXPECTED_MAP_PATH
    || state.selectedUnitCount !== 1
    || state.selectedUnitTypes?.[0] !== "unit-peasant"
    || counts["unit-peasant"] !== 1
    || counts["unit-town-hall"]
    || counts["unit-farm"]
    || counts["unit-human-barracks"]
    || Number(resources.gold ?? 0) < 10_000
    || Number(resources.wood ?? 0) < 5_000
    || Number(resources.oil ?? 0) < 5_000) {
    throw new Error(`Task 9 opening must be one selected Peasant, no Hall, and high resources: ${JSON.stringify({ map: state.activeMapPath, selected: state.selectedUnitTypes, counts, resources })}`);
  }
}

function openingEvidence(state) {
  return {
    tick: state.tick,
    mapPath: state.activeMapPath,
    selectedUnitTypes: state.selectedUnitTypes,
    resources: normalizeResources(state.visibilityPlayerResources),
    unitRecords: state.visibilityPlayerUnitRecords,
    sourceGameSpeedDefault: state.sourceGameSpeedDefault,
    aiDifficulty: state.aiDifficulty
  };
}

async function executeSegmentAction(page, state, candidateLedger, target, pageDeadline) {
  if (target.startsWith("difficulty sequence sample")) {
    return executeDifficultyStep(page, state, candidateLedger, pageDeadline);
  }
  if (target === "visible speed down/up and maximum supported game speed") {
    return executeSpeedStep(page, state, candidateLedger, pageDeadline);
  }
  const structure = structureForOrderMilestone(target);
  if (structure) {
    state = await ensureRunningAtMax(page, state, candidateLedger, pageDeadline);
    return issueVisibleStructureOrder(page, state, candidateLedger, structure, pageDeadline);
  }
  if (target.startsWith("player defender order")) {
    state = await ensureRunningAtMax(page, state, candidateLedger, pageDeadline);
    return issueVisibleDefenderOrder(page, state, candidateLedger, pageDeadline);
  }
  state = await ensureRunningAtMax(page, state, candidateLedger, pageDeadline);
  return progressTowardMilestone(page, state, candidateLedger, target, pageDeadline);
}

async function executeDifficultyStep(page, state, candidateLedger, pageDeadline) {
  const sampleIndex = candidateLedger.evidence.difficultySamples.length;
  const targetDifficulty = DIFFICULTY_SEQUENCE[sampleIndex];
  if (!targetDifficulty) throw new Error(`Unexpected completed difficulty sample index ${sampleIndex}.`);
  const beforeDifficulty = Number(state.aiDifficulty);
  await page.keyboard.press("F10");
  await waitForMenu(page, "main-menu", pageDeadline);
  await clickMenuControl(page, "game-options", pageDeadline);
  await waitForMenu(page, "game-options", pageDeadline);
  await clickMenuControl(page, "speed-options", pageDeadline);
  state = await waitForMenu(page, "speed-options", pageDeadline);

  let current = Number(state.aiDifficulty);
  for (let steps = 0; current !== targetDifficulty && steps < 6; steps += 1) {
    const command = current < targetDifficulty ? "harder-ai" : "easier-ai";
    const next = current + (command === "harder-ai" ? 1 : -1);
    await clickMenuControl(page, command, pageDeadline);
    state = await waitForSmoke(page, (smoke) => smoke?.modernHud?.menuOverlay === "speed-options" && smoke?.aiDifficulty === next, Math.min(2_000, remainingMs(pageDeadline)), `visible ${command} to level ${next}`);
    current = Number(state.aiDifficulty);
  }
  if (current !== targetDifficulty) throw new Error(`Visible difficulty controls could not reach level ${targetDifficulty}; current=${current}.`);
  const changedAtTick = Number(state.tick);
  const tickRate = Number(state.tickRate);
  await clickMenuControl(page, "speed-options-ok", pageDeadline);
  await waitForMenu(page, "game-options", pageDeadline);
  await clickMenuControl(page, "toggle-pause", pageDeadline);
  state = await waitForSmoke(page, (smoke) => smoke?.paused === false && smoke?.modernHud?.menuOverlay === null, Math.min(2_000, remainingMs(pageDeadline)), "resume after visible difficulty selection");
  const expectedFactor = EXPECTED_DIFFICULTY_FACTORS.get(targetDifficulty);
  state = await waitForSmoke(page, (smoke) => {
    const ai = currentAiState(smoke, candidateLedger.evidence.ai.playerId);
    return Number(smoke?.tick) >= changedAtTick + tickRate && Number(ai?.evidence?.speedFactors?.build) === expectedFactor;
  }, Math.min(4_000, remainingMs(pageDeadline)), `one AI think at difficulty ${targetDifficulty}`);
  const ai = currentAiState(state, candidateLedger.evidence.ai.playerId);
  const factors = ai?.evidence?.speedFactors ?? null;
  assertDifficultyFactors(factors, expectedFactor, targetDifficulty);
  candidateLedger.evidence.difficultySamples.push({
    sequenceIndex: sampleIndex,
    from: beforeDifficulty,
    difficulty: targetDifficulty,
    changedAtTick,
    observedTick: state.tick,
    factors
  });
  if (sampleIndex === DIFFICULTY_SEQUENCE.length - 1 && targetDifficulty !== 3) {
    throw new Error("Task 9 must finish difficulty stepping at source-neutral difficulty 3.");
  }
  return state;
}

async function executeSpeedStep(page, state, candidateLedger, pageDeadline) {
  state = await discoverMaximumGameSpeed(page, state, pageDeadline);
  const maximum = { gameSpeed: state.gameSpeed, sourceGameSpeedDefault: state.sourceGameSpeedDefault };
  await clickMapControl(page, "slower-game", pageDeadline);
  const down = await waitForSmoke(page, (smoke) => Number(smoke?.sourceGameSpeedDefault) < Number(maximum.sourceGameSpeedDefault), Math.min(2_000, remainingMs(pageDeadline)), "visible speed down");
  await clickMapControl(page, "faster-game", pageDeadline);
  const up = await waitForSmoke(page, (smoke) => smoke?.sourceGameSpeedDefault === maximum.sourceGameSpeedDefault && smoke?.gameSpeed === maximum.gameSpeed, Math.min(2_000, remainingMs(pageDeadline)), "visible speed up");
  candidateLedger.evidence.speed = {
    maximum,
    down: { tick: down.tick, gameSpeed: down.gameSpeed, sourceGameSpeedDefault: down.sourceGameSpeedDefault },
    up: { tick: up.tick, gameSpeed: up.gameSpeed, sourceGameSpeedDefault: up.sourceGameSpeedDefault }
  };
  return up;
}

async function discoverMaximumGameSpeed(page, initialState, pageDeadline) {
  let state = initialState;
  for (let step = 0; step < 16; step += 1) {
    const before = Number(state.sourceGameSpeedDefault);
    await clickMapControl(page, "faster-game", pageDeadline);
    try {
      state = await waitForSmoke(page, (smoke) => Number(smoke?.sourceGameSpeedDefault) > before, Math.min(700, remainingMs(pageDeadline)), "next visible game speed");
    } catch {
      state = await readSmoke(page);
      if (Number(state.sourceGameSpeedDefault) !== before) throw new Error(`Game speed changed unexpectedly while finding maximum: ${before}->${state.sourceGameSpeedDefault}.`);
      return state;
    }
  }
  throw new Error("Visible Faster control did not reach a bounded maximum in 16 steps.");
}

async function ensureRunningAtMax(page, state, candidateLedger, pageDeadline) {
  if (state.paused === true) {
    await clickMapControl(page, "toggle-pause", pageDeadline, "Run");
    state = await waitForSmoke(page, (smoke) => smoke?.paused === false, Math.min(2_000, remainingMs(pageDeadline)), "visible Run");
  }
  const maximum = candidateLedger.evidence.speed?.maximum;
  if (!maximum) return state;
  for (let step = 0; state.sourceGameSpeedDefault !== maximum.sourceGameSpeedDefault && step < 16; step += 1) {
    const command = Number(state.sourceGameSpeedDefault) < Number(maximum.sourceGameSpeedDefault) ? "faster-game" : "slower-game";
    const before = state.sourceGameSpeedDefault;
    await clickMapControl(page, command, pageDeadline);
    state = await waitForSmoke(page, (smoke) => smoke?.sourceGameSpeedDefault !== before, Math.min(1_000, remainingMs(pageDeadline)), `restore ${command}`);
  }
  if (state.sourceGameSpeedDefault !== maximum.sourceGameSpeedDefault) throw new Error(`Could not restore maximum source speed ${maximum.sourceGameSpeedDefault}.`);
  return state;
}

function structureForOrderMilestone(target) {
  if (target === "player Hall unpaid build order") return { key: "hall", typeId: "unit-town-hall", commandId: "source-build:unit-town-hall", label: "Town Hall" };
  if (target === "player Farm unpaid build order") return { key: "farm", typeId: "unit-farm", commandId: "source-build:unit-farm", label: "Farm" };
  if (target === "player Barracks unpaid build order") return { key: "barracks", typeId: "unit-human-barracks", commandId: "source-build:unit-human-barracks", label: "Barracks" };
  return null;
}

async function issueVisibleStructureOrder(page, state, candidateLedger, structure, pageDeadline) {
  const resourcesBefore = normalizeResources(state.visibilityPlayerResources);
  state = await selectOwnedUnit(page, state, (record) => record.typeId === "unit-peasant" && !record.construction, pageDeadline, "Peasant builder");
  await clickCommandControl(page, "build-basic-page", pageDeadline);
  await waitForCommand(page, structure.commandId, pageDeadline);
  await clickCommandControl(page, structure.commandId, pageDeadline);
  state = await waitForSmoke(page, (smoke) => smoke?.pendingWorldCommandKind === "build", Math.min(2_000, remainingMs(pageDeadline)), `${structure.label} placement mode`);
  const candidates = placementCandidates(state);
  for (const point of candidates) {
    await page.mouse.click(point.x, point.y);
    await delay(120);
    state = await readSmoke(page);
    observeEvidence(candidateLedger, state);
    if (structureOrderPresent(state, structure.typeId) || structureFoundationPresent(state, structure.typeId)) {
      candidateLedger.evidence.player.structureActions.push({
        structure: structure.key,
        commandId: structure.commandId,
        tick: state.tick,
        point,
        resourcesBefore,
        resourcesAfter: normalizeResources(state.visibilityPlayerResources),
        order: playerBuildOrder(state, structure.typeId)
      });
      candidateLedger.evidence.player.structureActions = candidateLedger.evidence.player.structureActions.slice(-16);
      return state;
    }
    if (state.pendingWorldCommandKind !== "build") {
      state = await selectOwnedUnit(page, state, (record) => record.typeId === "unit-peasant" && !record.construction, pageDeadline, "Peasant builder retry");
      await clickCommandControl(page, "build-basic-page", pageDeadline);
      await waitForCommand(page, structure.commandId, pageDeadline);
      await clickCommandControl(page, structure.commandId, pageDeadline);
      state = await waitForSmoke(page, (smoke) => smoke?.pendingWorldCommandKind === "build", Math.min(1_500, remainingMs(pageDeadline)), `${structure.label} placement retry`);
    }
  }
  throw new Error(`Visible ${structure.label} placement exhausted ${candidates.length} bounded map attempts without an order or foundation.`);
}

async function issueVisibleDefenderOrder(page, state, candidateLedger, pageDeadline) {
  const beforeResources = normalizeResources(state.visibilityPlayerResources);
  const beforeQueue = totalQueued(state, "unit-footman");
  const beforeCount = completedTypeIds(state, "unit-footman").length;
  state = await selectOwnedUnit(page, state, (record) => record.typeId === "unit-human-barracks" && !record.construction, pageDeadline, "completed Barracks");
  await clickCommandControl(page, "source-train:unit-footman", pageDeadline);
  state = await waitForSmoke(page, (smoke) => totalQueued(smoke, "unit-footman") > beforeQueue || completedTypeIds(smoke, "unit-footman").length > beforeCount, Math.min(2_500, remainingMs(pageDeadline)), "visible Footman training order");
  candidateLedger.evidence.player.defenderOrders.push({
    tick: state.tick,
    commandId: "source-train:unit-footman",
    resourcesBefore: beforeResources,
    resourcesAfter: normalizeResources(state.visibilityPlayerResources),
    queuedAfter: totalQueued(state, "unit-footman")
  });
  candidateLedger.evidence.player.defenderOrders = candidateLedger.evidence.player.defenderOrders.slice(0, REQUIRED_DEFENDERS);
  return state;
}

async function progressTowardMilestone(page, initialState, candidateLedger, target, pageDeadline) {
  const startedTick = Number(initialState.tick);
  let state = initialState;
  const progressDeadline = Math.min(Date.now() + 16_000, pageDeadline - 4_500);
  while (Date.now() < progressDeadline) {
    await delay(80);
    state = await readSmoke(page);
    observeEvidence(candidateLedger, state);
    if (targetResolved(candidateLedger, target) || state.matchStatus !== "playing") break;
  }
  if (!(Number(state.tick) > startedTick)) throw new Error(`No-progress segment for ${target}: tick remained ${startedTick}.`);
  return state;
}

function targetResolved(candidateLedger, target) {
  return unmetMilestone(candidateLedger) !== target;
}

async function pauseVisibly(page, state, pageDeadline) {
  if (state.modernHud?.menuOverlay) throw new Error(`Cannot checkpoint with menu ${state.modernHud.menuOverlay} still open.`);
  if (state.paused !== true) {
    await clickMapControl(page, "toggle-pause", pageDeadline, "Pause");
    state = await waitForSmoke(page, (smoke) => smoke?.paused === true, Math.min(2_000, remainingMs(pageDeadline)), "visible Pause before checkpoint");
  }
  return state;
}

async function waitForMenu(page, menuOverlay, pageDeadline) {
  return waitForSmoke(page, (smoke) => smoke?.modernHud?.menuOverlay === menuOverlay && Array.isArray(smoke?.modernHud?.menuButtonControls), Math.min(2_500, remainingMs(pageDeadline)), `${menuOverlay} rendered controls`);
}

async function clickMenuControl(page, id, pageDeadline) {
  const state = await waitForSmoke(page, (smoke) => smoke?.modernHud?.menuButtonControls?.some((control) => control.id === id && control.disabled !== true), Math.min(2_000, remainingMs(pageDeadline)), `enabled menu control ${id}`);
  const control = state.modernHud.menuButtonControls.find((candidate) => candidate.id === id && candidate.disabled !== true);
  await page.mouse.click(control.x + control.width / 2, control.y + control.height / 2);
}

async function clickMapControl(page, id, pageDeadline, expectedLabel = null) {
  const state = await waitForSmoke(page, (smoke) => smoke?.modernHud?.mapButtonControls?.some((control) => control.id === id && (!expectedLabel || control.label === expectedLabel)), Math.min(2_000, remainingMs(pageDeadline)), `map control ${id}${expectedLabel ? ` (${expectedLabel})` : ""}`);
  const control = state.modernHud.mapButtonControls.find((candidate) => candidate.id === id && (!expectedLabel || candidate.label === expectedLabel));
  const rect = control.hitRect ?? control;
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
}

async function waitForCommand(page, id, pageDeadline) {
  return waitForSmoke(page, (smoke) => smoke?.modernHud?.commandButtons?.some((control) => control.id === id && control.disabled !== true), Math.min(2_000, remainingMs(pageDeadline)), `enabled command-card control ${id}`);
}

async function clickCommandControl(page, id, pageDeadline) {
  const state = await waitForCommand(page, id, pageDeadline);
  const control = state.modernHud.commandButtons.find((candidate) => candidate.id === id && candidate.disabled !== true);
  await page.mouse.click(control.x + control.width / 2, control.y + control.height / 2);
}

async function selectOwnedUnit(page, initialState, predicate, pageDeadline, label) {
  let state = initialState;
  const record = state.visibilityPlayerUnitRecords?.find(predicate);
  if (!record) throw new Error(`No ${label} record is available for visible selection.`);
  let point = state.ownedUnitScreenPoints?.find((candidate) => candidate.id === record.id);
  if (!point) {
    const minimap = state.modernHud?.minimap;
    const worldWidth = Number(state.mapWidth) * Number(state.tileSize);
    const worldHeight = Number(state.mapHeight) * Number(state.tileSize);
    if (!minimap || !(worldWidth > 0) || !(worldHeight > 0)) throw new Error(`Cannot visibly center off-screen ${label}; minimap geometry is unavailable.`);
    const minimapX = minimap.x + Math.max(0, Math.min(1, record.x / worldWidth)) * minimap.width;
    const minimapY = minimap.y + Math.max(0, Math.min(1, record.y / worldHeight)) * minimap.height;
    await page.mouse.click(minimapX, minimapY);
    state = await waitForSmoke(page, (smoke) => smoke?.ownedUnitScreenPoints?.some((candidate) => candidate.id === record.id), Math.min(2_000, remainingMs(pageDeadline)), `${label} visible after minimap click`);
    point = state.ownedUnitScreenPoints.find((candidate) => candidate.id === record.id);
  }
  await page.mouse.click(point.screenX, point.screenY);
  return waitForSmoke(page, (smoke) => JSON.stringify(smoke?.selectedUnitIds ?? []) === JSON.stringify([record.id]), Math.min(2_000, remainingMs(pageDeadline)), `visible selection of ${label}`);
}

function placementCandidates(state) {
  const selectedId = state.selectedUnitIds?.[0];
  const selected = state.ownedUnitScreenPoints?.find((point) => point.id === selectedId);
  const base = selected ? { x: selected.screenX, y: selected.screenY } : { x: 520, y: 330 };
  const offsets = [
    [160, 0], [-160, 0], [0, 160], [0, -160], [224, 96], [-224, 96], [224, -96], [-224, -96],
    [320, 0], [-320, 0], [0, 240], [0, -240], [320, 160], [-320, 160], [320, -160], [-320, -160],
    [440, 80], [-440, 80], [440, -80], [-440, -80], [520, 200], [-520, 200], [520, -200], [-520, -200]
  ];
  const hudRects = [state.modernHud?.topBar, state.modernHud?.minimapPanel, state.modernHud?.selectionPanel, state.modernHud?.commandPanel, state.modernHud?.toastLane].filter(Boolean);
  const seen = new Set();
  return offsets
    .map(([dx, dy]) => ({ x: Math.max(24, Math.min(VIEWPORT.width - 24, Math.round((base.x + dx) / 16) * 16)), y: Math.max(72, Math.min(VIEWPORT.height - 24, Math.round((base.y + dy) / 16) * 16)) }))
    .filter((point) => !hudRects.some((rect) => pointInRect(point, rect)))
    .filter((point) => {
      const key = `${point.x}:${point.y}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function pointInRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function observeEvidence(currentLedger, state) {
  observePlayerEvidence(currentLedger, state);
  const aiState = currentAiState(state, currentLedger.evidence.ai.playerId);
  if (!aiState?.evidence) return;
  const ai = currentLedger.evidence.ai;
  if (ai.playerId === null) ai.playerId = aiState.player;
  if (ai.playerId !== aiState.player) throw new Error(`AI evidence player changed ${ai.playerId}->${aiState.player}.`);
  const evidence = aiState.evidence;
  const hallRole = evidence.buildRoles?.find((entry) => entry.role === "town-center") ?? null;
  const barracksRole = evidence.buildRoles?.find((entry) => entry.role === "barracks") ?? null;
  if (hallRole) observeAiHall(ai, evidence, hallRole, state);
  if (barracksRole) observeAiBarracks(ai, barracksRole, state);
  observeAiDurations(ai, evidence, state);
  observeAiExploration(ai, evidence, state);
  observeAiLaunches(ai, evidence, state);
  observeAiContact(ai, evidence, state);
  observePerformance(ai, state);
}

function observePlayerEvidence(currentLedger, state) {
  const player = currentLedger.evidence.player;
  for (const [key, structure] of Object.entries(player.structures)) {
    const order = playerBuildOrder(state, structure.typeId);
    const foundation = state.visibilityPlayerUnitRecords?.find((record) => record.typeId === structure.typeId && record.construction) ?? null;
    const completion = state.visibilityPlayerUnitRecords?.find((record) => record.typeId === structure.typeId && !record.construction) ?? null;
    if (!structure.order && order) structure.order = { tick: state.tick, resources: normalizeResources(state.visibilityPlayerResources), order };
    if (!structure.foundation && foundation) structure.foundation = { tick: state.tick, unitId: foundation.id, resources: normalizeResources(state.visibilityPlayerResources), construction: foundation.construction };
    if (!structure.completion && completion) structure.completion = { tick: state.tick, unitId: completion.id, resources: normalizeResources(state.visibilityPlayerResources) };
    player.structures[key] = structure;
  }
  for (const record of state.visibilityPlayerUnitRecords ?? []) {
    if (record.typeId !== "unit-footman" || record.construction) continue;
    if (!player.defenderCompletions.some((entry) => entry.unitId === record.id)) {
      player.defenderCompletions.push({ tick: state.tick, unitId: record.id, hitPoints: record.hitPoints });
    }
  }
  player.defenderCompletions = player.defenderCompletions.slice(0, REQUIRED_DEFENDERS);
}

function observeAiHall(ai, evidence, role, state) {
  ai.hall.maximumInFlight = Math.max(ai.hall.maximumInFlight, role.inFlight);
  ai.hall.maximumFoundations = Math.max(ai.hall.maximumFoundations, role.foundations);
  ai.hall.maximumCompleted = Math.max(ai.hall.maximumCompleted, role.completed);
  if (role.inFlight > 1 || role.foundations > 1 || role.completed > 1) {
    throw new Error(`AI Hall duplicated or overcommitted: ${JSON.stringify(role)}.`);
  }
  if (!ai.hall.order && role.inFlight === 1) {
    ai.hall.order = {
      tick: state.tick,
      pendingBuildOrders: evidence.pendingBuildOrders,
      reservedResources: evidence.reservedResources,
      playerResources: evidence.playerResources
    };
  }
  if (!ai.hall.foundation && role.foundations === 1) {
    ai.hall.foundation = {
      tick: state.tick,
      construction: evidence.constructions?.find((entry) => /hall/i.test(entry.buildingTypeId)) ?? evidence.constructions?.[0] ?? null,
      playerResources: evidence.playerResources
    };
  }
  if (!ai.hall.completion && role.completed === 1) {
    ai.hall.completion = { tick: state.tick, playerResources: evidence.playerResources };
  }
  if (ai.hall.order && !ai.hall.foundation && !ai.hall.completion && role.inFlight === 0 && role.foundations === 0 && role.completed === 0) {
    ai.hall.cancelled = true;
    throw new Error(`AI Hall unpaid order disappeared before foundation at tick ${state.tick}; cancellation is not accepted.`);
  }
}

function observeAiBarracks(ai, role, state) {
  if (role.completed > 2) throw new Error(`AI built duplicate Barracks beyond the requested two: ${JSON.stringify(role)}.`);
  while (ai.barracksCompletions.length < Math.min(2, role.completed)) {
    ai.barracksCompletions.push({ ordinal: ai.barracksCompletions.length + 1, tick: state.tick, completed: role.completed });
  }
}

function observeAiDurations(ai, evidence, state) {
  if (!ai.buildDuration) {
    const construction = evidence.constructions?.find((entry) => Number(entry.totalSeconds) > 0 && Number(entry.remainingSeconds) >= 0 && Number(entry.remainingSeconds) < Number(entry.totalSeconds));
    if (construction) ai.buildDuration = { tick: state.tick, ...construction };
  }
  if (!ai.trainDuration) {
    const queue = evidence.productionQueues?.find((entry) => Number(entry.headTotalSeconds) > 0 && Number(entry.headRemainingSeconds) >= 0 && Number(entry.headRemainingSeconds) < Number(entry.headTotalSeconds));
    if (queue) ai.trainDuration = { tick: state.tick, ...queue };
  }
}

function observeAiExploration(ai, evidence, state) {
  if (ai.exploration) return;
  const scout = evidence.exploration?.scoutDestinations?.[0];
  if (scout) {
    const acceptedScout = validateScoutDestinationProvenance(scout, { expectedPlayer: evidence.player, observationTick: state.tick });
    ai.exploration = {
      tick: state.tick,
      aiPlayer: evidence.player,
      exploredTiles: evidence.exploration.exploredTiles,
      totalTiles: evidence.exploration.totalTiles,
      scoutDestination: acceptedScout,
      loadValidation: null
    };
  }
}

function matchingLoadedScoutProvenance(state, currentLedger, context) {
  const exploration = currentLedger.evidence.ai.exploration;
  if (!exploration) return null;
  const aiState = currentAiState(state, currentLedger.evidence.ai.playerId);
  if (!aiState?.evidence || aiState.player !== exploration.aiPlayer) {
    throw new Error(`${context}: accepted scout AI player ${exploration.aiPlayer} is unavailable after load.`);
  }
  const acceptedScout = exploration.scoutDestination;
  const loadedScout = aiState.evidence.exploration?.scoutDestinations?.find((candidate) => candidate.unitId === acceptedScout.unitId
    && candidate.assignmentTick === acceptedScout.assignmentTick
    && candidate.assignmentTargetTileIndex === acceptedScout.assignmentTargetTileIndex);
  if (!loadedScout) throw new Error(`${context}: accepted scout assignment is absent from the loaded AI state.`);
  const validatedScout = validateScoutDestinationProvenance(loadedScout, { expectedPlayer: exploration.aiPlayer, observationTick: state.tick });
  if (stableJson(validatedScout) !== stableJson(acceptedScout)) {
    throw new Error(`${context}: loaded scout provenance differs from the accepted pre-save assignment.`);
  }
  return validatedScout;
}

function revalidateLoadedScoutProvenance(state, currentLedger) {
  const exploration = currentLedger.evidence.ai.exploration;
  if (!exploration || exploration.loadValidation) return;
  const scoutDestination = matchingLoadedScoutProvenance(state, currentLedger, "visible F12 scout revalidation");
  exploration.loadValidation = {
    loadedTick: state.tick,
    aiPlayer: exploration.aiPlayer,
    scoutDestination
  };
}

function assertScoutProvenancePresentAtCheckpoint(state, currentLedger) {
  const exploration = currentLedger.evidence.ai.exploration;
  if (!exploration || exploration.loadValidation) return;
  matchingLoadedScoutProvenance(state, currentLedger, "pre-F11 scout checkpoint");
}

function observeAiLaunches(ai, evidence, state) {
  const launches = [...(evidence.launches ?? [])].sort((left, right) => left.launchedTick - right.launchedTick || left.sourceForceId - right.sourceForceId);
  for (const launch of launches) {
    if (ai.launches.some((entry) => entry.sourceForceId === launch.sourceForceId && entry.launchedTick === launch.launchedTick)) continue;
    if (ai.launches.length >= EXPECTED_LAUNCH_SIZES.length) continue;
    const expectedSize = EXPECTED_LAUNCH_SIZES[ai.launches.length];
    const actualSize = launch.unitIds?.length ?? 0;
    if (actualSize !== expectedSize) {
      if (actualSize === 3 || actualSize === 15 || JSON.stringify(launch.unitIds ?? []) === JSON.stringify([1, 3, 15])) {
        throw new Error(`difficulty 2 produced 1/3/15; M08 requires literal 1/4/16 at source-neutral difficulty 3 (launch ${ai.launches.length + 1} size ${actualSize}).`);
      }
      throw new Error(`M08 launch ${ai.launches.length + 1} expected ${expectedSize} units, observed ${actualSize}: ${JSON.stringify(launch)}.`);
    }
    if (state.aiDifficulty !== 3) throw new Error(`M08 launch occurred at difficulty ${state.aiDifficulty}; source-neutral difficulty 3 is required.`);
    const previouslyLaunched = new Set(ai.launches.flatMap((entry) => entry.unitIds));
    const reused = launch.unitIds.filter((unitId) => previouslyLaunched.has(unitId));
    if (reused.length > 0) throw new Error(`M08 reused launched ids: ${reused.join(",")}.`);
    const orderKinds = (launch.units ?? []).map((unit) => ({ unitId: unit.unitId, orderKind: unit.orderKind }));
    if (orderKinds.length !== expectedSize || orderKinds.some((entry) => entry.orderKind !== "attack" && entry.orderKind !== "attack-move")) {
      throw new Error(`M08 launch ${expectedSize} lacks live attack order kinds: ${JSON.stringify(orderKinds)}.`);
    }
    ai.launches.push({
      ordinal: ai.launches.length + 1,
      sourceForceId: launch.sourceForceId,
      launchedTick: launch.launchedTick,
      unitIds: [...launch.unitIds],
      orderKinds
    });
  }
}

function observeAiContact(ai, evidence, state) {
  const contactOrders = evidence.visibilityPlayerContactOrders ?? [];
  const pressureContact = correlateNextPressureContact({
    launches: ai.launches,
    acceptedContacts: ai.pressureContacts,
    candidateOrders: contactOrders,
    observationTick: state.tick
  });
  if (!pressureContact) return;
  ai.pressureContacts.push({
    ...pressureContact,
    damagedVisibilityPlayerUnits: evidence.visibilityPlayerDamagedUnits ?? []
  });
}

function observePerformance(ai, state) {
  const progressTick = Math.max(
    ai.hall.completion?.tick ?? -1,
    ai.barracksCompletions.at(-1)?.tick ?? -1,
    ai.launches.at(-1)?.launchedTick ?? -1
  );
  if (progressTick < 0) return;
  const averageUpdateMs = Number(state.performance?.averageUpdateMs);
  const averageRenderMs = Number(state.performance?.averageRenderMs);
  if (!Number.isFinite(averageUpdateMs) || !Number.isFinite(averageRenderMs)) return;
  if (averageUpdateMs > 20 || averageRenderMs > 24) {
    throw new Error(`Progressed performance budget exceeded at tick ${state.tick}: update=${averageUpdateMs} render=${averageRenderMs}.`);
  }
  if (ai.performanceSamples.some((sample) => sample.tick === state.tick)) return;
  ai.performanceSamples.push({
    tick: state.tick,
    averageUpdateMs,
    averageRenderMs,
    aiHallCompleted: Boolean(ai.hall.completion),
    aiBarracksCompleted: ai.barracksCompletions.length,
    launches: ai.launches.length
  });
  ai.performanceSamples = ai.performanceSamples.slice(-32);
}

function currentAiState(state, expectedPlayerId = null) {
  const states = state?.aiStates ?? [];
  return states.find((entry) => entry.enabled && entry.evidence && (expectedPlayerId === null || entry.player === expectedPlayerId))
    ?? states.find((entry) => entry.enabled && entry.evidence)
    ?? null;
}

function unmetMilestone(currentLedger) {
  const evidence = currentLedger.evidence;
  if (!evidence.opening) return "one-Peasant/no-Hall/high-resources opening";
  if (evidence.difficultySamples.length < DIFFICULTY_SEQUENCE.length) {
    return `difficulty sequence sample ${DIFFICULTY_SEQUENCE[evidence.difficultySamples.length]}`;
  }
  if (!evidence.speed) return "visible speed down/up and maximum supported game speed";
  const structures = evidence.player.structures;
  if (!structures.hall.order) return "player Hall unpaid build order";
  if (!structures.hall.foundation) return "player Hall foundation";
  if (!structures.hall.completion) return "player Hall completion";
  if (!structures.farm.order) return "player Farm unpaid build order";
  if (!structures.farm.foundation) return "player Farm foundation";
  if (!structures.farm.completion) return "player Farm completion";
  if (!structures.barracks.order) return "player Barracks unpaid build order";
  if (!structures.barracks.foundation) return "player Barracks foundation";
  if (!structures.barracks.completion) return "player Barracks completion";
  if (evidence.player.defenderOrders.length < REQUIRED_DEFENDERS) return `player defender order ${evidence.player.defenderOrders.length + 1}/${REQUIRED_DEFENDERS}`;
  if (evidence.player.defenderCompletions.length < REQUIRED_DEFENDERS) return `player defender completion ${evidence.player.defenderCompletions.length + 1}/${REQUIRED_DEFENDERS}`;
  const ai = evidence.ai;
  if (!ai.hall.order) return "AI Hall unpaid travel order";
  if (!ai.hall.foundation) return "AI Hall paid foundation";
  if (!ai.hall.completion) return "AI Hall completion";
  if (ai.hall.cancelled) return "AI Hall order must remain uncancelled";
  if (ai.barracksCompletions.length < 1) return "AI first Barracks completion";
  if (ai.barracksCompletions.length < 2) return "AI second Barracks completion";
  if (!ai.buildDuration && !ai.trainDuration) return "one live AI build/train total+remaining duration";
  if (!ai.exploration) return "AI-owned exploration/scout destination";
  if (!ai.exploration.loadValidation) return "post-F12 scout provenance revalidation";
  if (ai.launches.length < 1) return "literal live level-3 launch size 1";
  if (ai.launches.length < 2) return "literal live level-3 launch size 4";
  if (ai.launches.length < 3) return "literal live level-3 launch size 16";
  if (ai.pressureContacts.length < 1) return "first 1-unit launch contact";
  if (ai.pressureContacts.length < 2) return "second 4-unit launch contact";
  if (ai.pressureContacts.length < 3) return "third 16-unit launch contact";
  const secondBarracksTick = ai.barracksCompletions[1]?.tick ?? Number.MAX_SAFE_INTEGER;
  if (!ai.performanceSamples.some((sample) => sample.tick >= secondBarracksTick && sample.averageUpdateMs <= 20 && sample.averageRenderMs <= 24)) return "update<=20/render<=24 at second Barracks";
  const launch16Tick = ai.launches[2]?.launchedTick ?? Number.MAX_SAFE_INTEGER;
  if (!ai.performanceSamples.some((sample) => sample.tick >= launch16Tick && sample.averageUpdateMs <= 20 && sample.averageRenderMs <= 24)) return "update<=20/render<=24 at live 16-unit pressure";
  if (evidence.difficultySamples.at(-1)?.difficulty !== 3) return "finish at source-neutral difficulty 3";
  if (currentLedger.acceptedCheckpoint?.slotIdentity?.aiDifficulty !== 3) return "accepted save at source-neutral difficulty 3";
  return null;
}

function playerBuildOrder(state, buildingTypeId) {
  return state.visibilityPlayerUnitRecords
    ?.map((record) => ({ builderId: record.id, ...record.order }))
    .find((order) => order.kind === "build" && order.buildingTypeId === buildingTypeId)
    ?? null;
}

function structureOrderPresent(state, buildingTypeId) {
  return Boolean(playerBuildOrder(state, buildingTypeId));
}

function structureFoundationPresent(state, buildingTypeId) {
  return state.visibilityPlayerUnitRecords?.some((record) => record.typeId === buildingTypeId && record.construction) === true;
}

function totalQueued(state, unitTypeId) {
  return (state.visibilityPlayerUnitRecords ?? []).reduce((total, record) => total + record.productionQueue.filter((entry) => entry.unitTypeId === unitTypeId).length, 0);
}

function completedTypeIds(state, unitTypeId) {
  return (state.visibilityPlayerUnitRecords ?? []).filter((record) => record.typeId === unitTypeId && !record.construction).map((record) => record.id);
}

async function readSaveSlot(page) {
  return page.evaluate((key) => window.localStorage.getItem(key), SAVE_SLOT_KEY);
}

async function waitForSaveSlot(page, predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastRaw = null;
  while (Date.now() < deadline) {
    lastRaw = await readSaveSlot(page);
    const save = parseSave(lastRaw);
    if (predicate(save, lastRaw)) return lastRaw;
    await delay(60);
  }
  throw new Error(`${label} did not produce the required exact slot JSON; last=${summarizeSave(parseSave(lastRaw))}.`);
}

function slotIdentity(raw) {
  const save = parseSave(raw);
  if (!save) throw new Error("Save slot JSON is missing or incompatible.");
  const visibilityPlayer = save.world.visibilityPlayer;
  const player = save.world.players?.find((entry) => entry.id === visibilityPlayer);
  return {
    rawSha256: sha256(raw),
    mapPath: save.mapPath,
    tick: save.world.tick,
    sourceGameSpeedDefault: save.world.engineSettings?.sourceGameSpeedDefault ?? null,
    aiDifficulty: save.world.engineSettings?.lastDifficultyDefault ?? null,
    visibilityPlayer,
    resources: normalizeResources(player?.resources),
    units: savedVisibilityPlayerUnitRecords(save)
  };
}

function assertSlotIdentity(raw, expected, context) {
  if (!raw) throw new Error(`${context}: save slot ${SAVE_SLOT} is empty.`);
  const actual = slotIdentity(raw);
  if (actual.rawSha256 !== expected.rawSha256 || stableJson(identityCore(actual)) !== stableJson(identityCore(expected))) {
    throw new Error(`${context}: exact slot identity mismatch; expected=${stableJson(expected)} actual=${stableJson(actual)}.`);
  }
}

function assertLoadedCheckpoint(state, expected) {
  if (state.paused !== true) throw new Error("Visible F12 load did not restore paused === true.");
  const actual = smokeIdentity(state);
  if (stableJson(actual) !== stableJson(identityCore(expected))) {
    throw new Error(`Visible F12 restored different tick/resources/units/source speed: expected=${stableJson(identityCore(expected))} actual=${stableJson(actual)}.`);
  }
}

function assertSavedCheckpoint(state, identity) {
  if (state.paused !== true) throw new Error("Visible F11 save was attempted without a paused checkpoint.");
  const actual = identityCore(identity);
  const expected = smokeIdentity(state);
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(`Visible F11 slot JSON differs from paused smoke state: smoke=${stableJson(expected)} slot=${stableJson(actual)}.`);
  }
}

function smokeIdentity(state) {
  return {
    mapPath: state.activeMapPath,
    tick: state.tick,
    sourceGameSpeedDefault: state.sourceGameSpeedDefault,
    aiDifficulty: state.aiDifficulty,
    visibilityPlayer: state.visibilityPlayer,
    resources: normalizeResources(state.visibilityPlayerResources),
    units: [...(state.visibilityPlayerUnitRecords ?? [])].sort((left, right) => left.id.localeCompare(right.id))
  };
}

function identityCore(identity) {
  const { rawSha256: _rawSha256, ...core } = identity;
  return core;
}

function savedVisibilityPlayerUnitRecords(save) {
  return (save.world.units ?? [])
    .filter((unit) => unit.player === save.world.visibilityPlayer && unit.hitPoints > 0)
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, 128)
    .map((unit) => {
      const order = unit.order ?? null;
      return {
        id: unit.id,
        typeId: unit.typeId,
        x: unit.x,
        y: unit.y,
        hitPoints: unit.hitPoints,
        maxHitPoints: unit.maxHitPoints,
        order: order ? {
          kind: typeof order.kind === "string" ? order.kind : "unknown",
          phase: typeof order.phase === "string" ? order.phase : null,
          buildingTypeId: typeof order.buildingTypeId === "string" ? order.buildingTypeId : null,
          targetId: typeof order.targetId === "string" ? order.targetId : null,
          targetX: typeof order.targetX === "number" ? order.targetX : null,
          targetY: typeof order.targetY === "number" ? order.targetY : null,
          tileX: typeof order.tileX === "number" ? order.tileX : null,
          tileY: typeof order.tileY === "number" ? order.tileY : null
        } : null,
        construction: unit.construction ? {
          builderId: unit.construction.builderId,
          totalSeconds: unit.construction.totalSeconds,
          remainingSeconds: unit.construction.remainingSeconds
        } : null,
        productionQueue: (unit.productionQueue ?? []).slice(0, 6).map((entry) => ({
          unitTypeId: entry.unitTypeId,
          totalSeconds: entry.totalSeconds,
          remainingSeconds: entry.remainingSeconds
        }))
      };
    });
}

function parseSave(raw) {
  if (!raw) return null;
  try {
    const save = JSON.parse(raw);
    return save?.version === 1 && save.world && typeof save.mapPath === "string" ? save : null;
  } catch {
    return null;
  }
}

function normalizeResources(resources) {
  return Object.fromEntries(Object.entries(resources ?? {}).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [key, Number(value)]));
}

function summarizeSave(save) {
  return save ? JSON.stringify({ mapPath: save.mapPath, tick: save.world?.tick, sourceGameSpeedDefault: save.world?.engineSettings?.sourceGameSpeedDefault }) : "null";
}

function assertDifficultyFactors(factors, expected, difficulty) {
  const values = [
    factors?.build,
    factors?.train,
    factors?.upgrade,
    factors?.research,
    factors?.resourceHarvest?.gold,
    factors?.resourceHarvest?.wood,
    factors?.resourceHarvest?.oil,
    factors?.resourceReturn?.gold,
    factors?.resourceReturn?.wood,
    factors?.resourceReturn?.oil
  ];
  if (values.some((value) => Number(value) !== expected)) {
    throw new Error(`Difficulty ${difficulty} speed factors must all equal ${expected}: ${JSON.stringify(factors)}.`);
  }
}

async function waitForSmoke(page, predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await readSmoke(page);
    if (predicate(state)) return state;
    await delay(60);
  }
  throw new Error(`Timed out waiting for ${label}; smoke=${JSON.stringify(smokeDiagnostic(state))}.`);
}

async function readSmoke(page) {
  return page.evaluate(() => window.__WARGUS_TS_SMOKE_STATE__ ?? null);
}

function smokeDiagnostic(state) {
  const ai = currentAiState(state);
  return {
    tick: state?.tick,
    paused: state?.paused,
    sourceGameSpeedDefault: state?.sourceGameSpeedDefault,
    aiDifficulty: state?.aiDifficulty,
    menuOverlay: state?.modernHud?.menuOverlay,
    pendingWorldCommandKind: state?.pendingWorldCommandKind,
    aiScriptIndex: ai?.evidence?.sourceScriptIndex,
    launches: ai?.evidence?.launches?.map((launch) => launch.unitIds?.length)
  };
}

async function waitForHttp(url, deadline, exitCode) {
  while (Date.now() < deadline) {
    const exit = exitCode();
    if (exit instanceof Error) throw new Error(`Vite preview failed to spawn: ${exit.message}`);
    if (exit !== null) throw new Error(`Vite preview exited early with code ${exit}.`);
    try {
      const response = await fetchBeforeDeadline(url, deadline, 400, "preview readiness probe");
      if (response.ok) return;
    } catch {
      // Retry only until this segment's bounded startup deadline.
    }
    const retryDelayMs = Math.max(0, Math.min(80, deadline - Date.now()));
    if (retryDelayMs > 0) await delay(retryDelayMs);
  }
  throw new Error(`Timed out waiting for production preview ${url}.`);
}

async function fetchBeforeDeadline(url, deadline, maximumMs, label) {
  const timeoutMs = boundedAwaitMs(deadline, Date.now(), maximumMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`${label} exceeded its ${timeoutMs}ms bounded startup budget.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function isPortOpen(port, timeoutMs = 300) {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
    socket.setTimeout(Math.max(1, timeoutMs), () => { socket.destroy(); resolve(false); });
  });
}

async function waitForPortClear(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isPortOpen(port, Math.min(100, Math.max(1, deadline - Date.now()))))) return;
    await delay(Math.min(40, Math.max(1, deadline - Date.now())));
  }
  throw new Error(`Exact PID cleanup failed port-clear proof for ${port}.`);
}

async function proveListenerClear(port, deadline) {
  const timeoutMs = Math.max(1, Math.min(800, deadline - Date.now()));
  try {
    await waitForPortClear(port, timeoutMs);
    return { port, clear: true, checkedAtMs: Date.now(), error: null };
  } catch (error) {
    return { port, clear: false, checkedAtMs: Date.now(), error: error instanceof Error ? error.message : String(error) };
  }
}

async function emergencyAttemptAudit(port, error) {
  const startedAtMs = Date.now();
  const listenerClear = await proveListenerClear(port, startedAtMs + 250);
  const cleanupErrors = [`segment failed before structured audit: ${error instanceof Error ? error.message : String(error)}`];
  if (!listenerClear.clear && listenerClear.error) cleanupErrors.push(listenerClear.error);
  const finishedAtMs = Date.now();
  return finalizeAttemptAudit({
    selectedPort: port,
    serverPid: null,
    browserPid: null,
    ownedServerPids: [],
    ownedBrowserPids: [],
    terminationAttempts: [],
    listenerClear,
    cleanupForced: false,
    cleanupReasons: ["emergency outer failure audit"],
    cleanupErrors,
    cleanupStartedAtMs: startedAtMs,
    cleanupFinishedAtMs: finishedAtMs,
    segmentStartedAtMs: startedAtMs,
    segmentFinishedAtMs: finishedAtMs
  });
}

function processTreePids(rootPid, deadline) {
  if (!Number.isInteger(rootPid) || rootPid <= 0) return [];
  const execOptions = boundedExecFileSyncOptions(deadline, Date.now(), { maximumMs: 250, maxBuffer: 1_048_576 });
  try {
    const output = execFileSync("ps", ["-eo", "pid=,ppid="], {
      encoding: "utf8",
      timeout: execOptions.timeout,
      maxBuffer: execOptions.maxBuffer,
      killSignal: "SIGKILL"
    });
    const rows = output.trim().split("\n").map((line) => line.trim().split(/\s+/).map(Number)).filter(([pid, parentPid]) => Number.isInteger(pid) && Number.isInteger(parentPid));
    const pids = [rootPid];
    for (let index = 0; index < pids.length; index += 1) {
      for (const [pid, parentPid] of rows) if (parentPid === pids[index] && !pids.includes(pid)) pids.push(pid);
    }
    return pids;
  } catch (error) {
    throw new Error(`bounded ps failed before ${deadline}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function stopExactPids(pids, deadline = Number.POSITIVE_INFINITY) {
  const exact = uniquePids(pids).reverse();
  const termSignaledPids = [];
  const killSignaledPids = [];
  for (const pid of exact) {
    try {
      process.kill(pid, "SIGTERM");
      termSignaledPids.push(pid);
    } catch { /* Already exited. */ }
  }
  const graceMs = Math.max(0, Math.min(180, deadline - Date.now()));
  if (graceMs > 0) await delay(graceMs);
  for (const pid of exact) {
    if (!processAlive(pid)) continue;
    try {
      process.kill(pid, "SIGKILL");
      killSignaledPids.push(pid);
    } catch { /* Already exited. */ }
  }
  const reapMs = Math.max(0, Math.min(50, deadline - Date.now()));
  if (reapMs > 0) await delay(reapMs);
  const stoppedPids = exact.filter((pid) => !processAlive(pid));
  const remainingPids = exact.filter((pid) => processAlive(pid));
  return { requestedPids: exact, termSignaledPids, killSignaledPids, stoppedPids, remainingPids };
}

function uniquePids(pids) {
  return [...new Set(pids.filter((pid) => Number.isInteger(pid) && pid > 0))];
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock() {
  if (existsSync(LOCK_PATH)) {
    const existingPid = Number(readFileSync(LOCK_PATH, "utf8").trim());
    if (Number.isInteger(existingPid) && processAlive(existingPid)) throw new Error(`Another Task 9 runner is active as PID ${existingPid}.`);
    unlinkSync(LOCK_PATH);
  }
  const fd = openSync(LOCK_PATH, "wx");
  writeFileSync(fd, `${process.pid}\n`, "utf8");
  return fd;
}

function releaseLock(fd) {
  if (fd === null) return;
  try { closeSync(fd); } catch { /* Already closed. */ }
  try { unlinkSync(LOCK_PATH); } catch { /* Already removed. */ }
}

function assertArtifactDirectoryOutsideRepo(directory) {
  const repo = path.resolve(process.cwd());
  const relative = path.relative(repo, directory);
  if (!relative || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error(`WARGUS_PLAN014_TASK9_ARTIFACT_DIR must be outside the repository: ${directory}`);
  }
}

function boundedInteger(raw, fallback, minimum, maximum) {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`Expected integer in ${minimum}..${maximum}, got ${raw}.`);
  return value;
}

function remainingMs(deadline) {
  return Math.max(1, deadline - Date.now());
}

async function withTimeout(promise, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); })]);
  } finally {
    clearTimeout(timer);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  return JSON.stringify(value);
}

function printAcceptedSegment(currentLedger, target, result) {
  const checkpoint = currentLedger.acceptedCheckpoint;
  console.log(`Accepted Task 9 segment ${checkpoint.acceptedSegment}: ${target}; tick ${checkpoint.startTick}->${checkpoint.checkpointTick}; page ${result.pageWallMs}ms; outer ${result.segmentWallMs}ms; storage ${checkpoint.storageStatePath}.`);
}

function printSummary(currentLedger, passed) {
  const ai = currentLedger.evidence.ai;
  const status = passed ? "PASS" : "INCOMPLETE";
  console.log(`Plan 014 Task 9 ${status}: accepted segments=${currentLedger.acceptedSegment}, next=${unmetMilestone(currentLedger) ?? "none"}.`);
  console.log(`Difficulty samples=${currentLedger.evidence.difficultySamples.map((sample) => `${sample.difficulty}:${sample.factors?.build}`).join(",") || "none"}; launches=${ai.launches.map((launch) => launch.unitIds.length).join("/") || "none"}; defenders=${currentLedger.evidence.player.defenderCompletions.length}/${REQUIRED_DEFENDERS}.`);
  console.log(`Machine checkpoint ledger: ${LEDGER_PATH}`);
  if (currentLedger.acceptedCheckpoint) console.log(`Latest accepted browser storageState: ${currentLedger.acceptedCheckpoint.storageStatePath}`);
}
