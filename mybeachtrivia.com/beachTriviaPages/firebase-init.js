// beachTriviaPages/firebase-init.js
// Initializes Firebase using compat SDK (v9 compat / v8 namespace)
(function () {
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
      measurementId: "G-24MQRKKDNY"
    };
  
    // Avoid double-init if another page ran this already
    try {
      if (!firebase.apps || firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
        console.log("[firebase-init] App initialized");
      } else {
        console.log("[firebase-init] App already initialized");
      }
    } catch (e) {
      console.error("[firebase-init] init error:", e && e.message ? e.message : e);
    }
  })();
  