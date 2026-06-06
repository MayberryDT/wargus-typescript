import type { WorldProjectile, WorldState } from "../simulation/world";
import type { WargusMissile } from "../wargus/types";

export type SourceMissileVisualRole = "stone" | "lightning" | "flame" | "hammer" | "arrow";

export function sourceMissileVisualRole(world: Pick<WorldState, "missileDefinitions">, projectile: WorldProjectile): SourceMissileVisualRole {
  const missile = sourceMissileDefinitionForProjectile(world, projectile);
  return sourceMissileVisualRoleForDefinition(missile, projectile);
}

export function sourceMissileVisualRoleForDefinition(missile: WargusMissile | undefined, projectile: Pick<WorldProjectile, "className" | "kind" | "bouncesRemaining">): SourceMissileVisualRole {
  const className = missile?.className ?? projectile.className ?? "";
  if (className === "missile-class-parabolic" || projectile.kind === "siege") {
    return "stone";
  }
  if (className === "missile-class-point-to-point-with-hit") {
    return "lightning";
  }
  if ((missile?.numBounces ?? projectile.bouncesRemaining) > 0) {
    return sourceMissileUsesHammerVisual(missile) ? "hammer" : "flame";
  }
  if (className === "missile-class-fire") {
    return "flame";
  }
  return "arrow";
}

export function sourceMissileDefinitionForProjectile(world: Pick<WorldState, "missileDefinitions">, projectile: Pick<WorldProjectile, "missileId">): WargusMissile | undefined {
  return projectile.missileId ? world.missileDefinitions.find((candidate) => candidate.id === projectile.missileId) : undefined;
}

function sourceMissileUsesHammerVisual(missile: WargusMissile | undefined): boolean {
  return missile?.file?.endsWith("gryphon_hammer.png") === true;
}
