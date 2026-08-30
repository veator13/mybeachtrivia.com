/* mybeachtrivia.com/beachTriviaPages/js/bt-push.js
 *
 * Phase 8 — client side of FCM web push.
 *
 *   window.BtPush.attach(buttonEl)  — wire an "Enable notifications" button:
 *       shows it only when push is supported + not yet granted, runs the
 *       permission → token → save flow on click, hides it once done.
 *   window.BtPush.enable()          — the flow itself (needs a user gesture).
 *   window.BtPush.state()           — { supported, permission, hasToken }.
 *
 * Needs, on the page:
 *   firebase-app-compat, firebase-auth-compat, firebase-firestore-compat,
 *   firebase-messaging-compat, firebase-init(.js), and bt-push-config.js
 *   (sets window.BT_VAPID_KEY).
 *
 * The service worker is /firebase-messaging-sw.js (site root).
 */
(function () {
  "use strict";

  var SW_URL = "/firebase-messaging-sw.js";
  // Dedicated narrow scope so this never collides with the scoresheet offline
  // service worker (/sw.js), which owns scope "/". FCM's getToken() takes the
  // registration explicitly, so it doesn't need root scope.
  var SW_SCOPE = "/firebase-cloud-messaging-push-scope";
  var _swReg = null;
  var _msg = null;
  var _wiredForeground = false;

  function vapidKey() {
    return (window.BT_VAPID_KEY || "").trim();
  }

  function supported() {
    return (
      typeof firebase !== "undefined" &&
      firebase.messaging &&
      firebase.messaging.isSupported &&
      firebase.messaging.isSupported() &&
      "serviceWorker" in navigator &&
      "Notification" in window &&
      !!vapidKey()
    );
  }

  function state() {
    return {
      supported: supported(),
      permission: (window.Notification && Notification.permission) || "unsupported",
      hasToken: !!_lastToken,
    };
  }

  var _lastToken = null;

  async function ensureSW() {
    if (_swReg) return _swReg;
    _swReg =
      (await navigator.serviceWorker.getRegistration(SW_SCOPE)) ||
      (await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE }));
    // make sure it's installing/active before getToken uses it
    if (!_swReg.active) {
      await new Promise(function (res) {
        var w = _swReg.installing || _swReg.waiting;
        if (!w) return res();
        w.addEventListener("statechange", function () {
          if (w.state === "activated") res();
        });
        setTimeout(res, 4000);
      });
    }
    return _swReg;
  }

  function messaging() {
    if (!_msg) _msg = firebase.messaging();
    return _msg;
  }

  function wireForeground() {
    if (_wiredForeground) return;
    _wiredForeground = true;
    try {
      messaging().onMessage(function (payload) {
        // Page is open — let the in-app bell handle the badge; just refresh it.
        try { window.BtNavBell && window.BtNavBell.refresh && window.BtNavBell.refresh(); } catch (_) {}
        var n = (payload && payload.notification) || {};
        if (n.title && window.Notification && Notification.permission === "granted" && _swReg) {
          _swReg.showNotification(n.title, {
            body: n.body || "",
            icon: "/beachTriviaPages/images/BTlogo.png",
            data: { link: (payload.data && payload.data.link) || "/" },
          });
        }
      });
    } catch (_) {}
  }

  async function saveToken(token) {
    var user = firebase.auth().currentUser;
    if (!user || !token) return;
    _lastToken = token;
    try {
      await firebase.firestore().collection("employees").doc(user.uid).set(
        { fcmTokens: firebase.firestore.FieldValue.arrayUnion(token) },
        { merge: true }
      );
      try { localStorage.setItem("bt:pushToken", token); } catch (_) {}
    } catch (err) {
      console.warn("[bt-push] could not save token:", err);
    }
  }

  async function enable() {
    if (!supported()) {
      return { ok: false, reason: "unsupported" };
    }
    var perm = Notification.permission;
    if (perm === "default") perm = await Notification.requestPermission();
    if (perm !== "granted") {
      return { ok: false, reason: perm === "denied" ? "denied" : "dismissed" };
    }
    try {
      var reg = await ensureSW();
      var token = await messaging().getToken({
        vapidKey: vapidKey(),
        serviceWorkerRegistration: reg,
      });
      if (!token) return { ok: false, reason: "no-token" };
      await saveToken(token);
      wireForeground();
      return { ok: true, token: token };
    } catch (err) {
      console.warn("[bt-push] enable failed:", err);
      return { ok: false, reason: "error", error: String(err && err.message ? err.message : err) };
    }
  }

  // Quietly refresh the token on load if permission is already granted (tokens
  // rotate) so employees/{uid}.fcmTokens stays current without another prompt.
  async function refreshIfGranted() {
    if (!supported() || Notification.permission !== "granted") return;
    try {
      var reg = await ensureSW();
      var token = await messaging().getToken({ vapidKey: vapidKey(), serviceWorkerRegistration: reg });
      if (token) { await saveToken(token); wireForeground(); }
    } catch (_) {}
  }

  function attach(btn) {
    if (!btn) return;
    function paint() {
      var st = state();
      if (!st.supported) { btn.hidden = true; return; }
      if (st.permission === "granted") { btn.hidden = true; return; }
      if (st.permission === "denied") {
        btn.hidden = false;
        btn.disabled = true;
        btn.textContent = "🔕 Notifications blocked in browser settings";
        btn.title = "Enable notifications for mybeachtrivia.com in your browser's site settings.";
        return;
      }
      btn.hidden = false;
      btn.disabled = false;
      btn.textContent = "🔔 Turn on notifications";
    }
    btn.addEventListener("click", async function () {
      btn.disabled = true;
      btn.textContent = "…";
      var res = await enable();
      if (res.ok) {
        btn.textContent = "✅ Notifications on";
        setTimeout(function () { btn.hidden = true; }, 2500);
      } else {
        paint();
        if (res.reason === "denied") {
          // paint() already set the blocked message
        } else if (res.reason === "unsupported") {
          btn.hidden = true;
        }
      }
    });
    paint();

    // Wait for auth before a silent refresh (need the uid to save the token).
    try {
      firebase.auth().onAuthStateChanged(function (u) { if (u) refreshIfGranted(); });
    } catch (_) {}
  }

  window.BtPush = { attach: attach, enable: enable, state: state };

  // Auto-wire any button with id="bt-enable-push" once the page + firebase are up.
  function autoAttach() {
    var btn = document.getElementById("bt-enable-push");
    if (!btn) return;
    var tries = 0;
    var t = setInterval(function () {
      if (typeof firebase !== "undefined" && firebase.messaging && firebase.apps && firebase.apps.length) {
        clearInterval(t);
        attach(btn);
      } else if (++tries > 40) {
        clearInterval(t);
        btn.hidden = true;
      }
    }, 250);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoAttach);
  } else {
    autoAttach();
  }
})();
