// auth-guard.js - Authentication protection for admin pages
document.addEventListener('DOMContentLoaded', () => {
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
        `;
        document.head.appendChild(style);
    }
    
    // Hide the main container until auth check completes
    const container = document.querySelector('.container');
    if (container) {
        container.style.display = 'none';
    }
    
    // Wait for Firebase to be initialized
    const checkFirebase = setInterval(() => {
        if (typeof firebase !== 'undefined' && firebase.auth) {
            clearInterval(checkFirebase);
            
            // Check authentication status
            firebase.auth().onAuthStateChanged(user => {
                if (user) {
                    // User is signed in
                    console.log('User authenticated:', user.email);
                    
                    // Show the main content
                    if (container) {
                        container.style.display = 'block';
                    }
                    
                    // Remove loading overlay
                    if (loadingOverlay) {
                        loadingOverlay.style.display = 'none';
                    }
                } else {
                    // No user is signed in, redirect to login
                    console.warn('User not authenticated, redirecting to login');
                    window.location.href = '/login.html';
                }
            }, error => {
                console.error('Authentication error:', error);
                alert('Authentication error. Please try again later.');
                window.location.href = '/login.html';
            });
        }
    }, 100);
    
    // Set a timeout in case Firebase never initializes
    setTimeout(() => {
        clearInterval(checkFirebase);
        if (typeof firebase === 'undefined' || !firebase.auth) {
            console.error('Firebase not initialized after timeout');
            alert('Error loading authentication. Please refresh the page or try again later.');
        }
    }, 10000); // 10 second timeout
});