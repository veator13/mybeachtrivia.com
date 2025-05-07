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

// Firebase Functions configuration
export const FIREBASE_FUNCTIONS = {
  // Determine if we're using emulators or production endpoints
  get BASE_URL() {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:5001/beach-trivia-website/us-central1/spotify';
    } else {
      return '';  // Empty for production as we use relative URLs
    }
  },
  // Spotify authentication endpoints
  SPOTIFY: {
    get LOGIN() {
      return ENV.IS_DEVELOPMENT ? `${FIREBASE_FUNCTIONS.BASE_URL}/spotifyLogin` : '/spotifyLogin';
    },
    get CALLBACK() {
      return ENV.IS_DEVELOPMENT ? `${FIREBASE_FUNCTIONS.BASE_URL}/spotifyCallback` : '/spotifyCallback';
    },
    get REFRESH_TOKEN() {
      return ENV.IS_DEVELOPMENT ? `${FIREBASE_FUNCTIONS.BASE_URL}/refreshToken` : '/refreshToken';
    },
    get REVOKE_TOKEN() {
      return ENV.IS_DEVELOPMENT ? `${FIREBASE_FUNCTIONS.BASE_URL}/revokeToken` : '/revokeToken';
    }
  }
};

// Spotify configuration
export const SPOTIFY = {
  CLIENT_ID: 'da61dc149839439299554f1dc4455f1b',
  // Authorization method - Updated to use Firebase Functions
  AUTH_METHOD: 'FIREBASE_FUNCTIONS',
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
  // For PKCE flow, 'offline_access' is implicitly granted when refresh tokens are requested
  SCOPES: [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-modify-playback-state',
    'user-read-playback-state'
  ],
  // PKCE configuration (keeping for backward compatibility)
  PKCE: {
    CODE_VERIFIER_LENGTH: 64,
    CODE_CHALLENGE_METHOD: 'S256',
    TOKEN_ENDPOINT: 'https://accounts.spotify.com/api/token'
  }
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