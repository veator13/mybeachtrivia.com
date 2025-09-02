/**
 * Game Manager Module
 * Handles game creation, management, and state updates
 */

import { GAME_SETTINGS } from './config.js';
import {
  createGame,
  updateGameStatus,
  updateGameSongIndex,
  fetchGameHistory,
  getGameById,
  getPlayerCount,
} from './firebase-service.js';
import {
  loadSpotifyPlaylist,
  playSongByIndex,
  isSpotifyReady,
} from './spotify-service.js';

// NOTE: use the actual exports that exist in ui-handler.js
import { showActiveGameUI, updateGameUI, updateCurrentSongDisplay } from './ui-handler.js';

// ----------------------
// State
// ----------------------
let currentGame = null;
let gameInterval = null;
let playlistsData = [];

// ----------------------
// Sanity helpers
// ----------------------
function assertFirebaseReady() {
  if (
    typeof window === 'undefined' ||
    typeof window.firebase === 'undefined' ||
    !firebase.apps ||
    !firebase.apps.length
  ) {
    throw new Error(
      'Firebase not initialized. Make sure /play-music-bingo/js/firebase-init.js is included and your config is correct.'
    );
  }
}

function assertPlaylistsLoaded() {
  if (!Array.isArray(playlistsData) || playlistsData.length === 0) {
    throw new Error(
      'No playlists loaded. Check your Firestore collection (music_bingo) and rules/permissions.'
    );
  }
}

// ----------------------
// Public API
// ----------------------

/** Set playlists data for later lookups */
export function setPlaylistsData(data) {
  playlistsData = data || [];
}

/** Get current active game */
export function getCurrentGame() {
  return currentGame;
}

/** Create a new game */
export async function createNewGame() {
  try {
    assertFirebaseReady();
    assertPlaylistsLoaded();
  } catch (e) {
    console.error(e);
    alert(e.message);
    return;
  }

  const playlistSelect = document.getElementById('playlist-select');
  const gameNameInput = document.getElementById('game-name');
  const playerLimitInput = document.getElementById('player-limit');

  const playlistId = playlistSelect?.value;
  if (!playlistId) {
    alert('Please select a playlist first');
    return;
  }

  const gameName =
    (gameNameInput?.value || '').trim() || GAME_SETTINGS.DEFAULT_GAME_NAME;
  const playerLimit = playerLimitInput?.value
    ? parseInt(playerLimitInput.value, 10)
    : null;

  try {
    const selectedPlaylist = playlistsData.find((p) => p.id === playlistId);
    if (!selectedPlaylist) {
      throw new Error('Selected playlist not found');
    }

    const createButton = document.getElementById('create-game-btn');
    if (createButton) {
      createButton.disabled = true;
      createButton.textContent = 'Creating Game...';
    }

    const gameData = {
      playlistId,
      playlistName: selectedPlaylist?.name || 'Unknown Playlist',
      name: gameName,
      playerLimit,
    };

    const newGame = await createGame(gameData);
    console.log('Game created with ID:', newGame.id);

    currentGame = newGame;

    // Reveal the game section and render details (includes QR)
    showActiveGameUI(currentGame);

    startGameUpdateInterval();
    loadGameHistory();

    if (isSpotifyReady() && currentGame?.playlistId) {
      loadSpotifyPlaylist(currentGame.playlistId, playlistsData);
    }
  } catch (err) {
    console.error('Error creating game:', err);
    alert('Error creating game: ' + err.message);

    const createButton = document.getElementById('create-game-btn');
    if (createButton) {
      createButton.disabled = false;
      createButton.textContent = 'Start New Game';
    }
  }
}

/** Poll for game updates (player count, status, etc.) */
export function startGameUpdateInterval() {
  clearInterval(gameInterval);

  gameInterval = setInterval(async () => {
    if (!currentGame) return;

    try {
      assertFirebaseReady();

      const playerCount = await getPlayerCount(currentGame.id);
      const latestGame = await getGameById(currentGame.id);

      if (!latestGame) {
        console.log('Game no longer exists');
        endGame();
        return;
      }

      currentGame = { ...latestGame, playerCount };

      const playerCountElement = document.getElementById('player-count');
      if (playerCountElement) {
        playerCountElement.textContent = currentGame.playerCount || 0;
      }

      if (currentGame.currentSongIndex >= 0) {
        updateCurrentSongDisplay(currentGame.currentSongIndex);
      }

      if (currentGame.status === 'ended') {
        endGame();
      }
    } catch (err) {
      console.error('Error updating game data:', err);
    }
  }, GAME_SETTINGS.UPDATE_INTERVAL);
}

/** Play current song (or begin at first) */
export async function playCurrentSong() {
  try {
    assertFirebaseReady();
    assertPlaylistsLoaded();
  } catch (e) {
    console.error(e);
    alert(e.message);
    return;
  }

  if (!currentGame) return;

  try {
    const selectedPlaylist = playlistsData.find(
      (p) => p.id === currentGame.playlistId,
    );
    if (!selectedPlaylist) {
      alert('Playlist not found');
      return;
    }

    let songIndex = currentGame.currentSongIndex;
    if (songIndex < 0) songIndex = 0;

    let songCount = 0;
    for (let i = 1; i <= GAME_SETTINGS.MAX_SONGS_PER_PLAYLIST; i++) {
      if (selectedPlaylist[`artist${i}`]) songCount++;
      else break;
    }

    if (songIndex >= songCount) {
      alert('All songs have been played');
      return;
    }

    await updateGameSongIndex(currentGame.id, songIndex);
    currentGame.currentSongIndex = songIndex;

    updateCurrentSongDisplay(songIndex);

    if (isSpotifyReady()) {
      playSongByIndex(songIndex);
    } else {
      const songArtistKey = `artist${songIndex + 1}`;
      const songTitleKey = `song${songIndex + 1}`;
      console.log(
        'Playing song:',
        `${selectedPlaylist[songTitleKey]} - ${selectedPlaylist[songArtistKey]}`,
      );
    }
  } catch (err) {
    console.error('Error playing song:', err);
    alert('Error playing song: ' + err.message);
  }
}

/** Advance to next song */
export async function playNextSong() {
  try {
    assertFirebaseReady();
    assertPlaylistsLoaded();
  } catch (e) {
    console.error(e);
    alert(e.message);
    return;
  }

  if (!currentGame) return;

  try {
    const selectedPlaylist = playlistsData.find(
      (p) => p.id === currentGame.playlistId,
    );
    if (!selectedPlaylist) {
      alert('Playlist not found');
      return;
    }

    let nextIndex = (currentGame.currentSongIndex || 0) + 1;

    let songCount = 0;
    for (let i = 1; i <= GAME_SETTINGS.MAX_SONGS_PER_PLAYLIST; i++) {
      if (selectedPlaylist[`artist${i}`]) songCount++;
      else break;
    }

    if (nextIndex >= songCount) {
      alert('This was the last song in the playlist');
      return;
    }

    await updateGameSongIndex(currentGame.id, nextIndex);
    currentGame.currentSongIndex = nextIndex;

    updateCurrentSongDisplay(nextIndex);

    if (isSpotifyReady()) {
      playSongByIndex(nextIndex);
    } else {
      const songArtistKey = `artist${nextIndex + 1}`;
      const songTitleKey = `song${nextIndex + 1}`;
      console.log(
        'Playing next song:',
        `${selectedPlaylist[songTitleKey]} - ${selectedPlaylist[songArtistKey]}`,
      );
    }
  } catch (err) {
    console.error('Error playing next song:', err);
    alert('Error playing next song: ' + err.message);
  }
}

/** Pause the game */
export async function pauseGame() {
  try {
    assertFirebaseReady();
  } catch (e) {
    console.error(e);
    alert(e.message);
    return;
  }

  if (!currentGame) return;

  try {
    await updateGameStatus(currentGame.id, 'paused');
    currentGame.status = 'paused';

    if (isSpotifyReady()) {
      import('./spotify-service.js').then((m) => m.togglePlayback());
    }

    alert(
      'Game paused. Players will not be able to mark new squares until you resume.',
    );
  } catch (err) {
    console.error('Error pausing game:', err);
    alert('Error pausing game: ' + err.message);
  }
}

/** Resume the game (optionally from a known id) */
export async function resumeGame(gameId = null) {
  try {
    assertFirebaseReady();
  } catch (e) {
    console.error(e);
    alert(e.message);
    return;
  }

  if (gameId && !currentGame) {
    try {
      const game = await getGameById(gameId);
      if (game) {
        currentGame = game;
        showActiveGameUI(currentGame);
        startGameUpdateInterval();
      }
    } catch (err) {
      console.error('Error loading game:', err);
      return;
    }
  }

  if (!currentGame) return;

  try {
    await updateGameStatus(currentGame.id, 'active');
    currentGame.status = 'active';

    if (isSpotifyReady()) {
      import('./spotify-service.js').then((m) => m.togglePlayback());
    }

    alert('Game resumed. Players can now continue playing.');
  } catch (err) {
    console.error('Error resuming game:', err);
    alert('Error resuming game: ' + err.message);
  }
}

/** End the game and reset UI */
export async function endGame() {
  try {
    assertFirebaseReady();
  } catch (e) {
    console.error(e);
    // If Firebase truly isn't ready here, just hide the section safely.
  }

  if (!currentGame) {
    const gameSection = document.getElementById('game-section');
    if (gameSection) gameSection.classList.add('hidden');
    return;
  }

  try {
    if (
      currentGame.status !== 'ended' &&
      !confirm(
        'Are you sure you want to end this game? Players will no longer be able to join or play.',
      )
    ) {
      return;
    }

    await updateGameStatus(currentGame.id, 'ended');

    if (isSpotifyReady()) {
      import('./spotify-service.js').then((m) => {
        m.togglePlayback();
      });
    }

    currentGame = null;
    clearInterval(gameInterval);

    const gameSection = document.getElementById('game-section');
    if (gameSection) gameSection.classList.add('hidden');

    const playlistSelect = document.getElementById('playlist-select');
    const gameNameInput = document.getElementById('game-name');
    const playerLimitInput = document.getElementById('player-limit');

    if (playlistSelect) playlistSelect.value = '';
    if (gameNameInput) gameNameInput.value = '';
    if (playerLimitInput) playerLimitInput.value = '';

    const createButton = document.getElementById('create-game-btn');
    if (createButton) {
      createButton.disabled = false;
      createButton.textContent = 'Start New Game';
    }

    loadGameHistory();
  } catch (err) {
    console.error('Error ending game:', err);
    alert('Error ending game: ' + err.message);
  }
}

/** Restart a previous game by cloning its setup */
export async function restartGame(gameId) {
  try {
    assertFirebaseReady();
  } catch (e) {
    console.error(e);
    alert(e.message);
    return;
  }

  try {
    const game = await getGameById(gameId);
    if (!game) {
      alert('Game not found');
      return;
    }

    if (
      !confirm(
        `Restart game "${game.name}"? This will create a new game with the same playlist.`,
      )
    ) {
      return;
    }

    const playlistSelect = document.getElementById('playlist-select');
    const gameNameInput = document.getElementById('game-name');

    if (playlistSelect) playlistSelect.value = game.playlistId;
    if (gameNameInput) gameNameInput.value = game.name;

    createNewGame();
  } catch (err) {
    console.error('Error restarting game:', err);
    alert('Error restarting game: ' + err.message);
  }
}

/** Load recent games and render the history list */
export async function loadGameHistory() {
  const historyList = document.getElementById('game-history-list');
  if (!historyList) return;

  try {
    assertFirebaseReady();
  } catch (e) {
    console.error(e);
    historyList.innerHTML =
      '<p class="empty-state">Firebase not initialized</p>';
    return;
  }

  try {
    historyList.innerHTML = '<p class="loading">Loading recent games...</p>';

    const games = await fetchGameHistory(10);
    if (games.length === 0) {
      historyList.innerHTML = '<p class="empty-state">No recent games found</p>';
      return;
    }

    historyList.innerHTML = '';

    games.forEach((game) => {
      const gameDate = game.createdAt
        ? new Date(game.createdAt.toDate())
        : new Date();
      const formattedDate = gameDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      const historyItem = document.createElement('div');
      historyItem.className = 'history-item';
      historyItem.innerHTML = `
        <h4 class="history-name">${game.name || 'Unnamed Game'}</h4>
        <div class="history-details">
          <span>Date: ${formattedDate}</span>
          <span>Players: ${game.playerCount || 0}</span>
        </div>
        <div class="history-details">
          <span>Playlist: ${game.playlistName || 'Unknown'}</span>
          <span>Status: ${game.status || 'Completed'}</span>
        </div>
        <div class="history-buttons">
          <button class="secondary-btn restart-game" data-game-id="${game.id}">Restart</button>
        </div>
      `;

      historyList.appendChild(historyItem);

      const restartBtn = historyItem.querySelector('.restart-game');
      if (restartBtn) {
        restartBtn.addEventListener('click', () => restartGame(game.id));
      }
    });
  } catch (err) {
    console.error('Error loading game history:', err);
    historyList.innerHTML =
      '<p class="empty-state">Error loading game history</p>';
  }
}