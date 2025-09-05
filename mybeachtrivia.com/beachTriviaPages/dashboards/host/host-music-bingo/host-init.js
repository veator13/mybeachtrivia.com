// host-music-bingo/host-init.js
// Initializes Firebase for the Host dashboard (CSP-safe, external file)

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

// Replace these with your actual Firebase project config values
const firebaseConfig = window.FIREBASE_CONFIG || {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

if (!getApps().length) {
  console.log("[host-init] Initializing Firebase app");
  initializeApp(firebaseConfig);
} else {
  console.log("[host-init] Firebase app already initialized");
}
