import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const dataRoot = manifest.dataRoot;
const sourceUi = readFileSync(path.join(dataRoot, "scripts/ui.lua"), "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");

const errors = [];

for (const fragment of [
  'DefinePopup({',
  'Ident = "popup-human-commands"',
  'Ident = "popup-orc-commands"',
  'Condition = {ButtonAction = "move"}',
  'Condition = {ButtonAction = "repair"}',
  '~<ALT~>-click to defend unit.',
  '~<SHIFT~>-click to make waypoints.',
  '~<CTRL~>-click on button enables/disables auto-repair of damaged buildings.'
]) {
  if (!sourceUi.includes(fragment)) {
    errors.push(`Missing source popup fragment: ${fragment}`);
  }
}

const moveButton = manifest.buttons.find((button) => button.action === "move" && button.popupExtraHints?.some((hint) => hint.startsWith("ALT-click")));
const repairButton = manifest.buttons.find((button) => button.action === "repair" && button.popupExtraHints?.some((hint) => hint.startsWith("CTRL-click")));
const castButton = manifest.buttons.find((button) => button.action === "cast-spell" && button.popupKind === "upgrade" && button.popupExtraHints?.some((hint) => hint.includes("auto-cast")));
const stopButton = manifest.buttons.find((button) => button.action === "stop" && button.popupKind === "commands");
const describedPopupButton = manifest.buttons.find((button) => button.popupKind && button.popupHasHint === true && button.popupHasDescription === true);
const expectedPopupMetadata = new Map([
  ["popup-commands", { race: "any", kind: "commands" }],
  ["popup-human-building", { race: "human", kind: "building" }],
  ["popup-human-commands", { race: "human", kind: "commands" }],
  ["popup-human-unit", { race: "human", kind: "unit" }],
  ["popup-human-upgrade", { race: "human", kind: "upgrade" }],
  ["popup-orc-building", { race: "orc", kind: "building" }],
  ["popup-orc-commands", { race: "orc", kind: "commands" }],
  ["popup-orc-unit", { race: "orc", kind: "unit" }],
  ["popup-orc-upgrade", { race: "orc", kind: "upgrade" }]
]);

if (!moveButton) {
  errors.push("Manifest missing source move popup ALT/SHIFT hints.");
}
if (!repairButton) {
  errors.push("Manifest missing source repair popup CTRL hint.");
}
if (!castButton) {
  errors.push("Manifest missing source cast-spell popup auto-cast hint.");
}
if (!moveButton?.popupConditionalHints?.move?.some((hint) => hint.startsWith("ALT-click")) || !moveButton?.popupConditionalHints?.move?.some((hint) => hint.startsWith("SHIFT-click"))) {
  errors.push("Manifest missing source move-specific conditional popup hints.");
}
if (!repairButton?.popupConditionalHints?.repair?.some((hint) => hint.startsWith("CTRL-click"))) {
  errors.push("Manifest missing source repair-specific conditional popup hint.");
}
if ((stopButton?.popupConditionalHints?.stop?.length ?? 0) > 0) {
  errors.push("Stop buttons should not inherit move/repair popup text as stop-specific hints.");
}
if (!describedPopupButton) {
  errors.push("Manifest missing source popup hint/description flags on enriched buttons.");
}
for (const [id, expected] of expectedPopupMetadata) {
  const popup = manifest.popups.find((candidate) => candidate.id === id);
  if (!popup || popup.race !== expected.race || popup.kind !== expected.kind) {
    errors.push(`Manifest popup ${id} should derive ${expected.race}/${expected.kind} metadata from source button references.`);
  }
}

for (const [name, fragments] of [
  ["hover state", [
    "let hoveredHudCommandId: HudCommandId | null = null",
    'hit.on("pointerover"',
    'hit.on("pointerout"',
    "drawSourceCommandPopup(layer, graphics"
  ]],
  ["popup rendering", [
    "function drawSourceCommandPopup",
    "sourcePopupLines(command)"
  ]]
]) {
  for (const fragment of fragments) {
    if (!hudSource.includes(fragment)) {
      errors.push(`${name} missing HUD fragment: ${fragment}`);
    }
  }
}

for (const fragment of [
    "function sourcePopupLines(command: HudCommand)",
    "function sourcePopupConditionalHints(button: WargusButton)",
    "button.popupHasHint ? sourceHintText",
    "button.popupHasDescription ? sourcePopupConditionalHints(button) : []",
    "button.popupConditionalHints?.[button.action]",
    "button.popupActionHints?.includes(button.action)",
    "sourcePopupConditionalHints(button).length > 0",
    "function sourceHintText"
]) {
  if (!sourceUiHelpersSource.includes(fragment.replace("command: HudCommand", "command: SourcePopupCommand"))) {
    errors.push(`popup helper missing source UI helper fragment: ${fragment}`);
  }
}

for (const fragment of [
  "conditionalHints: Object.fromEntries",
  "function enrichPopupDefinitionsFromButtons(popupsById, buttons)",
  "function sourceButtonScriptRace(scriptFile)",
  "function sourceButtonPopupKind(button)",
  "enrichPopupDefinitionsFromButtons(popupsById, buttons)",
  "button.popupHasHint = popup?.hasHint ?? false",
  "button.popupHasDescription = popup?.hasDescription ?? false",
  "button.popupConditionalHints = popup?.conditionalHints ?? {}"
]) {
  if (!readFileSync("scripts/index-wargus-data.mjs", "utf8").includes(fragment)) {
    errors.push(`Popup indexer missing conditional hint fragment: ${fragment}`);
  }
}

for (const fragment of [
  'race: id.includes("human")',
  'kind: id.includes("building")'
]) {
  if (readFileSync("scripts/index-wargus-data.mjs", "utf8").includes(fragment)) {
    errors.push(`Popup indexer should derive popup race/kind from source button references, not popup id text: ${fragment}`);
  }
}

for (const fragment of [
  "export function sourceCommandHint(world: WorldState, unit: WorldUnit): string | null",
  "function sourceFallbackCommandHint(world: WorldState, unit: WorldUnit): string | null",
  "export function sourceButtonHintActionLabel(button: WargusButton): string | null",
  "sourceButtonLabel(button) ?? sourceButtonHintActionLabel(button)",
  "const sourceCardButton = candidates.find((button) => sourceButtonIsCommandCardHint(button))",
  "function sourceButtonIsCommandCardHint(button: WargusButton): boolean",
  "function canCastSourceButtonSpell(world: WorldState, caster: WorldUnit, spellId: string): boolean",
  "hasSpellResearch(world, caster.player, spellId, spell?.dependUpgrade ?? null)",
  "caster.mana >= manaCost",
  'button.action === "train-unit"',
  '|| button.action === "button"',
  "townCenterTier(world, typeId, unit.player) === 1",
  "selectedCanTrainMatching(world, [unit], isOrdinaryBarracksCombatDefinition)",
  "canUseHudBuilderCommands(unit)"
]) {
  if (!ordersSource.includes(fragment)) {
    errors.push(`Simulation command hint missing fragment: ${fragment}`);
  }
}

if (hudSource.includes("function sourceCommandHint(") || hudSource.includes("function sourceButtonHintActionLabel(")) {
  errors.push("HUD should delegate source command hint resolution to simulation instead of owning local source hint helpers.");
}

const commandHintMatch = sourceUiHelpersSource.match(/export function commandHint[\s\S]*?\n}/);
const commandHintSource = commandHintMatch?.[0] ?? "";
if (!commandHintSource.includes("sourceCommandHint(world, unit) ?? \"Idle\"")) {
  errors.push("Source UI commandHint should delegate command hint resolution to simulation.");
}
for (const fragment of [
  "townCenterTier(world, typeId, unit.player) === 1",
  "selectedCanTrainMatching(world, [unit], isOrdinaryBarracksCombatDefinition)",
  "canUseHudBuilderCommands(unit)"
]) {
  if (!commandHintSource.includes(fragment)) {
    continue;
  }
  errors.push(`Source UI helpers should delegate command hint fallback to simulation instead of owning: ${fragment}`);
}

if (sourceUiHelpersSource.includes('|| typeId === "unit-town-hall" || typeId === "unit-great-hall"')) {
  errors.push("Command hint fallback should use source MainFacility tiering instead of stock town-hall/great-hall ids.");
}

if (sourceUiHelpersSource.includes('|| typeId === "unit-human-barracks" || typeId === "unit-orc-barracks"')) {
  errors.push("Command hint fallback should use selected-unit trainability instead of stock barracks ids.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source command popup verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source command popups verified (hover popup text uses Wargus hints and action conditions).");
