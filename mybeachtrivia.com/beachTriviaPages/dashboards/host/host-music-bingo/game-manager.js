/**
 * Game Manager Module
 * Handles game creation, management, and state updates
 */

import { GAME_SETTINGS } from './config.js';
import { getCurrentUser } from './auth-service.js';
import {
  createGame,
  updateGame,
  updateGameStatus,
  updateGameSongIndex,
  fetchGameHistory,
  getGameById,
  listenToGameUpdates,
  getPlayerCount
} from './firebase-service.js';
import {
  loadSpotifyPlaylist,
  playSongByIndex,
  isSpotifyReady
} from './spotify-service.js';
import { updateCurrentSongDisplay, updateActiveGameUI } from './ui-handler.js';

// Game state
let currentGame = null;
let gameInterval = null;
let playlistsData = [];

/**
 * Set playlists data
 * @param {Array} data - Array of playlist objects
 */
export function setPlaylistsData(data) {
  playlistsData = data;
}

/**
 * Get current active game
 * @returns {Object|null} Current game object or null
 */
export function getCurrentGame() {
  return currentGame;
}

/**
 * Create a new game
 */
export async function createNewGame() {
  // Get form values
  const playlistSelect = document.getElementById('playlist-select');
  const gameNameInput = document.getElementById('game-name');
  const playerLimitInput = document.getElementById('player-limit');

  // Validate playlist selection
  const playlistId = playlistSelect.value;
  if (!playlistId) {
    alert('Please select a playlist first');
    return;
  }

  // Get other values
  const gameName = gameNameInput.value.trim() || GAME_SETTINGS.DEFAULT_GAME_NAME;
  const playerLimit = playerLimitInput.value ? parseInt(playerLimitInput.value) : null;

  try {
    // Find the selected playlist
    const selectedPlaylist = playlistsData.find(p => p.id === playlistId);

    if (!selectedPlaylist) {
      throw new Error('Selected playlist not found');
    }

    // Show loading state
    const createButton = document.getElementById('create-game-btn');
    createButton.disabled = true;
    createButton.textContent = 'Creating Game...';

    // Create game in Firebase
    const gameData = {
      playlistId,
      playlistName: selectedPlaylist ? selectedPlaylist.name : 'Unknown Playlist',
      name: gameName,
      playerLimit
    };

    const newGame = await createGame(gameData);

    console.log('Game created with ID:', newGame.id);

    // Set current game
    currentGame = newGame;

    // Update UI for active game (this will also generate the QR code via ui-handler)
    updateActiveGameUI();

    // Start game update interval
    startGameUpdateInterval();

    // Refresh game history
    loadGameHistory();

    // If Spotify is available, load the Spotify playlist
    if (isSpotifyReady() && currentGame && currentGame.playlistId) {
      loadSpotifyPlaylist(currentGame.playlistId, playlistsData);
    }

  } catch (error) {
    console.error('Error creating game:', error);
    alert('Error creating game: ' + error.message);

    // Reset button
    const createButton = document.getElementById('create-game-btn');
    createButton.disabled = false;
    createButton.textContent = 'Start New Game';
  }
}

/**
 * Start game update interval to check for player counts and status changes
 */
export function startGameUpdateInterval() {
  // Clear any existing interval
  clearInterval(gameInterval);

  // Set up a new interval to check for game updates
  gameInterval = setInterval(async () => {
    if (!currentGame) return;

    try {
      // Get player count
      const playerCount = await getPlayerCount(currentGame.id);

      // Get latest game data
      const latestGame = await getGameById(currentGame.id);

      if (!latestGame) {
        console.log('Game no longer exists');
        endGame();
        return;
      }

      // Update current game with latest data
      currentGame = {
        ...latestGame,
        playerCount
      };

      // Update player count display
      const playerCountElement = document.getElementById('player-count');
      if (playerCountElement) {
        playerCountElement.textContent = currentGame.playerCount || 0;
      }

      // Update current song if changed
      if (currentGame.currentSongIndex >= 0) {
        updateCurrentSongDisplay(currentGame.currentSongIndex);
      }

      // Check if game has ended
      if (currentGame.status === 'ended') {
        endGame();
      }

    } catch (error) {
      console.error('Error updating game data:', error);
    }
  }, GAME_SETTINGS.UPDATE_INTERVAL);
}

/**
 * Play current song
 */
export async function playCurrentSong() {
  if (!currentGame) return;

  try {
    // Get the selected playlist
    const selectedPlaylist = playlistsData.find(p => p.id === currentGame.playlistId);
    if (!selectedPlaylist) {
      alert('Playlist not found');
      return;
    }

    // If there's no current song, start with the first one
    let songIndex = currentGame.currentSongIndex;
    if (songIndex < 0) {
      songIndex = 0;
    }

    // Count how many songs are in the playlist by looking for artist1, artist2, etc.
    let songCount = 0;
    for (let i = 1; i <= GAME_SETTINGS.MAX_SONGS_PER_PLAYLIST; i++) {
      if (selectedPlaylist[`artist${i}`]) {
        songCount++;
      } else {
        break;
      }
    }

    // Make sure the index is valid
    if (songIndex >= songCount) {
      alert('All songs have been played');
      return;
    }

    // Update the current song in Firebase
    await updateGameSongIndex(currentGame.id, songIndex);

    // Update local state
    currentGame.currentSongIndex = songIndex;

    // Update UI
    updateCurrentSongDisplay(songIndex);

    // If Spotify player is available, play the song
    if (isSpotifyReady()) {
      playSongByIndex(songIndex);
    } else {
      const songArtistKey = `artist${songIndex + 1}`;
      const songTitleKey = `song${songIndex + 1}`;
      console.log('Playing song:', `${selectedPlaylist[songTitleKey]} - ${selectedPlaylist[songArtistKey]}`);
    }

  } catch (error) {
    console.error('Error playing song:', error);
    alert('Error playing song: ' + error.message);
  }
}

/**
 * Play next song
 */
export async function playNextSong() {
  if (!currentGame) return;

  try {
    // Get the selected playlist
    const selectedPlaylist = playlistsData.find(p => p.id === currentGame.playlistId);
    if (!selectedPlaylist) {
      alert('Playlist not found');
      return;
    }

    // Calculate next song index
    let nextIndex = currentGame.currentSongIndex + 1;

    // Count how many songs are in the playlist by looking for artist1, artist2, etc.
    let songCount = 0;
    for (let i = 1; i <= GAME_SETTINGS.MAX_SONGS_PER_PLAYLIST; i++) {
      if (selectedPlaylist[`artist${i}`]) {
        songCount++;
      } else {
        break;
      }
    }

    // Check if we've reached the end
    if (nextIndex >= songCount) {
      alert('This was the last song in the playlist');
      return;
    }

    // Update the current song in Firebase
    await updateGameSongIndex(currentGame.id, nextIndex);

    // Update local state
    currentGame.currentSongIndex = nextIndex;

    // Update UI
    updateCurrentSongDisplay(nextIndex);

    // If Spotify player is available, play the song
    if (isSpotifyReady()) {
      playSongByIndex(nextIndex);
    } else {
      const songArtistKey = `artist${nextIndex + 1}`;
      const songTitleKey = `song${nextIndex + 1}`;
      console.log('Playing next song:', `${selectedPlaylist[songTitleKey]} - ${selectedPlaylist[songArtistKey]}`);
    }

  } catch (error) {
    console.error('Error playing next song:', error);
    alert('Error playing next song: ' + error.message);
  }
}

/**
 * Pause the game
 */
export async function pauseGame() {
  if (!currentGame) return;

  try {
    // Update game status in Firebase
    await updateGameStatus(currentGame.id, 'paused');

    // Update local state
    currentGame.status = 'paused';

    // If Spotify player is available, pause the playback
    if (isSpotifyReady()) {
      import('./spotify-service.js').then(module => {
        module.togglePlayback();
      });
    }

    alert('Game paused. Players will not be able to mark new squares until you resume.');

  } catch (error) {
    console.error('Error pausing game:', error);
    alert('Error pausing game: ' + error.message);
  }
}

/**
 * Resume the game
 */
export async function resumeGame(gameId = null) {
  // If gameId is provided, attempt to resume that specific game
  if (gameId && !currentGame) {
    try {
      const game = await getGameById(gameId);
      if (game) {
        currentGame = game;
        updateActiveGameUI();
        startGameUpdateInterval();
      }
    } catch (error) {
      console.error('Error loading game:', error);
      return;
    }
  }

  if (!currentGame) return;

  try {
    await updateGameStatus(currentGame.id, 'active');

    currentGame.status = 'active';

    if (isSpotifyReady()) {
      import('./spotify-service.js').then(module => {
        module.togglePlayback();
      });
    }

    alert('Game resumed. Players can now continue playing.');

  } catch (error) {
    console.error('Error resuming game:', error);
    alert('Error resuming game: ' + error.message);
  }
}

/**
 * End the game
 */
export async function endGame() {
  if (!currentGame) {
    const gameSection = document.getElementById('game-section');
    if (gameSection) {
      gameSection.classList.add('hidden');
    }
    return;
  }

  try {
    if (currentGame.status !== 'ended' && !confirm('Are you sure you want to end this game? Players will no longer be able to join or play.')) {
      return;
    }

    await updateGameStatus(currentGame.id, 'ended');

    if (isSpotifyReady()) {
      import('./spotify-service.js').then(module => {
        const spotifyService = module;
        spotifyService.togglePlayback();
      });
    }

    currentGame = null;

    clearInterval(gameInterval);

    const gameSection = document.getElementById('game-section');
    if (gameSection) {
      gameSection.classList.add('hidden');
    }

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

  } catch (error) {
    console.error('Error ending game:', error);
    alert('Error ending game: ' + error.message);
  }
}

/**
 * Restart a previous game
 * @param {string} gameId - ID of the game to restart
 */
export async function restartGame(gameId) {
  try {
    const game = await getGameById(gameId);

    if (!game) {
      alert('Game not found');
      return;
    }

    if (!confirm(`Restart game "${game.name}"? This will create a new game with the same playlist.`)) {
      return;
    }

    const playlistSelect = document.getElementById('playlist-select');
    const gameNameInput = document.getElementById('game-name');

    if (playlistSelect) playlistSelect.value = game.playlistId;
    if (gameNameInput) gameNameInput.value = game.name;

    createNewGame();

  } catch (error) {
    console.error('Error restarting game:', error);
    alert('Error restarting game: ' + error.message);
  }
}

/**
 * Load game history from Firebase and update UI
 */
export async function loadGameHistory() {
  const historyList = document.getElementById('game-history-list');
  if (!historyList) return;

  try {
    historyList.innerHTML = '<p class="loading">Loading recent games...</p>';

    const games = await fetchGameHistory(10);

    if (games.length === 0) {
      console.log('No games found');
      historyList.innerHTML = '<p class="empty-state">No recent games found</p>';
      return;
    }

    historyList.innerHTML = '';

    games.forEach(game => {
      const gameDate = game.createdAt ? new Date(game.createdAt.toDate()) : new Date();
      const formattedDate = gameDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
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

  } catch (error) {
    console.error('Error loading game history:', error);
    historyList.innerHTML = '<p class="empty-state">Error loading game history</p>';
  }
}