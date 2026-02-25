/**
 * Beach Trivia – Admin Calendar
 * main.js (v2026-02-25)
 * Handles Firebase loads (employees, locations, shifts) + initialization
 * Also manages cross-month dropzone visibility for drag/copy/move flows.
 */

/* ===== REQUIRED GLOBALS (used by utilities.js and calendar-ui.js) ===== */
window.cache = window.cache || { dateStrings: {}, timeMinutes: {} };
window.eventTypes = window.eventTypes || {
  'classic-trivia': 'Classic Trivia',
  'themed-trivia':  'Themed Trivia',
  'classic-bingo':  'Classic Bingo',
  'music-bingo':    'Music Bingo',
  'beach-feud':     'Beach Feud'
};

/* ------------------------------
 * Global Move Operation (drag/copy flows)
 * ------------------------------ */
let globalMoveOperation = {
  shiftId: null,
  targetDate: null,
  active: false,
  isCopy: false,
  shifts: null,
  sourceDateStr: null
};

/* ------------------------------
 * Cached DOM Elements
 * ------------------------------ */
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

  addNewHostBtn: document.getElementById('add-new-host-btn'),
  newHostModal: document.getElementById('new-host-modal'),
  newHostForm: document.getElementById('new-host-form'),
  cancelNewHostBtn: document.getElementById('cancel-new-host'),

  addNewLocationBtn: document.getElementById('add-new-location-btn'),
  newLocationModal: document.getElementById('new-location-modal'),
  newLocationForm: document.getElementById('new-location-form'),
  cancelNewLocationBtn: document.getElementById('cancel-new-location'),

  // Cross-month dropzones
  prevMonthDropzone: document.getElementById('prev-month-dropzone'),
  nextMonthDropzone: document.getElementById('next-month-dropzone')
};

/* ------------------------------
 * State Management
 * ------------------------------ */
const state = {
  currentDate: new Date(),
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  filters: { employee: 'all', eventType: 'all', location: 'all' },

  dataLoaded: false,
  isLoadingData: false,

  // Edit flow
  editingShiftId: null,
  isEditing: false,
  pendingShiftData: null,
  forceBooking: false,

  // Collapse state
  collapsedShifts: new Set(),

  // Drag/copy/move flags used to decide whether cross-month dropzones should stay visible
  draggedShiftId: null,
  isDragCopy: false,
  isDragDayMove: false,
  isDragWeekCopy: false,
  isDragWeekMove: false,         // week move flow

  copyingDayShifts: [],
  copyingWeekShifts: [],
  movingDayShifts: [],
  movingWeekShifts: [],          // week move flow

  sourceWeekIndex: null,

  // Hover state used by drag handlers (optional)
  currentHoveredCell: null,
  currentHoveredRow: null,

  // Cross-month drag helpers
  pendingCrossMonthDrag: null,
  monthNavigationTimer: null,
  isHoveringPrevMonth: false,
  isHoveringNextMonth: false
};

/* ------------------------------
 * Global Data Caches
 * ------------------------------ */
const employees = {};
window.employeesData = {};
window.locationsData = {};
let shifts = [];

// Live listener unsubscribers
let unsubscribeEmployees = null;

/* ------------------------------
 * Dropdown Helpers
 * ------------------------------ */
function addEmployeeToDropdowns(id, name) {
  const opts = [elements.employeeSelect, elements.shiftEmployeeSelect];
  opts.forEach(sel => {
    if (!sel) return;
    if (!sel.querySelector(`option[value="${id}"]`)) {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = name;
      sel.appendChild(o);
    } else {
      // keep label updated if changed
      const o = sel.querySelector(`option[value="${id}"]`);
      if (o && o.textContent !== name) o.textContent = name;
    }
  });
}

function removeEmployeeFromDropdowns(id) {
  const opts = [elements.employeeSelect, elements.shiftEmployeeSelect];
  opts.forEach(sel => {
    if (!sel) return;
    const o = sel.querySelector(`option[value="${id}"]`);
    if (o) o.remove();
  });
}

function addLocationToDropdowns(name) {
  const opts = [elements.locationSelect, elements.shiftLocationSelect];
  opts.forEach(sel => {
    if (!sel) return;
    if (!sel.querySelector(`option[value="${name}"]`)) {
      const o = document.createElement('option');
      o.value = name;
      o.textContent = name;
      sel.appendChild(o);
    }
  });
}

/* ------------------------------
 * Helpers for Dropzones
 * ------------------------------ */
function hideMonthDropzones() {
  if (!elements.prevMonthDropzone || !elements.nextMonthDropzone) return;
  elements.prevMonthDropzone.style.display = 'none';
  elements.nextMonthDropzone.style.display = 'none';
  elements.prevMonthDropzone.style.opacity = '0';
  elements.nextMonthDropzone.style.opacity = '0';
  elements.prevMonthDropzone.classList.remove('active');
  elements.nextMonthDropzone.classList.remove('active');
}

function showMonthDropzones() {
  if (!elements.prevMonthDropzone || !elements.nextMonthDropzone) return;
  elements.prevMonthDropzone.style.display = 'flex';
  elements.nextMonthDropzone.style.display = 'flex';
  requestAnimationFrame(() => {
    elements.prevMonthDropzone.style.opacity = '1';
    elements.nextMonthDropzone.style.opacity = '1';
    elements.prevMonthDropzone.classList.add('active');
    elements.nextMonthDropzone.classList.add('active');
  });
}

// Used by a MutationObserver to decide if dropzones should remain visible
function isValidDragOperation() {
  return (
    state.draggedShiftId !== null ||
    state.copyingDayShifts.length > 0 ||
    state.copyingWeekShifts.length > 0 ||
    state.movingDayShifts.length > 0 ||
    state.isDragCopy ||
    state.isDragWeekCopy ||
    state.isDragDayMove ||
    state.isDragWeekMove ||
    state.movingWeekShifts.length > 0
  );
}

/* ------------------------------
 * Firestore Data Loads
 * ------------------------------ */

/**
 * Applies the current employees snapshot to:
 * - employees (short labels)
 * - window.employeesData (full doc cache)
 * - both dropdowns (filter + shift form)
 *
 * This keeps admin "Create Employee" and scheduler users in sync (including deletions)
 * without requiring a page refresh.
 */
function applyEmployeesSnapshot(qs) {
  const seenIds = new Set();

  qs.forEach(doc => {
    const d = doc.data();
    const id = doc.id;
    seenIds.add(id);

    const first = (d.firstName || '').trim();
    const last  = (d.lastName || '').trim();
    const nick  = (d.nickname || '').trim();
    const email = (d.email || '').trim();

    const firstLast = [first, last].filter(Boolean).join(' ').trim();

    // Display name (what dropdowns show)
    const display =
      nick && firstLast ? `${nick} (${firstLast})` :
      nick ? nick :
      firstLast ? firstLast :
      email ? email :
      'Unknown Employee';

    // Short name (used in compact calendar labels)
    const emailLocal = email ? email.split('@')[0] : '';
    const short =
      nick ? nick :
      first ? first :
      last ? last :
      emailLocal ? emailLocal :
      email ? email :
      'Unknown';

    employees[id] = short;
    window.employeesData[id] = { ...d, id, displayName: display, shortDisplayName: short };
    addEmployeeToDropdowns(id, display);
  });

  // Remove deletions from caches + dropdowns
  Object.keys(window.employeesData).forEach((id) => {
    if (!seenIds.has(id)) {
      delete window.employeesData[id];
      delete employees[id];
      removeEmployeeFromDropdowns(id);
    }
  });

  // If currently-filtered employee was deleted, reset to "all"
  if (elements.employeeSelect && state.filters?.employee && state.filters.employee !== 'all') {
    const stillExists = !!elements.employeeSelect.querySelector(`option[value="${state.filters.employee}"]`);
    if (!stillExists) {
      state.filters.employee = 'all';
      elements.employeeSelect.value = 'all';
      try {
        if (typeof renderCalendar === 'function') renderCalendar();
      } catch (_) {}
    }
  }

  console.log(`[calendar] Employees live-updated: ${qs.size}`);
}

async function fetchEmployeesFromFirebase() {
  console.log('[calendar] Fetching employees...');

  const db = firebase.firestore();

  // Clear existing listener if any (safety)
  if (typeof unsubscribeEmployees === 'function') {
    try { unsubscribeEmployees(); } catch (_) {}
    unsubscribeEmployees = null;
  }

  // Ensure dropdowns are reset to defaults (keep first option: "All")
  if (elements.employeeSelect) {
    while (elements.employeeSelect.options.length > 1) elements.employeeSelect.remove(1);
  }
  if (elements.shiftEmployeeSelect) {
    while (elements.shiftEmployeeSelect.options.length > 1) elements.shiftEmployeeSelect.remove(1);
  }

  // LIVE LISTENER (key change)
  unsubscribeEmployees = db.collection('employees').onSnapshot(
    (qs) => applyEmployeesSnapshot(qs),
    (err) => {
      console.error('[calendar] Employees listener error:', err);
      // fall back to one-time fetch if listener fails
      db.collection('employees').get().then(applyEmployeesSnapshot).catch((e) => {
        console.error('[calendar] Employees fallback fetch failed:', e);
      });
    }
  );

  console.log('[calendar] Employee live listener started');
}

async function fetchLocationsFromFirebase() {
  console.log('[calendar] Fetching locations...');
  const db = firebase.firestore();
  try {
    const qs = await db.collection('locations').get();
    window.locationsData = {};

    while (elements.locationSelect.options.length > 1) elements.locationSelect.remove(1);
    while (elements.shiftLocationSelect.options.length > 1) elements.shiftLocationSelect.remove(1);

    qs.forEach(doc => {
      const d = doc.data();
      if (!d.name) return;
      window.locationsData[d.name] = { ...d, id: doc.id };
      addLocationToDropdowns(d.name);
    });
    console.log(`[calendar] Locations loaded: ${qs.size}`);
  } catch (err) {
    console.error('[calendar] Missing or insufficient permissions for locations:', err);
  }
}

async function loadShiftsFromFirebase() {
  console.log('[calendar] Fetching shifts...');
  const db = firebase.firestore();
  try {
    const qs = await db.collection('shifts').get();
    shifts = qs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log(`[calendar] Shifts loaded: ${shifts.length}`);
  } catch (err) {
    console.error('[calendar] Missing or insufficient permissions for shifts:', err);
  }
}

/* ------------------------------
 * Initialization
 * ------------------------------ */
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM ready – waiting for Firebase Auth');

  firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
      console.warn('[calendar] No user – redirecting');
      location.replace('/login.html?next=' + encodeURIComponent(location.pathname));
      return;
    }

    console.log('[calendar] Auth ready for', user.email);

    try {
      // Load employees + locations + shifts (admin-only)
      await fetchEmployeesFromFirebase();  // now starts a live listener
      await fetchLocationsFromFirebase();
      await loadShiftsFromFirebase();

      console.log('[calendar] All base data loaded, initializing UI...');
      if (typeof initCalendar === 'function') initCalendar();

      // Post-init: ensure dropzones get cleared after month nav button clicks
      setTimeout(() => {
        if (elements.prevMonthBtn) {
          elements.prevMonthBtn.addEventListener('click', () => {
            setTimeout(() => hideMonthDropzones(), 100);
          });
        }
        if (elements.nextMonthBtn) {
          elements.nextMonthBtn.addEventListener('click', () => {
            setTimeout(() => hideMonthDropzones(), 100);
          });
        }
      }, 300);

      // Auto-hide stray dropzones unless a valid drag/copy/move is active
      setTimeout(() => {
        try {
          if (elements.prevMonthDropzone && elements.nextMonthDropzone) {
            const observePrev = new MutationObserver((mutations) => {
              mutations.forEach((m) => {
                if (
                  m.attributeName === 'style' &&
                  elements.prevMonthDropzone.style.display === 'flex' &&
                  !isValidDragOperation()
                ) {
                  hideMonthDropzones();
                }
              });
            });

            const observeNext = new MutationObserver((mutations) => {
              mutations.forEach((m) => {
                if (
                  m.attributeName === 'style' &&
                  elements.nextMonthDropzone.style.display === 'flex' &&
                  !isValidDragOperation()
                ) {
                  hideMonthDropzones();
                }
              });
            });

            observePrev.observe(elements.prevMonthDropzone, { attributes: true });
            observeNext.observe(elements.nextMonthDropzone, { attributes: true });
            console.log('Dropzone visibility observers initialized');
          }
        } catch (err) {
          console.error('Error setting up mutation observers:', err);
        }
      }, 600);

      console.log('[calendar] Calendar initialized successfully');
    } catch (err) {
      console.error('[calendar] Initialization error:', err);
      alert('Error loading calendar data – please check permissions or try again later.');
    }
  });
});