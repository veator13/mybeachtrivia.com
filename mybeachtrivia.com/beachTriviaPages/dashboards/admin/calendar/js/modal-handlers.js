// modal-handlers.js
// Functions for handling modals and form submissions
// v2025-11-13 — fixes focus/ARIA bug on close, makes “Proceed Anyway” drag-move
// actually re-render reliably, and hardens submit button lookups.

/* =========================
   Tiny safety helpers
========================= */
function ensureCalendarState() {
    if (!window.CalendarState) window.CalendarState = {};
    return window.CalendarState;
  }
  
  function el(id) { return document.getElementById(id); }
  
  // Best-effort SR announcement
  function announceForScreenReader(msg) {
    try {
      if (typeof window._srAnnouncer === 'function') return window._srAnnouncer(msg);
      let live = document.getElementById('sr-live');
      if (!live) {
        live = document.createElement('div');
        live.id = 'sr-live';
        live.setAttribute('aria-live', 'polite');
        live.setAttribute('aria-atomic', 'true');
        live.style.position = 'absolute';
        live.style.left = '-9999px';
        document.body.appendChild(live);
      }
      live.textContent = msg;
    } catch (_) {}
  }
  
  function getEmployeeName(employeeId) {
    if (!employeeId) return 'Unknown host';
    try {
      if (window.employeesData && window.employeesData[employeeId]?.displayName) {
        return window.employeesData[employeeId].displayName;
      }
      if (window.employees && window.employees[employeeId]) {
        return window.employees[employeeId];
      }
    } catch (_) {}
    return 'Unknown host';
  }
  
  function getReadableDateString(d) {
    try {
      if (!(d instanceof Date)) d = new Date(d);
      return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    } catch { return String(d); }
  }
  
  function formatDate(d) {
    try {
      if (!(d instanceof Date)) d = new Date(d);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${da}`;
    } catch { return ''; }
  }
  
  function getEventTypeName(type) {
    try {
      if (window.eventTypes && window.eventTypes[type]) return window.eventTypes[type];
    } catch (_) {}
    return type || 'Event';
  }
  
  function selectDropdownOptionByValue(dropdown, value) {
    if (!dropdown || value == null) return;
    let found = false;
    for (let i = 0; i < dropdown.options.length; i++) {
      if (dropdown.options[i].value === value) {
        dropdown.selectedIndex = i;
        found = true;
        break;
      }
    }
    if (!found && dropdown.options.length > 0) dropdown.selectedIndex = 0;
  }
  
  /* =========================
     Focus-safe modal helpers
  ========================= */
  function _focusSafeTarget() {
    return el('calendar') || el('current-month') || document.body;
  }
  
  function showModal(modalEl, focusEl) {
    if (!modalEl) return;
    modalEl.style.display = 'flex';
    modalEl.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      if (focusEl && typeof focusEl.focus === 'function') focusEl.focus();
    }, 60);
  }
  
  function hideModalSafely(modalEl, preferFocusEl) {
    if (!modalEl) return;
    try {
      const active = document.activeElement;
      if (active && modalEl.contains(active)) {
        const tgt = preferFocusEl || _focusSafeTarget();
        if (tgt && typeof tgt.focus === 'function') tgt.focus();
        else active.blur?.();
      }
    } catch (_) {}
    modalEl.setAttribute('aria-hidden', 'true');
    modalEl.style.display = 'none';
  }
  
  /* =========================
     Shift Add/Edit Modal
  ========================= */
  function openShiftModal(dateStr = null) {
    const _elements = window.elements || {};
    const shiftModal = _elements.shiftModal || el('shift-modal');
    const modalTitle = _elements.modalTitle || el('modal-title');
    const shiftForm = _elements.shiftForm || el('shift-form');
    const themeField = _elements.themeField || el('theme-field');
    const shiftDateInput = _elements.shiftDateInput || el('shift-date');
    const startTimeSelect = _elements.startTimeSelect || el('start-time');
    const endTimeSelect = _elements.endTimeSelect || el('end-time');
    const shiftEmployeeSelect = _elements.shiftEmployeeSelect || el('shift-employee');
  
    window.state = window.state || {};
    state.isEditing = false;
    state.editingShiftId = null;
  
    if (modalTitle) modalTitle.textContent = 'Add New Event';
    if (shiftForm) shiftForm.reset();
    if (themeField) themeField.style.display = 'none';
  
    const defaultDate = dateStr || formatDate(new Date());
    if (shiftDateInput) shiftDateInput.value = defaultDate;
  
    try {
      if (typeof window.getDefaultTimes === 'function') {
        const t = window.getDefaultTimes();
        if (startTimeSelect) selectDropdownOptionByValue(startTimeSelect, t.start);
        if (endTimeSelect) selectDropdownOptionByValue(endTimeSelect, t.end);
      }
    } catch (_) {}
  
    showModal(shiftModal, shiftEmployeeSelect);
    announceForScreenReader(`Adding new event for ${getReadableDateString(new Date(defaultDate))}`);
  }
  
  function closeShiftModal() {
    const _elements = window.elements || {};
    const shiftModal = _elements.shiftModal || el('shift-modal');
    hideModalSafely(shiftModal, _focusSafeTarget());
  
    window.state = window.state || {};
    state.isEditing = false;
    state.editingShiftId = null;
  }
  
  /* =========================
     Double-Book Warning Modal
  ========================= */
  function closeWarningModal() {
    const _elements = window.elements || {};
    const warningModal = _elements.warningModal || el('warning-modal');
  
    try {
      const cs = ensureCalendarState();
      cs.pendingShiftData = null;
      cs.forceBooking = false;
      cs.pendingMoveOperation = null;
    } catch (_) {}
  
    try {
      window.state = window.state || {};
      state.pendingShiftData = null;
      state.forceBooking = false;
      state.pendingMoveOperation = null;
    } catch (_) {}
  
    hideModalSafely(warningModal, _focusSafeTarget());
  
    // Hide nav dropzones if exposed
    try { if (typeof window.hideMonthNavigationDropzones === 'function') window.hideMonthNavigationDropzones(); } catch (_) {}
  }
  window.closeWarningModal = closeWarningModal;
  
  async function proceedWithWarningModal() {
    const cs = ensureCalendarState();
    const _elements = window.elements || {};
    const warningModal = _elements.warningModal || el('warning-modal');
    const shiftForm = _elements.shiftForm || el('shift-form');
  
    // Remove focus from the warning modal before any aria-hidden changes
    hideModalSafely(warningModal, _focusSafeTarget());
  
    const moveOp = cs.pendingMoveOperation;
  
    // 1) DRAG/DROP OVERRIDE PATH
    if (moveOp && moveOp.type === 'drag-move' && moveOp.shiftId && moveOp.targetDateYMD) {
      console.log('[calendar] Proceeding with drag-move override:', moveOp);
  
      // clear stored op
      cs.pendingMoveOperation = null;
      window.state = window.state || {};
      state.pendingMoveOperation = null;
  
      try {
        if (typeof window.moveSingleShiftToDate !== 'function') {
          console.error('moveSingleShiftToDate is not defined; cannot complete override move.');
        } else {
          const result = await window.moveSingleShiftToDate(
            moveOp.shiftId,
            moveOp.targetDateYMD,
            { ignoreConflicts: true }
          );
  
          if (!result || !result.ok) {
            console.error('Override move failed:', result);
            alert('Could not move the event even after override. Please try again.');
          } else {
            // sync local `shifts`
            const idStr = String(moveOp.shiftId);
            const updated = result.updatedShift || null;
            if (Array.isArray(window.shifts)) {
              if (updated) {
                const idx = window.shifts.findIndex(s => String(s.id) === idStr);
                if (idx !== -1) window.shifts[idx] = updated;
                else window.shifts.push(updated);
              } else {
                const idx = window.shifts.findIndex(s => String(s.id) === idStr);
                if (idx !== -1) window.shifts[idx] = { ...window.shifts[idx], date: moveOp.targetDateYMD };
              }
            }
  
            // Force a visible refresh (covers cases where listeners aren’t wired)
            if (typeof window.renderCalendar === 'function') {
              window.renderCalendar();
            } else if (typeof window.refreshCalendar === 'function') {
              window.refreshCalendar();
            } else if (typeof window.loadMonth === 'function') {
              // fallback if you have a loader
              try { window.loadMonth(); } catch (_) {}
            }
  
            // Fire a custom event in case other components need to react
            try {
              document.dispatchEvent(new CustomEvent('bt:shift:moved', {
                detail: { id: idStr, date: moveOp.targetDateYMD, override: true }
              }));
            } catch (_) {}
  
            announceForScreenReader('Event moved with override.');
          }
        }
      } catch (err) {
        console.error('Error during override move:', err);
        alert('An error occurred while moving the event. Please try again.');
      }
  
      return;
    }
  
    // 2) FORM OVERRIDE PATH
    console.log('[calendar] Proceeding with form-based override booking – resubmitting form with forceBooking');
    cs.forceBooking = true;
    window.state = window.state || {};
    state.forceBooking = true;
  
    // Ensure the form can submit again (find the submit button robustly)
    const submitBtn =
      (window.elements?.submitButton || el('submit-shift')) ||
      (shiftForm ? shiftForm.querySelector('button[type="submit"],input[type="submit"]') : null);
    if (submitBtn) submitBtn.disabled = false;
  
    if (shiftForm) {
      const evt = new Event('submit', { bubbles: true, cancelable: true });
      shiftForm.dispatchEvent(evt);
    } else {
      console.warn('[calendar] shiftForm not found – cannot resubmit after override');
    }
  }
  window.proceedWithWarningModal = proceedWithWarningModal;
  
  // moveContext optional: { type: 'drag-move', shiftId, targetDateYMD }
  function showSimplifiedWarning(employeeId, moveContext) {
    const _elements = window.elements || {};
    const warningModal = _elements.warningModal || el('warning-modal');
    const warningText = _elements.warningText || el('warning-text');
    const conflictDetails = _elements.conflictDetails || el('conflict-details');
    const cancelBtn = _elements.cancelBookingBtn || el('cancel-booking');
  
    console.log(`Showing warning for employee ${employeeId}`, moveContext);
  
    try {
      const cs = ensureCalendarState();
      if (moveContext && typeof moveContext === 'object') {
        cs.pendingMoveOperation = moveContext;
      } else {
        cs.pendingMoveOperation = null;
      }
    } catch (_) {}
  
    const hostName = getEmployeeName(employeeId);
  
    if (warningText) {
      warningText.textContent = `${hostName} already has a shift scheduled on this date. Are you sure you want to proceed?`;
    }
    if (conflictDetails) conflictDetails.innerHTML = '';
  
    showModal(warningModal, cancelBtn);
    announceForScreenReader('Warning: Host already has a shift on this day. Choose to proceed or cancel.');
  }
  window.showSimplifiedWarning = showSimplifiedWarning;
  
  /* =========================
     Theme, Time & Validation (form)
  ========================= */
  function toggleThemeField() {
    const _e = window.elements || {};
    const typeSel = _e.shiftTypeSelect || el('shift-type');
    const themeField = _e.themeField || el('theme-field');
    const themeInput = _e.shiftThemeInput || el('shift-theme');
  
    if (!typeSel) return;
    const themed = typeSel.value === 'themed-trivia';
    if (themeField) themeField.style.display = themed ? 'block' : 'none';
    if (themeInput) {
      if (themed) themeInput.setAttribute('required', 'required');
      else { themeInput.removeAttribute('required'); themeInput.value = ''; }
    }
  }
  
  function autoSelectEndTime() {
    const _e = window.elements || {};
    const startSel = _e.startTimeSelect || el('start-time');
    const endSel = _e.endTimeSelect || el('end-time');
    if (!startSel || !endSel || !startSel.value) return;
  
    const startIdx = startSel.selectedIndex;
    const endIdx = Math.min(startIdx + 8, endSel.options.length - 1); // +2h (15min steps)
    endSel.selectedIndex = endIdx;
  }
  
  function validateShiftForm() {
    const _e = window.elements || {};
    const dateIn = _e.shiftDateInput || el('shift-date');
    const empSel = _e.shiftEmployeeSelect || el('shift-employee');
    const startSel = _e.startTimeSelect || el('start-time');
    const endSel = _e.endTimeSelect || el('end-time');
    const typeSel = _e.shiftTypeSelect || el('shift-type');
    const themeInput = _e.shiftThemeInput || el('shift-theme');
    const locSel = _e.shiftLocationSelect || el('shift-location');
  
    if (!dateIn?.value) { alert('Please select a date for the event.'); dateIn?.focus(); return false; }
    if (!empSel?.value) { alert('Please select a host for the event.'); empSel?.focus(); return false; }
    if (!startSel?.value) { alert('Please select a start time for the event.'); startSel?.focus(); return false; }
    if (!endSel?.value) { alert('Please select an end time for the event.'); endSel?.focus(); return false; }
    if (!typeSel?.value) { alert('Please select an event type.'); typeSel?.focus(); return false; }
  
    if (typeSel.value === 'themed-trivia' && !themeInput?.value.trim()) {
      alert('Please enter a theme for the themed trivia event.');
      themeInput?.focus();
      return false;
    }
  
    if (!locSel?.value) { alert('Please select a location for the event.'); locSel?.focus(); return false; }
  
    return true;
  }
  
  /* =========================
     New Host Modal
  ========================= */
  function openNewHostModal() {
    const _e = window.elements || {};
    const modal = _e.newHostModal || el('new-host-modal');
    const form = _e.newHostForm || el('new-host-form');
    const first = el('new-host-firstname');
  
    if (form) form.reset();
    showModal(modal, first);
    announceForScreenReader('Add new host form is open');
    console.log('Opening new host modal');
  }
  
  function closeNewHostModal() {
    const _e = window.elements || {};
    const modal = _e.newHostModal || el('new-host-modal');
    const addBtn = _e.addNewHostBtn || el('add-new-host');
  
    hideModalSafely(modal, addBtn || _focusSafeTarget());
  }
  
  // Create host -> Firestore
  function saveNewHost(e) {
    e.preventDefault();
  
    const firstName = el('new-host-firstname')?.value.trim();
    const lastName = el('new-host-lastname')?.value.trim();
    const nickname = el('new-host-nickname')?.value.trim();
    const phone = el('new-host-phone')?.value.trim();
    const email = el('new-host-email')?.value.trim();
    const emergencyContact = el('new-host-emergency-contact')?.value.trim();
    const emergencyPhone = el('new-host-emergency-phone')?.value.trim();
    const employeeId = el('new-host-employee-id')?.value.trim();
    const isActive = el('new-host-active')?.checked;
  
    if (!firstName) { alert('Please enter a first name for the host.'); el('new-host-firstname')?.focus(); return; }
    if (!lastName) { alert('Please enter a last name for the host.'); el('new-host-lastname')?.focus(); return; }
  
    const shortDisplayName = nickname || firstName;
    const fullDisplayName = nickname ? `${nickname} (${firstName} ${lastName})` : `${firstName} ${lastName}`;
  
    const newHost = {
      firstName, lastName, nickname, phone, email,
      emergencyContactName: emergencyContact,
      emergencyContactPhone: emergencyPhone,
      employeeID: employeeId,
      active: !!isActive,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
  
    const saveBtn = el('save-new-host');
    const originalText = saveBtn?.textContent;
    if (saveBtn) { saveBtn.textContent = 'Saving...'; saveBtn.disabled = true; }
  
    firebase.firestore().collection('employees').add(newHost)
      .then(docRef => {
        console.log('New host added with ID:', docRef.id);
        const newHostId = docRef.id;
  
        if (!window.employees) window.employees = {};
        window.employees[newHostId] = shortDisplayName;
  
        if (!window.employeesData) window.employeesData = {};
        window.employeesData[newHostId] = {
          ...newHost,
          id: newHostId,
          displayName: fullDisplayName,
          shortDisplayName
        };
  
        if (typeof window.addEmployeeToDropdowns === 'function') {
          window.addEmployeeToDropdowns(newHostId, fullDisplayName);
        } else {
          const employeeSelect = (window.elements?.employeeSelect || el('employee-select'));
          const shiftEmployeeSelect = (window.elements?.shiftEmployeeSelect || el('shift-employee'));
          if (employeeSelect) {
            const opt = document.createElement('option');
            opt.value = newHostId; opt.textContent = fullDisplayName;
            employeeSelect.appendChild(opt);
          }
          if (shiftEmployeeSelect) {
            const opt2 = document.createElement('option');
            opt2.value = newHostId; opt2.textContent = fullDisplayName;
            shiftEmployeeSelect.appendChild(opt2);
          }
        }
  
        (window.elements?.shiftEmployeeSelect || el('shift-employee')).value = newHostId;
        el('new-host-form')?.reset();
        closeNewHostModal();
        (window.elements?.startTimeSelect || el('start-time'))?.focus();
        announceForScreenReader(`New host ${shortDisplayName} has been added`);
      })
      .catch(error => {
        console.error('Error adding host to Firebase:', error);
        if (error.code === 'permission-denied') {
          alert('You do not have permission to add hosts. Please check your login status.');
        } else if (error.code === 'unavailable' || (error.name === 'FirebaseError' && String(error.message || '').includes('network'))) {
          alert('Network error. Please check your internet connection and try again.');
        } else {
          alert(`Error adding host: ${error.message}`);
        }
      })
      .finally(() => {
        if (saveBtn) { saveBtn.textContent = originalText || 'Save Host'; saveBtn.disabled = false; }
      });
  }
  
  /* =========================
     New Location Modal
  ========================= */
  function openNewLocationModal() {
    const _e = window.elements || {};
    const modal = _e.newLocationModal || el('new-location-modal');
    const form = _e.newLocationForm || el('new-location-form');
    const nameInput = _e.newLocationNameInput || el('new-location-name');
  
    if (form) form.reset();
    showModal(modal, nameInput);
  
    announceForScreenReader('Add new location form is open');
    console.log('Opening new location modal');
  }
  
  function closeNewLocationModal() {
    const _e = window.elements || {};
    const modal = _e.newLocationModal || el('new-location-modal');
    const addBtn = _e.addNewLocationBtn || el('add-new-location');
  
    hideModalSafely(modal, addBtn || _focusSafeTarget());
  }
  
  function saveNewLocation(e) {
    e.preventDefault();
  
    const locationName = el('new-location-name')?.value.trim();
    const address = el('new-location-address')?.value.trim();
    const contact = el('new-location-contact')?.value.trim();
    const phone = el('new-location-phone')?.value.trim();
    const email = el('new-location-email')?.value.trim();
    const isActive = !!el('new-location-active')?.checked;
  
    if (!locationName) { alert('Please enter a name for the new location.'); el('new-location-name')?.focus(); return; }
  
    const newLocation = {
      name: locationName,
      address: address || '',
      contact: contact || '',
      phone: phone || '',
      email: email || '',
      isActive,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
  
    const saveBtn = el('save-new-location');
    const originalText = saveBtn?.textContent;
    if (saveBtn) { saveBtn.textContent = 'Saving...'; saveBtn.disabled = true; }
  
    firebase.firestore().collection('locations').add(newLocation)
      .then(docRef => {
        console.log('New location added with ID:', docRef.id);
  
        if (!window.locationsData) window.locationsData = {};
        window.locationsData[locationName] = { ...newLocation, id: docRef.id };
  
        if (typeof window.addLocationToDropdowns === 'function') {
          window.addLocationToDropdowns(locationName);
        } else {
          const filterSel = (window.elements?.locationSelect || el('location-select'));
          const shiftLocSel = (window.elements?.shiftLocationSelect || el('shift-location'));
          if (filterSel) {
            const opt = document.createElement('option');
            opt.value = locationName; opt.textContent = locationName;
            filterSel.appendChild(opt);
          }
          if (shiftLocSel) {
            const opt2 = document.createElement('option');
            opt2.value = locationName; opt2.textContent = locationName;
            shiftLocSel.appendChild(opt2);
          }
        }
  
        (window.elements?.shiftLocationSelect || el('shift-location')).value = locationName;
        el('new-location-form')?.reset();
        closeNewLocationModal();
        (window.elements?.shiftNotesInput || el('shift-notes'))?.focus();
        announceForScreenReader(`New location ${locationName} has been added`);
      })
      .catch(error => {
        console.error('Error adding location to Firebase:', error);
        if (error.code === 'permission-denied') {
          alert('You do not have permission to add locations. Please check your login status.');
        } else if (error.code === 'unavailable' || (error.name === 'FirebaseError' && String(error.message || '').includes('network'))) {
          alert('Network error. Please check your internet connection and try again.');
        } else {
          alert(`Error adding location: ${error.message}`);
        }
      })
      .finally(() => {
        if (saveBtn) { saveBtn.textContent = originalText || 'Save Location'; saveBtn.disabled = false; }
      });
  }
  
  /* =========================
     Clear Day Modal (ARIA fixed)
  ========================= */
  function clearAllShiftsForDay(dateStr) {
    const clearDayModal = el('clear-day-modal');
    const title = el('clear-day-title');
    const warning = el('clear-day-warning');
    const list = el('day-events-list');
    const confirmBtn = el('confirm-clear-day');
    const cancelBtn = el('cancel-clear-day');
  
    // get shifts for date from global arr (quick)
    let shiftsForDay = [];
    try {
      if (Array.isArray(window.shifts)) {
        shiftsForDay = window.shifts.filter(s => s.date === dateStr);
      } else if (typeof window.getShiftsForDate === 'function') {
        shiftsForDay = window.getShiftsForDate(dateStr);
      }
    } catch (_) {}
  
    if (!shiftsForDay || shiftsForDay.length === 0) {
      alert('No events to clear for this date.');
      return;
    }
  
    const dateObj = new Date(dateStr);
    const formattedDate = getReadableDateString(dateObj);
  
    if (title) title.textContent = `Clear Events for ${formattedDate}`;
    if (warning) warning.textContent = `Are you sure you want to delete all ${shiftsForDay.length} events on ${formattedDate}? This action cannot be undone.`;
  
    if (list) {
      list.innerHTML = '';
      const count = document.createElement('div');
      count.className = 'event-count';
      count.textContent = `${shiftsForDay.length} event${shiftsForDay.length > 1 ? 's' : ''} will be permanently deleted:`;
      list.appendChild(count);
  
      shiftsForDay.forEach(shift => {
        const item = document.createElement('div');
        item.className = 'conflict-item';
  
        const employeeName = getEmployeeName(shift.employeeId);
        const eventType = getEventTypeName(shift.type);
        const timeInfo = `${shift.startTime || ''} - ${shift.endTime || ''}`.replace(/ - $/, '');
        const locationInfo = shift.location || 'No location';
  
        item.innerHTML = `
          <div class="conflict-event">${eventType}${shift.theme ? ': ' + shift.theme : ''}</div>
          <div class="conflict-time">${timeInfo} with ${employeeName}</div>
          <div class="conflict-location">${locationInfo}</div>
        `;
        list.appendChild(item);
      });
    }
  
    if (confirmBtn) {
      confirmBtn.setAttribute('data-date', dateStr);
      confirmBtn.removeAttribute('data-week-index');
    }
  
    showModal(clearDayModal, cancelBtn);
    announceForScreenReader(`Confirm clearing ${shiftsForDay.length} events on ${formattedDate}`);
  }
  
  function closeClearDayModal() {
    const modal = el('clear-day-modal');
    const confirmBtn = el('confirm-clear-day');
    hideModalSafely(modal, _focusSafeTarget());
    if (confirmBtn) {
      confirmBtn.removeAttribute('data-date');
      confirmBtn.removeAttribute('data-week-index');
    }
  }
  
  /* =========================
     Exports
  ========================= */
  window.openShiftModal = openShiftModal;
  window.closeShiftModal = closeShiftModal;
  window.toggleThemeField = toggleThemeField;
  window.autoSelectEndTime = autoSelectEndTime;
  window.validateShiftForm = validateShiftForm;
  window.openNewHostModal = openNewHostModal;
  window.closeNewHostModal = closeNewHostModal;
  window.saveNewHost = saveNewHost;
  window.openNewLocationModal = openNewLocationModal;
  window.closeNewLocationModal = closeNewLocationModal;
  window.saveNewLocation = saveNewLocation;
  window.clearAllShiftsForDay = clearAllShiftsForDay;
  window.closeClearDayModal = closeClearDayModal;
  window.showSimplifiedWarning = showSimplifiedWarning;
  window.proceedWithWarningModal = proceedWithWarningModal;