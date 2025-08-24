/**
 * Playlist Manager Module
 * Handles loading, managing, and retrieving playlists for Music Bingo
 */

import { fetchPlaylists } from './firebase-service.js';
import { GAME_SETTINGS } from './config.js';

// Store playlists data
let playlistsData = [];

/**
 * Load playlists from Firebase and update UI
 * @returns {Promise<Array>} Array of playlist objects
 */
export async function loadPlaylists() {
  const playlistSelect = document.getElementById('playlist-select');
  if (!playlistSelect) return [];
  
  try {
    // Show loading state
    playlistSelect.innerHTML = '<option value="" disabled selected>Loading playlists...</option>';
    
    // Get playlists from Firebase
    const playlists = await fetchPlaylists();
    
    if (playlists.length === 0) {
      console.log('No playlists found');
      playlistSelect.innerHTML = '<option value="" disabled selected>No playlists available</option>';
      return [];
    }
    
    // Clear the select and add the default option
    playlistSelect.innerHTML = '<option value="" disabled selected>Select a playlist</option>';
    
    // Store playlists data globally and populate dropdown
    playlistsData = playlists;
    
    // Sort playlists by name
    playlistsData.sort((a, b) => {
      const nameA = a.name.toUpperCase();
      const nameB = b.name.toUpperCase();
      return nameA.localeCompare(nameB);
    });
    
    // Add each playlist to the dropdown
    playlistsData.forEach(playlist => {
      // Create option element
      const option = document.createElement('option');
      option.value = playlist.id;
      option.textContent = playlist.name;
      playlistSelect.appendChild(option);
    });
    
    console.log(`Loaded ${playlistsData.length} playlists`);
    
    // Also update any module that needs the playlist data
    import('./game-manager.js').then(module => {
      module.setPlaylistsData(playlistsData);
    });
    
    return playlistsData;
    
  } catch (error) {
    console.error('Error loading playlists:', error);
    playlistSelect.innerHTML = '<option value="" disabled selected>Error loading playlists</option>';
    return [];
  }
}

/**
 * Get all playlists
 * @returns {Array} Array of playlist objects
 */
export function getPlaylistsData() {
  return playlistsData;
}

/**
 * Get a specific playlist by ID
 * @param {string} playlistId - ID of the playlist to retrieve
 * @returns {Object|null} Playlist object or null if not found
 */
export function getPlaylistById(playlistId) {
  return playlistsData.find(p => p.id === playlistId) || null;
}

/**
 * Count songs in a playlist
 * @param {Object|string} playlist - Playlist object or ID
 * @returns {number} Number of songs in the playlist
 */
export function countPlaylistSongs(playlist) {
  // If playlist is an ID, get the playlist object
  if (typeof playlist === 'string') {
    playlist = getPlaylistById(playlist);
  }
  
  if (!playlist) return 0;
  
  // Count how many songs are in the playlist by looking for artist1, artist2, etc.
  let songCount = 0;
  for (let i = 1; i <= GAME_SETTINGS.MAX_SONGS_PER_PLAYLIST; i++) {
    if (playlist[`artist${i}`] && playlist[`song${i}`]) {
      songCount++;
    } else {
      break;
    }
  }
  
  return songCount;
}

/**
 * Get song information by index
 * @param {Object} playlist - Playlist object
 * @param {number} index - Zero-based index of the song to retrieve
 * @returns {Object|null} Song object or null if not found
 */
export function getSongByIndex(playlist, index) {
  if (!playlist) return null;
  
  // Adjust for 1-based indexing in the data structure
  const songIndex = index + 1;
  
  // Check if the song exists
  if (!playlist[`artist${songIndex}`] || !playlist[`song${songIndex}`]) {
    return null;
  }
  
  // Return song information
  return {
    title: playlist[`song${songIndex}`],
    artist: playlist[`artist${songIndex}`],
    uri: playlist[`uri${songIndex}`] || null,
    index: index
  };
}

/**
 * Get all songs from a playlist
 * @param {Object|string} playlist - Playlist object or ID
 * @returns {Array} Array of song objects
 */
export function getPlaylistSongs(playlist) {
  // If playlist is an ID, get the playlist object
  if (typeof playlist === 'string') {
    playlist = getPlaylistById(playlist);
  }
  
  if (!playlist) return [];
  
  const songs = [];
  const songCount = countPlaylistSongs(playlist);
  
  for (let i = 0; i < songCount; i++) {
    const song = getSongByIndex(playlist, i);
    if (song) {
      songs.push(song);
    }
  }
  
  return songs;
}

/**
 * Filter playlists by name
 * @param {string} searchTerm - Search term to filter by
 * @returns {Array} Filtered array of playlist objects
 */
export function filterPlaylists(searchTerm) {
  if (!searchTerm) return playlistsData;
  
  const term = searchTerm.toLowerCase();
  
  return playlistsData.filter(playlist => {
    // Search in name
    if (playlist.name.toLowerCase().includes(term)) return true;
    
    // Search in description if available
    if (playlist.description && playlist.description.toLowerCase().includes(term)) return true;
    
    return false;
  });
}

/**
 * Update the playlist dropdown with filtered results
 * @param {string} searchTerm - Search term to filter by
 */
export function updatePlaylistDropdown(searchTerm) {
  const playlistSelect = document.getElementById('playlist-select');
  if (!playlistSelect) return;
  
  // Get filtered playlists
  const filteredPlaylists = filterPlaylists(searchTerm);
  
  // Clear current options
  playlistSelect.innerHTML = '';
  
  // Add default option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.disabled = true;
  defaultOption.selected = true;
  defaultOption.textContent = filteredPlaylists.length > 0 
    ? 'Select a playlist' 
    : 'No matching playlists';
  playlistSelect.appendChild(defaultOption);
  
  // Add filtered playlists
  filteredPlaylists.forEach(playlist => {
    const option = document.createElement('option');
    option.value = playlist.id;
    option.textContent = playlist.name;
    playlistSelect.appendChild(option);
  });
}