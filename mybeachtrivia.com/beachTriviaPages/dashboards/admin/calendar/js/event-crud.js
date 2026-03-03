// event-crud.js
// Functions for CRUD operations on shifts and events
//
// Updated 2026-02-27:
// - Keep modal-handlers override flow compatible
// - Route UI modal open/close through modal-handlers when present
// - Ensure conflict override updates (not adds) when editing
// - Keep wrappers for clear-day modal in case legacy callers still use event-crud.js
// - Harden a few spots around missing globals / service fallbacks

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

  const deletePromises = shiftsToDelete.map((shift) =>
    deleteShiftFromFirebase(shift.id).catch((err) => {
      console.error(`Error deleting shift ${shift.id}:`, err);
      return false;
    })
  );

  Promise.all(deletePromises)
    .then((results) => {
      const successCount = results.filter(Boolean).length;

      _removeIdsLocal(shiftsToDelete.map((s) => s.id));

      if (typeof window.closeClearDayModal === "function") window.closeClearDayModal();

      if (successCount === shiftsToDelete.length) {
        alert(`Successfully deleted all ${successCount} events.`);
      } else {
        alert(`Deleted ${successCount} of ${shiftsToDelete.length} events. Some deletions may have failed.`);
      }

      if (typeof announceForScreenReader === "function") {
        announceForScreenReader(`Deleted ${successCount} events.`);
      }
      if (typeof renderCalendar === "function") renderCalendar();
    })
    .catch((error) => {
      console.error("Error deleting shifts:", error);
      alert("An error occurred while deleting events. Please try again.");
      if (typeof window.closeClearDayModal === "function") window.closeClearDayModal();
    });
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

  if (confirm(`Are you sure you want to delete this event?\n\n${eventDetails}`)) {
    deleteShiftFromFirebase(shiftId)
      .then(() => {
        shifts = shifts.filter((s) => String(s.id) !== String(shiftId));
        console.log(`Deleted shift ${shiftId}, remaining: ${shifts.length}`);
        if (typeof checkArrayIntegrity === "function") checkArrayIntegrity();
        if (typeof renderCalendar === "function") renderCalendar();
        if (typeof announceForScreenReader === "function") announceForScreenReader(`Deleted ${eventDetails}`);
      })
      .catch((error) => {
        console.error("Error deleting shift from Firebase:", error);
        alert("Could not delete event. Please try again later.");
      });
  }
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
    els.shiftEmployeeSelect.value = shift.employeeId;

    if (typeof selectDropdownOptionByValue === "function") {
      selectDropdownOptionByValue(els.startTimeSelect, shift.startTime);
      selectDropdownOptionByValue(els.endTimeSelect, shift.endTime);
    } else {
      // fallback
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

function saveShift(e) {
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
  const employeeId = els.shiftEmployeeSelect?.value;
  const startTime = els.startTimeSelect?.value;
  const endTime = els.endTimeSelect?.value;
  const type = els.shiftTypeSelect?.value;
  const theme = type === "themed-trivia" ? (els.shiftThemeInput?.value || "") : "";
  const location = els.shiftLocationSelect?.value;
  const notes = els.shiftNotesInput?.value || "";

  const shiftData = { date, employeeId, startTime, endTime, type, theme, location, notes };

  // Read forceBooking from either state or CalendarState (modal-handlers may set either)
  const forceBooking =
    (typeof state !== "undefined" && state && state.forceBooking) ||
    (window.CalendarState && window.CalendarState.forceBooking) ||
    false;

  const ctx = _getEditingContext();
  const excludeId = ctx.isEditing && ctx.editingShiftId ? ctx.editingShiftId : null;

  // ✅ Conflict detection (store pending + mirror into CalendarState)
  if (!forceBooking) {
    const conflicts = checkForDoubleBooking(shiftData, excludeId);

    if (conflicts.length > 0) {
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

  let actionType = "Added";
  const btn = els.submitButton || document.getElementById("save-shift-btn");
  const originalText = btn ? btn.textContent : "Save Event";

  if (btn) {
    btn.textContent = "Saving...";
    btn.disabled = true;
  }

  let op;
  if (ctx.isEditing && ctx.editingShiftId) {
    // ✅ EDIT -> MUST UPDATE (never add)
    actionType = "Updated";
    const current = shifts.find((s) => String(s.id) === String(ctx.editingShiftId)) || {};
    const updated = { ...current, ...shiftData, id: String(ctx.editingShiftId) };

    op = updateShiftInFirebase(ctx.editingShiftId, updated).then(() => {
      _upsertShiftLocal(updated);
      return updated;
    });
  } else {
    // ✅ ADD
    op = saveShiftToFirebase(shiftData).then((newId) => {
      const created = { ...shiftData, id: newId };
      _upsertShiftLocal(created);
      return created;
    });
  }

  op
    .then(() => {
      // ✅ Prefer modal-handlers close if present
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

      // ✅ Clear edit state AFTER a successful write
      _setEditingContext(false, null);

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

function saveShiftToFirebase(shiftData) {
  if (window.shiftService?.saveShift) return window.shiftService.saveShift(shiftData);

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
  // Prefer shiftService.updateShift if it exists, else saveShift with id, else raw doc.update
  if (window.shiftService?.updateShift) return window.shiftService.updateShift(shiftId, shiftData);

  if (window.shiftService?.saveShift) {
    // Some implementations treat saveShift({id}) as upsert/update.
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