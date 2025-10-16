
// --- Added by fix: ensure anonymous auth before any Firestore reads (player only) ---
async function ensureAnonAuth() {
  try {
    if (!window.firebase || !firebase.auth) return null;
    const auth = firebase.auth();
    if (auth.currentUser) return auth.currentUser;
    try { await auth.signInAnonymously(); } catch (e) { console.warn('[player] anon sign-in attempt:', e && e.message || e); }
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('auth timeout')), 8000);
      const unsub = auth.onAuthStateChanged(u => { if (u) { clearTimeout(timer); unsub(); resolve(u); } });
    });
  } catch (e) {
    console.warn('[player] ensureAnonAuth error:', e && e.message || e);
  }
  return null;
}

/******************************
 * Music Bingo — Player client
 * - Firestore: game + playlist data
 * - RTDB: player presence only
 * - Anonymous Auth for each player (UID = playerId)
 * - Presence gated behind a user tap (previews won't count)
 * - iOS-friendly: Auth.Persistence.NONE + write guard
 ******************************/

/* ---------- Bootstrap ---------- */
if (typeof firebase === 'undefined' || !firebase.apps?.length) {
  console.error('Firebase not initialized. Falling back to sample data.');
  setTimeout(() => initializeGameWithSampleData(), 0);
} else {
  console.log('Firebase initialized — starting player app…');
ensureAnonAuth().then(() => initializeGame()).catch(e => { console.error('[player] auth/init failed:', e); alert('Error loading game (auth). Please retry.'); });
}

/* ---------- Globals ---------- */
let gameData = null;
let playlistData = null;
let currentSongIndex = -1;

let playersRef = null;            // RTDB listener handle
let unsubscribeFirestore = null;  // Firestore listener handle

/* ---------- Board persistence (localStorage) ---------- */
function saveBoardState() {
  const board1 = document.querySelector('.board-1');
  const board2 = document.querySelector('.board-2');
  if (!board1 || !board2) return;
  const gameId = getUrlParameter('gameId') || 'default';
  localStorage.setItem(`musicBingo_${gameId}_board1`, JSON.stringify(getBoardState(board1)));
  localStorage.setItem(`musicBingo_${gameId}_board2`, JSON.stringify(getBoardState(board2)));
  console.log('Board state saved.');
}

function getBoardState(boardEl) {
  const cells = boardEl.querySelectorAll('.bingo-cell');
  const state = [];
  cells.forEach(cell => {
    state.push({
      content: cell.textContent,
      isMatched: cell.classList.contains('matched'),
      isCenter: cell.classList.contains('center-cell')
    });
  });
  return state;
}

function loadBoardState() {
  const gameId = getUrlParameter('gameId') || 'default';
  const s1 = localStorage.getItem(`musicBingo_${gameId}_board1`);
  const s2 = localStorage.getItem(`musicBingo_${gameId}_board2`);
  if (!s1 || !s2) return false;

  const board1 = document.querySelector('.board-1');
  const board2 = document.querySelector('.board-2');
  if (!board1 || !board2) return false;

  restoreBoard(board1, JSON.parse(s1));
  restoreBoard(board2, JSON.parse(s2));
  console.log('Restored saved boards.');
  return true;
}

function restoreBoard(boardEl, state) {
  if (!boardEl) return;
  boardEl.innerHTML = '';
  state.forEach(cellState => {
    const cell = document.createElement('div');
    cell.classList.add('bingo-cell');

    if (cellState.isCenter) {
      cell.classList.add('center-cell');
      cell.addEventListener('click', handleLogoCellClick);
    } else {
      cell.textContent = cellState.content || '';
      cell.addEventListener('click', () => {
        cell.classList.toggle('matched');
        saveBoardState();
      });
    }

    if (cellState.isMatched) cell.classList.add('matched');
    boardEl.appendChild(cell);
  });
}

/* ---------- Utils ---------- */
function getUrlParameter(name) {
  const urlParams = new URLSearchParams(window.location.search);
  const v = urlParams.get(name);
  console.log(`URL param ${name} =`, v);
  return v;
}

/* ---------- Main init ---------- */
async function initializeGame() {
  try {
    console.log('Initializing game…');

    const gameId = getUrlParameter('gameId');
    if (!gameId) {
      console.warn('No gameId in URL — using sample data.');
      initializeGameWithSampleData();
      return;
    }

    const db = firebase.firestore();

    // Load game
    const gameSnap = await db.collection('games').doc(gameId).get();
    if (!gameSnap.exists) {
      console.error('Game not found:', gameId);
      alert('Game not found. Please check your link.');
      initializeGameWithSampleData();
      return;
    }
    gameData = { id: gameSnap.id, ...gameSnap.data() };
    console.log('Game doc:', gameData);

    updateGameTitle(gameData.name || 'Music Bingo');
    currentSongIndex = Number.isInteger(gameData.currentSongIndex)
      ? gameData.currentSongIndex
      : -1;

    // Load playlist
    const playlistId = gameData.playlistId;
    const playlistSnap = await db.collection('music_bingo').doc(playlistId).get();
    if (!playlistSnap.exists) {
      console.error('Playlist not found:', playlistId);
      alert('Playlist not found. Ask the host to check.');
      initializeGameWithSampleData();
      return;
    }
    playlistData = { id: playlistSnap.id, ...playlistSnap.data() };
    console.log('Playlist doc:', playlistData);

    // Extract 25 songs + 25 artists
    const songs = [];
    const artists = [];
    for (let i = 1; i <= 25; i++) {
      const s = playlistData[`song${i}`];
      const a = playlistData[`artist${i}`];
      if (s && a) { songs.push(s); artists.push(a); }
    }
    console.log(`Using ${songs.length} songs / ${artists.length} artists`);

    // Build boards (from saved state if available)
    initializeBoards(songs, artists);

    // Live updates: Firestore game doc + RTDB players only
    setupGameUpdates(gameId);

    // Gate presence behind a user tap (previews won't count)
    renderJoinGate(gameId);

  } catch (err) {
    console.error('initializeGame error:', err);
    alert('Error loading game. Using sample data.');
    initializeGameWithSampleData();
  }
}

/* ---------- Sample data fallback ---------- */
function initializeGameWithSampleData() {
  const sampleSongs = [
    "Oh, Pretty Woman", "California Dreamin'", "I'm a Believer", "Mr. Tambourine Man",
    "Good Vibration", "Happy Together", "Mrs. Robinson", "House Of The Rising Sun",
    "Somebody to Love", "Brown Eyed Girl", "I Got You Babe", "The Locomotion",
    "Do Wah Diddy", "Sugar, Sugar", "Blue Moon", "Respect", "Stand by Me",
    "My Girl", "Unchained Melody", "Be My Baby", "Great Balls of Fire", "Twist and Shout",
    "Jailhouse Rock", "Sherry", "Runaround Sue"
  ];
  const sampleArtists = [
    "Roy Orbison", "The Mamas & The Papas", "The Monkees", "The Byrds",
    "The Beach Boys", "The Turtles", "Simon & Garfunkel", "The Animals",
    "Jefferson Airplane", "Van Morrison", "Sonny & Cher", "Little Eva",
    "Manfred Mann", "The Archies", "The Marcels", "Aretha Franklin", "Ben E. King",
    "The Temptations", "The Righteous Brothers", "The Ronettes", "Jerry Lee Lewis",
    "The Beatles", "Elvis Presley", "The Four Seasons", "Dion"
  ];
  updateGameTitle('Music Bingo');
  initializeBoards(sampleSongs, sampleArtists);
}

/* ---------- UI helpers ---------- */
function updateGameTitle(title) {
  const el = document.querySelector('.game-title');
  if (el) el.textContent = title;
}

/* ---------- Live updates ---------- */
function setupGameUpdates(gameId) {
  try {
    const db = firebase.firestore();

    // 1) Firestore: watch game doc
    unsubscribeFirestore = db.collection('games').doc(gameId)
      .onSnapshot((doc) => {
        if (!doc.exists) return;
        const data = doc.data();
        if (data?.name && data.name !== gameData?.name) {
          updateGameTitle(data.name);
        }
        if (Number.isInteger(data?.currentSongIndex) &&
            data.currentSongIndex !== currentSongIndex) {
          console.log('Current song index changed:', currentSongIndex, '→', data.currentSongIndex);
          currentSongIndex = data.currentSongIndex;
          if (currentSongIndex >= 0) showCurrentSong(currentSongIndex);
        }
        if (data?.status === 'ended') {
          console.log('Game ended.');
          alert('This game has ended. Thanks for playing!');
          if (unsubscribeFirestore) unsubscribeFirestore();
          try { if (playersRef) playersRef.off(); } catch (_) {}
        }
      }, (err) => console.error('Firestore game listener error:', err));

    // 2) RTDB: players presence count (non-critical)
    const rtdb = firebase.database();
    playersRef = rtdb.ref(`games/${gameId}/players`);
    playersRef.on('value', (snap) => {
      const count = snap.exists() ? Object.keys(snap.val()).length : 0;
      console.log('Players currently joined:', count);
      const el = document.querySelector('.player-count');
      if (el) el.textContent = String(count);
    }, (err) => {
      console.warn('Players listener error (non-blocking):', err?.message || err);
    });

  } catch (err) {
    console.error('setupGameUpdates error:', err);
  }
}

/* ---------- Now Playing toast ---------- */
function showCurrentSong(songIndex) {
  if (!playlistData) return;
  const sKey = `song${songIndex + 1}`;
  const aKey = `artist${songIndex + 1}`;
  const song = playlistData[sKey];
  const artist = playlistData[aKey];
  if (!song || !artist) return;

  let note = document.querySelector('.song-notification');
  if (!note) {
    note = document.createElement('div');
    note.className = 'song-notification';
    document.body.appendChild(note);
    const style = document.createElement('style');
    style.textContent = `
      .song-notification {
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: linear-gradient(135deg,#8338EC,#5E60CE); color: #fff;
        padding: 14px 18px; border-radius: 10px; box-shadow: 0 4px 15px rgba(131,56,236,.4);
        z-index: 1000; text-align: center; pointer-events: none; animation: fadeInOut 5s forwards;
      }
      @keyframes fadeInOut {
        0% { opacity: 0; transform: translate(-50%,-20px); }
        10%{ opacity: 1; transform: translate(-50%,0); }
        80%{ opacity: 1; }
        100%{ opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
  note.innerHTML = `<strong>Now Playing:</strong><br>${song} — ${artist}`;
  note.style.animation = 'none'; note.offsetHeight; // reflow
  note.style.animation = 'fadeInOut 5s forwards';
}

/* ---------- Presence: gated join + heartbeat ---------- */
function renderJoinGate(gameId) {
  // Inject minimal styles for the overlay (only once)
  if (!document.getElementById('mb-join-style')) {
    const style = document.createElement('style');
    style.id = 'mb-join-style';
    style.textContent = `
      .mb-join-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,.72);
        display: flex; align-items: center; justify-content: center;
        z-index: 2000;
      }
      .mb-join-card {
        background: #151627; color: #fff; border-radius: 14px;
        padding: 20px 22px; width: min(92vw, 460px); box-shadow: 0 10px 30px rgba(0,0,0,.35);
        text-align: center;
      }
      .mb-join-card h2 { margin: 0 0 10px; font-size: 20px; }
      .mb-join-card p { opacity: .85; margin: 0 0 16px; }
      .mb-join-btn {
        display:inline-block; padding:12px 18px; border-radius: 10px; border: 0;
        background: #6C5CE7; color:#fff; font-weight: 600; cursor: pointer;
      }
      .mb-join-btn[disabled] { opacity: .6; cursor: default; }
    `;
    document.head.appendChild(style);
  }

  // If we already joined in this tab session, auto-skip the gate
  const sessionKey = `mb_joined_${gameId}`;
  if (sessionStorage.getItem(sessionKey) === '1') {
    console.log('Already joined this session — skipping gate.');
    safeJoinGame(gameId, sessionKey);
    return;
  }

  // Build overlay
  const overlay = document.createElement('div');
  overlay.className = 'mb-join-overlay';
  overlay.innerHTML = `
    <div class="mb-join-card">
      <h2>Join “${(gameData?.name || 'Music Bingo').replace(/[<>&]/g, '')}”</h2>
      <p>Tap below to join the game.</p>
      <button class="mb-join-btn" id="mb-join-btn">Tap to Join</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const btn = overlay.querySelector('#mb-join-btn');
  btn?.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await safeJoinGame(gameId, sessionKey);
    } finally {
      // Remove the overlay regardless of network acks
      overlay.remove();
    }
  }, { once: true });
}

async function safeJoinGame(gameId, sessionKey) {
  try {
    console.log('Joining game (gated):', gameId);

    const auth = firebase.auth();

    // iOS-friendly: do not rely on persistent storage
    try {
      await auth.setPersistence(firebase.auth.Auth.Persistence.NONE);
      console.log('[auth] setPersistence NONE ok');
    } catch (e) {
      console.warn('[auth] setPersistence NONE failed:', e?.message || e);
    }

    let user = auth.currentUser;
    if (!user) {
      console.log('[auth] signing in anonymously…');
      const cred = await auth.signInAnonymously();
      user = cred.user;
    }
    const uid = user.uid;
    console.log('[auth] UID:', uid);

    // (Optional) keep LS in sync with legacy behavior
    const key = `bingo_player_${gameId}`;
    const existing = localStorage.getItem(key);
    if (existing !== uid) localStorage.setItem(key, uid);

    // RTDB presence reference
    const db = firebase.database();
    const playerRef = db.ref(`games/${gameId}/players/${uid}`);

    // Cancel any stale onDisconnects (best-effort)
    try { await playerRef.onDisconnect().cancel(); } catch (_) {}

    // 1) Write presence immediately; don't hang UI if slow
    const writePresence = playerRef.set({
      joinedAt: firebase.database.ServerValue.TIMESTAMP,
      lastActive: firebase.database.ServerValue.TIMESTAMP
    });

    await Promise.race([
      writePresence,
      new Promise((resolve) => setTimeout(resolve, 2500))
    ]);
    console.log('[presence] initial write scheduled/guarded');

    // 2) When connected, register onDisconnect cleanup
    try {
      const connRef = db.ref('.info/connected');
      connRef.on('value', (snap) => {
        if (snap.val() === true) {
          try { playerRef.onDisconnect().remove(); } catch (_) {}
          console.log('[presence] onDisconnect registered');
        }
      });
    } catch (_) {
      console.warn('[presence] onDisconnect registration failed (non-blocking)');
    }

    // Heartbeat every 30s
    setInterval(() => {
      playerRef.child('lastActive').set(firebase.database.ServerValue.TIMESTAMP);
    }, 30_000);

    // Refresh lastActive when tab becomes visible again
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        try { playerRef.child('lastActive').set(firebase.database.ServerValue.TIMESTAMP); } catch {}
      }
    });

    // Mark this tab session as joined so refreshes don’t re-count
    sessionStorage.setItem(sessionKey, '1');

    // Best-effort ping on pagehide (iOS)
    window.addEventListener('pagehide', () => {
      try { navigator.sendBeacon?.('/', new Uint8Array()); } catch (_) {}
      try { playerRef.child('lastActive').set(firebase.database.ServerValue.TIMESTAMP); } catch {}
    });

  } catch (err) {
    console.error('Error joining game:', err);
    alert('Could not join the game. Please reload and try again.');
  }
}

/* ---------- Board creation ---------- */
function createBingoBoard(boardEl, songs, artists) {
  if (!boardEl) return;
  boardEl.innerHTML = '';

  const combined = [...songs, ...artists];
  // Fisher-Yates shuffle
  for (let i = combined.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }

  for (let i = 0; i < 25; i++) {
    const cell = document.createElement('div');
    cell.classList.add('bingo-cell');

    if (i === 12) {
      cell.classList.add('center-cell');
      cell.addEventListener('click', handleLogoCellClick);
    } else {
      cell.textContent = combined[i] || '';
      cell.addEventListener('click', () => {
        cell.classList.toggle('matched');
        saveBoardState();
      });
    }

    boardEl.appendChild(cell);
  }

  saveBoardState();
}

function handleLogoCellClick() {
  alert('Free space!');
}

function initializeBoards(songs, artists) {
  const board1 = document.querySelector('.board-1');
  const board2 = document.querySelector('.board-2');
  if (!board1 || !board2) return;

  if (!loadBoardState()) {
    createBingoBoard(board1, songs, artists);
    createBingoBoard(board2, songs, artists);
  }
}

/* ---------- Swipe & board switching ---------- */
let touchStartX = 0;
let touchEndX = 0;
const boardsWrapper = document.querySelector('.boards-wrapper');
const boardDots = document.querySelectorAll('.board-dot');
const boardBtns = document.querySelectorAll('.board-btn');

document.addEventListener('touchstart', e => {
  touchStartX = e.changedTouches[0].screenX;
});
document.addEventListener('touchend', e => {
  touchEndX = e.changedTouches[0].screenX;
  handleSwipe();
});

function handleSwipe() {
  const min = 50;
  if (touchEndX < touchStartX - min) switchToBoard(2);
  else if (touchEndX > touchStartX + min) switchToBoard(1);
}

function switchToBoard(n) {
  if (!boardsWrapper) return;
  if (n === 1) {
    boardsWrapper.style.transform = 'translateX(0)';
    boardDots[1]?.classList.remove('active');
    boardDots[0]?.classList.add('active');
    boardBtns[1]?.classList.remove('active');
    boardBtns[0]?.classList.add('active');
  } else {
    boardsWrapper.style.transform = 'translateX(-50%)';
    boardDots[0]?.classList.remove('active');
    boardDots[1]?.classList.add('active');
    boardBtns[0]?.classList.remove('active');
    boardBtns[1]?.classList.add('active');
  }
}

document.querySelector('.swipe-hint.left')?.addEventListener('click', () => switchToBoard(1));
document.querySelector('.swipe-hint.right')?.addEventListener('click', () => switchToBoard(2));

boardBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const n = parseInt(btn.getAttribute('data-board'), 10);
    switchToBoard(n);
  });
});

/* ---------- New board / Bingo check ---------- */
document.getElementById('new-game-btn')?.addEventListener('click', () => {
  const gameId = getUrlParameter('gameId') || 'default';
  localStorage.removeItem(`musicBingo_${gameId}_board1`);
  localStorage.removeItem(`musicBingo_${gameId}_board2`);

  if (!playlistData) {
    initializeGameWithSampleData();
    return;
  }

  const songs = [];
  const artists = [];
  for (let i = 1; i <= 25; i++) {
    const s = playlistData[`song${i}`];
    const a = playlistData[`artist${i}`];
    if (s && a) { songs.push(s); artists.push(a); }
  }

  const b1 = document.querySelector('.board-1');
  const b2 = document.querySelector('.board-2');
  createBingoBoard(b1, songs, artists);
  createBingoBoard(b2, songs, artists);
});

document.getElementById('check-bingo-btn')?.addEventListener('click', () => {
  const activeBoard =
    boardsWrapper?.style.transform === 'translateX(-50%)'
      ? document.querySelector('.board-2')
      : document.querySelector('.board-1');

  if (activeBoard && checkForBingo(activeBoard)) {
    document.querySelector('.bingo-message')?.setAttribute('style', 'display:block;');
  } else {
    alert('No bingo yet. Keep playing!');
  }
});

document.getElementById('close-bingo-message')?.addEventListener('click', () => {
  document.querySelector('.bingo-message')?.setAttribute('style', 'display:none;');
});

function checkForBingo(board) {
  const cells = board.querySelectorAll('.bingo-cell');
  const arr = Array.from(cells);

  // rows
  for (let r = 0; r < 5; r++) {
    const row = arr.slice(r * 5, r * 5 + 5);
    if (row.every(c => c.classList.contains('matched') || c.classList.contains('center-cell'))) {
      return true;
    }
  }
  // cols
  for (let c = 0; c < 5; c++) {
    const col = [arr[c], arr[c+5], arr[c+10], arr[c+15], arr[c+20]];
    if (col.every(x => x.classList.contains('matched') || x.classList.contains('center-cell'))) {
      return true;
    }
  }
  // diagonals
  const d1 = [arr[0], arr[6], arr[12], arr[18], arr[24]];
  const d2 = [arr[4], arr[8], arr[12], arr[16], arr[20]];
  if (d1.every(x => x.classList.contains('matched') || x.classList.contains('center-cell'))) return true;
  if (d2.every(x => x.classList.contains('matched') || x.classList.contains('center-cell'))) return true;

  return false;
}
