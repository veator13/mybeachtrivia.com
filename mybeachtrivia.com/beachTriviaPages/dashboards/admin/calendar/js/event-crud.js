// event-crud.js
// Functions for CRUD operations on shifts and events
//
// Updated 2026-02-27:
// - Keep modal-handlers override flow compatible
// - Route UI modal open/close through modal-handlers when present
// - Ensure conflict override updates (not adds) when editing
// - Keep wrappers for clear-day modal in case legacy callers still use event-crud.js
// - Harden a few spots around missing globals / service fallbacks
//
// Updated 2026-03-05:
// - ✅ When opening NEW shift modal, reset Host + Venue to placeholder ("select")
// - ✅ Default Start Time to 7:00 PM on NEW shift modal opens (does NOT affect Edit)
// - ✅ Default End Time to 9:00 PM on NEW shift modal opens (does NOT affect Edit)
// - ✅ Also resets on every modal open-for-new to avoid “sticky” prior selections
//
// Updated 2026-03-16:
// - ✅ Undo toasts now support manual early dismiss with an X button
// - ✅ Dismiss closes the toast immediately without undoing
// - ✅ Dismiss commits the accepted action immediately and clears the timer safely
// - ✅ Toast helper guards against double commit / double undo / duplicate cleanup

/* =========================
 *  SAFE GLOBALS
 * ========================= */
function _getEls() {
  try {
    return window.elements || (typeof elements !== "undefined" ? elements : {});
  } catch (_) {
    return {};
  }
}

function _ensureShiftsArray() {
  if (!Array.isArray(window.shifts)) window.shifts = [];
  try {
    if (!Array.isArray(shifts)) shifts = window.shifts;
  } catch (_) {}
}

function _upsertShiftLocal(nextShift) {
  _ensureShiftsArray();
  if (!nextShift || nextShift.id == null) return;

  const id = String(nextShift.id);
  const idx = shifts.findIndex((s) => String(s?.id) === id);

  if (idx === -1) {
    shifts = [...shifts, { ...nextShift }];
    return;
  }

  const merged = { ...shifts[idx], ...nextShift, id: shifts[idx].id };
  const copy = shifts.slice();
  copy[idx] = merged;
  shifts = copy;
}

function _removeIdsLocal(ids) {
  _ensureShiftsArray();
  const set = new Set((ids || []).map((x) => String(x)));
  shifts = shifts.filter((s) => !set.has(String(s?.id)));
}

/* =========================
 *  NEW SHIFT DEFAULTS (ADMIN MODAL)
 * ========================= */
function _pickSelectValue(selectEl) {
  if (!selectEl) return "";
  const opts = Array.from(selectEl.options || []);
  const placeholder = opts.find((o) => {
    const v = String(o.value || "").toLowerCase();
    const t = String(o.text || "").toLowerCase();
    return v === "" || v === "select" || v === "none" || t.includes("select");
  });
  return placeholder ? placeholder.value : "";
}

function _setSelectToPlaceholder(selectEl) {
  if (!selectEl) return;
  const v = _pickSelectValue(selectEl);
  selectEl.value = v;
  try {
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  } catch (_) {}
}

function _pick7pmValue(selectEl) {
  if (!selectEl) return null;
  const opts = Array.from(selectEl.options || []);
  const candidates = ["19:00", "19:00:00", "7:00 PM", "7:00PM", "7:00 pm", "7:00pm", "07:00 PM", "07:00PM"];
  for (const c of candidates) {
    const hit = opts.find((o) => String(o.value) === c || String(o.text).trim() === c);
    if (hit) return hit.value;
  }
  const loose = opts.find((o) => {
    const txt = String(o.text || "").toLowerCase();
    const val = String(o.value || "").toLowerCase();
    return (txt.includes("7:00") && txt.includes("pm")) || (val.includes("7:00") && val.includes("pm"));
  });
  return loose ? loose.value : null;
}

function _setStartTimeTo7pm(selectEl) {
  if (!selectEl) return;
  const v = _pick7pmValue(selectEl);
  if (v == null) return;
  if (typeof selectDropdownOptionByValue === "function") {
    selectDropdownOptionByValue(selectEl, v);
  } else {
    selectEl.value = v;
  }
  try {
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  } catch (_) {}
}

function _pick9pmValue(selectEl) {
  if (!selectEl) return null;
  const opts = Array.from(selectEl.options || []);
  const candidates = ["21:00", "21:00:00", "9:00 PM", "9:00PM", "9:00 pm", "9:00pm", "09:00 PM", "09:00PM"];
  for (const c of candidates) {
    const hit = opts.find((o) => String(o.value) === c || String(o.text).trim() === c);
    if (hit) return hit.value;
  }
  const loose = opts.find((o) => {
    const txt = String(o.text || "").toLowerCase();
    const val = String(o.value || "").toLowerCase();
    return (txt.includes("9:00") && txt.includes("pm")) || (val.includes("9:00") && val.includes("pm"));
  });
  return loose ? loose.value : null;
}

function _setEndTimeTo9pm(selectEl) {
  if (!selectEl) return;
  const v = _pick9pmValue(selectEl);
  if (v == null) return;
  if (typeof selectDropdownOptionByValue === "function") {
    selectDropdownOptionByValue(selectEl, v);
  } else {
    selectEl.value = v;
  }
  try {
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  } catch (_) {}
}

function _applyNewShiftDefaults() {
  const els = _getEls();

  // Host + Venue reset to placeholder on every NEW modal open
  _setSelectToPlaceholder(els.shiftEmployeeSelect || document.getElementById("shift-employee"));
  _setSelectToPlaceholder(els.shiftLocationSelect || document.getElementById("shift-location"));

  // Start time defaults to 7pm on every NEW modal open
  _setStartTimeTo7pm(els.startTimeSelect || document.getElementById("start-time"));

  // End time defaults to 9pm on every NEW modal open
  _setEndTimeTo9pm(els.endTimeSelect || document.getElementById("end-time"));

  // If theme field toggles based on type, keep it consistent
  try {
    if (typeof toggleThemeField === "function") toggleThemeField();
  } catch (_) {}
}

// Patch common open functions if they exist, so defaults happen whenever you open a NEW shift modal.
(function _installNewShiftDefaultsHooks() {
  function wrap(fn) {
    if (typeof fn !== "function") return null;
    if (fn.__wrappedForNewShiftDefaults__) return fn;
    const wrapped = function (...args) {
      const out = fn.apply(this, args);
      // Only apply defaults for NEW shift (not edit)
      try {
        const ctx = _getEditingContext();
        if (!ctx.isEditing) _applyNewShiftDefaults();
      } catch (_) {
        _applyNewShiftDefaults();
      }
      return out;
    };
    wrapped.__wrappedForNewShiftDefaults__ = true;
    return wrapped;
  }

  // 1) If modal-handlers owns openShiftModal, hook it
  try {
    if (typeof window.openShiftModal === "function") window.openShiftModal = wrap(window.openShiftModal);
  } catch (_) {}

  // 2) If legacy open lives here, hook it too (if present)
  try {
    if (typeof openShiftModal === "function") openShiftModal = wrap(openShiftModal);
  } catch (_) {}

  // 3) Also apply defaults when modal actually becomes visible (fallback)
  document.addEventListener("click", (e) => {
    try {
      const t = e.target;
      const isNewTrigger =
        t?.id === "add-shift-btn" ||
        t?.id === "add-event-btn" ||
        t?.id === "new-shift-btn" ||
        t?.closest?.("[data-action='add-shift']") ||
        t?.closest?.("[data-action='new-shift']");
      if (!isNewTrigger) return;

      // Let other handlers open the modal, then apply defaults.
      setTimeout(() => {
        try {
          const ctx = _getEditingContext();
          if (!ctx.isEditing) _applyNewShiftDefaults();
        } catch (_) {
          _applyNewShiftDefaults();
        }
      }, 0);
    } catch (_) {}
  });
})();

/* =========================
 *  CLEAR ALL (ONE DAY)
 * ========================= */
function executeAllShiftsClear() {
  const dateStr = document.getElementById("confirm-clear-day")?.getAttribute("data-date");
  if (!dateStr) {
    console.error("No date provided for clearing events");
    return;
  }

  const shiftsToDelete = getShiftsForDate(dateStr);
  if (!Array.isArray(shiftsToDelete) || shiftsToDelete.length === 0) {
    console.warn("No shifts found to delete");
    if (typeof window.closeClearDayModal === "function") window.closeClearDayModal();
    return;
  }

  // Snapshot all shifts for undo
  const snapshots = shiftsToDelete.map((s) => ({ ...s }));
  const deletedIds = shiftsToDelete.map((s) => s.id);
  const employeeIds = [...new Set(shiftsToDelete.map((s) => s.employeeId).filter(Boolean))];
  const locationNames = [...new Set(shiftsToDelete.map((s) => s.location).filter(Boolean))];
  const label = `${shiftsToDelete.length} event${shiftsToDelete.length !== 1 ? "s" : ""} on ${dateStr}`;

  // Close modal + optimistic removal
  if (typeof window.closeClearDayModal === "function") window.closeClearDayModal();
  _removeIdsLocal(deletedIds);
  if (typeof renderCalendar === "function") renderCalendar();
  if (typeof announceForScreenReader === "function") announceForScreenReader(`Deleted ${label}`);

  _showUndoToast(
    label,
    // onUndo: restore all shifts locally
    () => {
      snapshots.forEach((s) => _upsertShiftLocal(s));
      if (typeof renderCalendar === "function") renderCalendar();
      if (typeof announceForScreenReader === "function") announceForScreenReader(`Restored ${label}`);
    },
    // onCommit: delete all from Firestore + temp cleanup
    () => {
      const deletePromises = deletedIds.map((id) =>
        deleteShiftFromFirebase(id).catch((err) => {
          console.error(`Error deleting shift ${id}:`, err);
          return false;
        })
      );
      Promise.all(deletePromises).then((results) => {
        const failed = results.filter((r) => r === false).length;
        if (failed > 0) {
          // Restore failed ones — find them by checking which IDs are still in Firestore
          console.warn(`[clear-day] ${failed} deletion(s) failed`);
        }
      });
      // Temp cleanup for all affected employees and venues
      employeeIds.forEach((id) => {
        if (typeof window.cleanupTempEmployee === "function") window.cleanupTempEmployee(id);
      });
      locationNames.forEach((name) => {
        if (typeof window.cleanupTempVenue === "function") window.cleanupTempVenue(name);
      });
    },
    10000
  );
}

// NOTE: clearAllShiftsForDay + closeClearDayModal are owned by modal-handlers.js now.
// Keep wrappers here ONLY if other files still call into event-crud.js directly.
function clearAllShiftsForDay(dateStr) {
  if (typeof window.clearAllShiftsForDay === "function" && window.clearAllShiftsForDay !== clearAllShiftsForDay) {
    return window.clearAllShiftsForDay(dateStr);
  }
  const shiftsForDay = getShiftsForDate(dateStr);
  if (!Array.isArray(shiftsForDay) || shiftsForDay.length === 0) {
    alert("No events to clear for this date.");
    return;
  }
  alert("Clear-day modal handler missing. Please refresh the page.");
}

function closeClearDayModal() {
  if (typeof window.closeClearDayModal === "function" && window.closeClearDayModal !== closeClearDayModal) {
    return window.closeClearDayModal();
  }
  const modal = document.getElementById("clear-day-modal");
  if (modal) {
    try {
      document.activeElement?.blur?.();
    } catch (_) {}
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  }
  const confirmButton = document.getElementById("confirm-clear-day");
  if (confirmButton) {
    confirmButton.removeAttribute("data-date");
    confirmButton.removeAttribute("data-week-index");
  }
}

/* =========================
 *  COLLAPSE / EXPAND
 * ========================= */
function toggleShiftCollapse(toggleButton) {
  const shiftDiv = toggleButton.closest(".shift");
  if (!shiftDiv) return;

  const shiftId = shiftDiv.getAttribute("data-id");
  const triangle = toggleButton.querySelector("div");

  if (shiftDiv.classList.contains("collapsed")) {
    shiftDiv.classList.remove("collapsed");
    if (triangle) triangle.className = "triangle-down";
    shiftDiv.setAttribute("aria-expanded", "true");
    try {
      state.collapsedShifts.delete(shiftId);
    } catch (_) {}
  } else {
    shiftDiv.classList.add("collapsed");
    if (triangle) triangle.className = "triangle-right";
    shiftDiv.setAttribute("aria-expanded", "false");
    try {
      state.collapsedShifts.add(shiftId);
    } catch (_) {}
  }
}

function expandAllShifts() {
  const shiftElements = document.querySelectorAll(".shift");
  try {
    state.collapsedShifts.clear();
  } catch (_) {}

  shiftElements.forEach((shiftDiv) => {
    const triangle = shiftDiv.querySelector(".toggle-button div");
    shiftDiv.classList.remove("collapsed");
    if (triangle) triangle.className = "triangle-down";
    shiftDiv.setAttribute("aria-expanded", "true");
  });

  if (typeof announceForScreenReader === "function") announceForScreenReader("All events expanded");
}

function collapseAllShifts() {
  const shiftElements = document.querySelectorAll(".shift");

  shiftElements.forEach((shiftDiv) => {
    const shiftId = shiftDiv.getAttribute("data-id");
    const triangle = shiftDiv.querySelector(".toggle-button div");
    try {
      if (shiftId) state.collapsedShifts.add(shiftId);
    } catch (_) {}
    shiftDiv.classList.add("collapsed");
    if (triangle) triangle.className = "triangle-right";
    shiftDiv.setAttribute("aria-expanded", "false");
  });

  if (typeof announceForScreenReader === "function") announceForScreenReader("All shifts collapsed");
}

function toggleWeekCollapse(weekToggleButton) {
  const weekIndex = parseInt(weekToggleButton.getAttribute("data-week-index"));
  if (isNaN(weekIndex)) return;

  const triangle = weekToggleButton.querySelector("div");
  const weekShifts = getShiftsForWeek(weekIndex);
  if (weekShifts.length === 0) return;

  const isCollapsed = triangle.className === "triangle-right";
  const weekToggleButtons = document.querySelectorAll(`.week-toggle-button[data-week-index="${weekIndex}"]`);
  const weekRow = document.querySelector(`tr[data-week-index="${weekIndex}"]`);
  if (!weekRow) return;

  const shiftElements = [];
  weekRow.querySelectorAll(".shift-container").forEach((container) => {
    container.querySelectorAll(".shift").forEach((shift) => shiftElements.push(shift));
  });

  if (isCollapsed) {
    shiftElements.forEach((shiftDiv) => {
      const shiftId = shiftDiv.getAttribute("data-id");
      if (!shiftId) return;
      try {
        state.collapsedShifts.delete(shiftId);
      } catch (_) {}
      shiftDiv.classList.remove("collapsed");
      const shiftToggle = shiftDiv.querySelector(".toggle-button div");
      if (shiftToggle) shiftToggle.className = "triangle-down";
      shiftDiv.setAttribute("aria-expanded", "true");
    });
    weekToggleButtons.forEach((btn) => {
      const t = btn.querySelector("div");
      if (t) t.className = "triangle-down";
    });
    if (typeof announceForScreenReader === "function") announceForScreenReader(`Expanded all events for week ${weekIndex + 1}`);
  } else {
    shiftElements.forEach((shiftDiv) => {
      const shiftId = shiftDiv.getAttribute("data-id");
      if (!shiftId) return;
      try {
        state.collapsedShifts.add(shiftId);
      } catch (_) {}
      shiftDiv.classList.add("collapsed");
      const shiftToggle = shiftDiv.querySelector(".toggle-button div");
      if (shiftToggle) shiftToggle.className = "triangle-right";
      shiftDiv.setAttribute("aria-expanded", "false");
    });
    weekToggleButtons.forEach((btn) => {
      const t = btn.querySelector("div");
      if (t) t.className = "triangle-right";
    });
    if (typeof announceForScreenReader === "function") announceForScreenReader(`Collapsed all events for week ${weekIndex + 1}`);
  }
}

/* =========================
 *  DELETE / EDIT / SAVE
 * ========================= */
function deleteShift(shiftId) {
  _ensureShiftsArray();
  const shift = shifts.find((s) => String(s.id) === String(shiftId));
  if (!shift) return;

  const eventDetails = `${(window.eventTypes && window.eventTypes[shift.type]) || (typeof eventTypes !== "undefined" && eventTypes[shift.type]) || shift.type
    } on ${getReadableDateString(new Date(shift.date))}`;

  if (!confirm(`Are you sure you want to delete this event?\n\n${eventDetails}`)) return;

  const deletedEmployeeId = shift.employeeId;
  const deletedLocation = shift.location;
  const shiftSnapshot = { ...shift }; // full copy for undo

  // ── Optimistic removal: remove locally + re-render immediately ──────────
  shifts = shifts.filter((s) => String(s.id) !== String(shiftId));
  if (typeof checkArrayIntegrity === "function") checkArrayIntegrity();
  if (typeof renderCalendar === "function") renderCalendar();
  if (typeof announceForScreenReader === "function") announceForScreenReader(`Deleted ${eventDetails}`);

  // ── Show undo toast — actual Firestore delete fires after 10 s ──────────
  _showUndoToast(
    eventDetails,
    // onUndo: restore shift locally
    () => {
      _upsertShiftLocal(shiftSnapshot);
      if (typeof renderCalendar === "function") renderCalendar();
      if (typeof announceForScreenReader === "function") announceForScreenReader(`Restored ${eventDetails}`);
    },
    // onCommit: now actually delete from Firestore
    () => {
      deleteShiftFromFirebase(shiftId).then(() => {
        // After shift is gone from Firestore, refresh Shift Offers panel so any
        // orphaned coverage requests are detected and removed from the list.
        try { window.ShiftSwapAdmin?.refresh?.(); } catch (_) {}
        try { window.ShiftTradeRequests?.refresh?.(); } catch (_) {}
      }).catch((err) => {
        console.error("Error deleting shift from Firebase:", err);
        // Restore on failure so data isn't lost
        _upsertShiftLocal(shiftSnapshot);
        if (typeof renderCalendar === "function") renderCalendar();
        alert("Could not delete event — it has been restored. Please try again.");
      });
      // Temp cleanup after commit
      if (deletedEmployeeId && typeof window.cleanupTempEmployee === "function") {
        window.cleanupTempEmployee(deletedEmployeeId);
      }
      if (deletedLocation && typeof window.cleanupTempVenue === "function") {
        window.cleanupTempVenue(deletedLocation);
      }
    },
    10000
  );
}

// ── Undo toast helper (stackable) ───────────────────────────────────────────
function _getToastContainer() {
  let container = document.getElementById("undo-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "undo-toast-container";
    document.body.appendChild(container);
  }
  return container;
}

function _showUndoToast(label, onUndo, onCommit, duration) {
  const container = _getToastContainer();
  const safeDuration = Number(duration) > 0 ? Number(duration) : 10000;

  const toast = document.createElement("div");
  toast.className = "undo-toast";
  toast.setAttribute("role", "status");
  toast.innerHTML = `
    <span class="undo-toast-msg">Deleted <em>${label}</em></span>
    <div class="undo-toast-actions">
      <button class="undo-toast-btn" type="button">Undo</button>
      <button class="undo-toast-close" type="button" aria-label="Dismiss undo message" title="Dismiss">&times;</button>
    </div>
    <div class="undo-toast-bar"><div class="undo-toast-progress"></div></div>
  `;
  container.appendChild(toast);

  // Animate progress bar
  const progress = toast.querySelector(".undo-toast-progress");
  requestAnimationFrame(() => {
    if (progress) {
      progress.style.transition = `width ${safeDuration}ms linear`;
      progress.style.width = "0%";
    }
  });

  let finalized = false;
  let timer = null;

  function removeToast() {
    toast.classList.add("undo-toast-dismissed");
    setTimeout(() => {
      toast.remove();
      if (container.children.length === 0) container.remove();
    }, 300);
  }

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function commit() {
    if (finalized) return;
    finalized = true;
    clearTimer();
    removeToast();
    try {
      if (typeof onCommit === "function") onCommit();
    } catch (err) {
      console.error("[undo-toast] commit failed:", err);
    }
  }

  function undo() {
    if (finalized) return;
    finalized = true;
    clearTimer();
    removeToast();
    try {
      if (typeof onUndo === "function") onUndo();
    } catch (err) {
      console.error("[undo-toast] undo failed:", err);
    }
  }

  function dismissEarly() {
    // User is explicitly accepting the delete and just wants the toast gone now.
    commit();
  }

  const undoBtn = toast.querySelector(".undo-toast-btn");
  const closeBtn = toast.querySelector(".undo-toast-close");

  if (undoBtn) undoBtn.addEventListener("click", undo);
  if (closeBtn) closeBtn.addEventListener("click", dismissEarly);

  timer = setTimeout(commit, safeDuration);

  // Slide in
  requestAnimationFrame(() => toast.classList.add("undo-toast-visible"));
}

function deleteShiftFromFirebase(shiftId) {
  if (!window.shiftService) {
    return firebase
      .firestore()
      .collection("shifts")
      .doc(String(shiftId))
      .delete()
      .then(() => true);
  }
  return window.shiftService.deleteShift(shiftId);
}

function _setEditingContext(isEditing, editingShiftId) {
  try {
    if (typeof state !== "undefined" && state) {
      state.isEditing = !!isEditing;
      state.editingShiftId = editingShiftId ? String(editingShiftId) : null;
    }
  } catch (_) {}

  try {
    if (window.CalendarState) {
      window.CalendarState.isEditing = !!isEditing;
      window.CalendarState.editingShiftId = editingShiftId ? String(editingShiftId) : null;
    }
  } catch (_) {}
}

function _getEditingContext() {
  try {
    if (typeof state !== "undefined" && state && state.isEditing && state.editingShiftId) {
      return { isEditing: true, editingShiftId: String(state.editingShiftId) };
    }
  } catch (_) {}
  try {
    if (window.CalendarState && window.CalendarState.isEditing && window.CalendarState.editingShiftId) {
      return { isEditing: true, editingShiftId: String(window.CalendarState.editingShiftId) };
    }
  } catch (_) {}
  return { isEditing: false, editingShiftId: null };
}

function editShift(shiftId) {
  _ensureShiftsArray();
  const els = _getEls();

  const shift = shifts.find((s) => String(s.id) === String(shiftId));
  if (!shift) {
    console.error(`Shift with ID ${shiftId} not found`);
    return;
  }

  // ✅ Keep canonical edit state in BOTH places
  _setEditingContext(true, shiftId);

  if (els.modalTitle) els.modalTitle.textContent = "Edit Event";
  if (els.submitButton) els.submitButton.textContent = "Update Event";

  try {
    els.shiftDateInput.value = shift.date;
    // Ensure the current host option exists in the dropdown before selecting.
    // (If employees haven't loaded yet, .value assignment alone won't show anything.)
    const hostVal = shift.employeeId == null ? "" : String(shift.employeeId);
    if (els.shiftEmployeeSelect && hostVal) {
      const hasOpt = Array.from(els.shiftEmployeeSelect.options || []).some(
        (o) => String(o.value) === hostVal
      );
      if (!hasOpt) {
        const opt = document.createElement("option");
        opt.value = hostVal;
        opt.textContent =
          (window.employees && window.employees[shift.employeeId]) ||
          (typeof employees !== "undefined" && employees[shift.employeeId]) ||
          "Unknown host";
        els.shiftEmployeeSelect.appendChild(opt);
      }
      els.shiftEmployeeSelect.value = hostVal;
      try {
        els.shiftEmployeeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (_) {}

      // Dropdown options may still be rebuilding asynchronously (employees load),
      // which can reset the selection back to the placeholder. Re-apply shortly.
      setTimeout(function () {
        try {
          if (!els.shiftEmployeeSelect) return;
          const cur = String(els.shiftEmployeeSelect.value || "");
          if (cur === hostVal) return;

          const stillHasOpt = Array.from(els.shiftEmployeeSelect.options || []).some(
            (o) => String(o.value) === hostVal
          );
          if (!stillHasOpt) {
            const opt2 = document.createElement("option");
            opt2.value = hostVal;
            opt2.textContent =
              (window.employees && window.employees[shift.employeeId]) ||
              (typeof employees !== "undefined" && employees[shift.employeeId]) ||
              "Unknown host";
            els.shiftEmployeeSelect.appendChild(opt2);
          }
          els.shiftEmployeeSelect.value = hostVal;
          try {
            els.shiftEmployeeSelect.dispatchEvent(new Event("change", { bubbles: true }));
          } catch (_) {}
        } catch (_) {}
      }, 150);
    } else if (els.shiftEmployeeSelect) {
      els.shiftEmployeeSelect.value = "";
    }

    if (typeof selectDropdownOptionByValue === "function") {
      selectDropdownOptionByValue(els.startTimeSelect, shift.startTime);
      selectDropdownOptionByValue(els.endTimeSelect, shift.endTime);
    } else {
      if (els.startTimeSelect) els.startTimeSelect.value = shift.startTime;
      if (els.endTimeSelect) els.endTimeSelect.value = shift.endTime;
    }

    els.shiftTypeSelect.value = shift.type;
    if (typeof toggleThemeField === "function") toggleThemeField();
    if (els.shiftThemeInput) {
      els.shiftThemeInput.value = shift.type === "themed-trivia" ? (shift.theme || "") : "";
    }

    els.shiftLocationSelect.value = shift.location;
    if (els.shiftNotesInput) els.shiftNotesInput.value = shift.notes || "";

    // ✅ Route open through modal-handlers stack if possible WITHOUT resetting the form
    const modalEl = els.shiftModal || document.getElementById("shift-modal");
    if (modalEl) {
      modalEl.style.display = "flex";
      modalEl.setAttribute("aria-hidden", "false");
      try {
        if (typeof window.pushModal === "function") window.pushModal("shift-modal");
      } catch (_) {}
    }

    setTimeout(() => els.shiftDateInput?.focus?.(), 0);

    const hostName = (window.employees && window.employees[shift.employeeId]) || (typeof employees !== "undefined" && employees[shift.employeeId]) || "Unknown host";
    if (typeof announceForScreenReader === "function") {
      announceForScreenReader(`Editing event for ${hostName} on ${getReadableDateString(new Date(shift.date))}`);
    }
  } catch (error) {
    console.error("Error editing shift:", error);
    alert("There was an error while loading the event details. Please try again.");
  }
}

async function saveShift(e) {
  const els = _getEls();
  _ensureShiftsArray();

  if (e) {
    try {
      e.preventDefault?.();
      e.stopPropagation?.();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    } catch (_) {}
  }

  if (typeof validateShiftForm === "function" && !validateShiftForm()) return;

  const date = els.shiftDateInput?.value;
  let employeeId = els.shiftEmployeeSelect?.value;
  const startTime = els.startTimeSelect?.value;
  const endTime = els.endTimeSelect?.value;
  const type = els.shiftTypeSelect?.value;
  const theme = type === "themed-trivia" ? (els.shiftThemeInput?.value || "") : "";
  let location = els.shiftLocationSelect?.value;
  const notes = els.shiftNotesInput?.value || "";

  // Declare early — needed in write-in blocks AND conflict/save blocks below
  const ctx = _getEditingContext();
  const _editingShift = ctx.isEditing && ctx.editingShiftId
    ? (shifts.find((s) => String(s.id) === String(ctx.editingShiftId)) || null)
    : null;
  const previousEmployeeId = _editingShift?.employeeId || null;
  const previousLocation = _editingShift?.location || null;
  let actionType = "Added";
  const btn = els.submitButton || document.getElementById("save-shift-btn");
  const originalText = btn ? btn.textContent : "Save Event";

  // ── Write-in temp employee ──────────────────────────────────────────────
  if (employeeId === "__write_in__") {
    const writeInName = document.getElementById("write-in-host-name")?.value?.trim();
    if (!writeInName) {
      alert("Please enter a name for the temporary host.");
      if (btn) { btn.textContent = originalText; btn.disabled = false; }
      return;
    }
    if (typeof window.createTempEmployee !== "function") {
      alert("Temp employee creation unavailable — please refresh the page.");
      if (btn) { btn.textContent = originalText; btn.disabled = false; }
      return;
    }
    try {
      employeeId = await window.createTempEmployee(writeInName);
      // Reset the write-in UI
      const field = document.getElementById("write-in-host-field");
      const input = document.getElementById("write-in-host-name");
      if (field) field.style.display = "none";
      if (input) input.value = "";
    } catch (err) {
      console.error("[write-in] createTempEmployee failed:", err);
      alert("Could not create temporary host. Please try again.");
      if (btn) { btn.textContent = originalText; btn.disabled = false; }
      return;
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  // ── Write-in temp venue ────────────────────────────────────────────────
  if (location === "__write_in_venue__") {
    const writeInVenue = document.getElementById("write-in-venue-name")?.value?.trim();
    if (!writeInVenue) {
      alert("Please enter a name for the temporary venue.");
      if (btn) { btn.textContent = originalText; btn.disabled = false; }
      return;
    }
    if (typeof window.createTempVenue !== "function") {
      alert("Temp venue creation unavailable — please refresh the page.");
      if (btn) { btn.textContent = originalText; btn.disabled = false; }
      return;
    }
    try {
      location = await window.createTempVenue(writeInVenue);
      const field = document.getElementById("write-in-venue-field");
      const input = document.getElementById("write-in-venue-name");
      if (field) field.style.display = "none";
      if (input) input.value = "";
    } catch (err) {
      console.error("[write-in] createTempVenue failed:", err);
      alert("Could not create temporary venue. Please try again.");
      if (btn) { btn.textContent = originalText; btn.disabled = false; }
      return;
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  const shiftData = { date, employeeId, startTime, endTime, type, theme, location, notes };

  // Read forceBooking from either state or CalendarState (modal-handlers may set either)
  const forceBooking =
    (typeof state !== "undefined" && state && state.forceBooking) ||
    (window.CalendarState && window.CalendarState.forceBooking) ||
    false;

  // ✅ Conflict detection (store pending + mirror into CalendarState)
  if (!forceBooking) {
    const conflicts = checkForDoubleBooking(shiftData, ctx.isEditing && ctx.editingShiftId ? ctx.editingShiftId : null);

    if (conflicts.length > 0) {
      // ✅ Clear any stale drag/drop move operation — this is a form conflict, not a drag.
      // A leftover globalMoveOperation would hijack the "Proceed Anyway" handler.
      try { window.globalMoveOperation = null; } catch (_) {}
      try { if (window.CalendarState) window.CalendarState.globalMoveOperation = null; } catch (_) {}

      try {
        if (typeof state !== "undefined" && state) state.pendingShiftData = shiftData;
      } catch (_) {}

      try {
        if (window.CalendarState) {
          window.CalendarState.pendingShiftData = shiftData;
          window.CalendarState.isEditing = !!ctx.isEditing;
          window.CalendarState.editingShiftId = ctx.editingShiftId || null;
        }
      } catch (_) {}

      try {
        if (els.submitButton) els.submitButton.disabled = true;
      } catch (_) {}

      if (typeof showSimplifiedWarning === "function") showSimplifiedWarning(employeeId);
      return;
    }
  }

  // Reset force flag once we pass conflict check
  try {
    if (typeof state !== "undefined" && state) state.forceBooking = false;
  } catch (_) {}
  try {
    if (window.CalendarState) window.CalendarState.forceBooking = false;
  } catch (_) {}

  if (btn) {
    btn.textContent = "Saving...";
    btn.disabled = true;
  }

  let op;
  if (ctx.isEditing && ctx.editingShiftId) {
    actionType = "Updated";
    const current = shifts.find((s) => String(s.id) === String(ctx.editingShiftId)) || {};
    const updated = { ...current, ...shiftData, id: String(ctx.editingShiftId) };

    op = updateShiftInFirebase(ctx.editingShiftId, updated).then(() => {
      _upsertShiftLocal(updated);
      return updated;
    });
  } else {
    op = saveShiftToFirebase(shiftData, forceBooking ? { force: true } : undefined).then((newId) => {
      const created = { ...shiftData, id: newId };
      _upsertShiftLocal(created);
      return created;
    });
  }

  op
    .then(() => {
      if (typeof window.closeShiftModal === "function") window.closeShiftModal();
      else {
        const modal = document.getElementById("shift-modal");
        if (modal) {
          try {
            document.activeElement?.blur?.();
          } catch (_) {}
          modal.style.display = "none";
          modal.setAttribute("aria-hidden", "true");
        }
      }

      _setEditingContext(false, null);

      // ── Temp employee cleanup on reassignment ──────────────────────────
      if (previousEmployeeId && previousEmployeeId !== employeeId) {
        try {
          if (typeof window.cleanupTempEmployee === "function") {
            window.cleanupTempEmployee(previousEmployeeId);
          }
        } catch (_) {}
      }
      // ── Temp venue cleanup on reassignment ─────────────────────────────
      if (previousLocation && previousLocation !== location) {
        try {
          if (typeof window.cleanupTempVenue === "function") {
            window.cleanupTempVenue(previousLocation);
          }
        } catch (_) {}
      }
      // ──────────────────────────────────────────────────────────────────

      if (typeof renderCalendar === "function") renderCalendar();

      const eventType =
        (window.eventTypes && window.eventTypes[type]) || (typeof eventTypes !== "undefined" && eventTypes[type]) || type;
      const employeeName =
        (window.employees && window.employees[employeeId]) || (typeof employees !== "undefined" && employees[employeeId]) || "Unknown host";

      if (typeof announceForScreenReader === "function") {
        announceForScreenReader(
          `${actionType} ${eventType} event for ${employeeName} on ${getReadableDateString(new Date(date))}`
        );
      }
    })
    .catch((err) => {
      console.error("Error saving shift:", err);
      alert("There was an error saving the event. Please try again.");
    })
    .finally(() => {
      if (btn) {
        btn.textContent = originalText;
        btn.disabled = false;
      }

      try {
        if (typeof state !== "undefined" && state) {
          state.pendingShiftData = null;
          state.forceBooking = false;
        }
      } catch (_) {}

      try {
        if (window.CalendarState) {
          window.CalendarState.pendingShiftData = null;
          window.CalendarState.forceBooking = false;
        }
      } catch (_) {}
    });
}

// ✅ forceSaveShift — used by the "Proceed Anyway" conflict override path.
// Takes already-validated pendingShiftData directly; bypasses form re-read,
// validateShiftForm(), and the forceBooking state-flag mechanism entirely.
window.forceSaveShift = function forceSaveShift(pendingShiftData) {
  if (!pendingShiftData) {
    console.error("[forceSaveShift] No pendingShiftData provided");
    return;
  }

  const ctx = _getEditingContext();
  const els = _getEls();
  const btn = els.submitButton || document.getElementById("save-shift-btn");
  const originalText = btn ? btn.textContent : "Save Event";

  if (btn) {
    btn.textContent = "Saving...";
    btn.disabled = true;
  }

  let op;
  if (ctx.isEditing && ctx.editingShiftId) {
    const current = (window.getShifts ? window.getShifts() : shifts).find(
      (s) => String(s.id) === String(ctx.editingShiftId)
    ) || {};
    const updated = { ...current, ...pendingShiftData, id: String(ctx.editingShiftId) };
    op = updateShiftInFirebase(ctx.editingShiftId, updated).then(() => {
      _upsertShiftLocal(updated);
      return updated;
    });
  } else {
    op = saveShiftToFirebase(pendingShiftData, { force: true }).then((newId) => {
      const created = { ...pendingShiftData, id: newId };
      _upsertShiftLocal(created);
      return created;
    });
  }

  op
    .then(() => {
      if (typeof window.closeShiftModal === "function") {
        window.closeShiftModal();
      } else {
        const modal = document.getElementById("shift-modal");
        if (modal) {
          modal.style.display = "none";
          modal.setAttribute("aria-hidden", "true");
        }
      }
      _setEditingContext(false, null);
      if (typeof renderCalendar === "function") renderCalendar();
    })
    .catch((err) => {
      console.error("[forceSaveShift] Error saving shift:", err);
      alert("There was an error saving the event. Please try again.");
    })
    .finally(() => {
      if (btn) {
        btn.textContent = originalText;
        btn.disabled = false;
      }
      try {
        if (typeof state !== "undefined" && state) {
          state.pendingShiftData = null;
          state.forceBooking = false;
        }
      } catch (_) {}
      try {
        if (window.CalendarState) {
          window.CalendarState.pendingShiftData = null;
          window.CalendarState.forceBooking = false;
        }
      } catch (_) {}
    });
};

function saveShiftToFirebase(shiftData, options) {
  if (window.shiftService?.saveShift) return window.shiftService.saveShift(shiftData, options);

  return firebase
    .firestore()
    .collection("shifts")
    .add({
      ...shiftData,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    })
    .then((docRef) => docRef.id);
}

function updateShiftInFirebase(shiftId, shiftData) {
  if (window.shiftService?.updateShift) return window.shiftService.updateShift(shiftId, shiftData);

  if (window.shiftService?.saveShift) {
    return window.shiftService.saveShift({ ...shiftData, id: String(shiftId) }).then(() => String(shiftId));
  }

  const id = String(shiftId);
  return firebase
    .firestore()
    .collection("shifts")
    .doc(id)
    .update({
      ...shiftData,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    })
    .then(() => id);
}

function loadShiftsFromFirebase() {
  console.log("Loading shifts from Firebase (via shiftService)...");
  if (window.shiftService?.getAllShifts) {
    return window.shiftService.getAllShifts();
  }
  return firebase
    .firestore()
    .collection("shifts")
    .get()
    .then((qs) => {
      const out = [];
      qs.forEach((doc) => {
        const d = doc.data();
        out.push({
          id: doc.id,
          date: d.date,
          employeeId: d.employeeId,
          startTime: d.startTime,
          endTime: d.endTime,
          type: d.type,
          theme: d.theme || "",
          location: d.location,
          notes: d.notes || "",
        });
      });
      return out;
    })
    .catch((err) => {
      console.error("Error loading shifts:", err);
      return [];
    });
}

/* =========================
 *  MOVE / VALIDATION / DEBUG
 * ========================= */
function moveShift(shiftId, targetDate) {
  _ensureShiftsArray();
  console.log(`Moving shift ${shiftId} → ${targetDate}`);
  const original = shifts.find((s) => String(s.id) === String(shiftId));
  if (!original) {
    console.error(`Cannot find shift with ID: ${shiftId}`);
    return Promise.resolve(false);
  }
  const moved = { ...original, date: targetDate };

  return updateShiftInFirebase(shiftId, moved)
    .then(() => {
      _upsertShiftLocal({ ...moved, id: String(shiftId) });
      console.log(`Successfully moved shift ${shiftId} to ${targetDate}`);
      return true;
    })
    .catch((error) => {
      console.error("Error moving shift:", error);
      alert("Could not move event. Please try again later.");
      return false;
    });
}

function checkForDoubleBooking(newShift, excludeShiftId = null) {
  _ensureShiftsArray();
  try {
    const { date, employeeId } = newShift;
    return shifts.filter(
      (s) =>
        s.date === date &&
        s.employeeId === employeeId &&
        (excludeShiftId === null || String(s.id) !== String(excludeShiftId))
    );
  } catch (err) {
    console.error("Error checking double booking:", err);
    return [];
  }
}

function checkArrayIntegrity() {
  _ensureShiftsArray();
  const ids = shifts.map((s) => s.id);
  const seen = new Set();
  let ok = true;

  ids.forEach((id) => {
    if (seen.has(id)) ok = false;
    seen.add(id);
  });

  if (!ok) {
    console.error("DUPLICATE IDs DETECTED IN SHIFTS ARRAY!");
    const counts = {};
    ids.forEach((id) => (counts[id] = (counts[id] || 0) + 1));
    Object.entries(counts).forEach(([id, n]) => {
      if (n > 1) {
        console.error(`ID ${id} appears ${n} times`, shifts.filter((s) => s.id === id));
      }
    });
  }
  return ok;
}