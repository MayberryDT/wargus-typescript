import { readFileSync } from "node:fs";

const source = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_die.cpp", "utf8");
const wargusUnitsSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/wargus-local/share/games/stratagus/wargus/scripts/units.lua", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const renderSource = readFileSync("src/view/renderWorld.ts", "utf8");
const sourceCorpseRenderingSource = readFileSync("src/view/sourceCorpseRendering.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");
const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));

const errors = [];

function expectIncludes(label, text, fragments) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      errors.push(`${label} missing die-action fragment: ${fragment}`);
    }
  }
}

expectIncludes("Stratagus action_die.cpp", source, [
  "static bool AnimateActionDie(CUnit &unit)",
  "animations->Death[unit.DamagedType]",
  "animations->Death[ANIMATIONS_DEATHTYPES]",
  "UnitShowAnimation(unit, &animations->Death[unit.DamagedType])",
  "if (unit.Anim.Unbreakable)",
  "if (type.CorpseType == nullptr)",
  "unit.Remove(nullptr);",
  "unit.Release();",
  "const CUnitType &corpseType = *type.CorpseType;",
  "unit.Type = &corpseType;",
  "UpdateUnitSightRange(unit);",
  "unit.Place(unit.tilePos);",
  "unit.Frame = 0;",
  "UnitUpdateHeading(unit);",
  "AnimateActionDie(unit); // with new corpse."
]);

expectIncludes("Wargus dead-vision Lua", wargusUnitsSource, [
  "local animDeath = animSpec[\"Death\"]",
  "local corpse = tbl[\"Corpse\"]",
  "local explodeWhenKilled = tbl[\"ExplodeWhenKilled\"]",
  "if (animDeath or corpse or explodeWhenKilled) and not vanishes and sight > 0 then",
  "OldDefineAnimations(\"animations-dead-vision\", { Still = { \"frame 0\", \"wait 80\", \"set-var SightRange.Max = 1\", \"wait 80\", \"die\" } })",
  "table.insert(animDeath, 1, \"spawn-unit \" .. deadVisionName .. \" 0 0 0 l.this\")",
  "tbl[\"Animations\"] = unitAnimName"
]);

expectIncludes("browser die simulation", ordersSource, [
  "function removeDeadUnits(world: WorldState, expiredUnitIds: Set<string> = new Set()): void",
  "world.corpses ??= [];",
  "recordUnitDeath(world, unit);",
  "world.events.push({ kind: \"unit-dead\"",
  "addDeathExplosionEffect(world, unit);",
  "addDeadVisionRevealer(world, unit);",
  "const corpse = createCorpseForUnit(world, unit);",
  "world.corpses.push(corpse);",
  "world.units = world.units.filter((unit) => unit.hitPoints > 0);",
  "function createCorpseForUnit(world: WorldState, unit: WorldUnit): WorldState[\"corpses\"][number] | null",
  "const corpseDefinition = unit.corpseTypeId",
  "const fallbackToUnitDeathAnimation = !corpseDefinition && shouldFallbackToUnitDeathAnimation(unit);",
  "typeId: corpseDefinition?.id ?? unit.typeId",
  "drawLevel: Math.max(0, corpseDefinition?.drawLevel ?? unit.drawLevel)",
  "visibleUnderFog: corpseDefinition?.visibleUnderFog ?? unit.visibleUnderFog",
  "animation: corpseDefinition?.animation ?? unit.animation",
  "duration: sourceDeathAnimationDurationSeconds(world, corpseDefinition?.animation ?? unit.animation)",
  "function shouldFallbackToUnitDeathAnimation",
  "unit.player === 15 || isBuildingLike(unit) || unit.kind === \"naval\" || unit.kind === \"fly\"",
  "function addDeadVisionRevealer(world: WorldState, unit: WorldUnit): void",
  "const revealerTypeId = `unit-dead-vision-${Math.max(1, unit.tileWidth)}-${Math.max(1, Math.floor(unit.sightRangeTiles))}`;",
  "revealer.lifetimeSeconds = sourceCyclesToSeconds(world, 160);",
  "function sourceDeathAnimationDurationSeconds(world: WorldState, animationId: string | null): number",
  "animation.id === animationId)?.actions.Death",
  "function stepCorpses(world: WorldState, tickSeconds: number): void",
  "corpse.age += tickSeconds;",
  "corpse.age < corpse.duration"
]);

expectIncludes("browser corpse renderer", renderSource, [
  "drawCorpses(",
  "getCorpseFrameNumber(corpse, manifest, world, atlas?.numDirections ?? 0)",
  "const progress = Math.min(1, corpse.age / Math.max(0.01, corpse.duration));",
  "corpse.visibleUnderFog && isCorpseExploredByPlayer(world, corpse, playerId)",
  "import { sourceCorpseAgeTicks } from \"./sourceCorpseRendering\"",
  "function getCorpseFrameNumber(corpse: WorldState[\"corpses\"][number], manifest: WargusManifest, world: WorldState, numDirections: number): number | null",
  "const deathTicks = sourceCorpseAgeTicks(world, corpse);",
  "let drewFallbackGraphics = false",
  "if (drewFallbackGraphics)"
]);

expectIncludes("source corpse rendering helper", sourceCorpseRenderingSource, [
  "export function sourceCorpseAgeTicks(world: WorldState, corpse: WorldState[\"corpses\"][number]): number",
  "return Math.max(0, Math.floor(corpse.age * sourceDefaultGameSpeed(world)))"
]);

if (renderSource.includes("function sourceCorpseAgeTicks")) {
  errors.push("Corpse renderer should import sourceCorpseAgeTicks instead of owning source death animation age conversion.");
}
if (renderSource.includes("const deathTicks = Math.max(0, Math.floor(corpse.age * world.tickRate));")) {
  errors.push("Corpse renderer should route source death animation age through sourceCorpseAgeTicks instead of inline tick-rate math.");
}
if (renderSource.includes("corpse.age * world.tickRate")) {
  errors.push("Corpse renderer should use sourceDefaultGameSpeed instead of raw browser tick-rate math.");
}

const deathAnimationFallbackBody = ordersSource.match(/function shouldFallbackToUnitDeathAnimation[\s\S]*?\n}\n/)?.[0] ?? "";
if (deathAnimationFallbackBody.includes('unit.kind === "building"')) {
  errors.push("Death animation fallback should use source Building semantics instead of browser-local kind text.");
}

expectIncludes("save/load corpse state", saveSource, [
  "function normalizeCorpses(world: WorldState, value: unknown): WorldState[\"corpses\"]",
  "const corpse: WorldState[\"corpses\"][number] = {",
  "const definition = world.unitDefinitions.find((candidate) => candidate.id === typeId)",
  "typeId: definition.id",
  "drawLevel: Math.max(0, Math.floor(finiteNumberOr(record.drawLevel, definition.drawLevel ?? 0)))",
  "visibleUnderFog: Boolean(record.visibleUnderFog ?? definition.visibleUnderFog ?? false)",
  "const animation = normalizeNullableAnimationId(record.animation, definition.animation ?? null, world)",
  "animation,",
  "function normalizeNullableAnimationId(value: unknown, fallback: string | null, world: WorldState): string | null",
  "const age = finiteNullableNumber(record.age);",
  "const duration = finiteNullableNumber(record.duration);",
  "const sourceDuration = sourceDeathAnimationDurationSecondsForSave(world, animation)",
  "if (sourceDuration <= 0 || age >= sourceDuration)",
  "function sourceDeathAnimationDurationSecondsForSave(world: WorldState, animationId: string | null): number",
  "world.animationDefinitions.find((animation) => animation.id === animationId)?.actions.Death",
  "age >= duration",
  "age,",
  "duration: sourceDuration",
  ".filter((entry): entry is WorldState[\"corpses\"][number] => entry !== null);"
]);

for (const [id, expected] of [
  ["unit-human-dead-body", { drawLevel: 30, visibleUnderFog: false, vanishes: true }],
  ["unit-orc-dead-body", { drawLevel: 30, visibleUnderFog: false, vanishes: true }],
  ["unit-dead-sea-body", { drawLevel: 30, visibleUnderFog: false, vanishes: true }],
  ["unit-destroyed-3x3-place", { drawLevel: 10, visibleUnderFog: true, vanishes: true }],
  ["unit-destroyed-4x4-place", { drawLevel: 10, visibleUnderFog: true, vanishes: true }]
]) {
  const unit = manifest.units.find((candidate) => candidate.id === id);
  if (!unit) {
    errors.push(`Manifest missing source corpse type: ${id}`);
    continue;
  }
  for (const [key, value] of Object.entries(expected)) {
    if (unit[key] !== value) {
      errors.push(`${id} should preserve source ${key}: expected ${value}, got ${unit[key]}`);
    }
  }
}

const unitsWithCorpse = manifest.units.filter((unit) => unit.corpseTypeId);
if (unitsWithCorpse.length < 100) {
  errors.push(`Manifest should preserve Wargus corpse links for most source units; found ${unitsWithCorpse.length}.`);
}

const deadVisionUnits = manifest.units.filter((unit) => unit.id.startsWith("unit-dead-vision-"));
if (deadVisionUnits.length < 4 || !deadVisionUnits.every((unit) => unit.revealer && unit.vanishes && unit.sightRange > 0)) {
  errors.push("Manifest should preserve Wargus generated dead-vision revealer units.");
}

expectIncludes("package verify script", packageSource, [
  "\"verify:source-die-action\"",
  "npm run verify:source-die-action"
]);

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source die action verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source die action verified (death animation source flow, corpse type swap/remnants, dead-vision revealers, renderer timing/visibility, and save/load corpse state).");
