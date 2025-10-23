// Pay Period Calculation
function getCurrentPayPeriod() {
    const today = new Date();
    
    const payPeriods = [
        { start: new Date(2024, 2, 14), end: new Date(2024, 2, 27) },
        { start: new Date(2024, 2, 28), end: new Date(2024, 3, 11) },
        { start: new Date(2024, 3, 12), end: new Date(2024, 3, 25) }
    ];

    const currentPeriod = payPeriods.find(period => 
        today >= period.start && today <= period.end
    );

    if (currentPeriod) {
        return {
            start: currentPeriod.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            end: currentPeriod.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        };
    }

    return { start: 'Mar 14', end: 'Mar 27' }; // Default to first pay period
}

// Update pay period display
function updatePayPeriodDisplay() {
    const payPeriod = getCurrentPayPeriod();
    const currentPayPeriodElement = document.querySelector('.stat-card:nth-child(1) .stat-value');
    if (currentPayPeriodElement) {
        currentPayPeriodElement.textContent = `${payPeriod.start} - ${payPeriod.end}`;
    }
}

// Function to generate a random date between two dates
function getRandomDate(start, end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const timeDiff = endDate.getTime() - startDate.getTime();
    const randomTime = startDate.getTime() + Math.random() * timeDiff;
    return new Date(randomTime);
}

// Upcoming Shows Data with dates
const upcomingShows = [
    { 
        title: 'Classic Trivia', 
        time: '7:00pm - 9:00pm', 
        location: "Warrior's Tap House",
        date: new Date() // Today's date
    },
    { 
        title: 'Music Bingo', 
        time: '7:00pm - 9:00pm', 
        location: 'Tradition Brewing',
        date: getRandomDate(new Date(), new Date(2025, 4, 30))
    },
    { 
        title: 'Classic Bingo', 
        time: '7:00pm - 9:00pm', 
        location: 'Voodoo Brewing',
        date: getRandomDate(new Date(), new Date(2025, 4, 30))
    },
    { 
        title: 'Themed Trivia', 
        time: '7:00pm - 9:00pm', 
        location: 'Scotty Quixx',
        date: getRandomDate(new Date(), new Date(2025, 4, 30))
    },
    { 
        title: 'Beach Feud', 
        time: '7:00pm - 9:00pm', 
        location: 'Wing King VB',
        date: getRandomDate(new Date(), new Date(2025, 4, 30))
    },
    { 
        title: 'Classic Trivia', 
        time: '7:00pm - 9:00pm', 
        location: "Warrior's Tap House",
        date: getRandomDate(new Date(), new Date(2025, 4, 30))
    },
    { 
        title: 'Music Bingo', 
        time: '7:00pm - 9:00pm', 
        location: 'Tradition Brewing',
        date: getRandomDate(new Date(), new Date(2025, 4, 30))
    }
].sort((a, b) => a.date - b.date);

// Render Upcoming Shows
function renderUpcomingShows() {
    const showsList = document.querySelector('.shows-list');
    
    if (!showsList) {
        console.error('ERROR: Shows list element not found. Check your HTML.');
        return;
    }
    
    showsList.innerHTML = '';

    // Get today's date and reset the time portion for proper comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    upcomingShows.forEach((show) => {
        const showCard = document.createElement('div');
        showCard.classList.add('show-card');
        
        // Check if the show is today
        const showDate = new Date(show.date);
        showDate.setHours(0, 0, 0, 0);
        
        if (showDate.getTime() === today.getTime()) {
            showCard.classList.add('today-show');
        }
        
        // Format date to make it more readable
        const formattedDate = show.date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });

        showCard.innerHTML = `
            <div class="show-date">${formattedDate}</div>
            <div class="show-title">${show.title}</div>
            <div class="show-time">${show.time}</div>
            <div class="show-location">${show.location}</div>
        `;
        showsList.appendChild(showCard);
    });
}

// Add Task (simplified)
function addTask() {
    const newTask = {
        title: prompt('Enter task title:')
    };
    
    if (newTask.title) {
        // Placeholder for future task management
        console.log('Task added:', newTask.title);
    }
}

// Logout user function - safe implementation to avoid recursion
function handleLogout() {
    console.log('Initiating logout process...');
    
    // Try to use Firebase if available
    if (typeof firebase !== 'undefined' && firebase.auth) {
        console.log('Firebase auth detected, using signOut()');
        firebase.auth().signOut().then(() => {
            // Clear session storage
            sessionStorage.clear();
            // Redirect to login page
            window.location.href = '/login.html';
        }).catch(error => {
            console.error('Error signing out:', error);
            // Fallback - just clear storage and redirect
            sessionStorage.clear();
            localStorage.removeItem('rememberedEmail');
            window.location.href = '/login.html';
        });
    } else {
        console.log('Firebase auth not detected, using manual logout');
        // Last resort - just clear storage and redirect
        sessionStorage.clear();
        localStorage.removeItem('rememberedEmail');
        window.location.href = '/login.html';
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Dashboard
    updatePayPeriodDisplay();
    renderUpcomingShows();
    
    // Add event listener for task button
    const addTaskBtn = document.getElementById('add-task-btn');
    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', addTask);
    }
    
    // Add event listener for logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            handleLogout();
        });
    }
    
    // Add a direct fix to remove any "Don't be late!" text
    setTimeout(() => {
        removeLateText();
    }, 100);
});

// Function to directly remove any "Don't be late!" text from today's card
function removeLateText() {
    // Find all elements inside today's card
    document.querySelectorAll('.today-show *').forEach(element => {
        // Check if this element contains the text
        if (element.textContent.includes("Don't be late!")) {
            // If it's not one of our main elements, hide it
            if (!element.classList.contains('show-date') && 
                !element.classList.contains('show-title') && 
                !element.classList.contains('show-time') && 
                !element.classList.contains('show-location')) {
                element.style.display = 'none';
            }
        }
    });
    
    // Also check for text nodes directly inside the card
    document.querySelectorAll('.today-show').forEach(card => {
        card.childNodes.forEach(node => {
            if (node.nodeType === 3 && node.textContent.includes("Don't be late!")) {
                node.textContent = '';
            }
        });
    });
}