// event-crud.js
// Functions for CRUD operations on shifts and events
// Updated 2025-10-21: routed all Firestore I/O through shiftService,
// safer local-state updates, and small UX/accessibility touches.

/* =========================
 *  CLEAR ALL (ONE DAY)
 * ========================= */
function executeAllShiftsClear() {
    const dateStr = document.getElementById('confirm-clear-day').getAttribute('data-date');
    if (!dateStr) {
      console.error('No date provided for clearing events');
      return;
    }
  
    // Use existing in-memory view (faster & already filtered by UI)
    const shiftsToDelete = getShiftsForDate(dateStr);
    if (!Array.isArray(shiftsToDelete) || shiftsToDelete.length === 0) {
      console.warn('No shifts found to delete');
      closeClearDayModal();
      return;
    }
  
    const deletePromises = shiftsToDelete.map(shift =>
      deleteShiftFromFirebase(shift.id).catch(err => {
        console.error(`Error deleting shift ${shift.id}:`, err);
        return false; // mark failure but continue
      })
    );
  
    Promise.all(deletePromises)
      .then(results => {
        const successCount = results.filter(Boolean).length;
  
        // Remove deleted items from local state (immutably)
        const idsToDelete = new Set(shiftsToDelete.map(s => s.id));
        shifts = shifts.filter(s => !idsToDelete.has(s.id));
  
        closeClearDayModal();
  
        if (successCount === shiftsToDelete.length) {
          alert(`Successfully deleted all ${successCount} events.`);
        } else {
          alert(`Deleted ${successCount} of ${shiftsToDelete.length} events. Some deletions may have failed.`);
        }
  
        announceForScreenReader(`Deleted ${successCount} events.`);
        renderCalendar();
      })
      .catch(error => {
        console.error('Error deleting shifts:', error);
        alert('An error occurred while deleting events. Please try again.');
        closeClearDayModal();
      });
  }
  
  function clearAllShiftsForDay(dateStr) {
    const shiftsForDay = getShiftsForDate(dateStr);
  
    if (!Array.isArray(shiftsForDay) || shiftsForDay.length === 0) {
      alert('No events to clear for this date.');
      return;
    }
  
    const dateObj = new Date(dateStr);
    const formattedDate = getReadableDateString(dateObj);
  
    document.getElementById('clear-day-title').textContent = `Clear Events for ${formattedDate}`;
    document.getElementById('clear-day-warning').textContent =
      `Are you sure you want to delete all ${shiftsForDay.length} events on ${formattedDate}? This action cannot be undone.`;
  
    const eventsContainer = document.getElementById('day-events-list');
    eventsContainer.innerHTML = '';
  
    const countElement = document.createElement('div');
    countElement.className = 'event-count';
    countElement.textContent = `${shiftsForDay.length} event${shiftsForDay.length > 1 ? 's' : ''} will be permanently deleted:`;
    eventsContainer.appendChild(countElement);
  
    shiftsForDay.forEach(shift => {
      const shiftItem = document.createElement('div');
      shiftItem.className = 'conflict-item';
  
      const employeeName = employees[shift.employeeId] || 'Unknown host';
      const eventType = eventTypes[shift.type] || shift.type;
      const timeInfo = `${shift.startTime} - ${shift.endTime}`;
      const locationInfo = shift.location || 'No location';
  
      shiftItem.innerHTML = `
        <div class="conflict-event">${eventType}${shift.theme ? ': ' + shift.theme : ''}</div>
        <div class="conflict-time">${timeInfo} with ${employeeName}</div>
        <div class="conflict-location">${locationInfo}</div>
      `;
  
      eventsContainer.appendChild(shiftItem);
    });
  
    document.getElementById('confirm-clear-day').setAttribute('data-date', dateStr);
  
    const clearDayModal = document.getElementById('clear-day-modal');
    clearDayModal.style.display = 'flex';
    clearDayModal.setAttribute('aria-hidden', 'false');
  
    setTimeout(() => document.getElementById('cancel-clear-day').focus(), 100);
    announceForScreenReader(`Confirm clearing ${shiftsForDay.length} events on ${formattedDate}`);
  }
  
  function closeClearDayModal() {
    const modal = document.getElementById('clear-day-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    }
    const confirmButton = document.getElementById('confirm-clear-day');
    if (confirmButton) confirmButton.removeAttribute('data-date');
  }
  
  /* =========================
   *  COLLAPSE / EXPAND
   * ========================= */
  function toggleShiftCollapse(toggleButton) {
    const shiftDiv = toggleButton.closest('.shift');
    if (!shiftDiv) return;
  
    const shiftId = shiftDiv.getAttribute('data-id');
    const triangle = toggleButton.querySelector('div');
  
    if (shiftDiv.classList.contains('collapsed')) {
      shiftDiv.classList.remove('collapsed');
      if (triangle) triangle.className = 'triangle-down';
      shiftDiv.setAttribute('aria-expanded', 'true');
      state.collapsedShifts.delete(shiftId);
    } else {
      shiftDiv.classList.add('collapsed');
      if (triangle) triangle.className = 'triangle-right';
      shiftDiv.setAttribute('aria-expanded', 'false');
      state.collapsedShifts.add(shiftId);
    }
  }
  
  function expandAllShifts() {
    const shiftElements = document.querySelectorAll('.shift');
    state.collapsedShifts.clear();
  
    shiftElements.forEach(shiftDiv => {
      const triangle = shiftDiv.querySelector('.toggle-button div');
      shiftDiv.classList.remove('collapsed');
      if (triangle) triangle.className = 'triangle-down';
      shiftDiv.setAttribute('aria-expanded', 'true');
    });
  
    announceForScreenReader('All events expanded');
  }
  
  function collapseAllShifts() {
    const shiftElements = document.querySelectorAll('.shift');
  
    shiftElements.forEach(shiftDiv => {
      const shiftId = shiftDiv.getAttribute('data-id');
      const triangle = shiftDiv.querySelector('.toggle-button div');
      if (shiftId) state.collapsedShifts.add(shiftId);
      shiftDiv.classList.add('collapsed');
      if (triangle) triangle.className = 'triangle-right';
      shiftDiv.setAttribute('aria-expanded', 'false');
    });
  
    announceForScreenReader('All shifts collapsed');
  }
  
  function toggleWeekCollapse(weekToggleButton) {
    const weekIndex = parseInt(weekToggleButton.getAttribute('data-week-index'));
    if (isNaN(weekIndex)) return;
  
    const triangle = weekToggleButton.querySelector('div');
    const weekShifts = getShiftsForWeek(weekIndex);
    if (weekShifts.length === 0) return;
  
    const isCollapsed = triangle.className === 'triangle-right';
    const weekToggleButtons = document.querySelectorAll(`.week-toggle-button[data-week-index="${weekIndex}"]`);
    const weekRow = document.querySelector(`tr[data-week-index="${weekIndex}"]`);
    if (!weekRow) return;
  
    const shiftElements = [];
    weekRow.querySelectorAll('.shift-container').forEach(container => {
      container.querySelectorAll('.shift').forEach(shift => shiftElements.push(shift));
    });
  
    if (isCollapsed) {
      shiftElements.forEach(shiftDiv => {
        const shiftId = shiftDiv.getAttribute('data-id');
        if (!shiftId) return;
        state.collapsedShifts.delete(shiftId);
        shiftDiv.classList.remove('collapsed');
        const shiftToggle = shiftDiv.querySelector('.toggle-button div');
        if (shiftToggle) shiftToggle.className = 'triangle-down';
        shiftDiv.setAttribute('aria-expanded', 'true');
      });
      weekToggleButtons.forEach(btn => {
        const t = btn.querySelector('div');
        if (t) t.className = 'triangle-down';
      });
      announceForScreenReader(`Expanded all events for week ${weekIndex + 1}`);
    } else {
      shiftElements.forEach(shiftDiv => {
        const shiftId = shiftDiv.getAttribute('data-id');
        if (!shiftId) return;
        state.collapsedShifts.add(shiftId);
        shiftDiv.classList.add('collapsed');
        const shiftToggle = shiftDiv.querySelector('.toggle-button div');
        if (shiftToggle) shiftToggle.className = 'triangle-right';
        shiftDiv.setAttribute('aria-expanded', 'false');
      });
      weekToggleButtons.forEach(btn => {
        const t = btn.querySelector('div');
        if (t) t.className = 'triangle-right';
      });
      announceForScreenReader(`Collapsed all events for week ${weekIndex + 1}`);
    }
  }
  
  /* =========================
   *  DELETE / EDIT / SAVE
   * ========================= */
  function deleteShift(shiftId) {
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) return;
  
    const eventDetails = `${eventTypes[shift.type] || shift.type} on ${getReadableDateString(new Date(shift.date))}`;
  
    if (confirm(`Are you sure you want to delete this event?\n\n${eventDetails}`)) {
      deleteShiftFromFirebase(shiftId)
        .then(() => {
          shifts = shifts.filter(s => s.id !== shiftId);
          console.log(`Deleted shift ${shiftId}, remaining: ${shifts.length}`);
          checkArrayIntegrity();
          renderCalendar();
          announceForScreenReader(`Deleted ${eventDetails}`);
        })
        .catch(error => {
          console.error('Error deleting shift from Firebase:', error);
          alert('Could not delete event. Please try again later.');
        });
    }
  }
  
  // ROUTED: Firestore delete via shiftService
  function deleteShiftFromFirebase(shiftId) {
    if (!window.shiftService) {
      // Fallback (should not happen if shift-service.js is included first)
      return firebase.firestore().collection('shifts').doc(String(shiftId)).delete().then(() => true);
    }
    return window.shiftService.deleteShift(shiftId);
  }
  
  function editShift(shiftId) {
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) {
      console.error(`Shift with ID ${shiftId} not found`);
      return;
    }
  
    state.isEditing = true;
    state.editingShiftId = shiftId;
  
    elements.modalTitle.textContent = 'Edit Event';
    elements.submitButton.textContent = 'Update Event';
  
    try {
      elements.shiftDateInput.value = shift.date;
      elements.shiftEmployeeSelect.value = shift.employeeId;
  
      selectDropdownOptionByValue(elements.startTimeSelect, shift.startTime);
      selectDropdownOptionByValue(elements.endTimeSelect, shift.endTime);
  
      elements.shiftTypeSelect.value = shift.type;
      toggleThemeField();
      if (shift.type === 'themed-trivia') {
        elements.shiftThemeInput.value = shift.theme || '';
      }
  
      elements.shiftLocationSelect.value = shift.location;
      elements.shiftNotesInput.value = shift.notes || '';
  
      elements.shiftModal.style.display = 'flex';
      elements.shiftDateInput.focus();
  
      const hostName = employees[shift.employeeId] || 'Unknown host';
      announceForScreenReader(`Editing event for ${hostName} on ${getReadableDateString(new Date(shift.date))}`);
    } catch (error) {
      console.error('Error editing shift:', error);
      alert('There was an error while loading the event details. Please try again.');
    }
  }
  
  function saveShift(e) {
    if (e?.preventDefault) e.preventDefault();
  
    if (!validateShiftForm()) return;
  
    const date = elements.shiftDateInput.value;
    const employeeId = elements.shiftEmployeeSelect.value;
    const startTime = elements.startTimeSelect.value;
    const endTime = elements.endTimeSelect.value;
    const type = elements.shiftTypeSelect.value;
    const theme = type === 'themed-trivia' ? elements.shiftThemeInput.value : '';
    const location = elements.shiftLocationSelect.value;
    const notes = elements.shiftNotesInput.value;
  
    const shiftData = { date, employeeId, startTime, endTime, type, theme, location, notes };
  
    // Double-book check (same host & date)
    if (!state.forceBooking) {
      const conflicts = checkForDoubleBooking(shiftData, state.editingShiftId);
      if (conflicts.length > 0) {
        state.pendingShiftData = shiftData;
        if (elements.submitButton) {
          try { elements.submitButton.disabled = true; } catch (_) {}
        }
        showSimplifiedWarning(employeeId);
        return;
      }
    }
    state.forceBooking = false;
  
    let actionType = 'Added';
    const btn = elements.submitButton;
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;
  
    let op;
    if (state.isEditing && state.editingShiftId) {
      actionType = 'Updated';
      const updated = { ...(shifts.find(s => s.id === state.editingShiftId) || {}), ...shiftData };
  
      op = updateShiftInFirebase(state.editingShiftId, updated).then(() => {
        const idx = shifts.findIndex(s => s.id === state.editingShiftId);
        if (idx !== -1) shifts[idx] = { ...updated, id: state.editingShiftId };
        return updated;
      });
    } else {
      op = saveShiftToFirebase(shiftData).then(newId => {
        const created = { ...shiftData, id: newId };
        shifts.push(created);
        return created;
      });
    }
  
    op.then(shift => {
        closeShiftModal();
        renderCalendar();
        const eventType = eventTypes[type] || type;
        const employeeName = employees[employeeId] || 'Unknown host';
        announceForScreenReader(`${actionType} ${eventType} event for ${employeeName} on ${getReadableDateString(new Date(date))}`);
      })
      .catch(err => {
        console.error('Error saving shift:', err);
        alert('There was an error saving the event. Please try again.');
      })
      .finally(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      });
  }
  
  /* ROUTED: Firestore write helpers via shiftService (with safe fallbacks) */
  function saveShiftToFirebase(shiftData) {
    if (window.shiftService?.saveShift) return window.shiftService.saveShift(shiftData);
    // Fallback if shiftService not loaded for some reason
    return firebase.firestore().collection('shifts').add({
      ...shiftData,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(docRef => docRef.id);
  }
  
  function updateShiftInFirebase(shiftId, shiftData) {
    if (window.shiftService?.updateShift) return window.shiftService.updateShift(shiftId, shiftData);
    const id = String(shiftId);
    return firebase.firestore().collection('shifts').doc(id).update({
      ...shiftData,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => id);
  }
  
  function loadShiftsFromFirebase() {
    console.log('Loading shifts from Firebase (via shiftService)...');
    if (window.shiftService?.getAllShifts) {
      return window.shiftService.getAllShifts();
    }
    // Fallback (should not be used if shiftService is present)
    return firebase.firestore().collection('shifts').get().then(qs => {
      const out = [];
      qs.forEach(doc => {
        const d = doc.data();
        out.push({
          id: doc.id,
          date: d.date,
          employeeId: d.employeeId,
          startTime: d.startTime,
          endTime: d.endTime,
          type: d.type,
          theme: d.theme || '',
          location: d.location,
          notes: d.notes || ''
        });
      });
      return out;
    }).catch(err => {
      console.error('Error loading shifts:', err);
      return [];
    });
  }
  
  /* =========================
   *  MOVE / VALIDATION / DEBUG
   * ========================= */
  function moveShift(shiftId, targetDate) {
    console.log(`Moving shift ${shiftId} → ${targetDate}`);
    const original = shifts.find(s => s.id === shiftId);
    if (!original) {
      console.error(`Cannot find shift with ID: ${shiftId}`);
      return Promise.resolve(false);
    }
    const moved = { ...original, date: targetDate };
  
    return updateShiftInFirebase(shiftId, moved)
      .then(() => {
        const next = shifts.filter(s => s.id !== shiftId);
        next.push(moved);
        shifts = next;
        console.log(`Successfully moved shift ${shiftId} to ${targetDate}`);
        return true;
      })
      .catch(error => {
        console.error('Error moving shift:', error);
        alert('Could not move event. Please try again later.');
        return false;
      });
  }
  
  function checkForDoubleBooking(newShift, excludeShiftId = null) {
    try {
      const { date, employeeId } = newShift;
      return shifts.filter(s =>
        s.date === date &&
        s.employeeId === employeeId &&
        (excludeShiftId === null || s.id !== excludeShiftId)
      );
    } catch (err) {
      console.error('Error checking double booking:', err);
      return [];
    }
  }
  
  function checkArrayIntegrity() {
    const ids = shifts.map(s => s.id);
    const seen = new Set();
    let ok = true;
    ids.forEach(id => {
      if (seen.has(id)) ok = false;
      seen.add(id);
    });
    if (!ok) {
      console.error('DUPLICATE IDs DETECTED IN SHIFTS ARRAY!');
      const counts = {};
      ids.forEach(id => counts[id] = (counts[id] || 0) + 1);
      Object.entries(counts).forEach(([id, n]) => {
        if (n > 1) {
          console.error(`ID ${id} appears ${n} times`, shifts.filter(s => s.id === id));
        }
      });
    }
    return ok;
  }
  