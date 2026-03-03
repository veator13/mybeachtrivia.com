// copy-month.js
// "Copy Previous Month" feature — copies all shifts from the previous calendar month
// into the current month, with conflict handling (include or exclude conflicts).

(function () {

    // ─── State ─────────────────────────────────────────────────────────────────
    let _pendingShifts = [];       // All mapped shifts ready to save
    let _conflictShifts = [];      // Subset that have conflicts
    let _cleanShifts = [];         // Subset with no conflicts
  
    // ─── Helpers ───────────────────────────────────────────────────────────────
  
    function _getState() {
      return (typeof state !== "undefined" && state) ? state : window._calendarState || {};
    }
  
    function _getShifts() {
      if (typeof window.getShifts === "function") return window.getShifts();
      if (typeof shifts !== "undefined") return shifts;
      return [];
    }
  
    function _upsertLocal(newShift) {
      const current = _getShifts();
      const idx = current.findIndex(s => s.id === newShift.id);
      if (idx >= 0) current[idx] = newShift;
      else current.push(newShift);
      if (typeof window.setShifts === "function") window.setShifts(current);
    }
  
    function _checkConflict(employeeId, dateStr) {
      if (typeof checkForDoubleBooking === "function") {
        return checkForDoubleBooking({ date: dateStr, employeeId }).length > 0;
      }
      // Fallback: manual check
      return _getShifts().some(s => s.employeeId === employeeId && s.date === dateStr);
    }
  
    // Map a source date (YYYY-MM-DD) from prevMonth to the same day-of-month in currentMonth.
    // Returns null if the day doesn't exist in currentMonth (e.g. Feb 30).
    function _mapDate(srcDateStr, targetYear, targetMonth) {
      const src = new Date(srcDateStr + "T00:00:00");
      const day = src.getDate();
      const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
      if (day > lastDay) return null;
      const y = String(targetYear).padStart(4, "0");
      const m = String(targetMonth + 1).padStart(2, "0");
      const d = String(day).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  
    // ─── Modal helpers ─────────────────────────────────────────────────────────
  
    function _getModal() { return document.getElementById("copy-month-modal"); }
  
    function _showModal() {
      const modal = _getModal();
      if (!modal) return;
      modal.style.display = "flex";
      modal.removeAttribute("aria-hidden");
    }
  
    function _hideModal() {
      const modal = _getModal();
      if (!modal) return;
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true");
      _pendingShifts = [];
      _conflictShifts = [];
      _cleanShifts = [];
    }
  
    function _setModalContent(prevMonthName, total, conflictCount) {
      const el = document.getElementById("copy-month-message");
      if (!el) return;
  
      if (conflictCount === 0) {
        el.innerHTML = `
          <p>Copy all <strong>${total}</strong> event${total !== 1 ? "s" : ""} from 
          <strong>${prevMonthName}</strong> into this month?</p>
          <p>No conflicts detected.</p>`;
      } else {
        el.innerHTML = `
          <p>Found <strong>${total}</strong> event${total !== 1 ? "s" : ""} in 
          <strong>${prevMonthName}</strong> to copy.</p>
          <p><strong>${conflictCount}</strong> event${conflictCount !== 1 ? "s" : ""} 
          conflict with existing shifts this month. How would you like to proceed?</p>`;
      }
  
      // Show/hide buttons based on whether there are conflicts
      const includeBtn = document.getElementById("copy-month-include-conflicts");
      const excludeBtn = document.getElementById("copy-month-exclude-conflicts");
      const copyAllBtn = document.getElementById("copy-month-copy-all");
  
      if (conflictCount > 0) {
        includeBtn.style.display = "inline-flex";
        excludeBtn.style.display = "inline-flex";
        copyAllBtn.style.display = "none";
      } else {
        includeBtn.style.display = "none";
        excludeBtn.style.display = "none";
        copyAllBtn.style.display = "inline-flex";
      }
    }
  
    // ─── Core copy logic ───────────────────────────────────────────────────────
  
    async function _saveShifts(shiftsToSave, force = false) {
      const saved = [];
      await Promise.all(shiftsToSave.map(async (shift) => {
        try {
          let newId;
          if (force && window.shiftService) {
            newId = await window.shiftService.saveShift(shift, { force: true });
          } else {
            newId = await saveShiftToFirebase(shift);
          }
          const newShift = { ...shift, id: newId };
          _upsertLocal(newShift);
          saved.push(newShift);
        } catch (err) {
          console.error("[copy-month] Failed to save shift:", err, shift);
        }
      }));
      return saved;
    }
  
    async function _executeCopy(includeConflicts) {
      const shiftsToSave = includeConflicts
        ? _pendingShifts
        : _cleanShifts;
  
      if (shiftsToSave.length === 0) {
        _hideModal();
        alert("No events to copy.");
        return;
      }
  
      _hideModal();
  
      try {
        const saved = await _saveShifts(shiftsToSave, includeConflicts);
        if (typeof renderCalendar === "function") renderCalendar();
        const skipped = includeConflicts ? 0 : _conflictShifts.length;
        const msg = skipped > 0
          ? `Copied ${saved.length} event${saved.length !== 1 ? "s" : ""}. Skipped ${skipped} conflicting event${skipped !== 1 ? "s" : ""}.`
          : `Copied ${saved.length} event${saved.length !== 1 ? "s" : ""} successfully.`;
        if (typeof announceForScreenReader === "function") announceForScreenReader(msg);
      } catch (err) {
        console.error("[copy-month] Copy failed:", err);
        alert("Some events could not be copied. Please try again.");
      }
    }
  
    // ─── Entry point ───────────────────────────────────────────────────────────
  
    function openCopyPreviousMonthModal() {
      const s = _getState();
      const currentMonth = s.currentMonth ?? new Date().getMonth();
      const currentYear = s.currentYear ?? new Date().getFullYear();
  
      // Compute previous month
      let prevMonth = currentMonth - 1;
      let prevYear = currentYear;
      if (prevMonth < 0) { prevMonth = 11; prevYear--; }
  
      const prevMonthName = new Date(prevYear, prevMonth, 1)
        .toLocaleString("default", { month: "long", year: "numeric" });
  
      // Get all shifts from previous month
      const allShifts = _getShifts();
      const prevMonthShifts = allShifts.filter(s => {
        if (!s.date) return false;
        const d = new Date(s.date + "T00:00:00");
        return d.getFullYear() === prevYear && d.getMonth() === prevMonth;
      });
  
      if (prevMonthShifts.length === 0) {
        alert(`No events found in ${prevMonthName} to copy.`);
        return;
      }
  
      // Map dates and build pending shifts
      _pendingShifts = [];
      _conflictShifts = [];
      _cleanShifts = [];
  
      prevMonthShifts.forEach(shift => {
        const targetDate = _mapDate(shift.date, currentYear, currentMonth);
        if (!targetDate) return; // Day doesn't exist in target month
  
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
  
        if (_checkConflict(shift.employeeId, targetDate)) {
          _conflictShifts.push(newShift);
        } else {
          _cleanShifts.push(newShift);
        }
      });
  
      if (_pendingShifts.length === 0) {
        alert(`No events from ${prevMonthName} could be mapped to this month.`);
        return;
      }
  
      _setModalContent(prevMonthName, _pendingShifts.length, _conflictShifts.length);
      _showModal();
    }
  
    // ─── Wire up buttons ───────────────────────────────────────────────────────
  
    document.addEventListener("DOMContentLoaded", () => {
      // Copy Previous Month trigger button
      const triggerBtn = document.getElementById("copy-prev-month-btn");
      if (triggerBtn) {
        triggerBtn.addEventListener("click", openCopyPreviousMonthModal);
      }
  
      // Modal: Cancel
      const cancelBtn = document.getElementById("copy-month-cancel");
      if (cancelBtn) cancelBtn.addEventListener("click", _hideModal);
  
      // Modal: Copy All (no conflicts)
      const copyAllBtn = document.getElementById("copy-month-copy-all");
      if (copyAllBtn) copyAllBtn.addEventListener("click", () => _executeCopy(true));
  
      // Modal: Include Conflicts
      const includeBtn = document.getElementById("copy-month-include-conflicts");
      if (includeBtn) includeBtn.addEventListener("click", () => _executeCopy(true));
  
      // Modal: Exclude Conflicts
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