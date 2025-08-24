/**
 * UI Handler Module
 * Manages all UI updates and event handling for the Music Bingo application
 */

import { UI } from './config.js';
import { getCurrentUser } from './auth-service.js';

/**
 * Set up all event listeners
 */
export function setupEventListeners() {
  console.log('Setting up event listeners');
  
  // Create game button
  const createGameBtn = document.getElementById('create-game-btn');
  if (createGameBtn) {
    createGameBtn.addEventListener('click', async () => {
      const module = await import('./game-manager.js');
      module.createNewGame();
    });
  }

  // Copy join URL button
  const copyUrlBtn = document.getElementById('copy-url-btn');
  if (copyUrlBtn) {
    copyUrlBtn.addEventListener('click', copyJoinUrl);
  }

  // Game control buttons
  const playBtn = document.getElementById('play-song-btn');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      import('./game-manager.js').then(module => {
        module.playCurrentSong();
      });
    });
  }

  const nextBtn = document.getElementById('next-song-btn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      import('./game-manager.js').then(module => {
        module.playNextSong();
      });
    });
  }
  
  const pauseBtn = document.getElementById('pause-game-btn');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      import('./game-manager.js').then(module => {
        module.pauseGame();
      });
    });
  }
  
  const resumeBtn = document.getElementById('resume-game-btn');
  if (resumeBtn) {
    resumeBtn.addEventListener('click', () => {
      import('./game-manager.js').then(module => {
        module.resumeGame();
      });
    });
  }
  
  const endGameBtn = document.getElementById('end-game-btn');
  if (endGameBtn) {
    endGameBtn.addEventListener('click', () => {
      import('./game-manager.js').then(module => {
        module.endGame();
      });
    });
  }
}

/**
 * Update the UI to show active game state
 * @param {Object} game - game object (must include id, name, playlist, players, etc.)
 */
export function showActiveGameUI(game) {
  const setupSection = document.querySelector('.game-setup');
  const gameSection = document.getElementById('game-section');
  if (setupSection) setupSection.classList.add('hidden');
  if (gameSection) gameSection.classList.remove('hidden');
  
  updateGameUI(game);
}

/**
 * Update the game UI details and QR code
 */
export function updateGameUI(gameData) {
  if (!gameData) return;

  const qrcodeElement = document.getElementById('qrcode');
  const joinUrlElement = document.getElementById('join-url');
  const playerCountElement = document.getElementById('player-count');
  const gameNameElement = document.getElementById('current-game-name');
  const playlistElement = document.getElementById('current-playlist');
  const gameIdElement = document.getElementById('game-id');

  // Update static text fields
  if (gameNameElement) gameNameElement.textContent = gameData.name || 'Unnamed Game';
  if (playlistElement) playlistElement.textContent = gameData.playlist || 'Unknown Playlist';
  if (gameIdElement) gameIdElement.textContent = gameData.id || 'N/A';

  // Player count (Realtime DB players object)
  const count = gameData.players ? Object.keys(gameData.players).length : 0;
  if (playerCountElement) playerCountElement.textContent = count;

  // Build join URL for players
  const joinUrl = `${window.location.origin}/play-music-bingo/index.html?gameId=${gameData.id}`;
  if (joinUrlElement) joinUrlElement.textContent = joinUrl;

  // === QR CODE (LOCAL) ===
  // Updated to use local QRCode generator (qrcode.js) instead of external API image.
  // This avoids broken QR images if the external service is blocked or offline.
  if (qrcodeElement) {
    qrcodeElement.innerHTML = "";
    new QRCode(qrcodeElement, {
      text: joinUrl,
      width: 200,
      height: 200,
      correctLevel: QRCode.CorrectLevel.M
    });
  }
  // === END QR CODE ===
}

/**
 * Copy join URL to clipboard
 */
export function copyJoinUrl() {
  const joinUrlElement = document.getElementById('join-url');
  if (!joinUrlElement) return;

  const url = joinUrlElement.textContent || '';
  navigator.clipboard.writeText(url)
    .then(() => alert('Join link copied to clipboard!'))
    .catch(err => console.error('Failed to copy URL:', err));
}

/**
 * Utility to show/hide elements by id or element
 */
export function show(el) {
  const node = typeof el === 'string' ? document.getElementById(el) : el;
  if (node) node.classList.remove('hidden');
}

export function hide(el) {
  const node = typeof el === 'string' ? document.getElementById(el) : el;
  if (node) node.classList.add('hidden');
}

/**
 * Update user display (header)
 */
export function updateUserDisplay(user) {
  const hostNameElement = document.getElementById('host-name');
  if (!hostNameElement) return;
  
  let displayName = (user && (user.displayName || user.email)) || 'Host';
  hostNameElement.textContent = displayName;
}

/**
 * Format date/time (utility used by history list)
 */
export function formatDate(ts) {
  try {
    const d = new Date(ts);
    const opts = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    return d.toLocaleString(undefined, opts);
  } catch (error) {
    console.error('Date formatting error:', error);
    return 'Invalid date';
  }
}