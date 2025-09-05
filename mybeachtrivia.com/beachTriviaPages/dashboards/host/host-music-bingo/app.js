// app.js — Host Music Bingo (CSP-safe, matches new HTML IDs)
import {
  fetchPlaylists,
  createGame,
  getGame,
  updateGameSongIndex,
  updateGameStatus,
  getPlayerCount
} from './data.js';

// IMPORTANT: absolute path so Hosting doesn't rewrite it
import { renderJoinQRCode } from './qr.js';

// ------- Element lookups (match host-music-bingo.html) -------
const els = {
  playlist: document.querySelector('#playlist-select'),
  gameName: document.querySelector('#game-name'),
  playerLimit: document.querySelector('#player-limit'),

  startBtn: document.querySelector('#start-game-btn'),

  // Join/QR UI
  qrBox: document.querySelector('#qr-code-container'),
  copyJoinBtn: document.querySelector('#copy-join-link-btn'),
  // We'll create #join-link-display on the fly if it doesn't exist
  joinLinkDisplay: document.querySelector('#join-link-display'),

  // Optional game section bits (present in some layouts)
  gameSection: document.querySelector('#game-section'),
  currentGameName: document.querySelector('#current-game-name'),
  currentPlaylist: document.querySelector('#current-playlist'),
  gameId: document.querySelector('#game-id'),
  currentSong: document.querySelector('#current-song'),
  playerCount: document.querySelector('#player-count'),

  // Transport controls (optional)
  playBtn: document.querySelector('#play-song-btn'),
  nextBtn: document.querySelector('#next-song-btn'),
  pauseBtn: document.querySelector('#pause-game-btn'),
  resumeBtn: document.querySelector('#resume-game-btn'),
  endBtn: document.querySelector('#end-game-btn'),

  // Any forms on the page (to prevent submit-refresh)
  forms: Array.from(document.querySelectorAll('form'))
};

let activeGame = null;

// ---------------- UI HELPERS ----------------
function ensureJoinLinkDisplay() {
  if (!els.joinLinkDisplay) {
    const host = document.querySelector('.player-join') || document.body;
    const p = document.createElement('p');
    p.id = 'join-link-display';
    host.appendChild(p);
    els.joinLinkDisplay = p;
  }
}

function renderQR(url) {
  if (!els.qrBox) return;
  els.qrBox.innerHTML = '';
  if (typeof renderJoinQRCode === 'function') {
    renderJoinQRCode(els.qrBox, url, 180);
  } else {
    // Fallback: show the URL as text
    const a = document.createElement('a');
    a.href = url;
    a.textContent = url;
    a.rel = 'noreferrer';
    els.qrBox.appendChild(a);
  }
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
      alert('Copy failed. See console for details.');
    }
  });
}

function updateGameUI(game, playlistName) {
  activeGame = game;
  els.gameSection?.classList.remove('hidden');

  if (els.currentGameName) els.currentGameName.textContent = game.name || 'Music Bingo Game';
  if (els.currentPlaylist) els.currentPlaylist.textContent = playlistName || game.playlistName || game.playlistId || '';
  if (els.gameId) els.gameId.textContent = game.id || '';

  if (els.currentSong) els.currentSong.textContent = (typeof game.currentSongIndex === 'number')
    ? `Song ${game.currentSongIndex + 1}`
    : 'Not started';

  if (els.playerCount) els.playerCount.textContent = game.playerCount ?? 0;

  const joinUrl = `${window.location.origin}/play-music-bingo/index.html?gameId=${encodeURIComponent(game.id)}`;
  ensureJoinLinkDisplay();
  els.joinLinkDisplay.textContent = joinUrl;
  window.currentJoinLink = joinUrl;

  renderQR(joinUrl);
}

// ---------------- EVENT HANDLERS ----------------
async function handleStartGame(e) {
  if (e) e.preventDefault();

  const playlistId = els.playlist?.value || '';
  const playlistName = els.playlist?.options[els.playlist.selectedIndex]?.textContent || '';
  const name = els.gameName?.value.trim() || 'Music Bingo Game';
  const playerLimit = els.playerLimit?.value ? parseInt(els.playerLimit.value, 10) : null;

  if (!playlistId) {
    alert('Please select a playlist.');
    return;
  }

  try {
    const game = await createGame({ playlistId, name, playerLimit });
    updateGameUI(game, playlistName);
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
  els.gameSection?.classList.add('hidden');
  // Optional: clear QR/join UI
  if (els.qrBox) els.qrBox.innerHTML = '';
  if (els.joinLinkDisplay) els.joinLinkDisplay.textContent = '';
}

// ---------------- INIT ----------------
async function init() {
  // Prevent any accidental form submit refresh (causes “flash/spazz”)
  els.forms.forEach((f) => f.addEventListener('submit', (e) => e.preventDefault()));

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
  }

  // Wire controls
  els.startBtn?.addEventListener('click', handleStartGame);
  els.playBtn?.addEventListener('click', handlePlaySong);
  els.nextBtn?.addEventListener('click', handleNextSong);
  els.pauseBtn?.addEventListener('click', handlePauseGame);
  els.resumeBtn?.addEventListener('click', handleResumeGame);
  els.endBtn?.addEventListener('click', handleEndGame);

  wireCopyJoin();
}

init();
