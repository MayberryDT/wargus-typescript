import { readFileSync } from "node:fs";

const sourceRoot = `${process.env.WARGUS_ORIGINAL_STRATAGUS_SOURCE ?? "/home/halla/workspaces/Wargus-TypeScript-artifacts/original-stratagus"}/src`;
const sourceUnitHeader = readFileSync(`${sourceRoot}/include/unit.h`, "utf8");
const sourceSettingsHeader = readFileSync(`${sourceRoot}/include/settings.h`, "utf8");
const sourceAiResource = readFileSync(`${sourceRoot}/ai/ai_resource.cpp`, "utf8");
const sourceAiPlan = readFileSync(`${sourceRoot}/ai/ai_plan.cpp`, "utf8");

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const packageSource = readFileSync("package.json", "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const menuSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const mapCommandsSource = readFileSync("src/view/mapCommands.ts", "utf8");
const engineSettingsVerifierSource = readFileSync("scripts/verify-source-engine-settings.mjs", "utf8");
const saveSchemaVerifierSource = readFileSync("scripts/verify-save-schema.mjs", "utf8");
const menuVerifierSource = readFileSync("scripts/verify-source-menu-buttons.mjs", "utf8");

const errors = [];

function expect(source, fragment, message) {
  if (!source.includes(fragment)) {
    errors.push(message ?? `Missing fragment: ${fragment}`);
  }
}

for (const [name, source, fragments] of [
  ["unit.h", sourceUnitHeader, [
    "s.AiExplores = AiExplores",
    "bool AiExplores = true",
    "GameSettings.AiExplores = v"
  ]],
  ["settings.h", sourceSettingsHeader, [
    "unsigned AiExplores:1",
    "AiExplores = 1"
  ]],
  ["ai_resource.cpp", sourceAiResource, [
    "void AiExplore",
    "if (!GameSettings.AiExplores)",
    "AiPlayer->FirstExplorationRequest.insert"
  ]],
  ["ai_plan.cpp", sourceAiPlan, [
    "void AiSendExplorers()",
    "AiPlayer->FirstExplorationRequest.clear()"
  ]]
]) {
  for (const fragment of fragments) {
    expect(source, fragment, `Stratagus ${name} missing AiExplores fragment: ${fragment}`);
  }
}

for (const [name, source, fragments] of [
  ["types", typesSource, ["aiExploresDefault: boolean"]],
  ["world", worldSource, [
    "aiExploresDefault: true",
    "exploredTilesByPlayer: Uint8Array[]",
    "function markExploredTilesForPlayer",
    "world.tick >= state.nextExplorationUpdateTick",
    "state.nextExplorationUpdateTick = world.tick + world.tickRate",
    "exploredTiles: exploredTilesByPlayer[playablePlayerId]"
  ]],
  ["indexer", indexSource, [
    "aiExploresDefault: readPreferenceBool(\"AiExplores\", true)",
    "aiExploresDefault: true",
    "engineSettings.aiExploresDefault &&= parsedEngineSettings.aiExploresDefault"
  ]],
  ["save", saveSource, [
    "| \"aiExploresDefault\"",
    "aiExploresDefault: world.engineSettings.aiExploresDefault",
    "world.engineSettings.aiExploresDefault = booleanOr",
    "exploredTilesByPlayer?: number[][]",
    "world.exploredTilesByPlayer.map",
    "normalizeExploredTilesByPlayer",
    "buffers[world.visibilityPlayer]",
    "world.exploredTiles = world.exploredTilesByPlayer[world.visibilityPlayer]",
    "nextExplorationUpdateTick",
    "nextScoutTick"
  ]],
  ["orders", ordersSource, [
    "function sendAiScoutFlyers",
    "!world.engineSettings.aiExploresDefault",
    "player?.playerType !== \"person\" && !world.engineSettings.aiExploresDefault",
    "issueExploreOrder(world, unit.id)",
    "sourceExploredTilesForPlayer(world, unit.player)",
    "world.exploredTilesByPlayer[playerId]",
    "world.tick < state.nextScoutTick",
    "state.nextScoutTick = world.tick + sourceOrderRetryTicks(world, 5 * 30)"
  ]],
  ["menu", menuSource, [
    "AI explores:",
    "toggle-ai-explores"
  ]],
  ["map commands", mapCommandsSource, [
    "toggle-ai-explores",
    "aiExploresDefault = !context.world.engineSettings.aiExploresDefault"
  ]],
  ["engine settings verifier", engineSettingsVerifierSource, [
    "aiExploresDefault: readPreferenceBool(\"AiExplores\", true)"
  ]],
  ["save schema verifier", saveSchemaVerifierSource, [
    "aiExploresDefault: world.engineSettings.aiExploresDefault"
  ]],
  ["menu verifier", menuVerifierSource, [
    "toggle-ai-explores",
    "aiExploresDefault = !context.world.engineSettings.aiExploresDefault"
  ]],
  ["package", packageSource, ["verify:source-ai-explores"]]
]) {
  for (const fragment of fragments) {
    expect(source, fragment, `${name} missing AiExplores browser fragment: ${fragment}`);
  }
}

if (manifest.engineSettings?.aiExploresDefault !== true) {
  errors.push(`Expected Wargus AiExplores default to parse as true, got ${manifest.engineSettings?.aiExploresDefault}`);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source AiExplores verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source AiExplores verified (AI exploration requests gated by source preference).");
