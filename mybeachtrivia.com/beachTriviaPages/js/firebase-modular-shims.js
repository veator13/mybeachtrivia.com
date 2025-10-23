/* Lightweight shims so modular-style helpers work on the compat SDK.
   This version keeps lazy initialization AND normalizes any "custom"
   Timestamp-like objects before Firestore writes. */
   (function () {
    const log = (...a) => console.log('[shim]', ...a);
  
    // --- Guards / accessors ----------------------------------------------------
    function hasCompat() {
      return !!(window.firebase && firebase.firestore);
    }
    function ensureApp() {
      if (!window.firebase) throw new Error('[shim] Firebase SDK not loaded');
      try { return firebase.app(); } // default app exists
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
      const app = ensureApp();
      return firebase.firestore(app);
    }
    function toDoc(ref) {
      const db = compatDb();
      if (typeof ref === 'string') return db.doc(ref);
      if (ref && typeof ref.path === 'string') return db.doc(ref.path);
      return ref; // assume DocumentReference already
    }
  
    // --- Timestamp normalization ----------------------------------------------
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
  
    const looksLikeFieldValue = (v) =>
      v && typeof v === 'object' &&
      // Heuristic: compat FieldValue is an object with internal markers; don't touch it
      (v._methodName?.startsWith('FieldValue.') || v.isEqual !== undefined);
  
    const normalize = (val) => {
      // Leave Firestore sentinels (serverTimestamp, deleteField, arrayUnion, etc.) alone
      if (looksLikeFieldValue(val)) return val;
  
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
    };
  
    // --- Public modular-style shims mapped to compat ---------------------------
    // getFirestore()
    window.getFirestore ||= compatDb;
  
    // collection(dbOrPath, maybePath)
    window.collection ||= function (dbOrPath, maybePath) {
      const p = typeof dbOrPath === 'string' ? dbOrPath : maybePath;
      if (!p) throw new Error('collection() needs a path string');
      return compatDb().collection(p);
    };
  
    // doc(path) or doc(collectionRef, id) or doc({path}, id)
    window.doc ||= function (base, id) {
      const db = compatDb();
      if (typeof base === 'string' && !id) return db.doc(base);
      if (typeof base === 'string' && id)  return db.doc(`${base}/${id}`);
      if (base && base.path && id)         return db.doc(`${base.path}/${id}`);
      throw new Error('doc() needs a path or (collectionRef,id)');
    };
  
    // Writes wrapped with normalization
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
  
    // --- FieldValue helpers exposed like modular -------------------------------
    Object.defineProperty(window, 'serverTimestamp', {
      configurable: true, enumerable: true,
      get() { return firebase.firestore.FieldValue.serverTimestamp(); }
    });
    Object.defineProperty(window, 'deleteField', {
      configurable: true, enumerable: true,
      get() { return firebase.firestore.FieldValue.delete(); }
    });
    Object.defineProperty(window, 'arrayUnion', {
      configurable: true, enumerable: true,
      get() { return firebase.firestore.FieldValue.arrayUnion; }
    });
    Object.defineProperty(window, 'arrayRemove', {
      configurable: true, enumerable: true,
      get() { return firebase.firestore.FieldValue.arrayRemove; }
    });
  
    // Timestamp alias (optional)
    if (!window.Timestamp && firebase?.firestore?.Timestamp) {
      window.Timestamp = firebase.firestore.Timestamp;
    }
  
    log('firebase-modular-shims installed (lazy + Timestamp normalization)');
  })();
  