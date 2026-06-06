import { readFileSync } from "node:fs";

const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const eventFeedbackSource = readFileSync("src/view/worldEventFeedback.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const checks = [
  [worldSource, '{ kind: "unit-ready"; unitId: string; typeId: string; player: number; x?: number; y?: number }'],
  [worldSource, '{ kind: "construction-complete"; unitId: string; typeId: string; player: number; builderTypeId: string | null; x?: number; y?: number }'],
  [worldSource, '{ kind: "research-complete"; upgradeId: string; player: number; buildingId?: string; x?: number; y?: number }'],
  [worldSource, '{ kind: "unit-dead"; unitId: string; typeId: string; player: number; x?: number; y?: number }'],
  [worldSource, '{ kind: "unit-help"; unitId: string; typeId: string; player: number; x?: number; y?: number }'],
  [ordersSource, 'kind: "construction-complete", unitId: building.id, typeId: building.typeId, player: building.player, builderTypeId, x: building.x, y: building.y'],
  [ordersSource, 'kind: "research-complete",'],
  [ordersSource, "upgradeId: first.upgradeId"],
  [ordersSource, "buildingId: completingBuilding?.id ?? first.buildingId"],
  [ordersSource, "x: completingBuilding?.x"],
  [ordersSource, "y: completingBuilding?.y"],
  [ordersSource, 'kind: "unit-ready", unitId: unit.id, typeId: unit.typeId, player: unit.player, x: unit.x, y: unit.y'],
  [ordersSource, 'kind: "unit-ready", unitId: trainedUnit.id, typeId: trainedUnit.typeId, player: trainedUnit.player, x: trainedUnit.x, y: trainedUnit.y'],
  [ordersSource, 'kind: "unit-help", unitId: target.id, typeId: target.typeId, player: target.player, x: target.x, y: target.y'],
  [ordersSource, 'kind: "unit-dead", unitId: unit.id, typeId: unit.typeId, player: unit.player, x: unit.x, y: unit.y'],
  [eventFeedbackSource, 'type SourceUnitSoundEvent = "selected" | "acknowledge" | "ready" | "dead" | "help" | "attack" | "work-complete"'],
  [eventFeedbackSource, "playUnitSound: (unit: { typeId: string }, event: SourceUnitSoundEvent, pan?: number) => void"],
  [eventFeedbackSource, 'handlers.playUnitSound({ typeId: event.typeId }, "ready", sourceWorldEventPan(world, event, handlers))'],
  [eventFeedbackSource, 'const pan = sourceWorldEventPan(world, event, handlers)'],
  [eventFeedbackSource, 'event.builderTypeId && sourceUnitHasSound(manifest, event.builderTypeId, "work-complete")'],
  [eventFeedbackSource, 'handlers.playUnitSound({ typeId: event.builderTypeId }, "work-complete", pan)'],
  [eventFeedbackSource, 'handlers.playSound(findGameSoundId(manifest, "work-complete", player?.race), pan)'],
  [eventFeedbackSource, 'handlers.playSound(findGameSoundId(manifest, "research-complete", player?.race), sourceWorldEventPan(world, event, handlers))'],
  [eventFeedbackSource, 'handlers.playUnitSound({ typeId: event.typeId }, "dead", sourceWorldEventPan(world, event, handlers))'],
  [eventFeedbackSource, 'handlers.playUnitSound({ typeId: event.typeId }, "help", sourceWorldEventPan(world, event, handlers))'],
  [eventFeedbackSource, "function sourceUnitHasSound"],
  [eventFeedbackSource, "function sourceWorldEventPan"],
  [eventFeedbackSource, "handlers.soundPanForWorldPosition?.({ x: event.x, y: event.y })"],
  [eventFeedbackSource, "world.units.find((candidate) => candidate.id === event.unitId)"],
  [mainSource, "playUnitSound: (unit, event, pan = 0)"],
  [mainSource, "audioEngine?.playUnitSound(unit, event, pan)"],
  [mainSource, "function sourceCommandFeedbackUnitSoundEvent"],
  [mainSource, '? "attack"'],
  [JSON.stringify(packageJson.scripts), "verify:source-event-audio-pan"]
];

const errors = checks
  .filter(([source, fragment]) => !source.includes(fragment))
  .map(([, fragment]) => `Missing source event audio pan fragment: ${fragment}`);

if (ordersSource.includes('playUnitSound(unit, event);')) {
  errors.push("Main event audio bridge should pass source stereo pan into playUnitSound.");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  console.error(`Source event audio pan verifier failed: ${errors.length}`);
  process.exit(1);
}

console.log("Source event audio panning verified (unit-ready/help/dead plus work/research-complete cues carry world positions into Web Audio).");
