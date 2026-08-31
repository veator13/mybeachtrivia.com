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
    { key: "setup", label: "Setup — Team Names" },
    { key: "r1", label: "Round 1" },
    { key: "r2", label: "Round 2" },
    { key: "ht", label: "Half Time" },
    { key: "r3", label: "Round 3" },
    { key: "r4", label: "Round 4" },
    { key: "fq", label: "Final Question" },
    { key: "results", label: "Results — Bonus & Final" },
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

    var label = document.createElement("span");
    label.className = "score-view-bar__label";
    label.textContent = "View";

    // Custom combobox that matches the Venue picker (.venue-combo*), so the
    // option list is fully stylable (native <select> popups aren't).
    var combo = document.createElement("div");
    combo.className = "venue-combo score-view-combo";
    combo.setAttribute("aria-expanded", "false");

    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = SEL_ID;
    btn.className = "score-view-combo__btn";
    btn.setAttribute("aria-haspopup", "listbox");

    var list = document.createElement("div");
    list.className = "venue-combo__list";
    list.setAttribute("role", "listbox");

    var current = savedView();

    function labelFor(k) {
      for (var i = 0; i < VIEWS.length; i++) if (VIEWS[i].key === k) return VIEWS[i].label;
      return VIEWS[0].label;
    }
    function setOpen(open) {
      combo.setAttribute("aria-expanded", open ? "true" : "false");
    }
    function choose(k) {
      current = k;
      btn.textContent = labelFor(k);
      list.querySelectorAll(".venue-combo__item").forEach(function (el) {
        el.setAttribute("aria-selected", el.getAttribute("data-key") === k ? "true" : "false");
      });
      applyView(k);
      setOpen(false);
    }

    VIEWS.forEach(function (v) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "venue-combo__item";
      item.setAttribute("role", "option");
      item.setAttribute("data-key", v.key);
      item.setAttribute("aria-selected", v.key === current ? "true" : "false");
      item.textContent = v.label;
      item.addEventListener("click", function () { choose(v.key); });
      list.appendChild(item);
    });

    btn.textContent = labelFor(current);
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      setOpen(combo.getAttribute("aria-expanded") !== "true");
    });
    document.addEventListener("click", function (e) {
      if (!combo.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setOpen(false);
    });

    combo.appendChild(btn);
    combo.appendChild(list);
    bar.appendChild(label);
    bar.appendChild(combo);
    return bar;
  }

  var ADD_ID = "score-add-team-bottom";

  function buildAddTeam() {
    var b = document.createElement("button");
    b.id = ADD_ID;
    b.type = "button";
    b.className = "score-add-team-bottom";
    b.textContent = "+ Add Team";
    b.addEventListener("click", function () {
      try {
        if (typeof window.addTeam === "function") window.addTeam();
        else {
          var top = document.getElementById("btnAddTeam");
          if (top) top.click();
        }
      } catch (e) {}
      // bring the new (last) row into view
      setTimeout(function () {
        var rows = document.querySelectorAll("#teamTable tbody tr");
        var last = rows[rows.length - 1];
        if (last) last.scrollIntoView({ block: "center", behavior: "smooth" });
        var nameInput = last && last.querySelector("input.teamName");
        if (nameInput) { try { nameInput.focus(); } catch (e) {} }
      }, 60);
    });
    return b;
  }

  function sync() {
    var w = wrapper();
    if (!w || !w.parentNode) return;
    var existing = document.getElementById(WRAP_ID);
    var addBtn = document.getElementById(ADD_ID);

    if (!isMobile()) {
      if (existing) existing.remove();
      if (addBtn) addBtn.remove();
      clearView();
      return;
    }
    if (!existing) {
      existing = buildBar();
      w.parentNode.insertBefore(existing, w);
    }
    if (!addBtn) {
      addBtn = buildAddTeam();
      if (w.nextSibling) w.parentNode.insertBefore(addBtn, w.nextSibling);
      else w.parentNode.appendChild(addBtn);
    }
    applyView(savedView());
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
