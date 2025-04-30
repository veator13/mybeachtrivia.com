// Authentication state listener - runs when page loads
firebase.auth().onAuthStateChanged(user => {
    if (user) {
        console.log('User logged in:', user.email);
        // Initialize the dashboard with the authenticated user
        initializeDashboard(user);
    } else {
        console.log('No user logged in, redirecting to login page');
        // In production, redirect to login page
        window.location.href = '/login.html';
    }
});

// Dashboard initialization function
async function initializeDashboard(user) {
    console.log('Initializing dashboard for user:', user.email || 'Anonymous');
    
    // Update display with user data
    updateUserDisplay(user);
    
    // Initialize Dashboard with data
    updatePayPeriodDisplay();
    
    // Get employee ID for this user
    const employeeId = await getCurrentEmployeeId(user);
    
    if (!employeeId) {
        console.error('Could not retrieve employee ID. Some features may be unavailable.');
        // Show a message to the user
        const showsList = document.querySelector('.shows-list');
        if (showsList) {
            showsList.innerHTML = `
                <div style="color: #94a3b8; text-align: center; padding: 40px; width: 100%; background-color: #334155; border-radius: 12px;">
                    <h3 style="margin-bottom: 15px; color: #60a5fa;">Account Setup Incomplete</h3>
                    <p style="color: #94a3b8;">Your account may not be properly configured. Please contact an administrator.</p>
                </div>
            `;
        }
        setDefaultWorkStats();
        return;
    }
    
    // Try to update work stats
    updateWorkStats(employeeId).catch(error => {
        console.error('Error updating work stats:', error);
        setDefaultWorkStats();
    });
    
    // Start loading shows - will use fallback data if Firebase fails
    renderUpcomingShows(employeeId).catch(error => {
        console.error('Error rendering upcoming shows:', error);
    });
    
    // Set up event listeners
    setupEventListeners();
}

// Function to update the UI with user info
function updateUserDisplay(user) {
    const usernameElement = document.querySelector('.username');
    if (!usernameElement) return;
    
    // Check sessionStorage first for user information
    const storedUserEmail = sessionStorage.getItem('userEmail');
    
    // Default to email if we can't find name
    let displayName = storedUserEmail || user.email || 'User';
    
    // Try to get display name from user object
    if (user.displayName) {
        displayName = user.displayName;
    }
    
    // Update the UI
    usernameElement.textContent = displayName;
}

// Set up event listeners
function setupEventListeners() {
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
    
    // Remove "Don't be late!" text
    setTimeout(() => {
        removeLateText();
    }, 100);
}

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

// Pay Period Calculation
function getCurrentPayPeriod() {
    const today = new Date();
    
    const payPeriods = [
        { start: new Date(2024, 2, 14), end: new Date(2024, 2, 27) },
        { start: new Date(2024, 2, 28), end: new Date(2024, 3, 10) },
        { start: new Date(2024, 3, 11), end: new Date(2024, 3, 24) },
        { start: new Date(2024, 3, 25), end: new Date(2024, 4, 8) },
        { start: new Date(2024, 4, 9), end: new Date(2024, 4, 22) },
        { start: new Date(2024, 4, 23), end: new Date(2024, 5, 6) }
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

    return { start: 'Apr 23', end: 'May 6' }; // Default to current pay period
}

// Update pay period display
function updatePayPeriodDisplay() {
    const payPeriod = getCurrentPayPeriod();
    const currentPayPeriodElement = document.querySelector('.stat-card:nth-child(1) .stat-value');
    if (currentPayPeriodElement) {
        currentPayPeriodElement.textContent = `${payPeriod.start} - ${payPeriod.end}`;
    }
}

// Check if Firebase is properly initialized
function isFirebaseInitialized() {
    return typeof firebase !== 'undefined' && 
           firebase.firestore && 
           firebase.auth;
}

// Get the current user's employee ID from Firestore
async function getCurrentEmployeeId(user) {
    // First check if employee ID is already in sessionStorage from login
    const storedUserId = sessionStorage.getItem('userId');
    if (storedUserId) {
        console.log('Using employee ID from session storage:', storedUserId);
        return storedUserId;
    }
    
    // Check if Firebase is initialized
    if (!isFirebaseInitialized()) {
        console.error('Firebase is not initialized, cannot get employee ID');
        return null;
    }
    
    // If user param is provided, use it; otherwise get current user
    const currentUser = user || firebase.auth().currentUser;
    
    if (!currentUser) {
        console.error('No user is currently logged in');
        return null;
    }
    
    try {
        console.log('Finding employee ID for email:', currentUser.email);
        
        // Query the employees collection to find the document with this email
        const db = firebase.firestore();
        const employeesSnapshot = await db.collection('employees')
            .where('email', '==', currentUser.email)
            .limit(1)
            .get();
        
        if (employeesSnapshot.empty) {
            console.error(`No employee found with email: ${currentUser.email}`);
            return null;
        }
        
        // Get the first matching employee
        const employeeData = employeesSnapshot.docs[0].data();
        const employeeId = employeesSnapshot.docs[0].id;
        
        console.log(`Found employee ID: ${employeeId}`);
        
        // Update user display name with employee name if available
        const usernameElement = document.querySelector('.username');
        if (usernameElement && employeeData.name) {
            usernameElement.textContent = employeeData.name;
        }
        
        // Store the ID in sessionStorage for future use
        sessionStorage.setItem('userId', employeeId);
        
        return employeeId;
    } catch (error) {
        console.error('Error finding employee ID:', error);
        return null;
    }
}

// Fetch upcoming shifts from Firestore for the current employee
async function fetchUpcomingShifts(employeeId) {
    // Validate inputs and Firebase initialization
    if (!employeeId) {
        console.error('No employee ID provided');
        return [];
    }
    
    if (!isFirebaseInitialized()) {
        console.error('Firebase not initialized');
        return [];
    }

    try {
        console.log('Fetching shifts for employee:', employeeId);
        const db = firebase.firestore();
        
        // Get today's date with time set to midnight
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Try the most efficient query first
        const shiftsQuery = db.collection('shifts')
            .where('employeeId', '==', employeeId);

        try {
            const shiftsSnapshot = await shiftsQuery.get();
            console.log(`Found ${shiftsSnapshot.size} shifts for employee`);
            
            if (!shiftsSnapshot.empty) {
                // We'll do date filtering in processShiftsSnapshot
                return processShiftsSnapshot(shiftsSnapshot, true, today);
            }
        } catch (error) {
            console.warn('Error querying shifts:', error);
        }
        
        // If we get here, we didn't find any shifts
        console.log('No shifts found');
        return [];
        
    } catch (error) {
        console.error('Error fetching shifts:', error);
        return [];
    }
}

// Helper function to process Firestore snapshot and convert to readable format
// This function has been updated to properly handle timezone differences
function processShiftsSnapshot(snapshot, isUserShift, today) {
    const shifts = [];
    
    // Set today to midnight in local time zone
    const localToday = new Date();
    localToday.setHours(0, 0, 0, 0);
    
    snapshot.forEach(doc => {
        const data = doc.data();
        
        // Convert date to JavaScript Date with timezone handling
        let shiftDate;
        
        if (typeof data.date === 'string') {
            // Handle string date format (e.g. "2025-05-01")
            shiftDate = new Date(data.date);
            
            // CRITICAL FIX: For string dates, ensure we're using the date as specified
            // This prevents timezone conversion issues that cause the off-by-one day problem
            const dateParts = data.date.split('-');
            if (dateParts.length === 3) {
                const year = parseInt(dateParts[0]);
                const month = parseInt(dateParts[1]) - 1; // JavaScript months are 0-indexed
                const day = parseInt(dateParts[2]);
                
                // Create date with local timezone at noon (to avoid any day-boundary issues)
                shiftDate = new Date(year, month, day, 12, 0, 0);
            }
        } else if (data.date && typeof data.date.toDate === 'function') {
            // Handle Firestore timestamp
            const timestamp = data.date.toDate();
            
            // CRITICAL FIX: Create a new date object using local date components to prevent timezone shifts
            // This ensures the date is interpreted exactly as stored in Firestore
            const year = timestamp.getFullYear();
            const month = timestamp.getMonth();
            const day = timestamp.getDate();
            
            // Create date with local timezone at noon (to avoid any day-boundary issues)
            shiftDate = new Date(year, month, day, 12, 0, 0);
        } else if (data.date) {
            // Fallback for any other format
            const fallbackDate = new Date(data.date);
            
            // Create date with local timezone at noon (to avoid any day-boundary issues)
            shiftDate = new Date(
                fallbackDate.getFullYear(),
                fallbackDate.getMonth(),
                fallbackDate.getDate(),
                12, 0, 0
            );
        } else {
            // Default to current date if no date is provided
            const now = new Date();
            shiftDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
        }
        
        // Create a date with time set to noon in local timezone for stable comparison
        // Using noon ensures we're well away from day boundaries when comparing
        const shiftLocalDate = new Date(
            shiftDate.getFullYear(),
            shiftDate.getMonth(),
            shiftDate.getDate(),
            12, 0, 0
        );
        
        // Only include shifts with dates today or in the future
        if (shiftLocalDate >= localToday) {
            shifts.push({
                id: doc.id,
                title: data.type || 'Shift',
                time: `${data.startTime || '7:00 PM'} - ${data.endTime || '9:00 PM'}`,
                location: data.location || '',
                date: shiftDate,  // Store the date with noon time
                localDate: shiftLocalDate,  // Store a normalized date for comparison
                isUserShift: isUserShift
            });
        }
    });

    // Sort shifts by date
    shifts.sort((a, b) => a.date - b.date);
    return shifts;
}

// Default work stats when Firestore data is unavailable
function setDefaultWorkStats() {
    const hoursWorkedElement = document.querySelector('.stat-card:nth-child(3) .stat-value');
    const showsWorkedElement = document.querySelector('.stat-card:nth-child(2) .stat-value');
    
    if (hoursWorkedElement) {
        hoursWorkedElement.textContent = '0/40 hrs';
    }
    
    if (showsWorkedElement) {
        showsWorkedElement.textContent = '0';
    }
}

// Update work statistics based on employee shifts
async function updateWorkStats(employeeId) {
    if (!employeeId || !isFirebaseInitialized()) {
        setDefaultWorkStats();
        return;
    }
    
    try {
        const db = firebase.firestore();
        
        // Get current pay period
        const payPeriod = getCurrentPayPeriod();
        
        // Convert to Date objects for comparison
        const startDate = new Date(payPeriod.start + ", 2024");
        const endDate = new Date(payPeriod.end + ", 2024");
        
        // Set time to beginning and end of day
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        
        // Query shifts for this employee
        const shiftsQuery = db.collection('shifts')
            .where('employeeId', '==', employeeId);
                
        const shiftsSnapshot = await shiftsQuery.get();
        
        // Calculate statistics
        let showsWorked = 0;
        let hoursWorked = 0;
        
        shiftsSnapshot.forEach(doc => {
            const data = doc.data();
            
            // Check if the shift is in the current pay period
            let shiftDate;
            if (data.date && typeof data.date.toDate === 'function') {
                shiftDate = data.date.toDate();
            } else if (typeof data.date === 'string') {
                shiftDate = new Date(data.date);
            } else if (data.date) {
                shiftDate = new Date(data.date);
            } else {
                return; // Skip if no date
            }
            
            // Create a normalized date for comparison
            const shiftDateNormalized = new Date(shiftDate);
            shiftDateNormalized.setHours(0, 0, 0, 0);
            
            // Create normalized dates for start and end of pay period
            const startDateNormalized = new Date(startDate);
            startDateNormalized.setHours(0, 0, 0, 0);
            
            const endDateNormalized = new Date(endDate);
            endDateNormalized.setHours(0, 0, 0, 0);
            
            // Skip shifts outside the pay period
            if (shiftDateNormalized < startDateNormalized || shiftDateNormalized > endDateNormalized) {
                return;
            }
            
            showsWorked++;
            
            // Calculate hours if startTime and endTime are available
            if (data.startTime && data.endTime) {
                // Simple calculation (assuming format like "7:00 PM")
                try {
                    const start = parseTimeString(data.startTime);
                    const end = parseTimeString(data.endTime);
                    
                    // Calculate hours
                    let hours = (end - start) / (1000 * 60 * 60);
                    
                    // Handle overnight shifts
                    if (hours < 0) {
                        hours += 24;
                    }
                    
                    hoursWorked += hours;
                } catch (e) {
                    // Default to 2 hours if can't calculate
                    hoursWorked += 2;
                }
            } else {
                // Default to 2 hours if times not available
                hoursWorked += 2;
            }
        });
        
        // Update UI
        const hoursWorkedElement = document.querySelector('.stat-card:nth-child(3) .stat-value');
        const showsWorkedElement = document.querySelector('.stat-card:nth-child(2) .stat-value');
        
        if (hoursWorkedElement) {
            hoursWorkedElement.textContent = `${Math.round(hoursWorked)}/40 hrs`;
        }
        
        if (showsWorkedElement) {
            showsWorkedElement.textContent = showsWorked.toString();
        }
        
    } catch (error) {
        console.error('Error updating work stats:', error);
        setDefaultWorkStats();
    }
}

// Helper function to parse time strings like "7:00 PM"
function parseTimeString(timeStr) {
    try {
        // Create a date object for today
        const date = new Date();
        
        // Split the time string
        const timeParts = timeStr.match(/(\d+):(\d+)\s*([AP]M)?/i);
        
        if (!timeParts) {
            throw new Error(`Invalid time format: ${timeStr}`);
        }
        
        let hours = parseInt(timeParts[1]);
        const minutes = parseInt(timeParts[2]);
        const isPM = timeParts[3] && timeParts[3].toUpperCase() === 'PM';
        
        // Convert to 24-hour format
        if (isPM && hours < 12) {
            hours += 12;
        } else if (!isPM && hours === 12) {
            hours = 0;
        }
        
        // Set the time
        date.setHours(hours, minutes, 0, 0);
        
        return date;
    } catch (e) {
        console.error(`Error parsing time: ${timeStr}`, e);
        throw e;
    }
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

// Handle logout - safe implementation to avoid recursion
function handleLogout() {
    console.log('Initiating logout process...');
    
    // Try to use Firebase if available
    if (isFirebaseInitialized()) {
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

// Render Upcoming Shows/Shifts
async function renderUpcomingShows(employeeId) {
    const showsList = document.querySelector('.shows-list');
    
    if (!showsList) {
        console.error('ERROR: Shows list element not found. Check your HTML.');
        return;
    }
    
    showsList.innerHTML = '<div style="color: white; text-align: center; padding: 20px;">Loading shifts...</div>';
    
    // Try to fetch shifts from Firestore
    let upcomingShifts = await fetchUpcomingShifts(employeeId);
    
    // If Firebase failed or returned no shifts, show "No Shifts Scheduled"
    if (!upcomingShifts || upcomingShifts.length === 0) {
        console.log('No shifts found');
        showsList.innerHTML = `
            <div style="color: #94a3b8; text-align: center; padding: 40px; width: 100%; background-color: #334155; border-radius: 12px;">
                <h3 style="margin-bottom: 15px; color: #60a5fa;">No Shifts Scheduled</h3>
                <p style="color: #94a3b8;">Check back later for upcoming shows</p>
            </div>
        `;
        return;
    }
    
    showsList.innerHTML = '';
    
    // Get today's date set to noon in local timezone for stable comparison
    let today = new Date();
    today = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);

    upcomingShifts.forEach((shift) => {
        const showCard = document.createElement('div');
        showCard.classList.add('show-card');
        
        // Add a special class if this is the user's own shift
        if (shift.isUserShift) {
            showCard.classList.add('user-shift');
        }
        
        // Check if the shift is today by comparing normalized dates at noon
        // This ensures stable timezone comparisons
        if (shift.localDate.getTime() === today.getTime()) {
            showCard.classList.add('today-show');
            
            // Add "TODAY" label
            const todayLabel = document.createElement('div');
            todayLabel.classList.add('today-label');
            todayLabel.textContent = 'TODAY';
            showCard.appendChild(todayLabel);
        }
        
        // Use more explicit date extraction to prevent timezone shifts
        const shiftDate = shift.date;
        const dayAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][shiftDate.getDay()];
        const monthAbbr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][shiftDate.getMonth()];
        const dayNum = shiftDate.getDate();

        showCard.innerHTML += `
            <div class="show-date">${dayAbbr}, ${monthAbbr} ${dayNum}</div>
            <div class="show-title">${shift.title}</div>
            <div class="show-time">${shift.time}</div>
            <div class="show-location">${shift.location}</div>
        `;
        showsList.appendChild(showCard);
    });
}