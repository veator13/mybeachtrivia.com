// /start-google.js  (compat SDKs)
// Loads on /start-google.html. Handles:
//  - Google sign-in via signInWithRedirect
//  - Email-link sign-in completion
//  - Creating employees/{uid} from employeeInvites
//  - Redirecting back to the correct dashboard
(function () {
  if (typeof firebase === "undefined" || !firebase.auth) {
    console.error("[start-google] Firebase compat SDKs not found on window");
    return;
  }

  const auth   = firebase.auth();
  const db     = firebase.firestore();
  const origin = window.location.origin;
  const params = new URLSearchParams(window.location.search);

  // ---- Role & destination handling ----------------------------------------
  const DEST_BY_ROLE = {
    host:     "/beachTriviaPages/dashboards/host/",
    social:   "/beachTriviaPages/dashboards/social-media-manager/",
    writer:   "/beachTriviaPages/dashboards/writer/",
    supply:   "/beachTriviaPages/dashboards/supply-manager/",
    regional: "/beachTriviaPages/dashboards/regional-manager/",
    admin:    "/beachTriviaPages/dashboards/admin/",
  };

  const role = (params.get("role") || "").toLowerCase();

  // Base "return" URL from query (?return=/some/path)
  const RETURN_URL = (() => {
    const raw = params.get("return");
    const fallback = DEST_BY_ROLE[role] || "/login.html";
    if (!raw) return new URL(fallback, origin).href;
    try {
      return new URL(raw, origin).href;
    } catch {
      return new URL(fallback, origin).href;
    }
  })();

  // Final dashboard we want to end up on for this role
  const ROLE_REDIRECT = (() => {
    if (role && DEST_BY_ROLE[role]) {
      return new URL(DEST_BY_ROLE[role], origin).href;
    }
    return RETURN_URL;
  })();

  // Origin used for postMessage back to an opener (if any)
  const RETURN_ORIGIN = (() => {
    try {
      return new URL(ROLE_REDIRECT).origin;
    } catch {
      return origin;
    }
  })();

  // Persist selected role so other code can read it if needed
  try {
    window.localStorage.setItem("postLoginRole", role || "host");
    window.sessionStorage.setItem("postLoginRole", role || "host");
  } catch {}

  // ---- Loop guards for redirect flow --------------------------------------
  const LOOP_FLAG = "bt_google_redirect_started_v3";
  const DONE_FLAG = "bt_google_redirect_done_v3";

  // ---- 1) Email-link sign-in completion -----------------------------------
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

        // Clean ugly oobCode params but preserve ?return=
        try {
          const qs = new URLSearchParams(window.location.search);
          const ret = qs.get("return");
          const clean =
            window.location.pathname +
            (ret ? `?return=${encodeURIComponent(ret)}` : "");
          window.history.replaceState({}, document.title, clean);
        } catch {}

        console.log("[start-google] email-link sign-in completed");
      }
    } catch (e) {
      console.error("[start-google] email-link sign-in failed:", e);
      // Non-fatal; we can still attempt Google later.
    }
  })();

  // ---- 2) Ensure employees/{uid} from employeeInvites ---------------------
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
        inviteId: inviteDoc.id, // satisfies your Firestore rule
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection("employeeInvites").doc(inviteDoc.id).delete();
      console.log("[start-google] employee profile created and invite consumed");
    } catch (err) {
      console.error("[start-google] ensureEmployeeProfile error:", err);
    }
  }

  // ---- 3) Helper: post result to opener, if this was a popup --------------
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

  // ---- 4) Finish flow for a signed-in user --------------------------------
  async function finish(user) {
    try {
      window.sessionStorage.removeItem(LOOP_FLAG);
    } catch {}
    try {
      window.sessionStorage.setItem(DONE_FLAG, "1");
    } catch {}

    await ensureEmployeeProfile(user);

    const payload = {
      type: "bt-google-auth",
      googleIdToken: null,
      accessToken: null,
    };

    if (postToOpener(payload)) return;

    const u = new URL(ROLE_REDIRECT);
    u.hash = "authStatus=ok";
    window.location.replace(u.toString());
  }

  // If we've already finished once, just bounce back
  try {
    if (window.sessionStorage.getItem(DONE_FLAG) === "1") {
      console.log("[start-google] already finished once; returning");
      window.location.replace(ROLE_REDIRECT);
      return;
    }
  } catch {}

  // ---- 5) Provision-only mode (?provision=1) ------------------------------
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

    console.log(
      "[start-google] waiting for auth state (provision-only) …"
    );

    let resolved = false;
    const unsubProvision = auth.onAuthStateChanged((u) => {
      if (!u || resolved) return;
      resolved = true;
      unsubProvision && unsubProvision();
      console.log(
        "[start-google] user detected → finishing (provision-only)"
      );
      finish(u);
    });

    setTimeout(() => {
      if (resolved) return;
      console.log(
        "[start-google] no session → starting Google (provision fallback)"
      );
      try {
        window.sessionStorage.setItem(LOOP_FLAG, "1");
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
        const u = new URL(ROLE_REDIRECT);
        u.searchParams.set(
          "authError",
          err.code || "auth/redirect-begin-failed"
        );
        window.location.replace(u.toString());
      });
    }, 1500);

    return;
  }

  // ---- 6) Already signed-in from earlier? ---------------------------------
  if (auth.currentUser) {
    console.log("[start-google] user already signed in → finishing");
    finish(auth.currentUser);
    return;
  }

  // If this URL *is* an email-link sign-in, we already handled that above.
  try {
    if (auth.isSignInWithEmailLink(window.location.href)) {
      console.log(
        "[start-google] waiting for auth state after email-link…"
      );
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

      setTimeout(() => {
        if (resolved) return;
        unsubscribe && unsubscribe();
        console.warn(
          "[start-google] timeout after email-link; returning with soft error"
        );
        const u = new URL(ROLE_REDIRECT);
        u.searchParams.set("authStatus", "cancelled");
        window.location.replace(u.toString());
      }, 15000);

      return;
    }
  } catch {}

  // ---- 7) Main Google redirect flow ---------------------------------------
  const started = (() => {
    try {
      return window.sessionStorage.getItem(LOOP_FLAG) === "1";
    } catch {
      return false;
    }
  })();

  if (!started) {
    // First visit: start redirect
    try {
      window.sessionStorage.setItem(LOOP_FLAG, "1");
    } catch {}

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope("profile");
    provider.addScope("email");
    provider.setCustomParameters({ prompt: "select_account" });

    console.log("[start-google] starting signInWithRedirect");
    auth.signInWithRedirect(provider).catch((err) => {
      console.error("[start-google] redirect begin error:", err);
      const u = new URL(ROLE_REDIRECT);
      u.searchParams.set(
        "authError",
        err.code || "auth/redirect-begin-failed"
      );
      window.location.replace(u.toString());
    });
    return;
  }

  // Second pass: returned from Google. Use BOTH getRedirectResult
  // and onAuthStateChanged so we don't miss anything.
  console.log("[start-google] waiting for auth state after redirect…");

  let resolved = false;

  auth
    .getRedirectResult()
    .then((result) => {
      if (resolved) return;
      if (result && result.user) {
        resolved = true;
        console.log(
          "[start-google] getRedirectResult provided user → finishing"
        );
        finish(result.user);
      }
    })
    .catch((err) => {
      if (resolved) return;
      console.error("[start-google] getRedirectResult error:", err);
      const u = new URL(ROLE_REDIRECT);
      u.searchParams.set(
        "authError",
        err.code || "auth/redirect-result-failed"
      );
      window.location.replace(u.toString());
    });

  const unsubscribe = auth.onAuthStateChanged(async (user) => {
    if (resolved || !user) return;
    resolved = true;
    unsubscribe && unsubscribe();
    console.log("[start-google] user detected via onAuthStateChanged → finishing");
    await finish(user);
  });

  setTimeout(() => {
    if (resolved) return;
    unsubscribe && unsubscribe();
    console.warn(
      "[start-google] no user after redirect; returning with soft error"
    );
    try {
      window.sessionStorage.removeItem(LOOP_FLAG);
    } catch {}
    const u = new URL(ROLE_REDIRECT);
    u.searchParams.set("authStatus", "cancelled");
    window.location.replace(u.toString());
  }, 15000);
})();