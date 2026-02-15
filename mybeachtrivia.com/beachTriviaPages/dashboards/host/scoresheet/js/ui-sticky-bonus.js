/* ui-sticky-bonus.js
   UI helpers:
   - Keep sticky right columns aligned (bonus + final score)
   - Bonus input convenience: select-on-focus, clamp negatives on blur

   Exposes globals:
     - updateStickyRightWidths()
     - bindBonusInput()
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
  
    function isHidden(el) {
      if (!el) return true;
      const cs = getComputedStyle(el);
      return cs.display === "none" || cs.visibility === "hidden";
    }
  
    function clampNonNegative(inputEl) {
      if (!inputEl) return;
      const type = (inputEl.getAttribute("type") || "").toLowerCase();
      if (type !== "number") return;
      if (inputEl.value === "") return;
      const n = Number(inputEl.value);
      if (!Number.isFinite(n)) return;
      if (n < 0) {
        inputEl.value = "0";
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        inputEl.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  
    function getHeaderCells() {
      const table = $("#teamTable");
      if (!table) return {};
      const headRow = table.querySelector("thead tr.top_row");
      if (!headRow) return {};
  
      return {
        bonusTh: headRow.querySelector(".bonus-col-right"),
        finalTh: headRow.querySelector(".sticky-col-right"),
      };
    }
  
    function measureCellWidth(el) {
      if (!el || isHidden(el)) return 0;
      const rect = el.getBoundingClientRect();
      return Math.ceil(rect.width);
    }
  
    function updateStickyRightWidths() {
      const table = $("#teamTable");
      if (!table) return;
  
      // We want bonus + final score columns to stay aligned between header and body,
      // especially with horizontal scrolling.
      const { bonusTh, finalTh } = getHeaderCells();
  
      // Body cells:
      const bonusTds = $all("#teamTable tbody td.bonus-col-right");
      const finalTds = $all("#teamTable tbody td.sticky-col-right");
  
      // Measure widest among header + first few rows (avoid O(n) cost on huge tables)
      let bonusW = measureCellWidth(bonusTh);
      let finalW = measureCellWidth(finalTh);
  
      for (const td of bonusTds.slice(0, 8)) bonusW = Math.max(bonusW, measureCellWidth(td));
      for (const td of finalTds.slice(0, 8)) finalW = Math.max(finalW, measureCellWidth(td));
  
      // Apply widths as inline style so CSS stays simple
      if (bonusTh) bonusTh.style.width = `${bonusW}px`;
      if (finalTh) finalTh.style.width = `${finalW}px`;
  
      bonusTds.forEach((td) => (td.style.width = `${bonusW}px`));
      finalTds.forEach((td) => (td.style.width = `${finalW}px`));
    }
  
    function bindBonusInput() {
      const tbody = $("#teamTable tbody");
      if (!tbody) return;
  
      // Event delegation so it works for dynamically added rows
      tbody.addEventListener(
        "focusin",
        (e) => {
          const t = e.target;
          if (!(t instanceof HTMLElement)) return;
          if (t.tagName.toLowerCase() !== "input") return;
          if ((t.getAttribute("type") || "").toLowerCase() !== "number") return;
  
          const td = t.closest("td");
          if (!td) return;
  
          // Heuristic: bonus is in the td with class bonus-col-right OR id contains "bonus"
          const isBonus =
            td.classList.contains("bonus-col-right") ||
            (t.id || "").toLowerCase().includes("bonus") ||
            (t.name || "").toLowerCase().includes("bonus");
  
          if (!isBonus) return;
  
          // Select contents for quick overwrite
          try {
            t.select?.();
          } catch {}
        },
        true
      );
  
      tbody.addEventListener(
        "focusout",
        (e) => {
          const t = e.target;
          if (!(t instanceof HTMLElement)) return;
          if (t.tagName.toLowerCase() !== "input") return;
  
          const td = t.closest("td");
          if (!td) return;
  
          const isBonus =
            td.classList.contains("bonus-col-right") ||
            (t.id || "").toLowerCase().includes("bonus") ||
            (t.name || "").toLowerCase().includes("bonus");
  
          if (!isBonus) return;
  
          clampNonNegative(t);
  
          // Ensure totals stay updated if scoring exists
          const row = t.closest("tr");
          if (row) {
            if (typeof window.updateFinalScore === "function") {
              try { window.updateFinalScore(row); } catch {}
            } else if (typeof window.updateScores === "function") {
              try { window.updateScores(row); } catch {}
            } else if (typeof window.recalcRowTotals === "function") {
              try { window.recalcRowTotals(row); } catch {}
            }
          }
        },
        true
      );
    }
  
    // Expose globals
    window.updateStickyRightWidths = window.updateStickyRightWidths || updateStickyRightWidths;
    window.bindBonusInput = window.bindBonusInput || bindBonusInput;
  
    function init() {
      bindBonusInput();
      updateStickyRightWidths();
  
      // Keep widths in sync on resize / after fonts load
      window.addEventListener("resize", () => updateStickyRightWidths());
  
      // If rows are added dynamically, recalc widths occasionally
      const tbody = $("#teamTable tbody");
      if (tbody && "MutationObserver" in window) {
        const mo = new MutationObserver(() => updateStickyRightWidths());
        mo.observe(tbody, { childList: true, subtree: true });
      }
    }
  
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
      init();
    }
  })();