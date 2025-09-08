/* login.js — email+password sign-in, then authorize via employees/{uid}
   Works with Firebase v8 or v9-compat (window.firebase global).
   Assumes firebase is initialized in a separate firebase-init.js
*/

(function () {
    // ---- Safe Firebase handles ----
    if (typeof firebase === "undefined") {
      console.error("Firebase SDK not found on window. Did firebase-init.js load?");
      return;
    }
    const auth = firebase.auth();
    const db = firebase.firestore();
  
    // ---- DOM helpers ----
    const $ = (sel) => document.querySelector(sel);
    const form = $("#login-form") || document.forms[0];
    const emailEl = $("#email") || $("#login-email") || $("input[type='email']");
    const passEl = $("#password") || $("#login-password") || $("input[type='password']");
    const rememberEl = $("#remember") || $("#login-remember");
    const errorBox = $("#login-error") || $("#error-box") || $("#error-message");
    const submitBtn = $("#login-submit") || $("#login-button") || $("button[type='submit']");
  
    // Optional: tab UI (Employee/Admin) if present
    const employeeTab = $("#tab-employee");
    const adminTab = $("#tab-admin");
  
    const setBusy = (busy) => {
      if (submitBtn) submitBtn.disabled = !!busy;
      if (submitBtn) submitBtn.classList.toggle("opacity-60", !!busy);
    };
  
    const showError = (msg) => {
      console.error(msg);
      if (errorBox) {
        errorBox.textContent = msg;
        errorBox.style.display = "block";
      } else {
        alert(msg);
      }
    };
  
    const clearError = () => {
      if (errorBox) {
        errorBox.textContent = "";
        errorBox.style.display = "none";
      }
    };
  
    // Pick a reasonable post-login target.
    const computeRedirect = (roles) => {
      const params = new URLSearchParams(location.search);
      const next = params.get("next");
      if (next) return next; // honor ?next=/path
  
      // Fallbacks: try to respect roles if your site has separate dashboards.
      if (Array.isArray(roles)) {
        if (roles.includes("admin")) return "/beachTriviaPages/dashboards/admin/";
        if (roles.includes("host")) return "/beachTriviaPages/dashboards/host/";
      }
      // Generic fallback:
      return "/index.html";
    };
  
    // Optional: persist choice
    const setPersistence = async (remember) => {
      try {
        await auth.setPersistence(
          remember ? firebase.auth.Auth.Persistence.LOCAL
                   : firebase.auth.Auth.Persis­tence.SESSION
        );
      } catch (e) {
        // If setPersistence fails (older SDKs), we just continue.
        console.warn("setPersistence warning:", e?.message || e);
      }
    };
  
    // Main submit handler
    const onSubmit = async (evt) => {
      if (evt) evt.preventDefault();
      clearError();
      setBusy(true);
  
      const email = (emailEl && emailEl.value || "").trim();
      const password = passEl && passEl.value || "";
  
      if (!email || !password) {
        setBusy(false);
        return showError("Please enter your email and password.");
      }
  
      try {
        // Respect "Remember me"
        await setPersistence(!!(rememberEl && rememberEl.checked));
  
        // Sign in with email/password (Auth)
        const cred = await auth.signInWithEmailAndPassword(email, password);
        const user = cred.user;
        if (!user) throw new Error("Sign-in failed. No user returned.");
  
        console.log("User authenticated:", user.uid);
  
        // Authorize by reading employees/{uid} (Firestore)
        const docRef = db.collection("employees").doc(user.uid);
        const snap = await docRef.get();
  
        if (!snap.exists) {
          throw new Error("No employee profile found for this account.");
        }
  
        const employee = snap.data() || {};
        console.log("Employee doc:", employee);
  
        // Enforce your rules: active + role
        if (employee.active !== true) {
          throw new Error("Your account is not active. Contact an administrator.");
        }
  
        const roles = Array.isArray(employee.roles) ? employee.roles : [];
        const usingAdminTab = !!(adminTab && adminTab.classList.contains("active"));
  
        // If the UI has separate tabs, optionally ensure role matches selected tab
        if (usingAdminTab && !roles.includes("admin")) {
          throw new Error("You must be an admin to use the Admin login.");
        }
  
        // Success → redirect
        const target = computeRedirect(roles);
        console.log("Redirecting to:", target);
        location.assign(target);
      } catch (err) {
        // Common Auth/Rules errors → friendly text
        const code = err && err.code;
        let msg =
          err?.message ||
          "Sign-in failed. Please try again.";
  
        if (code === "auth/user-not-found" || code === "auth/wrong-password") {
          msg = "Invalid email or password.";
        } else if (code === "auth/too-many-requests") {
          msg = "Too many attempts. Try again later.";
        } else if (String(msg).includes("Missing or insufficient permissions")) {
          msg =
            "Signed in, but your employee permissions are not sufficient. Check your employee record and roles.";
        }
  
        showError(msg);
      } finally {
        setBusy(false);
      }
    };
  
    // Wire up form
    if (form) {
      form.addEventListener("submit", onSubmit);
    } else if (submitBtn) {
      // Fallback if there's no <form>
      submitBtn.addEventListener("click", onSubmit);
    }
  
    // Log for visibility in Console
    console.log("Login page JavaScript initialized (UID-based authz).");
  })();
  