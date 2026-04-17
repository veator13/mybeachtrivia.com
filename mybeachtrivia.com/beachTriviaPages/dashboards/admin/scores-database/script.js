// script.js — Scores Database admin page
(function () {
  'use strict';

  if (window.__SCORES_DATABASE_SCRIPT_INIT__) return;
  window.__SCORES_DATABASE_SCRIPT_INIT__ = true;

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj || {}));
  }

  function naturalKeySort(a, b) {
    const ax = String(a || '');
    const bx = String(b || '');

    const aMatch = ax.match(/^([a-zA-Z_]+)(\d+)?$/);
    const bMatch = bx.match(/^([a-zA-Z_]+)(\d+)?$/);

    if (aMatch && bMatch && aMatch[1] === bMatch[1]) {
      const aNum = Number(aMatch[2] || 0);
      const bNum = Number(bMatch[2] || 0);
      return aNum - bNum;
    }
    return ax.localeCompare(bx, undefined, { numeric: true, sensitivity: 'base' });
  }

  function formatEventType(value) {
    const map = {
      classic_trivia: 'Classic Trivia',
      themed_trivia: 'Themed Trivia',
      music_bingo: 'Music Bingo',
      classic_bingo: 'Classic Bingo',
      survey_says: 'Survey Says',
      beach_feud: 'Beach Feud'
    };
    const key = normalizeText(value);
    return map[key] || String(value || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  }

  function compareDateStrings(dateA, dateB) {
    if (!dateA && !dateB) return 0;
    if (!dateA) return -1;
    if (!dateB) return 1;
    return String(dateA).localeCompare(String(dateB));
  }

  const state = {
    initialized: false,
    searchResults: [],
    loadedDocId: '',
    loadedDocData: null,
    originalDocData: null,
    isEditMode: false,
    user: null,
    employee: null,
  };

  const els = {
    form: $('#scores-search-form'),
    venueFilter: $('#venue-filter'),
    hostFilter: $('#host-filter'),
    eventTypeFilter: $('#event-type-filter'),
    dateStart: $('#date-start'),
    dateEnd: $('#date-end'),
    searchBtn: $('#run-search-btn'),
    clearBtn: $('#clear-search-btn'),
    searchStatus: $('#search-status'),
    resultsCount: $('#results-count'),
    resultsEmpty: $('#results-empty'),
    resultsTableBody: $('#results-table-body'),
    loadedStatus: $('#loaded-record-status'),
    loadedVenue: $('#loaded-venue'),
    loadedEventDate: $('#loaded-event-date'),
    loadedHost: $('#loaded-host'),
    loadedEventType: $('#loaded-event-type'),
    loadedDocId: $('#loaded-doc-id'),
    readonlyBanner: $('#scoresheet-readonly-banner'),
    editBanner: $('#scoresheet-edit-banner'),
    editBtn: $('#edit-scoresheet-btn'),
    updateBtn: $('#update-scoresheet-btn'),
    cancelEditBtn: $('#cancel-edit-btn'),
    standingsBtn: $('#standings-btn'),
    addTeamBtn: $('#add-team-btn'),
    sdButtonContainer: $('#sd-button-container'),
    mount: $('#scoresheet-mount'),
  };

  function getDb() {
    if (!window.firebase || !firebase.firestore) {
      throw new Error('Firebase Firestore is not available.');
    }
    return firebase.firestore();
  }

  function setSearchStatus(message) {
    if (els.searchStatus) els.searchStatus.textContent = message || '';
  }

  function setLoadedStatus(message) {
    if (els.loadedStatus) els.loadedStatus.textContent = message || '';
  }

  function setButtonsForMode() {
    const loaded = !!state.loadedDocId;
    const editing = state.isEditMode;

    // Edit Scoresheet — visible when loaded, grayed out while editing
    if (els.editBtn) {
      els.editBtn.style.display = loaded ? '' : 'none';
      els.editBtn.disabled = !loaded || editing;
    }
    // Update Existing Scoresheet — only while editing
    if (els.updateBtn) {
      els.updateBtn.style.display = editing ? '' : 'none';
      els.updateBtn.disabled = !editing;
    }
    // Cancel — only while editing, sits left of Edit Scoresheet
    if (els.cancelEditBtn) {
      els.cancelEditBtn.style.display = editing ? '' : 'none';
    }
    // Button bar above table — visible any time a scoresheet is loaded
    if (els.sdButtonContainer) {
      els.sdButtonContainer.style.display = loaded ? 'flex' : 'none';
    }
    // Standings — always visible when loaded (button bar handles it)
    // (no extra display toggle needed; bar visibility covers it)
    // Add Team — only while editing
    if (els.addTeamBtn) {
      els.addTeamBtn.style.display = editing ? '' : 'none';
    }
    if (els.readonlyBanner) {
      els.readonlyBanner.style.display = loaded && !editing ? '' : 'none';
    }
    if (els.editBanner) {
      els.editBanner.style.display = editing ? '' : 'none';
    }
  }

  function renderEmptyMount(message) {
    if (!els.mount) return;
    els.mount.innerHTML = `
      <div class="empty-state">
        <h3>${escapeHtml(message || 'No scoresheet loaded')}</h3>
        <p>Select a saved record from the results table to view it here.</p>
      </div>
    `;
  }

  function getSearchValues() {
    return {
      venue: normalizeText(els.venueFilter?.value),
      host: normalizeText(els.hostFilter?.value),
      eventType: normalizeText(els.eventTypeFilter?.value),
      dateStart: String(els.dateStart?.value || '').trim(),
      dateEnd: String(els.dateEnd?.value || '').trim(),
    };
  }

  function resetLoadedMetaFields() {
    if (els.loadedVenue) els.loadedVenue.value = '';
    if (els.loadedEventDate) els.loadedEventDate.value = '';
    if (els.loadedHost) els.loadedHost.value = '';
    if (els.loadedEventType) els.loadedEventType.value = '';
    if (els.loadedDocId) els.loadedDocId.value = '';
  }

  function resetLoadedState() {
    state.loadedDocId = '';
    state.loadedDocData = null;
    state.originalDocData = null;
    state.isEditMode = false;
    resetLoadedMetaFields();
    setLoadedStatus('No scoresheet loaded.');
    setButtonsForMode();
    renderEmptyMount('No scoresheet loaded');
  }

  function normalizeDocShape(docId, data) {
    const raw = deepClone(data || {});
    const meta = raw.meta || {};
    raw.meta = meta;

    if (!meta.eventType && raw.eventName) meta.eventType = raw.eventName;
    if (!raw.eventName && meta.eventType) raw.eventName = meta.eventType;
    if (!meta.venue && meta.venueName) meta.venue = meta.venueName;
    if (!meta.venueName && meta.venue) meta.venueName = meta.venue;
    if (!meta.submitterDisplayName) {
      meta.submitterDisplayName = [meta.submitterFirstName, meta.submitterLastName].filter(Boolean).join(' ').trim() || meta.submitterEmail || '';
    }
    raw.teams = safeArray(raw.teams).map((team, idx) => {
      const t = deepClone(team || {});
      t.teamId = t.teamId != null ? t.teamId : idx + 1;
      t.name = t.name || `Team ${idx + 1}`;
      t.answers = t.answers && typeof t.answers === 'object' ? t.answers : {};
      t.like = !!t.like;
      return t;
    });

    raw.__id = docId;
    return raw;
  }

  async function fetchScores() {
    const db = getDb();
    const { dateStart, dateEnd } = getSearchValues();

    let query = db.collection('scores');

    const useDateRange = !!(dateStart || dateEnd);
    if (useDateRange) {
      query = query.orderBy('meta.eventDate', 'desc');
      if (dateStart) query = query.where('meta.eventDate', '>=', dateStart);
      if (dateEnd) query = query.where('meta.eventDate', '<=', dateEnd);
      query = query.limit(300);
    } else {
      query = query.orderBy('createdAt', 'desc').limit(300);
    }

    const snap = await query.get();
    return snap.docs.map(doc => normalizeDocShape(doc.id, doc.data()));
  }

  function filterScores(items) {
    const { venue, host, eventType, dateStart, dateEnd } = getSearchValues();

    return items.filter((item) => {
      const meta = item.meta || {};
      const venueValue = normalizeText(meta.venueName || meta.venue || '');
      const hostValue = normalizeText(
        meta.submitterDisplayName ||
        [meta.submitterFirstName, meta.submitterLastName].filter(Boolean).join(' ') ||
        meta.submitterEmail ||
        ''
      );
      const eventTypeValue = normalizeText(meta.eventType || item.eventName || '');
      const eventDate = String(meta.eventDate || '');

      if (venue && !venueValue.includes(venue)) return false;
      if (host && !hostValue.includes(host)) return false;
      if (eventType && eventTypeValue !== eventType) return false;
      if (dateStart && compareDateStrings(eventDate, dateStart) < 0) return false;
      if (dateEnd && compareDateStrings(eventDate, dateEnd) > 0) return false;

      return true;
    });
  }

  function renderResultsTable() {
    if (!els.resultsTableBody) return;

    if (!state.searchResults.length) {
      els.resultsTableBody.innerHTML = '';
      if (els.resultsEmpty) els.resultsEmpty.style.display = '';
      if (els.resultsCount) els.resultsCount.textContent = '0 results';
      return;
    }

    if (els.resultsEmpty) els.resultsEmpty.style.display = 'none';
    if (els.resultsCount) {
      els.resultsCount.textContent = `${state.searchResults.length} result${state.searchResults.length === 1 ? '' : 's'}`;
    }

    els.resultsTableBody.innerHTML = state.searchResults.map((item) => {
      const meta = item.meta || {};
      const hostName =
        meta.submitterDisplayName ||
        [meta.submitterFirstName, meta.submitterLastName].filter(Boolean).join(' ') ||
        meta.submitterEmail ||
        '—';

      return `
        <tr data-doc-id="${escapeHtml(item.__id)}">
          <td>${escapeHtml(formatDate(meta.eventDate || ''))}</td>
          <td>${escapeHtml(meta.venueName || meta.venue || '—')}</td>
          <td>${escapeHtml(hostName)}</td>
          <td><span class="result-badge">${escapeHtml(formatEventType(meta.eventType || item.eventName || ''))}</span></td>
          <td>${escapeHtml(String(item.teamCount != null ? item.teamCount : safeArray(item.teams).length))}</td>
          <td>${escapeHtml(formatDateTime(item.submittedAt || item.timestamp || ''))}</td>
          <td>
            <div class="result-actions">
              <button class="btn btn-secondary js-open-score" type="button" data-doc-id="${escapeHtml(item.__id)}">
                Open
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    els.resultsTableBody.querySelectorAll('.js-open-score').forEach((btn) => {
      btn.addEventListener('click', () => {
        const docId = btn.getAttribute('data-doc-id') || '';
        if (docId) loadScoresheet(docId);
      });
    });
  }

  function getDisplayHost(meta) {
    return (
      meta.submitterDisplayName ||
      [meta.submitterFirstName, meta.submitterLastName].filter(Boolean).join(' ') ||
      meta.submitterEmail ||
      ''
    );
  }

  function populateLoadedMetaFields() {
    if (!state.loadedDocData) return;

    const meta = state.loadedDocData.meta || {};
    if (els.loadedVenue) els.loadedVenue.value = meta.venueName || meta.venue || '';
    if (els.loadedEventDate) els.loadedEventDate.value = meta.eventDate || '';
    if (els.loadedHost) els.loadedHost.value = getDisplayHost(meta);
    if (els.loadedEventType) els.loadedEventType.value = formatEventType(meta.eventType || state.loadedDocData.eventName || '');
    if (els.loadedDocId) els.loadedDocId.value = state.loadedDocId || '';
  }

  function getAnswerKeysFromTeams(teams) {
    const set = new Set();
    safeArray(teams).forEach((team) => {
      const answers = team && team.answers && typeof team.answers === 'object' ? team.answers : {};
      Object.keys(answers).forEach((key) => set.add(key));
    });

    const defaults = [
      'q1','q2','q3','q4','q5','q6','q7','q8','q9','q10',
      'q11','q12','q13','q14','q15','q16','q17','q18','q19','q20',
      'bonus','halfTime','finalQuestion','finalScore'
    ];
    defaults.forEach((key) => set.add(key));

    return Array.from(set).sort(naturalKeySort);
  }

  function renderLoadedScoresheet() {
    if (!els.mount) return;

    if (!state.loadedDocData) {
      renderEmptyMount('No scoresheet loaded');
      return;
    }

    // Hide the stale placeholder text once a scoresheet is loaded
    const placeholder = document.querySelector('.scoresheet-placeholder');
    if (placeholder) placeholder.style.display = 'none';

    const doc = state.loadedDocData;
    const teams = safeArray(doc.teams);
    const readonly = !state.isEditMode;
    const ro = readonly ? 'readonly' : '';
    const dis = readonly ? 'disabled' : '';

    // Get a numeric value from team, checking both team-level and answers sub-object
    function getField(team, field) {
      if (team[field] != null && team[field] !== '') return Number(team[field]) || 0;
      const ans = team.answers || {};
      if (ans[field] != null && ans[field] !== '') return Number(ans[field]) || 0;
      return 0;
    }

    // Get a question answer (q1–q20); empty string if truly missing
    function getAnswer(team, q) {
      const key = 'q' + q;
      const ans = team.answers || {};
      if (ans[key] != null) return Number(ans[key]) || 0;
      if (team[key] != null) return Number(team[key]) || 0;
      return 0;
    }

    function calcTotal(vals) {
      return vals.reduce(function(a, b) { return a + (Number(b) || 0); }, 0);
    }

    // Inline style for round-total spans (matches host scoresheet exactly)
    var totalSpanStyle = 'font-size:18px;color:#80d4ff;text-shadow:0px 0px 6px rgba(128,212,255,0.5);font-weight:bold;';

    const rows = teams.map(function(team, idx) {
      var q = [];
      for (var i = 1; i <= 20; i++) q.push(getAnswer(team, i));

      var halfTimeVal    = getField(team, 'halfTime');
      var finalQVal      = getField(team, 'finalQuestion');
      var bonusVal       = getField(team, 'bonus');
      var finalScoreVal  = getField(team, 'finalScore');

      var r1 = calcTotal(q.slice(0, 5));
      var r2 = calcTotal(q.slice(5, 10));
      var r3 = calcTotal(q.slice(10, 15));
      var r4 = calcTotal(q.slice(15, 20));
      var firstHalf  = r1 + r2 + halfTimeVal;
      var secondHalf = r3 + r4 + finalQVal;

      function qCell(qNum, val, cls) {
        return '<td><input type="number" step="1" class="' + cls + ' js-score-input"' +
          ' data-team-index="' + idx + '"' +
          ' data-answer-key="q' + qNum + '"' +
          ' value="' + escapeHtml(String(val)) + '"' +
          ' ' + ro + ' /></td>';
      }

      var q1to5   = q.slice(0,5).map(function(v,i){ return qCell(i+1,  v, 'round1-input'); }).join('');
      var q6to10  = q.slice(5,10).map(function(v,i){ return qCell(i+6,  v, 'round2-input'); }).join('');
      var q11to15 = q.slice(10,15).map(function(v,i){ return qCell(i+11, v, 'round3-input'); }).join('');
      var q16to20 = q.slice(15,20).map(function(v,i){ return qCell(i+16, v, 'round4-input'); }).join('');

      return '<tr data-team-index="' + idx + '">' +
        // Sticky left — Team Name + LIKE checkbox (mirrors host scoresheet structure exactly)
        '<td class="sticky-col">' +
          '<input type="text" class="teamName js-team-name" data-team-index="' + idx + '"' +
            ' value="' + escapeHtml(team.name || '') + '"' +
            ' placeholder="Team ' + (idx + 1) + '" ' + ro + ' />' +
          '<label class="teamCheckboxWrapper">' +
            '<input type="checkbox" class="teamCheckbox js-team-like" data-team-index="' + idx + '"' +
              (team.like ? ' checked' : '') + ' ' + dis + ' />' +
            '<span class="teamCheckboxIcon" aria-hidden="true"></span>' +
            '<span class="teamCheckboxLike">LIKE</span>' +
          '</label>' +
        '</td>' +
        q1to5 +
        '<td class="round1-total"><span style="' + totalSpanStyle + '">' + r1 + '</span></td>' +
        q6to10 +
        '<td><span style="' + totalSpanStyle + '">' + r2 + '</span></td>' +
        '<td><input type="number" step="1" class="halftime-input js-score-input"' +
          ' data-team-index="' + idx + '" data-answer-key="halfTime"' +
          ' value="' + escapeHtml(String(halfTimeVal)) + '" ' + ro + ' /></td>' +
        '<td><span class="first-half-total">' + firstHalf + '</span></td>' +
        q11to15 +
        '<td><span style="' + totalSpanStyle + '">' + r3 + '</span></td>' +
        q16to20 +
        '<td><span style="' + totalSpanStyle + '">' + r4 + '</span></td>' +
        '<td><input type="number" step="1" class="finalquestion-input js-score-input"' +
          ' data-team-index="' + idx + '" data-answer-key="finalQuestion"' +
          ' value="' + escapeHtml(String(finalQVal)) + '" ' + ro + ' /></td>' +
        '<td><span class="second-half-total">' + secondHalf + '</span></td>' +
        '<td class="bonus-col-right">' +
          '<input type="number" step="1" min="0" class="js-score-input"' +
            ' data-team-index="' + idx + '" data-answer-key="bonus"' +
            ' value="' + escapeHtml(String(bonusVal)) + '" ' + ro + ' /></td>' +
        '<td class="sticky-col-right"><span>' + finalScoreVal + '</span></td>' +
      '</tr>';
    }).join('');

    els.mount.innerHTML =
      '<div class="sd-table-wrapper">' +
        '<table id="sdTeamTable">' +
          '<thead>' +
            '<tr class="top_row">' +
              '<th class="sticky-col" rowspan="2">Team Name</th>' +
              '<th colspan="5">Round 1</th>' +
              '<th rowspan="2">R1 Total</th>' +
              '<th colspan="5">Round 2</th>' +
              '<th rowspan="2">R2 Total</th>' +
              '<th rowspan="2">Half Time</th>' +
              '<th rowspan="2">First Half Total</th>' +
              '<th colspan="5">Round 3</th>' +
              '<th rowspan="2">R3 Total</th>' +
              '<th colspan="5">Round 4</th>' +
              '<th rowspan="2">R4 Total</th>' +
              '<th rowspan="2">Final Question</th>' +
              '<th rowspan="2">Second Half Total</th>' +
              '<th class="bonus-col-right" rowspan="2">Bonus</th>' +
              '<th class="sticky-col-right" rowspan="2">Final Score</th>' +
            '</tr>' +
            '<tr class="top_row">' +
              '<th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Q5</th>' +
              '<th>Q6</th><th>Q7</th><th>Q8</th><th>Q9</th><th>Q10</th>' +
              '<th>Q11</th><th>Q12</th><th>Q13</th><th>Q14</th><th>Q15</th>' +
              '<th>Q16</th><th>Q17</th><th>Q18</th><th>Q19</th><th>Q20</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>';
  }

  // ---- Standings modal ------------------------------------------------

  let _standingsAscending = false; // false = High→Low (default), true = Low→High

  function _setFlipButtonText(btn) {
    if (!btn) return;
    btn.textContent = _standingsAscending ? 'Low → High' : 'High → Low';
    btn.setAttribute('aria-pressed', _standingsAscending ? 'true' : 'false');
  }

  function _renderStandingsList() {
    const teams = safeArray(state.loadedDocData?.teams);
    const list  = document.getElementById('sdModalRankingList');
    if (!list) return;

    const mapped = teams
      .filter(t => t && t.name && String(t.name).trim())
      .map(t => ({
        name:       String(t.name).trim(),
        score:      Number(t.finalScore)    || 0,
        firstHalf:  Number(t.firstHalfTotal != null ? t.firstHalfTotal : t.halfTime)        || 0,
        secondHalf: Number(t.secondHalfTotal != null ? t.secondHalfTotal : t.finalQuestion) || 0,
      }));

    mapped.sort((a, b) => _standingsAscending ? a.score - b.score : b.score - a.score);

    const n = mapped.length;
    list.innerHTML = '';
    mapped.forEach((team, i) => {
      // Rank # always reflects highest-score = #1
      const rankNum = _standingsAscending ? n - i : i + 1;

      const li = document.createElement('li');
      li.textContent = `#${rankNum} ${team.name} — Score: ${team.score} (First Half: ${team.firstHalf}, Second Half: ${team.secondHalf})`;

      if (rankNum === 1)      { li.style.borderLeft = '6px solid gold';    li.style.background = 'linear-gradient(to right, #3a3a3a, #4a4a4a)'; }
      else if (rankNum === 2) { li.style.borderLeft = '6px solid silver'; }
      else if (rankNum === 3) { li.style.borderLeft = '6px solid #cd7f32'; }

      list.appendChild(li);
    });
  }

  function showStandingsModal() {
    const teams = safeArray(state.loadedDocData?.teams);
    if (!teams.length) return;

    const modal   = document.getElementById('standingsModal');
    const flipBtn = document.getElementById('btnInvertStandings');
    if (!modal) return;

    // Wire flip button once
    if (flipBtn && !flipBtn.dataset.boundFlip) {
      flipBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        _standingsAscending = !_standingsAscending;
        _setFlipButtonText(flipBtn);
        _renderStandingsList();
      }, true);
      flipBtn.dataset.boundFlip = '1';
    }

    _setFlipButtonText(flipBtn);
    _renderStandingsList();
    modal.style.display = 'block';
  }

  function closeStandingsModal() {
    const modal = document.getElementById('standingsModal');
    if (modal) modal.style.display = 'none';
  }

  // ---- End standings modal --------------------------------------------

  function enterReadOnlyMode() {
    state.isEditMode = false;

    if (state.originalDocData) {
      state.loadedDocData = deepClone(state.originalDocData);
      populateLoadedMetaFields();
    }

    setLoadedStatus('Scoresheet loaded in read-only mode.');
    setButtonsForMode();
    renderLoadedScoresheet();
  }

  function enterEditMode() {
    if (!state.loadedDocData) return;
    state.isEditMode = true;
    setLoadedStatus('Editing enabled. Updating will overwrite the existing saved scoresheet.');
    setButtonsForMode();
    renderLoadedScoresheet();
  }

  async function loadScoresheet(docId) {
    try {
      setLoadedStatus('Loading scoresheet...');
      const db = getDb();
      const snap = await db.collection('scores').doc(docId).get();

      if (!snap.exists) {
        throw new Error('That scoresheet could not be found.');
      }

      const data = normalizeDocShape(snap.id, snap.data());
      state.loadedDocId = snap.id;
      state.originalDocData = deepClone(data);
      state.loadedDocData = deepClone(data);
      state.isEditMode = false;

      populateLoadedMetaFields();
      setLoadedStatus(`Loaded scoresheet ${docId}.`);
      setButtonsForMode();
      renderLoadedScoresheet();
    } catch (err) {
      console.error('[scores-database] loadScoresheet error:', err);
      setLoadedStatus(err?.message || 'Failed to load scoresheet.');
      renderEmptyMount('Failed to load scoresheet');
    }
  }

  function parseInputNumber(value) {
    const trimmed = String(value == null ? '' : value).trim();
    if (trimmed === '') return 0;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : 0;
  }

  function collectEditedDocFromUI() {
    if (!state.loadedDocData) {
      throw new Error('No scoresheet is currently loaded.');
    }

    const updated = deepClone(state.loadedDocData);
    const meta = updated.meta || {};
    updated.meta = meta;

    meta.venue = String(els.loadedVenue?.value || '').trim();
    meta.venueName = meta.venue;
    meta.eventDate = String(els.loadedEventDate?.value || '').trim();
    meta.eventType = normalizeText(els.loadedEventType?.value).replace(/\s+/g, '_');
    updated.eventName = meta.eventType || updated.eventName || '';
    updated.themeName = formatEventType(meta.eventType || updated.eventName || '');
    meta.submitterDisplayName = String(els.loadedHost?.value || '').trim();

    const teamRows = Array.from(els.mount?.querySelectorAll('tbody tr[data-team-index]') || []);
    updated.teams = teamRows.map((row, idx) => {
      const teamIndex = Number(row.getAttribute('data-team-index'));
      const existingTeam = (state.loadedDocData.teams || [])[teamIndex] || {};
      const team = deepClone(existingTeam);

      team.name = String(row.querySelector('.js-team-name')?.value || '').trim();

      // Only overwrite teamId if there's an explicit input for it; otherwise preserve original
      const teamIdInput = row.querySelector('.js-team-id');
      if (teamIdInput) {
        team.teamId = parseInputNumber(teamIdInput.value);
      }

      team.like = !!row.querySelector('.js-team-like')?.checked;
      team.answers = team.answers && typeof team.answers === 'object' ? team.answers : {};

      // Read q1–q20 into answers; mirror halfTime/finalQuestion/bonus at team level too
      row.querySelectorAll('.js-score-input').forEach((input) => {
        const key = String(input.getAttribute('data-answer-key') || '').trim();
        if (!key) return;
        const val = parseInputNumber(input.value);
        team.answers[key] = val;
        if (key === 'halfTime' || key === 'finalQuestion' || key === 'bonus') {
          team[key] = val;
        }
      });

      // Recalculate finalScore from inputs
      {
        const q = [];
        for (let qi = 1; qi <= 20; qi++) q.push(parseInputNumber(team.answers['q' + qi]));
        const r1 = q.slice(0,5).reduce((a,b) => a+b, 0);
        const r2 = q.slice(5,10).reduce((a,b) => a+b, 0);
        const r3 = q.slice(10,15).reduce((a,b) => a+b, 0);
        const r4 = q.slice(15,20).reduce((a,b) => a+b, 0);
        const fs = r1 + r2 + parseInputNumber(team.halfTime) +
                   r3 + r4 + parseInputNumber(team.finalQuestion) +
                   parseInputNumber(team.bonus);
        team.finalScore = fs;
        team.answers.finalScore = fs;
      }

      return team;
    });

    updated.teamCount = updated.teams.length;
    updated.timestamp = new Date().toISOString();
    updated.submittedAt = new Date().toISOString();
    updated.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    return updated;
  }

  async function updateExistingScoresheet() {
    if (!state.loadedDocId) return;

    try {
      if (els.updateBtn) {
        els.updateBtn.disabled = true;
        els.updateBtn.textContent = 'Updating...';
      }

      const updatedDoc = collectEditedDocFromUI();
      const db = getDb();

      await db.collection('scores').doc(state.loadedDocId).set(updatedDoc, { merge: true });

      state.originalDocData = normalizeDocShape(state.loadedDocId, updatedDoc);
      state.loadedDocData = deepClone(state.originalDocData);
      state.isEditMode = false;

      setLoadedStatus(`Updated scoresheet ${state.loadedDocId}.`);
      setButtonsForMode();
      populateLoadedMetaFields();
      renderLoadedScoresheet();

      const idx = state.searchResults.findIndex((item) => item.__id === state.loadedDocId);
      if (idx >= 0) {
        state.searchResults[idx] = normalizeDocShape(state.loadedDocId, updatedDoc);
        renderResultsTable();
      }
    } catch (err) {
      console.error('[scores-database] updateExistingScoresheet error:', err);
      setLoadedStatus(err?.message || 'Failed to update scoresheet.');
      alert(err?.message || 'Failed to update scoresheet.');
    } finally {
      if (els.updateBtn) {
        els.updateBtn.disabled = !state.isEditMode;
        els.updateBtn.textContent = 'Update Existing Scoresheet';
      }
    }
  }

  async function runSearch(evt) {
    if (evt) evt.preventDefault();

    try {
      if (els.searchBtn) {
        els.searchBtn.disabled = true;
        els.searchBtn.textContent = 'Searching...';
      }

      setSearchStatus('Searching scores collection...');
      const raw = await fetchScores();
      state.searchResults = filterScores(raw);
      renderResultsTable();

      setSearchStatus(
        state.searchResults.length
          ? `Showing ${state.searchResults.length} matching scoresheet${state.searchResults.length === 1 ? '' : 's'}.`
          : 'No matching scoresheets found.'
      );
    } catch (err) {
      console.error('[scores-database] runSearch error:', err);
      state.searchResults = [];
      renderResultsTable();
      setSearchStatus(err?.message || 'Search failed.');
    } finally {
      if (els.searchBtn) {
        els.searchBtn.disabled = false;
        els.searchBtn.textContent = 'Search';
      }
    }
  }

  function clearSearch() {
    if (els.form) els.form.reset();
    state.searchResults = [];
    renderResultsTable();
    setSearchStatus('Search filters cleared.');
  }

  function attachEvents() {
    els.form?.addEventListener('submit', runSearch);
    els.clearBtn?.addEventListener('click', clearSearch);
    els.editBtn?.addEventListener('click', enterEditMode);
    els.updateBtn?.addEventListener('click', updateExistingScoresheet);

    // Cancel — exit edit mode without saving
    els.cancelEditBtn?.addEventListener('click', enterReadOnlyMode);

    // Standings — show full standings modal
    els.standingsBtn?.addEventListener('click', showStandingsModal);

    // Close modal via × button
    document.getElementById('standings-modal-close')?.addEventListener('click', closeStandingsModal);

    // Close modal when clicking backdrop
    document.getElementById('standingsModal')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('standingsModal')) closeStandingsModal();
    });

    // Add Team — only active in edit mode
    els.addTeamBtn?.addEventListener('click', () => {
      if (typeof window.addTeam === 'function') {
        window.addTeam();
      }
    });
  }

  function start(detail) {
    if (state.initialized) return;
    state.initialized = true;

    state.user = detail?.user || window.__SCORES_DATABASE_USER__ || null;
    state.employee = detail?.emp || window.__SCORES_DATABASE_EMPLOYEE__ || null;

    attachEvents();
    resetLoadedState();
    renderResultsTable();
    setSearchStatus('Ready to search saved scoresheets.');

    const today = new Date();
    const prior = new Date(today);
    prior.setDate(today.getDate() - 30);

    if (els.dateEnd && !els.dateEnd.value) {
      els.dateEnd.value = today.toISOString().slice(0, 10);
    }
    if (els.dateStart && !els.dateStart.value) {
      els.dateStart.value = prior.toISOString().slice(0, 10);
    }

    runSearch();
  }

  document.addEventListener('scores-database:boot-ready', (ev) => {
    start(ev.detail || {});
  });

  document.addEventListener('scores-database:auth-ready', (ev) => {
    if (!state.initialized && window.__SCORES_DATABASE_AUTH_READY__) {
      start(ev.detail || {});
    }
  });

  if (window.__SCORES_DATABASE_AUTH_READY__) {
    start({
      user: window.__SCORES_DATABASE_USER__ || null,
      emp: window.__SCORES_DATABASE_EMPLOYEE__ || null,
    });
  }
})();