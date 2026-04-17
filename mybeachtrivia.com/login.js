/* login.js – Beach Trivia (CSP-safe)
   - Handles email/password + Google sign-in
   - Respects selected dashboard role
   - Persists selected role for post-login routing
   - First-login → account-setup onboarding
*/
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const els = {
    form:       $('#loginForm'),
    email:      $('#username'),
    pass:       $('#password'),
    remember:   $('#rememberMe'),
    btn:        $('#loginButton'),
    btnTxt:     $('#loginButtonText'),
    role:       $('#roleSelect'),
    userType:   $('#userType'),
    googleBtn:  $('#googleButton'),
    brandLogo:  $('#brandLogo'),
    togglePass: $('#togglePassword'),
    forgotPwd:  $('#forgotPassword'),
  };

  const DEST = {
    host:     '/beachTriviaPages/dashboards/host/',
    social:   '/beachTriviaPages/dashboards/social-media-manager/social-media-manager.html',
    writer:   '/beachTriviaPages/dashboards/writer/writer.html',
    supply:   '/beachTriviaPages/dashboards/supply-manager/supply-manager.html',
    regional: '/beachTriviaPages/dashboards/regional-manager/regional-manager.html',
    admin:    '/beachTriviaPages/dashboards/admin/',
  };

  const ROLE_STORAGE_KEY = 'bt:selectedRole';

  function normalizeRole(role) {
    return String(role || '').trim().toLowerCase();
  }

  function extractRoles(emp = {}) {
    const arr = Array.isArray(emp.roles) ? emp.roles : [];
    const single = emp.role ? [emp.role] : [];
    return [...new Set([...arr, ...single].filter(Boolean).map(normalizeRole))];
  }

  function getAuth() {
    if (window.firebase?.auth) return firebase.auth();
    throw new Error('Firebase failed to load. Please refresh the page.');
  }

  function getRequestedRoleFromUI() {
    const radio = document.querySelector('input[name="role"]:checked');
    const raw = radio?.value || els.role?.value || 'host';
    return normalizeRole(raw || 'host');
  }

  function saveRequestedRole(role) {
    const normalized = normalizeRole(role);
    if (!normalized) return;
    try {
      localStorage.setItem(ROLE_STORAGE_KEY, normalized);
    } catch (_) {}
    try {
      sessionStorage.setItem(ROLE_STORAGE_KEY, normalized);
    } catch (_) {}
  }

  function getSavedRequestedRole() {
    try {
      const local = normalizeRole(localStorage.getItem(ROLE_STORAGE_KEY));
      if (local) return local;
    } catch (_) {}
    try {
      const session = normalizeRole(sessionStorage.getItem(ROLE_STORAGE_KEY));
      if (session) return session;
    } catch (_) {}
    return '';
  }

  function currentRole() {
    const uiRole = getRequestedRoleFromUI();
    if (uiRole) {
      saveRequestedRole(uiRole);
      return uiRole;
    }
    const savedRole = getSavedRequestedRole();
    return savedRole || 'host';
  }

  function syncUserType() {
    const role = currentRole();
    if (els.userType) {
      els.userType.value = role === 'admin' ? 'admin' : 'employee';
    }
  }

  function syncRoleInputsFromValue(role) {
    const normalized = normalizeRole(role);
    if (!normalized) return;

    if (els.role && els.role.value !== normalized) {
      const opt = Array.from(els.role.options || []).find(o => normalizeRole(o.value) === normalized);
      if (opt) els.role.value = opt.value;
    }

    $$('input[name="role"]').forEach(radio => {
      radio.checked = normalizeRole(radio.value) === normalized;
    });

    syncUserType();
  }

  function setupRolePersistence() {
    const saved = getSavedRequestedRole();
    if (saved) syncRoleInputsFromValue(saved);

    els.role?.addEventListener('change', () => {
      saveRequestedRole(getRequestedRoleFromUI());
      syncUserType();
    });

    $$('input[name="role"]').forEach(radio => {
      radio.addEventListener('change', () => {
        saveRequestedRole(getRequestedRoleFromUI());
        syncUserType();
      });
    });

    if (!saved) {
      saveRequestedRole(getRequestedRoleFromUI());
    }
    syncUserType();
  }

  // Hide broken logos without inline handlers (CSP-safe)
  els.brandLogo?.addEventListener('error', () => {
    els.brandLogo.hidden = true;
  });

  function setupPasswordToggle() {
    if (!els.pass || !els.togglePass) return;

    const openIcon = els.togglePass.querySelector('.eye-open');
    const closedIcon = els.togglePass.querySelector('.eye-closed');

    function setPasswordVisibility(isVisible) {
      els.pass.type = isVisible ? 'text' : 'password';
      els.togglePass.setAttribute('aria-pressed', String(isVisible));
      els.togglePass.setAttribute('aria-label', isVisible ? 'Hide password' : 'Show password');
      els.togglePass.setAttribute('title', isVisible ? 'Hide password' : 'Show password');

      if (openIcon) openIcon.hidden = isVisible;
      if (closedIcon) closedIcon.hidden = !isVisible;
    }

    setPasswordVisibility(false);

    els.togglePass.addEventListener('click', () => {
      const isCurrentlyVisible = els.pass.type === 'text';
      setPasswordVisibility(!isCurrentlyVisible);
    });
  }

  function getValidRoleForUser(emp, requestedRole) {
    const roles = extractRoles(emp);
    const requested = normalizeRole(requestedRole);

    if (requested && roles.includes(requested)) return requested;

    if (roles.length === 1) return roles[0];

    if (roles.includes('host')) return 'host';
    if (roles.includes('admin')) return 'admin';

    return roles[0] || 'host';
  }

  function getDestinationForRole(role) {
    return DEST[normalizeRole(role)] || DEST.host;
  }

  function resolveDestination(emp, requestedRole) {
    const requested = normalizeRole(requestedRole);
    const validRole = getValidRoleForUser(emp, requested);

    if (requested && validRole !== requested) {
      const prettyRequested = requested.charAt(0).toUpperCase() + requested.slice(1);
      const prettyActual = validRole.charAt(0).toUpperCase() + validRole.slice(1);
      alert(`You do not have access to the ${prettyRequested} dashboard. Redirecting to ${prettyActual}.`);
    }

    saveRequestedRole(validRole);
    return getDestinationForRole(validRole);
  }

  function cacheEmployeeDoc(uid, emp) {
    try {
      sessionStorage.setItem('bt:empCache', JSON.stringify({
        uid,
        emp,
        ts: Date.now(),
      }));
    } catch (_) {}
  }

  async function handlePostSignIn(user, requestedRole) {
    const db = firebase.firestore();
    const snap = await db.collection('employees').doc(user.uid).get();
    const emp = snap.exists ? (snap.data() || {}) : {};

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

    const validRole = getValidRoleForUser(emp, requestedRole);
    saveRequestedRole(validRole);

    if (mustSetup) {
      location.assign('/beachTriviaPages/onboarding/account-setup/');
      return;
    }

    cacheEmployeeDoc(user.uid, emp);

    const dest = resolveDestination(emp, requestedRole);
    location.assign(dest);
  }

  function applyPersistence() {
    try {
      const auth = getAuth();
      const type = els.remember?.checked
        ? firebase.auth.Auth.Persistence.LOCAL
        : firebase.auth.Auth.Persistence.SESSION;
      auth.setPersistence(type).catch(() => {});
    } catch (_) {}
  }

  applyPersistence();
  els.remember?.addEventListener('change', applyPersistence);

  async function handleLogin(ev) {
    ev?.preventDefault();
    if (els.btn?.disabled) return;

    try {
      const auth = getAuth();

      const email = els.email?.value?.trim();
      const pass = els.pass?.value || '';
      if (!email || !pass) {
        alert('Enter email and password.');
        return;
      }

      const role = currentRole();
      saveRequestedRole(role);

      if (els.btn) els.btn.disabled = true;

      const { user } = await auth.signInWithEmailAndPassword(email, pass);
      await handlePostSignIn(user, role);
    } catch (err) {
      console.error('[login] email/password sign-in error:', err);
      alert(err?.message || String(err));
    } finally {
      if (els.btn) els.btn.disabled = false;
    }
  }

  function handleGoogleLogin(ev) {
    ev?.preventDefault();
    const role = currentRole();
    saveRequestedRole(role);
    location.assign('/start-google.html?role=' + encodeURIComponent(role));
  }

  function attach() {
    if (!els.form) return;

    els.form.addEventListener('submit', handleLogin);

    els.pass?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin(e);
    });

    els.googleBtn?.addEventListener('click', handleGoogleLogin);

    els.forgotPwd?.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = (els.email?.value || '').trim();
      if (!email) {
        alert('Enter your email address first, then click "Forgot password?".');
        return;
      }
      try {
        const auth = getAuth();
        await auth.sendPasswordResetEmail(email);
        alert('Password reset email sent — check your inbox (and spam folder).');
      } catch (err) {
        console.error('[login] sendPasswordResetEmail error:', err);
        alert(err?.message || 'Could not send password reset email. Please try again.');
      }
    });

    setupPasswordToggle();
  }

  setupRolePersistence();
  attach();
})();