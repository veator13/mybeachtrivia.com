// /beachTriviaPages/js/firebase-init-compat.js
(function () {
  if (!window.firebase) {
    console.error("Firebase SDK not loaded");
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

  try {
    const app = (firebase.apps && firebase.apps.length)
      ? firebase.app()
      : firebase.initializeApp(firebaseConfig);

    try { firebase.analytics && firebase.analytics(app); } catch (_) {}

    // Expose Firestore globally for compat-style usage in app.js
    window.db = firebase.firestore(app);
  } catch (e) {
    console.error("Firebase init failed:", e);
  }
})();
