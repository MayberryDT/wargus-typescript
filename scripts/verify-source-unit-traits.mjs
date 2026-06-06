import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const dataRoot = manifest.dataRoot;
const sourceFiles = [
  "scripts/human/units.lua",
  "scripts/orc/units.lua",
  "scripts/units.lua"
].map((file) => readFileSync(path.join(dataRoot, file), "utf8")).join("\n");
const databaseSource = readFileSync(path.join(dataRoot, "scripts/database.lua"), "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typeSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
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
  "DetectCloak = true",
  "PermanentCloak = true",
  "organic = true",
  "isundead = true",
  "hero = true",
  "Neutral = true",
  "NeutralMinimapColor"
]) {
  expect(sourceFiles.includes(fragment), `Source unit files missing source trait fragment: ${fragment}`);
}

expect(manifest.units.filter((candidate) => candidate.detectCloak).length >= 20, "Manifest should preserve source DetectCloak units.");
expect(manifest.units.filter((candidate) => candidate.permanentCloak).length === 2, "Manifest should preserve the two source permanent-cloak submarines.");
expect(manifest.units.filter((candidate) => candidate.organic).length >= 40, "Manifest should preserve source organic unit traits.");
expect(manifest.units.filter((candidate) => candidate.isUndead).length >= 5, "Manifest should preserve source undead unit traits.");
expect(manifest.units.filter((candidate) => candidate.hero).length >= 10, "Manifest should preserve source and UnitDatabase hero unit traits.");
expect(manifest.units.filter((candidate) => candidate.neutral).length >= 4, "Manifest should preserve source neutral unit traits.");

expect(unit("unit-human-submarine")?.permanentCloak === true, "unit-human-submarine should preserve PermanentCloak=true.");
expect(unit("unit-orc-submarine")?.permanentCloak === true, "unit-orc-submarine should preserve PermanentCloak=true.");
expect(unit("unit-human-guard-tower")?.detectCloak === true, "unit-human-guard-tower should preserve DetectCloak=true.");
expect(unit("unit-paladin")?.organic === true, "unit-paladin should preserve organic=true.");
expect(unit("unit-death-knight")?.isUndead === true, "unit-death-knight should preserve isundead=true.");
expect(unit("unit-knight-rider")?.hero === true, "unit-knight-rider should inherit UnitDatabase hero rank.");
expect(unit("unit-arthor-literios")?.hero === true, "unit-arthor-literios should inherit UnitDatabase hero rank.");
expect(unit("unit-female-hero")?.hero === true, "unit-female-hero should inherit UnitDatabase hero rank.");
expect(unit("unit-double-head")?.hero === true, "unit-double-head should preserve hero=true.");
expect(unit("unit-gold-mine")?.neutral === true, "unit-gold-mine should preserve Neutral=true.");
expect(JSON.stringify(unit("unit-gold-mine")?.neutralMinimapColor) === JSON.stringify([255, 255, 0]), `unit-gold-mine neutral minimap color is ${JSON.stringify(unit("unit-gold-mine")?.neutralMinimapColor)}, expected [255,255,0].`);

for (const [name, source, fragments] of [
  ["indexer", indexSource, [
    "const detectCloak = /DetectCloak\\s*=\\s*true/.test(body)",
    "const permanentCloak = /PermanentCloak\\s*=\\s*true/.test(body)",
    "const organic = /(?:^|[,{])\\s*organic\\s*=\\s*true/m.test(body)",
    "const isUndead = /(?:^|[,{])\\s*isundead\\s*=\\s*true/m.test(body)",
    "const hero = /(?:^|[,{])\\s*hero\\s*=\\s*true/m.test(body)",
    "function applyUnitDatabaseHeroTraits(unitsById, unitDatabase)",
    "entry.rank !== \"hero\" && entry.class !== \"hero\"",
    "unit.hero = true",
    "applyUnitDatabaseHeroTraits(unitsById, unitDatabase)",
    "const neutral = /Neutral\\s*=\\s*true/.test(body)",
    "const neutralMinimapColor = parseColorTuple(body.match(/NeutralMinimapColor"
  ]],
  ["types", typeSource, [
    "detectCloak?: boolean",
    "permanentCloak?: boolean",
    "organic?: boolean",
    "isUndead?: boolean",
    "hero?: boolean",
    "neutral?: boolean",
    "neutralMinimapColor?: [number, number, number] | null"
  ]],
  ["world", worldSource, [
    "detectCloak: boolean",
    "permanentCloak: boolean",
    "organic: boolean",
    "isUndead: boolean",
    "hero: boolean",
    "neutral: boolean",
    "neutralMinimapColor: [number, number, number] | null",
    "detectCloak: unit.detectCloak ?? false",
    "permanentCloak: unit.permanentCloak ?? false",
    "organic: unit.organic ?? false",
    "isUndead: unit.isUndead ?? false",
    "hero: unit.hero ?? false",
    "neutral: unit.neutral ?? false",
    "neutralMinimapColor: normalizeRgbColor(unit.neutralMinimapColor)",
    "return unit.seaUnit && unit.permanentCloak && unit.canAttack",
    "return unit.permanentCloak || unit.statusEffects?.some",
    "return unit.detectCloak",
    "function isSourceHeroSurvivalUnit(unit: WorldUnit): boolean",
    "return unit.hero || HERO_OBJECTIVE_KEYWORDS.some",
    "function sourceHeroNameMatches(unit: WorldUnit, aliases: string[]): boolean",
    "const haystack = `${unit.typeId} ${unit.name}`.toLowerCase();"
  ]],
  ["orders", ordersSource, [
    "if (variable === \"organic\")",
    "return unit.organic",
    "if (variable === \"isundead\")",
    "return isUndeadUnit(unit)",
    "return unit.organic",
    "&& !isUndeadUnit(unit)",
    "function isUndeadUnit(unit: WorldUnit): boolean",
    "return unit.isUndead",
    "neutralizePolymorphedUnit(target)",
    "unit.neutral = true",
    "unit.neutralMinimapColor ??= [192, 192, 192]",
    "unit.detectCloak = definition.detectCloak ?? false",
    "unit.permanentCloak = definition.permanentCloak ?? false",
    "unit.organic = definition.organic ?? false",
    "unit.isUndead = definition.isUndead ?? false",
    "unit.hero = definition.hero ?? false",
    "unit.neutral = definition.neutral ?? false",
    "unit.neutralMinimapColor = normalizeRgbColor(definition.neutralMinimapColor)",
    "function sourceHeroCircleObjectiveTypes(world: WorldState): string[]",
    ".filter((definition) => definition.hero === true || sourceDefinitionNameMatches(definition, aliases))",
    "function sourceDefinitionNameMatches(definition: WargusUnit, aliases: string[]): boolean"
  ]],
  ["save/load", saveSource, [
    "unit.detectCloak = definition.detectCloak ?? false",
    "unit.permanentCloak = definition.permanentCloak ?? false",
    "unit.organic = definition.organic ?? false",
    "unit.isUndead = definition.isUndead ?? false",
    "unit.hero = definition.hero ?? false",
    "unit.neutral = definition.neutral ?? false",
    "unit.neutralMinimapColor = normalizeRgbColor(definition.neutralMinimapColor)",
    "unit.detectCloak = Boolean(unit.detectCloak)",
    "unit.permanentCloak = Boolean(unit.permanentCloak)",
    "unit.organic = Boolean(unit.organic)",
    "unit.isUndead = Boolean(unit.isUndead)",
    "unit.hero = Boolean(unit.hero)",
    "unit.neutral = Boolean(unit.neutral)"
  ]],
  ["HUD render", hudSource, [
    "if (unit.neutral || unit.player === 15)",
    "rgbToHex(unit.neutralMinimapColor ?? [192, 192, 192])"
  ]],
  ["world render", renderSource, [
    "return unit.permanentCloak || hasActiveStatusEffect(unit, \"invisibility\")",
    "unit.neutral && decoration.hideNeutral"
  ]],
  ["package scripts", packageSource, [
    "\"verify:source-unit-traits\"",
    "npm run verify:source-unit-traits"
  ]]
]) {
  for (const fragment of fragments) {
    expect(source.includes(fragment), `${name} missing source unit trait fragment: ${fragment}`);
  }
}

expect(/UnitDatabaseSetup\(race,\s*AiHeroRider\(race\),\s*AiBarracks\(race\),\s*"ground",\s*"melee",\s*"hero"\)/.test(databaseSource), "Source UnitDatabase hero rider role was not found.");
expect(/UnitDatabaseSetup\(race,\s*AiHeroSoldier\(race\),\s*AiBarracks\(race\),\s*"ground",\s*"melee",\s*"hero"\)/.test(databaseSource), "Source UnitDatabase hero soldier role was not found.");
expect(/UnitDatabaseSetup\(race,\s*AiHeroShooter\(race\),\s*AiBarracks\(race\),\s*"ground",\s*"ranged",\s*"hero"\)/.test(databaseSource), "Source UnitDatabase hero shooter role was not found.");

expect(!worldSource.includes("const PLAYER_HERO_TYPE_IDS"), "Hero survival objective fallback should not use a hardcoded player hero id list.");
expect(!worldSource.includes("PLAYER_HERO_TYPE_IDS.includes(unit.typeId)"), "Hero survival objective fallback should use source hero/name metadata instead of exact type ids.");
expect(!ordersSource.includes("const CIRCLE_HERO_TYPE_IDS"), "Circle hero objectives should not use a hardcoded hero id list.");
expect(!ordersSource.includes("types.push(...CIRCLE_HERO_TYPE_IDS)"), "Circle hero objectives should resolve hero unit types from source metadata.");

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source unit trait verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source unit traits verified (DetectCloak, PermanentCloak, organic, isundead, hero, Neutral, and NeutralMinimapColor preserved and consumed).");
