// copy-month.js
// "Copy Previous Month" feature — copies all shifts from the previous calendar month
// into the current month, with conflict handling (include or exclude conflicts).
//
// Updated 2026-03-04:
// - ✅ FIX: preserves the correct DAY-OF-WEEK by mapping via calendar GRID position (same cell index)
//   instead of same day-of-month.
// - ✅ FIX: "Copy All" no-conflicts path no longer forces writes.
// - ✅ Safer state/shifts access (window.CalendarState/window.state/window._calendarState + getShifts/setShifts)

(function () {
    "use strict";
  
    // ─── State ─────────────────────────────────────────────────────────────────
    let _pendingShifts = []; // All mapped shifts ready to save
    let _conflictShifts = []; // Subset that have conflicts
    let _cleanShifts = []; // Subset with no conflicts
    let _skippedCount = 0; // Skipped because they mapped outside target month
  
    // ─── Helpers ───────────────────────────────────────────────────────────────
  
    function _getState() {
      try {
        return window.CalendarState || window.state || window._calendarState || {};
      } catch (_) {
        return {};
      }
    }
  
    function _getShifts() {
      try {
        if (typeof window.getShifts === "function") {
          const arr = window.getShifts();
          return Array.isArray(arr) ? arr : [];
        }
      } catch (_) {}
  
      try {
        if (Array.isArray(window.shifts)) return window.shifts;
      } catch (_) {}
  
      try {
        if (typeof shifts !== "undefined" && Array.isArray(shifts)) return shifts;
      } catch (_) {}
  
      return [];
    }
  
    function _setShifts(next) {
      const safe = Array.isArray(next) ? next : _getShifts();
      try {
        if (typeof window.setShifts === "function") window.setShifts(safe);
      } catch (_) {}
      try {
        window.shifts = safe;
      } catch (_) {}
      return safe;
    }
  
    function _upsertLocal(newShift) {
      if (!newShift || newShift.id == null) return;
      const current = _getShifts().slice();
      const idx = current.findIndex((s) => String(s?.id) === String(newShift.id));
      if (idx >= 0) current[idx] = { ...current[idx], ...newShift, id: current[idx].id };
      else current.push({ ...newShift });
      _setShifts(current);
    }
  
    function _checkConflict(employeeId, dateStr) {
      try {
        if (typeof checkForDoubleBooking === "function") {
          return checkForDoubleBooking({ date: dateStr, employeeId }).length > 0;
        }
      } catch (_) {}
      // Fallback: manual check
      return _getShifts().some((s) => String(s?.employeeId) === String(employeeId) && String(s?.date) === String(dateStr));
    }
  
    function _ymd(d) {
      const y = String(d.getFullYear()).padStart(4, "0");
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${da}`;
    }
  
    // Calendar grid start = Sunday on/before the 1st of that month
    function _gridStart(year, month) {
      const first = new Date(year, month, 1);
      const dow = first.getDay(); // 0=Sun..6=Sat
      const start = new Date(year, month, 1 - dow);
      start.setHours(0, 0, 0, 0);
      return start;
    }
  
    // ✅ Map a prev-month date to current-month date by matching calendar CELL INDEX
    // (preserves weekday and week-row position)
    function _mapDateByGrid(srcDateStr, prevYear, prevMonth, targetYear, targetMonth) {
      const src = new Date(srcDateStr + "T00:00:00");
      if (Number.isNaN(src.getTime())) return null;
  
      const prevStart = _gridStart(prevYear, prevMonth);
      const targetStart = _gridStart(targetYear, targetMonth);
  
      const MS_DAY = 24 * 60 * 60 * 1000;
      const cellIndex = Math.round((src.getTime() - prevStart.getTime()) / MS_DAY);
  
      const mapped = new Date(targetStart.getTime() + cellIndex * MS_DAY);
      mapped.setHours(0, 0, 0, 0);
  
      // Only keep if it lands IN the target month
      if (mapped.getFullYear() !== targetYear || mapped.getMonth() !== targetMonth) return null;
  
      return _ymd(mapped);
    }
  
    // ─── Modal helpers ─────────────────────────────────────────────────────────
  
    function _getModal() {
      return document.getElementById("copy-month-modal");
    }
  
    function _showModal() {
      const modal = _getModal();
      if (!modal) return;
      modal.style.display = "flex";
      modal.removeAttribute("aria-hidden");
    }
  
    function _resetTempState() {
      _pendingShifts = [];
      _conflictShifts = [];
      _cleanShifts = [];
      _skippedCount = 0;
    }
  
    function _hideModal() {
      const modal = _getModal();
      if (!modal) return;
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true");
      _resetTempState();
    }
  
    function _setModalContent(prevMonthName, total, conflictCount, skippedCount) {
      const el = document.getElementById("copy-month-message");
      if (!el) return;
  
      const skippedLine =
        skippedCount > 0
          ? `<p><em>Note:</em> Skipped <strong>${skippedCount}</strong> event${skippedCount !== 1 ? "s" : ""} that would fall outside this month.</p>`
          : "";
  
      if (conflictCount === 0) {
        el.innerHTML = `
          <p>Copy <strong>${total}</strong> event${total !== 1 ? "s" : ""} from <strong>${prevMonthName}</strong> into this month?</p>
          <p>No conflicts detected.</p>
          ${skippedLine}
        `;
      } else {
        el.innerHTML = `
          <p>Found <strong>${total}</strong> event${total !== 1 ? "s" : ""} in <strong>${prevMonthName}</strong> to copy.</p>
          <p><strong>${conflictCount}</strong> event${conflictCount !== 1 ? "s" : ""} conflict with existing shifts this month. How would you like to proceed?</p>
          ${skippedLine}
        `;
      }
  
      const includeBtn = document.getElementById("copy-month-include-conflicts");
      const excludeBtn = document.getElementById("copy-month-exclude-conflicts");
      const copyAllBtn = document.getElementById("copy-month-copy-all");
  
      if (includeBtn) includeBtn.style.display = conflictCount > 0 ? "inline-flex" : "none";
      if (excludeBtn) excludeBtn.style.display = conflictCount > 0 ? "inline-flex" : "none";
      if (copyAllBtn) copyAllBtn.style.display = conflictCount > 0 ? "none" : "inline-flex";
    }
  
    // ─── Core copy logic ───────────────────────────────────────────────────────
  
    async function _forceSave(shiftData) {
      if (window.shiftService?.forceSaveShift) return window.shiftService.forceSaveShift(shiftData);
      if (window.shiftService?.saveShift) return window.shiftService.saveShift(shiftData, { force: true });
      if (typeof window.forceSaveShiftToFirebase === "function") return window.forceSaveShiftToFirebase(shiftData);
      return saveShiftToFirebase(shiftData);
    }
  
    async function _saveShifts(shiftsToSave, forceWrites) {
      const saved = [];
      await Promise.all(
        shiftsToSave.map(async (shift) => {
          try {
            const newId = forceWrites ? await _forceSave(shift) : await saveShiftToFirebase(shift);
            const newShift = { ...shift, id: newId };
            _upsertLocal(newShift);
            saved.push(newShift);
          } catch (err) {
            console.error("[copy-month] Failed to save shift:", err, shift);
          }
        })
      );
      return saved;
    }
  
    async function _executeCopy(includeConflicts) {
      const shiftsToSave = includeConflicts ? _pendingShifts : _cleanShifts;
  
      if (shiftsToSave.length === 0) {
        _hideModal();
        alert("No events to copy.");
        return;
      }
  
      // only "force" when user chose include-conflicts AND there actually are conflicts
      const forceWrites = includeConflicts && _conflictShifts.length > 0;
  
      _hideModal();
  
      try {
        const saved = await _saveShifts(shiftsToSave, forceWrites);
        if (typeof renderCalendar === "function") renderCalendar();
  
        const skipped = includeConflicts ? 0 : _conflictShifts.length;
        const parts = [];
        parts.push(`Copied ${saved.length} event${saved.length !== 1 ? "s" : ""}.`);
        if (skipped > 0) parts.push(`Skipped ${skipped} conflicting event${skipped !== 1 ? "s" : ""}.`);
        if (_skippedCount > 0) parts.push(`Skipped ${_skippedCount} outside-month event${_skippedCount !== 1 ? "s" : ""}.`);
        const msg = parts.join(" ");
  
        if (typeof announceForScreenReader === "function") announceForScreenReader(msg);
      } catch (err) {
        console.error("[copy-month] Copy failed:", err);
        alert("Some events could not be copied. Please try again.");
      }
    }
  
    // ─── Entry point ───────────────────────────────────────────────────────────
  
    function openCopyPreviousMonthModal() {
      const st = _getState();
      const currentMonth = st.currentMonth ?? new Date().getMonth();
      const currentYear = st.currentYear ?? new Date().getFullYear();
  
      // Compute previous month
      let prevMonth = currentMonth - 1;
      let prevYear = currentYear;
      if (prevMonth < 0) {
        prevMonth = 11;
        prevYear--;
      }
  
      const prevMonthName = new Date(prevYear, prevMonth, 1).toLocaleString("default", {
        month: "long",
        year: "numeric",
      });
  
      // Get all shifts from previous month
      const allShifts = _getShifts();
      const prevMonthShifts = allShifts.filter((s) => {
        if (!s?.date) return false;
        const d = new Date(s.date + "T00:00:00");
        return !Number.isNaN(d.getTime()) && d.getFullYear() === prevYear && d.getMonth() === prevMonth;
      });
  
      if (prevMonthShifts.length === 0) {
        alert(`No events found in ${prevMonthName} to copy.`);
        return;
      }
  
      // Map dates and build pending shifts
      _resetTempState();
  
      prevMonthShifts.forEach((shift) => {
        const targetDate = _mapDateByGrid(shift.date, prevYear, prevMonth, currentYear, currentMonth);
        if (!targetDate) {
          _skippedCount++;
          return;
        }
  
        const newShift = {
          date: targetDate,
          employeeId: shift.employeeId,
          startTime: shift.startTime,
          endTime: shift.endTime,
          type: shift.type,
          theme: shift.theme,
          location: shift.location,
          notes: shift.notes,
        };
  
        _pendingShifts.push(newShift);
  
        if (_checkConflict(shift.employeeId, targetDate)) _conflictShifts.push(newShift);
        else _cleanShifts.push(newShift);
      });
  
      if (_pendingShifts.length === 0) {
        alert(`No events from ${prevMonthName} could be mapped to this month.`);
        return;
      }
  
      _setModalContent(prevMonthName, _pendingShifts.length, _conflictShifts.length, _skippedCount);
      _showModal();
    }
  
    // ─── Wire up buttons ───────────────────────────────────────────────────────
  
    document.addEventListener("DOMContentLoaded", () => {
      const triggerBtn = document.getElementById("copy-prev-month-btn");
      if (triggerBtn) triggerBtn.addEventListener("click", openCopyPreviousMonthModal);
  
      const cancelBtn = document.getElementById("copy-month-cancel");
      if (cancelBtn) cancelBtn.addEventListener("click", _hideModal);
  
      const copyAllBtn = document.getElementById("copy-month-copy-all");
      if (copyAllBtn) copyAllBtn.addEventListener("click", () => _executeCopy(true)); // no conflicts => forceWrites stays false
  
      const includeBtn = document.getElementById("copy-month-include-conflicts");
      if (includeBtn) includeBtn.addEventListener("click", () => _executeCopy(true));
  
      const excludeBtn = document.getElementById("copy-month-exclude-conflicts");
      if (excludeBtn) excludeBtn.addEventListener("click", () => _executeCopy(false));
  
      // Close on backdrop click
      const modal = _getModal();
      if (modal) {
        modal.addEventListener("click", (e) => {
          if (e.target === modal) _hideModal();
        });
      }
    });
  
    // Expose globally
    window.openCopyPreviousMonthModal = openCopyPreviousMonthModal;
  })();