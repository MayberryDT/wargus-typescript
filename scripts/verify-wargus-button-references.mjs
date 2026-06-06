import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));

const unitIds = new Set(manifest.units.map((unit) => unit.id));
const upgradeIds = new Set(manifest.upgrades.map((upgrade) => upgrade.id));
const spellIds = new Set(manifest.spells.map((spell) => spell.id));
const popupIds = new Set((manifest.popups ?? []).map((popup) => popup.id));

const valueReferenceSets = new Map([
  ["build", unitIds],
  ["train-unit", unitIds],
  ["upgrade-to", unitIds],
  ["research", upgradeIds],
  ["cast-spell", spellIds]
]);

const missingReferences = [];
const missingValues = [];
let popupReferences = 0;
let sourceBackedPopupReferences = 0;

for (const button of manifest.buttons) {
  if (button.popup) {
    popupReferences += 1;
    if (!popupIds.has(button.popup)) {
      missingReferences.push({ id: button.id, action: "popup", value: button.popup });
    }
    if (button.popupKind && button.popupRace && typeof button.popupHasHint === "boolean" && typeof button.popupHasDescription === "boolean" && Array.isArray(button.popupVariables) && Array.isArray(button.popupExtraHints)) {
      sourceBackedPopupReferences += 1;
    }
  }
  const referenceSet = valueReferenceSets.get(button.action);
  if (!referenceSet) {
    continue;
  }
  if (!button.value) {
    missingValues.push(button);
    continue;
  }
  if (!referenceSet.has(button.value)) {
    missingReferences.push(button);
  }
}

const renderHudSource = readFileSync("src/view/renderHud.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
for (const fragment of [
  "function sourcePopupLabel",
  "function sourcePopupColor",
  "function sourcePopupStatTicks",
  "popup.includes(\"unit\")",
  "popupKind === \"unit\"",
  "popupKind === \"building\"",
  "popupHasHint",
  "popupHasDescription",
  "popupShowsCosts",
  "popupExtraHints",
  "sourcePopupColor(command.sourceButton)"
]) {
  const source = fragment === "sourcePopupColor(command.sourceButton)" ? renderHudSource : sourceUiHelpersSource;
  if (fragment.startsWith("popup.includes") ? renderHudSource.includes(fragment) : !source.includes(fragment)) {
    missingReferences.push({ id: "src/view/renderHud.ts", action: "popup-runtime", value: fragment });
  }
}

if (popupReferences < 200) {
  missingReferences.push({ id: "public/wargus/manifest.json", action: "popup-coverage", value: `expected at least 200 button popup groups, found ${popupReferences}` });
}

if ((manifest.popups ?? []).length < 9) {
  missingReferences.push({ id: "public/wargus/manifest.json", action: "popup-definitions", value: `expected source DefinePopup definitions, found ${(manifest.popups ?? []).length}` });
}

if (sourceBackedPopupReferences < 200) {
  missingReferences.push({ id: "public/wargus/manifest.json", action: "popup-runtime-metadata", value: `expected at least 200 buttons enriched with source popup metadata, found ${sourceBackedPopupReferences}` });
}

if (missingValues.length > 0 || missingReferences.length > 0) {
  for (const button of missingValues) {
    console.error(`${button.id}: ${button.action} button is missing value`);
  }
  for (const button of missingReferences) {
    console.error(`${button.id}: ${button.action} references unknown value ${button.value}`);
  }
  console.error(`Wargus button reference errors: ${missingValues.length + missingReferences.length}`);
  process.exit(1);
}

console.log(`Wargus button references verified (${manifest.buttons.length} buttons checked).`);
