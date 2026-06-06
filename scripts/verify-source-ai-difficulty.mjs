import { readFileSync } from "node:fs";

const sourceAi = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/wargus/scripts/ai.lua", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const renderHudSource = readFileSync("src/view/renderHud.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const mapCommandsSource = readFileSync("src/view/mapCommands.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");

const errors = [];

function expect(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

for (const fragment of [
  "GameSettings.Difficulty == 4",
  "AiCheat(50, 35, 25)",
  "SetSpeedResourcesHarvest(AiPlayer(), resources[j], 120)",
  "SetSpeedResourcesReturn(AiPlayer(), resources[j], 120)",
  "AiSpeed(120)",
  "GameSettings.Difficulty == 5",
  "AiCheat(100, 75, 50)",
  "SetSpeedResourcesHarvest(AiPlayer(), resources[j], 150)",
  "SetSpeedResourcesReturn(AiPlayer(), resources[j], 150)",
  "AiSpeed(150)",
  "GameSettings.Difficulty == 1",
  "return OldAiSleep(5 * cycles)",
  "GameSettings.Difficulty == 2",
  "return OldAiSleep(math.floor(1.25 * cycles))",
  "GameSettings.Difficulty == 3",
  "return OldAiSleep(math.floor(cycles))",
  "return OldAiSleep(math.floor(cycles / 2))",
  "return OldAiSleep(math.floor(cycles / 3))",
  "SetSpeedResourcesHarvest(AiPlayer(), resources[j], 75)",
  "SetSpeedResourcesReturn(AiPlayer(), resources[j], 75)",
  "AiSpeed(75)"
]) {
  expect(sourceAi.includes(fragment), `Missing source AI difficulty fragment: ${fragment}`);
}

for (const [source, fragment] of [
  [worldSource, "lastDifficultyDefault: 2"],
  [worldSource, "speedFactors: WargusSpeedFactors"],
  [worldSource, "speedFactors: cloneSourceSpeedFactors(speedFactors)"],
  [saveSource, "speedFactors: normalizeSpeedFactors"],
  [ordersSource, "function applySourceAiDifficultyBonuses"],
  [ordersSource, "function sourceAiSleepCycles"],
  [ordersSource, "world.engineSettings.lastDifficultyDefault"],
  [ordersSource, "state.nextThinkTick = world.tick + sourceAiSleepCycles(world, 30)"],
  [saveSource, "function sourceAiSleepCyclesForSave"],
  [saveSource, "const nextThinkTickCap = currentTick + sourceAiSleepCyclesForSave(world, 30)"],
  [ordersSource, "Math.floor(5 * cycles)"],
  [ordersSource, "Math.floor(1.25 * cycles)"],
  [ordersSource, "Math.floor(cycles / 2)"],
  [ordersSource, "Math.floor(cycles / 3)"],
  [ordersSource, "applySourceAiResourceBonus(world, player, 50, 35, 25)"],
  [ordersSource, "setSourceAiSpeedFactors(player, 120)"],
  [ordersSource, "applySourceAiResourceBonus(world, player, 100, 75, 50)"],
  [ordersSource, "setSourceAiSpeedFactors(player, 150)"],
  [ordersSource, "setSourceAiSpeedFactors(player, 75)"],
  [ordersSource, "player.playerType === \"person\" || player.playerType === \"nobody\""],
  [ordersSource, "player.speedFactors.build = speed"],
  [ordersSource, "player.speedFactors.resourceHarvest[resource] = speed"],
  [ordersSource, "applySourceAiDifficultyBonuses(world, player)"],
  [renderHudSource, '"easier-ai"'],
  [renderHudSource, '"harder-ai"'],
  [sourceUiHelpersSource, "sourceAiDifficultyLabel(world.engineSettings.lastDifficultyDefault)"],
  [sourceUiHelpersSource, '{ label: "Easier AI", command: "easier-ai" }'],
  [sourceUiHelpersSource, '{ label: "Harder AI", command: "harder-ai" }'],
  [mapCommandsSource, 'command === "easier-ai" || command === "harder-ai"'],
  [mapCommandsSource, "context.world.engineSettings.lastDifficultyDefault = steppedSourceDifficulty"],
  [mapCommandsSource, 'context.state.menuOverlay = "speed-options"'],
  [saveSource, '| "lastDifficultyDefault"'],
  [saveSource, "lastDifficultyDefault: world.engineSettings.lastDifficultyDefault"],
  [saveSource, "world.engineSettings.lastDifficultyDefault = sourceDifficultyOr"],
  [packageSource, "verify:source-ai-difficulty"]
]) {
  expect(source.includes(fragment), `Missing browser AI difficulty wiring fragment: ${fragment}`);
}

if (errors.length > 0) {
  console.error(`Source AI difficulty verification errors: ${errors.length}`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Source AI difficulty verified (easy/hard/very-hard AI speed and resource bonuses wired).");
