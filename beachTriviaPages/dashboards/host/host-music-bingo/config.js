/**
 * Music Bingo Application Configuration
 * This file contains all application constants and configuration settings
 */

// Firebase paths
export const FIREBASE_PATHS = {
  GAMES: 'games',
  MUSIC_BINGO: 'music_bingo',
  PLAYERS: 'players'
};

// Spotify configuration
export const SPOTIFY = {
  CLIENT_ID: 'da61dc149839439299554f1dc4455f1b',
  REDIRECT_URI: {
    // Determine if we're in development or production
    get CURRENT() {
      // Check if we're on localhost or 127.0.0.1
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://127.0.0.1:8080/spotify-callback.html'; // Exact URI registered in Spotify dashboard
      } else {
        // We're in production
        return 'https://mybeachtrivia.com/spotify-callback.html';
      }
    },
    PROD: 'https://mybeachtrivia.com/spotify-callback.html',
    DEV: 'http://127.0.0.1:8080/spotify-callback.html'
  },
  // Permissions needed for Spotify Web Playback
  SCOPES: [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-modify-playback-state',
    'user-read-playback-state'
  ]
};

// Game settings
export const GAME_SETTINGS = {
  DEFAULT_GAME_NAME: 'Music Bingo Game',
  MAX_PLAYERS: 100,
  MAX_SONGS_PER_PLAYLIST: 25,
  UPDATE_INTERVAL: 5000, // Check for game updates every 5 seconds
  SONG_STATES: {
    NOT_STARTED: -1,
    PAUSED: 'paused',
    PLAYING: 'playing'
  }
};

// UI settings
export const UI = {
  TOAST_DURATION: 2000, // Duration to show toast messages (ms)
  ANIMATION_DURATION: 300, // Duration for UI animations (ms)
  DEFAULT_VOLUME: 0.5, // Default Spotify player volume (0-1)
  POPUP_WIDTH: 450, // Width for Spotify auth popup
  POPUP_HEIGHT: 730 // Height for Spotify auth popup
};

// Application environment detection
export const ENV = {
  IS_DEVELOPMENT: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
  IS_PRODUCTION: window.location.hostname === 'mybeachtrivia.com',
  APP_VERSION: '1.0.0'
};

// URL Join paths helper
export function urlJoin(...parts) {
  return parts
    .map(part => part.replace(/(^\/+|\/+$)/g, ''))
    .filter(part => part.length)
    .join('/');
}