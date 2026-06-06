import { statSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";

const errors = [];
const panelAssets = [
  "ui/human/panel_1.png",
  "ui/human/panel_2.png",
  "ui/human/infopanel.png",
  "ui/orc/panel_1.png",
  "ui/orc/panel_2.png",
  "ui/orc/infopanel.png"
];

for (const asset of panelAssets) {
  try {
    statSync(path.join("public/wargus/graphics", asset));
  } catch {
    errors.push(`Missing browser source HUD panel public/wargus/graphics/${asset}`);
  }
}

const atlasSource = readFileSync("src/view/sourcePanelAtlas.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const worldViewAssetSource = readFileSync("src/view/worldViewAssets.ts", "utf8");

for (const [name, source, fragments] of [
  ["source panel atlas", atlasSource, [
    "/wargus/graphics/ui/human/panel_1.png",
    "/wargus/graphics/ui/human/panel_2.png",
    "/wargus/graphics/ui/human/infopanel.png",
    "/wargus/graphics/ui/orc/panel_1.png",
    "/wargus/graphics/ui/orc/panel_2.png",
    "/wargus/graphics/ui/orc/infopanel.png",
    "sourcePanelTexturesForRace",
    "race === \"orc\" ? \"orc\" : \"human\""
  ]],
  ["asset preload", worldViewAssetSource, [
    "loadSourcePanelAtlas",
    "loadSourcePanelAtlas()"
  ]],
  ["main atlas wiring", mainSource, [
    "let sourcePanelAtlas: SourcePanelAtlas | null = null",
    "sourcePanelAtlas,"
  ]],
  ["hud render", hudSource, [
    "sourcePanelAtlas: SourcePanelAtlas | null",
    "sourcePanelTexturesForRace(sourcePanelAtlas, visiblePlayer?.race)",
    "drawSourceHudPanels",
    "new Sprite(panels.infoPanel)",
    "new Sprite(panels.panel1)",
    "new Sprite(panels.panel2)",
    "addHudText(hudLayer, wargusBitmapFontAtlas, {",
    "text: \"Wargus TS\"",
    "fontId: \"large\"",
    "sourceTextColorNumber(manifest, visiblePlayer?.race, \"normal\", 0xf0df9a)",
    "text: lines.join(\"\\n\")",
    "fontId: \"game\""
  ]]
]) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      errors.push(`${name} missing fragment: ${fragment}`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source HUD panel verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source HUD panels verified (human/orc panel art loaded and rendered by race).");
