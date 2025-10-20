/**
 * Copies the selected playlist into games/{gameId}/playlist/data
 * whenever a game is created, or when its playlistId changes.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();
const TS = admin.firestore.FieldValue.serverTimestamp;

async function copyPlaylist(gameId, playlistId) {
  if (!playlistId) return null;

  const candidates = [
    `playlists/${playlistId}`,
    `music_bingo/${playlistId}`,
  ];

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
  const payload = {
    ...src,
    _copiedFrom: srcPath,
    _copiedAt: TS(),
  };

  await db.doc(dstPath).set(payload, { merge: false });
  console.log(`[snapshot] wrote ${dstPath} (from ${srcPath}) keys=${Object.keys(payload).length}`);
  return true;
}

exports.snapshotPlaylistOnCreate = functions.firestore
  .document("games/{gameId}")
  .onCreate(async (snap, ctx) => {
    const { gameId } = ctx.params;
    const d = snap.data() || {};
    return copyPlaylist(gameId, d.playlistId || d.playlistID || d.playlist);
  });

exports.snapshotPlaylistOnUpdate = functions.firestore
  .document("games/{gameId}")
  .onUpdate(async (change, ctx) => {
    const { gameId } = ctx.params;
    const before = change.before.data() || {};
    const after  = change.after.data()  || {};
    const prevPid = before.playlistId || before.playlistID || before.playlist;
    const nextPid = after.playlistId  || after.playlistID  || after.playlist;
    if (nextPid && nextPid !== prevPid) {
      return copyPlaylist(gameId, nextPid);
    }
    return null;
  });
