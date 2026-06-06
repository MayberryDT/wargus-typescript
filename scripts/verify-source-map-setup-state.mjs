import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const indexerSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const errors = [];

function error(message) {
  errors.push(message);
}

function sourceSetupState(source) {
  const state = {};
  for (const match of source.matchAll(/SetFogOfWar\(\s*(true|false)\s*\)/g)) {
    state.fogOfWar = match[1] === "true";
  }
  for (const match of source.matchAll(/SetGamePaused\(\s*(true|false)\s*\)/g)) {
    state.gamePaused = match[1] === "true";
  }
  for (const match of source.matchAll(/SetGameSpeed\(\s*(-?\d+(?:\.\d+)?)\s*\)/g)) {
    state.gameSpeed = Number(match[1]);
  }
  return state;
}

function hasState(state) {
  return Object.keys(state ?? {}).length > 0;
}

let mapsWithSourceState = 0;
let fogMaps = 0;

for (const map of manifest.maps ?? []) {
  if (!map.setupPath || !map.setupJson) {
    continue;
  }
  const source = readFileSync(path.join(manifest.dataRoot, map.setupPath), "utf8");
  const expected = sourceSetupState(source);
  if (!hasState(expected)) {
    continue;
  }
  mapsWithSourceState += 1;
  if (typeof expected.fogOfWar === "boolean") {
    fogMaps += 1;
  }
  const setup = JSON.parse(readFileSync(path.join("public/wargus", map.setupJson), "utf8"));
  for (const [field, value] of Object.entries(expected)) {
    if (map.setup?.state?.[field] !== value) {
      error(`${map.path} manifest summary missing setup state ${field}=${String(value)}.`);
    }
    if (setup.state?.[field] !== value) {
      error(`${map.setupJson} setup data missing source setup state ${field}=${String(value)}.`);
    }
  }
}

if (mapsWithSourceState !== 3 || fogMaps !== 3) {
  error(`Expected 3 presented map setups with source SetFogOfWar state, got maps=${mapsWithSourceState}, fog=${fogMaps}.`);
}

for (const fragment of [
  "const state = {}",
  "SetFogOfWar\\(\\s*(true|false)",
  "SetGamePaused\\(\\s*(true|false)",
  "SetGameSpeed\\(\\s*(-?\\d+(?:\\.\\d+)?)",
  "state: setup.state",
  "state,"
]) {
  if (!indexerSource.includes(fragment)) {
    error(`Indexer is missing setup-state fragment: ${fragment}`);
  }
}

for (const fragment of [
  "export interface WargusMapSetupState",
  "state?: WargusMapSetupState",
  "fogOfWar?: boolean",
  "gamePaused?: boolean",
  "gameSpeed?: number"
]) {
  if (!typesSource.includes(fragment)) {
    error(`Types are missing setup-state fragment: ${fragment}`);
  }
}

for (const fragment of [
  "engineSettingsWithSetupState(engineSettings, setup?.state)",
  "const next = structuredClone(engineSettings)",
  "next.fogOfWarEnabled = state.fogOfWar",
  "next.sourceGameSpeedDefault = state.gameSpeed",
  "engineSettings: worldEngineSettings"
]) {
  if (!worldSource.includes(fragment)) {
    error(`World creation is missing setup-state fragment: ${fragment}`);
  }
}

for (const fragment of [
  "function sourceSetupPaused",
  "paused = sourceSetupPaused(setup)"
]) {
  if (!mainSource.includes(fragment)) {
    error(`Main runtime is missing setup pause-state fragment: ${fragment}`);
  }
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Source map setup state errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Source map setup state verified (${mapsWithSourceState} maps, ${fogMaps} source fog overrides).`);
