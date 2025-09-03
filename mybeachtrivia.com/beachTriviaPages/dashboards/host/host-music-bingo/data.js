// data.js — backed by Firebase Firestore for Beach-Trivia-Website
console.debug('[data.js] using beach-trivia-website Firestore');

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
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// --- Firebase config for beach-trivia-website ---
const firebaseConfig = {
  apiKey: "AIzaSyDBKCotY1F943DKfVQqKOGPPkAkQe2Zgog",
  authDomain: "beach-trivia-website.firebaseapp.com",
  projectId: "beach-trivia-website",
  storageBucket: "beach-trivia-website.appspot.com",
  messagingSenderId: "459479368322",
  appId: "1:459479368322:web:7bd3d080d3b9e77610aa9b",
  measurementId: "G-24MQRKKDNY"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function ensureAuth() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, (user) => {
      if (user) return resolve(user);
      signInAnonymously(auth)
        .then(({ user }) => resolve(user))
        .catch(reject);
    });
  });
}

// --- Playlist APIs ---
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

// Back-compat alias for existing code paths
export const getPlaylists = fetchPlaylists;

// --- Game APIs ---
export async function createGame({ playlistId, name, playerLimit }) {
  await ensureAuth();

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
  await ensureAuth();
  const ref = doc(db, 'games', id);
  await updateDoc(ref, { status, updatedAt: serverTimestamp() });
  const snap = await getDoc(ref);
  return { id: snap.id, ...snap.data() };
}

export async function updateGameSongIndex(id, index) {
  await ensureAuth();
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
