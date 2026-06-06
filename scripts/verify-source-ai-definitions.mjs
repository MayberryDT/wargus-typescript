import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const dataRoot = process.env.WARGUS_DATA_ROOT || "/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/wargus-local/share/games/stratagus/wargus";
const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const errors = [];
const reticleSetup = JSON.parse(readFileSync("public/wargus/maps/setups/184-_4_reticle.sms.json", "utf8"));

function error(message) {
  errors.push(message);
}

function stripLuaComments(source) {
  return source
    .replace(/--\[\[[\s\S]*?\]\]/g, "")
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

function walk(dir, root = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(absolute, root);
    }
    return entry.isFile() && absolute.endsWith(".lua")
      ? [path.relative(root, absolute).replaceAll(path.sep, "/")]
      : [];
  });
}

const expectedDefinitions = new Map();
for (const file of walk(path.join(dataRoot, "scripts"), dataRoot)) {
  const source = stripLuaComments(readFileSync(path.join(dataRoot, file), "utf8"));
  const defaultNames = parseAiDefaultNames(source);
  for (const match of source.matchAll(/DefineAi\(\s*"([^"]+)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g)) {
    expectedDefinitions.set(match[1], {
      name: match[1],
      race: match[2],
      class: match[3],
      script: match[4],
      defaultName: defaultNames.get(match[4]) ?? null,
      source: file
    });
  }
}

function parseAiDefaultNames(source) {
  const names = new Map();
  const matches = [...source.matchAll(/function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)/g)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const bodyStart = (match.index ?? 0) + match[0].length;
    const bodyEnd = matches[index + 1]?.index ?? source.length;
    const body = source.slice(bodyStart, bodyEnd);
    const defaultName = body.match(/AiJadeite_Set_Name_2010\(\s*"([^"]+)"\s*\)/)?.[1]
      ?? body.match(/AiCharacter_Set_Name_2015\(\s*"([^"]+)"\s*\)/)?.[1]
      ?? null;
    if (defaultName) {
      names.set(match[1], defaultName);
    }
  }
  return names;
}

const actualDefinitions = new Map((manifest.aiDefinitions ?? []).map((definition) => [definition.name, definition]));

if (actualDefinitions.size !== expectedDefinitions.size) {
  error(`Expected ${expectedDefinitions.size} uncommented source AI definitions, found ${actualDefinitions.size}.`);
}

for (const [name, expected] of expectedDefinitions) {
  const actual = actualDefinitions.get(name);
  if (!actual) {
    error(`Missing source AI definition ${name}.`);
    continue;
  }
  for (const field of ["race", "class", "script", "defaultName", "source"]) {
    if (actual[field] !== expected[field]) {
      error(`${name} ${field} mismatch: expected ${expected[field]}, got ${actual[field]}.`);
    }
  }
}

for (const [name, defaultName] of [["ai_jadeite_2010", "Jadeite"], ["ai_zoisite_2013", "Zoisite"]]) {
  if (actualDefinitions.get(name)?.defaultName !== defaultName) {
    error(`Expected ${name} to preserve source AI default name ${defaultName}.`);
  }
}

for (const name of ["Soul", "Tesuni", "Regulus"]) {
  if (!reticleSetup.players.some((player) => player.ai === name)) {
    error(`Reticle setup should preserve source SetAiType personality ${name}.`);
  }
}

for (const name of ["Passive", "Land Attack", "Sea Attack", "Air Attack", "Jadeite", "Iguara", "wc2-sea-attack", "ai-active"]) {
  if (!actualDefinitions.has(name)) {
    error(`Expected manifest to include ${name} AI definition.`);
  }
}

for (const name of ["Nephrite", "Zoisite"]) {
  if (actualDefinitions.has(name)) {
    error(`${name} should stay omitted because it is inside a Lua block comment in scripts/ai/names.lua.`);
  }
}

const snippets = [
  [typesSource, "export interface WargusAiDefinition"],
  [typesSource, "aiDefinitions?: WargusAiDefinition[]"],
  [typesSource, "defaultName: string | null"],
  [indexSource, "function parseAiDefinitions"],
  [indexSource, "function parseAiDefaultNames"],
  [indexSource, "defaultName: defaultNames.get(match[4]) ?? null"],
  [indexSource, "uncommented.matchAll(/DefineAi"],
  [indexSource, "aiDefinitions: aiDefinitions.length"],
  [worldSource, "sourceAiDefinitions: WargusAiDefinition[] = []"],
  [worldSource, "aiDefinitions: sourceAiDefinitions"],
  [worldSource, "playersFromSetup(setup, worldEngineSettings, sourceAiDefinitions)"],
  [worldSource, "function sourceAiPlayerDisplayName"],
  [worldSource, "function sourceAiDefinitionNameIsDisplayable"],
  [worldSource, "function sourceAiNamePlayerFallback"],
  [worldSource, "definition.name === aiName"],
  [worldSource, "if (definition.defaultName)"],
  [worldSource, 'definition.class === "wc2-skirmish"'],
  [worldSource, 'definition.script !== "AiLandAttack"'],
  [worldSource, 'const SOURCE_SETUP_PERSONALITY_AI_NAMES = new Set(["Soul", "Tesuni", "Regulus"])'],
  [worldSource, "aiDefinition?.class"],
  [worldSource, "aiDefinition?.script"],
  [mainSource, "manifest.engineSettings, manifest.aiDefinitions"],
  [saveSource, "manifest.engineSettings, manifest.aiDefinitions"]
];

for (const [source, snippet] of snippets) {
  if (!source.includes(snippet)) {
    error(`Expected source wiring snippet: ${snippet}`);
  }
}

if (worldSource.includes(`/^[A-Z][A-Za-z']+(?: [A-Z][A-Za-z']+)*$/`)) {
  error("AI player display-name fallback should use source AI definitions or explicit setup personalities, not a title-case regex.");
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Source AI definition errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Source AI definitions verified (${actualDefinitions.size} uncommented DefineAi records).`);
