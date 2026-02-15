/* ui-sticky-bonus.js
   Keeps BONUS + FINAL SCORE sticky columns aligned (no overlap / no growing)
   and preserves "bonus input selects 0 on first click".

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
        try {
          inp.select();
        } catch (_) {}
      });
  
      inp.addEventListener("focus", () => {
        if (inp.dataset.touched === "1") return;
        setTimeout(() => {
          try {
            inp.select();
          } catch (_) {}
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
      // Prefer the top header row where BONUS/FINAL are in the first header row with rowspans
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
  
    function applyWidthsAndOffsets(table, bonusW, finalW) {
      // Inject stable widths + sticky positioning.
      // NOTE: we explicitly set position/right here because some CSS currently differs between th/td.
      const style = ensureStyleTag("sticky-right-columns-style");
      style.textContent = `
        ${FINAL_CELL_SELECTOR} {
          position: sticky;
          right: 0px;
          z-index: 6;
          background: inherit;
          width: ${finalW}px;
          min-width: ${finalW}px;
          max-width: ${finalW}px;
          box-sizing: border-box;
        }
        ${BONUS_CELL_SELECTOR} {
          position: sticky;
          right: ${finalW}px;
          z-index: 5;
          background: inherit;
          width: ${bonusW}px;
          min-width: ${bonusW}px;
          max-width: ${bonusW}px;
          box-sizing: border-box;
        }
        ${BONUS_INPUT_SELECTOR} {
          width: 100%;
          box-sizing: border-box;
        }
      `;
    }
  
    function updateStickyRightWidths() {
      const table = getTable();
      if (!table) return;
  
      // Always measure header widths (stable). Measuring tbody is what causes the "grows then won't shrink" issue.
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
        // second pass for late layout settling
        requestAnimationFrame(updateStickyRightWidths);
      }, 80);
    }
  
    // --- init / listeners ---
    function init() {
      bindAllBonusInputs();
      scheduleStickyRecalc();
    }
  
    window.addEventListener("load", init);
    window.addEventListener("resize", scheduleStickyRecalc);
    window.addEventListener("orientationchange", scheduleStickyRecalc);
  
    // IMPORTANT: do NOT recalc on every scroll (causes jitter + feedback loops).
    // Horizontal scrolling should NOT require recalculation when widths/offsets are fixed.
    // document.addEventListener("scroll", scheduleStickyRecalc, true);
  
    window.addEventListener("scoresheet:team-added", () => {
      bindAllBonusInputs();
      scheduleStickyRecalc();
    });
  
    // Expose for other modules
    window.bindBonusInput = bindBonusInput;
    window.updateStickyRightWidths = updateStickyRightWidths;
  })();