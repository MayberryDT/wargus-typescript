import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const unitIds = new Set((manifest.units ?? []).map((unit) => unit.id));
const upgradeIds = new Set((manifest.upgrades ?? []).map((upgrade) => upgrade.id));
const missileIds = new Set((manifest.missiles ?? []).map((missile) => missile.id));
const soundIds = new Set((manifest.sounds ?? []).map((sound) => sound.id));
const validActionTypes = new Set([
  "adjust-variable",
  "adjust-vitals",
  "area-adjust-vitals",
  "area-bombardment",
  "capture",
  "demolish",
  "lua-callback",
  "polymorph",
  "spawn-portal",
  "spawn-missile",
  "summon",
  "teleport"
]);

const errors = [];
const overlaySource = readFileSync("src/view/renderOverlays.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
let references = 0;
let sourcePriorityReferences = 0;
let sourceAttackerConditions = 0;
let sourceHitPointPercentReferences = 0;
let sourceManaPercentReferences = 0;

function checkId(kind, spellId, id, validIds) {
  if (!id) {
    return;
  }
  references += 1;
  if (!validIds.has(id)) {
    errors.push(`${kind} ${spellId}: unknown id ${id}`);
  }
}

function checkFiniteNumber(kind, spellId, value) {
  if (value === null || value === undefined) {
    return;
  }
  references += 1;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${kind} ${spellId}: invalid number ${String(value)}`);
  }
}

function checkPositiveNumber(kind, spellId, value) {
  checkFiniteNumber(kind, spellId, value);
  if (typeof value === "number" && Number.isFinite(value) && value <= 0) {
    errors.push(`${kind} ${spellId}: expected positive number ${value}`);
  }
}

for (const spell of manifest.spells ?? []) {
  checkFiniteNumber("spell mana cost", spell.id, spell.manaCost);
  if (spell.range !== "infinite") {
    checkFiniteNumber("spell range", spell.id, spell.range);
  }
  checkFiniteNumber("spell autocast range", spell.id, spell.autocastRange);
  checkFiniteNumber("spell ai range", spell.id, spell.aiCastRange);
  checkFiniteNumber("spell autocast min hit point percent", spell.id, spell.autocastHitPointMinPercent);
  checkFiniteNumber("spell autocast max hit point percent", spell.id, spell.autocastHitPointMaxPercent);
  checkFiniteNumber("spell ai min hit point percent", spell.id, spell.aiCastHitPointMinPercent);
  checkFiniteNumber("spell ai max hit point percent", spell.id, spell.aiCastHitPointMaxPercent);
  checkFiniteNumber("spell autocast min mana percent", spell.id, spell.autocastManaMinPercent);
  checkFiniteNumber("spell autocast max mana percent", spell.id, spell.autocastManaMaxPercent);
  checkFiniteNumber("spell ai min mana percent", spell.id, spell.aiCastManaMinPercent);
  checkFiniteNumber("spell ai max mana percent", spell.id, spell.aiCastManaMaxPercent);
  if (
    spell.autocastHitPointMinPercent !== null
    || spell.autocastHitPointMaxPercent !== null
    || spell.aiCastHitPointMinPercent !== null
    || spell.aiCastHitPointMaxPercent !== null
  ) {
    sourceHitPointPercentReferences += 1;
  }
  if (
    spell.autocastManaMinPercent !== null
    || spell.autocastManaMaxPercent !== null
    || spell.aiCastManaMinPercent !== null
    || spell.aiCastManaMaxPercent !== null
  ) {
    sourceManaPercentReferences += 1;
  }
  for (const priority of [spell.autocastPriority, spell.aiCastPriority]) {
    if (!priority) {
      continue;
    }
    references += 1;
    sourcePriorityReferences += 1;
    if (!["Distance", "HitPoints", "Points", "Priority"].includes(priority.variable)) {
      errors.push(`spell priority ${spell.id}: unsupported variable ${priority.variable}`);
    }
    if (typeof priority.reverseSort !== "boolean") {
      errors.push(`spell priority ${spell.id}: invalid reverseSort ${String(priority.reverseSort)}`);
    }
  }
  for (const [kind, callback] of [["autocast", spell.autocastPositionCallback], ["ai-cast", spell.aiCastPositionCallback]]) {
    if (callback !== null) {
      references += 1;
      if (typeof callback !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(callback)) {
        errors.push(`spell ${kind} position callback ${spell.id}: invalid callback ${String(callback)}`);
      }
    }
  }
  checkId("spell dependency", spell.id, spell.dependUpgrade, upgradeIds);
  checkId("spell cast sound", spell.id, spell.soundWhenCast, soundIds);

  for (const actionType of spell.actionTypes ?? []) {
    references += 1;
    if (!validActionTypes.has(actionType)) {
      errors.push(`spell action ${spell.id}: unknown action type ${actionType}`);
    }
  }
  if ((spell.conditions ?? []).includes("attacker") || (spell.autocast ?? []).includes("attacker") || (spell.aiCast ?? []).includes("attacker")) {
    sourceAttackerConditions += 1;
  }

  for (const adjustment of spell.adjustVitals ?? []) {
    references += 1;
    if (typeof adjustment.variable !== "string" || adjustment.variable.length === 0) {
      errors.push(`spell vital adjustment ${spell.id}: missing variable`);
    }
    checkFiniteNumber("spell vital adjustment amount", spell.id, adjustment.amount);
  }

  for (const adjustment of spell.variableAdjustments ?? []) {
    references += 1;
    if (typeof adjustment.variable !== "string" || adjustment.variable.length === 0) {
      errors.push(`spell variable adjustment ${spell.id}: missing variable`);
    }
    checkFiniteNumber("spell variable adjustment amount", spell.id, adjustment.amount);
  }

  for (const adjustment of spell.areaAdjustVitals ?? []) {
    checkFiniteNumber("spell area vital hit point adjustment", spell.id, adjustment.hitPoints);
    checkFiniteNumber("spell area vital mana adjustment", spell.id, adjustment.manaPoints);
    checkFiniteNumber("spell area vital shield adjustment", spell.id, adjustment.shieldPoints);
    checkFiniteNumber("spell area vital range", spell.id, adjustment.range);
    if (typeof adjustment.useMana !== "boolean") {
      errors.push(`spell area vital ${spell.id}: invalid useMana ${String(adjustment.useMana)}`);
    }
  }

  for (const missileSpawn of spell.missileSpawns ?? []) {
    checkId("spell missile spawn", spell.id, missileSpawn.missile, missileIds);
    checkFiniteNumber("spell missile spawn damage", spell.id, missileSpawn.damage);
    checkFiniteNumber("spell missile spawn delay", spell.id, missileSpawn.delay);
    checkFiniteNumber("spell missile spawn ttl", spell.id, missileSpawn.ttl);
    if (missileSpawn.startBase !== null && !["caster", "target"].includes(missileSpawn.startBase)) {
      errors.push(`spell missile spawn ${spell.id}: invalid startBase ${String(missileSpawn.startBase)}`);
    }
    if (missileSpawn.endBase !== null && !["caster", "target"].includes(missileSpawn.endBase)) {
      errors.push(`spell missile spawn ${spell.id}: invalid endBase ${String(missileSpawn.endBase)}`);
    }
    checkFiniteNumber("spell missile spawn start offset x", spell.id, missileSpawn.startOffsetX);
    checkFiniteNumber("spell missile spawn start offset y", spell.id, missileSpawn.startOffsetY);
    checkFiniteNumber("spell missile spawn end offset x", spell.id, missileSpawn.endOffsetX);
    checkFiniteNumber("spell missile spawn end offset y", spell.id, missileSpawn.endOffsetY);
  }

  for (const missileDamage of spell.missileDamages ?? []) {
    checkId("spell missile damage", spell.id, missileDamage.missile, missileIds);
    checkFiniteNumber("spell missile damage amount", spell.id, missileDamage.damage);
    checkFiniteNumber("spell missile delay", spell.id, missileDamage.delay);
    checkFiniteNumber("spell missile ttl", spell.id, missileDamage.ttl);
    if (missileDamage.startBase !== null && !["caster", "target"].includes(missileDamage.startBase)) {
      errors.push(`spell missile ${spell.id}: invalid startBase ${String(missileDamage.startBase)}`);
    }
    if (missileDamage.endBase !== null && !["caster", "target"].includes(missileDamage.endBase)) {
      errors.push(`spell missile ${spell.id}: invalid endBase ${String(missileDamage.endBase)}`);
    }
    checkFiniteNumber("spell missile start offset x", spell.id, missileDamage.startOffsetX);
    checkFiniteNumber("spell missile start offset y", spell.id, missileDamage.startOffsetY);
    checkFiniteNumber("spell missile end offset x", spell.id, missileDamage.endOffsetX);
    checkFiniteNumber("spell missile end offset y", spell.id, missileDamage.endOffsetY);
  }

  for (const missileId of spell.missiles ?? []) {
    checkId("spell missile", spell.id, missileId, missileIds);
  }

  for (const capture of spell.captures ?? []) {
    checkFiniteNumber("spell capture damage", spell.id, capture.damage);
    checkFiniteNumber("spell capture percent", spell.id, capture.percent);
    if (typeof capture.sacrifice !== "boolean" || typeof capture.joinToAiForce !== "boolean") {
      errors.push(`spell capture ${spell.id}: invalid capture flags ${JSON.stringify(capture)}`);
    }
  }

  for (const demolish of spell.demolishes ?? []) {
    checkPositiveNumber("spell demolish range", spell.id, demolish.range);
    checkPositiveNumber("spell demolish damage", spell.id, demolish.damage);
  }

  for (const bombardment of spell.areaBombardments ?? []) {
    checkId("spell area bombardment missile", spell.id, bombardment.missile, missileIds);
    checkPositiveNumber("spell area bombardment fields", spell.id, bombardment.fields);
    checkPositiveNumber("spell area bombardment shards", spell.id, bombardment.shards);
    checkFiniteNumber("spell area bombardment damage", spell.id, bombardment.damage);
    checkFiniteNumber("spell area bombardment start offset x", spell.id, bombardment.startOffsetX);
    checkFiniteNumber("spell area bombardment start offset y", spell.id, bombardment.startOffsetY);
  }

  for (const polymorph of spell.polymorphs ?? []) {
    checkId("spell polymorph target", spell.id, polymorph.newForm, unitIds);
  }

  for (const portal of spell.spawnPortals ?? []) {
    checkId("spell spawn portal unit", spell.id, portal.unitTypeId, unitIds);
    checkPositiveNumber("spell spawn portal time-to-live", spell.id, portal.timeToLive);
    if (typeof portal.currentPlayer !== "boolean") {
      errors.push(`spell spawn portal ${spell.id}: invalid currentPlayer ${String(portal.currentPlayer)}`);
    }
  }

  for (const summon of spell.summons ?? []) {
    checkId("spell summon unit", spell.id, summon.unitTypeId, unitIds);
    checkPositiveNumber("spell summon time-to-live", spell.id, summon.timeToLive);
  }

  for (const variable of spell.callbackUnitVariables ?? []) {
    references += 1;
    if (typeof variable.callback !== "string" || variable.callback.length === 0) {
      errors.push(`spell callback variable ${spell.id}: missing callback`);
    }
    if (typeof variable.variable !== "string" || variable.variable.length === 0) {
      errors.push(`spell callback variable ${spell.id}: missing variable`);
    }
    checkId("spell callback unit", spell.id, variable.unitTypeId, unitIds);
    checkFiniteNumber("spell callback variable value", spell.id, variable.value);
  }
}

for (const spellId of ["spell-eye-of-vision", "spell-eye-of-vision-double-head", "spell-unholy-armor"]) {
  const spawn = manifest.spells.find((candidate) => candidate.id === spellId)?.missileSpawns?.[0];
  if (spawn?.missile !== "missile-normal-spell" || spawn.damage !== null || spawn.startBase !== "target") {
    errors.push(`${spellId} should preserve the source visual spawn-missile start-point metadata, found ${JSON.stringify(spawn ?? null)}.`);
  }
}

if (sourcePriorityReferences < 10) {
  errors.push(`Expected at least 10 source spell priority references, found ${sourcePriorityReferences}.`);
}

if (sourceAttackerConditions < 4) {
  errors.push(`Expected source attacker spell-condition coverage, found ${sourceAttackerConditions}.`);
}

for (const spellId of ["spell-bloodlust", "spell-bloodlust-double-head", "spell-flame-shield", "spell-unholy-armor"]) {
  const spell = manifest.spells.find((candidate) => candidate.id === spellId);
  if (!spell?.autocast?.includes("attacker")) {
    errors.push(`${spellId} should preserve source attacker autocast gating, found ${JSON.stringify(spell?.autocast ?? null)}.`);
  }
}
for (const spellId of ["spell-bloodlust", "spell-bloodlust-double-head"]) {
  const spell = manifest.spells.find((candidate) => candidate.id === spellId);
  if (!spell?.conditions?.includes("organic") || !spell.conditions.includes("only")) {
    errors.push(`${spellId} should preserve source manual target condition organic only, found ${JSON.stringify(spell?.conditions ?? null)}.`);
  }
}

for (const [spellId, variable] of [["spell-haste", "Haste"], ["spell-slow", "Slow"], ["spell-bloodlust", "Bloodlust"], ["spell-bloodlust-double-head", "Bloodlust"]]) {
  const rule = manifest.spells.find((candidate) => candidate.id === spellId)?.conditionVariableRules?.find((candidate) => candidate.variable === variable);
  if (rule?.exactValue !== 0) {
    errors.push(`${spellId} should preserve source ${variable} ExactValue=0 condition, found ${JSON.stringify(rule ?? null)}.`);
  }
}

for (const [spellId, variable] of [["spell-invisibility", "Invisible"], ["spell-unholy-armor", "UnholyArmor"]]) {
  const rule = manifest.spells.find((candidate) => candidate.id === spellId)?.conditionVariableRules?.find((candidate) => candidate.variable === variable);
  if (rule?.maxValue !== 10) {
    errors.push(`${spellId} should preserve source ${variable} MaxValue=10 condition, found ${JSON.stringify(rule ?? null)}.`);
  }
}

for (const fragment of [
  "function sourceStatusVariableForKind(kind:",
  ".flatMap((spell) => spell.variableAdjustments)",
  ".filter((adjustment) => adjustment.variable === source.variable && adjustment.amount > 0)",
  "sourceAmounts.length > 0 ? Math.max(...sourceAmounts) : source.fallbackCycles",
  "const sourceTotalSeconds = sourceStatusEffectDurationSeconds(world, kind) ?? totalSeconds",
  "const multipliers = sourceStatusEffectMultipliers(kind)",
  "speedMultiplier: multipliers.speedMultiplier",
  "damageMultiplier: multipliers.damageMultiplier",
  "function removeOpposingSourceStatusEffectForSave",
  "if (sourceTotalSeconds <= 0)",
  "remainingSeconds: Math.min(remainingSeconds, sourceTotalSeconds)",
  "const sourceOwnedEffect = kind !== null && sourceOwnedSpellEffectKind(kind)",
  "const sourceUnit = sourceOwnedEffect && typeof record.sourceUnitId === \"string\"",
  "const sourceUnitId = sourceUnit?.id ?? null",
  "const sourceTypeId = !sourceOwnedEffect",
  "? null",
  ": sourceUnit && validSourceTypes.has(sourceUnit.typeId)",
  "function sourceOwnedSpellEffectKind(kind: WorldState[\"spellEffects\"][number][\"kind\"]): boolean",
  "return kind === \"blizzard\" || kind === \"death-and-decay\" || kind === \"whirlwind\" || kind === \"runes\"",
  "const missileId = restoredSpellEffectMissileId(world, record.missileId, kind, spellId)",
  "function restoredSpellEffectMissileId(world: WorldState, value: unknown, kind: WorldState[\"spellEffects\"][number][\"kind\"], spellId: string | null): string | null",
  "const clickMissileId = world.engineSettings.clickMissileId",
  "const sourceDuration = sourceSpellEffectDurationForSave(world, kind, spellId, missileId, duration)",
  "if (sourceDuration <= 0 || age >= sourceDuration)",
  "const savedSpell = typeof value === \"string\" ? world.spellDefinitions.find((spell) => spell.id === value) : undefined",
  "if (savedSpell && sourceSpellMatchesEffectKind(world, savedSpell, kind))"
]) {
  if (!saveSource.includes(fragment)) {
    errors.push(`Save/load status duration normalization should derive source status durations from all parsed spell variable adjustments, missing: ${fragment}`);
  }
}
if (saveSource.includes('spellId: "spell-bloodlust"') || saveSource.includes("function spellVariableAdjustment(world: WorldState, spellId: string")) {
  errors.push("Save/load status duration normalization should not pin status variables to one stock spell id.");
}

if (sourceHitPointPercentReferences < 3) {
  errors.push(`Expected source HitPoints percent spell-condition coverage, found ${sourceHitPointPercentReferences}.`);
}

if (sourceManaPercentReferences < 3) {
  errors.push(`Expected source Mana percent spell-condition coverage, found ${sourceManaPercentReferences}.`);
}

for (const [spellId, autocastCallback, aiCastCallback] of [
  ["spell-holy-vision", "SpellHolyVision", null],
  ["spell-eye-of-vision", "PosEyeOfVision", null],
  ["spell-eye-of-vision-double-head", "PosEyeOfVision", null],
  ["spell-blizzard", "SpellBlizzard", "SpellBlizzard"],
  ["spell-death-coil", "SpellDeathCoil", "SpellDeathCoil"]
]) {
  const spell = manifest.spells.find((candidate) => candidate.id === spellId);
  if (spell?.autocastPositionCallback !== autocastCallback || spell?.aiCastPositionCallback !== aiCastCallback) {
    errors.push(`${spellId} position-autocast callbacks are ${JSON.stringify({ autocast: spell?.autocastPositionCallback, aiCast: spell?.aiCastPositionCallback })}, expected ${JSON.stringify({ autocast: autocastCallback, aiCast: aiCastCallback })}.`);
  }
}

for (const spellId of ["spell-holy-vision", "spell-eye-of-vision", "spell-eye-of-vision-double-head"]) {
  const spell = manifest.spells.find((candidate) => candidate.id === spellId);
  if (!spell) {
    errors.push(`Expected source Mana percent spell ${spellId}.`);
    continue;
  }
  if (!spell.autocast?.includes("self") || !spell.autocast?.includes("Mana") || spell.autocastManaMinPercent !== 99) {
    errors.push(`${spellId} should preserve source self/Mana autocast gate at 99%, found autocast=${JSON.stringify(spell.autocast)} minMana=${spell.autocastManaMinPercent}.`);
  }
}

const raiseDead = manifest.spells.find((candidate) => candidate.id === "spell-raise-dead");
const raiseDeadSummon = raiseDead?.summons?.find((summon) => summon.unitTypeId === "unit-skeleton");
if (!raiseDead?.repeatCast || raiseDead?.range !== 6 || !raiseDeadSummon?.requireCorpse || raiseDeadSummon?.timeToLive !== 3600) {
  errors.push(`spell-raise-dead should preserve source repeat-cast/range/require-corpse payload, found ${JSON.stringify({ repeatCast: raiseDead?.repeatCast, range: raiseDead?.range, summon: raiseDeadSummon })}.`);
}
if (!raiseDead?.autocast?.includes("corpse") || !raiseDead?.aiCast?.includes("corpse")) {
  errors.push(`spell-raise-dead should preserve source corpse autocast/ai-cast tokens, found autocast=${JSON.stringify(raiseDead?.autocast)} aiCast=${JSON.stringify(raiseDead?.aiCast)}.`);
}

const suicideBomber = manifest.spells.find((candidate) => candidate.id === "spell-suicide-bomber");
if (!suicideBomber?.actionTypes?.includes("demolish") || (suicideBomber?.demolishes ?? []).length === 0) {
  errors.push("spell-suicide-bomber should preserve the source demolish action type and payload.");
}

for (const [spellId, missileId] of [["spell-blizzard", "missile-blizzard"], ["spell-death-and-decay", "missile-death-and-decay"]]) {
  const spell = manifest.spells.find((candidate) => candidate.id === spellId);
  const bombardment = spell?.areaBombardments?.find((candidate) => candidate.missile === missileId);
  if (!spell?.repeatCast || bombardment?.fields !== 5 || bombardment?.shards !== 11) {
    errors.push(`${spellId} should preserve source repeat-cast area bombardment fields/shards, found ${JSON.stringify({ repeatCast: spell?.repeatCast, bombardment })}.`);
  }
}

for (const spellId of ["spell-aid", "spell-flame-shield"]) {
  const spell = manifest.spells.find((candidate) => candidate.id === spellId);
  if (!spell) {
    errors.push(`Expected source autocast-only target condition spell ${spellId}.`);
    continue;
  }
  if ((spell.aiCast ?? []).length > 0 || (spell.autocast ?? []).length === 0) {
    errors.push(`${spellId} should preserve source autocast-only target rules, found aiCast=${JSON.stringify(spell.aiCast)} autocast=${JSON.stringify(spell.autocast)}.`);
  }
}

const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const renderWorldSource = readFileSync("src/view/renderWorld.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const hudCommandExecutionSource = readFileSync("src/view/hudCommandExecution.ts", "utf8");
const worldPointerInputSource = readFileSync("src/view/worldPointerInput.ts", "utf8");
const selectionHotkeySource = readFileSync("src/view/selectionHotkeys.ts", "utf8");
const commandKeySource = readFileSync("src/simulation/commandKeys.ts", "utf8");
const sourceDeathCoil = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/missile/missile_deathcoil.cpp", "utf8");
const sourceSpellScript = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/spell/script_spell.cpp", "utf8");

for (const fragment of [
  'value == "area-adjust-vitals"',
  'value == "capture"',
  'value == "spawn-portal"',
  'value == "teleport"'
]) {
  if (!sourceSpellScript.includes(fragment)) {
    errors.push(`Stratagus spell action registry is missing expected action fragment: ${fragment}`);
  }
}

if (!ordersSource.includes('return canTargetMobileSpell(unit) && unit.organic && !hasStatusEffect(unit, "bloodlust");')) {
  errors.push("Bloodlust manual targeting should follow source organic-only cast conditions instead of requiring combat-capable units.");
}
for (const fragment of [
  'return canTargetMobileSpell(unit) && !hasStatusEffect(unit, "invisibility");',
  'return canTargetMobileSpell(unit) && !hasStatusEffect(unit, "unholy-armor");'
]) {
  if (ordersSource.includes(fragment)) {
    errors.push(`Near-expiry source recasts should not be blocked before MaxValue condition rules run: ${fragment}`);
  }
}
for (const fragment of [
  "function canTargetMobileCombatSpell",
  'positiveStatusKinds.includes("bloodlust") && !unit.canAttack'
]) {
  if (ordersSource.includes(fragment)) {
    errors.push(`Bloodlust source targeting should not keep combat-only browser fallback fragment: ${fragment}`);
  }
}

for (const fragment of [
  "HitUnit(&source, *this->TargetUnit, this->Damage)",
  "source.Variable[HP_INDEX].Value += this->Damage"
]) {
  if (!sourceDeathCoil.includes(fragment)) {
    errors.push(`Stratagus Death Coil source missing expected missile damage/heal fragment: ${fragment}`);
  }
}
for (const fragment of [
  "function parseSpellAutoCastPriority",
  "autocastPriority: parseSpellAutoCastPriority(autocastBody)",
  "aiCastPriority: parseSpellAutoCastPriority(aiCastBody)",
  "conditionVariableRules: parseSpellVariableConditionRules(conditionBody)",
  "autocastVariableRules: parseSpellVariableConditionRules(autocastConditionBody)",
  "aiCastVariableRules: parseSpellVariableConditionRules(aiCastConditionBody)",
  "function parseSpellVariableConditionRules",
  "exactValue: readConditionNumberField(ruleBody, \"ExactValue\")",
  "maxValue: readConditionNumberField(ruleBody, \"MaxValue\")",
  "actionTypes: parseSpellActionTypes(actionBody)",
  "function parseSpellActionTypes",
  "areaAdjustVitals: parseSpellAreaAdjustVitals(actionBody)",
  "captures: parseSpellCaptures(actionBody)",
  "spawnPortals: parseSpellSpawnPortals(actionBody)",
  "function parseSpellAreaAdjustVitals",
  "function parseSpellCaptures",
  "function parseSpellSpawnPortals",
  "startBase: startPoint ? readSpellPointBase(startPoint) : null",
  "endBase: endPoint ? readSpellPointBase(endPoint) : null",
  "function readSpellPointBase(body)",
  'autocastManaMinPercent: autocastBody ? readNestedPercentField(autocastBody, "Mana", "MinValuePercent") : null'
]) {
  if (!indexSource.includes(fragment)) {
    errors.push(`Spell indexer is missing source priority fragment: ${fragment}`);
  }
}

if (manifest.spells.some((spell) => spell.actionTypes?.includes("base"))) {
  errors.push("Spell actionTypes should only contain top-level source action entries, but nested coordinate token 'base' was indexed.");
}
for (const fragment of [
  "function sourceSpellAiPriority",
  "function compareSourceSpellTargets",
  "priority.reverseSort ? rightValue - leftValue : leftValue - rightValue",
  "sourceSpellPriorityValue",
  'variable === "attacker"',
  "return unit.canAttack",
  "function sourceManaPercentMatches",
  "function sourceHitPointPercentMatches",
  "function sourceCasterAiSpellConditionsMatch",
  "function sourceCasterCombatConditionMatches",
  "function sourceHolyVisionAutocastPoint(world: WorldState, caster: WorldUnit): { x: number; y: number }",
  "const callback = sourcePositionAutocastCallback(world, \"spell-holy-vision\")",
  "callback && callback !== \"SpellHolyVision\"",
  "function sourcePositionAutocastCallback(world: WorldState, spellId: string): string | null",
  "spell?.aiCastPositionCallback ?? spell?.autocastPositionCallback ?? null",
  "function sourcePositionAutocastTarget(",
  "const callback = sourcePositionAutocastCallback(world, spellId)",
  "callback !== \"SpellBlizzard\" || unitMatchesSourceCastConditions(world, spellId, unit, caster)",
  "deterministicHash(`${world.tick}:${caster.id}:spell-holy-vision`)",
  "const { x, y } = sourceHolyVisionAutocastPoint(world, caster)",
  'const combatIndex = tokens.indexOf("combat")',
  "canAttackTarget(caster, unit, world) || canAttackTarget(unit, caster, world)",
  "conditionMode === \"only\" ? inCombat : !inCombat",
  "function sourceCasterCorpseConditionMatches",
  "const corpseIndex = tokens.indexOf(\"corpse\")",
  "const hasVisibleCorpse = (world.corpses ?? []).some((corpse) =>",
  "isCorpseInRaiseDeadRange(world, caster, corpse, rangeTiles)",
  "isCircleVisibleToPlayer(world, corpse.x, corpse.y, corpse.radius, caster.player)",
  "conditionMode === \"only\" ? hasVisibleCorpse : !hasVisibleCorpse",
  ".filter((spell) => sourceCasterAiSpellConditionsMatch(world, spell, caster, mode))",
  "sourceCastConditionTokensMatch(world, caster, aiTokens, caster)",
  "arePlayersAllied(world, caster.player, unit.player) && unit.player !== 15 && unit.hitPoints > 0 && isUnitVisibleToPlayer(world, unit, caster.player)",
  "arePlayersAllied(world, caster.player, unit.player) && unit.player !== 15 && canHealTarget(unit)",
  "function issueSourceAdjustVitalsOrder(world: WorldState, casterId: string, spellId: string): boolean",
  "\"spell-aid\": (world, casterId) => issueSourceAdjustVitalsOrder(world, casterId, \"spell-aid\")",
  "const targetTokens = spell.aiCast.length > 0 ? spell.aiCast : spell.autocast;",
  "if (targetTokens.length === 0)",
  "sourceCastConditionTokensMatch(world, unit, targetTokens, caster, targetRules)",
  "sourceTargetAttackerConditionMatches(world, unit, targetTokens)",
  "spell.conditionVariableRules",
  "spell.aiCast.length > 0 ? spell.aiCastVariableRules : spell.autocastVariableRules",
  "function sourceVariableConditionRulesMatch",
  "function sourceVariableRuleForCondition",
  "sourceVariableRuleForCondition(variableRules, variable)",
  "function sourceStatusKindHasConditionRule",
  "positiveStatusKindsWithSourceRules.includes(kind) || !hasStatusEffect(candidate, kind)",
  "function sourceFlameShieldDamagePulseTicks(world: WorldState, spellId = \"spell-flame-shield\"): number",
  "const sourceCycles = Math.max(1, Math.floor((missile?.sleep ?? 1) * 8));",
  "return sourceOrderRetryTicks(world, sourceCycles)",
  "world.tick % sourceFlameShieldDamagePulseTicks(world, spellId)",
  "function sourceFlameShieldMissileId(world: WorldState, spellId = \"spell-flame-shield\"): string",
  "...(spell?.missileSpawns.map((missile) => missile.missile) ?? [])",
  "sourceMissileIdForSpellByClass(world, spellId, \"missile-class-flame-shield\")",
  "return spell?.missileSpawns[0]?.missile ?? spell?.missileDamages[0]?.missile ?? spell?.missiles[0] ?? null",
  "spellMissileDamageTotal(world, spellId, missileId, 8)",
  "if (world.tick % sourceFlameShieldDamagePulseTicks(world, spellId) === 0)",
  "return castHealAt(world, caster, target);",
  "return castExorcismAt(world, caster, target);",
  "function canHealTarget(unit: WorldUnit): boolean",
  "unit.organic\n    && !isBuildingLike(unit)",
  "function canExorcismTarget(unit: WorldUnit): boolean",
  "return isUndeadUnit(unit) && !isBuildingLike(unit);",
  "function canPolymorphTarget(unit: WorldUnit): boolean",
  "return unit.organic && !isBuildingLike(unit);",
  "spellTargetMatchesSource(world, requirement.spellId, caster, unit, canExorcismTarget)",
  "return castHolyVisionAt(world, caster, x, y);",
  "return castFireballAt(world, caster, target.x, target.y);",
  "return castFlameShieldAt(world, caster, target);",
  "return castBlizzardAt(world, caster, target.x, target.y);",
  "return castPolymorphAt(world, caster, target);",
  "return castSlowAt(world, caster, target);",
  "return castInvisibilityAt(world, caster, target);",
  "return castDeathCoilAt(world, caster, target);",
  "return castDeathAndDecayAt(world, caster, target.x, target.y);",
  "return castWhirlwindAt(world, caster, target.x, target.y);",
  "return castUnholyArmorAt(world, caster, target);",
  "return castHasteAt(world, caster, target);",
  "return castBloodlustAt(world, caster, target);",
  "return castRunesAt(world, caster, target.x, target.y, \"spell-runes\");",
  "return castEyeOfKilroggAt(world, caster, caster.x, caster.y, \"spell-eye-of-vision\", \"upgrade-eye-of-kilrogg\");",
  "addSpellEffect(world, \"flame-shield\", caster.player, target.x, target.y, sourceSpellVisualRadius(world, spellId, 56), sourceSpellAnimationDuration(world, spellId, 0.9), caster.typeId",
  "addSpellEffect(world, \"flame-shield\", unit.player, unit.x, unit.y, sourceSpellVisualRadius(world, spellId, radius), sourceSpellAnimationDuration(world, spellId, 0.55), unit.typeId",
  "rule.exactValue !== null && value !== rule.exactValue",
  "rule.maxValue !== null && rule.maxValue <= value",
  "sourceConditionVariableValue(world, subject, rule.variable)",
  "return sourceStatusRemainingCycles(world, unit, status)",
  "function sourceStatusRemainingCycles(world: WorldState, unit: WorldUnit, status: WorldUnit[\"statusEffects\"][number][\"kind\"]): number",
  "return Math.max(0, Math.round(statusEffectRemainingSeconds(unit, status) * sourceDefaultGameSpeed(world)))",
  "function sourceTargetAttackerConditionMatches",
  "const attackerIndex = tokens.indexOf(\"attacker\")",
  "mode === \"only\" ? attacking : !attacking",
  "function sourceUnitIsAttackingNearGoal",
  "sourceReactionRangeForUnit(world, unit)",
  "function sourceUnitAttackGoal",
  "order.kind === \"attack-ground\"",
  "order.kind === \"follow\" && order.attackTargetId",
  "function sourceDeathCoilAutocastTarget(world: WorldState, caster: WorldUnit): WorldUnit | undefined",
  "const callback = sourcePositionAutocastCallback(world, spellId)",
  "callback && callback !== \"SpellDeathCoil\"",
  "b.hitPoints - a.hitPoints || compareSourceSpellTargets(world, caster, a, b, sourceSpellAiPriority(world, spellId))",
  "function applyDeathCoilAt(world: WorldState, caster: WorldUnit, x: number, y: number): WorldUnit[]",
  "function sourceDeathCoilTargetsAt(world: WorldState, caster: WorldUnit, x: number, y: number): WorldUnit[]",
  "let damageLeft = spellPrimaryMissileDamage(world, \"spell-death-coil\", 50)",
  "const damage = index + 1 === targets.length ? damageLeft : Math.min(damageLeft, target.hitPoints)",
  "caster.hitPoints = Math.min(caster.maxHitPoints, caster.hitPoints + damage)",
  "Math.abs(Math.floor(unit.x / world.tileSize) - goalTileX) <= 2",
  "Math.abs(Math.floor(unit.y / world.tileSize) - goalTileY) <= 2",
  "tickWhirlwindSpell(world, effect)",
  "function tickWhirlwindSpell(world: WorldState, effect: NonNullable<WorldState[\"spellEffects\"]>[number]): void",
  "function sourceWhirlwindDamagePulseTicks(world: WorldState): number",
  "return sourceOrderRetryTicks(world, 3)",
  "function sourceWhirlwindDirectionTicks(world: WorldState, missileId: string | null): number",
  "const sourceCycles = Math.max(1, Math.floor((missile?.sleep ?? 1) * 100));",
  "return sourceOrderRetryTicks(world, sourceCycles)",
  "function sourceWhirlwindNextPoint(world: WorldState, effect: NonNullable<WorldState[\"spellEffects\"]>[number]): { x: number; y: number }",
  "sourceWhirlwindNextPoint(world, effect)",
  "addSpellEffect(world, \"whirlwind\", caster.player, x, y, radius, spellPrimaryMissileTtlSeconds(world, \"spell-whirlwind\", sourceCyclesToSeconds(world, 800)), caster.typeId",
  "function canWhirlwindTarget(caster: WorldUnit, unit: WorldUnit, world?: WorldState): boolean",
  "&& isBuildingLike(unit);",
  "canBloodlustTarget(unit) && unitMatchesSourceCastConditions(world, spellId, unit, caster)",
  "compareSourceSpellTargets(world, caster, a, b, sourceSpellAiPriority(world, spellId))",
  "function sourceRaiseDeadAutocastCorpse(world: WorldState, caster: WorldUnit, spellId: string): WorldState[\"corpses\"][number] | null",
  "callback && callback !== \"SpellBlizzard\"",
  "findNearestRaiseDeadCorpse(world, caster, spellId)",
  "const corpse = sourceRaiseDeadAutocastCorpse(world, caster, spellId)",
  "return castRaiseDeadAt(world, caster, corpse.x, corpse.y);",
  "function findRaiseDeadCorpseNearPoint",
  "function findSourceSummonCorpseNearPoint",
  "function isCorpseInRaiseDeadRange",
  "spellAiRangeTiles(world, spellId, 6)",
  "function applySourceHitPointAdjustment",
  "function sourceAdjustVitalsCastCount",
  "spellManaCost(world, spellId, fallbackManaCost) * castCount",
  "Math.ceil(Math.max(0, hitPointDelta) / perCast)",
  "Math.floor(Math.max(0, caster.mana) / manaCost)",
  "spell.aiCastManaMinPercent",
  "spell.autocastManaMinPercent",
  "spell.aiCastHitPointMinPercent",
  "spell.autocastHitPointMinPercent",
  "function addEyeOfVisionCastEffect",
  "sourceSpellVisualRadius(world, spellId, 48)",
  "sourceSpellAnimationDuration(world, spellId, 0.9)",
  "return sourceCyclesToSeconds(world, missile.frames * missile.sleep);",
  "function areaBombardmentShardImpacts",
  "const shards = Math.max(1, Math.floor(sourceArea?.shards ?? 1));",
  "const startOffsetX = sourceArea?.startOffsetX ?? -fieldSize / 2;",
  "sourceMissileDamageRoll(world, effect.missileId, `${effect.id}:${world.tick}:${impact.index}`)",
  "emitSourceMissileImpactSound(world, effect.missileId, effect.player, impacts[0]?.x ?? effect.x, impacts[0]?.y ?? effect.y)",
  "function sourceSpawnMissileStartPoint(caster: WorldUnit, action: WargusSpell[\"missileSpawns\"][number], targetX: number, targetY: number): { x: number; y: number }",
  "const base = action.startBase === \"target\" ? { x: targetX, y: targetY } : caster",
  "function sourceSpawnMissileEndPoint(caster: WorldUnit, action: WargusSpell[\"missileSpawns\"][number], targetX: number, targetY: number): { x: number; y: number }",
  "const base = action.endBase === \"caster\" ? caster : { x: targetX, y: targetY }",
  "?.missileSpawns\n    .filter((missile) => missile.missile === missileId && typeof missile.ttl === \"number\")",
  "function spellMissileEndOffsets(world: WorldState, spellId: string, missileId: string): Array<{ x: number; y: number }>",
  "?.missileSpawns\n    .filter((missile) => missile.missile === missileId)",
  "x: missile.endOffsetX ?? missile.startOffsetX ?? 0",
  "const radius = sourceSpellEffectRadius(world, spellId, offsets.length > 1 ? world.tileSize : 62)",
  "function triggerRuneField(world: WorldState, effect: NonNullable<WorldState[\"spellEffects\"]>[number]): void",
  "const impactTileX = Math.floor(effect.x / world.tileSize)",
  "sourceLandMineTriggerUnit(world, effect, unit, impactTileX, impactTileY)",
  "function sourceLandMineTriggerUnit(world: WorldState, effect: NonNullable<WorldState[\"spellEffects\"]>[number], unit: WorldUnit, tileX: number, tileY: number): boolean",
  "missile?.canHitOwner !== true",
  "mapTileDistanceToUnit(world, unit, tileX, tileY) !== 0",
  "sourceMissileCanHitUnitByOwnership(world, effect.missileId ?? null, effect.player, unit, effect.sourceUnitId ?? null)",
  "addSourceMissileImpactEffect(world, impactMissile, effect.player, effect.x, effect.y, sourceMissileSplashRadius(world, effect.missileId ?? null, 58), spellId, effect.sourceTypeId ?? null, effect.sourceUnitId ?? null)",
  "function sourceMissileCanHitUnitByOwnership(world: WorldState, missileId: string | null | undefined, player: number, unit: WorldUnit, sourceUnitId: string | null = null): boolean",
  "function emitSourceMissileImpactSound(world: WorldState, missileId: string | null | undefined, player: number, x?: number, y?: number): void",
  "const impactSound = missileDefinitionForId(world, missileId ?? null)?.impactSound",
  "function activeStatusEffect",
  "activeStatusEffect(unit, \"flame-shield\")",
  "export function canToggleAutoCastSpell",
  "export function toggleAutoCastSpellForSelection",
  "function stepPlayerAutoCast",
  "sourceAiCombatSpellsForCaster(world, caster, new Set(caster.autoCastSpells), \"autocast\")",
  "function sourceAiCombatSpellsForCaster(world: WorldState, caster: WorldUnit, enabledSpellIds: Set<string> | null = null, mode: \"ai-cast\" | \"autocast\" = \"ai-cast\"): WargusSpell[]",
  ".filter((spell) => enabledSpellIds === null || enabledSpellIds.has(spell.id))",
  "function sourceSpellRuntimeTokens(spell: WargusSpell, mode: \"ai-cast\" | \"autocast\"): string[]",
  "return mode === \"ai-cast\" && spell.aiCast.length > 0 ? spell.aiCast : spell.autocast",
  "sourceSpellHasAiCombatUse(spell, mode)",
  "|| tokens.includes(\"alliance\")",
  "|| tokens.includes(\"self\")",
  "|| tokens.includes(\"HitPoints\")",
  "|| tokens.includes(\"Mana\")",
  "sourceCasterAiSpellConditionsMatch(world, spell, caster, mode)",
  "function sourceSkeletonVisualFallbackDefinition",
  "function sourceSkeletonVisualFallbackScore",
  "function sourceSummonedUnitDefinition",
  "sourceSummonedUnitDefinition(world, \"spell-raise-dead\")",
  "definition.isUndead",
  "(definition.canCastSpells?.length ?? 0) === 0",
  "Math.abs(definition.hitPoints - 40)",
  "Math.abs(definition.basicDamage - 6)",
  "Math.abs(definition.piercingDamage - 3)",
  "function eyeOfKilroggDefinition(world: WorldState, spellId: string): WargusUnit | undefined",
  "callbackUnitVariables",
  "variable.callback === \"SpellEyeOfVision\"",
  "function sourceEyeOfKilroggFallbackDefinition",
  "function sourceEyeOfKilroggFallbackScore",
  "isExploreOnReadyValue(definition.onReady) ? 0 : 1000",
  "definition.visibleUnderFog ? 100 : 0",
  "100 - Math.min(100, definition.priority ?? 0)",
  "function sourceCasterCanCastAny(caster: WorldUnit, spellIds: string[]): boolean",
  'sourceCasterCanCastAny(caster, ["spell-blizzard", "spell-polymorph", "spell-slow", "spell-invisibility", "spell-fireball", "spell-flame-shield"])',
  'sourceCasterCanCastAny(caster, ["spell-death-and-decay", "spell-whirlwind", "spell-death-coil", "spell-raise-dead", "spell-unholy-armor"])',
  'sourceCasterCanCastAny(caster, ["spell-healing", "spell-exorcism", "spell-holy-vision"])',
  'sourceCasterCanCastAny(caster, ["spell-bloodlust", "spell-haste", "spell-runes", "spell-eye-of-vision"])'
]) {
  if (!ordersSource.includes(fragment)) {
    errors.push(`Spell runtime is missing source priority fragment: ${fragment}`);
  }
}

for (const fragment of [
  "function drawSpellEffects",
  "let drewFallbackGraphics = false",
  "if (drewFallbackGraphics)",
  "function sourceAreaBombardmentVisualImpacts",
  "const fields = Math.max(1, Math.floor(sourceArea?.fields ?? Math.max(1, Math.round((effect.radius * 2) / world.tileSize))))",
  "const shards = Math.max(1, Math.floor(sourceArea?.shards ?? Math.max(5, Math.min(14, Math.round(effect.radius / 10)))))",
  "const startOffsetX = sourceArea?.startOffsetX ?? -fieldSize / 2",
  "sourceStableVisualHash(`${effect.id}:${pulseTick}:${index}:x`)",
  "function sourceAreaBombardmentVisualPulseTick",
  "missile && missile.blizzardSpeed > 0 ? missile.blizzardSpeed : 10"
]) {
  if (!renderWorldSource.includes(fragment)) {
    errors.push(`Area spell renderer is missing source shard fragment: ${fragment}`);
  }
}

if (ordersSource.includes("addSpellEffect(world, \"fireball\", effect.player, effect.x, effect.y, 58, 0.7")) {
  errors.push("Rune detonation should use the source missile ImpactMissile instead of inventing a browser-local fireball fallback.");
}

for (const fragment of [
  '|| caster.typeId === "unit-mage"',
  '|| caster.typeId === "unit-death-knight"',
  '|| caster.typeId === "unit-paladin"',
  '|| caster.typeId === "unit-ogre-mage"'
]) {
  if (ordersSource.includes(fragment)) {
    errors.push(`AI spell fallback should classify casters from source CanCastSpell metadata instead of stock type ids: ${fragment}`);
  }
}

for (const fragment of [
  'world.unitDefinitions.find((unit) => unit.id === "unit-death-knight")',
  'world.unitDefinitions.find((unit) => unit.id === "unit-grunt")',
  'world.unitDefinitions.find((unit) => unit.id === "unit-footman")'
]) {
  if (ordersSource.includes(fragment)) {
    errors.push(`Raise Dead skeleton visual fallback should use source unit traits instead of stock unit ids: ${fragment}`);
  }
}
if (ordersSource.includes('haystack.includes("skeleton")')) {
  errors.push("Raise Dead skeleton visual fallback should use source unit traits instead of name, image, or id text scoring.");
}

for (const fragment of [
  "export function targetedSpellIdForCommand",
  "export function isTargetedSpellCommand(command: string): command is TargetedSpellCommand",
  "export function sourceSpellCommandForSpellId(world: Pick<WorldState, \"spellDefinitions\">, spellId: string): TargetedSpellCommand | null",
  "export function sourceSpellTargetForHudCommand(world: WorldState, selectedUnits: WorldUnit[], command: TargetedSpellCommand): string | null",
  "sourceSpellCommandForSpellId(world, button.value) === command",
  "sourceSpellTargetForHudCommand(world, selectedUnits, command)",
  "spell?.actionTypes.includes(\"summon\") && spell.summons.length > 0",
  "function sourceSummonTarget",
  "summon.requireCorpse",
  "findSourceSummonCorpseNearPoint",
  "world.corpses = (world.corpses ?? []).filter((candidate) => candidate.id !== corpse.id)",
  "export function sourceInstantSpellCommandForSpellId(world: Pick<WorldState, \"spellDefinitions\">, spellId: string): \"detonate\" | null",
  "spell?.actionTypes.includes(\"demolish\") && spell.demolishes.length > 0",
  "function sourceDemolishSpellForUnit",
  "function sourceDemolishSpellIdForUnit",
  "sourceDemolishAction(world, spellId)",
  "canIssueDetonateOrder(world, unit)",
  "`source-spawn-portal:${string}`",
  "`source-teleport:${string}`",
  "`source-area-adjust-vitals:${string}`",
  "`source-area-bombardment:${string}`",
  "`source-capture:${string}`",
  "`source-polymorph:${string}`",
  "`source-spawn-missile:${string}`",
  "spell?.actionTypes.includes(\"area-adjust-vitals\") && spell.areaAdjustVitals.length > 0",
  "return `source-area-adjust-vitals:${spellId}`",
  "spell?.actionTypes.includes(\"area-bombardment\") && spell.areaBombardments.length > 0",
  "return `source-area-bombardment:${spellId}`",
  "function canIssueSourceAreaBombardmentAt",
  "function castSourceAreaBombardmentAt",
  "function sourceAreaBombardmentEffectKind",
  "typeof sourceArea.startOffsetX === \"number\" || typeof sourceArea.startOffsetY === \"number\" ? \"blizzard\" : \"death-and-decay\"",
  "sourceArea?.damage",
  "spell?.actionTypes.includes(\"capture\") && spell.captures.length > 0",
  "return `source-capture:${spellId}`",
  "spell?.actionTypes.includes(\"polymorph\") && spell.polymorphs.length > 0",
  "return `source-polymorph:${spellId}`",
  "function sourcePolymorphTarget",
  "function canIssueSourcePolymorphAt",
  "function castSourcePolymorphAt",
  "applyPolymorphTransform(world, spellId, target)",
  "sourceSpellVisualRadius(world, spellId, 42)",
  "spell?.actionTypes.includes(\"spawn-missile\") && sourceSpawnMissileAction(world, spellId)",
  "return `source-spawn-missile:${spellId}`",
  "function sourceAreaAdjustVitalsConsumesMana",
  "function sourceAreaAdjustVitalsTargets",
  "function canIssueSourceAreaAdjustVitalsAt",
  "function castSourceAreaAdjustVitalsAt",
  "function applySourceAreaVitalAdjustment",
  "sourceAreaAdjustVitalsConsumesMana(world, spellId) ? spell.manaCost : 0",
  "adjustment.useMana",
  "const minX = (goalTileX - rangeTiles) * world.tileSize",
  "const maxX = (goalTileX + caster.tileWidth + rangeTiles) * world.tileSize",
  "function sourceCaptureConsumesMana",
  "function sourceCaptureTarget",
  "function canIssueSourceCaptureAt",
  "function castSourceCaptureAt",
  "function applySourceCaptureOwnership",
  "function removeSourceCaptureCaster",
  "Math.floor((100 * target.hitPoints) / target.maxHitPoints) > damagePercent",
  "target.player = caster.player",
  "target.order = null",
  "target.moveQueue = []",
  "capture.joinToAiForce",
  "function sourceSpawnMissileAction",
  "function sourceSpawnMissileTarget",
  "function canIssueSourceSpawnMissileAt",
  "function castSourceSpawnMissileAt",
  "id: `spell-projectile-${world.tick}-${world.projectiles.length}-${caster.id}`",
  "delaySeconds: sourceCyclesToSeconds(world, action.delay ?? 0)",
  "ttlSeconds: typeof action.ttl === \"number\" ? sourceCyclesToSeconds(world, action.ttl) : null",
  "const consumedDelaySeconds = Math.min(delaySeconds, tickSeconds)",
  "const ttlSeconds = projectile.ttlSeconds ?? 5",
  "impactMissileId: missileDefinition?.impactMissile ?? null",
  "splashFactor: missileDefinition?.splashFactor ?? 0",
  "bouncesRemaining: missileDefinition?.numBounces ?? 0",
  "emitSoundEvent(world, sound, caster.player, start.x, start.y)",
  "spell?.actionTypes.includes(\"spawn-portal\") && spell.spawnPortals.length > 0",
  "spell?.actionTypes.includes(\"teleport\")",
  "function castSourceSpawnPortalAt",
  "function castSourceTeleportAt",
  "function findSourceTeleportTile",
  "export function nextResearchUpgradeByRoleWithFallbacks(world: WorldState, unit: WorldUnit, matchesUpgradeId: (upgradeId: string) => boolean, fallbackSequence: string[], queue = false): string | null",
  "export function nextSpellResearchUpgrade(world: WorldState, unit: WorldUnit, spellId: string, fallbackUpgradeId: string, fallbackSequence: string[], queue = false): string | null",
  "export function sourceBuildingResearchesSpell(world: WorldState, buildingTypeId: string, spellId: string, fallbackUpgradeId: string, playerId = world.visibilityPlayer): boolean",
  "export function spellResearchUpgradeMatches(world: WorldState, upgradeId: string, spellId: string, fallbackUpgradeId: string): boolean",
  "export function issueFallbackTargetedSpellByKey(world: WorldState, unit: WorldUnit, code: string, queue = false): boolean | null",
  "export function targetedSpellCommandForKey(world: WorldState, code: string, unitIds: string[], playerId = world.visibilityPlayer): TargetedSpellCommand | null",
  "export function canSelectedIssueTargetedSpellAt(world: WorldState, unitIds: string[], command: TargetedSpellCommand, x: number, y: number, playerId = world.visibilityPlayer): boolean",
  "export function shouldKeepPendingWorldCommandAfterIssue(world: WorldState, command: PendingWorldCommand, issued: boolean): boolean",
  "targetedSpellIdForCommand(world, command.command)",
  "spell.id === spellId)?.repeatCast"
]) {
  const source = ordersSource;
  if (!source.includes(fragment)) {
    errors.push(`Spell repeat-cast cursor support is missing fragment: ${fragment}`);
  }
}
if (!indexSource.includes("delay: readActionNumber(body, \"delay\")")) {
  errors.push("Spell indexer should preserve spawn-missile delay from source Lua actions.");
}
for (const fragment of [
  "missileSpawns: parseSpellMissileSpawns(actionBody)",
  "autocastPositionCallback: parseSpellPositionAutocastCallback(autocastBody)",
  "aiCastPositionCallback: parseSpellPositionAutocastCallback(aiCastBody)",
  "function parseSpellPositionAutocastCallback(body)",
  "function parseSpellMissileSpawns(actionBody)",
  "damage: Number.isFinite(damage) ? damage : null"
]) {
  if (!indexSource.includes(fragment)) {
    errors.push(`Spell indexer should preserve no-damage spawn-missile source metadata: ${fragment}`);
  }
}
for (const fragment of [
  "missileSpawns: WargusSpellMissileSpawn[]",
  "autocastPositionCallback: string | null",
  "aiCastPositionCallback: string | null",
  "export interface WargusSpellMissileSpawn"
]) {
  if (!typesSource.includes(fragment)) {
    errors.push(`Spell types should expose source spawn-missile metadata: ${fragment}`);
  }
}
for (const fragment of [
  "function sourceSpawnMissileAction(world: Pick<WorldState, \"spellDefinitions\">, spellId: string): WargusSpell[\"missileSpawns\"][number] | null",
  "spell?.missileSpawns[0]?.missile ?? spell?.missileDamages[0]?.missile ?? spell?.missiles[0] ?? null",
  "spell.missileSpawns.find((candidate) => candidate.missile === missileId) ?? spell.missileDamages.find((candidate) => candidate.missile === missileId)",
  "damage: action.damage ?? 0",
  "function sourceSpawnMissileStartPoint(caster: WorldUnit, action: WargusSpell[\"missileSpawns\"][number], targetX: number, targetY: number): { x: number; y: number }"
]) {
  if (!ordersSource.includes(fragment)) {
    errors.push(`Spell runtime should consume full source spawn-missile metadata: ${fragment}`);
  }
}
if (!worldPointerInputSource.includes("shouldKeepPendingWorldCommandAfterIssue(world, pendingWorldCommand, issued)")) {
  errors.push("World pointer pending command path should use simulation repeat-cast cursor retention.");
}

for (const fragment of [
  "toggleAutoCastSpellForSelection(world, selectedUnitIds, spellId)",
  "input: { ctrlKey?: boolean; shiftKey?: boolean } = {}"
]) {
  if (!hudCommandExecutionSource.includes(fragment)) {
    errors.push(`Spell autocast HUD command support is missing fragment: ${fragment}`);
  }
}

if (!overlaySource.includes("canSelectedIssuePendingWorldCommandAt(world, selectedUnitIds, command, pointerWorldPosition.x, pointerWorldPosition.y, world.visibilityPlayer)")) {
  errors.push("Pending targeted spell cursor/preview validity should delegate through the simulation selected pending-command helper.");
}
if (overlaySource.includes("canSelectedIssueTargetedSpellAt(world, selectedUnitIds, command.command, pointerWorldPosition.x, pointerWorldPosition.y, world.visibilityPlayer)")) {
  errors.push("Pending targeted spell cursor/preview validity should not duplicate spell checks outside the simulation pending-command helper.");
}
if (!selectionHotkeySource.includes("targetedSpellCommandForKey(world, code, selectedUnitIds)")) {
  errors.push("Selection hotkey path should call simulation targeted spell hotkey resolution.");
}
if (mainSource.includes("function targetedSpellCommandForKey") || mainSource.includes("function sourceTargetedSpellCommandForKey")) {
  errors.push("Main should use simulation targeted spell hotkey resolution instead of local spell-command mapping.");
}
if (mainSource.includes("function sourceSpellCommandForSpellId") || mainSource.includes("function sourceInstantSpellCommandForSpellId") || mainSource.includes("function isTargetedSpellCommand")) {
  errors.push("Main should use simulation spell command mapping helpers instead of local copies.");
}
if (mainSource.includes("function nextResearchUpgradeByRoleWithFallbacks") || mainSource.includes("function nextSpellResearchUpgrade") || mainSource.includes("function sourceBuildingResearchesSpell") || mainSource.includes("function spellResearchUpgradeMatches")) {
  errors.push("Main should use simulation source spell/research fallback helpers instead of local copies.");
}
if (hudSource.includes("function spellResearchUpgradeMatches")) {
  errors.push("HUD should use simulation spellResearchUpgradeMatches instead of keeping a local copy.");
}
if (!ordersSource.includes("hasSourceSpellResearchValue(world: WorldState, values: Iterable<string>, spellId: string, fallbackUpgradeId: string): boolean")) {
  errors.push("Simulation should own source spell research-value matching.");
}
if (hudSource.includes("spellResearchUpgradeMatches")) {
  errors.push("HUD should use simulation source spell research-value matching instead of direct spellResearchUpgradeMatches calls.");
}
if (hudSource.includes("function sourceSpellCommandForSpellId") || hudSource.includes("function sourceInstantSpellCommandForSpellId")) {
  errors.push("HUD should use simulation source spell command mapping helpers instead of local copies.");
}
if (!hudSource.includes("sourceSpellCommandForSpellId") || !hudSource.includes("sourceInstantSpellCommandForSpellId")) {
  errors.push("HUD should import the simulation source spell command mapping helpers.");
}
if (!ordersSource.includes("export function selectedCanCastTargetedSpell(world: WorldState, unitIds: string[], command: TargetedSpellCommand, playerId = world.visibilityPlayer): boolean")) {
  errors.push("Simulation should expose selected targeted spell availability for HUD and command execution.");
}
if (!hudSource.includes("selectedCanCastTargetedSpell(world, readyUnitIds, command, playerId)") || !hudSource.includes("selectedCanCastTargetedSpell(world, readyUnits.map((unit) => unit.id), command, playerId)")) {
  errors.push("HUD targeted spell availability should delegate to the simulation selected spell helper.");
}
if (hudSource.includes("canCastTargetedSpellCommand(world, unit, command)")) {
  errors.push("HUD should not duplicate per-unit targeted spell availability checks.");
}
if (!hudCommandExecutionSource.includes("selectedCanCastTargetedSpell(world, selectedUnitIds, spellCommand)") || !hudCommandExecutionSource.includes("selectedCanCastTargetedSpell(world, selectedUnitIds, command)")) {
  errors.push("HUD command execution should use the simulation selected spell helper.");
}
if (hudCommandExecutionSource.includes("function selectedCanCastTargetedSpell")) {
  errors.push("HUD command execution should not keep a local selected spell availability helper.");
}
if (!commandKeySource.includes("issueFallbackTargetedSpellByKey(loadedWorld, unit, code, queue)")) {
  errors.push("Command-key path should call simulation fallback targeted spell hotkey issuing.");
}
for (const fragment of [
  "issueHasteOrder(loadedWorld, unitId)",
  "issueHealOrder(loadedWorld, unitId)",
  "issueExorcismOrder(loadedWorld, unitId)",
  "issueHolyVisionOrder(loadedWorld, unitId)",
  "issueFireballOrder(loadedWorld, unitId)",
  "issueFlameShieldOrder(loadedWorld, unitId)",
  "issueBlizzardOrder(loadedWorld, unitId)",
  "issueSlowOrder(loadedWorld, unitId)",
  "issueInvisibilityOrder(loadedWorld, unitId)",
  "issueDeathCoilOrder(loadedWorld, unitId)",
  "issueDeathAndDecayOrder(loadedWorld, unitId)",
  "issueWhirlwindOrder(loadedWorld, unitId)",
  "issueRaiseDeadOrder(loadedWorld, unitId)",
  "issueUnholyArmorOrder(loadedWorld, unitId)",
  "issueBloodlustOrder(loadedWorld, unitId)",
  "issueRunesOrder(loadedWorld, unitId)",
  "issueEyeOfKilroggOrder(loadedWorld, unitId)"
]) {
  if (mainSource.includes(fragment)) {
    errors.push(`Main should use simulation fallback targeted spell issuing instead of direct fallback call: ${fragment}`);
  }
}
if (mainSource.includes("function canSelectedCasterTargetSpellAt")) {
  errors.push("Main should use the simulation selected targeted spell helper instead of a local preview helper.");
}

const groupSpell = ordersSource.match(/export function issueGroupTargetedSpellOrder[\s\S]*?export function canSelectedIssueTargetedSpellAt/)?.[0] ?? "";
if (!ordersSource.includes("export function issueGroupTargetedSpellOrder(world: WorldState, unitIds: string[], command: TargetedSpellCommand, x: number, y: number, playerId = world.visibilityPlayer): boolean")) {
  errors.push("Simulation should expose group targeted spell issuing.");
}
if (!ordersSource.includes("canIssueTargetedSpellAt(world, unit, command, x, y)")) {
  errors.push("Group targeted spell issuing should use canIssueTargetedSpellAt.");
}
if (mainSource.includes("function issueGroupTargetedSpellOrder")) {
  errors.push("Main should use the simulation group targeted spell issuing helper instead of a local copy.");
}
if (groupSpell.includes("canCastTargetedSpellCommand(loadedWorld, unit, command)")) {
  errors.push("Group targeted spell issuing should use canIssueTargetedSpellAt instead of cast-only eligibility.");
}
for (const fragment of [
  "`source-adjust-vitals:${string}`",
  "spell?.actionTypes.includes(\"adjust-vitals\") && spell.adjustVitals.some((adjustment) => adjustment.variable === \"hit-points\")",
  "return `source-adjust-vitals:${spellId}`",
  "function sourceAdjustVitalsSpellId",
  "function findSourceAdjustVitalsTarget",
  "function castSourceAdjustVitalsAt",
  "spell.adjustVitals.some((adjustment) => adjustment.variable === \"hit-points\")",
  "applySourceHitPointAdjustment(world, caster, target, spellId, amount, spell.manaCost)"
]) {
  if (!ordersSource.includes(fragment)) {
    errors.push(`Simulation is missing generic source adjust-vitals spell dispatch fragment: ${fragment}`);
  }
}

if (ordersSource.includes("\"spell-aid\": \"source-adjust-vitals:spell-aid\"")) {
  errors.push("Simulation should dispatch spell-aid through generic source adjust-vitals metadata, not a hardcoded command map entry.");
}
const holyVisionOrder = ordersSource.match(/export function issueHolyVisionOrder[\s\S]*?function sourceHolyVisionAutocastPoint/)?.[0] ?? "";
if (holyVisionOrder.includes("arePlayersEnemies") || holyVisionOrder.includes("distanceSquared(caster")) {
  errors.push("Holy Vision autocast should use the source Lua callback's random map position, not nearest-enemy targeting.");
}
for (const [spellId, functionName] of [
  ["spell-fireball", "issueFireballOrder"],
  ["spell-blizzard", "issueBlizzardOrder"],
  ["spell-death-and-decay", "issueDeathAndDecayOrder"],
  ["spell-whirlwind", "issueWhirlwindOrder"]
]) {
  const source = ordersSource.match(new RegExp(`export function ${functionName}[\\s\\S]*?\\n}\\n`))?.[0] ?? "";
  if (!source.includes("sourcePositionAutocastTarget(world, caster, spellId")) {
    errors.push(`${functionName} should select its AI target through source position-autocast metadata for ${spellId}.`);
  }
  if (source.includes(`findNearestEnemyInSpellRange(world, caster, spellAiRangeTiles(world, "${spellId}"`)) {
    errors.push(`${functionName} still has spell-id-specific nearest-target logic instead of using sourcePositionAutocastTarget.`);
  }
}
if (ordersSource.includes("Math.round(damageDealt * 0.55)")) {
  errors.push("Death Coil should heal by source missile damage dealt, not a browser-local 55% approximation.");
}
if (!ordersSource.includes('const damage = projectile.className === "missile-class-death-coil"')
  || !ordersSource.includes("? projectile.damage")
  || !ordersSource.includes("healProjectileSourceByDamageDealt(world, projectile, damage)")) {
  errors.push("Death Coil projectile impact should use the source missile Damage value for both damage and caster healing.");
}
if (ordersSource.includes("beforeHitPoints - target.hitPoints")) {
  errors.push("Death Coil projectile healing should not be clamped to post-hitpoint damage; Stratagus heals by this->Damage.");
}
if (ordersSource.includes('unit.typeId !== "unit-critter"')) {
  errors.push("Spell targeting should follow source condition metadata instead of hardcoding a critter target ban.");
}
if (ordersSource.includes('world.unitDefinitions.find((unit) => unit.id === "unit-eye-of-vision")')
  || ordersSource.includes('world.unitDefinitions.find((unit) => unit.id === "unit-eye-of-kilrogg")')) {
  errors.push("Eye of Kilrogg unit lookup should use source callback metadata instead of stock eye unit ids.");
}
if (ordersSource.includes('haystack.includes("eye")') || ordersSource.includes('haystack.includes("kilrogg")')) {
  errors.push("Eye of Kilrogg fallback should use source scout/revealer traits instead of name text scoring.");
}
if (ordersSource.includes('haystack.includes("death")') || ordersSource.includes('haystack.includes("decay")')) {
  errors.push("Area bombardment effect kind should use indexed source area payload traits instead of spell or missile id text.");
}
if (ordersSource.includes("function applyDeathCoil(world: WorldState, caster: WorldUnit, target: WorldUnit): void")) {
  errors.push("Death Coil should use source point/area missile distribution instead of a single-target helper.");
}
if (ordersSource.includes('applySplashDamage(world, caster, x, y, radius, spellPrimaryMissileDamage(world, "spell-whirlwind", 3)')) {
  errors.push("Whirlwind should be a live source missile effect, not a one-shot splash at cast time.");
}
const whirlwindTargetBody = ordersSource.match(/function canWhirlwindTarget[\s\S]*?\n}\n/)?.[0] ?? "";
if (whirlwindTargetBody.includes('unit.kind === "building"')) {
  errors.push("Whirlwind target checks should use source Building condition semantics instead of browser-local kind text.");
}
for (const [helperName, message] of [
  ["canHealTarget", "Heal"],
  ["canExorcismTarget", "Exorcism"],
  ["canPolymorphTarget", "Polymorph"]
]) {
  const body = ordersSource.match(new RegExp(`function ${helperName}\\([\\s\\S]*?\\n}\\n`))?.[0] ?? "";
  if (body.includes('unit.kind !== "building"') || body.includes('unit.kind === "building"')) {
    errors.push(`${message} target checks should use source Building condition semantics instead of browser-local kind text.`);
  }
}
if (ordersSource.includes("Math.floor(world.tickRate / 10)")) {
  errors.push("Whirlwind damage pulse should use sourceOrderRetryTicks instead of raw browser tick-rate math.");
}
if (ordersSource.includes("statusEffectRemainingSeconds(unit, status) * world.tickRate")) {
  errors.push("Source status variable condition timing should use sourceDefaultGameSpeed instead of raw browser tick-rate math.");
}
if (ordersSource.includes("return Math.max(1, Math.floor((missile?.sleep ?? 1) * 8))")) {
  errors.push("Flame Shield pulse timing should convert source missile Sleep through sourceOrderRetryTicks instead of returning browser ticks directly.");
}
if (ordersSource.includes("return Math.max(1, Math.floor((missile?.sleep ?? 1) * 100))")) {
  errors.push("Whirlwind direction timing should convert source missile Sleep through sourceOrderRetryTicks instead of returning browser ticks directly.");
}

for (const fragment of [
  "`source-adjust-variable:${string}`",
  "function sourceAdjustVariableStatusAdjustments",
  "function sourceAdjustVariableStatusKinds",
  "function findSourceAdjustVariableTarget",
  "function castSourceAdjustVariableAt",
  "removalStatusKinds.some((kind) => hasStatusEffect(candidate, kind))",
  "sourceAdjustVariableStatusAdjustments(world, spellId).length > 0",
  "spell?.actionTypes.includes(\"adjust-variable\")",
  "return `source-adjust-variable:${spellId}`"
]) {
  if (!ordersSource.includes(fragment)) {
    errors.push(`Simulation is missing generic source adjust-variable spell dispatch fragment: ${fragment}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Spell reference errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Spell references verified (${references} spell action references checked).`);
