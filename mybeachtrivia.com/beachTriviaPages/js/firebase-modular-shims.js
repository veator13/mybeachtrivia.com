/*
  firebase-modular-shims.js (quiet compat bridge)
  - Does NOT call firebase.firestore() eagerly (avoids "No Firebase App" noise).
  - Provides a minimal compat-like API that forwards to modular v10:
      * firebase.firestore().collection('c').doc('id').{set,update,get}
      * firebase.firestore().collection('c').add(data)
      * firebase.firestore().doc('c/id').{set,update,get}
      * firebase.firestore.FieldValue.{serverTimestamp,arrayUnion,arrayRemove,increment}
      * firebase.firestore.Timestamp.{now,fromMillis,fromDate} + constructor marker
  - Normalizes compat-shaped values to modular equivalents on write.
*/

(() => {
  const g = (typeof window !== 'undefined') ? window : globalThis;

  // If a real compat namespace already exists, do nothing.
  // (Real compat has firebase.firestore as a function and firebase.apps array)
  if (g.firebase && typeof g.firebase.firestore === 'function' && Array.isArray(g.firebase.apps)) {
    console.debug('[shim] compat already present; no-op');
    return;
  }

  // Lazy load modular pieces only when needed
  let _mods = null;
  async function mods() {
    if (_mods) return _mods;
    const app = await import('https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js');
    const fs  = await import('https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js');
    return (_mods = { app, fs });
  }

  // ---- Normalization of compat-like sentinels into modular values ----
  // Markers we emit from compat facades (so we can convert later)
  const OP = {
    ServerTimestamp: '__mb_op_serverTimestamp__',
    ArrayUnion:      '__mb_op_arrayUnion__',
    ArrayRemove:     '__mb_op_arrayRemove__',
    Increment:       '__mb_op_increment__',
    TsNow:           '__mb_ts_now__',
    TsFromMillis:    '__mb_ts_ms__',
    TsCtor:          '__mb_ts_ctor__'  // {seconds, nanoseconds}
  };

  function deepNormalize(fs, value) {
    if (value == null) return value;

    // Handle our markers
    if (typeof value === 'object') {
      // FieldValue sentinels
      if (value[OP.ServerTimestamp]) return fs.serverTimestamp();
      if (value[OP.ArrayUnion])      return fs.arrayUnion(...value.args);
      if (value[OP.ArrayRemove])     return fs.arrayRemove(...value.args);
      if (value[OP.Increment])       return fs.increment(value.n);

      // Timestamp markers
      if (value[OP.TsNow])        return fs.Timestamp.now();
      if (value[OP.TsFromMillis]) return fs.Timestamp.fromMillis(value.ms);
      if (value[OP.TsCtor]) {
        const ms = (value.seconds * 1000) + (value.nanoseconds / 1e6);
        return fs.Timestamp.fromMillis(ms);
      }

      // Recurse
      if (Array.isArray(value)) {
        return value.map(v => deepNormalize(fs, v));
      }
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = deepNormalize(fs, v);
      }
      return out;
    }

    return value;
  }

  // ---- Build the compat-like namespace ----
  const fb = g.firebase || (g.firebase = {});

  // Provide a harmless shape for firebase.apps to satisfy checks.
  // (We do NOT try to reflect modular getApps() here to keep it sync/quiet.)
  fb.apps = fb.apps || [{ name: '[DEFAULT]' }];

  // initializeApp: keep quiet; most projects init via their own /firebase-init.js
  fb.initializeApp = function initializeAppCompatIgnored(_cfg) {
    console.warn('[shim] initializeApp ignored (already initialized via your modular init)');
    return null;
  };

  // Firestore compat entrypoint (function like v8)
  function firestoreCompat() {
    // Instance facade providing collection/doc shortcuts
    const inst = {
      // firebase.firestore().collection('c')
      collection(path) {
        return {
          // .add(data)
          async add(data) {
            const { app, fs } = await mods();
            const db  = fs.getFirestore(app.getApp());
            const col = fs.collection(db, path);
            const norm = deepNormalize(fs, data);
            // addDoc returns a DocumentReference; mirror compat by returning it
            return fs.addDoc(col, norm);
          },
          // .doc('id')
          doc(id) {
            return makeDocFacade(path, id);
          }
        };
      },
      // firebase.firestore().doc('c/id[/c2/id2...]')
      doc(path) {
        // Split by '/' and forward to modular doc()
        const segments = String(path).split('/').filter(Boolean);
        return makeDocFacade(...segments);
      }
    };

    return inst;
  }

  // Attach static "namespaces" like in compat on the function object itself
  firestoreCompat.FieldValue = {
    serverTimestamp() { return { [OP.ServerTimestamp]: true }; },
    arrayUnion(...args)  { return { [OP.ArrayUnion]: true, args }; },
    arrayRemove(...args) { return { [OP.ArrayRemove]: true, args }; },
    increment(n)         { return { [OP.Increment]: true, n: Number(n) || 0 }; }
  };

  // A lightweight Timestamp façade: we emit markers and convert on write
  function TimestampCompat(seconds, nanoseconds) {
    return { [OP.TsCtor]: true, seconds: Number(seconds) || 0, nanoseconds: Number(nanoseconds) || 0 };
  }
  TimestampCompat.now        = ()            => ({ [OP.TsNow]: true });
  TimestampCompat.fromMillis = (ms)          => ({ [OP.TsFromMillis]: true, ms: Number(ms) || 0 });
  TimestampCompat.fromDate   = (date)        => ({ [OP.TsFromMillis]: true, ms: Number(date?.getTime?.() || 0) });

  // Attach to the compat "namespace" (v8-style)
  firestoreCompat.Timestamp  = TimestampCompat;

  // Helper: build a doc facade that supports set/update/get
  function makeDocFacade(...segments) {
    return {
      async set(data, options) {
        const { app, fs } = await mods();
        const db  = fs.getFirestore(app.getApp());
        const ref = fs.doc(db, ...segments);
        const norm = deepNormalize(fs, data);
        return options && options.merge
          ? fs.setDoc(ref, norm, { merge: true })
          : fs.setDoc(ref, norm);
      },
      async update(data) {
        const { app, fs } = await mods();
        const db  = fs.getFirestore(app.getApp());
        const ref = fs.doc(db, ...segments);
        const norm = deepNormalize(fs, data);
        return fs.updateDoc(ref, norm);
      },
      async get() {
        const { app, fs } = await mods();
        const db  = fs.getFirestore(app.getApp());
        const ref = fs.doc(db, ...segments);
        return fs.getDoc(ref);
      }
    };
  }

  // Publish the compat-like entrypoint
  fb.firestore = firestoreCompat;

  // Also expose commonly-referenced statics at both firebase.firestore.* and top-level fallback,
  // so code using either style keeps working.
  fb.firestore.FieldValue = firestoreCompat.FieldValue;
  fb.firestore.Timestamp  = firestoreCompat.Timestamp;

  // Some code may do firebase.FieldValue.* — add a gentle alias
  if (!fb.FieldValue) fb.FieldValue = fb.firestore.FieldValue;
  if (!fb.Timestamp)  fb.Timestamp  = fb.firestore.Timestamp;

  console.debug('[shim] firebase-modular shims installed (quiet)');
})();
