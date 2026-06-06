import { Assets, Texture } from "pixi.js";

type SourcePanelRace = "human" | "orc";

export interface SourcePanelTextures {
  panel1: Texture;
  panel2: Texture;
  infoPanel: Texture;
}

export interface SourcePanelAtlas {
  human: SourcePanelTextures;
  orc: SourcePanelTextures;
}

export async function loadSourcePanelAtlas(): Promise<SourcePanelAtlas | null> {
  try {
    const [humanPanel1, humanPanel2, humanInfoPanel, orcPanel1, orcPanel2, orcInfoPanel] = await Promise.all([
      Assets.load<Texture>("/wargus/graphics/ui/human/panel_1.png"),
      Assets.load<Texture>("/wargus/graphics/ui/human/panel_2.png"),
      Assets.load<Texture>("/wargus/graphics/ui/human/infopanel.png"),
      Assets.load<Texture>("/wargus/graphics/ui/orc/panel_1.png"),
      Assets.load<Texture>("/wargus/graphics/ui/orc/panel_2.png"),
      Assets.load<Texture>("/wargus/graphics/ui/orc/infopanel.png")
    ]);
    return {
      human: { panel1: humanPanel1, panel2: humanPanel2, infoPanel: humanInfoPanel },
      orc: { panel1: orcPanel1, panel2: orcPanel2, infoPanel: orcInfoPanel }
    };
  } catch {
    console.warn("Unable to load Wargus source HUD panels.");
    return null;
  }
}

export function sourcePanelTexturesForRace(atlas: SourcePanelAtlas | null, race: string | null | undefined): SourcePanelTextures | null {
  if (!atlas) {
    return null;
  }
  const sourceRace: SourcePanelRace = race === "orc" ? "orc" : "human";
  return atlas[sourceRace];
}
