// modal-handlers.js
// Functions for handling modals and form submissions
//
// Updated 2026-02-27:
// - Drag/copy/move conflict override always routes through window.globalMoveOperation
// - Uses window.executeOverrideFromGlobalMoveOperation() (provided by drag-drop-handler.js) when present
// - Keeps existing “form conflict override” path (pendingShiftData) intact
// - Adds defensive helpers so we never depend on a stray globalMoveOperation var
// - Modal stack + backdrop-close only closes topmost modal
//
// Updated 2026-02-27 (later):
// - Align "Add New Host" roles selector with updated index.html (name="roles" inside #new-host-form)
//
// Updated 2026-02-27 (latest):
// - Pre-create check: deny creating employee if an existing employee doc has same email AND is active
//   (allows if found but inactive)
// - More robust functions region selection (window.FUNCTIONS_REGION / window.firebaseFunctionsRegion fallback)
// - Roles default to ["host"] if none selected (still supports explicit selection)

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
  
    function _getFunctionsRegion() {
      return (
        window.FUNCTIONS_REGION ||
        window.firebaseFunctionsRegion ||
        window.FIREBASE_FUNCTIONS_REGION ||
        "us-central1"
      );
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
  
    // ------------------------------------------------------------
    // ✅ Global move operation helpers
    // ------------------------------------------------------------
  
    function _getGlobalMoveOperation() {
      try {
        if (window.globalMoveOperation) return window.globalMoveOperation;
      } catch (_) {}
      try {
        if (window.CalendarState && window.CalendarState.globalMoveOperation) return window.CalendarState.globalMoveOperation;
      } catch (_) {}
      return null;
    }
  
    function _clearGlobalMoveOperation() {
      try {
        if (window.globalMoveOperation) window.globalMoveOperation = null;
      } catch (_) {}
      try {
        if (window.CalendarState && window.CalendarState.globalMoveOperation) window.CalendarState.globalMoveOperation = null;
      } catch (_) {}
    }
  
    // ------------------------------------------------------------
    // Shift modal
    // ------------------------------------------------------------
  
    function openShiftModal(dateStr) {
      const els = _getEls();
  
      // Reset warning state whenever opening form
      _setForceBookingFlag(false);
  
      // Ensure theme field visibility correct
      try {
        if (typeof toggleThemeField === "function") toggleThemeField();
      } catch (_) {}
  
      // Default date
      try {
        if (els.shiftDateInput) els.shiftDateInput.value = dateStr || "";
      } catch (_) {}
  
      _showModal(els.shiftModal || document.getElementById("shift-modal"), "shift-modal");
  
      setTimeout(() => {
        _scrollModalToTop(els.shiftModal || document.getElementById("shift-modal"));
        _safeFocus(els.shiftDateInput || document.getElementById("shift-date"));
      }, 60);
  
      try {
        if (typeof announceForScreenReader === "function") announceForScreenReader("Add new event form is open");
      } catch (_) {}
    }
  
    function closeShiftModal() {
      const els = _getEls();
  
      // Clear any pending data + flags
      _clearPendingShiftData();
      _setForceBookingFlag(false);
  
      _hideModal(els.shiftModal || document.getElementById("shift-modal"), "shift-modal");
    }
  
    // ------------------------------------------------------------
    // Warning modal
    // ------------------------------------------------------------
  
    function showWarningModal(conflicts, pendingData) {
      const els = _getEls();
  
      // Store pending shift data so the proceed button can use it
      try {
        if (window.CalendarState) window.CalendarState.pendingShiftData = pendingData;
      } catch (_) {}
      try {
        if (typeof state !== "undefined" && state) state.pendingShiftData = pendingData;
      } catch (_) {}
      try {
        if (window.state) window.state.pendingShiftData = pendingData;
      } catch (_) {}
  
      // Compose UI
      if (els.warningText) {
        const hostName =
          (typeof getEmployeeName === "function" ? getEmployeeName(pendingData.employeeId) : null) ||
          (window.employees && window.employees[pendingData.employeeId]) ||
          "This host";
  
        els.warningText.textContent = `${hostName} already has another event scheduled on this date.`;
      }
  
      if (els.conflictDetails) {
        els.conflictDetails.innerHTML = "";
  
        (conflicts || []).forEach((c) => {
          const div = document.createElement("div");
          div.className = "conflict-item";
  
          const who =
            (typeof getEmployeeName === "function" ? getEmployeeName(c.employeeId) : null) ||
            (window.employees && window.employees[c.employeeId]) ||
            "Unknown host";
  
          const typeName =
            (window.eventTypes && window.eventTypes[c.type]) ||
            (typeof getEventTypeName === "function" ? getEventTypeName(c.type) : c.type);
  
          const timeInfo = `${c.startTime} - ${c.endTime}`;
          const locationInfo = c.location || "No location";
  
          div.innerHTML = `
            <div class="conflict-event">${typeName}${c.theme ? ": " + c.theme : ""}</div>
            <div class="conflict-time">${timeInfo} with ${who}</div>
            <div class="conflict-location">${locationInfo}</div>
          `;
  
          els.conflictDetails.appendChild(div);
        });
      }
  
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
  
    function closeWarningModal() {
      const els = _getEls();
      _hideModal(els.warningModal || document.getElementById("warning-modal"), "warning-modal");
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
        const emailError = document.getElementById("email-error");
        if (emailError) emailError.style.display = "none";
        const rolesError = document.getElementById("roles-error");
        if (rolesError) rolesError.style.display = "none";
      } catch (_) {}
  
      _showModal(els.newHostModal || document.getElementById("new-host-modal"), "new-host-modal");
  
      setTimeout(() => {
        _scrollModalToTop(els.newHostModal || document.getElementById("new-host-modal"));
        _safeFocus(document.getElementById("new-host-email") || document.getElementById("new-host-firstname"));
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
  
      const firstName = (document.getElementById("new-host-firstname")?.value || "").trim();
      const lastName = (document.getElementById("new-host-lastname")?.value || "").trim();
      const nickname = (document.getElementById("new-host-nickname")?.value || "").trim();
      const phone = (document.getElementById("new-host-phone")?.value || "").trim();
      const emailRaw = (document.getElementById("new-host-email")?.value || "").trim();
      const email = emailRaw.toLowerCase();
  
      const emergencyContactName = (document.getElementById("new-host-emergency-contact")?.value || "").trim();
      const emergencyContactPhone = (document.getElementById("new-host-emergency-phone")?.value || "").trim();
      const employeeId = (document.getElementById("new-host-employee-id")?.value || "").trim();
      const isActive = !!document.getElementById("new-host-active")?.checked;
  
      // Roles — if none selected, default to host (keeps UI simple)
      const rolesBoxes = Array.from(document.querySelectorAll('#new-host-form input[name="roles"]:checked'));
      let roles = rolesBoxes
        .map((b) => (b.value || "").toLowerCase().trim())
        .filter(Boolean);
  
      if (!roles.length) roles = ["host"];
  
      const rolesError = document.getElementById("roles-error");
      if (rolesError) rolesError.style.display = "none";
  
      // Validate: email + nickname required only
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        _safeFocus(document.getElementById("new-host-email"));
        document.getElementById("new-host-email")?.reportValidity();
        return;
      }
      if (!nickname) {
        _safeFocus(document.getElementById("new-host-nickname"));
        document.getElementById("new-host-nickname")?.reportValidity();
        return;
      }
  
      const shortDisplayName = nickname || firstName || email;
      const nameSuffix = [firstName, lastName].filter(Boolean).join(" ");
      const fullDisplayName = nickname
        ? (nameSuffix ? `${nickname} (${nameSuffix})` : nickname)
        : (nameSuffix || email);
  
      const saveButton = document.getElementById("save-new-host");
      const originalButtonText = saveButton?.textContent || "Save Host";
      if (saveButton) {
        saveButton.textContent = "Creating...";
        saveButton.disabled = true;
      }
  
      // 1) Pre-check existing employee docs:
      //    deny only if there is an existing employee doc with same email AND active === true
      //    (allows if found but inactive)
      (async () => {
        const app = firebase.app();
        const db = firebase.firestore();
  
        // ✅ Email duplicate (ACTIVE ONLY) check (no composite index required)
        try {
          const snap = await db.collection("employees").where("email", "==", email).limit(5).get();
          if (!snap.empty) {
            const activeMatch = snap.docs.find((d) => {
              const data = d.data() || {};
              // treat missing active as active (safer)
              return data.email?.toLowerCase?.() === email && data.active !== false;
            });
  
            if (activeMatch) {
              const emailError = document.getElementById("email-error");
              if (emailError) emailError.style.display = "block";
              const emailField = document.getElementById("new-host-email");
              if (emailField) {
                emailField.focus();
                emailField.select();
              }
              throw Object.assign(new Error("Email already in use by an active employee"), { code: "calendar/email-already-active" });
            }
          }
        } catch (preErr) {
          // If we intentionally threw the "already active" error, bubble it up.
          if (String(preErr?.code || "") === "calendar/email-already-active") throw preErr;
  
          // Otherwise, if the check fails due to rules/index/network, we log and proceed to callable
          console.warn("[new-host] Active-email precheck failed, proceeding to callable:", preErr);
        }
  
        // Ensure signed-in admin
        const user =
          firebase.auth().currentUser ||
          (await new Promise((resolve) => {
            const off = firebase.auth().onAuthStateChanged((u) => {
              off();
              resolve(u || null);
            });
          }));
        if (!user) throw new Error("Sign in required");
  
        // Optional idToken passthrough (callable should rely on context.auth, but keep compatibility)
        const idToken = await user.getIdToken(true);
  
        const region = _getFunctionsRegion();
        const fns = app.functions(region);
        const callable = fns.httpsCallable("adminCreateEmployee");
  
        const res = await callable({ email, roles, idToken });
        const { uid } = res.data || {};
        if (!uid) throw new Error("Unexpected server response (missing uid).");
  
        // 2) Merge in profile fields to employees/{uid}
        const profileUpdate = {
          firstName,
          lastName,
          email,
          phone,
          nickname,
          employeeID: employeeId,
  
          // Canonical fields used by employees-management
          emergencyContact: emergencyContactName,
          emergencyContactPhone: emergencyContactPhone,
  
          // Legacy compatibility (some pages may still read these)
          emergencyContactName: emergencyContactName,
          emergencyName: emergencyContactName,
          emergencyPhone: emergencyContactPhone,
  
          active: isActive,
          roles,
          displayName: fullDisplayName,
          shortDisplayName,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };
  
        await db.collection("employees").doc(uid).set(
          {
            ...profileUpdate,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
  
        return uid;
      })()
        .then((uid) => {
          console.log("New host provisioned with UID:", uid);
  
          if (!window.employees) window.employees = {};
          window.employees[uid] = shortDisplayName;
  
          if (!window.employeesData) window.employeesData = {};
          window.employeesData[uid] = {
            id: uid,
            displayName: fullDisplayName,
            shortDisplayName,
            firstName,
            lastName,
            nickname,
            phone,
            email,
            employeeID: employeeId,
            emergencyContact: emergencyContactName,
            emergencyContactPhone: emergencyContactPhone,
            active: isActive,
            roles,
          };
  
          if (typeof addEmployeeToDropdowns === "function") {
            addEmployeeToDropdowns(uid, fullDisplayName);
          } else {
            const newOptionForFilter = document.createElement("option");
            newOptionForFilter.value = uid;
            newOptionForFilter.textContent = fullDisplayName;
            if (els.employeeSelect) els.employeeSelect.appendChild(newOptionForFilter);
  
            const newOptionForShift = document.createElement("option");
            newOptionForShift.value = uid;
            newOptionForShift.textContent = fullDisplayName;
            if (els.shiftEmployeeSelect) els.shiftEmployeeSelect.appendChild(newOptionForShift);
          }
  
          if (els.shiftEmployeeSelect) els.shiftEmployeeSelect.value = uid;
  
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
            if (typeof announceForScreenReader === "function") announceForScreenReader(`New host ${shortDisplayName} has been created`);
          } catch (_) {}
        })
        .catch((error) => {
          console.error("Error creating host:", error);
  
          const code = String(error?.code || "");
          const msg = `${code ? code + ": " : ""}${error?.message || String(error)}`;
  
          if (code === "calendar/email-already-active") {
            // UI already shown
            return;
          }
  
          // Auth duplicate (from callable)
          if (code.includes("already-exists") || code.includes("email-already") || msg.toLowerCase().includes("email")) {
            const emailError = document.getElementById("email-error");
            if (emailError) emailError.style.display = "block";
            const emailField = document.getElementById("new-host-email");
            if (emailField) {
              emailField.focus();
              emailField.select();
            }
            alert("That email address is already in use. Please use a different email.");
            return;
          }
  
          if (code.includes("permission-denied")) {
            alert("You do not have permission to create employees. Please check your login / admin role.");
          } else if (code.includes("unauthenticated") || msg.toLowerCase().includes("sign in")) {
            alert("You must be signed in as an admin to create a host.");
          } else {
            alert(`Error creating host: ${msg}`);
          }
        })
        .finally(() => {
          if (saveButton) {
            saveButton.textContent = originalButtonText;
            saveButton.disabled = false;
          }
        });
    }
  
    // ------------------------------------------------------------
    // Save new location
    // ------------------------------------------------------------
  
    function saveNewLocation(e) {
      e.preventDefault();
  
      const els = _getEls();
  
      const locationName = (document.getElementById("new-location-name")?.value || "").trim();
      const contactName = (document.getElementById("new-location-contact")?.value || "").trim();
      const phone = (document.getElementById("new-location-phone")?.value || "").trim();
      const email = (document.getElementById("new-location-email")?.value || "").trim();
      const schedule = (document.getElementById("new-location-schedule")?.value || "").trim();
      const notes = (document.getElementById("new-location-notes")?.value || "").trim();
      const isActive = !!document.getElementById("new-location-active")?.checked;
  
      if (!locationName) {
        alert("Please enter a venue name.");
        _safeFocus(document.getElementById("new-location-name"));
        return;
      }
  
      const newLocation = {
        name: locationName,
  
        // Canonical fields used by locations-management
        contactName,
        phone,
        email,
        schedule,
        notes,
        active: isActive,
  
        // Legacy compatibility (some older calendar code used `contact`)
        contact: contactName,
  
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
          console.log("New venue added with ID:", docRef.id);
  
          if (!window.locationsData) window.locationsData = {};
          // calendar uses venue *name* as the dropdown key; store the doc id too
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
            if (typeof announceForScreenReader === "function") announceForScreenReader(`New venue ${locationName} has been added`);
          } catch (_) {}
        })
        .catch((error) => {
          console.error("Error adding venue:", error);
  
          if (error.code === "permission-denied") {
            alert("You do not have permission to add venues. Please check your login status.");
          } else if (error.code === "unavailable" || (error.name === "FirebaseError" && error.message.includes("network"))) {
            alert("Network error. Please check your internet connection and try again.");
          } else {
            alert(`Error adding venue: ${error.message}`);
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
          if (
            typeof announceForScreenReader === "function" &&
            typeof getEventTypeName === "function" &&
            typeof getReadableDateString === "function"
          ) {
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
    }
  
    function closeClearDayModal() {
      const clearDayModal = document.getElementById("clear-day-modal");
      _hideModal(clearDayModal, "clear-day-modal");
    }
  
    // ------------------------------------------------------------
    // Backdrop click to close (topmost only)
    // ------------------------------------------------------------
  
    function initBackdropClose() {
      if (window.__calendarBackdropCloseInit) return;
      window.__calendarBackdropCloseInit = true;
  
      document.addEventListener("click", (e) => {
        const t = e.target;
        if (!t) return;

        // Close top modal when clicking the backdrop (the .modal wrapper div)
        // but NOT when clicking inside .modal-content
        const clickedBackdrop = t.classList && t.classList.contains("modal");
        const clickedOutside = !t.closest(".modal-content") && t.closest(".modal");

        if (clickedBackdrop || clickedOutside) {
          if (typeof window.closeTopModalIfAny === "function") {
            window.closeTopModalIfAny();
          }
        }
      });
    }
  
    // ------------------------------------------------------------
    // Attach event listeners once
    // ------------------------------------------------------------
  
    function initModalHandlers() {
      const els = _getEls();
  
      // Backdrop close
      initBackdropClose();
  
      // Shift modal close buttons
      const cancelShiftBtn = els.cancelShiftBtn || document.getElementById("cancel-shift");
      if (cancelShiftBtn && !cancelShiftBtn.__bound) {
        cancelShiftBtn.__bound = true;
        cancelShiftBtn.addEventListener("click", closeShiftModal);
      }
  
      // Warning modal buttons
      const cancelBookingBtn = els.cancelBookingBtn || document.getElementById("cancel-booking");
      if (cancelBookingBtn && !cancelBookingBtn.__bound) {
        cancelBookingBtn.__bound = true;
        cancelBookingBtn.addEventListener("click", () => {
          // If the warning came from a drag-drop move, clear the operation
          _clearGlobalMoveOperation();
  
          // If it came from form submission, clear pending shift data
          _clearPendingShiftData();
  
          closeWarningModal();
        });
      }
  
      const proceedBookingBtn = els.proceedBookingBtn || document.getElementById("proceed-booking");
      if (proceedBookingBtn && !proceedBookingBtn.__bound) {
        proceedBookingBtn.__bound = true;
        proceedBookingBtn.addEventListener("click", async () => {
          try {
            // 1) If we have a globalMoveOperation, always route through that
            const moveOp = _getGlobalMoveOperation();
            if (moveOp) {
              console.log("Proceeding with override for global move operation:", moveOp);
  
              // Preferred path: handler provided by drag-drop-handler.js
              if (typeof window.executeOverrideFromGlobalMoveOperation === "function") {
                await window.executeOverrideFromGlobalMoveOperation();
              } else if (typeof window.executeMoveOperationWithOverride === "function") {
                // legacy fallback if you ever had this
                await window.executeMoveOperationWithOverride(moveOp);
              } else {
                // last resort: try calling performShiftMove if present
                if (typeof window.performShiftMove === "function") {
                  await window.performShiftMove(moveOp.shiftId, moveOp.targetDateStr, true);
                } else {
                  throw new Error("No move-override executor found (executeOverrideFromGlobalMoveOperation/performShiftMove missing).");
                }
              }
  
              _clearGlobalMoveOperation();
              closeWarningModal();
              return;
            }
  
            // 2) Otherwise we are in the form conflict override path (pendingShiftData)
            const pending = _getPendingShiftData();
            if (!pending) {
              console.warn("No pendingShiftData found when proceeding; closing modal.");
              closeWarningModal();
              return;
            }
  
            // Set force booking and attempt save
            _setForceBookingFlag(true);
  
            if (typeof saveShift === "function") {
              await saveShift(true);
            } else if (typeof handleShiftFormSubmit === "function") {
              await handleShiftFormSubmit(true);
            } else {
              throw new Error("No save handler found (saveShift/handleShiftFormSubmit).");
            }
  
            // Clean up
            _clearPendingShiftData();
            closeWarningModal();
          } catch (err) {
            console.error("Proceed override failed:", err);
            alert(`Could not proceed with override: ${err?.message || String(err)}`);
          }
        });
      }
  
      // Clear day modal buttons
      const cancelClearDayBtn = document.getElementById("cancel-clear-day");
      if (cancelClearDayBtn && !cancelClearDayBtn.__bound) {
        cancelClearDayBtn.__bound = true;
        cancelClearDayBtn.addEventListener("click", closeClearDayModal);
      }
  
      const confirmClearDayBtn = document.getElementById("confirm-clear-day");
      if (confirmClearDayBtn && !confirmClearDayBtn.__bound) {
        confirmClearDayBtn.__bound = true;
        confirmClearDayBtn.addEventListener("click", async () => {
          const dateStr = confirmClearDayBtn.getAttribute("data-date");
          if (!dateStr) return;
  
          try {
            if (typeof deleteAllShiftsForDay === "function") {
              await deleteAllShiftsForDay(dateStr);
            } else if (typeof window.deleteAllShiftsForDay === "function") {
              await window.deleteAllShiftsForDay(dateStr);
            } else {
              throw new Error("deleteAllShiftsForDay() not found");
            }
            closeClearDayModal();
          } catch (err) {
            console.error("Error deleting all events for day:", err);
            alert(`Could not delete events: ${err?.message || String(err)}`);
          }
        });
      }
  
      // New host modal buttons
      const cancelNewHostBtn = els.cancelNewHostBtn || document.getElementById("cancel-new-host");
      if (cancelNewHostBtn && !cancelNewHostBtn.__bound) {
        cancelNewHostBtn.__bound = true;
        cancelNewHostBtn.addEventListener("click", closeNewHostModal);
      }
  
      const newHostForm = els.newHostForm || document.getElementById("new-host-form");
      if (newHostForm && !newHostForm.__bound) {
        newHostForm.__bound = true;
        newHostForm.addEventListener("submit", saveNewHost);
      }
  
      // Clear inline email error when user edits the email field
      const emailField = document.getElementById("new-host-email");
      if (emailField && !emailField.__errorBound) {
        emailField.__errorBound = true;
        emailField.addEventListener("input", () => {
          const emailError = document.getElementById("email-error");
          if (emailError) emailError.style.display = "none";
        });
      }
  
      // New location modal buttons
      const cancelNewLocationBtn = els.cancelNewLocationBtn || document.getElementById("cancel-new-location");
      if (cancelNewLocationBtn && !cancelNewLocationBtn.__bound) {
        cancelNewLocationBtn.__bound = true;
        cancelNewLocationBtn.addEventListener("click", closeNewLocationModal);
      }
  
      const newLocationForm = els.newLocationForm || document.getElementById("new-location-form");
      if (newLocationForm && !newLocationForm.__bound) {
        newLocationForm.__bound = true;
        newLocationForm.addEventListener("submit", saveNewLocation);
      }
  
      // Copy shift modal cancel
      const cancelCopyShiftBtn = document.getElementById("cancel-copy-shift");
      if (cancelCopyShiftBtn && !cancelCopyShiftBtn.__bound) {
        cancelCopyShiftBtn.__bound = true;
        cancelCopyShiftBtn.addEventListener("click", closeCopyShiftModal);
      }
    }
  
    // ------------------------------------------------------------
    // Public exports (used by other modules)
    // ------------------------------------------------------------
  
    window.openShiftModal = openShiftModal;
    window.closeShiftModal = closeShiftModal;
  
    window.showWarningModal = showWarningModal;
    window.showSimplifiedWarning = showSimplifiedWarning;
    window.closeWarningModal = closeWarningModal;
  
    window.openNewHostModal = openNewHostModal;
    window.closeNewHostModal = closeNewHostModal;
    window.saveNewHost = saveNewHost;
  
    window.openNewLocationModal = openNewLocationModal;
    window.closeNewLocationModal = closeNewLocationModal;
    window.saveNewLocation = saveNewLocation;
  
    window.openCopyShiftModal = openCopyShiftModal;
    window.closeCopyShiftModal = closeCopyShiftModal;
  
    window.clearAllShiftsForDay = clearAllShiftsForDay;
    window.closeClearDayModal = closeClearDayModal;
  
    window.initModalHandlers = initModalHandlers;

    // Auto-initialize so backdrop close and button wiring work without an explicit call
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initModalHandlers);
    } else {
      initModalHandlers();
    }
  })();