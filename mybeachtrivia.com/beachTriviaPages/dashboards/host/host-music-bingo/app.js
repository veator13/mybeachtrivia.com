// Host Music Bingo — minimal UI glue for data.js (modular SDK)

import {
  requireEmployee,
  fetchPlaylists,
  createGame,
  watchPlayerCountRTDB,
  setGamePlayerCount,
} from './data.js';

const $ = (s, r = document) => r.querySelector(s);
const log = (...a) => console.log('[host]', ...a);
const warn = (...a) => console.warn('[host]', ...a);
const err  = (...a) => console.error('[host]', ...a);

// DOM refs (resolved at boot)
let selPlaylist, inputName, inputLimit, btnStart, btnCopy;
let activeGameId = null;
let stopPlayersWatch = null;

async function boot() {
  if (window.__MB_HOST_BOOTED__) return;           // idempotent
  window.__MB_HOST_BOOTED__ = true;

  // Resolve elements present in host-music-bingo.html
  selPlaylist = $('#playlist-select');
  inputName   = $('#game-name');
  inputLimit  = $('#player-limit');
  btnStart    = $('#start-game');
  btnCopy     = $('#copy-join-link');

  if (!selPlaylist || !btnStart) {
    err('Missing required elements (#playlist-select and/or #start-game).');
    return;
  }

  try {
    // Must be signed-in employee (unlocks Firestore rules)
    await requireEmployee();

    // Populate the playlist dropdown
    const lists = await fetchPlaylists();
    selPlaylist.innerHTML = lists.map(p => `<option value="${p.id}">${p.title}</option>`).join('');
    if (!selPlaylist.value && lists.length) selPlaylist.value = lists[0].id;

    // Wire events
    btnStart.addEventListener('click', onStartGame);
    if (btnCopy) btnCopy.addEventListener('click', copyJoinLink);

    log('Host UI ready.');
  } catch (e) {
    err('Boot failed:', e);
    alert(`Signed-in employee required to host.\n\n${e?.message || e}`);
  }
}

async function onStartGame() {
  const playlistId = selPlaylist?.value;
  const name = (inputName?.value || '').trim() || 'Music Bingo';
  const limitRaw = (inputLimit?.value || '').trim();
  const playerLimit = Number.isFinite(parseInt(limitRaw, 10)) ? parseInt(limitRaw, 10) : null;

  if (!playlistId) return alert('Please choose a playlist first.');

  btnStart.disabled = true;
  try {
    const game = await createGame({ playlistId, name, playerLimit });
    activeGameId = game.id;
    log('Game created:', game);

    // Mirror live player count from RTDB → Firestore (best-effort)
    if (stopPlayersWatch) try { stopPlayersWatch(); } catch {}
    stopPlayersWatch = watchPlayerCountRTDB(activeGameId, (count) => {
      setGamePlayerCount(activeGameId, count).catch(() => {});
    });

    alert(`Game started!\n\nID: ${activeGameId}\nPlaylist: ${game.playlistName}`);
  } catch (e) {
    err('Error creating game:', e);
    alert(`Error creating game:\n${e?.message || e}`);
  } finally {
    btnStart.disabled = false;
  }
}

function copyJoinLink() {
  if (!activeGameId) return alert('Start a game first.');
  const url = `${location.origin}/play-music-bingo/?game=${encodeURIComponent(activeGameId)}`;
  navigator.clipboard.writeText(url)
    .then(() => log('Join link copied:', url))
    .catch(() => { warn('Clipboard failed, showing URL.'); alert(url); });
}

// DevTools helpers
window.__mb_host = {
  state: () => ({ activeGameId }),
  refreshPlaylists: async () => {
    const lists = await fetchPlaylists();
    selPlaylist.innerHTML = lists.map(p => `<option value="${p.id}">${p.title}</option>`).join('');
  }
};

// DOM-safe boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
