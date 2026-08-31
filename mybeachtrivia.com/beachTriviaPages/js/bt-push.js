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
      // `subscribed` = this device currently has a live token saved for this
      // user. Browser permission can't be revoked from JS, so "off" means we
      // deleted the token — the permission stays "granted".
      subscribed: _subscribed === true,
    };
  }

  var _lastToken = null;
  // null = unknown (not checked yet), true/false once known.
  var _subscribed = null;
  try {
    _subscribed = localStorage.getItem("bt:pushOn") === "1" ? true
      : localStorage.getItem("bt:pushOn") === "0" ? false : null;
  } catch (_) {}

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

  function setSubscribed(on) {
    _subscribed = !!on;
    try { localStorage.setItem("bt:pushOn", on ? "1" : "0"); } catch (_) {}
    _paintAll();
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
      setSubscribed(true);
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

  // Turn off = delete this device's token from FCM and from the user's
  // fcmTokens array so the server stops pushing here. Browser permission is
  // left as-is (JS can't revoke it; re-enabling won't re-prompt).
  async function disable() {
    var user = firebase.auth().currentUser;
    try {
      var token = _lastToken;
      if (!token) {
        try { token = localStorage.getItem("bt:pushToken") || null; } catch (_) {}
      }
      if (!token && supported() && Notification.permission === "granted") {
        try {
          var reg = await ensureSW();
          token = await messaging().getToken({ vapidKey: vapidKey(), serviceWorkerRegistration: reg });
        } catch (_) {}
      }
      if (user && token) {
        try {
          await firebase.firestore().collection("employees").doc(user.uid).set(
            { fcmTokens: firebase.firestore.FieldValue.arrayRemove(token) },
            { merge: true }
          );
        } catch (err) { console.warn("[bt-push] could not remove token:", err); }
      }
      try { await messaging().deleteToken(); } catch (_) {}
      _lastToken = null;
      try { localStorage.removeItem("bt:pushToken"); } catch (_) {}
      setSubscribed(false);
      return { ok: true };
    } catch (err) {
      console.warn("[bt-push] disable failed:", err);
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  }

  // On load, if permission is already granted, work out whether THIS device is
  // actually subscribed (token present in employees/{uid}.fcmTokens) and keep
  // the stored token fresh. Does not prompt.
  async function refreshIfGranted() {
    if (!supported() || Notification.permission !== "granted") {
      // Permission was never granted or was revoked in browser settings —
      // any stored "on" hint is stale.
      if (_subscribed) setSubscribed(false);
      return;
    }
    var user = firebase.auth().currentUser;
    try {
      var reg = await ensureSW();
      var token = await messaging().getToken({ vapidKey: vapidKey(), serviceWorkerRegistration: reg });
      if (!token) { setSubscribed(false); return; }
      _lastToken = token;
      var saved = [];
      if (user) {
        try {
          var snap = await firebase.firestore().collection("employees").doc(user.uid).get();
          var arr = snap.exists ? (snap.data() || {}).fcmTokens : null;
          if (Array.isArray(arr)) saved = arr;
        } catch (_) {}
      }
      if (saved.indexOf(token) !== -1) {
        try { localStorage.setItem("bt:pushToken", token); } catch (_) {}
        setSubscribed(true);
        wireForeground();
      } else {
        // Permission granted but this device isn't in the list → they turned it
        // off here (or it's a fresh device). Leave it off; don't re-add silently.
        setSubscribed(false);
      }
    } catch (_) {}
  }

  /* ── button rendering ──────────────────────────────────────────────────── */

  var _btns = [];

  function paintBtn(btn) {
    var st = state();
    btn.classList.remove("bt-push--on");
    if (!st.supported) { btn.hidden = true; return; }
    if (st.permission === "denied") {
      btn.hidden = false;
      btn.disabled = true;
      btn.textContent = "🔕 Notifications blocked — allow them in browser settings";
      btn.title = "Notifications are blocked for mybeachtrivia.com. Turn them back on in your browser's site settings.";
      return;
    }
    btn.hidden = false;
    btn.disabled = false;
    if (st.subscribed === true && st.permission === "granted") {
      btn.classList.add("bt-push--on");
      btn.textContent = "✅ Notifications on — tap to turn off";
      btn.title = "You'll get a push when a shift or time-off update needs you. Tap to turn off on this device.";
    } else {
      btn.textContent = "🔔 Turn on notifications";
      btn.title = "Get a push on this device when a shift or time-off update needs you.";
    }
  }

  function _paintAll() {
    for (var i = 0; i < _btns.length; i++) {
      try { paintBtn(_btns[i]); } catch (_) {}
    }
  }

  function attach(btn) {
    if (!btn || _btns.indexOf(btn) !== -1) return;
    _btns.push(btn);

    btn.addEventListener("click", async function () {
      var wasOn = state().subscribed === true;
      btn.disabled = true;
      btn.textContent = wasOn ? "Turning off…" : "…";
      var res = wasOn ? await disable() : await enable();
      if (!res.ok && !wasOn && res.reason === "unsupported") { btn.hidden = true; return; }
      // paintBtn (via setSubscribed / _paintAll) has the final say, but repaint
      // here too in case enable() failed without changing subscribed state.
      paintBtn(btn);
    });

    paintBtn(btn);

    // Once auth is known, verify real subscription state (needs the uid).
    try {
      firebase.auth().onAuthStateChanged(function (u) {
        if (u) { refreshIfGranted(); }
        else { _lastToken = null; }
        _paintAll();
      });
    } catch (_) {}
  }

  window.BtPush = { attach: attach, enable: enable, disable: disable, state: state };

  // Minimal "on" styling — the button keeps its page's base class (.small-btn /
  // .bt-to-submit), this just tints it green + adds a check affordance.
  function injectStyle() {
    if (document.getElementById("bt-push-style")) return;
    var s = document.createElement("style");
    s.id = "bt-push-style";
    s.textContent =
      "#bt-enable-push.bt-push--on{" +
      "background:#e7f6ec!important;border-color:#37a862!important;color:#1c6b3c!important;}" +
      "#bt-enable-push.bt-push--on:hover{background:#d8f0e0!important;}";
    document.head.appendChild(s);
  }

  // Auto-wire any button with id="bt-enable-push" once the page + firebase are up.
  function autoAttach() {
    var btn = document.getElementById("bt-enable-push");
    if (!btn) return;
    injectStyle();
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
