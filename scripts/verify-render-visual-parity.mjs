import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { connect } from "node:net";
import path from "node:path";
import { inflateSync } from "node:zlib";
import {
  BrowserExecutionController,
  collectHostMetrics,
  createArtifactDirectory,
  preflightArtifactRoot,
  qualifyRenderer
} from "./lib/browser-execution-controller.mjs";
import {
  connectDevTools,
  evalValue,
  waitForExpression,
  waitForPageTarget
} from "./browser-smoke-harness.mjs";

const BASE_COMMIT = "5b7d9cc81072c8aeda1ce1a9c22602569e1a691b";
const PLAN021_COMMIT = "c4238c6ae0aaa093785b52f6f71e9569395bf08e";
const FIRST_GATE_COMMIT = "3375d734c055b46cf3aeb7d9dcf0c22c93005691";
const SECOND_GATE_COMMIT = "f61b12c8517a7a518c4e8131dc020c7e810e58d0";
const PRIOR_PROVENANCE_COMMIT = "d943d6afacb281b4c136bebd9a2aeb72b77fd19c";
const FIRST_CORRECTION_COMMIT = "859d5de4441cba8b714d1022034887947150fdbe";
const SECOND_CORRECTION_COMMIT = "532bcd0ce82a7dbb8e183e603f859f54717447d1";
const THIRD_CORRECTION_COMMIT = "1be72d07678b8af8b9fe5fda7c3bde3065d274bf";
const FOURTH_CORRECTION_COMMIT = "28de0d62a14a4d84faa07727a79d624244bcf61a";
const CHROME_BIN = "/usr/bin/google-chrome";
const PROFILE = "combat-100";
const FIXED_TICK = 0;
const VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 };
const MIN_START_AVAILABLE_BYTES = 4 * 1024 ** 3;
const MIN_START_DISK_FREE_BYTES = 20 * 1024 ** 3;
const INTERRUPT_FIXTURE_FLAG = "--interruption-fixture";
const INTERRUPT_TEST_FLAG = "--self-test-interruption";
const ALLOWED_GATE_FILES = [
  "package.json",
  "scripts/verify-render-visual-parity.mjs",
  "scripts/verify-wargus-assets.mjs"
];
const lifecycle = {
  afterWorktree: process.cwd(),
  baseWorktree: null,
  baseCreated: false,
  clients: new Set(),
  controllers: new Set(),
  controllerCleanup: new Map(),
  profiles: new Set(),
  lock: null,
  cleanupPromise: null,
  signalHandlers: new Map(),
  interruptionStatusPath: process.env.WARGUS_VISUAL_INTERRUPT_STATUS_PATH ?? null
};

if (process.argv.includes(INTERRUPT_TEST_FLAG)) await runInterruptionSelfTest();
else if (process.argv.includes(INTERRUPT_FIXTURE_FLAG)) await runInterruptionFixture();
else await runVisualParity();

async function runVisualParity() {
  const context = validateExecutionContext();
  const { afterWorktree, afterHead, repositoryRoot } = context;
  lifecycle.baseWorktree = path.join(repositoryRoot, ".worktrees", `task4-visual-base-${process.pid}`);
  assert.ok(!existsSync(lifecycle.baseWorktree), `Disposable base worktree already exists: ${lifecycle.baseWorktree}`);

  const preflight = capturePreflight(repositoryRoot, afterWorktree);
  const stamp = process.env.WARGUS_VISUAL_ARTIFACT_STAMP ?? utcStamp(new Date());
  assert.match(stamp, /^\d{8}T\d{6}Z$/, "Artifact stamp must be a UTC basic timestamp.");
  const artifact = createArtifactDirectory({ preflight, plan: "021", commit: PLAN021_COMMIT, stamp });
  const visualDirectory = path.join(artifact.directory, "visual-parity");
  assert.ok(!existsSync(visualDirectory), `Visual artifact directory must be fresh: ${visualDirectory}`);
  mkdirSync(visualDirectory);

  installSignalHandlers();
  lifecycle.lock = acquireCaptureLock(preflight, afterHead);
  const releaseOnExit = () => releaseCaptureLock(lifecycle.lock);
  process.once("exit", releaseOnExit);

  let failure = null;
  let comparison = null;
  let manifest = null;
  try {
    execFileSync("git", ["-C", afterWorktree, "worktree", "add", "--detach", lifecycle.baseWorktree, BASE_COMMIT], { stdio: "inherit" });
    lifecycle.baseCreated = true;
    assert.equal(git(lifecycle.baseWorktree, ["rev-parse", "HEAD"]), BASE_COMMIT);
    assertClean(lifecycle.baseWorktree, "pre-Plan021 base worktree");

    const resourceBefore = preflight.startResources;
    const base = await capture("base", lifecycle.baseWorktree, 56_200);
    const after = await capture("after", afterWorktree, 56_400);
    const resourceAfter = collectHostMetrics(afterWorktree);

    comparison = compareCaptures(base, after);
    writeCapture(visualDirectory, "base", base);
    writeCapture(visualDirectory, "after", after);
    writeJson(visualDirectory, "comparison.json", comparison);
    writeJson(visualDirectory, "resource.json", { before: resourceBefore, after: resourceAfter });
    writeJson(visualDirectory, "packet.json", {
      schemaVersion: 2,
      baseCommit: BASE_COMMIT,
      plan021Commit: PLAN021_COMMIT,
      stagingGateCommit: afterHead,
      stagingGateFiles: ALLOWED_GATE_FILES,
      profile: PROFILE,
      fixedState: {
        tick: FIXED_TICK,
        viewport: VIEWPORT,
        camera: base.state.camera,
        ui: base.state.ui,
        entityCounts: base.state.entityCounts
      },
      renderer: base.renderer,
      captureMethod: "Chrome DevTools Protocol Page.captureScreenshot compositor PNG decoded to raw RGBA",
      informativeness: { base: base.informativeness, after: after.informativeness },
      comparison,
      controller: { base: base.controller, after: after.controller }
    });
    assert.equal(comparison.exactEquality, true, `Visual parity failed: ${JSON.stringify(comparison)}`);
  } catch (error) {
    failure = error;
  } finally {
    try {
      const cleanup = await cleanupLifecycle("normal-finally");
      writeJson(visualDirectory, "capture-lock.json", {
        path: lifecycle.lock?.path,
        tokenSha256: lifecycle.lock ? sha256(lifecycle.lock.token) : null,
        acquiredAt: lifecycle.lock?.acquiredAt ?? null,
        releasedAt: lifecycle.lock?.releasedAt ?? null,
        releaseError: cleanup.lockReleaseError,
        cleanupReason: cleanup.reason
      });
      if (cleanup.errors.length > 0) throw new AggregateError(cleanup.errors, "Visual parity cleanup failed.");
    } catch (cleanupError) {
      failure = failure ? new AggregateError([failure, cleanupError], "Visual parity and cleanup both failed.") : cleanupError;
    }
    process.removeListener("exit", releaseOnExit);
    try { manifest = writeChecksumManifest(visualDirectory); } catch (manifestError) { failure ??= manifestError; }
  }
  if (failure) throw failure;
  console.log(`Render visual parity verified (${PROFILE} tick ${FIXED_TICK}, ${VIEWPORT.width}x${VIEWPORT.height} DPR ${VIEWPORT.deviceScaleFactor}, exact pixels, ${comparison.informativeness.base.uniqueRgbCount} RGB colors; ${artifact.logicalPath}/visual-parity; sha256 ${manifest.sha256}).`);
}

async function capture(label, worktree, firstPort) {
  const controller = new BrowserExecutionController({
    name: `plan021-visual-${label}`,
    portCandidates: Array.from({ length: 180 }, (_, index) => firstPort + index)
  });
  lifecycle.controllers.add(controller);
  const { serverPort, debugPort } = await controller.allocatePorts();
  const profilePath = mkdtempSync(path.join(tmpdir(), `wargus-plan021-${label}-chrome-`));
  lifecycle.profiles.add(profilePath);
  let client = null;
  let server = null;
  let chrome = null;
  let captureResult = null;
  let captureError = null;
  try {
    await controller.releasePort(serverPort);
    const viteBin = path.join(lifecycle.afterWorktree, "node_modules", "vite", "bin", "vite.js");
    server = controller.spawnOwned(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(serverPort), "--strictPort"], { cwd: worktree, stdio: "ignore" });
    const pageUrl = `http://127.0.0.1:${serverPort}/?smoke=1&perfProfile=${PROFILE}`;
    await controller.waitForHttp(pageUrl);
    const manifestResponse = await fetch(`http://127.0.0.1:${serverPort}/wargus/manifest.json`);
    assert.equal(manifestResponse.status, 200, "Critical Wargus manifest route must return HTTP 200.");

    chrome = await controller.startChrome({
      chromeBin: CHROME_BIN,
      debugPort,
      profilePath,
      extraArgs: [
        "--use-gl=angle", "--use-angle=vulkan", "--enable-features=Vulkan", "--disable-vulkan-surface",
        "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization",
        "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding", "--disable-background-networking", "--disable-extensions",
        "--force-device-scale-factor=1", "--hide-scrollbars", "--no-proxy-server",
        `--window-size=${VIEWPORT.width},${VIEWPORT.height}`
      ]
    });
    await controller.waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);
    const target = await waitForPageTarget(`http://127.0.0.1:${debugPort}/json/list`, 10_000);
    client = await connectDevTools(target.webSocketDebuggerUrl);
    lifecycle.clients.add(client);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, mobile: false });
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: pauseAtProfileTickZeroSource() });
    await client.send("Page.navigate", { url: pageUrl });
    await waitForExpression(client, readyExpression(), 45_000);
    await client.send("Page.bringToFront");
    await controller.runCapture({
      readFrame: async () => await evalValue(client, "new Promise((resolve) => requestAnimationFrame((timestamp) => resolve({ rafAdvanced: Number.isFinite(timestamp) })))"),
      shouldStop: (_frame, frames) => frames >= 2,
      intervalMs: 0
    });

    const browserVersion = await client.send("Browser.getVersion");
    const metadata = await evalValue(client, captureMetadataExpression());
    const screenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
    const png = Buffer.from(screenshot.data, "base64");
    const decoded = decodePngToRgba(png);
    assert.equal(decoded.width, VIEWPORT.width, `${label} compositor screenshot width mismatch.`);
    assert.equal(decoded.height, VIEWPORT.height, `${label} compositor screenshot height mismatch.`);
    const informativeness = assertInformativeScene(decoded.rgba, decoded.width, decoded.height, label);
    assert.equal(metadata.state.profile, PROFILE);
    assert.equal(metadata.state.tick, FIXED_TICK);
    assert.equal(metadata.state.paused, true);
    assert.equal(metadata.state.viewport.width, VIEWPORT.width);
    assert.equal(metadata.state.viewport.height, VIEWPORT.height);
    assert.equal(metadata.state.devicePixelRatio, VIEWPORT.deviceScaleFactor);
    assert.ok(metadata.state.entityCounts.units >= 100 && metadata.state.entityCounts.projectiles > 0 && metadata.state.entityCounts.spellEffects > 0, `${label} did not expose the expected live Wargus combat scene.`);
    const renderer = qualifyRenderer({
      renderer: metadata.renderer.unmaskedRenderer,
      focused: metadata.state.focused,
      visibility: metadata.state.visibility,
      rafAdvanced: true,
      executable: CHROME_BIN,
      version: browserVersion.product,
      gpu: { device: metadata.renderer.unmaskedRenderer, driver: metadata.renderer.version },
      viewport: metadata.state.viewport
    });
    captureResult = {
      png,
      rgba: decoded.rgba,
      width: decoded.width,
      height: decoded.height,
      informativeness,
      state: metadata.state,
      renderer: {
        ...renderer,
        vendor: metadata.renderer.unmaskedVendor,
        glVersion: metadata.renderer.version,
        shadingLanguageVersion: metadata.renderer.shadingLanguageVersion,
        browser: browserVersion
      },
      process: { serverPid: server.pid, chromePid: chrome.pid, serverPort, debugPort }
    };
  } catch (error) {
    captureError = error;
  } finally {
    try { client?.close(); } catch { /* Exact PID cleanup follows. */ }
    if (client) lifecycle.clients.delete(client);
    try {
      const cleanup = await cleanupController(controller);
      if (captureResult) captureResult.controller = { allocationLedger: controller.allocationLedger, lifecycleLedger: controller.lifecycleLedger, cleanup };
    } catch (cleanupError) {
      captureError ??= cleanupError;
    }
    rmSync(profilePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    lifecycle.profiles.delete(profilePath);
  }
  if (captureError) throw captureError;
  return captureResult;
}

function pauseAtProfileTickZeroSource() {
  return `(() => {
    const timer = setInterval(() => {
      try {
        const summary = window.__WARGUS_TS_PERF_SUMMARY__?.();
        if (summary?.profile === ${JSON.stringify(PROFILE)} && summary.worldTick === ${FIXED_TICK}) {
          window.dispatchEvent(new KeyboardEvent("keydown", { code: "Pause", key: "Pause", bubbles: true }));
          window.__WARGUS_VISUAL_PAUSE_REQUESTED__ = true;
          clearInterval(timer);
        }
      } catch { }
    }, 1);
  })();`;
}

function readyExpression() {
  return `(() => {
    const state = window.__WARGUS_TS_SMOKE_STATE__;
    const summary = window.__WARGUS_TS_PERF_SUMMARY__?.();
    const canvas = document.querySelector("canvas");
    return Boolean(window.__WARGUS_VISUAL_PAUSE_REQUESTED__)
      && state?.worldLoaded === true && state?.loadingVisible === false && state?.paused === true
      && state?.titleScreenOpen === false && state?.briefingOpen === false
      && summary?.profile === ${JSON.stringify(PROFILE)} && summary?.worldTick === ${FIXED_TICK}
      && summary?.entityCounts?.units >= 100 && summary?.entityCounts?.projectiles > 0
      && summary?.entityCounts?.spellEffects > 0 && canvas?.width === ${VIEWPORT.width}
      && canvas?.height === ${VIEWPORT.height};
  })()`;
}

function captureMetadataExpression() {
  return `(() => {
    const source = document.querySelector("canvas");
    const gl = source.getContext("webgl2") || source.getContext("webgl");
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const smoke = window.__WARGUS_TS_SMOKE_STATE__;
    const summary = window.__WARGUS_TS_PERF_SUMMARY__();
    return {
      renderer: {
        unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        unmaskedVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        version: gl.getParameter(gl.VERSION),
        shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
      },
      state: {
        profile: summary.profile, tick: summary.worldTick, paused: smoke.paused, camera: smoke.camera,
        ui: { activeMapPath: smoke.activeMapPath, titleScreenOpen: smoke.titleScreenOpen, briefingOpen: smoke.briefingOpen, selectedUnitIds: smoke.selectedUnitIds, commandPage: smoke.commandPage },
        entityCounts: summary.entityCounts, viewport: summary.viewport, devicePixelRatio: window.devicePixelRatio,
        focused: document.hasFocus(), visibility: document.visibilityState
      }
    };
  })()`;
}

function decodePngToRgba(buffer) {
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "Screenshot was not a PNG.");
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
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  assert.equal(bitDepth, 8, `Unsupported PNG bit depth: ${bitDepth}.`);
  assert.ok(colorType === 2 || colorType === 6, `Unsupported PNG color type: ${colorType}.`);
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idat));
  assert.equal(inflated.length, height * (stride + 1), "PNG inflated byte length mismatch.");
  const rgba = Buffer.alloc(width * height * 4);
  let readOffset = 0;
  let writeOffset = 0;
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[readOffset];
    const row = Buffer.from(inflated.subarray(readOffset + 1, readOffset + 1 + stride));
    unfilter(row, previous, channels, filter);
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = x * channels;
      rgba[writeOffset++] = row[sourceOffset];
      rgba[writeOffset++] = row[sourceOffset + 1];
      rgba[writeOffset++] = row[sourceOffset + 2];
      rgba[writeOffset++] = channels === 4 ? row[sourceOffset + 3] : 255;
    }
    previous = row;
    readOffset += stride + 1;
  }
  return { width, height, rgba };
}

function unfilter(row, previous, channels, filter) {
  for (let index = 0; index < row.length; index += 1) {
    const left = index >= channels ? row[index - channels] : 0;
    const up = previous[index] ?? 0;
    const upLeft = index >= channels ? previous[index - channels] ?? 0 : 0;
    if (filter === 1) row[index] = (row[index] + left) & 0xff;
    else if (filter === 2) row[index] = (row[index] + up) & 0xff;
    else if (filter === 3) row[index] = (row[index] + Math.floor((left + up) / 2)) & 0xff;
    else if (filter === 4) row[index] = (row[index] + paeth(left, up, upLeft)) & 0xff;
    else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}.`);
  }
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  return upDistance <= upLeftDistance ? up : upLeft;
}

function assertInformativeScene(rgba, width, height, label) {
  const colors = new Map();
  let nonBlackPixelCount = 0;
  let brightPixelCount = 0;
  let transparentPixelCount = 0;
  const channelMin = [255, 255, 255];
  const channelMax = [0, 0, 0];
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const r = rgba[offset]; const g = rgba[offset + 1]; const b = rgba[offset + 2]; const a = rgba[offset + 3];
    if (a !== 255) transparentPixelCount += 1;
    if (r + g + b > 15) nonBlackPixelCount += 1;
    if (r + g + b > 96) brightPixelCount += 1;
    const key = `${r},${g},${b}`;
    colors.set(key, (colors.get(key) ?? 0) + 1);
    channelMin[0] = Math.min(channelMin[0], r); channelMin[1] = Math.min(channelMin[1], g); channelMin[2] = Math.min(channelMin[2], b);
    channelMax[0] = Math.max(channelMax[0], r); channelMax[1] = Math.max(channelMax[1], g); channelMax[2] = Math.max(channelMax[2], b);
  }
  const pixelCount = width * height;
  const dominantColorPixelCount = Math.max(...colors.values());
  const stats = {
    pixelCount,
    uniqueRgbCount: colors.size,
    nonBlackPixelCount,
    nonBlackRatio: nonBlackPixelCount / pixelCount,
    brightPixelCount,
    brightRatio: brightPixelCount / pixelCount,
    transparentPixelCount,
    dominantColorPixelCount,
    dominantColorRatio: dominantColorPixelCount / pixelCount,
    channelMin,
    channelMax,
    channelRange: channelMax.map((value, index) => value - channelMin[index])
  };
  assert.equal(transparentPixelCount, 0, `${label} compositor screenshot contains transparent pixels: ${JSON.stringify(stats)}`);
  assert.ok(colors.size >= 128, `${label} compositor screenshot is not informative enough: ${JSON.stringify(stats)}`);
  assert.ok(stats.nonBlackRatio >= 0.25, `${label} compositor screenshot appears black: ${JSON.stringify(stats)}`);
  assert.ok(stats.brightRatio >= 0.01, `${label} compositor screenshot lacks visible scene highlights: ${JSON.stringify(stats)}`);
  assert.ok(stats.dominantColorRatio < 0.85, `${label} compositor screenshot is dominated by one opaque color: ${JSON.stringify(stats)}`);
  assert.ok(stats.channelRange.every((range) => range >= 64), `${label} compositor screenshot lacks Wargus scene color range: ${JSON.stringify(stats)}`);
  return stats;
}

function compareCaptures(base, after) {
  assert.deepEqual(after.state, base.state, "Fixed profile/tick/camera/UI/viewport state drifted between captures.");
  assert.deepEqual(after.renderer, base.renderer, "Browser/GPU/renderer identity drifted between captures.");
  assert.deepEqual(after.informativeness, base.informativeness, "Rendered-scene informativeness drifted between captures.");
  const dimensionsEqual = base.width === after.width && base.height === after.height;
  assert.equal(base.rgba.length, after.rgba.length, "Raw RGBA dimensions differ.");
  let changedPixelCount = 0;
  let maximumChannelDelta = 0;
  for (let offset = 0; offset < base.rgba.length; offset += 4) {
    let pixelChanged = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(base.rgba[offset + channel] - after.rgba[offset + channel]);
      if (delta > 0) pixelChanged = true;
      maximumChannelDelta = Math.max(maximumChannelDelta, delta);
    }
    if (pixelChanged) changedPixelCount += 1;
  }
  const basePngSha256 = sha256(base.png);
  const afterPngSha256 = sha256(after.png);
  const baseRawSha256 = sha256(base.rgba);
  const afterRawSha256 = sha256(after.rgba);
  return {
    dimensions: { width: base.width, height: base.height, equal: dimensionsEqual },
    pngSha256: { base: basePngSha256, after: afterPngSha256 },
    rawRgbaSha256: { base: baseRawSha256, after: afterRawSha256 },
    informativeness: { base: base.informativeness, after: after.informativeness },
    changedPixelCount,
    maximumChannelDelta,
    exactEquality: dimensionsEqual && basePngSha256 === afterPngSha256 && baseRawSha256 === afterRawSha256 && changedPixelCount === 0 && maximumChannelDelta === 0
  };
}

function validateExecutionContext() {
  const afterWorktree = lifecycle.afterWorktree;
  const afterHead = git(afterWorktree, ["rev-parse", "HEAD"]);
  const afterParent = git(afterWorktree, ["rev-parse", "HEAD^"]);
  const afterGrandparent = git(afterWorktree, ["rev-parse", "HEAD^^"]);
  const afterGreatGrandparent = git(afterWorktree, ["rev-parse", "HEAD^^^"]);
  const afterFourthParent = git(afterWorktree, ["rev-parse", "HEAD^^^^"]);
  const afterFifthParent = git(afterWorktree, ["rev-parse", "HEAD^^^^^"]);
  const afterSixthParent = git(afterWorktree, ["rev-parse", "HEAD^^^^^^"]);
  const afterSeventhParent = git(afterWorktree, ["rev-parse", "HEAD^^^^^^^"]);
  const afterEighthParent = git(afterWorktree, ["rev-parse", "HEAD^^^^^^^^"]);
  assert.equal(afterParent, FOURTH_CORRECTION_COMMIT, "Visual parity full-signature correction must directly follow the exact-signature correction.");
  assert.equal(afterGrandparent, THIRD_CORRECTION_COMMIT, "Visual parity correction ancestry must retain the prepared draw-call correction.");
  assert.equal(afterGreatGrandparent, SECOND_CORRECTION_COMMIT, "Visual parity correction ancestry must retain the declaration-binding correction.");
  assert.equal(afterFourthParent, FIRST_CORRECTION_COMMIT, "Visual parity correction ancestry must retain the reviewed first correction commit.");
  assert.equal(afterFifthParent, PRIOR_PROVENANCE_COMMIT, "Visual parity correction ancestry must retain the reviewed provenance commit.");
  assert.equal(afterSixthParent, SECOND_GATE_COMMIT, "Visual parity correction ancestry must retain the reviewed second coordinator gate commit.");
  assert.equal(afterSeventhParent, FIRST_GATE_COMMIT, "Visual parity correction ancestry must retain the reviewed first coordinator gate commit.");
  assert.equal(afterEighthParent, PLAN021_COMMIT, "Visual parity must run from the reviewed Plan 021 commit plus exactly eight coordinator-only gate commits.");
  assert.deepEqual(git(afterWorktree, ["diff", "--name-only", `${PLAN021_COMMIT}..${afterHead}`]).split("\n").filter(Boolean).sort(), ALLOWED_GATE_FILES, "The staging commit must contain only the coordinator Task 4 gate files.");
  assertClean(afterWorktree, "Plan 021 gate staging worktree");
  assert.equal(process.getuid?.(), 1000, "Visual parity must run as the Halla project user.");
  assert.equal(execFileSync("hostname", { encoding: "utf8" }).trim(), "halla");
  assert.equal(path.resolve(CHROME_BIN), CHROME_BIN);
  assert.ok(existsSync(CHROME_BIN) && statSync(CHROME_BIN).isFile(), `System Chrome is missing: ${CHROME_BIN}`);
  const repositoryRoot = path.dirname(git(afterWorktree, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
  return { afterWorktree, afterHead, repositoryRoot };
}

function capturePreflight(repositoryRoot, afterWorktree) {
  const startResources = collectHostMetrics(afterWorktree);
  assertStartResources(startResources);
  return {
    ...preflightArtifactRoot({
      artifactWorkspace: process.env.WARGUS_ARTIFACT_WORKSPACE ?? `${repositoryRoot}-retained-artifacts`,
      artifactRoot: process.env.WARGUS_ARTIFACT_ROOT ?? path.join(`${repositoryRoot}-retained-artifacts`, ".artifacts"),
      disposableWorktree: afterWorktree,
      preservationOwner: "wave2-recovery-task4"
    }),
    startResources
  };
}

function assertStartResources(resources) {
  assert.ok(resources.memory.availableBytes >= MIN_START_AVAILABLE_BYTES,
    `Visual parity requires at least 4 GiB MemAvailable; found ${resources.memory.availableBytes} bytes.`);
  assert.ok(resources.diskFreeBytes >= MIN_START_DISK_FREE_BYTES,
    `Visual parity requires at least 20 GiB workspace disk free; found ${resources.diskFreeBytes} bytes.`);
}

function acquireCaptureLock(preflight, afterHead) {
  const lockPath = path.join(preflight.artifactRoot, "performance", ".wargus-capture.lock");
  const acquiredAt = new Date().toISOString();
  const token = [process.pid, "021", afterHead, acquiredAt].join(":");
  let descriptor;
  try {
    descriptor = openSync(lockPath, "wx", 0o600);
    try {
      writeFileSync(descriptor, JSON.stringify({ token, pid: process.pid, plan: "021", captureSha: afterHead, worktree: process.cwd(), acquiredAt }) + "\n", "utf8");
    } finally {
      closeSync(descriptor);
    }
  } catch (error) {
    if (descriptor !== undefined) { try { unlinkSync(lockPath); } catch { } }
    throw new Error(`Another performance capture is active or the exclusive lock could not be created at ${lockPath}: ${error.message}`);
  }
  return { path: lockPath, token, acquiredAt, releasedAt: null };
}

function releaseCaptureLock(lock) {
  if (!lock || lock.releasedAt) return;
  const record = JSON.parse(readFileSync(lock.path, "utf8"));
  if (record.token !== lock.token) throw new Error("Capture lock ownership changed; refusing to remove it.");
  unlinkSync(lock.path);
  lock.releasedAt = new Date().toISOString();
}

function installSignalHandlers() {
  for (const [signal, exitCode] of [["SIGINT", 130], ["SIGTERM", 143]]) {
    const handler = () => {
      void cleanupLifecycle(`signal-${signal}`).then((cleanup) => {
        if (cleanup.errors.length > 0) {
          throw new AggregateError(cleanup.errors, `Visual parity ${signal} cleanup failed.`);
        }
        process.exit(exitCode);
      }).catch((error) => {
        console.error(`Visual parity ${signal} cleanup failed:`, error);
        process.exit(1);
      });
    };
    lifecycle.signalHandlers.set(signal, handler);
    process.once(signal, handler);
  }
}

async function cleanupController(controller) {
  if (!lifecycle.controllerCleanup.has(controller)) {
    const attempt = controller.cleanup().then(
      (record) => {
        lifecycle.controllers.delete(controller);
        lifecycle.controllerCleanup.delete(controller);
        return record;
      },
      (error) => {
        lifecycle.controllerCleanup.delete(controller);
        throw error;
      }
    );
    lifecycle.controllerCleanup.set(controller, attempt);
  }
  return await lifecycle.controllerCleanup.get(controller);
}

function cleanupProfiles(profilePaths, removeProfile = (profilePath) => rmSync(profilePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })) {
  const errors = [];
  for (const profilePath of [...profilePaths]) {
    try {
      removeProfile(profilePath);
      profilePaths.delete(profilePath);
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

function removeLifecycleProfile(profilePath) {
  if (process.env.WARGUS_VISUAL_INTERRUPT_FORCE_PROFILE_REMOVE_FAILURE === "1" && process.argv.includes(INTERRUPT_FIXTURE_FLAG)) {
    throw new Error(`Injected profile removal failure for ${profilePath}`);
  }
  rmSync(profilePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}

async function cleanupLifecycle(reason) {
  if (lifecycle.cleanupPromise) return await lifecycle.cleanupPromise;
  lifecycle.cleanupPromise = (async () => {
    const errors = [];
    const controllerRecords = [];
    for (const client of lifecycle.clients) { try { client.close(); } catch { } }
    lifecycle.clients.clear();
    for (const controller of [...lifecycle.controllers]) {
      try { controllerRecords.push(await cleanupController(controller)); } catch (error) { errors.push(error); }
    }
    errors.push(...cleanupProfiles(lifecycle.profiles, removeLifecycleProfile));
    if (lifecycle.baseCreated && lifecycle.baseWorktree) {
      try {
        execFileSync("git", ["-C", lifecycle.afterWorktree, "worktree", "remove", "--force", lifecycle.baseWorktree], { stdio: "ignore" });
        lifecycle.baseCreated = false;
      } catch (error) { errors.push(error); }
    }
    let lockReleaseError = null;
    try { releaseCaptureLock(lifecycle.lock); } catch (error) { lockReleaseError = errorRecord(error); errors.push(error); }
    const record = {
      reason,
      at: new Date().toISOString(),
      controllerRecords,
      profilesRemoved: [...lifecycle.profiles].length === 0,
      baseWorktreeRemoved: !lifecycle.baseWorktree || !existsSync(lifecycle.baseWorktree),
      lockRemoved: !lifecycle.lock || !existsSync(lifecycle.lock.path),
      lockReleasedAt: lifecycle.lock?.releasedAt ?? null,
      lockReleaseError,
      errors: errors.map(errorRecord)
    };
    if (lifecycle.interruptionStatusPath) writeFileSync(lifecycle.interruptionStatusPath, `${JSON.stringify({ phase: "cleaned", pid: process.pid, ...record }, null, 2)}\n`, "utf8");
    return { ...record, errors };
  })();
  const result = await lifecycle.cleanupPromise;
  if (result.errors.length > 0) lifecycle.cleanupPromise = null;
  return result;
}

async function runInterruptionSelfTest() {
  const retainedProfiles = new Set(["removed-profile", "failed-profile"]);
  const injectedProfileErrors = cleanupProfiles(retainedProfiles, (profilePath) => {
    if (profilePath === "failed-profile") throw new Error("injected profile removal failure");
  });
  assert.equal(injectedProfileErrors.length, 1);
  assert.deepEqual([...retainedProfiles], ["failed-profile"], "Failed profile cleanup paths must remain tracked.");
  assert.doesNotThrow(() => assertStartResources({ memory: { availableBytes: MIN_START_AVAILABLE_BYTES }, diskFreeBytes: MIN_START_DISK_FREE_BYTES }));
  assert.throws(() => assertStartResources({ memory: { availableBytes: MIN_START_AVAILABLE_BYTES - 1 }, diskFreeBytes: MIN_START_DISK_FREE_BYTES }), /4 GiB/);
  assert.throws(() => assertStartResources({ memory: { availableBytes: MIN_START_AVAILABLE_BYTES }, diskFreeBytes: MIN_START_DISK_FREE_BYTES - 1 }), /20 GiB/);
  validateExecutionContext();
  const testDirectory = mkdtempSync(path.join(tmpdir(), "wargus-plan021-interruption-test-"));
  const statusPath = path.join(testDirectory, "status.json");
  const child = spawn(process.execPath, [new URL(import.meta.url).pathname, INTERRUPT_FIXTURE_FLAG], {
    cwd: process.cwd(),
    env: { ...process.env, WARGUS_VISUAL_INTERRUPT_STATUS_PATH: statusPath },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    const ready = await waitForStatus(statusPath, "ready", 30_000);
    assert.equal(ready.pid, child.pid, "Interruption fixture status PID mismatch.");
    assert.ok(ready.lockRecord.token && ready.lockRecord.pid === child.pid && ready.lockRecord.plan === "021", "Interruption fixture lock record is incomplete.");
    assert.equal(child.kill("SIGTERM"), true, "Failed to signal the exact interruption fixture PID.");
    const [exitCode, exitSignal] = await once(child, "exit");
    assert.equal(exitCode, 143, `Interruption fixture exited unexpectedly: code=${exitCode} signal=${exitSignal} stderr=${stderr}`);
    assert.equal(exitSignal, null);
    const cleaned = await waitForStatus(statusPath, "cleaned", 5_000);
    assert.equal(cleaned.reason, "signal-SIGTERM");
    assert.equal(cleaned.errors.length, 0, `Interruption cleanup errors: ${JSON.stringify(cleaned.errors)}`);
    assert.equal(cleaned.baseWorktreeRemoved, true);
    assert.equal(cleaned.lockRemoved, true);
    assert.ok(cleaned.lockReleasedAt);
    assert.equal(existsSync(ready.baseWorktree), false, "Interruption fixture left its base worktree behind.");
    assert.equal(existsSync(ready.profilePath), false, "Interruption fixture left its Chrome profile behind.");
    assert.equal(existsSync(ready.lockPath), false, "Interruption fixture left the global capture lock behind.");
    assert.equal(isPidAlive(ready.ownedPid), false, `Interruption fixture left owned PID ${ready.ownedPid} alive.`);
    assert.equal(await isPortOpen(ready.serverPort), false, `Interruption fixture left server port ${ready.serverPort} open.`);
    assert.equal(await isPortOpen(ready.debugPort), false, `Interruption fixture left debug port ${ready.debugPort} open.`);
    assert.equal(cleaned.controllerRecords.length, 1);
    assert.deepEqual(cleaned.controllerRecords[0].residualPids, []);
    assert.deepEqual(cleaned.controllerRecords[0].openPorts, []);
    assert.ok(cleaned.controllerRecords[0].terminationOrder.includes(ready.ownedPid));
    console.log(`Visual parity SIGTERM cleanup self-test passed (fixture PID ${child.pid}, owned PID ${ready.ownedPid}, ports ${ready.serverPort}/${ready.debugPort}, exact-owned cleanup, worktree/profile/lock removed).`);
    await runInterruptionFailureSelfTests();
  } finally {
    if (isPidAlive(child.pid)) child.kill("SIGTERM");
    rmSync(testDirectory, { recursive: true, force: true });
  }
}

async function runInterruptionFailureSelfTests() {
  await runProfileCleanupFailureSelfTest();
  await runSetupFailureSelfTest();
  console.log("Visual parity failure-path self-tests passed (cleanup failure exits 1 with retained ownership; setup failure cleans exact resources)." );
}

async function runProfileCleanupFailureSelfTest() {
  const directory = mkdtempSync(path.join(tmpdir(), "wargus-plan021-cleanup-failure-test-"));
  const statusPath = path.join(directory, "status.json");
  const child = spawn(process.execPath, [new URL(import.meta.url).pathname, INTERRUPT_FIXTURE_FLAG], {
    cwd: process.cwd(),
    env: { ...process.env, WARGUS_VISUAL_INTERRUPT_STATUS_PATH: statusPath, WARGUS_VISUAL_INTERRUPT_FORCE_PROFILE_REMOVE_FAILURE: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  let ready = null;
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    ready = await waitForStatus(statusPath, "ready", 30_000);
    assert.equal(child.kill("SIGTERM"), true);
    const [exitCode, exitSignal] = await once(child, "exit");
    assert.equal(exitCode, 1, `Cleanup-failure fixture must fail closed: code=${exitCode} signal=${exitSignal} stderr=${stderr}`);
    assert.equal(exitSignal, null);
    const cleaned = await waitForStatus(statusPath, "cleaned", 5_000);
    assert.equal(cleaned.reason, "signal-SIGTERM");
    assert.equal(cleaned.errors.length, 1);
    assert.match(cleaned.errors[0].message, /Injected profile removal failure/);
    assert.equal(cleaned.profilesRemoved, false);
    assert.equal(existsSync(ready.profilePath), true, "Failed profile path must remain present for truthful ownership reporting.");
    await assertFixtureNonProfileResourcesClean(ready, cleaned);
  } finally {
    if (isPidAlive(child.pid)) child.kill("SIGTERM");
    if (ready?.profilePath) rmSync(ready.profilePath, { recursive: true, force: true });
    rmSync(directory, { recursive: true, force: true });
  }
}

async function runSetupFailureSelfTest() {
  const directory = mkdtempSync(path.join(tmpdir(), "wargus-plan021-setup-failure-test-"));
  const statusPath = path.join(directory, "status.json");
  const child = spawn(process.execPath, [new URL(import.meta.url).pathname, INTERRUPT_FIXTURE_FLAG], {
    cwd: process.cwd(),
    env: { ...process.env, WARGUS_VISUAL_INTERRUPT_STATUS_PATH: statusPath, WARGUS_VISUAL_INTERRUPT_FORCE_SETUP_FAILURE: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  let ready = null;
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    ready = await waitForStatus(statusPath, "ready", 30_000);
    const [exitCode, exitSignal] = await once(child, "exit");
    assert.equal(exitCode, 1, `Setup-failure fixture must report failure: code=${exitCode} signal=${exitSignal} stderr=${stderr}`);
    assert.equal(exitSignal, null);
    assert.match(stderr, /Injected interruption fixture setup failure/);
    const cleaned = await waitForStatus(statusPath, "cleaned", 5_000);
    assert.equal(cleaned.reason, "fixture-setup-failure");
    assert.equal(cleaned.errors.length, 0, `Setup-failure cleanup errors: ${JSON.stringify(cleaned.errors)}`);
    assert.equal(cleaned.profilesRemoved, true);
    assert.equal(existsSync(ready.profilePath), false);
    await assertFixtureNonProfileResourcesClean(ready, cleaned);
  } finally {
    if (isPidAlive(child.pid)) child.kill("SIGTERM");
    if (ready?.profilePath) rmSync(ready.profilePath, { recursive: true, force: true });
    rmSync(directory, { recursive: true, force: true });
  }
}

async function assertFixtureNonProfileResourcesClean(ready, cleaned) {
  assert.equal(cleaned.baseWorktreeRemoved, true);
  assert.equal(cleaned.lockRemoved, true);
  assert.ok(cleaned.lockReleasedAt);
  assert.equal(existsSync(ready.baseWorktree), false);
  assert.equal(existsSync(ready.lockPath), false);
  assert.equal(isPidAlive(ready.ownedPid), false);
  assert.equal(await isPortOpen(ready.serverPort), false);
  assert.equal(await isPortOpen(ready.debugPort), false);
  assert.equal(cleaned.controllerRecords.length, 1);
  assert.deepEqual(cleaned.controllerRecords[0].residualPids, []);
  assert.deepEqual(cleaned.controllerRecords[0].openPorts, []);
}

async function waitForStatus(statusPath, phase, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const record = JSON.parse(readFileSync(statusPath, "utf8"));
      if (record.phase === phase) return record;
    } catch { }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for interruption fixture phase ${phase}.`);
}

function isPidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
  });
}

async function runInterruptionFixture() {
  const context = validateExecutionContext();
  assert.ok(lifecycle.interruptionStatusPath, "WARGUS_VISUAL_INTERRUPT_STATUS_PATH is required for the interruption fixture.");
  lifecycle.baseWorktree = path.join(context.repositoryRoot, ".worktrees", `task4-visual-interruption-${process.pid}`);
  assert.ok(!existsSync(lifecycle.baseWorktree), `Interruption fixture worktree already exists: ${lifecycle.baseWorktree}`);
  let failure = null;
  try {
    const preflight = capturePreflight(context.repositoryRoot, context.afterWorktree);
    installSignalHandlers();
    lifecycle.lock = acquireCaptureLock(preflight, context.afterHead);
    process.once("exit", () => releaseCaptureLock(lifecycle.lock));
    execFileSync("git", ["-C", context.afterWorktree, "worktree", "add", "--detach", lifecycle.baseWorktree, BASE_COMMIT], { stdio: "ignore" });
    lifecycle.baseCreated = true;
    const controller = new BrowserExecutionController({ name: "plan021-visual-interruption", portCandidates: Array.from({ length: 100 }, (_, index) => 56_800 + index) });
    lifecycle.controllers.add(controller);
    const { serverPort, debugPort } = await controller.allocatePorts();
    await controller.releasePort(serverPort);
    const fixtureServer = controller.spawnOwned(process.execPath, ["-e", `require("http").createServer((_, response) => response.end("fixture")).listen(${serverPort}, "127.0.0.1")`], { stdio: "ignore" });
    await controller.waitForHttp(`http://127.0.0.1:${serverPort}/`);
    const profilePath = mkdtempSync(path.join(tmpdir(), "wargus-plan021-interruption-profile-"));
    lifecycle.profiles.add(profilePath);
    writeFileSync(lifecycle.interruptionStatusPath, `${JSON.stringify({
      phase: "ready",
      pid: process.pid,
      ownedPid: fixtureServer.pid,
      serverPort,
      debugPort,
      baseWorktree: lifecycle.baseWorktree,
      profilePath,
      lockPath: lifecycle.lock.path,
      lockRecord: JSON.parse(readFileSync(lifecycle.lock.path, "utf8"))
    }, null, 2)}\n`, "utf8");
    if (process.env.WARGUS_VISUAL_INTERRUPT_FORCE_SETUP_FAILURE === "1") {
      await new Promise((resolve) => setTimeout(resolve, 250));
      throw new Error("Injected interruption fixture setup failure.");
    }
    await new Promise(() => {});
  } catch (error) {
    failure = error;
  } finally {
    const cleanup = await cleanupLifecycle(failure ? "fixture-setup-failure" : "fixture-finally");
    if (cleanup.errors.length > 0) {
      const cleanupError = new AggregateError(cleanup.errors, "Interruption fixture cleanup failed.");
      failure = failure ? new AggregateError([failure, cleanupError], "Interruption fixture setup and cleanup both failed.") : cleanupError;
    }
  }
  if (failure) throw failure;
}

function writeCapture(directory, label, capture) {
  writeFileSync(path.join(directory, `${label}.png`), capture.png);
  writeFileSync(path.join(directory, `${label}.rgba`), capture.rgba);
  writeJson(directory, `${label}-capture.json`, {
    width: capture.width,
    height: capture.height,
    informativeness: capture.informativeness,
    state: capture.state,
    renderer: capture.renderer,
    process: capture.process,
    controller: capture.controller,
    pngSha256: sha256(capture.png),
    rawRgbaSha256: sha256(capture.rgba)
  });
}

function writeJson(directory, name, value) {
  writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeChecksumManifest(directory) {
  const entries = readdirSync(directory).filter((name) => name !== "sha256.json").sort().map((name) => {
    const file = path.join(directory, name);
    return { path: name, bytes: statSync(file).size, sha256: sha256(readFileSync(file)) };
  });
  const file = path.join(directory, "sha256.json");
  writeFileSync(file, `${JSON.stringify({ schemaVersion: 1, entries }, null, 2)}\n`, "utf8");
  return { file, sha256: sha256(readFileSync(file)) };
}

function assertClean(worktree, label) {
  assert.equal(git(worktree, ["status", "--short"]), "", `${label} must be clean.`);
}

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function errorRecord(error) {
  return { name: error?.name ?? "Error", message: error?.message ?? String(error), stack: error?.stack ?? null };
}

function utcStamp(value) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
