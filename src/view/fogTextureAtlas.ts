import { Assets, Rectangle, Texture } from "pixi.js";
import type { WorldState } from "../simulation/world";

export interface FogTextureAtlas {
  base: Texture;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  rows: number;
  frames: Map<number, Texture>;
  source: string;
}

export async function loadFogTextureAtlas(world: WorldState): Promise<FogTextureAtlas | null> {
  const source = world.engineSettings.fogOfWarGraphics;
  if (!source) {
    return null;
  }

  try {
    const base = await Assets.load<Texture>(`/wargus/graphics/${source}`);
    const tileWidth = 32;
    const tileHeight = 32;
    return {
      base,
      tileWidth,
      tileHeight,
      columns: Math.max(1, Math.floor(base.width / tileWidth)),
      rows: Math.max(1, Math.floor(base.height / tileHeight)),
      frames: new Map(),
      source
    };
  } catch {
    console.warn(`Unable to load fog of war texture: ${source}`);
    return null;
  }
}

export function getFogTexture(atlas: FogTextureAtlas, frameIndex: number): Texture | null {
  const maxIndex = atlas.columns * atlas.rows - 1;
  if (frameIndex < 0 || frameIndex > maxIndex) {
    return null;
  }

  const cached = atlas.frames.get(frameIndex);
  if (cached) {
    return cached;
  }

  const x = (frameIndex % atlas.columns) * atlas.tileWidth;
  const y = Math.floor(frameIndex / atlas.columns) * atlas.tileHeight;
  const texture = new Texture({
    source: atlas.base.source,
    frame: new Rectangle(x, y, atlas.tileWidth, atlas.tileHeight)
  });
  atlas.frames.set(frameIndex, texture);
  return texture;
}
