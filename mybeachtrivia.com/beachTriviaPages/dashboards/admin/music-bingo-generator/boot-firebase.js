import { getApps, getApp, initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

async function init() {
  const cfg = await fetch('/__/firebase/init.json').then(r => r.json());
  const app = getApps().length ? getApp() : initializeApp(cfg);
  window.auth = getAuth(app);
  window.db   = getFirestore(app);
  console.log('[generator] Firebase initialized:', app.options.projectId);

  // helper to sign in quickly from console: window._signIn()
  window._signIn = async () => {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(window.auth, provider);
    console.log('[generator] signed in as', cred.user.email);
    return cred.user;
  };

  onAuthStateChanged(window.auth, u => console.log('[generator] auth state:', u?.email || 'signed out'));
}
init();
