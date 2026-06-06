import { readFileSync } from "node:fs";

const stratagusRoot = "/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src";
const groupsSource = readFileSync(`${stratagusRoot}/src/stratagus/groups.cpp`, "utf8");
const selectionSource = readFileSync(`${stratagusRoot}/src/stratagus/selection.cpp`, "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const controlGroupInputSource = readFileSync("src/view/controlGroupInput.ts", "utf8");
const saveGameSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const renderWorldSource = readFileSync("src/view/renderWorld.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
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

expectIncludes(groupsSource, "#define NUM_GROUPS 10", "Stratagus should still define ten source control groups.");
expectIncludes(groupsSource, "tainted = unit.Type->BoolFlag[SELECTABLEBYRECTANGLE_INDEX].value != true", "Stratagus group tainting should remain based on SELECTABLEBYRECTANGLE.");
expectIncludes(groupsSource, "unit.GroupId |= (1 << num)", "Stratagus should continue marking unit group membership bits.");
expectIncludes(groupsSource, "SaveGroups", "Stratagus should continue saving control groups.");
expectIncludes(groupsSource, "ClearGroup", "Stratagus should continue clearing groups before SetGroup.");
expectIncludes(groupsSource, "MaxSelectable", "Stratagus group assignment should remain clamped by MaxSelectable.");
expectIncludes(readFileSync(`${stratagusRoot}/src/unit/unit_draw.cpp`, "utf8"), "Preference.ShowOrders && unit.Selected && unit.GroupId != 0", "Stratagus should continue drawing selected unit group numbers when ShowOrders is enabled.");
expectIncludes(readFileSync(`${stratagusRoot}/src/unit/unit_draw.cpp`, "utf8"), "for (groupId = 0; !(unit.GroupId & (1 << groupId)); ++groupId)", "Stratagus should continue displaying the lowest player control-group bit.");

const selectGroupSource = selectionSource.match(/int SelectGroup[\s\S]*?int AddGroupFromUnitToSelection/)?.[0] ?? "";
expectIncludes(selectGroupSource, "EGroupSelectionMode::SelectAll", "Stratagus SelectGroup should keep the explicit SelectAll mode.");
expectIncludes(selectGroupSource, "!IsGroupTainted(group_number)", "Stratagus SelectGroup should recall untainted groups directly.");
expectIncludes(selectGroupSource, "type->CanSelect(mode)", "Stratagus SelectGroup should filter tainted groups by selection mode.");
expectIncludes(selectGroupSource, "table.empty() == false", "Stratagus SelectGroup should leave selection unchanged when tainted recall has no selectable units.");
expectIncludes(selectGroupSource, "ChangeSelectedUnits", "Stratagus SelectGroup should replace selection on successful recall.");

const controlGroupSource = ordersSource.match(/export type ControlGroups[\s\S]*?export function sourceControlGroupForInput/)?.[0] ?? "";
expectIncludes(controlGroupSource, "export interface ControlGroupInput", "Browser control-group input should expose source-style modifier state.");
expectIncludes(controlGroupSource, "altKey?: boolean", "Browser control-group recall should expose an optional SelectAll modifier.");
expectIncludes(controlGroupSource, "controlGroups[group] = clampSelectionToSourceLimit(world, assignableIds)", "Browser group assignment should remain source-limit clamped.");
expectIncludes(controlGroupSource, "unit.player === world.visibilityPlayer", "Browser group assignment should remain limited to the local player.");
expectIncludes(controlGroupSource, "sourceControlGroupSelectionIds(world, liveIds, input.altKey)", "Browser recall should delegate to source-style control-group filtering.");
expectIncludes(controlGroupSource, "resolvedSelection.length === 0", "Browser tainted recall should leave selection unchanged when nothing can be selected.");

const helperSource = ordersSource.match(/export function isControlGroupTainted[\s\S]*?function resolveControlGroupUnits/)?.[0] ?? "";
expectIncludes(helperSource, "export function isControlGroupTainted", "Browser should model Stratagus tainted control groups.");
expectIncludes(helperSource, "unit.selectableByRectangle !== true", "Browser group tainting should be based on rectangle-selectability.");
expectIncludes(helperSource, "export function sourceControlGroupSelectionIds", "Browser should keep source-style control-group selection helper.");
expectIncludes(ordersSource, "export function sourceControlGroupNumberForUnit(unitId: string, controlGroups: ControlGroups): number | null", "Browser should resolve displayed source control-group numbers in simulation.");
expectIncludes(helperSource, "selectAll || !isControlGroupTainted(world, unitIds)", "Browser SelectAll recall should bypass tainted filtering.");
expectIncludes(helperSource, "unit.selectableByRectangle === true", "Browser tainted recall should filter to rectangle-selectable units.");
expectIncludes(helperSource, "clampSelectionToSourceLimit", "Browser control-group recall should stay clamped to the source selection limit.");
expectIncludes(ordersSource, ".sort((left, right) => left.group - right.group)", "Browser group badge should display the lowest source group bit for multi-group units.");

expectIncludes(controlGroupInputSource, "applyControlGroupInput", "View control-group handler should continue delegating to simulation orders.");
expectIncludes(controlGroupInputSource, "input.ctrlKey || input.metaKey || input.shiftKey", "Assignment/append modifiers should still clear double-tap recall state.");
expectIncludes(saveGameSource, "normalizeControlGroups", "Saved games should continue normalizing restored control groups.");
expectIncludes(renderWorldSource, "controlGroups?: Record<number, string[]>", "World renderer should accept control groups for source group-number badges.");
expectIncludes(renderWorldSource, "drawSourceControlGroupNumber(layer, world, unit, controlGroups, sourceSelectedOrdersVisible)", "Selected unit rendering should draw source control-group numbers.");
expectIncludes(renderWorldSource, "const sourceSelectedOrdersVisible = world.engineSettings.showOrdersDefault && sourceShowOrdersVisible", "Control-group number rendering should follow the source ShowOrders preference and timing.");
expectIncludes(renderWorldSource, "unit.player !== world.visibilityPlayer", "Control-group number rendering should be limited to local-player units.");
expect(
  /import\s+\{[^}]*\bsourceControlGroupNumberForUnit\b[^}]*\}\s+from\s+"..\/simulation\/orders"/.test(renderWorldSource),
  "World renderer should use simulation source control-group number resolution."
);
expect(!renderWorldSource.includes("function sourceControlGroupNumberForUnit"), "World renderer should not own displayed source control-group number resolution.");
expectIncludes(mainSource, "selectedUnitIds, controlGroups, sourceShowOrdersVisible, unitAtlases", "Main render path should pass live control groups and source ShowOrders timing into world rendering.");
expect(JSON.stringify(packageJson.scripts).includes("verify:source-control-groups"), "package.json verify scripts missing verify:source-control-groups.");

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source control-group verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source control groups verified (tainted recall, SelectAll recall, source limits, and save normalization).");
