// /mybeachtrivia.com/firebase-init.js
(function () {
    if (typeof firebase === "undefined") {
      console.error("Firebase SDK not found on window.");
      return;
    }
  
    // ✅ Config must match the custom domain we are serving on
    const firebaseConfig = {
      apiKey: "AIzaSyDBKCotY1F943DKfVQqKOGPPkAkQe2Zgog",
      authDomain: "mybeachtrivia.com", // ✅ changed to custom domain
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