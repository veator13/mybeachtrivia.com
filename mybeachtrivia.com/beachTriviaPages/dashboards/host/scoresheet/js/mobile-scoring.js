/* mybeachtrivia.com/beachTriviaPages/dashboards/host/scoresheet/js/mobile-scoring.js
 *
 * Phone layout for the scoring table. The full table is ~33 columns — useless
 * on a phone. On <= 820px this adds a "view" dropdown above the table:
 *
 *   Setup            team name + delete + bonus + TEAM #  (no score columns)
 *   Round 1..4       team name (display) + that round's 5 inputs + round total
 *   Half Time        team name + Half Time input + First Half Total
 *   Final Question   team name + Final Question input + Second Half Total
 *   Results          team name + every total + Bonus + Final Score
 *
 * Switching a view just sets `#teamTable[data-mview]`; style.css hides the
 * columns that view doesn't need (via :has() selectors on the existing input
 * classes — no change to table-build.js or the score model). Desktop: the
 * dropdown isn't shown and no data-mview is set, so the full table renders.
 */
(function () {
  "use strict";

  var BP = 820;
  var SEL_ID = "score-view-select";
  var WRAP_ID = "score-view-bar";
  var LS_KEY = "bt:scoresheetMView";

  var VIEWS = [
    { key: "setup", label: "Setup — team names" },
    { key: "r1", label: "Round 1" },
    { key: "r2", label: "Round 2" },
    { key: "ht", label: "Half Time" },
    { key: "r3", label: "Round 3" },
    { key: "r4", label: "Round 4" },
    { key: "fq", label: "Final Question" },
    { key: "results", label: "Results — bonus & final" },
  ];

  function isMobile() {
    return window.matchMedia("(max-width: " + BP + "px)").matches;
  }

  function table() { return document.getElementById("teamTable"); }
  function wrapper() { return document.querySelector(".table-wrapper"); }

  function savedView() {
    try {
      var v = localStorage.getItem(LS_KEY);
      if (v && VIEWS.some(function (x) { return x.key === v; })) return v;
    } catch (e) {}
    return "setup";
  }

  function applyView(key) {
    var t = table();
    if (!t) return;
    t.setAttribute("data-mview", key);
    try { localStorage.setItem(LS_KEY, key); } catch (e) {}
    var w = wrapper();
    if (w) w.scrollLeft = 0;
  }

  function clearView() {
    var t = table();
    if (t) t.removeAttribute("data-mview");
  }

  function buildBar() {
    var bar = document.createElement("div");
    bar.id = WRAP_ID;
    bar.className = "score-view-bar";

    var label = document.createElement("label");
    label.setAttribute("for", SEL_ID);
    label.className = "score-view-bar__label";
    label.textContent = "View";

    var sel = document.createElement("select");
    sel.id = SEL_ID;
    sel.className = "score-view-bar__select";
    VIEWS.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v.key;
      o.textContent = v.label;
      sel.appendChild(o);
    });
    sel.value = savedView();
    sel.addEventListener("change", function () { applyView(this.value); });

    bar.appendChild(label);
    bar.appendChild(sel);
    return bar;
  }

  function sync() {
    var w = wrapper();
    if (!w || !w.parentNode) return;
    var existing = document.getElementById(WRAP_ID);

    if (!isMobile()) {
      if (existing) existing.remove();
      clearView();
      return;
    }
    if (!existing) {
      existing = buildBar();
      w.parentNode.insertBefore(existing, w);
    }
    var sel = document.getElementById(SEL_ID);
    applyView(sel ? sel.value : savedView());
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
    var tries = 0;
    var iv = setInterval(function () {
      if (wrapper() || ++tries > 40) {
        clearInterval(iv);
        sync();
      }
    }, 150);
    // The tbody is rebuilt on load / sort / add-team; re-apply the view class
    // (it lives on #teamTable, which survives, but be safe).
    var t = table();
    if (t && window.MutationObserver) {
      var mo = new MutationObserver(function () {
        if (isMobile() && !t.getAttribute("data-mview")) applyView(savedView());
      });
      mo.observe(t, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  window.BtScoreView = { apply: applyView, sync: sync };
})();
