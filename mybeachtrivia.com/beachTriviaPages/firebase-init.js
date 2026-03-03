// beachTriviaPages/firebase-init.js
// Initializes Firebase using compat SDK (v9 compat / v8 namespace)
// Safe to include on any page; idempotent; exposes firebaseApp/firebaseDb/firebaseAuth/firebaseFunctions when available.
(function () {
  if (typeof window === "undefined") return;

  if (typeof firebase === "undefined") {
    console.error("[firebase-init] Firebase SDK not loaded before init.");
    return;
  }

  const firebaseConfig = {
    apiKey: "AIzaSyDBKCotY1F943DKfVQqKOGPPkAkQe2Zgog",
    authDomain: "beach-trivia-website.firebaseapp.com",
    projectId: "beach-trivia-website",
    storageBucket: "beach-trivia-website.firebasestorage.app",
    messagingSenderId: "459479368322",
    appId: "1:459479368322:web:7bd3d080d3b9e77610aa9b",
    measurementId: "G-24MQRKKDNY",
  };

  // ------------------------------------------------------------
  // Init (idempotent)
  // ------------------------------------------------------------
  let app = null;

  try {
    if (!firebase.apps || firebase.apps.length === 0) {
      app = firebase.initializeApp(firebaseConfig);
      console.log("[firebase-init] App initialized");
    } else {
      app = firebase.app();
      console.log("[firebase-init] App already initialized");
    }
  } catch (e) {
    // If another script initialized with same name/config, firebase.app() should still work.
    try {
      app = firebase.app();
      console.warn("[firebase-init] init threw, but app() is available:", e?.message || e);
    } catch (e2) {
      console.error("[firebase-init] init failed:", e2?.message || e2);
      return;
    }
  }

  // ------------------------------------------------------------
  // Optional service handles (do NOT crash if a compat module
  // wasn't included on the page)
  // ------------------------------------------------------------
  function safeGet(fn) {
    try {
      return typeof fn === "function" ? fn() : null;
    } catch (_) {
      return null;
    }
  }

  const auth = safeGet(() => firebase.auth());
  const db = safeGet(() => firebase.firestore());
  const functions = safeGet(() => firebase.functions && firebase.functions("us-central1"));

  // Expose commonly-used handles for pages that want them
  // (non-breaking: only adds properties)
  window.firebaseApp = app;
  if (auth) window.firebaseAuth = auth;
  if (db) window.firebaseDb = db;
  if (functions) window.firebaseFunctions = functions;

  // Back-compat alias some pages might expect (safe no-op if already set)
  if (!window.db && db) window.db = db;
})();