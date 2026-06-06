import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const normalizerSource = readFileSync("src/wargus/manifest.ts", "utf8");
const indexerSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const sourceRaceSource = readFileSync("src/wargus/sourceRace.ts", "utf8");
const unitIds = new Set((manifest.units ?? []).map((unit) => unit.id));
const errors = [];
let unitReferences = 0;
let setupCount = 0;
let fullTileSetups = 0;
let setupPlayerHelpersChecked = 0;
let inferredOwnerPlayersChecked = 0;
let directDiplomacyChecked = 0;
let symbolicRelationshipChecked = 0;
let highgroundsMapsChecked = 0;

for (const match of normalizerSource.matchAll(/patchUnit\(units,\s*"([^"]+)"/g)) {
  unitIds.add(match[1]);
}

function error(message) {
  errors.push(message);
}

for (const map of manifest.maps ?? []) {
  if (!map.setupJson) {
    continue;
  }
  const setupPath = `public/wargus/${map.setupJson}`;
  if (!existsSync(setupPath)) {
    error(`${map.path}: missing setup json ${map.setupJson}`);
    continue;
  }
  setupCount += 1;
  const setup = JSON.parse(readFileSync(setupPath, "utf8"));
  const expectedHighgrounds = sourceMapHighgroundsEnabled(map);
  if (map.highgroundsEnabled !== expectedHighgrounds) {
    error(`${map.path}: manifest highgroundsEnabled=${String(map.highgroundsEnabled)} does not match source ${String(expectedHighgrounds)}.`);
  }
  if (setup.highgroundsEnabled !== expectedHighgrounds) {
    error(`${map.path}: setup highgroundsEnabled=${String(setup.highgroundsEnabled)} does not match source ${String(expectedHighgrounds)}.`);
  }
  if (expectedHighgrounds) {
    highgroundsMapsChecked += 1;
  }
  const expectedTiles = Math.max(0, setup.width * setup.height);
  const tileCount = Array.isArray(setup.tiles) ? setup.tiles.length : -1;
  if (tileCount !== expectedTiles && tileCount !== 0) {
    error(`${map.path}: setup tile count ${tileCount} does not match ${expectedTiles}`);
  }
  if (tileCount === expectedTiles) {
    fullTileSetups += 1;
  }
  if (setup.path === "maps/randommap.sms" && tileCount !== expectedTiles) {
    error(`${map.path}: generated Random map setup should preserve five-argument source SetTile rows (${tileCount}/${expectedTiles}).`);
  }
  if (setup.path === "maps/ftm/(2)mushroom-panic.sms") {
    setupPlayerHelpersChecked += 1;
    const player = (setup.players ?? []).find((candidate) => candidate.player === 0);
    if (player?.race !== "human" || player?.ai !== "ai_redribbon_2014" || player?.resources?.gold !== 5000 || player?.resources?.wood !== 4500 || player?.resources?.oil !== 5000 || player?.startView?.x !== 49 || player?.startView?.y !== 165) {
      error("Mushroom Panic should preserve source SetupPlayer player 0 race/resources/AI/start.");
    }
  }
  if (setup.path === "maps/fl/(6)canyon-way.sms") {
    setupPlayerHelpersChecked += 1;
    const player = (setup.players ?? []).find((candidate) => candidate.player === 2);
    if (player?.race !== "human" || player?.ai !== "surprise" || player?.resources?.gold !== 10000 || player?.resources?.wood !== 3000 || player?.resources?.oil !== 2000 || player?.startView?.x !== 0 || player?.startView?.y !== 0) {
      error("Canyon Way should preserve source SetPlayerGame2015 player 2 race/resources/AI/start.");
    }
  }
  if (setup.path === "maps/ftm/(2)nicks-duel.sms") {
    inferredOwnerPlayersChecked += 1;
    for (const playerId of [10, 11]) {
      const player = (setup.players ?? []).find((candidate) => candidate.player === playerId);
      if (!player) {
        error(`Nick's Duel should create a setup player record for source team/unit owner ${playerId}.`);
      }
    }
  }
  if (setup.path === "maps/ftm/(8)darius.sms") {
    inferredOwnerPlayersChecked += 1;
    for (const playerId of [8, 10, 12, 13, 9, 11, 14, 15]) {
      const player = (setup.players ?? []).find((candidate) => candidate.player === playerId);
      if (!player) {
        error(`Darius should create a setup player record for source team/unit owner ${playerId}.`);
      }
    }
  }
  if (setup.path === "maps/ftm/(4)beethoven-day.sms") {
    directDiplomacyChecked += 1;
    if (!hasDiplomacy(setup, 1, "enemy", 5) || !hasDiplomacy(setup, 5, "enemy", 1)) {
      error("Beethoven Day should preserve direct numeric SetDiplomacy enemy rules for player 5.");
    }
    symbolicRelationshipChecked += 1;
    if (!hasDiplomacy(setup, 1, "enemy", 0) || !hasDiplomacy(setup, 1, "allied", 3)) {
      error("Beethoven Day should resolve source player symbols in SetDiplomacy rules.");
    }
    if (!hasSharedVision(setup, 1, false, 0) || !hasSharedVision(setup, 1, true, 3)) {
      error("Beethoven Day should resolve source player symbols in SetSharedVision rules.");
    }
  }
  if (setup.path === "maps/ftm/(2)forgotten-forest.sms") {
    directDiplomacyChecked += 1;
    if (!hasDiplomacy(setup, 1, "enemy", 4) || !hasDiplomacy(setup, 4, "enemy", 1)) {
      error("Forgotten Forest should preserve direct numeric SetDiplomacy enemy rules for player 4.");
    }
    symbolicRelationshipChecked += 1;
    if (!hasDiplomacy(setup, 1, "enemy", 3) || !hasDiplomacy(setup, 3, "allied", 0)) {
      error("Forgotten Forest should resolve source player symbols in SetDiplomacy rules.");
    }
    if (!hasSharedVision(setup, 1, false, 3) || !hasSharedVision(setup, 3, true, 0)) {
      error("Forgotten Forest should resolve source player symbols in SetSharedVision rules.");
    }
  }
  for (const unit of setup.units ?? []) {
    unitReferences += 1;
    if (!unitIds.has(unit.typeId)) {
      error(`${map.path}: unknown setup unit ${unit.typeId}`);
    }
    if (unit.x < 0 || unit.y < 0 || unit.x >= setup.width || unit.y >= setup.height) {
      error(`${map.path}: setup unit ${unit.typeId} out of bounds at ${unit.x},${unit.y}`);
    }
  }
  for (const player of setup.players ?? []) {
    const start = safePlayerStartTile(setup, player.player);
    if (!start) {
      error(`${map.path}: player ${player.player} has no browser-safe start`);
    } else if (!isTileInBounds(setup, start)) {
      error(`${map.path}: player ${player.player} normalized start out of bounds at ${start.x},${start.y}`);
    }
  }
}

for (const fragment of [
  "addStartingHalls(units, unitsById, setup, sourceButtons, sourceUnitDatabase",
  "function startingHallDefinitionForPlayer(sourceUnits: WargusUnit[], sourceButtons: WargusButton[], sourceUnitDatabase: WargusUnitDatabaseEntry[], race: string | null | undefined): WargusUnit | undefined",
  "raceMainFacilityScore(right, sourceUnitDatabase, race) - raceMainFacilityScore(left, sourceUnitDatabase, race)",
  "sourceRaceScoreForUnitDefinition(definition, sourceUnitDatabase, normalizedRace)"
]) {
  if (!worldSource.includes(fragment)) {
    error(`Starting hall source-race selection is missing fragment: ${fragment}`);
  }
}

for (const fragment of [
  "export function sourceRaceForUnitDefinition",
  "const databaseRace = sourceUnitDatabase.find((entry) => entry.unitTypeId === definition.id)?.race",
  "definition.source, definition.image, definition.icon",
  "const text = sourceUnitDefinitionText(definition).toLowerCase()",
  "export function sourceRaceTextScore",
  "export function sourceUnitDefinitionText"
]) {
  if (!sourceRaceSource.includes(fragment)) {
    error(`Shared source-race selection helper is missing fragment: ${fragment}`);
  }
}

if (!indexerSource.includes(String.raw`SetTile\(\s*(-?\d+),\s*(\d+),\s*(\d+),\s*(-?\d+)(?:,\s*(-?\d+))?\)`)) {
  error("Map setup indexer should preserve both four-argument and five-argument source SetTile rows.");
}
for (const fragment of [
  "function sourceSetupRace",
  "SetupPlayer\\(\\s*(\\d+)",
  "SetPlayerGame2015\\(\\s*(\\d+)",
  "for (const unit of units)",
  "for (const team of mergeMapTeams(presentation.teams ?? [], teams))",
  "function parseMapSetupPlayerSymbols",
  "mapSetupPlayerReferenceToNumber(match[1], playerSymbols)",
  "SetDiplomacy\\(\\s*([A-Za-z_][A-Za-z0-9_]*|-?\\d+)",
  "SetSharedVision\\(\\s*([A-Za-z_][A-Za-z0-9_]*|-?\\d+)"
]) {
  if (!indexerSource.includes(fragment)) {
    error(`Map setup indexer is missing source player helper fragment: ${fragment}`);
  }
}
if (setupPlayerHelpersChecked !== 2) {
  error(`Expected to verify SetupPlayer/SetPlayerGame2015 helper maps, checked ${setupPlayerHelpersChecked}.`);
}
if (inferredOwnerPlayersChecked !== 2) {
  error(`Expected to verify inferred owner/team player maps, checked ${inferredOwnerPlayersChecked}.`);
}
if (directDiplomacyChecked !== 2) {
  error(`Expected to verify direct numeric diplomacy/shared-vision maps, checked ${directDiplomacyChecked}.`);
}
if (symbolicRelationshipChecked !== 2) {
  error(`Expected to verify symbolic diplomacy/shared-vision maps, checked ${symbolicRelationshipChecked}.`);
}
for (const fragment of [
  "highgroundsEnabled: match[6] === \"highgrounds-enabled\"",
  "highgroundsEnabled: presentation.highgroundsEnabled === true",
  "highgroundsEnabled: setup.highgroundsEnabled"
]) {
  if (!indexerSource.includes(fragment)) {
    error(`Map setup indexer is missing highgrounds fragment: ${fragment}`);
  }
}
for (const fragment of [
  "highgroundsEnabled?: boolean",
  "highgroundsEnabled: boolean"
]) {
  if (!typesSource.includes(fragment)) {
    error(`Types are missing highgrounds fragment: ${fragment}`);
  }
}

if (worldSource.includes("raceMainFacilityScore(right.id, race)") || worldSource.includes("function raceMainFacilityScore(typeId: string")) {
  error("Starting hall race selection should score source unit definitions before falling back to type-id wording.");
}

if (worldSource.includes("const lower = typeId.toLowerCase()")) {
  error("Starting hall race selection should not score browser type ids directly.");
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Map setup reference errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Map setups verified (${setupCount} setups, ${fullTileSetups} full tile maps, ${unitReferences} unit references checked, ${highgroundsMapsChecked} highgrounds maps).`);

function sourceMapHighgroundsEnabled(map) {
  const sourcePath = path.join(manifest.dataRoot, map.path);
  if (!existsSync(sourcePath)) {
    return false;
  }
  const source = readSourceText(sourcePath);
  const match = source.match(/PresentMap\("([^"]+)",\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*"([^"]+)")?\)/);
  return match?.[6] === "highgrounds-enabled";
}

function readSourceText(filePath) {
  const bytes = readFileSync(filePath);
  return filePath.endsWith(".gz") ? gunzipSync(bytes).toString("utf8") : bytes.toString("utf8");
}

function safePlayerStartTile(setup, playerId) {
  const player = (setup.players ?? []).find((candidate) => candidate.player === playerId);
  if (isTileInBounds(setup, player?.startView)) {
    return player.startView;
  }
  const start = (setup.starts ?? []).find((candidate) => candidate.player === playerId && isTileInBounds(setup, candidate));
  if (start) {
    return { x: start.x, y: start.y };
  }
  const unit = (setup.units ?? []).find((candidate) => candidate.player === playerId && isTileInBounds(setup, candidate));
  if (unit) {
    return { x: unit.x, y: unit.y };
  }
  return setup.width > 0 && setup.height > 0 ? { x: Math.floor(setup.width / 2), y: Math.floor(setup.height / 2) } : null;
}

function isTileInBounds(setup, point) {
  return !!point && point.x >= 0 && point.y >= 0 && point.x < setup.width && point.y < setup.height;
}

function hasDiplomacy(setup, player, state, otherPlayer) {
  return (setup.diplomacy ?? []).some((rule) => rule.player === player && rule.state === state && rule.otherPlayer === otherPlayer);
}

function hasSharedVision(setup, player, enabled, otherPlayer) {
  return (setup.sharedVision ?? []).some((rule) => rule.player === player && rule.enabled === enabled && rule.otherPlayer === otherPlayer);
}
