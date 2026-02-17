/* firebase.js
   Firebase helpers for the Host Scoresheet (compat SDK expected).

   Assumes these are loaded BEFORE this file:
     - firebase-app-compat.js
     - firebase-firestore-compat.js
     - firebase-auth-compat.js
     - /beachTriviaPages/js/firebase-init-compat.js  (initializes firebase app + may set window.db)

   Exposes:
     - window.FirebaseHelpers { ensureDbHandle, getDb, getAuth, ensureSignedIn, onAuthReady }
     - Back-compat globals: window.ensureDbHandle, window.ensureSignedIn
*/
(function () {
    "use strict";
  
    function ensureDbHandle() {
      // If compat Firestore exists but window.db isn't set, create it.
      if (!window.db && window.firebase?.firestore) {
        try {
          window.db = window.firebase.firestore();
        } catch (_) {
          // swallow; caller can handle missing db later
        }
      }
      return window.db || null;
    }
  
    function getDb() {
      const db = ensureDbHandle();
      if (!db) {
        throw new Error(
          "Firestore handle missing — ensure firebase-firestore-compat.js and firebase-init-compat.js are loaded."
        );
      }
      return db;
    }
  
    function getAuth() {
      if (!window.firebase?.auth) {
        throw new Error(
          "Auth SDK missing — load firebase-auth-compat.js before scoresheet scripts."
        );
      }
      try {
        return window.firebase.auth();
      } catch (e) {
        throw new Error("Auth init failed — verify firebase-init-compat.js ran before this script.");
      }
    }
  
    function onAuthReady(timeoutMs) {
      const auth = getAuth();
      if (auth.currentUser) return Promise.resolve(auth.currentUser);
  
      const ms = Number.isFinite(Number(timeoutMs)) ? Number(timeoutMs) : 8000;
  
      return new Promise((resolve, reject) => {
        let done = false;
        let unsub = null;
  
        const t = setTimeout(() => {
          if (done) return;
          done = true;
          try { if (typeof unsub === "function") unsub(); } catch (_) {}
          reject(new Error("Auth state timeout"));
        }, ms);
  
        unsub = auth.onAuthStateChanged(
          (u) => {
            if (done) return;
            if (u) {
              done = true;
              clearTimeout(t);
              try { if (typeof unsub === "function") unsub(); } catch (_) {}
              resolve(u);
            }
          },
          (err) => {
            if (done) return;
            done = true;
            clearTimeout(t);
            try { if (typeof unsub === "function") unsub(); } catch (_) {}
            reject(err);
          }
        );
      });
    }
  
    async function ensureSignedIn() {
      const auth = getAuth();
      if (auth.currentUser) return auth.currentUser;
  
      // Wait briefly for existing session first (avoid unnecessary anonymous sign-in)
      try {
        const u = await onAuthReady(1200);
        if (u) return u;
      } catch (_) {
        // ignore and fall through to anonymous sign-in
      }
  
      // If still not signed in, do anonymous auth then wait for state.
      await auth.signInAnonymously();
      return await onAuthReady(8000);
    }
  
    // Preferred namespace for split files
    window.FirebaseHelpers = {
      ensureDbHandle,
      getDb,
      getAuth,
      ensureSignedIn,
      onAuthReady,
    };
  
    // Back-compat globals (legacy app.js expectations)
    window.ensureDbHandle = window.ensureDbHandle || ensureDbHandle;
    window.ensureSignedIn = window.ensureSignedIn || ensureSignedIn;
  })();