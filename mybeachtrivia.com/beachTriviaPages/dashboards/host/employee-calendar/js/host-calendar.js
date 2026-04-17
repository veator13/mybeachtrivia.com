/* mybeachtrivia.com/beachTriviaPages/dashboards/host/employee-calendar/js/host-calendar.js */
(function () {
  "use strict";

  // Hard read-only flags (admin calendar-core.js consults this)
  window.__CALENDAR_READONLY__ = true;
  window.isCalendarReadOnly = () => true;

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);

  let _monthShiftsUnsub = null;
  let _monthLiveRangeKey = "";
  let _didAttachHostListeners = false;

  function showDashboard() {
    const loading = $("auth-loading");
    const err = $("error-container");
    const dash = document.querySelector(".dashboard-container");
    if (loading) loading.style.display = "none";
    if (err) err.style.display = "none";
    if (dash) dash.style.display = "block";
  }

  function showError(msg) {
    const loading = $("auth-loading");
    const err = $("error-container");
    const dash = document.querySelector(".dashboard-container");
    const txt = $("error-text");
    if (loading) loading.style.display = "none";
    if (dash) dash.style.display = "none";
    if (err) err.style.display = "flex";
    if (txt) txt.textContent = msg || "Error.";
  }

  function toYMD(value) {
    if (!value) return "";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return String(value || "");
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function monthRangeYMD(year, month) {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    return {
      start: toYMD(start),
      end: toYMD(end),
      key: `${year}-${String(month + 1).padStart(2, "0")}`,
    };
  }

  function mapShiftDoc(doc) {
    const d = doc.data() || {};
    return {
      id: doc.id,
      title: d.type || "Event",
      time:
        d.startTime && d.endTime
          ? `${d.startTime} - ${d.endTime}`
          : d.startTime || d.endTime || "TBD",
      location: d.location,
      type: d.type,
      theme: d.theme || "",
      employeeId: d.employeeId,
      notes: d.notes || "",
      date: toYMD(d.date),
      startTime: d.startTime,
      endTime: d.endTime,
    };
  }

  function stopMonthShiftSubscription() {
    if (typeof _monthShiftsUnsub === "function") {
      try {
        _monthShiftsUnsub();
      } catch (_) {}
    }
    _monthShiftsUnsub = null;
    _monthLiveRangeKey = "";
  }

  async function startMonthShiftSubscription() {
    const st = window.state || {};
    const user = firebase.auth().currentUser;
    if (!user) return;

    const range = monthRangeYMD(st.currentYear, st.currentMonth);
    if (_monthLiveRangeKey === range.key && _monthShiftsUnsub) return;

    stopMonthShiftSubscription();

    const onUpdate = (liveShifts) => {
      window.shifts = Array.isArray(liveShifts) ? liveShifts : [];
      safeRender();
      try {
        window.ShiftTradeRequests?.refresh?.();
      } catch (_) {}
    };

    try {
      if (window.shiftService && typeof window.shiftService.subscribeRange === "function") {
        _monthShiftsUnsub = await window.shiftService.subscribeRange(range.start, range.end, onUpdate);
        _monthLiveRangeKey = range.key;
        return;
      }
    } catch (err) {
      console.warn("[host-calendar] shiftService.subscribeRange failed, falling back to direct Firestore listener:", err);
    }

    try {
      _monthShiftsUnsub = firebase
        .firestore()
        .collection("shifts")
        .where("date", ">=", range.start)
        .where("date", "<=", range.end)
        .onSnapshot(
          (snap) => {
            const list = [];
            snap.forEach((doc) => list.push(mapShiftDoc(doc)));
            onUpdate(list);
          },
          (err) => {
            console.error("[host-calendar] direct month shift listener failed:", err);
          }
        );
      _monthLiveRangeKey = range.key;
    } catch (err) {
      console.error("[host-calendar] could not start month shift subscription:", err);
    }
  }

  // normalize employees to { [id]: "Name" }
  function normalizeEmployeesToNameMap(input) {
    if (!input) return {};
    if (Array.isArray(input)) {
      const out = {};
      input.forEach((x) => {
        if (!x || typeof x !== "object") return;
        const id = x.id || x.uid || x.employeeId || x.hostId || x.value;
        const name = x.name || x.displayName || x.fullName || x.label || x.text;
        if (!id) return;
        out[String(id)] = String(name || id);
      });
      return out;
    }
    if (typeof input === "object") return input; // already a map
    return {};
  }

  // normalize locations to array of { id, name }
  function normalizeLocationsToArray(input) {
    if (!input) return [];
    if (!Array.isArray(input)) return [];
    return input
      .map((x) => {
        if (x == null) return null;
        if (typeof x === "string") return { id: x, name: x };
        if (typeof x === "object") {
          const id = x.id || x.locationId || x.venueId || x.value || x.name;
          const name = x.name || x.locationName || x.venueName || x.displayName || x.label || id;
          if (!id) return null;
          return { id: String(id), name: String(name || id) };
        }
        return null;
      })
      .filter(Boolean);
  }

  // rebuild the top filter dropdowns so they show names, not IDs
  function rebuildHostDropdowns() {
    const els = window.elements || {};
    const empSelect = els.employeeSelect;
    const locSelect = els.locationSelect;

    const employees = window.employees || {};
    if (empSelect) {
      const cur = empSelect.value || "all";
      empSelect.innerHTML = "";
      const optAll = document.createElement("option");
      optAll.value = "all";
      optAll.textContent = "All Hosts";
      empSelect.appendChild(optAll);

      Object.keys(employees).forEach((id) => {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = employees[id] || id;
        empSelect.appendChild(opt);
      });

      empSelect.value = cur;
    }

    const locations = window.locations || [];
    if (locSelect) {
      const cur = locSelect.value || "all";
      locSelect.innerHTML = "";
      const optAll = document.createElement("option");
      optAll.value = "all";
      optAll.textContent = "All Locations";
      locSelect.appendChild(optAll);

      locations.forEach((l) => {
        const id = l.id || l.name;
        const name = l.name || l.id;
        const opt = document.createElement("option");
        opt.value = String(id);
        opt.textContent = String(name);
        locSelect.appendChild(opt);
      });

      locSelect.value = cur;
    }
  }

  // ✅ Populate modal Host + Location selects so editShift() can display names
  function populateModalDropdowns() {
    const empSel = $("shift-employee");
    const locSel = $("shift-location");

    const employees = window.employees || {};
    if (empSel) {
      const cur = empSel.value || "";
      empSel.innerHTML = '<option value="">Select Host</option>';
      Object.keys(employees).forEach((id) => {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = employees[id] || id;
        empSel.appendChild(opt);
      });
      empSel.value = cur;
    }

    const locations = window.locations || [];
    if (locSel) {
      const cur = locSel.value || "";
      locSel.innerHTML = '<option value="">Select Location</option>';
      locations.forEach((l) => {
        const id = String(l.id || l.name || "");
        const name = String(l.name || l.id || "");
        if (!id) return;
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = name || id;
        locSel.appendChild(opt);
      });
      locSel.value = cur;
    }
  }

  // ✅ Ensure a select shows *something* even if the option list is missing the value
  function ensureOption(selectEl, value, label) {
    if (!selectEl || value == null || value === "") return;
    const v = String(value);
    const has = Array.from(selectEl.options || []).some((o) => o.value === v);
    if (has) return;
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = label || v;
    selectEl.appendChild(opt);
  }

  // Try to find a shift object by id (various possible field names)
  function findShiftById(id) {
    const shifts = window.shifts || [];
    const v = String(id || "");
    return (
      shifts.find((s) => String(s?.id || "") === v) ||
      shifts.find((s) => String(s?.shiftId || "") === v) ||
      shifts.find((s) => String(s?.docId || "") === v) ||
      shifts.find((s) => String(s?._id || "") === v) ||
      null
    );
  }

  // safe render wrapper (calendar-core.js defines renderCalendar)
  function safeRender() {
    try {
      if (typeof window.renderCalendar === "function") window.renderCalendar();
    } catch (e) {
      console.error("[host-calendar] renderCalendar failed:", e);
    }
  }

  // ✅ Close modal safely (move focus out BEFORE aria-hidden changes)
  function closeShiftModalHostSafe() {
    const modal = $("shift-modal");
    if (!modal) return;

    const focusTarget = $("next-month") || $("prev-month") || $("employee-select") || document.body;
    try {
      focusTarget?.focus?.();
    } catch (_) {}

    if (typeof window.closeShiftModal === "function") window.closeShiftModal();
    else {
      modal.setAttribute("aria-hidden", "true");
      modal.style.display = "none";
    }
  }

  // ✅ Label Cancel button as Close + guarantee it closes safely
  function wireHostModalCloseButton() {
    const btn = $("cancel-shift");
    if (!btn) return;

    btn.textContent = "Close";

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeShiftModalHostSafe();
    });
  }

  // ── Request Coverage button ──────────────────────────────────────────────

  function updateRequestCoverageButton(shift) {
    const buttonGroup = document.querySelector("#shift-modal .button-group");
    if (!buttonGroup) return;

    const BTN_ID = "host-request-coverage-btn";
    let btn = $(BTN_ID);

    if (!btn) {
      btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.type = "button";
      btn.textContent = "Request Coverage";
      btn.className = "btn primary";
      btn.style.marginRight = "auto";

      btn.addEventListener("click", () => {
        if (btn._mode === "requested") {
          $("shift-modal")?.setAttribute("aria-hidden", "true");
          $("shift-offers-modal")?.setAttribute("aria-hidden", "false");
          window.ShiftTradeRequests?.refresh();
        } else if (typeof window.ShiftTradeRequests?.openRequestModal === "function") {
          window.ShiftTradeRequests.openRequestModal(btn._shiftData || {});
        }
      });

      buttonGroup.insertBefore(btn, buttonGroup.firstChild);
    }

    const uid = window._currentHostUID || firebase.auth().currentUser?.uid;
    const shiftEmployeeVal = document.getElementById("shift-employee")?.value || "";
    const isOwnShift =
      uid &&
      (String(shift?.employeeId || "") === String(uid) ||
        String(shift?.hostId || "") === String(uid) ||
        (shiftEmployeeVal && String(shiftEmployeeVal) === String(uid)));

    btn._shiftData = shift || {};

    if (!isOwnShift) {
      btn.style.display = "none";
      return;
    }

    btn.style.display = "";

    const shiftId = shift?.id || shift?.shiftId || shift?.docId || "";
    const alreadyRequested =
      shiftId && window.ShiftTradeRequests?.hasActiveRequestForShift(shiftId);

    if (alreadyRequested) {
      btn.textContent = "Coverage Requested";
      btn.classList.add("coverage-requested");
      btn._mode = "requested";
    } else {
      btn.textContent = "Request Coverage";
      btn.classList.remove("coverage-requested");
      btn._mode = "open";
    }
  }

  window._updateRequestCoverageButtonIfOpen = function () {
    const btn = document.getElementById("host-request-coverage-btn");
    if (!btn || btn.style.display === "none") return;
    updateRequestCoverageButton(btn._shiftData);
  };

  // Used by shift-trade-requests.js after accept/cancel flows
  window._refreshCalendarIfAvailable = function () {
    try {
      safeRender();
    } catch (_) {}
  };

  // ✅ Permanently wire shift clicks to open modal via editShift(id)
  function installShiftClickDelegate() {
    if (window.__HOST_SHIFT_DELEGATE_INSTALLED__) return;
    window.__HOST_SHIFT_DELEGATE_INSTALLED__ = true;

    const open = (id) => {
      if (!id) return;

      populateModalDropdowns();

      const s = findShiftById(id);
      const empVal =
        s?.employeeId ||
        s?.hostId ||
        s?.employee ||
        s?.employeeUID ||
        s?.hostUID ||
        s?.assignedHostId;
      const locVal =
        s?.locationId || s?.venueId || s?.location || s?.venue || s?.locationUID || s?.venueUID;

      ensureOption(
        $("shift-employee"),
        empVal,
        empVal ? window.employees?.[String(empVal)] || "Unknown Host" : ""
      );
      if (locVal) {
        const locName =
          (window.locations || []).find((l) => String(l.id) === String(locVal))?.name ||
          "Unknown Location";
        ensureOption($("shift-location"), locVal, locName);
      }

      if (typeof window.editShift === "function") {
        try {
          window.editShift(String(id));
        } catch (err) {
          console.error("[host-calendar] editShift failed:", err);
        }
      }

      updateRequestCoverageButton(s);
    };

    document.addEventListener(
      "click",
      (e) => {
        const shiftEl = e.target?.closest?.(".shift[data-id]");
        if (!shiftEl) return;
        open(shiftEl.dataset.id);
      },
      true
    );

    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const active = document.activeElement;
        const shiftEl = active?.closest?.(".shift[data-id]");
        if (!shiftEl) return;
        e.preventDefault();
        open(shiftEl.dataset.id);
      },
      true
    );
  }

  // Host version of attachEventListeners (initCalendar() expects this to exist)
  function attachEventListenersHost() {
    if (_didAttachHostListeners) return;
    _didAttachHostListeners = true;

    const els = window.elements || {};
    const st = window.state || {};

    els.prevMonthBtn?.addEventListener("click", async () => {
      st.currentMonth -= 1;
      if (st.currentMonth < 0) {
        st.currentMonth = 11;
        st.currentYear -= 1;
      }
      try {
        $("calendar-loading")?.removeAttribute("hidden");
        await loadAndRender();
      } catch (e) {
        console.error(e);
        showError("Calendar load failed (permissions or server).");
      }
    });

    els.nextMonthBtn?.addEventListener("click", async () => {
      st.currentMonth += 1;
      if (st.currentMonth > 11) {
        st.currentMonth = 0;
        st.currentYear += 1;
      }
      try {
        $("calendar-loading")?.removeAttribute("hidden");
        await loadAndRender();
      } catch (e) {
        console.error(e);
        showError("Calendar load failed (permissions or server).");
      }
    });

    els.employeeSelect?.addEventListener("change", () => {
      st.filters = st.filters || { employee: "all", eventType: "all", location: "all" };
      st.filters.employee = els.employeeSelect.value || "all";
      safeRender();
    });

    els.eventSelect?.addEventListener("change", () => {
      st.filters = st.filters || { employee: "all", eventType: "all", location: "all" };
      st.filters.eventType = els.eventSelect.value || "all";
      safeRender();
    });

    els.locationSelect?.addEventListener("change", () => {
      st.filters = st.filters || { employee: "all", eventType: "all", location: "all" };
      st.filters.location = els.locationSelect.value || "all";
      safeRender();
    });

    els.expandAllBtn?.addEventListener("click", () => {
      if (typeof window.expandAllShifts === "function") window.expandAllShifts();
      else {
        st.collapsedShifts?.clear?.();
        safeRender();
      }
    });

    els.collapseAllBtn?.addEventListener("click", () => {
      if (typeof window.collapseAllShifts === "function") window.collapseAllShifts();
      else safeRender();
    });

    const offersModal = $("shift-offers-modal");
    $("open-shift-offers")?.addEventListener("click", () => {
      if (!offersModal) return;
      offersModal.setAttribute("aria-hidden", "false");
      try {
        window.ShiftTradeRequests?.refresh?.();
      } catch (_) {}
    });

    $("close-shift-offers")?.addEventListener("click", () => {
      if (!offersModal) return;
      offersModal.setAttribute("aria-hidden", "true");
    });

    offersModal?.addEventListener("click", (e) => {
      if (e.target === offersModal) offersModal.setAttribute("aria-hidden", "true");
    });
  }

  // ---------- state + elements ----------
  function initStateAndElements() {
    window.cache = window.cache || { dateStrings: {}, timeMinutes: {} };

    window.state = {
      currentYear: new Date().getFullYear(),
      currentMonth: new Date().getMonth(),
      currentSelectedDate: null,
      collapsedShifts: new Set(),
      hiddenWeeks: new Set(),
      filters: { employee: "all", eventType: "all", location: "all" },

      isDragWeekCopy: false,
      isDragWeekMove: false,
      copyingWeekShifts: [],
      movingWeekShifts: [],
      sourceWeekIndex: null,

      draggedShiftId: null,
      copyingDayShifts: [],
      copyingWeekShifts: [],
    };

    window.elements = {
      calendarBody: $("calendar-body"),
      currentMonthDisplay: $("current-month"),
      prevMonthBtn: $("prev-month"),
      nextMonthBtn: $("next-month"),
      employeeSelect: $("employee-select"),
      eventSelect: $("event-select"),
      locationSelect: $("location-select"),
      expandAllBtn: $("expand-all-btn"),
      collapseAllBtn: $("collapse-all-btn"),

      prevMonthDropzone: null,
      nextMonthDropzone: null,

      shiftModal: $("shift-modal"),
      shiftForm: $("shift-form"),
      modalTitle: $("modal-title"),
      submitButton: $("save-shift-btn"),
      cancelShiftBtn: $("cancel-shift"),

      shiftDateInput: $("shift-date"),
      shiftEmployeeSelect: $("shift-employee"),
      shiftLocationSelect: $("shift-location"),
      shiftNotesInput: $("shift-notes"),

      startTimeSelect: $("start-time"),
      endTimeSelect: $("end-time"),
      shiftTypeSelect: $("shift-type"),
      shiftThemeInput: $("shift-theme"),
      themeField: $("theme-field"),

      addNewHostBtn: $("add-new-host-btn"),
      addNewLocationBtn: $("add-new-location-btn"),
    };

    window.eventTypes =
      window.eventTypes || {
        "classic-trivia": "Classic Trivia",
        "themed-trivia": "Themed Trivia",
        "classic-bingo": "Classic Bingo",
        "music-bingo": "Music Bingo",
        "beach-feud": "Beach Feud",
      };

    window.attachEventListeners = attachEventListenersHost;
  }

  // ---------- data load ----------
  async function fetchMonthData(year, month) {
    let idToken = null;
    try {
      const user = firebase.auth().currentUser;
      idToken = user ? await user.getIdToken() : null;
    } catch (_) {}

    const fn = firebase.functions().httpsCallable("hostGetCalendarMonth");
    const res = await fn({ year, month, idToken });

    return res && res.data ? res.data : { employees: {}, locations: [], shifts: [] };
  }

  async function loadAndRender() {
    const st = window.state;
    const data = await fetchMonthData(st.currentYear, st.currentMonth);

    window.employees = normalizeEmployeesToNameMap(data.employees || {});
    window.locations = normalizeLocationsToArray(data.locations || []);
    window.shifts = Array.isArray(data.shifts) ? data.shifts : [];

    rebuildHostDropdowns();
    populateModalDropdowns();

    if (typeof window.initCalendar === "function") {
      window.initCalendar();
    } else {
      safeRender();
      attachEventListenersHost();
    }

    installShiftClickDelegate();
    attachEventListenersHost();

    try {
      window.ShiftTradeRequests?.refresh?.();
      window.ShiftTradeRequests?.refreshBell?.();
    } catch (_) {}

    $("calendar-loading")?.setAttribute("hidden", "");
  }

  // ---------- boot ----------
  document.addEventListener("DOMContentLoaded", () => {
    $("back-to-login")?.addEventListener("click", () => {
      window.location.href = "/login.html";
    });

    $("logout-btn")?.addEventListener("click", async () => {
      try {
        await firebase.auth().signOut();
      } catch (_) {}
      window.location.href = "/login.html";
    });

    initStateAndElements();
    wireHostModalCloseButton();

    const shiftModal = $("shift-modal");
    shiftModal?.addEventListener("click", (e) => {
      if (e.target === shiftModal) {
        closeShiftModalHostSafe();
      }
    });

    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Escape") return;
        const m = $("shift-modal");
        if (!m) return;
        const open =
          m.getAttribute("aria-hidden") === "false" ||
          m.style.display === "flex" ||
          m.classList.contains("open") ||
          m.classList.contains("show");
        if (!open) return;

        closeShiftModalHostSafe();
      },
      true
    );

    firebase.auth().onAuthStateChanged(async (user) => {
      if (!user) {
        showError("Please sign in.");
        return;
      }

      window._currentHostUID = user.uid;
      window._currentHostDisplayName = user.displayName || user.email || "Host";

      showDashboard();

      try {
        const displayName = user.displayName || user.email || "Host";
        const el = $("user-display-name");
        if (el) el.textContent = displayName;
      } catch (_) {}

      try {
        await loadAndRender();
      } catch (e) {
        console.error("[host-calendar] init failed:", e);
        showError("Calendar initialization failed (permissions or server).");
      }
    });

    window.addEventListener("beforeunload", () => {
      // no-op: month shifts are loaded non-real-time for read savings
    });
  });
})();