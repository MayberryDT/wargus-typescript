import { readFileSync } from "node:fs";

const sourceRoot = "/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src";
const sourceUnitHeader = readFileSync(`${sourceRoot}/include/unit.h`, "utf8");
const sourceSettingsHeader = readFileSync(`${sourceRoot}/include/settings.h`, "utf8");
const sourceAiResource = readFileSync(`${sourceRoot}/ai/ai_resource.cpp`, "utf8");

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
    "s.AiChecksDependencies = AiChecksDependencies",
    "bool AiChecksDependencies = false",
    "GameSettings.AiChecksDependencies = v"
  ]],
  ["settings.h", sourceSettingsHeader, [
    "unsigned AiChecksDependencies:1",
    "AiChecksDependencies = 0"
  ]],
  ["ai_resource.cpp", sourceAiResource, [
    "if (GameSettings.AiChecksDependencies)",
    "if (!CheckDependByType(*AiPlayer->Player, what))"
  ]]
]) {
  for (const fragment of fragments) {
    expect(source, fragment, `Stratagus ${name} missing AiChecksDependencies fragment: ${fragment}`);
  }
}

for (const [name, source, fragments] of [
  ["types", typesSource, ["aiChecksDependenciesDefault: boolean"]],
  ["world", worldSource, ["aiChecksDependenciesDefault: false"]],
  ["indexer", indexSource, [
    "aiChecksDependenciesDefault: readPreferenceBool(\"AiChecksDependencies\", false)",
    "aiChecksDependenciesDefault: false",
    "engineSettings.aiChecksDependenciesDefault ||= parsedEngineSettings.aiChecksDependenciesDefault"
  ]],
  ["save", saveSource, [
    "| \"aiChecksDependenciesDefault\"",
    "aiChecksDependenciesDefault: world.engineSettings.aiChecksDependenciesDefault",
    "world.engineSettings.aiChecksDependenciesDefault = booleanOr"
  ]],
  ["orders", ordersSource, [
    "function canAiResearchUpgradeAt",
    "world.engineSettings.aiChecksDependenciesDefault",
    "return canResearchUpgradeAt(world, building.id, upgradeId, upgrades)",
    "canResearchUpgradeCommon(world, building, player.id, upgradeId, { checkDependencies: false })",
    "options.checkDependencies !== false && !hasResearchGatePrerequisites",
    "function issueAiResearchOrder",
    "issueAiResearchOrder(world, building, upgradeId, world.upgradeDefinitions)"
  ]],
  ["menu", menuSource, [
    "AI dependencies:",
    "toggle-ai-dependencies"
  ]],
  ["map commands", mapCommandsSource, [
    "toggle-ai-dependencies",
    "aiChecksDependenciesDefault = !context.world.engineSettings.aiChecksDependenciesDefault"
  ]],
  ["engine settings verifier", engineSettingsVerifierSource, [
    "aiChecksDependenciesDefault: readPreferenceBool(\"AiChecksDependencies\", false)"
  ]],
  ["save schema verifier", saveSchemaVerifierSource, [
    "aiChecksDependenciesDefault: world.engineSettings.aiChecksDependenciesDefault"
  ]],
  ["menu verifier", menuVerifierSource, [
    "toggle-ai-dependencies",
    "aiChecksDependenciesDefault = !context.world.engineSettings.aiChecksDependenciesDefault"
  ]],
  ["package", packageSource, ["verify:source-ai-checks-dependencies"]]
]) {
  for (const fragment of fragments) {
    expect(source, fragment, `${name} missing AiChecksDependencies browser fragment: ${fragment}`);
  }
}

if (manifest.engineSettings?.aiChecksDependenciesDefault !== false) {
  errors.push(`Expected Wargus AiChecksDependencies default to parse as false, got ${manifest.engineSettings?.aiChecksDependenciesDefault}`);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source AiChecksDependencies verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source AiChecksDependencies verified (AI dependency gates follow source default).");
