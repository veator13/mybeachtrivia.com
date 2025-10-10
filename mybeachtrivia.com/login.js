/* login.js — stable sign-in + role redirect */
(() => {
  if (!window.firebase) { console.error('Firebase SDK not found'); return; }
  const auth = firebase.auth();
  const db   = firebase.firestore();

  // Early afterLogin redirect (CSP-safe; doesn't touch your debug-redirect flow)
  try {
    auth.onAuthStateChanged(async (user) => {
      if (!user) return;
      try {
        const t = sessionStorage.getItem('afterLogin');
        if (t) {
          const u = new URL(t, location.origin);
          if (u.origin === location.origin) {
            sessionStorage.removeItem('afterLogin');
            location.replace(u.href);
            return;
          }
        }
      } catch (e) {
        console.warn('[login.js] early afterLogin hook failed', e);
      }
    });
  } catch (e) {
    console.warn('[login.js] onAuthStateChanged attach failed', e);
  }

  // ----- DOM refs (defer script => DOM is ready) -----
  const $ = (s) => document.querySelector(s);
  const form           = $('#loginForm');
  const emailEl        = $('#username');
  const passEl         = $('#password');
  const loginBtn       = $('#loginButton');
  const googleBtn      = $('#googleButton');
  const roleSelect     = $('#roleSelect');
  const hiddenUserType = $('#userType');
  const adminToggle    = $('#admin-toggle');
  const employeeToggle = $('#employee-toggle');

  // ----- Destinations by role -----
  const ROLE_DEST = {
    host:     '/beachTriviaPages/dashboards/host/',
    social:   '/beachTriviaPages/dashboards/social-media-manager/',
    writer:   '/beachTriviaPages/dashboards/writer/',
    supply:   '/beachTriviaPages/dashboards/supply-manager/',
    regional: '/beachTriviaPages/dashboards/regional-manager/',
    admin:    '/beachTriviaPages/dashboards/admin/',
  };

  function selectedRole() {
    const fromDD = roleSelect?.value;
    if (fromDD) return fromDD;
    const fromHidden = hiddenUserType?.value;
    if (fromHidden) return String(fromHidden);
    return 'host';
  }

  function setTab(tab) {
    const t = (String(tab || '').toLowerCase() === 'admin') ? 'admin' : 'employee';
    if (adminToggle && employeeToggle) {
      if (t === 'admin') {
        adminToggle.classList.add('active');
        employeeToggle.classList.remove('active');
      } else {
        employeeToggle.classList.add('active');
        adminToggle.classList.remove('active');
      }
    }
    if (hiddenUserType) hiddenUserType.value = t;
  }

  async function redirectByRole(user) {
    const snap = await db.collection('employees').doc(user.uid).get();
    if (!snap.exists) throw new Error('No employee profile found.');
    const data = snap.data() || {};

    if (data.active === false) throw new Error('Your account is not active yet.');

    const roles = Array.isArray(data.roles) ? data.roles.map(String)
                 : (data.roles ? [String(data.roles)] : []);
    const role  = selectedRole().toLowerCase();

    if (role === 'admin' && !roles.includes('admin')) {
      const err = new Error('You do not have admin access.');
      err.code = 'employee/not-in-role';
      throw err;
    }

    const dest = ROLE_DEST[role] || ROLE_DEST.host;
    window.location.assign(dest);
  }

  async function handleLogin(ev) {
    ev?.preventDefault();
    const email = emailEl?.value?.trim();
    const pass  = passEl?.value || '';
    if (!email || !pass) { alert('Enter email and password.'); return; }

    if (loginBtn) loginBtn.disabled = true;
    try {
      const { user } = await auth.signInWithEmailAndPassword(email, pass);
      await redirectByRole(user);
    } catch (e) {
      console.error('[login.js] sign-in failed', e);
      alert(e.message || String(e));
    } finally {
      if (loginBtn) loginBtn.disabled = false;
    }
  }

  // Wire events (no HTML5 blocking)
  if (form) {
    form.noValidate = true;
    form.addEventListener('submit', handleLogin);
  }
  loginBtn?.addEventListener('click', handleLogin);

  // Google flow -> helper page (keeps CSP happy)
  googleBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    const role = selectedRole();
    const ret  = location.origin + '/login.html';
    location.assign(`/start-google.html?role=${encodeURIComponent(role)}&return=${encodeURIComponent(ret)}`);
  });

  // Respect ?userType & remember choice
  try {
    const urlTab = new URLSearchParams(location.search).get('userType');
    const pref   = urlTab || sessionStorage.getItem('bt_login_tab');
    if (pref) setTab(pref);
    adminToggle?.addEventListener('click', ()=>{ setTab('admin');    sessionStorage.setItem('bt_login_tab','admin'); });
    employeeToggle?.addEventListener('click', ()=>{ setTab('employee'); sessionStorage.setItem('bt_login_tab','employee'); });
  } catch {}

})();
