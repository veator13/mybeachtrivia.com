/* team-number-modal.js */
(function () {
    "use strict";
  
    if (window.__scoresheetTeamNumberModalInitialized) return;
    window.__scoresheetTeamNumberModalInitialized = true;
  
    const MODAL_ID = "teamNumberModal";
    const INPUT_ID = "teamNumberInput";
    const SAVE_BTN_ID = "btnSaveTeamNumber";
    const CLEAR_BTN_ID = "btnClearTeamNumber";
    const CLOSE_BTN_ID = "btnCloseTeamNumber";
  
    // IMPORTANT: support either class name on the button
    const OPEN_BTN_CLASSES = ["btnTeamNumber", "teamNumBtn"];
  
    function qs(sel, root = document) {
      return root.querySelector(sel);
    }
  
    function qsa(sel, root = document) {
      return Array.from(root.querySelectorAll(sel));
    }
  
    function getEl(id) {
      return document.getElementById(id);
    }
  
    function numOrBlank(v) {
      const s = String(v ?? "").trim();
      if (!s) return "";
      const n = parseInt(s, 10);
      return Number.isFinite(n) ? String(n) : "";
    }
  
    function isBlank(v) {
      return v === null || v === undefined || String(v).trim() === "";
    }
  
    function markModified() {
      try {
        if (window.ScoresheetState?.markAsModified) window.ScoresheetState.markAsModified();
      } catch {}
      try {
        if (typeof window.dataModified === "boolean") window.dataModified = true;
      } catch {}
    }
  
    function getActiveTeamId() {
      const teamId = window.__activeTeamNumberTeamId;
      return teamId ? String(teamId) : "";
    }
  
    function getActiveRow() {
      const teamId = getActiveTeamId();
      if (!teamId) return null;
      try {
        return qs(`#teamTable tbody tr[data-team-id="${CSS.escape(teamId)}"]`);
      } catch {
        return qs(`#teamTable tbody tr[data-team-id="${teamId}"]`);
      }
    }
  
    function getRowTeamName(row) {
      if (!row) return "";
      const inp = row.querySelector("input.teamName") || row.querySelector('input[id^="teamName"]');
      return (inp?.value || "").trim();
    }
  
    function getRowTeamLabel(row) {
      if (!row) return "Team";
      const teamId = String(row.dataset.teamId || "").trim();
      const name = getRowTeamName(row);
      return name || (teamId ? `Team ${teamId}` : "Team");
    }
  
    function getModalTitleEl() {
      const modal = getEl(MODAL_ID);
      if (!modal) return null;
  
      // primary (what we want in HTML)
      let el = modal.querySelector("#teamNumberTitle");
      if (el) return el;
  
      // fallbacks so you don’t get stuck on a mismatched id
      el = modal.querySelector('[data-role="teamNumberTitle"]');
      if (el) return el;
  
      el = modal.querySelector("h2, h1");
      return el || null;
    }
  
    function setModalTitleForRow(row) {
      const titleEl = getModalTitleEl();
      const subtitleEl = document.getElementById("teamNumberSubtitle");
      if (titleEl) titleEl.textContent = "TEAM #";
      if (subtitleEl) {
        const label = getRowTeamLabel(row);
        // Only show subtitle if we have a real team name (not just "Team 1" fallback with no name entered)
        const name = getRowTeamName(row);
        subtitleEl.textContent = name || label;
        subtitleEl.style.display = (name || row) ? "" : "none";
      }
    }
  
    function setTeamNumberOnRow(row, teamNumber) {
      if (!row) return;
  
      if (isBlank(teamNumber)) delete row.dataset.teamNumber;
      else row.dataset.teamNumber = String(teamNumber);
    }
  
    function readTeamNumberFromRow(row) {
      if (!row) return "";
      return numOrBlank(row.dataset.teamNumber);
    }
  
    function closeModal() {
      const modal = getEl(MODAL_ID);
      if (!modal) return;
  
      const returnFocusEl = window.__teamNumberReturnFocusEl;
      if (returnFocusEl && typeof returnFocusEl.focus === "function") {
        try {
          returnFocusEl.focus();
        } catch {}
      }
  
      modal.hidden = true;
      modal.removeAttribute("aria-hidden");
      modal.classList.remove("open");
      modal.style.display = "";
      document.body.classList.remove("modal-open");
  
      window.__activeTeamNumberTeamId = null;
      window.__teamNumberReturnFocusEl = null;
    }
  
    function openModalForRow(row, openerEl) {
      const modal = getEl(MODAL_ID);
      const input = getEl(INPUT_ID);
      if (!modal || !input || !row) return;
  
      window.__activeTeamNumberTeamId = String(row.dataset.teamId || "");
      window.__teamNumberReturnFocusEl = openerEl || null;
  
      input.value = readTeamNumberFromRow(row);
  
      // ✅ this is the key: set title from the row’s current teamName value
      setModalTitleForRow(row);
  
      modal.hidden = false;
      modal.removeAttribute("aria-hidden");
      modal.classList.add("open");
      modal.style.display = "block";
      document.body.classList.add("modal-open");
  
      try {
        input.focus();
        input.select?.();
      } catch {}
    }
  
    function onOpenClick(e) {
      const btn = e.target?.closest?.(OPEN_BTN_CLASSES.map((c) => `.${c}`).join(","));
      if (!btn) return;
  
      const row = btn.closest("tr[data-team-id]");
      if (!row) return;
  
      e.preventDefault();
      e.stopPropagation();
  
      openModalForRow(row, btn);
    }
  
    function onSave() {
      const row = getActiveRow();
      const input = getEl(INPUT_ID);
      if (!row || !input) return;
  
      const val = numOrBlank(input.value);
      setTeamNumberOnRow(row, val);
  
      markModified();
      closeModal();
    }
  
    function onClear() {
      const row = getActiveRow();
      const input = getEl(INPUT_ID);
      if (!row || !input) return;
  
      input.value = "";
      setTeamNumberOnRow(row, "");
  
      markModified();
      closeModal();
    }
  
    function onKeydown(e) {
      const modal = getEl(MODAL_ID);
      if (!modal || modal.hidden) return;
  
      if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
        return;
      }
  
      if (e.key === "Enter") {
        const active = document.activeElement;
        const input = getEl(INPUT_ID);
        const saveBtn = getEl(SAVE_BTN_ID);
        if (active === input || active === saveBtn) {
          e.preventDefault();
          onSave();
        }
      }
    }
  
    function onTeamNameInput(e) {
      const modal = getEl(MODAL_ID);
      if (!modal || modal.hidden) return;
  
      const t = e.target;
      if (!t || !(t instanceof HTMLElement)) return;
      if (!t.matches("input.teamName, input[id^='teamName']")) return;
  
      const row = t.closest("tr[data-team-id]");
      if (!row) return;
  
      const activeId = getActiveTeamId();
      if (!activeId) return;
  
      if (String(row.dataset.teamId || "") !== activeId) return;
  
      // live-update title while typing
      setModalTitleForRow(row);
    }
  
    function bindOnce() {
      document.addEventListener("click", onOpenClick, true);
  
      const saveBtn = getEl(SAVE_BTN_ID);
      const clearBtn = getEl(CLEAR_BTN_ID);
      const closeBtn = getEl(CLOSE_BTN_ID);
  
      if (saveBtn) saveBtn.addEventListener("click", onSave);
      if (clearBtn) clearBtn.addEventListener("click", onClear);
      if (closeBtn) closeBtn.addEventListener("click", closeModal);

      const cancelBtn = document.getElementById("btnCancelTeamNumber");
      if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
  
      const modal = getEl(MODAL_ID);
      if (modal) {
        modal.addEventListener("mousedown", (e) => {
          if (e.target === modal) closeModal();
        });
      }
  
      document.addEventListener("keydown", onKeydown, true);
      document.addEventListener("input", onTeamNameInput, true);
  
      window.addEventListener(
        "scoresheet:teams-renumbered",
        () => {
          const active = getActiveRow();
          if (active) setModalTitleForRow(active);
        },
        { passive: true }
      );
    }
  
    function init() {
      bindOnce();
    }
  
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
      init();
    }
  
    window.ScoresheetTeamNumber = {
      getTeamNumberForRow(row) {
        return numOrBlank(row?.dataset?.teamNumber);
      },
    };
  })();