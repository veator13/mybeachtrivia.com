// app.js — Host Music Bingo
import {
  fetchPlaylists,
  createGame,
  getGame,
  updateGameSongIndex,
  updateGameStatus,
  getPlayerCount
} from './data.js';

// Elements
const els = {
  playlist: document.querySelector('#playlist-select'),
  gameName: document.querySelector('#game-name'),
  playerLimit: document.querySelector('#player-limit'),
  startBtn: document.querySelector('#create-game-btn'),
  joinUrl: document.querySelector('#join-url'),
  copyJoinBtn: document.querySelector('#copy-url-btn'),
  qrBox: document.querySelector('#qrcode'),
  gameSection: document.querySelector('#game-section'),
  currentGameName: document.querySelector('#current-game-name'),
  currentPlaylist: document.querySelector('#current-playlist'),
  gameId: document.querySelector('#game-id'),
  currentSong: document.querySelector('#current-song'),
  playerCount: document.querySelector('#player-count'),
  playBtn: document.querySelector('#play-song-btn'),
  nextBtn: document.querySelector('#next-song-btn'),
  pauseBtn: document.querySelector('#pause-game-btn'),
  resumeBtn: document.querySelector('#resume-game-btn'),
  endBtn: document.querySelector('#end-game-btn')
};

let activeGame = null;

// ---------------- UI HELPERS ----------------
function renderQR(url) {
  if (!els.qrBox) return;
  els.qrBox.innerHTML = '';
  if (typeof QRCode !== 'undefined') {
    new QRCode(els.qrBox, {
      text: url,
      width: 256,
      height: 256,
      correctLevel: QRCode.CorrectLevel.M
    });
  } else {
    els.qrBox.textContent = url;
  }
}

function wireCopyJoin() {
  if (!els.copyJoinBtn || !els.joinUrl) return;
  els.copyJoinBtn.addEventListener('click', async () => {
    try {
      const value = els.joinUrl.innerText || els.joinUrl.textContent || '';
      await navigator.clipboard.writeText(value);
      const orig = els.copyJoinBtn.textContent;
      els.copyJoinBtn.textContent = 'Copied!';
      setTimeout(() => (els.copyJoinBtn.textContent = orig), 1200);
    } catch {}
  });
}

function updateGameUI(game) {
  activeGame = game;
  els.gameSection.classList.remove('hidden');
  els.currentGameName.textContent = game.name;
  els.currentPlaylist.textContent = game.playlistName;
  els.gameId.textContent = game.id;
  els.currentSong.textContent = 'Not started';
  els.playerCount.textContent = game.playerCount ?? 0;

  const joinUrl = `${window.location.origin}/play-music-bingo/index.html?gameId=${game.id}`;
  els.joinUrl.textContent = joinUrl;
  renderQR(joinUrl);
}

// ---------------- EVENT HANDLERS ----------------
async function handleStartGame() {
  const playlistId = els.playlist.value;
  const playlistName = els.playlist.options[els.playlist.selectedIndex]?.textContent;
  const name = els.gameName.value.trim() || 'Music Bingo Game';
  const playerLimit = els.playerLimit.value ? parseInt(els.playerLimit.value, 10) : null;

  if (!playlistId) {
    alert('Please select a playlist.');
    return;
  }

  try {
    const game = await createGame({ playlistId, name, playerLimit });
    game.playlistName = playlistName;
    updateGameUI(game);
  } catch (err) {
    console.error('Error creating game:', err);
    alert('Error creating game: ' + err.message);
  }
}

async function handlePlaySong() {
  if (!activeGame) return;
  await updateGameSongIndex(activeGame.id, 0);
  const game = await getGame(activeGame.id);
  els.currentSong.textContent = `Song ${game.currentSongIndex + 1}`;
}

async function handleNextSong() {
  if (!activeGame) return;
  const nextIndex = (activeGame.currentSongIndex ?? -1) + 1;
  await updateGameSongIndex(activeGame.id, nextIndex);
  const game = await getGame(activeGame.id);
  activeGame = game;
  els.currentSong.textContent = `Song ${game.currentSongIndex + 1}`;
}

async function handlePauseGame() {
  if (!activeGame) return;
  await updateGameStatus(activeGame.id, 'paused');
}

async function handleResumeGame() {
  if (!activeGame) return;
  await updateGameStatus(activeGame.id, 'active');
}

async function handleEndGame() {
  if (!activeGame) return;
  await updateGameStatus(activeGame.id, 'ended');
  activeGame = null;
  els.gameSection.classList.add('hidden');
}

// ---------------- INIT ----------------
async function init() {
  try {
    const playlists = await fetchPlaylists();
    els.playlist.innerHTML = '<option value="" disabled selected>Select a playlist...</option>';
    playlists.forEach(pl => {
      const opt = document.createElement('option');
      opt.value = pl.id;
      opt.textContent = pl.playlistTitle || pl.name || pl.id;
      els.playlist.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load playlists:', err);
  }

  els.startBtn?.addEventListener('click', handleStartGame);
  els.playBtn?.addEventListener('click', handlePlaySong);
  els.nextBtn?.addEventListener('click', handleNextSong);
  els.pauseBtn?.addEventListener('click', handlePauseGame);
  els.resumeBtn?.addEventListener('click', handleResumeGame);
  els.endBtn?.addEventListener('click', handleEndGame);

  wireCopyJoin();
}

init();
