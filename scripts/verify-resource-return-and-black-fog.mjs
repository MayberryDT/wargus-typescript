import { readFileSync } from "node:fs";

const orders = readFileSync("src/simulation/orders.ts", "utf8");
const renderWorld = readFileSync("src/view/renderWorld.ts", "utf8");
const world = readFileSync("src/simulation/world.ts", "utf8");
const indexer = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));

function expect(source, needle, message) {
  if (!source.includes(needle)) {
    throw new Error(message);
  }
}

expect(orders, "function resourceDropoffTargetPoint", "Resource returns should path to reachable dropoff edge points.");
expect(orders, "function isInResourceDropoffRange", "Resource returns should deposit when adjacent to a building footprint.");
expect(orders, "function isInResourceSourceRange", "Workers should enter gold and oil sources from the resource footprint edge.");
expect(orders, "isInResourceSourceRange(world, unit, target)", "Harvesting should not require walking into the center of a gold mine.");
expect(orders, "function resolveStackedMovableUnit", "Stacked workers should be separated instead of staying permanently overlapped.");
expect(orders, "function nearestPassableAdjacentTile", "Stack escape should choose a nearby passable tile rather than pushing through blockers.");
expect(orders, "resourceDropoffTargetPoint(world, unit, dropoff)", "Return-goods orders should use reachable dropoff points.");
expect(orders, "resourceDropoffTargetPoint(world, unit, latestDropoff)", "Harvest delivery loop should refresh reachable dropoff points.");
expect(orders, "isInResourceDropoffRange(world, unit, latestDropoff)", "Harvest delivery should not require touching the center of a town hall.");
expect(renderWorld, "function isFogTileExplored", "Fog rendering should use player exploration state directly.");
expect(renderWorld, "world.exploredTiles[tileY * world.map.width + tileX] === 1", "Unexplored terrain should stay black regardless of reveal-map source settings.");
expect(renderWorld, "sourceFogTextureFramesForTile(world, x, y)", "Fog should use the source fog transition masks for the Warcraft-style soft edge.");
expect(renderWorld, "function fogTransitionTouchesVisibleTile", "Black source transition masks should be suppressed near current sight.");
expect(renderWorld, "const sourceBlackFogVisibleSuppressionRadius = 1", "Black source transition masks should be suppressed only next to current sight so far unexplored edges keep source softness.");
expect(renderWorld, "const sourceVisible = world.visibleTiles[index] === 1;", "Source explored transition masks should only be drawn from currently visible tiles.");
expect(renderWorld, "sourceVisible && sourceKnown && fogAtlas && sourceFogTiles.fogTile", "Explored fog transitions should not stamp dark source masks onto explored-but-not-visible tiles.");
expect(renderWorld, "const suppressUnknownTransition = fogTransitionTouchesVisibleTile(world, x, y);", "Unknown source masks should be excluded from visible-ring fog transitions near current sight.");
expect(renderWorld, "if (!suppressUnknownTransition) {\n        fogTileIndex |= mask;", "Unknown source masks should still contribute to far-away unexplored perimeter edges.");
expect(renderWorld, "function shouldDrawSourceBlackFogTile", "Black source transition masks should distinguish live visible edges from hidden explored fog.");
expect(renderWorld, "return sourceVisible || !fogTransitionTouchesVisibleTile(world, x, y);", "Black source transition masks should soften visible unexplored edges without stamping hidden explored tiles near sight.");
expect(renderWorld, "sourceFogTiles.blackFogTile && shouldDrawSourceBlackFogTile(world, x, y, sourceVisible)", "Black source transition masks should be drawn only for live visible edges or far unexplored perimeters.");
expect(renderWorld, "drawOpaqueUnknownFogTile(unknownFogGraphics, x, y, world.tileSize)", "Unexplored fog should still draw fully black.");
expect(renderWorld, "layer.addChild(unknownFogGraphics);", "Unexplored fog should still be drawn above terrain and edge textures.");
expect(renderWorld, "if (fastFog) {\n    layer.filters = [];", "Fast fog should avoid blur filters that let terrain bleed through black fog.");
if (renderWorld.includes("sourceUnknownFogEdgeAlpha") || renderWorld.includes("getSoftFogTexture(fogAtlas")) {
  throw new Error("Fog should not use the failed soft-source-mask path.");
}
if (renderWorld.includes("hiddenMapRenderHash(world, bounds)")) {
  throw new Error("Map rendering should not redraw the terrain layer when fog exploration changes; opaque unknown fog owns the black shroud.");
}
expect(world, "function normalizePlayableRevealMapMode", "Playable worlds should normalize stale generated reveal-map defaults.");
expect(world, "engineSettings.revealMapMode = \"hidden\";", "Playable worlds should start with unexplored terrain hidden.");
expect(indexer, 'scriptFile === "scripts/stratagus.lua" && /RevealMap\\(\\s*"/.test(source)', "Indexer should not promote scenario/menu RevealMap calls to the global gameplay default.");
if (manifest.engineSettings?.revealMapMode !== "hidden") {
  throw new Error(`Generated manifest should default revealMapMode to hidden, found ${manifest.engineSettings?.revealMapMode}`);
}

console.log("Resource return and black unexplored fog verified.");
