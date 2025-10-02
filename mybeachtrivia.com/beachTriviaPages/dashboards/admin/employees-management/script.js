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
// Fetch & render employees (ADMIN ONLY)
/////////////////////////
async function fetchEmployees() {
  if (!tableBody) return;

  tableBody.innerHTML = '';
  try {
    // ----- Optional UX guard: only proceed if current user is admin by profile
    const meUid = auth.currentUser && auth.currentUser.uid;
    if (!meUid) {
      console.warn('No signed-in user; skipping list.');
      return;
    }
    const meSnap = await db.collection('employees').doc(meUid).get();
    const meData = meSnap.exists ? (meSnap.data() || {}) : {};
    if (!isAdminFromDoc(meData)) {
      console.warn('Not an admin by profile; skipping list.');
      return; // rules would block anyway; this avoids noisy alerts
    }
    // ----- End UX guard

    // Order by firstName then lastName for nicer display (fields may be missing on older docs)
    const snap = await db.collection('employees').orderBy('firstName').get();

    snap.forEach(docSnap => {
      const employee = docSnap.data() || {};
      const row = tableBody.insertRow();

      const roleLabel  = displayRole(employee);   // available if you want to show/use it
      const activeTxt  = employee.active === true ? 'Yes' : 'No';

      row.innerHTML = `
        <td>${employee.firstName || ''} ${employee.lastName || ''}</td>
        <td>${employee.email || ''}</td>
        <td>${employee.employeeID || '—'}</td>
        <td>${activeTxt}</td>
        <td>
          <button class="edit-btn" data-id="${docSnap.id}">Edit</button>
          <button class="delete-btn" data-id="${docSnap.id}">Delete</button>
        </td>
      `;
    });

    // Rebind buttons (replace nodes to drop any stale listeners)
    tableBody.querySelectorAll('.edit-btn').forEach(btn => {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      newBtn.addEventListener('click', (e) => editEmployee(e.target.dataset.id));
    });

    tableBody.querySelectorAll('.delete-btn').forEach(btn => {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      newBtn.addEventListener('click', () => deleteEmployee(newBtn.dataset.id));
    });
  } catch (err) {
    console.error('Error fetching employees:', err);
    alert('Failed to load employees (check permissions / console).');
  }
}

/////////////////////////
// Save (create/update) employee
// NOTE: Direct "create" to employees/{uid} requires admin to know the UID.
// In practice, use the "Create & Send" invite flow to provision new users.
// This form is still useful for editing existing employees.
/////////////////////////
async function saveEmployee(e) {
  e.preventDefault();

  const idEl = document.getElementById('employeeId');
  const employeeId = (idEl && idEl.value || '').trim();

  const employeeData = {
    firstName: (document.getElementById('firstName')?.value || '').trim(),
    lastName:  (document.getElementById('lastName')?.value  || '').trim(),
    email:     (document.getElementById('email')?.value     || '').trim(),
    phone:     (document.getElementById('phone')?.value     || '').trim(),
    nickname:  (document.getElementById('nickname')?.value  || '').trim(),
    employeeID: (document.getElementById('employeeID')?.value || '').trim(),
    emergencyContactName:  (document.getElementById('emergencyContactName')?.value  || '').trim(),
    emergencyContactPhone: (document.getElementById('emergencyContactPhone')?.value || '').trim(),
    active: (document.getElementById('active')?.value === 'true')
  };

  try {
    if (employeeId) {
      // Update existing employee (allowed to admin per rules)
      await db.collection('employees').doc(employeeId).update(employeeData);
      alert('Employee updated.');
    } else {
      // Creating a new employee doc here will FAIL unless the doc id == UID (per rules).
      // Use the invite flow for new users, or set employeeId to a known UID before saving.
      alert('To add a NEW employee, use the "Create & Send" invite flow above.');
      return;
    }

    closeModal();
    fetchEmployees();
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
    setVal('firstName', e.firstName || '');
    setVal('lastName',  e.lastName  || '');
    setVal('email',     e.email     || '');
    setVal('phone',     e.phone     || '');
    setVal('nickname',  e.nickname  || '');
    setVal('employeeID', e.employeeID || '');
    setVal('emergencyContactName',  e.emergencyContactName  || '');
    setVal('emergencyContactPhone', e.emergencyContactPhone || '');
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
    fetchEmployees();
  } catch (err) {
    console.error('Error deleting employee:', err);
    alert('Delete failed (see console).');
  }
}

/////////////////////////
// Wire up UI (guard each in case element is absent)
/////////////////////////
if (form) form.addEventListener('submit', saveEmployee);
if (cancelButton) cancelButton.addEventListener('click', (e) => { e.preventDefault(); closeModal(); });
if (addNewEmployeeBtn) addNewEmployeeBtn.addEventListener('click', () => openModal());
if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);

// Close when clicking outside modal
window.addEventListener('click', (evt) => { if (evt.target === modal) closeModal(); });

// Load employees when signed-in admin is confirmed by auth-guard
auth.onAuthStateChanged((user) => {
  if (user) fetchEmployees();
});
