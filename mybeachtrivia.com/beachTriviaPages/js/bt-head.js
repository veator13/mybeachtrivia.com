/* bt-head.js — single source of truth for the shared <head> tags.
 *
 * Every page includes exactly this, as the FIRST line of its <head>:
 *   <script src="/beachTriviaPages/js/bt-head.js"></script>
 *
 * It injects the shared nav stylesheet + script (and anything else that used
 * to be copy-pasted into 27 pages). Change the shared tag list HERE, once.
 *
 * Served no-cache (see firebase.json) so this tiny file is always fresh; it
 * stamps the cache-busting version onto everything it injects, so the browser
 * always gets the current bt-nav.* after a deploy — no per-page ?v= edits.
 *
 * BT_ASSET_V is rewritten by  `node tools/cachebust.mjs`  (a content hash of
 * the referenced files). Run that before deploying a bt-nav.* change.
 *
 * document.write is deliberate: called while the parser is blocked on this
 * synchronous <script>, it inserts the tags exactly where a hand-written tag
 * would sit, and a written `<script defer>` keeps defer semantics. Do NOT load
 * this file with async/defer — it must run during head parsing.
 */
(function () {
  "use strict";

  var V = "c829b51bf4"; // BT_ASSET_V — managed by tools/cachebust.mjs
  var base = "/beachTriviaPages/js/";

  document.write(
    '<link rel="stylesheet" href="' + base + "bt-nav.css?v=" + V + '">' +
    '<script src="' + base + "bt-nav.js?v=" + V + '" defer><\/script>'
  );
})();
