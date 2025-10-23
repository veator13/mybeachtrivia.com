// Global variable to track number of teams
let teamCount = 0;
// Global variable to track if data has been modified since last save
let dataModified = false;

// Function to add a team row
function addTeam() {
  teamCount++;
  dataModified = true;

  // Get the tbody element instead of the table
  let tbody = document.querySelector("#teamTable tbody");
  let row = document.createElement("tr");

  let teamCells = `
     <td class="sticky-col">
        <input type="text" id="teamName${teamCount}" class="teamName" placeholder="Team ${teamCount}" oninput="markAsModified()">
        <input type="checkbox" id="checkbox${teamCount}" class="teamCheckbox" onchange="updateFinalScore(${teamCount})">
     </td>
  `;

  // Round 1 (Q1 - Q5) (Only 1 or 0 or empty)
  for (let j = 1; j <= 5; j++) {
      teamCells += `<td><input type="number" id="num${teamCount}${j}" min="0" max="1" step="1" class="round1-input" oninput="validateInput(this, ${teamCount})"></td>`;
  }

  // R1 Total Column with specified class and span style
  teamCells += `<td class="round1-total"><span id="r1Total${teamCount}" style="font-size: 18px; color: #80d4ff; text-shadow: 0px 0px 6px rgba(128, 212, 255, 0.5); font-weight: bold;">0</span></td>`;

  // Round 2 (Q6 - Q10) (Only 0 or 2 or empty)
  for (let j = 6; j <= 10; j++) {
      teamCells += `<td><input type="number" id="num${teamCount}${j}" min="0" max="2" step="2" class="round2-input" oninput="validateInput(this, ${teamCount})"></td>`;
  }

  // R2 Total Column with specified style
  teamCells += `<td><span id="r2Total${teamCount}" style="font-size: 18px; color: #80d4ff; text-shadow: 0px 0px 6px rgba(128, 212, 255, 0.5); font-weight: bold;">0</span></td>`;
  
  // Half Time
  teamCells += `<td><input type="number" id="halfTime${teamCount}" min="0" class="halftime-input" oninput="validateInput(this, ${teamCount})"></td>`;
  
  // First Half Total
  teamCells += `<td><span id="firstHalfTotal${teamCount}" class="first-half-total">0</span></td>`;

  // Round 3 (Q11 - Q15) (Only 0 or 3 or empty)
  for (let j = 11; j <= 15; j++) {
      teamCells += `<td><input type="number" id="num${teamCount}${j}" min="0" max="3" step="3" class="round3-input" oninput="validateInput(this, ${teamCount})"></td>`;
  }

  // R3 Total Column with specified style
  teamCells += `<td><span id="r3Total${teamCount}" style="font-size: 18px; color: #80d4ff; text-shadow: 0px 0px 6px rgba(128, 212, 255, 0.5); font-weight: bold;">0</span></td>`;

  // Round 4 (Q16 - Q20) (Only 0 or 4 or empty)
  for (let j = 16; j <= 20; j++) {
      teamCells += `<td><input type="number" id="num${teamCount}${j}" min="0" max="4" step="4" class="round4-input" oninput="validateInput(this, ${teamCount})"></td>`;
  }

  // R4 Total Column with specified style
  teamCells += `<td><span id="r4Total${teamCount}" style="font-size: 18px; color: #80d4ff; text-shadow: 0px 0px 6px rgba(128, 212, 255, 0.5); font-weight: bold;">0</span></td>`;
  
  // Final Question
  teamCells += `<td><input type="number" id="finalQuestion${teamCount}" min="0" class="finalquestion-input" oninput="validateInput(this, ${teamCount})"></td>`;
  
  // Second Half Total
  teamCells += `<td><span id="secondHalfTotal${teamCount}" class="second-half-total">0</span></td>`;

  // Final Score Column
  teamCells += `<td class="sticky-col-right"><span id="finalScore${teamCount}">0</span></td>`;

  row.innerHTML = teamCells;
  tbody.appendChild(row);
}

// Mark data as modified when any input changes
function markAsModified() {
  dataModified = true;
}

// Modified Input Validation Function that also updates scores
function validateInput(input, teamId) {
  // Get the raw input value (could be empty string)
  let rawValue = input.value;
  
  // Mark data as modified
  dataModified = true;
  
  // Handle half time and final question inputs
  if (input.id === `halfTime${teamId}` || input.id === `finalQuestion${teamId}`) {
    // These can be any non-negative integer or empty
    if (rawValue !== '' && (isNaN(parseInt(rawValue)) || parseInt(rawValue) < 0)) {
      input.value = '0';
    }
    updateScores(teamId);
    return;
  }
  
  // For regular question inputs
  let min = parseInt(input.min);
  let max = parseInt(input.max);
  let step = parseInt(input.step);
  
  // Get the question number from the input id (e.g., "num12" -> 2)
  const inputId = input.id;
  const questionNumber = parseInt(inputId.replace(`num${teamId}`, ''));
  
  // If the input is empty, keep it empty (allows deletion)
  if (rawValue === '') {
    // Do nothing, allow empty value
  } 
  // Special handling for Round 1 (Q1-Q5)
  else if (questionNumber >= 1 && questionNumber <= 5) {
    // For Round 1, if value is not 0 or 1, default to 1
    const value = parseInt(rawValue);
    if (isNaN(value) || (value !== 0 && value !== 1)) {
      input.value = '1';
    }
  } 
  // Special handling for Round 2 (Q6-Q10)
  else if (questionNumber >= 6 && questionNumber <= 10) {
    // For Round 2, if value is not 0 or 2, default to 2
    const value = parseInt(rawValue);
    if (isNaN(value) || (value !== 0 && value !== 2)) {
      input.value = '2';
    }
  }
  // Special handling for Round 3 (Q11-Q15)
  else if (questionNumber >= 11 && questionNumber <= 15) {
    // For Round 3, if value is not 0 or 3, default to 3
    const value = parseInt(rawValue);
    if (isNaN(value) || (value !== 0 && value !== 3)) {
      input.value = '3';
    }
  }
  // Special handling for Round 4 (Q16-Q20)
  else if (questionNumber >= 16 && questionNumber <= 20) {
    // For Round 4, if value is not 0 or 4, default to 4
    const value = parseInt(rawValue);
    if (isNaN(value) || (value !== 0 && value !== 4)) {
      input.value = '4';
    }
  }
  
  // After validation, update the scores
  updateScores(teamId);
}

// Function to update all scores for a specific team
function updateScores(teamId) {
  let values = [];

  // Collecting all answers from Q1 to Q20
  for (let j = 1; j <= 20; j++) {
      let inputElement = document.getElementById(`num${teamId}${j}`);
      // Handle empty inputs as 0
      let inputValue = inputElement?.value;
      values.push(inputValue === '' ? 0 : parseInt(inputValue) || 0);
  }
  
  // Get half time and final question values
  let halfTimeElement = document.getElementById(`halfTime${teamId}`);
  let halfTimeValue = halfTimeElement?.value === '' ? 0 : parseInt(halfTimeElement?.value) || 0;
  
  let finalQuestionElement = document.getElementById(`finalQuestion${teamId}`);
  let finalQuestionValue = finalQuestionElement?.value === '' ? 0 : parseInt(finalQuestionElement?.value) || 0;

  // R1 Total (Q1-Q5)
  let r1Total = values.slice(0, 5).reduce((a, b) => a + b, 0);
  document.getElementById(`r1Total${teamId}`).textContent = r1Total;

  // R2 Total (Q6-Q10)
  let r2Total = values.slice(5, 10).reduce((a, b) => a + b, 0);
  document.getElementById(`r2Total${teamId}`).textContent = r2Total;
  
  // First Half Total (R1 + R2 + Half Time)
  let firstHalfTotal = r1Total + r2Total + halfTimeValue;
  document.getElementById(`firstHalfTotal${teamId}`).textContent = firstHalfTotal;

  // R3 Total (Q11-Q15)
  let r3Total = values.slice(10, 15).reduce((a, b) => a + b, 0);
  document.getElementById(`r3Total${teamId}`).textContent = r3Total;

  // R4 Total (Q16-Q20)
  let r4Total = values.slice(15, 20).reduce((a, b) => a + b, 0);
  document.getElementById(`r4Total${teamId}`).textContent = r4Total;
  
  // Second Half Total (R3 + R4 + Final Question)
  let secondHalfTotal = r3Total + r4Total + finalQuestionValue;
  document.getElementById(`secondHalfTotal${teamId}`).textContent = secondHalfTotal;

  // Final Score (First Half Total + Second Half Total)
  let finalScore = firstHalfTotal + secondHalfTotal;
  
  // Check if the checkbox is checked, and add 5 if it is
  let checkbox = document.getElementById(`checkbox${teamId}`);
  if (checkbox && checkbox.checked) {
      finalScore += 5;
  }
  
  document.getElementById(`finalScore${teamId}`).textContent = finalScore;
}

// Function to update the final score when checkbox is checked
function updateFinalScore(teamId) {
  dataModified = true;
  updateScores(teamId);
}

// Function to show the standings modal
function showStandings() {
  // Make sure all scores are up to date before showing standings
  for (let i = 1; i <= teamCount; i++) {
      updateScores(i);
  }
  
  let modal = document.getElementById("standingsModal");
  modal.style.display = "block";
 
  let modalList = document.getElementById("modalRankingList");
  modalList.innerHTML = "";

  // Populate modal with ranking data
  let teams = [];
  for (let i = 1; i <= teamCount; i++) {
      let teamName = document.getElementById(`teamName${i}`).value || `Team ${i}`;
      let finalScore = parseInt(document.getElementById(`finalScore${i}`).textContent);
      let firstHalfTotal = parseInt(document.getElementById(`firstHalfTotal${i}`).textContent);
      let secondHalfTotal = parseInt(document.getElementById(`secondHalfTotal${i}`).textContent);
      teams.push({ 
          name: teamName, 
          score: finalScore, 
          firstHalf: firstHalfTotal,
          secondHalf: secondHalfTotal
      });
  }

  teams.sort((a, b) => b.score - a.score);
  teams.forEach((team, index) => {
      let listItem = document.createElement("li");
      listItem.textContent = `${index + 1}. ${team.name} - Score: ${team.score} (First Half: ${team.firstHalf}, Second Half: ${team.secondHalf})`;
      
      // Add special styling for top positions
      if (index === 0) {
          listItem.style.borderLeft = "6px solid gold";
          listItem.style.background = "linear-gradient(to right, #3a3a3a, #4a4a4a)";
      } else if (index === 1) {
          listItem.style.borderLeft = "6px solid silver";
      } else if (index === 2) {
          listItem.style.borderLeft = "6px solid #cd7f32"; // bronze
      }
      
      modalRankingList.appendChild(listItem);
  });
}

// Function to close the standings modal
function closeModal() {
  document.getElementById("standingsModal").style.display = "none";
}

// Function to calculate the Levenshtein distance between two strings
// This measures how many single-character edits are needed to change one string into another
function levenshteinDistance(str1, str2) {
  const track = Array(str2.length + 1).fill(null).map(() => 
    Array(str1.length + 1).fill(null));
  
  for (let i = 0; i <= str1.length; i++) {
    track[0][i] = i;
  }
  
  for (let j = 0; j <= str2.length; j++) {
    track[j][0] = j;
  }
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  
  return track[str2.length][str1.length];
}

// Function to search for teams with flexible matching
function searchTeams() {
  // Get the search term and convert to lowercase for case-insensitive search
  const searchTerm = document.getElementById('teamSearch').value.toLowerCase().trim();
  
  // If search term is empty, clear highlights and return
  if (searchTerm === '') {
    clearHighlights();
    return;
  }
  
  // Get all team name inputs
  const teamNameInputs = document.querySelectorAll('.teamName');
  
  // Clear previous highlights
  clearHighlights();
  
  // Array to store matches with their scores (lower score = better match)
  let matches = [];
  let exactMatch = false;
  
  // Loop through each team name
  for (let i = 0; i < teamNameInputs.length; i++) {
    const teamNameInput = teamNameInputs[i];
    const teamNameValue = teamNameInput.value.toLowerCase().trim();
    
    // Calculate similarity metrics
    const contains = teamNameValue.includes(searchTerm);
    const containedBy = searchTerm.includes(teamNameValue);
    const distance = levenshteinDistance(teamNameValue, searchTerm);
    const startsWith = teamNameValue.startsWith(searchTerm);
    
    // Check for exact match
    if (teamNameValue === searchTerm) {
      exactMatch = true;
      highlightTeam(teamNameInput);
      return; // Found exact match, no need to continue
    }
    
    // Create a match score (lower is better)
    // Weight different match types
    let score = distance;
    if (contains) score -= 2;
    if (startsWith) score -= 3;
    if (containedBy && teamNameValue.length > 2) score -= 1;
    
    // Add to matches array if it's a decent match (adjust threshold as needed)
    // Only consider matches with reasonable similarity
    if (score < Math.max(4, Math.min(searchTerm.length, teamNameValue.length) / 2)) {
      matches.push({
        element: teamNameInput,
        name: teamNameValue,
        score: score
      });
    }
  }
  
  // Sort matches by score (best matches first)
  matches.sort((a, b) => a.score - b.score);
  
  // If we have matches, highlight the best match
  if (matches.length > 0) {
    highlightTeam(matches[0].element);
    
    // If we have multiple close matches, show suggestions
    if (matches.length > 1 && matches[0].score > 0) {
      showSuggestions(matches.slice(0, Math.min(5, matches.length)));
    }
  } else {
    // No matches found
    alert('No team found with that name. Try a different search term.');
  }
}

// Function to highlight a team and scroll to it
function highlightTeam(teamNameInput) {
  // Get the parent row (tr element)
  const teamRow = teamNameInput.closest('tr');
  
  // Highlight the row
  teamRow.classList.add('highlighted-row');
  
  // Scroll to the row
  scrollToTeam(teamRow);
}

// Function to show search suggestions
function showSuggestions(matches) {
  // Remove any existing suggestions
  removeExistingSuggestions();
  
  // Create suggestions container
  const suggestionsContainer = document.createElement('div');
  suggestionsContainer.className = 'search-suggestions';
  suggestionsContainer.innerHTML = '<p>Did you mean:</p>';
  
  // Create a list of suggestions
  const suggestionsList = document.createElement('ul');
  
  matches.forEach(match => {
    const item = document.createElement('li');
    item.textContent = match.name;
    item.addEventListener('click', () => {
      // When clicked, update search box and perform search with this term
      document.getElementById('teamSearch').value = match.name;
      removeExistingSuggestions();
      highlightTeam(match.element);
    });
    suggestionsList.appendChild(item);
  });
  
  suggestionsContainer.appendChild(suggestionsList);
  
  // Add to the DOM after the search input
  const searchContainer = document.querySelector('.search-container');
  searchContainer.appendChild(suggestionsContainer);
  
  // Automatically remove suggestions after 10 seconds if not interacted with
  setTimeout(() => {
    if (document.querySelector('.search-suggestions')) {
      removeExistingSuggestions();
    }
  }, 10000);
}

// Function to remove existing suggestions
function removeExistingSuggestions() {
  const existingSuggestions = document.querySelector('.search-suggestions');
  if (existingSuggestions) {
    existingSuggestions.remove();
  }
}

// Function to clear all highlights
function clearHighlights() {
  const highlightedRows = document.querySelectorAll('.highlighted-row');
  highlightedRows.forEach(row => {
    row.classList.remove('highlighted-row');
  });
  removeExistingSuggestions();
}

// Function to scroll to a team
function scrollToTeam(teamRow) {
  // Get the table wrapper for scrolling
  const tableWrapper = document.querySelector('.table-wrapper');
  
  // Calculate the position to scroll to (accounting for sticky header)
  const headerHeight = document.querySelector('thead').offsetHeight;
  const rowPosition = teamRow.offsetTop - headerHeight - 10; // 10px padding
  
  // Scroll the table wrapper
  tableWrapper.scrollTo({
    top: rowPosition,
    behavior: 'smooth'
  });
}

// Helper function to debounce input events
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

// Function to collect all team data and convert to JSON
function collectTeamData() {
    let teamsData = [];
    
    for (let i = 1; i <= teamCount; i++) {
        // Get team name, or use default if empty
        let teamName = document.getElementById(`teamName${i}`).value || `Team ${i}`;
        
        // Check if bonus was applied
        let bonusApplied = document.getElementById(`checkbox${i}`).checked;
        
        // Get scores for each question from Q1 to Q20
        let questionScores = {};
        for (let j = 1; j <= 20; j++) {
            let inputElement = document.getElementById(`num${i}${j}`);
            let inputValue = inputElement?.value;
            // Store empty values as null, otherwise parse as integer or default to 0
            questionScores[`Q${j}`] = inputValue === '' ? null : parseInt(inputValue) || 0;
        }
        
        // Get half time and final question scores
        let halfTimeElement = document.getElementById(`halfTime${i}`);
        let halfTimeValue = halfTimeElement?.value;
        let halfTimeScore = halfTimeValue === '' ? null : parseInt(halfTimeValue) || 0;
        
        let finalQuestionElement = document.getElementById(`finalQuestion${i}`);
        let finalQuestionValue = finalQuestionElement?.value;
        let finalQuestionScore = finalQuestionValue === '' ? null : parseInt(finalQuestionValue) || 0;
        
        // Get calculated totals
        let r1Total = parseInt(document.getElementById(`r1Total${i}`).textContent) || 0;
        let r2Total = parseInt(document.getElementById(`r2Total${i}`).textContent) || 0;
        let r3Total = parseInt(document.getElementById(`r3Total${i}`).textContent) || 0;
        let r4Total = parseInt(document.getElementById(`r4Total${i}`).textContent) || 0;
        let firstHalfTotal = parseInt(document.getElementById(`firstHalfTotal${i}`).textContent) || 0;
        let secondHalfTotal = parseInt(document.getElementById(`secondHalfTotal${i}`).textContent) || 0;
        let finalScore = parseInt(document.getElementById(`finalScore${i}`).textContent) || 0;
        
        // Compile team data
        let teamData = {
            teamId: i,
            teamName: teamName,
            bonusApplied: bonusApplied,
            questionScores: questionScores,
            halfTimeScore: halfTimeScore,
            finalQuestionScore: finalQuestionScore,
            roundTotals: {
                r1Total: r1Total,
                r2Total: r2Total,
                r3Total: r3Total,
                r4Total: r4Total
            },
            firstHalfTotal: firstHalfTotal,
            secondHalfTotal: secondHalfTotal,
            finalScore: finalScore
        };
        
        teamsData.push(teamData);
    }
    
    // Add timestamp and any other metadata
    let scoreData = {
        timestamp: new Date().toISOString(),
        eventName: "Trivia Night", // You could make this configurable
        teamCount: teamCount,
        teams: teamsData
    };
    
    return scoreData;
}

// Function to send data to Firebase Firestore
async function sendDataToAPI(data) {
    try {
        // Check if Firebase is initialized and Firestore is available
        if (!window.db || !window.firestore) {
            throw new Error('Firebase Firestore is not initialized');
        }
        
        // Get the Firestore collection and function references
        const { collection, addDoc } = window.firestore;
        const db = window.db;
        
        // Add a new document to the "scores" collection
        const docRef = await addDoc(collection(db, "scores"), data);
        
        console.log("Document written with ID: ", docRef.id);
        
        // Mark data as saved after successful API submission
        dataModified = false;
        
        return { id: docRef.id, success: true };
    } catch (error) {
        console.error('Error sending data to Firestore:', error);
        // Show an error message to the user
        alert('Failed to submit scores to Firebase. Please try again or save locally.');
        throw error;
    }
}

// Function to save data locally as a JSON file
function saveDataLocally(data) {
    // Convert the data to a JSON string
    const jsonString = JSON.stringify(data, null, 2);
    
    // Create a blob with the data
    const blob = new Blob([jsonString], { type: 'application/json' });
    
    // Create a URL for the blob
    const url = URL.createObjectURL(blob);
    
    // Create a link element to trigger the download
    const a = document.createElement('a');
    a.href = url;
    a.download = `trivia_scores_${new Date().toISOString().slice(0,10)}.json`;
    
    // Trigger the download
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 0);
    
    // Mark data as saved after successful local save
    dataModified = false;
}

// Add event listener for beforeunload to warn users about unsaved changes
window.addEventListener('beforeunload', function(e) {
    if (dataModified) {
        // Standard message (modern browsers ignore custom messages for security reasons)
        const message = 'You have unsaved changes. Are you sure you want to leave?';
        e.returnValue = message; // Standard for most browsers
        return message; // For older browsers
    }
});

// Function to add 5 default teams on page load
window.onload = function() {
   // Make sure the table has a tbody
   const table = document.getElementById("teamTable");
   if (!table.querySelector("tbody")) {
     const tbody = document.createElement("tbody");
     table.appendChild(tbody);
   }
   
   for (let i = 1; i <= 5; i++) {
       addTeam();
   }
   
   // Reset the dataModified flag after initial setup
   dataModified = false;
   
   // Add event listener to the submit scores button
   const submitButton = document.getElementById('submitScores');
   if (submitButton) {
       submitButton.addEventListener('click', async function() {
           // Ensure all scores are up to date
           for (let i = 1; i <= teamCount; i++) {
               updateScores(i);
           }
           
           // Collect the data
           const scoresData = collectTeamData();
           
           // Show confirmation dialog with options
           const action = confirm('Do you want to submit scores to the Firebase database? Click OK to submit, or Cancel to save as a local file.');
           
           if (action) {
               try {
                   // User chose to submit to Firebase
                   const result = await sendDataToAPI(scoresData);
                   alert('Scores submitted successfully to Firebase!');
               } catch (error) {
                   // API submission failed, offer to save locally as fallback
                   if (confirm('Firebase submission failed. Would you like to save the data locally instead?')) {
                       saveDataLocally(scoresData);
                   }
               }
           } else {
               // User chose to save locally
               saveDataLocally(scoresData);
           }
       });
   }
   
   // Add event listener for the search input
   const searchInput = document.getElementById('teamSearch');
   if (searchInput) {
       // Search when Enter key is pressed
       searchInput.addEventListener('keyup', function(event) {
           if (event.key === 'Enter') {
               searchTeams();
           }
           
           // Clear highlights if the search field is emptied
           if (this.value.trim() === '') {
               clearHighlights();
           }
       });
       
       // Add auto-search functionality after a short delay of typing
       searchInput.addEventListener('input', debounce(function() {
           if (this.value.trim().length >= 2) {
               searchTeams();
           } else {
               clearHighlights();
           }
       }, 300));
   }
};
