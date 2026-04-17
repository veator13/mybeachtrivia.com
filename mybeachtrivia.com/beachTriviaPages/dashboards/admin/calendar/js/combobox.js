/**
 * combobox.js
 * Replaces a <select> with a styled trigger (looks like the original select) +
 * a fixed-position panel (never clipped by modal overflow) containing:
 *   - a search input at the top (auto-focused on open)
 *   - a scrollable list of options below
 *
 * The original <select> stays hidden so all existing code continues to work.
 *
 * Public API (returned object):
 *   .reset()   — clear selection, close panel
 *   .refresh() — rebuild list (called automatically via MutationObserver)
 */
(function () {
  'use strict';

  function initSearchableSelect(selectEl) {
    if (!selectEl || selectEl.dataset.comboboxInit) return null;
    selectEl.dataset.comboboxInit = '1';

    const parent = selectEl.parentNode; // .select-with-button

    // ── trigger div (mimics native <select> appearance) ────────────
    const trigger = document.createElement('div');
    trigger.className = 'ss-trigger ss-trigger--placeholder';
    trigger.setAttribute('tabindex', '0');
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const triggerText = document.createElement('span');
    triggerText.className = 'ss-trigger__text';
    const placeholderText = (selectEl.options[0] && selectEl.options[0].text) || 'Select…';
    triggerText.textContent = placeholderText;

    const chevron = document.createElement('span');
    chevron.className = 'ss-trigger__chevron';
    chevron.setAttribute('aria-hidden', 'true');

    trigger.appendChild(triggerText);
    trigger.appendChild(chevron);

    // Point the <label for="…"> at the trigger
    const triggerId = selectEl.id + '-trigger';
    trigger.id = triggerId;
    const label = document.querySelector('label[for="' + selectEl.id + '"]');
    if (label) label.setAttribute('for', triggerId);

    // ── floating panel — appended to <body> so it's never clipped ──
    const panel = document.createElement('div');
    panel.className = 'ss-panel';
    panel.hidden = true;
    document.body.appendChild(panel);

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'ss-search';
    searchInput.placeholder = 'Search…';
    searchInput.autocomplete = 'off';
    searchInput.spellcheck = false;

    const list = document.createElement('div');
    list.className = 'ss-list';
    list.setAttribute('role', 'listbox');

    panel.appendChild(searchInput);
    panel.appendChild(list);

    // Hide the original select (keep it for value/form submission)
    parent.insertBefore(trigger, selectEl);
    selectEl.style.display = 'none';
    selectEl.setAttribute('aria-hidden', 'true');

    // If the select already has a value selected (e.g. "All Hosts"), show it
    if (selectEl.value) {
      var initOpt = Array.from(selectEl.options).find(function (o) { return o.value === selectEl.value; });
      if (initOpt) {
        triggerText.textContent = initOpt.text;
        trigger.classList.remove('ss-trigger--placeholder');
      }
    }

    // ── helpers ────────────────────────────────────────────────────
    function getValueOptions() {
      return Array.from(selectEl.options).filter(function (o) { return o.value; });
    }

    function buildList(term) {
      list.innerHTML = '';
      var lc = (term || '').trim().toLowerCase();
      var count = 0;

      getValueOptions().forEach(function (opt) {
        if (lc && !opt.text.toLowerCase().includes(lc)) return;

        var item = document.createElement('div');
        item.className = 'ss-item';
        item.setAttribute('role', 'option');
        item.setAttribute('tabindex', '-1');
        if (opt.value === selectEl.value) {
          item.classList.add('ss-item--selected');
          item.setAttribute('aria-selected', 'true');
        }
        item.textContent = opt.text;
        item.dataset.value = opt.value;

        item.addEventListener('mousedown', function (e) {
          e.preventDefault();
          pickItem(opt.value, opt.text);
        });
        item.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            pickItem(opt.value, opt.text);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            var next = item.nextElementSibling;
            if (next && next.classList.contains('ss-item')) next.focus();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            var prev = item.previousElementSibling;
            if (prev && prev.classList.contains('ss-item')) prev.focus();
            else searchInput.focus();
          } else if (e.key === 'Escape') {
            closePanel();
            trigger.focus();
          }
        });

        list.appendChild(item);
        count++;
      });

      if (count === 0) {
        var empty = document.createElement('div');
        empty.className = 'ss-empty';
        empty.textContent = lc ? 'No matches' : 'No options available';
        list.appendChild(empty);
      }
    }

    function positionPanel() {
      var rect = trigger.getBoundingClientRect();
      panel.style.left  = rect.left + 'px';
      panel.style.top   = (rect.bottom + 3) + 'px';
      panel.style.width = rect.width + 'px';
    }

    function openPanel() {
      positionPanel();
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      searchInput.value = '';
      buildList('');
      // Scroll selected item into view
      var selected = list.querySelector('.ss-item--selected');
      if (selected) selected.scrollIntoView({ block: 'nearest' });
      // Auto-focus search input
      setTimeout(function () { searchInput.focus(); }, 0);
    }

    function closePanel() {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }

    function pickItem(value, text) {
      selectEl.value = value;
      triggerText.textContent = text;
      trigger.classList.remove('ss-trigger--placeholder');
      closePanel();
      trigger.focus();
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // ── trigger events ─────────────────────────────────────────────
    trigger.addEventListener('click', function () {
      if (panel.hidden) openPanel(); else closePanel();
    });
    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (panel.hidden) openPanel();
      } else if (e.key === 'Escape') {
        closePanel();
      }
    });

    // ── search input events ────────────────────────────────────────
    searchInput.addEventListener('input', function () {
      buildList(this.value);
    });
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closePanel();
        trigger.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        var first = list.querySelector('.ss-item');
        if (first) first.focus();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        var firstItem = list.querySelector('.ss-item');
        if (firstItem) pickItem(firstItem.dataset.value, firstItem.textContent);
      }
    });

    // Close on outside click
    document.addEventListener('mousedown', function (e) {
      if (!panel.contains(e.target) && !trigger.contains(e.target)) {
        closePanel();
      }
    });

    // Reposition if the page scrolls or window resizes while panel is open
    window.addEventListener('scroll', function () { if (!panel.hidden) positionPanel(); }, true);
    window.addEventListener('resize', function () { if (!panel.hidden) positionPanel(); });

    // Watch for option additions/removals (Firebase loads them async)
    var observer = new MutationObserver(function () {
      if (!panel.hidden) buildList(searchInput.value);
    });
    observer.observe(selectEl, { childList: true });

    // Sync trigger when value is changed programmatically (e.g. modal reset)
    selectEl.addEventListener('change', function () {
      if (!selectEl.value) {
        triggerText.textContent = placeholderText;
        trigger.classList.add('ss-trigger--placeholder');
      } else {
        var opt = Array.from(selectEl.options).find(function (o) { return o.value === selectEl.value; });
        if (opt) {
          triggerText.textContent = opt.text;
          trigger.classList.remove('ss-trigger--placeholder');
        }
      }
    });

    // ── public API ─────────────────────────────────────────────────
    function reset() {
      selectEl.value = '';
      triggerText.textContent = placeholderText;
      trigger.classList.add('ss-trigger--placeholder');
      closePanel();
    }

    function refresh() {
      if (!panel.hidden) buildList(searchInput.value);
    }

    return { reset: reset, refresh: refresh };
  }

  window.initSearchableSelect = initSearchableSelect;
})();
