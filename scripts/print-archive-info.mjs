import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const TAG = "archive/full-port-pre-demo-cut";
const BRANCH = "archive/full-port";

function rev(ref) {
  try {
    return execSync(`git rev-parse ${ref}`, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const tagSha = rev(`${TAG}^{}`) ?? rev(TAG);
const branchSha = rev(BRANCH);

console.log("Wargus-TypeScript archive info");
console.log("Product: fixed Garden of war ladder demo only (see docs/DEMO-PRODUCT.md)");
console.log(`Tag: ${TAG} -> ${tagSha ?? "(missing — run freeze Task 1)"}`);
console.log(`Branch: ${BRANCH} -> ${branchSha ?? "(missing)"}`);
console.log("Docs: docs/ARCHIVE.md, docs/DEMO-PRODUCT.md, docs/DEMO-MAP.md, archive/MANIFEST.md");
if (!tagSha) process.exitCode = 1;
