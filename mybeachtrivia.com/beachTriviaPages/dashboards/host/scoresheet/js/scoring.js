/* scoring.js
   Legacy-compatible scoring for split-file Host Scoresheet.

   FIX:
   - Avoid document.getElementById("num{teamId}{q}") because IDs collide:
       num111 = team 1 q11  OR  team 11 q1
   - Always resolve num* inputs within the row for that team.

   CHANGE REQUEST:
   - In NORMAL mode (NOT feud):
       * If user enters 0 => keep 0
       * If user enters ANY non-zero => snap to the cell’s fixed value:
           Q1-5  => 1
           Q6-10 => 2
           Q11-15=> 3
           Q16-20=> 4
   - In FEUD mode (#eventType === "feud"):
       * allow any non-negative integer in Q1..Q20 (no snapping)
*/
(function () {
  "use strict";

  function $(sel, root) {
    if (window.DomUtils?.$) return window.DomUtils.$(sel, root);
    return (root || document).querySelector(sel);
  }

  function $all(sel, root) {
    if (window.DomUtils?.$all) return window.DomUtils.$all(sel, root);
    return Array.from((root || document).querySelectorAll(sel));
  }

  function num(v) {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const s = String(v).trim();
    if (!s) return 0;
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function int(v) {
    const n = parseInt(String(v ?? "").trim(), 10);
    return Number.isFinite(n) ? n : 0;
  }

  function setTextById(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  }

  function getEventTypeValue() {
    const el = document.getElementById("eventType");
    return (el?.value || "").trim();
  }

  function isFeudMode() {
    return getEventTypeValue() === "feud";
  }

  function getTeamIdFrom(arg, teamIdMaybe) {
    if (Number.isFinite(Number(teamIdMaybe)) && Number(teamIdMaybe) > 0) return Number(teamIdMaybe);
    if (Number.isFinite(Number(arg)) && Number(arg) > 0) return Number(arg);

    const el = arg && arg.nodeType === 1 ? arg : null;
    const row = el?.closest?.("tr[data-team-id]") || null;
    const tid = row ? parseInt(row.dataset.teamId || "0", 10) : 0;
    return tid || 0;
  }

  function getRowByTeamId(teamId) {
    return document.querySelector(`tr[data-team-id="${teamId}"]`);
  }

  // ✅ IMPORTANT: resolve by id *within the row* (avoids duplicate id collisions)
  function getByIdInRow(row, id) {
    if (!row) return document.getElementById(id);
    try {
      return row.querySelector(`#${CSS.escape(id)}`) || document.getElementById(id);
    } catch {
      // CSS.escape might not exist in very old browsers; fallback
      return row.querySelector(`[id="${id}"]`) || document.getElementById(id);
    }
  }

  function getBonusInput(row, teamId) {
    if (!row) return null;
    const byId = getByIdInRow(row, `bonus${teamId}`);
    if (byId) return byId;
    return row.querySelector("td.bonus-col-right .bonus-input") || row.querySelector(".bonus-input");
  }

  function fixedValueForQuestion(q) {
    if (q >= 1 && q <= 5) return 1;
    if (q >= 6 && q <= 10) return 2;
    if (q >= 11 && q <= 15) return 3;
    if (q >= 16 && q <= 20) return 4;
    return 0;
  }

  function clampQuestionValue(q, v) {
    const n = int(v);
    if (n === 0) return 0;
    return fixedValueForQuestion(q);
  }

  function parseQuestionNumberFromId(id, teamId) {
    // id format: num{teamId}{q}
    const rest = id.replace(/^num/, "");
    const teamStr = String(teamId);
    const idx = rest.indexOf(teamStr);
    if (idx === -1) return 0;
    const qStr = rest.slice(idx + teamStr.length);
    const q = parseInt(qStr || "0", 10);
    return Number.isFinite(q) ? q : 0;
  }

  function validateInput(inputEl, teamIdMaybe) {
    if (!inputEl) return { ok: true };

    const type = (inputEl.getAttribute("type") || "").toLowerCase();
    if (type !== "number") return { ok: true };

    if (inputEl.value === "") {
      inputEl.classList.remove("invalid");
      return { ok: true };
    }

    const raw = Number(inputEl.value);
    if (!Number.isFinite(raw)) {
      inputEl.classList.add("invalid");
      return { ok: false, reason: "Not a number" };
    }

    const id = inputEl.id || "";

    // Final question allows negatives (do not clamp)
    if (/^finalQuestion\d+$/.test(id)) {
      inputEl.classList.remove("invalid");
      return { ok: true };
    }

    // Halftime: clamp negatives to 0, integer
    if (/^halfTime\d+$/.test(id)) {
      const v = int(inputEl.value);
      inputEl.value = String(v < 0 ? 0 : v);
      inputEl.classList.remove("invalid");
      return { ok: true };
    }

    // Bonus: clamp negatives to 0, integer
    if (inputEl.classList.contains("bonus-input") || /^bonus\d+$/.test(id)) {
      const v = int(inputEl.value);
      inputEl.value = String(v < 0 ? 0 : v);
      inputEl.classList.remove("invalid");
      return { ok: true };
    }

    // Question inputs
    if (/^num\d+\d+$/.test(id)) {
      const teamId = getTeamIdFrom(inputEl, teamIdMaybe);
      const q = parseQuestionNumberFromId(id, teamId);

      if (isFeudMode()) {
        const v = int(inputEl.value);
        inputEl.value = String(v < 0 ? 0 : v);
        inputEl.classList.remove("invalid");
        return { ok: true };
      }

      const v = clampQuestionValue(q, inputEl.value);
      inputEl.value = String(v);
      inputEl.classList.remove("invalid");
      return { ok: true };
    }

    // Default: clamp negatives to 0
    if (raw < 0) inputEl.value = "0";
    inputEl.classList.remove("invalid");
    return { ok: true };
  }

  function computeTotals(teamId) {
    const row = getRowByTeamId(teamId);
    if (!row) return null;

    let r1 = 0,
      r2 = 0,
      r3 = 0,
      r4 = 0;

    for (let q = 1; q <= 20; q++) {
      const inp = getByIdInRow(row, `num${teamId}${q}`); // ✅ row-scoped
      if (!inp) continue;
      validateInput(inp, teamId);
      const v = int(inp.value);
      if (q <= 5) r1 += v;
      else if (q <= 10) r2 += v;
      else if (q <= 15) r3 += v;
      else r4 += v;
    }

    const htEl = getByIdInRow(row, `halfTime${teamId}`);
    if (htEl) validateInput(htEl, teamId);
    const halftime = htEl ? int(htEl.value) : 0;

    const fqEl = getByIdInRow(row, `finalQuestion${teamId}`);
    if (fqEl) validateInput(fqEl, teamId);
    const finalQ = fqEl ? num(fqEl.value) : 0;

    const bonusEl = getBonusInput(row, teamId);
    if (bonusEl) validateInput(bonusEl, teamId);
    const bonus = bonusEl ? int(bonusEl.value) : 0;

    const likeEl = getByIdInRow(row, `checkbox${teamId}`) || document.getElementById(`checkbox${teamId}`);
    const likeBonus = likeEl && likeEl.checked ? 5 : 0;

    const firstHalfTotal = r1 + r2 + halftime;
    const secondHalfTotal = r3 + r4 + finalQ;
    const finalScore = firstHalfTotal + secondHalfTotal + bonus + likeBonus;

    return {
      r1Total: r1,
      r2Total: r2,
      r3Total: r3,
      r4Total: r4,
      halftime,
      finalQ,
      bonus,
      likeBonus,
      firstHalfTotal,
      secondHalfTotal,
      finalScore,
    };
  }

  function writeTotals(teamId, totals) {
    if (!totals) return;
    setTextById(`r1Total${teamId}`, totals.r1Total);
    setTextById(`r2Total${teamId}`, totals.r2Total);
    setTextById(`r3Total${teamId}`, totals.r3Total);
    setTextById(`r4Total${teamId}`, totals.r4Total);

    setTextById(`firstHalfTotal${teamId}`, totals.firstHalfTotal);
    setTextById(`secondHalfTotal${teamId}`, totals.secondHalfTotal);
    setTextById(`finalScore${teamId}`, totals.finalScore);
  }

  function recalcRowTotals(arg, teamIdMaybe) {
    const teamId = getTeamIdFrom(arg, teamIdMaybe);
    if (!teamId) return null;
    const totals = computeTotals(teamId);
    writeTotals(teamId, totals);
    return totals;
  }

  function updateScores(arg, teamIdMaybe) {
    return recalcRowTotals(arg, teamIdMaybe);
  }

  function updateFinalScore(arg, teamIdMaybe) {
    return recalcRowTotals(arg, teamIdMaybe);
  }

  window.validateInput = window.validateInput || validateInput;
  window.recalcRowTotals = window.recalcRowTotals || recalcRowTotals;
  window.updateScores = window.updateScores || updateScores;
  window.updateFinalScore = window.updateFinalScore || updateFinalScore;

  function autoBind() {
    const tbody = $("#teamTable tbody");
    if (!tbody || tbody.dataset.boundScoring) return;

    tbody.addEventListener("input", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      if ((t.type || "").toLowerCase() !== "number") return;
      validateInput(t);
      recalcRowTotals(t);
    });

    tbody.addEventListener("change", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;

      if (t.classList.contains("teamCheckbox") || /^checkbox\d+$/.test(t.id || "")) {
        recalcRowTotals(t);
      }
    });

    window.addEventListener("scoresheet:team-added", (ev) => {
      const teamId = ev?.detail?.teamId;
      if (teamId) recalcRowTotals(teamId);
    });

    tbody.dataset.boundScoring = "1";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoBind, { once: true });
  } else {
    autoBind();
  }
})();