import { spawn, execFileSync } from "node:child_process";
import { createServer, connect } from "node:net";
import { once } from "node:events";
import { existsSync, realpathSync, statfsSync, statSync, mkdirSync, writeFileSync, accessSync, constants, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const DEFAULT_PORT_CANDIDATES = Array.from({ length: 1024 }, (_, index) => 55_000 + index);
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|mesa offscreen/i;

export class BrowserExecutionController {
  constructor({ name = "browser-verifier", portCandidates = DEFAULT_PORT_CANDIDATES, host = "127.0.0.1", now = () => Date.now() } = {}) {
    this.name = name;
    this.portCandidates = [...portCandidates];
    this.host = host;
    this.now = now;
    this.nextCandidate = 0;
    this.reservations = new Map();
    this.allocationLedger = [];
    this.ownedRoots = new Set();
    this.ownedPids = new Set();
    this.lifecycleLedger = [];
  }

  async allocatePorts({ requestedServerPort } = {}) {
    const serverPort = await this.reservePort(requestedServerPort, "server");
    try {
      const debugPort = await this.reservePort(undefined, "debug");
      const allocation = { serverPort, debugPort, allocatedAt: this.now(), requestedServerPort: requestedServerPort ?? null };
      this.allocationLedger.push(allocation);
      return allocation;
    } catch (error) {
      await this.releasePort(serverPort);
      throw error;
    }
  }

  async reservePort(requestedPort, role) {
    const candidates = requestedPort === undefined ? this.portCandidates.slice(this.nextCandidate) : [requestedPort];
    let lastError = null;
    for (const candidate of candidates) {
      if (!Number.isInteger(candidate) || candidate < 1 || candidate > 65_535 || this.reservations.has(candidate)) continue;
      try {
        await this.listenReservation(candidate);
        if (requestedPort === undefined) this.nextCandidate = this.portCandidates.indexOf(candidate) + 1;
        this.lifecycleLedger.push({ event: "port-reserved", role, port: candidate, at: this.now() });
        return candidate;
      } catch (error) {
        lastError = error;
        if (requestedPort !== undefined) throw new Error(`Requested ${role} port ${candidate} is occupied or unavailable: ${error.message}`);
      }
    }
    throw new Error(`No unoccupied ${role} port candidates remain${lastError ? `: ${lastError.message}` : ""}.`);
  }

  async listenReservation(port) {
    const reservation = createServer();
    const failure = once(reservation, "error").then(([error]) => { throw error; });
    reservation.listen(port, this.host);
    try {
      await Promise.race([once(reservation, "listening"), failure]);
      this.reservations.set(port, reservation);
    } catch (error) {
      reservation.close();
      throw error;
    }
  }

  async releasePort(port) {
    const reservation = this.reservations.get(port);
    if (!reservation) return;
    this.reservations.delete(port);
    await new Promise((resolve) => reservation.close(resolve));
    this.lifecycleLedger.push({ event: "port-released", port, at: this.now() });
  }

  spawnOwned(command, args, options = {}) {
    this.ensureResourceMonitoring();
    const child = spawn(command, args, { ...options, detached: false });
    this.ownedRoots.add(child.pid);
    this.ownedPids.add(child.pid);
    this.lifecycleLedger.push({ event: "spawn", pid: child.pid, command, at: this.now() });
    return child;
  }

  async waitForHttp(url) {
    return waitForReadiness({
      probe: async () => {
        try { const response = await fetch(url); return { ready: response.ok, progress: `http-${response.status}` }; } catch { return { ready: false, progress: "connection" }; }
      }
    });
  }

  async startViteServer({ port, mode = "dev", stdio = "ignore" }) {
    await this.releasePort(port);
    const args = mode === "preview"
      ? ["node_modules/vite/bin/vite.js", "preview", "--host", this.host, "--port", String(port), "--strictPort"]
      : ["node_modules/vite/bin/vite.js", "--host", this.host, "--port", String(port), "--strictPort"];
    return this.spawnOwned(process.execPath, args, { stdio });
  }

  async startChrome({ chromeBin, debugPort, profilePath, extraArgs = [], stdio = "ignore", headless = true }) {
    await this.releasePort(debugPort);
    const args = [
      ...(headless ? ["--headless=new"] : []),
      "--no-sandbox",
      "--disable-dev-shm-usage",
      ...extraArgs,
      `--user-data-dir=${profilePath}`,
      `--remote-debugging-port=${debugPort}`,
      "about:blank"
    ];
    return this.spawnOwned(chromeBin, args, { stdio });
  }

  ensureResourceMonitoring() {
    if (!this.resourceMonitor) {
      this.resourceMonitor = new ResourceMonitor({ controller: this });
      this.resourceMonitor.start();
    }
  }

  trackOwnedPid(pid) {
    if (!Number.isInteger(pid) || pid <= 0) throw new Error(`Invalid owned PID: ${pid}.`);
    this.ownedRoots.add(pid);
    this.ownedPids.add(pid);
    this.lifecycleLedger.push({ event: "track", pid, at: this.now() });
  }

  discoverOwnedDescendants() {
    const rows = execFileSync("ps", ["-eo", "pid=,ppid="], { encoding: "utf8", timeout: 3_000, maxBuffer: 1_048_576 })
      .trim().split("\n")
      .map((line) => line.trim().split(/\s+/).map(Number))
      .filter(([pid, parentPid]) => Number.isInteger(pid) && Number.isInteger(parentPid));
    const depth = new Map([...this.ownedRoots].map((pid) => [pid, 0]));
    for (let index = 0; index < rows.length; index += 1) {
      let changed = false;
      for (const [pid, parentPid] of rows) {
        if (!depth.has(pid) && depth.has(parentPid)) {
          depth.set(pid, depth.get(parentPid) + 1);
          changed = true;
        }
      }
      if (!changed) break;
    }
    for (const pid of depth.keys()) this.ownedPids.add(pid);
    return [...depth.entries()].sort((left, right) => right[1] - left[1]).map(([pid]) => pid);
  }

  async cleanup({ graceMs = 2_000 } = {}) {
    const orderedPids = this.discoverOwnedDescendants();
    for (const pid of orderedPids) sendSignal(pid, "SIGTERM");
    await delay(graceMs);
    const survivors = orderedPids.filter(isAlive);
    for (const pid of survivors) sendSignal(pid, "SIGKILL");
    await delay(50);
    const residualPids = orderedPids.filter(isAlive);
    const ownedPorts = this.allocationLedger.flatMap(({ serverPort, debugPort }) => [serverPort, debugPort]);
    const openPorts = [];
    for (const port of ownedPorts) {
      await this.releasePort(port);
      if (await isPortOpen(port, this.host)) openPorts.push(port);
    }
    const result = { terminationOrder: orderedPids, terminated: orderedPids.filter((pid) => !isAlive(pid)), residualPids, openPorts };
    this.lastCleanup = result;
    this.lifecycleLedger.push({ event: "cleanup", ...result, at: this.now() });
    await this.resourceMonitor?.stop({ cleanup: result });
    if (residualPids.length > 0 || openPorts.length > 0) throw new Error(`Owned cleanup incomplete: residual PIDs=${residualPids.join(",") || "none"}; open ports=${openPorts.join(",") || "none"}.`);
    return result;
  }
}

export function qualifyRenderer(metadata) {
  if (!metadata?.renderer || SOFTWARE_RENDERER.test(metadata.renderer)) throw new Error(`Rejected software renderer: ${metadata?.renderer ?? "missing"}.`);
  if (!metadata.focused || metadata.visibility !== "visible" || !metadata.rafAdvanced) throw new Error("Renderer qualification requires a visible, focused document with advancing RAF.");
  if (!metadata.executable || !metadata.version || !metadata.gpu?.device || !metadata.gpu?.driver || !metadata.viewport?.width || !metadata.viewport?.height) throw new Error("Renderer qualification metadata is incomplete.");
  return { ...metadata };
}

export async function waitForReadiness({ probe, now = () => Date.now(), sleep = delay, intervalMs = 250, noProgressMs = 120_000 }) {
  let lastProgress = undefined;
  let lastProgressAt = now();
  for (;;) {
    const result = await probe();
    const state = result === true ? { ready: true } : result || { ready: false };
    if (state.ready) return state;
    if (state.progress !== undefined && state.progress !== lastProgress) {
      lastProgress = state.progress;
      lastProgressAt = now();
    }
    if (now() - lastProgressAt >= noProgressMs) throw new Error(`Browser readiness made no progress for ${noProgressMs}ms.`);
    await sleep(intervalMs);
  }
}

export function collectHostMetrics(workspace = process.cwd()) {
  const memory = Object.fromEntries(execFileSync("awk", ["/MemAvailable|SwapTotal|SwapFree/ { print $1, $2 }"] , { input: readProc("/proc/meminfo"), encoding: "utf8" }).trim().split("\n").filter(Boolean).map((line) => line.replace(":", "").split(/\s+/)));
  const stats = statfsSync(workspace);
  return {
    memory: { availableBytes: Number(memory.MemAvailable ?? 0) * 1024, swapUsedBytes: (Number(memory.SwapTotal ?? 0) - Number(memory.SwapFree ?? 0)) * 1024 },
    diskFreeBytes: Number(stats.bavail) * Number(stats.bsize),
    load: readProc("/proc/loadavg").trim(),
    cpu: readProc("/proc/stat").split("\n")[0],
    gpu: readGpuMetrics()
  };
}

export class ResourceMonitor {
  constructor({ controller, workspace = process.cwd(), sample = () => collectHostMetrics(workspace), writeRecord = () => {}, intervalMs = 5_000 } = {}) {
    this.controller = controller;
    this.sample = sample;
    this.writeRecord = writeRecord;
    this.intervalMs = intervalMs;
    this.records = [];
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.record("pre");
    this.timer = setInterval(() => { void this.poll(); }, this.intervalMs);
    this.timer.unref?.();
  }

  async stop({ cleanup } = {}) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const record = this.record("post");
    if (cleanup) this.writeRecord({ phase: "cleanup", cleanup, metrics: record.metrics });
    return record;
  }

  record(phase) {
    const metrics = this.sample();
    const record = { phase, metrics };
    this.records.push(record);
    this.writeRecord(record);
    return record;
  }

  async poll() {
    const record = this.record("during");
    const { metrics } = record;
    const reason = metrics.memory.availableBytes < 2 * 1024 ** 3 ? "MemAvailable below 2 GiB"
      : metrics.memory.swapUsedBytes > 8 * 1024 ** 3 ? "swap used above 8 GiB"
        : metrics.diskFreeBytes < 20 * 1024 ** 3 ? "workspace disk free below 20 GiB" : null;
    if (!reason) return { aborted: false, metrics };
    const cleanup = await this.controller.cleanup();
    await this.stop({ cleanup });
    const result = { aborted: true, reason, metrics, cleanup };
    this.writeRecord(result);
    return result;
  }
}

export function legacyPreflightArtifactRoot({ artifactWorkspace = process.env.WARGUS_ARTIFACT_WORKSPACE, artifactRoot = process.env.WARGUS_ARTIFACT_ROOT, disposableWorktree = process.cwd(), preservationOwner } = {}) {
  if (!artifactWorkspace || !artifactRoot || !preservationOwner) throw new Error("Artifact workspace, root, and preservation owner are required before capture.");
  if (!existsSync(artifactRoot)) throw new Error(`Artifact root does not exist: ${artifactRoot}`);
  const workspaceRealpath = realpathSync(artifactWorkspace);
  const rootRealpath = realpathSync(artifactRoot);
  const disposableRealpath = realpathSync(disposableWorktree);
  if (!path.relative(disposableRealpath, rootRealpath).startsWith("..")) throw new Error("Artifact root must be outside the disposable worktree.");
  execFileSync("git", ["-C", workspaceRealpath, "check-ignore", "-q", ".artifacts/performance/026/probe/file.json"], { stdio: "ignore" });
  return { artifactWorkspace: workspaceRealpath, artifactRoot: rootRealpath, preservationOwner };
}

function readProc(file) {
  return execFileSync("cat", [file], { encoding: "utf8" });
}

function readGpuMetrics() {
  try {
    return execFileSync("nvidia-smi", ["--query-gpu=name,driver_version,utilization.gpu", "--format=csv,noheader"], { encoding: "utf8", timeout: 3_000 }).trim();
  } catch {
    return "unavailable";
  }
}

function sendSignal(pid, signal) {
  try { process.kill(pid, signal); } catch { /* The exact owned PID already exited. */ }
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function isPortOpen(port, host) {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


export function preflightArtifactRoot({ artifactWorkspace = process.env.WARGUS_ARTIFACT_WORKSPACE, artifactRoot = process.env.WARGUS_ARTIFACT_ROOT, disposableWorktree = process.cwd(), preservationOwner } = {}) {
  if (!artifactWorkspace || !artifactRoot || !preservationOwner) throw new Error("Artifact workspace, root, and preservation owner are required before capture.");
  const workspaceRealpath = realpathSync(artifactWorkspace);
  const expectedRoot = path.join(workspaceRealpath, ".artifacts");
  if (path.resolve(artifactRoot) !== expectedRoot) throw new Error("Artifact root must be exactly the retained workspace .artifacts directory.");
  if (!existsSync(expectedRoot) || !statSync(expectedRoot).isDirectory()) throw new Error("Artifact root must be an existing directory.");
  accessSync(expectedRoot, constants.W_OK);
  const stats = statfsSync(expectedRoot);
  if (Number(stats.bavail) * Number(stats.bsize) < 20 * 1024 ** 3) throw new Error("Artifact root has less than 20 GiB free.");
  const rootRealpath = realpathSync(expectedRoot);
  if (!path.relative(realpathSync(disposableWorktree), rootRealpath).startsWith("..")) throw new Error("Artifact root must be outside the disposable worktree.");
  execFileSync("git", ["-C", workspaceRealpath, "check-ignore", "-q", ".artifacts/performance/026/probe/file.json"], { stdio: "ignore" });
  return { artifactWorkspace: workspaceRealpath, artifactRoot: rootRealpath, preservationOwner };
}

export function createArtifactDirectory({ preflight, plan, commit, stamp }) {
  if (!preflight || !plan || !commit || !stamp) throw new Error("Artifact plan, commit, stamp, and preflight are required.");
  const directory = path.join(preflight.artifactRoot, "performance", plan, commit, stamp);
  mkdirSync(directory, { recursive: true });
  return { directory, logicalPath: path.posix.join(".artifacts", "performance", plan, commit, stamp) };
}

export function writeArtifactRecord({ directory, name, record }) {
  if (!directory || !name || !name.endsWith(".json")) throw new Error("Artifact JSON directory and name are required.");
  const file = path.join(directory, name);
  writeFileSync(file, JSON.stringify(record, null, 2) + "\n", "utf8");
  return { file, sha256: createHash("sha256").update(readFileSync(file)).digest("hex") };
}

export async function runCapture({ readFrame, shouldStop, sleep = delay, intervalMs = 250 }) {
  let frames = 0;
  for (;;) {
    const frame = await readFrame();
    if (!frame?.rafAdvanced) throw new Error("Capture requires advancing RAF.");
    frames += 1;
    if (await shouldStop(frame, frames)) return { frames, stop: "protocol" };
    await sleep(intervalMs);
  }
}
