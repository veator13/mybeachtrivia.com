// app.js — Host Music Bingo (QR enabled, CSS-class based)
import {
  fetchPlaylists,
  createGame,               // ✅ use data-layer helper to create the game
  getGame,
  updateGameSongIndex,
  updateGameStatus,
  getPlayerCount,
  requireEmployee,          // ✅ ensure employee is signed in before reads/writes
  watchPlayerCountRTDB,     // ✅ RTDB live player watcher
  setGamePlayerCount        // ✅ mirror count to Firestore
} from './data.js';
import { renderJoinQRCode } from './qr.js';

// ------- Config: force player link to web.app (iOS-friendly) -------
const WEBAPP_JOIN_BASE =
  'https://beach-trivia-website.web.app/play-music-bingo/index.html'; // use this for QR/link
const JOIN_VERSION = 9; // bump to bust caches when script/index changes

// ------- Element lookups (match host-music-bingo.html) -------
const els = {
  // Form
  playlist: document.querySelector('#playlist-select'),
  gameName: document.querySelector('#game-name'),
  playerLimit: document.querySelector('#player-limit'),
  startBtn: document.querySelector('#start-game-btn'),

  // Join/QR UI
  qrBox: document.querySelector('#qr-code-container'),
  copyJoinBtn: document.querySelector('#copy-join-link-btn'),
  joinLinkDisplay: document.querySelector('#join-link-display'),

  // Game panel
  gameSection: document.querySelector('#game-section'),
  currentGameName: document.querySelector('#current-game-name'),
  currentPlaylist: document.querySelector('#current-playlist'),
  gameId: document.querySelector('#game-id'),
  currentSong: document.querySelector('#current-song'),
  playerCount: document.querySelector('#player-count'),

  // Transport controls
  playBtn: document.querySelector('#play-song-btn'),
  nextBtn: document.querySelector('#next-song-btn'),
  pauseBtn: document.querySelector('#pause-game-btn'),
  resumeBtn: document.querySelector('#resume-game-btn'),
  endBtn: document.querySelector('#end-game-btn'),

  // Any forms on the page
  forms: Array.from(document.querySelectorAll('form'))
};

let activeGame = null;

// ---- RTDB Player Watcher ----
let stopWatchingPlayers = null;

function attachPlayerWatcher(gameId) {
  // stop a previous subscription if any
  if (stopWatchingPlayers) { stopWatchingPlayers(); stopWatchingPlayers = null; }

  // start a new one
  stopWatchingPlayers = watchPlayerCountRTDB(gameId, async (count) => {
    // Update the UI pill
    if (els.playerCount) els.playerCount.textContent = String(count);

    // Mirror to Firestore so anything reading games/{id}.playerCount stays consistent
    try {
      await setGamePlayerCount(gameId, count);
    } catch (e) {
      console.debug('setGamePlayerCount failed:', e?.message || e);
    }
  });
}

// ---------------- UI HELPERS ----------------
function ensureJoinLinkDisplay() {
  if (!els.joinLinkDisplay) {
    const host = els.qrBox?.parentElement || document.body;
    const p = document.createElement('p');
    p.id = 'join-link-display';
    p.className = 'join-url';
    host.appendChild(p);
    els.joinLinkDisplay = p;
  }
}

// Render QR above the link (uses CSS classes; minimal inline)
function renderJoinLink(url) {
  if (!els.qrBox) return;

  els.qrBox.innerHTML = '';

  // Outer panel
  const container = document.createElement('div');
  container.className = 'qr-box';

  // White pad behind QR
  const qrWrap = document.createElement('div');
  qrWrap.className = 'qr-wrap';

  // Render QR (falls back silently if lib missing)
  try {
    renderJoinQRCode(qrWrap, url, 196);
  } catch (e) {
    console.warn('QR render failed; showing link only:', e);
  }

  // Clickable join link under QR
  const link = document.createElement('a');
  link.href = url;
  link.textContent = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'join-url';

  container.appendChild(qrWrap);
  container.appendChild(link);
  els.qrBox.appendChild(container);
}

function wireCopyJoin() {
  if (!els.copyJoinBtn) return;
  els.copyJoinBtn.addEventListener('click', async () => {
    ensureJoinLinkDisplay();
    try {
      const value = (els.joinLinkDisplay?.innerText || els.joinLinkDisplay?.textContent || '').trim();
      if (!value) {
        alert('No join link available yet.');
        return;
      }
      await navigator.clipboard.writeText(value);
      const orig = els.copyJoinBtn.textContent;
      els.copyJoinBtn.textContent = 'Copied!';
      setTimeout(() => (els.copyJoinBtn.textContent = orig), 1200);
    } catch (e) {
      console.error('Copy failed:', e);
      alert('Copy failed. Try manually copying the link above.');
    }
  });
}

function updateGameUI(game, playlistName) {
  activeGame = game;
  els.gameSection?.classList.remove('hidden');

  if (els.currentGameName) els.currentGameName.textContent = game.name || 'Music Bingo Game';
  if (els.currentPlaylist) els.currentPlaylist.textContent = playlistName || game.playlistName || game.playlistId || '';
  if (els.gameId) els.gameId.textContent = game.id || '';

  if (els.currentSong) {
    els.currentSong.textContent =
      typeof game.currentSongIndex === 'number'
        ? `Song ${game.currentSongIndex + 1}`
        : 'Not started';
  }

  if (els.playerCount) els.playerCount.textContent = game.playerCount ?? 0;

  // ✅ Use web.app for player link/QR (works on iOS behind Cloudflare)
  const joinUrl = `${WEBAPP_JOIN_BASE}?gameId=${encodeURIComponent(game.id)}&v=${JOIN_VERSION}`;

  ensureJoinLinkDisplay();
  els.joinLinkDisplay.textContent = joinUrl;
  window.currentJoinLink = joinUrl;

  renderJoinLink(joinUrl);
}

// ---------------- EVENT HANDLERS ----------------
async function handleStartGame(e) {
  e?.preventDefault();

  const playlistId = els.playlist?.value || '';
  const playlistName = els.playlist?.options[els.playlist.selectedIndex]?.textContent || '';
  const name = els.gameName?.value.trim() || 'Music Bingo Game';
  const playerLimit = els.playerLimit?.value ? parseInt(els.playerLimit.value, 10) : null;

  if (!playlistId) {
    alert('Please select a playlist.');
    return;
  }

  try {
    // Ensure auth at action time too (in case session expires)
    await requireEmployee();

    // ✅ Create the game via data-layer helper (no global firebase usage here)
    const game = await createGame({ playlistId, name, playerLimit });

    updateGameUI(game, playlistName);

    // ✅ Start live player watcher (RTDB)
    attachPlayerWatcher(game.id);
  } catch (err) {
    console.error('Error creating game:', err);
    alert('Error creating game: ' + (err?.message || String(err)));
  }
}

async function handlePlaySong(e) {
  e?.preventDefault();
  if (!activeGame) return;
  await updateGameSongIndex(activeGame.id, 0);
  const game = await getGame(activeGame.id);
  activeGame = game;
  if (els.currentSong) els.currentSong.textContent = `Song ${game.currentSongIndex + 1}`;
}

async function handleNextSong(e) {
  e?.preventDefault();
  if (!activeGame) return;
  const nextIndex = (activeGame.currentSongIndex ?? -1) + 1;
  await updateGameSongIndex(activeGame.id, nextIndex);
  const game = await getGame(activeGame.id);
  activeGame = game;
  if (els.currentSong) els.currentSong.textContent = `Song ${game.currentSongIndex + 1}`;
}

async function handlePauseGame(e) {
  e?.preventDefault();
  if (!activeGame) return;
  await updateGameStatus(activeGame.id, 'paused');
}

async function handleResumeGame(e) {
  e?.preventDefault();
  if (!activeGame) return;
  await updateGameStatus(activeGame.id, 'active');
}

async function handleEndGame(e) {
  e?.preventDefault();
  if (!activeGame) return;
  await updateGameStatus(activeGame.id, 'ended');
  activeGame = null;

  // ✅ Stop RTDB watcher
  if (stopWatchingPlayers) { stopWatchingPlayers(); stopWatchingPlayers = null; }

  els.gameSection?.classList.add('hidden');
  if (els.qrBox) els.qrBox.innerHTML = '';
  if (els.joinLinkDisplay) els.joinLinkDisplay.textContent = '';
}

// ---------------- INIT ----------------
async function init() {
  console.log('Initializing Music Bingo Host...');

  // Prevent any accidental form submit refresh
  els.forms.forEach((f) => f.addEventListener('submit', (e) => e.preventDefault()));

  // ----- require employee sign-in before any Firestore reads -----
  try {
    const me = await requireEmployee();
    console.log('[app] signed in as:', me.email || me.uid);
  } catch (e) {
    console.warn('[app] not signed in → redirecting to login:', e.message);
    const redirectTo = location.pathname + location.search + location.hash;
    // ✅ root login path to avoid nested 404s
    location.assign('/login.html?redirect=' + encodeURIComponent(redirectTo));
    return; // stop init until after login
  }

  // Populate playlists
  try {
    const playlists = await fetchPlaylists();

    if (els.playlist) {
      els.playlist.innerHTML = '<option value="" disabled selected>Select a playlist...</option>';
      playlists.forEach((pl) => {
        const opt = document.createElement('option');
        opt.value = pl.id;
        opt.textContent = pl.playlistTitle || pl.name || pl.id;
        els.playlist.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('Failed to load playlists:', err);
    if (els.playlist) {
      els.playlist.innerHTML =
        '<option value="" disabled selected>Error loading playlists - check console</option>';
    }

    if (err.message?.toLowerCase().includes('log in') || err.message?.toLowerCase().includes('auth')) {
      alert('Please log in to access Music Bingo. You may need to visit the login page first.');
    }
  }

  // Wire controls
  els.startBtn?.addEventListener('click', handleStartGame);
  els.playBtn?.addEventListener('click', handlePlaySong);
  els.nextBtn?.addEventListener('click', handleNextSong);
  els.pauseBtn?.addEventListener('click', handlePauseGame);
  els.resumeBtn?.addEventListener('click', handleResumeGame);
  els.endBtn?.addEventListener('click', handleEndGame);

  wireCopyJoin();

  console.log('Music Bingo Host initialized');
}

init();
