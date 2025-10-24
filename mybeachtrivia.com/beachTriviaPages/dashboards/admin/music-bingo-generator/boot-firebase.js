import { getApps, getApp, initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

(async function init() {
  // Hosting config = current site project (beach-trivia-website on prod)
  const cfg = await fetch('/__/firebase/init.json').then(r => r.json());
  const app = getApps().length ? getApp() : initializeApp(cfg);

  // Modular globals (preferred)
  const auth = getAuth(app);
  await setPersistence(auth, browserLocalPersistence);
  window.auth = auth;
  window.db   = getFirestore(app);

  // Load compat libs so legacy code can still call firebase.firestore()/firebase.auth()
  await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js'),
    import('https://www.gstatic.com/firebasejs/10.13.2/firebase-auth-compat.js'),
    import('https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore-compat.js'),
  ]);

  // If a compat DEFAULT app already exists but points to the OLD project,
  // create a named compat app for THIS project and route compat calls to it.
  let compatAppToUse;
  const apps = (window.firebase && window.firebase.apps) || [];
  if (apps.length) {
    const current = apps[0];
    if (current?.options?.projectId !== cfg.projectId) {
      // Make (or reuse) a compat app named "generator" for the correct project
      compatAppToUse = window.firebase.apps.find(a => a.name === 'generator')
                       || window.firebase.initializeApp(cfg, 'generator');

      // Monkey-patch compat accessors to use the generator app
      window.firebase.firestore = () => compatAppToUse.firestore();
      window.firebase.auth      = () => compatAppToUse.auth();

      console.warn(
        `[generator] Rewired compat from ${current?.options?.projectId || 'unknown'} -> ${compatAppToUse.options.projectId}`
      );
    } else {
      compatAppToUse = current;
    }
  } else {
    // No compat app yet — create DEFAULT with the correct config
    compatAppToUse = window.firebase.initializeApp(cfg);
  }

  // Convenience globals (some code may read these)
  window.firestore = window.firebase.firestore();
  window.authCompat = window.firebase.auth();

  onAuthStateChanged(auth, u => console.log('[generator] auth:', u?.email || 'signed out'));
  console.log('[generator] Firebase ready:', app.options.projectId);
})();
