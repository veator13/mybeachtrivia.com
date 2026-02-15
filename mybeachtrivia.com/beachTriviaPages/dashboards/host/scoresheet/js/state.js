/* state.js
   Shared state for the Host Scoresheet.

   Classic script style (no imports). Exposes:
     - window.ScoresheetState (preferred for new files)
     - legacy globals: window.teamCount, window.dataModified, window.standingsAscending

   Helpers:
     - markAsModified()
     - resetModifiedFlag()
     - setStandingsAscending(bool)
     - incrementTeamCount()
*/
(function () {
    "use strict";
  
    const state = {
      teamCount: 0,
      dataModified: false,
      standingsAscending: false,
    };
  
    function syncLegacyGlobals() {
      window.teamCount = state.teamCount;
      window.dataModified = state.dataModified;
      window.standingsAscending = state.standingsAscending;
    }
  
    function markAsModified() {
      state.dataModified = true;
      syncLegacyGlobals();
    }
  
    function resetModifiedFlag() {
      state.dataModified = false;
      syncLegacyGlobals();
    }
  
    function setStandingsAscending(v) {
      state.standingsAscending = !!v;
      syncLegacyGlobals();
    }
  
    function incrementTeamCount() {
      state.teamCount += 1;
      syncLegacyGlobals();
      return state.teamCount;
    }
  
    function setTeamCount(n) {
      const nn = Number(n);
      state.teamCount = Number.isFinite(nn) ? nn : 0;
      syncLegacyGlobals();
      return state.teamCount;
    }
  
    // Initialize legacy globals (in case app.js reads them early)
    syncLegacyGlobals();
  
    window.ScoresheetState = {
      state,
      syncLegacyGlobals,
      markAsModified,
      resetModifiedFlag,
      setStandingsAscending,
      incrementTeamCount,
      setTeamCount,
    };
  
    // Back-compat global helpers (optional)
    window.markAsModified = window.markAsModified || markAsModified;
  })();