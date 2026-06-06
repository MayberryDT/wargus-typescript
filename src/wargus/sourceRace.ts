import type { WargusUnit, WargusUnitDatabaseEntry } from "./types";

export type SourceRace = "human" | "orc";

export function sourceRaceForUnitDefinition(
  definition: Pick<WargusUnit, "id" | "source" | "image" | "icon">,
  sourceUnitDatabase: WargusUnitDatabaseEntry[]
): SourceRace | null {
  const databaseRace = sourceUnitDatabase.find((entry) => entry.unitTypeId === definition.id)?.race;
  if (databaseRace === "human" || databaseRace === "orc") {
    return databaseRace;
  }
  const sourceFields = [definition.source, definition.image, definition.icon].filter((value): value is string => Boolean(value));
  if (sourceFields.some((field) => /(?:^|\/)human(?:\/|-)/i.test(field))) {
    return "human";
  }
  if (sourceFields.some((field) => /(?:^|\/)orc(?:\/|-)/i.test(field))) {
    return "orc";
  }
  return null;
}

export function sourceRaceScoreForUnitDefinition(
  definition: Pick<WargusUnit, "id" | "name" | "source" | "image" | "icon">,
  sourceUnitDatabase: WargusUnitDatabaseEntry[],
  race: SourceRace
): number {
  const sourceRace = sourceRaceForUnitDefinition(definition, sourceUnitDatabase);
  if (sourceRace) {
    return sourceRace === race ? 2 : 0;
  }
  const text = sourceUnitDefinitionText(definition).toLowerCase();
  const humanScore = sourceRaceTextScore(text, "human");
  const orcScore = sourceRaceTextScore(text, "orc");
  if (humanScore !== orcScore) {
    return race === "human"
      ? humanScore > orcScore ? 2 : 0
      : orcScore > humanScore ? 2 : 0;
  }
  return 1;
}

export function sourceRaceTextScore(text: string, race: SourceRace): number {
  if (race === "human") {
    return Number(/\bhuman\b|town hall|town-hall|keep|castle/.test(text));
  }
  return Number(/\borc\b|great hall|great-hall|stronghold|fortress/.test(text));
}

export function sourceUnitDefinitionText(definition: Pick<WargusUnit, "id" | "name" | "source" | "image" | "icon">): string {
  return [definition.id, definition.name, definition.source, definition.image, definition.icon]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}
