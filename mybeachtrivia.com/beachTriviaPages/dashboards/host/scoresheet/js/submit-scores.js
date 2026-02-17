/* submit-scores.js
   Host Scoresheet submission module (split-file friendly).

   FIXES:
   1) Only include teams with a NON-BLANK Team Name in payload (teams[]).
   2) teamCount should equal number of NAMED teams.
   3) Avoid document.getElementById("num{teamId}{q}") collisions (team 11/21 bug):
      - Always resolve num* inputs within that team's row.

   Restores legacy-ish behavior:
   - Confirm before submit
   - If user cancels, download locally (JSON)
   - If user closes/refreshes with unsaved changes, keep a local autosave (localStorage)
   - On submit success, clear autosave + mark clean

   Validations:
   - Before submit:
     1) Validate top meta fields (date/first/last/event type/venue/theme rules)
        - Auto-fill Theme Name for Classic Trivia / Feud / Private Event (if blank)
        - Require Theme Name for Themed Trivia (must be user input)
     2) For rows that have a Team Name:
        - detect missing numeric fields (Q1–Q20, halftime, final question, bonus)
        - prompt once: fill missing with 0?
        - if Yes → fill ONLY those missing fields in ONLY those named rows
        - if No → abort submit

   Firestore fallback:
   - Writes to /scores

   Exposes:
     - window.handleSubmitScores()
     - window.submitScores() (alias)
*/
(function () {
  "use strict";

  if (window.__scoresheetSubmitInitialized) return;
  window.__scoresheetSubmitInitialized = true;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const LS_KEY = "scoresheet_autosave_v1";
  const LS_META_KEY = "scoresheet_autosave_meta_v1";

  function nowIso() {
    try {
      return new Date().toISOString();
    } catch {
      return String(Date.now());
    }
  }

  function safeCall(fn, ...args) {
    try {
      if (typeof fn === "function") return fn(...args);
    } catch (e) {
      console.error("[submit-scores] handler error:", e);
    }
    return undefined;
  }

  function safeCallAsync(fn, ...args) {
    try {
      if (typeof fn !== "function") return Promise.resolve(undefined);
      const out = fn(...args);
      return out && typeof out.then === "function" ? out : Promise.resolve(out);
    } catch (e) {
      console.error("[submit-scores] async handler error:", e);
      return Promise.reject(e);
    }
  }

  function num(v) {
    if (v === null || v === undefined) return 0;
    const s = String(v).trim();
    if (!s) return 0;
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function isBlank(v) {
    return v === null || v === undefined || String(v).trim() === "";
  }

  // ---------- Meta ----------
  function getMetaEls() {
    return {
      eventDateEl: $("#eventDate"),
      firstEl: $("#submitterFirstName"),
      lastEl: $("#submitterLastName"),
      eventTypeEl: $("#eventType"),
      venueEl: $("#venueSelect"),
      themeEl: $("#themeName"),
    };
  }

  function normalizeEventType(v) {
    return (v || "").trim();
  }

  function isThemedTrivia(eventType) {
    const t = normalizeEventType(eventType);
    return t === "themed_trivia" || t === "themed" || t === "themedTrivia";
  }

  function defaultThemeForEventType(eventType) {
    const t = normalizeEventType(eventType);
    if (t === "classic_trivia" || t === "classic" || t === "classicTrivia") return "Classic Trivia";
    if (t === "feud" || t === "family_feud" || t === "music_feud") return "Feud";
    if (t === "private_event" || t === "private" || t === "privateEvent") return "Private Event";
    return "";
  }

  function shouldAutoDefaultTheme(eventType) {
    return !!defaultThemeForEventType(eventType);
  }

  function applyThemeDefaultIfNeeded() {
    const { eventTypeEl, themeEl } = getMetaEls();
    if (!eventTypeEl || !themeEl) return;

    const eventType = normalizeEventType(eventTypeEl.value);

    if (isThemedTrivia(eventType)) return;

    const def = defaultThemeForEventType(eventType);
    if (!def) return;

    if (isBlank(themeEl.value)) {
      themeEl.value = def;
      try {
        themeEl.dispatchEvent(new Event("input", { bubbles: true }));
        themeEl.dispatchEvent(new Event("change", { bubbles: true }));
      } catch {}
    }
  }

  function validateMetaOrPromptFix() {
    if (typeof window.validateRequiredMetaFieldsBeforeSubmit === "function") {
      const res = window.validateRequiredMetaFieldsBeforeSubmit();
      if (res?.ok) return { ok: true };
      alert("Please complete:\n\n• " + (res?.missing || []).join("\n• "));
      return { ok: false, missing: res?.missing || [] };
    }

    const { eventDateEl, firstEl, lastEl, eventTypeEl, venueEl, themeEl } = getMetaEls();

    const missing = [];
    if (!eventDateEl || isBlank(eventDateEl.value)) missing.push("Date");
    if (!firstEl || isBlank(firstEl.value)) missing.push("First Name");
    if (!lastEl || isBlank(lastEl.value)) missing.push("Last Name");
    if (!eventTypeEl || isBlank(eventTypeEl.value)) missing.push("Event Type");
    if (!venueEl || isBlank(venueEl.value)) missing.push("Venue");

    const eventType = normalizeEventType(eventTypeEl?.value);
    const themeVal = (themeEl?.value || "").trim();

    if (eventType) {
      if (isThemedTrivia(eventType) && isBlank(themeVal)) {
        missing.push("Theme Name (required for Themed Trivia)");
      } else if (shouldAutoDefaultTheme(eventType) && isBlank(themeVal)) {
        missing.push("Theme Name");
      }
    }

    if (missing.length) {
      alert("Please complete:\n\n• " + missing.join("\n• "));
      return { ok: false, missing };
    }

    return { ok: true };
  }

  function getMeta() {
    const { eventDateEl, firstEl, lastEl, eventTypeEl, venueEl, themeEl } = getMetaEls();

    const eventDate = (eventDateEl?.value || "").trim();
    const submitterFirstName = (firstEl?.value || "").trim();
    const submitterLastName = (lastEl?.value || "").trim();
    const eventType = normalizeEventType(eventTypeEl?.value);
    const venueSelect = (venueEl?.value || "").trim();
    const themeName = (themeEl?.value || "").trim();

    const eventName = (isThemedTrivia(eventType) ? themeName : "") || eventType || "";

    return {
      timestamp: nowIso(),
      eventDate,
      submitterFirstName,
      submitterLastName,
      eventType,
      eventName,
      venue: venueSelect,
      themeName,
    };
  }

  // ---------- Team helpers ----------
  function getTeamId(row) {
    const raw = row?.dataset?.teamId;
    const id = parseInt(raw || "0", 10);
    return Number.isFinite(id) ? id : 0;
  }

  function getTeamName(row) {
    const inp = row.querySelector("input.teamName");
    return (inp?.value || "").trim();
  }

  function getLikeChecked(row) {
    const cb = row.querySelector("input.teamCheckbox[type='checkbox']");
    return !!cb?.checked;
  }

  function getBonusInput(row) {
    return row.querySelector(
      "td.bonus-col-right input.bonus-input, td.bonus-col-right input[type='number']"
    );
  }

  function getBonusValue(row) {
    const inp = getBonusInput(row);
    return inp ? num(inp.value) : 0;
  }

  function getFinalScore(row, teamId) {
    // finalScore ids do NOT collide, but keep row-safe anyway
    const span =
      row.querySelector(`span#finalScore${teamId}`) ||
      row.querySelector("td.sticky-col-right span[id^='finalScore']") ||
      row.querySelector("td.sticky-col-right span");
    return span ? num(span.textContent) : 0;
  }

  // ✅ IMPORTANT: get num* input inside THIS row (avoids duplicate id collisions)
  function getNumInputInRow(row, teamId, q) {
    const id = `num${teamId}${q}`;
    try {
      return row.querySelector(`#${CSS.escape(id)}`) || row.querySelector(`[id="${id}"]`);
    } catch {
      return row.querySelector(`[id="${id}"]`);
    }
  }

  function getNamedTeamRows() {
    const rows = $all("#teamTable tbody tr[data-team-id]");
    return rows.filter((row) => {
      const teamId = getTeamId(row);
      if (!teamId) return false;
      return !!getTeamName(row);
    });
  }

  // ---------- Missing-field fill (named rows only) ----------
  function findMissingFieldsForNamedRows() {
    const namedRows = getNamedTeamRows();
    const missing = [];

    for (const row of namedRows) {
      const teamId = getTeamId(row);
      const name = getTeamName(row) || `Team ${teamId}`;
      const fields = [];

      for (let q = 1; q <= 20; q++) {
        const el = getNumInputInRow(row, teamId, q);
        if (el && isBlank(el.value)) fields.push({ id: `num${teamId}${q}`, label: `Q${q}`, _el: el });
      }

      {
        const el = row.querySelector(`#halfTime${teamId}`) || document.getElementById(`halfTime${teamId}`);
        if (el && isBlank(el.value)) fields.push({ id: `halfTime${teamId}`, label: "Half Time", _el: el });
      }

      {
        const el =
          row.querySelector(`#finalQuestion${teamId}`) || document.getElementById(`finalQuestion${teamId}`);
        if (el && isBlank(el.value)) fields.push({ id: `finalQuestion${teamId}`, label: "Final Question", _el: el });
      }

      {
        const bonusEl = getBonusInput(row);
        if (bonusEl && isBlank(bonusEl.value)) fields.push({ id: null, label: "Bonus", _el: bonusEl });
      }

      if (fields.length) missing.push({ teamId, name, fields });
    }

    return missing;
  }

  function fillMissingWithZero(missing) {
    for (const team of missing) {
      for (const f of team.fields) {
        if (!f._el) continue;
        if (!isBlank(f._el.value)) continue;

        f._el.value = "0";
        try {
          f._el.dispatchEvent(new Event("input", { bubbles: true }));
          f._el.dispatchEvent(new Event("change", { bubbles: true }));
        } catch {}
      }

      if (typeof window.updateScores === "function") {
        try {
          window.updateScores(team.teamId);
        } catch {}
      } else if (typeof window.updateFinalScore === "function") {
        try {
          window.updateFinalScore(team.teamId);
        } catch {}
      }
    }
  }

  function formatMissingSummary(missing) {
    const lines = [];
    const maxTeams = 6;

    const shown = missing.slice(0, maxTeams);
    for (const t of shown) {
      const count = t.fields.length;
      lines.push(`• ${t.name}: ${count} empty field${count === 1 ? "" : "s"}`);
    }
    if (missing.length > maxTeams) {
      lines.push(`• …and ${missing.length - maxTeams} more team(s)`);
    }
    return lines.join("\n");
  }

  function collectRowScores(row, teamId) {
    const answers = {};
    for (let q = 1; q <= 20; q++) {
      const el = getNumInputInRow(row, teamId, q);
      answers[`q${q}`] = el ? num(el.value) : 0;
    }

    const halfTime =
      row.querySelector(`#halfTime${teamId}`) || document.getElementById(`halfTime${teamId}`);
    const finalQuestion =
      row.querySelector(`#finalQuestion${teamId}`) || document.getElementById(`finalQuestion${teamId}`);

    return {
      answers,
      halfTime: halfTime ? num(halfTime.value) : 0,
      finalQuestion: finalQuestion ? num(finalQuestion.value) : 0,
    };
  }

  function collectTeams() {
    // ✅ ONLY named teams
    const rows = getNamedTeamRows();
    const teams = [];

    for (const row of rows) {
      const teamId = getTeamId(row);
      if (!teamId) continue;

      if (typeof window.updateScores === "function") {
        try {
          window.updateScores(teamId);
        } catch {}
      } else if (typeof window.updateFinalScore === "function") {
        try {
          window.updateFinalScore(teamId);
        } catch {}
      }

      const name = getTeamName(row);
      const like = getLikeChecked(row);
      const bonus = getBonusValue(row);
      const finalScore = getFinalScore(row, teamId);
      const scoreDetail = collectRowScores(row, teamId);

      teams.push({
        teamId,
        name,
        like,
        bonus,
        finalScore,
        ...scoreDetail,
      });
    }

    return teams;
  }

  function buildPayloadForFirestoreScores() {
    const meta = getMeta();
    const teams = collectTeams(); // ✅ named only

    return {
      timestamp: meta.timestamp,
      eventName: meta.eventName || "Scoresheet",

      // ✅ correct count: named teams only
      teamCount: teams.length,
      teams,

      meta: {
        eventDate: meta.eventDate,
        submitterFirstName: meta.submitterFirstName,
        submitterLastName: meta.submitterLastName,
        eventType: meta.eventType,
        venue: meta.venue,
        themeName: meta.themeName,
      },
      submittedAt: meta.timestamp,
      standingsAscending: !!(
        window.ScoresheetState?.state?.standingsAscending ?? window.standingsAscending
      ),
      page: { path: location.pathname, href: location.href },
      versionHints: { splitFiles: true },
    };
  }

  function setSubmitting(isSubmitting) {
    const btn = document.getElementById("btnSubmitScores");
    if (!btn) return;

    if (isSubmitting) {
      btn.disabled = true;
      btn.dataset._origText = btn.textContent || "Submit Scores";
      btn.textContent = "Submitting…";
    } else {
      btn.disabled = false;
      if (btn.dataset._origText) btn.textContent = btn.dataset._origText;
      delete btn.dataset._origText;
    }
  }

  function markClean() {
    safeCall(window.ScoresheetState?.resetModifiedFlag);
    if (typeof window.dataModified === "boolean") window.dataModified = false;
  }

  function buildFilename(meta) {
    const date = (meta?.eventDate || "").replaceAll("-", "");
    const venue = (meta?.venue || "").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
    const type = (meta?.eventType || "").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
    const theme = (meta?.themeName || "").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
    const base = ["scoresheet", date || "nodate", venue || "novenue", type || "notype", theme || ""]
      .filter(Boolean)
      .join("-");
    return `${base}.json`;
  }

  function downloadJson(payload) {
    const meta = payload?.meta || {};
    const filename = buildFilename(meta);

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function autosaveToLocalStorage(payload) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
      localStorage.setItem(LS_META_KEY, JSON.stringify({ savedAt: nowIso() }));
    } catch (e) {
      console.warn("[submit-scores] autosave failed:", e);
    }
  }

  function clearAutosave() {
    try {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_META_KEY);
    } catch {}
  }

  function ensureBeforeUnloadHook() {
    if (window.__scoresheetBeforeUnloadBound) return;
    window.__scoresheetBeforeUnloadBound = true;

    window.addEventListener("beforeunload", (e) => {
      const modified =
        (typeof window.dataModified === "boolean" && window.dataModified) ||
        !!window.ScoresheetState?.state?.modified;

      if (!modified) return;

      try {
        const payload = buildPayloadForFirestoreScores();
        autosaveToLocalStorage(payload);
      } catch {}

      e.preventDefault();
      e.returnValue = "";
    });
  }

  async function submitViaLegacyIfPresent(payload) {
    if (typeof window.sendDataToAPI === "function") {
      return await safeCallAsync(window.sendDataToAPI, payload);
    }
    if (typeof window.__legacySubmitScores === "function") {
      return await safeCallAsync(window.__legacySubmitScores);
    }
    return null;
  }

  async function submitToFirestoreFallback(payload) {
    const FH = window.FirebaseHelpers;
    if (!FH || typeof FH.ensureSignedIn !== "function" || typeof FH.getDb !== "function") {
      throw new Error("FirebaseHelpers missing; cannot submit to Firestore fallback.");
    }

    await FH.ensureSignedIn();
    const db = FH.getDb();

    const ref = db.collection("scores").doc();
    const doc = {
      ...payload,
      createdAt: window.firebase?.firestore?.FieldValue?.serverTimestamp
        ? window.firebase.firestore.FieldValue.serverTimestamp()
        : nowIso(),
    };

    await ref.set(doc);
    return { ok: true, firestoreCollection: "scores", firestoreDocId: ref.id };
  }

  async function handleSubmitScores() {
    ensureBeforeUnloadHook();

    applyThemeDefaultIfNeeded();

    const metaCheck = validateMetaOrPromptFix();
    if (!metaCheck.ok) return { ok: false, cancelled: true, reason: "meta_missing" };

    const missing = findMissingFieldsForNamedRows();
    if (missing.length) {
      const summary = formatMissingSummary(missing);
      const fill = confirm(
        "Some teams have blank score fields.\n\n" + summary + "\n\nFill the missing fields with 0?"
      );

      if (fill) {
        fillMissingWithZero(missing);
      } else {
        alert("Submit cancelled. Fill in missing fields or use 0s, then submit again.");
        return { ok: false, cancelled: true, reason: "missing_fields" };
      }
    }

    const payload = buildPayloadForFirestoreScores();

    if (!payload.teams.length) {
      alert("No NAMED teams found to submit. Enter at least one Team Name first.");
      return;
    }

    const ok = confirm(
      "Submit these scores now?\n\n" +
        "• OK = Submit to database\n" +
        "• Cancel = Download a local copy instead"
    );

    if (!ok) {
      autosaveToLocalStorage(payload);
      downloadJson(payload);
      alert("Saved locally.");
      return { ok: true, localSaved: true };
    }

    setSubmitting(true);

    try {
      const legacyResult = await submitViaLegacyIfPresent(payload);

      let result = legacyResult;
      if (legacyResult === null) {
        result = await submitToFirestoreFallback(payload);
        console.log("[submit-scores] Firestore fallback result:", result);
      } else {
        console.log("[submit-scores] Legacy submit result:", legacyResult);
      }

      clearAutosave();
      markClean();
      alert("Submitted successfully.");
      return result;
    } catch (err) {
      console.error("[submit-scores] submit failed:", err);

      const save = confirm("Submit failed.\n\nDownload a local copy so you don't lose it?");
      if (save) {
        try {
          autosaveToLocalStorage(payload);
          downloadJson(payload);
          alert("Saved locally.");
        } catch {}
      } else {
        autosaveToLocalStorage(payload);
      }

      alert("Submit failed. Check the console for details.");
      throw err;
    } finally {
      setSubmitting(false);
    }
  }

  window.handleSubmitScores = handleSubmitScores;
  window.submitScores = handleSubmitScores;

  ensureBeforeUnloadHook();

  (function bindThemeAutofillOnce() {
    if (window.__scoresheetThemeAutofillBound) return;
    window.__scoresheetThemeAutofillBound = true;

    const { eventTypeEl } = getMetaEls();
    if (!eventTypeEl) return;

    eventTypeEl.addEventListener("change", () => {
      applyThemeDefaultIfNeeded();
    });

    applyThemeDefaultIfNeeded();
  })();
})();