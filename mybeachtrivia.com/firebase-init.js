// /mybeachtrivia.com/firebase-init.js
(function () {
  if (typeof firebase === "undefined") {
    console.error("Firebase SDK not found on window.");
    return;
  }

  const firebaseConfig = {
    apiKey: "AIzaSyDBKCotY1F943DKfVQqKOGPPkAkQe2Zgog",
    authDomain: "mybeachtrivia.com", // custom domain — keeps auth handler on same origin as site
    projectId: "beach-trivia-website",
    storageBucket: "beach-trivia-website.appspot.com",
    messagingSenderId: "459479368322",
    appId: "1:459479368322:web:7bd3d080d3b9e77610aa9b",
    measurementId: "G-24MQRKKDNY"
  };

  try {
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
      console.log("✅ Firebase initialized with authDomain:", firebaseConfig.authDomain);
    }
  } catch (e) {
    console.warn("firebase.initializeApp issue:", e?.message || e);
  }

  try {
    if (firebase.analytics) firebase.analytics();
  } catch (_) {}
})();