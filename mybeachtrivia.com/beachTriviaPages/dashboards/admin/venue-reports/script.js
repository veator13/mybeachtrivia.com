// venue-reports/script.js — Venue Reports dashboard logic
(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────────────────
  const state = {
    initialized: false,
    user: null,
    employee: null,
    venues: [],
    avgTeams: 0,
    projectionEvents: 1,
    projectionTeams: 8,
    totalTeams: 0,
    totalEvents: 0,
    lastEventDate: '',
    attendanceChart: null,
    reportLoaded: false,
  };

  // ── DOM helpers ──────────────────────────────────────────────────────────
  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function getDb() {
    if (typeof firebase === 'undefined' || !firebase.firestore) {
      throw new Error('Firebase Firestore not available.');
    }
    return firebase.firestore();
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Venues dropdown ──────────────────────────────────────────────────────
  async function loadVenues() {
    const sel = $('#venue-select');
    if (!sel) return;
    try {
      const db = getDb();
      // Pull recent scoresheets to extract distinct venue names
      const snap = await db.collection('scores')
        .orderBy('meta.eventDate', 'desc')
        .limit(1000)
        .get();

      const seen = new Set();
      const venues = [];
      snap.forEach((doc) => {
        const meta = doc.data()?.meta || {};
        const name = (meta.venueName || meta.venue || '').trim();
        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          venues.push(name);
        }
      });
      venues.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      state.venues = venues;

      // Populate select
      while (sel.options.length > 1) sel.remove(1); // keep "All venues"
      venues.forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
      });
    } catch (err) {
      console.error('[venue-reports] loadVenues error:', err);
    }
  }

  // ── Report generation ────────────────────────────────────────────────────
  async function generateReport() {
    const venueFilter = ($('#venue-select')?.value || '').trim();
    const dateStart = ($('#date-start')?.value || '').trim();
    const dateEnd = ($('#date-end')?.value || '').trim();
    const maxSpend = parseFloat($('#max-spend')?.value) || 20;

    const statusEl = $('#report-status');
    if (statusEl) statusEl.textContent = 'Loading…';

    try {
      const db = getDb();
      let query = db.collection('scores').orderBy('meta.eventDate', 'desc').limit(500);
      const snap = await query.get();

      const docs = [];
      snap.forEach((doc) => {
        const data = doc.data() || {};
        const meta = data.meta || {};
        const date = (meta.eventDate || '').trim();
        const venue = (meta.venueName || meta.venue || '').trim();

        if (dateStart && date < dateStart) return;
        if (dateEnd && date > dateEnd) return;
        if (venueFilter && venue.toLowerCase() !== venueFilter.toLowerCase()) return;

        docs.push({ id: doc.id, data, meta, date, venue });
      });

      docs.sort((a, b) => a.date.localeCompare(b.date));

      if (!docs.length) {
        if (statusEl) statusEl.textContent = 'No events found for the selected filters.';
        renderStats(0, 0, 0, '');
        destroyChart();
        renderHeatmap(0, maxSpend);
        return;
      }

      // Stats
      let totalTeams = 0;
      docs.forEach((d) => {
        const teams = Array.isArray(d.data.teams) ? d.data.teams.length : 0;
        totalTeams += teams;
      });
      const avgTeams = docs.length > 0 ? totalTeams / docs.length : 0;
      const lastDate = docs[docs.length - 1]?.date || '';

      state.avgTeams = avgTeams;
      state.totalTeams = totalTeams;
      state.totalEvents = docs.length;
      state.lastEventDate = lastDate;
      state.reportLoaded = true;

      // Default slider to rounded avg teams
      const roundedAvg = Math.max(3, Math.min(100, Math.round(avgTeams)));
      state.projectionTeams = roundedAvg;
      updateTeamsSlider(roundedAvg);

      const venueLabel = venueFilter || 'All Venues';
      renderStats(docs.length, avgTeams, totalTeams, lastDate);
      renderTrendChart(docs, avgTeams, venueLabel, dateStart, dateEnd);
      renderHeatmap(avgTeams, maxSpend, state.projectionEvents, roundedAvg);

      if (statusEl) statusEl.textContent = '';
    } catch (err) {
      console.error('[venue-reports] generateReport error:', err);
      if (statusEl) statusEl.textContent = 'Error loading report: ' + (err.message || err);
    }
  }

  // ── Stats cards ──────────────────────────────────────────────────────────
  function renderStats(events, avgTeams, totalTeams, lastDate) {
    const fmt = (n) => Number.isFinite(n) ? n.toFixed(1) : '—';
    const el = (id, val) => { const e = $(`#${id}`); if (e) e.textContent = val; };

    el('stat-events', events || '—');
    el('stat-avg-teams', events ? fmt(avgTeams) : '—');
    el('stat-total-teams', events ? String(totalTeams) : '—');
    el('stat-last-event', lastDate || '—');
  }

  // ── Attendance trend chart ───────────────────────────────────────────────
  function destroyChart() {
    if (state.attendanceChart) {
      state.attendanceChart.destroy();
      state.attendanceChart = null;
    }
  }

  function renderTrendChart(docs, avgTeams, venue, dateStart, dateEnd) {
    destroyChart();

    const canvas = $('#trend-chart');
    if (!canvas) return;

    const labels = docs.map((d) => d.date);
    const teamCounts = docs.map((d) => Array.isArray(d.data.teams) ? d.data.teams.length : 0);
    const avgLine = docs.map(() => parseFloat(avgTeams.toFixed(2)));

    const tooltipDocs = docs;

    state.attendanceChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Teams per Event',
            data: teamCounts,
            borderColor: 'rgba(59, 130, 246, 0.9)',
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            fill: true,
            tension: 0.3,
            pointRadius: 5,
            pointHoverRadius: 7,
          },
          {
            label: `Avg Teams (${avgTeams.toFixed(1)})`,
            data: avgLine,
            borderColor: 'rgba(245, 158, 11, 0.85)',
            borderDash: [6, 4],
            fill: false,
            tension: 0,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#cbd5e1' } },
          tooltip: {
            callbacks: {
              title: (items) => {
                const idx = items[0]?.dataIndex;
                const doc = tooltipDocs[idx];
                return doc ? doc.date : '';
              },
              afterTitle: (items) => {
                const idx = items[0]?.dataIndex;
                const doc = tooltipDocs[idx];
                if (!doc) return '';
                const lines = [];
                if (doc.venue) lines.push('Venue: ' + doc.venue);
                const host = doc.meta?.submitterDisplayName ||
                  [doc.meta?.submitterFirstName, doc.meta?.submitterLastName].filter(Boolean).join(' ');
                if (host) lines.push('Host: ' + host);
                return lines;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#94a3b8', maxRotation: 45, autoSkip: true, maxTicksLimit: 20 },
            grid: { color: 'rgba(255,255,255,0.06)' },
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#94a3b8', stepSize: 1 },
            grid: { color: 'rgba(255,255,255,0.06)' },
            title: { display: true, text: 'Teams', color: '#94a3b8' },
          },
        },
      },
    });
  }

  // ── Revenue projection heatmap ────────────────────────────────────────────
  function updateTeamsSlider(teams) {
    const slider = $('#teams-slider');
    const label = $('#teams-slider-value');
    if (slider) slider.value = teams;
    if (label) label.textContent = teams;
  }

  function renderHeatmap(avgTeams, maxSpend, events, teams) {
    events = events || state.projectionEvents || 1;
    teams = teams || state.projectionTeams || 8;
    const container = $('#heatmap-container');
    if (!container) return;

    if (!avgTeams || avgTeams === 0) {
      container.innerHTML = '<p class="muted" style="padding:16px;">Generate a report first to see projections.</p>';
      return;
    }

    const playersRange = [3, 4, 5, 6, 7, 8, 9, 10];
    const spendSteps = [];
    for (let s = 20; s <= maxSpend; s += 5) spendSteps.push(s);
    if (!spendSteps.length) spendSteps.push(5);

    // Compute max revenue for gradient scaling
    const maxRevenue = teams * 10 * (spendSteps[spendSteps.length - 1]) * events;

    function cellColor(revenue) {
      const ratio = Math.min(revenue / maxRevenue, 1);
      // Emerald gradient: dark → bright
      const r = Math.round(6 + (16 - 6) * ratio);
      const g = Math.round(78 + (185 - 78) * ratio);
      const b = Math.round(59 + (129 - 59) * ratio);
      const alpha = 0.25 + 0.65 * ratio;
      return `rgba(${r},${g},${b},${alpha})`;
    }

    let html = '<table class="heatmap-table"><thead><tr><th>Players/Team →<br>$/Player ↓</th>';
    playersRange.forEach((p) => { html += `<th>${p} players</th>`; });
    html += '</tr></thead><tbody>';

    spendSteps.forEach((spend) => {
      html += `<tr><td class="heatmap-label">$${spend}/player</td>`;
      playersRange.forEach((players) => {
        const revenue = teams * players * spend * events;
        const bg = cellColor(revenue);
        html += `<td style="background:${bg};">$${revenue.toFixed(0)}</td>`;
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  function start(detail) {
    if (state.initialized) return;
    state.initialized = true;

    state.user = detail?.user || window.__VENUE_REPORTS_USER__ || null;
    state.employee = detail?.emp || window.__VENUE_REPORTS_EMPLOYEE__ || null;

    loadVenues();

    // Set default dates (last 90 days)
    const today = new Date();
    const prior = new Date(today);
    prior.setDate(today.getDate() - 90);

    const dateEnd = $('#date-end');
    const dateStart = $('#date-start');
    if (dateEnd && !dateEnd.value) dateEnd.value = today.toISOString().slice(0, 10);
    if (dateStart && !dateStart.value) dateStart.value = prior.toISOString().slice(0, 10);

    $('#generate-btn')?.addEventListener('click', generateReport);

    // Teams slider
    const teamsSlider = $('#teams-slider');
    const teamsLabel = $('#teams-slider-value');
    if (teamsSlider) {
      teamsSlider.addEventListener('input', () => {
        const t = parseInt(teamsSlider.value, 10);
        if (teamsLabel) teamsLabel.textContent = t;
        state.projectionTeams = t;
        if (state.reportLoaded) {
          const maxSpend = parseFloat($('#max-spend')?.value) || 60;
          renderHeatmap(state.avgTeams, maxSpend, state.projectionEvents, t);
        }
      });
    }

    // Period toggles
    document.querySelectorAll('.period-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.projectionEvents = parseInt(btn.dataset.events, 10) || 1;
        if (state.reportLoaded) {
          const maxSpend = parseFloat($('#max-spend')?.value) || 60;
          renderHeatmap(state.avgTeams, maxSpend, state.projectionEvents, state.projectionTeams);
        }
      });
    });
  }

  document.addEventListener('venue-reports:boot-ready', (ev) => {
    start(ev.detail || {});
  });

  document.addEventListener('venue-reports:auth-ready', (ev) => {
    if (!state.initialized && window.__VENUE_REPORTS_AUTH_READY__) {
      start(ev.detail || {});
    }
  });
})();
