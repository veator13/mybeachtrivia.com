/* mybeachtrivia.com/beachTriviaPages/dashboards/host/scoresheet/js/mobile-scoring.js
 *
 * Phone helper for the scoring table. The table is ~33 columns wide, so on a
 * phone you're lost the moment you scroll sideways. This adds a sticky
 * "jump to round" bar above the table — tap R1 / R2 / HT / R3 / R4 / Final /
 * Bonus / Total and the table scrolls so that section lands right next to the
 * frozen Team Name column.
 *
 * Pure DOM + scrollLeft. No change to the score model or table-build.js.
 * Only active <= 820px; desktop is untouched.
 */
(function () {
  "use strict";

  var BP = 820;
  var BAR_ID = "score-jumpbar";

  // label -> regex that identifies the section's <th> in the first header row
  var SECTIONS = [
    { key: "r1", label: "R1", rx: /round\s*1/i },
    { key: "r2", label: "R2", rx: /round\s*2/i },
    { key: "ht", label: "HT", rx: /half\s*time/i },
    { key: "r3", label: "R3", rx: /round\s*3/i },
    { key: "r4", label: "R4", rx: /round\s*4/i },
    { key: "fq", label: "FQ", rx: /final\s*question/i },
    { key: "bonus", label: "B", rx: /^bonus$/i },
    { key: "final", label: "Tot", rx: /final\s*score/i },
  ];

  function isMobile() {
    return window.matchMedia("(max-width: " + BP + "px)").matches;
  }

  function wrapper() { return document.querySelector(".table-wrapper"); }
  function table() { return document.getElementById("teamTable"); }

  function headerCells() {
    var t = table();
    if (!t) return [];
    var row = t.querySelector("thead tr.top_row");
    return row ? Array.prototype.slice.call(row.children) : [];
  }

  function stickyWidth() {
    var c = document.querySelector("#teamTable td.sticky-col, #teamTable th.sticky-col");
    return c ? c.getBoundingClientRect().width : 0;
  }

  // Scroll the table-wrapper so the matched section header sits just to the
  // right of the frozen Team column. Uses live on-screen rects + scrollBy so
  // it doesn't depend on offsetParent quirks under sticky/border-collapse.
  function jumpTo(rx) {
    var w = wrapper();
    if (!w) return;
    var th = headerCells().filter(function (el) {
      return rx.test((el.textContent || "").replace(/\s+/g, " ").trim());
    })[0];
    if (!th) return;

    var wRect = w.getBoundingClientRect();
    var thRect = th.getBoundingClientRect();
    var delta = thRect.left - wRect.left - stickyWidth() - 6;

    var maxLeft = w.scrollWidth - w.clientWidth;
    var target = Math.max(0, Math.min(w.scrollLeft + delta, maxLeft));

    // Direct assignment always works; scrollTo({behavior:"smooth"}) is a silent
    // no-op on this page. CSS `scroll-behavior: smooth` on .table-wrapper
    // animates the assignment.
    w.scrollLeft = target;
  }

  function buildBar() {
    var bar = document.createElement("div");
    bar.id = BAR_ID;
    bar.className = "score-jumpbar";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Jump to round");

    SECTIONS.forEach(function (s) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "score-jumpbar__chip";
      b.textContent = s.label;
      b.addEventListener("click", function () { jumpTo(s.rx); });
      bar.appendChild(b);
    });
    return bar;
  }

  function sync() {
    var w = wrapper();
    if (!w || !w.parentNode) return;
    var existing = document.getElementById(BAR_ID);

    if (!isMobile()) {
      if (existing) existing.remove();
      return;
    }
    if (!existing) {
      w.parentNode.insertBefore(buildBar(), w);
    }
  }

  var _t;
  function debouncedSync() {
    clearTimeout(_t);
    _t = setTimeout(sync, 120);
  }

  window.addEventListener("resize", debouncedSync);
  window.addEventListener("orientationchange", debouncedSync);

  function start() {
    sync();
    // The table body is rebuilt on load / sort / team add; the bar lives
    // outside it so it survives, but the wrapper itself may mount late.
    var tries = 0;
    var iv = setInterval(function () {
      if (wrapper() || ++tries > 40) {
        clearInterval(iv);
        sync();
      }
    }, 150);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  window.BtScoreJump = { jumpTo: jumpTo, sync: sync };
})();
