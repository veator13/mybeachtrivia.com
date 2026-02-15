/* grid-enforcer.js
   Host Scoresheet "grid enforcer" behaviors:
   - Keyboard navigation across the table inputs (arrows / Enter / Tab-like flow)
   - Quick-snap focus helpers
   - Final-negative guard: prevents negative values in score inputs (esp final/bonus)

   Classic script style (no imports). Exposes window.GridEnforcer.init().
*/
(function () {
    "use strict";
  
    const SELECTORS = {
      table: "#teamTable",
      tbody: "#teamTable tbody",
      // Inputs we consider "grid cells"
      cellInputs:
        '#teamTable tbody input[type="number"], #teamTable tbody input[type="text"], #teamTable tbody input',
    };
  
    function $(sel, root) {
      return (root || document).querySelector(sel);
    }
  
    function $all(sel, root) {
      return Array.from((root || document).querySelectorAll(sel));
    }
  
    function isVisible(el) {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    }
  
    function getCellInputsInRow(tr) {
      // Return ONLY visible, enabled inputs in this row in DOM order.
      return $all('input, select, textarea', tr)
        .filter((el) => !el.disabled && isVisible(el))
        .filter((el) => {
          const tag = el.tagName.toLowerCase();
          if (tag === "input") return el.type !== "hidden";
          return true;
        });
    }
  
    function getGridInputs() {
      return $all(SELECTORS.cellInputs).filter((el) => !el.disabled && isVisible(el));
    }
  
    function findRow(el) {
      return el?.closest?.("tr") || null;
    }
  
    function clampNonNegativeNumberInput(inputEl) {
      if (!inputEl) return;
  
      // Only act on number-like inputs
      const type = (inputEl.getAttribute("type") || "").toLowerCase();
      if (type !== "number") return;
  
      // If empty, do nothing
      if (inputEl.value === "") return;
  
      const n = Number(inputEl.value);
      if (!Number.isFinite(n)) return;
  
      if (n < 0) {
        inputEl.value = "0";
        // Fire input/change so any score recalcs hooked elsewhere still run
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        inputEl.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  
    function focusEl(el) {
      if (!el) return false;
      try {
        el.focus({ preventScroll: false });
        if (typeof el.select === "function") el.select();
        return true;
      } catch {
        return false;
      }
    }
  
    function moveWithinRow(currentEl, dir) {
      const tr = findRow(currentEl);
      if (!tr) return false;
  
      const inputs = getCellInputsInRow(tr);
      const idx = inputs.indexOf(currentEl);
      if (idx === -1) return false;
  
      const next = inputs[idx + dir];
      return focusEl(next);
    }
  
    function moveToRow(currentEl, rowDir) {
      const tr = findRow(currentEl);
      if (!tr) return false;
  
      // Determine "column index" inside the current row’s input list
      const currentRowInputs = getCellInputsInRow(tr);
      const colIndex = currentRowInputs.indexOf(currentEl);
  
      let targetRow = tr;
      for (let i = 0; i < 1000; i++) {
        targetRow = rowDir > 0 ? targetRow.nextElementSibling : targetRow.previousElementSibling;
        if (!targetRow) return false;
        if (targetRow.tagName?.toLowerCase() !== "tr") continue;
  
        const targetInputs = getCellInputsInRow(targetRow);
        if (targetInputs.length === 0) continue;
  
        // Same column if possible; otherwise clamp to last input
        const target = targetInputs[Math.min(Math.max(colIndex, 0), targetInputs.length - 1)];
        return focusEl(target);
      }
      return false;
    }
  
    function moveToEdge(currentEl, edge) {
      const tr = findRow(currentEl);
      if (!tr) return false;
  
      const inputs = getCellInputsInRow(tr);
      if (!inputs.length) return false;
  
      if (edge === "start") return focusEl(inputs[0]);
      if (edge === "end") return focusEl(inputs[inputs.length - 1]);
      return false;
    }
  
    function moveNextGridInput(currentEl, dir) {
      // A "flat" navigation across all inputs in the table (row-major).
      const all = getGridInputs();
      const idx = all.indexOf(currentEl);
      if (idx === -1) return false;
  
      return focusEl(all[idx + dir]);
    }
  
    function handleKeydown(e) {
      const el = e.target;
      if (!el) return;
  
      // Only act on inputs inside the grid table
      const table = $(SELECTORS.table);
      if (!table || !table.contains(el)) return;
  
      const key = e.key;
  
      // We do NOT hijack typing (letters, numbers)
      // Only navigation keys below.
      if (key === "ArrowLeft") {
        e.preventDefault();
        // Try left within row, else go to prev grid input
        if (!moveWithinRow(el, -1)) moveNextGridInput(el, -1);
        return;
      }
  
      if (key === "ArrowRight") {
        e.preventDefault();
        if (!moveWithinRow(el, +1)) moveNextGridInput(el, +1);
        return;
      }
  
      if (key === "ArrowUp") {
        e.preventDefault();
        moveToRow(el, -1);
        return;
      }
  
      if (key === "ArrowDown") {
        e.preventDefault();
        moveToRow(el, +1);
        return;
      }
  
      // Enter behaves like "move right" (common in score grids)
      if (key === "Enter") {
        e.preventDefault();
        if (!moveWithinRow(el, +1)) moveNextGridInput(el, +1);
        return;
      }
  
      // Home/End jump within the row
      if (key === "Home") {
        e.preventDefault();
        moveToEdge(el, "start");
        return;
      }
  
      if (key === "End") {
        e.preventDefault();
        moveToEdge(el, "end");
        return;
      }
  
      // Optional: Ctrl+Arrow to jump to row edge
      if (e.ctrlKey && key === "ArrowLeft") {
        e.preventDefault();
        moveToEdge(el, "start");
        return;
      }
  
      if (e.ctrlKey && key === "ArrowRight") {
        e.preventDefault();
        moveToEdge(el, "end");
        return;
      }
    }
  
    function handleInput(e) {
      const el = e.target;
      if (!el) return;
  
      const table = $(SELECTORS.table);
      if (!table || !table.contains(el)) return;
  
      // Enforce non-negative numeric inputs
      clampNonNegativeNumberInput(el);
    }
  
    function quickSnapFirstCell() {
      const tbody = $(SELECTORS.tbody);
      if (!tbody) return false;
      const firstRow = tbody.querySelector("tr");
      if (!firstRow) return false;
  
      const inputs = getCellInputsInRow(firstRow);
      return focusEl(inputs[0]);
    }
  
    function init() {
      const table = $(SELECTORS.table);
      if (!table) return;
  
      // Event delegation (survives dynamic row creation)
      document.addEventListener("keydown", handleKeydown, true);
      document.addEventListener("input", handleInput, true);
      document.addEventListener("change", handleInput, true);
  
      // Convenience: Alt+G snaps to the first grid cell
      document.addEventListener(
        "keydown",
        (e) => {
          if (e.altKey && (e.key === "g" || e.key === "G")) {
            e.preventDefault();
            quickSnapFirstCell();
          }
        },
        true
      );
    }
  
    window.GridEnforcer = { init };
  
    // Auto-init (scripts are defer; DOM will be parsed)
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
      init();
    }
  })();