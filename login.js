// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDBKCotY1F943DKfVQqKOGPPkAkQe2Zgog",
    authDomain: "beach-trivia-website.firebaseapp.com",
    projectId: "beach-trivia-website",
    storageBucket: "beach-trivia-website.appspot.com",
    messagingSenderId: "459479368322",
    appId: "1:459479368322:web:7bd3d080d3b9e77610aa9b",
    measurementId: "G-24MQRKKDNY"
};

// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    
    // Set persistence to SESSION (persists until window/tab is closed)
    // Change to LOCAL for longer persistence across browser sessions
    auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);

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

    // Check if user is already logged in
    auth.onAuthStateChanged(user => {
        if (user) {
            // Check if we're on the login page
            if (window.location.pathname.includes('login.html')) {
                // Get user role from session storage
                const userRole = sessionStorage.getItem('userRole');
                if (userRole) {
                    redirectToDashboard(userRole);
                } else {
                    // Fetch role from database if not in session storage
                    fetchUserRoleAndRedirect(user.email);
                }
            }
        }
    });
    
    // Fetch user role from Firestore and redirect
    function fetchUserRoleAndRedirect(email) {
        db.collection('employees')
            .where('email', '==', email)
            .get()
            .then((querySnapshot) => {
                if (!querySnapshot.empty) {
                    const doc = querySnapshot.docs[0];
                    const userData = doc.data();
                    
                    if (userData.roles && userData.roles.length > 0) {
                        const role = userData.roles[0];
                        
                        // Store role in session storage
                        sessionStorage.setItem('userRole', role);
                        sessionStorage.setItem('userEmail', email);
                        
                        // Store user ID for reference
                        sessionStorage.setItem('userId', doc.id);
                        
                        // Redirect based on role
                        redirectToDashboard(role);
                    }
                }
            });
    }

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
            togglePasswordIcon.classList.remove('fa-eye');
            togglePasswordIcon.classList.add('fa-eye-slash');
        } else {
            passwordInput.type = 'password';
            togglePasswordIcon.classList.remove('fa-eye-slash');
            togglePasswordIcon.classList.add('fa-eye');
        }
    });

    // Show message to user
    function showMessage(type, message) {
        messageContainer.innerHTML = `<div class="message ${type}">${message}</div>`;
        messageContainer.classList.add('active');
    }

    // Reset login button state
    function resetLoginButton() {
        loginButton.innerHTML = '<span>Login</span><i class="fas fa-arrow-right"></i>';
        loginButton.disabled = false;
    }

    // Redirect to dashboard based on user role
    function redirectToDashboard(role) {
        // Convert role to lowercase and replace spaces with hyphens
        const rolePath = role.toLowerCase().replace(/\s+/g, '-');
        
        // Check if role is admin for special handling
        if (rolePath === 'admin') {
            // Direct to admin index page with the correct path
            window.location.href = 'beachTriviaPages/dashboards/admin/index.html';
        } else {
            // For other roles, use the standard folder structure
            window.location.href = `beachTriviaPages/dashboards/${rolePath}/index.html`;
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
        loginButton.innerHTML = '<span>Processing...</span><i class="fas fa-spinner fa-spin"></i>';
        loginButton.disabled = true;

        // Sign in with Firebase Authentication
        auth.signInWithEmailAndPassword(email, password)
            .then((userCredential) => {
                const user = userCredential.user;
                console.log('User authenticated:', user.uid);

                // Query Firestore for user by email instead of UID
                db.collection('employees')
                  .where('email', '==', email)
                  .get()
                  .then((querySnapshot) => {
                      if (!querySnapshot.empty) {
                          // Get the first document that matches (should only be one)
                          const doc = querySnapshot.docs[0];
                          const userData = doc.data();
                          console.log('User data:', userData);
                          
                          if (userData.roles && userData.roles.length > 0) {
                              // Take the first role (or you can implement more complex logic)
                              const role = userData.roles[0];
                              console.log('User role:', role);
                              
                              // Store user info in session storage
                              sessionStorage.setItem('userRole', role);
                              sessionStorage.setItem('userEmail', email);
                              sessionStorage.setItem('userId', doc.id);
                              
                              // Store if user is admin
                              const isAdmin = role.toLowerCase() === 'admin';
                              sessionStorage.setItem('isAdmin', isAdmin);
                              
                              // Check if user type matches role
                              if (userType === 'admin' && isAdmin) {
                                  redirectToDashboard(role);
                              } else if (userType === 'employee' && !isAdmin) {
                                  redirectToDashboard(role);
                              } else {
                                  showMessage('error', `You don't have ${userType} privileges. Please use the correct login type.`);
                                  auth.signOut();
                                  resetLoginButton();
                                  // Clear session storage
                                  sessionStorage.clear();
                              }
                          } else {
                              console.error('No roles assigned to user');
                              showMessage('error', 'No roles assigned to user');
                              resetLoginButton();
                          }
                      } else {
                          console.error('No user document found with this email');
                          showMessage('error', 'User account not found in system');
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
                
                // Handle specific error messages
                switch(error.code) {
                    case 'auth/user-not-found':
                    case 'auth/wrong-password':
                        showMessage('error', 'Invalid email or password');
                        break;
                    case 'auth/invalid-email':
                        showMessage('error', 'Invalid email format');
                        break;
                    case 'auth/user-disabled':
                        showMessage('error', 'This account has been disabled');
                        break;
                    case 'auth/too-many-requests':
                        showMessage('error', 'Too many unsuccessful login attempts. Please try again later');
                        break;
                    default:
                        showMessage('error', 'Login failed: ' + error.message);
                }
                
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
    
    // Logout functionality - can be called from any page
    window.logoutUser = function() {
        auth.signOut().then(() => {
            // Clear session storage
            sessionStorage.clear();
            // Redirect to login page
            window.location.href = '/login.html';
        });
    };

    // Auth check function for protected pages
    window.checkAdminAuth = function() {
        return new Promise((resolve, reject) => {
            auth.onAuthStateChanged(user => {
                if (!user) {
                    // No user logged in
                    window.location.href = '/login.html';
                    reject('No user logged in');
                } else {
                    // Check if user has admin role from session storage
                    const isAdmin = sessionStorage.getItem('isAdmin') === 'true';
                    if (isAdmin) {
                        resolve(true);
                    } else {
                        // Double-check with database
                        db.collection('employees')
                            .where('email', '==', user.email)
                            .get()
                            .then((querySnapshot) => {
                                if (!querySnapshot.empty) {
                                    const userData = querySnapshot.docs[0].data();
                                    if (userData.roles && userData.roles.includes('Admin')) {
                                        sessionStorage.setItem('isAdmin', true);
                                        resolve(true);
                                    } else {
                                        // Not an admin, redirect to login
                                        auth.signOut();
                                        sessionStorage.clear();
                                        window.location.href = '/login.html';
                                        reject('Not authorized');
                                    }
                                } else {
                                    // No user found, redirect to login
                                    auth.signOut();
                                    sessionStorage.clear();
                                    window.location.href = '/login.html';
                                    reject('User not found');
                                }
                            });
                    }
                }
            });
        });
    };

    // Add session timeout (optional) - 30 minutes
    let sessionTimeout;
    function resetSessionTimeout() {
        clearTimeout(sessionTimeout);
        sessionTimeout = setTimeout(() => {
            // Log out after 30 minutes of inactivity
            window.logoutUser();
        }, 30 * 60 * 1000); // 30 minutes
    }
    
    // Reset timeout on user activity
    if (document.querySelector('body')) {
        document.querySelector('body').addEventListener('click', resetSessionTimeout);
        document.querySelector('body').addEventListener('keypress', resetSessionTimeout);
    }
    
    // Initialize timeout
    resetSessionTimeout();

    // Optional: Console log for debugging
    console.log('Login page JavaScript initialized');
});