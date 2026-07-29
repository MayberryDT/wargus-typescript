import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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
const PLAN021_COMMIT = "84a12df804e655ae38a953c0f5fd6e0c88ea2d0d";
const CHROME_BIN = "/usr/bin/google-chrome";
const PROFILE = "combat-100";
const FIXED_TICK = 0;
const VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 };
const ALLOWED_GATE_FILES = [
  "package.json",
  "scripts/verify-render-visual-parity.mjs",
  "scripts/verify-wargus-assets.mjs"
];

const afterWorktree = process.cwd();
const afterHead = git(afterWorktree, ["rev-parse", "HEAD"]);
const afterParent = git(afterWorktree, ["rev-parse", "HEAD^"]);
assert.equal(afterParent, PLAN021_COMMIT, "Visual parity must run from the reviewed Plan 021 commit plus one coordinator-only gate commit.");
assert.deepEqual(
  git(afterWorktree, ["diff", "--name-only", `${PLAN021_COMMIT}..${afterHead}`]).split("\n").filter(Boolean).sort(),
  ALLOWED_GATE_FILES,
  "The staging commit must contain only the coordinator Task 4 gate files."
);
assertClean(afterWorktree, "Plan 021 gate staging worktree");
assert.equal(process.getuid?.(), 1000, "Visual parity must run as the Halla project user.");
assert.equal(execFileSync("hostname", { encoding: "utf8" }).trim(), "halla");
assert.equal(path.resolve(CHROME_BIN), CHROME_BIN);
assert.ok(existsSync(CHROME_BIN) && statSync(CHROME_BIN).isFile(), `System Chrome is missing: ${CHROME_BIN}`);

const repositoryRoot = path.dirname(git(afterWorktree, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
const baseWorktree = path.join(repositoryRoot, ".worktrees", `task4-visual-base-${process.pid}`);
assert.ok(!existsSync(baseWorktree), `Disposable base worktree already exists: ${baseWorktree}`);

const preflight = preflightArtifactRoot({
  artifactWorkspace: process.env.WARGUS_ARTIFACT_WORKSPACE ?? `${repositoryRoot}-retained-artifacts`,
  artifactRoot: process.env.WARGUS_ARTIFACT_ROOT ?? path.join(`${repositoryRoot}-retained-artifacts`, ".artifacts"),
  disposableWorktree: afterWorktree,
  preservationOwner: "wave2-recovery-task4"
});
const stamp = process.env.WARGUS_VISUAL_ARTIFACT_STAMP ?? utcStamp(new Date());
assert.match(stamp, /^\d{8}T\d{6}Z$/, "Artifact stamp must be a UTC basic timestamp.");
const artifact = createArtifactDirectory({ preflight, plan: "021", commit: PLAN021_COMMIT, stamp });
const visualDirectory = path.join(artifact.directory, "visual-parity");
assert.ok(!existsSync(visualDirectory), `Visual artifact directory must be fresh: ${visualDirectory}`);
mkdirSync(visualDirectory);

let baseCreated = false;
let failure = null;
try {
  execFileSync("git", ["-C", afterWorktree, "worktree", "add", "--detach", baseWorktree, BASE_COMMIT], { stdio: "inherit" });
  baseCreated = true;
  assert.equal(git(baseWorktree, ["rev-parse", "HEAD"]), BASE_COMMIT);
  assertClean(baseWorktree, "pre-Plan021 base worktree");

  const resourceBefore = collectHostMetrics(afterWorktree);
  const base = await capture("base", baseWorktree, 56_200);
  const after = await capture("after", afterWorktree, 56_400);
  const resourceAfter = collectHostMetrics(afterWorktree);

  const comparison = compareCaptures(base, after);
  writeCapture("base", base);
  writeCapture("after", after);
  writeJson("comparison.json", comparison);
  writeJson("resource.json", { before: resourceBefore, after: resourceAfter });
  writeJson("packet.json", {
    schemaVersion: 1,
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
    comparison,
    controller: {
      base: base.controller,
      after: after.controller
    }
  });
  const manifest = writeChecksumManifest();

  assert.equal(comparison.exactEquality, true, `Visual parity failed: ${JSON.stringify(comparison)}`);
  console.log(`Render visual parity verified (${PROFILE} tick ${FIXED_TICK}, ${VIEWPORT.width}x${VIEWPORT.height} DPR ${VIEWPORT.deviceScaleFactor}, exact pixels; ${artifact.logicalPath}/visual-parity; sha256 ${manifest.sha256}).`);
} catch (error) {
  failure = error;
  try { writeChecksumManifest(); } catch { /* Preserve every artifact available at failure. */ }
} finally {
  if (baseCreated) {
    execFileSync("git", ["-C", afterWorktree, "worktree", "remove", "--force", baseWorktree], { stdio: "inherit" });
  }
}
if (failure) throw failure;

async function capture(label, worktree, firstPort) {
  const controller = new BrowserExecutionController({
    name: `plan021-visual-${label}`,
    portCandidates: Array.from({ length: 180 }, (_, index) => firstPort + index)
  });
  const { serverPort, debugPort } = await controller.allocatePorts();
  const profilePath = mkdtempSync(path.join(tmpdir(), `wargus-plan021-${label}-chrome-`));
  let client = null;
  let server = null;
  let chrome = null;
  let captureResult = null;
  let captureError = null;
  try {
    await controller.releasePort(serverPort);
    const viteBin = path.join(afterWorktree, "node_modules", "vite", "bin", "vite.js");
    server = controller.spawnOwned(process.execPath, [
      viteBin,
      "--host", "127.0.0.1",
      "--port", String(serverPort),
      "--strictPort"
    ], { cwd: worktree, stdio: "ignore" });
    const pageUrl = `http://127.0.0.1:${serverPort}/?smoke=1&perfProfile=${PROFILE}`;
    await controller.waitForHttp(pageUrl);
    const manifestResponse = await fetch(`http://127.0.0.1:${serverPort}/wargus/manifest.json`);
    assert.equal(manifestResponse.status, 200, "Critical Wargus manifest route must return HTTP 200.");

    chrome = await controller.startChrome({
      chromeBin: CHROME_BIN,
      debugPort,
      profilePath,
      extraArgs: [
        "--use-gl=angle",
        "--use-angle=vulkan",
        "--enable-features=Vulkan",
        "--disable-vulkan-surface",
        "--enable-gpu",
        "--ignore-gpu-blocklist",
        "--enable-gpu-rasterization",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-background-networking",
        "--disable-extensions",
        "--force-device-scale-factor=1",
        "--hide-scrollbars",
        "--no-proxy-server",
        `--window-size=${VIEWPORT.width},${VIEWPORT.height}`
      ]
    });
    await controller.waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);
    const target = await waitForPageTarget(`http://127.0.0.1:${debugPort}/json/list`, 10_000);
    client = await connectDevTools(target.webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      deviceScaleFactor: VIEWPORT.deviceScaleFactor,
      mobile: false
    });
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: pauseAtProfileTickZeroSource() });
    await client.send("Page.navigate", { url: pageUrl });
    await waitForExpression(client, readyExpression(), 45_000);
    await client.send("Page.bringToFront");
    await controller.runCapture({
      readFrame: async () => {
        const value = await evalValue(client, "new Promise((resolve) => requestAnimationFrame((timestamp) => resolve({ rafAdvanced: Number.isFinite(timestamp) })))");
        return value;
      },
      shouldStop: (_frame, frames) => frames >= 2,
      intervalMs: 0
    });

    const browserVersion = await client.send("Browser.getVersion");
    const frame = await evalValue(client, captureExpression());
    assert.ok(frame?.pngBase64 && frame?.rgbaBase64, `${label} canvas capture returned no pixels.`);
    const png = Buffer.from(frame.pngBase64, "base64");
    const rgba = Buffer.from(frame.rgbaBase64, "base64");
    assert.equal(rgba.length, frame.width * frame.height * 4, `${label} raw RGBA length mismatch.`);
    assert.equal(frame.state.profile, PROFILE);
    assert.equal(frame.state.tick, FIXED_TICK);
    assert.equal(frame.state.paused, true);
    assert.equal(frame.state.viewport.width, VIEWPORT.width);
    assert.equal(frame.state.viewport.height, VIEWPORT.height);
    assert.equal(frame.state.devicePixelRatio, VIEWPORT.deviceScaleFactor);
    const renderer = qualifyRenderer({
      renderer: frame.renderer.unmaskedRenderer,
      focused: frame.state.focused,
      visibility: frame.state.visibility,
      rafAdvanced: true,
      executable: CHROME_BIN,
      version: browserVersion.product,
      gpu: { device: frame.renderer.unmaskedRenderer, driver: frame.renderer.version },
      viewport: frame.state.viewport
    });
    captureResult = {
      png,
      rgba,
      width: frame.width,
      height: frame.height,
      state: frame.state,
      renderer: {
        ...renderer,
        vendor: frame.renderer.unmaskedVendor,
        glVersion: frame.renderer.version,
        shadingLanguageVersion: frame.renderer.shadingLanguageVersion,
        browser: browserVersion
      },
      process: { serverPid: server.pid, chromePid: chrome.pid, serverPort, debugPort }
    };
  } catch (error) {
    captureError = error;
  } finally {
    try { client?.close(); } catch { /* Exact PID cleanup follows. */ }
    try {
      const cleanup = await controller.cleanup();
      if (captureResult) {
        captureResult.controller = { allocationLedger: controller.allocationLedger, lifecycleLedger: controller.lifecycleLedger, cleanup };
      }
    } catch (cleanupError) {
      captureError ??= cleanupError;
    }
    rmSync(profilePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
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
      } catch { /* The module has not finished installing its smoke hooks. */ }
    }, 1);
  })();`;
}

function readyExpression() {
  return `(() => {
    const state = window.__WARGUS_TS_SMOKE_STATE__;
    const summary = window.__WARGUS_TS_PERF_SUMMARY__?.();
    const canvas = document.querySelector("canvas");
    return Boolean(window.__WARGUS_VISUAL_PAUSE_REQUESTED__)
      && state?.worldLoaded === true
      && state?.loadingVisible === false
      && state?.paused === true
      && state?.titleScreenOpen === false
      && state?.briefingOpen === false
      && summary?.profile === ${JSON.stringify(PROFILE)}
      && summary?.worldTick === ${FIXED_TICK}
      && summary?.entityCounts?.units >= 100
      && summary?.entityCounts?.projectiles > 0
      && summary?.entityCounts?.spellEffects > 0
      && canvas?.width === ${VIEWPORT.width}
      && canvas?.height === ${VIEWPORT.height};
  })()`;
}

function captureExpression() {
  return `(() => {
    const source = document.querySelector("canvas");
    const copy = document.createElement("canvas");
    copy.width = source.width;
    copy.height = source.height;
    const context = copy.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, 0, 0);
    const bytes = context.getImageData(0, 0, copy.width, copy.height).data;
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    }
    const gl = source.getContext("webgl2") || source.getContext("webgl");
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const smoke = window.__WARGUS_TS_SMOKE_STATE__;
    const summary = window.__WARGUS_TS_PERF_SUMMARY__();
    return {
      width: copy.width,
      height: copy.height,
      pngBase64: copy.toDataURL("image/png").split(",")[1],
      rgbaBase64: btoa(binary),
      renderer: {
        unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        unmaskedVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        version: gl.getParameter(gl.VERSION),
        shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
      },
      state: {
        profile: summary.profile,
        tick: summary.worldTick,
        paused: smoke.paused,
        camera: smoke.camera,
        ui: {
          activeMapPath: smoke.activeMapPath,
          titleScreenOpen: smoke.titleScreenOpen,
          briefingOpen: smoke.briefingOpen,
          selectedUnitIds: smoke.selectedUnitIds,
          commandPage: smoke.commandPage
        },
        entityCounts: summary.entityCounts,
        viewport: summary.viewport,
        devicePixelRatio: window.devicePixelRatio,
        focused: document.hasFocus(),
        visibility: document.visibilityState
      }
    };
  })()`;
}

function compareCaptures(base, after) {
  assert.deepEqual(after.state, base.state, "Fixed profile/tick/camera/UI/viewport state drifted between captures.");
  assert.deepEqual(after.renderer, base.renderer, "Browser/GPU/renderer identity drifted between captures.");
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
    changedPixelCount,
    maximumChannelDelta,
    exactEquality: dimensionsEqual
      && basePngSha256 === afterPngSha256
      && baseRawSha256 === afterRawSha256
      && changedPixelCount === 0
      && maximumChannelDelta === 0
  };
}

function writeCapture(label, capture) {
  writeFileSync(path.join(visualDirectory, `${label}.png`), capture.png);
  writeFileSync(path.join(visualDirectory, `${label}.rgba`), capture.rgba);
  writeJson(`${label}-capture.json`, {
    width: capture.width,
    height: capture.height,
    state: capture.state,
    renderer: capture.renderer,
    process: capture.process,
    controller: capture.controller,
    pngSha256: sha256(capture.png),
    rawRgbaSha256: sha256(capture.rgba)
  });
}

function writeJson(name, value) {
  writeFileSync(path.join(visualDirectory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeChecksumManifest() {
  const entries = readdirSync(visualDirectory).filter((name) => name !== "sha256.json").sort().map((name) => {
    const file = path.join(visualDirectory, name);
    return { path: name, bytes: statSync(file).size, sha256: sha256(readFileSync(file)) };
  });
  const file = path.join(visualDirectory, "sha256.json");
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

function utcStamp(value) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
