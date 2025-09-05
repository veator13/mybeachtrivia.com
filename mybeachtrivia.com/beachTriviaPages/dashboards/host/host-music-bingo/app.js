// beachTriviaPages/dashboards/host/host-music-bingo/app.js
// Host dashboard logic: start game, show join link/QR, live player count.

import {
  fetchPlaylists,
  createGame,
  getGame,
  updateGameSongIndex,
  updateGameStatus,
  getPlayerCount,
  subscribePlayerCount,
} from './data.js';

// ------- Element lookups (must match host-music-bingo.html) -------
const els = {
  // setup
  playlist: document.querySelector('#playlist-select'),
  gameName: document.querySelector('#game-name'),
  playerLimit: document.querySelector('#player-limit'),
  startBtn: document.querySelector('#start-game-btn'),

  // live game UI
  gameSection: document.querySelector('#game-section'),
  currentGameName: document.querySelector('#current-game-name'),
  currentPlaylistName: document.querySelector('#current-playlist-name'),
  playerCount: document.querySelector('#player-count-pill'),
  songIndex: document.querySelector('#song-index'),
  nextSongBtn: document.querySelector('#next-song-btn'),
  prevSongBtn: document.querySelector('#prev-song-btn'),
  endGameBtn: document.querySelector('#end-game-btn'),

  // join UI
  qrBox: document.querySelector('#qr-code-container'),
  joinLinkDisplay: document.querySelector('#join-link-display'),

  // optional copy button (present in some layouts)
  copyJoinBtn: document.querySelector('#copy-join-link-btn'),

  // misc
  toast: document.querySelector('#toast'),
};

// ------- State -------
let activeGame = null;
let stopPlayerCount = null;

// ------- Utilities -------
function toast(msg, ms = 1800) {
  if (!els.toast) { console.log('[toast]', msg); return; }
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden', 'opacity-0');
  els.toast.classList.add('opacity-100');
  setTimeout(() => {
    els.toast.classList.add('opacity-0');
    setTimeout(() => els.toast.classList.add('hidden'), 250);
  }, ms);
}
function setText(el, val) { if (el) el.textContent = val ?? ''; }

function makeJoinUrl(gameId) {
  const base = `${location.origin}/play-music-bingo/index.html`;
  const u = new URL(base);
  u.searchParams.set('gameId', gameId);
  return u.toString();
}

function renderJoinLink(game) {
  const url = makeJoinUrl(game.id);
  if (els.joinLinkDisplay) {
    // Works with either <input> or <div>
    if ('value' in els.joinLinkDisplay) els.joinLinkDisplay.value = url;
    else els.joinLinkDisplay.textContent = url;
  }
  if (els.qrBox) {
    els.qrBox.innerHTML = '';
    if (typeof window.renderJoinQRCode === 'function') {
      try { window.renderJoinQRCode(els.qrBox, url, 180); }
      catch (e) { console.warn('QR render failed:', e); els.qrBox.textContent = url; }
    } else {
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = url;
      els.qrBox.appendChild(a);
    }
  }
}

function updateControlsEnabled(enabled) {
  [els.nextSongBtn, els.prevSongBtn, els.endGameBtn, els.copyJoinBtn].forEach((b) => {
    if (b) b.disabled = !enabled;
  });
}

// ------- Data boot -------
async function loadPlaylists() {
  try {
    const items = await fetchPlaylists();
    if (!els.playlist) return;
    els.playlist.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'Choose a playlist…';
    els.playlist.appendChild(ph);
    items.forEach((pl) => {
      const opt = document.createElement('option');
      opt.value = pl.id;
      opt.textContent = pl.name || pl.id;
      opt.dataset.playlistName = pl.name || '';
      els.playlist.appendChild(opt);
    });
  } catch (e) {
    console.error('Failed to load playlists:', e);
    toast('Failed to load playlists');
  }
}

// ------- Game lifecycle -------
async function handleStartGame(e) {
  e?.preventDefault?.();
  if (!els.playlist || !els.playlist.value) { toast('Pick a playlist first'); return; }

  const playlistId = els.playlist.value;
  const playlistName = els.playlist.options[els.playlist.selectedIndex]?.textContent || '';
  const name = (els.gameName && els.gameName.value.trim()) || playlistName || 'Music Bingo';
  const limit = (els.playerLimit && Number(els.playerLimit.value)) || 100;

  try {
    updateControlsEnabled(false);
    const { id } = await createGame({ name, playlistId, playlistName, playerLimit: limit });
    const game = await getGame(id);
    updateGameUI(game);
    toast('Game started');
  } catch (e2) {
    console.error('start game failed:', e2);
    toast('Failed to start game');
  } finally {
    updateControlsEnabled(true);
  }
}

function updateGameUI(game) {
  activeGame = game;
  if (els.gameSection) els.gameSection.classList.remove('hidden');

  setText(els.currentGameName, game.name || 'Music Bingo');
  setText(els.currentPlaylistName, game.playlistName || game.playlistId || '');
  setText(els.songIndex, String(game.songIndex ?? 0));
  if (els.playerCount) setText(els.playerCount, String(game.playerCount ?? 0));

  renderJoinLink(game);

  // (Re)subscribe to live player count for this game
  if (stopPlayerCount) { try { stopPlayerCount(); } catch (_) {} stopPlayerCount = null; }
  stopPlayerCount = subscribePlayerCount(game.id, (count) => {
    if (els.playerCount) setText(els.playerCount, String(count));
  });
}

async function handleNextSong() {
  if (!activeGame) return;
  const idx = Number(activeGame.songIndex || 0) + 1;
  try {
    await updateGameSongIndex(activeGame.id, idx);
    activeGame.songIndex = idx;
    setText(els.songIndex, String(idx));
  } catch (e) {
    console.error('next song failed:', e);
    toast('Failed to update song');
  }
}

async function handlePrevSong() {
  if (!activeGame) return;
  const idx = Math.max(0, Number(activeGame.songIndex || 0) - 1);
  try {
    await updateGameSongIndex(activeGame.id, idx);
    activeGame.songIndex = idx;
    setText(els.songIndex, String(idx));
  } catch (e) {
    console.error('prev song failed:', e);
    toast('Failed to update song');
  }
}

async function handleEndGame(e) {
  e?.preventDefault?.();
  if (!activeGame) return;
  try {
    await updateGameStatus(activeGame.id, 'ended');
    toast('Game ended');
  } catch (e2) {
    console.error('end game failed:', e2);
    toast('Failed to end game');
  }
  if (stopPlayerCount) { try { stopPlayerCount(); } catch (_) {} stopPlayerCount = null; }
  activeGame = null;
  if (els.gameSection) els.gameSection.classList.add('hidden');
  if (els.qrBox) els.qrBox.innerHTML = '';
}

// ------- Clipboard -------
async function handleCopyJoin() {
  if (!activeGame) return;
  const url = makeJoinUrl(activeGame.id);
  try {
    await navigator.clipboard.writeText(url);
    toast('Join link copied');
  } catch (e) {
    console.warn('Clipboard write failed:', e);
    if (els.joinLinkDisplay && 'select' in els.joinLinkDisplay) {
      els.joinLinkDisplay.select();
      toast('Press ⌘/Ctrl+C to copy');
    }
  }
}

// ------- Wire up -------
function bindEvents() {
  els.startBtn?.addEventListener('click', handleStartGame);
  els.nextSongBtn?.addEventListener('click', handleNextSong);
  els.prevSongBtn?.addEventListener('click', handlePrevSong);
  els.endGameBtn?.addEventListener('click', handleEndGame);
  els.copyJoinBtn?.addEventListener('click', handleCopyJoin);
  // Unsubscribe on navigation away
  window.addEventListener('beforeunload', () => {
    if (stopPlayerCount) { try { stopPlayerCount(); } catch (_) {} }
  });
}

// ------- Init -------
async function boot() {
  bindEvents();
  await loadPlaylists();
  updateControlsEnabled(false);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
