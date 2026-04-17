// data.js — Music Bingo host (Beach-Trivia-Website project)
// Host-only module: requires employee auth to read ALL playlists.
// Merges `/playlists` (new) + `/music_bingo` (legacy) with de-dupe.

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
  setDoc,
  doc,
  serverTimestamp,
  arrayUnion,
  query,
  limit
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import {
  getDatabase,
  ref as rtdbRef,
  onValue
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js';

// ------- Project config: Beach-Trivia-Website -------
const firebaseConfig = {
  apiKey: "AIzaSyDBKCotY1F943DKfVQqKOGPPkAkQe2Zgog",
  // Must match /firebase-init.js (employee login) — same IndexedDB auth key as login.html.
  authDomain: "mybeachtrivia.com",
  // Required for Realtime Database (same URL as play-music-bingo); without it the host never sees /games/.../players.
  databaseURL: "https://beach-trivia-website-default-rtdb.firebaseio.com",
  projectId: "beach-trivia-website",
  storageBucket: "beach-trivia-website.appspot.com",
  messagingSenderId: "459479368322",
  appId: "1:459479368322:web:7bd3d080d3b9e77610aa9b",
  measurementId: "G-24MQRKKDNY"
};

const LOGIN_URL = '/beachTriviaPages/login.html';

// ---------- Singleton Firebase boot (idempotent) ----------
let app, db, auth, rtdb;
(function boot() {
  try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    rtdb = getDatabase(app);

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

// Exposed for UI to pre-gate actions (now enforces employee + role checks)
export async function requireEmployee() {
  // Wait for a signed-in user
  const user = await ensureEmployeeAuth().catch((e) => {
    throw new Error(`Please log in to host Music Bingo. ${e.message} (Go to ${LOGIN_URL})`);
  });

  // Ensure custom claims (roles/admin) are present for Firestore rules
  try { await auth.currentUser.getIdToken(true); }
  catch (e) { console.warn('[data.js] token refresh:', e?.message || e); }

  // Verify there is an employees/{uid} doc and that this user can host
  const snap = await getDoc(doc(db, 'employees', user.uid));
  if (!snap.exists()) {
    throw new Error(
      `Signed in as ${user.email}, but no employee record found (employees/${user.uid}).`
    );
  }

  const emp = snap.data();
  const roles = Array.isArray(emp.roles) ? emp.roles : [];
  const isActive = emp.active === true;

  if (!isActive) {
    throw new Error('Your employee account is not active. Contact an admin.');
  }
  if (!roles.includes('host')) {
    throw new Error(`You are not authorized to host (missing 'host' role).`);
  }

  return user;
}

export function getCurrentUser() {
  return auth.currentUser || null;
}

// --- Snapshot the selected playlist into the game so players never read /playlists ---
async function snapshotPlaylistIntoGame(db, gameId, playlistId) {
  try {
    const primary = await getDoc(doc(db, 'playlists', playlistId));
    let snap = primary, source = 'playlists';

    if (!primary.exists()) {
      const legacy = await getDoc(doc(db, 'music_bingo', playlistId));
      snap = legacy;
      source = 'music_bingo';
    }

    if (snap && snap.exists && snap.exists()) {
      const pdata = snap.data();
      await setDoc(doc(db, 'games', gameId, 'playlist', 'data'), {
        ...pdata,
        source,
        sourceId: playlistId,
        snapshotAt: serverTimestamp()
      });
      console.log('[data.js] snapped playlist into game:', { gameId, source, playlistId });
    } else {
      console.warn('[data.js] playlist not found to snapshot', playlistId);
    }
  } catch (e) {
    console.warn('[data.js] snapshotPlaylistIntoGame error:', e?.message || e);
  }
}

// ---------- Playlists ----------
/**
 * Reads playlists from BOTH `playlists` (new) and `music_bingo` (legacy),
 * merges + sorts by title, and normalizes fields.
 * Requires employee auth so rules allow access to unpublished drafts.
 */
export async function fetchPlaylists() {
  console.log('[data.js] Fetching playlists…');

  // Host page should be employee-only; ensures rules allow the read.
  await requireEmployee();

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

  const got = [];
  const seen = new Set();

  // Try unified `playlists`
  try {
    const snap = await getDocs(collection(db, 'playlists'));
    snap.forEach(d => {
      if (!seen.has(d.id)) {
        got.push(normalize(d.id, d.data()));
        seen.add(d.id);
      }
    });
  } catch (e) {
    console.warn('[data.js] playlists read failed (will still try legacy):', e?.code || e?.message || e);
  }

  // Also read legacy `music_bingo` to surface any not-yet-migrated lists
  try {
    const qb = query(collection(db, 'music_bingo'), limit(Math.max(0, 200 - got.length)));
    const snap = await getDocs(qb);
    snap.forEach(d => {
      if (!seen.has(d.id)) {
        got.push(normalize(d.id, d.data()));
        seen.add(d.id);
      }
    });
  } catch (e) {
    console.warn('[data.js] music_bingo read failed:', e?.code || e?.message || e);
  }

  // Sort & return
  got.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  console.log('[data.js] Playlists found:', got.length);
  return got;
}

// Back-compat alias
export const getPlaylists = fetchPlaylists;

// ---------- Games ----------
export async function createGame({ playlistId, name }) {
  console.log('[data.js] createGame', { playlistId, name });

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
    playerCount: 0,
    sessionJoinTotal: 0,
    currentSongIndex: -1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const ref = await addDoc(collection(db, 'games'), game);

  // Copy chosen playlist into the game for player reads
  try {
    await snapshotPlaylistIntoGame(db, ref.id, playlistId);
  } catch (e) {
    console.warn('[data.js] snapshot error', e?.message || e);
  }

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

// ---------- RTDB Live Player Watcher + Mirror ----------
const ACTIVE_PLAYER_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

function countActivePlayers(data) {
  const now = Date.now();
  let n = 0;
  for (const key of Object.keys(data || {})) {
    const p = data[key];
    if (!p || typeof p !== 'object') continue;
    const t = typeof p.lastActive === 'number' ? p.lastActive : 0;
    if (t && now - t < ACTIVE_PLAYER_WINDOW_MS) n++;
  }
  return n;
}

/**
 * Active = /players with recent lastActive. Total = unique UIDs in /joinLog (written once per join; persists for the session).
 */
export function watchSessionPlayerStats(gameId, callback) {
  const playersRef = rtdbRef(rtdb, `games/${gameId}/players`);
  const joinLogRef = rtdbRef(rtdb, `games/${gameId}/joinLog`);
  let playersVal = {};
  let joinLogVal = {};

  const emit = () => {
    try {
      callback({
        active: countActivePlayers(playersVal),
        totalJoined: Object.keys(joinLogVal || {}).length,
      });
    } catch (e) {
      console.warn('[data.js] watchSessionPlayerStats callback error:', e?.message || e);
    }
  };

  const unsubP = onValue(playersRef, (snap) => {
    playersVal = snap.val() || {};
    emit();
  });
  const unsubJ = onValue(joinLogRef, (snap) => {
    joinLogVal = snap.val() || {};
    emit();
  }, (err) => {
    console.warn('[data.js] joinLog listener denied (totalJoined will use Firestore fallback):', err?.message || err);
  });
  return () => {
    unsubP();
    unsubJ();
  };
}

/** @deprecated Use watchSessionPlayerStats — kept for one-arg callbacks */
export function watchPlayerCountRTDB(gameId, callback) {
  return watchSessionPlayerStats(gameId, ({ active }) => callback(active));
}

/**
 * Mirror RTDB-derived counts to Firestore (best effort).
 */
export async function setGameSessionPlayerStats(id, { active, totalJoined }) {
  await requireEmployee();
  const ref = doc(db, 'games', id);
  const payload = { updatedAt: serverTimestamp() };
  if (typeof active === 'number') payload.playerCount = active;
  if (typeof totalJoined === 'number') payload.sessionJoinTotal = totalJoined;
  await updateDoc(ref, payload);
}

export async function setGamePlayerCount(id, count) {
  await requireEmployee();
  await updateDoc(doc(db, 'games', id), { playerCount: count, updatedAt: serverTimestamp() });
}

// ---------- Playlist raw data (for Spotify queue building) ----------
/**
 * Fetch the raw playlist document data (song1/artist1/uri1...).
 * Tries `playlists` first, then falls back to `music_bingo`.
 */
export async function fetchPlaylistData(playlistId) {
  let snap = await getDoc(doc(db, 'playlists', playlistId));
  if (!snap.exists()) {
    snap = await getDoc(doc(db, 'music_bingo', playlistId));
  }
  if (!snap.exists()) throw new Error(`Playlist not found: ${playlistId}`);
  return snap.data();
}

/**
 * Parse the numbered song1/artist1/uri1... format into a flat array.
 * Returns [{title, artist, uri}], skipping entries with no title and no uri.
 */
export function parsePlaylistTracks(data) {
  const tracks = [];
  let i = 1;
  while (data[`song${i}`] !== undefined || data[`uri${i}`] !== undefined) {
    const title  = data[`song${i}`]   || '';
    const artist = data[`artist${i}`] || '';
    const uri    = data[`uri${i}`]    || '';
    if (title || uri) tracks.push({ title, artist, uri });
    i++;
    if (i > 500) break; // safety
  }
  return tracks;
}

// ---------- Spotify session helpers (stored on the game doc) ----------

export async function saveSpotifyDeviceId(gameId, deviceId) {
  await requireEmployee();
  await updateDoc(doc(db, 'games', gameId), { spotifyDeviceId: deviceId, updatedAt: serverTimestamp() });
}

export async function savePlayedLog(gameId, log) {
  await requireEmployee();
  // Firestore arrays have a 1 MiB document size limit; for very long sessions
  // this is fine (each entry is ~100 bytes → ~10 000 songs before concern).
  await updateDoc(doc(db, 'games', gameId), { spotifyLog: log, updatedAt: serverTimestamp() });
}

export async function loadPlayedLog(gameId) {
  const snap = await getDoc(doc(db, 'games', gameId));
  return snap.exists() ? (snap.data().spotifyLog ?? []) : [];
}

// ---------- Sessions + Rounds (multi-round session architecture) ----------

/**
 * Create a new session doc. Returns { id, name }.
 */
export async function createSession({ name }) {
  await requireEmployee();
  const ref = await addDoc(collection(db, 'sessions'), {
    name: name || 'Music Bingo',
    status: 'active',
    currentRoundId: null,
    currentRoundName: null,
    currentRoundNumber: 0,
    usedPlaylistIds: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: ref.id, name: name || 'Music Bingo' };
}

/**
 * Start a new round within a session. Creates a game doc, snapshots the playlist,
 * and updates session.currentRoundId. Returns { id, ...gameFields }.
 */
export async function startRound({ sessionId, roundNumber, playlistId, playlistTitle }) {
  await requireEmployee();

  let title = playlistTitle || playlistId;
  if (!playlistTitle) {
    try {
      let snap = await getDoc(doc(db, 'playlists', playlistId));
      if (!snap.exists()) snap = await getDoc(doc(db, 'music_bingo', playlistId));
      if (snap.exists()) {
        const d = snap.data();
        title = d.playlistTitle || d.title || d.name || title;
      }
    } catch (_) {}
  }

  const gamePayload = {
    name: title,
    playlistId,
    playlistName: title,
    sessionId,
    roundNumber,
    status: 'active',
    playerCount: 0,
    currentSongIndex: -1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, 'games'), gamePayload);

  // Snapshot playlist tracks into the game doc for player-side reads
  try {
    await snapshotPlaylistIntoGame(db, ref.id, playlistId);
  } catch (_) {}

  // Update session doc
  await updateDoc(doc(db, 'sessions', sessionId), {
    currentRoundId: ref.id,
    currentRoundName: title,
    currentRoundNumber: roundNumber,
    usedPlaylistIds: arrayUnion(playlistId),
    updatedAt: serverTimestamp(),
  });

  return { id: ref.id, ...gamePayload };
}

/**
 * End the current round — marks game as 'round-ended' and clears session.currentRoundId.
 */
export async function endRound(sessionId, roundId) {
  await requireEmployee();
  await updateDoc(doc(db, 'games', roundId), {
    status: 'round-ended',
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'sessions', sessionId), {
    currentRoundId: null,
    updatedAt: serverTimestamp(),
  });
}

/**
 * End the entire session.
 */
export async function endSession(sessionId) {
  await requireEmployee();
  await updateDoc(doc(db, 'sessions', sessionId), {
    status: 'ended',
    currentRoundId: null,
    updatedAt: serverTimestamp(),
  });
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