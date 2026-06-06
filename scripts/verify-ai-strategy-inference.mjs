import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const unitDefinitions = new Map((manifest.units ?? []).map((unit) => [unit.id, unit]));
const errors = [];

function error(message) {
  errors.push(message);
}

if (!worldSource.includes("function aiStrategyForPlayer")) {
  error("World creation should infer AI strategy from the player and its loaded setup units.");
}

for (const requiredSnippet of [
  "sourceAiDefinitionStrategy(aiDefinition?.class, aiDefinition?.script)",
  "function sourceAiDefinitionStrategy(aiClass: string | null | undefined, aiScript: string | null | undefined)",
  'normalizedScript === "AiSeaAttack"',
  'normalizedScript === "AiAirAttack"',
  'normalizedScript === "AiLandAttack"',
  'normalizedClass === "wc2-sea-attack"',
  'normalizedClass === "wc2-air-attack"',
  'normalizedClass === "wc2-land-attack"',
  'normalizedClass === "ai-active"',
  "unit.storesResources.includes(\"oil\")",
  "unit.gatherResources.includes(\"oil\")",
  "airWeight >= 3",
  "navalWeight >= 2"
]) {
  if (!worldSource.includes(requiredSnippet)) {
    error(`AI strategy inference is missing source-unit evidence check: ${requiredSnippet}`);
  }
}

if (worldSource.includes("sourceTokens.includes(") || worldSource.includes('includes("dragon")') || worldSource.includes('includes("flyer")')) {
  error("AI strategy inference should use exact indexed AI script identities before source-unit composition fallback, not source token text scans.");
}

let nonGenericAiPlayers = 0;
let navalOrAirNonGenericPlayers = 0;
const inferredStrategies = { sea: 0, air: 0 };

for (const map of manifest.maps ?? []) {
  if (!map.setupJson) {
    continue;
  }
  const setup = JSON.parse(readFileSync(`public/wargus/${map.setupJson}`, "utf8"));
  for (const player of setup.players ?? []) {
    if (!player.ai || /wc2-|passive|sea|air|land/i.test(player.ai)) {
      continue;
    }
    nonGenericAiPlayers += 1;
    const units = (setup.units ?? [])
      .filter((unit) => unit.player === player.player)
      .map((unit) => unitDefinitions.get(unit.typeId))
      .filter(Boolean);
    const airWeight = units.filter((unit) => unit.airUnit || unit.type === "fly").length;
    const navalWeight = units.filter((unit) => (
      unit.seaUnit
      || unit.type === "naval"
      || (unit.storesResources ?? []).includes("oil")
      || (unit.gatherResources ?? []).includes("oil")
    )).length;
    if (airWeight < 3 && navalWeight < 2) {
      continue;
    }
    navalOrAirNonGenericPlayers += 1;
    if (airWeight >= 3 && airWeight >= navalWeight) {
      inferredStrategies.air += 1;
    } else {
      inferredStrategies.sea += 1;
    }
  }
}

if (navalOrAirNonGenericPlayers === 0) {
  error("Expected campaign setups with non-generic AI names and naval/air starting forces.");
}

if (inferredStrategies.sea === 0 || inferredStrategies.air === 0) {
  error(`Expected both sea and air strategy inference coverage, got sea=${inferredStrategies.sea}, air=${inferredStrategies.air}.`);
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`AI strategy inference errors: ${errors.length}`);
  process.exit(1);
}

console.log(`AI strategy inference verified (${navalOrAirNonGenericPlayers}/${nonGenericAiPlayers} non-generic AI players infer sea/air: ${inferredStrategies.sea} sea, ${inferredStrategies.air} air).`);
