import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { inflateSync } from "node:zlib";

const PORT = 5199;
const DEBUG_PORT = 9226;
const URL = `http://127.0.0.1:${PORT}/?smoke=1`;
const CHROME = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";
const SESSION_COUNT = Number(process.env.WARGUS_BROWSER_PLAYABLE_SESSIONS ?? 12);
const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const maps = representativeSetupMaps((manifest.maps ?? []).filter((map) => map.setupJson)).slice(0, SESSION_COUNT);
const chromeProfile = mkdtempSync(path.join(tmpdir(), "wargus-playable-chrome-"));
const server = spawn("npm", ["run", "dev", "--", "--port", String(PORT), "--strictPort"], {
  detached: true,
  stdio: "ignore"
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
  await waitForExpression(client, "typeof window.__WARGUS_TS_LOAD_MAP__ === \"function\" && typeof window.__WARGUS_TS_SAVE_ACTIVE_WORLD_ROUNDTRIP__ === \"function\"", 20_000);

  const failures = [];
  let completed = 0;
  for (const map of maps) {
    if (completed > 0) {
      console.log(`Browser playable session progress: ${completed}/${maps.length}`);
    }
    const loadResult = await client.send("Runtime.evaluate", {
      expression: `window.__WARGUS_TS_LOAD_MAP__(${JSON.stringify(map.path)})`,
      awaitPromise: true,
      returnByValue: true
    });
    if (loadResult.exceptionDetails || loadResult.result?.value !== true) {
      failures.push(`${map.path}: smoke load failed ${loadResult.exceptionDetails?.text ?? JSON.stringify(loadResult.result?.value)}`);
      continue;
    }
    await dismissOverlays(client);
    await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.titleScreenOpen === false && window.__WARGUS_TS_SMOKE_STATE__?.briefingOpen === false", 10_000);
    const start = await readSmokeState(client);
    if (start.matchStatus !== "playing" || !Number.isFinite(start.tick)) {
      failures.push(`${map.path}: invalid playable state ${JSON.stringify({ matchStatus: start.matchStatus, tick: start.tick })}`);
      continue;
    }
    if (await evalValue(client, "window.__WARGUS_TS_CENTER_FIRST_OWNED_MOVABLE__?.()") !== true) {
      failures.push(`${map.path}: no owned movable unit available for playable audit`);
      continue;
    }
    const selectablePoint = await waitForSmokePoint(client, "firstOwnedMovableScreenPoint", 10_000);
    await dispatchMouseClick(client, selectablePoint.x, selectablePoint.y);
    await waitForExpression(client, "Number(window.__WARGUS_TS_SMOKE_STATE__?.selectedUnitCount ?? 0) > 0", 10_000);
    const selected = await readSmokeState(client);
    const beforeStats = await captureNonBlankScreenshot(client, `${map.path} selected`, { uniqueColors: 10, brightPixels: 80 });
    const orderedOk = await tryIssueRightClickOrder(client, selectablePoint);
    if (!orderedOk) {
      failures.push(`${map.path}: right-click command did not produce a selected-unit order`);
      continue;
    }
    const ordered = await readSmokeState(client);
    await waitForExpression(client, `Number(window.__WARGUS_TS_SMOKE_STATE__?.tick ?? -1) > ${Number(ordered.tick ?? start.tick)}`, 10_000);
    await delay(1200);
    const after = await readSmokeState(client);
    const afterStats = await captureNonBlankScreenshot(client, `${map.path} after command`, { uniqueColors: 10, brightPixels: 80 });
    const save = await evalValue(client, "window.__WARGUS_TS_SAVE_ACTIVE_WORLD_ROUNDTRIP__()");
    if (after.tick <= start.tick) {
      failures.push(`${map.path}: simulation tick did not advance ${JSON.stringify({ start: start.tick, after: after.tick })}`);
    }
    if (sameScreenshotStats(beforeStats, afterStats) && JSON.stringify(selected.firstSelectedWorldPoint) === JSON.stringify(after.firstSelectedWorldPoint)) {
      failures.push(`${map.path}: command session produced no observable render or selected-unit position change`);
    }
    if (!save?.ok || save.saveRoundtripOk !== true || !Number.isFinite(save.tick) || save.tick < after.tick) {
      failures.push(`${map.path}: active-world save/load roundtrip failed after command ${JSON.stringify(save)}`);
    }
    completed += 1;
  }
  if (pageErrors.length > 0) {
    failures.push(`Browser page exceptions: ${pageErrors.join("; ")}`);
  }
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(failure);
    }
    console.error(`Browser playable session audit failed (${failures.length} errors after ${completed}/${maps.length} sessions).`);
    process.exit(1);
  }
  console.log(`Browser playable session audit verified (${completed} maps selected, commanded, tick-advanced, rendered, and save/load roundtripped after input).`);
} finally {
  client?.close();
  await stopProcess(chrome);
  await stopProcess(server);
  cleanupDedicatedProcesses();
  rmSync(chromeProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}

async function tryIssueRightClickOrder(client, selectablePoint) {
  const candidates = [
    ...rightClickCandidateRing(selectablePoint, 120),
    ...rightClickCandidateRing(selectablePoint, 220),
    ...rightClickCandidateRing(selectablePoint, 320),
    { x: 420, y: 260 },
    { x: 520, y: 310 },
    { x: 640, y: 360 },
    { x: 760, y: 410 },
    { x: 860, y: 280 }
  ].map((point) => ({
    x: Math.max(260, Math.min(1000, point.x)),
    y: Math.max(160, Math.min(560, point.y))
  }));
  for (const point of candidates) {
    await dispatchMouseClick(client, point.x, point.y, "right");
    if (await waitForExpressionValue(client, "window.__WARGUS_TS_SMOKE_STATE__?.selectedUnitCount > 0 && window.__WARGUS_TS_SMOKE_STATE__?.firstSelectedOrderKind !== null", 1500)) {
      return true;
    }
  }
  return false;
}

function rightClickCandidateRing(point, distance) {
  return [
    { x: point.x + distance, y: point.y },
    { x: point.x - distance, y: point.y },
    { x: point.x, y: point.y + distance },
    { x: point.x, y: point.y - distance },
    { x: point.x + distance, y: point.y + distance * 0.65 },
    { x: point.x - distance, y: point.y - distance * 0.65 },
    { x: point.x + distance, y: point.y - distance * 0.65 },
    { x: point.x - distance, y: point.y + distance * 0.65 }
  ];
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
    if (selected.size >= SESSION_COUNT) {
      break;
    }
    selected.set(map.path, map);
  }
  return [...selected.values()].sort((left, right) => left.path.localeCompare(right.path));
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

async function waitForHttp(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
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
    if (page) return page;
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
    if (result.result?.value === true) return true;
    await delay(250);
  }
  return false;
}

async function readSmokeState(client) {
  return await evalValue(client, "window.__WARGUS_TS_SMOKE_STATE__");
}

async function waitForSmokePoint(client, key, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await readSmokeState(client);
    const point = state?.[key];
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
      return point;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for smoke point: ${key}`);
}

async function dispatchKey(client, code) {
  const key = code === "Enter" ? "Enter" : code;
  const windowsVirtualKeyCode = code === "Enter" ? 13 : 0;
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
}

async function dispatchMouseClick(client, x, y, button = "left") {
  const buttons = button === "right" ? 2 : 1;
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button, buttons, clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button, buttons: 0, clickCount: 1 });
}

async function captureNonBlankScreenshot(client, label, thresholds) {
  const screenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const stats = pngColorStats(Buffer.from(screenshot.data, "base64"));
  if (stats.sampled < 100 || stats.uniqueColors < thresholds.uniqueColors || stats.brightPixels < thresholds.brightPixels) {
    throw new Error(`Browser ${label} screenshot appears blank: ${JSON.stringify(stats)}`);
  }
  return stats;
}

function sameScreenshotStats(left, right) {
  return left.uniqueColors === right.uniqueColors && left.brightPixels === right.brightPixels;
}

function pngColorStats(buffer) {
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Screenshot was not a PNG.");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`Unsupported PNG screenshot format: bitDepth=${bitDepth} colorType=${colorType}`);
  }
  const raw = inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const colors = new Set();
  let brightPixels = 0;
  let sampled = 0;
  let rawOffset = 0;
  const previous = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[rawOffset++];
    raw.copy(current, 0, rawOffset, rawOffset + stride);
    rawOffset += stride;
    unfilterScanline(current, previous, filter, channels);
    for (let x = 0; x < width; x += 8) {
      const index = x * channels;
      const r = current[index];
      const g = current[index + 1];
      const b = current[index + 2];
      const a = colorType === 6 ? current[index + 3] : 255;
      if (a > 0) {
        colors.add(`${r},${g},${b}`);
        if (r + g + b > 96) brightPixels += 1;
        sampled += 1;
      }
    }
    previous.set(current);
  }
  return { width, height, sampled, uniqueColors: colors.size, brightPixels };
}

function unfilterScanline(current, previous, filter, bytesPerPixel) {
  for (let i = 0; i < current.length; i++) {
    const left = i >= bytesPerPixel ? current[i - bytesPerPixel] : 0;
    const up = previous[i] ?? 0;
    const upLeft = i >= bytesPerPixel ? previous[i - bytesPerPixel] ?? 0 : 0;
    if (filter === 1) current[i] = (current[i] + left) & 255;
    else if (filter === 2) current[i] = (current[i] + up) & 255;
    else if (filter === 3) current[i] = (current[i] + Math.floor((left + up) / 2)) & 255;
    else if (filter === 4) current[i] = (current[i] + paeth(left, up, upLeft)) & 255;
  }
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

async function stopProcess(process) {
  if (!process || process.exitCode !== null || process.signalCode !== null) return;
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
  if (process.exitCode !== null || process.signalCode !== null) return;
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
