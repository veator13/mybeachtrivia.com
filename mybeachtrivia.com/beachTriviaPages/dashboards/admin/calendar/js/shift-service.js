// shift-service.js
// Shared service for consistent shift data handling between dashboard and calendar
// v2026-03-19
//
// ✅ Updates in this version:
// - Expose DateHelpers to window (optional) for debugging / reuse
// - Add explicit "override" helpers that always bypass conflicts:
//     - forceSaveShift()
//     - forceUpdateShift()
// - Improve conflict error payload so UI can show details consistently:
//     err.code = "double-booking"
//     err.details = { date, employeeId, conflicts: [...] }
// - Standardize `date` on writes AND reads and ensure writes
//   always store `date` as YYYY-MM-DD string.
// - NEW: create host-only notification records when a shift is:
//     - newly assigned      -> type: "shift_assigned"
//     - reassigned away     -> type: "shift_reassigned"
//     - removed/deleted     -> type: "shift_removed"
//   collection: hostNotifications
//   These are intended for bt-nav.js bell notifications.

(function () {
  /**
   * Small utilities (local fallback if global DateUtils isn't present)
   */
  const DateHelpers = {
    toYMD(input) {
      if (!input) return "";
      if (typeof input === "string") {
        const m = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) return input;
        const d = new Date(input);
        if (isNaN(d)) return String(input);
        return this.toYMD(d);
      }
      if (input instanceof Date) {
        const y = input.getFullYear();
        const m = String(input.getMonth() + 1).padStart(2, "0");
        const d = String(input.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
      return String(input);
    },
    std(input) {
      if (typeof window.DateUtils?.standardizeDate === "function") {
        try {
          return window.DateUtils.standardizeDate(input);
        } catch (_) {}
      }
      return this.toYMD(input);
    },
    toMinutes(hhmm) {
      if (!hhmm) return null;
      const m = String(hhmm).match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
      return h * 60 + min;
    },
    rangesOverlap(aStart, aEnd, bStart, bEnd) {
      if (
        aStart == null ||
        aEnd == null ||
        bStart == null ||
        bEnd == null ||
        !Number.isFinite(aStart) ||
        !Number.isFinite(aEnd) ||
        !Number.isFinite(bStart) ||
        !Number.isFinite(bEnd)
      ) {
        // conservative: treat missing times as conflict
        return true;
      }
      if (aEnd <= aStart || bEnd <= bStart) return true;
      return aStart < bEnd && bStart < aEnd;
    },
  };

  // Optional: make available globally for debugging/tools
  window.CalendarDateHelpers = window.CalendarDateHelpers || DateHelpers;

  class ShiftService {
    constructor() {
      this.db = null;
      this.initialized = false;
      this.initPromise = null;
      this.dataChangeListeners = [];
      this.lastSyncTimestamp = null;
      this.lastPermissionError = null;

      this.HOST_NOTIFICATIONS_COLLECTION = "hostNotifications";
      this.NOTIF_SHIFT_ASSIGNED = "shift_assigned";
      this.NOTIF_SHIFT_REASSIGNED = "shift_reassigned";
      this.NOTIF_SHIFT_REMOVED = "shift_removed";
    }

    init() {
      if (this.initialized) return Promise.resolve();
      if (this.initPromise) return this.initPromise;

      this.initPromise = new Promise((resolve, reject) => {
        const attach = () => {
          try {
            this.db = firebase.firestore();
            this.initialized = true;
            console.log("[ShiftService] Initialized with Firestore");
            resolve();
          } catch (err) {
            reject(err);
          }
        };

        if (typeof window.firebase !== "undefined" && firebase?.firestore) {
          attach();
          return;
        }

        const start = Date.now();
        const poll = setInterval(() => {
          if (typeof window.firebase !== "undefined" && firebase?.firestore) {
            clearInterval(poll);
            clearTimeout(timeout);
            attach();
          } else if (Date.now() - start > 5000) {
            clearInterval(poll);
            clearTimeout(timeout);
            reject(new Error("[ShiftService] Firebase not initialized after timeout"));
          }
        }, 100);

        const timeout = setTimeout(() => {
          clearInterval(poll);
          reject(new Error("[ShiftService] Firebase init wait timed out"));
        }, 6000);
      });

      return this.initPromise;
    }

    addDataChangeListener(callback) {
      if (typeof callback === "function") this.dataChangeListeners.push(callback);
    }

    notifyDataChange() {
      this.lastSyncTimestamp = null;
      for (const fn of this.dataChangeListeners) {
        try {
          fn();
        } catch (e) {
          console.error("[ShiftService] Listener error:", e);
        }
      }
    }

    async _safe(call, context) {
      try {
        const res = await call();
        this.lastPermissionError = null;
        return res;
      } catch (err) {
        const code = err?.code || err?.name || "unknown";
        if (String(code).includes("permission-denied")) {
          this.lastPermissionError = { at: context, error: err };
          console.error(`[ShiftService] Permission denied at ${context}:`, err);
        } else {
          console.error(`[ShiftService] Error at ${context}:`, err);
        }
        throw err;
      }
    }

    _mapDocToShift(doc) {
      const d = doc.data() || {};
      const date = DateHelpers.std(d.date);
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
        date,
        startTime: d.startTime,
        endTime: d.endTime,
      };
    }

    _getCurrentActor() {
      try {
        const user = window.firebase?.auth?.().currentUser || null;
        return {
          uid: user?.uid || null,
          name: user?.displayName || user?.email || "Admin",
        };
      } catch (_) {
        return {
          uid: null,
          name: "Admin",
        };
      }
    }

    _normalizeShiftForNotification(shiftData) {
      const data = shiftData || {};
      const normalizedDate = DateHelpers.std(data.date);
      return {
        date: normalizedDate,
        shiftDate: normalizedDate,
        startTime: data.startTime || "",
        endTime: data.endTime || "",
        location: data.location || "",
        venueName: data.location || "",
        locationName: data.location || "",
        eventType: data.type || "",
        type: data.type || "",
        theme: data.theme || "",
        employeeId: data.employeeId || null,
      };
    }

    _shouldNotifyAssignment(previousShift, nextShift) {
      const prevEmployeeId = previousShift?.employeeId || null;
      const nextEmployeeId = nextShift?.employeeId || null;

      if (!nextEmployeeId) return false;
      if (!prevEmployeeId && nextEmployeeId) return true;
      if (prevEmployeeId && nextEmployeeId && String(prevEmployeeId) !== String(nextEmployeeId)) return true;

      return false;
    }

    _shouldNotifyReassignment(previousShift, nextShift) {
      const prevEmployeeId = previousShift?.employeeId || null;
      const nextEmployeeId = nextShift?.employeeId || null;

      return !!(
        prevEmployeeId &&
        nextEmployeeId &&
        String(prevEmployeeId) !== String(nextEmployeeId)
      );
    }

    _shouldNotifyRemoval(previousShift) {
      return !!(previousShift?.employeeId || null);
    }

    async _createHostNotification(type, targetHostId, shiftId, shiftData, extra = {}) {
      if (!targetHostId) return null;

      const normalized = this._normalizeShiftForNotification(shiftData);
      const actor = this._getCurrentActor();

      const payload = {
        type,
        _notifType: type,
        targetHostId: String(targetHostId),
        shiftId: String(shiftId),
        shiftDate: normalized.shiftDate,
        date: normalized.date,
        startTime: normalized.startTime,
        endTime: normalized.endTime,
        time: normalized.startTime,
        location: normalized.location,
        locationName: normalized.locationName,
        venueName: normalized.venueName,
        eventType: normalized.eventType,
        shiftType: normalized.type,
        theme: normalized.theme,
        assignedBy: actor.uid,
        assignedByName: actor.name,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        ...extra,
      };
      const uid = String(targetHostId);
      const notificationRef = await this.db.collection(this.HOST_NOTIFICATIONS_COLLECTION).add(payload);

      // Best effort: increment unread counter. Notification creation should not
      // fail if this secondary write is temporarily blocked.
      try {
        await this.db.collection("userBellState").doc(uid).set(
          {
            unreadCount: firebase.firestore.FieldValue.increment(1),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } catch (bellErr) {
        console.error("[ShiftService] Failed to increment userBellState unreadCount:", bellErr);
      }

      return notificationRef;
    }

    async _createShiftAssignedNotification(shiftId, shiftData, options = {}) {
      const normalized = this._normalizeShiftForNotification(shiftData);
      if (!normalized.employeeId) return null;

      return this._createHostNotification(
        this.NOTIF_SHIFT_ASSIGNED,
        normalized.employeeId,
        shiftId,
        shiftData,
        options.previousEmployeeId ? { previousEmployeeId: options.previousEmployeeId } : {}
      );
    }

    async _createShiftReassignedNotification(shiftId, previousEmployeeId, shiftData, options = {}) {
      if (!previousEmployeeId) return null;

      return this._createHostNotification(
        this.NOTIF_SHIFT_REASSIGNED,
        previousEmployeeId,
        shiftId,
        shiftData,
        options.newEmployeeId ? { newEmployeeId: options.newEmployeeId } : {}
      );
    }

    async _createShiftRemovedNotification(shiftId, previousEmployeeId, shiftData) {
      if (!previousEmployeeId) return null;

      return this._createHostNotification(
        this.NOTIF_SHIFT_REMOVED,
        previousEmployeeId,
        shiftId,
        shiftData
      );
    }

    // ---------- CONFLICT CHECK ----------
    // Returns an array of conflicting shifts for the same employee/date (time overlap checked if both ranges parse).
    async checkConflicts({ date, employeeId, startTime, endTime }, { ignoreShiftId = null } = {}) {
      await this.init();
      const day = DateHelpers.std(date);
      if (!day || !employeeId) return [];

      return this._safe(async () => {
        const qs = await this.db
          .collection("shifts")
          .where("employeeId", "==", employeeId)
          .where("date", "==", day)
          .get();

        const aStart = DateHelpers.toMinutes(startTime);
        const aEnd = DateHelpers.toMinutes(endTime);

        const out = [];
        qs.forEach((doc) => {
          if (ignoreShiftId && String(doc.id) === String(ignoreShiftId)) return;
          const s = this._mapDocToShift(doc);

          const bStart = DateHelpers.toMinutes(s.startTime);
          const bEnd = DateHelpers.toMinutes(s.endTime);

          const overlaps = DateHelpers.rangesOverlap(aStart, aEnd, bStart, bEnd);
          if (overlaps) out.push(s);
        });

        return out;
      }, "checkConflicts").catch(() => []);
    }

    // ---------- READS ----------
    async getHostShifts(hostId) {
      await this.init();
      if (!hostId) return [];

      return this._safe(async () => {
        const qs = await this.db.collection("shifts").where("employeeId", "==", hostId).get();
        const out = [];
        qs.forEach((doc) => out.push(this._mapDocToShift(doc)));
        this.lastSyncTimestamp = Date.now();
        console.log("[ShiftService] Host shifts loaded:", out.length);
        return out;
      }, "getHostShifts").catch(() => []);
    }

    async getShiftsByDateRange(startDate, endDate) {
      await this.init();
      const start = DateHelpers.std(startDate);
      const end = DateHelpers.std(endDate);

      if (!start || !end) return this.getAllShifts();

      return this._safe(async () => {
        const qs = await this.db
          .collection("shifts")
          .where("date", ">=", start)
          .where("date", "<=", end)
          .get();

        const out = [];
        qs.forEach((doc) => out.push(this._mapDocToShift(doc)));
        this.lastSyncTimestamp = Date.now();
        console.log("[ShiftService] Range shifts loaded:", out.length, `(${start} → ${end})`);
        return out;
      }, "getShiftsByDateRange").catch(async (err) => {
        if (String(err?.code).includes("failed-precondition")) {
          console.warn("[ShiftService] Missing index for date range; falling back to client filter.");
          const all = await this.getAllShifts();
          return all.filter((s) => s.date >= start && s.date <= end);
        }
        return [];
      });
    }

    async getShiftsForDate(dateStr) {
      await this.init();
      const day = DateHelpers.std(dateStr);
      if (!day) return [];

      return this._safe(async () => {
        const qs = await this.db.collection("shifts").where("date", "==", day).get();
        const out = [];
        qs.forEach((doc) => out.push(this._mapDocToShift(doc)));
        console.log(`[ShiftService] Shifts for ${day}:`, out.length);
        return out;
      }, "getShiftsForDate").catch(() => []);
    }

    async getAllShifts() {
      await this.init();
      return this._safe(async () => {
        const qs = await this.db.collection("shifts").get();
        const out = [];
        qs.forEach((doc) => out.push(this._mapDocToShift(doc)));
        this.lastSyncTimestamp = Date.now();
        console.log("[ShiftService] All shifts loaded:", out.length);
        return out;
      }, "getAllShifts").catch(() => []);
    }

    // ---------- WRITES ----------
    // Options:
    //  - force: true => bypass conflict check (used for override flows)
    //  - allowConflicts: true => alias for force
    async saveShift(shiftData, options = {}) {
      await this.init();
      const data = { ...shiftData };
      data.date = DateHelpers.std(data.date);
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();

      const bypass = !!(options.force || options.allowConflicts);
      if (!bypass && data.employeeId && data.date) {
        const conflicts = await this.checkConflicts(
          { date: data.date, employeeId: data.employeeId, startTime: data.startTime, endTime: data.endTime },
          {}
        );
        if (conflicts.length) {
          const err = new Error("Double-booking conflict");
          err.code = "double-booking";
          err.details = { date: data.date, employeeId: data.employeeId, conflicts };
          throw err;
        }
      }

      return this._safe(async () => {
        const docRef = await this.db.collection("shifts").add(data);

        if (data.employeeId) {
          try {
            await this._createShiftAssignedNotification(docRef.id, data);
          } catch (notifyErr) {
            console.error("[ShiftService] Failed to create shift assigned notification:", notifyErr);
          }
        }

        console.log("[ShiftService] Shift saved:", docRef.id);
        this.notifyDataChange();
        return docRef.id;
      }, "saveShift");
    }

    async updateShift(shiftId, shiftData, options = {}) {
      await this.init();
      const data = { ...shiftData };
      data.date = DateHelpers.std(data.date);
      data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

      const bypass = !!(options.force || options.allowConflicts);
      if (!bypass && data.employeeId && data.date) {
        const conflicts = await this.checkConflicts(
          { date: data.date, employeeId: data.employeeId, startTime: data.startTime, endTime: data.endTime },
          { ignoreShiftId: shiftId }
        );
        if (conflicts.length) {
          const err = new Error("Double-booking conflict");
          err.code = "double-booking";
          err.details = { date: data.date, employeeId: data.employeeId, conflicts };
          throw err;
        }
      }

      return this._safe(async () => {
        const ref = this.db.collection("shifts").doc(String(shiftId));
        const beforeSnap = await ref.get();
        const beforeData = beforeSnap.exists ? (beforeSnap.data() || {}) : {};

        await ref.update(data);

        const mergedAfter = { ...beforeData, ...data };

        if (this._shouldNotifyReassignment(beforeData, mergedAfter)) {
          try {
            await this._createShiftReassignedNotification(
              shiftId,
              beforeData.employeeId || null,
              mergedAfter,
              { newEmployeeId: mergedAfter.employeeId || null }
            );
          } catch (notifyErr) {
            console.error("[ShiftService] Failed to create shift reassigned notification:", notifyErr);
          }
        }

        if (this._shouldNotifyAssignment(beforeData, mergedAfter)) {
          try {
            await this._createShiftAssignedNotification(shiftId, mergedAfter, {
              previousEmployeeId: beforeData.employeeId || null,
            });
          } catch (notifyErr) {
            console.error("[ShiftService] Failed to create shift assigned notification:", notifyErr);
          }
        }

        console.log("[ShiftService] Shift updated:", shiftId);
        this.notifyDataChange();
        return shiftId;
      }, "updateShift");
    }

    async deleteShift(shiftId) {
      await this.init();
      return this._safe(async () => {
        const ref = this.db.collection("shifts").doc(String(shiftId));
        const beforeSnap = await ref.get();
        const beforeData = beforeSnap.exists ? (beforeSnap.data() || {}) : {};

        await ref.delete();

        if (this._shouldNotifyRemoval(beforeData)) {
          try {
            await this._createShiftRemovedNotification(
              shiftId,
              beforeData.employeeId || null,
              beforeData
            );
          } catch (notifyErr) {
            console.error("[ShiftService] Failed to create shift removed notification:", notifyErr);
          }
        }

        console.log("[ShiftService] Shift deleted:", shiftId);
        this.notifyDataChange();
        return true;
      }, "deleteShift");
    }

    // ---------- OVERRIDE HELPERS ----------
    async forceSaveShift(shiftData) {
      return this.saveShift(shiftData, { force: true });
    }

    async forceUpdateShift(shiftId, shiftData) {
      return this.updateShift(shiftId, shiftData, { force: true });
    }

    // ---------- REALTIME (optional) ----------
    async subscribeRange(startDate, endDate, onUpdate) {
      await this.init();
      const start = DateHelpers.std(startDate);
      const end = DateHelpers.std(endDate);
      if (!start || !end || typeof onUpdate !== "function") return () => {};

      try {
        const ref = this.db
          .collection("shifts")
          .where("date", ">=", start)
          .where("date", "<=", end);

        const unsub = ref.onSnapshot(
          (snap) => {
            const list = [];
            snap.forEach((doc) => list.push(this._mapDocToShift(doc)));
            onUpdate(list);
          },
          (err) => {
            console.error("[ShiftService] Realtime range error:", err);
          }
        );
        return unsub;
      } catch (err) {
        console.error("[ShiftService] subscribeRange error:", err);
        return () => {};
      }
    }

    // ---------- Misc ----------
    needsRefresh() {
      return !this.lastSyncTimestamp || Date.now() - this.lastSyncTimestamp > 60_000;
    }

    debug() {
      console.group("[ShiftService] Debug");
      console.log("Initialized:", this.initialized);
      console.log(
        "Last sync:",
        this.lastSyncTimestamp ? new Date(this.lastSyncTimestamp).toLocaleTimeString() : "never"
      );
      console.log("Listeners:", this.dataChangeListeners.length);
      console.log("Last permission error:", this.lastPermissionError);
      console.groupEnd();
    }
  }

  // Singleton
  window.shiftService = new ShiftService();

  // Optional global wrappers used by calendar code (only if not already defined)
  if (typeof window.saveShiftToFirebase !== "function") {
    window.saveShiftToFirebase = async (shiftData, options) => window.shiftService.saveShift(shiftData, options);
  }
  if (typeof window.updateShiftInFirebase !== "function") {
    window.updateShiftInFirebase = async (shiftId, shiftData, options) =>
      window.shiftService.updateShift(shiftId, shiftData, options);
  }
  if (typeof window.deleteShiftFromFirebase !== "function") {
    window.deleteShiftFromFirebase = async (shiftId) => window.shiftService.deleteShift(shiftId);
  }

  // ✅ Explicit wrappers for override flows
  if (typeof window.forceSaveShiftToFirebase !== "function") {
    window.forceSaveShiftToFirebase = async (shiftData) => window.shiftService.forceSaveShift(shiftData);
  }
  if (typeof window.forceUpdateShiftInFirebase !== "function") {
    window.forceUpdateShiftInFirebase = async (shiftId, shiftData) =>
      window.shiftService.forceUpdateShift(shiftId, shiftData);
  }

  // Kick initialization (non-blocking)
  window.shiftService.init().catch((err) => {
    console.error("[ShiftService] Failed to initialize:", err);
  });
})();