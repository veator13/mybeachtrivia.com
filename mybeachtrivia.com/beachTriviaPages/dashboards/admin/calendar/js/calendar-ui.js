// js/calendar-ui.js
// UI for month grid, shift rendering, drag-move, and accessibility
// v2025-11-13 — aligns with modal-handlers.js override flow, fixes ARIA,
// adds month-grid fallback builder, month-nav dropzones, robust render + drag/drop.

(() => {
    /* =========================
       Globals & Safe Handles
    ========================= */
    const elements = (window.elements ||= {});
    const state = (window.state ||= {
      // visibleMonth is the first of the month currently shown
      visibleMonth: null,
      collapsedShifts: new Set(),
      // drag state
      isDragging: false,
      dragShiftId: null,
      dragOriginDate: null,
    });
  
    // Tiny DOM helpers
    const $ = (sel, root = document) => root.querySelector(sel);
    const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  
    // Expose a consistent announcer used across files (modal-handlers.js will use this if present)
    function announceForScreenReader(message) {
      try {
        if (typeof window._srAnnouncer === 'function') return window._srAnnouncer(message);
        let live = document.getElementById('calendar-announcer');
        if (!live) {
          live = document.createElement('div');
          live.id = 'calendar-announcer';
          live.setAttribute('aria-live', 'polite');
          live.classList.add('sr-only');
          document.body.appendChild(live);
        }
        // force text change even if same string
        live.textContent = '';
        setTimeout(() => (live.textContent = String(message || '')), 1);
      } catch (_) {}
    }
    window.announceForScreenReader = window.announceForScreenReader || announceForScreenReader;
  
    function escapeHTML(s) {
      return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
  
    /* =========================
       Elements bootstrap
    ========================= */
    function ensureElements() {
      // Core calendar shell
      elements.calendar = elements.calendar || $('#calendar');
      // Support either <tbody id="calendar-body"> or <div id="calendar-body">
      elements.calendarBody =
        elements.calendarBody || $('#calendar-body') || $('#calendar tbody') || $('.calendar-body');
  
      // Month label
      elements.currentMonthLabel = elements.currentMonthLabel || $('#current-month');
  
      // Forms & inputs used by create/edit (kept here for helpers)
      elements.shiftModal = elements.shiftModal || $('#shift-modal');
      elements.modalTitle = elements.modalTitle || $('#modal-title');
      elements.shiftForm = elements.shiftForm || $('#shift-form');
      elements.themeField = elements.themeField || $('#theme-field');
      elements.shiftDateInput = elements.shiftDateInput || $('#shift-date');
      elements.startTimeSelect = elements.startTimeSelect || $('#start-time');
      elements.endTimeSelect = elements.endTimeSelect || $('#end-time');
      elements.shiftEmployeeSelect = elements.shiftEmployeeSelect || $('#shift-employee');
      elements.shiftTypeSelect = elements.shiftTypeSelect || $('#shift-type');
      elements.shiftThemeInput = elements.shiftThemeInput || $('#shift-theme');
      elements.shiftLocationSelect = elements.shiftLocationSelect || $('#shift-location');
      elements.shiftNotesInput = elements.shiftNotesInput || $('#shift-notes');
      elements.submitButton = elements.submitButton || $('#submit-shift');
  
      // Month navigation dropzones (appear at left/right edges during drag)
      elements.prevMonthDropzone = elements.prevMonthDropzone || $('#prev-month-dropzone');
      elements.nextMonthDropzone = elements.nextMonthDropzone || $('#next-month-dropzone');
  
      // Warning modal (content is managed by modal-handlers.js)
      elements.warningModal = elements.warningModal || $('#warning-modal');
      elements.warningText = elements.warningText || $('#warning-text');
      elements.conflictDetails = elements.conflictDetails || $('#conflict-details');
      elements.cancelBookingBtn = elements.cancelBookingBtn || $('#cancel-booking');
  
      return elements;
    }
  
    /* =========================
       Date helpers
    ========================= */
    function formatYMD(d) {
      if (!(d instanceof Date)) d = new Date(d);
      const y = d.getFullYear();
      const m = `${d.getMonth() + 1}`.padStart(2, '0');
      const da = `${d.getDate()}`.padStart(2, '0');
      return `${y}-${m}-${da}`;
    }
  
    function parseYMD(s) {
      // s in YYYY-MM-DD
      const [y, m, d] = String(s).split('-').map(n => parseInt(n, 10));
      return new Date(y, (m || 1) - 1, d || 1);
    }
  
    function monthStart(d) {
      if (!(d instanceof Date)) d = new Date(d);
      return new Date(d.getFullYear(), d.getMonth(), 1);
    }
  
    function gridStartSunday(d) {
      const first = monthStart(d);
      const delta = first.getDay(); // 0=Sun
      const start = new Date(first);
      start.setDate(first.getDate() - delta);
      return start;
    }
  
    function ensureVisibleMonthFromDOMOrToday() {
      if (state.visibleMonth instanceof Date) return;
      const firstCell = $('.shift-container[data-date]');
      if (firstCell) {
        state.visibleMonth = monthStart(parseYMD(firstCell.getAttribute('data-date')));
      } else {
        const now = new Date();
        state.visibleMonth = monthStart(now);
      }
    }
  
    /* =========================
       Visible range + month label
    ========================= */
    function getVisibleRangeFromDOM() {
      const dates = $all('.shift-container[data-date]')
        .map(n => n.getAttribute('data-date'))
        .filter(Boolean)
        .sort();
      if (!dates.length) return null;
      return { start: dates[0], end: dates[dates.length - 1] };
    }
  
    function setMonthLabel(dateObj) {
      if (!elements.currentMonthLabel) return;
      const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
      const fmt = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      elements.currentMonthLabel.textContent = fmt;
    }
  
    function setMonthLabelFromAnyVisibleCell() {
      const firstCell = $('.shift-container[data-date]');
      const d = firstCell ? parseYMD(firstCell.getAttribute('data-date')) : state.visibleMonth || new Date();
      setMonthLabel(d);
    }
  
    /* =========================
       Month GRID (Fallback Builder)
       — If the server/loader didn't inject day cells, we create a 6x7 grid
         with .shift-container[data-date] buckets so shifts can render.
    ========================= */
    function clearCalendarBody() {
      if (!elements.calendarBody) return;
      elements.calendarBody.innerHTML = '';
    }
  
    function isTableBody(el) {
      return el && el.tagName && el.tagName.toLowerCase() === 'tbody';
    }
  
    function ensureMonthGrid() {
      ensureElements();
      if (!elements.calendarBody) return;
  
      // If we already have day buckets, do nothing
      const haveBuckets = !!$('.shift-container[data-date]');
      if (haveBuckets) return;
  
      ensureVisibleMonthFromDOMOrToday();
      const vm = state.visibleMonth;
      setMonthLabel(vm);
  
      const start = gridStartSunday(vm);
  
      clearCalendarBody();
  
      if (isTableBody(elements.calendarBody)) {
        // Build rows in <tbody>
        for (let r = 0; r < 6; r++) {
          const tr = document.createElement('tr');
          for (let c = 0; c < 7; c++) {
            const d = new Date(start);
            d.setDate(start.getDate() + r * 7 + c);
            const ymd = formatYMD(d);
  
            const td = document.createElement('td');
            td.className = 'day-cell';
  
            const head = document.createElement('div');
            head.className = 'day-number';
            head.textContent = String(d.getDate());
  
            const bucket = document.createElement('div');
            bucket.className = 'shift-container';
            bucket.setAttribute('data-date', ymd);
  
            td.appendChild(head);
            td.appendChild(bucket);
            tr.appendChild(td);
          }
          elements.calendarBody.appendChild(tr);
        }
      } else {
        // Build div-based grid
        for (let i = 0; i < 42; i++) {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          const ymd = formatYMD(d);
  
          const cell = document.createElement('div');
          cell.className = 'day-cell';
  
          const head = document.createElement('div');
          head.className = 'day-number';
          head.textContent = String(d.getDate());
  
          const bucket = document.createElement('div');
          bucket.className = 'shift-container';
          bucket.setAttribute('data-date', ymd);
  
          cell.appendChild(head);
          cell.appendChild(bucket);
          elements.calendarBody.appendChild(cell);
        }
      }
    }
  
    /* =========================
       Month navigation
    ========================= */
    function goToPrevMonth() {
      ensureElements();
      try {
        // Prefer server/loader if available
        if (typeof window.loadMonth === 'function') {
          const d = state.visibleMonth || new Date();
          const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
          window.loadMonth(prev.getFullYear(), prev.getMonth());
        } else {
          ensureVisibleMonthFromDOMOrToday();
          state.visibleMonth = new Date(state.visibleMonth.getFullYear(), state.visibleMonth.getMonth() - 1, 1);
          ensureMonthGrid();
          renderCalendar(); // will populate shifts if window.shifts already set
        }
      } catch (e) {
        console.warn('goToPrevMonth failed:', e);
      }
    }
  
    function goToNextMonth() {
      ensureElements();
      try {
        if (typeof window.loadMonth === 'function') {
          const d = state.visibleMonth || new Date();
          const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
          window.loadMonth(next.getFullYear(), next.getMonth());
        } else {
          ensureVisibleMonthFromDOMOrToday();
          state.visibleMonth = new Date(state.visibleMonth.getFullYear(), state.visibleMonth.getMonth() + 1, 1);
          ensureMonthGrid();
          renderCalendar();
        }
      } catch (e) {
        console.warn('goToNextMonth failed:', e);
      }
    }
  
    window.goToPrevMonth = window.goToPrevMonth || goToPrevMonth;
    window.goToNextMonth = window.goToNextMonth || goToNextMonth;
  
    /* =========================
       Month navigation dropzones
    ========================= */
    function setupMonthNavigationDropzones() {
      ensureElements();
      hideMonthNavigationDropzones();
  
      if (!elements.calendar) return;
  
      elements.calendar.addEventListener('dragstart', () => {
        state.isDragging = true;
        if (elements.prevMonthDropzone) {
          elements.prevMonthDropzone.style.display = 'flex';
          requestAnimationFrame(() => (elements.prevMonthDropzone.style.opacity = '1'));
        }
        if (elements.nextMonthDropzone) {
          elements.nextMonthDropzone.style.display = 'flex';
          requestAnimationFrame(() => (elements.nextMonthDropzone.style.opacity = '1'));
        }
      });
  
      elements.calendar.addEventListener('dragend', () => {
        state.isDragging = false;
        hideMonthNavigationDropzones();
      });
  
      if (elements.prevMonthDropzone) {
        elements.prevMonthDropzone.addEventListener('dragover', e => e.preventDefault());
        elements.prevMonthDropzone.addEventListener('drop', e => {
          e.preventDefault();
          goToPrevMonth();
          hideMonthNavigationDropzones();
        });
      }
      if (elements.nextMonthDropzone) {
        elements.nextMonthDropzone.addEventListener('dragover', e => e.preventDefault());
        elements.nextMonthDropzone.addEventListener('drop', e => {
          e.preventDefault();
          goToNextMonth();
          hideMonthNavigationDropzones();
        });
      }
    }
  
    function hideMonthNavigationDropzones() {
      ensureElements();
      try {
        if (elements.prevMonthDropzone) {
          elements.prevMonthDropzone.style.display = 'none';
          elements.prevMonthDropzone.style.opacity = '0';
          elements.prevMonthDropzone.classList.remove('active');
        }
        if (elements.nextMonthDropzone) {
          elements.nextMonthDropzone.style.display = 'none';
          elements.nextMonthDropzone.style.opacity = '0';
          elements.nextMonthDropzone.classList.remove('active');
        }
      } catch (error) {
        console.error('Error hiding month navigation dropzones:', error);
      }
    }
  
    window.setupMonthNavigationDropzones = setupMonthNavigationDropzones;
    window.hideMonthNavigationDropzones = hideMonthNavigationDropzones;
  
    /* =========================
       Accessibility helpers
    ========================= */
    function setupAccessibilitySupport() {
      // Add the announcer (shared with modal-handlers)
      announceForScreenReader('Calendar loaded');
  
      if (!document.getElementById('keyboard-instructions')) {
        const instructions = document.createElement('div');
        instructions.id = 'keyboard-instructions';
        instructions.classList.add('sr-only');
        instructions.textContent =
          'Use arrow keys to navigate the calendar, Enter to select a date, Escape to close dialogs.';
        document.body.appendChild(instructions);
      }
    }
    window.setupAccessibilitySupport = setupAccessibilitySupport;
  
    function focusTodayCell() {
      const todayCell = elements.calendarBody?.querySelector('td[tabindex="0"]');
      todayCell?.focus();
    }
    window.focusTodayCell = window.focusTodayCell || focusTodayCell;
  
    function handleCalendarKeyNavigation(e, currentCell) {
      if (!elements.calendarBody) return;
      const allCells = Array.from(elements.calendarBody.querySelectorAll('td'));
      const currentIndex = allCells.indexOf(currentCell);
      if (currentIndex === -1) return;
  
      let nextIndex = currentIndex;
      switch (e.key) {
        case 'ArrowRight':
          nextIndex = Math.min(currentIndex + 1, allCells.length - 1);
          e.preventDefault();
          break;
        case 'ArrowLeft':
          nextIndex = Math.max(currentIndex - 1, 0);
          e.preventDefault();
          break;
        case 'ArrowDown':
          nextIndex = Math.min(currentIndex + 7, allCells.length - 1);
          e.preventDefault();
          break;
        case 'ArrowUp':
          nextIndex = Math.max(currentIndex - 7, 0);
          e.preventDefault();
          break;
        case 'Home':
          nextIndex = currentIndex - (currentIndex % 7);
          e.preventDefault();
          break;
        case 'End':
          nextIndex = currentIndex + (6 - (currentIndex % 7));
          e.preventDefault();
          break;
        case 'PageUp':
          goToPrevMonth();
          e.preventDefault();
          return;
        case 'PageDown':
          goToNextMonth();
          e.preventDefault();
          return;
        default:
          return;
      }
  
      if (nextIndex !== currentIndex && allCells[nextIndex]) {
        allCells[nextIndex].setAttribute('tabindex', '0');
        allCells[nextIndex].focus();
        if (currentCell !== allCells[nextIndex]) {
          currentCell.setAttribute('tabindex', '-1');
        }
      }
    }
    window.handleCalendarKeyNavigation = handleCalendarKeyNavigation;
  
    /* =========================
       Time options / form helpers
    ========================= */
    function generateTimeOptions() {
      const times = [];
      for (let hour = 0; hour < 24; hour++) {
        for (let q = 0; q < 4; q++) {
          const m = q * 15;
          const h12 = hour % 12 || 12;
          const ampm = hour < 12 ? 'AM' : 'PM';
          times.push(`${h12}:${String(m).padStart(2, '0')} ${ampm}`);
        }
      }
      return times;
    }
  
    function populateTimeDropdowns() {
      ensureElements();
      if (!elements.startTimeSelect || !elements.endTimeSelect) return;
  
      const timeOptions = generateTimeOptions();
      const startFragment = document.createDocumentFragment();
      const endFragment = document.createDocumentFragment();
  
      const sDef = document.createElement('option');
      sDef.value = '';
      sDef.textContent = 'Select';
      startFragment.appendChild(sDef);
      const eDef = document.createElement('option');
      eDef.value = '';
      eDef.textContent = 'Select';
      endFragment.appendChild(eDef);
  
      timeOptions.forEach(time => {
        const o1 = document.createElement('option');
        o1.value = time;
        o1.textContent = time;
        startFragment.appendChild(o1);
  
        const o2 = document.createElement('option');
        o2.value = time;
        o2.textContent = time;
        endFragment.appendChild(o2);
      });
  
      elements.startTimeSelect.innerHTML = '';
      elements.endTimeSelect.innerHTML = '';
      elements.startTimeSelect.appendChild(startFragment);
      elements.endTimeSelect.appendChild(endFragment);
    }
  
    function toggleThemeField() {
      ensureElements();
      if (!elements.shiftTypeSelect) return;
      const themed = elements.shiftTypeSelect.value === 'themed-trivia';
      if (elements.themeField) elements.themeField.style.display = themed ? 'block' : 'none';
      if (elements.shiftThemeInput) {
        if (themed) elements.shiftThemeInput.setAttribute('required', 'required');
        else {
          elements.shiftThemeInput.removeAttribute('required');
          elements.shiftThemeInput.value = '';
        }
      }
    }
  
    function autoSelectEndTime() {
      ensureElements();
      if (!elements.startTimeSelect || !elements.endTimeSelect || !elements.startTimeSelect.value) return;
      const startIdx = elements.startTimeSelect.selectedIndex;
      const endIdx = Math.min(startIdx + 8, elements.endTimeSelect.options.length - 1); // +2h
      elements.endTimeSelect.selectedIndex = endIdx;
    }
  
    function validateShiftForm() {
      ensureElements();
      if (!elements.shiftDateInput?.value) { alert('Please select a date for the event.'); elements.shiftDateInput?.focus(); return false; }
      if (!elements.shiftEmployeeSelect?.value) { alert('Please select a host for the event.'); elements.shiftEmployeeSelect?.focus(); return false; }
      if (!elements.startTimeSelect?.value) { alert('Please select a start time for the event.'); elements.startTimeSelect?.focus(); return false; }
      if (!elements.endTimeSelect?.value) { alert('Please select an end time for the event.'); elements.endTimeSelect?.focus(); return false; }
      if (!elements.shiftTypeSelect?.value) { alert('Please select an event type.'); elements.shiftTypeSelect?.focus(); return false; }
      if (elements.shiftTypeSelect.value === 'themed-trivia' && !elements.shiftThemeInput?.value.trim()) {
        alert('Please enter a theme for the themed trivia event.');
        elements.shiftThemeInput?.focus();
        return false;
      }
      if (!elements.shiftLocationSelect?.value) { alert('Please select a location for the event.'); elements.shiftLocationSelect?.focus(); return false; }
      return true;
    }
  
    // Used by modal-handlers.js default-time selection
    function getDefaultTimes() {
      // Reasonable defaults: 7:00 PM → 9:00 PM
      return { start: '7:00 PM', end: '9:00 PM' };
    }
  
    window.populateTimeDropdowns = window.populateTimeDropdowns || populateTimeDropdowns;
    window.generateTimeOptions = window.generateTimeOptions || generateTimeOptions;
    window.toggleThemeField = window.toggleThemeField || toggleThemeField;
    window.autoSelectEndTime = window.autoSelectEndTime || autoSelectEndTime;
    window.validateShiftForm = window.validateShiftForm || validateShiftForm;
    window.getDefaultTimes = window.getDefaultTimes || getDefaultTimes;
  
    /* =========================
       Rendering
    ========================= */
    function clearRenderedShifts() {
      // Remove any existing .shift under each day container
      $all('.shift-container[data-date]').forEach(c => {
        $all('.shift', c).forEach(n => n.remove());
      });
    }
  
    function getHostDisplayName(empId) {
      try {
        if (window.employeesData && window.employeesData[empId]?.displayName) {
          return window.employeesData[empId].displayName;
        }
        if (window.employees && window.employees[empId]) {
          return window.employees[empId];
        }
      } catch (_) {}
      return 'Unknown Host';
    }
  
    function getTypeDisplayName(type) {
      try {
        if (window.eventTypes && window.eventTypes[type]) return window.eventTypes[type];
      } catch (_) {}
      return type || 'Event';
    }
  
    function createShiftElement(shift) {
      try {
        const shiftDiv = document.createElement('div');
        shiftDiv.classList.add('shift', shift.type);
        if (state.collapsedShifts.has(String(shift.id))) {
          shiftDiv.classList.add('collapsed');
        }
  
        shiftDiv.setAttribute('data-id', String(shift.id));
        shiftDiv.setAttribute('draggable', 'true');
        shiftDiv.setAttribute('tabindex', '0');
        shiftDiv.setAttribute('role', 'button');
  
        const hostName = getHostDisplayName(shift.employeeId);
        const eventNameBase = getTypeDisplayName(shift.type);
        const withTheme = shift.type === 'themed-trivia' && shift.theme ? `${eventNameBase}: ${shift.theme}` : eventNameBase;
  
        // Count shifts this host has for that date
        const allShifts = Array.isArray(window.shifts) ? window.shifts : [];
        const hostShiftsOnDay = allShifts.filter(s => s.date === shift.date && s.employeeId === shift.employeeId);
        const hasMultipleShifts = hostShiftsOnDay.length > 1;
  
        shiftDiv.setAttribute(
          'aria-label',
          `${eventNameBase} with ${hostName} from ${shift.startTime} to ${shift.endTime} at ${shift.location}${hasMultipleShifts ? `. Host has ${hostShiftsOnDay.length} shifts this day.` : ''}`
        );
        shiftDiv.setAttribute('aria-expanded', (!state.collapsedShifts.has(String(shift.id))).toString());
  
        const contentHTML = `
          <div class="employee">${escapeHTML(hostName)}</div>
          <div class="time">${escapeHTML(shift.startTime)} - ${escapeHTML(shift.endTime)}</div>
          <div class="location">${escapeHTML(shift.location)}</div>
          <div class="event-type">${escapeHTML(withTheme)}</div>
          <span class="copy-button" data-id="${escapeHTML(shift.id)}" role="button" aria-label="Copy event" tabindex="0" draggable="true"><i class="copy-icon" draggable="true">⧉</i></span>
          <span class="toggle-button" data-id="${escapeHTML(shift.id)}" role="button" aria-label="Toggle details" tabindex="0">
            <div class="${state.collapsedShifts.has(String(shift.id)) ? 'triangle-right' : 'triangle-down'}"></div>
          </span>
          <span class="delete-button" data-id="${escapeHTML(shift.id)}" role="button" aria-label="Delete event" tabindex="0">×</span>
        `;
        shiftDiv.innerHTML = contentHTML;
  
        if (hasMultipleShifts) {
          const badgeWrapper = document.createElement('div');
          badgeWrapper.className = 'controls';
          const badgeInner = document.createElement('div');
          badgeInner.className = 'badge-wrapper';
          const badge = document.createElement('div');
          badge.className = 'multi-shift-badge';
          badge.textContent = `${hostShiftsOnDay.length}x`;
          badgeInner.appendChild(badge);
          badgeWrapper.appendChild(badgeInner);
          shiftDiv.appendChild(badgeWrapper);
        }
  
        // Debug output (seen in prior logs)
        console.log('Created shift element:', shiftDiv);
        return shiftDiv;
      } catch (err) {
        console.error('Error creating shift element:', err, shift);
        return null;
      }
    }
  
    function getDayContainer(dateYMD) {
      return document.querySelector(`.shift-container[data-date="${dateYMD}"]`);
    }
  
    function renderCalendar() {
      ensureElements();
  
      // If there is no grid, build one (fallback).
      ensureMonthGrid();
  
      // In case month changed server-side, keep label fresh
      setMonthLabelFromAnyVisibleCell();
  
      // Clear previous render
      clearRenderedShifts();
  
      const list = Array.isArray(window.shifts) ? window.shifts.slice() : [];
      // Ensure stable order: date, start time minutes if present
      list.sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        // try to sort by start minutes if provided by upstream logic
        const sa = (a.start ?? 0);
        const sb = (b.start ?? 0);
        return sa - sb;
      });
  
      for (const s of list) {
        const day = getDayContainer(s.date);
        if (!day) continue;
        const el = createShiftElement(s);
        if (el) day.appendChild(el);
      }
  
      announceForScreenReader('Calendar updated');
    }
  
    window.renderCalendar = renderCalendar;
    window.createShiftElement = window.createShiftElement || createShiftElement;
  
    /* =========================
       Expand/Collapse all
    ========================= */
    function expandAllShifts() {
      const nodes = $all('.shift');
      state.collapsedShifts.clear();
      nodes.forEach(n => {
        const tri = n.querySelector('.toggle-button div');
        n.classList.remove('collapsed');
        if (tri) tri.className = 'triangle-down';
        n.setAttribute('aria-expanded', 'true');
      });
      announceForScreenReader('All shifts expanded');
    }
  
    function collapseAllShifts() {
      const nodes = $all('.shift');
      nodes.forEach(n => {
        const id = n.getAttribute('data-id');
        const tri = n.querySelector('.toggle-button div');
        if (id) state.collapsedShifts.add(String(id));
        n.classList.add('collapsed');
        if (tri) tri.className = 'triangle-right';
        n.setAttribute('aria-expanded', 'false');
      });
      announceForScreenReader('All shifts collapsed');
    }
  
    window.expandAllShifts = window.expandAllShifts || expandAllShifts;
    window.collapseAllShifts = window.collapseAllShifts || collapseAllShifts;
  
    /* =========================
       Drag & Drop (day-to-day move)
    ========================= */
    function setupDragAndDrop() {
      ensureElements();
      if (!elements.calendar) return;
  
      // Delegate dragstart on shifts
      elements.calendar.addEventListener('dragstart', e => {
        const target = e.target.closest('.shift[data-id]');
        if (!target) return;
        const id = String(target.getAttribute('data-id') || '');
        const day = target.closest('.shift-container[data-date]')?.getAttribute('data-date') || null;
        if (!id || !day) return;
  
        state.isDragging = true;
        state.dragShiftId = id;
        state.dragOriginDate = day;
  
        e.dataTransfer?.setData('text/plain', JSON.stringify({ id, from: day }));
        e.dataTransfer?.setDragImage?.(target, 10, 10);
      });
  
      elements.calendar.addEventListener('dragend', () => {
        state.isDragging = false;
        state.dragShiftId = null;
        state.dragOriginDate = null;
        hideMonthNavigationDropzones();
      });
  
      // Allow drop on day containers
      elements.calendar.addEventListener('dragover', e => {
        const day = e.target.closest('.shift-container[data-date]');
        if (!day) return;
        e.preventDefault();
      });
  
      elements.calendar.addEventListener('drop', async e => {
        const dayNode = e.target.closest('.shift-container[data-date]');
        if (!dayNode) return;
        e.preventDefault();
  
        const targetDateYMD = dayNode.getAttribute('data-date');
        let payload = null;
        try {
          payload = JSON.parse(e.dataTransfer?.getData('text/plain') || '{}');
        } catch (_) {}
  
        const shiftId = String(payload?.id || state.dragShiftId || '');
        if (!shiftId || !targetDateYMD) return;
  
        try {
          // Read the shift details
          const original = (window.shifts || []).find(s => String(s.id) === shiftId);
          if (!original) {
            console.warn('Dropped shift not found in local array:', shiftId);
            return;
          }
  
          // Ask service for conflicts (it now includes same-day double-book logic)
          const conflicts = await window.shiftService._getConflictsForMove(original, targetDateYMD, true);
  
          // If any conflicts, show warning modal with move context
          if (conflicts && conflicts.length) {
            const moveContext = { type: 'drag-move', shiftId, targetDateYMD };
            // Store for modal-handlers.js
            (window.CalendarState ||= {}).pendingMoveOperation = moveContext;
            // Legacy alias in case other code reads it
            window.globalMoveOperation = moveContext;
  
            if (typeof window.showSimplifiedWarning === 'function') {
              window.showSimplifiedWarning(original.employeeId, moveContext);
            } else {
              // Minimal fallback if modal-handlers.js not loaded
              const hostName = getHostDisplayName(original.employeeId) || 'Selected host';
              const msg = `${hostName} already has a shift scheduled on this date. Are you sure you want to proceed?`;
              if (confirm(msg)) {
                if (typeof window.moveSingleShiftToDate === 'function') {
                  await window.moveSingleShiftToDate(shiftId, targetDateYMD, { ignoreConflicts: true });
                  renderCalendar();
                }
              }
            }
            return;
          }
  
          // No conflicts: perform the move
          if (typeof window.moveSingleShiftToDate === 'function') {
            const result = await window.moveSingleShiftToDate(shiftId, targetDateYMD, { ignoreConflicts: false });
            if (!result || !result.ok) {
              console.error('Move failed:', result);
              alert('Could not move the event. Please try again.');
              return;
            }
  
            // Update local array optimistically if service didn’t return full object
            const updated = result.updatedShift || null;
            if (Array.isArray(window.shifts)) {
              const idx = window.shifts.findIndex(s => String(s.id) === shiftId);
              if (idx !== -1) {
                window.shifts[idx] = updated ? updated : { ...window.shifts[idx], date: targetDateYMD };
              }
            }
            renderCalendar();
            announceForScreenReader('Event moved.');
          }
        } catch (err) {
          console.error('Drop/move failed:', err);
          alert('An error occurred while moving the event.');
        }
      });
    }
  
    /* =========================
       Utility: employees/locations dropdown updaters
    ========================= */
    function addEmployeeToDropdowns(newHostId, fullDisplayName) {
      const employeeSelect = (elements.employeeSelect ||= $('#employee-select'));
      const shiftEmployeeSelect = elements.shiftEmployeeSelect || $('#shift-employee');
      if (employeeSelect) {
        const opt = document.createElement('option');
        opt.value = newHostId;
        opt.textContent = fullDisplayName;
        employeeSelect.appendChild(opt);
      }
      if (shiftEmployeeSelect) {
        const opt2 = document.createElement('option');
        opt2.value = newHostId;
        opt2.textContent = fullDisplayName;
        shiftEmployeeSelect.appendChild(opt2);
      }
    }
  
    function addLocationToDropdowns(locationName) {
      const filterSel = (elements.locationSelect ||= $('#location-select'));
      const shiftLocSel = elements.shiftLocationSelect || $('#shift-location');
      if (filterSel) {
        const opt = document.createElement('option');
        opt.value = locationName;
        opt.textContent = locationName;
        filterSel.appendChild(opt);
      }
      if (shiftLocSel) {
        const opt2 = document.createElement('option');
        opt2.value = locationName;
        opt2.textContent = locationName;
        shiftLocSel.appendChild(opt2);
      }
    }
  
    window.addEmployeeToDropdowns = window.addEmployeeToDropdowns || addEmployeeToDropdowns;
    window.addLocationToDropdowns = window.addLocationToDropdowns || addLocationToDropdowns;
  
    /* =========================
       Init
    ========================= */
    function initCalendarUI() {
      ensureElements();
      setupAccessibilitySupport();
      setupMonthNavigationDropzones();
      populateTimeDropdowns();
  
      // Keyboard navigation delegation (only meaningful for table layouts)
      elements.calendarBody?.addEventListener('keydown', e => {
        const td = e.target.closest('td');
        if (!td) return;
        handleCalendarKeyNavigation(e, td);
      });
  
      // Drag/drop
      setupDragAndDrop();
  
      // Render (also builds grid if missing)
      try { renderCalendar(); } catch (e) { console.error('[calendar-ui] initial render error', e); }
  
      // If ShiftService is present, auto-refresh view when data changes
      try {
        if (window.shiftService && !window.__calendarBoundShiftListener) {
          window.shiftService.addDataChangeListener(() => {
            // debounce microtask to allow caches to settle
            setTimeout(() => { try { renderCalendar(); } catch {} }, 60);
          });
          window.__calendarBoundShiftListener = true;
        }
      } catch (_) {}
    }
  
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initCalendarUI);
    } else {
      initCalendarUI();
    }
  
    console.log('[calendar-ui] Ready');
  })();