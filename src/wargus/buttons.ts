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
  return cleaned ? cleaned.split(" ").slice(0, 2).join(" ") : null;
}
