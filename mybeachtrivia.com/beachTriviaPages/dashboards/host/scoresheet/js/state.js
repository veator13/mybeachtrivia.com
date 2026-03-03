/* state.js
   Shared state for the Host Scoresheet.

   ✅ ONLINE/OFFLINE detection + UI wiring:
   - Shows ONE badge at all times:
       - #onlineBadge when online
       - #offlineBadge when offline
   - Force-hides any other badges (ex: #offlineBadgeInline)
   - When OFFLINE:
       - hide/disable #venueSelect
       - show/enable #venueInput
       - #venueInput required
   - When ONLINE:
       - show/enable #venueSelect
       - hide/disable #venueInput
       - #venueSelect required

   ✅ Venue "Other" inline field:
   - When ONLINE:
       - if #venueSelect value === "other":
           - show/enable #venueOtherInput
           - #venueOtherInput required
       - else:
           - hide/disable #venueOtherInput
           - not required
   - When OFFLINE:
       - #venueOtherInput is always hidden/disabled/not-required
         (offline uses #venueInput only)

   IMPORTANT CHANGE (fixes SW “fake online” on first load):
   - We DO NOT trust "navigator.onLine" or a fetch probe as truth (SW can satisfy from cache).
   - We default to OFFLINE until venues.js proves Firestore is reachable and calls:
       window.ScoresheetState.setOffline(false)

   Exposes:
     - window.ScoresheetState (preferred)
     - legacy globals (IDENTIFIERS): teamCount, dataModified, standingsAscending
     - helpers: markAsModified(), resetModifiedFlag(), setStandingsAscending(),
                incrementTeamCount(), setTeamCount()
     - connectivity:
         - window.ScoresheetState.setOffline(boolean)
         - window.ScoresheetState.isOffline()
*/

/* ✅ Legacy global bindings (must be var to create real global identifiers) */
var teamCount = 0;
var dataModified = false;
var standingsAscending = false;

(function () {
  "use strict";

  // -----------------------------
  // Internal state (+ legacy)
  // -----------------------------
  let offline = true; // ✅ default OFFLINE until proven online (venues.js flips it)

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

    get offline() {
      return offline;
    },
    set offline(v) {
      offline = !!v;
      window.offline = offline; // optional debug mirror
    },
  };

  function syncLegacyGlobals() {
    window.teamCount = teamCount;
    window.dataModified = dataModified;
    window.standingsAscending = standingsAscending;
    window.offline = offline;
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

  // -----------------------------
  // UI helpers
  // -----------------------------
  function qs(id) {
    return document.getElementById(id);
  }

  function setHidden(el, shouldHide) {
    if (!el) return;
    el.hidden = !!shouldHide;
  }

  function setDisabled(el, shouldDisable) {
    if (!el) return;
    el.disabled = !!shouldDisable;
    if (shouldDisable) el.setAttribute("aria-disabled", "true");
    else el.removeAttribute("aria-disabled");
  }

  function setRequired(el, required) {
    if (!el) return;
    if (required) el.setAttribute("required", "required");
    else el.removeAttribute("required");
  }

  function setAriaHidden(el, yes) {
    if (!el) return;
    if (yes) el.setAttribute("aria-hidden", "true");
    else el.removeAttribute("aria-hidden");
  }

  // -----------------------------
  // Venue "Other" logic (ONLINE only)
  // -----------------------------
  function applyVenueOtherUI(isOffline) {
    const venueSelect = qs("venueSelect");
    const venueOtherInput = qs("venueOtherInput");

    // If the HTML doesn't have it yet, noop safely.
    if (!venueOtherInput) return;

    // Offline mode never uses venueOtherInput
    if (isOffline) {
      setDisabled(venueOtherInput, true);
      setHidden(venueOtherInput, true);
      setRequired(venueOtherInput, false);
      return;
    }

    // Online mode: show only when select === "other"
    const isOther = !!venueSelect && venueSelect.value === "other";

    setDisabled(venueOtherInput, !isOther);
    setHidden(venueOtherInput, !isOther);
    setRequired(venueOtherInput, isOther);

    // If switching away from "other", clear the field so it doesn't linger
    if (!isOther) venueOtherInput.value = "";
  }

  function bindVenueOtherListenerOnce() {
    if (window.__scoresheetVenueOtherBound) return;
    window.__scoresheetVenueOtherBound = true;

    const bind = () => {
      const venueSelect = qs("venueSelect");
      if (!venueSelect) return;

      venueSelect.addEventListener(
        "change",
        () => {
          // Only matters when ONLINE
          applyVenueOtherUI(state.offline);
        },
        { passive: true }
      );

      // In case venues are populated after load and value changes programmatically
      // (venues.js), we can re-apply when focus leaves.
      venueSelect.addEventListener(
        "blur",
        () => applyVenueOtherUI(state.offline),
        { passive: true }
      );
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bind, { once: true });
    } else {
      bind();
    }
  }

  // -----------------------------
  // ONLINE/OFFLINE UI wiring
  // -----------------------------
  function applyConnectivityUI(isOffline) {
    // Badges: exactly one shows at all times
    const offlineBadge = qs("offlineBadge");
    const onlineBadge = qs("onlineBadge");

    if (offlineBadge) setHidden(offlineBadge, !isOffline);
    if (onlineBadge) setHidden(onlineBadge, isOffline);

    // Force-hide any other/offending badges if present
    const inlineBadge = qs("offlineBadgeInline");
    if (inlineBadge) {
      setHidden(inlineBadge, true);
      setAriaHidden(inlineBadge, true);
    }

    // Venue swap (uses #venueSelect + #venueInput from HTML)
    const venueSelect = qs("venueSelect");
    const venueInput = qs("venueInput");

    // Optional helper text element (ignore if absent)
    const venueHelp = qs("venueHelp");
    if (venueHelp) setHidden(venueHelp, true);

    if (isOffline) {
      if (venueSelect) {
        setDisabled(venueSelect, true);
        setHidden(venueSelect, true);
        setRequired(venueSelect, false);
      }
      if (venueInput) {
        setDisabled(venueInput, false);
        setHidden(venueInput, false);
        setRequired(venueInput, true);
      }
    } else {
      if (venueSelect) {
        setDisabled(venueSelect, false);
        setHidden(venueSelect, false);
        setRequired(venueSelect, true);
      }
      if (venueInput) {
        setDisabled(venueInput, true);
        setHidden(venueInput, true);
        setRequired(venueInput, false);
      }
    }

    // Apply the inline "Other" venue field rules (ONLINE only)
    applyVenueOtherUI(isOffline);
  }

  function setOffline(v) {
    state.offline = !!v;
    syncLegacyGlobals();

    // Keep UI consistent even if called before DOMContentLoaded
    const apply = () => {
      try {
        applyConnectivityUI(state.offline);
      } catch (e) {
        console.warn("[state] applyConnectivityUI failed:", e);
      }
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", apply, { once: true });
    } else {
      apply();
    }
  }

  function isOffline() {
    return !!state.offline;
  }

  // -----------------------------
  // Hooks
  // -----------------------------
  function bindOnlineHooksOnce() {
    if (window.__scoresheetOnlineHooksBound) return;
    window.__scoresheetOnlineHooksBound = true;

    // Browser “offline” is still useful to force OFFLINE immediately.
    window.addEventListener("offline", () => setOffline(true), { passive: true });

    // Browser “online” does NOT prove connectivity (SW/cache can lie).
    // venues.js will retry Firestore and call setOffline(false) on success.
    window.addEventListener("online", () => {}, { passive: true });
  }

  // -----------------------------
  // init
  // -----------------------------
  syncLegacyGlobals();

  window.ScoresheetState = {
    state,
    syncLegacyGlobals,
    markAsModified,
    resetModifiedFlag,
    setStandingsAscending,
    incrementTeamCount,
    setTeamCount,

    // connectivity
    setOffline,
    isOffline,
  };

  // Back-compat helper names
  window.markAsModified = window.markAsModified || markAsModified;
  window.resetModifiedFlag = window.resetModifiedFlag || resetModifiedFlag;
  window.setStandingsAscending = window.setStandingsAscending || setStandingsAscending;
  window.incrementTeamCount = window.incrementTeamCount || incrementTeamCount;
  window.setTeamCount = window.setTeamCount || setTeamCount;

  bindOnlineHooksOnce();
  bindVenueOtherListenerOnce();

  // Ensure ONE badge is visible immediately on first paint
  // (default OFFLINE until Firestore proves online)
  setOffline(true);
})();