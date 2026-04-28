// live-console/app.js — dedupe live/reveal in flattenSlides; Reveal buttons toggle like writer

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
  var _resizeRaf = 0;
  var _stageResizeObserver = null;

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

    on('btn-host-reveal', 'click', function () {
      toggleHostReveal();
    });
    on('btn-host-hide',   'click', function () { setHostRevealed(false); });

    on('btn-reveal', 'click', function () {
      toggleCastReveal();
    });
    on('btn-hide',   'click', function () { setRevealed(false); });

    // Keep previews responsive when host-event iframe/container resizes.
    window.addEventListener('resize', scheduleResponsiveRender);
    setupStageResizeObserver();
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
        /* Writer emits back-to-back live + reveal for the same question (same prompt).
           Host advances with Prev/Next and uses Reveal to show answers — keep only the live
           slide here. Standalone reveal slides (e.g. reveal pass after turn-in) stay: the
           previous flattened slide is not the matching *.live. */
        var sk = String(s.stateKey || '');
        if (/\.reveal$/i.test(sk)) {
          var liveKey = sk.replace(/\.reveal$/i, '.live');
          if (slides.length) {
            var prevKey = String(slides[slides.length - 1].stateKey || '');
            if (prevKey === liveKey) {
              return;
            }
          }
        }
        var isTitle = (s.kind === 'title' || s.type === 'title' || block.type === 'title');
        var showTitle = (data.show && data.show.title) || '';
        var showDate  = (data.show && data.show.dateLabel) || '';
        slides.push({
          stateKey:      s.stateKey    || '',
          stateLabel:    s.stateLabel  || (isTitle ? 'Title Slide' : ''),
          roundBadge:    s.title       || roundBadge,
          category:      s.categoryName || s.category || block.categoryName || (isTitle ? showDate : ''),
          question:      s.prompt      || s.question  || (isTitle ? showTitle : ''),
          questionAlign: s.questionAlign || block.questionAlign || 'left',
          questionFontScale:
            typeof s.questionFontScale === 'number'
              ? s.questionFontScale
              : (typeof block.questionFontScale === 'number' ? block.questionFontScale : 1.0),
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

  function slideRevealApplicable(slide) {
    if (!slide) return false;
    var kind = String(slide.kind || '').toLowerCase();
    var stateLabel = String(slide.stateLabel || '').toLowerCase();
    if (kind === 'title' || stateLabel.indexOf('title slide') !== -1) return false;
    var blockType = slide.blockType || slide.kind || '';
    if (DISPLAY_BLOCK_TYPES.indexOf(blockType) !== -1) return false;
    if (String(slide.questionType || '').toLowerCase() === 'display') return false;
    if (slide.alwaysReveal) return false;
    return true;
  }

  function updateRevealChrome() {
    var hs = state.deck.slides[state.hostSlide] || null;
    var hostOk = slideRevealApplicable(hs);
    if (dom['btn-host-reveal']) {
      dom['btn-host-reveal'].style.display = hostOk ? '' : 'none';
      dom['btn-host-reveal'].disabled = !hostOk;
      dom['btn-host-reveal'].textContent = state.hostRevealed ? '\u2190 Hide answers' : 'Reveal';
    }
    if (dom['btn-host-hide']) {
      dom['btn-host-hide'].style.display = hostOk ? '' : 'none';
    }

    var cs = state.deck.slides[state.castSlide] || null;
    var castOk = slideRevealApplicable(cs);
    if (dom['btn-reveal']) {
      dom['btn-reveal'].style.display = castOk ? '' : 'none';
      dom['btn-reveal'].disabled = !castOk;
      dom['btn-reveal'].textContent = state.revealed ? '\u2190 Hide answers' : 'Reveal';
    }
    if (dom['btn-hide']) {
      dom['btn-hide'].style.display = castOk ? '' : 'none';
    }
  }

  function stepHost(delta) {
    const max = state.deck.slides.length - 1;
    const next = Math.max(0, Math.min(max, state.hostSlide + delta));
    if (next === state.hostSlide) return;
    state.hostSlide = next;
    state.hostRevealed = false;
    renderHost();
  }

  function setHostRevealed(val) {
    state.hostRevealed = val;
    renderHost();
  }

  function toggleHostReveal() {
    var slide = state.deck.slides[state.hostSlide] || null;
    if (!slideRevealApplicable(slide)) return;
    setHostRevealed(!state.hostRevealed);
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

  function toggleCastReveal() {
    var slide = state.deck.slides[state.castSlide] || null;
    if (!slideRevealApplicable(slide)) return;
    setRevealed(!state.revealed);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function render() {
    renderHost();
    renderCast();
  }

  function scheduleResponsiveRender() {
    if (_resizeRaf) cancelAnimationFrame(_resizeRaf);
    _resizeRaf = requestAnimationFrame(function () {
      _resizeRaf = 0;
      if (!state.deck.slides.length) return;
      render();
    });
  }

  function setupStageResizeObserver() {
    if (typeof ResizeObserver === 'undefined') return;
    if (_stageResizeObserver) return;
    _stageResizeObserver = new ResizeObserver(function () {
      scheduleResponsiveRender();
    });
    if (dom['host-stage']) _stageResizeObserver.observe(dom['host-stage']);
    if (dom['cast-stage']) _stageResizeObserver.observe(dom['cast-stage']);
  }

  function renderHost() {
    const total = state.deck.slides.length;
    const slide = state.deck.slides[state.hostSlide] || null;
    setText('host-slide-count', total ? (state.hostSlide + 1) + ' / ' + total : '');
    if (dom['btn-prev']) dom['btn-prev'].disabled = state.hostSlide === 0;
    if (dom['btn-next']) dom['btn-next'].disabled = state.hostSlide >= total - 1;

    if (!slide) {
      updateRevealChrome();
      return;
    }
    var showHostAnswer = state.hostRevealed || slide.alwaysReveal;
    window.BeachTriviaSlidePaint.paintSlide(dom['host-stage'], slide, showHostAnswer);
    setText('host-notes', slide.notes || '');
    updateRevealChrome();
  }

  function renderCast() {
    const total = state.deck.slides.length;
    const slide = state.deck.slides[state.castSlide] || null;
    setText('cast-slide-count', total ? (state.castSlide + 1) + ' / ' + total : '');
    if (dom['btn-cast-prev']) dom['btn-cast-prev'].disabled = state.castSlide === 0;
    if (dom['btn-cast-next']) dom['btn-cast-next'].disabled = state.castSlide >= total - 1;

    if (!slide) {
      updateRevealChrome();
      return;
    }
    var showAnswer = state.revealed || slide.alwaysReveal;
    window.BeachTriviaSlidePaint.paintSlide(dom['cast-stage'], slide, showAnswer);
    setText('cast-status-label', showAnswer ? 'Answer visible to audience' : 'Answer hidden until revealed');
    updateRevealChrome();
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

  // Firestore live doc mirrors the cast column only (castSlide + revealed). Host view is local.
  function pushState() {
    if (!state.live) return;
    const slide = state.deck.slides[state.castSlide] || {};
    const showAnswer = state.revealed || slide.alwaysReveal;

    firebase.firestore().collection('liveSessions').doc(state.sessionCode).set({
      sessionCode:     state.sessionCode,
      publicViewer:    true,
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
        blockType:    slide.blockType    || '',
        questionType: slide.questionType || '',
        questionAlign: slide.questionAlign || '',
        questionFontScale:
          typeof slide.questionFontScale === 'number' ? slide.questionFontScale : 1,
        matchingPairs: Array.isArray(slide.matchingPairs) ? slide.matchingPairs : [],
        orderingItems: Array.isArray(slide.orderingItems) ? slide.orderingItems : [],
        theme: slide.theme || state.deck.theme || '',
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
