import { readFileSync } from "node:fs";

const mainSource = readFileSync("src/main.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const errors = [];

for (const fragment of [
  "function playPlacementErrorSound(position: Pick<WorldUnit, \"x\"> | null = pointerWorldPosition): void",
  "sourceStereoPanForUnitBase(position, camera, playableCameraViewport())",
  "audioEngine?.playSound(findGameSoundId(\"placement-error\", localPlayerRace()), pan)",
  "playPlacementErrorSound(unit)",
  "playPlacementErrorSound(result.feedbackUnit ?? null)",
  "verify:source-command-error-audio-pan"
]) {
  const source = fragment === "verify:source-command-error-audio-pan" ? JSON.stringify(packageJson.scripts) : mainSource;
  if (!source.includes(fragment)) {
    errors.push(`Missing source command error audio pan fragment: ${fragment}`);
  }
}

if (mainSource.includes('audioEngine?.playSound(findGameSoundId("placement-error", localPlayerRace()))')) {
  errors.push("Placement-error sounds should flow through playPlacementErrorSound so Wargus StereoSound panning is preserved.");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  console.error(`Source command error audio pan verifier failed: ${errors.length}`);
  process.exit(1);
}

console.log("Source command error audio panning verified (placement-error uses unit or pointer position).");
