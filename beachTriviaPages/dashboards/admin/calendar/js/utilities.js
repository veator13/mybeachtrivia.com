// Escape HTML to prevent XSS
function escapeHTML(str) {
    if (!str) return '';
    
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Helper functions with caching and optimization
function formatDate(date) {
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    
    // Check cache first
    if (cache.dateStrings[key]) {
        return cache.dateStrings[key];
    }
    
    // Generate and cache the formatted date
    const formatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    cache.dateStrings[key] = formatted;
    
    return formatted;
}

// Check if a date is today
function isDateToday(date) {
    const today = new Date();
    return date.getDate() === today.getDate() && 
           date.getMonth() === today.getMonth() && 
           date.getFullYear() === today.getFullYear();
}

// Get readable date string for accessibility
function getReadableDateString(date) {
    return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
}

// Get month and year string
function getMonthYearString(year, month) {
    try {
        return new Date(year, month).toLocaleDateString('en-US', { 
            month: 'long', 
            year: 'numeric' 
        });
    } catch (error) {
        console.error('Error formatting month/year:', error);
        return `${month + 1}/${year}`;
    }
}

// Optimized time conversion with error handling
function convertTimeToMinutes(timeStr) {
    // Check cache first
    if (cache.timeMinutes[timeStr] !== undefined) {
        return cache.timeMinutes[timeStr];
    }
    
    try {
        if (!timeStr) return 0;
        
        const [timePart, ampm] = timeStr.split(' ');
        if (!timePart || !ampm) return 0;
        
        let [hours, minutes] = timePart.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) return 0;
        
        // Convert 12-hour format to 24-hour
        if (ampm === 'PM' && hours < 12) {
            hours += 12;
        } else if (ampm === 'AM' && hours === 12) {
            hours = 0;
        }
        
        const totalMinutes = hours * 60 + minutes;
        
        // Cache the result
        cache.timeMinutes[timeStr] = totalMinutes;
        
        return totalMinutes;
    } catch (error) {
        console.error('Error converting time to minutes:', error);
        return 0;
    }
}

// Default times function with fixed 7:00 PM - 9:00 PM defaults
function getDefaultTimes() {
    return {
        start: "7:00 PM",
        end: "9:00 PM"
    };
}

// Debounce function to limit frequent calls
function debounce(func, wait) {
    let timeout;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(context, args);
        }, wait);
    };
}

// Create a debounced version of renderCalendar
const debouncedRender = debounce(renderCalendar, 50);

// Maintain a counter for sequential IDs within the same timestamp
let idSequenceCounter = 0;

// Generate a truly unique ID for new shifts - safe for batch operations
function generateUniqueId() {
    // Base timestamp (only changes every second)
    const timeStamp = Date.now();
    
    // Increment the sequence counter for each call within the same timestamp
    idSequenceCounter = (idSequenceCounter + 1) % 1000;
    
    // Get a random component for extra uniqueness
    const randomComponent = Math.floor(Math.random() * 1000);
    
    // Get the maximum ID with better error handling
    const maxId = shifts.length > 0 
        ? Math.max(...shifts.map(s => s.id !== undefined ? parseInt(s.id) : 0)) + 100000 
        : 100000;
    
    // Generate a composite ID using base, sequence, and random components
    const candidateId = maxId + (idSequenceCounter * 1000) + randomComponent;
    
    // Double check this ID isn't already in use
    if (shifts.some(s => s.id === candidateId)) {
        console.log(`ID ${candidateId} already exists, regenerating with extra offset`);
        // Add an even larger offset and more randomness
        return maxId + 200000 + Math.floor(Math.random() * 100000);
    }
    
    console.log(`Generated new unique ID: ${candidateId}`);
    return candidateId;
}

// Generate a batch of unique IDs - for operations that create multiple shifts at once
function generateBatchUniqueIds(count) {
    if (count <= 0) return [];
    
    // Create an array to hold the batch of IDs
    const batchIds = [];
    
    // Base values to work with
    const baseTime = Date.now();
    const maxId = shifts.length > 0 
        ? Math.max(...shifts.map(s => s.id !== undefined ? parseInt(s.id) : 0)) + 100000 
        : 100000;
    
    // Generate the requested number of guaranteed unique IDs
    for (let i = 0; i < count; i++) {
        // Each ID combines:
        // 1. A base maxId (highest current ID + offset)
        // 2. A position in sequence (i * 1000)
        // 3. A random component (0-999)
        // 4. The current timestamp (changes every ms)
        const uniqueId = maxId + (i * 1000) + Math.floor(Math.random() * 1000) + 
                         (baseTime % 1000) * 1000;
        
        batchIds.push(uniqueId);
    }
    
    console.log(`Generated batch of ${count} unique IDs`, batchIds);
    return batchIds;
}

// ADDED: Safely get employee name - Handles cases where employee data might not be loaded yet
function getEmployeeName(employeeId) {
    // First try to get from the rich data structure
    if (window.employeesData && window.employeesData[employeeId]) {
        return window.employeesData[employeeId].displayName || 
               window.employeesData[employeeId].shortDisplayName || 
               'Unknown Host';
    }
    
    // Fall back to the legacy structure
    if (employees && employees[employeeId]) {
        return employees[employeeId];
    }
    
    return 'Unknown Host';
}

// ADDED: Safely get event type display name
function getEventTypeName(typeKey) {
    return eventTypes[typeKey] || typeKey || 'Unknown Event';
}