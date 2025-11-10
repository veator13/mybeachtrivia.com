/* login.js – Beach Trivia (CSP-safe)
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

  // Hide broken logos without inline handlers (CSP-friendly)
  els.brandLogo?.addEventListener('error', () => {
    els.brandLogo.hidden = true;
  });

  // Role → destination
  const DEST = {
    host:     '/beachTriviaPages/dashboards/host/',
    social:   '/beachTriviaPages/dashboards/social-media-manager/',
    writer:   '/beachTriviaPages/dashboards/writer/',
    supply:   '/beachTriviaPages/dashboards/supply-manager/',
    regional: '/beachTriviaPages/dashboards/regional-manager/',
    admin:    '/beachTriviaPages/dashboards/admin/',
  };

  function currentRole() {
    const radio = document.querySelector('input[name="role"]:checked');
    const raw = (radio?.value || els.role?.value || 'host');
    return String(raw).toLowerCase();
  }

  function syncUserType() {
    const r = currentRole();
    if (els.userType) {
      els.userType.value = r === 'admin' ? 'admin' : 'employee';
    }
  }

  els.role?.addEventListener('change', syncUserType);
  syncUserType();

  async function waitForAuth(ms = 150, tries = 40) {
    for (let i = 0; i < tries; i++) {
      if (window.firebase?.auth) return firebase.auth();
      await new Promise(r => setTimeout(r, ms));
    }
    throw new Error('Auth not ready yet.');
  }

  function getDb() {
    if (!window.firebase?.firestore) {
      throw new Error('Firestore SDK not loaded');
    }
    return firebase.firestore();
  }

  // Best-effort: ensure employees/{uid} exists from employeeInvites
  async function ensureEmployeeProfile(user) {
    try {
      if (!user) return;
      const db = getDb();
      const uid = user.uid;

      const existing = await db.collection('employees').doc(uid).get();
      if (existing.exists) return;

      const inviteSnap = await db
        .collection('employeeInvites')
        .where('email', '==', user.email)
        .limit(1)
        .get();

      if (inviteSnap.empty) {
        console.log('[login] no invite found for', user.email);
        return;
      }

      const inviteDoc = inviteSnap.docs[0];
      const invite = inviteDoc.data();

      const display = user.displayName || '';
      const parts = display.trim().split(/\s+/);
      const firstName = parts[0] || '';
      const lastName  = parts.slice(1).join(' ') || '';

      await db.collection('employees').doc(uid).set({
        uid,
        email: user.email,
        firstName,
        lastName,
        nickname: '',
        phone: '',
        active: invite.active !== false,
        role: invite.role || 'host',
        inviteId: inviteDoc.id,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection('employeeInvites').doc(inviteDoc.id).delete();
      console.log('[login] employee profile created from invite');
    } catch (err) {
      console.error('[login] ensureEmployeeProfile error:', err);
    }
  }

  async function afterSignIn(user) {
    const db = getDb();

    await ensureEmployeeProfile(user);

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
      'dob',
    ];
    const missing  = required.filter(k => !emp[k]);
    const mustSetup = emp.setupCompleted === true ? false : (missing.length > 0);

    if (mustSetup) {
      location.assign('/beachTriviaPages/onboarding/account-setup/');
      return;
    }

    const role = currentRole();
    const dest =
      DEST[role] ||
      (Array.isArray(emp.roles) && emp.roles.includes('admin')
        ? DEST.admin
        : DEST.host);

    location.assign(dest);
  }

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

      if (els.btn) els.btn.disabled = true;

      const { user } = await auth.signInWithEmailAndPassword(email, pass);
      await afterSignIn(user);
    } catch (err) {
      console.error('[login] sign-in error:', err);
      alert(err?.message || String(err));
    } finally {
      if (els.btn) els.btn.disabled = false;
    }
  }

  // --- Google sign-in (popup flow) ---
  els.googleBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
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

      const { user } = await auth.signInWithPopup(provider);

      try {
        localStorage.setItem('postLoginRole', currentRole());
      } catch (_) {}

      await afterSignIn(user);
    } catch (err) {
      console.error('[login] Google sign-in error:', err);
      if (err && err.code === 'auth/popup-closed-by-user') {
        // Silent fail if user just closes the popup.
        return;
      }
      alert(err?.message || 'Google sign-in failed.');
    }
  });

  // Wire up form handlers
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