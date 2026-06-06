import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const errors = [];

function error(message) {
  errors.push(message);
}

function campaignScriptPath(setupPath) {
  if (!setupPath?.startsWith("campaigns/")) {
    return null;
  }
  const plainSetupPath = setupPath.replace(/\.gz$/, "");
  const candidate = plainSetupPath.replace(/\.sms$/, "_c.sms");
  return existsSync(path.join(manifest.dataRoot, candidate)) ? candidate : null;
}

function findBalancedParenEnd(source, openIndex) {
  let depth = 0;
  let inString = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const previous = source[index - 1];
    if (char === '"' && previous !== "\\") {
      inString = !inString;
    }
    if (inString) {
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth === 0) {
      return index;
    }
  }
  return source.length;
}

function defeatTriggerBodies(source) {
  const bodies = [];
  let start = 0;
  while ((start = source.indexOf("AddTrigger(", start)) !== -1) {
    const openIndex = source.indexOf("(", start);
    const closeIndex = findBalancedParenEnd(source, openIndex);
    const call = source.slice(openIndex + 1, closeIndex);
    const match = call.match(/function\(\) return ([\s\S]*?) end\s*,\s*function\(\) return ActionDefeat\(\) end/);
    if (match) {
      bodies.push(match[1]);
    }
    start = closeIndex + 1;
  }
  return bodies;
}

function parseSourcePlayer(value) {
  return value === "GetThisPlayer()" ? "self" : Number(value);
}

function expectedDefeatRequirements(source) {
  const requirements = [];
  for (const body of defeatTriggerBodies(source)) {
    const playerDefeated = body.match(/GetPlayerData\(\s*(GetThisPlayer\(\)|\d+)\s*,\s*"TotalNumUnits"\s*\)\s*==\s*0/);
    if (playerDefeated) {
      requirements.push({ kind: "player-defeated", player: parseSourcePlayer(playerDefeated[1]) });
      continue;
    }
    const countMatches = [...body.matchAll(/GetPlayerData\(\s*(GetThisPlayer\(\)|\d+)\s*,\s*"UnitTypesCount"\s*,\s*"([^"]+)"\s*\)\s*==\s*0/g)];
    if (countMatches.length > 0 && countMatches.every((match) => match[2] === countMatches[0][2])) {
      requirements.push({
        kind: "unit-group-destroyed",
        unitTypeId: countMatches[0][2],
        players: countMatches.map((match) => parseSourcePlayer(match[1]))
      });
      continue;
    }
    const countBelow = body.match(/\(([\s\S]*?)\)\s*<\s*(\d+)/);
    if (countBelow) {
      const parts = [...countBelow[1].matchAll(/GetPlayerData\(\s*(GetThisPlayer\(\)|\d+)\s*,\s*"UnitTypesCount"\s*,\s*"([^"]+)"\s*\)/g)];
      if (parts.length > 0 && parts.every((match) => match[2] === parts[0][2])) {
        requirements.push({
          kind: "unit-count-below",
          unitTypeId: parts[0][2],
          players: parts.map((match) => parseSourcePlayer(match[1])),
          threshold: Number(countBelow[2])
        });
      }
    }
  }
  return requirements;
}

function samePlayers(left, right) {
  return left.length === right.length && left.every((player, index) => player === right[index]);
}

function hasRequirement(requirements, expected) {
  return requirements.some((candidate) => {
    if (candidate.kind !== expected.kind) {
      return false;
    }
    if (expected.kind === "player-defeated") {
      return candidate.player === expected.player;
    }
    if (expected.kind === "unit-group-destroyed") {
      return candidate.unitTypeId === expected.unitTypeId && samePlayers(candidate.players ?? [], expected.players);
    }
    return candidate.unitTypeId === expected.unitTypeId
      && candidate.threshold === expected.threshold
      && samePlayers(candidate.players ?? [], expected.players);
  });
}

const unitIds = new Set((manifest.units ?? []).map((unit) => unit.id));
const mapsWithDefeatRequirements = [];
let playerDefeatedRequirements = 0;
let unitGroupRequirements = 0;
let countBelowRequirements = 0;

for (const map of manifest.maps ?? []) {
  const scriptPath = campaignScriptPath(map.setupPath);
  if (!scriptPath) {
    continue;
  }
  const source = readFileSync(path.join(manifest.dataRoot, scriptPath), "utf8");
  const expected = expectedDefeatRequirements(source);
  if (expected.length > 0) {
    mapsWithDefeatRequirements.push(map.path);
  }
  for (const requirement of expected) {
    if (requirement.kind === "player-defeated") {
      playerDefeatedRequirements += 1;
    } else if (requirement.kind === "unit-group-destroyed") {
      unitGroupRequirements += 1;
      if (!unitIds.has(requirement.unitTypeId)) {
        error(`${map.path} source defeat trigger references unknown unit ${requirement.unitTypeId}.`);
      }
    } else {
      countBelowRequirements += 1;
      if (!unitIds.has(requirement.unitTypeId)) {
        error(`${map.path} source defeat trigger references unknown unit ${requirement.unitTypeId}.`);
      }
    }
    if (!hasRequirement(map.defeatRequirements ?? [], requirement)) {
      error(`${map.path} is missing source defeat requirement ${JSON.stringify(requirement)}.`);
    }
    if (!hasRequirement(map.setup?.defeatRequirements ?? [], requirement)) {
      error(`${map.setupPath} setup summary is missing source defeat requirement ${JSON.stringify(requirement)}.`);
    }
  }
}

if (playerDefeatedRequirements < 50) {
  error(`Expected broad source player-defeated defeat coverage, got ${playerDefeatedRequirements}.`);
}
if (unitGroupRequirements < 15) {
  error(`Expected source hero/unit-group defeat coverage, got ${unitGroupRequirements}.`);
}
if (countBelowRequirements < 1) {
  error("Expected at least one source unit-count-below defeat requirement.");
}

for (const fragment of [
  "export type WargusDefeatRequirement",
  '{ kind: "unit-group-destroyed"; unitTypeId: string; players: WargusSourcePlayer[] }',
  '{ kind: "unit-count-below"; unitTypeId: string; players: WargusSourcePlayer[]; threshold: number }'
]) {
  if (!typesSource.includes(fragment)) {
    error(`Types are missing source defeat fragment: ${fragment}`);
  }
}

for (const fragment of [
  "function parseDefeatRequirements",
  'parseTriggerBodies(source, "ActionDefeat")',
  'defeatRequirements: parseDefeatRequirements(campaignSource)'
]) {
  if (!indexSource.includes(fragment)) {
    error(`Indexer is missing source defeat fragment: ${fragment}`);
  }
}

for (const fragment of [
  "function hasFailedSourceDefeatRequirement",
  "function isDefeatRequirementMet",
  'requirement.kind === "unit-count-below"',
  "sourceRequirementPlayer(world, player)"
]) {
  if (!ordersSource.includes(fragment)) {
    error(`Runtime is missing source defeat fragment: ${fragment}`);
  }
}

for (const fragment of [
  "defeatRequirements?: WorldState[\"defeatRequirements\"]",
  "defeatRequirements: world.defeatRequirements",
  "function normalizeDefeatRequirements",
  "map.defeatRequirements ?? []"
]) {
  if (!saveSource.includes(fragment)) {
    error(`Save/load is missing source defeat fragment: ${fragment}`);
  }
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Source defeat requirement errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Source defeat requirements verified (${playerDefeatedRequirements} player-defeated, ${unitGroupRequirements} unit-group, ${countBelowRequirements} count-below clauses across ${mapsWithDefeatRequirements.length} campaign maps).`);
