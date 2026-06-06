import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
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

function sourceInitialHitPointRules(source) {
  const rules = [];
  for (const match of source.matchAll(/for\s+\w+\s*,\s*unit\s+in\s+ipairs\(GetUnits\((\d+)\)\)\s+do\s+if\s+GetUnitVariable\(unit,\s*"Ident"\)\s*==\s*"([^"]+)"\s*then\s+SetUnitVariable\(unit,\s*"HitPoints",\s*(-?\d+)\)\s+else\s+SetUnitVariable\(unit,\s*"HitPoints",\s*(-?\d+)\)\s+end\s+end/g)) {
    rules.push({ player: Number(match[1]), unitTypeId: match[2], hitPoints: Number(match[3]) });
    rules.push({ player: Number(match[1]), unitTypeId: null, hitPoints: Number(match[4]) });
  }
  return rules;
}

function sameRule(left, right) {
  return left.player === right.player && left.unitTypeId === right.unitTypeId && left.hitPoints === right.hitPoints;
}

let mapsWithRules = 0;
let checkedRules = 0;
let checkedUnits = 0;

for (const map of manifest.maps ?? []) {
  const scriptPath = campaignScriptPath(map.setupPath);
  if (!scriptPath) {
    continue;
  }
  const source = readFileSync(path.join(manifest.dataRoot, scriptPath), "utf8");
  const expectedRules = sourceInitialHitPointRules(source);
  if (expectedRules.length === 0) {
    continue;
  }
  mapsWithRules += 1;
  checkedRules += expectedRules.length;
  const setup = map.setupJson ? JSON.parse(readFileSync(path.join("public/wargus", map.setupJson), "utf8")) : null;
  for (const rule of expectedRules) {
    if (!(map.initialUnitHitPointRules ?? []).some((candidate) => sameRule(candidate, rule))) {
      error(`${map.path} is missing initial hit-point rule ${JSON.stringify(rule)}.`);
    }
    if (!(map.setup?.initialUnitHitPointRules ?? []).some((candidate) => sameRule(candidate, rule))) {
      error(`${map.path} setup summary is missing initial hit-point rule ${JSON.stringify(rule)}.`);
    }
    if (!(setup?.initialUnitHitPointRules ?? []).some((candidate) => sameRule(candidate, rule))) {
      error(`${map.setupJson} setup data is missing initial hit-point rule ${JSON.stringify(rule)}.`);
    }
  }
  for (const unit of setup?.units ?? []) {
    const exact = expectedRules.find((rule) => rule.player === unit.player && rule.unitTypeId === unit.typeId);
    const fallback = expectedRules.find((rule) => rule.player === unit.player && rule.unitTypeId === null);
    const expectedHitPoints = exact?.hitPoints ?? fallback?.hitPoints ?? null;
    if (expectedHitPoints !== null) {
      checkedUnits += 1;
      if (unit.hitPoints !== expectedHitPoints) {
        error(`${map.setupJson} unit ${unit.typeId} player ${unit.player} has hitPoints=${unit.hitPoints}, expected ${expectedHitPoints}.`);
      }
    }
  }
}

if (mapsWithRules !== 1 || checkedRules !== 2 || checkedUnits < 1) {
  error(`Expected Human XIII initial hit-point coverage only, got maps=${mapsWithRules}, rules=${checkedRules}, units=${checkedUnits}.`);
}

for (const fragment of [
  "export interface WargusInitialUnitHitPointRule",
  "initialUnitHitPointRules?: WargusInitialUnitHitPointRule[]",
  "hitPoints: number | null;"
]) {
  if (!typesSource.includes(fragment)) {
    error(`Types are missing source initial hit-point fragment: ${fragment}`);
  }
}

for (const fragment of [
  "function parseInitialUnitHitPointRules",
  "initialUnitHitPointRules: parseInitialUnitHitPointRules(campaignSource)",
  "initialHitPointsForMapUnit"
]) {
  if (!indexSource.includes(fragment)) {
    error(`Indexer is missing source initial hit-point fragment: ${fragment}`);
  }
}

for (const fragment of [
  "hitPoints: setupUnit?.hitPoints ?? null",
  "const initialHitPoints = Math.max(1, Math.min(maxHitPoints",
  "hitPoints: initialHitPoints"
]) {
  if (!worldSource.includes(fragment)) {
    error(`World creation is missing source initial hit-point fragment: ${fragment}`);
  }
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Source initial hit-point errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Source initial hit points verified (${checkedRules} rules, ${checkedUnits} setup units across ${mapsWithRules} campaign map).`);
