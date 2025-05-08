// Firebase configuration  
const firebaseConfig = {
    apiKey: "AIzaSyDBKCotY1F943DKfVQqKOGPPkAkQe2Zgog",
    authDomain: "beach-trivia-website.firebaseapp.com",
    databaseURL: "https://beach-trivia-website-default-rtdb.firebaseio.com",
    projectId: "beach-trivia-website",
    storageBucket: "beach-trivia-website.firebasestorage.app",
    messagingSenderId: "459479368322",
    appId: "1:459479368322:web:7bd3d080d3b9e77610aa9b",
    measurementId: "G-24MQRKKDNY"
};

// Create global flags to track Firebase initialization status
window.firebaseInitialized = false;
window.firebaseDatabaseAvailable = false;

// Function to dynamically load Firebase Database if needed
function loadFirebaseDatabase() {
    return new Promise((resolve, reject) => {
        if (typeof firebase !== 'undefined' && typeof firebase.database === 'function') {
            console.log('Firebase Database already available');
            window.firebaseDatabaseAvailable = true;
            resolve(true);
            return;
        }
        
        console.log('Attempting to dynamically load Firebase Database...');
        const script = document.createElement('script');
        script.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js';
        script.onload = () => {
            console.log('Firebase Database module loaded dynamically');
            window.firebaseDatabaseAvailable = true;
            resolve(true);
        };
        script.onerror = (error) => {
            console.error('Failed to load Firebase Database module:', error);
            reject(error);
        };
        document.head.appendChild(script);
    });
}

// Initialize Firebase
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        console.log("Firebase newly initialized with config:", firebaseConfig);
    } else {
        // Get the existing initialized app
        firebase.app();
        console.log("Using existing Firebase app");
    }
    
    window.firebaseInitialized = true;
    
    // Check if database module is available
    if (typeof firebase.database === 'undefined') {
        console.warn('Firebase Database module not loaded. Attempting to load it now...');
        
        // Try to load the database module dynamically
        loadFirebaseDatabase()
            .then(() => {
                console.log("Firebase Database now available");
                // Publish an event that other scripts can listen for
                document.dispatchEvent(new CustomEvent('firebase-database-ready'));
            })
            .catch(error => {
                console.error("Firebase Database failed to load:", error);
                
                // Set localStorage flag for other pages to detect
                localStorage.setItem('firebase-database-error', 'true');
                
                // Try one last fallback for child pages
                if (window.location.pathname.includes('host-music-bingo')) {
                    alert("Important components failed to load. Please return to the dashboard and try again.");
                }
            });
    } else {
        window.firebaseDatabaseAvailable = true;
        console.log("Firebase Database module already loaded");
        
        // Publish ready event
        document.dispatchEvent(new CustomEvent('firebase-database-ready'));
        
        // Clear any previous error flags
        localStorage.removeItem('firebase-database-error');
    }
} catch (error) {
    console.error("Firebase initialization error:", error);
    window.firebaseInitialized = false;
    window.firebaseInitError = error.message;
    
    // Set localStorage flag for other pages to detect
    localStorage.setItem('firebase-init-error', error.message);
}

// Extended debug information
console.log("Firebase initialization status:", {
    initialized: window.firebaseInitialized,
    appsLength: firebase.apps.length,
    databaseAvailable: window.firebaseDatabaseAvailable,
    authAvailable: typeof firebase.auth === 'function',
    firestoreAvailable: typeof firebase.firestore === 'function',
    analyticsAvailable: typeof firebase.analytics === 'function'
});

// Check database connection if available
if (window.firebaseDatabaseAvailable) {
    try {
        const connectedRef = firebase.database().ref(".info/connected");
        connectedRef.on("value", (snap) => {
            if (snap.val() === true) {
                console.log("Connected to Firebase Realtime Database");
            } else {
                console.warn("Not connected to Firebase Realtime Database");
            }
        });
    } catch (e) {
        console.error("Error checking database connection:", e);
    }
}