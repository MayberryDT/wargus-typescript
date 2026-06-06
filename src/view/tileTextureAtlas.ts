import { Assets, Rectangle, Texture } from "pixi.js";
import type { WargusMapSetup } from "../wargus/types";

export interface TileTextureAtlas {
  base: Texture;
  family: SourceTilesetFamily;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  rows: number;
  frames: Map<number, Texture>;
}

type SourceTilesetFamily = "summer" | "swamp" | "wasteland" | "winter";

const tilesetImageByScript: Record<string, { family: SourceTilesetFamily; image: string }> = {
  "scripts/tilesets/summer.lua": { family: "summer", image: "summer/terrain/summer.png" },
  "scripts/tilesets/swamp.lua": { family: "swamp", image: "swamp/terrain/swamp.png" },
  "scripts/tilesets/wasteland.lua": { family: "wasteland", image: "wasteland/terrain/wasteland.png" },
  "scripts/tilesets/winter.lua": { family: "winter", image: "winter/terrain/winter.png" }
};

export async function loadTileTextureAtlas(setup: Pick<WargusMapSetup, "tileset"> | null): Promise<TileTextureAtlas | null> {
  const tileset = setup?.tileset ? tilesetImageByScript[setup.tileset] : null;
  if (!tileset) {
    return null;
  }

  try {
    const base = await Assets.load<Texture>(`/wargus/graphics/tilesets/${tileset.image}`);
    const tileWidth = 32;
    const tileHeight = 32;
    return {
      base,
      family: tileset.family,
      tileWidth,
      tileHeight,
      columns: Math.max(1, Math.floor(base.width / tileWidth)),
      rows: Math.max(1, Math.floor(base.height / tileHeight)),
      frames: new Map()
    };
  } catch {
    console.warn(`Unable to load tileset texture: ${tileset.image}`);
    return null;
  }
}

export function getTileTexture(atlas: TileTextureAtlas, tileId: number): Texture | null {
  const maxIndex = atlas.columns * atlas.rows - 1;
  const sourceIndex = sourceFrameForTileId(atlas.family, tileId, maxIndex);
  if (sourceIndex > maxIndex) {
    return null;
  }

  const cached = atlas.frames.get(sourceIndex);
  if (cached) {
    return cached;
  }

  const x = (sourceIndex % atlas.columns) * atlas.tileWidth;
  const y = Math.floor(sourceIndex / atlas.columns) * atlas.tileHeight;
  const texture = new Texture({
    source: atlas.base.source,
    frame: new Rectangle(x, y, atlas.tileWidth, atlas.tileHeight)
  });
  atlas.frames.set(sourceIndex, texture);
  return texture;
}

function sourceFrameForTileId(family: SourceTilesetFamily, tileId: number, maxIndex: number): number {
  const normalized = Math.floor(Math.max(tileId, 0));
  if (sourceSpecialTileFrames.has(normalized)) {
    return normalized;
  }
  const slot = Math.floor(normalized / 0x10) * 0x10;
  const subslot = normalized - slot;
  const sourceFrames = sourceTileFrameSetsByFamily[family]?.[slot];
  if (sourceFrames?.length) {
    return sourceFrames[subslot % sourceFrames.length] ?? sourceFrames[0] ?? 0;
  }
  return normalized <= maxIndex ? normalized : Math.floor(normalized / 0x10);
}

const sourceSpecialTileFrames = new Set([121, 122, 123, 126, 161, 162, 163, 166]);

// Source frame tables from scripts/tilesets/wargus/summer.lua.
const sourceTileFrameSetsByFamily: Record<SourceTilesetFamily, Record<number, number[]>> = {
  summer: {
    0x010: [328, 329, 329, 330],
    0x020: [331, 332, 332, 333],
    0x030: [334, 335, 336, 0, 337, 338, 339, 340, 341, 342, 343, 344],
    0x040: [345, 346, 347, 0, 348, 349, 350, 351, 352, 353, 354, 355],
    0x050: [356, 357, 356, 0, 358, 359, 360, 361, 362, 363, 358, 359, 358, 359, 358, 359],
    0x060: [364, 365, 364, 0, 366, 367, 368, 369, 370, 371, 366, 367, 366, 367, 366, 367],
    0x070: [125, 127, 128],
    0x080: [165, 177, 178, 179],
    0x090: [16, 0, 52, 0, 88],
    0x0a0: [34, 0, 70, 0, 88],
    0x0b0: [33, 0, 69, 0, 101],
    0x0c0: [51, 0, 87, 0, 101],
    0x100: [300, 301],
    0x110: [302, 303],
    0x120: [304, 305, 306],
    0x130: [307, 308],
    0x140: [309, 310, 311],
    0x150: [312, 313],
    0x160: [314, 314],
    0x170: [315, 316],
    0x180: [317, 318],
    0x190: [319, 320, 321],
    0x1a0: [322, 322],
    0x1b0: [323, 324, 325],
    0x1c0: [326, 326],
    0x1d0: [327, 327],
    0x200: [206, 207],
    0x210: [208, 209],
    0x220: [210, 211, 212],
    0x230: [213, 214],
    0x240: [215, 216, 217],
    0x250: [218, 218],
    0x260: [219, 220],
    0x270: [221, 222],
    0x280: [223, 223],
    0x290: [224, 225, 226],
    0x2a0: [227, 228],
    0x2b0: [229, 230, 231],
    0x2c0: [232, 233],
    0x2d0: [234, 235],
    0x300: [180, 180],
    0x310: [181, 182],
    0x320: [183, 184, 185],
    0x330: [186, 186],
    0x340: [188, 189, 190],
    0x350: [191, 192],
    0x360: [193, 193],
    0x370: [194, 194],
    0x380: [195, 196],
    0x390: [197, 198, 199],
    0x3a0: [200, 200],
    0x3b0: [201, 202, 203],
    0x3c0: [204, 204],
    0x3d0: [205, 205],
    0x400: [150, 173],
    0x410: [142, 167],
    0x420: [164, 176],
    0x430: [147, 171],
    0x440: [149, 172],
    0x450: [154, 175],
    0x460: [151],
    0x470: [144, 169],
    0x480: [153, 174],
    0x490: [143, 168],
    0x4a0: [152],
    0x4b0: [146, 170],
    0x4c0: [148],
    0x4d0: [145],
    0x500: [270, 271],
    0x510: [272, 273],
    0x520: [274, 275, 276],
    0x530: [277, 278],
    0x540: [279, 280, 281],
    0x550: [282, 283],
    0x560: [284, 284],
    0x570: [285, 286],
    0x580: [287, 288],
    0x590: [289, 290, 291],
    0x5a0: [292, 292],
    0x5b0: [293, 294, 295],
    0x5c0: [296, 297],
    0x5d0: [298, 299],
    0x600: [238, 239],
    0x610: [240, 241],
    0x620: [242, 243, 244],
    0x630: [245, 246],
    0x640: [247, 248, 249],
    0x650: [250, 251],
    0x660: [252, 253],
    0x670: [254, 255],
    0x680: [256, 257],
    0x690: [258, 259, 260],
    0x6a0: [261, 262],
    0x6b0: [263, 264, 265],
    0x6c0: [266, 267],
    0x6d0: [268, 269],
    0x700: [129, 110],
    0x710: [102, 130],
    0x720: [124, 131],
    0x730: [107, 132],
    0x740: [133, 109],
    0x750: [139, 138],
    0x760: [111, 111],
    0x770: [104, 136],
    0x780: [140, 141],
    0x790: [103, 135],
    0x7a0: [112, 112],
    0x7b0: [106, 134],
    0x7c0: [137, 137],
    0x7d0: [105, 105],
    0x800: [17, 0, 53, 0, 89],
    0x810: [18, 0, 54, 0, 90],
    0x820: [19, 0, 55, 0, 91],
    0x830: [20, 0, 56, 0, 92],
    0x840: [21, 22, 0, 57, 58, 0, 93, 95],
    0x850: [23, 0, 59, 0, 94],
    0x860: [24, 0, 60, 0, 93],
    0x870: [25, 0, 61, 0, 96],
    0x880: [26, 0, 62, 0, 97],
    0x890: [27, 28, 0, 63, 64, 0, 98, 99],
    0x8a0: [29, 0, 65, 0, 98],
    0x8b0: [30, 0, 66, 0, 100],
    0x8c0: [31, 0, 67, 0, 95],
    0x8d0: [32, 0, 68, 0, 99],
    0x900: [35, 0, 71, 0, 89],
    0x910: [36, 0, 72, 0, 90],
    0x920: [37, 0, 73, 0, 91],
    0x930: [38, 0, 74, 0, 92],
    0x940: [39, 40, 0, 75, 76, 0, 93, 95],
    0x950: [41, 0, 77, 0, 94],
    0x960: [42, 0, 78, 0, 93],
    0x970: [43, 0, 79, 0, 96],
    0x980: [44, 0, 80, 0, 97],
    0x990: [45, 46, 0, 81, 82, 0, 98, 99],
    0x9a0: [47, 0, 83, 0, 98],
    0x9b0: [48, 0, 84, 0, 100],
    0x9c0: [49, 0, 85, 0, 95],
    0x9d0: [50, 0, 86, 0, 99]
  },
  swamp: {},
  wasteland: {},
  winter: {}
};
