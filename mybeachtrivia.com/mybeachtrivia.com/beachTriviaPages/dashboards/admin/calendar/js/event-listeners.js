// event-listeners.js
// Functions for attaching event listeners and handling delegated events

// Use event delegation for handling dynamic elements
function attachEventListeners() {
    // Navigation buttons with additional dropzone hiding
    elements.prevMonthBtn.addEventListener('click', function(e) {
        goToPrevMonth();
        // Force hide dropzones after navigation
        setTimeout(function() {
            if (elements.prevMonthDropzone && elements.nextMonthDropzone) {
                elements.prevMonthDropzone.style.display = 'none';
                elements.nextMonthDropzone.style.display = 'none';
                elements.prevMonthDropzone.style.opacity = '0';
                elements.nextMonthDropzone.style.opacity = '0';
                elements.prevMonthDropzone.classList.remove('active');
                elements.nextMonthDropzone.classList.remove('active');
            }
        }, 50);
    });
    
    elements.nextMonthBtn.addEventListener('click', function(e) {
        goToNextMonth();
        // Force hide dropzones after navigation
        setTimeout(function() {
            if (elements.prevMonthDropzone && elements.nextMonthDropzone) {
                elements.prevMonthDropzone.style.display = 'none';
                elements.nextMonthDropzone.style.display = 'none';
                elements.prevMonthDropzone.style.opacity = '0';
                elements.nextMonthDropzone.style.opacity = '0';
                elements.prevMonthDropzone.classList.remove('active');
                elements.nextMonthDropzone.classList.remove('active');
            }
        }, 50);
    });
    
    // Add global dragend handler to ensure dropzones always get hidden
    document.addEventListener('dragend', function() {
        hideMonthNavigationDropzones();
    });
    
    // Add global click handler to hide dropzones when clicking elsewhere
    document.addEventListener('click', function(e) {
        // Only hide if we're not currently in a drag operation
        if (!state.draggedShiftId && state.copyingDayShifts.length === 0 && state.copyingWeekShifts.length === 0) {
            hideMonthNavigationDropzones();
        }
    });
    
    // Filters
    elements.employeeSelect.addEventListener('change', handleFilterChange);
    elements.eventSelect.addEventListener('change', handleFilterChange);
    elements.locationSelect.addEventListener('change', handleFilterChange);
    
    // View control buttons
    elements.expandAllBtn.addEventListener('click', expandAllShifts);
    elements.collapseAllBtn.addEventListener('click', collapseAllShifts);
    
    // Modal buttons
    elements.cancelShiftBtn.addEventListener('click', closeShiftModal);
    elements.cancelBookingBtn.addEventListener('click', closeWarningModal);
    
    // Clear Day Modal Buttons
    const confirmClearDayBtn = document.getElementById('confirm-clear-day');
    const cancelClearDayBtn = document.getElementById('cancel-clear-day');
    
    if (confirmClearDayBtn) {
        confirmClearDayBtn.addEventListener('click', function() {
            // Check if we're clearing a day or a week
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
    
    // Form-related events
    elements.shiftTypeSelect.addEventListener('change', toggleThemeField);
    elements.startTimeSelect.addEventListener('change', autoSelectEndTime);
    elements.shiftForm.addEventListener('submit', saveShift);
    
    // New host modal events
    elements.addNewHostBtn.addEventListener('click', openNewHostModal);
    elements.cancelNewHostBtn.addEventListener('click', closeNewHostModal);
    elements.newHostForm.addEventListener('submit', saveNewHost);
    
    // New location modal events - exactly matching the host pattern
    elements.addNewLocationBtn.addEventListener('click', openNewLocationModal);
    elements.cancelNewLocationBtn.addEventListener('click', closeNewLocationModal);
    elements.newLocationForm.addEventListener('submit', saveNewLocation);
    
    // Event delegation for dynamically created elements
    document.addEventListener('click', handleDelegatedClicks);
    document.addEventListener('keydown', handleKeyboardEvents);
    
    // Drag and drop event delegation
    elements.calendarBody.addEventListener('dragstart', handleDragStart, false);
    elements.calendarBody.addEventListener('dragend', handleDragEnd, false);
    elements.calendarBody.addEventListener('dragover', handleDragOver, false);
    elements.calendarBody.addEventListener('drop', handleDrop, false);
    
    // Initialize ARIA attributes on modals
    initializeModalAccessibility();
}

// ADDED: Function to initialize ARIA attributes on all modals
function initializeModalAccessibility() {
    // Make sure all modals start with aria-hidden="true"
    const allModals = document.querySelectorAll('.modal');
    allModals.forEach(modal => {
        if (modal.style.display !== 'flex') {
            modal.setAttribute('aria-hidden', 'true');
        } else {
            modal.setAttribute('aria-hidden', 'false');
        }
    });
    
    // Ensure dialog role is set
    allModals.forEach(modal => {
        if (!modal.hasAttribute('role')) {
            modal.setAttribute('role', 'dialog');
        }
    });
    
    // Add labelledby attributes where missing
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

// Handle delegated click events
function handleDelegatedClicks(e) {
    // Debug the click event target
    console.log("Click event target:", e.target);
    console.log("Click event target classList:", e.target.classList);
    
    // Handle add button clicks
    if (e.target.classList.contains('add-button')) {
        e.stopPropagation();
        const dateStr = e.target.getAttribute('data-date');
        openShiftModal(dateStr);
        return;
    }
    
    // Handle clear day button clicks
    if (e.target.classList.contains('clear-day-button')) {
        e.stopPropagation();
        const dateStr = e.target.getAttribute('data-date');
        console.log("Clear day button clicked for date:", dateStr);
        clearAllShiftsForDay(dateStr);
        return;
    }
    
    // Handle week clear button clicks - NEW CODE
    if (e.target.classList.contains('week-clear-button')) {
        e.stopPropagation();
        const weekIndex = parseInt(e.target.getAttribute('data-week-index'));
        console.log("Week clear button clicked for week index:", weekIndex);
        clearAllShiftsForWeek(weekIndex);
        return;
    }
    
    // Handle cell copy button clicks - drag and drop only
    if (e.target.classList.contains('cell-copy-button')) {
        e.stopPropagation();
        console.log("Cell copy button clicked - drag and drop functionality only");
        // Only drag functionality is implemented, no click functionality
        return;
    }
    
    // Handle delete button clicks - MODIFIED to not use parseInt
    if (e.target.classList.contains('delete-button')) {
        e.stopPropagation();
        // MODIFIED: Get shift ID as is, without parsing as integer
        const shiftId = e.target.getAttribute('data-id');
        console.log("Delete button clicked for shift ID:", shiftId);
        deleteShift(shiftId);
        return;
    }
    
    // The copy button is now just visual - no functionality attached
    if (e.target.classList.contains('copy-button') || e.target.classList.contains('copy-icon') || 
       (e.target.parentElement && e.target.parentElement.classList.contains('copy-button'))) {
        e.stopPropagation();
        console.log("Copy button clicked");
        // No functionality except for dragging - just prevent event propagation
        return;
    }
    
    // Handle toggle button clicks
    if (e.target.classList.contains('toggle-button') || 
        (e.target.parentElement && e.target.parentElement.classList.contains('toggle-button'))) {
        e.stopPropagation();
        const toggleButton = e.target.classList.contains('toggle-button') ? e.target : e.target.parentElement;
        toggleShiftCollapse(toggleButton);
        return;
    }
    
    // Handle week toggle button clicks
    if (e.target.classList.contains('week-toggle-button') || 
        (e.target.parentElement && e.target.parentElement.classList.contains('week-toggle-button'))) {
        e.stopPropagation();
        const toggleButton = e.target.classList.contains('week-toggle-button') ? e.target : e.target.parentElement;
        toggleWeekCollapse(toggleButton);
        return;
    }
    
    // Handle shift clicks for editing (but not when clicking buttons) - MODIFIED
    if (e.target.closest('.shift') && 
        !e.target.classList.contains('delete-button') && 
        !e.target.classList.contains('toggle-button') &&
        !e.target.classList.contains('copy-button') &&
        !e.target.classList.contains('copy-icon') &&
        !e.target.closest('.toggle-button') &&
        !e.target.closest('.copy-button') &&
        !e.target.classList.contains('multi-shift-badge') &&
        !e.target.closest('.shift-controls')) {
        const shift = e.target.closest('.shift');
        // MODIFIED: Get shift ID as is, without parsing as integer
        const shiftId = shift.getAttribute('data-id');
        console.log("Shift clicked for editing, ID:", shiftId);
        editShift(shiftId);
        return;
    }
}

// Handle keyboard events for accessibility
function handleKeyboardEvents(e) {
    // Close modals with Escape key
    if (e.key === 'Escape') {
        // Check for clear day modal first
        if (document.getElementById('clear-day-modal') && 
            document.getElementById('clear-day-modal').style.display === 'flex') {
            closeClearDayModal();
            e.preventDefault();
            return;
        }
        
        // Then check for new location modal
        if (elements.newLocationModal.style.display === 'flex') {
            closeNewLocationModal();
            e.preventDefault();
            return;
        }
        
        // Then check for new host modal
        if (elements.newHostModal.style.display === 'flex') {
            closeNewHostModal();
            e.preventDefault();
            return;
        }
        
        // Then check for warning modal
        if (elements.warningModal.style.display === 'flex') {
            closeWarningModal();
            e.preventDefault();
            return;
        }
        
        // Then check for shift modal
        if (elements.shiftModal.style.display === 'flex') {
            closeShiftModal();
            e.preventDefault();
            return;
        }
        
        // Always hide dropzones on Escape press as a failsafe
        hideMonthNavigationDropzones();
    }
    
    // Enter key for buttons
    if (e.key === 'Enter') {
        // Handle add button activation
        if (e.target.classList.contains('add-button')) {
            e.preventDefault();
            const dateStr = e.target.getAttribute('data-date');
            openShiftModal(dateStr);
            return;
        }
        
        // Handle clear day button activation
        if (e.target.classList.contains('clear-day-button')) {
            e.preventDefault();
            const dateStr = e.target.getAttribute('data-date');
            clearAllShiftsForDay(dateStr);
            return;
        }
        
        // Handle week clear button activation - NEW CODE
        if (e.target.classList.contains('week-clear-button')) {
            e.preventDefault();
            const weekIndex = parseInt(e.target.getAttribute('data-week-index'));
            clearAllShiftsForWeek(weekIndex);
            return;
        }
        
        // Handle cell copy button - no functionality
        if (e.target.classList.contains('cell-copy-button')) {
            e.preventDefault();
            return;
        }
        
        // Handle delete button activation - MODIFIED to not use parseInt
        if (e.target.classList.contains('delete-button')) {
            e.preventDefault();
            // MODIFIED: Get shift ID as is, without parsing as integer
            const shiftId = e.target.getAttribute('data-id');
            deleteShift(shiftId);
            return;
        }
        
        // Handle copy button activation - no functionality
        if (e.target.classList.contains('copy-button') || e.target.classList.contains('copy-icon')) {
            e.preventDefault();
            return;
        }
        
        // Handle toggle button activation
        if (e.target.classList.contains('toggle-button')) {
            e.preventDefault();
            toggleShiftCollapse(e.target);
            return;
        }
        
        // Handle week toggle button activation
        if (e.target.classList.contains('week-toggle-button')) {
            e.preventDefault();
            toggleWeekCollapse(e.target);
            return;
        }
        
        // Handle shift activation for editing - MODIFIED to not use parseInt
        if (e.target.classList.contains('shift')) {
            e.preventDefault();
            // MODIFIED: Get shift ID as is, without parsing as integer
            const shiftId = e.target.getAttribute('data-id');
            editShift(shiftId);
            return;
        }
    }
    
    // Calendar navigation with arrow keys
    const focusedElement = document.activeElement;
    if (focusedElement && focusedElement.tagName === 'TD' && 
        focusedElement.closest('#calendar-body')) {
        handleCalendarKeyNavigation(e, focusedElement);
    }
}

// Handle calendar navigation
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
            // First day of week
            nextIndex = currentIndex - (currentIndex % 9);
            e.preventDefault();
            break;
        case 'End':
            // Last day of week
            nextIndex = currentIndex + (8 - (currentIndex % 9));
            e.preventDefault();
            break;
        case 'PageUp':
            // Previous month
            goToPrevMonth();
            e.preventDefault();
            return;
        case 'PageDown':
            // Next month
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
    // Use renderCalendar directly
    renderCalendar();
}

// Populate time dropdowns with 15-minute increments
function populateTimeDropdowns() {
    const timeOptions = generateTimeOptions();
    
    // Create document fragments for better performance
    const startFragment = document.createDocumentFragment();
    const endFragment = document.createDocumentFragment();
    
    // Add default empty option
    const startDefaultOption = document.createElement('option');
    startDefaultOption.value = '';
    startDefaultOption.textContent = 'Select';
    startFragment.appendChild(startDefaultOption);
    
    const endDefaultOption = document.createElement('option');
    endDefaultOption.value = '';
    endDefaultOption.textContent = 'Select';
    endFragment.appendChild(endDefaultOption);
    
    // Add time options to both dropdowns
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
    
    // Clear existing options and append new ones
    elements.startTimeSelect.innerHTML = '';
    elements.endTimeSelect.innerHTML = '';
    elements.startTimeSelect.appendChild(startFragment);
    elements.endTimeSelect.appendChild(endFragment);
}