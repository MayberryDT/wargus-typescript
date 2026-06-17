import { readFileSync } from "node:fs";
import path from "node:path";
import {
  connectDevTools,
  removeProfile,
  startChrome,
  startViteServer,
  stopProcess,
  waitForExpression,
  waitForHttp,
  waitForPageTarget
} from "./browser-smoke-harness.mjs";

const PORT = 5198;
const DEBUG_PORT = 9225;
const URL = `http://127.0.0.1:${PORT}/?smoke=1`;
const CHROME = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";
const serverMode = process.env.WARGUS_BROWSER_MAP_SERVER === "preview" ? "preview" : "dev";
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
const server = startViteServer({ port: PORT, mode: serverMode });
let chrome = null;
let chromeProfile = null;

try {
  await waitForHttp(URL, 20_000);
  const chromeStart = startChrome({ chromeBin: CHROME, debugPort: DEBUG_PORT, profilePrefix: "wargus-map-smoke-chrome-" });
  chrome = chromeStart.child;
  chromeProfile = chromeStart.profilePath;
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
  removeProfile(chromeProfile);
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
