/* Lightweight shims so modular-style helpers work on the compat SDK.
   Lazy init + normalize modular Timestamp → compat on ALL writes. */
   (function () {
    const log = (...a) => console.log('[shim]', ...a);
  
    // --- Guards / accessors
    function hasCompat() { return !!(window.firebase && firebase.firestore); }
    function ensureApp() {
      if (!window.firebase) throw new Error('[shim] Firebase SDK not loaded');
      try { return firebase.app(); }
      catch (e) {
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
      return ref;
    }
  
    // --- Timestamp normalization
    const T = () => firebase.firestore.Timestamp;
  
    const isLikeTs = (v) =>
      v && typeof v === 'object' &&
      typeof v.seconds === 'number' &&
      typeof v.nanoseconds === 'number' &&
      typeof v.toDate === 'function' &&    // modular Timestamp has toDate()
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
  
    // Treat ONLY true FieldValue sentinels as “don’t touch”.
    // Important tweak: exclude anything that looks like a Timestamp (has toDate).
    const isFieldValue = (v) =>
      v && typeof v === 'object' &&
      !('toDate' in v) &&                              // <-- key change: don't mislabel Timestamp
      (v._methodName?.startsWith('FieldValue.') ||
       v.constructor?.name?.includes('FieldValue'));
  
    function normalize(val) {
      if (isFieldValue(val)) return val;               // keep sentinels (serverTimestamp, etc.)
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
  
    // Expose normalize for debugging (optional)
    window.__shimNormalize__ = normalize;
  
    // --- Modular-style helpers mapped to compat
    window.getFirestore ||= compatDb;
    window.collection   ||= function (dbOrPath, maybePath) {
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
  
    // Wrap modular-style setDoc/updateDoc
    window.setDoc   ||= function (ref, data, opt) {
      const d = toDoc(ref);
      const body = normalize(data);
      return (opt && opt.merge) ? d.set(body, { merge: true }) : d.set(body);
    };
    window.updateDoc ||= function (ref, data) {
      const d = toDoc(ref);
      const body = normalize(data);
      return d.update(body);
    };
    window.getDoc    ||= function (ref) { return toDoc(ref).get(); };
    window.deleteDoc ||= function (ref) { return toDoc(ref).delete(); };
  
    // --- Also patch direct compat calls (ref.set/update) to normalize
    try {
      const P = firebase.firestore.DocumentReference.prototype;
      if (!P.__shimWrapped) {
        const _set = P.set, _update = P.update;
        P.set = function (data, options)  { return _set.call(this, normalize(data), options); };
        P.update = function (data, ...r)  { return _update.call(this, normalize(data), ...r); };
        Object.defineProperty(P, '__shimWrapped', { value: true });
      }
    } catch {}
  
    // --- FieldValue helpers like modular
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
  
    // Optional alias
    if (!window.Timestamp && firebase?.firestore?.Timestamp) {
      window.Timestamp = firebase.firestore.Timestamp;
    }
  
    log('firebase-modular-shims installed (lazy + Timestamp normalization + compat.patch)');
  })();
  