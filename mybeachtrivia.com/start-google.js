// /mybeachtrivia.com/start-google.js
(function () {
    if (typeof firebase === "undefined" || !firebase.auth) {
      console.error("[start-google] Firebase SDK not found on window");
      return;
    }
  
    const auth = firebase.auth();
    const params = new URLSearchParams(location.search);
  
    // Where to return after Google
    const RETURN_URL = (() => {
      const raw = params.get("return");
      if (!raw) return "https://mybeachtrivia.com/login.html";
      try { return new URL(raw, location.origin).href; }
      catch { return "https://mybeachtrivia.com/login.html"; }
    })();
    const RETURN_ORIGIN = new URL(RETURN_URL).origin;
  
    // Guards to prevent redirect loops
    const LOOP_FLAG = "bt_google_redirect_started_v2";
    const DONE_FLAG = "bt_google_redirect_done_v2";
  
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
  
    function finish(user, credential) {
      // Prefer Google OAuth tokens from redirect credential
      let googleIdToken = null;
      let accessToken = null;
  
      if (credential) {
        try {
          googleIdToken = credential.idToken || null;
          accessToken   = credential.accessToken || null;
        } catch (_) {}
      }
  
      // Clear flags
      try { sessionStorage.removeItem(LOOP_FLAG); } catch {}
      try { sessionStorage.setItem(DONE_FLAG, "1"); } catch {}
  
      const payload = {
        type: "bt-google-auth",
        googleIdToken,   // main page will consume these to build a Google credential
        accessToken
      };
  
      // Preferred path: send to opener
      if (postToOpener(payload)) return;
  
      // Fallback: put minimal info in hash and navigate back
      const u = new URL(RETURN_URL);
      if (googleIdToken) {
        u.hash = "google_id_token=" + encodeURIComponent(googleIdToken);
        if (accessToken) u.hash += "&access_token=" + encodeURIComponent(accessToken);
      } else {
        u.hash = "authStatus=cancelled";
      }
      location.replace(u.href);
    }
  
    // If we already finished once, just bounce back
    try {
      if (sessionStorage.getItem(DONE_FLAG) === "1") {
        console.log("[start-google] already finished once; returning");
        location.replace(RETURN_URL);
        return;
      }
    } catch {}
  
    // First visit: start the redirect (guard so we don't loop)
    const started = (() => {
      try { return sessionStorage.getItem(LOOP_FLAG) === "1"; } catch { return false; }
    })();
  
    if (!started) {
      try { sessionStorage.setItem(LOOP_FLAG, "1"); } catch {}
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope("profile");
      provider.addScope("email");
      provider.setCustomParameters({ prompt: "select_account" });
  
      console.log("[start-google] starting signInWithRedirect → accounts.google.com");
      auth.signInWithRedirect(provider).catch((err) => {
        console.error("[start-google] redirect begin error:", err);
        location.replace(RETURN_URL + "?authError=" + encodeURIComponent(err.code || "auth/redirect-begin-failed"));
      });
      return; // navigation to Google happens now
    }
  
    // Coming back from Google: resolve the redirect result
    console.log("[start-google] processing redirect result…");
    auth.getRedirectResult()
      .then((res) => {
        // res.credential is Google OAuthCredential (idToken/accessToken)
        if (res && (res.user || res.credential)) {
          console.log("[start-google] redirect complete → finishing");
          finish(res.user || auth.currentUser || null, res.credential || null);
          return;
        }
  
        // If session restored and user is signed in but no credential, notify opener with nulls
        const u = auth.currentUser || null;
        if (u) {
          console.log("[start-google] user is signed in (no credential) → finishing");
          finish(u, null);
          return;
        }
  
        console.log("[start-google] no user/credential found (cancelled)");
        location.replace(RETURN_URL + "?authStatus=cancelled");
      })
      .catch((err) => {
        console.error("[start-google] redirect result error:", err);
        location.replace(RETURN_URL + "?authError=" + encodeURIComponent(err.code || "auth/redirect-result-failed"));
      });
  })();