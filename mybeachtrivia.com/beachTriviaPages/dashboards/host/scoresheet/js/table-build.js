/* table-build.js
   Responsible for building team rows in the scoresheet table.

   Exposes globals:
     - addTeam()
     - addTeamRow() (alias)
     - getActiveTeamRows()
     - getActiveTeamIds()

   This generates a row structure aligned with your table header:
     Team Name
     Q1-5 + R1 Total
     Q6-10 + R2 Total
     Half Time + First Half Total
     Q11-15 + R3 Total
     Q16-20 + R4 Total
     Final Question + Second Half Total
     Bonus + Final Score
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
  
    function el(tag, attrs) {
      const node = document.createElement(tag);
      if (attrs) {
        Object.entries(attrs).forEach(([k, v]) => {
          if (k === "text") node.textContent = v;
          else if (k === "class") node.className = v;
          else if (k === "dataset") Object.assign(node.dataset, v);
          else node.setAttribute(k, v);
        });
      }
      return node;
    }
  
    function makeNumberInput({ id, ariaLabel, min = "0", step = "1", value = "" } = {}) {
      const i = el("input", {
        type: "number",
        inputmode: "numeric",
        min,
        step,
        value,
        autocomplete: "off",
      });
      if (id) i.id = id;
      if (ariaLabel) i.setAttribute("aria-label", ariaLabel);
      return i;
    }
  
    function makeTextInput({ id, ariaLabel, placeholder = "Team name..." } = {}) {
      const i = el("input", {
        type: "text",
        autocomplete: "off",
        placeholder,
      });
      if (id) i.id = id;
      if (ariaLabel) i.setAttribute("aria-label", ariaLabel);
      return i;
    }
  
    function tdWithInput(inputEl, className) {
      const td = el("td");
      if (className) td.className = className;
      td.appendChild(inputEl);
      return td;
    }
  
    function tdTotal({ className, datasetTotalKey, text = "0" } = {}) {
      const td = el("td", { class: className || "" });
      if (datasetTotalKey) td.dataset.total = datasetTotalKey;
      td.textContent = text;
      return td;
    }
  
    function getNextTeamId() {
      // Use ScoresheetState if present; fallback to global teamCount increment
      if (window.ScoresheetState?.incrementTeamCount) {
        return window.ScoresheetState.incrementTeamCount();
      }
      window.teamCount = (window.teamCount || 0) + 1;
      return window.teamCount;
    }
  
    function markModified() {
      if (typeof window.ScoresheetState?.markAsModified === "function") {
        window.ScoresheetState.markAsModified();
        return;
      }
      if (typeof window.markAsModified === "function") {
        window.markAsModified();
        return;
      }
      window.dataModified = true;
    }
  
    function recalcRow(row) {
      // Prefer the most specific scoring function available
      if (typeof window.updateFinalScore === "function") return window.updateFinalScore(row);
      if (typeof window.updateScores === "function") return window.updateScores(row);
      if (typeof window.recalcRowTotals === "function") return window.recalcRowTotals(row);
      return null;
    }
  
    function buildTeamRow(teamId) {
      const tr = el("tr", { dataset: { teamId: String(teamId) } });
  
      // Team Name (sticky left col)
      const teamNameTd = el("td", { class: "sticky-col" });
      const teamNameInput = makeTextInput({
        id: `teamName-${teamId}`,
        ariaLabel: `Team ${teamId} name`,
        placeholder: "Team name",
      });
      teamNameTd.appendChild(teamNameInput);
      tr.appendChild(teamNameTd);
  
      // Q1 - Q5
      for (let q = 1; q <= 5; q++) {
        const inp = makeNumberInput({
          id: `t${teamId}-q${q}`,
          ariaLabel: `Team ${teamId} Question ${q}`,
        });
        tr.appendChild(tdWithInput(inp));
      }
      tr.appendChild(tdTotal({ className: "r1-total", datasetTotalKey: "r1Total" }));
  
      // Q6 - Q10
      for (let q = 6; q <= 10; q++) {
        const inp = makeNumberInput({
          id: `t${teamId}-q${q}`,
          ariaLabel: `Team ${teamId} Question ${q}`,
        });
        tr.appendChild(tdWithInput(inp));
      }
      tr.appendChild(tdTotal({ className: "r2-total", datasetTotalKey: "r2Total" }));
  
      // Half Time
      const halftimeInput = makeNumberInput({
        id: `t${teamId}-halftime`,
        ariaLabel: `Team ${teamId} half time`,
      });
      tr.appendChild(tdWithInput(halftimeInput));
  
      // First Half Total
      tr.appendChild(tdTotal({ className: "first-half-total", datasetTotalKey: "firstHalfTotal" }));
  
      // Q11 - Q15
      for (let q = 11; q <= 15; q++) {
        const inp = makeNumberInput({
          id: `t${teamId}-q${q}`,
          ariaLabel: `Team ${teamId} Question ${q}`,
        });
        tr.appendChild(tdWithInput(inp));
      }
      tr.appendChild(tdTotal({ className: "r3-total", datasetTotalKey: "r3Total" }));
  
      // Q16 - Q20
      for (let q = 16; q <= 20; q++) {
        const inp = makeNumberInput({
          id: `t${teamId}-q${q}`,
          ariaLabel: `Team ${teamId} Question ${q}`,
        });
        tr.appendChild(tdWithInput(inp));
      }
      tr.appendChild(tdTotal({ className: "r4-total", datasetTotalKey: "r4Total" }));
  
      // Final Question
      const finalQInput = makeNumberInput({
        id: `t${teamId}-finalq`,
        ariaLabel: `Team ${teamId} final question`,
      });
      tr.appendChild(tdWithInput(finalQInput));
  
      // Second Half Total
      tr.appendChild(tdTotal({ className: "second-half-total", datasetTotalKey: "secondHalfTotal" }));
  
      // Bonus (has its own class in your header)
      const bonusInput = makeNumberInput({
        id: `t${teamId}-bonus`,
        ariaLabel: `Team ${teamId} bonus`,
      });
      tr.appendChild(tdWithInput(bonusInput, "bonus-col-right"));
  
      // Final Score (sticky right)
      const finalScoreTd = tdTotal({
        className: "sticky-col-right final-score",
        datasetTotalKey: "finalScore",
        text: "0",
      });
      tr.appendChild(finalScoreTd);
  
      // Input listeners: mark modified + recalc
      tr.addEventListener("input", (e) => {
        const t = e.target;
        if (!(t instanceof HTMLElement)) return;
  
        // Mark modified on any meaningful change
        if (t.tagName.toLowerCase() === "input" || t.tagName.toLowerCase() === "select") {
          markModified();
        }
  
        // Validate number input if available
        if (typeof window.validateInput === "function" && t.tagName.toLowerCase() === "input") {
          if ((t.getAttribute("type") || "").toLowerCase() === "number") {
            try {
              window.validateInput(t);
            } catch {}
          }
        }
  
        // Recalc totals for this row
        recalcRow(tr);
      });
  
      // Initial totals
      recalcRow(tr);
  
      return tr;
    }
  
    function addTeam() {
      const tbody = $("#teamTable tbody");
      if (!tbody) {
        console.warn("[scoresheet] teamTable tbody not found");
        return null;
      }
  
      const teamId = getNextTeamId();
      const row = buildTeamRow(teamId);
      tbody.appendChild(row);
  
      // Focus team name for convenience
      const nameInput = row.querySelector('input[type="text"]');
      nameInput?.focus?.();
      nameInput?.select?.();
  
      return row;
    }
  
    function getActiveTeamRows() {
      // If you later implement row "deletion", filter here.
      return $all("#teamTable tbody tr");
    }
  
    function getActiveTeamIds() {
      return getActiveTeamRows()
        .map((tr) => tr.dataset.teamId)
        .filter(Boolean);
    }
  
    // Expose globals
    window.addTeam = window.addTeam || addTeam;
    window.addTeamRow = window.addTeamRow || addTeam;
    window.getActiveTeamRows = window.getActiveTeamRows || getActiveTeamRows;
    window.getActiveTeamIds = window.getActiveTeamIds || getActiveTeamIds;
  })();