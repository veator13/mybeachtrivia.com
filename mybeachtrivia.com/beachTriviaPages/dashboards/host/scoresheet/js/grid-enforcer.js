/* grid-enforcer.js
   Host Scoresheet "grid enforcer" behaviors:
   - Keyboard navigation across the table inputs (arrows / Enter / Tab-like flow)
   - Auto-fill empty numeric cells with 0 when leaving a cell (blur) or when navigating away
   - Final-negative guard: prevents negative values in score inputs
   - WARN on refresh/close/back when unsaved changes exist (beforeunload)

   Update:
   - ArrowLeft/ArrowRight:
       * If caret can move within the current field, move caret (do NOT change cell)
       * If caret is already at start/end, move to prev/next cell
   - Keep active cell in view:
       * Auto-scroll the .table-wrapper so the focused cell is NOT hidden under sticky columns
*/
(function () {
  "use strict";

  const SELECTORS = {
    table: "#teamTable",
    tbody: "#teamTable tbody",
    cellInputs:
      '#teamTable tbody input[type="number"], #teamTable tbody input[type="text"], #teamTable tbody input',
    wrapper: ".table-wrapper",
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
    return $all("input, select, textarea", tr)
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

  function isNumberInput(inputEl) {
    const type = (inputEl?.getAttribute?.("type") || "").toLowerCase();
    return type === "number";
  }

  function isStickyControl(el) {
    if (!el) return false;
    if (el.classList?.contains("teamName")) return true;
    if (el.classList?.contains("teamCheckbox")) return true;
    const cell = el.closest?.("td,th");
    if (!cell) return false;
    const cs = getComputedStyle(cell);
    return cs.position === "sticky";
  }

  // ---- dirty tracking ----
  function markDirty() {
    try {
      if (window.ScoresheetState?.markAsModified) window.ScoresheetState.markAsModified();
    } catch (_) {}
    if (typeof window.dataModified === "boolean") window.dataModified = true;
    if (window.ScoresheetState && typeof window.ScoresheetState.isDirty === "boolean") {
      window.ScoresheetState.isDirty = true;
    }
  }

  function isDirty() {
    try {
      if (window.ScoresheetState?.isModified?.()) return true;
    } catch (_) {}
    if (window.ScoresheetState && typeof window.ScoresheetState.isDirty === "boolean") {
      return !!window.ScoresheetState.isDirty;
    }
    if (typeof window.dataModified === "boolean") return window.dataModified;
    return false;
  }

  function setupBeforeUnloadWarning() {
    if (window.__gridEnforcerBeforeUnloadBound) return;
    window.__gridEnforcerBeforeUnloadBound = true;

    window.addEventListener("beforeunload", (e) => {
      if (!isDirty()) return;
      e.preventDefault();
      e.returnValue = "";
    });
  }

  function fillEmptyWithZero(inputEl) {
    if (!inputEl || !isNumberInput(inputEl)) return;
    const v = String(inputEl.value ?? "").trim();
    if (v !== "") return;

    inputEl.value = "0";
    markDirty();
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function clampNonNegativeNumberInput(inputEl) {
    if (!inputEl || !isNumberInput(inputEl)) return;
    if (inputEl.classList.contains("finalquestion-input")) return; // negatives allowed for Final Question
    if (String(inputEl.value ?? "").trim() === "") return;

    const n = Number(inputEl.value);
    if (!Number.isFinite(n)) return;

    if (n < 0) {
      inputEl.value = "0";
      markDirty();
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function finalizeCellOnLeave(currentEl) {
    if (!currentEl) return;
    fillEmptyWithZero(currentEl);
    clampNonNegativeNumberInput(currentEl);
  }

  // ---- keep focused cell visible (accounts for sticky columns) ----
  function findScrollWrapper() {
    const w = $(SELECTORS.wrapper);
    if (w) return w;

    const table = $(SELECTORS.table);
    if (!table) return null;

    let el = table.parentElement;
    while (el) {
      const s = getComputedStyle(el);
      const canScrollX = /(auto|scroll)/.test(s.overflowX);
      const canScrollY = /(auto|scroll)/.test(s.overflowY);
      if (canScrollX || canScrollY) return el;
      el = el.parentElement;
    }
    return null;
  }

  function getStickyGutters(wrapper) {
    const wrapRect = wrapper.getBoundingClientRect();

    const stickyEls = Array.from(wrapper.querySelectorAll("*")).filter((el) => {
      const cs = getComputedStyle(el);
      if (cs.position !== "sticky") return false;
      const left = cs.left;
      const right = cs.right;
      return (left && left !== "auto") || (right && right !== "auto");
    });

    let leftGutter = 0;
    let rightGutter = 0;

    for (const el of stickyEls) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();

      if (cs.left && cs.left !== "auto") {
        leftGutter = Math.max(leftGutter, r.right - wrapRect.left);
      }
      if (cs.right && cs.right !== "auto") {
        rightGutter = Math.max(rightGutter, wrapRect.right - r.left);
      }
    }

    leftGutter = Math.max(0, Math.min(leftGutter, wrapRect.width * 0.8));
    rightGutter = Math.max(0, Math.min(rightGutter, wrapRect.width * 0.8));

    return { leftGutter, rightGutter };
  }

  function computeVisibleBounds(wrapper) {
    const wrapRect = wrapper.getBoundingClientRect();
    const { leftGutter, rightGutter } = getStickyGutters(wrapper);
    const margin = 12;

    return {
      wrapRect,
      leftGutter,
      rightGutter,
      margin,
      visibleLeft: wrapRect.left + leftGutter + margin,
      visibleRight: wrapRect.right - rightGutter - margin,
      visibleTop: wrapRect.top + margin,
      visibleBottom: wrapRect.bottom - margin,
    };
  }

  function ensureCellInView(focusEl, opts) {
    const wrapper = findScrollWrapper();
    if (!wrapper || !focusEl) return;

    const options = Object.assign({ horizontal: true, vertical: true }, opts || {});
    const cell = focusEl.closest("td,th") || focusEl;

    const cellRect = cell.getBoundingClientRect();
    const b = computeVisibleBounds(wrapper);

    if (options.horizontal) {
      if (cellRect.left < b.visibleLeft) {
        wrapper.scrollLeft -= (b.visibleLeft - cellRect.left);
      } else if (cellRect.right > b.visibleRight) {
        wrapper.scrollLeft += (cellRect.right - b.visibleRight);
      }
    }

    if (options.vertical) {
      if (cellRect.top < b.visibleTop) {
        wrapper.scrollTop -= (b.visibleTop - cellRect.top);
      } else if (cellRect.bottom > b.visibleBottom) {
        wrapper.scrollTop += (cellRect.bottom - b.visibleBottom);
      }
    }
  }

  function findQ1InRow(tr) {
    if (!tr) return null;
    return (
      tr.querySelector("input.round1-input") ||
      tr.querySelector('input[id^="num"][class*="round1"]') ||
      tr.querySelector('input[id^="num"]') ||
      tr.querySelector('input[type="number"]')
    );
  }

  // UPDATED:
  // - Sticky controls (team name / like) will NOT change horizontal scroll.
  // - Non-sticky cells still auto-scroll into view (sticky-aware).
  function focusEl(el) {
    if (!el) return false;

    try {
      el.focus({ preventScroll: true });

      const sticky = isStickyControl(el);

      // Sticky controls: never change horizontal scroll
      ensureCellInView(el, { horizontal: !sticky, vertical: true });

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

    return focusEl(inputs[idx + dir]);
  }

  function moveNextGridInput(currentEl, dir) {
    const all = getGridInputs();
    const idx = all.indexOf(currentEl);
    if (idx === -1) return false;
    return focusEl(all[idx + dir]);
  }

  function moveToRow(currentEl, rowDir) {
    const tr = findRow(currentEl);
    if (!tr) return false;

    const currentRowInputs = getCellInputsInRow(tr);
    const colIndex = currentRowInputs.indexOf(currentEl);

    let targetRow = tr;
    for (let i = 0; i < 1000; i++) {
      targetRow = rowDir > 0 ? targetRow.nextElementSibling : targetRow.previousElementSibling;
      if (!targetRow) return false;
      if (targetRow.tagName?.toLowerCase() !== "tr") continue;

      const targetInputs = getCellInputsInRow(targetRow);
      if (targetInputs.length === 0) continue;

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

  // ---- caret helpers (cursor until edge, then hop cell) ----
  function canUseCaret(el) {
    return (
      el &&
      typeof el.selectionStart === "number" &&
      typeof el.selectionEnd === "number" &&
      typeof el.setSelectionRange === "function"
    );
  }

  function getLen(el) {
    return String(el?.value ?? "").length;
  }

  function moveCaret(el, pos) {
    try {
      el.setSelectionRange(pos, pos);
      return true;
    } catch {
      return false;
    }
  }

  // UPDATED:
  // - Always detect "bonus -> right arrow -> next row teamName" even when bonus is a number input (no selectionStart).
  // - In ONLY that case, bring Q1 into view after focus moves.
  function handleArrowLeftRight(el, dir) {
    if (!el) return false;

    const isRight = dir > 0;
    const isBonus = !!el.classList?.contains("bonus-input");
    const fromRow = findRow(el);

    function maybeBringQ1IntoView() {
      if (!isRight || !isBonus || !fromRow) return;

      const active = document.activeElement;
      const toRow = findRow(active);

      if (
        toRow &&
        toRow === fromRow.nextElementSibling &&
        active &&
        active.classList &&
        active.classList.contains("teamName")
      ) {
        const q1 = findQ1InRow(toRow);
        if (q1) ensureCellInView(q1, { horizontal: true, vertical: false });
      }
    }

    if (canUseCaret(el)) {
      const len = getLen(el);
      let ss = el.selectionStart;
      let se = el.selectionEnd;

      if (ss == null || se == null) return false;

      if (ss !== se) {
        const newPos = dir < 0 ? Math.min(ss, se) : Math.max(ss, se);
        moveCaret(el, newPos);
        return true;
      }

      const caret = ss;

      if (dir < 0) {
        if (caret > 0) {
          moveCaret(el, caret - 1);
          return true;
        }
        finalizeCellOnLeave(el);
        moveWithinRow(el, -1) || moveNextGridInput(el, -1);
        return true;
      } else {
        if (caret < len) {
          moveCaret(el, caret + 1);
          return true;
        }
        finalizeCellOnLeave(el);
        moveWithinRow(el, +1) || moveNextGridInput(el, +1);
        maybeBringQ1IntoView();
        return true;
      }
    }

    // fallback for inputs without caret APIs (number inputs, etc.)
    finalizeCellOnLeave(el);

    if (dir < 0) {
      moveWithinRow(el, -1) || moveNextGridInput(el, -1);
      return true;
    } else {
      moveWithinRow(el, +1) || moveNextGridInput(el, +1);
      maybeBringQ1IntoView();
      return true;
    }
  }

  function handleKeydown(e) {
    const el = e.target;
    if (!el) return;

    const table = $(SELECTORS.table);
    if (!table || !table.contains(el)) return;

    const key = e.key;

    if (key === "ArrowLeft") {
      e.preventDefault();
      handleArrowLeftRight(el, -1);
      return;
    }

    if (key === "ArrowRight") {
      e.preventDefault();
      handleArrowLeftRight(el, +1);
      return;
    }

    if (key === "ArrowUp") {
      e.preventDefault();
      finalizeCellOnLeave(el);
      moveToRow(el, -1);
      return;
    }

    if (key === "ArrowDown") {
      e.preventDefault();
      finalizeCellOnLeave(el);
      moveToRow(el, +1);
      return;
    }

    if (key === "Enter") {
      e.preventDefault();
      finalizeCellOnLeave(el);
      if (!moveWithinRow(el, +1)) moveNextGridInput(el, +1);
      return;
    }

    if (key === "Home") {
      e.preventDefault();
      finalizeCellOnLeave(el);
      moveToEdge(el, "start");
      return;
    }

    if (key === "End") {
      e.preventDefault();
      finalizeCellOnLeave(el);
      moveToEdge(el, "end");
      return;
    }

    if (e.ctrlKey && key === "ArrowLeft") {
      e.preventDefault();
      finalizeCellOnLeave(el);
      moveToEdge(el, "start");
      return;
    }

    if (e.ctrlKey && key === "ArrowRight") {
      e.preventDefault();
      finalizeCellOnLeave(el);
      moveToEdge(el, "end");
      return;
    }
  }

  function handleInput(e) {
    const el = e.target;
    if (!el) return;

    const table = $(SELECTORS.table);
    if (!table || !table.contains(el)) return;

    markDirty();
    clampNonNegativeNumberInput(el);
  }

  function handleBlur(e) {
    const el = e.target;
    if (!el) return;

    const table = $(SELECTORS.table);
    if (!table || !table.contains(el)) return;

    fillEmptyWithZero(el);
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

    setupBeforeUnloadWarning();

    document.addEventListener("keydown", handleKeydown, true);
    document.addEventListener("input", handleInput, true);
    document.addEventListener("change", handleInput, true);
    document.addEventListener("blur", handleBlur, true);

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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();