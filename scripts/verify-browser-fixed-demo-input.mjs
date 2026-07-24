import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const PORT = 5203;
const DEBUG_PORT = 9230;
const URL = `http://127.0.0.1:${PORT}/?smoke=1`;
const MAP_PATH = "maps/ladder/Garden of war BNE.pud.smp.gz";
const CHROME = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";
const EXPECTED_FIXED_DEMO_SOURCE_GAME_SPEED = 45;
const EXPECTED_FIXED_DEMO_GAME_SPEED = 1.5;
const EXPECTED_FIXED_DEMO_MOVEMENT_PACE_MULTIPLIER = 1;
const SMOOTH_MOVE_SAMPLE_COUNT = 12;
const SMOOTH_MOVE_SAMPLE_INTERVAL_MS = 100;
const MIN_SMOOTH_MOVE_DISTANCE_PX = 100;
const MIN_SMOOTH_VISUAL_STEPS = 5;
const MAX_SMOOTH_VISUAL_STEP_PX = 48;
const CAMERA_RAF_SAMPLE_COUNT = 45;
const MIN_CAMERA_PAN_DISTANCE_PX = 120;
const MAX_CAMERA_AVERAGE_FRAME_MS = 45;
const MAX_CAMERA_FRAME_MS = 120;
const MAX_CAMERA_INTERNAL_UPDATE_MS = 25;
const MAX_CAMERA_INTERNAL_RENDER_MS = 40;
const MAX_CAMERA_MAP_DISPLAY_OBJECTS = 2600;
const MAX_ROUTE_SEMANTICS_UPDATE_MS = 20;
const MAX_ROUTE_SEMANTICS_RENDER_MS = 24;
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
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.titleScreenOpen === false", 10_000);
  const overlayState = await readSmokeState(client);
  if (overlayState.briefingOpen === true) {
    if (overlayState.fixedDemoMission?.stage !== "briefing") {
      throw new Error(`Fixed demo briefing should publish briefing mission stage: ${JSON.stringify(overlayState.fixedDemoMission)}`);
    }
    await dispatchKey(client, "Enter");
    await delay(500);
  }
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.titleScreenOpen === false && window.__WARGUS_TS_SMOKE_STATE__?.briefingOpen === false && window.__WARGUS_TS_SMOKE_STATE__?.fixedDemoMission?.stage === \"economy\"", 10_000);
  await waitForExpression(client, "typeof window.__WARGUS_TS_RUN_MOVEMENT_ROUTE_SEMANTICS_FIXTURE__ === \"function\"", 10_000);
  const routeSemantics = await evalValue(client, "window.__WARGUS_TS_RUN_MOVEMENT_ROUTE_SEMANTICS_FIXTURE__()") ?? {};
  if (
    routeSemantics.ok !== true
    || routeSemantics.m02?.blockedStatus !== "temporarily-blocked"
    || routeSemantics.m02?.retainedOrder !== true
    || routeSemantics.m02?.retainedExactTarget !== true
    || routeSemantics.m02?.movingBlockerReady !== true
    || routeSemantics.m02?.legacyMovingBlockerPathLength !== 0
  ) {
    throw new Error(`M02 route semantics should retain the exact move through stationary congestion and plan a costlier crossing through a moving blocker: ${JSON.stringify(routeSemantics)}`);
  }
  if (
    routeSemantics.exactGoal?.status !== "ready"
    || routeSemantics.exactGoal?.goalRange !== 1
    || (
      routeSemantics.exactGoal?.selectedTile?.x === routeSemantics.exactGoal?.requestedTile?.x
      && routeSemantics.exactGoal?.selectedTile?.y === routeSemantics.exactGoal?.requestedTile?.y
    )
  ) {
    throw new Error(`Stationary exact-goal occupancy should expand to the minimum reachable ring while stationary route occupancy stays temporary: ${JSON.stringify(routeSemantics)}`);
  }
  const expectedLayerMatrix = {
    land: { land: false, naval: true, fly: true },
    naval: { land: true, naval: false, fly: true },
    fly: { land: true, naval: true, fly: false }
  };
  if (JSON.stringify(routeSemantics.layerMatrix) !== JSON.stringify(expectedLayerMatrix)) {
    throw new Error(`Movement layers should block only their own layer, including flying live occupancy: ${JSON.stringify(routeSemantics.layerMatrix)}`);
  }
  if (
    !Array.isArray(routeSemantics.isolatedPerformance)
    || routeSemantics.isolatedPerformance.length !== 2
    || routeSemantics.isolatedPerformance.some((sample) => (
      sample.status !== "ready"
      || sample.goalRange !== 2
      || !(sample.pathLength > 0)
      || !(sample.elapsedMs <= MAX_ROUTE_SEMANTICS_UPDATE_MS)
    ))
  ) {
    throw new Error(`Realistic isolated-goal searches should resolve in one bounded traversal under ${MAX_ROUTE_SEMANTICS_UPDATE_MS}ms: ${JSON.stringify(routeSemantics.isolatedPerformance)}`);
  }
  if (
    !Array.isArray(routeSemantics.liveFootprint)
    || routeSemantics.liveFootprint.length !== 2
    || routeSemantics.liveFootprint.some((sample) => (
      sample.planningStatus !== "ready"
      || !(sample.planningPathLength > 0)
      || sample.beforeOverlap !== false
      || sample.afterOverlap !== false
      || sample.movedDistance !== 0
    ))
  ) {
    throw new Error(`2x2 moving blockers should be cost-5 planning crossings but whole-footprint live blockers for west/up approaches: ${JSON.stringify(routeSemantics.liveFootprint)}`);
  }
  if (
    routeSemantics.m03?.selectedTile?.x !== 4
    || routeSemantics.m03?.selectedTile?.y !== 4
    || routeSemantics.m03?.goalRange !== 1
    || !(routeSemantics.m03?.pathLength > 0)
  ) {
    throw new Error(`M03 route semantics should reject the isolated first candidate and use the reachable tile in the minimum goal range: ${JSON.stringify(routeSemantics)}`);
  }
  if (
    routeSemantics.dynamicM02?.startTick !== 0
    || routeSemantics.dynamicM02?.retainedWhileBlocked !== true
    || routeSemantics.dynamicM02?.retainedExactTarget !== true
    || routeSemantics.dynamicM02?.droppedWhileBlocked !== false
    || !(routeSemantics.dynamicM02?.blockedTicks >= 10)
    || !(routeSemantics.dynamicM02?.minimumPathLength > 0)
    || routeSemantics.dynamicM02?.liveEmptyPathTicks !== 0
    || routeSemantics.dynamicM02?.overlapTicks !== 0
    || routeSemantics.dynamicM02?.completed !== true
    || routeSemantics.dynamicM02?.finalTile?.x !== 6
    || routeSemantics.dynamicM02?.finalTile?.y !== 1
    || !(routeSemantics.dynamicM02?.maximumRetryUpdateMs <= MAX_ROUTE_SEMANTICS_UPDATE_MS)
  ) {
    throw new Error(`Dynamic M02 should retain a nonempty exact Move through friendly congestion, avoid overlap, and complete after clearance under ${MAX_ROUTE_SEMANTICS_UPDATE_MS}ms: ${JSON.stringify(routeSemantics.dynamicM02)}`);
  }
  if (
    routeSemantics.stack?.startTick !== 0
    || routeSemantics.stack?.relocated !== true
    || routeSemantics.stack?.immediateOrderKind !== "move"
    || !(routeSemantics.stack?.immediatePathLength > 0)
    || routeSemantics.stack?.liveEmptyPathTicks !== 0
    || routeSemantics.stack?.overlapTicks !== 0
    || routeSemantics.stack?.completed !== true
    || routeSemantics.stack?.finalTile?.x !== 6
    || routeSemantics.stack?.finalTile?.y !== 1
  ) {
    throw new Error(`Stack recovery should immediately replan a reachable Move, avoid live empty paths/overlap, and complete after clearance: ${JSON.stringify(routeSemantics.stack)}`);
  }
  if (
    !(routeSemantics.performance?.blockedPathfindingMs <= MAX_ROUTE_SEMANTICS_UPDATE_MS)
    || !(routeSemantics.performance?.expansionPathfindingMs <= MAX_ROUTE_SEMANTICS_UPDATE_MS)
    || !(routeSemantics.performance?.averageUpdateMs <= MAX_ROUTE_SEMANTICS_UPDATE_MS)
    || !(routeSemantics.performance?.averageRenderMs <= MAX_ROUTE_SEMANTICS_RENDER_MS)
  ) {
    throw new Error(`M02/M03 route semantics exceeded the ${MAX_ROUTE_SEMANTICS_UPDATE_MS}ms update/pathfinding or ${MAX_ROUTE_SEMANTICS_RENDER_MS}ms render budget: ${JSON.stringify(routeSemantics.performance)}`);
  }
  const expectedFormation = [
    { id: "__smoke-fixture-m04-west", x: 9, y: 7 },
    { id: "__smoke-fixture-m04-center", x: 10, y: 7 },
    { id: "__smoke-fixture-m04-east", x: 11, y: 7 },
    { id: "__smoke-fixture-m04-north", x: 10, y: 6 },
    { id: "__smoke-fixture-m04-south", x: 10, y: 8 }
  ];
  const expectedSource = [
    { id: "__smoke-fixture-m04-west", x: 3, y: 3 },
    { id: "__smoke-fixture-m04-center", x: 4, y: 3 },
    { id: "__smoke-fixture-m04-east", x: 5, y: 3 },
    { id: "__smoke-fixture-m04-north", x: 4, y: 2 },
    { id: "__smoke-fixture-m04-south", x: 4, y: 4 }
  ];
  if (
    routeSemantics.m04?.issued !== true
    || routeSemantics.m04?.center?.x !== 4
    || routeSemantics.m04?.center?.y !== 3
    || routeSemantics.m04?.clickedTile?.x !== 10
    || routeSemantics.m04?.clickedTile?.y !== 7
    || JSON.stringify(routeSemantics.m04?.sourceTiles) !== JSON.stringify(expectedSource)
    || JSON.stringify(routeSemantics.m04?.expectedAssignedTiles) !== JSON.stringify(expectedFormation)
    || JSON.stringify(routeSemantics.m04?.committedAssignedTiles) !== JSON.stringify(expectedFormation)
    || JSON.stringify(routeSemantics.m04?.finalTiles) !== JSON.stringify(expectedFormation)
    || routeSemantics.m04?.completionCount !== 5
    || routeSemantics.m04?.prematureOrderDrops !== 0
    || routeSemantics.m04?.liveEmptyPathTicks !== 0
    || routeSemantics.m04?.overlapTicks !== 0
    || routeSemantics.m04?.completed !== true
    || !(routeSemantics.m04?.issueDurationMs <= MAX_ROUTE_SEMANTICS_UPDATE_MS)
    || !(routeSemantics.m04?.maximumUpdateMs <= MAX_ROUTE_SEMANTICS_UPDATE_MS)
    || !(routeSemantics.m04?.averageUpdateMs <= MAX_ROUTE_SEMANTICS_UPDATE_MS)
    || routeSemantics.m04SemanticRepeat !== true
  ) {
    throw new Error(`M04 source right-click should preserve five exact integer offsets, settle without dropped/empty/overlapping orders, and replay deterministically under ${MAX_ROUTE_SEMANTICS_UPDATE_MS}ms: ${JSON.stringify(routeSemantics.m04)}`);
  }
  if (
    !Array.isArray(routeSemantics.m04?.commandCardTargets)
    || routeSemantics.m04.commandCardTargets.length !== 5
    || routeSemantics.m04.commandCardTargets.some((target) => target.x !== 10 || target.y !== 7)
  ) {
    throw new Error(`Explicit command-card Move should send one common clicked tile to all five units: ${JSON.stringify(routeSemantics.m04?.commandCardTargets)}`);
  }
  if (
    routeSemantics.m04?.attackModeObjectOrders?.mobile?.issued !== true
    || !Array.isArray(routeSemantics.m04.attackModeObjectOrders.mobile.orders)
    || routeSemantics.m04.attackModeObjectOrders.mobile.orders.length !== 5
    || routeSemantics.m04.attackModeObjectOrders.mobile.orders.some((order) => (
      order.kind !== "follow"
      || order.targetId !== routeSemantics.m04.attackModeObjectOrders.mobile.targetId
    ))
    || routeSemantics.m04?.attackModeObjectOrders?.static?.issued !== true
    || !Array.isArray(routeSemantics.m04.attackModeObjectOrders.static.orders)
    || routeSemantics.m04.attackModeObjectOrders.static.orders.length !== 5
    || routeSemantics.m04.attackModeObjectOrders.static.orders.some((order) => order.kind !== "move")
  ) {
    throw new Error(`Attack-mode object right-clicks should follow friendly mobile units or issue ordinary common-point Moves to friendly static units without formation Attack-Move fallback: ${JSON.stringify(routeSemantics.m04?.attackModeObjectOrders)}`);
  }
  if (
    routeSemantics.m04?.crowdedBlockedSlot?.issued !== true
    || routeSemantics.m04.crowdedBlockedSlot.firstImmediateOrderKind !== "move"
    || !(routeSemantics.m04.crowdedBlockedSlot.firstImmediatePathLength > 1)
    || routeSemantics.m04.crowdedBlockedSlot.movedCount !== 5
    || routeSemantics.m04.crowdedBlockedSlot.settledCount !== 5
    || routeSemantics.m04.crowdedBlockedSlot.firstMoved !== true
    || routeSemantics.m04.crowdedBlockedSlot.prematureOrderDrops !== 0
    || routeSemantics.m04.crowdedBlockedSlot.overlapTicks !== 0
  ) {
    throw new Error(`A source-relative slot blocked by a building must not make a temporarily surrounded group member accept its own source tile and silently drop the first command: ${JSON.stringify(routeSemantics.m04?.crowdedBlockedSlot)}`);
  }
  const loadedState = await readSmokeState(client);
  const loadedCounts = loadedState.ownedUnitCounts ?? {};
  const loadedResources = loadedState.visibilityPlayerResources ?? {};
  if (
    loadedState.selectedUnitCount !== 1
    || loadedState.selectedUnitTypes?.[0] !== "unit-peasant"
    || loadedCounts["unit-peasant"] !== 1
    || loadedCounts["unit-town-hall"]
    || loadedCounts["unit-farm"]
    || loadedCounts["unit-keep"]
    || loadedCounts["unit-castle"]
    || Number(loadedResources.gold ?? 0) < 10000
    || Number(loadedResources.wood ?? 0) < 5000
  ) {
    throw new Error(`Fixed demo should start as one selected peasant with high resources and no starting base: ${JSON.stringify({ selectedUnitCount: loadedState.selectedUnitCount, selectedUnitTypes: loadedState.selectedUnitTypes, loadedCounts, loadedResources })}`);
  }
  if (
    loadedState.sourceGameSpeedDefault !== EXPECTED_FIXED_DEMO_SOURCE_GAME_SPEED
    || Math.abs((loadedState.gameSpeed ?? 0) - EXPECTED_FIXED_DEMO_GAME_SPEED) > 0.01
  ) {
    throw new Error(`Fixed demo should start at candidate B's honest global pace ${EXPECTED_FIXED_DEMO_GAME_SPEED}x / source ${EXPECTED_FIXED_DEMO_SOURCE_GAME_SPEED}, got ${JSON.stringify({ gameSpeed: loadedState.gameSpeed, sourceGameSpeedDefault: loadedState.sourceGameSpeedDefault })}`);
  }
  if (Math.abs((loadedState.fixedDemoMovementPaceMultiplier ?? 0) - EXPECTED_FIXED_DEMO_MOVEMENT_PACE_MULTIPLIER) > 0.01) {
    throw new Error(`Fixed demo should report no hidden movement-only multiplier, expected ${EXPECTED_FIXED_DEMO_MOVEMENT_PACE_MULTIPLIER}, got ${JSON.stringify({ fixedDemoMovementPaceMultiplier: loadedState.fixedDemoMovementPaceMultiplier })}`);
  }
  await evalValue(client, "window.dispatchEvent(new Event(\"blur\")); true");
  await delay(300);
  const afterBlur = await readSmokeState(client);
  if (afterBlur.paused === true) {
    throw new Error(`Fixed demo paused after browser blur, which makes manual move commands look broken: ${JSON.stringify(afterBlur)}`);
  }
  await waitForExpression(client, "window.__WARGUS_TS_CENTER_FIRST_OWNED_MOVABLE__?.() === true", 10_000);
  await waitForExpression(client, "Array.isArray(window.__WARGUS_TS_SMOKE_STATE__?.ownedUnitScreenPoints) && window.__WARGUS_TS_SMOKE_STATE__.ownedUnitScreenPoints.length >= 1", 10_000);
  const cameraPan = await verifyCameraPanResponsiveness(client);
  await waitForExpression(client, "window.__WARGUS_TS_CENTER_FIRST_OWNED_MOVABLE__?.() === true", 10_000);
  await waitForExpression(client, "Array.isArray(window.__WARGUS_TS_SMOKE_STATE__?.ownedUnitScreenPoints) && window.__WARGUS_TS_SMOKE_STATE__.ownedUnitScreenPoints.length >= 1", 10_000);

  const points = movableScreenPoints(await readSmokeState(client));
  const first = points.find((unit) => unit.typeId === "unit-footman") ?? points.find((unit) => unit.typeId === "unit-peasant") ?? points[0];
  if (!first) {
    throw new Error(`Need an owned movable unit for fixed demo input verification, got ${JSON.stringify(points)}`);
  }
  const second = points.find((unit) => unit.id !== first.id && unit.typeId === first.typeId) ?? points.find((unit) => unit.id !== first.id);

  await selectExactly(client, first);
  let selectionSummary = `selected ${first.id}`;
  if (second) {
    await selectExactly(client, second);
    const switched = await readSmokeState(client);
    if (switched.selectedUnitIds.length !== 1 || switched.selectedUnitIds[0] !== second.id || switched.selectedUnitIds.includes(first.id)) {
      throw new Error(`Single-click selection stuck to previous unit: ${JSON.stringify({ first: first.id, second: second.id, selected: switched.selectedUnitIds })}`);
    }
    selectionSummary = `selected ${first.id}->${second.id}`;
  }

  await selectExactly(client, first);
  await dispatchKey(client, "Space");
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.paused === true", 4_000);
  const moved = await issueMoveAndWait(client, first);
  if (pageErrors.length > 0) {
    throw new Error(`Browser page exceptions: ${pageErrors.join("; ")}`);
  }
  const isolatedTiming = routeSemantics.isolatedPerformance.map((sample) => `${sample.size}=${formatTiming(sample.elapsedMs)}ms`).join("/");
  const liveFootprintSummary = routeSemantics.liveFootprint.map((sample) => `${sample.direction}=${formatTiming(sample.movedDistance)}px/overlap:${sample.afterOverlap}`).join("/");
  console.log(`Browser fixed demo input verified (${MAP_PATH}, M02 exact=${routeSemantics.m02.retainedExactTarget}/moving=${routeSemantics.m02.movingBlockerReady}/blocked=${routeSemantics.dynamicM02.blockedTicks}/complete=${routeSemantics.dynamicM02.completionTick}/retry=${formatTiming(routeSemantics.dynamicM02.maximumRetryUpdateMs)}ms, stack path=${routeSemantics.stack.immediatePathLength}/complete=${routeSemantics.stack.completionTick}, M03 tile=${routeSemantics.m03.selectedTile.x},${routeSemantics.m03.selectedTile.y}/range=${routeSemantics.m03.goalRange}, M04 complete=${routeSemantics.m04.completionCount}/issue=${formatTiming(routeSemantics.m04.issueDurationMs)}ms/update=${formatTiming(routeSemantics.m04.maximumUpdateMs)}ms, route=${formatTiming(Math.max(routeSemantics.performance.blockedPathfindingMs, routeSemantics.performance.expansionPathfindingMs))}ms/update=${formatTiming(routeSemantics.performance.averageUpdateMs)}ms/render=${formatTiming(routeSemantics.performance.averageRenderMs)}ms, isolated ${isolatedTiming}, 2x2 ${liveFootprintSummary}, speed ${moved.gameSpeed.toFixed(1)}x/source ${moved.sourceGameSpeedDefault}, pace=${moved.fixedDemoMovementPaceMultiplier.toFixed(2)}x, camera panned ${cameraPan.distance.toFixed(1)}px with ${formatTiming(cameraPan.frames.averageMs)}ms RAF avg/${formatTiming(cameraPan.frames.maxMs)}ms max${cameraPan.rafChoppy ? " (headless RAF slow; internal timings passed)" : ""}, blur stayed running, ${selectionSummary}, paused move resumed=${moved.pausedAfterIssue === false}, moved ${first.id} visually ${moved.visualDistance.toFixed(1)}px / actual ${moved.actualDistance.toFixed(1)}px across ${moved.smoothSteps} smooth steps, max visual step ${moved.maxVisualStep.toFixed(1)}px, render=${formatTiming(moved.performance?.averageRenderMs)}ms avg, update=${formatTiming(moved.performance?.averageUpdateMs)}ms avg, smoke=${formatTiming(moved.performance?.averageSmokeMs)}ms avg, frame=${formatTiming(moved.performance?.averageFrameMs)}ms avg, order=${moved.orderKind ?? "cleared"}, tick ${moved.beforeTick}->${moved.afterTick}).`);
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
  const displayObjectBudgetOk = (
    Number.isFinite(displayObjects.mapLayerChildren)
    && displayObjects.mapLayerChildren <= MAX_CAMERA_MAP_DISPLAY_OBJECTS
  );
  const internalResponsive = (
    Number.isFinite(performance.averageUpdateMs)
    && Number.isFinite(performance.averageRenderMs)
    && performance.averageUpdateMs <= MAX_CAMERA_INTERNAL_UPDATE_MS
    && performance.averageRenderMs <= MAX_CAMERA_INTERNAL_RENDER_MS
    && displayObjectBudgetOk
  );
  const rafChoppy = frames.averageMs > MAX_CAMERA_AVERAGE_FRAME_MS || frames.maxMs > MAX_CAMERA_FRAME_MS;
  if (!displayObjectBudgetOk) {
    throw new Error(`Fixed demo camera pan exceeded map display-object budget: display=${JSON.stringify(after.displayObjects)}.`);
  }
  if (rafChoppy && !internalResponsive && distance < MIN_CAMERA_PAN_DISTANCE_PX * 2) {
    throw new Error(`Fixed demo camera pan is still choppy: RAF avg ${frames.averageMs.toFixed(1)}ms, max ${frames.maxMs.toFixed(1)}ms, over50=${frames.over50Count}/${frames.count}, camera ${JSON.stringify(beforeCamera)} -> ${JSON.stringify(afterCamera)}, perf=${JSON.stringify(after.performance)}, display=${JSON.stringify(after.displayObjects)}.`);
  }
  return { distance, frames, beforeCamera, afterCamera, direction, rafChoppy, performance, displayObjects };
}

async function issueMoveAndWait(client, unit) {
  const candidates = [
    { x: unit.screenX + 420, y: unit.screenY + 24 },
    { x: unit.screenX - 420, y: unit.screenY + 24 },
    { x: unit.screenX + 360, y: unit.screenY - 220 },
    { x: unit.screenX - 360, y: unit.screenY - 220 },
    { x: unit.screenX + 360, y: unit.screenY + 220 },
    { x: unit.screenX - 360, y: unit.screenY + 220 },
    { x: 980, y: 540 },
    { x: 300, y: 540 }
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
        throw new Error(`Fixed demo movement should stay at candidate B's selected global pace, got ${JSON.stringify({ gameSpeed: lastSample.gameSpeed, sourceGameSpeedDefault: lastSample.sourceGameSpeedDefault })}`);
      }
      if (Math.abs((lastSample.fixedDemoMovementPaceMultiplier ?? 0) - EXPECTED_FIXED_DEMO_MOVEMENT_PACE_MULTIPLIER) > 0.01) {
        throw new Error(`Fixed demo hidden movement pace compatibility value regressed: ${JSON.stringify({ fixedDemoMovementPaceMultiplier: lastSample.fixedDemoMovementPaceMultiplier })}`);
      }
      if (actualDistance < MIN_SMOOTH_MOVE_DISTANCE_PX || visualDistance < MIN_SMOOTH_MOVE_DISTANCE_PX) {
        throw new Error(`Fixed demo movement is still too sluggish at the selected global pace: visual ${visualDistance.toFixed(1)}px / actual ${actualDistance.toFixed(1)}px in ${wallMs}ms after right-clicking ${JSON.stringify(point)}, tick ${before.tick}->${lastSample.tick}, unit speed=${lastSample.firstSelectedSpeed ?? "unknown"} base=${lastSample.firstSelectedBaseSpeed ?? "unknown"}, order=${lastSample.firstSelectedOrderKind ?? "cleared"}; expected at least ${MIN_SMOOTH_MOVE_DISTANCE_PX}px.`);
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
      const finish = (timedOut = false) => {
        const sum = deltas.reduce((total, value) => total + value, 0);
        resolve({
          count: deltas.length,
          averageMs: deltas.length > 0 ? sum / deltas.length : Number.POSITIVE_INFINITY,
          maxMs: deltas.length > 0 ? Math.max(0, ...deltas) : Number.POSITIVE_INFINITY,
          over50Count: deltas.filter((value) => value > 50).length,
          timedOut
        });
      };
      const timeout = setTimeout(() => finish(true), 3000);
      const step = (now) => {
        if (last > 0) {
          deltas.push(now - last);
        }
        last = now;
        if (deltas.length >= ${JSON.stringify(count)}) {
          clearTimeout(timeout);
          finish(false);
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
