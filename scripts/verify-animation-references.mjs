import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const animationIds = new Set((manifest.animations ?? []).map((animation) => animation.id));
const checks = [];

function add(kind, owner, animationId) {
  if (animationId) {
    checks.push({ kind, owner, animationId });
  }
}

for (const unit of manifest.units ?? []) {
  add("unit animation", unit.id, unit.animation);
}

const normalizerSource = readFileSync("src/wargus/manifest.ts", "utf8");
for (const match of normalizerSource.matchAll(/\banimation:\s*"([^"]+)"/g)) {
  add("normalizer animation", "src/wargus/manifest.ts", match[1]);
}

const renderWorldSource = readFileSync("src/view/renderWorld.ts", "utf8");
const sourceCorpseRenderingSource = readFileSync("src/view/sourceCorpseRendering.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
for (const fragment of [
  "getAnimatedFrameNumber(unit, manifest, world, atlas.numDirections)",
  "let cursor = animationFrameCursorForUnitAction(unit, world, action, frames, totalWait)",
  "getCorpseFrameNumber(corpse, manifest, world, atlas?.numDirections ?? 0)",
  "const deathTicks = sourceCorpseAgeTicks(world, corpse)",
  "import { sourceCorpseAgeTicks } from \"./sourceCorpseRendering\""
]) {
  if (!renderWorldSource.includes(fragment)) {
    checks.push({ kind: "renderer animation timing", owner: fragment, animationId: "__missing_renderer_fragment__" });
  }
}
for (const fragment of [
  "export function sourceCorpseAgeTicks(world: WorldState, corpse: WorldState[\"corpses\"][number]): number",
  "return Math.max(0, Math.floor(corpse.age * sourceDefaultGameSpeed(world)))"
]) {
  if (!sourceCorpseRenderingSource.includes(fragment)) {
    checks.push({ kind: "source corpse animation timing helper", owner: fragment, animationId: "__missing_renderer_fragment__" });
  }
}

const footman = (manifest.units ?? []).find((unit) => unit.id === "unit-footman");
const footmanAttack = (manifest.animations ?? []).find((animation) => animation.id === footman?.animation)?.actions?.Attack ?? [];
const footmanAttackCycles = footmanAttack.reduce((sum, frame) => sum + Math.max(1, Math.floor(frame.wait || 1)), 0);
if (footmanAttackCycles !== 25) {
  checks.push({ kind: "source attack animation timing", owner: `unit-footman cycles=${footmanAttackCycles}`, animationId: "__missing_renderer_fragment__" });
}

const archer = (manifest.units ?? []).find((unit) => unit.id === "unit-archer");
const archerAttack = (manifest.animations ?? []).find((animation) => animation.id === archer?.animation)?.actions?.Attack ?? [];
const archerAttackCycles = archerAttack.reduce((sum, frame) => sum + Math.max(1, Math.floor(frame.wait || 1)), 0);
if (archerAttackCycles !== 65) {
  checks.push({ kind: "source attack animation timing", owner: `unit-archer cycles=${archerAttackCycles}`, animationId: "__missing_renderer_fragment__" });
}

const buildingAnimation = (manifest.animations ?? []).find((animation) => animation.id === "animations-building");
for (const action of ["Train", "Research", "Upgrade"]) {
  if (!buildingAnimation?.actions?.[action]?.length) {
    checks.push({ kind: "source building animation action", owner: `animations-building ${action}`, animationId: "__missing_renderer_fragment__" });
  }
}

const mage = (manifest.units ?? []).find((unit) => unit.id === "unit-mage");
const mageSpellCast = (manifest.animations ?? []).find((animation) => animation.id === mage?.animation)?.actions?.SpellCast ?? [];
const mageSpellCastCycles = mageSpellCast.reduce((sum, frame) => sum + Math.max(1, Math.floor(frame.wait || 1)), 0);
if (mageSpellCastCycles !== 40) {
  checks.push({ kind: "source spell animation timing", owner: `unit-mage cycles=${mageSpellCastCycles}`, animationId: "__missing_renderer_fragment__" });
}

const humanDeadBody = (manifest.animations ?? []).find((animation) => animation.id === "animations-human-dead-body")?.actions?.Death ?? [];
const humanDeadBodyCycles = humanDeadBody.reduce((sum, frame) => sum + Math.max(1, Math.floor(frame.wait || 1)), 0);
if (humanDeadBodyCycles !== 1001) {
  checks.push({ kind: "source corpse animation timing", owner: `animations-human-dead-body cycles=${humanDeadBodyCycles}`, animationId: "__missing_renderer_fragment__" });
}

const destroyedPlace = (manifest.animations ?? []).find((animation) => animation.id === "animations-destroyed-place")?.actions?.Death ?? [];
const destroyedPlaceCycles = destroyedPlace.reduce((sum, frame) => sum + Math.max(1, Math.floor(frame.wait || 1)), 0);
if (destroyedPlaceCycles !== 401) {
  checks.push({ kind: "source destroyed-place animation timing", owner: `animations-destroyed-place cycles=${destroyedPlaceCycles}`, animationId: "__missing_renderer_fragment__" });
}

for (const [sourceName, source, fragments] of [
  ["world", worldSource, [
    "animationDefinitions: WargusAnimation[]",
    "sourceAnimations: WargusAnimation[] = []",
    "animationDefinitions: sourceAnimations"
  ]],
  ["orders", ordersSource, [
    "function sourceAttackAnimationCooldownForUnit",
    "animation?.actions.Attack",
    "Math.max(sourceCyclesToSeconds(world, 1), sourceCyclesToSeconds(world, cycles))",
    "const sourceAnimationCooldown = sourceAttackAnimationCooldownForUnit(world, unit)",
    "function sourceAttackAnimationLaunchDelayForUnit",
    "delaySeconds <= sourceCyclesToSeconds(world, 1)",
    "function stepPendingAttacks",
    "launchAttackNow(world, attacker, target)",
    "world.pendingAttacks.push",
    "function spellCastCooldownForUnit",
    "animation?.actions.SpellCast",
    "caster.spellCooldown = spellCastCooldownForUnit(world, caster, fallbackCooldownSeconds)",
    "return finishSpellCast(world, caster,",
    "function sourceDeathAnimationDurationSeconds",
    "world.animationDefinitions.find((animation) => animation.id === animationId)?.actions.Death",
    "return sourceCyclesToSeconds(world, cycles)",
    "duration: sourceDeathAnimationDurationSeconds(world, corpseDefinition?.animation ?? unit.animation)"
  ]],
  ["save-game", saveSource, [
    "function sourceAttackAnimationLaunchDelayForSave",
    "const sourceLaunchDelaySeconds = sourceAttackAnimationLaunchDelayForSave(world, source)",
    "sourceLaunchDelaySeconds <= sourceCyclesToSeconds(world, 1)",
    "remainingSeconds: Math.min(sourceLaunchDelaySeconds, remainingSeconds)"
  ]],
  ["renderer", renderWorldSource, [
    "animationActionForUnit(unit, world, animation)",
    "const action = animationActionForUnit(unit, world, animation)",
    "let cursor = animationFrameCursorForUnitAction(unit, world, action, frames, totalWait)",
    "function animationFrameCursorForUnitAction",
    "if (action !== \"Attack\")",
    "const pendingAttack = world.pendingAttacks.find((attack) => attack.sourceId === unit.id)",
    "const launchDelayCycles = sourceAttackAnimationLaunchDelayCyclesForRender(frames)",
    "pendingAttack.remainingSeconds * sourceDefaultGameSpeed(world)",
    "unit.attackCooldown * sourceDefaultGameSpeed(world)",
    "function sourceAttackAnimationLaunchDelayCyclesForRender",
    "function isSourceUpgradeProduction(world: WorldState, unit: WorldState[\"units\"][number]): boolean",
    "button.action === \"upgrade-to\"",
    "&& button.value === active.unitTypeId",
    "&& sourceButtonAppliesTo(button, unit.typeId)",
    "unit.productionQueue[0] && hasAction(\"Train\")",
    "unit.productionQueue[0] && hasAction(\"Upgrade\") && isSourceUpgradeProduction(world, unit)",
    "world.activeResearch.some((research) => research.buildingId === unit.id) && hasAction(\"Research\")",
    "unit.construction && hasAction(\"Upgrade\")",
    "unit.spellCooldown > 0 && hasAction(\"SpellCast\")",
    "hasAction(\"Harvest_wood\")",
    "hasAction(\"Repair\")",
    "world.pendingAttacks.some((attack) => attack.sourceId === unit.id) && hasAction(\"Attack\")"
  ]],
  ["main", mainSource, [
    "manifest.tilesets, manifest.animations"
  ]],
  ["save", saveSource, [
    "manifest.tilesets, manifest.animations"
  ]]
]) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      checks.push({ kind: `${sourceName} attack animation runtime`, owner: fragment, animationId: "__missing_renderer_fragment__" });
    }
  }
}

if (ordersSource.includes("delaySeconds <= 1 / world.tickRate") || saveSource.includes("sourceLaunchDelaySeconds <= 1 / world.tickRate")) {
  checks.push({ kind: "source-cycle launch delay threshold", owner: "raw browser tick-rate threshold", animationId: "__missing_renderer_fragment__" });
}

const missing = checks.filter((check) => !animationIds.has(check.animationId));

if (missing.length > 0) {
  for (const check of missing) {
    console.error(check.animationId === "__missing_renderer_fragment__"
      ? `${check.kind}: missing ${check.owner}`
      : `${check.kind} ${check.owner}: missing ${check.animationId}`);
  }
  console.error(`Animation reference errors: ${missing.length}`);
  process.exit(1);
}

console.log(`Animation references verified (${checks.length} references checked).`);
