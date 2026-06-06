import { Assets, Rectangle, Texture } from "pixi.js";

export interface StatusDecorationAtlas {
  base: Texture;
  health: Texture | null;
  mana: Texture | null;
  frameWidth: number;
  frameHeight: number;
  frames: Map<number, Texture>;
  barFrames: Map<string, Texture>;
}

export async function loadStatusDecorationAtlas(): Promise<StatusDecorationAtlas | null> {
  try {
    const [base, health, mana] = await Promise.all([
      Assets.load<Texture>("/wargus/graphics/ui/bloodlust,haste,slow,invisible,shield.png"),
      loadOptionalTexture("/wargus/graphics/ui/health2.png"),
      loadOptionalTexture("/wargus/graphics/ui/mana2.png")
    ]);
    return {
      base,
      health,
      mana,
      frameWidth: 16,
      frameHeight: 16,
      frames: new Map(),
      barFrames: new Map()
    };
  } catch {
    console.warn("Unable to load Wargus status decoration atlas: ui/bloodlust,haste,slow,invisible,shield.png");
    return null;
  }
}

async function loadOptionalTexture(path: string): Promise<Texture | null> {
  try {
    return await Assets.load<Texture>(path);
  } catch {
    console.warn(`Unable to load optional Wargus UI decoration: ${path}`);
    return null;
  }
}

export function getStatusDecorationTexture(atlas: StatusDecorationAtlas, frameNumber: number): Texture {
  const safeFrame = Math.max(0, Math.min(Math.floor(frameNumber), Math.max(0, Math.floor(atlas.base.width / atlas.frameWidth) - 1)));
  const cached = atlas.frames.get(safeFrame);
  if (cached) {
    return cached;
  }
  const texture = new Texture({
    source: atlas.base.source,
    frame: new Rectangle(safeFrame * atlas.frameWidth, 0, atlas.frameWidth, Math.min(atlas.frameHeight, atlas.base.height))
  });
  atlas.frames.set(safeFrame, texture);
  return texture;
}

export function getStatusBarTexture(atlas: StatusDecorationAtlas, kind: "health" | "mana", ratio: number): Texture | null {
  const base = kind === "health" ? atlas.health : atlas.mana;
  if (!base) {
    return null;
  }
  const frameWidth = 31;
  const frameHeight = 4;
  const frameCount = Math.max(1, Math.floor(base.width / frameWidth));
  const sourceRatio = 1 - Math.max(0, Math.min(1, ratio));
  const safeFrame = Math.max(0, Math.min(Math.round(sourceRatio * (frameCount - 1)), frameCount - 1));
  const key = `${kind}:${safeFrame}`;
  const cached = atlas.barFrames.get(key);
  if (cached) {
    return cached;
  }
  const texture = new Texture({
    source: base.source,
    frame: new Rectangle(safeFrame * frameWidth, 0, frameWidth, Math.min(frameHeight, base.height))
  });
  atlas.barFrames.set(key, texture);
  return texture;
}
