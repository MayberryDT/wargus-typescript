import { Assets, Rectangle, Texture } from "pixi.js";

export interface IconTextureAtlas {
  base: Texture;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  framesById: Map<string, number>;
  textures: Map<string, Texture>;
}

export async function loadIconTextureAtlas(tileset: string | null | undefined): Promise<IconTextureAtlas | null> {
  const tilesetName = tileset ?? "summer";
  try {
    const [base, framesById] = await Promise.all([
      Assets.load<Texture>(`/wargus/graphics/tilesets/${tilesetName}/icons.png`),
      loadIconFrameMap()
    ]);
    return {
      base,
      frameWidth: 46,
      frameHeight: 38,
      columns: Math.max(1, Math.floor(base.width / 46)),
      framesById,
      textures: new Map()
    };
  } catch {
    console.warn(`Unable to load icon atlas for tileset: ${tilesetName}`);
    return null;
  }
}

export function getIconTexture(atlas: IconTextureAtlas, iconId: string | null | undefined): Texture | null {
  if (!iconId) {
    return null;
  }
  const cached = atlas.textures.get(iconId);
  if (cached) {
    return cached;
  }
  const frameNumber = atlas.framesById.get(iconId);
  if (frameNumber === undefined) {
    return null;
  }
  const x = (frameNumber % atlas.columns) * atlas.frameWidth;
  const y = Math.floor(frameNumber / atlas.columns) * atlas.frameHeight;
  const texture = new Texture({
    source: atlas.base.source,
    frame: new Rectangle(x, y, atlas.frameWidth, atlas.frameHeight)
  });
  atlas.textures.set(iconId, texture);
  return texture;
}

async function loadIconFrameMap(): Promise<Map<string, number>> {
  try {
    const response = await fetch("/wargus/icon-map.json", { cache: "no-store" });
    if (!response.ok) {
      return new Map();
    }
    const data = await response.json() as Record<string, number>;
    return new Map(Object.entries(data).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
  } catch {
    return new Map();
  }
}
