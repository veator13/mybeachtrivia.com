/* dashboard.js — Host/Employee Dashboard (CSP-safe)
   - No inline JS required
   - Centralizes event wiring with addEventListener
   - Does NOT attach its own auth listener
   - guard-host.js is responsible for auth + role gating
   - This file handles UI wiring + dashboard data rendering
   - Today/Upcoming shows read from hostGetCalendarMonth
   - Announcements are disabled by default here to avoid Firestore permission noise
   - Chromecast shortcut has been moved to the Host Event page
*/

(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const ENABLE_ANNOUNCEMENTS = false;

  let announcementsUnsubscribe = null;
  let hasBootstrapped = false;

  function safeCall(fn, ...args) {
    try {
      if (typeof fn === 'function') return fn(...args);
    } catch (err) {
      console.error('[dashboard] safeCall error:', err);
    }
    return undefined;
  }

  function waitForFirebaseApp(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();

      function check() {
        try {
          if (
            typeof firebase !== 'undefined' &&
            Array.isArray(firebase.apps) &&
            firebase.apps.length > 0
          ) {
            resolve(firebase.app());
            return;
          }
        } catch (_) {}

        if (Date.now() - start >= timeoutMs) {
          reject(new Error('Firebase app initialization timed out.'));
          return;
        }

        setTimeout(check, 50);
      }

      check();
    });
  }

  function getCurrentUser() {
    try {
      if (
        typeof firebase !== 'undefined' &&
        Array.isArray(firebase.apps) &&
        firebase.apps.length > 0 &&
        firebase.auth
      ) {
        return firebase.auth().currentUser || null;
      }
    } catch (err) {
      console.warn('[dashboard] getCurrentUser failed:', err);
    }
    return null;
  }

  function revealDashboard() {
    const loading = $('#auth-loading');
    const error = $('#error-container');
    const container = $('.dashboard-container');

    if (loading) loading.style.display = 'none';
    if (error) error.style.display = 'none';
    if (container) container.style.display = '';
  }

  function showError(message) {
    const loading = $('#auth-loading');
    const error = $('#error-container');
    const text = $('#error-text');
    const container = $('.dashboard-container');

    if (loading) loading.style.display = 'none';
    if (container) container.style.display = 'none';
    if (text) text.textContent = message || 'An error occurred. Please try again.';
    if (error) error.style.display = 'flex';
  }

  function handleLogout() {
    if (typeof window.logoutUser === 'function') return window.logoutUser();

    try {
      if (
        typeof firebase !== 'undefined' &&
        Array.isArray(firebase.apps) &&
        firebase.apps.length > 0 &&
        firebase.auth
      ) {
        return firebase.auth().signOut().then(() => {
          try {
            sessionStorage.clear();
            localStorage.removeItem('rememberedEmail');
          } catch (_) {}
          window.location.href = '/login.html';
        }).catch((err) => {
          console.error('[dashboard] Error signing out:', err);
          showError('Could not log out. Please try again.');
        });
      }
    } catch (e) {
      console.error('[dashboard] Logout fallback error:', e);
    }

    try {
      sessionStorage.clear();
      localStorage.removeItem('rememberedEmail');
    } catch (_) {}
    window.location.href = '/login.html';
  }

  function removeLateText() {
    try {
      $$('body *').forEach((el) => {
        if (el && typeof el.textContent === 'string' && el.textContent.trim() === "Don't be late!") {
          el.style.display = 'none';
        }
      });
    } catch (_) {}
  }

  function hideDashboardCastShortcut() {
    try {
      const selectors = [
        '#launch-cast-btn',
        '#stop-cast-btn',
        '#cast-status',
        '#cast-help',
        '#cast-status-box',
        '#cast-tools-title',
        '.header-cast-panel',
        '.cast-panel',
        '.cast-tools',
        '.cast-card',
        '.cast-shortcut',
        '.cast-actions',
        '.cast-status-wrap'
      ];

      selectors.forEach((selector) => {
        $$(selector).forEach((el) => {
          if (!el) return;

          const panel =
            el.closest('.header-cast-panel') ||
            el.closest('.cast-panel') ||
            el.closest('.panel') ||
            el;

          if (panel && panel !== document.body && panel !== document.documentElement) {
            panel.style.display = 'none';
          } else {
            el.style.display = 'none';
          }
        });
      });

      $$('section, div, article, aside').forEach((el) => {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (!text) return;

        const looksLikeCastCard =
          text.includes('cast screen') &&
          (text.includes('chromecast') || text.includes('cast session'));

        if (looksLikeCastCard) {
          el.style.display = 'none';
        }
      });
    } catch (err) {
      console.warn('[dashboard] hideDashboardCastShortcut failed:', err);
    }
  }

  function setupEventListeners() {
    const logoutBtn = $('#logout-btn');
    if (logoutBtn && !logoutBtn.dataset.dashboardBound) {
      logoutBtn.dataset.dashboardBound = 'true';
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleLogout();
      });
    }

    const backToLoginBtn = $('#back-to-login');
    if (backToLoginBtn && !backToLoginBtn.dataset.dashboardBound) {
      backToLoginBtn.dataset.dashboardBound = 'true';
      backToLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = '/login.html';
      });
    }

    $$('.nav-btn[data-href]').forEach((btn) => {
      if (btn.dataset.dashboardBound) return;
      btn.dataset.dashboardBound = 'true';

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const href = btn.getAttribute('data-href');
        if (href) window.location.href = href;
      });
    });

    const addTaskBtn = $('#add-task-btn');
    if (addTaskBtn && !addTaskBtn.dataset.dashboardBound) {
      addTaskBtn.dataset.dashboardBound = 'true';
      addTaskBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof window.addTask === 'function') {
          safeCall(window.addTask);
        } else {
          console.info('[dashboard] addTask() not implemented.');
        }
      });
    }

    setTimeout(removeLateText, 200);
    setTimeout(hideDashboardCastShortcut, 50);
    setTimeout(hideDashboardCastShortcut, 300);
    setTimeout(hideDashboardCastShortcut, 1000);
  }

  function renderUserHeader(user) {
    const nameEl = $('#user-display-name') || $('.username');
    if (nameEl) {
      const label =
        user?.displayName ||
        user?.email ||
        localStorage.getItem('rememberedEmail') ||
        'Employee';
      nameEl.textContent = label;
    }

    const avatar = $('.profile-pic');
    if (avatar && user?.photoURL) {
      avatar.src = user.photoURL;
      avatar.referrerPolicy = 'no-referrer';
      avatar.alt = (user.displayName || user.email || 'User') + ' profile image';
    }
  }

  function getPayPeriod() {
    const ANCHOR = new Date(2026, 1, 26);
    const PERIOD = 14;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    ANCHOR.setHours(0, 0, 0, 0);

    const diffDays = Math.round((today - ANCHOR) / (1000 * 60 * 60 * 24));

    const periodIndex = diffDays <= 0
      ? Math.floor((diffDays - PERIOD) / PERIOD)
      : Math.floor((diffDays - 1) / PERIOD);

    const start = new Date(ANCHOR);
    start.setDate(ANCHOR.getDate() + periodIndex * PERIOD + 1);

    const end = new Date(ANCHOR);
    end.setDate(ANCHOR.getDate() + (periodIndex + 1) * PERIOD);

    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const toYMD = (d) => [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');

    return {
      start,
      end,
      label: `${fmt(start)} – ${fmt(end)}`,
      startYMD: toYMD(start),
      endYMD: toYMD(end)
    };
  }

  function renderPayPeriod() {
    const el = $('#pay-period-display');
    if (el) el.textContent = getPayPeriod().label;
  }

  function todayYMD() {
    const now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
  }

  function formatTimeDisplay(raw) {
    if (!raw) return '—';

    const value = String(raw).trim();

    if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(value)) {
      return value.replace(/\s+/g, ' ').toUpperCase();
    }

    if (/^\d{1,2}\s*(AM|PM)$/i.test(value)) {
      return value.replace(/\s+/g, '').toUpperCase();
    }

    const match24 = value.match(/^(\d{1,2}):(\d{2})$/);
    if (match24) {
      let hours = Number(match24[1]);
      const minutes = match24[2];
      const suffix = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      return `${hours}:${minutes} ${suffix}`;
    }

    return value;
  }

  function formatDayFromDate(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(`${dateStr}T12:00:00`);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildAddressLine(data = {}) {
    if (data.address) return String(data.address).trim();
    if (data.venueAddress) return String(data.venueAddress).trim();
    if (data.location) return String(data.location).trim();

    const street = data.street || '';
    const city = data.city || '';
    const state = data.state || '';
    const zip = data.zip || data.zipCode || '';

    const line2 = [city, state].filter(Boolean).join(', ');
    const parts = [street, [line2, zip].filter(Boolean).join(' ')].filter(Boolean);
    return parts.join(', ').trim();
  }

  function getShiftVenue(data = {}) {
    return (
      data.venueName ||
      data.venue ||
      data.locationName ||
      data.location ||
      data.showTitle ||
      data.title ||
      'Unnamed Show'
    );
  }

  function getShiftTime(data = {}) {
    return (
      data.time ||
      data.showTime ||
      data.startTime ||
      data.shiftTime ||
      ''
    );
  }

  function getAssignedHostId(shift = {}) {
    return String(
      shift.employeeId ||
      shift.hostId ||
      shift.employee ||
      shift.employeeUID ||
      shift.hostUID ||
      shift.assignedHostId ||
      ''
    ).trim();
  }

  function sortShiftsAscending(shifts) {
    return [...shifts].sort((a, b) => {
      const aKey = `${a?.date || ''}|${String(getShiftTime(a) || '')}`;
      const bKey = `${b?.date || ''}|${String(getShiftTime(b) || '')}`;
      return aKey.localeCompare(bKey);
    });
  }

  function renderTodayShow(shift) {
    const nameEl = $('#today-show-name');
    const addressEl = $('#today-show-address');
    const timeEl = $('#today-show-time');

    if (!nameEl || !addressEl || !timeEl) return;

    if (!shift) {
      nameEl.textContent = 'No Show Scheduled';
      addressEl.textContent = 'Check back later for venue details.';
      timeEl.textContent = '—';
      return;
    }

    nameEl.textContent = getShiftVenue(shift);
    addressEl.textContent = buildAddressLine(shift) || 'Venue details coming soon.';
    timeEl.textContent = formatTimeDisplay(getShiftTime(shift));
  }

  function renderUpcomingShows(shifts) {
    const list = $('#upcoming-shows-list') || $('.shows-list');
    if (!list) return;

    if (!Array.isArray(shifts) || !shifts.length) {
      list.innerHTML = `
        <div class="upcoming-row">
          <span class="upcoming-venue">No upcoming shows</span>
          <span class="upcoming-day">—</span>
          <span class="upcoming-time">—</span>
        </div>
      `;
      return;
    }

    list.innerHTML = shifts.map((shift, index) => {
      const oddClass = index % 2 === 1 ? ' odd' : '';
      return `
        <div class="upcoming-row${oddClass}">
          <span class="upcoming-venue">${escapeHtml(getShiftVenue(shift))}</span>
          <span class="upcoming-day">${escapeHtml(formatDayFromDate(shift.date || ''))}</span>
          <span class="upcoming-time">${escapeHtml(formatTimeDisplay(getShiftTime(shift)))}</span>
        </div>
      `;
    }).join('');
  }

  function renderShowsWorkedFromShifts(shifts) {
    const showsEl = $('#shows-worked-display');
    const hoursEl = $('#hours-worked-display');
    if (!showsEl && !hoursEl) return;

    const { startYMD } = getPayPeriod();
    const today = todayYMD();

    const count = (Array.isArray(shifts) ? shifts : []).filter((shift) => {
      const date = shift?.date || '';
      return date >= startYMD && date <= today;
    }).length;

    if (showsEl) showsEl.textContent = String(count);
    if (hoursEl) hoursEl.textContent = `${count * 2} hrs`;
  }

  function getMonthRangeForDashboard() {
    const now = new Date();
    const current = { year: now.getFullYear(), month: now.getMonth() };
    const nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const next = { year: nextDate.getFullYear(), month: nextDate.getMonth() };
    return [current, next];
  }

  async function fetchCalendarMonth(year, month) {
    const currentUser = firebase.auth().currentUser;
    const idToken = currentUser ? await currentUser.getIdToken() : null;
    const fn = firebase.functions().httpsCallable('hostGetCalendarMonth');
    const result = await fn({ year, month, idToken });
    return result?.data || {};
  }

  function normalizeLocationsMap(rawLocations) {
    const map = {};

    if (!Array.isArray(rawLocations)) return map;

    rawLocations.forEach((item) => {
      if (typeof item === 'string') {
        map[item] = {
          id: item,
          name: item,
          venueName: item,
          locationName: item
        };
        return;
      }

      if (!item || typeof item !== 'object') return;

      const key =
        item.id ||
        item.locationId ||
        item.venueId ||
        item.name ||
        item.locationName ||
        item.venueName;

      if (!key) return;

      map[String(key)] = { ...item };
    });

    return map;
  }

  function hydrateShiftWithLocation(shift, locationsMap) {
    const out = { ...shift };

    const directName =
      shift.venueName ||
      shift.locationName ||
      shift.venue ||
      shift.location;

    if (!directName) {
      const locationKey =
        shift.locationId ||
        shift.venueId ||
        shift.location ||
        shift.venue;

      const location = locationKey != null ? locationsMap[String(locationKey)] : null;

      if (location) {
        out.venueName =
          out.venueName ||
          location.venueName ||
          location.locationName ||
          location.name ||
          String(locationKey);

        out.locationName = out.locationName || out.venueName;

        out.address =
          out.address ||
          location.address ||
          location.venueAddress ||
          buildAddressLine(location);

        out.street = out.street || location.street || '';
        out.city = out.city || location.city || '';
        out.state = out.state || location.state || '';
        out.zip = out.zip || location.zip || location.zipCode || '';
      }
    }

    return out;
  }

  async function loadDashboardShiftsFromCalendar(user) {
    if (
      !user?.uid ||
      typeof firebase === 'undefined' ||
      !Array.isArray(firebase.apps) ||
      firebase.apps.length === 0 ||
      !firebase.functions
    ) {
      renderTodayShow(null);
      renderUpcomingShows([]);
      renderShowsWorkedFromShifts([]);
      return;
    }

    try {
      const months = getMonthRangeForDashboard();
      const results = await Promise.all(
        months.map(({ year, month }) => fetchCalendarMonth(year, month))
      );

      const allShifts = [];
      const combinedLocations = {};

      results.forEach((data) => {
        const locationsMap = normalizeLocationsMap(data.locations || []);
        Object.keys(locationsMap).forEach((key) => {
          combinedLocations[key] = locationsMap[key];
        });

        const shifts = Array.isArray(data.shifts) ? data.shifts : [];
        shifts.forEach((shift) => {
          allShifts.push(shift);
        });
      });

      const hostShifts = allShifts
        .filter((shift) => getAssignedHostId(shift) === String(user.uid))
        .map((shift) => hydrateShiftWithLocation(shift, combinedLocations));

      const deduped = [];
      const seen = new Set();

      hostShifts.forEach((shift) => {
        const key = String(
          shift.id ||
          shift.shiftId ||
          `${shift.date || ''}|${getShiftTime(shift) || ''}|${getShiftVenue(shift) || ''}|${getAssignedHostId(shift)}`
        );

        if (seen.has(key)) return;
        seen.add(key);
        deduped.push(shift);
      });

      const sorted = sortShiftsAscending(deduped);
      const today = todayYMD();

      const todayShift = sorted.find((shift) => (shift?.date || '') === today) || null;
      const upcoming = sorted.filter((shift) => (shift?.date || '') >= today).slice(0, 5);

      renderTodayShow(todayShift);
      renderUpcomingShows(upcoming);
      renderShowsWorkedFromShifts(sorted);

      console.log('[dashboard] calendar shifts loaded', {
        totalReturned: allShifts.length,
        matchedHost: hostShifts.length,
        todayShift,
        upcomingCount: upcoming.length
      });
    } catch (e) {
      console.warn('[dashboard] loadDashboardShiftsFromCalendar error:', e);
      renderTodayShow(null);
      renderUpcomingShows([]);
      renderShowsWorkedFromShifts([]);
    }
  }

  function getAnnouncementType(item = {}) {
    const raw = String(item.type || item.kind || '').toLowerCase();
    if (raw.includes('closed') || raw.includes('holiday')) return 'closed';
    if (raw.includes('new')) return 'new';
    return 'standard';
  }

  function getAnnouncementTitle(item = {}) {
    return (
      item.title ||
      item.name ||
      item.eventTitle ||
      item.venueName ||
      'Announcement'
    );
  }

  function getAnnouncementSubtitle(item = {}) {
    return item.subtitle || item.reason || item.description || '';
  }

  function getAnnouncementSchedule(item = {}) {
    return item.time || item.schedule || '';
  }

  function renderAnnouncements(items) {
    const list = $('#announcements-list');
    if (!list) return;

    if (!Array.isArray(items) || !items.length) {
      list.innerHTML = `
        <article class="announcement-item">
          <p class="announcement-kicker">- Updates -</p>
          <p class="announcement-title">No announcements right now</p>
          <p class="announcement-copy">Check back soon for schedule and venue updates.</p>
        </article>
      `;
      return;
    }

    list.innerHTML = items.map((item) => {
      const type = getAnnouncementType(item);

      if (type === 'closed') {
        return `
          <div class="announcement-feature">
            <p class="announcement-kicker">- Closed -</p>
            <p class="feature-title">${escapeHtml(getAnnouncementTitle(item))}</p>
            <p class="feature-subtitle">${escapeHtml(getAnnouncementSubtitle(item))}</p>
          </div>
        `;
      }

      const kicker = type === 'new'
        ? '- New Show -'
        : `- ${escapeHtml(item.label || 'Update')} -`;

      const title = escapeHtml(getAnnouncementTitle(item));
      const address = escapeHtml(buildAddressLine(item) || item.description || '');
      const schedule = escapeHtml(String(getAnnouncementSchedule(item) || ''));

      return `
        <article class="announcement-item">
          <p class="announcement-kicker">${kicker}</p>
          <p class="announcement-title">${title}</p>
          <p class="announcement-copy">${address ? address.replace(/\n/g, '<br />') : 'More details coming soon.'}</p>
          ${schedule ? `<p class="announcement-time">${schedule}</p>` : ''}
        </article>
      `;
    }).join('');
  }

  function subscribeToAnnouncements() {
    if (!ENABLE_ANNOUNCEMENTS) {
      renderAnnouncements([]);
      return;
    }

    if (
      typeof firebase === 'undefined' ||
      !Array.isArray(firebase.apps) ||
      firebase.apps.length === 0 ||
      !firebase.firestore
    ) {
      renderAnnouncements([]);
      return;
    }

    if (typeof announcementsUnsubscribe === 'function') {
      try { announcementsUnsubscribe(); } catch (_) {}
      announcementsUnsubscribe = null;
    }

    try {
      const db = firebase.firestore();

      announcementsUnsubscribe = db.collection('announcements')
        .where('active', '==', true)
        .onSnapshot((snap) => {
          const items = [];
          snap.forEach((doc) => {
            items.push({ id: doc.id, ...doc.data() });
          });

          items.sort((a, b) => {
            const aOrder = Number.isFinite(Number(a.order)) ? Number(a.order) : 9999;
            const bOrder = Number.isFinite(Number(b.order)) ? Number(b.order) : 9999;
            return aOrder - bOrder;
          });

          renderAnnouncements(items);
        }, (err) => {
          console.warn('[dashboard] subscribeToAnnouncements error:', err);
          renderAnnouncements([]);
        });
    } catch (err) {
      console.warn('[dashboard] subscribeToAnnouncements setup error:', err);
      renderAnnouncements([]);
    }
  }

  function initDashboardData(user) {
    renderPayPeriod();

    if (!user?.uid) {
      const showsEl = $('#shows-worked-display');
      const hoursEl = $('#hours-worked-display');

      if (showsEl) showsEl.textContent = '—';
      if (hoursEl) hoursEl.textContent = '—';

      renderTodayShow(null);
      renderUpcomingShows([]);
      renderAnnouncements([]);
      return;
    }

    loadDashboardShiftsFromCalendar(user);
    subscribeToAnnouncements();

    if (typeof window.loadDashboardData === 'function' && window.loadDashboardData !== initDashboardData) {
      return safeCall(window.loadDashboardData, user);
    }
  }

  async function bootstrap() {
    if (hasBootstrapped) return;
    hasBootstrapped = true;

    try {
      setupEventListeners();

      await waitForFirebaseApp();

      const user = getCurrentUser();
      renderUserHeader(user);
      initDashboardData(user);

      setTimeout(() => {
        const loading = $('#auth-loading');
        const error = $('#error-container');
        const container = $('.dashboard-container');

        if (
          loading &&
          loading.style.display !== 'none' &&
          error &&
          error.style.display !== 'flex' &&
          container &&
          container.style.display === 'none'
        ) {
          revealDashboard();
        }
      }, 1200);
    } catch (err) {
      console.error('[dashboard] bootstrap error:', err);
      showError('Unable to load the dashboard. Please try again.');
    }
  }

  function refreshDashboardFromCurrentUser() {
    const user = getCurrentUser();
    renderUserHeader(user);
    initDashboardData(user);
    hideDashboardCastShortcut();
  }

  window.handleLogout = handleLogout;
  window.revealDashboard = revealDashboard;
  window.initDashboardData = initDashboardData;

  document.addEventListener('DOMContentLoaded', () => {
    bootstrap();
  });

  window.addEventListener('pageshow', () => {
    refreshDashboardFromCurrentUser();
  });

  window.addEventListener('focus', () => {
    refreshDashboardFromCurrentUser();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshDashboardFromCurrentUser();
    }
  });

  window.addEventListener('beforeunload', () => {
    if (typeof announcementsUnsubscribe === 'function') {
      try { announcementsUnsubscribe(); } catch (_) {}
      announcementsUnsubscribe = null;
    }
  });
})();