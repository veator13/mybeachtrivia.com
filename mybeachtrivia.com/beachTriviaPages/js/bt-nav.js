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
      { label: 'Employees',       href: '/beachTriviaPages/dashboards/admin/employees-management/' },
      { label: 'Locations',       href: '/beachTriviaPages/dashboards/admin/locations-management/' },
      { label: 'Scores Database', href: '/beachTriviaPages/dashboards/admin/scores-database/' },
      { label: 'Music Bingo',     href: '/beachTriviaPages/dashboards/admin/music-bingo-generator/' },
    ],
    host: [
      { label: 'Dashboard',   href: '/beachTriviaPages/dashboards/host/' },
      { label: 'Calendar',    href: '/beachTriviaPages/dashboards/host/employee-calendar/' },
      { label: 'Scoresheet',  href: '/beachTriviaPages/dashboards/host/scoresheet/' },
      { label: 'Host Event',  href: '/beachTriviaPages/dashboards/host/host-event/' },
      { label: 'Music Bingo',    href: '/beachTriviaPages/dashboards/host/host-music-bingo/host-music-bingo' },
      { label: 'Last Laugh', href: '/beachTriviaPages/dashboards/host/host-last-laugh/' },
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

  function isPathMatch(currentPath, href) {
    const current = normalizePath(currentPath);
    const target = normalizePath(href);

    if (target === '/') return current === '/';
    return current === target || current.startsWith(target + '/');
  }

  function markActiveLink(el) {
    if (!el) return;

    const path = window.location.pathname;
    let bestLen = -1;
    let bestLink = null;

    el.querySelectorAll('a.bt-nav__link').forEach(function (a) {
      a.classList.remove('active');
      const href = a.getAttribute('href') || '';
      if (!href) return;

      if (isPathMatch(path, href)) {
        const score = normalizePath(href).length;
        if (score > bestLen) {
          bestLen = score;
          bestLink = a;
        }
      }
    });

    if (bestLink) bestLink.classList.add('active');
  }

  function getDashboardHrefForRole(role) {
    const normalized = normalizeRole(role);
    const links = NAV_LINKS[normalized] || NAV_LINKS.host;
    return (links[0] && links[0].href) ? links[0].href : '/beachTriviaPages/dashboards/host/';
  }

  function isOnRoleDashboard(role) {
    const target = getDashboardHrefForRole(role);
    const current = window.location.pathname;
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
      updateNavLinks(NAV_LINKS[normalized] || NAV_LINKS.host);
      return;
    }

    window.location.assign(href);
  }

  function handleRoleSwitch(newRole) {
    const normalized = normalizeRole(newRole);
    if (!normalized) return;

    saveActiveRole(normalized);
    updateNavLinks(NAV_LINKS[normalized] || NAV_LINKS.host);

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
    _bellDropdownEl = bellDropdown;

    bellBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = bellDropdown.getAttribute('aria-hidden') === 'false';
      bellDropdown.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
      if (!isOpen) {
        bellDropdown.innerHTML = '<p class="bt-nav__bell-empty">Loading notifications…</p>';
        _bellRenderDropdown();
        _bellLoadLatestItems();
        document.dispatchEvent(new CustomEvent('bt:bell-open'));
        // Clear the red badge immediately when opening the dropdown.
        // We suppress dropdown rerender so any existing "unseen" indicators
        // remain stable for this open moment.
        markBellSeen({ rerender: false });
      } else {
        markBellSeen();
      }
    });

    document.addEventListener('click', function () {
      var wasOpen = bellDropdown.getAttribute('aria-hidden') === 'false';
      bellDropdown.setAttribute('aria-hidden', 'true');
      if (wasOpen) markBellSeen();
    });

    bellDropdown.addEventListener('click', function (e) {
      e.stopPropagation();
    });

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
          const preferredRole = getActiveRole(roles);
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

          const desktopSel = document.getElementById('bt-nav-role-select');
          if (desktopSel && roles.includes(preferredRole)) {
            desktopSel.value = preferredRole;
          }

          const drawerSel = document.getElementById('bt-nav-drawer-role-select');
          if (drawerSel && roles.includes(preferredRole)) {
            drawerSel.value = preferredRole;
          }

          updateNavLinks(NAV_LINKS[preferredRole] || NAV_LINKS.host);
        }).catch(function () {});
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryUpdate);
    } else {
      setTimeout(tryUpdate, 150);
    }
  }

  // ─── Bell Count ──────────────────────────────────────────────────────────────

  var _bellUnsubOffers = null;
  var _bellUnsubDeletedOffers = null;
  var _bellUnsubAdminOffers = null;
  var _bellUnsubHostAssignments = null;
  var _bellUnsubState = null;
  var _bellLastSeenMs = 0;
  var _bellStateLoaded = false;
  var _bellOffersData = [];
  var _bellDeletedOffersData = [];
  var _bellAdminData = [];
  var _bellHostAssignmentsData = [];
  var _bellCurrentUid = null;
  var _bellDropdownEl = null;
  var _bellUserRoles = [];
  var _bellOlderData = [];
  var _bellOlderLoaded = false;
  var _offersListenerClaimed = false;
  var _bellSeenStorageKey = 'bt:bellSeenAtMs';
  var _bellHostNotificationsCollection = 'hostNotifications';
  var _bellLastKnownUid = null;
  var _bellUnreadCount = 0;
  var _bellOpenSeenMs = null; // pinned _bellLastSeenMs at the moment the dropdown opens

  function _bellFormatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function _bellToMillis(ts) {
    if (!ts) return 0;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts.toDate === 'function') {
      var d = ts.toDate();
      return d && !isNaN(d.getTime()) ? d.getTime() : 0;
    }
    var parsed = new Date(ts);
    return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }

  function _bellGetLocalSeenMs() {
    try {
      return Number(localStorage.getItem(_bellSeenStorageKey) || 0) || 0;
    } catch (_) {
      return 0;
    }
  }

  function _bellSetLocalSeenMs(ms) {
    try {
      localStorage.setItem(_bellSeenStorageKey, String(Number(ms) || 0));
    } catch (_) {}
  }

  function _bellResolveSeenMsFromStateDoc(snap) {
    if (!snap || !snap.exists) return _bellGetLocalSeenMs();

    var data = snap.data() || {};
    var fromNumber = Number(data.lastSeenAtMs || 0) || 0;
    var fromTimestamp = data.lastSeenAt && typeof data.lastSeenAt.toMillis === 'function'
      ? data.lastSeenAt.toMillis()
      : 0;
    var fromLocal = _bellGetLocalSeenMs();

    return Math.max(fromNumber, fromTimestamp, fromLocal);
  }

  function _bellResolveUnreadCountFromStateDoc(snap) {
    if (!snap || !snap.exists) return 0;
    var data = snap.data() || {};
    return Math.max(0, Number(data.unreadCount || 0) || 0);
  }

  function _bellNormalizeAssignmentType(data) {
    var explicitType = String(data.type || data._notifType || '').toLowerCase();
    if (explicitType === 'shift_removed') return 'shift_removed';
    if (explicitType === 'shift_reassigned') return 'shift_reassigned';
    if (explicitType === 'shift_assigned') return 'shift_assigned';

    var status = String(data.assignmentStatus || data.status || '').toLowerCase();
    if (status === 'shift_deleted' || status === 'deleted' || status === 'removed' || status === 'shift_removed') {
      return 'shift_removed';
    }
    if (status === 'reassigned' || status === 'shift_reassigned') {
      return 'shift_reassigned';
    }
    return 'shift_assigned';
  }

  function _bellBuildHtml(items) {
    var filtered = items.filter(function (data) {
      if (
        data._notifType === 'coverage' ||
        data._notifType === 'coverage_deleted' ||
        data._notifType === 'coverage_cancelled' ||
        data._notifType === 'coverage_filled'
      ) {
        return data.requestingHostId !== _bellCurrentUid;
      }
      if (
        data._notifType === 'shift_assigned' ||
        data._notifType === 'shift_removed' ||
        data._notifType === 'shift_reassigned'
      ) {
        return data.targetHostId === _bellCurrentUid;
      }
      return true;
    });

    filtered = filtered.slice().sort(function (a, b) {
      return _bellToMillis(b.createdAt) - _bellToMillis(a.createdAt);
    });

    if (!filtered.length) return '<p class="bt-nav__bell-empty">No notifications</p>';

    var html = '<ul class="bt-nav__bell-list">';
    filtered.forEach(function (data) {
      var isDeleted = data._notifType === 'coverage_deleted';
      var isCancelled = data._notifType === 'coverage_cancelled';
      var isFilled = data._notifType === 'coverage_filled';

      var isAssigned = data._notifType === 'shift_assigned';
      var isRemoved = data._notifType === 'shift_removed';
      var isReassigned = data._notifType === 'shift_reassigned';

      var label = data._notifType === 'swap'
        ? 'Swap Request'
        : (isAssigned || isRemoved || isReassigned)
          ? 'Shift Assigned'
          : 'Coverage Request';

      var calLink = data._notifType === 'swap'
        ? '/beachTriviaPages/dashboards/admin/calendar/'
        : '/beachTriviaPages/dashboards/host/employee-calendar/';

      var venue = data.venueName || data.locationName || data.venue || data.location || 'Open Shift';
      var date = _bellFormatDate(data.date || data.shiftDate || '');
      var time = data.time || data.startTime || data.shiftTime || '';
      var createdMs = _bellToMillis(data.createdAt);
      var seenCutoff = _bellOpenSeenMs !== null ? _bellOpenSeenMs : _bellLastSeenMs;
      var isNew = createdMs > seenCutoff;
      var unseenDot = isNew ? '<span class="bt-nav__bell-item-unseen-dot" aria-hidden="true"></span>' : '';

      if (isDeleted || isCancelled || isFilled) {
        var resolvedBadge = isDeleted
          ? '<span class="bt-nav__bell-item-deleted-badge">SHIFT DELETED</span>'
          : isCancelled
            ? '<span class="bt-nav__bell-item-cancelled-badge">REQUEST CANCELLED</span>'
            : '<span class="bt-nav__bell-item-filled-badge">REQUEST FILLED</span>';

        var resolvedClass = isFilled
          ? ' bt-nav__bell-item--filled'
          : ' bt-nav__bell-item--deleted';

        html += '<li class="bt-nav__bell-item' + resolvedClass + '">' +
          '<div class="bt-nav__bell-item-header">' +
            unseenDot +
            '<span class="bt-nav__bell-item-label">' + label + '</span>' +
            resolvedBadge +
          '</div>' +
          '<span class="bt-nav__bell-item-venue">' + venue + '</span>' +
          (date ? '<span class="bt-nav__bell-item-date">' + date + (time ? ' · ' + time : '') + '</span>' : '') +
          '</li>';
        return;
      }

      if (isRemoved || isReassigned) {
        var assignmentResolvedBadge = isRemoved
          ? '<span class="bt-nav__bell-item-deleted-badge">SHIFT REMOVED</span>'
          : '<span class="bt-nav__bell-item-cancelled-badge">SHIFT REASSIGNED</span>';
        var assignmentLabel = isRemoved ? 'Shift Removed' : 'Shift Reassigned';

        html += '<li class="bt-nav__bell-item bt-nav__bell-item--deleted">' +
          '<div class="bt-nav__bell-item-header">' +
            unseenDot +
            '<span class="bt-nav__bell-item-label">' + assignmentLabel + '</span>' +
            assignmentResolvedBadge +
          '</div>' +
          '<span class="bt-nav__bell-item-venue">' + venue + '</span>' +
          (date ? '<span class="bt-nav__bell-item-date">' + date + (time ? ' · ' + time : '') + '</span>' : '') +
          '<a class="bt-nav__bell-item-link" href="' + calLink + '">View Calendar →</a>' +
          '</li>';
        return;
      }

      if (isAssigned) {
        html += '<li class="bt-nav__bell-item' + (isNew ? ' bt-nav__bell-item--new' : '') + '">' +
          '<div class="bt-nav__bell-item-header">' +
            unseenDot +
            '<span class="bt-nav__bell-item-label">Shift Assigned</span>' +
            (isNew
              ? '<span class="bt-nav__bell-item-new-badge">NEW</span>'
              : '<span class="bt-nav__bell-item-filled-badge">SHIFT ASSIGNED</span>') +
          '</div>' +
          '<span class="bt-nav__bell-item-venue">' + venue + '</span>' +
          (date ? '<span class="bt-nav__bell-item-date">' + date + (time ? ' · ' + time : '') + '</span>' : '') +
          '<a class="bt-nav__bell-item-link" href="' + calLink + '">View Calendar →</a>' +
          '</li>';
        return;
      }

      html += '<li class="bt-nav__bell-item' + (isNew ? ' bt-nav__bell-item--new' : '') + '">' +
        '<div class="bt-nav__bell-item-header">' +
          unseenDot +
          '<span class="bt-nav__bell-item-label">' + label + '</span>' +
          (isNew ? '<span class="bt-nav__bell-item-new-badge">NEW</span>' : '') +
        '</div>' +
        '<span class="bt-nav__bell-item-venue">' + venue + '</span>' +
        (date ? '<span class="bt-nav__bell-item-date">' + date + (time ? ' · ' + time : '') + '</span>' : '') +
        '<a class="bt-nav__bell-item-link" href="' + calLink + '">View Calendar →</a>' +
        '</li>';
    });
    html += '</ul>';

    if (!_bellOlderLoaded) {
      html += '<button class="bt-nav__bell-load-more" id="bt-nav-bell-load-older" type="button">Load older notifications</button>';
    }

    return html;
  }

  function _bellIsDropdownOpen() {
    var el = _bellDropdownEl || document.getElementById('bt-nav-bell-dropdown');
    return el ? el.getAttribute('aria-hidden') === 'false' : false;
  }

  function _bellRenderDropdown() {
    var el = _bellDropdownEl || document.getElementById('bt-nav-bell-dropdown');
    if (!el) return;

    el.innerHTML = _bellBuildHtml(
      _bellOffersData
        .concat(_bellAdminData)
        .concat(_bellHostAssignmentsData)
        .concat(_bellOlderData)
        .concat(_bellDeletedOffersData)
    );

    // If the user clicks a notification's "View Calendar" link, mark as seen
    // before navigation. (We stop propagation elsewhere, so markBellSeen()
    // wouldn't otherwise run on outside-click.)
    if (!el.dataset.btBellLinkSeenWired) {
      el.dataset.btBellLinkSeenWired = "1";
      el.addEventListener('click', function (e) {
        var link = e.target && e.target.closest ? e.target.closest('a.bt-nav__bell-item-link') : null;
        if (!link) return;
        try { el.setAttribute('aria-hidden', 'true'); } catch (_) {}
        markBellSeen();
      });
    }

    var loadOlderBtn = el.querySelector('#bt-nav-bell-load-older');
    if (loadOlderBtn) {
      loadOlderBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        _bellFetchOlderItems();
      });
    }
  }

  function _bellLoadLatestItems() {
    if (!_bellCurrentUid || !window.firebase || !window.firebase.firestore) return Promise.resolve();
    var db = window.firebase.firestore();
    var thirtyDaysAgo = window.firebase.firestore.Timestamp.fromDate(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );
    var isHost = _bellUserRoles.indexOf('host') !== -1 || _bellUserRoles.indexOf('admin') === -1;
    var isAdmin = _bellUserRoles.indexOf('admin') !== -1;

    var tasks = [];
    if (isHost) {
      tasks.push(
        db.collection(_bellHostNotificationsCollection)
          .where('targetHostId', '==', _bellCurrentUid)
          .where('createdAt', '>=', thirtyDaysAgo)
          .orderBy('createdAt', 'desc')
          .limit(50)
          .get()
          .then(function (snap) {
            _bellHostAssignmentsData = _bellMapHostAssignmentDocs(snap.docs);
          })
      );
    } else {
      _bellHostAssignmentsData = [];
    }

    if (isAdmin) {
      tasks.push(
        db.collection('shiftSwapNotifications')
          .where('status', '==', 'pending_review')
          .where('createdAt', '>=', thirtyDaysAgo)
          .orderBy('createdAt', 'desc')
          .limit(50)
          .get()
          .then(function (snap) {
            _bellAdminData = snap.docs.map(function (d) {
              return Object.assign({}, d.data(), { _notifType: 'swap' });
            });
          })
      );
    } else {
      _bellAdminData = [];
    }

    return Promise.all(tasks).then(function () {
      if (_bellIsDropdownOpen()) _bellRenderDropdown();
    }).catch(function (err) {
      console.error('[BtNav] load latest bell items failed:', err);
      if (_bellIsDropdownOpen()) _bellRenderDropdown();
    });
  }

  function _bellUpdateBadge() {
    var counterDocCount = Math.max(0, Number(_bellUnreadCount || 0) || 0);
    var liveFallbackCount = 0;

    _bellHostAssignmentsData.forEach(function (data) {
      var createdMs = _bellToMillis(data.createdAt);
      if (
        createdMs > _bellLastSeenMs &&
        data.targetHostId === _bellCurrentUid &&
        (
          data._notifType === 'shift_assigned' ||
          data._notifType === 'shift_removed' ||
          data._notifType === 'shift_reassigned'
        )
      ) {
        liveFallbackCount++;
      }
    });

    var count = Math.max(counterDocCount, liveFallbackCount);

    var countEl = document.getElementById('bt-nav-bell-count');
    if (countEl) {
      if (count > 0) {
        countEl.textContent = String(count);
        countEl.hidden = false;
        countEl.style.removeProperty('display');
      } else {
        countEl.textContent = '';
        countEl.hidden = true;
        countEl.style.display = 'none';
      }
    }
  }

  function _bellStopListeners() {
    if (_bellUnsubState) { _bellUnsubState(); _bellUnsubState = null; }

    _bellOffersData = [];
    _bellDeletedOffersData = [];
    _bellAdminData = [];
    _bellHostAssignmentsData = [];
    _bellLastSeenMs = _bellGetLocalSeenMs();
    _bellOpenSeenMs = null;
    _bellStateLoaded = false;
    _bellCurrentUid = null;
    _bellUserRoles = [];
    _bellOlderData = [];
    _bellOlderLoaded = false;
    _bellUnreadCount = 0;
  }

  function _bellGetRolesFromCache() {
    try {
      var raw = sessionStorage.getItem('bt:empCache');
      if (!raw) return [];
      var obj = JSON.parse(raw);
      if (Date.now() - (obj.ts || 0) > 4 * 60 * 60 * 1000) return [];
      var emp = obj.emp || {};
      var arr = Array.isArray(emp.roles) ? emp.roles : [];
      var single = emp.role ? [emp.role] : [];
      return arr.concat(single).filter(Boolean).map(function (r) { return String(r).toLowerCase(); });
    } catch (_) {
      return [];
    }
  }

  function _bellGetNewestVisibleItemMs() {
    var newest = 0;

    _bellOffersData.forEach(function (data) {
      if (
        (data._notifType === 'coverage' ||
         data._notifType === 'coverage_deleted' ||
         data._notifType === 'coverage_cancelled' ||
         data._notifType === 'coverage_filled') &&
        data.requestingHostId === _bellCurrentUid
      ) {
        return;
      }
      var ms = _bellToMillis(data.createdAt);
      if (ms > newest) newest = ms;
    });

    _bellHostAssignmentsData.forEach(function (data) {
      if (
        (data._notifType === 'shift_assigned' ||
         data._notifType === 'shift_removed' ||
         data._notifType === 'shift_reassigned') &&
        data.targetHostId !== _bellCurrentUid
      ) {
        return;
      }
      var ms = _bellToMillis(data.createdAt);
      if (ms > newest) newest = ms;
    });

    _bellAdminData.forEach(function (data) {
      var ms = _bellToMillis(data.createdAt);
      if (ms > newest) newest = ms;
    });

    _bellDeletedOffersData.forEach(function (data) {
      if (
        (data._notifType === 'coverage' ||
         data._notifType === 'coverage_deleted' ||
         data._notifType === 'coverage_cancelled' ||
         data._notifType === 'coverage_filled') &&
        data.requestingHostId === _bellCurrentUid
      ) {
        return;
      }
      var ms = _bellToMillis(data.createdAt);
      if (ms > newest) newest = ms;
    });

    _bellOlderData.forEach(function (data) {
      if (
        (data._notifType === 'coverage' ||
         data._notifType === 'coverage_deleted' ||
         data._notifType === 'coverage_cancelled' ||
         data._notifType === 'coverage_filled') &&
        data.requestingHostId === _bellCurrentUid
      ) {
        return;
      }
      if (
        (data._notifType === 'shift_assigned' ||
         data._notifType === 'shift_removed' ||
         data._notifType === 'shift_reassigned') &&
        data.targetHostId !== _bellCurrentUid
      ) {
        return;
      }
      var ms = _bellToMillis(data.createdAt);
      if (ms > newest) newest = ms;
    });

    return newest;
  }

  function _bellMapHostAssignmentDocs(docs) {
    return docs.map(function (d) {
      var data = d.data() || {};
      return Object.assign({}, data, { _notifType: _bellNormalizeAssignmentType(data) });
    });
  }

  function _bellStartListeners(uid) {
    var db = window.firebase.firestore();
    _bellCurrentUid = uid;
    _bellLastKnownUid = uid;
    _bellLastSeenMs = Math.max(_bellLastSeenMs, _bellGetLocalSeenMs());

    _bellUnsubState = db.collection('userBellState').doc(uid).onSnapshot(function (snap) {
      if (snap.metadata.hasPendingWrites) return;

      _bellLastSeenMs = _bellResolveSeenMsFromStateDoc(snap);
      _bellUnreadCount = _bellResolveUnreadCountFromStateDoc(snap);
      _bellSetLocalSeenMs(_bellLastSeenMs);

      _bellStateLoaded = true;
      _bellUpdateBadge();

      if (_bellIsDropdownOpen()) _bellRenderDropdown();
    }, function (err) {
      console.error('[BtNav] state listener failed:', err);
      _bellLastSeenMs = Math.max(_bellLastSeenMs, _bellGetLocalSeenMs());
      _bellUnreadCount = 0;
      _bellStateLoaded = true;
      _bellUpdateBadge();

      if (_bellIsDropdownOpen()) _bellRenderDropdown();
    });

    function startRoleListeners(roles) {
      _bellUserRoles = roles;
      var isHost = roles.indexOf('host') !== -1;
      var isAdmin = roles.indexOf('admin') !== -1;
      if (!isHost && !isAdmin) isHost = true;

      // Keep roles for on-demand bell fetches; we intentionally avoid
      // collection live listeners here to reduce read volume.
      if (!isHost && !isAdmin) {
        _bellUserRoles = ['host'];
      }

      // Reliability fallback: keep one lightweight host-notifications listener
      // so badge updates even if unreadCount increments lag/miss.
      if (isHost) {
        var sevenDaysAgo = window.firebase.firestore.Timestamp.fromDate(
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        );
        _bellUnsubHostAssignments = db.collection(_bellHostNotificationsCollection)
          .where('targetHostId', '==', uid)
          .where('createdAt', '>', sevenDaysAgo)
          .onSnapshot(function (snap) {
            _bellHostAssignmentsData = _bellMapHostAssignmentDocs(snap.docs);
            if (!_bellStateLoaded) {
              _bellLastSeenMs = Math.max(_bellLastSeenMs || 0, _bellGetLocalSeenMs());
            }
            _bellUpdateBadge();
            if (_bellIsDropdownOpen()) _bellRenderDropdown();
          }, function (err) {
            console.error('[BtNav] host assignment fallback listener failed:', err);
          });
      } else {
        _bellHostAssignmentsData = [];
      }
    }

    var cachedRoles = _bellGetRolesFromCache();
    if (cachedRoles.length > 0) {
      startRoleListeners(cachedRoles);
    } else {
      db.collection('employees').doc(uid).get().then(function (snap) {
        var emp = snap.exists ? (snap.data() || {}) : {};
        var arr = Array.isArray(emp.roles) ? emp.roles : [];
        var single = emp.role ? [emp.role] : [];
        var roles = arr.concat(single).filter(Boolean)
          .map(function (r) { return String(r).toLowerCase(); });
        startRoleListeners(roles);
      }).catch(function () {
        startRoleListeners([]);
      });
    }
  }

  function _bellFetchOlderItems() {
    if (_bellOlderLoaded || !window.firebase || !window.firebase.firestore) return;

    var db = window.firebase.firestore();
    var sevenDaysAgo = window.firebase.firestore.Timestamp.fromDate(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );
    var thirtyDaysAgo = window.firebase.firestore.Timestamp.fromDate(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );

    var isHost = _bellUserRoles.indexOf('host') !== -1 || _bellUserRoles.indexOf('admin') === -1;
    var isAdmin = _bellUserRoles.indexOf('admin') !== -1;

    var el = _bellDropdownEl || document.getElementById('bt-nav-bell-dropdown');
    if (el) {
      var btn = el.querySelector('#bt-nav-bell-load-older');
      if (btn) {
        btn.textContent = 'Loading…';
        btn.disabled = true;
      }
    }

    var promises = [];

    if (isHost) {
      promises.push(
        db.collection('shiftCoverageRequests')
          .where('createdAt', '>=', thirtyDaysAgo)
          .where('createdAt', '<', sevenDaysAgo)
          .orderBy('createdAt', 'desc')
          .get()
          .then(function (snap) {
            return snap.docs.map(function (d) {
              var data = d.data() || {};
              var notifType =
                data.status === 'shift_deleted' ? 'coverage_deleted' :
                data.status === 'cancelled' ? 'coverage_cancelled' :
                data.status === 'approved' ? 'coverage_filled' :
                'coverage';
              return Object.assign({}, data, { _notifType: notifType });
            });
          })
      );

      promises.push(
        db.collection(_bellHostNotificationsCollection)
          .where('targetHostId', '==', _bellCurrentUid)
          .where('createdAt', '>=', thirtyDaysAgo)
          .where('createdAt', '<', sevenDaysAgo)
          .get()
          .then(function (snap) {
            return _bellMapHostAssignmentDocs(snap.docs);
          })
      );
    }

    if (isAdmin) {
      promises.push(
        db.collection('shiftSwapNotifications')
          .where('status', '==', 'pending_review')
          .where('createdAt', '>=', thirtyDaysAgo)
          .where('createdAt', '<', sevenDaysAgo)
          .get()
          .then(function (snap) {
            return snap.docs.map(function (d) {
              return Object.assign({}, d.data(), { _notifType: 'swap' });
            });
          })
      );
    }

    Promise.all(promises).then(function (results) {
      _bellOlderData = results.reduce(function (acc, arr) { return acc.concat(arr); }, []);
      _bellOlderLoaded = true;
      _bellRenderDropdown();
    }).catch(function (err) {
      console.error('[BtNav] fetch older failed:', err);
      _bellOlderLoaded = true;
      _bellRenderDropdown();
    });
  }

  function refreshBellCount() {
    if (!window.firebase || !window.firebase.auth) return;
    var user = window.firebase.auth().currentUser;
    if (!user) return;
    _bellUpdateBadge();
    if (_bellIsDropdownOpen()) _bellRenderDropdown();
  }

  function markBellSeen(opts) {
    opts = opts || {};
    if (!window.firebase || !window.firebase.auth || !window.firebase.firestore) return;
    var user = window.firebase.auth().currentUser;
    if (!user) return;

    // Pin the seen-cutoff when the bell opens so the dropdown keeps showing "new"
    // indicators even after the Firestore write triggers a server-confirmed snapshot.
    // Release the pin when the bell closes so future opens reflect real seen state.
    if (_bellIsDropdownOpen()) {
      if (_bellOpenSeenMs === null) _bellOpenSeenMs = _bellLastSeenMs;
    } else {
      _bellOpenSeenMs = null;
    }

    var newestVisibleMs = _bellGetNewestVisibleItemMs();
    if (!newestVisibleMs) newestVisibleMs = _bellLastSeenMs || 0;

    if (opts.bumpToNow) {
      newestVisibleMs = Math.max(newestVisibleMs, Date.now());
    }

    _bellLastSeenMs = Math.max(_bellLastSeenMs || 0, newestVisibleMs);
    _bellUnreadCount = 0;
    _bellSetLocalSeenMs(_bellLastSeenMs);
    _bellUpdateBadge();

    if (_bellIsDropdownOpen() && opts.rerender !== false) _bellRenderDropdown();

    window.firebase.firestore()
      .collection('userBellState')
      .doc(user.uid)
      .set({
        unreadCount: 0,
        lastSeenAtMs: _bellLastSeenMs,
        lastSeenAt: window.firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true })
      .catch(function (err) {
        console.error('[BtNav] markBellSeen failed:', err);
      });
  }

  function initBellCount() {
    function tryInit() {
      if (!window.firebase || !window.firebase.auth || !window.firebase.apps || !window.firebase.apps.length) {
        setTimeout(tryInit, 100);
        return;
      }

      window.firebase.auth().onAuthStateChanged(function (user) {
        _bellStopListeners();
        if (user) {
          _bellStartListeners(user.uid);
        } else {
          _bellLastKnownUid = null;
          var countEl = document.getElementById('bt-nav-bell-count');
          if (countEl) {
            countEl.textContent = '';
            countEl.hidden = true;
            countEl.style.display = 'none';
          }
        }
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryInit);
    } else {
      setTimeout(tryInit, 0);
    }
  }

  // Pause bell listeners when tab is hidden to reduce idle reads.
  if (document && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        _bellStopListeners();
      } else if (_bellLastKnownUid) {
        _bellStartListeners(_bellLastKnownUid);
      }
    });
  }

  function claimOffersListener() {
    _offersListenerClaimed = true;
    if (_bellUnsubOffers) {
      _bellUnsubOffers();
      _bellUnsubOffers = null;
    }
    if (_bellUnsubDeletedOffers) {
      _bellUnsubDeletedOffers();
      _bellUnsubDeletedOffers = null;
    }
  }

  function setOffersData(dataArray) {
    _bellOffersData = Array.isArray(dataArray) ? dataArray : [];
    _bellDeletedOffersData = [];

    if (!_bellStateLoaded) {
      _bellLastSeenMs = Math.max(_bellLastSeenMs || 0, _bellGetLocalSeenMs());
    }

    if (_bellIsDropdownOpen()) _bellRenderDropdown();
  }

  window.BtNavBell = {
    refresh: refreshBellCount,
    claimOffersListener: claimOffersListener,
    setOffersData: setOffersData
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
    const activeRole = getActiveRole(roles);
    const links = NAV_LINKS[activeRole] || NAV_LINKS.host;
    const displayName = getDisplayName(emp);

    saveActiveRole(activeRole);

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