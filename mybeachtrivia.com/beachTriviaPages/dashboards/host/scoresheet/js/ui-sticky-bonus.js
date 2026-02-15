/* ui-sticky-bonus.js
   Keeps BONUS + FINAL SCORE sticky columns aligned (no overlap / no growing)
   and preserves "bonus input selects 0 on first click".

   Fix: do NOT use background: inherit; (it makes sticky cells “transparent”).
        Force an opaque background + proper stacking so rows don’t show through.

   Assumes:
   - BONUS td/th has class "bonus-col-right"
   - FINAL SCORE td/th has class "sticky-col-right"
   - Table id is "teamTable"
*/
(function () {
    "use strict";
  
    const TABLE_ID = "teamTable";
    const BONUS_CELL_SELECTOR = "td.bonus-col-right, th.bonus-col-right";
    const FINAL_CELL_SELECTOR = "td.sticky-col-right, th.sticky-col-right";
    const BONUS_INPUT_SELECTOR = "td.bonus-col-right input.bonus-input";
  
    function getTable() {
      return document.getElementById(TABLE_ID);
    }
  
    function ensureStyleTag(id) {
      let tag = document.getElementById(id);
      if (!tag) {
        tag = document.createElement("style");
        tag.id = id;
        document.head.appendChild(tag);
      }
      return tag;
    }
  
    function bindBonusInput(inp) {
      if (!inp || inp.__bonusBound) return;
      inp.__bonusBound = true;
  
      if (inp.value === "" || inp.value == null) inp.value = "0";
      if (!inp.dataset.touched) inp.dataset.touched = "0";
  
      inp.addEventListener("mousedown", (e) => {
        if (inp.dataset.touched === "1") return;
        e.preventDefault();
        inp.focus();
        try { inp.select(); } catch (_) {}
      });
  
      inp.addEventListener("focus", () => {
        if (inp.dataset.touched === "1") return;
        setTimeout(() => {
          try { inp.select(); } catch (_) {}
        }, 0);
      });
  
      inp.addEventListener("input", () => {
        inp.dataset.touched = "1";
        scheduleStickyRecalc();
      });
    }
  
    function bindAllBonusInputs() {
      const table = getTable();
      if (!table) return;
      table.querySelectorAll(BONUS_INPUT_SELECTOR).forEach(bindBonusInput);
    }
  
    // --- Sticky sizing/offsets (NO measurement from tbody; lock to header widths) ---
    function measureHeaderWidths(table) {
      const bonusTh =
        table.querySelector("thead th.bonus-col-right") ||
        table.querySelector("thead tr:first-child th:nth-last-child(2)");
      const finalTh =
        table.querySelector("thead th.sticky-col-right") ||
        table.querySelector("thead tr:first-child th:last-child");
  
      if (!bonusTh || !finalTh) return null;
  
      const bonusW = Math.max(80, Math.round(bonusTh.getBoundingClientRect().width || 0));
      const finalW = Math.max(110, Math.round(finalTh.getBoundingClientRect().width || 0));
  
      return { bonusW, finalW };
    }
  
    function findOpaqueBg(table) {
      // Prefer explicit colors if present; fall back to the table background.
      // (Computed styles are safest across your gradients/themes.)
      const finalCell = table.querySelector("thead th.sticky-col-right") || table.querySelector("th.sticky-col-right") || table;
      const bg = window.getComputedStyle(finalCell).backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
  
      const tableBg = window.getComputedStyle(table).backgroundColor;
      if (tableBg && tableBg !== "rgba(0, 0, 0, 0)" && tableBg !== "transparent") return tableBg;
  
      return "#2a2a2a";
    }
  
    function applyWidthsAndOffsets(table, bonusW, finalW) {
      const bg = findOpaqueBg(table);
  
      const style = ensureStyleTag("sticky-right-columns-style");
      style.textContent = `
        /* FINAL */
        ${FINAL_CELL_SELECTOR} {
          position: sticky;
          right: 0px;
          z-index: 200;
          background-color: ${bg};
          background-clip: padding-box;
          width: ${finalW}px;
          min-width: ${finalW}px;
          max-width: ${finalW}px;
          box-sizing: border-box;
          isolation: isolate;
          transform: translateZ(0);
        }
  
        /* BONUS */
        ${BONUS_CELL_SELECTOR} {
          position: sticky;
          right: ${finalW}px;
          z-index: 190;
          background-color: ${bg};
          background-clip: padding-box;
          width: ${bonusW}px;
          min-width: ${bonusW}px;
          max-width: ${bonusW}px;
          box-sizing: border-box;
          isolation: isolate;
          transform: translateZ(0);
        }
  
        /* Keep the input from forcing column growth */
        ${BONUS_INPUT_SELECTOR} {
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }
      `;
    }
  
    function updateStickyRightWidths() {
      const table = getTable();
      if (!table) return;
  
      const m = measureHeaderWidths(table);
      if (!m) return;
  
      applyWidthsAndOffsets(table, m.bonusW, m.finalW);
    }
  
    // Debounced scheduler to avoid spam
    let stickyTimer = null;
    function scheduleStickyRecalc() {
      if (stickyTimer) clearTimeout(stickyTimer);
      stickyTimer = setTimeout(() => {
        updateStickyRightWidths();
        requestAnimationFrame(updateStickyRightWidths);
      }, 80);
    }
  
    function init() {
      bindAllBonusInputs();
      scheduleStickyRecalc();
    }
  
    window.addEventListener("load", init);
    window.addEventListener("resize", scheduleStickyRecalc);
    window.addEventListener("orientationchange", scheduleStickyRecalc);
  
    window.addEventListener("scoresheet:team-added", () => {
      bindAllBonusInputs();
      scheduleStickyRecalc();
    });
  
    // Expose for other modules
    window.bindBonusInput = bindBonusInput;
    window.updateStickyRightWidths = updateStickyRightWidths;
  })();