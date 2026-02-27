// calendar-ui.js
// UI rendering + accessibility helpers for the calendar
//
// Updated 2026-02-27:
// - Removes legacy showSimplifiedWarning() to avoid overriding modal-handlers.js
// - Removes any direct bare-global globalMoveOperation access
// - Keeps UI-only helpers (dropzones, accessibility, shift element rendering, expand/collapse, key nav)
//
// IMPORTANT:
// Primary modal + override logic lives in modal-handlers.js and drag-drop-handler.js.
// This file should NOT re-define modal/override functions (to prevent "last definition wins").

// ------------------------------------------------------------
// Setup month navigation dropzones for drag operations
// ------------------------------------------------------------
function setupMonthNavigationDropzones() {
    hideMonthNavigationDropzones();
  }
  
  // Utility function to hide month navigation dropzones
  function hideMonthNavigationDropzones() {
    try {
      const els = window.elements || (typeof elements !== "undefined" ? elements : {});
      if (els.prevMonthDropzone && els.nextMonthDropzone) {
        // Force-hide the dropzones immediately
        els.prevMonthDropzone.style.display = "none";
        els.nextMonthDropzone.style.display = "none";
        els.prevMonthDropzone.style.opacity = "0";
        els.nextMonthDropzone.style.opacity = "0";
  
        // Also remove active class for good measure
        els.prevMonthDropzone.classList.remove("active");
        els.nextMonthDropzone.classList.remove("active");
      }
    } catch (error) {
      console.error("Error hiding month navigation dropzones:", error);
    }
  }
  window.hideMonthNavigationDropzones = hideMonthNavigationDropzones;
  
  // ------------------------------------------------------------
  // Accessibility enhancements
  // ------------------------------------------------------------
  function setupAccessibilitySupport() {
    try {
      if (!document.getElementById("calendar-announcer")) {
        const announcer = document.createElement("div");
        announcer.setAttribute("aria-live", "polite");
        announcer.classList.add("sr-only");
        announcer.id = "calendar-announcer";
        document.body.appendChild(announcer);
      }
  
      if (!document.getElementById("keyboard-instructions")) {
        const instructions = document.createElement("div");
        instructions.id = "keyboard-instructions";
        instructions.classList.add("sr-only");
        instructions.textContent =
          "Use arrow keys to navigate the calendar, Enter to select a date, Escape to close dialogs.";
        document.body.appendChild(instructions);
      }
    } catch (error) {
      console.error("Error setting up accessibility support:", error);
    }
  }
  
  // Announce changes for screen readers
  function announceForScreenReader(message) {
    const announcer = document.getElementById("calendar-announcer");
    if (announcer) announcer.textContent = message;
  }
  window.announceForScreenReader = announceForScreenReader;
  
  // ------------------------------------------------------------
  // Create shift element - separate function for clarity
  // ------------------------------------------------------------
  function createShiftElement(shift) {
    try {
      const st = window.state || (typeof state !== "undefined" ? state : null);
      const collapsedSet = st?.collapsedShifts;
  
      const shiftDiv = document.createElement("div");
      shiftDiv.classList.add("shift", shift.type);
  
      if (collapsedSet?.has?.(shift.id)) {
        shiftDiv.classList.add("collapsed");
      }
  
      shiftDiv.setAttribute("data-id", shift.id);
      shiftDiv.setAttribute("draggable", "true");
      shiftDiv.setAttribute("tabindex", "0");
      shiftDiv.setAttribute("role", "button");
  
      const allShifts = (typeof shifts !== "undefined" ? shifts : window.shifts) || [];
      const hostShiftsOnDay = allShifts.filter(
        (s) => s.date === shift.date && s.employeeId === shift.employeeId
      );
  
      const eTypes = (typeof eventTypes !== "undefined" ? eventTypes : window.eventTypes) || {};
      let shiftName = eTypes[shift.type] || shift.type;
      if (shift.type === "themed-trivia" && shift.theme) {
        shiftName += `: ${shift.theme}`;
      }
  
      const emps = (typeof employees !== "undefined" ? employees : window.employees) || {};
      const hasMultipleShifts = hostShiftsOnDay.length > 1;
  
      shiftDiv.setAttribute(
        "aria-label",
        `${eTypes[shift.type] || shift.type} with ${emps[shift.employeeId]} from ${shift.startTime} to ${shift.endTime} at ${shift.location}${
          hasMultipleShifts ? `. Host has ${hostShiftsOnDay.length} shifts this day.` : ""
        }`
      );
  
      shiftDiv.setAttribute("aria-expanded", !(collapsedSet?.has?.(shift.id)));
  
      const esc =
        typeof escapeHTML === "function"
          ? escapeHTML
          : (s) =>
              String(s ?? "").replace(/[&<>"']/g, (m) => {
                return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
              });
  
      const contentHTML = `
        <div class="employee">${esc(emps[shift.employeeId] || "Unknown Host")}</div>
        <div class="time">${esc(shift.startTime)} - ${esc(shift.endTime)}</div>
        <div class="location">${esc(shift.location)}</div>
        <div class="event-type">${esc(shiftName)}</div>
        <span class="copy-button" data-id="${esc(shift.id)}" role="button" aria-label="Copy event" tabindex="0" draggable="true">
          <i class="copy-icon" draggable="true">⧉</i>
        </span>
        <span class="toggle-button" data-id="${esc(shift.id)}" role="button" aria-label="Toggle details" tabindex="0">
          <div class="${collapsedSet?.has?.(shift.id) ? "triangle-right" : "triangle-down"}"></div>
        </span>
        <span class="delete-button" data-id="${esc(shift.id)}" role="button" aria-label="Delete event" tabindex="0">×</span>
      `;
      shiftDiv.innerHTML = contentHTML;
  
      if (hasMultipleShifts) {
        const badgeHTML = `
          <div class="controls">
            <div class="badge-wrapper">
              <div class="multi-shift-badge">${hostShiftsOnDay.length}x</div>
            </div>
          </div>
        `;
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = badgeHTML;
        const badgeControls = tempDiv.firstElementChild;
        if (badgeControls) shiftDiv.appendChild(badgeControls);
      }
  
      console.log("Created shift element:", shiftDiv);
      return shiftDiv;
    } catch (error) {
      console.error("Error creating shift element:", error);
      return null;
    }
  }
  window.createShiftElement = createShiftElement;
  
  // Focus today's cell for keyboard navigation
  function focusTodayCell() {
    const els = window.elements || (typeof elements !== "undefined" ? elements : {});
    const todayCell = els.calendarBody?.querySelector?.('td[tabindex="0"]');
    if (todayCell) todayCell.focus();
  }
  
  // ------------------------------------------------------------
  // Populate time dropdowns with 15-minute increments
  // ------------------------------------------------------------
  function populateTimeDropdowns() {
    const els = window.elements || (typeof elements !== "undefined" ? elements : {});
    const timeOptions = generateTimeOptions();
  
    const startFragment = document.createDocumentFragment();
    const endFragment = document.createDocumentFragment();
  
    const startDefaultOption = document.createElement("option");
    startDefaultOption.value = "";
    startDefaultOption.textContent = "Select";
    startFragment.appendChild(startDefaultOption);
  
    const endDefaultOption = document.createElement("option");
    endDefaultOption.value = "";
    endDefaultOption.textContent = "Select";
    endFragment.appendChild(endDefaultOption);
  
    timeOptions.forEach((time) => {
      const startOption = document.createElement("option");
      startOption.value = time;
      startOption.textContent = time;
      startFragment.appendChild(startOption);
  
      const endOption = document.createElement("option");
      endOption.value = time;
      endOption.textContent = time;
      endFragment.appendChild(endOption);
    });
  
    if (els.startTimeSelect) {
      els.startTimeSelect.innerHTML = "";
      els.startTimeSelect.appendChild(startFragment);
    }
    if (els.endTimeSelect) {
      els.endTimeSelect.innerHTML = "";
      els.endTimeSelect.appendChild(endFragment);
    }
  }
  
  // Generate time options in 15-minute increments for the entire day
  function generateTimeOptions() {
    const times = [];
    const hours = 24;
    const intervals = 4; // 15-minute intervals per hour
  
    for (let hour = 0; hour < hours; hour++) {
      for (let interval = 0; interval < intervals; interval++) {
        const h = (hour % 12) || 12;
        const m = interval * 15;
        const ampm = hour < 12 ? "AM" : "PM";
        times.push(`${h}:${m.toString().padStart(2, "0")} ${ampm}`);
      }
    }
    return times;
  }
  
  // ------------------------------------------------------------
  // UI-only helpers (legacy-safe)
  // NOTE: Primary versions live in modal-handlers.js now.
  // These remain only if older code still calls them.
  // ------------------------------------------------------------
  function toggleThemeField() {
    const els = window.elements || (typeof elements !== "undefined" ? elements : {});
    if (!els.shiftTypeSelect || !els.themeField || !els.shiftThemeInput) return;
  
    if (els.shiftTypeSelect.value === "themed-trivia") {
      els.themeField.style.display = "block";
      els.shiftThemeInput.setAttribute("required", "required");
    } else {
      els.themeField.style.display = "none";
      els.shiftThemeInput.removeAttribute("required");
      els.shiftThemeInput.value = "";
    }
  }
  
  function autoSelectEndTime() {
    const els = window.elements || (typeof elements !== "undefined" ? elements : {});
    if (els.startTimeSelect?.value) {
      const startTimeIndex = els.startTimeSelect.selectedIndex;
      const endTimeIndex = Math.min(startTimeIndex + 8, (els.endTimeSelect?.options?.length || 1) - 1);
      if (els.endTimeSelect) els.endTimeSelect.selectedIndex = endTimeIndex;
    }
  }
  
  function validateShiftForm() {
    const els = window.elements || (typeof elements !== "undefined" ? elements : {});
    if (!els.shiftDateInput?.value) {
      alert("Please select a date for the event.");
      els.shiftDateInput?.focus?.();
      return false;
    }
    if (!els.shiftEmployeeSelect?.value) {
      alert("Please select a host for the event.");
      els.shiftEmployeeSelect?.focus?.();
      return false;
    }
    if (!els.startTimeSelect?.value) {
      alert("Please select a start time for the event.");
      els.startTimeSelect?.focus?.();
      return false;
    }
    if (!els.endTimeSelect?.value) {
      alert("Please select an end time for the event.");
      els.endTimeSelect?.focus?.();
      return false;
    }
    if (!els.shiftTypeSelect?.value) {
      alert("Please select an event type.");
      els.shiftTypeSelect?.focus?.();
      return false;
    }
    if (els.shiftTypeSelect.value === "themed-trivia" && !els.shiftThemeInput?.value?.trim?.()) {
      alert("Please enter a theme for the themed trivia event.");
      els.shiftThemeInput?.focus?.();
      return false;
    }
    if (!els.shiftLocationSelect?.value) {
      alert("Please select a location for the event.");
      els.shiftLocationSelect?.focus?.();
      return false;
    }
    return true;
  }
  
  // Helper function to select dropdown option by value
  function selectDropdownOptionByValue(dropdown, value) {
    if (!dropdown || !value) return;
  
    let found = false;
    for (let i = 0; i < dropdown.options.length; i++) {
      if (dropdown.options[i].value === value) {
        dropdown.selectedIndex = i;
        found = true;
        break;
      }
    }
  
    if (!found && dropdown.options.length > 0) dropdown.selectedIndex = 0;
  }
  
  // ------------------------------------------------------------
  // Expand / collapse helpers
  // ------------------------------------------------------------
  function expandAllShifts() {
    const st = window.state || (typeof state !== "undefined" ? state : null);
    const shiftElements = document.querySelectorAll(".shift");
  
    st?.collapsedShifts?.clear?.();
  
    shiftElements.forEach((shiftDiv) => {
      const triangle = shiftDiv.querySelector(".toggle-button div");
      shiftDiv.classList.remove("collapsed");
      if (triangle) triangle.className = "triangle-down";
      shiftDiv.setAttribute("aria-expanded", "true");
    });
  
    announceForScreenReader("All shifts expanded");
  }
  
  function collapseAllShifts() {
    const st = window.state || (typeof state !== "undefined" ? state : null);
    const shiftElements = document.querySelectorAll(".shift");
  
    shiftElements.forEach((shiftDiv) => {
      const rawId = shiftDiv.getAttribute("data-id");
      const triangle = shiftDiv.querySelector(".toggle-button div");
  
      if (rawId != null && st?.collapsedShifts?.add) {
        st.collapsedShifts.add(rawId);
      }
  
      shiftDiv.classList.add("collapsed");
      if (triangle) triangle.className = "triangle-right";
      shiftDiv.setAttribute("aria-expanded", "false");
    });
  
    announceForScreenReader("All shifts collapsed");
  }
  
  // ------------------------------------------------------------
  // Handle keyboard navigation within calendar (UI fallback)
  // Primary handler lives in event-listeners.js
  // ------------------------------------------------------------
  function handleCalendarKeyNavigation(e, currentCell) {
    const els = window.elements || (typeof elements !== "undefined" ? elements : {});
    const allCells = Array.from(els.calendarBody?.querySelectorAll?.("td") || []);
    const currentIndex = allCells.indexOf(currentCell);
  
    if (currentIndex === -1) return;
  
    let nextIndex = currentIndex;
  
    switch (e.key) {
      case "ArrowRight":
        nextIndex = Math.min(currentIndex + 1, allCells.length - 1);
        e.preventDefault();
        break;
      case "ArrowLeft":
        nextIndex = Math.max(currentIndex - 1, 0);
        e.preventDefault();
        break;
      case "ArrowDown":
        nextIndex = Math.min(currentIndex + 7, allCells.length - 1);
        e.preventDefault();
        break;
      case "ArrowUp":
        nextIndex = Math.max(currentIndex - 7, 0);
        e.preventDefault();
        break;
      case "Home":
        nextIndex = currentIndex - (currentIndex % 7);
        e.preventDefault();
        break;
      case "End":
        nextIndex = currentIndex + (6 - (currentIndex % 7));
        e.preventDefault();
        break;
      case "PageUp":
        if (typeof goToPrevMonth === "function") goToPrevMonth();
        e.preventDefault();
        return;
      case "PageDown":
        if (typeof goToNextMonth === "function") goToNextMonth();
        e.preventDefault();
        return;
      default:
        return;
    }
  
    if (nextIndex !== currentIndex && allCells[nextIndex]) {
      allCells[nextIndex].setAttribute("tabindex", "0");
      allCells[nextIndex].focus();
      if (currentCell !== allCells[nextIndex]) currentCell.setAttribute("tabindex", "-1");
    }
  }
  
  // ------------------------------------------------------------
  // IMPORTANT:
  // Do NOT define showSimplifiedWarning(), open/close modal functions,
  // or proceed-override logic in this file.
  // Those live in modal-handlers.js (and drag-drop-handler.js).
  // ------------------------------------------------------------