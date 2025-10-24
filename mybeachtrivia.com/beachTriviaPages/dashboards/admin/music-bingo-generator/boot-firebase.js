import { getApps, getApp, initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, setPersistence,
  browserLocalPersistence, signInWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

(async function init() {
  const cfg = await fetch('/__/firebase/init.json').then(r => r.json());
  const app = getApps().length ? getApp() : initializeApp(cfg);

  const auth = getAuth(app);
  await setPersistence(auth, browserLocalPersistence); // keep session on this origin
  window.auth = auth;
  window.db   = getFirestore(app);

  // Console helpers (optional)
  window._signInEmail = (email, pwd) => signInWithEmailAndPassword(auth, email, pwd);
  window._signInGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());

  // Compat bridge if any legacy code calls firebase.firestore()
  await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js'),
    import('https://www.gstatic.com/firebasejs/10.13.2/firebase-auth-compat.js'),
    import('https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore-compat.js'),
  ]);
  if (!(window.firebase && window.firebase.apps && window.firebase.apps.length)) {
    window.firebase.initializeApp(cfg);
  }
  window.firestore = window.firebase.firestore();

  onAuthStateChanged(auth, u => console.log('[generator] auth:', u?.email || 'signed out'));
  console.log('[generator] Firebase ready:', app.options.projectId);
})();
