/**
 * Music Bingo Host Dashboard - Main Controller
 * This is the main entry point for the Music Bingo application
 * It imports and initializes all required modules and services
 */

import { initializeAuth } from './auth-service.js';
import { initializeSpotify } from './spotify-service.js';
import { setupEventListeners } from './ui-handler.js';
// cache-bust to force browsers to fetch the latest game-manager
import { startGameUpdateInterval } from './game-manager.js?v=bt2';

// ----------------------
// QR helper (no imports)
// ----------------------
// Uses the global QRCode from qrcode.min.js (included in host-music-bingo.html)
export function renderJoinQRCode(url) {
  try {
    const el = document.getElementById('qrcode');
    if (!el) return;

    // clear any previous QR
    el.innerHTML = '';

    // eslint-disable-next-line no-undef
    if (typeof QRCode === 'undefined') {
      console.error('QRCode library not found. Make sure qrcode.min.js is loaded.');
      return;
    }

    // build QR
    // eslint-disable-next-line no-undef
    new QRCode(el, {
      text: url,
      width: 180,
      height: 180,
      correctLevel: QRCode.CorrectLevel.M,
    });

    const joinUrlEl = document.getElementById('join-url');
    if (joinUrlEl) joinUrlEl.textContent = url;
  } catch (e) {
    console.error('renderJoinQRCode failed:', e);
  }
}

// Alias to ease migration if other files look for this name.
export const generateQRCode = renderJoinQRCode;

// Also expose on window so non-module code (or legacy imports) can call it.
window.renderJoinQRCode = renderJoinQRCode;
window.generateQRCode = renderJoinQRCode;

// ----------------------
// Global state
// ----------------------
let currentGame = null;
let gameInterval = null;

// Expose important variables to the window object for global access
window.currentGame = currentGame;
window.gameInterval = gameInterval;

/**
 * Main initialization when document is ready
 */
document.addEventListener('DOMContentLoaded', function () {
  console.log('Initializing Music Bingo Host Dashboard...');

  // Initialize authentication
  initializeAuth()
    .then((user) => {
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
          // If returning to a game, resume it (cache-busted dynamic import)
          import('./game-manager.js?v=bt2').then((module) => {
            module.resumeGame(gameId);
          });
        }

        console.log('Music Bingo Host Dashboard initialized successfully');
      }
    })
    .catch((error) => {
      console.error('Initialization error:', error);
    });
});

/**
 * Update the current game reference and window reference
 * @param {Object} game - The game object to set as current
 */
export function setCurrentGame(game) {
  currentGame = game;
  window.currentGame = game; // keep window reference in sync
}

/**
 * Set game interval reference
 * @param {number} interval - setInterval reference
 */
export function setGameInterval(interval) {
  gameInterval = interval;
  window.gameInterval = interval;
}

/**
 * Handle application shutdown
 * Clean up resources when page is being unloaded
 */
window.addEventListener('beforeunload', function () {
  // Clean up any active intervals
  if (gameInterval) {
    clearInterval(gameInterval);
  }

  // If there's an active game, update its status
  if (currentGame) {
    import('./firebase-service.js').then((module) => {
      module.updateGameStatus(currentGame.id, 'host_disconnected');
    });
  }
});

/**
 * Global error handler
 */
window.addEventListener('error', function (event) {
  console.error('Global error:', event.error);
  // Hook for error reporting service could go here
});

// Export any other functions or variables that need to be accessed by other modules
export { currentGame, gameInterval };