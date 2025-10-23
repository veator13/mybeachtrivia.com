/* Compat shims for modular-style helpers.
   - Lazy Firebase app access
   - Normalize modular Timestamp -> compat
   - Convert modular FieldValue -> compat
   - Patch direct ref.set/update to normalize automatically */
   (function () {
    const log = (...a) => console.log('[shim]', ...a);
  
    // ---- Guards / accessors ---------------------------------------------------
    function hasCompat() { return !!(window.firebase && firebase.firestore); }
    function ensureApp() {
      if (!window.firebase) throw new Error('[shim] Firebase SDK not loaded');
      try { return firebase.app(); } // default app
      catch (e) {
        // Defensive init if your site exposes window.firebaseConfig
        if (window.firebaseConfig && typeof firebase.initializeApp === 'function') {
          try { return firebase.initializeApp(window.firebaseConfig); } catch (_) {}
        }
        throw e;
      }
    }
    function compatDb() {
      if (!hasCompat()) throw new Error('[shim] Compat Firestore not available');
      return firebase.firestore(ensureApp());
    }
    function toDoc(ref) {
      const db = compatDb();
      if (typeof ref === 'string') return db.doc(ref);
      if (ref && typeof ref.path === 'string') return db.doc(ref.path);
      return ref; // assume DocumentReference already
    }
  
    // ---- Timestamp normalization ---------------------------------------------
    const T = () => firebase.firestore.Timestamp;
    const isLikeTs = (v) =>
      v && typeof v === 'object' &&
      typeof v.seconds === 'number' &&
      typeof v.nanoseconds === 'number' &&
      typeof v.toDate === 'function' &&
      !(v instanceof T());
  
    const toCompatTs = (v) => {
      const Ts = T();
      if (v instanceof Ts) return v;
      if (v instanceof Date) return Ts.fromDate(v);
      if (isLikeTs(v)) {
        const ms = v.seconds * 1000 + Math.floor(v.nanoseconds / 1e6);
        return Ts.fromMillis(ms);
      }
      return v;
    };
  
    // ---- FieldValue conversion (modular -> compat) ---------------------------
    const FV = () => firebase.firestore.FieldValue;
  
    // Best-effort detection of modular FieldValue implementations
    const modularToCompatFieldValue = (v) => {
      const name = v?.constructor?.name || '';
      if (/ServerTimestampFieldValueImpl/i.test(name)) return FV().serverTimestamp();
      if (/DeleteFieldValueImpl/i.test(name))          return FV().delete();
      if (/ArrayUnionFieldValueImpl/i.test(name)) {
        const elems = v._elements || v.elements || v._toFieldTransform?.elements || [];
        return FV().arrayUnion(...elems.map(normalize));
      }
      if (/ArrayRemoveFieldValueImpl/i.test(name)) {
        const elems = v._elements || v.elements || v._toFieldTransform?.elements || [];
        return FV().arrayRemove(...elems.map(normalize));
      }
      if (/NumericIncrementFieldValueImpl/i.test(name)) {
        const n = v._operand || v.operand || v._toFieldTransform?.operand || 1;
        // Compat has increment too:
        return FV().increment ? FV().increment(n) : v;
      }
      return null;
    };
  
    const isCompatFieldValue = (v) =>
      v && typeof v === 'object' &&
      (v._methodName?.startsWith('FieldValue.') || v.constructor?.name === 'FieldValue');
  
    // ---- Normalizer -----------------------------------------------------------
    function normalize(val) {
      // Convert modular FieldValue sentinels to compat
      const converted = modularToCompatFieldValue(val);
      if (converted) return converted;
  
      // Keep compat FieldValues as-is
      if (isCompatFieldValue(val)) return val;
  
      // Normalize Timestamp-ish values
      if (val instanceof Date || (hasCompat() && val instanceof T()) || isLikeTs(val)) {
        return toCompatTs(val);
      }
  
      if (Array.isArray(val)) return val.map(normalize);
  
      if (val && typeof val === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(val)) out[k] = normalize(v);
        return out;
      }
  
      return val;
    }
  
    // Expose normalize for quick console checks
    window.__shimNormalize__ = normalize;
  
    // ---- Modular-style helpers mapped to compat -------------------------------
    window.getFirestore ||= compatDb;
  
    window.collection ||= function (dbOrPath, maybePath) {
      const p = typeof dbOrPath === 'string' ? dbOrPath : maybePath;
      if (!p) throw new Error('collection() needs a path string');
      return compatDb().collection(p);
    };
  
    window.doc ||= function (base, id) {
      const db = compatDb();
      if (typeof base === 'string' && !id) return db.doc(base);
      if (typeof base === 'string' && id)  return db.doc(`${base}/${id}`);
      if (base && base.path && id)         return db.doc(`${base.path}/${id}`);
      throw new Error('doc() needs a path or (collectionRef,id)');
    };
  
    window.setDoc ||= function (ref, data, opt) {
      const d = toDoc(ref);
      const body = normalize(data);
      return (opt && opt.merge) ? d.set(body, { merge: true }) : d.set(body);
    };
  
    window.updateDoc ||= function (ref, data) {
      const d = toDoc(ref);
      const body = normalize(data);
      return d.update(body);
    };
  
    window.getDoc ||= function (ref) { return toDoc(ref).get(); };
    window.deleteDoc ||= function (ref) { return toDoc(ref).delete(); };
  
    // ---- Patch direct compat calls to normalize too ---------------------------
    try {
      const P = firebase.firestore.DocumentReference.prototype;
      if (!P.__shimWrapped2) {
        const _set = P.set, _update = P.update;
        P.set    = function (data, options) { return _set.call(this, normalize(data), options); };
        P.update = function (data, ...r)    { return _update.call(this, normalize(data), ...r); };
        Object.defineProperty(P, '__shimWrapped2', { value: true });
      }
    } catch {}
  
    // ---- FieldValue helpers (compat) exposed like modular ---------------------
    Object.defineProperty(window, 'serverTimestamp', {
      configurable: true, enumerable: true,
      get() { return FV().serverTimestamp(); }
    });
    Object.defineProperty(window, 'deleteField', {
      configurable: true, enumerable: true,
      get() { return FV().delete(); }
    });
    Object.defineProperty(window, 'arrayUnion', {
      configurable: true, enumerable: true,
      get() { return FV().arrayUnion; }
    });
    Object.defineProperty(window, 'arrayRemove', {
      configurable: true, enumerable: true,
      get() { return FV().arrayRemove; }
    });
  
    // Optional Timestamp alias
    if (!window.Timestamp && firebase?.firestore?.Timestamp) {
      window.Timestamp = firebase.firestore.Timestamp;
    }
  
    log('firebase-modular-shims installed (lazy + TS normalize + FieldValue convert + compat.patch)');
  })();
  