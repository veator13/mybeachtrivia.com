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
    createGameBtn.addEventListener('click', () => {
      // Dynamic import to avoid circular dependencies
      import('./game-manager.js').then(module => {
        module.createNewGame();
      });
    });
  }
  
  // Copy URL button
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
  
  const endBtn = document.getElementById('end-game-btn');
  if (endBtn) {
    endBtn.addEventListener('click', () => {
      import('./game-manager.js').then(module => {
        module.endGame();
      });
    });
  }
  
  // Back button
  const backBtn = document.getElementById('back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = '../index.html';
    });
  }
}

/**
 * Update user display with name or email
 * @param {Object} user - Firebase user object
 */
export function updateUserDisplay(user) {
  const hostNameElement = document.getElementById('host-name');
  if (!hostNameElement) return;
  
  // Try to get display name or email
  let displayName = user.displayName || user.email || 'Host';
  
  // Update the UI
  hostNameElement.textContent = displayName;
}

/**
 * Update active game UI
 */
export function updateActiveGameUI() {
  // Dynamic import to avoid circular dependencies
  import('./game-manager.js').then(module => {
    const currentGame = module.getCurrentGame();
    if (!currentGame) return;
    
    // Show active game section
    const gameSection = document.getElementById('game-section');
    if (gameSection) {
      gameSection.classList.remove('hidden');
    }
    
    // Update game info
    const gameNameElement = document.getElementById('current-game-name');
    const playlistElement = document.getElementById('current-playlist');
    const gameIdElement = document.getElementById('game-id');
    const playerCountElement = document.getElementById('player-count');
    
    if (gameNameElement) gameNameElement.textContent = currentGame.name;
    if (playlistElement) playlistElement.textContent = currentGame.playlistName;
    if (gameIdElement) gameIdElement.textContent = currentGame.id;
    if (playerCountElement) playerCountElement.textContent = currentGame.playerCount || 0;
    
    // Reset song display
    const currentSongElement = document.getElementById('current-song');
    if (currentSongElement) currentSongElement.textContent = 'Not started';
  });
}

/**
 * Generate QR code for game
 * @param {string} gameId - ID of the game
 */
export function generateQRCode(gameId) {
  const qrcodeElement = document.getElementById('qrcode');
  if (!qrcodeElement) return;
  
  // Clear previous QR code
  qrcodeElement.innerHTML = '';
  
  // Create the join URL - hardcoded to the public-facing folder
  const joinUrl = 'https://mybeachtrivia.com/play-music-bingo/index.html?gameId=' + gameId;
  
  // Update URL display
  const joinUrlElement = document.getElementById('join-url');
  if (joinUrlElement) {
    joinUrlElement.textContent = joinUrl;
  }
  
  // Create QR code using the qrcode-generator library
  try {
    // Make sure qrcode is defined (from the imported library)
    if (typeof qrcode === 'undefined') {
      console.error('QR code library not loaded');
      qrcodeElement.innerHTML = '<p style="color: red;">QR code generation failed</p>';
      return;
    }
    
    // Create QR code
    const qr = qrcode(0, 'M');
    qr.addData(joinUrl);
    qr.make();
    
    // Render QR code
    qrcodeElement.innerHTML = qr.createImgTag(5);
    
    console.log('QR code generated for game:', gameId);
  } catch (error) {
    console.error('Error generating QR code:', error);
    qrcodeElement.innerHTML = '<p style="color: red;">QR code generation failed</p>';
  }
}

/**
 * Copy join URL to clipboard
 */
export function copyJoinUrl() {
  const joinUrlElement = document.getElementById('join-url');
  if (!joinUrlElement) return;
  
  const joinUrl = joinUrlElement.textContent;
  
  // Use Clipboard API if available
  if (navigator.clipboard) {
    navigator.clipboard.writeText(joinUrl)
      .then(() => {
        // Show temporary success message
        const copyBtn = document.getElementById('copy-url-btn');
        if (copyBtn) {
          const originalText = copyBtn.textContent;
          copyBtn.textContent = 'Copied!';
          setTimeout(() => {
            copyBtn.textContent = originalText;
          }, UI.TOAST_DURATION);
        }
      })
      .catch(err => {
        console.error('Could not copy text: ', err);
        alert('Failed to copy URL to clipboard');
      });
  } else {
    // Fallback for older browsers
    const tempInput = document.createElement('input');
    document.body.appendChild(tempInput);
    tempInput.value = joinUrl;
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    
    // Show temporary success message
    const copyBtn = document.getElementById('copy-url-btn');
    if (copyBtn) {
      const originalText = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.textContent = originalText;
      }, UI.TOAST_DURATION);
    }
  }
}

/**
 * Update current song display
 * @param {number} songIndex - Index of the current song
 */
export function updateCurrentSongDisplay(songIndex) {
  // Dynamic import to avoid circular dependencies
  import('./game-manager.js').then(module => {
    const currentGame = module.getCurrentGame();
    if (!currentGame) return;
    
    const currentSongElement = document.getElementById('current-song');
    if (!currentSongElement) return;
    
    // Use another dynamic import to get playlist data
    import('./playlist-manager.js').then(playlistModule => {
      // Get the selected playlist
      const playlists = playlistModule.getPlaylistsData();
      const selectedPlaylist = playlists.find(p => p.id === currentGame.playlistId);
      
      if (!selectedPlaylist) {
        currentSongElement.textContent = 'No playlist available';
        return;
      }
      
      // Since the data structure looks different, we need to check for artist fields
      // based on the index, e.g., artist1, artist2, etc.
      const songArtistKey = `artist${songIndex + 1}`;
      const songTitleKey = `song${songIndex + 1}`;
      
      // Check if the song data exists
      if (!selectedPlaylist[songArtistKey] || !selectedPlaylist[songTitleKey]) {
        currentSongElement.textContent = `Song ${songIndex + 1} not found`;
        return;
      }
      
      // Update the display with the song title and artist
      currentSongElement.textContent = `${selectedPlaylist[songTitleKey]} - ${selectedPlaylist[songArtistKey]}`;
    });
  });
}

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - Type of notification (success, error, info)
 * @param {number} duration - How long to show the notification (ms)
 */
export function showToast(message, type = 'info', duration = UI.TOAST_DURATION) {
  // Check if a toast container exists, create one if not
  let toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
    
    // Add styles if not already present
    if (!document.getElementById('toast-styles')) {
      const style = document.createElement('style');
      style.id = 'toast-styles';
      style.textContent = `
        .toast-container {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 1000;
        }
        
        .toast {
          padding: 12px 20px;
          margin-bottom: 10px;
          border-radius: 6px;
          color: white;
          width: 300px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          display: flex;
          justify-content: space-between;
          align-items: center;
          animation: toast-in 0.3s ease-out forwards;
        }
        
        .toast.removing {
          animation: toast-out 0.3s ease-out forwards;
        }
        
        .toast.success { background-color: #22c55e; }
        .toast.error { background-color: #ef4444; }
        .toast.info { background-color: #3b82f6; }
        
        .toast-close {
          background: none;
          border: none;
          color: white;
          font-size: 16px;
          cursor: pointer;
          padding: 0 0 0 10px;
        }
        
        @keyframes toast-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        
        @keyframes toast-out {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
  }
  
  // Create the toast element
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${message}</span>
    <button class="toast-close">&times;</button>
  `;
  
  // Add to container
  toastContainer.appendChild(toast);
  
  // Add close button functionality
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => {
    toast.classList.add('removing');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, UI.ANIMATION_DURATION);
  });
  
  // Auto-remove after duration
  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add('removing');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, UI.ANIMATION_DURATION);
    }
  }, duration);
}

/**
 * Show a loading spinner
 * @param {string} elementId - ID of element to contain the spinner
 * @param {string} message - Optional message to display
 * @returns {Function} Function to hide the spinner
 */
export function showSpinner(elementId, message = 'Loading...') {
  const container = document.getElementById(elementId);
  if (!container) return () => {};
  
  // Store original content
  const originalContent = container.innerHTML;
  
  // Set loading state
  container.innerHTML = `
    <div class="spinner-container">
      <div class="spinner"></div>
      <p>${message}</p>
    </div>
  `;
  
  // Add styles if not present
  if (!document.getElementById('spinner-styles')) {
    const style = document.createElement('style');
    style.id = 'spinner-styles';
    style.textContent = `
      .spinner-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      
      .spinner {
        border: 4px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top: 4px solid #3b82f6;
        width: 30px;
        height: 30px;
        animation: spin 1s linear infinite;
        margin-bottom: 10px;
      }
      
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Return function to restore original content
  return function hideSpinner() {
    container.innerHTML = originalContent;
  };
}

/**
 * Disable a form during submission
 * @param {string} formId - ID of the form to disable
 * @param {boolean} isDisabled - Whether to disable or enable the form
 */
export function disableForm(formId, isDisabled = true) {
  const form = document.getElementById(formId);
  if (!form) return;
  
  // Get all form elements
  const elements = form.querySelectorAll('input, select, textarea, button');
  
  // Disable/enable all elements
  elements.forEach(element => {
    element.disabled = isDisabled;
  });
}

/**
 * Format date for display
 * @param {Date|Object} date - Date object or Firebase timestamp
 * @param {string} format - Format to use (short, medium, long)
 * @returns {string} Formatted date string
 */
export function formatDate(date, format = 'medium') {
  // Convert Firebase timestamp to Date if needed
  if (date && date.toDate) {
    date = date.toDate();
  } else if (!(date instanceof Date)) {
    date = new Date(date);
  }
  
  // Format options
  const options = {
    short: { month: 'numeric', day: 'numeric', year: '2-digit' },
    medium: { month: 'short', day: 'numeric', year: 'numeric' },
    long: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
  };
  
  try {
    return date.toLocaleDateString('en-US', options[format] || options.medium);
  } catch (error) {
    console.error('Date formatting error:', error);
    return 'Invalid date';
  }
}