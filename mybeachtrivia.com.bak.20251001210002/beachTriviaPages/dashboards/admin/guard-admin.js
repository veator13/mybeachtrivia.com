// guard-admin.js — CSP-safe auth/role gate for Admin dashboard (Firebase v8 namespace)
// Expects firebase + firebase-init.js to be loaded BEFORE this file.
(function () {
  // Fallback: keep UI hidden until we verify
  let rootWasHidden = false;
  try {
    if (getComputedStyle(document.documentElement).visibility !== 'hidden') {
      document.documentElement.style.visibility = 'hidden';
      rootWasHidden = true;
    }
  } catch (_) {}

  if (typeof firebase === "undefined" || !firebase.auth || !firebase.firestore) {
    console.error("[guard-admin] Firebase not found. Did firebase-init.js load?");
    // Don't trap the user on a blank page forever
    try { document.documentElement.style.visibility = ''; } catch (_) {}
    return;
  }

  const auth = firebase.auth();
  const db   = firebase.firestore();

  // Optional DOM hooks (if your page provides them)
  const els = {
    loading: document.getElementById('auth-loading'),                 // e.g., spinner
    dash:    document.querySelector('.dashboard-container'),          // main admin container
    errBox:  document.getElementById('error-container'),              // error wrapper
    errText: document.getElementById('error-text'),                   // error text node
    backBtn: document.getElementById('back-to-login'),                // back/login button
    nameEl:  document.getElementById('user-display-name'),            // "Welcome, X"
    outBtn:  document.getElementById('logout-btn')                    // logout button
  };

  function setDisplay(el, value) { if (el) el.style.display = value; }

  function showError(msg) {
    setDisplay(els.loading, 'none');
    if (els.errText) els.errText.textContent = msg || 'Error verifying permissions.';
    setDisplay(els.errBox, 'flex');

    // As a fallback if you don't have error nodes, just unhide the page
    if (!els.errBox && rootWasHidden) {
      try { document.documentElement.style.visibility = ''; } catch (_) {}
    }
  }

  function showDash(emp, user) {
    setDisplay(els.loading, 'none');
    setDisplay(els.errBox, 'none');
    setDisplay(els.dash, 'block');

    const display =
      (emp && (emp.displayName || [emp.firstName, emp.lastName].filter(Boolean).join(' '))) ||
      (user && (user.displayName || user.email)) ||
      'Admin User';
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

    // Final unhide (or do it even if no special DOM is present)
    try { document.documentElement.style.visibility = ''; } catch (_) {}
    window.dispatchEvent(new CustomEvent('bt:auth:ready'));
  }

  function redirectToLogin(reason) {
    const next = encodeURIComponent(location.pathname + location.search + location.hash);
    const url  = `/login.html?next=${next}${reason ? `&reason=${encodeURIComponent(reason)}` : ''}`;
    location.replace(url);
  }

  function isAdminFromDoc(d) {
    if (!d || d.active !== true) return false;
    if (d.admin === true) return true;
    if (typeof d.role === 'string' && d.role === 'admin') return true;
    if (Array.isArray(d.roles) && d.roles.includes('admin')) return true;
    return false;
  }

  // Safety: 15s watchdog so you don't get stuck invisible
  const watchdog = setTimeout(() => {
    try { document.documentElement.style.visibility = ''; } catch (_) {}
    console.warn('[guard-admin] Watchdog released page visibility after timeout.');
  }, 15000);

  auth.onIdTokenChanged(async (user) => {
    if (!user) {
      // Not signed in -> go to login with return param
      redirectToLogin('not_signed_in');
      return;
    }

    try {
      // Optional: quick loading state
      setDisplay(els.loading, 'block');

try{console.log("[guard] role/read start"); performance.mark("guard_role_start");}catch(e){}
      const snap = await db.doc(`employees/${user.uid}`).get();
try{console.log("[guard] role/read done"); performance.mark("guard_role_done");}catch(e){}
      if (!snap.exists) {
        console.warn('[guard-admin] employees doc missing for', user.uid);
        showError('No employee profile found. Contact an administrator.');
        try { await auth.signOut(); } catch {}
        return;
      }

      const emp = snap.data() || {};
      if (!isAdminFromDoc(emp)) {
        console.warn('[guard-admin] Access denied for', user.email, emp);
        // If you prefer a hard redirect, swap showError+signOut with:
        // location.replace('/dashboards/not-authorized.html');
        showError('You do not have permission to access the admin dashboard.');
        try { await auth.signOut(); } catch {}
        return;
      }

      console.log('[guard-admin] Access granted for', user.email);
      showDash(emp, user);
    } catch (e) {
      console.error('[guard-admin] Error verifying admin:', e && e.message ? e.message : e);
      showError('Error verifying user permissions. Please try again.');
      try { await auth.signOut(); } catch {}
    } finally {
      clearTimeout(watchdog);
    }
  });
})();
