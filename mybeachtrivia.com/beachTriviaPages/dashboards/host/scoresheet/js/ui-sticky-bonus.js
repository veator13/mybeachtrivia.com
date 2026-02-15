/* ui-sticky-bonus.js
   Keeps BONUS + FINAL SCORE sticky columns aligned (no overlap)
   and provides the legacy "bonus input selects 0 on first click" behavior.

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
  
    function bindBonusInput(inp) {
      if (!inp || inp.__bonusBound) return;
      inp.__bonusBound = true;
  
      if (inp.value === "" || inp.value == null) inp.value = "0";
      if (!inp.dataset.touched) inp.dataset.touched = "0";
  
      // First interaction selects the whole value (handy when default is 0)
      inp.addEventListener("mousedown", (e) => {
        if (inp.dataset.touched === "1") return;
        // prevent drag-selection weirdness
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
        // keep layout stable if width changes due to font rendering
        scheduleStickyRecalc();
      });
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
  
    function getTable() {
      return document.getElementById(TABLE_ID);
    }
  
    function findSampleCell(table, selector) {
      // Prefer tbody cell (real width), fallback to header
      return (
        table.querySelector("tbody " + selector) ||
        table.querySelector("thead " + selector) ||
        table.querySelector(selector)
      );
    }
  
    function updateStickyRightWidths() {
      const table = getTable();
      if (!table) return;
  
      const finalCell = findSampleCell(table, FINAL_CELL_SELECTOR);
      const bonusCell = findSampleCell(table, BONUS_CELL_SELECTOR);
  
      if (!finalCell || !bonusCell) return;
  
      // --- Step 1: compute stable widths for the two rightmost sticky columns
      // Use current measured widths, but clamp to sane minimums
      const finalWidth = Math.max(60, Math.round(finalCell.getBoundingClientRect().width || 0));
      const bonusWidth = Math.max(40, Math.round(bonusCell.getBoundingClientRect().width || 0));
  
      const widthStyle = ensureStyleTag("bonus-final-width-style");
      widthStyle.textContent = `
        ${FINAL_CELL_SELECTOR} {
          min-width: ${finalWidth}px;
          width: ${finalWidth}px;
        }
        ${BONUS_CELL_SELECTOR} {
          min-width: ${bonusWidth}px;
          width: ${bonusWidth}px;
        }
      `;
  
      // --- Step 2: size bonus input so it doesn't overflow its cell
      // Try to base it on a typical score input width, else default
      const sampleQInput =
        table.querySelector("tbody input[id^='num']") ||
        table.querySelector("tbody input[type='number']");
  
      let bonusInputWidth = 30;
      if (sampleQInput) {
        const r = sampleQInput.getBoundingClientRect();
        if (r.width) bonusInputWidth = Math.max(26, Math.round(r.width * 0.75));
      }
  
      const bonusInputStyle = ensureStyleTag("bonus-input-tight-style");
      bonusInputStyle.textContent = `
        ${BONUS_INPUT_SELECTOR} {
          width: ${bonusInputWidth}px;
        }
      `;
  
      // --- Step 3: compute BONUS "right" offset so it sits directly left of FINAL
      // Bonus is sticky-right too, so it must have right = finalWidth (+ any actual overlap/gap adjustments)
      // We do a two-pass measurement because layout settles after widthStyle injection.
      requestAnimationFrame(() => {
        const finalCell2 = findSampleCell(table, FINAL_CELL_SELECTOR);
        const bonusCell2 = findSampleCell(table, BONUS_CELL_SELECTOR);
        if (!finalCell2 || !bonusCell2) return;
  
        const f = finalCell2.getBoundingClientRect();
        const b = bonusCell2.getBoundingClientRect();
  
        // gap = distance from bonus right edge to final left edge
        //   +gap => space between them, -gap => overlap
        const gap = f.left - b.right;
  
        // Start with expected right offset = final width
        // Then correct by subtracting gap:
        //   - if overlap (-gap), subtracting (-gap) increases right (moves bonus left) -> fixes overlap
        //   - if space (+gap), subtracting (+gap) decreases right (moves bonus right) -> closes gap
        const expected = Math.max(0, Math.round(f.width));
        const corrected = Math.max(0, Math.round(expected - gap));
  
        const offsetStyle = ensureStyleTag("bonus-offset-style");
        offsetStyle.textContent = `
          ${BONUS_CELL_SELECTOR} {
            right: ${corrected}px;
          }
        `;
      });
    }
  
    // Debounced scheduler to avoid spam
    let stickyTimer = null;
    function scheduleStickyRecalc() {
      if (stickyTimer) clearTimeout(stickyTimer);
      stickyTimer = setTimeout(() => {
        updateStickyRightWidths();
        // run twice to catch late font/layout settling
        requestAnimationFrame(updateStickyRightWidths);
      }, 80);
    }
  
    // Bind existing bonus inputs (for already-rendered rows)
    function bindAllBonusInputs() {
      const table = getTable();
      if (!table) return;
      table.querySelectorAll(BONUS_INPUT_SELECTOR).forEach(bindBonusInput);
    }
  
    // Events that should trigger recalculation
    window.addEventListener("load", () => {
      bindAllBonusInputs();
      scheduleStickyRecalc();
    });
  
    window.addEventListener("resize", scheduleStickyRecalc);
  
    // Any scroll (especially horizontal on table wrapper) can change sticky calc
    document.addEventListener("scroll", scheduleStickyRecalc, true);
  
    // When our table-build.js adds a team, it dispatches this event
    window.addEventListener("scoresheet:team-added", () => {
      bindAllBonusInputs();
      scheduleStickyRecalc();
    });
  
    // Expose for other modules
    window.bindBonusInput = bindBonusInput;
    window.updateStickyRightWidths = updateStickyRightWidths;
  })();