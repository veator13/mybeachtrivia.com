/**
 * Beach Trivia – Admin Calendar
 * main.js (v2025-11-13)
 * Loads employees, locations, and shifts from Firestore, wires auth + UI,
 * and keeps globals (window.*) in sync with calendar-ui.js / calendar-core.js.
 */

/* ===== Globals / Defaults ===== */
window.cache = window.cache || { dateStrings: {}, timeMinutes: {} };
window.eventTypes = window.eventTypes || {
  'classic-trivia': 'Classic Trivia',
  'themed-trivia' : 'Themed Trivia',
  'classic-bingo' : 'Classic Bingo',
  'music-bingo'   : 'Music Bingo',
  'beach-feud'    : 'Beach Feud'
};

// Shared app state (calendar-core / calendar-ui read these)
const state = (window.state ||= {
  currentDate: new Date(),
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  filters: { employee: 'all', eventType: 'all', location: 'all' },

  dataLoaded: false,
  isLoadingData: false,

  // edit flow
  editingShiftId: null,
  isEditing: false,
  pendingShiftData: null,
  forceBooking: false,

  // collapse
  collapsedShifts: new Set(),

  // drag / copy / move (used by dropzones visibility logic)
  draggedShiftId: null,
  isDragCopy: false,
  isDragDayMove: false,
  isDragWeekCopy: false,
  isDragWeekMove: false,

  copyingDayShifts: [],
  copyingWeekShifts: [],
  movingDayShifts: [],
  movingWeekShifts: [],

  sourceWeekIndex: null,

  currentHoveredCell: null,
  currentHoveredRow: null,

  // cross-month drag helpers
  pendingCrossMonthDrag: null,
  monthNavigationTimer: null,
  isHoveringPrevMonth: false,
  isHoveringNextMonth: false
});

/* ------------------------------
 * Global Move Operation (legacy alias some code still reads)
 * ------------------------------ */
window.globalMoveOperation = window.globalMoveOperation || {
  shiftId: null,
  targetDate: null,
  active: false,
  isCopy: false,
  shifts: null,
  sourceDateStr: null
};

/* ------------------------------
 * Elements (keep in window.elements so other files share refs)
 * ------------------------------ */
const elements = (window.elements ||= {});
function refreshElementRefs() {
  elements.calendarBody       = elements.calendarBody       || document.getElementById('calendar-body');
  elements.currentMonthDisplay= elements.currentMonthDisplay|| document.getElementById('current-month');
  elements.prevMonthBtn       = elements.prevMonthBtn       || document.getElementById('prev-month');
  elements.nextMonthBtn       = elements.nextMonthBtn       || document.getElementById('next-month');
  elements.employeeSelect     = elements.employeeSelect     || document.getElementById('employee-select');
  elements.eventSelect        = elements.eventSelect        || document.getElementById('event-select');
  elements.locationSelect     = elements.locationSelect     || document.getElementById('location-select');
  elements.expandAllBtn       = elements.expandAllBtn       || document.getElementById('expand-all-btn');
  elements.collapseAllBtn     = elements.collapseAllBtn     || document.getElementById('collapse-all-btn');

  elements.shiftModal         = elements.shiftModal         || document.getElementById('shift-modal');
  elements.shiftForm          = elements.shiftForm          || document.getElementById('shift-form');
  elements.shiftDateInput     = elements.shiftDateInput     || document.getElementById('shift-date');
  elements.startTimeSelect    = elements.startTimeSelect    || document.getElementById('start-time');
  elements.endTimeSelect      = elements.endTimeSelect      || document.getElementById('end-time');
  elements.shiftTypeSelect    = elements.shiftTypeSelect    || document.getElementById('shift-type');
  elements.themeField         = elements.themeField         || document.getElementById('theme-field');
  elements.shiftThemeInput    = elements.shiftThemeInput    || document.getElementById('shift-theme');
  elements.shiftEmployeeSelect= elements.shiftEmployeeSelect|| document.getElementById('shift-employee');
  elements.shiftLocationSelect= elements.shiftLocationSelect|| document.getElementById('shift-location');
  elements.shiftNotesInput    = elements.shiftNotesInput    || document.getElementById('shift-notes');

  elements.cancelShiftBtn     = elements.cancelShiftBtn     || document.getElementById('cancel-shift');
  elements.modalTitle         = elements.modalTitle         || document.querySelector('.modal-content h2');
  elements.submitButton       = elements.submitButton       || document.querySelector('.button-group button[type="submit"]');

  elements.warningModal       = elements.warningModal       || document.getElementById('warning-modal');
  elements.warningText        = elements.warningText        || document.getElementById('warning-text');
  elements.conflictDetails    = elements.conflictDetails    || document.getElementById('conflict-details');
  elements.cancelBookingBtn   = elements.cancelBookingBtn   || document.getElementById('cancel-booking');
  elements.proceedBookingBtn  = elements.proceedBookingBtn  || document.getElementById('proceed-booking');

  elements.addNewHostBtn      = elements.addNewHostBtn      || document.getElementById('add-new-host-btn');
  elements.newHostModal       = elements.newHostModal       || document.getElementById('new-host-modal');
  elements.newHostForm        = elements.newHostForm        || document.getElementById('new-host-form');
  elements.cancelNewHostBtn   = elements.cancelNewHostBtn   || document.getElementById('cancel-new-host');

  elements.addNewLocationBtn  = elements.addNewLocationBtn  || document.getElementById('add-new-location-btn');
  elements.newLocationModal   = elements.newLocationModal   || document.getElementById('new-location-modal');
  elements.newLocationForm    = elements.newLocationForm    || document.getElementById('new-location-form');
  elements.cancelNewLocationBtn=elements.cancelNewLocationBtn|| document.getElementById('cancel-new-location');

  // Cross-month dropzones (used by calendar-ui.js too)
  elements.prevMonthDropzone  = elements.prevMonthDropzone  || document.getElementById('prev-month-dropzone');
  elements.nextMonthDropzone  = elements.nextMonthDropzone  || document.getElementById('next-month-dropzone');
}
refreshElementRefs();

/* ------------------------------
 * Global Data Stores (use window.* so every file sees the same arrays)
 * ------------------------------ */
window.employees     = window.employees     || {};  // {id: shortDisplayName}
window.employeesData = window.employeesData || {};  // {id, displayName, shortDisplayName, ...}
window.locationsData = window.locationsData || {};  // {name: {...}}
window.shifts        = window.shifts        || [];  // [{ id, date:'YYYY-MM-DD', ... }]

/* ------------------------------
 * Utilities
 * ------------------------------ */
function toYMD(input) {
  if (!input) return '';
  if (typeof input === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
    const d = new Date(input);
    if (!isNaN(d)) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${da}`;
    }
    return '';
  }
  if (input && typeof input.toDate === 'function') {
    const d = input.toDate();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  }
  if (input instanceof Date) {
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, '0');
    const da = String(input.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  }
  return '';
}

function addEmployeeToDropdowns(id, name) {
  const targets = [elements.employeeSelect, elements.shiftEmployeeSelect];
  targets.forEach((sel) => {
    if (!sel) return;
    if (!sel.querySelector(`option[value="${id}"]`)) {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = name;
      sel.appendChild(o);
    }
  });
}

function addLocationToDropdowns(name) {
  const targets = [elements.locationSelect, elements.shiftLocationSelect];
  targets.forEach((sel) => {
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
 * Dropzone helpers (exposed)
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
function isValidDragOperation() {
  return (
    state.draggedShiftId !== null ||
    state.copyingDayShifts.length > 0 ||
    state.copyingWeekShifts.length > 0 ||
    state.movingDayShifts.length > 0 ||
    state.movingWeekShifts.length > 0 ||
    state.isDragCopy ||
    state.isDragDayMove ||
    state.isDragWeekCopy ||
    state.isDragWeekMove
  );
}
// make them available if other files want them
window.hideMonthDropzones = window.hideMonthDropzones || hideMonthDropzones;
window.showMonthDropzones = window.showMonthDropzones || showMonthDropzones;

/* ------------------------------
 * Firestore Loads
 * ------------------------------ */
async function fetchEmployeesFromFirebase() {
  console.log('[calendar] Fetching employees...');
  const db = firebase.firestore();
  const qs = await db.collection('employees').get();

  // clear dropdowns (keep "All" option at index 0 if present)
  if (elements.employeeSelect) {
    while (elements.employeeSelect.options.length > 1) elements.employeeSelect.remove(1);
  }
  if (elements.shiftEmployeeSelect) {
    while (elements.shiftEmployeeSelect.options.length > 1) elements.shiftEmployeeSelect.remove(1);
  }

  qs.forEach((doc) => {
    const d = doc.data() || {};
    const id = doc.id;
    const display = d.nickname
      ? `${d.nickname} (${d.firstName} ${d.lastName})`
      : `${d.firstName} ${d.lastName}`.trim();
    const short = d.nickname || `${d.firstName} ${d.lastName?.charAt(0) ?? ''}.`;

    window.employees[id] = short;
    window.employeesData[id] = { ...d, id, displayName: display, shortDisplayName: short };
    addEmployeeToDropdowns(id, display || short || id);
  });
  console.log(`[calendar] Employees loaded: ${qs.size}`);
}

async function fetchLocationsFromFirebase() {
  console.log('[calendar] Fetching locations...');
  const db = firebase.firestore();
  try {
    const qs = await db.collection('locations').get();
    window.locationsData = {};

    if (elements.locationSelect) {
      while (elements.locationSelect.options.length > 1) elements.locationSelect.remove(1);
    }
    if (elements.shiftLocationSelect) {
      while (elements.shiftLocationSelect.options.length > 1) elements.shiftLocationSelect.remove(1);
    }

    qs.forEach((doc) => {
      const d = doc.data() || {};
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

    // IMPORTANT: write to window.shifts so calendar-ui/core see the data
    window.shifts = qs.docs.map((doc) => {
      const d = doc.data() || {};
      return {
        id: doc.id,
        ...d,
        // normalize date field for strict equality matches
        date: toYMD(d.date)
      };
    });

    // Stable sort: by date then startTime minutes
    window.shifts.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;

      const tm = (s) => {
        if (!s || typeof s !== 'string') return -1;
        let t = s.trim().toUpperCase();
        // "h[:mm] AM/PM"
        let m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
        if (m) {
          let h = parseInt(m[1], 10);
          let min = m[2] ? parseInt(m[2], 10) : 0;
          const mer = m[3];
          if (mer === 'PM' && h !== 12) h += 12;
          if (mer === 'AM' && h === 12) h = 0;
          return h * 60 + min;
        }
        // "HH:MM" 24h
        m = t.match(/^(\d{1,2})(?::(\d{2}))?$/);
        if (m) {
          let h = parseInt(m[1], 10);
          let min = m[2] ? parseInt(m[2], 10) : 0;
          return h * 60 + min;
        }
        return -1;
      };

      return tm(a.startTime) - tm(b.startTime);
    });

    console.log(`[calendar] Shifts loaded: ${window.shifts.length}`);
  } catch (err) {
    console.error('[calendar] Missing or insufficient permissions for shifts:', err);
  }
}

/* ------------------------------
 * Init flow (auth → loads → initCalendar)
 * ------------------------------ */
document.addEventListener('DOMContentLoaded', () => {
  refreshElementRefs();
  console.log('DOM ready – waiting for Firebase Auth');

  firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
      console.warn('[calendar] No user – redirecting');
      location.replace('/login.html?next=' + encodeURIComponent(location.pathname));
      return;
    }

    console.log('[calendar] Auth ready for', user.email);

    try {
      // Load employees + locations + shifts
      await fetchEmployeesFromFirebase();
      await fetchLocationsFromFirebase();
      await loadShiftsFromFirebase();

      console.log('[calendar] All base data loaded, initializing UI...');
      // Initialize calendar (calendar-core provides initCalendar)
      if (typeof window.initCalendar === 'function') {
        window.initCalendar();
      }

      // Keep month label synced on first paint if element exists
      if (elements.currentMonthDisplay && window.getMonthYearString) {
        elements.currentMonthDisplay.textContent = window.getMonthYearString(
          state.currentYear,
          state.currentMonth
        );
      }

      // Ensure dropzones get cleared after month nav clicks
      setTimeout(() => {
        if (elements.prevMonthBtn) {
          elements.prevMonthBtn.addEventListener('click', () => {
            setTimeout(hideMonthDropzones, 100);
          });
        }
        if (elements.nextMonthBtn) {
          elements.nextMonthBtn.addEventListener('click', () => {
            setTimeout(hideMonthDropzones, 100);
          });
        }
      }, 300);

      // Auto-hide stray dropzones unless a valid drag/copy/move is active
      setTimeout(() => {
        try {
          if (elements.prevMonthDropzone && elements.nextMonthDropzone) {
            const observePrev = new MutationObserver((mutations) => {
              for (const m of mutations) {
                if (
                  m.attributeName === 'style' &&
                  elements.prevMonthDropzone.style.display === 'flex' &&
                  !isValidDragOperation()
                ) {
                  hideMonthDropzones();
                }
              }
            });
            const observeNext = new MutationObserver((mutations) => {
              for (const m of mutations) {
                if (
                  m.attributeName === 'style' &&
                  elements.nextMonthDropzone.style.display === 'flex' &&
                  !isValidDragOperation()
                ) {
                  hideMonthDropzones();
                }
              }
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