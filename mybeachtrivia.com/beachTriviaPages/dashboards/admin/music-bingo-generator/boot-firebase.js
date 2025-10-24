import { getApps, getApp, initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

(async () => {
  const cfg = await fetch('/__/firebase/init.json').then(r => r.json());
  const app = getApps().length ? getApp() : initializeApp(cfg);

  const auth = getAuth(app);
  await setPersistence(auth, browserLocalPersistence);

  const db = getFirestore(app);

  // expose (some code expects these)
  window.auth = auth;
  window.db   = db;

  onAuthStateChanged(auth, u => console.log('[generator] auth:', u?.email || 'signed out'));
  console.log('[generator] Firebase ready:', app.options.projectId);
})();
