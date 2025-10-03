/* Employee self-setup: sign in (if needed) then let the user fill allowed fields */
(function(){

  // --- phone auto-format (XXX-XXX-XXXX) ---
  function _fmtPhone(v) {
    const d = (v || "").replace(/\D/g, "").slice(0, 10);
    const a = d.slice(0,3), b = d.slice(3,6), c = d.slice(6,10);
    return d.length > 6 ? `${a}-${b}-${c}` : d.length > 3 ? `${a}-${b}` : a;
  }
  function _wirePhone(id){
    const el = document.getElementById(id);
    if (!el) return;
    const apply = () => { el.value = _fmtPhone(el.value); };
    el.addEventListener("input", apply);
    el.addEventListener("blur", apply);
    apply();
  }
  window.addEventListener("DOMContentLoaded", () => {
    _wirePhone("phone");
    _wirePhone("emergencyContactPhone");
  });

  const auth = firebase.auth();
  const db   = firebase.firestore();

  const qs = id => document.getElementById(id);
  const show = (id, v=true) => (qs(id).hidden = !v, qs(id));

  const stepAuth = qs('step-auth');
  const stepForm = qs('step-form');
  const who = qs('who');

  // Login form
  qs('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    show('authMsg', false);
    try {
      const email = qs('loginEmail').value.trim();
      const pass  = qs('loginPass').value;
      await auth.signInWithEmailAndPassword(email, pass);
    } catch (err) {
      qs('authMsg').textContent = err.message || String(err);
      show('authMsg', true);
    }
  });

  // When authed, load existing doc and show the form
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      show('step-auth', true);
      show('step-form', false);
      return;
    }
    who.textContent = user.email || user.uid;
    show('step-auth', false);
    show('step-form', true);

    try {
      const doc = await db.collection('employees').doc(user.uid).get({ source: 'server' });
      const d = (doc.exists ? doc.data() : {}) || {};
      // Prefill
      ['firstName','lastName','nickname','phone','emergencyContact','emergencyContactPhone'].forEach(k => {
        if (d[k]) qs(k).value = d[k];
      });
      if (d.dob && typeof d.dob.toDate === 'function') {
        const dt = d.dob.toDate();
        qs('dob').value = dt.toISOString().slice(0,10);
      }
    } catch(e) {
      console.error('[onboard] load error', e);
    }
  });

  // Save allowed fields (these must be permitted by rules)
  qs('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    show('saveMsg', false);
    show('saveErr', false);
    const user = auth.currentUser;
    if (!user) return;

    const payload = {
      firstName: qs('firstName').value.trim() || firebase.firestore.FieldValue.delete(),
      lastName: qs('lastName').value.trim() || firebase.firestore.FieldValue.delete(),
      nickname: qs('nickname').value.trim() || firebase.firestore.FieldValue.delete(),
      phone: qs('phone').value.trim() || firebase.firestore.FieldValue.delete(),
      emergencyContact: qs('emergencyContact').value.trim() || firebase.firestore.FieldValue.delete(),
      emergencyContactPhone: qs('emergencyContactPhone').value.trim() || firebase.firestore.FieldValue.delete(),
      dob: qs('dob').value ? new Date(qs('dob').value) : firebase.firestore.FieldValue.delete(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      await db.collection('employees').doc(user.uid).set(payload, { merge: true });
      show('saveMsg', true);
    } catch (err) {
      qs('saveErr').textContent = err.message || String(err);
      show('saveErr', true);
    }
  });
})();
