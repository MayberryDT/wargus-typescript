import { readFileSync } from "node:fs";

const stratagusRoot = "/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src";
const selectionSource = readFileSync(`${stratagusRoot}/src/stratagus/selection.cpp`, "utf8");
const botPanelSource = readFileSync(`${stratagusRoot}/src/ui/botpanel.cpp`, "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const renderHudSource = readFileSync("src/view/renderHud.ts", "utf8");
const selectionInputSource = readFileSync("src/view/selectionInput.ts", "utf8");
const browserCommandCardSource = readFileSync("scripts/verify-browser-command-card-session.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const errors = [];

function expect(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function expectIncludes(source, fragment, message) {
  expect(source.includes(fragment), message);
}

const toggleSelectSource = selectionSource.match(/int ToggleSelectUnit[\s\S]*?int SelectUnitsByType/)?.[0] ?? "";
expectIncludes(toggleSelectSource, "if (unit.Selected)", "Stratagus ToggleSelectUnit should still unselect already selected units.");
expectIncludes(toggleSelectSource, "Selected[0]->Type->Building", "Stratagus ToggleSelectUnit should still guard building/mobile mixing.");
expectIncludes(toggleSelectSource, "unit.Type != Selected[0]->Type", "Stratagus ToggleSelectUnit should still reject different building types.");
expectIncludes(toggleSelectSource, "SelectUnit(unit)", "Stratagus ToggleSelectUnit should still delegate successful adds to SelectUnit.");

const toggleTypeSource = selectionSource.match(/int ToggleUnitsByType[\s\S]*?int SelectGroup/)?.[0] ?? "";
expectIncludes(toggleTypeSource, "Selected[0]->Type->Building", "Stratagus same-type toggle should still guard building/mobile mixing.");
expectIncludes(toggleTypeSource, "unit->Type->Building && Selected.size()", "Stratagus same-type toggle should still reject mixed building types.");
expectIncludes(toggleTypeSource, "!unit->Type->Building && Selected.size() && Selected[0]->Type->Building", "Stratagus same-type toggle should still reject adding mobile units to buildings.");

const addRectangleSource = selectionSource.match(/int AddSelectedUnitsInRectangle[\s\S]*?int SelectGroundUnitsInRectangle/)?.[0] ?? "";
expectIncludes(addRectangleSource, "table[i]->Type->Building && Selected.size()", "Stratagus additive rectangle selection should still reject mixed building types.");
expectIncludes(addRectangleSource, "!table[i]->Type->Building && Selected.size() && Selected[0]->Type->Building", "Stratagus additive rectangle selection should still reject adding mobile units to buildings.");

const toggleSelectionSource = ordersSource.match(/export function toggleSelection[\s\S]*?export type ControlGroups/)?.[0] ?? "";
expectIncludes(toggleSelectionSource, "sourceCanToggleUnitIntoSelection(world, currentIds, unitId)", "Browser toggleSelection should gate adds through source mixing rules.");
expectIncludes(toggleSelectionSource, ": currentIds", "Browser rejected source toggles should leave selection unchanged.");
expectIncludes(toggleSelectionSource, "export function sourceCanToggleUnitIntoSelection", "Browser should expose a source-style selection mixing helper.");
expectIncludes(toggleSelectionSource, "isBuildingLike(firstSelected)", "Browser source mixing helper should inspect the first selected unit with source Building semantics.");
expectIncludes(toggleSelectionSource, "isBuildingLike(unit) && unit.typeId === firstSelected.typeId", "Browser source mixing helper should only add same-type source buildings to building selections.");
expectIncludes(toggleSelectionSource, "return !isBuildingLike(unit);", "Browser source mixing helper should reject adding source buildings to mobile selections.");
const sourceMixingHelper = ordersSource.match(/export function sourceCanToggleUnitIntoSelection[\s\S]*?\n}\n/)?.[0] ?? "";
expect(!sourceMixingHelper.includes('kind === "building"') && !sourceMixingHelper.includes('kind !== "building"'), "Browser source mixing helper should not use browser-local kind text for source Building checks.");
expectIncludes(selectionInputSource, "toggleSelection(world, selectedUnitIds", "Selection input should keep delegating additive point toggles to simulation orders.");

const multipleButtonPanelSource = botPanelSource.match(/static void UpdateButtonPanelMultipleUnits[\s\S]*?static void UpdateButtonPanel/)?.[0] ?? "";
expectIncludes(multipleButtonPanelSource, "PlayerRaces.Name[ThisPlayer->Race]", "Stratagus multiple-unit panel should still use race group button masks.");
expectIncludes(multipleButtonPanelSource, "strstr(buttonAction->UnitMask.c_str(), unit_ident)", "Stratagus multiple-unit panel should still filter buttons through the race group mask.");
expectIncludes(multipleButtonPanelSource, "ranges::all_of(Selected", "Stratagus multiple-unit panel should still require every selected unit to allow a group button.");
expectIncludes(ordersSource, "export function sourceGroupButtonScopeForSelection", "Browser should expose a source-style mixed-selection group scope helper.");
expectIncludes(ordersSource, "return `${race}-group`;", "Browser mixed-selection group scope should map player race to the source group mask.");
expectIncludes(ordersSource, "readyUnits.every((unit) => sourceButtonHasExecutableContext(world, button, unit, [groupScope]))", "Browser mixed-selection source actions should require every selected unit to allow the group button.");
expectIncludes(renderHudSource, "if (sourceGroupScope) {", "HUD should short-circuit mixed selections to source group commands.");
expectIncludes(renderHudSource, "return commands", "HUD mixed-selection source group branch should return before worker/build fallbacks leak in.");
expectIncludes(browserCommandCardSource, "__WARGUS_TS_SELECT_MIXED_FIXTURE_UNIT_TYPES__", "Browser command-card verifier should include a mixed source group fixture.");
expectIncludes(browserCommandCardSource, "expectNoCommand(mixed.commandCard, id", "Browser command-card verifier should reject worker/build commands on mixed source group cards.");
expect(JSON.stringify(packageJson.scripts).includes("verify:source-selection-mixing"), "package.json verify scripts missing verify:source-selection-mixing.");

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source selection mixing verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source selection mixing verified (additive toggles preserve Stratagus building/mobile constraints).");
