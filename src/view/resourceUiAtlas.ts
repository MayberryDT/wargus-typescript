import { Assets, Rectangle, Texture } from "pixi.js";
import type { WargusResourceUiSlot } from "../wargus/types";

export interface ResourceUiAtlas {
  bases: Map<string, Texture>;
  textures: Map<string, Texture>;
}

export async function loadResourceUiAtlas(slots: WargusResourceUiSlot[] | null | undefined): Promise<ResourceUiAtlas | null> {
  const graphics = [...new Set((slots ?? []).map((slot) => slot.graphic).filter(Boolean))];
  if (graphics.length === 0) {
    return null;
  }
  const bases = new Map<string, Texture>();
  for (const graphic of graphics) {
    try {
      bases.set(graphic, await Assets.load<Texture>(`/wargus/graphics/${graphic}`));
    } catch {
      console.warn(`Unable to load Wargus resource UI sprite: graphics/${graphic}`);
    }
  }
  return bases.size > 0 ? { bases, textures: new Map() } : null;
}

export function getResourceUiTexture(atlas: ResourceUiAtlas, slot: WargusResourceUiSlot): Texture | null {
  const base = atlas.bases.get(slot.graphic);
  if (!base) {
    return null;
  }
  const safeFrame = Math.max(0, Math.floor(slot.frame));
  const key = `${slot.graphic}:${safeFrame}:${slot.frameWidth}x${slot.frameHeight}`;
  const cached = atlas.textures.get(key);
  if (cached) {
    return cached;
  }
  const texture = new Texture({
    source: base.source,
    frame: new Rectangle(safeFrame * slot.frameWidth, 0, Math.min(slot.frameWidth, base.width), Math.min(slot.frameHeight, base.height))
  });
  atlas.textures.set(key, texture);
  return texture;
}
