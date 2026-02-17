/* search.js
   Team search + optional suggestions + match navigation (Prev/Next).

   Exposes globals:
     - window.levenshteinDistance(a, b)
     - window.searchTeams(query?)         // explicit search (button / Enter)
     - window.searchNextMatch()
     - window.searchPrevMatch()
     - window.clearHighlights()

   UI hooks:
     - #btnSearchPrev / #btnSearchNext
     - #searchMatchCount

   Behavior:
     - Matching priority (inclusion):
         1) exact
         2) startsWith
         3) contains
         4) fuzzy (guarded: first+last letter match, len diff <=2, edit distance <=1/2)
     - Ordering: TOP-to-BOTTOM (DOM order)
     - Prev/Next cycles through all matches
     - Arrow clicks are captured + stopImmediatePropagation to prevent other handlers

   Live updates:
     - Typing in #teamSearch re-runs search (debounced)
     - Editing any team name (.teamName) re-runs search if query non-empty (debounced)
     - Adding/removing rows in tbody re-runs search if query non-empty (MutationObserver)
     - Nav index is preserved when possible (by stable key: teamId + nameRaw)
*/
(function () {
  "use strict";

  const CFG = {
    enableSuggestions: true,
    maxSuggestions: 5,
    liveMinChars: 2,
    liveDebounceMs: 250,
    suggestionsAutoHideMs: 10000,
    fuzzyMinChars: 4,
  };

  function $(sel, root) {
    if (window.DomUtils?.$) return window.DomUtils.$(sel, root);
    return (root || document).querySelector(sel);
  }

  function $all(sel, root) {
    if (window.DomUtils?.$all) return window.DomUtils.$all(sel, root);
    return Array.from((root || document).querySelectorAll(sel));
  }

  const debounce =
    window.DomUtils?.debounce ||
    function (fn, wait) {
      let t;
      return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
      };
    };

  function norm(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function levenshteinDistance(str1, str2) {
    const a = String(str1 || "");
    const b = String(str2 || "");

    const track = Array(b.length + 1)
      .fill(null)
      .map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= a.length; i++) track[0][i] = i;
    for (let j = 0; j <= b.length; j++) track[j][0] = j;

    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
        track[j][i] = Math.min(
          track[j][i - 1] + 1,
          track[j - 1][i] + 1,
          track[j - 1][i - 1] + indicator
        );
      }
    }
    return track[b.length][a.length];
  }

  // ---- navigation state
  const Nav = {
    query: "",
    matches: [], // [{ element, nameRaw, domIndex, kind, key }]
    index: -1,
  };

  function getTeamNameInputs() {
    return $all("#teamTable input.teamName");
  }

  function removeExistingSuggestions() {
    const existing = $(".search-suggestions");
    if (existing) existing.remove();
  }

  function getHeaderHeight() {
    const thead = $("#teamTable thead");
    return thead ? thead.offsetHeight || 0 : 0;
  }

  function scrollToTeam(teamRow) {
    const wrapper = $(".table-wrapper");
    if (!wrapper || !teamRow) return;

    const headerH = getHeaderHeight();
    const y = (teamRow.offsetTop || 0) - headerH - 10;

    try {
      wrapper.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    } catch {
      wrapper.scrollTop = Math.max(0, y);
    }
  }

  function clearHighlights() {
    $all("#teamTable tbody tr.highlighted-row").forEach((row) =>
      row.classList.remove("highlighted-row")
    );
    removeExistingSuggestions();
  }

  function highlightTeam(teamNameInput) {
    const teamRow = teamNameInput?.closest?.("tr");
    if (!teamRow) return;
    teamRow.classList.add("highlighted-row");
    scrollToTeam(teamRow);
  }

  function updateNavUI() {
    const prevBtn = $("#btnSearchPrev");
    const nextBtn = $("#btnSearchNext");
    const countEl = $("#searchMatchCount");

    const count = Nav.matches.length;
    const idx = Nav.index;

    const enableArrows = count > 1;

    if (prevBtn) prevBtn.disabled = !enableArrows;
    if (nextBtn) nextBtn.disabled = !enableArrows;

    if (countEl) {
      if (count > 0 && idx >= 0) countEl.textContent = `${idx + 1}/${count}`;
      else countEl.textContent = "";
    }

    try {
      window.dispatchEvent(
        new CustomEvent("scoresheet:search-updated", {
          detail: { query: Nav.query, count, index: idx },
        })
      );
    } catch {}
  }

  function buildKey(el, nameRaw) {
    const row = el?.closest?.("tr");
    const teamId = row?.dataset?.teamId || "";
    // include teamId when possible; fallback to normalized name + dom position
    return teamId ? `${teamId}::${String(nameRaw || "")}` : `__noid__::${norm(nameRaw)}::${el?.id || ""}`;
  }

  function setMatches(queryNorm, matches, indexOrKey) {
    Nav.query = queryNorm || "";
    Nav.matches = Array.isArray(matches) ? matches : [];

    if (!Nav.matches.length) {
      Nav.index = -1;
      updateNavUI();
      return;
    }

    // If indexOrKey is a number, use it. If it's a key, try to preserve.
    if (typeof indexOrKey === "number" && Number.isFinite(indexOrKey)) {
      Nav.index = Math.max(0, Math.min(indexOrKey, Nav.matches.length - 1));
      updateNavUI();
      return;
    }

    if (typeof indexOrKey === "string" && indexOrKey) {
      const found = Nav.matches.findIndex((m) => m.key === indexOrKey);
      Nav.index = found >= 0 ? found : 0;
      updateNavUI();
      return;
    }

    Nav.index = 0;
    updateNavUI();
  }

  function jumpToIndex(i) {
    const count = Nav.matches.length;
    if (!count) {
      setMatches(Nav.query, [], -1);
      return null;
    }

    let next = i;
    if (next < 0) next = count - 1;
    if (next >= count) next = 0;

    Nav.index = next;

    clearHighlights();
    const target = Nav.matches[Nav.index]?.element;
    if (target) highlightTeam(target);

    updateNavUI();
    return target?.closest("tr") || null;
  }

  function searchNextMatch() {
    return jumpToIndex(Nav.index + 1);
  }

  function searchPrevMatch() {
    return jumpToIndex(Nav.index - 1);
  }

  function maxFuzzyErrors(qLen) {
    return qLen <= 5 ? 1 : 2;
  }

  function fuzzyEligible(nameNorm, qNorm) {
    if (!nameNorm || !qNorm) return false;
    if (qNorm.length < CFG.fuzzyMinChars) return false;

    const firstOK = nameNorm[0] === qNorm[0];
    const lastOK = nameNorm[nameNorm.length - 1] === qNorm[qNorm.length - 1];
    const lenOK = Math.abs(nameNorm.length - qNorm.length) <= 2;

    return firstOK && lastOK && lenOK;
  }

  function buildMatches(qNorm, teamNameInputs) {
    const q = qNorm;
    const matches = [];

    for (let domIndex = 0; domIndex < teamNameInputs.length; domIndex++) {
      const el = teamNameInputs[domIndex];
      const nameRaw = el.value || "";
      const nameNorm = norm(nameRaw);
      if (!nameNorm) continue;

      const exact = nameNorm === q;
      const startsWith = !exact && nameNorm.startsWith(q);
      const contains = !exact && !startsWith && nameNorm.includes(q);

      let kind = null;

      if (exact) kind = "exact";
      else if (startsWith) kind = "startsWith";
      else if (contains) kind = "contains";
      else if (fuzzyEligible(nameNorm, q)) {
        const dist = levenshteinDistance(nameNorm, q);
        if (dist <= maxFuzzyErrors(q.length)) kind = "fuzzy";
      }

      if (kind) {
        matches.push({
          element: el,
          nameRaw,
          domIndex,
          kind,
          key: buildKey(el, nameRaw),
        });
      }
    }

    // keep DOM order (top-to-bottom)
    return matches;
  }

  function showSuggestions(matches) {
    if (!CFG.enableSuggestions) return;
    removeExistingSuggestions();

    const container = document.createElement("div");
    container.className = "search-suggestions";

    const p = document.createElement("p");
    p.textContent = "Did you mean:";
    container.appendChild(p);

    const ul = document.createElement("ul");
    for (const m of matches) {
      const li = document.createElement("li");
      li.textContent = m.nameRaw;
      li.addEventListener("click", () => {
        const input = $("#teamSearch");
        if (input) input.value = m.nameRaw;
        removeExistingSuggestions();
        doSearch(m.nameRaw, { silent: true, preserveIndex: false });
      });
      ul.appendChild(li);
    }
    container.appendChild(ul);

    $(".search-container")?.appendChild(container);

    setTimeout(() => {
      if ($(".search-suggestions")) removeExistingSuggestions();
    }, CFG.suggestionsAutoHideMs);
  }

  function doSearch(query, opts) {
    const options = { silent: false, preserveIndex: true, ...opts };

    const input = $("#teamSearch");
    const qNorm = norm(query != null ? query : input?.value || "");

    // preserve current selected match if possible
    const currentKey = options.preserveIndex ? Nav.matches?.[Nav.index]?.key : null;

    if (!qNorm) {
      clearHighlights();
      setMatches("", [], -1);
      return null;
    }

    const teamNameInputs = getTeamNameInputs();
    const matches = buildMatches(qNorm, teamNameInputs);

    if (matches.length > 0) {
      setMatches(qNorm, matches, currentKey);

      clearHighlights();
      const active = Nav.matches[Nav.index] || matches[0];
      if (active?.element) highlightTeam(active.element);

      if (CFG.enableSuggestions && matches.length > 1) {
        const topKinds = new Set(matches.slice(0, 3).map((m) => m.kind));
        if (topKinds.has("fuzzy")) {
          showSuggestions(matches.slice(0, Math.min(CFG.maxSuggestions, matches.length)));
        }
      }

      return (active?.element || matches[0].element).closest("tr") || null;
    }

    clearHighlights();
    setMatches(qNorm, [], -1);

    if (!options.silent) alert("No team found with that name. Try a different search term.");
    return null;
  }

  function searchTeams(query) {
    // IMPORTANT: if called with no args, treat as "use current input value"
    return doSearch(query, { silent: false, preserveIndex: false });
  }

  function bindNavButtonsOnce() {
    const prevBtn = $("#btnSearchPrev");
    const nextBtn = $("#btnSearchNext");

    const kill = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    };

    if (prevBtn && !prevBtn.dataset.boundNav) {
      prevBtn.addEventListener(
        "click",
        (e) => {
          kill(e);
          searchPrevMatch();
        },
        true
      );
      prevBtn.dataset.boundNav = "1";
    }

    if (nextBtn && !nextBtn.dataset.boundNav) {
      nextBtn.addEventListener(
        "click",
        (e) => {
          kill(e);
          searchNextMatch();
        },
        true
      );
      nextBtn.dataset.boundNav = "1";
    }
  }

  // Expose globals
  window.levenshteinDistance = window.levenshteinDistance || levenshteinDistance;
  window.searchTeams = window.searchTeams || searchTeams;
  window.clearHighlights = window.clearHighlights || clearHighlights;
  window.searchNextMatch = window.searchNextMatch || searchNextMatch;
  window.searchPrevMatch = window.searchPrevMatch || searchPrevMatch;

  function bindLiveSearch() {
    const searchInput = $("#teamSearch");
    const tbody = $("#teamTable tbody");
    if (!searchInput || searchInput.dataset.boundSearchLive) return;

    bindNavButtonsOnce();
    updateNavUI();

    // Keyboard behavior on the search input itself
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        doSearch(searchInput.value, { silent: false, preserveIndex: false });
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        if (Nav.matches.length > 1) {
          e.preventDefault();
          searchNextMatch();
        }
      }
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        if (Nav.matches.length > 1) {
          e.preventDefault();
          searchPrevMatch();
        }
      }
    });

    // 1) Live typing in search box
    const runFromInput = debounce(function () {
      const v = (this.value || "").trim();
      if (!v) {
        clearHighlights();
        setMatches("", [], -1);
        return;
      }
      if (v.length >= CFG.liveMinChars) doSearch(v, { silent: true, preserveIndex: false });
    }, CFG.liveDebounceMs);

    searchInput.addEventListener("input", runFromInput);

    // 2) Editing team names should update matches if query active
    if (tbody) {
      const runFromTable = debounce(() => {
        const q = (searchInput.value || "").trim();
        if (!q) return;
        if (q.length < CFG.liveMinChars) return;
        // preserve current selection if possible
        doSearch(q, { silent: true, preserveIndex: true });
      }, Math.max(60, Math.min(200, CFG.liveDebounceMs)));

      tbody.addEventListener(
        "input",
        (e) => {
          const t = e.target;
          if (!(t instanceof HTMLInputElement)) return;
          if (!t.classList.contains("teamName")) return;
          runFromTable();
        },
        true
      );

      tbody.addEventListener(
        "change",
        (e) => {
          const t = e.target;
          if (!(t instanceof HTMLInputElement)) return;
          if (!t.classList.contains("teamName")) return;
          runFromTable();
        },
        true
      );

      // 3) New rows added/removed should update matches if query active
      const mo = new MutationObserver(() => runFromTable());
      mo.observe(tbody, { childList: true, subtree: true });
    }

    searchInput.dataset.boundSearchLive = "1";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindLiveSearch, { once: true });
  } else {
    bindLiveSearch();
  }
})();