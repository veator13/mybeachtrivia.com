/* main.js
   Scoresheet bootstrap / wiring (split-file version).
   - Creates default 5 rows
   - Starts venues listener
   - Binds meta listeners + theme toggle
   - Wires table input/change delegation (touched tracking, scoring)
   - Wires buttons, modal, search, invert standings
   - Sets up sticky width recalcs
   - Restores unload warning when there are unsaved changes

   Update:
   - If present, binds optional search nav arrows:
       #btnSearchPrev / #btnSearchNext
     (search.js should expose window.searchTeamsPrev / window.searchTeamsNext)
*/
(function () {
  "use strict";

  if (window.__scoresheetMainInitialized) return;
  window.__scoresheetMainInitialized = true;

  const $ = (sel, root = document) => root.querySelector(sel);

  function debounce(fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function safeCall(fn, ...args) {
    try {
      if (typeof fn === "function") return fn(...args);
    } catch (e) {
      console.error("[scoresheet main] handler error:", e);
    }
    return undefined;
  }

  function safeCallAsync(fn, ...args) {
    try {
      if (typeof fn !== "function") return;
      const out = fn(...args);
      if (out && typeof out.then === "function") {
        out.catch((e) => console.error("[scoresheet main] async error:", e));
      }
    } catch (e) {
      console.error("[scoresheet main] async handler error:", e);
    }
  }

  function bindClick(id, handler) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.dataset.bound) return;

    el.addEventListener("click", (e) => {
      try {
        handler(e);
      } catch (err) {
        console.error(`[scoresheet main] click handler failed for #${id}:`, err);
      }
    });

    el.dataset.bound = "1";
  }

  function markModified() {
    safeCall(window.ScoresheetState?.markAsModified);
    if (typeof window.markAsModified === "function") window.markAsModified();
    if (typeof window.dataModified === "boolean") window.dataModified = true;
  }

  function isModified() {
    if (window.ScoresheetState?.state) {
      if (typeof window.ScoresheetState.state.dataModified === "boolean") {
        return window.ScoresheetState.state.dataModified;
      }
    }
    if (typeof window.dataModified === "boolean") return window.dataModified;
    return false;
  }

  // --- Unload warning (refresh / close / navigate away)
  function bindBeforeUnloadWarningOnce() {
    if (window.__scoresheetBeforeUnloadBound) return;
    window.__scoresheetBeforeUnloadBound = true;

    window.addEventListener("beforeunload", (e) => {
      if (!isModified()) return;
      e.preventDefault();
      e.returnValue = "";
      return "";
    });
  }

  function getStandingsAscending() {
    if (window.ScoresheetState?.state) return !!window.ScoresheetState.state.standingsAscending;
    return !!window.standingsAscending;
  }

  function setStandingsAscending(v) {
    if (typeof window.ScoresheetState?.setStandingsAscending === "function") {
      window.ScoresheetState.setStandingsAscending(!!v);
    } else {
      window.standingsAscending = !!v;
    }
  }

  function ensureDefaultButtonBindings() {
    // Add Team
    bindClick("btnAddTeam", () => safeCall(window.addTeam));

    // Standings
    bindClick("btnShowStandings", () => {
      if (typeof window.showStandings === "function") return window.showStandings();
      if (typeof window.openStandingsModal === "function") return window.openStandingsModal();
      console.warn("[scoresheet main] No standings handler found (showStandings/openStandingsModal).");
    });

    // Submit Scores
    bindClick("btnSubmitScores", () => {
      if (typeof window.handleSubmitScores === "function") return window.handleSubmitScores();
      if (typeof window.submitScores === "function") return window.submitScores();
      console.warn("[scoresheet main] No submit handler found (handleSubmitScores/submitScores).");
    });

    // Modal close
    bindClick("btnCloseModal", () => safeCall(window.closeModal));

    const modal = document.getElementById("standingsModal");
    if (modal && !modal.dataset.boundOverlay) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) safeCall(window.closeModal);
      });
      modal.dataset.boundOverlay = "1";
    }

    // Invert standings order
    bindClick("btnInvertStandings", () => {
      const next = !getStandingsAscending();
      setStandingsAscending(next);

      const btn = document.getElementById("btnInvertStandings");
      if (btn) btn.setAttribute("aria-pressed", next ? "true" : "false");

      if (typeof window.showStandings === "function") return window.showStandings();
      if (typeof window.openStandingsModal === "function") return window.openStandingsModal();
    });

    // Search button: trigger explicit search (search.js handles live input bindings)
    bindClick("btnSearch", () => safeCall(window.searchTeams));

    // Optional: search match cycling arrows (if present in HTML)
    bindClick("btnSearchPrev", () => {
      if (typeof window.searchTeamsPrev === "function") return window.searchTeamsPrev();
      // Fallback (if search.js uses a single function with direction)
      if (typeof window.searchTeamsCycle === "function") return window.searchTeamsCycle(-1);
      return safeCall(window.searchTeams);
    });

    bindClick("btnSearchNext", () => {
      if (typeof window.searchTeamsNext === "function") return window.searchTeamsNext();
      if (typeof window.searchTeamsCycle === "function") return window.searchTeamsCycle(1);
      return safeCall(window.searchTeams);
    });

    // NOTE:
    // We intentionally do NOT bind keyup/input on #teamSearch here anymore,
    // because search.js now owns the live-search behavior to avoid duplicate listeners.
  }

  function bind() {
    // --- restore refresh warning
    bindBeforeUnloadWarningOnce();

    // --- meta defaults + listeners
    safeCall(window.setDefaultEventDateToday);
    safeCall(window.bindMetaFieldListeners);
    safeCall(window.updateThemeFieldVisibility);

    const eventType = document.getElementById("eventType");
    if (eventType && !eventType.dataset.boundThemeToggle) {
      eventType.addEventListener("change", () => safeCall(window.updateThemeFieldVisibility));
      eventType.dataset.boundThemeToggle = "1";
    }

    // --- venues
    safeCallAsync(window.startVenuesListener);

    // --- ensure tbody exists
    const table = document.getElementById("teamTable");
    if (table && !table.querySelector("tbody")) {
      table.appendChild(document.createElement("tbody"));
    }

    // --- create default 5 rows (only once)
    if (!window.__scoresheetDefaultRowsBuilt) {
      window.__scoresheetDefaultRowsBuilt = true;

      for (let i = 1; i <= 5; i++) safeCall(window.addTeam);

      // Start clean after initial build
      safeCall(window.ScoresheetState?.resetModifiedFlag);
      if (typeof window.dataModified === "boolean") window.dataModified = false;
    }

    // --- sticky widths
    safeCall(window.updateStickyRightWidths);
    const recalcSticky = debounce(() => safeCall(window.updateStickyRightWidths), 100);
    window.addEventListener("resize", recalcSticky);
    window.addEventListener("orientationchange", recalcSticky);
    window.addEventListener("load", recalcSticky);

    // --- table delegation
    table?.addEventListener("input", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) return;

      const row = target.closest("tr[data-team-id]");
      if (!row) return;

      const teamId = parseInt(row.dataset.teamId || "0", 10);
      if (!teamId) return;

      // team name changes
      if (target.classList.contains("teamName")) {
        markModified();
        return;
      }

      // mark touched for score inputs (trusted only)
      if (e.isTrusted) {
        if (
          target.classList.contains("bonus-input") ||
          target.id === `halfTime${teamId}` ||
          target.id === `finalQuestion${teamId}` ||
          /^num\d+\d+$/.test(target.id)
        ) {
          target.dataset.touched = "1";
        }
      }

      // bonus input validation + scoring
      if (target.classList.contains("bonus-input")) {
        markModified();
        if (target.value !== "") {
          const v = parseInt(target.value, 10);
          if (Number.isNaN(v) || v < 0) target.value = "0";
        }
        safeCall(window.updateScores, teamId);
        return;
      }

      // standard scoring validation pipeline
      if (
        target.id === `halfTime${teamId}` ||
        target.id === `finalQuestion${teamId}` ||
        /^num\d+\d+$/.test(target.id)
      ) {
        safeCall(window.validateInput, target, teamId);
        markModified();
      }
    });

    table?.addEventListener("change", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!target.classList.contains("teamCheckbox")) return;

      const row = target.closest("tr[data-team-id]");
      if (!row) return;

      const teamId = parseInt(row.dataset.teamId || "0", 10);
      if (!teamId) return;

      markModified();
      safeCall(window.updateFinalScore, teamId);
    });

    // --- buttons, modal, search
    ensureDefaultButtonBindings();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})();