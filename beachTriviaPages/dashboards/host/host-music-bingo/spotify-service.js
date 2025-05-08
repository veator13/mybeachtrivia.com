/**
 * Spotify Service
 * Handles all Spotify integration for the Music Bingo application
 * Updated to use Cloudflare Worker for authentication
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
let authWindowCheckInterval = null; // New: For checking popup window status
let initRetryCount = 0; // Track initialization attempts
const MAX_INIT_RETRIES = 3; // Maximum number of retry attempts

/**
 * Initialize Spotify integration
 */
export function initializeSpotify() {
  console.group('===== SPOTIFY AUTH DEBUGGING (MAIN WINDOW) =====');
  console.log('Initializing Spotify integration');
  
  // Check for URL parameters indicating Spotify auth redirect  
  const urlParams = new URLSearchParams(window.location.search);
  const spotifyAuth = urlParams.get('spotify_auth');
  const timestamp = urlParams.get('timestamp');

  // If redirected via URL parameters, log it
  if (spotifyAuth === 'true' && timestamp) {
    console.log('Detected Spotify auth via URL parameters, timestamp:', timestamp);
    // Clean up URL parameters
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
    // The tokens should already be in localStorage from the callback page
  }
  
  // Debug localStorage and sessionStorage
  console.log('LocalStorage tokens:', {
    spotify_token: localStorage.getItem('spotify_token') ? 'exists' : 'missing',
    spotify_refresh_token: localStorage.getItem('spotify_refresh_token') ? 'exists' : 'missing',
    spotify_token_expiry: localStorage.getItem('spotify_token_expiry'),
    redirected_from_spotify: localStorage.getItem('redirected_from_spotify')
  });

  console.log('SessionStorage tokens:', {
    spotify_token: sessionStorage.getItem('spotify_token') ? 'exists' : 'missing',
    spotify_refresh_token: sessionStorage.getItem('spotify_refresh_token') ? 'exists' : 'missing',
    spotify_token_expiry: sessionStorage.getItem('spotify_token_expiry')
  });
  
  // Define a token check function for multiple checks
  const checkForTokens = () => {
    // Check localStorage first
    let token = localStorage.getItem('spotify_token');
    let refreshToken = localStorage.getItem('spotify_refresh_token');
    let expiryTime = localStorage.getItem('spotify_token_expiry');
    const redirectFlag = localStorage.getItem('redirected_from_spotify');
    const authTimestamp = localStorage.getItem('spotify_auth_timestamp');
    
    // Try sessionStorage as fallback
    if (!token) {
      token = sessionStorage.getItem('spotify_token');
      console.log('Checking sessionStorage for token:', token ? 'found' : 'not found');
    }
    if (!refreshToken) {
      refreshToken = sessionStorage.getItem('spotify_refresh_token');
    }
    if (!expiryTime) {
      expiryTime = sessionStorage.getItem('spotify_token_expiry');
    }
    
    console.log('Checking for tokens:', {
      hasToken: !!token,
      redirectFlag,
      authTimestamp
    });
    
    if (token) {
      // We found a token - sync between storages for redundancy
      saveTokenToStorages('spotify_token', token);
      if (refreshToken) saveTokenToStorages('spotify_refresh_token', refreshToken);
      if (expiryTime) saveTokenToStorages('spotify_token_expiry', expiryTime);
      
      // Clear the redirect flag if it exists
      if (redirectFlag === 'true') {
        localStorage.removeItem('redirected_from_spotify');
      }
      
      console.log('Found Spotify token in storage');
      spotifyToken = token;
      
      // Check if the token is expired
      if (expiryTime && new Date().getTime() > parseInt(expiryTime)) {
        console.log('Spotify token expired, refreshing');
        refreshAccessToken();
      } else {
        // Initialize player with valid token
        console.log('Using token from storage to create player');
        createSpotifyPlayer(token);
        
        // Set up token refresh before expiry
        if (expiryTime) {
          setupTokenRefresh(expiryTime);
        }
      }
      
      return true;
    }
    return false;
  };
  
  // Check immediately
  if (!checkForTokens()) {
    // If no tokens found on first check, try again after a short delay
    // This helps in case the callback page just set the tokens
    setTimeout(checkForTokens, 1000);
    
    // And a final check after a longer delay
    setTimeout(checkForTokens, 3000);
  }
  
  // Add Spotify SDK script if not already loaded
  if (!document.getElementById('spotify-sdk-script')) {
    const spotifyScript = document.createElement('script');
    spotifyScript.id = 'spotify-sdk-script';
    spotifyScript.src = 'https://sdk.scdn.co/spotify-player.js';
    spotifyScript.async = true;
    spotifyScript.onerror = () => {
      console.error('Failed to load Spotify SDK script');
      
      // Try once more after a delay
      setTimeout(() => {
        if (!document.getElementById('spotify-retry-script')) {
          const retryScript = document.createElement('script');
          retryScript.id = 'spotify-retry-script';
          retryScript.src = 'https://sdk.scdn.co/spotify-player.js';
          retryScript.async = true;
          document.head.appendChild(retryScript);
          console.log('Retrying Spotify SDK script load');
        }
      }, 2000);
    };
    document.head.appendChild(spotifyScript);
  }
  
  // Load the Spotify Web Playback SDK
  window.onSpotifyWebPlaybackSDKReady = () => {
    console.log('Spotify Web Playback SDK ready');
    
    // Check if we have a stored token
    spotifyToken = getTokenFromStorages('spotify_token');
    
    if (!spotifyToken) {
      // Show authentication button if no token
      console.log('No Spotify token found, showing auth button');
      showSpotifyAuthButton();
    } else {
      // Check if the token is expired
      const expiryTime = getTokenFromStorages('spotify_token_expiry');
      if (expiryTime && new Date().getTime() > parseInt(expiryTime)) {
        // Token is expired, try to refresh it if we have a refresh token
        console.log('Spotify token expired');
        
        const refreshToken = getTokenFromStorages('spotify_refresh_token');
        if (refreshToken) {
          console.log('Attempting to refresh token');
          refreshAccessToken();
        } else {
          console.log('No refresh token, showing auth button');
          removeTokenFromStorages('spotify_token');
          removeTokenFromStorages('spotify_token_expiry');
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
  if (localStorage.getItem('redirected_from_spotify') === 'true' ||
      sessionStorage.getItem('redirected_from_spotify') === 'true') {
    console.log('Detected redirect from Spotify callback');
    
    // Run token check again to handle this specific case
    setTimeout(checkForTokens, 500);
  }
  
  // Add Spotify styles
  addSpotifyStyles();
  
  // Check for Firebase availability - this is critical
  checkFirebaseAvailability();
  
  console.log('Spotify auth debugging initialized for main window');
  console.groupEnd();
}

/**
 * Check if Firebase is available and initialize properly
 */
function checkFirebaseAvailability() {
  if (typeof firebase === 'undefined') {
    console.error('Firebase is not defined - this will cause issues with Spotify integration');
    showToast('Error loading database. Please refresh the page.', 'error');
    return;
  }
  
  // Check for database availability specifically
  if (typeof firebase.database === 'undefined') {
    console.error('Firebase Database module is not available');
    
    // Check if we're in the music bingo context where database is required
    if (window.location.href.includes('host-music-bingo')) {
      showToast('Database module not loaded. This may affect functionality.', 'warning');
      
      // Try to dynamically load the database module if possible
      const dbScript = document.createElement('script');
      dbScript.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js';
      dbScript.onload = function() {
        console.log('Firebase Database module loaded dynamically');
        showToast('Database connection restored', 'success');
      };
      document.head.appendChild(dbScript);
    }
  }
}

/**
 * Helper to save token to both localStorage and sessionStorage
 */
function saveTokenToStorages(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn('Error saving to localStorage:', e);
  }
  
  try {
    sessionStorage.setItem(key, value);
  } catch (e) {
    console.warn('Error saving to sessionStorage:', e);
  }
}

/**
 * Helper to get token from either storage
 */
function getTokenFromStorages(key) {
  // Try localStorage first
  let value = null;
  try {
    value = localStorage.getItem(key);
    if (value) return value;
  } catch (e) {
    console.warn('Error reading from localStorage:', e);
  }
  
  // Try sessionStorage as fallback
  try {
    value = sessionStorage.getItem(key);
    return value;
  } catch (e) {
    console.warn('Error reading from sessionStorage:', e);
  }
  
  return null;
}

/**
 * Helper to remove token from both storages
 */
function removeTokenFromStorages(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn('Error removing from localStorage:', e);
  }
  
  try {
    sessionStorage.removeItem(key);
  } catch (e) {
    console.warn('Error removing from sessionStorage:', e);
  }
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
    <div id="spotify-auth-status" style="margin-top: 10px; font-size: 12px; color: #94a3b8;"></div>
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
    
    // Show Firebase status
    const statusEl = document.getElementById('spotify-auth-status');
    if (statusEl) {
      if (typeof firebase === 'undefined') {
        statusEl.textContent = 'Warning: Firebase not initialized';
        statusEl.style.color = '#f59e0b';
      } else if (typeof firebase.database === 'undefined') {
        statusEl.textContent = 'Warning: Database module not loaded';
        statusEl.style.color = '#f59e0b';
      }
    }
  }
}

/**
 * Authenticate with Spotify using Cloudflare Worker
 */
export function authenticateWithSpotify() {
  console.time('spotify_auth_flow');
  
  // Show loading indicator on button
  const authButton = document.getElementById('spotify-auth-btn');
  if (authButton) {
    authButton.innerHTML = '<span>Connecting...</span>';
    authButton.disabled = true;
  }
  
  console.log('Starting Spotify authentication flow via Cloudflare Worker');
  
  // Save a timestamp to prevent redirect loops
  const authTimestamp = new Date().getTime();
  saveTokenToStorages('spotify_auth_timestamp', authTimestamp.toString());
  
  // Calculate center position for the popup
  const width = UI.POPUP_WIDTH || 450;
  const height = UI.POPUP_HEIGHT || 730;
  const left = (window.innerWidth / 2) - (width / 2);
  const top = (window.innerHeight / 2) - (height / 2);
  
  // Use the Cloudflare Worker URL for authentication
  const authUrl = '/spotifyLogin';
  
  // Open popup window for authentication
  try {
    console.log('Opening Spotify auth popup');
    
    // Clear any existing auth window check interval
    if (authWindowCheckInterval) {
      clearInterval(authWindowCheckInterval);
      authWindowCheckInterval = null;
    }
    
    // If a window is already open, focus it or open a new one
    if (spotifyAuthWindow && !spotifyAuthWindow.closed) {
      spotifyAuthWindow.focus();
    } else {
      spotifyAuthWindow = window.open(
        authUrl,
        'Spotify Authentication',
        `width=${width},height=${height},left=${left},top=${top}`
      );
    }
    
    console.log('Popup window created:', spotifyAuthWindow ? 'Success' : 'Failed');
    
    // Add a fallback for popup blockers
    if (!spotifyAuthWindow || spotifyAuthWindow.closed || typeof spotifyAuthWindow.closed === 'undefined') {
      console.warn('Popup blocked! Falling back to redirect');
      alert('Popup blocked! Please allow popups for this site to connect to Spotify.');
      
      // Store a flag for redirect
      saveTokenToStorages('redirected_from_spotify', 'pending');
      
      // Fallback to redirect
      window.location.href = authUrl;
      return;
    }
    
    // Monitor popup status
    authWindowCheckInterval = setInterval(() => {
      if (spotifyAuthWindow && spotifyAuthWindow.closed) {
        console.log('Auth window closed by user');
        clearInterval(authWindowCheckInterval);
        authWindowCheckInterval = null;
        
        // Check if we received tokens when window closed
        const hasToken = getTokenFromStorages('spotify_token');
        const hasRedirectFlag = localStorage.getItem('redirected_from_spotify') || 
                             sessionStorage.getItem('redirected_from_spotify');
        
        console.log('After popup closed - tokens in storage:', {
          spotify_token: hasToken ? 'exists' : 'missing',
          redirected_flag: hasRedirectFlag
        });
        
        // Reset button if no token was received
        if (!hasToken) {
          if (authButton) {
            authButton.innerHTML = 'Connect Spotify';
            authButton.disabled = false;
          }
        } else {
          // We have a token but might not have gotten the message
          // Try to use the token
          console.log('Token found after popup closed, initializing player');
          spotifyToken = hasToken;
          createSpotifyPlayer(hasToken);
          
          // Update button state
          if (authButton) {
            authButton.innerHTML = 'Connected';
            authButton.disabled = true;
          }
        }
      } else {
        try {
          // Try to send a ping to the popup to see if it's responsive
          if (spotifyAuthWindow) {
            spotifyAuthWindow.postMessage({ type: 'PING_FROM_PARENT', time: new Date().getTime() }, '*');
          }
        } catch (e) {
          console.log('Cannot access popup location due to security restrictions');
        }
      }
    }, 1000);
    
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
 * Refresh the access token using Cloudflare Worker
 * @returns {Promise<boolean>} Success status
 */
async function refreshAccessToken() {
  try {
    // Get refresh token from storage
    const refreshToken = getTokenFromStorages('spotify_refresh_token');
    
    if (!refreshToken) {
      console.error('No refresh token available for refresh');
      showSpotifyAuthButton();
      return false;
    }
    
    console.log('Refreshing access token...');
    
    // Request new access token from Cloudflare Worker
    const response = await fetch('/refreshToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Token refresh failed: ${errorData.error}`);
    }
    
    const tokenData = await response.json();
    
    // Store the new access token in both storages
    saveTokenToStorages('spotify_token', tokenData.access_token);
    spotifyToken = tokenData.access_token;
    
    // Calculate token expiry time
    const expiryTime = new Date().getTime() + (tokenData.expires_in * 1000);
    saveTokenToStorages('spotify_token_expiry', expiryTime.toString());
    
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
    removeTokenFromStorages('spotify_token');
    removeTokenFromStorages('spotify_token_expiry');
    
    // Keep refresh token unless error indicates it's invalid
    if (error.message && (
        error.message.includes('invalid_grant') || 
        error.message.includes('invalid refresh token'))) {
      removeTokenFromStorages('spotify_refresh_token');
    }
    
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
  console.group('===== RECEIVED MESSAGE FROM POPUP =====');
  console.log('Origin:', event.origin);
  console.log('Message type:', event.data && event.data.type);
  console.log('Full data:', event.data);
  
  // Handle test messages to verify communication
  if (event.data && event.data.type === 'DEBUG_TEST') {
    console.log('Received test message from popup:', event.data.time);
    return;
  }
  
  // Handle ping response
  if (event.data && event.data.type === 'PONG_TO_PARENT') {
    console.log('Received pong from popup - communication working');
    console.groupEnd();
    return;
  }
  
  // Special test message handler
  if (event.data && event.data.type === 'SPOTIFY_AUTH_SUCCESS_TEST') {
    console.log('✓ Test token message received!');
    console.log('Tokens in test message:', event.data.tokens);
    
    // Verify we can access all necessary properties
    const verified = 
      event.data.tokens && 
      event.data.tokens.access_token && 
      event.data.tokens.refresh_token && 
      event.data.tokens.expires_in;
    
    console.log('All token properties accessible:', verified ? 'YES' : 'NO');
    
    // Try to store in localStorage as a test
    try {
      localStorage.setItem('test_token', event.data.tokens.access_token);
      const retrieved = localStorage.getItem('test_token');
      console.log('localStorage test:', retrieved === event.data.tokens.access_token ? 'SUCCESS' : 'FAILED');
      localStorage.removeItem('test_token');
    } catch (e) {
      console.error('localStorage test failed:', e);
    }
    
    // Try to acknowledge back to the popup
    if (spotifyAuthWindow && !spotifyAuthWindow.closed) {
      try {
        spotifyAuthWindow.acknowledgeTokens('Tokens received successfully');
        console.log('✓ Acknowledgment sent to popup window');
      } catch (e) {
        console.error('Failed to send acknowledgment:', e);
      }
    } else {
      console.warn('Cannot send acknowledgment - popup window not available');
    }
    
    console.groupEnd();
    return;
  }
  
  // Process authentication data with tokens
  if (event.data && event.data.type === 'SPOTIFY_AUTH_SUCCESS') {
    console.log('Received Spotify authentication success message');
    
    // Clear the auth window check interval if it exists
    if (authWindowCheckInterval) {
      clearInterval(authWindowCheckInterval);
      authWindowCheckInterval = null;
    }
    
    // IMPORTANT: Store tokens from the message directly if available
    if (event.data.tokens) {
      console.log('Tokens received directly in message - storing locally');
      
      // Store tokens in both storages for redundancy
      saveTokenToStorages('spotify_token', event.data.tokens.access_token);
      
      if (event.data.tokens.refresh_token) {
        saveTokenToStorages('spotify_refresh_token', event.data.tokens.refresh_token);
      }
      
      if (event.data.tokens.expires_in) {
        const expiryTime = new Date().getTime() + (parseInt(event.data.tokens.expires_in) * 1000);
        saveTokenToStorages('spotify_token_expiry', expiryTime.toString());
      }
      
      // Update token variable
      spotifyToken = event.data.tokens.access_token;
      
      // Create Spotify player with the token
      createSpotifyPlayer(spotifyToken);
      
      // Reset button state with success indication
      const authButton = document.getElementById('spotify-auth-btn');
      if (authButton) {
        authButton.innerHTML = 'Connected';
        authButton.disabled = true;
      }
      
      // Close the popup if it's still open
      if (spotifyAuthWindow && !spotifyAuthWindow.closed) {
        try {
          spotifyAuthWindow.close();
          console.log('Popup window closed successfully');
        } catch (error) {
          console.error('Error closing popup:', error);
          // Non-critical error, can continue
        }
      }
    } else {
      // Check if token exists in storage (should have been set by the callback page)
      const token = getTokenFromStorages('spotify_token');
      if (!token) {
        console.warn('No token found in storage despite success message');
        
        // Reset button state
        const authButton = document.getElementById('spotify-auth-btn');
        if (authButton) {
          authButton.innerHTML = 'Connect Spotify';
          authButton.disabled = false;
        }
        
        console.groupEnd();
        return;
      }
      
      // Update token variable
      spotifyToken = token;
      
      // Create Spotify player with the token
      createSpotifyPlayer(spotifyToken);
      
      // Reset button state with success indication
      const authButton = document.getElementById('spotify-auth-btn');
      if (authButton) {
        authButton.innerHTML = 'Connected';
        authButton.disabled = true;
      }
    }
    
    console.timeEnd('spotify_auth_flow');
  } else if (event.data && event.data.type === 'SPOTIFY_AUTH_ERROR') {
    console.error('Spotify authentication error:', event.data.error);
    
    // Clear the auth window check interval if it exists
    if (authWindowCheckInterval) {
      clearInterval(authWindowCheckInterval);
      authWindowCheckInterval = null;
    }
    
    // Reset button state
    const authButton = document.getElementById('spotify-auth-btn');
    if (authButton) {
      authButton.innerHTML = 'Connect Spotify';
      authButton.disabled = false;
    }
    
    alert('Failed to authenticate with Spotify: ' + event.data.error);
    console.timeEnd('spotify_auth_flow');
  }
  
  console.groupEnd();
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
  
  // Track retry attempts
  if (initRetryCount >= MAX_INIT_RETRIES) {
    console.error(`Exceeded maximum retry attempts (${MAX_INIT_RETRIES})`);
    showToast('Failed to initialize Spotify player after multiple attempts', 'error');
    return;
  }
  
  console.log(`Creating Spotify player with token (attempt ${initRetryCount + 1})`);
  initRetryCount++;
  
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
      
      // Store device ID in both storages
      saveTokenToStorages('spotify_device_id', device_id);
      
      // Reset retry counter on success
      initRetryCount = 0;
      
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
      
      // Only show auth button if we've exhausted retries
      if (initRetryCount >= MAX_INIT_RETRIES) {
        showSpotifyAuthButton();
      } else {
        // Retry with a delay
        setTimeout(() => createSpotifyPlayer(token), 2000);
      }
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
        
        // Retry if we haven't exhausted attempts
        if (initRetryCount < MAX_INIT_RETRIES) {
          setTimeout(() => {
            console.log(`Retrying Spotify connection (attempt ${initRetryCount + 1})`);
            createSpotifyPlayer(token);
          }, 2000);
        }
      }
    }).catch(error => {
      console.error('Error connecting to Spotify:', error);
      
      // Retry if we haven't exhausted attempts
      if (initRetryCount < MAX_INIT_RETRIES) {
        setTimeout(() => createSpotifyPlayer(token), 2000);
      } else {
        showToast('Failed to connect to Spotify after multiple attempts', 'error');
      }
    });
  } catch (error) {
    console.error('Error creating Spotify player:', error);
    
    // Retry if we haven't exhausted attempts
    if (initRetryCount < MAX_INIT_RETRIES) {
      setTimeout(() => createSpotifyPlayer(token), 2000);
    }
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
  const deviceId = getTokenFromStorages('spotify_device_id');
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
    const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      body: JSON.stringify({ uris: [uri] }),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${spotifyToken}`
      }
    });
    
    if (!response.ok) {
      // Handle specific error cases
      if (response.status === 401) {
        // Token expired, try to refresh
        console.log('Token expired during playback, refreshing');
        await refreshAccessToken();
        // Try playing again with the new token
        return playSongByIndex(index);
      } else if (response.status === 404) {
        // Device not found
        console.error('Device not found, trying to reconnect player');
        // Try to reconnect player
        if (spotifyPlayer) {
          await spotifyPlayer.disconnect();
          await new Promise(resolve => setTimeout(resolve, 1000));
          await spotifyPlayer.connect();
          // Try again after reconnection
          setTimeout(() => playSongByIndex(index), 2000);
        }
        return;
      } else {
        const errorText = await response.text();
        throw new Error(`API error (${response.status}): ${errorText}`);
      }
    }
    
    // Update current index
    currentSongIndex = index;
    
  } catch (error) {
    console.error('Error playing song:', error);
    
    // Try to recover based on error
    if (error.message && error.message.includes('The access token expired')) {
      refreshAccessToken();
    } else {
      showToast('Error playing track. Please try again.', 'error');
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
    showToast('Error updating game state. Check your network connection.', 'error');
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
    
    // Clear all Spotify data from both storages
    removeTokenFromStorages('spotify_token');
    removeTokenFromStorages('spotify_token_expiry');
    removeTokenFromStorages('spotify_refresh_token');
    removeTokenFromStorages('spotify_device_id');
    removeTokenFromStorages('redirected_from_spotify');
    removeTokenFromStorages('spotify_auth_timestamp');
    
    // Reset variables
    spotifyToken = null;
    currentTrackUri = null;
    playlistSongUris = [];
    currentSongIndex = -1;
    initRetryCount = 0;
    
    // Clear token refresh timer
    if (tokenRefreshTimer) {
      clearTimeout(tokenRefreshTimer);
      tokenRefreshTimer = null;
    }
    
    // Clear auth window check interval
    if (authWindowCheckInterval) {
      clearInterval(authWindowCheckInterval);
      authWindowCheckInterval = null;
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