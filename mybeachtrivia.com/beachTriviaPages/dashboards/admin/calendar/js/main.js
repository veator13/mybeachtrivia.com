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
  dateStrings: {},  // Store formatted dates to avoid repeated calculations
  timeMinutes: {}   // Store computed time values
};

// State management - single source of truth for all state
const state = {
  currentDate: new Date(),
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  initialLoad: true,

  // Filters
  filters: {
    employee: 'all',
    eventType: 'all',
    location: 'all'
  },

  // Drag/drop
  draggedShiftId: null,
  currentHoveredCell: null,
  currentHoveredRow: null,
  isDragCopy: false,
  copyingDayShifts: [],
  copyingWeekShifts: [],
  isDragWeekCopy: false,
  sourceWeekIndex: null,

  // Day move feature
  isDragDayMove: false,
  movingDayShifts: [],
  sourceDateStr: null,

  // Cross-month drag state
  pendingCrossMonthDrag: null,
  monthNavigationTimer: null,
  isHoveringPrevMonth: false,
  isHoveringNextMonth: false,

  // Edit state
  editingShiftId: null,
  isEditing: false,

  // Booking state
  forceBooking: false,
  pendingShiftData: null,

  // Collapsed cards
  collapsedShifts: new Set(),

  // Data loading
  dataLoaded: false,
  isLoadingData: false
};

// MODIFIED: Removed hardcoded employees - empty object that will be populated from Firebase
const employees = {};

// Extended employee data structure
window.employeesData = {};

// Locations data structure
window.locationsData = {};

function getEmployeeData(employeeId) {
  if (window.employeesData && window.employeesData[employeeId]) {
    return window.employeesData[employeeId];
  }
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

function getLocationData(locationName) {
  if (window.locationsData && window.locationsData[locationName]) {
    return window.locationsData[locationName];
  }
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

// MODIFIED: sample shifts removed; will be loaded
let shifts = [];

// ----- Dropdown helpers -----
function addEmployeeToDropdowns(employeeId, displayName) {
  if (!document.querySelector(`#employee-select option[value="${employeeId}"]`)) {
    const opt = document.createElement('option');
    opt.value = employeeId;
    opt.textContent = displayName;
    elements.employeeSelect.appendChild(opt);
  }
  if (!document.querySelector(`#shift-employee option[value="${employeeId}"]`)) {
    const opt2 = document.createElement('option');
    opt2.value = employeeId;
    opt2.textContent = displayName;
    elements.shiftEmployeeSelect.appendChild(opt2);
  }
}

function addLocationToDropdowns(locationName) {
  if (!document.querySelector(`#location-select option[value="${locationName}"]`)) {
    const o = document.createElement('option');
    o.value = locationName;
    o.textContent = locationName;
    elements.locationSelect.appendChild(o);
  }
  if (!document.querySelector(`#shift-location option[value="${locationName}"]`)) {
    const o2 = document.createElement('option');
    o2.value = locationName;
    o2.textContent = locationName;
    elements.shiftLocationSelect.appendChild(o2);
  }
}

// ----- Firestore loads -----
function fetchEmployeesFromFirebase() {
  console.log('Fetching employees from Firebase...');
  state.isLoadingData = true;

  return firebase.firestore().collection('employees').get()
    .then((qs) => {
      console.log(`Found ${qs.size} employees in Firebase`);

      while (elements.employeeSelect.options.length > 1) elements.employeeSelect.remove(1);
      while (elements.shiftEmployeeSelect.options.length > 1) elements.shiftEmployeeSelect.remove(1);

      qs.forEach((doc) => {
        const d = doc.data();
        const id = doc.id;

        const displayName = d.nickname
          ? `${d.nickname} (${d.firstName} ${d.lastName})`
          : `${d.firstName} ${d.lastName}`;

        const shortName = d.nickname || (d.firstName + ' ' + (d.lastName ? d.lastName.charAt(0) + '.' : ''));
        employees[id] = shortName;

        if (!window.employeesData) window.employeesData = {};
        window.employeesData[id] = {
          ...d,
          id,
          displayName,
          shortDisplayName: shortName
        };

        addEmployeeToDropdowns(id, displayName);
      });

      console.log('Employees loaded successfully');
      return true;
    })
    .catch((err) => {
      console.error('Error fetching employees from Firebase:', err);
      alert('Error loading employees. Please refresh or try again later.');
      return false;
    });
}

function fetchLocationsFromFirebase() {
  console.log('Fetching locations from Firebase...');

  return firebase.firestore().collection('locations').get()
    .then((qs) => {
      console.log(`Found ${qs.size} locations in Firebase`);

      while (elements.locationSelect.options.length > 1) elements.locationSelect.remove(1);
      while (elements.shiftLocationSelect.options.length > 1) elements.shiftLocationSelect.remove(1);

      window.locationsData = {};

      qs.forEach((doc) => {
        const d = doc.data();
        const name = d.name;
        if (!name) {
          console.warn('Found location document with empty name, skipping', doc.id);
          return;
        }
        window.locationsData[name] = {
          ...d,
          id: doc.id,
          isActive: d.isActive !== false
        };
        addLocationToDropdowns(name);
      });

      console.log('Locations loaded successfully:', Object.keys(window.locationsData));
      return true;
    })
    .catch((err) => {
      console.error('Error fetching locations from Firebase:', err);
      alert('Error loading locations. Please refresh or try again later.');
      return false;
    });
}

function saveLocationToFirebase(locationData) {
  return firebase.firestore().collection('locations')
    .add({
      ...locationData,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(docRef => docRef.id);
}

function updateLocationInFirebase(locationId, locationData) {
  return firebase.firestore().collection('locations').doc(locationId)
    .update({
      ...locationData,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => locationId);
}

function loadShiftsFromFirebase() {
  console.log('Loading shifts from Firebase...');
  return firebase.firestore().collection('shifts').get()
    .then(qs => {
      const loaded = [];
      qs.forEach(doc => {
        const d = doc.data();
        loaded.push({
          id: doc.id,
          date: d.date,
          employeeId: d.employeeId,
          startTime: d.startTime,
          endTime: d.endTime,
          type: d.type,
          theme: d.theme || '',
          location: d.location,
          notes: d.notes || ''
        });
      });
      console.log(`Loaded ${loaded.length} shifts from Firebase`);
      return loaded;
    })
    .catch(err => {
      console.error('Error loading shifts from Firebase:', err);
      return [];
    });
}

function saveShiftToFirebase(shiftData) {
  return firebase.firestore().collection('shifts')
    .add({
      ...shiftData,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(docRef => docRef.id);
}

function updateShiftInFirebase(shiftId, shiftData) {
  return firebase.firestore().collection('shifts').doc(shiftId)
    .update({
      ...shiftData,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => shiftId);
}

function deleteShiftFromFirebase(shiftId) {
  return firebase.firestore().collection('shifts').doc(shiftId)
    .delete()
    .then(() => true);
}

// Load employees + locations + shifts
function fetchAllDataFromFirebase() {
  return Promise.all([
    fetchEmployeesFromFirebase(),
    fetchLocationsFromFirebase(),
    loadShiftsFromFirebase()
  ])
    .then(([employeesLoaded, locationsLoaded, loadedShifts]) => {
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

// ====== AUTH-GATED INITIALIZATION (FIX) ======
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded – waiting for auth to initialize');

  // Handle Proceed button early (ENHANCED: now handles form conflicts too)
  elements.proceedBookingBtn.onclick = function () {
    console.log("DIRECT: Proceed button clicked with global state:", globalMoveOperation);

    // -- NEW: FORM add/edit path override --
    if (state && state.pendingShiftData) {
      const shiftData = state.pendingShiftData;
      // Clear first to avoid reuse
      state.pendingShiftData = null;
      state.forceBooking = false;

      if (elements.warningModal) {
        elements.warningModal.style.display = 'none';
        elements.warningModal.setAttribute('aria-hidden', 'true');
      }

      const isEdit = !!(state.isEditing && state.editingShiftId);
      if (isEdit) {
        const existing = shifts.find(s => String(s.id) === String(state.editingShiftId)) || {};
        const merged = { ...existing, ...shiftData };

        updateShiftInFirebase(String(state.editingShiftId), merged)
          .then(() => {
            const idx = shifts.findIndex(s => String(s.id) === String(state.editingShiftId));
            if (idx !== -1) shifts[idx] = { id: state.editingShiftId, ...merged };
            if (typeof closeShiftModal === 'function') { try { closeShiftModal(); } catch(_) {} }
            if (typeof renderCalendar === 'function') renderCalendar();
          })
          .catch(err => {
            console.error('[calendar] Proceed override UPDATE failed:', err);
            alert('Could not save your changes. Please try again.');
          });

        return; // don't fall through to drag/copy
      } else {
        saveShiftToFirebase(shiftData)
          .then(newId => {
            shifts.push({ id: newId, ...shiftData });
            if (typeof closeShiftModal === 'function') { try { closeShiftModal(); } catch(_) {} }
            if (typeof renderCalendar === 'function') renderCalendar();
          })
          .catch(err => {
            console.error('[calendar] Proceed override CREATE failed:', err);
            alert('Could not save the event. Please try again.');
          });

        return; // don't fall through to drag/copy
      }
    }

    // ---- Existing DRAG/COPY flows below ----
    if (globalMoveOperation.active) {
      // Day copy with conflicts
      if (globalMoveOperation.shifts && globalMoveOperation.shifts.length > 0) {
        const targetDate = globalMoveOperation.targetDate;
        const shiftsToClone = globalMoveOperation.shifts;

        const savePromises = [];
        const newShifts = [];

        shiftsToClone.forEach(shift => {
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

          savePromises.push(
            saveShiftToFirebase(newShiftData).then(newId => {
              const ns = { ...newShiftData, id: newId };
              if (state.collapsedShifts.has(shift.id)) state.collapsedShifts.add(ns.id);
              newShifts.push(ns);
              return ns;
            })
          );
        });

        Promise.all(savePromises)
          .then(() => {
            shifts = [...shifts, ...newShifts];
            if (elements.warningModal) {
              elements.warningModal.style.display = 'none';
              elements.warningModal.setAttribute('aria-hidden', 'true');
            }
            globalMoveOperation = { shiftId: null, targetDate: null, shifts: null, sourceDateStr: null, active: false, isCopy: false };
            if (typeof renderCalendar === 'function') renderCalendar();
          })
          .catch(err => {
            console.error('Error saving shifts to Firebase:', err);
            alert('Could not save some shifts. Please try again later.');
          });
        return;
      }

      // Single move/copy
      if (globalMoveOperation.shiftId && globalMoveOperation.targetDate) {
        const shiftId = globalMoveOperation.shiftId;
        const targetDate = globalMoveOperation.targetDate;
        const originalShift = shifts.find(s => s.id === shiftId);
        if (originalShift) {
          if (globalMoveOperation.isCopy) {
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
            saveShiftToFirebase(newShiftData)
              .then(newId => {
                const ns = { ...newShiftData, id: newId };
                shifts.push(ns);
                if (state.collapsedShifts.has(originalShift.id)) state.collapsedShifts.add(ns.id);
                if (elements.warningModal) {
                  elements.warningModal.style.display = 'none';
                  elements.warningModal.setAttribute('aria-hidden', 'true');
                }
                globalMoveOperation = { shiftId: null, targetDate: null, shifts: null, sourceDateStr: null, active: false, isCopy: false };
                if (typeof renderCalendar === 'function') renderCalendar();
              })
              .catch(err => {
                console.error('Error copying shift to Firebase:', err);
                alert('Could not copy event. Please try again later.');
              });
          } else {
            const updatedShift = { ...originalShift, date: targetDate };
            updateShiftInFirebase(shiftId.toString(), updatedShift)
              .then(() => {
                const arr = shifts.filter(s => s.id !== shiftId);
                arr.push(updatedShift);
                shifts = arr;
                if (elements.warningModal) {
                  elements.warningModal.style.display = 'none';
                  elements.warningModal.setAttribute('aria-hidden', 'true');
                }
                globalMoveOperation = { shiftId: null, targetDate: null, shifts: null, sourceDateStr: null, active: false, isCopy: false };
                if (typeof renderCalendar === 'function') renderCalendar();
              })
              .catch(err => {
                console.error('Error moving shift in Firebase:', err);
                alert('Could not move event. Please try again later.');
              });
          }
          return;
        }
      }
    }

    // Default fall-through
    if (elements.warningModal) {
      elements.warningModal.style.display = 'none';
      elements.warningModal.setAttribute('aria-hidden', 'true');
    }
    globalMoveOperation = { shiftId: null, targetDate: null, shifts: null, sourceDateStr: null, active: false, isCopy: false };
    if (typeof renderCalendar === 'function') renderCalendar();
  };

  // NEW: ensure Cancel clears pending forced save from form flow
  if (elements.cancelBookingBtn) {
    elements.cancelBookingBtn.onclick = function () {
      state.pendingShiftData = null;
      state.forceBooking = false;
      if (elements.warningModal) {
        elements.warningModal.style.display = 'none';
        elements.warningModal.setAttribute('aria-hidden', 'true');
      }
      if (elements.submitButton && elements.submitButton.focus) {
        try { elements.submitButton.focus(); } catch(_) {}
      }
    };
  }

  // >>> Wait for Firebase Auth before touching Firestore <<<
  firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
      console.warn('[calendar] No user signed in; redirecting to login');
      // FIX: send to real login and preserve return path
      location.replace('/login.html?next=' + encodeURIComponent(location.pathname + location.search + location.hash));
      return;
    }

    console.log('[calendar] Auth ready for', user.email, '→ starting data load');

    try {
      // Load base data first
      await Promise.all([fetchEmployeesFromFirebase(), fetchLocationsFromFirebase()]);

      // Then load shifts
      const loadedShifts = await loadShiftsFromFirebase();
      shifts = loadedShifts;

      // Initialize the calendar UI
      console.log('Initializing calendar now that data is loaded');
      initCalendar();

      // Post-init helpers (unchanged)
      setTimeout(function () {
        const prevMonthBtn = document.getElementById('prev-month');
        const nextMonthBtn = document.getElementById('next-month');
        if (prevMonthBtn) {
          prevMonthBtn.addEventListener('click', function () {
            setTimeout(function () {
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
          nextMonthBtn.addEventListener('click', function () {
            setTimeout(function () {
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

      // MutationObservers to auto-hide stray dropzones
      setTimeout(function () {
        try {
          if (elements.prevMonthDropzone && elements.nextMonthDropzone) {
            function isValidDragOperation() {
              return (
                state.draggedShiftId !== null ||
                state.copyingDayShifts.length > 0 ||
                state.copyingWeekShifts.length > 0 ||
                state.movingDayShifts.length > 0 ||
                state.isDragCopy ||
                state.isDragWeekCopy ||
                state.isDragDayMove
              );
            }

            const observePrev = new MutationObserver(function (mutations) {
              mutations.forEach(function (m) {
                if (m.attributeName === 'style' &&
                    elements.prevMonthDropzone.style.display === 'flex' &&
                    !isValidDragOperation()) {
                  elements.prevMonthDropzone.style.display = 'none';
                  elements.nextMonthDropzone.style.display = 'none';
                  elements.prevMonthDropzone.style.opacity = '0';
                  elements.nextMonthDropzone.style.opacity = '0';
                  elements.prevMonthDropzone.classList.remove('active');
                  elements.nextMonthDropzone.classList.remove('active');
                }
              });
            });

            const observeNext = new MutationObserver(function (mutations) {
              mutations.forEach(function (m) {
                if (m.attributeName === 'style' &&
                    elements.nextMonthDropzone.style.display === 'flex' &&
                    !isValidDragOperation()) {
                  elements.prevMonthDropzone.style.display = 'none';
                  elements.nextMonthDropzone.style.display = 'none';
                  elements.prevMonthDropzone.style.opacity = '0';
                  elements.nextMonthDropzone.style.opacity = '0';
                  elements.prevMonthDropzone.classList.remove('active');
                  elements.nextMonthDropzone.classList.remove('active');
                }
              });
            });

            observePrev.observe(elements.prevMonthDropzone, { attributes: true });
            observeNext.observe(elements.nextMonthDropzone, { attributes: true });
            console.log("Dropzone visibility observers initialized");
          }
        } catch (err) {
          console.error("Error setting up mutation observers:", err);
        }
      }, 1000);

      console.log('Calendar initialized successfully');
    } catch (e) {
      console.error('[calendar] Initialization error:', e);
      alert('Error loading data. Please refresh or try again later.');
      // Fallback: show calendar UI even if data failed (optional)
      try { initCalendar(); } catch (_) {}
    }
  });
});
