// modal-handlers.js
// Functions for handling modals and form submissions

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

    // Show the modal - FIXED: Set aria-hidden to false when showing
    elements.shiftModal.style.display = 'flex';
    elements.shiftModal.setAttribute('aria-hidden', 'false');

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

    // FIXED: Set aria-hidden to true when hiding
    elements.shiftModal.style.display = 'none';
    elements.shiftModal.setAttribute('aria-hidden', 'true');

    state.isEditing = false;
    state.editingShiftId = null;

    // Don't force focus on today's cell, which would cause scrolling
    setTimeout(() => {
        window.scrollTo(scrollPosition.x, scrollPosition.y);
    }, 10);
}

/**
 * Centralized closer for the double-book warning modal.
 * - Clears any pending forced save from the form path
 * - Hides the warning modal with ARIA updates
 * - Re-enables and returns focus to the form submit button (if present)
 * - Keeps scroll position stable
 */
function closeWarningModal() {
    // Save scroll position
    const scrollPosition = {
        x: window.scrollX,
        y: window.scrollY
    };

    // Clear pending override state (form conflict path)
    try {
        if (window.CalendarState) {
            window.CalendarState.pendingShiftData = null;
            window.CalendarState.forceBooking = false;
        } else {
            // Fallback to local state if exposed here
            if (typeof state !== 'undefined') {
                state.pendingShiftData = null;
                state.forceBooking = false;
            }
        }
    } catch (e) {
        console.warn('[calendar] Could not clear pending override state:', e);
    }

    // Hide the warning modal (with ARIA)
    if (elements.warningModal) {
        elements.warningModal.style.display = 'none';
        elements.warningModal.setAttribute('aria-hidden', 'true');
    }

    // Re-enable submit button if it was disabled during warning
    if (elements.submitButton) {
        try { elements.submitButton.disabled = false; } catch (_) {}
    }

    // Return focus but maintain scroll position
    if (elements.shiftModal && elements.shiftModal.style.display === 'flex') {
        if (elements.submitButton && typeof elements.submitButton.focus === 'function') {
            try { elements.submitButton.focus(); } catch (_) {}
        }
    } else {
        // Restore scroll position instead of focusing today's cell
        setTimeout(() => {
            window.scrollTo(scrollPosition.x, scrollPosition.y);
        }, 10);
    }

    // Hide month navigation dropzones
    hideMonthNavigationDropzones();
}
// Expose globally so all modules use the same closer
window.closeWarningModal = closeWarningModal;

// A simplified warning message function - MODIFIED to use getEmployeeName for safety
function showSimplifiedWarning(employeeId) {
    console.log(`Showing warning for employee ${employeeId} with move operation:`, globalMoveOperation);

    // Use the safe helper function instead of direct access to employees object
    const hostName = getEmployeeName(employeeId);

    // Update warning text with simplified message
    elements.warningText.textContent = `${hostName} already has a shift scheduled on this date. Are you sure you want to proceed?`;

    // Clear previous conflict details - we don't need detailed info
    elements.conflictDetails.innerHTML = '';

    // Show the warning modal - FIXED: Set aria-hidden to false when showing
    elements.warningModal.style.display = 'flex';
    elements.warningModal.setAttribute('aria-hidden', 'false');

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

// New host modal functions
function openNewHostModal() {
    // Reset the form first
    elements.newHostForm.reset();

    // Show the modal and fix aria-hidden
    elements.newHostModal.style.display = 'flex';
    elements.newHostModal.setAttribute('aria-hidden', 'false');

    // Set focus on the first name input
    setTimeout(() => {
        document.getElementById('new-host-firstname').focus();
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

// MODIFIED: Save new host with improved Firebase integration and error checking
function saveNewHost(e) {
    e.preventDefault();

    // Get values from all fields
    const firstName = document.getElementById('new-host-firstname').value.trim();
    const lastName = document.getElementById('new-host-lastname').value.trim();
    const nickname = document.getElementById('new-host-nickname').value.trim();
    const phone = document.getElementById('new-host-phone').value.trim();
    const email = document.getElementById('new-host-email').value.trim();
    const emergencyContact = document.getElementById('new-host-emergency-contact').value.trim();
    const emergencyPhone = document.getElementById('new-host-emergency-phone').value.trim();
    const employeeId = document.getElementById('new-host-employee-id').value.trim();
    const isActive = document.getElementById('new-host-active').checked;

    // Validate required fields
    if (!firstName) {
        alert('Please enter a first name for the host.');
        document.getElementById('new-host-firstname').focus();
        return;
    }

    if (!lastName) {
        alert('Please enter a last name for the host.');
        document.getElementById('new-host-lastname').focus();
        return;
    }

    // Create short display name for the calendar
    const shortDisplayName = nickname ? nickname : firstName;

    // Create full display name for detailed views
    const fullDisplayName = nickname ?
        `${nickname} (${firstName} ${lastName})` :
        `${firstName} ${lastName}`;

    // Create host object for Firebase
    const newHost = {
        firstName: firstName,
        lastName: lastName,
        nickname: nickname,
        phone: phone,
        email: email,
        emergencyContactName: emergencyContact,
        emergencyContactPhone: emergencyPhone,
        employeeID: employeeId,
        active: isActive,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Show loading state
    const saveButton = document.getElementById('save-new-host');
    const originalButtonText = saveButton.textContent;
    saveButton.textContent = 'Saving...';
    saveButton.disabled = true;

    // Save to Firebase
    firebase.firestore().collection('employees').add(newHost)
        .then(docRef => {
            console.log('New host added with ID:', docRef.id);

            // Use Firebase document ID for local reference
            const newHostId = docRef.id;

            // For backward compatibility with existing code
            if (!employees) {
                // Initialize employees object if it doesn't exist
                window.employees = {};
            }

            employees[newHostId] = shortDisplayName;

            // Store the complete employee data in the local cache
            if (!window.employeesData) {
                window.employeesData = {};
            }
            window.employeesData[newHostId] = {
                ...newHost,
                id: newHostId,
                displayName: fullDisplayName,
                shortDisplayName: shortDisplayName
            };

            // Use the addEmployeeToDropdowns function from main.js
            if (typeof addEmployeeToDropdowns === 'function') {
                addEmployeeToDropdowns(newHostId, fullDisplayName);
            } else {
                // Fallback implementation if the function isn't available
                // Add to both dropdowns - the filter dropdown and the shift modal dropdown
                const newOptionForFilter = document.createElement('option');
                newOptionForFilter.value = newHostId;
                newOptionForFilter.textContent = fullDisplayName;
                elements.employeeSelect.appendChild(newOptionForFilter);

                const newOptionForShift = document.createElement('option');
                newOptionForShift.value = newHostId;
                newOptionForShift.textContent = fullDisplayName;
                elements.shiftEmployeeSelect.appendChild(newOptionForShift);
            }

            // Select the new host in the shift modal dropdown
            elements.shiftEmployeeSelect.value = newHostId;

            // Close the new host modal and reset form
            document.getElementById('new-host-form').reset();
            closeNewHostModal();

            // Focus on the next field in the add event form
            elements.startTimeSelect.focus();

            // Announce for screen readers
            announceForScreenReader(`New host ${shortDisplayName} has been added`);
        })
        .catch(error => {
            console.error('Error adding host to Firebase:', error);

            // Handle specific error cases
            if (error.code === 'permission-denied') {
                alert('You do not have permission to add hosts. Please check your login status.');
            } else if (error.code === 'unavailable' || (error.name === 'FirebaseError' && error.message.includes('network'))) {
                alert('Network error. Please check your internet connection and try again.');
            } else {
                alert(`Error adding host: ${error.message}`);
            }
        })
        .finally(() => {
            // Restore button state
            saveButton.textContent = originalButtonText;
            saveButton.disabled = false;
        });
}

// UPDATED: Save new location with extended fields and Firebase integration
function saveNewLocation(e) {
    e.preventDefault();

    // Get values from all fields
    const locationName = document.getElementById('new-location-name').value.trim();
    const address = document.getElementById('new-location-address').value.trim();
    const contact = document.getElementById('new-location-contact').value.trim();
    const phone = document.getElementById('new-location-phone').value.trim();
    const email = document.getElementById('new-location-email').value.trim();
    const isActive = document.getElementById('new-location-active').checked;

    // Validate required fields
    if (!locationName) {
        alert('Please enter a name for the new location.');
        document.getElementById('new-location-name').focus();
        return;
    }

    // Create a location object with all details
    const newLocation = {
        name: locationName,
        address: address,
        contact: contact,
        phone: phone,
        email: email,
        isActive: isActive,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Show loading state
    const saveButton = document.getElementById('save-new-location');
    const originalButtonText = saveButton.textContent;
    saveButton.textContent = 'Saving...';
    saveButton.disabled = true;

    // Save to Firebase
    firebase.firestore().collection('locations').add(newLocation)
        .then(docRef => {
            console.log('New location added with ID:', docRef.id);

            // Store the complete location data in a global object for future use
            if (!window.locationsData) {
                window.locationsData = {};
            }
            window.locationsData[locationName] = {
                ...newLocation,
                id: docRef.id
            };

            // Use the addLocationToDropdowns function from main.js
            if (typeof addLocationToDropdowns === 'function') {
                addLocationToDropdowns(locationName);
            } else {
                // Fallback implementation if the function isn't available
                // Add to both dropdowns - the filter dropdown and the shift modal dropdown
                const newOptionForFilter = document.createElement('option');
                newOptionForFilter.value = locationName;
                newOptionForFilter.textContent = locationName;
                elements.locationSelect.appendChild(newOptionForFilter);

                const newOptionForShift = document.createElement('option');
                newOptionForShift.value = locationName;
                newOptionForShift.textContent = locationName;
                elements.shiftLocationSelect.appendChild(newOptionForShift);
            }

            // Select the new location in the shift modal dropdown
            elements.shiftLocationSelect.value = locationName;

            // Close the new location modal and reset form
            document.getElementById('new-location-form').reset();
            closeNewLocationModal();

            // Focus on the next field in the add event form
            elements.shiftNotesInput.focus();

            // Announce for screen readers
            announceForScreenReader(`New location ${locationName} has been added`);

            console.log('New location added successfully:', locationName);
        })
        .catch(error => {
            console.error('Error adding location to Firebase:', error);

            // Handle specific error cases
            if (error.code === 'permission-denied') {
                alert('You do not have permission to add locations. Please check your login status.');
            } else if (error.code === 'unavailable' || (error.name === 'FirebaseError' && error.message.includes('network'))) {
                alert('Network error. Please check your internet connection and try again.');
            } else {
                alert(`Error adding location: ${error.message}`);
            }
        })
        .finally(() => {
            // Restore button state
            saveButton.textContent = originalButtonText;
            saveButton.disabled = false;
        });
}

// Open the copy shift modal
function openCopyShiftModal(shiftId) {
    try {
        console.log("Opening copy modal for shift ID:", shiftId);

        // Direct DOM access instead of relying on cached elements
        const copyShiftModal = document.getElementById('copy-shift-modal');
        const copyMethodSelect = document.getElementById('copy-method');
        const copyDateInput = document.getElementById('copy-date');
        const recurringOptionsField = document.getElementById('recurring-options');

        // Check if modal exists
        if (!copyShiftModal) {
            console.error("Copy shift modal not found in the DOM");
            alert('Copy modal not found. Please refresh the page and try again.');
            return;
        }

        const shift = shifts.find(s => s.id === shiftId);
        if (!shift) {
            console.error(`Shift with ID ${shiftId} not found`);
            return;
        }

        // Save the shift ID for later use
        state.copyingShiftId = shiftId;

        // Reset form
        const copyShiftForm = document.getElementById('copy-shift-form');
        if (copyShiftForm) {
            copyShiftForm.reset();
        }

        if (recurringOptionsField) {
            recurringOptionsField.style.display = 'none';
        }

        // Set default date to one week from the original date
        const originalDate = new Date(shift.date);
        const defaultDate = new Date(originalDate);
        defaultDate.setDate(defaultDate.getDate() + 7); // One week later

        if (copyDateInput) {
            copyDateInput.value = formatDate(defaultDate);
        }

        // Show the modal - FIXED: Set aria-hidden to false when showing
        copyShiftModal.style.display = 'flex';
        copyShiftModal.setAttribute('aria-hidden', 'false');

        // Set focus on first field
        setTimeout(() => {
            if (copyMethodSelect) {
                copyMethodSelect.focus();
            }
        }, 100);

        // Announce for screen readers - use helper function for event type name
        announceForScreenReader(`Copying event ${getEventTypeName(shift.type)} from ${getReadableDateString(originalDate)}`);
    } catch (error) {
        console.error('Error opening copy shift modal:', error);
        alert('Could not open copy modal. Please refresh the page and try again.');
    }
}

// Close the copy shift modal
function closeCopyShiftModal() {
    try {
        // Direct DOM access
        const copyShiftModal = document.getElementById('copy-shift-modal');
        if (!copyShiftModal) {
            console.error('Copy shift modal not found');
            return;
        }

        // Save scroll position
        const scrollPosition = {
            x: window.scrollX,
            y: window.scrollY
        };

        // FIXED: Set aria-hidden to true when hiding
        copyShiftModal.style.display = 'none';
        copyShiftModal.setAttribute('aria-hidden', 'true');

        state.copyingShiftId = null;

        // Restore scroll position
        setTimeout(() => {
            window.scrollTo(scrollPosition.x, scrollPosition.y);
        }, 10);
    } catch (error) {
        console.error('Error closing copy shift modal:', error);
    }
}

// FIXED: Handle clear day modal ARIA attributes
function clearAllShiftsForDay(dateStr) {
    // Get all shifts for the selected date
    const shiftsForDay = getShiftsForDate(dateStr);

    // If there are no shifts, show message and return
    if (shiftsForDay.length === 0) {
        alert('No events to clear for this date.');
        return;
    }

    // Store the date for the modal
    const dateObj = new Date(dateStr);
    const formattedDate = getReadableDateString(dateObj);

    // Set the modal title and warning message
    document.getElementById('clear-day-title').textContent = `Clear Events for ${formattedDate}`;
    document.getElementById('clear-day-warning').textContent = `Are you sure you want to delete all ${shiftsForDay.length} events on ${formattedDate}? This action cannot be undone.`;

    // Populate the events list
    const eventsContainer = document.getElementById('day-events-list');
    eventsContainer.innerHTML = '';

    // Add event count
    const countElement = document.createElement('div');
    countElement.className = 'event-count';
    countElement.textContent = `${shiftsForDay.length} event${shiftsForDay.length > 1 ? 's' : ''} will be permanently deleted:`;
    eventsContainer.appendChild(countElement);

    // Add each shift as a list item
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

    // Store the date for use in the confirmation handler
    document.getElementById('confirm-clear-day').setAttribute('data-date', dateStr);

    // Remove any week-index attribute to avoid confusion
    document.getElementById('confirm-clear-day').removeAttribute('data-week-index');

    // Show the modal - FIXED: Set aria-hidden to false when showing
    const clearDayModal = document.getElementById('clear-day-modal');
    clearDayModal.style.display = 'flex';
    clearDayModal.setAttribute('aria-hidden', 'false');

    // Set focus to cancel button for safety
    setTimeout(() => {
        document.getElementById('cancel-clear-day').focus();
    }, 100);

    // Announce for screen readers
    announceForScreenReader(`Confirm clearing ${shiftsForDay.length} events on ${formattedDate}`);
}

// Function to close the clear day modal - FIXED with ARIA attributes and updated to handle week clearing
function closeClearDayModal() {
    const modal = document.getElementById('clear-day-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
    }

    // Clear the stored date and week index
    const confirmButton = document.getElementById('confirm-clear-day');
    if (confirmButton) {
        confirmButton.removeAttribute('data-date');
        confirmButton.removeAttribute('data-week-index');
    }
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
