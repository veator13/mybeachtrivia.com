(function () {
  try {
    var p = new URLSearchParams(location.search);
    var target =
      p.get('return') || p.get('next') || p.get('redirect') ||
      sessionStorage.getItem('afterLogin') ||
      '/beachTriviaPages/dashboards/host/';
    sessionStorage.setItem('afterLogin', target);

    if (window.firebase && firebase.auth) {
      firebase.auth().onAuthStateChanged(function (user) {
        if (!user) return;
        var t = sessionStorage.getItem('afterLogin') || target;
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
