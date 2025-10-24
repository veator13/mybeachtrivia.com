// beachTriviaPages/dashboards/admin/music-bingo-generator/js/script.js
// ------------------------------------------------------------------
// Module script (requires <script type="module"> in the HTML)

// Firebase and App Imports
import { getApp, getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  deleteField,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

// Import the TextValidator from validation.js
import { TextValidator } from './validation.js';
// Import the BingoBoardGenerator from pdfGenerator.js
import { BingoBoardGenerator } from './pdfGenerator.js';

// ---- guard: wait for the default Firebase app (initialized by boot-firebase.js) ----
async function ensureDefaultApp() {
  // Wait up to ~2s for boot-firebase.js to initialize
  for (let i = 0; i < 40 && getApps().length === 0; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (getApps().length) return getApp();

  // Fallback (safe): initialize from Hosting-injected config
  const cfg = await (await fetch('/__/firebase/init.json')).json();
  return initializeApp(cfg);
}

// Bind Firestore to the (now) ready app
const app = await ensureDefaultApp();
const db = getFirestore(app);
console.log('[generator] Firestore ready:', getApp().options.projectId);

// -----------------------------
// Playlist Management Module
// -----------------------------
const PlaylistManager = (() => {
  // Keep track of the currently loaded playlist ID
  let currentPlaylistId = null;
  // For CSV import data storage
  let csvImportData = [];

  // Private utility functions
  const resetPlaylistForm = () => {
    const playlistNameInput = document.getElementById('playlistName');
    const existingPlaylistsSelect = document.getElementById('existingPlaylists');
    const songTableBody = document.getElementById('songTableBody');

    // Reset playlist name
    if (playlistNameInput) playlistNameInput.value = '';

    // Reset existing playlists dropdown to default
    if (existingPlaylistsSelect) existingPlaylistsSelect.selectedIndex = 0;

    // Reset the current playlist ID
    currentPlaylistId = null;
    console.log('Reset current playlist ID to:', currentPlaylistId);

    // Clear all existing rows
    if (songTableBody) songTableBody.innerHTML = '';

    // Reinitialize table with 5 rows
    initializeTable();
  };

  const addRow = () => {
    const songTableBody = document.getElementById('songTableBody');

    if (!songTableBody) {
      console.error('Song table body not found');
      return;
    }

    const rowCount = songTableBody.rows.length + 1;
    const newRow = songTableBody.insertRow();

    const songCell = newRow.insertCell(0);
    const artistCell = newRow.insertCell(1);
    const albumCell = newRow.insertCell(2);
    const trackUriCell = newRow.insertCell(3);
    const actionCell = newRow.insertCell(4);

    songCell.innerHTML = `<input type="text" class="song-name" data-song-index="${rowCount}" placeholder="Enter Song Name">`;
    artistCell.innerHTML = `<input type="text" class="artist-name" data-artist-index="${rowCount}" placeholder="Enter Artist Name">`;
    albumCell.innerHTML = `<input type="text" class="album-name" data-album-index="${rowCount}" placeholder="Enter Album Name">`;
    trackUriCell.innerHTML = `<input type="text" class="track-uri" data-uri-index="${rowCount}" placeholder="Enter Track URI">`;
    actionCell.classList.add('remove-row-cell');
    actionCell.innerHTML = `<button class="remove-row-btn">Remove</button>`;

    // Add event listener to remove button
    actionCell.querySelector('.remove-row-btn').addEventListener('click', () => {
      songTableBody.removeChild(newRow);
    });

    return newRow;
  };

  const initializeTable = () => {
    const songTableBody = document.getElementById('songTableBody');
    if (!songTableBody) return;
    // Only add initial rows if empty (avoid doubling on re-init)
    if (songTableBody.rows.length === 0) {
      for (let i = 0; i < 5; i++) addRow();
    }
  };

  const savePlaylist = async () => {
    const playlistNameInput = document.getElementById('playlistName');
    const songTableBody = document.getElementById('songTableBody');
    const existingPlaylistsSelect = document.getElementById('existingPlaylists');

    const playlistName = (playlistNameInput?.value || '').trim();

    if (!playlistName) {
      alert('Please enter a playlist name');
      return;
    }

    // Use the tracked currentPlaylistId instead of dropdown value
    console.log('Saving with current playlist ID:', currentPlaylistId);

    // Create playlist object with dynamic song and artist fields
    const playlistData = {
      playlistTitle: playlistName,
    };

    const songRows = songTableBody.querySelectorAll('tr');

    // Prepare to track the maximum number of songs
    let maxSongIndex = 0;

    // Populate with current songs and track max index
    songRows.forEach((row, index) => {
      const songInput = row.querySelector('.song-name');
      const artistInput = row.querySelector('.artist-name');
      const albumInput = row.querySelector('.album-name');
      const trackUriInput = row.querySelector('.track-uri');

      const songName = songInput ? songInput.value.trim() : '';
      const artistName = artistInput ? artistInput.value.trim() : '';
      const albumName = albumInput ? albumInput.value.trim() : '';
      const trackUri = trackUriInput ? trackUriInput.value.trim() : '';

      if (songName && artistName) {
        const songKey = `song${index + 1}`;
        const artistKey = `artist${index + 1}`;
        const albumKey = `album${index + 1}`;
        const uriKey = `uri${index + 1}`;

        playlistData[songKey] = songName;
        playlistData[artistKey] = artistName;

        if (albumName) playlistData[albumKey] = albumName;
        if (trackUri) playlistData[uriKey] = trackUri;

        maxSongIndex = index + 1;
      }
    });

    if (Object.keys(playlistData).length <= 1) {
      alert('Please add at least one song');
      return;
    }

    try {
      const completePlaylistData = { ...playlistData };

      if (currentPlaylistId) {
        console.log('Updating existing playlist:', currentPlaylistId);

        // Find fields to delete (song*/artist*/album*/uri* that no longer exist)
        const playlistRef = doc(db, 'music_bingo', currentPlaylistId);
        const querySnapshot = await getDocs(collection(db, 'music_bingo'));
        const deletions = {};

        querySnapshot.forEach((documentSnap) => {
          if (documentSnap.id === currentPlaylistId) {
            const existingData = documentSnap.data();
            Object.keys(existingData).forEach((key) => {
              if (
                (key.startsWith('song') ||
                  key.startsWith('artist') ||
                  key.startsWith('album') ||
                  key.startsWith('uri')) &&
                !(key in completePlaylistData)
              ) {
                deletions[key] = deleteField(); // actually delete the field
              }
            });
          }
        });

        await updateDoc(playlistRef, {
          ...completePlaylistData,
          ...deletions,
          updatedAt: new Date(),
        });

        alert('Playlist updated successfully!');
      } else {
        // Create new playlist
        const docRef = await addDoc(collection(db, 'music_bingo'), {
          ...completePlaylistData,
          createdAt: new Date(),
        });

        // Set the current playlist ID to the newly created document
        currentPlaylistId = docRef.id;
        console.log('Created new playlist with ID:', currentPlaylistId);

        alert('New playlist created successfully!');
      }

      // Refresh existing playlists dropdown and ensure the current playlist is selected
      await loadExistingPlaylists();

      // Select the current playlist in the dropdown
      if (currentPlaylistId && existingPlaylistsSelect) {
        existingPlaylistsSelect.value = currentPlaylistId;
      }
    } catch (error) {
      console.error('Error saving playlist: ', error);
      alert('Failed to save playlist: ' + (error?.message || error));
    }
  };

  const loadExistingPlaylists = async () => {
    const existingPlaylistsSelect = document.getElementById('existingPlaylists');
    if (!existingPlaylistsSelect) return;

    existingPlaylistsSelect.innerHTML = '<option value="">Select Existing Playlist</option>';

    try {
      const querySnapshot = await getDocs(collection(db, 'music_bingo'));
      querySnapshot.forEach((snap) => {
        const playlist = snap.data();
        const option = document.createElement('option');
        option.value = snap.id;
        option.textContent = playlist.playlistTitle || '(Untitled)';
        existingPlaylistsSelect.appendChild(option);
      });

      // If we have a current playlist ID, select it in the dropdown
      if (currentPlaylistId) {
        existingPlaylistsSelect.value = currentPlaylistId;
      }
    } catch (error) {
      console.error('Error loading playlists: ', error);
    }
  };

  const loadPlaylist = async () => {
    const existingPlaylistsSelect = document.getElementById('existingPlaylists');
    const playlistNameInput = document.getElementById('playlistName');
    const songTableBody = document.getElementById('songTableBody');

    const selectedPlaylistId = existingPlaylistsSelect?.value;
    console.log('Loading playlist with ID:', selectedPlaylistId);

    if (!selectedPlaylistId) {
      // If no playlist is selected, reset the current ID
      currentPlaylistId = null;
      return;
    }

    // Set the current playlist ID to the selected one
    currentPlaylistId = selectedPlaylistId;

    try {
      const querySnapshot = await getDocs(collection(db, 'music_bingo'));
      let found = false;

      querySnapshot.forEach((documentSnap) => {
        if (documentSnap.id === selectedPlaylistId) {
          found = true;
          const playlist = documentSnap.data();

          // Set playlist name
          if (playlistNameInput) playlistNameInput.value = playlist.playlistTitle || '';

          // Clear existing rows
          if (songTableBody) songTableBody.innerHTML = '';

          // Collect all song/artist/album/uri entries
          const songEntries = [];

          // Find all song keys and their matching fields
          Object.keys(playlist).forEach((key) => {
            if (key.startsWith('song') && playlist[key]) {
              const index = key.substring(4); // Extract the number after "song"
              const artistKey = `artist${index}`;
              const albumKey = `album${index}`;
              const uriKey = `uri${index}`;

              if (playlist[artistKey]) {
                songEntries.push({
                  index: parseInt(index, 10),
                  song: playlist[key],
                  artist: playlist[artistKey],
                  album: playlist[albumKey] || '',
                  uri: playlist[uriKey] || '',
                });
              }
            }
          });

          // Sort by index
          songEntries.sort((a, b) => a.index - b.index);

          // Add rows for each song entry
          songEntries.forEach((entry) => {
            const newRow = addRow();

            const songInput = newRow?.querySelector('.song-name');
            const artistInput = newRow?.querySelector('.artist-name');
            const albumInput = newRow?.querySelector('.album-name');
            const trackUriInput = newRow?.querySelector('.track-uri');

            if (songInput) songInput.value = entry.song;
            if (artistInput) artistInput.value = entry.artist;
            if (albumInput) albumInput.value = entry.album;
            if (trackUriInput) trackUriInput.value = entry.uri;
          });

          // If no rows were added (empty playlist), add the default 5 rows
          if (songEntries.length === 0) {
            initializeTable();
          }
        }
      });

      if (!found) {
        console.warn('Playlist not found in query snapshot:', selectedPlaylistId);
      }
    } catch (error) {
      console.error('Error loading playlist: ', error);
    }
  };

  const deletePlaylist = async () => {
    const existingPlaylistsSelect = document.getElementById('existingPlaylists');
    const selectedPlaylistId = existingPlaylistsSelect?.value;

    if (!selectedPlaylistId) {
      alert('Please select a playlist to delete');
      return;
    }

    // Confirm deletion
    const confirmDelete = confirm('Are you sure you want to delete this playlist? This action cannot be undone.');

    if (confirmDelete) {
      try {
        // Delete the document from Firestore
        await deleteDoc(doc(db, 'music_bingo', selectedPlaylistId));

        // Reset the current playlist ID
        currentPlaylistId = null;

        // Reset the form
        resetPlaylistForm();

        // Refresh the playlists dropdown
        await loadExistingPlaylists();

        alert('Playlist deleted successfully');
      } catch (error) {
        console.error('Error deleting playlist: ', error);
        alert('Failed to delete playlist: ' + (error?.message || error));
      }
    }
  };

  // CSV Import Function
  const importFromCsv = (file) => {
    if (!file) {
      alert('No file selected');
      return;
    }

    // Check file extension
    if (!file.name.endsWith('.csv')) {
      alert('Please select a CSV file');
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        // Get the CSV content
        const csvContent = event.target.result;

        // Parse the CSV
        const rows = parseCSV(csvContent);

        if (rows.length === 0) {
          alert('No data found in CSV file');
          return;
        }

        // Find the column indices for track name, artist name, album name, and track URI
        let trackNameIndex = -1;
        let artistNameIndex = -1;
        let albumNameIndex = -1;
        let trackUriIndex = -1;

        // Check header row to find the relevant columns
        for (let i = 0; i < rows[0].length; i++) {
          const header = rows[0][i].trim().toLowerCase();
          if (header === 'track name') {
            trackNameIndex = i;
          } else if (header === 'artist name(s)') {
            artistNameIndex = i;
          } else if (header === 'album name') {
            albumNameIndex = i;
          } else if (header === 'track uri') {
            trackUriIndex = i;
          }
        }

        if (trackNameIndex === -1 || artistNameIndex === -1) {
          alert('CSV must contain "Track Name" and "Artist Name(s)" columns');
          return;
        }

        // Prepare song/artist pairs for validation
        csvImportData = [];

        // Process each row (skip header row)
        for (let i = 1; i < rows.length; i++) {
          if (rows[i].length <= Math.max(trackNameIndex, artistNameIndex)) {
            console.warn(`Skipping row ${i + 1}: insufficient columns`);
            continue;
          }

          const trackName = rows[i][trackNameIndex].trim();
          const artistName = rows[i][artistNameIndex].trim();
          const albumName =
            albumNameIndex >= 0 && rows[i].length > albumNameIndex ? rows[i][albumNameIndex].trim() : '';
          const trackUri =
            trackUriIndex >= 0 && rows[i].length > trackUriIndex ? rows[i][trackUriIndex].trim() : '';

          if (trackName && artistName) {
            csvImportData.push({
              song: trackName,
              artist: artistName,
              album: albumName,
              uri: trackUri,
            });
          }
        }

        if (csvImportData.length === 0) {
          alert('No valid song/artist pairs found in the CSV');
          return;
        }

        // Validate the song/artist pairs
        const isValid = TextValidator.validateEntries(csvImportData);

        if (isValid) {
          // If all entries are valid, populate the table directly
          populateTableFromCsv(csvImportData);
        }
        // If not valid, the validation modal will be shown
        // The event listeners will handle populating the table once validation is complete
      } catch (error) {
        console.error('Error parsing CSV:', error);
        alert('Failed to parse CSV file: ' + (error?.message || error));
      }
    };

    reader.onerror = () => {
      alert('Error reading the file');
    };

    // Read the file as text
    reader.readAsText(file);
  };

  // Helper function to parse CSV
  const parseCSV = (text) => {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (nextChar === '"') {
          // Handle escaped quote ("") - add a single quote
          currentField += '"';
          i++; // Skip the next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of field
        currentRow.push(currentField);
        currentField = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        // End of line
        if (currentField !== '' || currentRow.length > 0) {
          currentRow.push(currentField);
          rows.push(currentRow);
          currentRow = [];
          currentField = '';
        }

        // Skip the next character if it's a line feed after a carriage return
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
      } else {
        // Regular character
        currentField += char;
      }
    }

    // Add the last field and row if any
    if (currentField !== '' || currentRow.length > 0) {
      currentRow.push(currentField);
      rows.push(currentRow);
    }

    return rows;
  };

  // Populate the table with validated data from CSV
  const populateTableFromCsv = (entries) => {
    if (!entries || entries.length === 0) return;

    // Clear existing rows
    const songTableBody = document.getElementById('songTableBody');
    if (!songTableBody) return;
    songTableBody.innerHTML = '';

    // Add new rows from validated entries
    entries.forEach((entry) => {
      const newRow = addRow();

      const songInput = newRow?.querySelector('.song-name');
      const artistInput = newRow?.querySelector('.artist-name');
      const albumInput = newRow?.querySelector('.album-name');
      const trackUriInput = newRow?.querySelector('.track-uri');

      if (songInput) songInput.value = entry.song;
      if (artistInput) artistInput.value = entry.artist;
      if (albumInput) albumInput.value = entry.album || '';
      if (trackUriInput) trackUriInput.value = entry.uri || '';
    });

    alert(`Successfully imported ${entries.length} songs from CSV`);
  };

  // New function to extract the current playlist data
  const extractCurrentPlaylistData = async () => {
    if (!currentPlaylistId) {
      alert('Please select or create a playlist first');
      return null;
    }

    // Extract data from the current form
    const playlistNameInput = document.getElementById('playlistName');
    const songTableBody = document.getElementById('songTableBody');
    const playlistName = (playlistNameInput?.value || '').trim();

    if (!playlistName) {
      alert('Please enter a playlist name');
      return null;
    }

    // Create playlist object with dynamic song and artist fields
    const playlistData = {
      playlistTitle: playlistName,
    };

    const songArtistPairs = [];
    const songRows = songTableBody?.querySelectorAll('tr') || [];

    // Extract all valid song/artist pairs
    songRows.forEach((row, index) => {
      const songInput = row.querySelector('.song-name');
      const artistInput = row.querySelector('.artist-name');
      const albumInput = row.querySelector('.album-name');
      const trackUriInput = row.querySelector('.track-uri');

      const songName = songInput ? songInput.value.trim() : '';
      const artistName = artistInput ? artistInput.value.trim() : '';
      const albumName = albumInput ? albumInput.value.trim() : '';
      const trackUri = trackUriInput ? trackUriInput.value.trim() : '';

      if (songName && artistName) {
        songArtistPairs.push({
          song: songName,
          artist: artistName,
          album: albumName,
          uri: trackUri,
        });
      }
    });

    // Check if there are enough songs for bingo boards
    if (songArtistPairs.length < 40) {
      // Return the number of songs for the warning message
      return {
        sufficientSongs: false,
        songCount: songArtistPairs.length,
      };
    }

    return {
      sufficientSongs: true,
      playlistName,
      songArtistPairs,
    };
  };

  // Function to show the board copies modal
  const showBoardCopiesModal = async () => {
    const boardCopiesModal = document.getElementById('boardCopiesModal');
    const playlistWarning = document.getElementById('playlistWarning');
    const generateBoardsBtn = document.getElementById('generateBoardsBtn');

    // Extract current playlist data
    const playlistData = await extractCurrentPlaylistData();

    // If no playlist is selected
    if (!playlistData) {
      return;
    }

    // Check if there are enough songs
    if (!playlistData.sufficientSongs) {
      playlistWarning.textContent = `You need at least 40 songs in your playlist to create bingo boards. Current count: ${playlistData.songCount}`;
      playlistWarning.style.display = 'block';
      if (generateBoardsBtn) generateBoardsBtn.disabled = true;
    } else {
      playlistWarning.style.display = 'none';
      if (generateBoardsBtn) generateBoardsBtn.disabled = false;
    }

    // Show the modal
    if (boardCopiesModal) boardCopiesModal.style.display = 'block';
  };

  // Function to close the board copies modal
  const closeBoardCopiesModal = () => {
    const boardCopiesModal = document.getElementById('boardCopiesModal');
    if (boardCopiesModal) boardCopiesModal.style.display = 'none';
  };

  // Function to generate and print bingo boards
  const generateBingoBoards = async () => {
    const copiesInput = document.getElementById('copiesInput');
    const numCopies = parseInt(copiesInput?.value || '', 10);

    if (isNaN(numCopies) || numCopies < 1) {
      alert('Please enter a valid number of copies');
      return;
    }

    // Extract playlist data again to ensure it's fresh
    const playlistData = await extractCurrentPlaylistData();

    if (!playlistData || !playlistData.sufficientSongs) {
      alert('Unable to generate boards. Please ensure your playlist has at least 40 songs.');
      return;
    }

    try {
      // Close the modal
      closeBoardCopiesModal();

      // Generate twice the number of boards that the user requested
      const doubledCopies = numCopies * 2;

      // Generate and open the PDF
      BingoBoardGenerator.generate(
        playlistData.playlistName,
        playlistData.songArtistPairs,
        doubledCopies
      );
    } catch (error) {
      console.error('Error generating bingo boards:', error);
      alert('Failed to generate bingo boards: ' + (error?.message || error));
    }
  };

  // Event listeners for validation events
  document.addEventListener('validationCompleted', (event) => {
    // Get the validated entries
    const validatedEntries = event.detail.entries;

    // Populate the table with the validated entries
    populateTableFromCsv(validatedEntries);
  });

  document.addEventListener('validationCanceled', () => {
    // Clear the CSV import data
    csvImportData = [];
    console.log('CSV import canceled by user');
  });

  // Public methods
  return {
    resetPlaylistForm,
    addRow,
    initializeTable,
    savePlaylist,
    loadExistingPlaylists,
    loadPlaylist,
    deletePlaylist,
    importFromCsv,
    showBoardCopiesModal,
    closeBoardCopiesModal,
    generateBingoBoards,
  };
})();

// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
  // Get references to buttons
  const addRowBtn = document.getElementById('addRowBtn');
  const savePlaylistBtn = document.getElementById('savePlaylistBtn');
  const existingPlaylistsSelect = document.getElementById('existingPlaylists');
  const createNewPlaylistBtn = document.getElementById('createNewPlaylistBtn');
  const deletePlaylistBtn = document.getElementById('deletePlaylistBtn');
  const importCsvBtn = document.getElementById('importCsvBtn');
  const csvFileInput = document.getElementById('csvFileInput');
  const createBoardBtn = document.getElementById('createBoardBtn');
  const cancelBoardsBtn = document.getElementById('cancelBoardsBtn');
  const generateBoardsBtn = document.getElementById('generateBoardsBtn');

  // Add event listeners
  if (addRowBtn) addRowBtn.addEventListener('click', PlaylistManager.addRow);
  if (savePlaylistBtn) savePlaylistBtn.addEventListener('click', PlaylistManager.savePlaylist);
  if (existingPlaylistsSelect) existingPlaylistsSelect.addEventListener('change', PlaylistManager.loadPlaylist);
  if (createNewPlaylistBtn) createNewPlaylistBtn.addEventListener('click', PlaylistManager.resetPlaylistForm);
  if (deletePlaylistBtn) deletePlaylistBtn.addEventListener('click', PlaylistManager.deletePlaylist);
  if (importCsvBtn) importCsvBtn.addEventListener('click', () => csvFileInput?.click());
  if (csvFileInput) {
    csvFileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) PlaylistManager.importFromCsv(file);
    });
  }
  if (createBoardBtn) createBoardBtn.addEventListener('click', PlaylistManager.showBoardCopiesModal);
  if (cancelBoardsBtn) cancelBoardsBtn.addEventListener('click', PlaylistManager.closeBoardCopiesModal);
  if (generateBoardsBtn) generateBoardsBtn.addEventListener('click', PlaylistManager.generateBingoBoards);

  // Initialize the table & playlists list
  PlaylistManager.initializeTable();
  PlaylistManager.loadExistingPlaylists();
});
