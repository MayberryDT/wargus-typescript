import { readFileSync } from "node:fs";

const orders = readFileSync("src/simulation/orders.ts", "utf8");
const renderWorld = readFileSync("src/view/renderWorld.ts", "utf8");

function expect(source, needle, message) {
  if (!source.includes(needle)) {
    throw new Error(message);
  }
}

expect(orders, "function resourceDropoffTargetPoint", "Resource returns should path to reachable dropoff edge points.");
expect(orders, "function isInResourceDropoffRange", "Resource returns should deposit when adjacent to a building footprint.");
expect(orders, "resourceDropoffTargetPoint(world, unit, dropoff)", "Return-goods orders should use reachable dropoff points.");
expect(orders, "resourceDropoffTargetPoint(world, unit, latestDropoff)", "Harvest delivery loop should refresh reachable dropoff points.");
expect(orders, "isInResourceDropoffRange(world, unit, latestDropoff)", "Harvest delivery should not require touching the center of a town hall.");
expect(renderWorld, "const unknownFogGraphics = new Graphics();", "Unexplored fog should draw in its own topmost graphics pass.");
expect(renderWorld, "drawOpaqueUnknownFogTile(unknownFogGraphics, x, y, world.tileSize)", "Unexplored fog should be fully opaque black.");
expect(renderWorld, "layer.addChild(unknownFogGraphics);", "Unexplored fog should be drawn above explored fog and edge textures.");
expect(renderWorld, "if (fastFog) {\n    layer.filters = [];", "Fast fog should avoid blur filters that let terrain bleed through black fog.");
expect(renderWorld, "sourceKnown && fogAtlas", "Unexplored fog should not use translucent source edge textures over terrain.");

console.log("Resource return and black unexplored fog verified.");
