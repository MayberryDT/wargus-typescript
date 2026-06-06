import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const errors = [];

function error(message) {
  errors.push(message);
}

function campaignScriptPath(setupPath) {
  if (!setupPath?.startsWith("campaigns/")) {
    return null;
  }
  const candidate = setupPath.replace(/\.gz$/, "").replace(/\.sms$/i, "_c.sms");
  return existsSync(path.join(manifest.dataRoot, candidate)) ? candidate : null;
}

function sourceAiTypeOverrides(source) {
  return [...source.matchAll(/SetAiType\(\s*(\d+)\s*,\s*"([^"]+)"\s*\)/g)]
    .map((match) => ({ player: Number(match[1]), ai: match[2] }));
}

function hasRule(rules, expected) {
  return (rules ?? []).some((rule) => rule.player === expected.player && rule.ai === expected.ai);
}

let mapsWithOverrides = 0;
let checkedOverrides = 0;

for (const map of manifest.maps ?? []) {
  const scriptPath = campaignScriptPath(map.setupPath);
  if (!scriptPath) {
    continue;
  }
  const expected = sourceAiTypeOverrides(readFileSync(path.join(manifest.dataRoot, scriptPath), "utf8"));
  if (expected.length === 0) {
    continue;
  }
  mapsWithOverrides += 1;
  checkedOverrides += expected.length;
  const setup = map.setupJson ? JSON.parse(readFileSync(path.join("public/wargus", map.setupJson), "utf8")) : null;
  for (const rule of expected) {
    if (!hasRule(map.aiTypeOverrides, rule)) {
      error(`${map.path} is missing source SetAiType override ${JSON.stringify(rule)}.`);
    }
    if (!hasRule(map.setup?.aiTypeOverrides, rule)) {
      error(`${map.path} setup summary is missing source SetAiType override ${JSON.stringify(rule)}.`);
    }
    if (!hasRule(setup?.aiTypeOverrides, rule)) {
      error(`${map.setupJson} setup data is missing source SetAiType override ${JSON.stringify(rule)}.`);
    }
    const setupPlayer = (setup?.players ?? []).find((player) => player.player === rule.player);
    if (!setupPlayer || setupPlayer.ai !== rule.ai) {
      error(`${map.setupJson} player ${rule.player} has ai=${setupPlayer?.ai ?? "<missing>"}, expected source override ${rule.ai}.`);
    }
  }
}

if (mapsWithOverrides !== 1 || checkedOverrides !== 1) {
  error(`Expected Human VIII SetAiType coverage only, got maps=${mapsWithOverrides}, overrides=${checkedOverrides}.`);
}

for (const fragment of [
  "export interface WargusAiTypeRule",
  "aiTypeOverrides?: WargusAiTypeRule[]",
  "aiTypeOverrides: WargusAiTypeRule[]"
]) {
  if (!typesSource.includes(fragment)) {
    error(`Types are missing SetAiType fragment: ${fragment}`);
  }
}

for (const fragment of [
  "function parseAiTypeOverrides",
  "aiTypeOverrides: parseAiTypeOverrides(campaignSource)",
  "const aiTypeOverrides = new Map((presentation.aiTypeOverrides ?? [])",
  "ai: aiTypeOverrides.get(player) ?? null",
  "for (const [player, ai] of aiTypeOverrides)",
  "ensurePlayer(player).ai = ai",
  "map.aiTypeOverrides = campaign.aiTypeOverrides",
  "aiTypeOverrides: setup.aiTypeOverrides"
]) {
  if (!indexSource.includes(fragment)) {
    error(`Indexer is missing SetAiType fragment: ${fragment}`);
  }
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Source SetAiType errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Source SetAiType overrides verified (${checkedOverrides} override across ${mapsWithOverrides} campaign map).`);
