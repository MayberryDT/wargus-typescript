import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { MpqArchive } = require("stormlib-js");

const defaultArchive = "/home/tyler/.var/app/com.usebottles.bottles/data/bottles/bottles/WarcraftII/drive_c/GOGGames/WarcraftII/Install.mpq";
const archivePath = process.env.WAR2_INSTALL_MPQ ?? process.argv[2] ?? defaultArchive;
const outputRoot = process.env.WAR2_MUSIC_OUT ?? process.argv[3] ?? "public/wargus/music";

const tracks = [
  ["Music\\HUMAN1.WAV", "Human Battle 1.wav"],
  ["Music\\HWARROOM.WAV", "Human Briefing.wav"],
  ["Music\\HVICTORY.WAV", "Human Victory.wav"]
];

mkdirSync(outputRoot, { recursive: true });
const archive = MpqArchive.open(archivePath, { noHeaderSearch: false });

try {
  for (const [source, target] of tracks) {
    if (!archive.hasFile(source)) {
      throw new Error(`Missing Warcraft II music track in MPQ: ${source}`);
    }
    const data = archive.extractFile(source);
    if (data.subarray(0, 4).toString("ascii") !== "RIFF" || data.subarray(8, 12).toString("ascii") !== "WAVE") {
      throw new Error(`Extracted track is not a WAV file: ${source}`);
    }
    const targetPath = path.join(outputRoot, target);
    writeFileSync(targetPath, data);
    console.log(`Extracted ${source} -> ${targetPath} (${data.length} bytes)`);
  }
} finally {
  archive.close();
}
