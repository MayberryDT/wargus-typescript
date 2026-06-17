import type { WargusManifest, WargusMap, WargusMapSetup } from "./types";
import { applyFixedBrowserDemoSetup } from "./demoScenario";

export async function loadDefaultMapSetup(manifest: WargusManifest): Promise<WargusMapSetup | null> {
  if (!manifest.defaultMapSetup) {
    return null;
  }
  return loadSetupPath(manifest.defaultMapSetup);
}

export async function loadMapSetup(map: WargusMap): Promise<WargusMapSetup | null> {
  if (!map.setupJson) {
    return null;
  }
  const setup = await loadSetupPath(map.setupJson);
  return setup ? applyFixedBrowserDemoSetup(map, setup) : null;
}

async function loadSetupPath(path: string): Promise<WargusMapSetup | null> {
  const response = await fetch(`/wargus/${path}`, { cache: "no-store" });
  if (!response.ok) {
    return null;
  }
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (contentType.includes("text/html") || text.trimStart().startsWith("<")) {
    return null;
  }
  try {
    return JSON.parse(text) as WargusMapSetup;
  } catch {
    return null;
  }
}
