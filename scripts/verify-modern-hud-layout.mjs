import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const PORT = 5227;
const DEBUG_PORT = 9241;
const URL = `http://127.0.0.1:${PORT}/?smoke=1`;
const MAP_PATH = "maps/ladder/Garden of war BNE.pud.smp.gz";
const CHROME = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";
const VIEWPORTS = [
  { width: 1000, height: 720 },
  { width: 1280, height: 720 },
  { width: 900, height: 640 }
];
const chromeProfile = mkdtempSync(path.join(tmpdir(), "wargus-modern-hud-chrome-"));
const server = spawn("npm", ["run", "dev", "--", "--port", String(PORT), "--strictPort"], {
  detached: true,
  stdio: ["ignore", "pipe", "pipe"]
});
let serverOutput = "";
server.stdout?.on("data", (chunk) => {
  serverOutput = `${serverOutput}${String(chunk)}`.slice(-4000);
});
server.stderr?.on("data", (chunk) => {
  serverOutput = `${serverOutput}${String(chunk)}`.slice(-4000);
});
let chrome = null;
let client = null;

try {
  await waitForHttp(URL, 20_000, () => serverOutput);
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
  await client.send("Page.navigate", { url: URL });
  await client.waitFor("Page.loadEventFired", 20_000);
  await waitForExpression(client, "Boolean(window.__WARGUS_TS_SMOKE_STATE__?.worldLoaded)", 20_000);
  await waitForExpression(client, [
    "typeof window.__WARGUS_TS_LOAD_MAP__ === \"function\"",
    "typeof window.__WARGUS_TS_CLEAR_SELECTION__ === \"function\"",
    "typeof window.__WARGUS_TS_ADD_HUD_MESSAGE__ === \"function\"",
    "typeof window.__WARGUS_TS_SELECT_FIRST_UNIT_TYPE__ === \"function\"",
    "typeof window.__WARGUS_TS_SELECT_FIXTURE_UNIT_TYPE__ === \"function\"",
    "typeof window.__WARGUS_TS_SELECT_MIXED_FIXTURE_UNIT_TYPES__ === \"function\"",
    "typeof window.__WARGUS_TS_SELECT_SOURCE_TRAIN_FIXTURE__ === \"function\"",
    "typeof window.__WARGUS_TS_SELECT_SOURCE_RESEARCH_FIXTURE__ === \"function\"",
    "typeof window.__WARGUS_TS_EXECUTE_HUD_COMMAND__ === \"function\""
  ].join(" && "), 20_000);

  const summaries = [];
  for (const viewport of VIEWPORTS) {
    await client.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
    await loadFixedDemoMap(client);
    summaries.push(await verifyViewport(client, viewport));
  }
  if (pageErrors.length > 0) {
    throw new Error(`Browser page exceptions: ${pageErrors.join("; ")}`);
  }
  console.log(`Modern HUD layout verified (${summaries.join("; ")}).`);
} finally {
  client?.close();
  await stopProcess(chrome);
  await stopProcess(server);
  rmSync(chromeProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}

async function verifyViewport(client, viewport) {
  const label = `${viewport.width}x${viewport.height}`;
  await validateScenario(client, `${label} no selection`, async () => {
    await evalValue(client, "window.__WARGUS_TS_CLEAR_SELECTION__()");
  });
  await validateScenario(client, `${label} one peasant`, async () => {
    const selected = await evalValue(client, "window.__WARGUS_TS_SELECT_FIRST_UNIT_TYPE__('unit-peasant')");
    if (selected !== true) {
      throw new Error(`${label} could not select peasant: ${JSON.stringify(selected)}`);
    }
  });
  await validateScenario(client, `${label} multi-select`, async () => {
    const result = await evalValue(client, "window.__WARGUS_TS_SELECT_MIXED_FIXTURE_UNIT_TYPES__(['unit-peasant', 'unit-footman', 'unit-archer'])");
    if (!result?.ok || (result.selectedUnitIds?.length ?? 0) < 2) {
      throw new Error(`${label} could not create multi-select fixture: ${JSON.stringify(result)}`);
    }
  });
  await validateScenario(client, `${label} production building`, async () => {
    const fixture = await evalValue(client, "window.__WARGUS_TS_SELECT_SOURCE_TRAIN_FIXTURE__('unit-human-barracks', 'unit-footman')");
    if (!fixture?.ok) {
      throw new Error(`${label} could not create train fixture: ${JSON.stringify(fixture)}`);
    }
    const trained = await evalValue(client, "window.__WARGUS_TS_EXECUTE_HUD_COMMAND__('source-train:unit-footman')");
    if (trained?.handled !== true) {
      throw new Error(`${label} train command was not handled: ${JSON.stringify(trained)}`);
    }
  }, (state) => {
    if ((state.firstSelectedProductionQueueLength ?? 0) <= 0) {
      throw new Error(`${label} expected active production queue: ${JSON.stringify(state)}`);
    }
  });
  await validateScenario(client, `${label} active research`, async () => {
    const fixture = await evalValue(client, "window.__WARGUS_TS_SELECT_SOURCE_RESEARCH_FIXTURE__('unit-elven-lumber-mill', 'upgrade-arrow1')");
    if (!fixture?.ok) {
      throw new Error(`${label} could not create research fixture: ${JSON.stringify(fixture)}`);
    }
    const command = fixture.commandCard.find((candidate) => candidate.id === "source-research:upgrade-arrow1");
    if (!command || command.disabled) {
      throw new Error(`${label} research fixture did not expose upgrade-arrow1: ${JSON.stringify(fixture.commandCard)}`);
    }
    const researched = await evalValue(client, "window.__WARGUS_TS_EXECUTE_HUD_COMMAND__('source-research:upgrade-arrow1')");
    if (researched?.handled !== true) {
      throw new Error(`${label} research command was not handled: ${JSON.stringify(researched)}`);
    }
  }, (state) => {
    if ((state.firstSelectedActiveResearchCount ?? 0) <= 0) {
      throw new Error(`${label} expected active research: ${JSON.stringify(state)}`);
    }
  });
  await validateScenario(client, `${label} disabled command`, async () => {
    const selected = await evalValue(client, "window.__WARGUS_TS_SELECT_FIRST_UNIT_TYPE__('unit-peasant')");
    if (selected !== true) {
      throw new Error(`${label} could not select peasant for disabled command test: ${JSON.stringify(selected)}`);
    }
  }, (state) => {
    const disabled = state.commandCard.find((command) => command.disabled);
    if (!disabled) {
      throw new Error(`${label} expected at least one disabled readable command: ${JSON.stringify(state.commandCard)}`);
    }
  });
  await validateScenario(client, `${label} tower upgrade choice`, async () => {
    const fixture = await evalValue(client, "window.__WARGUS_TS_SELECT_FIXTURE_UNIT_TYPE__('unit-human-watch-tower')");
    if (!fixture?.ok) {
      throw new Error(`${label} could not create watch tower fixture: ${JSON.stringify(fixture)}`);
    }
  }, (state) => {
    const commandText = [
      ...state.commandCard.flatMap((command) => [command.longLabel, command.statusText]),
      ...state.modernHud.commandButtons.flatMap((command) => [command.longLabel, command.statusText])
    ].join("\n");
    if (!/Upgrade to Guard Tower/i.test(commandText) || !/Upgrade to Cannon Tower/i.test(commandText)) {
      throw new Error(`${label} tower commands should expose full upgrade intent, got ${JSON.stringify(commandText)}`);
    }
  });
  await validateScenario(client, `${label} stacked toasts`, async () => {
    await evalValue(client, `
      window.__WARGUS_TS_ADD_HUD_MESSAGE__('Footman trained', 9000);
      window.__WARGUS_TS_ADD_HUD_MESSAGE__('Building complete', 9000);
      window.__WARGUS_TS_ADD_HUD_MESSAGE__('Enemy attack', 9000);
      window.__WARGUS_TS_ADD_HUD_MESSAGE__('Research complete', 9000);
      window.__WARGUS_TS_ADD_HUD_MESSAGE__('Not enough lumber', 9000);
      true
    `);
  }, (state) => {
    if ((state.modernHud.messages?.length ?? 0) !== 4) {
      throw new Error(`${label} expected exactly four visible toast rows: ${JSON.stringify(state.modernHud.messages)}`);
    }
  });
  const screenshotPath = `/tmp/wargus-modern-hud-${label}.png`;
  await captureScreenshot(client, screenshotPath);
  return `${label} screenshot=${screenshotPath}`;
}

async function validateScenario(client, label, setup, extraAssert = () => undefined) {
  await setup();
  await delay(650);
  const state = await readSmokeState(client);
  assertModernHud(state, label);
  extraAssert(state);
}

function assertModernHud(state, label) {
  const hud = state?.modernHud;
  if (!hud) {
    throw new Error(`${label} did not expose modernHud layout: ${JSON.stringify(state)}`);
  }
  if (hud.overlaps?.length) {
    throw new Error(`${label} has HUD overlaps: ${hud.overlaps.join(", ")} layout=${JSON.stringify(hud)}`);
  }
  assertRectInside(hud.resourceBar, hud.topBar, `${label} resource bar inside top bar`);
  assertRectInside(hud.minimap, hud.minimapPanel, `${label} minimap inside minimap panel`);
  if (!hud.portrait?.filled || hud.portrait.source === "empty") {
    throw new Error(`${label} portrait should never be blank: ${JSON.stringify(hud.portrait)}`);
  }
  for (const chip of hud.resourceChips ?? []) {
    assertRectInside(chip, hud.resourceBar, `${label} resource chip ${chip.key}`);
    if (!chip.textFits) {
      throw new Error(`${label} resource chip text overflowed: ${JSON.stringify(chip)}`);
    }
  }
  for (const button of hud.commandButtons ?? []) {
    assertRectInside(button, hud.commandPanel, `${label} command button ${button.id}`);
    if (!button.textFits || !button.longLabel || !button.statusText) {
      throw new Error(`${label} command presentation is incomplete: ${JSON.stringify(button)}`);
    }
  }
  for (const command of state.commandCard ?? []) {
    if (!command.longLabel || !command.statusText) {
      throw new Error(`${label} smoke command lacks readable status text: ${JSON.stringify(command)}`);
    }
  }
  for (const message of hud.messages ?? []) {
    assertRectInside(message, hud.toastLane, `${label} toast ${message.text}`);
  }
}

function assertRectInside(rect, container, label) {
  const inside = rect.x >= container.x - 1
    && rect.y >= container.y - 1
    && rect.x + rect.width <= container.x + container.width + 1
    && rect.y + rect.height <= container.y + container.height + 1;
  if (!inside) {
    throw new Error(`${label} escaped container: rect=${JSON.stringify(rect)}, container=${JSON.stringify(container)}`);
  }
}

async function loadFixedDemoMap(client) {
  const loaded = await evalValue(client, `window.__WARGUS_TS_LOAD_MAP__(${JSON.stringify(MAP_PATH)})`);
  if (loaded !== true) {
    throw new Error(`Unable to load fixed demo map ${MAP_PATH}: ${JSON.stringify(loaded)}`);
  }
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.titleScreenOpen === false", 10_000);
  const hasBriefing = await evalValue(client, "window.__WARGUS_TS_SMOKE_STATE__?.briefingOpen === true");
  if (hasBriefing) {
    await dispatchKey(client, "Enter", "Enter", 13);
  }
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.titleScreenOpen === false && window.__WARGUS_TS_SMOKE_STATE__?.briefingOpen === false", 10_000);
  await delay(500);
}

async function captureScreenshot(client, screenshotPath) {
  const screenshot = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
}

async function dispatchKey(client, code, key, windowsVirtualKeyCode) {
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
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

async function waitForHttp(url, timeoutMs, details = () => "") {
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
  throw new Error(`Timed out waiting for ${url}${details() ? `; server output:\n${details()}` : ""}`);
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
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
        const handler = (params) => {
          clearTimeout(timer);
          listeners.set(method, (listeners.get(method) ?? []).filter((candidate) => candidate !== handler));
          resolve(params);
        };
        listeners.set(method, [...(listeners.get(method) ?? []), handler]);
      });
    },
    close() {
      socket.close();
    }
  };
}

async function stopProcess(child) {
  if (!child?.pid) {
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    return;
  }
  await delay(250);
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    // Already stopped.
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
