import { readFileSync } from "node:fs";

const stratagusSdlSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/video/sdl.cpp", "utf8");
const stratagusUnitSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/include/unit.h", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const helpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const mapCommandsSource = readFileSync("src/view/mapCommands.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const errors = [];
function expect(condition, message) {
  if (!condition) errors.push(message);
}

for (const fragment of [
  "int FrameSkip = 0",
  "Mask used to skip rendering frames"
]) {
  expect(stratagusUnitSource.includes(fragment), `Stratagus preference source missing FrameSkip fragment: ${fragment}`);
}

for (const fragment of [
  "++FrameCounter",
  "Preference.FrameSkip && (FrameCounter & Preference.FrameSkip)",
  "return",
  "SDL_RenderPresent(TheRenderer)"
]) {
  expect(stratagusSdlSource.includes(fragment), `Stratagus SDL renderer missing FrameSkip fragment: ${fragment}`);
}

for (const [name, source, fragments] of [
  ["types", typesSource, ["frameSkipDefault: number"]],
  ["world defaults", worldSource, ["frameSkipDefault: 0"]],
  ["indexer", indexSource, [
    "frameSkipDefault: readPreferenceNumber(\"FrameSkip\", 0)",
    "frameSkipDefault: 0",
    "if (parsedEngineSettings.frameSkipDefault >= 0) engineSettings.frameSkipDefault = parsedEngineSettings.frameSkipDefault"
  ]],
  ["save schema", saveSource, [
    "| \"frameSkipDefault\"",
    "frameSkipDefault: world.engineSettings.frameSkipDefault",
    "world.engineSettings.frameSkipDefault = sourceFrameSkipOr(record.frameSkipDefault, world.engineSettings.frameSkipDefault)",
    "function sourceFrameSkipOr"
  ]],
  ["main loop", mainSource, [
    "let sourceRenderedFrameCounter = 0",
    "if (!sourceShouldRenderFrame(world))",
    "publishBrowserSmokeState();",
    "function sourceShouldRenderFrame(loadedWorld: WorldState): boolean",
    "sourceRenderedFrameCounter = (sourceRenderedFrameCounter + 1) >>> 0",
    "loadedWorld.engineSettings.frameSkipDefault",
    "return frameSkip === 0 || (sourceRenderedFrameCounter & frameSkip) === 0"
  ]],
  ["preferences menu", helpersSource, [
    "Frame skip mask: ${Math.round(world.engineSettings.frameSkipDefault)}",
    "{ label: \"Frame -\", command: \"frame-skip-down\" }",
    "{ label: \"Frame +\", command: \"frame-skip-up\" }"
  ]],
  ["HUD command type", hudSource, ["\"frame-skip-down\"", "\"frame-skip-up\""]],
  ["map commands", mapCommandsSource, [
    "command === \"frame-skip-down\" || command === \"frame-skip-up\"",
    "context.world.engineSettings.frameSkipDefault = steppedSourceFrameSkip",
    "function steppedSourceFrameSkip"
  ]]
]) {
  for (const fragment of fragments) {
    expect(source.includes(fragment), `${name} missing FrameSkip fragment: ${fragment}`);
  }
}

const skipIndex = mainSource.indexOf("if (!sourceShouldRenderFrame(world))");
const simulateIndex = mainSource.indexOf("simulateWorld(world, deltaSeconds * sourceRuntimeGameSpeedMultiplier");
const renderIndex = mainSource.indexOf("renderWorld({ world, manifest");
expect(simulateIndex >= 0 && skipIndex > simulateIndex, "FrameSkip guard must run after simulation so logic is not skipped.");
expect(renderIndex >= 0 && skipIndex < renderIndex, "FrameSkip guard must run before renderWorld so rendering is skipped.");
expect(JSON.stringify(packageJson.scripts).includes("verify:source-frame-skip"), "package.json verify scripts missing verify:source-frame-skip.");

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  console.error(`Source FrameSkip verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source FrameSkip verified (Preference.FrameSkip skips browser rendering frames without skipping simulation).");
