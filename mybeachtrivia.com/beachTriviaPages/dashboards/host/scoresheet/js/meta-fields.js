/* meta-fields.js
   Handles the top meta section:
   - default date
   - themed trivia field visibility
   - reading meta values
   - required-field validation + visual highlighting
   - eventType-driven themeName autofill (Classic/Feud/Private Event) + blank for Themed
   - ✅ submitter name autofill from logged-in host (Firestore employees collection) + lock fields

   FEUD MODE HOOK:
   - When event type changes, dispatches:
       window.dispatchEvent(new CustomEvent("scoresheet:event-type-changed", { detail: { eventType } }))

   OFFLINE/VENUE RULES (matches submit-scores.js + venues.js + state.js behavior):
   - OFFLINE:
       • venueInput is REQUIRED
       • venueSelect is ignored
       • venueOtherInput is ignored/hidden (offline uses venueInput only)
   - ONLINE:
       • venueSelect is REQUIRED
       • if venueSelect === "other":
           - venueOtherInput is REQUIRED
           - resolved venueName comes from venueOtherInput
           - venueId stays "other" (for analytics/debug if desired)
       • else:
           - venueSelect must not be "loading" (and must not be blank)

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

  // -----------------------------
  // ✅ Submitter name autofill (host)
  // -----------------------------

  function normalizeWhitespace(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function titleCaseWord(w) {
    const s = String(w || "").trim();
    if (!s) return "";
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }

  function parseNameFromDisplayName(displayName) {
    const dn = normalizeWhitespace(displayName);
    if (!dn) return { firstName: "", lastName: "" };

    // "Last, First"
    if (dn.includes(",")) {
      const parts = dn.split(",").map((p) => normalizeWhitespace(p)).filter(Boolean);
      if (parts.length >= 2) {
        const lastName = parts[0];
        const firstName = parts[1].split(" ")[0] || parts[1];
        return { firstName, lastName };
      }
    }

    // "First Last ..."
    const tokens = dn.split(" ").filter(Boolean);
    if (tokens.length === 1) return { firstName: tokens[0], lastName: "" };
    return {
      firstName: tokens[0],
      lastName: tokens.slice(1).join(" "),
    };
  }

  function parseNameFromEmail(email) {
    const e = String(email || "").trim();
    if (!e || !e.includes("@")) return { firstName: "", lastName: "" };

    const local = e.split("@")[0] || "";
    const cleaned = local.replace(/[^a-zA-Z0-9._-]/g, "");
    const parts = cleaned.split(/[._-]+/).filter(Boolean);

    const firstName = parts[0] ? titleCaseWord(parts[0]) : "";
    const lastName = parts.length > 1 ? parts.slice(1).map(titleCaseWord).join(" ") : "";
    return { firstName, lastName };
  }

  function setSubmitterFields(firstName, lastName) {
    const firstEl = getEl("submitterFirstName");
    const lastEl = getEl("submitterLastName");
    if (!firstEl || !lastEl) return;

    const fn = normalizeWhitespace(firstName);
    const ln = normalizeWhitespace(lastName);

    // Only update if values actually change (prevents caret/focus weirdness)
    if (firstEl.value !== fn) firstEl.value = fn;
    if (lastEl.value !== ln) lastEl.value = ln;

    // Lock fields (HTML already sets readonly, but keep it enforced)
    try {
      firstEl.readOnly = true;
      lastEl.readOnly = true;
      firstEl.setAttribute("aria-readonly", "true");
      lastEl.setAttribute("aria-readonly", "true");
      firstEl.setAttribute("autocomplete", "off");
      lastEl.setAttribute("autocomplete", "off");
    } catch {}

    fireUserLikeInput(firstEl);
    fireUserLikeInput(lastEl);
  }

  // ✅ Try to fetch first/last name from Firestore employees collection.
  // Falls back gracefully to displayName parsing, then email parsing.
  function fetchNameFromFirestore(uid, callback) {
    try {
      const db =
        window.FirebaseHelpers?.getDb?.() ||
        (window.firebase?.firestore ? window.firebase.firestore() : null) ||
        window.db ||
        null;

      if (!db) {
        callback(null);
        return;
      }

      db.collection("employees")
        .doc(uid)
        .get()
        .then(function (doc) {
          if (doc && doc.exists) {
            const data = doc.data() || {};
            callback({
              firstName: String(data.firstName || "").trim(),
              lastName: String(data.lastName || "").trim(),
            });
          } else {
            callback(null);
          }
        })
        .catch(function () {
          callback(null);
        });
    } catch (_) {
      callback(null);
    }
  }

  function fillSubmitterFromUser(user) {
    if (!user) return;

    // ✅ First: try Firestore employees collection using the auth UID
    fetchNameFromFirestore(user.uid, function (profile) {
      if (profile && (!isBlank(profile.firstName) || !isBlank(profile.lastName))) {
        setSubmitterFields(profile.firstName, profile.lastName);
        return;
      }

      // Fallback 1: Firebase Auth displayName (e.g. Google OAuth "First Last")
      let firstName = "";
      let lastName = "";

      const dn = user.displayName || "";
      const email = user.email || "";

      const fromDn = parseNameFromDisplayName(dn);
      firstName = fromDn.firstName || "";
      lastName = fromDn.lastName || "";

      // Fallback 2: parse email prefix (e.g. first.last@domain.com)
      if (!firstName && !lastName) {
        const fromEmail = parseNameFromEmail(email);
        firstName = fromEmail.firstName || "";
        lastName = fromEmail.lastName || "";
      }

      // Last resort: use raw displayName or email so field is never blank
      if (!firstName && dn) firstName = dn;
      if (!firstName && email) firstName = email;

      setSubmitterFields(firstName, lastName);
    });
  }

  function tryBindAuthListener(attempt) {
    const maxAttempts = 80; // ~8s if we retry at 100ms
    const delayMs = 100;

    try {
      if (window.firebase?.auth && typeof window.firebase.auth === "function") {
        const auth = window.firebase.auth();

        // Ensure fields are locked even before values arrive
        setSubmitterFields(getEl("submitterFirstName")?.value || "", getEl("submitterLastName")?.value || "");

        // Prefer immediate user if available
        try {
          if (auth.currentUser) fillSubmitterFromUser(auth.currentUser);
        } catch {}

        // Keep in sync with auth state
        auth.onAuthStateChanged(function (user) {
          try {
            fillSubmitterFromUser(user);
          } catch {}
        });

        return;
      }
    } catch {}

    if ((attempt || 0) >= maxAttempts) return;
    setTimeout(function () {
      tryBindAuthListener((attempt || 0) + 1);
    }, delayMs);
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

  // ✅ Central place to resolve venue based on online/offline mode (supports "other")
  function getVenueResolved() {
    const venueSelect = getEl("venueSelect");
    const venueInput = getEl("venueInput");
    const venueOtherInput = getEl("venueOtherInput");
    const offline = isOfflineNow();

    const selectVal = (venueSelect?.value || "").trim();
    const inputVal = (venueInput?.value || "").trim();
    const otherVal = (venueOtherInput?.value || "").trim();

    if (offline) {
      return {
        offline,
        venueId: "",
        venueName: inputVal,
        source: "manual_offline",
      };
    }

    if (selectVal === "other") {
      return {
        offline,
        venueId: "other",
        venueName: otherVal,
        source: "manual_other",
      };
    }

    return {
      offline,
      venueId: selectVal,
      venueName: "",
      source: "dropdown",
    };
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
    const venueOtherEl = getEl("venueOtherInput");

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
      // Offline: require venueInput
      if (!venueInputEl || isBlank(meta.venueName)) {
        missing.push({ key: "venueInput", el: venueInputEl || venueSelectEl, label: "Venue" });
      }
    } else {
      // Online: require venueSelect (not blank / not loading)
      const v = (meta.venueId || "").trim();
      if (!venueSelectEl || isBlank(v) || v === "loading") {
        missing.push({ key: "venueSelect", el: venueSelectEl, label: "Venue" });
      } else if (v === "other") {
        // Online + Other: require venueOtherInput
        if (!venueOtherEl || isBlank(meta.venueName)) {
          missing.push({ key: "venueOtherInput", el: venueOtherEl || venueSelectEl, label: "Venue" });
        }
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
      "venueInput",       // offline input
      "venueOtherInput",  // online "Other" input (if present)
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

    // ✅ If online/offline flips, clear venue invalid marks so user isn't stuck
    if (!window.__scoresheetVenueModeListenerBound) {
      window.__scoresheetVenueModeListenerBound = true;

      const clearVenueInvalids = () => {
        unmarkInvalid(getEl("venueInput"));
        unmarkInvalid(getEl("venueSelect"));
        unmarkInvalid(getEl("venueOtherInput"));
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

    // ✅ fill submitter from logged-in host (Firestore employees collection)
    tryBindAuthListener(0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();