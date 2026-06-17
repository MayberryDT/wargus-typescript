import { inflateSync } from "node:zlib";
import {
  connectDevTools,
  delay,
  evalValue,
  readSmokeState,
  removeProfile,
  startChrome,
  startViteServer,
  stopProcess,
  waitForExpression,
  waitForHttp,
  waitForPageTarget
} from "./browser-smoke-harness.mjs";

const PORT = 5197;
const DEBUG_PORT = 9224;
const URL = `http://127.0.0.1:${PORT}/?smoke=1`;
const CHROME = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";
const EXPECTED_BACKGROUND_MUSIC = "warcraft-2-ost-human-1-128-ytshorts.savetube.me.mp3";
const serverMode = process.env.WARGUS_BROWSER_SMOKE_SERVER === "preview" ? "preview" : "dev";
const server = startViteServer({ port: PORT, mode: serverMode, stdio: ["ignore", "pipe", "pipe"] });
let serverOutput = "";
server.stdout?.on("data", (chunk) => {
  serverOutput = `${serverOutput}${String(chunk)}`.slice(-4000);
});
server.stderr?.on("data", (chunk) => {
  serverOutput = `${serverOutput}${String(chunk)}`.slice(-4000);
});
let chrome = null;
let chromeProfile = null;

try {
  await waitForHttp(URL, 20_000, () => serverOutput);
  const chromeStart = startChrome({ chromeBin: CHROME, debugPort: DEBUG_PORT, profilePrefix: "wargus-chrome-" });
  chrome = chromeStart.child;
  chromeProfile = chromeStart.profilePath;
  await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json/version`, 10_000);
  const target = await waitForPageTarget(`http://127.0.0.1:${DEBUG_PORT}/json/list`, 10_000);
  const client = await connectDevTools(target.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  const pageErrors = [];
  client.on("Runtime.exceptionThrown", (params) => {
    pageErrors.push(params.exceptionDetails?.text ?? params.exceptionDetails?.exception?.description ?? "unknown page exception");
  });
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await client.send("Page.navigate", { url: URL });
  await client.waitFor("Page.loadEventFired", 20_000);
  await waitForExpression(client, `
    (() => {
      const canvas = document.querySelector("canvas");
      const root = document.querySelector("#app");
      return Boolean(canvas && root && canvas.width >= 640 && canvas.height >= 360 && root.clientWidth >= 640 && root.clientHeight >= 360);
    })()
  `, 20_000);
  await waitForExpression(client, `
    (() => {
      const canvas = document.querySelector("canvas");
      return Boolean(canvas && canvas.dataset.wargusVideoShader && canvas.style.imageRendering);
    })()
  `, 20_000);
  await waitForExpression(client, "Boolean(window.__WARGUS_TS_SMOKE_STATE__?.worldLoaded)", 20_000);
  await delay(1200);
  if (pageErrors.length > 0) {
    throw new Error(`Browser page exceptions: ${pageErrors.join("; ")}`);
  }
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.titleScreenOpen === false", 10_000);
  const hasBriefing = await evalValue(client, "window.__WARGUS_TS_SMOKE_STATE__?.briefingOpen === true");
  if (hasBriefing) {
    await dispatchKey(client, "Enter");
  }
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.titleScreenOpen === false && window.__WARGUS_TS_SMOKE_STATE__?.briefingOpen === false", 10_000);
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.fixedDemoMovementPaceMultiplier > 1", 10_000);
  await waitForExpression(client, `
    (() => {
      const state = window.__WARGUS_TS_SMOKE_STATE__;
      const counts = state?.ownedUnitCounts ?? {};
      const resources = state?.visibilityPlayerResources ?? {};
      return state?.selectedUnitCount === 1
        && state?.selectedUnitTypes?.[0] === "unit-peasant"
        && counts["unit-peasant"] === 1
        && !counts["unit-town-hall"]
        && !counts["unit-farm"]
        && !counts["unit-keep"]
        && !counts["unit-castle"]
        && Number(resources.gold ?? 0) >= 10000
        && Number(resources.wood ?? 0) >= 5000;
    })()
  `, 10_000);
  await delay(1200);
  const fogTelemetry = await waitForFogTelemetry(client, 10_000);
  const mapTileCount = fogTelemetry.exploredTiles + fogTelemetry.unexploredTiles;
  if (fogTelemetry.visibleTiles <= 0 || fogTelemetry.exploredTiles <= 0 || fogTelemetry.unexploredTiles <= 0 || fogTelemetry.exploredTiles >= mapTileCount) {
    throw new Error(`Playable world should start with only starting-area fog explored, not full-map exploration: ${JSON.stringify(fogTelemetry)}`);
  }
  const playableStats = await captureNonBlankScreenshot(client, "playable world", { uniqueColors: 10, brightPixels: 80 });
  await waitForExpression(client, "window.__WARGUS_TS_CENTER_FIRST_OWNED_MOVABLE__?.() === true", 10_000);
  const selectablePoint = await waitForSmokePoint(client, "firstOwnedMovableScreenPoint", 10_000);
  await dispatchMouseClick(client, selectablePoint.x, selectablePoint.y);
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.selectedUnitCount === 1 && Number(window.__WARGUS_TS_SMOKE_STATE__?.firstSelectedSpeed ?? 0) > 0", 10_000);
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.audioContextCreated === true && window.__WARGUS_TS_SMOKE_STATE__?.audioContextState === \"running\" && window.__WARGUS_TS_SMOKE_STATE__?.audioUnlocked === true && window.__WARGUS_TS_SMOKE_STATE__?.audioStereoSound === true", 10_000);
  await waitForExpression(client, `window.__WARGUS_TS_SMOKE_STATE__?.audioCurrentMusic === ${JSON.stringify(EXPECTED_BACKGROUND_MUSIC)}`, 30_000);
  await waitForExpression(client, "Number(window.__WARGUS_TS_SMOKE_STATE__?.audioPlayStarts ?? 0) > 0 && (Number(window.__WARGUS_TS_SMOKE_STATE__?.audioBufferedSounds ?? 0) > 0 || Number(window.__WARGUS_TS_SMOKE_STATE__?.audioHtmlPlayStarts ?? 0) > 0) && Number(window.__WARGUS_TS_SMOKE_STATE__?.audioHtmlPlayFailures ?? 0) === 0 && !window.__WARGUS_TS_SMOKE_STATE__?.audioLastError", 10_000);
  await waitForExpression(client, "typeof window.__WARGUS_TS_PLAY_AUDIO_FIXTURE__ === \"function\"", 10_000);
  const audioFixture = await evalValue(client, "window.__WARGUS_TS_PLAY_AUDIO_FIXTURE__()");
  if (!audioFixture?.ok) {
    throw new Error(`Browser audio fixture failed: ${JSON.stringify(audioFixture)} smoke=${JSON.stringify(await readSmokeState(client))}`);
  }
  await delay(700);
  const inputStats = await captureNonBlankScreenshot(client, "post-input playable world", { uniqueColors: 10, brightPixels: 80 });
  await dispatchMouseClick(client, Math.min(900, selectablePoint.x + 220), Math.min(620, selectablePoint.y + 120), "right");
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.selectedUnitCount > 0 && window.__WARGUS_TS_SMOKE_STATE__?.firstSelectedOrderKind !== null", 10_000);
  await delay(700);
  const commandStats = await captureNonBlankScreenshot(client, "post-command playable world", { uniqueColors: 10, brightPixels: 80 });
  if (sameScreenshotStats(inputStats, commandStats)) {
    throw new Error(`Browser smoke did not observe a render transition after right-click command input: ${JSON.stringify({ inputStats, commandStats })}`);
  }
  const smokeState = await readSmokeState(client);
  const mapLayerChildren = Number(smokeState?.displayObjects?.mapLayerChildren ?? 0);
  if (!Number.isFinite(mapLayerChildren) || mapLayerChildren <= 0 || mapLayerChildren > 3000) {
    throw new Error(`Browser smoke expected viewport-bounded terrain rendering, found mapLayerChildren=${mapLayerChildren}; smoke=${JSON.stringify(smokeState)}`);
  }
  console.log(`Browser runtime smoke verified (${serverMode}, playable ${playableStats.uniqueColors} colors, selected ${inputStats.uniqueColors} colors, command ${commandStats.uniqueColors} colors, fog explored ${fogTelemetry.exploredTiles}/${mapTileCount}, mapLayerChildren=${mapLayerChildren}, selection=first-owned-movable, order ${smokeState?.firstSelectedOrderKind ?? "unknown"}, audio ${smokeState?.audioContextState ?? "unknown"}, music ${smokeState?.audioCurrentMusic ?? "unknown"}, sound ${smokeState?.audioLastSoundFile ?? "unknown"}, fixture ${audioFixture.lastSoundFile ?? "unknown"}).`);
} finally {
  await stopProcess(chrome);
  await stopProcess(server);
  removeProfile(chromeProfile);
}

async function waitForFogTelemetry(client, timeoutMs) {
  const start = Date.now();
  let latest = null;
  while (Date.now() - start < timeoutMs) {
    latest = await evalValue(client, `
      (() => {
        const log = window.__WARGUS_TS_PLAYTEST_LOG__?.() ?? [];
        const entry = [...log].reverse().find((candidate) => candidate.activeMapPath && candidate.fog);
        return entry?.fog ?? null;
      })()
    `);
    if (
      latest
      && Number.isFinite(latest.visibleTiles)
      && Number.isFinite(latest.exploredTiles)
      && Number.isFinite(latest.unexploredTiles)
    ) {
      return latest;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for browser fog telemetry: ${JSON.stringify(latest)}; smoke=${JSON.stringify(await readSmokeState(client))}`);
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

async function waitForRepeatedOwnedTypePoint(client, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await readSmokeState(client);
    const counts = new Map();
    for (const point of state?.ownedUnitScreenPoints ?? []) {
      counts.set(point.typeId, (counts.get(point.typeId) ?? 0) + 1);
    }
    const point = (state?.ownedUnitScreenPoints ?? []).find((candidate) => (counts.get(candidate.typeId) ?? 0) > 1);
    if (point && Number.isFinite(point.screenX) && Number.isFinite(point.screenY)) {
      return { typeId: point.typeId, x: point.screenX, y: point.screenY, repeated: true };
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for a visible owned unit type with at least two members.");
}

async function waitForOwnedTypePoint(client, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await readSmokeState(client);
    const point = (state?.ownedUnitScreenPoints ?? []).find((candidate) => Number.isFinite(candidate.screenX) && Number.isFinite(candidate.screenY));
    if (point) {
      return { typeId: point.typeId, x: point.screenX, y: point.screenY, repeated: false };
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for a visible owned unit.");
}

async function dispatchKey(client, code) {
  const key = code === "Enter" ? "Enter" : code === "Period" ? "." : code;
  const windowsVirtualKeyCode = code === "Enter" ? 13 : code === "Period" ? 190 : 0;
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
}

async function dispatchMouseClick(client, x, y, button = "left", clickCount = 1) {
  const buttons = button === "right" ? 2 : 1;
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button, buttons, clickCount });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button, buttons: 0, clickCount });
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
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    throw new Error("Screenshot was not a PNG.");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
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
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idat));
  const rows = [];
  let readOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[readOffset];
    const row = Buffer.from(inflated.subarray(readOffset + 1, readOffset + 1 + stride));
    const prev = rows[y - 1] ?? Buffer.alloc(stride);
    unfilter(row, prev, channels, filter);
    rows.push(row);
    readOffset += 1 + stride;
  }
  const colors = new Set();
  let sampled = 0;
  let brightPixels = 0;
  const stepX = Math.max(1, Math.floor(width / 80));
  const stepY = Math.max(1, Math.floor(height / 45));
  for (let y = 0; y < height; y += stepY) {
    const row = rows[y];
    for (let x = 0; x < width; x += stepX) {
      const index = x * channels;
      const r = row[index];
      const g = row[index + 1];
      const b = row[index + 2];
      sampled += 1;
      colors.add(`${r},${g},${b}`);
      if (r + g + b > 90) {
        brightPixels += 1;
      }
    }
  }
  return { width, height, sampled, uniqueColors: colors.size, brightPixels };
}

function unfilter(row, prev, channels, filter) {
  for (let index = 0; index < row.length; index += 1) {
    const left = index >= channels ? row[index - channels] : 0;
    const up = prev[index] ?? 0;
    const upLeft = index >= channels ? prev[index - channels] ?? 0 : 0;
    if (filter === 1) {
      row[index] = (row[index] + left) & 0xff;
    } else if (filter === 2) {
      row[index] = (row[index] + up) & 0xff;
    } else if (filter === 3) {
      row[index] = (row[index] + Math.floor((left + up) / 2)) & 0xff;
    } else if (filter === 4) {
      row[index] = (row[index] + paeth(left, up, upLeft)) & 0xff;
    } else if (filter !== 0) {
      throw new Error(`Unsupported PNG filter ${filter}`);
    }
  }
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}
