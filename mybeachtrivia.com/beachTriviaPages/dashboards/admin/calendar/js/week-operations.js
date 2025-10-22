// week-operations.js
// Functions for week-related operations in the calendar
// Updated 2025-10-21: adds week move/copy mode flags so cross-month dropzones stay visible,
// plus safe show/hide helpers. Keeps existing collapse + clear-week flows intact.

/* =========================
 *  INTERNAL HELPERS
 * ========================= */
function _getDropzones() {
    // Use `elements` if main.js has defined it; otherwise query directly.
    const prev = (typeof elements !== 'undefined' && elements.prevMonthDropzone)
      ? elements.prevMonthDropzone
      : document.getElementById('prev-month-dropzone');
    const next = (typeof elements !== 'undefined' && elements.nextMonthDropzone)
      ? elements.nextMonthDropzone
      : document.getElementById('next-month-dropzone');
    return { prev, next };
  }
  
  function _showMonthDropzonesSafe() {
    if (typeof showMonthDropzones === 'function') {
      showMonthDropzones();
      return;
    }
    const { prev, next } = _getDropzones();
    if (!prev || !next) return;
    prev.style.display = 'flex';
    next.style.display = 'flex';
    requestAnimationFrame(() => {
      prev.style.opacity = '1';
      next.style.opacity = '1';
      prev.classList.add('active');
      next.classList.add('active');
    });
  }
  
  function _hideMonthDropzonesSafe() {
    if (typeof hideMonthDropzones === 'function') {
      hideMonthDropzones();
      return;
    }
    const { prev, next } = _getDropzones();
    if (!prev || !next) return;
    prev.style.display = 'none';
    next.style.display = 'none';
    prev.style.opacity = '0';
    next.style.opacity = '0';
    prev.classList.remove('active');
    next.classList.remove('active');
  }
  
  /* =========================
   *  COLLAPSE / EXPAND WEEK
   * ========================= */
  function toggleWeekCollapse(weekToggleButton) {
    const weekIndex = parseInt(weekToggleButton.getAttribute('data-week-index'));
    if (isNaN(weekIndex)) return;
  
    const triangle = weekToggleButton.querySelector('div');
  
    // Get all shifts for this week
    const weekShifts = getShiftsForWeek(weekIndex);
    if (weekShifts.length === 0) return;
  
    // Determine current state by checking the triangle
    const isCurrentlyCollapsed = triangle.className === 'triangle-right';
  
    // Get all visible shift elements for this week
    const weekRow = document.querySelector(`tr[data-week-index="${weekIndex}"]`);
    if (!weekRow) return;
  
    const shiftContainers = Array.from(weekRow.querySelectorAll('.shift-container'));
    const weekShiftElements = [];
  
    // Collect all shift elements from all containers in this row
    shiftContainers.forEach(container => {
      const shiftsEls = Array.from(container.querySelectorAll('.shift'));
      weekShiftElements.push(...shiftsEls);
    });
  
    // Find the opposite button(s)
    const otherToggleButtons = document.querySelectorAll(`.week-toggle-button[data-week-index="${weekIndex}"]`);
  
    if (isCurrentlyCollapsed) {
      // Expand all shifts in the week
      weekShiftElements.forEach(shiftDiv => {
        const shiftId = shiftDiv.getAttribute('data-id'); // keep as string
        if (shiftId) {
          state.collapsedShifts.delete(shiftId);
          shiftDiv.classList.remove('collapsed');
  
          const shiftToggle = shiftDiv.querySelector('.toggle-button div');
          if (shiftToggle) shiftToggle.className = 'triangle-down';
  
          shiftDiv.setAttribute('aria-expanded', 'true');
        }
      });
  
      // Update all week toggle buttons for this week
      otherToggleButtons.forEach(btn => {
        const btnTriangle = btn.querySelector('div');
        if (btnTriangle) btnTriangle.className = 'triangle-down';
      });
  
      announceForScreenReader(`Expanded all events for week ${weekIndex + 1}`);
    } else {
      // Collapse all shifts in the week
      weekShiftElements.forEach(shiftDiv => {
        const shiftId = shiftDiv.getAttribute('data-id'); // keep as string
        if (shiftId) {
          state.collapsedShifts.add(shiftId);
          shiftDiv.classList.add('collapsed');
  
          const shiftToggle = shiftDiv.querySelector('.toggle-button div');
          if (shiftToggle) shiftToggle.className = 'triangle-right';
  
          shiftDiv.setAttribute('aria-expanded', 'false');
        }
      });
  
      // Update all week toggle buttons for this week
      otherToggleButtons.forEach(btn => {
        const btnTriangle = btn.querySelector('div');
        if (btnTriangle) btnTriangle.className = 'triangle-right';
      });
  
      announceForScreenReader(`Collapsed all events for week ${weekIndex + 1}`);
    }
  }
  
  /* =========================
   *  WEEK CLEAR (BULK DELETE)
   * ========================= */
  function clearAllShiftsForWeek(weekIndex) {
    if (isNaN(weekIndex)) return;
  
    const weekShifts = getShiftsForWeek(weekIndex);
  
    if (weekShifts.length === 0) {
      alert('No events to clear for this week.');
      return;
    }
  
    const weekRow = document.querySelector(`tr[data-week-index="${weekIndex}"]`);
    if (!weekRow) return;
  
    const dateCells = Array.from(weekRow.querySelectorAll('td:not(.week-copy-cell)'));
    if (dateCells.length === 0) return;
  
    let weekStartDate = null;
    for (const cell of dateCells) {
      const dateStr = cell.getAttribute('data-date');
      if (dateStr) {
        weekStartDate = new Date(dateStr);
        break;
      }
    }
    if (!weekStartDate) return;
  
    const formattedStartDate = getReadableDateString(weekStartDate);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const formattedEndDate = getReadableDateString(weekEndDate);
  
    document.getElementById('clear-day-title').textContent = `Clear Events for Week`;
    document.getElementById('clear-day-warning').textContent =
      `Are you sure you want to delete all ${weekShifts.length} events from ${formattedStartDate} to ${formattedEndDate}? This action cannot be undone.`;
  
    const eventsContainer = document.getElementById('day-events-list');
    eventsContainer.innerHTML = '';
  
    const countElement = document.createElement('div');
    countElement.className = 'event-count';
    countElement.textContent = `${weekShifts.length} event${weekShifts.length > 1 ? 's' : ''} will be permanently deleted:`;
    eventsContainer.appendChild(countElement);
  
    weekShifts.forEach(shift => {
      const shiftItem = document.createElement('div');
      shiftItem.className = 'conflict-item';
  
      const shiftDate = new Date(shift.date);
      const dateString = getReadableDateString(shiftDate);
      const employeeName = employees[shift.employeeId] || 'Unknown host';
      const eventType = eventTypes[shift.type] || shift.type;
      const timeInfo = `${shift.startTime} - ${shift.endTime}`;
      const locationInfo = shift.location || 'No location';
  
      shiftItem.innerHTML = `
        <div class="conflict-event">${eventType}${shift.theme ? ': ' + shift.theme : ''}</div>
        <div class="conflict-date">${dateString}</div>
        <div class="conflict-time">${timeInfo} with ${employeeName}</div>
        <div class="conflict-location">${locationInfo}</div>
      `;
  
      eventsContainer.appendChild(shiftItem);
    });
  
    // Store the week index for use in the confirmation handler
    document.getElementById('confirm-clear-day').setAttribute('data-week-index', weekIndex);
    document.getElementById('confirm-clear-day').removeAttribute('data-date');
  
    const modal = document.getElementById('clear-day-modal');
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
  
    setTimeout(() => document.getElementById('cancel-clear-day').focus(), 100);
    announceForScreenReader(`Confirm clearing ${weekShifts.length} events for the week of ${formattedStartDate}`);
  }
  
  function executeAllWeekShiftsClear() {
    const weekIndex = document.getElementById('confirm-clear-day').getAttribute('data-week-index');
    if (!weekIndex) {
      console.error('No week index provided for clearing events');
      return;
    }
  
    const shiftsToDelete = getShiftsForWeek(parseInt(weekIndex));
    if (shiftsToDelete.length === 0) {
      console.warn('No shifts found to delete');
      closeClearDayModal();
      return;
    }
  
    const deletePromises = shiftsToDelete.map(shift =>
      deleteShiftFromFirebase(shift.id).catch(error => {
        console.error(`Error deleting shift ${shift.id}:`, error);
        return false;
      })
    );
  
    Promise.all(deletePromises)
      .then(results => {
        const successCount = results.filter(Boolean).length;
  
        const idsToDelete = new Set(shiftsToDelete.map(s => s.id));
        shifts = shifts.filter(s => !idsToDelete.has(s.id));
  
        closeClearDayModal();
  
        if (successCount === shiftsToDelete.length) {
          alert(`Successfully deleted all ${successCount} events.`);
        } else {
          alert(`Deleted ${successCount} out of ${shiftsToDelete.length} events. Some deletions may have failed.`);
        }
  
        announceForScreenReader(`Deleted ${successCount} events from the week.`);
        renderCalendar();
      })
      .catch(error => {
        console.error('Error deleting shifts:', error);
        alert('An error occurred while deleting events. Please try again.');
        closeClearDayModal();
      });
  }
  
  /* =========================
   *  WEEK MOVE / COPY MODES
   *  (Ensures month dropzones appear & stay visible)
   * ========================= */
  
  /**
   * Start "Move Week" mode.
   * Shows cross-month dropzones and sets flags so MutationObserver won't auto-hide them.
   * @param {number} weekIndex
   */
  function startWeekMove(weekIndex) {
    if (isNaN(weekIndex)) return;
    state.sourceWeekIndex = weekIndex;
    state.movingWeekShifts = getShiftsForWeek(weekIndex) || [];
    state.isDragWeekMove = true;
  
    // Make sure the dropzones become visible for cross-month navigation
    _showMonthDropzonesSafe();
  
    announceForScreenReader(`Move week mode started for week ${weekIndex + 1}. Use dropzones to navigate months.`);
  }
  
  /** Finish/cancel "Move Week" mode. */
  function endWeekMove() {
    state.isDragWeekMove = false;
    state.movingWeekShifts = [];
    state.sourceWeekIndex = null;
  
    _hideMonthDropzonesSafe();
    announceForScreenReader('Move week mode ended.');
  }
  
  /**
   * Start "Copy Week" mode.
   * Shows cross-month dropzones and sets flags so MutationObserver won't auto-hide them.
   * @param {number} weekIndex
   */
  function startWeekCopy(weekIndex) {
    if (isNaN(weekIndex)) return;
    state.sourceWeekIndex = weekIndex;
    state.copyingWeekShifts = getShiftsForWeek(weekIndex) || [];
    state.isDragWeekCopy = true;
  
    _showMonthDropzonesSafe();
    announceForScreenReader(`Copy week mode started for week ${weekIndex + 1}. Use dropzones to navigate months.`);
  }
  
  /** Finish/cancel "Copy Week" mode. */
  function endWeekCopy() {
    state.isDragWeekCopy = false;
    state.copyingWeekShifts = [];
    state.sourceWeekIndex = null;
  
    _hideMonthDropzonesSafe();
    announceForScreenReader('Copy week mode ended.');
  }
  
  /* =========================
   *  OPTIONAL APPLY HELPERS
   *  (Your existing drag/drop handlers can call these)
   * ========================= */
  
  /**
   * Apply week MOVE to a target week's starting date.
   * Each shift keeps its weekday offset relative to the source week's start.
   * @param {string} targetWeekStartYMD - YYYY-MM-DD (Sunday or your week start)
   */
  async function applyWeekMoveToTarget(targetWeekStartYMD) {
    if (!state.isDragWeekMove || !Array.isArray(state.movingWeekShifts) || state.movingWeekShifts.length === 0) {
      return false;
    }
    const sourceWeekShifts = state.movingWeekShifts.slice();
    const sourceStartDate = _getWeekStartDateFromIndex(state.sourceWeekIndex);
    const targetStartDate = new Date(targetWeekStartYMD);
  
    const updates = [];
    for (const s of sourceWeekShifts) {
      const oldDate = new Date(s.date);
      const offsetDays = Math.round((oldDate - sourceStartDate) / (24 * 60 * 60 * 1000));
      const newDate = new Date(targetStartDate);
      newDate.setDate(newDate.getDate() + offsetDays);
      const ymd = _toYMD(newDate);
  
      const updated = { ...s, date: ymd };
      updates.push(updateShiftInFirebase(String(s.id), updated).then(() => updated));
    }
  
    try {
      const moved = await Promise.all(updates);
      // Replace in-memory shifts
      const movedIds = new Set(sourceWeekShifts.map(x => x.id));
      shifts = shifts.filter(x => !movedIds.has(x.id)).concat(moved);
      renderCalendar();
      endWeekMove();
      announceForScreenReader(`Moved ${moved.length} events to the week starting ${targetWeekStartYMD}`);
      return true;
    } catch (err) {
      console.error('applyWeekMoveToTarget failed:', err);
      alert('Could not move the week. Please try again.');
      return false;
    }
  }
  
  /**
   * Apply week COPY to a target week's starting date.
   * Each shift keeps its weekday offset relative to the source week's start.
   * @param {string} targetWeekStartYMD - YYYY-MM-DD (Sunday or your week start)
   */
  async function applyWeekCopyToTarget(targetWeekStartYMD) {
    if (!state.isDragWeekCopy || !Array.isArray(state.copyingWeekShifts) || state.copyingWeekShifts.length === 0) {
      return false;
    }
    const sourceWeekShifts = state.copyingWeekShifts.slice();
    const sourceStartDate = _getWeekStartDateFromIndex(state.sourceWeekIndex);
    const targetStartDate = new Date(targetWeekStartYMD);
  
    const creates = [];
    for (const s of sourceWeekShifts) {
      const oldDate = new Date(s.date);
      const offsetDays = Math.round((oldDate - sourceStartDate) / (24 * 60 * 60 * 1000));
      const newDate = new Date(targetStartDate);
      newDate.setDate(newDate.getDate() + offsetDays);
      const ymd = _toYMD(newDate);
  
      const newShift = {
        date: ymd,
        employeeId: s.employeeId,
        startTime: s.startTime,
        endTime: s.endTime,
        type: s.type,
        theme: s.theme || '',
        location: s.location,
        notes: s.notes || ''
      };
      creates.push(
        saveShiftToFirebase(newShift).then(id => ({ ...newShift, id }))
      );
    }
  
    try {
      const added = await Promise.all(creates);
      shifts = shifts.concat(added);
      renderCalendar();
      endWeekCopy();
      announceForScreenReader(`Copied ${added.length} events to the week starting ${targetWeekStartYMD}`);
      return true;
    } catch (err) {
      console.error('applyWeekCopyToTarget failed:', err);
      alert('Could not copy the week. Please try again.');
      return false;
    }
  }
  
  /* =========================
   *  SMALL DATE HELPERS
   * ========================= */
  function _toYMD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  
  /**
   * Attempts to compute the Sunday (or first day rendered in the row) for a given weekIndex
   * using the row's first valid cell date.
   */
  function _getWeekStartDateFromIndex(weekIndex) {
    const weekRow = document.querySelector(`tr[data-week-index="${weekIndex}"]`);
    if (!weekRow) return new Date();
    const dateCells = Array.from(weekRow.querySelectorAll('td[data-date]'));
    for (const cell of dateCells) {
      const ds = cell.getAttribute('data-date');
      if (ds) return new Date(ds);
    }
    return new Date();
  }
  