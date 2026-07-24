import { readFileSync } from "node:fs";

const mainSource = readFileSync("src/main.ts", "utf8");
const cameraSource = readFileSync("src/view/camera.ts", "utf8");
const cssSource = readFileSync("src/styles.css", "utf8");
const renderHudSource = readFileSync("src/view/renderHud.ts", "utf8");
const readmeSource = readFileSync("README.md", "utf8");
const packageSource = readFileSync("package.json", "utf8");
const packageJson = JSON.parse(packageSource);
const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const runtimeSmokeSource = readFileSync("scripts/verify-browser-runtime-smoke.mjs", "utf8");
const mapLoadSource = readFileSync("scripts/verify-browser-map-loads.mjs", "utf8");
const browserHarnessSource = readFileSync("scripts/browser-smoke-harness.mjs", "utf8");
const errors = [];

function expect(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

for (const fragment of [
  "resizeTo: window",
  "autoDensity: true",
  "resolution: Math.min(window.devicePixelRatio, 2)",
  'window.addEventListener("resize", () => {',
  "syncResponsiveViewport();",
  "function syncResponsiveViewport(): void",
  "clampCameraToWorld(camera, world, playableCameraViewport())",
  "pointerWorldPosition = worldPointForScreenPosition(pointerScreenPosition.x, pointerScreenPosition.y)",
  "function worldPointForScreenPosition(screenX: number, screenY: number)",
  "sourceScreenPointIsInPlayableViewport(event.clientX, event.clientY)",
  "function sourceScreenPointIsInPlayableViewport",
  "sourceMapAreaLocalScreenPoint",
  "updateCameraEdgeScroll(cameraInput, point.x, point.y, playableCameraViewport(), sourceScrollMargins(world), sourceMouseScrollingEnabled(world))",
  "browserSmokeStateEnabled",
  "__WARGUS_TS_SMOKE_STATE__",
  "function publishBrowserSmokeState",
  "__WARGUS_TS_CENTER_FIRST_OWNED_MOVABLE__",
  "firstOwnedMovableScreenPoint",
  "firstSelectedOrderKind",
  "audioContextCreated",
  "audioContextState",
  "audioUnlocked",
  "audioPlayStarts",
  "audioStereoSound"
]) {
  expect(mainSource.includes(fragment), `Main browser viewport handling missing fragment: ${fragment}`);
}

for (const fragment of [
  "world?.engineSettings.videoWidthDefault ?? source.baseWidth",
  "world?.engineSettings.videoHeightDefault ?? source.baseHeight"
]) {
  expect(cameraSource.includes(fragment), `Camera source video-size viewport handling missing fragment: ${fragment}`);
}

for (const fragment of [
  "html,",
  "body,",
  "#app",
  "width: 100%;",
  "height: 100%;",
  "overflow: hidden;",
  "canvas",
  "display: block;",
  "image-rendering: pixelated;",
  'canvas[data-wargus-video-shader="linear"]',
  "image-rendering: auto;",
  'canvas[data-wargus-video-shader="crt"]',
  "filter: contrast(1.08) saturate(1.12) brightness(0.95);"
]) {
  expect(cssSource.includes(fragment), `CSS responsive canvas handling missing fragment: ${fragment}`);
}

for (const fragment of [
  "const keepRatio = world.engineSettings.keepRatioDefault !== false",
  "Math.min(app.screen.width / Math.max(sprite.texture.width, 1), app.screen.height / Math.max(sprite.texture.height, 1))",
  "Math.max(app.screen.width / Math.max(sprite.texture.width, 1), app.screen.height / Math.max(sprite.texture.height, 1))"
]) {
  expect(renderHudSource.includes(fragment), `Source title shell responsive handling missing fragment: ${fragment}`);
}

expect(readmeSource.includes("Native responsive canvas that resizes with the browser."), "README should keep the browser-native responsive canvas requirement visible.");
expect(readmeSource.includes("Headless Chrome smoke verification boots the Vite app"), "README should document the browser runtime smoke gate.");
expect(readmeSource.includes("npm run verify:browser-playable-session"), "README should document the deeper browser playable-session gate.");
expect(readmeSource.includes("npm run verify:browser-command-card-session"), "README should document the browser command-card/menu parity gate.");
expect(readmeSource.includes("npm run verify:browser-harvest-session"), "README should document the browser harvest-session gate.");
expect(readmeSource.includes("npm run verify:browser-combat-session"), "README should document the browser combat-session gate.");
expect(readmeSource.includes("npm run verify:browser-spell-session"), "README should document the browser spell-session gate.");
expect(readmeSource.includes("npm run verify:browser-train-session"), "README should document the browser train-session gate.");
expect(readmeSource.includes("destroys the enemy Great Hall into victory"), "README should document the fixed-demo victory gate.");
expect(readmeSource.includes("npm run verify:browser-production-smoke"), "README should document the production browser smoke gate.");
expect(readmeSource.includes("npm run verify:browser-production"), "README should document the combined production browser gate.");
expect(readmeSource.includes("save/load roundtrips"), "README should document the browser map save/load roundtrip gate.");
expect(packageSource.includes('"verify:browser-runtime-smoke"'), "package.json should expose the browser runtime smoke verifier.");
expect(packageSource.includes('"verify:browser-playable-session"'), "package.json should expose the browser playable-session verifier.");
expect(packageSource.includes('"verify:browser-command-card-session"'), "package.json should expose the browser command-card/menu parity verifier.");
expect(packageSource.includes('"verify:browser-harvest-session"'), "package.json should expose the browser harvest-session verifier.");
expect(packageSource.includes('"verify:browser-combat-session"'), "package.json should expose the browser combat-session verifier.");
expect(packageSource.includes('"verify:browser-spell-session"'), "package.json should expose the browser spell-session verifier.");
expect(packageSource.includes('"verify:browser-train-session"'), "package.json should expose the browser train-session verifier.");
expect(packageSource.includes('"verify:browser-demo-victory"'), "package.json should expose the fixed-demo victory verifier.");
expect(packageSource.includes("npm run verify:browser-demo-victory"), "Browser demo-session verifier should run the fixed-demo victory verifier.");
expect(packageSource.includes('"verify:browser-production-smoke"'), "package.json should expose the production browser runtime smoke verifier.");
expect(packageSource.includes('"verify:browser-runtime-basics"'), "package.json should expose the focused browser basics verifier.");
expect(packageSource.includes('"verify:browser-production"'), "package.json should expose the combined production browser verifier.");
expect(packageSource.includes('"verify:browser-production:all"'), "package.json should expose the exhaustive combined production browser verifier.");
expect(packageSource.includes("WARGUS_BROWSER_SMOKE_SERVER=preview node scripts/verify-browser-runtime-smoke.mjs && WARGUS_BROWSER_SMOKE_SERVER=preview npm run verify:browser-runtime-basics"), "Production browser smoke should run both Plan014 and restored browser basics against Vite preview.");
expect(packageSource.includes("npm run verify:browser-production-smoke && WARGUS_BROWSER_MAP_SERVER=preview node scripts/verify-browser-map-loads.mjs"), "Combined production browser verifier should run production smoke and production map loads without rebuilding twice.");
expect(packageSource.includes("npm run verify:browser-production-smoke && WARGUS_BROWSER_MAP_SERVER=preview WARGUS_BROWSER_MAP_LOADS=all node scripts/verify-browser-map-loads.mjs"), "Exhaustive combined production browser verifier should run production smoke and all production map loads without rebuilding twice.");
expect(runtimeSmokeSource.includes('const SERVER_MODE = process.env.WARGUS_BROWSER_SMOKE_SERVER === "preview" ? "preview" : "dev"'), "Browser runtime smoke should support production preview mode.");
expect(runtimeSmokeSource.includes('...(SERVER_MODE === "preview" ? ["preview"] : [])'), "Browser runtime smoke should pass the preview subcommand to Vite only in production mode.");
expect(packageJson.devDependencies?.playwright === "1.61.1", "package.json should pin the installed Playwright verifier runtime.");
expect(packageLock.packages?.[""]?.devDependencies?.playwright === "1.61.1", "The lockfile root should pin the Playwright verifier runtime.");
expect(packageLock.packages?.["node_modules/playwright"]?.version === "1.61.1", "The lockfile should resolve the pinned Playwright verifier runtime.");
expect(packageSource.includes('"verify:browser-map-loads"'), "package.json should expose the browser map-load verifier.");
expect(packageSource.includes('"verify:browser-map-loads:all"'), "package.json should expose the exhaustive browser map-load verifier.");
expect(packageSource.includes('"verify:browser-production-map-loads"'), "package.json should expose the production browser map-load verifier.");
expect(packageSource.includes('"verify:browser-production-map-loads:all"'), "package.json should expose the exhaustive production browser map-load verifier.");
expect(mapLoadSource.includes('const serverMode = process.env.WARGUS_BROWSER_MAP_SERVER === "preview" ? "preview" : "dev"'), "Browser map-load verifier should support production preview mode.");
expect(readmeSource.includes("npm run verify:browser-map-loads:all"), "README should document the exhaustive browser map-load command.");
expect(readmeSource.includes("npm run verify:browser-production-map-loads"), "README should document the production browser map-load command.");
expect(readmeSource.includes("npm run verify:browser-production-map-loads:all"), "README should document the exhaustive production browser map-load command.");
expect(readmeSource.includes("npm run verify:browser-production:all"), "README should document the exhaustive combined production browser command.");
expect(packageSource.includes("npm run verify:browser-runtime-smoke && npm run verify:browser-playable-session && npm run verify:browser-demo-session && npm run verify:browser-command-card-session && npm run verify:browser-harvest-session && npm run verify:browser-combat-session && npm run verify:browser-spell-session && npm run verify:browser-train-session && npm run verify:browser-map-loads && npm run verify:browser-production && npm run verify:browser-native-viewport"), "Full verify should run fixed-demo, command-card/menu parity, dev playable/economy/combat/spells/production, dev/production browser runtime/map-load smoke gates before static viewport checks.");
for (const scriptName of [
  "verify:modern-hud-layout",
  "verify:resource-return-black-fog",
  "verify:playtest-telemetry",
  "verify:fixed-demo-unit-portrait"
]) {
  expect(packageSource.includes(`npm run ${scriptName}`), `Full verify should include ${scriptName}.`);
}

expect(runtimeSmokeSource.includes('await import("playwright")'), "Browser runtime smoke should load its declared Playwright dependency directly.");
expect(runtimeSmokeSource.includes("process.env.CHROME_BIN ?? chromium.executablePath()"), "Browser runtime smoke should resolve Chromium portably while retaining an explicit override.");
expect(!runtimeSmokeSource.includes("/home/halla/"), "Browser runtime smoke must not contain Halla-specific executable paths.");
expect(!runtimeSmokeSource.includes("PLAYWRIGHT_MODULE"), "Browser runtime smoke should be self-contained after npm install.");
expect(mapLoadSource.includes('from "./browser-smoke-harness.mjs"'), "Browser map-load smoke should use the shared browser smoke harness.");
expect(browserHarnessSource.includes("globalThis.process.kill(-child.pid, \"SIGTERM\")"), "Browser smoke harness process cleanup should terminate the child process group with SIGTERM.");
expect(browserHarnessSource.includes("globalThis.process.kill(-child.pid, \"SIGKILL\")"), "Browser smoke harness process cleanup should terminate the child process group with SIGKILL.");
expect(!mapLoadSource.includes("function waitForHttp"), "Browser map-load smoke should rely on the shared harness waitForHttp helper.");
expect(!mapLoadSource.includes("function connectDevTools"), "Browser map-load smoke should rely on the shared harness DevTools helper.");
expect(!mapLoadSource.includes("async function stopProcess"), "Browser map-load smoke should rely on the shared harness process cleanup helper.");
expect(!browserHarnessSource.includes("async function stopProcess(process)"), "Browser smoke harness should avoid shadowing the Node process global.");
expect(!browserHarnessSource.includes("process.kill(-process.pid"), "Browser smoke harness should not call process-group kill through a shadowed child variable.");

for (const fragment of [
  "?smoke=1&demoSeed=ai-staged-pressure",
  'MODE === "basics"',
  "page.screenshot",
  "page.keyboard.press",
  "page.mouse.click",
  "selectedUnitCount",
  "audioContextCreated",
  "audioPlayStarts",
  'audioContextState === "running"',
  "audioCurrentMusic",
  "__WARGUS_TS_PLAY_AUDIO_FIXTURE__",
  "__WARGUS_TS_PLAYTEST_LOG__",
  "__WARGUS_TS_CENTER_FIRST_OWNED_MOVABLE__",
  "firstOwnedMovableScreenPoint",
  "firstSelectedOrderKind",
  "sameScreenshotStats(result?.inputStats, result?.commandStats)",
  "pngColorStats",
  "processTreePids",
  "stopExactPids",
  "isPortOpen",
  "Browser runtime smoke verified"
]) {
  expect(runtimeSmokeSource.includes(fragment), `Browser runtime smoke verifier missing fragment: ${fragment}`);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Browser-native viewport verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Browser-native viewport verified (responsive canvas, resize sync, source keep-ratio title shell).");
