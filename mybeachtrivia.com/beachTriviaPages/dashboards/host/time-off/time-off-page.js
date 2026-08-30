/* mybeachtrivia.com/beachTriviaPages/dashboards/host/time-off/time-off-page.js */
(function () {
  "use strict";

  var _started = false;
  var _unsub = null;

  function start() {
    if (_started) return;
    if (!window.BtTimeOff) { setTimeout(start, 100); return; }
    _started = true;

    BtTimeOff.wireForm({
      start: document.getElementById("to-start"),
      end: document.getElementById("to-end"),
      note: document.getElementById("to-note"),
      warning: document.getElementById("to-warning"),
      status: document.getElementById("to-status"),
      submitBtn: document.getElementById("to-submit"),
    });

    var list = document.getElementById("to-list");
    if (_unsub) { try { _unsub(); } catch (_) {} }
    _unsub = BtTimeOff.subscribeMine(function (requests) {
      BtTimeOff.renderList(list, requests, {
        emptyText: "You haven't requested any time off yet.",
      });
    });
  }

  // guard-host.js calls this once access is granted.
  window.initDashboardData = start;

  // Fallback: if the guard hook is missed for any reason, start on auth.
  document.addEventListener("DOMContentLoaded", function () {
    if (window.firebase && firebase.auth) {
      firebase.auth().onAuthStateChanged(function (u) { if (u) start(); });
    }
  });
})();
