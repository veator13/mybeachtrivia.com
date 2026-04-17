/**
 * Beach Trivia – Admin Calendar
 * main.js (v2026-03-16)
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
 * - ✅ All employee + venue dropdowns are now alphabetized throughout the page
 *   while preserving placeholders and write-in options at the bottom.
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

  // Week visibility state (eye toggle) — stores week indices that are hidden
  hiddenWeeks: new Set(),

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
function _escapeAttr(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function _normalizeSortLabel(label) {
  return String(label || "")
    .replace(/^✏️\s*/u, "")
    .replace(/^\(TEMP\)\s*/i, "")
    .trim()
    .toLowerCase();
}

function _sortSelectOptions(selectEl, config = {}) {
  if (!selectEl) return;

  const {
    keepFirst = true,
    keepBottomValues = [],
    keepDisabled = false,
  } = config;

  const allOptions = Array.from(selectEl.options);
  if (!allOptions.length) return;

  const firstOption = keepFirst ? allOptions[0] : null;
  const startIndex = keepFirst ? 1 : 0;

  const bottomOptions = [];
  const sortableOptions = [];

  for (let i = startIndex; i < allOptions.length; i++) {
    const opt = allOptions[i];
    const val = String(opt.value || "");
    const keepAtBottom =
      keepBottomValues.includes(val) ||
      (keepDisabled && opt.disabled);

    if (keepAtBottom) bottomOptions.push(opt);
    else sortableOptions.push(opt);
  }

  sortableOptions.sort((a, b) => {
    const aLabel = a.dataset.sortLabel || _normalizeSortLabel(a.textContent);
    const bLabel = b.dataset.sortLabel || _normalizeSortLabel(b.textContent);
    return aLabel.localeCompare(bLabel, undefined, { sensitivity: "base" });
  });

  const currentValue = selectEl.value;
  selectEl.innerHTML = "";

  if (firstOption) selectEl.appendChild(firstOption);
  sortableOptions.forEach((opt) => selectEl.appendChild(opt));
  bottomOptions.forEach((opt) => selectEl.appendChild(opt));

  // Restore selection if the option still exists
  const restored = Array.from(selectEl.options).some((o) => String(o.value) === String(currentValue));
  if (restored) selectEl.value = currentValue;
}

function _sortEmployeeDropdowns() {
  _sortSelectOptions(elements.employeeSelect, { keepFirst: true });
  _sortSelectOptions(elements.shiftEmployeeSelect, {
    keepFirst: true,
    keepBottomValues: ["__write_in__"],
    keepDisabled: true,
  });
}

function _sortLocationDropdowns() {
  _sortSelectOptions(elements.locationSelect, { keepFirst: true });
  _sortSelectOptions(elements.shiftLocationSelect, {
    keepFirst: true,
    keepBottomValues: ["__write_in_venue__"],
    keepDisabled: true,
  });
}

function addEmployeeToDropdowns(id, name, extra = {}) {
  const opts = [elements.employeeSelect, elements.shiftEmployeeSelect];
  opts.forEach((sel) => {
    if (!sel) return;
    if (!sel.querySelector(`option[value="${_escapeAttr(id)}"]`)) {
      const o = document.createElement("option");
      o.value = id;
      o.textContent = name;
      if (extra.isTemp) {
        o.dataset.isTemp = "true";
        o.className = "temp-employee-option";
      }
      o.dataset.sortLabel = _normalizeSortLabel(extra.sortLabel || name);
      sel.appendChild(o);
    }
  });

  _sortEmployeeDropdowns();
}

function addLocationToDropdowns(name, label = name, extra = {}) {
  const opts = [elements.locationSelect, elements.shiftLocationSelect];
  opts.forEach((sel) => {
    if (!sel) return;
    if (!sel.querySelector(`option[value="${_escapeAttr(name)}"]`)) {
      const o = document.createElement("option");
      o.value = name;
      o.textContent = label;
      if (extra.isTemp) {
        o.dataset.isTemp = "true";
        o.className = "temp-location-option";
      }
      o.dataset.sortLabel = _normalizeSortLabel(extra.sortLabel || label || name);
      sel.appendChild(o);
    }
  });

  _sortLocationDropdowns();
}

// Expose (some files call these directly)
window.addEmployeeToDropdowns = addEmployeeToDropdowns;
window.addLocationToDropdowns = addLocationToDropdowns;
window.sortEmployeeDropdowns = _sortEmployeeDropdowns;
window.sortLocationDropdowns = _sortLocationDropdowns;

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
function _buildEmployeeDropdownsFromSnap(qs) {
  // Rebuild both dropdowns from scratch (keep placeholder at index 0)
  if (elements.employeeSelect)
    while (elements.employeeSelect.options.length > 1) elements.employeeSelect.remove(1);
  if (elements.shiftEmployeeSelect)
    while (elements.shiftEmployeeSelect.options.length > 1) elements.shiftEmployeeSelect.remove(1);

  // Reset in-memory maps
  Object.keys(employees).forEach((k) => delete employees[k]);
  Object.keys(window.employeesData || {}).forEach((k) => delete window.employeesData[k]);

  const regularEmployees = [];
  const tempEmployees = [];

  qs.forEach((doc) => {
    const d = doc.data();
    const id = doc.id;

    if (d.isTemp === true) {
      const tempName = d.firstName || d.tempName || "Unknown";
      const short = `(TEMP) ${tempName}`;
      employees[id] = short;
      window.employeesData[id] = { ...d, id, displayName: short, shortDisplayName: short, isTemp: true };
      tempEmployees.push({ id, label: short, sortLabel: tempName, isTemp: true });
      return;
    }

    const first = d.firstName || "";
    const last = d.lastName || "";
    const fallbackName = `${first} ${last}`.trim() || d.nickname || d.email || "Unknown host";
    const display = d.nickname ? `${d.nickname} (${fallbackName})` : fallbackName;
    const short = d.nickname || `${first} ${last?.charAt(0) ?? ""}.`.trim() || fallbackName;

    employees[id] = short;
    window.employeesData[id] = { ...d, id, displayName: display, shortDisplayName: short };
    regularEmployees.push({ id, label: display, sortLabel: d.nickname || fallbackName, isTemp: false });
  });

  regularEmployees
    .sort((a, b) => _normalizeSortLabel(a.sortLabel).localeCompare(_normalizeSortLabel(b.sortLabel), undefined, { sensitivity: "base" }))
    .forEach((emp) => addEmployeeToDropdowns(emp.id, emp.label, { sortLabel: emp.sortLabel }));

  tempEmployees
    .sort((a, b) => _normalizeSortLabel(a.sortLabel).localeCompare(_normalizeSortLabel(b.sortLabel), undefined, { sensitivity: "base" }))
    .forEach((emp) => addEmployeeToDropdowns(emp.id, emp.label, { sortLabel: emp.sortLabel, isTemp: true }));

  _appendWriteInOption();
  _appendRefreshOption(
    [elements.employeeSelect, elements.shiftEmployeeSelect],
    () => fetchEmployeesFromFirebase(true)
  );
  _sortEmployeeDropdowns();
}

async function fetchEmployeesFromFirebase(forceRefresh = false) {
  // Skip if already loaded and not explicitly refreshing
  if (!forceRefresh && window._employeesLoaded) return;

  console.log("[calendar] Fetching employees (one-time)...");
  const db = firebase.firestore();
  try {
    const qs = await db.collection("employees").get();
    console.log("[calendar] Employees loaded, count:", qs.size);
    _buildEmployeeDropdownsFromSnap(qs);
    window._employeesLoaded = true;
  } catch (err) {
    console.error("[calendar] Employees fetch error:", err);
  }
}

// Append a "↻ Refresh List" sentinel option to the given dropdowns.
// When selected, resets the dropdown and calls onRefresh().
function _appendRefreshOption(selects, onRefresh) {
  selects.forEach((sel) => {
    if (!sel) return;
    // Remove any existing refresh sentinel before re-appending
    sel.querySelector('option[value="__refresh_list__"]')?.remove();
    sel.querySelector('option[data-refresh-divider]')?.remove();

    const divider = document.createElement("option");
    divider.disabled = true;
    divider.dataset.refreshDivider = "1";
    divider.textContent = "──────────────";
    sel.appendChild(divider);

    const opt = document.createElement("option");
    opt.value = "__refresh_list__";
    opt.textContent = "↻  Refresh List";
    opt.className = "refresh-list-option";
    sel.appendChild(opt);

    sel.addEventListener("change", function handler(e) {
      if (sel.value !== "__refresh_list__") return;
      sel.value = sel.options[0].value; // reset to placeholder
      onRefresh();
    });
  });
}

// Append the write-in option to the shift modal host select (once, after employees load)
function _appendWriteInOption() {
  const sel = elements.shiftEmployeeSelect || document.getElementById("shift-employee");
  if (!sel) return;
  if (sel.querySelector('option[value="__write_in__"]')) {
    _sortEmployeeDropdowns();
    return;
  }

  const divider = document.createElement("option");
  divider.disabled = true;
  divider.textContent = "──────────────";
  sel.appendChild(divider);

  const opt = document.createElement("option");
  opt.value = "__write_in__";
  opt.textContent = "✏️  Write-in temporary host…";
  opt.className = "write-in-option";
  sel.appendChild(opt);

  _sortEmployeeDropdowns();
}
window._appendWriteInOption = _appendWriteInOption;

// Show/hide write-in text input when the sentinel option is selected
document.addEventListener("change", (e) => {
  if (e.target?.id !== "shift-employee") return;
  const field = document.getElementById("write-in-host-field");
  const input = document.getElementById("write-in-host-name");
  if (!field) return;
  if (e.target.value === "__write_in__") {
    field.style.display = "block";
    input?.focus();
  } else {
    field.style.display = "none";
    if (input) input.value = "";
  }
});

/* ------------------------------
 * Temp Employee Helpers
 * ------------------------------ */

/**
 * Creates a temporary placeholder employee doc in Firestore.
 * Returns the new doc ID.
 */
async function createTempEmployee(name) {
  const db = firebase.firestore();
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 20);
  const id = `TEMP_${slug}_${Date.now()}`;
  await db.collection("employees").doc(id).set({
    firstName: name,
    lastName: "",
    isTemp: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  const short = `(TEMP) ${name}`;

  // Register locally so the calendar can resolve the name immediately
  employees[id] = short;
  window.employeesData[id] = {
    firstName: name,
    lastName: "",
    isTemp: true,
    id,
    displayName: short,
    shortDisplayName: short,
  };

  addEmployeeToDropdowns(id, short, {
    isTemp: true,
    sortLabel: name,
  });

  _appendWriteInOption();
  console.log(`[temp] Created temp employee "${name}" → ${id}`);
  return id;
}
window.createTempEmployee = createTempEmployee;

/**
 * Deletes a temp employee doc if no shifts remain assigned to them.
 */
async function cleanupTempEmployee(employeeId) {
  if (!employeeId) return;

  // Check employeesData first; fall back to a Firestore lookup so cleanup
  // works even if the in-memory map was cleared (e.g. after a page reload).
  let isTemp = window.employeesData?.[employeeId]?.isTemp;
  if (!isTemp) {
    try {
      const snap = await firebase.firestore().collection("employees").doc(employeeId).get();
      isTemp = snap.exists && snap.data()?.isTemp === true;
    } catch (_) {}
  }
  if (!isTemp) return; // not a temp — skip

  // Check the LOCAL shifts array first (already updated before cleanup is called).
  const localShifts = Array.isArray(window.shifts) ? window.shifts : (typeof shifts !== "undefined" ? shifts : []);
  const localRemaining = localShifts.filter((s) => String(s?.employeeId) === String(employeeId));

  if (localRemaining.length > 0) {
    console.log(`[temp] ${employeeId} still has ${localRemaining.length} local shift(s) — keeping.`);
    return;
  }

  // Double-check Firestore to guard against any local-array staleness.
  try {
    const db = firebase.firestore();
    const remaining = await db.collection("shifts").where("employeeId", "==", employeeId).get();
    if (!remaining.empty) {
      console.log(`[temp] ${employeeId} still has ${remaining.size} Firestore shift(s) — keeping.`);
      return;
    }
    await db.collection("employees").doc(employeeId).delete();
  } catch (err) {
    console.error("[temp] cleanupTempEmployee Firestore error:", err);
    return;
  }

  try { delete employees[employeeId]; } catch (_) {}
  try { delete window.employeesData[employeeId]; } catch (_) {}
  document.querySelectorAll(`option[value="${_escapeAttr(employeeId)}"]`).forEach((o) => o.remove());
  console.log(`[temp] Cleaned up temp employee ${employeeId}`);
}
window.cleanupTempEmployee = cleanupTempEmployee;

/* ------------------------------
 * Temp Venue Helpers
 * ------------------------------ */

// Append the write-in option to the shift modal location select (once, after locations load)
function _appendWriteInVenueOption() {
  const sel = elements.shiftLocationSelect || document.getElementById("shift-location");
  if (!sel) return;
  if (sel.querySelector('option[value="__write_in_venue__"]')) {
    _sortLocationDropdowns();
    return;
  }

  const divider = document.createElement("option");
  divider.disabled = true;
  divider.textContent = "──────────────";
  sel.appendChild(divider);

  const opt = document.createElement("option");
  opt.value = "__write_in_venue__";
  opt.textContent = "✏️  Write-in temporary venue…";
  opt.className = "write-in-option";
  sel.appendChild(opt);

  _sortLocationDropdowns();
}
window._appendWriteInVenueOption = _appendWriteInVenueOption;

// Show/hide write-in venue text input when the sentinel option is selected
document.addEventListener("change", (e) => {
  if (e.target?.id !== "shift-location") return;
  const field = document.getElementById("write-in-venue-field");
  const input = document.getElementById("write-in-venue-name");
  if (!field) return;
  if (e.target.value === "__write_in_venue__") {
    field.style.display = "block";
    input?.focus();
  } else {
    field.style.display = "none";
    if (input) input.value = "";
  }
});

/**
 * Creates a temporary placeholder venue doc in Firestore.
 * Returns the venue name (used as the value in dropdowns + shift.location).
 */
async function createTempVenue(name) {
  const db = firebase.firestore();
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 20);
  const docId = `TEMP_${slug}_${Date.now()}`;
  await db.collection("locations").doc(docId).set({
    name,
    isTemp: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  const display = `(TEMP) ${name}`;
  window.locationsData = window.locationsData || {};
  window.locationsData[name] = { name, isTemp: true, displayName: display };

  addLocationToDropdowns(name, display, {
    isTemp: true,
    sortLabel: name,
  });

  _appendWriteInVenueOption();
  console.log(`[temp] Created temp venue "${name}"`);
  return name;
}
window.createTempVenue = createTempVenue;

/**
 * Deletes a temp venue doc if no shifts remain assigned to it.
 */
async function cleanupTempVenue(locationName) {
  if (!locationName) return;

  let isTemp = window.locationsData?.[locationName]?.isTemp;
  if (!isTemp) {
    try {
      const snap = await firebase.firestore()
        .collection("locations")
        .where("name", "==", locationName)
        .where("isTemp", "==", true)
        .get();
      isTemp = !snap.empty;
    } catch (_) {}
  }
  if (!isTemp) return;

  const localShifts = Array.isArray(window.shifts) ? window.shifts : (typeof shifts !== "undefined" ? shifts : []);
  const localRemaining = localShifts.filter((s) => s?.location === locationName);

  if (localRemaining.length > 0) {
    console.log(`[temp] Venue "${locationName}" still has ${localRemaining.length} local shift(s) — keeping.`);
    return;
  }

  try {
    const db = firebase.firestore();
    const remaining = await db.collection("shifts").where("location", "==", locationName).get();
    if (!remaining.empty) {
      console.log(`[temp] Venue "${locationName}" still has ${remaining.size} Firestore shift(s) — keeping.`);
      return;
    }
    const locSnap = await db.collection("locations")
      .where("name", "==", locationName)
      .where("isTemp", "==", true)
      .get();
    await Promise.all(locSnap.docs.map((d) => d.ref.delete()));
  } catch (err) {
    console.error("[temp] cleanupTempVenue Firestore error:", err);
    return;
  }

  try { delete window.locationsData[locationName]; } catch (_) {}
  document.querySelectorAll(`option[value="${_escapeAttr(locationName)}"]`).forEach((o) => o.remove());
  console.log(`[temp] Cleaned up temp venue "${locationName}"`);
}
window.cleanupTempVenue = cleanupTempVenue;

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

    const regularLocations = [];
    const tempLocations = [];

    qs.forEach((doc) => {
      const d = doc.data();
      if (!d.name) return;

      if (d.isTemp === true) {
        const display = `(TEMP) ${d.name}`;
        window.locationsData[d.name] = { ...d, id: doc.id, isTemp: true, displayName: display };
        tempLocations.push({
          value: d.name,
          label: display,
          sortLabel: d.name,
          isTemp: true,
        });
        return;
      }

      // Hide inactive regular venues from admin assignment dropdowns
      if (d.active === false) return;

      window.locationsData[d.name] = { ...d, id: doc.id };
      regularLocations.push({
        value: d.name,
        label: d.name,
        sortLabel: d.name,
        isTemp: false,
      });
    });

    regularLocations
      .sort((a, b) =>
        _normalizeSortLabel(a.sortLabel).localeCompare(_normalizeSortLabel(b.sortLabel), undefined, { sensitivity: "base" })
      )
      .forEach((loc) => addLocationToDropdowns(loc.value, loc.label, { sortLabel: loc.sortLabel }));

    tempLocations
      .sort((a, b) =>
        _normalizeSortLabel(a.sortLabel).localeCompare(_normalizeSortLabel(b.sortLabel), undefined, { sensitivity: "base" })
      )
      .forEach((loc) => addLocationToDropdowns(loc.value, loc.label, { sortLabel: loc.sortLabel, isTemp: true }));

    _appendWriteInVenueOption();
    _appendRefreshOption(
      [elements.locationSelect, elements.shiftLocationSelect],
      () => fetchLocationsFromFirebase()
    );
    _sortLocationDropdowns();

    console.log(`[calendar] Locations loaded: ${regularLocations.length} active + ${tempLocations.length} temp`);
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