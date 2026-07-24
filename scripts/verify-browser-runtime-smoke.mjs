import { execFileSync, spawn } from "node:child_process";
import { inflateSync } from "node:zlib";
import { connect } from "node:net";
import { pathToFileURL } from "node:url";

const PORT = Number(process.env.WARGUS_BROWSER_RUNTIME_PORT ?? 54314);
const URL = `http://127.0.0.1:${PORT}/?smoke=1&demoSeed=ai-staged-pressure`;
const SESSION_LIMIT_MS = 25_000;
const MODE = process.env.WARGUS_BROWSER_RUNTIME_MODE ?? "plan014";
const CHROME = process.env.CHROME_BIN ?? "/home/halla/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell";
let server = null;
let browserServer = null;
let browser = null;
let browserPids = [];
let wallTimeMs = 0;

try {
  const { chromium } = await loadPlaywright();
  server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    cwd: process.cwd(),
    stdio: "ignore"
  });
  await waitForHttp(URL, 5_000);
  const manifestResponse = await fetch(`http://127.0.0.1:${PORT}/wargus/manifest.json`);
  if (!manifestResponse.ok) throw new Error(`Critical asset /wargus/manifest.json returned HTTP ${manifestResponse.status}.`);
  browserServer = await chromium.launchServer({
    executablePath: CHROME,
    headless: true,
    args: ["--disable-background-networking", "--disable-extensions", "--disable-dev-shm-usage", "--no-proxy-server"]
  });
  browserPids = processTreePids(browserServer.process().pid);
  browser = await chromium.connect(browserServer.wsEndpoint());
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  if (context.pages().length !== 1) throw new Error(`Expected one browser tab, found ${context.pages().length}.`);
  const startedAt = Date.now();
  const result = await withTimeout(runRuntimeSmoke(page), SESSION_LIMIT_MS, "Plan 014 browser runtime smoke exceeded 25 seconds from page load");
  wallTimeMs = Date.now() - startedAt;
  if (context.pages().length !== 1) throw new Error(`Verifier opened extra tabs; found ${context.pages().length}.`);
  assertRuntimeSmoke(result);
  console.log(`Browser runtime smoke verified (${MODE}, one tab, port ${PORT}, wall ${(wallTimeMs / 1000).toFixed(1)}s; canvas ${result.canvas.width}x${result.canvas.height}/${result.screenshot.uniqueColors} colors; ${modeSummary(result)}, update ${Number(result.performance.averageUpdateMs).toFixed(2)}ms).`);
} finally {
  if (browserServer?.process()?.pid) browserPids = [...new Set([...browserPids, ...processTreePids(browserServer.process().pid)])];
  try { await Promise.race([browser?.close(), delay(1_500)]); } catch { /* Exact PID cleanup follows. */ }
  try { await Promise.race([browserServer?.close(), delay(1_500)]); } catch { /* Exact PID cleanup follows. */ }
  stopExactPids(browserPids);
  if (server?.pid) stopExactPids(processTreePids(server.pid));
  await delay(300);
  if (await isPortOpen(PORT)) throw new Error(`Verifier cleanup left port ${PORT} open.`);
  console.log(`Browser runtime smoke cleanup verified (exact PID trees stopped; port ${PORT} clear).`);
}

async function runRuntimeSmoke(page) {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 10_000 });
  await page.waitForFunction(() => Boolean(window.__WARGUS_TS_SMOKE_STATE__?.worldLoaded), null, { timeout: 8_000 });
  await page.waitForFunction((mode) => {
    if (mode === "plan014") return typeof window.__WARGUS_TS_RUN_AI_SCRIPT_FIXTURE__ === "function" && typeof window.__WARGUS_TS_RUN_AI_KNOWLEDGE_FIXTURE__ === "function";
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
  const fixtures = await page.evaluate((mode) => {
    const startedAt = performance.now();
    const result = mode === "plan014"
      ? { aiScript: window.__WARGUS_TS_RUN_AI_SCRIPT_FIXTURE__(), aiKnowledge: window.__WARGUS_TS_RUN_AI_KNOWLEDGE_FIXTURE__() }
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
  const minimap = result.smoke?.minimapRenderCache;
  if (!minimap) {
    failures.push("minimap render cache debug state: missing");
  } else {
    if (!(minimap.drawCount > 1 && minimap.terrainRebuildCount === 1 && minimap.terrainKeyChangeCount === 1 && minimap.terrainKey)) failures.push(`minimap terrain cache reuse: ${JSON.stringify(minimap)}`);
    if (!(minimap.visualRootAttached && minimap.hitTargetAttached && minimap.visualRootIndex === 1 && minimap.hitTargetIndex > minimap.visualRootIndex)) failures.push(`minimap cache attachment/order: ${JSON.stringify(minimap)}`);
    if (!(minimap.visualRootChildCount === 2 && minimap.visualRootMinChildCount === 2 && minimap.visualRootMaxChildCount === 2 && minimap.hitTargetChildCount === 0)) failures.push(`minimap stable child counts: ${JSON.stringify(minimap)}`);
    if (!(minimap.pointerDownListenerCount === 1 && minimap.pointerMoveListenerCount === 1)) failures.push(`minimap stable pointer listeners: ${JSON.stringify(minimap)}`);
    if (!(minimap.rasterCanvasCreateCount === 1 && minimap.rasterTextureCreateCount === 1 && minimap.rasterSpriteCreateCount === 1 && minimap.rasterResizeCount === 0 && minimap.rasterUpdateCount === minimap.drawCount)) failures.push(`minimap stable raster objects/updates: ${JSON.stringify(minimap)}`);
    if (!(minimap.rasterWidth > 0 && minimap.rasterHeight > 0 && minimap.rasterWidth <= 256 && minimap.rasterHeight <= 256)) failures.push(`minimap bounded raster dimensions: ${JSON.stringify(minimap)}`);
    if (!(mapTileCount > 0 && minimap.terrainTileCount === mapTileCount && minimap.fogTileCount > 0 && minimap.fogTileCount <= mapTileCount)) failures.push(`minimap terrain/fog composite counts: tiles=${mapTileCount} cache=${JSON.stringify(minimap)}`);
  }
  const selectedUnitTypes = result.smoke?.selectedUnitTypes ?? [];
  const counts = result.smoke?.ownedUnitCounts ?? {};
  const resources = result.smoke?.visibilityPlayerResources ?? {};
  if (!(selectedUnitTypes?.[0] === "unit-peasant" && selectedUnitTypes.length === 1)) failures.push(`fixed-demo selected peasant: ${JSON.stringify(selectedUnitTypes)}`);
  if (!(counts["unit-peasant"] === 1)) failures.push(`fixed-demo owned peasant: ${JSON.stringify(counts)}`);
  if (!(!counts["unit-town-hall"] && !counts["unit-farm"] && !counts["unit-keep"] && !counts["unit-castle"])) failures.push(`fixed-demo starts without buildings: ${JSON.stringify(counts)}`);
  if (!(Number(resources.gold ?? 0) >= 10000 && Number(resources.wood ?? 0) >= 5000 && Number(resources.oil ?? 0) >= 5000)) failures.push(`fixed-demo high resources: ${JSON.stringify(resources)}`);
  const averageUpdateMs = Number(result.performance.averageUpdateMs);
  const averageRenderMs = Number(result.performance.averageRenderMs);
  if (!Number.isFinite(averageUpdateMs) || averageUpdateMs > 20) failures.push(`update budget: ${averageUpdateMs}`);
  if (!Number.isFinite(averageRenderMs) || averageRenderMs > 24) failures.push(`render budget: ${averageRenderMs}`);
  if (MODE === "plan014") assertPlan014(result.aiScript, result.aiKnowledge, failures);
  else if (MODE === "m01") assertM01(result.m01, failures);
  else if (MODE === "m04") assertM04(result.m04, failures);
  else if (MODE === "m07") assertM07(result.m07, failures);
  else failures.push(`unknown verifier mode: ${MODE}`);
  if (failures.length > 0) throw new Error(failures.join("\n"));
}

function modeSummary(result) {
  if (MODE === "plan014") return `AI launches ${result.aiScript.launchSizes.slice(0, 3).join("->")}, factors ${Object.values(result.aiKnowledge.difficulty.factors).join("/")}, explored ${result.aiKnowledge.exploration.aiExploredAfterUpdate}`;
  if (MODE === "m01") return "M01 pending/paid/cancel lifecycle";
  if (MODE === "m04") return `M04 ${result.m04.m04.completionCount}/5 formation`;
  return `M07 return ${result.m07.automatic.returnDistance.toFixed(1)}px`;
}

function assertPlan014(script, knowledge, failures) {
  if (!script?.ok || JSON.stringify(script.launchSizes?.slice(0, 3)) !== JSON.stringify([1, 4, 16]) || script.uniqueLaunchedIds !== 21 || script.barracksDesired !== 2) failures.push(`M08 script fixture: ${JSON.stringify(script)}`);
  const launches = script?.launches ?? [];
  const launchedIds = launches.flatMap((launch) => launch.unitIds ?? []);
  if (launches.length < 3 || new Set(launchedIds).size !== launchedIds.length || launches.some((launch) => !(launch.launchedTick >= 0))) failures.push(`M08 detached launches: ${JSON.stringify(launches)}`);
  const expectedFactors = { 1: 0.75, 2: 1, 3: 1, 4: 1.2, 5: 1.5 };
  if (!knowledge?.ok || JSON.stringify(knowledge.difficulty?.factors) !== JSON.stringify(expectedFactors) || knowledge.difficulty?.resetFactor !== 1) failures.push(`M09 factors/reset: ${JSON.stringify(knowledge?.difficulty)}`);
  if (knowledge.sleep?.sleepStart !== "block" || knowledge.sleep?.sleepFinish !== "advance" || !(knowledge.sleep?.sleepDeadline > 0) || knowledge.sleep?.finalDeadline !== 0) failures.push(`positive sleep barrier: ${JSON.stringify(knowledge?.sleep)}`);
  if (!knowledge.exploration?.aliasBound || !knowledge.exploration?.ownerCandidateWasUnexplored || !knowledge.exploration?.humanCandidateWasExplored || !(knowledge.exploration?.aiExploredAfterUpdate > 0)) failures.push(`AI-owned exploration: ${JSON.stringify(knowledge?.exploration)}`);
  if (!knowledge.saveRoundtrip?.ok || !knowledge.legacyRoundtrip?.ok || knowledge.legacyRoundtrip?.aiExploredTiles !== 0) failures.push(`exploration save compatibility: ${JSON.stringify({ save: knowledge?.saveRoundtrip, legacy: knowledge?.legacyRoundtrip })}`);
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
  try { return await import("playwright"); } catch (error) {
    const modulePath = process.env.PLAYWRIGHT_MODULE;
    if (!modulePath) throw new Error(`Playwright is unavailable; set PLAYWRIGHT_MODULE (${error instanceof Error ? error.message : String(error)}).`);
    return import(pathToFileURL(modulePath).href);
  }
}

function processTreePids(rootPid) {
  const rows = execFileSync("ps", ["-eo", "pid=,ppid="], { encoding: "utf8" }).trim().split("\n").map((line) => line.trim().split(/\s+/).map(Number)).filter(([pid, parentPid]) => Number.isInteger(pid) && Number.isInteger(parentPid));
  const result = [rootPid];
  for (let index = 0; index < result.length; index += 1) for (const [pid, parentPid] of rows) if (parentPid === result[index] && !result.includes(pid)) result.push(pid);
  return result;
}

function stopExactPids(pids) {
  for (const pid of [...pids].reverse()) try { process.kill(pid, "SIGTERM"); } catch { /* Already exited. */ }
}

async function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try { if ((await fetch(url)).ok) return; } catch { /* Retry. */ }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

async function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
    socket.setTimeout(500, () => { socket.destroy(); resolve(false); });
  });
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
