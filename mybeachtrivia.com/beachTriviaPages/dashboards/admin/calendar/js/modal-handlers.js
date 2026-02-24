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

/* ============================================================
   NEW Host (Employee Provision) Modal
   - Requires email
   - Optional first/last/nickname
   - Roles checkboxes
   - Uses Cloud Function: adminCreateEmployee (callable)
   - Displays + copies password setup link
   ============================================================ */

function openNewHostModal() {
    // Reset the form first
    elements.newHostForm.reset();

    // Default roles: Host checked
    const roleHost = document.getElementById('role-host');
    const roleAdmin = document.getElementById('role-admin');
    const roleSuperadmin = document.getElementById('role-superadmin');
    const roleContent = document.getElementById('role-content');
    if (roleHost) roleHost.checked = true;
    if (roleAdmin) roleAdmin.checked = false;
    if (roleSuperadmin) roleSuperadmin.checked = false;
    if (roleContent) roleContent.checked = false;

    // Clear status + link UI
    const statusEl = document.getElementById('new-host-status');
    const wrap = document.getElementById('setup-link-wrap');
    const linkText = document.getElementById('setup-link-text');
    if (statusEl) {
        statusEl.classList.remove('success', 'error');
        statusEl.textContent = '';
        statusEl.style.display = 'none';
    }
    if (wrap) wrap.classList.remove('show');
    if (linkText) linkText.textContent = '';

    // Show the modal and fix aria-hidden
    elements.newHostModal.style.display = 'flex';
    elements.newHostModal.setAttribute('aria-hidden', 'false');

    // Set focus on the email input (required)
    setTimeout(() => {
        const emailEl = document.getElementById('new-host-email');
        if (emailEl) emailEl.focus();
    }, 100);

    // Announce for screen readers
    announceForScreenReader('Create employee form is open');

    // For debugging
    console.log('Opening new host modal (employee provision)');
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

function _showNewHostStatus(message, type /* 'success' | 'error' */) {
    const statusEl = document.getElementById('new-host-status');
    if (!statusEl) return;

    statusEl.classList.remove('success', 'error');
    statusEl.classList.add(type === 'success' ? 'success' : 'error');
    statusEl.textContent = message;
    statusEl.style.display = 'block';
}

function _getSelectedRolesFromModal() {
    const roles = [];
    const roleHost = document.getElementById('role-host');
    const roleAdmin = document.getElementById('role-admin');
    const roleSuperadmin = document.getElementById('role-superadmin');
    const roleContent = document.getElementById('role-content');

    if (roleHost && roleHost.checked) roles.push('host');
    if (roleAdmin && roleAdmin.checked) roles.push('admin');
    if (roleSuperadmin && roleSuperadmin.checked) roles.push('superadmin');
    if (roleContent && roleContent.checked) roles.push('content');

    // Ensure at least host if none selected (sane default for calendar add-host)
    if (roles.length === 0) roles.push('host');

    return roles;
}

async function _copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        // Fallback
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'absolute';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            return true;
        } catch (_) {
            return false;
        }
    }
}

// MODIFIED/REPLACED: Save new host (now provisions an employee user and shows setup link)
async function saveNewHost(e) {
    e.preventDefault();

    const emailEl = document.getElementById('new-host-email');
    const firstNameEl = document.getElementById('new-host-firstname');
    const lastNameEl = document.getElementById('new-host-lastname');
    const nicknameEl = document.getElementById('new-host-nickname');

    const email = (emailEl?.value || '').trim();
    const firstName = (firstNameEl?.value || '').trim();
    const lastName = (lastNameEl?.value || '').trim();
    const nickname = (nicknameEl?.value || '').trim();

    // Email is REQUIRED
    if (!email) {
        _showNewHostStatus('Email is required.', 'error');
        if (emailEl) emailEl.focus();
        return;
    }

    // Light format check (prevents obvious typos; backend should still enforce)
    const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailLooksValid) {
        _showNewHostStatus('Please enter a valid email address.', 'error');
        if (emailEl) emailEl.focus();
        return;
    }

    const roles = _getSelectedRolesFromModal();

    const saveButton = document.getElementById('save-new-host');
    const originalButtonText = saveButton ? saveButton.textContent : 'Create Employee';
    if (saveButton) {
        saveButton.textContent = 'Creating…';
        saveButton.disabled = true;
    }

    // Clear any previous status/link
    _showNewHostStatus('', 'success');
    const statusEl = document.getElementById('new-host-status');
    if (statusEl) {
        statusEl.classList.remove('success', 'error');
        statusEl.textContent = '';
        statusEl.style.display = 'none';
    }
    const wrap = document.getElementById('setup-link-wrap');
    const linkText = document.getElementById('setup-link-text');
    const copyBtn = document.getElementById('copy-setup-link-btn');
    const openBtn = document.getElementById('open-setup-link-btn');
    if (wrap) wrap.classList.remove('show');
    if (linkText) linkText.textContent = '';
    if (copyBtn) copyBtn.onclick = null;
    if (openBtn) openBtn.onclick = null;

    try {
        if (!firebase?.functions) {
            throw new Error('Firebase Functions SDK not available. Did you include firebase-functions-compat.js?');
        }

        const adminCreateEmployee = firebase.functions().httpsCallable('adminCreateEmployee');

        // Call your existing employee provision function
        const result = await adminCreateEmployee({
            email,
            roles,
            // Keep names optional; backend may ignore but we’ll patch Firestore after
            firstName: firstName || '',
            lastName: lastName || '',
            nickname: nickname || ''
        });

        const payload = result?.data || {};
        const uid = payload.uid;
        const passwordSetupLink = payload.passwordSetupLink || payload.link || payload.resetLink;

        if (!uid) {
            console.warn('[calendar] adminCreateEmployee response missing uid:', payload);
        }

        // If user provided any optional fields, patch employee doc without overwriting with blanks
        if (uid && (firstName || lastName || nickname)) {
            const patch = {};
            if (firstName) patch.firstName = firstName;
            if (lastName) patch.lastName = lastName;
            if (nickname) patch.nickname = nickname;

            try {
                await firebase.firestore().collection('employees').doc(uid).set(patch, { merge: true });
            } catch (e) {
                console.warn('[calendar] Could not patch employee name fields:', e);
            }
        }

        // Build display name for dropdowns (safe even if blank)
        const displayName =
            (nickname && firstName && lastName) ? `${nickname} (${firstName} ${lastName})` :
            (firstName && lastName) ? `${firstName} ${lastName}` :
            (nickname) ? nickname :
            email;

        // Keep legacy global caches in sync (so the calendar stays happy immediately)
        if (!window.employees) window.employees = {};
        window.employees[uid || email] = displayName;

        if (!window.employeesData) window.employeesData = {};
        if (uid) {
            window.employeesData[uid] = {
                id: uid,
                email,
                firstName: firstName || '',
                lastName: lastName || '',
                nickname: nickname || '',
                roles,
                active: true,
                displayName,
                shortDisplayName: nickname || firstName || lastName || email
            };
        }

        // Add to dropdowns
        if (typeof addEmployeeToDropdowns === 'function') {
            // addEmployeeToDropdowns(employeeId, displayName)
            addEmployeeToDropdowns(uid, displayName);
        } else {
            // Fallback
            const opt1 = document.createElement('option');
            opt1.value = uid;
            opt1.textContent = displayName;
            elements.employeeSelect.appendChild(opt1);

            const opt2 = document.createElement('option');
            opt2.value = uid;
            opt2.textContent = displayName;
            elements.shiftEmployeeSelect.appendChild(opt2);
        }

        // Select new host in shift modal
        if (uid) elements.shiftEmployeeSelect.value = uid;

        // Show setup link
        if (passwordSetupLink) {
            if (linkText) linkText.textContent = passwordSetupLink;
            if (wrap) wrap.classList.add('show');

            if (copyBtn) {
                copyBtn.onclick = async () => {
                    const ok = await _copyToClipboard(passwordSetupLink);
                    _showNewHostStatus(ok ? 'Setup link copied to clipboard.' : 'Could not copy link automatically—please copy it manually.', ok ? 'success' : 'error');
                };
            }

            if (openBtn) {
                openBtn.onclick = () => {
                    try { window.open(passwordSetupLink, '_blank', 'noopener'); } catch (_) {}
                };
            }

            // Auto-copy once on success
            await _copyToClipboard(passwordSetupLink);

            _showNewHostStatus('Employee created. Password setup link generated and copied.', 'success');
        } else {
            _showNewHostStatus('Employee created, but no setup link was returned by the server.', 'success');
        }

        // Keep the modal open so the admin can copy/open the link.
        // They can hit Cancel to return to scheduling.
        announceForScreenReader('Employee created. Password setup link is ready.');
    } catch (error) {
        console.error('[calendar] Error provisioning employee:', error);

        const msg = (error?.message || '').toLowerCase();

        if (error?.code === 'permission-denied' || msg.includes('permission')) {
            _showNewHostStatus('You do not have permission to create employees. Please check your admin login.', 'error');
        } else if (error?.code === 'unauthenticated' || msg.includes('unauthenticated')) {
            _showNewHostStatus('You must be signed in to create employees. Please sign in and try again.', 'error');
        } else if (msg.includes('already') || msg.includes('exists')) {
            _showNewHostStatus('That email already exists. Try selecting the host from the dropdown instead.', 'error');
        } else {
            _showNewHostStatus(`Error creating employee: ${error?.message || 'Unknown error'}`, 'error');
        }
    } finally {
        if (saveButton) {
            saveButton.textContent = originalButtonText;
            saveButton.disabled = false;
        }
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