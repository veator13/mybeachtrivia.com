// employees-management/script.js (Firebase v9 COMPAT APIs, no imports)
// Assumes firebase-app-compat.js, firebase-auth-compat.js, firebase-firestore-compat.js
// and firebase-init.js are loaded in index.html BEFORE this file.

/* =========================
   Firebase handles
   ========================= */
   const auth = firebase.auth();
   const db   = firebase.firestore();
   
   /* =========================
      Role helpers (back-compat)
      ========================= */
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
   
   /* =========================
      DOM elements
      ========================= */
   const modal             = document.getElementById('employeeModal');
   const form              = document.getElementById('employeeForm');
   const tableBody         = document.getElementById('employeesTableBody');
   const saveButton        = document.getElementById('saveEmployee');
   const cancelButton      = document.getElementById('cancelEdit');
   const addNewEmployeeBtn = document.getElementById('addNewEmployeeBtn');
   const closeModalBtn     = document.querySelector('.close-modal');
   
   /* =========================
      Modal helpers
      ========================= */
   function openModal() { if (modal) modal.style.display = 'block'; }
   function closeModal() {
     if (modal) modal.style.display = 'none';
     if (form) form.reset();
     const idEl = document.getElementById('employeeId');
     if (idEl) idEl.value = '';
   }
   
   /* =========================
      Admin check (profile)
      ========================= */
   async function ensureCallerIsAdminOrThrow() {
     const meUid = auth.currentUser && auth.currentUser.uid;
     if (!meUid) throw new Error('No signed-in user.');
     const meSnap = await db.collection('employees').doc(meUid).get();
     const meData = meSnap.exists ? (meSnap.data() || {}) : {};
     if (!isAdminFromDoc(meData)) throw new Error('Not an admin by profile.');
     return true;
   }
   
   /* =========================
      Render helpers
      ========================= */
   function renderEmployeesFromDocs(docs) {
     if (!tableBody) return;
     tableBody.innerHTML = '';
   
     docs.forEach(docSnap => {
       const e = docSnap.data() || {};
       const activeTxt  = e.active === true ? 'Yes' : 'No';
       const fullName   = `${e.firstName || ''} ${e.lastName || ''}`.trim() || e.nickname || '—';
       const employeeId = e.employeeID || e.employeeId || '—';
   
       const row = tableBody.insertRow();
       row.innerHTML = `
         <td>${fullName}</td>
         <td>${e.email || '—'}</td>
         <td>${employeeId}</td>
         <td>${activeTxt}</td>
         <td>
           <button class="edit-btn" data-id="${docSnap.id}">Edit</button>
           <button class="delete-btn" data-id="${docSnap.id}">Delete</button>
         </td>
       `;
     });
   
     // Re-bind handlers cleanly
     tableBody.querySelectorAll('.edit-btn').forEach(btn => {
       const clone = btn.cloneNode(true);
       btn.parentNode.replaceChild(clone, btn);
       clone.addEventListener('click', (e) => editEmployee(e.target.dataset.id));
     });
     tableBody.querySelectorAll('.delete-btn').forEach(btn => {
       const clone = btn.cloneNode(true);
       btn.parentNode.replaceChild(clone, btn);
       clone.addEventListener('click', () => deleteEmployee(clone.dataset.id));
     });
   }
   
   /* =========================
      Fetch employees (one-shot)
      ========================= */
   async function fetchEmployees() {
     if (!tableBody) return;
   
     try {
       await ensureCallerIsAdminOrThrow();
   
       // Stable field that all docs have
       const qSnap = await db.collection('employees').orderBy('email').get();
       console.debug('[employees] fetch count:', qSnap.size);
       console.debug('[employees] ids:', qSnap.docs.map(d => d.id));
   
       renderEmployeesFromDocs(qSnap.docs);
     } catch (err) {
       console.error('Error fetching employees:', err);
       alert('Failed to load employees. See console for details.');
     }
   }
   
   // Expose for manual testing / cross-file use
   window.fetchEmployees = fetchEmployees;
   
   // Also allow other scripts to request refresh
   document.addEventListener('employees:refresh', () => {
     fetchEmployees().catch(console.error);
   });
   
   /* =========================
      Optional realtime updates
      ========================= */
   const USE_REALTIME = true;
   let unsubscribe = null;
   
   async function startRealtimeEmployees() {
     if (!USE_REALTIME || !tableBody) return;
     try {
       await ensureCallerIsAdminOrThrow();
       if (unsubscribe) unsubscribe();
   
       const queryRef = db.collection('employees').orderBy('email');
       unsubscribe = queryRef.onSnapshot(
         (snap) => {
           console.debug('[employees] realtime count:', snap.size);
           renderEmployeesFromDocs(snap.docs);
         },
         (err) => console.error('[employees] realtime error:', err)
       );
     } catch (err) {
       console.warn('[employees] realtime disabled:', err?.message || err);
     }
   }
   
   /* =========================
      Save / Edit / Delete
      ========================= */
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
         await db.collection('employees').doc(employeeId).update(employeeData);
         alert('Employee updated.');
       } else {
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
   
   async function editEmployee(id) {
     try {
       const snap = await db.collection('employees').doc(id).get();
       if (!snap.exists) return alert('Employee not found.');
       const e = snap.data() || {};
   
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
   
   /* =========================
      Wire up UI
      ========================= */
   if (form) form.addEventListener('submit', saveEmployee);
   if (cancelButton) cancelButton.addEventListener('click', (e) => { e.preventDefault(); closeModal(); });
   if (addNewEmployeeBtn) addNewEmployeeBtn.addEventListener('click', () => openModal());
   if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
   
   // Close when clicking outside modal
   window.addEventListener('click', (evt) => { if (evt.target === modal) closeModal(); });
   
   // Auth gate → fetch (and optionally subscribe)
   auth.onAuthStateChanged((user) => {
     if (user) {
       fetchEmployees();
       startRealtimeEmployees();
     }
   });
   