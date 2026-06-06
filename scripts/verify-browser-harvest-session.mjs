import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

const PORT = 5200;
const DEBUG_PORT = 9227;
const URL = `http://127.0.0.1:${PORT}/?smoke=1`;
const CHROME = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";
const MAP_PATH = process.env.WARGUS_BROWSER_HARVEST_MAP ?? "maps/ladder/Garden of war BNE.pud.smp.gz";
const chromeProfile = mkdtempSync(path.join(tmpdir(), "wargus-harvest-chrome-"));
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
    "--no-sandbox",
    "--disable-dev-shm-usage",
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
  await waitForExpression(client, "typeof window.__WARGUS_TS_LOAD_MAP__ === \"function\" && typeof window.__WARGUS_TS_ISSUE_FIRST_GOLD_HARVEST__ === \"function\" && typeof window.__WARGUS_TS_ISSUE_FIRST_WOOD_HARVEST__ === \"function\" && typeof window.__WARGUS_TS_SAVE_ACTIVE_WORLD_ROUNDTRIP__ === \"function\"", 20_000);

  const loaded = await evalValue(client, `window.__WARGUS_TS_LOAD_MAP__(${JSON.stringify(MAP_PATH)})`);
  if (loaded !== true) {
    throw new Error(`Unable to load harvest audit map ${MAP_PATH}: ${JSON.stringify(loaded)}`);
  }
  await dismissOverlays(client);
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.titleScreenOpen === false && window.__WARGUS_TS_SMOKE_STATE__?.briefingOpen === false", 10_000);
  await waitForExpression(client, "Boolean(window.__WARGUS_TS_SMOKE_STATE__?.firstOwnedHarvestWorkerWorldPoint)", 10_000);
  const before = await readSmokeState(client);
  const beforeResources = before.visibilityPlayerResources ?? {};
  const goldIssued = await evalValue(client, "window.__WARGUS_TS_ISSUE_FIRST_GOLD_HARVEST__()");
  if (goldIssued !== true) {
    throw new Error(`Unable to issue first gold harvest order: ${JSON.stringify(await readSmokeState(client))}`);
  }
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.firstSelectedOrderKind === \"harvest\" && window.__WARGUS_TS_SMOKE_STATE__?.firstSelectedOrderResource === \"gold\"", 10_000);
  const goldState = await waitForGoldDelivery(client, beforeResources, 75_000);
  const issued = await evalValue(client, "window.__WARGUS_TS_ISSUE_FIRST_WOOD_HARVEST__()");
  if (issued !== true) {
    throw new Error(`Unable to issue first wood harvest order: ${JSON.stringify(await readSmokeState(client))}`);
  }
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.firstSelectedOrderKind === \"harvest\" && window.__WARGUS_TS_SMOKE_STATE__?.firstSelectedOrderResource === \"wood\"", 10_000);
  const harvestState = await waitForWoodHarvestContinuation(client, goldState.visibilityPlayerResources ?? beforeResources, 75_000);
  const save = await evalValue(client, "window.__WARGUS_TS_SAVE_ACTIVE_WORLD_ROUNDTRIP__()");
  if (!save?.ok || save.saveRoundtripOk !== true || !Number.isFinite(save.tick) || save.tick < harvestState.tick) {
    throw new Error(`Harvest active-world save/load roundtrip failed: ${JSON.stringify(save)}`);
  }
  if (pageErrors.length > 0) {
    throw new Error(`Browser page exceptions: ${pageErrors.join("; ")}`);
  }
  console.log(`Browser harvest session verified (${MAP_PATH}, gold ${beforeResources.gold ?? 0}->${goldState.visibilityPlayerResources?.gold ?? "unknown"}, order=${harvestState.firstSelectedOrderKind}, resource=${harvestState.firstSelectedOrderResource}, carried=${harvestState.firstSelectedResourcesHeld ?? 0} ${harvestState.firstSelectedCarriedResource ?? "none"}, resources=${JSON.stringify(harvestState.visibilityPlayerResources)}, tick=${harvestState.tick}).`);
} finally {
  client?.close();
  await stopProcess(chrome);
  await stopProcess(server);
  cleanupDedicatedProcesses();
  rmSync(chromeProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}

async function waitForGoldDelivery(client, beforeResources, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await readSmokeState(client);
    const resources = state.visibilityPlayerResources ?? {};
    if ((resources.gold ?? 0) > (beforeResources.gold ?? 0)
      && state.firstSelectedOrderKind === "harvest"
      && (state.firstSelectedOrderResource === "gold" || state.firstSelectedOrderResource === "wood")
      && (state.firstSelectedResourcesHeld ?? 0) === 0) {
      return state;
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for gold delivery to town hall; smoke=${JSON.stringify(await readSmokeState(client))}`);
}

async function waitForWoodHarvestContinuation(client, beforeResources, timeoutMs) {
  const start = Date.now();
  let deliveredWood = false;
  while (Date.now() - start < timeoutMs) {
    const state = await readSmokeState(client);
    const resources = state.visibilityPlayerResources ?? {};
    if ((resources.wood ?? 0) > (beforeResources.wood ?? 0)) {
      deliveredWood = true;
    }
    if (deliveredWood
      && state.firstSelectedOrderKind === "harvest"
      && state.firstSelectedOrderResource === "wood"
      && ((state.firstSelectedCarriedResource === "wood" && (state.firstSelectedResourcesHeld ?? 0) > 0) || state.firstSelectedOrderTarget !== null)) {
      return state;
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for wood harvest continuation after delivery; smoke=${JSON.stringify(await readSmokeState(client))}`);
}

async function dismissOverlays(client) {
  await dispatchKey(client, "Enter");
  await delay(300);
  await dispatchKey(client, "Enter");
  await delay(500);
}

async function evalValue(client, expression) {
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? `Evaluation failed: ${expression}`);
  }
  return result.result?.value ?? null;
}

async function readSmokeState(client) {
  return await evalValue(client, "window.__WARGUS_TS_SMOKE_STATE__");
}

async function waitForExpression(client, expression, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await client.send("Runtime.evaluate", { expression, returnByValue: true });
    if (result.result?.value === true) {
      return;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for browser expression: ${expression}; smoke=${JSON.stringify(await readSmokeState(client))}`);
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
      execFileSync("pkill", ["-f", pattern], { stdio: "ignore" });
    } catch {
      // Best-effort cleanup.
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
