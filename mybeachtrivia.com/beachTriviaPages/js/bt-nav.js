/**
 * bt-nav.js  –  Unified top navigation bar (Beach Trivia)
 *
 * • Injects a sticky nav bar at the very top of <body>.
 * • Reads the user's roles from sessionStorage (bt:empCache, set by login.js)
 *   and falls back to a Firebase auth + Firestore lookup if the cache is stale.
 * • If the user has multiple roles, shows a role-switcher dropdown in the nav.
 * • Selected role is persisted in sessionStorage/localStorage.
 * • Shows role-appropriate links and handles logout.
 * • Works on every page behind the login.
 * • Switching roles immediately redirects to that role's dashboard.
 *
 * Include in <head>:
 * <link rel="stylesheet" href="/beachTriviaPages/js/bt-nav.css">
 * <script src="/beachTriviaPages/js/bt-nav.js" defer></script>
 */

(function () {
  'use strict';

  // ─── Nav link definitions per role ──────────────────────────────────────────

  const NAV_LINKS = {
    admin: [
      { label: 'Dashboard',       href: '/beachTriviaPages/dashboards/admin/' },
      { label: 'Calendar',        href: '/beachTriviaPages/dashboards/admin/calendar/' },
      { label: 'Requests',        href: '/beachTriviaPages/dashboards/admin/requests/' },
      { label: 'Employees',       href: '/beachTriviaPages/dashboards/admin/employees-management/' },
      { label: 'Locations',       href: '/beachTriviaPages/dashboards/admin/locations-management/' },
      { label: 'Leads',           href: '/beachTriviaPages/dashboards/admin/leads/' },
      { label: 'Scores Database', href: '/beachTriviaPages/dashboards/admin/scores-database/' },
      { label: 'Venue Reports',   href: '/beachTriviaPages/dashboards/admin/venue-reports/' },
      { label: 'Music Bingo',     href: '/beachTriviaPages/dashboards/admin/music-bingo-generator/' },
    ],
    host: [
      { label: 'Dashboard',   href: '/beachTriviaPages/dashboards/host/' },
      { label: 'Calendar',    href: '/beachTriviaPages/dashboards/host/employee-calendar/' },
      { label: 'Time Off',    href: '/beachTriviaPages/dashboards/host/time-off/' },
      { label: 'Scoresheet',  href: '/beachTriviaPages/dashboards/host/scoresheet/' },
      { label: 'Host Event',  href: '/beachTriviaPages/dashboards/host/host-event/' },
    ],
    regional: [
      { label: 'Dashboard',   href: '/beachTriviaPages/dashboards/regional-manager/regional-manager.html' },
    ],
    supply: [
      { label: 'Dashboard',   href: '/beachTriviaPages/dashboards/supply-manager/supply-manager.html' },
    ],
    social: [
      { label: 'Dashboard',   href: '/beachTriviaPages/dashboards/social-media-manager/social-media-manager.html' },
    ],
    writer: [
      { label: 'Dashboard',   href: '/beachTriviaPages/dashboards/writer/writer.html' },
    ],
  };

  const ROLE_PRIORITY = ['admin', 'regional', 'supply', 'social', 'writer', 'host'];

  const ROLE_LABELS = {
    admin: 'Admin',
    host: 'Host',
    regional: 'Regional',
    supply: 'Supply',
    social: 'Social',
    writer: 'Writer',
  };

  const ACTIVE_ROLE_KEY = 'bt:activeRole';
  const SELECTED_ROLE_KEY = 'bt:selectedRole';
  const HOST_EVENT_HREF = '/beachTriviaPages/dashboards/host/host-event/';
  // Live-event consoles grouped under "Host Event" nav highlight (Scoresheet has its own nav link — omit).
  const HOST_EVENT_SECTION_PATH_PREFIXES = [
    '/beachTriviaPages/dashboards/host/host-music-bingo/',
    '/beachTriviaPages/dashboards/host/host-last-laugh/',
    '/beachTriviaPages/dashboards/host/host-funny-answers/',
    '/beachTriviaPages/dashboards/host/host-feud/',
    '/beachTriviaPages/dashboards/host/feud/',
  ];

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function normalizeRole(role) {
    return String(role || '').trim().toLowerCase();
  }

  function extractRoles(emp) {
    const data = emp || {};
    const arr = Array.isArray(data.roles) ? data.roles : [];
    const single = data.role ? [data.role] : [];
    return [...new Set([...arr, ...single].filter(Boolean).map(normalizeRole))];
  }

  function getCachedEmployee() {
    try {
      const raw = sessionStorage.getItem('bt:empCache');
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (Date.now() - (obj.ts || 0) > 4 * 60 * 60 * 1000) return null;
      return obj || null;
    } catch (_) {
      return null;
    }
  }

  function pickDefaultRole(roles) {
    if (!Array.isArray(roles) || roles.length === 0) return 'host';
    for (const r of ROLE_PRIORITY) {
      if (roles.includes(r)) return r;
    }
    return roles[0] || 'host';
  }

  function getPersistedRole(roles) {
    const list = Array.isArray(roles) ? roles : [];
    try {
      const selected = normalizeRole(localStorage.getItem(SELECTED_ROLE_KEY));
      if (selected && list.includes(selected)) return selected;
    } catch (_) {}
    try {
      const selected = normalizeRole(sessionStorage.getItem(SELECTED_ROLE_KEY));
      if (selected && list.includes(selected)) return selected;
    } catch (_) {}
    try {
      const active = normalizeRole(sessionStorage.getItem(ACTIVE_ROLE_KEY));
      if (active && list.includes(active)) return active;
    } catch (_) {}
    try {
      const active = normalizeRole(localStorage.getItem(ACTIVE_ROLE_KEY));
      if (active && list.includes(active)) return active;
    } catch (_) {}
    return '';
  }

  function getActiveRole(roles) {
    const persisted = getPersistedRole(roles);
    if (persisted) return persisted;
    return pickDefaultRole(roles);
  }

  function saveActiveRole(role) {
    const normalized = normalizeRole(role);
    if (!normalized) return;
    try { sessionStorage.setItem(ACTIVE_ROLE_KEY, normalized); } catch (_) {}
    try { localStorage.setItem(ACTIVE_ROLE_KEY, normalized); } catch (_) {}
    try { sessionStorage.setItem(SELECTED_ROLE_KEY, normalized); } catch (_) {}
    try { localStorage.setItem(SELECTED_ROLE_KEY, normalized); } catch (_) {}
  }

  function getDisplayName(emp) {
    if (!emp) return '';
    const first = String(emp.firstName || '').trim();
    const last = String(emp.lastName || '').trim();
    if (first || last) return [first, last].filter(Boolean).join(' ');
    return String(emp.displayName || emp.email || '').trim();
  }

  function normalizePath(path) {
    const value = String(path || '').trim();
    if (!value) return '/';
    if (value === '/') return '/';
    return value.replace(/\/+$/, '') || '/';
  }

  // Infer which role a given pathname belongs to by checking each role's nav links.
  // Returns the role string or null if the path doesn't match any role's section.
  function detectRoleFromPath(pathname) {
    const p = normalizePath(pathname);
    for (const role of ROLE_PRIORITY) {
      if (role === 'host') continue; // check host last — its Dashboard prefix is broad
      const links = NAV_LINKS[role] || [];
      for (const link of links) {
        if (!link.href) continue;
        const t = normalizePath(link.href);
        if (t !== '/' && (p === t || p.startsWith(t + '/'))) return role;
      }
    }
    // Host section (nav links + extra section prefixes)
    const hostLinks = NAV_LINKS.host || [];
    for (const link of hostLinks) {
      if (!link.href) continue;
      const t = normalizePath(link.href);
      if (t !== '/' && (p === t || p.startsWith(t + '/'))) return 'host';
    }
    for (const prefix of HOST_EVENT_SECTION_PATH_PREFIXES) {
      const t = normalizePath(prefix);
      if (p === t || p.startsWith(t + '/')) return 'host';
    }
    return null;
  }

  function isPathMatch(currentPath, href) {
    const current = normalizePath(currentPath);
    const target = normalizePath(href);

    if (target === '/') return current === '/';
    return current === target || current.startsWith(target + '/');
  }

  /** Same as isPathMatch but case-insensitive (handles /beachtriviaPages/ vs /beachTriviaPages/). */
  function isPathMatchInsensitive(currentPath, href) {
    const current = normalizePath(currentPath).toLowerCase();
    const target = normalizePath(href).toLowerCase();

    if (target === '/') return current === '/';
    return current === target || current.startsWith(target + '/');
  }

  function hostScoresheetHref() {
    const hostLinks = NAV_LINKS.host || [];
    const row = hostLinks.find(function (item) {
      return item && item.label === 'Scoresheet';
    });
    return (row && row.href) ? row.href : '/beachTriviaPages/dashboards/host/scoresheet/';
  }

  function getHostNavLinks() {
    return (NAV_LINKS.host || []).filter(function (item) {
      return item && item.label !== 'Music Bingo' && item.label !== 'Last Laugh';
    });
  }

  function mapHostEventSectionPath(pathname) {
    const current = normalizePath(pathname);
    const isHostEventSection = HOST_EVENT_SECTION_PATH_PREFIXES.some(function (prefix) {
      return current === normalizePath(prefix) || current.startsWith(normalizePath(prefix) + '/');
    });
    return isHostEventSection ? HOST_EVENT_HREF : pathname;
  }

  function markActiveLink(el) {
    if (!el) return;

    const pathname = window.location.pathname;
    const sheetHref = hostScoresheetHref();
    // Always highlight Scoresheet when URL is the scoresheet — never fold under Host Event.
    if (isPathMatchInsensitive(pathname, sheetHref)) {
      const sheetKey = normalizePath(sheetHref).toLowerCase();
      el.querySelectorAll('a.bt-nav__link').forEach(function (a) {
        a.classList.remove('active');
        const href = a.getAttribute('href') || '';
        if (normalizePath(href).toLowerCase() === sheetKey) {
          a.classList.add('active');
        }
      });
      return;
    }

    const path = mapHostEventSectionPath(pathname);
    const normalizedPath = normalizePath(path);
    const normalizedHostEventHref = normalizePath(HOST_EVENT_HREF);
    let bestLen = -1;
    let bestLink = null;
    let hostEventLink = null;

    el.querySelectorAll('a.bt-nav__link').forEach(function (a) {
      a.classList.remove('active');
      const href = a.getAttribute('href') || '';
      if (!href) return;
      const normalizedHref = normalizePath(href);

      if (normalizedHref === normalizedHostEventHref) {
        hostEventLink = a;
      }

      if (isPathMatch(path, href)) {
        // Force Host Event active on any mapped Host Event section path.
        const score = (normalizedPath === normalizedHostEventHref && normalizedHref === normalizedHostEventHref)
          ? Number.MAX_SAFE_INTEGER
          : normalizedHref.length;
        if (score > bestLen) {
          bestLen = score;
          bestLink = a;
        }
      }
    });

    if (normalizedPath === normalizedHostEventHref && hostEventLink) {
      hostEventLink.classList.add('active');
      return;
    }

    if (bestLink) bestLink.classList.add('active');
  }

  function getDashboardHrefForRole(role) {
    const normalized = normalizeRole(role);
    const links = normalized === 'host' ? getHostNavLinks() : (NAV_LINKS[normalized] || getHostNavLinks());
    return (links[0] && links[0].href) ? links[0].href : '/beachTriviaPages/dashboards/host/';
  }

  function isOnRoleDashboard(role) {
    const target = getDashboardHrefForRole(role);
    const current = mapHostEventSectionPath(window.location.pathname);
    return isPathMatch(current, target);
  }

  function closeDrawer() {
    const drawer = document.getElementById('bt-nav-drawer');
    const ham = document.querySelector('.bt-nav__hamburger');
    if (drawer) drawer.classList.remove('open');
    if (ham) {
      ham.classList.remove('open');
      ham.setAttribute('aria-expanded', 'false');
    }
  }

  function redirectToRoleDashboard(role) {
    const normalized = normalizeRole(role);
    const href = getDashboardHrefForRole(normalized);
    if (!href) return;

    if (isOnRoleDashboard(normalized)) {
      updateNavLinks(normalized === 'host' ? getHostNavLinks() : (NAV_LINKS[normalized] || getHostNavLinks()));
      return;
    }

    window.location.assign(href);
  }

  function handleRoleSwitch(newRole) {
    const normalized = normalizeRole(newRole);
    if (!normalized) return;

    saveActiveRole(normalized);
    updateNavLinks(normalized === 'host' ? getHostNavLinks() : (NAV_LINKS[normalized] || getHostNavLinks()));

    const drawerSel = document.getElementById('bt-nav-drawer-role-select');
    if (drawerSel && drawerSel.value !== normalized) drawerSel.value = normalized;

    const desktopSel = document.getElementById('bt-nav-role-select');
    if (desktopSel && desktopSel.value !== normalized) desktopSel.value = normalized;

    closeDrawer();
    redirectToRoleDashboard(normalized);
  }

  // ─── Link updater (role switcher change) ────────────────────────────────────

  function updateNavLinks(links) {
    const linksEl = document.getElementById('bt-nav-links');
    if (linksEl) {
      linksEl.innerHTML = '';
      links.forEach(function (item) {
        const a = document.createElement('a');
        a.className = 'bt-nav__link';
        a.href = item.href;
        a.textContent = item.label;
        linksEl.appendChild(a);
      });
      markActiveLink(linksEl);
    }

    const drawer = document.getElementById('bt-nav-drawer');
    if (drawer) {
      drawer.querySelectorAll('a.bt-nav__link').forEach(function (a) {
        a.remove();
      });

      const logoutBtn = drawer.querySelector('.bt-nav__drawer-logout');
      links.forEach(function (item) {
        const a = document.createElement('a');
        a.className = 'bt-nav__link';
        a.href = item.href;
        a.textContent = item.label;
        if (logoutBtn) {
          drawer.insertBefore(a, logoutBtn);
        } else {
          drawer.appendChild(a);
        }
      });

      drawer.querySelectorAll('a.bt-nav__link').forEach(function (a) {
        a.addEventListener('click', function () {
          closeDrawer();
        });
      });

      markActiveLink(drawer);
    }
  }

  // ─── DOM builder ────────────────────────────────────────────────────────────

  function buildNav(links, displayName, roles, activeRole) {
    const nav = document.createElement('nav');
    nav.id = 'bt-nav';
    nav.setAttribute('aria-label', 'Main navigation');

    const brand = document.createElement('a');
    brand.className = 'bt-nav__brand';
    brand.href = '/';
    brand.innerHTML = '<span class="bt-nav__brand-icon">🏖️</span> Beach Trivia';
    nav.appendChild(brand);

    const linksEl = document.createElement('div');
    linksEl.className = 'bt-nav__links';
    linksEl.id = 'bt-nav-links';
    links.forEach(function (item) {
      const a = document.createElement('a');
      a.className = 'bt-nav__link';
      a.href = item.href;
      a.textContent = item.label;
      linksEl.appendChild(a);
    });
    nav.appendChild(linksEl);

    const right = document.createElement('div');
    right.className = 'bt-nav__right';

    const sortedRoles = ROLE_PRIORITY.filter(function (r) {
      return roles.includes(r);
    });

    if (sortedRoles.length > 1) {
      const roleSelect = document.createElement('select');
      roleSelect.className = 'bt-nav__role-select';
      roleSelect.id = 'bt-nav-role-select';
      roleSelect.setAttribute('aria-label', 'Switch role');

      sortedRoles.forEach(function (r) {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = ROLE_LABELS[r] || r;
        if (r === activeRole) opt.selected = true;
        roleSelect.appendChild(opt);
      });

      roleSelect.addEventListener('change', function () {
        handleRoleSwitch(this.value);
      });

      right.appendChild(roleSelect);
    }

    const bellWrap = document.createElement('div');
    bellWrap.className = 'bt-nav__bell-wrap';

    const bellBtn = document.createElement('button');
    bellBtn.className = 'bt-nav__bell';
    bellBtn.id = 'bt-nav-bell';
    bellBtn.type = 'button';
    bellBtn.setAttribute('aria-label', 'Notifications');
    bellBtn.innerHTML = '<svg class="bt-nav__bell-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><span class="bt-nav__bell-count" id="bt-nav-bell-count" hidden style="display:none"></span>';

    const bellDropdown = document.createElement('div');
    bellDropdown.className = 'bt-nav__bell-dropdown';
    bellDropdown.id = 'bt-nav-bell-dropdown';
    bellDropdown.setAttribute('aria-hidden', 'true');
    bellDropdown.innerHTML = '<p class="bt-nav__bell-empty">No new notifications</p>';
    // Bell open/close + rendering is wired by the notifications module (initBellCount).

    bellWrap.appendChild(bellBtn);
    bellWrap.appendChild(bellDropdown);
    right.appendChild(bellWrap);

    const userSpan = document.createElement('span');
    userSpan.className = 'bt-nav__username';
    userSpan.id = 'bt-nav-username';
    userSpan.textContent = displayName || '';
    right.appendChild(userSpan);

    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'bt-nav__logout';
    logoutBtn.type = 'button';
    logoutBtn.textContent = 'Logout';
    logoutBtn.addEventListener('click', handleLogout);
    right.appendChild(logoutBtn);

    nav.appendChild(right);

    const ham = document.createElement('button');
    ham.className = 'bt-nav__hamburger';
    ham.type = 'button';
    ham.setAttribute('aria-label', 'Toggle navigation menu');
    ham.setAttribute('aria-expanded', 'false');
    ham.innerHTML = '<span></span><span></span><span></span>';
    nav.appendChild(ham);

    const drawer = document.createElement('div');
    drawer.className = 'bt-nav__drawer';
    drawer.id = 'bt-nav-drawer';

    if (displayName) {
      const drawerUser = document.createElement('div');
      drawerUser.className = 'bt-nav__drawer-user';
      drawerUser.id = 'bt-nav-drawer-username';
      drawerUser.textContent = displayName;
      drawer.appendChild(drawerUser);
    }

    if (sortedRoles.length > 1) {
      const drawerRoleSelect = document.createElement('select');
      drawerRoleSelect.className = 'bt-nav__drawer-role-select';
      drawerRoleSelect.id = 'bt-nav-drawer-role-select';
      drawerRoleSelect.setAttribute('aria-label', 'Switch role');

      sortedRoles.forEach(function (r) {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = ROLE_LABELS[r] || r;
        if (r === activeRole) opt.selected = true;
        drawerRoleSelect.appendChild(opt);
      });

      drawerRoleSelect.addEventListener('change', function () {
        handleRoleSwitch(this.value);
      });

      drawer.appendChild(drawerRoleSelect);
    }

    links.forEach(function (item) {
      const a = document.createElement('a');
      a.className = 'bt-nav__link';
      a.href = item.href;
      a.textContent = item.label;
      drawer.appendChild(a);
    });

    const drawerLogout = document.createElement('button');
    drawerLogout.className = 'bt-nav__drawer-logout';
    drawerLogout.type = 'button';
    drawerLogout.textContent = 'Logout';
    drawerLogout.addEventListener('click', handleLogout);
    drawer.appendChild(drawerLogout);

    ham.addEventListener('click', function () {
      const isOpen = drawer.classList.toggle('open');
      ham.classList.toggle('open', isOpen);
      ham.setAttribute('aria-expanded', String(isOpen));
    });

    drawer.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        closeDrawer();
      });
    });

    return { nav: nav, drawer: drawer };
  }

  // ─── Logout ─────────────────────────────────────────────────────────────────

  function handleLogout() {
    try { sessionStorage.removeItem('bt:empCache'); } catch (_) {}
    try { sessionStorage.removeItem(ACTIVE_ROLE_KEY); } catch (_) {}
    try { localStorage.removeItem(ACTIVE_ROLE_KEY); } catch (_) {}
    try { sessionStorage.removeItem(SELECTED_ROLE_KEY); } catch (_) {}
    try { localStorage.removeItem(SELECTED_ROLE_KEY); } catch (_) {}
    try { localStorage.removeItem('bt:bellSeenAtMs'); } catch (_) {}

    function doRedirect() {
      window.location.assign('/login.html');
    }

    try {
      const auth = window.firebase && window.firebase.auth ? window.firebase.auth() : null;
      if (auth && typeof auth.signOut === 'function') {
        auth.signOut().then(doRedirect).catch(doRedirect);
        return;
      }
    } catch (_) {}

    doRedirect();
  }

  // ─── Keep username fresh from Firebase ──────────────────────────────────────

  function updateUsernameFromAuth() {
    function tryUpdate() {
      if (!window.firebase || !window.firebase.auth || !window.firebase.apps || !window.firebase.apps.length) {
        setTimeout(tryUpdate, 100);
        return;
      }

      window.firebase.auth().onAuthStateChanged(function (user) {
        if (!user) return;

        const db = window.firebase.firestore ? window.firebase.firestore() : null;
        if (!db) return;

        db.collection('employees').doc(user.uid).get().then(function (snap) {
          if (!snap.exists) return;

          const emp = snap.data() || {};
          const roles = extractRoles(emp);
          // Prefer the role that owns the current page section over the persisted choice.
          const pathRole = detectRoleFromPath(window.location.pathname);
          const preferredRole = (pathRole && roles.includes(pathRole))
            ? pathRole
            : getActiveRole(roles);
          const name = getDisplayName(emp);

          try {
            sessionStorage.setItem('bt:empCache', JSON.stringify({
              uid: user.uid,
              emp: emp,
              ts: Date.now(),
            }));
          } catch (_) {}

          saveActiveRole(preferredRole);

          const u = document.getElementById('bt-nav-username');
          if (u && name) u.textContent = name;

          const du = document.getElementById('bt-nav-drawer-username');
          if (du && name) du.textContent = name;

          const sortedFreshRoles = ROLE_PRIORITY.filter(function (r) {
            return roles.includes(r);
          });

          let desktopSel = document.getElementById('bt-nav-role-select');
          if (sortedFreshRoles.length > 1) {
            if (!desktopSel) {
              desktopSel = document.createElement('select');
              desktopSel.className = 'bt-nav__role-select';
              desktopSel.id = 'bt-nav-role-select';
              desktopSel.setAttribute('aria-label', 'Switch role');
              sortedFreshRoles.forEach(function (r) {
                const opt = document.createElement('option');
                opt.value = r;
                opt.textContent = ROLE_LABELS[r] || r;
                if (r === preferredRole) opt.selected = true;
                desktopSel.appendChild(opt);
              });
              desktopSel.addEventListener('change', function () {
                handleRoleSwitch(this.value);
              });
              const right = document.querySelector('#bt-nav .bt-nav__right');
              const bellWrap = right && right.querySelector('.bt-nav__bell-wrap');
              if (right) right.insertBefore(desktopSel, bellWrap || right.firstChild);
            } else if (roles.includes(preferredRole)) {
              desktopSel.value = preferredRole;
            }
          }

          let drawerSel = document.getElementById('bt-nav-drawer-role-select');
          const drawer = document.getElementById('bt-nav-drawer');
          if (sortedFreshRoles.length > 1) {
            if (!drawerSel && drawer) {
              drawerSel = document.createElement('select');
              drawerSel.className = 'bt-nav__drawer-role-select';
              drawerSel.id = 'bt-nav-drawer-role-select';
              drawerSel.setAttribute('aria-label', 'Switch role');
              sortedFreshRoles.forEach(function (r) {
                const opt = document.createElement('option');
                opt.value = r;
                opt.textContent = ROLE_LABELS[r] || r;
                if (r === preferredRole) opt.selected = true;
                drawerSel.appendChild(opt);
              });
              drawerSel.addEventListener('change', function () {
                handleRoleSwitch(this.value);
              });
              const drawerUser = drawer.querySelector('.bt-nav__drawer-user');
              drawer.insertBefore(drawerSel, drawerUser ? drawerUser.nextSibling : drawer.firstChild);
            } else if (drawerSel && roles.includes(preferredRole)) {
              drawerSel.value = preferredRole;
            }
          }

          updateNavLinks(preferredRole === 'host' ? getHostNavLinks() : (NAV_LINKS[preferredRole] || getHostNavLinks()));
        }).catch(function () {});
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryUpdate);
    } else {
      setTimeout(tryUpdate, 150);
    }
  }

  // ─── Notifications bell ──────────────────────────────────────────────────────
  //
  // Single source of truth: the `notifications` collection, one doc per
  // recipient, written server-side by functions_gcfv1/notifications.js.
  //   notifications/{id}: { recipientId, type, title, body, link, data,
  //                         createdAt, readAt }
  // Badge = count of own docs with readAt == null. Opening the bell marks the
  // visible unread ones read. No client ever reads shiftCoverageRequests /
  // shiftSwapNotifications / hostNotifications for the bell.

  var _ntfUnsub = null;
  var _ntfItems = [];
  var _ntfUid = null;
  var _ntfDropdownEl = null;
  var _ntfBtnEl = null;
  var _ntfWired = false;
  var _ntfOpen = false;       // dropdown open state (source of truth, not the DOM attr)
  var _ntfPinnedUnread = null; // ids unread at the moment the dropdown opened

  var NTF_COLLECTION = 'notifications';

  var NTF_LABELS = {
    shift_offer_open: 'Shift Offer',
    shift_offer_direct: 'Direct Switch',
    shift_offer_claimed: 'Offer Claimed',
    shift_offer_cancelled: 'Offer Cancelled',
    shift_offer_uncovered: 'Uncovered Shift',
    swap_pending_admin: 'Swap — Needs Approval',
    swap_approved: 'Swap Approved',
    swap_rejected: 'Swap Rejected',
    shift_assigned: 'Shift Assigned',
    shift_removed: 'Shift Removed',
    shift_reassigned: 'Shift Reassigned',
    timeoff_submitted: 'Time Off — Needs Review',
    timeoff_approved: 'Time Off Approved',
    timeoff_denied: 'Time Off Denied',
    timeoff_conflict: 'Time Off Conflict',
    offer_digest: 'Uncovered Shifts'
  };

  function _ntfDb() {
    return (window.firebase && window.firebase.firestore) ? window.firebase.firestore() : null;
  }

  function _ntfEsc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _ntfToMillis(ts) {
    if (!ts) return 0;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts.toDate === 'function') {
      var d = ts.toDate();
      return d && !isNaN(d.getTime()) ? d.getTime() : 0;
    }
    var p = new Date(ts);
    return isNaN(p.getTime()) ? 0 : p.getTime();
  }

  function _ntfWhen(ts) {
    var ms = _ntfToMillis(ts);
    if (!ms) return '';
    var diff = Date.now() - ms;
    var min = Math.round(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return min + 'm ago';
    var hr = Math.round(min / 60);
    if (hr < 24) return hr + 'h ago';
    var day = Math.round(hr / 24);
    if (day < 7) return day + 'd ago';
    var d = new Date(ms);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function _ntfLabel(type) {
    return NTF_LABELS[type] || 'Notification';
  }

  function _ntfIsOpen() {
    return _ntfOpen;
  }

  function _ntfUnreadCount() {
    return _ntfItems.reduce(function (c, n) { return c + (n.readAt ? 0 : 1); }, 0);
  }

  function _ntfUpdateBadge() {
    var countEl = document.getElementById('bt-nav-bell-count');
    if (!countEl) return;
    var n = _ntfUnreadCount();
    if (n > 0) {
      countEl.textContent = n > 99 ? '99+' : String(n);
      countEl.hidden = false;
      countEl.style.display = '';
    } else {
      countEl.textContent = '';
      countEl.hidden = true;
      countEl.style.display = 'none';
    }
  }

  function _ntfRender() {
    var el = _ntfDropdownEl || document.getElementById('bt-nav-bell-dropdown');
    if (!el) return;

    if (!_ntfItems.length) {
      el.innerHTML = '<p class="bt-nav__bell-empty">No notifications</p>';
      return;
    }

    var pinned = _ntfPinnedUnread;
    var anyUnread = _ntfItems.some(function (n) { return !n.readAt; });

    var html = '';
    if (anyUnread) {
      html += '<button class="bt-nav__bell-mark-read" id="bt-nav-bell-mark-read" type="button">Mark all read</button>';
    }
    html += '<ul class="bt-nav__bell-list">';

    _ntfItems.forEach(function (n) {
      var showNew = pinned ? (pinned.indexOf(n.id) !== -1) : !n.readAt;
      var when = _ntfWhen(n.createdAt);
      var open = n.link ? ('<a class="bt-nav__bell-item-open" href="' + _ntfEsc(n.link) + '">') : '<div class="bt-nav__bell-item-open">';
      var close = n.link ? '</a>' : '</div>';

      html += '<li class="bt-nav__bell-item' + (showNew ? ' bt-nav__bell-item--new' : '') + '" data-ntf-id="' + _ntfEsc(n.id) + '">' +
        open +
          '<div class="bt-nav__bell-item-header">' +
            '<span class="bt-nav__bell-item-label">' + _ntfEsc(_ntfLabel(n.type)) + '</span>' +
            (showNew ? '<span class="bt-nav__bell-item-unseen-dot" aria-hidden="true"></span>' : '') +
          '</div>' +
          (n.title ? '<span class="bt-nav__bell-item-venue">' + _ntfEsc(n.title) + '</span>' : '') +
          (n.body ? '<span class="bt-nav__bell-item-body">' + _ntfEsc(n.body) + '</span>' : '') +
          (when ? '<span class="bt-nav__bell-item-when">' + _ntfEsc(when) + '</span>' : '') +
          (n.link ? '<span class="bt-nav__bell-item-link">View →</span>' : '') +
        close +
      '</li>';
    });

    html += '</ul>';
    el.innerHTML = html;

    var markBtn = el.querySelector('#bt-nav-bell-mark-read');
    if (markBtn) {
      markBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        _ntfMarkAllRead();
        _ntfPinnedUnread = [];
        _ntfRender();
      });
    }

    // Clicking an item marks just that one read before navigating.
    el.querySelectorAll('.bt-nav__bell-item-open').forEach(function (a) {
      a.addEventListener('click', function () {
        var li = a.closest('.bt-nav__bell-item');
        var id = li && li.getAttribute('data-ntf-id');
        if (id) _ntfMarkRead([id]);
      });
    });
  }

  function _ntfMarkRead(ids) {
    var db = _ntfDb();
    if (!db || !ids || !ids.length) return;
    var now = window.firebase.firestore.FieldValue.serverTimestamp();
    var localMs = Date.now();
    var batch = db.batch();
    var touched = 0;

    ids.forEach(function (id) {
      var item = _ntfItems.find(function (n) { return n.id === id; });
      if (!item || item.readAt) return;
      item.readAt = { toMillis: function () { return localMs; } }; // optimistic
      batch.update(db.collection(NTF_COLLECTION).doc(id), { readAt: now });
      touched++;
    });

    _ntfUpdateBadge();
    if (touched) {
      batch.commit().catch(function (err) {
        console.error('[BtNotif] markRead failed:', err);
      });
    }
  }

  function _ntfMarkAllRead() {
    _ntfMarkRead(_ntfItems.filter(function (n) { return !n.readAt; }).map(function (n) { return n.id; }));
  }

  function _ntfStart(uid) {
    var db = _ntfDb();
    if (!db || !uid) return;
    _ntfUid = uid;

    if (_ntfUnsub) { try { _ntfUnsub(); } catch (_) {} _ntfUnsub = null; }

    _ntfUnsub = db.collection(NTF_COLLECTION)
      .where('recipientId', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(30)
      .onSnapshot(function (snap) {
        _ntfItems = snap.docs.map(function (d) {
          return Object.assign({ id: d.id }, d.data());
        });
        _ntfUpdateBadge();
        if (_ntfIsOpen()) _ntfRender();
      }, function (err) {
        console.error('[BtNotif] listener failed:', err);
      });
  }

  function _ntfStopListener() {
    if (_ntfUnsub) { try { _ntfUnsub(); } catch (_) {} _ntfUnsub = null; }
  }

  function _ntfReset() {
    _ntfStopListener();
    _ntfItems = [];
    _ntfUid = null;
    _ntfOpen = false;
    _ntfPinnedUnread = null;
    var dd = _ntfDropdownEl || document.getElementById('bt-nav-bell-dropdown');
    if (dd) dd.setAttribute('aria-hidden', 'true');
    _ntfUpdateBadge();
  }

  // Single source of truth for the dropdown's open/closed state, so a stray
  // document click or a double-fired button click can't desync it.
  function _ntfSetOpen(open) {
    var dd = _ntfDropdownEl || document.getElementById('bt-nav-bell-dropdown');
    _ntfOpen = !!open;
    if (dd) dd.setAttribute('aria-hidden', _ntfOpen ? 'false' : 'true');
    if (_ntfOpen) {
      // Pin which items were unread at open time so their highlight stays put
      // while you read; opening also marks them read (badge clears).
      _ntfPinnedUnread = _ntfItems.filter(function (n) { return !n.readAt; }).map(function (n) { return n.id; });
      _ntfRender();
      _ntfMarkAllRead();
    } else {
      _ntfPinnedUnread = null;
    }
  }

  function _ntfWire() {
    if (_ntfWired) return;
    var btn = document.getElementById('bt-nav-bell');
    var dd = document.getElementById('bt-nav-bell-dropdown');
    if (!btn || !dd) return;
    _ntfWired = true;
    _ntfBtnEl = btn;
    _ntfDropdownEl = dd;

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      _ntfSetOpen(!_ntfOpen);
    });

    document.addEventListener('click', function () {
      if (_ntfOpen) _ntfSetOpen(false);
    });

    dd.addEventListener('click', function (e) { e.stopPropagation(); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && _ntfOpen) _ntfSetOpen(false);
    });
  }

  // Named initBellCount so the injectNav() call site is unchanged.
  function initBellCount() {
    _ntfWire();

    function tryInit() {
      if (!window.firebase || !window.firebase.auth || !window.firebase.apps || !window.firebase.apps.length) {
        setTimeout(tryInit, 100);
        return;
      }
      window.firebase.auth().onAuthStateChanged(function (user) {
        _ntfReset();
        if (user) _ntfStart(user.uid);
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryInit);
    } else {
      setTimeout(tryInit, 0);
    }
  }

  // Pause the listener while the tab is hidden to reduce idle reads.
  if (document && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        _ntfStopListener();
      } else if (_ntfUid) {
        _ntfStart(_ntfUid);
      }
    });
  }

  // Back-compat shim. Old callers (shift-trade-requests.js, shift-swap-admin.js)
  // fed the bell directly; the bell is now server-driven, so these are no-ops
  // beyond a re-render.
  window.BtNavBell = {
    refresh: function () { _ntfUpdateBadge(); if (_ntfIsOpen()) _ntfRender(); },
    claimOffersListener: function () {},
    setOffersData: function () {},
    markAllRead: _ntfMarkAllRead
  };

  // ─── Inject ─────────────────────────────────────────────────────────────────

  function injectNav() {
    if (document.getElementById('bt-nav')) return;

    if (!document.getElementById('bt-nav-inter-font')) {
      var interLink = document.createElement('link');
      interLink.id = 'bt-nav-inter-font';
      interLink.rel = 'stylesheet';
      interLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
      document.head.appendChild(interLink);
    }

    const cached = getCachedEmployee();
    const emp = cached ? (cached.emp || {}) : {};
    const roles = extractRoles(emp);

    // Prefer the current page's role section so the nav matches the page you're on.
    // Only fall back to persisted/default when the path doesn't map to a known section.
    const pathRole = detectRoleFromPath(window.location.pathname);
    const activeRole = (pathRole && (roles.length === 0 || roles.includes(pathRole)))
      ? pathRole
      : getActiveRole(roles);
    const links = activeRole === 'host' ? getHostNavLinks() : (NAV_LINKS[activeRole] || getHostNavLinks());
    const displayName = getDisplayName(emp);

    // Only persist the role when we have real role data from cache.
    // On a cold cache (roles=[]), saving would overwrite a valid persisted role with 'host'.
    if (roles.length > 0) saveActiveRole(activeRole);

    const built = buildNav(links, displayName, roles, activeRole);
    const nav = built.nav;
    const drawer = built.drawer;

    document.body.insertBefore(nav, document.body.firstChild);
    document.body.insertBefore(drawer, nav.nextSibling);
    document.body.classList.add('bt-nav-active');

    markActiveLink(nav);
    markActiveLink(drawer);

    updateUsernameFromAuth();
    initBellCount();
  }

  if (window.self !== window.top) return;

  if (document.body) {
    injectNav();
  } else {
    document.addEventListener('DOMContentLoaded', injectNav);
  }

  // ─── Auto-hide scrollbar ─────────────────────────────────────────────────

  (function () {
    var _scrollFadeTimer = null;
    window.addEventListener('scroll', function () {
      document.documentElement.classList.add('bt-is-scrolling');
      clearTimeout(_scrollFadeTimer);
      _scrollFadeTimer = setTimeout(function () {
        document.documentElement.classList.remove('bt-is-scrolling');
      }, 1000);
    }, { passive: true });
  }());
})();