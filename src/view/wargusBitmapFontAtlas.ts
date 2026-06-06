import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";
import type { WargusFontColorPalette, WargusFontDefinition, WargusManifest } from "../wargus/types";

export interface WargusBitmapFontAtlas {
  bases: Map<string, Texture>;
  definitions: Map<string, WargusFontDefinition>;
  palettes: Map<string, WargusFontColorPalette>;
  glyphs: Map<string, Texture>;
}

export interface WargusBitmapTextOptions {
  fontId: string | null | undefined;
  text: string;
  color?: number;
  paletteId?: string | null;
  paletteIndex?: number;
  maxWidth?: number;
  lineHeight?: number;
}

const FIRST_GLYPH_CODE = 32;

export async function loadWargusBitmapFontAtlas(manifest: WargusManifest): Promise<WargusBitmapFontAtlas | null> {
  const fonts = manifest.fonts ?? [];
  if (fonts.length === 0) {
    return null;
  }
  const bases = new Map<string, Texture>();
  for (const font of fonts) {
    try {
      bases.set(font.id, await Assets.load<Texture>(`/wargus/graphics/${font.file}`));
    } catch {
      console.warn(`Unable to load Wargus bitmap font: graphics/${font.file}`);
    }
  }
  return bases.size > 0
    ? {
        bases,
        definitions: new Map(fonts.map((font) => [font.id, font])),
        palettes: new Map((manifest.fontColors ?? []).map((palette) => [palette.id, palette])),
        glyphs: new Map()
      }
    : null;
}

export function createWargusBitmapText(atlas: WargusBitmapFontAtlas, options: WargusBitmapTextOptions): Container | null {
  const fontId = options.fontId ?? "game";
  const definition = atlas.definitions.get(fontId);
  const base = atlas.bases.get(fontId);
  if (!definition || !base) {
    return null;
  }
  const container = new Container();
  const color = bitmapFontColorFromPalette(atlas, options.paletteId, options.paletteIndex ?? 1) ?? options.color ?? 0xffffff;
  const lineHeight = Math.max(1, Math.floor(options.lineHeight ?? definition.glyphHeight));
  let x = 0;
  let y = 0;
  const maxWidth = Math.max(0, Math.floor(options.maxWidth ?? 0));

  for (const char of wrappedBitmapFontText(options.text, definition.glyphWidth, maxWidth)) {
    if (char === "\n") {
      x = 0;
      y += lineHeight;
      continue;
    }
    if (char !== " ") {
      const texture = getWargusGlyphTexture(atlas, fontId, char);
      if (texture) {
        const sprite = new Sprite(texture);
        sprite.tint = color;
        sprite.x = x;
        sprite.y = y;
        container.addChild(sprite);
      }
    }
    x += definition.glyphWidth;
  }
  return container;
}

export function wargusBitmapTextWidth(atlas: WargusBitmapFontAtlas, fontId: string | null | undefined, text: string): number {
  const definition = atlas.definitions.get(fontId ?? "game");
  return definition ? text.length * definition.glyphWidth : 0;
}

export function bitmapFontColorFromPalette(atlas: WargusBitmapFontAtlas, paletteId: string | null | undefined, index = 1): number | null {
  const palette = paletteId ? atlas.palettes.get(paletteId) : null;
  const color = palette?.colors[index] ?? palette?.colors.find((entry) => entry.some((channel) => channel > 0));
  return color ? rgbToNumber(color) : null;
}

function rgbToNumber(color: [number, number, number]): number {
  return color.reduce((value, channel) => (value << 8) + Math.max(0, Math.min(255, channel)), 0);
}

function getWargusGlyphTexture(atlas: WargusBitmapFontAtlas, fontId: string, char: string): Texture | null {
  const definition = atlas.definitions.get(fontId);
  const base = atlas.bases.get(fontId);
  if (!definition || !base) {
    return null;
  }
  const codePoint = char.codePointAt(0) ?? FIRST_GLYPH_CODE;
  const frameNumber = Math.max(0, codePoint - FIRST_GLYPH_CODE);
  const columns = Math.max(1, Math.floor(base.width / definition.glyphWidth));
  const x = (frameNumber % columns) * definition.glyphWidth;
  const y = Math.floor(frameNumber / columns) * definition.glyphHeight;
  if (x + definition.glyphWidth > base.width || y + definition.glyphHeight > base.height) {
    return null;
  }
  const key = `${fontId}:${frameNumber}`;
  const cached = atlas.glyphs.get(key);
  if (cached) {
    return cached;
  }
  const texture = new Texture({
    source: base.source,
    frame: new Rectangle(x, y, definition.glyphWidth, definition.glyphHeight)
  });
  atlas.glyphs.set(key, texture);
  return texture;
}

function wrappedBitmapFontText(text: string, glyphWidth: number, maxWidth: number): string {
  if (maxWidth <= 0 || glyphWidth <= 0) {
    return text;
  }
  const maxChars = Math.max(1, Math.floor(maxWidth / glyphWidth));
  return text
    .split("\n")
    .map((line) => wrapLine(line, maxChars))
    .join("\n");
}

function wrapLine(line: string, maxChars: number): string {
  if (line.length <= maxChars) {
    return line;
  }
  const words = line.split(/(\s+)/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length <= maxChars) {
      current += word;
      continue;
    }
    if (current.trim().length > 0) {
      lines.push(current.trimEnd());
      current = "";
    }
    if (word.length > maxChars) {
      for (let index = 0; index < word.length; index += maxChars) {
        lines.push(word.slice(index, index + maxChars));
      }
    } else {
      current = word.trimStart();
    }
  }
  if (current.length > 0) {
    lines.push(current.trimEnd());
  }
  return lines.join("\n");
}
