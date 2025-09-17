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
  
  // ---------- Helpers: Auth + UID-as-playerId ----------
  async function ensureAuthed() {
    // Make sure the Firebase Auth instance exists
    if (!firebase.auth) return;
  
    // If there is already a user, we're good
    if (firebase.auth().currentUser) return;
  
    // Try to restore a previous auth state quickly (helps on mobile reloads)
    await new Promise(resolve => setTimeout(resolve, 0));
  
    if (!firebase.auth().currentUser) {
      console.log('[auth] Signing in anonymously…');
      await firebase.auth().signInAnonymously().catch(err => {
        console.error('[auth] anonymous sign-in failed:', err);
        throw err;
      });
    }
  }
  
  function getAuthedPlayerId() {
    const user = firebase.auth && firebase.auth().currentUser;
    return user ? user.uid : null;
  }
  
  // ---------- Global game variables ----------
  let gameData = null;
  let playlistData = null;
  let currentSongIndex = -1;
  
  // ---------- Board persistence ----------
  function saveBoardState() {
    const board1 = document.querySelector('.board-1');
    const board2 = document.querySelector('.board-2');
  
    const board1State = getBoardState(board1);
    const board2State = getBoardState(board2);
  
    const gameId = getUrlParameter('gameId') || 'default';
  
    localStorage.setItem(`musicBingo_${gameId}_board1`, JSON.stringify(board1State));
    localStorage.setItem(`musicBingo_${gameId}_board2`, JSON.stringify(board2State));
  
    console.log('Board state saved to localStorage');
  }
  
  function getBoardState(boardElement) {
    const cells = boardElement.querySelectorAll('.bingo-cell');
    const state = [];
    cells.forEach(cell => {
      state.push({
        content: cell.textContent,
        isMatched: cell.classList.contains('matched'),
        isCenter: cell.classList.contains('center-cell')
      });
    });
    return state;
  }
  
  function loadBoardState() {
    const gameId = getUrlParameter('gameId') || 'default';
    const board1StateStr = localStorage.getItem(`musicBingo_${gameId}_board1`);
    const board2StateStr = localStorage.getItem(`musicBingo_${gameId}_board2`);
  
    if (board1StateStr && board2StateStr) {
      console.log('Found saved board state, restoring…');
      const board1State = JSON.parse(board1StateStr);
      const board2State = JSON.parse(board2StateStr);
      restoreBoard(document.querySelector('.board-1'), board1State);
      restoreBoard(document.querySelector('.board-2'), board2State);
      return true;
    }
  
    console.log('No saved board state found');
    return false;
  }
  
  function restoreBoard(boardElement, state) {
    boardElement.innerHTML = '';
    state.forEach(cellState => {
      const cell = document.createElement('div');
      cell.classList.add('bingo-cell');
  
      if (!cellState.isCenter) {
        cell.textContent = cellState.content;
      }
  
      if (cellState.isMatched) {
        cell.classList.add('matched');
      }
  
      if (cellState.isCenter) {
        cell.classList.add('center-cell');
        cell.addEventListener('click', handleLogoCellClick);
      } else {
        cell.addEventListener('click', () => {
          cell.classList.toggle('matched');
          saveBoardState();
        });
      }
  
      boardElement.appendChild(cell);
    });
  }
  
  // ---------- Utilities ----------
  function getUrlParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    const value = urlParams.get(name);
    console.log(`Getting URL parameter '${name}': ${value}`);
    return value;
  }
  
  // ---------- Main game initialization ----------
  async function initializeGame() {
    try {
      console.log('Starting game initialization…');
  
      const gameId = getUrlParameter('gameId');
      if (!gameId) {
        console.log('No game ID provided, using sample data');
        initializeGameWithSampleData();
        return;
      }
  
      console.log('Initializing game with ID:', gameId);
  
      const db = firebase.firestore();
      console.log('Firebase Firestore instance obtained');
  
      const gameDoc = await db.collection('games').doc(gameId).get();
      if (!gameDoc.exists) {
        console.error('Game not found:', gameId);
        alert('Game not found. Please check your link and try again.');
        initializeGameWithSampleData();
        return;
      }
  
      gameData = { id: gameDoc.id, ...gameDoc.data() };
      console.log('Game data loaded:', gameData);
  
      updateGameTitle(gameData.name || 'Music Bingo');
  
      const playlistDoc = await db.collection('music_bingo').doc(gameData.playlistId).get();
      if (!playlistDoc.exists) {
        console.error('Playlist not found:', gameData.playlistId);
        alert('Playlist not found. Please check with the game host.');
        initializeGameWithSampleData();
        return;
      }
  
      playlistData = { id: playlistDoc.id, ...playlistDoc.data() };
      console.log('Playlist data loaded:', playlistData);
  
      const extractedSongs = [];
      const extractedArtists = [];
      for (let i = 1; i <= 25; i++) {
        const songKey = `song${i}`;
        const artistKey = `artist${i}`;
        if (playlistData[songKey] && playlistData[artistKey]) {
          extractedSongs.push(playlistData[songKey]);
          extractedArtists.push(playlistData[artistKey]);
        }
      }
      console.log(`Extracted ${extractedSongs.length} songs and ${extractedArtists.length} artists`);
  
      currentSongIndex = gameData.currentSongIndex || -1;
      console.log('Current song index:', currentSongIndex);
  
      initializeBoards(extractedSongs, extractedArtists);
  
      setupGameUpdates(gameId);
  
      // IMPORTANT: ensure auth before joining (so writes to /players/{uid} pass rules)
      await ensureAuthed();
      await joinGame(gameId);
  
    } catch (error) {
      console.error('Error initializing game:', error);
      alert('Error loading game data. Using sample data instead.');
      initializeGameWithSampleData();
    }
  }
  
  // ---------- Sample fallback ----------
  function initializeGameWithSampleData() {
    console.log('Initializing with sample data…');
  
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
  
    initializeBoards(sampleSongs, sampleArtists);
  }
  
  // ---------- UI: Title ----------
  function updateGameTitle(title) {
    console.log('Updating game title to:', title);
    const titleElement = document.querySelector('.game-title');
    if (titleElement) {
      titleElement.textContent = title;
    }
  }
  
  // ---------- Realtime updates (Firestore + RTDB) ----------
  function setupGameUpdates(gameId) {
    try {
      console.log('Setting up real-time updates for game:', gameId);
  
      const db = firebase.firestore();
      const unsubscribeFirestore = db.collection('games').doc(gameId)
        .onSnapshot((doc) => {
          if (doc.exists) {
            console.log('Received Firestore game update:', doc.data());
            handleGameUpdate(doc.id, doc.data());
          } else {
            console.error('Game document no longer exists in Firestore');
          }
        }, (error) => {
          console.error('Error listening for Firestore game updates:', error);
        });
  
      let gameRef;
      try {
        const database = firebase.database();
        console.log('Firebase database reference created:', typeof database);
  
        gameRef = database.ref('games/' + gameId);
        console.log('Realtime Database reference created for path:', 'games/' + gameId);
  
        gameRef.on('value', (snapshot) => {
          console.log('Realtime Database snapshot received:', snapshot.exists());
          if (snapshot.exists()) {
            console.log('Received Realtime Database game update:', snapshot.val());
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
  
      function handleGameUpdate(id, data) {
        const updatedGame = { id, ...data };
        gameData = updatedGame;
  
        if (updatedGame.currentSongIndex !== currentSongIndex) {
          console.log(`Current song index changed from ${currentSongIndex} to ${updatedGame.currentSongIndex}`);
          currentSongIndex = updatedGame.currentSongIndex;
  
          if (currentSongIndex >= 0) {
            showCurrentSong(currentSongIndex);
          }
        }
  
        if (updatedGame.status === 'ended') {
          console.log('Game has ended');
          alert('This game has ended. Thank you for playing!');
  
          if (unsubscribeFirestore) unsubscribeFirestore();
          try {
            if (firebase.database && gameRef) gameRef.off();
          } catch (error) {
            console.error('Error when stopping Realtime Database listener:', error);
          }
        }
      }
  
    } catch (error) {
      console.error('Error setting up game updates:', error);
    }
  }
  
  // ---------- UI: Show current song ----------
  function showCurrentSong(songIndex) {
    console.log('showCurrentSong called with index:', songIndex);
  
    if (!playlistData) {
      console.error('playlistData is not available!');
      return;
    }
  
    const songKey = `song${songIndex + 1}`;
    const artistKey = `artist${songIndex + 1}`;
  
    console.log(`Looking for song with keys: ${songKey}, ${artistKey}`);
  
    if (playlistData[songKey] && playlistData[artistKey]) {
      console.log(`Found song: ${playlistData[songKey]} - ${playlistData[artistKey]}`);
  
      let notification = document.querySelector('.song-notification');
  
      if (!notification) {
        console.log('Creating notification element…');
        notification = document.createElement('div');
        notification.className = 'song-notification';
        document.body.appendChild(notification);
  
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
  
      notification.innerHTML = `
        <strong>Now Playing:</strong><br>
        ${playlistData[songKey]} - ${playlistData[artistKey]}
      `;
  
      notification.style.animation = 'none';
      // Trigger reflow
      // eslint-disable-next-line no-unused-expressions
      notification.offsetHeight;
      notification.style.animation = 'fadeInOut 5s forwards';
    } else {
      console.error(`Song not found for index ${songIndex}. Available keys in playlistData:`, Object.keys(playlistData));
    }
  }
  
  // ---------- Join game using Auth UID ----------
  async function joinGame(gameId) {
    try {
      console.log('Joining game:', gameId);
  
      // Make sure we have an authenticated user
      await ensureAuthed();
      const playerId = getAuthedPlayerId();
      if (!playerId) {
        throw new Error('No authenticated user; cannot join game');
      }
  
      // Keep localStorage for your UI continuity, but it’s not authoritative anymore
      localStorage.setItem(`bingo_player_${gameId}`, playerId);
  
      // Add/touch player node under their UID; rules require auth.uid == playerId
      const database = firebase.database();
      await database.ref(`games/${gameId}/players/${playerId}`).set({
        joinedAt: firebase.database.ServerValue.TIMESTAMP,
        lastActive: firebase.database.ServerValue.TIMESTAMP
      });
  
      console.log('Player joined with UID (playerId):', playerId);
  
      // Heartbeat every 30s
      setInterval(() => updatePlayerActivity(gameId, playerId), 30000);
  
    } catch (error) {
      console.error('Error joining game:', error);
    }
  }
  
  function updatePlayerActivity(gameId, playerId) {
    try {
      if (!playerId) return;
      const database = firebase.database();
      database.ref(`games/${gameId}/players/${playerId}/lastActive`)
        .set(firebase.database.ServerValue.TIMESTAMP);
    } catch (error) {
      console.error('Error updating player activity:', error);
    }
  }
  
  // ---------- Board creation & interactions ----------
  function createBingoBoard(boardElement, songs, artists) {
    console.log('Creating bingo board…');
  
    boardElement.innerHTML = '';
  
    const combinedList = [...songs, ...artists];
    const shuffledList = combinedList.sort(() => 0.5 - Math.random());
  
    for (let i = 0; i < 25; i++) {
      const cell = document.createElement('div');
      cell.classList.add('bingo-cell');
  
      if (i === 12) {
        cell.classList.add('center-cell');
        cell.addEventListener('click', handleLogoCellClick);
      } else {
        cell.textContent = shuffledList[i] || '';
        cell.addEventListener('click', () => {
          cell.classList.toggle('matched');
          saveBoardState();
        });
      }
  
      boardElement.appendChild(cell);
    }
  
    console.log('Bingo board created successfully');
    saveBoardState();
  }
  
  function handleLogoCellClick() {
    console.log('Logo cell clicked - free space');
    alert('Free space! This counts as marked for bingo.');
  }
  
  function initializeBoards(songs, artists) {
    console.log('Initializing boards with', songs.length, 'songs and', artists.length, 'artists');
  
    if (!loadBoardState()) {
      const board1 = document.querySelector('.board-1');
      const board2 = document.querySelector('.board-2');
      createBingoBoard(board1, songs, artists);
      createBingoBoard(board2, songs, artists);
    }
  }
  
  // ---------- Swipe / UI controls ----------
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
      console.log('Swiped left to board 2');
      switchToBoard(2);
    } else if (touchEndX > touchStartX + minSwipeDistance) {
      console.log('Swiped right to board 1');
      switchToBoard(1);
    }
  }
  
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
  
  document.querySelector('.swipe-hint.left').addEventListener('click', () => {
    switchToBoard(1);
  });
  
  document.querySelector('.swipe-hint.right').addEventListener('click', () => {
    switchToBoard(2);
  });
  
  boardBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const boardNum = parseInt(btn.getAttribute('data-board'));
      switchToBoard(boardNum);
    });
  });
  
  // ---------- Buttons: New game / Check bingo ----------
  document.getElementById('new-game-btn').addEventListener('click', () => {
    console.log('New game button clicked');
  
    const gameId = getUrlParameter('gameId') || 'default';
    localStorage.removeItem(`musicBingo_${gameId}_board1`);
    localStorage.removeItem(`musicBingo_${gameId}_board2`);
    console.log('Cleared saved board state');
  
    if (playlistData) {
      const extractedSongs = [];
      const extractedArtists = [];
      for (let i = 1; i <= 25; i++) {
        const songKey = `song${i}`;
        const artistKey = `artist${i}`;
        if (playlistData[songKey] && playlistData[artistKey]) {
          extractedSongs.push(playlistData[songKey]);
          extractedArtists.push(playlistData[artistKey]);
        }
      }
  
      console.log(`Regenerating boards with ${extractedSongs.length} songs and ${extractedArtists.length} artists`);
      const board1 = document.querySelector('.board-1');
      const board2 = document.querySelector('.board-2');
      createBingoBoard(board1, extractedSongs, extractedArtists);
      createBingoBoard(board2, extractedSongs, extractedArtists);
    } else {
      console.log('No playlist data available, falling back to sample data');
      initializeGameWithSampleData();
    }
  });
  
  document.getElementById('check-bingo-btn').addEventListener('click', () => {
    console.log('Checking for Bingo…');
    const activeBoard = boardsWrapper.style.transform === 'translateX(-50%)'
      ? document.querySelector('.board-2')
      : document.querySelector('.board-1');
  
    if (checkForBingo(activeBoard)) {
      console.log('BINGO found!');
      document.querySelector('.bingo-message').style.display = 'block';
    } else {
      console.log('No Bingo yet');
      alert('No bingo yet. Keep playing!');
    }
  });
  
  document.getElementById('close-bingo-message').addEventListener('click', () => {
    console.log('Closing bingo message');
    document.querySelector('.bingo-message').style.display = 'none';
  });
  
  function checkForBingo(board) {
    const cells = board.querySelectorAll('.bingo-cell');
    const centerIndex = 12;
    const cellsArray = Array.from(cells);
  
    // rows
    for (let i = 0; i < 5; i++) {
      const row = cellsArray.slice(i * 5, i * 5 + 5);
      if (row.every(cell => cell.classList.contains('matched') || cell.classList.contains('center-cell'))) {
        console.log(`Found bingo in row ${i}`);
        return true;
      }
    }
  
    // cols
    for (let i = 0; i < 5; i++) {
      const column = [
        cellsArray[i], cellsArray[i + 5], cellsArray[i + 10], cellsArray[i + 15], cellsArray[i + 20]
      ];
      if (column.every(cell => cell.classList.contains('matched') || cell.classList.contains('center-cell'))) {
        console.log(`Found bingo in column ${i}`);
        return true;
      }
    }
  
    // diagonals
    const diagonal1 = [cellsArray[0], cellsArray[6], cellsArray[12], cellsArray[18], cellsArray[24]];
    const diagonal2 = [cellsArray[4], cellsArray[8], cellsArray[12], cellsArray[16], cellsArray[20]];
  
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
  