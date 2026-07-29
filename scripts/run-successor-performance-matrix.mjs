import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, copyFileSync, existsSync, openSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  BrowserExecutionController, collectHostMetrics, createArtifactDirectory,
  preflightArtifactRoot, qualifyRenderer, waitForReadiness
} from "./lib/browser-execution-controller.mjs";
import { publishChecksummedSummary } from "./lib/checksummed-summary-publisher.mjs";

// Successor runner derived from the audited Plan 018 protocol; raw packets preserve this exact source.
const PLAN_ID = process.env.WARGUS_PERF_PLAN?.trim();
if (!/^\d{3}$/.test(PLAN_ID ?? "")) throw new Error("WARGUS_PERF_PLAN must be a three-digit plan ID.");
const ACCEPTANCE_MODE = process.env.WARGUS_PERF_ACCEPTANCE_MODE?.trim();
if (!new Set(["incremental", "absolute-release"]).has(ACCEPTANCE_MODE)) throw new Error("WARGUS_PERF_ACCEPTANCE_MODE must be incremental or absolute-release.");
const ALL_ROWS = [
  ["idle-25", 1280, 720], ["idle-25", 1280, 720], ["army-100", 1280, 720],
  ["army-200", 1280, 720], ["command-18", 1280, 720], ["combat-100", 1280, 720],
  ["command-18", 1024, 768]
].map(([profile, width, height], index) => ({ row: index + 1, profile, viewport: { width, height } }));
const ROW_IDS = parseAssignedRows(PLAN_ID, process.env.WARGUS_MATRIX_ROWS);
const ROWS = ROW_IDS.map((row) => ALL_ROWS[row - 1]);
const OFFSETS_MS = [250, 1250, 2250, 3250, 4250, 5250, 6250, 7250, 8250, 9250];
const COMMAND_OFFSET_TOLERANCE_MS = 250;
const COMMAND_PAIR_DEADLINE_MS = 1000;
const RAF_AWAIT_TIMEOUT_MS = 100;
const SUMMARY_PUBLISHER_SOURCE = new URL("./lib/checksummed-summary-publisher.mjs", import.meta.url);
const FIXED_TICK_OFFSET = 600;
const FIXED_PROOF_PROFILE_IDS = ["idle-25", "army-100", "army-200", "command-18", "combat-100"];
const FIXED_PROOF_COMPARED_FIELDS = [
  "canonicalStateHash", "entity/effect counts and IDs", "positions", "hit points", "owners",
  "orders", "command targets", "scheduler requested/processed tick counts", "canonical save serialization"
];
const BUDGETS = { frameP95: 33.3, frameP99: 50, over50Percent: 1, dropped: 0, backlog: .25, heap: 15, command: 50, render: 100 };
const AMD_VULKAN_FLAGS = [
  "--use-gl=angle", "--use-angle=vulkan", "--enable-features=Vulkan", "--disable-vulkan-surface",
  "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-networking",
  "--disable-extensions", "--disable-dev-shm-usage", "--no-proxy-server", "--no-sandbox"
];
const full = process.env.WARGUS_RUN_FULL_MATRIX === "1";
const preflightOnly = process.env.WARGUS_MATRIX_PREFLIGHT_ONLY === "1";

function canonicalRowsForPlan(planId) {
  const rows = {
    "019": [3, 5, 7],
    "020": [6],
    "021": [3, 4, 6],
    "022": [3, 4, 6],
    "023": [3, 4, 5, 6, 7],
    "024": [4, 5, 6],
    "025": [3, 4, 6]
  }[planId];
  if (!rows) throw new Error("No canonical successor rows are registered for Plan " + planId + ".");
  return [...rows];
}

function parseAssignedRows(planId, raw) {
  const expected = canonicalRowsForPlan(planId);
  const requested = (raw ?? expected.join(",")).split(",").map((value) => Number(value));
  if (requested.length !== expected.length || requested.some((row, index) => row !== expected[index])) {
    throw new Error(`WARGUS_MATRIX_ROWS must equal the exact canonical rows for Plan ${planId}: ${expected.join(",")}.`);
  }
  return requested;
}

function targetedVerifierPaths(planId) {
  const verifiers = {
    "019": ["scripts/verify-terrain-metadata-cache.mjs"],
    "020": ["scripts/verify-unit-index.mjs"],
    "021": ["scripts/verify-render-preparation.mjs"],
    "022": ["scripts/verify-world-render-cache.mjs"],
    "023": ["scripts/verify-occupancy-index.mjs"],
    "024": ["scripts/verify-pathfinding-budget.mjs", "scripts/verify-x12-first-tick.mjs"],
    "025": ["scripts/verify-visibility-fog-incremental.mjs"]
  }[planId];
  if (!verifiers) throw new Error("No targeted work-reduction verifier is registered for Plan " + planId + ".");
  return [...verifiers];
}

async function main(mode) {
  const run = createRunDirectory();
  const captureLock = acquireCaptureLock(run);
  const releaseOnExit = () => releaseCaptureLock(captureLock);
  process.once("exit", releaseOnExit);
  const monitor = new HostMonitor(process.cwd());
  const controller = new BrowserExecutionController({ name: "plan-" + PLAN_ID + "-headless-matrix" });
  const state = { mode, validTrials: [], invalidTrials: [], locks: new Map(), cleanup: null, cleanupError: null, lockReleaseError: null, pageCloseErrors: [], finalizationErrors: [], matrixSummary: null, lockReleasedAt: null };
  let allocation = null;
  let browserServer = null;
  let browser = null;
  let environment = null;
  let mainError = null;
  try {
    monitor.record("pre"); monitor.assertStart();
    if (mode === "full") {
      assertCleanCaptureAttribution(run.captureSha);
      run.targetedWorkReductionProof = runTargetedWorkReductionProof(run.directory, run.captureSha);
    }
    assertCleanCaptureAttribution(run.captureSha);
    allocation = await controller.allocatePorts();
    const playwright = await import("playwright");
    const executable = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";
    environment = environmentRecord(run, executable, allocation, monitor, captureLock);
    writeJson(run.directory, "environment.json", environment);
    await controller.startViteServer({ port: allocation.serverPort, mode: "preview" });
    await controller.waitForHttp("http://127.0.0.1:" + allocation.serverPort + "/wargus/manifest.json");
    await controller.releasePort(allocation.debugPort);
    browserServer = await playwright.chromium.launchServer({
      executablePath: executable, headless: true,
      args: [...AMD_VULKAN_FLAGS, "--remote-debugging-port=" + allocation.debugPort]
    });
    controller.trackOwnedPid(browserServer.process().pid);
    browser = await playwright.chromium.connect(browserServer.wsEndpoint());
    const definitions = await dynamicProfileDefinitions();
    const preflight = await qualifyDisposablePages(browser, allocation.serverPort, definitions, state, environment, monitor, run.fixedProof);
    environment.profileLocks = Object.fromEntries(state.locks);
    writeJson(run.directory, "environment.json", environment);
    writeJson(run.directory, "browser-preflight.json", preflight);
    if (mode !== "preflight") {
      for (const row of ROWS) for (let slot = 1; slot <= 3; slot += 1) {
        state.validTrials.push(await trialSlot(browser, allocation.serverPort, row, slot, definitions, state, monitor, environment, run));
      }
    } else {
      writeJson(run.directory, "browser-preflight-resource.json", monitor.snapshot());
    }
  } catch (error) {
    mainError = error;
    try {
      writeJson(run.directory, mode === "preflight" ? "browser-preflight-failure.json" : "matrix-failure.json", errorRecord(error));
    } catch (writeError) {
      state.finalizationErrors.push({ step: "failure-record", ...errorRecord(writeError) });
    }
  } finally {
    try { await browser?.close(); } catch (error) { state.pageCloseErrors.push({ scope: "browser", ...errorRecord(error) }); }
    try { await browserServer?.close(); } catch (error) { state.pageCloseErrors.push({ scope: "browserServer", ...errorRecord(error) }); }
    try { state.cleanup = await controller.cleanup(); }
    catch (error) { state.cleanup = controller.lastCleanup; state.cleanupError = errorRecord(error); }
    try { monitor.record("post"); } catch (error) { state.finalizationErrors.push({ step: "post-resource-snapshot", ...errorRecord(error) }); }
    try { releaseCaptureLock(captureLock); state.lockReleasedAt = captureLock.releasedAt; } catch (error) { state.lockReleaseError = errorRecord(error); }
    process.removeListener("exit", releaseOnExit);
    const finalize = (step, action) => { try { action(); } catch (error) { state.finalizationErrors.push({ step, ...errorRecord(error) }); } };
    finalize("resource-monitor", () => writeJson(run.directory, "resource-monitor.json", monitor.snapshot()));
    finalize("controller-lifecycle", () => writeJson(run.directory, "controller-lifecycle.json", { allocation, lifecycle: controller.lifecycleLedger, cleanup: state.cleanup, cleanupError: state.cleanupError, pageCloseErrors: state.pageCloseErrors }));
    finalize("capture-lock-record", () => writeJson(run.directory, "capture-lock.json", { path: captureLock.path, acquiredAt: captureLock.acquiredAt, releasedAt: captureLock.releasedAt, releaseError: state.lockReleaseError }));
    if (mode === "full" && state.validTrials.length === ROWS.length * 3) {
      const result = publishChecksummedSummary(run.directory, matrixSummary(state, run, monitor, environment), {
        writeFailure: (failures) => writeJson(run.directory, "finalization-errors.json", [...state.finalizationErrors, ...failures])
      });
      state.matrixSummary = result.summary;
      if (!result.published) {
        state.finalizationErrors.push(...result.failures);
        if (result.failures.some((failure) => failure.step === "checksummed-summary-failure-record")) {
          finalize("checksummed-summary-failure-record-retry", () => writeJson(run.directory, "finalization-errors.json", state.finalizationErrors));
        }
      }
    } else {
      if (state.finalizationErrors.length > 0) finalize("finalization-errors", () => writeJson(run.directory, "finalization-errors.json", state.finalizationErrors));
      try { writeChecksums(run.directory); verifyChecksums(run.directory); }
      catch (error) {
        state.finalizationErrors.push({ step: "sha256-manifest", ...errorRecord(error) });
        finalize("finalization-errors", () => writeJson(run.directory, "finalization-errors.json", state.finalizationErrors));
        finalize("sha256-manifest-retry", () => { writeChecksums(run.directory); verifyChecksums(run.directory); });
      }
    }
  }
  const terminalErrors = [];
  if (mainError) terminalErrors.push(mainError);
  if (state.cleanupError) terminalErrors.push(new Error("Owned cleanup failed: " + state.cleanupError.message));
  if (state.lockReleaseError) terminalErrors.push(new Error("Capture lock release failed: " + state.lockReleaseError.message));
  if (state.pageCloseErrors.length > 0) terminalErrors.push(new Error("Page cleanup failed: " + state.pageCloseErrors.map((error) => error.scope + ": " + error.message).join("; ")));
  if (state.finalizationErrors.length > 0) terminalErrors.push(new Error("Capture finalization failed: " + state.finalizationErrors.map((error) => error.step + ": " + error.message).join("; ")));
  if (mode === "full" && state.matrixSummary?.acceptance?.accepted !== true) terminalErrors.push(new Error(`Successor performance matrix completed but selected ${ACCEPTANCE_MODE} acceptance verdict is NOT READY.`));
  if (terminalErrors.length === 1) throw terminalErrors[0];
  if (terminalErrors.length > 1) throw new AggregateError(terminalErrors, "Successor capture failed with primary and finalization errors.");
}

function createRunDirectory() {
  const captureSha = process.env.WARGUS_CAPTURE_SHA?.trim();
  if (!captureSha) throw new Error("WARGUS_CAPTURE_SHA is required.");
  assertCleanCaptureAttribution(captureSha);
  const preflight = preflightArtifactRoot({ disposableWorktree: process.cwd(), preservationOwner: process.env.WARGUS_ARTIFACT_PRESERVATION_OWNER });
  const configured = process.env.WARGUS_PERF_ARTIFACT_DIR;
  const stamp = configured ? path.basename(path.resolve(configured)) : new Date().toISOString().replace(/[-:.]/g, "");
  const expected = path.join(preflight.artifactRoot, "performance", PLAN_ID, captureSha, stamp);
  if (configured && path.resolve(configured) !== expected) throw new Error(`WARGUS_PERF_ARTIFACT_DIR must be ${expected}.`);
  const created = createArtifactDirectory({ preflight, plan: PLAN_ID, commit: captureSha, stamp });
  const existing = readdirSync(created.directory);
  if (existing.some((name) => name !== "fixed-tick-proof.json")) throw new Error("Successor artifact stamp must be fresh except for fixed-tick-proof.json; found " + existing.join(", "));
  copyFileSync(new URL(import.meta.url), path.join(created.directory, "capture-harness.mjs"));
  copyFileSync(SUMMARY_PUBLISHER_SOURCE, path.join(created.directory, "checksummed-summary-publisher.mjs"));
  const fixedProof = JSON.parse(readFileSync(path.join(created.directory, "fixed-tick-proof.json"), "utf8"));
  const sourceHash = applyPerformanceProfileSourceHash();
  validateFixedProof(fixedProof, captureSha, sourceHash);
  const baseline = loadAcceptedBaseline(preflight);
  return { ...created, preflight, captureSha, stamp, baseline, targetedWorkReductionProof: null, fixedProof: { file: "fixed-tick-proof.json", sha256: sha(readFileSync(path.join(created.directory, "fixed-tick-proof.json"))), commit: fixedProof.commit, applyPerformanceProfileSourceHash: sourceHash, value: fixedProof } };
}

function runTargetedWorkReductionProof(directory, captureSha) {
  const verifiers = targetedVerifierPaths(PLAN_ID);
  const results = verifiers.map((verifier) => {
    const startedAt = new Date().toISOString();
    const workingVerifier = existsSync(verifier) ? readFileSync(verifier) : null;
    let captureVerifier = null;
    try { captureVerifier = execFileSync("git", ["show", `${captureSha}:${verifier}`], { cwd: process.cwd(), timeout: 5000, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }); } catch { }
    const verifierSha256 = workingVerifier ? sha(workingVerifier) : null;
    const captureVerifierSha256 = captureVerifier ? sha(captureVerifier) : null;
    const exactCaptureVerifier = verifierSha256 !== null && verifierSha256 === captureVerifierSha256;
    const result = exactCaptureVerifier
      ? spawnSync(process.execPath, [verifier], { cwd: process.cwd(), encoding: "utf8", timeout: 300000, maxBuffer: 16 * 1024 * 1024 })
      : { status: null, signal: null, stdout: "", stderr: "", error: new Error("Targeted verifier is missing, untracked, or differs from the capture SHA: " + verifier) };
    return {
      command: `node ${verifier}`, verifier, verifierSha256, captureVerifierSha256, startedAt, completedAt: new Date().toISOString(),
      exitStatus: result.status, signal: result.signal ?? null, stdout: result.stdout ?? "", stderr: result.stderr ?? "",
      error: result.error ? errorRecord(result.error) : null,
      verdict: exactCaptureVerifier && !result.error && result.status === 0 ? "pass" : "fail"
    };
  });
  const proof = { schemaVersion: 2, planId: PLAN_ID, captureSha, verifiers: results, verdict: results.every((result) => result.verdict === "pass") ? "pass" : "fail" };
  writeJson(directory, "targeted-work-reduction-proof.json", proof);
  if (proof.verdict !== "pass") {
    const failed = results.filter((result) => result.verdict !== "pass").map((result) => `${result.verifier}: ${result.error?.message ?? (result.stderr || "nonzero verifier exit")}`);
    throw new Error("Targeted work-reduction proof failed for Plan " + PLAN_ID + ": " + failed.join("; "));
  }
  return { file: "targeted-work-reduction-proof.json", sha256: sha(readFileSync(path.join(directory, "targeted-work-reduction-proof.json"))), value: proof };
}
function validateFixedProof(fixedProof, captureSha, sourceHash) {
  const expectedCommand = `WARGUS_PERF_PLAN=${PLAN_ID} WARGUS_CAPTURE_SHA=${captureSha} WARGUS_PERF_FIXED_TICK_OFFSET=${FIXED_TICK_OFFSET} node scripts/verify-successor-fixed-tick.mjs`;
  if (fixedProof.commit !== captureSha) throw new Error("fixed-tick-proof.json capture SHA does not match WARGUS_CAPTURE_SHA.");
  if (fixedProof.equalityVerdict !== "pass") throw new Error("fixed-tick-proof.json equality verdict must be pass.");
  if (fixedProof.fixedTickOffset !== FIXED_TICK_OFFSET) throw new Error("fixed-tick-proof.json must use the accepted 600-tick offset.");
  if (fixedProof.command !== expectedCommand) throw new Error("fixed-tick-proof.json command is not the exact replayable accepted command.");
  if (fixedProof.initialProfileSetup?.sourceHash !== sourceHash) throw new Error("fixed-tick-proof.json applyPerformanceProfile sourceHash does not match src/main.ts.");
  if (stableJson(fixedProof.comparedFields) !== stableJson(FIXED_PROOF_COMPARED_FIELDS)) throw new Error("fixed-tick-proof.json compared fields drifted.");
  if (stableJson(fixedProof.profiles?.map((profile) => profile.id)) !== stableJson(FIXED_PROOF_PROFILE_IDS)) throw new Error("fixed-tick-proof.json must contain the five canonical profiles in order.");
  for (const profile of fixedProof.profiles) {
    if (profile.equal !== true || profile.fixedTickOffset !== FIXED_TICK_OFFSET) throw new Error("Fixed-tick profile did not pass at the accepted offset: " + profile.id);
    if (stableJson(profile.comparedFields) !== stableJson(FIXED_PROOF_COMPARED_FIELDS)) throw new Error("Fixed-tick profile compared fields drifted: " + profile.id);
    if (profile.runs?.length !== 2 || stableJson(profile.runs[0]) !== stableJson(profile.runs[1])) throw new Error("Fixed-tick profile must contain two identical deterministic runs: " + profile.id);
  }
}

function environmentRecord(run, executable, allocation, monitor, captureLock) {
  if (command("hostname", []) !== "halla") throw new Error("Plan " + PLAN_ID + " matrix must run on halla.");
  if (!process.cwd().startsWith("/home/halla/workspaces/")) throw new Error("Plan " + PLAN_ID + " requires an isolated Halla worktree.");
  const gpu = hostGpu();
  return {
    captureSha: run.captureSha, buildMode: "preview", allocation,
    browser: { executable, version: command(executable, ["--version"]) }, gpu,
    controllerCommit: command("git", ["log", "-1", "--format=%H", "--", "scripts/lib/browser-execution-controller.mjs"]),
    artifacts: { logicalPath: run.logicalPath, directory: run.directory, workspace: run.preflight.artifactWorkspace, root: run.preflight.artifactRoot, owner: run.preflight.preservationOwner },
    acceptedBaseline: run.baseline, captureLock: { path: captureLock.path, acquiredAt: captureLock.acquiredAt },
    harnessChecksum: sha(readFileSync(new URL(import.meta.url))), summaryPublisherChecksum: sha(readFileSync(SUMMARY_PUBLISHER_SOURCE)), fixedProof: run.fixedProof, targetedWorkReductionProof: run.targetedWorkReductionProof, hostAtStart: monitor.snapshot()
  };
}

function acceptedBaselineIdentity(artifactRoot, environment = process.env) {
  const accepted = {
    captureSha: "033629474959122749f6acb013ed6c2a0c0d2556",
    stamp: "20260729T051148Z",
    manifestSha256: "657dec5af935823fc27beaf16034b78813b4090244f22146effefc430040bed1"
  };
  accepted.directory = path.join(artifactRoot, "performance", "018", accepted.captureSha, accepted.stamp);
  if (environment.WARGUS_BASELINE_CAPTURE_SHA !== undefined && environment.WARGUS_BASELINE_CAPTURE_SHA.trim() !== accepted.captureSha) throw new Error("WARGUS_BASELINE_CAPTURE_SHA must match the accepted Plan 018 capture.");
  if (environment.WARGUS_BASELINE_MATRIX_DIR !== undefined && environment.WARGUS_BASELINE_MATRIX_DIR.trim() !== accepted.directory) throw new Error("WARGUS_BASELINE_MATRIX_DIR must match the accepted Plan 018 directory.");
  if (environment.WARGUS_BASELINE_MANIFEST_SHA256 !== undefined && environment.WARGUS_BASELINE_MANIFEST_SHA256.trim() !== accepted.manifestSha256) throw new Error("WARGUS_BASELINE_MANIFEST_SHA256 must match the accepted Plan 018 manifest.");
  return accepted;
}

function validateCaptureAttribution(captureSha, head, status) {
  if (!captureSha || captureSha !== head) throw new Error("WARGUS_CAPTURE_SHA must equal the checked-out capture SHA.");
  if (status !== "") throw new Error("Performance proof requires a clean worktree including tracked and untracked files; git status was: " + status);
  return { captureSha, head, clean: true };
}

function assertCleanCaptureAttribution(captureSha) {
  return validateCaptureAttribution(
    captureSha,
    command("git", ["rev-parse", "HEAD"]),
    command("git", ["status", "--porcelain", "--untracked-files=all"])
  );
}

function loadAcceptedBaseline(preflight) {
  const accepted = acceptedBaselineIdentity(preflight.artifactRoot);
  const captureSha = accepted.captureSha;
  const acceptedManifestSha256 = accepted.manifestSha256;
  const expectedDirectory = path.resolve(accepted.directory);
  const directory = realpathSync(expectedDirectory);
  if (directory !== expectedDirectory) throw new Error("Accepted Plan 018 baseline directory must resolve exactly to " + expectedDirectory);
  const manifestFile = path.join(directory, "sha256.json");
  if (sha(readFileSync(manifestFile)) !== acceptedManifestSha256) throw new Error("Plan 018 baseline manifest does not match the independently accepted SHA-256.");
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  const names = new Set();
  for (const record of manifest) {
    if (typeof record?.name !== "string" || record.name !== path.basename(record.name) || names.has(record.name) || record.name.match(/^[A-Za-z0-9._-]+/i)?.[0] !== record.name) throw new Error("Baseline manifest contains an unsafe or duplicate name.");
    names.add(record.name);
    const file = path.join(directory, record.name);
    if (!existsSync(file) || sha(readFileSync(file)) !== record.sha256) throw new Error("Accepted baseline checksum mismatch: " + record.name);
  }
  for (const required of ["matrix-summary.json", "environment.json", "browser-preflight.json", "fixed-tick-proof.json"]) if (!names.has(required)) throw new Error("Accepted baseline manifest is missing " + required);
  const summary = JSON.parse(readFileSync(path.join(directory, "matrix-summary.json"), "utf8"));
  const baselineEnvironment = JSON.parse(readFileSync(path.join(directory, "environment.json"), "utf8"));
  if (summary.run?.captureSha !== captureSha || summary.ready !== true || summary.qualifiedTrialCount !== 21 || summary.rows?.length !== ALL_ROWS.length) throw new Error("Accepted baseline identity, readiness, or canonical row count is invalid.");
  if (baselineEnvironment.captureSha !== captureSha || baselineEnvironment.buildMode !== "preview" || !baselineEnvironment.browser || !baselineEnvironment.gpu || !baselineEnvironment.profileLocks) throw new Error("Accepted baseline environment identity is incomplete.");
  const rows = {};
  summary.rows.forEach((entry, index) => {
    const canonical = ALL_ROWS[index];
    if (stableJson(entry.row) !== stableJson(canonical) || entry.trials?.length !== 3) throw new Error("Accepted baseline canonical row definition drifted at row " + (index + 1));
    const trials = entry.trials.map((trial, trialIndex) => {
      const expectedName = "row-" + canonical.row + "-slot-" + (trialIndex + 1) + ".json";
      if (trial.file !== expectedName || !names.has(trial.file)) throw new Error("Accepted baseline trial is not a canonical manifest member: " + trial.file);
      const value = JSON.parse(readFileSync(path.join(directory, trial.file), "utf8"));
      const lock = baselineEnvironment.profileLocks[canonical.profile];
      if (value.row?.row !== canonical.row || stableJson(value.row?.viewport) !== stableJson(canonical.viewport) || value.disposition?.qualified !== true || value.initialFingerprint?.hash !== lock?.fingerprintHash || value.profileDefinition?.hash !== lock?.definitionHash) throw new Error("Accepted baseline trial identity, qualification, or profile lock mismatch: " + trial.file);
      return value;
    });
    const qualification = { renderer: trials[0].qualification.renderer, browserViewport: trials[0].qualification.browserViewport, pixiViewport: trials[0].qualification.pixiViewport, executable: trials[0].qualification.executable, version: trials[0].qualification.version, gpu: trials[0].qualification.gpu };
    if (trials.some((trial) => stableJson({ renderer: trial.qualification.renderer, browserViewport: trial.qualification.browserViewport, pixiViewport: trial.qualification.pixiViewport, executable: trial.qualification.executable, version: trial.qualification.version, gpu: trial.qualification.gpu }) !== stableJson(qualification))) throw new Error("Accepted baseline row qualification is inconsistent: " + canonical.row);
    const trialBudgetFailureKeys = Object.fromEntries(trials.map((trial, trialIndex) => [
      entry.trials[trialIndex].file,
      Object.entries(trial.disposition?.budgetFailures ?? {}).filter(([, failed]) => failed === true).map(([key]) => key)
    ]));
    rows[canonical.row] = {
      worstFrameP95Ms: Math.max(...trials.map((trial) => trial.statistics.frame.p95Ms)),
      budgetFailureKeys: [...new Set(Object.values(trialBudgetFailureKeys).flat())],
      trialBudgetFailureKeys,
      trialFiles: entry.trials.map((trial) => trial.file),
      qualification
    };
  });
  return {
    captureSha, directory, logicalPath: path.posix.join(".artifacts", "performance", "018", captureSha, path.basename(directory)), manifestSha256: acceptedManifestSha256,
    environment: { buildMode: baselineEnvironment.buildMode, browser: baselineEnvironment.browser, gpu: baselineEnvironment.gpu, controllerCommit: baselineEnvironment.controllerCommit, profileLocks: baselineEnvironment.profileLocks }, rows
  };
}

function acquireCaptureLock(run) {
  const lockPath = path.join(run.preflight.artifactRoot, "performance", ".wargus-capture.lock");
  const acquiredAt = new Date().toISOString();
  const token = [process.pid, PLAN_ID, run.captureSha, acquiredAt].join(":");
  let descriptor;
  try {
    descriptor = openSync(lockPath, "wx", 0o600);
    try { writeFileSync(descriptor, JSON.stringify({ token, pid: process.pid, plan: PLAN_ID, captureSha: run.captureSha, worktree: process.cwd(), acquiredAt }) + "\n", "utf8"); }
    finally { closeSync(descriptor); }
  } catch (error) {
    if (descriptor !== undefined) { try { unlinkSync(lockPath); } catch { } }
    throw new Error("Another performance capture is active or the exclusive lock could not be created at " + lockPath + ": " + error.message);
  }
  return { path: lockPath, token, acquiredAt, releasedAt: null };
}

function releaseCaptureLock(lock) {
  if (!lock || lock.releasedAt) return;
  const record = JSON.parse(readFileSync(lock.path, "utf8"));
  if (record.token !== lock.token) throw new Error("Capture lock ownership changed; refusing to remove it.");
  unlinkSync(lock.path);
  lock.releasedAt = new Date().toISOString();
}

async function dynamicProfileDefinitions() {
  const source = readFileSync("src/performance/performanceProfiles.ts", "utf8");
  const typescript = await import("typescript");
  const compiled = typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.ES2022, target: typescript.ScriptTarget.ES2022 } });
  const module = await import("data:text/javascript;base64," + Buffer.from(compiled.outputText).toString("base64"));
  const result = new Map();
  for (const row of ROWS) if (!result.has(row.profile)) {
    const definition = module.getPerformanceProfile(row.profile);
    result.set(row.profile, { definition, hash: shaText(stableJson(definition)), sourceHash: sha(source) });
  }
  return result;
}

async function qualifyDisposablePages(browser, port, definitions, state, environment, monitor, fixedProof) {
  const results = [];
  const locks = state.locks;
  for (const row of new Map(ROWS.map((row) => [row.profile, row])).values()) {
    const page = await profilePage(browser, port, row);
    let primaryError = null;
    try {
      const { initial, initialFingerprint } = await resetAndFingerprintAtTickZero(page, row.profile, definitions.get(row.profile).definition);
      compareFixedProofFingerprint(fixedProof, row.profile, initialFingerprint);
      lockProfile(locks, row.profile, definitions.get(row.profile), initialFingerprint);
      const qualification = await qualifyPage(page, row, environment);
      const result = { row, qualification, definition: definitions.get(row.profile), fingerprint: initialFingerprint };
      if (row.profile === "command-18") {
        const synthetic = await page.evaluate(() => window.__WARGUS_TS_PERF_ACTION__?.());
        if (!synthetic?.issued || !synthetic.moveIssued || !synthetic.attackMoveIssued) throw new Error("Disposable synthetic command hook failed.");
        result.syntheticHook = synthetic;
        const realInputPair = await realPair(page, -1, 0, qualification.rafTimestamps.at(-1));
        if (realInputPair.outcomes.some((outcome) => !outcome.success)) throw new Error("Disposable real command input pairing failed.");
        result.realInputPair = realInputPair.outcomes;
      }
      results.push(result); monitor.record("preflight"); monitor.assertStop();
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      try {
        await page.context().close();
      } catch (closeError) {
        const recorded = { scope: `preflight-row-${row.row}`, ...errorRecord(closeError) };
        state.pageCloseErrors.push(recorded);
        if (primaryError) throw new AggregateError([primaryError, closeError], "Preflight qualification and page cleanup both failed.");
        throw new Error("Preflight page cleanup failed.", { cause: closeError });
      }
    }
  }
  return { measuredTrialsStarted: 0, qualifications: results, profileLocks: Object.fromEntries(locks) };
}

async function trialSlot(browser, port, row, slot, definitions, state, monitor, environment, run) {
  for (let replacement = 0; replacement <= 1; replacement += 1) {
    let page = null;
    let primaryError = null;
    try {
      page = await profilePage(browser, port, row);
      const trial = await measureTrial(page, row, slot, replacement, definitions, state.locks, monitor, environment, run.fixedProof);
      const file = `row-${row.row}-slot-${slot}${replacement ? "-replacement" : ""}.json`;
      writeJson(run.directory, file, trial); return { ...trial, file };
    } catch (error) {
      primaryError = error;
      const diagnostics = row.profile === "command-18" ? error?.diagnostics ?? commandTrialDiagnostics([], null) : null;
      const invalid = { row, slot, replacement, disposition: "invalid", reason: errorRecord(error), retainedAt: new Date().toISOString(), ...(diagnostics ?? {}) };
      if (error instanceof ResourceSafetyAbort) {
        state.invalidTrials.push(invalid);
        writeJson(run.directory, `invalid-row-${row.row}-slot-${slot}-attempt-${replacement + 1}.json`, invalid);
        throw error;
      }
      if (!isDiscardableTrialError(error)) throw error;
      state.invalidTrials.push(invalid);
      writeJson(run.directory, `invalid-row-${row.row}-slot-${slot}-attempt-${replacement + 1}.json`, invalid);
      if (replacement === 1) throw error;
    } finally {
      try {
        await page?.context().close();
      } catch (closeError) {
        const recorded = { scope: `row-${row.row}-slot-${slot}-attempt-${replacement + 1}`, ...errorRecord(closeError) };
        state.pageCloseErrors.push(recorded);
        if (primaryError) throw new AggregateError([primaryError, closeError], "Trial and page cleanup both failed.");
        throw new Error("Trial page cleanup failed.", { cause: closeError });
      }
    }
  }
  throw new Error("Trial replacement loop unexpectedly ended.");
}

async function profilePage(browser, port, row) {
  const context = await browser.newContext({ viewport: row.viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await page.goto(`http://127.0.0.1:${port}/?smoke=1&perfProfile=${encodeURIComponent(row.profile)}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await waitForReadiness({ probe: async () => {
    try { return await page.evaluate((profile) => { const value = window.__WARGUS_TS_PERF_SUMMARY__?.(); const smoke = window.__WARGUS_TS_SMOKE_STATE__; return { ready: smoke?.loadingVisible === false && value?.profile === profile && typeof window.__WARGUS_TS_PERF_START__ === "function", progress: `${smoke?.worldLoaded}:${value?.worldTick}:${value?.profile}` }; }, row.profile); }
    catch (error) { return { ready: false, progress: String(error) }; }
    }});
  } catch (error) {
    let closeError = null;
    try {
      await context.close();
    } catch (caught) {
      closeError = caught;
    }
    const cause = closeError
      ? new AggregateError([error, closeError], "Runtime readiness and context cleanup both failed.")
      : error;
    throw new InvalidTrialError("Runtime load or profile readiness failed.", cause);
  }
  return page;
}

async function measureTrial(page, row, slot, replacement, definitions, locks, monitor, environment, fixedProof) {
  const { initialFingerprint } = await resetAndFingerprintAtTickZero(page, row.profile, definitions.get(row.profile).definition);
  compareFixedProofFingerprint(fixedProof, row.profile, initialFingerprint);
  lockProfile(locks, row.profile, definitions.get(row.profile), initialFingerprint);
  const qualification = await qualifyPage(page, row, environment);
  await sleep(5000);
  const started = await page.evaluate((profile) => { window.__WARGUS_TS_PERF_RESET__?.(); return window.__WARGUS_TS_PERF_START__?.(profile); }, row.profile);
  if (!started || started.profile !== row.profile) throw new InvalidTrialError("Runtime profile did not start.");
  const t0 = process.hrtime.bigint(); let t15 = null; let stopped = null; let resourceAt = 0; let lastRaf = qualification.rafTimestamps.at(-1); const outcomes = [];
  try {
    await new BrowserExecutionController().runCapture({ intervalMs: 25, readFrame: async () => {
      const frame = await raf(page); lastRaf = frame.timestamp; return { rafAdvanced: frame.timestamp > 0 };
    }, shouldStop: async () => {
      const elapsed = Number(process.hrtime.bigint() - t0) / 1e6;
      if (elapsed - resourceAt >= 5000) { monitor.record("during"); try { monitor.assertStop(); } catch (error) { throw new ResourceSafetyAbort(error.message); } resourceAt = elapsed; }
      if (row.profile === "command-18") while (outcomes.length / 2 < OFFSETS_MS.length && elapsed >= OFFSETS_MS[outcomes.length / 2]) {
        const pair = await realPair(page, outcomes.length / 2, OFFSETS_MS[outcomes.length / 2], lastRaf, t0); outcomes.push(...pair.outcomes); lastRaf = pair.lastRaf;
      }
      if (!t15 && elapsed >= 15000) t15 = await summary(page);
      if (elapsed < 30000) return false;
      stopped = await page.evaluate(() => window.__WARGUS_TS_PERF_STOP__?.()); return true;
    }});
  } catch (error) {
    if (row.profile === "command-18") {
      let latest = started;
      try { latest = await summary(page); } catch { }
      if (error && typeof error === "object") error.diagnostics = commandTrialDiagnostics([...outcomes, ...(error.commandOutcomes ?? [])], latest);
    }
    throw error;
  }
  if (!t15 || !stopped) throw new Error("Required t15/t30 snapshots are missing.");
  const trial = { row, slot, replacement, qualification, profileDefinition: definitions.get(row.profile), initialFingerprint, started, t15, stopped, commandOutcomes: outcomes, heapGrowthPercent: heapGrowth(t15.heap, stopped.heap), statistics: statistics(stopped), disposition: { valid: true, qualified: true, dataUnqualification: [] } };
  if (!t15.heap?.supported || !stopped.heap?.supported) { trial.disposition.qualified = false; trial.disposition.dataUnqualification.push("heap API unsupported"); }
  if (row.profile === "command-18") {
    const diagnostics = commandTrialDiagnostics(outcomes, stopped);
    if (diagnostics.outcomeCount !== 20 || diagnostics.successfulOutcomeCount !== 20 || diagnostics.scheduleInvalid || diagnostics.inputToCommandSampleCount < 40 || diagnostics.inputToNextRenderSampleCount < 40) throw new InvalidTrialError("command-18 requires 20 scheduled real outcomes within the first 10 seconds and at least 40 samples for both latency distributions.", undefined, diagnostics);
  }
  trial.disposition.budgetFailures = budgetFailures(trial); return trial;
}

async function qualifyPage(page, row, environment) {
  const metadata = await page.evaluate(() => new Promise((resolve) => { const rafTimestamps = []; const next = (timestamp) => { rafTimestamps.push(timestamp); if (rafTimestamps.length < 3) requestAnimationFrame(next); else { const canvas = document.querySelector("canvas"); const gl = canvas?.getContext("webgl2"); const debug = gl?.getExtension("WEBGL_debug_renderer_info"); resolve({ webgl2: Boolean(gl), renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null, vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null, focused: document.hasFocus(), visibility: document.visibilityState, rafTimestamps, browserViewport: { width: innerWidth, height: innerHeight, devicePixelRatio }, canvasViewport: canvas ? { width: canvas.width, height: canvas.height } : null }); } }; requestAnimationFrame(next); }));
  const value = await summary(page); const advancing = metadata.rafTimestamps.every((time, index, all) => index === 0 || time > all[index - 1]);
  try { qualifyRenderer({ renderer: metadata.renderer, executable: environment.browser.executable, version: environment.browser.version, gpu: environment.gpu, viewport: metadata.browserViewport, focused: metadata.focused, visibility: metadata.visibility, rafAdvanced: advancing }); }
  catch (error) { throw new InvalidTrialError("Renderer, focus, visibility, or RAF qualification failed.", error); }
  if (!metadata.webgl2) throw new InvalidTrialError("WebGL2 hardware renderer is required.");
  if (metadata.browserViewport.width !== row.viewport.width || metadata.browserViewport.height !== row.viewport.height || value.viewport.width !== row.viewport.width || value.viewport.height !== row.viewport.height || value.viewport.resolution !== metadata.browserViewport.devicePixelRatio) throw new InvalidTrialError("Browser/Pixi viewport or resolution mismatch.");
  return { ...metadata, pixiViewport: value.viewport, executable: environment.browser.executable, version: environment.browser.version, gpu: environment.gpu };
}

async function summary(page) { const value = await page.evaluate(() => window.__WARGUS_TS_PERF_SUMMARY__?.()); if (!value) throw new Error("Runtime performance summary hook is unavailable."); return value; }
function fingerprint(debugUnits, definition, summaryValue) {
  const value = { entityCounts: summaryValue.entityCounts, units: debugUnits.map((unit) => ({ id: unit.id, typeId: unit.typeId, player: unit.player, x: unit.x, y: unit.y, hitPoints: unit.hitPoints })).sort((a, b) => a.id.localeCompare(b.id)), projectileIds: Array.from({ length: definition.projectileCount }, (_, index) => "__perf-combat-projectile-" + String(index).padStart(2, "0")).sort(), effectIds: Array.from({ length: definition.effectCount }, (_, index) => "__perf-combat-effect-" + String(index).padStart(2, "0")).sort() };
  return { ...value, hash: shaText(stableJson(value)) };
}
async function resetAndFingerprintAtTickZero(page, target, definition) {
  const staging = target === "idle-25" ? "army-100" : "idle-25";
  const captured = await page.evaluate(({ staging, target }) => {
    window.__WARGUS_TS_PERF_START__?.(staging);
    window.__WARGUS_TS_PERF_RESET__?.();
    const initial = window.__WARGUS_TS_PERF_START__?.(target);
    const debugUnits = (window.__WARGUS_TS_DEBUG_UNITS__?.() ?? []).map((unit) => ({ ...unit, hitPoints: window.__WARGUS_TS_UNIT_HIT_POINTS__?.(unit.id) ?? null }));
    return { initial, debugUnits };
  }, { staging, target });
  if (!captured.initial || captured.initial.profile !== target || captured.initial.worldTick !== 0) throw new Error("Could not atomically reapply " + target + " at tick 0.");
  const initialFingerprint = fingerprint(captured.debugUnits, definition, captured.initial);
  return { initial: captured.initial, initialFingerprint };
}
function compareFixedProofFingerprint(fixedProof, profile, fingerprint) {
  const expected = fixedProof.value.profiles?.find((entry) => entry.id === profile)?.runs?.[0]?.browserComparableInitialFingerprint;
  if (!expected) throw new Error("fixed-tick-proof.json lacks browserComparableInitialFingerprint for " + profile + ".");
  if (expected.hash !== fingerprint.hash || stableJson(expected) !== stableJson(fingerprint)) throw new Error("Browser initial fingerprint does not exactly match fixed-tick proof for " + profile + ".");
}
function applyPerformanceProfileSourceHash() { const source = readFileSync("src/main.ts", "utf8"); const start = source.indexOf("function applyPerformanceProfile("); const end = source.indexOf("\nfunction runPerformanceProfileAction", start); if (start < 0 || end < 0) throw new Error("Could not extract applyPerformanceProfile source."); return shaText(source.slice(start, end).trim()); }
function lockProfile(locks, profile, definition, fingerprint) { const value = { definitionHash: definition.hash, fingerprintHash: fingerprint.hash }; const previous = locks.get(profile); if (previous && stableJson(previous) !== stableJson(value)) throw new Error(`Profile ${profile} definition/fingerprint drifted across trials or viewports.`); locks.set(profile, value); }

async function realPair(page, pairIndex, scheduledIssueOffsetMs, previousRaf, measurementT0 = null) {
  const box = await page.locator("canvas").boundingBox(); if (!box) throw new InvalidTrialError("Canvas unavailable for real command input.");
  let move;
  try {
    move = await realCommand(page, "move", false, { x: box.x + box.width * .7, y: box.y + box.height * .65 }, previousRaf, measurementT0);
  } catch (error) {
    if (error instanceof InvalidTrialError && error.commandOutcome) error.commandOutcomes = [{ pairIndex, kind: "move", scheduledIssueOffsetMs, issueOffsetMs: error.commandOutcome.actualIssueOffsetMs, queueModifier: false, ...error.commandOutcome }];
    throw error;
  }
  const moveOutcome = { pairIndex, kind: "move", scheduledIssueOffsetMs, issueOffsetMs: move.actualIssueOffsetMs, queueModifier: false, ...move };
  let attack;
  try {
    attack = await realCommand(page, "attack-move", true, { x: box.x + box.width * .35, y: box.y + box.height * .65 }, move.rafTimestamp, measurementT0);
  } catch (error) {
    if (error instanceof InvalidTrialError && error.commandOutcome) error.commandOutcomes = [moveOutcome, { pairIndex, kind: "attack-move", scheduledIssueOffsetMs, issueOffsetMs: error.commandOutcome.actualIssueOffsetMs, queueModifier: true, ...error.commandOutcome }];
    throw error;
  }
  return { outcomes: [moveOutcome, { pairIndex, kind: "attack-move", scheduledIssueOffsetMs, issueOffsetMs: attack.actualIssueOffsetMs, queueModifier: true, ...attack }], lastRaf: attack.rafTimestamp };
}
function measurementOffsetMs(t0) { return t0 === null ? null : Number(process.hrtime.bigint() - t0) / 1e6; }
function withTimeout(promiseFactory, timeoutMs, label) {
  let timer = null;
  return Promise.race([
    Promise.resolve().then(promiseFactory),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms.`)), timeoutMs); })
  ]).finally(() => { if (timer !== null) clearTimeout(timer); });
}

async function awaitCommandPair({ before, previousRaf, readRaf, readSummary, nowMs = () => Number(process.hrtime.bigint()) / 1e6, delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)), deadlineMs = COMMAND_PAIR_DEADLINE_MS, rafTimeoutMs = RAF_AWAIT_TIMEOUT_MS, intervalMs = 25 }) {
  const deadlineAt = nowMs() + deadlineMs;
  let after = before;
  let rafTimestamp = previousRaf;
  for (;;) {
    let remainingMs = deadlineAt - nowMs();
    if (remainingMs <= 0) return { ready: false, after, rafTimestamp, error: new Error(`Real command pairing exceeded its absolute ${deadlineMs} ms deadline.`) };
    try {
      const frame = await withTimeout(readRaf, Math.max(1, Math.min(rafTimeoutMs, remainingMs)), "RAF");
      rafTimestamp = frame.timestamp;
      remainingMs = deadlineAt - nowMs();
      if (remainingMs <= 0) return { ready: false, after, rafTimestamp, error: new Error(`Real command pairing exceeded its absolute ${deadlineMs} ms deadline.`) };
      after = await withTimeout(readSummary, Math.max(1, remainingMs), "performance summary");
    } catch (error) {
      return { ready: false, after, rafTimestamp, error };
    }
    const inputToCommandDelta = after.inputToCommandSamples.length - before.inputToCommandSamples.length;
    const inputToNextRenderDelta = after.inputToNextRenderSamples.length - before.inputToNextRenderSamples.length;
    if (commandPairReady({ inputToCommandDelta, inputToNextRenderDelta, rafTimestamp, previousRaf })) return { ready: true, after, rafTimestamp, error: null };
    remainingMs = deadlineAt - nowMs();
    if (remainingMs <= 0) return { ready: false, after, rafTimestamp, error: new Error(`Real command pairing exceeded its absolute ${deadlineMs} ms deadline.`) };
    await delay(Math.min(intervalMs, remainingMs));
  }
}

async function realCommand(page, kind, queueModifier, point, previousRaf, measurementT0 = null) {
  const before = await summary(page);
  const actualIssueOffsetMs = measurementOffsetMs(measurementT0);
  await page.keyboard.press(kind === "move" ? "m" : "a");
  if (queueModifier) await page.keyboard.down("Shift");
  try { await page.mouse.click(point.x, point.y); } finally { if (queueModifier) await page.keyboard.up("Shift"); }
  const pair = await awaitCommandPair({ before, previousRaf, readRaf: () => raf(page), readSummary: () => summary(page) });
  if (!pair.ready) {
    const invalid = new InvalidTrialError("Missing required real-input outcome or next-render sample pairing.", pair.error);
    invalid.commandOutcome = commandOutcomeRecord({ actualIssueOffsetMs, before, after: pair.after, rafTimestamp: pair.rafTimestamp, previousRaf });
    throw invalid;
  }
  return commandOutcomeRecord({ actualIssueOffsetMs, before, after: pair.after, rafTimestamp: pair.rafTimestamp, previousRaf });
}
function commandOutcomeRecord({ actualIssueOffsetMs, before, after, rafTimestamp, previousRaf }) {
  const inputToCommandDelta = after.inputToCommandSamples.length - before.inputToCommandSamples.length;
  const inputToNextRenderDelta = after.inputToNextRenderSamples.length - before.inputToNextRenderSamples.length;
  return { actualIssueOffsetMs, success: commandPairReady({ inputToCommandDelta, inputToNextRenderDelta, rafTimestamp, previousRaf }), inputToCommandDelta, inputToNextRenderDelta, rawInputToCommandSliceMs: after.inputToCommandSamples.slice(before.inputToCommandSamples.length), rawInputToNextRenderSliceMs: after.inputToNextRenderSamples.slice(before.inputToNextRenderSamples.length), rafTimestamp };
}
async function raf(page) { return page.evaluate(() => new Promise((resolve) => requestAnimationFrame((timestamp) => resolve({ timestamp })))); }

function commandPairReady({ inputToCommandDelta, inputToNextRenderDelta, rafTimestamp, previousRaf }) {
  return inputToCommandDelta >= 2 && inputToNextRenderDelta >= 2 && rafTimestamp > previousRaf;
}

function commandTrialDiagnostics(outcomes, value) {
  return {
    outcomeCount: outcomes.length,
    successfulOutcomeCount: outcomes.filter((outcome) => outcome.success).length,
    inputToCommandSampleCount: value?.inputToCommandSamples?.length ?? 0,
    inputToNextRenderSampleCount: value?.inputToNextRenderSamples?.length ?? 0,
    scheduleInvalid: outcomes.some((outcome, index) => !Number.isFinite(outcome.actualIssueOffsetMs) || outcome.actualIssueOffsetMs < outcome.scheduledIssueOffsetMs || outcome.actualIssueOffsetMs > outcome.scheduledIssueOffsetMs + COMMAND_OFFSET_TOLERANCE_MS || (index > 0 && outcome.actualIssueOffsetMs < outcomes[index - 1].actualIssueOffsetMs)),
    outcomes
  };
}

function statistics(value) { return { frame: sampleStats(value.frameSamples), update: sampleStats(value.updateSamples), renderPreparation: sampleStats(value.renderPreparationSamples), inputToCommand: sampleStats(value.inputToCommandSamples), inputToNextRender: sampleStats(value.inputToNextRenderSamples), scheduler: value.scheduler }; }
function sampleStats(values) { const sorted = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b); const rank = (p) => sorted.length ? sorted[Math.ceil(sorted.length * p) - 1] : null; return { sampleCount: sorted.length, p50Ms: rank(.5), p95Ms: rank(.95), p99Ms: rank(.99), meanMs: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null, maxMs: sorted.at(-1) ?? null, thresholdCounts: { over16_7Ms: sorted.filter((value) => value > 16.7).length, over33_3Ms: sorted.filter((value) => value > 33.3).length, over50Ms: sorted.filter((value) => value > 50).length, over100Ms: sorted.filter((value) => value > 100).length } }; }
function budgetFailures(trial) { const frame = trial.statistics.frame; const result = { frameP95: exceeds(frame.p95Ms, BUDGETS.frameP95), frameP99: exceeds(frame.p99Ms, BUDGETS.frameP99), framesOver50: !frame.sampleCount || frame.thresholdCounts.over50Ms / frame.sampleCount * 100 > BUDGETS.over50Percent, schedulerDropped: trial.stopped.scheduler.droppedDeltaSeconds !== BUDGETS.dropped, schedulerBacklog: exceeds(trial.stopped.scheduler.maxBacklogSeconds, BUDGETS.backlog), heap: trial.heapGrowthPercent === null || exceeds(trial.heapGrowthPercent, BUDGETS.heap) }; if (trial.row.profile === "command-18") { result.inputToCommandP95 = exceeds(trial.statistics.inputToCommand.p95Ms, BUDGETS.command); result.inputToNextRenderP95 = exceeds(trial.statistics.inputToNextRender.p95Ms, BUDGETS.render); } return result; }
function successorAcceptance({ mode, baselineFailureKeys, afterFailureKeys, baselineWorstFrameP95Ms, afterWorstFrameP95Ms, prerequisitePass, targetedWorkReductionProofPass, noNewBudgetFailuresPass, frameP95RegressionPass, absoluteBudgetsPass }) {
  if (mode !== "incremental" && mode !== "absolute-release") throw new Error("Acceptance mode must be incremental or absolute-release.");
  const baselineKeys = baselineFailureKeys ?? [];
  const afterKeys = afterFailureKeys ?? [];
  const noNewPass = noNewBudgetFailuresPass ?? afterKeys.every((key) => baselineKeys.includes(key));
  const regressionPass = frameP95RegressionPass ?? (Number.isFinite(afterWorstFrameP95Ms) && Number.isFinite(baselineWorstFrameP95Ms) && baselineWorstFrameP95Ms > 0 && (afterWorstFrameP95Ms - baselineWorstFrameP95Ms) / baselineWorstFrameP95Ms * 100 <= 5);
  const absolutePass = absoluteBudgetsPass ?? afterKeys.length === 0;
  const incrementalAccepted = prerequisitePass === true && targetedWorkReductionProofPass === true && noNewPass && regressionPass;
  const absoluteReleaseAccepted = incrementalAccepted && absolutePass;
  return { mode, noNewBudgetFailuresPass: noNewPass, frameP95RegressionPass: regressionPass, absoluteBudgetsPass: absolutePass, incrementalAccepted, absoluteReleaseAccepted, accepted: mode === "incremental" ? incrementalAccepted : absoluteReleaseAccepted };
}
function matrixSummary(state, run, monitor, environment) {
  const rows = ROWS.map((row) => {
    const trials = state.validTrials.filter((trial) => trial.row.row === row.row);
    const invalid = state.invalidTrials.filter((trial) => trial.row.row === row.row);
    const failureKeys = [...new Set(trials.flatMap((trial) => Object.keys(trial.disposition.budgetFailures)))];
    const budgetFailureUnion = Object.fromEntries(failureKeys.map((key) => [key, trials.some((trial) => trial.disposition.budgetFailures[key]) ]));
    const afterWorstFrameP95Ms = trials.length === 3 ? Math.max(...trials.map((trial) => trial.statistics.frame.p95Ms)) : null;
    const baselineWorstFrameP95Ms = run.baseline.rows[row.row]?.worstFrameP95Ms ?? null;
    const frameP95RegressionPercent = Number.isFinite(afterWorstFrameP95Ms) && Number.isFinite(baselineWorstFrameP95Ms) && baselineWorstFrameP95Ms > 0
      ? (afterWorstFrameP95Ms - baselineWorstFrameP95Ms) / baselineWorstFrameP95Ms * 100
      : null;
    const qualified = trials.length === 3 && trials.every((trial) => trial.disposition.qualified);
    const afterFailureKeys = Object.entries(budgetFailureUnion).filter(([, failed]) => failed === true).map(([key]) => key);
    const baselineFailureKeys = run.baseline.rows[row.row]?.budgetFailureKeys ?? [];
    const acceptance = successorAcceptance({ mode: ACCEPTANCE_MODE, baselineFailureKeys, afterFailureKeys, baselineWorstFrameP95Ms, afterWorstFrameP95Ms, prerequisitePass: qualified, targetedWorkReductionProofPass: run.targetedWorkReductionProof?.value?.verdict === "pass" });
    return {
      row,
      trials: trials.map((trial) => ({ file: trial.file, slot: trial.slot, replacement: trial.replacement, disposition: trial.disposition })),
      invalid,
      baseline: { worstFrameP95Ms: baselineWorstFrameP95Ms, budgetFailureKeys: baselineFailureKeys },
      after: { worstFrameP95Ms: afterWorstFrameP95Ms, budgetFailureKeys: afterFailureKeys },
      frameP95RegressionPercent,
      acceptance,
      worstTrialDispositionUnion: { validSlots: trials.length, qualified, dataUnqualification: trials.flatMap((trial) => trial.disposition.dataUnqualification), budgetFailures: budgetFailureUnion, invalidAttempts: invalid.length }
    };
  });
  const qualifiedTrialCount = state.validTrials.filter((trial) => trial.disposition.qualified).length;
  const captureComplete = qualifiedTrialCount === ROWS.length * 3;
  const cleanupPass = !state.cleanupError && Array.isArray(state.cleanup?.residualPids) && state.cleanup.residualPids.length === 0 && Array.isArray(state.cleanup?.openPorts) && state.cleanup.openPorts.length === 0;
  const lockReleasePass = !state.lockReleaseError && typeof state.lockReleasedAt === "string";
  const finalizationPass = state.finalizationErrors.length === 0 && state.pageCloseErrors.length === 0;
  const noNewBudgetFailuresPass = rows.every((row) => row.acceptance.noNewBudgetFailuresPass);
  const frameP95RegressionPass = rows.every((row) => row.acceptance.frameP95RegressionPass);
  const absoluteBudgetsPass = rows.every((row) => row.acceptance.absoluteBudgetsPass);
  const comparability = successorComparability(state, run, environment);
  const targetedWorkReductionProofPass = run.targetedWorkReductionProof?.value?.verdict === "pass";
  const prerequisitePass = captureComplete && cleanupPass && lockReleasePass && finalizationPass && comparability.pass;
  const acceptance = successorAcceptance({ mode: ACCEPTANCE_MODE, prerequisitePass, targetedWorkReductionProofPass, noNewBudgetFailuresPass, frameP95RegressionPass, absoluteBudgetsPass });
  const ready = acceptance.accepted;
  return {
    schemaVersion: 3, mode: "full", captureComplete, ready, qualifiedTrialCount, invalidTrialCount: state.invalidTrials.length, budgets: BUDGETS,
    acceptance, lifecycle: { cleanupPass, lockReleasePass, finalizationPass, environmentAndFingerprintPass: comparability.pass, targetedWorkReductionProofPass }, comparability,
    run: { captureSha: run.captureSha, logicalPath: run.logicalPath, directory: run.directory, stamp: run.stamp, targetedWorkReductionProof: run.targetedWorkReductionProof },
    acceptedBaseline: run.baseline, environment, profileLocks: Object.fromEntries(state.locks), rows, resources: monitor.snapshot(),
    cleanup: state.cleanup, cleanupError: state.cleanupError, lockReleaseError: state.lockReleaseError,
    pageCloseErrors: state.pageCloseErrors, finalizationErrors: state.finalizationErrors
  };
}

function successorComparability(state, run, environment) {
  const expected = run.baseline.environment;
  const checks = {
    buildMode: environment?.buildMode === expected.buildMode,
    browser: stableJson(environment?.browser) === stableJson(expected.browser),
    gpu: stableJson(environment?.gpu) === stableJson(expected.gpu),
    controllerCommit: environment?.controllerCommit === expected.controllerCommit,
    profileLocks: ROWS.every((row) => stableJson(state.locks.get(row.profile)) === stableJson(expected.profileLocks[row.profile])),
    rows: ROWS.every((row) => {
      const expectedQualification = run.baseline.rows[row.row]?.qualification;
      const trials = state.validTrials.filter((trial) => trial.row.row === row.row);
      return trials.length === 3 && trials.every((trial) => stableJson({ renderer: trial.qualification.renderer, browserViewport: trial.qualification.browserViewport, pixiViewport: trial.qualification.pixiViewport, executable: trial.qualification.executable, version: trial.qualification.version, gpu: trial.qualification.gpu }) === stableJson(expectedQualification));
    })
  };
  return { pass: Object.values(checks).every(Boolean), checks, expected: { buildMode: expected.buildMode, browser: expected.browser, gpu: expected.gpu, controllerCommit: expected.controllerCommit, profileLocks: Object.fromEntries([...new Set(ROWS.map((row) => row.profile))].map((profile) => [profile, expected.profileLocks[profile]])) } };
}

class HostMonitor { constructor(workspace) { this.workspace = workspace; this.records = []; } record(phase) { const value = { phase, at: new Date().toISOString(), metrics: collectHostMetrics(this.workspace) }; this.records.push(value); return value; } assertStart() { const metrics = this.records.at(-1).metrics; if (metrics.memory.availableBytes < 4 * 1024 ** 3 || metrics.diskFreeBytes < 20 * 1024 ** 3) throw new Error("Halla start thresholds require 4 GiB MemAvailable and 20 GiB disk."); } assertStop() { const metrics = this.records.at(-1).metrics; if (metrics.memory.availableBytes < 2 * 1024 ** 3) throw new Error("MemAvailable below 2 GiB."); if (metrics.memory.swapUsedBytes > 8 * 1024 ** 3) throw new Error("Swap used above 8 GiB."); if (metrics.diskFreeBytes < 20 * 1024 ** 3) throw new Error("Workspace disk below 20 GiB."); } snapshot() { return { intervalMs: 5000, records: this.records }; } }
class InvalidTrialError extends Error { constructor(message, cause, diagnostics = null) { super(message, { cause }); this.name = "InvalidTrialError"; this.diagnostics = diagnostics; } }
class ResourceSafetyAbort extends Error {}
function isDiscardableTrialError(error) { return error instanceof InvalidTrialError || /Target page, context or browser has been closed|Page crashed|browser has disconnected/i.test(String(error?.message ?? error)); }
function hostGpu() { const pci = command("lspci", ["-nn"]); const device = pci.split("\n").find((line) => /VGA|3D|Display/.test(line))?.trim(); if (!device) throw new Error("GPU device metadata is required."); const slot = device.split(/\s+/)[0]; const kernel = command("lspci", ["-k", "-s", slot]); const driver = kernel.match(/Kernel driver in use:\s*(.+)/)?.[1]?.trim(); if (!driver) throw new Error("GPU driver metadata is required for " + slot + "."); return { device, driver }; }
function command(file, args) { return execFileSync(file, args, { encoding: "utf8", timeout: 5000 }).trim(); }
function heapGrowth(start, stop) { return start?.supported && stop?.supported ? (stop.usedJsHeapSize - start.usedJsHeapSize) / Math.max(start.usedJsHeapSize, 1) * 100 : null; }
function exceeds(value, budget) { return value === null || value === undefined || value > budget; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function stableJson(value) { return JSON.stringify(sort(value)); }
function sort(value) { if (Array.isArray(value)) return value.map(sort); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sort(value[key])])); return value; }
function sha(value) { return createHash("sha256").update(value).digest("hex"); }
function shaText(value) { return sha(Buffer.from(value)); }
function errorRecord(error) {
  const cause = error?.cause !== undefined ? errorRecord(error.cause) : null;
  const causeMessage = cause?.message ?? "";
  let pairingFailureKind = null;
  if (causeMessage.startsWith("RAF timed out after ") && causeMessage.endsWith(" ms.")) pairingFailureKind = "raf-timeout";
  else if (causeMessage.startsWith("performance summary timed out after ") && causeMessage.endsWith(" ms.")) pairingFailureKind = "summary-timeout";
  else if (causeMessage.startsWith("Real command pairing exceeded its absolute ") && causeMessage.endsWith(" ms deadline.")) pairingFailureKind = "absolute-deadline";
  return {
    name: error?.name ?? "Error",
    message: String(error?.message ?? error),
    stack: error?.stack ?? null,
    ...(cause ? { cause } : {}),
    ...(pairingFailureKind ? { pairingFailureKind } : {}),
    ...(error?.commandOutcome !== undefined ? { commandOutcome: error.commandOutcome } : {}),
    ...(error?.commandOutcomes !== undefined ? { commandOutcomes: error.commandOutcomes } : {}),
    ...(error?.diagnostics !== undefined && error.diagnostics !== null ? { diagnostics: error.diagnostics } : {})
  };
}
function writeJson(directory, name, value) { writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function writeChecksums(directory) { writeJson(directory, "sha256.json", readdirSync(directory).filter((name) => name !== "sha256.json").sort().map((name) => ({ name, sha256: sha(readFileSync(path.join(directory, name))) }))); }
function verifyChecksums(directory) {
  const manifest = JSON.parse(readFileSync(path.join(directory, "sha256.json"), "utf8"));
  const expectedNames = readdirSync(directory).filter((name) => name !== "sha256.json").sort();
  if (stableJson(manifest.map((record) => record.name)) !== stableJson(expectedNames)) throw new Error("sha256.json does not cover the exact retained artifact set.");
  for (const record of manifest) if (record.sha256 !== sha(readFileSync(path.join(directory, record.name)))) throw new Error("sha256.json verification failed for " + record.name + ".");
}

if (process.env.WARGUS_MATRIX_GUARD_CHECK === "1") {
  if (process.env.WARGUS_CAPTURE_SHA?.trim()) assertCleanCaptureAttribution(process.env.WARGUS_CAPTURE_SHA.trim());
  if (full && preflightOnly) throw new Error("Set only one Plan " + PLAN_ID + " matrix mode.");
  console.log("Plan " + PLAN_ID + " matrix guard check passed.");
} else if (full || preflightOnly) {
  if (full && preflightOnly) throw new Error("Set exactly one of WARGUS_RUN_FULL_MATRIX=1 or WARGUS_MATRIX_PREFLIGHT_ONLY=1.");
  await main(full ? "full" : "preflight");
} else {
  throw new Error("Refusing browser work: set WARGUS_MATRIX_PREFLIGHT_ONLY=1 or WARGUS_RUN_FULL_MATRIX=1.");
}
