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
      import('./game-manager.js').then(m => m.playCurrentSong());
    });
  }

  const nextBtn = document.getElementById('next-song-btn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      import('./game-manager.js').then(m => m.playNextSong());
    });
  }

  const pauseBtn = document.getElementById('pause-game-btn');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      import('./game-manager.js').then(m => m.pauseGame());
    });
  }

  const resumeBtn = document.getElementById('resume-game-btn');
  if (resumeBtn) {
    resumeBtn.addEventListener('click', () => {
      import('./game-manager.js').then(m => m.resumeGame());
    });
  }

  const endGameBtn = document.getElementById('end-game-btn');
  if (endGameBtn) {
    endGameBtn.addEventListener('click', () => {
      import('./game-manager.js').then(m => m.endGame());
    });
  }
}

/**
 * Update the UI to show active game state (wrapper)
 * Accepts a game object, or falls back to window.currentGame.
 */
export function updateActiveGameUI(game) {
  const g = game || window.currentGame || null;
  const setupSection = document.querySelector('.game-setup');
  const gameSection = document.getElementById('game-section');

  if (setupSection) setupSection.classList.add('hidden');
  if (gameSection) gameSection.classList.remove('hidden');

  if (g) updateGameUI(g);
}

/** Back-compat alias used earlier in code */
export function showActiveGameUI(game) {
  updateActiveGameUI(game);
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

  // Update text fields
  if (gameNameElement) gameNameElement.textContent = gameData.name || 'Unnamed Game';
  if (playlistElement) playlistElement.textContent = gameData.playlistName || gameData.playlist || 'Unknown Playlist';
  if (gameIdElement) gameIdElement.textContent = gameData.id || 'N/A';

  // Player count (Realtime DB players object)
  const count = gameData.players ? Object.keys(gameData.players).length : (gameData.playerCount || 0);
  if (playerCountElement) playerCountElement.textContent = count;

  // Build join URL for players
  const joinUrl = `${window.location.origin}/play-music-bingo/index.html?gameId=${gameData.id}`;
  if (joinUrlElement) joinUrlElement.textContent = joinUrl;

  // Render QR code with local library if available
  if (qrcodeElement) {
    qrcodeElement.innerHTML = '';
    if (typeof window.QRCode !== 'undefined') {
      // eslint-disable-next-line no-undef
      new QRCode(qrcodeElement, {
        text: joinUrl,
        width: 200,
        height: 200,
        // eslint-disable-next-line no-undef
        correctLevel: QRCode.CorrectLevel.M
      });
    } else {
      console.warn('QRCode library not found; skipping QR render');
    }
  }
}

/**
 * Update the "Current Song" display line in the host UI.
 * Minimal implementation that uses the index and any info placed on window.currentGame.
 */
export function updateCurrentSongDisplay(index) {
  const el = document.getElementById('current-song');
  if (!el) return;

  const num = (typeof index === 'number' && index >= 0) ? index + 1 : 0;

  // Try to show something nicer if the currentGame carries titles
  const cg = window.currentGame || {};
  const titles = cg.songTitles || [];  // optional array if you add it later
  const artists = cg.songArtists || []; // optional array if you add it later

  if (titles[num - 1] || artists[num - 1]) {
    const t = titles[num - 1] || `Song ${num}`;
    const a = artists[num - 1] || '';
    el.textContent = a ? `${t} — ${a}` : t;
  } else {
    el.textContent = num > 0 ? `Song ${num}` : 'Not started';
  }
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

  const displayName = (user && (user.displayName || user.email)) || 'Host';
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