import { readFileSync } from "node:fs";

const renderHud = readFileSync("src/view/renderHud.ts", "utf8");

function expect(needle, message) {
  if (!renderHud.includes(needle)) {
    throw new Error(message);
  }
}

expect("drawFixedDemoPortraitFrame", "Fixed demo HUD should render a framed selected-unit portrait.");
expect("portraitWidth = 76", "Selected-unit portrait should be substantially larger than command icons.");
expect("drawFixedDemoSelectedStats", "Selected-unit panel should show combat/role stats.");
expect("Damage ${damage}", "Selected-unit panel should show damage for attackers.");
expect("Armor ${armor}", "Selected-unit panel should show armor when present.");
expect("Range ${range}", "Selected-unit panel should show attack range when present.");
expect("Mana ${Math.floor(selected.mana)}/${selected.maxMana}", "Selected-unit panel should show mana for caster units.");
expect("drawFixedDemoMultiSelectStrip", "Multi-selection should render as a compact selectable strip.");
expect("Training ${label}", "Selected building panel should show active production.");

console.log("Fixed demo unit portrait/info panel verified.");
