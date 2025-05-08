// auth-guard.js - Authentication protection for admin pages
document.addEventListener('DOMContentLoaded', () => {
    console.log('Auth guard initializing...');
    
    // Check for Spotify authentication in progress
    const urlParams = new URLSearchParams(window.location.search);
    const isSpotifyAuth = urlParams.get('spotify_auth') === 'true';
    const isCallbackPage = window.location.pathname.includes('spotify-callback');
    
    // Skip authentication check if this is the Spotify callback page or we're in the middle of auth
    if (isCallbackPage) {
        console.log('Detected Spotify callback page, skipping auth guard');
        return;
    }
    
    // Add a loading overlay if it doesn't exist
    let loadingOverlay = document.getElementById('auth-loading');
    if (!loadingOverlay) {
        loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'auth-loading';
        loadingOverlay.className = 'auth-overlay';
        loadingOverlay.innerHTML = `
            <div class="spinner"></div>
            <p>Verifying access...</p>
        `;
        document.body.appendChild(loadingOverlay);
        
        // Add the necessary styles
        const style = document.createElement('style');
        style.textContent = `
            .auth-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.8);
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                z-index: 1000;
                color: white;
            }
            
            .spinner {
                border: 4px solid rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                border-top: 4px solid #3699ff;
                width: 40px;
                height: 40px;
                animation: spin 1s linear infinite;
                margin-bottom: 15px;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .auth-error {
                background-color: rgba(239, 68, 68, 0.9);
                padding: 15px 20px;
                border-radius: 8px;
                margin-top: 20px;
                max-width: 80%;
                text-align: center;
            }
            
            .auth-btn {
                background-color: #3b82f6;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 6px;
                margin-top: 15px;
                cursor: pointer;
                font-weight: 600;
            }
            
            .auth-btn:hover {
                background-color: #2563eb;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Hide the main container until auth check completes
    const dashboardContainer = document.querySelector('.dashboard');
    const regularContainer = document.querySelector('.container');
    const container = dashboardContainer || regularContainer;
    
    if (container) {
        container.style.display = 'none';
    }
    
    // Store original page URL before any redirects
    try {
        // Don't override if already set (from a previous redirect)
        if (!sessionStorage.getItem('original_page_url')) {
            sessionStorage.setItem('original_page_url', window.location.href);
        }
    } catch (e) {
        console.warn('Unable to store original page URL:', e);
    }
    
    // Helper for safe token storage
    function saveTokenToStorages(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            console.warn('Error saving to localStorage:', e);
        }
        
        try {
            sessionStorage.setItem(key, value);
        } catch (e) {
            console.warn('Error saving to sessionStorage:', e);
        }
    }
    
    // Helper to get token from either storage
    function getTokenFromStorages(key) {
        // Try localStorage first
        let value = null;
        try {
            value = localStorage.getItem(key);
            if (value) return value;
        } catch (e) {
            console.warn('Error reading from localStorage:', e);
        }
        
        // Try sessionStorage as fallback
        try {
            value = sessionStorage.getItem(key);
            return value;
        } catch (e) {
            console.warn('Error reading from sessionStorage:', e);
        }
        
        return null;
    }
    
    // Check for Spotify auth in progress to avoid interrupting it
    const spotifyRedirected = getTokenFromStorages('redirected_from_spotify') === 'true';
    const spotifyAuthTimestamp = getTokenFromStorages('spotify_auth_timestamp');
    let isRecentSpotifyAuth = false;
    
    if (spotifyAuthTimestamp) {
        const now = Date.now();
        const timestamp = parseInt(spotifyAuthTimestamp);
        isRecentSpotifyAuth = !isNaN(timestamp) && (now - timestamp < 60000); // Within last minute
    }
    
    // If we're in the middle of Spotify auth or just returned, temporarily skip auth check
    if (isSpotifyAuth || spotifyRedirected || isRecentSpotifyAuth) {
        console.log('Spotify authentication in progress, temporarily bypassing auth guard');
        
        if (loadingOverlay) {
            loadingOverlay.innerHTML = `
                <div class="spinner"></div>
                <p>Completing Spotify authentication...</p>
            `;
        }
        
        // Give a grace period for auth to complete, then resume normal auth flow
        setTimeout(() => {
            if (container) {
                container.style.display = 'block';
            }
            
            if (loadingOverlay) {
                loadingOverlay.style.display = 'none';
            }
        }, 2000);
        
        return;
    }
    
    // Check for cached auth state first for faster loading
    const cachedUser = getTokenFromStorages('auth_user');
    if (cachedUser) {
        console.log('Found cached authentication, showing content while verifying...');
        // Show content immediately, but still verify auth in the background
        if (container) {
            container.style.display = 'block';
        }
        
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    }
    
    let authCheckTimeout = null;
    let authCheckInterval = null;
    
    // Function to update the loading overlay with an error
    function showAuthError(message) {
        if (!loadingOverlay) return;
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'auth-error';
        errorDiv.textContent = message;
        
        const retryButton = document.createElement('button');
        retryButton.className = 'auth-btn';
        retryButton.textContent = 'Retry';
        retryButton.addEventListener('click', () => {
            window.location.reload();
        });
        
        loadingOverlay.innerHTML = '';
        loadingOverlay.appendChild(errorDiv);
        loadingOverlay.appendChild(retryButton);
    }
    
    // Wait for Firebase to be initialized with retry mechanism
    let retries = 0;
    const MAX_RETRIES = 3;
    
    function checkFirebaseAuth() {
        if (typeof firebase !== 'undefined' && firebase.auth) {
            clearInterval(authCheckInterval);
            clearTimeout(authCheckTimeout);
            
            // Check authentication status
            firebase.auth().onAuthStateChanged(user => {
                if (user) {
                    // User is signed in
                    console.log('User authenticated:', user.email);
                    
                    // Cache auth state for quicker loading next time
                    saveTokenToStorages('auth_user', JSON.stringify({
                        email: user.email,
                        uid: user.uid,
                        timestamp: Date.now()
                    }));
                    
                    // Show the main content
                    if (container) {
                        container.style.display = 'block';
                    }
                    
                    // Remove loading overlay
                    if (loadingOverlay) {
                        loadingOverlay.style.display = 'none';
                    }
                } else {
                    // Check if we have a cached user that might still be valid
                    const cachedUserData = getTokenFromStorages('auth_user');
                    if (cachedUserData) {
                        try {
                            const userData = JSON.parse(cachedUserData);
                            const timestamp = userData.timestamp || 0;
                            const now = Date.now();
                            
                            // If cache is less than 1 hour old, give them a chance to reauth
                            if (now - timestamp < 3600000) {
                                console.warn('Cached auth expired, showing content with auth warning');
                                
                                // Show a toast warning if available
                                if (window.showToast) {
                                    window.showToast('Your session has expired. Please refresh to login again.', 'warning', 10000);
                                }
                                
                                if (container) {
                                    container.style.display = 'block';
                                }
                                
                                if (loadingOverlay) {
                                    loadingOverlay.style.display = 'none';
                                }
                                return;
                            }
                        } catch (e) {
                            console.error('Error parsing cached user data:', e);
                        }
                    }
                    
                    // No user is signed in, redirect to login
                    console.warn('User not authenticated, redirecting to login');
                    
                    // Save current location for redirect back after login
                    try {
                        sessionStorage.setItem('auth_redirect', window.location.href);
                    } catch (e) {
                        console.warn('Unable to save redirect URL:', e);
                    }
                    
                    // Determine the right login URL
                    let loginUrl = '/login.html';
                    
                    // If we're in the beach trivia pages, adjust the path
                    if (window.location.pathname.includes('/beachTriviaPages/')) {
                        loginUrl = window.location.pathname.split('/beachTriviaPages/')[0] + '/login.html';
                    }
                    
                    window.location.href = loginUrl;
                }
            }, error => {
                console.error('Authentication error:', error);
                
                // Check if there's a network error
                if (error.code === 'auth/network-request-failed') {
                    showAuthError('Network error. Please check your connection and try again.');
                } else {
                    showAuthError('Authentication error. Please try again later.');
                }
                
                // Don't redirect on error to avoid redirect loops
                if (container) {
                    container.style.display = 'block';
                }
            });
        } else {
            retries++;
            console.warn(`Firebase Auth not available yet (attempt ${retries}/${MAX_RETRIES})`);
            
            if (retries >= MAX_RETRIES) {
                clearInterval(authCheckInterval);
                clearTimeout(authCheckTimeout);
                
                // Try to dynamically load Firebase if needed
                if (typeof firebase === 'undefined') {
                    console.warn('Attempting to load Firebase dynamically');
                    loadFirebaseDynamically();
                } else if (!firebase.auth) {
                    console.warn('Attempting to load Firebase Auth dynamically');
                    loadFirebaseAuthDynamically();
                } else {
                    console.error('Firebase initialized but auth module still not available');
                    showAuthError('Error loading authentication services. Please refresh the page.');
                    
                    // Show content anyway as fallback
                    if (container) {
                        container.style.display = 'block';
                    }
                }
            }
        }
    }
    
    // Try to dynamically load Firebase if it fails to load normally
    function loadFirebaseDynamically() {
        // Create script element for Firebase App
        const appScript = document.createElement('script');
        appScript.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js';
        appScript.onload = () => {
            console.log('Firebase App loaded dynamically');
            // Load Auth next
            loadFirebaseAuthDynamically();
        };
        appScript.onerror = () => {
            console.error('Failed to load Firebase App dynamically');
            showAuthError('Failed to load authentication services. Please check your connection.');
            
            // Show content anyway as fallback
            if (container) {
                container.style.display = 'block';
            }
        };
        document.head.appendChild(appScript);
    }
    
    // Load Firebase Auth dynamically
    function loadFirebaseAuthDynamically() {
        const authScript = document.createElement('script');
        authScript.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js';
        authScript.onload = () => {
            console.log('Firebase Auth loaded dynamically');
            
            // Also load Firebase config if needed
            if (!firebase.apps.length) {
                // Check for firebase-init.js
                const configScript = document.createElement('script');
                configScript.src = '../firebase-init.js';
                configScript.onload = () => {
                    console.log('Firebase config loaded dynamically');
                    // Retry auth check after a delay
                    setTimeout(checkFirebaseAuth, 1000);
                };
                configScript.onerror = () => {
                    console.error('Failed to load Firebase config dynamically');
                    showAuthError('Failed to load authentication configuration. Please refresh the page.');
                };
                document.head.appendChild(configScript);
            } else {
                // Retry auth check after a delay
                setTimeout(checkFirebaseAuth, 1000);
            }
        };
        authScript.onerror = () => {
            console.error('Failed to load Firebase Auth dynamically');
            showAuthError('Failed to load authentication services. Please check your connection.');
            
            // Show content anyway as fallback
            if (container) {
                container.style.display = 'block';
            }
        };
        document.head.appendChild(authScript);
    }
    
    // Start checking for Firebase auth
    authCheckInterval = setInterval(checkFirebaseAuth, 500);
    
    // Set a timeout in case Firebase never initializes
    authCheckTimeout = setTimeout(() => {
        clearInterval(authCheckInterval);
        console.error('Firebase not initialized after timeout');
        
        // Try dynamic loading as a last resort
        if (typeof firebase === 'undefined') {
            loadFirebaseDynamically();
        } else {
            showAuthError('Authentication services not ready. Please refresh the page.');
            
            // Show content anyway as fallback after timeout
            if (container) {
                container.style.display = 'block';
            }
            
            if (loadingOverlay) {
                // Keep overlay visible but add a retry button
                const retryButton = document.createElement('button');
                retryButton.className = 'auth-btn';
                retryButton.textContent = 'Retry';
                retryButton.addEventListener('click', () => {
                    window.location.reload();
                });
                
                loadingOverlay.appendChild(retryButton);
            }
        }
    }, 10000); // 10 second timeout
});