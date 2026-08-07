import type { WargusButton } from "./types";

export function sourceButtonAppliesTo(button: WargusButton, unitTypeId: string, extraScopes: string[] = []): boolean {
  if (button.forUnit.length === 0) {
    return true;
  }
  if (button.forUnit.includes("*") || button.forUnit.includes(unitTypeId)) {
    return true;
  }
  return extraScopes.some((scope) => button.forUnit.includes(scope));
}

export function sourceFullButtonLabel(button: WargusButton | null | undefined): string | null {
  if (!button?.hint) {
    return null;
  }
  const cleaned = button.hint
    .replace(/~!/g, "")
    .replace(/~<[^>]+~>/g, "")
    .replace(/~/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

export function sourceButtonLabel(button: WargusButton | null | undefined): string | null {
  const cleaned = sourceFullButtonLabel(button);
  if (!cleaned) {
    return null;
  }
  // "UPGRADE TO GUARD TOWER" / "UPGRADE TO CANNON TOWER" both became "UPGRADE TO"
  // when truncated to two words — drop the shared prefix so the target remains.
  if (button?.action === "upgrade-to") {
    const target = cleaned.replace(/^UPGRADE TO\s+/i, "").trim();
    if (target) {
      return target.split(" ").slice(0, 3).join(" ");
    }
  }
  if (button?.action === "research") {
    // "UPGRADE SWORDS (Damage +2)" → "UPGRADE SWORDS"
    const withoutParens = cleaned.replace(/\s*\([^)]*\)\s*$/g, "").trim();
    return withoutParens.split(" ").slice(0, 3).join(" ");
  }
  return cleaned.split(" ").slice(0, 2).join(" ");
}
