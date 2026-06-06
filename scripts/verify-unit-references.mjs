import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const unitIds = new Set((manifest.units ?? []).map((unit) => unit.id));
const spellIds = new Set((manifest.spells ?? []).map((spell) => spell.id));
const validResources = new Set(["gold", "wood", "oil", "time", "1"]);
const validTransportRules = new Set(["LandUnit", "SeaUnit", "AirUnit"]);
const validConstructionTypes = new Set((manifest.constructions ?? []).map((construction) => construction.id));
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const renderWorldSource = readFileSync("src/view/renderWorld.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const errors = [];
let references = 0;

function check(kind, owner, value, validSet) {
  if (!value) {
    return;
  }
  references += 1;
  if (!validSet.has(value)) {
    errors.push(`${kind} ${owner}: unknown ${value}`);
  }
}

for (const unit of manifest.units ?? []) {
  check("unit corpse", unit.id, unit.corpseTypeId, unitIds);
  check("unit construction type", unit.id, unit.constructionTypeId, validConstructionTypes);
  check("unit gives resource", unit.id, unit.givesResource, validResources);
  for (const spellId of unit.canCastSpells ?? []) {
    check("unit spell capability", unit.id, spellId, spellIds);
  }
  for (const resource of unit.gatherResources ?? []) {
    check("unit gather resource", unit.id, resource, validResources);
  }
  for (const resource of Object.keys(unit.resourceCapacity ?? {})) {
    check("unit resource capacity", unit.id, resource, validResources);
  }
  for (const resource of Object.keys(unit.resourceStep ?? {})) {
    check("unit resource step", unit.id, resource, validResources);
  }
  for (const resource of Object.keys(unit.waitAtResource ?? {})) {
    check("unit wait-at-resource", unit.id, resource, validResources);
  }
  for (const resource of Object.keys(unit.waitAtDepot ?? {})) {
    check("unit wait-at-depot", unit.id, resource, validResources);
  }
  for (const resource of unit.storesResources ?? []) {
    check("unit store resource", unit.id, resource, validResources);
  }
  for (const resource of unit.repairCosts ?? []) {
    check("unit repair resource", unit.id, resource, validResources);
  }
  for (const resource of Object.keys(unit.improveProduction ?? {})) {
    check("unit improve resource", unit.id, resource, validResources);
  }
  for (const rule of unit.canTransport ?? []) {
    check("unit transport rule", unit.id, rule, validTransportRules);
  }
  for (const rule of unit.buildingRules ?? []) {
    check("unit building rule", unit.id, rule.typeId, unitIds);
  }
}

const deadVisionUnits = (manifest.units ?? []).filter((unit) => /^unit-dead-vision-\d+-\d+$/.test(unit.id));
if ((manifest.counts?.generatedDeadVisionUnits ?? 0) !== deadVisionUnits.length || deadVisionUnits.length === 0) {
  errors.push(`Expected generated dead-vision units in manifest counts, found count=${manifest.counts?.generatedDeadVisionUnits}, units=${deadVisionUnits.length}`);
}
for (const unit of deadVisionUnits) {
  if (unit.revealer !== true || unit.vanishes !== true || unit.nonSolid !== true || unit.selectableByRectangle !== false || unit.indestructible !== true || unit.animation !== "animations-dead-vision") {
    errors.push(`Generated dead-vision unit ${unit.id} missing source revealer flags: ${JSON.stringify({ revealer: unit.revealer, vanishes: unit.vanishes, nonSolid: unit.nonSolid, selectableByRectangle: unit.selectableByRectangle, indestructible: unit.indestructible, animation: unit.animation })}`);
  }
}

for (const [id, drawLevel, visibleUnderFog] of [
  ["unit-human-dead-body", 30, false],
  ["unit-destroyed-3x3-place", 10, true]
]) {
  const unit = (manifest.units ?? []).find((candidate) => candidate.id === id);
  if (unit?.drawLevel !== drawLevel || unit?.visibleUnderFog !== visibleUnderFog) {
    errors.push(`${id} should preserve source corpse/remnant strata: ${JSON.stringify({ drawLevel: unit?.drawLevel, visibleUnderFog: unit?.visibleUnderFog })}`);
  }
}

for (const [name, source, fragments] of [
  ["indexer", indexSource, [
    "function addGeneratedDeadVisionUnits(unitsById, animationsById)",
    "const id = `unit-dead-vision-${size}-${sight}`",
    "animation: \"animations-dead-vision\"",
    "generatedDeadVisionUnits"
  ]],
  ["orders", ordersSource, [
    "addDeadVisionRevealer(world, unit)",
    "function addDeadVisionRevealer(world: WorldState, unit: WorldUnit): void",
    "const revealerTypeId = `unit-dead-vision-${Math.max(1, unit.tileWidth)}-${Math.max(1, Math.floor(unit.sightRangeTiles))}`",
    "revealer.lifetimeSeconds = sourceCyclesToSeconds(world, 160)"
  ]],
  ["world", worldSource, [
    "drawLevel: number;",
    "visibleUnderFog: boolean;",
    "drawLevel: unit.drawLevel",
    "export function isSourceBuildingDefinition",
    "unit.mainFacility === true",
    "unit.shoreBuilding === true",
    "(unit.storesResources?.length ?? 0) > 0",
    "typeof unit.givesResource === \"string\""
  ]],
  ["orders", ordersSource, [
    "drawLevel: Math.max(0, corpseDefinition?.drawLevel ?? unit.drawLevel)",
    "visibleUnderFog: corpseDefinition?.visibleUnderFog ?? unit.visibleUnderFog"
  ]],
  ["renderer", renderWorldSource, [
    "drawLastSeenBuildings(unitLayer, world, manifest, unitAtlases, viewport, { maxDrawLevel: 39 })",
    "drawLastSeenBuildings(unitLayer, world, manifest, unitAtlases, viewport, { minDrawLevel: 40 })",
    "drawCorpses(unitLayer, world, manifest, unitAtlases, viewport, { maxDrawLevel: 39 })",
    "drawCorpses(unitLayer, world, manifest, unitAtlases, viewport, { minDrawLevel: 40 })",
    "function compareLastSeenBuildingDrawOrder",
    "function isCorpseVisibleToPlayer",
    "corpse.visibleUnderFog && isCorpseExploredByPlayer(world, corpse, playerId)",
    "function compareCorpseDrawOrder",
    "return left.drawLevel - right.drawLevel"
  ]],
  ["save", saveSource, [
    "drawLevel: Math.max(0, Math.floor(finiteNumberOr(record.drawLevel",
    "visibleUnderFog: Boolean(record.visibleUnderFog",
    "isSourceBuildingDefinition(unit)"
  ]]
]) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      errors.push(`${name} missing generated dead-vision fragment: ${fragment}`);
    }
  }
}

if (!ordersSource.includes("return isSourceBuildingDefinition(definition);")) {
  errors.push("Simulation transform/building classification should use the shared source structural building classifier.");
}

for (const fragment of [
  "sourceDefinition?: Pick<WargusUnit",
  "sourceDefinition ? isSourceBuildingDefinition(sourceDefinition) : isKnownBuildingTypeId(id)",
  "speedForUnit(definition.id, kind, definition.speed, definition)"
]) {
  if (!worldSource.includes(fragment) && !ordersSource.includes(fragment) && !saveSource.includes(fragment)) {
    errors.push(`Source speed/building classification is missing fragment: ${fragment}`);
  }
}

if (ordersSource.includes("return definition.building === true || isKnownBuildingTypeId(definition.id);")) {
  errors.push("Simulation building classification still falls straight back to exact id fragments before source structural traits.");
}

if (saveSource.includes("return unit.building === true || isKnownBuildingTypeId(unit.id);")) {
  errors.push("Save/load building classification still falls straight back to exact id fragments before source structural traits.");
}

const sourceBuildingDefinitionBody = worldSource.match(/export function isSourceBuildingDefinition[\s\S]*?\n}/)?.[0] ?? "";
if (!sourceBuildingDefinitionBody.includes("unit.building === true") || !sourceBuildingDefinitionBody.includes("isSourceResourcePatchDefinition(unit)")) {
  errors.push("Source building classifier should derive building state from preserved Wargus traits and resource-site metadata.");
}
if (sourceBuildingDefinitionBody.includes("isKnownBuildingTypeId(unit.id)") || sourceBuildingDefinitionBody.includes(".includes(")) {
  errors.push("Source building classifier should not fall back to stock id fragments when a Wargus unit definition is available.");
}
const knownBuildingTypeSource = worldSource.match(/export function isKnownBuildingTypeId[\s\S]*?\n}\n\nconst SOURCE_COMPAT_BUILDING_TYPE_IDS[\s\S]*?\]\);/)?.[0] ?? "";
if (!knownBuildingTypeSource.includes("return SOURCE_COMPAT_BUILDING_TYPE_IDS.has(id);")) {
  errors.push("Known building fallback should use the explicit source compatibility id set.");
}
for (const fragment of [
  'id.includes("hall")',
  'id.includes("tower")',
  'id.includes("barracks")',
  'id.includes("circle")'
]) {
  if (knownBuildingTypeSource.includes(fragment)) {
    errors.push(`Known building fallback should not classify missing source units by id fragment: ${fragment}`);
  }
}
for (const fragment of [
  '"unit-town-hall"',
  '"unit-great-hall"',
  '"unit-human-watch-tower"',
  '"unit-orc-cannon-tower"',
  '"unit-circle-of-power"'
]) {
  if (!knownBuildingTypeSource.includes(fragment)) {
    errors.push(`Known building compatibility set missing stock source id: ${fragment}`);
  }
}

const sightRangeSource = worldSource.match(/export function sightRangeForUnit[\s\S]*?\n}/)?.[0] ?? "";
for (const fragment of [
  "unit.building === true && unit.canAttack === true",
  "unit.landUnit === true && unit.canAttack === true && (unit.maxAttackRange ?? 0) > 1",
  "(unit.gatherResources ?? []).some((resource) => resource === \"gold\" || resource === \"wood\") || unit.canHarvest === true"
]) {
  if (!sightRangeSource.includes(fragment)) {
    errors.push(`Sight range fallback should use source traits, missing: ${fragment}`);
  }
}
for (const fragment of [
  "id.includes(\"tower\")",
  "id.includes(\"archer\")",
  "id.includes(\"axethrower\")",
  "id.includes(\"peasant\")",
  "id.includes(\"peon\")"
]) {
  if (sightRangeSource.includes(fragment)) {
    errors.push(`Sight range fallback should not classify source units by stock id fragment: ${fragment}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Unit reference errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Unit references verified (${references} capability references checked).`);
