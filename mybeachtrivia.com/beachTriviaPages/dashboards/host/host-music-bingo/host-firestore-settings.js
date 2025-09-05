// beachTriviaPages/dashboards/host/host-music-bingo/host-firestore-settings.js
// Force long-polling + disable fetch streams (use when proxies/CDNs break WebChannel).

import { initializeFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';

initializeFirestore(getApp(), {
  experimentalForceLongPolling: true,
  useFetchStreams: false, // <-- enable this
});

console.log('[host-firestore-settings] Long-polling ON; fetch streams OFF');
