import { BrowserExecutionController } from "./lib/browser-execution-controller.mjs";
import { writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { assertMinimapRuntimeSmoke } from "./lib/browser-runtime-smoke-assertions.mjs";

const execution = new BrowserExecutionController({ name: import.meta.url });
const requestedPort = process.env.WARGUS_BROWSER_RUNTIME_PORT;
const { serverPort: PORT } = await execution.allocatePorts({ requestedServerPort: requestedPort === undefined ? undefined : Number(requestedPort) });
const URL = `http://127.0.0.1:${PORT}/?smoke=1&demoSeed=ai-staged-pressure`;
const SESSION_LIMIT_MS = 25_000;
const MODE = process.env.WARGUS_BROWSER_RUNTIME_MODE ?? "plan014";
const SERVER_MODE = process.env.WARGUS_BROWSER_SMOKE_SERVER === "preview" ? "preview" : "dev";
const REPORT_PATH = process.env.WARGUS_BROWSER_RUNTIME_REPORT ?? null;
const EXPECTED_BACKGROUND_MUSIC = "warcraft-2-ost-human-1-128-ytshorts.savetube.me.mp3";
const EXPECTED_FIXED_DEMO_SOURCE_GAME_SPEED = 45;
const EXPECTED_FIXED_DEMO_GAME_SPEED = 1.5;
const EXPECTED_FIXED_DEMO_MOVEMENT_PACE_MULTIPLIER = 1;
let server = null;
let browserServer = null;
let browser = null;
let wallTimeMs = 0;

try {
  const { chromium } = await loadPlaywright();
  const browserExecutablePath = process.env.CHROME_BIN ?? chromium.executablePath();
  await execution.releasePort(PORT);
  server = execution.spawnOwned(process.execPath, ["node_modules/vite/bin/vite.js", ...(SERVER_MODE === "preview" ? ["preview"] : []), "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    cwd: process.cwd(),
    stdio: "ignore"
  });
  await waitForHttp(URL, 5_000);
  const manifestResponse = await fetch(`http://127.0.0.1:${PORT}/wargus/manifest.json`);
  if (!manifestResponse.ok) throw new Error(`Critical asset /wargus/manifest.json returned HTTP ${manifestResponse.status}.`);
  browserServer = await chromium.launchServer({
    executablePath: browserExecutablePath,
    headless: true,
    args: ["--disable-background-networking", "--disable-extensions", "--disable-dev-shm-usage", "--no-proxy-server"]
  });
  execution.trackOwnedPid(browserServer.process().pid);
  browser = await chromium.connect(browserServer.wsEndpoint());
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  if (context.pages().length !== 1) throw new Error(`Expected one browser tab, found ${context.pages().length}.`);
  const startedAt = Date.now();
  const result = await withTimeout(runRuntimeSmoke(page), SESSION_LIMIT_MS, "Plan 014 browser runtime smoke exceeded 25 seconds from page load");
  wallTimeMs = Date.now() - startedAt;
  if (context.pages().length !== 1) throw new Error(`Verifier opened extra tabs; found ${context.pages().length}.`);
  assertRuntimeSmoke(result);
  if (REPORT_PATH) {
    writeFileSync(REPORT_PATH, `${JSON.stringify(runtimeEvidenceReport(result), null, 2)}\n`, "utf8");
  }
  console.log(`Browser runtime smoke verified (${MODE}, one tab, port ${PORT}, wall ${(wallTimeMs / 1000).toFixed(1)}s; canvas ${result.canvas.width}x${result.canvas.height}/${result.screenshot.uniqueColors} colors; ${modeSummary(result)}, update ${Number(result.performance.averageUpdateMs).toFixed(2)}ms).`);
} finally {
  try { await Promise.race([browser?.close(), delay(1_500)]); } catch { /* Exact PID cleanup follows. */ }
  try { await Promise.race([browserServer?.close(), delay(1_500)]); } catch { /* Exact PID cleanup follows. */ }
  const cleanup = await execution.cleanup();
  if (cleanup.openPorts.includes(PORT)) throw new Error(`Verifier cleanup left port ${PORT} open.`);
  console.log(`Browser runtime smoke cleanup verified (exact owned PIDs stopped; port ${PORT} clear).`);
}

async function runRuntimeSmoke(page) {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 10_000 });
  await page.waitForFunction(() => Boolean(window.__WARGUS_TS_SMOKE_STATE__?.worldLoaded), null, { timeout: 8_000 });
  await page.waitForFunction((mode) => {
    if (mode === "basics") return true;
    if (mode === "plan014") return window.__WARGUS_TS_SMOKE_STATE__?.aiStates?.some((state) => state.enabled && state.evidence);
    if (mode === "m01") return typeof window.__WARGUS_TS_RUN_CONSTRUCTION_LIFECYCLE_FIXTURE__ === "function";
    if (mode === "m04") return typeof window.__WARGUS_TS_RUN_MOVEMENT_ROUTE_SEMANTICS_FIXTURE__ === "function";
    return typeof window.__WARGUS_TS_RUN_MECHANICS_SCENARIO__ === "function";
  }, MODE, { timeout: 3_000 });
  await page.waitForFunction(() => {
    const performance = window.__WARGUS_TS_SMOKE_STATE__?.performance ?? {};
    return Number.isFinite(performance.averageUpdateMs)
      && performance.averageUpdateMs <= 20
      && Number.isFinite(performance.averageRenderMs)
      && performance.averageRenderMs <= 24;
  }, null, { timeout: 5_000 });
  const canvas = await page.locator("canvas").evaluate((element) => ({
    width: element.width,
    height: element.height,
    shader: element.dataset.wargusVideoShader ?? null,
    imageRendering: element.style.imageRendering
  }));
  const screenshot = pngColorStats(await page.screenshot({ type: "png" }));
  if (MODE === "basics") {
    return runBrowserBasics(page, pageErrors, canvas, screenshot);
  }
  const fixtures = await page.evaluate((mode) => {
    const startedAt = performance.now();
    const result = mode === "plan014"
      ? {}
      : mode === "m01"
        ? { m01: window.__WARGUS_TS_RUN_CONSTRUCTION_LIFECYCLE_FIXTURE__("arrival") }
        : mode === "m04"
          ? { m04: window.__WARGUS_TS_RUN_MOVEMENT_ROUTE_SEMANTICS_FIXTURE__() }
          : mode === "m07"
            ? { m07: window.__WARGUS_TS_RUN_MECHANICS_SCENARIO__("M07") }
            : { modeError: `unknown mode ${mode}` };
    return { ...result, fixtureWallMs: performance.now() - startedAt, smoke: window.__WARGUS_TS_SMOKE_STATE__ };
  }, MODE);
  if (pageErrors.length > 0) throw new Error(`Browser page exceptions: ${pageErrors.join("; ")}`);
  return { ...fixtures, canvas, screenshot, performance: fixtures.smoke?.performance ?? {} };
}

function assertRuntimeSmoke(result) {
  const failures = [];
  if (result.canvas.width < 640 || result.canvas.height < 360 || !result.canvas.shader || !result.canvas.imageRendering) failures.push(`runtime canvas: ${JSON.stringify(result.canvas)}`);
  if (result.screenshot.sampled < 100 || result.screenshot.uniqueColors < 10 || result.screenshot.brightPixels < 80) failures.push(`nonblank canvas render: ${JSON.stringify(result.screenshot)}`);
  const mapLayerChildren = Number(result.smoke?.displayObjects?.mapLayerChildren ?? 0);
  if (!(mapLayerChildren > 0 && mapLayerChildren <= 3000)) failures.push(`viewport-bounded terrain: ${mapLayerChildren}`);
  const mapTileCount = Number(result.smoke?.mapWidth ?? 0) * Number(result.smoke?.mapHeight ?? 0);
  assertMinimapRuntimeSmoke(result.smoke?.minimapRenderCache, mapTileCount, failures);
  const selectedUnitTypes = result.smoke?.selectedUnitTypes ?? [];
  const counts = result.smoke?.ownedUnitCounts ?? {};
  const resources = result.smoke?.visibilityPlayerResources ?? {};
  if (!(selectedUnitTypes?.[0] === "unit-peasant" && selectedUnitTypes.length === 1)) failures.push(`fixed-demo selected peasant: ${JSON.stringify(selectedUnitTypes)}`);
  if (!(counts["unit-peasant"] === 1)) failures.push(`fixed-demo owned peasant: ${JSON.stringify(counts)}`);
  if (!(!counts["unit-town-hall"] && !counts["unit-farm"] && !counts["unit-keep"] && !counts["unit-castle"])) failures.push(`fixed-demo starts without buildings: ${JSON.stringify(counts)}`);
  if (!(Number(resources.gold ?? 0) >= 10000 && Number(resources.wood ?? 0) >= 5000 && Number(resources.oil ?? 0) >= 5000)) failures.push(`fixed-demo high resources: ${JSON.stringify(resources)}`);
  if (
    result.smoke?.sourceGameSpeedDefault !== EXPECTED_FIXED_DEMO_SOURCE_GAME_SPEED
    || Math.abs(Number(result.smoke?.gameSpeed ?? 0) - EXPECTED_FIXED_DEMO_GAME_SPEED) > 0.01
    || result.smoke?.fixedDemoMovementPaceMultiplier !== EXPECTED_FIXED_DEMO_MOVEMENT_PACE_MULTIPLIER
  ) {
    failures.push(`fixed-demo coherent pace: ${JSON.stringify({
      sourceGameSpeedDefault: result.smoke?.sourceGameSpeedDefault,
      gameSpeed: result.smoke?.gameSpeed,
      fixedDemoMovementPaceMultiplier: result.smoke?.fixedDemoMovementPaceMultiplier
    })}`);
  }
  const averageUpdateMs = Number(result.performance.averageUpdateMs);
  const averageRenderMs = Number(result.performance.averageRenderMs);
  if (!Number.isFinite(averageUpdateMs) || averageUpdateMs > 20) failures.push(`update budget: ${averageUpdateMs}`);
  if (!Number.isFinite(averageRenderMs) || averageRenderMs > 24) failures.push(`render budget: ${averageRenderMs}`);
  if (MODE === "plan014") assertPlan014(result.smoke, failures);
  else if (MODE === "m01") assertM01(result.m01, failures);
  else if (MODE === "m04") assertM04(result.m04, failures);
  else if (MODE === "m07") assertM07(result.m07, failures);
  else if (MODE === "basics") assertBrowserBasics(result.basics, failures);
  else failures.push(`unknown verifier mode: ${MODE}`);
  if (failures.length > 0) throw new Error(failures.join("\n"));
}

function modeSummary(result) {
  if (MODE === "plan014") {
    const ai = result.smoke?.aiStates?.find((state) => state.enabled && state.evidence);
    return `live AI player ${ai?.player ?? "missing"}, script ${ai?.evidence?.sourceScriptIndex ?? "missing"}, launches ${ai?.evidence?.launches?.length ?? "missing"}`;
  }
  if (MODE === "m01") return "M01 pending/paid/cancel lifecycle";
  if (MODE === "m04") return `M04 ${result.m04.m04.completionCount}/5 formation`;
  if (MODE === "basics") return `basics fog ${result.basics.fogTelemetry.exploredTiles}/${result.basics.mapTileCount}, audio ${result.basics.smoke.audioContextState}, order ${result.basics.smoke.firstSelectedOrderKind}`;
  return `M07 return ${result.m07.automatic.returnDistance.toFixed(1)}px`;
}

function runtimeEvidenceReport(result) {
  return {
    schemaVersion: 1,
    mode: MODE,
    serverMode: SERVER_MODE,
    port: PORT,
    url: URL,
    wallTimeMs,
    canvas: result.canvas,
    screenshot: result.screenshot,
    performance: result.performance,
    live: {
      tick: result.smoke?.tick ?? null,
      paused: result.smoke?.paused ?? null,
      gameSpeed: result.smoke?.gameSpeed ?? null,
      aiStates: result.smoke?.aiStates ?? []
    },
    fixtures: {
      m01: result.m01 ?? null,
      m04: result.m04 ?? null,
      m07: result.m07 ?? null
    }
  };
}

async function runBrowserBasics(page, pageErrors, canvas, screenshot) {
  await page.waitForFunction(() => window.__WARGUS_TS_SMOKE_STATE__?.titleScreenOpen === false, null, { timeout: 3_000 });
  if (await page.evaluate(() => window.__WARGUS_TS_SMOKE_STATE__?.briefingOpen === true)) {
    await page.keyboard.press("Enter");
  }
  await page.waitForFunction(() => window.__WARGUS_TS_SMOKE_STATE__?.titleScreenOpen === false && window.__WARGUS_TS_SMOKE_STATE__?.briefingOpen === false, null, { timeout: 3_000 });
  await page.waitForFunction(() => {
    const state = window.__WARGUS_TS_SMOKE_STATE__;
    return state?.sourceGameSpeedDefault === 45
      && Math.abs(Number(state?.gameSpeed ?? 0) - 1.5) <= 0.01
      && state?.fixedDemoMovementPaceMultiplier === 1;
  }, null, { timeout: 3_000 });
  await page.waitForFunction(() => {
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
  }, null, { timeout: 3_000 });
  await page.waitForFunction(() => {
    const log = window.__WARGUS_TS_PLAYTEST_LOG__?.() ?? [];
    const fog = [...log].reverse().find((entry) => entry.activeMapPath && entry.fog)?.fog;
    return fog && Number.isFinite(fog.visibleTiles) && Number.isFinite(fog.exploredTiles) && Number.isFinite(fog.unexploredTiles);
  }, null, { timeout: 3_000 });
  const fogTelemetry = await page.evaluate(() => {
    const log = window.__WARGUS_TS_PLAYTEST_LOG__?.() ?? [];
    return [...log].reverse().find((entry) => entry.activeMapPath && entry.fog)?.fog ?? null;
  });
  const mapTileCount = Number(fogTelemetry?.exploredTiles ?? 0) + Number(fogTelemetry?.unexploredTiles ?? 0);
  const centered = await page.evaluate(() => window.__WARGUS_TS_CENTER_FIRST_OWNED_MOVABLE__?.() === true);
  if (!centered) throw new Error("Browser basics could not center the first owned movable unit.");
  await page.waitForFunction(() => {
    const point = window.__WARGUS_TS_SMOKE_STATE__?.firstOwnedMovableScreenPoint;
    return point && Number.isFinite(point.x) && Number.isFinite(point.y);
  }, null, { timeout: 3_000 });
  const selectablePoint = await page.evaluate(() => window.__WARGUS_TS_SMOKE_STATE__.firstOwnedMovableScreenPoint);
  await clickSmokePoint(page, selectablePoint.x, selectablePoint.y);
  await page.waitForFunction(() => window.__WARGUS_TS_SMOKE_STATE__?.selectedUnitCount === 1 && Number(window.__WARGUS_TS_SMOKE_STATE__?.firstSelectedSpeed ?? 0) > 0, null, { timeout: 3_000 });
  await page.waitForFunction((expectedMusic) => {
    const state = window.__WARGUS_TS_SMOKE_STATE__;
    return state?.audioContextCreated === true
      && state?.audioContextState === "running"
      && state?.audioUnlocked === true
      && state?.audioStereoSound === true
      && state?.audioCurrentMusic === expectedMusic;
  }, EXPECTED_BACKGROUND_MUSIC, { timeout: 8_000 });
  await page.waitForFunction(() => {
    const state = window.__WARGUS_TS_SMOKE_STATE__;
    return Number(state?.audioPlayStarts ?? 0) > 0
      && (Number(state?.audioBufferedSounds ?? 0) > 0 || Number(state?.audioHtmlPlayStarts ?? 0) > 0)
      && Number(state?.audioHtmlPlayFailures ?? 0) === 0
      && !state?.audioLastError
      && typeof window.__WARGUS_TS_PLAY_AUDIO_FIXTURE__ === "function";
  }, null, { timeout: 5_000 });
  const audioFixture = await page.evaluate(() => window.__WARGUS_TS_PLAY_AUDIO_FIXTURE__());
  await delay(500);
  const inputStats = pngColorStats(await page.screenshot({ type: "png" }));
  await clickSmokePoint(page, Math.min(900, selectablePoint.x + 220), Math.min(620, selectablePoint.y + 120), "right");
  await page.waitForFunction(() => window.__WARGUS_TS_SMOKE_STATE__?.selectedUnitCount > 0 && window.__WARGUS_TS_SMOKE_STATE__?.firstSelectedOrderKind !== null, null, { timeout: 5_000 });
  await delay(500);
  const commandStats = pngColorStats(await page.screenshot({ type: "png" }));
  const smoke = await page.evaluate(() => window.__WARGUS_TS_SMOKE_STATE__);
  if (pageErrors.length > 0) throw new Error(`Browser page exceptions: ${pageErrors.join("; ")}`);
  return {
    basics: { fogTelemetry, mapTileCount, audioFixture, inputStats, commandStats, smoke },
    canvas,
    screenshot,
    smoke,
    performance: smoke?.performance ?? {}
  };
}

function assertBrowserBasics(result, failures) {
  const fog = result?.fogTelemetry;
  if (!(fog?.visibleTiles > 0 && fog?.exploredTiles > 0 && fog?.unexploredTiles > 0 && fog.exploredTiles < result.mapTileCount)) failures.push(`starting-area fog: ${JSON.stringify(fog)}`);
  const smoke = result?.smoke ?? {};
  if (!(smoke.audioContextCreated === true && smoke.audioContextState === "running" && smoke.audioUnlocked === true && smoke.audioStereoSound === true)) failures.push(`audio unlock/stereo: ${JSON.stringify(smoke)}`);
  if (smoke.audioCurrentMusic !== EXPECTED_BACKGROUND_MUSIC) failures.push(`background music: ${smoke.audioCurrentMusic}`);
  if (!(Number(smoke.audioPlayStarts ?? 0) > 0 && (Number(smoke.audioBufferedSounds ?? 0) > 0 || Number(smoke.audioHtmlPlayStarts ?? 0) > 0) && Number(smoke.audioHtmlPlayFailures ?? 0) === 0 && !smoke.audioLastError)) failures.push(`audio playback: ${JSON.stringify(smoke)}`);
  if (!result?.audioFixture?.ok) failures.push(`audio fixture: ${JSON.stringify(result?.audioFixture)}`);
  if (!(smoke.selectedUnitCount > 0 && smoke.firstSelectedOrderKind !== null)) failures.push(`selection/right-click order: ${JSON.stringify({ selectedUnitCount: smoke.selectedUnitCount, order: smoke.firstSelectedOrderKind })}`);
  if (sameScreenshotStats(result?.inputStats, result?.commandStats)) failures.push(`render transition after right-click: ${JSON.stringify({ input: result?.inputStats, command: result?.commandStats })}`);
}

async function clickSmokePoint(page, x, y, button = "left", clickCount = 1) {
  await page.mouse.click(x, y, { button, clickCount });
}

function sameScreenshotStats(left, right) {
  return left?.uniqueColors === right?.uniqueColors && left?.brightPixels === right?.brightPixels;
}

function assertPlan014(smoke, failures) {
  const ai = smoke?.aiStates?.find((state) => state.enabled && state.evidence);
  const evidence = ai?.evidence;
  if (!ai || !evidence || !Number.isInteger(evidence.sourceScriptIndex)) {
    failures.push(`live Plan014 AI state: ${JSON.stringify(smoke?.aiStates)}`);
    return;
  }
  if (!Array.isArray(evidence.forces) || evidence.forces.length > 16 || evidence.forces.some((force) => !Array.isArray(force.assignedUnitIds) || force.assignedUnitIds.length > 64 || !Array.isArray(force.assignedUnits))) failures.push(`bounded live force state: ${JSON.stringify(evidence.forces)}`);
  if (!Array.isArray(evidence.launches) || evidence.launches.length > 16 || evidence.launches.some((launch) => !(launch.launchedTick >= 0) || !Array.isArray(launch.unitIds) || launch.unitIds.length > 64 || !Array.isArray(launch.units))) failures.push(`bounded live launch state: ${JSON.stringify(evidence.launches)}`);
  if (!Array.isArray(evidence.buildRoles) || evidence.buildRoles.length === 0 || evidence.buildRoles.some((entry) => !Number.isInteger(entry.desired) || !Number.isInteger(entry.completed) || !Number.isInteger(entry.foundations) || !Number.isInteger(entry.inFlight))) failures.push(`live build-role counts: ${JSON.stringify(evidence.buildRoles)}`);
  if (!Array.isArray(evidence.pendingBuildOrders) || evidence.pendingBuildOrders.length > 64 || Object.values(evidence.reservedResources ?? {}).some((amount) => !Number.isFinite(amount) || amount < 0)) failures.push(`live pending/reserved builds: ${JSON.stringify({ pending: evidence.pendingBuildOrders, reserved: evidence.reservedResources })}`);
  const factor = Number(evidence.speedFactors?.build);
  if (!Number.isFinite(factor) || factor < 0.75 || factor > 1.5) failures.push(`live speed factors: ${JSON.stringify(evidence.speedFactors)}`);
  if (!(evidence.exploration?.totalTiles > 0 && evidence.exploration.exploredTiles >= 0 && evidence.exploration.exploredTiles <= evidence.exploration.totalTiles && Array.isArray(evidence.exploration.scoutDestinations))) failures.push(`live exploration/scout state: ${JSON.stringify(evidence.exploration)}`);
  if (!Array.isArray(evidence.productionQueues) || evidence.productionQueues.length > 64 || evidence.productionQueues.some((queue) => queue.headTotalSeconds !== null && (!(queue.headTotalSeconds > 0) || !(queue.headRemainingSeconds >= 0)))) failures.push(`live train queue durations: ${JSON.stringify(evidence.productionQueues)}`);
  if (!Array.isArray(evidence.constructions) || evidence.constructions.length > 64 || evidence.constructions.some((construction) => !(construction.totalSeconds > 0) || !(construction.remainingSeconds >= 0))) failures.push(`live construction durations: ${JSON.stringify(evidence.constructions)}`);
}

function assertM01(result, failures) {
  const expectedArrivalGold = result?.before?.resources?.gold - (result?.costs?.gold ?? 0);
  const expectedArrivalWood = result?.before?.resources?.wood - (result?.costs?.wood ?? 0);
  const expectedCancelGold = expectedArrivalGold + Math.floor((result?.costs?.gold ?? 0) * 0.75);
  const expectedCancelWood = expectedArrivalWood + Math.floor((result?.costs?.wood ?? 0) * 0.75);
  if (!result?.ok || result.pending?.orderPhase !== "to-site" || result.pending?.paidFoundationCount !== 0 || result.pending?.resources?.gold !== result.before?.resources?.gold || result.arrival?.resources?.gold !== expectedArrivalGold || result.arrival?.resources?.wood !== expectedArrivalWood || result.arrival?.paidFoundationCount !== 1 || result.arrival?.builderHidden !== true || result.cancel?.resources?.gold !== expectedCancelGold || result.cancel?.resources?.wood !== expectedCancelWood || result.cancel?.paidFoundationCount !== 0 || result.cancel?.builderHidden !== false || result.cancel?.orderKind !== null) failures.push(`M01 lifecycle replay: ${JSON.stringify(result)}`);
}

function assertM04(result, failures) {
  const expected = [{ id: "__smoke-fixture-m04-west", x: 9, y: 7 }, { id: "__smoke-fixture-m04-center", x: 10, y: 7 }, { id: "__smoke-fixture-m04-east", x: 11, y: 7 }, { id: "__smoke-fixture-m04-north", x: 10, y: 6 }, { id: "__smoke-fixture-m04-south", x: 10, y: 8 }];
  const m04 = result?.m04;
  if (!result?.ok || !m04?.issued || JSON.stringify(m04.finalTiles) !== JSON.stringify(expected) || m04.completionCount !== 5 || m04.prematureOrderDrops !== 0 || m04.liveEmptyPathTicks !== 0 || m04.overlapTicks !== 0 || !m04.completed || m04.maximumUpdateMs > 20 || m04.averageUpdateMs > 20 || result.m04SemanticRepeat !== true) failures.push(`M04 formation replay: ${JSON.stringify(m04)}`);
}

function assertM07(result, failures) {
  if (!result?.ok || !result.automatic?.targetId || !result.automatic?.autoReturn || result.automatic?.returnDistance > 32 || result.hold?.movedDistance !== 0 || result.explicit?.autoReturn !== null) failures.push(`M07 combat replay: ${JSON.stringify(result)}`);
}

async function loadPlaywright() {
  return await import("playwright");
}

async function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try { if ((await fetch(url)).ok) return; } catch { /* Retry. */ }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

async function withTimeout(promise, timeoutMs, message) {
  let timeout;
  try { return await Promise.race([promise, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(message)), timeoutMs); })]); }
  finally { clearTimeout(timeout); }
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function pngColorStats(buffer) {
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Screenshot was not a PNG.");
  let offset = 8; let width = 0; let height = 0; let bitDepth = 0; let colorType = 0; const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset); const type = buffer.subarray(offset + 4, offset + 8).toString("ascii"); const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === "IDAT") idat.push(data); else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
  const channels = colorType === 6 ? 4 : 3; const stride = width * channels; const inflated = inflateSync(Buffer.concat(idat)); const rows = []; let readOffset = 0;
  for (let y = 0; y < height; y += 1) { const filter = inflated[readOffset]; const row = Buffer.from(inflated.subarray(readOffset + 1, readOffset + 1 + stride)); unfilter(row, rows[y - 1] ?? Buffer.alloc(stride), channels, filter); rows.push(row); readOffset += 1 + stride; }
  const colors = new Set(); let sampled = 0; let brightPixels = 0; const stepX = Math.max(1, Math.floor(width / 80)); const stepY = Math.max(1, Math.floor(height / 45));
  for (let y = 0; y < height; y += stepY) for (let x = 0; x < width; x += stepX) { const row = rows[y]; const index = x * channels; const r = row[index]; const g = row[index + 1]; const b = row[index + 2]; sampled += 1; colors.add(`${r},${g},${b}`); if (r + g + b > 90) brightPixels += 1; }
  return { width, height, sampled, uniqueColors: colors.size, brightPixels };
}

function unfilter(row, previous, channels, filter) {
  for (let index = 0; index < row.length; index += 1) {
    const left = index >= channels ? row[index - channels] : 0; const up = previous[index] ?? 0; const upLeft = index >= channels ? previous[index - channels] ?? 0 : 0;
    if (filter === 1) row[index] = (row[index] + left) & 0xff;
    else if (filter === 2) row[index] = (row[index] + up) & 0xff;
    else if (filter === 3) row[index] = (row[index] + Math.floor((left + up) / 2)) & 0xff;
    else if (filter === 4) row[index] = (row[index] + paeth(left, up, upLeft)) & 0xff;
    else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}`);
  }
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft; const leftDistance = Math.abs(estimate - left); const upDistance = Math.abs(estimate - up); const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  return upDistance <= upLeftDistance ? up : upLeft;
}
