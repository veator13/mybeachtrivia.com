// Firebase configuration (Beach Trivia Website)
const firebaseConfig = {
    apiKey: "AIzaSyDBKCotY1F943DKfVQqKOGPPkAkQe2Zgog",
    authDomain: "beach-trivia-website.firebaseapp.com",
    databaseURL: "https://beach-trivia-website-default-rtdb.firebaseio.com",
    projectId: "beach-trivia-website",
    storageBucket: "beach-trivia-website.appspot.com", // classic bucket form for v8 SDK
    messagingSenderId: "459479368322",
    appId: "1:459479368322:web:7bd3d080d3b9e77610aa9b",
    measurementId: "G-24MQRKKDNY"
  };
  
  // Initialize Firebase (v8 syntax)
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  } else {
    firebase.app(); // if already initialized
  }
  
  // Make sure Firestore & Database modules are available
  if (typeof firebase.firestore !== "function") {
    console.error("Firestore module not loaded. Did you include firebase-firestore.js?");
  }
  if (typeof firebase.database !== "function") {
    console.warn("Realtime Database module not loaded (that’s fine if you only use Firestore).");
  }
  
  // Debug logs
  console.log("Firebase initialized:", firebase.apps.length > 0);
  console.log("Firebase projectId:", firebase.apps[0]?.options?.projectId);
  console.log("Firestore available:", typeof firebase.firestore === "function");
  console.log("Realtime Database available:", typeof firebase.database === "function");
  