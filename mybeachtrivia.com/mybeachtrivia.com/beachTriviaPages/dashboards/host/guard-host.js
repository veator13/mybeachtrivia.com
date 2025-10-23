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
  
      const display =
        emp?.displayName ||
        [emp?.firstName, emp?.lastName].filter(Boolean).join(' ') ||
        user?.email || 'Employee';
      if (els.nameEl) els.nameEl.textContent = display;
  
      els.outBtn?.addEventListener('click', async () => {
        try { await auth.signOut(); } catch {}
        location.replace('/login.html?tab=employee');
      });
  
      els.backBtn?.addEventListener('click', () => {
        location.assign('/login.html?tab=employee');
      });
    }
  
    function redirectToLogin() {
      const next = encodeURIComponent(location.pathname + location.search + location.hash);
      location.replace(`/login.html?tab=employee&next=${next}`);
    }
  
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        redirectToLogin();
        return;
      }
  
      try {
        // ✅ UID read matches your Firestore rules
        const snap = await db.doc(`employees/${user.uid}`).get();
        if (!snap.exists) {
          showError('No employee profile found.');
          try { await auth.signOut(); } catch {}
          return;
        }
  
        const emp    = snap.data() || {};
        const roles  = Array.isArray(emp.roles) ? emp.roles : [];
        const active = emp.active === true;
  
        if (!active) {
          showError('Your account is not active yet.');
          try { await auth.signOut(); } catch {}
          return;
        }
  
        // Allow hosts and admins to view host dashboard
        if (!(roles.includes('host') || roles.includes('admin'))) {
          showError('You do not have permission to access the host dashboard.');
          try { await auth.signOut(); } catch {}
          return;
        }
  
        console.log('[guard-host] access granted');
        showDash(emp, user);
      } catch (e) {
        console.error('[guard-host]', e);
        showError('Error verifying permissions. Please try again.');
        try { await auth.signOut(); } catch {}
      }
    });
  })();