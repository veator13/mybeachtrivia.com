/* /mybeachtrivia.com/login.js
   Email/Password & Google auth, Firestore authZ via employees/{uid}
   - New signups create employees/{uid} with active:false, roles: ["host"]
   - Existing users must be active:true to proceed
   - Admin tab requires 'admin' role
   - Employee tab routes to Host dashboard
   - Google auth: run on web.app helper (no CSP issues), then finish here with signInWithCredential.
*/
(function () {
  if (typeof firebase === "undefined") {
    console.error("Firebase SDK not found on window.");
    return;
  }

  const auth = firebase.auth();

  // Early redirect to ?return / sessionStorage.afterLogin once signed in (CSP-safe)
try {
  auth.onAuthStateChanged(function(user) {
    if (!user) return;
    try {
      const t = sessionStorage.getItem("afterLogin");
      if (t) {
        const u = new URL(t, location.origin);
        if (u.origin === location.origin) {
          sessionStorage.removeItem("afterLogin");
          location.replace(u.href);
          return;
        }
      }
    } catch (e) {
      console.warn("[login.js] early afterLogin hook failed", e);
    }
  });
} catch (e) {
  console.warn("[login.js] early onAuthStateChanged hook failed", e);
}

  const db   = firebase.firestore();

  // ----- DOM -----
  const $ = (sel) => document.querySelector(sel);
  const form           = $("#loginForm");
  const emailEl        = $("#username");
  const passEl         = $("#password");
  const rememberEl     = $("#rememberMe");
  const loginBtn       = $("#loginButton");
  const loginBtnTxt    = $("#loginButtonText");
  const googleBtn      = $("#googleButton");
  const forgotLink     = $("#forgotPassword");
  const msgBox         = $("#messageContainer");
  const titleEl        = $("#loginTitle");
  const nameRow        = $("#nameRow");
  const firstNameEl    = $("#firstName");
  const lastNameEl     = $("#lastName");
  const employeeToggle = $("#employee-toggle");
  const adminToggle    = $("#admin-toggle");
  const switchToSignup = $("#switchToSignup");
  const hiddenUserType = $("#userType");

  // Origins/URLs
  const WEBAPP_ORIGIN  = "https://beach-trivia-website.web.app";
  const POPUP_ORIGINS  = [
    "https://beach-trivia-website.web.app",
    "https://beach-trivia-website.firebaseapp.com",
  ];
  const RETURN_URL     = `${location.origin}/login.html`; // where the helper returns to

  // ----- Tab helpers -----
  function selectedTab(){ return "employee"; } // legacy no-op

// Role → destination mapping
// Map each role to its dashboard route
const ROLE_DEST = {
  host: '/beachTriviaPages/dashboards/host/',
  social: '/beachTriviaPages/dashboards/social-media-manager/',
  writer: '/beachTriviaPages/dashboards/writer/',
  supply: '/beachTriviaPages/dashboards/supply-manager/',
  regional: '/beachTriviaPages/dashboards/regional-manager/',
  admin: '/beachTriviaPages/dashboards/admin/',
};

function selectedRole(){
  const el = document.getElementById("roleSelect");
  if (el && el.value) return el.value;
  return "host";
}

function requireRoleForSelection(roles){
  const role = selectedRole();
  if (!Array.isArray(roles)) roles = roles ? [roles] : [];
  if (!roles.includes(role)){
    const err = new Error("You do not have access to the selected role.");
    err.code = "employee/not-in-role";
    throw err;
  }

function setTab(tab) {
  const t = (String(tab || '').toLowerCase() === 'admin') ? 'admin' : 'employee';
  if (typeof adminToggle !== 'undefined' && adminToggle && typeof employeeToggle !== 'undefined' && employeeToggle) {
    if (t === 'admin') {
      adminToggle.classList.add('active');
      employeeToggle.classList.remove('active');
    } else {
      employeeToggle.classList.add('active');
      adminToggle.classList.remove('active');
    }
  }
  if (typeof hiddenUserType !== 'undefined' && hiddenUserType) hiddenUserType.value = t;
}
