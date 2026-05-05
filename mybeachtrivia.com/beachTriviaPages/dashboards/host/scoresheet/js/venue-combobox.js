/* venue-combobox.js
   Venue picker for host scoresheet using ONE visible input + in-page dropdown list.

   Why in-page list:
   - Datalist suggestions render in weird places when the page uses CSS zoom.
   - We can position the list reliably under the field.

   Compatibility:
   - Keeps hidden-ish #venueSelect as source of truth for existing validation/submit logic.
*/
(function () {
  "use strict";

  function qs(id) {
    return document.getElementById(id);
  }

  function norm(v) {
    return String(v || "").trim();
  }

  function normLower(v) {
    return norm(v).toLowerCase();
  }

  function fireUserLikeChange(el) {
    try {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } catch {}
  }

  function getOptionLabelForValue(selectEl, value) {
    const v = String(value || "");
    const opts = Array.from(selectEl.options || []);
    for (let i = 0; i < opts.length; i++) {
      if (String(opts[i].value) === v) return norm(opts[i].textContent);
    }
    return "";
  }

  function readSelectChoices(selectEl) {
    const rows = [];
    const opts = Array.from(selectEl.options || []);
    for (let i = 0; i < opts.length; i++) {
      const value = String(opts[i].value || "");
      const label = norm(opts[i].textContent || "");
      if (!value) continue; // Choose...
      if (value === "loading") continue;
      rows.push({ value, label });
    }
    return rows;
  }

  function disambiguateLabels(rows) {
    const counts = new Map();
    for (let i = 0; i < rows.length; i++) {
      const key = normLower(rows[i].label);
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const used = new Map();
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const base = r.label || r.value;
      const key = normLower(base);

      let display = base;
      const c = counts.get(key) || 1;
      if (c > 1 && r.value !== "other") {
        const shortId = String(r.value || "").slice(0, 6);
        const n = (used.get(key) || 0) + 1;
        used.set(key, n);
        display = `${base} (${shortId})`;
      }

      out.push({ value: r.value, label: base, display });
    }
    return out;
  }

  function isOfflineNow() {
    try {
      if (window.ScoresheetState && typeof window.ScoresheetState.isOffline === "function") {
        return !!window.ScoresheetState.isOffline();
      }
    } catch {}
    return false;
  }

  function init() {
    const combo = qs("venueCombo");
    const input = qs("venueComboInput");
    const list = qs("venueComboList");
    const select = qs("venueSelect");

    if (!combo || !input || !list || !select) return;
    if (combo.dataset.bound === "1") return;
    combo.dataset.bound = "1";

    let activeIndex = -1;
    let filtered = [];
    let openedByKeyboard = false;

    function syncInputFromSelect() {
      const v = String(select.value || "");
      if (!v || v === "loading") {
        if (!norm(input.value)) input.value = "";
        return;
      }
      const choices = disambiguateLabels(readSelectChoices(select));
      const row = choices.find((c) => String(c.value) === v);
      input.value = (row && row.display) ? row.display : (getOptionLabelForValue(select, v) || "");
    }

    function setExpanded(expanded) {
      combo.setAttribute("aria-expanded", expanded ? "true" : "false");
    }

    function isExpanded() {
      return combo.getAttribute("aria-expanded") === "true";
    }

    function showNativeSelect() {
      combo.hidden = true;
      select.hidden = false;
    }

    function showCombo() {
      select.hidden = true;
      combo.hidden = false;
    }

    function closeList() {
      setExpanded(false);
      activeIndex = -1;
      render();
      syncInputFromSelect();
      showNativeSelect(); // swap back to native select on close
    }

    function openList(fromKeyboard = false) {
      if (isOfflineNow()) return;
      openedByKeyboard = fromKeyboard;
      if (!isExpanded()) {
        input.value = ""; // clear so full list shows on open
        showCombo();      // swap native select out, combo in
        setTimeout(() => input.focus(), 0);
      }
      setExpanded(true);
      render();
    }

    function setActive(idx) {
      activeIndex = idx;
      Array.from(list.querySelectorAll("[data-idx]")).forEach((el) => {
        const i = parseInt(el.getAttribute("data-idx") || "-1", 10);
        el.setAttribute("data-active", i === activeIndex ? "true" : "false");
      });
    }

    function chooseValue(value) {
      select.value = String(value || "");
      fireUserLikeChange(select);

      syncInputFromSelect();
      closeList();

      if (select.value === "other") {
        try {
          qs("venueOtherInput")?.focus();
        } catch {}
      }
    }

    function computeFiltered() {
      const opts = disambiguateLabels(readSelectChoices(select));
      const q = normLower(input.value);
      if (!q) return opts;
      return opts.filter((o) => normLower(o.display).includes(q));
    }

    function render() {
      if (!isExpanded()) {
        list.innerHTML = "";
        return;
      }

      filtered = computeFiltered();
      const currentValue = String(select.value || "");

      if (!filtered.length) {
        list.innerHTML = '<div class="venue-combo__empty">No matches</div>';
        return;
      }

      list.innerHTML = "";
      filtered.forEach((o, idx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "venue-combo__item";
        btn.textContent = o.display;
        btn.setAttribute("role", "option");
        btn.setAttribute("data-value", o.value);
        btn.setAttribute("data-idx", String(idx));
        btn.setAttribute("aria-selected", String(o.value) === currentValue ? "true" : "false");
        btn.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus
        btn.addEventListener("click", () => chooseValue(o.value));
        list.appendChild(btn);
      });

      if (activeIndex >= filtered.length) activeIndex = filtered.length - 1;
      if (activeIndex < 0) activeIndex = filtered.findIndex((o) => String(o.value) === currentValue);
      if (activeIndex < 0 && openedByKeyboard) activeIndex = 0;
      setActive(activeIndex);
    }

    function commitFromInputValue() {
      if (isOfflineNow()) return;

      const typed = norm(input.value);
      if (!typed) {
        select.value = "";
        fireUserLikeChange(select);
        return;
      }

      // Try exact match by display/label
      const choices = disambiguateLabels(readSelectChoices(select));
      const match = choices.find((c) => normLower(c.display) === normLower(typed) || normLower(c.label) === normLower(typed));
      if (match) {
        chooseValue(match.value);
        return;
      }

      // If no exact match, keep the typed filter but don't force a selection.
      // Selection should come from clicking/entering an item.
    }

    // Initial bind: native select visible, combo hidden
    syncInputFromSelect();
    setExpanded(false);
    showNativeSelect();

    // Clicking the native select opens search instead of native popup
    select.addEventListener("mousedown", (e) => {
      if (isOfflineNow()) return;
      e.preventDefault();
      openList(false);
    });

    input.addEventListener("input", () => {
      if (isOfflineNow()) return;
      if (!isExpanded()) openList(true);
      render();
    });

    input.addEventListener("change", () => {
      if (isOfflineNow()) return;
      commitFromInputValue();
    });

    input.addEventListener("blur", () => {
      if (isOfflineNow()) return;
      commitFromInputValue();
      // Delay close so clicks on list items still work (mousedown prevents blur anyway).
      setTimeout(() => closeList(), 120);
    });

    input.addEventListener("focus", () => openList());
    input.addEventListener("click", () => openList());

    input.addEventListener("keydown", (e) => {
      if (!isExpanded() && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        openList(true);
        e.preventDefault();
        return;
      }
      if (!isExpanded()) return;

      if (e.key === "Escape") {
        closeList();
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowDown") {
        activeIndex = Math.min(activeIndex + 1, Math.max(filtered.length - 1, 0));
        setActive(activeIndex);
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowUp") {
        activeIndex = Math.max(activeIndex - 1, 0);
        setActive(activeIndex);
        e.preventDefault();
        return;
      }
      if (e.key === "Enter") {
        const chosen = filtered[activeIndex] || null;
        if (chosen) chooseValue(chosen.value);
        e.preventDefault();
      }
    });

    document.addEventListener("click", (e) => {
      if (!isExpanded()) return;
      const t = e.target;
      if (t && combo.contains(t)) return;
      closeList();
    });

    select.addEventListener("change", () => {
      syncInputFromSelect();
      if (isExpanded()) render();
    });

    window.addEventListener("scoresheet:venues-refreshed", () => {
      syncInputFromSelect();
      if (isExpanded()) render();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
