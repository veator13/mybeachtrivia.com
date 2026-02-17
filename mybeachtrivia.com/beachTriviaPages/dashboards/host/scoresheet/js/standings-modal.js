/* standings-modal.js
   Team standings modal with invert (high->low / low->high) toggle.

   Fixes:
   - Renders into #modalRankingList (your actual UL) with a safe fallback to #standingsList
   - Flip button now re-sorts + re-renders every click
   - Keeps label + aria-pressed in sync with current mode
   - Live refresh while modal is open (team name edits / score changes)
   - IMPORTANT: Only include rows with a NON-BLANK team name
   - IMPORTANT: Rank numbers stay "competition-style":
       #1 is ALWAYS the highest score, even when viewing Low → High
*/
(function () {
  "use strict";

  function $(sel, root) {
    if (window.DomUtils?.$) return window.DomUtils.$(sel, root);
    return (root || document).querySelector(sel);
  }
  function $all(sel, root) {
    if (window.DomUtils?.$all) return window.DomUtils.$all(sel, root);
    return Array.from((root || document).querySelectorAll(sel));
  }

  function getStandingsAscending() {
    // false = high->low (default), true = low->high
    if (
      window.ScoresheetState?.state &&
      typeof window.ScoresheetState.state.standingsAscending === "boolean"
    ) {
      return window.ScoresheetState.state.standingsAscending;
    }
    if (typeof window.standingsAscending === "boolean") return window.standingsAscending;
    return false;
  }

  function setStandingsAscending(v) {
    const val = !!v;
    if (window.ScoresheetState?.state) window.ScoresheetState.state.standingsAscending = val;
    window.standingsAscending = val;
  }

  function setButtonText(btn) {
    if (!btn) return;
    const asc = getStandingsAscending();
    // Show CURRENT mode
    btn.textContent = asc ? "Low → High" : "High → Low";
    btn.setAttribute("aria-pressed", asc ? "true" : "false");
  }

  function getTotalForRow(row) {
    const teamId = row?.dataset?.teamId;
    if (!teamId) return 0;

    const scoreEl = document.getElementById(`finalScore${teamId}`);
    const text = (scoreEl?.textContent || "").trim();
    const v = parseInt(text, 10);
    return Number.isFinite(v) ? v : 0;
  }

  function buildRankings() {
    const rows = $all("#teamTable tbody tr[data-team-id]");

    const list = rows
      .map((row, domIndex) => {
        const teamId = row.dataset.teamId;
        const nameInput = row.querySelector("input.teamName");

        // ✅ NO fallback label. Blank stays blank.
        const name = (nameInput?.value || "").trim();

        const total = getTotalForRow(row);
        return { teamId, name, total, domIndex, row };
      })
      // ✅ Only include named teams
      .filter((x) => x.name && x.name.trim().length > 0);

    const asc = getStandingsAscending();

    // stable-ish ordering: sort by score, then DOM order
    list.sort((a, b) => {
      if (a.total !== b.total) return asc ? a.total - b.total : b.total - a.total;
      return a.domIndex - b.domIndex;
    });

    return list;
  }

  function getStandingsListEl() {
    // Your actual UL (confirmed in console): #modalRankingList
    return $("#modalRankingList") || $("#standingsList");
  }

  function renderStandings(list) {
    const ul = getStandingsListEl();
    if (!ul) return;

    ul.innerHTML = "";

    const asc = getStandingsAscending();
    const n = list.length;

    for (let i = 0; i < n; i++) {
      const item = list[i];

      const li = document.createElement("li");
      li.className = "standings-item";

      // ✅ Rank numbers stay "highest score is #1" even when viewing Low → High
      const rankNum = asc ? (n - i) : (i + 1);

      // Match your screenshot style: "#1 name (score)"
      li.textContent = `#${rankNum} ${item.name} (${item.total})`;

      // click an item -> scroll to that team row and highlight
      li.addEventListener("click", () => {
        try {
          if (typeof window.clearHighlights === "function") window.clearHighlights();
        } catch (_) {}
        item.row?.classList?.add("highlighted-row");

        const wrapper = $(".table-wrapper");
        if (wrapper && item.row) {
          const thead = $("#teamTable thead");
          const headerH = thead ? thead.offsetHeight || 0 : 0;
          const y = (item.row.offsetTop || 0) - headerH - 10;
          try {
            wrapper.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
          } catch {
            wrapper.scrollTop = Math.max(0, y);
          }
        }
      });

      ul.appendChild(li);
    }

    // Harmless; helps if some CSS accidentally forced height:0 earlier
    ul.style.height = "";
  }

  function isModalOpen() {
    const modal = $("#standingsModal");
    if (!modal) return false;
    if (modal.classList.contains("hidden")) return false;
    if (modal.style.display && modal.style.display === "none") return false;
    const cs = window.getComputedStyle(modal);
    return cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0";
  }

  function updateStandings() {
    if (!isModalOpen()) return;

    const flipBtn = $("#btnInvertStandings");
    setButtonText(flipBtn);

    const list = buildRankings();
    renderStandings(list);
  }

  function openModal() {
    const modal = $("#standingsModal");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.style.display = "flex";
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    const modal = $("#standingsModal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.style.display = "none";
    document.body.classList.remove("modal-open");
  }

  function showStandings() {
    openModal();
    updateStandings();
  }

  function invertStandingsOrder() {
    setStandingsAscending(!getStandingsAscending());
    updateStandings();
  }

  // Debounce for live-updating while modal open
  const debounce =
    window.DomUtils?.debounce ||
    function (fn, wait) {
      let t;
      return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
      };
    };

  const updateStandingsDebounced = debounce(updateStandings, 120);

  function bind() {
    const modal = $("#standingsModal");
    if (!modal || modal.dataset.boundStandingsModal) return;

    const closeBtn = $("#btnCloseStandings") || $("#closeStandings") || modal.querySelector(".close");
    const flipBtn = $("#btnInvertStandings");

    // Close button
    if (closeBtn && !closeBtn.dataset.boundClose) {
      closeBtn.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
          closeModal();
        },
        true
      );
      closeBtn.dataset.boundClose = "1";
    }

    // Flip button (capture + stopImmediatePropagation)
    if (flipBtn && !flipBtn.dataset.boundFlip) {
      flipBtn.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
          invertStandingsOrder();
        },
        true
      );
      flipBtn.dataset.boundFlip = "1";
      setButtonText(flipBtn);
    }

    // Clicking backdrop closes modal
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });

    // Live refresh while modal is open:
    // - score inputs changing
    // - team names edited
    const tbody = $("#teamTable tbody");
    if (tbody && !tbody.dataset.boundStandingsLive) {
      tbody.addEventListener("input", () => updateStandingsDebounced(), true);
      tbody.addEventListener("change", () => updateStandingsDebounced(), true);
      tbody.dataset.boundStandingsLive = "1";
    }

    // Also refresh on your custom events (if fired)
    window.addEventListener("scoresheet:totals-updated", updateStandingsDebounced);
    window.addEventListener("scoresheet:team-added", updateStandingsDebounced);
    window.addEventListener("scoresheet:team-removed", updateStandingsDebounced);

    modal.dataset.boundStandingsModal = "1";
  }

  // Expose
  window.updateStandings = window.updateStandings || updateStandings;
  window.showStandings = window.showStandings || showStandings;
  window.invertStandingsOrder = window.invertStandingsOrder || invertStandingsOrder;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})();