// host-music-bingo/data.js
// Firestore data helpers for the Host dashboard, plus live player-count subscription.

import { getApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  limit,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ---------- Firestore handle ----------
const app = getApp();                 // assumes app already initialized on the page
export const db = getFirestore(app);

// ---------- Playlists ----------
export async function fetchPlaylists() {
  const q = query(collection(db, 'playlists'), orderBy('name'), limit(200));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ---------- Games ----------
export async function createGame({ name, playlistId, playlistName, playerLimit = 100 }) {
  const ref = await addDoc(collection(db, 'games'), {
    name: name || playlistName || 'Music Bingo',
    status: 'waiting',                 // waiting | playing | ended
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    playlistId: playlistId || null,
    playlistName: playlistName || null,
    songIndex: 0,
    playerLimit: Number(playerLimit) || 100,
    playerCount: 0,                    // mirrored for convenience; live count uses subcollection
  });
  return { id: ref.id };
}

export async function getGame(gameId) {
  const d = await getDoc(doc(db, 'games', gameId));
  if (!d.exists()) throw new Error('Game not found');
  return { id: d.id, ...d.data() };
}

export async function updateGameSongIndex(gameId, songIndex) {
  await updateDoc(doc(db, 'games', gameId), {
    songIndex: Number(songIndex) || 0,
    updatedAt: serverTimestamp(),
  });
}

export async function updateGameStatus(gameId, status) {
  await updateDoc(doc(db, 'games', gameId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

// Simple field read (uses mirrored field on the game doc).
export async function getPlayerCount(gameId) {
  const d = await getDoc(doc(db, 'games', gameId));
  return d.exists() ? (d.data().playerCount || 0) : 0;
}

// ---------- Live player count ----------
// Watches /games/{id}/players and calls onChange(count) with number of ACTIVE players.
// A player is "active" if lastActive (or joinedAt) is within activeWindowMs (default 65s).
export function subscribePlayerCount(
  gameId,
  onChange,
  { activeWindowMs = 65_000, mirrorToGameDoc = true, mirrorMinIntervalMs = 10_000 } = {}
) {
  if (!gameId) throw new Error('subscribePlayerCount: missing gameId');
  const playersCol = collection(db, 'games', gameId, 'players');

  let lastMirror = 0;

  const unsub = onSnapshot(
    playersCol,
    (snap) => {
      const now = Date.now();
      let active = 0;

      snap.forEach((ds) => {
        const data = ds.data() || {};
        const lastActive =
          data.lastActive && typeof data.lastActive.toMillis === 'function'
            ? data.lastActive.toMillis()
            : 0;
        const joinedAt =
          data.joinedAt && typeof data.joinedAt.toMillis === 'function'
            ? data.joinedAt.toMillis()
            : 0;

        const last = lastActive || joinedAt;
        if (last && now - last <= activeWindowMs) active++;
      });

      try { onChange(active); } catch (e) { console.error('[subscribePlayerCount] onChange error:', e); }

      // Throttled mirror to games/{id}.playerCount for visibility in console/other readers.
      if (mirrorToGameDoc) {
        const t = Date.now();
        if (t - lastMirror >= mirrorMinIntervalMs) {
          lastMirror = t;
          updateDoc(doc(db, 'games', gameId), {
            playerCount: active,
            updatedAt: serverTimestamp(),
          }).catch((err) => console.warn('[subscribePlayerCount] mirror failed:', err?.message || err));
        }
      }
    },
    (err) => {
      console.error('[subscribePlayerCount] listener error:', err);
    }
  );

  return unsub;
}
