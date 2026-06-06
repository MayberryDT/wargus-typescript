import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const humanButtons = readFileSync(path.join(manifest.dataRoot, "scripts/human/buttons.lua"), "utf8");
const orcButtons = readFileSync(path.join(manifest.dataRoot, "scripts/orc/buttons.lua"), "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const hudCommandKeySource = readFileSync("src/view/hudCommandKeys.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const hudCommandExecutionSource = readFileSync("src/view/hudCommandExecution.ts", "utf8");
const selectionHotkeySource = readFileSync("src/view/selectionHotkeys.ts", "utf8");
const minimapInputSource = readFileSync("src/view/minimapInput.ts", "utf8");
const worldPointerInputSource = readFileSync("src/view/worldPointerInput.ts", "utf8");
const commandKeySource = readFileSync("src/simulation/commandKeys.ts", "utf8");
const cursorSource = readFileSync("src/view/sourceCursor.ts", "utf8");
const overlaySource = readFileSync("src/view/renderOverlays.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const commandSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus/src/action/command.cpp", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const errors = [];
const runtimeCommandSource = `${mainSource}\n${commandKeySource}\n${hudCommandExecutionSource}\n${selectionHotkeySource}`;
const townUpgradeActionMatch = ordersSource.match(/const townUpgrade = \(\): string \| null => \{[\s\S]*?\n  \};/);
const townUpgradeActionSource = townUpgradeActionMatch?.[0] ?? "";

function expect(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

expect(/Action\s*=\s*"move"/.test(humanButtons), "Human source buttons are missing Action = \"move\".");
expect(/Action\s*=\s*"move"/.test(orcButtons), "Orc source buttons are missing Action = \"move\".");
expect(manifest.buttons.filter((button) => button.action === "move").length === 8, `Expected 8 indexed source move buttons, found ${manifest.buttons.filter((button) => button.action === "move").length}.`);
for (const fragment of [
  "void CommandStandGround(CUnit &unit, EFlushMode flush)",
  "order = GetNextOrder(unit, flush);",
  "*order = COrder::NewActionStandGround();"
]) {
  expect(commandSource.includes(fragment), `Stratagus stand-ground command source missing fragment: ${fragment}`);
}

for (const fragment of [
  '| "move"',
  'commands.push({ id: "move", key: "M", label: "Move" })',
  'case "move":\n      return raceIcon("icon-move-peasant", "icon-move-peon");',
  "sourceActionButtonsForHud,",
  "sourceActionButtonsForHud(world, readyUnits, playerId)",
  "canEnterPendingWorldCommand,",
  "canIssueHoldPosition,",
  "canReceiveMoveOrders,",
  '!sourceActionCommands.has("attack-ground") && readyUnits.some(canAttackGround)',
  "readyUnits.some(canIssueHoldPosition)",
  "sourceButtonLabel(button) ?? sourceHudActionLabel(commandId)"
]) {
  expect(hudSource.includes(fragment), `HUD source move action wiring missing fragment: ${fragment}`);
}

expect(ordersSource.includes('case "move":\n      return { action: "move" };'), "Simulation source HUD command action/value mapping should include move.");
expect(ordersSource.includes('if (action === "move") return "move";'), "Simulation source action to HUD command mapping should include move.");
expect(!ordersSource.includes('case "follow":\n      return { action: "move" };'), "Follow is a browser follow command and must not masquerade as the source move button.");
expect(!ordersSource.includes('case "detonate":\n      return { action: "explode" };'), "Detonate should be exposed through source spell buttons instead of a nonexistent explode action.");
expect(!ordersSource.includes('case "load-transport":\n      return { action: "board" };'), "Load transport is a targeted browser command and must not masquerade as a nonexistent board button.");
expect(!manifest.buttons.some((button) => button.action === "explode" || button.action === "board"), "Indexed source button actions should not include browser-only explode/board aliases.");

for (const fragment of [
  'command === "move"',
  "canReceiveMoveOrders,",
  "issueBroadcastCommandByKey(loadedWorld, code, unitIds, loadedWorld.visibilityPlayer, queue)",
  '&& canReceiveMoveOrders(unit)) {'
]) {
  expect(runtimeCommandSource.includes(fragment), `Browser source move action dispatch missing fragment: ${fragment}`);
}

expect(!overlaySource.includes("canUseSourceBuildCommands,"), "Pending build placement preview should not duplicate source-builder selection in the view layer.");
expect(overlaySource.includes("canSelectedPlaceBuildingAtPoint,"), "Pending build placement preview should import the simulation selected placement helper.");

for (const fragment of [
  'export function hudCommandCode(command: HudCommandId, race: "human" | "orc"): string',
  '"move": "KeyM"',
  '"attack-move": "KeyA"',
  '"train-ranged-veteran": human ? "KeyR" : "KeyB"'
]) {
  expect(hudCommandKeySource.includes(fragment), `HUD command key helper missing fragment: ${fragment}`);
}

for (const fragment of [
  'const SOURCE_PENDING_ACTIONS = new Set(["move", "attack", "attack-ground", "patrol", "repair", "harvest", "unload"])',
  'if (action === "move") {\n    return "move";\n  }',
  'if (command === "attack-ground") {\n      return canAttackGround(unit);\n    }',
  ".filter((button) => canIssueSourceActionButton(world, button, unit))",
  "&& canIssueSourceActionButton(world, button, unit)",
  "&& canReceiveMoveOrders(unit)",
  "export function issueBroadcastCommandByKey(world: WorldState, code: string, unitIds: string[], playerId = world.visibilityPlayer, queue = false): boolean | null",
  "canIssueHoldPosition(unit) && (queue ? issueQueueStandGroundOrder(world, unit.id) : issueHoldPositionOrder(world, unit.id))",
  "canIssueStop(unit) && issueStopOrder"
]) {
  expect(ordersSource.includes(fragment), `Simulation source move action dispatch missing fragment: ${fragment}`);
}

expect(ordersSource.includes("export function canAttackGround(unit: WorldUnit): boolean"), "Simulation attack-ground capability helper must be exported.");
expect(ordersSource.includes("export function canIssueStop(unit: WorldUnit): boolean"), "Simulation stop capability helper must be exported.");
expect(ordersSource.includes("!unit || !canIssueStop(unit)"), "Stop issuing must use the simulation stop capability helper.");
expect(ordersSource.includes("export function canIssueHoldPosition(unit: WorldUnit): boolean"), "Simulation hold-position capability helper must be exported.");
expect(ordersSource.includes("!unit || !canIssueHoldPosition(unit)"), "Hold-position issuing must use the simulation hold-position capability helper.");
expect(ordersSource.includes("export function issueQueueStandGroundOrder(world: WorldState, unitId: string): boolean"), "Simulation queued stand-ground issuing helper must be exported.");
expect(ordersSource.includes('unit.moveQueue.push({ kind: "stand-ground"'), "Queued stand-ground issuing should append a move-queue order.");
expect(ordersSource.includes('if (target.kind === "stand-ground")'), "Queued stand-ground should execute from the movement queue.");
expect(ordersSource.includes("issueHoldPositionOrder(world, unit.id, { clearQueue: false })"), "Queued stand-ground execution should preserve following queued orders.");
expect(ordersSource.includes("queue ? issueQueueStandGroundOrder(world, unit.id) : issueHoldPositionOrder(world, unit.id)"), "Direct hold-position command should route Shift through queued stand-ground.");
expect(ordersSource.includes("canIssueHoldPosition(unit) && (queue ? issueQueueStandGroundOrder(world, unit.id) : issueHoldPositionOrder(world, unit.id))"), "Broadcast hold-position hotkey should route Shift through queued stand-ground.");
expect(hudCommandExecutionSource.includes("executeDirectHudCommand(world, selectedUnitIds, command, world.visibilityPlayer, input.shiftKey === true)"), "HUD direct commands should forward Shift as source queue mode.");
expect(hudSource.includes("shiftKey: nativeEvent instanceof PointerEvent && nativeEvent.shiftKey"), "HUD command button clicks should pass Shift state to command execution.");
expect(ordersSource.includes("export function canIssueAttackTarget(world: WorldState, unit: WorldUnit, target: WorldUnit): boolean"), "Simulation attack-target capability helper must be exported.");
expect(ordersSource.includes("export function canIssueAttackTargetWithPath(world: WorldState, unit: WorldUnit, target: WorldUnit): boolean"), "Simulation attack-target path capability helper must be exported.");
expect(ordersSource.includes("!unit || !target || !canIssueAttackTargetWithPath(world, unit, target)"), "Attack target issuing must use the simulation attack-target path capability helper.");
expect(ordersSource.includes("export function canIssueAttackTargetAt(world: WorldState, unit: WorldUnit, x: number, y: number): boolean"), "Simulation attack-target-at capability helper must be exported.");
expect(ordersSource.includes("export function issueAttackTargetAtOrder(world: WorldState, unitId: string, x: number, y: number): boolean"), "Simulation attack-target-at issuing helper must be exported.");
expect(ordersSource.includes("export function canSelectedIssueAttackGroundAt(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean"), "Simulation selected attack-ground capability helper must be exported.");
expect(overlaySource.includes("canSelectedIssuePendingWorldCommandAt(world, selectedUnitIds, command, pointerWorldPosition.x, pointerWorldPosition.y, world.visibilityPlayer)"), "Pending command cursor/preview validity should delegate to the simulation selected pending-command helper.");
expect(!mainSource.includes("function canSelectedUnitAttackGroundAt"), "Main should use the simulation selected attack-ground helper instead of a local preview helper.");
expect(ordersSource.includes("export function canIssueCombatMoveAt(world: WorldState, unit: WorldUnit, x: number, y: number): boolean"), "Simulation combat-move capability helper must be exported.");
expect(ordersSource.includes("!unit || !canIssueCombatMoveAt(world, unit, x, y)"), "Attack-move issuing must use the simulation combat-move capability helper.");
expect(ordersSource.includes("export function canIssueQueueCombatMoveAt(world: WorldState, unit: WorldUnit, x: number, y: number): boolean"), "Simulation queued combat-move capability helper must be exported.");
expect(ordersSource.includes("!unit || !canIssueQueueCombatMoveAt(world, unit, x, y)"), "Queued attack-move issuing must use the simulation queued combat-move capability helper.");
expect(ordersSource.includes("export function canIssueMoveAt(world: WorldState, unit: WorldUnit, x: number, y: number): boolean"), "Simulation move capability helper must be exported.");
expect(ordersSource.includes("!unit || !canIssueMoveAt(world, unit, x, y)"), "Move issuing must use the simulation move capability helper.");
expect(ordersSource.includes("export function canIssueQueueMoveAt(world: WorldState, unit: WorldUnit, x: number, y: number): boolean"), "Simulation queued move capability helper must be exported.");
expect(ordersSource.includes("!unit || !canIssueQueueMoveAt(world, unit, x, y)"), "Queued move issuing must use the simulation queued move capability helper.");
expect(saveSource.includes("canIssueQueueMoveAt,"), "Save restore should import the simulation queued move capability helper.");
expect(saveSource.includes("if (kind === \"move\" && !canIssueQueueMoveAt(world, unit, x, y))"), "Save restore should validate queued move entries with source queue pathability.");
expect(ordersSource.includes("export function canSetRallyPoint(world: WorldState, unit: WorldUnit): boolean"), "Simulation rally-point capability helper must be exported.");
expect(ordersSource.includes("if (unit.hitPoints <= 0 || unit.construction)"), "Simulation rally-point capability helper must reject unavailable producers.");
expect(ordersSource.includes("!producer || !canSetRallyPoint(world, producer)"), "Rally-point issuing must use the simulation rally-point capability helper.");
expect(saveSource.includes("canSetRallyPoint,"), "Save restore should import the simulation rally-point capability helper.");
expect(saveSource.includes("function normalizeLoadedRallyPoint(world: WorldState, unit: WorldState[\"units\"][number]): { x: number; y: number } | null"), "Save restore should normalize rally points through a source-shaped helper.");
expect(saveSource.includes("return canSetRallyPoint(world, unit) ? normalizeMapPoint(world, unit.rallyPoint) : null;"), "Loaded rally points should only survive on units that can set source rally points.");
expect((saveSource.match(/unit\.rallyPoint = normalizeLoadedRallyPoint\(world, unit\);/g) ?? []).length >= 2, "Loaded rally points should be normalized during unit load and reference cleanup.");
expect(ordersSource.includes("function issueSourceRallyResourceOrder"), "Produced units should consume source-style resource rally orders before generic rally movement.");
expect(ordersSource.includes("issueSourceRallyResourceOrder(world, trainedUnit, producer.rallyPoint.x, producer.rallyPoint.y)"), "Production rally handling should route trained units through source resource rally logic.");
expect(ordersSource.includes("const resource = findResourceAt(world, x, y, trainedUnit.player)"), "Rally resource handling should reuse source smart resource lookup.");
expect(ordersSource.includes("&& issueHarvestWoodOrder(world, trainedUnit.id, tile.x, tile.y);"), "Rally resource handling should support source wood terrain harvesting.");
expect(ordersSource.includes("export function canStartBuildingPlacementByType(world: WorldState, builder: WorldUnit, buildingTypeId: string, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean"), "Simulation building-placement type-id capability helper must be exported.");
expect(!mainSource.includes("function canStartBuildingPlacementByType"), "Main should use the simulation building-placement type-id helper instead of a local definition lookup wrapper.");
expect(ordersSource.includes("export function canPlaceBuildingAtPoint(world: WorldState, builder: WorldUnit, buildingTypeId: string, x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean"), "Simulation point-based building placement helper must be exported.");
expect(overlaySource.includes("canSelectedPlaceBuildingAtPoint(world, selectedUnitIds, command.buildingTypeId, pointerWorldPosition.x, pointerWorldPosition.y, world.unitDefinitions, world.visibilityPlayer)"), "Pending build cursor/preview validity should use the simulation selected-unit placement helper.");
expect(!overlaySource.includes("canPlaceBuildingAtPoint(world, builder, command.buildingTypeId"), "Pending build cursor/preview validity should not duplicate single-builder placement selection in the view layer.");
expect(!mainSource.includes("canPlaceReachableBuilding(world, builder, building"), "Main pending build validity should not duplicate reachable building placement checks from simulation.");
expect(ordersSource.includes("export function canSelectedPlaceBuildingAtPoint(world: WorldState, unitIds: string[], buildingTypeId: string, x: number, y: number"), "Simulation selected-unit building placement helper must be exported.");
expect(ordersSource.includes("export function issueSelectedBuildAtOrder(world: WorldState, unitIds: string[], buildingTypeId: string, x: number, y: number"), "Simulation selected-unit build issuing helper must be exported.");
expect(ordersSource.includes("export function canSelectedIssuePendingWorldCommandAt"), "Simulation selected pending-command validity helper must be exported.");
expect(ordersSource.includes("canSelectedPlaceBuildingAtPoint(world, unitIds, command.buildingTypeId"), "Pending build validity should use the simulation selected-unit placement helper.");
expect(cursorSource.includes("canSelectedIssuePendingWorldCommandAt(world, selectedUnitIds, command"), "Cursor pending-command validity should delegate to the simulation selected pending-command helper.");
expect(!overlaySource.includes("canSelectedIssueAttackGroundAt(world, selectedUnitIds, pointerWorldPosition.x, pointerWorldPosition.y, world.visibilityPlayer)"), "Pending command overlay should not duplicate attack-ground validity outside the simulation pending-command helper.");
expect(ordersSource.includes("export function issueGroupBuildAtOrder(world: WorldState, unitIds: string[], buildingTypeId: string, x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions, playerId = world.visibilityPlayer): boolean"), "Simulation should expose group build issuing.");
expect(ordersSource.includes("return issueSelectedBuildAtOrder(world, unitIds, buildingTypeId, x, y, unitDefinitions, playerId);"), "Group build issuing should use the simulation selected-unit build helper.");
expect(!mainSource.includes("function issueGroupBuildAtOrder"), "Main should use the simulation group build issuing helper instead of a local copy.");
expect(ordersSource.includes("export function buildingTypeForSourceBuildCommand(world: WorldState, buildingTypeId: string, unitIds: string[], playerId = world.visibilityPlayer): string | null"), "Simulation should expose source-build command building type resolution.");
expect(ordersSource.includes("canStartSourceBuildPlacementByType(world, builder, buildingTypeId) ? buildingTypeId : null"), "Source-build command building type resolution should use simulation source-build placement capability.");
expect(hudCommandExecutionSource.includes("pendingBuildCommandForSourceBuildType(world, buildingTypeId, selectedUnitIds)"), "HUD command execution should call simulation source-build pending command resolution.");
expect(!mainSource.includes("function buildingTypeForSourceBuildCommand"), "Main should use the simulation source-build command resolver instead of a local copy.");
expect(ordersSource.includes("export function buildingTypeForWorkerHotkey(world: WorldState, code: string, unitIds: string[], page: number, playerId = world.visibilityPlayer): string | null"), "Simulation should expose worker build hotkey building type resolution.");
expect(ordersSource.includes("sourceBuildTypeForKey(world, worker, code, page)"), "Worker build hotkey resolution should use source build key lookup in simulation.");
expect(ordersSource.includes("sourceBuildTypeForPageKeyRole(world, worker, code, page)"), "Worker build hotkey resolution should use source page/key role fallback in simulation.");
expect(ordersSource.includes('KeyH: human ? "unit-town-hall" : "unit-great-hall"'), "Worker build hotkey fallback should keep race-specific town center mapping in simulation.");
expect(ordersSource.includes("export function sourceBuildTypeForKey(world: WorldState, unit: WorldUnit, code: string, page?: number): string | null"), "Simulation should expose source build key lookup for single-unit command paths.");
expect(ordersSource.includes("export function issueBuildOrderBySourceRole(world: WorldState, unit: WorldUnit, matchesBuilding: (definition: WargusUnit) => boolean, fallbackBuildingTypeId: string, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean"), "Simulation should expose source role-based fallback build issuing.");
expect(ordersSource.includes("function compareSourceBuildCandidates(left: { button: WargusButton; definition: WargusUnit }, right: { button: WargusButton; definition: WargusUnit }): number"), "Simulation should share source build candidate ordering across direct hotkeys and AI build issuing.");
expect(ordersSource.includes(".sort(compareSourceBuildCandidates)[0]?.definition.id ?? null"), "Direct source-role build lookup should use shared source build candidate ordering.");
expect(ordersSource.includes(".sort(compareSourceBuildCandidates)[0];"), "AI source-role build issuing should use shared source build candidate ordering.");
expect(ordersSource.includes("function hasSourceBuildButtonsForUnit(world: WorldState, unit: WorldUnit): boolean"), "Simulation should detect unit-level source build buttons before direct stock build hotkey fallbacks.");
expect(ordersSource.includes("return hasSourceBuildButtonsForUnit(world, unit) ? false : issueBuildOrder(world, unit.id, fallbackBuildingTypeId, unitDefinitions);"), "Source role-based build hotkeys should not fall through to stock building ids when source build buttons exist.");
expect(ordersSource.includes("if (hasSourceBuildButtonsForUnit(world, builder)) {\n    return false;\n  }\n  return issueBuildOrder(world, builder.id, fallbackBuildingTypeId, world.unitDefinitions);"), "AI role-based build issuing should not fall through to stock building ids when source build buttons exist.");
expect(ordersSource.includes("export function sourceBuildingProducesMatching(world: WorldState, buildingTypeId: string, matchesUnit: (definition: WargusUnit) => boolean, playerId = world.visibilityPlayer): boolean"), "Simulation should expose source producer role matching.");
expect(ordersSource.includes("export function sourceBuildingResearchesMatching(world: WorldState, buildingTypeId: string, matchesUpgrade: (upgradeId: string) => boolean, playerId = world.visibilityPlayer): boolean"), "Simulation should expose source research role matching.");
expect(ordersSource.includes("export function sourceBuildingUpgradesToMatching(world: WorldState, buildingTypeId: string, matchesDefinition: (definition: WargusUnit) => boolean, playerId = world.visibilityPlayer): boolean"), "Simulation should expose source upgrade-to role matching.");
expect(ordersSource.includes("export function sourceBuildValuesProduceMatching(world: WorldState, sourceBuildValues: Iterable<string>, matchesUnit: (definition: WargusUnit) => boolean, playerId = world.visibilityPlayer): boolean"), "Simulation should expose source build-value producer role matching.");
expect(ordersSource.includes("export function sourceBuildValuesResearchMatching(world: WorldState, sourceBuildValues: Iterable<string>, matchesUpgrade: (upgradeId: string) => boolean, playerId = world.visibilityPlayer): boolean"), "Simulation should expose source build-value research role matching.");
expect(ordersSource.includes("export function sourceBuildValuesDefinitionMatching(world: WorldState, sourceBuildValues: Iterable<string>, matchesDefinition: (definition: WargusUnit) => boolean): boolean"), "Simulation should expose source build-value definition role matching.");
expect(ordersSource.includes("export function sourceBuildValuesUpgradeToMatching(world: WorldState, sourceBuildValues: Iterable<string>, matchesDefinition: (definition: WargusUnit) => boolean, playerId = world.visibilityPlayer): boolean"), "Simulation should expose source build-value upgrade-to role matching.");
expect(ordersSource.includes("export function selectedCanResearchMatchingSource(world: WorldState, selectedUnits: WorldUnit[], matchesUpgrade: (upgradeId: string) => boolean): boolean"), "Simulation should expose selected-unit source research capability matching.");
expect(ordersSource.includes("export function selectedCanResearchSpellSource(world: WorldState, selectedUnits: WorldUnit[], spellId: string, fallbackUpgradeId: string): boolean"), "Simulation should expose selected-unit source spell research capability matching.");
expect(ordersSource.includes("export function selectedCanResearchAny(world: WorldState, selectedUnits: WorldUnit[], upgradeIds: Iterable<string>): boolean"), "Simulation should expose selected-unit fallback research capability matching.");
expect(ordersSource.includes("export function selectedCanTrainAny(world: WorldState, selectedUnits: WorldUnit[], unitTypeIds: Iterable<string>): boolean"), "Simulation should expose selected-unit fallback train capability matching.");
expect(ordersSource.includes("export function selectedCanTrainMatching(world: WorldState, selectedUnits: WorldUnit[], matchesUnit: (definition: WargusUnit) => boolean): boolean"), "Simulation should expose selected-unit role train capability matching.");
expect(ordersSource.includes("export function selectedCanBuildAny(world: WorldState, selectedUnits: WorldUnit[], buildingTypeIds: Iterable<string>): boolean"), "Simulation should expose selected-unit fallback build capability matching.");
expect(ordersSource.includes("export function canUseHudBuilderCommands(unit: WorldUnit): boolean"), "Simulation should expose HUD builder command capability.");
expect(ordersSource.includes("export function hasAnySourceResearchValue(values: Iterable<string>, upgradeIds: Iterable<string>): boolean"), "Simulation should expose source research/upgrade value lookup.");
expect(ordersSource.includes("export function hasSourceResearchValueMatching(world: WorldState, values: Iterable<string>, matchesUpgrade: (world: WorldState, upgradeId: string) => boolean): boolean"), "Simulation should expose source research-value role matching.");
expect(ordersSource.includes("export function hasSourceTrainValueMatching(world: WorldState, values: Iterable<string>, matchesUnit: (definition: WargusUnit) => boolean): boolean"), "Simulation should expose source train-value role matching.");
expect(ordersSource.includes("export function hasSourceSpellResearchValue(world: WorldState, values: Iterable<string>, spellId: string, fallbackUpgradeId: string): boolean"), "Simulation should expose source spell research-value matching.");
expect(ordersSource.includes("export function isBlacksmithResearchUpgrade(world: WorldState, upgradeId: string): boolean"), "Simulation should expose source blacksmith research classification.");
expect(ordersSource.includes("export function isNavalResearchUpgrade(world: WorldState, upgradeId: string): boolean;"), "Simulation should expose source-aware naval research classification.");
expect(ordersSource.includes("export function compareSourceButtons(a: WargusButton, b: WargusButton): number"), "Simulation should expose source button ordering.");
expect(ordersSource.includes("export function issueFallbackBuildCommandByKey(world: WorldState, unit: WorldUnit, code: string, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean | null"), "Simulation should expose fallback build hotkey issuing.");
for (const [helper, mapping] of [
  ['function isSourceAdvancedMeleeBuildHotkey(race: "human" | "orc", code: string): boolean', 'return (race === "human" && code === "KeyA") || (race === "orc" && code === "KeyO");'],
  ['function isSourceCasterBuildHotkey(race: "human" | "orc", code: string): boolean', 'return (race === "human" && code === "KeyM") || (race === "orc" && code === "KeyT");'],
  ['function isSourceHolyBuildHotkey(race: "human" | "orc", code: string): boolean', 'return (race === "human" && code === "KeyC") || (race === "orc" && code === "KeyL");'],
  ['function isSourceAirBuildHotkey(race: "human" | "orc", code: string): boolean', 'return (race === "human" && code === "KeyG") || (race === "orc" && code === "KeyD");']
]) {
  expect(ordersSource.includes(helper) && ordersSource.includes(mapping), `Direct advanced build fallback should use source race/key mapping: ${helper}`);
}
expect(ordersSource.includes('function isSourceDemolitionLabBuildHotkey(race: "human" | "orc", code: string): boolean'), "Direct build hotkey fallback should use source demolition-lab race/key mapping.");
expect(ordersSource.includes('return (race === "human" && code === "KeyI") || (race === "orc" && code === "KeyA");'), "Direct demolition-lab build fallback should use Wargus I/A keys instead of a stale browser key.");
for (const fragment of [
  'if (code === "KeyV") {\n    const advancedBuildingId = unitRace === "human" ? "unit-stables" : "unit-ogre-mound";',
  'if (code === "KeyA") {\n    const casterBuildingId = unitRace === "human" ? "unit-mage-tower" : "unit-temple-of-the-damned";',
  'if (code === "KeyI") {\n    const airBuildingId = unitRace === "human" ? "unit-gryphon-aviary" : "unit-dragon-roost";'
]) {
  expect(!ordersSource.includes(fragment), `Direct advanced build fallback should not use stale browser key branch: ${fragment}`);
}
expect(!ordersSource.includes('if (code === "KeyE") {\n    const labId = unitRace === "human" ? "unit-inventor" : "unit-alchemist";'), "Direct demolition-lab build fallback should not use KeyE for source Inventor/Alchemist construction.");
expect(ordersSource.includes("export function isSupplyProviderDefinition(definition: WargusUnit): boolean"), "Simulation should expose source supply-provider build predicate.");
expect(ordersSource.includes("export function isBaseTownCenterDefinition(world: WorldState, definition: WargusUnit, playerId = world.visibilityPlayer): boolean"), "Simulation should expose source base town-center build predicate.");
expect(ordersSource.includes("export function isOilRefineryDefinition(definition: WargusUnit): boolean"), "Simulation should expose source oil-refinery build predicate.");
expect(ordersSource.includes("export function isWallDefinition(definition: WargusUnit): boolean"), "Simulation should expose source wall build predicate.");
expect(ordersSource.includes("export function isDefensiveBuildingDefinition(definition: WargusUnit): boolean"), "Simulation should expose source defensive-building build predicate.");
expect(!ordersSource.includes("function isStockKeepTierTechBuildingForPlayer"), "Simulation keep-tier tech fallback should not keep a broad stock building helper.");
expect(ordersSource.includes("function isStockAdvancedMeleeTechBuildingForPlayer(world: WorldState, playerId: number, buildingTypeId: string): boolean"), "Simulation keep-tier tech fallback should only retain an owner-race-aware advanced-melee source-gap helper.");
expect(ordersSource.includes("function sourceBuildDefinitionHasTrainButtonMatching(world: WorldState, buildingTypeId: string, matchesUnit: (definition: WargusUnit) => boolean, playerId = world.visibilityPlayer): boolean"), "Simulation tech-tier classification should inspect source train buttons with player-specific source allow rules.");
expect(ordersSource.includes("function sourceBuildDefinitionHasResearchButtonMatching(world: WorldState, buildingTypeId: string, matchesUpgrade: (upgradeId: string) => boolean, playerId = world.visibilityPlayer): boolean"), "Simulation tech-tier classification should inspect source research buttons with player-specific source allow rules.");
expect(ordersSource.includes("sourceButtonAllowedForSimulation(world, button, playerId)\n    && Boolean(world.unitDefinitions.find((definition) => definition.id === button.value && matchesUnit(definition)))"), "Source train-button tech classification should honor source allow rules before matching train targets.");
expect(ordersSource.includes("sourceButtonAllowedForSimulation(world, button, playerId)\n    && matchesUpgrade(button.value)"), "Source research-button tech classification should honor source allow rules before matching research targets.");
expect(!ordersSource.includes("function isStockCastleTierTechBuildingForPlayer"), "Simulation castle-tier tech gate should not require stock air/lab building id fallbacks.");
expect(!ordersSource.includes('|| ["unit-stables", "unit-ogre-mound", "unit-mage-tower", "unit-temple-of-the-damned", "unit-church", "unit-altar-of-storms"].includes(buildingTypeId)'), "Keep-tier tech gate should not use a mixed-race stock building id list.");
expect(!ordersSource.includes('"unit-mage-tower", "unit-church"') && !ordersSource.includes('"unit-temple-of-the-damned", "unit-altar-of-storms"'), "Keep-tier tech fallback should not include source-covered caster or holy producer ids.");
expect(ordersSource.includes('return buildingTypeId === (race === "human" ? "unit-stables" : "unit-ogre-mound");'), "Keep-tier stock fallback should only cover stables/ogre mound source gaps.");
expect(!ordersSource.includes('|| ["unit-gryphon-aviary", "unit-dragon-roost", "unit-inventor", "unit-alchemist"].includes(buildingTypeId)'), "Castle-tier tech gate should not use a mixed-race stock building id list.");
expect(ordersSource.includes("return sourceBuildDefinitionHasTrainButtonMatching(world, buildingTypeId, isAirCombatDefinition, playerId)\n    || sourceBuildDefinitionHasTrainButtonMatching(world, buildingTypeId, isDemolitionLabDefinition, playerId);"), "Simulation castle-tier tech gate should be source train-role driven with player-specific source allow rules.");
expect(ordersSource.includes("export function isGoldOrWoodWorkerDefinition(definition: WargusUnit): boolean"), "Simulation should expose source gold/wood worker role predicate.");
expect(ordersSource.includes("export function isOrdinaryBarracksCombatDefinition(definition: WargusUnit): boolean"), "Simulation should expose source ordinary barracks combat role predicate.");
expect(ordersSource.includes("export function isMeleeLandCombatDefinition(definition: WargusUnit): boolean"), "Simulation should expose source melee land combat role predicate.");
expect(ordersSource.includes("export function isRangedLandCombatDefinition(definition: WargusUnit): boolean"), "Simulation should expose source ranged land combat role predicate.");
expect(ordersSource.includes("export function isAdvancedMeleeCombatDefinition(definition: WargusUnit): boolean"), "Simulation should expose source advanced melee combat role predicate.");
expect(ordersSource.includes("export function isCasterDefinition(definition: WargusUnit): boolean"), "Simulation should expose source caster role predicate.");
expect(ordersSource.includes("export function isAirCombatDefinition(definition: WargusUnit): boolean"), "Simulation should expose source air combat role predicate.");
expect(ordersSource.includes("export function isDemolitionLabDefinition(definition: WargusUnit): boolean"), "Simulation should expose source demolition-lab role predicate.");
expect(ordersSource.includes("export function isDemolitionUnitDefinition(definition: WargusUnit): boolean"), "Simulation should expose source demolition unit role predicate.");
expect(ordersSource.includes("(definition.clicksToExplode ?? 0) > 0"), "Source demolition unit role predicate should preserve browser click-to-explode metadata.");
expect(ordersSource.includes('(definition.canCastSpells ?? []).includes("spell-suicide-bomber")'), "Source demolition unit role predicate should preserve source suicide-bomber spell metadata.");
expect(!ordersSource.includes("function isDemolitionUnitName"), "Source demolition unit role predicate should not scan id/name/image/icon text.");
expect(!ordersSource.includes("/demol|sap|explod|bomb/"), "Source demolition unit role predicate should use indexed source traits instead of demolition name fragments.");
expect(ordersSource.includes("export function isSiegeDefinition(definition: WargusUnit): boolean"), "Simulation should expose source siege role predicate.");
expect(ordersSource.includes("export function isScoutAirDefinition(definition: WargusUnit): boolean"), "Simulation should expose source scout-air role predicate.");
expect(ordersSource.includes("export function isNavalCombatOrUtilityDefinition(definition: WargusUnit): boolean"), "Simulation should expose source naval combat/utility role predicate.");
expect(ordersSource.includes("export function isNavalRoleDefinition(definition: WargusUnit, role: \"tanker\" | \"destroyer\" | \"warship\" | \"transport\" | \"submarine\"): boolean"), "Simulation should expose source naval role predicate.");
expect(ordersSource.includes("export function isAdvancedMeleeCasterDefinition(definition: WargusUnit): boolean"), "Simulation should expose source advanced melee caster role predicate.");
expect(ordersSource.includes("export function townCenterTierForPlayer(world: WorldState, playerId: number): number"), "Simulation should expose source town-center tier lookup for players.");
expect(ordersSource.includes("export function townCenterTier(world: WorldState, typeId: string, playerId = world.visibilityPlayer): number"), "Simulation should expose source town-center tier lookup for unit types.");
expect(ordersSource.includes("export function sourceTownCenterTier(world: WorldState, typeId: string, seen: Set<string>, playerId = world.visibilityPlayer): number"), "Simulation should expose source town-center upgrade-chain tier lookup.");
expect(ordersSource.includes("export function sourceUpgradeButtonMatchesRole(world: WorldState, button: WargusButton, role: \"guard\" | \"cannon\"): boolean"), "Simulation should expose source tower upgrade role matching.");
expect(ordersSource.includes("export function isCannonTowerUpgradeDefinition(definition: WargusUnit): boolean"), "Simulation should expose source cannon tower upgrade classification.");
expect(ordersSource.includes("definition.canTargetAir !== true"), "Cannon tower classification should use source combat target traits instead of missile id text.");
expect(ordersSource.includes("(definition.minAttackRange ?? 0) > 0"), "Cannon tower classification should preserve the source minimum-range trait.");
expect(!ordersSource.includes('definition.missile?.toLowerCase().includes("cannon")'), "Cannon tower classification should not infer role from missile id text.");
expect(ordersSource.includes("const cannonTarget = isCannonTowerUpgradeDefinition(target);"), "Tower upgrade button role matching should classify the source upgrade target definition.");
expect(ordersSource.includes("return isCannonTowerUpgradeDefinition(definition) ? \"cannon\" : \"guard\";"), "Tower role lookup should classify source upgrade target definitions instead of source button text.");
expect(!ordersSource.includes("function sourceTowerRoleText"), "Tower role matching should not parse source button value/hint/icon text.");
expect(!ordersSource.includes('text.includes("guard")') && !ordersSource.includes('text.includes("cannon")'), "Tower role matching should not scan source button text for guard/cannon labels.");
expect(!ordersSource.includes("function isWatchTowerUnit"), "Simulation should use the shared source-aware watch-tower predicate instead of a duplicate keyboard-only copy.");
expect(ordersSource.includes("const sourceUpgradeButtons = sourceUpgradeButtonsForBuilding(world, unit);"), "Watch-tower classification should inspect source upgrade-to buttons first.");
expect(!ordersSource.includes("if (sourceUpgradeButtons.length > 0)"), "Watch-tower classification should not fall back after inspecting source upgrade-to buttons.");
expect(!ordersSource.includes('return unit.typeId === "unit-human-watch-tower"\n    || unit.typeId === "unit-orc-watch-tower";'), "Simulation watch-tower classification should require source upgrade-to buttons instead of exact stock watch-tower ids.");
expect(!ordersSource.includes("function isTowerUpgradeFor("), "Simulation tower upgrade eligibility should not use hardcoded stock tower upgrade mappings.");
expect(!ordersSource.includes("function towerUpgradeTypeId("), "Simulation tower upgrade issuing should resolve source upgrade-to targets instead of stock race defaults.");
expect(ordersSource.includes("handled || isWatchTower(world, unit)"), "Direct tower hotkeys should use the shared source-aware watch-tower predicate.");
expect(ordersSource.includes("if (!sourceUpgradeTypeId || !canSourceUpgradeToType(world, building, sourceUpgradeTypeId))"), "Direct tower upgrades should require a source upgrade-to target.");
expect(ordersSource.includes("export function sourceButtonAppliesToAnyType(button: WargusButton, typeIds: Iterable<string>): boolean"), "Simulation should expose source button type-set matching.");
expect(ordersSource.includes("export function sourceTowerUpgradeTargetForTypes(world: WorldState, typeIds: Iterable<string>, playerId: number, role: \"guard\" | \"cannon\"): string | null"), "Simulation should expose source tower upgrade target resolution.");
expect(!ordersSource.includes('sourceTowerUpgradeTargetForTypes(world, typeIdSet, playerId, "guard") ?? raceValue("unit-human-guard-tower", "unit-orc-guard-tower")'), "HUD tower upgrade action metadata should not fall back to hardcoded guard-tower ids.");
expect(!ordersSource.includes('sourceTowerUpgradeTargetForTypes(world, typeIdSet, playerId, "cannon") ?? raceValue("unit-human-cannon-tower", "unit-orc-cannon-tower")'), "HUD tower upgrade action metadata should not fall back to hardcoded cannon-tower ids.");
expect(ordersSource.includes('return towerUpgradeTarget ? { action: "upgrade-to", value: towerUpgradeTarget } : null;'), "HUD tower upgrade action metadata should require a source tower upgrade target.");
expect(ordersSource.includes("export function sourceTownUpgradeTargetForTypes(world: WorldState, typeIds: Iterable<string>, playerId: number): string | null"), "Simulation should expose source town-center upgrade target resolution.");
expect(ordersSource.includes("export function hasSourceUpgradeButtonsForTypes(world: WorldState, typeIds: Iterable<string>, playerId: number): boolean"), "Simulation should expose selected-type source upgrade-button detection.");
expect(ordersSource.includes("function hasSourceUpgradeButtonsForBuilding(world: WorldState, building: WorldUnit): boolean"), "Simulation should detect source upgrade-to availability before stock town-center upgrade fallbacks.");
expect(ordersSource.includes("sourceUpgradeTargetForBuilding(world, building) ?? (hasSourceUpgradeButtonsForBuilding(world, building) ? null : nextTownCenterTypeId(building.typeId))"), "Direct town-center upgrade issuing should only use stock hall chains when no source upgrade-to buttons exist.");
expect(ordersSource.includes("sourceUpgradeTargetForBuilding(world, hall) ?? (hasSourceUpgradeButtonsForBuilding(world, hall) ? null : nextTownCenterTypeId(hall.typeId))"), "AI town-center upgrades should only use stock hall chains when no source upgrade-to buttons exist.");
expect(ordersSource.includes("function isTownCenterUpgradeFor(world: WorldState, unit: WorldUnit, upgradeTypeId: string): boolean"), "Production transform fallback should receive world context for source upgrade-to detection.");
expect(ordersSource.includes("return !hasSourceUpgradeButtonsForBuilding(world, unit) && nextTownCenterTypeId(unit.typeId) === upgradeTypeId;"), "Town-center transform fallback should be disabled when source upgrade-to buttons exist.");
expect(townUpgradeActionSource.includes("sourceTownUpgradeTargetForTypes(world, typeIdSet, playerId)"), "HUD town-center upgrade action metadata should resolve a source upgrade target first.");
expect(townUpgradeActionSource.includes("if (hasSourceUpgradeButtonsForTypes(world, typeIdSet, playerId)) return null;"), "HUD town-center upgrade action metadata should not invent stock upgrade targets when source upgrade buttons exist.");
expect(townUpgradeActionSource.includes("townCenterTier(world, typeId, playerId)"), "HUD town-center upgrade action metadata fallback should use source-aware selected town-center tiering.");
expect(ordersSource.includes('case "upgrade-town-center":\n      {\n        const target = townUpgrade();\n        return target ? { action: "upgrade-to", value: target } : null;\n      }'), "HUD town-center upgrade action metadata should return null when no source or valid fallback target exists.");
for (const stockHallId of ["unit-town-hall", "unit-keep", "unit-great-hall", "unit-stronghold"]) {
  expect(!townUpgradeActionSource.includes(`typeIdSet.has("${stockHallId}")`), `HUD town-center upgrade action metadata should not branch on ${stockHallId}.`);
}
expect(!ordersSource.includes('sourceResearchProducerHasUpgradeFamily(world, unit, isShipUpgradeId)\n    ?? (unit.typeId === "unit-human-foundry" || unit.typeId === "unit-orc-foundry")'), "Simulation foundry classification should not fall back to exact stock foundry ids.");
expect(ordersSource.includes('sourceResearchProducerHasUpgradeFamily(world, unit, (upgradeId) => isShipUpgradeId(world, upgradeId))\n    ?? (unit.shoreBuilding && !canStoreResource(unit, "oil"))'), "Simulation foundry classification should fall back to source shore-building/resource metadata.");
expect(!ordersSource.includes('sourceResearchProducerHasUpgradeFamily(world, unit, (upgradeId) => isBlacksmithUpgradeId(world, upgradeId))\n    ?? (unit.typeId === "unit-human-blacksmith" || unit.typeId === "unit-orc-blacksmith")'), "Simulation blacksmith classification should not fall back to exact stock blacksmith ids.");
expect(ordersSource.includes("return sourceResearchProducerHasUpgradeFamily(world, unit, (upgradeId) => isBlacksmithUpgradeId(world, upgradeId)) === true;"), "Simulation blacksmith classification should require source blacksmith research capability.");
expect(!ordersSource.includes('sourceResearchProducerHasUpgradeFamily(world, unit, (upgradeId) => isLumberMillUpgradeId(world, upgradeId))\n    ?? (unit.typeId === "unit-elven-lumber-mill" || unit.typeId === "unit-troll-lumber-mill")'), "Simulation lumber-mill classification should not fall back to exact stock lumber-mill ids.");
expect(ordersSource.includes("return sourceResearchProducerHasUpgradeFamily(world, unit, (upgradeId) => isLumberMillUpgradeId(world, upgradeId)) === true;"), "Simulation lumber-mill classification should require source lumber-mill research capability.");
expect(!ordersSource.includes('if (building.typeId === "unit-human-blacksmith" || building.typeId === "unit-orc-blacksmith")'), "Research fallback families should not reintroduce exact stock blacksmith id checks.");
expect(ordersSource.includes("if (isBlacksmith(world, building)) {\n    return race === \"human\"\n      ? [\"upgrade-sword1\", \"upgrade-sword2\", \"upgrade-human-shield1\", \"upgrade-human-shield2\", \"upgrade-ballista1\", \"upgrade-ballista2\"]"), "Research fallback families should reuse source-aware blacksmith classification.");
expect(!ordersSource.includes('if (building.typeId === "unit-elven-lumber-mill" || building.typeId === "unit-troll-lumber-mill")'), "Research fallback families should not reintroduce exact stock lumber-mill id checks.");
expect(ordersSource.includes("if (isLumberMill(world, building)) {\n    return race === \"human\"\n      ? [\"upgrade-arrow1\", \"upgrade-arrow2\", \"upgrade-ranger\", \"upgrade-longbow\", \"upgrade-ranger-scouting\", \"upgrade-ranger-marksmanship\"]"), "Research fallback families should reuse source-aware lumber-mill classification.");
expect(ordersSource.includes("function isHolyResearchProducer(world: WorldState, unit: WorldUnit): boolean"), "Simulation should centralize source-aware holy research producer classification.");
expect(!ordersSource.includes("sourceResearchProducerHasUpgradeFamily(world, unit, (upgradeId) => isHolyResearchUpgradeId(world, upgradeId))\n    ?? (unit.typeId === \"unit-church\" || unit.typeId === \"unit-altar-of-storms\")"), "Holy research producer classification should not fall back to exact stock church/altar ids.");
expect(ordersSource.includes("return sourceResearchProducerHasUpgradeFamily(world, unit, (upgradeId) => isHolyResearchUpgradeId(world, upgradeId)) === true;"), "Simulation holy research producer classification should require source holy research capability.");
expect(!ordersSource.includes('if (building.typeId === "unit-church" || building.typeId === "unit-altar-of-storms")'), "Research fallback families should not inline exact stock holy producer id checks.");
expect(ordersSource.includes("if (isHolyResearchProducer(world, building)) {\n    return race === \"human\"\n      ? [\"upgrade-paladin\", \"upgrade-healing\", \"upgrade-exorcism\", \"upgrade-holy-vision\"]"), "Research fallback families should reuse source-aware holy research producer classification.");
expect(!ordersSource.includes('if (building.typeId === "unit-human-foundry" || building.typeId === "unit-orc-foundry")'), "Research fallback families should not reintroduce exact stock foundry id checks.");
expect(ordersSource.includes("if (isFoundry(world, building)) {\n    return race === \"human\"\n      ? [\"upgrade-human-ship-cannon1\", \"upgrade-human-ship-cannon2\", \"upgrade-human-ship-armor1\", \"upgrade-human-ship-armor2\"]"), "Research fallback families should reuse source-aware foundry classification.");
expect(ordersSource.includes("function isCasterResearchProducer(world: WorldState, unit: WorldUnit): boolean"), "Simulation should centralize source-aware caster research producer classification.");
expect(!ordersSource.includes("sourceResearchProducerHasUpgradeFamily(world, unit, (upgradeId) => isCasterResearchUpgradeId(world, upgradeId))\n    ?? (unit.typeId === \"unit-mage-tower\" || unit.typeId === \"unit-temple-of-the-damned\")"), "Caster research producer classification should not fall back to exact stock mage-tower/temple ids.");
expect(ordersSource.includes("return sourceResearchProducerHasUpgradeFamily(world, unit, (upgradeId) => isCasterResearchUpgradeId(world, upgradeId)) === true;"), "Simulation caster research producer classification should require source caster research capability.");
expect(!ordersSource.includes('if (building.typeId === "unit-mage-tower" || building.typeId === "unit-temple-of-the-damned")'), "Research fallback families should not inline exact stock caster research producer id checks.");
expect(ordersSource.includes("if (isCasterResearchProducer(world, building)) {\n    return race === \"human\"\n      ? [\"upgrade-fireball\", \"upgrade-flame-shield\", \"upgrade-slow\", \"upgrade-blizzard\", \"upgrade-polymorph\", \"upgrade-invisibility\"]"), "Research fallback families should reuse source-aware caster research producer classification.");
expect(ordersSource.includes("export function sourceWorkerTrainTargetForTypes(world: WorldState, typeIds: Iterable<string>, playerId: number): string | null"), "Simulation should expose source worker train target resolution.");
expect(ordersSource.includes("export function sourceTrainTargetForTypes(world: WorldState, typeIds: Iterable<string>, playerId: number, unitTypeId: string): string | null"), "Simulation should expose source exact train target resolution for special fallback commands.");
expect(ordersSource.includes("export function hasSourceTrainButtonsForTypes(world: WorldState, typeIds: Iterable<string>, playerId: number): boolean"), "Simulation should expose selected-type source train-button detection.");
expect(ordersSource.includes("export function sourceTrainTargetForHudCommand(world: WorldState, typeIds: Iterable<string>, playerId: number, command: string): string | null"), "Simulation should expose source HUD train target resolution.");
expect(ordersSource.includes("export function sourceFallbackTrainTargetForHudCommand(world: WorldState, selectedUnits: WorldUnit[], command: string): string | null"), "Simulation should expose source HUD fallback train target resolution.");
expect(ordersSource.includes("const trainTarget = (commandId: string, fallback: string): string | null => (\n    sourceTrainTargetForHudCommand(world, typeIdSet, playerId, commandId)\n    ?? sourceFallbackTrainTargetForHudCommand(world, selectedUnits, commandId)\n    ?? (hasSourceTrainButtonsForTypes(world, typeIdSet, playerId) ? null : fallback)\n  );"), "HUD action metadata should suppress stock train fallbacks when source train buttons exist.");
expect(ordersSource.includes("const exactTrainTarget = (unitTypeId: string): string | null => (\n    sourceTrainTargetForTypes(world, typeIdSet, playerId, unitTypeId)\n    ?? (hasSourceTrainButtonsForTypes(world, typeIdSet, playerId) ? null : unitTypeId)\n  );"), "HUD exact train action metadata should suppress stock train fallbacks when source train buttons exist.");
expect(ordersSource.includes('case "train-minuteman":\n      return trainAction(exactTrainTarget("unit-attack-peasant"));'), "HUD action metadata for train-minuteman should prefer source train buttons before the stock minuteman id.");
expect(ordersSource.includes('case "train-critter":\n      return trainAction(exactTrainTarget("unit-critter"));'), "HUD action metadata for train-critter should prefer source train buttons before the stock critter id.");
for (const [command, fallback] of [
  ["train-cavalry", 'raceValue("unit-knight", "unit-ogre")'],
  ["train-tanker", 'raceValue("unit-human-oil-tanker", "unit-orc-oil-tanker")'],
  ["train-destroyer", 'raceValue("unit-human-destroyer", "unit-orc-destroyer")'],
  ["train-warship", 'raceValue("unit-battleship", "unit-ogre-juggernaught")'],
  ["train-transport", 'raceValue("unit-human-transport", "unit-orc-transport")'],
  ["train-submarine", 'raceValue("unit-human-submarine", "unit-orc-submarine")'],
  ["train-caster", 'raceValue("unit-mage", "unit-death-knight")'],
  ["train-air", 'raceValue("unit-gryphon-rider", "unit-dragon")'],
  ["train-demolition", 'raceValue("unit-dwarves", "unit-goblin-sappers")'],
  ["train-siege", 'raceValue("unit-ballista", "unit-catapult")'],
  ["train-scout-air", 'raceValue("unit-balloon", "unit-zeppelin")']
]) {
  expect(ordersSource.includes(`case "${command}":\n      return trainAction(trainTarget(command, ${fallback}));`), `HUD action metadata for ${command} should try selected-unit source trainability before stock ids.`);
}
expect(ordersSource.includes("export function sourceBuildTargetForHudCommand(world: WorldState, typeIds: Iterable<string>, playerId: number, command: string): string | null"), "Simulation should expose source HUD build target resolution.");
expect(ordersSource.includes("export function hasSourceBuildButtonsForTypes(world: WorldState, typeIds: Iterable<string>, playerId: number): boolean"), "Simulation should expose selected-type source build-button detection.");
expect(ordersSource.includes('case "build-oil-platform":\n      return (definition) => isOilPlatformDefinition(definition, world.unitDefinitions);'), "Simulation source HUD build target resolution should classify oil-platform build buttons from source platform metadata.");
expect(!ordersSource.includes('case "build-oil-platform":\n      return { action: "build", value: raceValue("unit-human-oil-platform", "unit-orc-oil-platform") };'), "HUD oil-platform action metadata should not bypass source build target resolution.");
expect(ordersSource.includes("const buildTarget = (commandId: string, fallback: string): string | null => (\n    sourceBuildTargetForHudCommand(world, typeIdSet, playerId, commandId)\n    ?? (hasSourceBuildButtonsForTypes(world, typeIdSet, playerId) ? null : fallback)\n  );"), "HUD action metadata should suppress stock build fallbacks when source build buttons exist.");
expect(ordersSource.includes("const buildAction = (target: string | null): { action: string; value: string } | null => target ? { action: \"build\", value: target } : null;"), "HUD build action metadata should return null when no source or valid fallback target exists.");
for (const [command, fallback] of [
  ["build-farm", 'raceValue("unit-farm", "unit-pig-farm")'],
  ["build-barracks", 'raceValue("unit-human-barracks", "unit-orc-barracks")'],
  ["build-lumber-mill", 'raceValue("unit-elven-lumber-mill", "unit-troll-lumber-mill")'],
  ["build-blacksmith", 'raceValue("unit-human-blacksmith", "unit-orc-blacksmith")'],
  ["build-wall", 'raceValue("unit-human-wall", "unit-orc-wall")'],
  ["build-advanced", 'raceValue("unit-stables", "unit-ogre-mound")'],
  ["build-guard-tower", 'raceValue("unit-human-watch-tower", "unit-orc-watch-tower")'],
  ["build-cannon-tower", 'raceValue("unit-human-cannon-tower", "unit-orc-cannon-tower")'],
  ["build-shipyard", 'raceValue("unit-human-shipyard", "unit-orc-shipyard")'],
  ["build-foundry", 'raceValue("unit-human-foundry", "unit-orc-foundry")'],
  ["build-refinery", 'raceValue("unit-human-refinery", "unit-orc-refinery")'],
  ["build-oil-platform", 'raceValue("unit-human-oil-platform", "unit-orc-oil-platform")'],
  ["build-caster-building", 'raceValue("unit-mage-tower", "unit-temple-of-the-damned")'],
  ["build-holy-building", 'raceValue("unit-church", "unit-altar-of-storms")'],
  ["build-air-building", 'raceValue("unit-gryphon-aviary", "unit-dragon-roost")'],
  ["build-siege-lab", 'raceValue("unit-inventor", "unit-alchemist")']
]) {
  expect(ordersSource.includes(`case "${command}":\n      return buildAction(buildTarget(command, ${fallback}));`), `HUD action metadata for ${command} should suppress stock build fallbacks when source build buttons exist.`);
}
expect(ordersSource.includes("export function sourceResearchTargetForHudCommand(world: WorldState, typeIds: Iterable<string>, playerId: number, command: string): string | null"), "Simulation should expose source HUD research target resolution.");
expect(ordersSource.includes("export function hasSourceResearchButtonsForTypes(world: WorldState, typeIds: Iterable<string>, playerId: number): boolean"), "Simulation should expose selected-type source research-button detection.");
expect(ordersSource.includes("export function sourceFallbackResearchTargetForHudCommand(world: WorldState, selectedUnits: WorldUnit[], command: string): string | null"), "Simulation should expose selected-unit source HUD research target resolution.");
expect(ordersSource.includes(".filter((button) => selectedUnits.some((unit) => sourceButtonAppliesTo(button, unit.typeId) && sourceButtonAllowedForSimulation(world, button, unit.player)))"), "Selected-unit source HUD research target resolution should inspect applicable source research buttons.");
expect(ordersSource.includes(".filter((button) => selectedUnits.some((unit) => canResearchUpgradeAt(world, unit.id, button.value)))"), "Selected-unit source HUD research target resolution should require live research eligibility.");
expect(ordersSource.includes("const researchTarget = (commandId: string, fallback: string): string | null => (\n    sourceResearchTargetForHudCommand(world, typeIdSet, playerId, commandId)\n    ?? sourceFallbackResearchTargetForHudCommand(world, selectedUnits, commandId)\n    ?? (hasSourceResearchButtonsForTypes(world, typeIdSet, playerId) ? null : fallback)\n  );"), "HUD action metadata should suppress stock research fallbacks when source research buttons exist.");
expect(ordersSource.includes("const researchAction = (target: string | null): { action: string; value: string } | null => target ? { action: \"research\", value: target } : null;"), "HUD research action metadata should return null when no source or valid fallback target exists.");
for (const [command, fallback] of [
  ["research-melee", 'raceValue("upgrade-sword1", "upgrade-battle-axe1")'],
  ["research-armor", 'raceValue("upgrade-human-shield1", "upgrade-orc-shield1")'],
  ["research-ranged", 'raceValue("upgrade-arrow1", "upgrade-throwing-axe1")'],
  ["research-siege", 'raceValue("upgrade-ballista1", "upgrade-catapult1")'],
  ["research-paladin", 'raceValue("upgrade-paladin", "upgrade-ogre-mage")'],
  ["research-healing", '"upgrade-healing"'],
  ["research-exorcism", '"upgrade-exorcism"'],
  ["research-holy-vision", '"upgrade-holy-vision"'],
  ["research-flame-shield", '"upgrade-flame-shield"'],
  ["research-blizzard", '"upgrade-blizzard"'],
  ["research-polymorph", '"upgrade-polymorph"'],
  ["research-invisibility", '"upgrade-invisibility"'],
  ["research-slow", '"upgrade-slow"'],
  ["research-death-coil", '"upgrade-death-coil"'],
  ["research-death-magic", '"upgrade-death-and-decay"'],
  ["research-whirlwind", '"upgrade-whirlwind"'],
  ["research-raise-dead", '"upgrade-raise-dead"'],
  ["research-unholy-armor", '"upgrade-unholy-armor"'],
  ["research-haste", '"upgrade-haste"'],
  ["research-bloodlust", '"upgrade-bloodlust"'],
  ["research-runes", '"upgrade-runes"'],
  ["research-eye-of-kilrogg", '"upgrade-eye-of-kilrogg"'],
  ["research-ship-cannon", 'raceValue("upgrade-human-ship-cannon1", "upgrade-orc-ship-cannon1")'],
  ["research-ship-armor", 'raceValue("upgrade-human-ship-armor1", "upgrade-orc-ship-armor1")']
]) {
  expect(ordersSource.includes(`case "${command}":\n      return researchAction(researchTarget(command, ${fallback}));`), `HUD action metadata for ${command} should suppress stock research fallbacks when source research buttons exist.`);
}
expect(ordersSource.includes("export function sourceTrainIconForHudCommand(world: WorldState, typeIds: Iterable<string>, playerId: number, command: string): string | null"), "Simulation should expose source HUD train icon resolution.");
expect(ordersSource.includes("export function sourceFallbackTrainIconForHudCommand(world: WorldState, selectedUnits: WorldUnit[], command: string): string | null"), "Simulation should expose source HUD fallback train icon resolution.");
expect(ordersSource.includes("export function sourceBuildIconForHudCommand(world: WorldState, typeIds: Iterable<string>, playerId: number, command: string): string | null"), "Simulation should expose source HUD build icon resolution.");
expect(ordersSource.includes("export function sourceResearchIconForHudCommand(world: WorldState, typeIds: Iterable<string>, playerId: number, command: string): string | null"), "Simulation should expose source HUD research icon resolution.");
expect(ordersSource.includes("export function sourceFallbackResearchIconForHudCommand(world: WorldState, selectedUnits: WorldUnit[], command: string): string | null"), "Simulation should expose selected-unit source HUD research icon resolution.");
expect(hudSource.includes("const allowStockTrainFallbacks = !hasSourceTrainButtonsForTypes(world, typeIds, selectedPlayer);"), "HUD fallback command visibility should detect applicable source train buttons before showing stock train commands.");
expect(hudSource.includes("const allowStockBuildFallbacks = !hasSourceBuildButtonsForTypes(world, typeIds, selectedPlayer);"), "HUD fallback command visibility should detect applicable source build buttons before showing stock build commands.");
expect(hudSource.includes("const allowStockResearchFallbacks = !hasSourceResearchButtonsForTypes(world, typeIds, selectedPlayer);"), "HUD fallback command visibility should detect applicable source research buttons before showing stock research commands.");
expect(hudSource.includes('if (!sourceTrainValues.has("unit-critter") && allowStockTrainFallbacks && selectedCanTrainAny(world, selectedUnits, ["unit-critter"])) {'), "HUD critter fallback visibility should be suppressed when source train buttons are authoritative.");
expect(hudSource.includes('if (allowStockBuildFallbacks && canEnterPendingWorldCommand(world, selectedReadyUnitIds, "build-oil-platform", selectedPlayer)) {'), "HUD oil-platform fallback visibility should be suppressed when source build buttons are authoritative.");
expect(hudSource.includes('if (!sourceBuildValuesDefinitionMatching(world, sourceBuildValues, isSupplyProviderDefinition) && allowStockBuildFallbacks && selectedCanBuildAny(world, selectedUnits, ["unit-farm", "unit-pig-farm"])) {'), "HUD worker build fallback visibility should be suppressed when source build buttons are authoritative.");
expect(hudSource.includes('allowStockResearchFallbacks && selectedCanResearchAny(world, selectedUnits, ["upgrade-flame-shield"])'), "HUD caster research fallback visibility should be suppressed when source research buttons are authoritative.");
expect(hudSource.includes('allowStockTrainFallbacks && selectedCanTrainAny(world, selectedUnits, ["unit-mage", "unit-death-knight"])'), "HUD caster train fallback visibility should be suppressed when source train buttons are authoritative.");
expect(ordersSource.includes("export function isMeleeWeaponResearchUpgrade(world: WorldState, upgradeId: string): boolean"), "Simulation should expose melee weapon research classification.");
expect(ordersSource.includes("export function isShieldResearchUpgrade(world: WorldState, upgradeId: string): boolean"), "Simulation should expose shield research classification.");
expect(ordersSource.includes("export function isSiegeResearchUpgrade(world: WorldState, upgradeId: string): boolean"), "Simulation should expose siege research classification.");
expect(ordersSource.includes("export function isLumberMillResearchUpgrade(world: WorldState, upgradeId: string): boolean"), "Simulation should expose lumber-mill research classification.");
expect(ordersSource.includes("function upgradeHasSourceTargetMetadata(world: WorldState, upgradeId: string): boolean"), "Simulation should detect source upgrade target metadata before id-name research fallbacks.");
expect(ordersSource.includes("sourceFallbackUpgradeFamilyMatches(world, upgradeId, SOURCE_MELEE_WEAPON_UPGRADE_FALLBACK_TOKENS)"), "Melee weapon research fallback should route through the source-aware upgrade family helper.");
expect(ordersSource.includes("sourceFallbackUpgradeFamilyMatches(world, upgradeId, SOURCE_SHIELD_UPGRADE_FALLBACK_TOKENS)"), "Shield research fallback should route through the source-aware upgrade family helper.");
expect(ordersSource.includes("sourceFallbackUpgradeFamilyMatches(world, upgradeId, SOURCE_SIEGE_UPGRADE_FALLBACK_TOKENS)"), "Siege research fallback should route through the source-aware upgrade family helper.");
expect(ordersSource.includes("sourceFallbackUpgradeFamilyMatches(world, upgradeId, SOURCE_LUMBER_MILL_UPGRADE_FALLBACK_TOKENS)"), "Lumber-mill research fallback should route through the source-aware upgrade family helper.");
expect(ordersSource.includes("export function isHolyResearchUpgradeId(world: WorldState, upgradeId: string): boolean"), "Simulation should expose holy research classification.");
expect(ordersSource.includes("export function isHolyTransformationResearchUpgradeId(world: WorldState, upgradeId: string): boolean"), "Simulation should expose holy transformation research classification.");
expect(ordersSource.includes("export function isHolySupportResearchUpgradeId(world: WorldState, upgradeId: string): boolean"), "Simulation should expose holy support research classification.");
expect(ordersSource.includes("!upgradeHasSourceTargetMetadata(world, upgradeId) && (upgradeId === \"upgrade-healing\" || upgradeId === \"upgrade-haste\")"), "Holy support research stock fallback should only run when source upgrade target metadata is absent.");
expect(ordersSource.includes("function sourceSpellIsHolySupportResearch(spell: WargusSpell): boolean"), "Holy support research classification should use source spell effect metadata.");
expect(ordersSource.includes('adjustment.variable === "hit-points" && adjustment.amount > 0'), "Holy support research should recognize healing from positive hit-point adjustments.");
expect(ordersSource.includes('adjustment.variable === "Haste" && adjustment.amount > 0'), "Holy support research should recognize haste from source variable adjustments.");
expect(!ordersSource.includes('label.includes("healing") || label.includes("haste")'), "Holy support research should not infer spell role from id/show-name text.");
expect(ordersSource.includes("|| (!upgradeHasSourceTargetMetadata(world, upgradeId) && [\n      \"upgrade-paladin\""), "Holy research stock fallback list should only run when source upgrade target metadata is absent.");
expect(ordersSource.includes("|| (!upgradeHasSourceTargetMetadata(world, upgradeId) && (upgradeId === \"upgrade-paladin\" || upgradeId === \"upgrade-ogre-mage\"))"), "Holy transformation stock fallback should only run when source upgrade target metadata is absent.");
expect(ordersSource.includes("|| (!upgradeHasSourceTargetMetadata(world, upgradeId) && [\n      \"upgrade-fireball\""), "Caster research stock fallback list should only run when source upgrade target metadata is absent.");
expect(ordersSource.includes("export function sourceSpellDependencyResearchForRole(world: WorldState, upgradeId: string, matchesCaster: (definition: WargusUnit) => boolean): boolean"), "Simulation should expose source spell-dependency research role matching.");
expect(ordersSource.includes("export function sourceSpellTargetForHudCommand(world: WorldState, selectedUnits: WorldUnit[], command: TargetedSpellCommand): string | null"), "Simulation should expose source cast-spell action target resolution.");
expect(ordersSource.includes("const sourceSpellTarget = sourceSpellTargetForHudCommand(world, selectedUnits, command);"), "HUD cast action metadata should resolve source cast-spell button targets first.");
expect(ordersSource.includes('return sourceSpellTarget || fallbackSpellTarget ? { action: "cast-spell", value: sourceSpellTarget ?? fallbackSpellTarget ?? undefined } : null;'), "HUD cast action metadata should fall back to stock spell ids only after source cast-spell targets.");
for (const stockCastCase of ["cast-heal", "cast-exorcism", "cast-holy-vision", "cast-fireball", "cast-flame-shield", "cast-blizzard", "cast-polymorph", "cast-invisibility", "cast-slow", "cast-death-coil", "cast-death-and-decay", "cast-whirlwind", "cast-raise-dead", "cast-unholy-armor", "cast-haste", "cast-bloodlust", "cast-runes", "cast-eye-of-kilrogg"]) {
  expect(!ordersSource.includes(`case "${stockCastCase}":\n      return { action: "cast-spell"`), `HUD cast action metadata should use the shared source-first targeted spell branch instead of a stock switch case for ${stockCastCase}.`);
}
expect(ordersSource.includes("export function isShipCannonResearchUpgradeId(world: WorldState, upgradeId: string): boolean;"), "Simulation should expose source-aware ship cannon research classification.");
expect(ordersSource.includes("export function isShipArmorResearchUpgradeId(world: WorldState, upgradeId: string): boolean;"), "Simulation should expose source-aware ship armor research classification.");
expect(ordersSource.includes('upgradeModifiesMatchingUnits(world, upgradeId, (stat) => stat === "PiercingDamage" || stat === "BasicDamage", isNavalAttackUpgradeTargetDefinition)'), "Ship cannon research classification should use source upgrade modifiers and naval attack targets.");
expect(ordersSource.includes('upgradeModifiesMatchingUnits(world, upgradeId, (stat) => stat === "Armor", isNavalAttackUpgradeTargetDefinition)'), "Ship armor research classification should use source upgrade modifiers and naval attack targets.");
expect(ordersSource.includes('&& ["upgrade-human-ship-cannon1", "upgrade-human-ship-cannon2", "upgrade-orc-ship-cannon1", "upgrade-orc-ship-cannon2"].includes(upgradeId)'), "Ship cannon stock ids should remain only as a metadata-gap fallback.");
expect(ordersSource.includes('&& ["upgrade-human-ship-armor1", "upgrade-human-ship-armor2", "upgrade-orc-ship-armor1", "upgrade-orc-ship-armor2"].includes(upgradeId)'), "Ship armor stock ids should remain only as a metadata-gap fallback.");
expect(ordersSource.includes("function isNavalAttackUpgradeTargetDefinition(definition: WargusUnit): boolean"), "Simulation should classify naval upgrade targets from source unit traits.");
expect(ordersSource.includes("export function isSourceConversionTarget(world: WorldState, unitTypeId: string): boolean"), "Simulation should expose source conversion target classification.");
expect(ordersSource.includes("export function sourceResearchMatcherForHudCommand(world: WorldState, command: string): ((upgradeId: string) => boolean) | null"), "Simulation should expose source-data HUD research command role matching.");
expect(ordersSource.includes("sourceResearchMatcherForHudCommand(world, command)"), "Simulation source HUD research target resolution should use source-data research command role matching.");
expect(!hudSource.includes("function sourceResearchMatcherForCommand"), "HUD should use simulation source-data research command role matching instead of a local copy.");
expect(!ordersSource.includes("function fallbackOrdinaryBarracksCombatDefinition"), "Simulation direct training hotkeys should use source ordinary barracks combat predicates instead of fallback copies.");
expect(!ordersSource.includes("function fallbackMeleeLandCombatDefinition"), "Simulation direct training hotkeys should use source melee predicates instead of fallback copies.");
expect(!ordersSource.includes("function fallbackRangedLandCombatDefinition"), "Simulation direct training hotkeys should use source ranged predicates instead of fallback copies.");
expect(!ordersSource.includes("function fallbackAdvancedMeleeCombatDefinition"), "Simulation direct training hotkeys should use source advanced melee predicates instead of fallback copies.");
expect(!ordersSource.includes("function fallbackCasterDefinition"), "Simulation direct training hotkeys should use source caster predicates instead of fallback copies.");
expect(!ordersSource.includes("function fallbackAirCombatDefinition"), "Simulation direct training hotkeys should use source air combat predicates instead of fallback copies.");
expect(!ordersSource.includes("function fallbackDemolitionDefinition"), "Simulation direct training hotkeys should use source demolition predicates instead of fallback copies.");
expect(!ordersSource.includes("function fallbackSiegeDefinition"), "Simulation direct training hotkeys should use source siege predicates instead of fallback copies.");
expect(!ordersSource.includes("function fallbackScoutAirDefinition"), "Simulation direct training hotkeys should use source scout-air predicates instead of fallback copies.");
expect(!ordersSource.includes("function fallbackNavalRoleDefinition"), "Simulation direct training hotkeys should use source naval predicates instead of fallback copies.");
expect(!ordersSource.includes("function fallbackSourceConversionTarget"), "Simulation direct training hotkeys should use shared source conversion target classification instead of fallback copies.");
expect(ordersSource.includes("export function sourceTrainMatcherForHudCommand(world: WorldState, command: string): ((definition: WargusUnit) => boolean) | null"), "Simulation should expose source-data HUD train command role matching.");
expect(ordersSource.includes("sourceTrainMatcherForHudCommand(world, command)"), "Simulation source HUD train target resolution should use source-data train command role matching.");
expect(!hudSource.includes("function sourceTrainMatcherForCommand"), "HUD should use simulation source-data train command role matching instead of a local copy.");
expect(ordersSource.includes("function issueTrainBarracksUnitByHotkeyRole(world: WorldState, unit: WorldUnit, role: \"melee\" | \"ranged\", race: \"human\" | \"orc\", unitDefinitions: WargusUnit[]): boolean | null"), "Direct barracks train hotkeys should use a shared source-role trainability helper.");
expect(ordersSource.includes("issueTrainBySourceRole(world, unit, matchesRole, unitDefinitions)"), "Direct barracks train hotkeys should use source ordinary non-conversion trainability before stock fallbacks.");
expect(!ordersSource.includes('sourceBuildingProducesMatching(world, unit.typeId, (definition) => isOrdinaryBarracksCombatDefinition(definition) && isMeleeLandCombatDefinition(definition) && !isSourceConversionTarget(world, definition.id), unit.player) || unit.typeId === "unit-human-barracks" || unit.typeId === "unit-orc-barracks"'), "Direct melee train hotkeys should not require stock barracks ids.");
expect(!ordersSource.includes('sourceBuildingProducesMatching(world, unit.typeId, (definition) => isOrdinaryBarracksCombatDefinition(definition) && isRangedLandCombatDefinition(definition) && !isSourceConversionTarget(world, definition.id), unit.player) || unit.typeId === "unit-human-barracks" || unit.typeId === "unit-orc-barracks"'), "Direct ranged train hotkeys should not require stock barracks ids.");
expect(!ordersSource.includes('sourceProducerHasTrainRole(world, unit, isOrdinaryBarracksCombatDefinition)\n    ?? (unit.typeId === "unit-human-barracks" || unit.typeId === "unit-orc-barracks")'), "Simulation barracks classification should not fall back to exact stock barracks ids.");
expect(ordersSource.includes("return sourceProducerHasTrainRole(world, unit, isOrdinaryBarracksCombatDefinition) === true;"), "Simulation barracks classification should require source-role trainability.");
expect(!ordersSource.includes('sourceProducerHasTrainRole(world, unit, isAdvancedMeleeCombatDefinition)\n    ?? (unit.typeId === "unit-stables" || unit.typeId === "unit-ogre-mound")'), "Simulation advanced-melee producer classification should not treat stock tech buildings as train producers.");
expect(ordersSource.includes("return sourceProducerHasTrainRole(world, unit, isAdvancedMeleeCombatDefinition) === true;"), "Simulation advanced-melee producer classification should require source advanced-melee trainability.");
expect(!ordersSource.includes('sourceProducerHasTrainRole(world, unit, (definition) => Boolean(definition.manaEnabled || (definition.manaMax ?? 0) > 0))\n    ?? (unit.typeId === "unit-mage-tower" || unit.typeId === "unit-temple-of-the-damned")'), "Simulation caster producer classification should not fall back to exact stock mage-tower/temple ids.");
expect(ordersSource.includes("return sourceProducerHasTrainRole(world, unit, (definition) => Boolean(definition.manaEnabled || (definition.manaMax ?? 0) > 0)) === true;"), "Simulation caster producer classification should require source caster trainability.");
expect(!ordersSource.includes('sourceProducerHasTrainRole(world, unit, (definition) => Boolean(definition.airUnit || definition.type === "fly") && definition.canAttack)\n    ?? (unit.typeId === "unit-gryphon-aviary" || unit.typeId === "unit-dragon-roost")'), "Simulation air producer classification should not fall back to exact stock aviary/roost ids.");
expect(ordersSource.includes('return sourceProducerHasTrainRole(world, unit, (definition) => Boolean(definition.airUnit || definition.type === "fly") && definition.canAttack) === true;'), "Simulation air producer classification should require source air-combat trainability.");
expect(!ordersSource.includes('sourceProducerHasTrainRole(world, unit, isDemolitionLabDefinition)\n    ?? (unit.typeId === "unit-inventor" || unit.typeId === "unit-alchemist")'), "Simulation demolition producer classification should not fall back to exact stock inventor/alchemist ids.");
expect(ordersSource.includes("return sourceProducerHasTrainRole(world, unit, isDemolitionLabDefinition) === true;"), "Simulation demolition producer classification should require source demolition trainability.");
expect(ordersSource.includes("&& !isSourceConversionTarget(world, definition.id)\n  );\n  const sourceTrained = issueSourceTrainByRole(world, building, matchesRole);"), "Barracks melee/ranged order helper should exclude source conversion targets before dedicated veteran paths.");
expect(ordersSource.includes("function issueTrainNavalUnitByHotkeyRole(world: WorldState, unit: WorldUnit, role: \"tanker\" | \"destroyer\" | \"warship\" | \"transport\" | \"submarine\", race: \"human\" | \"orc\", unitDefinitions: WargusUnit[]): boolean | null"), "Direct naval train hotkeys should use a shared source-role trainability helper.");
expect(ordersSource.includes("issueTrainBySourceRole(world, unit, (definition) => isNavalRoleDefinition(definition, role), unitDefinitions)"), "Direct naval train hotkeys should use source naval trainability before stock fallbacks.");
expect(!ordersSource.includes('sourceBuildingProducesMatching(world, unit.typeId, (definition) => isNavalRoleDefinition(definition, "tanker"), unit.player) || unit.typeId === "unit-human-shipyard" || unit.typeId === "unit-orc-shipyard"'), "Direct tanker train hotkeys should not require stock shipyard ids.");
expect(!ordersSource.includes('sourceBuildingProducesMatching(world, unit.typeId, (definition) => isNavalRoleDefinition(definition, "destroyer"), unit.player) || unit.typeId === "unit-human-shipyard" || unit.typeId === "unit-orc-shipyard"'), "Direct destroyer train hotkeys should not require stock shipyard ids.");
expect(!ordersSource.includes('sourceBuildingProducesMatching(world, unit.typeId, (definition) => isNavalRoleDefinition(definition, "warship"), unit.player) || unit.typeId === "unit-human-shipyard" || unit.typeId === "unit-orc-shipyard"'), "Direct warship train hotkeys should not require stock shipyard ids.");
expect(!ordersSource.includes('sourceBuildingProducesMatching(world, unit.typeId, (definition) => isNavalRoleDefinition(definition, "submarine"), unit.player) || unit.typeId === "unit-human-shipyard" || unit.typeId === "unit-orc-shipyard"'), "Direct submarine train hotkeys should not require stock shipyard ids.");
expect(!ordersSource.includes('sourceBuildingProducesMatching(world, unit.typeId, (definition) => isNavalRoleDefinition(definition, "transport"), unit.player) || unit.typeId === "unit-human-shipyard" || unit.typeId === "unit-orc-shipyard"'), "Direct transport train hotkeys should not require stock shipyard ids.");
expect(ordersSource.includes("issueTrainBySourceRole(world, unit, isCasterDefinition, unitDefinitions)"), "Direct caster train hotkeys should use source caster trainability before stock fallbacks.");
expect(ordersSource.includes("issueTrainBySourceRole(world, unit, isAirCombatDefinition, unitDefinitions)"), "Direct air train hotkeys should use source air trainability before stock fallbacks.");
expect(ordersSource.includes("issueTrainBySourceRole(world, unit, isDemolitionUnitDefinition, unitDefinitions)"), "Direct demolition train hotkeys should use source demolition trainability before stock fallbacks.");
expect(ordersSource.includes("issueTrainBySourceRole(world, unit, isScoutAirDefinition, unitDefinitions)"), "Direct scout-air train hotkeys should use source scout-air trainability before stock fallbacks.");
expect(ordersSource.includes("issueTrainBySourceRole(world, unit, isSiegeDefinition, unitDefinitions)"), "Direct siege train hotkeys should use source siege trainability before stock fallbacks.");
expect(!ordersSource.includes('sourceBuildingProducesMatching(world, unit.typeId, isCasterDefinition, unit.player) || unit.typeId === "unit-mage-tower" || unit.typeId === "unit-temple-of-the-damned"'), "Direct caster train hotkeys should not require stock caster producer ids.");
expect(!ordersSource.includes('sourceBuildingProducesMatching(world, unit.typeId, isAirCombatDefinition, unit.player) || unit.typeId === "unit-gryphon-aviary" || unit.typeId === "unit-dragon-roost"'), "Direct air train hotkeys should not require stock air producer ids.");
expect(!ordersSource.includes('sourceBuildingProducesMatching(world, unit.typeId, isDemolitionUnitDefinition, unit.player) || unit.typeId === "unit-inventor" || unit.typeId === "unit-alchemist"'), "Direct demolition train hotkeys should not require stock demolition producer ids.");
expect(selectionHotkeySource.includes("buildingTypeForWorkerHotkey(world, code, selectedUnitIds, commandPage)"), "Selection hotkey path should call simulation worker build hotkey resolution.");
expect(commandKeySource.includes("sourceBuildTypeForKey(loadedWorld, unit, code)"), "Command-key path should call simulation source build key lookup.");
expect(commandKeySource.includes("issueFallbackBuildCommandByKey(loadedWorld, unit, code, loadedManifest.units)"), "Command-key path should call simulation fallback build hotkey issuing.");
expect(!mainSource.includes("function buildingTypeForWorkerHotkey"), "Main should use simulation worker build hotkey resolution instead of a local copy.");
expect(!mainSource.includes("function sourceBuildTypeForPageKeyRole"), "Main should not own source page/key role build lookup.");
expect(!mainSource.includes("function sourceBuildMatcherForPageKey"), "Main should not own source page/key build role matching.");
expect(!mainSource.includes("function sourceBuildTypeForKey"), "Main should use simulation source build key lookup instead of a local copy.");
expect(!mainSource.includes("function issueBuildOrderBySourceRole"), "Main should use simulation source role-based fallback build issuing instead of a local copy.");
expect(!mainSource.includes("issueBuildOrderBySourceRole(loadedWorld"), "Main should use simulation fallback build hotkey issuing instead of local source role build calls.");
expect(!mainSource.includes("function sourceBuildTypeForRole"), "Main should use simulation source role-based build lookup instead of a local copy.");
expect(!mainSource.includes("function sourceBuildingProducesMatching"), "Main should use simulation source producer role matching instead of a local copy.");
expect(!mainSource.includes("function sourceBuildingResearchesMatching"), "Main should use simulation source research role matching instead of a local copy.");
expect(hudSource.includes("sourceBuildValuesProduceMatching") && hudSource.includes("sourceBuildValuesResearchMatching"), "HUD should use simulation source build-value producer/research role matching.");
expect(hudSource.includes("sourceBuildValuesDefinitionMatching") && hudSource.includes("sourceBuildValuesUpgradeToMatching"), "HUD should use simulation source build-value definition/upgrade-to role matching.");
expect(!/sourceBuildValues\.has\("unit-/.test(hudSource), "HUD build-page fallback suppression should rely on source build-value role matching instead of stock sourceBuildValues.has ids.");
expect(hudSource.includes("selectedCanResearchMatchingSource(world, selectedUnits"), "HUD should use simulation selected-unit source research capability matching.");
expect(hudSource.includes("selectedCanResearchSpellSource(world, selectedUnits"), "HUD should use simulation selected-unit source spell research capability matching.");
expect(hudSource.includes("selectedCanResearchAny(world, selectedUnits"), "HUD should use simulation selected-unit fallback research capability matching.");
expect(!/typeIds\.has\("unit-(mage-tower|temple-of-the-damned|church|altar-of-storms)"\) && selectedCanResearchAny/.test(hudSource), "HUD caster/holy research fallback visibility should use selected research capability instead of stock producer-id gates.");
expect(hudSource.includes("selectedCanTrainAny(world, selectedUnits"), "HUD should use simulation selected-unit fallback train capability matching.");
expect(hudSource.includes("selectedCanTrainMatching(world, selectedUnits"), "HUD should use simulation selected-unit role train capability matching.");
expect(hudSource.includes("selectedCanBuildAny(world, selectedUnits"), "HUD should use simulation selected-unit fallback build capability matching.");
expect(hudSource.includes("readyUnits.some(canUseHudBuilderCommands)"), "HUD should use simulation builder command capability.");
expect(hudSource.includes("hasAnySourceResearchValue(sourceResearchValues") || hudSource.includes("hasAnySourceResearchValue(sourceUpgradeValues"), "HUD should use simulation source research/upgrade value lookup.");
expect(hudSource.includes("hasSourceResearchValueMatching(world, sourceResearchValues"), "HUD should use simulation source research-value role matching.");
expect(hudSource.includes("hasSourceTrainValueMatching(world, sourceTrainValues"), "HUD should use simulation source train-value role matching.");
expect(hudSource.includes("hasSourceSpellResearchValue(world, sourceResearchValues"), "HUD should use simulation source spell research-value matching.");
expect(!hudSource.includes("function selectedCanResearchMatchingSource"), "HUD should use simulation selected-unit source research capability matching instead of a local copy.");
expect(!hudSource.includes("function selectedCanResearchSpellSource"), "HUD should use simulation selected-unit source spell research capability matching instead of a local copy.");
expect(!hudSource.includes("function selectedCanResearchAny"), "HUD should use simulation fallback research capability matching instead of a local copy.");
expect(!hudSource.includes("function selectedCanTrainAny"), "HUD should use simulation fallback train capability matching instead of a local copy.");
expect(!hudSource.includes("function selectedCanTrainMatching"), "HUD should use simulation role train capability matching instead of a local copy.");
expect(!hudSource.includes("function selectedCanBuildAny"), "HUD should use simulation fallback build capability matching instead of a local copy.");
expect(!hudSource.includes("function canUseHudBuilderCommands"), "HUD should use simulation builder command capability instead of a local copy.");
expect(!hudSource.includes("function hasAnySourceResearchValue"), "HUD should use simulation source research/upgrade value lookup instead of a local copy.");
expect(!hudSource.includes("function hasSourceResearchValueMatching"), "HUD should use simulation source research-value role matching instead of a local copy.");
expect(!hudSource.includes("function hasSourceTrainValueMatching"), "HUD should use simulation source train-value role matching instead of a local copy.");
expect(!hudSource.includes("function hasSourceSpellResearchValue"), "HUD should use simulation source spell research-value matching instead of a local copy.");
expect(ordersSource.includes("canStartSourceBuildPlacementByType(world, unit, button.value)"), "Source build buttons should use simulation source-build type-id placement capability.");
expect(!hudSource.includes("function canSourceBuild"), "HUD should use simulation building placement capability instead of a local source-build wrapper.");
expect(!hudSource.includes("function sourceBuildsProducerMatching"), "HUD should use simulation source build-value producer matching directly.");
expect(!hudSource.includes("function sourceBuildsResearchMatching"), "HUD should use simulation source build-value research matching directly.");
expect(!hudSource.includes("function sourceBuildsDefinitionMatching"), "HUD should use simulation source build-value definition matching directly.");
expect(!hudSource.includes("function sourceBuildsUpgradeToMatching"), "HUD should use simulation source build-value upgrade-to matching directly.");
expect(!hudSource.includes("function isBlacksmithResearchUpgrade"), "HUD should use simulation blacksmith research classification instead of a local copy.");
expect(!hudSource.includes("function isNavalResearchUpgrade"), "HUD should use simulation naval research classification instead of a local copy.");
expect(!hudSource.includes("function sourceBuildDefinitionProducesMatching"), "HUD should use simulation source producer role matching instead of a local copy.");
expect(!hudSource.includes("function sourceBuildDefinitionResearchesMatching"), "HUD should use simulation source research role matching instead of a local copy.");
expect(!hudSource.includes("function sourceBuildDefinitionUpgradesToMatching"), "HUD should use simulation source upgrade-to role matching instead of a local copy.");
expect(!hudSource.includes("sourceButtonAppliesTo(button, buildingTypeId)"), "HUD build fallback suppression should not inspect source button applicability directly.");
expect(!mainSource.includes("function sourceBuildingUpgradesToMatching"), "Main should use simulation source upgrade-to role matching instead of a local copy.");
expect(!mainSource.includes("function isSupplyProviderDefinition"), "Main should use simulation source supply-provider build predicate instead of a local copy.");
expect(!mainSource.includes("function isBaseTownCenterDefinition"), "Main should use simulation source base town-center build predicate instead of a local copy.");
expect(!mainSource.includes("function isWallDefinition"), "Main should use simulation source wall build predicate instead of a local copy.");
expect(!mainSource.includes("function isDefensiveBuildingDefinition"), "Main should use simulation source defensive-building build predicate instead of a local copy.");
expect(hudSource.includes("isDefensiveBuildingDefinition") && hudSource.includes("isOilRefineryDefinition") && hudSource.includes("isSupplyProviderDefinition"), "HUD should import simulation source building classification predicates.");
expect(hudSource.includes("isAdvancedMeleeCombatDefinition") && hudSource.includes("isAirCombatDefinition"), "HUD should import simulation source unit role predicates.");
expect(hudSource.includes("isDemolitionLabDefinition") && hudSource.includes("isDemolitionUnitDefinition") && hudSource.includes("isGoldOrWoodWorkerDefinition"), "HUD should import simulation demolition and worker role predicates.");
expect(hudSource.includes("isNavalCombatOrUtilityDefinition") && hudSource.includes("isNavalRoleDefinition"), "HUD should import simulation naval role predicates still used outside shared train matching.");
expect(hudSource.includes("isOrdinaryBarracksCombatDefinition") && hudSource.includes("isScoutAirDefinition") && hudSource.includes("isSiegeDefinition"), "HUD should import simulation barracks, scout-air, and siege role predicates still used outside shared train matching.");
expect(!hudSource.includes("function isSupplyProviderDefinition"), "HUD should use simulation source supply-provider build predicate instead of a local copy.");
expect(!hudSource.includes("function isOilRefineryDefinition"), "HUD should use simulation source oil-refinery build predicate instead of a local copy.");
expect(!hudSource.includes("function isWallDefinition"), "HUD should use simulation source wall build predicate instead of a local copy.");
expect(!hudSource.includes("function isDefensiveBuildingDefinition"), "HUD should use simulation source defensive-building build predicate instead of a local copy.");
expect(!hudSource.includes("function isGoldOrWoodWorkerDefinition"), "HUD should use simulation gold/wood worker role predicate instead of a local copy.");
expect(!hudSource.includes("function isOrdinaryBarracksCombatDefinition"), "HUD should use simulation ordinary barracks combat role predicate instead of a local copy.");
expect(!hudSource.includes("function isMeleeLandCombatDefinition"), "HUD should use simulation melee land combat role predicate instead of a local copy.");
expect(!hudSource.includes("function isRangedLandCombatDefinition"), "HUD should use simulation ranged land combat role predicate instead of a local copy.");
expect(!hudSource.includes("function isAdvancedMeleeCombatDefinition"), "HUD should use simulation advanced melee combat role predicate instead of a local copy.");
expect(!hudSource.includes("function isCasterDefinition"), "HUD should use simulation caster role predicate instead of a local copy.");
expect(!hudSource.includes("function isAirCombatDefinition"), "HUD should use simulation air combat role predicate instead of a local copy.");
expect(!hudSource.includes("function isDemolitionLabDefinition"), "HUD should use simulation demolition-lab role predicate instead of a local copy.");
expect(!hudSource.includes("function isDemolitionDefinition"), "HUD should use simulation demolition unit role predicate instead of a local copy.");
expect(!hudSource.includes("function isDemolitionUnitDefinition"), "HUD should not recreate the simulation demolition unit role predicate.");
expect(!hudSource.includes("function isSiegeDefinition"), "HUD should use simulation siege role predicate instead of a local copy.");
expect(!hudSource.includes("function isScoutAirDefinition"), "HUD should use simulation scout-air role predicate instead of a local copy.");
expect(!hudSource.includes("function isNavalCombatOrUtilityDefinition"), "HUD should use simulation naval combat/utility role predicate instead of a local copy.");
expect(!hudSource.includes("function isNavalRoleDefinition"), "HUD should use simulation naval role predicate instead of a local copy.");
expect(!hudSource.includes("function isAdvancedMeleeCasterDefinition"), "HUD should use simulation advanced melee caster role predicate instead of a local copy.");
expect(hudSource.includes("townCenterTierForPlayer"), "HUD should import simulation source town-center tier helpers.");
expect(!hudSource.includes("function townCenterTierForPlayer"), "HUD should use simulation source player town-center tiering instead of a local copy.");
expect(!hudSource.includes("function townCenterTier("), "HUD should use simulation source town-center tiering instead of a local copy.");
expect(!hudSource.includes("function sourceTownCenterTier"), "HUD should use simulation source upgrade-chain tiering instead of a local copy.");
expect(hudSource.includes("sourceTowerUpgradeTargetForTypes"), "HUD should use simulation source tower upgrade target resolution.");
expect(hudSource.includes("sourceTownUpgradeTargetForTypes"), "HUD should use simulation source town-center upgrade target resolution.");
expect(hudSource.includes("const sourceTownUpgradeTarget = sourceTownUpgradeTargetForTypes(world, typeIds, selectedPlayer);"), "HUD generic town-center upgrade visibility should resolve a source upgrade target.");
expect(hudSource.includes("const townUpgradeTargets = sourceTownUpgradeTarget ? [sourceTownUpgradeTarget] : [\"unit-keep\", \"unit-castle\", \"unit-stronghold\", \"unit-fortress\"];"), "HUD generic town-center upgrade visibility should gate against the source target before stock hall upgrades.");
expect(!hudSource.includes("sourceTownUpgradeTarget || typeIds.has(\"unit-town-hall\") || typeIds.has(\"unit-keep\") || typeIds.has(\"unit-great-hall\") || typeIds.has(\"unit-stronghold\")"), "HUD generic town-center upgrade visibility should not require stock hall ids.");
expect(hudSource.includes("if (sourceTownUpgradeTarget) {"), "HUD generic town-center upgrade visibility should use source upgrade targets.");
expect(!hudSource.includes('typeIds.has("unit-town-hall")'), "HUD town-center upgrade icon fallback should not branch on the stock town-hall id.");
expect(!hudSource.includes('typeIds.has("unit-keep")'), "HUD town-center upgrade icon fallback should not branch on the stock keep id.");
expect(!hudSource.includes('typeIds.has("unit-great-hall")'), "HUD town-center upgrade icon fallback should not branch on the stock great-hall id.");
expect(!hudSource.includes('typeIds.has("unit-stronghold")'), "HUD town-center upgrade icon fallback should not branch on the stock stronghold id.");
expect(hudSource.includes('return townTier >= 2 ? raceUnitIcon("unit-castle", "unit-fortress") : raceUnitIcon("unit-keep", "unit-stronghold");'), "HUD town-center upgrade icon fallback should use player town tier and race context.");
expect(hudSource.includes("const sourceGuardTowerTarget = sourceTowerUpgradeTargetForTypes(world, typeIds, selectedPlayer, \"guard\");"), "HUD tower fallback visibility should resolve a source guard-tower upgrade target.");
expect(hudSource.includes("const sourceCannonTowerTarget = sourceTowerUpgradeTargetForTypes(world, typeIds, selectedPlayer, \"cannon\");"), "HUD tower fallback visibility should resolve a source cannon-tower upgrade target.");
expect(!hudSource.includes("sourceGuardTowerTarget || sourceCannonTowerTarget || typeIds.has(\"unit-human-watch-tower\") || typeIds.has(\"unit-orc-watch-tower\")"), "HUD tower fallback visibility should not require stock watch-tower ids.");
expect(hudSource.includes("if (sourceGuardTowerTarget || sourceCannonTowerTarget) {"), "HUD tower fallback visibility should use source upgrade targets.");
expect(hudSource.includes("sourceWorkerTrainTargetForTypes"), "HUD should use simulation source worker train target resolution.");
expect(hudSource.includes("sourceTrainIconForHudCommand(world, typeIds, playerId, command)"), "HUD should use simulation source HUD train icon resolution.");
expect(hudSource.includes("sourceFallbackTrainIconForHudCommand(world, selectedUnits, command)"), "HUD should use simulation source HUD fallback train icon resolution.");
expect(hudSource.includes("sourceBuildIconForHudCommand(world, typeIds, playerId, command)"), "HUD should use simulation source HUD build icon resolution.");
expect(hudSource.includes("sourceResearchIconForHudCommand(world, typeIds, playerId, command)"), "HUD should use simulation source HUD research icon resolution.");
expect(hudSource.includes("sourceFallbackResearchIconForHudCommand(world, selectedUnits, command)"), "HUD should use selected-unit source HUD research icon resolution.");
expect(hudSource.includes("const trainIcon = (command: string, fallback: string | null): string | null => (\n    sourceTrainIconForHudCommand(world, typeIds, playerId, command)\n    ?? sourceFallbackTrainIconForHudCommand(world, selectedUnits, command)\n    ?? (hasSourceTrainButtonsForTypes(world, typeIds, playerId) ? null : fallback)\n  );"), "HUD train icons should suppress stock icon fallbacks when source train buttons exist.");
expect(hudSource.includes("const buildIcon = (command: string, fallback: string | null): string | null => (\n    sourceBuildIconForHudCommand(world, typeIds, playerId, command)\n    ?? (hasSourceBuildButtonsForTypes(world, typeIds, playerId) ? null : fallback)\n  );"), "HUD build icons should suppress stock icon fallbacks when source build buttons exist.");
expect(hudSource.includes("const researchIcon = (command: string, fallback: string | null): string | null => (\n    sourceResearchIconForHudCommand(world, typeIds, playerId, command)\n    ?? sourceFallbackResearchIconForHudCommand(world, selectedUnits, command)\n    ?? (hasSourceResearchButtonsForTypes(world, typeIds, playerId) ? null : fallback)\n  );"), "HUD research icons should suppress stock icon fallbacks when source research buttons exist.");
expect(hudSource.includes("const exactTrainIcon = (unitTypeId: string): string | null => {"), "HUD exact train icons should share source-button fallback suppression.");
expect(hudSource.includes('case "build-oil-platform":\n      return buildIcon(commandId, raceUnitIcon("unit-human-oil-platform", "unit-orc-oil-platform"));'), "HUD oil-platform icon fallback should suppress stock platform ids when source build buttons exist.");
expect(!hudSource.includes("function sourceTrainIconForCommand"), "HUD should use simulation source HUD train icon resolution directly instead of a local icon wrapper.");
expect(!hudSource.includes("function sourceFallbackTrainIconForCommand"), "HUD should use simulation source HUD fallback train icon resolution directly instead of a local icon wrapper.");
expect(!hudSource.includes("function sourceBuildIconForCommand"), "HUD should use simulation source HUD build icon resolution directly instead of a local icon wrapper.");
expect(!hudSource.includes("function sourceResearchIconForCommand"), "HUD should use simulation source HUD research icon resolution directly instead of a local icon wrapper.");
expect(hudSource.includes("const hasSourceBarracksProducer = selectedUnits.some((unit) => selectedCanTrainMatching(world, [unit], isOrdinaryBarracksCombatDefinition));"), "HUD barracks fallback visibility should recognize source barracks-style producers.");
expect(!hudSource.includes("hasSourceBarracksProducer || typeIds.has(\"unit-human-barracks\") || typeIds.has(\"unit-orc-barracks\")"), "HUD barracks fallback visibility should not require stock barracks ids.");
expect(hudSource.includes("if (hasSourceBarracksProducer) {"), "HUD barracks fallback visibility should use source trainability.");
expect(!hudSource.includes('typeIds.has("unit-farm") || typeIds.has("unit-pig-farm")'), "HUD critter fallback visibility should not require stock farm ids.");
expect(hudSource.includes('if (!sourceTrainValues.has("unit-critter") && allowStockTrainFallbacks && selectedCanTrainAny(world, selectedUnits, ["unit-critter"])) {\n    commands.push({ id: "train-critter", key: "C", label: "Critter" });'), "HUD critter fallback visibility should use selected-unit train capability only when source train buttons are absent.");
expect(hudSource.includes("isOrdinaryBarracksCombatDefinition(definition) && isMeleeLandCombatDefinition(definition) && !isSourceConversionTarget(world, definition.id)"), "HUD melee fallback suppression should use source ordinary-melee role classification.");
expect(hudSource.includes("isOrdinaryBarracksCombatDefinition(definition) && isRangedLandCombatDefinition(definition) && !isSourceConversionTarget(world, definition.id)"), "HUD ranged fallback suppression should use source ordinary-ranged role classification.");
expect(hudSource.includes("isOrdinaryBarracksCombatDefinition(definition) && isRangedLandCombatDefinition(definition) && isSourceConversionTarget(world, definition.id)"), "HUD ranged-veteran fallback suppression should use source conversion-target role classification.");
expect(hudSource.includes("isAdvancedMeleeCombatDefinition(definition) && isSourceConversionTarget(world, definition.id)"), "HUD cavalry-veteran fallback suppression should use source advanced-melee conversion-target classification.");
expect(hudSource.includes("isAdvancedMeleeCombatDefinition(definition) && !isSourceConversionTarget(world, definition.id)"), "HUD cavalry fallback suppression should use source advanced-melee non-conversion classification.");
expect(hudSource.includes("const hasSourceAdvancedMeleeProducer = selectedUnits.some((unit) => selectedCanTrainMatching(world, [unit], isAdvancedMeleeCombatDefinition));"), "HUD advanced melee fallback visibility should recognize source advanced-melee producers.");
expect(!hudSource.includes("selectedUnits.some((unit) => selectedCanTrainMatching(world, [unit], isAdvancedMeleeCombatDefinition)) || typeIds.has(\"unit-stables\") || typeIds.has(\"unit-ogre-mound\")"), "HUD advanced melee fallback visibility should not require stock stables/ogre-mound ids.");
expect(hudSource.includes("if (hasSourceAdvancedMeleeProducer) {"), "HUD advanced melee fallback visibility should use source trainability.");
expect(hudSource.includes('key: selectedRace === "human" ? "R" : "B"'), "HUD ranged-veteran fallback key should use selected race metadata instead of stock barracks ids.");
expect(hudSource.includes('key: selectedRace === "human" ? "P" : "O"'), "HUD cavalry-veteran fallback key should use selected race metadata instead of stock barracks ids.");
for (const navalRole of ["tanker", "destroyer", "warship", "submarine", "transport"]) {
  expect(hudSource.includes(`!hasSourceTrainValueMatching(world, sourceTrainValues, (definition) => isNavalRoleDefinition(definition, "${navalRole}"))`), `HUD ${navalRole} fallback suppression should use source naval role classification.`);
}
expect(hudSource.includes("const hasSourceNavalProducer = selectedUnits.some((unit) => selectedCanTrainMatching(world, [unit], isNavalCombatOrUtilityDefinition));"), "HUD naval fallback visibility should recognize source naval producers.");
expect(!hudSource.includes("hasSourceNavalProducer || typeIds.has(\"unit-human-shipyard\") || typeIds.has(\"unit-orc-shipyard\")"), "HUD naval fallback visibility should not require stock shipyard ids.");
expect(hudSource.includes("if (hasSourceNavalProducer) {"), "HUD naval fallback visibility should use source trainability.");
expect(hudSource.includes("const hasSourceFoundry = selectedCanResearchMatchingSource(world, selectedUnits, (upgradeId) => isNavalResearchUpgrade(world, upgradeId));"), "HUD foundry fallback visibility should recognize source naval research producers.");
expect(!hudSource.includes("hasSourceFoundry || typeIds.has(\"unit-human-foundry\") || typeIds.has(\"unit-orc-foundry\")"), "HUD foundry fallback visibility should not require stock foundry ids.");
expect(hudSource.includes("if (hasSourceFoundry) {"), "HUD foundry fallback visibility should use source research capability.");
expect(hudSource.includes("const hasSourceAirProducer = selectedUnits.some((unit) => selectedCanTrainMatching(world, [unit], isAirCombatDefinition));"), "HUD air fallback visibility should recognize source air producers.");
expect(!hudSource.includes("hasSourceAirProducer || typeIds.has(\"unit-gryphon-aviary\") || typeIds.has(\"unit-dragon-roost\")"), "HUD air fallback visibility should not require stock air producer ids.");
expect(hudSource.includes("if (hasSourceAirProducer) {"), "HUD air fallback visibility should use source trainability.");
expect(hudSource.includes("const hasSourceDemolitionProducer = selectedUnits.some((unit) => selectedCanTrainMatching(world, [unit], isDemolitionLabDefinition));"), "HUD demolition/siege/scout fallback visibility should recognize source demolition-lab producers.");
expect(!hudSource.includes("hasSourceDemolitionProducer || typeIds.has(\"unit-inventor\") || typeIds.has(\"unit-alchemist\")"), "HUD demolition/siege/scout fallback visibility should not require stock inventor/alchemist ids.");
expect(hudSource.includes("if (hasSourceDemolitionProducer) {"), "HUD demolition/siege/scout fallback visibility should use source trainability.");
expect(hudSource.includes("const hasSourceBlacksmith = selectedCanResearchMatchingSource(world, selectedUnits, (upgradeId) => isBlacksmithResearchUpgrade(world, upgradeId));"), "HUD blacksmith fallback visibility should recognize source blacksmith research producers.");
expect(!hudSource.includes("hasSourceBlacksmith || typeIds.has(\"unit-human-blacksmith\") || typeIds.has(\"unit-orc-blacksmith\")"), "HUD blacksmith fallback visibility should not require stock blacksmith ids.");
expect(hudSource.includes("if (hasSourceBlacksmith) {"), "HUD blacksmith fallback visibility should use source research capability.");
expect(hudSource.includes("const hasSourceLumberMill = selectedCanResearchMatchingSource(world, selectedUnits, (upgradeId) => isLumberMillResearchUpgrade(world, upgradeId));"), "HUD lumber-mill fallback visibility should recognize source lumber-mill research producers.");
expect(!hudSource.includes("hasSourceLumberMill || typeIds.has(\"unit-elven-lumber-mill\") || typeIds.has(\"unit-troll-lumber-mill\")"), "HUD lumber-mill fallback visibility should not require stock lumber-mill ids.");
expect(hudSource.includes("if (hasSourceLumberMill) {"), "HUD lumber-mill fallback visibility should use source research capability.");
expect(!hudSource.includes("typeIds.has(\"unit-human-oil-tanker\") || typeIds.has(\"unit-orc-oil-tanker\")"), "HUD oil-platform visibility should not require stock tanker ids.");
expect(hudSource.includes("if (allowStockBuildFallbacks && canEnterPendingWorldCommand(world, selectedReadyUnitIds, \"build-oil-platform\", selectedPlayer)) {\n    commands.push({ id: \"build-oil-platform\", key: \"U\", label: \"Platform\" });"), "HUD oil-platform visibility should use simulation placement capability only when source build buttons are absent.");
for (const predicate of ["isCasterDefinition", "isAirCombatDefinition", "isDemolitionUnitDefinition", "isSiegeDefinition", "isScoutAirDefinition"]) {
  expect(hudSource.includes(`!hasSourceTrainValueMatching(world, sourceTrainValues, ${predicate})`), `HUD ${predicate} fallback suppression should use source train-role classification.`);
}
expect(!hudSource.includes("function sourceTowerUpgradeButtonMatchesRole"), "HUD should use simulation source tower upgrade role matching instead of a local copy.");
expect(!hudSource.includes("function sourceTowerUpgradeTarget"), "HUD should use simulation source tower upgrade target resolution instead of a local copy.");
expect(!hudSource.includes("function sourceTownUpgradeTarget"), "HUD should use simulation source town-center upgrade target resolution instead of a local copy.");
expect(!hudSource.includes("function sourceWorkerTrainTarget"), "HUD should use simulation source worker train target resolution instead of a local copy.");
expect(hudSource.includes('return exactTrainIcon("unit-attack-peasant");'), "HUD minuteman icon fallback should suppress stock train icons when source train buttons exist.");
expect(hudSource.includes('return exactTrainIcon("unit-critter");'), "HUD critter icon fallback should suppress stock train icons when source train buttons exist.");
for (const [command, fallback] of [
  ["train-cavalry", 'raceUnitIcon("unit-knight", "unit-ogre")'],
  ["train-tanker", 'raceUnitIcon("unit-human-oil-tanker", "unit-orc-oil-tanker")'],
  ["train-destroyer", 'raceUnitIcon("unit-human-destroyer", "unit-orc-destroyer")'],
  ["train-warship", 'raceUnitIcon("unit-battleship", "unit-ogre-juggernaught")'],
  ["train-transport", 'raceUnitIcon("unit-human-transport", "unit-orc-transport")'],
  ["train-submarine", 'raceUnitIcon("unit-human-submarine", "unit-orc-submarine")'],
  ["train-caster", 'raceUnitIcon("unit-mage", "unit-death-knight")'],
  ["train-air", 'raceUnitIcon("unit-gryphon-rider", "unit-dragon")'],
  ["train-demolition", 'raceUnitIcon("unit-dwarves", "unit-goblin-sappers")'],
  ["train-siege", 'raceUnitIcon("unit-ballista", "unit-catapult")'],
  ["train-scout-air", 'raceUnitIcon("unit-balloon", "unit-zeppelin")']
]) {
  expect(hudSource.includes(`case "${command}":\n      return trainIcon(commandId, ${fallback});`), `HUD icon fallback for ${command} should suppress stock ids when source train buttons exist.`);
}
expect(!hudSource.includes("function sourceBuildTargetForCommand"), "HUD should use simulation source HUD build icon resolution instead of a local target wrapper.");
expect(!hudSource.includes("function sourceResearchTargetForCommand"), "HUD should use simulation source HUD research icon resolution instead of a local target wrapper.");
expect(!hudSource.includes("function sourceTrainTargetForCommand"), "HUD should use simulation source HUD train icon resolution instead of a local target wrapper.");
expect(!hudSource.includes("function sourceFallbackTrainTargetForCommand"), "HUD should use simulation source HUD fallback train icon resolution instead of a local target wrapper.");
expect(!hudSource.includes("function sourceUpgradeButtonMatchesRole"), "HUD should not recreate simulation source tower upgrade role matching.");
expect(!hudSource.includes("function isCannonTowerUpgradeDefinition"), "HUD should use simulation cannon tower classification instead of a local copy.");
expect(hudSource.includes("isMeleeWeaponResearchUpgrade") && hudSource.includes("isShieldResearchUpgrade") && hudSource.includes("isSiegeResearchUpgrade"), "HUD should import simulation blacksmith research classifiers.");
expect(hudSource.includes("isLumberMillResearchUpgrade") && hudSource.includes("isHolyResearchUpgradeId as isHolyResearchUpgrade"), "HUD should import simulation lumber-mill and holy research classifiers.");
expect(hudSource.includes("isShipArmorResearchUpgradeId as isShipArmorResearchUpgrade") && hudSource.includes("isShipCannonResearchUpgradeId as isShipCannonResearchUpgrade"), "HUD should import simulation ship research classifiers.");
expect(!hudSource.includes("function isMeleeWeaponResearchUpgrade"), "HUD should use simulation melee weapon research classification instead of a local copy.");
expect(!hudSource.includes("function isShieldResearchUpgrade"), "HUD should use simulation shield research classification instead of a local copy.");
expect(!hudSource.includes("function isSiegeResearchUpgrade"), "HUD should use simulation siege research classification instead of a local copy.");
expect(!hudSource.includes("function upgradeModifiesMatchingUnits"), "HUD should use simulation upgrade modifier research classification instead of a local copy.");
expect(!hudSource.includes("function isLumberMillResearchUpgrade"), "HUD should use simulation lumber-mill research classification instead of a local copy.");
expect(!hudSource.includes("function isHolyResearchUpgrade"), "HUD should use simulation holy research classification instead of a local copy.");
expect(!hudSource.includes("function isHolyTransformationResearchUpgrade"), "HUD should use simulation holy transformation research classification instead of a local copy.");
expect(!hudSource.includes("function isHolySupportResearchUpgrade"), "HUD should use simulation holy support research classification instead of a local copy.");
expect(!hudSource.includes("function sourceHolySupportSpellDependencyResearch"), "HUD should use simulation holy support spell dependency matching instead of a local copy.");
expect(!hudSource.includes("function sourceSpellDependencyResearchForRole"), "HUD should use simulation spell-dependency research role matching instead of a local copy.");
expect(!hudSource.includes("function isShipCannonResearchUpgrade"), "HUD should use simulation ship cannon research classification instead of a local copy.");
expect(!hudSource.includes("function isShipArmorResearchUpgrade"), "HUD should use simulation ship armor research classification instead of a local copy.");
expect(hudSource.includes("sourceTrainIconForHudCommand"), "HUD should consume source conversion target classification through simulation train icon resolution.");
expect(!hudSource.includes("function isSourceConversionTarget"), "HUD should use simulation source conversion target classification instead of a local copy.");
expect(ordersSource.includes("compareSourceButtons"), "Simulation source button selection should use shared source button ordering.");
expect(!hudSource.includes("sort((a, b) => a.level - b.level"), "HUD should use simulation source button ordering instead of local button sort copies.");
expect(!hudSource.includes("sort((left, right) => left.level - right.level"), "HUD should use simulation source button ordering instead of local button sort copies.");
expect(!mainSource.includes("function townCenterTier"), "Main should use simulation source base town-center predicate instead of local town-center tiering.");
expect(!mainSource.includes("function sourceTownCenterTier"), "Main should use simulation source base town-center predicate instead of local source tiering.");
expect(!mainSource.includes("function sourceBuildButtonMatchesPage"), "Main should not own source build button page matching.");
expect(!mainSource.includes("function buildButtonPage"), "Main should not own source build page classification.");
expect(ordersSource.includes("export function canEnterPendingWorldCommand(world: WorldState, unitIds: string[], command: string, playerId = world.visibilityPlayer): boolean"), "Simulation should expose selected pending world-command capability checks.");
expect(ordersSource.includes("export function sourcePendingWorldCommandForKey(world: WorldState, code: string, unitIds: string[], playerId = world.visibilityPlayer): PendingWorldCommandName | null"), "Simulation should expose source pending world-command hotkey resolution.");
expect(selectionHotkeySource.includes("sourcePendingWorldCommandForKey(world, code, selectedUnitIds)"), "Selection hotkey path should call simulation source pending world-command hotkey resolution.");
expect(!mainSource.includes("function sourcePendingWorldCommandForKey"), "Main should use simulation source pending world-command hotkey resolution instead of a local copy.");
expect(!mainSource.includes("function pendingCommandForSourceAction"), "Main should not own source pending action mapping.");
expect(ordersSource.includes("export function issueSourceInstantSpellByKey(world: WorldState, unit: WorldUnit, code: string): boolean | null"), "Simulation should expose source instant spell hotkey issuing.");
expect(ordersSource.includes("export function issueSourceInstantActionByKey(world: WorldState, unit: WorldUnit, code: string, queue = false): boolean | null"), "Simulation should expose source instant action hotkey issuing.");
expect(ordersSource.includes('const SOURCE_INSTANT_ACTIONS = new Set(["stop", "stand-ground", "explore", "return-goods"])'), "Simulation should own source instant action set.");
expect(commandKeySource.includes("issueSourceInstantSpellByKey(loadedWorld, unit, code)"), "Command-key path should call simulation source instant spell hotkey issuing.");
expect(commandKeySource.includes("issueSourceInstantActionByKey(loadedWorld, unit, code, queue)"), "Command-key path should call simulation source instant action hotkey issuing.");
expect(!mainSource.includes("function issueSourceInstantSpellByKey"), "Main should use simulation source instant spell hotkey issuing instead of a local copy.");
expect(!mainSource.includes("function issueSourceInstantActionByKey"), "Main should use simulation source instant action hotkey issuing instead of a local copy.");
expect(!mainSource.includes("function issueSourceInstantAction"), "Main should not own source instant action issuing.");
expect(!mainSource.includes("const SOURCE_INSTANT_ACTIONS"), "Main should not own source instant action set.");
expect(ordersSource.includes("export function issueSourceResearchByKey(world: WorldState, unit: WorldUnit, code: string, upgrades: WargusUpgrade[] = world.upgradeDefinitions, queue = false): boolean | null"), "Simulation should expose source research hotkey issuing.");
expect(ordersSource.includes("export function issueSourceTrainByKey(world: WorldState, unit: WorldUnit, code: string, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean | null"), "Simulation should expose source train hotkey issuing.");
expect(ordersSource.includes("export function issueSourceUpgradeByKey(world: WorldState, unit: WorldUnit, code: string, unitDefinitions: WargusUnit[] = world.unitDefinitions, queue = false): boolean | null"), "Simulation should expose source upgrade hotkey issuing.");
expect(ordersSource.includes("export function issueTrainBySourceRole(world: WorldState, unit: WorldUnit, matchesUnit: (definition: WargusUnit) => boolean, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean | null"), "Simulation should expose source role-based fallback train issuing.");
expect(ordersSource.includes("const sourceCandidate = sourceTrainCandidatesForBuilding(world, unit)"), "Source role-based fallback train issuing should prefer source train-button candidates.");
expect(ordersSource.includes("left.button.level - right.button.level || left.button.pos - right.button.pos"), "Source role-based fallback train issuing should preserve source command-card order before compatibility scans.");
expect(ordersSource.includes("function hasSourceTrainButtonsForUnit(world: WorldState, unit: WorldUnit): boolean"), "Simulation should detect unit-level source train buttons before direct stock train hotkey fallbacks.");
expect(ordersSource.includes("if (hasSourceTrainButtonsForUnit(world, unit)) {\n    return false;\n  }\n  const unitTypeId = world.unitDefinitions"), "Source role-based train hotkeys should not fall through to stock ids when source train buttons exist.");
expect(ordersSource.includes("function hasSourceResearchButtonsForUnit(world: WorldState, unit: WorldUnit): boolean"), "Simulation should detect unit-level source research buttons before direct stock research hotkey fallbacks.");
expect(ordersSource.includes("return hasSourceResearchButtonsForUnit(world, unit) ? null : fallbackSequence.find((upgradeId) => canIssueResearchAt(world, unit, upgradeId, world.upgradeDefinitions, queue)) ?? null;"), "Source role-based research hotkeys should not fall through to stock upgrade ids when source research buttons exist.");
expect(ordersSource.includes("export function issueFallbackFacilityCommandByKey(world: WorldState, unit: WorldUnit, code: string, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean | null"), "Simulation should expose fallback facility hotkey issuing.");
expect(ordersSource.includes("export function issueFallbackUtilityCommandByKey(world: WorldState, unit: WorldUnit, code: string, unitDefinitions: WargusUnit[] = world.unitDefinitions, phase: \"early\" | \"late\" = \"early\", queue = false): boolean | null"), "Simulation should expose queue-aware fallback utility hotkey issuing.");
expect(ordersSource.includes("export function issueFallbackTrainCommandByKey(world: WorldState, unit: WorldUnit, code: string, unitDefinitions: WargusUnit[] = world.unitDefinitions, phase: \"early\" | \"mid\" | \"late\" = \"early\"): boolean | null"), "Simulation should expose phased fallback train hotkey issuing.");
expect(ordersSource.includes("export function issueFallbackResearchCommandByKey(world: WorldState, unit: WorldUnit, code: string, upgrades: WargusUpgrade[] = world.upgradeDefinitions, queue = false): boolean | null"), "Simulation should expose fallback research hotkey issuing.");
expect(commandKeySource.includes("issueSourceTrainByKey(loadedWorld, unit, code, loadedManifest.units)"), "Command-key path should call simulation source train hotkey issuing.");
expect(commandKeySource.includes("issueSourceUpgradeByKey(loadedWorld, unit, code, loadedManifest.units, queue)"), "Command-key path should call simulation source upgrade hotkey issuing.");
expect(commandKeySource.includes("issueSourceResearchByKey(loadedWorld, unit, code, loadedManifest.upgrades, queue)"), "Command-key path should call simulation source research hotkey issuing.");
expect(commandKeySource.includes("issueFallbackFacilityCommandByKey(loadedWorld, unit, code, loadedManifest.units)"), "Command-key path should call simulation fallback facility hotkey issuing.");
expect(commandKeySource.includes("issueFallbackResearchCommandByKey(loadedWorld, unit, code, loadedManifest.upgrades, queue)"), "Command-key path should call simulation fallback research hotkey issuing.");
expect(commandKeySource.includes("issueCommandKey(code: string, loadedWorld: WorldState, loadedManifest: WargusManifest, unitIds: string[], input: { shiftKey?: boolean } = {})"), "Command-key path should accept Shift queue state.");
expect(selectionHotkeySource.includes("issueCommandKey(code, world, manifest, selectedUnitIds, { shiftKey: input.shiftKey === true })"), "Selection hotkey path should forward Shift queue state to command-key issuing.");
expect(commandKeySource.includes('issueFallbackUtilityCommandByKey(loadedWorld, unit, code, loadedManifest.units, "early", queue)'), "Command-key path should call simulation early fallback utility hotkey issuing with queue state.");
expect(commandKeySource.includes('issueFallbackUtilityCommandByKey(loadedWorld, unit, code, loadedManifest.units, "late", queue)'), "Command-key path should call simulation late fallback utility hotkey issuing with queue state.");
expect(ordersSource.includes('return queue ? issueQueueReturnGoodsOrder(world, unit.id) : issueReturnGoodsOrder(world, unit.id);'), "Fallback return-goods hotkey should preserve Shift queue state.");
expect(ordersSource.includes('return queue ? issueQueueExploreOrder(world, unit.id) : issueExploreOrder(world, unit.id);'), "Fallback explore hotkey should preserve Shift queue state.");
expect(commandKeySource.includes("issueFallbackTrainCommandByKey(loadedWorld, unit, code, loadedManifest.units)"), "Command-key path should call simulation early fallback train hotkey issuing.");
expect(commandKeySource.includes('issueFallbackTrainCommandByKey(loadedWorld, unit, code, loadedManifest.units, "mid")'), "Command-key path should call simulation mid fallback train hotkey issuing.");
expect(commandKeySource.includes('issueFallbackTrainCommandByKey(loadedWorld, unit, code, loadedManifest.units, "late")'), "Command-key path should call simulation late fallback train hotkey issuing.");
expect(!mainSource.includes("function issueSourceTrainByKey"), "Main should use simulation source train hotkey issuing instead of a local copy.");
expect(!mainSource.includes("function issueSourceUpgradeByKey"), "Main should use simulation source upgrade hotkey issuing instead of a local copy.");
expect(!mainSource.includes("function issueSourceResearchByKey"), "Main should use simulation source research hotkey issuing instead of a local copy.");
expect(!mainSource.includes("function issueTrainBySourceRole"), "Main should use simulation source role-based fallback train issuing instead of a local copy.");
expect(!mainSource.includes("issueTrainBySourceRole(loadedWorld"), "Main should use simulation fallback train hotkey issuing instead of local source role fallback train calls.");
expect(!mainSource.includes("function isTownCenterUnit"), "Main should use simulation fallback facility hotkey issuing instead of a local town-center predicate.");
expect(!mainSource.includes("function isWatchTowerUnit"), "Main should use simulation fallback facility hotkey issuing instead of a local watch-tower predicate.");
expect(!mainSource.includes("unit.canCastSpells.includes(\"spell-suicide-bomber\")"), "Main should use simulation fallback utility hotkey issuing instead of local detonate checks.");
expect(!mainSource.includes("canStartOilPlatformPlacement(loadedWorld, unit)"), "Main should use simulation fallback utility hotkey issuing instead of local oil-platform fallback checks.");
expect(!mainSource.includes("function isSourceConversionTarget"), "Main should use simulation fallback train hotkey issuing instead of local source conversion checks.");
expect(!mainSource.includes("issueTrainBarracksUnitOrder(loadedWorld, unitId"), "Main should use simulation fallback train hotkey issuing instead of direct barracks fallback calls.");
expect(!mainSource.includes("issueTrainNavalUnitOrder(loadedWorld, unitId"), "Main should use simulation fallback train hotkey issuing instead of direct naval fallback calls.");
expect(!mainSource.includes("issueTrainCasterOrder(loadedWorld, unitId"), "Main should use simulation fallback train hotkey issuing instead of direct caster fallback calls.");
expect(!mainSource.includes("issueTrainAirUnitOrder(loadedWorld, unitId"), "Main should use simulation fallback train hotkey issuing instead of direct air fallback calls.");
expect(!mainSource.includes("issueTrainDemolitionOrder(loadedWorld, unitId"), "Main should use simulation fallback train hotkey issuing instead of direct demolition fallback calls.");
expect(!mainSource.includes("issueTrainScoutAirOrder(loadedWorld, unitId"), "Main should use simulation fallback train hotkey issuing instead of direct scout-air fallback calls.");
expect(!mainSource.includes("issueTrainSiegeUnitOrder(loadedWorld, unitId"), "Main should use simulation fallback train hotkey issuing instead of direct siege fallback calls.");
expect(!mainSource.includes("nextResearchUpgradeByRoleWithFallbacks(loadedWorld"), "Main should use simulation fallback research hotkey issuing instead of local research role fallback calls.");
expect(!mainSource.includes("nextSpellResearchUpgrade(loadedWorld"), "Main should use simulation fallback research hotkey issuing instead of local spell research fallback calls.");
expect(!mainSource.includes("issueResearchOrder(loadedWorld"), "Main should use simulation fallback research hotkey issuing instead of direct research fallback calls.");
expect(!mainSource.includes("issuePolymorphOrder(loadedWorld"), "Main should use simulation fallback research hotkey issuing instead of direct polymorph fallback calls.");
expect(!mainSource.includes("sourceBuildingResearchesSpell(loadedWorld"), "Main should use simulation fallback research hotkey issuing instead of local spell-research checks.");
expect(!ordersSource.includes('sourceBuildingResearchesMatching(world, unit.typeId, isShipCannonResearchUpgradeId, unit.player) || unit.typeId === "unit-human-foundry" || unit.typeId === "unit-orc-foundry"'), "Ship cannon research hotkey should use source/fallback research eligibility instead of stock foundry id gates.");
expect(!ordersSource.includes('sourceBuildingResearchesMatching(world, unit.typeId, isShipArmorResearchUpgradeId, unit.player) || unit.typeId === "unit-human-foundry" || unit.typeId === "unit-orc-foundry"'), "Ship armor research hotkey should use source/fallback research eligibility instead of stock foundry id gates.");
expect(!ordersSource.includes("producerTypeId: \"unit-mage-tower\"") && !ordersSource.includes("producerTypeId: \"unit-temple-of-the-damned\"") && !ordersSource.includes("producerTypeId: \"unit-church\"") && !ordersSource.includes("producerTypeId: \"unit-altar-of-storms\""), "Simulation spell research hotkey fallback should not gate caster/holy research by stock producer ids.");
expect(!ordersSource.includes('sourceBuildingResearchesSpell(world, unit.typeId, "spell-polymorph", "upgrade-polymorph", unit.player) || unit.typeId === "unit-mage-tower"'), "Polymorph research hotkey should use source/fallback research eligibility instead of the stock mage-tower id gate.");
expect(!ordersSource.includes('sourceBuildingResearchesMatching(world, unit.typeId, (upgradeId) => isHolySupportResearchUpgradeId(world, upgradeId), unit.player) || unit.typeId === "unit-church" || unit.typeId === "unit-altar-of-storms"'), "Holy support research hotkey should use source/fallback research eligibility instead of stock church/altar id gates.");
expect(ordersSource.includes("export function issueSourceTrainHudCommand(world: WorldState, unitIds: string[], unitTypeId: string, unitDefinitions: WargusUnit[] = world.unitDefinitions"), "Simulation should expose source HUD train issuing.");
expect(ordersSource.includes("export function issueSourceUpgradeHudCommand(world: WorldState, unitIds: string[], unitTypeId: string, unitDefinitions: WargusUnit[] = world.unitDefinitions"), "Simulation should expose source HUD upgrade issuing.");
expect(ordersSource.includes("export function issueSourceResearchHudCommand(world: WorldState, unitIds: string[], upgradeId: string, upgrades: WargusUpgrade[] = world.upgradeDefinitions"), "Simulation should expose source HUD research issuing.");
expect(hudCommandExecutionSource.includes('issueSourceTrainHudCommand(world, selectedUnitIds, command.slice("source-train:".length), manifest.units)'), "HUD command execution should call simulation source HUD train issuing.");
expect(hudCommandExecutionSource.includes('issueSourceUpgradeHudCommand(world, selectedUnitIds, command.slice("source-upgrade:".length), manifest.units, world.visibilityPlayer, input.shiftKey === true)'), "HUD command execution should call simulation source HUD upgrade issuing.");
expect(hudCommandExecutionSource.includes('issueSourceResearchHudCommand(world, selectedUnitIds, command.slice("source-research:".length), manifest.upgrades, world.visibilityPlayer, input.shiftKey === true)'), "HUD command execution should call simulation source HUD research issuing.");
expect(!mainSource.includes("function issueSourceTrainHudCommand"), "Main should use simulation source HUD train issuing instead of a local copy.");
expect(!mainSource.includes("function issueSourceUpgradeHudCommand"), "Main should use simulation source HUD upgrade issuing instead of a local copy.");
expect(!mainSource.includes("function issueSourceResearchHudCommand"), "Main should use simulation source HUD research issuing instead of a local copy.");
expect(ordersSource.includes('if (command === "build-oil-platform")'), "Simulation pending world-command capability should cover oil platform placement.");
expect(ordersSource.includes("export function executeDirectHudCommand(world: WorldState, unitIds: string[], command: string, playerId = world.visibilityPlayer, queue = false): boolean | null"), "Simulation should expose direct HUD command issuing.");
expect(ordersSource.includes("function issueSourceDirectHudCommand(world: WorldState, unitIds: string[], command: string"), "Simulation should own source direct HUD command issuing.");
expect(ordersSource.includes("export function sourceActionForDirectHudCommand(command: string): string | null"), "Simulation should expose source direct HUD action mapping.");
expect(ordersSource.includes("export function sourceActionForHudCommand(world: WorldState, command: string, playerId: number, typeIds: Iterable<string>, selectedUnits: WorldUnit[] = []): { action: string; value?: string } | null"), "Simulation should expose source HUD command action/value mapping.");
expect(ordersSource.includes("sourceActionForHudCommand(world, commandId, playerId, typeIds, selectedUnits)"), "Simulation source button lookup should use simulation source HUD command action/value mapping.");
expect(ordersSource.includes("const executableAction = sourceHudCommandForAction(source.action) !== null;"), "Simulation source HUD button lookup should identify executable source action buttons.");
expect(ordersSource.includes(".filter((button) => button.alwaysShow || !executableAction || readyUnits.some((unit) => canIssueSourceActionButton(world, button, unit)))"), "Simulation source HUD action button lookup should require an executable ready unit unless source AlwaysShow keeps the disabled button visible.");
expect(hudSource.includes("disabled: command.disabled ?? sourceCommandDisabled(world, sourceButton, selectedUnits)"), "HUD source button enrichment should mark AlwaysShow buttons disabled instead of treating them as executable.");
expect(hudSource.includes("sourceButtonForHudCommand(world, commandId, playerId, selectedUnits, readyUnits, typeIds)"), "HUD source button lookup should delegate to simulation source HUD button selection.");
expect(ordersSource.includes("export function sourceHudCommandForAction(action: string): string | null"), "Simulation should expose source action to HUD command mapping.");
expect(hudSource.includes("sourceHudCommandForAction(button.action)"), "HUD should use simulation source action to HUD command mapping.");
expect(sourceUiHelpersSource.includes("export function sourceHudActionLabel(commandId: string): string"), "Source UI helpers should own fallback source HUD action labels.");
expect(hudSource.includes("sourceButtonLabel(button) ?? sourceHudActionLabel(commandId)"), "HUD source action buttons should use source UI helper fallback labels.");
expect(ordersSource.includes("export function issueSelectedUnits(world: WorldState, unitIds: string[], issue: (unit: WorldUnit) => boolean"), "Simulation should expose selected-unit issuing helper.");
expect(hudCommandExecutionSource.includes("executeDirectHudCommand(world, selectedUnitIds, command, world.visibilityPlayer, input.shiftKey === true)"), "HUD command execution should call simulation direct HUD command issuing.");
expect(!mainSource.includes("function canEnterPendingWorldCommand"), "Main should use simulation pending world-command capability instead of a local copy.");
expect(!mainSource.includes("function executeDirectHudCommand"), "Main should use simulation direct HUD command issuing instead of a local copy.");
expect(!mainSource.includes("function issueSourceDirectHudCommand"), "Main should not own source direct HUD command issuing.");
expect(!mainSource.includes("function sourceActionForDirectHudCommand"), "Main should not own source direct HUD action mapping.");
expect(!hudSource.includes("function sourceActionForCommand"), "HUD should use simulation source HUD command action/value mapping instead of a local copy.");
expect(!mainSource.includes("function sourceActionForCommand"), "Main should not own source HUD command action/value mapping.");
expect(!hudSource.includes("function sourceHudCommandForAction"), "HUD should use simulation source action to HUD command mapping instead of a local copy.");
expect(!hudSource.includes("function sourceActionLabel"), "HUD should delegate fallback source action labels to sourceUiHelpers.");
expect(!mainSource.includes("function sourceHudCommandForAction"), "Main should not own source action to HUD command mapping.");
expect(!mainSource.includes("function issueSelectedUnits"), "Main should use the simulation selected-unit issuing helper instead of a local copy.");
expect(ordersSource.includes("export function sourceBuildTypeForHudCommand(world: WorldState, command: string, unitIds: string[], playerId = world.visibilityPlayer): string | null"), "Simulation should expose source-data HUD build command resolution.");
expect(ordersSource.includes('button.action === "build" && typeof button.value === "string"'), "Source-data HUD build command resolution should inspect source build buttons in simulation.");
expect(ordersSource.includes("export function sourceBuildMatcherForHudCommand(world: WorldState, command: string, playerId: number): ((definition: WargusUnit) => boolean) | null"), "Simulation should expose source-data HUD build command role matching.");
expect(ordersSource.includes("sourceBuildMatcherForHudCommand(world, command, worker.player)"), "Source-data HUD build command resolution should use simulation role matching.");
expect(ordersSource.includes("sourceBuildMatcherForHudCommand(world, command, playerId)"), "Simulation source HUD build target resolution should use source-data build command role matching.");
expect(hudCommandExecutionSource.includes("sourceBuildTypeForHudCommand(world, command, selectedUnitIds)"), "HUD command execution should call simulation source-data HUD build command resolution.");
expect(!mainSource.includes("function sourceBuildTypeForHudCommand"), "Main should use the simulation source-data HUD build command resolver instead of a local copy.");
expect(!mainSource.includes("function sourceBuildMatcherForHudCommand"), "Main should not own source-data HUD build command role matching.");
expect(!hudSource.includes("function sourceBuildMatcherForCommand"), "HUD should use simulation source-data build command role matching instead of a local copy.");
expect(ordersSource.includes("export function buildingTypeForHudCommand(world: WorldState, command: string, unitIds: string[], playerId = world.visibilityPlayer): string | null"), "Simulation should expose fallback HUD build command building type resolution.");
expect(ordersSource.includes('"build-farm": human ? "unit-farm" : "unit-pig-farm"'), "Fallback HUD build command resolution should keep race-specific farm mapping in simulation.");
expect(hudCommandExecutionSource.includes("buildingTypeForHudCommand(world, command, selectedUnitIds)"), "HUD command execution should call simulation fallback HUD build command resolution.");
expect(!mainSource.includes("function buildingTypeForHudCommand"), "Main should use the simulation fallback HUD build command resolver instead of a local copy.");
expect(!mainSource.includes("issueBuildAtOrder(loadedWorld, builder.id"), "Main should not issue selected build commands by manually choosing a builder.");
expect(ordersSource.includes("export function canUseSourceBuildCommands(world: WorldState, builder: WorldUnit): boolean"), "Simulation source-build command capability helper must be exported.");
expect(mainSource.includes("canUseSourceBuildCommands(world, unit)") || ordersSource.includes("canUseSourceBuildCommands(world, unit)"), "Source build command paths should use the simulation source-build capability helper.");
expect(!mainSource.includes("function isSourceBuilderUnit"), "Main should use the simulation source-build capability helper instead of a local builder predicate.");
expect(ordersSource.includes("export function canIssueFollowTarget(world: WorldState, unit: WorldUnit, target: WorldUnit): boolean"), "Simulation follow-target capability helper must be exported.");
expect(ordersSource.includes("!unit || !target || !canIssueFollowTarget(world, unit, target)"), "Follow order issuing must use the simulation follow-target capability helper.");
expect(ordersSource.includes("export function canReceiveMoveOrders(unit: WorldUnit): boolean"), "Simulation mobile-order capability helper must be exported.");
expect(ordersSource.includes("export function canIssueSourceActionButton(world: WorldState, button: WargusButton, unit: WorldUnit, extraScopes: string[] = []): boolean"), "Simulation source action button capability helper must be exported.");
expect(ordersSource.includes('if (action === "move") return canReceiveMoveOrders(unit) || canSetRallyPoint(world, unit);'), "Simulation source action helper must gate move by mobile-order or producer rally capability.");
expect(ordersSource.includes('if (action === "stop") return canIssueStop(unit) || canSetRallyPoint(world, unit);'), "Simulation source action helper must gate stop by stop or producer rally capability.");
expect(ordersSource.includes('if (action === "attack") return canIssueHoldPosition(unit) || canSetRallyPoint(world, unit);'), "Simulation source action helper must gate attack by combat-move or producer rally capability.");
expect(ordersSource.includes('if (action === "stand-ground") return canIssueHoldPosition(unit);'), "Simulation source action helper must gate stand-ground by hold-position capability.");
expect(ordersSource.includes('if (action === "patrol") return canReceiveMoveOrders(unit);'), "Simulation source action helper must gate source patrol by movement capability.");
expect(ordersSource.includes('if (action === "attack-ground") return canAttackGround(unit);'), "Simulation source action helper must gate attack-ground by attack-ground capability.");
expect(!mainSource.includes("function canAttackGroundInMain"), "Main should use the simulation canAttackGround helper instead of a local copy.");
expect(!hudSource.includes("function sourceActionButtonAppliesToUnit"), "HUD should use the simulation canIssueSourceActionButton helper instead of a local action capability copy.");
expect(!mainSource.includes("canReceiveWorldOrder(unit) && issueStopOrder"), "Main should use simulation canIssueStop for stop actions.");
expect(!mainSource.includes("!unit.construction && canReceiveWorldOrder(unit)"), "Main should use simulation canIssueStop for stop hotkeys.");
expect(!mainSource.includes("unit.canAttack && canReceiveWorldOrder(unit) && issueHoldPositionOrder"), "Main should use simulation canIssueHoldPosition for hold-position actions.");
expect(!mainSource.includes("!unit.construction && unit.canAttack && canReceiveWorldOrder(unit)"), "Main should use simulation canIssueHoldPosition for hold-position hotkeys.");
expect(!mainSource.includes("canReceiveReadyWorldOrder(unit) && unit.canAttack"), "Main should use simulation combat-move capability helpers instead of raw queued combat filters.");
expect(!mainSource.includes("function canReceiveReadyWorldOrder"), "Main should use simulation canReceiveMoveOrders directly instead of a local ready-order alias.");
expect(!hudSource.includes("unit.canAttack && canReceiveMoveOrders(unit)"), "HUD should use simulation canIssueHoldPosition for combat command availability.");
const attackTargetGroup = ordersSource.match(/export function issueGroupAttackTargetAtOrder[\s\S]*?export function issueGroupFollowOrder/)?.[0] ?? "";
expect(ordersSource.includes("export function issueGroupAttackTargetAtOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean"), "Simulation should expose group attack-target issuing.");
expect(attackTargetGroup.includes("canIssueAttackTargetAt(world, unit, x, y)"), "Group attack-target issuing should use the simulation attack-target-at capability helper.");
expect(attackTargetGroup.includes("issueAttackTargetAtOrder(world, unit.id, x, y)"), "Group attack-target issuing should use the simulation attack-target-at issuing helper.");
expect(!mainSource.includes("function issueGroupAttackTargetAtOrder"), "Main should use the simulation group attack-target issuing helper instead of a local copy.");
expect(!attackTargetGroup.includes("const target = findUnitAt"), "Group attack-target issuing should not duplicate clicked target lookup from simulation.");
expect(!attackTargetGroup.includes("target.player === 15"), "Group attack-target issuing should not duplicate neutral-player checks from simulation.");
expect(!attackTargetGroup.includes("!unit.construction && unit.canAttack"), "Group attack-target issuing should not duplicate attacker capability checks from simulation.");
const attackGroundGroup = ordersSource.match(/export function issueGroupAttackGroundOrder[\s\S]*?export function issueGroupAttackTargetAtOrder/)?.[0] ?? "";
expect(ordersSource.includes("export function issueGroupAttackGroundOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean"), "Simulation should expose group attack-ground issuing.");
expect(attackGroundGroup.includes("canIssueAttackGroundAt(world, unit, x, y)"), "Group attack-ground issuing should use the simulation attack-ground capability helper.");
expect(!mainSource.includes("function issueGroupAttackGroundOrder"), "Main should use the simulation group attack-ground issuing helper instead of a local copy.");
expect(!attackGroundGroup.includes("&& canAttackGround(unit)"), "Group attack-ground issuing should not duplicate attack-ground capability checks from simulation.");
expect(ordersSource.includes("export function formationDestinations(world: WorldState, units: WorldUnit[], x: number, y: number): Map<string, { x: number; y: number }>"), "Simulation should own source-style formation destination calculation.");
expect(ordersSource.includes("export function canSelectedIssueMoveAt(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean"), "Simulation should expose selected move preview capability.");
expect(ordersSource.includes("export function canSelectedIssueCombatMoveAt(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean"), "Simulation should expose selected combat move preview capability.");
expect(ordersSource.includes("export function canSelectedIssueFollowAt(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean"), "Simulation should expose selected follow preview capability.");
expect(ordersSource.includes("canIssueCombatMoveAt(world, unit, destination.x, destination.y)"), "Combat move preview should use the simulation combat-move capability helper.");
expect(ordersSource.includes("canIssueMoveAt(world, unit, destination.x, destination.y)"), "Move preview should use the simulation move capability helper.");
expect(overlaySource.includes("canSelectedIssuePendingWorldCommandAt(world, selectedUnitIds, command, pointerWorldPosition.x, pointerWorldPosition.y, world.visibilityPlayer)"), "Pending move/combat cursor/preview validity should delegate through the simulation selected pending-command helper.");
expect(!overlaySource.includes("canSelectedIssueMoveAt(world, selectedUnitIds, pointerWorldPosition.x, pointerWorldPosition.y, world.visibilityPlayer)"), "Pending move cursor/preview validity should not duplicate move checks outside the simulation pending-command helper.");
expect(!overlaySource.includes("canSelectedIssueCombatMoveAt(world, selectedUnitIds, pointerWorldPosition.x, pointerWorldPosition.y, world.visibilityPlayer)"), "Pending attack-move/patrol cursor/preview validity should not duplicate combat-move checks outside the simulation pending-command helper.");
expect(!overlaySource.includes("canSelectedIssueFollowAt(world, selectedUnitIds, pointerWorldPosition.x, pointerWorldPosition.y, world.visibilityPlayer)"), "Pending follow cursor/preview validity should not duplicate follow checks outside the simulation pending-command helper.");
expect(!mainSource.includes("function canSelectedMoversReachAt"), "Main should use the simulation selected move helper instead of a local preview helper.");
expect(!mainSource.includes("function canSelectedCombatMoversReachAt"), "Main should use the simulation selected combat move helper instead of a local preview helper.");
expect(!mainSource.includes("function formationDestinations"), "Main should use the simulation formation destination helper instead of a local copy.");
expect(!mainSource.includes("function groupUnitsByMovementKind"), "Main should not own movement-kind formation grouping.");
expect(!ordersSource.includes("findPath(loadedWorld, unit, destination.x, destination.y).length > 0"), "Move previews should not duplicate pathability checks from simulation.");
expect(ordersSource.includes("export function issueGroupMoveOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean"), "Simulation should expose group move issuing.");
expect(ordersSource.includes("export function issueGroupQueueMoveOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean"), "Simulation should expose group queued move issuing.");
expect(ordersSource.includes("export function issuePendingWorldCommandAt(world: WorldState, unitIds: string[], command: PendingWorldCommand, x: number, y: number, queue = false): boolean"), "Simulation should expose pending world-command issuing.");
expect(ordersSource.includes("canIssueMoveAt(world, unit, destination.x, destination.y)"), "Group move issuing should use the simulation move capability helper at formation destinations.");
expect(worldPointerInputSource.includes("issuePendingWorldCommandAt(world, selectedUnitIds, pendingWorldCommand, x, y, input.shiftKey)"), "World pointer pending command path should call simulation pending world-command issuing.");
expect(!mainSource.includes("function issueGroupMoveOrder"), "Main should use the simulation group move issuing helper instead of a local copy.");
const groupMove = ordersSource.match(/export function issueGroupMoveOrder[\s\S]*?export function issueGroupQueueMoveOrder/)?.[0] ?? "";
expect(!groupMove.includes("issued = unit.order?.kind === \"move\" || issued"), "Group move issuing should not infer move eligibility from the post-issue order kind.");
const smartMove = ordersSource.match(/export function issueGroupSmartOrder[\s\S]*?export function issueGroupMoveOrder/)?.[0] ?? "";
expect(ordersSource.includes("export function isSmartOrderObjectClick(world: WorldState, x: number, y: number, playerId = world.visibilityPlayer): boolean"), "Simulation smart-order object click classifier must be exported.");
expect(ordersSource.includes("export function issueGroupSmartOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean"), "Simulation should expose group smart issuing.");
expect(smartMove.includes("isSmartOrderObjectClick(world, x, y, playerId)"), "Right-click smart group issuing should use the simulation smart-object classifier.");
expect(smartMove.includes("issued = issueSmartOrderInternal(world, unit.id, x, y) || issued"), "Right-click smart object groups should use the no-feedback internal smart issuer so SetClickMissile is emitted once per player command.");
expect(smartMove.includes("addClickMissileEffect(world, x, y, commandFeedbackPlayer(world, unitIds))"), "Right-click smart group issuing should emit source SetClickMissile feedback once on success.");
expect(smartMove.includes("canIssueMoveAt(world, unit, destination.x, destination.y)"), "Right-click smart terrain movement should use the simulation move capability helper at formation destinations.");
expect(!mainSource.includes("function isSmartOrderObjectClick"), "Main should use the simulation smart-object classifier instead of a local copy.");
expect(!mainSource.includes("function issueGroupSmartOrder"), "Main should use the simulation group smart issuing helper instead of a local copy.");
expect(!smartMove.includes("issued = unit.order?.kind === \"move\" || issued"), "Right-click smart terrain movement should not infer move eligibility from the post-issue order kind.");
const smartOrRally = ordersSource.match(/export function issueGroupSmartOrRallyOrder[\s\S]*?export function issueGroupAttackMoveOrder/)?.[0] ?? "";
expect(ordersSource.includes("export function issueGroupSmartOrRallyOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean"), "Simulation should expose group smart/rally issuing.");
expect(smartOrRally.includes("canSetRallyPoint(world, unit)"), "Group smart/rally issuing should use the simulation rally-point capability helper.");
expect(smartOrRally.includes("addClickMissileEffect(world, x, y, commandFeedbackPlayer(world, unitIds))"), "Pure rally-point group issuing should emit source SetClickMissile feedback once on success.");
expect(minimapInputSource.includes("issueGroupSmartOrRallyOrder(world, selectedUnitIds, targetX, targetY)"), "Minimap input path should call simulation group smart/rally issuing for minimap commands.");
expect(minimapInputSource.includes("feedbackUnit: firstSelectedUnit(world, selectedUnitIds)"), "Minimap command feedback should carry the selected source unit for command audio.");
expect(minimapInputSource.includes("function firstSelectedUnit(world: WorldState, selectedUnitIds: string[]): WorldUnit | null"), "Minimap command feedback should resolve a typed feedback unit locally.");
expect(mainSource.includes("playWorldCommandFeedback(result.feedbackUnit, result.issued)"), "Main minimap command feedback should use the feedback unit returned by minimap input.");
expect(!mainSource.includes("playCommandFeedback(loadedWorld, result.issued)"), "Main minimap command feedback should not re-resolve feedback through a broad selected-unit lookup.");
expect(!mainSource.includes("function issueGroupSmartOrRallyOrder"), "Main should use the simulation group smart/rally issuing helper instead of a local copy.");
expect(ordersSource.includes("export function issueGroupAttackMoveOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean"), "Simulation should expose group attack-move issuing.");
expect(ordersSource.includes("export function issueGroupQueueAttackMoveOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean"), "Simulation should expose group queued attack-move issuing.");
expect(ordersSource.includes("export function issueGroupPatrolOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean"), "Simulation should expose group patrol issuing.");
expect(!mainSource.includes("function issueGroupAttackMoveOrder"), "Main should use the simulation group attack-move issuing helper instead of a local copy.");
expect(!mainSource.includes("function issueGroupQueueAttackMoveOrder"), "Main should use the simulation group queued attack-move issuing helper instead of a local copy.");
expect(!mainSource.includes("function issueGroupPatrolOrder"), "Main should use the simulation group patrol issuing helper instead of a local copy.");
expect(!mainSource.includes("function canSetRallyPointInMain"), "Main should use the simulation rally-point capability helper instead of a local copy.");
expect(!mainSource.includes("function hasAllowedSourceTrainButtonInMain"), "Main should not duplicate source train-button rally checks.");
expect(!mainSource.includes("function hasSourceProductionRoleInMain"), "Main should not duplicate source production-role rally checks.");
expect(!mainSource.includes("Math.hypot(unit.x - target.x, unit.y - target.y) <= Math.max(64, unit.radius + target.radius + 36)"), "Main should use simulation canIssueFollowTarget for follow reachability instead of duplicating range math.");
expect(ordersSource.includes("export function canIssueFollowAt(world: WorldState, unit: WorldUnit, x: number, y: number): boolean"), "Simulation follow-at capability helper must be exported.");
expect(ordersSource.includes("export function issueFollowAtOrder(world: WorldState, unitId: string, x: number, y: number): boolean"), "Simulation follow-at issuing helper must be exported.");
const groupFollow = ordersSource.match(/export function issueGroupFollowOrder[\s\S]*?export function issueGroupRepairOrder/)?.[0] ?? "";
expect(ordersSource.includes("export function issueGroupFollowOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean"), "Simulation should expose group follow issuing.");
expect(groupFollow.includes("canIssueFollowAt(world, unit, x, y)"), "Group follow issuing should use the simulation follow-at capability helper.");
expect(groupFollow.includes("issueFollowAtOrder(world, unit.id, x, y)"), "Group follow issuing should use the simulation follow-at issuing helper.");
expect(!mainSource.includes("function issueGroupFollowOrder"), "Main should use the simulation group follow issuing helper instead of a local copy.");
expect(!groupFollow.includes("canReceiveReadyWorldOrder(target)"), "Group follow issuing should not duplicate clicked target readiness checks from simulation.");
expect(!groupFollow.includes("target.player !== loadedWorld.visibilityPlayer"), "Group follow issuing should not duplicate friendly target checks from simulation.");
expect(overlaySource.includes("canSelectedIssuePendingWorldCommandAt(world, selectedUnitIds, command, pointerWorldPosition.x, pointerWorldPosition.y, world.visibilityPlayer)"), "Pending follow cursor/preview validity should delegate through the simulation selected pending-command helper.");
expect(!mainSource.includes("function canSelectedUnitsFollowAt"), "Main should use the simulation selected follow helper instead of a local preview helper.");
expect(!hudSource.includes("function canReceiveMobileHudOrder"), "HUD should use the simulation canReceiveMoveOrders helper instead of a local copy.");
expect(!hudSource.includes('action === "attack-ground") return unit.groundAttack'), "HUD should use the simulation canAttackGround helper for source attack-ground buttons.");
expect(!hudSource.includes('readyUnits.some((unit) => unit.groundAttack)'), "HUD should use the simulation canAttackGround helper for fallback attack-ground buttons.");
expect(JSON.stringify(packageJson.scripts).includes("verify:source-move-action"), "package.json verify scripts missing verify:source-move-action.");

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source move action verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source move action verified (Wargus move buttons render and enter browser pending move mode).");
