// data.js — Music Bingo host backed by Beach-Trivia-Website Firestore
// Auth model: require existing employee login (no anonymous).
console.debug('[data.js] using Beach-Trivia-Website project & employee auth');

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// ------- Project config: Beach-Trivia-Website -------
const firebaseConfig = {
  apiKey: "AIzaSyDBKCotY1F943DKfVQqKOGPPkAkQe2Zgog",
  authDomain: "beach-trivia-website.firebaseapp.com",
  projectId: "beach-trivia-website",
  storageBucket: "beach-trivia-website.appspot.com",
  messagingSenderId: "459479368322",
  appId: "1:459479368322:web:7bd3d080d3b9e77610aa9b",
  measurementId: "G-24MQRKKDNY"
};

// Where to send employees if they aren’t logged in:
const LOGIN_URL = '/beachTriviaPages/login.html'; // change if your login path differs

// Firebase singletons
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
await setPersistence(auth, browserLocalPersistence);

// --- Auth helper: wait for a signed-in employee (no anonymous) ---
let cachedUserPromise;
async function ensureEmployeeAuth() {
  if (!cachedUserPromise) {
    cachedUserPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Not signed in (timeout). Please log in.'));
      }, 8000);

      onAuthStateChanged(auth, (user) => {
        if (user) {
          clearTimeout(timeout);
          resolve(user);
        }
      }, (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }
  return cachedUserPromise;
}

// Utility you can call from UI before enabling “Start New Game”
export async function requireEmployee() {
  try {
    const u = await ensureEmployeeAuth();
    return u; // ok
  } catch (e) {
    // Friendly message for the UI; do NOT redirect automatically unless you want to.
    throw new Error(`Please log in to host Music Bingo. ${e.message} (Go to ${LOGIN_URL})`);
  }
}

// -------------------- Playlists --------------------
export async function fetchPlaylists() {
  const snap = await getDocs(collection(db, 'music_bingo'));
  const items = snap.docs.map(d => {
    const data = d.data() || {};
    const title = data.playlistTitle || data.title || data.name || d.id;
    return {
      id: d.id,
      playlistTitle: title,
      title,
      name: title,
      ...data,
    };
  }).sort((a, b) => (a.playlistTitle || '').localeCompare(b.playlistTitle || ''));
  return items;
}

// Back-compat alias
export const getPlaylists = fetchPlaylists;

// ---------------------- Games ----------------------
export async function createGame({ playlistId, name, playerLimit }) {
  // Require an authenticated employee
  await requireEmployee();

  // Fetch playlist info
  const plRef = doc(db, 'music_bingo', playlistId);
  const plSnap = await getDoc(plRef);
  if (!plSnap.exists()) throw new Error('Playlist not found');
  const pl = plSnap.data();

  const game = {
    name: name || 'Music Bingo',
    playlistId,
    playlistName: pl.playlistTitle || playlistId,
    status: 'active',
    playerLimit: playerLimit ?? null,
    playerCount: 0,
    currentSongIndex: -1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, 'games'), game);
  return { id: docRef.id, ...game };
}

export async function getGame(id) {
  const ref = doc(db, 'games', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Game not found');
  return { id: snap.id, ...snap.data() };
}

export async function updateGameStatus(id, status) {
  await requireEmployee();
  const ref = doc(db, 'games', id);
  await updateDoc(ref, { status, updatedAt: serverTimestamp() });
  const snap = await getDoc(ref);
  return { id: snap.id, ...snap.data() };
}

export async function updateGameSongIndex(id, index) {
  await requireEmployee();
  const ref = doc(db, 'games', id);
  await updateDoc(ref, { currentSongIndex: index, updatedAt: serverTimestamp() });
  const snap = await getDoc(ref);
  return { id: snap.id, ...snap.data() };
}

export async function getPlayerCount(id) {
  const ref = doc(db, 'games', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return 0;
  return snap.data().playerCount ?? 0;
}
