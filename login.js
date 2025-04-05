// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDBKCotYJF94jDKfVQqKQGPPkAkQe2Zgg",
    authDomain: "beach-trivia-website.firebaseapp.com",
    projectId: "beach-trivia-website",
    storageBucket: "beach-trivia-website.appspot.com",
    messagingSenderId: "459479368322",
    appId: "1:459479368322:web:7bd3d080d3b9e77610aa9b",
    measurementId: "G-24MQRKKDNY"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Get DOM elements
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginButton = document.getElementById('loginButton');
const passwordStrengthBar = document.getElementById('strengthBarInner');
const passwordStrengthText = document.getElementById('strengthText');

// Handle login form submission
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    // Validate inputs (you can add more validation as needed)
    if (!email || !password) {
        showMessage('error', 'Please enter both email and password');
        return;
    }

    // Show loading state
    loginButton.innerHTML = '<span>Processing...</span><i class="fas fa-spinner fa-spin"></i>';
    loginButton.disabled = true;

    // Sign in with Firebase Authentication
    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            const user = userCredential.user;

            // Check user role in Firestore
            db.collection('employees').doc(user.uid).get()
                .then((doc) => {
                    if (doc.exists) {
                        const userData = doc.data();

                        // Redirect based on user role
                        redirectToDashboard(userData.role);
                    } else {
                        // User document doesn't exist
                        showMessage('error', 'User account not found');
                        resetLoginButton();
                    }
                })
                .catch((error) => {
                    console.error('Error getting user document:', error);
                    showMessage('error', 'Error verifying user role');
                    resetLoginButton();
                });
        })
        .catch((error) => {
            console.error('Login error:', error);
            showMessage('error', 'Invalid email or password');
            resetLoginButton();
        });
});

// Redirect to dashboard based on user role
function redirectToDashboard(role) {
    switch (role) {
        case 'host':
            window.location.href = 'host-dashboard.html';
            break;
        case 'writer':
            window.location.href = 'writer-dashboard.html';
            break;
        // Add more cases for other roles
        default:
            showMessage('error', 'Unknown user role');
            resetLoginButton();
    }
}

// Reset login button state
function resetLoginButton() {
    loginButton.innerHTML = '<span>Login</span><i class="fas fa-arrow-right"></i>';
    loginButton.disabled = false;
}

// Show message to user
function showMessage(type, message) {
    const messageContainer = document.getElementById('messageContainer');
    messageContainer.innerHTML = `<div class="message ${type}">${message}</div>`;
    messageContainer.classList.add('active');
}

// Password strength indicator
passwordInput.addEventListener('input', () => {
    const password = passwordInput.value;
    const strengthScore = calculatePasswordStrength(password);
    updateStrengthIndicator(strengthScore);
});

function calculatePasswordStrength(password) {
    // Implement your password strength calculation logic here
    // You can assign scores based on length, complexity, etc.
    // Return a score between 0 and 100
    // Example implementation:
    let score = 0;
    if (password.length >= 8) score += 25;
    if (/[A-Z]/.test(password)) score += 25;
    if (/[0-9]/.test(password)) score += 25;
    if (/[^A-Za-z0-9]/.test(password)) score += 25;
    return score;
}

function updateStrengthIndicator(score) {
    passwordStrengthBar.style.width = score + '%';
    if (score === 0) {
        passwordStrengthText.textContent = '';
    } else if (score <= 25) {
        passwordStrengthText.textContent = 'Weak';
    } else if (score <= 50) {
        passwordStrengthText.textContent = 'Moderate';
    } else if (score <= 75) {
        passwordStrengthText.textContent = 'Strong';
    } else {
        passwordStrengthText.textContent = 'Very Strong';
    }
}

// Remember me functionality
const rememberMeCheckbox = document.getElementById('rememberMe');

rememberMeCheckbox.addEventListener('change', () => {
    if (rememberMeCheckbox.checked) {
        // Store user's email in localStorage when "Remember me" is checked
        localStorage.setItem('rememberedEmail', emailInput.value);
    } else {
        // Remove stored email from localStorage when "Remember me" is unchecked
        localStorage.removeItem('rememberedEmail');
    }
});

// Auto-fill remembered email on page load
window.addEventListener('load', () => {
    const rememberedEmail = localStorage.getItem('rememberedEmail');
    if (rememberedEmail) {
        emailInput.value = rememberedEmail;
        rememberMeCheckbox.checked = true;
    }
});

// Forgot password functionality
const forgotPasswordLink = document.getElementById('forgotPassword');

forgotPasswordLink.addEventListener('click', (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!email) {
        showMessage('error', 'Please enter your email address');
        return;
    }
    // Send password reset email using Firebase Authentication
    auth.sendPasswordResetEmail(email)
        .then(() => {
            showMessage('success', 'Password reset email sent. Please check your inbox.');
        })
        .catch((error) => {
            console.error('Error sending password reset email:', error);
            showMessage('error', 'Failed to send password reset email. Please try again.');
        });
});