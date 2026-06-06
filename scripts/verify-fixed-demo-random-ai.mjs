import { readFileSync } from "node:fs";

const demoScenario = readFileSync("src/wargus/demoScenario.ts", "utf8");
const orders = readFileSync("src/simulation/orders.ts", "utf8");
const world = readFileSync("src/simulation/world.ts", "utf8");
const saveGame = readFileSync("src/wargus/saveGame.ts", "utf8");
const runtimeSmoke = readFileSync("scripts/verify-browser-runtime-smoke.mjs", "utf8");

function expect(source, needle, message) {
  if (!source.includes(needle)) {
    throw new Error(message);
  }
}

function reject(source, needle, message) {
  if (source.includes(needle)) {
    throw new Error(message);
  }
}

expect(demoScenario, "chooseFixedDemoStarts", "Fixed demo should choose randomized Garden of War starts.");
expect(demoScenario, "DEMO_START_PLAYERS", "Fixed demo should keep the original eight Garden of War start slots as the random pool.");
expect(demoScenario, "demoSeed", "Fixed demo should support deterministic seeded start selection.");
expect(demoScenario, "playerType: \"computer\"", "Fixed demo should activate exactly one computer player.");
expect(demoScenario, "playerType: \"nobody\"", "Fixed demo should leave non-selected starts inactive.");
expect(demoScenario, "enemyAi", "Fixed demo should preserve the selected enemy slot's original AI label.");
expect(demoScenario, "player-defeated", "Fixed demo victory should defeat the randomized enemy player, not a hardcoded hall type.");
reject(demoScenario, "world.aiStates = []", "Fixed demo presentation must not clear AI states.");
reject(demoScenario, "demoStartingUnits", "Fixed demo should use remapped original start units instead of hand-built custom bases.");

expect(world, "sourceScriptId", "World AI state should persist source script identity.");
expect(world, "sourceScriptIndex", "World AI state should persist source script cursor.");
expect(world, "sourceScriptForces", "World AI state should persist source force definitions.");
expect(saveGame, "normalizeAiSourceScriptForces", "Save-game normalization should preserve source AI force state.");
expect(saveGame, "normalizeAiSourceScriptForceRoles", "Save-game normalization should preserve source AI force roles.");

expect(orders, "SOURCE_AI_LAND_ATTACK_SCRIPT", "Orders should include a source-style land attack script.");
expect(orders, "SOURCE_AI_AIR_ATTACK_SCRIPT", "Orders should include a source-style air attack script.");
expect(orders, "advanceSourceAiScript", "AI step should advance source scripts.");
expect(orders, "attack-force", "Source AI runner should support scripted attack waves.");
expect(orders, "wait-force", "Source AI runner should support blocking until a force is ready.");
expect(orders, "wc2-air-attack", "Source AI runner should recognize wc2-air-attack.");
expect(orders, "wc2-land-attack", "Source AI runner should recognize wc2-land-attack.");

expect(runtimeSmoke, "single-original-start-unit", "Browser runtime smoke should allow original starts with only one visible unit type.");

console.log("Fixed demo random-start source AI contract verified.");
