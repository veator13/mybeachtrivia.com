/**
 * Music Bingo Host Dashboard - Main Controller
 * This is the main entry point for the Music Bingo application
 * It imports and initializes all required modules and services
 */

import { initializeAuth } from './auth-service.js';
import { initializeSpotify } from './spotify-service.js';
import { setupEventListeners } from './ui-handler.js';
import { startGameUpdateInterval } from './game-manager.js';

// Global state - expose to window object for cross-module access
let currentGame = null;
let gameInterval = null;

// Expose important variables to the window object for global access
window.currentGame = currentGame;
window.gameInterval = gameInterval;

/**
 * Main initialization when document is ready
 */
document.addEventListener('DOMContentLoaded', function() {
  console.log('Initializing Music Bingo Host Dashboard...');
  
  // Initialize authentication
  initializeAuth()
    .then(user => {
      if (user) {
        console.log('Authentication successful:', user.email);
        
        // Once authenticated, set up event listeners for the UI
        setupEventListeners();
        
        // Initialize Spotify integration
        initializeSpotify();
        
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
        
        console.log('Music Bingo Host Dashboard initialized successfully');
      }
    })
    .catch(error => {
      console.error('Initialization error:', error);
    });
});

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
 * Global error handler
 */
window.addEventListener('error', function(event) {
  console.error('Global error:', event.error);
  // Could add error reporting service integration here
});

// Export any functions or variables that need to be accessed by other modules
export { currentGame, gameInterval };