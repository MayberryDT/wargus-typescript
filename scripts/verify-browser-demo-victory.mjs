import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const PORT = 5205;
const DEBUG_PORT = 9232;
const URL = `http://127.0.0.1:${PORT}/?smoke=1`;
const MAP_PATH = "maps/ladder/Garden of war BNE.pud.smp.gz";
const CHROME = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";
const chromeProfile = mkdtempSync(path.join(tmpdir(), "wargus-demo-victory-chrome-"));
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
  await waitForExpression(client, "typeof window.__WARGUS_TS_LOAD_MAP__ === \"function\" && typeof window.__WARGUS_TS_ISSUE_FIRST_HARVEST__ === \"function\" && typeof window.__WARGUS_TS_ISSUE_FIRST_TRAIN__ === \"function\" && typeof window.__WARGUS_TS_ISSUE_FIXED_DEMO_DEFENSE__ === \"function\" && typeof window.__WARGUS_TS_ISSUE_FIXED_DEMO_FINAL_ATTACK__ === \"function\" && typeof window.__WARGUS_TS_FIXED_DEMO_OBJECTIVE_TARGET__ === \"function\" && typeof window.__WARGUS_TS_SAVE_ACTIVE_WORLD_ROUNDTRIP__ === \"function\"", 20_000);

  const loaded = await evalValue(client, `window.__WARGUS_TS_LOAD_MAP__(${JSON.stringify(MAP_PATH)})`);
  if (loaded !== true) {
    throw new Error(`Unable to load fixed demo map ${MAP_PATH}: ${JSON.stringify(loaded)}`);
  }
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.titleScreenOpen === false && window.__WARGUS_TS_SMOKE_STATE__?.briefingOpen === true && window.__WARGUS_TS_SMOKE_STATE__?.fixedDemoMission?.stage === \"briefing\"", 10_000);
  await dispatchKey(client, "Enter", "Enter", 13);
  await delay(500);
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.titleScreenOpen === false && window.__WARGUS_TS_SMOKE_STATE__?.briefingOpen === false", 10_000);
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.fixedDemoMission?.stage === \"economy\"", 10_000);
  const beforeTarget = await evalValue(client, "window.__WARGUS_TS_FIXED_DEMO_OBJECTIVE_TARGET__()");
  if (!beforeTarget?.id || beforeTarget.typeId !== "unit-great-hall" || beforeTarget.hitPoints <= 0) {
    throw new Error(`Fixed demo is missing a live enemy Great Hall objective target: ${JSON.stringify(beforeTarget)}`);
  }
  const normalSpeedState = await readSmokeState(client);
  if (normalSpeedState.gameSpeed !== 1 || normalSpeedState.sourceGameSpeedDefault !== 30) {
    throw new Error(`Fixed demo should present at normal speed before verifier fast-forward, got ${JSON.stringify({ gameSpeed: normalSpeedState.gameSpeed, sourceGameSpeedDefault: normalSpeedState.sourceGameSpeedDefault })}`);
  }
  const harvestIssued = await evalValue(client, "window.__WARGUS_TS_ISSUE_FIRST_HARVEST__()");
  if (harvestIssued !== true) {
    throw new Error(`Unable to issue fixed demo harvest step: ${JSON.stringify(await readSmokeState(client))}`);
  }
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.fixedDemoMission?.harvestStarted === true", 12_000);
  const trainIssued = await evalValue(client, "window.__WARGUS_TS_ISSUE_FIRST_TRAIN__()");
  if (trainIssued !== true) {
    throw new Error(`Unable to issue fixed demo training step: ${JSON.stringify(await readSmokeState(client))}`);
  }
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.fixedDemoMission?.trainingStarted === true", 12_000);
  await fastForwardPrivateVictoryVerifier(client);
  const verifierSpeedState = await readSmokeState(client);
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.fixedDemoMission?.raidLaunched === true", 45_000);
  const raidState = await clearFixedDemoRaid(client, 60_000);
  const issued = await evalValue(client, "window.__WARGUS_TS_ISSUE_FIXED_DEMO_FINAL_ATTACK__()");
  if (!issued?.issued || issued.attackerIds.length === 0) {
    throw new Error(`Unable to issue fixed demo final attack: ${JSON.stringify(issued)}`);
  }
  const victory = await waitForVictory(client, beforeTarget.id, beforeTarget.hitPoints, 150_000);
  const save = await evalValue(client, "window.__WARGUS_TS_SAVE_ACTIVE_WORLD_ROUNDTRIP__()");
  if (!save?.ok || save.saveRoundtripOk !== true || !Number.isFinite(save.tick) || save.tick < victory.tick) {
    throw new Error(`Fixed demo victory save/load roundtrip failed: ${JSON.stringify(save)}`);
  }
  if (pageErrors.length > 0) {
    throw new Error(`Browser page exceptions: ${pageErrors.join("; ")}`);
  }
  console.log(`Browser fixed demo victory verified (${MAP_PATH}, briefing/economy/training/raid flow, presentedSpeed=${normalSpeedState.gameSpeed.toFixed(1)}x/source ${normalSpeedState.sourceGameSpeedDefault}, verifierSpeed=${verifierSpeedState.gameSpeed.toFixed(1)}x/source ${verifierSpeedState.sourceGameSpeedDefault}, raidStage=${raidState.fixedDemoMission?.stage ?? "unknown"}, attackers=${issued.attackerIds.length}, target=${beforeTarget.id}, hp=${beforeTarget.hitPoints}->${victory.targetHitPoints ?? 0}, status=${victory.matchStatus}, tick=${victory.tick}).`);
} finally {
  client?.close();
  await stopProcess(chrome);
  await stopProcess(server);
  rmSync(chromeProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}

async function fastForwardPrivateVictoryVerifier(client) {
  for (let index = 0; index < 9; index += 1) {
    await dispatchKey(client, "Equal", "=", 187);
    await delay(50);
  }
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.gameSpeed >= 2.49 && window.__WARGUS_TS_SMOKE_STATE__?.sourceGameSpeedDefault === 75", 4_000);
}

async function dispatchKey(client, code, key, windowsVirtualKeyCode) {
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
}

async function waitForVictory(client, targetId, beforeHitPoints, timeoutMs) {
  const start = Date.now();
  let lastReissueAt = start;
  let bestHitPoints = beforeHitPoints;
  while (Date.now() - start < timeoutMs) {
    const [state, target] = await Promise.all([
      readSmokeState(client),
      evalValue(client, "window.__WARGUS_TS_FIXED_DEMO_OBJECTIVE_TARGET__()")
    ]);
    if (state.matchStatus === "victory") {
      return { matchStatus: state.matchStatus, tick: state.tick, targetHitPoints: target?.hitPoints ?? 0 };
    }
    if (target && target.id === targetId && target.hitPoints < bestHitPoints) {
      bestHitPoints = target.hitPoints;
    }
    if (Date.now() - lastReissueAt > 12_000) {
      lastReissueAt = Date.now();
      await evalValue(client, "window.__WARGUS_TS_ISSUE_FIXED_DEMO_FINAL_ATTACK__()");
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for fixed demo victory; target=${targetId}, hp=${bestHitPoints}/${beforeHitPoints}, smoke=${JSON.stringify(await readSmokeState(client))}`);
}

async function clearFixedDemoRaid(client, timeoutMs) {
  const start = Date.now();
  let lastIssueAt = 0;
  while (Date.now() - start < timeoutMs) {
    const state = await readSmokeState(client);
    if (state.fixedDemoMission?.raidActive === false) {
      return state;
    }
    if (Date.now() - lastIssueAt > 3_000) {
      lastIssueAt = Date.now();
      await evalValue(client, "window.__WARGUS_TS_ISSUE_FIXED_DEMO_DEFENSE__()");
    }
    await delay(500);
  }
  throw new Error(`Timed out clearing fixed demo raid before final assault; smoke=${JSON.stringify(await readSmokeState(client))}`);
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
    const page = targets.find((candidate) => candidate.type === "page" && candidate.webSocketDebuggerUrl);
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
      // Already stopped.
    }
  }
  await delay(600);
  if (process.exitCode === null && process.signalCode === null) {
    try {
      globalThis.process.kill(-process.pid, "SIGKILL");
    } catch {
      try {
        process.kill("SIGKILL");
      } catch {
        // Already stopped.
      }
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
