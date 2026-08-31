#!/usr/bin/env node
/* tools/cachebust.mjs
 *
 * Rewrites the BT_ASSET_V constant in beachTriviaPages/js/bt-head.js to a
 * content hash of the shared assets it injects. Run this whenever you change
 * one of those assets, before deploying:
 *
 *   node tools/cachebust.mjs
 *
 * bt-head.js is served no-cache, so the new hash reaches every page on the
 * next load — no more site-wide sed over 27 HTML files.
 *
 * --check : exit 1 if the stamp is stale (for a pre-deploy guard / CI) instead
 *           of writing.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Files whose content the injected ?v= should track. Add to this list if
// bt-head.js starts injecting more shared assets.
const HASHED = [
  "beachTriviaPages/js/bt-nav.js",
  "beachTriviaPages/js/bt-nav.css",
];

const HEAD_FILE = join(ROOT, "beachTriviaPages/js/bt-head.js");
const STAMP_RE = /(var V = ")([0-9a-f]{6,40})(";)/;

const h = createHash("sha256");
for (const rel of HASHED) h.update(readFileSync(join(ROOT, rel)));
const want = h.digest("hex").slice(0, 10);

const src = readFileSync(HEAD_FILE, "utf8");
const m = src.match(STAMP_RE);
if (!m) {
  console.error("cachebust: could not find `var V = \"...\";` in bt-head.js");
  process.exit(2);
}
const have = m[2];

if (process.argv.includes("--check")) {
  if (have === want) {
    console.log(`cachebust: up to date (${want})`);
    process.exit(0);
  }
  console.error(`cachebust: STALE — bt-head.js has ${have}, assets hash to ${want}. Run: node tools/cachebust.mjs`);
  process.exit(1);
}

if (have === want) {
  console.log(`cachebust: already ${want}, nothing to do`);
  process.exit(0);
}

writeFileSync(HEAD_FILE, src.replace(STAMP_RE, `$1${want}$3`));
console.log(`cachebust: ${have} -> ${want}`);
