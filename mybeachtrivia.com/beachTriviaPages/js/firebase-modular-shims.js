/* Lightweight shims so modular-style helpers work on the compat SDK.
   NOTE: This version is LAZY — it does NOT call firebase.firestore()
   until one of the helpers is actually used (avoids "no app" errors). */
   (function () {
    const log = (...a) => console.log('[shim]', ...a);
  
    function hasCompat() {
      return !!(window.firebase && firebase.firestore);
    }
  
    function ensureApp() {
      if (!window.firebase) throw new Error('[shim] Firebase SDK not loaded');
      try {
        return firebase.app(); // default app
      } catch (e) {
        // If the site exposes window.firebaseConfig, initialize defensively.
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
      return ref; // assume already a DocumentReference
    }
  
    // ---- Public shims (modular-style names mapped to compat) ----
    window.getFirestore ||= compatDb;
  
    window.collection ||= function (dbOrPath, maybePath) {
      const p = typeof dbOrPath === 'string' ? dbOrPath : maybePath;
      if (!p) throw new Error("collection() needs a path string");
      return compatDb().collection(p);
    };
  
    window.doc ||= function (base, id) {
      const db = compatDb();
      if (typeof base === 'string' && !id) return db.doc(base);
      if (typeof base === 'string' && id)  return db.doc(`${base}/${id}`);
      if (base && base.path && id)         return db.doc(`${base.path}/${id}`);
      throw new Error("doc() needs a path or (collectionRef,id)");
    };
  
    window.setDoc   ||= function (ref, data, opt) { const d = toDoc(ref); return (opt && opt.merge) ? d.set(data, { merge: true }) : d.set(data); };
    window.updateDoc||= function (ref, data)      { return toDoc(ref).update(data); };
    window.getDoc   ||= function (ref)            { return toDoc(ref).get(); };
    window.deleteDoc||= function (ref)            { return toDoc(ref).delete(); };
  
    // ---- Common FieldValue helpers (lazy getters) ----
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
  
    // Timestamp alias (if present)
    if (!window.Timestamp && firebase?.firestore?.Timestamp) {
      window.Timestamp = firebase.firestore.Timestamp;
    }
  
    log('firebase-modular-shims installed (lazy mode)');
  })();
  