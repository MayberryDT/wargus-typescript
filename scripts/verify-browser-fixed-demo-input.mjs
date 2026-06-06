import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const PORT = 5203;
const DEBUG_PORT = 9230;
const URL = `http://127.0.0.1:${PORT}/?smoke=1`;
const MAP_PATH = "maps/ladder/Garden of war BNE.pud.smp.gz";
const CHROME = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";
const EXPECTED_FIXED_DEMO_SOURCE_GAME_SPEED = 30;
const EXPECTED_FIXED_DEMO_GAME_SPEED = 1;
const EXPECTED_FIXED_DEMO_MOVEMENT_PACE_MULTIPLIER = 1.3;
const SMOOTH_MOVE_SAMPLE_COUNT = 12;
const SMOOTH_MOVE_SAMPLE_INTERVAL_MS = 100;
const MIN_SMOOTH_MOVE_DISTANCE_PX = 100;
const MIN_SMOOTH_VISUAL_STEPS = 5;
const MAX_SMOOTH_VISUAL_STEP_PX = 30;
const CAMERA_RAF_SAMPLE_COUNT = 45;
const MIN_CAMERA_PAN_DISTANCE_PX = 120;
const MAX_CAMERA_AVERAGE_FRAME_MS = 45;
const MAX_CAMERA_FRAME_MS = 120;
const MAX_CAMERA_INTERNAL_UPDATE_MS = 25;
const MAX_CAMERA_INTERNAL_RENDER_MS = 40;
const MAX_CAMERA_MAP_DISPLAY_OBJECTS = 2600;
const chromeProfile = mkdtempSync(path.join(tmpdir(), "wargus-fixed-demo-input-chrome-"));
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
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=CalculateNativeWinOcclusion",
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
  await waitForExpression(client, "typeof window.__WARGUS_TS_LOAD_MAP__ === \"function\"", 20_000);
  const loaded = await evalValue(client, `window.__WARGUS_TS_LOAD_MAP__(${JSON.stringify(MAP_PATH)})`);
  if (loaded !== true) {
    throw new Error(`Unable to load fixed demo map ${MAP_PATH}: ${JSON.stringify(loaded)}`);
  }
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.titleScreenOpen === false && window.__WARGUS_TS_SMOKE_STATE__?.briefingOpen === true && window.__WARGUS_TS_SMOKE_STATE__?.fixedDemoMission?.stage === \"briefing\"", 10_000);
  await dispatchKey(client, "Enter");
  await delay(500);
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.titleScreenOpen === false && window.__WARGUS_TS_SMOKE_STATE__?.briefingOpen === false", 10_000);
  const loadedState = await readSmokeState(client);
  if (
    loadedState.sourceGameSpeedDefault !== EXPECTED_FIXED_DEMO_SOURCE_GAME_SPEED
    || Math.abs((loadedState.gameSpeed ?? 0) - EXPECTED_FIXED_DEMO_GAME_SPEED) > 0.01
  ) {
    throw new Error(`Fixed demo should start at normal source speed ${EXPECTED_FIXED_DEMO_GAME_SPEED}x / source ${EXPECTED_FIXED_DEMO_SOURCE_GAME_SPEED}, got ${JSON.stringify({ gameSpeed: loadedState.gameSpeed, sourceGameSpeedDefault: loadedState.sourceGameSpeedDefault })}`);
  }
  if (Math.abs((loadedState.fixedDemoMovementPaceMultiplier ?? 0) - EXPECTED_FIXED_DEMO_MOVEMENT_PACE_MULTIPLIER) > 0.01) {
    throw new Error(`Fixed demo should apply the playable movement pace multiplier ${EXPECTED_FIXED_DEMO_MOVEMENT_PACE_MULTIPLIER} while presenting as Speed 1x, got ${JSON.stringify({ fixedDemoMovementPaceMultiplier: loadedState.fixedDemoMovementPaceMultiplier })}`);
  }
  await evalValue(client, "window.dispatchEvent(new Event(\"blur\")); true");
  await delay(300);
  const afterBlur = await readSmokeState(client);
  if (afterBlur.paused === true) {
    throw new Error(`Fixed demo paused after browser blur, which makes manual move commands look broken: ${JSON.stringify(afterBlur)}`);
  }
  await waitForExpression(client, "window.__WARGUS_TS_CENTER_FIRST_OWNED_MOVABLE__?.() === true", 10_000);
  await waitForExpression(client, "Array.isArray(window.__WARGUS_TS_SMOKE_STATE__?.ownedUnitScreenPoints) && window.__WARGUS_TS_SMOKE_STATE__.ownedUnitScreenPoints.length >= 2", 10_000);
  const cameraPan = await verifyCameraPanResponsiveness(client);
  await waitForExpression(client, "window.__WARGUS_TS_CENTER_FIRST_OWNED_MOVABLE__?.() === true", 10_000);
  await waitForExpression(client, "Array.isArray(window.__WARGUS_TS_SMOKE_STATE__?.ownedUnitScreenPoints) && window.__WARGUS_TS_SMOKE_STATE__.ownedUnitScreenPoints.length >= 2", 10_000);

  const points = movableScreenPoints(await readSmokeState(client));
  const first = points.find((unit) => unit.typeId === "unit-footman") ?? points.find((unit) => unit.typeId === "unit-peasant") ?? points[0];
  const second = points.find((unit) => unit.id !== first.id && unit.typeId === first.typeId) ?? points.find((unit) => unit.id !== first.id);
  if (!first || !second) {
    throw new Error(`Need two owned movable units for selection switching, got ${JSON.stringify(points)}`);
  }

  await selectExactly(client, first);
  await selectExactly(client, second);
  const switched = await readSmokeState(client);
  if (switched.selectedUnitIds.length !== 1 || switched.selectedUnitIds[0] !== second.id || switched.selectedUnitIds.includes(first.id)) {
    throw new Error(`Single-click selection stuck to previous unit: ${JSON.stringify({ first: first.id, second: second.id, selected: switched.selectedUnitIds })}`);
  }

  await selectExactly(client, first);
  await dispatchKey(client, "Space");
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.paused === true", 4_000);
  const moved = await issueMoveAndWait(client, first);
  if (pageErrors.length > 0) {
    throw new Error(`Browser page exceptions: ${pageErrors.join("; ")}`);
  }
  console.log(`Browser fixed demo input verified (${MAP_PATH}, speed ${moved.gameSpeed.toFixed(1)}x/source ${moved.sourceGameSpeedDefault}, pace=${moved.fixedDemoMovementPaceMultiplier.toFixed(2)}x, camera panned ${cameraPan.distance.toFixed(1)}px with ${formatTiming(cameraPan.frames.averageMs)}ms RAF avg/${formatTiming(cameraPan.frames.maxMs)}ms max${cameraPan.rafChoppy ? " (headless RAF slow; internal timings passed)" : ""}, blur stayed running, selected ${first.id}->${second.id}, paused move resumed=${moved.pausedAfterIssue === false}, moved ${first.id} visually ${moved.visualDistance.toFixed(1)}px / actual ${moved.actualDistance.toFixed(1)}px across ${moved.smoothSteps} smooth steps, max visual step ${moved.maxVisualStep.toFixed(1)}px, render=${formatTiming(moved.performance?.averageRenderMs)}ms avg, update=${formatTiming(moved.performance?.averageUpdateMs)}ms avg, smoke=${formatTiming(moved.performance?.averageSmokeMs)}ms avg, frame=${formatTiming(moved.performance?.averageFrameMs)}ms avg, order=${moved.orderKind ?? "cleared"}, tick ${moved.beforeTick}->${moved.afterTick}).`);
} finally {
  client?.close();
  await stopProcess(chrome);
  await stopProcess(server);
  rmSync(chromeProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}

function movableScreenPoints(state) {
  return (state?.ownedUnitScreenPoints ?? [])
    .filter((unit) => unit && Number.isFinite(unit.screenX) && Number.isFinite(unit.screenY))
    .filter((unit) => ["unit-peasant", "unit-footman", "unit-archer"].includes(unit.typeId))
    .sort((left, right) => left.id.localeCompare(right.id));
}

async function selectExactly(client, unit) {
  await dispatchMouseClick(client, unit.screenX, unit.screenY);
  await waitForExpression(client, `JSON.stringify(window.__WARGUS_TS_SMOKE_STATE__?.selectedUnitIds ?? []) === ${JSON.stringify(JSON.stringify([unit.id]))}`, 4_000);
}

async function verifyCameraPanResponsiveness(client) {
  const before = await readSmokeState(client);
  const beforeCamera = before.camera;
  if (!beforeCamera || !Number.isFinite(beforeCamera.x) || !Number.isFinite(beforeCamera.y)) {
    throw new Error(`Fixed demo smoke did not expose camera state: ${JSON.stringify(before)}`);
  }
  const direction = beforeCamera.x > MIN_CAMERA_PAN_DISTANCE_PX + 32 ? "ArrowLeft" : "ArrowRight";
  await keyDown(client, direction);
  let frames;
  try {
    frames = await sampleAnimationFrames(client, CAMERA_RAF_SAMPLE_COUNT);
  } finally {
    await keyUp(client, direction);
  }
  await delay(120);
  const after = await readSmokeState(client);
  const afterCamera = after.camera;
  const distance = direction === "ArrowLeft"
    ? beforeCamera.x - (afterCamera?.x ?? beforeCamera.x)
    : (afterCamera?.x ?? beforeCamera.x) - beforeCamera.x;
  if (distance < MIN_CAMERA_PAN_DISTANCE_PX) {
    throw new Error(`Fixed demo camera barely moved while panning ${direction}: ${distance.toFixed(1)}px from ${JSON.stringify(beforeCamera)} to ${JSON.stringify(afterCamera)}; expected at least ${MIN_CAMERA_PAN_DISTANCE_PX}px.`);
  }
  const performance = after.performance ?? {};
  const displayObjects = after.displayObjects ?? {};
  const internalResponsive = (
    Number.isFinite(performance.averageUpdateMs)
    && Number.isFinite(performance.averageRenderMs)
    && performance.averageUpdateMs <= MAX_CAMERA_INTERNAL_UPDATE_MS
    && performance.averageRenderMs <= MAX_CAMERA_INTERNAL_RENDER_MS
    && Number.isFinite(displayObjects.mapLayerChildren)
    && displayObjects.mapLayerChildren <= MAX_CAMERA_MAP_DISPLAY_OBJECTS
  );
  const rafChoppy = frames.averageMs > MAX_CAMERA_AVERAGE_FRAME_MS || frames.maxMs > MAX_CAMERA_FRAME_MS;
  if (rafChoppy && !internalResponsive) {
    throw new Error(`Fixed demo camera pan is still choppy: RAF avg ${frames.averageMs.toFixed(1)}ms, max ${frames.maxMs.toFixed(1)}ms, over50=${frames.over50Count}/${frames.count}, camera ${JSON.stringify(beforeCamera)} -> ${JSON.stringify(afterCamera)}, perf=${JSON.stringify(after.performance)}, display=${JSON.stringify(after.displayObjects)}.`);
  }
  return { distance, frames, beforeCamera, afterCamera, direction, rafChoppy, performance, displayObjects };
}

async function issueMoveAndWait(client, unit) {
  const candidates = [
    { x: unit.screenX + 220, y: unit.screenY + 24 },
    { x: unit.screenX - 220, y: unit.screenY + 24 },
    { x: unit.screenX + 180, y: unit.screenY - 140 },
    { x: unit.screenX - 180, y: unit.screenY - 140 },
    { x: unit.screenX + 180, y: unit.screenY + 140 },
    { x: unit.screenX - 180, y: unit.screenY + 140 },
    { x: 650, y: 460 },
    { x: 720, y: 500 }
  ].map((point) => ({
    x: Math.max(220, Math.min(1030, Math.round(point.x))),
    y: Math.max(120, Math.min(620, Math.round(point.y)))
  })).sort((left, right) => screenDistance(unit, right) - screenDistance(unit, left));

  for (const point of candidates) {
    await selectExactly(client, unit);
    const before = await readSmokeState(client);
    const beforePoint = before.firstSelectedWorldPoint;
    const beforeVisualPoint = before.firstSelectedVisualWorldPoint ?? beforePoint;
    if (!beforePoint || !beforeVisualPoint) {
      continue;
    }
    const issuedAt = Date.now();
    await dispatchMouseClick(client, point.x, point.y, "right");
    const issued = await waitForExpressionValue(client, `
      (() => {
        const state = window.__WARGUS_TS_SMOKE_STATE__;
        const before = ${JSON.stringify(beforePoint)};
        const current = state?.firstSelectedWorldPoint;
        const moved = current ? Math.hypot(current.x - before.x, current.y - before.y) : 0;
        return Boolean((state?.firstSelectedOrderKind && state.firstSelectedOrderKind !== "hold") || moved > 2);
      })()
    `, 2_000);
    if (!issued) {
      continue;
    }
    const after = await waitForMovement(client, beforePoint, 6_000);
    if (after) {
      const samples = await sampleSmoothMovement(client, beforePoint, beforeVisualPoint);
      const wallMs = Date.now() - issuedAt;
      const lastSample = samples.at(-1)?.state ?? after;
      const actualDistance = pointDistance(lastSample.firstSelectedWorldPoint, beforePoint);
      const visualDistance = pointDistance(lastSample.firstSelectedVisualWorldPoint, beforeVisualPoint);
      const visualSteps = visualStepDistances(samples);
      const smoothSteps = visualSteps.filter((step) => step >= 0.5).length;
      const maxVisualStep = Math.max(0, ...visualSteps);
      if (Math.abs((lastSample.gameSpeed ?? 0) - EXPECTED_FIXED_DEMO_GAME_SPEED) > 0.01 || lastSample.sourceGameSpeedDefault !== EXPECTED_FIXED_DEMO_SOURCE_GAME_SPEED) {
        throw new Error(`Fixed demo movement should stay at normal speed, got ${JSON.stringify({ gameSpeed: lastSample.gameSpeed, sourceGameSpeedDefault: lastSample.sourceGameSpeedDefault })}`);
      }
      if (Math.abs((lastSample.fixedDemoMovementPaceMultiplier ?? 0) - EXPECTED_FIXED_DEMO_MOVEMENT_PACE_MULTIPLIER) > 0.01) {
        throw new Error(`Fixed demo movement pace multiplier regressed: ${JSON.stringify({ fixedDemoMovementPaceMultiplier: lastSample.fixedDemoMovementPaceMultiplier })}`);
      }
      if (actualDistance < MIN_SMOOTH_MOVE_DISTANCE_PX || visualDistance < MIN_SMOOTH_MOVE_DISTANCE_PX) {
        throw new Error(`Fixed demo movement is still too sluggish at normal speed: visual ${visualDistance.toFixed(1)}px / actual ${actualDistance.toFixed(1)}px in ${wallMs}ms after right-clicking ${JSON.stringify(point)}, tick ${before.tick}->${lastSample.tick}, unit speed=${lastSample.firstSelectedSpeed ?? "unknown"} base=${lastSample.firstSelectedBaseSpeed ?? "unknown"}, order=${lastSample.firstSelectedOrderKind ?? "cleared"}; expected at least ${MIN_SMOOTH_MOVE_DISTANCE_PX}px.`);
      }
      if (smoothSteps < MIN_SMOOTH_VISUAL_STEPS) {
        throw new Error(`Fixed demo movement is visually choppy: only ${smoothSteps} visible movement samples from ${samples.length} reads (${visualSteps.map((step) => step.toFixed(1)).join(", ")}px).`);
      }
      if (maxVisualStep > MAX_SMOOTH_VISUAL_STEP_PX) {
        throw new Error(`Fixed demo movement visually popped by ${maxVisualStep.toFixed(1)}px in one sample; steps=${visualSteps.map((step) => step.toFixed(1)).join(", ")}px.`);
      }
      return {
        beforeTick: before.tick,
        afterTick: lastSample.tick,
        orderKind: lastSample.firstSelectedOrderKind,
        pausedAfterIssue: lastSample.paused,
        actualDistance,
        visualDistance,
        smoothSteps,
        maxVisualStep,
        wallMs,
        gameSpeed: lastSample.gameSpeed ?? 0,
        sourceGameSpeedDefault: lastSample.sourceGameSpeedDefault ?? null,
        fixedDemoMovementPaceMultiplier: lastSample.fixedDemoMovementPaceMultiplier ?? 0,
        performance: lastSample.performance ?? null
      };
    }
  }
  throw new Error(`Right-click command did not move ${unit.id}; smoke=${JSON.stringify(await readSmokeState(client))}`);
}

async function sampleSmoothMovement(client, beforePoint, beforeVisualPoint) {
  const samples = [{ atMs: 0, state: await readSmokeState(client) }];
  for (let index = 0; index < SMOOTH_MOVE_SAMPLE_COUNT; index += 1) {
    await delay(SMOOTH_MOVE_SAMPLE_INTERVAL_MS);
    samples.push({ atMs: (index + 1) * SMOOTH_MOVE_SAMPLE_INTERVAL_MS, state: await readSmokeState(client) });
  }
  const validSamples = samples.filter((sample) => sample.state.firstSelectedWorldPoint && sample.state.firstSelectedVisualWorldPoint);
  if (validSamples.length < Math.max(4, Math.floor(samples.length * 0.75))) {
    throw new Error(`Fixed demo smoke did not expose enough visual movement samples: ${JSON.stringify(samples.map((sample) => ({ atMs: sample.atMs, actual: sample.state.firstSelectedWorldPoint, visual: sample.state.firstSelectedVisualWorldPoint })))}`);
  }
  if (pointDistance(validSamples.at(-1)?.state.firstSelectedWorldPoint, beforePoint) <= 0 || pointDistance(validSamples.at(-1)?.state.firstSelectedVisualWorldPoint, beforeVisualPoint) <= 0) {
    throw new Error(`Fixed demo unit did not make measurable movement in smoothness samples: ${JSON.stringify(validSamples.map((sample) => ({ atMs: sample.atMs, actual: sample.state.firstSelectedWorldPoint, visual: sample.state.firstSelectedVisualWorldPoint })))}`);
  }
  return validSamples;
}

function visualStepDistances(samples) {
  const steps = [];
  for (let index = 1; index < samples.length; index += 1) {
    steps.push(pointDistance(samples[index].state.firstSelectedVisualWorldPoint, samples[index - 1].state.firstSelectedVisualWorldPoint));
  }
  return steps;
}

function pointDistance(left, right) {
  if (!left || !right) {
    return 0;
  }
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function formatTiming(value) {
  return Number.isFinite(value) ? value.toFixed(1) : "n/a";
}

function screenDistance(unit, point) {
  return Math.hypot(point.x - unit.screenX, point.y - unit.screenY);
}

async function waitForMovement(client, beforePoint, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await readSmokeState(client);
    const point = state.firstSelectedWorldPoint;
    if (point && Math.hypot(point.x - beforePoint.x, point.y - beforePoint.y) >= 10) {
      return state;
    }
    await delay(250);
  }
  return null;
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
  if (await waitForExpressionValue(client, expression, timeoutMs)) {
    return;
  }
  throw new Error(`Timed out waiting for browser expression: ${expression}; smoke=${JSON.stringify(await readSmokeState(client))}`);
}

async function waitForExpressionValue(client, expression, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await client.send("Runtime.evaluate", { expression, returnByValue: true });
    if (result.result?.value === true) {
      return true;
    }
    await delay(250);
  }
  return false;
}

async function dispatchMouseClick(client, x, y, button = "left") {
  const buttons = button === "right" ? 2 : 1;
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button, buttons, clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button, buttons: 0, clickCount: 1 });
}

async function dispatchKey(client, code) {
  await keyDown(client, code);
  await keyUp(client, code);
}

async function keyDown(client, code) {
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", ...keyEventPayload(code) });
}

async function keyUp(client, code) {
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", ...keyEventPayload(code) });
}

function keyEventPayload(code) {
  const keys = {
    Space: { key: " ", windowsVirtualKeyCode: 32 },
    ArrowLeft: { key: "ArrowLeft", windowsVirtualKeyCode: 37 },
    ArrowUp: { key: "ArrowUp", windowsVirtualKeyCode: 38 },
    ArrowRight: { key: "ArrowRight", windowsVirtualKeyCode: 39 },
    ArrowDown: { key: "ArrowDown", windowsVirtualKeyCode: 40 }
  };
  const entry = keys[code] ?? { key: code, windowsVirtualKeyCode: 0 };
  return { key: entry.key, code, windowsVirtualKeyCode: entry.windowsVirtualKeyCode };
}

async function sampleAnimationFrames(client, count) {
  return await evalValue(client, `
    new Promise((resolve) => {
      const deltas = [];
      let last = 0;
      const step = (now) => {
        if (last > 0) {
          deltas.push(now - last);
        }
        last = now;
        if (deltas.length >= ${JSON.stringify(count)}) {
          const sum = deltas.reduce((total, value) => total + value, 0);
          resolve({
            count: deltas.length,
            averageMs: sum / Math.max(1, deltas.length),
            maxMs: Math.max(0, ...deltas),
            over50Count: deltas.filter((value) => value > 50).length
          });
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    })
  `);
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
