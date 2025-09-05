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

// Where to send employees if they aren't logged in:
const LOGIN_URL = '/beachTriviaPages/login.html'; // change if your login path differs

// Firebase singletons
let app, db, auth;

try {
  console.log('[data.js] Initializing Firebase...');
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  await setPersistence(auth, browserLocalPersistence);
  console.log('[data.js] Firebase initialized successfully');
} catch (error) {
  console.error('[data.js] Firebase initialization failed:', error);
  throw new Error('Firebase initialization failed: ' + error.message);
}

// --- Auth helper: wait for a signed-in employee (no anonymous) ---
let cachedUserPromise;
async function ensureEmployeeAuth() {
  if (!cachedUserPromise) {
    cachedUserPromise = new Promise((resolve, reject) => {
      console.log('[data.js] Checking authentication state...');
      
      const timeout = setTimeout(() => {
        console.error('[data.js] Auth timeout - no user found');
        reject(new Error('Not signed in (timeout). Please log in.'));
      }, 8000);

      const unsubscribe = onAuthStateChanged(auth, (user) => {
        console.log('[data.js] Auth state changed:', user ? `User: ${user.email || user.uid}` : 'No user');
        
        if (user) {
          clearTimeout(timeout);
          unsubscribe();
          console.log('[data.js] User authenticated successfully');
          resolve(user);
        }
        // If no user, we keep waiting until timeout
      }, (err) => {
        console.error('[data.js] Auth error:', err);
        clearTimeout(timeout);
        unsubscribe();
        reject(err);
      });
    });
  }
  return cachedUserPromise;
}

// Utility you can call from UI before enabling "Start New Game"
export async function requireEmployee() {
  try {
    const u = await ensureEmployeeAuth();
    console.log('[data.js] Employee auth confirmed');
    return u; // ok
  } catch (e) {
    console.error('[data.js] Employee auth failed:', e);
    // Friendly message for the UI; do NOT redirect automatically unless you want to.
    throw new Error(`Please log in to host Music Bingo. ${e.message} (Go to ${LOGIN_URL})`);
  }
}

// Check current auth state immediately (non-blocking)
export function getCurrentUser() {
  return auth.currentUser;
}

// -------------------- Playlists --------------------
export async function fetchPlaylists() {
  console.log('[data.js] Fetching playlists...');
  
  try {
    // Check if we have basic Firebase access
    if (!db) {
      throw new Error('Firestore not initialized');
    }
    
    console.log('[data.js] Attempting to read music_bingo collection...');
    const snap = await getDocs(collection(db, 'music_bingo'));
    
    console.log('[data.js] Raw snapshot received:', {
      empty: snap.empty,
      size: snap.size,
      docs: snap.docs.length
    });
    
    if (snap.empty) {
      console.warn('[data.js] No playlists found in music_bingo collection');
      return [];
    }
    
    const items = snap.docs.map(d => {
      const data = d.data() || {};
      const title = data.playlistTitle || data.title || data.name || d.id;
      console.log('[data.js] Processing playlist:', { id: d.id, title, data });
      
      return {
        id: d.id,
        playlistTitle: title,
        title,
        name: title,
        ...data,
      };
    }).sort((a, b) => (a.playlistTitle || '').localeCompare(b.playlistTitle || ''));
    
    console.log('[data.js] Processed playlists:', items);
    return items;
    
  } catch (error) {
    console.error('[data.js] Error fetching playlists:', error);
    
    // Provide more specific error messages
    if (error.code === 'permission-denied') {
      throw new Error('Permission denied accessing playlists. Please ensure you are logged in and have the correct permissions.');
    } else if (error.code === 'unavailable') {
      throw new Error('Firebase service is currently unavailable. Please try again later.');
    } else if (error.message.includes('network')) {
      throw new Error('Network error. Please check your internet connection.');
    } else {
      throw new Error(`Failed to fetch playlists: ${error.message}`);
    }
  }
}

// Back-compat alias
export const getPlaylists = fetchPlaylists;

// ---------------------- Games ----------------------
export async function createGame({ playlistId, name, playerLimit }) {
  console.log('[data.js] Creating game...', { playlistId, name, playerLimit });
  
  // Require an authenticated employee
  await requireEmployee();

  try {
    // Fetch playlist info
    console.log('[data.js] Fetching playlist info for:', playlistId);
    const plRef = doc(db, 'music_bingo', playlistId);
    const plSnap = await getDoc(plRef);
    
    if (!plSnap.exists()) {
      console.error('[data.js] Playlist not found:', playlistId);
      throw new Error('Playlist not found');
    }
    
    const pl = plSnap.data();
    console.log('[data.js] Playlist data:', pl);

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

    console.log('[data.js] Creating game document:', game);
    const docRef = await addDoc(collection(db, 'games'), game);
    console.log('[data.js] Game created with ID:', docRef.id);
    
    return { id: docRef.id, ...game };
  } catch (error) {
    console.error('[data.js] Error creating game:', error);
    throw error;
  }
}

export async function getGame(id) {
  console.log('[data.js] Getting game:', id);
  
  try {
    const ref = doc(db, 'games', id);
    const snap = await getDoc(ref);
    
    if (!snap.exists()) {
      console.error('[data.js] Game not found:', id);
      throw new Error('Game not found');
    }
    
    const game = { id: snap.id, ...snap.data() };
    console.log('[data.js] Game retrieved:', game);
    return game;
  } catch (error) {
    console.error('[data.js] Error getting game:', error);
    throw error;
  }
}

export async function updateGameStatus(id, status) {
  console.log('[data.js] Updating game status:', { id, status });
  
  await requireEmployee();
  
  try {
    const ref = doc(db, 'games', id);
    await updateDoc(ref, { status, updatedAt: serverTimestamp() });
    
    const snap = await getDoc(ref);
    const game = { id: snap.id, ...snap.data() };
    console.log('[data.js] Game status updated:', game);
    return game;
  } catch (error) {
    console.error('[data.js] Error updating game status:', error);
    throw error;
  }
}

export async function updateGameSongIndex(id, index) {
  console.log('[data.js] Updating game song index:', { id, index });
  
  await requireEmployee();
  
  try {
    const ref = doc(db, 'games', id);
    await updateDoc(ref, { currentSongIndex: index, updatedAt: serverTimestamp() });
    
    const snap = await getDoc(ref);
    const game = { id: snap.id, ...snap.data() };
    console.log('[data.js] Game song index updated:', game);
    return game;
  } catch (error) {
    console.error('[data.js] Error updating game song index:', error);
    throw error;
  }
}

export async function getPlayerCount(id) {
  console.log('[data.js] Getting player count for game:', id);
  
  try {
    const ref = doc(db, 'games', id);
    const snap = await getDoc(ref);
    
    if (!snap.exists()) {
      console.warn('[data.js] Game not found for player count:', id);
      return 0;
    }
    
    const count = snap.data().playerCount ?? 0;
    console.log('[data.js] Player count:', count);
    return count;
  } catch (error) {
    console.error('[data.js] Error getting player count:', error);
    return 0;
  }
}