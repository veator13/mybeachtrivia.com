/* mybeachtrivia.com/beachTriviaPages/dashboards/admin/calendar/js/drag-drop-handler.js
   Drop-in replacement.

   Updated 2026-02-27:
   - Uses window.globalMoveOperation ONLY (no stray globals)
   - Exposes window._applyGlobalMoveOperationOverride() AND window.executeOverrideFromGlobalMoveOperation()
     for modal-handlers "Proceed Anyway" flow
   - Stores full override context for shift/day/week operations (shiftId/targetDate/sourceDateStr/shifts/isCopy)
   - Adds safe upsert helpers to prevent duplicate IDs in the local shifts array
   - Local-state updates are replace-by-id (never push duplicates)
   - ✅ Uses window.getShifts()/window.setShifts() when available (prevents stale references)
   - ✅ Fixes TDZ bug: do NOT reference bare `elements` / `state` identifiers during initialization

   Updated 2026-03-04:
   - ✅ Prevents DOUBLE execution of override (Proceed Anyway) which was causing duplicate copies
     (re-entrancy guard + mark op inactive immediately)

   Updated 2026-03-05:
   - ✅ SAFER isCopyOperation detection (avoid `.getData()` truthiness pitfalls)
   - ✅ Guard if `.calendar-container` missing in dragOver
   - ✅ Ensure state array fields exist to avoid undefined `.length` access

   Updated 2026-03-05 (SKIP CONFLICTS):
   - ✅ Exposes window.executeSkipConflictsFromGlobalMoveOperation()
   - ✅ Marks batch ops with op.isBatch/op.mode so modal-handlers shows "Skip Conflicts"
   - ✅ Skip Conflicts continues batch copy/move but silently skips conflicting shifts
*/
(function () {
    "use strict";
  
    // ---- Safe access to shared globals (avoid TDZ / stray globals) ----
    function _getElements() {
      try {
        return window.elements || {};
      } catch (_) {
        return {};
      }
    }
  
    function _getState() {
      try {
        return window.CalendarState || window.state || {};
      } catch (_) {
        return {};
      }
    }
  
    function _ensureStateArrays(state) {
      if (!state) return;
      if (!Array.isArray(state.copyingDayShifts)) state.copyingDayShifts = [];
      if (!Array.isArray(state.copyingWeekShifts)) state.copyingWeekShifts = [];
      if (!Array.isArray(state.movingDayShifts)) state.movingDayShifts = [];
      if (!Array.isArray(state.movingWeekShifts)) state.movingWeekShifts = [];
    }
  
    // Use short-name map (main.js exposes window.employees)
    const employeesMap = () => window.employees || {};
  
    /* =========================
     *  CONFLICT MODAL BUTTON GETTERS
     * ========================= */
    function _getProceedConflictBtn() {
      const elements = _getElements();
      return (
        elements?.proceedBookingBtn ||
        document.getElementById("proceed-booking") ||
        document.getElementById("confirm-booking") ||
        document.getElementById("confirm-booking-btn") ||
        document.getElementById("proceed-booking-btn") ||
        document.getElementById("confirm-warning") ||
        document.querySelector("[data-action='proceed-booking']")
      );
    }
  
    function _getCancelConflictBtn() {
      const elements = _getElements();
      return (
        elements?.cancelBookingBtn ||
        document.getElementById("cancel-booking") ||
        document.getElementById("cancel-booking-btn") ||
        document.getElementById("cancel-warning") ||
        document.querySelector("[data-action='cancel-booking']")
      );
    }
  
    /* =========================
     *  SHIFTS ARRAY HELPERS (ANTI-DUPE)
     * ========================= */
  
    function _getShiftsArray() {
      try {
        if (typeof window.getShifts === "function") {
          const arr = window.getShifts();
          return Array.isArray(arr) ? arr : [];
        }
      } catch (_) {}
  
      try {
        if (Array.isArray(window.shifts)) return window.shifts;
      } catch (_) {}
  
      return [];
    }
  
    function _setShiftsArray(next) {
      const safe = Array.isArray(next) ? next : _getShiftsArray();
  
      try {
        if (typeof window.setShifts === "function") window.setShifts(safe);
      } catch (_) {}
  
      try {
        window.shifts = safe;
      } catch (_) {}
  
      return safe;
    }
  
    function _ensureShiftsArray() {
      const current = _getShiftsArray();
      if (!Array.isArray(current)) _setShiftsArray([]);
      else _setShiftsArray(current); // ensure globals aligned
    }
  
    function _upsertShiftLocal(nextShift) {
      _ensureShiftsArray();
      if (!nextShift || nextShift.id == null) return;
  
      const id = String(nextShift.id);
      const current = _getShiftsArray();
  
      const idx = current.findIndex((s) => String(s?.id) === id);
      let next;
      if (idx === -1) {
        next = [...current, { ...nextShift }];
      } else {
        const merged = { ...current[idx], ...nextShift, id: current[idx].id };
        next = current.slice();
        next[idx] = merged;
      }
      _setShiftsArray(next);
    }
  
    function _upsertManyLocal(nextShifts) {
      _ensureShiftsArray();
      if (!Array.isArray(nextShifts) || nextShifts.length === 0) return;
  
      const current = _getShiftsArray();
      const map = new Map();
  
      current.forEach((s) => {
        if (s?.id != null) map.set(String(s.id), s);
      });
  
      nextShifts.forEach((s) => {
        if (s?.id != null) {
          const key = String(s.id);
          map.set(key, { ...(map.get(key) || {}), ...s });
        }
      });
  
      _setShiftsArray(Array.from(map.values()));
    }
  
    function _removeIdsLocal(ids) {
      _ensureShiftsArray();
      const set = new Set((ids || []).map((x) => String(x)));
      const current = _getShiftsArray();
      _setShiftsArray(current.filter((s) => !set.has(String(s?.id))));
    }
  
    /* =========================
     *  GLOBAL MOVE OPERATION (CONFLICT OVERRIDE)
     * ========================= */
    function _ensureGlobalMoveOperation() {
      if (!window.globalMoveOperation) {
        window.globalMoveOperation = {
          active: false,
          shiftId: null,
          targetDate: null,
          sourceDateStr: null,
          shifts: null,
          isCopy: false,
  
          // batch metadata so modal-handlers shows Skip Conflicts
          isBatch: false,
          mode: null, // "week-copy" | "week-move" | "day-copy" | "day-move"
          allowSkipConflicts: true,
  
          // flags set by modal-handlers
          skipConflicts: false,
          override: false,
          force: false,
        };
      }
      return window.globalMoveOperation;
    }
  
    function _resetGlobalMoveOperation() {
      try {
        const op = _ensureGlobalMoveOperation();
        op.active = false;
        op.shiftId = null;
        op.targetDate = null;
        op.sourceDateStr = null;
        op.shifts = null;
        op.isCopy = false;
  
        op.isBatch = false;
        op.mode = null;
        op.allowSkipConflicts = true;
  
        op.skipConflicts = false;
        op.override = false;
        op.force = false;
  
        // internal helper
        if (op._weekCopyCleanup) op._weekCopyCleanup = null;
      } catch (_) {}
    }
  
    // ✅ Force-save helper for override paths (bypasses conflict check)
    async function _forceSave(shiftData) {
      if (window.shiftService?.forceSaveShift) return window.shiftService.forceSaveShift(shiftData);
      if (window.shiftService?.saveShift) return window.shiftService.saveShift(shiftData, { force: true });
      if (typeof window.forceSaveShiftToFirebase === "function") return window.forceSaveShiftToFirebase(shiftData);
      return saveShiftToFirebase(shiftData);
    }
  
    // ✅ normal save (non-force) helper for skip-conflicts path
    async function _normalSave(shiftData) {
      if (window.shiftService?.saveShift) return window.shiftService.saveShift(shiftData, { force: false });
      return saveShiftToFirebase(shiftData);
    }
  
    function _hasConflictFor(dateStr, employeeId, excludeShiftId) {
      try {
        const conflicts = checkForDoubleBooking({ date: dateStr, employeeId }, excludeShiftId || null);
        return Array.isArray(conflicts) && conflicts.length > 0;
      } catch (_) {
        // fail "closed" — if check function errors, treat as conflict to avoid accidental overlaps
        return true;
      }
    }
  
    async function _applyOverrideForSingleShift(op) {
      _ensureShiftsArray();
  
      const isCopyOperation = !!op.isCopy;
      const shiftId = op.shiftId;
      const targetDate = op.targetDate;
  
      const current = _getShiftsArray();
      const shiftIndex = current.findIndex((s) => String(s?.id) === String(shiftId));
      if (shiftIndex === -1) {
        alert("That event no longer exists. Please refresh the calendar.");
        return;
      }
  
      const draggedShift = current[shiftIndex];
  
      if (isCopyOperation) {
        const newShiftData = {
          date: targetDate,
          employeeId: draggedShift.employeeId,
          startTime: draggedShift.startTime,
          endTime: draggedShift.endTime,
          type: draggedShift.type,
          theme: draggedShift.theme,
          location: draggedShift.location,
          notes: draggedShift.notes,
        };
  
        const newId = await _forceSave(newShiftData);
        const newShift = { ...newShiftData, id: newId };
  
        try {
          const state = _getState();
          if (state.collapsedShifts && state.collapsedShifts.has(draggedShift.id)) {
            state.collapsedShifts.add(newShift.id);
          }
        } catch (_) {}
  
        _upsertShiftLocal(newShift);
  
        try {
          if (typeof announceForScreenReader === "function") {
            announceForScreenReader(`Event copied to ${getReadableDateString(new Date(targetDate))}`);
          }
        } catch (_) {}
  
        try {
          if (typeof renderCalendar === "function") renderCalendar();
        } catch (_) {}
  
        return;
      }
  
      const updatedShift = { ...draggedShift, date: targetDate };
  
      // ✅ Override path — must bypass conflict check
      if (window.shiftService?.forceUpdateShift) {
        await window.shiftService.forceUpdateShift(shiftId, updatedShift);
      } else if (window.shiftService?.updateShift) {
        await window.shiftService.updateShift(shiftId, updatedShift, { force: true });
      } else {
        await updateShiftInFirebase(shiftId, updatedShift);
      }
  
      _upsertShiftLocal({ ...updatedShift, id: shiftId });
  
      try {
        if (typeof announceForScreenReader === "function") {
          announceForScreenReader(`Event moved to ${getReadableDateString(new Date(targetDate))}`);
        }
      } catch (_) {}
  
      try {
        if (typeof renderCalendar === "function") renderCalendar();
      } catch (_) {}
    }
  
    async function _applyOverrideForDayBatch(op) {
      _ensureShiftsArray();
  
      const targetDate = op.targetDate;
      const sourceDateStr = op.sourceDateStr;
      const isCopy = !!op.isCopy;
      const batch = Array.isArray(op.shifts) ? op.shifts : [];
      // targetDate may be null for week-copy overrides (each shift carries its own pre-mapped date)
      const isPreMapped = !targetDate && isCopy;
  
      if (!isPreMapped && (!targetDate || batch.length === 0)) {
        alert("Nothing to move/copy. Please try again.");
        return;
      }
      if (isPreMapped && batch.length === 0) {
        alert("Nothing to move/copy. Please try again.");
        return;
      }
  
      if (sourceDateStr && sourceDateStr === targetDate) return;
  
      // Run cleanup if week copy stored one
      const _weekCleanup = typeof op._weekCopyCleanup === "function" ? op._weekCopyCleanup : null;
  
      if (isCopy) {
        const created = [];
  
        await Promise.all(
          batch.map(async (shift) => {
            const newShiftData = {
              date: isPreMapped ? shift.date : targetDate,
              employeeId: shift.employeeId,
              startTime: shift.startTime,
              endTime: shift.endTime,
              type: shift.type,
              theme: shift.theme,
              location: shift.location,
              notes: shift.notes,
            };
  
            const newId = await _forceSave(newShiftData);
            const newShift = { ...newShiftData, id: newId };
  
            try {
              const state = _getState();
              if (state.collapsedShifts && state.collapsedShifts.has(shift.id)) {
                state.collapsedShifts.add(newShift.id);
              }
            } catch (_) {}
  
            created.push(newShift);
            return newShift;
          })
        );
  
        _upsertManyLocal(created);
  
        try {
          const state = _getState();
          state.copyingDayShifts = [];
        } catch (_) {}
  
        // ✅ Run week copy cleanup if present
        try {
          if (_weekCleanup) _weekCleanup();
        } catch (_) {}
  
        try {
          if (typeof announceForScreenReader === "function") {
            announceForScreenReader(`Copied ${created.length} events`);
          }
        } catch (_) {}
  
        try {
          if (typeof renderCalendar === "function") renderCalendar();
        } catch (_) {}
  
        return;
      }
  
      // MOVE DAY: create new docs, delete originals
      const originalShiftIds = batch.map((s) => s.id);
      const created = [];
  
      await Promise.all(
        batch.map(async (shift) => {
          const newShiftData = {
            date: targetDate,
            employeeId: shift.employeeId,
            startTime: shift.startTime,
            endTime: shift.endTime,
            type: shift.type,
            theme: shift.theme,
            location: shift.location,
            notes: shift.notes,
          };
  
          const newId = await _forceSave(newShiftData);
          const newShift = { ...newShiftData, id: newId };
  
          try {
            const state = _getState();
            if (state.collapsedShifts && state.collapsedShifts.has(shift.id)) {
              state.collapsedShifts.add(newShift.id);
            }
          } catch (_) {}
  
          created.push(newShift);
          return newShift;
        })
      );
  
      await Promise.all(originalShiftIds.map((id) => deleteShiftFromFirebase(id)));
  
      _removeIdsLocal(originalShiftIds);
      _upsertManyLocal(created);
  
      try {
        const state = _getState();
        state.movingDayShifts = [];
        state.isDragDayMove = false;
        state.sourceDateStr = null;
      } catch (_) {}
  
      try {
        if (typeof announceForScreenReader === "function") {
          announceForScreenReader(`Moved ${created.length} events to ${getReadableDateString(new Date(targetDate))}`);
        }
      } catch (_) {}
  
      try {
        if (typeof renderCalendar === "function") renderCalendar();
      } catch (_) {}
    }
  
    // ✅ Skip Conflicts executor (batch only)
    async function _applySkipConflictsForBatch(op) {
      _ensureShiftsArray();
  
      const isCopy = !!op.isCopy;
      const batch = Array.isArray(op.shifts) ? op.shifts : [];
      if (!batch.length) return { created: 0, skipped: 0, moved: 0 };
  
      const state = _getState();
      _ensureStateArrays(state);
  
      // pre-mapped week-copy batch uses shift.date already
      const isPreMapped = !op.targetDate && isCopy;
  
      const targetDate = op.targetDate;
  
      let createdCount = 0;
      let movedCount = 0;
      let skippedCount = 0;
  
      // week cleanup hook (for week-copy)
      const _weekCleanup = typeof op._weekCopyCleanup === "function" ? op._weekCopyCleanup : null;
  
      if (isCopy) {
        const created = [];
  
        for (const shift of batch) {
          const destDate = isPreMapped ? shift.date : targetDate;
          if (!destDate) {
            skippedCount++;
            continue;
          }
  
          // if conflict exists at destination, skip silently
          if (_hasConflictFor(destDate, shift.employeeId, null)) {
            skippedCount++;
            continue;
          }
  
          const newShiftData = {
            date: destDate,
            employeeId: shift.employeeId,
            startTime: shift.startTime,
            endTime: shift.endTime,
            type: shift.type,
            theme: shift.theme,
            location: shift.location,
            notes: shift.notes,
          };
  
          try {
            const newId = await _normalSave(newShiftData);
            const newShift = { ...newShiftData, id: newId };
  
            try {
              if (state.collapsedShifts?.has?.(shift.id)) state.collapsedShifts.add(newShift.id);
            } catch (_) {}
  
            created.push(newShift);
            createdCount++;
          } catch (saveErr) {
            // if save fails (rules/network), treat as skipped
            console.warn("[calendar][skip-conflicts] save failed, skipping:", saveErr);
            skippedCount++;
          }
        }
  
        if (created.length) _upsertManyLocal(created);
  
        // cleanup state
        try {
          state.copyingDayShifts = [];
          state.copyingWeekShifts = [];
          state.isDragWeekCopy = false;
          state.sourceWeekIndex = null;
          state.pendingCrossMonthDrag = null;
        } catch (_) {}
  
        try {
          if (_weekCleanup) _weekCleanup();
        } catch (_) {}
  
        try {
          if (typeof announceForScreenReader === "function") {
            announceForScreenReader(`Copied ${createdCount} events. Skipped ${skippedCount} conflicts.`);
          }
        } catch (_) {}
  
        try {
          if (typeof renderCalendar === "function") renderCalendar();
        } catch (_) {}
  
        return { created: createdCount, skipped: skippedCount, moved: 0 };
      }
  
      // MOVE batch: create non-conflicting copies on targetDate then delete originals for moved ones only
      if (!targetDate) return { created: 0, skipped: batch.length, moved: 0 };
  
      const created = [];
      const movedOriginalIds = [];
  
      for (const shift of batch) {
        // if conflict exists at destination, skip silently (do NOT delete original)
        if (_hasConflictFor(targetDate, shift.employeeId, null)) {
          skippedCount++;
          continue;
        }
  
        const newShiftData = {
          date: targetDate,
          employeeId: shift.employeeId,
          startTime: shift.startTime,
          endTime: shift.endTime,
          type: shift.type,
          theme: shift.theme,
          location: shift.location,
          notes: shift.notes,
        };
  
        try {
          const newId = await _normalSave(newShiftData);
          const newShift = { ...newShiftData, id: newId };
  
          try {
            if (state.collapsedShifts?.has?.(shift.id)) state.collapsedShifts.add(newShift.id);
          } catch (_) {}
  
          created.push(newShift);
          movedOriginalIds.push(shift.id);
          movedCount++;
        } catch (saveErr) {
          console.warn("[calendar][skip-conflicts] move-save failed, skipping:", saveErr);
          skippedCount++;
        }
      }
  
      if (movedOriginalIds.length) {
        try {
          await Promise.all(movedOriginalIds.map((id) => deleteShiftFromFirebase(id)));
        } catch (delErr) {
          console.error("[calendar][skip-conflicts] delete originals failed:", delErr);
          // If deletes fail, we still keep UI consistent with what we *did* create,
          // but we should not remove locals unless deletes succeeded. So: bail early.
          alert("Some events were created, but deleting originals failed. Please refresh to verify.");
          if (created.length) _upsertManyLocal(created);
          try {
            if (typeof renderCalendar === "function") renderCalendar();
          } catch (_) {}
          return { created: created.length, skipped: skippedCount, moved: movedCount };
        }
  
        // update local after successful delete
        _removeIdsLocal(movedOriginalIds);
      }
  
      if (created.length) _upsertManyLocal(created);
  
      // cleanup state
      try {
        state.movingDayShifts = [];
        state.movingWeekShifts = [];
        state.isDragWeekMove = false;
        state.isDragDayMove = false;
        state.sourceWeekIndex = null;
        state.sourceDateStr = null;
        state.pendingCrossMonthDrag = null;
      } catch (_) {}
  
      try {
        if (typeof announceForScreenReader === "function") {
          announceForScreenReader(`Moved ${movedCount} events. Skipped ${skippedCount} conflicts.`);
        }
      } catch (_) {}
  
      try {
        if (typeof renderCalendar === "function") renderCalendar();
      } catch (_) {}
  
      return { created: 0, skipped: skippedCount, moved: movedCount };
    }
  
    async function _applyGlobalMoveOperationOverride() {
      const op = _ensureGlobalMoveOperation();
      if (!op || !op.active) return;
  
      // ✅ HARD GUARD: prevent double-run from multiple listeners / double-clicks
      if (window.__CALENDAR_OVERRIDE_BUSY__) return;
      window.__CALENDAR_OVERRIDE_BUSY__ = true;
  
      // ✅ Mark inactive immediately so any re-entrant call becomes a no-op
      op.active = false;
  
      // snapshot payload (so later mutations don’t affect this run)
      const snap = {
        shiftId: op.shiftId,
        targetDate: op.targetDate,
        sourceDateStr: op.sourceDateStr,
        shifts: Array.isArray(op.shifts) ? op.shifts.slice() : null,
        isCopy: !!op.isCopy,
        isBatch: !!op.isBatch,
        mode: op.mode || null,
        _weekCopyCleanup: typeof op._weekCopyCleanup === "function" ? op._weekCopyCleanup : null,
      };
  
      try {
        if (snap.shiftId && snap.targetDate) {
          await _applyOverrideForSingleShift(snap);
        } else if (Array.isArray(snap.shifts) && (snap.targetDate || (snap.isCopy && snap.shifts.length > 0))) {
          await _applyOverrideForDayBatch(snap);
        } else {
          alert("Nothing to override. Please try again.");
        }
  
        // ✅ Close warning modal on success
        try {
          if (typeof window.closeWarningModal === "function") window.closeWarningModal();
        } catch (_) {}
      } catch (err) {
        console.error("[calendar] override apply failed:", err);
        alert("Could not complete the override. Please try again.");
      } finally {
        _resetGlobalMoveOperation();
        window.__CALENDAR_OVERRIDE_BUSY__ = false;
      }
    }
  
    // ✅ Expose BOTH hooks for modal-handlers.js
    window._applyGlobalMoveOperationOverride = _applyGlobalMoveOperationOverride;
    window.executeOverrideFromGlobalMoveOperation = function executeOverrideFromGlobalMoveOperation() {
      return _applyGlobalMoveOperationOverride();
    };
  
    // ✅ Expose SKIP CONFLICTS hook for modal-handlers.js
    window.executeSkipConflictsFromGlobalMoveOperation = async function executeSkipConflictsFromGlobalMoveOperation() {
      const op = _ensureGlobalMoveOperation();
      if (!op || !op.active) return;
  
      if (window.__CALENDAR_OVERRIDE_BUSY__) return;
      window.__CALENDAR_OVERRIDE_BUSY__ = true;
  
      // mark inactive immediately
      op.active = false;
  
      const snap = {
        targetDate: op.targetDate,
        sourceDateStr: op.sourceDateStr,
        shifts: Array.isArray(op.shifts) ? op.shifts.slice() : null,
        isCopy: !!op.isCopy,
        isBatch: !!op.isBatch,
        mode: op.mode || null,
        _weekCopyCleanup: typeof op._weekCopyCleanup === "function" ? op._weekCopyCleanup : null,
      };
  
      try {
        // only meaningful for batch
        if (!snap.isBatch || !Array.isArray(snap.shifts) || !snap.shifts.length) {
          try {
            if (typeof window.closeWarningModal === "function") window.closeWarningModal();
          } catch (_) {}
          return;
        }
  
        await _applySkipConflictsForBatch(snap);
  
        try {
          if (typeof window.closeWarningModal === "function") window.closeWarningModal();
        } catch (_) {}
      } catch (err) {
        console.error("[calendar] skip-conflicts failed:", err);
        alert("Could not skip conflicts. Please try again.");
      } finally {
        _resetGlobalMoveOperation();
        window.__CALENDAR_OVERRIDE_BUSY__ = false;
      }
    };
  
    // Optional: legacy direct wiring (kept lightweight / non-invasive)
    function _wireConflictOverrideButtonsOnce() {
      // If modal-handlers is installed, it already captures proceed clicks in capture phase
      // and calls handleProceedAnyway(). We can still wire cancel safely, and proceed as fallback.
      const proceedBtn = _getProceedConflictBtn();
      const cancelBtn = _getCancelConflictBtn();
      const elements = _getElements();
  
      if (cancelBtn && cancelBtn.getAttribute("data-override-wired") !== "1") {
        cancelBtn.setAttribute("data-override-wired", "1");
        cancelBtn.addEventListener(
          "click",
          (e) => {
            try {
              e?.preventDefault?.();
              e?.stopPropagation?.();
              if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
            } catch (_) {}
  
            _resetGlobalMoveOperation();
  
            try {
              if (typeof window.closeWarningModal === "function") window.closeWarningModal();
              else if (elements?.warningModal) {
                elements.warningModal.style.display = "none";
                elements.warningModal.setAttribute("aria-hidden", "true");
              }
            } catch (_) {}
          },
          true
        );
      }
  
      // Proceed fallback ONLY if modal-handlers isn't present
      if (typeof window.handleProceedAnyway !== "function") {
        if (proceedBtn && proceedBtn.getAttribute("data-override-wired") !== "1") {
          proceedBtn.setAttribute("data-override-wired", "1");
          proceedBtn.addEventListener(
            "click",
            async (e) => {
              try {
                e?.preventDefault?.();
                proceedBtn.disabled = true;
                await _applyGlobalMoveOperationOverride();
              } finally {
                try {
                  proceedBtn.disabled = false;
                } catch (_) {}
              }
            },
            true
          );
        }
      }
    }
  
    (function _initConflictOverrideWiring() {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", _wireConflictOverrideButtonsOnce);
      } else {
        _wireConflictOverrideButtonsOnce();
      }
    })();
  
    /* =========================
     *  DRAG START
     * ========================= */
    function handleDragStart(e) {
      const elements = _getElements();
      const state = _getState();
      _ensureStateArrays(state);
  
      console.log("Drag start event target:", e.target);
      console.log("Drag start event target classList:", e.target.classList);
  
      _ensureShiftsArray();
  
      if (elements.prevMonthDropzone && elements.nextMonthDropzone) {
        elements.prevMonthDropzone.style.display = "flex";
        elements.nextMonthDropzone.style.display = "flex";
        elements.prevMonthDropzone.style.opacity = "0.3";
        elements.nextMonthDropzone.style.opacity = "0.3";
      }
  
      if (e.target.classList.contains("drag-day-button")) {
        const dateStr = e.target.getAttribute("data-date");
        if (!dateStr) return;
  
        state.isDragCopy = false;
        state.isDragDayMove = true;
        state.isDragWeekCopy = false;
        state.isDragWeekMove = false;
  
        const dayShifts = getShiftsForDate(dateStr).filter(
          (shift) =>
            (state.filters.employee === "all" || state.filters.employee === shift.employeeId) &&
            (state.filters.eventType === "all" || state.filters.eventType === shift.type) &&
            (state.filters.location === "all" || state.filters.location === shift.location)
        );
  
        if (dayShifts.length === 0) {
          console.log("No shifts to move on this date");
          return;
        }
  
        state.movingDayShifts = dayShifts;
        state.sourceDateStr = dateStr;
  
        const ghostContainer = document.createElement("div");
        ghostContainer.style.position = "absolute";
        ghostContainer.style.top = "-1000px";
        ghostContainer.style.opacity = "0.7";
        ghostContainer.style.border = "1px solid var(--border-color)";
        ghostContainer.style.pointerEvents = "none";
        ghostContainer.style.background = "var(--input-bg)";
        ghostContainer.style.padding = "5px";
        ghostContainer.style.maxWidth = "250px";
        ghostContainer.style.borderRadius = "4px";
        ghostContainer.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.3)";
        ghostContainer.style.transform = "scale(0.95)";
  
        dayShifts.forEach((shift) => {
          const ghostShift = document.createElement("div");
          ghostShift.classList.add("shift", shift.type);
          ghostShift.style.marginBottom = "5px";
          ghostShift.style.opacity = "1";
          ghostShift.style.padding = "8px";
          ghostShift.style.borderRadius = "4px";
          ghostShift.style.background = "var(--input-bg)";
          ghostShift.style.boxShadow = "var(--shadow)";
          ghostShift.classList.add("collapsed");
  
          const em = employeesMap();
          ghostShift.innerHTML = `
            <div class="employee">${escapeHTML(em[shift.employeeId] || "Unknown Host")}</div>
            <div class="event-type">${escapeHTML(eventTypes[shift.type] || shift.type)}</div>
          `;
  
          ghostContainer.appendChild(ghostShift);
        });
  
        document.body.appendChild(ghostContainer);
        e.dataTransfer.setDragImage(ghostContainer, 20, 20);
  
        setTimeout(() => {
          try {
            document.body.removeChild(ghostContainer);
          } catch (_) {}
        }, 100);
  
        e.dataTransfer.setData("application/x-move-day", dateStr);
        e.dataTransfer.effectAllowed = "move";
  
        announceForScreenReader(`Started moving ${dayShifts.length} events. Drop on another date to move them.`);
  
        e.stopPropagation();
        return;
      }
  
      if (e.target.classList.contains("week-move-button")) {
        const weekIndex = parseInt(e.target.getAttribute("data-week-index"));
        if (isNaN(weekIndex)) return;
  
        console.log("Starting week move operation for week index:", weekIndex);
  
        state.isDragCopy = false;
        state.isDragWeekCopy = false;
        state.isDragWeekMove = true;
        state.isDragDayMove = false;
        state.sourceWeekIndex = weekIndex;
        state.movingWeekShifts = [];
  
        const weekShifts = getShiftsForWeek(weekIndex);
  
        if (weekShifts.length === 0) {
          console.log("No shifts to move in this week");
          return;
        }
  
        state.movingWeekShifts = weekShifts;
  
        const ghostContainer = document.createElement("div");
        ghostContainer.style.position = "absolute";
        ghostContainer.style.top = "-1000px";
        ghostContainer.style.opacity = "0.7";
        ghostContainer.style.border = "1px solid var(--border-color)";
        ghostContainer.style.pointerEvents = "none";
        ghostContainer.style.background = "var(--input-bg)";
        ghostContainer.style.padding = "5px";
        ghostContainer.style.maxWidth = "250px";
        ghostContainer.style.borderRadius = "4px";
        ghostContainer.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.3)";
        ghostContainer.style.transform = "scale(0.95)";
  
        weekShifts.slice(0, 5).forEach((shift) => {
          const ghostShift = document.createElement("div");
          ghostShift.classList.add("shift", shift.type);
          ghostShift.style.marginBottom = "5px";
          ghostShift.style.opacity = "1";
          ghostShift.style.padding = "8px";
          ghostShift.style.borderRadius = "4px";
          ghostShift.style.background = "var(--input-bg)";
          ghostShift.style.boxShadow = "var(--shadow)";
          ghostShift.classList.add("collapsed");
  
          const em = employeesMap();
          ghostShift.innerHTML = `
            <div class="employee">${escapeHTML(em[shift.employeeId] || "Unknown Host")}</div>
            <div class="event-type">${escapeHTML(eventTypes[shift.type] || shift.type)}</div>
          `;
  
          ghostContainer.appendChild(ghostShift);
        });
  
        if (weekShifts.length > 5) {
          const countElement = document.createElement("div");
          countElement.style.textAlign = "center";
          countElement.style.marginTop = "5px";
          countElement.style.color = "var(--text-secondary)";
          countElement.textContent = `+ ${weekShifts.length - 5} more events`;
          ghostContainer.appendChild(countElement);
        }
  
        document.body.appendChild(ghostContainer);
        e.dataTransfer.setDragImage(ghostContainer, 20, 20);
  
        setTimeout(() => {
          try {
            document.body.removeChild(ghostContainer);
          } catch (_) {}
        }, 100);
  
        e.dataTransfer.setData("application/x-move-week", weekIndex.toString());
        e.dataTransfer.effectAllowed = "move";
  
        announceForScreenReader(`Started moving week with ${weekShifts.length} events. Drop on another week to move.`);
  
        e.stopPropagation();
        return;
      }
  
      if (e.target.classList.contains("week-copy-button")) {
        const weekIndex = parseInt(e.target.getAttribute("data-week-index"));
        if (isNaN(weekIndex)) return;
  
        console.log("Starting week copy operation for week index:", weekIndex);
  
        state.isDragCopy = true;
        state.isDragWeekCopy = true;
        state.isDragWeekMove = false;
        state.sourceWeekIndex = weekIndex;
        state.copyingWeekShifts = [];
  
        const weekShifts = getShiftsForWeek(weekIndex);
  
        if (weekShifts.length === 0) {
          console.log("No shifts to copy in this week");
          return;
        }
  
        state.copyingWeekShifts = weekShifts;
  
        const ghostContainer = document.createElement("div");
        ghostContainer.style.position = "absolute";
        ghostContainer.style.top = "-1000px";
        ghostContainer.style.opacity = "0.7";
        ghostContainer.style.border = "1px solid var(--border-color)";
        ghostContainer.style.pointerEvents = "none";
        ghostContainer.style.background = "var(--input-bg)";
        ghostContainer.style.padding = "5px";
        ghostContainer.style.maxWidth = "250px";
        ghostContainer.style.borderRadius = "4px";
        ghostContainer.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.3)";
        ghostContainer.style.transform = "scale(0.95)";
  
        weekShifts.slice(0, 5).forEach((shift) => {
          const ghostShift = document.createElement("div");
          ghostShift.classList.add("shift", shift.type);
          ghostShift.style.marginBottom = "5px";
          ghostShift.style.opacity = "1";
          ghostShift.style.padding = "8px";
          ghostShift.style.borderRadius = "4px";
          ghostShift.style.background = "var(--input-bg)";
          ghostShift.style.boxShadow = "var(--shadow)";
          ghostShift.classList.add("collapsed");
  
          const em = employeesMap();
          ghostShift.innerHTML = `
            <div class="employee">${escapeHTML(em[shift.employeeId] || "Unknown Host")}</div>
            <div class="event-type">${escapeHTML(eventTypes[shift.type] || shift.type)}</div>
          `;
  
          ghostContainer.appendChild(ghostShift);
        });
  
        if (weekShifts.length > 5) {
          const countElement = document.createElement("div");
          countElement.style.textAlign = "center";
          countElement.style.marginTop = "5px";
          countElement.style.color = "var(--text-secondary)";
          countElement.textContent = `+ ${weekShifts.length - 5} more events`;
          ghostContainer.appendChild(countElement);
        }
  
        document.body.appendChild(ghostContainer);
        e.dataTransfer.setDragImage(ghostContainer, 20, 20);
  
        setTimeout(() => {
          try {
            document.body.removeChild(ghostContainer);
          } catch (_) {}
        }, 100);
  
        e.dataTransfer.setData("application/x-copy-week", weekIndex.toString());
        e.dataTransfer.effectAllowed = "copy";
  
        announceForScreenReader(`Started copying week with ${weekShifts.length} events. Drop on another week to create copies.`);
  
        e.stopPropagation();
        return;
      }
  
      if (e.target.classList.contains("cell-copy-button")) {
        const dateStr = e.target.getAttribute("data-date");
        if (!dateStr) return;
  
        state.isDragCopy = true;
        state.isDragWeekCopy = false;
        state.isDragWeekMove = false;
  
        const dayShifts = getShiftsForDate(dateStr).filter(
          (shift) =>
            (state.filters.employee === "all" || state.filters.employee === shift.employeeId) &&
            (state.filters.eventType === "all" || state.filters.eventType === shift.type) &&
            (state.filters.location === "all" || state.filters.location === shift.location)
        );
  
        if (dayShifts.length === 0) {
          console.log("No shifts to copy on this date");
          return;
        }
  
        state.copyingDayShifts = dayShifts;
  
        const ghostContainer = document.createElement("div");
        ghostContainer.style.position = "absolute";
        ghostContainer.style.top = "-1000px";
        ghostContainer.style.opacity = "0.7";
        ghostContainer.style.border = "1px solid var(--border-color)";
        ghostContainer.style.pointerEvents = "none";
        ghostContainer.style.background = "var(--input-bg)";
        ghostContainer.style.padding = "5px";
        ghostContainer.style.maxWidth = "250px";
        ghostContainer.style.borderRadius = "4px";
        ghostContainer.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.3)";
        ghostContainer.style.transform = "scale(0.95)";
  
        dayShifts.forEach((shift) => {
          const ghostShift = document.createElement("div");
          ghostShift.classList.add("shift", shift.type);
          ghostShift.style.marginBottom = "5px";
          ghostShift.style.opacity = "1";
          ghostShift.style.padding = "8px";
          ghostShift.style.borderRadius = "4px";
          ghostShift.style.background = "var(--input-bg)";
          ghostShift.style.boxShadow = "var(--shadow)";
          ghostShift.classList.add("collapsed");
  
          const em = employeesMap();
          ghostShift.innerHTML = `
            <div class="employee">${escapeHTML(em[shift.employeeId] || "Unknown Host")}</div>
            <div class="event-type">${escapeHTML(eventTypes[shift.type] || shift.type)}</div>
          `;
  
          ghostContainer.appendChild(ghostShift);
        });
  
        document.body.appendChild(ghostContainer);
        e.dataTransfer.setDragImage(ghostContainer, 20, 20);
  
        setTimeout(() => {
          try {
            document.body.removeChild(ghostContainer);
          } catch (_) {}
        }, 100);
  
        e.dataTransfer.setData("application/x-copy-day", dateStr);
        e.dataTransfer.effectAllowed = "copy";
  
        announceForScreenReader(`Started copying ${dayShifts.length} events. Drop on another date to create copies.`);
  
        e.stopPropagation();
        return;
      }
  
      const copyButton = e.target.closest(".copy-button");
      const shiftElement = e.target.closest(".shift");
  
      console.log("Drag started from copy button?", copyButton !== null);
      console.log("Drag started from shift?", shiftElement !== null);
  
      state.draggedShiftId = null;
      state.pendingShiftData = null;
      state.isDragCopy = false;
      state.copyingDayShifts = [];
  
      if (!shiftElement) {
        console.log("No shift element found, aborting drag");
        return;
      }
  
      const isCopyOperation = copyButton !== null;
  
      state.isDragCopy = isCopyOperation;
      console.log("Setting isDragCopy state to:", isCopyOperation);
  
      const shiftId = shiftElement.getAttribute("data-id");
      if (!shiftId) {
        console.error("Invalid shift ID:", shiftElement.getAttribute("data-id"));
        return;
      }
  
      console.log(`Started dragging shift ID: ${shiftId}, Copy operation: ${isCopyOperation}`);
  
      if (isCopyOperation) {
        console.log("Creating ghost element for copy operation");
        const ghostElement = shiftElement.cloneNode(true);
        document.body.appendChild(ghostElement);
  
        ghostElement.style.position = "absolute";
        ghostElement.style.top = "-1000px";
        ghostElement.style.opacity = "0.5";
        ghostElement.style.border = "1px dashed #3699ff";
        ghostElement.style.pointerEvents = "none";
  
        e.dataTransfer.setDragImage(ghostElement, 20, 20);
  
        setTimeout(() => {
          try {
            document.body.removeChild(ghostElement);
          } catch (_) {}
        }, 100);
  
        console.log("Copy operation - original element left untouched");
      } else {
        shiftElement.classList.add("dragging");
        console.log("Move operation - added dragging class to original");
      }
  
      if (isCopyOperation) {
        e.dataTransfer.setData("application/x-copy-shift", shiftId);
        e.dataTransfer.effectAllowed = "copy";
        console.log("Set dataTransfer for COPY operation");
      } else {
        e.dataTransfer.setData("application/x-move-shift", shiftId);
        e.dataTransfer.effectAllowed = "move";
        console.log("Set dataTransfer for MOVE operation");
      }
  
      e.dataTransfer.setData("text/plain", shiftId);
  
      state.draggedShiftId = shiftId;
  
      if (isCopyOperation) {
        announceForScreenReader("Started copying event. Drop on another date to create a copy.");
      } else {
        announceForScreenReader("Started dragging event. Drop on another date to move it.");
      }
  
      e.stopPropagation();
    }
  
    /* =========================
     *  DRAG OVER
     * ========================= */
    function handleDragOver(e) {
      const elements = _getElements();
      const state = _getState();
      _ensureStateArrays(state);
  
      e.preventDefault();
  
      if (
        state.draggedShiftId === null &&
        state.copyingDayShifts.length === 0 &&
        state.copyingWeekShifts.length === 0 &&
        (state.movingDayShifts?.length || 0) === 0 &&
        (state.movingWeekShifts?.length || 0) === 0
      )
        return;
  
      const calEl = document.querySelector(".calendar-container");
      if (!calEl) return;
  
      const calendarRect = calEl.getBoundingClientRect();
      const mouseX = e.clientX;
      const thresholdLeft = calendarRect.left + 40;
      const thresholdRight = calendarRect.right - 40;
  
      if (elements.prevMonthDropzone?.style?.display !== "flex") {
        elements.prevMonthDropzone.style.display = "flex";
        elements.prevMonthDropzone.style.opacity = "0.3";
      }
      if (elements.nextMonthDropzone?.style?.display !== "flex") {
        elements.nextMonthDropzone.style.display = "flex";
        elements.nextMonthDropzone.style.opacity = "0.3";
      }
  
      if (mouseX > thresholdLeft && mouseX < thresholdRight) {
        elements.prevMonthDropzone?.classList?.remove("active");
        elements.nextMonthDropzone?.classList?.remove("active");
        clearTimeout(state.monthNavigationTimer);
        state.isHoveringPrevMonth = false;
        state.isHoveringNextMonth = false;
      } else if (mouseX <= thresholdLeft) {
        elements.prevMonthDropzone?.classList?.add("active");
        elements.nextMonthDropzone?.classList?.remove("active");
  
        if (!state.isHoveringPrevMonth) {
          state.isHoveringPrevMonth = true;
          state.isHoveringNextMonth = false;
  
          clearTimeout(state.monthNavigationTimer);
          state.monthNavigationTimer = setTimeout(() => {
            handleCrossMonthDragNavigation("prev");
          }, 800);
        }
  
        e.dataTransfer.dropEffect = state.isDragCopy ? "copy" : "move";
        return;
      } else if (mouseX >= thresholdRight) {
        elements.nextMonthDropzone?.classList?.add("active");
        elements.prevMonthDropzone?.classList?.remove("active");
  
        if (!state.isHoveringNextMonth) {
          state.isHoveringNextMonth = true;
          state.isHoveringPrevMonth = false;
  
          clearTimeout(state.monthNavigationTimer);
          state.monthNavigationTimer = setTimeout(() => {
            handleCrossMonthDragNavigation("next");
          }, 800);
        }
  
        e.dataTransfer.dropEffect = state.isDragCopy ? "copy" : "move";
        return;
      }
  
      if (state.isDragWeekCopy || state.isDragWeekMove) {
        const cell = findCellFromEvent(e);
        if (!cell) return;
  
        const row = cell.closest("tr");
        if (!row) return;
  
        const weekIndex = parseInt(row.getAttribute("data-week-index"));
        if (isNaN(weekIndex)) return;
  
        if (weekIndex === state.sourceWeekIndex && !state.pendingCrossMonthDrag) return;
  
        if (row !== state.currentHoveredRow) {
          if (state.currentHoveredRow) {
            state.currentHoveredRow.classList.remove("drag-over-row");
          }
  
          row.classList.add("drag-over-row");
          state.currentHoveredRow = row;
        }
  
        e.dataTransfer.dropEffect = state.isDragWeekCopy ? "copy" : "move";
        return;
      }
  
      const cell = findCellFromEvent(e);
  
      if (!cell || cell.classList.contains("other-month")) {
        if (state.currentHoveredCell) {
          state.currentHoveredCell.classList.remove("drag-over");
          state.currentHoveredCell = null;
        }
        return;
      }
  
      if (cell !== state.currentHoveredCell) {
        if (state.currentHoveredCell) {
          state.currentHoveredCell.classList.remove("drag-over");
        }
  
        cell.classList.add("drag-over");
        state.currentHoveredCell = cell;
      }
  
      if (state.isDragDayMove) {
        e.dataTransfer.dropEffect = "move";
      } else {
        e.dataTransfer.dropEffect = state.isDragCopy ? "copy" : "move";
      }
    }
  
    /* =========================
     *  DRAG END
     * ========================= */
    function handleDragEnd(e) {
      const state = _getState();
      _ensureStateArrays(state);
  
      const shiftElement = e.target.closest(".shift");
      if (shiftElement) {
        if (!state.isDragCopy) {
          shiftElement.classList.remove("dragging");
        }
      }
  
      state.draggedShiftId = null;
      state.isDragCopy = false;
      state.isDragWeekCopy = false;
      state.isDragWeekMove = false;
      state.isDragDayMove = false;
      state.copyingDayShifts = [];
      state.copyingWeekShifts = [];
      state.movingDayShifts = [];
      state.movingWeekShifts = [];
      state.sourceWeekIndex = null;
      state.sourceDateStr = null;
  
      state.pendingCrossMonthDrag = null;
      clearTimeout(state.monthNavigationTimer);
      state.isHoveringPrevMonth = false;
      state.isHoveringNextMonth = false;
  
      if (typeof hideMonthNavigationDropzones === "function") hideMonthNavigationDropzones();
  
      document.querySelectorAll(".calendar td").forEach((cell) => {
        cell.classList.remove("drag-over");
      });
  
      document.querySelectorAll(".calendar tr").forEach((row) => {
        row.classList.remove("drag-over-row");
      });
  
      state.currentHoveredCell = null;
      state.currentHoveredRow = null;
  
      announceForScreenReader("Stopped dragging event.");
  
      e.stopPropagation();
    }
  
    /* =========================
     *  DOM HIT-TEST UTIL
     * ========================= */
    function findCellFromEvent(e) {
      let element = document.elementFromPoint(e.clientX, e.clientY);
  
      while (element && element.tagName !== "TD") {
        element = element.parentElement;
  
        if (!element || element === document.body) {
          return null;
        }
      }
  
      return element;
    }
  
    /* =========================
     *  DROP HANDLER
     * ========================= */
    function handleDrop(e) {
      e.preventDefault();
      _ensureShiftsArray();
  
      const state = _getState();
      _ensureStateArrays(state);
  
      if (typeof hideMonthNavigationDropzones === "function") hideMonthNavigationDropzones();
  
      const sourceWeekMoveIndex = e.dataTransfer.getData("application/x-move-week");
      if (sourceWeekMoveIndex && state.isDragWeekMove && state.movingWeekShifts.length > 0) {
        const cell = findCellFromEvent(e);
        if (!cell) return;
  
        const targetRow = cell.closest("tr");
        if (!targetRow) return;
  
        if (state.currentHoveredRow) {
          state.currentHoveredRow.classList.remove("drag-over-row");
        }
  
        const targetWeekIndex = parseInt(targetRow.getAttribute("data-week-index"));
        if (isNaN(targetWeekIndex)) return;
  
        console.log(`Dropping week move from week ${sourceWeekMoveIndex} to week ${targetWeekIndex}`);
  
        const isCrossMonthOperation = state.pendingCrossMonthDrag !== null;
  
        if (parseInt(sourceWeekMoveIndex) === targetWeekIndex && !isCrossMonthOperation) {
          console.log("Cannot move to the same week in the same month");
          return;
        }
  
        let dateMapping;
  
        if (isCrossMonthOperation && state.pendingCrossMonthDrag.sourceDates) {
          console.log("Creating cross-month date mapping for week move");
          dateMapping = getCrossMonthWeekDateMapping(targetWeekIndex);
        } else {
          dateMapping = getWeekDateMapping(parseInt(sourceWeekMoveIndex), targetWeekIndex);
        }
  
        if (!dateMapping) {
          console.error("Could not create date mapping for week move");
          return;
        }
  
        console.log("Date mapping for week move:", dateMapping);
  
        const originalShiftIds = state.movingWeekShifts.map((shift) => shift.id);
  
        const newShifts = [];
        const savePromises = [];
  
        state.movingWeekShifts.forEach((shift) => {
          const targetDate = dateMapping[shift.date];
          if (!targetDate) {
            console.log(`No mapping found for date ${shift.date}`);
            return;
          }
  
          const newShiftData = {
            date: targetDate,
            employeeId: shift.employeeId,
            startTime: shift.startTime,
            endTime: shift.endTime,
            type: shift.type,
            theme: shift.theme,
            location: shift.location,
            notes: shift.notes,
          };
  
          savePromises.push(
            saveShiftToFirebase(newShiftData).then((newId) => {
              const newShift = { ...newShiftData, id: newId };
  
              if (state.collapsedShifts?.has?.(shift.id)) {
                state.collapsedShifts.add(newShift.id);
              }
  
              newShifts.push(newShift);
              return newShift;
            })
          );
        });
  
        Promise.all(savePromises)
          .then(() => {
            const deletePromises = originalShiftIds.map((shiftId) => deleteShiftFromFirebase(shiftId));
            return Promise.all(deletePromises);
          })
          .then(() => {
            _removeIdsLocal(originalShiftIds);
            _upsertManyLocal(newShifts);
  
            state.movingWeekShifts = [];
            state.isDragWeekMove = false;
            state.sourceWeekIndex = null;
            state.pendingCrossMonthDrag = null;
  
            announceForScreenReader(`Moved ${newShifts.length} events to week ${targetWeekIndex + 1}`);
            renderCalendar();
          })
          .catch((error) => {
            console.error("Error moving shifts:", error);
            alert("Could not move some shifts. Please try again later.");
          });
  
        return;
      }
  
      const sourceWeekIndex = e.dataTransfer.getData("application/x-copy-week");
      if (sourceWeekIndex && state.isDragWeekCopy && state.copyingWeekShifts.length > 0) {
        const cell = findCellFromEvent(e);
        if (!cell) return;
  
        const targetRow = cell.closest("tr");
        if (!targetRow) return;
  
        if (state.currentHoveredRow) {
          state.currentHoveredRow.classList.remove("drag-over-row");
        }
  
        const targetWeekIndex = parseInt(targetRow.getAttribute("data-week-index"));
        if (isNaN(targetWeekIndex)) return;
  
        console.log(`Dropping week copy from week ${sourceWeekIndex} to week ${targetWeekIndex}`);
  
        const isCrossMonthOperation = state.pendingCrossMonthDrag !== null;
  
        if (parseInt(sourceWeekIndex) === targetWeekIndex && !isCrossMonthOperation) {
          console.log("Cannot copy to the same week in the same month");
          return;
        }
  
        let dateMapping;
  
        if (isCrossMonthOperation && state.pendingCrossMonthDrag.sourceDates) {
          console.log("Creating cross-month date mapping for week copy");
          dateMapping = getCrossMonthWeekDateMapping(targetWeekIndex);
        } else {
          dateMapping = getWeekDateMapping(parseInt(sourceWeekIndex), targetWeekIndex);
        }
  
        if (!dateMapping) {
          console.error("Could not create date mapping for week copy");
          return;
        }
  
        console.log("Date mapping for week copy:", dateMapping);
  
        // ✅ Conflict check before copying week
        let hasWeekConflicts = false;
        let conflictWeekEmployeeId = null;
        const mappedWeekShifts = [];
  
        state.copyingWeekShifts.forEach((shift) => {
          const targetDate = dateMapping[shift.date];
          if (!targetDate) return;
          mappedWeekShifts.push({ ...shift, _targetDate: targetDate });
          const conflicts = checkForDoubleBooking({ date: targetDate, employeeId: shift.employeeId });
          if (conflicts.length > 0) {
            hasWeekConflicts = true;
            conflictWeekEmployeeId = shift.employeeId;
          }
        });
  
        if (hasWeekConflicts) {
          // Build a batch op the override/skip system understands
          const batchShifts = mappedWeekShifts.map((s) => ({ ...s, date: s._targetDate }));
          const op = _ensureGlobalMoveOperation();
          op.targetDate = null; // week batch uses op.shifts
          op.shifts = batchShifts;
          op.active = true;
          op.isCopy = true;
          op.shiftId = null;
          op.sourceDateStr = null;
  
          // ✅ mark batch metadata so modal-handlers shows Skip Conflicts
          op.isBatch = true;
          op.mode = "week-copy";
          op.allowSkipConflicts = true;
  
          op._weekCopyCleanup = () => {
            state.copyingWeekShifts = [];
            state.isDragWeekCopy = false;
            state.sourceWeekIndex = null;
            state.pendingCrossMonthDrag = null;
          };
  
          _wireConflictOverrideButtonsOnce();
          showSimplifiedWarning(conflictWeekEmployeeId);
          return;
        }
  
        const newShifts = [];
        const savePromises = [];
  
        mappedWeekShifts.forEach((shift) => {
          const newShiftData = {
            date: shift._targetDate,
            employeeId: shift.employeeId,
            startTime: shift.startTime,
            endTime: shift.endTime,
            type: shift.type,
            theme: shift.theme,
            location: shift.location,
            notes: shift.notes,
          };
  
          savePromises.push(
            saveShiftToFirebase(newShiftData).then((newId) => {
              const newShift = { ...newShiftData, id: newId };
  
              if (state.collapsedShifts?.has?.(shift.id)) {
                state.collapsedShifts.add(newShift.id);
              }
  
              newShifts.push(newShift);
              return newShift;
            })
          );
        });
  
        Promise.all(savePromises)
          .then(() => {
            _upsertManyLocal(newShifts);
  
            state.copyingWeekShifts = [];
            state.isDragWeekCopy = false;
            state.sourceWeekIndex = null;
            state.pendingCrossMonthDrag = null;
  
            announceForScreenReader(`Copied ${newShifts.length} events to week ${targetWeekIndex + 1}`);
            renderCalendar();
          })
          .catch((error) => {
            console.error("Error saving shifts to Firebase:", error);
            alert("Could not save some shifts. Please try again later.");
          });
  
        return;
      }
  
      const cell = findCellFromEvent(e);
  
      if (!cell || cell.classList.contains("other-month")) {
        return;
      }
  
      if (state.currentHoveredCell) {
        state.currentHoveredCell.classList.remove("drag-over");
      }
  
      const targetDate = cell.getAttribute("data-date");
  
      const sourceMoveDate = e.dataTransfer.getData("application/x-move-day");
      if (sourceMoveDate && state.isDragDayMove && state.movingDayShifts && state.movingDayShifts.length > 0) {
        if (sourceMoveDate === targetDate) return;
  
        let hasConflicts = false;
        let conflictEmployeeId = null;
  
        state.movingDayShifts.forEach((shift) => {
          const conflictCheck = { date: targetDate, employeeId: shift.employeeId };
          const shiftConflicts = checkForDoubleBooking(conflictCheck);
          if (shiftConflicts.length > 0) {
            hasConflicts = true;
            conflictEmployeeId = shift.employeeId;
          }
        });
  
        if (hasConflicts) {
          const op = _ensureGlobalMoveOperation();
          op.sourceDateStr = sourceMoveDate;
          op.targetDate = targetDate;
          op.shifts = state.movingDayShifts;
          op.active = true;
          op.isCopy = false;
          op.shiftId = null;
  
          // ✅ mark batch metadata so modal-handlers shows Skip Conflicts
          op.isBatch = true;
          op.mode = "day-move";
          op.allowSkipConflicts = true;
  
          _wireConflictOverrideButtonsOnce();
          showSimplifiedWarning(conflictEmployeeId);
          return;
        }
  
        const newShifts = [];
        const savePromises = [];
        const originalShiftIds = state.movingDayShifts.map((shift) => shift.id);
  
        state.movingDayShifts.forEach((shift) => {
          const newShiftData = {
            date: targetDate,
            employeeId: shift.employeeId,
            startTime: shift.startTime,
            endTime: shift.endTime,
            type: shift.type,
            theme: shift.theme,
            location: shift.location,
            notes: shift.notes,
          };
  
          savePromises.push(
            saveShiftToFirebase(newShiftData).then((newId) => {
              const newShift = { ...newShiftData, id: newId };
  
              if (state.collapsedShifts?.has?.(shift.id)) {
                state.collapsedShifts.add(newShift.id);
              }
  
              newShifts.push(newShift);
              return newShift;
            })
          );
        });
  
        Promise.all(savePromises)
          .then(() => {
            const deletePromises = originalShiftIds.map((shiftId) => deleteShiftFromFirebase(shiftId));
            return Promise.all(deletePromises);
          })
          .then(() => {
            _removeIdsLocal(originalShiftIds);
            _upsertManyLocal(newShifts);
  
            state.movingDayShifts = [];
            state.isDragDayMove = false;
            state.sourceDateStr = null;
  
            announceForScreenReader(`Moved ${newShifts.length} events to ${getReadableDateString(new Date(targetDate))}`);
            renderCalendar();
          })
          .catch((error) => {
            console.error("Error moving shifts:", error);
            alert("Could not move some shifts. Please try again later.");
          });
  
        return;
      }
  
      const sourceDateStr = e.dataTransfer.getData("application/x-copy-day");
      if (sourceDateStr && state.copyingDayShifts.length > 0) {
        if (sourceDateStr === targetDate) return;
  
        let hasConflicts = false;
        let conflictEmployeeId = null;
  
        state.copyingDayShifts.forEach((shift) => {
          const conflictCheck = { date: targetDate, employeeId: shift.employeeId };
          const shiftConflicts = checkForDoubleBooking(conflictCheck);
          if (shiftConflicts.length > 0) {
            hasConflicts = true;
            conflictEmployeeId = shift.employeeId;
          }
        });
  
        if (hasConflicts) {
          const op = _ensureGlobalMoveOperation();
          op.sourceDateStr = sourceDateStr;
          op.targetDate = targetDate;
          op.shifts = state.copyingDayShifts;
          op.active = true;
          op.isCopy = true;
          op.shiftId = null;
  
          // ✅ mark batch metadata so modal-handlers shows Skip Conflicts
          op.isBatch = true;
          op.mode = "day-copy";
          op.allowSkipConflicts = true;
  
          _wireConflictOverrideButtonsOnce();
          showSimplifiedWarning(conflictEmployeeId);
          return;
        }
  
        const newShifts = [];
        const savePromises = [];
  
        state.copyingDayShifts.forEach((shift) => {
          const newShiftData = {
            date: targetDate,
            employeeId: shift.employeeId,
            startTime: shift.startTime,
            endTime: shift.endTime,
            type: shift.type,
            theme: shift.theme,
            location: shift.location,
            notes: shift.notes,
          };
  
          savePromises.push(
            saveShiftToFirebase(newShiftData).then((newId) => {
              const newShift = { ...newShiftData, id: newId };
  
              if (state.collapsedShifts?.has?.(shift.id)) {
                state.collapsedShifts.add(newShift.id);
              }
  
              newShifts.push(newShift);
              return newShift;
            })
          );
        });
  
        Promise.all(savePromises)
          .then(() => {
            _upsertManyLocal(newShifts);
            state.copyingDayShifts = [];
  
            announceForScreenReader(`Copied ${newShifts.length} events to ${getReadableDateString(new Date(targetDate))}`);
            renderCalendar();
          })
          .catch((error) => {
            console.error("Error saving shifts to Firebase:", error);
            alert("Could not save some shifts. Please try again later.");
          });
  
        return;
      }
  
      // ✅ Safer: detect copy by checking if the custom MIME types are present (not by truthiness)
      const hasCopyShift = !!e.dataTransfer.getData("application/x-copy-shift");
      const hasMoveShift = !!e.dataTransfer.getData("application/x-move-shift");
      const isCopyOperation = state.isDragCopy || (hasCopyShift && !hasMoveShift);
  
      let shiftId;
      if (isCopyOperation) {
        shiftId = e.dataTransfer.getData("application/x-copy-shift") || e.dataTransfer.getData("text/plain");
      } else {
        shiftId = e.dataTransfer.getData("application/x-move-shift") || e.dataTransfer.getData("text/plain");
      }
  
      if (!shiftId) return;
  
      const shiftsArr = _getShiftsArray();
      const shiftIndex = shiftsArr.findIndex((shift) => String(shift?.id) === String(shiftId));
      if (shiftIndex === -1) return;
  
      if (shiftsArr[shiftIndex].date === targetDate && !isCopyOperation) {
        return;
      }
  
      const draggedShift = shiftsArr[shiftIndex];
      const conflictCheck = { date: targetDate, employeeId: draggedShift.employeeId };
      const conflicts = checkForDoubleBooking(conflictCheck, isCopyOperation ? null : shiftId);
  
      if (conflicts.length > 0) {
        console.log(`Conflict detected for shift ${shiftId} to date ${targetDate}`);
  
        const op = _ensureGlobalMoveOperation();
        op.shiftId = shiftId;
        op.targetDate = targetDate;
        op.sourceDateStr = draggedShift.date || null;
        op.shifts = null;
        op.active = true;
        op.isCopy = isCopyOperation;
  
        // single-shift: NOT a batch, so skip button should remain hidden
        op.isBatch = false;
        op.mode = null;
  
        _wireConflictOverrideButtonsOnce();
        showSimplifiedWarning(draggedShift.employeeId);
        return;
      }
  
      if (isCopyOperation) {
        const newShiftData = {
          date: targetDate,
          employeeId: draggedShift.employeeId,
          startTime: draggedShift.startTime,
          endTime: draggedShift.endTime,
          type: draggedShift.type,
          theme: draggedShift.theme,
          location: draggedShift.location,
          notes: draggedShift.notes,
        };
  
        saveShiftToFirebase(newShiftData)
          .then((newId) => {
            const newShift = { ...newShiftData, id: newId };
  
            if (state.collapsedShifts?.has?.(draggedShift.id)) {
              state.collapsedShifts.add(newShift.id);
            }
  
            _upsertShiftLocal(newShift);
  
            announceForScreenReader(`Event copied to ${getReadableDateString(new Date(targetDate))}`);
            renderCalendar();
          })
          .catch((error) => {
            console.error("Error copying shift to Firebase:", error);
            alert("Could not copy event. Please try again later.");
          });
      } else {
        const updatedShift = { ...draggedShift, date: targetDate };
  
        updateShiftInFirebase(shiftId, updatedShift)
          .then(() => {
            _upsertShiftLocal({ ...updatedShift, id: shiftId });
  
            announceForScreenReader(`Event moved to ${getReadableDateString(new Date(targetDate))}`);
            renderCalendar();
          })
          .catch((error) => {
            console.error("Error moving shift in Firebase:", error);
            alert("Could not move event. Please try again later.");
          });
      }
    }
  
    /* =========================
     *  CROSS-MONTH DRAG NAV
     * ========================= */
    function handleCrossMonthDragNavigation(direction) {
      const elements = _getElements();
      const state = _getState();
      _ensureStateArrays(state);
  
      console.log(`Navigating to ${direction} month during drag operation`);
  
      const pendingDrag = {
        draggedShiftId: state.draggedShiftId,
        isDragCopy: state.isDragCopy,
        isDragDayMove: state.isDragDayMove,
        isDragWeekCopy: state.isDragWeekCopy,
        isDragWeekMove: state.isDragWeekMove,
        copyingDayShifts: [...state.copyingDayShifts],
        copyingWeekShifts: [...state.copyingWeekShifts],
        movingDayShifts: [...(state.movingDayShifts || [])],
        movingWeekShifts: [...(state.movingWeekShifts || [])],
        sourceWeekIndex: state.sourceWeekIndex,
        sourceDateStr: state.sourceDateStr,
        sourceMonth: state.currentMonth,
        sourceYear: state.currentYear,
      };
  
      state.pendingCrossMonthDrag = pendingDrag;
  
      if (
        (state.isDragWeekCopy || state.isDragWeekMove) &&
        (state.copyingWeekShifts.length > 0 || state.movingWeekShifts.length > 0)
      ) {
        const sourceShifts = state.isDragWeekCopy ? state.copyingWeekShifts : state.movingWeekShifts;
        const sourceDates = sourceShifts.map((shift) => shift.date);
        state.pendingCrossMonthDrag.sourceDates = sourceDates;
        console.log("Preserving source week dates for cross-month mapping:", sourceDates);
      }
  
      elements.prevMonthDropzone?.classList?.remove("active");
      elements.nextMonthDropzone?.classList?.remove("active");
  
      if (direction === "prev") {
        goToPrevMonth(true);
      } else {
        goToNextMonth(true);
      }
  
      announceForScreenReader(
        `Moved to ${direction === "prev" ? "previous" : "next"} month while dragging. Continue to drag to desired date.`
      );
  
      setTimeout(() => {
        state.draggedShiftId = pendingDrag.draggedShiftId;
        state.isDragCopy = pendingDrag.isDragCopy;
        state.isDragDayMove = pendingDrag.isDragDayMove;
        state.isDragWeekCopy = pendingDrag.isDragWeekCopy;
        state.isDragWeekMove = pendingDrag.isDragWeekMove;
        state.copyingDayShifts = pendingDrag.copyingDayShifts;
        state.copyingWeekShifts = pendingDrag.copyingWeekShifts;
        state.movingDayShifts = pendingDrag.movingDayShifts;
        state.movingWeekShifts = pendingDrag.movingWeekShifts;
        state.sourceWeekIndex = pendingDrag.sourceWeekIndex;
        state.sourceDateStr = pendingDrag.sourceDateStr;
  
        state.isHoveringPrevMonth = false;
        state.isHoveringNextMonth = false;
      }, 50);
    }
  
    // Expose core handlers (your event-listeners.js likely attaches these)
    window.handleDragStart = handleDragStart;
    window.handleDragOver = handleDragOver;
    window.handleDragEnd = handleDragEnd;
    window.handleDrop = handleDrop;
    window.handleCrossMonthDragNavigation = handleCrossMonthDragNavigation;
  })();