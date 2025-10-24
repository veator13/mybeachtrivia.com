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

// Feature modules
import { TextValidator } from './validation.js';
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
    console.log('[generator] reset: currentPlaylistId ->', currentPlaylistId);

    // Clear all existing rows
    if (songTableBody) songTableBody.innerHTML = '';

    // Reinitialize table with 5 rows
    initializeTable();
  };

  const addRow = () => {
    const songTableBody = document.getElementById('songTableBody');

    if (!songTableBody) {
      console.error('[generator] Song table body not found');
      return;
    }

    const rowCount = songTableBody.rows.length + 1;
    const newRow = songTableBody.insertRow();

    const songCell = newRow.insertCell(0);
    const artistCell = newRow.insertCell(1);
    const albumCell = newRow.insertCell(2);
    const trackUriCell = newRow.insertCell(3);
    const actionCell = newRow.insertCell(4);

    songCell.innerHTML   = `<input type="text" class="song-name"   data-song-index="${rowCount}"  placeholder="Enter Song Name">`;
    artistCell.innerHTML = `<input type="text" class="artist-name" data-artist-index="${rowCount}" placeholder="Enter Artist Name">`;
    albumCell.innerHTML  = `<input type="text" class="album-name"  data-album-index="${rowCount}"  placeholder="Enter Album Name">`;
    trackUriCell.innerHTML = `<input type="text" class="track-uri" data-uri-index="${rowCount}"    placeholder="Enter Track URI">`;
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
      console.log('[generator] table initialized with 5 rows');
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
    console.log('[generator] saving; currentPlaylistId:', currentPlaylistId);

    // Create playlist object with dynamic song and artist fields
    const playlistData = {
      playlistTitle: playlistName,
    };

    const songRows = songTableBody.querySelectorAll('tr');

    // Populate with current songs
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
        const i = index + 1;
        playlistData[`song${i}`]   = songName;
        playlistData[`artist${i}`] = artistName;
        if (albumName) playlistData[`album${i}`] = albumName;
        if (trackUri)  playlistData[`uri${i}`]   = trackUri;
      }
    });

    if (Object.keys(playlistData).length <= 1) {
      alert('Please add at least one song');
      return;
    }

    try {
      const completePlaylistData = { ...playlistData };

      if (currentPlaylistId) {
        console.log('[generator] updating existing playlist:', currentPlaylistId);

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
        console.log('[generator] created new playlist id:', currentPlaylistId);

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
      let added = 0;
      querySnapshot.forEach((snap) => {
        const playlist = snap.data();
        const option = document.createElement('option');
        option.value = snap.id;
        option.textContent = playlist.playlistTitle || '(Untitled)';
        existingPlaylistsSelect.appendChild(option);
        added++;
      });

      // If we have a current playlist ID, select it in the dropdown
      if (currentPlaylistId) {
        existingPlaylistsSelect.value = currentPlaylistId;
      }

      console.log('[generator] playlists loaded:', added);
    } catch (error) {
      console.error('Error loading playlists: ', error);
    }
  };

  const loadPlaylist = async () => {
    const existingPlaylistsSelect = document.getElementById('existingPlaylists');
    const playlistNameInput = document.getElementById('playlistName');
    const songTableBody = document.getElementById('songTableBody');

    const selectedPlaylistId = existingPlaylistsSelect?.value;
    console.log('[generator] loadPlaylist id:', selectedPlaylistId);

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
              const index = key.substring(4); // number after "song"
              const artistKey = `artist${index}`;
              const albumKey  = `album${index}`;
              const uriKey    = `uri${index}`;

              if (playlist[artistKey]) {
                songEntries.push({
                  index: parseInt(index, 10),
                  song: playlist[key],
                  artist: playlist[artistKey],
                  album: playlist[albumKey] || '',
                  uri:   playlist[uriKey]   || '',
                });
              }
            }
          });

          // Sort by index
          songEntries.sort((a, b) => a.index - b.index);

          // Add rows for each song entry
          songEntries.forEach((entry) => {
            const newRow = addRow();

            const songInput  = newRow?.querySelector('.song-name');
            const artistInput= newRow?.querySelector('.artist-name');
            const albumInput = newRow?.querySelector('.album-name');
            const trackUriInput = newRow?.querySelector('.track-uri');

            if (songInput)   songInput.value   = entry.song;
            if (artistInput) artistInput.value = entry.artist;
            if (albumInput)  albumInput.value  = entry.album;
            if (trackUriInput) trackUriInput.value = entry.uri;
          });

          // If no rows were added (empty playlist), add the default 5 rows
          if (songEntries.length === 0) {
            initializeTable();
          }
        }
      });

      if (!found) {
        console.warn('[generator] playlist not found in query snapshot:', selectedPlaylistId);
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

    const confirmDelete = confirm('Are you sure you want to delete this playlist? This action cannot be undone.');

    if (confirmDelete) {
      try {
        await deleteDoc(doc(db, 'music_bingo', selectedPlaylistId));

        currentPlaylistId = null;
        resetPlaylistForm();
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

    if (!file.name.endsWith('.csv')) {
      alert('Please select a CSV file');
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const csvContent = event.target.result;
        const rows = parseCSV(csvContent);

        if (rows.length === 0) {
          alert('No data found in CSV file');
          return;
        }

        // header scan
        let trackNameIndex = -1, artistNameIndex = -1, albumNameIndex = -1, trackUriIndex = -1;

        for (let i = 0; i < rows[0].length; i++) {
          const header = rows[0][i].trim().toLowerCase();
          if (header === 'track name') trackNameIndex = i;
          else if (header === 'artist name(s)') artistNameIndex = i;
          else if (header === 'album name') albumNameIndex = i;
          else if (header === 'track uri') trackUriIndex = i;
        }

        if (trackNameIndex === -1 || artistNameIndex === -1) {
          alert('CSV must contain "Track Name" and "Artist Name(s)" columns');
          return;
        }

        // rows
        csvImportData = [];
        for (let i = 1; i < rows.length; i++) {
          if (rows[i].length <= Math.max(trackNameIndex, artistNameIndex)) continue;

          const trackName = rows[i][trackNameIndex].trim();
          const artistName = rows[i][artistNameIndex].trim();
          const albumName = albumNameIndex >= 0 && rows[i].length > albumNameIndex ? rows[i][albumNameIndex].trim() : '';
          const trackUri  = trackUriIndex  >= 0 && rows[i].length > trackUriIndex  ? rows[i][trackUriIndex].trim()  : '';

          if (trackName && artistName) {
            csvImportData.push({ song: trackName, artist: artistName, album: albumName, uri: trackUri });
          }
        }

        if (csvImportData.length === 0) {
          alert('No valid song/artist pairs found in the CSV');
          return;
        }

        const isValid = TextValidator.validateEntries(csvImportData);
        if (isValid) populateTableFromCsv(csvImportData);

      } catch (error) {
        console.error('Error parsing CSV:', error);
        alert('Failed to parse CSV file: ' + (error?.message || error));
      }
    };

    reader.onerror = () => alert('Error reading the file');
    reader.readAsText(file);
  };

  // Helper: parse CSV (simple, quote-aware)
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
          currentField += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        currentRow.push(currentField);
        currentField = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (currentField !== '' || currentRow.length > 0) {
          currentRow.push(currentField);
          rows.push(currentRow);
          currentRow = [];
          currentField = '';
        }
        if (char === '\r' && nextChar === '\n') i++;
      } else {
        currentField += char;
      }
    }

    if (currentField !== '' || currentRow.length > 0) {
      currentRow.push(currentField);
      rows.push(currentRow);
    }

    return rows;
  };

  // Populate the table with validated data from CSV
  const populateTableFromCsv = (entries) => {
    if (!entries || entries.length === 0) return;

    const songTableBody = document.getElementById('songTableBody');
    if (!songTableBody) return;
    songTableBody.innerHTML = '';

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

  // Expose public methods
  return {
    // public for event wiring
    resetPlaylistForm,
    addRow,
    initializeTable,
    savePlaylist,
    loadExistingPlaylists,
    loadPlaylist,
    deletePlaylist,
    importFromCsv,
    showBoardCopiesModal: async () => {
      const boardCopiesModal = document.getElementById('boardCopiesModal');
      const playlistWarning = document.getElementById('playlistWarning');
      const generateBoardsBtn = document.getElementById('generateBoardsBtn');

      const playlistData = await (async () => {
        if (!currentPlaylistId) {
          alert('Please select or create a playlist first');
          return null;
        }
        const playlistNameInput = document.getElementById('playlistName');
        const songTableBody = document.getElementById('songTableBody');
        const playlistName = (playlistNameInput?.value || '').trim();
        if (!playlistName) {
          alert('Please enter a playlist name');
          return null;
        }
        const songArtistPairs = [];
        const rows = songTableBody?.querySelectorAll('tr') || [];
        rows.forEach((row) => {
          const song = row.querySelector('.song-name')?.value.trim() || '';
          const artist = row.querySelector('.artist-name')?.value.trim() || '';
          const album = row.querySelector('.album-name')?.value.trim() || '';
          const uri = row.querySelector('.track-uri')?.value.trim() || '';
          if (song && artist) songArtistPairs.push({ song, artist, album, uri });
        });
        if (songArtistPairs.length < 40) return { sufficientSongs: false, songCount: songArtistPairs.length };
        return { sufficientSongs: true, playlistName, songArtistPairs };
      })();

      if (!playlistData) return;

      if (!playlistData.sufficientSongs) {
        if (playlistWarning) {
          playlistWarning.textContent = `You need at least 40 songs in your playlist to create bingo boards. Current count: ${playlistData.songCount}`;
          playlistWarning.style.display = 'block';
        }
        if (generateBoardsBtn) generateBoardsBtn.disabled = true;
      } else {
        if (playlistWarning) playlistWarning.style.display = 'none';
        if (generateBoardsBtn) generateBoardsBtn.disabled = false;
      }
      if (boardCopiesModal) boardCopiesModal.style.display = 'block';
    },
    closeBoardCopiesModal: () => {
      const boardCopiesModal = document.getElementById('boardCopiesModal');
      if (boardCopiesModal) boardCopiesModal.style.display = 'none';
    },
    generateBingoBoards: async () => {
      const copiesInput = document.getElementById('copiesInput');
      const numCopies = parseInt(copiesInput?.value || '', 10);
      if (isNaN(numCopies) || numCopies < 1) {
        alert('Please enter a valid number of copies');
        return;
      }
      // (Re-)extract data
      const playlistNameInput = document.getElementById('playlistName');
      const songTableBody = document.getElementById('songTableBody');
      const playlistName = (playlistNameInput?.value || '').trim();
      const pairs = [];
      (songTableBody?.querySelectorAll('tr') || []).forEach((row) => {
        const song = row.querySelector('.song-name')?.value.trim() || '';
        const artist = row.querySelector('.artist-name')?.value.trim() || '';
        const album = row.querySelector('.album-name')?.value.trim() || '';
        const uri = row.querySelector('.track-uri')?.value.trim() || '';
        if (song && artist) pairs.push({ song, artist, album, uri });
      });
      if (!playlistName || pairs.length < 40) {
        alert('Unable to generate boards. Please ensure your playlist has at least 40 songs.');
        return;
      }
      try {
        // close modal
        const boardCopiesModal = document.getElementById('boardCopiesModal');
        if (boardCopiesModal) boardCopiesModal.style.display = 'none';
        // generate double copies
        BingoBoardGenerator.generate(playlistName, pairs, numCopies * 2);
      } catch (e) {
        console.error('Error generating bingo boards:', e);
        alert('Failed to generate bingo boards: ' + (e?.message || e));
      }
    },
  };
})();

// ---- UI bootstrap ----
function initUI() {
  // Get references to buttons
  const addRowBtn               = document.getElementById('addRowBtn');
  const savePlaylistBtn         = document.getElementById('savePlaylistBtn');
  const existingPlaylistsSelect = document.getElementById('existingPlaylists');
  const createNewPlaylistBtn    = document.getElementById('createNewPlaylistBtn');
  const deletePlaylistBtn       = document.getElementById('deletePlaylistBtn');
  const importCsvBtn            = document.getElementById('importCsvBtn');
  const csvFileInput            = document.getElementById('csvFileInput');
  const createBoardBtn          = document.getElementById('createBoardBtn');
  const cancelBoardsBtn         = document.getElementById('cancelBoardsBtn');
  const generateBoardsBtn       = document.getElementById('generateBoardsBtn');

  // Wire events
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
  if (createBoardBtn)  createBoardBtn.addEventListener('click',  PlaylistManager.showBoardCopiesModal);
  if (cancelBoardsBtn) cancelBoardsBtn.addEventListener('click',  PlaylistManager.closeBoardCopiesModal);
  if (generateBoardsBtn) generateBoardsBtn.addEventListener('click', PlaylistManager.generateBingoBoards);

  // Build UI now
  PlaylistManager.initializeTable();
  PlaylistManager.loadExistingPlaylists();

  console.log('[generator] initUI complete');
}

// Run now if the DOM is already ready; otherwise wait for it.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUI, { once: true });
} else {
  initUI();
}

// Handle bfcache restores (Safari/Chrome back/forward)
window.addEventListener('pageshow', (e) => {
  if (e.persisted) initUI();
});
