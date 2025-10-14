/* login.js – Beach Trivia
   - CSP-safe (no inline handlers)
   - Uses #roleSelect dropdown
   - Verifies Firestore roles and redirects
*/
(() => {
  const $ = (s, r = document) => r.querySelector(s);

  const els = {
    form:      $('#loginForm'),
    email:     $('#username'),
    pass:      $('#password'),
    remember:  $('#rememberMe'),
    btn:       $('#loginButton'),
    btnTxt:    $('#loginButtonText'),
    role:      $('#roleSelect'),
    userType:  $('#userType'),
    googleBtn: $('#googleButton'),
    brandLogo: $('#brandLogo'),
  };

  // Hide broken logos without inline handlers (CSP)
  els.brandLogo?.addEventListener('error', () => (els.brandLogo.hidden = true));

  // Map roles -> destinations
  const DEST = {
    host:     '/beachTriviaPages/dashboards/host/',
    social:   '/beachTriviaPages/dashboards/social-media-manager/',
    writer:   '/beachTriviaPages/dashboards/writer/',
    supply:   '/beachTriviaPages/dashboards/supply-manager/',
    regional: '/beachTriviaPages/dashboards/regional-manager/',
    admin:    '/beachTriviaPages/dashboards/admin/',
  };

  // Helper: wait until firebase + auth is usable (handles deferred script load)
  async function waitForAuth(ms = 250, tries = 20) {
    for (let i = 0; i < tries; i++) {
      try {
        if (window.firebase?.auth) return firebase.auth();
      } catch {}
      await new Promise(r => setTimeout(r, ms));
    }
    throw new Error('Auth not ready yet.');
  }

  // Early redirect if already signed in and we have a remembered return
  (async () => {
    try {
      const auth = await waitForAuth(150, 30);
      auth.onAuthStateChanged((u) => {
        if (!u) return;
        const t = sessionStorage.getItem('afterLogin');
        if (t) {
          sessionStorage.removeItem('afterLogin');
          try {
            const uret = new URL(t, location.origin);
            if (uret.origin === location.origin) location.replace(uret.href);
          } catch {}
        }
      });
    } catch (e) {
      console.warn('[login] early onAuthStateChanged setup failed:', e);
    }
  })();

  // Role <-> hidden userType sync (for any legacy code)
  function syncUserType() {
    const r = (els.role?.value || 'host').toLowerCase();
    if (els.userType) els.userType.value = r === 'admin' ? 'admin' : 'employee';
  }
  els.role?.addEventListener('change', syncUserType);
  syncUserType();

  // Google helper (keeps CSP happy)
  els.googleBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    const role = (els.role?.value || 'host').toLowerCase();
    const ret  = location.origin + '/login.html';
    location.assign(`/start-google.html?role=${encodeURIComponent(role)}&return=${encodeURIComponent(ret)}`);
  });

  // Main login handler
  async function handleLogin(ev) {
    ev?.preventDefault();
    try {
      const auth = await waitForAuth(150, 30);
      // Persistence from "Remember me"
      await auth.setPersistence(els.remember?.checked ? firebase.auth.Auth.Persistence.LOCAL
                                                      : firebase.auth.Auth.Persistence.SESSION);

      const email = els.email?.value?.trim();
      const pass  = els.pass?.value || '';
      if (!email || !pass) {
        alert('Enter email and password.');
        return;
      }

      els.btn && (els.btn.disabled = true);
      const { user } = await auth.signInWithEmailAndPassword(email, pass);

      // Check Firestore for roles/active
      const db = firebase.firestore();
      const snap = await db.collection('employees').doc(user.uid).get();
      const data = snap.data() || {};
      if (data.active === false) throw new Error('Your account is not active yet.');

      let roles = data.roles;
      if (!Array.isArray(roles)) roles = roles ? [String(roles)] : [];

      const role = (els.role?.value || 'host').toLowerCase();

      // Enforce admin selection requires admin role
      if (role === 'admin' && !roles.includes('admin')) {
        throw Object.assign(new Error('You do not have admin access.'), { code: 'employee/not-in-role' });
      }

      // Default to host if chosen role not allowed/unknown
      const dest = DEST[role] || DEST.host;
      window.location.assign(dest);
    } catch (err) {
      console.error('[login] sign-in error:', err);
      alert(err.message || String(err));
    } finally {
      els.btn && (els.btn.disabled = false);
    }
  }

  // Wire form + button (CSP-safe)
  function attach() {
    if (!els.form || !els.btn) return;
    els.form.addEventListener('submit', handleLogin);
    els.btn.addEventListener('click', handleLogin);
    // tiny convenience for Enter in password field
    els.pass?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin(e);
    });
    console.log('✅ login handler attached');
  }
  attach();

  // Small self-test dump (shows current role/email presence)
  console.table({
    role: (els.role?.value || 'host'),
    hasForm: !!els.form, hasBtn: !!els.btn, hasEmail: !!els.email, hasPass: !!els.pass
  });
})();
