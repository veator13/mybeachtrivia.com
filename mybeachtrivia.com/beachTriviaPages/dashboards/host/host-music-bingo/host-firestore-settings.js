// beachTriviaPages/dashboards/host/host-music-bingo/host-firestore-settings.js
// Optional: Force long-polling if you're behind a proxy/CDN that blocks WebSockets.

import { initializeFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';

initializeFirestore(getApp(), {
  experimentalForceLongPolling: true,
  // If needed in your environment, you can also disable fetch streams:
  // useFetchStreams: false,
});

console.log('[host-firestore-settings] Firestore initialized with long-polling');
