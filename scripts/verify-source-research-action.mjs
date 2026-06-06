import { readFileSync } from "node:fs";

const source = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_research.cpp", "utf8");
const commandSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/command.cpp", "utf8");
const buttonSources = [
  readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/wargus-local/share/games/stratagus/wargus/scripts/human/buttons.lua", "utf8"),
  readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/wargus-local/share/games/stratagus/wargus/scripts/orc/buttons.lua", "utf8")
].join("\n");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const renderSource = readFileSync("src/view/renderWorld.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");
const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));

const errors = [];

function expectIncludes(label, text, fragments) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      errors.push(`${label} missing research-action fragment: ${fragment}`);
    }
  }
}

expectIncludes("Stratagus action_research.cpp", source, [
  "#define CancelResearchCostsFactor  100",
  "COrder::NewActionResearch",
  "unit.Player->SubCosts(upgrade.Costs);",
  "action-research",
  "\"upgrade\"",
  "unit.Variable[RESEARCH_INDEX].Value = unit.Player->UpgradeTimers.Upgrades[this->Upgrade->ID];",
  "UnitShowAnimation(unit, !type.Animations->Research.empty() ? &type.Animations->Research : &type.Animations->Still);",
  "player.UpgradeTimers.Upgrades[upgrade.ID] >= upgrade.Costs[TimeCost]",
  "you can speed up",
  "research by using multiple buildings",
  "player.UpgradeTimers.Upgrades[upgrade.ID] += std::max(1, player.SpeedResearch / SPEEDUP_FACTOR);",
  "AiResearchComplete(unit, &upgrade);",
  "UpgradeAcquire(player, &upgrade);",
  "unit.Wait = CYCLES_PER_SECOND / 6;",
  "unit.Player->AddCostsFactor(upgrade.Costs, CancelResearchCostsFactor);"
]);

expectIncludes("Stratagus command.cpp", commandSource, [
  "void CommandResearch(CUnit &unit, CUpgrade &what, EFlushMode flush)",
  "auto *order = GetNextOrder(unit, flush);",
  "*order = COrder::NewActionResearch(unit, what);"
]);

if (!buttonSources.includes('Allowed = "check-single-research"')) {
  errors.push("Wargus source buttons should preserve check-single-research metadata for stock WC2 research buttons.");
}

const researchButtons = (manifest.buttons ?? []).filter((button) => button.action === "research");
const singleResearchButtons = researchButtons.filter((button) => button.allowed === "check-single-research");
if (researchButtons.length < 40 || singleResearchButtons.length < 40) {
  errors.push(`Manifest should preserve source research button metadata; found ${researchButtons.length} research buttons, ${singleResearchButtons.length} check-single-research buttons.`);
}

expectIncludes("browser research state", worldSource, [
  "export interface ResearchOrder",
  "export interface QueuedResearchOrder",
  "activeResearch: ResearchOrder[];",
  "queuedResearch: QueuedResearchOrder[];",
  "| { kind: \"research-complete\"; upgradeId: string; player: number; buildingId?: string; x?: number; y?: number }",
  "sourceResearchDurationSeconds",
  "sourceResearchDurationSecondsForPlayer"
]);

expectIncludes("browser research simulation", ordersSource, [
  "export function canResearchUpgradeAt",
  "export function canQueueResearchUpgradeAt",
  "function canResearchUpgradeCommon",
  "const sameUpgradeActive = world.activeResearch.some((research) => research.player === playerId && research.upgradeId === upgradeId);",
  "const sameUpgradeQueued = world.queuedResearch.some((research) => research.player === playerId && research.upgradeId === upgradeId);",
  "sameUpgradeQueued && !sourceResearchAllowsSharedProgress(world, building, upgradeId)",
  "sameUpgradeActive && !sourceResearchAllowsSharedProgress(world, building, upgradeId)",
  "export function sourceResearchAllowsSharedProgress(world: WorldState, building: WorldUnit, upgradeId: string): boolean",
  "button.allowed === \"check-research\"",
  "button.allowed === \"check-single-research\"",
  "return Boolean(button.value && !isSourceResearchStarted(world, playerId, button.value));",
  "export function issueResearchOrder",
  "spendResources(player.resources, upgradeCostPairs(upgrade));",
  "const totalSeconds = sourceResearchDurationSecondsForPlayer(world, building.player, upgrade.costs.time)",
  "world.activeResearch.push({ buildingId, player: player.id, upgradeId, remainingSeconds: totalSeconds, totalSeconds });",
  "export function issueQueueResearchOrder",
  "world.queuedResearch.push({ buildingId, player: player.id, upgradeId, totalSeconds });",
  "export function issueCancelResearchOrder",
  "const queuedIndex = world.queuedResearch.findIndex((research) => research.buildingId === buildingId);",
  "refundCosts(world, player, upgradeCostPairs(upgrade), 1)",
  "function stepResearch(world: WorldState, tickSeconds: number): void",
  "promoteQueuedResearchOrders(world);",
  "function promoteQueuedResearchOrders(world: WorldState): void",
  "const researchByUpgrade = new Map<string, { entries: typeof world.activeResearch; elapsedSeconds: number }>();",
  "group!.elapsedSeconds += tickSeconds;",
  "const remainingSeconds = Math.min(...group.entries.map((research) => research.remainingSeconds)) - group.elapsedSeconds;",
  "world.researchedUpgrades[first.player] = [...(world.researchedUpgrades[first.player] ?? []), first.upgradeId];",
  "applyCompletedUpgrade(world, first.player, first.upgradeId);",
  "kind: \"research-complete\"",
  "issueSourceResearchByKey",
  "canIssueResearchAt(world, unit, button.value, world.upgradeDefinitions, queue)",
  "issueResearchOrderByQueueMode(world, unit, upgradeId, upgrades, queue)",
  "nextResearchUpgradeByRoleWithFallbacks(world: WorldState, unit: WorldUnit, matchesUpgradeId: (upgradeId: string) => boolean, fallbackSequence: string[], queue = false)",
  "issueSourceResearchHudCommand",
  "queue = false",
  "issueQueueResearchOrder(world, unit.id, upgradeId, upgrades)"
]);

expectIncludes("save/load research state", saveSource, [
  "activeResearch: world.activeResearch",
  "queuedResearch: world.queuedResearch",
  "world.activeResearch = normalizeActiveResearch(save.world.activeResearch, world);",
  "world.queuedResearch = normalizeQueuedResearch(save.world.queuedResearch, world);",
  "function normalizeActiveResearch",
  "function normalizeQueuedResearch",
  "sourceResearchAllowsSharedProgress(world, building, upgradeId)",
  "const sameBuildingActive = world.activeResearch.some((research) => research.buildingId === buildingId)",
  "const sameUpgradeActive = world.activeResearch.some((research) => research.player === player && research.upgradeId === upgradeId)",
  "sameUpgradeActive && !sourceResearchAllowsSharedProgress(world, building, upgradeId)",
  "sourceResearchDurationSecondsForPlayer(world, player, upgrade.costs.time)",
  "if (sourceTotalSeconds <= 0)",
  "remainingSeconds: Math.min(remainingSeconds, sourceTotalSeconds)"
]);

expectIncludes("browser research rendering", renderSource, [
  "world.activeResearch.some((research) => research.buildingId === unit.id) && hasAction(\"Research\")",
  "pushBar(\"research\", \"Research\", 1 - activeResearch.remainingSeconds / activeResearch.totalSeconds)"
]);

expectIncludes("browser research HUD", hudSource, [
  "world.activeResearch.find((research) => research.buildingId === selected.id)",
  "ratio: 1 - activeResearch.remainingSeconds / activeResearch.totalSeconds"
]);

expectIncludes("package verify script", packageSource, [
  "\"verify:source-research-action\"",
  "npm run verify:source-research-action"
]);

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source research action verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source research action verified (source cost/cancel, research animation/progress, check-research shared timers, check-single-research gating, completion events, HUD bars, and save/load state).");
