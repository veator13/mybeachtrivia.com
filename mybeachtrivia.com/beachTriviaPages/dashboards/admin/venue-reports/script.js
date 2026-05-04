// venue-reports/script.js — Venue Reports dashboard logic
(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────────────────
  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const state = {
    initialized: false,
    user: null,
    employee: null,
    venues: [],
    avgTeams: 0,
    projectionEvents: 1,
    projectionTeams: 10,
    totalTeams: 0,
    totalEvents: 0,
    lastEventDate: '',
    attendanceChart: null,
    schedulingDayChart: null,
    schedulingSubmitChart: null,
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
        destroySchedulingCharts();
        const venueLabelEmpty = venueFilter || 'All Venues';
        renderSchedulingReport([], venueLabelEmpty, dateStart, dateEnd);
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

      const venueLabel = venueFilter || 'All Venues';
      renderStats(docs.length, avgTeams, totalTeams, lastDate);
      renderSchedulingReport(docs, venueLabel, dateStart, dateEnd);
      renderTrendChart(docs, avgTeams, venueLabel, dateStart, dateEnd);
      renderHeatmap(avgTeams, maxSpend, state.projectionEvents, state.projectionTeams);

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

  function destroySchedulingCharts() {
    if (state.schedulingDayChart) {
      state.schedulingDayChart.destroy();
      state.schedulingDayChart = null;
    }
    if (state.schedulingSubmitChart) {
      state.schedulingSubmitChart.destroy();
      state.schedulingSubmitChart = null;
    }
  }

  /** Parse YYYY-MM-DD at local noon to avoid UTC boundary shifts. */
  function parseEventLocalDate(dateStr) {
    const s = String(dateStr || '').trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d, 12, 0, 0);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }

  function teamsForDoc(d) {
    return Array.isArray(d.data?.teams) ? d.data.teams.length : 0;
  }

  function submitHourFromDoc(d) {
    const raw = d.data?.timestamp || d.data?.submittedAt || '';
    if (!raw) return null;
    const dt = new Date(raw);
    return Number.isFinite(dt.getTime()) ? dt.getHours() : null;
  }

  function submitTimeBucket(hour) {
    if (hour === null || hour === undefined) return null;
    if (hour >= 12 && hour < 17) return '12pm–5pm';
    if (hour >= 17 && hour < 21) return '5pm–9pm';
    if (hour >= 21 || hour < 2) return '9pm–2am';
    if (hour >= 2 && hour < 12) return '2am–12pm';
    return 'Other';
  }

  /** Fri–Sun vs Mon–Thu using calendar date only. */
  function isWeekendNight(dayIdx) {
    return dayIdx === 0 || dayIdx === 5 || dayIdx === 6;
  }

  function fmtAvg(n) {
    return Number.isFinite(n) ? n.toFixed(1) : '—';
  }

  function aggregateScheduling(docs) {
    const byDay = DAY_LABELS.map((label, dayIdx) => ({
      label,
      dayIdx,
      events: 0,
      teams: 0,
    }));
    const monthMap = new Map();
    const bucketOrder = ['5pm–9pm', '9pm–2am', '12pm–5pm', '2am–12pm', 'Other'];
    const buckets = new Map(bucketOrder.map((k) => [k, { events: 0, teams: 0 }]));

    let wkEvents = 0;
    let wkTeams = 0;
    let weEvents = 0;
    let weTeams = 0;

    docs.forEach((d) => {
      const dt = parseEventLocalDate(d.date);
      const tc = teamsForDoc(d);
      if (!dt) return;
      const dayIdx = dt.getDay();
      byDay[dayIdx].events += 1;
      byDay[dayIdx].teams += tc;

      const ym = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap.has(ym)) monthMap.set(ym, { key: ym, events: 0, teams: 0 });
      const mo = monthMap.get(ym);
      mo.events += 1;
      mo.teams += tc;

      if (isWeekendNight(dayIdx)) {
        weEvents += 1;
        weTeams += tc;
      } else {
        wkEvents += 1;
        wkTeams += tc;
      }

      const h = submitHourFromDoc(d);
      const b = submitTimeBucket(h);
      if (b && buckets.has(b)) {
        const row = buckets.get(b);
        row.events += 1;
        row.teams += tc;
      }
    });

    const months = Array.from(monthMap.values()).sort((a, b) => a.key.localeCompare(b.key));

    let bestDay = null;
    let maxAvg = -1;
    byDay.forEach((row) => {
      if (row.events < 2) return;
      const avg = row.teams / row.events;
      if (avg > maxAvg) {
        maxAvg = avg;
        bestDay = row;
      }
    });

    const busiestByEvents = [...byDay].sort((a, b) => b.events - a.events)[0] || null;

    return {
      byDay,
      months,
      buckets,
      bucketOrder,
      wkEvents,
      wkTeams,
      weEvents,
      weTeams,
      bestDay,
      busiestByEvents,
    };
  }

  function renderSchedulingReport(docs, venueLabel, dateStart, dateEnd) {
    destroySchedulingCharts();

    const scopeEl = $('#scheduling-scope');
    const summaryEl = $('#scheduling-summary');
    const monthEl = $('#scheduling-month-table');

    const venueText = venueLabel && venueLabel !== 'All Venues'
      ? `Venue: ${venueLabel}`
      : 'All venues combined';

    if (scopeEl) {
      const rangeParts = [];
      if (dateStart) rangeParts.push(`from ${dateStart}`);
      if (dateEnd) rangeParts.push(`to ${dateEnd}`);
      scopeEl.textContent = `${venueText}. Uses each scoresheet’s event date for day/month; ${rangeParts.length ? rangeParts.join(' ') : 'full sampled range'}.`;
    }

    if (!docs.length) {
      if (summaryEl) summaryEl.innerHTML = '';
      if (monthEl) monthEl.innerHTML = '<p class="muted">Generate a report to see scheduling breakdowns.</p>';
      const dayCanvas = $('#scheduling-day-chart');
      const subCanvas = $('#scheduling-submit-chart');
      if (dayCanvas) {
        const p = dayCanvas.parentElement;
        if (p) p.style.display = 'none';
      }
      if (subCanvas) {
        const p = subCanvas.parentElement;
        if (p) p.style.display = 'none';
      }
      return;
    }

    if ($('#scheduling-day-chart')?.parentElement) $('#scheduling-day-chart').parentElement.style.display = '';
    if ($('#scheduling-submit-chart')?.parentElement) $('#scheduling-submit-chart').parentElement.style.display = '';

    const agg = aggregateScheduling(docs);

    const wkAvg = agg.wkEvents > 0 ? agg.wkTeams / agg.wkEvents : null;
    const weAvg = agg.weEvents > 0 ? agg.weTeams / agg.weEvents : null;

    if (summaryEl) {
      const cards = [];

      cards.push(`
        <div class="sched-summary-card">
          <div class="sched-kicker">Weekend vs weekday</div>
          <div class="sched-value">Fri–Sun vs Mon–Thu</div>
          <div class="sched-detail">
            Weekend avg: ${fmtAvg(weAvg)} teams/event (${agg.weEvents} shows)<br/>
            Weekday avg: ${fmtAvg(wkAvg)} teams/event (${agg.wkEvents} shows)
          </div>
        </div>`);

      if (agg.bestDay) {
        const avg = agg.bestDay.teams / agg.bestDay.events;
        cards.push(`
          <div class="sched-summary-card">
            <div class="sched-kicker">Highest avg teams (2+ shows)</div>
            <div class="sched-value">${escapeHtml(agg.bestDay.label)}</div>
            <div class="sched-detail">${fmtAvg(avg)} avg · ${agg.bestDay.events} events · ${agg.bestDay.teams} teams total</div>
          </div>`);
      } else {
        cards.push(`
          <div class="sched-summary-card">
            <div class="sched-kicker">Highest avg teams</div>
            <div class="sched-value">—</div>
            <div class="sched-detail">Need at least two shows on one weekday to rank.</div>
          </div>`);
      }

      if (agg.busiestByEvents && agg.busiestByEvents.events > 0) {
        const avg = agg.busiestByEvents.teams / agg.busiestByEvents.events;
        cards.push(`
          <div class="sched-summary-card">
            <div class="sched-kicker">Most shows</div>
            <div class="sched-value">${escapeHtml(agg.busiestByEvents.label)}</div>
            <div class="sched-detail">${agg.busiestByEvents.events} events · ${fmtAvg(avg)} avg teams</div>
          </div>`);
      }

      summaryEl.innerHTML = cards.join('');
    }

    if (monthEl) {
      if (!agg.months.length) {
        monthEl.innerHTML = '<p class="muted">No valid dates in range.</p>';
      } else {
        let html = '<table class="heatmap-table sched-month-table"><thead><tr><th>Month</th><th>Events</th><th>Avg teams</th><th>Total teams</th></tr></thead><tbody>';
        agg.months.forEach((m) => {
          const avg = m.events ? (m.teams / m.events).toFixed(1) : '—';
          const label = `${m.key.slice(0, 4)}-${m.key.slice(5, 7)}`;
          html += `<tr><td>${escapeHtml(label)}</td><td>${m.events}</td><td>${avg}</td><td>${m.teams}</td></tr>`;
        });
        html += '</tbody></table>';
        monthEl.innerHTML = html;
      }
    }

    const dayCanvas = $('#scheduling-day-chart');
    if (dayCanvas && typeof Chart !== 'undefined') {
      const labels = agg.byDay.map((r) => r.label);
      const avgTeams = agg.byDay.map((r) => (r.events ? r.teams / r.events : 0));
      const counts = agg.byDay.map((r) => r.events);

      state.schedulingDayChart = new Chart(dayCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Avg teams / event',
              data: avgTeams,
              backgroundColor: 'rgba(54, 153, 255, 0.55)',
              borderColor: 'rgba(54, 153, 255, 0.95)',
              borderWidth: 1,
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
                afterLabel: (ctx) => {
                  const i = ctx.dataIndex;
                  const ev = counts[i];
                  const teams = agg.byDay[i].teams;
                  return `${ev} event${ev === 1 ? '' : 's'} · ${teams} teams total`;
                },
              },
            },
          },
          scales: {
            x: {
              ticks: { color: '#94a3b8' },
              grid: { color: 'rgba(255,255,255,0.06)' },
            },
            y: {
              beginAtZero: true,
              ticks: { color: '#94a3b8', stepSize: 1 },
              grid: { color: 'rgba(255,255,255,0.06)' },
              title: { display: true, text: 'Avg teams', color: '#94a3b8' },
            },
          },
        },
      });
    }

    const submitCanvas = $('#scheduling-submit-chart');
    if (submitCanvas && typeof Chart !== 'undefined') {
      const labels = [];
      const avgs = [];
      const counts = [];
      agg.bucketOrder.forEach((key) => {
        const row = agg.buckets.get(key);
        if (!row || row.events === 0) return;
        labels.push(key);
        avgs.push(row.teams / row.events);
        counts.push(row.events);
      });

      if (!labels.length) {
        state.schedulingSubmitChart = new Chart(submitCanvas, {
          type: 'bar',
          data: { labels: ['No submit timestamps'], datasets: [{ data: [0], backgroundColor: 'rgba(255,255,255,0.1)' }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
        });
      } else {
        state.schedulingSubmitChart = new Chart(submitCanvas, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'Avg teams / event',
                data: avgs,
                backgroundColor: 'rgba(245, 158, 11, 0.45)',
                borderColor: 'rgba(245, 158, 11, 0.9)',
                borderWidth: 1,
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
                  afterLabel: (ctx) => {
                    const i = ctx.dataIndex;
                    const ev = counts[i];
                    return `${ev} submission${ev === 1 ? '' : 's'}`;
                  },
                },
              },
            },
            scales: {
              x: {
                ticks: { color: '#94a3b8' },
                grid: { color: 'rgba(255,255,255,0.06)' },
              },
              y: {
                beginAtZero: true,
                ticks: { color: '#94a3b8' },
                grid: { color: 'rgba(255,255,255,0.06)' },
                title: { display: true, text: 'Avg teams', color: '#94a3b8' },
              },
            },
          },
        });
      }
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
    const input = $('#teams-input');
    const label = $('#teams-slider-value');
    if (slider) slider.value = teams;
    if (input) input.value = teams;
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
    for (let s = 30; s <= maxSpend; s += 5) spendSteps.push(s);
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

    renderSchedulingReport([], 'All Venues', dateStart?.value || '', dateEnd?.value || '');

    $('#generate-btn')?.addEventListener('click', generateReport);

    // Teams slider + manual input (keep in sync)
    const teamsSlider = $('#teams-slider');
    const teamsInput = $('#teams-input');

    function applyTeams(t, skipInput) {
      t = Math.max(3, Math.min(100, t));
      if (isNaN(t)) return;
      if (teamsSlider) teamsSlider.value = t;
      if (!skipInput && teamsInput) teamsInput.value = t;
      state.projectionTeams = t;
      if (state.reportLoaded) {
        const maxSpend = parseFloat($('#max-spend')?.value) || 60;
        renderHeatmap(state.avgTeams, maxSpend, state.projectionEvents, t);
      }
    }

    teamsSlider?.addEventListener('input', () => applyTeams(parseInt(teamsSlider.value, 10), false));
    // While typing, only move the slider — don't write back into the field
    teamsInput?.addEventListener('input', () => applyTeams(parseInt(teamsInput.value, 10), true));
    // On blur/enter, clamp and write back if needed
    teamsInput?.addEventListener('change', () => applyTeams(parseInt(teamsInput.value, 10), false));

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
