import { BrowserExecutionController } from "./lib/browser-execution-controller.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

const execution = new BrowserExecutionController({ name: import.meta.url });
const { serverPort: PORT, debugPort: DEBUG_PORT } = await execution.allocatePorts();
const URL = `http://127.0.0.1:${PORT}/?smoke=1`;
const CHROME = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";
const MAP_PATH = process.env.WARGUS_BROWSER_HARVEST_MAP ?? "maps/ladder/Garden of war BNE.pud.smp.gz";
const chromeProfile = mkdtempSync(path.join(tmpdir(), "wargus-harvest-chrome-"));
await execution.releasePort(PORT);
const server = execution.spawnOwned("npm", ["run", "dev", "--", "--port", String(PORT), "--strictPort"], {
  stdio: ["pipe", "ignore", "ignore"]
});
let chrome = null;
let client = null;

try {
  await waitForHttp(URL, 20_000);
  await execution.releasePort(DEBUG_PORT);
  chrome = execution.spawnOwned(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--user-data-dir=${chromeProfile}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    "about:blank"
  ], { stdio: "ignore" });
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
  await waitForExpression(client, "typeof window.__WARGUS_TS_LOAD_MAP__ === \"function\" && typeof window.__WARGUS_TS_ISSUE_FIRST_GOLD_HARVEST__ === \"function\" && typeof window.__WARGUS_TS_ISSUE_FIRST_WOOD_HARVEST__ === \"function\" && typeof window.__WARGUS_TS_SELECT_SOURCE_PENDING_ACTION_FIXTURE__ === \"function\" && typeof window.__WARGUS_TS_EXECUTE_HUD_COMMAND__ === \"function\" && typeof window.__WARGUS_TS_ISSUE_PENDING_WORLD_COMMAND_AT__ === \"function\" && typeof window.__WARGUS_TS_SAVE_ACTIVE_WORLD_ROUNDTRIP__ === \"function\"", 20_000);

  const loaded = await evalValue(client, `window.__WARGUS_TS_LOAD_MAP__(${JSON.stringify(MAP_PATH)})`);
  if (loaded !== true) {
    throw new Error(`Unable to load harvest audit map ${MAP_PATH}: ${JSON.stringify(loaded)}`);
  }
  await dismissOverlays(client);
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.titleScreenOpen === false && window.__WARGUS_TS_SMOKE_STATE__?.briefingOpen === false", 10_000);
  await waitForExpression(client, "Boolean(window.__WARGUS_TS_SMOKE_STATE__?.firstOwnedHarvestWorkerWorldPoint)", 10_000);
  let before = await readSmokeState(client);
  let beforeResources = before.visibilityPlayerResources ?? {};
  let usedFixtureHarvest = false;
  let goldIssued = await evalValue(client, "window.__WARGUS_TS_ISSUE_FIRST_GOLD_HARVEST__()");
  if (goldIssued !== true) {
    const fixture = await evalValue(client, "window.__WARGUS_TS_SELECT_SOURCE_PENDING_ACTION_FIXTURE__('harvest')");
    if (!fixture?.ok || !fixture.target || !fixture.commandId) {
      throw new Error(`Unable to create harvest fixture after live harvest order failed: fixture=${JSON.stringify(fixture)} smoke=${JSON.stringify(await readSmokeState(client))}`);
    }
    before = await readSmokeState(client);
    beforeResources = before.visibilityPlayerResources ?? {};
    const pending = await evalValue(client, `window.__WARGUS_TS_EXECUTE_HUD_COMMAND__(${JSON.stringify(fixture.commandId)})`);
    const pendingState = await readSmokeState(client);
    if (pending?.feedback !== "click" || !pendingState.pendingWorldCommandKind) {
      throw new Error(`Unable to enter harvest targeting from fixture: pending=${JSON.stringify(pending)} smoke=${JSON.stringify(pendingState)}`);
    }
    const issued = await evalValue(client, `window.__WARGUS_TS_ISSUE_PENDING_WORLD_COMMAND_AT__(${Math.round(fixture.target.x)}, ${Math.round(fixture.target.y)})`);
    if (!issued?.issued) {
      throw new Error(`Unable to issue fixture harvest order: issued=${JSON.stringify(issued)} smoke=${JSON.stringify(await readSmokeState(client))}`);
    }
    goldIssued = true;
    usedFixtureHarvest = true;
  }
  if (usedFixtureHarvest) {
    await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.firstSelectedOrderKind === \"harvest\" && [\"gold\", \"wood\"].includes(window.__WARGUS_TS_SMOKE_STATE__?.firstSelectedOrderResource)", 10_000);
    const harvestState = await waitForAnyHarvestProgress(client, beforeResources, 75_000);
    const save = await evalValue(client, "window.__WARGUS_TS_SAVE_ACTIVE_WORLD_ROUNDTRIP__()");
    if (!save?.ok || save.saveRoundtripOk !== true || !Number.isFinite(save.tick) || save.tick < harvestState.tick) {
      throw new Error(`Harvest active-world save/load roundtrip failed: ${JSON.stringify(save)}`);
    }
    if (pageErrors.length > 0) {
      throw new Error(`Browser page exceptions: ${pageErrors.join("; ")}`);
    }
    console.log(`Browser harvest session verified (${MAP_PATH}, fixture resource=${harvestState.firstSelectedOrderResource}, carried=${harvestState.firstSelectedResourcesHeld ?? 0} ${harvestState.firstSelectedCarriedResource ?? "none"}, resources=${JSON.stringify(harvestState.visibilityPlayerResources)}, tick=${harvestState.tick}).`);
  } else {
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
  }
} finally {
  client?.close();
  await execution.cleanup();
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

async function waitForAnyHarvestProgress(client, beforeResources, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await readSmokeState(client);
    const resources = state.visibilityPlayerResources ?? {};
    if (state.firstSelectedOrderKind === "harvest"
      && (state.firstSelectedOrderResource === "gold" || state.firstSelectedOrderResource === "wood")
      && (
        (state.firstSelectedResourcesHeld ?? 0) > 0
        || (resources.gold ?? 0) > (beforeResources.gold ?? 0)
        || (resources.wood ?? 0) > (beforeResources.wood ?? 0)
        || state.firstSelectedOrderTarget !== null
      )) {
      return state;
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for fixture harvest progress; smoke=${JSON.stringify(await readSmokeState(client))}`);
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



function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
