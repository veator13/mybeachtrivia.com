// login-return.js
// Ensures first login goes to account setup, and respects ?return=... if present.
// Requires Firebase v9 compat (firebase.auth(), firebase.firestore()) to be loaded on the page.

// --- 1) Capture ?return / ?next / ?redirect and store for after-login use ---
(function () {
  try {
    const p = new URLSearchParams(location.search);
    const t =
      p.get("return") ||
      p.get("next") ||
      p.get("redirect") ||
      "";
    if (t) {
      sessionStorage.setItem("afterLogin", t);
      // also mirror to localStorage in case of cross-tab
      try { localStorage.setItem("afterLogin", t); } catch {}
      console.log("[login-return] saved afterLogin =", t);
    } else {
      sessionStorage.removeItem("afterLogin");
      try { localStorage.removeItem("afterLogin"); } catch {}
      console.log("[login-return] cleared afterLogin (no param)");
    }
  } catch (e) {
    console.warn("[login-return] capture error", e);
  }
})();

// --- 2) Post-sign-in redirect logic ------------------------------------------
(function () {
  const auth = firebase.auth();
  const db   = firebase.firestore();

  // Where the first-time setup lives:
  const PATH_SETUP    = "/beachTriviaPages/onboarding/account-setup/";
  // Where to go if setup is complete and no explicit return is provided:
  const DEFAULT_AFTER = "/beachTriviaPages/dashboards/host/";

  function getParam(name) {
    try { return new URL(location.href).searchParams.get(name) || ""; }
    catch { return ""; }
  }

  // Normalize internal paths and strip origins so we don't navigate off-site.
  function normalizePath(p) {
    if (!p) return "";
    try {
      const u = new URL(p, location.origin);
      // Only allow same-origin destinations; otherwise ignore.
      if (u.origin !== location.origin) return "";
      return u.pathname + (u.search || "") + (u.hash || "");
    } catch {
      // Fallback: treat as path if it looks relative
      if (typeof p === "string" && p.startsWith("/")) return p;
      return "";
    }
  }

  function getAfterLoginHint() {
    const viaQs =
      getParam("return") || getParam("next") || getParam("redirect") || "";
    if (viaQs) return normalizePath(viaQs);
    try {
      const ss = sessionStorage.getItem("afterLogin") || "";
      if (ss) return normalizePath(ss);
      const ls = localStorage.getItem("afterLogin") || "";
      if (ls) return normalizePath(ls);
    } catch {}
    return "";
  }

  async function needsSetup(uid) {
    try {
      const snap = await db.collection("employees").doc(uid).get();
      if (!snap.exists) return true; // no doc => route to setup to collect basics
      const d = snap.data() || {};

      // If you explicitly mark completion, honor it.
      if (d.setupCompleted === true) return false;

      // Heuristic: require basic profile info
      const hasName  = !!(d.fullName || d.name);
      const hasPhone = !!(d.phone || d.phoneNumber);
      return !(hasName && hasPhone);
    } catch (e) {
      console.warn("[login-return] needsSetup error", e);
      return true; // be safe: send to setup
    }
  }

  function alreadyOnSetup() {
    return location.pathname.startsWith(PATH_SETUP);
  }

  async function handleSignedIn(user) {
    // 1) If caller provided an explicit target (?return=), honor it.
    let dest = getAfterLoginHint();

    // 2) Otherwise decide based on employee doc.
    if (!dest) {
      const mustSetup = await needsSetup(user.uid);
      dest = mustSetup ? PATH_SETUP : DEFAULT_AFTER;
    }

    // Avoid loops: if we're already on the setup route and dest is setup, do nothing.
    if (alreadyOnSetup() && dest.startsWith(PATH_SETUP)) {
      return;
    }

    // Clear the hint so subsequent logins use fresh logic.
    try {
      sessionStorage.removeItem("afterLogin");
      localStorage.removeItem("afterLogin");
    } catch {}

    // Navigate
    try { window.location.assign(dest); }
    catch { window.location.href = dest; }
  }

  // Wait for sign-in and route accordingly.
  auth.onAuthStateChanged((user) => {
    if (!user) return; // stay on login screen
    // Slight microtask delay to let any UI state settle (optional).
    Promise.resolve().then(() => handleSignedIn(user));
  });
})();
(function roleOverride(){
  try {
    const qs = new URLSearchParams(location.search);
    // If an explicit destination is provided or already stored, do nothing.
    if (qs.get('return') || qs.get('next') || qs.get('redirect') ||
        sessionStorage.getItem('afterLogin') || localStorage.getItem('afterLogin')) {
      return;
    }
    let role = (qs.get('role') || localStorage.getItem('postLoginRole') || '').toLowerCase();
    if (role === 'host' || role === 'admin') {
      const dest = role === 'host'
        ? (location.origin + '/beachTriviaPages/dashboards/host/')
        : (location.origin + '/beachTriviaPages/dashboards/admin/');
      try { localStorage.removeItem('postLoginRole'); sessionStorage.removeItem('postLoginRole'); } catch {}
      location.replace(dest);
    }
  } catch (e) {
    console.warn('[login-return] role override skipped:', e?.message || e);
  }
})();
