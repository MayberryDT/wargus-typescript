export function assertMinimapRuntimeSmoke(minimap, mapTileCount, failures) {
  if (!minimap) {
    failures.push("minimap render cache debug state: missing");
    return;
  }
  if (!(minimap.drawCount > 1 && minimap.terrainRebuildCount === 1 && minimap.terrainKeyChangeCount === 1 && minimap.terrainKey)) failures.push(`minimap terrain cache reuse: ${JSON.stringify(minimap)}`);
  if (!(minimap.visualRootAttached && minimap.hitTargetAttached && minimap.visualRootIndex === 1 && minimap.hitTargetIndex > minimap.visualRootIndex)) failures.push(`minimap cache attachment/order: ${JSON.stringify(minimap)}`);
  if (!(minimap.visualRootChildCount === 2 && minimap.visualRootMinChildCount === 2 && minimap.visualRootMaxChildCount === 2 && minimap.hitTargetChildCount === 0)) failures.push(`minimap stable child counts: ${JSON.stringify(minimap)}`);
  if (!(minimap.pointerDownListenerCount === 1 && minimap.pointerMoveListenerCount === 1)) failures.push(`minimap stable pointer listeners: ${JSON.stringify(minimap)}`);
  if (!(minimap.rasterCanvasCreateCount === 1 && minimap.rasterTextureCreateCount === 1 && minimap.rasterSpriteCreateCount === 1 && minimap.rasterResizeCount === 0 && minimap.rasterUpdateCount > 0 && minimap.rasterUpdateCount < minimap.drawCount)) failures.push(`minimap stable raster objects/updates: ${JSON.stringify(minimap)}`);
  if (!(minimap.rasterWidth > 0 && minimap.rasterHeight > 0 && minimap.rasterWidth <= 256 && minimap.rasterHeight <= 256)) failures.push(`minimap bounded raster dimensions: ${JSON.stringify(minimap)}`);
  if (!(mapTileCount > 0 && minimap.terrainTileCount === mapTileCount && minimap.fogTileCount > 0 && minimap.fogTileCount <= mapTileCount)) failures.push(`minimap terrain/fog composite counts: tiles=${mapTileCount} cache=${JSON.stringify(minimap)}`);
}
