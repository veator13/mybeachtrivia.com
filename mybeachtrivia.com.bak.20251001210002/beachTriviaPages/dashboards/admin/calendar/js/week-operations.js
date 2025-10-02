// week-operations.js
// Functions for week-related operations in the calendar

// Toggle week collapse/expand
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
        const shifts = Array.from(container.querySelectorAll('.shift'));
        weekShiftElements.push(...shifts);
    });
    
    // Find the opposite button (if we're toggling left, update right and vice versa)
    const otherToggleButtons = document.querySelectorAll(`.week-toggle-button[data-week-index="${weekIndex}"]`);
    
    if (isCurrentlyCollapsed) {
        // Expand all shifts in the week
        weekShiftElements.forEach(shiftDiv => {
            // MODIFIED: Don't use parseInt, use the shift ID directly as a string
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
        otherToggleButtons.forEach(btn => {
            const btnTriangle = btn.querySelector('div');
            if (btnTriangle) btnTriangle.className = 'triangle-down';
        });
        
        // Announce for screen readers
        announceForScreenReader(`Expanded all events for week ${weekIndex + 1}`);
    } else {
        // Collapse all shifts in the week
        weekShiftElements.forEach(shiftDiv => {
            // MODIFIED: Don't use parseInt, use the shift ID directly as a string
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
        otherToggleButtons.forEach(btn => {
            const btnTriangle = btn.querySelector('div');
            if (btnTriangle) btnTriangle.className = 'triangle-right';
        });
        
        // Announce for screen readers
        announceForScreenReader(`Collapsed all events for week ${weekIndex + 1}`);
    }
}

// NEW FUNCTION: Handle clearing all shifts for a specific week
function clearAllShiftsForWeek(weekIndex) {
    if (isNaN(weekIndex)) return;
    
    // Get all shifts for this week
    const weekShifts = getShiftsForWeek(weekIndex);
    
    // If there are no shifts, show message and return
    if (weekShifts.length === 0) {
        alert('No events to clear for this week.');
        return;
    }
    
    // Get the week start date for the modal title
    const weekRow = document.querySelector(`tr[data-week-index="${weekIndex}"]`);
    if (!weekRow) return;
    
    const dateCells = Array.from(weekRow.querySelectorAll('td:not(.week-copy-cell)'));
    if (dateCells.length === 0) return;
    
    // Find the first valid date in the week
    let weekStartDate = null;
    for (const cell of dateCells) {
        const dateStr = cell.getAttribute('data-date');
        if (dateStr) {
            weekStartDate = new Date(dateStr);
            break;
        }
    }
    
    if (!weekStartDate) return;
    
    // Format week range for display
    const formattedStartDate = getReadableDateString(weekStartDate);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const formattedEndDate = getReadableDateString(weekEndDate);
    
    // Set the modal title and warning message
    document.getElementById('clear-day-title').textContent = `Clear Events for Week`;
    document.getElementById('clear-day-warning').textContent = `Are you sure you want to delete all ${weekShifts.length} events from ${formattedStartDate} to ${formattedEndDate}? This action cannot be undone.`;
    
    // Populate the events list
    const eventsContainer = document.getElementById('day-events-list');
    eventsContainer.innerHTML = '';
    
    // Add event count
    const countElement = document.createElement('div');
    countElement.className = 'event-count';
    countElement.textContent = `${weekShifts.length} event${weekShifts.length > 1 ? 's' : ''} will be permanently deleted:`;
    eventsContainer.appendChild(countElement);
    
    // Add each shift as a list item
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
    
    // Remove any existing date attribute to avoid confusion
    document.getElementById('confirm-clear-day').removeAttribute('data-date');
    
    // Show the modal
    document.getElementById('clear-day-modal').style.display = 'flex';
    document.getElementById('clear-day-modal').setAttribute('aria-hidden', 'false');
    
    // Set focus to cancel button for safety
    setTimeout(() => {
        document.getElementById('cancel-clear-day').focus();
    }, 100);
    
    // Announce for screen readers
    announceForScreenReader(`Confirm clearing ${weekShifts.length} events for the week of ${formattedStartDate}`);
}

// NEW FUNCTION: Execute the deletion of all shifts for a week
function executeAllWeekShiftsClear() {
    const weekIndex = document.getElementById('confirm-clear-day').getAttribute('data-week-index');
    if (!weekIndex) {
        console.error('No week index provided for clearing events');
        return;
    }
    
    // Get all shifts for the selected week
    const shiftsToDelete = getShiftsForWeek(parseInt(weekIndex));
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
            announceForScreenReader(`Deleted ${successCount} events from the week.`);
            
            // Refresh the calendar
            renderCalendar();
        })
        .catch(error => {
            console.error('Error deleting shifts:', error);
            alert('An error occurred while deleting events. Please try again.');
            closeClearDayModal();
        });
}