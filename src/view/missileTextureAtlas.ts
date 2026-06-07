import { Assets, Rectangle, Texture } from "pixi.js";
import type { WargusMissile } from "../wargus/types";

export interface MissileTextureAtlas {
  base: Texture;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  frameCount: number;
  numDirections: number;
  framesPerDirection: number;
  sleep: number;
  frames: Map<number, Texture>;
}

export async function loadMissileTextureAtlases(missiles: WargusMissile[]): Promise<Map<string, MissileTextureAtlas>> {
  const atlases = new Map<string, MissileTextureAtlas>();
  const loadedAtlases = await Promise.all(missiles
    .filter((missile) => Boolean(missile.file && missile.size))
    .map(async (missile) => ({ id: missile.id, atlas: await loadMissileTextureAtlas(missile) })));
  for (const { id, atlas } of loadedAtlases) {
    if (atlas) {
      atlases.set(id, atlas);
    }
  }
  return atlases;
}

async function loadMissileTextureAtlas(missile: WargusMissile): Promise<MissileTextureAtlas | null> {
  if (!missile.file || !missile.size) {
    return null;
  }
  try {
    const base = await Assets.load<Texture>(`/wargus/graphics/${missile.file}`);
    const [frameWidth, frameHeight] = missile.size;
    const columns = Math.max(1, Math.floor(base.width / frameWidth));
    const rows = Math.max(1, Math.floor(base.height / frameHeight));
    return {
      base,
      frameWidth,
      frameHeight,
      columns,
      frameCount: Math.max(1, Math.min(missile.frames || columns * rows, columns * rows)),
      numDirections: Math.max(1, missile.numDirections || 1),
      framesPerDirection: Math.max(1, Math.floor(Math.max(1, Math.min(missile.frames || columns * rows, columns * rows)) / Math.max(1, missile.numDirections || 1))),
      sleep: Math.max(1, missile.sleep || 1),
      frames: new Map()
    };
  } catch {
    console.warn(`Unable to load missile texture for ${missile.id}: ${missile.file}`);
    return null;
  }
}

export function getMissileFrameTexture(atlas: MissileTextureAtlas, frameNumber: number): Texture {
  const safeFrame = Math.max(0, Math.min(Math.floor(frameNumber), atlas.frameCount - 1));
  const cached = atlas.frames.get(safeFrame);
  if (cached) {
    return cached;
  }

  const x = (safeFrame % atlas.columns) * atlas.frameWidth;
  const y = Math.floor(safeFrame / atlas.columns) * atlas.frameHeight;
  const width = Math.min(atlas.frameWidth, Math.max(1, atlas.base.width - x));
  const height = Math.min(atlas.frameHeight, Math.max(1, atlas.base.height - y));
  const texture = new Texture({
    source: atlas.base.source,
    frame: new Rectangle(x, y, width, height)
  });
  atlas.frames.set(safeFrame, texture);
  return texture;
}
