// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDBKCotY1F943DKfVQaKQGPPkAkQe2Zqog",
    authDomain: "beach-trivia-website.firebaseapp.com",
    projectId: "beach-trivia-website",
    storageBucket: "beach-trivia-website.appspot.com",
    messagingSenderId: "459479368322",
    appId: "1:459479368322:web:7bd3d080d3b9e77610a9b",
    measurementId: "G-24MQRKKDNY"
};

// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();

    // Get DOM elements
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginButton = document.getElementById('loginButton');
    const messageContainer = document.getElementById('messageContainer');
    const rememberMeCheckbox = document.getElementById('rememberMe');
    const forgotPasswordLink = document.getElementById('forgotPassword');
    
    // Toggle containers
    const employeeToggle = document.getElementById('employee-toggle');
    const adminToggle = document.getElementById('admin-toggle');
    const userTypeInput = document.getElementById('userType');

    // User type toggle functionality
    employeeToggle.addEventListener('click', () => {
        employeeToggle.classList.add('active');
        adminToggle.classList.remove('active');
        userTypeInput.value = 'employee';
        document.getElementById('loginTitle').textContent = 'Employee Login';
    });

    adminToggle.addEventListener('click', () => {
        adminToggle.classList.add('active');
        employeeToggle.classList.remove('active');
        userTypeInput.value = 'admin';
        document.getElementById('loginTitle').textContent = 'Admin Login';
    });
    
    // Password visibility toggle
    const togglePasswordButton = document.getElementById('togglePassword');
    const togglePasswordIcon = togglePasswordButton.querySelector('i');

    // Toggle password visibility
    togglePasswordButton.addEventListener('click', () => {
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            togglePasswordIcon.classList.remove('fa-eye-slash');
            togglePasswordIcon.classList.add('fa-eye');
        } else {
            passwordInput.type = 'password';
            togglePasswordIcon.classList.remove('fa-eye');
            togglePasswordIcon.classList.add('fa-eye-slash');
        }
    });

    // Show message to user
    function showMessage(type, message) {
        messageContainer.innerHTML = `<div class="message ${type}">${message}</div>`;
        messageContainer.classList.add('active');
    }

    // Reset login button state
    function resetLoginButton() {
        loginButton.innerHTML = 'Login <i class="fas fa-arrow-right"></i>';
        loginButton.disabled = false;
    }

    // Redirect to dashboard based on user role
    function redirectToDashboard(role) {
        switch (role) {
            case 'Host':
                window.location.href = 'host-dashboard.html';
                break;
            case 'Writer':
                window.location.href = 'writer-dashboard.html';
                break;
            case 'Regional Manager':
                window.location.href = 'regional-manager-dashboard.html';
                break;
            case 'Supply Manager':
                window.location.href = 'supply-manager-dashboard.html';
                break;
            case 'Social Media Manager':
                window.location.href = 'social-media-dashboard.html';
                break;
            case 'Admin':
                window.location.href = 'admin-dashboard.html';
                break;
            default:
                showMessage('error', 'Unknown user role');
                resetLoginButton();
        }
    }

    // Handle login form submission
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const userType = userTypeInput.value;

        // Validate inputs
        if (!email || !password) {
            showMessage('error', 'Please enter both email and password');
            return;
        }

        // Show loading state
        loginButton.innerHTML = 'Processing... <i class="fas fa-spinner fa-spin"></i>';
        loginButton.disabled = true;

        // Sign in with Firebase Authentication
        auth.signInWithEmailAndPassword(email, password)
            .then((userCredential) => {
                const user = userCredential.user;
                console.log('User authenticated:', user.uid);

                // Check user role in Firestore
                db.collection(userType === 'admin' ? 'admins' : 'employees').doc(user.uid).get()
                    .then((doc) => {
                        if (doc.exists) {
                            const userData = doc.data();
                            console.log('User data:', userData);
                            
                            if (userData.roles && userData.roles.length > 0) {
                                // Take the first role (or you can implement more complex logic)
                                const role = userData.roles[0];
                                console.log('User role:', role);
                                redirectToDashboard(role);
                            } else {
                                console.error('No roles assigned to user');
                                showMessage('error', 'No roles assigned to user');
                                resetLoginButton();
                            }
                        } else {
                            console.error('No user document found');
                            showMessage('error', 'User account not found');
                            resetLoginButton();
                        }
                    })
                    .catch((error) => {
                        console.error('Firestore error:', error);
                        showMessage('error', 'Error accessing user data');
                        resetLoginButton();
                    });
            })
            .catch((error) => {
                console.error('Full login error:', error.code, error.message);
                showMessage('error', 'Login failed: ' + error.message);
                resetLoginButton();
            });
    });

    // Remember me functionality
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
    const rememberedEmail = localStorage.getItem('rememberedEmail');
    if (rememberedEmail) {
        emailInput.value = rememberedEmail;
        rememberMeCheckbox.checked = true;
    }

    // Forgot password functionality
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

    // Optional: Console log for debugging
    console.log('Login page JavaScript initialized');
});