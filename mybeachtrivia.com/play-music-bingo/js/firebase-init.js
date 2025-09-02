// Firebase configuration  
const firebaseConfig = {
    apiKey: "AIzaSyD9yVdxmgjuiOrvns-mvn-ZybJF0sCWoMQ",
    authDomain: "bt-music-bingo.firebaseapp.com",
    projectId: "bt-music-bingo",
    storageBucket: "bt-music-bingo.appspot.com",   // ✅ FIXED
    messagingSenderId: "1014937614795",
    appId: "1:1014937614795:web:e04ee55d7169934bef1e4e",
    measurementId: "G-P9B40S5DBB"
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