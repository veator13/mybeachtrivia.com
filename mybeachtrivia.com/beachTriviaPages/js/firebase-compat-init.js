/* mybeachtrivia.com/beachTriviaPages/js/firebase-compat-init.js
   Creates/ensures firebase compat DEFAULT app so DevTools can use:
   firebase.auth(), firebase.firestore(), firebase.database(), etc.
*/
(function () {
    "use strict";
  
    const firebase = window.firebase;
    if (!firebase || typeof firebase.initializeApp !== "function") {
      console.warn("[firebase-compat-init] firebase compat SDK not present on window.firebase");
      return;
    }
  
    const firebaseConfig = {
      apiKey: "AIzaSyDBKCotY1F943DKfVQqKOGPPkAkQe2Zgog",
      // Must match /firebase-init.js (employee login) or sessions won’t persist across pages.
      authDomain: "mybeachtrivia.com",
      projectId: "beach-trivia-website",
      storageBucket: "beach-trivia-website.appspot.com",
      messagingSenderId: "459479368322",
      appId: "1:459479368322:web:7bd3d080d3b9e77610aa9b",
      measurementId: "G-24MQRKKDNY"
    };
  
    try {
      if (!firebase.apps || firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
        console.log("[firebase-compat-init] ✅ compat DEFAULT app initialized");
      } else {
        console.log("[firebase-compat-init] ✅ compat DEFAULT app already exists");
      }
  
      // handy for quick checks in console
      window.__firebaseCompatApp = firebase.app();
    } catch (e) {
      console.error("[firebase-compat-init] init failed:", e);
    }
  })();