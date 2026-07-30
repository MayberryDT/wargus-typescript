import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, realpathSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { preflightArtifactRoot } from "./lib/browser-execution-controller.mjs";
import { cleanupDisposableWorktree } from "./lib/disposable-worktree-cleanup.mjs";

const CAPTURES = Object.freeze({
  "019": Object.freeze({ targetSha: "5935a17f456868051c2c16b2f0d8d2b4da56d115", rows: "3,5,7" }),
  "020": Object.freeze({ targetSha: "9bab6b0e3f7d260148cc1c0f5c1c231098046e19", rows: "6" }),
  "021": Object.freeze({ targetSha: "d943d6afacb281b4c136bebd9a2aeb72b77fd19c", rows: "3,4,6" })
});

function canonicalSuccessorIdentity(planId, acceptanceMode = process.env.WARGUS_PERF_ACCEPTANCE_MODE) {
  const capture = CAPTURES[planId];
  if (!capture) throw new Error("WARGUS_PERF_PLAN must be exactly one of 019, 020, or 021.");
  if (acceptanceMode !== undefined && acceptanceMode.trim() !== "incremental") throw new Error("Wave 2 successor capture requires incremental acceptance mode.");
  if (process.env.WARGUS_BASELINE_CAPTURE === "1") throw new Error("Wave 2 successor capture cannot run in baseline mode.");
  return { planId, ...capture, acceptanceMode: "incremental", trialCountPerRow: 7, schemaVersion: 4 };
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
  if (!record.pass) throw new Error(`Successor prerequisite failed: ${record.command}\n${record.stdout}${record.stderr}${record.error?.message ?? ""}`);
  return record;
}

function ensureActualPreconditions(coordinatorRoot, identity) {
  if (command("hostname", []) !== "halla") throw new Error("Wave 2 successor coordinator must run on halla.");
  if (!coordinatorRoot.startsWith("/home/halla/workspaces/")) throw new Error("Coordinator must run from an isolated Halla checkout.");
  const coordinatorCommit = command("git", ["rev-parse", "HEAD"], { cwd: coordinatorRoot });
  if (command("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: coordinatorRoot }) !== "") throw new Error("Wave 2 successor coordinator requires a clean reviewed worktree.");
  command("git", ["cat-file", "-e", `${identity.targetSha}^{commit}`], { cwd: coordinatorRoot });
  return coordinatorCommit;
}

async function main(identity) {
  const coordinatorRoot = realpathSync(process.cwd());
  const coordinatorCommit = ensureActualPreconditions(coordinatorRoot, identity);
  const stamp = new Date().toISOString().replace(/[-:.]/g, "");
  const targetWorktree = path.join("/home/halla/workspaces", `Wargus-TypeScript-plan${identity.planId}-successor-${stamp}`);
  const targetNodeModules = path.join(targetWorktree, "node_modules");
  const coordinatorNodeModules = realpathSync(path.join(coordinatorRoot, "node_modules"));
  const fixedVerifier = realpathSync(path.join(coordinatorRoot, "scripts/verify-successor-fixed-tick.mjs"));
  const matrixHarness = realpathSync(path.join(coordinatorRoot, "scripts/run-successor-performance-matrix.mjs"));
  if (existsSync(targetWorktree)) throw new Error("Fresh successor worktree path already exists: " + targetWorktree);
  let worktreeAdded = false;
  let nodeModulesLinked = false;
  let primaryError = null;
  try {
    command("git", ["worktree", "add", "--detach", targetWorktree, identity.targetSha], { cwd: coordinatorRoot, timeout: 120000 });
    worktreeAdded = true;
    symlinkSync(coordinatorNodeModules, targetNodeModules, "dir");
    nodeModulesLinked = true;
    if (command("git", ["rev-parse", "HEAD"], { cwd: targetWorktree }) !== identity.targetSha) throw new Error("Disposable successor worktree is not at the exact frozen target SHA.");
    if (command("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: targetWorktree }) !== "") throw new Error("Disposable successor worktree is not clean after the ignored node_modules link.");

    const preflight = preflightArtifactRoot({
      artifactWorkspace: process.env.WARGUS_ARTIFACT_WORKSPACE,
      artifactRoot: process.env.WARGUS_ARTIFACT_ROOT,
      disposableWorktree: targetWorktree,
      preservationOwner: process.env.WARGUS_ARTIFACT_PRESERVATION_OWNER
    });
    const artifactDirectory = path.join(preflight.artifactRoot, "performance", identity.planId, identity.targetSha, stamp);
    if (existsSync(artifactDirectory)) throw new Error("Fresh successor artifact stamp already exists: " + artifactDirectory);

    const asset = recordedCommand("npm", ["run", "verify:wargus-assets"], targetWorktree, 300000);
    const build = recordedCommand("npm", ["run", "build"], targetWorktree, 600000);
    const captureEnvironment = {
      WARGUS_PERF_PLAN: identity.planId,
      WARGUS_CAPTURE_SHA: identity.targetSha,
      WARGUS_PERF_ACCEPTANCE_MODE: identity.acceptanceMode,
      WARGUS_MATRIX_ROWS: identity.rows,
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
    for (const key of ["WARGUS_BASELINE_CAPTURE", "WARGUS_BASELINE_CAPTURE_SHA", "WARGUS_BASELINE_MATRIX_DIR", "WARGUS_BASELINE_MANIFEST_SHA256", "WARGUS_MATRIX_GUARD_CHECK", "WARGUS_MATRIX_PREFLIGHT_ONLY", "WARGUS_BASELINE_COORDINATOR_GUARD_CHECK", "WARGUS_WAVE2_COORDINATOR_GUARD_CHECK"]) delete commonEnvironment[key];
    const fixed = spawnSync(process.execPath, [fixedVerifier], { cwd: targetWorktree, env: commonEnvironment, encoding: "utf8", timeout: 600000, maxBuffer: 32 * 1024 * 1024 });
    if (fixed.error || fixed.status !== 0) throw new Error(`Successor fixed-tick verifier failed:\n${fixed.stdout ?? ""}${fixed.stderr ?? ""}${fixed.error?.message ?? ""}`);

    const preflightEvidence = {
      schemaVersion: 1, target: identity, coordinatorRoot, coordinatorCommit, targetWorktree,
      artifactDirectory, fixedVerifier, matrixHarness, hostname: "halla",
      listeners: command("ss", ["-ltnp"]),
      relevantProcesses: command("ps", ["-eo", "pid=,ppid=,comm="]),
      fixedTickEnvironment: captureEnvironment,
      fixedTickStdout: fixed.stdout ?? "", fixedTickStderr: fixed.stderr ?? ""
    };
    writeFileSync(path.join(artifactDirectory, "successor-coordinator-preflight.json"), `${JSON.stringify(preflightEvidence, null, 2)}\n`, { flag: "wx" });
    writeFileSync(path.join(artifactDirectory, "successor-build.json"), `${JSON.stringify({ schemaVersion: 1, asset, build }, null, 2)}\n`, { flag: "wx" });

    const matrixEnvironment = { ...commonEnvironment, WARGUS_RUN_FULL_MATRIX: "1" };
    const matrix = spawnSync(process.execPath, [matrixHarness], { cwd: targetWorktree, env: matrixEnvironment, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (matrix.error || matrix.status !== 0) throw new Error(`Plan ${identity.planId} successor matrix failed:\n${matrix.stdout ?? ""}${matrix.stderr ?? ""}${matrix.error?.message ?? ""}`);
    console.log(JSON.stringify({ ready: true, artifactDirectory, ...identity, coordinatorCommit }, null, 2));
  } catch (error) {
    primaryError = error;
  } finally {
    const cleanupErrors = cleanupDisposableWorktree({
      nodeModulesLinked,
      worktreeAdded,
      targetWorktree,
      unlinkOwnedNodeModules: () => {
        if (!lstatSync(targetNodeModules).isSymbolicLink()) throw new Error("Owned node_modules path is no longer a symlink.");
        unlinkSync(targetNodeModules);
      },
      removeOwnedWorktree: () => command("git", ["worktree", "remove", "--force", targetWorktree], { cwd: coordinatorRoot, timeout: 120000 })
    });
    if (primaryError && cleanupErrors.length) throw new AggregateError([primaryError, ...cleanupErrors], "Successor capture and exact cleanup failed.");
    if (primaryError) throw primaryError;
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Successor capture cleanup failed.");
  }
}

const identity = canonicalSuccessorIdentity(process.env.WARGUS_PERF_PLAN?.trim());
if (process.env.WARGUS_WAVE2_COORDINATOR_GUARD_CHECK === "1") {
  console.log(JSON.stringify(identity));
} else {
  await main(identity);
}
