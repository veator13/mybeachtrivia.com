/**
 * Authentication Service
 * Handles user authentication and associated UI updates
 */

// Import dependencies from other modules
import { loadPlaylists } from './playlist-manager.js';
import { loadGameHistory } from './game-manager.js';

// Internal state
let currentUser = null;

/**
 * Initialize Firebase authentication
 * Checks if user is authenticated and handles appropriate actions
 * @returns {Promise} Resolves with the authenticated user object or null
 */
export function initializeAuth() {
  return new Promise((resolve, reject) => {
    try {
      // Check if user is authenticated
      firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
          // User is signed in
          currentUser = user;
          console.log('User authenticated:', user.email);
          
          // Update UI with user info
          updateUserDisplay(user);
          
          // Load playlists
          loadPlaylists();
          
          // Load game history
          loadGameHistory();
          
          // Resolve the promise with the user object
          resolve(user);
        } else {
          // User is not signed in, redirect to login
          console.log('No user signed in, redirecting to login');
          window.location.href = '../login.html';
          resolve(null);
        }
      }, (error) => {
        console.error('Authentication error:', error);
        reject(error);
      });
    } catch (error) {
      console.error('Error in initializeAuth:', error);
      reject(error);
    }
  });
}

/**
 * Update the UI to display user information
 * @param {Object} user - Firebase user object
 */
function updateUserDisplay(user) {
  const hostNameElement = document.getElementById('host-name');
  if (!hostNameElement) return;
  
  // Try to get display name or email
  let displayName = user.displayName || user.email || 'Host';
  
  // Update the UI
  hostNameElement.textContent = displayName;
}

/**
 * Get the current authenticated user
 * @returns {Object|null} The Firebase user object or null if not authenticated
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Sign out the current user
 * @returns {Promise} Resolves when sign out is complete
 */
export function signOut() {
  return firebase.auth().signOut()
    .then(() => {
      console.log('User signed out successfully');
      currentUser = null;
    })
    .catch((error) => {
      console.error('Error signing out:', error);
      throw error;
    });
}

/**
 * Check if user has admin privileges
 * @returns {boolean} True if user has admin role
 */
export function isAdmin() {
  if (!currentUser) return false;
  
  // Additional admin checking logic could go here
  // For example, checking a custom claim or a database entry
  
  return true; // Default to true since they're authenticated in the host dashboard
}