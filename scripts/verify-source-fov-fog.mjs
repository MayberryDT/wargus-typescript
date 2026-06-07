import { readFileSync } from "node:fs";

const sourceFov = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/map/fov.cpp", "utf8");
const sourceMapFog = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/map/map_fog.cpp", "utf8");
const sourceFow = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/map/fow.cpp", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const renderWorldSource = readFileSync("src/view/renderWorld.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");

const errors = [];

function expectIncludes(label, source, fragments) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      errors.push(`${label} missing FOV/fog fragment: ${fragment}`);
    }
  }
}

expectIncludes("Stratagus fov.cpp", sourceFov, [
  "CFieldOfView::Refresh",
  "MapRefreshUnitsSight(true)",
  "GameSettings.FoV",
  "ProceedShadowCasting(pos, width, height, range + 1)",
  "ProceedSimpleRadial(player, pos, width, height, range, marker)",
  "unit.Type->BoolFlag[ELEVATED_INDEX].value ? 0 : this->Settings.OpaqueFields",
  "void CFieldOfView::ProceedSimpleRadial",
  "const int16_t offsetx = isqrt(square(range + 1) - square(-offsety) - 1)",
  "pos.x + w + offsetx",
  "pos.x + w + range",
  "pos.y + h + offsety"
]);

expectIncludes("Stratagus map_fog.cpp", sourceMapFog, [
  "void MapMarkTileSight",
  "if (*v == 0 || *v == 1)",
  "if (!Map.NoFogOfWar || *v == 0)",
  "*v = 2",
  "void MapUnmarkTileSight",
  "if (!Map.NoFogOfWar)",
  "void MapMarkTileDetectCloak",
  "void MapSight",
  "FieldOfView.Refresh(player, unit, pos, w, h, range, marker)",
  "void UpdateFogOfWarChange",
  "if (Map.NoFogOfWar)"
]);

expectIncludes("Stratagus fow.cpp", sourceFow, [
  "CFogOfWar::Init",
  "VisTableWidth  = Map.Info.MapWidth  + 2",
  "VisionFor.clear()",
  "ShowVisionFor(*ThisPlayer)",
  "const uint8_t visibleThreshold = Map.NoFogOfWar ? 1 : 2"
]);

expectIncludes("browser world FOV/fog", worldSource, [
  "export function updateVisibility(world: WorldState): void",
  "if (!world.engineSettings.fogOfWarEnabled)",
  "world.visibleTiles.fill(1)",
  "world.exploredTiles.fill(1)",
  "const footprint = sourceFieldOfViewFootprintForUnit(world, unit)",
  "footprint.top - radius",
  "footprint.top + footprint.height + radius",
  "footprint.left - radius",
  "footprint.left + footprint.width + radius",
  "isSourceFieldOfViewTileVisible(world, footprint, x, y, radius, unit.elevated)",
  "function sourceFieldOfViewFootprintForUnit",
  "left: centerX - Math.floor(width / 2)",
  "top: centerY - Math.floor(height / 2)",
  "function isSourceSimpleRadialFieldOfViewTileVisible",
  "(radiusTiles + 1) ** 2 - (-offsetY) ** 2 - 1",
  "tileX >= footprint.left - offsetX && tileX < footprint.left + footprint.width + offsetX",
  "tileX >= footprint.left - radiusTiles && tileX < footprint.left + footprint.width + radiusTiles",
  "(radiusTiles + 1) ** 2 - (offsetY + 1) ** 2 - 1",
  "if (elevated)",
  "return hasSourceLineOfSight(world, footprint.centerX, footprint.centerY, tileX, tileY)",
  "return isSourceFieldOfViewTileVisible(world, sourceFieldOfViewFootprintForUnit(world, unit), tileX, tileY, unit.sightRangeTiles, unit.elevated)",
  "world.visibilityReveals",
  "doesUnitProvideRevelationVision"
]);

expectIncludes("browser fog render/minimap/save", renderWorldSource, [
  "world.engineSettings.fogOfWarEnabled",
  "sourceFogTextureFramesForTile(world, x, y)",
  "function fogTransitionTouchesVisibleTile",
  "const sourceVisible = world.visibleTiles[index] === 1;",
  "sourceVisible && sourceKnown && fogAtlas && sourceFogTiles.fogTile",
  "const suppressUnknownTransition = fogTransitionTouchesVisibleTile(world, x, y);",
  "if (!suppressUnknownTransition) {\n        fogTileIndex |= mask;",
  "function shouldDrawSourceBlackFogTile",
  "return sourceVisible || !fogTransitionTouchesVisibleTile(world, x, y);",
  "sourceFogTiles.blackFogTile && shouldDrawSourceBlackFogTile(world, x, y, sourceVisible)",
  "exploredTileTouchesVisibleTile",
  "function isFogTileExplored",
  "sourceFogOpacityAlphas",
  "function drawLastSeenBuildings",
  "let drewKnownFallbackGraphics = false",
  "let drewUnknownFogGraphics = false",
  "if (drewKnownFallbackGraphics)",
  "if (drewUnknownFogGraphics)"
]);
expectIncludes("browser minimap fog", hudSource, [
  "world.engineSettings.minimapFogOfWarOpacityLevels",
  "function sourceMinimapFogAlpha",
  "function minimapTileTouchesVisibleTile"
]);
expectIncludes("save FOV/fog", saveSource, [
  "exploredTiles: [...world.exploredTiles]",
  "visibilityReveals: world.visibilityReveals",
  "revealedPlayers: world.revealedPlayers",
  "world.exploredTiles = Uint8Array.from",
  "world.visibilityReveals = normalizeVisibilityReveals",
  "world.revealedPlayers = normalizePlayerIdArray"
]);
expectIncludes("package verify script", packageSource, [
  "\"verify:source-fov-fog\"",
  "npm run verify:source-fov-fog"
]);

const fogRenderBody = renderWorldSource.match(/function drawFog[\s\S]*?\n}\n\nfunction fogRenderKey/)?.[0] ?? "";
if (!fogRenderBody.includes("sourceFogTiles.blackFogTile && shouldDrawSourceBlackFogTile(world, x, y, sourceVisible)")) {
  errors.push("Fog renderer should route black source transition masks through the visible-edge guard.");
}
if (!fogRenderBody.includes("sourceVisible && sourceKnown && fogAtlas && sourceFogTiles.fogTile")) {
  errors.push("Fog renderer should only draw explored source transition masks from currently visible tiles.");
}
if (renderWorldSource.includes("getSoftFogTexture(fogAtlas")) {
  errors.push("Fog renderer should not use the failed soft-source-mask path.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source FOV/fog verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source FOV/fog verified (source footprint radial sight, elevated shadow-casting behavior, no-fog reveal, render/minimap/save coverage).");
