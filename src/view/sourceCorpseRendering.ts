import { sourceDefaultGameSpeed, type WorldState } from "../simulation/world";

export function sourceCorpseAgeTicks(world: WorldState, corpse: WorldState["corpses"][number]): number {
  return Math.max(0, Math.floor(corpse.age * sourceDefaultGameSpeed(world)));
}
