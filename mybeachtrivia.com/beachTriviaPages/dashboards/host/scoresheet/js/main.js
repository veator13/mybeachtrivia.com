/* main.js
   Scoresheet bootstrap / wiring.

   Classic script style (no imports). This file should be loaded LAST once you
   rewrite index.html later.

   It is designed to work during the split:
   - If functions still live in app.js, it will call them.
   - If you move functions into new files, as long as you keep the same global
     names (or attach them to window), this will still work.

   Prevents double-binding with window.__scoresheetMainInitialized.
*/
(function () {
    "use strict";
  
    if (window.__scoresheetMainInitialized) return;
    window.__scoresheetMainInitialized = true;
  
    function $(sel, root) {
      // Prefer DomUtils if present
      if (window.DomUtils?.$) return window.DomUtils.$(sel, root);
      return (root || document).querySelector(sel);
    }
  
    function safeCall(fn, ...args) {
      try {
        if (typeof fn === "function") return fn(...args);
      } catch (e) {
        console.error("[scoresheet main] handler error:", e);
      }
      return undefined;
    }
  
    function bindClick(id, handler) {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("click", handler);
    }
  
    function bind() {
      // --- Meta field helpers (optional; depends on whether you’ve moved these yet)
      safeCall(window.setDefaultEventDateToday);
      safeCall(window.updateThemeFieldVisibility);
  
      // If eventType exists and you have theme toggling logic, run on change too
      const eventType = document.getElementById("eventType");
      if (eventType) {
        eventType.addEventListener("change", () => safeCall(window.updateThemeFieldVisibility));
      }
  
      // --- Core buttons
      bindClick("btnAddTeam", () => {
        // Common names across versions:
        // - addTeam()
        // - addTeamRow()
        safeCall(window.addTeam) ?? safeCall(window.addTeamRow);
      });
  
      bindClick("btnShowStandings", () => {
        // common: showStandings()
        safeCall(window.showStandings);
      });
  
      bindClick("btnSubmitScores", () => {
        // common: submitScores() / handleSubmitScores()
        safeCall(window.submitScores) ?? safeCall(window.handleSubmitScores);
      });
  
      // --- Search
      bindClick("btnSearch", () => {
        const q = (document.getElementById("teamSearch")?.value || "").trim();
        // common: searchTeams(query) or runTeamSearch()
        if (!safeCall(window.searchTeams, q)) safeCall(window.runTeamSearch, q);
      });
  
      const searchInput = document.getElementById("teamSearch");
      if (searchInput) {
        searchInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const q = (searchInput.value || "").trim();
            if (!safeCall(window.searchTeams, q)) safeCall(window.runTeamSearch, q);
          }
          if (e.key === "Escape") {
            // optional: clear highlights if implemented
            safeCall(window.clearHighlights);
            safeCall(window.clearTeamHighlights);
            searchInput.value = "";
          }
        });
      }
  
      // --- Standings modal controls
      bindClick("btnCloseModal", () => {
        safeCall(window.closeModal) ?? safeCall(window.hideStandingsModal);
      });
  
      // clicking backdrop closes modal (optional, but nice)
      const modal = document.getElementById("standingsModal");
      if (modal) {
        modal.addEventListener("click", (e) => {
          if (e.target === modal) {
            safeCall(window.closeModal) ?? safeCall(window.hideStandingsModal);
          }
        });
      }
  
      bindClick("btnInvertStandings", () => {
        // common: invertStandingsOrder() / toggleStandingsSort()
        safeCall(window.invertStandingsOrder) ?? safeCall(window.toggleStandingsSort);
      });
  
      // --- Grid Enforcer (your grid-enforcer.js auto-inits, but calling init twice is safe)
      safeCall(window.GridEnforcer?.init);
  
      // --- If your app expects any boot function, call it last
      // common: initApp() / initScoresheet()
      safeCall(window.initScoresheet) ?? safeCall(window.initApp);
    }
  
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bind, { once: true });
    } else {
      bind();
    }
  })();