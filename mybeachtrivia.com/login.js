/* login.js — Email/Password & Google auth, Firestore authZ via employees/{uid}
   - New signups (email or Google) create employees/{uid} with active:false, roles:[]
   - Existing users must be active:true to proceed
   - Admin tab requires 'admin' role
   - Employee tab always routes to Host dashboard (even if user is also admin)
   - Works with Firebase v8/v9-compat
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
  
    // ----- Tab helpers -----
    function selectedTab() {
      // Prefer visible active state; fall back to hidden input; default "employee"
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
  
    // Remember tab choice for a nicer UX (session only)
    try {
      const urlTab = new URLSearchParams(location.search).get("userType");
      const prefTab = urlTab || sessionStorage.getItem("bt_login_tab");
      if (prefTab) setTab(prefTab);
    } catch (_e) {}
  
    employeeToggle?.addEventListener("click", () => {
      setTab("employee");
      try { sessionStorage.setItem("bt_login_tab", "employee"); } catch (_e) {}
    });
    adminToggle?.addEventListener("click", () => {
      setTab("admin");
      try { sessionStorage.setItem("bt_login_tab", "admin"); } catch (_e) {}
    });
  
    // ----- UI helpers -----
    const setBusy = (busy) => {
      if (loginBtn) {
        loginBtn.disabled = !!busy;
        loginBtn.classList?.toggle("opacity-60", !!busy);
      }
      if (googleBtn) {
        googleBtn.disabled = !!busy;
        googleBtn.classList?.toggle("opacity-60", !!busy);
      }
    };
  
    const showMsg = (text, isError = false) => {
      if (!msgBox) { alert(text); return; }
      msgBox.textContent = text;
      msgBox.style.display = "block";
      msgBox.style.color = isError ? "#b00020" : "#0a7";
    };
    const clearMsg = () => {
      if (!msgBox) return;
      msgBox.textContent = "";
      msgBox.style.display = "none";
    };
  
    // ----- Auth mode -----
    let mode = "login"; // or "signup"
    const switchTo = (m) => {
      mode = m;
      if (m === "signup") {
        if (titleEl)      titleEl.textContent = "Create Account";
        if (loginBtnTxt)  loginBtnTxt.textContent = "Create account";
        if (nameRow)      nameRow.style.display = "";
        if (switchToSignup) switchToSignup.textContent = "Back to login";
      } else {
        if (titleEl)      titleEl.textContent = "Employee Login";
        if (loginBtnTxt)  loginBtnTxt.textContent = "Login";
        if (nameRow)      nameRow.style.display = "none";
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
      const parts = displayName.trim().split(/\s+/);
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
        firstName,
        lastName,
        roles: [],            // No roles by default
        source,               // "email" or "google"
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      await ref.set(payload, { merge: true });
      return payload;
    }
  
    function requireActive(employee) {
      if (employee.active === true) return;
      throw new Error(
        "Your account was created but is not yet active. Please contact an administrator to activate it."
      );
    }
  
    function requireRoleForTab(roles) {
      // Only enforce admin when Admin tab is selected
      if (selectedTab() === "admin" && !roles.includes("admin")) {
        throw new Error("You must be an admin to use the Admin login.");
      }
    }
  
    function computeRedirect(roles) {
      const params = new URLSearchParams(location.search);
      const next = params.get("next");
      if (next) return next; // always honor ?next=
  
      // Respect the selected tab explicitly
      const tabSel = selectedTab();
      if (tabSel === "admin") return "/beachTriviaPages/dashboards/admin/";
      // Employee tab: always go to host dashboard
      return "/beachTriviaPages/dashboards/host/";
    }
  
    // ----- Auth flows -----
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
  
    async function handleGoogle() {
      await applyPersistence();
      const provider = new firebase.auth.GoogleAuthProvider();
      const { user, additionalUserInfo } = await auth.signInWithPopup(provider);
      if (additionalUserInfo?.isNewUser) {
        await ensureEmployeeDoc(user, "google");
      }
      return user;
    }
  
    async function authorizeAndRedirect(user) {
      if (!user) throw new Error("No user returned from auth.");
      console.log("User authenticated:", user.uid);
  
      const snap = await db.collection("employees").doc(user.uid).get();
      if (!snap.exists) {
        throw new Error("No employee profile found for this account.");
      }
      const employee = snap.data() || {};
      console.log("Employee doc:", employee);
  
      requireActive(employee);
      requireRoleForTab(Array.isArray(employee.roles) ? employee.roles : []);
  
      const target = computeRedirect(employee.roles || []);
      console.log("Redirecting to:", target, "(tab:", selectedTab(), ")");
      location.assign(target);
    }
  
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
        const user = await handleGoogle();
        await authorizeAndRedirect(user);
      } catch (err) {
        showMsg(err?.message || "Google sign-in failed.", true);
      } finally {
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
  
    // Password visibility
    $("#togglePassword")?.addEventListener("click", () => {
      const type = passEl.type === "password" ? "text" : "password";
      passEl.type = type;
    });
  
    console.log("Login page JavaScript initialized (UID-based authz; tab-aware routing).");
  })();