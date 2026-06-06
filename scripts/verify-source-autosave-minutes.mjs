import { readFileSync } from "node:fs";

const stratagusMainLoop = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/stratagus/mainloop.cpp", "utf8");
const stratagusUnit = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/include/unit.h", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const errors = [];
function expect(condition, message) {
  if (!condition) errors.push(message);
}

for (const fragment of [
  "int AutosaveMinutes = 5",
  "Autosave the game every X minutes; autosave is disabled if the value is 0"
]) {
  expect(stratagusUnit.includes(fragment), `Stratagus autosave preference missing fragment: ${fragment}`);
}

for (const fragment of [
  "Preference.AutosaveMinutes != 0",
  "GameCycle > 0",
  "GameCycle % (CYCLES_PER_SECOND * 60 * Preference.AutosaveMinutes)",
  "UI.StatusLine.Set(_(\"Autosave\"))",
  "SaveGame(\"autosave.sav\")"
]) {
  expect(stratagusMainLoop.includes(fragment), `Stratagus autosave loop missing fragment: ${fragment}`);
}

for (const [name, source, fragments] of [
  ["types", typesSource, ["autosaveMinutesDefault: number"]],
  ["world defaults", worldSource, ["autosaveMinutesDefault: 5"]],
  ["indexer", indexSource, [
    "autosaveMinutesDefault: readPreferenceAssignmentNumber(\"AutosaveMinutes\", 5)",
    "autosaveMinutesDefault: 5",
    "if (/Preference\\.AutosaveMinutes\\s*=/.test(source)) engineSettings.autosaveMinutesDefault = parsedEngineSettings.autosaveMinutesDefault"
  ]],
  ["save schema", saveSource, [
    "| \"autosaveMinutesDefault\"",
    "autosaveMinutesDefault: world.engineSettings.autosaveMinutesDefault",
    "world.engineSettings.autosaveMinutesDefault = nonNegativeIntegerOr(record.autosaveMinutesDefault, world.engineSettings.autosaveMinutesDefault)"
  ]],
  ["runtime", mainSource, [
    "function sourceAutosaveIntervalSeconds(loadedWorld: WorldState): number",
    "Math.max(0, Math.floor(loadedWorld.engineSettings.autosaveMinutesDefault)) * 60",
    "const autosaveIntervalSeconds = sourceAutosaveIntervalSeconds(world)",
    "autosaveIntervalSeconds > 0 && autosaveClock >= autosaveIntervalSeconds",
    "if (!titleScreenOpen) {",
    "autosaveClock += deltaSeconds",
    "saveAutosaveForContext(saveCommandContext())"
  ]]
]) {
  for (const fragment of fragments) {
    expect(source.includes(fragment), `${name} missing autosave-minutes fragment: ${fragment}`);
  }
}

expect(!mainSource.includes("AUTOSAVE_INTERVAL_SECONDS"), "Browser runtime should not use a fixed autosave interval.");
expect(JSON.stringify(packageJson.scripts).includes("verify:source-autosave-minutes"), "package.json verify scripts missing verify:source-autosave-minutes.");

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  console.error(`Source autosave minutes verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source autosave minutes verified (Preference.AutosaveMinutes controls browser autosave cadence and zero disables it).");
