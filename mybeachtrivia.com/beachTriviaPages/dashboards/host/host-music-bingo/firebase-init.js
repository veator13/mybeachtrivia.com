// beachTriviaPages/dashboards/host/host-music-bingo/firebase-init.js
// Define the global config that host-init.js will read.
// No ESM imports here; keep this dead simple and guaranteed to run.

window.FIREBASE_CONFIG = {
    apiKey: "AIzaSyDBKCotY1F943DKfVQqKOGPPkAkQe2Zgog",
    authDomain: "beach-trivia-website.firebaseapp.com",
    databaseURL: "https://beach-trivia-website-default-rtdb.firebaseio.com",
    projectId: "beach-trivia-website",
    storageBucket: "beach-trivia-website.appspot.com",
    messagingSenderId: "459479368322",
    appId: "1:459479368322:web:7bd3d080d3b9e77610aa9b",
    measurementId: "G-24MQRKKDNY"
  };
  
  console.log("[firebase-init] FIREBASE_CONFIG set:", !!window.FIREBASE_CONFIG);
  