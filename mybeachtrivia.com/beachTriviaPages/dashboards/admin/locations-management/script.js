// locations-management/script.js (Firebase v9 COMPAT APIs, no imports)
// Assumes firebase-app-compat.js, firebase-auth-compat.js, firebase-firestore-compat.js
// and firebase-init.js are loaded in index.html BEFORE this file.

const auth = firebase.auth();
const db   = firebase.firestore();

/////////////////////////
// Helpers
/////////////////////////
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function norm(v) {
  return String(v ?? '').toLowerCase().trim();
}

function cleanString(v) {
  const s = String(v ?? '').trim();
  return s.length ? s : '';
}

/////////////////////////
// DOM
/////////////////////////
const modal         = document.getElementById('locationModal');
const form          = document.getElementById('locationForm');
const tableBody     = document.getElementById('locationsTableBody');
const addBtn        = document.getElementById('addLocationBtn');
const cancelBtn     = document.getElementById('cancelEdit');
const closeModalBtn = document.querySelector('.close-modal');

const searchInput   = document.getElementById('locationSearch');
const countEl       = document.getElementById('locations-count');
const noResultsEl   = document.getElementById('locations-no-results');

const venueNameEl   = document.getElementById('venueName');
const venueNameLockHint = document.getElementById('venueNameLockHint');

/////////////////////////
// Modal helpers
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
  const idEl = document.getElementById('locationId');
  if (idEl) idEl.value = '';

  // reset name lock UI
  if (venueNameEl) {
    venueNameEl.disabled = false;
    venueNameEl.removeAttribute('aria-disabled');
  }
  if (venueNameLockHint) venueNameLockHint.style.display = 'none';
  const title = document.getElementById('locationModalTitle');
  if (title) title.textContent = 'New Venue';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal && modal.classList.contains('is-open')) closeModal();
});

if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeModal(); });
if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);

if (addBtn) addBtn.addEventListener('click', () => {
  closeModal(); // resets
  openModal();
  // focus
  try { venueNameEl?.focus(); } catch {}
});

/////////////////////////
// Data + rendering
/////////////////////////
let locationsCache = []; // [{id, ...data}]

function buildSearchIndex(loc) {
  return [
    loc.name,
    loc.contactName,
    loc.phone,
    loc.email,
    loc.notes,
    loc.schedule
  ].map(norm).join(' | ');
}

function applyFilter(list) {
  const q = norm(searchInput?.value || '');
  if (!q) return list;
  return list.filter((loc) => (loc._searchIndex || '').includes(q));
}

function setCounts(total, shown) {
  if (!countEl) return;
  if (total === shown) countEl.textContent = `${total} venue${total === 1 ? '' : 's'}`;
  else countEl.textContent = `${shown} of ${total} venue${total === 1 ? '' : 's'} shown`;
}

function renderTable() {
  if (!tableBody) return;

  const total = locationsCache.length;
  const filtered = applyFilter(locationsCache);

  setCounts(total, filtered.length);

  if (noResultsEl) {
    if (total > 0 && filtered.length === 0) {
      noResultsEl.style.display = 'block';
      noResultsEl.textContent = 'No venues match your search.';
    } else {
      noResultsEl.style.display = 'none';
      noResultsEl.textContent = '';
    }
  }

  tableBody.innerHTML = filtered.map((loc) => {
    const active = loc.active === true;

    return `
      <tr data-id="${esc(loc.id)}" data-search-index="${esc(loc._searchIndex)}">
        <td class="sticky-col col-venue"><strong>${esc(loc.name || '—')}</strong></td>

        <td class="col-contact">${esc(loc.contactName || '—')}</td>
        <td class="col-phone">${esc(loc.phone || '—')}</td>
        <td class="col-email">${loc.email ? `<a href="mailto:${esc(loc.email)}">${esc(loc.email)}</a>` : '—'}</td>
        <td class="col-schedule">${esc(loc.schedule || '—')}</td>
        <td class="col-notes">${esc(loc.notes || '—')}</td>

        <td class="sticky-col col-active">
          <span class="pill ${active ? 'pill-green' : 'pill-gray'}">${active ? 'Active' : 'Inactive'}</span>
        </td>

        <td class="sticky-col col-actions">
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm" data-action="edit">Edit</button>
            <button class="btn btn-ghost btn-sm" data-action="toggle">${active ? 'Disable' : 'Enable'}</button>
            <button class="btn btn-ghost btn-sm danger" data-action="delete">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

if (searchInput) {
  searchInput.addEventListener('input', () => renderTable());
}

/////////////////////////
// Firestore subscription
/////////////////////////
let unsubscribe = null;

function startLocationsListener() {
  if (unsubscribe) unsubscribe();

  unsubscribe = db.collection('locations')
    .orderBy('name')
    .onSnapshot((snap) => {
      const rows = [];
      snap.forEach((doc) => {
        const d = doc.data() || {};
        const loc = {
          id: doc.id,
          name: d.name || '',
          contactName: d.contactName || d.contact || '',
          phone: d.phone || '',
          email: d.email || '',
          notes: d.notes || '',
          schedule: d.schedule || '',
          active: d.active !== false, // default true
        };
        loc._searchIndex = buildSearchIndex(loc);
        rows.push(loc);
      });
      locationsCache = rows;
      renderTable();
    }, (err) => {
      console.error('Locations listener error:', err);
      alert('Failed to load locations (see console).');
    });
}

/////////////////////////
// Click handling (edit/toggle/delete)
/////////////////////////
async function editLocation(id) {
  const loc = locationsCache.find(x => x.id === id);
  if (!loc) return;

  const title = document.getElementById('locationModalTitle');
  if (title) title.textContent = 'Edit Venue';

  document.getElementById('locationId').value = id;

  // Fill form
  const setVal = (fieldId, v) => {
    const el = document.getElementById(fieldId);
    if (el) el.value = v ?? '';
  };

  setVal('venueName', loc.name || '');
  setVal('contactName', loc.contactName || '');
  setVal('phone', loc.phone || '');
  setVal('email', loc.email || '');
  setVal('schedule', loc.schedule || '');
  setVal('notes', loc.notes || '');
  setVal('active', loc.active === true ? 'true' : 'false');

  // Lock name on edit to avoid breaking older shifts that reference name strings
  if (venueNameEl) {
    venueNameEl.disabled = true;
    venueNameEl.setAttribute('aria-disabled', 'true');
  }
  if (venueNameLockHint) venueNameLockHint.style.display = 'block';

  openModal();
}

async function toggleActive(id) {
  const loc = locationsCache.find(x => x.id === id);
  if (!loc) return;
  const next = !(loc.active === true);
  try {
    await db.collection('locations').doc(id).update({ active: next });
  } catch (err) {
    console.error('Toggle active failed:', err);
    alert('Update failed (see console).');
  }
}

async function deleteLocation(id) {
  const loc = locationsCache.find(x => x.id === id);
  if (!loc) return;
  if (!confirm(`Delete venue "${loc.name}"?`)) return;

  try {
    await db.collection('locations').doc(id).delete();
  } catch (err) {
    console.error('Delete failed:', err);
    alert('Delete failed (see console).');
  }
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  const tr = btn.closest('tr[data-id]');
  const id = tr?.dataset?.id;
  const action = btn.dataset.action;

  if (!id) return;

  if (action === 'edit') editLocation(id);
  if (action === 'toggle') toggleActive(id);
  if (action === 'delete') deleteLocation(id);
});

/////////////////////////
// Save (create/update)
/////////////////////////
async function saveLocation(e) {
  e.preventDefault();

  const id = (document.getElementById('locationId')?.value || '').trim();

  const data = {
    name: cleanString(document.getElementById('venueName')?.value),
    contactName: cleanString(document.getElementById('contactName')?.value),
    phone: cleanString(document.getElementById('phone')?.value),
    email: cleanString(document.getElementById('email')?.value),
    schedule: cleanString(document.getElementById('schedule')?.value),
    notes: cleanString(document.getElementById('notes')?.value),
    active: (document.getElementById('active')?.value === 'true'),
  };

  if (!data.name && !id) {
    alert('Venue Name is required.');
    return;
  }

  try {
    if (id) {
      // On update: do NOT change name (we lock it in the UI)
      const { name, ...rest } = data;
      await db.collection('locations').doc(id).update(rest);
      alert('Venue updated.');
    } else {
      await db.collection('locations').add({
        ...data,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      alert('Venue created.');
    }
    closeModal();
  } catch (err) {
    console.error('Save failed:', err);
    alert('Save failed (see console).');
  }
}

if (form) form.addEventListener('submit', saveLocation);

/////////////////////////
// Start
/////////////////////////
auth.onAuthStateChanged((user) => {
  if (!user) return; // auth-guard will redirect
  startLocationsListener();
});
