/**
 * Spotify Service
 * Handles all Spotify integration for the Music Bingo application
 * Updated to use Firebase Cloud Functions for authentication
 */

import { SPOTIFY, UI } from './config.js';
import { updateGame } from './firebase-service.js';
import { formatTime } from './helpers.js';
import { showToast } from './ui-handler.js';

// Spotify state variables
let spotifyPlayer = null;
let spotifyToken = null;
let currentTrackUri = null;
let playlistSongUris = [];
let currentSongIndex = -1;
let spotifyAuthWindow = null;
let tokenRefreshTimer = null; // New: Timer for token refresh

/**
 * Initialize Spotify integration
 */
export function initializeSpotify() {
  console.log('Initializing Spotify integration');
  
  // Check if token exists in localStorage (it might have been set by the callback page)
  const token = localStorage.getItem('spotify_token');
  if (token) {
    console.log('Found Spotify token in localStorage');
    spotifyToken = token;
    
    // Check if the token is expired
    const expiryTime = localStorage.getItem('spotify_token_expiry');
    if (expiryTime && new Date().getTime() > parseInt(expiryTime)) {
      // Token is expired, try to refresh it if we have a token ID
      console.log('Spotify token expired');
      
      if (localStorage.getItem('spotify_token_id')) {
        console.log('Attempting to refresh token');
        refreshAccessToken();
      } else {
        console.log('No token ID, showing auth button');
        localStorage.removeItem('spotify_token');
        localStorage.removeItem('spotify_token_expiry');
        showSpotifyAuthButton();
      }
    } else {
      // Create player if we have a valid token
      console.log('Using existing Spotify token to create player');
      createSpotifyPlayer(spotifyToken);
      
      // Set up token refresh before expiry
      setupTokenRefresh(expiryTime);
    }
  }
  
  // Add Spotify SDK script if not already loaded
  if (!document.getElementById('spotify-sdk-script')) {
    const spotifyScript = document.createElement('script');
    spotifyScript.id = 'spotify-sdk-script';
    spotifyScript.src = 'https://sdk.scdn.co/spotify-player.js';
    document.head.appendChild(spotifyScript);
  }
  
  // Load the Spotify Web Playback SDK
  window.onSpotifyWebPlaybackSDKReady = () => {
    console.log('Spotify Web Playback SDK ready');
    
    // Check if we have a stored token
    spotifyToken = localStorage.getItem('spotify_token');
    
    if (!spotifyToken) {
      // Show authentication button if no token
      console.log('No Spotify token found, showing auth button');
      showSpotifyAuthButton();
    } else {
      // Check if the token is expired
      const expiryTime = localStorage.getItem('spotify_token_expiry');
      if (expiryTime && new Date().getTime() > parseInt(expiryTime)) {
        // Token is expired, try to refresh it if we have a token ID
        console.log('Spotify token expired');
        
        if (localStorage.getItem('spotify_token_id')) {
          console.log('Attempting to refresh token');
          refreshAccessToken();
        } else {
          console.log('No token ID, showing auth button');
          localStorage.removeItem('spotify_token');
          localStorage.removeItem('spotify_token_expiry');
          showSpotifyAuthButton();
        }
      } else {
        // Create player if we have a valid token
        console.log('Using existing Spotify token to create player');
        createSpotifyPlayer(spotifyToken);
      }
    }
  };
  
  // Add event listener for message from popup window
  window.addEventListener('message', receiveSpotifyAuthMessage, false);
  
  // Check if we've been redirected from the callback page
  if (localStorage.getItem('redirected_from_spotify') === 'true') {
    console.log('Detected redirect from Spotify callback');
    localStorage.removeItem('redirected_from_spotify');
    
    // If we have a token, create the player
    if (spotifyToken) {
      console.log('Creating Spotify player after redirect');
      // Wait for SDK to be ready
      if (typeof Spotify !== 'undefined') {
        createSpotifyPlayer(spotifyToken);
      }
    }
  }
  
  // Add Spotify styles
  addSpotifyStyles();
}

/**
 * Setup automatic token refresh before expiry
 * @param {number} expiryTime - Timestamp when the token expires
 */
function setupTokenRefresh(expiryTime) {
  // Clear any existing refresh timer
  if (tokenRefreshTimer) {
    clearTimeout(tokenRefreshTimer);
  }
  
  if (!expiryTime) return;
  
  const now = new Date().getTime();
  const expiryDate = parseInt(expiryTime);
  
  // Calculate time until refresh (5 minutes before expiry)
  const timeUntilRefresh = Math.max(0, expiryDate - now - (5 * 60 * 1000));
  
  console.log(`Token refresh scheduled in ${Math.floor(timeUntilRefresh / 60000)} minutes`);
  
  // Set timer to refresh token
  tokenRefreshTimer = setTimeout(() => {
    refreshAccessToken();
  }, timeUntilRefresh);
}

/**
 * Show Spotify authentication button in the dashboard
 */
function showSpotifyAuthButton() {
  // Check if the button already exists
  if (document.getElementById('spotify-auth-btn')) return;
  
  console.log('Adding Spotify auth button to the UI');
  
  const spotifySection = document.createElement('div');
  spotifySection.className = 'spotify-auth';
  spotifySection.innerHTML = `
    <h3>Spotify Integration</h3>
    <p>Connect your Spotify account to play music directly from the dashboard.</p>
    <button id="spotify-auth-btn" class="primary-btn">Connect Spotify</button>
  `;
  
  // Add to the game controls section
  const gameControls = document.querySelector('.game-controls');
  if (gameControls) {
    // Add at the beginning of the controls
    if (gameControls.firstChild) {
      gameControls.insertBefore(spotifySection, gameControls.firstChild);
    } else {
      gameControls.appendChild(spotifySection);
    }
    
    // Add event listener to the auth button
    document.getElementById('spotify-auth-btn').addEventListener('click', authenticateWithSpotify);
  }
}

/**
 * Authenticate with Spotify using Firebase Cloud Functions
 */
export function authenticateWithSpotify() {
  console.time('spotify_auth_flow');
  
  // Show loading indicator on button
  const authButton = document.getElementById('spotify-auth-btn');
  if (authButton) {
    authButton.innerHTML = '<span>Connecting...</span>';
    authButton.disabled = true;
  }
  
  console.log('Starting Spotify authentication flow via Firebase Cloud Functions');
  
  // Calculate center position for the popup
  const width = UI.POPUP_WIDTH || 450;
  const height = UI.POPUP_HEIGHT || 730;
  const left = (window.innerWidth / 2) - (width / 2);
  const top = (window.innerHeight / 2) - (height / 2);
  
  // Use the Firebase Function URL for authentication
  const authUrl = '/spotifyLogin';
  
  // Open popup window for authentication
  try {
    console.log('Opening Spotify auth popup');
    
    if (spotifyAuthWindow && !spotifyAuthWindow.closed) {
      spotifyAuthWindow.focus();
    } else {
      spotifyAuthWindow = window.open(
        authUrl,
        'Spotify Authentication',
        `width=${width},height=${height},left=${left},top=${top}`
      );
    }
    
    // Add a fallback for popup blockers
    if (!spotifyAuthWindow || spotifyAuthWindow.closed || typeof spotifyAuthWindow.closed === 'undefined') {
      console.warn('Popup blocked! Falling back to redirect');
      alert('Popup blocked! Please allow popups for this site to connect to Spotify.');
      // Fallback to redirect
      window.location.href = authUrl;
    }
  } catch (error) {
    console.error('Error opening Spotify auth popup:', error);
    
    // Reset button state
    if (authButton) {
      authButton.innerHTML = 'Connect Spotify';
      authButton.disabled = false;
    }
    
    alert('Failed to open Spotify authentication popup');
  }
}

/**
 * Refresh the access token using Firebase Functions
 * @returns {Promise<boolean>} Success status
 */
async function refreshAccessToken() {
  try {
    // Get token ID from localStorage
    const tokenId = localStorage.getItem('spotify_token_id');
    
    if (!tokenId) {
      console.error('No token ID available for refresh');
      showSpotifyAuthButton();
      return false;
    }
    
    console.log('Refreshing access token...');
    
    // Request new access token from Firebase Function
    const response = await fetch('/refreshToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token_id: tokenId })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Token refresh failed: ${errorData.error}`);
    }
    
    const tokenData = await response.json();
    
    // Store the new access token
    localStorage.setItem('spotify_token', tokenData.access_token);
    spotifyToken = tokenData.access_token;
    
    // Calculate token expiry time
    const expiryTime = new Date().getTime() + (tokenData.expires_in * 1000);
    localStorage.setItem('spotify_token_expiry', expiryTime);
    
    // Set up the next token refresh
    setupTokenRefresh(expiryTime);
    
    console.log('Successfully refreshed access token');
    
    // Create/update Spotify player with new token
    if (spotifyPlayer) {
      // Update existing player
      spotifyPlayer.disconnect();
      createSpotifyPlayer(tokenData.access_token);
    } else {
      // Create new player
      createSpotifyPlayer(tokenData.access_token);
    }
    
    return true;
  } catch (error) {
    console.error('Error refreshing access token:', error);
    
    // Clear token data and show auth button
    localStorage.removeItem('spotify_token');
    localStorage.removeItem('spotify_token_expiry');
    localStorage.removeItem('spotify_token_id');
    
    // Show authentication button
    showSpotifyAuthButton();
    
    return false;
  }
}

/**
 * Receive and process authentication message from popup
 * @param {MessageEvent} event - Message event from popup window
 */
function receiveSpotifyAuthMessage(event) {
  console.log('Received message from popup:', event.origin);
  console.log('Message data:', event.data);
  
  // Process authentication data
  if (event.data && event.data.type === 'SPOTIFY_AUTH_SUCCESS') {
    console.log('Received Spotify authentication success message');
    
    // Token is already stored in localStorage by the callback page
    
    // Update token variable
    spotifyToken = localStorage.getItem('spotify_token');
    
    // Create Spotify player with the token
    if (spotifyToken) {
      createSpotifyPlayer(spotifyToken);
    }
    
    // Reset button state with success indication
    const authButton = document.getElementById('spotify-auth-btn');
    if (authButton) {
      authButton.innerHTML = 'Connected';
      authButton.disabled = true;
    }
    
    // Close the popup if it's still open
    if (spotifyAuthWindow && !spotifyAuthWindow.closed) {
      spotifyAuthWindow.close();
    }
    
    console.timeEnd('spotify_auth_flow');
  } else if (event.data && event.data.type === 'SPOTIFY_AUTH_ERROR') {
    console.error('Spotify authentication error:', event.data.error);
    
    // Reset button state
    const authButton = document.getElementById('spotify-auth-btn');
    if (authButton) {
      authButton.innerHTML = 'Connect Spotify';
      authButton.disabled = false;
    }
    
    alert('Failed to authenticate with Spotify: ' + event.data.error);
    console.timeEnd('spotify_auth_flow');
  }
}

/**
 * Create Spotify player
 * @param {string} token - Spotify access token
 */
export function createSpotifyPlayer(token) {
  if (!token) {
    console.error('No token provided to createSpotifyPlayer');
    return;
  }
  
  console.log('Creating Spotify player with token');
  
  // Make sure Spotify SDK is loaded
  if (typeof Spotify === 'undefined') {
    console.warn('Spotify SDK not yet loaded, waiting...');
    setTimeout(() => createSpotifyPlayer(token), 1000);
    return;
  }
  
  try {
    // Create player instance
    spotifyPlayer = new Spotify.Player({
      name: 'Music Bingo Host Player',
      getOAuthToken: cb => { cb(token); }
    });
    
    // Add event listeners
    spotifyPlayer.addListener('ready', ({ device_id }) => {
      console.log('Spotify player ready with device ID:', device_id);
      localStorage.setItem('spotify_device_id', device_id);
      
      // Show player interface
      createPlayerInterface();
      
      // If a game is already active, load the playlist
      const currentGame = window.currentGame;
      if (currentGame && currentGame.playlistId) {
        loadSpotifyPlaylist(currentGame.playlistId);
      }
    });
    
    spotifyPlayer.addListener('not_ready', ({ device_id }) => {
      console.log('Device ID has gone offline', device_id);
    });
    
    spotifyPlayer.addListener('player_state_changed', state => {
      if (state) {
        // Update UI with current track information
        updatePlayerUI(state);
      }
    });
    
    // Error handling
    spotifyPlayer.addListener('initialization_error', ({ message }) => {
      console.error('Failed to initialize Spotify player:', message);
      showSpotifyAuthButton();
    });
    
    spotifyPlayer.addListener('authentication_error', ({ message }) => {
      console.error('Failed to authenticate with Spotify:', message);
      
      // Try to refresh the token
      refreshAccessToken();
    });
    
    spotifyPlayer.addListener('account_error', ({ message }) => {
      console.error('Failed to validate Spotify account:', message);
      showToast('Premium Spotify account required for playback', 'error');
    });
    
    // Connect to Spotify
    console.log('Connecting to Spotify...');
    spotifyPlayer.connect().then(success => {
      if (success) {
        console.log('Successfully connected to Spotify!');
      } else {
        console.log('Failed to connect to Spotify');
      }
    });
  } catch (error) {
    console.error('Error creating Spotify player:', error);
  }
}

/**
 * Create player interface in the dashboard
 */
function createPlayerInterface() {
  // Check if the player already exists
  if (document.querySelector('.spotify-player')) {
    console.log('Spotify player interface already exists');
    return;
  }
  
  console.log('Creating Spotify player interface');
  
  const playerSection = document.createElement('div');
  playerSection.className = 'spotify-player';
  playerSection.innerHTML = `
    <h3>Spotify Player</h3>
    <div class="player-display">
      <div class="now-playing">
        <div class="track-info">
          <p id="current-track-name">No track selected</p>
          <p id="current-track-artist">-</p>
        </div>
        <div class="track-progress">
          <div class="progress-bar">
            <div id="progress-filled"></div>
          </div>
          <div class="time-info">
            <span id="current-time">0:00</span>
            <span id="total-time">0:00</span>
          </div>
        </div>
      </div>
      <div class="player-controls">
        <button id="previous-track-btn" class="control-btn">Previous</button>
        <button id="play-pause-btn" class="control-btn">Play</button>
        <button id="next-track-btn" class="control-btn">Next</button>
        <div class="volume-control">
          <span>Volume:</span>
          <input type="range" id="volume-slider" min="0" max="100" value="50">
        </div>
      </div>
    </div>
  `;
  
  // Find the current song control card
  const currentSongElement = document.getElementById('current-song');
  if (currentSongElement) {
    const controlCard = currentSongElement.closest('.control-card');
    if (controlCard) {
      // Replace the content of the control card
      controlCard.innerHTML = '';
      controlCard.appendChild(playerSection);
      
      // Add event listeners to player controls
      document.getElementById('play-pause-btn').addEventListener('click', togglePlayback);
      document.getElementById('next-track-btn').addEventListener('click', nextTrack);
      document.getElementById('previous-track-btn').addEventListener('click', previousTrack);
      document.getElementById('volume-slider').addEventListener('input', updateVolume);
    }
  }
}

/**
 * Load a playlist by ID
 * @param {string} playlistId - ID of the playlist to load
 * @param {Array} playlistsData - Array of available playlists
 */
export function loadSpotifyPlaylist(playlistId, playlistsData = window.playlistsData) {
  // Find the selected playlist in the playlistsData array
  const selectedPlaylist = playlistsData.find(p => p.id === playlistId);
  if (!selectedPlaylist) {
    console.error('Playlist not found:', playlistId);
    return;
  }
  
  // Clear the current playlist
  playlistSongUris = [];
  currentSongIndex = -1;
  
  // Loop through the playlist and collect song URIs
  // Assuming the URIs are stored in a format like uri1, uri2, etc.
  for (let i = 1; i <= 25; i++) { // Assuming maximum 25 songs in a playlist
    const uriKey = `uri${i}`;
    if (selectedPlaylist[uriKey]) {
      playlistSongUris.push(selectedPlaylist[uriKey]);
    } else {
      break;
    }
  }
  
  console.log(`Loaded ${playlistSongUris.length} songs from playlist`);
  
  // If no URIs found, try to use track IDs to construct URIs
  if (playlistSongUris.length === 0) {
    let songCount = 0;
    
    for (let i = 1; i <= 25; i++) {
      if (selectedPlaylist[`artist${i}`] && selectedPlaylist[`song${i}`]) {
        songCount++;
        
        // Add a placeholder for each song (will need to be searched)
        playlistSongUris.push(null);
        
        // Here we'd ideally search Spotify for each song and get the URIs
        // This requires additional Spotify Web API calls
        console.log(`Song ${i}: ${selectedPlaylist[`song${i}`]} - ${selectedPlaylist[`artist${i}`]}`);
      } else {
        break;
      }
    }
    
    console.log(`Found ${songCount} songs without URIs (would need to search Spotify)`);
    
    if (songCount === 0) {
      alert('No songs found in the selected playlist');
    }
  }
  
  // If we have a current game with a song index, update the player
  const currentGame = window.currentGame;
  if (currentGame && currentGame.currentSongIndex >= 0) {
    // Set the current song index
    currentSongIndex = currentGame.currentSongIndex;
  }
}

/**
 * Play a specific song from the playlist by index
 * @param {number} index - Index of the song to play
 */
export async function playSongByIndex(index) {
  if (!spotifyPlayer || !spotifyToken || playlistSongUris.length === 0) {
    console.error('Spotify player not ready or playlist empty');
    return;
  }
  
  // Make sure the index is valid
  if (index < 0 || index >= playlistSongUris.length) {
    console.error('Invalid song index:', index);
    return;
  }
  
  // Get the device ID
  const deviceId = localStorage.getItem('spotify_device_id');
  if (!deviceId) {
    console.error('No Spotify device ID found');
    return;
  }
  
  // Get the URI for the song
  const uri = playlistSongUris[index];
  if (!uri) {
    console.error('No URI available for song at index:', index);
    return;
  }
  
  try {
    // Play the song using Spotify Web API
    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      body: JSON.stringify({ uris: [uri] }),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${spotifyToken}`
      }
    });
    
    // Update current index
    currentSongIndex = index;
    
  } catch (error) {
    console.error('Error playing song:', error);
    
    // Handle 401 errors (token expired)
    if (error.status === 401) {
      refreshAccessToken();
    }
  }
}

/**
 * Toggle play/pause
 */
export async function togglePlayback() {
  if (!spotifyPlayer) return;
  
  const state = await spotifyPlayer.getCurrentState();
  
  if (!state) {
    // If no state, try to play the first song
    if (playlistSongUris.length > 0) {
      playSongByIndex(0);
    }
    return;
  }
  
  // Toggle between play and pause
  if (state.paused) {
    spotifyPlayer.resume();
    document.getElementById('play-pause-btn').textContent = 'Pause';
  } else {
    spotifyPlayer.pause();
    document.getElementById('play-pause-btn').textContent = 'Play';
  }
}

/**
 * Skip to next track
 */
export function nextTrack() {
  if (!spotifyPlayer || currentSongIndex < 0) return;
  
  const nextIndex = currentSongIndex + 1;
  if (nextIndex >= playlistSongUris.length) {
    console.log('Already at the last track');
    return;
  }
  
  playSongByIndex(nextIndex);
  
  // Update the game state
  const currentGame = window.currentGame;
  if (currentGame) {
    updateGameSongState(nextIndex);
  }
}

/**
 * Skip to previous track
 */
export function previousTrack() {
  if (!spotifyPlayer || currentSongIndex <= 0) return;
  
  const prevIndex = currentSongIndex - 1;
  playSongByIndex(prevIndex);
  
  // Update the game state
  const currentGame = window.currentGame;
  if (currentGame) {
    updateGameSongState(prevIndex);
  }
}

/**
 * Update game state with current song
 * @param {number} index - Index of the current song
 */
async function updateGameSongState(index) {
  const currentGame = window.currentGame;
  if (!currentGame) return;
  
  try {
    // Update game in Firebase
    await updateGame(currentGame.id, { currentSongIndex: index });
    
    // Update local state
    currentGame.currentSongIndex = index;
    
    // Update UI
    import('./ui-handler.js').then(module => {
      module.updateCurrentSongDisplay(index);
    });
    
  } catch (error) {
    console.error('Error updating game song state:', error);
  }
}

/**
 * Update volume
 * @param {Event} e - Input event
 */
export function updateVolume(e) {
  if (!spotifyPlayer) return;
  
  const volume = e.target.value / 100;
  spotifyPlayer.setVolume(volume);
}

/**
 * Update player UI with current track information
 * @param {Object} state - Spotify player state
 */
function updatePlayerUI(state) {
  if (!state || !state.track_window || !state.track_window.current_track) return;
  
  const track = state.track_window.current_track;
  
  // Update track info
  document.getElementById('current-track-name').textContent = track.name;
  document.getElementById('current-track-artist').textContent = track.artists.map(a => a.name).join(', ');
  
  // Update play/pause button text
  document.getElementById('play-pause-btn').textContent = state.paused ? 'Play' : 'Pause';
  
  // Update progress bar
  const progressMs = state.position;
  const durationMs = state.duration;
  
  if (durationMs > 0) {
    const progressPercent = (progressMs / durationMs) * 100;
    document.getElementById('progress-filled').style.width = `${progressPercent}%`;
    
    // Update time display
    document.getElementById('current-time').textContent = formatTime(progressMs);
    document.getElementById('total-time').textContent = formatTime(durationMs);
  }
}

/**
 * Logout and disconnect from Spotify
 */
export async function disconnectSpotify() {
  try {
    // Disconnect player if exists
    if (spotifyPlayer) {
      await spotifyPlayer.disconnect();
      spotifyPlayer = null;
    }
    
    // Revoke token via Firebase Function
    const tokenId = localStorage.getItem('spotify_token_id');
    if (tokenId) {
      await fetch('/revokeToken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token_id: tokenId })
      });
    }
    
    // Clear all Spotify data from localStorage
    localStorage.removeItem('spotify_token');
    localStorage.removeItem('spotify_token_expiry');
    localStorage.removeItem('spotify_token_id');
    localStorage.removeItem('spotify_device_id');
    
    // Reset variables
    spotifyToken = null;
    currentTrackUri = null;
    playlistSongUris = [];
    currentSongIndex = -1;
    
    // Clear token refresh timer
    if (tokenRefreshTimer) {
      clearTimeout(tokenRefreshTimer);
      tokenRefreshTimer = null;
    }
    
    // Show the auth button again
    showSpotifyAuthButton();
    
    console.log('Successfully disconnected from Spotify');
    
    return true;
  } catch (error) {
    console.error('Error disconnecting from Spotify:', error);
    return false;
  }
}

/**
 * Add styles for the Spotify player
 */
function addSpotifyStyles() {
  // Check if styles already exist
  if (document.getElementById('spotify-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'spotify-styles';
  style.textContent = `
    .spotify-player {
      margin-bottom: 20px;
    }
    
    .player-display {
      background-color: #1e293b;
      border-radius: 8px;
      padding: 15px;
    }
    
    .now-playing {
      margin-bottom: 15px;
    }
    
    .track-info {
      margin-bottom: 10px;
    }
    
    #current-track-name {
      font-weight: 600;
      font-size: 18px;
      margin: 0 0 5px 0;
      color: #f1f5f9;
    }
    
    #current-track-artist {
      font-size: 14px;
      margin: 0;
      color: #94a3b8;
    }
    
    .track-progress {
      margin-top: 10px;
    }
    
    .progress-bar {
      height: 6px;
      background-color: #334155;
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 5px;
    }
    
    #progress-filled {
      height: 100%;
      background-color: #3b82f6;
      width: 0%;
    }
    
    .time-info {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #94a3b8;
    }
    
    .player-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }
    
    .volume-control {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
      color: #94a3b8;
      font-size: 14px;
    }
    
    #volume-slider {
      width: 100px;
      accent-color: #3b82f6;
    }
    
    .spotify-auth {
      background-color: #1e293b;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 20px;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Check if Spotify is ready for playback
 * @returns {boolean} True if Spotify player is ready
 */
export function isSpotifyReady() {
  return !!spotifyPlayer && !!spotifyToken;
}

/**
 * Get the current Spotify token
 * @returns {string|null} Spotify access token or null
 */
export function getSpotifyToken() {
  return spotifyToken;
}