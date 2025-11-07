// /start-google.js  (compat SDKs, CSP-safe Google sign-in helper)
(function () {
  if (typeof firebase === "undefined" || !firebase.auth) {
    console.error("[start-google] Firebase compat SDKs not found on window");
    return;
  }

  const auth = firebase.auth();
  const db   = firebase.firestore();
  const params = new URLSearchParams(location.search);

  // ----- Role + return URL handling ----------------------------------------

  const rawRole = (params.get("role") || "").toLowerCase();
  const FALLBACK_RETURN = params.get("return") || "/login.html";

  const ROLE_DEST = {
    host:  "/beachTriviaPages/dashboards/host/",
    admin: "/beachTriviaPages/dashboards/admin/",
  };

  // Path we want to end up on
  const ROLE_REDIRECT_PATH = ROLE_DEST[rawRole] || FALLBACK_RETURN;
  const ROLE_REDIRECT = new URL(ROLE_REDIRECT_PATH, window.location.origin).href;
  const RETURN_ORIGIN = new URL(ROLE_REDIRECT).origin;

  try {
    localStorage.setItem("postLoginRole", rawRole || "host");
  } catch (_) {}

  // Loop flags to avoid infinite redirect cycles
  const LOOP_FLAG = "bt_google_redirect_started_v3";
  const DONE_FLAG = "bt_google_redirect_done_v3";

  // ----- Email-link sign-in support ----------------------------------------

  (async () => {
    try {
      if (auth.isSignInWithEmailLink(window.location.href)) {
        let email = null;
        try {
          email = window.localStorage.getItem("emailForSignIn");
        } catch (_) {}

        if (!email) {
          email = window.prompt("Please confirm your email to finish sign-in:");
          if (!email) throw new Error("Email confirmation cancelled");
        }

        await auth.signInWithEmailLink(email, window.location.href);
        try {
          window.localStorage.removeItem("emailForSignIn");
        } catch (_) {}

        // Clean URL (preserve ?return= if present)
        try {
          const qs  = new URLSearchParams(location.search);
          const ret = qs.get("return");
          history.replaceState(
            {},
            document.title,
            location.pathname + (ret ? `?return=${encodeURIComponent(ret)}` : "")
          );
        } catch (_) {}

        console.log("[start-google] email-link sign-in completed");
      }
    } catch (e) {
      console.error("[start-google] email-link sign-in failed:", e);
      // non-fatal; we can still use Google
    }
  })();

  // ----- Provision employees/{uid} from employeeInvites --------------------

  async function ensureEmployeeProfile(user) {
    try {
      if (!user) return;

      const uid = user.uid;
      const existing = await db.collection("employees").doc(uid).get();
      if (existing.exists) return;

      // Look up invite by email
      const inviteSnap = await db
        .collection("employeeInvites")
        .where("email", "==", user.email)
        .limit(1)
        .get();

      if (inviteSnap.empty) {
        console.log("[start-google] no invite found for", user.email);
        return;
      }

      const inviteDoc = inviteSnap.docs[0];
      const invite = inviteDoc.data();

      const display = user.displayName || "";
      const parts = display.trim().split(/\s+/);
      const firstName = parts[0] || "";
      const lastName  = parts.slice(1).join(" ") || "";

      await db.collection("employees").doc(uid).set({
        uid,
        email: user.email,
        firstName,
        lastName,
        nickname: "",
        phone: "",
        active: invite.active !== false,
        role: invite.role || "host",
        inviteId: inviteDoc.id, // required by your Firestore rules
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      // Let invited user clean up their invite
      await db.collection("employeeInvites").doc(inviteDoc.id).delete();
      console.log("[start-google] employee profile created and invite consumed");
    } catch (err) {
      console.error("[start-google] ensureEmployeeProfile error:", err);
      // best-effort only
    }
  }

  // ----- Helpers -----------------------------------------------------------

  function postToOpener(payload) {
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, RETURN_ORIGIN);
        console.log("[start-google] posted message to opener → closing");
        setTimeout(() => window.close(), 50);
        return true;
      }
    } catch (e) {
      console.warn("[start-google] postMessage failed:", e);
    }
    return false;
  }

  async function finish(user) {
    try { sessionStorage.removeItem(LOOP_FLAG); } catch (_) {}
    try { sessionStorage.setItem(DONE_FLAG, "1"); } catch (_) {}

    await ensureEmployeeProfile(user);

    const payload = {
      type: "bt-google-auth",
      googleIdToken: null,
      accessToken: null,
    };

    if (postToOpener(payload)) return;

    const u = new URL(ROLE_REDIRECT);
    u.hash = "authStatus=ok";
    location.replace(u.href);
  }

  // If we already finished once, just bounce back
  try {
    if (sessionStorage.getItem(DONE_FLAG) === "1") {
      console.log("[start-google] already finished once; returning");
      location.replace(ROLE_REDIRECT);
      return;
    }
  } catch (_) {}

  // Optional: provision-only mode (used by tools if ever needed)
  const PROVISION_ONLY = params.get("provision") === "1";
  if (PROVISION_ONLY) {
    console.log("[start-google] provision-only mode");
    if (auth.currentUser) {
      console.log("[start-google] user already signed in → finishing (provision-only)");
      finish(auth.currentUser);
      return;
    }

    let resolved = false;
    const unsub = auth.onAuthStateChanged((u) => {
      if (!u || resolved) return;
      resolved = true;
      unsub && unsub();
      console.log("[start-google] user detected → finishing (provision-only)");
      finish(u);
    });

    setTimeout(() => {
      if (resolved) return;
      console.log("[start-google] no session → starting Google (provision fallback)");
      unsub && unsub();

      try { sessionStorage.setItem(LOOP_FLAG, "1"); } catch (_) {}
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope("profile");
      provider.addScope("email");
      provider.setCustomParameters({ prompt: "select_account" });

      auth.signInWithRedirect(provider).catch((err) => {
        console.error("[start-google] redirect begin error (provision fallback):", err);
        const u = new URL(ROLE_REDIRECT);
        u.searchParams.set("authError", err.code || "auth/redirect-begin-failed");
        location.replace(u.href);
      });
    }, 1500);

    return;
  }

  // Already signed-in? Just finish.
  if (auth.currentUser) {
    console.log("[start-google] user already signed in → finishing");
    finish(auth.currentUser);
    return;
  }

  const started = (() => {
    try { return sessionStorage.getItem(LOOP_FLAG) === "1"; }
    catch { return false; }
  })();

  // ----- First visit: kick off Google redirect ----------------------------

  if (!started) {
    try { sessionStorage.setItem(LOOP_FLAG, "1"); } catch (_) {}

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope("profile");
    provider.addScope("email");
    provider.setCustomParameters({ prompt: "select_account" });

    console.log("[start-google] starting signInWithRedirect");
    auth.signInWithRedirect(provider).catch((err) => {
      console.error("[start-google] redirect begin error:", err);
      const u = new URL(ROLE_REDIRECT);
      u.searchParams.set("authError", err.code || "auth/redirect-begin-failed");
      location.replace(u.href);
    });
    return;
  }

  // ----- Returned from Google: complete the redirect ----------------------

  console.log("[start-google] waiting for auth state after redirect…");

  let resolved = false;

  // 1) Try getRedirectResult explicitly (some browsers need this)
  auth
    .getRedirectResult()
    .then(async (result) => {
      if (result && result.user) {
        console.log("[start-google] getRedirectResult → user found, finishing");
        resolved = true;
        await finish(result.user);
        return;
      }

      console.log("[start-google] getRedirectResult returned no user; listening for auth changes…");
      wireAuthListener();
    })
    .catch((err) => {
      console.error("[start-google] getRedirectResult error:", err);
      const u = new URL(ROLE_REDIRECT);
      u.searchParams.set("authError", err.code || "auth/redirect-result-error");
      location.replace(u.href);
    });

  function wireAuthListener() {
    if (resolved) return;

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (resolved || !user) return;
      resolved = true;
      unsubscribe && unsubscribe();
      console.log("[start-google] user detected → finishing");
      await finish(user);
    });

    // Safety timeout
    setTimeout(() => {
      if (resolved) return;
      unsubscribe && unsubscribe();
      console.warn("[start-google] no user after redirect; returning with soft error");
      try { sessionStorage.removeItem(LOOP_FLAG); } catch (_) {}
      const u = new URL(ROLE_REDIRECT);
      u.searchParams.set("authStatus", "cancelled");
      location.replace(u.href);
    }, 15000);
  }
})();