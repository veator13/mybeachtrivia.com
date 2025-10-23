// Initialize calendar with error handling
function initCalendar() {
    try {
        populateTimeDropdowns();
        setupAccessibilitySupport();
        renderCalendar();
        attachEventListeners();
        setupMonthNavigationDropzones();
    } catch (error) {
        console.error('Error initializing calendar:', error);
        // Basic fallback rendering if advanced features fail
        if (elements.calendarBody) {
            elements.calendarBody.innerHTML = '<tr><td colspan="7">Calendar could not be loaded. Please refresh the page.</td></tr>';
        }
    }
}

// Render the calendar - optimized to use fragments and avoid excessive DOM manipulation
function renderCalendar() {
    const firstDay = new Date(state.currentYear, state.currentMonth, 1);
    const lastDay = new Date(state.currentYear, state.currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    // Update month display
    elements.currentMonthDisplay.textContent = getMonthYearString(state.currentYear, state.currentMonth);

    // Create document fragment for better performance
    const fragment = document.createDocumentFragment();
    
    // Variables for building the calendar
    let date = 1;
    
    // Create the calendar rows and cells
    for (let weekIndex = 0; weekIndex < 6; weekIndex++) {
        // Create a table row
        const row = document.createElement('tr');
        
        // Make rows keyboard navigable
        row.setAttribute('role', 'row');
        row.setAttribute('data-week-index', weekIndex);
        
        // Create week copy button cell
        const weekCopyCell = document.createElement('td');
        weekCopyCell.classList.add('week-copy-cell');
        
        // Create copy button for the week
        const weekStartDate = new Date(state.currentYear, state.currentMonth, date - (weekIndex === 0 ? startingDayOfWeek : 0));
        const weekCopyButton = document.createElement('span');
        weekCopyButton.classList.add('week-copy-button');
        weekCopyButton.setAttribute('tabindex', '0');
        weekCopyButton.setAttribute('role', 'button');
        weekCopyButton.setAttribute('aria-label', `Copy week starting ${getReadableDateString(weekStartDate)}`);
        weekCopyButton.setAttribute('draggable', 'true');
        weekCopyButton.setAttribute('data-week-index', weekIndex);
        weekCopyButton.innerHTML = '⧉';
        
        weekCopyCell.appendChild(weekCopyButton);
        
        // NEW: Add week move button
        const weekMoveButton = document.createElement('span');
        weekMoveButton.classList.add('week-move-button');
        weekMoveButton.setAttribute('tabindex', '0');
        weekMoveButton.setAttribute('role', 'button');
        weekMoveButton.setAttribute('aria-label', `Move week starting ${getReadableDateString(weekStartDate)}`);
        weekMoveButton.setAttribute('draggable', 'true');
        weekMoveButton.setAttribute('data-week-index', weekIndex);
        weekMoveButton.innerHTML = '✥';
        
        weekCopyCell.appendChild(weekMoveButton);
        
        // Add week toggle button for collapsing/expanding all events in the week
        const weekToggleButton = document.createElement('span');
        weekToggleButton.classList.add('week-toggle-button');
        weekToggleButton.setAttribute('tabindex', '0');
        weekToggleButton.setAttribute('role', 'button');
        weekToggleButton.setAttribute('aria-label', `Toggle all events for week starting ${getReadableDateString(weekStartDate)}`);
        weekToggleButton.setAttribute('data-week-index', weekIndex);

        // Determine if the week is fully collapsed
        const isWeekCollapsed = isWeekFullyCollapsed(weekIndex);

        // Create the triangle indicator based on current state
        const weekTriangle = document.createElement('div');
        weekTriangle.className = isWeekCollapsed ? 'triangle-right' : 'triangle-down';
        weekToggleButton.appendChild(weekTriangle);

        weekCopyCell.appendChild(weekToggleButton);
        
        // ADD NEW CODE: Week clear button
        const weekClearButton = document.createElement('span');
        weekClearButton.classList.add('week-clear-button');
        weekClearButton.setAttribute('tabindex', '0');
        weekClearButton.setAttribute('role', 'button');
        weekClearButton.setAttribute('aria-label', `Clear all events for week starting ${getReadableDateString(weekStartDate)}`);
        weekClearButton.setAttribute('data-week-index', weekIndex);
        weekClearButton.innerHTML = '×';
        
        weekCopyCell.appendChild(weekClearButton);
        
        row.appendChild(weekCopyCell);
        
        // Create cells for each day of the week
        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            const cell = document.createElement('td');
            cell.setAttribute('role', 'gridcell');
            
            if (weekIndex === 0 && dayIndex < startingDayOfWeek) {
                // Previous month's days
                renderPreviousMonthDay(cell, startingDayOfWeek, dayIndex);
            } else if (date > daysInMonth) {
                // Next month's days
                renderNextMonthDay(cell, date, daysInMonth);
                date++;
            } else {
                // Current month's days
                renderCurrentMonthDay(cell, date);
                date++;
            }
            
            row.appendChild(cell);
        }

        // Create right week copy button cell (RIGHT SIDE - NEW CODE)
        const rightWeekCopyCell = document.createElement('td');
        rightWeekCopyCell.classList.add('week-copy-cell');
        
        // Create copy button for the week (right side)
        const rightWeekCopyButton = document.createElement('span');
        rightWeekCopyButton.classList.add('week-copy-button');
        rightWeekCopyButton.setAttribute('tabindex', '0');
        rightWeekCopyButton.setAttribute('role', 'button');
        rightWeekCopyButton.setAttribute('aria-label', `Copy week starting ${getReadableDateString(weekStartDate)}`);
        rightWeekCopyButton.setAttribute('draggable', 'true');
        rightWeekCopyButton.setAttribute('data-week-index', weekIndex);
        rightWeekCopyButton.innerHTML = '⧉';
        
        rightWeekCopyCell.appendChild(rightWeekCopyButton);
        
        // NEW: Add week move button for right side
        const rightWeekMoveButton = document.createElement('span');
        rightWeekMoveButton.classList.add('week-move-button');
        rightWeekMoveButton.setAttribute('tabindex', '0');
        rightWeekMoveButton.setAttribute('role', 'button');
        rightWeekMoveButton.setAttribute('aria-label', `Move week starting ${getReadableDateString(weekStartDate)}`);
        rightWeekMoveButton.setAttribute('draggable', 'true');
        rightWeekMoveButton.setAttribute('data-week-index', weekIndex);
        rightWeekMoveButton.innerHTML = '✥';
        
        rightWeekCopyCell.appendChild(rightWeekMoveButton);
        
        // Add week toggle button for right side
        const rightWeekToggleButton = document.createElement('span');
        rightWeekToggleButton.classList.add('week-toggle-button');
        rightWeekToggleButton.setAttribute('tabindex', '0');
        rightWeekToggleButton.setAttribute('role', 'button');
        rightWeekToggleButton.setAttribute('aria-label', `Toggle all events for week starting ${getReadableDateString(weekStartDate)}`);
        rightWeekToggleButton.setAttribute('data-week-index', weekIndex);

        // Use the same collapsed state as the left button
        const rightWeekTriangle = document.createElement('div');
        rightWeekTriangle.className = isWeekCollapsed ? 'triangle-right' : 'triangle-down';
        rightWeekToggleButton.appendChild(rightWeekTriangle);

        rightWeekCopyCell.appendChild(rightWeekToggleButton);
        
        // ADD NEW CODE: Week clear button for right side
        const rightWeekClearButton = document.createElement('span');
        rightWeekClearButton.classList.add('week-clear-button');
        rightWeekClearButton.setAttribute('tabindex', '0');
        rightWeekClearButton.setAttribute('role', 'button');
        rightWeekClearButton.setAttribute('aria-label', `Clear all events for week starting ${getReadableDateString(weekStartDate)}`);
        rightWeekClearButton.setAttribute('data-week-index', weekIndex);
        rightWeekClearButton.innerHTML = '×';
        
        rightWeekCopyCell.appendChild(rightWeekClearButton);
        
        row.appendChild(rightWeekCopyCell);

        fragment.appendChild(row);
        
        // Stop if we've reached the end of the month
        if (date > daysInMonth) {
            break;
        }
    }

    // Save scroll position before updating
    const scrollPosition = {
        x: window.scrollX,
        y: window.scrollY
    };

    // Clear table and add new content
    elements.calendarBody.innerHTML = '';
    elements.calendarBody.appendChild(fragment);
    
    // Only focus today's cell on initial load, not on updates
    if (state.initialLoad) {
        setTimeout(() => {
            focusTodayCell();
            state.initialLoad = false;
        }, 100);
    } else {
        // Restore scroll position
        setTimeout(() => {
            window.scrollTo(scrollPosition.x, scrollPosition.y);
        }, 10);
    }
    
    // Announce month change for screen readers
    announceForScreenReader(`Calendar showing ${getMonthYearString(state.currentYear, state.currentMonth)}`);
    
    // Ensure dropzones are hidden after rendering
    hideMonthNavigationDropzones();
}

// Split rendering logic for different cell types
function renderPreviousMonthDay(cell, startingDayOfWeek, dayIndex) {
    cell.classList.add('other-month');
    const prevMonthLastDay = new Date(state.currentYear, state.currentMonth, 0).getDate();
    const prevDate = prevMonthLastDay - (startingDayOfWeek - dayIndex - 1);
    
    cell.innerHTML = `<div class="date">${prevDate}</div>`;
}

function renderNextMonthDay(cell, date, daysInMonth) {
    cell.classList.add('other-month');
    const nextDate = date - daysInMonth;
    
    cell.innerHTML = `<div class="date">${nextDate}</div>`;
}

function renderCurrentMonthDay(cell, date) {
    const dateObj = new Date(state.currentYear, state.currentMonth, date);
    const dateStr = formatDate(dateObj);
    const isToday = isDateToday(dateObj);
    
    // Add today class if it's today
    const dateClass = isToday ? 'date today' : 'date';
    
    // Create the cell content with ARIA attributes for accessibility
    cell.innerHTML = `
        <div class="${dateClass}" aria-label="${getReadableDateString(dateObj)}">
            ${date}
            <span class="cell-copy-button" data-date="${dateStr}" tabindex="0" role="button" aria-label="Copy button for ${getReadableDateString(dateObj)}" draggable="true">⧉</span>
            <span class="clear-day-button" data-date="${dateStr}" tabindex="0" role="button" aria-label="Clear all events on ${getReadableDateString(dateObj)}">×</span>
            <span class="drag-day-button" data-date="${dateStr}" tabindex="0" role="button" aria-label="Drag all events on ${getReadableDateString(dateObj)}" draggable="true">✥</span>
            <span class="add-button" data-date="${dateStr}" tabindex="0" role="button" aria-label="Add event on ${getReadableDateString(dateObj)}">+</span>
        </div>
        <div class="shift-container" id="shifts-${dateStr}" data-date="${dateStr}"></div>
    `;
    
    // Set date attribute for identifying the cell
    cell.setAttribute('data-date', dateStr);
    
    // Add today highlight to the cell itself
    if (isToday) {
        cell.classList.add('today-cell');
        cell.setAttribute('tabindex', '0');
    }
    
    // Populate shifts for this date
    populateShifts(cell.querySelector('.shift-container'), dateStr);
}

// Navigation and filtering - with debouncing
function goToPrevMonth(preserveDragState = false) {
    // Force-hide dropzones at start when not preserving drag state
    if (!preserveDragState) {
        hideMonthNavigationDropzones();
    }
    
    // Only reset drag state if not preserving it
    if (!preserveDragState) {
        // First, forcibly reset ANY lingering drag state
        state.draggedShiftId = null;
        state.isDragCopy = false;
        state.isDragWeekCopy = false;
        state.isDragWeekMove = false; // NEW: Reset week move state
        state.copyingDayShifts = [];
        state.copyingWeekShifts = [];
        state.movingWeekShifts = []; // NEW: Reset moving week shifts array
        state.sourceWeekIndex = null;
        state.pendingCrossMonthDrag = null;
        clearTimeout(state.monthNavigationTimer);
        state.isHoveringPrevMonth = false;
        state.isHoveringNextMonth = false;
    }
    
    // Then proceed with normal month navigation
    state.currentMonth--;
    if (state.currentMonth < 0) {
        state.currentMonth = 11;
        state.currentYear--;
    }
    
    // Different behavior if we're in the middle of a drag operation
    // This condition should include preserveDragState to determine if we're handling cross-month drag
    if (preserveDragState || state.draggedShiftId || state.copyingDayShifts.length > 0 || 
        state.copyingWeekShifts.length > 0 || state.movingWeekShifts.length > 0) { // Added check for movingWeekShifts
        // Immediate render for drag operations to maintain context
        renderCalendar();
        
        // Re-display dropzones if we're dragging
        setTimeout(() => {
            if (elements.prevMonthDropzone && elements.nextMonthDropzone) {
                elements.prevMonthDropzone.style.display = 'flex';
                elements.nextMonthDropzone.style.display = 'flex';
                elements.prevMonthDropzone.style.opacity = '0.3';
                elements.nextMonthDropzone.style.opacity = '0.3';
            }
        }, 50);
    } else {
        // Use renderCalendar directly
        renderCalendar();
        // Explicitly force hide dropzones with a slight delay
        setTimeout(hideMonthNavigationDropzones, 100);
    }
}

function goToNextMonth(preserveDragState = false) {
    // Force-hide dropzones at start when not preserving drag state
    if (!preserveDragState) {
        hideMonthNavigationDropzones();
    }
    
    // Only reset drag state if not preserving it
    if (!preserveDragState) {
        // First, forcibly reset ANY lingering drag state
        state.draggedShiftId = null;
        state.isDragCopy = false;
        state.isDragWeekCopy = false;
        state.isDragWeekMove = false; // NEW: Reset week move state
        state.copyingDayShifts = [];
        state.copyingWeekShifts = [];
        state.movingWeekShifts = []; // NEW: Reset moving week shifts array
        state.sourceWeekIndex = null;
        state.pendingCrossMonthDrag = null;
        clearTimeout(state.monthNavigationTimer);
        state.isHoveringPrevMonth = false;
        state.isHoveringNextMonth = false;
    }
    
    // Then proceed with normal month navigation
    state.currentMonth++;
    if (state.currentMonth > 11) {
        state.currentMonth = 0;
        state.currentYear++;
    }
    
    // Different behavior if we're in the middle of a drag operation
    // This condition should include preserveDragState to determine if we're handling cross-month drag
    if (preserveDragState || state.draggedShiftId || state.copyingDayShifts.length > 0 || 
        state.copyingWeekShifts.length > 0 || state.movingWeekShifts.length > 0) { // Added check for movingWeekShifts
        // Immediate render for drag operations to maintain context
        renderCalendar();
        
        // Re-display dropzones if we're dragging
        setTimeout(() => {
            if (elements.prevMonthDropzone && elements.nextMonthDropzone) {
                elements.prevMonthDropzone.style.display = 'flex';
                elements.nextMonthDropzone.style.display = 'flex'; 
                elements.prevMonthDropzone.style.opacity = '0.3';
                elements.nextMonthDropzone.style.opacity = '0.3';
            }
        }, 50);
    } else {
        // Use renderCalendar directly
        renderCalendar();
        // Explicitly force hide dropzones with a slight delay
        setTimeout(hideMonthNavigationDropzones, 100);
    }
}

function handleFilterChange() {
    state.filters.employee = elements.employeeSelect.value;
    state.filters.eventType = elements.eventSelect.value;
    state.filters.location = elements.locationSelect.value;
    // Use renderCalendar directly
    renderCalendar();
}

// Populate shifts for a specific date - with error handling
// MODIFIED: Added better error handling for non-existent employee data
function populateShifts(container, dateStr) {
    if (!container) return;
    
    try {
        const dayShifts = getShiftsForDate(dateStr);
        
        if (dayShifts.length === 0) return;
        
        const fragment = document.createDocumentFragment();
        
        dayShifts.forEach(shift => {
            // Verify employee exists - ADDED CHECK
            const employeeExists = employees[shift.employeeId] || 
                                  (window.employeesData && window.employeesData[shift.employeeId]);
                
            // Apply filters
            if ((state.filters.employee === 'all' || state.filters.employee === shift.employeeId) && 
                (state.filters.eventType === 'all' || state.filters.eventType === shift.type) &&
                (state.filters.location === 'all' || state.filters.location === shift.location)) {
                
                const shiftDiv = createShiftElement(shift);
                if (shiftDiv) {
                    fragment.appendChild(shiftDiv);
                }
            }
        });
        
        container.appendChild(fragment);
    } catch (error) {
        console.error('Error populating shifts:', error);
    }
}

// Get shifts for a specific date
function getShiftsForDate(dateStr) {
    return shifts.filter(shift => shift.date === dateStr);
}

// Handle cross-month drag navigation
function handleCrossMonthDragNavigation(direction) {
    console.log(`Navigating to ${direction} month during drag operation`);
    
    // Save the current drag operation state
    const pendingDrag = {
        draggedShiftId: state.draggedShiftId,
        isDragCopy: state.isDragCopy,
        isDragWeekCopy: state.isDragWeekCopy,
        isDragWeekMove: state.isDragWeekMove, // NEW: Save week move state
        copyingDayShifts: [...state.copyingDayShifts],
        copyingWeekShifts: [...state.copyingWeekShifts],
        movingWeekShifts: [...state.movingWeekShifts], // NEW: Save moving week shifts
        sourceWeekIndex: state.sourceWeekIndex,
        // Store the current month/year so we can navigate back if needed
        sourceMonth: state.currentMonth,
        sourceYear: state.currentYear
    };
    
    // Store in state for after the month changes
    state.pendingCrossMonthDrag = pendingDrag;
    
    // For week copies or moves, we need to preserve the source dates for mapping
    if ((state.isDragWeekCopy || state.isDragWeekMove) && 
        (state.copyingWeekShifts.length > 0 || state.movingWeekShifts.length > 0)) {
        // Store all shift dates from source week for proper mapping later
        const sourceDates = state.isDragWeekCopy ? 
            state.copyingWeekShifts.map(shift => shift.date) : 
            state.movingWeekShifts.map(shift => shift.date);
        state.pendingCrossMonthDrag.sourceDates = sourceDates;
        console.log("Preserving source week dates for cross-month mapping:", sourceDates);
    }
    
    // Hide the dropzones during transition
    elements.prevMonthDropzone.classList.remove('active');
    elements.nextMonthDropzone.classList.remove('active');
    
    // Navigate to the target month - pass true to preserve drag state
    if (direction === 'prev') {
        goToPrevMonth(true);
    } else {
        goToNextMonth(true);
    }
    
    // Announce for screen readers
    announceForScreenReader(`Moved to ${direction === 'prev' ? 'previous' : 'next'} month while dragging. Continue to drag to desired date.`);
    
    // After a short delay, restore the drag state in the new month
    setTimeout(() => {
        // Make sure we restore all the necessary drag state
        state.draggedShiftId = pendingDrag.draggedShiftId;
        state.isDragCopy = pendingDrag.isDragCopy;
        state.isDragWeekCopy = pendingDrag.isDragWeekCopy;
        state.isDragWeekMove = pendingDrag.isDragWeekMove; // NEW: Restore week move state
        state.copyingDayShifts = pendingDrag.copyingDayShifts;
        state.copyingWeekShifts = pendingDrag.copyingWeekShifts;
        state.movingWeekShifts = pendingDrag.movingWeekShifts; // NEW: Restore moving week shifts
        state.sourceWeekIndex = pendingDrag.sourceWeekIndex;
        
        // Reset hover states
        state.isHoveringPrevMonth = false;
        state.isHoveringNextMonth = false;
    }, 50);
}

// Helper function to get all shifts for a specific week
function getShiftsForWeek(weekIndex) {
    // Get all calendar cells for this week
    const weekRow = document.querySelector(`tr[data-week-index="${weekIndex}"]`);
    if (!weekRow) return [];
    
    // Get all date cells (excluding the week copy cell)
    const dateCells = Array.from(weekRow.querySelectorAll('td:not(.week-copy-cell)'));
    
    // Get unique dates from these cells
    const weekDates = dateCells
        .map(cell => cell.getAttribute('data-date'))
        .filter(date => date !== null);
    
    // Get all shifts for these dates that match current filters
    const weekShifts = [];
    
    weekDates.forEach(dateStr => {
        if (!dateStr) return;
        
        const dayShifts = getShiftsForDate(dateStr).filter(shift => 
            (state.filters.employee === 'all' || state.filters.employee === shift.employeeId) && 
            (state.filters.eventType === 'all' || state.filters.eventType === shift.type) &&
            (state.filters.location === 'all' || state.filters.location === shift.location)
        );
        
        weekShifts.push(...dayShifts);
    });
    
    return weekShifts;
}

// Helper function to check if a week is fully collapsed
function isWeekFullyCollapsed(weekIndex) {
    // Get all shifts for this week
    const weekShifts = getShiftsForWeek(weekIndex);
    
    // If no shifts, consider it expanded
    if (weekShifts.length === 0) return false;
    
    // Check if all shifts are in the collapsed state
    return weekShifts.every(shift => state.collapsedShifts.has(shift.id));
}

// Helper function to check if a week is empty
function isWeekEmpty(weekIndex) {
    const weekShifts = getShiftsForWeek(weekIndex);
    return weekShifts.length === 0;
}

// Function to get date mapping for week to week copying
function getWeekDateMapping(sourceWeekIndex, targetWeekIndex) {
    const sourceRow = document.querySelector(`tr[data-week-index="${sourceWeekIndex}"]`);
    const targetRow = document.querySelector(`tr[data-week-index="${targetWeekIndex}"]`);
    
    if (!sourceRow || !targetRow) return null;
    
    // Get all date cells (excluding week copy cell)
    const sourceCells = Array.from(sourceRow.querySelectorAll('td:not(.week-copy-cell)'));
    const targetCells = Array.from(targetRow.querySelectorAll('td:not(.week-copy-cell)'));
    
    // Skip if any row doesn't have 7 day cells
    if (sourceCells.length !== 7 || targetCells.length !== 7) return null;
    
    // Create a mapping from source dates to target dates
    const dateMapping = {};
    
    // Match by day of week (cell index)
    for (let i = 0; i < 7; i++) {
        const sourceDate = sourceCells[i].getAttribute('data-date');
        const targetDate = targetCells[i].getAttribute('data-date');
        
        if (sourceDate && targetDate) {
            dateMapping[sourceDate] = targetDate;
        }
    }
    
    return dateMapping;
}

// Function to handle cross-month week date mapping
function getCrossMonthWeekDateMapping(targetWeekIndex) {
    // Find the target week row
    const targetRow = document.querySelector(`tr[data-week-index="${targetWeekIndex}"]`);
    if (!targetRow) {
        console.error("Target week row not found");
        return null;
    }
    
    // Get all date cells in the target week (excluding week copy cell)
    const targetCells = Array.from(targetRow.querySelectorAll('td:not(.week-copy-cell)'));
    
    // Skip if target week doesn't have 7 day cells
    if (targetCells.length !== 7) {
        console.error("Target week doesn't have 7 day cells");
        return null;
    }
    
    // Create a mapping from source dates to target dates
    const dateMapping = {};
    
    // Get the source shifts and their dates
    const sourceShifts = state.isDragWeekMove ? state.movingWeekShifts : state.copyingWeekShifts;
    if (!sourceShifts || sourceShifts.length === 0) {
        console.error("No source shifts found for mapping");
        return null;
    }
    
    // Get the dates from the target week cells
    const targetDatesWithDayOfWeek = targetCells.map(cell => {
        const dateStr = cell.getAttribute('data-date');
        if (!dateStr) return null;
        
        return {
            dateStr: dateStr,
            dayOfWeek: new Date(dateStr).getDay() // 0-6
        };
    }).filter(Boolean);
    
    // For each source shift, find which day of week it was on
    sourceShifts.forEach(shift => {
        const shiftDate = new Date(shift.date);
        const dayOfWeek = shiftDate.getDay(); // 0-6
        
        // Find the target date with matching day of week
        const targetInfo = targetDatesWithDayOfWeek.find(t => t.dayOfWeek === dayOfWeek);
        if (targetInfo) {
            dateMapping[shift.date] = targetInfo.dateStr;
        }
    });
    
    console.log("Created cross-month date mapping:", dateMapping);
    return dateMapping;
}