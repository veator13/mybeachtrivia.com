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

   Highlight integration:
   - Uses window.clearHighlights() if available
   - Adds:
       • tr.highlighted-row
       • td.sticky-col.highlighted-sticky
       • td.bonus-col-right.highlighted-sticky
       • td.sticky-col-right.highlighted-sticky
     so sticky cells can be styled without pseudo-element overlays
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

  function markStickyCells(teamRow) {
    if (!teamRow) return;

    teamRow
      .querySelectorAll("td.sticky-col, th.sticky-col")
      .forEach((el) => el.classList.add("highlighted-sticky"));

    teamRow
      .querySelectorAll("td.bonus-col-right, th.bonus-col-right")
      .forEach((el) => el.classList.add("highlighted-sticky"));

    teamRow
      .querySelectorAll("td.sticky-col-right, th.sticky-col-right")
      .forEach((el) => el.classList.add("highlighted-sticky"));
  }

  function scrollRowIntoView(row) {
    const wrapper = $(".table-wrapper");
    if (!wrapper || !row) return;

    const thead = $("#teamTable thead");
    const headerH = thead ? thead.offsetHeight || 0 : 0;
    const y = (row.offsetTop || 0) - headerH - 10;

    try {
      wrapper.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    } catch {
      wrapper.scrollTop = Math.max(0, y);
    }
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
      const rankNum = asc ? n - i : i + 1;

      // Match your screenshot style: "#1 name (score)"
      li.textContent = `#${rankNum} ${item.name} (${item.total})`;

      // click an item -> scroll to that team row and highlight
      li.addEventListener("click", () => {
        try {
          if (typeof window.clearHighlights === "function") window.clearHighlights();
        } catch (_) {}

        item.row?.classList?.add("highlighted-row");
        markStickyCells(item.row);
        scrollRowIntoView(item.row);
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
    return cs.display !== "none" && cs.visibility !== "hidden";
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
    try {
      const standings = typeof window.__collectTeamData === 'function'
        ? window.__collectTeamData()
        : buildRankings().map(item => ({ name: item.name, score: item.total }));
      window.parent.postMessage({ type: 'BT_STANDINGS_OPEN', standings }, '*');
    } catch (_) {}
  }

  function closeModal() {
    const modal = $("#standingsModal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.style.display = "none";
    document.body.classList.remove("modal-open");
    // Reset fullscreen when closing
    const content = modal.querySelector(".modal-content");
    if (content) content.classList.remove("standings-fullscreen");
    const fsBtn = $("#btnFullscreenStandings");
    if (fsBtn) {
      fsBtn.setAttribute("aria-pressed", "false");
      fsBtn.textContent = "⛶";
    }
    try {
      window.parent.postMessage({ type: 'BT_STANDINGS_CLOSE' }, '*');
    } catch (_) {}
  }

  function toggleFullscreen() {
    const modal = $("#standingsModal");
    if (!modal) return;
    const content = modal.querySelector(".modal-content");
    if (!content) return;
    const fsBtn = $("#btnFullscreenStandings");
    const isFullscreen = content.classList.toggle("standings-fullscreen");
    if (fsBtn) {
      fsBtn.setAttribute("aria-pressed", isFullscreen ? "true" : "false");
      fsBtn.textContent = isFullscreen ? "⛶" : "⛶";
      fsBtn.title = isFullscreen ? "Exit full screen" : "Full screen";
    }
  }

  function showStandings() {
    openModal();
    updateStandings();
  }

  function invertStandingsOrder() {
    setStandingsAscending(!getStandingsAscending());
    refreshOutputs();
  }

  /* ============================================================
     Pop-out window — a separate browser window that mirrors the
     standings live, so a host can drag it onto a projector / TV.
     Stays open and keeps updating even after the modal is closed.
     ============================================================ */
  let popoutWin = null;
  let popoutPoll = null;

  function isPopoutOpen() {
    try {
      return !!(popoutWin && !popoutWin.closed);
    } catch (_) {
      return false;
    }
  }

  function setPopoutBtnState(on) {
    const btn = $("#btnPopoutStandings");
    if (btn) btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function popoutDocHTML() {
    return [
      '<!doctype html><html lang="en"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      "<title>Team Standings</title><style>",
      ":root{--rowfs:4vw;}",
      "*{box-sizing:border-box;margin:0;padding:0;}",
      "html,body{height:100%;}",
      "body{background:#0b0f14;color:#fff;overflow:hidden;display:flex;flex-direction:column;",
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}',
      "header{flex:0 0 auto;text-align:center;padding:2.5vh 2vw 1.5vh;border-bottom:2px solid rgba(0,255,204,.25);}",
      "header h1{font-size:clamp(24px,5vw,72px);letter-spacing:.5px;text-transform:uppercase;color:#00ffcc;}",
      "header .mode{margin-top:.4vh;font-size:clamp(12px,1.6vw,22px);color:rgba(255,255,255,.55);}",
      "#stage{flex:1 1 auto;display:flex;flex-direction:column;justify-content:center;padding:2vh 4vw;overflow:hidden;}",
      "#rows{display:flex;flex-direction:column;gap:1.1vh;}",
      ".row{display:flex;align-items:center;gap:1.1em;background:rgba(255,255,255,.05);",
      "border:1px solid rgba(255,255,255,.08);border-radius:.35em;padding:.4em .7em;font-size:var(--rowfs);line-height:1.15;}",
      ".row .rank{flex:0 0 auto;min-width:1.9em;height:1.7em;display:inline-flex;align-items:center;justify-content:center;",
      "background:#00ffcc;color:#062a24;border-radius:.22em;font-weight:800;}",
      ".row .name{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;}",
      ".row .score{flex:0 0 auto;color:#00ffcc;font-weight:800;font-variant-numeric:tabular-nums;}",
      ".row.leader{background:rgba(0,255,204,.14);border-color:rgba(0,255,204,.4);}",
      ".empty{text-align:center;color:rgba(255,255,255,.4);font-size:clamp(16px,2.4vw,32px);}",
      ".ctl{position:fixed;top:12px;width:44px;height:44px;border-radius:10px;z-index:5;",
      "border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:#00ffcc;font-size:20px;cursor:pointer;}",
      ".ctl:hover{background:rgba(255,255,255,.16);}",
      "#flipBtn{right:66px;}#fsBtn{right:14px;}",
      "body.is-fs .ctl{opacity:.2;}body.is-fs .ctl:hover{opacity:1;}",
      "</style></head><body>",
      '<button id="flipBtn" class="ctl" type="button" title="Flip order (high &harr; low)">&#8645;</button>',
      '<button id="fsBtn" class="ctl" type="button" title="Full screen">&#9082;</button>',
      '<header><h1>Team Standings</h1><div class="mode" id="mode"></div></header>',
      '<div id="stage"><div id="rows"></div></div>',
      "</body></html>"
    ].join("");
  }

  function fitPopout() {
    if (!isPopoutOpen()) return;
    let doc;
    try {
      doc = popoutWin.document;
    } catch (_) {
      return;
    }
    const stage = doc.getElementById("stage");
    const rows = doc.getElementById("rows");
    if (!stage || !rows) return;
    let fs = 4.4; // vw
    doc.documentElement.style.setProperty("--rowfs", fs + "vw");
    let guard = 0;
    while (rows.scrollHeight > stage.clientHeight && fs > 0.8 && guard < 40) {
      fs -= 0.2;
      doc.documentElement.style.setProperty("--rowfs", fs + "vw");
      guard++;
    }
  }

  function renderPopout() {
    if (!isPopoutOpen()) return;
    let doc;
    try {
      doc = popoutWin.document;
    } catch (_) {
      return;
    }
    const rowsEl = doc.getElementById("rows");
    const modeEl = doc.getElementById("mode");
    if (!rowsEl) return;

    const list = buildRankings();
    const asc = getStandingsAscending();
    const n = list.length;

    if (modeEl) modeEl.textContent = asc ? "Low → High" : "High → Low";

    if (!n) {
      rowsEl.innerHTML = '<div class="empty">Add teams and scores to see standings</div>';
      return;
    }

    const frag = doc.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const item = list[i];
      const rankNum = asc ? n - i : i + 1;
      const row = doc.createElement("div");
      row.className = "row" + (rankNum === 1 ? " leader" : "");

      const r = doc.createElement("span");
      r.className = "rank";
      r.textContent = "#" + rankNum;

      const nm = doc.createElement("span");
      nm.className = "name";
      nm.textContent = item.name;

      const sc = doc.createElement("span");
      sc.className = "score";
      sc.textContent = item.total;

      row.appendChild(r);
      row.appendChild(nm);
      row.appendChild(sc);
      frag.appendChild(row);
    }
    rowsEl.innerHTML = "";
    rowsEl.appendChild(frag);
    fitPopout();
  }

  function wirePopout(w) {
    let doc;
    try {
      doc = w.document;
    } catch (_) {
      return;
    }

    const fsBtn = doc.getElementById("fsBtn");
    if (fsBtn) {
      fsBtn.addEventListener("click", () => {
        try {
          if (doc.fullscreenElement) doc.exitFullscreen();
          else doc.documentElement.requestFullscreen();
        } catch (_) {}
      });
    }

    const flipBtn = doc.getElementById("flipBtn");
    if (flipBtn) {
      flipBtn.addEventListener("click", () => invertStandingsOrder());
    }

    doc.addEventListener("fullscreenchange", () => {
      try {
        doc.body.classList.toggle("is-fs", !!doc.fullscreenElement);
      } catch (_) {}
    });

    try {
      w.addEventListener("resize", () => fitPopout());
    } catch (_) {}

    renderPopout();
  }

  function openPopout() {
    if (isPopoutOpen()) {
      try {
        popoutWin.focus();
      } catch (_) {}
      renderPopout();
      return;
    }

    const w = window.open("", "BT_Standings_Popout", "width=1280,height=720");
    if (!w) {
      window.alert(
        "The standings window was blocked by your browser.\n\nAllow pop-ups for this site, then click the pop-out button again."
      );
      return;
    }

    popoutWin = w;
    try {
      w.document.open();
      w.document.write(popoutDocHTML());
      w.document.close();
    } catch (_) {}

    if (w.document && w.document.readyState === "complete") {
      wirePopout(w);
    } else {
      w.addEventListener("load", () => wirePopout(w), { once: true });
    }

    setPopoutBtnState(true);
    if (popoutPoll) clearInterval(popoutPoll);
    popoutPoll = setInterval(() => {
      if (!isPopoutOpen()) {
        clearInterval(popoutPoll);
        popoutPoll = null;
        popoutWin = null;
        setPopoutBtnState(false);
      }
    }, 1000);
  }

  function refreshOutputs() {
    updateStandings();
    renderPopout();
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

  const updateStandingsDebounced = debounce(refreshOutputs, 120);

  function bind() {
    const modal = $("#standingsModal");
    if (!modal || modal.dataset.boundStandingsModal) return;

    const closeBtn = $("#btnCloseStandings") || $("#closeStandings") || modal.querySelector(".close");
    const flipBtn = $("#btnInvertStandings");
    const fsBtn = $("#btnFullscreenStandings");

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

    // Fullscreen button
    if (fsBtn && !fsBtn.dataset.boundFullscreen) {
      fsBtn.title = "Full screen";
      fsBtn.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
          toggleFullscreen();
        },
        true
      );
      fsBtn.dataset.boundFullscreen = "1";
    }

    // Pop-out button — opens standings in a separate window for a projector / TV
    const popBtn = $("#btnPopoutStandings");
    if (popBtn && !popBtn.dataset.boundPopout) {
      popBtn.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
          openPopout();
        },
        true
      );
      popBtn.dataset.boundPopout = "1";
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

  // The pop-out mirror can't update once this tab is gone — close it with the tab.
  window.addEventListener("beforeunload", () => {
    try {
      if (isPopoutOpen()) popoutWin.close();
    } catch (_) {}
  });

  // Expose
  window.updateStandings = window.updateStandings || updateStandings;
  window.showStandings = window.showStandings || showStandings;
  window.invertStandingsOrder = window.invertStandingsOrder || invertStandingsOrder;
  window.openStandingsPopout = window.openStandingsPopout || openPopout;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})();