/* firebase.js
   Firebase helpers for the Host Scoresheet (compat SDK expected).

   - Assumes firebase-app-compat.js, firebase-firestore-compat.js, firebase-auth-compat.js
     AND /beachTriviaPages/js/firebase-init-compat.js have already loaded.
   - Classic script style (no imports). Exposes helpers on window.FirebaseHelpers.
   - Also exposes global functions ensureDbHandle() and ensureSignedIn() so existing
     app.js code can keep calling them unchanged while we split files.
*/
(function () {
    "use strict";
  
    function ensureDbHandle() {
      // If firebase compat is present but window.db is missing, create it.
      if (!window.db && window.firebase?.firestore) {
        try {
          window.db = window.firebase.firestore();
        } catch (e) {
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
      return window.firebase.auth();
    }
  
    async function ensureSignedIn() {
      // Requires auth-compat to be loaded BEFORE this script.
      const auth = getAuth();
      if (auth.currentUser) return auth.currentUser;
  
      // Wait for an existing state or perform anonymous sign-in.
      await new Promise((resolve, reject) => {
        const unsub = auth.onAuthStateChanged((u) => {
          if (u) {
            unsub();
            resolve();
          }
        });
  
        auth.signInAnonymously().catch((err) => {
          unsub();
          reject(err);
        });
      });
  
      return auth.currentUser;
    }
  
    // Namespace export (preferred usage for new split files)
    window.FirebaseHelpers = {
      ensureDbHandle,
      ensureSignedIn,
      getDb,
      getAuth,
    };
  
    // Back-compat globals (so existing app.js can keep calling these)
    window.ensureDbHandle = ensureDbHandle;
    window.ensureSignedIn = ensureSignedIn;
  })();