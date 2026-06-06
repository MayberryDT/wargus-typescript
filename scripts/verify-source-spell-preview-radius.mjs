import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const overlaySource = readFileSync("src/view/renderOverlays.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const previewSource = readFileSync("src/view/pendingCommandPreview.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");

const errors = [];

const spellById = new Map((manifest.spells ?? []).map((spell) => [spell.id, spell]));
const missileById = new Map((manifest.missiles ?? []).map((missile) => [missile.id, missile]));
const revealer = (manifest.units ?? []).find((unit) => unit.id === "unit-revealer");

const blizzard = spellById.get("spell-blizzard");
if (blizzard?.areaBombardments?.[0]?.fields !== 5) {
  errors.push(`spell-blizzard area fields are ${JSON.stringify(blizzard?.areaBombardments?.[0]?.fields)}, expected 5`);
}
if (blizzard?.areaBombardments?.[0]?.startOffsetX !== -128 || blizzard?.areaBombardments?.[0]?.startOffsetY !== -128) {
  errors.push(`spell-blizzard area start offsets are ${JSON.stringify({ x: blizzard?.areaBombardments?.[0]?.startOffsetX, y: blizzard?.areaBombardments?.[0]?.startOffsetY })}, expected -128,-128`);
}

const deathAndDecay = spellById.get("spell-death-and-decay");
if (deathAndDecay?.areaBombardments?.[0]?.fields !== 5) {
  errors.push(`spell-death-and-decay area fields are ${JSON.stringify(deathAndDecay?.areaBombardments?.[0]?.fields)}, expected 5`);
}

const runes = spellById.get("spell-runes");
const runeOffsets = (runes?.missileSpawns ?? []).map((missile) => [missile.endOffsetX ?? missile.startOffsetX, missile.endOffsetY ?? missile.startOffsetY]);
for (const expectedOffset of [[32, 0], [0, 32], [-32, 0], [0, -32]]) {
  if (!runeOffsets.some((offset) => offset[0] === expectedOffset[0] && offset[1] === expectedOffset[1])) {
    errors.push(`spell-runes missing source missile end offset ${JSON.stringify(expectedOffset)}`);
  }
}

const whirlwindMissile = missileById.get("missile-whirlwind");
if (JSON.stringify(whirlwindMissile?.size) !== JSON.stringify([56, 56]) || whirlwindMissile?.range !== 2) {
  errors.push(`missile-whirlwind size/range is ${JSON.stringify({ size: whirlwindMissile?.size, range: whirlwindMissile?.range })}, expected [56,56] and range 2`);
}

if ((revealer?.sightRange ?? 0) < 6) {
  errors.push(`unit-revealer sightRange is ${JSON.stringify(revealer?.sightRange)}, expected at least 6`);
}
if (revealer?.revealer !== true || revealer?.vanishes !== true) {
  errors.push(`unit-revealer source flags are ${JSON.stringify({ revealer: revealer?.revealer, vanishes: revealer?.vanishes })}, expected Revealer/Vanishes coverage`);
}

for (const [name, source, fragments] of [
  ["overlay renderer", overlaySource, [
    "pendingSpellPreviewRadius(world, command.command, camera.zoom)"
  ]],
  ["pending command preview", previewSource, [
    "targetedSpellIdForCommand(world, command)",
    "function sourceSpellPreviewRadius",
    "const revealerRadius = sourceRevealerSummonPreviewRadius(world, spell)",
    "function sourceRevealerSummonPreviewRadius",
    "unit?.revealer === true || unit?.vanishes === true || unit?.nonSolid === true",
    "summonedUnit ? Math.max(1, summonedUnit.sightRange ?? 0) * world.tileSize : 0",
    "spell.areaBombardments[0]?.fields",
    "sourceAreaBombardmentPreviewRadius(world, spell.areaBombardments[0])",
    "sourceArea.startOffsetX ?? -fieldSize / 2",
    "Math.hypot(maxX, maxY)",
    "function sourceMissilePreviewRadius",
    "missile.range > 0 ? missile.range * world.tileSize : 0",
    "...spell.missileSpawns.map((missile) => Math.hypot(missile.endOffsetX ?? missile.startOffsetX ?? 0, missile.endOffsetY ?? missile.startOffsetY ?? 0) + sourceMissilePreviewRadius(world, missile.missile))",
    "Math.hypot(missile.endOffsetX ?? missile.startOffsetX ?? 0, missile.endOffsetY ?? missile.startOffsetY ?? 0) + sourceMissilePreviewRadius"
  ]],
  ["orders", ordersSource, [
    "areaBombardmentRadius(world, \"spell-blizzard\", 86)",
    "function sourceAreaBombardmentRadius(world: WorldState",
    "sourceArea.startOffsetX ?? -fieldSize / 2",
    "Math.hypot(maxX, maxY)",
    "sourceSpellEffectRadius(world, \"spell-whirlwind\", 72)",
    "spellSummonLifetimeSeconds(world, \"spell-holy-vision\", revealerTypeId, 8)",
    "spellCallbackUnitLifetimeSeconds(world, spellId, eyeDefinition.id, 25)",
    "function sourceRevealerSummonUnitTypeId",
    "definition?.revealer === true || definition?.vanishes === true || definition?.nonSolid === true",
    "sourceRevealerSummonUnitTypeId(world, \"spell-holy-vision\", \"unit-revealer\")"
  ]],
  ["world", worldSource, [
    "revealer: boolean",
    "revealer: unit.revealer ?? false",
    "return unit.revealer",
    "&& unit.vanishes",
    "&& unit.nonSolid"
  ]]
]) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      errors.push(`${name} missing fragment: ${fragment}`);
    }
  }
}

if (previewSource.includes('spellId === "spell-holy-vision"')) {
  errors.push("Pending spell preview radius should detect source revealer summons instead of branching on the stock Holy Vision spell id.");
}
if (previewSource.includes('case "cast-holy-vision"')) {
  errors.push("Pending spell preview fallback should not hardcode Holy Vision; source revealer summon metadata should provide its radius.");
}
if (ordersSource.includes("function spellSummonUnitTypeId")) {
  errors.push("Holy Vision runtime should choose source revealer summons by traits instead of taking the first summon with a stock fallback helper.");
}
if (previewSource.includes("function pendingCommandColor") || previewSource.includes("isPendingSpellCommand")) {
  errors.push("Pending spell preview helper should not keep stale pending-command color logic after overlay validity colors moved to simulation checks.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source spell preview radius verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source spell preview radii verified (targeting circles use Wargus spell/missile footprint metadata).");
