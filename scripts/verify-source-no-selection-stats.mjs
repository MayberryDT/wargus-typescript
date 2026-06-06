import { readFileSync } from "node:fs";

const stratagusMainScreen = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/ui/mainscr.cpp", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const errors = [];
function expect(condition, message) {
  if (!condition) errors.push(message);
}

for (const fragment of [
  "static void InfoPanel_draw_no_selection()",
  "if (Preference.ShowNoSelectionStats)",
  "label.Draw(x, y, \"Stratagus\")",
  "label.Draw(x, y,  _(\"Cycle:\"))",
  "PlayerMax - 1"
]) {
  expect(stratagusMainScreen.includes(fragment), `Stratagus no-selection stats source missing fragment: ${fragment}`);
}

for (const [name, source, fragments] of [
  ["types", typesSource, ["showNoSelectionStatsDefault: boolean"]],
  ["world defaults", worldSource, ["showNoSelectionStatsDefault: true"]],
  ["indexer", indexSource, [
    "showNoSelectionStatsDefault: readPreferenceAssignmentBool(\"ShowNoSelectionStats\", true)",
    "if (/Preference\\.ShowNoSelectionStats\\s*=/.test(source)) engineSettings.showNoSelectionStatsDefault = parsedEngineSettings.showNoSelectionStatsDefault"
  ]],
  ["save schema", saveSource, [
    "| \"showNoSelectionStatsDefault\"",
    "showNoSelectionStatsDefault: world.engineSettings.showNoSelectionStatsDefault",
    "world.engineSettings.showNoSelectionStatsDefault = booleanOr(record.showNoSelectionStatsDefault, world.engineSettings.showNoSelectionStatsDefault)"
  ]],
  ["HUD render", hudSource, [
    "const showNoSelectionStats = selected !== null || world.engineSettings.showNoSelectionStatsDefault",
    "...(showNoSelectionStats ? [",
    "idleWorkerSummary(world)",
    "controlGroupSummary(controlGroups, world)",
    "`Tick ${world.tick}`"
  ]]
]) {
  for (const fragment of fragments) {
    expect(source.includes(fragment), `${name} missing no-selection stats fragment: ${fragment}`);
  }
}

expect(JSON.stringify(packageJson.scripts).includes("verify:source-no-selection-stats"), "package.json verify scripts missing verify:source-no-selection-stats.");

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  console.error(`Source no-selection stats verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source no-selection stats verified (Preference.ShowNoSelectionStats gates idle info-panel stats).");
