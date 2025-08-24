// Import all modules when using module system
// import { initCalendar } from './calendar-core.js';
// import { setupAccessibilitySupport } from './calendar-ui.js';
// import { attachEventListeners } from './event-manager.js';
// import { formatDate, isDateToday } from './utilities.js';

// Global variables to track shift being moved
let globalMoveOperation = {
    shiftId: null,
    targetDate: null,
    active: false,
    isCopy: false,
    shifts: null,        // Array of shifts for day copying
    sourceDateStr: null  // Source date for day copying
};

// Cache DOM elements for better performance
const elements = {
    calendarBody: document.getElementById('calendar-body'),
    currentMonthDisplay: document.getElementById('current-month'),
    prevMonthBtn: document.getElementById('prev-month'),
    nextMonthBtn: document.getElementById('next-month'),
    employeeSelect: document.getElementById('employee-select'),
    eventSelect: document.getElementById('event-select'),
    locationSelect: document.getElementById('location-select'),
    expandAllBtn: document.getElementById('expand-all-btn'),
    collapseAllBtn: document.getElementById('collapse-all-btn'),
    shiftModal: document.getElementById('shift-modal'),
    shiftForm: document.getElementById('shift-form'),
    shiftDateInput: document.getElementById('shift-date'),
    startTimeSelect: document.getElementById('start-time'),
    endTimeSelect: document.getElementById('end-time'),
    shiftTypeSelect: document.getElementById('shift-type'),
    themeField: document.getElementById('theme-field'),
    shiftThemeInput: document.getElementById('shift-theme'),
    shiftEmployeeSelect: document.getElementById('shift-employee'),
    shiftLocationSelect: document.getElementById('shift-location'),
    shiftNotesInput: document.getElementById('shift-notes'),
    cancelShiftBtn: document.getElementById('cancel-shift'),
    modalTitle: document.querySelector('.modal-content h2'),
    submitButton: document.querySelector('.button-group button[type="submit"]'),
    warningModal: document.getElementById('warning-modal'),
    warningText: document.getElementById('warning-text'),
    conflictDetails: document.getElementById('conflict-details'),
    cancelBookingBtn: document.getElementById('cancel-booking'),
    proceedBookingBtn: document.getElementById('proceed-booking'),
    // New host modal elements
    addNewHostBtn: document.getElementById('add-new-host-btn'),
    newHostModal: document.getElementById('new-host-modal'),
    newHostForm: document.getElementById('new-host-form'),
    newHostNameInput: document.getElementById('new-host-name'),
    cancelNewHostBtn: document.getElementById('cancel-new-host'),
    saveNewHostBtn: document.getElementById('save-new-host'),
    
    // New location modal elements
    addNewLocationBtn: document.getElementById('add-new-location-btn'),
    newLocationModal: document.getElementById('new-location-modal'),
    newLocationForm: document.getElementById('new-location-form'),
    newLocationNameInput: document.getElementById('new-location-name'),
    cancelNewLocationBtn: document.getElementById('cancel-new-location'),
    saveNewLocationBtn: document.getElementById('save-new-location'),
    
    // Added new location form elements
    newLocationAddressInput: document.getElementById('new-location-address'),
    newLocationContactInput: document.getElementById('new-location-contact'),
    newLocationPhoneInput: document.getElementById('new-location-phone'),
    newLocationEmailInput: document.getElementById('new-location-email'),
    newLocationActiveInput: document.getElementById('new-location-active'),
    
    // Month navigation dropzones for drag operations
    prevMonthDropzone: document.getElementById('prev-month-dropzone'),
    nextMonthDropzone: document.getElementById('next-month-dropzone')
    
    // Copy shift modal elements are initialized in setupCopyShiftModal()
};

// Create a cache for frequently accessed data
const cache = {
    // Store formatted dates to avoid repeated calculations
    dateStrings: {},
    // Store computed time values
    timeMinutes: {}
};

// State management - use a single source of truth for all state
const state = {
    // Calendar view state
    currentDate: new Date(),
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    initialLoad: true, // Flag to track initial page load
    
    // Filters
    filters: {
        employee: 'all',
        eventType: 'all',
        location: 'all'
    },
    
    // Drag and drop state
    draggedShiftId: null,
    currentHoveredCell: null,
    currentHoveredRow: null,
    isDragCopy: false, // Flag to indicate if drag is a copy operation
    copyingDayShifts: [], // Array of shifts being copied from a day
    copyingWeekShifts: [], // Array of shifts being copied from a week
    isDragWeekCopy: false, // Flag to indicate if drag is a week copy operation
    sourceWeekIndex: null, // The index of the week being copied
    
    // Day move feature - NEW
    isDragDayMove: false, // Flag indicating if we're moving all events from a day
    movingDayShifts: [], // Array of shifts being moved from a day
    sourceDateStr: null, // The source date for day move operations
    
    // Cross-month drag state
    pendingCrossMonthDrag: null, // Stores information about drag operations between months
    monthNavigationTimer: null, // Timer for delayed month change when hovering on dropzones
    isHoveringPrevMonth: false, // Flag for hovering on previous month dropzone
    isHoveringNextMonth: false, // Flag for hovering on next month dropzone
    
    // Edit state
    editingShiftId: null,
    isEditing: false,
    
    // Booking state
    forceBooking: false,
    pendingShiftData: null,
    
    // Store collapsed state of shifts
    collapsedShifts: new Set(),
    
    // Data loading state
    dataLoaded: false,
    isLoadingData: false
};

// MODIFIED: Removed hardcoded employees - empty object that will be populated from Firebase
const employees = {};

// MODIFIED: New extended employee data structure for storing additional fields - now empty
window.employeesData = {};

// MODIFIED: Changed from hardcoded object to empty object to be populated from Firebase
window.locationsData = {};

// Helper function to retrieve employee data safely
function getEmployeeData(employeeId) {
    // First try to get from the rich data structure
    if (window.employeesData && window.employeesData[employeeId]) {
        return window.employeesData[employeeId];
    }
    
    // Fall back to the legacy structure
    if (employees[employeeId]) {
        return {
            id: employeeId,
            displayName: employees[employeeId],
            firstName: '',
            lastName: employees[employeeId],
            isActive: true
        };
    }
    
    return {
        id: employeeId,
        displayName: 'Unknown Host',
        firstName: '',
        lastName: 'Unknown',
        isActive: false
    };
}

// Helper function to retrieve location data safely
function getLocationData(locationName) {
    // Try to get from the rich data structure
    if (window.locationsData && window.locationsData[locationName]) {
        return window.locationsData[locationName];
    }
    
    // Fall back to just the name
    return {
        name: locationName,
        address: '',
        contact: '',
        phone: '',
        email: '',
        isActive: true
    };
}

const eventTypes = {
    'classic-trivia': 'Classic Trivia',
    'themed-trivia': 'Themed Trivia',
    'classic-bingo': 'Classic Bingo',
    'music-bingo': 'Music Bingo',
    'beach-feud': 'Beach Feud'
};

// MODIFIED: Replaced sample shifts with empty array
let shifts = [];

// NEW FUNCTION: Add employee to both dropdown menus
function addEmployeeToDropdowns(employeeId, displayName) {
    // Only add if the employee doesn't already exist in the dropdowns
    if (!document.querySelector(`#employee-select option[value="${employeeId}"]`)) {
        // Add to filter dropdown
        const newOptionForFilter = document.createElement('option');
        newOptionForFilter.value = employeeId;
        newOptionForFilter.textContent = displayName;
        elements.employeeSelect.appendChild(newOptionForFilter);
    }
    
    if (!document.querySelector(`#shift-employee option[value="${employeeId}"]`)) {
        // Add to shift modal dropdown
        const newOptionForShift = document.createElement('option');
        newOptionForShift.value = employeeId;
        newOptionForShift.textContent = displayName;
        elements.shiftEmployeeSelect.appendChild(newOptionForShift);
    }
}

// NEW FUNCTION: Add location to both dropdown menus
function addLocationToDropdowns(locationName) {
    // Only add if the location doesn't already exist in the dropdowns
    if (!document.querySelector(`#location-select option[value="${locationName}"]`)) {
        // Add to filter dropdown
        const newOptionForFilter = document.createElement('option');
        newOptionForFilter.value = locationName;
        newOptionForFilter.textContent = locationName;
        elements.locationSelect.appendChild(newOptionForFilter);
    }
    
    if (!document.querySelector(`#shift-location option[value="${locationName}"]`)) {
        // Add to shift modal dropdown
        const newOptionForShift = document.createElement('option');
        newOptionForShift.value = locationName;
        newOptionForShift.textContent = locationName;
        elements.shiftLocationSelect.appendChild(newOptionForShift);
    }
}

// MODIFIED: Fetch all employees from Firebase - no longer adds hardcoded employees
function fetchEmployeesFromFirebase() {
    console.log('Fetching employees from Firebase...');
    state.isLoadingData = true;
    
    return firebase.firestore().collection('employees').get()
        .then((querySnapshot) => {
            console.log(`Found ${querySnapshot.size} employees in Firebase`);
            
            // Clear existing employees except for the "all" option
            while (elements.employeeSelect.options.length > 1) {
                elements.employeeSelect.remove(1);
            }
            
            while (elements.shiftEmployeeSelect.options.length > 1) {
                elements.shiftEmployeeSelect.remove(1);
            }
            
            // REMOVED: Code that added hardcoded employees to dropdowns
            
            // Add employee data from Firebase
            querySnapshot.forEach((doc) => {
                const employeeData = doc.data();
                const employeeId = doc.id;
                
                // Create display name (with or without nickname)
                const displayName = employeeData.nickname ? 
                    `${employeeData.nickname} (${employeeData.firstName} ${employeeData.lastName})` : 
                    `${employeeData.firstName} ${employeeData.lastName}`;
                
                // Add to legacy employee object (for backward compatibility)
                const shortName = employeeData.nickname || 
                    (employeeData.firstName + ' ' + employeeData.lastName.charAt(0) + '.');
                employees[employeeId] = shortName;
                
                // Add to the rich employee data structure
                if (!window.employeesData) {
                    window.employeesData = {};
                }
                
                window.employeesData[employeeId] = {
                    ...employeeData,
                    id: employeeId,
                    displayName: displayName,
                    shortDisplayName: shortName
                };
                
                // Add to dropdown menus
                addEmployeeToDropdowns(employeeId, displayName);
            });
            
            console.log('Employees loaded successfully');
            return true;
        })
        .catch((error) => {
            console.error('Error fetching employees from Firebase:', error);
            
            // MODIFIED: Don't fall back to hardcoded employees since they no longer exist
            // Just show an error message 
            alert('Error loading employees. Please refresh or try again later.');
            
            return false;
        });
}

// UPDATED: Fetch all locations from Firebase
function fetchLocationsFromFirebase() {
    console.log('Fetching locations from Firebase...');
    
    return firebase.firestore().collection('locations').get()
        .then((querySnapshot) => {
            console.log(`Found ${querySnapshot.size} locations in Firebase`);
            
            // Clear existing locations except for the "all" option
            while (elements.locationSelect.options.length > 1) {
                elements.locationSelect.remove(1);
            }
            
            while (elements.shiftLocationSelect.options.length > 1) {
                elements.shiftLocationSelect.remove(1);
            }
            
            // Initialize or clear locations data structure
            window.locationsData = {};
            
            // Add location data from Firebase
            querySnapshot.forEach((doc) => {
                const locationData = doc.data();
                const locationName = locationData.name;
                
                // Skip if empty name (data validation)
                if (!locationName) {
                    console.warn('Found location document with empty name, skipping', doc.id);
                    return;
                }
                
                // Add to the locations data structure
                window.locationsData[locationName] = {
                    ...locationData,
                    id: doc.id,
                    isActive: locationData.isActive !== false // Default to true if not specified
                };
                
                // Add to dropdown menus
                addLocationToDropdowns(locationName);
            });
            
            console.log('Locations loaded successfully:', Object.keys(window.locationsData));
            return true;
        })
        .catch((error) => {
            console.error('Error fetching locations from Firebase:', error);
            
            // Show error message
            alert('Error loading locations. Please refresh or try again later.');
            return false;
        });
}

// NEW FUNCTION: Save location to Firebase
function saveLocationToFirebase(locationData) {
    return firebase.firestore().collection('locations')
        .add({
            ...locationData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        })
        .then(docRef => {
            console.log('Location saved to Firebase with ID:', docRef.id);
            return docRef.id;
        })
        .catch(error => {
            console.error('Error saving location to Firebase:', error);
            throw error;
        });
}

// NEW FUNCTION: Update location in Firebase
function updateLocationInFirebase(locationId, locationData) {
    return firebase.firestore().collection('locations').doc(locationId)
        .update({
            ...locationData,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        })
        .then(() => {
            console.log('Location updated in Firebase:', locationId);
            return locationId;
        })
        .catch(error => {
            console.error('Error updating location in Firebase:', error);
            throw error;
        });
}

// NEW FUNCTION: Fetch shifts from Firebase
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

// NEW FUNCTION: Save a new shift to Firebase
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

// NEW FUNCTION: Update an existing shift in Firebase
function updateShiftInFirebase(shiftId, shiftData) {
    return firebase.firestore().collection('shifts').doc(shiftId)
        .update({
            ...shiftData,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        })
        .then(() => {
            console.log('Shift updated in Firebase:', shiftId);
            return shiftId;
        })
        .catch(error => {
            console.error('Error updating shift in Firebase:', error);
            throw error;
        });
}

// NEW FUNCTION: Delete a shift from Firebase
function deleteShiftFromFirebase(shiftId) {
    return firebase.firestore().collection('shifts').doc(shiftId)
        .delete()
        .then(() => {
            console.log('Shift deleted from Firebase:', shiftId);
            return true;
        })
        .catch(error => {
            console.error('Error deleting shift from Firebase:', error);
            throw error;
        });
}

// MODIFIED: Added function to fetch all data including shifts
function fetchAllDataFromFirebase() {
    return Promise.all([
        fetchEmployeesFromFirebase(),
        fetchLocationsFromFirebase(),
        loadShiftsFromFirebase() // NEW: Load shifts from Firebase
    ])
    .then(([employeesLoaded, locationsLoaded, loadedShifts]) => {
        // NEW: Update the shifts array with the loaded shifts
        shifts = loadedShifts;
        
        state.dataLoaded = true;
        state.isLoadingData = false;
        console.log('All data loaded. Employees:', employeesLoaded, 'Locations:', locationsLoaded, 'Shifts:', loadedShifts.length);
        return true;
    })
    .catch((error) => {
        state.dataLoaded = false;
        state.isLoadingData = false;
        console.error('Error loading all data:', error);
        return false;
    });
}

// Initialization - Entry point of the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM Content Loaded - Starting application initialization');
    
    // First, set up the proceed booking event handler
    elements.proceedBookingBtn.onclick = function() {
        console.log("DIRECT: Proceed button clicked with global state:", globalMoveOperation);
        
        if (globalMoveOperation.active) {
            // Handle day copy operation with conflicts
            if (globalMoveOperation.shifts && globalMoveOperation.shifts.length > 0) {
                const targetDate = globalMoveOperation.targetDate;
                const shiftsToClone = globalMoveOperation.shifts;
                
                console.log(`DIRECT: Copying ${shiftsToClone.length} shifts to date ${targetDate}`);
                
                // Array to store promises for Firebase operations
                const savePromises = [];
                const newShifts = [];
                
                // Copy all shifts regardless of conflicts
                shiftsToClone.forEach(shift => {
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
                                // Create full shift object with ID
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
                    .then(results => {
                        // Add all new shifts to our local array
                        shifts = [...shifts, ...newShifts];
                        
                        console.log(`DIRECT: Successfully copied ${newShifts.length} shifts to ${targetDate}`);
                        
                        // Close the warning modal
                        elements.warningModal.style.display = 'none';
                        
                        // Reset the global move operation
                        globalMoveOperation = {
                            shiftId: null,
                            targetDate: null,
                            shifts: null,
                            sourceDateStr: null,
                            active: false,
                            isCopy: false
                        };
                        
                        // Re-render the calendar
                        renderCalendar();
                    })
                    .catch(error => {
                        console.error('Error saving shifts to Firebase:', error);
                        alert('Could not save some shifts. Please try again later.');
                    });
                
                // Don't continue with the rest of the function
                return;
            } 
            // Handle single shift move/copy
            else if (globalMoveOperation.shiftId && globalMoveOperation.targetDate) {
                const shiftId = globalMoveOperation.shiftId;
                const targetDate = globalMoveOperation.targetDate;
                
                console.log(`DIRECT: Moving shift ${shiftId} to date ${targetDate}`);
                
                // Find the shift
                const originalShift = shifts.find(s => s.id === shiftId);
                
                if (originalShift) {
                    console.log("DIRECT: Found original shift:", originalShift);
                    
                    if (globalMoveOperation.isCopy) {
                        // Create a new shift data without ID
                        const newShiftData = {
                            date: targetDate,
                            employeeId: originalShift.employeeId,
                            startTime: originalShift.startTime,
                            endTime: originalShift.endTime,
                            type: originalShift.type,
                            theme: originalShift.theme,
                            location: originalShift.location,
                            notes: originalShift.notes
                        };
                        
                        // Save to Firebase
                        saveShiftToFirebase(newShiftData)
                            .then(newId => {
                                // Create the complete shift with the ID
                                const newShift = {
                                    ...newShiftData,
                                    id: newId
                                };
                                
                                // Add the new shift to the array
                                shifts.push(newShift);
                                
                                // Copy the collapsed state if needed
                                if (state.collapsedShifts.has(originalShift.id)) {
                                    state.collapsedShifts.add(newShift.id);
                                }
                                
                                console.log("DIRECT: Successfully copied shift");
                                
                                // Close the warning modal
                                elements.warningModal.style.display = 'none';
                                
                                // Reset the global move operation
                                globalMoveOperation = {
                                    shiftId: null,
                                    targetDate: null,
                                    shifts: null,
                                    sourceDateStr: null,
                                    active: false,
                                    isCopy: false
                                };
                                
                                // Re-render the calendar
                                renderCalendar();
                            })
                            .catch(error => {
                                console.error('Error copying shift to Firebase:', error);
                                alert('Could not copy event. Please try again later.');
                            });
                    } else {
                        // For move operations, we update the existing shift
                        const updatedShift = {
                            ...originalShift,
                            date: targetDate
                        };
                        
                        // Update in Firebase
                        updateShiftInFirebase(shiftId.toString(), updatedShift)
                            .then(() => {
                                // Create a new array without the original shift
                                const newShifts = shifts.filter(s => s.id !== shiftId);
                                
                                // Add the updated shift to the array
                                newShifts.push(updatedShift);
                                
                                // Replace the shifts array
                                shifts = newShifts;
                                
                                console.log("DIRECT: Successfully moved shift");
                                
                                // Close the warning modal
                                elements.warningModal.style.display = 'none';
                                
                                // Reset the global move operation
                                globalMoveOperation = {
                                    shiftId: null,
                                    targetDate: null,
                                    shifts: null,
                                    sourceDateStr: null,
                                    active: false,
                                    isCopy: false
                                };
                                
                                // Re-render the calendar
                                renderCalendar();
                            })
                            .catch(error => {
                                console.error('Error moving shift in Firebase:', error);
                                alert('Could not move event. Please try again later.');
                            });
                    }
                    
                    // Don't continue with the rest of the function since we're handling async operations
                    return;
                }
            }
        }
        
        // Default behavior if we didn't handle a specific case above
        // Close the warning modal
        elements.warningModal.style.display = 'none';
        
        // Reset the global move operation
        globalMoveOperation = {
            shiftId: null,
            targetDate: null,
            shifts: null,
            sourceDateStr: null,
            active: false,
            isCopy: false
        };
        
        // Re-render the calendar
        renderCalendar();
    };
    
    // Fetch data from Firebase before initializing the calendar
    fetchAllDataFromFirebase().then(() => {
        // Initialize calendar after data is loaded
        console.log('Initializing calendar now that data is loaded');
        initCalendar();
        
        // Additional direct button event handlers for month navigation buttons
        setTimeout(function() {
            const prevMonthBtn = document.getElementById('prev-month');
            const nextMonthBtn = document.getElementById('next-month');
            
            if (prevMonthBtn) {
                prevMonthBtn.addEventListener('click', function() {
                    console.log("Direct prev month button handler");
                    // Force hide dropzones
                    setTimeout(function() {
                        if (elements.prevMonthDropzone && elements.nextMonthDropzone) {
                            elements.prevMonthDropzone.style.display = 'none';
                            elements.nextMonthDropzone.style.display = 'none';
                            elements.prevMonthDropzone.style.opacity = '0';
                            elements.nextMonthDropzone.style.opacity = '0';
                            elements.prevMonthDropzone.classList.remove('active');
                            elements.nextMonthDropzone.classList.remove('active');
                        }
                    }, 100);
                });
            }
            
            if (nextMonthBtn) {
                nextMonthBtn.addEventListener('click', function() {
                    console.log("Direct next month button handler");
                    // Force hide dropzones
                    setTimeout(function() {
                        if (elements.prevMonthDropzone && elements.nextMonthDropzone) {
                            elements.prevMonthDropzone.style.display = 'none';
                            elements.nextMonthDropzone.style.display = 'none';
                            elements.prevMonthDropzone.style.opacity = '0';
                            elements.nextMonthDropzone.style.opacity = '0';
                            elements.prevMonthDropzone.classList.remove('active');
                            elements.nextMonthDropzone.classList.remove('active');
                        }
                    }, 100);
                });
            }
        }, 500);
        
        // Set up a MutationObserver to watch for dropzone visibility changes
        // This will automatically hide dropzones when they appear after month navigation
        setTimeout(function() {
            try {
                if (elements.prevMonthDropzone && elements.nextMonthDropzone) {
                    // Create a function to check if we're in a valid drag operation
                    function isValidDragOperation() {
                        return (
                            state.draggedShiftId !== null || 
                            state.copyingDayShifts.length > 0 || 
                            state.copyingWeekShifts.length > 0 ||
                            state.movingDayShifts.length > 0 ||  // Added for day move feature
                            state.isDragCopy ||
                            state.isDragWeekCopy ||
                            state.isDragDayMove  // Added for day move feature
                        );
                    }
                    
                    // Set up observers for both dropzones
                    const observePrevDropzone = new MutationObserver(function(mutations) {
                        mutations.forEach(function(mutation) {
                            if (mutation.attributeName === 'style' && 
                                elements.prevMonthDropzone.style.display === 'flex' && 
                                !isValidDragOperation()) {
                                
                                console.log("Auto-hiding prev month dropzone that appeared without drag");
                                // Force hide both dropzones
                                elements.prevMonthDropzone.style.display = 'none';
                                elements.nextMonthDropzone.style.display = 'none';
                                elements.prevMonthDropzone.style.opacity = '0';
                                elements.nextMonthDropzone.style.opacity = '0';
                                elements.prevMonthDropzone.classList.remove('active');
                                elements.nextMonthDropzone.classList.remove('active');
                            }
                        });
                    });
                    
                    const observeNextDropzone = new MutationObserver(function(mutations) {
                        mutations.forEach(function(mutation) {
                            if (mutation.attributeName === 'style' && 
                                elements.nextMonthDropzone.style.display === 'flex' && 
                                !isValidDragOperation()) {
                                
                                console.log("Auto-hiding next month dropzone that appeared without drag");
                                // Force hide both dropzones
                                elements.prevMonthDropzone.style.display = 'none';
                                elements.nextMonthDropzone.style.display = 'none';
                                elements.prevMonthDropzone.style.opacity = '0';
                                elements.nextMonthDropzone.style.opacity = '0';
                                elements.prevMonthDropzone.classList.remove('active');
                                elements.nextMonthDropzone.classList.remove('active');
                            }
                        });
                    });
                    
                    // Start observing the dropzones
                    observePrevDropzone.observe(elements.prevMonthDropzone, { attributes: true });
                    observeNextDropzone.observe(elements.nextMonthDropzone, { attributes: true });
                    
                    console.log("Dropzone visibility observers initialized");
                }
            } catch (error) {
                console.error("Error setting up mutation observers:", error);
            }
        }, 1000);
        
        // For debugging purposes
        console.log('Calendar initialized successfully');
    }).catch(error => {
        console.error('Failed to load data from Firebase:', error);
        
        // Initialize calendar anyway with local data
        console.log('Initializing calendar with local data only');
        initCalendar();
        
        // For debugging purposes
        console.log('Calendar initialized with local data');
    });
});