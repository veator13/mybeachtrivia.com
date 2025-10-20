const functions = require("firebase-functions");
const admin = require("firebase-admin");
try { admin.app(); } catch { admin.initializeApp(); }
const db = admin.firestore();
const TS = admin.firestore.FieldValue.serverTimestamp;

async function copyPlaylist(gameId, playlistId) {
  if (!playlistId) return null;

  // Try both legacy locations
  const candidates = [`playlists/${playlistId}`, `music_bingo/${playlistId}`];
  let src = null, srcPath = null;
  for (const p of candidates) {
    const s = await db.doc(p).get();
    if (s.exists) { src = s.data(); srcPath = p; break; }
  }
  if (!src) {
    console.warn(`[snapshot] no source found for ${playlistId} (game ${gameId})`);
    return null;
  }

  const dstPath = `games/${gameId}/playlist/data`;
  const payload = { ...src, _copiedFrom: srcPath, _copiedAt: TS() };
  await db.doc(dstPath).set(payload, { merge: false });
  console.log(`[snapshot] wrote ${dstPath} (from ${srcPath}) keys=${Object.keys(payload).length}`);
  return true;
}

const snapshotPlaylistOnCreate = functions.firestore
  .document("games/{gameId}")
  .onCreate(async (snap, ctx) => {
    const d = snap.data() || {};
    const gameId = ctx.params.gameId;
    return copyPlaylist(gameId, d.playlistId || d.playlistID || d.playlist);
  });

const snapshotPlaylistOnUpdate = functions.firestore
  .document("games/{gameId}")
  .onUpdate(async (change, ctx) => {
    const before = change.before.data() || {};
    const after  = change.after.data()  || {};
    const gameId = ctx.params.gameId;
    const prevPid = before.playlistId || before.playlistID || before.playlist;
    const nextPid = after.playlistId  || after.playlistID  || after.playlist;
    if (nextPid && nextPid !== prevPid) return copyPlaylist(gameId, nextPid);
    return null;
  });

module.exports = { snapshotPlaylistOnCreate, snapshotPlaylistOnUpdate };
