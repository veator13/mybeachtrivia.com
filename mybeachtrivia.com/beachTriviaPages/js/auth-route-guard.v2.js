/* auth-route-guard v2.1 — scoped for public/onboarding pages only.
   Prevents redirect loops by *ignoring* dashboard pages and only acting on:
   - /login.html
   - /beachTriviaPages/onboarding/account-setup/
   Safe to include site-wide. */
(function () {
  // Allow disabling via query (?noguard=1)
  try { if (new URLSearchParams(location.search).get('noguard') === '1') return; } catch {}
  if (window.__btRouteGuardLoaded) return; window.__btRouteGuardLoaded = true;

  var PATHS = {
    admin: '/beachTriviaPages/dashboards/admin/',
    host:  '/beachTriviaPages/dashboards/host/',
    setup: '/beachTriviaPages/onboarding/account-setup/',
    login: '/login.html'
  };

  function normPath(p) {
    try {
      if (!p) return '/';
      // keep trailing slash only for root ('/') and known dashboard roots
      var keepSlash =
        p === '/' ||
        p.endsWith('/admin/') ||
        p.endsWith('/host/') ||
        p.endsWith('/account-setup/');
      if (!keepSlash && p.endsWith('/')) p = p.slice(0, -1);
      return p;
    } catch (_) { return p || '/'; }
  }
  function samePath(a, b) { return normPath(a) === normPath(b); }

  function defaultDest(roles) {
    roles = Array.isArray(roles) ? roles : [];
    if (roles.indexOf('admin') >= 0) return PATHS.admin;
    if (roles.indexOf('host')  >= 0) return PATHS.host;
    return '/';
  }

  function redirectOnce(dest) {
    try {
      if (samePath(dest, location.pathname)) return; // already here
      var last = +sessionStorage.getItem('bt:lastRedirectTs') || 0;
      if (Date.now() - last < 1500) return; // bounce protection
      sessionStorage.setItem('bt:lastRedirectTs', String(Date.now()));
      location.replace(dest);
    } catch (_) {
      try { location.href = dest; } catch {}
    }
  }

  function onReady() {
    var auth = firebase.auth();
    var db   = firebase.firestore();

    auth.onAuthStateChanged(async function(user) {
      var path = normPath(location.pathname);

      // 🔒 Never interfere with dashboard pages; they have their own guards.
      if (path.indexOf('/beachTriviaPages/dashboards/') === 0) return;

      var onLogin = path === normPath(PATHS.login);
      var onSetup = path.indexOf(PATHS.setup) === 0;

      if (!user) {
        // If someone hits setup directly while signed out → send to login with next
        if (onSetup) {
          var next = encodeURIComponent(location.pathname + location.search + location.hash);
          return redirectOnce(PATHS.login + '?next=' + next);
        }
        return; // public pages: do nothing
      }

      // Signed in → fetch employee doc
      try {
        var snap = await db.doc('employees/' + user.uid).get();
        var emp  = snap.exists ? (snap.data()||{}) : {};
        var active = emp.active === true;
        var roles  = Array.isArray(emp.roles) ? emp.roles : (typeof emp.role === 'string' ? [emp.role] : []);
        var setupCompleted = !!emp.setupCompleted;

        if (!active) {
          try { await auth.signOut(); } catch(_){}
          var next = encodeURIComponent(location.pathname + location.search + location.hash);
          return redirectOnce(PATHS.login + '?next=' + next + '&reason=inactive');
        }

        if (onLogin) {
          if (!setupCompleted) return redirectOnce(PATHS.setup);
          return redirectOnce(defaultDest(roles));
        }

        if (onSetup) {
          if (setupCompleted) return redirectOnce(defaultDest(roles));
          return; // allow staying on setup
        }

        // Else: public page while signed-in → leave them alone
      } catch (e) {
        console.warn('[route-guard] error reading employee doc', e);
      }
    });
  }

  (function waitForFirebase(attempt){
    attempt = attempt||0;
    if (window.firebase && firebase.apps && firebase.apps.length) return onReady();
    if (attempt > 200) return window.addEventListener('load', function(){ onReady(); }, {once:true});
    setTimeout(function(){ waitForFirebase(attempt+1); }, 50);
  })();
})();
