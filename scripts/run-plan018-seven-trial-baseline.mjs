import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, realpathSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { preflightArtifactRoot } from "./lib/browser-execution-controller.mjs";

const TARGET_SHA = "5b7d9cc81072c8aeda1ce1a9c22602569e1a691b";
const PLAN_ID = "018";
const ROWS = "1,2,3,4,5,6,7";

function canonicalBaselineIdentity() {
  return { targetSha: TARGET_SHA, planId: PLAN_ID, rows: ROWS, trialCountPerRow: 7, schemaVersion: 4 };
}

function command(file, args, options = {}) {
  return execFileSync(file, args, { encoding: "utf8", timeout: 30000, ...options }).trim();
}

function recordedCommand(file, args, cwd, timeout) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(file, args, { cwd, encoding: "utf8", timeout, maxBuffer: 32 * 1024 * 1024 });
  const record = {
    command: [file, ...args].join(" "), cwd, startedAt, completedAt: new Date().toISOString(),
    status: result.status, signal: result.signal ?? null, stdout: result.stdout ?? "", stderr: result.stderr ?? "",
    error: result.error ? { name: result.error.name, message: result.error.message } : null,
    pass: !result.error && result.status === 0
  };
  if (!record.pass) throw new Error(`Baseline prerequisite failed: ${record.command}\n${record.stdout}${record.stderr}${record.error?.message ?? ""}`);
  return record;
}

function ensureActualPreconditions(coordinatorRoot) {
  if (command("hostname", []) !== "halla") throw new Error("Plan 018 baseline coordinator must run on halla.");
  if (!coordinatorRoot.startsWith("/home/halla/workspaces/")) throw new Error("Coordinator must run from an isolated Halla checkout.");
  const coordinatorCommit = command("git", ["rev-parse", "HEAD"], { cwd: coordinatorRoot });
  const coordinatorStatus = command("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: coordinatorRoot });
  if (coordinatorStatus !== "") throw new Error("Baseline coordinator requires a clean reviewed worktree.");
  command("git", ["cat-file", "-e", `${TARGET_SHA}^{commit}`], { cwd: coordinatorRoot });
  return { coordinatorCommit, coordinatorStatus };
}

async function main() {
  const coordinatorRoot = realpathSync(process.cwd());
  const { coordinatorCommit } = ensureActualPreconditions(coordinatorRoot);
  const stamp = new Date().toISOString().replace(/[-:.]/g, "");
  const targetWorktree = path.join("/home/halla/workspaces", `Wargus-TypeScript-plan018-baseline-${stamp}`);
  const coordinatorNodeModules = realpathSync(path.join(coordinatorRoot, "node_modules"));
  const targetNodeModules = path.join(targetWorktree, "node_modules");
  const fixedVerifier = realpathSync(path.join(coordinatorRoot, "scripts/verify-successor-fixed-tick.mjs"));
  const matrixHarness = realpathSync(path.join(coordinatorRoot, "scripts/run-successor-performance-matrix.mjs"));
  if (existsSync(targetWorktree)) throw new Error("Fresh baseline worktree path already exists: " + targetWorktree);
  let worktreeAdded = false;
  let nodeModulesLinked = false;
  let primaryError = null;
  try {
    command("git", ["worktree", "add", "--detach", targetWorktree, TARGET_SHA], { cwd: coordinatorRoot, timeout: 120000 });
    worktreeAdded = true;
    symlinkSync(coordinatorNodeModules, targetNodeModules, "dir");
    nodeModulesLinked = true;
    if (command("git", ["rev-parse", "HEAD"], { cwd: targetWorktree }) !== TARGET_SHA) throw new Error("Disposable baseline worktree is not at the exact target SHA.");
    if (command("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: targetWorktree }) !== "") throw new Error("Disposable baseline worktree is not clean after the ignored node_modules link.");

    const preflight = preflightArtifactRoot({
      artifactWorkspace: process.env.WARGUS_ARTIFACT_WORKSPACE,
      artifactRoot: process.env.WARGUS_ARTIFACT_ROOT,
      disposableWorktree: targetWorktree,
      preservationOwner: process.env.WARGUS_ARTIFACT_PRESERVATION_OWNER
    });
    const artifactDirectory = path.join(preflight.artifactRoot, "performance", PLAN_ID, TARGET_SHA, stamp);
    if (existsSync(artifactDirectory)) throw new Error("Fresh baseline artifact stamp already exists: " + artifactDirectory);

    const asset = recordedCommand("npm", ["run", "verify:wargus-assets"], targetWorktree, 300000);
    const build = recordedCommand("npm", ["run", "build"], targetWorktree, 600000);
    const captureEnvironment = {
      WARGUS_PERF_PLAN: PLAN_ID,
      WARGUS_CAPTURE_SHA: TARGET_SHA,
      WARGUS_PERF_FIXED_TICK_OFFSET: "600",
      WARGUS_PERF_ARTIFACT_DIR: artifactDirectory,
      WARGUS_ARTIFACT_WORKSPACE: preflight.artifactWorkspace,
      WARGUS_ARTIFACT_ROOT: preflight.artifactRoot,
      WARGUS_ARTIFACT_PRESERVATION_OWNER: preflight.preservationOwner,
      WARGUS_FIXED_VERIFIER_PATH: fixedVerifier,
      WARGUS_COORDINATOR_ROOT: coordinatorRoot,
      WARGUS_COORDINATOR_COMMIT: coordinatorCommit
    };
    const commonEnvironment = { ...process.env, ...captureEnvironment };
    const fixed = spawnSync(process.execPath, [fixedVerifier], { cwd: targetWorktree, env: commonEnvironment, encoding: "utf8", timeout: 600000, maxBuffer: 32 * 1024 * 1024 });
    if (fixed.error || fixed.status !== 0) throw new Error(`Baseline fixed-tick verifier failed:\n${fixed.stdout ?? ""}${fixed.stderr ?? ""}${fixed.error?.message ?? ""}`);

    const preflightEvidence = {
      schemaVersion: 1, target: canonicalBaselineIdentity(), coordinatorRoot, coordinatorCommit, targetWorktree,
      artifactDirectory, fixedVerifier, matrixHarness, hostname: "halla",
      listeners: command("ss", ["-ltnp"]),
      relevantProcesses: command("ps", ["-eo", "pid=,ppid=,comm="]),
      fixedTickCommand: `${Object.entries(captureEnvironment).map(([key, value]) => `${key}=${value}`).join(" ")} node ${fixedVerifier}`,
      fixedTickStdout: fixed.stdout ?? "", fixedTickStderr: fixed.stderr ?? ""
    };
    writeFileSync(path.join(artifactDirectory, "baseline-coordinator-preflight.json"), `${JSON.stringify(preflightEvidence, null, 2)}\n`, { flag: "wx" });
    writeFileSync(path.join(artifactDirectory, "baseline-build.json"), `${JSON.stringify({ schemaVersion: 1, asset, build }, null, 2)}\n`, { flag: "wx" });

    const matrixEnvironment = {
      ...commonEnvironment,
      WARGUS_BASELINE_CAPTURE: "1",
      WARGUS_MATRIX_ROWS: ROWS,
      WARGUS_RUN_FULL_MATRIX: "1"
    };
    delete matrixEnvironment.WARGUS_PERF_ACCEPTANCE_MODE;
    const matrix = spawnSync(process.execPath, [matrixHarness], { cwd: targetWorktree, env: matrixEnvironment, encoding: "utf8", timeout: 60 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
    if (matrix.error || matrix.status !== 0) throw new Error(`Plan 018 baseline matrix failed:\n${matrix.stdout ?? ""}${matrix.stderr ?? ""}${matrix.error?.message ?? ""}`);
    console.log(JSON.stringify({ ready: true, artifactDirectory, targetSha: TARGET_SHA, coordinatorCommit }, null, 2));
  } catch (error) {
    primaryError = error;
  } finally {
    const cleanupErrors = [];
    if (nodeModulesLinked) {
      try {
        if (!lstatSync(targetNodeModules).isSymbolicLink()) throw new Error("Owned node_modules path is no longer a symlink.");
        unlinkSync(targetNodeModules);
      } catch (error) { cleanupErrors.push(error); }
    }
    if (worktreeAdded) {
      try { command("git", ["worktree", "remove", "--force", targetWorktree], { cwd: coordinatorRoot, timeout: 120000 }); }
      catch (error) { cleanupErrors.push(error); }
    }
    if (primaryError && cleanupErrors.length) throw new AggregateError([primaryError, ...cleanupErrors], "Baseline capture and exact cleanup failed.");
    if (primaryError) throw primaryError;
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Baseline capture cleanup failed.");
  }
}

if (process.env.WARGUS_BASELINE_COORDINATOR_GUARD_CHECK === "1") {
  console.log(JSON.stringify(canonicalBaselineIdentity()));
} else {
  await main();
}
