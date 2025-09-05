// beachTriviaPages/dashboards/host/host-music-bingo/data.js
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

/** Firestore handle — assumes app already initialized via host-init.js */
const app = getApp();
export const db = getFirestore(app);

/** -------------------- Playlists -------------------- */
export async function fetchPlaylists() {
  const q = query(collection(db, 'playlists'), orderBy('name'), limit(200));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** -------------------- Games -------------------- */
export async function createGame({ name, playlistId, playlistName, playerLimit = 100 }) {
  const ref = await addDoc(collection(db, 'games'), {
    name: name || 'Music Bingo',
    playlistId: playlistId || null,
    playlistName: playlistName || null,
    playerLimit: Number(playerLimit) || 100,
    status: 'active',
    songIndex: 0,
    playerCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: ref.id };
}

export async function getGame(gameId) {
  const d = await getDoc(doc(db, 'games', gameId));
  if (!d.exists()) throw new Error('Game not found');
  return { id: d.id, ...d.data() };
}

export async function updateGameSongIndex(gameId, nextIndex) {
  await updateDoc(doc(db, 'games', gameId), {
    songIndex: Number(nextIndex) || 0,
    updatedAt: serverTimestamp(),
  });
}

export async function updateGameStatus(gameId, status) {
  await updateDoc(doc(db, 'games', gameId), {
    status: status || 'ended',
    updatedAt: serverTimestamp(),
  });
}

/** One-off count (fallback). Prefer subscribePlayerCount for live UI. */
export async function getPlayerCount(gameId, { activeWindowMs = 65_000 } = {}) {
  const playersCol = collection(db, 'games', gameId, 'players');
  const snap = await getDocs(playersCol);
  const now = Date.now();
  let active = 0;
  snap.forEach((d) => {
    const data = d.data() || {};
    const last = tsToMillis(data.lastActive) || tsToMillis(data.joinedAt) || 0;
    if (last && now - last <= activeWindowMs) active++;
  });
  return active;
}

/** -------------------- Live player count subscription --------------------
 * Listens to /games/{id}/players/*, counts "active" players by lastActive (or joinedAt)
 * within an activity window, and (optionally) mirrors that count back to games/{id}.playerCount
 * on a throttled cadence so other tools/console reflect reality.
 */
export function subscribePlayerCount(
  gameId,
  onChange,
  { activeWindowMs = 65_000, mirrorToGameDoc = true, mirrorMinIntervalMs = 10_000 } = {},
) {
  if (!gameId) throw new Error('subscribePlayerCount: missing gameId');
  const playersCol = collection(db, 'games', gameId, 'players');

  let lastMirrorAt = 0;

  const unsub = onSnapshot(
    playersCol,
    (snap) => {
      const now = Date.now();
      let active = 0;

      snap.forEach((d) => {
        const data = d.data() || {};

        // Normalize firestore.Timestamp | number | Date → millis
        const lastActive = tsToMillis(data.lastActive);
        const joinedAt = tsToMillis(data.joinedAt);
        const last = lastActive || joinedAt || 0;

        if (last && now - last <= activeWindowMs) active++;
      });

      try { if (typeof onChange === 'function') onChange(active); } catch (e) {
        console.error('[subscribePlayerCount] onChange error:', e);
      }

      // Throttled mirror to games/{id}.playerCount for visibility in console/other readers.
      if (mirrorToGameDoc) {
        const t = Date.now();
        if (t - lastMirrorAt >= mirrorMinIntervalMs) {
          lastMirrorAt = t;
          updateDoc(doc(db, 'games', gameId), {
            playerCount: active,
            updatedAt: serverTimestamp(),
          }).catch((err) => console.warn('[subscribePlayerCount] mirror failed:', err?.message || err));
        }
      }
    },
    (err) => {
      console.error('[subscribePlayerCount] listener error:', err);
    },
  );

  return unsub;
}

/** -------------------- helpers -------------------- */
function tsToMillis(v) {
  if (!v) return 0;
  try {
    // firestore.Timestamp
    if (typeof v.toMillis === 'function') return v.toMillis();
    // Date
    if (v instanceof Date) return v.getTime();
    // number
    if (typeof v === 'number') return v;
  } catch (_) {}
  return 0;
}
