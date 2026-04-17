// mybeachtrivia.com/beachTriviaPages/dashboards/host/employee-calendar/boot.js
(function () {
  "use strict";

  window.__CALENDAR_READONLY__ = true;

  const EDIT_WORDS = /(move|copy|clear|delete|remove|add|edit|duplicate|drag|drop|create|save)/i;

  function safeText(el) {
    try {
      return (
        (el.getAttribute && (el.getAttribute("aria-label") || el.getAttribute("title"))) ||
        el.textContent ||
        ""
      );
    } catch {
      return "";
    }
  }

  function removeIf(root, selector) {
    try {
      root.querySelectorAll(selector).forEach((el) => el.remove());
    } catch (_) {}
  }

  function nukeAdminControls(root) {
    const selectors = [
      ".copy-button",
      ".delete-button",
      ".add-button",
      ".clear-day-button",
      ".edit-button",
      ".duplicate-button",
      ".cell-copy-button",
      ".cell-move-button",
      ".drag-day-button",

      // week tools
      ".week-clear-cell",
      ".week-move-cell",
      ".week-copy-btn",
      ".week-move-btn",
      ".week-clear-btn",
      ".week-copy-button",
      ".week-move-button",
      ".week-clear-button",
      ".week-actions .copy",
      ".week-actions .move",
      ".week-actions .clear",
      ".week-ops",
      ".week-operations",
      ".week-toolbar",
      ".week-actions",
      ".week-drag-handle",
      ".week-move-handle",
      ".drag-handle",
      ".move-handle",

      // month nav dropzones
      ".month-nav-dropzone",
      "#prev-month-dropzone",
      "#next-month-dropzone",

      // copy prev month
      "#copyPrevMonthBtn",
      "#copyPreviousMonthBtn",
      "#copyPrevMonthButton",
      "#copyPreviousMonth",
      "#copy-prev-month",
      "#copy-prev-month-btn",
      ".copy-month-group",
      ".copy-month-btn",
    ];

    selectors.forEach((sel) => removeIf(root, sel));

    try {
      root.querySelectorAll("button, a, [role='button']").forEach((el) => {
        const txt = safeText(el);
        const isExpandCollapse = /(expand|collapse)/i.test(txt);
        if (!isExpandCollapse && EDIT_WORDS.test(txt)) el.remove();
      });
    } catch (_) {}

    try {
      root.querySelectorAll("[draggable]").forEach((el) => {
        el.setAttribute("draggable", "false");
        el.removeAttribute("ondragstart");
        el.removeAttribute("ondrop");
        el.removeAttribute("ondragover");
      });
      root.querySelectorAll(".shift").forEach((el) => el.setAttribute("draggable", "false"));
    } catch (_) {}
  }

  // ====== Collapse helpers (your working behavior) ======
  function setTriangle(btn, cls) {
    try {
      const d = btn?.querySelector?.("div");
      if (d) d.className = cls;
    } catch (_) {}
  }

  function hostToggleShiftCollapse(toggleBtn, forceCollapsed) {
    const shiftDiv = toggleBtn?.closest?.(".shift");
    if (!shiftDiv) return;

    const triDiv = toggleBtn.querySelector?.("div");
    const currentlyCollapsed = shiftDiv.classList.contains("collapsed");
    const nextCollapsed = typeof forceCollapsed === "boolean" ? forceCollapsed : !currentlyCollapsed;

    try {
      shiftDiv.classList.toggle("collapsed", nextCollapsed);
      shiftDiv.setAttribute("data-collapsed", nextCollapsed ? "1" : "0");
      shiftDiv.setAttribute("aria-expanded", nextCollapsed ? "false" : "true");
    } catch (_) {}

    try {
      if (triDiv) triDiv.className = nextCollapsed ? "triangle-right" : "triangle-down";
    } catch (_) {}

    try {
      toggleBtn.setAttribute("aria-pressed", nextCollapsed ? "true" : "false");
      toggleBtn.setAttribute("aria-label", nextCollapsed ? "Expand shift" : "Collapse shift");
      toggleBtn.setAttribute("title", nextCollapsed ? "Expand shift" : "Collapse shift");
    } catch (_) {}
  }

  function hostToggleWeekCollapse(weekToggleBtn, forceCollapsed) {
    if (!weekToggleBtn) return;

    const weekIndex = weekToggleBtn.getAttribute?.("data-week-index");
    if (weekIndex == null) return;

    const row = document.querySelector(`tr[data-week-index="${weekIndex}"]`);
    if (!row) return;

    const triDiv = weekToggleBtn.querySelector?.("div");
    const isCurrentlyCollapsed = triDiv?.className === "triangle-right";
    const nextCollapsed = typeof forceCollapsed === "boolean" ? forceCollapsed : !isCurrentlyCollapsed;

    const shifts = Array.from(row.querySelectorAll(".shift"));
    if (!shifts.length) return;

    shifts.forEach((shiftDiv) => {
      const btn = shiftDiv.querySelector?.(".toggle-button");
      if (btn) hostToggleShiftCollapse(btn, nextCollapsed);
      else {
        try {
          shiftDiv.classList.toggle("collapsed", nextCollapsed);
          shiftDiv.setAttribute("data-collapsed", nextCollapsed ? "1" : "0");
          shiftDiv.setAttribute("aria-expanded", nextCollapsed ? "false" : "true");
        } catch (_) {}
      }
    });

    document
      .querySelectorAll(`.week-toggle-button[data-week-index="${weekIndex}"]`)
      .forEach((b) => setTriangle(b, nextCollapsed ? "triangle-right" : "triangle-down"));

    try {
      document
        .querySelectorAll(`.week-toggle-button[data-week-index="${weekIndex}"]`)
        .forEach((b) => b.setAttribute("data-week-collapsed", nextCollapsed ? "1" : "0"));
      row.querySelectorAll?.(".week-copy-cell")?.forEach?.((c) =>
        c.setAttribute("data-week-collapsed", nextCollapsed ? "1" : "0")
      );
    } catch (_) {}
  }

  function collapseAllShifts() {
    try {
      document.querySelectorAll(".shift .toggle-button").forEach((btn) => hostToggleShiftCollapse(btn, true));
      document.querySelectorAll(".week-toggle-button").forEach((b) => setTriangle(b, "triangle-right"));
    } catch (_) {}
  }

  function expandAllShifts() {
    try {
      document.querySelectorAll(".shift .toggle-button").forEach((btn) => hostToggleShiftCollapse(btn, false));
      document.querySelectorAll(".week-toggle-button").forEach((b) => setTriangle(b, "triangle-down"));
    } catch (_) {}
  }

  window.collapseAllShifts = collapseAllShifts;
  window.expandAllShifts = expandAllShifts;

  // ====== Eye button: hide/show entire week row ======
  function hostToggleWeekVisibility(weekIndex) {
    if (weekIndex == null || isNaN(weekIndex)) return;

    const weekRow = document.querySelector(`tr[data-week-index="${weekIndex}"]`);
    if (!weekRow) return;

    const isNowHidden = weekRow.classList.toggle("week-hidden");

    // Persist so renderCalendar() can restore after a re-render
    const st = window.state;
    if (st) {
      if (!st.hiddenWeeks) st.hiddenWeeks = new Set();
      if (isNowHidden) st.hiddenWeeks.add(weekIndex);
      else st.hiddenWeeks.delete(weekIndex);
    }

    const openEyeSVG =
      '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    const closedEyeSVG =
      '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

    document
      .querySelectorAll(`.week-eye-button[data-week-index="${weekIndex}"]`)
      .forEach((btn) => {
        btn.classList.remove("toggling");
        void btn.offsetWidth; // force reflow to restart animation
        btn.classList.add("toggling");
        setTimeout(() => {
          btn.innerHTML = isNowHidden ? closedEyeSVG : openEyeSVG;
          btn.setAttribute(
            "aria-label",
            isNowHidden ? `Show week ${weekIndex + 1}` : `Hide week ${weekIndex + 1}`
          );
        }, 140);
        setTimeout(() => btn.classList.remove("toggling"), 350);
      });

    try {
      if (typeof announceForScreenReader === "function") {
        announceForScreenReader(
          isNowHidden ? `Week ${weekIndex + 1} hidden` : `Week ${weekIndex + 1} shown`
        );
      }
    } catch (_) {}
  }

  window.toggleWeekVisibility = hostToggleWeekVisibility;

  // ====== Host modal patch (read-only, show details) ======
  function applyHostModalReadOnly() {
    const els = window.elements || {};
    const modal = els.shiftModal || document.getElementById("shift-modal");
    if (!modal) return;

    try {
      const title = els.modalTitle || document.getElementById("modal-title");
      if (title) title.textContent = "Event Details";
    } catch (_) {}

    // hide save + plus buttons (in case css misses)
    try {
      (els.submitButton || document.getElementById("save-shift-btn"))?.setAttribute("aria-hidden", "true");
      (els.submitButton || document.getElementById("save-shift-btn"))?.style && ((els.submitButton || document.getElementById("save-shift-btn")).style.display = "none");
      (els.addNewHostBtn || document.getElementById("add-new-host-btn"))?.style && ((els.addNewHostBtn || document.getElementById("add-new-host-btn")).style.display = "none");
      (els.addNewLocationBtn || document.getElementById("add-new-location-btn"))?.style && ((els.addNewLocationBtn || document.getElementById("add-new-location-btn")).style.display = "none");
    } catch (_) {}

    // disable all inputs/selects/textarea inside modal (view-only)
    try {
      modal.querySelectorAll("input, select, textarea, button").forEach((el) => {
        if (el.id === "cancel-shift") return; // keep Close clickable
        if (el.id === "host-request-coverage-btn") return; // keep Request Coverage clickable
        if (el.type === "button" && el.id === "cancel-shift") return;
        if (el.tagName === "BUTTON") {
          // allow the Close and Request Coverage buttons only
          el.disabled = el.id !== "cancel-shift" && el.id !== "host-request-coverage-btn";
          return;
        }
        el.disabled = true;
      });
    } catch (_) {}
  }

  // Wrap editShift so every open becomes read-only & correctly labeled
  function patchEditShift() {
    const orig = window.editShift;
    if (typeof orig !== "function") return;

    if (window.__HOST_EDITSHIFT_PATCHED__) return;
    window.__HOST_EDITSHIFT_PATCHED__ = true;

    window.editShift = function patchedEditShift(shift) {
      try {
        window.__HOST_SHIFT_MODAL_PREV_FOCUS__ = document.activeElement;
      } catch (_) {}

      const ret = orig.apply(this, arguments);

      // after event-crud populates fields, lock it down & set title
      try { applyHostModalReadOnly(); } catch (_) {}

      return ret;
    };
  }

  // ====== Interaction blocking / allow collapse + modal open ======
  function blockEditInteractions() {
    const stop = (e) => {
      try {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      } catch (_) {}
    };

    ["dragstart", "dragover", "drop", "dragend"].forEach((evt) => {
      document.addEventListener(evt, stop, true);
    });

    document.addEventListener(
      "click",
      (e) => {
        const t = e.target;

        // week eye button (show/hide week row)
        const eyeBtn = t?.closest?.(".week-eye-button");
        if (eyeBtn) {
          hostToggleWeekVisibility(parseInt(eyeBtn.getAttribute("data-week-index")));
          stop(e);
          return;
        }

        // shift triangle
        const shiftToggle = t?.closest?.(".toggle-button");
        if (shiftToggle) {
          hostToggleShiftCollapse(shiftToggle);
          stop(e);
          return;
        }

        // week triangle
        const weekToggle = t?.closest?.(".week-toggle-button");
        if (weekToggle) {
          hostToggleWeekCollapse(weekToggle);
          stop(e);
          return;
        }

        // allow shift click to open the real modal via existing handler (calendar-ui / event-crud wiring)
        // (We DO NOT stop it here.)
      },
      true
    );

    // keyboard: Enter/Space on eye button
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const eyeBtn = document.activeElement?.closest?.(".week-eye-button");
        if (eyeBtn) {
          e.preventDefault();
          hostToggleWeekVisibility(parseInt(eyeBtn.getAttribute("data-week-index")));
        }
      },
      true
    );
  }

  // Move each .toggle-button into its sibling .shift-header so it sits
  // on the same row as the host name instead of floating absolutely.
  function hoistToggleButtons() {
    try {
      document.querySelectorAll(".shift .toggle-button").forEach((btn) => {
        const shift = btn.closest(".shift");
        if (!shift) return;
        const header = shift.querySelector(".shift-header");
        // Already inside the header — nothing to do.
        if (!header || header.contains(btn)) return;
        header.appendChild(btn);
      });
    } catch (_) {}
  }

  // Initial pass
  nukeAdminControls(document);
  blockEditInteractions();
  hoistToggleButtons();

  // Patch editShift after scripts load
  patchEditShift();

  // Keep nuking anything that appears after renderCalendar()
  const mo = new MutationObserver(() => {
    nukeAdminControls(document);
    patchEditShift();
    hoistToggleButtons();
  });
  mo.observe(document.body, { childList: true, subtree: true });
})();