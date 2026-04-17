// /start-google.js  (compat SDKs, CSP-safe Google sign-in)
(function () {
  "use strict";

  if (typeof firebase === "undefined" || !firebase.auth) {
    console.error("[start-google] Firebase compat SDKs not found on window");
    return;
  }

  const auth = firebase.auth();
  const db = firebase.firestore();
  const params = new URLSearchParams(location.search);

  const ROLE_PATHS = {
    host: "/beachTriviaPages/dashboards/host/",
    social: "/beachTriviaPages/dashboards/social-media-manager/social-media-manager.html",
    writer: "/beachTriviaPages/dashboards/writer/writer.html",
    supply: "/beachTriviaPages/dashboards/supply-manager/supply-manager.html",
    regional: "/beachTriviaPages/dashboards/regional-manager/regional-manager.html",
    admin: "/beachTriviaPages/dashboards/admin/",
  };

  const ROLE_STORAGE_KEY = "bt:selectedRole";
  const LOOP_FLAG = "bt_google_redirect_started_v4";
  const DONE_FLAG = "bt_google_redirect_done_v4";

  function normalizeRole(role) {
    return String(role || "").trim().toLowerCase();
  }

  function extractRoles(emp = {}) {
    const arr = Array.isArray(emp.roles) ? emp.roles : [];
    const single = emp.role ? [emp.role] : [];
    return [...new Set([...arr, ...single].filter(Boolean).map(normalizeRole))];
  }

  function saveSelectedRole(role) {
    const normalized = normalizeRole(role);
    if (!normalized) return;
    try { localStorage.setItem(ROLE_STORAGE_KEY, normalized); } catch (_) {}
    try { sessionStorage.setItem(ROLE_STORAGE_KEY, normalized); } catch (_) {}
  }

  function getSavedSelectedRole() {
    try {
      const local = normalizeRole(localStorage.getItem(ROLE_STORAGE_KEY));
      if (local) return local;
    } catch (_) {}
    try {
      const session = normalizeRole(sessionStorage.getItem(ROLE_STORAGE_KEY));
      if (session) return session;
    } catch (_) {}
    return "";
  }

  function getRequestedRole() {
    const paramRole = normalizeRole(params.get("role"));
    const savedRole = getSavedSelectedRole();
    const requested = paramRole || savedRole || "host";
    saveSelectedRole(requested);
    return requested;
  }

  function getPathForRole(role) {
    return ROLE_PATHS[normalizeRole(role)] || ROLE_PATHS.host;
  }

  function getValidRoleForUser(emp, requestedRole) {
    const roles = extractRoles(emp);
    const requested = normalizeRole(requestedRole);

    if (requested && roles.includes(requested)) return requested;
    if (roles.length === 1) return roles[0];
    if (roles.includes("host")) return "host";
    if (roles.includes("admin")) return "admin";
    return roles[0] || "host";
  }

  function cacheEmployeeDoc(uid, emp) {
    try {
      sessionStorage.setItem("bt:empCache", JSON.stringify({
        uid,
        emp,
        ts: Date.now(),
      }));
    } catch (_) {}
  }

  function buildFallbackReturnUrl(role) {
    return new URL(getPathForRole(role), location.origin).href;
  }

  const requestedRole = getRequestedRole();

  const RETURN_URL = (() => {
    const raw = params.get("return") || buildFallbackReturnUrl(requestedRole) || "/login.html";
    try {
      return new URL(raw, location.origin).href;
    } catch {
      return new URL("/login.html", location.origin).href;
    }
  })();

  async function ensureEmployeeProfile(user) {
    try {
      if (!user) return null;

      const uid = user.uid;
      const existing = await db.collection("employees").doc(uid).get();
      if (existing.exists) {
        return existing.data() || {};
      }

      const inviteSnap = await db
        .collection("employeeInvites")
        .where("email", "==", user.email)
        .limit(1)
        .get();

      if (inviteSnap.empty) {
        console.log("[start-google] no invite found for", user.email);
        return null;
      }

      const inviteDoc = inviteSnap.docs[0];
      const invite = inviteDoc.data() || {};

      const display = user.displayName || "";
      const parts = display.trim().split(/\s+/);
      const firstName = parts[0] || "";
      const lastName = parts.slice(1).join(" ") || "";

      const inviteRoles = Array.isArray(invite.roles)
        ? invite.roles
        : (invite.role ? [invite.role] : ["host"]);

      const cleanedRoles = [...new Set(inviteRoles.filter(Boolean).map(normalizeRole))];
      const primaryRole = cleanedRoles[0] || "host";

      const employeePayload = {
        uid,
        email: user.email,
        firstName,
        lastName,
        nickname: "",
        phone: "",
        active: invite.active !== false,
        role: primaryRole,
        roles: cleanedRoles,
        inviteId: inviteDoc.id,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      await db.collection("employees").doc(uid).set(employeePayload);
      await db.collection("employeeInvites").doc(inviteDoc.id).delete();

      console.log("[start-google] employee profile created and invite consumed");
      return employeePayload;
    } catch (err) {
      console.error("[start-google] ensureEmployeeProfile error:", err);
      return null;
    }
  }

  async function getEmployeeDoc(user) {
    const ensured = await ensureEmployeeProfile(user);
    if (ensured) {
      const snap = await db.collection("employees").doc(user.uid).get();
      return snap.exists ? (snap.data() || ensured) : ensured;
    }

    const snap = await db.collection("employees").doc(user.uid).get();
    return snap.exists ? (snap.data() || {}) : {};
  }

  function getPostLoginUrl(emp, requestedRoleValue) {
    const validRole = getValidRoleForUser(emp, requestedRoleValue);
    saveSelectedRole(validRole);
    return getPathForRole(validRole);
  }

  async function finish(user) {
    try { sessionStorage.removeItem(LOOP_FLAG); } catch {}
    try { sessionStorage.setItem(DONE_FLAG, "1"); } catch {}

    const emp = await getEmployeeDoc(user);

    if (emp && emp.active === false) {
      const denied = new URL("/login.html", location.origin);
      denied.searchParams.set("authError", "account-inactive");
      location.replace(denied.href);
      return;
    }

    cacheEmployeeDoc(user.uid, emp || {});

    const targetPath = getPostLoginUrl(emp || {}, requestedRole);
    const targetUrl = new URL(targetPath, location.origin).href;

    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(
          {
            type: "bt-google-auth",
            googleIdToken: null,
            accessToken: null,
            selectedRole: getValidRoleForUser(emp || {}, requestedRole),
            returnUrl: targetUrl
          },
          location.origin
        );
        setTimeout(() => window.close(), 50);
        return;
      }
    } catch (e) {
      console.warn("[start-google] postMessage to opener failed:", e);
    }

    location.replace(targetUrl || RETURN_URL);
  }

  try {
    if (sessionStorage.getItem(DONE_FLAG) === "1") {
      if (auth.currentUser) {
        console.log("[start-google] already finished once; returning to app");
        const path = getPathForRole(requestedRole);
        location.replace(new URL(path, location.origin).href);
        return;
      } else {
        console.log("[start-google] DONE_FLAG set but no current user (logged out?) — clearing flag");
        sessionStorage.removeItem(DONE_FLAG);
      }
    }
  } catch {}

  (async () => {
    try {
      if (!auth.isSignInWithEmailLink(window.location.href)) return;

      let email = null;
      try { email = window.localStorage.getItem("emailForSignIn"); } catch {}
      if (!email) {
        email = window.prompt("Please confirm your email to finish sign-in:");
        if (!email) throw new Error("Email confirmation cancelled");
      }

      await auth.signInWithEmailLink(email, window.location.href);
      try { window.localStorage.removeItem("emailForSignIn"); } catch {}

      console.log("[start-google] email-link sign-in completed");
      if (auth.currentUser) {
        await finish(auth.currentUser);
        return;
      }
    } catch (e) {
      console.error("[start-google] email-link sign-in failed:", e);
    }
  })();

  if (auth.currentUser) {
    console.log("[start-google] user already signed in → finishing");
    finish(auth.currentUser);
    return;
  }

  const started = (() => {
    try { return sessionStorage.getItem(LOOP_FLAG) === "1"; }
    catch { return false; }
  })();

  if (!started) {
    try { sessionStorage.setItem(LOOP_FLAG, "1"); } catch {}

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope("profile");
    provider.addScope("email");
    provider.setCustomParameters({ prompt: "select_account" });

    console.log("[start-google] starting signInWithRedirect");
    auth.signInWithRedirect(provider).catch(err => {
      console.error("[start-google] redirect begin error:", err);
      try { sessionStorage.removeItem(LOOP_FLAG); } catch {}

      const u = new URL("/login.html", location.origin);
      u.searchParams.set("authError", err.code || "auth/redirect-begin-failed");
      location.replace(u.href);
    });
    return;
  }

  console.log("[start-google] waiting for auth state after redirect…");

  let resolved = false;

  (async () => {
    try {
      const result = await auth.getRedirectResult();
      if (result && result.user && !resolved) {
        resolved = true;
        console.log("[start-google] user from getRedirectResult → finishing");
        await finish(result.user);
      }
    } catch (err) {
      console.warn("[start-google] getRedirectResult error:", err.code || err.message);
    }
  })();

  const unsubscribe = auth.onAuthStateChanged(async (user) => {
    if (resolved) return;
    if (user) {
      resolved = true;
      unsubscribe && unsubscribe();
      console.log("[start-google] user detected via onAuthStateChanged → finishing");
      await finish(user);
    }
  });

  setTimeout(() => {
    if (resolved) return;
    unsubscribe && unsubscribe();
    console.warn("[start-google] no user after redirect; returning with soft error");
    try { sessionStorage.removeItem(LOOP_FLAG); } catch {}

    const u = new URL("/login.html", location.origin);
    u.searchParams.set("authStatus", "cancelled");
    location.replace(u.href);
  }, 15000);
})();