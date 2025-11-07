// /start-google.js  (compat SDKs)
// Loads on /start-google.html. No getRedirectResult() to avoid CSP/gapi issues.
(function () {
  if (typeof firebase === "undefined" || !firebase.auth) {
    console.error("[start-google] Firebase compat SDKs not found on window");
    return;
  }

  const auth   = firebase.auth();
  const db     = firebase.firestore();
  const params = new URLSearchParams(location.search);

  // Where to return after Google or email-link
  const RETURN_URL = (() => {
    const raw = params.get("return");
    if (!raw) return "/login.html";
    try {
      return new URL(raw, location.origin).href;
    } catch {
      return "/login.html";
    }
  })();

  // --- role-aware return (inserted) ---
  const __role = (new URLSearchParams(location.search).get("role") || "").toLowerCase();

  const ROLE_REDIRECT =
    __role === "host"
      ? location.origin + "/beachTriviaPages/dashboards/host/"
      : __role === "admin"
        ? location.origin + "/beachTriviaPages/dashboards/admin/"
        : RETURN_URL;

  try {
    localStorage.setItem("postLoginRole", __role);
  } catch (e) {
    // ignore
  }

  const RETURN_ORIGIN = new URL(ROLE_REDIRECT, location.origin).origin;

  // Loop guards (for Google redirect flow only)
  const LOOP_FLAG = "bt_google_redirect_started_v3";
  const DONE_FLAG = "bt_google_redirect_done_v3";

  // ---- 1) Handle Firebase "Email Link" sign-in (passwordless invite) ----
  // If the user clicked the emailed link, complete sign-in right here
  (async () => {
    try {
      if (auth.isSignInWithEmailLink(window.location.href)) {
        let email = null;
        try {
          email = window.localStorage.getItem("emailForSignIn");
        } catch {}
        if (!email) {
          email = window.prompt("Please confirm your email to finish sign-in:");
          if (!email) throw new Error("Email confirmation cancelled");
        }
        await auth.signInWithEmailLink(email, window.location.href);
        try {
          window.localStorage.removeItem("emailForSignIn");
        } catch {}

        // Clean URL to remove the long oobCode parameters (preserve ?return=)
        try {
          const qs = new URLSearchParams(location.search);
          const ret = qs.get("return");
          history.replaceState(
            {},
            document.title,
            location.pathname + (ret ? `?return=${encodeURIComponent(ret)}` : "")
          );
        } catch {}

        console.log("[start-google] email-link sign-in completed");
      }
    } catch (e) {
      console.error("[start-google] email-link sign-in failed:", e);
      // Continue; we can still try Google flow if needed.
    }
  })();
  // -----------------------------------------------------------------------

  // --- Create employees/{uid} from employeeInvites (email match) -----------
  async function ensureEmployeeProfile(user) {
    try {
      if (!user) return;

      const uid = user.uid;
      const existing = await db.collection("employees").doc(uid).get();
      if (existing.exists) return;

      // Find any invite for this email (first/any)
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
      const lastName = parts.slice(1).join(" ") || "";

      // IMPORTANT: include inviteId to satisfy your Firestore "create" rule
      await db.collection("employees").doc(uid).set({
        uid,
        email: user.email,
        firstName,
        lastName,
        nickname: "",
        phone: "",
        active: invite.active !== false, // default true
        role: invite.role || "host",
        inviteId: inviteDoc.id, // <-- REQUIRED by your rules
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      // Invited user may delete their own invite (your rules allow this)
      await db.collection("employeeInvites").doc(inviteDoc.id).delete();
      console.log("[start-google] employee profile created and invite consumed");
    } catch (err) {
      console.error("[start-google] ensureEmployeeProfile error:", err);
      // non-blocking
    }
  }
  // -------------------------------------------------------------------------

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
    try {
      sessionStorage.removeItem(LOOP_FLAG);
    } catch {}
    try {
      sessionStorage.setItem(DONE_FLAG, "1");
    } catch {}

    // Provision employee record (best effort)
    await ensureEmployeeProfile(user);

    // We’re not using OAuth credentials (to avoid gapi), so send nulls
    const payload = {
      type: "bt-google-auth",
      googleIdToken: null,
      accessToken: null,
    };

    if (postToOpener(payload)) return;

    const u = new URL(ROLE_REDIRECT, location.origin);
    u.hash = "authStatus=ok";
    location.replace(u.href);
  }

  // If we already finished once, bounce back
  try {
    if (sessionStorage.getItem(DONE_FLAG) === "1") {
      console.log("[start-google] already finished once; returning");
      location.replace(ROLE_REDIRECT);
      return;
    }
  } catch {}

  // -----------------------------------------------------------------------
  // Provision-only mode: try to finish if already signed in; otherwise
  // automatically FALL BACK to Google redirect after a short wait.
  // Use:  /start-google.html?return=/login.html&provision=1
  const PROVISION_ONLY = params.get("provision") === "1";
  if (PROVISION_ONLY) {
    console.log("[start-google] provision-only mode");
    if (auth.currentUser) {
      console.log(
        "[start-google] user already signed in → finishing (provision-only)"
      );
      finish(auth.currentUser);
      return;
    }
    console.log("[start-google] waiting for auth state (provision-only) …");
    let resolved = false;
    const unsubProvision = auth.onAuthStateChanged((u) => {
      if (!u || resolved) return;
      resolved = true;
      unsubProvision && unsubProvision();
      console.log("[start-google] user detected → finishing (provision-only)");
      finish(u);
    });

    // Fallback: if no auth after 1.5s, start Google redirect
    setTimeout(() => {
      if (resolved) return;
      console.log(
        "[start-google] no session → starting Google (provision fallback)"
      );
      try {
        sessionStorage.setItem(LOOP_FLAG, "1");
      } catch {}
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope("profile");
      provider.addScope("email");
      provider.setCustomParameters({ prompt: "select_account" });
      auth.signInWithRedirect(provider).catch((err) => {
        console.error(
          "[start-google] redirect begin error (provision fallback):",
          err
        );
        const u = new URL(ROLE_REDIRECT, location.origin);
        u.searchParams.set(
          "authError",
          err.code || "auth/redirect-begin-failed"
        );
        location.replace(u.href);
      });
    }, 1500);
    return; // stop here; redirect or onAuthStateChanged will handle the rest
  }
  // -----------------------------------------------------------------------

  // If already signed-in (either from email-link or prior session), just finish
  if (auth.currentUser) {
    console.log("[start-google] user already signed in → finishing");
    finish(auth.currentUser);
    return;
  }

  // If this visit is from an email-link flow, onAuthStateChanged will fire soon; do NOT start Google redirect
  try {
    if (auth.isSignInWithEmailLink(window.location.href)) {
      console.log("[start-google] waiting for auth state after email-link…");
      let resolved = false;
      const unsubscribe = auth.onAuthStateChanged(async (user) => {
        if (resolved) return;
        if (user) {
          resolved = true;
          unsubscribe && unsubscribe();
          console.log(
            "[start-google] user detected from email-link → finishing"
          );
          await finish(user);
        }
      });
      // Soft timeout in case something goes wrong; return back gently
      setTimeout(() => {
        if (resolved) return;
        unsubscribe && unsubscribe();
        console.warn(
          "[start-google] timeout after email-link; returning with soft error"
        );
        const u = new URL(ROLE_REDIRECT, location.origin);
        u.searchParams.set("authStatus", "cancelled");
        location.replace(u.href);
      }, 15000);
      return;
    }
  } catch {}

  // Otherwise, proceed with Google redirect flow
  const started = (() => {
    try {
      return sessionStorage.getItem(LOOP_FLAG) === "1";
    } catch {
      return false;
    }
  })();

  if (!started) {
    // First visit: kick off Google redirect
    try {
      sessionStorage.setItem(LOOP_FLAG, "1");
    } catch {}
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope("profile");
    provider.addScope("email");
    provider.setCustomParameters({ prompt: "select_account" });

    console.log("[start-google] starting signInWithRedirect");
    auth.signInWithRedirect(provider).catch((err) => {
      console.error("[start-google] redirect begin error:", err);
      const u = new URL(ROLE_REDIRECT, location.origin);
      u.searchParams.set(
        "authError",
        err.code || "auth/redirect-begin-failed"
      );
      location.replace(u.href);
    });
    return;
  }

  // Returned from Google: rely on onAuthStateChanged instead of getRedirectResult()
  console.log("[start-google] waiting for auth state after redirect…");
  let resolved = false;

  const unsubscribe = auth.onAuthStateChanged(async (user) => {
    if (resolved) return;
    if (user) {
      resolved = true;
      unsubscribe && unsubscribe();
      console.log("[start-google] user detected → finishing");
      await finish(user);
    }
  });

  // Safety timeout: if no user appears, send the user back with a soft error
  setTimeout(() => {
    if (resolved) return;
    unsubscribe && unsubscribe();
    console.warn(
      "[start-google] no user after redirect; returning with soft error"
    );
    try {
      sessionStorage.removeItem(LOOP_FLAG);
    } catch {}
    const u = new URL(ROLE_REDIRECT, location.origin);
    u.searchParams.set("authStatus", "cancelled");
    location.replace(u.href);
  }, 15000);
})();