import type { WorldState } from "../simulation/world";
import type { WargusMap } from "./types";
import { campaignMissionKey } from "./manifest";

const CAMPAIGN_PROGRESS_KEY = "wargus-ts-campaign-progress-v1";

export interface CampaignProgressState {
  lastCompletedMissionKey: string | null;
}

export function createCampaignProgressState(): CampaignProgressState {
  return {
    lastCompletedMissionKey: null
  };
}

export function resetCampaignProgressSession(state: CampaignProgressState): void {
  state.lastCompletedMissionKey = null;
}

export function loadCampaignProgress(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(CAMPAIGN_PROGRESS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function recordCampaignProgress(state: CampaignProgressState, activeMap: WargusMap | null, world: WorldState): void {
  if (!activeMap || world.matchState.status !== "victory") {
    return;
  }
  const key = campaignMissionKey(activeMap);
  if (!key || state.lastCompletedMissionKey === key) {
    return;
  }
  const completed = loadCampaignProgress();
  if (!completed.includes(key)) {
    completed.push(key);
    localStorage.setItem(CAMPAIGN_PROGRESS_KEY, JSON.stringify(completed));
  }
  state.lastCompletedMissionKey = key;
}
