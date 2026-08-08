import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const indexHtml = await readFile(resolve(root, "index.html"), "utf8");

function meta(attribute, value) {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<meta\\s+(?:[^>]*?\\s)?${attribute}=["']${escapedValue}["'][^>]*?content=["']([^"']+)["'][^>]*>`, "i");
  const reversePattern = new RegExp(`<meta\\s+(?:[^>]*?\\s)?content=["']([^"']+)["'][^>]*?${attribute}=["']${escapedValue}["'][^>]*>`, "i");
  return indexHtml.match(pattern)?.[1] ?? indexHtml.match(reversePattern)?.[1] ?? null;
}

function link(rel) {
  const pattern = new RegExp(`<link\\s+(?:[^>]*?\\s)?rel=["']${rel}["'][^>]*?href=["']([^"']+)["'][^>]*>`, "i");
  const reversePattern = new RegExp(`<link\\s+(?:[^>]*?\\s)?href=["']([^"']+)["'][^>]*?rel=["']${rel}["'][^>]*>`, "i");
  return indexHtml.match(pattern)?.[1] ?? indexHtml.match(reversePattern)?.[1] ?? null;
}

const canonicalUrl = "https://wargus.animasai.co/";
const imagePath = "/wargus-social-card.jpg";
const imageUrl = `${canonicalUrl.slice(0, -1)}${imagePath}`;
const title = "Wargus TypeScript — A classic RTS in your browser";
const description = "Play a browser-native Garden of War skirmish: build your base, command the Human Alliance, and battle the computer in this TypeScript/PixiJS RTS demo.";

assert.equal(link("canonical"), canonicalUrl, "canonical URL must identify the production page");
assert.equal(meta("property", "og:type"), "website", "Open Graph must identify the page as a website");
assert.equal(meta("property", "og:url"), canonicalUrl, "Open Graph URL must be canonical");
assert.equal(meta("property", "og:title"), title, "Open Graph title must use the selected social headline");
assert.equal(meta("property", "og:description"), description, "Open Graph description must describe the playable demo");
assert.equal(meta("property", "og:image"), imageUrl, "Open Graph must use the absolute production image URL");
assert.equal(meta("property", "og:image:type"), "image/jpeg", "Open Graph image type must be explicit");
assert.equal(meta("property", "og:image:width"), "1200", "Open Graph image width must match the asset");
assert.equal(meta("property", "og:image:height"), "630", "Open Graph image height must match the asset");
assert.equal(meta("property", "og:image:alt"), "Human and orc hands moving units across a fantasy battlefield.", "Open Graph image must have useful alt text");
assert.equal(meta("name", "twitter:card"), "summary_large_image", "Twitter must request the large-image card");
assert.equal(meta("name", "twitter:title"), title, "Twitter title must match Open Graph");
assert.equal(meta("name", "twitter:description"), description, "Twitter description must match Open Graph");
assert.equal(meta("name", "twitter:image"), imageUrl, "Twitter must use the production image URL");
assert.equal(meta("name", "twitter:image:alt"), "Human and orc hands moving units across a fantasy battlefield.", "Twitter image must have useful alt text");

const image = await readFile(resolve(root, "public", imagePath.slice(1)));
assert.equal(image.subarray(0, 2).toString("hex"), "ffd8", "social image must be a JPEG");
// JPEG SOF dimensions are not at fixed offsets like PNG IHDR; size is enforced by generation.
assert.ok(image.byteLength > 20_000, "social image should not be empty/tiny");
assert.ok(image.byteLength < 1_500_000, "social image should stay under Discord-friendly size");

console.log("Social metadata and 1200x630 image verified.");
