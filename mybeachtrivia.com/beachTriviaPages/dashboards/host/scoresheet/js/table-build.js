/* table-build.js
   Builds team rows EXACTLY like legacy app.js addTeam(), so existing CSS matches.
   Exposes window.addTeam().
*/
(function () {
    "use strict";
  
    // Fallback $ helper if dom-utils.js didn't define it
    const $ = window.$ || ((sel) => document.querySelector(sel));
  
    // Safe no-ops if modules aren't loaded yet
    const bindBonusInput =
      window.bindBonusInput ||
      function () {
        /* no-op */
      };
  
    const updateStickyRightWidths =
      window.updateStickyRightWidths ||
      function () {
        /* no-op */
      };
  
    // Shared counters/flags (use existing globals if present)
    function getTeamCount() {
      return typeof window.teamCount === "number" ? window.teamCount : 0;
    }
    function setTeamCount(n) {
      window.teamCount = n;
    }
    function setDataModified(v) {
      window.dataModified = v;
    }
  
    function addTeam() {
      let teamCount = getTeamCount();
      teamCount++;
      setTeamCount(teamCount);
      setDataModified(true);
  
      // Ensure a <tbody> exists
      const table = $("#teamTable");
      if (!table) {
        console.warn("[table-build] #teamTable not found");
        return;
      }
      let tbody = table.querySelector("tbody");
      if (!tbody) {
        tbody = document.createElement("tbody");
        table.appendChild(tbody);
      }
  
      const tr = document.createElement("tr");
      tr.dataset.teamId = String(teamCount); // reliable teamId source
  
      // --- Team name + LIKE bonus checkbox (left sticky col) ---
      const tdTeam = document.createElement("td");
      tdTeam.className = "sticky-col";
  
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.id = `teamName${teamCount}`;
      nameInput.className = "teamName";
      nameInput.placeholder = `Team ${teamCount}`;
  
      // Wrapper for checkbox + icon + LIKE label
      const bonusCheckboxWrapper = document.createElement("label");
      bonusCheckboxWrapper.className = "teamCheckboxWrapper";
  
      const bonusCheckbox = document.createElement("input");
      bonusCheckbox.type = "checkbox";
      bonusCheckbox.id = `checkbox${teamCount}`;
      bonusCheckbox.className = "teamCheckbox";
  
      // Icon span (favicon background handled in CSS)
      const bonusIcon = document.createElement("span");
      bonusIcon.className = "teamCheckboxIcon";
      bonusIcon.setAttribute("aria-hidden", "true");
  
      // "LIKE" label under the icon
      const bonusLike = document.createElement("span");
      bonusLike.className = "teamCheckboxLike";
      bonusLike.textContent = "LIKE";
  
      // Screen-reader only text
      const bonusCheckboxText = document.createElement("span");
      bonusCheckboxText.className = "sr-only";
      bonusCheckboxText.textContent = "Apply five point bonus";
  
      bonusCheckboxWrapper.append(
        bonusCheckbox,
        bonusIcon,
        bonusLike,
        bonusCheckboxText
      );
  
      tdTeam.append(nameInput, bonusCheckboxWrapper);
      tr.appendChild(tdTeam);
  
      // --- Round 1 (Q1-Q5): only 0 or 1 ---
      for (let j = 1; j <= 5; j++) {
        const td = document.createElement("td");
        const inp = document.createElement("input");
        inp.type = "number";
        inp.id = `num${teamCount}${j}`;
        inp.min = "0";
        inp.max = "1";
        inp.step = "1";
        inp.className = "round1-input";
        td.appendChild(inp);
        tr.appendChild(td);
      }
  
      // R1 Total
      {
        const td = document.createElement("td");
        td.className = "round1-total";
        const span = document.createElement("span");
        span.id = `r1Total${teamCount}`;
        span.style.fontSize = "18px";
        span.style.color = "#80d4ff";
        span.style.textShadow = "0px 0px 6px rgba(128, 212, 255, 0.5)";
        span.style.fontWeight = "bold";
        span.textContent = "0";
        td.appendChild(span);
        tr.appendChild(td);
      }
  
      // --- Round 2 (Q6-Q10): only 0 or 2 ---
      for (let j = 6; j <= 10; j++) {
        const td = document.createElement("td");
        const inp = document.createElement("input");
        inp.type = "number";
        inp.id = `num${teamCount}${j}`;
        inp.min = "0";
        inp.max = "2";
        inp.step = "2";
        inp.className = "round2-input";
        td.appendChild(inp);
        tr.appendChild(td);
      }
  
      // R2 Total
      {
        const td = document.createElement("td");
        const span = document.createElement("span");
        span.id = `r2Total${teamCount}`;
        span.style.fontSize = "18px";
        span.style.color = "#80d4ff";
        span.style.textShadow = "0px 0px 6px rgba(128, 212, 255, 0.5)";
        span.style.fontWeight = "bold";
        span.textContent = "0";
        td.appendChild(span);
        tr.appendChild(td);
      }
  
      // Half Time (free integer >= 0)
      {
        const td = document.createElement("td");
        const inp = document.createElement("input");
        inp.type = "number";
        inp.id = `halfTime${teamCount}`;
        inp.min = "0";
        inp.className = "halftime-input";
        td.appendChild(inp);
        tr.appendChild(td);
      }
  
      // First Half Total
      {
        const td = document.createElement("td");
        const span = document.createElement("span");
        span.id = `firstHalfTotal${teamCount}`;
        span.className = "first-half-total";
        span.textContent = "0";
        td.appendChild(span);
        tr.appendChild(td);
      }
  
      // --- Round 3 (Q11-Q15): only 0 or 3 ---
      for (let j = 11; j <= 15; j++) {
        const td = document.createElement("td");
        const inp = document.createElement("input");
        inp.type = "number";
        inp.id = `num${teamCount}${j}`;
        inp.min = "0";
        inp.max = "3";
        inp.step = "3";
        inp.className = "round3-input";
        td.appendChild(inp);
        tr.appendChild(td);
      }
  
      // R3 Total
      {
        const td = document.createElement("td");
        const span = document.createElement("span");
        span.id = `r3Total${teamCount}`;
        span.style.fontSize = "18px";
        span.style.color = "#80d4ff";
        span.style.textShadow = "0px 0px 6px rgba(128, 212, 255, 0.5)";
        span.style.fontWeight = "bold";
        span.textContent = "0";
        td.appendChild(span);
        tr.appendChild(td);
      }
  
      // --- Round 4 (Q16-Q20): only 0 or 4 ---
      for (let j = 16; j <= 20; j++) {
        const td = document.createElement("td");
        const inp = document.createElement("input");
        inp.type = "number";
        inp.id = `num${teamCount}${j}`;
        inp.min = "0";
        inp.max = "4";
        inp.step = "4";
        inp.className = "round4-input";
        td.appendChild(inp);
        tr.appendChild(td);
      }
  
      // R4 Total
      {
        const td = document.createElement("td");
        const span = document.createElement("span");
        span.id = `r4Total${teamCount}`;
        span.style.fontSize = "18px";
        span.style.color = "#80d4ff";
        span.style.textShadow = "0px 0px 6px rgba(128, 212, 255, 0.5)";
        span.style.fontWeight = "bold";
        span.textContent = "0";
        td.appendChild(span);
        tr.appendChild(td);
      }
  
      // Final Question (allow negative)
      {
        const td = document.createElement("td");
        const inp = document.createElement("input");
        inp.type = "number";
        inp.id = `finalQuestion${teamCount}`;
        // IMPORTANT: allow negatives (do NOT set min="0")
        inp.className = "finalquestion-input";
        td.appendChild(inp);
        tr.appendChild(td);
      }
  
      // Second Half Total
      {
        const td = document.createElement("td");
        const span = document.createElement("span");
        span.id = `secondHalfTotal${teamCount}`;
        span.className = "second-half-total";
        span.textContent = "0";
        td.appendChild(span);
        tr.appendChild(td);
      }
  
      // BONUS column (numeric, right side just left of Final Score)
      {
        const td = document.createElement("td");
        td.className = "bonus-col-right";
        const inp = document.createElement("input");
        inp.type = "number";
        inp.min = "0";
        inp.step = "1";
        inp.className = "bonus-input";
        inp.value = "0";
        td.appendChild(inp);
        tr.appendChild(td);
        bindBonusInput(inp);
      }
  
      // Final Score (right sticky col)
      {
        const td = document.createElement("td");
        td.className = "sticky-col-right";
        const span = document.createElement("span");
        span.id = `finalScore${teamCount}`;
        span.textContent = "0";
        td.appendChild(span);
        tr.appendChild(td);
      }
  
      tbody.appendChild(tr);
  
      // Let scoring module bind listeners if it wants to
      try {
        window.dispatchEvent(
          new CustomEvent("scoresheet:team-added", { detail: { teamId: teamCount } })
        );
      } catch (_) {}
  
      // Re-sync sticky widths after layout changes
      updateStickyRightWidths();
  
      return teamCount;
    }
  
    // Export
    window.addTeam = addTeam;
  })();