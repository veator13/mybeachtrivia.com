/* search.js
   Team search + optional suggestions for the Host Scoresheet.

   Exposes globals:
     - levenshteinDistance(a, b)
     - searchTeams(query)
     - clearHighlights()

   Behavior:
     - Highlights matching team rows.
     - Scrolls the best match into view.
     - (Optional) shows a simple suggestions list under the search input if enabled.
*/
(function () {
    "use strict";
  
    const CFG = {
      // If true, shows suggestions UI under the search box
      enableSuggestions: true,
      // Maximum suggestions to show
      maxSuggestions: 8,
      // Fuzzy threshold (lower = stricter). Only used if no direct contains match found.
      maxEditDistance: 3,
    };
  
    function $(sel, root) {
      if (window.DomUtils?.$) return window.DomUtils.$(sel, root);
      return (root || document).querySelector(sel);
    }
  
    function $all(sel, root) {
      if (window.DomUtils?.$all) return window.DomUtils.$all(sel, root);
      return Array.from((root || document).querySelectorAll(sel));
    }
  
    function norm(s) {
      return (s || "")
        .toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
    }
  
    function levenshteinDistance(a, b) {
      a = norm(a);
      b = norm(b);
      if (a === b) return 0;
      if (!a) return b.length;
      if (!b) return a.length;
  
      const m = a.length;
      const n = b.length;
      const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  
      for (let i = 0; i <= m; i++) dp[i][0] = i;
      for (let j = 0; j <= n; j++) dp[0][j] = j;
  
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1, // deletion
            dp[i][j - 1] + 1, // insertion
            dp[i - 1][j - 1] + cost // substitution
          );
        }
      }
      return dp[m][n];
    }
  
    function getTeamRows() {
      return $all("#teamTable tbody tr");
    }
  
    function getTeamNameInput(row) {
      // Your first cell is the sticky "Team Name" col. Usually contains a text input.
      // We'll grab the first text input in the row.
      return row.querySelector('input[type="text"], input:not([type]), textarea');
    }
  
    function getTeamName(row) {
      const inp = getTeamNameInput(row);
      return inp ? inp.value || "" : "";
    }
  
    function clearHighlights() {
      getTeamRows().forEach((row) => row.classList.remove("search-hit", "search-best"));
    }
  
    function ensureSuggestionsBox() {
      if (!CFG.enableSuggestions) return null;
  
      let box = document.getElementById("teamSearchSuggestions");
      if (box) return box;
  
      const input = document.getElementById("teamSearch");
      if (!input) return null;
  
      box = document.createElement("div");
      box.id = "teamSearchSuggestions";
      box.style.position = "absolute";
      box.style.zIndex = "9999";
      box.style.background = "#fff";
      box.style.border = "1px solid #ccc";
      box.style.borderRadius = "6px";
      box.style.boxShadow = "0 6px 16px rgba(0,0,0,0.12)";
      box.style.padding = "6px";
      box.style.display = "none";
      box.style.maxWidth = "320px";
      box.style.fontSize = "14px";
  
      // Position it under the input (relative to viewport)
      const rect = input.getBoundingClientRect();
      box.style.left = `${Math.round(rect.left + window.scrollX)}px`;
      box.style.top = `${Math.round(rect.bottom + window.scrollY + 6)}px`;
  
      window.addEventListener("resize", () => {
        const r = input.getBoundingClientRect();
        box.style.left = `${Math.round(r.left + window.scrollX)}px`;
        box.style.top = `${Math.round(r.bottom + window.scrollY + 6)}px`;
      });
  
      document.body.appendChild(box);
  
      // Hide when clicking elsewhere
      document.addEventListener("click", (e) => {
        if (e.target === input || box.contains(e.target)) return;
        box.style.display = "none";
      });
  
      return box;
    }
  
    function renderSuggestions(items) {
      const box = ensureSuggestionsBox();
      if (!box) return;
  
      if (!items.length) {
        box.style.display = "none";
        return;
      }
  
      box.innerHTML = "";
      items.slice(0, CFG.maxSuggestions).forEach((it) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = it.name;
        btn.style.display = "block";
        btn.style.width = "100%";
        btn.style.textAlign = "left";
        btn.style.border = "0";
        btn.style.background = "transparent";
        btn.style.padding = "6px 8px";
        btn.style.cursor = "pointer";
        btn.onmouseenter = () => (btn.style.background = "rgba(0,0,0,0.06)");
        btn.onmouseleave = () => (btn.style.background = "transparent");
        btn.addEventListener("click", () => {
          // Focus that row’s name input
          const inp = getTeamNameInput(it.row);
          if (inp) {
            inp.focus();
            inp.select?.();
            it.row.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          box.style.display = "none";
        });
        box.appendChild(btn);
      });
  
      box.style.display = "block";
    }
  
    function highlightRow(row, isBest) {
      row.classList.add("search-hit");
      if (isBest) row.classList.add("search-best");
    }
  
    function searchTeams(query) {
      const q = norm(query);
      clearHighlights();
  
      if (!q) {
        renderSuggestions([]);
        return null;
      }
  
      const rows = getTeamRows();
  
      // First: direct contains matches
      const direct = [];
      for (const row of rows) {
        const name = norm(getTeamName(row));
        if (!name) continue;
        if (name.includes(q)) {
          direct.push({ row, name, score: 0 });
        }
      }
  
      if (direct.length) {
        direct.forEach((m, idx) => highlightRow(m.row, idx === 0));
        // Scroll best match into view
        direct[0].row.scrollIntoView({ behavior: "smooth", block: "center" });
  
        renderSuggestions(
          direct.map((d) => ({
            row: d.row,
            name: getTeamName(d.row) || "(Unnamed team)",
          }))
        );
  
        return direct[0].row;
      }
  
      // Second: fuzzy matching (edit distance) if nothing direct
      const fuzzy = [];
      for (const row of rows) {
        const raw = getTeamName(row);
        const name = norm(raw);
        if (!name) continue;
        const dist = levenshteinDistance(q, name);
        if (dist <= CFG.maxEditDistance) {
          fuzzy.push({ row, name: raw, dist });
        }
      }
  
      fuzzy.sort((a, b) => a.dist - b.dist);
  
      if (fuzzy.length) {
        fuzzy.forEach((m, idx) => highlightRow(m.row, idx === 0));
        fuzzy[0].row.scrollIntoView({ behavior: "smooth", block: "center" });
  
        renderSuggestions(
          fuzzy.map((f) => ({
            row: f.row,
            name: f.name || "(Unnamed team)",
          }))
        );
  
        return fuzzy[0].row;
      }
  
      renderSuggestions([]);
      return null;
    }
  
    // Expose globals
    window.levenshteinDistance = window.levenshteinDistance || levenshteinDistance;
    window.searchTeams = window.searchTeams || searchTeams;
    window.clearHighlights = window.clearHighlights || clearHighlights;
  
    // Optional: live suggestions as user types
    function bindLiveSearch() {
      if (!CFG.enableSuggestions) return;
      const input = document.getElementById("teamSearch");
      if (!input) return;
  
      const handler = window.DomUtils?.debounce
        ? window.DomUtils.debounce(() => searchTeams(input.value), 120)
        : () => searchTeams(input.value);
  
      input.addEventListener("input", handler);
  
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          clearHighlights();
          renderSuggestions([]);
        }
      });
    }
  
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bindLiveSearch, { once: true });
    } else {
      bindLiveSearch();
    }
  })();