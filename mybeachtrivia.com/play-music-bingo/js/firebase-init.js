// Firebase configuration  
const firebaseConfig = {
    apiKey: "AIzaSyDBKCotY1F943DKfVQqKOGPPkAkQe2Zgog",
    authDomain: "beach-trivia-website.firebaseapp.com",
    databaseURL: "https://beach-trivia-website-default-rtdb.firebaseio.com",
    projectId: "beach-trivia-website",
    storageBucket: "beach-trivia-website.firebasestorage.app",
    messagingSenderId: "459479368322",
    appId: "1:459479368322:web:7bd3d080d3b9e77610aa9b",
    measurementId: "G-24MQRKKDNY"
};
  
// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
} else {
    firebase.app(); // if already initialized
}

// Make sure the database module is available
if (typeof firebase.database === 'undefined') {
    console.error('Firebase Database module not loaded. Please include the firebase-database.js script.');
}
  
// Debug log to confirm initialization
console.log("Firebase initialized:", firebase.apps.length > 0);
console.log("Firebase config:", firebase.apps[0]?.options);
console.log("Firebase database available:", typeof firebase.database === 'function');