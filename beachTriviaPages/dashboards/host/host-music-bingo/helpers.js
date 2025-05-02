/**
 * Helpers Module
 * Provides utility functions used across the Music Bingo application
 */

/**
 * Format milliseconds as mm:ss
 * @param {number} ms - Time in milliseconds
 * @returns {string} Formatted time string (mm:ss)
 */
export function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  
  /**
   * Generate random string (used for CSRF tokens, etc.)
   * @param {number} length - Length of the string to generate
   * @returns {string} Random string
   */
  export function generateRandomString(length) {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    
    for (let i = 0; i < length; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
  
  /**
   * Truncate a string to a specified length and add ellipsis if needed
   * @param {string} str - String to truncate
   * @param {number} length - Maximum length before truncation
   * @returns {string} Truncated string
   */
  export function truncateString(str, length = 50) {
    if (!str) return '';
    if (str.length <= length) return str;
    
    return str.substring(0, length) + '...';
  }
  
  /**
   * Capitalize the first letter of a string
   * @param {string} str - String to capitalize
   * @returns {string} Capitalized string
   */
  export function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  
  /**
   * Debounce a function call
   * @param {Function} func - Function to debounce
   * @param {number} wait - Time to wait in milliseconds
   * @returns {Function} Debounced function
   */
  export function debounce(func, wait = 300) {
    let timeout;
    
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  
  /**
   * Get URL parameters as an object
   * @param {string} url - URL to parse (defaults to current location)
   * @returns {Object} URL parameters as key-value pairs
   */
  export function getUrlParams(url = window.location.href) {
    const params = {};
    const queryString = url.split('?')[1];
    
    if (!queryString) return params;
    
    const paramPairs = queryString.split('&');
    
    paramPairs.forEach(pair => {
      const [key, value] = pair.split('=');
      params[decodeURIComponent(key)] = decodeURIComponent(value || '');
    });
    
    return params;
  }
  
  /**
   * Build URL with query parameters
   * @param {string} baseUrl - Base URL
   * @param {Object} params - Query parameters as key-value pairs
   * @returns {string} URL with query parameters
   */
  export function buildUrl(baseUrl, params = {}) {
    const url = new URL(baseUrl, window.location.origin);
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value);
      }
    });
    
    return url.toString();
  }
  
  /**
   * Deep clone an object
   * @param {Object} obj - Object to clone
   * @returns {Object} Deep cloned object
   */
  export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
  
  /**
   * Check if an object is empty
   * @param {Object} obj - Object to check
   * @returns {boolean} True if the object is empty
   */
  export function isEmpty(obj) {
    if (obj === null || obj === undefined) return true;
    
    if (typeof obj === 'string') return obj.trim() === '';
    
    if (Array.isArray(obj)) return obj.length === 0;
    
    if (typeof obj === 'object') return Object.keys(obj).length === 0;
    
    return false;
  }
  
  /**
   * Format a date
   * @param {Date|string|number} date - Date to format
   * @param {Object} options - Formatting options
   * @returns {string} Formatted date string
   */
  export function formatDate(date, options = {}) {
    // Default options
    const defaultOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    };
    
    // Merge options
    const formattingOptions = { ...defaultOptions, ...options };
    
    // Create Date object if not already
    const dateObj = date instanceof Date ? date : new Date(date);
    
    // Format date
    return dateObj.toLocaleDateString('en-US', formattingOptions);
  }
  
  /**
   * Format relative time (e.g., "2 hours ago")
   * @param {Date|string|number} date - Date to format
   * @returns {string} Relative time string
   */
  export function formatRelativeTime(date) {
    const now = new Date();
    const dateObj = date instanceof Date ? date : new Date(date);
    
    const seconds = Math.floor((now - dateObj) / 1000);
    
    // Less than a minute
    if (seconds < 60) {
      return 'just now';
    }
    
    // Less than an hour
    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
    }
    
    // Less than a day
    if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    }
    
    // Less than a week
    if (seconds < 604800) {
      const days = Math.floor(seconds / 86400);
      return `${days} ${days === 1 ? 'day' : 'days'} ago`;
    }
    
    // Less than a month
    if (seconds < 2592000) {
      const weeks = Math.floor(seconds / 604800);
      return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
    }
    
    // Default to formatted date
    return formatDate(dateObj);
  }
  
  /**
   * Validate email address format
   * @param {string} email - Email address to validate
   * @returns {boolean} True if the email format is valid
   */
  export function isValidEmail(email) {
    // Basic email regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  /**
   * Validate URL format
   * @param {string} url - URL to validate
   * @returns {boolean} True if the URL format is valid
   */
  export function isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  }
  
  /**
   * Generate a unique ID
   * @returns {string} Unique ID
   */
  export function generateUniqueId() {
    // Simple implementation using timestamp and random string
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }
  
  /**
   * Shuffle an array (Fisher-Yates algorithm)
   * @param {Array} array - Array to shuffle
   * @returns {Array} Shuffled array (new copy)
   */
  export function shuffleArray(array) {
    // Create a copy to avoid modifying the original
    const result = [...array];
    
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    
    return result;
  }
  
  /**
   * Get a random element from an array
   * @param {Array} array - Array to get random element from
   * @returns {*} Random element from array
   */
  export function randomElement(array) {
    if (!array || array.length === 0) return null;
    return array[Math.floor(Math.random() * array.length)];
  }
  
  /**
   * Group array items by a key
   * @param {Array} array - Array to group
   * @param {string|Function} key - Property name or function to get group key
   * @returns {Object} Grouped object
   */
  export function groupBy(array, key) {
    return array.reduce((result, item) => {
      const groupKey = typeof key === 'function' ? key(item) : item[key];
      
      // Create group if it doesn't exist
      if (!result[groupKey]) {
        result[groupKey] = [];
      }
      
      // Add item to group
      result[groupKey].push(item);
      
      return result;
    }, {});
  }
  
  /**
   * Throttle a function call
   * @param {Function} func - Function to throttle
   * @param {number} limit - Time limit in milliseconds
   * @returns {Function} Throttled function
   */
  export function throttle(func, limit = 300) {
    let lastCall = 0;
    
    return function(...args) {
      const now = Date.now();
      
      if (now - lastCall >= limit) {
        lastCall = now;
        return func(...args);
      }
    };
  }
  
  /**
   * Format number with commas for thousands
   * @param {number} num - Number to format
   * @returns {string} Formatted number string
   */
  export function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  
  /**
   * Format currency
   * @param {number} amount - Amount to format
   * @param {string} currency - Currency code (default: USD)
   * @returns {string} Formatted currency string
   */
  export function formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency 
    }).format(amount);
  }
  
  /**
   * Escape HTML special characters
   * @param {string} html - String to escape
   * @returns {string} Escaped string
   */
  export function escapeHtml(html) {
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
  }