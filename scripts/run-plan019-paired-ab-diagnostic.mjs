import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, readdirSync, renameSync, rmdirSync, rmSync, statfsSync, statSync, symlinkSync, unlinkSync, writeFileSync, accessSync, constants as fsConstants } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

import {
  BrowserExecutionController,
  collectHostMetrics,
  qualifyRenderer,
  waitForReadiness
} from "./lib/browser-execution-controller.mjs";
import {
  buildAlternatingPairs,
  classifyPairedDiagnostic,
  writeAndVerifyChecksumManifest
} from "./lib/paired-performance-analysis.mjs";

const IDENTITY = Object.freeze({
  baseCommit: "5b7d9cc81072c8aeda1ce1a9c22602569e1a691b",
  plan019Commit: "5935a17f456868051c2c16b2f0d8d2b4da56d115",
  coordinatorHarnessCommit: "82571c31a942cc38857f612ec6736cca05a174ce",
  profile: "army-100",
  viewport: Object.freeze({ width: 1280, height: 720, deviceScaleFactor: 1 }),
  durationMs: 30_000,
  pairCount: 15
});
const PINNED_HARNESS = "scripts/run-successor-performance-matrix.mjs";
const MANIFEST_ROUTE = "/wargus/manifest.json";
const CHROME_BIN = "/usr/bin/google-chrome";
const LOCK_RELATIVE_PATH = path.join("performance", ".wargus-capture.lock");
const DIAGNOSTIC_RELATIVE_PATH = path.join("diagnostics", "plan019-paired-ab");
const SUMMARY_NAME = "paired-diagnostic-summary.json";
const TEMP_PREFIX = ".wargus-paired-publish-";
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|mesa offscreen/i;
const AMD_VULKAN_RENDERER = /^ANGLE \(AMD,.*Vulkan.*AMD Radeon.*, radv\)$/i;
const AMD_VULKAN_FLAGS = [
  "--use-gl=angle", "--use-angle=vulkan", "--enable-features=Vulkan", "--disable-vulkan-surface",
  "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-networking",
  "--disable-extensions", "--disable-dev-shm-usage", "--no-proxy-server", "--no-sandbox"
];

export function canonicalIdentity() {
  return {
    ...IDENTITY,
    viewport: { ...IDENTITY.viewport }
  };
}

export function assertCoordinatorIdentity(record) {
  if (record?.hostname !== "halla") throw new Error("Plan 019 paired diagnostic must run on halla.");
  if (!record?.cwd?.startsWith("/home/halla/workspaces/")) throw new Error("Plan 019 paired diagnostic requires an isolated Halla coordinator worktree.");
  if (record.status !== "") throw new Error(`Plan 019 paired diagnostic requires a clean coordinator worktree; git status was: ${record.status}`);
  if (record.harnessAncestorPresent !== true || record.harnessMatchesPinnedCommit !== true) {
    throw new Error(`Coordinator must preserve the exact successor harness from ${IDENTITY.coordinatorHarnessCommit}.`);
  }
  return { ...record, clean: true };
}

export function validateArmWorktree({ arm, expectedCommit, head, status }) {
  if (!new Set(["base", "plan019"]).has(arm)) throw new Error(`Unknown diagnostic arm: ${arm}.`);
  if (head !== expectedCommit) throw new Error(`Disposable arm must use the exact ${arm} commit ${expectedCommit}; found ${head}.`);
  if (status !== "") throw new Error(`Disposable diagnostic requires a clean ${arm} worktree; git status was: ${status}`);
  return { arm, commit: head, clean: true };
}

export function assertTrialPacketComplete(trials) {
  if (!Array.isArray(trials) || trials.length !== IDENTITY.pairCount * 2) {
    throw new Error(`Paired diagnostic requires exactly 30 valid arms; found ${trials?.length ?? "missing"}.`);
  }
  const schedule = buildAlternatingPairs(IDENTITY.pairCount);
  const stamps = new Set();
  const keys = new Set();
  for (const trial of trials) {
    if (trial?.valid !== true || !Number.isInteger(trial.replacement) || trial.replacement < 0 || trial.replacement > 1) {
      throw new Error("Every retained verdict arm must be valid and use at most one replacement.");
    }
    if (typeof trial.stamp !== "string" || trial.stamp.length === 0 || stamps.has(trial.stamp)) {
      throw new Error("Every retained verdict arm must have a unique stamp.");
    }
    stamps.add(trial.stamp);
    const expected = schedule[trial.pair - 1];
    if (!expected || expected.order[trial.orderIndex] !== trial.arm) {
      throw new Error(`Pair ${trial.pair} arm ${trial.arm} violates the fixed alternating schedule.`);
    }
    const key = `${trial.pair}:${trial.arm}`;
    if (keys.has(key)) throw new Error(`Duplicate verdict arm ${key}.`);
    keys.add(key);
  }
  for (const { pair, order } of schedule) {
    for (const arm of order) if (!keys.has(`${pair}:${arm}`)) throw new Error(`Missing verdict arm ${pair}:${arm}.`);
  }
  return trials;
}

export function assertRetainedStorage({
  artifactWorkspace,
  artifactRoot,
  preservationOwner,
  disposableWorktree,
  requireFreeBytes = 20 * 1024 ** 3,
  verifyIgnored = true
}) {
  if (!artifactWorkspace || !artifactRoot || !preservationOwner || !disposableWorktree) {
    throw new Error("Retained artifact workspace, root, preservation owner, and disposable worktree are required.");
  }
  if (!existsSync(artifactWorkspace) || !statSync(artifactWorkspace).isDirectory()) {
    throw new Error(`Retained artifact workspace does not exist: ${artifactWorkspace}`);
  }
  const workspaceRealpath = realpathSync(artifactWorkspace);
  const expectedRoot = path.join(workspaceRealpath, ".artifacts");
  if (path.resolve(artifactRoot) !== expectedRoot || !existsSync(expectedRoot) || !statSync(expectedRoot).isDirectory()) {
    throw new Error(`Retained artifact root must be the existing directory ${expectedRoot}.`);
  }
  accessSync(expectedRoot, fsConstants.W_OK);
  const stats = statfsSync(expectedRoot);
  if (Number(stats.bavail) * Number(stats.bsize) < requireFreeBytes) {
    throw new Error(`Retained artifact root requires at least ${requireFreeBytes} free bytes.`);
  }
  const rootRealpath = realpathSync(expectedRoot);
  const disposableRealpath = realpathSync(disposableWorktree);
  if (!path.relative(disposableRealpath, rootRealpath).startsWith("..")) {
    throw new Error("Retained artifact root must be outside the coordinator worktree.");
  }
  if (verifyIgnored) {
    execFileSync("git", ["-C", workspaceRealpath, "check-ignore", "-q", ".artifacts/diagnostics/plan019-paired-ab/probe.json"], { stdio: "ignore" });
  }
  return { artifactWorkspace: workspaceRealpath, artifactRoot: rootRealpath, preservationOwner };
}

export function acquireDiagnosticLock({ artifactRoot, token = `${process.pid}:plan019-paired-ab:${new Date().toISOString()}` }) {
  const performanceDirectory = path.join(artifactRoot, "performance");
  mkdirSync(performanceDirectory, { recursive: true });
  const lockPath = path.join(artifactRoot, LOCK_RELATIVE_PATH);
  const acquiredAt = new Date().toISOString();
  let descriptor;
  try {
    descriptor = openSync(lockPath, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify({ token, pid: process.pid, diagnostic: "plan019-paired-ab", worktree: process.cwd(), acquiredAt })}\n`, "utf8");
  } catch (error) {
    if (descriptor !== undefined && existsSync(lockPath)) {
      try { unlinkSync(lockPath); } catch { }
    }
    throw new Error(`Another performance capture is active or the exclusive lock could not be created at ${lockPath}: ${error.message}`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return { path: lockPath, token, acquiredAt, releasedAt: null };
}

export function releaseDiagnosticLock(lock) {
  if (!lock || lock.releasedAt) return lock;
  const record = JSON.parse(readFileSync(lock.path, "utf8"));
  if (record.token !== lock.token) throw new Error("Capture lock ownership changed; refusing to remove it.");
  unlinkSync(lock.path);
  lock.releasedAt = new Date().toISOString();
  return lock;
}

export function assertManifestResponse(response) {
  if (response?.status !== 200) throw new Error(`Wargus manifest route must return HTTP 200; received ${response?.status ?? "no response"}.`);
  return { status: response.status };
}

export function validateQualification(record, { expectedRenderer, expectedFingerprintHash } = {}) {
  const raf = record?.rafTimestamps;
  const rafAdvanced = Array.isArray(raf) && raf.length >= 3 && raf.every((value, index) => Number.isFinite(value) && (index === 0 || value > raf[index - 1]));
  if (!record?.webgl2 || !record.renderer || SOFTWARE_RENDERER.test(record.renderer)) throw new Error(`Hardware renderer qualification failed: ${record?.renderer ?? "missing"}.`);
  if (!AMD_VULKAN_RENDERER.test(record.renderer)) throw new Error(`Renderer must be the qualified AMD Radeon Vulkan renderer; found ${record.renderer}.`);
  if (expectedRenderer !== undefined && record.renderer !== expectedRenderer) throw new Error(`Renderer identity changed: expected ${expectedRenderer}; found ${record.renderer}.`);
  if (record.focused !== true || record.visibility !== "visible" || !rafAdvanced) throw new Error("Qualification requires focus, visible document state, and advancing RAF.");
  const viewport = record.browserViewport;
  const pixi = record.pixiViewport;
  if (viewport?.width !== IDENTITY.viewport.width || viewport?.height !== IDENTITY.viewport.height || viewport?.devicePixelRatio !== IDENTITY.viewport.deviceScaleFactor) throw new Error("Browser viewport or DPR does not match the canonical row-3 identity.");
  if (pixi?.width !== IDENTITY.viewport.width || pixi?.height !== IDENTITY.viewport.height || pixi?.resolution !== IDENTITY.viewport.deviceScaleFactor) throw new Error("Pixi viewport or resolution does not match the canonical row-3 identity.");
  if (record.profile !== IDENTITY.profile || record.worldTick !== 0) throw new Error("Profile must be army-100 at tick zero during qualification.");
  if (!record.fingerprintHash || (expectedFingerprintHash !== undefined && record.fingerprintHash !== expectedFingerprintHash)) throw new Error("Tick-zero fingerprint mismatch.");
  return record;
}

export function validateCleanup(cleanup) {
  if (!Array.isArray(cleanup?.residualPids) || !Array.isArray(cleanup?.openPorts) || !Array.isArray(cleanup?.profileResiduals) || cleanup.residualPids.length > 0 || cleanup.openPorts.length > 0 || cleanup.profileResiduals.length > 0) {
    throw new Error(`Owned cleanup incomplete: residual PIDs=${cleanup?.residualPids?.join(",") ?? "missing"}; open ports=${cleanup?.openPorts?.join(",") ?? "missing"}; profile residuals=${cleanup?.profileResiduals?.join(",") ?? "missing"}.`);
  }
  return { residualPids: [], openPorts: [], profileResiduals: [] };
}

export function createOwnedBrowserProfile({ root, pair, arm, replacement }) {
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`Owned browser profile root is missing: ${root}.`);
  if (!Number.isInteger(pair) || pair < 1 || pair > IDENTITY.pairCount || !new Set(["base", "plan019"]).has(arm) || !Number.isInteger(replacement) || replacement < 0 || replacement > 1) throw new Error("Owned browser profile identity is invalid.");
  const profilePath = path.join(root, `pair-${String(pair).padStart(2, "0")}-${arm}-attempt-${replacement + 1}`);
  mkdirSync(profilePath, { mode: 0o700 });
  return profilePath;
}

export function removeOwnedBrowserProfile({ profilePath, root }) {
  const resolvedRoot = path.resolve(root);
  const resolvedProfile = path.resolve(profilePath);
  if (path.dirname(resolvedProfile) !== resolvedRoot) throw new Error(`Refusing to remove browser profile outside exact owned root ${resolvedRoot}.`);
  if (existsSync(resolvedProfile)) rmSync(resolvedProfile, { recursive: true, force: false });
  if (existsSync(resolvedProfile)) throw new Error(`Owned browser profile cleanup left residual ${resolvedProfile}.`);
  return { profilePath: resolvedProfile, removed: true };
}

export function buildSupportingPairedMetrics({ baseTrials, plan019Trials }) {
  classifyPairedDiagnostic({ baseTrials, plan019Trials });
  return baseTrials.map((base, index) => {
    const after = plan019Trials[index];
    const compare = (baseValue, afterValue) => compareMetric(baseValue, afterValue);
    return {
      pair: base.pair,
      frame: {
        p50Ms: compare(base.statistics.frame.p50Ms, after.statistics.frame.p50Ms),
        p95Ms: compare(base.statistics.frame.p95Ms, after.statistics.frame.p95Ms),
        p99Ms: compare(base.statistics.frame.p99Ms, after.statistics.frame.p99Ms),
        meanMs: compare(base.statistics.frame.meanMs, after.statistics.frame.meanMs),
        maxMs: compare(base.statistics.frame.maxMs, after.statistics.frame.maxMs),
        over50Count: compare(base.statistics.frame.thresholdCounts.over50Ms, after.statistics.frame.thresholdCounts.over50Ms),
        over100Count: compare(base.statistics.frame.thresholdCounts.over100Ms, after.statistics.frame.thresholdCounts.over100Ms)
      },
      update: {
        p95Ms: compare(base.statistics.update.p95Ms, after.statistics.update.p95Ms),
        meanMs: compare(base.statistics.update.meanMs, after.statistics.update.meanMs)
      },
      renderPreparation: {
        p95Ms: compare(base.statistics.renderPreparation.p95Ms, after.statistics.renderPreparation.p95Ms),
        meanMs: compare(base.statistics.renderPreparation.meanMs, after.statistics.renderPreparation.meanMs)
      },
      scheduler: {
        droppedDeltaSeconds: compare(base.stopped.scheduler.droppedDeltaSeconds, after.stopped.scheduler.droppedDeltaSeconds),
        maxBacklogSeconds: compare(base.stopped.scheduler.maxBacklogSeconds, after.stopped.scheduler.maxBacklogSeconds)
      }
    };
  });
}

function compareMetric(base, plan019) {
  if (!Number.isFinite(base) || base < 0 || !Number.isFinite(plan019) || plan019 < 0) throw new Error("Supporting paired metrics require non-negative finite values.");
  return {
    base: roundMetric(base),
    plan019: roundMetric(plan019),
    delta: roundMetric(plan019 - base),
    relativeDeltaPercent: base === 0 ? null : roundMetric((plan019 - base) / base * 100)
  };
}

function roundMetric(value) {
  return Number(value.toFixed(12));
}

export function advanceRafTimestamp(previousTimestamp, currentTimestamp) {
  if (!Number.isFinite(previousTimestamp) || !Number.isFinite(currentTimestamp) || currentTimestamp <= previousTimestamp) {
    throw new InvalidArmError(`Capture requires advancing RAF timestamps; previous=${previousTimestamp}, current=${currentTimestamp}.`);
  }
  return currentTimestamp;
}

export async function cleanupTrackedController(record, registry) {
  const cleanup = await record.controller.cleanup();
  const complete = { ...cleanup, profileResiduals: cleanup.profileResiduals ?? [] };
  validateCleanup(complete);
  registry.delete(record);
  return complete;
}

export function buildPairArmReference(trial, orderIndex) {
  if (!trial || !new Set(["base", "plan019"]).has(trial.arm) || !Number.isInteger(orderIndex) || orderIndex < 0 || orderIndex > 1 || typeof trial.file !== "string" || typeof trial.stamp !== "string" || trial.valid !== true) throw new Error("Valid trial identity is required for a pair-arm reference.");
  return { arm: trial.arm, orderIndex, file: trial.file, replacement: trial.replacement, stamp: trial.stamp, valid: true };
}

export function validatePublicationPacket(directory, summary) {
  if (summary?.captureComplete !== true || summary?.validTrialCount !== IDENTITY.pairCount * 2 || summary?.classification?.realRegression === undefined || !Array.isArray(summary?.supportingPairedMetrics) || summary.supportingPairedMetrics.length !== IDENTITY.pairCount) {
    throw new Error("READY packet requires capture classification, supporting metrics, and exactly 30 valid raw trials.");
  }
  const schedule = buildAlternatingPairs(IDENTITY.pairCount);
  if (!Array.isArray(summary.pairs) || summary.pairs.length !== schedule.length) throw new Error("READY packet requires exactly 15 summary pairs.");
  const pairsDocument = JSON.parse(readFileSync(path.join(directory, "pairs.json"), "utf8"));
  if (stableJson(pairsDocument.completed) !== stableJson(summary.pairs)) throw new Error("pairs.json completed references do not exactly match summary pairs.");
  const trialFiles = [];
  const stamps = new Set();
  for (const expected of schedule) {
    const pair = summary.pairs[expected.pair - 1];
    if (pair?.pair !== expected.pair || stableJson(pair.order) !== stableJson(expected.order) || !Array.isArray(pair.arms) || pair.arms.length !== 2) throw new Error(`Summary pair ${expected.pair} does not match the alternating schedule.`);
    for (const [orderIndex, arm] of expected.order.entries()) {
      const reference = pair.arms[orderIndex];
      if (reference?.arm !== arm || reference.orderIndex !== orderIndex || reference.valid !== true || !Number.isInteger(reference.replacement) || reference.replacement < 0 || reference.replacement > 1 || typeof reference.file !== "string" || path.basename(reference.file) !== reference.file || typeof reference.stamp !== "string" || stamps.has(reference.stamp)) throw new Error(`Summary pair ${expected.pair} ${arm} reference is invalid or non-unique.`);
      stamps.add(reference.stamp);
      const file = path.join(directory, reference.file);
      if (!existsSync(file)) throw new Error(`Missing valid raw trial ${reference.file}.`);
      const raw = JSON.parse(readFileSync(file, "utf8"));
      const expectedIdentity = { pair: expected.pair, arm, orderIndex, stamp: reference.stamp, replacement: reference.replacement, valid: true };
      const actualIdentity = Object.fromEntries(Object.keys(expectedIdentity).map((key) => [key, raw[key]]));
      if (stableJson(actualIdentity) !== stableJson(expectedIdentity)) throw new Error(`Raw trial identity mismatch for ${reference.file}.`);
      trialFiles.push(reference.file);
    }
  }
  const expectedFiles = [...trialFiles].sort();
  const actualFiles = readdirSync(directory).filter((name) => /^pair-\d{2}-(?:base|plan019)(?:-replacement)?\.json$/.test(name)).sort();
  const missing = expectedFiles.filter((name) => !actualFiles.includes(name));
  const extra = actualFiles.filter((name) => !expectedFiles.includes(name));
  if (missing.length > 0) throw new Error(`Missing valid raw trial files: ${missing.join(", ")}.`);
  if (extra.length > 0) throw new Error(`Extra unreferenced raw trial files: ${extra.join(", ")}.`);
  if (new Set(expectedFiles).size !== IDENTITY.pairCount * 2) throw new Error("Valid raw trial references must be unique across all 15 pairs.");
  return { trialFiles: expectedFiles, stamps: [...stamps] };
}

export function publishAtomicDiagnostic(directory, summary, { beforeReadyRename = () => {}, verifyFinalManifest = verifyProjectedManifest, readyRename = renameReadyLast } = {}) {
  validatePublicationPacket(directory, summary);
  const lifecycle = summary?.lifecycle;
  const requiredFiles = ["environment.json", "pairs.json", "resources.json", "lifecycle.json"];
  if (summary?.captureComplete !== true || summary.validTrialCount !== 30 || summary?.classification?.realRegression === undefined || summary?.pairs?.length !== IDENTITY.pairCount || lifecycle?.cleanupPass !== true || lifecycle?.profilesRemoved !== true || lifecycle?.worktreesRemoved !== true || lifecycle?.lockReleased !== true || lifecycle?.finalizationPass !== true || requiredFiles.some((name) => !existsSync(path.join(directory, name)))) {
    throw new Error("READY publication requires 30 valid arms, classification, 15 pairs, complete retained records, complete cleanup, removed profiles and worktrees, released lock, and successful finalization.");
  }
  const serial = `${process.pid}-${Date.now()}`;
  const paths = {
    downgraded: path.join(directory, `${TEMP_PREFIX}${serial}-downgraded.tmp`),
    ready: path.join(directory, `${TEMP_PREFIX}${serial}-ready.tmp`),
    manifest: path.join(directory, `${TEMP_PREFIX}${serial}-manifest.tmp`),
    summary: path.join(directory, SUMMARY_NAME),
    finalManifest: path.join(directory, "sha256.json")
  };
  const downgraded = downgradeSummary(summary);
  const ready = { ...summary, ready: true, lifecycle: { ...lifecycle, checksumManifestPass: true } };
  const activeTemps = [paths.downgraded, paths.ready, paths.manifest];
  try {
    writeDurable(paths.downgraded, downgraded);
    renameDurable(paths.downgraded, paths.summary, directory);
    cleanupOwnedTemps(directory);
    writeDurable(paths.ready, ready);
    const manifest = projectedManifest(directory, paths.ready);
    writeDurable(paths.manifest, manifest);
    verifyProjectedManifest(directory, paths.manifest, paths.ready);
    renameDurable(paths.manifest, paths.finalManifest, directory);
    verifyFinalManifest(directory, paths.finalManifest, paths.ready);
    const manifestResult = { path: paths.finalManifest, sha256: sha(readFileSync(paths.finalManifest)) };
    beforeReadyRename();
    readyRename(paths.ready, paths.summary, directory);
    return { published: true, summary: ready, manifest: manifestResult, failures: [] };
  } catch (error) {
    const failures = [errorRecord(error)];
    for (const temp of activeTemps) if (existsSync(temp)) {
      try { unlinkSync(temp); } catch { }
    }
    const failureTemp = path.join(directory, `${TEMP_PREFIX}${serial}-failure-downgrade.tmp`);
    try {
      writeDurable(failureTemp, downgraded);
      renameDurable(failureTemp, paths.summary, directory);
    } catch (downgradeError) {
      failures.push(errorRecord(downgradeError));
      try { if (existsSync(failureTemp)) unlinkSync(failureTemp); } catch { }
    }
    return { published: false, summary: downgraded, manifest: null, failures };
  }
}

function downgradeSummary(summary) {
  return {
    ...summary,
    ready: false,
    lifecycle: { ...summary.lifecycle, checksumManifestPass: false }
  };
}

function writeDurable(file, value) {
  let descriptor;
  try {
    descriptor = openSync(file, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function renameDurable(from, to, directory) {
  renameSync(from, to);
  syncDirectory(directory);
}

function renameReadyLast(from, to, directory) {
  syncDirectory(directory);
  renameSync(from, to);
}

function syncDirectory(directory) {
  const descriptor = openSync(directory, "r");
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function cleanupOwnedTemps(directory) {
  for (const name of readdirSync(directory)) {
    if (name.startsWith(TEMP_PREFIX) && name.endsWith(".tmp")) unlinkSync(path.join(directory, name));
  }
}

function artifactNames(directory) {
  return readdirSync(directory)
    .filter((name) => name !== "sha256.json" && !(name.startsWith(TEMP_PREFIX) && name.endsWith(".tmp")))
    .sort();
}

function projectedManifest(directory, readySummaryFile) {
  const names = artifactNames(directory);
  if (!names.includes(SUMMARY_NAME)) throw new Error(`Projected manifest requires ${SUMMARY_NAME}.`);
  return names.map((name) => ({
    name,
    sha256: sha(readFileSync(name === SUMMARY_NAME ? readySummaryFile : path.join(directory, name)))
  }));
}

function verifyProjectedManifest(directory, manifestFile, readySummaryFile) {
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  const names = artifactNames(directory);
  if (stableJson(manifest.map(({ name }) => name)) !== stableJson(names)) throw new Error("Projected checksum manifest does not cover the exact diagnostic artifact set.");
  for (const record of manifest) {
    const source = record.name === SUMMARY_NAME ? readySummaryFile : path.join(directory, record.name);
    if (record.sha256 !== sha(readFileSync(source))) throw new Error(`Projected checksum mismatch for ${record.name}.`);
  }
}

class InvalidArmError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = "InvalidArmError";
  }
}

class ResourceSafetyError extends Error {
  constructor(message) {
    super(message);
    this.name = "ResourceSafetyError";
  }
}

class LifecycleError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = "LifecycleError";
  }
}

async function runDiagnostic() {
  const coordinator = process.cwd();
  const identityRecord = inspectCoordinator(coordinator);
  assertCoordinatorIdentity(identityRecord);
  const retained = assertRetainedStorage({
    artifactWorkspace: process.env.WARGUS_ARTIFACT_WORKSPACE ?? "/home/halla/workspaces/t3/Wargus-TypeScript-retained-artifacts",
    artifactRoot: process.env.WARGUS_ARTIFACT_ROOT ?? "/home/halla/workspaces/t3/Wargus-TypeScript-retained-artifacts/.artifacts",
    preservationOwner: process.env.WARGUS_ARTIFACT_PRESERVATION_OWNER ?? "Wargus-TypeScript retained performance evidence",
    disposableWorktree: coordinator
  });
  const lock = acquireDiagnosticLock({ artifactRoot: retained.artifactRoot });
  const state = {
    abortController: new AbortController(),
    armWorktrees: [],
    controllers: new Set(),
    cleanupRecords: [],
    invalidTrials: [],
    validTrials: [],
    pairRecords: [],
    resourceRecords: [],
    finalizationErrors: [],
    profileRoot: null,
    profilePaths: new Set(),
    profilesRemoved: false,
    worktreesRemoved: false,
    lockReleased: false,
    directory: null
  };
  const onSignal = (signal) => state.abortController.abort(new Error(`Received ${signal}; aborting paired diagnostic.`));
  const sigint = () => onSignal("SIGINT");
  const sigterm = () => onSignal("SIGTERM");
  process.once("SIGINT", sigint);
  process.once("SIGTERM", sigterm);
  let terminalError = null;
  try {
    state.directory = createDiagnosticDirectory(retained.artifactRoot);
    createArmWorktrees(coordinator, state.armWorktrees);
    const environment = buildEnvironment(coordinator, retained, identityRecord, state.armWorktrees, lock);
    writeJson(state.directory, "environment.json", environment);
    writeJson(state.directory, "pairs.json", { schemaVersion: 1, schedule: buildAlternatingPairs(IDENTITY.pairCount), completed: [], invalid: [] });
    const locks = { renderer: null, fingerprintHash: null, definitionHash: null };
    for (const pairSpec of buildAlternatingPairs(IDENTITY.pairCount)) {
      const pairRecord = { pair: pairSpec.pair, order: pairSpec.order, arms: [] };
      for (const [orderIndex, arm] of pairSpec.order.entries()) {
        throwIfAborted(state.abortController.signal);
        const worktree = state.armWorktrees.find((candidate) => candidate.arm === arm);
        const trial = await captureArmWithReplacement({ coordinator, worktree, pair: pairSpec.pair, orderIndex, locks, state, environment });
        state.validTrials.push(trial);
        pairRecord.arms.push(buildPairArmReference(trial, orderIndex));
        writePairs(state);
      }
      state.pairRecords.push(pairRecord);
      writePairs(state);
    }
    assertTrialPacketComplete(state.validTrials);
    environment.qualificationLocks = { ...locks };
    writeJson(state.directory, "environment.json", environment);
    writeJson(state.directory, "resources.json", { schemaVersion: 1, records: state.resourceRecords });
  } catch (error) {
    terminalError = error;
  } finally {
    for (const controllerRecord of [...state.controllers]) {
      try {
        const cleanup = await cleanupTrackedController(controllerRecord, state.controllers);
        state.cleanupRecords.push({ scope: "final-sweep", cleanup });
      } catch (error) {
        state.finalizationErrors.push({ step: "controller-final-sweep", ...errorRecord(error) });
      }
    }
    try {
      for (const profilePath of [...state.profilePaths]) {
        removeOwnedBrowserProfile({ profilePath, root: state.profileRoot });
        state.profilePaths.delete(profilePath);
      }
      if (state.profileRoot && existsSync(state.profileRoot)) rmdirSync(state.profileRoot);
      state.profilesRemoved = state.profilePaths.size === 0 && (!state.profileRoot || !existsSync(state.profileRoot));
    } catch (error) {
      state.finalizationErrors.push({ step: "browser-profile-removal", ...errorRecord(error) });
    }
    try {
      removeArmWorktrees(coordinator, state.armWorktrees);
      state.worktreesRemoved = true;
    } catch (error) {
      state.finalizationErrors.push({ step: "worktree-removal", ...errorRecord(error) });
    }
    try {
      releaseDiagnosticLock(lock);
      state.lockReleased = Boolean(lock.releasedAt);
    } catch (error) {
      state.finalizationErrors.push({ step: "lock-release", ...errorRecord(error) });
    }
    process.removeListener("SIGINT", sigint);
    process.removeListener("SIGTERM", sigterm);
  }
  if (state.directory) {
    writeJson(state.directory, "resources.json", { schemaVersion: 1, records: state.resourceRecords });
    writeJson(state.directory, "lifecycle.json", {
      schemaVersion: 1,
      cleanupRecords: state.cleanupRecords,
      worktreesRemoved: state.worktreesRemoved,
      profilesRemoved: state.profilesRemoved,
      profileResiduals: [...state.profilePaths],
      captureLock: { path: lock.path, acquiredAt: lock.acquiredAt, releasedAt: lock.releasedAt },
      finalizationErrors: state.finalizationErrors
    });
  }
  if (terminalError || state.finalizationErrors.length > 0) {
    if (state.directory) {
      writeJson(state.directory, "diagnostic-failure.json", {
        error: terminalError ? errorRecord(terminalError) : null,
        finalizationErrors: state.finalizationErrors,
        validTrialCount: state.validTrials.length,
        invalidTrialCount: state.invalidTrials.length,
        ready: false
      });
      try { writeAndVerifyChecksumManifest(state.directory); } catch { }
    }
    const errors = [terminalError, ...state.finalizationErrors.map((record) => new Error(`${record.step}: ${record.message}`))].filter(Boolean);
    throw errors.length === 1 ? errors[0] : new AggregateError(errors, "Paired diagnostic failed with capture or finalization errors.");
  }
  const baseTrials = state.validTrials.filter(({ arm }) => arm === "base");
  const plan019Trials = state.validTrials.filter(({ arm }) => arm === "plan019");
  const classification = classifyPairedDiagnostic({ baseTrials, plan019Trials });
  const supportingPairedMetrics = buildSupportingPairedMetrics({ baseTrials, plan019Trials });
  const summary = {
    schemaVersion: 1,
    ready: true,
    captureComplete: true,
    validTrialCount: state.validTrials.length,
    invalidTrialCount: state.invalidTrials.length,
    identity: canonicalIdentity(),
    pairs: state.pairRecords,
    classification,
    supportingPairedMetrics,
    lifecycle: {
      cleanupPass: state.cleanupRecords.length >= 30 && state.cleanupRecords.every(({ cleanup }) => cleanup.residualPids.length === 0 && cleanup.openPorts.length === 0 && cleanup.profileResiduals.length === 0) && state.profilesRemoved,
      profilesRemoved: state.profilesRemoved,
      worktreesRemoved: state.worktreesRemoved,
      lockReleased: state.lockReleased,
      finalizationPass: state.finalizationErrors.length === 0
    }
  };
  const published = publishAtomicDiagnostic(state.directory, summary);
  if (!published.published) {
    writeJson(state.directory, "finalization-errors.json", published.failures);
    throw new Error(`Paired diagnostic atomic publication failed: ${published.failures.map(({ message }) => message).join("; ")}`);
  }
  console.log(`Plan 019 paired diagnostic READY: ${state.directory}`);
  console.log(`Manifest SHA-256: ${published.manifest.sha256}`);
}

function inspectCoordinator(coordinator) {
  const harnessAtPin = gitBlob(coordinator, `${IDENTITY.coordinatorHarnessCommit}:${PINNED_HARNESS}`);
  return {
    hostname: command("hostname", []),
    cwd: coordinator,
    head: git(coordinator, ["rev-parse", "HEAD"]),
    status: git(coordinator, ["status", "--porcelain", "--untracked-files=all"]),
    harnessAncestorPresent: runStatus("git", ["-C", coordinator, "merge-base", "--is-ancestor", IDENTITY.coordinatorHarnessCommit, "HEAD"]) === 0,
    harnessMatchesPinnedCommit: sha(readFileSync(path.join(coordinator, PINNED_HARNESS))) === sha(harnessAtPin)
  };
}

export function createDiagnosticDirectory(artifactRoot, requestedStamp = process.env.WARGUS_PAIRED_AB_STAMP?.trim()) {
  const stamp = requestedStamp || new Date().toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
  if (!/^\d{8}T\d{6}Z$/.test(stamp)) throw new Error("WARGUS_PAIRED_AB_STAMP must be a UTC basic timestamp such as 20260729T235959Z.");
  const parent = path.join(artifactRoot, DIAGNOSTIC_RELATIVE_PATH);
  mkdirSync(parent, { recursive: true });
  const directory = path.join(parent, stamp);
  if (existsSync(directory)) throw new Error(`Diagnostic stamp must be fresh and may not be reused: ${stamp}.`);
  mkdirSync(directory);
  return directory;
}

export function allocateArmWorktreeRecords({ root, definitions, registry = [], operations }) {
  operations.createRoot(root);
  try {
    for (const { arm, commit } of definitions) {
      const record = { arm, commit, worktree: path.join(root, arm), root, allocationAttempted: true, created: false };
      registry.push(record);
      operations.add(record);
      record.created = true;
      operations.validate(record);
    }
    return registry;
  } catch (allocationError) {
    try {
      cleanupArmWorktreeRecords({ root, records: registry, operations });
    } catch (cleanupError) {
      const error = new AggregateError([allocationError, cleanupError], "Worktree allocation and cleanup failed.");
      error.records = registry;
      throw error;
    }
    allocationError.records = registry;
    throw allocationError;
  }
}

export function cleanupArmWorktreeRecords({ root, records, operations }) {
  const errors = [];
  for (const record of [...records].reverse()) {
    try { operations.remove(record); } catch (error) { errors.push(error); }
  }
  try { operations.removeRoot(root); } catch (error) { errors.push(error); }
  if (errors.length > 0) throw new AggregateError(errors, "Worktree allocation cleanup failed.");
  return { rootRemoved: true, records: [...records] };
}

function createArmWorktrees(coordinator, registry) {
  const root = path.join("/home/halla/workspaces/t3", `.wargus-plan019-paired-${process.pid}`);
  if (existsSync(root)) throw new Error(`Disposable worktree root already exists: ${root}`);
  return allocateArmWorktreeRecords({
    root,
    definitions: [{ arm: "base", commit: IDENTITY.baseCommit }, { arm: "plan019", commit: IDENTITY.plan019Commit }],
    registry,
    operations: {
      createRoot: (target) => mkdirSync(target),
      add: (record) => execFileSync("git", ["-C", coordinator, "worktree", "add", "--detach", record.worktree, record.commit], { stdio: ["ignore", "ignore", "pipe"], timeout: 120_000 }),
      validate: validateArmIdentity,
      remove: (record) => removeArmWorktree(coordinator, record),
      removeRoot: (target) => { if (existsSync(target)) rmdirSync(target); }
    }
  });
}

function validateArmIdentity(record) {
  return validateArmWorktree({
    arm: record.arm,
    expectedCommit: record.commit,
    head: git(record.worktree, ["rev-parse", "HEAD"]),
    status: git(record.worktree, ["status", "--porcelain", "--untracked-files=all"])
  });
}

function removeArmWorktree(coordinator, record) {
  if (!existsSync(record.worktree)) return;
  validateArmIdentity(record);
  execFileSync("git", ["-C", coordinator, "worktree", "remove", record.worktree], { stdio: ["ignore", "ignore", "pipe"], timeout: 120_000 });
}

function removeArmWorktrees(coordinator, worktrees, explicitRoot = null) {
  const root = explicitRoot ?? worktrees[0]?.root;
  if (!root) return;
  return cleanupArmWorktreeRecords({
    root,
    records: worktrees,
    operations: {
      remove: (record) => removeArmWorktree(coordinator, record),
      removeRoot: (target) => { if (existsSync(target)) rmdirSync(target); }
    }
  });
}

function buildEnvironment(coordinator, retained, coordinatorIdentity, worktrees, lock) {
  if (!existsSync(CHROME_BIN)) throw new Error(`System Chrome is missing: ${CHROME_BIN}.`);
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    identity: canonicalIdentity(),
    coordinator: coordinatorIdentity,
    browser: { executable: CHROME_BIN, version: command(CHROME_BIN, ["--version"]) },
    gpu: hostGpu(),
    sources: Object.fromEntries(worktrees.map(({ arm, commit, worktree }) => [arm, {
      commit,
      worktree,
      packageLockSha256: sha(readFileSync(path.join(worktree, "package-lock.json")))
    }])),
    harness: {
      file: path.join(coordinator, "scripts/run-plan019-paired-ab-diagnostic.mjs"),
      sha256: sha(readFileSync(new URL(import.meta.url))),
      pinnedSuccessorHarnessCommit: IDENTITY.coordinatorHarnessCommit,
      pinnedSuccessorHarnessSha256: sha(gitBlob(coordinator, `${IDENTITY.coordinatorHarnessCommit}:${PINNED_HARNESS}`))
    },
    artifacts: retained,
    lock: { path: lock.path, acquiredAt: lock.acquiredAt },
    hostAtStart: collectHostMetrics(coordinator)
  };
}

async function captureArmWithReplacement({ coordinator, worktree, pair, orderIndex, locks, state, environment }) {
  for (let replacement = 0; replacement <= 1; replacement += 1) {
    throwIfAborted(state.abortController.signal);
    const stamp = `pair-${String(pair).padStart(2, "0")}-${worktree.arm}-attempt-${replacement + 1}`;
    try {
      const trial = await captureArmAttempt({ coordinator, worktree, pair, orderIndex, replacement, stamp, locks, state, environment });
      const file = `pair-${String(pair).padStart(2, "0")}-${worktree.arm}${replacement ? "-replacement" : ""}.json`;
      writeJson(state.directory, file, trial);
      return { ...trial, file };
    } catch (error) {
      if (error instanceof LifecycleError || error instanceof ResourceSafetyError) throw error;
      const invalid = { pair, arm: worktree.arm, orderIndex, replacement, stamp, valid: false, retainedAt: new Date().toISOString(), reason: errorRecord(error) };
      state.invalidTrials.push(invalid);
      writeJson(state.directory, `invalid-pair-${String(pair).padStart(2, "0")}-${worktree.arm}-attempt-${replacement + 1}.json`, invalid);
      writePairs(state);
      if (replacement === 1) throw new Error(`Pair ${pair} ${worktree.arm} exhausted its single replacement.`, { cause: error });
    }
  }
  throw new Error("Arm replacement loop ended unexpectedly.");
}

async function captureArmAttempt({ coordinator, worktree, pair, orderIndex, replacement, stamp, locks, state, environment }) {
  validateArmIdentity(worktree);
  const dependencyLink = path.join(worktree.worktree, "node_modules");
  if (!state.profileRoot) {
    state.profileRoot = path.join("/tmp", `.wargus-plan019-paired-profiles-${process.pid}`);
    if (existsSync(state.profileRoot)) throw new LifecycleError(`Owned browser profile root already exists: ${state.profileRoot}.`);
    mkdirSync(state.profileRoot, { mode: 0o700 });
  }
  const profilePath = createOwnedBrowserProfile({ root: state.profileRoot, pair, arm: worktree.arm, replacement });
  state.profilePaths.add(profilePath);
  if (existsSync(dependencyLink)) throw new LifecycleError(`Disposable ${worktree.arm} worktree unexpectedly contains node_modules.`);
  symlinkSync(path.join(coordinator, "node_modules"), dependencyLink, "dir");
  const controller = new BrowserExecutionController({ name: `plan019-paired-${pair}-${worktree.arm}-${replacement + 1}` });
  const controllerRecord = { controller, pair, arm: worktree.arm, replacement };
  state.controllers.add(controllerRecord);
  const resources = [];
  let browser = null;
  let page = null;
  let captureError = null;
  try {
    const preResource = resourceRecord("pre", worktree, pair, replacement);
    assertResourceSafety(preResource.metrics, true);
    resources.push(preResource);
    const allocation = await controller.allocatePorts();
    await controller.releasePort(allocation.serverPort);
    controller.spawnOwned(process.execPath, [
      path.join(coordinator, "node_modules/vite/bin/vite.js"),
      worktree.worktree,
      "--host", "127.0.0.1",
      "--port", String(allocation.serverPort),
      "--strictPort",
      "--configLoader", "runner",
      "--logLevel", "error"
    ], { cwd: worktree.worktree, stdio: "ignore" });
    const manifestUrl = `http://127.0.0.1:${allocation.serverPort}${MANIFEST_ROUTE}`;
    await waitForReadiness({ probe: async () => {
      throwIfAborted(state.abortController.signal);
      try {
        const response = await fetch(manifestUrl);
        return { ready: response.status === 200, progress: `manifest-${response.status}` };
      } catch (error) {
        return { ready: false, progress: `manifest-${error.code ?? error.name}` };
      }
    }});
    assertManifestResponse(await fetch(manifestUrl));
    const playwright = await import("playwright");
    await controller.startChrome({
      chromeBin: CHROME_BIN,
      debugPort: allocation.debugPort,
      profilePath,
      extraArgs: [...AMD_VULKAN_FLAGS, `--window-size=${IDENTITY.viewport.width},${IDENTITY.viewport.height}`, "--force-device-scale-factor=1"]
    });
    await waitForReadiness({ probe: async () => {
      throwIfAborted(state.abortController.signal);
      try { const response = await fetch(`http://127.0.0.1:${allocation.debugPort}/json/version`); return { ready: response.status === 200, progress: `cdp-${response.status}` }; }
      catch (error) { return { ready: false, progress: `cdp-${error.code ?? error.name}` }; }
    }});
    browser = await playwright.chromium.connectOverCDP(`http://127.0.0.1:${allocation.debugPort}`);
    const context = browser.contexts()[0];
    if (!context) throw new InvalidArmError("System Chrome did not expose its owned default context.");
    page = await context.newPage();
    await page.setViewportSize({ width: IDENTITY.viewport.width, height: IDENTITY.viewport.height });
    await page.goto(`http://127.0.0.1:${allocation.serverPort}/?smoke=1&perfProfile=${IDENTITY.profile}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await waitForReadiness({ probe: async () => {
      throwIfAborted(state.abortController.signal);
      try {
        return await page.evaluate((profile) => {
          const value = window.__WARGUS_TS_PERF_SUMMARY__?.();
          const smoke = window.__WARGUS_TS_SMOKE_STATE__;
          return { ready: smoke?.loadingVisible === false && value?.profile === profile && typeof window.__WARGUS_TS_PERF_START__ === "function", progress: `${smoke?.worldLoaded}:${value?.worldTick}:${value?.profile}` };
        }, IDENTITY.profile);
      } catch (error) {
        return { ready: false, progress: String(error) };
      }
    }});
    const definition = await loadProfileDefinition(worktree.worktree);
    const { initial, initialFingerprint } = await resetAndFingerprintAtTickZero(page, definition.definition);
    const qualification = await qualifyPage(page, initial, initialFingerprint, environment);
    validateQualification(qualification, { expectedRenderer: locks.renderer ?? undefined, expectedFingerprintHash: locks.fingerprintHash ?? undefined });
    if (locks.definitionHash !== null && definition.hash !== locks.definitionHash) throw new InvalidArmError("Performance profile definition hash drifted between diagnostic arms.");
    locks.renderer ??= qualification.renderer;
    locks.fingerprintHash ??= initialFingerprint.hash;
    locks.definitionHash ??= definition.hash;
    await sleep(5_000);
    const started = await page.evaluate((profile) => {
      window.__WARGUS_TS_PERF_RESET__?.();
      return window.__WARGUS_TS_PERF_START__?.(profile);
    }, IDENTITY.profile);
    if (!started || started.profile !== IDENTITY.profile) throw new InvalidArmError("Runtime army-100 profile did not start.");
    const startedAt = process.hrtime.bigint();
    let t15 = null;
    let stopped = null;
    let lastResourceAt = 0;
    let lastRafTimestamp = qualification.rafTimestamps.at(-1);
    await controller.runCapture({
      intervalMs: 25,
      readFrame: async () => {
        throwIfAborted(state.abortController.signal);
        const frame = await withTimeout(page.evaluate(() => new Promise((resolve) => requestAnimationFrame((timestamp) => resolve({ timestamp, focused: document.hasFocus(), visibility: document.visibilityState })))), 2_000, "RAF");
        if (!frame.focused || frame.visibility !== "visible") throw new InvalidArmError("Document focus or visibility changed during capture.");
        lastRafTimestamp = advanceRafTimestamp(lastRafTimestamp, frame.timestamp);
        return { rafAdvanced: true };
      },
      shouldStop: async () => {
        const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        if (elapsedMs - lastResourceAt >= 5_000) {
          const duringResource = resourceRecord("during", worktree, pair, replacement, elapsedMs);
          assertResourceSafety(duringResource.metrics, false);
          resources.push(duringResource);
          lastResourceAt = elapsedMs;
        }
        if (!t15 && elapsedMs >= 15_000) t15 = await runtimeSummary(page);
        if (elapsedMs < IDENTITY.durationMs) return false;
        stopped = await page.evaluate(() => window.__WARGUS_TS_PERF_STOP__?.());
        return true;
      }
    });
    if (!t15 || !stopped) throw new InvalidArmError("Required 15-second and 30-second runtime snapshots are missing.");
    const completedAt = process.hrtime.bigint();
    resources.push(resourceRecord("post-capture", worktree, pair, replacement, Number(completedAt - startedAt) / 1e6));
    return {
      schemaVersion: 1,
      pair,
      arm: worktree.arm,
      orderIndex,
      commit: worktree.commit,
      replacement,
      stamp,
      valid: true,
      profile: IDENTITY.profile,
      viewport: { ...IDENTITY.viewport },
      durationMs: IDENTITY.durationMs,
      actualDurationMs: Number(completedAt - startedAt) / 1e6,
      qualification,
      profileDefinition: definition,
      initialFingerprint,
      started,
      t15,
      stopped,
      heapGrowthPercent: heapGrowth(t15.heap, stopped.heap),
      statistics: statistics(stopped),
      resources
    };
  } catch (error) {
    captureError = error instanceof InvalidArmError || error instanceof ResourceSafetyError
      ? error
      : new InvalidArmError(`Pair ${pair} ${worktree.arm} capture attempt ${replacement + 1} was invalid.`, error);
  } finally {
    const closeErrors = [];
    try { await page?.close(); } catch (error) { closeErrors.push(error); }
    try { await browser?.close(); } catch (error) { closeErrors.push(error); }
    let cleanup = null;
    try {
      const controllerCleanup = await cleanupTrackedController(controllerRecord, state.controllers);
      try {
        removeOwnedBrowserProfile({ profilePath, root: state.profileRoot });
        state.profilePaths.delete(profilePath);
      } catch (error) { closeErrors.push(error); }
      cleanup = { ...controllerCleanup, profileResiduals: existsSync(profilePath) ? [profilePath] : [] };
      validateCleanup(cleanup);
    } catch (error) {
      closeErrors.push(error);
      cleanup = { ...(controller.lastCleanup ?? { residualPids: ["unknown"], openPorts: ["unknown"] }), profileResiduals: existsSync(profilePath) ? [profilePath] : [] };
    }
    try { if (existsSync(dependencyLink)) unlinkSync(dependencyLink); } catch (error) { closeErrors.push(error); }
    try { validateArmIdentity(worktree); } catch (error) { closeErrors.push(error); }
    resources.push(resourceRecord("post-cleanup", worktree, pair, replacement));
    state.resourceRecords.push(...resources);
    state.cleanupRecords.push({ pair, arm: worktree.arm, replacement, cleanup, controllerLifecycle: controller.lifecycleLedger, errors: closeErrors.map(errorRecord) });
    if (closeErrors.length > 0) throw new LifecycleError(`Pair ${pair} ${worktree.arm} cleanup failed.`, new AggregateError(closeErrors));
  }
  if (captureError) throw captureError;
  throw new InvalidArmError(`Pair ${pair} ${worktree.arm} produced no trial.`);
}

async function loadProfileDefinition(worktree) {
  const source = readFileSync(path.join(worktree, "src/performance/performanceProfiles.ts"), "utf8");
  const typescript = await import("typescript");
  const compiled = typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.ES2022, target: typescript.ScriptTarget.ES2022 } });
  const module = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`);
  const definition = module.getPerformanceProfile(IDENTITY.profile);
  return { definition, hash: sha(Buffer.from(stableJson(definition))), sourceHash: sha(Buffer.from(source)) };
}

async function resetAndFingerprintAtTickZero(page, definition) {
  const captured = await page.evaluate((target) => {
    window.__WARGUS_TS_PERF_START__?.("idle-25");
    window.__WARGUS_TS_PERF_RESET__?.();
    const initial = window.__WARGUS_TS_PERF_START__?.(target);
    const debugUnits = (window.__WARGUS_TS_DEBUG_UNITS__?.() ?? []).map((unit) => ({ ...unit, hitPoints: window.__WARGUS_TS_UNIT_HIT_POINTS__?.(unit.id) ?? null }));
    return { initial, debugUnits };
  }, IDENTITY.profile);
  if (!captured.initial || captured.initial.profile !== IDENTITY.profile || captured.initial.worldTick !== 0) throw new InvalidArmError("Could not atomically apply army-100 at tick zero.");
  const value = {
    entityCounts: captured.initial.entityCounts,
    units: captured.debugUnits.map((unit) => ({ id: unit.id, typeId: unit.typeId, player: unit.player, x: unit.x, y: unit.y, hitPoints: unit.hitPoints })).sort((left, right) => left.id.localeCompare(right.id)),
    projectileIds: Array.from({ length: definition.projectileCount }, (_, index) => `__perf-combat-projectile-${String(index).padStart(2, "0")}`).sort(),
    effectIds: Array.from({ length: definition.effectCount }, (_, index) => `__perf-combat-effect-${String(index).padStart(2, "0")}`).sort()
  };
  return { initial: captured.initial, initialFingerprint: { ...value, hash: sha(Buffer.from(stableJson(value))) } };
}

async function qualifyPage(page, initial, fingerprint, environment) {
  const metadata = await page.evaluate(() => new Promise((resolve) => {
    const rafTimestamps = [];
    const next = (timestamp) => {
      rafTimestamps.push(timestamp);
      if (rafTimestamps.length < 3) requestAnimationFrame(next);
      else {
        const canvas = document.querySelector("canvas");
        const gl = canvas?.getContext("webgl2");
        const debug = gl?.getExtension("WEBGL_debug_renderer_info");
        resolve({
          webgl2: Boolean(gl),
          renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
          vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
          focused: document.hasFocus(),
          visibility: document.visibilityState,
          rafTimestamps,
          browserViewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
          canvasViewport: canvas ? { width: canvas.width, height: canvas.height } : null
        });
      }
    };
    requestAnimationFrame(next);
  }));
  const runtime = await runtimeSummary(page);
  const advancing = metadata.rafTimestamps.every((value, index) => index === 0 || value > metadata.rafTimestamps[index - 1]);
  try {
    qualifyRenderer({
      renderer: metadata.renderer,
      executable: environment.browser.executable,
      version: environment.browser.version,
      gpu: environment.gpu,
      viewport: metadata.browserViewport,
      focused: metadata.focused,
      visibility: metadata.visibility,
      rafAdvanced: advancing
    });
  } catch (error) {
    throw new InvalidArmError("Renderer, focus, visibility, or RAF qualification failed.", error);
  }
  return {
    ...metadata,
    pixiViewport: runtime.viewport,
    profile: runtime.profile,
    worldTick: initial.worldTick,
    fingerprintHash: fingerprint.hash,
    executable: environment.browser.executable,
    version: environment.browser.version,
    gpu: environment.gpu
  };
}

async function runtimeSummary(page) {
  const value = await page.evaluate(() => window.__WARGUS_TS_PERF_SUMMARY__?.());
  if (!value) throw new InvalidArmError("Runtime performance summary hook is unavailable.");
  return value;
}

function statistics(value) {
  return {
    frame: sampleStats(value.frameSamples),
    update: sampleStats(value.updateSamples),
    renderPreparation: sampleStats(value.renderPreparationSamples),
    inputToCommand: sampleStats(value.inputToCommandSamples),
    inputToNextRender: sampleStats(value.inputToNextRenderSamples),
    scheduler: value.scheduler
  };
}

function sampleStats(values) {
  const sorted = (values ?? []).filter((value) => Number.isFinite(value) && value >= 0).sort((left, right) => left - right);
  const rank = (percentile) => sorted.length ? sorted[Math.ceil(sorted.length * percentile) - 1] : null;
  return {
    sampleCount: sorted.length,
    p50Ms: rank(0.5),
    p95Ms: rank(0.95),
    p99Ms: rank(0.99),
    meanMs: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null,
    maxMs: sorted.at(-1) ?? null,
    thresholdCounts: {
      over50Ms: sorted.filter((value) => value > 50).length,
      over100Ms: sorted.filter((value) => value > 100).length
    }
  };
}

function resourceRecord(phase, worktree, pair, replacement, elapsedMs = null) {
  return { phase, at: new Date().toISOString(), pair, arm: worktree.arm, replacement, elapsedMs, metrics: collectHostMetrics(worktree.worktree) };
}

function assertResourceSafety(metrics, start) {
  const minimumMemory = (start ? 4 : 2) * 1024 ** 3;
  if (metrics.memory.availableBytes < minimumMemory) throw new ResourceSafetyError(`MemAvailable fell below ${start ? 4 : 2} GiB.`);
  if (metrics.memory.swapUsedBytes > 8 * 1024 ** 3) throw new ResourceSafetyError("Swap use exceeded 8 GiB.");
  if (metrics.diskFreeBytes < 20 * 1024 ** 3) throw new ResourceSafetyError("Workspace disk free fell below 20 GiB.");
}

function writePairs(state) {
  writeJson(state.directory, "pairs.json", {
    schemaVersion: 1,
    schedule: buildAlternatingPairs(IDENTITY.pairCount),
    completed: state.pairRecords,
    currentValidTrials: state.validTrials.map(({ pair, arm, orderIndex, replacement, stamp, file }) => ({ pair, arm, orderIndex, replacement, stamp, file })),
    invalid: state.invalidTrials
  });
}

function writeJson(directory, name, value) {
  writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function heapGrowth(start, stop) {
  return start?.supported && stop?.supported ? (stop.usedJsHeapSize - start.usedJsHeapSize) / Math.max(start.usedJsHeapSize, 1) * 100 : null;
}

function hostGpu() {
  const pci = command("lspci", ["-nn"]);
  const device = pci.split("\n").find((line) => /VGA|3D|Display/.test(line))?.trim();
  if (!device) throw new Error("GPU device metadata is required.");
  const slot = device.split(/\s+/)[0];
  const kernel = command("lspci", ["-k", "-s", slot]);
  const driver = kernel.match(/Kernel driver in use:\s*(.+)/)?.[1]?.trim();
  if (!driver) throw new Error(`GPU driver metadata is required for ${slot}.`);
  return { device, driver };
}

function throwIfAborted(signal) {
  if (signal.aborted) throw signal.reason ?? new Error("Paired diagnostic aborted.");
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new InvalidArmError(`${label} timed out after ${timeoutMs} ms.`)), timeoutMs); })
  ]).finally(() => clearTimeout(timer));
}

function command(file, args) {
  return execFileSync(file, args, { encoding: "utf8", timeout: 10_000, maxBuffer: 16 * 1024 * 1024 }).trim();
}

function git(cwd, args) {
  return command("git", ["-C", cwd, ...args]);
}

function gitBlob(cwd, spec) {
  return execFileSync("git", ["-C", cwd, "show", spec], { timeout: 10_000, maxBuffer: 16 * 1024 * 1024 });
}

function runStatus(file, args) {
  try {
    execFileSync(file, args, { stdio: "ignore", timeout: 10_000 });
    return 0;
  } catch (error) {
    return error.status ?? 1;
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function stableJson(value) {
  return JSON.stringify(sortObject(value));
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
  return value;
}

function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}

function errorRecord(error) {
  return {
    name: error?.name ?? "Error",
    message: String(error?.message ?? error),
    stack: error?.stack ?? null,
    ...(error?.cause ? { cause: errorRecord(error.cause) } : {})
  };
}

if (process.env.WARGUS_PAIRED_AB_CONTRACT_TEST !== "1") {
  await runDiagnostic();
}
