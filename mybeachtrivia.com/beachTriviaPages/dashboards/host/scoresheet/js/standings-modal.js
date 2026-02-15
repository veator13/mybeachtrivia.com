/* standings-modal.js
   Standings modal open/close + ranking rendering.

   Exposes globals:
     - showStandings()
     - closeModal()
     - invertStandingsOrder()  (alias toggleStandingsSort)

   Relies on existing DOM ids:
     - standingsModal
     - modalRankingList
     - btnCloseModal
     - btnInvertStandings
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
      const s = String(v).trim();
      if (!s) return 0;
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    }
  
    function getTeamRows() {
      return $all("#teamTable tbody tr");
    }
  
    function getTeamName(row) {
      // first text input in the row
      const inp = row.querySelector('input[type="text"], input:not([type]), textarea');
      return (inp?.value || "").trim() || "Unnamed Team";
    }
  
    function getFinalScoreValue(row) {
      // Try common patterns first
      const candidates = [
        row.querySelector(".sticky-col-right input"),
        row.querySelector(".sticky-col-right"),
        row.querySelector(".final-score input"),
        row.querySelector(".final-score"),
        row.querySelector("[data-total='finalScore']"),
        row.querySelector("[data-total='final']"),
      ].filter(Boolean);
  
      for (const c of candidates) {
        if (!c) continue;
        const tag = c.tagName?.toLowerCase?.();
        if (tag === "input" || tag === "textarea") return num(c.value);
        // If it contains an input, use it
        const inner = c.querySelector?.("input, textarea");
        if (inner) return num(inner.value);
        // else use text content
        return num(c.textContent);
      }
  
      // Fallback: last numeric input in the row (often final score, unless totals are also inputs)
      const nums = Array.from(row.querySelectorAll('input[type="number"]')).filter((i) => !i.disabled);
      if (nums.length) return num(nums[nums.length - 1].value);
  
      // last resort: parse any number from last cell text
      const lastCell = row.querySelector("td:last-child");
      return num(lastCell?.textContent || "0");
    }
  
    function recalcAllRowsIfPossible() {
      // If scoring recalculation exists, run it so standings are accurate.
      const rows = getTeamRows();
      for (const row of rows) {
        // Most compatible: updateFinalScore(row) or updateScores(row)
        if (typeof window.updateFinalScore === "function") {
          try { window.updateFinalScore(row); } catch {}
        } else if (typeof window.updateScores === "function") {
          try { window.updateScores(row); } catch {}
        } else if (typeof window.recalcRowTotals === "function") {
          try { window.recalcRowTotals(row); } catch {}
        }
      }
    }
  
    function buildRankings() {
      recalcAllRowsIfPossible();
  
      const rows = getTeamRows();
      const items = rows.map((row) => {
        return {
          row,
          name: getTeamName(row),
          score: getFinalScoreValue(row),
        };
      });
  
      // Default: descending (highest score first). If standingsAscending is true, lowest first.
      const ascending = !!window.standingsAscending;
  
      items.sort((a, b) => (ascending ? a.score - b.score : b.score - a.score));
  
      return items;
    }
  
    function renderRankings(items) {
      const list = document.getElementById("modalRankingList");
      if (!list) return;
  
      list.innerHTML = "";
  
      items.forEach((it, idx) => {
        const li = document.createElement("li");
        li.style.display = "flex";
        li.style.justifyContent = "space-between";
        li.style.gap = "12px";
        li.style.padding = "6px 0";
  
        const left = document.createElement("span");
        left.textContent = `${idx + 1}. ${it.name}`;
  
        const right = document.createElement("strong");
        right.textContent = String(it.score);
  
        li.appendChild(left);
        li.appendChild(right);
  
        // Click a ranking to scroll to that team row
        li.style.cursor = "pointer";
        li.addEventListener("click", () => {
          it.row.scrollIntoView({ behavior: "smooth", block: "center" });
          // Try focusing the team name input
          const inp = it.row.querySelector('input[type="text"], input:not([type]), textarea');
          inp?.focus?.();
          inp?.select?.();
        });
  
        list.appendChild(li);
      });
    }
  
    function openModal() {
      const modal = document.getElementById("standingsModal");
      if (!modal) return;
  
      modal.hidden = false;
  
      // Focus close button for accessibility
      const btnClose = document.getElementById("btnCloseModal");
      btnClose?.focus?.();
    }
  
    function closeModal() {
      const modal = document.getElementById("standingsModal");
      if (!modal) return;
  
      modal.hidden = true;
  
      // Return focus to "Standings" button if present
      document.getElementById("btnShowStandings")?.focus?.();
    }
  
    function syncInvertButtonState() {
      const btn = document.getElementById("btnInvertStandings");
      if (!btn) return;
      const pressed = !!window.standingsAscending;
      btn.setAttribute("aria-pressed", pressed ? "true" : "false");
    }
  
    function invertStandingsOrder() {
      window.standingsAscending = !window.standingsAscending;
      syncInvertButtonState();
  
      // If modal is open, rerender
      const modal = document.getElementById("standingsModal");
      if (modal && !modal.hidden) {
        renderRankings(buildRankings());
      }
    }
  
    function showStandings() {
      syncInvertButtonState();
      const items = buildRankings();
      renderRankings(items);
      openModal();
    }
  
    // Wire buttons (safe even if main.js also wires; duplicates won’t break much but we’ll keep it minimal)
    function bind() {
      const btnClose = document.getElementById("btnCloseModal");
      if (btnClose && !btnClose.__standingsBound) {
        btnClose.__standingsBound = true;
        btnClose.addEventListener("click", closeModal);
      }
  
      const btnInvert = document.getElementById("btnInvertStandings");
      if (btnInvert && !btnInvert.__standingsBound) {
        btnInvert.__standingsBound = true;
        btnInvert.addEventListener("click", invertStandingsOrder);
      }
  
      // Escape closes modal
      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        const modal = document.getElementById("standingsModal");
        if (modal && !modal.hidden) closeModal();
      });
    }
  
    // Expose globals for compatibility
    window.showStandings = window.showStandings || showStandings;
    window.closeModal = window.closeModal || closeModal;
    window.invertStandingsOrder = window.invertStandingsOrder || invertStandingsOrder;
    window.toggleStandingsSort = window.toggleStandingsSort || invertStandingsOrder;
  
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bind, { once: true });
    } else {
      bind();
    }
  })();