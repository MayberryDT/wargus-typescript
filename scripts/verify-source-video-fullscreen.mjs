import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const renderHudSource = readFileSync("src/view/renderHud.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const mapCommandsSource = readFileSync("src/view/mapCommands.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const readmeSource = readFileSync("README.md", "utf8");
const errors = [];

function expect(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

expect(manifest.engineSettings?.videoFullScreenDefault === false, `Manifest should preserve Wargus VideoFullScreen=false, found ${manifest.engineSettings?.videoFullScreenDefault}.`);

for (const [name, source, fragments] of [
  ["indexer", indexSource, [
    'videoFullScreenDefault: readPreferenceBool("VideoFullScreen", false)',
    "engineSettings.videoFullScreenDefault ||= parsedEngineSettings.videoFullScreenDefault"
  ]],
  ["types", typesSource, [
    "videoFullScreenDefault: boolean;"
  ]],
  ["world", worldSource, [
    "videoFullScreenDefault: false"
  ]],
  ["HUD command type", renderHudSource, [
    '"toggle-fullscreen"'
  ]],
  ["source UI helpers", sourceUiHelpersSource, [
    'Fullscreen: ${world.engineSettings.videoFullScreenDefault ? "enabled" : "disabled"}',
    '{ label: "Fullscreen", command: "toggle-fullscreen" }'
  ]],
  ["map commands", mapCommandsSource, [
    'command === "toggle-fullscreen"',
    "context.world.engineSettings.videoFullScreenDefault = nextFullscreen",
    "document.documentElement.requestFullscreen()",
    "document.exitFullscreen()",
    "Fullscreen is unavailable in this browser context."
  ]],
  ["save/load", saveSource, [
    '| "videoFullScreenDefault"',
    "videoFullScreenDefault: world.engineSettings.videoFullScreenDefault",
    "world.engineSettings.videoFullScreenDefault = booleanOr(record.videoFullScreenDefault, world.engineSettings.videoFullScreenDefault)"
  ]]
]) {
  for (const fragment of fragments) {
    expect(source.includes(fragment), `${name} missing source fullscreen fragment: ${fragment}`);
  }
}

expect(readmeSource.includes("VideoFullScreen") && readmeSource.includes("toggle through the browser Fullscreen API"), "README should document source VideoFullScreen browser toggle support.");

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source video fullscreen verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source video fullscreen verified (indexed preference, browser Fullscreen API toggle, save/load).");
