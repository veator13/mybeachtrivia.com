// modal-handlers.js
// Functions for handling modals and form submissions

/* ===========================
   Body scroll lock helpers
   Prevent background page from moving while a modal is open.
   =========================== */
   const _bodyScrollLock = { active: false, y: 0 };

   function lockBodyScroll() {
     if (_bodyScrollLock.active) return;
     _bodyScrollLock.active = true;
     _bodyScrollLock.y = window.scrollY || 0;
   
     // Freeze the page where it is
     document.body.style.position = "fixed";
     document.body.style.top = `-${_bodyScrollLock.y}px`;
     document.body.style.left = "0";
     document.body.style.right = "0";
     document.body.style.width = "100%";
   }
   
   function unlockBodyScroll() {
     if (!_bodyScrollLock.active) return;
     _bodyScrollLock.active = false;
   
     const y = _bodyScrollLock.y || 0;
   
     // Unfreeze + restore scroll
     document.body.style.position = "";
     document.body.style.top = "";
     document.body.style.left = "";
     document.body.style.right = "";
     document.body.style.width = "";
   
     window.scrollTo(0, y);
   }
   
   /* ===========================
      Shift modal
      =========================== */
   
   // Modal and form handling functions
   function openShiftModal(dateStr = null) {
     // Reset editing mode for new shifts
     state.isEditing = false;
     state.editingShiftId = null;
   
     // Update modal title and button text for adding
     elements.modalTitle.textContent = "Add New Event";
     elements.submitButton.textContent = "Save Event";
   
     // Reset form first
     elements.shiftForm.reset();
     elements.themeField.style.display = "none";
   
     // Set default date to selected date or today
     const defaultDate = dateStr || formatDate(new Date());
     elements.shiftDateInput.value = defaultDate;
   
     // Set default times
     const defaultTimes = getDefaultTimes();
     selectDropdownOptionByValue(elements.startTimeSelect, defaultTimes.start);
     selectDropdownOptionByValue(elements.endTimeSelect, defaultTimes.end);
   
     // Show the modal
     elements.shiftModal.style.display = "flex";
     elements.shiftModal.setAttribute("aria-hidden", "false");
   
     // Set focus on first field
     setTimeout(() => {
       elements.shiftEmployeeSelect.focus();
     }, 100);
   
     // Announce for screen readers
     announceForScreenReader(`Adding new event for ${getReadableDateString(new Date(defaultDate))}`);
   }
   
   function closeShiftModal() {
     // Save scroll position
     const scrollPosition = { x: window.scrollX, y: window.scrollY };
   
     elements.shiftModal.style.display = "none";
     elements.shiftModal.setAttribute("aria-hidden", "true");
   
     state.isEditing = false;
     state.editingShiftId = null;
   
     // Keep scroll stable
     setTimeout(() => {
       window.scrollTo(scrollPosition.x, scrollPosition.y);
     }, 10);
   }
   
   /**
    * Centralized closer for the double-book warning modal.
    */
   function closeWarningModal() {
     const scrollPosition = { x: window.scrollX, y: window.scrollY };
   
     // Clear pending override state (form conflict path)
     try {
       if (window.CalendarState) {
         window.CalendarState.pendingShiftData = null;
         window.CalendarState.forceBooking = false;
       } else if (typeof state !== "undefined") {
         state.pendingShiftData = null;
         state.forceBooking = false;
       }
     } catch (e) {
       console.warn("[calendar] Could not clear pending override state:", e);
     }
   
     // Hide the warning modal (with ARIA)
     if (elements.warningModal) {
       elements.warningModal.style.display = "none";
       elements.warningModal.setAttribute("aria-hidden", "true");
     }
   
     // Re-enable submit button if it was disabled during warning
     if (elements.submitButton) {
       try {
         elements.submitButton.disabled = false;
       } catch (_) {}
     }
   
     // Return focus but maintain scroll position
     if (elements.shiftModal && elements.shiftModal.style.display === "flex") {
       if (elements.submitButton && typeof elements.submitButton.focus === "function") {
         try {
           elements.submitButton.focus();
         } catch (_) {}
       }
     } else {
       setTimeout(() => {
         window.scrollTo(scrollPosition.x, scrollPosition.y);
       }, 10);
     }
   
     // Hide month navigation dropzones
     hideMonthNavigationDropzones();
   }
   // Expose globally so all modules use the same closer
   window.closeWarningModal = closeWarningModal;
   
   // A simplified warning message function
   function showSimplifiedWarning(employeeId) {
     console.log(`Showing warning for employee ${employeeId} with move operation:`, globalMoveOperation);
   
     const hostName = getEmployeeName(employeeId);
   
     elements.warningText.textContent = `${hostName} already has a shift scheduled on this date. Are you sure you want to proceed?`;
     elements.conflictDetails.innerHTML = "";
   
     elements.warningModal.style.display = "flex";
     elements.warningModal.setAttribute("aria-hidden", "false");
   
     setTimeout(() => {
       elements.cancelBookingBtn.focus();
     }, 100);
   
     announceForScreenReader(
       "Warning: Host already has a shift scheduled on this day. Please choose to proceed or cancel."
     );
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
   
   /* ============================================================
      NEW Host (Employee Provision) Modal
      - Requires email
      - Optional first/last/nickname
      - Roles checkboxes
      - Uses Cloud Function: adminCreateEmployee (callable)
      - Displays + copies password setup link
      ============================================================ */
   
   /**
    * Ensure #new-host-status renders directly ABOVE the email input row,
    * so errors/success messages are immediately visible.
    */
   function ensureNewHostStatusPlacement() {
     const statusEl = document.getElementById("new-host-status");
     const form = document.getElementById("new-host-form") || elements.newHostForm;
     const emailEl = document.getElementById("new-host-email");
   
     if (!statusEl || !form || !emailEl) return;
   
     const emailRow = emailEl.closest(".form-row") || emailEl.closest(".row") || emailEl.parentElement;
     if (!emailRow) return;
   
     // Move statusEl to be immediately before the email row inside the form
     if (statusEl.parentElement !== form || statusEl.nextElementSibling !== emailRow) {
       try {
         form.insertBefore(statusEl, emailRow);
       } catch (_) {
         // no-op
       }
     }
   }
   
   function openNewHostModal() {
     // Lock the background page so only modal content scrolls
     lockBodyScroll();
   
     // Reset the form first
     elements.newHostForm.reset();
   
     // Ensure modal title matches desired wording
     try {
       const h2 = elements.newHostModal?.querySelector("h2");
       if (h2) h2.textContent = "Create Employee";
     } catch (_) {}
   
     // Reset buttons back to "Create Employee" + show Cancel
     const saveButton = document.getElementById("save-new-host");
     const cancelBtn = document.getElementById("cancel-new-host") || elements.cancelNewHostBtn;
   
     if (saveButton) {
       saveButton.textContent = "Create Employee";
       saveButton.disabled = false;
       saveButton.removeAttribute("data-done-mode");
       saveButton.onclick = null; // remove any prior Done handler
     }
     if (cancelBtn) {
       cancelBtn.style.display = "";
       cancelBtn.disabled = false;
     }
   
     // Default roles: Host checked (others unchecked)
     const roleHost = document.getElementById("role-host");
     const roleAdmin = document.getElementById("role-admin");
     const roleRegional = document.getElementById("role-regional-manager");
     const roleSupply = document.getElementById("role-supply-manager");
     const roleWriter = document.getElementById("role-writer");
     const roleSocial = document.getElementById("role-social-media-manager");
   
     if (roleHost) roleHost.checked = true;
     if (roleAdmin) roleAdmin.checked = false;
     if (roleRegional) roleRegional.checked = false;
     if (roleSupply) roleSupply.checked = false;
     if (roleWriter) roleWriter.checked = false;
     if (roleSocial) roleSocial.checked = false;
   
     // Clear status + link UI
     const statusEl = document.getElementById("new-host-status");
     const wrap = document.getElementById("setup-link-wrap");
     const linkText = document.getElementById("setup-link-text");
   
     // ✅ Put status directly above email row
     ensureNewHostStatusPlacement();
   
     if (statusEl) {
       statusEl.classList.remove("success", "error");
       statusEl.textContent = "";
       statusEl.style.display = "none";
     }
     if (wrap) wrap.classList.remove("show");
     if (linkText) linkText.textContent = "";
   
     // Show the modal and fix aria-hidden
     elements.newHostModal.style.display = "flex";
     elements.newHostModal.setAttribute("aria-hidden", "false");
   
     // Focus email
     setTimeout(() => {
       const emailEl = document.getElementById("new-host-email");
       if (emailEl) emailEl.focus();
     }, 100);
   
     announceForScreenReader("Create employee form is open");
     console.log("Opening new host modal (employee provision)");
   }
   
   function closeNewHostModal() {
     // Move focus OUT of modal before hiding (prevents aria-hidden focus warnings)
     try {
       const safeFocusTarget = elements.addNewHostBtn || document.body;
       if (safeFocusTarget && typeof safeFocusTarget.focus === "function") safeFocusTarget.focus();
     } catch (_) {}
   
     elements.newHostModal.style.display = "none";
     elements.newHostModal.setAttribute("aria-hidden", "true");
   
     // Unlock background page scroll + restore original position
     unlockBodyScroll();
   
     // Return focus to the add new host button (if shift modal is still open)
     if (elements.shiftModal && elements.shiftModal.style.display === "flex") {
       setTimeout(() => {
         try {
           elements.addNewHostBtn.focus();
         } catch (_) {}
       }, 50);
     }
   }
   
   function _showNewHostStatus(message, type /* 'success' | 'error' */) {
     const statusEl = document.getElementById("new-host-status");
     if (!statusEl) return;
   
     // ✅ Ensure it’s located above the email row (even if DOM changed)
     ensureNewHostStatusPlacement();
   
     statusEl.classList.remove("success", "error");
     statusEl.classList.add(type === "success" ? "success" : "error");
     statusEl.textContent = message;
     statusEl.style.display = "block";
   }
   
   function _getSelectedRolesFromModal() {
     const roles = [];
   
     // NOTE: these strings MUST match what your adminCreateEmployee function expects
     const roleHost = document.getElementById("role-host");
     const roleAdmin = document.getElementById("role-admin");
     const roleRegional = document.getElementById("role-regional-manager");
     const roleSupply = document.getElementById("role-supply-manager");
     const roleWriter = document.getElementById("role-writer");
     const roleSocial = document.getElementById("role-social-media-manager");
   
     if (roleHost && roleHost.checked) roles.push("host");
     if (roleAdmin && roleAdmin.checked) roles.push("admin");
     if (roleRegional && roleRegional.checked) roles.push("regional-manager");
     if (roleSupply && roleSupply.checked) roles.push("supply-manager");
     if (roleWriter && roleWriter.checked) roles.push("writer");
     if (roleSocial && roleSocial.checked) roles.push("social-media-manager");
   
     // Ensure at least host
     if (roles.length === 0) roles.push("host");
   
     return roles;
   }
   
   async function _copyToClipboard(text) {
     try {
       await navigator.clipboard.writeText(text);
       return true;
     } catch (e) {
       // Fallback
       try {
         const ta = document.createElement("textarea");
         ta.value = text;
         ta.setAttribute("readonly", "");
         ta.style.position = "absolute";
         ta.style.left = "-9999px";
         document.body.appendChild(ta);
         ta.select();
         document.execCommand("copy");
         document.body.removeChild(ta);
         return true;
       } catch (_) {
         return false;
       }
     }
   }
   
   function _scrollNewHostModalToBottomSmooth() {
     // The scrollable element for this modal is the form itself per your CSS (#new-host-form overflow-y:auto)
     const scroller = document.getElementById("new-host-form") || elements.newHostForm;
     if (!scroller) return;
   
     // Let layout settle, then scroll the modal only
     requestAnimationFrame(() => {
       requestAnimationFrame(() => {
         try {
           scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
         } catch (_) {
           scroller.scrollTop = scroller.scrollHeight;
         }
       });
     });
   }
   
   /**
    * Extract a meaningful error code from Firebase callable errors.
    * Works for both:
    *  - Firebase Functions callable errors (error.code like "functions/already-exists")
    *  - Custom HttpsError (error.details / message)
    */
   function _getCallableErrorCode(error) {
     const raw = String(error?.code || "");
     if (raw.startsWith("functions/")) return raw.slice("functions/".length);
     // Sometimes Firebase gives "already-exists" directly in older SDKs
     if (raw) return raw;
     return "";
   }
   
   // Save new host (provisions employee user and shows setup link)
   async function saveNewHost(e) {
     e.preventDefault();
   
     const emailEl = document.getElementById("new-host-email");
     const firstNameEl = document.getElementById("new-host-firstname");
     const lastNameEl = document.getElementById("new-host-lastname");
     const nicknameEl = document.getElementById("new-host-nickname");
   
     const email = (emailEl?.value || "").trim();
     const firstName = (firstNameEl?.value || "").trim();
     const lastName = (lastNameEl?.value || "").trim();
     const nickname = (nicknameEl?.value || "").trim();
   
     if (!email) {
       _showNewHostStatus("Email is required.", "error");
       if (emailEl) emailEl.focus();
       return;
     }
   
     const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
     if (!emailLooksValid) {
       _showNewHostStatus("Please enter a valid email address.", "error");
       if (emailEl) emailEl.focus();
       return;
     }
   
     const roles = _getSelectedRolesFromModal();
   
     const saveButton = document.getElementById("save-new-host");
     const cancelBtn = document.getElementById("cancel-new-host") || elements.cancelNewHostBtn;
   
     // If already converted to Done mode, just close.
     if (saveButton && saveButton.getAttribute("data-done-mode") === "1") {
       closeNewHostModal();
       return;
     }
   
     const originalButtonText = saveButton ? saveButton.textContent : "Create Employee";
     if (saveButton) {
       saveButton.textContent = "Creating…";
       saveButton.disabled = true;
     }
     if (cancelBtn) {
       try {
         cancelBtn.disabled = true;
       } catch (_) {}
     }
   
     // Clear any previous status/link
     const statusEl = document.getElementById("new-host-status");
     const wrap = document.getElementById("setup-link-wrap");
     const linkText = document.getElementById("setup-link-text");
     const copyBtn = document.getElementById("copy-setup-link-btn");
     const openBtn = document.getElementById("open-setup-link-btn");
   
     // ✅ Make sure status sits above email before we show anything
     ensureNewHostStatusPlacement();
   
     if (statusEl) {
       statusEl.classList.remove("success", "error");
       statusEl.textContent = "";
       statusEl.style.display = "none";
     }
     if (wrap) wrap.classList.remove("show");
     if (linkText) linkText.textContent = "";
     if (copyBtn) copyBtn.onclick = null;
     if (openBtn) openBtn.onclick = null;
   
     try {
       if (!firebase?.functions) {
         throw new Error("Firebase Functions SDK not available. Did you include firebase-functions-compat.js?");
       }
   
       const adminCreateEmployee = firebase.functions().httpsCallable("adminCreateEmployee");
   
       const result = await adminCreateEmployee({
         email,
         roles,
         firstName: firstName || "",
         lastName: lastName || "",
         nickname: nickname || "",
       });
   
       const payload = result?.data || {};
       const uid = payload.uid;
       const passwordSetupLink = payload.passwordSetupLink || payload.link || payload.resetLink;
   
       if (!uid) console.warn("[calendar] adminCreateEmployee response missing uid:", payload);
   
       // Patch employee doc with optional name fields (merge)
       if (uid && (firstName || lastName || nickname)) {
         const patch = {};
         if (firstName) patch.firstName = firstName;
         if (lastName) patch.lastName = lastName;
         if (nickname) patch.nickname = nickname;
   
         try {
           await firebase.firestore().collection("employees").doc(uid).set(patch, { merge: true });
         } catch (e) {
           console.warn("[calendar] Could not patch employee name fields:", e);
         }
       }
   
       const displayName =
         nickname && firstName && lastName
           ? `${nickname} (${firstName} ${lastName})`
           : firstName && lastName
             ? `${firstName} ${lastName}`
             : nickname
               ? nickname
               : email;
   
       // Keep global caches in sync
       if (!window.employees) window.employees = {};
       window.employees[uid || email] = displayName;
   
       if (!window.employeesData) window.employeesData = {};
       if (uid) {
         window.employeesData[uid] = {
           id: uid,
           email,
           firstName: firstName || "",
           lastName: lastName || "",
           nickname: nickname || "",
           roles,
           active: true,
           displayName,
           shortDisplayName: nickname || firstName || lastName || email,
         };
       }
   
       // Add to dropdowns
       if (typeof addEmployeeToDropdowns === "function") {
         addEmployeeToDropdowns(uid, displayName);
       } else {
         const opt1 = document.createElement("option");
         opt1.value = uid;
         opt1.textContent = displayName;
         elements.employeeSelect.appendChild(opt1);
   
         const opt2 = document.createElement("option");
         opt2.value = uid;
         opt2.textContent = displayName;
         elements.shiftEmployeeSelect.appendChild(opt2);
       }
   
       if (uid) elements.shiftEmployeeSelect.value = uid;
   
       // Show setup link
       if (passwordSetupLink) {
         if (linkText) linkText.textContent = passwordSetupLink;
         if (wrap) wrap.classList.add("show");
   
         if (copyBtn) {
           copyBtn.onclick = async () => {
             const ok = await _copyToClipboard(passwordSetupLink);
             _showNewHostStatus(
               ok ? "Setup link copied to clipboard." : "Could not copy link automatically—please copy it manually.",
               ok ? "success" : "error"
             );
           };
         }
   
         if (openBtn) {
           openBtn.onclick = () => {
             try {
               window.open(passwordSetupLink, "_blank", "noopener");
             } catch (_) {}
           };
         }
   
         // Auto-copy once on success
         await _copyToClipboard(passwordSetupLink);
   
         _showNewHostStatus("Employee created. Password setup link generated and copied.", "success");
   
         // ✅ Scroll ALL THE WAY down (inside the modal scroller only)
         _scrollNewHostModalToBottomSmooth();
       } else {
         _showNewHostStatus("Employee created, but no setup link was returned by the server.", "success");
         _scrollNewHostModalToBottomSmooth();
       }
   
       // Convert modal buttons to a single Done button
       if (cancelBtn) cancelBtn.style.display = "none";
   
       if (saveButton) {
         saveButton.textContent = "Done";
         saveButton.disabled = false;
         saveButton.setAttribute("data-done-mode", "1");
         saveButton.onclick = () => closeNewHostModal();
       }
   
       announceForScreenReader("Employee created. Password setup link is ready.");
     } catch (error) {
       console.error("[calendar] Error provisioning employee:", error);
   
       const code = _getCallableErrorCode(error);
       const msgLower = String(error?.message || "").toLowerCase();
   
       if (code === "permission-denied" || msgLower.includes("permission")) {
         _showNewHostStatus("You do not have permission to create employees. Please check your admin login.", "error");
       } else if (code === "unauthenticated" || msgLower.includes("unauthenticated")) {
         _showNewHostStatus("You must be signed in to create employees. Please sign in and try again.", "error");
       } else if (code === "already-exists" || msgLower.includes("already") || msgLower.includes("exists")) {
         _showNewHostStatus("That email already exists. Creation blocked. Use the existing employee instead.", "error");
       } else {
         _showNewHostStatus(`Error creating employee: ${error?.message || "Unknown error"}`, "error");
       }
     } finally {
       // Only restore create button state if we did NOT switch to Done mode
       if (saveButton && saveButton.getAttribute("data-done-mode") !== "1") {
         saveButton.textContent = originalButtonText;
         saveButton.disabled = false;
         saveButton.onclick = null;
       }
       if (cancelBtn) {
         try {
           cancelBtn.disabled = false;
         } catch (_) {}
       }
     }
   }
   
   /* ===========================
      New location modal functions
      =========================== */
   
   function openNewLocationModal() {
     elements.newLocationForm.reset();
   
     elements.newLocationModal.style.display = "flex";
     elements.newLocationModal.setAttribute("aria-hidden", "false");
   
     setTimeout(() => {
       elements.newLocationNameInput.focus();
     }, 100);
   
     announceForScreenReader("Add new location form is open");
     console.log("Opening new location modal");
   }
   
   function closeNewLocationModal() {
     elements.newLocationModal.style.display = "none";
     elements.newLocationModal.setAttribute("aria-hidden", "true");
   
     if (elements.shiftModal.style.display === "flex") {
       setTimeout(() => {
         elements.addNewLocationBtn.focus();
       }, 100);
     }
   }
   
   // UPDATED: Save new location with extended fields and Firebase integration
   function saveNewLocation(e) {
     e.preventDefault();
   
     const locationName = document.getElementById("new-location-name").value.trim();
     const address = document.getElementById("new-location-address").value.trim();
     const contact = document.getElementById("new-location-contact").value.trim();
     const phone = document.getElementById("new-location-phone").value.trim();
     const email = document.getElementById("new-location-email").value.trim();
     const isActive = document.getElementById("new-location-active").checked;
   
     if (!locationName) {
       alert("Please enter a name for the new location.");
       document.getElementById("new-location-name").focus();
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
           elements.locationSelect.appendChild(newOptionForFilter);
   
           const newOptionForShift = document.createElement("option");
           newOptionForShift.value = locationName;
           newOptionForShift.textContent = locationName;
           elements.shiftLocationSelect.appendChild(newOptionForShift);
         }
   
         elements.shiftLocationSelect.value = locationName;
   
         document.getElementById("new-location-form").reset();
         closeNewLocationModal();
   
         elements.shiftNotesInput.focus();
         announceForScreenReader(`New location ${locationName} has been added`);
         console.log("New location added successfully:", locationName);
       })
       .catch((error) => {
         console.error("Error adding location to Firebase:", error);
   
         if (error.code === "permission-denied") {
           alert("You do not have permission to add locations. Please check your login status.");
         } else if (
           error.code === "unavailable" ||
           (error.name === "FirebaseError" && error.message.includes("network"))
         ) {
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
   
   /* ===========================
      Copy shift modal helpers
      =========================== */
   
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
   
       const shift = shifts.find((s) => s.id === shiftId);
       if (!shift) {
         console.error(`Shift with ID ${shiftId} not found`);
         return;
       }
   
       state.copyingShiftId = shiftId;
   
       const copyShiftForm = document.getElementById("copy-shift-form");
       if (copyShiftForm) copyShiftForm.reset();
       if (recurringOptionsField) recurringOptionsField.style.display = "none";
   
       const originalDate = new Date(shift.date);
       const defaultDate = new Date(originalDate);
       defaultDate.setDate(defaultDate.getDate() + 7);
   
       if (copyDateInput) copyDateInput.value = formatDate(defaultDate);
   
       copyShiftModal.style.display = "flex";
       copyShiftModal.setAttribute("aria-hidden", "false");
   
       setTimeout(() => {
         if (copyMethodSelect) copyMethodSelect.focus();
       }, 100);
   
       announceForScreenReader(`Copying event ${getEventTypeName(shift.type)} from ${getReadableDateString(originalDate)}`);
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
   
       copyShiftModal.style.display = "none";
       copyShiftModal.setAttribute("aria-hidden", "true");
   
       state.copyingShiftId = null;
   
       setTimeout(() => {
         window.scrollTo(scrollPosition.x, scrollPosition.y);
       }, 10);
     } catch (error) {
       console.error("Error closing copy shift modal:", error);
     }
   }
   
   /* ===========================
      Clear day modal helpers
      =========================== */
   
   function clearAllShiftsForDay(dateStr) {
     const shiftsForDay = getShiftsForDate(dateStr);
   
     if (shiftsForDay.length === 0) {
       alert("No events to clear for this date.");
       return;
     }
   
     const dateObj = new Date(dateStr);
     const formattedDate = getReadableDateString(dateObj);
   
     document.getElementById("clear-day-title").textContent = `Clear Events for ${formattedDate}`;
     document.getElementById("clear-day-warning").textContent = `Are you sure you want to delete all ${shiftsForDay.length} events on ${formattedDate}? This action cannot be undone.`;
   
     const eventsContainer = document.getElementById("day-events-list");
     eventsContainer.innerHTML = "";
   
     const countElement = document.createElement("div");
     countElement.className = "event-count";
     countElement.textContent = `${shiftsForDay.length} event${shiftsForDay.length > 1 ? "s" : ""} will be permanently deleted:`;
     eventsContainer.appendChild(countElement);
   
     shiftsForDay.forEach((shift) => {
       const shiftItem = document.createElement("div");
       shiftItem.className = "conflict-item";
   
       const employeeName = employees[shift.employeeId] || "Unknown host";
       const eventType = eventTypes[shift.type] || shift.type;
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
     clearDayModal.style.display = "flex";
     clearDayModal.setAttribute("aria-hidden", "false");
   
     setTimeout(() => {
       document.getElementById("cancel-clear-day").focus();
     }, 100);
   
     announceForScreenReader(`Confirm clearing ${shiftsForDay.length} events on ${formattedDate}`);
   }
   
   function closeClearDayModal() {
     const modal = document.getElementById("clear-day-modal");
     if (modal) {
       modal.style.display = "none";
       modal.setAttribute("aria-hidden", "true");
     }
   
     const confirmButton = document.getElementById("confirm-clear-day");
     if (confirmButton) {
       confirmButton.removeAttribute("data-date");
       confirmButton.removeAttribute("data-week-index");
     }
   }
   
   /* ===========================
      Form helpers
      =========================== */
   
   function toggleThemeField() {
     if (elements.shiftTypeSelect.value === "themed-trivia") {
       elements.themeField.style.display = "block";
       elements.shiftThemeInput.setAttribute("required", "required");
     } else {
       elements.themeField.style.display = "none";
       elements.shiftThemeInput.removeAttribute("required");
       elements.shiftThemeInput.value = "";
     }
   }
   
   function autoSelectEndTime() {
     if (elements.startTimeSelect.value) {
       const startTimeIndex = elements.startTimeSelect.selectedIndex;
       const endTimeIndex = Math.min(startTimeIndex + 8, elements.endTimeSelect.options.length - 1);
       elements.endTimeSelect.selectedIndex = endTimeIndex;
     }
   }
   
   function validateShiftForm() {
     if (!elements.shiftDateInput.value) {
       alert("Please select a date for the event.");
       elements.shiftDateInput.focus();
       return false;
     }
   
     if (!elements.shiftEmployeeSelect.value) {
       alert("Please select a host for the event.");
       elements.shiftEmployeeSelect.focus();
       return false;
     }
   
     if (!elements.startTimeSelect.value) {
       alert("Please select a start time for the event.");
       elements.startTimeSelect.focus();
       return false;
     }
   
     if (!elements.endTimeSelect.value) {
       alert("Please select an end time for the event.");
       elements.endTimeSelect.focus();
       return false;
     }
   
     if (!elements.shiftTypeSelect.value) {
       alert("Please select an event type.");
       elements.shiftTypeSelect.focus();
       return false;
     }
   
     if (elements.shiftTypeSelect.value === "themed-trivia" && !elements.shiftThemeInput.value.trim()) {
       alert("Please enter a theme for the themed trivia event.");
       elements.shiftThemeInput.focus();
       return false;
     }
   
     if (!elements.shiftLocationSelect.value) {
       alert("Please select a location for the event.");
       elements.shiftLocationSelect.focus();
       return false;
     }
   
     return true;
   }