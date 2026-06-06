import { Assets, Rectangle, Texture } from "pixi.js";
import type { WargusButtonStyle } from "../wargus/types";

export interface SourceButtonStyleAtlas {
  bases: Map<string, Texture>;
  frames: Map<string, Texture>;
}

export async function loadSourceButtonStyleAtlas(styles: Record<string, WargusButtonStyle> | null | undefined): Promise<SourceButtonStyleAtlas | null> {
  const files = [...new Set(Object.values(styles ?? {}).flatMap((style) => [style.defaultFile, style.clickedFile]).filter((file): file is string => Boolean(file)))];
  if (files.length === 0) {
    return null;
  }
  const bases = new Map<string, Texture>();
  for (const file of files) {
    try {
      bases.set(file, await Assets.load<Texture>(`/wargus/graphics/${file}`));
    } catch {
      console.warn(`Unable to load Wargus button style sheet: graphics/${file}`);
    }
  }
  return bases.size > 0 ? { bases, frames: new Map() } : null;
}

export function getSourceButtonStyleTexture(atlas: SourceButtonStyleAtlas | null, style: WargusButtonStyle | null, state: "default" | "clicked" = "default"): Texture | null {
  if (!atlas || !style) {
    return null;
  }
  const file = state === "clicked" ? style.clickedFile ?? style.defaultFile : style.defaultFile;
  const size = state === "clicked" ? style.clickedSize ?? style.defaultSize : style.defaultSize;
  const frame = state === "clicked" ? style.clickedFrame ?? style.defaultFrame : style.defaultFrame;
  if (!file || !size || frame === null) {
    return null;
  }
  const base = atlas.bases.get(file);
  if (!base) {
    return null;
  }
  const [frameWidth, frameHeight] = size;
  if (frameWidth <= 0 || frameHeight <= 0) {
    return null;
  }
  const safeFrame = Math.max(0, Math.floor(frame));
  const y = safeFrame * frameHeight;
  const key = `${file}:${frameWidth}x${frameHeight}:${safeFrame}`;
  const cached = atlas.frames.get(key);
  if (cached) {
    return cached;
  }
  const texture = new Texture({
    source: base.source,
    frame: new Rectangle(0, y, Math.min(frameWidth, base.width), Math.min(frameHeight, Math.max(0, base.height - y)))
  });
  atlas.frames.set(key, texture);
  return texture;
}
