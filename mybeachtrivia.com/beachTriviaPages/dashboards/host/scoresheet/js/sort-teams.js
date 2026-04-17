/* sort-teams.js
   Alphabetical sort button for the Team Name column header.
   Toggles A→Z / Z→A. Reorders <tr> elements in the tbody so all
   scores travel with their row, then calls renumberAllTeams() to
   fix up element IDs. */
(function () {
  "use strict";

  let sortAsc = true; // true = A→Z, false = Z→A

  function getTeamName(tr) {
    const input = tr.querySelector("input.teamName");
    return (input ? input.value : "").trim().toLowerCase();
  }

  function sortTeams() {
    const tbody = document.querySelector("#teamTable tbody");
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll("tr[data-team-id]"));
    if (rows.length < 2) return;

    rows.sort((a, b) => {
      const na = getTeamName(a);
      const nb = getTeamName(b);
      if (na < nb) return sortAsc ? -1 : 1;
      if (na > nb) return sortAsc ? 1 : -1;
      return 0;
    });

    // Re-append in sorted order (moves entire tr with all its score inputs)
    rows.forEach((tr) => tbody.appendChild(tr));

    // Fix IDs and recalc totals
    if (typeof window.renumberAllTeams === "function") {
      window.renumberAllTeams();
    }

    // Toggle for next click
    sortAsc = !sortAsc;
    updateButtonLabel();
  }

  function updateButtonLabel() {
    const btn = document.getElementById("btnSortTeamNames");
    if (!btn) return;
    btn.title = sortAsc ? "Sort A → Z" : "Sort Z → A";
    btn.setAttribute("aria-label", sortAsc ? "Sort team names A to Z" : "Sort team names Z to A");
    btn.querySelector(".sort-icon").textContent = sortAsc ? "A→Z" : "Z→A";
  }

  function bind() {
    const btn = document.getElementById("btnSortTeamNames");
    if (!btn || btn.dataset.boundSort) return;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      sortTeams();
    });
    btn.dataset.boundSort = "1";
    updateButtonLabel();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})();
