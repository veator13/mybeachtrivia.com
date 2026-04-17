/* admin-dashboard.js – loads live stats for the admin dashboard */
(function () {
  'use strict';

  function waitForFirebase(cb) {
    var attempts = 0;
    function check() {
      if (window.firebase && window.firebase.firestore && window.firebase.auth) {
        cb();
      } else if (attempts++ < 40) {
        setTimeout(check, 150);
      }
    }
    check();
  }

  function setEl(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function revealDashboard() {
    var container = document.querySelector('.dashboard-container');
    var loading   = document.getElementById('auth-loading');
    if (container) container.style.display = '';
    if (loading)   loading.style.display   = 'none';
  }

  function loadStats(db) {
    var now = new Date();
    var weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    var weekEndStr = weekEnd.toISOString().slice(0, 10);
    var todayStr = now.toISOString().slice(0, 10);

    // Open shift coverage requests
    db.collection('shiftCoverageRequests')
      .where('status', '==', 'open')
      .get()
      .then(function (snap) { setEl('stat-offers', snap.size); })
      .catch(function () { setEl('stat-offers', '—'); });

    // Pending swap notifications
    db.collection('shiftSwapNotifications')
      .where('status', '==', 'pending_review')
      .get()
      .then(function (snap) { setEl('stat-swaps', snap.size); })
      .catch(function () { setEl('stat-swaps', '—'); });

    // Active employees with host role
    db.collection('employees')
      .where('active', '==', true)
      .get()
      .then(function (snap) {
        var hostCount = 0;
        snap.forEach(function (doc) {
          var d = doc.data();
          var roles = Array.isArray(d.roles) ? d.roles : (d.role ? [d.role] : []);
          if (roles.some(function (r) { return String(r).toLowerCase() === 'host'; })) {
            hostCount++;
          }
        });
        setEl('stat-hosts', hostCount || snap.size);
      })
      .catch(function () { setEl('stat-hosts', '—'); });

    // Shifts this week
    db.collection('shifts')
      .where('date', '>=', todayStr)
      .where('date', '<=', weekEndStr)
      .get()
      .then(function (snap) { setEl('stat-shows', snap.size); })
      .catch(function () { setEl('stat-shows', '—'); });
  }

  function init() {
    waitForFirebase(function () {
      var auth = firebase.auth();
      var db   = firebase.firestore();

      auth.onAuthStateChanged(function (user) {
        if (!user) return; // guards handle redirect
        revealDashboard();
        loadStats(db);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
