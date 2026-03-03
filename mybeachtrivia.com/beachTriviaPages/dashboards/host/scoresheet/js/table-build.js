/* table-build.js
   Builds team rows EXACTLY like legacy app.js addTeam(), so existing CSS matches.
   Exposes window.addTeam().

   Notes:
   - Uses ScoresheetState.incrementTeamCount() if present (keeps split-state in sync)
   - Falls back to legacy window.teamCount
   - Calls bindBonusInput() and updateStickyRightWidths() if present
   - Dispatches "scoresheet:team-added" after row append
   - Adds subtle "X" delete button left of the team name input
     - confirm prompt
     - removes row + marks modified
     - dispatches "scoresheet:team-removed"
   - AFTER DELETE, renumbers remaining rows so Team IDs are contiguous (1..N)
     ✅ FIXED: Renumber is now 2-pass with TEMP ids to prevent duplicate IDs.

   FEUD MODE:
   - When #eventType === "feud", turn OFF the per-round discrete constraints:
     Q1–Q20 become free-entry (min=0, step=1, no max).
   - Switches LIVE without reload, updating existing rows too.
*/
(function () {
  "use strict";

  const $ =
    (window.DomUtils && window.DomUtils.$) ||
    window.$ ||
    ((sel, root = document) => root.querySelector(sel));

  const $all =
    (window.DomUtils && window.DomUtils.$all) ||
    ((sel, root = document) => Array.from(root.querySelectorAll(sel)));

  const bindBonusInput = window.bindBonusInput || function () {};
  const updateStickyRightWidths = window.updateStickyRightWidths || function () {};

  function markModified() {
    if (window.ScoresheetState?.markAsModified) window.ScoresheetState.markAsModified();
    if (typeof window.dataModified === "boolean") window.dataModified = true;
  }

  function setTeamCountTo(n) {
    const val = Number.isFinite(n) ? n : 0;
    if (window.ScoresheetState?.setTeamCount) window.ScoresheetState.setTeamCount(val);
    window.teamCount = val;
  }

  function nextTeamId() {
    if (window.ScoresheetState?.incrementTeamCount) {
      return window.ScoresheetState.incrementTeamCount();
    }
    const n = typeof window.teamCount === "number" ? window.teamCount : 0;
    window.teamCount = n + 1;
    return window.teamCount;
  }

  function ensureTbody(table) {
    let tbody = table.querySelector("tbody");
    if (!tbody) {
      tbody = document.createElement("tbody");
      table.appendChild(tbody);
    }
    return tbody;
  }

  function getEventType() {
    return (document.getElementById("eventType")?.value || "").trim();
  }

  function isFeudMode() {
    return getEventType() === "feud";
  }

  function setAttrs(inp, attrs) {
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === null || v === undefined || v === "") inp.removeAttribute(k);
      else inp.setAttribute(k, String(v));
    });
  }

  function applyQuestionConstraintsToRow(tr) {
    if (!tr) return;

    const feud = isFeudMode();
    const tid = tr.dataset.teamId;

    for (let q = 1; q <= 20; q++) {
      const inp = tr.querySelector(`input#num${tid}${q}`) || document.getElementById(`num${tid}${q}`);
      if (!inp) continue;

      if (feud) {
        setAttrs(inp, { min: "0", step: "1", max: null });
      } else {
        if (q >= 1 && q <= 5) setAttrs(inp, { min: "0", max: "1", step: "1" });
        else if (q <= 10) setAttrs(inp, { min: "0", max: "2", step: "2" });
        else if (q <= 15) setAttrs(inp, { min: "0", max: "3", step: "3" });
        else setAttrs(inp, { min: "0", max: "4", step: "4" });
      }
    }
  }

  function applyQuestionConstraintsToAllRows() {
    const rows = $all("#teamTable tbody tr[data-team-id]");
    rows.forEach(applyQuestionConstraintsToRow);

    if (typeof window.recalcRowTotals === "function") {
      rows.forEach((r) => {
        const tid = parseInt(r.dataset.teamId || "0", 10);
        if (tid) {
          try {
            window.recalcRowTotals(tid);
          } catch {}
        }
      });
    }
  }

  function bindEventTypeWatcherOnce() {
    if (window.__scoresheetEventTypeWatcherBound) return;
    window.__scoresheetEventTypeWatcherBound = true;

    const eventTypeEl = document.getElementById("eventType");
    if (!eventTypeEl) return;

    eventTypeEl.addEventListener("change", () => {
      applyQuestionConstraintsToAllRows();
    });

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", applyQuestionConstraintsToAllRows, { once: true });
    } else {
      applyQuestionConstraintsToAllRows();
    }
  }

  function renameIdIfExists(root, fromId, toId) {
    if (!fromId || !toId) return;
    const el = root.querySelector(`#${CSS.escape(fromId)}`) || document.getElementById(fromId);
    if (el) el.id = toId;
  }

  function renumberAllTeams() {
    const tbody = $("#teamTable tbody");
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll("tr[data-team-id]"));
    const totalTeams = rows.length;

    const map = rows.map((tr, idx) => ({
      tr,
      oldId: String(tr.dataset.teamId || ""),
      newId: String(idx + 1),
    }));

    for (const item of map) {
      const { tr, oldId } = item;
      if (!oldId) continue;

      renameIdIfExists(tr, `teamName${oldId}`, `__tmp_teamName_${oldId}`);
      renameIdIfExists(tr, `checkbox${oldId}`, `__tmp_checkbox_${oldId}`);

      renameIdIfExists(tr, `teamNumBtn${oldId}`, `__tmp_teamNumBtn_${oldId}`);
      renameIdIfExists(tr, `teamNumLabel${oldId}`, `__tmp_teamNumLabel_${oldId}`);

      for (let q = 1; q <= 20; q++) {
        renameIdIfExists(tr, `num${oldId}${q}`, `__tmp_num_${oldId}_${q}`);
      }

      renameIdIfExists(tr, `r1Total${oldId}`, `__tmp_r1_${oldId}`);
      renameIdIfExists(tr, `r2Total${oldId}`, `__tmp_r2_${oldId}`);
      renameIdIfExists(tr, `r3Total${oldId}`, `__tmp_r3_${oldId}`);
      renameIdIfExists(tr, `r4Total${oldId}`, `__tmp_r4_${oldId}`);

      renameIdIfExists(tr, `halfTime${oldId}`, `__tmp_half_${oldId}`);
      renameIdIfExists(tr, `finalQuestion${oldId}`, `__tmp_finalQ_${oldId}`);
      renameIdIfExists(tr, `firstHalfTotal${oldId}`, `__tmp_fht_${oldId}`);
      renameIdIfExists(tr, `secondHalfTotal${oldId}`, `__tmp_sht_${oldId}`);
      renameIdIfExists(tr, `finalScore${oldId}`, `__tmp_finalScore_${oldId}`);
    }

    for (const item of map) {
      const { tr, oldId, newId } = item;
      if (!oldId) continue;

      tr.dataset.teamId = newId;

      const tdTeam = tr.querySelector("td.sticky-col");
      if (tdTeam) {
        const delBtn = tdTeam.querySelector("button.btnDeleteTeam");
        if (delBtn) delBtn.setAttribute("aria-label", `Delete team row ${newId}`);
      }

      renameIdIfExists(tr, `__tmp_teamName_${oldId}`, `teamName${newId}`);
      renameIdIfExists(tr, `__tmp_checkbox_${oldId}`, `checkbox${newId}`);

      renameIdIfExists(tr, `__tmp_teamNumBtn_${oldId}`, `teamNumBtn${newId}`);
      renameIdIfExists(tr, `__tmp_teamNumLabel_${oldId}`, `teamNumLabel${newId}`);

      const nameInput = tr.querySelector(`#${CSS.escape(`teamName${newId}`)}`);
      if (nameInput) nameInput.placeholder = `Team ${newId}`;

      for (let q = 1; q <= 20; q++) {
        renameIdIfExists(tr, `__tmp_num_${oldId}_${q}`, `num${newId}${q}`);
      }

      renameIdIfExists(tr, `__tmp_r1_${oldId}`, `r1Total${newId}`);
      renameIdIfExists(tr, `__tmp_r2_${oldId}`, `r2Total${newId}`);
      renameIdIfExists(tr, `__tmp_r3_${oldId}`, `r3Total${newId}`);
      renameIdIfExists(tr, `__tmp_r4_${oldId}`, `r4Total${newId}`);

      renameIdIfExists(tr, `__tmp_half_${oldId}`, `halfTime${newId}`);
      renameIdIfExists(tr, `__tmp_finalQ_${oldId}`, `finalQuestion${newId}`);
      renameIdIfExists(tr, `__tmp_fht_${oldId}`, `firstHalfTotal${newId}`);
      renameIdIfExists(tr, `__tmp_sht_${oldId}`, `secondHalfTotal${newId}`);
      renameIdIfExists(tr, `__tmp_finalScore_${oldId}`, `finalScore${newId}`);
    }

    setTeamCountTo(totalTeams);

    applyQuestionConstraintsToAllRows();

    if (typeof window.recalcAllTotals === "function") {
      try {
        window.recalcAllTotals();
      } catch {}
    } else {
      const rows2 = $all("#teamTable tbody tr[data-team-id]");
      for (const r of rows2) {
        const tid = parseInt(r.dataset.teamId || "0", 10);
        if (!tid) continue;
        if (typeof window.updateScores === "function") {
          try {
            window.updateScores(tid);
          } catch {}
        } else if (typeof window.recalcRowTotals === "function") {
          try {
            window.recalcRowTotals(tid);
          } catch {}
        } else if (typeof window.updateFinalScore === "function") {
          try {
            window.updateFinalScore(tid);
          } catch {}
        }
      }
    }

    try {
      window.dispatchEvent(new CustomEvent("scoresheet:teams-renumbered", { detail: { count: totalTeams } }));
    } catch (_) {}

    updateStickyRightWidths();
  }

  function removeTeamRow(tr) {
    if (!tr) return;

    const teamId = tr.dataset.teamId;

    const ok = window.confirm("Delete this team row? Data for this row will be lost.");
    if (!ok) return;

    try {
      if (typeof window.clearHighlights === "function") window.clearHighlights();
    } catch {}

    try {
      tr.remove();
    } catch {
      tr.parentNode?.removeChild(tr);
    }

    markModified();

    try {
      window.dispatchEvent(new CustomEvent("scoresheet:team-removed", { detail: { teamId } }));
    } catch (_) {}

    renumberAllTeams();
  }

  function openTeamNumberModalForRow(tr) {
    if (!tr) return;

    const modal = document.getElementById("teamNumberModal");
    const input = document.getElementById("teamNumberInput");
    const title = document.getElementById("teamNumberTitle");
    const btnSave = document.getElementById("btnSaveTeamNumber");
    const btnCancel = document.getElementById("btnCancelTeamNumber");
    const btnClose = document.getElementById("btnCloseTeamNumber");

    if (!modal || !input || !btnSave || !btnCancel || !btnClose) return;

    const teamId = String(tr.dataset.teamId || "");
    modal.dataset.teamId = teamId;

    const existing = String(tr.dataset.teamNumber || "").trim();
    input.value = existing;
    if (title) {
      title.textContent = `TEAM #`;
    }
    const subtitle = document.getElementById("teamNumberSubtitle");
    if (subtitle) {
      const nameInput = tr.querySelector("input.teamName") || tr.querySelector(`input[id^="teamName"]`);
      subtitle.textContent = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : `Team ${teamId}`;
    }

    function closeModal() {
      modal.style.display = "none";
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", onKeyDown, true);
    }

    function save() {
      const vRaw = String(input.value || "").trim();
      const v = vRaw === "" ? "" : String(parseInt(vRaw, 10));
      if (vRaw !== "" && (!v || !Number.isFinite(+v) || +v < 0)) {
        alert("Enter a valid team number (0 or higher), or leave blank.");
        return;
      }

      if (v === "") {
        delete tr.dataset.teamNumber;
      } else {
        tr.dataset.teamNumber = v;
      }

      markModified();

      try {
        window.dispatchEvent(
          new CustomEvent("scoresheet:team-number-changed", { detail: { teamId, teamNumber: v || "" } })
        );
      } catch (_) {}

      closeModal();
    }

    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
      }
      if (e.key === "Enter") {
        e.preventDefault();
        save();
      }
    }

    btnSave.onclick = save;
    btnCancel.onclick = closeModal;
    btnClose.onclick = closeModal;

    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };

    modal.style.display = "block";
    document.body.classList.add("modal-open");

    window.addEventListener("keydown", onKeyDown, true);

    setTimeout(() => {
      try {
        input.focus();
        input.select();
      } catch {}
    }, 0);
  }

  function addTeam() {
    bindEventTypeWatcherOnce();

    const table = $("#teamTable");
    if (!table) {
      console.warn("[table-build] #teamTable not found");
      return;
    }

    const teamId = nextTeamId();
    markModified();

    const tbody = ensureTbody(table);

    const tr = document.createElement("tr");
    tr.dataset.teamId = String(teamId);

    const tdTeam = document.createElement("td");
    tdTeam.className = "sticky-col";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btnDeleteTeam";
    deleteBtn.setAttribute("aria-label", `Delete team row ${teamId}`);
    deleteBtn.title = "Delete team";
    deleteBtn.textContent = "×";
    deleteBtn.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
        removeTeamRow(tr);
      },
      true
    );

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.id = `teamName${teamId}`;
    nameInput.className = "teamName";
    nameInput.placeholder = `Team ${teamId}`;

    const bonusCheckboxWrapper = document.createElement("label");
    bonusCheckboxWrapper.className = "teamCheckboxWrapper";

    const bonusCheckbox = document.createElement("input");
    bonusCheckbox.type = "checkbox";
    bonusCheckbox.id = `checkbox${teamId}`;
    bonusCheckbox.className = "teamCheckbox";

    const bonusIcon = document.createElement("span");
    bonusIcon.className = "teamCheckboxIcon";
    bonusIcon.setAttribute("aria-hidden", "true");

    const bonusLike = document.createElement("span");
    bonusLike.className = "teamCheckboxLike";
    bonusLike.textContent = "LIKE";

    const bonusCheckboxText = document.createElement("span");
    bonusCheckboxText.className = "sr-only";
    bonusCheckboxText.textContent = "Apply five point bonus";

    bonusCheckboxWrapper.append(bonusCheckbox, bonusIcon, bonusLike, bonusCheckboxText);

    const teamNumWrapper = document.createElement("div");
    teamNumWrapper.className = "teamNumWrapper";

    const teamNumBtn = document.createElement("button");
    teamNumBtn.type = "button";
    teamNumBtn.id = `teamNumBtn${teamId}`;
    teamNumBtn.className = "teamNumBtn";
    teamNumBtn.setAttribute("aria-label", `Set team number for Team ${teamId}`);
    teamNumBtn.title = "Team Number";
    teamNumBtn.textContent = "#";
    teamNumBtn.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
        openTeamNumberModalForRow(tr);
      },
      true
    );

    const teamNumLabel = document.createElement("span");
    teamNumLabel.id = `teamNumLabel${teamId}`;
    teamNumLabel.className = "teamNumLabel";
    teamNumLabel.textContent = "TEAM";

    teamNumWrapper.append(teamNumBtn, teamNumLabel);

    tdTeam.append(deleteBtn, nameInput, bonusCheckboxWrapper, teamNumWrapper);
    tr.appendChild(tdTeam);

    for (let j = 1; j <= 20; j++) {
      const td = document.createElement("td");
      const inp = document.createElement("input");
      inp.type = "number";
      inp.id = `num${teamId}${j}`;

      if (j <= 5) inp.className = "round1-input";
      else if (j <= 10) inp.className = "round2-input";
      else if (j <= 15) inp.className = "round3-input";
      else inp.className = "round4-input";

      td.appendChild(inp);
      tr.appendChild(td);

      if (j === 5) {
        const tdTotal = document.createElement("td");
        tdTotal.className = "round1-total";
        const span = document.createElement("span");
        span.id = `r1Total${teamId}`;
        span.style.fontSize = "18px";
        span.style.color = "#80d4ff";
        span.style.textShadow = "0px 0px 6px rgba(128, 212, 255, 0.5)";
        span.style.fontWeight = "bold";
        span.textContent = "0";
        tdTotal.appendChild(span);
        tr.appendChild(tdTotal);
      }

      if (j === 10) {
        const tdTotal = document.createElement("td");
        const span = document.createElement("span");
        span.id = `r2Total${teamId}`;
        span.style.fontSize = "18px";
        span.style.color = "#80d4ff";
        span.style.textShadow = "0px 0px 6px rgba(128, 212, 255, 0.5)";
        span.style.fontWeight = "bold";
        span.textContent = "0";
        tdTotal.appendChild(span);
        tr.appendChild(tdTotal);

        const tdHT = document.createElement("td");
        const ht = document.createElement("input");
        ht.type = "number";
        ht.id = `halfTime${teamId}`;
        ht.min = "0";
        ht.className = "halftime-input";
        tdHT.appendChild(ht);
        tr.appendChild(tdHT);

        const tdFHT = document.createElement("td");
        const fhtSpan = document.createElement("span");
        fhtSpan.id = `firstHalfTotal${teamId}`;
        fhtSpan.className = "first-half-total";
        fhtSpan.textContent = "0";
        tdFHT.appendChild(fhtSpan);
        tr.appendChild(tdFHT);
      }

      if (j === 15) {
        const tdTotal = document.createElement("td");
        const span = document.createElement("span");
        span.id = `r3Total${teamId}`;
        span.style.fontSize = "18px";
        span.style.color = "#80d4ff";
        span.style.textShadow = "0px 0px 6px rgba(128, 212, 255, 0.5)";
        span.style.fontWeight = "bold";
        span.textContent = "0";
        tdTotal.appendChild(span);
        tr.appendChild(tdTotal);
      }

      if (j === 20) {
        const tdTotal = document.createElement("td");
        const span = document.createElement("span");
        span.id = `r4Total${teamId}`;
        span.style.fontSize = "18px";
        span.style.color = "#80d4ff";
        span.style.textShadow = "0px 0px 6px rgba(128, 212, 255, 0.5)";
        span.style.fontWeight = "bold";
        span.textContent = "0";
        tdTotal.appendChild(span);
        tr.appendChild(tdTotal);

        const tdFQ = document.createElement("td");
        const fq = document.createElement("input");
        fq.type = "number";
        fq.id = `finalQuestion${teamId}`;
        fq.className = "finalquestion-input";
        tdFQ.appendChild(fq);
        tr.appendChild(tdFQ);

        const tdSHT = document.createElement("td");
        const shtSpan = document.createElement("span");
        shtSpan.id = `secondHalfTotal${teamId}`;
        shtSpan.className = "second-half-total";
        shtSpan.textContent = "0";
        tdSHT.appendChild(shtSpan);
        tr.appendChild(tdSHT);

        const tdBonus = document.createElement("td");
        tdBonus.className = "bonus-col-right";
        const b = document.createElement("input");
        b.type = "number";
        b.min = "0";
        b.step = "1";
        b.className = "bonus-input";
        b.value = "0";
        tdBonus.appendChild(b);
        tr.appendChild(tdBonus);
        bindBonusInput(b);

        const tdFS = document.createElement("td");
        tdFS.className = "sticky-col-right";
        const fsSpan = document.createElement("span");
        fsSpan.id = `finalScore${teamId}`;
        fsSpan.textContent = "0";
        tdFS.appendChild(fsSpan);
        tr.appendChild(tdFS);
      }
    }

    tbody.appendChild(tr);

    applyQuestionConstraintsToRow(tr);

    try {
      window.dispatchEvent(new CustomEvent("scoresheet:team-added", { detail: { teamId } }));
    } catch (_) {}

    updateStickyRightWidths();

    return teamId;
  }

  window.addTeam = addTeam;

  bindEventTypeWatcherOnce();
})();