// Firebase and App Imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    updateDoc, 
    deleteDoc 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Import the TextValidator from validation.js
import { TextValidator } from './validation.js';
// Import the BingoBoardGenerator from pdfGenerator.js
import { BingoBoardGenerator } from './pdfGenerator.js';

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDBKCotY1F943DKfVQqKOGPPkAkQe2Zgog",
    authDomain: "beach-trivia-website.firebaseapp.com",
    projectId: "beach-trivia-website",
    storageBucket: "beach-trivia-website.firebasestorage.app",
    messagingSenderId: "459479368322",
    appId: "1:459479368322:web:7bd3d080d3b9e77610aa9b",
    measurementId: "G-24MQRKKDNY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Playlist Management Module
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
        playlistNameInput.value = '';

        // Reset existing playlists dropdown to default
        existingPlaylistsSelect.selectedIndex = 0;
        
        // Reset the current playlist ID
        currentPlaylistId = null;
        console.log("Reset current playlist ID to:", currentPlaylistId);

        // Clear all existing rows
        songTableBody.innerHTML = '';

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
        const actionCell = newRow.insertCell(2);
        
        songCell.innerHTML = `<input type="text" class="song-name" data-song-index="${rowCount}" placeholder="Enter Song Name">`;
        artistCell.innerHTML = `<input type="text" class="artist-name" data-artist-index="${rowCount}" placeholder="Enter Artist Name">`;
        actionCell.classList.add('remove-row-cell');
        actionCell.innerHTML = `<button class="remove-row-btn">Remove</button>`;
        
        // Add event listener to remove button
        actionCell.querySelector('.remove-row-btn').addEventListener('click', () => {
            songTableBody.removeChild(newRow);
        });

        return newRow;
    };

    const initializeTable = () => {
        for (let i = 0; i < 5; i++) {
            addRow();
        }
    };

    const savePlaylist = async () => {
        const playlistNameInput = document.getElementById('playlistName');
        const songTableBody = document.getElementById('songTableBody');
        const existingPlaylistsSelect = document.getElementById('existingPlaylists');

        const playlistName = playlistNameInput.value.trim();
        
        if (!playlistName) {
            alert('Please enter a playlist name');
            return;
        }

        // Use the tracked currentPlaylistId instead of dropdown value
        console.log("Saving with current playlist ID:", currentPlaylistId);

        // Create playlist object with dynamic song and artist fields
        const playlistData = {
            playlistTitle: playlistName
        };

        const songRows = songTableBody.querySelectorAll('tr');
        
        // Prepare to track the maximum number of songs
        let maxSongIndex = 0;

        // Populate with current songs and track max index
        songRows.forEach((row, index) => {
            const songInput = row.querySelector('.song-name');
            const artistInput = row.querySelector('.artist-name');
            
            const songName = songInput ? songInput.value.trim() : '';
            const artistName = artistInput ? artistInput.value.trim() : '';
            
            if (songName && artistName) {
                const songKey = `song${index + 1}`;
                const artistKey = `artist${index + 1}`;
                playlistData[songKey] = songName;
                playlistData[artistKey] = artistName;
                maxSongIndex = index + 1;
            }
        });

        if (Object.keys(playlistData).length <= 1) {
            alert('Please add at least one song');
            return;
        }

        try {
            // Prepare a data object to overwrite the entire document
            const completePlaylistData = { ...playlistData };

            // We'll prepare a collection of fields to delete by setting them to null
            // This will only be used if we're updating an existing document
            const fieldsToDelete = {};

            if (currentPlaylistId) {
                console.log("Updating existing playlist:", currentPlaylistId);
                
                // Get the existing document to find fields that need to be removed
                try {
                    const playlistRef = doc(db, 'music_bingo', currentPlaylistId);
                    const querySnapshot = await getDocs(collection(db, 'music_bingo'));
                    
                    querySnapshot.forEach((document) => {
                        if (document.id === currentPlaylistId) {
                            const existingData = document.data();
                            
                            // Find all song/artist fields in the existing document
                            Object.keys(existingData).forEach(key => {
                                if ((key.startsWith('song') || key.startsWith('artist')) && 
                                    !completePlaylistData[key]) {
                                    // Mark fields for deletion by setting to null
                                    fieldsToDelete[key] = null;
                                }
                            });
                        }
                    });
                    
                    // Update the existing document with new data and delete old fields
                    await updateDoc(playlistRef, {
                        ...completePlaylistData,
                        ...fieldsToDelete,
                        updatedAt: new Date()
                    });
                    
                    alert('Playlist updated successfully!');
                } catch (error) {
                    console.error('Error updating playlist:', error);
                    alert('Failed to update playlist: ' + error.message);
                }
            } else {
                // Create new playlist
                const docRef = await addDoc(collection(db, 'music_bingo'), {
                    ...completePlaylistData,
                    createdAt: new Date()
                });
                
                // Set the current playlist ID to the newly created document
                currentPlaylistId = docRef.id;
                console.log("Created new playlist with ID:", currentPlaylistId);
                
                alert('New playlist created successfully!');
            }
            
            // Refresh existing playlists dropdown and ensure the current playlist is selected
            await loadExistingPlaylists();
            
            // Select the current playlist in the dropdown
            if (currentPlaylistId) {
                existingPlaylistsSelect.value = currentPlaylistId;
            }
        } catch (error) {
            console.error('Error saving playlist: ', error);
            alert('Failed to save playlist: ' + error.message);
        }
    };

    const loadExistingPlaylists = async () => {
        const existingPlaylistsSelect = document.getElementById('existingPlaylists');
        existingPlaylistsSelect.innerHTML = '<option value="">Select Existing Playlist</option>';

        try {
            const querySnapshot = await getDocs(collection(db, 'music_bingo'));
            querySnapshot.forEach((doc) => {
                const playlist = doc.data();
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = playlist.playlistTitle;
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

        const selectedPlaylistId = existingPlaylistsSelect.value;
        console.log("Loading playlist with ID:", selectedPlaylistId);
        
        if (!selectedPlaylistId) {
            // If no playlist is selected, reset the current ID
            currentPlaylistId = null;
            return;
        }

        // Set the current playlist ID to the selected one
        currentPlaylistId = selectedPlaylistId;

        try {
            const querySnapshot = await getDocs(collection(db, 'music_bingo'));
            querySnapshot.forEach((document) => {
                if (document.id === selectedPlaylistId) {
                    const playlist = document.data();
                    
                    // Set playlist name
                    playlistNameInput.value = playlist.playlistTitle;
                    
                    // Clear existing rows
                    songTableBody.innerHTML = '';
                    
                    // Collect all song/artist pairs
                    const songArtistPairs = [];
                    
                    // Find all song keys and their matching artist keys
                    Object.keys(playlist).forEach(key => {
                        if (key.startsWith('song') && playlist[key]) {
                            const index = key.substring(4); // Extract the number after "song"
                            const artistKey = `artist${index}`;
                            
                            if (playlist[artistKey]) {
                                songArtistPairs.push({
                                    index: parseInt(index),
                                    song: playlist[key],
                                    artist: playlist[artistKey]
                                });
                            }
                        }
                    });
                    
                    // Sort by index
                    songArtistPairs.sort((a, b) => a.index - b.index);
                    
                    // Add rows for each song/artist pair
                    songArtistPairs.forEach(pair => {
                        const newRow = addRow();
                        
                        const songInput = newRow.querySelector('.song-name');
                        const artistInput = newRow.querySelector('.artist-name');
                        
                        if (songInput) songInput.value = pair.song;
                        if (artistInput) artistInput.value = pair.artist;
                    });
                    
                    // If no rows were added (empty playlist), add the default 5 rows
                    if (songArtistPairs.length === 0) {
                        initializeTable();
                    }
                }
            });
        } catch (error) {
            console.error('Error loading playlist: ', error);
        }
    };

    const deletePlaylist = async () => {
        const existingPlaylistsSelect = document.getElementById('existingPlaylists');
        const selectedPlaylistId = existingPlaylistsSelect.value;

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
                alert('Failed to delete playlist: ' + error.message);
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
                
                // Find the column indices for track name and artist name
                let trackNameIndex = -1;
                let artistNameIndex = -1;
                
                // Check header row to find the relevant columns
                for (let i = 0; i < rows[0].length; i++) {
                    const header = rows[0][i].trim().toLowerCase();
                    if (header === 'track name') {
                        trackNameIndex = i;
                    } else if (header === 'artist name(s)') {
                        artistNameIndex = i;
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
                    
                    if (trackName && artistName) {
                        csvImportData.push({
                            song: trackName,
                            artist: artistName
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
                alert('Failed to parse CSV file: ' + error.message);
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
        if (!entries || entries.length === 0) {
            return;
        }
        
        // Clear existing rows
        const songTableBody = document.getElementById('songTableBody');
        songTableBody.innerHTML = '';
        
        // Add new rows from validated entries
        entries.forEach(entry => {
            const newRow = addRow();
            
            const songInput = newRow.querySelector('.song-name');
            const artistInput = newRow.querySelector('.artist-name');
            
            if (songInput) songInput.value = entry.song;
            if (artistInput) artistInput.value = entry.artist;
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
        const playlistName = playlistNameInput.value.trim();
        
        if (!playlistName) {
            alert('Please enter a playlist name');
            return null;
        }
        
        // Create playlist object with dynamic song and artist fields
        const playlistData = {
            playlistTitle: playlistName
        };
        
        const songArtistPairs = [];
        const songRows = songTableBody.querySelectorAll('tr');
        
        // Extract all valid song/artist pairs
        songRows.forEach((row, index) => {
            const songInput = row.querySelector('.song-name');
            const artistInput = row.querySelector('.artist-name');
            
            const songName = songInput ? songInput.value.trim() : '';
            const artistName = artistInput ? artistInput.value.trim() : '';
            
            if (songName && artistName) {
                songArtistPairs.push({
                    song: songName,
                    artist: artistName
                });
            }
        });
        
        // Check if there are enough songs for bingo boards
        if (songArtistPairs.length < 40) {
            // Return the number of songs for the warning message
            return { 
                sufficientSongs: false, 
                songCount: songArtistPairs.length 
            };
        }
        
        return {
            sufficientSongs: true,
            playlistName: playlistName,
            songArtistPairs: songArtistPairs
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
            generateBoardsBtn.disabled = true;
        } else {
            playlistWarning.style.display = 'none';
            generateBoardsBtn.disabled = false;
        }
        
        // Show the modal
        boardCopiesModal.style.display = 'block';
    };
    
    // Function to close the board copies modal
    const closeBoardCopiesModal = () => {
        const boardCopiesModal = document.getElementById('boardCopiesModal');
        boardCopiesModal.style.display = 'none';
    };
    
    // Function to generate and print bingo boards
    const generateBingoBoards = async () => {
        const copiesInput = document.getElementById('copiesInput');
        const numCopies = parseInt(copiesInput.value, 10);
        
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
            alert('Failed to generate bingo boards: ' + error.message);
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
        generateBingoBoards
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
    if (addRowBtn) {
        addRowBtn.addEventListener('click', PlaylistManager.addRow);
    }

    if (savePlaylistBtn) {
        savePlaylistBtn.addEventListener('click', PlaylistManager.savePlaylist);
    }

    if (existingPlaylistsSelect) {
        existingPlaylistsSelect.addEventListener('change', PlaylistManager.loadPlaylist);
    }

    // Add event listener for Create New Playlist button
    if (createNewPlaylistBtn) {
        createNewPlaylistBtn.addEventListener('click', PlaylistManager.resetPlaylistForm);
    }

    // Add event listener for Delete Playlist button
    if (deletePlaylistBtn) {
        deletePlaylistBtn.addEventListener('click', PlaylistManager.deletePlaylist);
    }

    // Add event listener for Import CSV button
    if (importCsvBtn) {
        importCsvBtn.addEventListener('click', () => {
            csvFileInput.click();
        });
    }

    // Add event listener for CSV file input
    if (csvFileInput) {
        csvFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                PlaylistManager.importFromCsv(e.target.files[0]);
            }
        });
    }

    // Add event listener for Create Printable Board button
    if (createBoardBtn) {
        createBoardBtn.addEventListener('click', PlaylistManager.showBoardCopiesModal);
    }

    // Add event listener for Cancel board generation button
    if (cancelBoardsBtn) {
        cancelBoardsBtn.addEventListener('click', PlaylistManager.closeBoardCopiesModal);
    }

    // Add event listener for Generate Boards button
    if (generateBoardsBtn) {
        generateBoardsBtn.addEventListener('click', PlaylistManager.generateBingoBoards);
    }

    // Initialize the table
    PlaylistManager.initializeTable();
    PlaylistManager.loadExistingPlaylists();
});