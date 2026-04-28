// beachTriviaPages/dashboards/host/guard-host.js
// UID-based authz: requires employees/{uid}.active === true AND role host|admin
(function () {
  if (typeof firebase === "undefined") {
    console.error("[guard-host] Firebase not found. Did /firebase-init.js load?");
    return;
  }

  const auth = firebase.auth();
  const db   = firebase.firestore();

  const els = {
    overlay:  document.getElementById('auth-loading'),
    dash:     document.querySelector('.dashboard-container'),
    errBox:   document.getElementById('error-container'),
    errText:  document.getElementById('error-text'),
    backBtn:  document.getElementById('back-to-login'),
    nameEl:   document.getElementById('user-display-name'),
    outBtn:   document.getElementById('logout-btn'),
  };

  function showError(msg) {
    if (els.overlay) els.overlay.style.display = 'none';
    if (els.errText) els.errText.textContent = msg || 'Access denied.';
    if (els.errBox)  els.errBox.style.display = 'flex';
  }

  function showDash(emp, user) {
    if (els.overlay) els.overlay.style.display = 'none';
    if (els.errBox)  els.errBox.style.display = 'none';
    if (els.dash)    els.dash.style.display = 'block';

    var firstName = emp && emp.firstName ? emp.firstName : '';
    var lastName  = emp && emp.lastName  ? emp.lastName  : '';
    var display   = (firstName + ' ' + lastName).trim() || (user && user.email) || 'Employee';
    if (els.nameEl) els.nameEl.textContent = display;

    if (els.outBtn) {
      els.outBtn.addEventListener('click', function () {
        auth.signOut().catch(function () {}).then(function () {
          location.replace('/login.html?tab=employee');
        });
      });
    }

    if (els.backBtn) {
      els.backBtn.addEventListener('click', function () {
        location.assign('/login.html?tab=employee');
      });
    }
  }

  function redirectToLogin() {
    var next = encodeURIComponent(location.pathname + location.search + location.hash);
    location.replace('/login.html?tab=employee&next=' + next);
  }

  var redirectPending = false;

  auth.onAuthStateChanged(function (user) {
    if (!user) {
      if (redirectPending) return;
      redirectPending = true;
      setTimeout(function () {
        if (!auth.currentUser) {
          redirectToLogin();
        } else {
          redirectPending = false;
        }
      }, 2000);
      return;
    }
    redirectPending = false;

    db.doc('employees/' + user.uid).get().then(function (snap) {
      if (!snap.exists) {
        showError('No employee profile found.');
        auth.signOut().catch(function () {});
        return;
      }

      var emp    = snap.data() || {};
      var rolesArr = Array.isArray(emp.roles) ? emp.roles : (emp.role ? [emp.role] : []);
      var active = emp.active === true;

      if (!active) {
        showError('Your account is not active yet.');
        auth.signOut().catch(function () {});
        return;
      }

      if (!(rolesArr.indexOf('host') >= 0 || rolesArr.indexOf('admin') >= 0)) {
        showError('You do not have permission to access the host dashboard.');
        auth.signOut().catch(function () {});
        return;
      }

      console.log('[guard-host] access granted');
      showDash(emp, user);

      if (window.initDashboardData) {
        window.initDashboardData(user);
      }
    }).catch(function (e) {
      console.error('[guard-host]', e);
      showError('Error verifying permissions. Please try again.');
      auth.signOut().catch(function () {});
    });
  });
})();
