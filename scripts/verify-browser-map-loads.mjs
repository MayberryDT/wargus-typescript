import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

const PORT = 5198;
const DEBUG_PORT = 9225;
const URL = `http://127.0.0.1:${PORT}/?smoke=1`;
const CHROME = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";
const serverMode = process.env.WARGUS_BROWSER_MAP_SERVER === "preview" ? "preview" : "dev";
const chromeProfile = mkdtempSync(path.join(tmpdir(), "wargus-map-smoke-chrome-"));
const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const setupMaps = (manifest.maps ?? []).filter((map) => map.setupJson);
const pathFilter = process.env.WARGUS_BROWSER_MAP_PATH;
const maps = pathFilter
  ? setupMaps.filter((map) => map.path === pathFilter)
  : process.env.WARGUS_BROWSER_MAP_LOADS === "all" ? setupMaps : representativeSetupMaps(setupMaps);
if (pathFilter && maps.length === 0) {
  console.error(`No setup-backed map matched WARGUS_BROWSER_MAP_PATH=${pathFilter}`);
  process.exit(1);
}
const server = spawn("npm", ["run", serverMode, "--", "--port", String(PORT), "--strictPort"], {
  detached: true,
  stdio: "ignore"
});
let chrome = null;

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
  const client = await connectDevTools(target.webSocketDebuggerUrl);
  const pageErrors = [];
  client.on("Runtime.exceptionThrown", (params) => {
    pageErrors.push(params.exceptionDetails?.text ?? params.exceptionDetails?.exception?.description ?? "unknown page exception");
  });
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await client.send("Page.navigate", { url: URL });
  await waitForBrowserMapLoadHarness(client);

  const failures = [];
  let loaded = 0;
  for (const map of maps) {
    if (loaded > 0 && loaded % 75 === 0) {
      await client.send("Page.navigate", { url: URL });
      await waitForBrowserMapLoadHarness(client);
    }
    if (loaded > 0 && loaded % 10 === 0) {
      console.log(`Browser map-load smoke progress: ${loaded}/${maps.length}`);
    }
    const result = await evaluateMapLoad(client, map);
    if (isRetriableMapLoadFailure(result)) {
      await client.send("Page.navigate", { url: URL });
      await waitForBrowserMapLoadHarness(client);
      const retryResult = await evaluateMapLoad(client, map);
      if (!isRetriableMapLoadFailure(retryResult)) {
        Object.assign(result, retryResult);
      }
    }
    if (result.exceptionDetails) {
      failures.push(`${map.path}: ${result.exceptionDetails.text ?? "load helper exception"}`);
      continue;
    }
    const summary = result.result?.value;
    if (!summary?.ok) {
      failures.push(`${map.path}: world helper returned ${JSON.stringify(summary)}`);
      continue;
    }
    const setup = JSON.parse(readFileSync(path.join("public/wargus", map.setupJson), "utf8"));
    if (summary.activeMapPath !== map.path) {
      failures.push(`${map.path}: created active map ${JSON.stringify(summary.activeMapPath)}`);
    }
    if (summary.mapWidth !== setup.width || summary.mapHeight !== setup.height) {
      failures.push(`${map.path}: runtime size ${summary.mapWidth}x${summary.mapHeight}, setup size ${setup.width}x${setup.height}`);
    }
    if ((summary.playerCount ?? 0) <= 0 || summary.visibilityPlayer === null || summary.visibilityPlayer === undefined) {
      failures.push(`${map.path}: invalid player state ${JSON.stringify({ playerCount: summary.playerCount, visibilityPlayer: summary.visibilityPlayer })}`);
    }
    if ((summary.unitCount ?? 0) <= 0) {
      failures.push(`${map.path}: runtime created no units`);
    }
    if (summary.saveRoundtripOk !== true) {
      failures.push(`${map.path}: save/load roundtrip failed ${JSON.stringify({ unitCount: summary.unitCount, saveRoundtripUnitCount: summary.saveRoundtripUnitCount, playerCount: summary.playerCount, saveRoundtripPlayerCount: summary.saveRoundtripPlayerCount })}`);
    }
    loaded += 1;
  }
  if (pageErrors.length > 0) {
    failures.push(`Browser page exceptions: ${pageErrors.join("; ")}`);
  }
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(failure);
    }
    console.error(`Browser map-load smoke failed (${failures.length} errors after ${loaded}/${maps.length} loads).`);
    process.exit(1);
  }
  const mode = process.env.WARGUS_BROWSER_MAP_LOADS === "all" ? "all" : "representative";
  console.log(`Browser map-load smoke verified (${serverMode}, ${loaded} ${mode} setup-backed maps loaded and save/load roundtripped through the browser runtime; run npm run verify:browser-map-loads:all for ${setupMaps.length}).`);
} finally {
  await stopProcess(chrome);
  await stopProcess(server);
  cleanupDedicatedProcesses();
  rmSync(chromeProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}

async function waitForBrowserMapLoadHarness(client) {
  await client.waitFor("Page.loadEventFired", 20_000);
  await waitForExpression(client, "Boolean(window.__WARGUS_TS_SMOKE_STATE__?.worldLoaded)", 20_000);
  await waitForExpression(client, "typeof window.__WARGUS_TS_CREATE_WORLD_FOR_MAP__ === \"function\"", 20_000);
}

async function evaluateMapLoad(client, map) {
  return client.send("Runtime.evaluate", {
    expression: `window.__WARGUS_TS_CREATE_WORLD_FOR_MAP__(${JSON.stringify(map.path)})`,
    awaitPromise: true,
    returnByValue: true
  });
}

function isRetriableMapLoadFailure(result) {
  if (result.exceptionDetails) {
    const text = `${result.exceptionDetails.text ?? ""} ${result.exceptionDetails.exception?.description ?? ""}`;
    return text.includes("Failed to fetch") || text.includes("NetworkError");
  }
  const summary = result.result?.value;
  return summary?.ok === false && typeof summary.error === "string" && (
    summary.error.includes("Failed to fetch") || summary.error.includes("NetworkError")
  );
}

function representativeSetupMaps(maps) {
  const selected = new Map();
  for (const map of maps) {
    if (map.campaignTitle || Number.isFinite(map.campaignMissionIndex)) {
      selected.set(map.path, map);
    }
  }
  for (const map of maps) {
    const key = `${map.setup?.tileset ?? "unknown"}:${map.width}x${map.height}`;
    if (![...selected.values()].some((candidate) => `${candidate.setup?.tileset ?? "unknown"}:${candidate.width}x${candidate.height}` === key)) {
      selected.set(map.path, map);
    }
  }
  for (const map of maps) {
    if (selected.size >= 72) {
      break;
    }
    selected.set(map.path, map);
  }
  return [...selected.values()].sort((left, right) => left.path.localeCompare(right.path));
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
      // Retry until the process opens the port.
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
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result ?? {});
      }
      return;
    }
    const handlers = listeners.get(message.method) ?? [];
    for (const handler of handlers) {
      handler(message.params ?? {});
    }
  });
  return {
    on(method, handler) {
      listeners.set(method, [...(listeners.get(method) ?? []), handler]);
    },
    send(method, params = {}) {
      const id = nextId;
      nextId += 1;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    waitFor(method, timeoutMs) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
        const handler = (params) => {
          clearTimeout(timeout);
          resolve(params);
        };
        listeners.set(method, [...(listeners.get(method) ?? []), handler]);
      });
    }
  };
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
  throw new Error(`Timed out waiting for browser expression: ${expression}`);
}

async function readSmokeState(client) {
  const result = await client.send("Runtime.evaluate", { expression: "window.__WARGUS_TS_SMOKE_STATE__", returnByValue: true });
  return result.result?.value ?? null;
}

async function stopProcess(process) {
  if (!process) {
    return;
  }
  if (process.exitCode !== null || process.signalCode !== null) {
    return;
  }
  try {
    globalThis.process.kill(-process.pid, "SIGTERM");
  } catch {
    try {
      process.kill("SIGTERM");
    } catch {
      // Process already exited.
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
      // Process already exited.
    }
  }
}

function cleanupDedicatedProcesses() {
  const patterns = [`remote-debugging-port=${DEBUG_PORT}`, `--port ${PORT}`, `--port=${PORT}`];
  for (const pattern of patterns) {
    let output = "";
    try {
      output = execFileSync("pgrep", ["-f", "--", pattern], { encoding: "utf8" });
    } catch {
      continue;
    }
    for (const line of output.split(/\r?\n/)) {
      const pid = Number(line.trim());
      if (!Number.isInteger(pid) || pid <= 0 || pid === globalThis.process.pid) {
        continue;
      }
      try {
        globalThis.process.kill(pid, "SIGKILL");
      } catch {
        // Process already exited.
      }
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
