import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const dataRoot = manifest.dataRoot;
const sourceFiles = [
  "scripts/human/units.lua",
  "scripts/orc/units.lua",
  "scripts/units.lua"
].map((file) => readFileSync(path.join(dataRoot, file), "utf8")).join("\n");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typeSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const passabilitySource = readFileSync("src/simulation/passability.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const renderSource = readFileSync("src/view/renderWorld.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");

const errors = [];
function expect(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function unit(id) {
  return manifest.units.find((candidate) => candidate.id === id);
}

for (const fragment of [
  "Indestructible = 1",
  "NonSolid = true",
  "VisibleUnderFog = true",
  "Revealer = true",
  "Vanishes = true",
  "DecayRate = 3"
]) {
  expect(sourceFiles.includes(fragment), `Source unit files missing special visibility fragment: ${fragment}`);
}

expect(manifest.units.filter((candidate) => candidate.visibleUnderFog).length >= 50, "Manifest should preserve source VisibleUnderFog building/remnant metadata.");
expect(manifest.units.filter((candidate) => candidate.revealer).length >= 20, "Manifest should include source/generated revealer units.");
expect(manifest.units.filter((candidate) => candidate.vanishes).length >= 20, "Manifest should preserve source Vanishes metadata.");
expect(manifest.units.filter((candidate) => candidate.nonSolid).length >= 20, "Manifest should preserve source NonSolid metadata.");
expect(manifest.units.filter((candidate) => candidate.indestructible).length >= 20, "Manifest should preserve source Indestructible metadata.");

expect(unit("unit-revealer")?.revealer === true, "unit-revealer should preserve Revealer=true.");
expect(unit("unit-revealer")?.vanishes === true, "unit-revealer should derive Vanishes=true from source Revealer metadata.");
expect(unit("unit-dead-vision-1-1")?.revealer === true, "generated dead-vision units should be revealers.");
expect(unit("unit-dead-vision-1-1")?.nonSolid === true, "generated dead-vision units should be non-solid.");
expect(unit("unit-dead-vision-1-1")?.indestructible === true, "generated dead-vision units should be indestructible.");
expect(unit("unit-destroyed-3x3-place")?.visibleUnderFog === true, "destroyed place remnants should stay visible under explored fog.");
expect(unit("unit-circle-of-power")?.indestructible === true, "Circle of Power should preserve source Indestructible metadata.");
expect(unit("unit-eye-of-vision")?.decayRate === 3, "Eye of Vision should preserve source DecayRate=3.");

for (const [name, source, fragments] of [
  ["indexer", indexSource, [
    "const indestructible = /Indestructible\\s*=\\s*(?:true|1)/.test(body)",
    "const nonSolid = /NonSolid\\s*=\\s*true/.test(body)",
    "const visibleUnderFog = /VisibleUnderFog\\s*=\\s*true/.test(body)",
    "const revealer = /Revealer\\s*=\\s*true/.test(body)",
    "const vanishes = /(?:Vanishes|Revealer)\\s*=\\s*true/.test(body)",
    "function addGeneratedDeadVisionUnits",
    "revealer: true",
    "vanishes: true",
    "indestructible: true",
    "nonSolid: true"
  ]],
  ["types", typeSource, [
    "indestructible?: boolean",
    "nonSolid?: boolean",
    "visibleUnderFog?: boolean",
    "revealer?: boolean",
    "vanishes?: boolean"
  ]],
  ["world", worldSource, [
    "indestructible: boolean",
    "nonSolid: boolean",
    "visibleUnderFog: boolean",
    "revealer: boolean",
    "vanishes: boolean",
    "decayRate: number",
    "const decayRate = Math.max(0, unit.decayRate ?? 0)",
    "export function sourceDecayRateLifetimeSeconds(decayRate: number): number | undefined",
    "return sourceDecayRate > 0 ? sourceDecayRate * 6 : undefined",
    "indestructible: unit.indestructible ?? false",
    "nonSolid: unit.nonSolid ?? false",
    "visibleUnderFog: unit.visibleUnderFog ?? false",
    "revealer: unit.revealer ?? false",
    "vanishes: unit.vanishes ?? false",
    "lifetimeSeconds: sourceDecayRateLifetimeSeconds(decayRate)",
    "unit.visibleUnderFog && isUnitFootprintExploredByPlayer(world, unit, playerId)",
    "export function isInvisibleUtilityUnit(unit: WorldUnit): boolean",
    "return unit.revealer",
    "&& unit.vanishes",
    "&& unit.nonSolid"
  ]],
  ["passability", passabilitySource, [
    "unit.nonSolid"
  ]],
  ["orders", ordersSource, [
    "isInvisibleUtilityUnit",
    "if (target.indestructible)",
    "if (unit.vanishes)",
    "visibleUnderFog: corpseDefinition?.visibleUnderFog ?? unit.visibleUnderFog",
    "addDeadVisionRevealer(world, unit)",
    "function addDeadVisionRevealer(world: WorldState, unit: WorldUnit): void",
    "const revealerTypeId = `unit-dead-vision-${Math.max(1, unit.tileWidth)}-${Math.max(1, Math.floor(unit.sightRangeTiles))}`",
    "createHolyVisionRevealer(world",
    "const revealerTypeId = sourceRevealerSummonUnitTypeId(world, \"spell-holy-vision\", \"unit-revealer\")",
    "function sourceRevealerSummonUnitTypeId",
    "definition?.revealer === true || definition?.vanishes === true || definition?.nonSolid === true",
    "revealer.nonSolid = true",
    "unit.revealer = definition.revealer ?? false",
    "unit.vanishes = definition.vanishes ?? false",
    "unit.indestructible = definition.indestructible ?? false",
    "unit.nonSolid = definition.nonSolid ?? false",
    "unit.visibleUnderFog = definition.visibleUnderFog ?? false"
  ]],
  ["orders trained-unit lifetime", ordersSource, [
    "sourceDecayRateLifetimeSeconds",
    "trainedUnit.lifetimeSeconds = sourceDecayRateLifetimeSeconds(unit.decayRate) ?? trainedUnit.lifetimeSeconds"
  ]],
  ["save/load", saveSource, [
    "unit.revealer = definition.revealer ?? false",
    "unit.vanishes = definition.vanishes ?? false",
    "unit.indestructible = definition.indestructible ?? false",
    "unit.nonSolid = definition.nonSolid ?? false",
    "unit.visibleUnderFog = definition.visibleUnderFog ?? false",
    "unit.revealer = Boolean(unit.revealer)",
    "unit.vanishes = Boolean(unit.vanishes)",
    "unit.indestructible = Boolean(unit.indestructible)",
    "unit.nonSolid = Boolean(unit.nonSolid)",
    "unit.visibleUnderFog = Boolean(unit.visibleUnderFog)",
    "unit.lifetimeSeconds = normalizeUnitLifetimeSecondsForSave(world, unit, definition)",
    "function normalizeUnitLifetimeSecondsForSave(world: WorldState, unit: WorldState[\"units\"][number], definition: WargusManifest[\"units\"][number] | undefined): number | undefined",
    "function sourceUnitLifetimeSecondsForSave(world: WorldState, unitTypeId: string, decayRate: number): number | undefined",
    "sourceDeadVisionLifetimeSecondsForSave(world, unitTypeId)",
    "visibleUnderFog: Boolean(record.visibleUnderFog"
  ]],
  ["HUD render", hudSource, [
    "isInvisibleUtilityUnit(unit)"
  ]],
  ["world render", renderSource, [
    "isInvisibleUtilityUnit(unit)",
    "corpse.visibleUnderFog && isCorpseExploredByPlayer(world, corpse, playerId)"
  ]],
  ["package scripts", packageSource, [
    "\"verify:source-special-visibility\"",
    "npm run verify:source-special-visibility"
  ]]
]) {
  for (const fragment of fragments) {
    expect(source.includes(fragment), `${name} missing special visibility fragment: ${fragment}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source special visibility verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source special visibility verified (VisibleUnderFog, Revealer, Vanishes, NonSolid, and Indestructible preserved and consumed).");
