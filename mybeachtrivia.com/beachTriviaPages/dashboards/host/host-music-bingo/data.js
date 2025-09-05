// app.js — Host Music Bingo UI wiring

import {
  fetchPlaylists,
  createGame,
  getGame,
  updateGameStatus,
  updateGameSongIndex,
  getPlayerCount,
  requireEmployee,
  getCurrentUser
} from './data.js';

const els = {
  playlist: document.querySelector('#playlist-select'),
  gameName: document.querySelector('#game-name'),
  playerLimit: document.querySelector('#player-limit'),
  startBtn: document.querySelector('#start-game-btn'),
  // optional / debug surfaces
  status: document.querySelector('#status-line')
};

function setStatus(msg) {
  console.log('[app]', msg);
  if (els.status) els.status.textContent = msg;
}

// --- Populate playlists dropdown ---
async function loadPlaylists() {
  setStatus('Loading playlists…');
  try {
    // (Optional) require employee to ensure rules allow read
    await requireEmployee().catch(() => null);

    const items = await fetchPlaylists();
    console.log('[app] PLAYLISTS →', items.map(p => ({ id: p.id, title: p.title })));

    // Clear existing options
    els.playlist.innerHTML = '';
    // Placeholder option
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'Select a playlist…';
    ph.disabled = true;
    ph.selected = true;
    els.playlist.appendChild(ph);

    // Add options
    for (const p of items) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.title || p.name || p.playlistTitle || p.id;
      els.playlist.appendChild(opt);
    }

    setStatus(items.length ? `Loaded ${items.length} playlists.` : 'No playlists found.');
  } catch (e) {
    console.error('[app] loadPlaylists error:', e);
    setStatus(`Error loading playlists: ${e.message}`);
  }
}

// --- Start Game handler ---
async function onStartGame() {
  const playlistId = els.playlist?.value || '';
  const name = (els.gameName?.value || '').trim();
  const playerLimit = parseInt(els.playerLimit?.value || '', 10);
  const limit = Number.isFinite(playerLimit) ? playerLimit : null;

  if (!playlistId) {
    setStatus('Choose a playlist first.');
    els.playlist?.focus();
    return;
  }

  try {
    await requireEmployee(); // ensure signed in
    setStatus('Creating game…');

    const game = await createGame({
      playlistId,
      name: name || 'Music Bingo',
      playerLimit: limit
    });

    console.log('[app] Game created:', game);
    setStatus(`Game created: ${game.name} (ID: ${game.id})`);
    // TODO: navigate or reveal game controls UI here
  } catch (e) {
    console.error('[app] createGame error:', e);
    setStatus(`Could not create game: ${e.message}`);
  }
}

// --- Wire events, boot ---
function wireEvents() {
  if (els.startBtn) els.startBtn.addEventListener('click', onStartGame);
}

(async function boot() {
  try {
    wireEvents();

    // quick auth peek
    const u = getCurrentUser();
    console.log('[app] whoami:', u ? (u.email || u.uid) : 'not signed in');

    await loadPlaylists();
  } catch (e) {
    console.error('[app] boot error:', e);
    setStatus(`Init error: ${e.message}`);
  }
})();
