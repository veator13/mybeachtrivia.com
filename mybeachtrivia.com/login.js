/* login.js – Beach Trivia (CSP-safe)
   - Handles email/password + Google sign-in
   - Respects dashboard selector (Host vs Admin, etc.)
   - First-login → account-setup onboarding
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

  // Hide broken logos without inline handlers (CSP-safe)
  els.brandLogo?.addEventListener('error', () => {
    els.brandLogo.hidden = true;
  });

  // Destination map for each role
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
    const raw   = (radio?.value || els.role?.value || 'host');
    return String(raw).toLowerCase();
  }

  function syncUserType() {
    const role = currentRole();
    if (els.userType) {
      els.userType.value = (role === 'admin') ? 'admin' : 'employee';
    }
  }
  els.role?.addEventListener('change', syncUserType);
  // In case you ever switch to radio buttons:
  document.querySelectorAll('input[name="role"]').forEach(radio => {
    radio.addEventListener('change', syncUserType);
  });
  syncUserType();

  /**
   * Determine where to send the user after successful auth,
   * based on:
   *  - requestedRole (dropdown/radio)
   *  - employee Firestore doc (roles / role)
   */
  function resolveDestination(emp, requestedRole) {
    const role = (requestedRole || 'host').toLowerCase();

    const empRoles = Array.isArray(emp.roles)
      ? emp.roles
      : (emp.role ? [emp.role] : []);
    const hasAdmin = empRoles.includes('admin');

    // If they explicitly chose Admin, check permission.
    if (role === 'admin') {
      if (hasAdmin) {
        return DEST.admin;
      }
      alert("You don't have admin access. Redirecting to the Host dashboard.");
      return DEST.host;
    }

    // For any non-admin selection, honor exactly what they picked.
    return DEST[role] || DEST.host;
  }

  /**
   * Check onboarding requirements and redirect appropriately.
   * Shared by email/password and Google flows.
   */
  async function handlePostSignIn(user, requestedRole) {
    const db = firebase.firestore();
    const snap = await db.collection('employees').doc(user.uid).get();
    const emp  = snap.exists ? (snap.data() || {}) : {};

    if (emp.active === false) {
      throw new Error('Your account is not active yet.');
    }

    const required = [
      'firstName',
      'lastName',
      'phone',
      'emergencyContact',
      'emergencyContactPhone',
      'dob'
    ];
    const missing = required.filter(k => !emp[k]);
    const mustSetup = emp.setupCompleted === true ? false : (missing.length > 0);

    if (mustSetup) {
      // Onboarding flow
      location.assign('/beachTriviaPages/onboarding/account-setup/');
      return;
    }

    const dest = resolveDestination(emp, requestedRole);
    location.assign(dest);
  }

  // ------------- Email/Password login -----------------

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

      if (els.btn) els.btn.disabled = true;

      const { user } = await auth.signInWithEmailAndPassword(email, pass);
      const role = currentRole();
      await handlePostSignIn(user, role);
    } catch (err) {
      console.error('[login] email/password sign-in error:', err);
      alert(err?.message || String(err));
    } finally {
      if (els.btn) els.btn.disabled = false;
    }
  }

  // ------------- Google sign-in (popup) -----------------

  async function handleGoogleLogin(ev) {
    ev?.preventDefault();
    try {
      const auth = await waitForAuth();

      await auth.setPersistence(
        els.remember?.checked
          ? firebase.auth.Auth.Persistence.LOCAL
          : firebase.auth.Auth.Persistence.SESSION
      );

      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');
      provider.setCustomParameters({ prompt: 'select_account' });

      const credential = await auth.signInWithPopup(provider);
      const user = credential.user;
      const role = currentRole();

      // Let other code know what was requested (if you ever use it elsewhere)
      try {
        localStorage.setItem('postLoginRole', role);
        sessionStorage.setItem('postLoginRole', role);
      } catch (_) {}

      await handlePostSignIn(user, role);
    } catch (err) {
      console.error('[login] Google sign-in error:', err);
      alert(err?.message || String(err));
    }
  }

  // ------------- Wire up events -----------------

  function attach() {
    if (!els.form) return;

    els.form.addEventListener('submit', handleLogin);
    els.btn?.addEventListener('click', handleLogin);
    els.pass?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin(e);
    });

    els.googleBtn?.addEventListener('click', handleGoogleLogin);
  }

  attach();
})();