// Check if Firebase is already initialized from firebase-init.js
if (typeof firebase === 'undefined' || !firebase.apps.length) {
    console.error('Firebase not initialized. Please check firebase-init.js is loading correctly.');
    // Fall back to sample data if Firebase isn't available
    setTimeout(() => {
        initializeGameWithSampleData();
    }, 100);
} else {
    console.log('Firebase already initialized, initializing game...');
    // Firebase already loaded, initialize the game
    initializeGame();
}

// Global game variables
let gameData = null;
let playlistData = null;
let currentSongIndex = -1;

// Utility function to get URL parameters
function getUrlParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    const value = urlParams.get(name);
    console.log(`Getting URL parameter '${name}': ${value}`);
    return value;
}

// The main game initialization function
async function initializeGame() {
    try {
        console.log('Starting game initialization...');
        
        // Get game ID from URL
        const gameId = getUrlParameter('gameId');
        
        if (!gameId) {
            console.log('No game ID provided, using sample data');
            initializeGameWithSampleData();
            return;
        }
        
        console.log('Initializing game with ID:', gameId);
        
        // Get Firebase Firestore instance
        const db = firebase.firestore();
        console.log('Firebase Firestore instance obtained');
        
        // Get game data
        const gameDoc = await db.collection('games').doc(gameId).get();
        
        if (!gameDoc.exists) {
            console.error('Game not found:', gameId);
            alert('Game not found. Please check your link and try again.');
            initializeGameWithSampleData();
            return;
        }
        
        // Get game data
        gameData = {
            id: gameDoc.id,
            ...gameDoc.data()
        };
        
        console.log('Game data loaded:', gameData);
        
        // Update game title
        updateGameTitle(gameData.name || 'Music Bingo');
        
        // Get playlist data
        const playlistDoc = await db.collection('music_bingo').doc(gameData.playlistId).get();
        
        if (!playlistDoc.exists) {
            console.error('Playlist not found:', gameData.playlistId);
            alert('Playlist not found. Please check with the game host.');
            initializeGameWithSampleData();
            return;
        }
        
        // Get playlist data
        playlistData = {
            id: playlistDoc.id,
            ...playlistDoc.data()
        };
        
        console.log('Playlist data loaded:', playlistData);
        
        // Extract songs and artists from playlist data
        const extractedSongs = [];
        const extractedArtists = [];
        
        // Loop through potential song and artist fields (assuming they're named song1, artist1, etc.)
        for (let i = 1; i <= 25; i++) {
            const songKey = `song${i}`;
            const artistKey = `artist${i}`;
            
            if (playlistData[songKey] && playlistData[artistKey]) {
                extractedSongs.push(playlistData[songKey]);
                extractedArtists.push(playlistData[artistKey]);
            }
        }
        
        console.log(`Extracted ${extractedSongs.length} songs and ${extractedArtists.length} artists`);
        
        // Update current song index from game data
        currentSongIndex = gameData.currentSongIndex || -1;
        console.log('Current song index:', currentSongIndex);
        
        // Initialize boards with actual data
        initializeBoards(extractedSongs, extractedArtists);
        
        // Set up real-time updates for this game
        setupGameUpdates(gameId);
        
        // Join this game as a player
        joinGame(gameId);
        
    } catch (error) {
        console.error('Error initializing game:', error);
        alert('Error loading game data. Using sample data instead.');
        initializeGameWithSampleData();
    }
}

// Initialize with sample data if no game ID or Firebase fails
function initializeGameWithSampleData() {
    console.log('Initializing with sample data...');
    
    // Sample song and artist list
    const sampleSongs = [
        "Oh, Pretty Woman", 
        "California Dreamin'", 
        "I'm a Believer", 
        "Mr. Tambourine Man", 
        "Good Vibration", 
        "Happy Together", 
        "Mrs. Robinson", 
        "House Of The Rising Sun", 
        "Somebody to Love",
        "Brown Eyed Girl", 
        "I Got You Babe", 
        "The Locomotion",
        "Do Wah Diddy", 
        "Sugar, Sugar", 
        "Blue Moon"
    ];

    const sampleArtists = [
        "Roy Orbison", 
        "The Mamas & The Papas", 
        "The Monkees", 
        "The Byrds", 
        "The Beach Boys", 
        "The Turtles", 
        "Simon & Garfunkel", 
        "The Animals", 
        "Jefferson Airplane",
        "Van Morrison", 
        "Sonny & Cher", 
        "Little Eva",
        "Manfred Mann", 
        "The Archies", 
        "The Marcels"
    ];
    
    // Initialize boards with sample data
    initializeBoards(sampleSongs, sampleArtists);
}

// Update the game title
function updateGameTitle(title) {
    console.log('Updating game title to:', title);
    const titleElement = document.querySelector('.game-title');
    if (titleElement) {
        titleElement.textContent = title;
    }
}

// Set up real-time updates for the game - Updated to use both Firestore and Realtime Database
function setupGameUpdates(gameId) {
    try {
        console.log('Setting up real-time updates for game:', gameId);
        
        // Set up Firestore updates
        const db = firebase.firestore();
        const unsubscribeFirestore = db.collection('games').doc(gameId)
            .onSnapshot((doc) => {
                if (doc.exists) {
                    console.log('Received Firestore game update:', doc.data());
                    // Update game data from Firestore
                    handleGameUpdate(doc.id, doc.data());
                } else {
                    console.error('Game document no longer exists in Firestore');
                }
            }, (error) => {
                console.error('Error listening for Firestore game updates:', error);
            });
            
        // Set up Realtime Database updates
        try {
            const database = firebase.database();
            console.log('Firebase database reference created:', typeof database);
            
            const gameRef = database.ref('games/' + gameId);
            console.log('Realtime Database reference created for path:', 'games/' + gameId);
            
            gameRef.on('value', (snapshot) => {
                console.log('Realtime Database snapshot received:', snapshot.exists());
                if (snapshot.exists()) {
                    console.log('Received Realtime Database game update:', snapshot.val());
                    // Update game data from Realtime Database
                    handleGameUpdate(gameId, snapshot.val());
                } else {
                    console.log('No data available in Realtime Database for game:', gameId);
                }
            }, (error) => {
                console.error('Error listening for Realtime Database updates:', error);
            });
        } catch (dbError) {
            console.error('Error setting up Realtime Database listener:', dbError);
            console.log('Continuing with only Firestore updates');
        }
        
        // Helper function to process updates from either source
        function handleGameUpdate(id, data) {
            const updatedGame = {
                id: id,
                ...data
            };
            
            // Update game data
            gameData = updatedGame;
            
            // Check if the current song has changed
            if (updatedGame.currentSongIndex !== currentSongIndex) {
                console.log(`Current song index changed from ${currentSongIndex} to ${updatedGame.currentSongIndex}`);
                currentSongIndex = updatedGame.currentSongIndex;
                
                // If there's a current song playing, show it to the player
                if (currentSongIndex >= 0) {
                    showCurrentSong(currentSongIndex);
                }
            }
            
            // Check if game has ended
            if (updatedGame.status === 'ended') {
                console.log('Game has ended');
                alert('This game has ended. Thank you for playing!');
                
                // Stop listening for updates from Firestore
                if (unsubscribeFirestore) {
                    unsubscribeFirestore();
                }
                
                // Stop listening for updates from Realtime Database
                try {
                    if (firebase.database && gameRef) {
                        gameRef.off();
                    }
                } catch (error) {
                    console.error('Error when stopping Realtime Database listener:', error);
                }
            }
        }
            
    } catch (error) {
        console.error('Error setting up game updates:', error);
    }
}

// Show the current song being played
function showCurrentSong(songIndex) {
    console.log('showCurrentSong called with index:', songIndex);
    
    if (!playlistData) {
        console.error('playlistData is not available!');
        return;
    }
    
    // Get song and artist based on index
    const songKey = `song${songIndex + 1}`;
    const artistKey = `artist${songIndex + 1}`;
    
    console.log(`Looking for song with keys: ${songKey}, ${artistKey}`);
    
    if (playlistData[songKey] && playlistData[artistKey]) {
        console.log(`Found song: ${playlistData[songKey]} - ${playlistData[artistKey]}`);
        
        // Create or update a notification element
        let notification = document.querySelector('.song-notification');
        
        if (!notification) {
            console.log('Creating notification element...');
            notification = document.createElement('div');
            notification.className = 'song-notification';
            document.body.appendChild(notification);
            
            // Add styles if not already in CSS
            const style = document.createElement('style');
            style.textContent = `
                .song-notification {
                    position: fixed;
                    top: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: linear-gradient(135deg, #8338EC, #5E60CE);
                    color: white;
                    padding: 15px 20px;
                    border-radius: 10px;
                    box-shadow: 0 4px 15px rgba(131, 56, 236, 0.4);
                    z-index: 1000;
                    text-align: center;
                    animation: fadeInOut 5s forwards;
                    pointer-events: none;
                }
                
                @keyframes fadeInOut {
                    0% { opacity: 0; transform: translate(-50%, -20px); }
                    10% { opacity: 1; transform: translate(-50%, 0); }
                    80% { opacity: 1; }
                    100% { opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
        
        // Update notification content
        notification.innerHTML = `
            <strong>Now Playing:</strong><br>
            ${playlistData[songKey]} - ${playlistData[artistKey]}
        `;
        
        console.log('Notification updated and displayed');
        
        // Reset animation
        notification.style.animation = 'none';
        notification.offsetHeight; // Trigger reflow
        notification.style.animation = 'fadeInOut 5s forwards';
    } else {
        console.error(`Song not found for index ${songIndex}. Available keys in playlistData:`, Object.keys(playlistData));
    }
}

// Join the game as a player (increment player count)
async function joinGame(gameId) {
    try {
        console.log('Joining game:', gameId);
        const db = firebase.firestore();
        
        // Increment player count using a transaction to avoid race conditions
        const gameRef = db.collection('games').doc(gameId);
        
        await db.runTransaction(async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            
            if (!gameDoc.exists) {
                console.error('Game document does not exist');
                return;
            }
            
            const currentCount = gameDoc.data().playerCount || 0;
            console.log(`Current player count: ${currentCount}, incrementing...`);
            
            transaction.update(gameRef, {
                playerCount: currentCount + 1,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        
        // Also update player count in Realtime Database
        try {
            const database = firebase.database();
            if (database) {
                const rtdbRef = database.ref('games/' + gameId);
                // Get current value first
                const snapshot = await rtdbRef.once('value');
                if (snapshot.exists()) {
                    const currentData = snapshot.val();
                    const currentCount = currentData.playerCount || 0;
                    
                    await rtdbRef.update({
                        playerCount: currentCount + 1,
                        updatedAt: firebase.database.ServerValue.TIMESTAMP
                    });
                    console.log('Updated player count in Realtime Database');
                } else {
                    console.log('No data found in Realtime Database to update player count');
                }
            }
        } catch (rtdbError) {
            console.error('Error updating player count in Realtime Database:', rtdbError);
            console.log('Continuing with only Firestore update');
        }
        
        console.log('Successfully joined game as player');
        
    } catch (error) {
        console.error('Error joining game:', error);
    }
}

// Create a bingo board with the provided songs and artists
function createBingoBoard(boardElement, songs, artists) {
    console.log('Creating bingo board...');
    
    // Clear any existing cells
    boardElement.innerHTML = '';

    // Combine and shuffle song and artist lists
    const combinedList = [...songs, ...artists];
    const shuffledList = combinedList.sort(() => 0.5 - Math.random());

    for (let i = 0; i < 25; i++) {
        const cell = document.createElement('div');
        cell.classList.add('bingo-cell');

        // Center cell is the logo
        if (i === 12) {
            cell.classList.add('center-cell');
            cell.addEventListener('click', handleLogoCellClick);
        } else {
            cell.textContent = shuffledList[i] || '';
            cell.addEventListener('click', () => {
                cell.classList.toggle('matched');
            });
        }

        boardElement.appendChild(cell);
    }
    
    console.log('Bingo board created successfully');
}

function handleLogoCellClick() {
    console.log('Logo cell clicked - free space');
    // This is a free space
    alert('Free space! This counts as marked for bingo.');
}

// Initialize boards with provided song and artist data
function initializeBoards(songs, artists) {
    console.log('Initializing boards with', songs.length, 'songs and', artists.length, 'artists');
    const board1 = document.querySelector('.board-1');
    const board2 = document.querySelector('.board-2');
    createBingoBoard(board1, songs, artists);
    createBingoBoard(board2, songs, artists);
}

// Swipe functionality
let touchStartX = 0;
let touchEndX = 0;
const boardsWrapper = document.querySelector('.boards-wrapper');
const boardDots = document.querySelectorAll('.board-dot');
const boardBtns = document.querySelectorAll('.board-btn');

document.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
});

document.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
});

function handleSwipe() {
    const minSwipeDistance = 50;
    if (touchEndX < touchStartX - minSwipeDistance) {
        // Swipe left to second board
        console.log('Swiped left to board 2');
        switchToBoard(2);
    } else if (touchEndX > touchStartX + minSwipeDistance) {
        // Swipe right to first board
        console.log('Swiped right to board 1');
        switchToBoard(1);
    }
}

// Switch to specified board
function switchToBoard(boardNum) {
    console.log('Switching to board', boardNum);
    if (boardNum === 1) {
        boardsWrapper.style.transform = 'translateX(0)';
        boardDots[1].classList.remove('active');
        boardDots[0].classList.add('active');
        boardBtns[1].classList.remove('active');
        boardBtns[0].classList.add('active');
    } else {
        boardsWrapper.style.transform = 'translateX(-50%)';
        boardDots[0].classList.remove('active');
        boardDots[1].classList.add('active');
        boardBtns[0].classList.remove('active');
        boardBtns[1].classList.add('active');
    }
}

// Swipe hint clicks
document.querySelector('.swipe-hint.left').addEventListener('click', () => {
    switchToBoard(1);
});

document.querySelector('.swipe-hint.right').addEventListener('click', () => {
    switchToBoard(2);
});

// Board selector buttons
boardBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const boardNum = parseInt(btn.getAttribute('data-board'));
        switchToBoard(boardNum);
    });
});

// New game button - regenerate boards with same data
document.getElementById('new-game-btn').addEventListener('click', () => {
    console.log('New game button clicked');
    
    if (playlistData) {
        // Extract songs and artists from playlist data
        const extractedSongs = [];
        const extractedArtists = [];
        
        // Loop through potential song and artist fields
        for (let i = 1; i <= 25; i++) {
            const songKey = `song${i}`;
            const artistKey = `artist${i}`;
            
            if (playlistData[songKey] && playlistData[artistKey]) {
                extractedSongs.push(playlistData[songKey]);
                extractedArtists.push(playlistData[artistKey]);
            }
        }
        
        console.log(`Regenerating boards with ${extractedSongs.length} songs and ${extractedArtists.length} artists`);
        initializeBoards(extractedSongs, extractedArtists);
    } else {
        console.log('No playlist data available, falling back to sample data');
        // Fall back to sample data
        initializeGameWithSampleData();
    }
});

// Check Bingo functionality
document.getElementById('check-bingo-btn').addEventListener('click', () => {
    console.log('Checking for Bingo...');
    const activeBoard = boardsWrapper.style.transform === 'translateX(-50%)' ? 
        document.querySelector('.board-2') : document.querySelector('.board-1');
    
    if (checkForBingo(activeBoard)) {
        console.log('BINGO found!');
        document.querySelector('.bingo-message').style.display = 'block';
    } else {
        console.log('No Bingo yet');
        alert('No bingo yet. Keep playing!');
    }
});

// Close bingo message
document.getElementById('close-bingo-message').addEventListener('click', () => {
    console.log('Closing bingo message');
    document.querySelector('.bingo-message').style.display = 'none';
});

// Check if there's a bingo
function checkForBingo(board) {
    const cells = board.querySelectorAll('.bingo-cell');
    const centerIndex = 12;
    
    // Convert NodeList to array for easier manipulation
    const cellsArray = Array.from(cells);
    
    // Check rows
    for (let i = 0; i < 5; i++) {
        const row = cellsArray.slice(i * 5, i * 5 + 5);
        if (row.every(cell => cell.classList.contains('matched') || cell.classList.contains('center-cell'))) {
            console.log(`Found bingo in row ${i}`);
            return true;
        }
    }
    
    // Check columns
    for (let i = 0; i < 5; i++) {
        const column = [
            cellsArray[i],
            cellsArray[i + 5],
            cellsArray[i + 10],
            cellsArray[i + 15],
            cellsArray[i + 20]
        ];
        if (column.every(cell => cell.classList.contains('matched') || cell.classList.contains('center-cell'))) {
            console.log(`Found bingo in column ${i}`);
            return true;
        }
    }
    
    // Check diagonals
    const diagonal1 = [
        cellsArray[0],
        cellsArray[6],
        cellsArray[12],
        cellsArray[18],
        cellsArray[24]
    ];
    
    const diagonal2 = [
        cellsArray[4],
        cellsArray[8],
        cellsArray[12],
        cellsArray[16],
        cellsArray[20]
    ];
    
    if (diagonal1.every(cell => cell.classList.contains('matched') || cell.classList.contains('center-cell'))) {
        console.log('Found bingo in diagonal 1');
        return true;
    }
    
    if (diagonal2.every(cell => cell.classList.contains('matched') || cell.classList.contains('center-cell'))) {
        console.log('Found bingo in diagonal 2');
        return true;
    }
    
    return false;
}