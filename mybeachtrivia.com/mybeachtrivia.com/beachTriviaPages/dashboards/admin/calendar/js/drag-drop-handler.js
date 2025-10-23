// drag-drop-handler.js
// Functions for handling drag and drop operations in the calendar

// Handle dragstart events
function handleDragStart(e) {
    // Add detailed debugging info
    console.log("Drag start event target:", e.target);
    console.log("Drag start event target classList:", e.target.classList);
    
    // Show month navigation dropzones when drag starts
    if (elements.prevMonthDropzone && elements.nextMonthDropzone) {
        // Make dropzones visible but not active yet
        elements.prevMonthDropzone.style.display = 'flex';
        elements.nextMonthDropzone.style.display = 'flex';
        elements.prevMonthDropzone.style.opacity = '0.3';
        elements.nextMonthDropzone.style.opacity = '0.3';
    }
    
    // Handle drag day button specially
    if (e.target.classList.contains('drag-day-button')) {
        const dateStr = e.target.getAttribute('data-date');
        if (!dateStr) return;
        
        // Reset states
        state.isDragCopy = false; // We're moving, not copying
        state.isDragDayMove = true; // New state flag for day move operations
        state.isDragWeekCopy = false;
        state.isDragWeekMove = false;
        
        // Get all shifts for this date that match current filters
        const dayShifts = getShiftsForDate(dateStr).filter(shift => 
            (state.filters.employee === 'all' || state.filters.employee === shift.employeeId) && 
            (state.filters.eventType === 'all' || state.filters.eventType === shift.type) &&
            (state.filters.location === 'all' || state.filters.location === shift.location)
        );
        
        if (dayShifts.length === 0) {
            console.log("No shifts to move on this date");
            return;
        }
        
        // Store the shifts we're moving
        state.movingDayShifts = dayShifts;
        state.sourceDateStr = dateStr; // Store original date
        
        // Create a composite ghost element showing all shifts being moved
        const ghostContainer = document.createElement('div');
        ghostContainer.style.position = 'absolute';
        ghostContainer.style.top = '-1000px';
        ghostContainer.style.opacity = '0.7';
        ghostContainer.style.border = '1px solid var(--border-color)';
        ghostContainer.style.pointerEvents = 'none';
        ghostContainer.style.background = 'var(--input-bg)';
        ghostContainer.style.padding = '5px';
        ghostContainer.style.maxWidth = '250px';
        ghostContainer.style.borderRadius = '4px';
        ghostContainer.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.3)';
        ghostContainer.style.transform = 'scale(0.95)';
        
        // Add each shift to the ghost container
        dayShifts.forEach((shift, index) => {
            // Create a simplified version of the shift for the ghost
            const ghostShift = document.createElement('div');
            ghostShift.classList.add('shift', shift.type);
            ghostShift.style.marginBottom = '5px';
            ghostShift.style.opacity = '1';
            ghostShift.style.padding = '8px';
            ghostShift.style.borderRadius = '4px';
            ghostShift.style.background = 'var(--input-bg)';
            ghostShift.style.boxShadow = 'var(--shadow)';
            ghostShift.classList.add('collapsed');
            
            ghostShift.innerHTML = `
                <div class="employee">${escapeHTML(employees[shift.employeeId] || 'Unknown Host')}</div>
                <div class="event-type">${escapeHTML(eventTypes[shift.type] || shift.type)}</div>
            `;
            
            ghostContainer.appendChild(ghostShift);
        });
        
        document.body.appendChild(ghostContainer);
        e.dataTransfer.setDragImage(ghostContainer, 20, 20);
        
        // Clean up after a delay
        setTimeout(() => {
            document.body.removeChild(ghostContainer);
        }, 100);
        
        // Set data transfer
        e.dataTransfer.setData('application/x-move-day', dateStr);
        e.dataTransfer.effectAllowed = 'move';
        
        // Announce for screen readers
        announceForScreenReader(`Started moving ${dayShifts.length} events. Drop on another date to move them.`);
        
        e.stopPropagation();
        return;
    }
    
    // Handle week move button specially - NEW CODE
    if (e.target.classList.contains('week-move-button')) {
        const weekIndex = parseInt(e.target.getAttribute('data-week-index'));
        if (isNaN(weekIndex)) return;
        
        console.log("Starting week move operation for week index:", weekIndex);
        
        // Reset states - make sure we're in week move mode
        state.isDragCopy = false;
        state.isDragWeekCopy = false;
        state.isDragWeekMove = true;
        state.isDragDayMove = false;
        state.sourceWeekIndex = weekIndex;
        state.movingWeekShifts = [];
        
        // Get all visible shifts for this week
        const weekShifts = getShiftsForWeek(weekIndex);
        
        if (weekShifts.length === 0) {
            console.log("No shifts to move in this week");
            return;
        }
        
        // Store the shifts we're moving
        state.movingWeekShifts = weekShifts;
        
        // Create a composite ghost element showing all shifts being moved
        const ghostContainer = document.createElement('div');
        ghostContainer.style.position = 'absolute';
        ghostContainer.style.top = '-1000px';
        ghostContainer.style.opacity = '0.7';
        ghostContainer.style.border = '1px solid var(--border-color)';
        ghostContainer.style.pointerEvents = 'none';
        ghostContainer.style.background = 'var(--input-bg)';
        ghostContainer.style.padding = '5px';
        ghostContainer.style.maxWidth = '250px';
        ghostContainer.style.borderRadius = '4px';
        ghostContainer.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.3)';
        ghostContainer.style.transform = 'scale(0.95)';
        
        // Add each shift to the ghost container (limit to 5 for visual clarity)
        weekShifts.slice(0, 5).forEach((shift) => {
            // Create a simplified version of the shift for the ghost
            const ghostShift = document.createElement('div');
            ghostShift.classList.add('shift', shift.type);
            ghostShift.style.marginBottom = '5px';
            ghostShift.style.opacity = '1';
            ghostShift.style.padding = '8px';
            ghostShift.style.borderRadius = '4px';
            ghostShift.style.background = 'var(--input-bg)';
            ghostShift.style.boxShadow = 'var(--shadow)';
            ghostShift.classList.add('collapsed');
            
            ghostShift.innerHTML = `
                <div class="employee">${escapeHTML(employees[shift.employeeId] || 'Unknown Host')}</div>
                <div class="event-type">${escapeHTML(eventTypes[shift.type] || shift.type)}</div>
            `;
            
            ghostContainer.appendChild(ghostShift);
        });
        
        // Add count if there are more shifts
        if (weekShifts.length > 5) {
            const countElement = document.createElement('div');
            countElement.style.textAlign = 'center';
            countElement.style.marginTop = '5px';
            countElement.style.color = 'var(--text-secondary)';
            countElement.textContent = `+ ${weekShifts.length - 5} more events`;
            ghostContainer.appendChild(countElement);
        }
        
        document.body.appendChild(ghostContainer);
        e.dataTransfer.setDragImage(ghostContainer, 20, 20);
        
        // Clean up after a delay
        setTimeout(() => {
            document.body.removeChild(ghostContainer);
        }, 100);
        
        // Set data transfer
        e.dataTransfer.setData('application/x-move-week', weekIndex.toString());
        e.dataTransfer.effectAllowed = 'move';
        
        // Announce for screen readers
        announceForScreenReader(`Started moving week with ${weekShifts.length} events. Drop on another week to move.`);
        
        e.stopPropagation();
        return;
    }
    
    // Handle week copy button specially
    if (e.target.classList.contains('week-copy-button')) {
        const weekIndex = parseInt(e.target.getAttribute('data-week-index'));
        if (isNaN(weekIndex)) return;
        
        console.log("Starting week copy operation for week index:", weekIndex);
        
        // Reset states
        state.isDragCopy = true;
        state.isDragWeekCopy = true;
        state.isDragWeekMove = false;
        state.sourceWeekIndex = weekIndex;
        state.copyingWeekShifts = [];
        
        // Get all visible shifts for this week
        const weekShifts = getShiftsForWeek(weekIndex);
        
        if (weekShifts.length === 0) {
            console.log("No shifts to copy in this week");
            return;
        }
        
        // Store the shifts we're copying
        state.copyingWeekShifts = weekShifts;
        
        // Create a composite ghost element showing all shifts being copied
        const ghostContainer = document.createElement('div');
        ghostContainer.style.position = 'absolute';
        ghostContainer.style.top = '-1000px';
        ghostContainer.style.opacity = '0.7';
        ghostContainer.style.border = '1px solid var(--border-color)';
        ghostContainer.style.pointerEvents = 'none';
        ghostContainer.style.background = 'var(--input-bg)';
        ghostContainer.style.padding = '5px';
        ghostContainer.style.maxWidth = '250px';
        ghostContainer.style.borderRadius = '4px';
        ghostContainer.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.3)';
        ghostContainer.style.transform = 'scale(0.95)';
        
        // Add each shift to the ghost container (limit to 5 for visual clarity)
        weekShifts.slice(0, 5).forEach((shift) => {
            // Create a simplified version of the shift for the ghost
            const ghostShift = document.createElement('div');
            ghostShift.classList.add('shift', shift.type);
            ghostShift.style.marginBottom = '5px';
            ghostShift.style.opacity = '1';
            ghostShift.style.padding = '8px';
            ghostShift.style.borderRadius = '4px';
            ghostShift.style.background = 'var(--input-bg)';
            ghostShift.style.boxShadow = 'var(--shadow)';
            ghostShift.classList.add('collapsed');
            
            ghostShift.innerHTML = `
                <div class="employee">${escapeHTML(employees[shift.employeeId] || 'Unknown Host')}</div>
                <div class="event-type">${escapeHTML(eventTypes[shift.type] || shift.type)}</div>
            `;
            
            ghostContainer.appendChild(ghostShift);
        });
        
        // Add count if there are more shifts
        if (weekShifts.length > 5) {
            const countElement = document.createElement('div');
            countElement.style.textAlign = 'center';
            countElement.style.marginTop = '5px';
            countElement.style.color = 'var(--text-secondary)';
            countElement.textContent = `+ ${weekShifts.length - 5} more events`;
            ghostContainer.appendChild(countElement);
        }
        
        document.body.appendChild(ghostContainer);
        e.dataTransfer.setDragImage(ghostContainer, 20, 20);
        
        // Clean up after a delay
        setTimeout(() => {
            document.body.removeChild(ghostContainer);
        }, 100);
        
        // Set data transfer
        e.dataTransfer.setData('application/x-copy-week', weekIndex.toString());
        e.dataTransfer.effectAllowed = 'copy';
        
        // Announce for screen readers
        announceForScreenReader(`Started copying week with ${weekShifts.length} events. Drop on another week to create copies.`);
        
        e.stopPropagation();
        return;
    }
    
    // Handle cell copy button specially
    if (e.target.classList.contains('cell-copy-button')) {
        const dateStr = e.target.getAttribute('data-date');
        if (!dateStr) return;
        
        // Reset states
        state.isDragCopy = true;
        state.isDragWeekCopy = false;
        state.isDragWeekMove = false;
        
        // Get all shifts for this date that match current filters
        const dayShifts = getShiftsForDate(dateStr).filter(shift => 
            (state.filters.employee === 'all' || state.filters.employee === shift.employeeId) && 
            (state.filters.eventType === 'all' || state.filters.eventType === shift.type) &&
            (state.filters.location === 'all' || state.filters.location === shift.location)
        );
        
        if (dayShifts.length === 0) {
            console.log("No shifts to copy on this date");
            return;
        }
        
        // Store the shifts we're copying
        state.copyingDayShifts = dayShifts;
        
        // Create a composite ghost element showing all shifts being copied
        const ghostContainer = document.createElement('div');
        ghostContainer.style.position = 'absolute';
        ghostContainer.style.top = '-1000px';
        ghostContainer.style.opacity = '0.7';
        ghostContainer.style.border = '1px solid var(--border-color)';
        ghostContainer.style.pointerEvents = 'none';
        ghostContainer.style.background = 'var(--input-bg)';
        ghostContainer.style.padding = '5px';
        ghostContainer.style.maxWidth = '250px';
        ghostContainer.style.borderRadius = '4px';
        ghostContainer.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.3)';
        ghostContainer.style.transform = 'scale(0.95)';
        
        // Add each shift to the ghost container
        dayShifts.forEach((shift, index) => {
            // Create a simplified version of the shift for the ghost
            const ghostShift = document.createElement('div');
            ghostShift.classList.add('shift', shift.type);
            ghostShift.style.marginBottom = '5px';
            ghostShift.style.opacity = '1';
            ghostShift.style.padding = '8px';
            ghostShift.style.borderRadius = '4px';
            ghostShift.style.background = 'var(--input-bg)';
            ghostShift.style.boxShadow = 'var(--shadow)';
            ghostShift.classList.add('collapsed');
            
            ghostShift.innerHTML = `
                <div class="employee">${escapeHTML(employees[shift.employeeId] || 'Unknown Host')}</div>
                <div class="event-type">${escapeHTML(eventTypes[shift.type] || shift.type)}</div>
            `;
            
            ghostContainer.appendChild(ghostShift);
        });
        
        document.body.appendChild(ghostContainer);
        e.dataTransfer.setDragImage(ghostContainer, 20, 20);
        
        // Clean up after a delay
        setTimeout(() => {
            document.body.removeChild(ghostContainer);
        }, 100);
        
        // Set data transfer
        e.dataTransfer.setData('application/x-copy-day', dateStr);
        e.dataTransfer.effectAllowed = 'copy';
        
        // Announce for screen readers
        announceForScreenReader(`Started copying ${dayShifts.length} events. Drop on another date to create copies.`);
        
        e.stopPropagation();
        return;
    }
    
    // First, identify where the drag started from
    const copyButton = e.target.closest('.copy-button');
    const shiftElement = e.target.closest('.shift');
    
    console.log("Drag started from copy button?", copyButton !== null);
    console.log("Drag started from shift?", shiftElement !== null);
    
    // Clear any previous drag state
    state.draggedShiftId = null;
    state.pendingShiftData = null;
    state.isDragCopy = false;
    state.copyingDayShifts = [];
    
    // Only proceed if we have a shift element
    if (!shiftElement) {
        console.log("No shift element found, aborting drag");
        return;
    }
    
    // Determine if this is a copy operation based on whether the drag started on a copy button
    const isCopyOperation = copyButton !== null;
    
    // Set the drag copy flag in state
    state.isDragCopy = isCopyOperation;
    console.log("Setting isDragCopy state to:", isCopyOperation);
    
    // Store the shift ID that's being dragged
    const shiftId = shiftElement.getAttribute('data-id');
    // MODIFIED: Don't parse as integer with parseInt
    if (!shiftId) {
        console.error('Invalid shift ID:', shiftElement.getAttribute('data-id'));
        return;
    }
    
    console.log(`Started dragging shift ID: ${shiftId}, Copy operation: ${isCopyOperation}`);
    
    // For copy operations, don't modify the original element and use a ghost
    if (isCopyOperation) {
        console.log("Creating ghost element for copy operation");
        // Create a clone for the drag ghost
        const ghostElement = shiftElement.cloneNode(true);
        document.body.appendChild(ghostElement);
        
        // Style the ghost
        ghostElement.style.position = 'absolute';
        ghostElement.style.top = '-1000px';
        ghostElement.style.opacity = '0.5';
        ghostElement.style.border = '1px dashed #3699ff';
        ghostElement.style.pointerEvents = 'none';
        
        // Set this clone as the drag image
        e.dataTransfer.setDragImage(ghostElement, 20, 20);
        
        // Clean up the ghost element after a short delay
        setTimeout(() => {
            document.body.removeChild(ghostElement);
        }, 100);
        
        // For copy operations, we don't add any visual classes to the original
        console.log("Copy operation - original element left untouched");
    } else {
        // For move operations, apply the dragging class to the original
        shiftElement.classList.add('dragging');
        console.log("Move operation - added dragging class to original");
    }
    
    // Set different data for copy vs. move to be explicit
    if (isCopyOperation) {
        e.dataTransfer.setData('application/x-copy-shift', shiftId);
        e.dataTransfer.effectAllowed = 'copy';
        console.log("Set dataTransfer for COPY operation");
    } else {
        e.dataTransfer.setData('application/x-move-shift', shiftId);
        e.dataTransfer.effectAllowed = 'move';
        console.log("Set dataTransfer for MOVE operation");
    }
    
    // Also set a common data format as fallback
    e.dataTransfer.setData('text/plain', shiftId);
    
    // Store the reference to the dragged shift
    state.draggedShiftId = shiftId;
    
    // Announce for screen readers
    if (isCopyOperation) {
        announceForScreenReader('Started copying event. Drop on another date to create a copy.');
    } else {
        announceForScreenReader('Started dragging event. Drop on another date to move it.');
    }
    
    e.stopPropagation();
}

// Fixed and optimized dragover handler
function handleDragOver(e) {
    // Prevent default to allow drop
    e.preventDefault();
    
    // Bail early if nothing is being dragged
    if (state.draggedShiftId === null && state.copyingDayShifts.length === 0 && 
        state.copyingWeekShifts.length === 0 && state.movingDayShifts.length === 0 &&
        state.movingWeekShifts.length === 0) return;
    
    // Check for month navigation dropzones first
    const calendarRect = document.querySelector('.calendar-container').getBoundingClientRect();
    const mouseX = e.clientX;
    // Use narrower thresholds to match the updated dropzone positioning
    const thresholdLeft = calendarRect.left + 40; // Reduced from 80 to 40
    const thresholdRight = calendarRect.right - 40; // Reduced from 80 to 40
    
    // Make sure dropzones are displayed during drag operations
    if (elements.prevMonthDropzone.style.display !== 'flex') {
        elements.prevMonthDropzone.style.display = 'flex';
        elements.prevMonthDropzone.style.opacity = '0.3'; 
    }
    if (elements.nextMonthDropzone.style.display !== 'flex') {
        elements.nextMonthDropzone.style.display = 'flex';
        elements.nextMonthDropzone.style.opacity = '0.3';
    }
    
    // Clear any previous hover states if we're not in dropzone range
    if (mouseX > thresholdLeft && mouseX < thresholdRight) {
        elements.prevMonthDropzone.classList.remove('active');
        elements.nextMonthDropzone.classList.remove('active');
        clearTimeout(state.monthNavigationTimer);
        state.isHoveringPrevMonth = false;
        state.isHoveringNextMonth = false;
    }
    // Hovering near left edge - show previous month dropzone
    else if (mouseX <= thresholdLeft) {
        elements.prevMonthDropzone.classList.add('active');
        elements.nextMonthDropzone.classList.remove('active');
        
        // Only set the navigation timer once when we start hovering
        if (!state.isHoveringPrevMonth) {
            state.isHoveringPrevMonth = true;
            state.isHoveringNextMonth = false;
            
            // Set a timer to change months if hovering continues
            clearTimeout(state.monthNavigationTimer);
            state.monthNavigationTimer = setTimeout(() => {
                handleCrossMonthDragNavigation('prev');
            }, 800); // Wait time before changing months
        }
        
        e.dataTransfer.dropEffect = state.isDragCopy ? 'copy' : 'move';
        
        // Skip cell highlighting when hovering on dropzones
        return;
    }
    // Hovering near right edge - show next month dropzone
    else if (mouseX >= thresholdRight) {
        elements.nextMonthDropzone.classList.add('active');
        elements.prevMonthDropzone.classList.remove('active');
        
        // Only set the navigation timer once when we start hovering
        if (!state.isHoveringNextMonth) {
            state.isHoveringNextMonth = true;
            state.isHoveringPrevMonth = false;
            
            // Set a timer to change months if hovering continues
            clearTimeout(state.monthNavigationTimer);
            state.monthNavigationTimer = setTimeout(() => {
                handleCrossMonthDragNavigation('next');
            }, 800); // Wait time before changing months
        }
        
        e.dataTransfer.dropEffect = state.isDragCopy ? 'copy' : 'move';
        
        // Skip cell highlighting when hovering on dropzones
        return;
    }
    
    // If we're dragging a week copy or week move, highlight the row instead of the cell
    if (state.isDragWeekCopy || state.isDragWeekMove) {
        // Find the row the cursor is over
        const cell = findCellFromEvent(e);
        if (!cell) return;
        
        const row = cell.closest('tr');
        if (!row) return;
        
        const weekIndex = parseInt(row.getAttribute('data-week-index'));
        if (isNaN(weekIndex)) return;
        
        // Don't drop on the same week we're copying/moving from (unless it's a cross-month operation)
        if (weekIndex === state.sourceWeekIndex && !state.pendingCrossMonthDrag) return;
        
        // If we found a valid row and it's different from the currently hovered one
        if (row !== state.currentHoveredRow) {
            // Clear highlight from previous row
            if (state.currentHoveredRow) {
                state.currentHoveredRow.classList.remove('drag-over-row');
            }
            
            row.classList.add('drag-over-row');
            
            // Update current hovered row
            state.currentHoveredRow = row;
        }
        
        // Set dropEffect based on operation type
        e.dataTransfer.dropEffect = state.isDragWeekCopy ? 'copy' : 'move';
        return;
    }
    
    // Standard cell highlighting for shift or day copies/moves
    // Find the cell the cursor is over
    const cell = findCellFromEvent(e);
    
    // Don't highlight other-month cells
    if (!cell || cell.classList.contains('other-month')) {
        if (state.currentHoveredCell) {
            state.currentHoveredCell.classList.remove('drag-over');
            state.currentHoveredCell = null;
        }
        return;
    }
    
    // If we found a valid cell and it's different from the currently hovered one
    if (cell !== state.currentHoveredCell) {
        // Clear highlight from previous cell
        if (state.currentHoveredCell) {
            state.currentHoveredCell.classList.remove('drag-over');
        }
        
        cell.classList.add('drag-over');
        // Don't remove the today-cell class if it exists
        
        // Update current hovered cell
        state.currentHoveredCell = cell;
    }
    
    // Set dropEffect to indicate this is a move or copy operation
    if (state.isDragDayMove) {
        e.dataTransfer.dropEffect = 'move';
    } else {
        e.dataTransfer.dropEffect = state.isDragCopy ? 'copy' : 'move';
    }
}

// Handle dragend event
function handleDragEnd(e) {
    // Only handle drag for shift elements
    const shiftElement = e.target.closest('.shift');
    if (shiftElement) {
        // Remove the dragging class when drag ends (only needed for move operations)
        // For copy operations, we didn't add the class to begin with
        if (!state.isDragCopy) {
            shiftElement.classList.remove('dragging');
        }
    }
    
    // Clear the reference to the dragged shift
    state.draggedShiftId = null;
    state.isDragCopy = false;
    state.isDragWeekCopy = false;
    state.isDragWeekMove = false;
    state.isDragDayMove = false;
    state.copyingDayShifts = [];
    state.copyingWeekShifts = [];
    state.movingDayShifts = [];
    state.movingWeekShifts = [];
    state.sourceWeekIndex = null;
    state.sourceDateStr = null;
    
    // Clear cross-month drag state
    state.pendingCrossMonthDrag = null;
    clearTimeout(state.monthNavigationTimer);
    state.isHoveringPrevMonth = false;
    state.isHoveringNextMonth = false;
    
    // Hide month navigation dropzones
    hideMonthNavigationDropzones();
    
    // Remove drag-over highlight from all cells (but preserve today highlight)
    document.querySelectorAll('.calendar td').forEach(cell => {
        cell.classList.remove('drag-over');
    });
    
    // Remove drag-over highlight from week rows
    document.querySelectorAll('.calendar tr').forEach(row => {
        row.classList.remove('drag-over-row');
    });
    
    // Reset current hovered elements
    state.currentHoveredCell = null;
    state.currentHoveredRow = null;
    
    // Announce for screen readers
    announceForScreenReader('Stopped dragging event.');
    
    e.stopPropagation();
}

// Helper function to find the td element from event coordinates
function findCellFromEvent(e) {
    let element = document.elementFromPoint(e.clientX, e.clientY);
    
    // Traverse up to find the td element
    while (element && element.tagName !== 'TD') {
        element = element.parentElement;
        
        // Exit if we reach the body or run out of parents
        if (!element || element === document.body) {
            return null;
        }
    }
    
    return element;
}

// Handle drop event
function handleDrop(e) {
    // Prevent default action
    e.preventDefault();
    
    // Hide month navigation dropzones immediately on drop
    hideMonthNavigationDropzones();
    
    // Handle week move drop - NEW CODE
    const sourceWeekMoveIndex = e.dataTransfer.getData('application/x-move-week');
    if (sourceWeekMoveIndex && state.isDragWeekMove && state.movingWeekShifts.length > 0) {
        // Find the row that was dropped on
        const cell = findCellFromEvent(e);
        if (!cell) return;
        
        const targetRow = cell.closest('tr');
        if (!targetRow) return;
        
        // Remove row highlighting
        if (state.currentHoveredRow) {
            state.currentHoveredRow.classList.remove('drag-over-row');
        }
        
        const targetWeekIndex = parseInt(targetRow.getAttribute('data-week-index'));
        if (isNaN(targetWeekIndex)) return;
        
        console.log(`Dropping week move from week ${sourceWeekMoveIndex} to week ${targetWeekIndex}`);
        
        // Check if there was a cross-month drag
        const isCrossMonthOperation = state.pendingCrossMonthDrag !== null;
        
        // Don't move to the same week in the same month
        if (parseInt(sourceWeekMoveIndex) === targetWeekIndex && !isCrossMonthOperation) {
            console.log("Cannot move to the same week in the same month");
            return;
        }
        
        let dateMapping;
        
        if (isCrossMonthOperation && state.pendingCrossMonthDrag.sourceDates) {
            // We're moving across months - create special mapping
            console.log("Creating cross-month date mapping for week move");
            dateMapping = getCrossMonthWeekDateMapping(targetWeekIndex);
        } else {
            // Regular same-month mapping
            dateMapping = getWeekDateMapping(parseInt(sourceWeekMoveIndex), targetWeekIndex);
        }
        
        if (!dateMapping) {
            console.error("Could not create date mapping for week move");
            return;
        }
        
        console.log("Date mapping for week move:", dateMapping);
        
        // Step 1: Store IDs of all original shifts for later deletion
        const originalShiftIds = state.movingWeekShifts.map(shift => shift.id);
        
        // Step 2: Create new shifts at the target week
        const newShifts = [];
        const savePromises = [];
        
        state.movingWeekShifts.forEach(shift => {
            // Find the target date for this shift
            const targetDate = dateMapping[shift.date];
            if (!targetDate) {
                console.log(`No mapping found for date ${shift.date}`);
                return; // Skip if no mapping found
            }
            
            // Create new shift data without ID
            const newShiftData = {
                date: targetDate,
                employeeId: shift.employeeId,
                startTime: shift.startTime,
                endTime: shift.endTime,
                type: shift.type,
                theme: shift.theme,
                location: shift.location,
                notes: shift.notes
            };
            
            // Save to Firebase and collect promises
            savePromises.push(
                saveShiftToFirebase(newShiftData)
                    .then(newId => {
                        // Create the complete shift with the ID
                        const newShift = {
                            ...newShiftData,
                            id: newId
                        };
                        
                        // Preserve collapsed state
                        if (state.collapsedShifts.has(shift.id)) {
                            state.collapsedShifts.add(newShift.id);
                        }
                        
                        newShifts.push(newShift);
                        return newShift;
                    })
            );
        });
        
        // Wait for all creations to complete before deleting the original shifts
        Promise.all(savePromises)
            .then(() => {
                // Step 3: Now that all new shifts are created, delete the original shifts
                const deletePromises = originalShiftIds.map(shiftId => 
                    deleteShiftFromFirebase(shiftId)
                );
                
                return Promise.all(deletePromises);
            })
            .then(() => {
                // Step 4: Update local state
                // Remove original shifts
                shifts = shifts.filter(shift => !originalShiftIds.includes(shift.id));
                
                // Add the new shifts
                shifts = [...shifts, ...newShifts];
                
                // Clear state
                state.movingWeekShifts = [];
                state.isDragWeekMove = false;
                state.sourceWeekIndex = null;
                state.pendingCrossMonthDrag = null;
                
                // Announce for screen readers
                announceForScreenReader(`Moved ${newShifts.length} events to week ${targetWeekIndex + 1}`);
                
                // Re-render the calendar
                renderCalendar();
            })
            .catch(error => {
                console.error('Error moving shifts:', error);
                alert('Could not move some shifts. Please try again later.');
            });
            
        return;
    }
    
    // Handle week copy drop
    const sourceWeekIndex = e.dataTransfer.getData('application/x-copy-week');
    if (sourceWeekIndex && state.isDragWeekCopy && state.copyingWeekShifts.length > 0) {
        // Find the row that was dropped on
        const cell = findCellFromEvent(e);
        if (!cell) return;
        
        const targetRow = cell.closest('tr');
        if (!targetRow) return;
        
        // Remove row highlighting
        if (state.currentHoveredRow) {
            state.currentHoveredRow.classList.remove('drag-over-row');
        }
        
        const targetWeekIndex = parseInt(targetRow.getAttribute('data-week-index'));
        if (isNaN(targetWeekIndex)) return;
        
        console.log(`Dropping week copy from week ${sourceWeekIndex} to week ${targetWeekIndex}`);
        
        // Check if there was a cross-month drag
        const isCrossMonthOperation = state.pendingCrossMonthDrag !== null;
        
        // Don't copy to the same week in the same month
        if (parseInt(sourceWeekIndex) === targetWeekIndex && !isCrossMonthOperation) {
            console.log("Cannot copy to the same week in the same month");
            return;
        }
        
        let dateMapping;
        
        if (isCrossMonthOperation && state.pendingCrossMonthDrag.sourceDates) {
            // We're copying across months - create special mapping
            console.log("Creating cross-month date mapping for week copy");
            dateMapping = getCrossMonthWeekDateMapping(targetWeekIndex);
        } else {
            // Regular same-month mapping
            dateMapping = getWeekDateMapping(parseInt(sourceWeekIndex), targetWeekIndex);
        }
        
        if (!dateMapping) {
            console.error("Could not create date mapping for week copy");
            return;
        }
        
        console.log("Date mapping for week copy:", dateMapping);
        
        // Create new shifts for each source shift, with mapped dates
        const newShifts = [];
        const savePromises = [];
        
        state.copyingWeekShifts.forEach(shift => {
            // Find the target date for this shift
            const targetDate = dateMapping[shift.date];
            if (!targetDate) {
                console.log(`No mapping found for date ${shift.date}`);
                return; // Skip if no mapping found
            }
            
            // Create new shift data without ID
            const newShiftData = {
                date: targetDate,
                employeeId: shift.employeeId,
                startTime: shift.startTime,
                endTime: shift.endTime,
                type: shift.type,
                theme: shift.theme,
                location: shift.location,
                notes: shift.notes
            };
            
            // Save to Firebase and collect promises
            savePromises.push(
                saveShiftToFirebase(newShiftData)
                    .then(newId => {
                        // Create the complete shift with the ID
                        const newShift = {
                            ...newShiftData,
                            id: newId
                        };
                        
                        // Preserve collapsed state
                        if (state.collapsedShifts.has(shift.id)) {
                            state.collapsedShifts.add(newShift.id);
                        }
                        
                        newShifts.push(newShift);
                        return newShift;
                    })
            );
        });
        
        // Wait for all operations to complete
        Promise.all(savePromises)
            .then(() => {
                // Add all new shifts to our local array
                shifts = [...shifts, ...newShifts];
                
                // Clear state
                state.copyingWeekShifts = [];
                state.isDragWeekCopy = false;
                state.sourceWeekIndex = null;
                state.pendingCrossMonthDrag = null;
                
                // Announce for screen readers
                announceForScreenReader(`Copied ${newShifts.length} events to week ${targetWeekIndex + 1}`);
                
                // Re-render the calendar
                renderCalendar();
            })
            .catch(error => {
                console.error('Error saving shifts to Firebase:', error);
                alert('Could not save some shifts. Please try again later.');
            });
            
        return;
    }
    
    // Find the target cell for regular shift/day copies
    const cell = findCellFromEvent(e);
    
    // Don't allow dropping on other-month cells or if no cell found
    if (!cell || cell.classList.contains('other-month')) {
        return;
    }
    
    // Remove drag-over highlighting only (preserve today highlighting)
    if (state.currentHoveredCell) {
        state.currentHoveredCell.classList.remove('drag-over');
    }
    
    // Get the target date
    const targetDate = cell.getAttribute('data-date');
    
    // Handle day move operation
    const sourceMoveDate = e.dataTransfer.getData('application/x-move-day');
    if (sourceMoveDate && state.isDragDayMove && state.movingDayShifts && state.movingDayShifts.length > 0) {
        // Don't move to the same date
        if (sourceMoveDate === targetDate) return;
        
        // Check for conflicts for each shift
        let hasConflicts = false;
        let conflictEmployeeId = null;
        
        // Group potential conflicts by employee
        const potentialConflicts = {};
        
        state.movingDayShifts.forEach(shift => {
            const conflictCheck = {
                date: targetDate,
                employeeId: shift.employeeId
            };
            
            const shiftConflicts = checkForDoubleBooking(conflictCheck);
            if (shiftConflicts.length > 0) {
                hasConflicts = true;
                conflictEmployeeId = shift.employeeId;
                potentialConflicts[shift.employeeId] = true;
            }
        });
        
        if (hasConflicts) {
            // Store move info in global variable
            globalMoveOperation = {
                sourceDateStr: sourceMoveDate,
                targetDate: targetDate,
                shifts: state.movingDayShifts,
                active: true,
                isCopy: false
            };
            
            // Show warning
            showSimplifiedWarning(conflictEmployeeId);
            return;
        }
        
        // No conflicts, proceed with moving all shifts
        const newShifts = [];
        const savePromises = [];
        
        // Step 1: Store IDs of all original shifts for later deletion
        const originalShiftIds = state.movingDayShifts.map(shift => shift.id);
        
        // Step 2: Create new shifts at the target date
        state.movingDayShifts.forEach(shift => {
            // Create new shift data with the target date
            const newShiftData = {
                date: targetDate,
                employeeId: shift.employeeId,
                startTime: shift.startTime,
                endTime: shift.endTime,
                type: shift.type,
                theme: shift.theme,
                location: shift.location,
                notes: shift.notes
            };
            
            // Save new shift to Firebase and collect promises
            savePromises.push(
                saveShiftToFirebase(newShiftData)
                    .then(newId => {
                        // Create the complete shift with the ID
                        const newShift = {
                            ...newShiftData,
                            id: newId
                        };
                        
                        // Preserve collapsed state
                        if (state.collapsedShifts.has(shift.id)) {
                            state.collapsedShifts.add(newShift.id);
                        }
                        
                        newShifts.push(newShift);
                        return newShift;
                    })
            );
        });
        
        // Wait for all creations to complete first
        Promise.all(savePromises)
            .then(() => {
                // Step 3: Now that all new shifts are created, delete the original shifts
                const deletePromises = originalShiftIds.map(shiftId => 
                    deleteShiftFromFirebase(shiftId)
                );
                
                return Promise.all(deletePromises);
            })
            .then(() => {
                // Step 4: Update local state - remove original shifts
                shifts = shifts.filter(shift => !originalShiftIds.includes(shift.id));
                
                // Step 5: Add the new shifts
                shifts = [...shifts, ...newShifts];
                
                // Clear state
                state.movingDayShifts = [];
                state.isDragDayMove = false;
                state.sourceDateStr = null;
                
                // Announce for screen readers
                announceForScreenReader(`Moved ${newShifts.length} events to ${getReadableDateString(new Date(targetDate))}`);
                
                // Re-render the calendar
                renderCalendar();
            })
            .catch(error => {
                console.error('Error moving shifts:', error);
                alert('Could not move some shifts. Please try again later.');
            });
        
        return;
    }
    
    // Check if this is a day copy operation
    const sourceDateStr = e.dataTransfer.getData('application/x-copy-day');
    if (sourceDateStr && state.copyingDayShifts.length > 0) {
        // Don't copy to the same date
        if (sourceDateStr === targetDate) return;
        
        // Check for conflicts for each shift
        let hasConflicts = false;
        let conflictEmployeeId = null;
        
        // Group potential conflicts by employee
        const potentialConflicts = {};
        
        state.copyingDayShifts.forEach(shift => {
            const conflictCheck = {
                date: targetDate,
                employeeId: shift.employeeId
            };
            
            const shiftConflicts = checkForDoubleBooking(conflictCheck);
            if (shiftConflicts.length > 0) {
                hasConflicts = true;
                conflictEmployeeId = shift.employeeId;
                potentialConflicts[shift.employeeId] = true;
            }
        });
        
        if (hasConflicts) {
            // Store copy info in global variable
            globalMoveOperation = {
                sourceDateStr: sourceDateStr,
                targetDate: targetDate,
                shifts: state.copyingDayShifts,
                active: true,
                isCopy: true
            };
            
            // Show warning
            showSimplifiedWarning(conflictEmployeeId);
            return;
        }
        
        // No conflicts, proceed with copying all shifts
        const newShifts = [];
        const savePromises = [];
        
        state.copyingDayShifts.forEach(shift => {
            // Create new shift data without ID
            const newShiftData = {
                date: targetDate,
                employeeId: shift.employeeId,
                startTime: shift.startTime,
                endTime: shift.endTime,
                type: shift.type,
                theme: shift.theme,
                location: shift.location,
                notes: shift.notes
            };
            
            // Save to Firebase and collect promises
            savePromises.push(
                saveShiftToFirebase(newShiftData)
                    .then(newId => {
                        // Create the complete shift with the ID
                        const newShift = {
                            ...newShiftData,
                            id: newId
                        };
                        
                        // Preserve collapsed state
                        if (state.collapsedShifts.has(shift.id)) {
                            state.collapsedShifts.add(newShift.id);
                        }
                        
                        newShifts.push(newShift);
                        return newShift;
                    })
            );
        });
        
        // Wait for all operations to complete
        Promise.all(savePromises)
            .then(() => {
                // Add all new shifts to our local array
                shifts = [...shifts, ...newShifts];
                
                // Clear state
                state.copyingDayShifts = [];
                
                // Announce for screen readers
                announceForScreenReader(`Copied ${newShifts.length} events to ${getReadableDateString(new Date(targetDate))}`);
                
                // Re-render the calendar
                renderCalendar();
            })
            .catch(error => {
                console.error('Error saving shifts to Firebase:', error);
                alert('Could not save some shifts. Please try again later.');
            });
        
        return;
    }
    
    // Handle standard shift copy/move operations
    
    // Determine if this is a copy operation
    const isCopyOperation = state.isDragCopy || e.dataTransfer.getData('application/x-copy-shift') !== '';
    
    // Get the shift ID that was dragged
    let shiftId;
    if (isCopyOperation) {
        shiftId = e.dataTransfer.getData('application/x-copy-shift') || e.dataTransfer.getData('text/plain');
    } else {
        shiftId = e.dataTransfer.getData('application/x-move-shift') || e.dataTransfer.getData('text/plain');
    }
    
    // Make sure we have a valid ID (could be string or number)
    if (!shiftId) return;
    
    // Get the shift being moved/copied - MODIFIED to handle string IDs correctly
    const shiftIndex = shifts.findIndex(shift => shift.id == shiftId); // Using == instead of === for type coercion
    if (shiftIndex === -1) return;
    
    // If the date didn't change and it's not a copy operation, do nothing
    if (shifts[shiftIndex].date === targetDate && !isCopyOperation) {
        return;
    }
    
    // Check for conflicts at the target date
    const draggedShift = shifts[shiftIndex];
    const conflictCheck = {
        date: targetDate,
        employeeId: draggedShift.employeeId
    };
    
    const conflicts = checkForDoubleBooking(conflictCheck, isCopyOperation ? null : shiftId);
    
    if (conflicts.length > 0) {
        console.log(`Conflict detected for shift ${shiftId} to date ${targetDate}`);
        
        // Store move details in global variable very explicitly 
        globalMoveOperation = {
            shiftId: shiftId,
            targetDate: targetDate,
            active: true,
            isCopy: isCopyOperation
        };
        
        console.log("Setting global move operation:", globalMoveOperation);
        
        // Only show warning - we'll handle the move in the button's onclick handler
        showSimplifiedWarning(draggedShift.employeeId);
        return;
    }
    
    if (isCopyOperation) {
        // Copy operation - create a new shift without ID
        const newShiftData = {
            date: targetDate,
            employeeId: draggedShift.employeeId,
            startTime: draggedShift.startTime,
            endTime: draggedShift.endTime,
            type: draggedShift.type,
            theme: draggedShift.theme,
            location: draggedShift.location,
            notes: draggedShift.notes
        };
        
        // Save to Firebase
        saveShiftToFirebase(newShiftData)
            .then(newId => {
                // Create the complete shift with the ID
                const newShift = {
                    ...newShiftData,
                    id: newId
                };
                
                // Apply the same collapsed state if original was collapsed
                if (state.collapsedShifts.has(draggedShift.id)) {
                    state.collapsedShifts.add(newShift.id);
                }
                
                // Add the new shift to the local array
                shifts = [...shifts, newShift];
                
                // Announce the change for screen readers
                announceForScreenReader(`Event copied to ${getReadableDateString(new Date(targetDate))}`);
                
                // Re-render the calendar
                renderCalendar();
            })
            .catch(error => {
                console.error('Error copying shift to Firebase:', error);
                alert('Could not copy event. Please try again later.');
            });
    } else {
        // Move operation - update existing shift
        // Create an updated version of the shift
        const updatedShift = { 
            ...draggedShift,
            date: targetDate 
        };
        
        // Update in Firebase - MODIFIED to handle string IDs
        // Don't convert to string explicitly as it might already be a string
        updateShiftInFirebase(shiftId, updatedShift)
            .then(() => {
                // Create a completely new array without the original shift
                const newShifts = shifts.filter(s => s.id != shiftId); // Using != instead of !== for type coercion
                
                // Add the updated shift to the new array
                newShifts.push(updatedShift);
                
                // Replace the entire shifts array with the new array
                shifts = newShifts;
                
                // Announce the change for screen readers
                announceForScreenReader(`Event moved to ${getReadableDateString(new Date(targetDate))}`);
                
                // Re-render the calendar
                renderCalendar();
            })
            .catch(error => {
                console.error('Error moving shift in Firebase:', error);
                alert('Could not move event. Please try again later.');
            });
    }
}

// Handle cross-month drag navigation
function handleCrossMonthDragNavigation(direction) {
    console.log(`Navigating to ${direction} month during drag operation`);
    
    // Save the current drag operation state
    const pendingDrag = {
        draggedShiftId: state.draggedShiftId,
        isDragCopy: state.isDragCopy,
        isDragDayMove: state.isDragDayMove,
        isDragWeekCopy: state.isDragWeekCopy,
        isDragWeekMove: state.isDragWeekMove, // NEW: Save week move state
        copyingDayShifts: [...state.copyingDayShifts],
        copyingWeekShifts: [...state.copyingWeekShifts],
        movingDayShifts: [...(state.movingDayShifts || [])],
        movingWeekShifts: [...(state.movingWeekShifts || [])], // NEW: Save moving week shifts
        sourceWeekIndex: state.sourceWeekIndex,
        sourceDateStr: state.sourceDateStr,
        // Store the current month/year so we can navigate back if needed
        sourceMonth: state.currentMonth,
        sourceYear: state.currentYear
    };
    
    // Store in state for after the month changes
    state.pendingCrossMonthDrag = pendingDrag;
    
    // For week copies or moves, we need to preserve the source dates for mapping
    if ((state.isDragWeekCopy || state.isDragWeekMove) && 
        (state.copyingWeekShifts.length > 0 || state.movingWeekShifts.length > 0)) {
        // Determine which array of shifts to use based on the operation
        const sourceShifts = state.isDragWeekCopy ? state.copyingWeekShifts : state.movingWeekShifts;
        // Store all shift dates from source week for proper mapping later
        const sourceDates = sourceShifts.map(shift => shift.date);
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
        state.isDragDayMove = pendingDrag.isDragDayMove;
        state.isDragWeekCopy = pendingDrag.isDragWeekCopy;
        state.isDragWeekMove = pendingDrag.isDragWeekMove; // NEW: Restore week move state
        state.copyingDayShifts = pendingDrag.copyingDayShifts;
        state.copyingWeekShifts = pendingDrag.copyingWeekShifts;
        state.movingDayShifts = pendingDrag.movingDayShifts;
        state.movingWeekShifts = pendingDrag.movingWeekShifts; // NEW: Restore moving week shifts
        state.sourceWeekIndex = pendingDrag.sourceWeekIndex;
        state.sourceDateStr = pendingDrag.sourceDateStr;
        
        // Reset hover states
        state.isHoveringPrevMonth = false;
        state.isHoveringNextMonth = false;
    }, 50);
}