// app.js — host UI + game flow (no Firebase required for now)
import { fetchPlaylists, createGame, getGame, updateGameStatus, updateGameSongIndex, getPlayerCount } from './data.js';
import { renderJoinQRCode } from './qr.js';

// --- State ---
let currentGame = null;
let updateTimer = null;

// --- DOM helpers ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function show(el) { (typeof el === 'string' ? $(el) : el)?.classList.remove('hidden'); }
function hide(el) { (typeof el === 'string' ? $(el) : el)?.classList.add('hidden'); }

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
  await populatePlaylists();
  wireEvents();
});

async function populatePlaylists() {
  const select = $('#playlist-select');
  try {
    const lists = await fetchPlaylists();
    select.innerHTML = '<option value="" disabled selected>Select a playlist...</option>';
    lists.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error('Failed to load playlists', e);
    select.innerHTML = '<option value="" disabled selected>Failed to load playlists</option>';
  }
}

function wireEvents() {
  $('#create-game-btn')?.addEventListener('click', onCreateGame);
  $('#copy-url-btn')?.addEventListener('click', copyJoinUrl);
  $('#play-song-btn')?.addEventListener('click', playCurrentSong);
  $('#next-song-btn')?.addEventListener('click', playNextSong);
  $('#pause-game-btn')?.addEventListener('click', pauseGame);
  $('#resume-game-btn')?.addEventListener('click', resumeGame);
  $('#end-game-btn')?.addEventListener('click', endGame);
}

// --- Game lifecycle ---
async function onCreateGame() {
  const playlistId = $('#playlist-select')?.value;
  if (!playlistId) return alert('Please select a playlist first.');

  const gameName = ($('#game-name')?.value || '').trim() || 'Music Bingo';
  const playerLimitVal = $('#player-limit')?.value;
  const playerLimit = playerLimitVal ? parseInt(playerLimitVal, 10) : null;

  try {
    disableCreate(true);
    currentGame = await createGame({ playlistId, name: gameName, playerLimit });
    updateActiveGameUI(currentGame);
    startPolling();
  } catch (e) {
    console.error(e);
    alert('Error creating game: ' + e.message);
  } finally {
    disableCreate(false);
  }
}

function disableCreate(disabled) {
  const btn = $('#create-game-btn');
  if (btn) { btn.disabled = disabled; btn.textContent = disabled ? 'Creating...' : 'Start New Game'; }
}

function updateActiveGameUI(game) {
  if (!game) return;

  // sections
  hide('.game-setup');
  show('#game-section');

  // labels
  $('#current-game-name').textContent = game.name || 'Music Bingo';
  $('#current-playlist').textContent = game.playlistName || 'Playlist';
  $('#game-id').textContent = game.id;
  $('#player-count').textContent = game.playerCount ?? 0;

  // join url + qr
  const joinUrl = `${window.location.origin}/play-music-bingo/index.html?gameId=${game.id}`;
  $('#join-url').textContent = joinUrl;
  renderJoinQRCode('#qrcode', joinUrl, 200);

  // song text
  updateCurrentSongDisplay(game.currentSongIndex ?? -1);
}

function updateCurrentSongDisplay(index) {
  const el = $('#current-song');
  if (!el) return;
  if (typeof index === 'number' && index >= 0) {
    el.textContent = `Song ${index + 1}`;
  } else {
    el.textContent = 'Not started';
  }
}

function startPolling() {
  stopPolling();
  updateTimer = setInterval(async () => {
    if (!currentGame) return;
    try {
      const latest = await getGame(currentGame.id);
      const playerCount = await getPlayerCount(currentGame.id);
      currentGame = { ...latest, playerCount };
      $('#player-count').textContent = currentGame.playerCount ?? 0;
      if (currentGame.currentSongIndex >= 0) {
        updateCurrentSongDisplay(currentGame.currentSongIndex);
      }
      if (currentGame.status === 'ended') {
        stopPolling();
        alert('Game ended.');
        hide('#game-section');
        show('.game-setup');
      }
    } catch (e) {
      console.warn('Polling error:', e);
    }
  }, 2000);
}

function stopPolling() { if (updateTimer) clearInterval(updateTimer); updateTimer = null; }

// --- Controls ---
async function playCurrentSong() {
  if (!currentGame) return;
  const idx = Math.max(0, currentGame.currentSongIndex ?? 0);
  await updateGameSongIndex(currentGame.id, idx);
  currentGame.currentSongIndex = idx;
  updateCurrentSongDisplay(idx);
  console.log('Playing song index', idx);
}

async function playNextSong() {
  if (!currentGame) return;
  const next = (currentGame.currentSongIndex ?? -1) + 1;
  await updateGameSongIndex(currentGame.id, next);
  currentGame.currentSongIndex = next;
  updateCurrentSongDisplay(next);
  console.log('Next song', next);
}

async function pauseGame() {
  if (!currentGame) return;
  await updateGameStatus(currentGame.id, 'paused');
  currentGame.status = 'paused';
  alert('Game paused.');
}

async function resumeGame() {
  if (!currentGame) return;
  await updateGameStatus(currentGame.id, 'active');
  currentGame.status = 'active';
  alert('Game resumed.');
}

async function endGame() {
  if (!currentGame) return;
  if (!confirm('End this game?')) return;
  await updateGameStatus(currentGame.id, 'ended');
  currentGame = null;
  stopPolling();
  hide('#game-section');
  show('.game-setup');
}

function copyJoinUrl() {
  const url = $('#join-url')?.textContent || '';
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => alert('Join link copied!'));
}