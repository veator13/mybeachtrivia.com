/**
 * Beach Trivia – Admin Calendar
 * main.js (v2026-02-27)
 * Handles Firebase loads (employees, locations, shifts) + initialization
 * Also manages cross-month dropzone visibility for drag/copy/move flows.
 *
 * ✅ Updates in this version:
 * - Expose `elements`, `state`, and `globalMoveOperation` on `window` so other files
 *   (modal-handlers.js / event-listeners.js / shift-service.js) can reliably read/write:
 *     - window.elements
 *     - window.CalendarState (and window.state alias)
 *     - window.globalMoveOperation
 * - Expose lightweight helpers: window.getShifts()/window.setShifts() for safe shared access.
 * - ✅ Button-route support: elements.submitButton now targets #save-shift-btn (type="button")
 *   with fallbacks, instead of `.button-group button[type="submit"]`.
 * - ✅ Compatibility aliases:
 *     - window.employees -> shortName map (used by drag-drop-handler ghost rendering)
 *     - window.hideMonthNavigationDropzones / window.showMonthNavigationDropzones
 */

/* ===== REQUIRED GLOBALS (used by utilities.js and calendar-ui.js) ===== */
window.cache = window.cache || { dateStrings: {}, timeMinutes: {} };
window.eventTypes = window.eventTypes || {
  "classic-trivia": "Classic Trivia",
  "themed-trivia": "Themed Trivia",
  "classic-bingo": "Classic Bingo",
  "music-bingo": "Music Bingo",
  "beach-feud": "Beach Feud",
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
  sourceDateStr: null,
};
window.globalMoveOperation = globalMoveOperation;

/* ------------------------------
 * Cached DOM Elements
 * ------------------------------ */
const elements = {
  calendarBody: document.getElementById("calendar-body"),
  currentMonthDisplay: document.getElementById("current-month"),
  prevMonthBtn: document.getElementById("prev-month"),
  nextMonthBtn: document.getElementById("next-month"),
  employeeSelect: document.getElementById("employee-select"),
  eventSelect: document.getElementById("event-select"),
  locationSelect: document.getElementById("location-select"),
  expandAllBtn: document.getElementById("expand-all-btn"),
  collapseAllBtn: document.getElementById("collapse-all-btn"),

  shiftModal: document.getElementById("shift-modal"),
  shiftForm: document.getElementById("shift-form"),
  shiftDateInput: document.getElementById("shift-date"),
  startTimeSelect: document.getElementById("start-time"),
  endTimeSelect: document.getElementById("end-time"),
  shiftTypeSelect: document.getElementById("shift-type"),
  themeField: document.getElementById("theme-field"),
  shiftThemeInput: document.getElementById("shift-theme"),
  shiftEmployeeSelect: document.getElementById("shift-employee"),
  shiftLocationSelect: document.getElementById("shift-location"),
  shiftNotesInput: document.getElementById("shift-notes"),

  cancelShiftBtn: document.getElementById("cancel-shift"),
  modalTitle: document.querySelector("#shift-modal .modal-content h2"),

  // ✅ Button-route: prefer explicit button id, then any button tied to shift-form.
  // Keep a final fallback to old submit selector in case an older HTML version is loaded.
  submitButton:
    document.getElementById("save-shift-btn") ||
    document.querySelector('button[form="shift-form"]') ||
    document.querySelector('#shift-modal .button-group button[form="shift-form"]') ||
    document.querySelector(".button-group button[type='submit']"),

  warningModal: document.getElementById("warning-modal"),
  warningText: document.getElementById("warning-text"),
  conflictDetails: document.getElementById("conflict-details"),
  cancelBookingBtn: document.getElementById("cancel-booking"),
  proceedBookingBtn: document.getElementById("proceed-booking"),

  addNewHostBtn: document.getElementById("add-new-host-btn"),
  newHostModal: document.getElementById("new-host-modal"),
  newHostForm: document.getElementById("new-host-form"),
  cancelNewHostBtn: document.getElementById("cancel-new-host"),

  addNewLocationBtn: document.getElementById("add-new-location-btn"),
  newLocationModal: document.getElementById("new-location-modal"),
  newLocationForm: document.getElementById("new-location-form"),
  cancelNewLocationBtn: document.getElementById("cancel-new-location"),

  // Cross-month dropzones
  prevMonthDropzone: document.getElementById("prev-month-dropzone"),
  nextMonthDropzone: document.getElementById("next-month-dropzone"),
};
window.elements = elements;

/* ------------------------------
 * State Management
 * ------------------------------ */
const state = {
  currentDate: new Date(),
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  filters: { employee: "all", eventType: "all", location: "all" },

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
  isDragWeekMove: false,

  copyingDayShifts: [],
  copyingWeekShifts: [],
  movingDayShifts: [],
  movingWeekShifts: [],

  sourceWeekIndex: null,

  // Hover state used by drag handlers (optional)
  currentHoveredCell: null,
  currentHoveredRow: null,

  // Cross-month drag helpers
  pendingCrossMonthDrag: null,
  monthNavigationTimer: null,
  isHoveringPrevMonth: false,
  isHoveringNextMonth: false,
};
window.CalendarState = state;
// ✅ Compatibility alias (modal-handlers checks window.state too)
window.state = state;

/* ------------------------------
 * Global Data Caches
 * ------------------------------ */
const employees = {};
window.employees = employees; // ✅ used by drag-drop-handler ghost rendering
window.employeesData = window.employeesData || {};
window.locationsData = window.locationsData || {};
let shifts = [];

// ✅ shared access helpers (prevents “stale reference” issues if another file reassigns `shifts`)
window.getShifts = () => shifts;
window.setShifts = (next) => {
  shifts = Array.isArray(next) ? next : shifts;
  return shifts;
};

/* ------------------------------
 * Dropdown Helpers
 * ------------------------------ */
function addEmployeeToDropdowns(id, name) {
  const opts = [elements.employeeSelect, elements.shiftEmployeeSelect];
  opts.forEach((sel) => {
    if (!sel) return;
    if (!sel.querySelector(`option[value="${id}"]`)) {
      const o = document.createElement("option");
      o.value = id;
      o.textContent = name;
      sel.appendChild(o);
    }
  });
}

function addLocationToDropdowns(name) {
  const opts = [elements.locationSelect, elements.shiftLocationSelect];
  opts.forEach((sel) => {
    if (!sel) return;
    if (!sel.querySelector(`option[value="${name}"]`)) {
      const o = document.createElement("option");
      o.value = name;
      o.textContent = name;
      sel.appendChild(o);
    }
  });
}

// Expose (some files call these directly)
window.addEmployeeToDropdowns = addEmployeeToDropdowns;
window.addLocationToDropdowns = addLocationToDropdowns;

/* ------------------------------
 * Helpers for Dropzones
 * ------------------------------ */
function hideMonthDropzones() {
  if (!elements.prevMonthDropzone || !elements.nextMonthDropzone) return;
  elements.prevMonthDropzone.style.display = "none";
  elements.nextMonthDropzone.style.display = "none";
  elements.prevMonthDropzone.style.opacity = "0";
  elements.nextMonthDropzone.style.opacity = "0";
  elements.prevMonthDropzone.classList.remove("active");
  elements.nextMonthDropzone.classList.remove("active");
}

function showMonthDropzones() {
  if (!elements.prevMonthDropzone || !elements.nextMonthDropzone) return;
  elements.prevMonthDropzone.style.display = "flex";
  elements.nextMonthDropzone.style.display = "flex";
  requestAnimationFrame(() => {
    elements.prevMonthDropzone.style.opacity = "1";
    elements.nextMonthDropzone.style.opacity = "1";
    elements.prevMonthDropzone.classList.add("active");
    elements.nextMonthDropzone.classList.add("active");
  });
}

// ✅ Compatibility aliases (used by other files)
window.hideMonthNavigationDropzones = hideMonthDropzones;
window.showMonthNavigationDropzones = showMonthDropzones;

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
async function fetchEmployeesFromFirebase() {
  console.log("[calendar] Fetching employees...");
  const db = firebase.firestore();
  const qs = await db.collection("employees").get();

  if (elements.employeeSelect)
    while (elements.employeeSelect.options.length > 1) elements.employeeSelect.remove(1);
  if (elements.shiftEmployeeSelect)
    while (elements.shiftEmployeeSelect.options.length > 1) elements.shiftEmployeeSelect.remove(1);

  qs.forEach((doc) => {
    const d = doc.data();
    const id = doc.id;

    const display = d.nickname
      ? `${d.nickname} (${d.firstName} ${d.lastName})`
      : `${d.firstName} ${d.lastName}`;
    const short = d.nickname || `${d.firstName} ${d.lastName?.charAt(0) ?? ""}.`;

    employees[id] = short;
    window.employeesData[id] = { ...d, id, displayName: display, shortDisplayName: short };
    addEmployeeToDropdowns(id, display);
  });

  console.log(`[calendar] Employees loaded: ${qs.size}`);
}

async function fetchLocationsFromFirebase() {
  console.log("[calendar] Fetching locations...");
  const db = firebase.firestore();
  try {
    const qs = await db.collection("locations").get();
    window.locationsData = {};

    if (elements.locationSelect)
      while (elements.locationSelect.options.length > 1) elements.locationSelect.remove(1);
    if (elements.shiftLocationSelect)
      while (elements.shiftLocationSelect.options.length > 1) elements.shiftLocationSelect.remove(1);

    qs.forEach((doc) => {
      const d = doc.data();
      if (!d.name) return;
      window.locationsData[d.name] = { ...d, id: doc.id };
      addLocationToDropdowns(d.name);
    });

    console.log(`[calendar] Locations loaded: ${qs.size}`);
  } catch (err) {
    console.error("[calendar] Missing or insufficient permissions for locations:", err);
  }
}

async function loadShiftsFromFirebase() {
  console.log("[calendar] Fetching shifts...");
  const db = firebase.firestore();
  try {
    const qs = await db.collection("shifts").get();
    shifts = qs.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    window.setShifts(shifts);
    console.log(`[calendar] Shifts loaded: ${shifts.length}`);
  } catch (err) {
    console.error("[calendar] Missing or insufficient permissions for shifts:", err);
  }
}

// Expose loaders for other files (modal-handlers uses loadShiftsFromFirebase sometimes)
window.fetchEmployeesFromFirebase = fetchEmployeesFromFirebase;
window.fetchLocationsFromFirebase = fetchLocationsFromFirebase;
window.loadShiftsFromFirebase = loadShiftsFromFirebase;

/* ------------------------------
 * Initialization
 * ------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM ready – waiting for Firebase Auth");

  firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
      console.warn("[calendar] No user – redirecting");
      location.replace("/login.html?next=" + encodeURIComponent(location.pathname));
      return;
    }

    console.log("[calendar] Auth ready for", user.email);

    try {
      await fetchEmployeesFromFirebase();
      await fetchLocationsFromFirebase();
      await loadShiftsFromFirebase();

      console.log("[calendar] All base data loaded, initializing UI...");
      if (typeof initCalendar === "function") initCalendar();

      // Ensure dropzones are hidden after manual month nav
      setTimeout(() => {
        if (elements.prevMonthBtn) {
          elements.prevMonthBtn.addEventListener("click", () => {
            setTimeout(() => hideMonthDropzones(), 100);
          });
        }
        if (elements.nextMonthBtn) {
          elements.nextMonthBtn.addEventListener("click", () => {
            setTimeout(() => hideMonthDropzones(), 100);
          });
        }
      }, 300);

      // Keep dropzones from getting "stuck" visible when no drag op is active
      setTimeout(() => {
        try {
          if (elements.prevMonthDropzone && elements.nextMonthDropzone) {
            const observePrev = new MutationObserver((mutations) => {
              mutations.forEach((m) => {
                if (
                  m.attributeName === "style" &&
                  elements.prevMonthDropzone.style.display === "flex" &&
                  !isValidDragOperation()
                ) {
                  hideMonthDropzones();
                }
              });
            });

            const observeNext = new MutationObserver((mutations) => {
              mutations.forEach((m) => {
                if (
                  m.attributeName === "style" &&
                  elements.nextMonthDropzone.style.display === "flex" &&
                  !isValidDragOperation()
                ) {
                  hideMonthDropzones();
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
      }, 600);

      console.log("[calendar] Calendar initialized successfully");
    } catch (err) {
      console.error("[calendar] Initialization error:", err);
      alert("Error loading calendar data – please check permissions or try again later.");
    }
  });
});