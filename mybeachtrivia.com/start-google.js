// /start-google.js  (compat SDKs, CSP-safe Google sign-in)
(function () {
  if (typeof firebase === "undefined" || !firebase.auth) {
    console.error("[start-google] Firebase compat SDKs not found on window");
    return;
  }

  const auth = firebase.auth();
  const db   = firebase.firestore();
  const params = new URLSearchParams(location.search);

  // --- Figure out where to send the user after sign-in --------------------
  const ROLE_PATHS = {
    host:     "/beachTriviaPages/dashboards/host/",
    social:   "/beachTriviaPages/dashboards/social-media-manager/",
    writer:   "/beachTriviaPages/dashboards/writer/",
    supply:   "/beachTriviaPages/dashboards/supply-manager/",
    regional: "/beachTriviaPages/dashboards/regional-manager/",
    admin:    "/beachTriviaPages/dashboards/admin/",
  };

  const roleParam = (params.get("role") || "").toLowerCase();
  const rolePath  = ROLE_PATHS[roleParam] || ROLE_PATHS.host;

  const RETURN_URL = (() => {
    const raw = params.get("return") || rolePath || "/login.html";
    try {
      return new URL(raw, location.origin).href;
    } catch {
      return "/login.html";
    }
  })();
  // -----------------------------------------------------------------------

  const LOOP_FLAG = "bt_google_redirect_started_v4";
  const DONE_FLAG = "bt_google_redirect_done_v4";

  // --- Ensure employees/{uid} exists if there is an invite ---------------
  async function ensureEmployeeProfile(user) {
    try {
      if (!user) return;

      const uid = user.uid;
      const existing = await db.collection("employees").doc(uid).get();
      if (existing.exists) return;

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
      const invite = inviteDoc.data() || {};

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
        inviteId: inviteDoc.id,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection("employeeInvites").doc(inviteDoc.id).delete();
      console.log("[start-google] employee profile created and invite consumed");
    } catch (err) {
      console.error("[start-google] ensureEmployeeProfile error:", err);
    }
  }
  // -----------------------------------------------------------------------

  async function finish(user) {
    try { sessionStorage.removeItem(LOOP_FLAG); } catch {}
    try { sessionStorage.setItem(DONE_FLAG, "1"); } catch {}

    await ensureEmployeeProfile(user);

    // In case this page was ever opened as a popup (unlikely), notify opener
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(
          { type: "bt-google-auth", googleIdToken: null, accessToken: null },
          location.origin
        );
        setTimeout(() => window.close(), 50);
        return;
      }
    } catch (e) {
      console.warn("[start-google] postMessage to opener failed:", e);
    }

    location.replace(RETURN_URL);
  }

  // If we already fully finished once in this tab, just send them on
  try {
    if (sessionStorage.getItem(DONE_FLAG) === "1") {
      console.log("[start-google] already finished once; returning to app");
      location.replace(RETURN_URL);
      return;
    }
  } catch {}

  // --- Handle email-link sign-in (passwordless) before Google redirect ----
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
  // -----------------------------------------------------------------------

  // If already signed in (session from earlier), just finish immediately
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
    // First time on this page → start Google redirect
    try { sessionStorage.setItem(LOOP_FLAG, "1"); } catch {}
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope("profile");
    provider.addScope("email");
    provider.setCustomParameters({ prompt: "select_account" });

    console.log("[start-google] starting signInWithRedirect");
    auth.signInWithRedirect(provider).catch(err => {
      console.error("[start-google] redirect begin error:", err);
      try { sessionStorage.removeItem(LOOP_FLAG); } catch {}
      const u = new URL(RETURN_URL);
      u.searchParams.set("authError", err.code || "auth/redirect-begin-failed");
      location.replace(u.href);
    });
    return;
  }

  // Returned from Google: rely solely on onAuthStateChanged (no getRedirectResult)
  console.log("[start-google] waiting for auth state after redirect…");

  let resolved = false;
  const unsubscribe = auth.onAuthStateChanged(async (user) => {
    if (resolved) return;
    if (user) {
      resolved = true;
      unsubscribe && unsubscribe();
      console.log("[start-google] user detected after redirect → finishing");
      await finish(user);
    }
  });

  // Safety timeout: if no user appears, send them back softly
  setTimeout(() => {
    if (resolved) return;
    unsubscribe && unsubscribe();
    console.warn("[start-google] no user after redirect; returning with soft error");
    try { sessionStorage.removeItem(LOOP_FLAG); } catch {}
    const u = new URL(RETURN_URL);
    u.searchParams.set("authStatus", "cancelled");
    location.replace(u.href);
  }, 15000);
})();