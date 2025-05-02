/**
 * Firebase Service
 * Handles all Firebase operations for the Music Bingo application
 */

import { FIREBASE_PATHS, GAME_SETTINGS } from './config.js';
import { getCurrentUser } from './auth-service.js';

/**
 * Create a new game in both Firestore and Realtime Database
 * @param {Object} gameData - Game configuration data
 * @returns {Promise<Object>} The created game object with ID
 */
export async function createGame(gameData) {
  try {
    const user = getCurrentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Create the base game object with default values
    const newGame = {
      hostId: user.uid,
      playlistId: gameData.playlistId,
      playlistName: gameData.playlistName || 'Unknown Playlist',
      name: gameData.name || GAME_SETTINGS.DEFAULT_GAME_NAME,
      playerLimit: gameData.playerLimit || null,
      status: 'active',
      playerCount: 0,
      currentSongIndex: -1, // No song playing initially
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Add to Firestore
    const db = firebase.firestore();
    const gamesRef = db.collection(FIREBASE_PATHS.GAMES);
    const gameDoc = await gamesRef.add(newGame);
    
    console.log('Game created in Firestore with ID:', gameDoc.id);
    
    // Create parallel record in Realtime Database for real-time sync
    const rtGameData = {
      hostId: user.uid,
      playlistId: gameData.playlistId,
      name: gameData.name || GAME_SETTINGS.DEFAULT_GAME_NAME,
      status: 'active',
      playerCount: 0,
      currentSongIndex: -1,
      players: {}, // Initialize empty players object for tracking unique players
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
    
    // Save to Realtime Database
    const database = firebase.database();
    await database.ref(`${FIREBASE_PATHS.GAMES}/${gameDoc.id}`).set(rtGameData);
    
    console.log('Game also saved to Realtime Database');
    
    // Return the new game object with its ID
    return {
      id: gameDoc.id,
      ...newGame
    };
  } catch (error) {
    console.error('Error creating game:', error);
    throw error;
  }
}

/**
 * Update game data in both Firestore and Realtime Database
 * @param {string} gameId - ID of the game to update
 * @param {Object} updates - Object containing fields to update
 * @returns {Promise<boolean>} Success status
 */
export async function updateGame(gameId, updates) {
  if (!gameId) {
    console.error('No game ID provided for update');
    return false;
  }
  
  try {
    // Update game data in Firestore
    const db = firebase.firestore();
    await db.collection(FIREBASE_PATHS.GAMES).doc(gameId).update({
      ...updates,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Also update in Realtime Database
    const database = firebase.database();
    await database.ref(`${FIREBASE_PATHS.GAMES}/${gameId}`).update({
      ...updates,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
    
    return true;
  } catch (error) {
    console.error('Error updating game:', error);
    return false;
  }
}

/**
 * Update game status
 * @param {string} gameId - ID of the game to update
 * @param {string} status - New status value
 * @returns {Promise<boolean>} Success status
 */
export async function updateGameStatus(gameId, status) {
  return updateGame(gameId, { status });
}

/**
 * Update current song index
 * @param {string} gameId - ID of the game
 * @param {number} songIndex - Index of the current song
 * @returns {Promise<boolean>} Success status
 */
export async function updateGameSongIndex(gameId, songIndex) {
  return updateGame(gameId, { currentSongIndex: songIndex });
}

/**
 * Load playlists from Firestore
 * @returns {Promise<Array>} Array of playlist objects
 */
export async function fetchPlaylists() {
  try {
    // Get playlists from Firestore using the music_bingo collection
    const db = firebase.firestore();
    const playlistsRef = db.collection(FIREBASE_PATHS.MUSIC_BINGO);
    const snapshot = await playlistsRef.get();
    
    if (snapshot.empty) {
      console.log('No playlists found');
      return [];
    }
    
    // Convert to array of playlists with IDs
    const playlists = [];
    snapshot.forEach(doc => {
      const playlistData = doc.data();
      const playlist = {
        id: doc.id,
        ...playlistData,
        // Use playlistTitle field if available, fallback to a default name
        name: playlistData.playlistTitle || `Playlist ${doc.id}`
      };
      
      playlists.push(playlist);
    });
    
    console.log(`Loaded ${playlists.length} playlists`);
    return playlists;
    
  } catch (error) {
    console.error('Error loading playlists:', error);
    throw error;
  }
}

/**
 * Load game history for the current user
 * @param {number} limit - Maximum number of games to retrieve
 * @returns {Promise<Array>} Array of game objects
 */
export async function fetchGameHistory(limit = 10) {
  try {
    const user = getCurrentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Get games from Firestore
    const db = firebase.firestore();
    const gamesRef = db.collection(FIREBASE_PATHS.GAMES);
    const snapshot = await gamesRef
      .where('hostId', '==', user.uid)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    
    if (snapshot.empty) {
      console.log('No games found');
      return [];
    }
    
    // Convert to array of games with IDs
    const games = [];
    snapshot.forEach(doc => {
      games.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return games;
    
  } catch (error) {
    console.error('Error loading game history:', error);
    throw error;
  }
}

/**
 * Get a specific game by ID
 * @param {string} gameId - Game ID to retrieve
 * @returns {Promise<Object|null>} Game object or null if not found
 */
export async function getGameById(gameId) {
  try {
    // Try to get from Realtime Database first (for speed)
    const database = firebase.database();
    const gameRef = database.ref(`${FIREBASE_PATHS.GAMES}/${gameId}`);
    const rtSnapshot = await gameRef.once('value');
    const rtGameData = rtSnapshot.val();
    
    if (rtGameData) {
      return {
        id: gameId,
        ...rtGameData
      };
    }
    
    // Fallback to Firestore
    const db = firebase.firestore();
    const docSnapshot = await db.collection(FIREBASE_PATHS.GAMES).doc(gameId).get();
    
    if (!docSnapshot.exists) {
      console.log('Game not found in either database');
      return null;
    }
    
    return {
      id: gameId,
      ...docSnapshot.data()
    };
  } catch (error) {
    console.error('Error getting game by ID:', error);
    throw error;
  }
}

/**
 * Get player count for a game in real-time
 * @param {string} gameId - Game ID to check
 * @returns {Promise<number>} Number of players
 */
export async function getPlayerCount(gameId) {
  try {
    const database = firebase.database();
    const playersRef = database.ref(`${FIREBASE_PATHS.GAMES}/${gameId}/players`);
    const snapshot = await playersRef.once('value');
    
    if (!snapshot.exists()) {
      return 0;
    }
    
    // Count the number of unique player entries
    return Object.keys(snapshot.val()).length;
  } catch (error) {
    console.error('Error getting player count:', error);
    return 0;
  }
}

/**
 * Set up a real-time listener for a game
 * @param {string} gameId - Game ID to listen to
 * @param {Function} callback - Callback function that receives game data
 * @returns {Function} Unsubscribe function
 */
export function listenToGameUpdates(gameId, callback) {
  const database = firebase.database();
  const gameRef = database.ref(`${FIREBASE_PATHS.GAMES}/${gameId}`);
  
  const onValueChange = gameRef.on('value', (snapshot) => {
    const gameData = snapshot.val();
    if (gameData) {
      callback({
        id: gameId,
        ...gameData
      });
    }
  });
  
  // Return function to unsubscribe from updates
  return () => {
    gameRef.off('value', onValueChange);
  };
}

/**
 * End game and clean up resources
 * @param {string} gameId - Game ID to end
 * @returns {Promise<boolean>} Success status
 */
export async function endGame(gameId) {
  if (!gameId) return false;
  
  try {
    // Update game status
    await updateGameStatus(gameId, 'ended');
    
    // Additional cleanup if needed
    
    return true;
  } catch (error) {
    console.error('Error ending game:', error);
    return false;
  }
}