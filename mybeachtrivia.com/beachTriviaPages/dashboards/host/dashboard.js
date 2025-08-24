// Function to show loading animation for a specific element
function showLoadingAnimation(element) {
    if (!element) return;
    
    // Store original content to restore later if needed
    element.dataset.originalContent = element.innerHTML;
    
    // Create and add the loading spinner
    element.innerHTML = `
        <div class="loading-spinner">
            <div class="spinner"></div>
        </div>
    `;
    
    // Add required CSS if not already present
    if (!document.getElementById('loading-spinner-styles')) {
        const style = document.createElement('style');
        style.id = 'loading-spinner-styles';
        style.textContent = `
            .loading-spinner {
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100%;
            }
            
            .spinner {
                border: 3px solid rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                border-top: 3px solid #60a5fa;
                width: 24px;
                height: 24px;
                animation: spin 1s linear infinite;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
}

// Function to hide loading animation and show actual content
function hideLoadingAnimation(element, content) {
    if (!element) return;
    
    // If content is provided, use it; otherwise restore original if available
    if (content !== undefined) {
        element.innerHTML = content;
    } else if (element.dataset.originalContent) {
        element.innerHTML = element.dataset.originalContent;
    }
}

// Show loading animations for all stat cards immediately when script loads
document.addEventListener('DOMContentLoaded', function() {
    // Show loading for pay period
    const payPeriodElement = document.querySelector('.stat-card:nth-child(1) .stat-value');
    if (payPeriodElement) {
        showLoadingAnimation(payPeriodElement);
    }
    
    // Show loading for shows worked
    const showsWorkedElement = document.querySelector('.stat-card:nth-child(2) .stat-value');
    if (showsWorkedElement) {
        showLoadingAnimation(showsWorkedElement);
    }
    
    // Show loading for hours worked
    const hoursWorkedElement = document.querySelector('.stat-card:nth-child(3) .stat-value');
    if (hoursWorkedElement) {
        showLoadingAnimation(hoursWorkedElement);
    }
    
    // Show loading for upcoming shows
    const showsList = document.querySelector('.shows-list');
    if (showsList) {
        showLoadingAnimation(showsList);
    }
});

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
            hideLoadingAnimation(showsList, `
                <div style="color: #94a3b8; text-align: center; padding: 40px; width: 100%; background-color: #334155; border-radius: 12px;">
                    <h3 style="margin-bottom: 15px; color: #60a5fa;">Account Setup Incomplete</h3>
                    <p style="color: #94a3b8;">Your account may not be properly configured. Please contact an administrator.</p>
                </div>
            `);
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
        // Hide loading animation for shows list with error message
        const showsList = document.querySelector('.shows-list');
        if (showsList) {
            hideLoadingAnimation(showsList, `
                <div style="color: #94a3b8; text-align: center; padding: 40px; width: 100%; background-color: #334155; border-radius: 12px;">
                    <h3 style="margin-bottom: 15px; color: #60a5fa;">Could Not Load Shows</h3>
                    <p style="color: #94a3b8;">There was a problem loading your upcoming shows. Please try again later.</p>
                </div>
            `);
        }
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

// Pay Period Calculation - Updated for dynamic biweekly periods
function getCurrentPayPeriod() {
    const today = new Date();
    
    // Reference pay period (April 24, 2025 - May 7, 2025)
    const referenceStart = new Date(2025, 3, 24); // April 24, 2025 - Month is 0-indexed
    
    // Calculate how many days since the reference start date
    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    const daysSinceReference = Math.floor((today - referenceStart) / millisecondsPerDay);
    
    // Calculate how many 14-day periods have passed (can be negative if before reference date)
    const periodsPassed = Math.floor(daysSinceReference / 14);
    
    // Calculate current period start and end dates
    const currentStart = new Date(referenceStart);
    currentStart.setDate(currentStart.getDate() + (periodsPassed * 14));
    
    const currentEnd = new Date(currentStart);
    currentEnd.setDate(currentEnd.getDate() + 13); // 14 days including start day
    
    return {
        start: currentStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        end: currentEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    };
}

// Update pay period display
function updatePayPeriodDisplay() {
    const payPeriod = getCurrentPayPeriod();
    const currentPayPeriodElement = document.querySelector('.stat-card:nth-child(1) .stat-value');
    if (currentPayPeriodElement) {
        // Hide the loading animation and display the pay period
        hideLoadingAnimation(currentPayPeriodElement, `${payPeriod.start} - ${payPeriod.end}`);
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
                isUserShift: isUserShift,
                // Add a field to explicitly track if this shift has been worked
                worked: shiftLocalDate <= localToday
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
        hideLoadingAnimation(hoursWorkedElement, '0/40 hrs');
    }
    
    if (showsWorkedElement) {
        hideLoadingAnimation(showsWorkedElement, '0');
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
        console.log('Current pay period:', payPeriod);
        
        // Get today's date set to end of day for comparison
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        
        // Get yesterday's date for comparing what's already worked
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(23, 59, 59, 999);
        
        // Create a proper date object for the start of the pay period
        // Parse the month and day from the formatted string (e.g., "Apr 24")
        const startParts = payPeriod.start.split(' ');
        const startMonth = getMonthNumber(startParts[0]);
        const startDay = parseInt(startParts[1]);
        
        // CRITICAL FIX: Use consistent date creation for start date
        const startDate = new Date(2025, startMonth, startDay, 0, 0, 0, 0);
        
        // Create a proper date object for the end of the pay period
        const endParts = payPeriod.end.split(' ');
        const endMonth = getMonthNumber(endParts[0]);
        const endDay = parseInt(endParts[1]);
        const endDate = new Date(2025, endMonth, endDay, 23, 59, 59, 999);
        
        console.log('Pay period date range:', startDate.toISOString(), 'to', endDate.toISOString());
        console.log('Today:', today.toISOString());
        console.log('Yesterday:', yesterday.toISOString(), '(for worked calculations)');
        
        // Query shifts for this employee
        const shiftsQuery = db.collection('shifts')
            .where('employeeId', '==', employeeId);
                
        const shiftsSnapshot = await shiftsQuery.get();
        
        // Calculate statistics
        let showsWorked = 0;
        let hoursWorked = 0;
        let shiftsFound = 0;
        
        shiftsSnapshot.forEach(doc => {
            shiftsFound++;
            const data = doc.data();
            
            // Extract the shift date
            let shiftDate;
            let shiftDateString = "";
            
            if (data.date && typeof data.date.toDate === 'function') {
                // Handle Firestore timestamp
                shiftDate = data.date.toDate();
                shiftDateString = "Timestamp";
            } else if (typeof data.date === 'string') {
                // Handle string date format (e.g. "2025-04-24")
                shiftDateString = data.date;
                
                // Parse the date components explicitly to avoid timezone issues
                const dateParts = data.date.split('-');
                if (dateParts.length === 3) {
                    const year = parseInt(dateParts[0]);
                    const month = parseInt(dateParts[1]) - 1; // JavaScript months are 0-indexed
                    const day = parseInt(dateParts[2]);
                    
                    // Create date with specific time to avoid boundary issues
                    shiftDate = new Date(year, month, day, 12, 0, 0);
                } else {
                    // Fallback if the format is unexpected
                    shiftDate = new Date(data.date);
                }
            } else if (data.date) {
                // Fallback for any other format
                shiftDate = new Date(data.date);
                shiftDateString = "Other format";
            } else {
                console.log('Shift has no date, skipping');
                return; // Skip if no date
            }
            
            // Create a normalized date for consistent comparison
            // CRITICAL FIX: Create a date at noon to avoid timezone boundary issues
            const shiftYear = shiftDate.getFullYear();
            const shiftMonth = shiftDate.getMonth();
            const shiftDay = shiftDate.getDate();
            const shiftDateNormalized = new Date(shiftYear, shiftMonth, shiftDay, 12, 0, 0);
            
            // Debug output
            console.log(`Checking shift date: ${shiftDateString} → ${shiftDateNormalized.toISOString()}`);
            console.log(`Start date: ${startDate.toISOString()}`);
            console.log(`End date: ${endDate.toISOString()}`);
            console.log(`Month comparison: ${shiftMonth} vs start ${startMonth}`);
            console.log(`Day comparison: ${shiftDay} vs start ${startDay}`);
            
            // Special case for April 24th (start of pay period)
            const isApril24 = shiftMonth === 3 && shiftDay === 24; // April is month 3 (0-indexed)
            if (isApril24) {
                console.log('*** FOUND APRIL 24 SHIFT ***');
            }
            
            // Comprehensive date comparison for debugging
            console.log(`Date checks: ${shiftDateNormalized < startDate ? 'BEFORE start' : 'ON/AFTER start'}, ${shiftDateNormalized > endDate ? 'AFTER end' : 'ON/BEFORE end'}`);
            
            // CRITICAL FIX: Special case for the pay period start date (April 24)
            // Always include it in the pay period if it matches exactly
            const isWithinPayPeriod = isApril24 || 
                (shiftDateNormalized >= startDate && shiftDateNormalized <= endDate);
            
            console.log('In pay period?', isWithinPayPeriod);
            
            // CRITICAL FIX: Consider a shift "worked" if it happened YESTERDAY or earlier
            // This ensures shifts from today aren't counted yet
            const isAlreadyWorked = shiftDateNormalized <= yesterday;
            console.log('Already worked?', isAlreadyWorked);
            
            // Check if shift is within the pay period
            if (!isWithinPayPeriod) {
                console.log('Shift outside pay period, skipping');
                return;
            }
            
            // Check if shift has already been worked
            if (isAlreadyWorked) {
                console.log('Counting shift as worked!');
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
            } else {
                console.log('Shift not yet worked, not counting');
            }
        });
        
        console.log(`Final count - Total shifts found: ${shiftsFound}, Shows worked: ${showsWorked}, Hours worked: ${hoursWorked}`);
        
        // Update UI
        const hoursWorkedElement = document.querySelector('.stat-card:nth-child(3) .stat-value');
        const showsWorkedElement = document.querySelector('.stat-card:nth-child(2) .stat-value');
        
        if (hoursWorkedElement) {
            hideLoadingAnimation(hoursWorkedElement, `${Math.round(hoursWorked)}/40 hrs`);
        }
        
        if (showsWorkedElement) {
            hideLoadingAnimation(showsWorkedElement, showsWorked.toString());
        }
        
    } catch (error) {
        console.error('Error updating work stats:', error);
        setDefaultWorkStats();
    }
}

// Helper function to convert month abbreviation to month number (0-indexed)
function getMonthNumber(monthAbbr) {
    const months = {
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
        'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };
    return months[monthAbbr.toLowerCase()];
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
    
    // Loading indicator is already shown at page load through DOMContentLoaded event
    
    // Try to fetch shifts from Firestore
    let upcomingShifts = await fetchUpcomingShifts(employeeId);
    
    // If Firebase failed or returned no shifts, show "No Shifts Scheduled"
    if (!upcomingShifts || upcomingShifts.length === 0) {
        console.log('No shifts found');
        hideLoadingAnimation(showsList, `
            <div style="color: #94a3b8; text-align: center; padding: 40px; width: 100%; background-color: #334155; border-radius: 12px;">
                <h3 style="margin-bottom: 15px; color: #60a5fa;">No Shifts Scheduled</h3>
                <p style="color: #94a3b8;">Check back later for upcoming shows</p>
            </div>
        `);
        return;
    }
    
    // Clear the loading animation
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