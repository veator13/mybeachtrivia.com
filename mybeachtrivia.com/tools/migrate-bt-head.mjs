#!/usr/bin/env node
/* tools/migrate-bt-head.mjs — ONE-TIME migration.
 *
 * Replaces the hand-written pair
 *   <link rel="stylesheet" href="/beachTriviaPages/js/bt-nav.css...">
 *   <script src="/beachTriviaPages/js/bt-nav.js..." defer></script>
 * with a single
 *   <script src="/beachTriviaPages/js/bt-head.js"></script>
 * in every page under beachTriviaPages/ (skipping .claude worktree copies).
 *
 * Dry-run by default; pass --write to apply.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");

const CSS_RE = /^[ \t]*<link rel="stylesheet" href="\/beachTriviaPages\/js\/bt-nav\.css[^"]*"[ \t]*\/?>\r?\n/m;
const JS_RE = /^([ \t]*)<script src="\/beachTriviaPages\/js\/bt-nav\.js[^"]*"[ \t]+defer><\/script>/m;
const INCLUDE = '<script src="/beachTriviaPages/js/bt-head.js"></script>';

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === ".claude" || name === "node_modules") continue;
    const s = statSync(p);
    if (s.isDirectory()) yield* htmlFiles(p);
    else if (name.endsWith(".html")) yield p;
  }
}

let changed = 0, skipped = 0;
for (const file of htmlFiles(join(ROOT, "beachTriviaPages"))) {
  const src = readFileSync(file, "utf8");
  if (!JS_RE.test(src)) continue;
  if (src.includes("bt-head.js")) { skipped++; continue; }

  let out = src.replace(CSS_RE, "");
  out = out.replace(JS_RE, (_m, indent) => indent + INCLUDE);

  if (out === src) { console.warn("!! no change:", file); continue; }
  // Sanity: nav refs should be gone (bt-head.js injects them at runtime).
  if (/bt-nav\.(css|js)"/.test(out.replace(/<!--[\s\S]*?-->/g, ""))) {
    console.warn("!! leftover bt-nav ref after edit:", file);
  }
  changed++;
  console.log((WRITE ? "wrote  " : "would  ") + file.replace(ROOT + "/", ""));
  if (WRITE) writeFileSync(file, out);
}
console.log(`\n${changed} file(s) ${WRITE ? "updated" : "to update"}, ${skipped} already migrated`);
