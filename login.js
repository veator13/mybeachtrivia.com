// Firebase configuration - UPDATED with correct storage bucket from index.html
const firebaseConfig = {
    apiKey: "AIzaSyDBKCotY1F943DKfVQqKOGPPkAkQe2Zgog",
    authDomain: "mybeachtrivia.com",
    projectId: "beach-trivia-website",
    storageBucket: "beach-trivia-website.appspot.com", // CORRECTED to match index.html
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

    // Check if user is already logged in - FIXED to respect toggle selection
    auth.onAuthStateChanged(user => {
        if (user) {
            // Check if we're on the login page
            if (window.location.pathname.includes('login.html') || window.location.pathname === '/') {
                // Instead of immediately redirecting, check if there's an active login attempt
                const isActiveLogin = sessionStorage.getItem('activeLogin');
                
                if (!isActiveLogin) {
                    // If no active login, clear previous role data to ensure fresh login flow
                    sessionStorage.removeItem('userRole');
                    
                    // Don't auto-redirect users with multiple roles
                    // This gives them the chance to choose which role to log in as
                    db.collection('employees')
                        .where('email', '==', user.email)
                        .get()
                        .then((querySnapshot) => {
                            if (!querySnapshot.empty) {
                                const userData = querySnapshot.docs[0].data();
                                
                                if (userData.roles && userData.roles.length > 1) {
                                    // User has multiple roles, don't auto-redirect
                                    console.log('User has multiple roles, showing toggle options');
                                    showMessage('success', 'Please select which role to use for login');
                                    
                                    // Store basic user info without setting active role
                                    sessionStorage.setItem('userRoles', JSON.stringify(userData.roles));
                                    sessionStorage.setItem('userEmail', user.email);
                                    sessionStorage.setItem('userId', querySnapshot.docs[0].id);
                                    
                                    // Pre-fill email field
                                    if (emailInput) emailInput.value = user.email;
                                    
                                    // Signal that we've checked this user
                                    sessionStorage.setItem('checkedUser', 'true');
                                } else if (userData.roles && userData.roles.length === 1) {
                                    // User has only one role, use it
                                    const role = userData.roles[0];
                                    sessionStorage.setItem('userRole', role);
                                    redirectToDashboard(role);
                                }
                            }
                        })
                        .catch(error => {
                            console.error('Error fetching user roles:', error);
                        });
                }
            }
        }
    });
    
    // Fetch user role from Firestore and redirect
    function fetchUserRoleAndRedirect(email, specificRole = null) {
        db.collection('employees')
            .where('email', '==', email)
            .get()
            .then((querySnapshot) => {
                if (!querySnapshot.empty) {
                    const doc = querySnapshot.docs[0];
                    const userData = doc.data();
                    
                    if (userData.roles && userData.roles.length > 0) {
                        // Store all user roles
                        sessionStorage.setItem('userRoles', JSON.stringify(userData.roles));
                        sessionStorage.setItem('userEmail', email);
                        sessionStorage.setItem('userId', doc.id);
                        
                        // Check if user has admin role (case insensitive)
                        const hasAdminRole = userData.roles.some(role => 
                            role.toLowerCase() === 'admin');
                        
                        // Store admin status
                        sessionStorage.setItem('isAdmin', hasAdminRole);
                        
                        // If a specific role was requested, use that
                        let role;
                        if (specificRole) {
                            // Use the specified role if the user has it
                            if (userData.roles.some(r => r.toLowerCase() === specificRole.toLowerCase())) {
                                role = specificRole;
                            } else {
                                // If user doesn't have the requested role, use the first one
                                role = userData.roles[0];
                            }
                        } else {
                            // Otherwise use first role as default
                            role = userData.roles[0];
                        }
                        
                        sessionStorage.setItem('userRole', role);
                        
                        // Redirect based on role
                        redirectToDashboard(role);
                    }
                }
            })
            .catch(error => {
                console.error('Error fetching user role:', error);
                showMessage('error', 'Error accessing user data. Please try again.');
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
    
    if (togglePasswordButton) {
        togglePasswordButton.addEventListener('click', () => {
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                togglePasswordButton.querySelector('i').classList.remove('fa-eye');
                togglePasswordButton.querySelector('i').classList.add('fa-eye-slash');
            } else {
                passwordInput.type = 'password';
                togglePasswordButton.querySelector('i').classList.remove('fa-eye-slash');
                togglePasswordButton.querySelector('i').classList.add('fa-eye');
            }
        });
    }



    // Show message to user
    function showMessage(type, message) {
        messageContainer.innerHTML = `<div class="message ${type}">${message}</div>`;
        messageContainer.style.display = 'block';
        
        // Automatically hide success messages after 5 seconds
        if (type === 'success') {
            setTimeout(() => {
                messageContainer.style.display = 'none';
            }, 5000);
        }
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
        
        console.log('Redirecting to dashboard for role:', role);
        console.log('Formatted role path:', rolePath);
        
        // Check if role is admin for special handling
        if (rolePath === 'admin') {
            // Direct to admin index page with the correct path
            console.log('Redirecting to admin dashboard path: beachTriviaPages/dashboards/admin/index.html');
            window.location.href = 'beachTriviaPages/dashboards/admin/index.html';
        } else {
            // For other roles, use the standard folder structure
            const redirectPath = `beachTriviaPages/dashboards/${rolePath}/index.html`;
            console.log('Redirecting to role-specific dashboard path:', redirectPath);
            window.location.href = redirectPath;
        }
    }

    // Handle login form submission
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();

        // Clear any existing role data before logging in
        // But preserve the user ID and user roles if available
        sessionStorage.removeItem('userRole');
        sessionStorage.removeItem('isAdmin');

        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const userType = userTypeInput.value;

        // Validate inputs
        if (!email || !password) {
            showMessage('error', 'Please enter both email and password');
            return;
        }

        // Set active login flag
        sessionStorage.setItem('activeLogin', 'true');

        // Show loading state
        loginButton.innerHTML = '<span>Processing...</span><i class="fas fa-spinner fa-spin"></i>';
        loginButton.disabled = true;

        // Check if we already have the user info (for already logged-in users)
        const checkedUser = sessionStorage.getItem('checkedUser');
        const storedRoles = sessionStorage.getItem('userRoles');
        
        if (checkedUser && storedRoles) {
            const roles = JSON.parse(storedRoles);
            const hasAdminRole = roles.some(role => role.toLowerCase() === 'admin');
            const hasEmployeeRoles = roles.some(role => role.toLowerCase() !== 'admin');
            
            handleUserRoleSelection(email, roles, hasAdminRole, hasEmployeeRoles, userType);
            return;
        }

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
                          // Get the first document that matches
                          const doc = querySnapshot.docs[0];
                          const userData = doc.data();
                          console.log('User data:', userData);
                          
                          if (userData.roles && userData.roles.length > 0) {
                              // Store all user roles and user data
                              sessionStorage.setItem('userRoles', JSON.stringify(userData.roles));
                              sessionStorage.setItem('userEmail', email);
                              sessionStorage.setItem('userId', doc.id);
                              
                              // Check if user has requested role type (case insensitive)
                              const hasAdminRole = userData.roles.some(role => 
                                  role.toLowerCase() === 'admin');
                              const hasEmployeeRoles = userData.roles.some(role => 
                                  role.toLowerCase() !== 'admin');
                                  
                              // Debug logging
                              console.log('User roles:', userData.roles);
                              console.log('Has admin role:', hasAdminRole);
                              console.log('Has employee roles:', hasEmployeeRoles);
                              console.log('Selected login type:', userType);
                              
                              // Handle the role selection
                              handleUserRoleSelection(email, userData.roles, hasAdminRole, hasEmployeeRoles, userType);
                          } else {
                              console.error('No roles assigned to user');
                              showMessage('error', 'No roles assigned to user');
                              resetLoginButton();
                              sessionStorage.removeItem('activeLogin');
                          }
                      } else {
                          console.error('No user document found with this email');
                          showMessage('error', 'User account not found in system');
                          resetLoginButton();
                          sessionStorage.removeItem('activeLogin');
                      }
                  })
                  .catch((error) => {
                      console.error('Firestore error:', error);
                      showMessage('error', 'Error accessing user data');
                      resetLoginButton();
                      sessionStorage.removeItem('activeLogin');
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
                    case 'auth/api-key-not-valid--please-pass-a-valid-api-key':
                        showMessage('error', 'Authentication service error. Please contact support.');
                        console.error('Firebase API key not valid. Check your Firebase configuration.');
                        break;
                    default:
                        showMessage('error', 'Login failed: ' + error.message);
                }
                
                resetLoginButton();
                sessionStorage.removeItem('activeLogin');
            });
    });

    // Handle user role selection and redirect
    function handleUserRoleSelection(email, roles, hasAdminRole, hasEmployeeRoles, userType) {
        // Store admin status for reference in other pages
        sessionStorage.setItem('isAdmin', hasAdminRole);
        
        // Direct user based on toggle selection and available roles
        if (userType === 'admin' && hasAdminRole) {
            // When admin toggle is selected, always go to admin dashboard
            console.log('Redirecting to admin dashboard');
            sessionStorage.setItem('userRole', 'admin');
            
            // Show success message before redirect
            showMessage('success', 'Login successful. Redirecting to admin dashboard...');
            
            // Short delay for message to be visible
            setTimeout(() => {
                sessionStorage.removeItem('activeLogin');
                redirectToDashboard('admin');
            }, 1000);
        } else if (userType === 'employee' && hasEmployeeRoles) {
            // When employee toggle is selected and user has non-admin roles
            // Find the first non-admin role
            const employeeRoles = roles.filter(role => 
                role.toLowerCase() !== 'admin');
            
            console.log('Available employee roles:', employeeRoles);
            
            if (employeeRoles.length > 0) {
                const employeeRole = employeeRoles[0];
                console.log('Selected employee role:', employeeRole);
                
                // Store the selected employee role
                sessionStorage.setItem('userRole', employeeRole);
                
                // Show success message before redirect
                showMessage('success', `Login successful. Redirecting to ${employeeRole} dashboard...`);
                
                // Short delay for message to be visible
                setTimeout(() => {
                    sessionStorage.removeItem('activeLogin');
                    // Redirect to the appropriate dashboard based on this role
                    redirectToDashboard(employeeRole);
                }, 1000);
            } else {
                // This case should not happen with our logic, but as a fallback
                showMessage('error', 'No employee roles found for this account');
                resetLoginButton();
                sessionStorage.removeItem('activeLogin');
            }
        } else {
            showMessage('error', `You don't have ${userType} privileges. Please use the correct login type.`);
            auth.signOut();
            resetLoginButton();
            sessionStorage.clear();
        }
    }

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
            showMessage('error', 'Please enter your email address first');
            emailInput.focus();
            return;
        }
        
        // Show loading state in message
        showMessage('success', 'Sending password reset email...');
        
        // Send password reset email using Firebase Authentication
        auth.sendPasswordResetEmail(email)
            .then(() => {
                showMessage('success', 'Password reset email sent. Please check your inbox.');
            })
            .catch((error) => {
                console.error('Error sending password reset email:', error);
                
                // Specific error handling for password reset
                switch(error.code) {
                    case 'auth/user-not-found':
                        showMessage('error', 'No account found with this email address');
                        break;
                    case 'auth/invalid-email':
                        showMessage('error', 'Invalid email format');
                        break;
                    default:
                        showMessage('error', 'Failed to send password reset email. Please try again.');
                }
            });
    });
    
    // Logout functionality - can be called from any page
    window.logoutUser = function() {
        // First clear all session storage
        sessionStorage.clear();
        // Remove Firebase auth persistence data
        localStorage.removeItem(`firebase:authUser:${firebaseConfig.apiKey}:[DEFAULT]`);
        
        // Then sign out from Firebase
        auth.signOut().then(() => {
            console.log("Logout successful");
            // Use a slight delay before redirect to ensure everything is cleared
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 100);
        }).catch((error) => {
            console.error("Logout failed:", error);
            // Still redirect even if there's an error
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
                                    if (userData.roles && userData.roles.some(role => 
                                        role.toLowerCase() === 'admin')) {
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

    console.log('Login page JavaScript initialized');
});