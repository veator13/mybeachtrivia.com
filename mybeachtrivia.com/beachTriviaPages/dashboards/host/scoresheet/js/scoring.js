/* scoring.js
   Score validation + calculation helpers for the Host Scoresheet.

   Exposes (globals):
     - validateInput(inputEl)
     - updateScores(rowEl)
     - updateFinalScore(rowEl)
     - recalcRowTotals(rowEl)

   Notes:
   - Designed to work with your current table shape:
     Team Name | Q1..Q5 | R1 Total | Q6..Q10 | R2 Total | Half Time | First Half Total
               | Q11..Q15 | R3 Total | Q16..Q20 | R4 Total | Final Question | Second Half Total
               | Bonus | Final Score
   - Uses numeric parsing with defaults, clamps negatives to 0 (can be adjusted).
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
  
    function clamp0(n) {
      return n < 0 ? 0 : n;
    }
  
    function setText(cell, value) {
      if (!cell) return;
      cell.textContent = String(value);
    }
  
    function setValue(input, value) {
      if (!input) return;
      input.value = String(value);
    }
  
    function getRow(el) {
      return el?.closest?.("tr") || null;
    }
  
    function getRowInputs(row) {
      // All numeric inputs in the row (excluding team name text input if present)
      return $all('input[type="number"]', row).filter((i) => !i.disabled);
    }
  
    function findCellsByHeuristics(row) {
      // Heuristic: many implementations use class names on total cells/inputs.
      // If your app.js uses different selectors, we’ll tweak later once you paste your row markup.
      const byClass = (cls) => row.querySelector(cls);
  
      return {
        // totals might be <td> with ids/classes or could be <input readonly>
        r1Total: byClass(".r1-total, .r1Total, [data-total='r1'], [data-total='r1Total']"),
        r2Total: byClass(".r2-total, .r2Total, [data-total='r2'], [data-total='r2Total']"),
        r3Total: byClass(".r3-total, .r3Total, [data-total='r3'], [data-total='r3Total']"),
        r4Total: byClass(".r4-total, .r4Total, [data-total='r4'], [data-total='r4Total']"),
        firstHalfTotal: byClass(
          ".first-half-total, .firstHalfTotal, [data-total='firstHalf'], [data-total='firstHalfTotal']"
        ),
        secondHalfTotal: byClass(
          ".second-half-total, .secondHalfTotal, [data-total='secondHalf'], [data-total='secondHalfTotal']"
        ),
        finalScore: byClass(".final-score, .finalScore, [data-total='final'], [data-total='finalScore']"),
      };
    }
  
    function getOrderedScoreInputs(row) {
      // Your table has 20 question inputs + halftime + final question + bonus (likely numeric).
      // We assume the row’s numeric inputs appear in DOM order:
      // Q1..Q5, Q6..Q10, halftime, Q11..Q15, Q16..Q20, finalQ, bonus, finalScore(readonly maybe)
      // If your row contains readonly totals as <input type=number>, that will confuse things.
      // In that case we’ll use your actual selectors after you show your addTeam() row template.
      return getRowInputs(row);
    }
  
    function computeTotalsFromInputs(row) {
      const inputs = getOrderedScoreInputs(row);
      // We expect at least:
      // 20 questions + halftime + finalQ + bonus = 23 numeric inputs.
      // Some builds include totals as readonly inputs; if so, we still compute from the first 23.
      const vals = inputs.map((i) => clamp0(num(i.value)));
  
      // Find a sane mapping:
      // Q1-5 => 0-4
      // Q6-10 => 5-9
      // halftime => 10
      // Q11-15 => 11-15
      // Q16-20 => 16-20
      // finalQ => 21
      // bonus => 22
      const q1_5 = vals.slice(0, 5);
      const q6_10 = vals.slice(5, 10);
      const halftime = vals[10] ?? 0;
      const q11_15 = vals.slice(11, 16);
      const q16_20 = vals.slice(16, 21);
      const finalQ = vals[21] ?? 0;
      const bonus = vals[22] ?? 0;
  
      const r1Total = q1_5.reduce((a, b) => a + b, 0);
      const r2Total = q6_10.reduce((a, b) => a + b, 0);
      const firstHalfTotal = r1Total + r2Total + halftime;
  
      const r3Total = q11_15.reduce((a, b) => a + b, 0);
      const r4Total = q16_20.reduce((a, b) => a + b, 0);
      const secondHalfTotal = r3Total + r4Total + finalQ;
  
      const finalScore = firstHalfTotal + secondHalfTotal + bonus;
  
      return {
        r1Total,
        r2Total,
        halftime,
        firstHalfTotal,
        r3Total,
        r4Total,
        finalQ,
        secondHalfTotal,
        bonus,
        finalScore,
      };
    }
  
    function writeTotals(row, totals) {
      // Try to write into obvious readonly inputs/cells if they exist
      const cells = findCellsByHeuristics(row);
  
      const write = (target, value) => {
        if (!target) return;
        const tag = target.tagName?.toLowerCase?.();
        if (tag === "input" || tag === "textarea") setValue(target, value);
        else setText(target, value);
      };
  
      write(cells.r1Total, totals.r1Total);
      write(cells.r2Total, totals.r2Total);
      write(cells.r3Total, totals.r3Total);
      write(cells.r4Total, totals.r4Total);
      write(cells.firstHalfTotal, totals.firstHalfTotal);
      write(cells.secondHalfTotal, totals.secondHalfTotal);
      write(cells.finalScore, totals.finalScore);
    }
  
    function validateInput(inputEl) {
      if (!inputEl) return { ok: true };
  
      const type = (inputEl.getAttribute("type") || "").toLowerCase();
      if (type !== "number") return { ok: true };
  
      if (inputEl.value === "") return { ok: true };
  
      const n = Number(inputEl.value);
      if (!Number.isFinite(n)) {
        inputEl.classList.add("invalid");
        return { ok: false, reason: "Not a number" };
      }
  
      // Clamp negatives to 0 (your grid-enforcer also does this)
      if (n < 0) {
        inputEl.value = "0";
      }
  
      inputEl.classList.remove("invalid");
      return { ok: true };
    }
  
    function recalcRowTotals(rowEl) {
      const row = rowEl?.tagName ? rowEl : getRow(rowEl);
      if (!row) return null;
  
      // Validate all numeric inputs first (light-touch)
      getRowInputs(row).forEach((inp) => validateInput(inp));
  
      const totals = computeTotalsFromInputs(row);
      writeTotals(row, totals);
  
      return totals;
    }
  
    function updateScores(rowEl) {
      // Alias to the same recalculation
      return recalcRowTotals(rowEl);
    }
  
    function updateFinalScore(rowEl) {
      // Same calculation; kept for compatibility with older naming
      return recalcRowTotals(rowEl);
    }
  
    // Expose globals (so app.js can keep calling them)
    window.validateInput = window.validateInput || validateInput;
    window.recalcRowTotals = window.recalcRowTotals || recalcRowTotals;
    window.updateScores = window.updateScores || updateScores;
    window.updateFinalScore = window.updateFinalScore || updateFinalScore;
  
    // Optional: auto-bind recalculation on input changes (safe, but you may already do this in app.js)
    function autoBind() {
      const tbody = $("#teamTable tbody");
      if (!tbody) return;
  
      // Delegate input events: whenever a numeric input changes, recalc that row
      tbody.addEventListener("input", (e) => {
        const t = e.target;
        if (!(t instanceof HTMLElement)) return;
        if (t.tagName.toLowerCase() !== "input") return;
        if ((t.getAttribute("type") || "").toLowerCase() !== "number") return;
  
        recalcRowTotals(t);
      });
    }
  
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", autoBind, { once: true });
    } else {
      autoBind();
    }
  })();