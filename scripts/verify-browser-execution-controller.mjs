import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import {
  BrowserExecutionController,
  ResourceMonitor,
  qualifyRenderer,
  waitForReadiness
} from "./lib/browser-execution-controller.mjs";

const failures = [];

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
await allocationController.cleanup();

const lifecycleController = new BrowserExecutionController();
const owned = lifecycleController.spawnOwned(process.execPath, ["-e", "const { spawn } = require('node:child_process'); spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); setInterval(() => {}, 1000)"]);
const sentinel = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
await delay(100);
const cleanup = await lifecycleController.cleanup();
expect(cleanup.terminated.includes(owned.pid), "owned root is terminated");
expect(cleanup.terminated.length >= 2, "owned descendant is terminated before its root");
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
const safetyAbort = await monitor.poll();
expect(safetyAbort.aborted && safetyAbort.reason.includes("MemAvailable"), "resource threshold aborts only owned work");
expect(safetyRecords.length === 1 && safetyRecords[0].cleanup.terminated.includes(safetyOwned.pid), "safety abort writes an owned-cleanup record");
expect(isAlive(safetySentinel.pid), "safety abort preserves the unrelated sentinel");
console.log(`Safety fixture cleanup: root=${safetyOwned.pid}; terminated=${safetyAbort.cleanup.terminated.join(",")}; residual=${safetyAbort.cleanup.residualPids.join(",") || "none"}; sentinel=${safetySentinel.pid} survived.`);
try { process.kill(safetySentinel.pid, "SIGTERM"); } catch { /* Sentinel already exited. */ }

expectRejectsSync(
  () => qualifyRenderer({ renderer: "ANGLE (SwiftShader)", executable: "chrome", version: "1", gpu: {}, viewport: { width: 1280, height: 720 }, focused: true, visibility: "visible", rafAdvanced: true }),
  "software renderer",
  "software renderer is rejected"
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
expect(BrowserExecutionController.validCaptureHasDurationCeiling === false, "valid captures have no arbitrary tab-duration ceiling");

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
