// event-crud.js
// Functions for CRUD operations on shifts and events

// Function to execute the deletion of all shifts for a day
function executeAllShiftsClear() {
    const dateStr = document.getElementById('confirm-clear-day').getAttribute('data-date');
    if (!dateStr) {
        console.error('No date provided for clearing events');
        return;
    }

    // Get all shifts for the selected date
    const shiftsToDelete = getShiftsForDate(dateStr);
    if (shiftsToDelete.length === 0) {
        console.warn('No shifts found to delete');
        closeClearDayModal();
        return;
    }

    // Create an array to store all deletion promises
    const deletePromises = [];

    // Delete each shift from Firebase
    shiftsToDelete.forEach(shift => {
        const deletePromise = deleteShiftFromFirebase(shift.id)
            .catch(error => {
                console.error(`Error deleting shift ${shift.id}:`, error);
                return false; // Return false to indicate failure
            });

        deletePromises.push(deletePromise);
    });

    // Wait for all deletions to complete
    Promise.all(deletePromises)
        .then(results => {
            // Filter out failed deletions
            const successCount = results.filter(result => result !== false).length;

            // Remove the deleted shifts from the local array
            const shiftIdsToDelete = shiftsToDelete.map(shift => shift.id);
            shifts = shifts.filter(shift => !shiftIdsToDelete.includes(shift.id));

            // Close the modal
            closeClearDayModal();

            // Show success message
            if (successCount === shiftsToDelete.length) {
                alert(`Successfully deleted all ${successCount} events.`);
            } else {
                alert(`Deleted ${successCount} out of ${shiftsToDelete.length} events. Some deletions may have failed.`);
            }

            // Announce for screen readers
            announceForScreenReader(`Deleted ${successCount} events.`);

            // Refresh the calendar
            renderCalendar();
        })
        .catch(error => {
            console.error('Error deleting shifts:', error);
            alert('An error occurred while deleting events. Please try again.');
            closeClearDayModal();
        });
}

// Function to handle clearing all shifts for a specific day
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

    // Show the modal (ARIA-friendly)
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

// Function to close the clear day modal
function closeClearDayModal() {
    const modal = document.getElementById('clear-day-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
    }

    // Clear the stored date
    const confirmButton = document.getElementById('confirm-clear-day');
    if (confirmButton) {
        confirmButton.removeAttribute('data-date');
    }
}

// Function to toggle shift collapse state
function toggleShiftCollapse(toggleButton) {
    const shiftDiv = toggleButton.closest('.shift');
    if (!shiftDiv) return;

    const shiftId = shiftDiv.getAttribute('data-id');
    const triangle = toggleButton.querySelector('div');

    if (shiftDiv.classList.contains('collapsed')) {
        // Expand the shift
        shiftDiv.classList.remove('collapsed');
        if (triangle) triangle.className = 'triangle-down';
        shiftDiv.setAttribute('aria-expanded', 'true');
        // Remove from collapsed state
        state.collapsedShifts.delete(shiftId);
    } else {
        // Collapse the shift
        shiftDiv.classList.add('collapsed');
        if (triangle) triangle.className = 'triangle-right';
        shiftDiv.setAttribute('aria-expanded', 'false');
        // Add to collapsed state
        state.collapsedShifts.add(shiftId);
    }
}

// Delete shift
function deleteShift(shiftId) {
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) return;

    // Get event details for the confirmation message
    const eventDetails = `${eventTypes[shift.type] || shift.type} on ${getReadableDateString(new Date(shift.date))}`;

    if (confirm(`Are you sure you want to delete this event?\n\n${eventDetails}`)) {
        // NEW: Delete from Firebase first
        deleteShiftFromFirebase(shiftId)
            .then(() => {
                // Create a completely new array without the deleted shift
                shifts = shifts.filter(shift => shift.id !== shiftId);
                console.log(`Deleted shift with ID ${shiftId}, remaining shifts: ${shifts.length}`);

                // Verify array integrity
                checkArrayIntegrity();

                renderCalendar();

                // Announce deletion for screen readers
                announceForScreenReader(`Deleted ${eventDetails}`);
            })
            .catch(error => {
                console.error('Error deleting shift from Firebase:', error);
                alert('Could not delete event. Please try again later.');
            });
    }
}

// FIREBASE FUNCTION: Delete shift from Firebase
function deleteShiftFromFirebase(shiftId) {
    return firebase.firestore().collection('shifts').doc(shiftId.toString())
        .delete()
        .then(() => {
            console.log('Shift deleted successfully from Firebase:', shiftId);
            return true;
        })
        .catch(error => {
            console.error('Error deleting shift from Firebase:', error);
            throw error;
        });
}

// Edit shift
function editShift(shiftId) {
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) {
        console.error(`Shift with ID ${shiftId} not found`);
        return;
    }

    // Set editing mode
    state.isEditing = true;
    state.editingShiftId = shiftId;

    // Update modal title
    elements.modalTitle.textContent = 'Edit Event';
    elements.submitButton.textContent = 'Update Event';

    try {
        // Fill form with shift data
        elements.shiftDateInput.value = shift.date;
        elements.shiftEmployeeSelect.value = shift.employeeId;

        // Set start and end times
        selectDropdownOptionByValue(elements.startTimeSelect, shift.startTime);
        selectDropdownOptionByValue(elements.endTimeSelect, shift.endTime);

        // Set event type and handle theme if needed
        elements.shiftTypeSelect.value = shift.type;
        toggleThemeField(); // Update theme field visibility based on type

        if (shift.type === 'themed-trivia') {
            elements.shiftThemeInput.value = shift.theme;
        }

        // Set location and notes
        elements.shiftLocationSelect.value = shift.location;
        elements.shiftNotesInput.value = shift.notes || '';

        // Open modal
        elements.shiftModal.style.display = 'flex';

        // Set focus on first field
        elements.shiftDateInput.focus();

        // Announce for screen readers
        announceForScreenReader(`Editing event for ${employees[shift.employeeId]} on ${getReadableDateString(new Date(shift.date))}`);
    } catch (error) {
        console.error('Error editing shift:', error);
        alert('There was an error while loading the event details. Please try again.');
    }
}

// Save shift (for both new and edit operations)
function saveShift(e) {
    if (e && e.preventDefault) {
        e.preventDefault();
    }

    // Validate the form
    if (!validateShiftForm()) {
        return;
    }

    // Get form values
    const date = elements.shiftDateInput.value;
    const employeeId = elements.shiftEmployeeSelect.value;
    const startTime = elements.startTimeSelect.value;
    const endTime = elements.endTimeSelect.value;
    const type = elements.shiftTypeSelect.value;
    const theme = elements.shiftTypeSelect.value === 'themed-trivia' ? elements.shiftThemeInput.value : '';
    const location = elements.shiftLocationSelect.value;
    const notes = elements.shiftNotesInput.value;

    // Create shift data object
    const shiftData = {
        date,
        employeeId,
        startTime,
        endTime,
        type,
        theme,
        location,
        notes
    };

    // Check for double booking if not forced
    if (!state.forceBooking) {
        const conflictingShifts = checkForDoubleBooking(shiftData, state.editingShiftId);

        if (conflictingShifts.length > 0) {
            // Store the shift data for later use if user decides to proceed anyway
            state.pendingShiftData = shiftData;

            // Optional micro-UX: prevent double submit while the warning is open
            if (elements.submitButton) {
                try { elements.submitButton.disabled = true; } catch (_) {}
            }

            // Show simplified warning
            showSimplifiedWarning(employeeId);
            return;
        }
    }

    // Reset the force booking flag
    state.forceBooking = false;

    let actionType = 'Added';

    // Show loading state
    const submitButton = elements.submitButton;
    const originalText = submitButton.textContent;
    submitButton.textContent = 'Saving...';
    submitButton.disabled = true;

    // Use Promise to handle both create and update
    let savePromise;

    if (state.isEditing && state.editingShiftId) {
        // Update existing shift
        actionType = 'Updated';
        const updatedShift = {
            ...shifts.find(s => s.id === state.editingShiftId),
            ...shiftData
        };

        savePromise = updateShiftInFirebase(state.editingShiftId.toString(), updatedShift)
            .then(() => {
                // Update local state
                const index = shifts.findIndex(s => s.id === state.editingShiftId);
                if (index !== -1) {
                    shifts[index] = { ...updatedShift, id: state.editingShiftId };
                }
                return updatedShift;
            });
    } else {
        // Create new shift
        savePromise = saveShiftToFirebase(shiftData)
            .then(newId => {
                const newShift = {
                    ...shiftData,
                    id: newId
                };

                // Add the new shift to the array
                shifts.push(newShift);

                return newShift;
            });
    }

    // Handle the promise result
    savePromise
        .then(shift => {
            // Close modal and refresh calendar
            closeShiftModal();
            renderCalendar();

            // Announce for screen readers
            const eventType = eventTypes[type] || type;
            const employeeName = employees[employeeId] || 'Unknown host';
            announceForScreenReader(`${actionType} ${eventType} event for ${employeeName} on ${getReadableDateString(new Date(date))}`);
        })
        .catch(error => {
            console.error('Error saving shift:', error);
            alert('There was an error saving the event. Please try again.');
        })
        .finally(() => {
            // Restore button state
            submitButton.textContent = originalText;
            submitButton.disabled = false;
        });
}

// NEW: Save shift to Firebase
function saveShiftToFirebase(shiftData) {
    return firebase.firestore().collection('shifts')
        .add({
            ...shiftData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        })
        .then(docRef => {
            console.log('Shift saved to Firebase with ID:', docRef.id);
            return docRef.id;
        })
        .catch(error => {
            console.error('Error saving shift to Firebase:', error);
            throw error;
        });
}

// NEW: Update shift in Firebase
function updateShiftInFirebase(shiftId, shiftData) {
    // Ensure shiftId is a string
    const docId = String(shiftId);

    console.log('Updating shift in Firebase with ID:', docId);

    return firebase.firestore().collection('shifts').doc(docId)
        .update({
            ...shiftData,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        })
        .then(() => {
            console.log('Shift updated in Firebase:', docId);
            return docId;
        })
        .catch(error => {
            console.error('Error updating shift in Firebase:', error, 'ID used:', docId);
            throw error;
        });
}

// NEW: Load shifts from Firebase
function loadShiftsFromFirebase() {
    console.log('Loading shifts from Firebase...');

    return firebase.firestore().collection('shifts')
        .get()
        .then(querySnapshot => {
            const loadedShifts = [];

            querySnapshot.forEach(doc => {
                // Get the data and add the document ID as the shift ID
                const shiftData = doc.data();

                // Convert to a shift object
                const shift = {
                    id: doc.id,
                    date: shiftData.date,
                    employeeId: shiftData.employeeId,
                    startTime: shiftData.startTime,
                    endTime: shiftData.endTime,
                    type: shiftData.type,
                    theme: shiftData.theme || '',
                    location: shiftData.location,
                    notes: shiftData.notes || ''
                };

                loadedShifts.push(shift);
            });

            console.log(`Loaded ${loadedShifts.length} shifts from Firebase`);

            // Return the loaded shifts
            return loadedShifts;
        })
        .catch(error => {
            console.error('Error loading shifts from Firebase:', error);
            // Return empty array in case of error
            return [];
        });
}

// Helper function to move a shift from one date to another
function moveShift(shiftId, targetDate) {
    console.log(`Moving shift ${shiftId} to date ${targetDate}`);

    // Find the shift by ID
    const originalShift = shifts.find(shift => shift.id === shiftId);

    if (!originalShift) {
        console.error(`Cannot find shift with ID: ${shiftId}`);
        return false;
    }

    // Create a new shift with the updated date
    const movedShift = {
        ...originalShift,
        date: targetDate
    };

    // NEW: Update in Firebase first
    return updateShiftInFirebase(shiftId.toString(), movedShift)
        .then(() => {
            // Create a completely new array without the original shift
            const newShifts = [...shifts.filter(shift => shift.id !== shiftId)];

            // Add the new shift to the new array
            newShifts.push(movedShift);

            // Replace the entire shifts array with the new array
            shifts = newShifts;

            console.log(`Successfully moved shift ${shiftId} to ${targetDate}`);
            return true;
        })
        .catch(error => {
            console.error('Error moving shift in Firebase:', error);
            alert('Could not move event. Please try again later.');
            return false;
        });
}

// Double booking check - modified to check for same day bookings
function checkForDoubleBooking(newShift, excludeShiftId = null) {
    try {
        // Get basic shift data
        const dateStr = newShift.date;
        const employeeId = newShift.employeeId;

        // Find all shifts for the same employee on the same date
        const employeeShifts = shifts.filter(shift =>
            shift.date === dateStr &&
            shift.employeeId === employeeId &&
            (excludeShiftId === null || shift.id !== excludeShiftId)
        );

        // Return all shifts on the same day for this employee
        return employeeShifts;
    } catch (error) {
        console.error('Error checking for double booking:', error);
        return [];
    }
}

// Debug function to check array integrity and detect duplicate IDs
function checkArrayIntegrity() {
    // Check for duplicate IDs
    const ids = shifts.map(s => s.id);
    const uniqueIds = new Set(ids);

    if (ids.length !== uniqueIds.size) {
        console.error('DUPLICATE IDs DETECTED IN SHIFTS ARRAY!');
        // Find which IDs are duplicated
        const idCounts = {};
        ids.forEach(id => {
            idCounts[id] = (idCounts[id] || 0) + 1;
        });

        // Log the duplicates
        Object.entries(idCounts).forEach(([id, count]) => {
            if (count > 1) {
                console.error(`ID ${id} appears ${count} times`);
                // Log the duplicate shifts
                const duplicates = shifts.filter(s => s.id === id);
                console.error('Duplicate shifts:', duplicates);
            }
        });

        return false;
    }

    return true;
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
    announceForScreenReader('All events expanded');
}

// Collapse all shifts
function collapseAllShifts() {
    // Get all shift elements
    const shiftElements = document.querySelectorAll('.shift');

    // Collapse each shift and store the state
    shiftElements.forEach(shiftDiv => {
        const shiftId = shiftDiv.getAttribute('data-id');
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

// Toggle week collapse state
function toggleWeekCollapse(weekToggleButton) {
    const weekIndex = parseInt(weekToggleButton.getAttribute('data-week-index'));
    if (isNaN(weekIndex)) return;

    const triangle = weekToggleButton.querySelector('div');

    // Get all shifts for this week
    const weekShifts = getShiftsForWeek(weekIndex);
    if (weekShifts.length === 0) return;

    // Determine current state
    const isCollapsed = triangle.className === 'triangle-right';

    // Get all week toggle buttons for this week
    const weekToggleButtons = document.querySelectorAll(`.week-toggle-button[data-week-index="${weekIndex}"]`);

    // Get all shift elements for this week
    const weekRow = document.querySelector(`tr[data-week-index="${weekIndex}"]`);
    if (!weekRow) return;

    const shiftContainers = weekRow.querySelectorAll('.shift-container');
    const shiftElements = [];

    shiftContainers.forEach(container => {
        const shifts = container.querySelectorAll('.shift');
        shifts.forEach(shift => {
            shiftElements.push(shift);
        });
    });

    if (isCollapsed) {
        // Expand all shifts in the week
        shiftElements.forEach(shiftDiv => {
            const shiftId = shiftDiv.getAttribute('data-id');
            if (shiftId) {
                state.collapsedShifts.delete(shiftId);
                shiftDiv.classList.remove('collapsed');

                // Update the individual shift toggle button, if it exists
                const shiftToggle = shiftDiv.querySelector('.toggle-button div');
                if (shiftToggle) shiftToggle.className = 'triangle-down';

                shiftDiv.setAttribute('aria-expanded', 'true');
            }
        });

        // Update all week toggle buttons for this week
        weekToggleButtons.forEach(btn => {
            const btnTriangle = btn.querySelector('div');
            if (btnTriangle) btnTriangle.className = 'triangle-down';
        });

        // Announce for screen readers
        announceForScreenReader(`Expanded all events for week ${weekIndex + 1}`);
    } else {
        // Collapse all shifts in the week
        shiftElements.forEach(shiftDiv => {
            const shiftId = shiftDiv.getAttribute('data-id');
            if (shiftId) {
                state.collapsedShifts.add(shiftId);
                shiftDiv.classList.add('collapsed');

                // Update the individual shift toggle button, if it exists
                const shiftToggle = shiftDiv.querySelector('.toggle-button div');
                if (shiftToggle) shiftToggle.className = 'triangle-right';

                shiftDiv.setAttribute('aria-expanded', 'false');
            }
        });

        // Update all week toggle buttons for this week
        weekToggleButtons.forEach(btn => {
            const btnTriangle = btn.querySelector('div');
            if (btnTriangle) btnTriangle.className = 'triangle-right';
        });

        // Announce for screen readers
        announceForScreenReader(`Collapsed all events for week ${weekIndex + 1}`);
    }
}
