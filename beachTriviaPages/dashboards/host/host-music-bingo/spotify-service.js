/**
 * Spotify Service
 * Handles all Spotify integration for the Music Bingo application
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
let refreshToken = null; // New: Store refresh token

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
    
    // Also retrieve refresh token if available
    refreshToken = localStorage.getItem('spotify_refresh_token');
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
        // Token is expired, try to refresh it if we have a refresh token
        console.log('Spotify token expired');
        
        if (localStorage.getItem('spotify_refresh_token')) {
          console.log('Attempting to refresh token');
          refreshAccessToken();
        } else {
          console.log('No refresh token, showing auth button');
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
 * Generate a random string for code verifier
 * @param {number} length - Length of the string to generate
 * @returns {string} Random string
 */
function generateRandomString(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * Generate code challenge from verifier using SHA-256
 * @param {string} codeVerifier - The code verifier
 * @returns {Promise<string>} Code challenge
 */
async function generateCodeChallenge(codeVerifier) {
  // Convert code verifier to Uint8Array
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  
  // Hash with SHA-256
  const digest = await crypto.subtle.digest('SHA-256', data);
  
  // Convert digest to base64 URL encoded string
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Authenticate with Spotify using Authorization Code with PKCE flow
 */
export async function authenticateWithSpotify() {
  console.log('Starting Spotify authentication flow with PKCE');
  
  // Use the client ID from config
  const CLIENT_ID = SPOTIFY.CLIENT_ID;
  
  // Determine if we're in development or production
  const REDIRECT_URI = SPOTIFY.REDIRECT_URI.CURRENT;
  
  // Double-check and log the redirect URI for debugging
  console.log('Using redirect URI:', REDIRECT_URI);
  
  // Generate and store state parameter for CSRF protection
  const STATE = generateRandomString(16);
  localStorage.setItem('spotify_auth_state', STATE);
  
  // Generate code verifier (between 43-128 chars)
  const CODE_VERIFIER = generateRandomString(64);
  localStorage.setItem('spotify_code_verifier', CODE_VERIFIER);
  
  // Generate code challenge
  const CODE_CHALLENGE = await generateCodeChallenge(CODE_VERIFIER);
  
  // Required permissions to control playback
  const SCOPES = SPOTIFY.SCOPES;
  
  // Build the Spotify auth URL for Authorization Code flow with PKCE
  const authUrl = 'https://accounts.spotify.com/authorize' +
    '?client_id=' + encodeURIComponent(CLIENT_ID) +
    '&response_type=code' + // Changed from 'token' to 'code'
    '&redirect_uri=' + encodeURIComponent(REDIRECT_URI) +
    '&state=' + encodeURIComponent(STATE) +
    '&scope=' + encodeURIComponent(SCOPES.join(' ')) +
    '&code_challenge_method=S256' +
    '&code_challenge=' + encodeURIComponent(CODE_CHALLENGE);
  
  console.log('Auth URL:', authUrl);
  
  // Calculate center position for the popup
  const width = UI.POPUP_WIDTH || 450;
  const height = UI.POPUP_HEIGHT || 730;
  const left = (window.innerWidth / 2) - (width / 2);
  const top = (window.innerHeight / 2) - (height / 2);
  
  // Open a popup instead of redirecting
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
      // Fallback to redirect if popups are blocked
      window.location.href = authUrl;
    }
  } catch (error) {
    console.error('Error opening Spotify auth popup:', error);
    alert('Failed to open Spotify authentication popup');
  }
}

/**
 * Exchange authorization code for access token
 * @param {string} code - Authorization code from Spotify
 * @returns {Promise<Object>} Token response with access_token and refresh_token
 */
async function exchangeCodeForToken(code) {
  try {
    // Get code verifier from localStorage
    const codeVerifier = localStorage.getItem('spotify_code_verifier');
    if (!codeVerifier) {
      throw new Error('Code verifier not found in localStorage');
    }
    
    // Get redirect URI
    const redirectUri = SPOTIFY.REDIRECT_URI.CURRENT;
    
    // Set up parameters for token request
    const params = new URLSearchParams();
    params.append('client_id', SPOTIFY.CLIENT_ID);
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);
    params.append('code_verifier', codeVerifier);
    
    // Make token request to Spotify API
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Token exchange failed: ${errorData.error} - ${errorData.error_description}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error exchanging code for token:', error);
    throw error;
  }
}

/**
 * Refresh the access token using refresh token
 * @returns {Promise<boolean>} Success status
 */
async function refreshAccessToken() {
  try {
    // Get refresh token from localStorage
    const refreshToken = localStorage.getItem('spotify_refresh_token');
    if (!refreshToken) {
      console.error('No refresh token available');
      return false;
    }
    
    // Set up parameters for token refresh request
    const params = new URLSearchParams();
    params.append('client_id', SPOTIFY.CLIENT_ID);
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);
    
    // Make token request to Spotify API
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Token refresh failed: ${errorData.error} - ${errorData.error_description}`);
    }
    
    const tokenData = await response.json();
    
    // Store the new access token
    localStorage.setItem('spotify_token', tokenData.access_token);
    spotifyToken = tokenData.access_token;
    
    // Calculate token expiry time
    const expiryTime = new Date().getTime() + (tokenData.expires_in * 1000);
    localStorage.setItem('spotify_token_expiry', expiryTime);
    
    // Store new refresh token if provided
    if (tokenData.refresh_token) {
      localStorage.setItem('spotify_refresh_token', tokenData.refresh_token);
    }
    
    console.log('Successfully refreshed access token');
    
    // Create Spotify player with new token
    createSpotifyPlayer(tokenData.access_token);
    
    return true;
  } catch (error) {
    console.error('Error refreshing access token:', error);
    
    // Clear token data and show auth button
    localStorage.removeItem('spotify_token');
    localStorage.removeItem('spotify_token_expiry');
    localStorage.removeItem('spotify_refresh_token');
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
    
    const { code, state } = event.data;
    
    if (code) {
      // Exchange code for token
      exchangeCodeForToken(code)
        .then(tokenData => {
          // Store tokens
          localStorage.setItem('spotify_token', tokenData.access_token);
          
          // Store refresh token
          if (tokenData.refresh_token) {
            localStorage.setItem('spotify_refresh_token', tokenData.refresh_token);
            refreshToken = tokenData.refresh_token;
          }
          
          // Calculate token expiry time
          const expiryTime = new Date().getTime() + (tokenData.expires_in * 1000);
          localStorage.setItem('spotify_token_expiry', expiryTime);
          
          // Update token variable
          spotifyToken = tokenData.access_token;
          
          // Create Spotify player
          createSpotifyPlayer(tokenData.access_token);
          
          // Close the popup if it's still open
          if (spotifyAuthWindow && !spotifyAuthWindow.closed) {
            spotifyAuthWindow.close();
          }
        })
        .catch(error => {
          console.error('Error exchanging code for token:', error);
          alert('Failed to complete Spotify authentication: ' + error.message);
        });
    }
  } else if (event.data && event.data.type === 'SPOTIFY_AUTH_ERROR') {
    console.error('Spotify authentication error:', event.data.error);
    alert('Failed to authenticate with Spotify: ' + event.data.error);
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
      localStorage.removeItem('spotify_token');
      showSpotifyAuthButton();
    });
    
    spotifyPlayer.addListener('account_error', ({ message }) => {
      console.error('Failed to validate Spotify account:', message);
      alert('Premium Spotify account required for playback.');
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