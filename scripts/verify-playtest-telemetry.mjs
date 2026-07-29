import { readFileSync } from "node:fs";

const main = readFileSync("src/main.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");
const displayObjectPerformance = readFileSync("src/performance/displayObjectPerformance.ts", "utf8");
const renderSources = ["src/main.ts", "src/view/renderWorld.ts", "src/view/renderHud.ts", "src/view/renderOverlays.ts"].map((path) => readFileSync(path, "utf8")).join("\n");

function expect(source, needle, message) {
  if (!source.includes(needle)) {
    throw new Error(message);
  }
}

expect(main, "PLAYTEST_TELEMETRY_STORAGE_KEY", "Playtest telemetry should persist to localStorage.");
expect(main, "type PlaytestTelemetryEntry", "Playtest telemetry should use structured entries.");
expect(main, "recordPlaytestTelemetry(performance.now())", "The main frame loop should record playtest telemetry.");
expect(main, "__WARGUS_TS_PLAYTEST_LOG__", "Playtest telemetry should expose a browser log hook.");
expect(main, "__WARGUS_TS_EXPORT_PLAYTEST_LOG__", "Playtest telemetry should expose a JSON export hook.");
expect(main, "__WARGUS_TS_CLEAR_PLAYTEST_LOG__", "Playtest telemetry should expose a clear hook.");
expect(main, "playtestTelemetryJankReasons", "Playtest telemetry should capture jank reasons.");
expect(main, "playtestTelemetryFogCounts", "Playtest telemetry should include fog visibility counts.");
expect(main, "PLAYTEST_TELEMETRY_MAX_ENTRIES", "Playtest telemetry should be bounded.");
expect(main, "runtimePerformance: runtimePerformanceTelemetry()", "Playtest and smoke telemetry should include compact tail distributions and scheduler diagnostics.");
expect(main, "runtimeSearchParams.get(\"smoke\") === \"1\"", "Performance profiles must require the exact smoke=1 URL gate.");
expect(main, "__WARGUS_TS_PERF_START__", "Performance capture should expose a start hook.");
expect(main, "__WARGUS_TS_PERF_STOP__", "Performance capture should expose a stop hook.");
expect(main, "__WARGUS_TS_PERF_SUMMARY__", "Performance capture should expose a summary hook.");
expect(main, "__WARGUS_TS_PERF_RESET__", "Performance capture should expose a reset hook.");
expect(main, "__WARGUS_TS_PERF_ACTION__", "Command profile capture should expose a strict smoke-only production action hook.");
expect(main, "runtimePerformanceCollector.completeRenderPreparation(performance.now())", "Input-to-next-render timing must settle only after render preparation completes.");
expect(main, "const selectionHotkeyInputToken = runtimePerformanceCollector.beginInput(performance.now())", "Real selection hotkeys must begin an input-to-command and next-render sample.");
expect(main, "runtimePerformanceCollector.finishInput(selectionHotkeyInputToken, performance.now())", "Real selection hotkeys must finish their input-to-command sample.");
expect(main, "entry.startTime >= performanceCaptureStartedAt", "Long-task capture must reject stale observer entries.");
expect(main, "world.aiStates = []", "Performance profiles should neutralize ambient AI.");
expect(main, "world.victoryRequirements = []", "Performance profiles should neutralize ambient victory triggers.");
expect(displayObjectPerformance, "instrumented-pixi-scene-objects-textures-excluded", "Summaries should label tracked display-object counter scope honestly.");
expect(displayObjectPerformance, "if (captureActive) created += displayObjectTreeSize(object)", "Display creation instrumentation should be one capture-gated counter check, not a per-object closure.");
if (/new (?:Container|Graphics|Sprite|Text)\(/.test(renderSources)) throw new Error("Scoped render paths must use capture-gated tracked constructors.");
if ((renderSources.match(/createWargusBitmapText\(/g) ?? []).length !== 2 || (renderSources.match(/recordTrackedCreation\(createWargusBitmapText\(/g) ?? []).length !== 2) throw new Error("Both bitmap-text scene-object factories must be tracked.");
expect(main, "executeHudCommand(\"attack-move\", { shiftKey: true })", "The deterministic action hook must include queued attack-move through the HUD seam.");
expect(packageSource, "\"verify:playtest-telemetry\": \"node scripts/verify-playtest-telemetry.mjs\"", "Package scripts should include the playtest telemetry verifier.");
expect(packageSource, "\"verify:performance-metrics\": \"node scripts/verify-performance-metrics.mjs\"", "Package scripts should include the performance metrics verifier.");

console.log("Playtest telemetry hooks verified.");
