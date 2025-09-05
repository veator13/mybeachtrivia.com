// beachTriviaPages/dashboards/host/host-music-bingo/host-init.js
// Initializes Firebase for the Host dashboard (reads config from firebase-init.js)

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

if (!window.FIREBASE_CONFIG) {
  console.error("[host-init] Missing FIREBASE_CONFIG. Did you load firebase-init.js first?");
} else {
  if (!getApps().length) {
    console.log("[host-init] Initializing Firebase app");
    initializeApp(window.FIREBASE_CONFIG);
  } else {
    console.log("[host-init] Firebase app already initialized");
  }
}
