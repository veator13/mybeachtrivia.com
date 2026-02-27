// modal-handlers.js
// Functions for handling modals and form submissions
//
// Updated 2026-02-27:
// - Drag/copy/move conflict override always routes through window.globalMoveOperation
// - Uses window.executeOverrideFromGlobalMoveOperation() (provided by drag-drop-handler.js) when present
// - Keeps existing “form conflict override” path (pendingShiftData) intact
// - Adds defensive helpers so we never depend on a stray globalMoveOperation var
// - Modal stack + backdrop-close only closes topmost modal

(function () {
    // ------------------------------------------------------------
    // Modal stack helpers (NEW)
    // ------------------------------------------------------------
  
    (function initModalStackOnce() {
      if (window.__calendarModalStackInit) return;
      window.__calendarModalStackInit = true;
  
      window.CalendarModalStack = window.CalendarModalStack || [];
  
      window.pushModal = function pushModal(modalId) {
        if (!modalId) return;
        const stack = window.CalendarModalStack;
        if (stack[stack.length - 1] === modalId) return;
        stack.push(modalId);
      };
  
      window.popModal = function popModal(modalId) {
        const stack = window.CalendarModalStack;
        if (!stack || !stack.length) return;
  
        if (!modalId) {
          stack.pop();
          return;
        }
  
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i] === modalId) {
            stack.splice(i, 1);
            break;
          }
        }
      };
  
      window.peekModal = function peekModal() {
        const stack = window.CalendarModalStack;
        return stack && stack.length ? stack[stack.length - 1] : null;
      };
  
      window.closeTopModalIfAny = function closeTopModalIfAny() {
        const top = window.peekModal();
        if (!top) return false;
  
        switch (top) {
          case "warning-modal":
            if (typeof closeWarningModal === "function") closeWarningModal();
            return true;
          case "new-host-modal":
            if (typeof closeNewHostModal === "function") closeNewHostModal();
            return true;
          case "new-location-modal":
            if (typeof closeNewLocationModal === "function") closeNewLocationModal();
            return true;
          case "copy-shift-modal":
            if (typeof closeCopyShiftModal === "function") closeCopyShiftModal();
            return true;
          case "clear-day-modal":
            if (typeof closeClearDayModal === "function") closeClearDayModal();
            return true;
          case "shift-modal":
            if (typeof closeShiftModal === "function") closeShiftModal();
            return true;
          default:
            try {
              const el = document.getElementById(top);
              if (el) {
                try {
                  document.activeElement?.blur?.();
                } catch (_) {}
                el.style.display = "none";
                el.setAttribute("aria-hidden", "true");
                window.popModal(top);
                return true;
              }
            } catch (_) {}
            return false;
        }
      };
    })();
  
    // ------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------
  
    function _getEls() {
      return window.elements || (typeof elements !== "undefined" ? elements : {});
    }
  
    function _safeFocus(node) {
      try {
        if (node && typeof node.focus === "function") node.focus();
      } catch (_) {}
    }
  
    function _blurActiveElementSafe() {
      try {
        const ae = document.activeElement;
        if (ae && typeof ae.blur === "function") ae.blur();
      } catch (_) {}
    }
  
    function _scrollModalToTop(modalEl) {
      if (!modalEl) return;
      try {
        const container =
          modalEl.querySelector("#shift-form") ||
          modalEl.querySelector("#new-host-form") ||
          modalEl.querySelector("#new-location-form") ||
          modalEl.querySelector(".warning-message") ||
          modalEl.querySelector(".modal-content") ||
          modalEl.querySelector(".modal-body") ||
          modalEl;
        container.scrollTop = 0;
      } catch (_) {}
    }
  
    function _showModal(modalEl, modalId) {
      if (!modalEl) return;
      modalEl.style.display = "flex";
      modalEl.setAttribute("aria-hidden", "false");
      _scrollModalToTop(modalEl);
      if (typeof window.pushModal === "function") window.pushModal(modalId);
    }
  
    function _hideModal(modalEl, modalId) {
      if (!modalEl) return;
      _blurActiveElementSafe();
      modalEl.style.display = "none";
      modalEl.setAttribute("aria-hidden", "true");
      _scrollModalToTop(modalEl);
      if (typeof window.popModal === "function") window.popModal(modalId);
    }
  
    // ------------------------------------------------------------
    // ✅ Override state helpers (supports CalendarState OR state OR window.state)
    // ------------------------------------------------------------
  
    function _getPendingShiftData() {
      try {
        if (window.CalendarState && window.CalendarState.pendingShiftData) {
          return window.CalendarState.pendingShiftData;
        }
      } catch (_) {}
  
      try {
        if (typeof state !== "undefined" && state && state.pendingShiftData) return state.pendingShiftData;
        if (window.state && window.state.pendingShiftData) return window.state.pendingShiftData;
      } catch (_) {}
  
      return null;
    }
  
    // ✅ FIXED: don't trust CalendarState if it exists but has no editingShiftId
    function _getEditingContext() {
      // 1) Prefer CalendarState ONLY when it actually contains an editingShiftId
      try {
        if (window.CalendarState) {
          const id = window.CalendarState.editingShiftId ? String(window.CalendarState.editingShiftId) : null;
          if (id) {
            return { isEditing: true, editingShiftId: id };
          }
          // If it exists but is empty, fall through
        }
      } catch (_) {}
  
      // 2) state
      try {
        if (typeof state !== "undefined" && state) {
          const id = state.editingShiftId ? String(state.editingShiftId) : null;
          return { isEditing: !!(state.isEditing && id), editingShiftId: id };
        }
      } catch (_) {}
  
      // 3) window.state
      try {
        if (window.state) {
          const id = window.state.editingShiftId ? String(window.state.editingShiftId) : null;
          return { isEditing: !!(window.state.isEditing && id), editingShiftId: id };
        }
      } catch (_) {}
  
      return { isEditing: false, editingShiftId: null };
    }
  
    function _setForceBookingFlag(on) {
      try {
        if (window.CalendarState) window.CalendarState.forceBooking = !!on;
      } catch (_) {}
      try {
        if (typeof state !== "undefined" && state) state.forceBooking = !!on;
      } catch (_) {}
      try {
        if (window.state) window.state.forceBooking = !!on;
      } catch (_) {}
    }
  
    function _clearPendingShiftData() {
      try {
        if (window.CalendarState) window.CalendarState.pendingShiftData = null;
      } catch (_) {}
      try {
        if (typeof state !== "undefined" && state) state.pendingShiftData = null;
      } catch (_) {}
      try {
        if (window.state) window.state.pendingShiftData = null;
      } catch (_) {}
    }
  
    function _clearEditingContext() {
      try {
        if (window.CalendarState) {
          window.CalendarState.isEditing = false;
          window.CalendarState.editingShiftId = null;
        }
      } catch (_) {}
      try {
        if (typeof state !== "undefined" && state) {
          state.isEditing = false;
          state.editingShiftId = null;
        }
      } catch (_) {}
      try {
        if (window.state) {
          window.state.isEditing = false;
          window.state.editingShiftId = null;
        }
      } catch (_) {}
    }
  
    // ------------------------------------------------------------
    // Drag/move override helpers
    // ------------------------------------------------------------
  
    function _getGlobalMoveOperation() {
      try {
        // Always prefer window.globalMoveOperation
        if (window.globalMoveOperation) return window.globalMoveOperation;
      } catch (_) {}
      // Fallback if some code still sets a bare global
      try {
        // eslint-disable-next-line no-undef
        if (typeof globalMoveOperation !== "undefined" && globalMoveOperation) return globalMoveOperation;
      } catch (_) {}
      return null;
    }
  
    // ------------------------------------------------------------
    // Firestore force helpers (ADD vs UPDATE)
    // ------------------------------------------------------------
  
    async function _forceAddShiftDoc(data) {
      if (!window.firebase?.firestore) throw new Error("Firestore not available");
      const db = firebase.firestore();
      const payload = { ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
      const ref = await db.collection("shifts").add(payload);
      return ref.id;
    }
  
    async function _forceUpdateShiftDoc(shiftId, data) {
      if (!window.firebase?.firestore) throw new Error("Firestore not available");
      const db = firebase.firestore();
      const payload = { ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
      await db.collection("shifts").doc(String(shiftId)).update(payload);
      return String(shiftId);
    }
  
    async function _forcePersistPendingShift(pending, editingShiftId) {
      const payload = {
        date: pending.date,
        employeeId: pending.employeeId,
        startTime: pending.startTime,
        endTime: pending.endTime,
        type: pending.type,
        theme: pending.theme || "",
        location: pending.location,
        notes: pending.notes || "",
      };
  
      // ✅ EDIT MODE MUST UPDATE
      if (editingShiftId) {
        try {
          if (window.shiftService?.saveShift) {
            const maybe = await window.shiftService.saveShift({ ...payload, id: editingShiftId }, { force: true });
            return maybe || editingShiftId;
          }
        } catch (_) {}
        return await _forceUpdateShiftDoc(editingShiftId, payload);
      }
  
      // ✅ ADD MODE
      try {
        if (typeof window.forceSaveShiftToFirebase === "function") {
          const newId = await window.forceSaveShiftToFirebase(payload);
          return newId;
        }
      } catch (_) {}
  
      try {
        if (window.shiftService?.saveShift) {
          const newId = await window.shiftService.saveShift(payload, { force: true });
          return newId;
        }
      } catch (_) {}
  
      return await _forceAddShiftDoc(payload);
    }
  
    async function _refreshCalendarUIAfterWrite() {
      try {
        if (typeof loadShiftsFromFirebase === "function") await loadShiftsFromFirebase();
      } catch (_) {}
      try {
        if (typeof renderCalendar === "function") renderCalendar();
      } catch (_) {}
    }
  
    // ------------------------------------------------------------
    // ✅ Proceed Anyway handler
    // ------------------------------------------------------------
  
    function handleProceedAnyway() {
      // 1) Drag/move/copy override path (globalMoveOperation)
      const op = _getGlobalMoveOperation();
      if (op && op.active) {
        // ✅ drag-drop-handler.js now exposes this stable entry point
        if (typeof window.executeOverrideFromGlobalMoveOperation === "function") {
          window.executeOverrideFromGlobalMoveOperation();
          return;
        }
  
        // Fallback: allow older builds (if someone exposed something else)
        if (typeof window._applyGlobalMoveOperationOverride === "function") {
          window._applyGlobalMoveOperationOverride();
          return;
        }
      }
  
      // 2) Form conflict override path (pendingShiftData)
      const pending = _getPendingShiftData();
      if (pending) {
        _setForceBookingFlag(true);
  
        const ctx = _getEditingContext();
        const editingShiftId = ctx?.editingShiftId || null;
  
        (async () => {
          try {
            await _forcePersistPendingShift(pending, editingShiftId);
  
            try {
              if (typeof closeWarningModal === "function") closeWarningModal();
            } catch (_) {}
            try {
              if (typeof closeShiftModal === "function") closeShiftModal();
            } catch (_) {}
  
            await _refreshCalendarUIAfterWrite();
          } catch (e) {
            console.error("[calendar] Proceed Anyway override failed:", e);
            alert("Override failed. Please try again.");
            _setForceBookingFlag(false);
          } finally {
            _clearPendingShiftData();
            _clearEditingContext();
          }
        })();
  
        return;
      }
  
      console.warn("[calendar] Proceed Anyway clicked but no override context found.");
    }
  
    (function wireProceedButtonOnce() {
      if (window.__calendarProceedWired) return;
      window.__calendarProceedWired = true;
  
      document.addEventListener(
        "click",
        function (e) {
          const btn =
            e.target &&
            (e.target.id === "proceed-booking" ? e.target : e.target.closest && e.target.closest("#proceed-booking"));
          if (!btn) return;
  
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
          handleProceedAnyway();
        },
        true
      );
  
      document.addEventListener(
        "keydown",
        function (e) {
          if (e.key !== "Enter") return;
          const el = document.activeElement;
          if (!el) return;
          if (el.id === "proceed-booking" || (el.classList && el.classList.contains("proceed"))) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
            handleProceedAnyway();
          }
        },
        true
      );
    })();
  
    // ------------------------------------------------------------
    // Shift modal
    // ------------------------------------------------------------
  
    function openShiftModal(dateStr = null) {
      const els = _getEls();
  
      try {
        if (typeof state !== "undefined" && state) {
          state.isEditing = false;
          state.editingShiftId = null;
        }
      } catch (_) {}
      try {
        if (window.CalendarState) {
          window.CalendarState.isEditing = false;
          window.CalendarState.editingShiftId = null;
        }
      } catch (_) {}
  
      if (els.modalTitle) els.modalTitle.textContent = "Add New Event";
      if (els.submitButton) els.submitButton.textContent = "Save Event";
  
      try {
        if (els.shiftForm) els.shiftForm.reset();
      } catch (_) {}
      try {
        if (els.themeField) els.themeField.style.display = "none";
      } catch (_) {}
  
      const defaultDate = dateStr || (typeof formatDate === "function" ? formatDate(new Date()) : "");
      if (els.shiftDateInput) els.shiftDateInput.value = defaultDate;
  
      if (typeof getDefaultTimes === "function") {
        const defaultTimes = getDefaultTimes();
        selectDropdownOptionByValue(els.startTimeSelect, defaultTimes.start);
        selectDropdownOptionByValue(els.endTimeSelect, defaultTimes.end);
      }
  
      _showModal(els.shiftModal || document.getElementById("shift-modal"), "shift-modal");
  
      setTimeout(() => {
        _scrollModalToTop(els.shiftModal || document.getElementById("shift-modal"));
        _safeFocus(els.shiftEmployeeSelect || document.getElementById("shift-employee"));
      }, 60);
  
      try {
        if (typeof announceForScreenReader === "function" && typeof getReadableDateString === "function") {
          announceForScreenReader(`Adding new event for ${getReadableDateString(new Date(defaultDate))}`);
        }
      } catch (_) {}
    }
  
    function closeShiftModal() {
      const els = _getEls();
      const scrollPosition = { x: window.scrollX, y: window.scrollY };
  
      _hideModal(els.shiftModal || document.getElementById("shift-modal"), "shift-modal");
  
      _clearEditingContext();
  
      setTimeout(() => window.scrollTo(scrollPosition.x, scrollPosition.y), 10);
    }
  
    // ------------------------------------------------------------
    // Warning modal
    // ------------------------------------------------------------
  
    function closeWarningModal() {
      const els = _getEls();
      const scrollPosition = { x: window.scrollX, y: window.scrollY };
  
      _setForceBookingFlag(false);
      _clearPendingShiftData();
  
      _hideModal(els.warningModal || document.getElementById("warning-modal"), "warning-modal");
  
      try {
        if (els.submitButton) els.submitButton.disabled = false;
      } catch (_) {}
  
      const shiftModal = els.shiftModal || document.getElementById("shift-modal");
      if (shiftModal && shiftModal.style.display === "flex") {
        _safeFocus(els.submitButton || document.querySelector('button[form="shift-form"]'));
      } else {
        setTimeout(() => window.scrollTo(scrollPosition.x, scrollPosition.y), 10);
      }
  
      try {
        if (typeof hideMonthNavigationDropzones === "function") hideMonthNavigationDropzones();
      } catch (_) {}
    }
    window.closeWarningModal = closeWarningModal;
  
    function showSimplifiedWarning(employeeId) {
      const els = _getEls();
      console.log(`Showing warning for employee ${employeeId} with move operation:`, _getGlobalMoveOperation());
  
      const hostName = typeof getEmployeeName === "function" ? getEmployeeName(employeeId) : "This host";
  
      if (els.warningText) {
        els.warningText.textContent = `${hostName} already has a shift scheduled on this date. Are you sure you want to proceed?`;
      }
  
      if (els.conflictDetails) els.conflictDetails.innerHTML = "";
  
      _showModal(els.warningModal || document.getElementById("warning-modal"), "warning-modal");
  
      setTimeout(() => {
        _scrollModalToTop(els.warningModal || document.getElementById("warning-modal"));
        _safeFocus(els.cancelBookingBtn || document.getElementById("cancel-booking"));
      }, 60);
  
      try {
        if (typeof announceForScreenReader === "function") {
          announceForScreenReader("Warning: Host already has a shift scheduled on this day. Please choose to proceed or cancel.");
        }
      } catch (_) {}
    }
  
    // ------------------------------------------------------------
    // Shared helper
    // ------------------------------------------------------------
  
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
    // New host modal
    // ------------------------------------------------------------
  
    function openNewHostModal() {
      const els = _getEls();
      try {
        if (els.newHostForm) els.newHostForm.reset();
      } catch (_) {}
  
      _showModal(els.newHostModal || document.getElementById("new-host-modal"), "new-host-modal");
  
      setTimeout(() => {
        _scrollModalToTop(els.newHostModal || document.getElementById("new-host-modal"));
        _safeFocus(document.getElementById("new-host-firstname"));
      }, 60);
  
      try {
        if (typeof announceForScreenReader === "function") announceForScreenReader("Add new host form is open");
      } catch (_) {}
      console.log("Opening new host modal");
    }
  
    function closeNewHostModal() {
      const els = _getEls();
      _hideModal(els.newHostModal || document.getElementById("new-host-modal"), "new-host-modal");
  
      const shiftModal = els.shiftModal || document.getElementById("shift-modal");
      if (shiftModal && shiftModal.style.display === "flex") {
        setTimeout(() => {
          _safeFocus(els.addNewHostBtn || document.getElementById("add-new-host-btn"));
          _scrollModalToTop(shiftModal);
        }, 60);
      }
    }
  
    // ------------------------------------------------------------
    // New location modal
    // ------------------------------------------------------------
  
    function openNewLocationModal() {
      const els = _getEls();
      try {
        if (els.newLocationForm) els.newLocationForm.reset();
      } catch (_) {}
  
      _showModal(els.newLocationModal || document.getElementById("new-location-modal"), "new-location-modal");
  
      setTimeout(() => {
        _scrollModalToTop(els.newLocationModal || document.getElementById("new-location-modal"));
        _safeFocus(document.getElementById("new-location-name"));
      }, 60);
  
      try {
        if (typeof announceForScreenReader === "function") announceForScreenReader("Add new location form is open");
      } catch (_) {}
      console.log("Opening new location modal");
    }
  
    function closeNewLocationModal() {
      const els = _getEls();
      _hideModal(els.newLocationModal || document.getElementById("new-location-modal"), "new-location-modal");
  
      const shiftModal = els.shiftModal || document.getElementById("shift-modal");
      if (shiftModal && shiftModal.style.display === "flex") {
        setTimeout(() => {
          _safeFocus(els.addNewLocationBtn || document.getElementById("add-new-location-btn"));
          _scrollModalToTop(shiftModal);
        }, 60);
      }
    }
  
    // ------------------------------------------------------------
    // Save new host
    // ------------------------------------------------------------
  
    function saveNewHost(e) {
      e.preventDefault();
  
      const els = _getEls();
  
      const firstName = document.getElementById("new-host-firstname").value.trim();
      const lastName = document.getElementById("new-host-lastname").value.trim();
      const nickname = document.getElementById("new-host-nickname").value.trim();
      const phone = document.getElementById("new-host-phone").value.trim();
      const email = document.getElementById("new-host-email").value.trim();
      const emergencyContact = document.getElementById("new-host-emergency-contact").value.trim();
      const emergencyPhone = document.getElementById("new-host-emergency-phone").value.trim();
      const employeeId = document.getElementById("new-host-employee-id").value.trim();
      const isActive = document.getElementById("new-host-active").checked;
  
      if (!firstName) {
        alert("Please enter a first name for the host.");
        _safeFocus(document.getElementById("new-host-firstname"));
        return;
      }
  
      if (!lastName) {
        alert("Please enter a last name for the host.");
        _safeFocus(document.getElementById("new-host-lastname"));
        return;
      }
  
      const shortDisplayName = nickname ? nickname : firstName;
      const fullDisplayName = nickname ? `${nickname} (${firstName} ${lastName})` : `${firstName} ${lastName}`;
  
      const newHost = {
        firstName,
        lastName,
        nickname,
        phone,
        email,
        emergencyContactName: emergencyContact,
        emergencyContactPhone: emergencyPhone,
        employeeID: employeeId,
        active: isActive,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
  
      const saveButton = document.getElementById("save-new-host");
      const originalButtonText = saveButton.textContent;
      saveButton.textContent = "Saving...";
      saveButton.disabled = true;
  
      firebase
        .firestore()
        .collection("employees")
        .add(newHost)
        .then((docRef) => {
          console.log("New host added with ID:", docRef.id);
  
          const newHostId = docRef.id;
  
          if (!window.employees) window.employees = {};
          window.employees[newHostId] = shortDisplayName;
  
          if (!window.employeesData) window.employeesData = {};
          window.employeesData[newHostId] = {
            ...newHost,
            id: newHostId,
            displayName: fullDisplayName,
            shortDisplayName,
          };
  
          if (typeof addEmployeeToDropdowns === "function") {
            addEmployeeToDropdowns(newHostId, fullDisplayName);
          } else {
            const newOptionForFilter = document.createElement("option");
            newOptionForFilter.value = newHostId;
            newOptionForFilter.textContent = fullDisplayName;
            if (els.employeeSelect) els.employeeSelect.appendChild(newOptionForFilter);
  
            const newOptionForShift = document.createElement("option");
            newOptionForShift.value = newHostId;
            newOptionForShift.textContent = fullDisplayName;
            if (els.shiftEmployeeSelect) els.shiftEmployeeSelect.appendChild(newOptionForShift);
          }
  
          if (els.shiftEmployeeSelect) els.shiftEmployeeSelect.value = newHostId;
  
          try {
            document.getElementById("new-host-form").reset();
          } catch (_) {}
          closeNewHostModal();
  
          const shiftModal = els.shiftModal || document.getElementById("shift-modal");
          if (shiftModal && shiftModal.style.display === "flex") {
            _scrollModalToTop(shiftModal);
            _safeFocus(els.startTimeSelect || document.getElementById("start-time"));
          }
  
          try {
            if (typeof announceForScreenReader === "function") announceForScreenReader(`New host ${shortDisplayName} has been added`);
          } catch (_) {}
        })
        .catch((error) => {
          console.error("Error adding host to Firebase:", error);
  
          if (error.code === "permission-denied") {
            alert("You do not have permission to add hosts. Please check your login status.");
          } else if (error.code === "unavailable" || (error.name === "FirebaseError" && error.message.includes("network"))) {
            alert("Network error. Please check your internet connection and try again.");
          } else {
            alert(`Error adding host: ${error.message}`);
          }
        })
        .finally(() => {
          saveButton.textContent = originalButtonText;
          saveButton.disabled = false;
        });
    }
  
    // ------------------------------------------------------------
    // Save new location
    // ------------------------------------------------------------
  
    function saveNewLocation(e) {
      e.preventDefault();
  
      const els = _getEls();
  
      const locationName = document.getElementById("new-location-name").value.trim();
      const address = document.getElementById("new-location-address").value.trim();
      const contact = document.getElementById("new-location-contact").value.trim();
      const phone = document.getElementById("new-location-phone").value.trim();
      const email = document.getElementById("new-location-email").value.trim();
      const isActive = document.getElementById("new-location-active").checked;
  
      if (!locationName) {
        alert("Please enter a name for the new location.");
        _safeFocus(document.getElementById("new-location-name"));
        return;
      }
  
      const newLocation = {
        name: locationName,
        address,
        contact,
        phone,
        email,
        isActive,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
  
      const saveButton = document.getElementById("save-new-location");
      const originalButtonText = saveButton.textContent;
      saveButton.textContent = "Saving...";
      saveButton.disabled = true;
  
      firebase
        .firestore()
        .collection("locations")
        .add(newLocation)
        .then((docRef) => {
          console.log("New location added with ID:", docRef.id);
  
          if (!window.locationsData) window.locationsData = {};
          window.locationsData[locationName] = { ...newLocation, id: docRef.id };
  
          if (typeof addLocationToDropdowns === "function") {
            addLocationToDropdowns(locationName);
          } else {
            const newOptionForFilter = document.createElement("option");
            newOptionForFilter.value = locationName;
            newOptionForFilter.textContent = locationName;
            if (els.locationSelect) els.locationSelect.appendChild(newOptionForFilter);
  
            const newOptionForShift = document.createElement("option");
            newOptionForShift.value = locationName;
            newOptionForShift.textContent = locationName;
            if (els.shiftLocationSelect) els.shiftLocationSelect.appendChild(newOptionForShift);
          }
  
          if (els.shiftLocationSelect) els.shiftLocationSelect.value = locationName;
  
          try {
            document.getElementById("new-location-form").reset();
          } catch (_) {}
          closeNewLocationModal();
  
          const shiftModal = els.shiftModal || document.getElementById("shift-modal");
          if (shiftModal && shiftModal.style.display === "flex") {
            _scrollModalToTop(shiftModal);
            _safeFocus(els.shiftNotesInput || document.getElementById("shift-notes"));
          }
  
          try {
            if (typeof announceForScreenReader === "function") announceForScreenReader(`New location ${locationName} has been added`);
          } catch (_) {}
        })
        .catch((error) => {
          console.error("Error adding location to Firebase:", error);
  
          if (error.code === "permission-denied") {
            alert("You do not have permission to add locations. Please check your login status.");
          } else if (error.code === "unavailable" || (error.name === "FirebaseError" && error.message.includes("network"))) {
            alert("Network error. Please check your internet connection and try again.");
          } else {
            alert(`Error adding location: ${error.message}`);
          }
        })
        .finally(() => {
          saveButton.textContent = originalButtonText;
          saveButton.disabled = false;
        });
    }
  
    // ------------------------------------------------------------
    // Copy shift modal
    // ------------------------------------------------------------
  
    function openCopyShiftModal(shiftId) {
      try {
        console.log("Opening copy modal for shift ID:", shiftId);
  
        const copyShiftModal = document.getElementById("copy-shift-modal");
        const copyMethodSelect = document.getElementById("copy-method");
        const copyDateInput = document.getElementById("copy-date");
        const recurringOptionsField = document.getElementById("recurring-options");
  
        if (!copyShiftModal) {
          console.error("Copy shift modal not found in the DOM");
          alert("Copy modal not found. Please refresh the page and try again.");
          return;
        }
  
        const shiftsArr =
          (typeof window.getShifts === "function" ? window.getShifts() : null) ||
          window.shifts ||
          (typeof shifts !== "undefined" ? shifts : []) ||
          [];
  
        const shift = shiftsArr.find((s) => String(s.id) === String(shiftId));
        if (!shift) {
          console.error(`Shift with ID ${shiftId} not found`);
          return;
        }
  
        try {
          if (typeof state !== "undefined" && state) state.copyingShiftId = shiftId;
        } catch (_) {}
  
        const copyShiftForm = document.getElementById("copy-shift-form");
        if (copyShiftForm) copyShiftForm.reset();
  
        if (recurringOptionsField) recurringOptionsField.style.display = "none";
  
        const originalDate = new Date(shift.date);
        const defaultDate = new Date(originalDate);
        defaultDate.setDate(defaultDate.getDate() + 7);
  
        if (copyDateInput && typeof formatDate === "function") copyDateInput.value = formatDate(defaultDate);
  
        _showModal(copyShiftModal, "copy-shift-modal");
  
        setTimeout(() => {
          _scrollModalToTop(copyShiftModal);
          _safeFocus(copyMethodSelect);
        }, 60);
  
        try {
          if (typeof announceForScreenReader === "function" && typeof getEventTypeName === "function" && typeof getReadableDateString === "function") {
            announceForScreenReader(`Copying event ${getEventTypeName(shift.type)} from ${getReadableDateString(originalDate)}`);
          }
        } catch (_) {}
      } catch (error) {
        console.error("Error opening copy shift modal:", error);
        alert("Could not open copy modal. Please refresh the page and try again.");
      }
    }
  
    function closeCopyShiftModal() {
      try {
        const copyShiftModal = document.getElementById("copy-shift-modal");
        if (!copyShiftModal) {
          console.error("Copy shift modal not found");
          return;
        }
  
        const scrollPosition = { x: window.scrollX, y: window.scrollY };
  
        _hideModal(copyShiftModal, "copy-shift-modal");
  
        try {
          if (typeof state !== "undefined" && state) state.copyingShiftId = null;
        } catch (_) {}
  
        setTimeout(() => window.scrollTo(scrollPosition.x, scrollPosition.y), 10);
      } catch (error) {
        console.error("Error closing copy shift modal:", error);
      }
    }
  
    // ------------------------------------------------------------
    // Clear day modal
    // ------------------------------------------------------------
  
    function clearAllShiftsForDay(dateStr) {
      const shiftsForDay = typeof getShiftsForDate === "function" ? getShiftsForDate(dateStr) : [];
  
      if (shiftsForDay.length === 0) {
        alert("No events to clear for this date.");
        return;
      }
  
      const dateObj = new Date(dateStr);
      const formattedDate = typeof getReadableDateString === "function" ? getReadableDateString(dateObj) : dateStr;
  
      document.getElementById("clear-day-title").textContent = `Clear Events for ${formattedDate}`;
      document.getElementById("clear-day-warning").textContent =
        `Are you sure you want to delete all ${shiftsForDay.length} events on ${formattedDate}? This action cannot be undone.`;
  
      const eventsContainer = document.getElementById("day-events-list");
      eventsContainer.innerHTML = "";
  
      const countElement = document.createElement("div");
      countElement.className = "event-count";
      countElement.textContent = `${shiftsForDay.length} event${shiftsForDay.length > 1 ? "s" : ""} will be permanently deleted:`;
      eventsContainer.appendChild(countElement);
  
      shiftsForDay.forEach((shift) => {
        const shiftItem = document.createElement("div");
        shiftItem.className = "conflict-item";
  
        const employeeName = (window.employees && window.employees[shift.employeeId]) || "Unknown host";
        const eventType = (window.eventTypes && window.eventTypes[shift.type]) || shift.type;
        const timeInfo = `${shift.startTime} - ${shift.endTime}`;
        const locationInfo = shift.location || "No location";
  
        shiftItem.innerHTML = `
            <div class="conflict-event">${eventType}${shift.theme ? ": " + shift.theme : ""}</div>
            <div class="conflict-time">${timeInfo} with ${employeeName}</div>
            <div class="conflict-location">${locationInfo}</div>
          `;
        eventsContainer.appendChild(shiftItem);
      });
  
      document.getElementById("confirm-clear-day").setAttribute("data-date", dateStr);
      document.getElementById("confirm-clear-day").removeAttribute("data-week-index");
  
      const clearDayModal = document.getElementById("clear-day-modal");
      _showModal(clearDayModal, "clear-day-modal");
  
      setTimeout(() => {
        _scrollModalToTop(clearDayModal);
        _safeFocus(document.getElementById("cancel-clear-day"));
      }, 60);
  
      try {
        if (typeof announceForScreenReader === "function") {
          announceForScreenReader(`Confirm clearing ${shiftsForDay.length} events on ${formattedDate}`);
        }
      } catch (_) {}
    }
  
    function closeClearDayModal() {
      const modal = document.getElementById("clear-day-modal");
      if (modal) _hideModal(modal, "clear-day-modal");
  
      const confirmButton = document.getElementById("confirm-clear-day");
      if (confirmButton) {
        confirmButton.removeAttribute("data-date");
        confirmButton.removeAttribute("data-week-index");
      }
    }
  
    // ------------------------------------------------------------
    // Form handling
    // ------------------------------------------------------------
  
    function toggleThemeField() {
      const els = _getEls();
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
      const els = _getEls();
      if (els.startTimeSelect && els.startTimeSelect.value && els.endTimeSelect) {
        const startTimeIndex = els.startTimeSelect.selectedIndex;
        const endTimeIndex = Math.min(startTimeIndex + 8, els.endTimeSelect.options.length - 1);
        els.endTimeSelect.selectedIndex = endTimeIndex;
      }
    }
  
    function validateShiftForm() {
      const els = _getEls();
  
      if (!els.shiftDateInput || !els.shiftEmployeeSelect || !els.startTimeSelect || !els.endTimeSelect || !els.shiftTypeSelect || !els.shiftLocationSelect) {
        console.warn("[calendar] validateShiftForm: missing form elements");
        return false;
      }
  
      if (!els.shiftDateInput.value) {
        alert("Please select a date for the event.");
        _safeFocus(els.shiftDateInput);
        return false;
      }
  
      if (!els.shiftEmployeeSelect.value) {
        alert("Please select a host for the event.");
        _safeFocus(els.shiftEmployeeSelect);
        return false;
      }
  
      if (!els.startTimeSelect.value) {
        alert("Please select a start time for the event.");
        _safeFocus(els.startTimeSelect);
        return false;
      }
  
      if (!els.endTimeSelect.value) {
        alert("Please select an end time for the event.");
        _safeFocus(els.endTimeSelect);
        return false;
      }
  
      if (!els.shiftTypeSelect.value) {
        alert("Please select an event type.");
        _safeFocus(els.shiftTypeSelect);
        return false;
      }
  
      if (els.shiftTypeSelect.value === "themed-trivia" && els.shiftThemeInput && !els.shiftThemeInput.value.trim()) {
        alert("Please enter a theme for the themed trivia event.");
        _safeFocus(els.shiftThemeInput);
        return false;
      }
  
      if (!els.shiftLocationSelect.value) {
        alert("Please select a location for the event.");
        _safeFocus(els.shiftLocationSelect);
        return false;
      }
  
      return true;
    }
  
    // ------------------------------------------------------------
    // Backdrop click = close ONLY the topmost modal (FIXED)
    // ------------------------------------------------------------
  
    (function wireBackdropCloseOnce() {
      if (window.__calendarBackdropCloseWired) return;
      window.__calendarBackdropCloseWired = true;
  
      function getModalElById(id) {
        return id ? document.getElementById(id) : null;
      }
  
      function handleBackdrop(e) {
        const topId = typeof window.peekModal === "function" ? window.peekModal() : null;
        if (!topId) return;
  
        const topEl = getModalElById(topId);
        if (!topEl) return;
  
        if (e.target !== topEl) return;
  
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
  
        if (typeof window.closeTopModalIfAny === "function") {
          window.closeTopModalIfAny();
        }
      }
  
      document.addEventListener("mousedown", handleBackdrop, true);
      document.addEventListener("click", handleBackdrop, true);
    })();
  
    // ------------------------------------------------------------
    // Expose functions used by other files
    // ------------------------------------------------------------
  
    window.openShiftModal = openShiftModal;
    window.closeShiftModal = closeShiftModal;
    window.showSimplifiedWarning = showSimplifiedWarning;
  
    window.openNewHostModal = openNewHostModal;
    window.closeNewHostModal = closeNewHostModal;
  
    window.openNewLocationModal = openNewLocationModal;
    window.closeNewLocationModal = closeNewLocationModal;
  
    window.saveNewHost = saveNewHost;
    window.saveNewLocation = saveNewLocation;
  
    window.openCopyShiftModal = openCopyShiftModal;
    window.closeCopyShiftModal = closeCopyShiftModal;
  
    window.clearAllShiftsForDay = clearAllShiftsForDay;
    window.closeClearDayModal = closeClearDayModal;
  
    window.toggleThemeField = toggleThemeField;
    window.autoSelectEndTime = autoSelectEndTime;
    window.validateShiftForm = validateShiftForm;
  
    window.handleProceedAnyway = handleProceedAnyway;
    window.selectDropdownOptionByValue = selectDropdownOptionByValue;
  })();