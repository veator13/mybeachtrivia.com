// shift-service.js
// Shared service for consistent shift data handling between dashboard and calendar

class ShiftService {
    constructor() {
        this.db = null;
        this.initialized = false;
        this.initPromise = null;
        this.dataChangeListeners = [];
        this.lastSyncTimestamp = null;
    }
    
    // Initialize the service with Firestore
    init() {
        if (this.initialized) return Promise.resolve();
        
        if (this.initPromise) return this.initPromise;
        
        this.initPromise = new Promise((resolve, reject) => {
            try {
                if (typeof firebase !== 'undefined' && firebase.firestore) {
                    this.db = firebase.firestore();
                    this.initialized = true;
                    console.log('ShiftService initialized with Firestore');
                    resolve();
                } else {
                    // Wait for Firebase to initialize
                    const checkFirebase = setInterval(() => {
                        if (typeof firebase !== 'undefined' && firebase.firestore) {
                            clearInterval(checkFirebase);
                            clearTimeout(timeout);
                            this.db = firebase.firestore();
                            this.initialized = true;
                            console.log('ShiftService initialized with Firestore (delayed)');
                            resolve();
                        }
                    }, 100);
                    
                    // Set timeout in case Firebase never initializes
                    const timeout = setTimeout(() => {
                        clearInterval(checkFirebase);
                        reject(new Error('Firebase not initialized after timeout'));
                    }, 5000);
                }
            } catch (error) {
                reject(error);
            }
        });
        
        return this.initPromise;
    }
    
    // Add a listener for data changes
    addDataChangeListener(callback) {
        if (typeof callback === 'function') {
            this.dataChangeListeners.push(callback);
        }
    }
    
    // Notify all listeners of data change
    notifyDataChange() {
        this.lastSyncTimestamp = null;
        this.dataChangeListeners.forEach(callback => {
            try {
                callback();
            } catch (error) {
                console.error('Error in data change listener:', error);
            }
        });
    }
    
    // Get all shifts for a host
    async getHostShifts(hostId) {
        await this.init();
        
        try {
            const querySnapshot = await this.db.collection('shifts')
                .where('employeeId', '==', hostId)
                .get();
            
            const shifts = [];
            
            querySnapshot.forEach(doc => {
                const shiftData = doc.data();
                
                // Standardize the date format
                const standardizedDate = typeof DateUtils !== 'undefined' && DateUtils.standardizeDate ? 
                    DateUtils.standardizeDate(shiftData.date) : shiftData.date;
                
                shifts.push({
                    id: doc.id,
                    title: shiftData.type || 'Event',
                    time: shiftData.startTime && shiftData.endTime ? 
                          `${shiftData.startTime} - ${shiftData.endTime}` : 
                          (shiftData.startTime || shiftData.endTime || 'TBD'),
                    location: shiftData.location,
                    type: shiftData.type,
                    theme: shiftData.theme || '',
                    employeeId: shiftData.employeeId,
                    notes: shiftData.notes || '',
                    date: standardizedDate,
                    startTime: shiftData.startTime,
                    endTime: shiftData.endTime
                });
            });
            
            this.lastSyncTimestamp = Date.now();
            console.log('ShiftService - Host shifts loaded:', shifts.length);
            
            return shifts;
        } catch (error) {
            console.error('Error fetching host shifts:', error);
            return [];
        }
    }
    
    // Get shifts filtered by date range
    async getShiftsByDateRange(startDate, endDate) {
        await this.init();
        
        try {
            // For date ranges, we need to fetch all shifts and filter client-side
            // This is because Firestore requires a composite index for range queries on multiple fields
            const querySnapshot = await this.db.collection('shifts').get();
            
            const shifts = [];
            
            querySnapshot.forEach(doc => {
                const shiftData = doc.data();
                
                // Standardize the date format for comparison
                const shiftDate = typeof DateUtils !== 'undefined' && DateUtils.standardizeDate ? 
                    DateUtils.standardizeDate(shiftData.date) : shiftData.date;
                    
                const standardStartDate = typeof DateUtils !== 'undefined' && DateUtils.standardizeDate ? 
                    DateUtils.standardizeDate(startDate) : startDate;
                    
                const standardEndDate = typeof DateUtils !== 'undefined' && DateUtils.standardizeDate ? 
                    DateUtils.standardizeDate(endDate) : endDate;
                
                // Filter by date range
                if (shiftDate >= standardStartDate && shiftDate <= standardEndDate) {
                    shifts.push({
                        id: doc.id,
                        title: shiftData.type || 'Event',
                        time: shiftData.startTime && shiftData.endTime ? 
                              `${shiftData.startTime} - ${shiftData.endTime}` : 
                              (shiftData.startTime || shiftData.endTime || 'TBD'),
                        location: shiftData.location,
                        type: shiftData.type,
                        theme: shiftData.theme || '',
                        employeeId: shiftData.employeeId,
                        notes: shiftData.notes || '',
                        date: shiftDate,
                        startTime: shiftData.startTime,
                        endTime: shiftData.endTime
                    });
                }
            });
            
            this.lastSyncTimestamp = Date.now();
            console.log(`ShiftService - Date range shifts loaded: ${shifts.length}`);
            
            return shifts;
        } catch (error) {
            console.error('Error fetching shifts by date range:', error);
            return [];
        }
    }
    
    // Get shifts for a specific date
    async getShiftsForDate(dateStr) {
        await this.init();
        
        try {
            // Format the date for comparison
            const standardDate = typeof DateUtils !== 'undefined' && DateUtils.standardizeDate ? 
                DateUtils.standardizeDate(dateStr) : dateStr;
            
            // Fetch all shifts (no index needed)
            const querySnapshot = await this.db.collection('shifts').get();
            
            const shifts = [];
            
            querySnapshot.forEach(doc => {
                const shiftData = doc.data();
                
                // Standardize the shift date for comparison
                const shiftDate = typeof DateUtils !== 'undefined' && DateUtils.standardizeDate ? 
                    DateUtils.standardizeDate(shiftData.date) : shiftData.date;
                
                // Only include shifts for the specified date
                if (shiftDate === standardDate) {
                    shifts.push({
                        id: doc.id,
                        title: shiftData.type || 'Event',
                        time: shiftData.startTime && shiftData.endTime ? 
                              `${shiftData.startTime} - ${shiftData.endTime}` : 
                              (shiftData.startTime || shiftData.endTime || 'TBD'),
                        location: shiftData.location,
                        type: shiftData.type,
                        theme: shiftData.theme || '',
                        employeeId: shiftData.employeeId,
                        notes: shiftData.notes || '',
                        date: shiftDate,
                        startTime: shiftData.startTime,
                        endTime: shiftData.endTime
                    });
                }
            });
            
            console.log(`ShiftService - Found ${shifts.length} shifts for date ${dateStr}`);
            return shifts;
        } catch (error) {
            console.error(`Error fetching shifts for date ${dateStr}:`, error);
            return [];
        }
    }
    
    // Save a new shift
    async saveShift(shiftData) {
        await this.init();
        
        try {
            // Ensure the date is standardized
            const standardizedData = { ...shiftData };
            if (typeof DateUtils !== 'undefined' && DateUtils.standardizeDate) {
                standardizedData.date = DateUtils.standardizeDate(shiftData.date);
            }
            
            // Add server timestamp
            standardizedData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            
            // Save to Firestore
            const docRef = await this.db.collection('shifts').add(standardizedData);
            
            console.log('Shift saved with ID:', docRef.id);
            this.notifyDataChange();
            
            return docRef.id;
        } catch (error) {
            console.error('Error saving shift:', error);
            throw error;
        }
    }
    
    // Update an existing shift
    async updateShift(shiftId, shiftData) {
        await this.init();
        
        try {
            // Ensure the date is standardized
            const standardizedData = { ...shiftData };
            if (typeof DateUtils !== 'undefined' && DateUtils.standardizeDate) {
                standardizedData.date = DateUtils.standardizeDate(shiftData.date);
            }
            
            // Add server timestamp
            standardizedData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            
            // Update in Firestore
            await this.db.collection('shifts').doc(shiftId.toString()).update(standardizedData);
            
            console.log('Shift updated:', shiftId);
            this.notifyDataChange();
            
            return shiftId;
        } catch (error) {
            console.error('Error updating shift:', error);
            throw error;
        }
    }
    
    // Delete a shift
    async deleteShift(shiftId) {
        await this.init();
        
        try {
            // Delete from Firestore
            await this.db.collection('shifts').doc(shiftId.toString()).delete();
            
            console.log('Shift deleted:', shiftId);
            this.notifyDataChange();
            
            return true;
        } catch (error) {
            console.error('Error deleting shift:', error);
            throw error;
        }
    }
    
    // Helper method to check if data needs refreshing
    needsRefresh() {
        // Refresh if we've never synced or it's been more than 1 minute
        return !this.lastSyncTimestamp || (Date.now() - this.lastSyncTimestamp > 60000);
    }
    
    // Debug method to log the current state of the service
    debug() {
        console.group('ShiftService Debug');
        console.log('Initialized:', this.initialized);
        console.log('Last sync:', this.lastSyncTimestamp ? new Date(this.lastSyncTimestamp).toLocaleTimeString() : 'never');
        console.log('Listeners:', this.dataChangeListeners.length);
        console.groupEnd();
    }
}

// Create a singleton instance of ShiftService
const shiftService = new ShiftService();

// Initialize the service right away
shiftService.init().catch(error => {
    console.error('Failed to initialize ShiftService:', error);
});