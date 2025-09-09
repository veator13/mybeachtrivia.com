// guard-admin.js — CSP-safe auth/role gate (UID-based) for Admin dashboard
(function () {
    if (typeof firebase === "undefined") {
      console.error("[guard-admin] Firebase not found. Did firebase-init.js load?");
      return;
    }
  
    const auth = firebase.auth();
    const db   = firebase.firestore();
  
    // DOM refs
    const els = {
      loading: document.getElementById('auth-loading'),
      dash:    document.querySelector('.dashboard-container'),
      errBox:  document.getElementById('error-container'),
      errText: document.getElementById('error-text'),
      backBtn: document.getElementById('back-to-login'),
      nameEl:  document.getElementById('user-display-name'),
      outBtn:  document.getElementById('logout-btn')
    };
  
    function showError(msg) {
      if (els.loading) els.loading.style.display = 'none';
      if (els.errText) els.errText.textContent = msg || 'Error verifying permissions.';
      if (els.errBox)  els.errBox.style.display = 'flex';
    }
  
    function showDash(emp, user) {
      if (els.loading) els.loading.style.display = 'none';
      if (els.errBox)  els.errBox.style.display = 'none';
      if (els.dash)    els.dash.style.display = 'block';
  
      const display =
        emp?.displayName ||
        [emp?.firstName, emp?.lastName].filter(Boolean).join(' ') ||
        user?.email || 'Admin User';
      if (els.nameEl) els.nameEl.textContent = display;
  
      if (els.outBtn) {
        els.outBtn.addEventListener('click', async () => {
          try { await auth.signOut(); } catch {}
          location.replace('/login.html');
        });
      }
      if (els.backBtn) {
        els.backBtn.addEventListener('click', () => {
          location.assign('/login.html');
        });
      }
    }
  
    function redirectToLogin(reason) {
      const next = encodeURIComponent(location.pathname + location.search + location.hash);
      const url  = `/login.html?next=${next}${reason ? `&reason=${encodeURIComponent(reason)}` : ''}`;
      location.replace(url);
    }
  
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        redirectToLogin('not_signed_in');
        return;
      }
  
      try {
        // ✅ UID-based read matches your rules
        const snap = await db.doc(`employees/${user.uid}`).get();
        if (!snap.exists) {
          showError('No employee profile found.');
          try { await auth.signOut(); } catch {}
          return;
        }
  
        const emp   = snap.data() || {};
        const roles = Array.isArray(emp.roles) ? emp.roles : [];
        const active = emp.active === true;
  
        if (!active) {
          showError('Your account is not active. Contact an administrator.');
          try { await auth.signOut(); } catch {}
          return;
        }
        if (!roles.includes('admin')) {
          showError('You do not have permission to access the admin dashboard.');
          try { await auth.signOut(); } catch {}
          return;
        }
  
        console.log('[guard-admin] Access granted for', user.email, roles);
        showDash(emp, user);
  
      } catch (e) {
        console.error('[guard-admin] error:', e?.message || e);
        showError('Error verifying user permissions. Please try again.');
        try { await auth.signOut(); } catch {}
      }
    });
  })();