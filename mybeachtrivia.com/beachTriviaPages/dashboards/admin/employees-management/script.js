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
// Edit-modal Roles UI helpers
/////////////////////////
function collectEditRoles() {
  const boxes = Array.from(document.querySelectorAll('#edit-roles-fieldset input[name="editRoles"]:checked'));
  let roles = boxes.map(b => (b.value || '').toLowerCase().trim()).filter(Boolean);

  if (!roles.length) roles = ['host'];
  return [...new Set(roles)];
}
function setEditRoles(rolesArr = []) {
  const roles = (Array.isArray(rolesArr) ? rolesArr : []).map(r => String(r).toLowerCase().trim());
  const boxes = Array.from(document.querySelectorAll('#edit-roles-fieldset input[name="editRoles"]'));
  boxes.forEach(cb => {
    cb.checked = roles.includes(String(cb.value).toLowerCase());
  });

  if (!boxes.some(cb => cb.checked)) {
    const host = boxes.find(cb => String(cb.value).toLowerCase() === 'host');
    if (host) host.checked = true;
  }
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

function formatPhoneDisplay(v = '') {
  const digitsRaw = String(v).replace(/\D/g, '');
  const d = (digitsRaw.length === 11 && digitsRaw.startsWith('1'))
    ? digitsRaw.slice(1)
    : digitsRaw;
  if (d.length === 10) return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
  return String(v);
}

function norm(v) {
  return String(v ?? '').toLowerCase().trim();
}

/////////////////////////
// DOM Elements
/////////////////////////
const modal         = document.getElementById('employeeModal');
const form          = document.getElementById('employeeForm');
const tableBody     = document.getElementById('employeesTableBody');
const cancelButton  = document.getElementById('cancelEdit');
const closeModalBtn = document.querySelector('.close-modal');

const employeeSearchInput = document.getElementById('employeeSearch');
const employeesCountEl    = document.getElementById('employees-count');
const noResultsEl         = document.getElementById('employees-no-results');

/////////////////////////
// Modal helpers
/////////////////////////
function openModal() {
  if (!modal) return;
  modal.style.display = 'block';
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  try { document.body.style.overflow = 'hidden'; } catch (_) {}
}

function closeModal() {
  if (!modal) return;

  try { document.activeElement?.blur?.(); } catch (_) {}

  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  modal.style.display = 'none';

  try { document.body.style.overflow = ''; } catch (_) {}
  if (form) form.reset();

  const idEl = document.getElementById('employeeId');
  if (idEl) idEl.value = '';
}

/////////////////////////
// Save (edit only)
/////////////////////////
async function saveEmployee(e) {
  e.preventDefault();

  const idEl = document.getElementById('employeeId');
  const employeeId = ((idEl && idEl.value) || '').trim();

  const employeeData = {
    firstName:  (document.getElementById('firstName')?.value || '').trim(),
    lastName:   (document.getElementById('lastName')?.value || '').trim(),
    email:      (document.getElementById('email')?.value || '').trim(),
    phone:      (document.getElementById('phone')?.value || '').trim(),
    nickname:   (document.getElementById('nickname')?.value || '').trim(),
    employeeID: (document.getElementById('employeeID')?.value || '').trim(),

    emergencyContact:      (document.getElementById('emergencyContactName')?.value || '').trim(),
    emergencyContactPhone: (document.getElementById('emergencyContactPhone')?.value || '').trim(),

    emergencyContactName:  (document.getElementById('emergencyContactName')?.value || '').trim(),
    emergencyName:         (document.getElementById('emergencyContactName')?.value || '').trim(),
    emergencyPhone:        (document.getElementById('emergencyContactPhone')?.value || '').trim(),

    active: (document.getElementById('active')?.value === 'true')
  };

  const roles = collectEditRoles();
  employeeData.roles = roles;
  employeeData.role  = roles.includes('admin') ? 'admin' : (roles[0] || 'host');

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
    const snap = await db.collection('employees').doc(id).get();
    if (!snap.exists) {
      alert('Employee not found.');
      return;
    }

    const e = snap.data() || {};
    const setVal = (fieldId, v) => {
      const el = document.getElementById(fieldId);
      if (el) el.value = v;
    };

    setVal('firstName',  e.firstName || '');
    setVal('lastName',   e.lastName || '');
    setVal('email',      e.email || '');
    setVal('phone',      e.phone || '');
    setVal('nickname',   e.nickname || '');
    setVal('employeeID', e.employeeID || e.employeeId || '');

    setVal('emergencyContactName',  e.emergencyContact || e.emergencyName || e.emergencyContactName || '');
    setVal('emergencyContactPhone', e.emergencyContactPhone || e.emergencyPhone || '');

    setVal('active', e.active === true ? 'true' : 'false');
    setEditRoles(extractRoles(e));

    const idEl = document.getElementById('employeeId');
    if (idEl) idEl.value = id;

    openModal();
  } catch (err) {
    console.error('Error fetching employee details:', err);
    alert('Failed to fetch employee details.');
  }
}

/////////////////////////
// Delete employee
/////////////////////////
async function deleteEmployee(id) {
  if (!id) return;

  const me = auth.currentUser?.uid;
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
// Wire up UI
/////////////////////////
if (form) {
  form.addEventListener('submit', saveEmployee);
}
if (cancelButton) {
  cancelButton.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal();
  });
}
if (closeModalBtn) {
  closeModalBtn.addEventListener('click', closeModal);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal && modal.classList.contains('is-open')) {
    closeModal();
  }
});

/////////////////////////
// Search/filter helpers
/////////////////////////
function getRowSearchText(tr) {
  const idx = tr?.dataset?.searchIndex;
  if (idx) return idx;
  return norm(tr?.textContent || '');
}

function applyEmployeeTableFilter() {
  if (!tableBody) return;

  const q = norm(employeeSearchInput?.value || '');
  const rows = Array.from(tableBody.querySelectorAll('tr'));

  let shown = 0;
  for (const tr of rows) {
    if (!q) {
      tr.style.display = '';
      shown++;
      continue;
    }
    const hay = getRowSearchText(tr);
    const match = hay.includes(q);
    tr.style.display = match ? '' : 'none';
    if (match) shown++;
  }

  const total = rows.length;
  if (employeesCountEl) {
    employeesCountEl.textContent = total ? `${shown} of ${total} showing` : '0 employees';
  }

  if (noResultsEl) {
    if (total > 0 && shown === 0 && q) {
      noResultsEl.style.display = '';
      noResultsEl.textContent = `No employees match “${employeeSearchInput.value}”.`;
    } else {
      noResultsEl.style.display = 'none';
      noResultsEl.textContent = '';
    }
  }
}

if (employeeSearchInput) {
  employeeSearchInput.addEventListener('input', applyEmployeeTableFilter);
  employeeSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      employeeSearchInput.value = '';
      applyEmployeeTableFilter();
      employeeSearchInput.blur();
    }
  });
}

/////////////////////////
// Live employees list
/////////////////////////
function resetEmployeesUi() {
  try { window._empLiveUnsub?.(); } catch (_) {}
  window._empLiveUnsub = null;
  window._empLiveAttached = false;

  if (tableBody) tableBody.innerHTML = '';
  if (employeesCountEl) employeesCountEl.textContent = '';
  if (noResultsEl) {
    noResultsEl.style.display = 'none';
    noResultsEl.textContent = '';
  }
}

function startEmployeesLive2() {
  if (window._empLiveAttached) {
    console.warn('[liveUI] already attached');
    return;
  }

  window._empLiveAttached = true;
  if (!tableBody) return;

  (async () => {
    try {
      const meUid = auth.currentUser?.uid;
      if (!meUid) {
        window._empLiveAttached = false;
        return;
      }

      const meSnap = await db.collection('employees').doc(meUid).get();
      const meData = meSnap.exists ? (meSnap.data() || {}) : {};

      if (!isAdminFromDoc(meData)) {
        tableBody.innerHTML = '';
        window._empLiveAttached = false;
        return;
      }

      const q = db.collection('employees').orderBy('email');
      window._empLiveUnsub = q.onSnapshot(
        { includeMetadataChanges: true },
        (snap) => {
          tableBody.innerHTML = '';

          snap.forEach((docSnap) => {
            const d = docSnap.data() || {};
            if (d.isTemp === true) return;

            const rolesArr = extractRoles(d);
            const rolesTxt = rolesArr.length ? rolesArr.join(', ') : '—';

            const phoneTxt       = formatPhoneDisplay(d.phone || '');
            const emergencyName  = d.emergencyContact || d.emergencyName || d.emergencyContactName || '';
            const emergencyPhone = formatPhoneDisplay(d.emergencyContactPhone || d.emergencyPhone || '');
            const activeTxt      = d.active === true ? 'Yes' : 'No';

            const row = tableBody.insertRow();
            const searchIndex = [
              d.firstName, d.lastName,
              d.email,
              phoneTxt, d.phone,
              d.nickname,
              d.employeeID, d.employeeId,
              emergencyName, emergencyPhone,
              rolesTxt,
              activeTxt,
              docSnap.id
            ].map(norm).filter(Boolean).join(' | ');

            row.dataset.searchIndex = searchIndex;
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

          applyEmployeeTableFilter();
        },
        (err) => {
          console.error('[live2] listener error:', err);
        }
      );

      console.log('[live2] attached. To stop: window._empLiveUnsub?.()');
    } catch (e) {
      console.error('[live2] setup failed:', e);
      window._empLiveAttached = false;
    }
  })();
}

auth.onAuthStateChanged((user) => {
  if (!user) {
    resetEmployeesUi();
    return;
  }
  startEmployeesLive2();
});

/////////////////////////
// Delegated click handler
/////////////////////////
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
// Phone mask
/////////////////////////
(function () {
  function formatToUSPhone(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    const d = (digits.length === 11 && digits.startsWith('1')) ? digits.slice(1) : digits.slice(-10);
    if (d.length <= 3) return d;
    if (d.length <= 6) return d.slice(0, 3) + '-' + d.slice(3);
    return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6, 10);
  }

  function attachPhoneMasks(root = document) {
    const inputs = Array.from(root.querySelectorAll('input[type="tel"], input[id*="phone" i], input[name*="phone" i]'));
    inputs.forEach((el) => {
      const apply = () => { el.value = formatToUSPhone(el.value); };
      apply();
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
// Modal backdrop guard
/////////////////////////
(function () {
  const m = document.getElementById('employeeModal');
  if (!m) return;

  const content = m.querySelector('.modal-content') || m.firstElementChild;
  if (content) {
    ['mousedown', 'mousemove', 'mouseup', 'click'].forEach((ev) =>
      content.addEventListener(ev, (e) => e.stopPropagation(), { capture: false })
    );
  }

  let downOnBackdrop = false;
  m.addEventListener('mousedown', (e) => {
    downOnBackdrop = (e.target === m);
  });
  m.addEventListener('mouseup', () => {
    if (downOnBackdrop) {
      try { closeModal(); } catch (_) {}
    }
    downOnBackdrop = false;
  });
})();