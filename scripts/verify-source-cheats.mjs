import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const cheatSource = readFileSync(path.join(manifest.dataRoot, "scripts/cheats.lua"), "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const cheatInputSource = readFileSync("src/view/sourceCheatInput.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");

const errors = [];
function error(message) {
  errors.push(message);
}

for (const fragment of [
  "function HandleCheats(str)",
  'str == "glittering prizes"',
  'str == "on screen"',
  'str == "showpath"',
  'str == "fow on"',
  'str == "fow off"',
  'str == "make it so"',
  'str == "hatchet"',
  'SetSpeedResourcesHarvest(i, "wood", 5200 / 2)',
  'str == "disco"',
  "I'm a Medieval Man",
  'str == "unite the clans"',
  'str == "monkey sweats on a tuesday"',
  'str == "you pitiful worm"',
  'str == "it is a good day to die"',
  "SetGodMode(false)",
  "SetGodMode(true)",
  'AddMessage("God Mode OFF")',
  'AddMessage("God Mode ON")',
  'str == "fill mana"',
  'AddMessage("SO!")',
  'AddMessage("NO SO!")'
]) {
  if (!cheatSource.includes(fragment)) {
    error(`Source cheats.lua missing fragment: ${fragment}`);
  }
}

for (const fragment of [
  "input: string | null",
  "sourceSpeedCheat: boolean",
  "export function applySourceCheatKey",
  "applySourceCheat(world, submitted, state.sourceSpeedCheat)",
  "state.sourceSpeedCheat = cheat.sourceSpeedCheat",
  "musicFile",
  "message",
  "resetSourceCheatInputState"
]) {
  if (!cheatInputSource.includes(fragment)) {
    error(`Browser cheat input runtime missing fragment: ${fragment}`);
  }
}

for (const fragment of [
  "const sourceCheatInputState = createSourceCheatInputState()",
  "function handleSourceCheatKey",
  "applySourceCheatKey(world, sourceCheatInputState, event)",
  "audioEngine?.playMusicFile(result.musicFile)",
  "addHudMessage(result.message, result.messageLifetimeMs)",
  "handleSourceCheatKey(event)"
]) {
  if (!mainSource.includes(fragment)) {
    error(`Browser cheat input/runtime missing fragment: ${fragment}`);
  }
}

for (const fragment of [
  "export function applySourceCheat",
  "export function applySourceSpeedCheat",
  'cheat === "glittering prizes"',
  "addPlayerResource(world, player, \"gold\", 12000)",
  "addPlayerResource(world, player, \"wood\", 5000)",
  "addPlayerResource(world, player, \"oil\", 5000)",
  'cheat === "on screen"',
  "world.engineSettings.fogOfWarEnabled = false",
  'world.engineSettings.revealMapMode = "explored"',
  "world.exploredTiles.fill(1)",
  "world.visibleTiles.fill(1)",
  'cheat === "showpath"',
  'world.engineSettings.revealMapMode = "known"',
  'cheat === "fow on"',
  'cheat === "fow off"',
  'cheat === "make it so"',
  "world.engineSettings.speedFactors.build = speed",
  "world.engineSettings.speedFactors.resourceHarvest[resource] = speed",
  "addPlayerResource(world, player, resource, 32000)",
  'cheat === "hatchet"',
  "world.engineSettings.speedFactors.resourceHarvest.wood = 2600",
  "Wow -- I got jigsaw!",
  'cheat === "disco"',
  'musicFile: "music/I\'m a Medieval Man.mid"',
  'cheat === "it is a good day to die"',
  "world.godModePlayers",
  "God Mode OFF",
  "God Mode ON",
  'cheat === "unite the clans" || cheat === "monkey sweats on a tuesday"',
  'status: "victory"',
  'cheat === "you pitiful worm"',
  'status: "defeat"',
  'cheat === "fill mana"',
  "unit.mana = unit.maxMana"
]) {
  if (!ordersSource.includes(fragment)) {
    error(`Simulation cheat runtime missing fragment: ${fragment}`);
  }
}

for (const fragment of [
  "godModePlayers: number[]",
  "godModePlayers: []",
  "if (!world.engineSettings.fogOfWarEnabled)",
  "export function isWorldTileSourceKnown",
  "world.visibleTiles.fill(1)",
  "world.exploredTiles.fill(1)"
]) {
  if (!worldSource.includes(fragment)) {
    error(`World state is missing god mode fragment: ${fragment}`);
  }
}

for (const fragment of [
  "(world.godModePlayers ?? []).includes(target.player)",
  "(world.godModePlayers ?? []).includes(attackerPlayer)",
  "amount = Math.max(amount, target.hitPoints)"
]) {
  if (!ordersSource.includes(fragment)) {
    error(`Damage runtime is missing god mode fragment: ${fragment}`);
  }
}

for (const fragment of [
  'godModePlayers?: WorldState["godModePlayers"]',
  "godModePlayers: world.godModePlayers",
  "world.godModePlayers = normalizePlayerIdArray(save.world.godModePlayers, world.godModePlayers, world)"
]) {
  if (!saveSource.includes(fragment)) {
    error(`Save/load is missing god mode fragment: ${fragment}`);
  }
}

if (!packageSource.includes('"verify:source-cheats"')) {
  error("package.json does not expose verify:source-cheats.");
}
if (!packageSource.includes("npm run verify:source-cheats")) {
  error("Full verify script does not include verify:source-cheats.");
}

if (errors.length > 0) {
  console.error(`Source cheat verification failed (${errors.length} errors).`);
  for (const message of errors) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log("Source cheats verified (resources, fog/reveal, speed/resource toggles, god mode, disco music, mana fill, and win/loss cheats wired).");
