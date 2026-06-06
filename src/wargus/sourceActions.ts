const SOURCE_EXPLORE_ON_READY_ACTIONS = new Set(["AiExploreUnit"]);

export function isExploreOnReadyValue(onReady: string | null | undefined): boolean {
  return typeof onReady === "string" && SOURCE_EXPLORE_ON_READY_ACTIONS.has(onReady);
}
