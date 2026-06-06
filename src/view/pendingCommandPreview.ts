import { targetedSpellIdForCommand, type TargetedSpellCommand } from "../simulation/orders";
import type { WorldState } from "../simulation/world";

export function pendingSpellPreviewRadius(world: WorldState | null, command: TargetedSpellCommand, zoom: number): number {
  const fallback = fallbackSpellPreviewRadius(world, command, zoom);
  const spellId = world ? targetedSpellIdForCommand(world, command) : null;
  return world && spellId ? sourceSpellPreviewRadius(world, spellId, fallback) : fallback;
}

export function fallbackSpellPreviewRadius(_world: WorldState | null, command: TargetedSpellCommand, zoom: number): number {
  switch (command) {
    case "cast-blizzard":
      return 86;
    case "cast-death-and-decay":
      return 78;
    case "cast-whirlwind":
      return 72;
    case "cast-runes":
    case "cast-runes-double-head":
      return 62;
    case "cast-eye-of-kilrogg":
    case "cast-eye-of-kilrogg-double-head":
      return 48;
    default:
      return 23 / Math.max(0.1, zoom);
  }
}

export function sourceSpellPreviewRadius(world: WorldState, spellId: string, fallback: number): number {
  const spell = world.spellDefinitions.find((candidate) => candidate.id === spellId);
  if (!spell) {
    return fallback;
  }
  const revealerRadius = sourceRevealerSummonPreviewRadius(world, spell);
  if (revealerRadius > 0) {
    return revealerRadius;
  }
  const areaFields = spell.areaBombardments[0]?.fields;
  if (typeof areaFields === "number" && areaFields > 0) {
    return sourceAreaBombardmentPreviewRadius(world, spell.areaBombardments[0]);
  }
  const radii = [
    ...spell.missileSpawns.map((missile) => Math.hypot(missile.endOffsetX ?? missile.startOffsetX ?? 0, missile.endOffsetY ?? missile.startOffsetY ?? 0) + sourceMissilePreviewRadius(world, missile.missile)),
    ...spell.missiles.map((missileId) => sourceMissilePreviewRadius(world, missileId))
  ].filter((radius) => radius > 0);
  return radii.length > 0 ? Math.max(...radii) : fallback;
}

function sourceRevealerSummonPreviewRadius(world: WorldState, spell: WorldState["spellDefinitions"][number]): number {
  const summonedUnit = spell.summons
    .map((summon) => world.unitDefinitions.find((unit) => unit.id === summon.unitTypeId))
    .find((unit) => unit?.revealer === true || unit?.vanishes === true || unit?.nonSolid === true);
  return summonedUnit ? Math.max(1, summonedUnit.sightRange ?? 0) * world.tileSize : 0;
}

export function sourceMissilePreviewRadius(world: WorldState, missileId: string | null | undefined): number {
  const missile = missileId ? world.missileDefinitions.find((candidate) => candidate.id === missileId) : null;
  if (!missile) {
    return 0;
  }
  const [width, height] = missile.size ?? [0, 0];
  const visualRadius = Math.max(width, height) / 2;
  const rangeRadius = missile.range > 0 ? missile.range * world.tileSize : 0;
  return Math.max(visualRadius, rangeRadius);
}

function sourceAreaBombardmentPreviewRadius(world: WorldState, sourceArea: NonNullable<WorldState["spellDefinitions"][number]["areaBombardments"][number]>): number {
  const fields = Math.max(1, Math.floor(sourceArea.fields ?? 1));
  const fieldSize = fields * world.tileSize;
  const startOffsetX = sourceArea.startOffsetX ?? -fieldSize / 2;
  const startOffsetY = sourceArea.startOffsetY ?? -fieldSize / 2;
  const maxX = Math.max(Math.abs(startOffsetX), Math.abs(startOffsetX + fieldSize));
  const maxY = Math.max(Math.abs(startOffsetY), Math.abs(startOffsetY + fieldSize));
  return Math.max(world.tileSize, Math.hypot(maxX, maxY));
}
