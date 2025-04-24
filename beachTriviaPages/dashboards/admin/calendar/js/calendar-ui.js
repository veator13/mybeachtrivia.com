// Setup month navigation dropzones for drag operations
function setupMonthNavigationDropzones() {
    // Hide dropzones initially
    hideMonthNavigationDropzones();
}

// Utility function to hide month navigation dropzones
function hideMonthNavigationDropzones() {
    try {
        if (elements.prevMonthDropzone && elements.nextMonthDropzone) {
            // Force-hide the dropzones immediately
            elements.prevMonthDropzone.style.display = 'none';
            elements.nextMonthDropzone.style.display = 'none';
            elements.prevMonthDropzone.style.opacity = '0';
            elements.nextMonthDropzone.style.opacity = '0';
            
            // Also remove active class for good measure
            elements.prevMonthDropzone.classList.remove('active');
            elements.nextMonthDropzone.classList.remove('active');
        }
    } catch (error) {
        console.error('Error hiding month navigation dropzones:', error);
    }
}

// Accessibility enhancements
function setupAccessibilitySupport() {
    try {
        // Check if elements already exist to avoid duplicates
        if (!document.getElementById('calendar-announcer')) {
            // Add aria-live region for announcements
            const announcer = document.createElement('div');
            announcer.setAttribute('aria-live', 'polite');
            announcer.classList.add('sr-only');
            announcer.id = 'calendar-announcer';
            document.body.appendChild(announcer);
        }
        
        if (!document.getElementById('keyboard-instructions')) {
            // Add keyboard navigation instructions
            const instructions = document.createElement('div');
            instructions.id = 'keyboard-instructions';
            instructions.classList.add('sr-only');
            instructions.textContent = 'Use arrow keys to navigate the calendar, Enter to select a date, Escape to close dialogs.';
            document.body.appendChild(instructions);
        }
    } catch (error) {
        console.error('Error setting up accessibility support:', error);
    }
}

// Announce changes for screen readers
function announceForScreenReader(message) {
    const announcer = document.getElementById('calendar-announcer');
    if (announcer) {
        announcer.textContent = message;
    }
}

// Create shift element - separate function for clarity
function createShiftElement(shift) {
    try {
        // Create the main container
        const shiftDiv = document.createElement('div');
        shiftDiv.classList.add('shift', shift.type);
        
        // Check if this shift is collapsed and add the class if needed
        if (state.collapsedShifts.has(shift.id)) {
            shiftDiv.classList.add('collapsed');
        }
        
        shiftDiv.setAttribute('data-id', shift.id);
        shiftDiv.setAttribute('draggable', 'true');
        shiftDiv.setAttribute('tabindex', '0');
        shiftDiv.setAttribute('role', 'button');
        
        // Check if this host has multiple shifts on this day
        const hostShiftsOnDay = shifts.filter(s => 
            s.date === shift.date && 
            s.employeeId === shift.employeeId
        );
        
        // Build event name with theme if applicable
        let shiftName = eventTypes[shift.type] || shift.type;
        if (shift.type === 'themed-trivia' && shift.theme) {
            shiftName += `: ${shift.theme}`;
        }
        
        const hasMultipleShifts = hostShiftsOnDay.length > 1;
        
        // Set the accessibility label for the whole shift
        shiftDiv.setAttribute('aria-label', `${eventTypes[shift.type] || shift.type} with ${employees[shift.employeeId]} from ${shift.startTime} to ${shift.endTime} at ${shift.location}${hasMultipleShifts ? `. Host has ${hostShiftsOnDay.length} shifts this day.` : ''}`);
        
        // Set aria-expanded attribute based on collapsed state
        shiftDiv.setAttribute('aria-expanded', !state.collapsedShifts.has(shift.id));
        
        // Create HTML content - Note: Ensuring copy-button has draggable="true" and its contents too
        const contentHTML = `
            <div class="employee">${escapeHTML(employees[shift.employeeId] || 'Unknown Host')}</div>
            <div class="time">${escapeHTML(shift.startTime)} - ${escapeHTML(shift.endTime)}</div>
            <div class="location">${escapeHTML(shift.location)}</div>
            <div class="event-type">${escapeHTML(shiftName)}</div>
            <span class="copy-button" data-id="${shift.id}" role="button" aria-label="Copy event" tabindex="0" draggable="true"><i class="copy-icon" draggable="true">⧉</i></span>
            <span class="toggle-button" data-id="${shift.id}" role="button" aria-label="Toggle details" tabindex="0"><div class="${state.collapsedShifts.has(shift.id) ? 'triangle-right' : 'triangle-down'}"></div></span>
            <span class="delete-button" data-id="${shift.id}" role="button" aria-label="Delete event" tabindex="0">×</span>
        `;
        
        shiftDiv.innerHTML = contentHTML;
        
        if (hasMultipleShifts) {
            const badgeHTML = `
                <div class="controls">
                    <div class="badge-wrapper">
                        <div class="multi-shift-badge">${hostShiftsOnDay.length}x</div>
                    </div>
                </div>
            `;
            
            // Append the badge HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = badgeHTML;
            const badgeControls = tempDiv.firstElementChild;
            
            shiftDiv.appendChild(badgeControls);
        }
        
        // Log the created element for debugging
        console.log("Created shift element:", shiftDiv);
        
        return shiftDiv;
    } catch (error) {
        console.error('Error creating shift element:', error);
        return null;
    }
}

// Focus today's cell for keyboard navigation
function focusTodayCell() {
    const todayCell = elements.calendarBody.querySelector('td[tabindex="0"]');
    if (todayCell) {
        todayCell.focus();
    }
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

// Generate time options in 15-minute increments for the entire day
function generateTimeOptions() {
    const times = [];
    const hours = 24;
    const intervals = 4; // 15-minute intervals per hour
    
    for (let hour = 0; hour < hours; hour++) {
        for (let interval = 0; interval < intervals; interval++) {
            const h = hour % 12 || 12; // Convert 0 to 12 for 12 AM
            const m = interval * 15;
            const ampm = hour < 12 ? 'AM' : 'PM';
            
            times.push(`${h}:${m.toString().padStart(2, '0')} ${ampm}`);
        }
    }
    
    return times;
}

// Form handling with improved validation
function toggleThemeField() {
    if (elements.shiftTypeSelect.value === 'themed-trivia') {
        elements.themeField.style.display = 'block';
        elements.shiftThemeInput.setAttribute('required', 'required');
    } else {
        elements.themeField.style.display = 'none';
        elements.shiftThemeInput.removeAttribute('required');
        elements.shiftThemeInput.value = '';
    }
}

function autoSelectEndTime() {
    if (elements.startTimeSelect.value) {
        const startTimeIndex = elements.startTimeSelect.selectedIndex;
        // Default to 2 hours later (8 15-minute intervals)
        const endTimeIndex = Math.min(startTimeIndex + 8, elements.endTimeSelect.options.length - 1);
        elements.endTimeSelect.selectedIndex = endTimeIndex;
    }
}

// Enhanced validation with more detailed feedback
function validateShiftForm() {
    // Check required fields
    if (!elements.shiftDateInput.value) {
        alert('Please select a date for the event.');
        elements.shiftDateInput.focus();
        return false;
    }
    
    if (!elements.shiftEmployeeSelect.value) {
        alert('Please select a host for the event.');
        elements.shiftEmployeeSelect.focus();
        return false;
    }
    
    if (!elements.startTimeSelect.value) {
        alert('Please select a start time for the event.');
        elements.startTimeSelect.focus();
        return false;
    }
    
    if (!elements.endTimeSelect.value) {
        alert('Please select an end time for the event.');
        elements.endTimeSelect.focus();
        return false;
    }
    
    if (!elements.shiftTypeSelect.value) {
        alert('Please select an event type.');
        elements.shiftTypeSelect.focus();
        return false;
    }
    
    if (elements.shiftTypeSelect.value === 'themed-trivia' && !elements.shiftThemeInput.value.trim()) {
        alert('Please enter a theme for the themed trivia event.');
        elements.shiftThemeInput.focus();
        return false;
    }
    
    if (!elements.shiftLocationSelect.value) {
        alert('Please select a location for the event.');
        elements.shiftLocationSelect.focus();
        return false;
    }
    
    return true;
}

// A simplified warning message function
function showSimplifiedWarning(employeeId) {
    console.log(`Showing warning for employee ${employeeId} with move operation:`, globalMoveOperation);
    
    const hostName = employees[employeeId] || 'Selected host';
    
    // Update warning text with simplified message
    elements.warningText.textContent = `${hostName} already has a shift scheduled on this date. Are you sure you want to proceed?`;
    
    // Clear previous conflict details - we don't need detailed info
    elements.conflictDetails.innerHTML = '';
    
    // Show the warning modal
    elements.warningModal.style.display = 'flex';
    
    // Set focus on cancel button
    setTimeout(() => {
        elements.cancelBookingBtn.focus();
    }, 100);
    
    // Announce for screen readers
    announceForScreenReader('Warning: Host already has a shift scheduled on this day. Please choose to proceed or cancel.');
}

// Helper function to select dropdown option by value
function selectDropdownOptionByValue(dropdown, value) {
    if (!dropdown || !value) return;
    
    // Default to first option if value not found
    let found = false;
    
    for (let i = 0; i < dropdown.options.length; i++) {
        if (dropdown.options[i].value === value) {
            dropdown.selectedIndex = i;
            found = true;
            break;
        }
    }
    
    // If not found, select first option
    if (!found && dropdown.options.length > 0) {
        dropdown.selectedIndex = 0;
    }
}

// Expand all shifts
function expandAllShifts() {
    // Get all shift elements
    const shiftElements = document.querySelectorAll('.shift');
    
    // Clear the collapsed shifts set
    state.collapsedShifts.clear();
    
    // Expand each shift
    shiftElements.forEach(shiftDiv => {
        const triangle = shiftDiv.querySelector('.toggle-button div');
        shiftDiv.classList.remove('collapsed');
        if (triangle) triangle.className = 'triangle-down';
        shiftDiv.setAttribute('aria-expanded', 'true');
    });
    
    // Announce for screen readers
    announceForScreenReader('All shifts expanded');
}

// Collapse all shifts
function collapseAllShifts() {
    // Get all shift elements
    const shiftElements = document.querySelectorAll('.shift');
    
    // Collapse each shift and store the state
    shiftElements.forEach(shiftDiv => {
        const shiftId = parseInt(shiftDiv.getAttribute('data-id'));
        const triangle = shiftDiv.querySelector('.toggle-button div');
        
        // Add to collapsed state
        if (shiftId && !isNaN(shiftId)) {
            state.collapsedShifts.add(shiftId);
        }
        
        shiftDiv.classList.add('collapsed');
        if (triangle) triangle.className = 'triangle-right';
        shiftDiv.setAttribute('aria-expanded', 'false');
    });
    
    // Announce for screen readers
    announceForScreenReader('All shifts collapsed');
}

// Handle keyboard navigation within calendar
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
            nextIndex = Math.min(currentIndex + 7, allCells.length - 1);
            e.preventDefault();
            break;
        case 'ArrowUp':
            nextIndex = Math.max(currentIndex - 7, 0);
            e.preventDefault();
            break;
        case 'Home':
            // First day of week
            nextIndex = currentIndex - (currentIndex % 7);
            e.preventDefault();
            break;
        case 'End':
            // Last day of week
            nextIndex = currentIndex + (6 - (currentIndex % 7));
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

// Modal and form handling functions
function openShiftModal(dateStr = null) {
    // Reset editing mode for new shifts
    state.isEditing = false;
    state.editingShiftId = null;
    
    // Update modal title and button text for adding
    elements.modalTitle.textContent = 'Add New Event';
    elements.submitButton.textContent = 'Save Event';
    
    // Reset form first
    elements.shiftForm.reset();
    elements.themeField.style.display = 'none';
    
    // Set default date to selected date or today
    const defaultDate = dateStr || formatDate(new Date());
    elements.shiftDateInput.value = defaultDate;
    
    // Set default times
    const defaultTimes = getDefaultTimes();
    selectDropdownOptionByValue(elements.startTimeSelect, defaultTimes.start);
    selectDropdownOptionByValue(elements.endTimeSelect, defaultTimes.end);
    
    // Show the modal
    elements.shiftModal.style.display = 'flex';
    
    // Set focus on first field
    setTimeout(() => {
        elements.shiftEmployeeSelect.focus();
    }, 100);
    
    // Announce for screen readers
    announceForScreenReader(`Adding new event for ${getReadableDateString(new Date(defaultDate))}`);
}

function closeShiftModal() {
    // Save scroll position
    const scrollPosition = {
        x: window.scrollX,
        y: window.scrollY
    };
    
    elements.shiftModal.style.display = 'none';
    state.isEditing = false;
    state.editingShiftId = null;
    
    // Don't force focus on today's cell, which would cause scrolling
    setTimeout(() => {
        window.scrollTo(scrollPosition.x, scrollPosition.y);
    }, 10);
}

function closeWarningModal() {
    // Save scroll position
    const scrollPosition = {
        x: window.scrollX,
        y: window.scrollY
    };
    
    elements.warningModal.style.display = 'none';
    
    // Return focus but maintain scroll position
    if (elements.shiftModal.style.display === 'flex') {
        elements.submitButton.focus();
    } else {
        // Restore scroll position instead of focusing today's cell
        setTimeout(() => {
            window.scrollTo(scrollPosition.x, scrollPosition.y);
        }, 10);
    }
    
    // Hide month navigation dropzones
    hideMonthNavigationDropzones();
}

// New host modal functions
function openNewHostModal() {
    // Reset the form first
    elements.newHostForm.reset();
    
    // Show the modal and fix aria-hidden
    elements.newHostModal.style.display = 'flex';
    elements.newHostModal.setAttribute('aria-hidden', 'false');
    
    // Set focus on the name input
    setTimeout(() => {
        elements.newHostNameInput.focus();
    }, 100);
    
    // Announce for screen readers
    announceForScreenReader('Add new host form is open');
    
    // For debugging
    console.log('Opening new host modal');
}

function closeNewHostModal() {
    elements.newHostModal.style.display = 'none';
    elements.newHostModal.setAttribute('aria-hidden', 'true');
    
    // Return focus to the add new host button
    if (elements.shiftModal.style.display === 'flex') {
        setTimeout(() => {
            elements.addNewHostBtn.focus();
        }, 100);
    }
}

// New location modal functions
function openNewLocationModal() {
    // Reset the form first
    elements.newLocationForm.reset();
    
    // Show the modal and fix aria-hidden
    elements.newLocationModal.style.display = 'flex';
    elements.newLocationModal.setAttribute('aria-hidden', 'false');
    
    // Set focus on the name input
    setTimeout(() => {
        elements.newLocationNameInput.focus();
    }, 100);
    
    // Announce for screen readers
    announceForScreenReader('Add new location form is open');
    
    console.log('Opening new location modal');
}

function closeNewLocationModal() {
    elements.newLocationModal.style.display = 'none';
    elements.newLocationModal.setAttribute('aria-hidden', 'true');
    
    // Return focus to the add new location button
    if (elements.shiftModal.style.display === 'flex') {
        setTimeout(() => {
            elements.addNewLocationBtn.focus();
        }, 100);
    }
}