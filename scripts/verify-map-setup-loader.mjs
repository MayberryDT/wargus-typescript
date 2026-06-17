import { readFileSync } from "node:fs";

const source = readFileSync("src/wargus/mapSetup.ts", "utf8");
const errors = [];

function error(message) {
  errors.push(message);
}

for (const fragment of [
  "response.text()",
  "content-type",
  "text/html",
  "trimStart().startsWith(\"<\")",
  "JSON.parse",
  "catch"
]) {
  if (!source.includes(fragment)) {
    error(`Map setup loader is missing guard fragment: ${fragment}`);
  }
}

if (source.includes("response.json()")) {
  error("Map setup loader should not call response.json() directly.");
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Map setup loader guard errors: ${errors.length}`);
  process.exit(1);
}

console.log("Map setup loader guard verified.");
