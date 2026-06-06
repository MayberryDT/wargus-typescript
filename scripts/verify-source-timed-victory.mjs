import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const errors = [];

function error(message) {
  errors.push(message);
}

function sourceTimedVictory(source) {
  const match = source.match(/local\s+cycle2Win\s*=\s*(\d+)[\s\S]*?PlaySound\("rescue \(human\)"\)[\s\S]*?cycle2Win\s*=\s*cycle2Win\s*-\s*1[\s\S]*?cycle2Win\s*<=\s*0[\s\S]*?ActionVictory\(\)/);
  return match ? { kind: "circle-of-power", delayTicks: Number(match[1]), soundId: "rescue" } : null;
}

function hasTrigger(triggers, expected) {
  return (triggers ?? []).some((trigger) => (
    trigger.kind === expected.kind
    && trigger.delayTicks === expected.delayTicks
    && trigger.soundId === expected.soundId
  ));
}

const sourcePath = "campaigns/human/level02h_c.sms";
const expected = sourceTimedVictory(readFileSync(path.join(manifest.dataRoot, sourcePath), "utf8"));
if (!expected) {
  error(`${sourcePath} no longer has the expected source rescue countdown trigger.`);
}

const mapsWithTriggers = manifest.maps.filter((map) => (map.timedVictoryTriggers ?? []).length > 0);
const map = manifest.maps.find((candidate) => candidate.setupPath?.replace(/\.gz$/i, "") === "campaigns/human/level02h.sms");
if (!map) {
  error("Manifest is missing Human II campaign map.");
} else if (expected) {
  const setup = JSON.parse(readFileSync(path.join("public/wargus", map.setupJson), "utf8"));
  if (!hasTrigger(map.timedVictoryTriggers, expected)) {
    error(`${map.path} is missing source timed victory trigger ${JSON.stringify(expected)}.`);
  }
  if (!hasTrigger(map.setup?.timedVictoryTriggers, expected)) {
    error(`${map.path} setup summary is missing source timed victory trigger ${JSON.stringify(expected)}.`);
  }
  if (!hasTrigger(setup.timedVictoryTriggers, expected)) {
    error(`${map.setupJson} setup data is missing source timed victory trigger ${JSON.stringify(expected)}.`);
  }
}

if (mapsWithTriggers.length !== 1) {
  error(`Expected exactly one source timed-victory map, found ${mapsWithTriggers.length}.`);
}

const typeSource = readFileSync("src/wargus/types.ts", "utf8");
for (const fragment of [
  "timedVictoryTriggers?: WargusTimedVictoryTrigger[]",
  "export interface WargusTimedVictoryTrigger",
  'kind: "circle-of-power"'
]) {
  if (!typeSource.includes(fragment)) {
    error(`Types are missing timed-victory fragment: ${fragment}`);
  }
}

const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
for (const fragment of [
  "timedVictoryTriggers: parseTimedVictoryTriggers(campaignSource)",
  "function parseTimedVictoryTriggers",
  "PlaySound"
]) {
  if (!indexSource.includes(fragment)) {
    error(`Indexer is missing timed-victory fragment: ${fragment}`);
  }
}

const worldSource = readFileSync("src/simulation/world.ts", "utf8");
for (const fragment of [
  'timedVictoryTriggers: WargusMapSetup["timedVictoryTriggers"]',
  "pendingTimedVictory:",
  "timedVictoryTriggers: setup?.timedVictoryTriggers ?? map.timedVictoryTriggers ?? []"
]) {
  if (!worldSource.includes(fragment)) {
    error(`World creation is missing timed-victory fragment: ${fragment}`);
  }
}

const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
for (const fragment of [
  "function isTimedVictoryTriggerComplete",
  "world.pendingTimedVictory.remainingTicks -= 1",
  "emitSoundEvent(world, trigger.soundId, world.visibilityPlayer)",
  "isCircleOfPowerObjectiveMet(world) && world.timedVictoryTriggers.length === 0"
]) {
  if (!ordersSource.includes(fragment)) {
    error(`Runtime is missing timed-victory fragment: ${fragment}`);
  }
}

const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
for (const fragment of [
  'timedVictoryTriggers?: WorldState["timedVictoryTriggers"]',
  'pendingTimedVictory?: WorldState["pendingTimedVictory"]',
  "world.timedVictoryTriggers = normalizeTimedVictoryTriggers",
  "world.pendingTimedVictory = normalizePendingTimedVictory",
  "const sourceDelayTicks = Math.max(0, Math.floor(triggers[triggerIndex]?.delayTicks ?? 0))",
  "remainingTicks: Math.max(0, Math.min(sourceDelayTicks, Math.floor(finiteNumberOr(record.remainingTicks, sourceDelayTicks))))"
]) {
  if (!saveSource.includes(fragment)) {
    error(`Save/load is missing timed-victory fragment: ${fragment}`);
  }
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Source timed-victory errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Source timed victory verified (${expected.delayTicks}-tick rescue countdown on Human II).`);
