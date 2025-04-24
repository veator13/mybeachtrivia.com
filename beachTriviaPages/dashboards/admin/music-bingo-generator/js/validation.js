// Text validation module
const TextValidator = (() => {
    // Store the validated song/artist pairs
    let validatedEntries = [];
    let pendingEntries = [];
    let characterLimit = 40;

    // DOM elements
    const modal = document.getElementById('validationModal');
    const validationTableBody = document.getElementById('validationTableBody');
    const approveBtn = document.getElementById('approveBtn');
    const cancelBtn = document.getElementById('cancelValidationBtn');

    // Initialize event listeners
    const init = () => {
        if (cancelBtn) {
            cancelBtn.addEventListener('click', closeModal);
        }
        
        if (approveBtn) {
            approveBtn.addEventListener('click', approveEntries);
        }
    };

    // Check if a text exceeds the character limit
    const exceedsLimit = (text) => {
        return text && text.length > characterLimit;
    };

    // Validate an array of song/artist pairs
    const validateEntries = (entries) => {
        pendingEntries = entries.slice(); // Create a copy
        
        // Find entries that exceed the character limit
        const longEntries = [];
        
        entries.forEach((entry, index) => {
            const songTooLong = exceedsLimit(entry.song);
            const artistTooLong = exceedsLimit(entry.artist);
            
            if (songTooLong || artistTooLong) {
                longEntries.push({
                    index: index,
                    song: entry.song,
                    songTooLong: songTooLong,
                    artist: entry.artist,
                    artistTooLong: artistTooLong,
                    songOverride: false,
                    artistOverride: false
                });
            }
        });
        
        // If any entries exceed the limit, show the validation modal
        if (longEntries.length > 0) {
            showValidationModal(longEntries);
            return false; // Validation failed
        }
        
        // All entries are valid
        validatedEntries = entries;
        return true; // Validation passed
    };
    
    // Show the validation modal with the problematic entries
    const showValidationModal = (longEntries) => {
        // Clear existing rows
        if (validationTableBody) {
            validationTableBody.innerHTML = '';
        }
        
        // Add rows for each problematic entry
        longEntries.forEach((entry) => {
            // Add a row for song if it's too long
            if (entry.songTooLong) {
                addValidationRow('Song', entry.song, entry.index, 'song');
            }
            
            // Add a row for artist if it's too long
            if (entry.artistTooLong) {
                addValidationRow('Artist', entry.artist, entry.index, 'artist');
            }
        });
        
        // Disable approve button initially
        if (approveBtn) {
            approveBtn.disabled = true;
        }
        
        // Show the modal
        if (modal) {
            modal.style.display = 'block';
        }
        
        // Check if all entries are valid or overridden
        checkAllValidated();
    };
    
    // Add a row to the validation table
    const addValidationRow = (type, content, entryIndex, field) => {
        if (!validationTableBody) return;
        
        const row = document.createElement('tr');
        row.dataset.entryIndex = entryIndex;
        row.dataset.field = field;
        
        // Type cell
        const typeCell = document.createElement('td');
        typeCell.textContent = type;
        row.appendChild(typeCell);
        
        // Content cell
        const contentCell = document.createElement('td');
        const contentInput = document.createElement('input');
        contentInput.type = 'text';
        contentInput.className = 'validation-input';
        contentInput.value = content;
        contentInput.dataset.originalValue = content;
        
        // Add event listener to the input
        contentInput.addEventListener('input', function() {
            const currentLength = this.value.length;
            const lengthIndicator = row.querySelector('.length-indicator');
            
            if (lengthIndicator) {
                lengthIndicator.textContent = currentLength;
                
                if (currentLength <= characterLimit) {
                    lengthIndicator.className = 'length-indicator length-valid';
                    // Update the pending entry
                    const entryIndex = parseInt(row.dataset.entryIndex);
                    const field = row.dataset.field;
                    
                    if (pendingEntries[entryIndex]) {
                        pendingEntries[entryIndex][field] = this.value;
                    }
                } else {
                    lengthIndicator.className = 'length-indicator length-invalid';
                }
            }
            
            // Check if all entries are valid or overridden
            checkAllValidated();
        });
        
        contentCell.appendChild(contentInput);
        row.appendChild(contentCell);
        
        // Length cell
        const lengthCell = document.createElement('td');
        const lengthIndicator = document.createElement('span');
        lengthIndicator.className = 'length-indicator length-invalid';
        lengthIndicator.textContent = content.length;
        lengthCell.appendChild(lengthIndicator);
        row.appendChild(lengthCell);
        
        // Actions cell
        const actionsCell = document.createElement('td');
        const overrideBtn = document.createElement('button');
        overrideBtn.className = 'override-btn';
        overrideBtn.textContent = 'Override';
        
        // Add event listener to override button
        overrideBtn.addEventListener('click', function() {
            this.classList.toggle('active');
            
            // Update the override status
            const entryIndex = parseInt(row.dataset.entryIndex);
            const field = row.dataset.field;
            
            if (pendingEntries[entryIndex]) {
                if (field === 'song') {
                    pendingEntries[entryIndex].songOverride = this.classList.contains('active');
                } else if (field === 'artist') {
                    pendingEntries[entryIndex].artistOverride = this.classList.contains('active');
                }
            }
            
            // Check if all entries are valid or overridden
            checkAllValidated();
        });
        
        actionsCell.appendChild(overrideBtn);
        row.appendChild(actionsCell);
        
        // Add the row to the table
        validationTableBody.appendChild(row);
    };
    
    // Check if all entries are valid or overridden
    const checkAllValidated = () => {
        if (!validationTableBody || !approveBtn) return;
        
        let allValid = true;
        
        // Check each row in the validation table
        const rows = validationTableBody.querySelectorAll('tr');
        rows.forEach(row => {
            const input = row.querySelector('.validation-input');
            const overrideBtn = row.querySelector('.override-btn');
            
            if (input && overrideBtn) {
                const isValid = input.value.length <= characterLimit;
                const isOverridden = overrideBtn.classList.contains('active');
                
                if (!isValid && !isOverridden) {
                    allValid = false;
                }
            }
        });
        
        // Enable or disable the approve button
        approveBtn.disabled = !allValid;
    };
    
    // Close the validation modal without approving changes
    const closeModal = () => {
        if (modal) {
            modal.style.display = 'none';
        }
        
        // Clear the pending entries
        pendingEntries = [];
        validatedEntries = [];
        
        // Send a custom event to notify that validation was canceled
        document.dispatchEvent(new CustomEvent('validationCanceled'));
    };
    
    // Approve all entries and close the modal
    const approveEntries = () => {
        if (modal) {
            modal.style.display = 'none';
        }
        
        // Update the pending entries with the edited values from the modal
        const rows = validationTableBody.querySelectorAll('tr');
        rows.forEach(row => {
            const entryIndex = parseInt(row.dataset.entryIndex);
            const field = row.dataset.field;
            const input = row.querySelector('.validation-input');
            
            if (input && pendingEntries[entryIndex]) {
                pendingEntries[entryIndex][field] = input.value;
            }
        });
        
        // Set the validated entries
        validatedEntries = pendingEntries;
        
        // Send a custom event to notify that validation was completed
        document.dispatchEvent(new CustomEvent('validationCompleted', {
            detail: { entries: validatedEntries }
        }));
    };
    
    // Get the validated entries
    const getValidatedEntries = () => {
        return validatedEntries;
    };

    // Public methods
    return {
        init,
        validateEntries,
        getValidatedEntries
    };
})();

// Initialize the text validator when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    TextValidator.init();
});

// Export the TextValidator for use in script.js
export { TextValidator };