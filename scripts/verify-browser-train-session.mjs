import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

const PORT = 5203;
const DEBUG_PORT = 9230;
const URL = `http://127.0.0.1:${PORT}/?smoke=1`;
const CHROME = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";
const ADVANCED_TECH_ONLY = process.env.WARGUS_ADVANCED_TECH_FIXTURE_ONLY === "1";
const CANDIDATE_MAPS = (process.env.WARGUS_BROWSER_TRAIN_MAPS ?? process.env.WARGUS_BROWSER_TRAIN_MAP ?? [
  "maps/ladder/Garden of war BNE.pud.smp.gz",
  "campaigns/orc/level01o.smp.gz",
  "campaigns/human-exp/levelx01h.smp.gz",
  "campaigns/orc/level07o.smp.gz",
  "campaigns/human/level05h.smp.gz",
  "campaigns/orc/level08o.smp.gz"
].join(",")).split(",").map((map) => map.trim()).filter(Boolean);
const chromeProfile = mkdtempSync(path.join(tmpdir(), "wargus-train-chrome-"));
const server = spawn("npm", ["run", "dev", "--", "--port", String(PORT), "--strictPort"], {
  detached: true,
  stdio: ["pipe", "ignore", "ignore"]
});
let chrome = null;
let client = null;

try {
  await waitForHttp(URL, 20_000);
  chrome = spawn(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-extensions",
    "--no-sandbox",
    "--no-first-run",
    "--disable-dev-shm-usage",
    "--renderer-process-limit=1",
    `--user-data-dir=${chromeProfile}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    "about:blank"
  ], { detached: true, stdio: "ignore" });
  await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json/version`, 10_000);
  const target = await waitForPageTarget(`http://127.0.0.1:${DEBUG_PORT}/json/list`, 10_000);
  client = await connectDevTools(target.webSocketDebuggerUrl);
  const pageErrors = [];
  client.on("Runtime.exceptionThrown", (params) => {
    pageErrors.push(params.exceptionDetails?.text ?? params.exceptionDetails?.exception?.description ?? "unknown page exception");
  });
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await client.send("Page.navigate", { url: URL });
  await client.waitFor("Page.loadEventFired", 20_000);
  await waitForExpression(client, "Boolean(window.__WARGUS_TS_SMOKE_STATE__?.worldLoaded)", 20_000);
  await waitForExpression(client, "typeof window.__WARGUS_TS_LOAD_MAP__ === \"function\" && typeof window.__WARGUS_TS_ISSUE_FIRST_TRAIN__ === \"function\" && typeof window.__WARGUS_TS_SELECT_FIXTURE_UNIT_TYPE__ === \"function\" && typeof window.__WARGUS_TS_SAVE_ACTIVE_WORLD_ROUNDTRIP__ === \"function\"", 20_000);

  const advanced = await verifyAdvancedTechPaths(client);
  console.log(`Advanced tech paths verified (${advanced.outputs.length} trained outputs, ${advanced.conversions.length} in-place conversions, deterministic ids).`);
  if (!ADVANCED_TECH_ONLY) {
    const failures = [];
    let verified = false;
    for (const mapPath of CANDIDATE_MAPS) {
      try {
        const result = await verifyTrainMap(client, mapPath);
        if (pageErrors.length > 0) {
          throw new Error(`Browser page exceptions: ${pageErrors.join("; ")}`);
        }
        console.log(`Browser train session verified (${mapPath}, unit=${result.unitTypeId}, queue=${result.beforeQueue}->${result.afterQueue}, remaining=${result.beforeRemaining}->${result.afterRemaining}, tick=${result.tick}).`);
        verified = true;
        break;
      } catch (error) {
        failures.push(`${mapPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!verified) {
      throw new Error(`Unable to verify browser train session on candidate maps:\n${failures.join("\n")}`);
    }
  }
} finally {
  client?.close();
  await stopProcess(chrome);
  await stopProcess(server);
  cleanupDedicatedProcesses();
  rmSync(chromeProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}

async function verifyAdvancedTechPaths(client) {
  await waitForExpression(client, "typeof window.__WARGUS_TS_RUN_ADVANCED_TECH_PATH_FIXTURE__ === \"function\"", 5_000);
  const first = await evalValue(client, "window.__WARGUS_TS_RUN_ADVANCED_TECH_PATH_FIXTURE__()");
  const repeat = await evalValue(client, "window.__WARGUS_TS_RUN_ADVANCED_TECH_PATH_FIXTURE__()");
  if (!first?.ok || !repeat?.ok) {
    throw new Error(`advanced tech-path fixture failed: first=${JSON.stringify(first)} repeat=${JSON.stringify(repeat)}`);
  }
  const expectedConversions = ["unit-knight->unit-paladin", "unit-ogre->unit-ogre-mage"];
  const expectedOutputs = [
    "unit-paladin", "unit-ogre-mage", "unit-mage", "unit-death-knight", "unit-ballista",
    "unit-catapult", "unit-balloon", "unit-dwarves", "unit-zeppelin", "unit-goblin-sappers"
  ];
  if (JSON.stringify(first.conversions) !== JSON.stringify(expectedConversions)
    || JSON.stringify(first.outputs) !== JSON.stringify(expectedOutputs)) {
    throw new Error(`advanced roster results differed: ${JSON.stringify(first)}`);
  }
  if (!Array.isArray(first.training) || first.training.length !== expectedOutputs.length) {
    throw new Error(`advanced per-output observations missing: ${JSON.stringify(first)}`);
  }
  for (const [index, typeId] of expectedOutputs.entries()) {
    const observation = first.training[index];
    if (observation?.typeId !== typeId
      || JSON.stringify(observation.resourceDelta) !== JSON.stringify(observation.expectedCosts)
      || observation.resourcesStableAfterIssue !== true
      || observation.queueProgressed !== true
      || observation.countDelta !== 1
      || typeof observation.spawnedId !== "string"
      || observation.spawnedId.length === 0) {
      throw new Error(`advanced ${typeId} lifecycle observation failed: ${JSON.stringify(observation)}`);
    }
  }
  const firstIds = first.training.map((observation) => observation.spawnedId);
  const repeatIds = repeat.training?.map((observation) => observation.spawnedId);
  if (JSON.stringify(firstIds) !== JSON.stringify(repeatIds)) {
    throw new Error(`advanced trained ids were not deterministic: first=${JSON.stringify(firstIds)} repeat=${JSON.stringify(repeatIds)}`);
  }
  return first;
}

async function verifyTrainMap(client, mapPath) {
  const loaded = await evalValue(client, `window.__WARGUS_TS_LOAD_MAP__(${JSON.stringify(mapPath)})`);
  if (loaded !== true) {
    throw new Error(`unable to load map: ${JSON.stringify(loaded)}`);
  }
  await dismissOverlays(client);
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.titleScreenOpen === false && window.__WARGUS_TS_SMOKE_STATE__?.briefingOpen === false", 10_000);
  const liveTrainReady = await waitForExpressionValue(client, "Boolean(window.__WARGUS_TS_SMOKE_STATE__?.firstTrainBuildingWorldPoint && window.__WARGUS_TS_SMOKE_STATE__?.firstTrainUnitTypeId)", 10_000);
  if (!liveTrainReady) {
    const fixture = await evalValue(client, "window.__WARGUS_TS_SELECT_FIXTURE_UNIT_TYPE__('unit-town-hall')");
    if (!fixture?.ok) {
      throw new Error(`unable to create train fixture after live train pair was unavailable: fixture=${JSON.stringify(fixture)} smoke=${JSON.stringify(await readSmokeState(client))}`);
    }
    await waitForExpression(client, "Boolean(window.__WARGUS_TS_SMOKE_STATE__?.firstTrainBuildingWorldPoint && window.__WARGUS_TS_SMOKE_STATE__?.firstTrainUnitTypeId)", 10_000);
  }
  const before = await readSmokeState(client);
  const beforeQueue = before.firstTrainBuildingQueueLength ?? 0;
  const beforeRemaining = before.firstTrainBuildingQueueRemainingSeconds ?? null;
  const unitTypeId = before.firstTrainUnitTypeId;
  const issued = await evalValue(client, "window.__WARGUS_TS_ISSUE_FIRST_TRAIN__()");
  if (issued !== true) {
    throw new Error(`unable to issue first train order: ${JSON.stringify(await readSmokeState(client))}`);
  }
  const progress = await waitForTrainProgress(client, beforeQueue, beforeRemaining, 30_000);
  const save = await evalValue(client, "window.__WARGUS_TS_SAVE_ACTIVE_WORLD_ROUNDTRIP__()");
  if (!save?.ok || save.saveRoundtripOk !== true || !Number.isFinite(save.tick) || save.tick < progress.tick) {
    throw new Error(`train active-world save/load roundtrip failed: ${JSON.stringify(save)}`);
  }
  return {
    unitTypeId,
    beforeQueue,
    afterQueue: progress.firstSelectedProductionQueueLength,
    beforeRemaining,
    afterRemaining: progress.firstSelectedProductionQueueRemainingSeconds,
    tick: progress.tick
  };
}

async function waitForTrainProgress(client, beforeQueue, beforeRemaining, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await readSmokeState(client);
    const queue = state.firstSelectedProductionQueueLength ?? 0;
    const remaining = state.firstSelectedProductionQueueRemainingSeconds;
    if (queue > beforeQueue || (Number.isFinite(remaining) && (beforeRemaining === null || remaining < beforeRemaining))) {
      return state;
    }
    await delay(500);
  }
  throw new Error(`timed out waiting for train progress; smoke=${JSON.stringify(await readSmokeState(client))}`);
}

async function dismissOverlays(client) {
  for (let index = 0; index < 2; index += 1) {
    const state = await readSmokeState(client);
    if (state?.titleScreenOpen !== true && state?.briefingOpen !== true) {
      return;
    }
    await dispatchKey(client, "Enter");
    await delay(index === 0 ? 300 : 500);
  }
}

async function evalValue(client, expression) {
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? `Evaluation failed: ${expression}`);
  }
  return result.result?.value ?? null;
}

async function readSmokeState(client) {
  return await evalValue(client, "window.__WARGUS_TS_PUBLISH_SMOKE__?.(); window.__WARGUS_TS_SMOKE_STATE__");
}

async function waitForExpression(client, expression, timeoutMs) {
  if (await waitForExpressionValue(client, expression, timeoutMs)) {
    return;
  }
  throw new Error(`Timed out waiting for browser expression: ${expression}; smoke=${JSON.stringify(await readSmokeState(client))}`);
}

async function waitForExpressionValue(client, expression, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await client.send("Runtime.evaluate", { expression, returnByValue: true });
    if (result.result?.value === true) {
      return true;
    }
    await delay(250);
  }
  return false;
}

async function dispatchKey(client, code) {
  const key = code === "Enter" ? "Enter" : code;
  const windowsVirtualKeyCode = code === "Enter" ? 13 : 0;
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
}

async function waitForHttp(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until ready.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function waitForPageTarget(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const targets = await fetchJson(url);
    const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    if (page) {
      return page;
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for a Chrome page target.");
}

async function connectDevTools(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result ?? {});
      return;
    }
    for (const handler of listeners.get(message.method) ?? []) {
      handler(message.params ?? {});
    }
  });
  return {
    on(method, handler) {
      listeners.set(method, [...(listeners.get(method) ?? []), handler]);
    },
    send(method, params = {}) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    waitFor(method, timeoutMs) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
        listeners.set(method, [...(listeners.get(method) ?? []), (params) => {
          clearTimeout(timeout);
          resolve(params);
        }]);
      });
    },
    close() {
      try {
        socket.close();
      } catch {
        // Already closed.
      }
    }
  };
}

async function stopProcess(process) {
  if (!process || process.exitCode !== null || process.signalCode !== null) {
    return;
  }
  try {
    globalThis.process.kill(-process.pid, "SIGTERM");
  } catch {
    try {
      process.kill("SIGTERM");
    } catch {
      // Already exited.
    }
  }
  await delay(750);
  if (process.exitCode !== null || process.signalCode !== null) {
    return;
  }
  try {
    globalThis.process.kill(-process.pid, "SIGKILL");
  } catch {
    try {
      process.kill("SIGKILL");
    } catch {
      // Already exited.
    }
  }
}

function cleanupDedicatedProcesses() {
  for (const pattern of [`--remote-debugging-port=${DEBUG_PORT}`, `--port ${PORT} --strictPort`]) {
    try {
      execFileSync("pkill", ["-f", "--", pattern], { stdio: "ignore" });
    } catch {
      // Best-effort cleanup.
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
