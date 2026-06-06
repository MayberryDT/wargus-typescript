import { readFileSync } from "node:fs";

const main = readFileSync("src/main.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");

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
expect(packageSource, "\"verify:playtest-telemetry\": \"node scripts/verify-playtest-telemetry.mjs\"", "Package scripts should include the playtest telemetry verifier.");

console.log("Playtest telemetry hooks verified.");
