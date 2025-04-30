// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDBKCotY1F943DKfVQqKOGPPkAkQe2Zgog",
    authDomain: "beach-trivia-website.firebaseapp.com",
    projectId: "beach-trivia-website",
    storageBucket: "beach-trivia-website.firebasestorage.app",
    messagingSenderId: "459479368322",
    appId: "1:459479368322:web:7bd3d080d3b9e77610aa9b",
    measurementId: "G-24MQRKKDNY"
  };
  
  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
  
  // Debug log to confirm initialization
  console.log("Firebase initialized:", firebase.apps.length > 0);
  console.log("Firebase config:", firebase.apps[0]?.options);