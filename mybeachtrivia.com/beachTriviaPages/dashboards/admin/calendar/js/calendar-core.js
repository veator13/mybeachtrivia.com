// calendar-core.js
// Core calendar state, data loading, rendering helpers, filters & week utilities
// v2025-11-13 — robust date normalization, safe init, and glue for UI/events.

(function () {
    /* =========================
       Global state & handles
    ========================= */
    const elements = (window.elements ||= {});
  
    // Try a few likely IDs for resilience with older markup
    function q(idOrSel) {
      return (
        document.getElementById(idOrSel) ||
        document.querySelector(idOrSel) ||
        null
      );
    }
  
    function ensureElements() {
      // Calendar table bits
      elements.calendar = elements.calendar || q("calendar");
      elements.calendarBody =
        elements.calendarBody || q("calendar-body") || q("#calendar tbody");
      elements.currentMonthDisplay =
        elements.currentMonthDisplay || q("current-month");
  
      // Filters
      elements.employeeSelect =
        elements.employeeSelect ||
        q("employee-select") ||
        q("host-filter") ||
        q('select[name="employee"]');
      elements.eventSelect =
        elements.eventSelect ||
        q("event-select") ||
        q("event-filter") ||
        q('select[name="event-type"]');
      elements.locationSelect =
        elements.locationSelect ||
        q("location-select") ||
        q("location-filter") ||
        q('select[name="location"]');
  
      // View buttons
      elements.expandAllBtn =
        elements.expandAllBtn || q("expand-all") || q('[data-action="expand"]');
      elements.collapseAllBtn =
        elements.collapseAllBtn ||
        q("collapse-all") ||
        q('[data-action="collapse"]');
  
      // Month nav buttons
      elements.prevBtn =
        elements.prevBtn ||
        q("prev-month") ||
        q("prevBtn") ||
        q('[data-action="prev-month"]');
      elements.nextBtn =
        elements.nextBtn ||
        q("next-month") ||
        q("nextBtn") ||
        q('[data-action="next-month"]');
  
      // Optional cross-month dropzones (owned by calendar-ui.js)
      elements.prevMonthDropzone =
        elements.prevMonthDropzone || q("prev-month-dropzone");
      elements.nextMonthDropzone =
        elements.nextMonthDropzone || q("next-month-dropzone");
  
      return elements;
    }
  
    // Calendar state
    const state = (window.state ||= {
      // Month being shown
      currentYear: new Date().getFullYear(),
      currentMonth: new Date().getMonth(),
      initialLoad: true,
  
      // Filters
      filters: { employee: "all", eventType: "all", location: "all" },
  
      // Expand/Collapse tracking
      collapsedShifts: new Set(),
  
      // Drag state (calendar-ui.js also uses/extends these)
      draggedShiftId: null,
      isDragCopy: false,
      isDragWeekCopy: false,
      isDragWeekMove: false,
      copyingDayShifts: [],
      copyingWeekShifts: [],
      movingWeekShifts: [],
      sourceWeekIndex: null,
      monthNavigationTimer: null,
      isHoveringPrevMonth: false,
      isHoveringNextMonth: false,
      pendingCrossMonthDrag: null,
    });
  
    // Data caches
    window.employees ||= {}; // { id: "Display Name" }
    window.employeesData ||= {}; // { id: {..., displayName, shortDisplayName} }
    window.locationsData ||= {}; // { name: {...} }
    window.shifts ||= []; // [{ id, date:'YYYY-MM-DD', startTime, endTime, ... }]
  
    // Event type labels (fallbacks)
    window.eventTypes ||= {
      "trivia": "Trivia",
      "music-bingo": "Music Bingo",
      "themed-trivia": "Themed Trivia",
      "special-event": "Special Event",
    };
  
    /* =========================
       Date/Time helpers
    ========================= */
    function pad2(n) {
      return String(n).padStart(2, "0");
    }
  
    function formatDate(d) {
      if (!(d instanceof Date)) d = new Date(d);
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
    window.formatDate = window.formatDate || formatDate;
  
    function getReadableDateString(d) {
      try {
        if (!(d instanceof Date)) d = new Date(d);
        return d.toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        });
      } catch {
        return String(d);
      }
    }
    window.getReadableDateString =
      window.getReadableDateString || getReadableDateString;
  
    function isDateToday(d) {
      const now = new Date();
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    }
    window.isDateToday = window.isDateToday || isDateToday;
  
    function getMonthYearString(year, monthIdx) {
      const d = new Date(year, monthIdx, 1);
      return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    }
    window.getMonthYearString =
      window.getMonthYearString || getMonthYearString;
  
    // Normalize any stored date into 'YYYY-MM-DD'
    function normalizeDateField(v) {
      try {
        if (!v) return "";
        if (typeof v === "string") {
          if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
          const d = new Date(v);
          if (!isNaN(d)) return formatDate(d);
          return "";
        }
        if (v && typeof v.toDate === "function") return formatDate(v.toDate()); // Firestore Timestamp
        if (v instanceof Date) return formatDate(v);
        return "";
      } catch {
        return "";
      }
    }
  
    function minutesFromTimeLabel(timeStr) {
      if (!timeStr || typeof timeStr !== "string") return null;
      let s = timeStr.trim().toUpperCase();
  
      // h[:mm] AM/PM
      let m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
      if (m) {
        let h = parseInt(m[1], 10);
        let min = m[2] ? parseInt(m[2], 10) : 0;
        const mer = m[3];
        if (mer === "PM" && h !== 12) h += 12;
        if (mer === "AM" && h === 12) h = 0;
        if (h >= 0 && h < 24 && min >= 0 && min < 60) return h * 60 + min;
        return null;
      }
  
      // 24h "HH:MM" or "HH"
      m = s.match(/^(\d{1,2})(?::(\d{2}))?$/);
      if (m) {
        let h = parseInt(m[1], 10);
        let min = m[2] ? parseInt(m[2], 10) : 0;
        if (h >= 0 && h < 24 && min >= 0 && min < 60) return h * 60 + min;
      }
  
      return null;
    }
  
    /* =========================
       Data loading (Firestore)
    ========================= */
    async function loadEmployeesFromFirebase() {
      console.log("[calendar] Fetching employees...");
      try {
        const qs = await firebase.firestore().collection("employees").get();
        let count = 0;
        qs.forEach((doc) => {
          const d = doc.data() || {};
          const id = doc.id;
          const firstName = (d.firstName || "").trim();
          const lastName = (d.lastName || "").trim();
          const nickname = (d.nickname || "").trim();
          const shortDisplayName = nickname || firstName || "Unknown";
          const fullDisplayName = nickname
            ? `${nickname} (${firstName} ${lastName})`
            : `${firstName} ${lastName}`.trim() || "Unknown";
  
          window.employees[id] = shortDisplayName;
          window.employeesData[id] = {
            ...d,
            id,
            displayName: fullDisplayName,
            shortDisplayName,
          };
          count++;
        });
  
        // Fill the host filter if present
        if (elements.employeeSelect) {
          // Preserve current selection
          const prev = elements.employeeSelect.value;
          elements.employeeSelect.innerHTML = "";
          const optAll = document.createElement("option");
          optAll.value = "all";
          optAll.textContent = "All Hosts";
          elements.employeeSelect.appendChild(optAll);
          Object.entries(window.employeesData).forEach(([id, info]) => {
            const o = document.createElement("option");
            o.value = id;
            o.textContent = info.displayName || window.employees[id] || id;
            elements.employeeSelect.appendChild(o);
          });
          elements.employeeSelect.value = prev || "all";
        }
  
        console.log("[calendar] Employees loaded:", count);
      } catch (err) {
        console.error("[calendar] Employees load error:", err);
      }
    }
  
    async function loadLocationsFromFirebase() {
      console.log("[calendar] Fetching locations...");
      try {
        const qs = await firebase.firestore().collection("locations").get();
        let count = 0;
        window.locationsData = {};
        qs.forEach((doc) => {
          const d = doc.data() || {};
          const id = doc.id;
          const name = d.name || id;
          window.locationsData[name] = { ...d, id };
          count++;
        });
  
        // Fill the location filter if present
        if (elements.locationSelect) {
          const prev = elements.locationSelect.value;
          elements.locationSelect.innerHTML = "";
          const optAll = document.createElement("option");
          optAll.value = "all";
          optAll.textContent = "All Locations";
          elements.locationSelect.appendChild(optAll);
          Object.keys(window.locationsData)
            .sort()
            .forEach((name) => {
              const o = document.createElement("option");
              o.value = name;
              o.textContent = name;
              elements.locationSelect.appendChild(o);
            });
          elements.locationSelect.value = prev || "all";
        }
  
        console.log(
          "[calendar] Locations loaded:",
          Object.keys(window.locationsData).length
        );
      } catch (err) {
        console.error("[calendar] Locations load error:", err);
      }
    }
  
    async function loadShiftsFromFirebase() {
      console.log("[calendar] Fetching shifts...");
      try {
        const qs = await firebase.firestore().collection("shifts").get();
        window.shifts = qs.docs.map((doc) => {
          const d = doc.data() || {};
  
          // Normalize date immediately so downstream is simple
          const dateStr = normalizeDateField(d.date);
  
          return {
            id: doc.id,
            ...d,
            date: dateStr,
          };
        });
  
        // Sort once; day-level render will be relatively stable
        window.shifts.sort((a, b) => {
          if (a.date !== b.date) return a.date < b.date ? -1 : 1;
          const am = minutesFromTimeLabel(a.startTime) ?? -1;
          const bm = minutesFromTimeLabel(b.startTime) ?? -1;
          return am - bm;
        });
  
        console.log("[calendar] Shifts loaded:", window.shifts.length);
      } catch (err) {
        console.error("[calendar] Shifts load error:", err);
      }
    }
  
    async function loadAllBaseData() {
      ensureElements();
      await loadEmployeesFromFirebase();
      await loadLocationsFromFirebase();
      await loadShiftsFromFirebase();
      console.log("[calendar] All base data loaded, initializing UI...");
    }
  
    /* =========================
       Rendering (month grid)
    ========================= */
  
    // --- API used by calendar-ui.js's renderCurrentMonthDay ---
    function getShiftsForDate(dateStr) {
      return (window.shifts || []).filter(
        (shift) => normalizeDateField(shift.date) === dateStr
      );
    }
    window.getShiftsForDate = getShiftsForDate;
  
    // The following functions are referenced in the user’s calendar-ui.js
    function renderPreviousMonthDay(cell, startingDayOfWeek, dayIndex) {
      cell.classList.add("other-month");
      const prevMonthLastDay = new Date(
        state.currentYear,
        state.currentMonth,
        0
      ).getDate();
      const prevDate = prevMonthLastDay - (startingDayOfWeek - dayIndex - 1);
      cell.innerHTML = `<div class="date">${prevDate}</div>`;
    }
    window.renderPreviousMonthDay =
      window.renderPreviousMonthDay || renderPreviousMonthDay;
  
    function renderNextMonthDay(cell, date, daysInMonth) {
      cell.classList.add("other-month");
      const nextDate = date - daysInMonth;
      cell.innerHTML = `<div class="date">${nextDate}</div>`;
    }
    window.renderNextMonthDay =
      window.renderNextMonthDay || renderNextMonthDay;
  
    function populateShifts(container, dateStr) {
      if (!container) return;
      try {
        const dayShifts = getShiftsForDate(dateStr);
        if (dayShifts.length === 0) return;
  
        // Apply filters and append
        const frag = document.createDocumentFragment();
        for (const shift of dayShifts) {
          const passEmployee =
            state.filters.employee === "all" ||
            state.filters.employee === shift.employeeId;
          const passType =
            state.filters.eventType === "all" ||
            state.filters.eventType === shift.type;
          const passLoc =
            state.filters.location === "all" ||
            state.filters.location === shift.location;
  
          if (!(passEmployee && passType && passLoc)) continue;
  
          const node =
            typeof window.createShiftElement === "function"
              ? window.createShiftElement(shift)
              : null;
          if (node) frag.appendChild(node);
        }
        container.appendChild(frag);
      } catch (err) {
        console.error("Error populating shifts:", err);
      }
    }
    window.populateShifts = window.populateShifts || populateShifts;
  
    function renderCurrentMonthDay(cell, date) {
      const dateObj = new Date(state.currentYear, state.currentMonth, date);
      const dateStr = formatDate(dateObj);
      const today = isDateToday(dateObj);
      const dateClass = today ? "date today" : "date";
  
      cell.innerHTML = `
        <div class="${dateClass}" aria-label="${getReadableDateString(dateObj)}">
          ${date}
          <span class="cell-copy-button" data-date="${dateStr}" tabindex="0" role="button" aria-label="Copy button for ${getReadableDateString(
        dateObj
      )}" draggable="true">⧉</span>
          <span class="clear-day-button" data-date="${dateStr}" tabindex="0" role="button" aria-label="Clear all events on ${getReadableDateString(
        dateObj
      )}">×</span>
          <span class="drag-day-button" data-date="${dateStr}" tabindex="0" role="button" aria-label="Drag all events on ${getReadableDateString(
        dateObj
      )}" draggable="true">✥</span>
          <span class="add-button" data-date="${dateStr}" tabindex="0" role="button" aria-label="Add event on ${getReadableDateString(
        dateObj
      )}">+</span>
        </div>
        <div class="shift-container" id="shifts-${dateStr}" data-date="${dateStr}"></div>
      `;
  
      cell.setAttribute("data-date", dateStr);
      if (today) {
        cell.classList.add("today-cell");
        cell.setAttribute("tabindex", "0");
      }
      populateShifts(cell.querySelector(".shift-container"), dateStr);
    }
    window.renderCurrentMonthDay =
      window.renderCurrentMonthDay || renderCurrentMonthDay;
  
    function handleFilterChange() {
      ensureElements();
      state.filters.employee = elements.employeeSelect?.value || "all";
      state.filters.eventType = elements.eventSelect?.value || "all";
      state.filters.location = elements.locationSelect?.value || "all";
      // calendar-ui.js supplies renderCalendar()
      if (typeof window.renderCalendar === "function") {
        window.renderCalendar();
      }
    }
    window.handleFilterChange = window.handleFilterChange || handleFilterChange;
  
    /* =========================
       Week helpers (used by UI)
    ========================= */
    function getShiftsForWeek(weekIndex) {
      const row = document.querySelector(`tr[data-week-index="${weekIndex}"]`);
      if (!row) return [];
      const dateCells = Array.from(
        row.querySelectorAll("td:not(.week-copy-cell)")
      );
      const weekDates = dateCells
        .map((c) => c.getAttribute("data-date"))
        .filter(Boolean);
  
      const out = [];
      for (const dateStr of weekDates) {
        const day = getShiftsForDate(dateStr).filter((shift) => {
          const passEmployee =
            state.filters.employee === "all" ||
            state.filters.employee === shift.employeeId;
          const passType =
            state.filters.eventType === "all" ||
            state.filters.eventType === shift.type;
          const passLoc =
            state.filters.location === "all" ||
            state.filters.location === shift.location;
          return passEmployee && passType && passLoc;
        });
        out.push(...day);
      }
      return out;
    }
    window.getShiftsForWeek = window.getShiftsForWeek || getShiftsForWeek;
  
    function isWeekFullyCollapsed(weekIndex) {
      const weekShifts = getShiftsForWeek(weekIndex);
      if (weekShifts.length === 0) return false;
      return weekShifts.every((s) => state.collapsedShifts.has(String(s.id)));
    }
    window.isWeekFullyCollapsed =
      window.isWeekFullyCollapsed || isWeekFullyCollapsed;
  
    function isWeekEmpty(weekIndex) {
      return getShiftsForWeek(weekIndex).length === 0;
    }
    window.isWeekEmpty = window.isWeekEmpty || isWeekEmpty;
  
    function getWeekDateMapping(sourceWeekIndex, targetWeekIndex) {
      const sRow = document.querySelector(`tr[data-week-index="${sourceWeekIndex}"]`);
      const tRow = document.querySelector(`tr[data-week-index="${targetWeekIndex}"]`);
      if (!sRow || !tRow) return null;
      const sCells = Array.from(sRow.querySelectorAll("td:not(.week-copy-cell)"));
      const tCells = Array.from(tRow.querySelectorAll("td:not(.week-copy-cell)"));
      if (sCells.length !== 7 || tCells.length !== 7) return null;
  
      const map = {};
      for (let i = 0; i < 7; i++) {
        const sDate = sCells[i].getAttribute("data-date");
        const tDate = tCells[i].getAttribute("data-date");
        if (sDate && tDate) map[sDate] = tDate;
      }
      return map;
    }
    window.getWeekDateMapping =
      window.getWeekDateMapping || getWeekDateMapping;
  
    function getCrossMonthWeekDateMapping(targetWeekIndex) {
      const tRow = document.querySelector(`tr[data-week-index="${targetWeekIndex}"]`);
      if (!tRow) return null;
  
      const tCells = Array.from(tRow.querySelectorAll("td:not(.week-copy-cell)"));
      if (tCells.length !== 7) return null;
  
      const sourceShifts = state.isDragWeekMove
        ? state.movingWeekShifts
        : state.copyingWeekShifts;
      if (!sourceShifts || sourceShifts.length === 0) return null;
  
      const targetDates = tCells
        .map((c) => c.getAttribute("data-date"))
        .filter(Boolean)
        .map((dateStr) => ({
          dateStr,
          dow: new Date(dateStr).getDay(),
        }));
  
      const map = {};
      for (const s of sourceShifts) {
        const d = new Date(s.date);
        const dow = d.getDay();
        const match = targetDates.find((x) => x.dow === dow);
        if (match) map[s.date] = match.dateStr;
      }
      return map;
    }
    window.getCrossMonthWeekDateMapping =
      window.getCrossMonthWeekDateMapping || getCrossMonthWeekDateMapping;
  
    /* =========================
       Month navigation (delegates)
    ========================= */
    function goToPrevMonth(preserveDragState = false) {
      if (typeof window.hideMonthNavigationDropzones === "function" && !preserveDragState) {
        window.hideMonthNavigationDropzones();
      }
      if (!preserveDragState) {
        state.draggedShiftId = null;
        state.isDragCopy = false;
        state.isDragWeekCopy = false;
        state.isDragWeekMove = false;
        state.copyingDayShifts = [];
        state.copyingWeekShifts = [];
        state.movingWeekShifts = [];
        state.sourceWeekIndex = null;
        state.pendingCrossMonthDrag = null;
        clearTimeout(state.monthNavigationTimer);
        state.isHoveringPrevMonth = false;
        state.isHoveringNextMonth = false;
      }
  
      state.currentMonth--;
      if (state.currentMonth < 0) {
        state.currentMonth = 11;
        state.currentYear--;
      }
  
      if (typeof window.renderCalendar === "function") {
        window.renderCalendar();
        if (!preserveDragState && typeof window.hideMonthNavigationDropzones === "function") {
          setTimeout(window.hideMonthNavigationDropzones, 100);
        }
      }
    }
    window.goToPrevMonth = window.goToPrevMonth || goToPrevMonth;
  
    function goToNextMonth(preserveDragState = false) {
      if (typeof window.hideMonthNavigationDropzones === "function" && !preserveDragState) {
        window.hideMonthNavigationDropzones();
      }
      if (!preserveDragState) {
        state.draggedShiftId = null;
        state.isDragCopy = false;
        state.isDragWeekCopy = false;
        state.isDragWeekMove = false;
        state.copyingDayShifts = [];
        state.copyingWeekShifts = [];
        state.movingWeekShifts = [];
        state.sourceWeekIndex = null;
        state.pendingCrossMonthDrag = null;
        clearTimeout(state.monthNavigationTimer);
        state.isHoveringPrevMonth = false;
        state.isHoveringNextMonth = false;
      }
  
      state.currentMonth++;
      if (state.currentMonth > 11) {
        state.currentMonth = 0;
        state.currentYear++;
      }
  
      if (typeof window.renderCalendar === "function") {
        window.renderCalendar();
        if (!preserveDragState && typeof window.hideMonthNavigationDropzones === "function") {
          setTimeout(window.hideMonthNavigationDropzones, 100);
        }
      }
    }
    window.goToNextMonth = window.goToNextMonth || goToNextMonth;
  
    function handleCrossMonthDragNavigation(direction) {
      console.log(`Navigating to ${direction} month during drag operation`);
      const pending = {
        draggedShiftId: state.draggedShiftId,
        isDragCopy: state.isDragCopy,
        isDragWeekCopy: state.isDragWeekCopy,
        isDragWeekMove: state.isDragWeekMove,
        copyingDayShifts: [...state.copyingDayShifts],
        copyingWeekShifts: [...state.copyingWeekShifts],
        movingWeekShifts: [...state.movingWeekShifts],
        sourceWeekIndex: state.sourceWeekIndex,
        sourceMonth: state.currentMonth,
        sourceYear: state.currentYear,
      };
      state.pendingCrossMonthDrag = pending;
  
      if ((state.isDragWeekCopy || state.isDragWeekMove) &&
          (state.copyingWeekShifts.length > 0 || state.movingWeekShifts.length > 0)) {
        const sourceDates = state.isDragWeekCopy
          ? state.copyingWeekShifts.map((s) => s.date)
          : state.movingWeekShifts.map((s) => s.date);
        state.pendingCrossMonthDrag.sourceDates = sourceDates;
      }
  
      elements.prevMonthDropzone?.classList.remove("active");
      elements.nextMonthDropzone?.classList.remove("active");
  
      if (direction === "prev") goToPrevMonth(true);
      else goToNextMonth(true);
  
      if (typeof window.announceForScreenReader === "function") {
        window.announceForScreenReader(
          `Moved to ${direction === "prev" ? "previous" : "next"} month while dragging. Continue to drag to desired date.`
        );
      }
  
      setTimeout(() => {
        state.draggedShiftId = pending.draggedShiftId;
        state.isDragCopy = pending.isDragCopy;
        state.isDragWeekCopy = pending.isDragWeekCopy;
        state.isDragWeekMove = pending.isDragWeekMove;
        state.copyingDayShifts = pending.copyingDayShifts;
        state.copyingWeekShifts = pending.copyingWeekShifts;
        state.movingWeekShifts = pending.movingWeekShifts;
        state.sourceWeekIndex = pending.sourceWeekIndex;
        state.isHoveringPrevMonth = false;
        state.isHoveringNextMonth = false;
      }, 50);
    }
    window.handleCrossMonthDragNavigation =
      window.handleCrossMonthDragNavigation || handleCrossMonthDragNavigation;
  
    /* =========================
       Attach events (light)
    ========================= */
    function attachEventListeners() {
      ensureElements();
  
      // Filters
      elements.employeeSelect?.addEventListener("change", handleFilterChange);
      elements.eventSelect?.addEventListener("change", handleFilterChange);
      elements.locationSelect?.addEventListener("change", handleFilterChange);
  
      // Expand/collapse
      elements.expandAllBtn?.addEventListener("click", () => {
        if (typeof window.expandAllShifts === "function") window.expandAllShifts();
      });
      elements.collapseAllBtn?.addEventListener("click", () => {
        if (typeof window.collapseAllShifts === "function")
          window.collapseAllShifts();
      });
  
      // Month nav
      elements.prevBtn?.addEventListener("click", () => goToPrevMonth(false));
      elements.nextBtn?.addEventListener("click", () => goToNextMonth(false));
    }
    window.attachEventListeners =
      window.attachEventListeners || attachEventListeners;
  
    /* =========================
       Init (safe)
    ========================= */
    function initCalendar() {
      ensureElements();
      try {
        // UI helpers from calendar-ui.js (guard if not present)
        if (typeof window.populateTimeDropdowns === "function")
          window.populateTimeDropdowns();
        if (typeof window.setupAccessibilitySupport === "function")
          window.setupAccessibilitySupport();
  
        if (typeof window.renderCalendar === "function") window.renderCalendar();
        attachEventListeners();
  
        if (typeof window.setupMonthNavigationDropzones === "function")
          window.setupMonthNavigationDropzones();
      } catch (error) {
        console.error("Error initializing calendar:", error);
        if (elements.calendarBody) {
          elements.calendarBody.innerHTML =
            '<tr><td colspan="7">Calendar could not be loaded. Please refresh the page.</td></tr>';
        }
      }
    }
    window.initCalendar = window.initCalendar || initCalendar;
  
    async function boot() {
      // Wait for Firebase auth elsewhere; here we just fetch once DOM is ready
      await loadAllBaseData();
  
      // Month caption
      if (elements.currentMonthDisplay) {
        elements.currentMonthDisplay.textContent = getMonthYearString(
          state.currentYear,
          state.currentMonth
        );
      }
  
      initCalendar();
  
      // After first render, focus today
      if (state.initialLoad && typeof window.focusTodayCell === "function") {
        setTimeout(() => {
          window.focusTodayCell?.();
          state.initialLoad = false;
        }, 100);
      }
    }
  
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  })();