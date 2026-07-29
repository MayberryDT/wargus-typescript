import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import {
  BrowserExecutionController,
  ResourceMonitor,
  createArtifactDirectory,
  preflightArtifactRoot,
  runCapture,
  writeArtifactRecord,
  qualifyRenderer,
  waitForReadiness
} from "./lib/browser-execution-controller.mjs";

const failures = [];
const runtimeSmokeSource = readFileSync("scripts/verify-browser-runtime-smoke.mjs", "utf8");
expect(runtimeSmokeSource.includes("execution.runCapture"), "runtime smoke must enter the controller capture lifecycle");
expect(runtimeSmokeSource.includes("rafAdvanced"), "runtime smoke capture lifecycle must require advancing RAF");
expect(runtimeSmokeSource.includes("shouldStop"), "runtime smoke capture lifecycle must use an explicit verifier stop callback");

function expect(condition, message) {
  if (!condition) failures.push(message);
}

async function listen(port = 0) {
  const server = createServer();
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return server;
}

const occupied = await listen();
const occupiedPort = occupied.address().port;
const controller = new BrowserExecutionController({ portCandidates: [occupiedPort] });
await expectRejects(
  () => controller.allocatePorts(),
  "No unoccupied server port candidates remain",
  "occupied server candidate is refused before any spawn"
);
occupied.close();

const allocationController = new BrowserExecutionController({ portCandidates: [occupiedPort, occupiedPort + 1, occupiedPort + 2, occupiedPort + 3] });
const firstAllocation = await allocationController.allocatePorts();
const secondAllocation = await allocationController.allocatePorts();
expect(firstAllocation.serverPort !== firstAllocation.debugPort, "server and debug ports are distinct");
expect(firstAllocation.serverPort !== secondAllocation.serverPort, "second allocation receives a distinct server port");
expect(firstAllocation.debugPort !== secondAllocation.debugPort, "second allocation receives a distinct debug port");
expect(allocationController.allocationLedger.length === 2, "allocation ledger records each allocation");
console.log(`Allocation fixture ledger: ${JSON.stringify(allocationController.allocationLedger)}.`);
const allocationCleanup = await allocationController.cleanup();
expect(allocationCleanup.openPorts.length === 0, "allocation cleanup leaves every owned port clear");

const lifecycleController = new BrowserExecutionController();
const owned = lifecycleController.spawnOwned(process.execPath, ["-e", "const { spawn } = require('node:child_process'); spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); setInterval(() => {}, 1000)"]);
const sentinel = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
await delay(100);
const cleanup = await lifecycleController.cleanup();
expect(cleanup.terminated.includes(owned.pid), "owned root is terminated");
expect(cleanup.terminationOrder[0] !== owned.pid, "owned descendant is terminated before its root");
expect(cleanup.residualPids.length === 0 && cleanup.openPorts.length === 0, "owned cleanup proves all recorded PIDs and ports clear");
expect(lifecycleController.resourceMonitor.records.some((record) => record.phase === "pre") && lifecycleController.resourceMonitor.records.some((record) => record.phase === "post"), "owned sessions automatically record pre and post resource metrics");
expect(isAlive(sentinel.pid), "unrelated sentinel survives exact-owned cleanup");
console.log(`Controller fixture cleanup: root=${owned.pid}; terminated=${cleanup.terminated.join(",")}; residual=${cleanup.residualPids.join(",") || "none"}; sentinel=${sentinel.pid} survived.`);
try { process.kill(sentinel.pid, "SIGTERM"); } catch { /* Sentinel already exited. */ }

const safetyController = new BrowserExecutionController();
const safetyOwned = safetyController.spawnOwned(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
const safetySentinel = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
const safetyRecords = [];
const monitor = new ResourceMonitor({
  controller: safetyController,
  sample: () => ({ memory: { availableBytes: 1, swapUsedBytes: 0 }, diskFreeBytes: 100 * 1024 ** 3 }),
  writeRecord: (record) => safetyRecords.push(record)
});
monitor.start();
const safetyAbort = await monitor.poll();
expect(safetyAbort.aborted && safetyAbort.reason.includes("MemAvailable"), "resource threshold aborts only owned work");
expect(safetyRecords.some((record) => record.cleanup?.terminated.includes(safetyOwned.pid)), "safety abort writes an owned-cleanup record");
expect(safetyRecords.some((record) => record.phase === "pre") && safetyRecords.some((record) => record.phase === "post"), "resource monitor records pre and post lifecycle metrics");
expect(isAlive(safetySentinel.pid), "safety abort preserves the unrelated sentinel");
console.log(`Safety fixture cleanup: root=${safetyOwned.pid}; terminated=${safetyAbort.cleanup.terminated.join(",")}; residual=${safetyAbort.cleanup.residualPids.join(",") || "none"}; sentinel=${safetySentinel.pid} survived.`);
try { process.kill(safetySentinel.pid, "SIGTERM"); } catch { /* Sentinel already exited. */ }

expectRejectsSync(
  () => qualifyRenderer({ renderer: "ANGLE (SwiftShader)", executable: "chrome", version: "1", gpu: {}, viewport: { width: 1280, height: 720 }, focused: true, visibility: "visible", rafAdvanced: true }),
  "software renderer",
  "software renderer is rejected"
);
expectRejectsSync(
  () => qualifyRenderer({ renderer: "ANGLE (Software)", executable: "chrome", version: "1", gpu: {}, viewport: { width: 1280, height: 720 }, focused: true, visibility: "visible", rafAdvanced: true }),
  "software renderer",
  "generic software renderer is rejected"
);
const renderer = qualifyRenderer({ renderer: "ANGLE (NVIDIA)", executable: "chrome", version: "1", gpu: { device: "NVIDIA", driver: "550" }, viewport: { width: 1280, height: 720 }, focused: true, visibility: "visible", rafAdvanced: true });
expect(renderer.renderer === "ANGLE (NVIDIA)", "hardware renderer metadata is retained");

let now = 0;
await expectRejects(
  () => waitForReadiness({
    probe: async () => false,
    now: () => now,
    sleep: async (ms) => { now += ms; },
    intervalMs: 30_000
  }),
  "120000ms",
  "readiness stalls at the 120-second no-progress watchdog"
);
const ready = await waitForReadiness({
  probe: async () => ({ ready: true, progress: 1 }),
  now: () => 0,
  sleep: async () => { throw new Error("ready probe should not sleep"); }
});
expect(ready.progress === 1, "readiness accepts reported progress");
let raf = 0;
const capture = await runCapture({ readFrame: async () => ({ rafAdvanced: true, raf: ++raf }), shouldStop: async (_frame, frames) => frames === 3, sleep: async () => {} });
expect(capture.frames === 3 && capture.stop === "protocol", "advancing RAF capture runs until explicit protocol stop");
const artifactFixture = mkdtempSync(path.join(tmpdir(), "wargus-artifact-"));
const artifact = createArtifactDirectory({ preflight: { artifactRoot: artifactFixture }, plan: "026", commit: "fixture", stamp: "20260728T000000Z" });
const artifactRecord = writeArtifactRecord({ directory: artifact.directory, name: "fixture.json", record: { ok: true } });
expect(artifact.logicalPath === ".artifacts/performance/026/fixture/20260728T000000Z" && artifactRecord.sha256.length === 64, "artifact helper writes canonical JSON with checksum");
expectRejectsSync(() => preflightArtifactRoot({ artifactWorkspace: process.cwd(), artifactRoot: artifactFixture, preservationOwner: "fixture" }), "exactly", "artifact root rejects a non-workspace artifacts path");
rmSync(artifactFixture, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Browser execution controller verified: occupied-port refusal, unique allocations, exact descendant cleanup, sentinel survival, renderer qualification, readiness watchdog, and unlimited valid capture lifecycle.");
}

async function expectRejects(action, expected, label) {
  try {
    await action();
    failures.push(`${label}: expected rejection`);
  } catch (error) {
    expect(String(error).includes(expected), `${label}: expected ${expected}, got ${error}`);
  }
}

function expectRejectsSync(action, expected, label) {
  try {
    action();
    failures.push(`${label}: expected rejection`);
  } catch (error) {
    expect(String(error).includes(expected), `${label}: expected ${expected}, got ${error}`);
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
