import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const OWNED_TEMP_PREFIX = ".wargus-summary-publish-";
let publicationSerial = 0;

export const summaryPublicationOperations = Object.freeze({
  cleanupTemp: ({ file }) => unlinkSync(file),
  constructManifest: constructProjectedManifest,
  renameTemp: renamePublishedTemp,
  verifyManifest: verifyProjectedManifest,
  writeTemp: writeDurableTemp
});

export function withManifestIntegrity(summary, pass) {
  return {
    ...summary,
    ready: summary.ready === true && pass === true,
    acceptance: {
      ...summary.acceptance,
      incrementalAccepted: summary.acceptance?.incrementalAccepted === true && pass === true,
      absoluteReleaseAccepted: summary.acceptance?.absoluteReleaseAccepted === true && pass === true,
      accepted: summary.acceptance?.accepted === true && pass === true
    },
    lifecycle: { ...summary.lifecycle, finalizationPass: summary.lifecycle?.finalizationPass !== false && pass === true, checksumManifestPass: pass === true }
  };
}

export function publishChecksummedSummary(directory, summary, { operations = summaryPublicationOperations, writeFailure = () => {} } = {}) {
  const downgraded = withManifestIntegrity(summary, false);
  const ready = withManifestIntegrity(summary, true);
  let temp = null;
  let activeTemps = [];
  const failures = [];

  try {
    temp = allocateTempPaths(directory);
    activeTemps = [temp.downgradedSummary, temp.readySummary, temp.manifest];
    operations.writeTemp({ phase: "downgraded-summary", file: temp.downgradedSummary, content: jsonText(downgraded) });
    operations.renameTemp({ phase: "downgraded-summary", from: temp.downgradedSummary, to: path.join(directory, "matrix-summary.json"), directory, final: false });

    for (const file of ownedTempFiles(directory)) {
      try { operations.cleanupTemp({ phase: "stale-temp", file }); }
      catch (cleanupError) { cleanupError.summaryPublicationStep = "checksummed-summary-temp-cleanup"; throw cleanupError; }
    }

    operations.writeTemp({ phase: "ready-summary", file: temp.readySummary, content: jsonText(ready) });
    const manifest = operations.constructManifest({ directory, readySummaryFile: temp.readySummary });
    operations.writeTemp({ phase: "manifest", file: temp.manifest, content: jsonText(manifest) });
    operations.verifyManifest({ directory, manifestFile: temp.manifest, readySummaryFile: temp.readySummary });
    operations.renameTemp({ phase: "manifest", from: temp.manifest, to: path.join(directory, "sha256.json"), directory, final: false });
    operations.renameTemp({ phase: "ready-summary", from: temp.readySummary, to: path.join(directory, "matrix-summary.json"), directory, final: true });
    return { summary: ready, published: true, failures: [] };
  } catch (error) {
    failures.push(failureRecord(error?.summaryPublicationStep ?? "checksummed-summary-publication", error));
    for (const file of activeTemps) {
      try { if (existsSync(file)) operations.cleanupTemp({ phase: "failed-publication", file }); }
      catch (cleanupError) { failures.push(failureRecord("checksummed-summary-temp-cleanup", cleanupError)); }
    }
    try { writeFailure(failures); }
    catch (failureWriteError) { failures.push(failureRecord("checksummed-summary-failure-record", failureWriteError)); }
    return { summary: downgraded, published: false, failures };
  }
}

function allocateTempPaths(directory) {
  let stem;
  let files;
  do {
    publicationSerial += 1;
    stem = `${OWNED_TEMP_PREFIX}${process.pid}-${publicationSerial}`;
    files = {
      downgradedSummary: path.join(directory, `${stem}-downgraded.tmp`),
      readySummary: path.join(directory, `${stem}-ready.tmp`),
      manifest: path.join(directory, `${stem}-manifest.tmp`)
    };
  } while (Object.values(files).some((file) => existsSync(file)));
  return files;
}

function ownedTempFiles(directory) {
  return readdirSync(directory)
    .filter((name) => name.startsWith(OWNED_TEMP_PREFIX) && name.endsWith(".tmp"))
    .map((name) => path.join(directory, name));
}

function finalArtifactNames(directory) {
  return readdirSync(directory)
    .filter((name) => name !== "sha256.json" && !(name.startsWith(OWNED_TEMP_PREFIX) && name.endsWith(".tmp")))
    .sort();
}

function constructProjectedManifest({ directory, readySummaryFile }) {
  const names = finalArtifactNames(directory);
  if (!names.includes("matrix-summary.json")) throw new Error("Projected manifest requires a published non-ready matrix-summary.json.");
  return names.map((name) => ({
    name,
    sha256: sha256(readFileSync(name === "matrix-summary.json" ? readySummaryFile : path.join(directory, name)))
  }));
}

function verifyProjectedManifest({ directory, manifestFile, readySummaryFile }) {
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  const names = finalArtifactNames(directory);
  if (JSON.stringify(manifest.map((record) => record.name)) !== JSON.stringify(names)) throw new Error("Projected sha256.json does not cover the exact final artifact set.");
  for (const record of manifest) {
    const source = record.name === "matrix-summary.json" ? readySummaryFile : path.join(directory, record.name);
    if (record.sha256 !== sha256(readFileSync(source))) throw new Error("Projected sha256.json verification failed for " + record.name + ".");
  }
}

function writeDurableTemp({ file, content }) {
  let descriptor;
  try {
    descriptor = openSync(file, "wx", 0o600);
    writeFileSync(descriptor, content, "utf8");
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function renamePublishedTemp({ from, to, directory, final }) {
  renameSync(from, to);
  if (!final) syncDirectory(directory);
}

function syncDirectory(directory) {
  const descriptor = openSync(directory, "r");
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function failureRecord(step, error) {
  return { step, name: error?.name ?? "Error", message: String(error?.message ?? error), stack: error?.stack ?? null };
}

function jsonText(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
