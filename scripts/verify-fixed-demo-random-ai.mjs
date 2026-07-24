import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const demoScenario = readFileSync("src/wargus/demoScenario.ts", "utf8");
const main = readFileSync("src/main.ts", "utf8");
const indexHtml = readFileSync("index.html", "utf8");
const orders = readFileSync("src/simulation/orders.ts", "utf8");
const world = readFileSync("src/simulation/world.ts", "utf8");
const saveGame = readFileSync("src/wargus/saveGame.ts", "utf8");
const runtimeSmoke = readFileSync("scripts/verify-browser-runtime-smoke.mjs", "utf8");
const fixedDemoInput = readFileSync("scripts/verify-browser-fixed-demo-input.mjs", "utf8");
const gardenSetup = JSON.parse(readFileSync("public/wargus/maps/setups/191-Garden_of_war_BNE.pud.sms.json", "utf8"));

const compiledDemoScenario = ts.transpileModule(demoScenario, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
}).outputText;
const demo = await import(`data:text/javascript;base64,${Buffer.from(compiledDemoScenario).toString("base64")}`);

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

function applyDemoSeed(seed, setup = gardenSetup) {
  const previousLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { search: `?demoSeed=${encodeURIComponent(seed)}` }
  });
  try {
    return demo.applyFixedBrowserDemoSetup(
      { path: demo.FIXED_BROWSER_DEMO_MAP_PATH },
      structuredClone(setup)
    );
  } finally {
    if (previousLocation) {
      Object.defineProperty(globalThis, "location", previousLocation);
    } else {
      delete globalThis.location;
    }
  }
}

assert.equal(demo.FIXED_DEMO_SOURCE_GAME_SPEED, 45, "Fixed demo should use candidate B's 45 source ticks per second");
assert.equal(demo.DEMO_MIN_START_DISTANCE_TILES, 70, "Candidate B should keep starts at least 70 tiles apart");
assert.equal(demo.DEMO_MAX_START_DISTANCE_TILES, 110, "Candidate B should keep starts at most 110 tiles apart");
assert.equal(demo.DEMO_TARGET_START_DISTANCE_TILES, 90, "Candidate B fallback should target 90 tiles");

const sourceStarts = new Map(gardenSetup.starts.map((start) => [start.player, start]));
const representativePairs = [
  { seed: "plan017-b-min-10", human: 6, enemy: 5, distanceTiles: 70 },
  { seed: "plan017-b-target-21", human: 0, enemy: 7, distanceTiles: 93.13431161500041 },
  { seed: "plan017-b-max-0", human: 5, enemy: 7, distanceTiles: 109.48972554536795 }
];
for (const expected of representativePairs) {
  const first = applyDemoSeed(expected.seed);
  const repeated = applyDemoSeed(expected.seed);
  const humanStart = first.starts.find((start) => start.player === 0);
  const enemyStart = first.starts.find((start) => start.player === 1);
  const sourceHumanStart = sourceStarts.get(expected.human);
  const sourceEnemyStart = sourceStarts.get(expected.enemy);
  assert.deepEqual(humanStart, { player: 0, x: sourceHumanStart.x, y: sourceHumanStart.y }, `${expected.seed} should select human source player ${expected.human}`);
  assert.deepEqual(enemyStart, { player: 1, x: sourceEnemyStart.x, y: sourceEnemyStart.y }, `${expected.seed} should select enemy source player ${expected.enemy}`);
  assert.deepEqual(
    repeated.starts.filter((start) => start.player <= 1),
    first.starts.filter((start) => start.player <= 1),
    `${expected.seed} should replay the same ordered pair`
  );
  assert.equal(first.players.find((player) => player.player === 1)?.ai, "wc2-land-attack", `${expected.seed} should preserve land AI on the remapped enemy`);
  assert.equal(first.aiTypeOverrides.find((entry) => entry.player === 1)?.ai, "wc2-land-attack", `${expected.seed} should publish the remapped land AI override`);
  assert.ok(expected.distanceTiles >= 70 && expected.distanceTiles <= 110, `${expected.seed} should remain inside candidate B's band`);
}

const opening = applyDemoSeed("plan017-b-target-21");
assert.deepEqual(opening.players.find((player) => player.player === 0)?.resources, { gold: 10000, wood: 5000, oil: 5000 }, "Human fixed-demo resources should remain high");
assert.deepEqual(opening.players.find((player) => player.player === 1)?.resources, { gold: 10000, wood: 5000, oil: 5000 }, "Enemy fixed-demo resources should remain high");
assert.equal(opening.units.filter((unit) => unit.player === 0 && unit.typeId === "unit-peasant").length, 1, "Fixed demo should start with one Peasant");
assert.equal(opening.units.filter((unit) => unit.player === 1 && unit.typeId === "unit-peon").length, 1, "Fixed demo should start with one enemy Peon");
assert.equal(opening.units.some((unit) => unit.player <= 1 && ["unit-town-hall", "unit-great-hall"].includes(unit.typeId)), false, "Fixed demo should start with no Hall");

const noBandSetup = structuredClone(gardenSetup);
noBandSetup.starts = noBandSetup.starts.map((start) => ({ ...start, x: start.player, y: 0 }));
noBandSetup.players = noBandSetup.players.map((player) => player.startView
  ? { ...player, startView: { x: player.player, y: 0 } }
  : player);
const closestFallback = applyDemoSeed("plan017-no-band", noBandSetup);
assert.deepEqual(closestFallback.starts.find((start) => start.player === 0), { player: 0, x: 0, y: 0 }, "Closest fallback should use the lowest-id human on a distance tie");
assert.deepEqual(closestFallback.starts.find((start) => start.player === 1), { player: 1, x: 7, y: 0 }, "Closest fallback should use the farthest eligible land enemy then player-id tie-breaks");

const noLandAiSetup = structuredClone(gardenSetup);
noLandAiSetup.players = noLandAiSetup.players.map((player) => player.player <= 7 ? { ...player, ai: "wc2-air-attack" } : player);
noLandAiSetup.aiTypeOverrides = [];
assert.throws(
  () => applyDemoSeed("plan017-no-land-ai", noLandAiSetup),
  /no wc2-land-attack enemy source slot/i,
  "Fixed demo should stop explicitly instead of measuring an air script when no land-AI source exists"
);

const presentationWorld = {
  tickRate: 30,
  visibilityPlayer: 15,
  units: [
    { id: "human", player: 0, hitPoints: 30, typeId: "unit-peasant" },
    { id: "enemy", player: 1, hitPoints: 30, typeId: "unit-peon" },
    { id: "mine", player: 15, hitPoints: 25500, typeId: "unit-gold-mine" }
  ],
  engineSettings: {}
};
demo.applyFixedBrowserDemoWorldPresentation({ path: demo.FIXED_BROWSER_DEMO_MAP_PATH }, presentationWorld);
assert.equal(presentationWorld.engineSettings.sourceGameSpeedDefault, 45, "New fixed-demo worlds should present candidate B's honest global source speed");

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
reject(main, "FIXED_DEMO_MOVEMENT_PACE_MULTIPLIER", "Fixed demo should not retain a hidden movement-only pace multiplier.");
reject(main, "applyFixedDemoMovementPace", "Fixed demo should not mutate mobile unit speeds after world creation or load.");
reject(main, "__fixedDemoPace", "Fixed demo should not retain private unit movement pace fields.");
expect(main, "fixedDemoMovementPaceMultiplier: 1", "Smoke compatibility data should truthfully report no movement-only multiplier.");
expect(fixedDemoInput, "EXPECTED_FIXED_DEMO_SOURCE_GAME_SPEED = 45", "Fixed-demo input verifier should expect candidate B's source speed.");
expect(fixedDemoInput, "EXPECTED_FIXED_DEMO_GAME_SPEED = 1.5", "Fixed-demo input verifier should expect the honest visible 1.5x pace.");
expect(fixedDemoInput, "EXPECTED_FIXED_DEMO_MOVEMENT_PACE_MULTIPLIER = 1", "Fixed-demo input verifier should reject hidden movement acceleration.");
reject(runtimeSmoke, "fixedDemoMovementPaceMultiplier ?? 0) > 1", "Runtime smoke should not wait for hidden movement acceleration.");

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

console.log("Fixed demo land-AI start-band and honest global pacing contract verified.");
