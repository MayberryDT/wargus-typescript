import { execFileSync, spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const PORT = Number(process.env.WARGUS_BROWSER_COMBAT_PORT ?? 54252);
const URL = `http://127.0.0.1:${PORT}/?smoke=1`;
const SESSION_LIMIT_MS = 25_000;
let server = null;
let browserServer = null;
let browser = null;
let browserPids = [];

try {
  const { chromium } = await loadPlaywright();
  server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    cwd: process.cwd(),
    stdio: "ignore"
  });
  await waitForHttp(URL, 5_000);
  browserServer = await chromium.launchServer({
    executablePath: process.env.CHROME_BIN || undefined,
    headless: true,
    args: ["--disable-background-networking", "--disable-extensions", "--disable-dev-shm-usage", "--no-proxy-server"]
  });
  browserPids = processTreePids(browserServer.process().pid);
  browser = await chromium.connect(browserServer.wsEndpoint());
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  if (context.pages().length !== 1) {
    throw new Error(`Expected one browser tab, found ${context.pages().length}.`);
  }
  const result = await withTimeout(runCombatScenarios(page), SESSION_LIMIT_MS, "Plan 013 browser session exceeded 25 seconds");
  assertCombatScenarios(result);
  console.log(`Browser combat session verified (one tab; M05 unreachable=${result.m05.unreachable.rejectedUnreachable}, auto-return=${result.m05.automatic.finalReturnDistance.toFixed(1)}, hold=${result.m05.hold.movedDistance.toFixed(1)}; M06 projectile=${result.m06.committedProjectile.directDamage}, ground=${result.m06.fixedGroundControl.impactOccupantDamage}, area=${JSON.stringify(result.m06.areaThroughFog.deltas)}, demolish=${JSON.stringify(result.m06.demolishOwnership)}, audio=${result.m06.audio.visibleEnemyPlaybackStarts}/${result.m06.audio.hiddenEnemyPlaybackStarts}; M07 target=${result.m07.automatic.targetId}, return=${result.m07.automatic.returnDistance.toFixed(1)}, explicit=${String(result.m07.explicit.autoReturn)}).`);
} finally {
  if (browserServer?.process()?.pid) {
    browserPids = [...new Set([...browserPids, ...processTreePids(browserServer.process().pid)])];
  }
  try { await Promise.race([browser?.close(), delay(1_500)]); } catch { /* Exact PID cleanup follows. */ }
  try { await Promise.race([browserServer?.close(), delay(1_500)]); } catch { /* Exact PID cleanup follows. */ }
  stopExactPids(browserPids);
  if (server?.pid) {
    stopExactPids(processTreePids(server.pid));
  }
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    if (!process.env.PLAYWRIGHT_MODULE) {
      throw new Error(`Playwright is unavailable; set PLAYWRIGHT_MODULE to its index.mjs path (${error instanceof Error ? error.message : String(error)}).`);
    }
    return import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
  }
}

async function runCombatScenarios(page) {
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 10_000 });
  await page.waitForFunction(() => Boolean(window.__WARGUS_TS_SMOKE_STATE__?.worldLoaded), null, { timeout: 8_000 });
  await page.waitForFunction(() => typeof window.__WARGUS_TS_RUN_MECHANICS_SCENARIO__ === "function", null, { timeout: 3_000 });
  return page.evaluate(() => ({
    m05: window.__WARGUS_TS_RUN_MECHANICS_SCENARIO__("M05"),
    m06: window.__WARGUS_TS_RUN_MECHANICS_SCENARIO__("M06"),
    m07: window.__WARGUS_TS_RUN_MECHANICS_SCENARIO__("M07")
  }));
}

function assertCombatScenarios({ m05, m06, m07 }) {
  const failures = [];
  if (!m05?.ok || !m05.unreachable?.rejectedUnreachable || !(m05.unreachable?.destinationProgress > 0)) failures.push(`M05 unreachable attack-move: ${JSON.stringify(m05?.unreachable)}`);
  if (!m05?.automatic?.automaticOrderSeen || !m05.automatic?.targetDamaged || !(m05.automatic?.finalReturnDistance <= 32)) failures.push(`M05 auto chase/return: ${JSON.stringify(m05?.automatic)}`);
  if (m05?.hold?.movedDistance !== 0) failures.push(`M05 Hold Position: ${JSON.stringify(m05?.hold)}`);
  if (!m06?.ok || !(m06.committedProjectile?.directDamage > 0) || m06.committedProjectile?.tracerMotion !== false) failures.push(`M06 committed projectile: ${JSON.stringify(m06?.committedProjectile)}`);
  if (m06?.fixedGroundControl?.movedTargetDamage !== 0 || !(m06.fixedGroundControl?.impactOccupantDamage > 0)) failures.push(`M06 fixed ground control: ${JSON.stringify(m06?.fixedGroundControl)}`);
  const area = m06?.areaThroughFog?.deltas;
  if (m06?.areaThroughFog?.visibleTileCount !== 0 || area?.caster !== 0 || ![area?.own, area?.allied, area?.enemy, area?.neutral].every((damage) => damage > 0)) failures.push(`M06 area ownership/fog: ${JSON.stringify(m06?.areaThroughFog)}`);
  const demolish = m06?.demolishOwnership;
  if (![demolish?.caster, demolish?.own, demolish?.allied, demolish?.enemy, demolish?.neutral].every((damage) => damage > 0)) failures.push(`M06 demolish ownership: ${JSON.stringify(demolish)}`);
  if (m06?.audio?.visibleEnemyPlaybackStarts !== 1 || m06.audio?.hiddenEnemyPlaybackStarts !== 0 || m06.audio?.coordinateLessEnemyPlaybackStarts !== 0) failures.push(`M06 visible/hidden audio: ${JSON.stringify(m06?.audio)}`);
  if (!m07?.ok || !m07.automatic?.targetId || !m07.automatic?.autoReturn || !(m07.automatic?.returnDistance <= 32) || m07.explicit?.autoReturn !== null) failures.push(`M07 saved return/explicit attack: ${JSON.stringify(m07)}`);
  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }
}

function processTreePids(rootPid) {
  const rows = execFileSync("ps", ["-eo", "pid=,ppid="], { encoding: "utf8" }).trim().split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number))
    .filter(([pid, parentPid]) => Number.isInteger(pid) && Number.isInteger(parentPid));
  const result = [rootPid];
  for (let index = 0; index < result.length; index += 1) {
    for (const [pid, parentPid] of rows) {
      if (parentPid === result[index] && !result.includes(pid)) result.push(pid);
    }
  }
  return result;
}

function stopExactPids(pids) {
  for (const pid of [...pids].reverse()) {
    try { process.kill(pid, "SIGTERM"); } catch { /* Already exited. */ }
  }
}

async function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* Retry until the dedicated server is ready. */ }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

async function withTimeout(promise, timeoutMs, message) {
  let timeout;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(message)), timeoutMs); })]);
  } finally {
    clearTimeout(timeout);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
