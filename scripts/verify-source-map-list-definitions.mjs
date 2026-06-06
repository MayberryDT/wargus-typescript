import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const indexerSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const manifestSource = readFileSync("src/wargus/manifest.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const mapCommandSource = readFileSync("src/view/mapCommands.ts", "utf8");
const worldViewAssetSource = readFileSync("src/view/worldViewAssets.ts", "utf8");
const hudCommandExecutionSource = readFileSync("src/view/hudCommandExecution.ts", "utf8");
const campaignProgressSource = readFileSync("src/wargus/campaignProgress.ts", "utf8");
const sourceInputSource = readFileSync("src/view/sourceInput.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const errors = [];

function error(message) {
  errors.push(message);
}

const mapListUnits = (manifest.units ?? []).filter((unit) => unit.source?.startsWith("scripts/lists/maps/"));
const mapListSpells = (manifest.spells ?? []).filter((spell) => spell.source?.startsWith("scripts/lists/maps/"));
const mapListAnimations = (manifest.animations ?? []).filter((animation) => animation.source?.startsWith("scripts/lists/maps/"));

if (mapListUnits.length < 30) {
  error(`Expected broad source map-list unit coverage, found ${mapListUnits.length}.`);
}
if (mapListSpells.length < 30) {
  error(`Expected source map-list spell coverage for custom unit spawners, found ${mapListSpells.length}.`);
}
if (mapListAnimations.length < 1) {
  error("Expected source map-list animation coverage.");
}

const requiredUnits = {
  "unit-void-gateway": {
    name: "Void Gateway",
    image: "tilesets/summer/neutral/buildings/dark_portal.png",
    hitPoints: 5000,
    building: true
  },
  "unit-caanoo-townhall": {
    name: "Town Hall",
    image: "tilesets/summer/human/buildings/town_hall.png",
    hitPoints: 1200,
    building: true
  },
  "unit-evildragon": {
    name: "Evil Dragon",
    image: "orc/units/dragon.png",
    hitPoints: 9085,
    building: false
  },
  "unit-nomad": {
    name: "Nomad",
    image: "orc/units/troll_axethrower.png",
    hitPoints: 50,
    building: false
  }
};

for (const [id, expected] of Object.entries(requiredUnits)) {
  const unit = manifest.units.find((candidate) => candidate.id === id);
  if (!unit) {
    error(`Manifest is missing source map-list unit ${id}.`);
    continue;
  }
  if (!unit.source?.startsWith("scripts/lists/maps/")) {
    error(`${id} should be sourced from scripts/lists/maps, found ${unit.source ?? "missing"}.`);
  }
  for (const [field, value] of Object.entries(expected)) {
    if (unit[field] !== value) {
      error(`${id}.${field} expected ${JSON.stringify(value)}, found ${JSON.stringify(unit[field])}.`);
    }
  }
}

for (const spellId of ["spell-buildpoint-townhall", "spell-unit-footman", "spell-aid"]) {
  const spell = manifest.spells.find((candidate) => candidate.id === spellId);
  if (!spell) {
    error(`Manifest is missing source map-list spell ${spellId}.`);
  } else if (!spell.source?.startsWith("scripts/lists/maps/")) {
    error(`${spellId} should be sourced from scripts/lists/maps, found ${spell.source ?? "missing"}.`);
  }
}

for (const [spellId, unitTypeId] of Object.entries({
  "spell-buildpoint-townhall": "unit-buildpoint-townhall",
  "spell-unit-footman": "unit-footman",
  "spell-unit-nomad": "unit-nomad"
})) {
  const spell = manifest.spells.find((candidate) => candidate.id === spellId);
  const summon = spell?.summons?.find((candidate) => candidate.unitTypeId === unitTypeId);
  if (!summon) {
    error(`${spellId} is missing source summon unit ${unitTypeId}.`);
  }
  if (!spell?.actionTypes?.includes("summon")) {
    error(`${spellId} should preserve the source summon action type.`);
  }
  if (spellId.startsWith("spell-unit-") && summon?.timeToLive !== 99000) {
    error(`${spellId} should preserve source time-to-live 99000, found ${summon?.timeToLive ?? "missing"}.`);
  }
}

const aidSpell = manifest.spells.find((candidate) => candidate.id === "spell-aid");
const aidHitPointAdjust = aidSpell?.adjustVitals?.find((adjustment) => adjustment.variable === "hit-points");
if (aidHitPointAdjust?.amount !== 1) {
  error(`spell-aid should preserve source hit-points adjustment 1, found ${aidHitPointAdjust?.amount ?? "missing"}.`);
}

const orderPaladin = manifest.units.find((candidate) => candidate.id === "unit-order-paladin");
if (!orderPaladin?.canCastSpells?.includes("spell-aid")) {
  error("unit-order-paladin should preserve source spell-aid casting.");
}

for (const fragment of [
  "const mapListScriptFiles = files.filter",
  "const mapListScriptSources = new Map()",
  "for (const [scriptFile, source] of mapListScriptSources)",
  "for (const spell of parseSpellDefinitions(source))",
  "function usableImagePath",
  "latestStringAssignmentBefore(source, variableName, spellStart)"
]) {
  if (!indexerSource.includes(fragment)) {
    error(`Indexer is missing source map-list fragment: ${fragment}`);
  }
}

for (const [name, source, fragments] of [
  ["manifest-runtime", manifestSource, [
    "export function chooseInitialMap",
    "export function mapsForPicker",
    "export function filteredMapPickerMatches",
    "export function campaignMissionKey",
    "export function nextCampaignMapFor",
    "export function choosePreloadedUnitSprites",
    "export function shouldPreloadSourceUnitSprite",
    "unit.canAttack || isCasterDefinition(unit)",
    "isNavalCombatOrUtilityDefinition(unit)"
  ]],
  ["runtime", ordersSource, [
    "| `source-adjust-vitals:${string}`",
    "| `source-adjust-variable:${string}`",
    "function castSourceAdjustVitalsAt",
    "function canIssueSourceAdjustVitalsAt",
    "function castSourceAdjustVariableAt",
    "function canIssueSourceAdjustVariableAt",
    "target.hitPoints = Math.min(target.maxHitPoints",
    "| `source-summon:${string}`",
    "spell?.actionTypes.includes(\"adjust-vitals\") && spell.adjustVitals.some((adjustment) => adjustment.variable === \"hit-points\")",
    "return `source-adjust-vitals:${spellId}`",
    "return `source-summon:${spellId}`",
    "return `source-adjust-variable:${spellId}`",
    "function castSourceSummonAt",
    "function sourceSummonTarget",
    "summon.requireCorpse",
    "findSourceSummonCorpseNearPoint",
    "world.corpses = (world.corpses ?? []).filter((candidate) => candidate.id !== corpse.id)",
    "findSpellSpawnTileNear(world, x, y, unitDefinition)",
    "findSpellSpawnTileNear(world, corpse.x, corpse.y, unitDefinition)",
    "unit.lifetimeSeconds = spellSummonLifetimeSeconds(world, spellId, unitDefinition.id",
    "addSpellEffect(world, \"summon\", caster.player, unit.x, unit.y",
    "sourceSpellMissileId(world, spellId), spellId"
  ]],
  ["save/load", saveSource, [
    "sourceUnitLifetimeSecondsForSave(world, unit.typeId, unit.decayRate)",
    "...spell.summons",
    "summon.unitTypeId === unitTypeId && typeof summon.timeToLive === \"number\" && summon.timeToLive > 0"
  ]],
  ["main", mainSource, [
    "chooseInitialMap(manifest)",
    "applyMapPickerKey(mapPickerState, event, findMapPickerMatches)",
    "recordCampaignProgress(campaignProgressState, activeMap, world)",
    "nextCampaignMapFor(activeMap, manifest)",
  ]],
  ["world view assets", worldViewAssetSource, [
    "choosePreloadedUnitSprites(manifest.units)"
  ]],
  ["map commands", mapCommandSource, [
    "mapsForPicker(context.manifest)"
  ]],
  ["hud command execution", hudCommandExecutionSource, [
    "const spellCommand = sourceSpellCommandForSpellId(world, spellId)",
    "pendingWorldCommand: { kind: \"spell\", command: spellCommand }"
  ]],
  ["campaign progress", campaignProgressSource, [
    "campaignMissionKey(activeMap)",
    "export function loadCampaignProgress",
    "localStorage.setItem(CAMPAIGN_PROGRESS_KEY"
  ]],
  ["hud", hudSource, [
    "sourceSpellCommandForSpellId",
    "sourceFilteredPickerMaps(picker).slice(0, 10)",
    "sourceCampaignLabelForMap(map)",
    "sourceCampaignMissionComplete(map, completedCampaignMissions)",
    "sourceSaveTitle(activeSaveSummary)"
  ]],
  ["source ui helpers", sourceUiHelpersSource, [
    "export function sourceFilteredPickerMaps",
    "const numeric = Number(query)",
    "return [picker.maps[numeric - 1]].filter",
    "export function sourceCampaignLabelForMap",
    "export function sourceCampaignMissionComplete",
    "completedCampaignMissions.includes(`${map.campaignTitle}:${map.campaignMissionIndex}`)",
    "export function sourceSaveTitle"
  ]],
  ["source input", sourceInputSource, [
    "export function applyMapPickerKey",
    "selectedMap: findMatches(state.maps, state.query)[0] ?? null",
    "export function matchOverlayCommandForKey",
    "return \"next-campaign\""
  ]]
]) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      error(`${name} is missing source summon fragment: ${fragment}`);
    }
  }
}

for (const fragment of [
  "function choosePreloadedUnitSprites",
  "function shouldPreloadSourceUnitSprite",
  "function mapsForPicker",
  "function nextCampaignMapFor"
]) {
  if (mainSource.includes(fragment)) {
    error(`Main should use manifest helpers instead of local source-data helper: ${fragment}`);
  }
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Source map-list definition errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Source map-list definitions verified (${mapListUnits.length} units, ${mapListSpells.length} spells, ${mapListAnimations.length} animations).`);
