// employees-management/script.js (Firebase v9 COMPAT APIs, no imports)
// Assumes firebase-app-compat.js, firebase-auth-compat.js, firebase-firestore-compat.js
// and firebase-init.js are loaded in index.html BEFORE this file.

/////////////////////////
// Firebase handles
/////////////////////////
const auth = firebase.auth();
const db   = firebase.firestore();

/////////////////////////
// Role helpers (safe + backward compatible)
//
// Some employee docs have a single `role: "host"`,
// others may have `roles: ["host", "admin"]`.
// These helpers read both patterns and normalize to an array.
/////////////////////////
function extractRoles(docData = {}) {
  const arr = Array.isArray(docData.roles) ? docData.roles : [];
  const single = docData.role ? [docData.role] : [];
  return [...new Set([...arr, ...single].filter(Boolean).map(r => String(r).toLowerCase()))];
}
function isAdminFromDoc(docData = {}) {
  return extractRoles(docData).includes('admin');
}
function displayRole(docData = {}) {
  const roles = extractRoles(docData);
  if (roles.length === 0) return '—';
  return roles.includes('admin') ? 'admin' : roles[0];
}

/////////////////////////
// DOM Elements
/////////////////////////
const modal             = document.getElementById('employeeModal');
const form              = document.getElementById('employeeForm');
const tableBody         = document.getElementById('employeesTableBody');
const saveButton        = document.getElementById('saveEmployee');
const cancelButton      = document.getElementById('cancelEdit');
const addNewEmployeeBtn = document.getElementById('addNewEmployeeBtn');
const closeModalBtn     = document.querySelector('.close-modal');

/////////////////////////
// Modal helpers
/////////////////////////
function openModal() { if (modal) modal.style.display = 'block'; }
function closeModal() {
  if (modal) modal.style.display = 'none';
  if (form) form.reset();
  const idEl = document.getElementById('employeeId');
  if (idEl) idEl.value = '';
}

/////////////////////////
// Save (create/update) employee
// NOTE: Creating a NEW doc here will fail unless the id == UID (per rules).
// Use your invite flow for true creates; this form is for edits.
/////////////////////////
async function saveEmployee(e) {
  e.preventDefault();

  const idEl = document.getElementById('employeeId');
  const employeeId = (idEl && idEl.value || '').trim();

  const employeeData = {
    firstName:  (document.getElementById('firstName')?.value  || '').trim(),
    lastName:   (document.getElementById('lastName')?.value   || '').trim(),
    email:      (document.getElementById('email')?.value      || '').trim(),
    phone:      (document.getElementById('phone')?.value      || '').trim(),
    nickname:   (document.getElementById('nickname')?.value   || '').trim(),
    employeeID: (document.getElementById('employeeID')?.value || '').trim(),

    // Canonical emergency fields
    emergencyContact:      (document.getElementById('emergencyContactName')?.value  || '').trim(),
    emergencyContactPhone: (document.getElementById('emergencyContactPhone')?.value || '').trim(),

    // Legacy compatibility (keep in sync)
    emergencyContactName:  (document.getElementById('emergencyContactName')?.value  || '').trim(),
    emergencyName:         (document.getElementById('emergencyContactName')?.value  || '').trim(),
    emergencyPhone:        (document.getElementById('emergencyContactPhone')?.value || '').trim(),

    active: (document.getElementById('active')?.value === 'true')
  };

  try {
    if (!employeeId) {
      alert('To add a NEW employee, use the “Create & Send” invite flow above.');
      return;
    }
    await db.collection('employees').doc(employeeId).update(employeeData);
    alert('Employee updated.');
    closeModal();
  } catch (err) {
    console.error('Error saving employee:', err);
    alert('Save failed (see console).');
  }
}

/////////////////////////
// Edit existing employee
/////////////////////////
async function editEmployee(id) {
  try {
    const docRef = db.collection('employees').doc(id);
    const snap = await docRef.get();
    if (!snap.exists) {
      alert('Employee not found.');
      return;
    }
    const e = snap.data() || {};

    // Populate form
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setVal('firstName',  e.firstName  || '');
    setVal('lastName',   e.lastName   || '');
    setVal('email',      e.email      || '');
    setVal('phone',      e.phone      || '');
    setVal('nickname',   e.nickname   || '');
    setVal('employeeID', e.employeeID || '');

    // Prefill fallbacks (canonical + legacy)
    setVal('emergencyContactName',  e.emergencyContact || e.emergencyName || e.emergencyContactName || '');
    setVal('emergencyContactPhone', e.emergencyContactPhone || e.emergencyPhone || '');

    setVal('active', e.active === true ? 'true' : 'false');

    const idEl = document.getElementById('employeeId');
    if (idEl) idEl.value = id;

    openModal();
  } catch (err) {
    console.error('Error fetching employee details:', err);
    alert('Failed to fetch employee details.');
  }
}

/////////////////////////
// Delete employee (admin only)
/////////////////////////
async function deleteEmployee(id) {
  if (!confirm('Delete this employee?')) return;
  try {
    await db.collection('employees').doc(id).delete();
  } catch (err) {
    console.error('Error deleting employee:', err);
    alert('Delete failed (see console).');
  }
}

/////////////////////////
// Wire up UI (guard each in case element is absent)
/////////////////////////
if (form)              form.addEventListener('submit', saveEmployee);
if (cancelButton)      cancelButton.addEventListener('click', (e) => { e.preventDefault(); closeModal(); });
if (addNewEmployeeBtn) addNewEmployeeBtn.addEventListener('click', () => openModal());
if (closeModalBtn)     closeModalBtn.addEventListener('click', closeModal);
// (Removed global window click-to-close; modal guard below handles backdrop clicks safely.)

/////////////////////////
// Auth guard -> live v2 (with sign-out reset)
/////////////////////////
auth.onAuthStateChanged((user) => {
  if (!user) {
    try { if (window._empLiveUnsub) { window._empLiveUnsub(); } } catch (_) {}
    window._empLiveUnsub    = null;
    window._empLiveAttached = false;
    if (tableBody) tableBody.innerHTML = '';
    return;
  }
  startEmployeesLive2();
});

/////////////////////////
// LIVE employees list v2: render from snapshot directly
/////////////////////////
function startEmployeesLive2() {
  if (window._empLiveAttached) { console.warn('[liveUI] already attached'); return; }
  window._empLiveAttached = true;
  if (!tableBody) return;

  (async () => {
    try {
      const meUid = auth.currentUser && auth.currentUser.uid;
      if (!meUid) return;

      const meSnap = await db.collection('employees').doc(meUid).get({ source: 'server' });
      const meData = meSnap.exists ? (meSnap.data() || {}) : {};
      if (!isAdminFromDoc(meData)) { tableBody.innerHTML = ''; return; }

      const q = db.collection('employees').orderBy('email');
      window._empLiveUnsub = q.onSnapshot({ includeMetadataChanges: true }, (snap) => {
        // rebuild table from snapshot
        tableBody.innerHTML = '';

        snap.forEach((docSnap) => {
          const d = docSnap.data() || {};
          const activeTxt = d.active === true ? 'Yes' : 'No';
          const name =
            d.displayName ||
            (`${d.firstName || ''} ${d.lastName || ''}`).trim() ||
            d.nickname || d.email || docSnap.id;

          const row = tableBody.insertRow();
          row.innerHTML = `
            <td>${name}</td>
            <td>${d.email || ''}</td>
            <td>${d.employeeID || '—'}</td>
            <td>${activeTxt}</td>
            <td>
              <button class="edit-btn" data-id="${docSnap.id}">Edit</button>
              <button class="delete-btn" data-id="${docSnap.id}">Delete</button>
            </td>
          `;
        });

        // rebind actions after re-render
        tableBody.querySelectorAll('.edit-btn').forEach(btn => {
          btn.addEventListener('click', (e) => editEmployee(e.currentTarget.dataset.id));
        });
        tableBody.querySelectorAll('.delete-btn').forEach(btn => {
          btn.addEventListener('click', () => deleteEmployee(btn.dataset.id));
        });
      }, (err) => console.error('[live2] listener error:', err));

      console.log('[live2] attached. To stop: window._empLiveUnsub?.()');
    } catch (e) {
      console.error('[live2] setup failed:', e);
    }
  })();
}

/////////////////////////
// Phone mask: auto-format XXX-XXX-XXXX
/////////////////////////
(function () {
  function formatToUSPhone(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    const d = (digits.length === 11 && digits.startsWith('1')) ? digits.slice(1) : digits.slice(-10);
    if (d.length <= 3) return d;
    if (d.length <= 6) return d.slice(0,3) + '-' + d.slice(3);
    return d.slice(0,3) + '-' + d.slice(3,6) + '-' + d.slice(6,10);
  }
  function attachPhoneMasks(root = document) {
    const inputs = Array.from(root.querySelectorAll('input[type="tel"], input[id*="phone" i], input[name*="phone" i]'));
    inputs.forEach((el) => {
      const apply = () => { el.value = formatToUSPhone(el.value); };
      apply(); // prefilled
      el.addEventListener('input', apply);
      el.addEventListener('blur', apply);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => attachPhoneMasks());
  } else {
    attachPhoneMasks();
  }
  window._phoneMask = { formatToUSPhone, attachPhoneMasks };
})();

/////////////////////////
// Modal guard: allow drag-select; close if click STARTED on backdrop
/////////////////////////
(function () {
  const modal = document.getElementById('employeeModal');
  if (!modal) return;
  const content = modal.querySelector('.modal-content') || modal.firstElementChild;

  // Do not let events inside the content bubble to the backdrop
  if (content) {
    ['mousedown','mousemove','mouseup','click'].forEach(ev =>
      content.addEventListener(ev, e => e.stopPropagation(), { capture:false })
    );
  }

  // Close only if mousedown started on backdrop (mouseup can be anywhere)
  let downOnBackdrop = false;
  modal.addEventListener('mousedown', e => { downOnBackdrop = (e.target === modal); });
  modal.addEventListener('mouseup',   () => {
    if (downOnBackdrop) { try { closeModal(); } catch(_){} }
    downOnBackdrop = false;
  });
})();
