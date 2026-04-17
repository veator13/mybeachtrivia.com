/* shift-bell-refresh.js
   Bell notification count for dashboard pages (host/index, admin/index) that
   don't load bt-nav.js. Uses userBellState/{uid}.lastSeenAt in Firestore so
   the red badge only shows for offers/notifications newer than when the user
   last opened the bell.
   Exposes window.BtNavBell = { refresh } — same API as bt-nav.js pages.
   Uses real-time onSnapshot listeners so the badge updates automatically when
   new coverage requests are created by other hosts.
*/
(function () {
  "use strict";

  const BELL_STATE   = "userBellState";
  const HOST_COL     = "shiftCoverageRequests";
  const ADMIN_COL    = "shiftSwapNotifications";
  const CALENDAR_URL = window.location.pathname.indexOf("/admin/") !== -1
    ? "/beachTriviaPages/dashboards/admin/calendar/"
    : "/beachTriviaPages/dashboards/host/employee-calendar/";
  const IS_ADMIN = window.location.pathname.indexOf("/admin/") !== -1;

  // Real-time listener state
  let _unsubOffers = null;
  let _unsubState  = null;
  let _lastSeenMs  = 0;
  let _offersData  = [];
  let _currentUid  = null;

  function wireNav() {
    const bell = document.getElementById("bt-nav-bell");
    if (bell && !bell.dataset.bellNavWired) {
      bell.dataset.bellNavWired = "1";
      bell.addEventListener("click", () => {
        markBellSeen();
        const countEl = document.getElementById("bt-nav-bell-count");
        if (countEl) countEl.hidden = true;
        window.location.href = CALENDAR_URL;
      });
    }
  }

  function markBellSeen() {
    if (!window.firebase || !window.firebase.auth || !window.firebase.firestore) return;
    const user = window.firebase.auth().currentUser;
    if (!user) return;
    window.firebase.firestore()
      .collection(BELL_STATE)
      .doc(user.uid)
      .set({ lastSeenAt: window.firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
      .catch((err) => console.error("[ShiftBell] markBellSeen failed:", err));
  }

  function updateBadge() {
    let count = 0;
    _offersData.forEach((data) => {
      const createdMs = data.createdAt ? data.createdAt.toMillis() : 0;
      if (createdMs > _lastSeenMs) {
        if (IS_ADMIN || data.requestingHostId !== _currentUid) count++;
      }
    });
    const countEl = document.getElementById("bt-nav-bell-count");
    if (countEl) {
      if (count > 0) { countEl.textContent = count; countEl.hidden = false; }
      else { countEl.hidden = true; }
    }
  }

  function stopListeners() {
    if (_unsubOffers) { _unsubOffers(); _unsubOffers = null; }
    if (_unsubState)  { _unsubState();  _unsubState  = null; }
    _offersData  = [];
    _lastSeenMs  = 0;
    _currentUid  = null;
  }

  function startListeners(uid) {
    const db = window.firebase.firestore();
    _currentUid = uid;
    const sevenDaysAgo = window.firebase.firestore.Timestamp.fromDate(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );

    // Listen for lastSeenAt changes (e.g. bell opened on another tab)
    _unsubState = db.collection(BELL_STATE).doc(uid).onSnapshot((snap) => {
      _lastSeenMs = (snap.exists && snap.data().lastSeenAt)
        ? snap.data().lastSeenAt.toMillis()
        : 0;
      updateBadge();
    }, (err) => console.error("[ShiftBell] state listener failed:", err));

    // Listen for new/changed coverage requests in real time
    const query = IS_ADMIN
      ? db.collection(ADMIN_COL)
          .where("status", "==", "pending_review")
          .where("createdAt", ">", sevenDaysAgo)
      : db.collection(HOST_COL)
          .where("status", "==", "open")
          .where("createdAt", ">", sevenDaysAgo);

    _unsubOffers = query.onSnapshot((snap) => {
      _offersData = snap.docs.map((d) => d.data());
      updateBadge();
    }, (err) => console.error("[ShiftBell] offers listener failed:", err));
  }

  // Manual refresh kept for window.BtNavBell.refresh() callers
  function refreshCount() {
    if (!window.firebase || !window.firebase.auth) return;
    const user = window.firebase.auth().currentUser;
    if (!user) return;
    // Listeners are already live; just re-render the badge from cached data
    updateBadge();
  }

  function init() {
    if (!window.firebase || !window.firebase.auth) {
      console.warn("[ShiftBell] Firebase not available");
      return;
    }
    wireNav();
    window.firebase.auth().onAuthStateChanged((user) => {
      stopListeners();
      if (user) {
        startListeners(user.uid);
      } else {
        const countEl = document.getElementById("bt-nav-bell-count");
        if (countEl) countEl.hidden = true;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.BtNavBell = { refresh: refreshCount };
})();
