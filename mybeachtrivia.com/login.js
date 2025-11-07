/* login.js – Beach Trivia (CSP-safe)
   - Works with #roleSelect (or radio[name="role"]) to pick the destination
   - Email/password + Google flows
   - First-login → account-setup
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

  // Role → destination
  const DEST = {
    host:     '/beachTriviaPages/dashboards/host/',
    social:   '/beachTriviaPages/dashboards/social-media-manager/',
    writer:   '/beachTriviaPages/dashboards/writer/',
    supply:   '/beachTriviaPages/dashboards/supply-manager/',
    regional: '/beachTriviaPages/dashboards/regional-manager/',
    admin:    '/beachTriviaPages/dashboards/admin/',
  };

  async function waitForAuth(ms = 150, tries = 40) {
    for (let i = 0; i < tries; i++) {
      if (window.firebase?.auth) return firebase.auth();
      await new Promise(r => setTimeout(r, ms));
    }
    throw new Error('Auth not ready yet.');
  }

  function currentRole() {
    const radio = document.querySelector('input[name="role"]:checked');
    const raw = (radio?.value || els.role?.value || 'host');
    return String(raw).toLowerCase();
  }

  function syncUserType() {
    const r = currentRole();
    if (els.userType) els.userType.value = r === 'admin' ? 'admin' : 'employee';
  }
  els.role?.addEventListener('change', syncUserType);
  syncUserType();

  // --- Google sign-in (redirect helper page) ---
  els.googleBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    const radio = document.querySelector('input[name="role"]:checked');
    const raw   = (radio?.value || els.role?.value || 'host');
    const role  = String(raw).toLowerCase();

    const ret = DEST[role] || DEST.host;

    try {
      localStorage.setItem('postLoginRole', role);
      sessionStorage.setItem('postLoginRole', role);
    } catch {}

    const url = `/start-google.html?role=${encodeURIComponent(role)}&return=${encodeURIComponent(ret)}`;
    location.assign(url);
  });

  // --- Email/Password login ---
  async function handleLogin(ev) {
    ev?.preventDefault();
    try {
      const auth = await waitForAuth();

      await auth.setPersistence(
        els.remember?.checked
          ? firebase.auth.Auth.Persistence.LOCAL
          : firebase.auth.Auth.Persistence.SESSION
      );

      const email = els.email?.value?.trim();
      const pass  = els.pass?.value || '';
      if (!email || !pass) {
        alert('Enter email and password.');
        return;
      }

      els.btn && (els.btn.disabled = true);
      const { user } = await auth.signInWithEmailAndPassword(email, pass);

      // First-login guard: check employees/{uid}
      const db = firebase.firestore();
      const snap = await db.collection('employees').doc(user.uid).get();
      const emp  = snap.exists ? (snap.data() || {}) : {};
      if (emp.active === false) throw new Error('Your account is not active yet.');

      const required = [
        'firstName',
        'lastName',
        'phone',
        'emergencyContact',
        'emergencyContactPhone',
        'dob'
      ];
      const missing  = required.filter(k => !emp[k]);
      const mustSetup = emp.setupCompleted === true ? false : (missing.length > 0);

      if (mustSetup) {
        location.assign('/beachTriviaPages/onboarding/account-setup/');
        return;
      }

      // Honor selection (don't force Admin)
      const role = currentRole();
      const dest = DEST[role] ||
        (Array.isArray(emp.roles) && emp.roles.includes('admin')
          ? DEST.admin
          : DEST.host);

      location.assign(dest);
    } catch (err) {
      console.error('[login] sign-in error:', err);
      alert(err?.message || String(err));
    } finally {
      els.btn && (els.btn.disabled = false);
    }
  }

  // Wire up
  function attach() {
    if (!els.form) return;
    els.form.addEventListener('submit', handleLogin);
    els.btn?.addEventListener('click', handleLogin);
    els.pass?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin(e);
    });
  }

  attach();
})();