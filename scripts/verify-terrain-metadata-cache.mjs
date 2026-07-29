import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = process.cwd();
const output = mkdtempSync(join(tmpdir(), "wargus-terrain-metadata-"));
const require = createRequire(import.meta.url);

try {
  const compiler = spawnSync(process.execPath, [
    require.resolve("typescript/bin/tsc"),
    "--ignoreConfig",
    "src/simulation/terrainMetadata.ts",
    "src/simulation/passability.ts",
    "src/simulation/world.ts",
    "--outDir", output,
    "--target", "ES2022",
    "--module", "CommonJS",
    "--moduleResolution", "Node",
    "--skipLibCheck",
    "--esModuleInterop",
    "--resolveJsonModule",
    "--verbatimModuleSyntax", "false",
    "--ignoreDeprecations", "6.0",
    "--noEmitOnError", "true"
  ], { cwd: root, encoding: "utf8" });
  if (compiler.status !== 0) {
    throw new Error(`Terrain metadata fixture compile failed:\n${compiler.stdout}${compiler.stderr}`);
  }
  copyFileSync(resolve(root, "src/wargus/scoutProvenance.mjs"), join(output, "wargus/scoutProvenance.mjs"));

  const metadata = require(join(output, "simulation/terrainMetadata.js"));
  const passability = require(join(output, "simulation/passability.js"));
  const worldModule = require(join(output, "simulation/world.js"));
  const manifest = JSON.parse(readFileSync(resolve(root, "public/wargus/manifest.json"), "utf8"));
  const consumedFlags = Object.keys(metadata.TERRAIN_FLAG_BITS);
  assert.deepEqual(consumedFlags, [
    "land", "water", "coast", "unpassable", "forest", "rock", "wall", "no-building"
  ], "The cache must represent exactly the flags consumed by passability, forest, and opacity.");

  const legacyMask = (flags) => consumedFlags.reduce(
    (mask, flag) => flags.includes(flag) ? mask | metadata.TERRAIN_FLAG_BITS[flag] : mask,
    0
  );
  let checkedSlots = 0;
  for (const tileset of manifest.tilesets) {
    for (const entry of tileset.slots) {
      const tile = entry.slot + 5;
      const rawMask = metadata.rawTerrainMaskForTile(tileset, tile);
      assert.equal(rawMask, legacyMask(entry.flags),
        ` slot  raw mask must match legacy source flags.`);
      assert.equal(metadata.rawTerrainMaskForSlot(tileset, entry.slot), rawMask,
        ` slot  raw slot and tile lookups must agree.`);
      for (const flag of consumedFlags) {
        assert.equal(metadata.terrainMaskHasFlag(rawMask, flag), entry.flags.includes(flag),
          `${tileset.name} slot ${entry.slot} must preserve ${flag}.`);
      }
      checkedSlots += 1;
    }
  }

  assert.equal(metadata.rawTerrainMaskForTile(null, 0), null, "Missing tilesets retain the legacy null fallback.");
  assert.equal(metadata.passabilityTerrainMaskForTile(null, 0), null, "Missing passability metadata retains the legacy null fallback.");
  assert.equal(metadata.rawTerrainMaskForTile(manifest.tilesets[0], 0x7fff), null, "Unknown raw slots retain the legacy null fallback.");
  assert.equal(metadata.passabilityTerrainMaskForTile(manifest.tilesets[0], 0x7fff), null,
    "Unknown passability slots retain the legacy null fallback.");
  assert.equal(metadata.rawTerrainMaskForTile(manifest.tilesets[0], -1), null,
    "Raw tile normalization must preserve the world consumer legacy bitwise slot fallback.");
  assert.equal(metadata.passabilityTerrainMaskForTile(manifest.tilesets[0], -1),
    metadata.rawTerrainMaskForTile(manifest.tilesets[0], 0),
    "Passability tile normalization must preserve its legacy negative-tile clamp.");

  for (const tileset of manifest.tilesets) {
    const raw126 = metadata.rawTerrainMaskForTile(tileset, 126);
    assert.equal(metadata.terrainMaskHasFlag(raw126, "forest"), true,
      `${tileset.name} raw tile 126 must remain forest for initialization and opacity.`);
    assert.equal(metadata.terrainMaskHasFlag(raw126, "unpassable"), true,
      `${tileset.name} raw tile 126 must preserve source unpassable metadata.`);
    const normalized126 = metadata.passabilityTerrainMaskForTile(tileset, 126);
    assert.equal(normalized126, metadata.TERRAIN_FLAG_BITS.land,
      `${tileset.name} passability tile 126 must remain the land-only removed-tree override.`);
    assert.notEqual(raw126, normalized126, `${tileset.name} raw and normalized tile 126 paths must stay distinct.`);
  }

  metadata.resetTerrainMetadataDiagnostics();
  const cacheFixture = {
    ...manifest.tilesets[0],
    slots: manifest.tilesets[0].slots.map((entry) => ({ ...entry, flags: [...entry.flags] }))
  };
  const firstMask = metadata.rawTerrainMaskForTile(cacheFixture, 0);
  const secondMask = metadata.rawTerrainMaskForTile(cacheFixture, 0);
  assert.equal(firstMask, secondMask, "Repeated lookup must preserve the same numeric value.");
  assert.deepEqual(metadata.readTerrainMetadataDiagnostics(), {
    "plan019.terrainMetadata.cacheBuilds": 1,
    "plan019.terrainMetadata.cacheHits": 1,
    "plan019.terrainMetadata.slotLookups": 2
  }, "One immutable tileset identity must build once and reuse its cache.");

  const immutableFixture = {
    ...manifest.tilesets[0],
    slots: [{ slot: 0, flags: ["land"] }]
  };
  metadata.resetTerrainMetadataDiagnostics();
  const immutableMask = metadata.rawTerrainMaskForTile(immutableFixture, 0);
  immutableFixture.slots[0].flags.push("water");
  assert.equal(metadata.rawTerrainMaskForTile(immutableFixture, 0), immutableMask,
    "The cached numeric snapshot must not expose or inherit mutable flag arrays.");
  assert.equal(typeof immutableMask, "number", "Lookups expose numeric masks, not mutable collections.");

  const terrainWorld = (tileset, tile) => ({
    map: { width: 1, height: 1 },
    tiles: [tile],
    tilesetTerrain: tileset,
    units: []
  });
  for (const tileset of manifest.tilesets) {
    for (const entry of tileset.slots) {
      const world = terrainWorld(tileset, entry.slot);
      assert.equal(passability.isSourceWaterTile(world, entry.slot),
        (entry.flags.includes("water") || entry.flags.includes("coast")) && !entry.flags.includes("land"),
        `${tileset.name} slot ${entry.slot} water classification must match legacy behavior.`);
      assert.equal(passability.isSourceBuildableTerrainTile(world, entry.slot),
        entry.flags.includes("land")
          && !entry.flags.includes("no-building")
          && !entry.flags.includes("unpassable")
          && !entry.flags.includes("forest")
          && !entry.flags.includes("rock")
          && !entry.flags.includes("wall"),
        `${tileset.name} slot ${entry.slot} buildability must match legacy behavior.`);
      assert.equal(passability.isSourceHarvestableWoodTile(world, entry.slot),
        entry.flags.includes("forest"), `${tileset.name} slot ${entry.slot} harvesting must match legacy behavior.`);
      assert.equal(passability.isTilePassable(world, 0, 0, "land", undefined, true),
        entry.flags.includes("land")
          && !entry.flags.includes("unpassable")
          && !entry.flags.includes("forest")
          && !entry.flags.includes("rock")
          && !entry.flags.includes("wall"),
        `${tileset.name} slot ${entry.slot} land passability must match legacy behavior.`);
      assert.equal(passability.isTilePassable(world, 0, 0, "naval", undefined, true),
        (entry.flags.includes("water") || entry.flags.includes("coast"))
          && !entry.flags.includes("land")
          && !entry.flags.includes("unpassable"),
        `${tileset.name} slot ${entry.slot} naval passability must match legacy behavior.`);
      assert.equal(passability.isTilePassable(world, 0, 0, "fly", undefined, true), true,
        `${tileset.name} slot ${entry.slot} fly passability must remain unconditional.`);
    }
    const removedTreeWorld = terrainWorld(tileset, 126);
    assert.equal(passability.isTilePassable(removedTreeWorld, 0, 0, "land", undefined, true), true,
      `${tileset.name} removed-tree tile 126 must be land-passable.`);
    assert.equal(passability.isSourceHarvestableWoodTile(removedTreeWorld, 126), false,
      `${tileset.name} removed-tree tile 126 must not be harvestable.`);
    assert.equal(worldModule.initialForestResourcesForWorld(removedTreeWorld).length, 1,
      `${tileset.name} forest initialization must read raw tile-126 metadata.`);
  }

  const map = manifest.maps.find((candidate) => candidate.path === "maps/ladder/Garden of war BNE.pud.smp.gz");
  assert.ok(map?.setupJson, "The opacity fixture requires the accepted Garden of War setup.");
  const setup = JSON.parse(readFileSync(resolve(root, "public/wargus", map.setupJson), "utf8"));
  const visibilityWorld = worldModule.createInitialWorld(
    map,
    manifest.units,
    setup,
    manifest.upgrades,
    manifest.missiles,
    manifest.spells,
    manifest.allowRules,
    manifest.dependencies,
    manifest.buttons,
    manifest.engineSettings,
    manifest.aiDefinitions,
    manifest.unitDatabase,
    manifest.tilesets,
    manifest.animations
  );
  const sightUnit = visibilityWorld.units.find((unit) => unit.player === visibilityWorld.visibilityPlayer && unit.hitPoints > 0);
  assert.ok(sightUnit, "The opacity fixture requires one live local unit.");
  visibilityWorld.units = [sightUnit];
  visibilityWorld.tiles.fill(0);
  sightUnit.x = 10 * visibilityWorld.tileSize + visibilityWorld.tileSize / 2;
  sightUnit.y = 10 * visibilityWorld.tileSize + visibilityWorld.tileSize / 2;
  sightUnit.tileWidth = 1;
  sightUnit.tileHeight = 1;
  sightUnit.sightRangeTiles = 4;
  sightUnit.elevated = false;
  visibilityWorld.tiles[10 * visibilityWorld.map.width + 11] = 126;
  visibilityWorld.engineSettings.fogOfWarEnabled = true;
  visibilityWorld.engineSettings.fieldOfViewType = "shadow-casting";
  visibilityWorld.engineSettings.opaqueTerrainTypes = ["forest"];
  visibilityWorld.engineSettings.insideDefault = false;
  visibilityWorld.engineSettings.revelationType = "no-revelation";
  worldModule.updateVisibility(visibilityWorld);
  const occludedTileIndex = 10 * visibilityWorld.map.width + 12;
  const opaqueTileIndex = 10 * visibilityWorld.map.width + 11;
  assert.equal(visibilityWorld.visibleTiles[occludedTileIndex], 0,
    "Opacity/FOV must read raw forest metadata for tile 126 instead of the passability land-only override.");

  visibilityWorld.tiles[opaqueTileIndex] = 0x7fff;
  worldModule.updateVisibility(visibilityWorld);
  assert.equal(visibilityWorld.visibleTiles[occludedTileIndex], 1,
    "Unknown raw slots must retain the legacy transparent opacity fallback.");

  visibilityWorld.tiles[opaqueTileIndex] = 128;
  visibilityWorld.engineSettings.opaqueTerrainTypes = ["rock"];
  worldModule.updateVisibility(visibilityWorld);
  assert.equal(visibilityWorld.visibleTiles[occludedTileIndex], 0,
    "Raw rock terrain must remain opaque outside the inside-default exception.");
  visibilityWorld.engineSettings.insideDefault = true;
  worldModule.updateVisibility(visibilityWorld);
  assert.equal(visibilityWorld.visibleTiles[occludedTileIndex], 1,
    "Inside-default FOV must preserve the legacy rock-transparency exception.");

  const source = readFileSync(resolve(root, "src/simulation/terrainMetadata.ts"), "utf8");
  const passabilitySource = readFileSync(resolve(root, "src/simulation/passability.ts"), "utf8");
  const worldSource = readFileSync(resolve(root, "src/simulation/world.ts"), "utf8");
  assert.match(source, /WeakMap<WargusTilesetTerrain, ReadonlyMap<number, number>>/,
    "Terrain metadata must be retained by immutable tileset identity.");
  assert.doesNotMatch(passabilitySource, /sourceTileFlags|new Set\(\[?"?(?:land)?/,
    "Hot passability terrain lookup must not allocate Set instances.");
  assert.doesNotMatch(passabilitySource, /tilesetTerrain\?\.slots\.find/,
    "Hot passability terrain lookup must not linearly search slots.");
  assert.match(worldSource, /rawTerrainMaskForTile\(world\.tilesetTerrain, tile\)/,
    "Forest initialization must use the raw metadata path.");
  assert.match(worldSource, /rawTerrainMaskForTile\(world\.tilesetTerrain, world\.tiles\[/,
    "Opacity must use the raw metadata path.");

  metadata.resetTerrainMetadataDiagnostics();
  assert.deepEqual(metadata.readTerrainMetadataDiagnostics(), {
    "plan019.terrainMetadata.cacheBuilds": 0,
    "plan019.terrainMetadata.cacheHits": 0,
    "plan019.terrainMetadata.slotLookups": 0
  }, "Diagnostics must reset independently of gameplay state.");

  console.log(`Terrain metadata cache verified (${manifest.tilesets.length} tilesets, ${checkedSlots} slots, raw/passability tile-126 separation, cache reuse, passability/forest parity).`);
} finally {
  rmSync(output, { recursive: true, force: true });
}
