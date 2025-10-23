/*
  firebase-modular-shims.js (quiet version)
  - Does NOT call firebase.firestore() to detect compat (prevents noisy "No Firebase App" error).
  - Provides minimal FieldValue/Timestamp normalization for compat-shaped writes.
*/
(() => {
  const g = (typeof window !== 'undefined') ? window : globalThis;

  // If a real compat namespace already exists, do nothing.
  if (g.firebase && typeof g.firebase.firestore === 'function' && g.firebase.apps) {
    console.debug('[shim] compat already present; no-op');
    return;
  }

  let _mods = null;
  async function mods() {
    if (_mods) return _mods;
    const app = await import('https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js');
    const fs  = await import('https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js');
    return (_mods = { app, fs });
  }

  // Lightweight compat-like namespace
  const fb = g.firebase || (g.firebase = {});
  fb.initializeApp = (_cfg) => {
    console.warn('[shim] initializeApp ignored (already initialized via /firebase-init.js)');
    return null;
  };
  fb.apps = [{ name: '[DEFAULT]' }];

  fb.firestore = function firestoreCompatFacade() {
    const facade = {
      _ensure: async () => {
        const { app, fs } = await mods();
        const iapp = app.getApp();
        const db   = fs.getFirestore(iapp);
        return { app, fs, db };
      },
      collection: function (path) {
        return {
          doc: (id) => ({
            set: async (data, options) => {
              const { fs, db } = await facade._ensure();
              const ref  = fs.doc(db, path, id);
              const norm = normalizeForModular(fs, data);
              if (options && options.merge) return fs.setDoc(ref, norm, { merge: true });
              return fs.setDoc(ref, norm);
            },
            update: async (data) => {
              const { fs, db } = await facade._ensure();
              const ref  = fs.doc(db, path, id);
              const norm = normalizeForModular(fs, data);
              return fs.updateDoc(ref, norm);
            },
            get: async () => {
              const { fs, db } = await facade._ensure();
              const ref = fs.doc(db, path, id);
              return fs.getDoc(ref);
            }
          })
        };
      }
    };

    // Minimal FieldValue/Timestamp facades for compat-shaped code
    fb.FieldValue = { serverTimestamp: () => ({ __mb_compat_ts__: true }) };
    fb.Timestamp  = { now: () => ({ __mb_compat_now__: true }) };

    return facade;
  };

  function normalizeForModular(fs, obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const out = Array.isArray(obj) ? [] : {};
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object' && v.__mb_compat_ts__) {
        out[k] = fs.serverTimestamp();
      } else if (v && typeof v === 'object' && v.__mb_compat_now__) {
        out[k] = fs.Timestamp.now();
      } else if (v && typeof v === 'object') {
        out[k] = normalizeForModular(fs, v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  console.debug('[shim] firebase-modular shims installed (quiet)');
})();
