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
// Small helpers
/////////////////////////
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Format to XXX-XXX-XXXX for display (leaves non-10-digit values as-is). */
function formatPhoneDisplay(v = '') {
  const digitsRaw = String(v).replace(/\D/g, '');
  const d = (digitsRaw.length === 11 && digitsRaw.startsWith('1'))
    ? digitsRaw.slice(1)
    : digitsRaw;
  if (d.length === 10) return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
  return String(v);
}

/////////////////////////
// DOM Elements
/////////////////////////
const modal         = document.getElementById('employeeModal');
const form          = document.getElementById('employeeForm');
const tableBody     = document.getElementById('employeesTableBody');
const saveButton    = document.getElementById('saveEmployee');
const cancelButton  = document.getElementById('cancelEdit');
const closeModalBtn = document.querySelector('.close-modal');

/////////////////////////
// Modal helpers (ARIA-friendly)
/////////////////////////
function openModal() {
  if (!modal) return;
  modal.style.display = 'block';
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  try { document.body.style.overflow = 'hidden'; } catch {}
}
function closeModal() {
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  modal.style.display = 'none';
  try { document.body.style.overflow = ''; } catch {}
  if (form) form.reset();
  const idEl = document.getElementById('employeeId');
  if (idEl) idEl.value = '';
}

/////////////////////////
// Save (create/update) employee
// NOTE: Creating a NEW doc here will fail unless the id == UID (per rules).
// Use the "Create & Send" flow above for true creates; this form is for edits.
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
    setVal('employeeID', e.employeeID || e.employeeId || '');

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
  if (!id) return;
  const me = auth.currentUser && auth.currentUser.uid;
  if (id === me) {
    alert("You can’t delete your own employee record while signed in.");
    return;
  }
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
if (form)         form.addEventListener('submit', saveEmployee);
if (cancelButton) cancelButton.addEventListener('click', (e) => { e.preventDefault(); closeModal(); });
if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal && modal.classList.contains('is-open')) closeModal();
});

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

          const rolesArr = extractRoles(d);
          const rolesTxt = (rolesArr && rolesArr.length) ? rolesArr.join(', ') : '—';

          const phoneTxt        = formatPhoneDisplay(d.phone || '');
          const emergencyName   = d.emergencyContact || d.emergencyName || d.emergencyContactName || '';
          const emergencyPhone  = formatPhoneDisplay(d.emergencyContactPhone || d.emergencyPhone || '');

          const activeTxt = d.active === true ? 'Yes' : 'No';

          const row = tableBody.insertRow();
          row.innerHTML = `
            <td class="sticky-col col-fname">${esc(d.firstName || '')}</td>
            <td class="sticky-col col-lname">${esc(d.lastName || '')}</td>

            <td class="col-email">${esc(d.email || '')}</td>
            <td class="col-phone">${esc(phoneTxt)}</td>
            <td class="col-nickname">${esc(d.nickname || '')}</td>
            <td class="col-employee-id">${esc(d.employeeID || d.employeeId || '—')}</td>
            <td class="col-emergency-name">${esc(emergencyName || '—')}</td>
            <td class="col-emergency-phone">${esc(emergencyPhone || '—')}</td>
            <td>${esc(rolesTxt)}</td>

            <td class="sticky-col col-active">
              <span class="badge ${d.active === true ? 'badge-success' : 'badge-muted'}">${activeTxt}</span>
            </td>
            <td class="sticky-col col-actions">
              <button class="btn btn-sm btn-ghost edit-btn" data-action="edit" data-id="${esc(docSnap.id)}">Edit</button>
              <button class="btn btn-sm btn-danger delete-btn" data-action="delete" data-id="${esc(docSnap.id)}">Delete</button>
            </td>
          `;
        });
      }, (err) => console.error('[live2] listener error:', err));

      console.log('[live2] attached. To stop: window._empLiveUnsub?.()');
    } catch (e) {
      console.error('[live2] setup failed:', e);
    }
  })();
}

// Single delegated click handler for Edit/Delete
if (tableBody) {
  tableBody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action][data-id]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit') {
      editEmployee(id);
    } else if (btn.dataset.action === 'delete') {
      deleteEmployee(id);
    }
  });
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
  const m = document.getElementById('employeeModal');
  if (!m) return;
  const content = m.querySelector('.modal-content') || m.firstElementChild;

  // Do not let events inside the content bubble to the backdrop
  if (content) {
    ['mousedown','mousemove','mouseup','click'].forEach(ev =>
      content.addEventListener(ev, e => e.stopPropagation(), { capture:false })
    );
  }

  // Close only if mousedown started on backdrop (mouseup can be anywhere)
  let downOnBackdrop = false;
  m.addEventListener('mousedown', e => { downOnBackdrop = (e.target === m); });
  m.addEventListener('mouseup',   () => {
    if (downOnBackdrop) { try { closeModal(); } catch(_){} }
    downOnBackdrop = false;
  });
})();
