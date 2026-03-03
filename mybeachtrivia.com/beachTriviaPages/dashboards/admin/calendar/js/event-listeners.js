// event-listeners.js
// Functions for attaching event listeners and handling delegated events
// v2026-02-27 (button-route compatible)
// Updated: removed duplicate "Proceed Anyway" override system.
// Proceed Anyway is handled by modal-handlers.js (global capture listeners).

// -----------------------------
// Core attach
// -----------------------------
function attachEventListeners() {
    elements.prevMonthBtn.addEventListener('click', function () {
        goToPrevMonth();
        setTimeout(function () {
            hideMonthNavigationDropzones();
        }, 50);
    });

    elements.nextMonthBtn.addEventListener('click', function () {
        goToNextMonth();
        setTimeout(function () {
            hideMonthNavigationDropzones();
        }, 50);
    });

    document.addEventListener('dragend', function () {
        hideMonthNavigationDropzones();
    });

    document.addEventListener('click', function () {
        if (!state.draggedShiftId && state.copyingDayShifts.length === 0 && state.copyingWeekShifts.length === 0) {
            hideMonthNavigationDropzones();
        }
    });

    elements.employeeSelect.addEventListener('change', handleFilterChange);
    elements.eventSelect.addEventListener('change', handleFilterChange);
    elements.locationSelect.addEventListener('change', handleFilterChange);

    elements.expandAllBtn.addEventListener('click', expandAllShifts);
    elements.collapseAllBtn.addEventListener('click', collapseAllShifts);

    elements.cancelShiftBtn.addEventListener('click', closeShiftModal);
    elements.cancelBookingBtn.addEventListener('click', closeWarningModal);

    const confirmClearDayBtn = document.getElementById('confirm-clear-day');
    const cancelClearDayBtn = document.getElementById('cancel-clear-day');

    if (confirmClearDayBtn) {
        confirmClearDayBtn.addEventListener('click', function () {
            if (confirmClearDayBtn.hasAttribute('data-week-index')) {
                executeAllWeekShiftsClear();
            } else {
                executeAllShiftsClear();
            }
        });
    }

    if (cancelClearDayBtn) {
        cancelClearDayBtn.addEventListener('click', closeClearDayModal);
    }

    elements.shiftTypeSelect.addEventListener('change', toggleThemeField);
    elements.startTimeSelect.addEventListener('change', autoSelectEndTime);

    // ------------------------------------------------------------
    // ✅ Button-route wiring: click -> saveShift
    // ------------------------------------------------------------
    _wireSaveShiftButtonOnce();

    // ------------------------------------------------------------
    // ✅ Submit-gate: only matters if shiftForm is actually submitted
    // (kept for safety / backward compatibility)
    // ------------------------------------------------------------
    if (elements.shiftForm && !elements.shiftForm.dataset.submitGateWired) {
        elements.shiftForm.dataset.submitGateWired = '1';
        elements.shiftForm.addEventListener('submit', handleShiftFormSubmitGate, true);
    }

    elements.addNewHostBtn.addEventListener('click', openNewHostModal);
    elements.cancelNewHostBtn.addEventListener('click', closeNewHostModal);
    elements.newHostForm.addEventListener('submit', saveNewHost);

    elements.addNewLocationBtn.addEventListener('click', openNewLocationModal);
    elements.cancelNewLocationBtn.addEventListener('click', closeNewLocationModal);
    elements.newLocationForm.addEventListener('submit', saveNewLocation);

    if (!document.body.dataset.calendarDelegatesWired) {
        document.body.dataset.calendarDelegatesWired = '1';
        document.addEventListener('click', handleDelegatedClicks);
        document.addEventListener('keydown', handleKeyboardEvents);
    }

    elements.calendarBody.addEventListener('dragstart', window.handleDragStart, false);
    elements.calendarBody.addEventListener('dragend', window.handleDragEnd, false);
    elements.calendarBody.addEventListener('dragover', window.handleDragOver, false);
    elements.calendarBody.addEventListener('drop', window.handleDrop, false);

    initializeModalAccessibility();
}

// -----------------------------
// Accessibility init
// -----------------------------
function initializeModalAccessibility() {
    const allModals = document.querySelectorAll('.modal');
    allModals.forEach(modal => {
        if (modal.style.display !== 'flex') {
            modal.setAttribute('aria-hidden', 'true');
        } else {
            modal.setAttribute('aria-hidden', 'false');
        }
    });

    allModals.forEach(modal => {
        if (!modal.hasAttribute('role')) {
            modal.setAttribute('role', 'dialog');
        }
    });

    const modalMappings = {
        'shift-modal': 'modal-title',
        'warning-modal': 'warning-title',
        'clear-day-modal': 'clear-day-title',
        'new-host-modal': 'new-host-title',
        'new-location-modal': 'new-location-title',
        'copy-shift-modal': 'copy-shift-title'
    };

    Object.entries(modalMappings).forEach(([modalId, titleId]) => {
        const modal = document.getElementById(modalId);
        if (modal && !modal.hasAttribute('aria-labelledby')) {
            modal.setAttribute('aria-labelledby', titleId);
        }
    });

    console.log('Modal accessibility attributes initialized');
}

// -----------------------------
// ✅ Button-route save wiring
// -----------------------------
function _wireSaveShiftButtonOnce() {
    const btn =
        (elements && elements.submitButton) ||
        document.getElementById('save-shift-btn') ||
        document.querySelector('button[form="shift-form"]');

    if (!btn) return;
    if (btn.dataset.saveShiftWired === '1') return;
    btn.dataset.saveShiftWired = '1';

    btn.addEventListener('click', function (e) {
        try {
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        } catch (_) {}

        try {
            if (typeof window.saveShift === 'function') {
                window.saveShift(e);
            } else if (typeof saveShift === 'function') {
                saveShift(e);
            } else {
                console.error('[calendar] saveShift not found');
            }
        } catch (err) {
            console.error('[calendar] saveShift click handler error:', err);
            alert('There was an error saving the event. Please try again.');
        }
    }, true);

    btn.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        try {
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        } catch (_) {}
        try {
            if (typeof window.saveShift === 'function') window.saveShift(e);
            else if (typeof saveShift === 'function') saveShift(e);
        } catch (err) {
            console.error('[calendar] saveShift keydown handler error:', err);
        }
    }, true);
}

// ------------------------------------------------------------
// ✅ Submit-gate helpers
// ------------------------------------------------------------
function _readShiftFormData() {
    const date = (elements.shiftDateInput?.value || '').trim();
    const employeeId = (elements.shiftEmployeeSelect?.value || '').trim();
    const startTime = (elements.startTimeSelect?.value || '').trim();
    const endTime = (elements.endTimeSelect?.value || '').trim();
    const type = (elements.shiftTypeSelect?.value || '').trim();
    const theme = (elements.shiftThemeInput?.value || '').trim();
    const location = (elements.shiftLocationSelect?.value || '').trim();
    const notes = (elements.shiftNotesInput?.value || '').trim();
    return { date, employeeId, startTime, endTime, type, theme, location, notes };
}

function _getEditingContext() {
    const ctx = { isEditing: false, editingShiftId: null, forceBooking: false };

    // Prefer CalendarState if present
    try {
        if (window.CalendarState) {
            ctx.isEditing = !!window.CalendarState.isEditing;
            ctx.editingShiftId = window.CalendarState.editingShiftId || null;
            ctx.forceBooking = !!window.CalendarState.forceBooking;
            return ctx;
        }
    } catch (_) {}

    try {
        if (typeof state !== 'undefined') {
            ctx.isEditing = !!state.isEditing;
            ctx.editingShiftId = state.editingShiftId || null;
            ctx.forceBooking = !!state.forceBooking;
        }
    } catch (_) {}

    return ctx;
}

function _setPendingShiftData(pendingData) {
    try {
        if (window.CalendarState) {
            window.CalendarState.pendingShiftData = pendingData;
            return;
        }
    } catch (_) {}

    try {
        if (typeof state !== 'undefined') state.pendingShiftData = pendingData;
    } catch (_) {}
}

function _hasHostConflict({ date, employeeId }, editingShiftId) {
    if (!date || !employeeId) return false;
    const editId = editingShiftId ? String(editingShiftId) : null;

    return (Array.isArray(shifts) ? shifts : []).some(s => {
        if (!s) return false;
        if (String(s.date) !== String(date)) return false;
        if (String(s.employeeId) !== String(employeeId)) return false;
        if (editId && String(s.id) === editId) return false;
        return true;
    });
}

function handleShiftFormSubmitGate(e) {
    const formData = _readShiftFormData();
    const ctx = _getEditingContext();

    // If forceBooking is already on, let normal submit/route proceed
    if (ctx.forceBooking) return;

    const conflict = _hasHostConflict(formData, ctx.editingShiftId);
    if (!conflict) return;

    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

    _setPendingShiftData(formData);

    try { if (elements.submitButton) elements.submitButton.disabled = true; } catch (_) {}

    // showSimplifiedWarning is exposed by modal-handlers.js
    if (typeof showSimplifiedWarning === 'function') {
        try { showSimplifiedWarning(formData.employeeId); } catch (_) {}
    } else {
        try {
            elements.warningText.textContent = 'Host already has a shift on this date. Proceed anyway?';
            elements.conflictDetails.innerHTML = '';
            elements.warningModal.style.display = 'flex';
        } catch (_) {}
    }

    return false;
}

// ------------------------------------------------------------
// Delegated clicks + keyboard handlers
// ------------------------------------------------------------
function handleDelegatedClicks(e) {
    console.log("Click event target:", e.target);
    console.log("Click event target classList:", e.target.classList);

    if (e.target.classList.contains('add-button')) {
        e.stopPropagation();
        const dateStr = e.target.getAttribute('data-date');
        openShiftModal(dateStr);
        return;
    }

    if (e.target.classList.contains('clear-day-button')) {
        e.stopPropagation();
        const dateStr = e.target.getAttribute('data-date');
        console.log("Clear day button clicked for date:", dateStr);
        clearAllShiftsForDay(dateStr);
        return;
    }

    if (e.target.classList.contains('week-clear-button')) {
        e.stopPropagation();
        const weekIndex = parseInt(e.target.getAttribute('data-week-index'));
        console.log("Week clear button clicked for week index:", weekIndex);
        clearAllShiftsForWeek(weekIndex);
        return;
    }

    if (e.target.classList.contains('cell-copy-button')) {
        e.stopPropagation();
        console.log("Cell copy button clicked - drag and drop functionality only");
        return;
    }

    if (e.target.classList.contains('delete-button')) {
        e.stopPropagation();
        const shiftId = e.target.getAttribute('data-id');
        console.log("Delete button clicked for shift ID:", shiftId);
        deleteShift(shiftId);
        return;
    }

    if (
        e.target.classList.contains('copy-button') ||
        e.target.classList.contains('copy-icon') ||
        (e.target.parentElement && e.target.parentElement.classList.contains('copy-button'))
    ) {
        e.stopPropagation();
        console.log("Copy button clicked");
        return;
    }

    if (
        e.target.classList.contains('toggle-button') ||
        (e.target.parentElement && e.target.parentElement.classList.contains('toggle-button'))
    ) {
        e.stopPropagation();
        const toggleButton = e.target.classList.contains('toggle-button') ? e.target : e.target.parentElement;
        toggleShiftCollapse(toggleButton);
        return;
    }

    if (
        e.target.classList.contains('week-toggle-button') ||
        (e.target.parentElement && e.target.parentElement.classList.contains('week-toggle-button'))
    ) {
        e.stopPropagation();
        const toggleButton = e.target.classList.contains('week-toggle-button') ? e.target : e.target.parentElement;
        toggleWeekCollapse(toggleButton);
        return;
    }

    if (
        e.target.closest('.shift') &&
        !e.target.classList.contains('delete-button') &&
        !e.target.classList.contains('toggle-button') &&
        !e.target.classList.contains('copy-button') &&
        !e.target.classList.contains('copy-icon') &&
        !e.target.closest('.toggle-button') &&
        !e.target.closest('.copy-button') &&
        !e.target.classList.contains('multi-shift-badge') &&
        !e.target.closest('.shift-controls')
    ) {
        const shift = e.target.closest('.shift');
        const shiftId = shift.getAttribute('data-id');
        console.log("Shift clicked for editing, ID:", shiftId);
        editShift(shiftId);
        return;
    }
}

function handleKeyboardEvents(e) {
    if (e.key === 'Escape') {
        if (typeof window.closeTopModalIfAny === 'function') {
            if (window.closeTopModalIfAny()) {
                e.preventDefault();
                return;
            }
        }
        hideMonthNavigationDropzones();
    }

    if (e.key === 'Enter') {
        if (e.target.classList.contains('add-button')) {
            e.preventDefault();
            const dateStr = e.target.getAttribute('data-date');
            openShiftModal(dateStr);
            return;
        }

        if (e.target.classList.contains('clear-day-button')) {
            e.preventDefault();
            const dateStr = e.target.getAttribute('data-date');
            clearAllShiftsForDay(dateStr);
            return;
        }

        if (e.target.classList.contains('week-clear-button')) {
            e.preventDefault();
            const weekIndex = parseInt(e.target.getAttribute('data-week-index'));
            clearAllShiftsForWeek(weekIndex);
            return;
        }

        if (e.target.classList.contains('cell-copy-button')) {
            e.preventDefault();
            return;
        }

        if (e.target.classList.contains('delete-button')) {
            e.preventDefault();
            const shiftId = e.target.getAttribute('data-id');
            deleteShift(shiftId);
            return;
        }

        if (e.target.classList.contains('copy-button') || e.target.classList.contains('copy-icon')) {
            e.preventDefault();
            return;
        }

        if (e.target.classList.contains('toggle-button')) {
            e.preventDefault();
            toggleShiftCollapse(e.target);
            return;
        }

        if (e.target.classList.contains('week-toggle-button')) {
            e.preventDefault();
            toggleWeekCollapse(e.target);
            return;
        }

        if (e.target.classList.contains('shift')) {
            e.preventDefault();
            const shiftId = e.target.getAttribute('data-id');
            editShift(shiftId);
            return;
        }
    }

    const focusedElement = document.activeElement;
    if (focusedElement && focusedElement.tagName === 'TD' &&
        focusedElement.closest('#calendar-body')) {
        handleCalendarKeyNavigation(e, focusedElement);
    }
}

function handleCalendarKeyNavigation(e, currentCell) {
    const allCells = Array.from(elements.calendarBody.querySelectorAll('td'));
    const currentIndex = allCells.indexOf(currentCell);

    if (currentIndex === -1) return;

    let nextIndex = currentIndex;

    switch (e.key) {
        case 'ArrowRight':
            nextIndex = Math.min(currentIndex + 1, allCells.length - 1);
            e.preventDefault();
            break;
        case 'ArrowLeft':
            nextIndex = Math.max(currentIndex - 1, 0);
            e.preventDefault();
            break;
        case 'ArrowDown':
            nextIndex = Math.min(currentIndex + 9, allCells.length - 1);
            e.preventDefault();
            break;
        case 'ArrowUp':
            nextIndex = Math.max(currentIndex - 9, 0);
            e.preventDefault();
            break;
        case 'Home':
            nextIndex = currentIndex - (currentIndex % 9);
            e.preventDefault();
            break;
        case 'End':
            nextIndex = currentIndex + (8 - (currentIndex % 9));
            e.preventDefault();
            break;
        case 'PageUp':
            goToPrevMonth();
            e.preventDefault();
            return;
        case 'PageDown':
            goToNextMonth();
            e.preventDefault();
            return;
        default:
            return;
    }

    if (nextIndex !== currentIndex && allCells[nextIndex]) {
        allCells[nextIndex].setAttribute('tabindex', '0');
        allCells[nextIndex].focus();
        if (currentCell !== allCells[nextIndex]) {
            currentCell.setAttribute('tabindex', '-1');
        }
    }
}

function handleFilterChange() {
    state.filters.employee = elements.employeeSelect.value;
    state.filters.eventType = elements.eventSelect.value;
    state.filters.location = elements.locationSelect.value;
    renderCalendar();
}

function populateTimeDropdowns() {
    const timeOptions = generateTimeOptions();

    const startFragment = document.createDocumentFragment();
    const endFragment = document.createDocumentFragment();

    const startDefaultOption = document.createElement('option');
    startDefaultOption.value = '';
    startDefaultOption.textContent = 'Select';
    startFragment.appendChild(startDefaultOption);

    const endDefaultOption = document.createElement('option');
    endDefaultOption.value = '';
    endDefaultOption.textContent = 'Select';
    endFragment.appendChild(endDefaultOption);

    timeOptions.forEach(time => {
        const startOption = document.createElement('option');
        startOption.value = time;
        startOption.textContent = time;
        startFragment.appendChild(startOption);

        const endOption = document.createElement('option');
        endOption.value = time;
        endOption.textContent = time;
        endFragment.appendChild(endOption);
    });

    elements.startTimeSelect.innerHTML = '';
    elements.endTimeSelect.innerHTML = '';
    elements.startTimeSelect.appendChild(startFragment);
    elements.endTimeSelect.appendChild(endFragment);
}