// live-console/app.js v8

(function () {
  'use strict';

  var WRITER_ASSETS = '/beachTriviaPages/dashboards/writer/assets/images/';

  var DISPLAY_BLOCK_TYPES = ['intro-slide', 'info-slide', 'round-start', 'category-slide'];

  const state = {
    shows: [],
    deck: { id: null, title: '', theme: 'Standard Trivia', slides: [] },
    hostSlide: 0,
    castSlide: 0,
    hostRevealed: false,
    revealed: false,
    live: false,
    sessionCode: 'BT-' + Math.floor(1000 + Math.random() * 9000),
  };

  const dom = {};

  // ── Boot ───────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    cachedom();
    bindui();
    waitForFirebase(function () {
      firebase.auth().onAuthStateChanged(function (user) {
        if (!user) { window.location.assign('/login.html'); return; }
        firebase.firestore().collection('employees').doc(user.uid).get()
          .then(function (snap) {
            const emp = snap.exists ? (snap.data() || {}) : {};
            if (!snap.exists || emp.active === false) { showError('Account not active.'); return; }
            const roles = [].concat(Array.isArray(emp.roles) ? emp.roles : [], emp.role ? [emp.role] : []);
            const ok = roles.some(function (r) { return r === 'host' || r === 'admin' || r === 'writer'; });
            if (!ok) { showError('You do not have host access.'); return; }
            onAuthed();
          })
          .catch(function () { showError('Could not verify access.'); });
      });
    });
  });

  function onAuthed() {
    hide('auth-loading');
    updateCastUrl();
    loadShows();
  }

  function waitForFirebase(cb, n) {
    if (window.firebase && window.firebase.auth && window.firebase.firestore) { cb(); return; }
    if ((n || 0) > 50) { showError('Firebase failed to load.'); return; }
    setTimeout(function () { waitForFirebase(cb, (n || 0) + 1); }, 100);
  }

  // ── DOM ────────────────────────────────────────────────────────────────────

  function cachedom() {
    [
      'auth-loading', 'error-container', 'error-text', 'back-to-login',
      'show-picker', 'show-select', 'btn-load-show',
      'console', 'console-show-name', 'console-slide-count',
      'cast-url', 'btn-copy-url', 'btn-go-live', 'btn-change-show',
      'btn-prev', 'btn-next', 'btn-cast-prev', 'btn-cast-next',
      'btn-reveal', 'btn-hide',
      'host-slide-count', 'cast-slide-count',
      'btn-host-reveal', 'btn-host-hide',
      'host-stage', 'cast-stage',
      'host-notes',
      'cast-chip', 'cast-status-label',
    ].forEach(function (id) {
      dom[id] = document.getElementById(id);
    });
  }

  function bindui() {
    on('back-to-login', 'click', function () { window.location.assign('/login.html'); });

    on('show-select', 'change', function () {
      if (dom['show-select']) {
        dom['btn-load-show'].disabled = !dom['show-select'].value;
      }
    });

    on('btn-load-show', 'click', loadSelectedShow);
    on('btn-change-show', 'click', backToPicker);

    on('btn-copy-url', 'click', function () {
      copyText(state.sessionCode
        ? (window.location.origin + '/cast-game/?code=' + encodeURIComponent(state.sessionCode))
        : '');
      flash(dom['btn-copy-url'], 'Copied!');
    });

    on('btn-go-live', 'click', toggleLive);

    on('btn-prev',      'click', function () { stepHost(-1); });
    on('btn-next',      'click', function () { stepHost(1); });
    on('btn-cast-prev', 'click', function () { stepCast(-1); });
    on('btn-cast-next', 'click', function () { stepCast(1); });

    on('btn-host-reveal', 'click', function () { setHostRevealed(true); });
    on('btn-host-hide',   'click', function () { setHostRevealed(false); });

    on('btn-reveal', 'click', function () { setRevealed(true); });
    on('btn-hide',   'click', function () { setRevealed(false); });
  }

  // ── Shows ──────────────────────────────────────────────────────────────────

  function loadShows() {
    firebase.firestore().collection('publishedShows')
      .orderBy('lastTouchedAt', 'desc')
      .get()
      .then(function (snap) {
        state.shows = snap.docs.map(function (d) {
          const data = d.data() || {};
          data.__id = d.id;
          return data;
        });
        populatePicker();
        show('show-picker', 'flex');
      })
      .catch(function (err) {
        console.error('[live-console] loadShows:', err);
        show('show-picker', 'flex');
      });
  }

  function populatePicker() {
    const sel = dom['show-select'];
    if (!sel) return;
    sel.innerHTML = '';

    if (!state.shows.length) {
      sel.innerHTML = '<option value="">No published shows found</option>';
      return;
    }

    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '— Select a show —';
    sel.appendChild(blank);

    state.shows.forEach(function (s) {
      const opt = document.createElement('option');
      opt.value = s.__id;
      const title = (s.show && s.show.title) || 'Untitled';
      const date = (s.show && s.show.dateLabel) ? '  •  ' + s.show.dateLabel : '';
      opt.textContent = title + date;
      sel.appendChild(opt);
    });

    const today = state.shows.find(matchesToday);
    if (today) {
      sel.value = today.__id;
      dom['btn-load-show'].disabled = false;
    }
  }

  function matchesToday(s) {
    const label = String((s.show && s.show.dateLabel) || '').toLowerCase();
    const now = new Date();
    const month = now.toLocaleString('en-US', { month: 'long' }).toLowerCase();
    const day = String(now.getDate());
    return label.includes(month) && label.includes(day);
  }

  function loadSelectedShow() {
    const sel = dom['show-select'];
    if (!sel || !sel.value) return;
    const id = sel.value;
    const cached = state.shows.find(function (s) { return s.__id === id; });
    if (cached) { mountShow(cached); return; }

    dom['btn-load-show'].disabled = true;
    dom['btn-load-show'].textContent = 'Loading…';

    firebase.firestore().collection('publishedShows').doc(id).get()
      .then(function (snap) {
        if (!snap.exists) { alert('Show not found.'); return; }
        const data = snap.data() || {};
        data.__id = snap.id;
        mountShow(data);
      })
      .catch(function (err) {
        console.error('[live-console] loadSelectedShow:', err);
        dom['btn-load-show'].disabled = false;
        dom['btn-load-show'].textContent = 'Load Show';
      });
  }

  function mountShow(data) {
    state.deck.id    = data.__id;
    state.deck.title = (data.show && data.show.title) || 'Untitled Show';
    state.deck.slides = flattenSlides(data);
    state.hostSlide    = 0;
    state.castSlide    = 0;
    state.hostRevealed = false;
    state.revealed     = false;
    state.live         = false;

    setText('console-show-name', state.deck.title);
    updateCastUrl();
    updateLiveButton();
    updateSlideCount();

    hide('show-picker');
    show('console', 'flex');
    render();
  }

  function backToPicker() {
    state.live = false;
    hide('console');
    show('show-picker', 'flex');
    dom['btn-load-show'].disabled = !dom['show-select'].value;
    dom['btn-load-show'].textContent = 'Load Show';
  }

  // ── Slides ─────────────────────────────────────────────────────────────────

  function flattenSlides(data) {
    const blocks = Array.isArray(data.blocks) ? data.blocks : [];
    const slides = [];
    blocks.forEach(function (entry) {
      const block = entry && entry.block;
      if (!block) return;
      const roundBadge = block.roundName || block.label || '';
      (Array.isArray(block.slides) ? block.slides : []).forEach(function (s) {
        var isTitle = (s.kind === 'title' || s.type === 'title' || block.type === 'title');
        var showTitle = (data.show && data.show.title) || '';
        var showDate  = (data.show && data.show.dateLabel) || '';
        slides.push({
          stateKey:      s.stateKey    || '',
          stateLabel:    s.stateLabel  || (isTitle ? 'Title Slide' : ''),
          roundBadge:    s.title       || roundBadge,
          category:      s.categoryName || s.category || block.categoryName || (isTitle ? showDate : ''),
          question:      s.prompt      || s.question  || (isTitle ? showTitle : ''),
          options:       Array.isArray(s.options) ? s.options.filter(Boolean) : [],
          matchingPairs: Array.isArray(s.matchingPairs) ? s.matchingPairs : [],
          orderingItems: Array.isArray(s.orderingItems) ? s.orderingItems : [],
          answer:        s.answer      || '',
          notes:         s.notes       || '',
          theme:         s.themeStyle  || block.themeStyle || 'Standard Trivia',
          alwaysReveal:  !!(s.answerVisibleByDefault || s.kind === 'summary' || s.kind === 'answers-summary'),
          kind:          s.kind        || s.type       || (block.type === 'title' ? 'title' : 'question'),
          blockType:     block.type    || '',
          questionType:  s.questionType || block.questionType || 'multiple-choice',
        });
      });
    });
    return slides;
  }

  function stepHost(delta) {
    const max = state.deck.slides.length - 1;
    state.hostSlide = Math.max(0, Math.min(max, state.hostSlide + delta));
    state.hostRevealed = false;
    renderHost();
  }

  function setHostRevealed(val) {
    state.hostRevealed = val;
    renderHost();
  }

  function stepCast(delta) {
    const max = state.deck.slides.length - 1;
    const next = Math.max(0, Math.min(max, state.castSlide + delta));
    if (next === state.castSlide) return;
    state.castSlide = next;
    state.revealed = false;
    renderCast();
    pushState();
  }

  function setRevealed(val) {
    state.revealed = val;
    renderCast();
    pushState();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function render() {
    renderHost();
    renderCast();
  }

  function renderHost() {
    const total = state.deck.slides.length;
    const slide = state.deck.slides[state.hostSlide] || null;
    setText('host-slide-count', total ? (state.hostSlide + 1) + ' / ' + total : '');
    if (dom['btn-prev']) dom['btn-prev'].disabled = state.hostSlide === 0;
    if (dom['btn-next']) dom['btn-next'].disabled = state.hostSlide >= total - 1;

    if (!slide) return;
    var showHostAnswer = state.hostRevealed || slide.alwaysReveal;
    paintSlide(dom['host-stage'], slide, showHostAnswer);
    setText('host-notes', slide.notes || '');
  }

  function renderCast() {
    const total = state.deck.slides.length;
    const slide = state.deck.slides[state.castSlide] || null;
    setText('cast-slide-count', total ? (state.castSlide + 1) + ' / ' + total : '');
    if (dom['btn-cast-prev']) dom['btn-cast-prev'].disabled = state.castSlide === 0;
    if (dom['btn-cast-next']) dom['btn-cast-next'].disabled = state.castSlide >= total - 1;

    if (!slide) return;
    var showAnswer = state.revealed || slide.alwaysReveal;
    paintSlide(dom['cast-stage'], slide, showAnswer);
    setText('cast-status-label', showAnswer ? 'Answer visible to audience' : 'Answer hidden until revealed');
  }

  function isTitleSlide(slide) {
    if (!slide) return false;
    const kind = String(slide.kind || '').toLowerCase();
    const stateLabel = String(slide.stateLabel || '').toLowerCase();
    return kind === 'title' || stateLabel.includes('title slide');
  }

  // ── Slide painter ──────────────────────────────────────────────────────────

  function paintSlide(el, slide, revealed) {
    if (!el || !slide) return;

    var isTitle   = isTitleSlide(slide);
    var blockType = slide.blockType || slide.kind || '';
    var isDisplay = DISPLAY_BLOCK_TYPES.indexOf(blockType) !== -1
      || String(slide.questionType || '').toLowerCase() === 'display';
    var effectiveType = isDisplay ? 'display' : String(slide.questionType || 'multiple-choice').toLowerCase();

    el.setAttribute('data-block-type', blockType);

    // Title slide — show full overlay, nothing else needed
    var overlay = ensureTitleOverlay(el);
    if (isTitle) {
      overlay.style.display = 'flex';
      return;
    }
    overlay.style.display = 'none';

    // Ensure skeleton elements exist
    buildSkeleton(el);

    // Badge
    var badge = el.querySelector('.slide-badge');
    if (badge) badge.textContent = slide.roundBadge || '';

    // Meta stack (state label + theme)
    var meta = el.querySelector('.slide-meta-stack');
    if (meta) {
      meta.innerHTML = '';
      var stateEl = document.createElement('span');
      stateEl.textContent = slide.stateLabel || '';
      var themeEl = document.createElement('span');
      themeEl.textContent = slide.theme || '';
      meta.appendChild(stateEl);
      meta.appendChild(themeEl);
    }

    // Category (hidden on display-type slides)
    var cat = el.querySelector('.slide-category');
    if (cat) {
      cat.textContent = slide.category || '';
      cat.style.display = isDisplay ? 'none' : '';
    }

    // Question text
    var q = el.querySelector('.slide-question');
    if (q) {
      q.textContent = slide.question || '';
      if (blockType === 'answers-summary') {
        q.setAttribute('data-font-mode', 'summary');
        q.style.whiteSpace = 'pre-wrap';
      } else if (isDisplay) {
        q.setAttribute('data-font-mode', 'display');
        q.style.whiteSpace = '';
      } else {
        q.removeAttribute('data-font-mode');
        q.style.whiteSpace = '';
      }
    }

    // Options
    paintOptions(el, effectiveType, slide, revealed);

    // Answer panel (hidden for MC and display types; shown on reveal for others)
    var ansWrap  = el.querySelector('.slide-answer-preview');
    var ansValue = el.querySelector('.slide-answer-preview .value');
    if (ansWrap && ansValue) {
      var isMC = effectiveType === 'multiple-choice';
      var showAns = revealed && !isMC && !isDisplay && slide.answer;
      ansValue.textContent = slide.answer || '';
      ansWrap.style.display = showAns ? '' : 'none';
    }
  }

  function buildSkeleton(el) {
    if (el.querySelector('.slide-top')) return; // already built
    el.innerHTML = [
      '<div class="slide-top">',
      '  <span class="slide-badge"></span>',
      '  <div class="slide-meta-stack"></div>',
      '</div>',
      '<div class="slide-middle">',
      '  <div class="slide-category"></div>',
      '  <div class="slide-question"></div>',
      '  <div class="slide-options"></div>',
      '  <div class="slide-answer-preview" style="display:none">',
      '    <div class="label">Answer</div>',
      '    <div class="value"></div>',
      '  </div>',
      '</div>',
      '<div class="slide-bottom"></div>',
    ].join('');
  }

  function ensureTitleOverlay(el) {
    var overlay = el.querySelector('.slide-title-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'slide-title-overlay';
    overlay.style.display = 'none';

    var inner = document.createElement('div');
    inner.className = 'title-slide-inner';

    var eyebrowRow = document.createElement('div');
    eyebrowRow.className = 'title-slide-eyebrow-row';
    var lineL = document.createElement('div');
    lineL.className = 'title-slide-eyebrow-line';
    var eyebrow = document.createElement('div');
    eyebrow.className = 'title-slide-eyebrow';
    eyebrow.textContent = 'Beach Trivia Presents';
    var lineR = document.createElement('div');
    lineR.className = 'title-slide-eyebrow-line';
    eyebrowRow.appendChild(lineL);
    eyebrowRow.appendChild(eyebrow);
    eyebrowRow.appendChild(lineR);

    var heading = document.createElement('div');
    heading.className = 'title-slide-heading';
    heading.textContent = 'Trivia Night';

    var centerRow = document.createElement('div');
    centerRow.className = 'title-slide-center-row';

    var logoWrap = document.createElement('div');
    logoWrap.className = 'title-slide-logo';
    var logoImg = document.createElement('img');
    logoImg.src = WRITER_ASSETS + 'BTlogo-Round-Border.png';
    logoImg.alt = 'Beach Trivia';
    logoWrap.appendChild(logoImg);

    centerRow.appendChild(buildQRCard(WRITER_ASSETS + 'qr-virginia.jpg', 'Virginia'));
    centerRow.appendChild(logoWrap);
    centerRow.appendChild(buildQRCard(WRITER_ASSETS + 'qr-new-york.jpg', 'New York'));

    inner.appendChild(eyebrowRow);
    inner.appendChild(heading);
    inner.appendChild(centerRow);
    overlay.appendChild(inner);

    el.appendChild(overlay);
    return overlay;
  }

  function buildQRCard(src, label) {
    var card = document.createElement('div');
    card.className = 'title-slide-qr-card';
    var img = document.createElement('img');
    img.src = src;
    img.alt = label + ' QR Code';
    var lbl = document.createElement('div');
    lbl.className = 'title-slide-qr-label';
    lbl.textContent = label;
    var hint = document.createElement('div');
    hint.className = 'title-slide-qr-hint';
    hint.textContent = 'Scan to play';
    card.appendChild(img);
    card.appendChild(lbl);
    card.appendChild(hint);
    return card;
  }

  function paintOptions(el, effectiveType, slide, revealed) {
    var optEl = el.querySelector('.slide-options');
    if (!optEl) return;
    optEl.innerHTML = '';
    optEl.classList.remove('slide-options-matching', 'slide-options-display', 'slide-options--dense');

    if (effectiveType === 'multiple-choice') {
      var opts = Array.isArray(slide.options) ? slide.options.filter(Boolean) : [];
      if (!opts.length) { optEl.style.display = 'none'; return; }
      optEl.style.display = '';
      optEl.classList.toggle('slide-options--dense', opts.length >= 5);
      opts.forEach(function (opt, i) {
        var row = document.createElement('div');
        var isCorrect = revealed && opt === slide.answer;
        row.className = 'slide-option' + (revealed ? (isCorrect ? ' correct' : ' incorrect') : '');
        var key = document.createElement('span');
        key.className = 'slide-option-key';
        key.textContent = String.fromCharCode(65 + i);
        var txt = document.createElement('span');
        txt.textContent = opt;
        row.appendChild(key);
        row.appendChild(txt);
        if (isCorrect) {
          var tick = document.createElement('span');
          tick.className = 'slide-option-tick';
          tick.textContent = '✓';
          row.appendChild(tick);
        }
        optEl.appendChild(row);
      });

    } else if (effectiveType === 'matching') {
      var pairs = Array.isArray(slide.matchingPairs)
        ? slide.matchingPairs.filter(function (p) { return p.left || p.right; })
        : [];
      if (!pairs.length) { optEl.style.display = 'none'; return; }
      optEl.style.display = '';
      optEl.classList.add('slide-options-matching');
      pairs.forEach(function (pair) {
        var row = document.createElement('div');
        row.className = 'slide-option slide-option-pair';
        var left = document.createElement('span');
        left.className = 'slide-option-pair-left';
        left.textContent = pair.left || '';
        var arrow = document.createElement('span');
        arrow.className = 'slide-option-pair-arrow';
        arrow.textContent = '→';
        var right = document.createElement('span');
        right.className = 'slide-option-pair-right';
        right.textContent = pair.right || '';
        row.appendChild(left);
        row.appendChild(arrow);
        row.appendChild(right);
        optEl.appendChild(row);
      });

    } else if (effectiveType === 'ordering') {
      var items = Array.isArray(slide.orderingItems) ? slide.orderingItems.filter(Boolean) : [];
      if (!items.length) { optEl.style.display = 'none'; return; }
      optEl.style.display = '';
      items.forEach(function (item, i) {
        var row = document.createElement('div');
        row.className = 'slide-option';
        var key = document.createElement('span');
        key.className = 'slide-option-key';
        key.textContent = String(i + 1);
        var txt = document.createElement('span');
        txt.textContent = item;
        row.appendChild(key);
        row.appendChild(txt);
        optEl.appendChild(row);
      });

    } else if (effectiveType === 'display') {
      var text = String(slide.answer || '').trim();
      if (!text) { optEl.style.display = 'none'; return; }
      optEl.style.display = '';
      optEl.classList.add('slide-options-display');
      var body = document.createElement('div');
      body.className = 'slide-display-content';
      var lines = text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      if (lines.length > 1) {
        lines.forEach(function (line) {
          var item = document.createElement('div');
          var lineText = line.charAt(0) === '•' ? line.substring(1).trim() : line;
          item.className = 'slide-rules-item' + (lineText.length > 58 ? ' slide-rules-item--wide' : '');
          if (line.charAt(0) === '•') {
            var bullet = document.createElement('span');
            bullet.className = 'slide-rules-bullet';
            bullet.textContent = '•';
            var span = document.createElement('span');
            span.textContent = lineText;
            item.appendChild(bullet);
            item.appendChild(span);
          } else {
            item.textContent = line;
          }
          body.appendChild(item);
        });
      } else {
        body.textContent = text;
      }
      optEl.appendChild(body);

    } else {
      optEl.style.display = 'none';
    }
  }

  function updateSlideCount() {
    setText('console-slide-count', state.deck.slides.length ? state.deck.slides.length + ' slides' : '');
  }

  // ── Casting ────────────────────────────────────────────────────────────────

  function toggleLive() {
    state.live = !state.live;
    updateLiveButton();
    if (state.live) pushState();
  }

  function updateLiveButton() {
    const btn = dom['btn-go-live'];
    if (!btn) return;
    if (state.live) {
      btn.textContent = '● Live';
      btn.classList.add('active');
    } else {
      btn.textContent = 'Go Live';
      btn.classList.remove('active');
    }
    if (dom['cast-chip']) {
      dom['cast-chip'].className = 'vp-chip ' + (state.live ? 'live' : 'cast');
      dom['cast-chip'].textContent = state.live ? 'Cast Live' : 'Cast Preview';
    }
  }

  function updateCastUrl() {
    const url = window.location.origin + '/cast-game/?code=' + encodeURIComponent(state.sessionCode);
    if (dom['cast-url']) dom['cast-url'].value = url;
  }

  function pushState() {
    if (!state.live) return;
    const slide = state.deck.slides[state.castSlide] || {};
    const showAnswer = state.revealed || slide.alwaysReveal;

    firebase.firestore().collection('liveSessions').doc(state.sessionCode).set({
      sessionCode:     state.sessionCode,
      currentStateKey: slide.stateKey || '',
      castSlideIndex:  state.castSlide,
      revealShown:     showAnswer,
      currentSlide: {
        roundBadge:  slide.roundBadge  || '',
        stateLabel:  slide.stateLabel  || '',
        category:    slide.category    || '',
        question:    slide.question    || '',
        options:     slide.options     || [],
        answer:      slide.answer      || '',
        notes:       slide.notes       || '',
        kind:        slide.kind        || '',
        answerVisibleByDefault: !!slide.alwaysReveal,
      },
      showTitle: state.deck.title,
      theme:     state.deck.theme,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }).catch(function (err) {
      console.error('[live-console] pushState:', err);
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function show(id, display) {
    const el = dom[id] || document.getElementById(id);
    if (el) el.style.display = display || 'block';
  }

  function hide(id) {
    const el = dom[id] || document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  function setText(id, val) {
    const el = dom[id] || document.getElementById(id);
    if (el) el.textContent = val == null ? '' : String(val);
  }

  function on(id, evt, fn) {
    const el = dom[id] || document.getElementById(id);
    if (el) el.addEventListener(evt, fn);
  }

  function copyText(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {});
      return;
    }
    const t = document.createElement('textarea');
    t.value = text;
    document.body.appendChild(t);
    t.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(t);
  }

  function flash(el, label) {
    if (!el) return;
    const orig = el.textContent;
    el.textContent = label;
    setTimeout(function () { el.textContent = orig; }, 1600);
  }

  function showError(msg) {
    hide('auth-loading');
    const et = document.getElementById('error-text');
    if (et) et.textContent = msg || 'Access denied.';
    const ec = document.getElementById('error-container');
    if (ec) ec.style.display = 'flex';
  }

})();
