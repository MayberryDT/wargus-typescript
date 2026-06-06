import { readFileSync } from "node:fs";

const mainSource = readFileSync("src/main.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const messageSource = readFileSync("src/view/hudMessages.ts", "utf8");
const eventFeedbackSource = readFileSync("src/view/worldEventFeedback.ts", "utf8");
const sourceUiSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const errors = [];

const fragments = [
  [hudSource, "export interface HudMessage"],
  [hudSource, "hudMessages: HudMessage[]"],
  [hudSource, "drawHudMessages(hudLayer"],
  [hudSource, "world.engineSettings.showMessagesDefault"],
  [hudSource, "messages.length === 0"],
  [messageSource, "messages: HudMessage[]"],
  [messageSource, "export function createHudMessageState"],
  [mainSource, "hudMessages: hudMessageState.messages"],
  [mainSource, "function addHudMessage"],
  [messageSource, "world?.engineSettings.showMessagesDefault === false"],
  [eventFeedbackSource, "addHudMessage(hudMessages, world, `${unitTypeName(manifest, event.typeId)} ready`)"],
  [eventFeedbackSource, "addHudMessage(hudMessages, world, `${unitTypeName(manifest, event.typeId)} complete`)"],
  [eventFeedbackSource, "addHudMessage(hudMessages, world, `${upgradeName(manifest, event.upgradeId)} complete`)"],
  [eventFeedbackSource, "addHudMessage(hudMessages, world, `${unitTypeName(manifest, event.typeId)} under attack`)"],
  [eventFeedbackSource, "event.kind === \"resource-depleted\""],
  [eventFeedbackSource, "addHudMessage(hudMessages, world, `${resourceName(world, event.resource)} depleted`)"],
  [eventFeedbackSource, "resourceName(world, event.resource)"],
  [sourceUiSource, "world.engineSettings.defaultResourceNames.indexOf(resource)"],
  [sourceUiSource, "world?.engineSettings.resourceUiLabels[resourceIndex]"],
  [sourceUiSource, "sourceLabel?.trim().replace(/:$/, \"\")"],
  [sourceUiSource, "manifest?.buttons.find((button) => button.action === \"research\" && button.value === upgradeId)?.hint"],
  [sourceUiSource, "function cleanSourceButtonHint"],
  [sourceUiSource, ".replace(/~!/g, \"\")"],
  [sourceUiSource, ".replace(/\\([^)]*\\)/g, \"\")"],
  [worldSource, "kind: \"resource-depleted\""],
  [worldSource, "lastHelpLocationByPlayer: Record<number, { x: number; y: number }>"],
  [worldSource, "lastHelpLocationByPlayer: {}"],
  [ordersSource, "world.engineSettings.mineNotificationsDefault"],
  [ordersSource, "kind: \"resource-depleted\""],
  [ordersSource, "world.lastHelpLocationByPlayer[target.player]"],
  [ordersSource, "const alertDistance = world.tileSize * 14"],
  [ordersSource, "const longCooldownExpired = lastTick + sourceOrderRetryTicks(world, 3600) < world.tick"],
  [ordersSource, "world.lastHelpTickByPlayer[target.player] = world.tick + sourceOrderRetryTicks(world, 60)"],
  [eventFeedbackSource, "unitTypeName(manifest, event.typeId)"],
  [eventFeedbackSource, "upgradeName(manifest, event.upgradeId)"],
  [messageSource, "state.messages = []"],
  [messageSource, "state.messages = state.messages.filter"],
  [messageSource, "export function pruneHudMessageState"],
  [mainSource, "pruneHudMessageState(hudMessageState)"],
  [JSON.stringify(packageJson.scripts), "verify:source-messages"]
];

for (const [source, fragment] of fragments) {
  if (!source.includes(fragment)) {
    errors.push(`Missing source message wiring fragment: ${fragment}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  console.error(`Source message verifier failed: ${errors.length}`);
  process.exit(1);
}

console.log("Source in-game messages verified (ShowMessages gates local event message stream).");
