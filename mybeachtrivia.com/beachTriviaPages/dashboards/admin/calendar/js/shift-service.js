// js/shift-service.js
// Shared service for consistent shift data handling between dashboard and calendar
// v2025-11-13 (adds same-day double-book conflicts; syncs dateYMD/start/end/startTimestamp/endTimestamp on save/update/move;
// populates numeric start/end in read models for UI sorting)

(function () {
  const LOG = '[ShiftService]';

  /**
   * Small utilities (local fallback if global DateUtils isn't present)
   */
  const DateHelpers = {
    toYMD(input) {
      if (!input) return '';
      if (typeof input === 'string') {
        const m = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) return input;
        const d = new Date(input);
        if (isNaN(d)) return String(input);
        return this.toYMD(d);
      }
      if (input instanceof Date) {
        const y = input.getFullYear();
        const m = String(input.getMonth() + 1).padStart(2, '0');
        const d = String(input.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      return String(input);
    },
    std(input) {
      if (typeof window.DateUtils?.standardizeDate === 'function') {
        try { return window.DateUtils.standardizeDate(input); } catch (_) {}
      }
      return this.toYMD(input);
    }
  };

  // Normalize to a comparable string id
  function _normalizeId(val) {
    return String(val ?? '').trim();
  }

  // ---------------- Time helpers ----------------

  // "7 PM" / "7:00 PM" / "19:15" / "19" -> {h, m} or null
  function _parseTimeHM(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    let s = timeStr.trim().toUpperCase();

    // h[:mm] AM/PM
    let m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
    if (m) {
      let h = parseInt(m[1], 10);
      let min = m[2] ? parseInt(m[2], 10) : 0;
      const mer = m[3];
      if (mer === 'PM' && h !== 12) h += 12;
      if (mer === 'AM' && h === 12) h = 0;
      if (h >= 0 && h < 24 && min >= 0 && min < 60) return { h, m: min };
      return null;
    }

    // 24h "HH:MM" or "HH"
    m = s.match(/^(\d{1,2})(?::(\d{2}))?$/);
    if (m) {
      let h = parseInt(m[1], 10);
      let min = m[2] ? parseInt(m[2], 10) : 0;
      if (h >= 0 && h < 24 && min >= 0 && min < 60) return { h, m: min };
    }

    return null;
  }

  function _toMinutes(timeStr) {
    const hm = _parseTimeHM(timeStr);
    if (!hm) return null;
    return hm.h * 60 + hm.m;
  }

  function _dateFromYMDAndTime(ymd, timeStr) {
    const hm = _parseTimeHM(timeStr);
    if (!hm) return null;
    const [Y, M, D] = ymd.split('-').map(n => parseInt(n, 10));
    return new Date(Y, M - 1, D, hm.h, hm.m, 0, 0);
  }

  function _fsTsFromDate(d) {
    return firebase.firestore.Timestamp.fromDate(d);
  }

  function _withNumericTimes(obj) {
    // Attach numeric minutes for UI sorting if times present
    if (obj) {
      const startMin = _toMinutes(obj.startTime);
      const endMin = _toMinutes(obj.endTime);
      if (startMin != null) obj.start = startMin;
      if (endMin != null) obj.end = endMin;
    }
    return obj;
  }

  // ---------------- Service ----------------

  class ShiftService {
    constructor() {
      this.db = null;
      this.initialized = false;
      this.initPromise = null;
      this.dataChangeListeners = [];
      this.lastSyncTimestamp = null;
      this.lastPermissionError = null;
    }

    // Initialize Firestore (compat)
    init() {
      if (this.initialized) return Promise.resolve();
      if (this.initPromise) return this.initPromise;

      this.initPromise = new Promise((resolve, reject) => {
        const attach = () => {
          try {
            this.db = firebase.firestore();
            this.initialized = true;
            console.log(`${LOG} Initialized with Firestore`);
            resolve();
          } catch (err) {
            reject(err);
          }
        };

        if (typeof window.firebase !== 'undefined' && firebase?.firestore) {
          attach();
          return;
        }

        const start = Date.now();
        const poll = setInterval(() => {
          if (typeof window.firebase !== 'undefined' && firebase?.firestore) {
            clearInterval(poll);
            clearTimeout(timeout);
            attach();
          } else if (Date.now() - start > 5000) {
            clearInterval(poll);
            clearTimeout(timeout);
            reject(new Error(`${LOG} Firebase not initialized after timeout`));
          }
        }, 100);

        const timeout = setTimeout(() => {
          clearInterval(poll);
          reject(new Error(`${LOG} Firebase init wait timed out`));
        }, 6000);
      });

      return this.initPromise;
    }

    // Listeners
    addDataChangeListener(callback) {
      if (typeof callback === 'function') this.dataChangeListeners.push(callback);
    }
    notifyDataChange() {
      this.lastSyncTimestamp = null;
      for (const fn of this.dataChangeListeners) {
        try { fn(); } catch (e) { console.error(`${LOG} Listener error:`, e); }
      }
    }

    // Error wrapper
    async _safe(call, context) {
      try {
        const res = await call();
        this.lastPermissionError = null;
        return res;
      } catch (err) {
        const code = err?.code || err?.name || 'unknown';
        if (String(code).includes('permission-denied')) {
          this.lastPermissionError = { at: context, error: err };
          console.error(`${LOG} Permission denied at ${context}:`, err);
        } else {
          console.error(`${LOG} Error at ${context}:`, err);
        }
        throw err;
      }
    }

    // ---------------- READS ----------------

    async getHostShifts(hostId) {
      await this.init();
      if (!hostId) return [];

      return this._safe(async () => {
        const qs = await this.db
          .collection('shifts')
          .where('employeeId', '==', hostId)
          .get();

        const out = [];
        qs.forEach(doc => {
          const d = doc.data();
          const date = DateHelpers.std(d.date);
          const item = _withNumericTimes({
            id: doc.id,
            title: d.type || 'Event',
            time: d.startTime && d.endTime ? `${d.startTime} - ${d.endTime}` : (d.startTime || d.endTime || 'TBD'),
            location: d.location,
            type: d.type,
            theme: d.theme || '',
            employeeId: d.employeeId,
            notes: d.notes || '',
            date,
            dateYMD: date,
            startTime: d.startTime,
            endTime: d.endTime
          });
          out.push(item);
        });
        this.lastSyncTimestamp = Date.now();
        console.log(`${LOG} Host shifts loaded:`, out.length);
        return out;
      }, 'getHostShifts').catch(() => []);
    }

    async getShiftsByDateRange(startDate, endDate) {
      await this.init();
      const start = DateHelpers.std(startDate);
      const end = DateHelpers.std(endDate);

      if (!start || !end) return this.getAllShifts();

      return this._safe(async () => {
        const qs = await this.db
          .collection('shifts')
          .where('date', '>=', start)
          .where('date', '<=', end)
          .get();

        const out = [];
        qs.forEach(doc => {
          const d = doc.data();
          const date = DateHelpers.std(d.date);
          const item = _withNumericTimes({
            id: doc.id,
            title: d.type || 'Event',
            time: d.startTime && d.endTime ? `${d.startTime} - ${d.endTime}` : (d.startTime || d.endTime || 'TBD'),
            location: d.location,
            type: d.type,
            theme: d.theme || '',
            employeeId: d.employeeId,
            notes: d.notes || '',
            date,
            dateYMD: date,
            startTime: d.startTime,
            endTime: d.endTime
          });
          out.push(item);
        });
        this.lastSyncTimestamp = Date.now();
        console.log(`${LOG} Range shifts loaded:`, out.length, `(${start} → ${end})`);
        return out;
      }, 'getShiftsByDateRange').catch(async (err) => {
        if (String(err?.code).includes('failed-precondition')) {
          console.warn(`${LOG} Missing index for date range; falling back to client filter.`);
          return this._fallbackFilterByDate(start, end);
        }
        return [];
      });
    }

    async _fallbackFilterByDate(start, end) {
      const all = await this.getAllShifts();
      return all.filter(s => s.date >= start && s.date <= end);
    }

    async getShiftsForDate(dateStr) {
      await this.init();
      const day = DateHelpers.std(dateStr);
      if (!day) return [];

      return this._safe(async () => {
        const qs = await this.db
          .collection('shifts')
          .where('date', '==', day)
          .get();

        const out = [];
        qs.forEach(doc => {
          const d = doc.data();
          const item = _withNumericTimes({
            id: doc.id,
            title: d.type || 'Event',
            time: d.startTime && d.endTime ? `${d.startTime} - ${d.endTime}` : (d.startTime || d.endTime || 'TBD'),
            location: d.location,
            type: d.type,
            theme: d.theme || '',
            employeeId: d.employeeId,
            notes: d.notes || '',
            date: day,
            dateYMD: day,
            startTime: d.startTime,
            endTime: d.endTime
          });
          out.push(item);
        });
        console.log(`${LOG} Shifts for ${day}:`, out.length);
        return out;
      }, 'getShiftsForDate').catch(() => []);
    }

    async getAllShifts() {
      await this.init();
      return this._safe(async () => {
        const qs = await this.db.collection('shifts').get();
        const out = [];
        qs.forEach(doc => {
          const d = doc.data();
          const date = DateHelpers.std(d.date);
          const item = _withNumericTimes({
            id: doc.id,
            title: d.type || 'Event',
            time: d.startTime && d.endTime ? `${d.startTime} - ${d.endTime}` : (d.startTime || d.endTime || 'TBD'),
            location: d.location,
            type: d.type,
            theme: d.theme || '',
            employeeId: d.employeeId,
            notes: d.notes || '',
            date,
            dateYMD: date,
            startTime: d.startTime,
            endTime: d.endTime
          });
          out.push(item);
        });
        this.lastSyncTimestamp = Date.now();
        console.log(`${LOG} All shifts loaded:`, out.length);
        return out;
      }, 'getAllShifts').catch(() => []);
    }

    // ---------------- WRITES ----------------

    /**
     * Compute timestamp fields for the given payload.
     * Also computes numeric start/end, and sets dateYMD alias.
     */
    _withSyncedTimestamps(baseData, existingDocData = null) {
      const data = { ...baseData };
      const ymd = data.date ? DateHelpers.std(data.date) : null;
      const startTime = data.startTime ?? existingDocData?.startTime ?? null;
      const endTime   = data.endTime   ?? existingDocData?.endTime   ?? null;

      if (ymd) {
        // Keep alias
        data.date = ymd;
        data.dateYMD = ymd;

        // Only set timestamps if we can build them
        const sDate = startTime ? _dateFromYMDAndTime(ymd, startTime) : null;
        const eDate = endTime   ? _dateFromYMDAndTime(ymd, endTime)   : null;

        if (sDate) data.startTimestamp = _fsTsFromDate(sDate);
        if (eDate) data.endTimestamp   = _fsTsFromDate(eDate);
      }

      // Numeric minutes for sort/overlap
      const sMin = _toMinutes(startTime);
      const eMin = _toMinutes(endTime);
      if (sMin != null) data.start = sMin;
      if (eMin != null) data.end = eMin;

      return data;
    }

    async saveShift(shiftData) {
      await this.init();

      const prepared = { ...shiftData };
      prepared.date = DateHelpers.std(prepared.date);
      prepared.createdAt = firebase.firestore.FieldValue.serverTimestamp();

      // Ensure timestamps/dateYMD are set on create
      const withTs = this._withSyncedTimestamps(prepared);

      return this._safe(async () => {
        const docRef = await this.db.collection('shifts').add(withTs);
        console.log(`${LOG} Shift saved:`, docRef.id);
        this.notifyDataChange();
        return docRef.id;
      }, 'saveShift');
    }

    async updateShift(shiftId, shiftData) {
      await this.init();
      const incoming = { ...shiftData };
      incoming.date = incoming.date ? DateHelpers.std(incoming.date) : incoming.date;
      incoming.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

      return this._safe(async () => {
        // If we need to compute timestamps (date provided or times changed),
        // pull the existing doc so we can use its times when not provided.
        let existing = null;
        if ('date' in incoming || 'startTime' in incoming || 'endTime' in incoming) {
          try {
            const snap = await this.db.collection('shifts').doc(String(shiftId)).get();
            existing = snap.exists ? snap.data() : null;
          } catch (_) {}
        }

        const patch = this._withSyncedTimestamps(incoming, existing);

        await this.db.collection('shifts').doc(String(shiftId)).update(patch);
        console.log(`${LOG} Shift updated:`, shiftId);

        // Try to keep local cache consistent
        try {
          if (Array.isArray(window.shifts)) {
            const idx = window.shifts.findIndex(s => String(s.id) === String(shiftId));
            if (idx !== -1) window.shifts[idx] = { ...window.shifts[idx], ...patch };
          }
        } catch (e) {
          console.warn(`${LOG} Could not patch window.shifts after update:`, e);
        }

        this.notifyDataChange();
        return shiftId;
      }, 'updateShift');
    }

    async deleteShift(shiftId) {
      await this.init();
      return this._safe(async () => {
        await this.db.collection('shifts').doc(String(shiftId)).delete();
        console.log(`${LOG} Shift deleted:`, shiftId);
        this.notifyDataChange();
        return true;
      }, 'deleteShift');
    }

    // ---------------- MOVE / CONFLICT LOGIC ----------------

    /**
     * Returns conflicts for moving `shift` to `targetDateYMD`.
     * Rules:
     *  - Any other shift for the SAME EMPLOYEE on the same day is a conflict (same-day double-book),
     *    even if times do not overlap.
     *  - Overlapping times are also conflicts.
     *  - If times are unparseable, be conservative and report a conflict.
     */
    async _getConflictsForMove(shift, targetDateYMD, debug = true) {
      const date = DateHelpers.std(targetDateYMD);
      const employeeId = _normalizeId(shift.employeeId);
      const thisId = _normalizeId(shift.id);

      const dayShifts = await this.getShiftsForDate(date);
      const start = _toMinutes(shift.startTime);
      const end = _toMinutes(shift.endTime);

      const conflicts = [];
      for (const s of dayShifts) {
        const sId = _normalizeId(s.id);
        if (sId === thisId) continue;

        const sEmp = _normalizeId(s.employeeId);
        if (sEmp !== employeeId) continue;

        // Same-day double-book baseline conflict
        let already = false;
        if (!conflicts.some(c => _normalizeId(c.id) === sId)) {
          conflicts.push(s);
          already = true;
          if (debug) console.debug(`${LOG} Conflict (same-day double-book) with`, s);
        }

        // If we can parse times, add explicit overlap note (kept for logs)
        const sStart = _toMinutes(s.startTime);
        const sEnd = _toMinutes(s.endTime);
        if (start == null || end == null || sStart == null || sEnd == null) {
          if (!already && debug) console.debug(`${LOG} Conflict (unparseable time) with`, s);
          continue;
        }
        const noOverlap = (end <= sStart) || (start >= sEnd);
        if (!noOverlap && debug) {
          console.debug(`${LOG} Conflict (overlap) with`, s);
        }
      }

      if (debug) console.debug(`${LOG} Conflict check for`, { thisId, employeeId, date, start, end, conflicts: conflicts.length });
      return conflicts;
    }

    /**
     * Move a single shift to a new date with optional conflict checking.
     *
     * options = { ignoreConflicts: false, ignoreUnknownHosts: false }
     *
     * Returns:
     *   { ok: true, updatedShift }
     *   { ok: false, reason: 'conflict', employeeId, conflictDate, conflictingShifts }
     *   { ok: false, reason: 'not-found' }
     *   { ok: false, reason: 'error', message }
     */
    async moveSingleShiftToDate(shiftId, targetDateYMD, options = {}) {
      await this.init();
      const opts = {
        ignoreConflicts: false,
        ignoreUnknownHosts: false,
        ...options
      };

      const targetDate = DateHelpers.std(targetDateYMD);
      if (!shiftId || !targetDate) {
        return { ok: false, reason: 'error', message: 'Missing shiftId or targetDate' };
      }

      try {
        // Load current shift (we need its times to rebuild timestamps)
        const doc = await this._safe(
          () => this.db.collection('shifts').doc(String(shiftId)).get(),
          'moveSingleShiftToDate.getShift'
        );

        if (!doc.exists) {
          console.warn(`${LOG} moveSingleShiftToDate: shift not found`, shiftId);
          return { ok: false, reason: 'not-found' };
        }

        const raw = { id: doc.id, ...doc.data() };
        const employeeId = _normalizeId(raw.employeeId);

        // Optional "unknown host" skip (hinted by global employees map)
        let isUnknownHost = false;
        try {
          const emps = window.employees;
          if (!employeeId || !emps || typeof emps !== 'object' || !emps[employeeId]) {
            isUnknownHost = true;
          }
        } catch (_) { isUnknownHost = true; }

        // Conflict check unless explicitly overridden
        if (!opts.ignoreConflicts) {
          const shouldSkip = opts.ignoreUnknownHosts && isUnknownHost;
          if (!shouldSkip) {
            const conflicts = await this._getConflictsForMove(raw, targetDate, true);
            if (conflicts && conflicts.length > 0) {
              console.log(`${LOG} Conflict detected for move:`, { shiftId, targetDate, employeeId, conflicts });
              return {
                ok: false,
                reason: 'conflict',
                employeeId,
                conflictDate: targetDate,
                conflictingShifts: conflicts
              };
            }
          } else {
            console.debug(`${LOG} Skipping conflict check due to unknown host and ignoreUnknownHosts=true`);
          }
        }

        // Build minimal patch: change date, and recompute timestamps/dateYMD + numeric times
        const patch = this._withSyncedTimestamps(
          { date: targetDate, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
          { startTime: raw.startTime, endTime: raw.endTime }
        );

        await this._safe(
          () => this.db.collection('shifts').doc(String(shiftId)).update(patch),
          'moveSingleShiftToDate.update'
        );
        console.log(`${LOG} Shift moved:`, { shiftId, targetDate });

        // Update local cache if present for instant re-render
        try {
          if (Array.isArray(window.shifts)) {
            const idx = window.shifts.findIndex(s => String(s.id) === String(shiftId));
            const updatedLocal = _withNumericTimes({
              ...(idx !== -1 ? window.shifts[idx] : raw),
              ...patch,
              id: shiftId,
              // helpful for UI that reads Date objects off timestamps
              startTimestamp: patch.startTimestamp ? patch.startTimestamp.toDate?.() ?? patch.startTimestamp : (raw.startTimestamp?.toDate?.() ?? raw.startTimestamp),
              endTimestamp: patch.endTimestamp ? patch.endTimestamp.toDate?.() ?? patch.endTimestamp : (raw.endTimestamp?.toDate?.() ?? raw.endTimestamp)
            });
            if (idx !== -1) window.shifts[idx] = updatedLocal;
            else window.shifts.push(updatedLocal);
          }
        } catch (e) {
          console.warn(`${LOG} Could not patch window.shifts after move:`, e);
        }

        this.notifyDataChange();

        const resultShift = _withNumericTimes({ id: shiftId, ...raw, ...patch });
        return { ok: true, updatedShift: resultShift };
      } catch (err) {
        console.error(`${LOG} moveSingleShiftToDate error:`, err);
        return { ok: false, reason: 'error', message: err?.message || String(err) };
      }
    }

    // ---------------- REALTIME (optional) ----------------

    async subscribeRange(startDate, endDate, onUpdate) {
      await this.init();
      const start = DateHelpers.std(startDate);
      const end = DateHelpers.std(endDate);
      if (!start || !end || typeof onUpdate !== 'function') return () => {};

      try {
        const ref = this.db
          .collection('shifts')
          .where('date', '>=', start)
          .where('date', '<=', end);

        const unsub = ref.onSnapshot(
          (snap) => {
            const list = [];
            snap.forEach(doc => {
              const d = doc.data();
              const date = DateHelpers.std(d.date);
              const item = _withNumericTimes({
                id: doc.id,
                title: d.type || 'Event',
                time: d.startTime && d.endTime ? `${d.startTime} - ${d.endTime}` : (d.startTime || d.endTime || 'TBD'),
                location: d.location,
                type: d.type,
                theme: d.theme || '',
                employeeId: d.employeeId,
                notes: d.notes || '',
                date,
                dateYMD: date,
                startTime: d.startTime,
                endTime: d.endTime
              });
              list.push(item);
            });
            onUpdate(list);
          },
          (err) => {
            console.error(`${LOG} Realtime range error:`, err);
          }
        );
        return unsub;
      } catch (err) {
        console.error(`${LOG} subscribeRange error:`, err);
        return () => {};
      }
    }

    // ---------------- Misc ----------------
    needsRefresh() {
      return !this.lastSyncTimestamp || (Date.now() - this.lastSyncTimestamp > 60_000);
    }

    debug() {
      console.group(LOG + ' Debug');
      console.log('Initialized:', this.initialized);
      console.log('Last sync:', this.lastSyncTimestamp ? new Date(this.lastSyncTimestamp).toLocaleTimeString() : 'never');
      console.log('Listeners:', this.dataChangeListeners.length);
      console.log('Last permission error:', this.lastPermissionError);
      console.groupEnd();
    }
  }

  // Create a singleton and expose globally
  window.shiftService = new ShiftService();

  // Global helper for calendar code (drag/drop, warning modal, etc.)
  window.moveSingleShiftToDate = function (shiftId, targetDateYMD, options) {
    return window.shiftService.moveSingleShiftToDate(shiftId, targetDateYMD, options);
  };

  // Kick initialization (non-blocking)
  window.shiftService.init().catch(err => {
    console.error(`${LOG} Failed to initialize:`, err);
  });
})();