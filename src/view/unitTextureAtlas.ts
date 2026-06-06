import { Assets, Rectangle, Texture } from "pixi.js";
import type { WorldState } from "../simulation/world";
import { imageForTileset } from "../simulation/world";
import type { WargusConstruction, WargusUnit } from "../wargus/types";

export interface UnitTextureAtlas {
  base: Texture;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  frameCount: number;
  numDirections: number;
  frames: Map<number, Texture>;
}

interface UnitTextureDescriptor {
  typeId: string;
  image: string;
  frameWidth: number;
  frameHeight: number;
  numDirections: number;
}

export async function loadUnitTextureAtlases(loadedWorld: WorldState, preloadedUnits: WargusUnit[] = [], preloadedConstructions: WargusConstruction[] = []): Promise<Map<string, UnitTextureAtlas>> {
  const atlases = new Map<string, UnitTextureAtlas>();
  const uniqueUnits = new Map<string, UnitTextureDescriptor>();
  for (const unit of loadedWorld.units) {
    if (!unit.image) {
      continue;
    }
    uniqueUnits.set(unit.typeId, {
      typeId: unit.typeId,
      image: unit.image,
      frameWidth: unit.frameWidth,
      frameHeight: unit.frameHeight,
      numDirections: Math.max(0, unit.numDirections ?? 0)
    });
  }
  for (const unit of preloadedUnits) {
    const renderUnit = renderDefinitionForUnit(unit, preloadedUnits);
    const descriptor = textureDescriptorForUnitDefinition(unit, renderUnit, loadedWorld.map.setup?.tileset ?? null);
    if (!descriptor || uniqueUnits.has(unit.id)) {
      continue;
    }
    uniqueUnits.set(unit.id, descriptor);
  }
  for (const construction of preloadedConstructions) {
    const descriptor = textureDescriptorForConstruction(construction, loadedWorld.map.setup?.tileset ?? null);
    if (!descriptor || uniqueUnits.has(construction.id)) {
      continue;
    }
    uniqueUnits.set(construction.id, descriptor);
  }

  for (const unit of uniqueUnits.values()) {
    if (!unit.image) {
      continue;
    }
    const atlas = await loadUnitTextureAtlasFromDescriptor(unit);
    if (atlas) {
      atlases.set(unit.typeId, atlas);
    }
  }

  return atlases;
}

function textureDescriptorForConstruction(construction: WargusConstruction, tileset: string | null): UnitTextureDescriptor | null {
  const image = imageForTileset(construction, tileset);
  if (!image || !construction.size) {
    return null;
  }
  return {
    typeId: construction.id,
    image,
    frameWidth: construction.size[0],
    frameHeight: construction.size[1],
    numDirections: 0
  };
}

export async function loadUnitTextureAtlasForDefinition(unit: WargusUnit, unitDefinitions: WargusUnit[], tileset: string | null = null): Promise<UnitTextureAtlas | null> {
  const renderUnit = renderDefinitionForUnit(unit, unitDefinitions);
  const descriptor = textureDescriptorForUnitDefinition(unit, renderUnit, tileset);
  return descriptor ? loadUnitTextureAtlasFromDescriptor(descriptor) : null;
}

async function loadUnitTextureAtlasFromDescriptor(unit: UnitTextureDescriptor): Promise<UnitTextureAtlas | null> {
  try {
    const base = await Assets.load<Texture>(`/wargus/graphics/${unit.image}`);
    const columns = Math.max(1, Math.floor(base.width / unit.frameWidth));
    const rows = Math.max(1, Math.floor(base.height / unit.frameHeight));
    const inferredDirections = unit.numDirections > 0 ? unit.numDirections : inferSourceUnitDirections(unit, columns, rows);
    return {
      base,
      frameWidth: unit.frameWidth,
      frameHeight: unit.frameHeight,
      columns,
      frameCount: columns * rows,
      numDirections: inferredDirections,
      frames: new Map()
    };
  } catch {
    console.warn(`Unable to load unit texture for ${unit.typeId}: ${unit.image}`);
    return null;
  }
}

function inferSourceUnitDirections(unit: UnitTextureDescriptor, columns: number, rows: number): number {
  if (unit.frameWidth === 72 && unit.frameHeight === 72 && columns >= 5 && rows > 1) {
    return 5;
  }
  return 0;
}

function renderDefinitionForUnit(unit: WargusUnit, unitDefinitions: WargusUnit[]): WargusUnit {
  return unitDefinitions.find((candidate) => candidate.id === unit.id) ?? unit;
}

function textureDescriptorForUnitDefinition(unit: WargusUnit, renderUnit: WargusUnit, tileset: string | null): UnitTextureDescriptor | null {
  const image = imageForTileset(renderUnit, tileset);
  if (!image) {
    return null;
  }
  const tileWidth = Math.max(renderUnit.tileSize?.[0] ?? unit.tileSize?.[0] ?? 1, 1);
  const tileHeight = Math.max(renderUnit.tileSize?.[1] ?? unit.tileSize?.[1] ?? 1, 1);
  return {
    typeId: unit.id,
    image,
    frameWidth: tileWidth === 1 ? 72 : tileWidth * 32,
    frameHeight: tileHeight === 1 ? 72 : tileHeight * 32,
    numDirections: Math.max(0, unit.numDirections ?? renderUnit.numDirections ?? 0)
  };
}

export function getFrameTexture(atlas: UnitTextureAtlas, frameNumber: number): Texture {
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
