// data.js — Music Bingo host (Beach-Trivia-Website project)
// Robust init (safe if imported multiple times), employee-only auth,
// and playlist fetch that works with either `playlists` or `music_bingo`.

console.debug('[data.js] loading…');

// --- USE LITERAL CDN URLS (static import must be string literals) ---
import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
  query,
  limit
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';

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

// Where to send employees if they aren't logged in (used only in error text)
const LOGIN_URL = '/beachTriviaPages/login.html';

// ---------- Singleton Firebase boot (idempotent) ----------
let app, db, auth;
(function boot() {
  try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    // best-effort; do not block module load
    setPersistence(auth, browserLocalPersistence).catch((e) =>
      console.warn('[data.js] setPersistence warning:', e?.message || e)
    );
    console.log('[data.js] Firebase ready for project:', app.options.projectId);
  } catch (e) {
    console.error('[data.js] Firebase init failed:', e);
    throw e;
  }
})();

// ---------- Auth helpers (employee required, no anonymous) ----------
let cachedUserPromise = null;

async function ensureEmployeeAuth(timeoutMs = 8000) {
  if (cachedUserPromise) return cachedUserPromise;

  cachedUserPromise = new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error('Not signed in (timeout). Please log in to host.'));
    }, timeoutMs);

    const off = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          clearTimeout(t);
          off();
          resolve(user);
        }
      },
      (err) => {
        clearTimeout(t);
        off();
        reject(err);
      }
    );
  });

  return cachedUserPromise;
}

// Exposed for UI to pre-gate actions
export async function requireEmployee() {
  try {
    const u = await ensureEmployeeAuth();
    return u;
  } catch (e) {
    // Friendly message; caller can decide to show a link/button to LOGIN_URL
    throw new Error(`Please log in to host Music Bingo. ${e.message} (Go to ${LOGIN_URL})`);
  }
}

export function getCurrentUser() {
  return auth.currentUser || null;
}

// ---------- Playlists ----------
/**
 * Reads playlists from either `playlists` (new) or `music_bingo` (legacy),
 * merges + sorts by title, and normalizes fields.
 */
export async function fetchPlaylists() {
  console.log('[data.js] Fetching playlists…');

  const normalize = (id, data) => {
    const title =
      data?.playlistTitle ||
      data?.title ||
      data?.name ||
      data?.displayName ||
      id;

    return {
      id,
      title,                 // canonical
      playlistTitle: title,  // back-compat
      name: title,           // back-compat
      ...data
    };
  };

  try {
    // First try modern collection
    const got = [];
    const seen = new Set();

    // Try `playlists`
    try {
      const snap = await getDocs(collection(db, 'playlists'));
      snap.forEach(d => {
        if (!seen.has(d.id)) {
          got.push(normalize(d.id, d.data()));
          seen.add(d.id);
        }
      });
    } catch (e) {
      console.warn('[data.js] `playlists` read warning:', e?.code || e?.message || e);
    }

    // Also try legacy `music_bingo`
    try {
      // keep it light if we already have a lot
      const qb = query(collection(db, 'music_bingo'), limit(Math.max(0, 200 - got.length)));
      const snap = await getDocs(qb);
      snap.forEach(d => {
        if (!seen.has(d.id)) {
          got.push(normalize(d.id, d.data()));
          seen.add(d.id);
        }
      });
    } catch (e) {
      console.warn('[data.js] `music_bingo` read warning:', e?.code || e?.message || e);
    }

    // Sort & return
    got.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    console.log('[data.js] Playlists found:', got.length);
    return got;
  } catch (error) {
    console.error('[data.js] Error fetching playlists:', error);
    if (error.code === 'permission-denied') {
      throw new Error('Permission denied reading playlists. Ensure you are logged in and rules allow employee read.');
    }
    throw new Error(`Failed to fetch playlists: ${error.message}`);
  }
}

// Back-compat alias
export const getPlaylists = fetchPlaylists;

// ---------- Games ----------
export async function createGame({ playlistId, name, playerLimit }) {
  console.log('[data.js] createGame', { playlistId, name, playerLimit });

  await requireEmployee();

  // Pull playlist title for convenience
  const plRef = doc(db, 'playlists', playlistId);
  let playlistTitle = playlistId;

  try {
    const snap = await getDoc(plRef);
    if (snap.exists()) {
      const d = snap.data();
      playlistTitle = d.playlistTitle || d.title || d.name || playlistTitle;
    } else {
      // fall back to legacy collection
      const oldRef = doc(db, 'music_bingo', playlistId);
      const oldSnap = await getDoc(oldRef);
      if (oldSnap.exists()) {
        const d = oldSnap.data();
        playlistTitle = d.playlistTitle || d.title || d.name || playlistTitle;
      }
    }
  } catch (e) {
    console.warn('[data.js] playlist title lookup warning:', e?.message || e);
  }

  const game = {
    name: name || 'Music Bingo',
    playlistId,
    playlistName: playlistTitle,
    status: 'active',
    playerLimit: playerLimit ?? null,
    playerCount: 0,
    currentSongIndex: -1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const ref = await addDoc(collection(db, 'games'), game);
  return { id: ref.id, ...game };
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
  return snap.exists() ? (snap.data().playerCount ?? 0) : 0;
}

// ---------- Optional: tiny debug surface in dev tools ----------
if (typeof window !== 'undefined') {
  window.__mb_dbg = {
    projectId: () => app?.options?.projectId,
    whoami: () => auth.currentUser ? { uid: auth.currentUser.uid, email: auth.currentUser.email || null } : null,
    testPlaylists: () => fetchPlaylists()
  };
}
console.debug('[data.js] ready.');
