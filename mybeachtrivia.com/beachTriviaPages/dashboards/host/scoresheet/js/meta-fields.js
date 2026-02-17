/* meta-fields.js
   Handles the top meta section:
   - default date
   - themed trivia field visibility
   - reading meta values
   - required-field validation + visual highlighting
   - eventType-driven themeName autofill (Classic/Feud/Private Event) + blank for Themed

   FEUD MODE HOOK:
   - When event type changes, dispatches a custom event:
       window.dispatchEvent(new CustomEvent("scoresheet:event-type-changed", { detail: { eventType } }))
     so other modules (like table-build.js / scoring.js) can react live.

   Classic script style (no imports). Exposes functions on window:
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
      // themed trivia: leave blank and require user input
      themeInput.value = "";
      fireUserLikeInput(themeInput);
    } else {
      // unknown/blank selection
      themeInput.value = "";
      fireUserLikeInput(themeInput);
    }
  }

  function updateThemeFieldVisibility() {
    const eventTypeEl = getEl("eventType");
    const themeField = getEl("themeNameField");
    if (!eventTypeEl || !themeField) return;

    // Only show the Theme Name field UI for Themed Trivia.
    // Classic/Feud/Private Event will be auto-filled (field can stay hidden).
    const show = (eventTypeEl.value || "").trim() === "themed_trivia";
    themeField.hidden = !show;
  }

  function getMetaFields() {
    const eventDate = (getEl("eventDate")?.value || "").trim();
    const submitterFirstName = (getEl("submitterFirstName")?.value || "").trim();
    const submitterLastName = (getEl("submitterLastName")?.value || "").trim();
    const eventType = (getEl("eventType")?.value || "").trim();
    const themeName = (getEl("themeName")?.value || "").trim();
    const venueId = (getEl("venueSelect")?.value || "").trim();

    return {
      eventDate,
      submitterFirstName,
      submitterLastName,
      eventType,
      themeName,
      venueId,
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
    const venueEl = getEl("venueSelect");

    const meta = getMetaFields();
    const missing = [];

    if (!meta.eventDate) missing.push({ key: "eventDate", el: eventDateEl, label: "Date" });
    if (!meta.submitterFirstName)
      missing.push({ key: "submitterFirstName", el: firstEl, label: "First Name" });
    if (!meta.submitterLastName)
      missing.push({ key: "submitterLastName", el: lastEl, label: "Last Name" });
    if (!meta.eventType)
      missing.push({ key: "eventType", el: eventTypeEl, label: "Event Type" });

    // ✅ Theme rules:
    // - Themed Trivia: must be user-provided (field shown)
    // - Classic/Feud/Private Event: auto-filled, but still must not be blank
    const themeRequiredTypes = new Set(["themed_trivia", "classic_trivia", "feud", "private_event"]);
    if (themeRequiredTypes.has(meta.eventType) && !meta.themeName) {
      missing.push({ key: "themeName", el: themeEl, label: "Theme Name" });
    }

    // Venue required (exclude loading placeholder)
    if (!meta.venueId || meta.venueId === "loading") {
      missing.push({ key: "venueSelect", el: venueEl, label: "Venue" });
    }

    missing.forEach((m) => markInvalid(m.el));

    if (missing.length) {
      const first = missing[0].el;
      try {
        first?.focus();
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

    // ✅ apply default immediately on load (covers pre-selected value)
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