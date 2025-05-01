// Host Music Bingo Dashboard JavaScript

// Global variables
let currentUser = null;
let playlistsData = [];
let currentGame = null;
let gameInterval = null;

// Document ready function
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    initializeAuth();
    
    // Set up event listeners
    setupEventListeners();
});

// Initialize authentication
function initializeAuth() {
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
        } else {
            // User is not signed in, redirect to login
            console.log('No user signed in, redirecting to login');
            window.location.href = '../login.html';
        }
    });
}

// Update user display
function updateUserDisplay(user) {
    const hostNameElement = document.getElementById('host-name');
    if (!hostNameElement) return;
    
    // Try to get display name or email
    let displayName = user.displayName || user.email || 'Host';
    
    // Update the UI
    hostNameElement.textContent = displayName;
}

// Set up event listeners
function setupEventListeners() {
    // Create game button
    const createGameBtn = document.getElementById('create-game-btn');
    if (createGameBtn) {
        createGameBtn.addEventListener('click', createNewGame);
    }
    
    // Copy URL button
    const copyUrlBtn = document.getElementById('copy-url-btn');
    if (copyUrlBtn) {
        copyUrlBtn.addEventListener('click', copyJoinUrl);
    }
    
    // Game control buttons
    const playBtn = document.getElementById('play-song-btn');
    if (playBtn) {
        playBtn.addEventListener('click', playCurrentSong);
    }
    
    const nextBtn = document.getElementById('next-song-btn');
    if (nextBtn) {
        nextBtn.addEventListener('click', playNextSong);
    }
    
    const pauseBtn = document.getElementById('pause-game-btn');
    if (pauseBtn) {
        pauseBtn.addEventListener('click', pauseGame);
    }
    
    const resumeBtn = document.getElementById('resume-game-btn');
    if (resumeBtn) {
        resumeBtn.addEventListener('click', resumeGame);
    }
    
    const endBtn = document.getElementById('end-game-btn');
    if (endBtn) {
        endBtn.addEventListener('click', endGame);
    }
}

// Load playlists from Firestore
async function loadPlaylists() {
    const playlistSelect = document.getElementById('playlist-select');
    if (!playlistSelect) return;
    
    try {
        // Show loading state
        playlistSelect.innerHTML = '<option value="" disabled selected>Loading playlists...</option>';
        
        // Get playlists from Firestore using the music_bingo collection
        const db = firebase.firestore();
        const playlistsRef = db.collection('music_bingo');
        const snapshot = await playlistsRef.get();
        
        if (snapshot.empty) {
            console.log('No playlists found');
            playlistSelect.innerHTML = '<option value="" disabled selected>No playlists available</option>';
            return;
        }
        
        // Clear the select and add the default option
        playlistSelect.innerHTML = '<option value="" disabled selected>Select a playlist</option>';
        
        // Store playlists data globally and populate dropdown
        playlistsData = [];
        snapshot.forEach(doc => {
            const playlistData = doc.data();
            const playlist = {
                id: doc.id,
                ...playlistData,
                // Use playlistTitle field if available, fallback to a default name
                name: playlistData.playlistTitle || `Playlist ${doc.id}`
            };
            
            playlistsData.push(playlist);
            
            // Create option element
            const option = document.createElement('option');
            option.value = playlist.id;
            option.textContent = playlist.name;
            playlistSelect.appendChild(option);
        });
        
        console.log(`Loaded ${playlistsData.length} playlists`);
        
    } catch (error) {
        console.error('Error loading playlists:', error);
        playlistSelect.innerHTML = '<option value="" disabled selected>Error loading playlists</option>';
    }
}

// Load game history from Firestore
async function loadGameHistory() {
    const historyList = document.getElementById('game-history-list');
    if (!historyList) return;
    
    try {
        // Show loading state
        historyList.innerHTML = '<p class="loading">Loading recent games...</p>';
        
        // Get games from Firestore
        const db = firebase.firestore();
        const gamesRef = db.collection('games');
        const snapshot = await gamesRef
            .where('hostId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .limit(10)
            .get();
        
        if (snapshot.empty) {
            console.log('No games found');
            historyList.innerHTML = '<p class="empty-state">No recent games found</p>';
            return;
        }
        
        // Clear the history list
        historyList.innerHTML = '';
        
        // Add each game to the list
        snapshot.forEach(doc => {
            const game = {
                id: doc.id,
                ...doc.data()
            };
            
            // Format date
            const gameDate = game.createdAt ? new Date(game.createdAt.toDate()) : new Date();
            const formattedDate = gameDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
            
            // Create history item
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.innerHTML = `
                <h4 class="history-name">${game.name || 'Unnamed Game'}</h4>
                <div class="history-details">
                    <span>Date: ${formattedDate}</span>
                    <span>Players: ${game.playerCount || 0}</span>
                </div>
                <div class="history-details">
                    <span>Playlist: ${game.playlistName || 'Unknown'}</span>
                    <span>Status: ${game.status || 'Completed'}</span>
                </div>
                <div class="history-buttons">
                    <button class="secondary-btn restart-game" data-game-id="${game.id}">Restart</button>
                </div>
            `;
            
            historyList.appendChild(historyItem);
            
            // Add event listener to restart button
            const restartBtn = historyItem.querySelector('.restart-game');
            if (restartBtn) {
                restartBtn.addEventListener('click', () => restartGame(game.id));
            }
        });
        
    } catch (error) {
        console.error('Error loading game history:', error);
        historyList.innerHTML = '<p class="empty-state">Error loading game history</p>';
    }
}

// Create a new game
async function createNewGame() {
    // Get form values
    const playlistSelect = document.getElementById('playlist-select');
    const gameNameInput = document.getElementById('game-name');
    const playerLimitInput = document.getElementById('player-limit');
    
    // Validate playlist selection
    const playlistId = playlistSelect.value;
    if (!playlistId) {
        alert('Please select a playlist first');
        return;
    }
    
    // Get other values
    const gameName = gameNameInput.value.trim() || 'Music Bingo Game';
    const playerLimit = playerLimitInput.value ? parseInt(playerLimitInput.value) : null;
    
    try {
        // Create a new game in Firestore
        const db = firebase.firestore();
        const gamesRef = db.collection('games');
        
        // Find the selected playlist
        const selectedPlaylist = playlistsData.find(p => p.id === playlistId);
        
        // Create the game object
        const newGame = {
            hostId: currentUser.uid,
            playlistId: playlistId,
            playlistName: selectedPlaylist ? selectedPlaylist.name : 'Unknown Playlist',
            name: gameName,
            playerLimit: playerLimit,
            status: 'active',
            playerCount: 0,
            currentSongIndex: -1, // No song playing initially
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Show loading state
        document.getElementById('create-game-btn').disabled = true;
        document.getElementById('create-game-btn').textContent = 'Creating Game...';
        
        // Add to Firestore
        const gameDoc = await gamesRef.add(newGame);
        
        console.log('Game created with ID:', gameDoc.id);
        
        // Also save to Realtime Database for real-time sync
        const database = firebase.database();
        const rtGameData = {
            hostId: currentUser.uid,
            playlistId: playlistId,
            name: gameName,
            status: 'active',
            playerCount: 0,
            currentSongIndex: -1,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        };
        
        // Save to Realtime Database
        await database.ref('games/' + gameDoc.id).set(rtGameData);
        console.log('Game also saved to Realtime Database');
        
        // Set current game
        currentGame = {
            id: gameDoc.id,
            ...newGame
        };
        
        // Update UI for active game
        updateActiveGameUI();
        
        // Generate QR code
        generateQRCode(gameDoc.id);
        
        // Start game update interval
        startGameUpdateInterval();
        
        // Refresh game history
        loadGameHistory();
        
    } catch (error) {
        console.error('Error creating game:', error);
        alert('Error creating game: ' + error.message);
        
        // Reset button
        document.getElementById('create-game-btn').disabled = false;
        document.getElementById('create-game-btn').textContent = 'Start New Game';
    }
}

// Update UI for active game
function updateActiveGameUI() {
    if (!currentGame) return;
    
    // Show active game section
    document.getElementById('game-section').classList.remove('hidden');
    
    // Update game info
    document.getElementById('current-game-name').textContent = currentGame.name;
    document.getElementById('current-playlist').textContent = currentGame.playlistName;
    document.getElementById('game-id').textContent = currentGame.id;
    document.getElementById('player-count').textContent = currentGame.playerCount || 0;
    
    // Reset song display
    document.getElementById('current-song').textContent = 'Not started';
}

// Generate QR code for game
function generateQRCode(gameId) {
    const qrcodeElement = document.getElementById('qrcode');
    if (!qrcodeElement) return;
    
    // Clear previous QR code
    qrcodeElement.innerHTML = '';
    
    // Create the join URL - hardcoded to the public-facing folder
    const joinUrl = 'https://mybeachtrivia.com/play-music-bingo/index.html?gameId=' + gameId;
    
    // Update URL display
    document.getElementById('join-url').textContent = joinUrl;
    
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

// Copy join URL to clipboard
function copyJoinUrl() {
    const joinUrl = document.getElementById('join-url').textContent;
    
    // Use Clipboard API if available
    if (navigator.clipboard) {
        navigator.clipboard.writeText(joinUrl)
            .then(() => {
                // Show temporary success message
                const copyBtn = document.getElementById('copy-url-btn');
                const originalText = copyBtn.textContent;
                copyBtn.textContent = 'Copied!';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 2000);
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
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
            copyBtn.textContent = originalText;
        }, 2000);
    }
}

// Start game update interval
function startGameUpdateInterval() {
    // Clear any existing interval
    clearInterval(gameInterval);
    
    // Set up a new interval to check for game updates
    gameInterval = setInterval(async () => {
        if (!currentGame) return;
        
        try {
            // Get the latest game data
            const db = firebase.firestore();
            const gameRef = db.collection('games').doc(currentGame.id);
            const gameDoc = await gameRef.get();
            
            if (!gameDoc.exists) {
                console.log('Game no longer exists');
                endGame();
                return;
            }
            
            // Update current game data
            currentGame = {
                id: gameDoc.id,
                ...gameDoc.data()
            };
            
            // Update player count
            document.getElementById('player-count').textContent = currentGame.playerCount || 0;
            
            // Update current song if changed
            if (currentGame.currentSongIndex >= 0) {
                updateCurrentSongDisplay(currentGame.currentSongIndex);
            }
            
            // Check if game has ended
            if (currentGame.status === 'ended') {
                endGame();
            }
            
        } catch (error) {
            console.error('Error updating game data:', error);
        }
    }, 5000); // Check for updates every 5 seconds
}

// Play current song
async function playCurrentSong() {
    if (!currentGame) return;
    
    try {
        // Get the selected playlist
        const selectedPlaylist = playlistsData.find(p => p.id === currentGame.playlistId);
        if (!selectedPlaylist) {
            alert('Playlist not found');
            return;
        }
        
        // If there's no current song, start with the first one
        let songIndex = currentGame.currentSongIndex;
        if (songIndex < 0) {
            songIndex = 0;
        }
        
        // Count how many songs are in the playlist by looking for artist1, artist2, etc.
        let songCount = 0;
        for (let i = 1; i <= 25; i++) { // Assuming maximum 25 songs in a playlist
            if (selectedPlaylist[`artist${i}`]) {
                songCount++;
            } else {
                break;
            }
        }
        
        // Make sure the index is valid
        if (songIndex >= songCount) {
            alert('All songs have been played');
            return;
        }
        
        // Update the current song in Firestore
        const db = firebase.firestore();
        await db.collection('games').doc(currentGame.id).update({
            currentSongIndex: songIndex,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Also update in Realtime Database
        const database = firebase.database();
        await database.ref('games/' + currentGame.id).update({
            currentSongIndex: songIndex,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Update local state
        currentGame.currentSongIndex = songIndex;
        
        // Update UI
        updateCurrentSongDisplay(songIndex);
        
        // Here you would actually play the song
        const songArtistKey = `artist${songIndex + 1}`;
        const songTitleKey = `song${songIndex + 1}`;
        console.log('Playing song:', `${selectedPlaylist[songTitleKey]} - ${selectedPlaylist[songArtistKey]}`);
        
    } catch (error) {
        console.error('Error playing song:', error);
        alert('Error playing song: ' + error.message);
    }
}

// Play next song
async function playNextSong() {
    if (!currentGame) return;
    
    try {
        // Get the selected playlist
        const selectedPlaylist = playlistsData.find(p => p.id === currentGame.playlistId);
        if (!selectedPlaylist) {
            alert('Playlist not found');
            return;
        }
        
        // Calculate next song index
        let nextIndex = currentGame.currentSongIndex + 1;
        
        // Count how many songs are in the playlist by looking for artist1, artist2, etc.
        let songCount = 0;
        for (let i = 1; i <= 25; i++) { // Assuming maximum 25 songs in a playlist
            if (selectedPlaylist[`artist${i}`]) {
                songCount++;
            } else {
                break;
            }
        }
        
        // Check if we've reached the end
        if (nextIndex >= songCount) {
            alert('This was the last song in the playlist');
            return;
        }
        
        // Update the current song in Firestore
        const db = firebase.firestore();
        await db.collection('games').doc(currentGame.id).update({
            currentSongIndex: nextIndex,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Also update in Realtime Database
        const database = firebase.database();
        await database.ref('games/' + currentGame.id).update({
            currentSongIndex: nextIndex,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Update local state
        currentGame.currentSongIndex = nextIndex;
        
        // Update UI
        updateCurrentSongDisplay(nextIndex);
        
        // Here you would actually play the song
        const songArtistKey = `artist${nextIndex + 1}`;
        const songTitleKey = `song${nextIndex + 1}`;
        console.log('Playing next song:', `${selectedPlaylist[songTitleKey]} - ${selectedPlaylist[songArtistKey]}`);
        
    } catch (error) {
        console.error('Error playing next song:', error);
        alert('Error playing next song: ' + error.message);
    }
}

// Update current song display
function updateCurrentSongDisplay(songIndex) {
    if (!currentGame) return;
    
    const currentSongElement = document.getElementById('current-song');
    if (!currentSongElement) return;
    
    // Get the selected playlist
    const selectedPlaylist = playlistsData.find(p => p.id === currentGame.playlistId);
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
}

// Pause the game
async function pauseGame() {
    if (!currentGame) return;
    
    try {
        // Update game status in Firestore
        const db = firebase.firestore();
        await db.collection('games').doc(currentGame.id).update({
            status: 'paused',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Also update in Realtime Database
        const database = firebase.database();
        await database.ref('games/' + currentGame.id).update({
            status: 'paused',
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Update local state
        currentGame.status = 'paused';
        
        // Show message
        alert('Game paused. Players will not be able to mark new squares until you resume.');
        
    } catch (error) {
        console.error('Error pausing game:', error);
        alert('Error pausing game: ' + error.message);
    }
}

// Resume the game
async function resumeGame() {
    if (!currentGame) return;
    
    try {
        // Update game status in Firestore
        const db = firebase.firestore();
        await db.collection('games').doc(currentGame.id).update({
            status: 'active',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Also update in Realtime Database
        const database = firebase.database();
        await database.ref('games/' + currentGame.id).update({
            status: 'active',
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Update local state
        currentGame.status = 'active';
        
        // Show message
        alert('Game resumed. Players can now continue playing.');
        
    } catch (error) {
        console.error('Error resuming game:', error);
        alert('Error resuming game: ' + error.message);
    }
}

// End the game
async function endGame() {
    if (!currentGame) {
        // Just hide the game section if there's no active game
        document.getElementById('game-section').classList.add('hidden');
        return;
    }
    
    try {
        // Confirm with the user
        if (currentGame.status !== 'ended' && !confirm('Are you sure you want to end this game? Players will no longer be able to join or play.')) {
            return;
        }
        
        // Update game status in Firestore
        const db = firebase.firestore();
        await db.collection('games').doc(currentGame.id).update({
            status: 'ended',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Also update in Realtime Database
        const database = firebase.database();
        await database.ref('games/' + currentGame.id).update({
            status: 'ended',
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Clear the current game
        currentGame = null;
        
        // Clear the update interval
        clearInterval(gameInterval);
        
        // Hide the game section
        document.getElementById('game-section').classList.add('hidden');
        
        // Reset the form
        document.getElementById('playlist-select').value = '';
        document.getElementById('game-name').value = '';
        document.getElementById('player-limit').value = '';
        
        // Enable the create button
        document.getElementById('create-game-btn').disabled = false;
        document.getElementById('create-game-btn').textContent = 'Start New Game';
        
        // Reload game history
        loadGameHistory();
        
    } catch (error) {
        console.error('Error ending game:', error);
        alert('Error ending game: ' + error.message);
    }
}

// Restart a previous game
async function restartGame(gameId) {
    try {
        // Get the game data
        const db = firebase.firestore();
        const gameDoc = await db.collection('games').doc(gameId).get();
        
        if (!gameDoc.exists) {
            alert('Game not found');
            return;
        }
        
        const game = gameDoc.data();
        
        // Confirm with the user
        if (!confirm(`Restart game "${game.name}"? This will create a new game with the same playlist.`)) {
            return;
        }
        
        // Create a new game with the same playlist
        document.getElementById('playlist-select').value = game.playlistId;
        document.getElementById('game-name').value = game.name;
        
        // Click the create button
        createNewGame();
        
    } catch (error) {
        console.error('Error restarting game:', error);
        alert('Error restarting game: ' + error.message);
    }
}