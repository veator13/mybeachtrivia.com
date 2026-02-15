/* meta-fields.js
   Handles the top meta section:
   - default date
   - themed trivia field visibility
   - reading meta values
   - required-field validation + visual highlighting

   Classic script style (no imports). Exposes functions on window:
     - setDefaultEventDateToday()
     - updateThemeFieldVisibility()
     - getMetaFields()
     - validateRequiredMetaFieldsBeforeSubmit()
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
  
    function updateThemeFieldVisibility() {
      const eventType = getEl("eventType");
      const themeField = getEl("themeNameField");
      const themeInput = getEl("themeName");
  
      if (!eventType || !themeField) return;
  
      const show = eventType.value === "themed_trivia";
      themeField.hidden = !show;
  
      // Optional: clear theme name when not themed trivia
      if (!show && themeInput) themeInput.value = "";
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
      // You use .invalid in your CSS in other dashboards; keep that convention.
      document.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
    }
  
    function markInvalid(el) {
      if (!el) return;
      el.classList.add("invalid");
      // helpful for accessibility / debugging
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
      if (!meta.eventType) missing.push({ key: "eventType", el: eventTypeEl, label: "Event Type" });
  
      // Theme name required only for themed trivia
      if (meta.eventType === "themed_trivia" && !meta.themeName) {
        missing.push({ key: "themeName", el: themeEl, label: "Theme Name" });
      }
  
      // Venue required (exclude loading placeholder)
      if (!meta.venueId || meta.venueId === "loading") {
        missing.push({ key: "venueSelect", el: venueEl, label: "Venue" });
      }
  
      // mark them
      missing.forEach((m) => markInvalid(m.el));
  
      // Focus the first missing field for convenience
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
  
    // Optional: live unmark as user types/selects
    function bindMetaFieldListeners() {
      const ids = ["eventDate", "submitterFirstName", "submitterLastName", "eventType", "themeName", "venueSelect"];
      ids.forEach((id) => {
        const el = getEl(id);
        if (!el) return;
        el.addEventListener("input", () => unmarkInvalid(el));
        el.addEventListener("change", () => unmarkInvalid(el));
      });
  
      const eventTypeEl = getEl("eventType");
      if (eventTypeEl) {
        eventTypeEl.addEventListener("change", () => updateThemeFieldVisibility());
      }
    }
  
    // Expose globals for current app.js compatibility
    window.setDefaultEventDateToday = setDefaultEventDateToday;
    window.updateThemeFieldVisibility = updateThemeFieldVisibility;
    window.getMetaFields = getMetaFields;
    window.validateRequiredMetaFieldsBeforeSubmit = validateRequiredMetaFieldsBeforeSubmit;
    window.bindMetaFieldListeners = bindMetaFieldListeners;
  
    // Auto-run safe initializers (won’t hurt if app.js also does these)
    function init() {
      setDefaultEventDateToday();
      updateThemeFieldVisibility();
      bindMetaFieldListeners();
    }
  
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
      init();
    }
  })();