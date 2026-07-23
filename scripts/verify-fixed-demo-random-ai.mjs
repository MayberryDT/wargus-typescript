import { readFileSync } from "node:fs";

const demoScenario = readFileSync("src/wargus/demoScenario.ts", "utf8");
const indexHtml = readFileSync("index.html", "utf8");
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
expect(demoScenario, "DEMO_HIGH_RESOURCES = { gold: 10000, wood: 5000, oil: 5000 }", "Fixed demo should copy Wargus high-resource start amounts.");
expect(demoScenario, "disableStartingHalls: true", "Fixed demo one-peasant mode should disable automatic fallback starting halls.");
expect(demoScenario, "demoSeed", "Fixed demo should support deterministic seeded start selection.");
expect(demoScenario, "runtimeFixedDemoSeed", "Fixed demo should use a browser-provided runtime seed for normal player runs.");
expect(demoScenario, "__WARGUS_TS_RANDOM_DEMO_SEED__", "Fixed demo should read the browser runtime demo seed hook.");
expect(demoScenario, "playerType: \"computer\"", "Fixed demo should activate exactly one computer player.");
expect(demoScenario, "playerType: \"nobody\"", "Fixed demo should leave non-selected starts inactive.");
expect(demoScenario, "enemyAi", "Fixed demo should preserve the selected enemy slot's original AI label.");
expect(demoScenario, ".filter((unit) => unit.player === FIXED_BROWSER_DEMO_NEUTRAL_PLAYER_ID)", "Fixed demo should keep neutral map resources without remapping full start bases.");
expect(demoScenario, "typeId: \"unit-peasant\"", "Fixed demo should generate one human worker start.");
expect(demoScenario, "typeId: \"unit-peon\"", "Fixed demo should generate one enemy worker start.");
expect(demoScenario, "resources: { ...DEMO_HIGH_RESOURCES }", "Fixed demo active players should receive high resources.");
expect(demoScenario, ".slice(0, 1)", "Fixed demo should initially select only the one starting peasant.");
expect(demoScenario, "player-defeated", "Fixed demo victory should defeat the randomized enemy player, not a hardcoded hall type.");
reject(demoScenario, "world.aiStates = []", "Fixed demo presentation must not clear AI states.");
reject(demoScenario, "fixedDemoRaceUnitType", "Fixed demo should not remap original full start bases.");
reject(demoScenario, "demoStartingUnits", "Fixed demo should use the original start points, not a custom staged base list.");
reject(demoScenario, "return `${DEMO_DEFAULT_SEED}:${Date.now()}:${Math.random()}`", "Normal fixed-demo randomness should not use wall-clock or random APIs inside src/**/*.ts.");

const allowedUnitTypesSource = demoScenario.match(/allowedUnitTypes: \[([\s\S]*?)\],\n\s*allowedUpgradeTypes:/)?.[1] ?? "";
for (const typeId of [
  "unit-church",
  "unit-altar-of-storms",
  "unit-mage-tower",
  "unit-temple-of-the-damned",
  "unit-inventor",
  "unit-alchemist",
  "unit-balloon",
  "unit-zeppelin",
  "unit-dwarves",
  "unit-goblin-sappers"
]) {
  const occurrences = allowedUnitTypesSource.match(new RegExp(`"${typeId}"`, "g"))?.length ?? 0;
  if (occurrences !== 1) {
    throw new Error(`Fixed demo advanced reachability should allow ${typeId} exactly once; found ${occurrences}.`);
  }
}

expect(indexHtml, "__WARGUS_TS_RANDOM_DEMO_SEED__", "Browser entrypoint should install a normal-play random demo seed hook.");
expect(indexHtml, "getRandomValues", "Normal player demo starts should vary using browser entropy when available.");
expect(indexHtml, "Math.random()", "Normal player demo starts should keep a browser-only fallback outside src/**/*.ts.");

expect(world, "sourceScriptId", "World AI state should persist source script identity.");
expect(world, "setup?.state?.disableStartingHalls !== true", "World creation should respect fixed demo one-peasant mode by skipping fallback halls.");
expect(world, "sourceScriptIndex", "World AI state should persist source script cursor.");
expect(world, "sourceScriptForces", "World AI state should persist source force definitions.");
expect(world, "assignedUnitIds: string[]", "World AI force slots should persist deterministic assigned unit ids.");
expect(world, "sourceScriptLaunches", "World AI state should persist bounded detached launch history.");
expect(saveGame, "normalizeAiSourceScriptForces", "Save-game normalization should preserve source AI force state.");
expect(saveGame, "normalizeAiSourceScriptLaunches", "Save-game normalization should preserve detached source AI launches.");
expect(saveGame, "normalizeAiSourceScriptForceRoles", "Save-game normalization should preserve source AI force roles.");

expect(orders, "SOURCE_AI_LAND_ATTACK_SCRIPT", "Orders should include a source-style land attack script.");
expect(orders, "const townCenters = units.filter(isTownCenter);", "AI should count under-construction town centers before placing another hall.");
expect(orders, "if (townCenters.length === 0 && workers.length > 0)", "AI should not queue multiple halls while the first town center is under construction.");
if (/workers\.find\(\(worker\) => !worker\.order\)\s*\?\?\s*workers\[0\]/.test(orders)) {
  throw new Error("AI construction must not steal a busy worker when no idle builder exists.");
}
expect(orders, "SOURCE_AI_AIR_ATTACK_SCRIPT", "Orders should include a source-style air attack script.");
expect(orders, "advanceSourceAiScript", "AI step should advance source scripts.");
expect(orders, "attack-force", "Source AI runner should support scripted attack waves.");
expect(orders, "launchSourceAiAttackForce", "Source AI attack-force should launch and detach assigned ids immediately.");
expect(orders, "state.sourceScriptForces = state.sourceScriptForces.filter", "Launched source force slots should clear before later declarations.");
expect(orders, "state.sourceScriptLaunches.flatMap", "Later source forces should exclude every previously launched id.");
expect(orders, "state.sourceScriptId", "Source-script players should bypass the legacy mutable wave selector after economic management.");
reject(orders, "const enemyStarts = world.players", "Source AI pressure should not know enemy start coordinates.");
expect(orders, "wait-force", "Source AI runner should support blocking until a force is ready.");
expect(orders, "wc2-air-attack", "Source AI runner should recognize wc2-air-attack.");
expect(orders, "wc2-land-attack", "Source AI runner should recognize wc2-land-attack.");

expect(runtimeSmoke, "selectedUnitTypes?.[0] === \"unit-peasant\"", "Browser runtime smoke should assert the selected fixed-demo peasant.");
expect(runtimeSmoke, "counts[\"unit-peasant\"] === 1", "Browser runtime smoke should assert exactly one owned peasant.");
expect(runtimeSmoke, "!counts[\"unit-town-hall\"]", "Browser runtime smoke should assert no starting town hall.");
expect(runtimeSmoke, "Number(resources.gold ?? 0) >= 10000", "Browser runtime smoke should assert high fixed-demo gold.");
expect(runtimeSmoke, "Number(resources.wood ?? 0) >= 5000", "Browser runtime smoke should assert high fixed-demo wood.");

console.log("Fixed demo random-start source AI contract verified.");
