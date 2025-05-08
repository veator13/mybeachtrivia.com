/**
 * Music Bingo Host Dashboard - Main Controller
 * This is the main entry point for the Music Bingo application
 * It imports and initializes all required modules and services
 */

import { initializeAuth } from './auth-service.js';
import { initializeSpotify, isSpotifyReady } from './spotify-service.js';
import { setupEventListeners, showToast } from './ui-handler.js';
import { startGameUpdateInterval } from './game-manager.js';

// Global state - expose to window object for cross-module access
let currentGame = null;
let gameInterval = null;
let initAttempts = 0;
const MAX_INIT_ATTEMPTS = 3;

// Expose important variables to the window object for global access
window.currentGame = currentGame;
window.gameInterval = gameInterval;

/**
 * Check if Firebase is properly initialized with required modules
 * @returns {boolean} - True if Firebase is ready
 */
function checkFirebaseAvailability() {
  if (typeof firebase === 'undefined') {
    console.error('Firebase is not defined - this will affect functionality');
    showToast('Error: Firebase not available. Please refresh the page.', 'error');
    return false;
  }
  
  // Check for required Firebase modules
  const requiredModules = {
    auth: typeof firebase.auth !== 'undefined',
    firestore: typeof firebase.firestore !== 'undefined',
    database: typeof firebase.database !== 'undefined'
  };
  
  console.log('Firebase modules available:', requiredModules);
  
  if (!requiredModules.database) {
    console.warn('Firebase Database module is missing');
    showToast('Warning: Database module not loaded. Attempting to recover...', 'warning');
    
    // Try to dynamically load Firebase Database if it's missing
    const script = document.createElement('script');
    script.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js';
    script.onload = function() {
      console.log('Firebase Database loaded dynamically');
      showToast('Database module loaded successfully', 'success');
      
      // Re-initialize Firebase if needed
      if (firebase.apps.length) {
        console.log('Firebase already initialized, rechecking modules');
        if (typeof firebase.database !== 'undefined') {
          console.log('Database module now available');
        }
      }
    };
    script.onerror = function(err) {
      console.error('Failed to load Firebase Database:', err);
      showToast('Failed to load database module. Some features may not work.', 'error');
    };
    document.head.appendChild(script);
  }
  
  return requiredModules.auth && requiredModules.firestore;
}

/**
 * Main initialization when document is ready
 */
document.addEventListener('DOMContentLoaded', function() {
  console.log('Initializing Music Bingo Host Dashboard...');
  
  // Check Firebase availability first
  if (!checkFirebaseAvailability()) {
    console.warn('Continuing initialization with limited functionality');
  }
  
  // Check for Spotify auth redirect
  const urlParams = new URLSearchParams(window.location.search);
  const spotifyAuth = urlParams.get('spotify_auth');
  const timestamp = urlParams.get('timestamp');
  const gameId = urlParams.get('gameId');
  
  if (spotifyAuth === 'true' && timestamp) {
    console.log('Detected return from Spotify authentication, timestamp:', timestamp);
    
    // Clean up URL parameters to avoid confusion
    if (window.history.replaceState) {
      let cleanUrl = window.location.pathname;
      
      // Keep gameId if present
      if (gameId) {
        cleanUrl += '?gameId=' + gameId;
      }
      
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }
  
  // Initialize application
  initializeApplication();
});

/**
 * Initialize the application with retry capability
 */
function initializeApplication() {
  initAttempts++;
  console.log(`Initializing application (attempt ${initAttempts}/${MAX_INIT_ATTEMPTS})...`);
  
  // Initialize authentication
  initializeAuth()
    .then(user => {
      if (user) {
        console.log('Authentication successful:', user.email);
        
        // Once authenticated, set up event listeners for the UI
        setupEventListeners();
        
        // Initialize Spotify integration
        initializeSpotify();
        
        // Wait for a short time to allow Spotify to initialize from localStorage if tokens exist
        setTimeout(() => {
          // Check for Spotify readiness
          const spotifyReady = isSpotifyReady();
          console.log('Spotify integration ready:', spotifyReady);
          
          // Check URL for game ID parameter (in case of returning after Spotify auth)
          const urlParams = new URLSearchParams(window.location.search);
          const gameId = urlParams.get('gameId');
          
          if (gameId) {
            console.log('Returning to game:', gameId);
            // If returning to a game, resume it
            import('./game-manager.js').then(module => {
              module.resumeGame(gameId);
            });
          }
        }, 1000);
        
        console.log('Music Bingo Host Dashboard initialized successfully');
      }
    })
    .catch(error => {
      console.error('Initialization error:', error);
      
      // Handle specific errors
      if (error.code === 'auth/network-request-failed') {
        showToast('Network error. Please check your connection and try again.', 'error');
      } else {
        showToast('Error initializing application. Please refresh the page.', 'error');
      }
      
      // Retry initialization if we haven't reached the maximum attempts
      if (initAttempts < MAX_INIT_ATTEMPTS) {
        console.log(`Retrying initialization in 3 seconds... (${initAttempts}/${MAX_INIT_ATTEMPTS})`);
        setTimeout(initializeApplication, 3000);
      } else {
        console.error('Failed to initialize after multiple attempts');
        showToast('Failed to initialize application after multiple attempts. Please reload the page.', 'error');
      }
    });
}

/**
 * Update the current game reference and window reference
 * @param {Object} game - The game object to set as current
 */
export function setCurrentGame(game) {
  currentGame = game;
  window.currentGame = game; // Make sure window reference stays in sync
}

/**
 * Handle application shutdown
 * Clean up resources when page is being unloaded
 */
window.addEventListener('beforeunload', function() {
  // Clean up any active intervals
  if (gameInterval) {
    clearInterval(gameInterval);
  }
  
  // If there's an active game, update its status
  if (currentGame) {
    import('./firebase-service.js').then(module => {
      module.updateGameStatus(currentGame.id, 'host_disconnected');
    });
  }
});

/**
 * Set game interval reference
 * @param {number} interval - setInterval reference
 */
export function setGameInterval(interval) {
  gameInterval = interval;
  window.gameInterval = interval;
}

/**
 * Check if a module is available
 * @param {string} modulePath - Path to the module
 * @returns {Promise<boolean>} - True if module is available
 */
function checkModuleAvailability(modulePath) {
  return import(modulePath)
    .then(() => true)
    .catch(err => {
      console.error(`Module ${modulePath} not available:`, err);
      return false;
    });
}

/**
 * Global error handler with improved logging and recovery
 */
window.addEventListener('error', function(event) {
  console.error('Global error:', event.error);
  
  // Analyze the error to provide better feedback
  if (event.error) {
    // Check for specific known errors
    if (event.error.message && event.error.message.includes('h1:contains')) {
      console.warn('DOM selection error detected. This is a non-critical error and can be ignored.');
    } else if (event.error.message && event.error.message.includes('spotify')) {
      console.warn('Spotify-related error detected. This may affect music playback.');
      
      // Try to recover Spotify integration
      if (window.spotifyServiceRecovery) {
        console.log('Attempting to recover Spotify integration...');
        window.spotifyServiceRecovery.initialize().catch(e => {
          console.error('Failed to recover Spotify integration:', e);
        });
      }
    } else if (event.error.message && event.error.message.includes('firebase')) {
      console.warn('Firebase-related error detected. This may affect data storage and retrieval.');
      // Could attempt to recover Firebase connection here
    }
  }
  
  // Prevent showing too many toasts for the same error
  const now = Date.now();
  const lastErrorTime = window.lastErrorTime || 0;
  
  // Only show toast if it's been at least 5 seconds since the last error
  if (now - lastErrorTime > 5000) {
    window.lastErrorTime = now;
    showToast('An error occurred. If problems persist, please refresh the page.', 'error');
  }
});

// Export any functions or variables that need to be accessed by other modules
export { currentGame, gameInterval };