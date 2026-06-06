import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const mapsByPath = new Map((manifest.maps ?? []).map((map) => [map.path, map]));
const errors = [];
let missionReferences = 0;
let briefingVoiceReferences = 0;

function error(message) {
  errors.push(message);
}

for (const campaign of manifest.campaigns ?? []) {
  const seenIndexes = new Set();
  for (const mission of campaign.missions ?? []) {
    missionReferences += 1;
    if (seenIndexes.has(mission.index)) {
      error(`${campaign.title}: duplicate mission index ${mission.index}`);
    }
    seenIndexes.add(mission.index);
    const map = mapsByPath.get(mission.mapPath);
    if (!map) {
      error(`${campaign.title} mission ${mission.index}: missing map ${mission.mapPath}`);
      continue;
    }
    if (!map.setupJson) {
      error(`${campaign.title} mission ${mission.index}: map has no browser setup ${mission.mapPath}`);
    } else if (!existsSync(`public/wargus/${map.setupJson}`)) {
      error(`${campaign.title} mission ${mission.index}: missing setup json ${map.setupJson}`);
    }
    if (mission.setupPath && !existsSync(path.join(manifest.dataRoot, mission.setupPath))) {
      error(`${campaign.title} mission ${mission.index}: missing source setup ${mission.setupPath}`);
    }
    if (map.campaignTitle !== campaign.title || map.campaignMissionIndex !== mission.index) {
      error(`${campaign.title} mission ${mission.index}: map campaign metadata mismatch`);
    }
  }
  const expectedIndexes = [...Array(seenIndexes.size)].map((_, index) => index + 1);
  for (const index of expectedIndexes) {
    if (!seenIndexes.has(index)) {
      error(`${campaign.title}: missing mission index ${index}`);
    }
  }
}

for (const map of manifest.maps ?? []) {
  for (const file of map.briefingVoiceFiles ?? []) {
    briefingVoiceReferences += 1;
    if (!existsSync(`public/wargus/sounds/${file}`)) {
      error(`${map.path}: missing briefing voice file ${file}`);
    }
  }
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Campaign reference errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Campaign references verified (${missionReferences} missions, ${briefingVoiceReferences} briefing voice files checked).`);
