/* /mybeachtrivia.com/login.js
   Email/Password & Google auth, Firestore authZ via employees/{uid}
   - New signups create employees/{uid} with active:false, roles:[]
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
    function selectedTab() {
      if (adminToggle?.classList?.contains("active")) return "admin";
      if (employeeToggle?.classList?.contains("active")) return "employee";
      const hv = (hiddenUserType?.value || "").toLowerCase();
      return hv === "admin" ? "admin" : "employee";
    }
    function setTab(tab) {
      const t = (tab || "").toLowerCase() === "admin" ? "admin" : "employee";
      if (t === "admin") {
        adminToggle?.classList.add("active");
        employeeToggle?.classList.remove("active");
      } else {
        employeeToggle?.classList.add("active");
        adminToggle?.classList.remove("active");
      }
      if (hiddenUserType) hiddenUserType.value = t;
    }
    try {
      const urlTab = new URLSearchParams(location.search).get("userType");
      const prefTab = urlTab || sessionStorage.getItem("bt_login_tab");
      if (prefTab) setTab(prefTab);
    } catch (_) {}
    employeeToggle?.addEventListener("click", () => {
      setTab("employee");
      try { sessionStorage.setItem("bt_login_tab", "employee"); } catch (_) {}
    });
    adminToggle?.addEventListener("click", () => {
      setTab("admin");
      try { sessionStorage.setItem("bt_login_tab", "admin"); } catch (_) {}
    });
  
    // ----- UI helpers -----
    const setBusy = (busy) => {
      if (loginBtn)  { loginBtn.disabled  = !!busy; loginBtn.classList?.toggle("opacity-60", !!busy); }
      if (googleBtn) { googleBtn.disabled = !!busy; googleBtn.classList?.toggle("opacity-60", !!busy); }
    };
    const showMsg = (text, isError = false) => {
      if (!msgBox) { alert(text); return; }
      msgBox.textContent = text;
      msgBox.style.display = "block";
      msgBox.style.color = isError ? "#b00020" : "#0a7";
    };
    const clearMsg = () => { if (msgBox) { msgBox.textContent = ""; msgBox.style.display = "none"; } };
  
    // ----- Auth mode -----
    let mode = "login";
    const switchTo = (m) => {
      mode = m;
      if (m === "signup") {
        if (titleEl)        titleEl.textContent = "Create Account";
        if (loginBtnTxt)    loginBtnTxt.textContent = "Create account";
        if (nameRow)        nameRow.style.display = "";
        if (switchToSignup) switchToSignup.textContent = "Back to login";
      } else {
        if (titleEl)        titleEl.textContent = "Employee Login";
        if (loginBtnTxt)    loginBtnTxt.textContent = "Login";
        if (nameRow)        nameRow.style.display = "none";
        if (switchToSignup) switchToSignup.textContent = "Sign up";
      }
      clearMsg();
    };
    switchToSignup?.addEventListener("click", (e) => {
      e.preventDefault();
      switchTo(mode === "login" ? "signup" : "login");
    });
  
    // ----- Persistence -----
    async function applyPersistence() {
      try {
        await auth.setPersistence(
          rememberEl?.checked
            ? firebase.auth.Auth.Persistence.LOCAL
            : firebase.auth.Auth.Persistence.SESSION
        );
      } catch (e) {
        console.warn("setPersistence warning:", e?.message);
      }
    }
  
    // ----- Employee doc helpers -----
    function splitName(displayName = "") {
      const parts = (displayName || "").trim().split(/\s+/);
      return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") || "" };
    }
    async function ensureEmployeeDoc(user, source = "email") {
      const ref = db.collection("employees").doc(user.uid);
      const snap = await ref.get();
      if (snap.exists) return snap.data();
  
      const { firstName, lastName } = splitName(user.displayName || "");
      const payload = {
        active: false,
        email: user.email || "",
        displayName: user.displayName || `${firstName} ${lastName}`.trim() || "",
        firstName, lastName,
        roles: [],
        source,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      await ref.set(payload, { merge: true });
      return payload;
    }
    function requireActive(employee) {
      if (employee.active === true) return;
      const err = new Error("Your account was created but is not yet active. Please contact an administrator to activate it.");
      err.code = "employee/inactive";
      throw err;
    }
    function requireRoleForTab(roles) {
      if (selectedTab() === "admin" && !roles.includes("admin")) {
        const err = new Error("You must be an admin to use the Admin login.");
        err.code = "employee/not-admin";
        throw err;
      }
    }
    function computeRedirect(roles) {
      const params = new URLSearchParams(location.search);
      const next = params.get("next");
      if (next) return next;
      return selectedTab() === "admin"
        ? "/beachTriviaPages/dashboards/admin/"
        : "/beachTriviaPages/dashboards/host/";
    }
  
    async function authorizeAndRedirect(user) {
      if (!user) return;
      const ref = db.collection("employees").doc(user.uid);
      let snap = await ref.get();
      let employee = snap.exists ? (snap.data() || {}) : null;
  
      if (!employee) {
        employee = await ensureEmployeeDoc(user, "google");
        snap = await ref.get();
        employee = snap.exists ? (snap.data() || {}) : employee;
      }
  
      requireActive(employee);
      requireRoleForTab(Array.isArray(employee.roles) ? employee.roles : []);
      location.assign(computeRedirect(employee.roles || []));
    }
  
    // ----- Email/password handlers -----
    async function handleLogin(email, password) {
      await applyPersistence();
      const { user } = await auth.signInWithEmailAndPassword(email, password);
      return user;
    }
    async function handleSignup(email, password, firstName, lastName) {
      await applyPersistence();
      const { user } = await auth.createUserWithEmailAndPassword(email, password);
      if (firstName || lastName) {
        await user.updateProfile({ displayName: `${firstName || ""} ${lastName || ""}`.trim() });
      }
      await ensureEmployeeDoc(user, "email");
      return user;
    }
  
    // ----- Google via web.app helper -----
    async function openGoogleHelper() {
      await applyPersistence();
      const relay = `${WEBAPP_ORIGIN}/start-google.html?return=${encodeURIComponent(RETURN_URL)}`;
  
      // Listen for popup result via postMessage (accept both origins, and either token key)
      const onMessage = async (e) => {
        if (!POPUP_ORIGINS.includes(e.origin)) return;
        const data = e.data || {};
        if (data.type !== "bt-google-auth") return;
  
        const googleIdToken = data.googleIdToken || data.idToken || null;
        const accessToken   = data.accessToken || null;
        if (!googleIdToken) {
          setBusy(false);
          showMsg("Google sign-in failed: missing ID token.", true);
          return;
        }
  
        window.removeEventListener("message", onMessage);
        try {
          const cred = firebase.auth.GoogleAuthProvider.credential(googleIdToken, accessToken);
          await auth.signInWithCredential(cred);
          // onAuthStateChanged will finish
        } catch (err) {
          setBusy(false);
          showMsg(err?.message || "Google sign-in failed.", true);
        }
      };
      window.addEventListener("message", onMessage);
  
      // Try popup
      const w = window.open(relay, "bt_google", "width=520,height=640,noopener");
      if (!w) {
        // Popup blocked → full redirect to helper
        location.assign(relay);
      }
    }
  
    // Accept redirect fallback (#google_id_token / #id_token / legacy #bt_token)
    (async function handleHashToken() {
      const hash = location.hash ? location.hash.substring(1) : "";
      if (!hash) return;
      const hp = new URLSearchParams(hash);
      const googleIdToken =
        hp.get("google_id_token") ||
        hp.get("id_token") ||
        hp.get("bt_token");
      const accessToken = hp.get("access_token") || null;
      if (!googleIdToken) return;
  
      history.replaceState(null, "", location.pathname + location.search); // clean URL
      try {
        const cred = firebase.auth.GoogleAuthProvider.credential(googleIdToken, accessToken);
        await auth.signInWithCredential(cred);
        // onAuthStateChanged will finish
      } catch (err) {
        showMsg(err?.message || "Google sign-in failed.", true);
      }
    })();
  
    // ----- Form handlers -----
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearMsg();
      setBusy(true);
      const email = (emailEl?.value || "").trim();
      const pw    = passEl?.value || "";
      if (!email || !pw) {
        setBusy(false);
        showMsg("Please enter your email and password.", true);
        return;
      }
      try {
        const user = mode === "signup"
          ? await handleSignup(email, pw, firstNameEl?.value || "", lastNameEl?.value || "")
          : await handleLogin(email, pw);
        await authorizeAndRedirect(user);
      } catch (err) {
        const code = err?.code;
        let msg = err?.message || "Sign-in failed. Please try again.";
        if (code === "auth/user-not-found" || code === "auth/wrong-password") msg = "Invalid email or password.";
        if (code === "auth/too-many-requests") msg = "Too many attempts. Try again later.";
        showMsg(msg, true);
      } finally {
        setBusy(false);
      }
    });
  
    googleBtn?.addEventListener("click", async () => {
      clearMsg();
      setBusy(true);
      try {
        await openGoogleHelper(); // popup or redirect to web.app
      } catch (err) {
        showMsg(err?.message || "Google sign-in failed.", true);
        setBusy(false);
      }
    });
  
    forgotLink?.addEventListener("click", async (e) => {
      e.preventDefault();
      const email = (emailEl?.value || "").trim();
      if (!email) { showMsg("Enter your email first.", true); return; }
      try {
        await auth.sendPasswordResetEmail(email);
        showMsg("Password reset email sent. Check your inbox.");
      } catch (err) {
        showMsg(err?.message || "Could not send password reset email.", true);
      }
    });
  
    $("#togglePassword")?.addEventListener("click", () => {
      const type = passEl.type === "password" ? "text" : "password";
      passEl.type = type;
    });
  
    // Finish any successful sign-in
    auth.onAuthStateChanged(async (user) => {
      if (!user) return;
      try {
        await authorizeAndRedirect(user);
      } catch (e) {
        if (
          e?.code === "employee/inactive" ||
          e?.code === "employee/not-admin" ||
          String(e?.message || "").includes("Missing or insufficient permissions")
        ) {
          try { await auth.signOut(); } catch (_) {}
        }
        showMsg(e?.message || "Login error.", true);
        setBusy(false);
      }
    });
  
    console.log("Login page ready (Google via web.app/firebaseapp.com relay; no CSP changes required).");
  })();