import { choosePreloadedUnitSprites } from "../wargus/manifest";
import type { WargusManifest, WargusMapSetup } from "../wargus/types";
import type { WorldState } from "../simulation/world";
import { loadFogTextureAtlas, type FogTextureAtlas } from "./fogTextureAtlas";
import { loadIconTextureAtlas, type IconTextureAtlas } from "./iconTextureAtlas";
import { loadMissileTextureAtlases, type MissileTextureAtlas } from "./missileTextureAtlas";
import { loadResourceUiAtlas, type ResourceUiAtlas } from "./resourceUiAtlas";
import { loadSourceButtonStyleAtlas, type SourceButtonStyleAtlas } from "./sourceButtonStyleAtlas";
import { loadSourcePanelAtlas, type SourcePanelAtlas } from "./sourcePanelAtlas";
import { loadStatusDecorationAtlas, type StatusDecorationAtlas } from "./statusDecorationAtlas";
import { loadTileTextureAtlas, type TileTextureAtlas } from "./tileTextureAtlas";
import { loadUnitTextureAtlases, type UnitTextureAtlas } from "./unitTextureAtlas";
import { visibleResourceUiSlots } from "./sourceUiHelpers";
import { loadWargusBitmapFontAtlas, type WargusBitmapFontAtlas } from "./wargusBitmapFontAtlas";

export interface CoreWorldViewAssets {
  tileAtlas: TileTextureAtlas | null;
  fogAtlas: FogTextureAtlas | null;
  iconAtlas: IconTextureAtlas | null;
  unitAtlases: Map<string, UnitTextureAtlas>;
  missileAtlases: Map<string, MissileTextureAtlas>;
  wargusBitmapFontAtlas: WargusBitmapFontAtlas | null;
}

export interface StaticWorldViewAssets {
  statusDecorationAtlas: StatusDecorationAtlas | null;
  sourcePanelAtlas: SourcePanelAtlas | null;
  sourceButtonStyleAtlas: SourceButtonStyleAtlas | null;
  resourceUiAtlas: ResourceUiAtlas | null;
}

export type CompleteWorldViewAssets = CoreWorldViewAssets & StaticWorldViewAssets;

export async function loadCoreWorldViewAssets(
  manifest: WargusManifest,
  world: WorldState,
  setup: Pick<WargusMapSetup, "tileset"> | null
): Promise<CoreWorldViewAssets> {
  const [tileAtlas, fogAtlas, iconAtlas, unitAtlases, missileAtlases, wargusBitmapFontAtlas] = await Promise.all([
    loadTileTextureAtlas(setup),
    loadFogTextureAtlas(world),
    loadIconTextureAtlas(setup?.tileset),
    loadUnitTextureAtlases(world, choosePreloadedUnitSprites(manifest.units), manifest.constructions ?? []),
    loadMissileTextureAtlases(manifest.missiles),
    loadWargusBitmapFontAtlas(manifest)
  ]);
  return { tileAtlas, fogAtlas, iconAtlas, unitAtlases, missileAtlases, wargusBitmapFontAtlas };
}

export async function loadCompleteWorldViewAssets(
  manifest: WargusManifest,
  world: WorldState,
  setup: Pick<WargusMapSetup, "tileset"> | null
): Promise<CompleteWorldViewAssets> {
  const [core, statusDecorationAtlas, sourcePanelAtlas, sourceButtonStyleAtlas, resourceUiAtlas] = await Promise.all([
    loadCoreWorldViewAssets(manifest, world, setup),
    loadStatusDecorationAtlas(),
    loadSourcePanelAtlas(),
    loadSourceButtonStyleAtlas(world.engineSettings.buttonStyles),
    loadResourceUiAtlas(visibleResourceUiSlots(world))
  ]);
  return {
    ...core,
    statusDecorationAtlas,
    sourcePanelAtlas,
    sourceButtonStyleAtlas,
    resourceUiAtlas
  };
}
