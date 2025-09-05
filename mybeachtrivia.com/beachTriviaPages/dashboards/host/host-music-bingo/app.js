// app.js — Host Music Bingo (CSP-safe, matches new HTML IDs)
import {
  fetchPlaylists,
  createGame,
  getGame,
  updateGameSongIndex,
  updateGameStatus,
  getPlayerCount
} from './data.js';

// Remove the problematic static import of qr.js
// import { renderJoinQRCode } from './qr.js';

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
let renderJoinQRCode = null;

// ---------------- QR HANDLING ----------------
// Fallback QR function
function fallbackRenderQR(target, url, size = 200) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return;
  
  el.innerHTML = '';
  const div = document.createElement('div');
  div.style.cssText = 'padding: 20px; text-align: center; border: 2px dashed #ccc; border-radius: 8px; background: #f9f9f9;';
  
  const p = document.createElement('p');
  p.style.cssText = 'margin: 0 0 10px 0; color: #666; font-size: 14px;';
  p.textContent = 'QR Code Library Not Available';
  
  const link = document.createElement('a');
  link.href = url;
  link.textContent = url;
  link.style.cssText = 'word-break: break-all; font-family: monospace; font-size: 12px; color: #0066cc;';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  
  div.appendChild(p);
  div.appendChild(link);
  el.appendChild(div);
}

// Load QR module dynamically when needed
async function loadQRModule() {
  if (renderJoinQRCode) return renderJoinQRCode;
  
  try {
    console.log('Loading QR module...');
    const qrModule = await import('./qr.js');
    renderJoinQRCode = qrModule.renderJoinQRCode;
    console.log('QR module loaded successfully');
    return renderJoinQRCode;
  } catch (error) {
    console.warn('QR module failed to load, using fallback:', error);
    renderJoinQRCode = fallbackRenderQR;
    return renderJoinQRCode;
  }
}

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

async function renderQR(url) {
  if (!els.qrBox) return;
  els.qrBox.innerHTML = '';
  
  const qrFunction = await loadQRModule();
  qrFunction(els.qrBox, url, 180);
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

async function updateGameUI(game, playlistName) {
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

  await renderQR(joinUrl);
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
    console.log('Creating game with playlist:', playlistId);
    const game = await createGame({ playlistId, name, playerLimit });
    console.log('Game created:', game);
    await updateGameUI(game, playlistName);
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
  console.log('Initializing Music Bingo Host...');
  
  // Prevent any accidental form submit refresh (causes "flash/spazz")
  els.forms.forEach((f) => f.addEventListener('submit', (e) => e.preventDefault()));

  // Populate playlists
  try {
    console.log('Fetching playlists...');
    const playlists = await fetchPlaylists();
    console.log('Playlists fetched:', playlists);
    
    if (els.playlist) {
      els.playlist.innerHTML = '<option value="" disabled selected>Select a playlist...</option>';
      playlists.forEach((pl) => {
        const opt = document.createElement('option');
        opt.value = pl.id;
        opt.textContent = pl.playlistTitle || pl.name || pl.id;
        els.playlist.appendChild(opt);
      });
      console.log('Playlist dropdown populated with', playlists.length, 'items');
    }
  } catch (err) {
    console.error('Failed to load playlists:', err);
    // Show more detailed error to help debug
    if (els.playlist) {
      els.playlist.innerHTML = '<option value="" disabled selected>Error loading playlists - check console</option>';
    }
    
    // Check if it's an auth issue
    if (err.message.includes('log in') || err.message.includes('auth')) {
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
  
  console.log('Music Bingo Host initialized successfully');
}

init();