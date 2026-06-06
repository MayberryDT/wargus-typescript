import { readFileSync } from "node:fs";

const files = {
  audio: readFileSync("src/audio/audioEngine.ts", "utf8"),
  hud: readFileSync("src/view/renderHud.ts", "utf8"),
  renderWorld: readFileSync("src/view/renderWorld.ts", "utf8"),
  orders: readFileSync("src/simulation/orders.ts", "utf8"),
  passability: readFileSync("src/simulation/passability.ts", "utf8"),
  main: readFileSync("src/main.ts", "utf8"),
  demoScenario: readFileSync("src/wargus/demoScenario.ts", "utf8"),
  world: readFileSync("src/simulation/world.ts", "utf8"),
  worldPointerInput: readFileSync("src/view/worldPointerInput.ts", "utf8"),
  tileTextureAtlas: readFileSync("src/view/tileTextureAtlas.ts", "utf8"),
  browserRuntimeSmoke: readFileSync("scripts/verify-browser-runtime-smoke.mjs", "utf8"),
  musicVerifier: readFileSync("scripts/verify-source-music-cues.mjs", "utf8")
};

const errors = [];

function expect(source, fragment, message) {
  const matched = typeof source === "boolean" ? source : source.includes(fragment);
  if (!matched) {
    errors.push(message ?? `Missing fixed-demo polish fragment: ${fragment}`);
  }
}

expect(files.audio, "musicAudioSourceForFile", "Audio engine should choose a real extracted music sidecar before synthesizing MIDI.");
expect(files.audio, "playDecodedMusicLoop", "Audio engine should play extracted Warcraft II music through WebAudio before HTML media fallback.");
expect(files.audio, "musicBufferSource", "Audio engine should stop decoded music loops cleanly when tracks change.");
expect(files.audio, "extractedMusicFile", "Audio engine should probe for extracted Warcraft II music files.");
expect(files.audio, "BROKEN_MPQ_MUSIC_SIDECARS", "Audio engine should block known-static MPQ music sidecars.");
expect(files.audio, "return [];", "Known broken MPQ music sidecars should not be played.");
expect(files.audio, "[\".ogg\", \".mp3\", \".wav\"]", "Other extracted music sidecars should support browser-friendly audio formats.");
expect(files.audio, "void this.loadBuffer(file);", "Sound effects should not fail audible HTML playback when optional WebAudio decoding rejects a WAV.");
expect(files.audio, "this.lastError = null;", "Successful HTML sound playback should clear stale audio errors.");
expect(files.musicVerifier, "extractedMusicCandidates", "Source music verifier should lock extracted sidecar music support.");

expect(files.renderWorld, "spriteDirectionForFacing(unit.facing ?? 4, numDirections).offset", "Unit animation frames should use current facing direction.");
expect(files.renderWorld, "case 0:\n      return { offset: 2, mirror: false };", "Facing mapping should not collapse north-facing units to the first source sprite row.");
expect(files.renderWorld, "case 4:\n      return { offset: 2, mirror: true };", "Facing mapping should mirror source sprite rows for opposite facings.");
expect(files.renderWorld, "isUnitInsideResourceSource", "Workers should be hidden while inside mines and dropoff buildings.");
expect(files.renderWorld, "isRuntimeSourceBuildingUnit(unit)", "Runtime buildings should snap instead of smoothing like walking units.");
expect(files.renderWorld, "function drawCarriedResourceMarker", "Workers should show a visible carried gold or lumber load.");
expect(files.renderWorld, "unit.carriedResource === \"gold\"", "Gold carrying should have a distinct visible marker.");
expect(files.renderWorld, "unit.carriedResource === \"wood\"", "Wood carrying should have a distinct visible marker.");

expect(files.demoScenario, "fogOfWar: true", "Fixed Garden of War demo should use fog of war.");
expect(files.demoScenario, "world.engineSettings.fogOfWarBlur = { simpleRadius: 0, bilinearRadius: 0, iterations: 1 };", "Fixed Garden of War fog should use sharp Warcraft II style tile edges.");
expect(files.demoScenario, "world.engineSettings.fogOfWarOpacityLevels = [0x98, 0x98, 0xff];", "Fixed Garden of War fog should use darker explored fog and black shroud.");
expect(!files.demoScenario.includes('{ typeId: "unit-ballista", player: FIXED_BROWSER_DEMO_PLAYER_ID'), "Fixed Garden of War demo should not spawn a starting ballista.");

expect(files.hud, "function drawHudMessages", "HUD message rendering should remain centralized.");
expect(files.hud, "const statusLine = sourceStatusLineLayout(app.screen, sideWidth, world.engineSettings.statusLine);", "HUD messages should use source status-line geometry.");
expect(files.hud, "const mapArea = world.engineSettings.mapArea;", "HUD messages should anchor to the map area instead of the command panel.");
expect(files.hud, "const y = Math.max(18, Math.floor((mapArea?.y ?? 0) + 14));", "Demo status messages should stay near the top of the map area instead of overlapping buttons.");

expect(files.orders, "emitSoundEvent(world, \"tree-chopping\", unit.player, unit.x, unit.y);", "Wood chopping should emit an audible world event.");
expect(files.orders, "function clearDepletedWoodTile", "Wood harvesting should clear depleted tree tiles.");
expect(files.orders, "world.tiles[index] = SOURCE_REMOVED_TREE_TILE;", "Cleared trees should use the Warcraft II removed-tree tile instead of fake nearby stump terrain.");
expect(files.orders, "const SOURCE_REMOVED_TREE_TILE = 126;", "Tree clearing should use the original Wargus tileset removed-tree special.");
expect(files.orders, "fixSourceForestNeighbors(world, tileX, tileY);", "Tree clearing should reshape neighboring forest tiles around the removed-tree stump.");
expect(files.tileTextureAtlas, "const sourceSpecialTileFrames = new Set([121, 122, 123, 126, 161, 162, 163, 166]);", "Tileset renderer should draw Wargus special tree/rock tiles directly instead of remapping them through solid slots.");
expect(files.tileTextureAtlas, "sourceSpecialTileFrames.has(normalized)", "Removed-tree tile 126 should render as the real stump frame.");
expect(files.orders, "function findNearestReachableWoodTileNear", "Deep tree clicks should retarget to a reachable edge tree.");
expect(files.orders, "function resolveReachableWoodTileForUnit", "Wood harvest orders should resolve unreachable tree clicks to reachable trees.");
expect(files.orders, "function isReachableWoodTileForUnit", "Wood targeting should reject unreachable interior forest tiles.");
expect(files.orders, "const endpoint = path[path.length - 1];", "Wood reachability should validate the final path point is actually close enough to chop.");
expect(files.orders, "findNearestReachableWoodTileForUnit(world, unit, 32)", "Deep unreachable tree clicks should fall back to any nearby reachable tree.");
expect(files.passability, "function isSourceRemovedTreeTile", "Removed-tree graphics should be passable land, not still treated as forest by slot.");
expect(files.renderWorld, "if (tile === 126) {\n    return [\"land\"];\n  }", "World renderer should classify removed-tree as land instead of forest.");
expect(files.hud, "if (tile === 126) {\n    return [\"land\"];\n  }", "Minimap renderer should classify removed-tree as land instead of forest.");
expect(files.orders, "unit.order.returnSeconds = sourceResourceReturnStepSeconds(world, unit, unit.order.resource);", "Workers should spend source return time inside the dropoff after delivery.");
expect(!files.orders.includes("unit.x = latestDropoff.x;"), "Workers should not physically move to the center of the dropoff and get trapped.");
expect(!files.orders.includes("unit.y = latestDropoff.y;"), "Workers should not physically move to the center of the dropoff and get trapped.");
expect(!files.orders.includes("resolveMobileUnitSeparation"), "Mobile units should not push other mobile units out of the way.");
expect(!files.orders.includes("tryDisplaceMobileUnit"), "Mobile collision handling should not displace idle units as a separation pass.");
expect(files.orders, "isTilePassable(world, nextTile.x, nextTile.y, movementKindForUnit(unit), unit.id)", "Movement should continue to consult passability before entering a tile.");
expect(files.orders, "function isUsableReplacementPath", "Blocked movement should reject empty or current-tile replacement paths.");
expect(files.orders, "function stopUnusablePathOrder", "Blocked movement should stop instead of walking in place when no usable path exists.");
expect(!files.passability.includes("unit.speed > 0"), "Mobile units should block movement instead of being ignored as blockers.");
expect(files.passability, "isUnitInsideResourceSource(unit)", "Workers hidden inside depots/mines should not block movement while returning or gathering.");
expect(files.renderWorld, "if (world.visibleTiles[index] !== 1)", "Fog fallback should remain unchanged while tree rendering is being repaired.");
expect(files.renderWorld, "unit.order.path.length > 0 && hasAction(\"Move\")", "Units with blocked empty paths should not keep playing walking animation in place.");

expect(files.world, "export function isUnitInsideResourceSource", "World helpers should expose resource/building inside-state for rendering.");
expect(files.world, "unit.order.phase === \"to-dropoff\" && unit.order.returnSeconds > 0", "Dropoff return wait should hide workers inside the depot.");
expect(files.main, "__WARGUS_TS_PLAY_AUDIO_FIXTURE__", "Browser smoke should verify multiple real sound-effect ids and music startup.");
expect(files.main, "void ensureMusicStarted();\n  window.setTimeout(() => {\n    void ensureMusicStarted();\n  }, 160);", "Briefing dismissal should restart music without racing a same-frame stop.");
expect(files.main, "function sourcePointerDownDoubleClick", "Browser double-clicks should be tracked in app space instead of relying only on event metadata.");
expect(files.main, "app.canvas.addEventListener(\"dblclick\"", "Canvas dblclick should select same-type units after the normal click sequence.");
expect(files.main, "function selectSameTypeUnitsAt", "Double-click same-type selection should use one shared helper.");
expect(files.main, "selectVisibleUnitsOfType(\n    loadedWorld,\n    unit.id,", "Detected browser double-clicks should immediately select visible units of that type.");
expect(files.main, "doubleClick: pointerDownDoubleClick || event.detail >= 2", "Browser double-clicks should be passed into world selection input.");
expect(files.main, "lastSelectionPointerDown = null;", "World reset should clear stale double-click pointer state.");
expect(files.main, "selectedUnitTypes", "Browser smoke state should expose selected unit types for same-type selection checks.");
expect(files.worldPointerInput, "input.ctrlKey || input.doubleClick", "Double-clicking a unit should select visible units of the same type.");
expect(files.browserRuntimeSmoke, "waitForRepeatedOwnedTypePoint", "Browser smoke should choose a visible same-type unit group for double-click selection.");
expect(files.browserRuntimeSmoke, "clickCount = 1", "Browser smoke mouse helper should support CDP double-click count.");
expect(files.browserRuntimeSmoke, "selectedUnitCount > 1", "Browser smoke should assert double-click selected more than one same-type unit.");

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Fixed demo polish verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Fixed demo polish verified (static MPQ music blocked, carried resources, facing sprites, WC2-style fog, non-overlap messages, original-style tree clearing, dropoff entry, audio fixture, double-click selection, and no mobile push separation).");
