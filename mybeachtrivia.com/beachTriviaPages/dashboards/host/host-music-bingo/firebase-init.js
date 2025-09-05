// beachTriviaPages/dashboards/host/host-music-bingo/firebase-init.js
// Define config AND initialize the Firebase App for the host dashboard.

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';

// Public Firebase web config (Beach Trivia Website)
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

// Initialize if needed (idempotent)
if (!getApps().length) {
  initializeApp(window.FIREBASE_CONFIG);
  console.log('[firebase-init] App initialized for host');
} else {
  console.log('[firebase-init] App already initialized');
}
