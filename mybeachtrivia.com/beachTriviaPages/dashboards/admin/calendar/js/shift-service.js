// shift-service.js
// Shared service for consistent shift data handling between dashboard and calendar
// v2025-10-21

(function () {
    /**
     * Small utilities (local fallback if global DateUtils isn't present)
     */
    const DateHelpers = {
      toYMD(input) {
        if (!input) return '';
        if (typeof input === 'string') {
          // Assume already YYYY-MM-DD or parseable
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
        // Prefer global DateUtils.standardizeDate if available
        if (typeof window.DateUtils?.standardizeDate === 'function') {
          try { return window.DateUtils.standardizeDate(input); } catch (_) {}
        }
        return this.toYMD(input);
      }
    };
  
    class ShiftService {
      constructor() {
        this.db = null;
        this.initialized = false;
        this.initPromise = null;
        this.dataChangeListeners = [];
        this.lastSyncTimestamp = null;
        this.lastPermissionError = null;
      }
  
      // Initialize the service with Firestore (compat SDK)
      init() {
        if (this.initialized) return Promise.resolve();
        if (this.initPromise) return this.initPromise;
  
        this.initPromise = new Promise((resolve, reject) => {
          const attach = () => {
            try {
              this.db = firebase.firestore();
              this.initialized = true;
              console.log('[ShiftService] Initialized with Firestore');
              resolve();
            } catch (err) {
              reject(err);
            }
          };
  
          // If Firebase exists, attach immediately
          if (typeof window.firebase !== 'undefined' && firebase?.firestore) {
            attach();
            return;
          }
  
          // Otherwise poll briefly for firebase-init.js to finish
          const start = Date.now();
          const poll = setInterval(() => {
            if (typeof window.firebase !== 'undefined' && firebase?.firestore) {
              clearInterval(poll);
              clearTimeout(timeout);
              attach();
            } else if (Date.now() - start > 5000) {
              clearInterval(poll);
              clearTimeout(timeout);
              reject(new Error('[ShiftService] Firebase not initialized after timeout'));
            }
          }, 100);
  
          const timeout = setTimeout(() => {
            clearInterval(poll);
            reject(new Error('[ShiftService] Firebase init wait timed out'));
          }, 6000);
        });
  
        return this.initPromise;
      }
  
      // Add a listener for data changes
      addDataChangeListener(callback) {
        if (typeof callback === 'function') this.dataChangeListeners.push(callback);
      }
  
      // Notify all listeners of data change
      notifyDataChange() {
        this.lastSyncTimestamp = null;
        for (const fn of this.dataChangeListeners) {
          try { fn(); } catch (e) { console.error('[ShiftService] Listener error:', e); }
        }
      }
  
      // Wrap Firestore ops with common error handling
      async _safe(call, context) {
        try {
          const res = await call();
          this.lastPermissionError = null;
          return res;
        } catch (err) {
          // Normalize compat error codes
          const code = err?.code || err?.name || 'unknown';
          if (String(code).includes('permission-denied')) {
            this.lastPermissionError = { at: context, error: err };
            console.error(`[ShiftService] Permission denied at ${context}:`, err);
          } else {
            console.error(`[ShiftService] Error at ${context}:`, err);
          }
          throw err;
        }
      }
  
      // ---------- READS ----------
  
      // Get all shifts for a host (employeeId)
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
            out.push({
              id: doc.id,
              title: d.type || 'Event',
              time: d.startTime && d.endTime ? `${d.startTime} - ${d.endTime}` : (d.startTime || d.endTime || 'TBD'),
              location: d.location,
              type: d.type,
              theme: d.theme || '',
              employeeId: d.employeeId,
              notes: d.notes || '',
              date,
              startTime: d.startTime,
              endTime: d.endTime
            });
          });
          this.lastSyncTimestamp = Date.now();
          console.log('[ShiftService] Host shifts loaded:', out.length);
          return out;
        }, 'getHostShifts').catch(() => []);
      }
  
      // Get shifts filtered by date range (inclusive). Uses indexed range on 'date' (YYYY-MM-DD).
      async getShiftsByDateRange(startDate, endDate) {
        await this.init();
        const start = DateHelpers.std(startDate);
        const end = DateHelpers.std(endDate);
  
        // If either bound is missing, fall back to all
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
            out.push({
              id: doc.id,
              title: d.type || 'Event',
              time: d.startTime && d.endTime ? `${d.startTime} - ${d.endTime}` : (d.startTime || d.endTime || 'TBD'),
              location: d.location,
              type: d.type,
              theme: d.theme || '',
              employeeId: d.employeeId,
              notes: d.notes || '',
              date,
              startTime: d.startTime,
              endTime: d.endTime
            });
          });
          this.lastSyncTimestamp = Date.now();
          console.log('[ShiftService] Range shifts loaded:', out.length, `(${start} → ${end})`);
          return out;
        }, 'getShiftsByDateRange').catch(err => {
          // If index missing or rules block, fall back to full scan (best-effort)
          if (String(err?.code).includes('failed-precondition')) {
            console.warn('[ShiftService] Missing index for date range; falling back to client filter.');
            return this._fallbackFilterByDate(start, end);
          }
          return [];
        });
      }
  
      // Fallback: scan all and filter by date (used if index missing)
      async _fallbackFilterByDate(start, end) {
        const all = await this.getAllShifts();
        return all.filter(s => s.date >= start && s.date <= end);
      }
  
      // Get shifts for a specific date
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
            out.push({
              id: doc.id,
              title: d.type || 'Event',
              time: d.startTime && d.endTime ? `${d.startTime} - ${d.endTime}` : (d.startTime || d.endTime || 'TBD'),
              location: d.location,
              type: d.type,
              theme: d.theme || '',
              employeeId: d.employeeId,
              notes: d.notes || '',
              date: day,
              startTime: d.startTime,
              endTime: d.endTime
            });
          });
          console.log(`[ShiftService] Shifts for ${day}:`, out.length);
          return out;
        }, 'getShiftsForDate').catch(() => []);
      }
  
      // Get ALL shifts (use sparingly)
      async getAllShifts() {
        await this.init();
        return this._safe(async () => {
          const qs = await this.db.collection('shifts').get();
          const out = [];
          qs.forEach(doc => {
            const d = doc.data();
            out.push({
              id: doc.id,
              title: d.type || 'Event',
              time: d.startTime && d.endTime ? `${d.startTime} - ${d.endTime}` : (d.startTime || d.endTime || 'TBD'),
              location: d.location,
              type: d.type,
              theme: d.theme || '',
              employeeId: d.employeeId,
              notes: d.notes || '',
              date: DateHelpers.std(d.date),
              startTime: d.startTime,
              endTime: d.endTime
            });
          });
          this.lastSyncTimestamp = Date.now();
          console.log('[ShiftService] All shifts loaded:', out.length);
          return out;
        }, 'getAllShifts').catch(() => []);
      }
  
      // ---------- WRITES ----------
  
      // Save a new shift
      async saveShift(shiftData) {
        await this.init();
        const data = { ...shiftData };
        data.date = DateHelpers.std(data.date);
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
  
        return this._safe(async () => {
          const docRef = await this.db.collection('shifts').add(data);
          console.log('[ShiftService] Shift saved:', docRef.id);
          this.notifyDataChange();
          return docRef.id;
        }, 'saveShift');
      }
  
      // Update an existing shift
      async updateShift(shiftId, shiftData) {
        await this.init();
        const data = { ...shiftData };
        data.date = DateHelpers.std(data.date);
        data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
  
        return this._safe(async () => {
          await this.db.collection('shifts').doc(String(shiftId)).update(data);
          console.log('[ShiftService] Shift updated:', shiftId);
          this.notifyDataChange();
          return shiftId;
        }, 'updateShift');
      }
  
      // Delete a shift
      async deleteShift(shiftId) {
        await this.init();
        return this._safe(async () => {
          await this.db.collection('shifts').doc(String(shiftId)).delete();
          console.log('[ShiftService] Shift deleted:', shiftId);
          this.notifyDataChange();
          return true;
        }, 'deleteShift');
      }
  
      // ---------- REALTIME (optional) ----------
      // Subscribe to all shifts in a range (YYYY-MM-DD) and stream updates to a callback
      // Returns an unsubscribe function.
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
                list.push({
                  id: doc.id,
                  title: d.type || 'Event',
                  time: d.startTime && d.endTime ? `${d.startTime} - ${d.endTime}` : (d.startTime || d.endTime || 'TBD'),
                  location: d.location,
                  type: d.type,
                  theme: d.theme || '',
                  employeeId: d.employeeId,
                  notes: d.notes || '',
                  date: DateHelpers.std(d.date),
                  startTime: d.startTime,
                  endTime: d.endTime
                });
              });
              onUpdate(list);
            },
            (err) => {
              console.error('[ShiftService] Realtime range error:', err);
            }
          );
          return unsub;
        } catch (err) {
          console.error('[ShiftService] subscribeRange error:', err);
          return () => {};
        }
      }
  
      // ---------- Misc ----------
      needsRefresh() {
        // Refresh if we've never synced or it's been more than 60s
        return !this.lastSyncTimestamp || (Date.now() - this.lastSyncTimestamp > 60_000);
      }
  
      debug() {
        console.group('[ShiftService] Debug');
        console.log('Initialized:', this.initialized);
        console.log('Last sync:', this.lastSyncTimestamp ? new Date(this.lastSyncTimestamp).toLocaleTimeString() : 'never');
        console.log('Listeners:', this.dataChangeListeners.length);
        console.log('Last permission error:', this.lastPermissionError);
        console.groupEnd();
      }
    }
  
    // Create a singleton and expose globally
    window.shiftService = new ShiftService();
  
    // Kick initialization (non-blocking)
    window.shiftService.init().catch(err => {
      console.error('[ShiftService] Failed to initialize:', err);
    });
  })();
  