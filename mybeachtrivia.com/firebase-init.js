// firebase-init.js (compat) — initialize BEFORE other app scripts
(function () {
    if (typeof firebase === "undefined") {
      console.error("Firebase SDK not loaded before firebase-init.js");
      return;
    }
  
    const firebaseConfig = {
      apiKey: "AIzaSyDBKCotY1F943DKfVQqKOGPPkAkQe2Zgog",
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
        console.log("✅ Firebase initialized:", firebase.app().name, firebase.app().options);
      } else {
        console.log("⚡ Firebase already initialized:", firebase.app().name);
      }
    } catch (err) {
      console.error("🔥 Firebase init error:", err.message);
    }
  })();
  