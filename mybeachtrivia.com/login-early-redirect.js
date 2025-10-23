(function () {
  try {
    var p = new URLSearchParams(location.search);
    var paramTarget = p.get('return') || p.get('next') || p.get('redirect');

    // Only act if caller provided a target or one already exists.
    if (!paramTarget && !sessionStorage.getItem('afterLogin')) return;

    if (paramTarget) {
      sessionStorage.setItem('afterLogin', paramTarget);
    }

    if (window.firebase && firebase.auth) {
      firebase.auth().onAuthStateChanged(function (user) {
        if (!user) return;
        var t = sessionStorage.getItem('afterLogin');
        if (!t) return;  // nothing to do; let login.js decide (Admin/Employee)
        try {
          var u = new URL(t, location.origin);
          if (u.origin === location.origin) {
            sessionStorage.removeItem('afterLogin');
            location.replace(u.href);
          }
        } catch {}
      });
    }
  } catch {}
})();
