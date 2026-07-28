export type PerformanceProfileId = "idle-25" | "army-100" | "army-200" | "command-18" | "combat-100";
export type PerformanceProfileDefinition = {
  id: PerformanceProfileId;
  mobileUnitCount: number;
  buildingTypeIds: readonly string[];
  playerUnitCounts: readonly [number, number];
  commandSequence: readonly ("move" | "attack-move" | "attack-target")[];
  projectileCount: number;
  effectCount: number;
};

const DEFINITIONS: readonly PerformanceProfileDefinition[] = [
  { id: "idle-25", mobileUnitCount: 25, buildingTypeIds: [], playerUnitCounts: [25, 0], commandSequence: [], projectileCount: 0, effectCount: 0 },
  { id: "army-100", mobileUnitCount: 100, buildingTypeIds: ["unit-town-hall", "unit-farm", "unit-human-barracks"], playerUnitCounts: [100, 0], commandSequence: [], projectileCount: 0, effectCount: 0 },
  { id: "army-200", mobileUnitCount: 200, buildingTypeIds: ["unit-town-hall", "unit-farm", "unit-human-barracks", "unit-great-hall"], playerUnitCounts: [200, 0], commandSequence: [], projectileCount: 0, effectCount: 0 },
  { id: "command-18", mobileUnitCount: 18, buildingTypeIds: [], playerUnitCounts: [18, 0], commandSequence: ["move", "attack-move"], projectileCount: 0, effectCount: 0 },
  { id: "combat-100", mobileUnitCount: 100, buildingTypeIds: [], playerUnitCounts: [50, 50], commandSequence: ["attack-target"], projectileCount: 8, effectCount: 8 }
];

function validateDefinition(definition: PerformanceProfileDefinition): void {
  if (definition.playerUnitCounts[0] + definition.playerUnitCounts[1] !== definition.mobileUnitCount) {
    throw new Error(`Performance profile ${definition.id} player counts do not match mobileUnitCount.`);
  }
}

function copyDefinition(definition: PerformanceProfileDefinition): PerformanceProfileDefinition {
  validateDefinition(definition);
  return {
    ...definition,
    buildingTypeIds: [...definition.buildingTypeIds],
    playerUnitCounts: [...definition.playerUnitCounts] as [number, number],
    commandSequence: [...definition.commandSequence]
  };
}

export function performanceProfileDefinitions(): PerformanceProfileDefinition[] {
  return DEFINITIONS.map(copyDefinition);
}

export function getPerformanceProfile(id: string): PerformanceProfileDefinition {
  const definition = DEFINITIONS.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Unknown performance profile: ${id}`);
  return copyDefinition(definition);
}

export function selectionForLoadedPerformanceProfile(
  profileId: PerformanceProfileId | null,
  profileSelection: readonly string[],
  fixedDemoSelection: readonly string[]
): string[] {
  return profileId === null ? [...fixedDemoSelection] : [...profileSelection];
}
