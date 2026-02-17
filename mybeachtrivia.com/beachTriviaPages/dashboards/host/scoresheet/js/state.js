/* state.js
   Shared state for the Host Scoresheet.

   IMPORTANT:
   Some split files (ported from app.js) still reference `teamCount`,
   `dataModified`, `standingsAscending` as *identifiers* (not window.*).
   In classic scripts, that requires `var` globals.

   Exposes:
     - window.ScoresheetState (preferred)
     - legacy globals (IDENTIFIERS): teamCount, dataModified, standingsAscending
     - helpers: markAsModified(), resetModifiedFlag(), setStandingsAscending(),
                incrementTeamCount(), setTeamCount()
*/

/* ✅ Legacy global bindings (must be var to create real global identifiers) */
var teamCount = 0;
var dataModified = false;
var standingsAscending = false;

(function () {
  "use strict";

  const state = {
    get teamCount() {
      return teamCount;
    },
    set teamCount(v) {
      teamCount = Number.isFinite(+v) ? +v : 0;
      window.teamCount = teamCount;
    },

    get dataModified() {
      return dataModified;
    },
    set dataModified(v) {
      dataModified = !!v;
      window.dataModified = dataModified;
    },

    get standingsAscending() {
      return standingsAscending;
    },
    set standingsAscending(v) {
      standingsAscending = !!v;
      window.standingsAscending = standingsAscending;
    },
  };

  function syncLegacyGlobals() {
    // keep window.* mirrors aligned (optional but nice for debugging)
    window.teamCount = teamCount;
    window.dataModified = dataModified;
    window.standingsAscending = standingsAscending;
  }

  function markAsModified() {
    state.dataModified = true;
  }

  function resetModifiedFlag() {
    state.dataModified = false;
  }

  function setStandingsAscending(v) {
    state.standingsAscending = !!v;
  }

  function incrementTeamCount() {
    state.teamCount = state.teamCount + 1;
    return state.teamCount;
  }

  function setTeamCount(n) {
    state.teamCount = n;
    return state.teamCount;
  }

  // init mirrors once
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

  // Back-compat helper names
  window.markAsModified = window.markAsModified || markAsModified;
  window.resetModifiedFlag = window.resetModifiedFlag || resetModifiedFlag;
  window.setStandingsAscending =
    window.setStandingsAscending || setStandingsAscending;
  window.incrementTeamCount = window.incrementTeamCount || incrementTeamCount;
  window.setTeamCount = window.setTeamCount || setTeamCount;
})();