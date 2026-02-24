/* meta-fields.js
   Handles the top meta section:
   - default date
   - themed trivia field visibility
   - reading meta values
   - required-field validation + visual highlighting
   - eventType-driven themeName autofill (Classic/Feud/Private Event) + blank for Themed

   FEUD MODE HOOK:
   - When event type changes, dispatches:
       window.dispatchEvent(new CustomEvent("scoresheet:event-type-changed", { detail: { eventType } }))

   OFFLINE/VENUE RULES (matches submit-scores.js + venues.js + state.js behavior):
   - OFFLINE:
       • venueInput is REQUIRED
       • venueSelect is ignored
   - ONLINE:
       • venueSelect is REQUIRED
       • reject "loading" and "other" (unless you explicitly support "other" online)

   IMPORTANT:
   - Offline detection MUST use ScoresheetState (Firestore reachability), not navigator.onLine,
     because SW/cache can make navigator.onLine unreliable.

   Exposes on window:
     - setDefaultEventDateToday()
     - updateThemeFieldVisibility()
     - applyThemeNameDefaultFromEventType()
     - getMetaFields()
     - validateRequiredMetaFieldsBeforeSubmit()
     - bindMetaFieldListeners()
*/
(function () {
  "use strict";

  function $(sel, root) {
    if (window.DomUtils?.$) return window.DomUtils.$(sel, root);
    return (root || document).querySelector(sel);
  }

  function getEl(id) {
    return document.getElementById(id);
  }

  function todayISODate() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function setDefaultEventDateToday() {
    const dateEl = getEl("eventDate");
    if (!dateEl) return;
    if (!dateEl.value) dateEl.value = todayISODate();
  }

  function fireUserLikeInput(el) {
    try {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } catch {}
  }

  function dispatchEventTypeChanged(eventType) {
    try {
      window.dispatchEvent(
        new CustomEvent("scoresheet:event-type-changed", { detail: { eventType } })
      );
    } catch {}
  }

  function isBlank(v) {
    return v === null || v === undefined || String(v).trim() === "";
  }

  // ✅ Source of truth for offline mode:
  // - Prefer ScoresheetState (Firestore reachability)
  // - Fallback to navigator.onLine only if state isn't available yet
  function isOfflineNow() {
    try {
      if (window.ScoresheetState?.isOffline) return !!window.ScoresheetState.isOffline();
    } catch {}
    try {
      return typeof navigator !== "undefined" ? !navigator.onLine : false;
    } catch {
      return false;
    }
  }

  // ✅ when event type changes, set themeName defaults
  function applyThemeNameDefaultFromEventType() {
    const eventTypeEl = getEl("eventType");
    const themeInput = getEl("themeName");
    if (!eventTypeEl || !themeInput) return;

    const v = (eventTypeEl.value || "").trim();

    if (v === "classic_trivia") {
      themeInput.value = "Classic Trivia";
      fireUserLikeInput(themeInput);
    } else if (v === "feud") {
      themeInput.value = "Feud";
      fireUserLikeInput(themeInput);
    } else if (v === "private_event") {
      themeInput.value = "Private Event";
      fireUserLikeInput(themeInput);
    } else if (v === "themed_trivia") {
      themeInput.value = "";
      fireUserLikeInput(themeInput);
    } else {
      themeInput.value = "";
      fireUserLikeInput(themeInput);
    }
  }

  function updateThemeFieldVisibility() {
    const eventTypeEl = getEl("eventType");
    const themeField = getEl("themeNameField");
    if (!eventTypeEl || !themeField) return;

    const show = (eventTypeEl.value || "").trim() === "themed_trivia";
    themeField.hidden = !show;
  }

  // ✅ Central place to resolve venue based on online/offline mode
  function getVenueResolved() {
    const venueSelect = getEl("venueSelect");
    const venueInput = getEl("venueInput");
    const offline = isOfflineNow();

    const selectVal = (venueSelect?.value || "").trim();
    const inputVal = (venueInput?.value || "").trim();

    if (offline) {
      return { offline, venueId: "", venueName: inputVal, source: "manual" };
    }
    return { offline, venueId: selectVal, venueName: "", source: "dropdown" };
  }

  function getMetaFields() {
    const eventDate = (getEl("eventDate")?.value || "").trim();
    const submitterFirstName = (getEl("submitterFirstName")?.value || "").trim();
    const submitterLastName = (getEl("submitterLastName")?.value || "").trim();
    const eventType = (getEl("eventType")?.value || "").trim();
    const themeName = (getEl("themeName")?.value || "").trim();

    const venueInfo = getVenueResolved();

    // Keep legacy keys (venueId) but also provide venueName + offline for newer logic
    return {
      eventDate,
      submitterFirstName,
      submitterLastName,
      eventType,
      themeName,
      venueId: venueInfo.venueId,
      venueName: venueInfo.venueName,
      venueSource: venueInfo.source,
      offline: venueInfo.offline,
    };
  }

  function clearInvalidMarks() {
    document.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
  }

  function markInvalid(el) {
    if (!el) return;
    el.classList.add("invalid");
    try {
      el.setAttribute("aria-invalid", "true");
    } catch {}
  }

  function unmarkInvalid(el) {
    if (!el) return;
    el.classList.remove("invalid");
    try {
      el.removeAttribute("aria-invalid");
    } catch {}
  }

  function validateRequiredMetaFieldsBeforeSubmit() {
    clearInvalidMarks();

    const eventDateEl = getEl("eventDate");
    const firstEl = getEl("submitterFirstName");
    const lastEl = getEl("submitterLastName");
    const eventTypeEl = getEl("eventType");
    const themeEl = getEl("themeName");
    const venueSelectEl = getEl("venueSelect");
    const venueInputEl = getEl("venueInput");

    const meta = getMetaFields();
    const missing = [];

    if (isBlank(meta.eventDate)) missing.push({ key: "eventDate", el: eventDateEl, label: "Date" });
    if (isBlank(meta.submitterFirstName))
      missing.push({ key: "submitterFirstName", el: firstEl, label: "First Name" });
    if (isBlank(meta.submitterLastName))
      missing.push({ key: "submitterLastName", el: lastEl, label: "Last Name" });
    if (isBlank(meta.eventType))
      missing.push({ key: "eventType", el: eventTypeEl, label: "Event Type" });

    // ✅ Theme rules
    const themeRequiredTypes = new Set(["themed_trivia", "classic_trivia", "feud", "private_event"]);
    if (themeRequiredTypes.has(meta.eventType) && isBlank(meta.themeName)) {
      missing.push({ key: "themeName", el: themeEl, label: "Theme Name" });
    }

    // ✅ Venue rules
    if (meta.offline) {
      if (!venueInputEl || isBlank(meta.venueName)) {
        missing.push({ key: "venueInput", el: venueInputEl || venueSelectEl, label: "Venue" });
      }
    } else {
      const v = (meta.venueId || "").trim();
      if (!venueSelectEl || isBlank(v) || v === "loading" || v === "other") {
        missing.push({ key: "venueSelect", el: venueSelectEl, label: "Venue" });
      }
    }

    missing.forEach((m) => markInvalid(m.el));

    if (missing.length) {
      const firstMissing = missing[0].el;
      try {
        firstMissing?.focus();
      } catch {}
    }

    return {
      ok: missing.length === 0,
      missing: missing.map((m) => m.label),
      meta,
    };
  }

  function bindMetaFieldListeners() {
    const ids = [
      "eventDate",
      "submitterFirstName",
      "submitterLastName",
      "eventType",
      "themeName",
      "venueSelect",
      "venueInput", // ✅ include offline input so it clears invalid state
    ];

    ids.forEach((id) => {
      const el = getEl(id);
      if (!el) return;
      el.addEventListener("input", () => unmarkInvalid(el));
      el.addEventListener("change", () => unmarkInvalid(el));
    });

    const eventTypeEl = getEl("eventType");
    if (eventTypeEl && !eventTypeEl.dataset.boundMetaFields) {
      eventTypeEl.addEventListener("change", () => {
        updateThemeFieldVisibility();
        applyThemeNameDefaultFromEventType();
        dispatchEventTypeChanged((eventTypeEl.value || "").trim());
      });
      eventTypeEl.dataset.boundMetaFields = "1";
    }

    // ✅ If online/offline flips, clear venue invalid marks so user isn’t stuck
    if (!window.__scoresheetVenueModeListenerBound) {
      window.__scoresheetVenueModeListenerBound = true;

      const clearVenueInvalids = () => {
        unmarkInvalid(getEl("venueInput"));
        unmarkInvalid(getEl("venueSelect"));
      };

      window.addEventListener("online", clearVenueInvalids, { passive: true });
      window.addEventListener("offline", clearVenueInvalids, { passive: true });

      // Also clear when ScoresheetState flips (Firestore reachability)
      window.addEventListener("scoresheet:offline-changed", clearVenueInvalids, { passive: true });
    }
  }

  // Expose globals
  window.setDefaultEventDateToday = setDefaultEventDateToday;
  window.updateThemeFieldVisibility = updateThemeFieldVisibility;
  window.applyThemeNameDefaultFromEventType = applyThemeNameDefaultFromEventType;
  window.getMetaFields = getMetaFields;
  window.validateRequiredMetaFieldsBeforeSubmit = validateRequiredMetaFieldsBeforeSubmit;
  window.bindMetaFieldListeners = bindMetaFieldListeners;

  function init() {
    setDefaultEventDateToday();
    updateThemeFieldVisibility();
    bindMetaFieldListeners();

    // ✅ apply default immediately on load
    applyThemeNameDefaultFromEventType();

    // ✅ notify current value on load too
    dispatchEventTypeChanged((getEl("eventType")?.value || "").trim());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();